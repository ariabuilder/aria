import { ref, type Ref } from "vue";
import { actions } from "astro:actions";
import {
  GetComponentVersionsOutputSchema,
  type GetComponentVersionsOutput,
} from "../../../../../lib/schemas/componentVersions";

export interface UseComponentVersionsReturn {
  versions: Ref<GetComponentVersionsOutput["versions"]>;
  isLoading: Ref<boolean>;
  loadVersions: (componentId: string) => Promise<void>;
}

export function useComponentVersions(): UseComponentVersionsReturn {
  const versions = ref<GetComponentVersionsOutput["versions"]>([]);
  const isLoading = ref(false);
  let loadGeneration = 0;

  async function loadVersions(componentId: string): Promise<void> {
    const generation = loadGeneration + 1;
    loadGeneration = generation;
    isLoading.value = true;
    versions.value = [];

    try {
      const { data, error } = await actions.components.getVersions({
        componentId,
      });

      if (generation !== loadGeneration) {
        return;
      }

      if (error) {
        versions.value = [];
        return;
      }

      const output = GetComponentVersionsOutputSchema.parse(data);
      if (generation !== loadGeneration) {
        return;
      }

      versions.value = output.versions;
    } finally {
      if (generation === loadGeneration) {
        isLoading.value = false;
      }
    }
  }

  return {
    versions,
    isLoading,
    loadVersions,
  };
}
