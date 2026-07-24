import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useDebouncedSettingsSave } from "../../admin/features/Studio/settings/composables/useDebouncedSettingsSave";

describe("useDebouncedSettingsSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips save when payload is unchanged", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({ title: title.value }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "Home" });
    debouncedSave.onBlur();

    await vi.advanceTimersByTimeAsync(700);

    expect(save).not.toHaveBeenCalled();
    expect(debouncedSave.isDirty()).toBe(false);
  });

  it("coalesces multiple blurs into one save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");
    const description = ref("Welcome");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({
        title: title.value,
        description: description.value,
      }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "", description: "" });

    title.value = "Home";
    debouncedSave.onBlur();
    await vi.advanceTimersByTimeAsync(300);

    description.value = "Welcome";
    debouncedSave.onBlur();
    await vi.advanceTimersByTimeAsync(700);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      title: "Home",
      description: "Welcome",
    });
  });

  it("blocks remote sync while a debounced save is pending", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({ title: title.value }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "" });
    title.value = "Home";
    debouncedSave.onBlur();

    expect(debouncedSave.shouldSyncFromRemote()).toBe(false);
  });

  it("allows remote sync again after save completes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({ title: title.value }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "" });
    title.value = "Home";
    debouncedSave.onBlur();

    await vi.advanceTimersByTimeAsync(700);

    expect(save).toHaveBeenCalledTimes(1);
    expect(debouncedSave.shouldSyncFromRemote()).toBe(true);
  });

  it("flushes a pending save immediately", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({ title: title.value }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "" });
    debouncedSave.scheduleSave();

    await debouncedSave.flushSave();
    await vi.advanceTimersByTimeAsync(700);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "Home" });
    expect(debouncedSave.hasPendingSave.value).toBe(false);
  });

  it("persists pending changes when flushSave runs before markSaved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({ title: title.value }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "" });
    title.value = "Home";
    debouncedSave.scheduleSave();

    await debouncedSave.flushSave();
    debouncedSave.markSaved({ title: "Home" });

    await vi.advanceTimersByTimeAsync(700);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: "Home" });
    expect(debouncedSave.isDirty()).toBe(false);
  });

  it("does not drop a pending save when markSaved is called before the timer fires", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({ title: title.value }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "" });
    title.value = "Home";
    debouncedSave.scheduleSave();

    debouncedSave.markSaved({ title: "Home" });

    await vi.advanceTimersByTimeAsync(700);

    expect(save).not.toHaveBeenCalled();
    expect(debouncedSave.isDirty()).toBe(false);
  });

  it("disposes pending timers without saving after teardown", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const title = ref("Home");

    const debouncedSave = useDebouncedSettingsSave({
      getPayload: () => ({ title: title.value }),
      save,
      debounceMs: 700,
    });

    debouncedSave.markSaved({ title: "" });
    debouncedSave.scheduleSave();
    debouncedSave.dispose();

    await vi.advanceTimersByTimeAsync(700);

    expect(save).not.toHaveBeenCalled();
    expect(debouncedSave.hasPendingSave.value).toBe(false);
    expect(debouncedSave.shouldSyncFromRemote()).toBe(true);
  });
});
