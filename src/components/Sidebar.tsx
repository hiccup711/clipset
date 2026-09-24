import {
  Copy,
  Files,
  FileText,
  Folder,
  Image,
  Pause,
  Play,
  Settings2,
  Star,
} from "lucide-react";
import type { Filter } from "../types";
const categories = [
  { id: "all", label: "全部记录", icon: Files },
  { id: "text", label: "文本", icon: FileText },
  { id: "image", label: "图像", icon: Image },
  { id: "files", label: "文件", icon: Folder },
  { id: "pinned", label: "收藏", icon: Star },
] as const;
interface Props {
  filter: Filter;
  total: number;
  pinned: number;
  paused: boolean;
  native: boolean;
  busy: boolean;
  onFilter: (filter: Filter) => void;
  onPause: () => void;
  onSettings: () => void;
  onDrag: () => void;
}
export function Sidebar(props: Props) {
  return (
    <aside className="sidebar" aria-label="导航">
      <div
        className="brand"
        title="Clipset · 剪贴板管理"
        onMouseDown={(e) => {
          if (e.button === 0) props.onDrag();
        }}
      >
        <Copy
          className="brand-mark"
          size={23}
          strokeWidth={1.6}
          aria-label="Clipset"
        />
      </div>
      <nav className="category-nav" aria-label="内容分类">
        {categories.map((category) => (
          <button
            key={category.id}
            className={`nav-item ${category.id === props.filter ? "active" : ""} ${category.id === "pinned" ? "favorites-nav" : ""}`}
            aria-pressed={category.id === props.filter}
            aria-label={category.label}
            title={`${category.label}${category.id === "all" ? ` · ${props.total} 条` : category.id === "pinned" ? ` · ${props.pinned} 条` : ""}`}
            onClick={() => props.onFilter(category.id)}
          >
            <category.icon size={18} strokeWidth={1.7} />
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div
          className="recording-status"
          title={
            !props.native ? "界面预览" : props.paused ? "已暂停记录" : "记录中"
          }
        >
          <span
            className={`status-dot ${props.paused || !props.native ? "paused" : ""}`}
          />
          <button
            className="sidebar-icon"
            aria-label={props.paused ? "继续记录" : "暂停记录"}
            title={props.paused ? "继续记录" : "暂停记录"}
            disabled={props.busy}
            onClick={props.onPause}
          >
            {props.paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>
        <button
          className="settings-nav"
          aria-label="偏好设置"
          title="偏好设置"
          onClick={props.onSettings}
        >
          <Settings2 size={18} strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  );
}
