import type { SaveData, Settings, StageResult } from './types';

// Sauvegarde locale (localStorage). Fonctionne dans la WebView Capacitor sur Android et iOS ;
// pourra être remplacée par @capacitor/preferences sans changer cette interface.

const KEY = 'xeno-rift-save-v1';

const DEFAULT_SETTINGS: Settings = {
  music: true,
  sfx: true,
  haptics: true,
  tilt: false,
  unlockAll: false,
};

function defaults(): SaveData {
  return { version: 1, unlocked: 0, best: {}, settings: { ...DEFAULT_SETTINGS } };
}

let data: SaveData = load();

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) return defaults();
    return {
      version: 1,
      unlocked: typeof parsed.unlocked === 'number' ? parsed.unlocked : 0,
      best: parsed.best ?? {},
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    return defaults();
  }
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Stockage indisponible (navigation privée…) : la partie continue sans sauvegarde.
  }
}

export function getSave(): Readonly<SaveData> {
  return data;
}

export function getSettings(): Readonly<Settings> {
  return data.settings;
}

export function updateSettings(patch: Partial<Settings>): Readonly<Settings> {
  data.settings = { ...data.settings, ...patch };
  persist();
  return data.settings;
}

export function isUnlocked(stageIndex: number): boolean {
  return data.settings.unlockAll || stageIndex <= data.unlocked;
}

/** Enregistre un résultat : meilleur score et déblocage de l'étape suivante. */
export function recordResult(stageIndex: number, result: StageResult): void {
  const prev = data.best[result.stageId];
  if (!prev || result.score > prev.score || result.stars > prev.stars) {
    data.best[result.stageId] = {
      score: Math.max(result.score, prev?.score ?? 0),
      stars: Math.max(result.stars, prev?.stars ?? 1) as 1 | 2 | 3,
    };
  }
  data.unlocked = Math.max(data.unlocked, stageIndex + 1);
  persist();
}

export function resetProgress(): void {
  data = { ...defaults(), settings: data.settings };
  persist();
}
