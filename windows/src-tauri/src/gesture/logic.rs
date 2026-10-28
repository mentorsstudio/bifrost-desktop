// A máquina de estados do gesto Ctrl + botão direito, sem nada do Windows, para
// ser testada. Regra de ouro: um botão direito que foi engolido tem o seu
// "soltar" engolido também, e nada além do botão direito é engolido — nenhuma
// tecla, então Ctrl/Alt nunca ficam presos.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    /// Ctrl + segurar o botão direito por `ms`; um toque rápido vira o
    /// clique direito normal (re-enviado).
    CtrlHold(u32),
    /// Ctrl + botão direito: abre na hora.
    Ctrl,
    /// Ctrl + Alt + botão direito.
    CtrlAlt,
    /// Alt + segurar o botão direito (para quem usa o Ctrl em outro app, como o Filee).
    AltHold(u32),
    /// Qualquer combinação gravada nos Ajustes: modificadores exatos (bits
    /// MOD_*), um botão do mouse (BTN_*) e, se `hold` > 0, segurar por `hold` ms.
    Custom { mods: u8, button: u8, hold: u32 },
}

pub const MOD_CTRL: u8 = 1;
pub const MOD_ALT: u8 = 2;
pub const MOD_SHIFT: u8 = 4;
pub const MOD_WIN: u8 = 8;
pub const BTN_RIGHT: u8 = 1;
pub const BTN_MIDDLE: u8 = 2;
pub const BTN_X1: u8 = 3;
pub const BTN_X2: u8 = 4;

impl Trigger {
    pub fn from_prefs(trigger: &str, hold_ms: u32) -> Self {
        match trigger {
            "ctrl" => Trigger::Ctrl,
            "ctrl-alt" => Trigger::CtrlAlt,
            "alt-hold" => Trigger::AltHold(hold_ms),
            other => Self::parse_custom(other, hold_ms).unwrap_or(Trigger::CtrlHold(hold_ms)),
        }
    }

    /// "custom:<mods>:<button>:<hold|click>", ex. "custom:ctrl+shift:middle:hold".
    pub fn parse_custom(s: &str, hold_ms: u32) -> Option<Self> {
        let mut it = s.strip_prefix("custom:")?.split(':');
        let (mods_s, button_s, mode) = (it.next()?, it.next()?, it.next()?);
        let mut mods = 0u8;
        for m in mods_s.split('+').filter(|m| !m.is_empty() && *m != "none") {
            mods |= match m { "ctrl" => MOD_CTRL, "alt" => MOD_ALT, "shift" => MOD_SHIFT, "win" => MOD_WIN, _ => return None };
        }
        let button = match button_s { "right" => BTN_RIGHT, "middle" => BTN_MIDDLE, "x1" => BTN_X1, "x2" => BTN_X2, _ => return None };
        // Botão direito sem modificador tomaria todo clique direito: não vale.
        if button == BTN_RIGHT && mods == 0 {
            return None;
        }
        let hold = match mode { "hold" => hold_ms.max(1), "click" => 0, _ => return None };
        Some(Trigger::Custom { mods, button, hold })
    }

    /// O botão do mouse do gesto.
    pub fn button(self) -> u8 {
        match self {
            Trigger::Custom { button, .. } => button,
            _ => BTN_RIGHT,
        }
    }

    fn hold_ms(self) -> Option<u32> {
        match self {
            Trigger::CtrlHold(ms) | Trigger::AltHold(ms) => Some(ms),
            Trigger::Custom { hold, .. } if hold > 0 => Some(hold),
            _ => None,
        }
    }

