// O que as views da ilha podem pedir (ViewActions), ligado ao núcleo da ilha.

import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { parseOutfit } from "../huginn/wardrobe";
import type { ViewActions } from "../views/views";
import type { IslandViewName } from "../core/layout";
import type { BotEngine } from "../bifrost/raven";
import type { IslandStateMachine } from "./fsm";
import { targetOf, terminalOf, type Target } from "./targets";

export interface IslandCore {
  readonly fsm: IslandStateMachine;
  readonly engine: BotEngine;
  setView(v: IslandViewName): void;
  collapse(): void;
  foldApproval(): void;
  discardDrop(): void;
  /** O pedido teve resposta: o cartão sai, a sessão continua. */
  closeApproval(): void;
  /** O mouse está sobre a ilha agora. */
  pointerIn(): boolean;
}

export function go(t: Target): void {
  switch (t.kind) {
    case "claudeDesktop": void Bridge.openClaudeDesktop(); break;
    case "terminal": void Bridge.openSession(t.sessionId, t.cwd); break;
    case "n8n": void Bridge.openN8n(); break;
    case "gitea": void Bridge.openGitea(); break;
    case "spotify": void Bridge.spotifyOpen(); break;
    case "url": void Bridge.openUrl(t.url); break;
    case "none": break;
  }
}

function saveSettings(): void {
  void Bridge.saveSettings(State.settings);
  State.notify();
}

export function islandActions(core: IslandCore): ViewActions {
  let holding = false;
  return {
    setView: (v) => core.setView(v),
    cancelDrop: () => core.discardDrop(),
    collapse: () => core.collapse(),
    foldApproval: () => core.foldApproval(),
    setFocus(id) {
      State.setFocus(id);
      Sound.play("blip");
      // Voltar a uma pílula com pedido esperando traz o cartão de volta.
      const req = State.pendingApproval;
      if (req?.pillId === id) core.setView(req.questions ? "question" : "approval");
    },
    openTerminal: () => go(terminalOf(State.focusTask)),
    openTarget: () => go(targetOf(State.focusTask)),
    openUrl: (url) => { if (url) void Bridge.openUrl(url); },
    decide(d) {
      const req = State.pendingApproval;
      void Bridge.log(`decide ${d} req=${req?.requestId ?? "none"}`);
      if (!req) return;
      Sound.play(d === "deny" ? "blip" : "approve");
      void Bridge.approvalDecision(req.requestId, d);
      core.closeApproval();
    },
    answer(answers) {
      const req = State.pendingApproval;
      if (!req) return;
      Sound.play("approve");
      void Bridge.approvalAnswer(req.requestId, answers);
      core.closeApproval();
    },
    answerInTerminal() {
      const req = State.pendingApproval;
      if (!req) return;
      Sound.play("blip");
      void Bridge.approvalDecline(req.requestId);
      core.closeApproval();
    },
    toggleSound() {
      State.settings.soundEnabled = !State.settings.soundEnabled;
      Sound.setEnabled(State.settings.soundEnabled);
      saveSettings();
    },
    setVolume(v) {
      State.settings.soundVolume = v;
      Sound.setVolume(v);
      saveSettings();
    },
    setAutoClose(s) {
      State.settings.autoCloseInterval = s;
      core.fsm.homeToPetitDelay = s;
      saveSettings();
    },
    openSettingsWindow: () => void Bridge.openSettingsWindow(),
    blip: () => Sound.play("blip"),
    chooseOutfit(selection) {
      if (parseOutfit(State.settings.mochiOutfit) === selection) return;
      State.settings.mochiOutfit = selection;
      void Bridge.saveSettings(State.settings);
      Sound.play("pop");
      core.engine.triggerEmote("proud");
      State.notify();
    },
    previewOutfit(outfit) {
      State.wardrobePreview = outfit;
      State.notify();
    },
    keyboard(on) {
      // O chat cuida do teclado sozinho.
      if (on) void Bridge.focusWindow(true);
      else if (State.view !== "prompt" && State.mode === "expanded") void Bridge.focusWindow(false);
    },
    holdOpen(on) {
      if (holding === on) return;
      holding = on;
      if (on) { core.fsm.pinned = true; core.fsm.cancelTimers(); return; }
      core.fsm.pinned = State.isPinned || State.pendingApproval != null;
      if (!core.fsm.pinned && !core.pointerIn() && core.fsm.state === "home") core.fsm.mouseLeft();
    },
  };
}
