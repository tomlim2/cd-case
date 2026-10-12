// The lighting rig, as GLSL shared by every shader.
//
// View space throughout: +z points at the camera, -z at the page behind the case. A direction d is
// flattened to the spot it would hit on a wall one unit away along the view axis, p = d.xy / |d.z|,
// and the whole rig is drawn on those two walls: one round the camera, one behind the case.
//
// Nothing here is a texture. Every light is a bar or a card with soft edges, and every lookup takes
// a blur (how much of the wall one pixel covers), which simply widens those edges. A bar that is
// narrower than the blur dims by exactly as much as it spreads, so a tiny lamp seen through a lens
// neither aliases nor loses energy.

const num = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(5)));
const v2 = (a) => `vec2(${num(a[0])}, ${num(a[1])})`;
const v3 = (a) => `vec3(${num(a[0])}, ${num(a[1])}, ${num(a[2])})`;

/* -- round the camera: what surfaces mirror ------------------------------------------------- */
// softboxes: where on the wall, half size, edge softness, colour (linear, 1 = paper white)
const BOXES = {
  KEY: { at: [-0.92, 0.22], half: [0.075, 0.9], soft: 0.03, rgb: [22, 21.6, 21] },
  SIDE: { at: [1.12, -0.06], half: [0.065, 1.05], soft: 0.03, rgb: [17.3, 17.8, 18.4] },
  TOP: { at: [0.0, 1.36], half: [1.15, 0.06], soft: 0.03, rgb: [12, 12, 12] },
  FILL: { at: [0.06, -1.15], half: [1.05, 0.26], soft: 0.25, rgb: [2.0, 2.06, 2.15] },
};
// black cards between the lights, so a flat face never mirrors one unbroken sheet
const FLAGS = [
  { at: [-0.3, 0.4], half: [0.05, 1.3], cut: 0.9 },
  { at: [0.58, -0.3], half: [0.045, 0.95], cut: 0.85 },
];
// pin lamps: tiny, and brighter than everything else put together. A rounded edge catches one as a
// glint, which the glint pass draws out into a star
const PINS_NEAR = [
  [-0.5, 0.92, 1.0],
  [0.7, 0.66, 0.85],
  [-1.0, -0.42, 0.7],
  [0.9, -0.78, 0.7],
];
const PINS_FAR = [
  [-0.58, 0.62, 0.16],
  [0.7, -0.55, 0.16],
];

/* -- behind the case: what a ray bent through thick plastic lands on --------------------------- */
// A dark wall with a lit patch dead ahead, hung with hoops: black ones and glowing ones. A rod is a
// lens, so across its width it sweeps outward over these rings and shows them as crisp lines running
// along it. The two sets are centred a little apart so the two sides of a rod never match.
const HOOPS_DARK = { centre: [0.05, -0.04], rings: [[0.25, 0.06, 0.02], [0.72, 0.11, 0.03]] };
const HOOPS_HOT = { centre: [-0.07, 0.06], rings: [[0.45, 0.04, 0.015, 1.0], [1.02, 0.085, 0.03, 0.9]] };

const dirOf = (at) => {
  const l = Math.hypot(at[0], at[1], 1);
  return [at[0] / l, at[1] / l, 1 / l];
};
// the softboxes as directions, for shading that wants point lights (a disc's grooves)
export const LIGHTS = Object.fromEntries(Object.entries(BOXES).map(([k, b]) => [k, dirOf(b.at)]));

