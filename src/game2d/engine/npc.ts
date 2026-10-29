import type * as Phaser from 'phaser';
import { RADIO_TIMING, typingDuration } from '../../core/story';
import { FRAMES, TEX } from '../art/keys';
import { DEPTH, TILE } from '../constants';
import type { GridPos } from './mapBuilder';
import type { Player } from './Player';
import type { PlatformScene } from './PlatformScene';

// Naufragé 'N' (plan 04, choix 11) : Tess attend près de sa capsule. Kaï au sol près d'elle : flèche ▲ ; l'appui
// « interact » (même branche que les portes, et avant elles) lance le sauvetage : elle parle par la radio
// (déclencheur 'rescue' de la scène), puis LUMA la téléporte à bord (son « rescue », images de dissolution). Tant
// que Kaï est près d'elle sans l'avoir secourue, et jusqu'à son départ, les portes restent fermées : la porte
// voisine (seul passage vers la sortie, vérifié par check-levels) ne s'ouvre qu'une fois Tess à bord. Elle rejoint
// l'équipage à la réussite du niveau (récompense de l'étape). Un objet par partie (la scène le remet à null dans
// init()) : après un échec, elle attend de nouveau (au nouvel essai d'un combat, son état est celui du point de
// contrôle) ; déjà dans l'équipage (niveau rejoué), seule sa capsule reste. Animé à la main sur l'horloge de la scène.

export type CastawayState = 'wait' | 'talk' | 'beam' | 'gone';

/** Kaï près d'elle : au sol, centre à moins de TALK_DX px du sien (la porte voisine comprise : 64 + 24 px). */
const TALK_DX = 96;
const TALK_DY = 8;
/** Elle salue quand Kaï approche (px, sur sa ligne ou presque). */
const WAVE_DX = 5 * TILE;
const WAVE_DY = 2 * TILE;
const IDLE_FPS = 3;
const WAVE_FPS = 6;
const BEAM_FPS = 8;
const BLINK_FPS = 2;
/** Dernière image de la dissolution gardée avant qu'elle disparaisse (ms). */
const BEAM_HOLD_MS = 160;
/** Dissolution entière (ms) : images 4-7, puis la dernière gardée. */
const BEAM_MS = (FRAMES.tess.beam.length * 1000) / BEAM_FPS + BEAM_HOLD_MS;
/** Départ de Tess (« … est à bord ! ») après la dernière lettre de la réplique de LUMA (s) : retard possible de la radio. */
const AFTER_LINE_S = 0.3;
/** Flèche ▲ : écart au-dessus de la tête, oscillation (px, rad/ms), fondu (alpha par ms). */
const ARROW_GAP = 12;
const ARROW_BOB = 6;
const ARROW_BOB_SPEED = 0.006;
const ARROW_FADE_PER_MS = 1 / 140;

/**
 * Délai entre l'appui et la dissolution (ms) : répliques du sauvetage écrites par la radio (RADIO_TIMING ; elles
 * coupent la parole, `interrupt` : la radio passe à la première à l'image suivante, sans trou). Tess se dissout
 * pendant la dernière (celle de LUMA) et part juste après sa dernière lettre. Sans réplique : un court instant.
 */
export function rescueDelayMs(lines: readonly string[]): number {
  const T = RADIO_TIMING;
  if (lines.length === 0) return 600;
  let s = 0;
  for (let i = 0; i < lines.length - 1; i++) s += T.openS + typingDuration(lines[i]) + T.holdBusyS + T.gapS;
  s += T.openS + Math.max(0, typingDuration(lines[lines.length - 1]) + AFTER_LINE_S - BEAM_MS / 1000);
  return Math.round(s * 1000);
}

export class Castaway {
  state: CastawayState = 'wait';
  readonly img: Phaser.GameObjects.Image;
  readonly capsule: Phaser.GameObjects.Image;
  /** Pieds et centre (px). */
  readonly x: number;
  readonly feetY: number;
  /** Kaï près d'elle à la dernière mise à jour (flèche). */
  near = false;
  /** Horloge de la scène à l'appui (ms, -1 avant) : tests. */
  rescuedAt = -1;
  private readonly arrow: Phaser.GameObjects.Image;
  private ms = 0;
  private clock = 0;
  private frame: number = FRAMES.tess.idle[0];
  private blink: number = FRAMES.capsule.blink[0];
  private arrowAlpha = 0;

  constructor(
    private readonly scene: PlatformScene,
    spot: GridPos,
    /** Délai de l'appui à la dissolution (rescueDelayMs). */
    private readonly talkMs: number,
    private readonly onRescued: () => void,
    /** Déjà dans l'équipage (niveau rejoué) : partie, seule sa capsule reste (portes libres). */
    aboard = false,
  ) {
    this.x = spot.col * TILE + TILE / 2;
    this.feetY = (spot.row + 1) * TILE;
    // Capsule sur les 2 cases à sa gauche (joint bas des deux cases), derrière elle.
    this.capsule = scene.add.image((spot.col - 1) * TILE, this.feetY, TEX.capsule, this.blink);
    this.capsule.setOrigin(0.5, 1).setDepth(DEPTH.decor);
    this.img = scene.add.image(this.x, this.feetY, TEX.tess, this.frame);
    this.img.setOrigin(0.5, 1).setDepth(DEPTH.items);
    this.arrow = scene.add.image(this.x, this.feetY, TEX.interactArrow);
    this.arrow.setOrigin(0.5, 1).setDepth(DEPTH.items + 1).setAlpha(0).setVisible(false);
    if (aboard) this.restore(true);
  }

