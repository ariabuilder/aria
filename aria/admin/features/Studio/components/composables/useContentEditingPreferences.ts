import { actions } from "astro:actions";
import { computed, ref, watch } from "vue";
import { useBuilderData } from "@/composables/useBuilderData";
import { useUser } from "@/features/Auth/composables/useUser";
import { ContentEditingPreferencesSchema } from "../../../../../lib/schemas/userPreferences";

const isSaving = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function useContentEditingPreferences() {
  const { userPreferences } = useBuilderData();
  const { user } = useUser();

  const hideLockedContentFields = ref(
    userPreferences.value?.contentEditing?.hideLockedContentFields !== false,
  );

  const showLockedContentFields = computed({
    get: () => !hideLockedContentFields.value,
    set: (value: boolean) => {
      hideLockedContentFields.value = !value;
      scheduleSave();
    },
  });

  watch(
    () => userPreferences.value?.contentEditing?.hideLockedContentFields,
    (value) => {
      hideLockedContentFields.value = value !== false;
    },
  );

  function patchLocalPreference(): void {
    if (!user.value) {
      return;
    }
    user.value = {
      ...user.value,
      preferences: {
        ...(user.value.preferences ?? {}),
        contentEditing: ContentEditingPreferencesSchema.parse({
          hideLockedContentFields: hideLockedContentFields.value,
        }),
      },
    };
  }

  function scheduleSave(): void {
    patchLocalPreference();
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      void flushSave();
    }, 300);
  }

  async function flushSave(): Promise<void> {
    isSaving.value = true;
    try {
      const { data, error } = await actions.auth.updatePreferences({
        contentEditing: {
          hideLockedContentFields: hideLockedContentFields.value,
        },
      });
      if (!error && data?.preferences?.contentEditing && user.value) {
        user.value = {
          ...user.value,
          preferences: {
            ...(user.value.preferences ?? {}),
            contentEditing: data.preferences.contentEditing,
          },
        };
      }
    } finally {
      isSaving.value = false;
    }
  }

  return {
    hideLockedContentFields,
    showLockedContentFields,
    isSaving,
  };
}
