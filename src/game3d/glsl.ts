// Fragments GLSL partagés : bruit de valeur 3D et fbm (ciel, planètes).
// Borne des boucles fbm = constante + xrLoopBias, uniforme jamais renseigné (vaut donc 0) : le
// compilateur ne peut pas dérouler les boucles. Déroulées, elles produisaient des shaders énormes que
// le compilateur D3D (ANGLE, Windows) mettait ~5 s à compiler — assez pour perdre le contexte WebGL.
// Même calcul, même rendu ; ~8x plus rapide à compiler.

export const GLSL_NOISE = /* glsl */ `
uniform int xrLoopBias;
float xrHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float xrNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = xrHash(i);
  float b = xrHash(i + vec3(1.0, 0.0, 0.0));
  float c = xrHash(i + vec3(0.0, 1.0, 0.0));
  float d = xrHash(i + vec3(1.0, 1.0, 0.0));
  float e = xrHash(i + vec3(0.0, 0.0, 1.0));
  float g = xrHash(i + vec3(1.0, 0.0, 1.0));
  float h = xrHash(i + vec3(0.0, 1.0, 1.0));
  float k = xrHash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float xrFbm4(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4 + xrLoopBias; i++) {
    s += a * xrNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / 0.9375;
}
float xrFbm6(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6 + xrLoopBias; i++) {
    s += a * xrNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / 0.984375;
}
`;
