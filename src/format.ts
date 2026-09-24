export function relativeTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}
export function shortcutLabel(shortcut: string) {
  if (shortcut.startsWith("DoubleTap:")) {
    return `双击 ${shortcut.slice(10) === "CapsLock" ? "Caps Lock" : shortcut.slice(10)}`;
  }
  return shortcut
    .split("+")
    .map(
      (key) =>
        ({
          CommandOrControl: "⌘",
          Command: "⌘",
          Super: "⌘",
          Control: "⌃",
          Alt: "⌥",
          Shift: "⇧",
          Space: "空格",
        })[key] ?? key,
    )
    .join(" ");
}

export const doubleTapKeys = [
  "Space",
  "Command",
  "Control",
  "Option",
  "CapsLock",
] as const;
type TapEvent = Pick<
  KeyboardEvent,
  "code" | "repeat" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;
function tapKey(event: TapEvent): string | null {
  const key = (
    {
      Space: "Space",
      MetaLeft: "Command",
      MetaRight: "Command",
      ControlLeft: "Control",
      ControlRight: "Control",
      AltLeft: "Option",
      AltRight: "Option",
      CapsLock: "CapsLock",
    } as Record<string, string>
  )[event.code];
  if (
    !key ||
    event.shiftKey ||
    (event.metaKey && key !== "Command") ||
    (event.ctrlKey && key !== "Control") ||
    (event.altKey && key !== "Option")
  )
    return null;
  return key;
}
export class DoubleTapRecorder {
  private down?: { code: string; time: number };
  private previous?: { code: string; time: number };
  reset() {
    this.down = undefined;
    this.previous = undefined;
  }
  event(event: TapEvent, down: boolean, time: number): string | null {
    const key = tapKey(event);
    if (!key || event.repeat) {
      this.reset();
      return null;
    }
    if (down) {
      if (this.down) this.reset();
      else this.down = { code: event.code, time };
      return null;
    }
    const pressed = this.down;
    this.down = undefined;
    if (!pressed || pressed.code !== event.code || time - pressed.time > 450) {
      this.reset();
      return null;
    }
    if (
      this.previous?.code === event.code &&
      time - this.previous.time <= 450
    ) {
      this.reset();
      return `DoubleTap:${key}`;
    }
    this.previous = pressed;
    return null;
  }
}
export function shortcutFromEvent(
  event: Pick<
    KeyboardEvent,
    "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "code"
  >,
): string | null {
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return null;
  const code = event.code;
  const key = /^Key[A-Z]$/.test(code)
    ? code.slice(3)
    : /^Digit[0-9]$/.test(code)
      ? code.slice(5)
      : code === "Space"
        ? "Space"
        : /^F([1-9]|1[0-9]|2[0-4])$/.test(code)
          ? code
          : null;
  if (!key) return null;
  return [
    event.metaKey && "CommandOrControl",
    event.ctrlKey && "Control",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    key,
  ]
    .filter(Boolean)
    .join("+");
}
