// Arrastar e soltar arquivo na ilha: o Huginn abre a boca, engole, a barra
// enche, e o cartão de escolha aparece. A cópia roda em segundo plano: um disco
// lento nunca trava a animação (como o FileDropHandler do macOS).

import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import type { IslandViewName } from "../core/layout";
import type { BotEngine } from "../bifrost/raven";
import { USC, UploadSeq } from "../upload/sequence";
import { fileNameOf, uploadCues, type UploadMarks } from "./upload-steps";

/** As três views que a sequência domina; sair delas para o motor. */
export const UPLOAD_VIEWS: ReadonlySet<IslandViewName> = new Set(["upload", "uploading", "choose"]);
/** Segundos entre a queda e o começo da barra. */
const PRE_PROGRESS = USC.T_PROG_START - USC.T_DROP;

export interface DropHost {
  engine: BotEngine;
  alert(v: IslandViewName): void;
  setView(v: IslandViewName): void;
  wake(): void;
}

export class DropFlow {
  private marks: UploadMarks = { tens: 0, done: false };
  constructor(private readonly host: DropHost) {}

  /** A sequência ocupa o corpo da ilha agora. */
  get active(): boolean {
    return State.mode === "expanded" && UploadSeq.isActive && UPLOAD_VIEWS.has(State.view);
  }

  leaveIfNeeded(view: IslandViewName): void {
    if (UploadSeq.isActive && !UPLOAD_VIEWS.has(view)) UploadSeq.deactivate();
  }

  onEvent(e: { type: string; paths?: string[] }): void {
    if (e.type !== "over") void Bridge.log(`drag ${e.type} ${e.paths?.length ?? 0} file(s)`);
    if (State.paused) return;
    const { engine } = this.host;
    if (e.type === "enter" || e.type === "over") {
      if (State.fileDragOver) return;
      State.fileDragOver = true;
      engine.animateMorph(1);
      // Antes de abrir: a sequência já está ativa quando a view vira `upload`.
      UploadSeq.enterZone(State.mouseInIsland.x, State.mouseInIsland.y);
      this.host.alert("upload");
    } else if (e.type === "leave") {
      if (!State.fileDragOver) return;
      State.fileDragOver = false;
      engine.animateMorph(0);
      UploadSeq.exitZone(); // a ilha fica aberta: o arrasto continua vivo
      State.notify();
    } else if (e.type === "drop") {
      State.fileDragOver = false;
      const path = e.paths?.[0];
      if (!path) { engine.animateMorph(0); this.host.setView(State.defaultView()); return; }
      this.swallow(path);
    }
  }

  private swallow(path: string): void {
    const name = fileNameOf(path);
    State.droppedFile = { name, path };
    State.promptContext = { kind: "file", name, path };
    State.chatHistory = [];
    void Bridge.chatReset();
    UploadSeq.performDrop(State.uploadDuration);
    this.marks = { tens: 0, done: false };
    const { engine } = this.host;
    engine.gulp();
    Sound.play("approve");
    engine.triggerEmote("happy");
    engine.animateMorph(0);
    State.uploadProgress = 0;
    this.host.setView("uploading");
    this.host.wake();
    void Bridge.ingestFile(path)
      .then((file) => {
        if (State.droppedFile?.path !== path) return; // cancelado ou trocado no meio
        State.droppedFile = { name: file.name, path: file.path };
        State.promptContext = { kind: "file", name: file.name, path: file.path };
        State.notify();
      })
      .catch((err) => {
        if (State.droppedFile?.path !== path) return;
        UploadSeq.deactivate();
        State.noteMessage = String(err).replace(/^Error:\s*/, "");
        engine.animateMorph(0);
        this.host.setView("note");
        Sound.play("error");
        window.setTimeout(() => this.host.setView(State.defaultView()), 2400);
      });
  }

  /** Sons e trocas de view presos à linha do tempo do canvas. */
  step(): void {
    const since = UploadSeq.sinceDrop();
    if (since == null) return;
    for (const cue of uploadCues(this.marks, since, PRE_PROGRESS, State.uploadDuration, State.view === "uploading")) {
      if (cue === "tick") Sound.play("tick");
      else if (cue === "complete") { Sound.play("approve"); this.host.engine.triggerEmote("happy"); }
      else this.host.setView("choose");
    }
  }
}
