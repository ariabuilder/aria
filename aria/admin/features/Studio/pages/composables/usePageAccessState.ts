import { computed, ref, type ComputedRef, type Ref } from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import type { PagePolicyResult } from "../../../../../lib/pages/policy";
import { StoredPageSystemRoleSchema } from "../../../../../lib/storage/adapter";
import { PageAccessModeSchema } from "./usePageForm";

const PageSystemRoleSchema = StoredPageSystemRoleSchema;

type PageSystemRole = z.infer<typeof PageSystemRoleSchema>;
type PageAccessMode = z.infer<typeof PageAccessModeSchema>;

type PolicySnapshot = {
  systemRole: PageSystemRole;
  accessMode: PageAccessMode;
  promptTitle: string;
  promptDescription: string;
  rememberDays: number | null;
};

export interface LoadPagePolicyOptions {
  /** Bypass the shared policy cache after a server mutation. */
  force?: boolean;
  /** Rebase local field edits onto the authoritative server policy. */
  preserveLocalChanges?: boolean;
}

type LocalPolicyChanges = {
  snapshot: PolicySnapshot;
  password: string;
  changed: Set<keyof PolicySnapshot | "password">;
};

const policyCache = new Map<string, PagePolicyResult>();
const policyLoads = new Map<string, Promise<PagePolicyResult>>();

export const rememberDaysOptions = [
  { value: null, label: "Session only" },
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
] as const;

export const systemRoleOptions = [
  {
    value: "standard" as const,
    label: "Standard page",
    description: "A regular content page",
    icon: "i-hugeicons:file-01",
  },
  {
    value: "not-found" as const,
    label: "404 page",
    description: "Shown when a page isn't found",
    icon: "i-hugeicons:cancel-circle",
  },
  {
    value: "cms-collection" as const,
    label: "CMS Collection",
    description: "Archive layout for a collection — public at its own URL",
    icon: "i-hugeicons:grid-view",
  },
  {
    value: "cms-entry" as const,
    label: "CMS Entry",
    description: "Single-entry layout — only reachable through collection URLs",
    icon: "i-hugeicons:layout-grid",
  },
] as const;

export interface UsePageAccessStateReturn {
  accessMode: Ref<PageAccessMode>;
  password: Ref<string>;
  promptTitle: Ref<string>;
  promptDescription: Ref<string>;
  rememberDays: Ref<number | null>;
  systemRole: Ref<PageSystemRole>;
  hasPassword: Ref<boolean>;
  isPolicyDirty: ComputedRef<boolean>;
  isNotFoundRole: ComputedRef<boolean>;
  isCmsCollectionRole: ComputedRef<boolean>;
  isCmsEntryRole: ComputedRef<boolean>;
  isLoading: Ref<boolean>;
  isSaving: Ref<boolean>;
  error: Ref<string | null>;
  clearedAssignments: Ref<PagePolicyResult["clearedAssignments"]>;
  loadPolicy: (
    slug: string,
    options?: LoadPagePolicyOptions,
  ) => Promise<void>;
  applyPolicy: (policy: PagePolicyResult) => void;
  savePolicy: (slug: string) => Promise<void>;
}

function snapshotFromPolicy(policy: PagePolicyResult): PolicySnapshot {
  return {
    systemRole: PageSystemRoleSchema.parse(policy.systemRole),
    accessMode: PageAccessModeSchema.parse(policy.accessMode),
    promptTitle: policy.promptTitle ?? "",
    promptDescription: policy.promptDescription ?? "",
    rememberDays: policy.rememberForDays ?? null,
  };
}

