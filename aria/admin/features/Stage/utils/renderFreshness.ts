export interface StageRenderFreshnessSnapshot {
  generation: number;
  cmsRenderKey: string;
}

export interface StageRenderFreshnessCheck {
  cmsRenderKey: string;
  isCanvasReady: boolean;
  isUnmounted: boolean;
}

export function createStageRenderFreshnessTracker() {
  let generation = 0;

  function begin(cmsRenderKey: string): StageRenderFreshnessSnapshot {
    generation += 1;
    return {
      generation,
      cmsRenderKey,
    };
  }

  function isCurrent(
    snapshot: StageRenderFreshnessSnapshot,
    check: StageRenderFreshnessCheck,
  ): boolean {
    return (
      snapshot.generation === generation &&
      snapshot.cmsRenderKey === check.cmsRenderKey &&
      check.isCanvasReady &&
      !check.isUnmounted
    );
  }

  return {
    begin,
    isCurrent,
  };
}
