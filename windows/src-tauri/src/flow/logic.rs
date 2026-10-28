// The key logic of Flow dictation, with nothing from the OS in it. Port of
// FlowKeyLogic.swift.
//
// - Hold the key: Bifrost listens. Release it: the words are pasted where you type.
// - Two quick taps: hands-free, until the next tap.
// - Esc, or another key pressed while the key is held (a shortcut such as
//   Ctrl+C), cancels.
//
// Listening starts on the first press, so a word said right away is not lost; a
// press too short to be a hold waits a moment for the second tap, and is
// dropped if none comes.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Phase {
    Idle,
    Holding { since: f64 },
    TapWait { until: f64 },
    Locked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    None,
    /// Open the microphone and show the pill.
    Start,
    /// Hands-free: keep listening after the key is released.
    Lock,
    /// Stop listening and paste what was said.
    Finish,
    /// Stop listening and paste nothing.
    Cancel,
    /// The last listen was dropped (too short) and a new one begins.
    Restart,
}

/// A press shorter than this is a tap.
pub const HOLD_THRESHOLD: f64 = 0.30;
/// The second tap of a double tap comes within this.
pub const DOUBLE_TAP_WINDOW: f64 = 0.40;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct KeyLogic {
    phase: Phase,
}

impl Default for KeyLogic {
    fn default() -> Self {
        Self { phase: Phase::Idle }
    }
}

impl KeyLogic {
    #[cfg(test)]
    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn is_active(&self) -> bool {
        self.phase != Phase::Idle
    }

    pub fn key_down(&mut self, t: f64) -> Action {
        match self.phase {
            Phase::Idle => {
                self.phase = Phase::Holding { since: t };
                Action::Start
            }
            Phase::Holding { .. } => Action::None, // key repeat
            Phase::TapWait { until } => {
                if t <= until {
                    self.phase = Phase::Locked;
                    Action::Lock
                } else {
                    // The wait ran out unnoticed: start afresh.
                    self.phase = Phase::Holding { since: t };
                    Action::Restart
                }
            }
            Phase::Locked => {
                self.phase = Phase::Idle;
                Action::Finish
            }
        }
    }

    pub fn key_up(&mut self, t: f64) -> Action {
        let Phase::Holding { since } = self.phase else { return Action::None };
        if t - since >= HOLD_THRESHOLD {
            self.phase = Phase::Idle;
            return Action::Finish;
        }
        self.phase = Phase::TapWait { until: t + DOUBLE_TAP_WINDOW };
        Action::None
    }

    /// Another key while the key is held, or between the two taps: it was a
    /// shortcut, not dictation.
    pub fn other_key(&mut self) -> Action {
        match self.phase {
            Phase::Holding { .. } | Phase::TapWait { .. } => {
                self.phase = Phase::Idle;
                Action::Cancel
            }
            Phase::Idle | Phase::Locked => Action::None,
        }
    }

    pub fn escape(&mut self) -> Action {
        if self.phase == Phase::Idle {
            return Action::None;
        }
        self.phase = Phase::Idle;
        Action::Cancel
    }

    /// Called when the double-tap window may have run out.
    pub fn tick(&mut self, t: f64) -> Action {
        match self.phase {
            Phase::TapWait { until } if t > until => {
                self.phase = Phase::Idle;
                Action::Cancel
            }
            _ => Action::None,
        }
    }

    /// Hands-free straight away (the pill's microphone button).
    pub fn lock(&mut self) {
        self.phase = Phase::Locked;
    }

    /// The listen ended on its own (no microphone, nothing heard…).
    pub fn reset(&mut self) {
        self.phase = Phase::Idle;
    }
}

/// The keys held to dictate: up to four Windows virtual-key codes, all held at
/// once ("chord"). A side-specific code (0xA2 left Ctrl) needs that key; a
/// generic one (0x11 Ctrl, 0x12 Alt, 0x10 Shift, 0x5B Win) takes either side.
/// Written as the old ids ("right_ctrl", "left_ctrl_super"…) when it is one of
/// them, else "chord:a2+5b". Default: Ctrl + Win (left), on every keyboard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FlowKey {
    pub keys: [u16; 4],
}

#[allow(non_upper_case_globals)]
impl FlowKey {
    pub const RightCtrl: FlowKey = FlowKey { keys: [0xA3, 0, 0, 0] };
    pub const RightAlt: FlowKey = FlowKey { keys: [0xA5, 0, 0, 0] };
    pub const RightShift: FlowKey = FlowKey { keys: [0xA1, 0, 0, 0] };
    pub const LeftCtrlSuper: FlowKey = FlowKey { keys: [0xA2, 0x5B, 0, 0] };

