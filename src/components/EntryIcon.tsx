import { FileText, Image, Link2, Terminal } from "lucide-react";
import type { Entry } from "../types";
export function kindLabel(entry: Entry) {
  return { text: "文本", image: "图像", files: "文件" }[entry.kind];
}
export function entryMetric(entry: Entry) {
  return entry.kind === "text"
    ? `${entry.charCount.toLocaleString()} 字符`
    : entry.kind === "image"
      ? `${entry.width} × ${entry.height}`
      : `${entry.preview.split("\n").length} 个文件`;
}
export function EntryIcon({
  entry,
  small = false,
}: {
  entry: Entry;
  small?: boolean;
}) {
  const isLink =
    entry.kind === "text" && /^https?:\/\/\S+$/.test(entry.preview.trim());
  const isTerminal =
    entry.kind === "text" && /Terminal|iTerm/i.test(entry.source);
  const Icon =
    entry.kind === "image"
      ? Image
      : isLink
        ? Link2
        : isTerminal
          ? Terminal
          : FileText;
  return (
    <span
      className={`entry-icon ${entry.kind} ${isTerminal ? "terminal" : ""} ${isLink ? "link" : ""} ${small ? "small" : ""}`}
    >
      <Icon size={small ? 17 : 21} strokeWidth={1.6} />
    </span>
  );
}
