import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { useHistory } from "../../admin/features/History/composables/useHistory";
import type { Operation } from "../../admin/features/History/composables/useHistory";

const NodeSchema = z.object({
  id: z.uuid(),
  props: z.record(z.string(), z.unknown()).default({}),
  classNames: z.record(z.string(), z.array(z.string())).default({}),
});

type TestNode = z.infer<typeof NodeSchema>;

const ReorderStateSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

type ReorderState = z.infer<typeof ReorderStateSchema>;

const PageSettingsSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  saveVersion: z.int().nonnegative(),
});

type PageSettings = z.infer<typeof PageSettingsSchema>;

describe("History - P0 Acceptance", () => {
  let history: ReturnType<typeof useHistory>;

  beforeEach(() => {
    history = useHistory();
    history.clear();
  });

  afterEach(() => {
    history.clear();
  });

  it("P0-1: node property edit → undo → redo", async () => {
    const node = NodeSchema.parse({
      id: crypto.randomUUID(),
      props: { title: "Original" },
    });

    const before = node.props.title;
    const after = "Updated";

    const operation: Operation = {
      type: "update-node-props",
      timestamp: Date.now(),
      description: "Update node title",
      affectedNodeIds: [node.id],
      undo: () => {
        node.props.title = before;
      },
      redo: () => {
        node.props.title = after;
      },
    };

    const executeResult = await history.execute(operation);
    expect(executeResult.success).toBe(true);
    expect(node.props.title).toBe("Updated");

    await history.undo();
    expect(node.props.title).toBe("Original");

    await history.redo();
    expect(node.props.title).toBe("Updated");

    NodeSchema.parse(node);
  });

  it("P0-2: node reorder drag sequence → undo restores exact order", async () => {
    const state: ReorderState = ReorderStateSchema.parse({
      order: ["a", "b", "c", "d"],
    });

    const before = [...state.order];
    const after = ["a", "c", "d", "b"];

    const operation: Operation = {
      type: "reorder-nodes",
      timestamp: Date.now(),
      description: "Reorder layer items",
      undo: () => {
        state.order = [...before];
      },
      redo: () => {
        state.order = [...after];
      },
    };

    const executeResult = await history.execute(operation);
    expect(executeResult.success).toBe(true);
    expect(state.order).toEqual(after);

    await history.undo();
    expect(state.order).toEqual(before);

    await history.redo();
    expect(state.order).toEqual(after);

    ReorderStateSchema.parse(state);
  });

  it("P0-3: class editor utility change at breakpoint → undo/redo stable", async () => {
    const node: TestNode = NodeSchema.parse({
      id: crypto.randomUUID(),
      classNames: {
        base: ["flex"],
        md: ["flex", "gap-2"],
      },
    });

    const key = "md";
    const classToAdd = "p-4";
    const before = [...(node.classNames[key] ?? [])];
    const after = [...before, classToAdd];

    const operation: Operation = {
      type: "add-utility-class",
      timestamp: Date.now(),
      description: "Add md:p-4",
      affectedNodeIds: [node.id],
      undo: () => {
        node.classNames[key] = [...before];
      },
      redo: () => {
        node.classNames[key] = [...after];
      },
    };

    const executeResult = await history.execute(operation);
    expect(executeResult.success).toBe(true);
    expect(node.classNames[key]).toContain("p-4");

    await history.undo();
    expect(node.classNames[key]).toEqual(before);

    await history.redo();
    expect(node.classNames[key]).toEqual(after);

    NodeSchema.parse(node);
  });

  it("P0-4: media reference change on node → undo/redo restores URL", async () => {
    const node = NodeSchema.parse({
      id: crypto.randomUUID(),
      props: {
        src: "/uploads/original.jpg",
      },
    });

    const before = "/uploads/original.jpg";
    const after = "/uploads/updated.jpg";

    const operation: Operation = {
      type: "update-node-props",
      timestamp: Date.now(),
      description: "Update image src",
      affectedNodeIds: [node.id],
      undo: () => {
        node.props.src = before;
      },
      redo: () => {
        node.props.src = after;
      },
    };

    const executeResult = await history.execute(operation);
    expect(executeResult.success).toBe(true);
    expect(node.props.src).toBe(after);

    await history.undo();
    expect(node.props.src).toBe(before);

    await history.redo();
    expect(node.props.src).toBe(after);

    NodeSchema.parse(node);
  });

  it("P0-5: page settings edit + save cycle → history remains coherent", async () => {
    const settings: PageSettings = PageSettingsSchema.parse({
      title: "Home",
      description: "Initial",
      saveVersion: 0,
    });

    const titleBefore = settings.title;
    const titleAfter = "Home Updated";

    const editOperation: Operation = {
      type: "update-page-dsl",
      timestamp: Date.now(),
      description: "Edit page title",
      undo: () => {
        settings.title = titleBefore;
      },
      redo: () => {
        settings.title = titleAfter;
      },
    };

    const saveBefore = settings.saveVersion;
    const saveAfter = saveBefore + 1;

    const saveOperation: Operation = {
      type: "update-page-dsl",
      timestamp: Date.now() + 1,
      description: "Persist page settings",
      undo: () => {
        settings.saveVersion = saveBefore;
      },
      redo: () => {
        settings.saveVersion = saveAfter;
      },
    };

    expect((await history.execute(editOperation)).success).toBe(true);
    expect((await history.execute(saveOperation)).success).toBe(true);

    expect(settings.title).toBe(titleAfter);
    expect(settings.saveVersion).toBe(saveAfter);
    expect(history.getState().stackSize).toBe(2);

    await history.undo();
    expect(settings.saveVersion).toBe(saveBefore);
    expect(history.getState().currentIndex).toBe(0);

    await history.undo();
    expect(settings.title).toBe(titleBefore);
    expect(history.getState().currentIndex).toBe(-1);

    await history.redo();
    await history.redo();
    expect(settings.title).toBe(titleAfter);
    expect(settings.saveVersion).toBe(saveAfter);
    expect(history.getState().currentIndex).toBe(1);

    PageSettingsSchema.parse(settings);
  });

  it("P0-6: context switch while stack exists → no stale command replay", async () => {
    const contextA = { value: 0 };
    const contextB = { value: 100 };

    const opA: Operation = {
      type: "update-node",
      timestamp: Date.now(),
      description: "Context A mutation",
      undo: () => {
        contextA.value = 0;
      },
      redo: () => {
        contextA.value = 1;
      },
    };

    expect((await history.execute(opA)).success).toBe(true);
    expect(contextA.value).toBe(1);

    history.clear();
    expect(history.getState().stackSize).toBe(0);

    const opB: Operation = {
      type: "update-node",
      timestamp: Date.now() + 1,
      description: "Context B mutation",
      undo: () => {
        contextB.value = 100;
      },
      redo: () => {
        contextB.value = 200;
      },
    };

    expect((await history.execute(opB)).success).toBe(true);
    expect(contextB.value).toBe(200);

    await history.undo();
    expect(contextB.value).toBe(100);
    expect(contextA.value).toBe(1);
    expect(history.getState().currentIndex).toBe(-1);
  });
});
