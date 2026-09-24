import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  Action,
  Entry,
  Filter,
  Payload,
  Settings,
  SaveOutcome,
  Snapshot,
} from "./types";
import { defaultSettings } from "./types";

export const native = isTauri();
// The browser is an explicit UI preview. Native capture and paste are never simulated as success.
let demoEntries: Entry[] = [];
let demoSettings = { ...defaultSettings };
const demoBodies = new Map<number, string>();
const demoListeners = new Set<() => void>();
const changed = () => demoListeners.forEach((listener) => listener());
export function loadDemo() {
  const now = Date.now();
  const contents = [
    "项目交付清单\n确认构建结果、检查配置并更新使用说明。",
    "https://tauri.app",
    "npm run tauri dev",
    "会议记录\n讨论新版本的功能规划、时间安排及资源分配。\n\n待处理事项：\n1. 确认快捷键设置。\n2. 完成复制与粘贴流程检查。\n3. 更新文件引用的使用说明。\n\n下次评审前提交测试结果。",
    "产品需求.md",
  ];
  demoEntries = contents.map((preview, index) => ({
    id: index + 1,
    kind: index === 4 ? "files" : "text",
    preview,
    source: ["Notes", "Safari", "Terminal", "Notes", "Finder"][index],
    createdAt: now - [2, 8, 15, 28, 36][index] * 60000,
    pinned: index === 0,
    charCount: Array.from(preview).length,
    width: 0,
    height: 0,
  }));
  contents.forEach((s, i) => demoBodies.set(i + 1, s));
  changed();
}
export const api = {
  async suspendShortcut(suspended: boolean) {
    if (native) await invoke("suspend_shortcut", { suspended });
  },
  async snapshot(query: string, filter: Filter): Promise<Snapshot> {
    if (native) return invoke("snapshot", { query, filter });
    const q = query.toLocaleLowerCase();
    return {
      entries: demoEntries.filter(
        (e) =>
          (filter === "all" ||
            filter === e.kind ||
            (filter === "pinned" && e.pinned)) &&
          `${demoBodies.get(e.id)} ${e.source}`.toLocaleLowerCase().includes(q),
      ),
      total: demoEntries.length,
      pinned: demoEntries.filter((e) => e.pinned).length,
      settings: { ...demoSettings },
    };
  },
  async content(id: number): Promise<Payload> {
    if (native) return invoke("entry_content", { id });
    const e = demoEntries.find((e) => e.id === id);
    if (!e) throw new Error("记录不存在");
    return {
      kind: e.kind,
      content: demoBodies.get(id) ?? e.preview,
      preview: e.preview,
      width: e.width,
      height: e.height,
    };
  },
  async delete(id: number) {
    if (native) return invoke<void>("delete_entry", { id });
    demoEntries = demoEntries.filter((e) => e.id !== id);
    demoBodies.delete(id);
    changed();
  },
  async clear() {
    if (native) return invoke<void>("clear_history");
    demoEntries = [];
    demoBodies.clear();
    changed();
  },
  async pin(id: number) {
    if (native) return invoke<void>("toggle_pin", { id });
    demoEntries = demoEntries.map((e) =>
      e.id === id ? { ...e, pinned: !e.pinned } : e,
    );
    changed();
  },
  async save(settings: Settings): Promise<SaveOutcome> {
    if (native) return invoke<SaveOutcome>("save_settings", { settings });
    demoSettings = { ...settings };
    changed();
    return { shortcutActive: true, message: null };
  },
  async use(id: number, action: Action) {
    if (native) return invoke<void>("use_entry", { id, action });
    const entry = await api.content(id);
    if (action === "paste" || entry.kind !== "text")
      throw new Error("请在 macOS 客户端中使用此操作");
    await navigator.clipboard.writeText(entry.content);
  },
  async hide() {
    if (native) await invoke("hide_window");
  },
  async minimize() {
    if (native) await getCurrentWindow().minimize();
  },
  async drag() {
    if (native) await getCurrentWindow().startDragging();
  },
  async trusted(): Promise<boolean> {
    return native ? invoke("accessibility_status") : false;
  },
  async permissions() {
    if (native) await invoke("open_accessibility");
    else throw new Error("请在 macOS 客户端中设置权限");
  },
  async startupError(): Promise<string> {
    return native ? invoke("startup_error") : "";
  },
  async subscribe(
    event: string,
    callback: (payload?: string) => void,
  ): Promise<() => void> {
    if (native) return listen<string>(event, (e) => callback(e.payload));
    if (event !== "history-changed") return () => {};
    demoListeners.add(callback);
    return () => {
      demoListeners.delete(callback);
    };
  },
};
