import { ref, type Ref } from "vue";
import { z } from "zod";

const CreateComponentNameSchema = z.string().trim().min(1);
const CreateComponentFlowOptionsSchema = z
  .object({
    category: z.string().trim().optional(),
  })
  .strict();

export interface UseCreateComponentDialogReturn {
  isOpen: Ref<boolean>;
  isCreating: Ref<boolean>;
  open: () => void;
  close: () => void;
  submitCreateComponent: (
    name: string,
    options?: { category?: string },
    createComponent?: (options: {
      name: string;
      category?: string;
    }) => Promise<string | null>,
  ) => Promise<string | null>;
}

const isOpen = ref(false);
const isCreating = ref(false);

export function useCreateComponentDialog(): UseCreateComponentDialogReturn {
  function open(): void {
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
  }

  async function submitCreateComponent(
    name: string,
    options?: { category?: string },
    createComponent?: (options: {
      name: string;
      category?: string;
    }) => Promise<string | null>,
  ): Promise<string | null> {
    if (isCreating.value || !createComponent) return null;

    const validatedName = CreateComponentNameSchema.parse(name);
    const validatedOptions = CreateComponentFlowOptionsSchema.parse(options ?? {});

    isCreating.value = true;
    try {
      const componentId = await createComponent({
        name: validatedName,
        ...(validatedOptions.category
          ? { category: validatedOptions.category }
          : {}),
      });
      if (componentId) {
        isOpen.value = false;
      }
      return componentId;
    } finally {
      isCreating.value = false;
    }
  }

  return {
    isOpen,
    isCreating,
    open,
    close,
    submitCreateComponent,
  };
}
