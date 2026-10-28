import * as THREE from 'three';

// Petits utilitaires du mode 3D : suivi des ressources à libérer, textures de halo, interpolations.

export interface Disposable {
  dispose(): void;
}

/** Collecte les géométries / matériaux / textures d'une partie pour tout libérer d'un coup. */
export class Bin {
  private items: Disposable[] = [];

  add<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }

  disposeAll(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      try {
        this.items[i].dispose();
      } catch {
        // déjà libéré : on ignore
      }
    }
    this.items.length = 0;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Le segment (x0, y0, z0) → (x1, y1, z1) passe-t-il à moins de `rr` du point (cx, cy, cz) ? Impacts des tirs
 * (segment parcouru pendant un sous-pas, `rr` = rayon de la cible + rayon du tir). Sans allocation.
 */
export function segmentHitsSphere(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  cx: number,
  cy: number,
  cz: number,
  rr: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy + (cz - z0) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = x0 + dx * t - cx;
  const ey = y0 + dy * t - cy;
  const ez = z0 + dz * t - cz;
  return ex * ex + ey * ey + ez * ez <= rr * rr;
}

/** Amortissement exponentiel indépendant du nombre d'images par seconde. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Texture de halo radial blanc (teintée ensuite par le matériau). */
export function makeGlowTexture(bin: Bin, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const h = size / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.05)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return bin.add(t);
}