    const NAMED: [(&'static str, FlowKey); 4] = [
        ("right_ctrl", Self::RightCtrl),
        ("right_alt", Self::RightAlt),
        ("right_shift", Self::RightShift),
        ("left_ctrl_super", Self::LeftCtrlSuper),
    ];

    /// The held keys, without the empty slots.
    pub fn codes(&self) -> impl Iterator<Item = u16> + '_ {
        self.keys.iter().copied().filter(|k| *k != 0)
    }

    /// A chord from key codes (sorted, de-duplicated, at most four).
    pub fn from_codes(codes: &[u16]) -> Option<FlowKey> {
        let mut v: Vec<u16> = codes.iter().copied().filter(|k| *k != 0).collect();
        v.sort_unstable();
        v.dedup();
        if v.is_empty() || v.len() > 4 {
            return None;
        }
        let mut keys = [0u16; 4];
        keys[..v.len()].copy_from_slice(&v);
        // The named keys keep their own order (and id).
        let k = FlowKey { keys };
        Some(Self::NAMED.iter().map(|(_, n)| *n).find(|n| n.sorted() == k).unwrap_or(k))
    }

    fn sorted(&self) -> FlowKey {
        let mut v: Vec<u16> = self.codes().collect();
        v.sort_unstable();
        let mut keys = [0u16; 4];
        keys[..v.len()].copy_from_slice(&v);
        FlowKey { keys }
    }

    pub fn id(&self) -> String {
        if let Some((n, _)) = Self::NAMED.iter().find(|(_, k)| k == self) {
            return (*n).to_string();
        }
        format!("chord:{}", self.codes().map(|c| format!("{c:x}")).collect::<Vec<_>>().join("+"))
    }

    pub fn parse(id: &str) -> Option<FlowKey> {
        if let Some((_, k)) = Self::NAMED.iter().find(|(n, _)| *n == id) {
            return Some(*k);
        }
        let rest = id.strip_prefix("chord:")?;
        let codes: Option<Vec<u16>> = rest.split('+').map(|c| u16::from_str_radix(c, 16).ok()).collect();
        Self::from_codes(&codes?)
    }

    /// One key code's name ("Left Ctrl", "Win", "F8"…), the same in every language.
    pub fn code_label(code: u16) -> String {
        let win = if cfg!(windows) { "Win" } else { "Super" };
        match code {
            0x10 => "Shift".into(),
            0x11 => "Ctrl".into(),
            0x12 => "Alt".into(),
            0x5B | 0x5C => win.into(),
            0xA0 => "Left Shift".into(),
            0xA1 => "Right Shift".into(),
            0xA2 => "Ctrl".into(),
            0xA3 => "Right Ctrl".into(),
            0xA4 => "Alt".into(),
            0xA5 => "Right Alt".into(),
            0x14 => "Caps Lock".into(),
            0x20 => "Space".into(),
            0x70..=0x87 => format!("F{}", code - 0x6F),
            0x30..=0x39 | 0x41..=0x5A => ((code as u8) as char).to_string(),
            0x5D => "Menu".into(),
            0x91 => "Scroll Lock".into(),
            0x13 => "Pause".into(),
            0x2D => "Insert".into(),
            0xC0 => "`".into(),
            _ => format!("0x{code:02X}"),
        }
    }

    /// How the key is written in the interface (the same in every language).
    pub fn label(self) -> String {
        if self == Self::LeftCtrlSuper {
            return if cfg!(windows) { "Ctrl + Win".into() } else { "Ctrl + Super".into() };
        }
        // Modifiers first (Ctrl, Alt, Shift, Win), then the rest.
        let rank = |c: u16| match c { 0x11 | 0xA2 | 0xA3 => 0, 0x12 | 0xA4 | 0xA5 => 1, 0x10 | 0xA0 | 0xA1 => 2, 0x5B | 0x5C => 3, _ => 4 };
        let mut v: Vec<u16> = self.codes().collect();
        v.sort_by_key(|c| rank(*c));
        v.into_iter().map(Self::code_label).collect::<Vec<_>>().join(" + ")
    }
}

impl Default for FlowKey {
    fn default() -> Self {
        Self::LeftCtrlSuper
    }
}

impl Serialize for FlowKey {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.id())
    }
}

impl<'de> Deserialize<'de> for FlowKey {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let id = String::deserialize(d)?;
        Ok(FlowKey::parse(&id).unwrap_or_default())
    }
}

/// Frequency bands for the pill's dots: low notes on the left, high on the right.
pub mod bands {
    pub const COUNT: usize = 9;
    pub const LOW_HZ: f64 = 90.0;
    pub const HIGH_HZ: f64 = 7000.0;

