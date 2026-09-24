import { describe, expect, it } from "vitest";
import { DoubleTapRecorder, shortcutFromEvent, shortcutLabel } from "./format";
describe("shortcut recording", () => {
  it("uses physical keys when Option changes the typed character", () => {
    expect(
      shortcutFromEvent({
        code: "KeyV",
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        altKey: true,
      }),
    ).toBe("CommandOrControl+Alt+Shift+V");
  });
  it("does not register ordinary typing or a modifier key alone", () => {
    expect(
      shortcutFromEvent({
        code: "KeyV",
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
      }),
    ).toBeNull();
    expect(
      shortcutFromEvent({
        code: "MetaLeft",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      }),
    ).toBeNull();
  });
});

describe("double-tap recording", () => {
  const event = (code: string, repeat = false) => ({
    code,
    repeat,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  });
  const tap = (recorder: DoubleTapRecorder, code: string, time: number) => {
    expect(recorder.event(event(code), true, time)).toBeNull();
    return recorder.event(event(code), false, time + 30);
  };
  it("records all five allowed keys after two released taps", () => {
    for (const [code, key] of [
      ["Space", "Space"],
      ["MetaLeft", "Command"],
      ["ControlRight", "Control"],
      ["AltLeft", "Option"],
      ["CapsLock", "CapsLock"],
    ]) {
      const recorder = new DoubleTapRecorder();
      expect(tap(recorder, code, 0)).toBeNull();
      expect(tap(recorder, code, 200)).toBe(`DoubleTap:${key}`);
      expect(tap(recorder, code, 300)).toBeNull();
    }
  });
  it("excludes all letters, Escape, Backspace and unsupported keys", () => {
    for (const code of [
      ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (key) => `Key${key}`),
      "Escape",
      "Backspace",
      "ShiftLeft",
      "Enter",
      "Digit1",
    ]) {
      const recorder = new DoubleTapRecorder();
      expect(tap(recorder, code, 0)).toBeNull();
      expect(tap(recorder, code, 200)).toBeNull();
    }
  });
  it("rejects repeats, long holds and intervening keys", () => {
    const recorder = new DoubleTapRecorder();
    tap(recorder, "Space", 0);
    recorder.event(event("Space", true), true, 100);
    expect(tap(recorder, "Space", 200)).toBeNull();
    recorder.event(event("KeyA"), true, 240);
    expect(tap(recorder, "Space", 270)).toBeNull();
    recorder.event(event("Space"), true, 320);
    expect(recorder.event(event("Space"), false, 1000)).toBeNull();
    expect(tap(recorder, "Space", 1050)).toBeNull();
  });
  it("does not combine sides or a modifier chord into a double tap", () => {
    const recorder = new DoubleTapRecorder();
    tap(recorder, "MetaLeft", 0);
    expect(tap(recorder, "MetaRight", 100)).toBeNull();
    recorder.event({ ...event("MetaRight"), ctrlKey: true }, true, 150);
    expect(tap(recorder, "MetaRight", 200)).toBeNull();
    expect(tap(recorder, "MetaRight", 800)).toBeNull();
  });
  it("formats saved double-tap settings", () => {
    expect(shortcutLabel("DoubleTap:Space")).toBe("双击 Space");
    expect(shortcutLabel("DoubleTap:CapsLock")).toBe("双击 Caps Lock");
    expect(shortcutLabel("CommandOrControl+Shift+V")).toBe("⌘ ⇧ V");
  });
});
