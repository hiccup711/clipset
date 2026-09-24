import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ClipboardList, Search, Star, Trash2, X } from "lucide-react";
import { api, loadDemo, native } from "./bridge";
import {
  defaultSettings,
  type Action,
  type Filter,
  type Snapshot,
} from "./types";
import { HistoryRow } from "./components/HistoryRow";
import { SettingsPanel } from "./components/SettingsPanel";
import { Modal } from "./components/Modal";
import { Sidebar } from "./components/Sidebar";
import { ActionBar } from "./components/ActionBar";
const empty: Snapshot = {
  entries: [],
  total: 0,
  pinned: 0,
  settings: defaultSettings,
};

export default function App() {
  const [data, setData] = useState<Snapshot>(empty);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openVersion, setOpenVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  const search = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);
  const actionBusy = useRef(false);
  const selected = data.entries.find((e) => e.id === selectedId);
  useLayoutEffect(() => {
    if (selectedId === null) return;
    document
      .getElementById(`entry-${selectedId}`)
      ?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [selectedId]);
  const report = useCallback((error: unknown) => {
    setNotice({
      text: error instanceof Error ? error.message : String(error),
      error: true,
    });
  }, []);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const next = await api.snapshot(query.trim(), filter);
      if (version !== requestVersion.current) return;
      setData(next);
      setSelectedId((id) =>
        next.entries.some((e) => e.id === id)
          ? id
          : (next.entries[0]?.id ?? null),
      );
    } catch (e) {
      if (version === requestVersion.current) report(e);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [query, filter, report, openVersion]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), query ? 100 : 0);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void api
      .subscribe("history-changed", () => void refresh())
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(report);
    return () => {
      clearTimeout(timer);
      disposed = true;
      unlisten?.();
      requestVersion.current++;
    };
  }, [refresh, report]);
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    for (const [name, cb] of [
      [
        "panel-opened",
        () => {
          setQuery("");
          setFilter("all");
          setSelectedId(null);
          setOpenVersion((v) => v + 1);
          search.current?.focus();
        },
      ],
      ["capture-error", (message?: string) => report(message ?? "记录失败")],
      [
        "panel-hidden",
        () => {
          setSettingsOpen(false);
          setClearOpen(false);
        },
      ],
      [
        "shortcut-ready",
        () => setNotice({ text: "双击快捷键已启用", error: false }),
      ],
    ] as const) {
      void api
        .subscribe(name, cb)
        .then((fn) => {
          if (disposed) fn();
          else cleanups.push(fn);
        })
        .catch(report);
    }
    void api
      .startupError()
      .then((error) => {
        if (error && !disposed) report(error);
      })
      .catch(report);
    search.current?.focus();
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [report]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(undefined), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeClear = useCallback(() => setClearOpen(false), []);
  async function perform(task: () => Promise<unknown>) {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    try {
      await task();
    } catch (e) {
      report(e);
    } finally {
      actionBusy.current = false;
      setBusy(false);
    }
  }
  function useEntry(id: number, action: Action) {
    void perform(async () => {
      await api.use(id, action);
      setNotice({
        text: action === "copy" ? "已复制到剪贴板" : "已执行粘贴",
        error: false,
      });
    });
  }
  function moveSelection(direction: number) {
    setSelectedId((currentId) => {
      const index = data.entries.findIndex((e) => e.id === currentId);
      return data.entries[
        Math.max(0, Math.min(data.entries.length - 1, index + direction))
      ]?.id ?? null;
    });
  }
  return (
    <main
      className="app"
      onKeyDown={(event) => {
        if (
          settingsOpen ||
          clearOpen ||
          event.nativeEvent.isComposing
        )
          return;
        const target = event.target as HTMLElement;
        const input = target.matches("input, textarea, select");
        // Repeated arrows move the selection, never the browser's scroll position alone.
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveSelection(event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        // Actions such as paste and delete must still only run once per key press.
        if (event.repeat) return;
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          search.current?.focus();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          if (query) setQuery("");
          else void api.hide().catch(report);
          return;
        }
        if (event.key === "Enter" && selected && !target.closest("button")) {
          event.preventDefault();
          useEntry(selected.id, data.settings.enterAction);
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "c" &&
          selected &&
          !window.getSelection()?.toString() &&
          (!input || !(target as HTMLInputElement).value)
        ) {
          event.preventDefault();
          useEntry(selected.id, "copy");
        }
        if (
          event.key === "Backspace" &&
          (event.metaKey || event.ctrlKey) &&
          selected &&
          !input
        ) {
          event.preventDefault();
          void perform(() => api.delete(selected.id));
        }
      }}
    >
      <Sidebar
        filter={filter}
        total={data.total}
        pinned={data.pinned}
        paused={data.settings.paused}
        native={native}
        busy={busy}
        onFilter={(next) => {
          setFilter(next);
          setSelectedId(null);
        }}
        onPause={() =>
          void perform(() =>
            api.save({ ...data.settings, paused: !data.settings.paused }),
          )
        }
        onSettings={() => setSettingsOpen(true)}
        onDrag={() => void api.drag().catch(report)}
      />
      <div className="main-panel">
        <header
          className="content-header"
          onMouseDown={(e) => {
            if (
              e.button === 0 &&
              !(e.target as HTMLElement).closest("button, input")
            )
              void api.drag().catch(report);
          }}
        >
          <div className="heading-group">
            <h1>剪贴板记录</h1>
            <span className="view-context">
              {query
                ? "搜索结果"
                : {
                    all: "",
                    text: "文本",
                    image: "图像",
                    files: "文件",
                    pinned: "收藏",
                  }[filter]}
            </span>
            <span className="result-count" aria-live="polite">
              {data.entries.length} 条
            </span>
          </div>
          <div className="header-actions">
            <div className="search-box">
              <Search size={16} strokeWidth={1.7} />
              <input
                ref={search}
                aria-label="搜索剪贴板"
                placeholder="搜索记录…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedId(null);
                }}
              />
              {query ? (
                <button
                  className="icon-button"
                  aria-label="清除搜索"
                  onClick={() => {
                    setQuery("");
                    search.current?.focus();
                  }}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
            </div>
            <button
              className="icon-button clear-button"
              aria-label="清空所有记录"
              title="清空所有记录"
              disabled={!data.total || busy}
              onClick={() => setClearOpen(true)}
            >
              <Trash2 size={16} />
            </button>
            <button
              className="icon-button hide-button"
              aria-label="收起窗口"
              title="收起窗口 · Esc"
              onClick={() => void api.hide().catch(report)}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        {!native && (
          <div className="preview-banner">
            <span>浏览器预览 · 系统功能需在 macOS 客户端使用</span>
            <button onClick={loadDemo}>载入示例</button>
          </div>
        )}
        <div className="history-region">
          <section
            className="history-list"
            role="listbox"
            aria-label="剪贴板记录"
            aria-activedescendant={selected ? `entry-${selected.id}` : undefined}
            tabIndex={0}
          >
            {loading ? (
              <div className="empty-state">
                <ClipboardList size={34} />
                <h2>正在读取记录…</h2>
              </div>
            ) : data.entries.length ? (
              data.entries.map((entry) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={() => setSelectedId(entry.id)}
                  onUse={() =>
                    useEntry(entry.id, data.settings.doubleClickAction)
                  }
                  onDelete={() => void perform(() => api.delete(entry.id))}
                  onError={report}
                />
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  {query ? (
                    <Search size={28} strokeWidth={1.5} />
                  ) : filter === "pinned" ? (
                    <Star size={28} strokeWidth={1.5} />
                  ) : (
                    <ClipboardList size={28} strokeWidth={1.5} />
                  )}
                </div>
                <h2>
                  {query
                    ? "无匹配记录"
                    : filter === "pinned"
                      ? "暂无收藏"
                      : "暂无记录"}
                </h2>
                <p>
                  {query
                    ? "修改关键词或切换分类。"
                    : filter === "pinned"
                      ? "选中记录后，点击底部的收藏按钮。"
                      : data.settings.paused
                        ? "记录已暂停，恢复后将保存新复制的内容。"
                        : native
                          ? "复制文本、图像或文件后，记录将显示在此处。"
                          : "在 macOS 客户端复制内容后，记录将显示在此处。"}
                </p>
                {query && (
                  <button
                    className="button secondary"
                    onClick={() => setQuery("")}
                  >
                    清除搜索
                  </button>
                )}
                {!native && !data.total && (
                  <button className="button secondary" onClick={loadDemo}>
                    载入示例
                  </button>
                )}
              </div>
            )}
          </section>
        <div className="history-focus-ring" aria-hidden="true" />
        </div>
        <ActionBar
          entry={selected}
          busy={busy}
          enterAction={data.settings.enterAction}
          shortcut={data.settings.shortcut}
          onSettings={() => setSettingsOpen(true)}
          onUse={(action) => selected && useEntry(selected.id, action)}
          onPin={() => selected && void perform(() => api.pin(selected.id))}
        />
      </div>
      {notice && (
        <div
          className={`toast ${notice.error ? "error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setNotice(undefined)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {settingsOpen && (
        <SettingsPanel
          settings={data.settings}
          onClose={closeSettings}
          onSave={async (value) => {
            const outcome = await api.save(value);
            await refresh();
            if (outcome.shortcutActive)
              setNotice({ text: "设置已保存", error: false });
            return outcome;
          }}
        />
      )}
      {clearOpen && (
        <Modal title="清空所有记录？" onClose={closeClear}>
          <p className="confirm-copy">
            将删除全部 {data.total} 条记录
            {data.pinned ? `，包括 ${data.pinned} 条收藏` : ""}
            。此操作无法撤销。系统剪贴板和原文件不受影响。
          </p>
          <div className="confirm-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={closeClear}
            >
              取消
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await api.clear();
                  setClearOpen(false);
                  setNotice({ text: "记录已全部清空", error: false });
                })
              }
            >
              {busy ? "清空中…" : "清空所有记录"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
