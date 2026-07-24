import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectBlockedSpeechBrowser,
  getSpeechDictationEngine,
  getSpeechDictationSupport,
  isSpeechDictationSupported,
  resolveSpeechDictationUnsupportedMessage,
  resolveSpeechRecognitionError,
} from "../../../admin/features/Agent/lib/speech/dictationSupport";
import { useSpeechDictation } from "../../../admin/features/Agent/client/composables/useSpeechDictation";

function mockSecureContext(secure = true): void {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: secure,
  });
}

function mockGetUserMedia(): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  });
}

const W = window as unknown as Record<string, unknown>;

describe("dictation support", () => {
  beforeEach(() => {
    mockSecureContext(true);
  });

  afterEach(() => {
    delete W.SpeechRecognition;
    delete W.webkitSpeechRecognition;
    mockSecureContext(true);
  });

  it("detects chromium engine when SpeechRecognition exists", () => {
    class MockSpeechRecognition extends EventTarget {}

    window.SpeechRecognition = MockSpeechRecognition as never;
    delete W.webkitSpeechRecognition;

    expect(getSpeechDictationEngine()).toBe("chromium");
    expect(getSpeechDictationSupport()).toEqual({
      supported: true,
      engine: "chromium",
    });
  });

  it("detects webkit engine when only webkitSpeechRecognition exists", () => {
    class MockSpeechRecognition extends EventTarget {}

    delete W.SpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition as never;

    expect(getSpeechDictationEngine()).toBe("webkit");
    expect(getSpeechDictationSupport()).toEqual({
      supported: true,
      engine: "webkit",
    });
  });

  it("reports unsupported when neither constructor exists", () => {
    delete W.SpeechRecognition;
    delete W.webkitSpeechRecognition;

    expect(isSpeechDictationSupported()).toBe(false);
    expect(getSpeechDictationSupport()).toEqual({
      supported: false,
      reason: "unsupported_browser",
    });
    expect(
      resolveSpeechDictationUnsupportedMessage("unsupported_browser"),
    ).toContain("Firefox");
  });

  it("blocks browsers with unreliable speech recognition", () => {
    class MockSpeechRecognition extends EventTarget {}

    window.SpeechRecognition = MockSpeechRecognition as never;

    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    });

    expect(detectBlockedSpeechBrowser()).toBe("Microsoft Edge");
    expect(getSpeechDictationSupport()).toEqual({
      supported: false,
      reason: "blocked_browser",
      blockedBrowser: "Microsoft Edge",
    });
    expect(
      resolveSpeechDictationUnsupportedMessage(
        "blocked_browser",
        "Microsoft Edge",
      ),
    ).toContain("Google Chrome");

    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
  });

  it("reports insecure context as unsupported", () => {
    class MockSpeechRecognition extends EventTarget {}

    window.SpeechRecognition = MockSpeechRecognition as never;
    mockSecureContext(false);

    expect(getSpeechDictationSupport()).toEqual({
      supported: false,
      reason: "insecure_context",
    });
    expect(
      resolveSpeechDictationUnsupportedMessage("insecure_context"),
    ).toContain("HTTPS");
  });
});

function createMockEvent(data: Record<string, unknown>): Event {
  const event = new Event("custom");
  Object.assign(event, data);
  return event;
}