  /** Secourue (ou sauvetage commencé, qui ne s'arrête plus) : état noté au point de contrôle d'avant l'arène. */
  snapshot(): boolean {
    return this.state !== 'wait';
  }

  /** Déjà secourue (niveau rejoué, ou reprise d'un combat) : partie, sans toast ; seule sa capsule reste. */
  restore(rescued: boolean): void {
    if (!rescued || this.state === 'gone') return;
    this.state = 'gone';
    this.near = false;
    this.img.setVisible(false);
    this.arrow.setVisible(false);
  }

  /** Kaï au sol près d'elle. */
  isNear(p: Player): boolean {
    return p.onGround && Math.abs(p.x - this.x) <= TALK_DX && Math.abs(p.feetY - this.feetY) <= TALK_DY;
  }

  /** Les portes restent fermées : Kaï près d'elle sans l'avoir secourue, ou sauvetage en cours. */
  holdsDoors(p: Player): boolean {
    return this.state === 'talk' || this.state === 'beam' || (this.state === 'wait' && this.isNear(p));
  }

  /** Appui « interact » : Kaï près d'elle, en attente → sauvetage lancé (vrai) ; sinon rien. */
  rescue(p: Player): boolean {
    if (this.state !== 'wait' || !this.isNear(p)) return false;
    this.state = 'talk';
    this.ms = 0;
    this.rescuedAt = this.scene.clockMs;
    this.near = false;
    this.scene.vibrate(20);
    return true;
  }

  /** À chaque image ; `active` : partie en cours (faux pendant la mort et la sortie : flèche effacée). */
  update(dtMs: number, active: boolean): void {
    this.clock += dtMs;
    const blink = FRAMES.capsule.blink[Math.floor((this.clock * BLINK_FPS) / 1000) % FRAMES.capsule.blink.length];
    if (blink !== this.blink) {
      this.blink = blink;
      this.capsule.setFrame(blink);
    }
    if (this.state === 'gone') return;
    const p = this.scene.player;
    this.near = active && this.state === 'wait' && this.isNear(p);
    if (this.state !== 'beam') this.img.setFlipX(p.x < this.x);
    const F = FRAMES.tess;
    if (this.state === 'wait') {
      const waving = Math.abs(p.x - this.x) <= WAVE_DX && Math.abs(p.feetY - this.feetY) <= WAVE_DY;
      const list = waving ? F.wave : F.idle;
      this.setFrame(list[Math.floor((this.clock * (waving ? WAVE_FPS : IDLE_FPS)) / 1000) % list.length]);
    } else if (this.state === 'talk') {
      this.ms += dtMs;
      this.setFrame(F.wave[Math.floor((this.clock * WAVE_FPS) / 1000) % F.wave.length]);
      if (this.ms >= this.talkMs) this.startBeam();
    } else {
      this.ms += dtMs;
      const i = Math.floor((this.ms * BEAM_FPS) / 1000);
      if (i < F.beam.length) this.setFrame(F.beam[i]);
      else if (this.ms >= BEAM_MS) this.finish();
    }
    this.updateArrow(dtMs);
  }

  /** LUMA la téléporte : son, lumière, images de dissolution. */
  private startBeam(): void {
    const scene = this.scene;
    this.state = 'beam';
    this.ms = 0;
    this.setFrame(FRAMES.tess.beam[0]);
    scene.playSfx('rescue');
    scene.fx.burst(this.x, this.feetY - 40, 0x9ff6ff, 18);
    scene.fx.spark(this.x, this.feetY - 70, scene.fx.colors.crystal, 10);
  }

  private finish(): void {
    this.state = 'gone';
    this.img.setVisible(false);
    this.arrow.setVisible(false);
    this.scene.fx.spark(this.x, this.feetY - 40, 0x9ff6ff, 8);
    this.onRescued();
  }

  private setFrame(f: number): void {
    if (f === this.frame) return;
    this.frame = f;
    this.img.setFrame(f);
  }

  /** Flèche ▲ au-dessus de sa tête : apparaît en fondu, oscille doucement. */
  private updateArrow(dtMs: number): void {
    const a = this.arrow;
    const step = dtMs * ARROW_FADE_PER_MS;
    this.arrowAlpha = this.near ? Math.min(1, this.arrowAlpha + step) : Math.max(0, this.arrowAlpha - step);
    if (this.arrowAlpha <= 0) {
      if (a.visible) a.setVisible(false);
      return;
    }
    const bob = ARROW_BOB * (0.5 + 0.5 * Math.sin(this.clock * ARROW_BOB_SPEED));
    a.setPosition(this.x, this.feetY - this.img.height - ARROW_GAP - bob);
    a.setAlpha(this.arrowAlpha);
    if (!a.visible) a.setVisible(true);
  }
}
