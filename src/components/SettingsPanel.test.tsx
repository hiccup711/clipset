// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SettingsPanel } from "./SettingsPanel";
import { defaultSettings } from "../types";

const permissions = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../bridge", () => ({
  native: true,
  api: {
    trusted: async () => false,
    suspendShortcut: async () => {},
    subscribe: async () => () => {},
    permissions,
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("settings save feedback", () => {
  it("keeps a persisted Option preference visible while waiting for permission", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => ({
      shortcutActive: false,
      message: "设置已保存，等待辅助功能权限。",
    }));
    render(
      <SettingsPanel
        settings={defaultSettings}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "全局调起方式" }), {
      target: { value: "double" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "双击按键" }), {
      target: { value: "Option" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await screen.findByText("设置已保存，等待辅助功能权限。");
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ shortcut: "DoubleTap:Option" }),
    );
    expect(onClose).not.toHaveBeenCalled();
    // Feedback remains outside the scrolling settings body, next to the Save button.
    expect(screen.getByRole("status").closest(".settings-body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "打开辅助功能设置" }));
    expect(permissions).toHaveBeenCalledOnce();
  });
  it("shows a rejected save beside the footer without losing the draft", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => {
      throw new Error("快捷键被占用");
    });
    render(
      <SettingsPanel
        settings={defaultSettings}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("快捷键被占用");
    expect(error.closest(".settings-body")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "保存设置" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("closes the drawer only after an active shortcut has been saved", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => ({ shortcutActive: true, message: null }));
    render(
      <SettingsPanel
        settings={defaultSettings}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
