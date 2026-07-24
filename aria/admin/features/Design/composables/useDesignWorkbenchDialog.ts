import {
  inject,
  readonly,
  ref,
  type InjectionKey,
  type Ref,
} from "vue";

import { useClassEditor } from "@/features/Inspector/composables/useClassEditor";
import { useVariableManagerBootstrap } from "./useVariableManagerBootstrap";

export type DesignWorkbenchView = "classes" | "variables";

export interface DesignWorkbenchOpenOptions {
  highlightClass?: string;
}

export interface DesignWorkbenchDialogReturn {
  isOpen: Ref<boolean>;
  activeView: Ref<DesignWorkbenchView>;
  highlightClassName: Ref<string | null>;
  open: (view?: DesignWorkbenchView, options?: DesignWorkbenchOpenOptions) => void;
  close: () => void;
}

export const DESIGN_WORKBENCH_HIGHLIGHT_KEY: InjectionKey<
  Readonly<Ref<string | null>>
> = Symbol("design-workbench-highlight-class");

const isOpen = ref(false);
const activeView = ref<DesignWorkbenchView>("classes");
const highlightClassName = ref<string | null>(null);

export function useDesignWorkbenchDialog(): DesignWorkbenchDialogReturn {
  const classEditor = useClassEditor();
  const { loadVariableManagerBootstrap } = useVariableManagerBootstrap();

  async function bootstrapData(): Promise<void> {
    await Promise.all([
      classEditor.loadClasses(),
      loadVariableManagerBootstrap(undefined, { silent: true }),
    ]);
  }

  function open(
    view: DesignWorkbenchView = "classes",
    options: DesignWorkbenchOpenOptions = {},
  ): void {
    activeView.value = view;
    highlightClassName.value = options.highlightClass ?? null;
    isOpen.value = true;
    void bootstrapData();
  }

  function close(): void {
    isOpen.value = false;
    highlightClassName.value = null;
  }

  return {
    isOpen: readonly(isOpen),
    activeView,
    highlightClassName,
    open,
    close,
  };
}

export function useDesignWorkbenchHighlightClass(): Readonly<
  Ref<string | null>
> | null {
  return inject(DESIGN_WORKBENCH_HIGHLIGHT_KEY, null);
}
