// Clear polystyrene, in two kinds.
//
// Rods (everything with a thick rounded section) are traced: a pixel's ray is bent into the rod's
// section, followed from wall to wall inside it, and at each wall the part that gets out looks at
// the studio, or, if it is still heading nearly the way it came, at the picture behind the rod.
//
// Sheets (the lid, the tray's floor) are thin and flat. They only veil what is behind them a little
// and add the lights' reflections.
import { STUDIO } from './studio.js';

export const ROD_VERT = /* glsl */ `
  attribute vec3 aLine;      // the nearest point of the rod's centre line
  attribute vec3 aAcross;    // unit vector across the rod, in the plane it lies in
  attribute vec3 aSection;   // half width, half height, corner radius
  attribute float aEnd;      // 1 on a flat end face
  centroid varying vec3 vPos;
  centroid varying vec3 vNrm;
  centroid varying vec3 vLine;
  centroid varying vec3 vAcross;
  centroid varying vec3 vUp;
  centroid varying vec3 vSection;
  centroid varying float vEnd;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    vNrm = normalMatrix * normal;
    vLine = (modelViewMatrix * vec4(aLine, 1.0)).xyz;
    mat3 turn = mat3(modelViewMatrix);
    float scale = length(turn[0]);
    vAcross = turn * aAcross / scale;
    vUp = turn[2] / scale;
    vSection = aSection * scale;
    vEnd = aEnd;
    gl_Position = projectionMatrix * mv;
  }
`;

