import * as THREE from 'three';
import { MAX_ROCK_R, type Course, type CourseTheme, type RockData } from './courses';
import { fbm3, hash3, noise3 } from './rng';
import { inAimCone, offerAim, type AimTarget } from './shots';
import { segmentHitsSphere, type Bin } from './util';

// Champ d'astéroïdes : quelques modèles low-poly déformés par du bruit (ombrage plat, facettes de
// cristal lumineuses), affichés en InstancedMesh. Seuls les rochers proches de la caméra sont écrits
// dans les instances (fenêtre glissante sur la liste triée par z). Le brouillard se fond dans la
// cubemap du ciel : les rochers lointains apparaissent sans « pop ».

/** Distance d'affichage devant la caméra. */
export const ROCK_VIEW = 1380;
/** Part des rochers du couloir (collide) qui lâchent un cristal quand un tir les détruit (~1 sur 4). */
export const CRYSTAL_DROP_RATE = 0.25;

/** Points de vie d'un rocher selon son rayon : petits 1-2, gros 3-5 (dégâts du canon : 1, ×1,25, ×1,5). */
export function rockHp(r: number): number {
  return r < 1.6 ? 1 : r < 3.4 ? 2 : r < 5.5 ? 3 : r < 8.5 ? 4 : 5;
}

/**
 * Le rocher `index` (dans Course.rocks, triés par z) lâche-t-il un cristal ? Déterministe : graine du
 * parcours + index ; seuls les rochers du couloir (collide), les autres sont hors d'atteinte.
 */
export function rockDropsCrystal(seed: number, index: number, rock: Readonly<RockData>): boolean {
  return rock.collide && hash3(index, 7, 13, seed + 0x3b) < CRYSTAL_DROP_RATE;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();

/** Matériau de roche : couleurs par sommet + émission des facettes de cristal + brouillard « ciel ». */
export function makeRockMaterial(
  bin: Bin,
  crystal: THREE.Color,
  time: { value: number },
  sky: THREE.CubeTexture,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
    metalness: 0.06,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowColor = { value: crystal };
    shader.uniforms.uTime = time;
    shader.uniforms.uSkyCube = { value: sky };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uGlowColor;\nuniform float uTime;\nuniform samplerCube uSkyCube;\nvarying float vGlow;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowColor * vGlow * (1.2 + 0.5 * sin(uTime * 2.3 + vViewPosition.x * 0.4));',
      )
      .replace(
        '#include <fog_fragment>',
        [
          '#ifdef USE_FOG',
          '  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );',
          '  vec3 xrDir = normalize( ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz );',
          '  vec3 xrSky = linearToOutputTexel( vec4( texture( uSkyCube, xrDir ).rgb, 1.0 ) ).rgb;',
          '  gl_FragColor.rgb = mix( gl_FragColor.rgb, xrSky, fogFactor );',
          '#endif',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => 'xr-rock';
  return bin.add(mat);
}

/** Modèle de rocher : forme déformée, couleurs par face (creux plus sombres), cristaux émissifs. */
function rockGeometry(kind: number, seed: number, detail: number, crystalRate: number, crystal: THREE.Color): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry =
    kind === 2 ? new THREE.DodecahedronGeometry(1, detail) : new THREE.IcosahedronGeometry(1, detail);
  if (geo.index) {
    const ni = geo.toNonIndexed();
    geo.dispose();
    geo = ni;
  }
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const sx = kind === 1 ? 1.28 : 1;
  const sy = kind === 1 ? 0.8 : kind === 3 ? 0.9 : 1;
  const sz = kind === 1 ? 0.92 : 1;
  const amp = kind === 2 ? 0.22 : 0.34;
  const disp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    x /= l;
    y /= l;
    z /= l;
    let d = 1 + (fbm3(x * 1.4 + 3, y * 1.4, z * 1.4, seed, 4) - 0.5) * 2 * amp;
    // Cratères : creux arrondis
    const c = noise3(x * 2.3 + 7, y * 2.3, z * 2.3, seed + 5);
    if (c > 0.62) d -= (c - 0.62) * (kind === 3 ? 1.1 : 0.6);
    disp[i] = d;
    pos.setXYZ(i, x * d * sx, y * d * sy, z * d * sz);
  }
  geo.computeVertexNormals();
  const colors = new Float32Array(n * 3);
  const glow = new Float32Array(n);
  for (let f = 0; f < n; f += 3) {
    const dAvg = (disp[f] + disp[f + 1] + disp[f + 2]) / 3;
    const shade = Math.min(1.12, Math.max(0.42, 0.62 + (dAvg - 0.92) * 1.6)) * (0.88 + 0.24 * hash3(f, 1, 2, seed));
    const isCrystal = hash3(f, 7, 3, seed + 11) < crystalRate * (dAvg < 0.98 ? 2.2 : 0.35);
    for (let k = 0; k < 3; k++) {
      const v = (f + k) * 3;
      if (isCrystal) {
        colors[v] = 0.55 + crystal.r * 0.6;
        colors[v + 1] = 0.55 + crystal.g * 0.6;
        colors[v + 2] = 0.55 + crystal.b * 0.6;
      } else {
        colors[v] = shade;
        colors[v + 1] = shade;
        colors[v + 2] = shade;
      }
      glow[f + k] = isCrystal ? 1 : 0;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Petit éclat anguleux (débris). */
export function chunkGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = 0.7 + 0.6 * noise3(x * 2 + 5, y * 2, z * 2, 99);
    pos.setXYZ(i, x * d, y * d * 0.7, z * d);
  }
  geo.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3).fill(0.85);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  return geo;
}

