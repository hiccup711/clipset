import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Keyboard, ShieldCheck } from "lucide-react";
import { Modal } from "./Modal";
import { api, native } from "../bridge";
import {
  DoubleTapRecorder,
  doubleTapKeys,
  shortcutFromEvent,
  shortcutLabel,
} from "../format";
import type { Settings, Action, SaveOutcome } from "../types";
export function SettingsPanel({
  settings,
  onClose,
  onSave,
}: {
  settings: Settings;
  onClose: () => void;
  onSave: (value: Settings) => Promise<SaveOutcome>;
}) {
  const [draft, setDraft] = useState(settings);
  const [recording, setRecording] = useState(false);
  const [trusted, setTrusted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pendingPermission, setPendingPermission] = useState(false);
  const tapRecorder = useRef(new DoubleTapRecorder());
  const doubleTap = draft.shortcut.startsWith("DoubleTap:");
  useEffect(() => {
    void api.suspendShortcut(true).catch((e) => setError(String(e)));
    return () => {
      void api.suspendShortcut(false).catch(console.error);
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void api
      .subscribe("shortcut-ready", () => {
        setPendingPermission(false);
        setFeedback("辅助功能已授权，双击快捷键已启用。");
      })
      .then((fn) => {
        if (disposed) fn();
        else cleanup = fn;
      })
      .catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const check = () => {
      void api
        .trusted()
        .then((v) => {
          if (active) setTrusted(v);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    };
    check();
    const timer = setInterval(check, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function save() {
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const outcome = await onSave(draft);
      if (outcome.shortcutActive) onClose();
      else {
        setPendingPermission(true);
        setFeedback(outcome.message ?? "设置已保存，快捷键等待授权后启用。");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="偏好设置" onClose={onClose} drawer>
      <div className="settings-body">
        <p className="settings-intro">设置快捷键、默认操作与记录保留数量。</p>
        <section className="settings-section">
          <h3>快捷操作</h3>
          <label className="setting-row">
            <span>按回车键</span>
            <select
              value={draft.enterAction}
              onChange={(e) =>
                setDraft({ ...draft, enterAction: e.target.value as Action })
              }
            >
              <option value="paste">粘贴到原应用</option>
              <option value="copy">仅复制</option>
            </select>
          </label>
          <label className="setting-row">
            <span>鼠标双击</span>
            <select
              value={draft.doubleClickAction}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  doubleClickAction: e.target.value as Action,
                })
              }
            >
              <option value="paste">粘贴到原应用</option>
              <option value="copy">仅复制</option>
            </select>
          </label>
          <label className="setting-row">
            <span>全局调起方式</span>
            <select
              aria-label="全局调起方式"
              value={doubleTap ? "double" : "chord"}
              onChange={(e) => {
                setRecording(false);
                tapRecorder.current.reset();
                setDraft({
                  ...draft,
                  shortcut:
                    e.target.value === "double"
                      ? "DoubleTap:Space"
                      : "CommandOrControl+Shift+V",
                });
              }}
            >
              <option value="chord">组合键</option>
              <option value="double">双击按键</option>
            </select>
          </label>
          {doubleTap && (
            <label className="setting-row">
              <span>双击按键</span>
              <select
                aria-label="双击按键"
                value={draft.shortcut.slice(10)}
                onChange={(e) => {
                  setRecording(false);
                  tapRecorder.current.reset();
                  setDraft({
                    ...draft,
                    shortcut: `DoubleTap:${e.target.value}`,
                  });
                }}
              >
                {doubleTapKeys.map((key) => (
                  <option key={key} value={key}>
                    {key === "CapsLock" ? "Caps Lock" : key}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="setting-row">
            <span>{doubleTap ? "按键录入" : "全局调起快捷键"}</span>
            <button
              aria-label="录入全局快捷键"
              className={`shortcut-recorder ${recording ? "recording" : ""}`}
              onClick={() => {
                tapRecorder.current.reset();
                setRecording(true);
              }}
              onBlur={() => {
                tapRecorder.current.reset();
                setRecording(false);
              }}
              onKeyDown={(e) => {
                if (!recording) return;
                e.preventDefault();
                e.stopPropagation();
                const value = doubleTap
                  ? tapRecorder.current.event(
                      e.nativeEvent,
                      true,
                      performance.now(),
                    )
                  : e.repeat
                    ? null
                    : shortcutFromEvent(e.nativeEvent);
                if (value) {
                  setDraft({ ...draft, shortcut: value });
                  setRecording(false);
                }
              }}
              onKeyUp={(e) => {
                if (!recording || !doubleTap) return;
                e.preventDefault();
                e.stopPropagation();
                const value = tapRecorder.current.event(
                  e.nativeEvent,
                  false,
                  performance.now(),
                );
                if (value) {
                  setDraft({ ...draft, shortcut: value });
                  setRecording(false);
                }
              }}
            >
              <Keyboard size={15} />
              {recording
                ? doubleTap
                  ? "请连续按同一键两次…"
                  : "请按下组合键…"
                : shortcutLabel(draft.shortcut)}
            </button>
          </div>
          <p className="setting-hint">
            {doubleTap
              ? "在 450 毫秒内连续按同一个键两次并松开。支持 Space、Command、Control、Option、Caps Lock；不支持字母、Esc 和退格键。也可直接从列表选择。"
              : "点击快捷键后录入新组合，至少包含 ⌘、⌃ 或 ⌥。"}
          </p>
          {doubleTap && (
            <p className="setting-hint">
              全局双击需要辅助功能权限。按键仍会传给当前应用；Space
              可能输入空格，Caps Lock 保留系统大小写或输入法切换行为。
            </p>
          )}
        </section>
        <section className="settings-section">
          <h3>记录与存储</h3>
          <label className="setting-row">
            <span>保留最近记录</span>
            <select
              value={draft.historyLimit}
              onChange={(e) =>
                setDraft({ ...draft, historyLimit: Number(e.target.value) })
              }
            >
              {[100, 500, 1000, 5000].map((n) => (
                <option value={n} key={n}>
                  {n.toLocaleString()} 条
                </option>
              ))}
            </select>
          </label>
          <p className="setting-hint">
            超出数量或 128 MB 内容预算时清理最早记录；收藏保留，最多 100
            条。降低上限会立即清理。
          </p>
          <label className="setting-row">
            <span>暂停记录</span>
            <input
              type="checkbox"
              role="switch"
              checked={draft.paused}
              onChange={(e) => setDraft({ ...draft, paused: e.target.checked })}
            />
          </label>
        </section>
        <section className="settings-section">
          <h3>辅助功能权限</h3>
          <div className="permission-line">
            <ShieldCheck size={18} />
            <span>{trusted ? "辅助功能已授权" : "需要辅助功能权限"}</span>
            {trusted && <Check size={16} className="success-icon" />}
          </div>
          <p className="setting-hint">
            用于双击快捷键监听、切回原应用并执行粘贴。仅使用组合键与复制不需要此权限。请在系统设置中为
            Clipset 开启。若系统开关已开启但这里仍显示未授权，请移除旧条目，重新添加当前 Clipset.app 并重启应用。
          </p>
          <button
            className="button secondary permission-button"
            disabled={!native}
            onClick={() => {
              void api.permissions().catch((e) => setError(String(e)));
            }}
          >
            打开系统设置 <ExternalLink size={14} />
          </button>
        </section>
        <p className="privacy-note">
          记录仅保存在这台
          Mac，不上传。自动跳过标记为私密或临时的剪贴板内容。图片单条上限 16
          MB；文件仅保存引用。
        </p>
      </div>
      {(error || feedback) && (
        <div
          className={`settings-feedback ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <p>{error || feedback}</p>
          {pendingPermission && native && !trusted && (
            <button
              className="button secondary"
              onClick={() => {
                void api.permissions().catch((e) => setError(String(e)));
              }}
            >
              打开辅助功能设置 <ExternalLink size={14} />
            </button>
          )}
        </div>
      )}
      <div className="settings-footer">
        <span>
          Clipset <span className="muted">0.2.8</span>
        </span>
        <button
          className="button primary"
          disabled={saving || recording}
          onClick={() => void save()}
        >
          {saving ? "保存中…" : "保存设置"}
        </button>
      </div>
    </Modal>
  );
}
