import { ref, watch, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { z } from "zod";
import { replaceRouteQuery } from "@/lib/router/replaceRouteQuery";

export const RouteQueryOpenFlagSchema = z.literal("true");

export interface UseRouteQueryDialogConfig<TValue> {
  queryKey: string;
  valueSchema: z.ZodType<TValue>;
  defaultOpenValue: TValue;
}

export interface RouteQueryDialogReturn<TValue> {
  isOpen: Ref<boolean>;
  value: Ref<TValue>;
  open: (nextValue?: TValue) => void;
  close: () => void;
  toggle: () => void;
}

function readQueryString(
  raw: string | string[] | null | undefined,
): string | undefined {
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return raw[0];
  }
  return undefined;
}

/**
 * Shared open/close + URL sync for Studio overlay dialogs (`?search=true`, etc.).
 * Composer is preserved automatically via replaceRouteQuery.
 */
export function useRouteQueryDialog<TValue>(
  config: UseRouteQueryDialogConfig<TValue>,
): RouteQueryDialogReturn<TValue> {
  const route = useRoute();
  const router = useRouter();

  const isOpen = ref(false);
  const value = ref(config.defaultOpenValue) as Ref<TValue>;

  function parseQuery(raw: unknown): TValue | null {
    const stringValue = readQueryString(
      raw as string | string[] | null | undefined,
    );
    if (stringValue === undefined) {
      return null;
    }
    const parsed = config.valueSchema.safeParse(stringValue);
    return parsed.success ? parsed.data : null;
  }

  function open(nextValue?: TValue) {
    const resolved = nextValue ?? value.value ?? config.defaultOpenValue;
    value.value = resolved;
    isOpen.value = true;

    replaceRouteQuery(route, router, (query) => ({
      ...query,
      [config.queryKey]: String(resolved),
    }));
  }

  function close() {
    isOpen.value = false;
    value.value = config.defaultOpenValue;

    replaceRouteQuery(route, router, (query) => {
      const nextQuery = { ...query };
      delete nextQuery[config.queryKey];
      return nextQuery;
    });
  }

  function toggle() {
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  }

  watch(
    () => route.query[config.queryKey],
    (raw) => {
      const parsed = parseQuery(raw);

      if (parsed !== null) {
        value.value = parsed;
        isOpen.value = true;
        return;
      }

      if (isOpen.value) {
        isOpen.value = false;
        value.value = config.defaultOpenValue;
      }
    },
    { immediate: true },
  );

  return {
    isOpen,
    value,
    open,
    close,
    toggle,
  };
}
