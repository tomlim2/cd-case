// The disc. Four kinds of front over one kind of back: whatever is printed on it, underneath it is
// a CD, silver on the data side with the track fanning the lights out into colours.
import { STUDIO } from './studio.js';

export const KIND = { print: 0, holo: 1, gold: 2, vinyl: 3 };

export const DISC_VERT = /* glsl */ `
  attribute float aFace;
  varying vec3 vLocal;
  varying vec3 vPos;
  varying vec3 vNrm;
  varying vec3 vAx;
  varying vec3 vAy;
  varying float vFace;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    vNrm = normalMatrix * normal;
    // the disc's own x and y as the camera sees them: the fragment builds its radius out of these
    vAx = normalize(mat3(modelViewMatrix)[0]);
    vAy = normalize(mat3(modelViewMatrix)[1]);
    vFace = aFace;
    gl_Position = projectionMatrix * mv;
  }
`;

export const DISC_FRAG = /* glsl */ `
  uniform sampler2D uArt;
  uniform int uKind;
  uniform float uInner;   // where the print (or the grooves) begin, mm from the centre
  uniform float uOuter;   // where the print ends
  uniform float uFade;
  varying vec3 vLocal;
  varying vec3 vPos;
  varying vec3 vNrm;
  varying vec3 vAx;
  varying vec3 vAy;
  varying float vFace;
  ${STUDIO}

  vec3 gOut;     // unit vector along the radius at this pixel, view space
  vec3 gRound;   // and along the track

  const vec3 LAMP[4] = vec3[4](L_KEY, L_SIDE, L_TOP, L_FILL);

  // A wavelength (nm) as linear rgb: three Gaussian humps for the cones' peaks, plus the little
  // second hump red has down in the violet.
  vec3 spectrum(float nm) {
    vec3 x = (vec3(nm) - vec3(602.0, 538.0, 452.0)) / vec3(52.0, 46.0, 36.0);
    vec3 c = exp(-x * x);
    float v = (nm - 424.0) / 22.0;
    c.r += 0.28 * exp(-v * v);
    return c * smoothstep(380.0, 410.0, nm) * (1.0 - smoothstep(680.0, 740.0, nm));
  }

  // The track is a grating, 1.6 microns from one turn to the next, its lines running round the
  // disc. Across the lines light obeys sin(in) + sin(out) = m * wavelength / pitch; along them it
  // can only mirror. So a lamp lights up the one radius that mirrors it, in spectral colours.
  vec3 fanned(vec3 L, vec3 V, float width) {
    vec3 s = L + V;
    float across = abs(dot(s, gOut)) * 1600.0;   // first order's wavelength
    float skew = dot(s, gRound) / width;
    vec3 c = spectrum(across) + spectrum(across / 2.0) * 0.7 + spectrum(across / 3.0) * 0.42;
    return c * exp(-skew * skew);
  }
  vec3 rainbow(vec3 V) {
    return fanned(L_KEY, V, 0.07) * 1.5 + fanned(L_SIDE, V, 0.06) * 1.3 + fanned(L_TOP, V, 0.09) * 0.85 +
      fanned(L_FILL, V, 0.2) * 0.3;
  }

  // Circular grooves tip the surface to and fro across the radius, so each lamp's highlight is
  // dragged out along the radius: tight along the track, broad across it.
  float groove(vec3 L, vec3 V, vec3 N, float across, float along) {
    vec3 H = normalize(L + V);
    vec2 slope = vec2(dot(H, gOut) / across, dot(H, gRound) / along) / max(dot(H, N), 1e-3);
    return exp(-dot(slope, slope));
  }
  float grooves(vec3 V, vec3 N, float across, float along, vec4 w) {
    float g = 0.0;
    for (int i = 0; i < 4; i++) g += groove(LAMP[i], V, N, across, along) * w[i];
    return g;
  }

  // matte ink under the softboxes
  vec3 lambert(vec3 N) {
    return vec3(0.44 + 0.58 * max(dot(N, L_KEY), 0.0) + 0.26 * max(dot(N, L_SIDE), 0.0) + 0.14 * max(dot(N, L_TOP), 0.0));
  }
  // aluminium behind lacquer: the room softly mirrored, over a floor of its own
  vec3 satin(vec3 Rd, vec3 N) {
    return vec3(0.92, 0.95, 1.0) * (min(studio(Rd, 0.07).rgb, vec3(1.5)) * 0.55 + 0.36 + 0.14 * dot(N, L_KEY));
  }
  float band(float r, float a, float b, float soft) { return smoothstep(a - soft, a + soft, r) * (1.0 - smoothstep(b - soft, b + soft, r)); }

  void main() {
    vec3 I = normalize(vPos);
    vec3 V = -I;
    vec3 N = normalize(vNrm);
    if (dot(N, V) < 0.0) N = -N;
    float ci = dot(N, V);
    vec3 Rd = reflect(I, N);
    float r = length(vLocal.xy);
    vec2 u = vLocal.xy / max(r, 1e-4);
    gOut = normalize(vAx * u.x + vAy * u.y);
    gRound = normalize(vAy * u.x - vAx * u.y);
    float coat = fresnel(ci, 1.0 / 1.5);   // a clear lacquer
    float data = band(r, 22.2, 58.5, 0.5);  // where the track is
    vec3 col;

    if (vFace > 1.5) {
      // the rim, clear plastic seen edge on
      col = vec3(0.3, 0.31, 0.34) + studio(Rd, 0.1).rgb * 0.25;
    } else if (vFace > 0.5) {
      // the data side
      col = satin(Rd, N) + rainbow(V) * data * 1.25;
      col *= 1.0 - 0.3 * band(r, 16.2, 17.0, 0.15);                                    // the stacking ring
      col = mix(col, vec3(0.6, 0.62, 0.66) + studio(Rd, 0.1).rgb * 0.06, 1.0 - smoothstep(14.6, 15.2, r));
      col = mix(col, vec3(0.24, 0.25, 0.27) + studio(Rd, 0.05).rgb * 0.3, smoothstep(58.2, 59.0, r) * 0.8);
    } else {
      vec4 art = texture2D(uArt, vLocal.xy / 120.0 + 0.5);
      vec3 foil = vec3(0.0);
      float printed = art.a * (1.0 - smoothstep(uOuter, uOuter + 0.4, r));
      if (uKind == 2) {
        // Gold, brushed in circles. The art is not a picture here but a relief: r is engraving cut
        // through the brushing, g the brushing itself (0.5 = even).
        float grain = 0.55 + 0.9 * art.g;
        float caught = dot(studio(Rd - gOut * 0.2, 0.2).rgb + studio(Rd + gOut * 0.2, 0.2).rgb, vec3(1.0 / 6.0));
        float lightAmt = (0.3 + 0.16 * min(caught, 4.0) + grooves(V, N, 0.46, 0.055, vec4(0.9, 0.7, 0.45, 0.1))) * grain;
        // deep amber in the dim, paling toward yellow where it catches a lamp, but never to white
        vec3 gold = mix(vec3(0.56, 0.25, 0.045), vec3(1.0, 0.8, 0.4), 1.0 - exp(-lightAmt * 1.1));
        col = gold * (1.0 - exp(-lightAmt * 1.3)) * 1.2;
        // engraving is frosted: it takes the light evenly instead of in streaks
        col = mix(col, vec3(1.0, 0.74, 0.3) * (lambert(N) * 0.72 + 0.16), smoothstep(0.25, 0.7, art.r) * 0.85);
        // a black label round the spindle hole
        float label = 1.0 - smoothstep(uInner - 0.3, uInner + 0.2, r);
        col = mix(col, vec3(0.016) + studio(Rd, 0.04).rgb * 0.035, label);
        col += highlights(Rd, 0.03) * coat * 0.4;
      } else if (uKind == 3) {
        // Vinyl: black, the grooves throwing long soft streaks, thinner at the gaps between tracks
        float cutIn = band(r, uInner + 0.3, 58.9, 0.3);
        float gaps = 1.0;
        for (int k = 0; k < 4; k++) gaps *= 1.0 - 0.7 * band(r, 30.2 + float(k) * 7.2, 30.7 + float(k) * 7.2, 0.14);
        float sheen = grooves(V, N, 0.32, 0.02, vec4(1.0, 0.8, 0.5, 0.22));
        col = vec3(0.012) + vec3(0.6, 0.62, 0.67) * sheen * cutIn * gaps * 0.15;
        col += min(studio(Rd, 0.02 + 0.07 * cutIn).rgb, vec3(2.2)) * coat * mix(1.0, 0.6, cutIn);
      } else if (uKind == 1) {
        // a black CD: a dark mirror, so the colours fanned off the track stand out
        vec3 fan = rainbow(V) * data;
        col = vec3(0.012) + min(studio(Rd, 0.04).rgb, vec3(2.0)) * 0.07 + fan * 0.68;
        printed *= smoothstep(uInner - 0.2, uInner + 0.2, r);
        // the stickers' white paper edge is foil: it catches a little of the same rainbow
        foil = fan * smoothstep(0.8, 0.96, min(art.r, min(art.g, art.b))) * 0.32;
      } else {
        col = satin(Rd, N) + rainbow(V) * data * 1.25;
        printed *= smoothstep(uInner - 0.2, uInner + 0.2, r);
      }
      if (uKind != 2) {
        // ink, lit by the room, under a lacquer that shows the lamps as a soft sheen
        col = mix(col, art.rgb * lambert(N) + foil, printed);
        col += min(highlights(Rd, 0.02), vec3(2.4)) * coat * printed;
      }
      if (uKind <= 1) {
        col *= 1.0 - 0.3 * band(r, 16.2, 17.0, 0.15) * (1.0 - printed);
        // the last millimetre of a CD is clear plastic over the edge of the metal
        col = mix(col, vec3(0.24, 0.25, 0.27) + studio(Rd, 0.05).rgb * 0.3, smoothstep(uOuter, uOuter + 0.5, r) * smoothstep(58.2, 59.0, r) * 0.8);
      }
    }
    // alpha 0: something solid (the page writes -1); fading out, it gives way to the white page
    gl_FragColor = vec4(mix(vec3(1.0), col, uFade), uFade - 1.0);
  }
`;
