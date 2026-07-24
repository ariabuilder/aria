import { computed, readonly, ref } from "vue";

const activeRunIds = ref<ReadonlySet<string>>(new Set());
const isWorking = computed(() => activeRunIds.value.size > 0);

export interface AgentBuildProgress {
  runId: string;
  sequence: number;
  completedSections: number;
  updatedAt: number;
}

const buildProgressByRun = ref<ReadonlyMap<string, AgentBuildProgress>>(
  new Map(),
);
const currentBuild = computed<AgentBuildProgress | null>(() => {
  let latest: AgentBuildProgress | null = null;
  for (const progress of buildProgressByRun.value.values()) {
    if (!latest || progress.updatedAt >= latest.updatedAt) {
      latest = progress;
    }
  }
  return latest;
});

export function registerAgentRun(runId: string): void {
  if (activeRunIds.value.has(runId)) return;
  activeRunIds.value = new Set([...activeRunIds.value, runId]);
}

export function finishAgentRun(runId: string): void {
  if (!activeRunIds.value.has(runId)) return;
  const next = new Set(activeRunIds.value);
  next.delete(runId);
  activeRunIds.value = next;
}

export function startAgentBuild(runId: string): void {
  const next = new Map(buildProgressByRun.value);
  next.set(runId, {
    runId,
    sequence: 0,
    completedSections: 0,
    updatedAt: Date.now(),
  });
  buildProgressByRun.value = next;
}

export function recordAgentBuildSection(
  runId: string,
  completedSections: number,
): void {
  const next = new Map(buildProgressByRun.value);
  next.set(runId, {
    runId,
    sequence: completedSections,
    completedSections,
    updatedAt: Date.now(),
  });
  buildProgressByRun.value = next;
}

export function finishAgentBuild(runId: string): void {
  if (!buildProgressByRun.value.has(runId)) return;
  const next = new Map(buildProgressByRun.value);
  next.delete(runId);
  buildProgressByRun.value = next;
}

export function useAgentRuntimeStatus() {
  return {
    isWorking: readonly(isWorking),
    activeRunCount: computed(() => activeRunIds.value.size),
    isBuilding: computed(() => buildProgressByRun.value.size > 0),
    currentBuild: readonly(currentBuild),
    currentBuildSequence: computed(() => currentBuild.value?.sequence ?? 0),
    completedSectionCount: computed(
      () => currentBuild.value?.completedSections ?? 0,
    ),
  };
}
