import { div, rng } from './dom';

// Fond spatial animé des menus, 100 % CSS : champs d'étoiles en couches (tuiles SVG générées
// par code), nébuleuses, voie lactée, planète à anneaux qui tourne, étoiles filantes et une
// méduse-baleine géante qui dérive au loin. Seuls transform / opacity sont animés.
// Masqué (display: none) pendant le jeu : aucune animation ne tourne alors.

interface StarLayer {
  tile: number;
  count: number;
  rMin: number;
  rMax: number;
  halo: number;
  colors: readonly string[];
  seed: number;
}

const LAYERS: Record<'far' | 'mid' | 'near' | 'twinkle', StarLayer> = {
  far: { tile: 384, count: 90, rMin: 0.35, rMax: 0.85, halo: 0, colors: ['#ffffff', '#cfd8ff', '#bff9ff'], seed: 11 },
  mid: { tile: 512, count: 46, rMin: 0.6, rMax: 1.2, halo: 0.12, colors: ['#ffffff', '#9dfcff', '#ffc8f2'], seed: 23 },
  near: { tile: 640, count: 16, rMin: 1, rMax: 1.7, halo: 0.2, colors: ['#ffffff', '#e8fdff', '#fff1c9'], seed: 37 },
  twinkle: { tile: 448, count: 12, rMin: 1.1, rMax: 1.6, halo: 0.35, colors: ['#ffffff', '#9dfcff', '#ff9adf'], seed: 53 },
};

function starTile(l: StarLayer): string {
  const rand = rng(l.seed);
  const size = l.tile;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  for (let i = 0; i < l.count; i++) {
    const r = l.rMin + rand() * (l.rMax - l.rMin);
    const pad = r * 6;
    // Marge : aucune étoile n'est coupée au bord de la tuile (raccord invisible).
    const x = (pad + rand() * (size - pad * 2)).toFixed(1);
    const y = (pad + rand() * (size - pad * 2)).toFixed(1);
    const c = l.colors[Math.floor(rand() * l.colors.length)];
    const o = (0.55 + rand() * 0.45).toFixed(2);
    if (l.halo > 0 && rand() < 0.7) {
      svg += `<circle cx="${x}" cy="${y}" r="${(r * 4).toFixed(1)}" fill="${c}" fill-opacity="${l.halo}"/>`;
    }
    svg += `<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill="${c}" fill-opacity="${o}"/>`;
  }
  svg += '</svg>';
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Méduse-baleine (monde 1, GDD) en silhouette lumineuse. */
const CREATURE_SVG = `<svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M20 70C20 30 60 6 110 6s90 24 90 64c-14 10-30 6-44 12-14-8-30-2-46 4-16-6-32-12-46-4-14-6-30-2-44-12z" fill="rgba(63,247,255,0.10)" stroke="rgba(150,252,255,0.55)" stroke-width="2.2"/>
<path d="M44 58c10-22 36-36 66-36" fill="none" stroke="rgba(200,253,255,0.5)" stroke-width="2" stroke-linecap="round"/>
<path d="M40 80c-6 24 6 40-2 66M70 84c-4 26 10 36 2 64M110 86c6 22-8 40 0 66M150 84c4 24-10 38-2 62M180 80c8 20-4 36 4 56" fill="none" stroke="rgba(255,63,210,0.45)" stroke-width="2.4" stroke-linecap="round"/>
<circle cx="62" cy="44" r="3" fill="#ff9adf"/><circle cx="96" cy="30" r="2.4" fill="#9dfcff"/><circle cx="140" cy="34" r="2.8" fill="#9dfcff"/><circle cx="168" cy="52" r="2.2" fill="#ff9adf"/>
</svg>`;

export interface SpaceBackground {
  readonly el: HTMLElement;
  setVisible(on: boolean): void;
}

export function createSpaceBackground(parent: HTMLElement): SpaceBackground {
  const bg = div('space-bg');
  bg.setAttribute('aria-hidden', 'true');
  bg.style.setProperty('--tile-far', starTile(LAYERS.far));
  bg.style.setProperty('--tile-mid', starTile(LAYERS.mid));
  bg.style.setProperty('--tile-near', starTile(LAYERS.near));
  bg.style.setProperty('--tile-twinkle', starTile(LAYERS.twinkle));

  const milky = div('bg-milky');
  const neb1 = div('bg-nebula bg-nebula--a');
  const neb2 = div('bg-nebula bg-nebula--b');
  const neb3 = div('bg-nebula bg-nebula--c');

  const far = div('bg-stars bg-stars--far');
  const mid = div('bg-stars bg-stars--mid');
  const twinkle = div('bg-stars bg-stars--twinkle');
  const near = div('bg-stars bg-stars--near');

  const creature = div('bg-creature');
  const creatureBob = div('bg-creature-bob');
  creatureBob.innerHTML = CREATURE_SVG;
  creature.append(creatureBob);

  // Planète à anneaux : anneau arrière, sphère (surface qui défile = rotation), anneau avant.
  const planetWrap = div('bg-planet');
  const ringBack = div('planet-ring planet-ring--back');
  const sphere = div('planet-sphere');
  sphere.append(div('planet-surface'), div('planet-shade'));
  const ringFront = div('planet-ring planet-ring--front');
  planetWrap.append(ringBack, sphere, ringFront);

  const moon = div('bg-moon');

  const shoot1 = div('bg-shooting bg-shooting--a');
  shoot1.append(div('bg-shooting-streak'));
  const shoot2 = div('bg-shooting bg-shooting--b');
  shoot2.append(div('bg-shooting-streak'));

  const vignette = div('bg-vignette');

  bg.append(milky, neb1, neb2, neb3, far, mid, twinkle, creature, moon, planetWrap, near, shoot1, shoot2, vignette);
  parent.append(bg);

  return {
    el: bg,
    setVisible(on: boolean): void {
      bg.classList.toggle('is-off', !on);
    },
  };
}
