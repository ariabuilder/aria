import { computed } from "vue";

type EyeDropperResult = {
  sRGBHex: string;
};

type EyeDropperConstructor = new () => {
  open: () => Promise<EyeDropperResult>;
};

function getEyeDropperConstructor(): EyeDropperConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const ctor = (window as Window & { EyeDropper?: EyeDropperConstructor })
    .EyeDropper;
  return ctor ?? null;
}

export function useEyeDropper() {
  const isSupported = computed(() => getEyeDropperConstructor() !== null);

  async function open(): Promise<string | null> {
    const EyeDropperClass = getEyeDropperConstructor();
    if (!EyeDropperClass) {
      return null;
    }

    try {
      const eyeDropper = new EyeDropperClass();
      const result = await eyeDropper.open();
      return result.sRGBHex;
    } catch {
      return null;
    }
  }

  return {
    isSupported,
    open,
  };
}
