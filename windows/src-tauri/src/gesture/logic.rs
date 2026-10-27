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
}

impl Trigger {
    pub fn from_prefs(trigger: &str, hold_ms: u32) -> Self {
        match trigger {
            "ctrl" => Trigger::Ctrl,
            "ctrl-alt" => Trigger::CtrlAlt,
            _ => Trigger::CtrlHold(hold_ms),
        }
    }
    fn matches(self, ctrl: bool, alt: bool) -> bool {
        match self {
            Trigger::CtrlHold(_) | Trigger::Ctrl => ctrl && !alt,
            Trigger::CtrlAlt => ctrl && alt,
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
        match self.phase {
            Phase::Idle => {
                if !(eligible && self.trigger.matches(ctrl, alt)) {
                    return (Out::Pass, Effect::None);
                }
                self.swallow_up = true;
                match self.trigger {
                    Trigger::CtrlHold(ms) => {
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
}
