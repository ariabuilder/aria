import { computed, ref } from "vue";
import {
  getSpeechDictationSupport,
  getSpeechRecognitionConstructor,
  resolveSpeechDictationUnsupportedMessage,
  resolveSpeechRecognitionError,
  SPEECH_NETWORK_MAX_RETRIES,
  usesWebkitSpeechEngine,
} from "../../lib/speech/dictationSupport";

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export {
  getSpeechDictationSupport,
  isSpeechDictationSupported,
  resolveSpeechDictationUnsupportedMessage,
  resolveSpeechRecognitionError,
} from "../../lib/speech/dictationSupport";

async function ensureMicrophonePermission(): Promise<void> {
  if (!usesWebkitSpeechEngine()) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

function configureRecognition(recognition: SpeechRecognitionInstance): void {
  const isWebkit = usesWebkitSpeechEngine();
  recognition.continuous = !isWebkit;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
}

export function useSpeechDictation(input: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
}) {
  const support = getSpeechDictationSupport();
  const isListening = ref(false);
  const isSupported = support.supported;
  const unsupportedReason = computed(() =>
    support.reason
      ? resolveSpeechDictationUnsupportedMessage(
          support.reason,
          support.blockedBrowser,
        )
      : null,
  );
  let recognition: SpeechRecognitionInstance | null = null;
  let shouldRestart = false;
  let networkRetryCount = 0;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRestartTimer(): void {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function cleanupRecognition(): void {
    clearRestartTimer();

    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
    recognition = null;
  }

  function stopListening(): void {
    shouldRestart = false;
    networkRetryCount = 0;
    isListening.value = false;
    clearRestartTimer();
    recognition?.stop();
    cleanupRecognition();
  }

  function scheduleRestart(): void {
    if (!shouldRestart || !recognition) {
      return;
    }

    clearRestartTimer();
    const delay = networkRetryCount > 0 ? Math.min(300 * networkRetryCount, 1200) : 0;

    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!shouldRestart || !recognition) {
        return;
      }

      try {
        recognition.start();
      } catch {
        shouldRestart = false;
        isListening.value = false;
        cleanupRecognition();
      }
    }, delay);
  }

  async function startListening(): Promise<void> {
    if (!isSupported) {
      input.onError?.(
        support.reason
          ? resolveSpeechDictationUnsupportedMessage(
              support.reason,
              support.blockedBrowser,
            )
          : "Voice input is not supported in this browser.",
      );
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      input.onError?.("Voice input is not supported in this browser.");
      return;
    }

    cleanupRecognition();
    networkRetryCount = 0;

    try {
      await ensureMicrophonePermission();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        input.onError?.("Microphone permission was denied.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        input.onError?.("No microphone was found.");
      } else {
        input.onError?.("Could not access the microphone.");
      }
      return;
    }

    recognition = new Recognition() as SpeechRecognitionInstance;
    configureRecognition(recognition);

    recognition.onresult = (event) => {
      networkRetryCount = 0;

      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          input.onTranscript(transcript, true);
        } else {
          interimTranscript += `${transcript} `;
        }
      }

      const interim = interimTranscript.trim();
      if (interim) {
        input.onTranscript(interim, false);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "network") {
        networkRetryCount += 1;
        if (networkRetryCount <= SPEECH_NETWORK_MAX_RETRIES && shouldRestart) {
          return;
        }
      }

      const message = resolveSpeechRecognitionError(event.error, {
        networkRetriesExhausted: true,
      });
      if (!message) {
        return;
      }

      input.onError?.(message);
      stopListening();
    };

    recognition.onend = () => {
      if (shouldRestart && recognition) {
        scheduleRestart();
        return;
      }

      isListening.value = false;
      recognition = null;
    };

    try {
      shouldRestart = true;
      recognition.start();
      if (shouldRestart) {
        isListening.value = true;
      }
    } catch {
      shouldRestart = false;
      isListening.value = false;
      input.onError?.("Could not start voice input.");
      cleanupRecognition();
    }
  }

  function toggleListening(): void {
    if (isListening.value) {
      stopListening();
      return;
    }

    void startListening();
  }

  return {
    isSupported,
    unsupportedReason,
    isListening,
    startListening,
    stopListening,
    toggleListening,
  };
}