    fn matches(self, mods: u8) -> bool {
        let ctrl = mods & MOD_CTRL != 0;
        let alt = mods & MOD_ALT != 0;
        match self {
            Trigger::CtrlHold(_) | Trigger::Ctrl => ctrl && !alt,
            Trigger::CtrlAlt => ctrl && alt,
            Trigger::AltHold(_) => alt && !ctrl,
            Trigger::Custom { mods: want, .. } => mods == want,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Out {
    Pass,
    Swallow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    None,
    /// Chame `timer(token)` depois de `ms`.
    StartTimer { token: u64, ms: u32 },
    /// Mostre o Huginn e o balão em (x, y).
    Open { x: i32, y: i32 },
    /// O botão foi solto com o menu aberto: escolha o item sob (x, y).
    Release { x: i32, y: i32 },
    /// Foi só um toque: re-envie o clique direito normal.
    Replay { x: i32, y: i32 },
    /// Clique com o menu aberto: feche-o se (x, y) estiver fora do balão.
    ClickWhileOpen { x: i32, y: i32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Idle,
    /// Ctrl + botão direito apertados, esperando o tempo de "segurar".
    Pending { token: u64, x: i32, y: i32 },
    /// Menu aberto com o botão ainda apertado.
    Held,
    /// Menu aberto, botão solto: escolha com clique.
    Open,
}

#[derive(Debug)]
pub struct Machine {
    pub trigger: Trigger,
    phase: Phase,
    swallow_up: bool,
    token: u64,
}

impl Machine {
    pub fn new(trigger: Trigger) -> Self {
        Self { trigger, phase: Phase::Idle, swallow_up: false, token: 0 }
    }

    pub fn menu_open(&self) -> bool {
        matches!(self.phase, Phase::Held | Phase::Open)
    }

    /// Botão direito apertado. `eligible` = o cursor está sobre a lista de
    /// arquivos do Explorador ou da área de trabalho.
    pub fn right_down(&mut self, ctrl: bool, alt: bool, eligible: bool, x: i32, y: i32) -> (Out, Effect) {
        let mods = if ctrl { MOD_CTRL } else { 0 } | if alt { MOD_ALT } else { 0 };
        self.button_down(mods, eligible, x, y)
    }

    /// O botão do gesto (`trigger.button()`) apertado com os modificadores `mods`.
    pub fn button_down(&mut self, mods: u8, eligible: bool, x: i32, y: i32) -> (Out, Effect) {
        match self.phase {
            Phase::Idle => {
                if !(eligible && self.trigger.matches(mods)) {
                    return (Out::Pass, Effect::None);
                }
                self.swallow_up = true;
                match self.trigger.hold_ms() {
                    Some(ms) => {
                        self.token += 1;
                        self.phase = Phase::Pending { token: self.token, x, y };
                        (Out::Swallow, Effect::StartTimer { token: self.token, ms })
                    }
                    _ => {
                        self.phase = Phase::Held;
                        (Out::Swallow, Effect::Open { x, y })
                    }
                }
            }
            Phase::Open => (Out::Pass, Effect::ClickWhileOpen { x, y }),
            // Um segundo "apertar" sem "soltar" (não deveria acontecer): deixa passar.
            Phase::Pending { .. } | Phase::Held => (Out::Pass, Effect::None),
        }
    }

    pub fn right_up(&mut self, x: i32, y: i32) -> (Out, Effect) {
        if !self.swallow_up {
            return (Out::Pass, Effect::None);
        }
        self.swallow_up = false;
        match self.phase {
            Phase::Pending { x: px, y: py, .. } => {
                self.phase = Phase::Idle;
                (Out::Swallow, Effect::Replay { x: px, y: py })
            }
            Phase::Held => {
                self.phase = Phase::Open;
                (Out::Swallow, Effect::Release { x, y })
            }
            _ => (Out::Swallow, Effect::None),
        }
    }

    /// Clique esquerdo com o menu aberto.
    pub fn left_down(&mut self, x: i32, y: i32) -> Effect {
        if self.phase == Phase::Open {
            Effect::ClickWhileOpen { x, y }
        } else {
            Effect::None
        }
    }

    pub fn timer(&mut self, token: u64) -> Effect {
        match self.phase {
            Phase::Pending { token: t, x, y } if t == token => {
                self.phase = Phase::Held;
                Effect::Open { x, y }
            }
            _ => Effect::None,
        }
    }

    /// O menu fechou (escolha feita, Esc, clique fora). Se o botão ainda
    /// estiver apertado, o "soltar" continua sendo engolido.
    pub fn closed(&mut self) {
        self.phase = Phase::Idle;
    }
}

/// Onde fica a janela quadrada do anel (px físicos): centrada no cursor, mas
/// empurrada para dentro do monitor, para o anel nunca sair da tela.
pub fn place_ring(x: i32, y: i32, size: i32, mon: Option<(i32, i32, i32, i32)>) -> (i32, i32) {
    let (mut l, mut t) = (x - size / 2, y - size / 2);
    if let Some((mx, my, mw, mh)) = mon {
        l = l.clamp(mx, (mx + mw - size).max(mx));
        t = t.clamp(my, (my + mh - size).max(my));
    }
    (l, t)
}

/// O clique cai dentro do anel? (círculo de raio r em volta do centro da janela)
pub fn inside_ring(x: i32, y: i32, rect: (i32, i32, i32, i32), r: f64) -> bool {
    let (l, t, w, h) = rect;
    let (cx, cy) = (l as f64 + w as f64 / 2.0, t as f64 + h as f64 / 2.0);
    let (dx, dy) = (x as f64 - cx, y as f64 - cy);
    dx * dx + dy * dy <= r * r
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_right_click_untouched() {
        let mut m = Machine::new(Trigger::CtrlHold(300));
        assert_eq!(m.right_down(false, false, true, 1, 1), (Out::Pass, Effect::None));
        assert_eq!(m.right_up(1, 1), (Out::Pass, Effect::None));
        // fora do Explorador, mesmo com Ctrl
        assert_eq!(m.right_down(true, false, false, 1, 1), (Out::Pass, Effect::None));
        assert_eq!(m.right_up(1, 1), (Out::Pass, Effect::None));
    }

    #[test]
    fn quick_tap_replays_native_click() {
        let mut m = Machine::new(Trigger::CtrlHold(300));
        let (o, e) = m.right_down(true, false, true, 10, 20);
        assert_eq!(o, Out::Swallow);
        assert_eq!(e, Effect::StartTimer { token: 1, ms: 300 });
        assert_eq!(m.right_up(11, 21), (Out::Swallow, Effect::Replay { x: 10, y: 20 }));
        // o timer atrasado não abre nada
        assert_eq!(m.timer(1), Effect::None);
        assert!(!m.menu_open());
    }

    #[test]
    fn hold_opens_then_release_picks() {
        let mut m = Machine::new(Trigger::CtrlHold(300));
        m.right_down(true, false, true, 10, 20);
        assert_eq!(m.timer(1), Effect::Open { x: 10, y: 20 });
        assert!(m.menu_open());
        assert_eq!(m.right_up(50, 60), (Out::Swallow, Effect::Release { x: 50, y: 60 }));
        assert!(m.menu_open());
        assert_eq!(m.left_down(5, 5), Effect::ClickWhileOpen { x: 5, y: 5 });
        m.closed();
        assert!(!m.menu_open());
        assert_eq!(m.right_down(false, false, true, 1, 1), (Out::Pass, Effect::None));
    }

    #[test]
    fn stale_timer_ignored() {
        let mut m = Machine::new(Trigger::CtrlHold(300));
        m.right_down(true, false, true, 0, 0);
        m.right_up(0, 0);
        m.right_down(true, false, true, 0, 0);
        assert_eq!(m.timer(1), Effect::None);
        assert_eq!(m.timer(2), Effect::Open { x: 0, y: 0 });
    }

    #[test]
    fn instant_and_alt_variants() {
        let mut m = Machine::new(Trigger::Ctrl);
        assert_eq!(m.right_down(true, false, true, 3, 4), (Out::Swallow, Effect::Open { x: 3, y: 4 }));
        let mut a = Machine::new(Trigger::CtrlAlt);
        assert_eq!(a.right_down(true, false, true, 3, 4).0, Out::Pass);
        assert_eq!(a.right_down(true, true, true, 3, 4).0, Out::Swallow);
        assert_eq!(Trigger::from_prefs("x", 280), Trigger::CtrlHold(280));
    }

    #[test]
    fn up_always_paired_even_if_closed_early() {
        let mut m = Machine::new(Trigger::Ctrl);
        m.right_down(true, false, true, 0, 0);
        m.closed(); // Esc com o botão ainda apertado
        assert_eq!(m.right_up(0, 0).0, Out::Swallow);
        assert_eq!(m.right_up(0, 0).0, Out::Pass);
    }

    #[test]
    fn anel_fica_na_tela() {
        let mon = Some((0, 0, 1920, 1080));
        assert_eq!(place_ring(960, 540, 460, mon), (730, 310));
        assert_eq!(place_ring(5, 5, 460, mon), (0, 0));
        assert_eq!(place_ring(1915, 1075, 460, mon), (1460, 620));
        // segundo monitor à esquerda, 150%
        assert_eq!(place_ring(-2, 300, 690, Some((-2880, 0, 2880, 1620))), (-690, 0));
    }

    #[test]
    fn clique_pelo_circulo() {
        let rect = (100, 100, 460, 460);
        assert!(inside_ring(330, 330, rect, 150.0));
        assert!(inside_ring(330 + 140, 330, rect, 150.0));
        // canto do quadrado: dentro do retângulo, fora do anel
        assert!(!inside_ring(110, 110, rect, 150.0));
    }
}

#[cfg(test)]
mod custom_tests {
    use super::*;

    #[test]
    fn custom_triggers_parse_and_match_exactly() {
        let t = Trigger::parse_custom("custom:ctrl+shift:middle:click", 280).unwrap();
        assert_eq!(t, Trigger::Custom { mods: MOD_CTRL | MOD_SHIFT, button: BTN_MIDDLE, hold: 0 });
        let mut m = Machine::new(t);
        assert_eq!(m.button_down(MOD_CTRL, true, 1, 1).0, Out::Pass);
        assert_eq!(m.button_down(MOD_CTRL | MOD_SHIFT, true, 1, 1), (Out::Swallow, Effect::Open { x: 1, y: 1 }));
        // Botão direito sozinho tomaria todo clique: recusado.
        assert!(Trigger::parse_custom("custom::right:hold", 280).is_none());
        assert!(matches!(Trigger::from_prefs("custom:alt+win:x1:hold", 300), Trigger::Custom { hold: 300, button: BTN_X1, .. }));
    }
}
