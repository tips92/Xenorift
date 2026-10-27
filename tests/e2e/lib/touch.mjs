// Multi-touch réel via CDP (Input.dispatchTouchEvent), avec identifiants de doigts explicites.
//
// Ici, chaque appel décrit l'état COMPLET voulu : la liste de tous les doigts posés APRÈS l'appel.
// Un point s'écrit [x, y, id] (coordonnées CSS de la page). La bibliothèque calcule les événements CDP :
//
//   const f = touches(t);
//   await f.start([[rx, ry, 1]]);                 // pose le doigt 1 sur ▶
//   await f.start([[rx, ry, 1], [jx, jy, 2]]);    // + doigt 2 sur SAUT (le 1 reste posé)
//   await f.move([[rx + 5, ry, 1], [jx, jy, 2]]); // déplace le doigt 1
//   await f.end([[rx + 5, ry, 1]]);               // lève le doigt 2, le 1 reste posé
//   await f.end();                                // lève tout
//
// Variante pas à pas : f.down(id, x, y), f.moveTo(id, x, y), f.up(id) (f.up() : tout lever), f.tap(x, y, id).
//
// Sémantique CDP brute (Chrome 156, vérifiée) si vous appelez t.cdp() vous-même : touchStart presse les
// points listés encore inconnus ; touchMove déplace les points listés ; touchEnd LÈVE les points listés
// (liste vide = tous) ; touchCancel annule tout. Les doigts non listés restent posés.

const RADIUS = 6;

function cdpPoints(points) {
  return points.map(([x, y, id]) => ({ x, y, id, radiusX: RADIUS, radiusY: RADIUS, force: 1 }));
}

function check(points, what) {
  if (!Array.isArray(points)) throw new Error(`touch.${what} : tableau de points [x, y, id] attendu`);
  const ids = new Set();
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 3 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isInteger(p[2])) {
      throw new Error(`touch.${what} : point invalide ${JSON.stringify(p)} (attendu [x, y, id entier])`);
    }
    if (ids.has(p[2])) throw new Error(`touch.${what} : identifiant ${p[2]} en double`);
    ids.add(p[2]);
  }
}

/** Doigts de la page (une seule instance par scénario : l'état des doigts posés est partagé). */
export function touches(t) {
  if (t._touches) return t._touches;
  /** id → [x, y, id] des doigts actuellement posés. */
  const active = new Map();
  const send = async (type, points) => {
    const cdp = await t.cdp();
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: cdpPoints(points) });
  };

  /** Passe de l'état courant à `points` : lever, puis déplacer, puis poser. */
  async function apply(points) {
    const next = new Map(points.map((p) => [p[2], [p[0], p[1], p[2]]]));
    const lifted = [...active.values()].filter((p) => !next.has(p[2]));
    const moved = points.filter((p) => active.has(p[2]) && (active.get(p[2])[0] !== p[0] || active.get(p[2])[1] !== p[1]));
    const added = points.filter((p) => !active.has(p[2]));
    if (lifted.length) {
      await send('touchEnd', lifted);
      for (const p of lifted) active.delete(p[2]);
    }
    if (moved.length) {
      await send('touchMove', moved);
      for (const p of moved) active.set(p[2], [p[0], p[1], p[2]]);
    }
    if (added.length) {
      await send('touchStart', added);
      for (const p of added) active.set(p[2], [p[0], p[1], p[2]]);
    }
  }

  const api = {
    /** Pose un ou plusieurs doigts ; `points` = tous les doigts posés après l'appel (les anciens peuvent bouger). */
    async start(points) {
      check(points, 'start');
      const known = points.filter((p) => active.has(p[2])).length;
      if (known === points.length) throw new Error('touch.start : aucun nouveau doigt (utiliser move)');
      if (known < active.size) throw new Error('touch.start : des doigts posés manquent dans la liste (utiliser end ou set)');
      await apply(points);
    },
    /** Déplace des doigts ; `points` = exactement les doigts posés, avec leurs nouvelles positions. */
    async move(points) {
      check(points, 'move');
      if (points.length !== active.size || !points.every((p) => active.has(p[2]))) {
        throw new Error(`touch.move : il faut lister exactement les doigts posés (${[...active.keys()].join(', ') || 'aucun'})`);
      }
      await apply(points);
    },
    /** Lève les doigts absents de `remaining` (sans argument : tous). */
    async end(remaining = []) {
      check(remaining, 'end');
      if (!remaining.every((p) => active.has(p[2]))) throw new Error('touch.end : `remaining` ne doit contenir que des doigts posés');
      await apply(remaining);
    },
    /** Annule tous les doigts (touchcancel). */
    async cancel() {
      await send('touchCancel', []);
      active.clear();
    },
    /** Passage libre à l'état `points` (lever / déplacer / poser selon les différences). */
    async set(points) {
      check(points, 'set');
      await apply(points);
    },
    /** Doigts posés : [[x, y, id], ...]. */
    active() {
      return [...active.values()].map((p) => [...p]);
    },
    /** Pose le doigt `id` en (x, y) sans toucher aux autres. */
    async down(id, x, y) {
      if (active.has(id)) throw new Error(`touch.down : le doigt ${id} est déjà posé`);
      await api.set([...api.active(), [x, y, id]]);
    },
    /** Déplace le doigt `id`. */
    async moveTo(id, x, y) {
      if (!active.has(id)) throw new Error(`touch.moveTo : le doigt ${id} n'est pas posé`);
      await api.set(api.active().map((p) => (p[2] === id ? [x, y, id] : p)));
    },
    /** Lève le doigt `id` (sans argument : tous les doigts). */
    async up(id) {
      await api.set(id === undefined ? [] : api.active().filter((p) => p[2] !== id));
    },
    /** Tape brève en (x, y) avec le doigt `id`, les autres doigts restant posés. */
    async tap(x, y, id = 99, holdMs = 50) {
      await api.down(id, x, y);
      await t.wait(holdMs);
      await api.up(id);
    },
  };
  t._touches = api;
  return api;
}

/** Tape brève en (x, y) ; les doigts déjà posés via touches(t) restent posés. */
export function tap(t, x, y, id = 99, holdMs = 50) {
  return touches(t).tap(x, y, id, holdMs);
}
