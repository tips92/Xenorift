import {
  BASE_HEARTS,
  BASE_SHIELDS,
  BOOST_MULS,
  CREW,
  formatMul,
  HANGAR_TABS,
  MAX_HEARTS_CAP,
  MAX_SHIELDS_CAP,
  maxHeartsFor,
  maxShieldsFor,
  UPGRADE_MULS,
  UPGRADE_STATS,
  upgradeItemId,
  weaponItemId,
  type HangarItemId,
  type HangarItemKind,
  type HangarTab,
  type ItemState,
} from '../../core/hangar';
import { equipWeapon, getCrystals, getItemState, getSave, playLoadout, purchase } from '../../core/save';
import type { CrewId, StageDef, UpgradeStat, WeaponId } from '../../core/types';
import { WEAPON_IDS, WEAPONS } from '../../core/weapons';
import { div, el, formatNumber, icon, play, prefersReducedMotion } from '../dom';
import { departLabel } from '../flow';
import type { HangarPreview, PreviewView } from '../hangarPreview';
import { ICONS, upgradeIcon, weaponIcon } from '../icons';
import type { UiCtx } from '../services';
import { button, screenHeader, screenRoot, type Screen } from './common';

// Hangar de la Comète (docs/plans/03-hangar.md, points 4 et 7) : réserve de cristaux en haut, aperçu à
// gauche (canvas chargé à la demande : hors du bundle de l'accueil), onglets Établi / Comète / Kaï et liste
// des achats à droite. Achat avec confirmation intégrée (le retour la ferme d'abord) ; équipement de l'arme.
// Données et règles : core/hangar.ts ; enregistrement : core/save.ts (purchase, equipWeapon).

export interface HangarActions {
  back(): void;
  /** Bouton de départ vers l'étape suivante ; null = ouvert depuis Niveaux (pas de départ). */
  depart: (() => void) | null;
}

const SHAKE: Keyframe[] = [
  { transform: 'translate3d(0,0,0)' },
  { transform: 'translate3d(-7px,0,0)' },
  { transform: 'translate3d(6px,0,0)' },
  { transform: 'translate3d(-3px,0,0)' },
  { transform: 'translate3d(0,0,0)' },
];

const TAB_ICONS: Record<HangarTab, string> = { bench: ICONS.wrench, ship: ICONS.ship, kai: ICONS.helmet };

const KIND_ICONS: Record<Exclude<HangarItemKind, 'weapon' | 'upgrade'>, string> = {
  shipGun: ICONS.shipGun,
  shipShield: ICONS.shield,
  shipBoost: ICONS.boost,
  heart: ICONS.heart,
};

/** Le laser n'a pas de fiche d'achat (donné au départ). */
const LASER_DESC = 'Arme de départ, précise et polyvalente.';

/** Durée d'un message du hangar (refus, équipement pour la session). */
const MSG_MS = 2600;

/** Armes au féminin (accords : « Équipée », « de la Pompe ») ; les autres sont au masculin. */
const FEMININE: Partial<Record<WeaponId, true>> = { shotgun: true };

/** Équipière de l'Établi (niveaux 2 et 3 des améliorations, core/hangar.ts) : mention et aperçu une fois à bord. */
const BENCH_CREW: CrewId = 'tess';

/** Accord avec le nom de l'arme : agree('shotgun', 'Équipé') → « Équipée ». */
function agree(w: WeaponId, word: string): string {
  return FEMININE[w] ? `${word}e` : word;
}

/** « le Mitrailleur », « la Pompe » (de = true : « du Mitrailleur », « de la Pompe »). */
function weaponWithArticle(w: WeaponId, de = false): string {
  const art = FEMININE[w] ? (de ? 'de la' : 'la') : de ? 'du' : 'le';
  return `${art} ${WEAPONS[w].name}`;
}

/** Caractéristique avec son article, pour les phrases d'achat. */
const STAT_PHRASE: Record<UpgradeStat, string> = {
  damage: 'les dégâts',
  fireRate: 'la cadence',
  range: 'la portée',
  cooling: 'le refroidissement',
};

let seq = 0;

/** État d'une arme pour le hangar : possédée (sauvegarde), utilisable (mode test compris), équipée. */
interface WeaponStatus {
  readonly weapon: WeaponId;
  readonly owned: boolean;
  readonly usable: boolean;
  readonly equipped: boolean;
  /** Achat de l'arme (null pour le laser). */
  readonly item: ItemState | null;
}

