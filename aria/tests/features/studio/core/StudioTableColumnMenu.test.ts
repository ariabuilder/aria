import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";

function passThrough(tag = "div") {
  return defineComponent({
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.());
    },
  });
}

vi.mock("@/components/ui/button", () => ({
  Button: passThrough("button"),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: passThrough(),
  DropdownMenuContent: passThrough(),
  DropdownMenuTrigger: passThrough(),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: passThrough(),
  TooltipContent: passThrough(),
  TooltipProvider: passThrough(),
  TooltipTrigger: passThrough(),
}));

const DraggableStub = defineComponent({
  props: {
    list: {
      type: Array,
      required: true,
    },
  },
  emits: ["end"],
  setup(props, { emit, slots }) {
    function reverseAndEmit(): void {
      props.list.reverse();
      emit("end");
    }

    return () =>
      h("div", [
        h(
          "button",
          {
            class: "drag-reorder",
            type: "button",
            onClick: reverseAndEmit,
          },
          "reorder",
        ),
        ...props.list.flatMap((element) => slots.item?.({ element }) ?? []),
      ]);
  },
});

function createColumn(id: string, header: string) {
  return {
    id,
    columnDef: { header },
    getIsVisible: vi.fn(() => true),
    toggleVisibility: vi.fn(),
  };
}

describe("StudioTableColumnMenu", () => {
  it("keeps locked columns visible while toggling unlocked columns", async () => {
    const StudioTableColumnMenu = (
      await import(
        "../../../../admin/features/Studio/core/components/StudioTableColumnMenu.vue"
      )
    ).default;
    const lockedColumn = createColumn("name", "Name");
    const unlockedColumn = createColumn("updated", "Updated");

    const wrapper = mount(StudioTableColumnMenu, {
      props: {
        columns: [lockedColumn, unlockedColumn],
        lockedColumnIds: ["name"],
      },
      global: {
        stubs: {
          Draggable: DraggableStub,
        },
      },
    });

    await flushPromises();

    const items = wrapper.findAll('[role="menuitemcheckbox"]');
    await items[0]!.trigger("click");
    await items[1]!.trigger("click");

    expect(lockedColumn.toggleVisibility).not.toHaveBeenCalled();
    expect(unlockedColumn.toggleVisibility).toHaveBeenCalledTimes(1);
  });

  it("emits reordered columns from the draggable list", async () => {
    const StudioTableColumnMenu = (
      await import(
        "../../../../admin/features/Studio/core/components/StudioTableColumnMenu.vue"
      )
    ).default;
    const nameColumn = createColumn("name", "Name");
    const updatedColumn = createColumn("updated", "Updated");

    const wrapper = mount(StudioTableColumnMenu, {
      props: {
        columns: [nameColumn, updatedColumn],
      },
      global: {
        stubs: {
          Draggable: DraggableStub,
        },
      },
    });

    await flushPromises();
    await wrapper.find(".drag-reorder").trigger("click");

    const emitted = wrapper.emitted("reorder");
    const reorderedColumns = emitted?.[0]?.[0] as
      | Array<{ id: string }>
      | undefined;

    expect(reorderedColumns?.map((column) => column.id)).toEqual([
      "updated",
      "name",
    ]);
  });
});