export const ROD_FRAG = /* glsl */ `
  uniform sampler2D uPicture;  // everything drawn so far. alpha: -1 on the bare page, 0 on anything solid
  uniform mat4 uProj;
  uniform vec4 uRect;          // the part of the picture that is up to date, in uv
  uniform float uGap;          // how far behind a rod the picture is taken to lie, mm
  uniform float uIor;
  uniform vec3 uSoak;          // absorption per mm
  uniform float uFade;
  uniform int uTaps;
  centroid varying vec3 vPos;
  centroid varying vec3 vNrm;
  centroid varying vec3 vLine;
  centroid varying vec3 vAcross;
  centroid varying vec3 vUp;
  centroid varying vec3 vSection;
  centroid varying float vEnd;
  ${STUDIO}

  // White plastic on a white page would not read at all, so where there is nothing but page behind
  // a rod it mostly shows the studio wall instead, the way glass is shot against a dark field.
  const float PAGE_SHOWS = 0.22;
  const int LEGS = 3;

  vec2 toUv(vec3 q) {
    vec4 c = uProj * vec4(q, 1.0);
    return c.xy / c.w * 0.5 + 0.5;
  }
  vec4 pictureAt(vec2 uv) {
    return textureLod(uPicture, clamp(uv, uRect.xy + 0.002, uRect.zw - 0.002), 0.0);
  }

  /* -- the section: a rounded box, taken apart into pieces a ray is easy to follow through ---- */

  // how far along o + d*t the ray stays in a box / a disc; -1 if it never crosses it ahead
  float leaveBox(vec2 o, vec2 d, vec2 h) {
    vec2 dd = mix(vec2(1e-6), d, step(vec2(1e-6), abs(d)));
    vec2 a = (-h - o) / dd;
    vec2 b = (h - o) / dd;
    vec2 lo = min(a, b);
    vec2 hi = max(a, b);
    float t1 = min(hi.x, hi.y);
    return (t1 >= max(lo.x, lo.y) && t1 > 0.0) ? t1 : -1.0;
  }
  float leaveDisc(vec2 o, vec2 d, vec2 c, float r) {
    vec2 oc = o - c;
    float A = dot(d, d);
    float B = dot(oc, d);
    float h = B * B - A * (dot(oc, oc) - r * r);
    if (h < 0.0) return -1.0;
    float t1 = (-B + sqrt(h)) / A;
    return t1 > 0.0 ? t1 : -1.0;
  }
  // A rounded box is a plus sign of two boxes with a disc in each corner. Every piece is convex and
  // so is the whole, so a ray that starts inside leaves the whole where it leaves the last piece.
  float leaveSection(vec2 o, vec2 d, vec2 b, float r) {
    vec2 k = max(b - r, vec2(0.0));
    float t = max(leaveBox(o, d, vec2(b.x, k.y)), leaveBox(o, d, vec2(k.x, b.y)));
    t = max(t, leaveDisc(o, d, k, r));
    t = max(t, leaveDisc(o, d, vec2(-k.x, k.y), r));
    t = max(t, leaveDisc(o, d, -k, r));
    t = max(t, leaveDisc(o, d, vec2(k.x, -k.y), r));
    return max(t, 0.0);
  }
  vec2 sectionNormal(vec2 x, vec2 b, float r) {
    vec2 k = max(b - r, vec2(0.0));
    vec2 a = abs(x) - k;
    vec2 n = (a.x > 0.0 && a.y > 0.0) ? normalize(a) : (b.x - abs(x.x) < b.y - abs(x.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    return n * (step(0.0, x) * 2.0 - 1.0);
  }

  /* -- what a ray sees once it is out ------------------------------------------------------- */

  // rgb, and in a the share of pin-lamp light. I is the line of sight the ray started along, p the
  // spot on the wall it is heading for and e how much of the wall this pixel covers there.
  vec4 seen(vec3 at, vec3 way, vec3 I, vec2 p, vec2 e) {
    vec4 env = studioAt(way, p, e);
    // Only a ray still within a few degrees of the line of sight lands on what is behind the rod;
    // turned any further it leaves the backdrop and finds the wall.
    float fuzz = min(max(e.x, e.y), 0.3);
    float turned = length(cross(way, I));
    float ahead = (1.0 - smoothstep(0.06 - fuzz, 0.16 + fuzz, turned)) * step(way.z, -0.05);
    vec4 pic = pictureAt(toUv(at + way * uGap));
    float bare = clamp(-pic.a, 0.0, 1.0);
    ahead *= mix(1.0, PAGE_SHOWS, bare);
    return vec4(mix(env.rgb, pic.rgb, ahead), env.a * (1.0 - ahead));
  }

  vec3 gU;     // across the rod
  vec3 gW;     // out of the plane it lies in
  vec2 gB;     // the section's half size
  float gR;    // and its corner radius

  // One leg of a ray's walk through the rod: on to the next wall. Gives back the share (per colour)
  // that gets out there and the way it goes, and leaves the ray turned back inside.
  vec3 leg(inout vec3 pos, inout vec3 dir, inout float left, inout float len, out vec3 way) {
    vec3 rel = pos - vLine;
    vec2 o = clamp(vec2(dot(rel, gU), dot(rel, gW)), -gB * 0.999, gB * 0.999);
    vec2 d = vec2(dot(dir, gU), dot(dir, gW));
    // a ray running straight down the rod never meets a wall: let it out through an end
    bool along = dot(d, d) < 1e-5;
    float t = along ? 4.0 * max(gB.x, gB.y) : leaveSection(o, d, gB, gR);
    vec2 n2 = sectionNormal(o + d * t, gB, gR);
    vec3 wall = along ? dir : normalize(gU * n2.x + gW * n2.y);
    pos += dir * t;
    len += t;
    float R = fresnel(dot(dir, wall), uIor);
    vec3 back = reflect(dir, wall);
    // a totally reflected ray lets nothing out; it is still given a way, so there is one to compare
    way = R < 1.0 ? refract(dir, -wall, uIor) : back;
    vec3 share = left * (1.0 - R) * exp(-uSoak * len);
    left *= R;
    dir = back;
    return share;
  }

  // how much of the wall lies between where two neighbouring rays are heading
  vec2 between(vec3 wa, vec2 qa, vec3 wb, vec2 qb) {
    return (wa.z * wb.z < 0.0 ? vec2(1.2) : min(abs(qa - qb) * 0.7, vec2(1.2))) + 0.003;
  }

  // Two rays a fraction of a pixel apart across the rod, walked side by side. How far apart they
  // come out at each wall is how much of the studio this pixel covers there, which is exactly the
  // blur to read the studio with. (Asking the GPU for that difference instead does not work: a thin
  // rod is made of triangles smaller than a pixel, and across those its guesses are noise.)
  vec4 walkPair(vec3 Pa, vec3 Na, vec3 Pb, vec3 Nb) {
    vec3 Ia = normalize(Pa);
    vec3 Ib = normalize(Pb);
    vec3 da = refract(Ia, Na, 1.0 / uIor);
    vec3 db = refract(Ib, Nb, 1.0 / uIor);
    vec3 pa = Pa;
    vec3 pb = Pb;
    float la = 1.0;   // the share still inside
    float lb = 1.0;
    float na = 0.0;   // plastic crossed so far
    float nb = 0.0;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < LEGS; i++) {
      vec3 wa;
      vec3 wb;
      vec3 ga = leg(pa, da, la, na, wa);
      vec3 gb = leg(pb, db, lb, nb, wb);
      vec2 qa = wallOf(wa);
      vec2 qb = wallOf(wb);
      vec2 e = between(wa, qa, wb, qb);
      vec4 sa = seen(pa, wa, Ia, qa, e);
      vec4 sb = seen(pb, wb, Ib, qb, e);
      sum += vec4(ga * sa.rgb + gb * sb.rgb, dot(ga, vec3(1.0 / 3.0)) * sa.a + dot(gb, vec3(1.0 / 3.0)) * sb.a);
    }
    // what is still inside leaks out over many more bounces, in every direction: about wall grey
    sum.rgb += (la * exp(-uSoak * na) + lb * exp(-uSoak * nb)) * vec3(0.16, 0.165, 0.18);
    return sum;
  }

  // the room in the rod's surface; skimming it, the white page behind
  vec4 mirrored(vec3 Rd, vec2 q, vec2 e) {
    vec4 m = studioAt(Rd, q, e);
    float page = (1.0 - smoothstep(0.25, 0.7, length(q))) * step(Rd.z, -0.05);
    return mix(m, vec4(1.0, 1.0, 1.0, 0.0), page);
  }

  void main() {
    gU = normalize(vAcross);
    gW = normalize(vUp);
    gB = vSection.xy;
    gR = min(vSection.z, min(gB.x, gB.y));
    vec3 I = normalize(vPos);
    float flip = dot(vNrm, I) > 0.0 ? -1.0 : 1.0;
    float inv = 1.0 / length(vNrm);
    vec3 N = vNrm * inv * flip;
    float R0 = fresnel(dot(N, I), 1.0 / uIor);

    // the step on screen that goes straight across the rod, and what one pixel of it does to the
    // surface point and its normal
    vec3 Px = dFdx(vPos);
    vec3 Py = dFdy(vPos);
    vec3 T = cross(gU, gW);
    vec2 slide = vec2(dot(Px, T), dot(Py, T));
    vec2 over = vec2(-slide.y, slide.x);
    float ol = length(over);
    over = ol > 1e-7 ? over / ol : vec2(1.0, 0.0);
    vec3 dP = Px * over.x + Py * over.y;
    vec3 dRaw = dFdx(vNrm) * over.x + dFdy(vNrm) * over.y;
    vec3 dN = (dRaw - N * dot(N, dRaw)) * inv * flip;
    dN *= min(1.0, 0.5 / max(length(dN), 1e-4));

    vec4 inner = vec4(0.0);
    vec4 mirror = vec4(0.0);
    int pairs = uTaps / 2;
    float gapPx = 0.5 / float(pairs);   // between the two rays of a pair
    for (int k = 0; k < 2; k++) {
      if (k >= pairs) break;
      float mid = (float(k) + 0.5) / float(pairs) - 0.5;
      float oa = mid - gapPx * 0.5;
      float ob = mid + gapPx * 0.5;
      vec3 Pa = vPos + dP * oa;
      vec3 Pb = vPos + dP * ob;
      vec3 Na = normalize(N + dN * oa);
      vec3 Nb = normalize(N + dN * ob);
      inner += walkPair(Pa, Na, Pb, Nb);
      vec3 Ra = reflect(normalize(Pa), Na);
      vec3 Rb = reflect(normalize(Pb), Nb);
      vec2 qa = wallOf(Ra);
      vec2 qb = wallOf(Rb);
      vec2 e = between(Ra, qa, Rb, qb);
      mirror += mirrored(Ra, qa, e) + mirrored(Rb, qb, e);
    }
    inner /= float(uTaps);
    mirror /= float(uTaps);

    if (vEnd > 0.5) {
      // a flat end is a window down the rod: mostly what is straight behind
      inner = vec4(seen(vPos, I, I, wallOf(I), vec2(0.02)).rgb * 0.84, 0.0);
    }
    vec3 col = mirror.rgb * R0 + inner.rgb * (1.0 - R0);
    float spark = mirror.a * R0 + inner.a * (1.0 - R0);
    // a case leaving the stage dissolves into whatever is behind it
    vec4 behind = pictureAt(toUv(vPos));
    gl_FragColor = mix(behind, vec4(col, spark), uFade);
  }
`;