export function usePageAccessState(): UsePageAccessStateReturn {
  const accessMode = ref<PageAccessMode>("public");
  const password = ref("");
  const promptTitle = ref("");
  const promptDescription = ref("");
  const rememberDays = ref<number | null>(null);
  const systemRole = ref<PageSystemRole>("standard");
  const hasPassword = ref(false);
  const initialPolicy = ref<PolicySnapshot | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);
  const clearedAssignments = ref<PagePolicyResult["clearedAssignments"]>(
    undefined,
  );
  let loadGeneration = 0;

  function captureSnapshot(): PolicySnapshot {
    return {
      systemRole: systemRole.value,
      accessMode: accessMode.value,
      promptTitle: promptTitle.value,
      promptDescription: promptDescription.value,
      rememberDays: rememberDays.value,
    };
  }

  function captureLocalChanges(): LocalPolicyChanges | null {
    const initial = initialPolicy.value;
    if (!initial) {
      return null;
    }

    const snapshot = captureSnapshot();
    const changed = new Set<keyof PolicySnapshot | "password">();
    for (const field of Object.keys(snapshot) as Array<keyof PolicySnapshot>) {
      if (snapshot[field] !== initial[field]) {
        changed.add(field);
      }
    }
    if (password.value.trim().length > 0) {
      changed.add("password");
    }

    return {
      snapshot,
      password: password.value,
      changed,
    };
  }

  function applyPolicyResult(
    policy: PagePolicyResult,
    localChanges: LocalPolicyChanges | null = null,
  ): void {
    systemRole.value = PageSystemRoleSchema.parse(policy.systemRole);
    accessMode.value = PageAccessModeSchema.parse(policy.accessMode);
    promptTitle.value = policy.promptTitle ?? "";
    promptDescription.value = policy.promptDescription ?? "";
    rememberDays.value = policy.rememberForDays ?? null;
    hasPassword.value = policy.hasPassword;
    password.value = "";
    initialPolicy.value = snapshotFromPolicy(policy);

    if (!localChanges) {
      return;
    }
    if (localChanges.changed.has("systemRole")) {
      systemRole.value = localChanges.snapshot.systemRole;
    }
    if (localChanges.changed.has("accessMode")) {
      accessMode.value = localChanges.snapshot.accessMode;
    }
    if (localChanges.changed.has("promptTitle")) {
      promptTitle.value = localChanges.snapshot.promptTitle;
    }
    if (localChanges.changed.has("promptDescription")) {
      promptDescription.value = localChanges.snapshot.promptDescription;
    }
    if (localChanges.changed.has("rememberDays")) {
      rememberDays.value = localChanges.snapshot.rememberDays;
    }
    if (localChanges.changed.has("password")) {
      password.value = localChanges.password;
    }
  }

  function resetPolicyState(): void {
    accessMode.value = "public";
    password.value = "";
    promptTitle.value = "";
    promptDescription.value = "";
    rememberDays.value = null;
    systemRole.value = "standard";
    hasPassword.value = false;
    initialPolicy.value = null;
  }

  function policyHasChanges(): boolean {
    if (!initialPolicy.value) {
      return false;
    }

    const current = captureSnapshot();
    const initial = initialPolicy.value;

    if (current.systemRole !== initial.systemRole) {
      return true;
    }
    if (current.accessMode !== initial.accessMode) {
      return true;
    }

    if (accessMode.value === "password") {
      if (password.value.trim().length > 0) {
        return true;
      }
      if (current.promptTitle !== initial.promptTitle) {
        return true;
      }
      if (current.promptDescription !== initial.promptDescription) {
        return true;
      }
      if (current.rememberDays !== initial.rememberDays) {
        return true;
      }
    }

    return false;
  }

  const isPolicyDirty = computed(() => policyHasChanges());
  const isNotFoundRole = computed(() => systemRole.value === "not-found");
  const isCmsCollectionRole = computed(
    () => systemRole.value === "cms-collection",
  );
  const isCmsEntryRole = computed(() => systemRole.value === "cms-entry");

  async function loadPolicy(
    slug: string,
    options: LoadPagePolicyOptions = {},
  ): Promise<void> {
    const parsedSlug = z.string().trim().min(1).safeParse(slug);
    if (!parsedSlug.success) {
      return;
    }

    const generation = loadGeneration + 1;
    loadGeneration = generation;
    const localChanges = options.preserveLocalChanges
      ? captureLocalChanges()
      : null;

    const cached = policyCache.get(parsedSlug.data);
    if (cached && !options.force) {
      applyPolicyResult(cached, localChanges);
      isLoading.value = false;
      error.value = null;
      return;
    }

    isLoading.value = true;
    error.value = null;
    if (!options.preserveLocalChanges) {
      resetPolicyState();
    }

    try {
      let policyLoad = options.force
        ? undefined
        : policyLoads.get(parsedSlug.data);
      if (!policyLoad) {
        policyLoad = actions.pages
          .getPolicy({ slug: parsedSlug.data })
          .then((policyResult) => {
            if (policyResult.error) {
              throw new Error(
                policyResult.error.message ?? "Failed to load access settings",
              );
            }

            const policy = policyResult.data as PagePolicyResult | undefined;
            if (!policy) throw new Error("Failed to load access settings");
            return policy;
          })
          .finally(() => {
            if (!options.force) {
              policyLoads.delete(parsedSlug.data);
            }
          });
        if (!options.force) {
          policyLoads.set(parsedSlug.data, policyLoad);
        }
      }

      const policy = await policyLoad;

      if (generation !== loadGeneration) {
        return;
      }

      policyCache.set(parsedSlug.data, policy);
      applyPolicyResult(policy, localChanges);
    } catch (loadError) {
      if (generation !== loadGeneration) {
        return;
      }

      error.value =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load access settings";
      if (!options.preserveLocalChanges) {
        initialPolicy.value = null;
      }
    } finally {
      if (generation === loadGeneration) {
        isLoading.value = false;
      }
    }
  }

  async function savePolicy(slug: string): Promise<void> {
    const parsedSlug = z.string().trim().min(1).safeParse(slug);
    if (!parsedSlug.success) {
      return;
    }

    if (!policyHasChanges()) {
      return;
    }

    isSaving.value = true;
    error.value = null;

    try {
      const isPassword = accessMode.value === "password";
      const { data, error: updateError } = await actions.pages.updatePolicy({
        slug: parsedSlug.data,
        systemRole: systemRole.value,
        accessMode:
          systemRole.value === "cms-entry" || systemRole.value === "not-found"
            ? "public"
            : accessMode.value,
        newPassword:
          isPassword && password.value.trim().length > 0
            ? password.value
            : undefined,
        promptTitle: isPassword ? promptTitle.value || undefined : undefined,
        promptDescription: isPassword
          ? promptDescription.value || undefined
          : undefined,
        rememberForDays: isPassword ? (rememberDays.value ?? null) : null,
      });

      if (updateError) {
        throw new Error(
          updateError.message ?? "Failed to save access settings",
        );
      }

      const policy = data as PagePolicyResult | undefined;
      if (!policy) {
        throw new Error("Failed to save access settings");
      }

      applyPolicyResult(policy);
      policyCache.set(parsedSlug.data, policy);
      clearedAssignments.value = policy.clearedAssignments;
    } catch (saveError) {
      error.value =
        saveError instanceof Error
          ? saveError.message
          : "Failed to save access settings";
      throw saveError;
    } finally {
      isSaving.value = false;
    }
  }

  return {
    accessMode,
    password,
    promptTitle,
    promptDescription,
    rememberDays,
    systemRole,
    hasPassword,
    isPolicyDirty,
    isNotFoundRole,
    isCmsCollectionRole,
    isCmsEntryRole,
    isLoading,
    isSaving,
    error,
    clearedAssignments,
    loadPolicy,
    applyPolicy: applyPolicyResult,
    savePolicy,
  };
}

export function invalidatePagePolicyCache(slug: string): void {
  policyCache.delete(slug.trim());
}

export function clearPagePolicyCache(): void {
  policyCache.clear();
  policyLoads.clear();
}