/** Ligne d'effet : multiplicateur ou valeur actuels → suivants (niveau max : l'effet actuel). */
function effectLine(st: ItemState): string {
  const it = st.item;
  const l = st.level;
  const arrow = (a: string, b: string): string => (st.maxed ? a : `${a} → ${b}`);
  switch (it.kind) {
    case 'upgrade': {
      if (!it.stat) return st.effect ?? st.nextEffect ?? '';
      const m = UPGRADE_MULS[it.stat];
      return st.maxed ? (st.effect ?? '') : arrow(formatMul(m[l]), formatMul(m[l + 1] ?? m[l]));
    }
    case 'shipBoost':
      // Énergie partagée par le tir et le turbo : turbo qui dure plus longtemps, jauge qui refroidit plus vite
      // (aussi après les tirs)
      return `Durée du turbo et refroidissement ${arrow(formatMul(BOOST_MULS[l]), formatMul(BOOST_MULS[l + 1] ?? BOOST_MULS[l]))}`;
    case 'shipShield':
      return `${arrow(String(maxShieldsFor(l)), String(maxShieldsFor(l + 1)))} boucliers`;
    case 'heart':
      return `${arrow(String(maxHeartsFor(l)), String(maxHeartsFor(l + 1)))} cœurs`;
    case 'shipGun':
      // « Canon léger → Mitrailleuse : cadence ×2,5 », puis « Dégâts ×1,25, cadence ×1,15 »… (core/shipGuns.ts)
      return st.maxed ? (st.effect ?? '') : (st.nextEffect ?? '');
    case 'weapon':
      return it.desc;
  }
}

/**
 * Phrase de l'achat (confirmation, lecteur d'écran) : « Améliorer les dégâts du Pistolet laser (×1,25) »,
 * « Acheter la Pompe », « Installer le bouclier renforcé (4 boucliers) »…
 */
function buyPhrase(st: ItemState): string {
  const it = st.item;
  const l = st.level;
  switch (it.kind) {
    case 'weapon':
      return it.weapon ? `Acheter ${weaponWithArticle(it.weapon)}` : `Acheter ${it.name}`;
    case 'upgrade': {
      if (!it.weapon || !it.stat) return `Améliorer : ${it.name}`;
      const m = UPGRADE_MULS[it.stat][l + 1];
      return `Améliorer ${STAT_PHRASE[it.stat]} ${weaponWithArticle(it.weapon, true)}${m ? ` (${formatMul(m)})` : ''}`;
    }
    case 'shipGun':
      return l === 0 ? 'Installer la mitrailleuse' : `Améliorer la mitrailleuse (${(st.nextEffect ?? '').toLowerCase()})`;
    case 'shipShield':
      return `${l === 0 ? 'Installer le bouclier renforcé' : 'Renforcer encore le bouclier'} (${maxShieldsFor(l + 1)} boucliers)`;
    case 'shipBoost':
      return `${l === 0 ? 'Améliorer' : 'Améliorer encore'} le turbo (durée du turbo et refroidissement ${formatMul(BOOST_MULS[l + 1] ?? BOOST_MULS[l])})`;
    case 'heart':
      return `Acheter un cœur supplémentaire (${maxHeartsFor(l + 1)} cœurs)`;
  }
}

function pips(level: number, max: number): HTMLElement {
  const p = el('span', 'hg-pips');
  p.setAttribute('role', 'img');
  p.setAttribute('aria-label', `Niveau ${level} sur ${max}`);
  for (let i = 0; i < max; i++) p.append(el('span', `hg-pip${i < level ? ' is-on' : ''}`));
  return p;
}

function note(text: string, cls: string, svg: string): HTMLElement {
  const n = el('span', `hg-note ${cls}`);
  n.append(icon(svg, 'ico hg-note-ico'), el('span', '', text));
  return n;
}

/** Rangée d'emplacements (cœurs, boucliers) : `n` allumés sur `cap`, ceux au-delà de `base` achetés. */
function slots(svg: string, cls: string, n: number, base: number, cap: number, label: string): HTMLElement {
  const row = el('span', `hg-slots ${cls}`);
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', label);
  for (let i = 0; i < cap; i++) {
    row.append(icon(svg, `ico hg-slot${i < n ? ' is-on' : ''}${i >= base ? ' is-extra' : ''}`));
  }
  return row;
}

