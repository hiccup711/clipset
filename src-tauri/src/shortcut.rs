use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

pub const DOUBLE_TAP_MS: u64 = 450;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TapKey {
    Space,
    Command,
    Control,
    Option,
    CapsLock,
}
impl TapKey {
    fn matches(self, code: u16) -> bool {
        match self {
            Self::Space => code == 49,
            Self::Command => matches!(code, 54 | 55),
            Self::Control => matches!(code, 59 | 62),
            Self::Option => matches!(code, 58 | 61),
            Self::CapsLock => code == 57,
        }
    }
}
pub enum Trigger {
    Chord(Shortcut),
    Double(TapKey),
}
impl Trigger {
    pub fn parse(value: &str) -> Result<Self, String> {
        if let Some(key) = value.strip_prefix("DoubleTap:") {
            return Ok(Self::Double(match key {
                "Space" => TapKey::Space,
                "Command" => TapKey::Command,
                "Control" => TapKey::Control,
                "Option" => TapKey::Option,
                "CapsLock" => TapKey::CapsLock,
                _ => {
                    return Err(
                        "双击按键仅支持 Space、Command、Control、Option 和 Caps Lock".into(),
                    )
                }
            }));
        }
        let shortcut = Shortcut::from_str(value).map_err(|_| "快捷键格式无效")?;
        if !value.split('+').any(|part| {
            matches!(
                part.to_lowercase().as_str(),
                "commandorcontrol" | "command" | "control" | "alt" | "super"
            )
        }) {
            return Err("组合键至少需要 ⌘、⌃ 或 ⌥ 修饰键".into());
        }
        Ok(Self::Chord(shortcut))
    }
}

/// Two complete taps of the same physical key, measured from first down to final up.
/// No text is retained; unrelated keys and long presses invalidate the sequence.
pub struct DoubleTap {
    key: TapKey,
    down: Option<(u16, u64)>,
    previous: Option<(u16, u64)>,
}
impl DoubleTap {
    pub fn new(key: TapKey) -> Self {
        Self {
            key,
            down: None,
            previous: None,
        }
    }
    pub fn reset(&mut self) {
        self.down = None;
        self.previous = None;
    }
    pub fn event(
        &mut self,
        code: u16,
        down: bool,
        repeat: bool,
        modified: bool,
        time: u64,
    ) -> bool {
        if repeat || modified || !self.key.matches(code) {
            self.reset();
            return false;
        }
        if down {
            if self.down.is_some() {
                self.reset();
            } else {
                self.down = Some((code, time));
            }
            return false;
        }
        let Some((pressed_code, pressed_at)) = self.down.take() else {
            self.reset();
            return false;
        };
        if pressed_code != code || time.saturating_sub(pressed_at) > DOUBLE_TAP_MS {
            self.reset();
            return false;
        }
        if self.previous.is_some_and(|(previous_code, started)| {
            previous_code == code && time >= started && time - started <= DOUBLE_TAP_MS
        }) {
            self.reset();
            return true;
        }
        self.previous = Some((code, pressed_at));
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tap(d: &mut DoubleTap, key: u16, start: u64) -> bool {
        assert!(!d.event(key, true, false, false, start));
        d.event(key, false, false, false, start + 30)
    }
    #[test]
    fn accepts_only_supported_double_keys() {
        for key in ["Space", "Command", "Control", "Option", "CapsLock"] {
            assert!(matches!(
                Trigger::parse(&format!("DoubleTap:{key}")),
                Ok(Trigger::Double(_))
            ));
        }
        for key in [
            "A",
            "Z",
            "Escape",
            "Backspace",
            "Shift",
            "Enter",
            "",
            "Space+Space",
        ] {
            assert!(Trigger::parse(&format!("DoubleTap:{key}")).is_err());
        }
        assert!(Trigger::parse("CommandOrControl+Shift+V").is_ok());
        assert!(Trigger::parse("Space").is_err());
    }
    #[test]
    fn recognizes_all_supported_keys_and_fires_once_per_pair() {
        for (key, code) in [
            (TapKey::Space, 49),
            (TapKey::Command, 55),
            (TapKey::Command, 54),
            (TapKey::Control, 59),
            (TapKey::Control, 62),
            (TapKey::Option, 58),
            (TapKey::Option, 61),
            (TapKey::CapsLock, 57),
        ] {
            let mut d = DoubleTap::new(key);
            assert!(!tap(&mut d, code, 100));
            assert!(tap(&mut d, code, 250));
            assert!(!tap(&mut d, code, 350));
        }
    }
    #[test]
    fn rejects_holds_repeats_foreign_keys_and_modified_taps() {
        for (code, down, repeat, modified) in [
            (49, true, true, false),
            (0, true, false, false),
            (49, true, false, true),
        ] {
            let mut d = DoubleTap::new(TapKey::Space);
            tap(&mut d, 49, 0);
            assert!(!d.event(code, down, repeat, modified, 100));
            assert!(!tap(&mut d, 49, 200));
        }
        let mut d = DoubleTap::new(TapKey::Space);
        d.event(49, true, false, false, 0);
        assert!(!d.event(49, false, false, false, 600));
        assert!(!tap(&mut d, 49, 650));
    }
    #[test]
    fn rejects_slow_taps_and_switching_sides() {
        let mut d = DoubleTap::new(TapKey::Command);
        assert!(!tap(&mut d, 55, 0));
        assert!(!tap(&mut d, 55, 500));
        assert!(!tap(&mut d, 54, 600));
        assert!(tap(&mut d, 54, 700));
    }
}
