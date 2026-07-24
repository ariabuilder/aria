import {
  RouteQueryOpenFlagSchema,
  useRouteQueryDialog,
  type RouteQueryDialogReturn,
} from "@/features/Studio/core/composables/useRouteQueryDialog";

const QUERY_KEY = "search" as const;

let controller: RouteQueryDialogReturn<"true"> | null = null;

export interface SearchDialogReturn {
  isOpen: RouteQueryDialogReturn<"true">["isOpen"];
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export function useSearchDialog(): SearchDialogReturn {
  if (!controller) {
    controller = useRouteQueryDialog({
      queryKey: QUERY_KEY,
      valueSchema: RouteQueryOpenFlagSchema,
      defaultOpenValue: "true",
    });
  }

  return {
    isOpen: controller.isOpen,
    open: () => controller?.open("true"),
    close: () => controller?.close(),
    toggle: () => controller?.toggle(),
  };
}
