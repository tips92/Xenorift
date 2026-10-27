import type { ThemeId } from '../../core/types';

// Palettes « néon extraterrestre » de chaque monde.

export interface ThemePalette {
  /** Contour sombre de lisibilité. */
  outline: string;
  // Sol
  soilDeep: string;
  soil: string;
  soilLight: string;
  soilSpeck: string;
  /** Couche de surface (mousse / croûte de régolithe). */
  surface: string;
  surfaceLight: string;
  surfaceDark: string;
  /** Lueur de la surface. */
  surfaceGlow: string;
  /** Veines / spores lumineuses dans le sol. */
  vein: string;
  veinLight: string;
  /** Accents secondaires. */
  accent: string;
  accentLight: string;
  // Blocs
  blockBase: string;
  blockLight: string;
  blockDark: string;
  bonusFrame: string;
  bonusGlyph: string;
  bonusCore: string;
  // Ciel (parallaxe)
  skyTop: string;
  skyMid: string;
  skyLow: string;
  horizon: string;
  galaxy: string;
  nebulaA: string;
  nebulaB: string;
  /** Silhouettes : lointaine, moyenne, proche. */
  far: string;
  farLight: string;
  mid: string;
  midLight: string;
  near: string;
  nearLight: string;
  mist: string;
  bioA: string;
  bioB: string;
}

export const PALETTES: Record<ThemeId, ThemePalette> = {
  jungle: {
    outline: '#120622',
    soilDeep: '#1a0a2e',
    soil: '#2c1449',
    soilLight: '#45246c',
    soilSpeck: '#6a3f9a',
    surface: '#18d9a8',
    surfaceLight: '#9dffe4',
    surfaceDark: '#0a6e6c',
    surfaceGlow: '#3dffd2',
    vein: '#36f0ff',
    veinLight: '#c8fdff',
    accent: '#ff4fd8',
    accentLight: '#ffb3f0',
    blockBase: '#2e3c5e',
    blockLight: '#5d7aa6',
    blockDark: '#141a33',
    bonusFrame: '#ffcc33',
    bonusGlyph: '#fff27a',
    bonusCore: '#ff3fc8',
    skyTop: '#05021a',
    skyMid: '#1a0c4a',
    skyLow: '#3d1a78',
    horizon: '#7a3aa0',
    galaxy: '#3fffe0',
    nebulaA: '#ff3fc8',
    nebulaB: '#3a6bff',
    far: '#3b2a7c',
    farLight: '#6a58b8',
    mid: '#241552',
    midLight: '#4a3290',
    near: '#110628',
    nearLight: '#2d1660',
    mist: '#8a5fd0',
    bioA: '#3dffe0',
    bioB: '#ff5ae0',
  },
  moon: {
    outline: '#0c0a1a',
    soilDeep: '#24203a',
    soil: '#423c5c',
    soilLight: '#6a6386',
    soilSpeck: '#8d86a8',
    surface: '#b9b0d0',
    surfaceLight: '#ece6fa',
    surfaceDark: '#6d6589',
    surfaceGlow: '#d9d2f0',
    vein: '#ff9a2e',
    veinLight: '#ffe0a0',
    accent: '#ff7a1a',
    accentLight: '#ffc27a',
    blockBase: '#3e3a55',
    blockLight: '#7a7598',
    blockDark: '#1b1830',
    bonusFrame: '#ff9a2e',
    bonusGlyph: '#8ff6ff',
    bonusCore: '#2fd2ff',
    skyTop: '#010106',
    skyMid: '#07061a',
    skyLow: '#16113a',
    horizon: '#3b2a5e',
    galaxy: '#b48cff',
    nebulaA: '#7a3cff',
    nebulaB: '#1f8fff',
    far: '#3a3556',
    farLight: '#6e6794',
    mid: '#25213c',
    midLight: '#4c4670',
    near: '#100e1e',
    nearLight: '#2a2546',
    mist: '#5c4f86',
    bioA: '#ff9a2e',
    bioB: '#ffcf6a',
  },
};
