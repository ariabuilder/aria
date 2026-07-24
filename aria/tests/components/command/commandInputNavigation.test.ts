import { describe, expect, it, vi } from "vitest";
import {
  getVisibleCommandItems,
  handleCommandInputKeydown,
  isCommandFilterKeyTarget,
  navigateVisibleCommandItems,
} from "../../../admin/components/ui/command/commandInputNavigation";

function createListboxContext() {
  const highlightedElement = { value: null as HTMLElement | null };
  return {
    highlightedElement,
    onKeydownEnter: vi.fn(),
    changeHighlight: vi.fn((el: HTMLElement) => {
      highlightedElement.value = el;
    }),
  };
}

function createCommandDom(): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("data-slot", "command");
  root.innerHTML = `
    <input data-slot="command-input" />
    <div data-slot="command-list">
      <div data-slot="command-item">Dashboard</div>
      <div data-slot="command-item">Pages</div>
      <div data-slot="command-item">Layouts</div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

describe("commandInputNavigation", () => {
  it("detects command filter input targets", () => {
    const input = document.createElement("input");
    input.dataset.slot = "command-input";
    expect(isCommandFilterKeyTarget(input)).toBe(true);
  });

  it("finds visible command items in the list", () => {
    const root = createCommandDom();
    const items = getVisibleCommandItems(root);
    expect(items).toHaveLength(3);
    root.remove();
  });

  it("highlights the first item on ArrowDown", () => {
    const root = createCommandDom();
    const context = createListboxContext();
    const input = root.querySelector("input")!;

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });

    expect(
      navigateVisibleCommandItems(event, context, root),
    ).toBe(true);
    expect(context.highlightedElement.value?.textContent).toBe("Dashboard");
    root.remove();
  });

  it("keeps the first item on first ArrowDown when Reka pre-highlighted index 0", () => {
    const root = createCommandDom();
    const context = createListboxContext();
    const items = getVisibleCommandItems(root);
    context.highlightedElement.value = items[0]!;
    const input = root.querySelector("input")!;

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });

    navigateVisibleCommandItems(event, context, root);
    expect(context.highlightedElement.value?.textContent).toBe("Dashboard");

    navigateVisibleCommandItems(event, context, root);
    expect(context.highlightedElement.value?.textContent).toBe("Pages");
    root.remove();
  });

  it("moves highlight on subsequent ArrowDown presses", () => {
    const root = createCommandDom();
    const context = createListboxContext();
    const items = getVisibleCommandItems(root);
    context.highlightedElement.value = items[0]!;
    const input = root.querySelector("input")!;

    const first = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
    });
    Object.defineProperty(first, "target", { value: input });
    navigateVisibleCommandItems(first, context, root);

    const second = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
    });
    Object.defineProperty(second, "target", { value: input });
    navigateVisibleCommandItems(second, context, root);
    expect(context.highlightedElement.value?.textContent).toBe("Pages");
    root.remove();
  });

  it("handles keydown from capture handler on the wrapper", async () => {
    const root = createCommandDom();
    const context = createListboxContext();
    const input = root.querySelector("input")!;

    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });

    await handleCommandInputKeydown(event, context, root);
    expect(context.changeHighlight).toHaveBeenCalled();
    expect(context.highlightedElement.value?.textContent).toBe("Dashboard");
    root.remove();
  });

  it("delegates Enter to listbox enter handler", async () => {
    const context = createListboxContext();
    const input = document.createElement("input");
    input.dataset.slot = "command-input";

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input });

    await handleCommandInputKeydown(event, context);

    expect(context.onKeydownEnter).toHaveBeenCalledWith(event);
  });
});
