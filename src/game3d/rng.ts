// Générateur pseudo-aléatoire déterministe et bruit de valeur 3D (géométries procédurales).

export type Rng = () => number;

/** Mulberry32 : rapide, 32 bits, suffisant pour du contenu de jeu reproductible. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rand(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng();
}

/** Hachage entier 3D → [0, 1). */
export function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h =
    Math.imul(ix | 0, 0x27d4eb2d) ^
    Math.imul(iy | 0, 0x165667b1) ^
    Math.imul(iz | 0, 0x9e3779b1) ^
    Math.imul(seed | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Bruit de valeur 3D lissé, dans [0, 1]. */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, seed);
  const b = hash3(ix + 1, iy, iz, seed);
  const c = hash3(ix, iy + 1, iz, seed);
  const d = hash3(ix + 1, iy + 1, iz, seed);
  const e = hash3(ix, iy, iz + 1, seed);
  const f = hash3(ix + 1, iy, iz + 1, seed);
  const g = hash3(ix, iy + 1, iz + 1, seed);
  const h = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x1 = a + (b - a) * ux;
  const x2 = c + (d - c) * ux;
  const x3 = e + (f - e) * ux;
  const x4 = g + (h - g) * ux;
  const y1 = x1 + (x2 - x1) * uy;
  const y2 = x3 + (x4 - x3) * uy;
  return y1 + (y2 - y1) * uz;
}

/** Somme fractale de bruits (fbm), dans [0, 1]. */
export function fbm3(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += amp * noise3(x, y, z, seed + i * 17);
    norm += amp;
    x = x * 2.03 + 1.7;
    y = y * 2.03 + 9.2;
    z = z * 2.03 + 3.1;
    amp *= 0.5;
  }
  return s / norm;
}