describe("speech dictation", () => {
  beforeEach(() => {
    mockSecureContext(true);
  });

  afterEach(() => {
    delete W.SpeechRecognition;
    delete W.webkitSpeechRecognition;
    mockSecureContext(true);
  });

  it("ignores recoverable errors until network retries are exhausted", () => {
    expect(resolveSpeechRecognitionError("no-speech")).toBeNull();
    expect(resolveSpeechRecognitionError("aborted")).toBeNull();
    expect(resolveSpeechRecognitionError("network")).toBeNull();
    expect(
      resolveSpeechRecognitionError("network", {
        networkRetriesExhausted: true,
      }),
    ).toContain("Speech recognition couldn't connect");
  });

  it("starts recognition and forwards final transcripts", async () => {
    mockGetUserMedia();

    class MockSpeechRecognition extends EventTarget {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: (() => void) | null = null;

      start = vi.fn(() => {
        this.onresult?.({
          resultIndex: 0,
          results: [
            {
              isFinal: true,
              length: 1,
              0: { transcript: "hello there" },
            },
          ],
        } as unknown as Event);
      });

      stop = vi.fn();
      abort = vi.fn();
    }

    window.SpeechRecognition = MockSpeechRecognition as never;
    delete W.webkitSpeechRecognition;

    const onTranscript = vi.fn();
    const dictation = useSpeechDictation({ onTranscript });

    expect(dictation.isSupported).toBe(true);
    await dictation.startListening();
    expect(dictation.isListening.value).toBe(true);
    expect(onTranscript).toHaveBeenCalledWith("hello there", true);

    dictation.stopListening();
  });

  it("uses non-continuous recognition on webkit engines", async () => {
    mockGetUserMedia();

    let lastInstance: any = null;

    class MockSpeechRecognition extends EventTarget {
      continuous = true;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: (() => void) | null = null;

      constructor() {
        super();
        lastInstance = this;
      }

      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
    }

    delete W.SpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition as never;

    const dictation = useSpeechDictation({ onTranscript: vi.fn() });
    await dictation.startListening();

    expect(dictation.isSupported).toBe(true);
    expect(lastInstance?.continuous).toBe(false);
    expect(lastInstance?.interimResults).toBe(true);

    dictation.stopListening();
  });

  it("surfaces permission errors from getUserMedia on Safari", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        }),
      },
    });

    class MockSpeechRecognition extends EventTarget {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
    }

    delete W.SpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition as never;

    const onError = vi.fn();
    const dictation = useSpeechDictation({ onTranscript: vi.fn(), onError });

    await dictation.startListening();
    expect(onError).toHaveBeenCalledWith("Microphone permission was denied.");
    expect(dictation.isListening.value).toBe(false);
  });

  it("surfaces recognition permission errors", async () => {
    mockGetUserMedia();

    class MockSpeechRecognition extends EventTarget {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: (() => void) | null = null;

      start = vi.fn(() => {
        this.onerror?.(
          createMockEvent({
            error: "not-allowed",
            message: "Permission denied",
          }),
        );
      });

      stop = vi.fn();
      abort = vi.fn();
    }

    window.SpeechRecognition = MockSpeechRecognition as never;

    const onError = vi.fn();
    const dictation = useSpeechDictation({ onTranscript: vi.fn(), onError });

    await dictation.startListening();
    expect(onError).toHaveBeenCalledWith("Microphone permission was denied.");
    expect(dictation.isListening.value).toBe(false);
  });

  it("retries transient network errors before surfacing a toast", async () => {
    vi.useFakeTimers();
    mockGetUserMedia();

    let attempts = 0;

    class MockSpeechRecognition extends EventTarget {
      continuous = false;
      interimResults = false;
      lang = "en-US";
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn(function start(this: MockSpeechRecognition) {
        attempts += 1;
        if (attempts === 1) {
          this.onerror?.(createMockEvent({ error: "network" }));
          this.onend?.();
          return;
        }

        this.onresult?.(
          createMockEvent({
            resultIndex: 0,
            results: [
              {
                isFinal: true,
                length: 1,
                0: { transcript: "after retry" },
              },
            ],
          }),
        );
      });
      stop = vi.fn();
      abort = vi.fn();
    }

    window.SpeechRecognition = MockSpeechRecognition as never;

    const onError = vi.fn();
    const onTranscript = vi.fn();
    const dictation = useSpeechDictation({ onTranscript, onError });

    await dictation.startListening();
    expect(onError).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(onError).not.toHaveBeenCalled();
    expect(onTranscript).toHaveBeenCalledWith("after retry", true);
    expect(dictation.isListening.value).toBe(true);

    dictation.stopListening();
    vi.useRealTimers();
  });
});
