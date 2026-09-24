export type Kind = "text" | "image" | "files";
export type Filter = "all" | Kind | "pinned";
export type Action = "copy" | "paste";
export interface Entry {
  id: number;
  kind: Kind;
  preview: string;
  source: string;
  createdAt: number;
  pinned: boolean;
  charCount: number;
  width: number;
  height: number;
}
export interface Payload {
  kind: Kind;
  content: string;
  preview: string;
  width: number;
  height: number;
}
export interface Settings {
  shortcut: string;
  enterAction: Action;
  doubleClickAction: Action;
  historyLimit: number;
  paused: boolean;
}
export interface SaveOutcome {
  shortcutActive: boolean;
  message: string | null;
}
export interface Snapshot {
  entries: Entry[];
  total: number;
  pinned: number;
  settings: Settings;
}
export const defaultSettings: Settings = {
  shortcut: "CommandOrControl+Shift+V",
  enterAction: "paste",
  doubleClickAction: "paste",
  historyLimit: 500,
  paused: false,
};
