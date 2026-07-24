import { ref } from "vue";

export interface BulkDeleteResult {
  succeeded: number;
  failed: number;
  errors?: string[];
}

export function useBulkDelete<TItem extends { id: string }>() {
  const isOpen = ref(false);
  const itemsToDelete = ref<TItem[]>([]);
  const isExecuting = ref(false);

  function open(items: TItem[]): void {
    itemsToDelete.value = items as unknown as TItem[];
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
    itemsToDelete.value = [];
  }

  async function execute(
    batchDelete: (items: TItem[]) => Promise<BulkDeleteResult>,
  ): Promise<BulkDeleteResult> {
    if (itemsToDelete.value.length === 0) {
      return { succeeded: 0, failed: 0 };
    }

    isExecuting.value = true;

    try {
      const result = await batchDelete(
        itemsToDelete.value as unknown as TItem[],
      );
      return result;
    } finally {
      isExecuting.value = false;
      isOpen.value = false;
      itemsToDelete.value = [];
    }
  }

  return {
    isOpen,
    itemsToDelete,
    isExecuting,
    open,
    close,
    execute,
  };
}
