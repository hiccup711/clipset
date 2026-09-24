// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { defaultSettings } from "./types";

const actions = vi.hoisted(() => ({ use: vi.fn(async () => {}), delete: vi.fn(async () => {}) }));
vi.mock("./bridge", () => ({
  native: false,
  loadDemo: () => {},
  api: {
    snapshot: async () => ({
      entries: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1, kind: "text", preview: `记录 ${i + 1}`, source: "Notes",
        createdAt: 0, pinned: false, charCount: 4, width: 0, height: 0,
      })),
      total: 12, pinned: 0, settings: defaultSettings,
    }),
    subscribe: async () => () => {},
    startupError: async () => "",
    suspendShortcut: async () => {},
    trusted: async () => false,
    ...actions,
  },
}));

const scrolled: { id: string; selected: string | null }[] = [];
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: function (this: HTMLElement) {
      scrolled.push({ id: this.id, selected: this.getAttribute("aria-selected") });
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  scrolled.length = 0;
});

async function openList() {
  render(<App />);
  await screen.findByRole("option", { name: "记录 1", selected: true });
  return screen.getByRole("listbox", { name: "剪贴板记录" });
}
function selectedId() {
  return screen.getByRole("option", { selected: true }).id;
}

describe("history keyboard navigation", () => {
  it("follows held arrows, scrolls the committed selection, and resumes from that row", async () => {
    const list = await openList();
    expect(fireEvent.keyDown(list, { key: "ArrowDown" })).toBe(false);
    for (let i = 0; i < 5; i++) {
      expect(fireEvent.keyDown(list, { key: "ArrowDown", repeat: true })).toBe(false);
    }
    expect(selectedId()).toBe("entry-7");
    expect(list.getAttribute("aria-activedescendant")).toBe("entry-7");
    expect(scrolled.at(-1)).toEqual({ id: "entry-7", selected: "true" });
    fireEvent.keyUp(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(selectedId()).toBe("entry-6");
    fireEvent.keyDown(list, { key: "ArrowUp", repeat: true });
    expect(selectedId()).toBe("entry-5");
  });

  it("keeps every movement when repeat events arrive before a render", async () => {
    const list = await openList();
    act(() => {
      for (let i = 0; i < 6; i++) fireEvent.keyDown(list, { key: "ArrowDown", repeat: i > 0 });
    });
    expect(selectedId()).toBe("entry-7");
    expect(scrolled.at(-1)?.id).toBe("entry-7");
  });

  it("prevents native scrolling even when held arrows reach either boundary", async () => {
    const list = await openList();
    for (let i = 0; i < 15; i++) {
      expect(fireEvent.keyDown(list, { key: "ArrowDown", repeat: true })).toBe(false);
    }
    expect(selectedId()).toBe("entry-12");
    for (let i = 0; i < 15; i++) {
      expect(fireEvent.keyDown(list, { key: "ArrowUp", repeat: true })).toBe(false);
    }
    expect(selectedId()).toBe("entry-1");
  });

  it("ignores composing input, repeated actions, and navigation inside a dialog", async () => {
    const list = await openList();
    fireEvent.keyDown(list, { key: "ArrowDown", repeat: true, isComposing: true });
    fireEvent.keyDown(list, { key: "Enter", repeat: true });
    fireEvent.keyDown(list, { key: "Backspace", metaKey: true, repeat: true });
    expect(selectedId()).toBe("entry-1");
    expect(actions.use).not.toHaveBeenCalled();
    expect(actions.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "偏好设置" }));
    const select = screen.getByRole("combobox", { name: "按回车键" });
    expect(fireEvent.keyDown(select, { key: "ArrowDown", repeat: true })).toBe(true);
    expect(list.getAttribute("aria-activedescendant")).toBe("entry-1");
  });
});
