import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";

import {
  type LoginShellState,
  type MagicLinkAvailability,
} from "../schemas/loginShell";
import type { PasskeyReadiness } from "../schemas/setupWizard";
import { resolveBrowserPasskeyReadiness } from "../utils/passkeyReadiness";
import { useStudioI18n } from "@/i18n";

const initialLoginShellState = {
  passkeyReadiness: "checking",
  magicLinkAvailability: "coming_soon",
  passwordOptionsOpen: false,
  passkeyMessage: null,
  magicLinkMessage: null,
} satisfies LoginShellState;

export interface UseLoginShellReturn {
  state: Ref<LoginShellState>;
  passkeyVisible: ComputedRef<boolean>;
  passkeyDisabled: ComputedRef<boolean>;
  passkeyStatusMessage: ComputedRef<string | null>;
  passwordVisible: ComputedRef<boolean>;
  passwordOptionsLabel: ComputedRef<string>;
  setPasskeyReadiness: (readiness: PasskeyReadiness) => void;
  setMagicLinkAvailability: (availability: MagicLinkAvailability) => void;
  togglePasswordOptions: () => void;
  showPasswordOptions: () => void;
  handlePasskeyShellClick: () => void;
  handleMagicLinkShellClick: () => void;
}

function passkeyMessageForReadiness(
  readiness: LoginShellState["passkeyReadiness"],
  t: ReturnType<typeof useStudioI18n>["t"],
): string | null {
  switch (readiness) {
    case "checking":
      return t("auth.passkeySupportChecking");
    case "unsupported":
      return t("auth.passkeyUnsupported");
    case "insecure_context":
      return t("auth.passkeyRequiresHttps");
    case "backend_unavailable":
      return t("auth.passkeyDisabled");
    case "error":
      return t("auth.passkeyAlternative");
    case "pending":
    case "ready":
    case "success":
      return null;
  }
}

export function useLoginShell(): UseLoginShellReturn {
  const state = ref<LoginShellState>({ ...initialLoginShellState });
  const { t } = useStudioI18n();

  const passkeyVisible = computed(
    () =>
      !["unsupported", "backend_unavailable"].includes(
        state.value.passkeyReadiness,
      ),
  );

  const passkeyDisabled = computed(
    () => state.value.passkeyReadiness !== "ready",
  );

  const passkeyStatusMessage = computed(
    () =>
      state.value.passkeyMessage ??
      passkeyMessageForReadiness(state.value.passkeyReadiness, t),
  );

  const passwordOptionsLabel = computed(() =>
    state.value.passwordOptionsOpen
      ? t("auth.hidePasswordSignIn")
      : t("auth.showPasswordSignIn"),
  );

  const passwordVisible = computed(
    () => !passkeyVisible.value || state.value.passwordOptionsOpen,
  );

  function setPasskeyReadiness(readiness: PasskeyReadiness): void {
    state.value.passkeyReadiness = readiness;
    if (readiness === "unsupported" || readiness === "backend_unavailable") {
      showPasswordOptions();
    }
  }

  function setMagicLinkAvailability(
    availability: MagicLinkAvailability,
  ): void {
    state.value.magicLinkAvailability = availability;
  }

  function togglePasswordOptions(): void {
    state.value.passwordOptionsOpen = !state.value.passwordOptionsOpen;
  }

  function showPasswordOptions(): void {
    state.value.passwordOptionsOpen = true;
  }

  function handlePasskeyShellClick(): void {
    state.value.passkeyMessage = passkeyMessageForReadiness(
      state.value.passkeyReadiness,
      t,
    );
  }

  function handleMagicLinkShellClick(): void {
    state.value.magicLinkMessage =
      t("auth.magicLinkUnavailable");
  }

  onMounted(() => {
    setPasskeyReadiness(resolveBrowserPasskeyReadiness());
  });

  return {
    state,
    passkeyVisible,
    passkeyDisabled,
    passkeyStatusMessage,
    passwordVisible,
    passwordOptionsLabel,
    setPasskeyReadiness,
    setMagicLinkAvailability,
    togglePasswordOptions,
    showPasswordOptions,
    handlePasskeyShellClick,
    handleMagicLinkShellClick,
  };
}