export class AsteroidField {
  readonly group = new THREE.Group();
  readonly rocks: RockData[];
  readonly material: THREE.MeshStandardMaterial;
  /** 1 = rocher détruit (choc de la Comète ou tirs) : plus affiché, plus de collision ni de cible. */
  readonly destroyed: Uint8Array;
  /** Points de vie restants (rockHp au départ ; dégâts non arrondis). */
  readonly hp: Float32Array;
  /**
   * Dégâts des tirs en route vers chaque rocher (ShotPool.claim / rendus à l'impact ou à l'extinction) : la
   * visée ne retient plus un rocher que ces tirs suffisent à détruire.
   */
  readonly pending: Float32Array;
  /** 1 = lâche un cristal quand un tir le détruit (rockDropsCrystal). */
  readonly dropsCrystal: Uint8Array;
  /** Cristaux possibles des rochers (StageResult.crystalsTotal, avec ceux des ennemis). */
  readonly crystalCount: number;
  private readonly time = { value: 0 };
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly lists: number[][] = [[], [], [], [], []];
  private readonly starts = [0, 0, 0, 0, 0];
  private readonly tints: Float32Array;
  private hitStart = 0;

  constructor(course: Course, theme: CourseTheme, sky: THREE.CubeTexture, bin: Bin) {
    this.rocks = course.rocks;
    this.destroyed = new Uint8Array(this.rocks.length);
    const seed = course.def.seed;
    this.hp = new Float32Array(this.rocks.length);
    this.pending = new Float32Array(this.rocks.length);
    this.dropsCrystal = new Uint8Array(this.rocks.length);
    let drops = 0;
    for (let i = 0; i < this.rocks.length; i++) {
      this.hp[i] = rockHp(this.rocks[i].r);
      if (rockDropsCrystal(seed, i, this.rocks[i])) {
        this.dropsCrystal[i] = 1;
        drops++;
      }
    }
    this.crystalCount = drops;
    const crystal = new THREE.Color(theme.crystal);
    this.material = makeRockMaterial(bin, crystal, this.time, sky);
    const geos = [
      rockGeometry(0, seed + 11, 2, 0.05, crystal),
      rockGeometry(1, seed + 23, 2, 0.04, crystal),
      rockGeometry(2, seed + 37, 1, 0.05, crystal),
      rockGeometry(3, seed + 51, 2, 0.09, crystal),
      rockGeometry(0, seed + 77, 3, 0.04, crystal),
    ];
    for (const g of geos) bin.add(g);

    // Teintes par rocher (linéaire)
    this.tints = new Float32Array(this.rocks.length * 3);
    const palette = theme.rocks.map((h) => new THREE.Color(h));
    for (let i = 0; i < this.rocks.length; i++) {
      const rk = this.rocks[i];
      const c = palette[rk.tint % palette.length];
      this.tints[i * 3] = c.r * rk.shade;
      this.tints[i * 3 + 1] = c.g * rk.shade;
      this.tints[i * 3 + 2] = c.b * rk.shade;
      this.lists[rk.variant].push(i);
    }
    for (let v = 0; v < 5; v++) {
      const cap = Math.max(1, this.lists[v].length);
      const mesh = new THREE.InstancedMesh(geos[v], this.material, cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Centre actuel d'un rocher (avec dérive des gros rochers). */
  center(i: number, time: number, out: THREE.Vector3): THREE.Vector3 {
    const rk = this.rocks[i];
    if (rk.drift > 0) {
      const a = time * rk.driftFreq + rk.phase;
      out.set(rk.x + rk.drift * Math.sin(a), rk.y + rk.drift * 0.6 * Math.cos(a * 0.8 + rk.phase), rk.z);
    } else {
      out.set(rk.x, rk.y, rk.z);
    }
    return out;
  }

  /** Écrit les instances visibles (fenêtre devant la caméra). */
  update(time: number, camZ: number): void {
    this.time.value = time;
    const near = camZ + 30;
    const far = camZ - ROCK_VIEW;
    const rocks = this.rocks;
    for (let v = 0; v < 5; v++) {
      const list = this.lists[v];
      const mesh = this.meshes[v];
      let s = this.starts[v];
      while (s < list.length && rocks[list[s]].z - rocks[list[s]].r > near) s++;
      this.starts[v] = s;
      const colors = (mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
      let n = 0;
      for (let k = s; k < list.length; k++) {
        const i = list[k];
        const rk = rocks[i];
        if (rk.z + rk.r < far) break;
        if (this.destroyed[i]) continue;
        this.center(i, time, _p);
        _axis.set(rk.ax, rk.ay, rk.az);
        _q.setFromAxisAngle(_axis, rk.phase + time * rk.spin);
        _s.setScalar(rk.r);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n, _m);
        colors[n * 3] = this.tints[i * 3];
        colors[n * 3 + 1] = this.tints[i * 3 + 1];
        colors[n * 3 + 2] = this.tints[i * 3 + 2];
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }

  /** Premier rocher touché par la sphère du vaisseau, ou −1. */
  hitTest(x: number, y: number, z: number, shipR: number, time: number): number {
    const rocks = this.rocks;
    const reach = MAX_ROCK_R + shipR + 1;
    while (this.hitStart < rocks.length && rocks[this.hitStart].z > z + reach) this.hitStart++;
    for (let k = this.hitStart; k < rocks.length; k++) {
      const rk = rocks[k];
      if (rk.z < z - reach) break;
      if (!rk.collide || this.destroyed[k]) continue;
      this.center(k, time, _p);
      const dx = _p.x - x;
      const dy = _p.y - y;
      const dz = _p.z - z;
      const rr = rk.r * 0.82 + shipR;
      if (dx * dx + dy * dy + dz * dz < rr * rr) return k;
    }
    return -1;
  }

  /** Couleur (linéaire) d'un rocher, pour ses éclats. */
  tint(i: number, out: THREE.Color): THREE.Color {
    return out.setRGB(this.tints[i * 3], this.tints[i * 3 + 1], this.tints[i * 3 + 2]);
  }

  /**
   * Premier rocher non détruit touché par le segment (x0, y0, z0) → (x1, y1, z1) d'un tir de rayon `r`
   * (segmentHitsSphere de util.ts, rayon rk.r × 0,82 + r comme hitTest, centre avec dérive à `time`), ou −1.
   * Tous les rochers (même hors couloir) arrêtent un tir. Recherche par z (liste triée), sans allocation.
   */
  shotTest(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, time: number): number {
    const rocks = this.rocks;
    const reach = MAX_ROCK_R + r;
    const zMin = Math.min(z0, z1) - reach;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len2 = dx * dx + dy * dy + dz * dz;
    let best = -1;
    let bestT = Infinity;
    for (let k = this.firstAtOrBelow(Math.max(z0, z1) + reach); k < rocks.length; k++) {
      const rk = rocks[k];
      if (rk.z < zMin) break;
      if (this.destroyed[k]) continue;
      this.center(k, time, _p);
      if (!segmentHitsSphere(x0, y0, z0, x1, y1, z1, _p.x, _p.y, _p.z, rk.r * 0.82 + r)) continue;
      // Plusieurs rochers sur le même segment : le premier rencontré
      const t = len2 > 0 ? ((_p.x - x0) * dx + (_p.y - y0) * dy + (_p.z - z0) * dz) / len2 : 0;
      if (t < bestT) {
        bestT = t;
        best = k;
      }
    }
    return best;
  }

  /**
   * Propose à `best` (offerAim de shots.ts, type 'rock', vitesse 0) le rocher du couloir (collide) non détruit
   * le plus proche dans le cône de visée (inAimCone, dx = centre − Comète), sauf s'il est déjà condamné par
   * les tirs en route (pending).
   */
  aim(x: number, y: number, z: number, cosCone: number, range: number, time: number, best: AimTarget): void {
    const rocks = this.rocks;
    const zMin = z - range;
    for (let k = this.firstAtOrBelow(z); k < rocks.length; k++) {
      const rk = rocks[k];
      if (rk.z < zMin) break;
      if (!rk.collide || this.destroyed[k]) continue;
      if (this.hp[k] - this.pending[k] <= 1e-6) continue;
      this.center(k, time, _p);
      const d = inAimCone(_p.x - x, _p.y - y, _p.z - z, cosCone, range);
      if (d >= 0) offerAim(best, 'rock', k, d, _p.x, _p.y, _p.z, 0, 0, 0);
    }
  }

  /** Premier index dont le z est ≤ `z` (liste triée par z décroissant ; recherche dichotomique). */
  private firstAtOrBelow(z: number): number {
    const rocks = this.rocks;
    let lo = 0;
    let hi = rocks.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (rocks[mid].z > z) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Dégâts d'un tir sur le rocher `i` ; renvoie true s'il vient d'être détruit (destroyed[i] = 1). L'éclatement,
   * le cristal et les points sont faits par FlightRun.
   */
  damage(i: number, amount: number): boolean {
    if (this.destroyed[i]) return false;
    this.hp[i] -= amount;
    if (this.hp[i] > 1e-6) return false;
    this.destroyed[i] = 1;
    return true;
  }
}
