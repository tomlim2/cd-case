// After the picture is drawn: glints, and the step to the screen.
//
// The picture's alpha carries how much pin-lamp light each pixel caught. Where that peaks, a small
// four-pointed star is laid over it, the way a lens flares on a point of light.

// The plastic passes only redraw a rectangle round the cases, so the finished picture is the last
// plastic pass inside that rectangle and the page-and-disc pass outside it.
const FRAME = /* glsl */ `
  uniform sampler2D uWhole;
  uniform sampler2D uPatch;
  uniform vec4 uRect;
  vec4 frame(vec2 uv) {
    bool inside = uv.x >= uRect.x && uv.x <= uRect.z && uv.y >= uRect.y && uv.y <= uRect.w;
    // explicit level: across the rectangle's edge the two pictures are unrelated, and so would be
    // any level picked from their difference
    return inside ? textureLod(uPatch, uv, 0.0) : textureLod(uWhole, uv, 0.0);
  }
`;

export const COPY_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() { gl_FragColor = textureLod(uTex, vUv, 0.0); }
`;

// half resolution: keeps only the pixels that are the brightest pin-light in their neighbourhood
export const SEED_FRAG = /* glsl */ `
  ${FRAME}
  uniform vec2 uTexel;     // one pixel of this (half size) target, in uv
  uniform float uFloor;
  varying vec2 vUv;
  float caught(vec2 uv) {
    vec2 q = uTexel * 0.25;
    return 0.25 * (max(frame(uv + vec2(-q.x, -q.y)).a, 0.0) + max(frame(uv + vec2(q.x, -q.y)).a, 0.0) +
      max(frame(uv + vec2(-q.x, q.y)).a, 0.0) + max(frame(uv + vec2(q.x, q.y)).a, 0.0));
  }
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    float here = caught(vUv);
    if (here <= uFloor) return;
    // a glint is a point: it must beat its neighbours, and stand clear of what surrounds it
    float rival = 0.0;
    float around = 0.0;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7853982;
      vec2 o = vec2(cos(a), sin(a));
      rival = max(rival, caught(vUv + sign(o) * step(0.3, abs(o)) * uTexel));
      around += caught(vUv + o * uTexel * 3.5);
    }
    if (here < rival) return;
    float power = max(here - around * 0.22 - uFloor, 0.0);
    vec3 hue = frame(vUv).rgb;
    hue = mix(vec3(1.0), hue / max(max(hue.r, max(hue.g, hue.b)), 1e-3), 0.3);
    gl_FragColor = vec4(hue * min(power, 7.0), 1.0);
  }
`;

// draws every seed out into a streak along uStep
export const STREAK_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec2 uStep;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uTex, vUv).rgb;
    float total = 1.0;
    float w = 1.0;
    for (int i = 1; i <= 11; i++) {
      w *= uDecay;
      c += (texture2D(uTex, vUv + uStep * float(i)).rgb + texture2D(uTex, vUv - uStep * float(i)).rgb) * w;
      total += 2.0 * w;
    }
    gl_FragColor = vec4(c / total * 3.2, 1.0);
  }
`;

export const FINAL_FRAG = /* glsl */ `
  ${FRAME}
  uniform sampler2D uStreakA;
  uniform sampler2D uStreakB;
  uniform float uGlint;
  varying vec2 vUv;
  vec3 encode(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec3 c = frame(vUv).rgb;
    vec3 star = (texture2D(uStreakA, vUv).rgb + texture2D(uStreakB, vUv).rgb) * uGlint;
    // Light added to a white page cannot show. So a star first cools what is under it to a pale
    // blue, and then burns its middle back to white.
    float k = clamp(dot(star, vec3(1.0 / 3.0)), 0.0, 1.0);
    c *= 1.0 - k * vec3(0.36, 0.23, 0.0);
    c += star * vec3(0.8, 0.9, 1.0) * 0.5;
    gl_FragColor = vec4(encode(c), 1.0);
  }
`;
