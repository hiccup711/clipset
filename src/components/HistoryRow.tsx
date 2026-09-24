import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Star, Trash2 } from "lucide-react";
import type { Entry } from "../types";
import { api } from "../bridge";
import { relativeTime } from "../format";
import { EntryIcon, entryMetric } from "./EntryIcon";
interface Props {
  entry: Entry;
  selected: boolean;
  onSelect: () => void;
  onUse: () => void;
  onDelete: () => void;
  onError: (error: unknown) => void;
}
export function HistoryRow({
  entry,
  selected,
  onSelect,
  onUse,
  onDelete,
  onError,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string>();
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || expanded || entry.kind !== "text") return;
    const measure = () => {
      const elements = body.querySelectorAll(".entry-text");
      setClipped(
        Array.from(elements).some(
          (element) => element.scrollHeight > element.clientHeight + 1,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [expanded, entry.kind, entry.preview]);
  const canExpand =
    entry.kind === "image" ||
    (entry.kind === "text" &&
      (clipped || entry.charCount > Array.from(entry.preview).length));
  async function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setLoading(true);
    try {
      if (!content) setContent((await api.content(entry.id)).content);
      setExpanded(true);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }
  return (
    <article
      id={`entry-${entry.id}`}
      className={`history-row ${selected ? "selected" : ""} ${expanded ? "expanded" : ""}`}
      role="option"
      aria-selected={selected}
      aria-label={
        entry.kind === "image"
          ? `图片 ${entry.width} × ${entry.height}`
          : entry.preview.slice(0, 80)
      }
      onClick={onSelect}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) onUse();
      }}
    >
      <EntryIcon entry={entry} />
      <div className="entry-body" ref={bodyRef}>
        {entry.kind === "image" ? (
          <div className="image-content">
            <img
              src={`data:image/png;base64,${expanded && content ? content : entry.preview}`}
              alt={`剪贴板图片 ${entry.width} × ${entry.height}`}
            />
          </div>
        ) : entry.kind === "files" ? (
          <div className="entry-title file-names">{entry.preview}</div>
        ) : (
          <div className="entry-text">
            {expanded ? content ?? entry.preview : entry.preview}
          </div>
        )}
        <div className="row-meta">
          <span className="source-name">{entry.source}</span>
          <span className="meta-dot">·</span>
          <span title={new Date(entry.createdAt).toLocaleString()}>
            {relativeTime(entry.createdAt)}
          </span>
          {entry.pinned && (
            <Star size={11} className="pinned-mark" fill="currentColor" />
          )}
          {canExpand && (
            <button
              className="expand-button"
              onClick={(e) => {
                e.stopPropagation();
                void toggleExpand();
              }}
              disabled={loading}
            >
              {loading ? "加载中" : expanded ? "收起" : "展开"}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>
      <div className="entry-trailing">
        <span className="entry-metric">{entryMetric(entry)}</span>
        <button
          className="row-delete"
          title="删除记录"
          aria-label="删除这条记录"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}
