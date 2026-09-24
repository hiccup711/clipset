import { ArrowDown, ArrowUp, Copy, CornerDownLeft, Star } from "lucide-react";
import type { Action, Entry } from "../types";
import { shortcutLabel } from "../format";
export function ActionBar({
  entry,
  busy,
  enterAction,
  shortcut,
  onSettings,
  onUse,
  onPin,
}: {
  entry?: Entry;
  busy: boolean;
  enterAction: Action;
  shortcut: string;
  onSettings: () => void;
  onUse: (action: Action) => void;
  onPin: () => void;
}) {
  return (
    <section className="action-bar" aria-label="记录操作">
      <div className="action-hints">
        <span className="navigation-hint">
          <ArrowUp size={12} />
          <ArrowDown size={12} />
          选择
        </span>
        <span className="enter-hint">
          <CornerDownLeft size={13} />
          {enterAction === "paste" ? "粘贴" : "复制"}
        </span>
        <button
          className="global-shortcut"
          title="更改全局快捷键"
          onClick={onSettings}
        >
          {shortcutLabel(shortcut)}
        </button>
      </div>
      <div className="selection-actions">
        <button
          className={`button favorite-button ${entry?.pinned ? "is-pinned" : ""}`}
          aria-label={entry?.pinned ? "取消收藏" : "收藏记录"}
          title={entry?.pinned ? "取消收藏" : "收藏记录"}
          disabled={!entry || busy}
          onClick={onPin}
        >
          <Star
            size={17}
            strokeWidth={1.7}
            fill={entry?.pinned ? "currentColor" : "none"}
          />
          <span>{entry?.pinned ? "已收藏" : "收藏"}</span>
        </button>
        <button
          className="button secondary copy-button"
          aria-label="复制"
          disabled={!entry || busy}
          onClick={() => onUse("copy")}
        >
          <Copy size={16} />
          <span>复制</span>
        </button>
        <button
          className="button paste-button"
          aria-label="粘贴到原应用"
          disabled={!entry || busy}
          onClick={() => onUse("paste")}
        >
          <span>粘贴到原应用</span>
          {enterAction === "paste" && <CornerDownLeft size={16} />}
        </button>
      </div>
    </section>
  );
}