    /// The `count + 1` band edges in Hz, spaced evenly on a log scale.
    pub fn edges(count: usize) -> Vec<f64> {
        (0..=count).map(|i| LOW_HZ * (HIGH_HZ / LOW_HZ).powf(i as f64 / count as f64)).collect()
    }

    /// The FFT bins [from, to) of each band, for `fft_size` samples at `sample_rate`.
    /// Each band has at least one bin.
    pub fn bin_ranges(fft_size: usize, sample_rate: f64, count: usize) -> Vec<(usize, usize)> {
        let bin_hz = sample_rate / fft_size as f64;
        let max_bin = fft_size / 2;
        let e = edges(count);
        let mut out = Vec::with_capacity(count);
        let mut last = 1;
        for i in 0..count {
            let from = last.max((e[i] / bin_hz).floor() as usize);
            let to = max_bin.min((from + 1).max((e[i + 1] / bin_hz).ceil() as usize));
            out.push((from, to));
            last = to;
        }
        out
    }

    /// A band's power in dB → 0…1 for the dot's height: silence stays low, a
    /// normal voice fills it.
    pub fn level(db: f64) -> f64 {
        let (floor, ceiling) = (-78.0, -30.0);
        ((db - floor) / (ceiling - floor)).clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hold_then_release_pastes() {
        let mut k = KeyLogic::default();
        assert_eq!(k.key_down(0.0), Action::Start);
        assert_eq!(k.key_down(0.1), Action::None); // key repeat
        assert_eq!(k.key_up(1.2), Action::Finish);
        assert!(!k.is_active());
    }

    #[test]
    fn two_quick_taps_go_hands_free_and_a_third_pastes() {
        let mut k = KeyLogic::default();
        assert_eq!(k.key_down(0.0), Action::Start);
        assert_eq!(k.key_up(0.1), Action::None);
        assert_eq!(k.key_down(0.3), Action::Lock);
        assert_eq!(k.key_up(0.35), Action::None);
        assert_eq!(k.phase(), Phase::Locked);
        assert_eq!(k.key_down(5.0), Action::Finish);
    }

    #[test]
    fn a_lone_tap_is_dropped_once_the_window_runs_out() {
        let mut k = KeyLogic::default();
        k.key_down(0.0);
        k.key_up(0.1);
        assert_eq!(k.tick(0.3), Action::None);
        assert_eq!(k.tick(0.6), Action::Cancel);
        assert!(!k.is_active());
        // A press after an unnoticed timeout starts afresh.
        let mut k = KeyLogic::default();
        k.key_down(0.0);
        k.key_up(0.1);
        assert_eq!(k.key_down(2.0), Action::Restart);
    }

    #[test]
    fn a_shortcut_or_esc_cancels() {
        let mut k = KeyLogic::default();
        k.key_down(0.0);
        assert_eq!(k.other_key(), Action::Cancel);
        let mut k = KeyLogic::default();
        k.lock();
        assert_eq!(k.other_key(), Action::None); // typing while hands-free is fine
        assert_eq!(k.escape(), Action::Cancel);
        assert_eq!(k.escape(), Action::None);
    }

    #[test]
    fn bands_cover_the_voice_from_low_to_high() {
        let e = bands::edges(9);
        assert_eq!(e.len(), 10);
        assert!((e[0] - 90.0).abs() < 1e-9 && (e[9] - 7000.0).abs() < 1e-6);
        let r = bands::bin_ranges(512, 16000.0, 9);
        assert_eq!(r.len(), 9);
        for (i, (from, to)) in r.iter().enumerate() {
            assert!(to > from, "band {i} is empty");
            if i > 0 {
                assert_eq!(*from, r[i - 1].1);
            }
        }
        assert_eq!(bands::level(-100.0), 0.0);
        assert_eq!(bands::level(0.0), 1.0);
    }
}

#[cfg(test)]
mod flow_key_tests {
    use super::FlowKey;

    #[test]
    fn named_keys_keep_their_ids_and_chords_round_trip() {
        assert_eq!(FlowKey::parse("right_ctrl"), Some(FlowKey::RightCtrl));
        assert_eq!(FlowKey::default(), FlowKey::LeftCtrlSuper);
        assert_eq!(FlowKey::from_codes(&[0x5B, 0xA2]).unwrap().id(), "left_ctrl_super");
        let k = FlowKey::from_codes(&[0x12, 0x11]).unwrap();
        assert_eq!(k.id(), "chord:11+12");
        assert_eq!(FlowKey::parse(&k.id()), Some(k));
        assert_eq!(k.label(), "Ctrl + Alt");
        let v: FlowKey = serde_json::from_str("\"nonsense\"").unwrap();
        assert_eq!(v, FlowKey::default());
    }
}