export const SHEET_VERT = /* glsl */ `
  attribute float aThick;
  varying vec3 vPos;
  varying vec3 vNrm;
  varying float vThick;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    vNrm = normalMatrix * normal;
    vThick = aThick * length(modelViewMatrix[0].xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// Blended as picture = picture * (1 - a) + rgb: a is what the sheet takes away, rgb what it adds.
export const SHEET_FRAG = /* glsl */ `
  uniform float uIor;
  uniform vec3 uSoak;
  uniform float uFade;
  varying vec3 vPos;
  varying vec3 vNrm;
  varying float vThick;
  ${STUDIO}
  // a slab's two faces together, all the bounces between them counted
  float slab(float ci) {
    float f = fresnel(ci, 1.0 / uIor);
    return 2.0 * f / (1.0 + f);
  }
  void main() {
    vec3 I = normalize(vPos);
    vec3 N = normalize(vNrm);
    if (dot(N, I) > 0.0) N = -N;
    float ci = -dot(N, I);
    float mirror = slab(ci);
    float faceOn = slab(1.0);
    // Square on, a sheet of clear plastic in a white studio is as good as invisible: what it takes
    // from the page it gives back from the room. So only what tilting adds on top of that counts.
    float tilt = max(mirror - faceOn, 0.0);
    float inside = sqrt(1.0 - (1.0 - ci * ci) / (uIor * uIor));
    float soaked = 1.0 - exp(-dot(uSoak, vec3(1.0 / 3.0)) * vThick / max(inside, 0.2));
    float takes = clamp(tilt + faceOn * 0.06 + soaked * 0.5, 0.0, 1.0);
    vec3 Rd = reflect(I, N);
    vec2 p = wallOf(Rd);
    vec3 room = studioAt(Rd, p, blurOf(p) + 0.01).rgb;
    // The softboxes show on it even square on, as a faint sheen: a flat sheet mirrors a whole light
    // at once, and left alone that would white the case out. Tilted, it mostly picks up the pale
    // surround of the set, so it turns milky rather than dark.
    vec3 adds = min(max(room - 0.5, 0.0) * mirror * 0.3, vec3(0.11)) + mix(min(room, vec3(1.3)), vec3(0.96, 0.97, 1.0), 0.8) * tilt;
    gl_FragColor = vec4(adds * uFade, takes * uFade);
  }
`;