export function createHangarScreen(ctx: UiCtx, next: StageDef | null, a: HangarActions): Screen {
  const uid = ++seq;
  const root = screenRoot('hangar');
  const reduced = prefersReducedMotion();
  let tab: HangarTab = 'bench';
  /** Arme affichée sur l'Établi (ses améliorations, l'aperçu) ; au départ, l'arme équipée. */
  let selected: WeaponId = playLoadout(ctx.settings).equipped;
  let preview: HangarPreview | null = null;
  let shownOnce = false;
  let disposed = false;

  // ---------------------------------------------------------------- En-tête : retour, titre, réserve

  const wallet = div('hg-wallet');
  wallet.setAttribute('role', 'status');
  const walletN = el('span', 'hg-wallet-n');
  wallet.append(icon(ICONS.crystal, 'ico hg-wallet-ico'), walletN);
  const header = screenHeader(ctx, 'Hangar', () => a.back(), wallet);

  // ---------------------------------------------------------------- Aperçu (gauche) et départ

  const body = div('hg-body');
  const side = div('hg-side');
  const stage = div('hg-stage');
  const caption = div('hg-caption');
  const capTitle = el('span', 'hg-caption-title');
  const capLine = el('span', 'hg-caption-line');
  caption.append(capTitle, capLine);
  const canvasHost = div('hg-canvas');
  const stageFlash = div('hg-stage-flash');
  stage.append(caption, canvasHost, stageFlash);
  side.append(stage);
  const depart = a.depart;
  if (depart && next) {
    side.append(
      button(ctx, {
        label: departLabel(next),
        sub: next.title,
        icon: ICONS.launch,
        cls: 'btn-primary hg-depart',
        onPress: () => depart(),
      }),
    );
  }

  // ---------------------------------------------------------------- Onglets et liste (droite)

  const main = div('hg-main');
  const tabs = div('hg-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Rayons du hangar');
  const list = div('screen-body hg-list');
  list.id = `hg-list-${uid}`;
  list.setAttribute('role', 'tabpanel');
  const tabBtns = {} as Record<HangarTab, HTMLButtonElement>;
  for (const t of HANGAR_TABS) {
    const b = el('button', `hg-tab hg-tab--${t.id}`);
    b.type = 'button';
    b.id = `hg-tab-${uid}-${t.id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', list.id);
    b.append(icon(TAB_ICONS[t.id], 'ico hg-tab-ico'), el('span', 'hg-tab-label', t.label));
    b.addEventListener('click', (e) => {
      e.preventDefault();
      selectTab(t.id, false);
    });
    tabBtns[t.id] = b;
    tabs.append(b);
  }
  tabs.addEventListener('keydown', (e) => {
    const n = HANGAR_TABS.length;
    const i = HANGAR_TABS.findIndex((t) => t.id === tab);
    let j: number;
    switch (e.key) {
      case 'ArrowLeft':
        j = i - 1;
        break;
      case 'ArrowRight':
        j = i + 1;
        break;
      case 'Home':
        j = 0;
        break;
      case 'End':
        j = n - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    selectTab(HANGAR_TABS[(j + n) % n].id, true);
  });
  // Message du hangar (refus, équipement pour la session) : un seul, en bas de la liste, remplacé à chaque fois.
  const msg = div('hg-msg');
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-live', 'polite');
  let msgTimer = 0;
  main.append(tabs, list, msg);
  body.append(side, main);

  // ---------------------------------------------------------------- Confirmation d'achat

  const confirm = div('confirm hg-confirm');
  confirm.setAttribute('role', 'alertdialog');
  confirm.setAttribute('aria-modal', 'true');
  const cBox = div('panel confirm-box hg-confirm-box');
  const cTitle = el('h3', 'confirm-title', 'Confirmer l’achat');
  cTitle.id = `hg-confirm-title-${uid}`;
  const cText = el('p', 'confirm-text');
  cText.id = `hg-confirm-text-${uid}`;
  confirm.setAttribute('aria-labelledby', cTitle.id);
  confirm.setAttribute('aria-describedby', cText.id);
  const cFunds = el('p', 'hg-confirm-funds');
  const cActions = div('confirm-actions');
  const cOk = button(ctx, { label: 'Acheter', icon: ICONS.crystal, cls: 'btn-primary', silent: true, onPress: () => confirmBuy() });
  cActions.append(button(ctx, { label: 'Annuler', onPress: () => closeConfirm(true) }), cOk);
  cBox.append(icon(ICONS.crystal, 'ico confirm-ico hg-confirm-ico'), cTitle, cText, cFunds, cActions);
  confirm.append(cBox);
  // Fermée (transparente), la boîte reste hors de la navigation au clavier.
  confirm.inert = true;
  // Toucher le fond ferme la boîte.
  confirm.addEventListener('click', (e) => {
    if (e.target === confirm) {
      ctx.audio.sfx('click', { pitch: 0.85 });
      closeConfirm(true);
    }
  });
  /** Achat en attente de confirmation (boîte ouverte) et bouton à qui rendre le focus. */
  let pending: { id: HangarItemId; from: HTMLElement | null } | null = null;

  root.append(header, body, confirm);

  // ---------------------------------------------------------------- État

  function weaponStatus(w: WeaponId): WeaponStatus {
    const lo = playLoadout(ctx.settings);
    return {
      weapon: w,
      owned: getSave().loadout.owned.includes(w),
      usable: lo.owned.includes(w),
      equipped: lo.equipped === w,
      item: w === 'laser' ? null : (getItemState(weaponItemId(w)) ?? null),
    };
  }

  function statusText(st: WeaponStatus): string {
    if (st.equipped) return agree(st.weapon, 'Équipé');
    if (st.owned) return agree(st.weapon, 'Possédé');
    if (st.usable) return 'Essai (mode test)';
    return st.item?.lock === 'blueprint' ? 'Plan manquant' : 'Non possédée';
  }

  function previewView(): PreviewView {
    if (tab === 'ship') {
      const s = getSave().ship;
      return { kind: 'ship', gun: s.gun, shield: s.shield, boost: s.boost };
    }
    if (tab === 'bench') return { kind: 'kai', weapon: selected, tess: getSave().crew.includes(BENCH_CREW) };
    return { kind: 'kai', weapon: playLoadout(ctx.settings).equipped };
  }

  // ---------------------------------------------------------------- Rendu

  function updateWallet(): void {
    const n = getCrystals();
    walletN.textContent = formatNumber(n);
    wallet.setAttribute('aria-label', `Réserve : ${n} ${n > 1 ? 'cristaux' : 'cristal'}`);
  }

  function updateCaption(): void {
    capLine.replaceChildren();
    const lo = playLoadout(ctx.settings);
    if (tab === 'ship') {
      capTitle.textContent = 'La Comète';
      const n = lo.ship.maxShields;
      capLine.append(
        slots(ICONS.hex, 'hg-slots--shield', n, BASE_SHIELDS, MAX_SHIELDS_CAP, `${n} boucliers`),
        el('span', 'hg-caption-sub', lo.ship.gunLevel > 0 ? 'Mitrailleuse' : 'Canon léger'),
      );
    } else if (tab === 'kai') {
      capTitle.textContent = 'Kaï';
      const n = lo.maxHearts;
      capLine.append(
        slots(ICONS.heart, 'hg-slots--heart', n, BASE_HEARTS, MAX_HEARTS_CAP, `${n} cœurs`),
        el('span', 'hg-caption-sub', WEAPONS[lo.equipped].name),
      );
    } else {
      const st = weaponStatus(selected);
      capTitle.textContent = WEAPONS[selected].name;
      capLine.append(el('span', `hg-caption-sub${st.equipped ? ' is-on' : ''}`, statusText(st)));
      if (getSave().crew.includes(BENCH_CREW)) {
        const crew = el('span', 'hg-caption-sub hg-crew');
        crew.append(icon(ICONS.helmet, 'ico hg-crew-ico'), el('span', '', `${CREW[BENCH_CREW].name} à l’établi`));
        capLine.append(crew);
      }
    }
  }

  function updateTabs(): void {
    for (const t of HANGAR_TABS) {
      const b = tabBtns[t.id];
      const on = t.id === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
    list.setAttribute('aria-labelledby', tabBtns[tab].id);
  }

  function sectionTitle(text: string): HTMLElement {
    const h = el('h3', 'hg-section');
    h.append(el('span', 'hg-section-text', text));
    return h;
  }

  function buyButton(st: ItemState): HTMLButtonElement {
    const price = st.price ?? 0;
    const b = el('button', `hg-buy${st.canBuy ? '' : ' is-locked'}`);
    b.type = 'button';
    b.dataset.buy = st.item.id;
    if (!st.canBuy) b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-label', `${buyPhrase(st)} pour ${price} cristaux${st.canBuy ? '' : ` : ${st.lockText}`}`);
    b.append(el('span', 'hg-buy-n', formatNumber(price)), icon(ICONS.crystal, 'ico hg-buy-ico'));
    b.addEventListener('click', (e) => {
      e.preventDefault();
      askBuy(st.item.id, b);
    });
    return b;
  }

  /** Notes sous l'effet : condition manquante, condition levée par le mode test, effet pas encore branché. */
  function notesOf(st: ItemState): HTMLElement | null {
    const n = div('hg-item-notes');
    // « Réserve insuffisante » : seulement le prix éteint (sinon toutes les cartes le répètent).
    if (st.lock && st.lock !== 'max' && st.lock !== 'funds') n.append(note(st.lockText, 'is-lock', ICONS.lock));
    if (st.bypassed) n.append(note('Mode test', 'is-test', ICONS.unlock));
    if (st.item.soon) n.append(note('Effet en vol : bientôt', 'is-soon', ICONS.clock));
    return n.childElementCount ? n : null;
  }

  /** Carte d'un achat : icône, nom, niveau en pastilles, effet, notes, prix (ou « Max »). */
  function itemRow(id: HangarItemId, svg: string): HTMLElement {
    const st = getItemState(id);
    const row = div('hg-item');
    if (!st) return row;
    const it = st.item;
    // Verrou (condition manquante) ≠ réserve insuffisante (seul le prix s'éteint).
    const locked = st.lock !== null && st.lock !== 'max' && st.lock !== 'funds';
    row.className = `hg-item hg-item--${it.kind}${st.maxed ? ' is-max' : ''}${locked ? ' is-locked' : ''}${st.lock === 'funds' ? ' is-funds' : ''}`;
    row.dataset.item = id;
    row.append(icon(svg, `ico hg-item-ico hg-item-ico--${it.kind}`));
    const text = div('hg-item-text');
    const top = div('hg-item-top');
    top.append(el('span', 'hg-item-name', it.name));
    if (it.maxLevel > 1) top.append(pips(st.level, it.maxLevel));
    text.append(top, el('span', 'hg-item-line', effectLine(st)));
    const notes = notesOf(st);
    if (notes) text.append(notes);
    const actions = div('hg-actions');
    actions.append(st.maxed ? el('span', 'hg-max', 'Max') : buyButton(st));
    row.append(text, actions);
    return row;
  }

  function equipButton(w: WeaponId, on: boolean): HTMLButtonElement {
    const b = el('button', `hg-equip${on ? ' is-on' : ''}`);
    b.type = 'button';
    b.dataset.equip = w;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? `Arme équipée : ${WEAPONS[w].name}` :`Équiper ${WEAPONS[w].name}`);
    if (on) b.append(icon(ICONS.check, 'ico hg-equip-ico'));
    b.append(el('span', '', on ? agree(w, 'Équipé') : 'Équiper'));
    b.addEventListener('click', (e) => {
      e.preventDefault();
      onEquip(w, b);
    });
    return b;
  }

  /** Fiche de l'arme choisie : équiper, et l'acheter si elle n'est pas possédée. */
  function weaponRow(w: WeaponId): HTMLElement {
    const st = weaponStatus(w);
    const row = div(`hg-item hg-item--weapon${st.equipped ? ' is-equipped' : ''}${st.usable ? '' : ' is-locked'}`);
    if (st.item) row.dataset.item = st.item.item.id;
    row.dataset.weapon = w;
    row.append(icon(weaponIcon(w), 'ico hg-item-ico hg-item-ico--weapon'));
    const text = div('hg-item-text');
    const top = div('hg-item-top');
    top.append(el('span', 'hg-item-name', WEAPONS[w].name));
    text.append(top, el('span', 'hg-item-line', st.item ? st.item.item.desc : LASER_DESC));
    const notes = !st.owned && st.item ? notesOf(st.item) : null;
    if (notes) text.append(notes);
    const actions = div('hg-actions');
    if (st.usable) actions.append(equipButton(w, st.equipped));
    if (!st.owned && st.item && !st.item.maxed) actions.append(buyButton(st.item));
    row.append(text, actions);
    return row;
  }

  /** État d'une arme sous son nom : équipée, possédée, prix (achetable) ou plan manquant. */
  function weaponState(st: WeaponStatus): HTMLElement {
    const s = el('span', 'hg-weapon-state');
    const it = st.item;
    if (st.equipped) {
      s.classList.add('is-equipped');
      s.textContent = agree(st.weapon, 'Équipé');
    } else if (st.owned || !it || it.maxed) {
      s.textContent = agree(st.weapon, 'Possédé');
    } else if (it.lock === 'blueprint') {
      s.classList.add('is-lock');
      s.textContent = 'Plan manquant';
    } else {
      // Achetable (ou réserve insuffisante : prix éteint) ; autre condition : son texte.
      const cond = it.lock !== null && it.lock !== 'funds';
      s.classList.add(cond ? 'is-lock' : it.canBuy ? 'is-price' : 'is-funds');
      if (cond) s.textContent = it.lockText;
      else s.append(el('span', '', formatNumber(it.price ?? 0)), icon(ICONS.crystal, 'ico hg-weapon-state-ico'));
    }
    return s;
  }

  /** Sélecteur des 4 armes (Établi) : choisir n'équipe pas, ça montre l'arme et ses améliorations. */
  function weaponPicker(): HTMLElement {
    const group = div('hg-weapons');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Armes de Kaï');
    for (const w of WEAPON_IDS) {
      const st = weaponStatus(w);
      const on = w === selected;
      const b = el('button', `hg-weapon${on ? ' is-selected' : ''}${st.usable ? '' : ' is-locked'}`);
      b.type = 'button';
      b.dataset.weapon = w;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('aria-label', `${WEAPONS[w].name} : ${statusText(st)}`);
      b.tabIndex = on ? 0 : -1;
      b.append(icon(weaponIcon(w), 'ico hg-weapon-ico'), el('span', 'hg-weapon-name', WEAPONS[w].name), weaponState(st));
      b.addEventListener('click', (e) => {
        e.preventDefault();
        // La liste est reconstruite : le focus suit la nouvelle pastille (clavier).
        selectWeapon(w, document.activeElement === b);
      });
      group.append(b);
    }
    group.addEventListener('keydown', (e) => {
      const n = WEAPON_IDS.length;
      const i = WEAPON_IDS.indexOf(selected);
      let j: number;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          j = i - 1;
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          j = i + 1;
          break;
        case 'Home':
          j = 0;
          break;
        case 'End':
          j = n - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      selectWeapon(WEAPON_IDS[(j + n) % n], true);
    });
    return group;
  }

  /** Rangée « bientôt » (drone compagnon) : rien à acheter. */
  function soonRow(svg: string, name: string, line: string): HTMLElement {
    const row = div('hg-item hg-item--soon');
    row.append(icon(svg, 'ico hg-item-ico'));
    const text = div('hg-item-text');
    const top = div('hg-item-top');
    top.append(el('span', 'hg-item-name', name));
    text.append(top, el('span', 'hg-item-line', line));
    const actions = div('hg-actions');
    actions.append(el('span', 'hg-tag', 'Bientôt'));
    row.append(text, actions);
    return row;
  }

  function renderTab(): void {
    if (tab === 'bench') {
      list.append(weaponPicker(), weaponRow(selected), sectionTitle(`Améliorations · ${WEAPONS[selected].name}`));
      for (const s of UPGRADE_STATS) list.append(itemRow(upgradeItemId(selected, s), upgradeIcon(s)));
    } else if (tab === 'ship') {
      list.append(
        itemRow('ship.gun', KIND_ICONS.shipGun),
        itemRow('ship.shield', KIND_ICONS.shipShield),
        itemRow('ship.boost', KIND_ICONS.shipBoost),
      );
    } else {
      list.append(
        itemRow('kai.heart', KIND_ICONS.heart),
        soonRow(ICONS.drone, 'Drone compagnon', 'Un petit allié qui tire avec Kaï.'),
      );
    }
    let i = 0;
    for (const c of Array.from(list.children)) (c as HTMLElement).style.setProperty('--i', String(i++));
  }

  /**
   * Redessine la liste (défilement gardé), la réserve, la légende et l'aperçu. `focus` : sélecteur de
   * l'élément à qui rendre le focus (puis `fallback`, puis l'onglet actif).
   */
  function refresh(focus?: string, fallback?: string): void {
    const top = list.scrollTop;
    list.classList.remove('is-enter');
    list.replaceChildren();
    renderTab();
    list.scrollTop = top;
    updateWallet();
    updateCaption();
    preview?.show(previewView());
    if (focus) {
      const t = list.querySelector<HTMLElement>(focus) ?? (fallback ? list.querySelector<HTMLElement>(fallback) : null);
      (t ?? tabBtns[tab]).focus({ preventScroll: true });
    }
  }

  function selectTab(t: HangarTab, focus: boolean): void {
    if (t !== tab) {
      tab = t;
      ctx.audio.sfx('click', { pitch: 1.05 });
      ctx.audio.haptic(6);
      hideMsg(true);
      updateTabs();
      list.scrollTop = 0;
      refresh();
      // Entrée des cartes (pas après un achat : refresh retire la classe).
      if (!reduced) {
        void list.offsetWidth;
        list.classList.add('is-enter');
      }
    }
    if (focus) tabBtns[t].focus();
  }

  function selectWeapon(w: WeaponId, focus: boolean): void {
    if (w !== selected) {
      selected = w;
      ctx.audio.sfx('click', { pitch: 1.12 });
      ctx.audio.haptic(6);
      refresh(focus ? `.hg-weapon[data-weapon="${w}"]` : undefined);
    } else if (focus) {
      list.querySelector<HTMLElement>(`.hg-weapon[data-weapon="${w}"]`)?.focus();
    }
  }

  // ---------------------------------------------------------------- Actions

  /**
   * Message en bas de la liste (en haut si la carte touchée `near` est dans le bas : elle reste visible) ;
   * remplace le précédent (jamais d'empilement), effacé après MSG_MS.
   */
  function say(text: string, kind: 'bad' | 'info', near?: Element): void {
    window.clearTimeout(msgTimer);
    const again = msg.classList.contains('is-on') && msg.textContent === text;
    let top = false;
    if (near) {
      const r = near.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      top = r.top + r.height / 2 > l.top + l.height / 2;
    }
    msg.textContent = text;
    msg.className = `hg-msg is-${kind} is-on${top ? ' is-top' : ''}`;
    msg.style.top = top ? `${list.offsetTop + 8}px` : '';
    // Même message répété : petit rebond (le texte ne change pas).
    if (again && !reduced) {
      play(msg, [{ transform: 'translate3d(-50%,0,0) scale(1.06)' }, { transform: 'translate3d(-50%,0,0) scale(1)' }], {
        duration: 220,
        easing: 'ease-out',
      });
    }
    msgTimer = window.setTimeout(() => hideMsg(false), MSG_MS);
  }

  /** Cache le message (fondu) ; `now` : tout de suite, texte vidé (changement d'onglet, sortie). */
  function hideMsg(now: boolean): void {
    window.clearTimeout(msgTimer);
    msgTimer = 0;
    msg.classList.remove('is-on');
    if (now) msg.textContent = '';
  }

  function deny(target: Element, text: string): void {
    ctx.audio.sfx('click', { pitch: 0.55 });
    ctx.audio.haptic([18, 40, 18]);
    play(target, SHAKE, { id: 'hg-shake', duration: 360, easing: 'ease-out' });
    // La raison déjà écrite sur la carte clignote en rouge (un seul petit texte).
    const lock = target.querySelector('.hg-note.is-lock');
    if (lock && !reduced) {
      const red = '#ff4f7a';
      play(
        lock,
        [1, 0.35, 1, 0.35, 1].map((opacity) => ({ color: red, opacity })),
        { id: 'hg-blink', duration: 700, easing: 'linear' },
      );
    }
    say(text, 'bad', target);
  }

  function onEquip(w: WeaponId, from: HTMLElement): void {
    // Déjà équipée : rien à faire, sauf pour une arme possédée équipée pour la session seulement (on l'enregistre).
    const st = weaponStatus(w);
    if (st.equipped && (!st.owned || getSave().loadout.equipped === w)) {
      ctx.audio.sfx('click', { pitch: 0.9 });
      return;
    }
    const r = equipWeapon(w);
    if (r === 'refused') {
      deny(from.closest('.hg-item') ?? from, 'Arme non possédée');
      return;
    }
    ctx.audio.sfx('click', { pitch: 1.25 });
    ctx.audio.haptic(12);
    if (r === 'session') say(`${agree(w, 'Équipé')} pour cette session (mode test)`, 'info', from.closest('.hg-item') ?? from);
    else hideMsg(false);
    refresh(`[data-equip="${w}"]`);
    preview?.pulse();
    flashStage();
  }

  function askBuy(id: HangarItemId, from: HTMLElement): void {
    const st = getItemState(id);
    if (!st) return;
    if (!st.canBuy || st.price === null) {
      deny(from.closest('.hg-item') ?? from, st.lockText || 'Achat impossible');
      return;
    }
    ctx.audio.sfx('click');
    ctx.audio.haptic(8);
    openConfirm(st, from);
  }

  function openConfirm(st: ItemState, from: HTMLElement): void {
    const price = st.price ?? 0;
    const have = getCrystals();
    pending = { id: st.item.id, from };
    hideMsg(false);
    cText.textContent = `${buyPhrase(st)} pour ${formatNumber(price)} cristaux\u00a0?`;
    cFunds.replaceChildren(
      icon(ICONS.crystal, 'ico'),
      el('span', '', `Réserve : ${formatNumber(have)} → ${formatNumber(Math.max(0, have - price))}`),
    );
    confirm.classList.add('is-open');
    confirm.inert = false;
    // Le reste de l'écran est inerte (ni focus ni toucher) tant que la boîte est ouverte.
    header.inert = true;
    body.inert = true;
    cOk.focus({ preventScroll: true });
  }

  function closeConfirm(restore: boolean): void {
    if (!pending) return;
    const p = pending;
    pending = null;
    confirm.classList.remove('is-open');
    confirm.inert = true;
    header.inert = false;
    body.inert = false;
    if (restore && p.from && p.from.isConnected) p.from.focus({ preventScroll: true });
  }

  function confirmBuy(): void {
    if (!pending) return;
    const id = pending.id;
    const res = purchase(id);
    closeConfirm(false);
    if (!res.ok) {
      ctx.audio.sfx('click', { pitch: 0.55 });
      ctx.audio.haptic([18, 40, 18]);
      refresh(`[data-buy="${id}"]`);
      say(res.text, 'bad');
      return;
    }
    ctx.audio.sfx('buy');
    ctx.audio.haptic([16, 40, 24]);
    // Arme achetée : le prix disparaît, le focus va au bouton « Équiper ».
    const w = getItemState(id)?.item.weapon ?? null;
    refresh(`[data-buy="${id}"]`, w ? `[data-equip="${w}"]` : undefined);
    celebrate(id, res.level, res.price);
  }

  // ---------------------------------------------------------------- Effets (transform / opacity seulement)

  function flashStage(): void {
    if (reduced) return;
    play(stageFlash, [{ opacity: 0.9 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
  }

  function celebrate(id: HangarItemId, level: number, price: number): void {
    preview?.pulse();
    if (reduced) return;
    flashStage();
    const row = list.querySelector<HTMLElement>(`[data-item="${id}"]`);
    if (row) {
      row.querySelectorAll('.hg-pip')[level - 1]?.classList.add('is-new');
      const fx = el('span', 'hg-item-flash');
      row.append(fx);
      play(fx, [{ opacity: 1 }, { opacity: 0 }], { duration: 800, easing: 'ease-out' });
      window.setTimeout(() => fx.remove(), 850);
    }
    play(wallet, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
      duration: 380,
      easing: 'ease-out',
    });
    const spent = el('span', 'hg-spent', `−${formatNumber(price)}`);
    spent.setAttribute('aria-hidden', 'true');
    wallet.append(spent);
    play(
      spent,
      [
        { opacity: 0, transform: 'translate3d(6px,4px,0)' },
        { opacity: 1, transform: 'translate3d(0,0,0)', offset: 0.2 },
        { opacity: 0, transform: 'translate3d(0,-10px,0)' },
      ],
      { duration: 900, easing: 'ease-out' },
    );
    window.setTimeout(() => spent.remove(), 950);
  }

  // ---------------------------------------------------------------- Aperçu chargé à la demande

  void import('../hangarPreview')
    .then((m) => {
      if (disposed) return;
      preview = m.createHangarPreview(canvasHost);
      preview.show(previewView());
      if (shownOnce) preview.setActive(true);
    })
    .catch((err: unknown) => {
      console.error('[hangar] aperçu indisponible', err);
    });

  updateTabs();
  refresh();
  if (!reduced) list.classList.add('is-enter');

  return {
    name: 'hangar',
    el: root,
    shown(): void {
      shownOnce = true;
      preview?.setActive(true);
    },
    back(): boolean {
      if (pending) {
        ctx.audio.sfx('click', { pitch: 0.85 });
        closeConfirm(true);
        return true;
      }
      a.back();
      return true;
    },
    dispose(): void {
      disposed = true;
      hideMsg(true);
      closeConfirm(false);
      preview?.dispose();
      preview = null;
    },
  };
}
