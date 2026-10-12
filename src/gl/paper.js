// Printed paper: the booklet in the lid and the card under the tray. A flat sheet with a different
// picture on each side, matte with a trace of gloss.
import { STUDIO } from './studio.js';

export const PAPER_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vNrm;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    vNrm = normalMatrix * normal;
    gl_Position = projectionMatrix * mv;
  }
`;

export const PAPER_FRAG = /* glsl */ `
  uniform sampler2D uFront;   // the side facing +z
  uniform sampler2D uBack;
  uniform float uFade;
  varying vec2 vUv;
  varying vec3 vPos;
  varying vec3 vNrm;
  ${STUDIO}
  void main() {
    vec3 I = normalize(vPos);
    vec3 N = normalize(vNrm);
    bool front = dot(N, I) < 0.0;
    if (!front) N = -N;
    // seen from behind, left and right change places: turn the back's picture so it still reads
    vec3 a = texture2D(uFront, vUv).rgb;
    vec3 b = texture2D(uBack, vec2(1.0 - vUv.x, vUv.y)).rgb;
    vec3 ink = front ? a : b;
    vec3 Rd = reflect(I, N);
    vec3 col = ink * lambert(N) * 0.93;
    col += min(highlights(Rd, 0.07), vec3(2.0)) * fresnel(dot(N, I), 1.0 / 1.5) * 0.45;
    // alpha 0: something solid; fading out, it gives way to the white page
    gl_FragColor = vec4(mix(vec3(1.0), col, uFade), uFade - 1.0);
  }
`;