export const STUDIO = /* glsl */ `
  const vec3 MURK = vec3(0.019, 0.02, 0.025);
  const float PIN_POWER = 4000.0;

  vec2 wallOf(vec3 d) { return d.xy / max(abs(d.z), 0.06); }
  // the blur to look a direction up with, from how fast it changes across the screen
  vec2 blurOf(vec2 p) { return min(fwidth(p) * 0.6, vec2(1.2)) + 0.002; }

  float soften(float u, float e) { return smoothstep(-e, e, u); }
  // a bar of half width h centred on c, through a blur of half width e (a box blurred, exactly)
  float bar(float x, float c, float h, float e) { return soften(x - c + h, e) - soften(x - c - h, e); }
  float card(vec2 p, vec2 c, vec2 h, vec2 e) { return bar(p.x, c.x, h.x, e.x) * bar(p.y, c.y, h.y, e.y); }
  float pin(vec2 p, vec2 c, vec2 e) { return card(p, c, vec2(0.012), e + 0.004); }

  // rgb: the light from that spot; a: how much of it is pin-lamp light
  vec4 nearWall(vec2 p, vec2 e) {
    float er = max(e.x, e.y);
    vec3 c = MURK * (0.5 + 0.6 * soften(p.y, 1.4 + e.y));
    // a soft glow overhead
    c += vec3(0.3) * soften(p.y + 0.1, 0.8 + e.y) * (1.0 - soften(length(p) - 0.8, 0.3 + er));
    ${Object.values(BOXES)
      .map((b) => `c += ${v3(b.rgb)} * card(p, ${v2(b.at)}, ${v2(b.half)}, e + ${num(b.soft)});`)
      .join('\n    ')}
    ${FLAGS.map((f) => `c *= 1.0 - ${num(f.cut)} * card(p, ${v2(f.at)}, ${v2(f.half)}, e + 0.02);`).join('\n    ')}
    float s = 0.0;
    ${PINS_NEAR.map(([x, y, w]) => `s += ${num(w)} * pin(p, ${v2([x, y])}, e);`).join('\n    ')}
    s *= PIN_POWER;
    return vec4(c + vec3(0.82, 0.9, 1.0) * s, s);
  }

  vec4 farWall(vec2 p, vec2 e) {
    float er = max(e.x, e.y);
    float off = length(p);
    vec3 c = vec3(0.1, 0.103, 0.113) * (1.0 - 0.55 * soften(off - 1.1, 0.7 + er));
    c += vec3(0.82) * (1.0 - soften(off - 0.1, 0.06 + er));
    float rd = length(p - ${v2(HOOPS_DARK.centre)});
    float dark = 0.0;
    ${HOOPS_DARK.rings.map(([r, h, s]) => `dark += bar(rd, ${num(r)}, ${num(h)}, ${num(s)} + er);`).join('\n    ')}
    c *= 1.0 - 0.97 * min(dark, 1.0);
    float rh = length(p - ${v2(HOOPS_HOT.centre)});
    float hot = 0.0;
    ${HOOPS_HOT.rings.map(([r, h, s, w]) => `hot += ${num(w)} * bar(rh, ${num(r)}, ${num(h)}, ${num(s)} + er);`).join('\n    ')}
    c += vec3(2.3, 2.5, 2.9) * hot;
    float s = 0.0;
    ${PINS_FAR.map(([x, y, w]) => `s += ${num(w)} * pin(p, ${v2([x, y])}, e);`).join('\n    ')}
    s *= PIN_POWER;
    return vec4(c + vec3(0.82, 0.9, 1.0) * s, s);
  }

  // the studio along d, blurred by e (see blurOf). rgb + pin light in a
  vec4 studioAt(vec3 d, vec2 p, vec2 e) {
    vec4 c = d.z < 0.0 ? farWall(p, e) : nearWall(p, e);
    // both walls sink into the same murk toward the horizon, so there is no seam between them
    float clear = smoothstep(0.0, 0.22, abs(d.z));
    return vec4(mix(MURK, c.rgb, clear), c.a * clear);
  }
  vec4 studio(vec3 d, float rough) {
    d = normalize(d);
    return studioAt(d, wallOf(d), vec2(rough));
  }
  // only the lights themselves: what a glossy coat adds on top of whatever it covers
  vec3 highlights(vec3 d, float rough) { return max(studio(d, rough).rgb - vec3(0.5), 0.0); }

  ${Object.entries(LIGHTS)
    .map(([k, d]) => `const vec3 L_${k} = ${v3(d)};`)
    .join('\n  ')}

  // Unpolarised Fresnel reflectance; eta = (index on the ray's side) / (index beyond), ci = cosine of
  // incidence. Gives 1 past the critical angle.
  float fresnel(float ci, float eta) {
    ci = clamp(abs(ci), 0.0, 1.0);
    float s2 = eta * eta * (1.0 - ci * ci);
    if (s2 >= 1.0) return 1.0;
    float ct = sqrt(1.0 - s2);
    float rs = (eta * ci - ct) / (eta * ci + ct);
    float rp = (ci - eta * ct) / (ci + eta * ct);
    return 0.5 * (rs * rs + rp * rp);
  }
`;

export const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
