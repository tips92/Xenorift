// Tampons générés une seule fois au déverrouillage : bruit blanc, réponse impulsionnelle, courbe de saturation.

/** Bruit blanc mono (lu en boucle à un décalage aléatoire par chaque son). */
export function makeNoise(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Réverbération synthétique : bruit stéréo à décroissance exponentielle,
 * de plus en plus sombre avec le temps (passe-bas d'un pôle dont la coupure baisse).
 */
export function makeImpulse(ac: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ac.createBuffer(2, len, sr);
  const fadeIn = Math.floor(sr * 0.006);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.75 - 0.6 * x;
      lp += k * (Math.random() * 2 - 1 - lp);
      let v = lp * Math.pow(1 - x, decay);
      if (i < fadeIn) v *= i / fadeIn;
      d[i] = v;
    }
  }
  return buf;
}

/** Courbe de saturation douce (tanh) pour les chocs et explosions. */
export function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / norm;
  }
  return curve;
}
