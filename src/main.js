import * as THREE from 'three';
import { buildTextures, paintThumb } from './textures.js';

/* ------------------------------------------------------------------ *
 *  Dimensions
 * ------------------------------------------------------------------ */
const HW = 3.0;          // case half width  (x)
const HH = 2.9;          // case half height (y)
const CORNER = 0.5;
const DISC_R = 2.3;
const LID_LIFT = 0.3;    // lid sits this far above the tray when closed
const OPEN_ANGLE = 3.02; // how far the lid swings (rad)

/* ------------------------------------------------------------------ *
 *  Renderer / camera / scene
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.setClearColor(0xffffff, 1);

const FOV = 26;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
camera.layers.enableAll();

const scene = new THREE.Scene();
const rig = new THREE.Group(); // everything the user can turn
scene.add(rig);

// render layers: 0 = backdrop/disc, 1 = tray, 2 = lid
const L_BASE = 0, L_TRAY = 1, L_LID = 2;
function setLayer(obj, layer) { obj.traverse((o) => o.layers.set(layer)); }

/* ------------------------------------------------------------------ *
 *  Studio lighting, shared by the cube map and the surface shaders
 * ------------------------------------------------------------------ */
const v3 = (x, y, z) => { const v = new THREE.Vector3(x, y, z).normalize(); return `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`; };
const STUDIO = /* glsl */ `
  const vec3 KEY = ${v3(-0.55, 0.45, 0.7)};
  const vec3 STRIP = ${v3(0.75, 0.05, 0.65)};
  const vec3 TOP = ${v3(0.03, 0.85, 0.5)};
  const vec3 BOUNCE = ${v3(0.07, -0.75, 0.65)};
  vec3 room(vec3 d) {
    vec3 base = mix(vec3(0.36, 0.38, 0.42), vec3(0.68, 0.70, 0.74), d.y * 0.5 + 0.5);
    float back = smoothstep(0.0, -0.55, d.z);
    vec3 c = mix(base, vec3(1.0), back);
    c += vec3(1.00, 0.98, 0.95) * pow(max(dot(d, KEY), 0.0), 14.0) * 2.6;
    c += vec3(0.95, 0.98, 1.00) * pow(max(dot(d, STRIP), 0.0), 40.0) * 2.4;
    c += vec3(1.00) * pow(max(dot(d, TOP), 0.0), 18.0) * 2.0;
    c += vec3(1.0, 0.95, 0.9) * pow(max(dot(d, BOUNCE), 0.0), 20.0) * 1.2;
    return c;
  }
  float fresnel(float c, float n) {
    float f0 = (n - 1.0) / (n + 1.0); f0 *= f0;
    return f0 + (1.0 - f0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
  }
`;

const cubeRT = new THREE.WebGLCubeRenderTarget(256, {
  type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
});
{
  const s = new THREE.Scene();
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; ${STUDIO} void main(){ gl_FragColor = vec4(room(normalize(vD)), 1.0); }`,
    })
  );
  s.add(m);
  const cc = new THREE.CubeCamera(0.1, 100, cubeRT);
  cc.update(renderer, s);
}

/* ------------------------------------------------------------------ *
 *  Geometry: rods swept along rounded-rect / arc paths
 * ------------------------------------------------------------------ */
function roundedRect(hw, hh, r, cx = 0, cy = 0, seg = 10) {
  const pts = [];
  const corners = [[hw - r, hh - r, 0], [-(hw - r), hh - r, Math.PI / 2], [-(hw - r), -(hh - r), Math.PI], [hw - r, -(hh - r), Math.PI * 1.5]];
  for (const [x, y, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + x + r * Math.cos(a), cy + y + r * Math.sin(a)]);
    }
  }
  return pts;
}
function arc(cx, cy, r, a0, a1, step = 0.05) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
function circle(cx, cy, r, n = 64) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

// merges many rods into one BufferGeometry. rx = half width in plane, rz = half height out of plane
class RodBuilder {
  constructor() { this.pos = []; this.nrm = []; this.idx = []; }
  add(path, { closed = true, rx = 0.08, rz = 0.12, z = 0, seg = 12 } = {}) {
    const n = path.length;
    const base = this.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = path[i];
      const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const sx = ty, sy = -tx; // right-hand side of travel
      for (let j = 0; j < seg; j++) {
        const f = (j / seg) * Math.PI * 2;
        const c = Math.cos(f), s = Math.sin(f);
        this.pos.push(p[0] + sx * rx * c, p[1] + sy * rx * c, z + rz * s);
        const nx = c / rx, nz = s / rz, nl = Math.hypot(nx, nz);
        this.nrm.push((sx * nx) / nl, (sy * nx) / nl, nz / nl);
      }
    }
    const rings = closed ? n : n - 1;
    for (let i = 0; i < rings; i++) {
      const r0 = base + i * seg, r1 = base + ((i + 1) % n) * seg;
      for (let j = 0; j < seg; j++) {
        const k = (j + 1) % seg;
        this.idx.push(r0 + j, r1 + j, r0 + k, r0 + k, r1 + j, r1 + k);
      }
    }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/* ------------------------------------------------------------------ *
 *  Clear-plastic material (refraction of what is behind + env reflection)
 * ------------------------------------------------------------------ */
const resolution = new THREE.Vector2(1, 1);

function plasticMaterial(flat) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uBehind: { value: null },
      uEnv: { value: cubeRT.texture },
      uRes: { value: resolution },
      uFlat: { value: flat ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uBehind; uniform samplerCube uEnv; uniform vec2 uRes; uniform float uFlat;
      varying vec3 vN; varying vec3 vW;
      ${STUDIO}
      vec3 behind(vec2 uv) { return texture2D(uBehind, clamp(uv, 0.001, 0.999)).rgb; }
      void main() {
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vW);
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float f = fresnel(ndv, 1.5);
        vec2 uv = gl_FragCoord.xy / uRes;

        // thick rods bend what is behind them; flat sheets do not
        vec3 Nv = normalize((viewMatrix * vec4(N, 0.0)).xyz);
        vec2 off = Nv.xy * 0.07 * (1.0 - uFlat) * (0.4 + 0.6 * (1.0 - ndv));
        vec3 beh = vec3(behind(uv + off * 0.85).r, behind(uv + off).g, behind(uv + off * 1.18).b);

        float rim = pow(1.0 - ndv, 2.2);
        vec3 tint = mix(vec3(1.0), vec3(0.86, 0.87, 0.89), 0.8 * (1.0 - uFlat));
        vec3 col = beh * mix(tint, vec3(0.985, 0.99, 1.0), uFlat);
        col *= 1.0 - 0.7 * rim * (1.0 - uFlat);

        vec3 R = reflect(-V, N);
        vec3 env = textureLod(uEnv, R, mix(1.2, 0.6, uFlat)).rgb;
        env = mix(env, max(env - vec3(0.62), 0.0) * 1.6, uFlat);   // sheets only show the bright lamps
        float fr = mix(f * 1.35 + 0.05 * rim, f * 0.9, uFlat);
        col += env * fr;
        // bright scatter along the rod edges
        col = mix(col, vec3(1.0), rim * 0.18 * (1.0 - uFlat));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
const trayMat = plasticMaterial(false);
const lidMat = plasticMaterial(false);
const lidSheetMat = plasticMaterial(true);

/* ---- tray ---- */
const tray = new THREE.Group();
{
  const rods = new RodBuilder();
  rods.add(roundedRect(HW, HH, CORNER), { rx: 0.09, rz: 0.15 });
  rods.add(roundedRect(HW - 0.42, HH - 0.42, CORNER - 0.15), { rx: 0.07, rz: 0.1 });
  // disc retainer clips
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    rods.add(arc(0, 0, DISC_R + 0.14, a - 0.22, a + 0.22), { closed: false, rx: 0.06, rz: 0.1, z: 0.02 });
  }
  // little cross-braces between the clips and the inner frame
  for (let k = 0; k < 4; k++) {
    const sx = k % 2 ? -1 : 1, sy = k < 2 ? 1 : -1;
    rods.add([[sx * 2.05, sy * (HH - 0.42)], [sx * 1.7, sy * 1.7]], { closed: false, rx: 0.045, rz: 0.07 });
  }
  // hub rings + spokes
  rods.add(circle(0, 0, 0.64), { rx: 0.05, rz: 0.08 });
  rods.add(circle(0, 0, 0.36), { rx: 0.04, rz: 0.07 });
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
    rods.add([[Math.cos(a) * 0.64, Math.sin(a) * 0.64], [Math.cos(a) * 0.95, Math.sin(a) * 0.95]], { closed: false, rx: 0.05, rz: 0.07 });
  }
  // hinge hooks on the left edge
  for (const y of [-1.45, 1.45]) {
    rods.add(roundedRect(0.38, 0.5, 0.16, -HW + 0.18, y, 6), { rx: 0.05, rz: 0.09 });
  }
  const m = new THREE.Mesh(rods.build(), trayMat);
  tray.add(m);
}
rig.add(tray);

/* ---- lid (pivot on the left edge) ---- */
const lidPivot = new THREE.Group();
lidPivot.position.set(-HW, 0, 0.15);
const lid = new THREE.Group();
lid.position.set(HW, 0, LID_LIFT - 0.15);
{
  const rods = new RodBuilder();
  rods.add(roundedRect(HW, HH, CORNER), { rx: 0.09, rz: 0.15 });
  rods.add(roundedRect(HW - 0.5, HH - 0.5, CORNER - 0.2), { rx: 0.035, rz: 0.05 });
  for (const sy of [1, -1]) for (const sx of [-1, 1]) {
    rods.add(circle(sx * 1.95, sy * (HH - 0.34), 0.14, 20), { rx: 0.035, rz: 0.06 });
  }
  lid.add(new THREE.Mesh(rods.build(), lidMat));

  // the clear sheet
  const sh = new THREE.Shape();
  const pts = roundedRect(HW - 0.05, HH - 0.05, CORNER - 0.05);
  sh.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach((p) => sh.lineTo(p[0], p[1]));
  const sheet = new THREE.Mesh(new THREE.ShapeGeometry(sh), lidSheetMat);
  sheet.position.z = -0.01;
  lid.add(sheet);
}
lidPivot.add(lid);
rig.add(lidPivot);

setLayer(tray, L_TRAY);
setLayer(lidPivot, L_LID);

/* ------------------------------------------------------------------ *
 *  Disc
 * ------------------------------------------------------------------ */
const variants = buildTextures();
const discMat = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  uniforms: {
    uTexA: { value: variants[0].tex }, uTexB: { value: variants[0].tex }, uMix: { value: 0 },
    uBaseA: { value: new THREE.Vector3(...variants[0].base) }, uBaseB: { value: new THREE.Vector3(...variants[0].base) },
    uHoloA: { value: variants[0].holo }, uHoloB: { value: variants[0].holo },
    uHPA: { value: variants[0].holoPrint }, uHPB: { value: variants[0].holoPrint },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec2 vP; varying vec3 vW; varying vec3 vT; varying vec3 vNw;
    void main() {
      vUv = uv; vP = position.xy;
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      vT = mat3(modelMatrix) * vec3(-position.y, position.x, 0.0); // normalised per-fragment (zero at the centre vertex)
      vNw = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uTexA; uniform sampler2D uTexB; uniform float uMix;
    uniform vec3 uBaseA; uniform vec3 uBaseB;
    uniform float uHoloA; uniform float uHoloB; uniform float uHPA; uniform float uHPB;
    varying vec2 vUv; varying vec2 vP; varying vec3 vW; varying vec3 vT; varying vec3 vNw;
    ${STUDIO}
    const float DR = ${DISC_R.toFixed(2)};
    vec3 spec(float x) { return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67))); }
    void main() {
      float R = length(vP) / DR;
      if (R < 0.075) discard;
      vec3 V = normalize(cameraPosition - vW);
      vec3 T = normalize(vT);
      vec3 Rw = normalize(cross(vNw, T));

      // groove diffraction: each lamp throws its own rainbow fan
      vec3 holo = vec3(0.0);
      vec3 lamps[4]; lamps[0] = KEY; lamps[1] = STRIP; lamps[2] = TOP; lamps[3] = BOUNCE;
      float wt[4]; wt[0] = 1.0; wt[1] = 0.9; wt[2] = 0.7; wt[3] = 0.45;
      for (int i = 0; i < 4; i++) {
        vec3 H = normalize(lamps[i] + V);
        float x = dot(lamps[i].xy + V.xy, Rw.xy);
        float t = dot(H.xy, T.xy);
        float tn = t / (length(H.xy) + 0.12);
        float wedge = exp(-tn * tn * 16.0);
        holo += spec(x * 2.4 + R * 0.7) * (0.05 + 1.5 * wedge) * wt[i];
      }
      holo *= 0.38;

      vec4 pa = texture2D(uTexA, vUv);
      vec4 pb = texture2D(uTexB, vUv);
      vec4 pr = mix(pa, pb, uMix);
      vec3 base = mix(uBaseA, uBaseB, uMix);
      float hp = mix(uHoloA, uHoloB, uMix);
      float hpp = mix(uHPA, uHPB, uMix);

      vec3 baseCol = base + holo * hp;
      // glossy lacquer over the print: only the bright lamps show
      vec3 H0 = normalize(KEY + V);
      float gloss = pow(max(dot(vNw, H0), 0.0), 220.0) * 0.5;
      vec3 printCol = pr.rgb * 0.97 + holo * hpp * 0.5 + gloss;
      // foil sparkle on sticker borders
      float lum = dot(pr.rgb, vec3(0.333));
      printCol += holo * smoothstep(0.82, 1.0, lum) * 0.22 * hp;

      vec3 col = mix(baseCol, printCol, pr.a);
      float alpha = 1.0;

      if (R < 0.34) {
        // clear hub: stacked translucent rings
        float rings = 0.5 + 0.5 * sin(R * 160.0);
        vec3 hub = mix(vec3(0.80, 0.82, 0.85), vec3(0.97), rings * 0.7);
        hub *= 0.92 + 0.08 * sin(atan(vP.y, vP.x) * 3.0 + 1.0);
        float edge = smoothstep(0.012, 0.0, abs(R - 0.34)) + smoothstep(0.01, 0.0, abs(R - 0.18)) * 0.8;
        hub = mix(hub, vec3(0.45, 0.47, 0.5), edge);
        // three notches
        float a = atan(vP.y, vP.x);
        float notch = smoothstep(0.02, 0.0, abs(R - 0.26)) * smoothstep(0.28, 0.2, abs(sin(a * 1.5)));
        hub = mix(hub, vec3(0.5), notch * 0.6);
        col = hub;
        alpha = mix(0.62, 0.92, edge);
      }
      // bevelled outer edge catches light
      float rimL = smoothstep(0.955, 1.0, R);
      col = mix(col, vec3(0.92, 0.94, 0.97), rimL * 0.55);
      col *= 1.0 - 0.1 * smoothstep(0.34, 0.37, R) * (1.0 - smoothstep(0.37, 0.42, R)); // inner mirror-band shadow
      gl_FragColor = vec4(col, alpha);
    }`,
});
const disc = new THREE.Mesh(new THREE.CircleGeometry(DISC_R, 160), discMat);
disc.position.z = 0.0;
rig.add(disc);
setLayer(disc, L_BASE);

/* ------------------------------------------------------------------ *
 *  Soft contact / drop shadow on the white surface
 * ------------------------------------------------------------------ */
const shadowMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uAngle: { value: 0 } },
  vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform float uAngle; varying vec2 vP;
    float sdBox(vec2 p, vec2 b, float r) { vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
    void main() {
      // tray
      vec2 p = vP - vec2(0.55, -0.75);
      float a = 0.0;
      float dt = sdBox(p, vec2(${HW.toFixed(2)}, ${HH.toFixed(2)}), ${CORNER.toFixed(2)});
      a += (1.0 - smoothstep(-0.9, 0.9, dt)) * 0.26;
      // lid swinging on its hinge: its footprint shrinks then grows to the left
      float c = cos(uAngle), s = sin(uAngle);
      float cx = -${HW.toFixed(2)} + ${HW.toFixed(2)} * c;
      float hwid = max(${HW.toFixed(2)} * abs(c), 0.12);
      float h = 6.0 * s;
      vec2 q = vP - vec2(cx + 0.18 * h + 0.5, -0.7 - 0.12 * h);
      float dl = sdBox(q, vec2(hwid, ${HH.toFixed(2)}), min(${CORNER.toFixed(2)}, hwid));
      float blur = 0.6 + 0.14 * h;
      float la = (1.0 - smoothstep(-blur, blur, dl)) * (0.22 / (1.0 + 0.12 * h));
      a = max(a, la) + min(a, la) * 0.35;
      // tight contact shadow
      float cd = sdBox(vP - vec2(0.12, -0.16), vec2(${HW.toFixed(2)}, ${HH.toFixed(2)}), ${CORNER.toFixed(2)});
      a += (1.0 - smoothstep(-0.12, 0.28, cd)) * 0.1;
      // clear plastic lets the light through: the shadow only reads outside the footprint
      float d0 = sdBox(vP, vec2(${HW.toFixed(2)}, ${HH.toFixed(2)}), ${CORNER.toFixed(2)});
      float inside = 1.0 - smoothstep(-0.25, 0.05, d0);
      if (uAngle < 0.2) a *= mix(1.0, 0.1, inside);
      gl_FragColor = vec4(vec3(0.08, 0.09, 0.12), clamp(a, 0.0, 0.5) * 0.85);
    }`,
});
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), shadowMat);
shadow.position.z = -0.85;
shadow.renderOrder = -1;
rig.add(shadow);
setLayer(shadow, L_BASE);

/* ------------------------------------------------------------------ *
 *  Render targets + full-screen blit
 * ------------------------------------------------------------------ */
const rtOpts = { samples: 4, depthBuffer: true, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
const rtA = new THREE.WebGLRenderTarget(4, 4, rtOpts);
const rtB = new THREE.WebGLRenderTarget(4, 4, rtOpts);
const quadMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: { uTex: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D uTex; varying vec2 vUv; void main(){ gl_FragColor = texture2D(uTex, vUv); }',
});
const quadScene = new THREE.Scene();
quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function renderFrame() {
  const only = (layer) => { camera.layers.set(layer); };
  // 1. backdrop + shadow + disc
  renderer.setRenderTarget(rtA);
  renderer.clear();
  only(L_BASE);
  renderer.render(scene, camera);
  // 2. tray over it
  quadMat.uniforms.uTex.value = rtA.texture;
  renderer.setRenderTarget(rtB);
  renderer.clear();
  renderer.render(quadScene, quadCam);
  renderer.clearDepth();
  trayMat.uniforms.uBehind.value = rtA.texture;
  only(L_TRAY);
  renderer.render(scene, camera);
  // 3. lid over that, to the screen
  quadMat.uniforms.uTex.value = rtB.texture;
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(quadScene, quadCam);
  renderer.clearDepth();
  lidMat.uniforms.uBehind.value = rtB.texture;
  lidSheetMat.uniforms.uBehind.value = rtB.texture;
  only(L_LID);
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ *
 *  Layout
 * ------------------------------------------------------------------ */
let aspect = 1;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  rtA.setSize(bw, bh);
  rtB.setSize(bw, bh);
  resolution.set(bw, bh);
  aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ *
 *  State + interaction
 * ------------------------------------------------------------------ */
const state = {
  open: 0, openVel: 0, openTarget: 0,
  rx: 0, ry: 0, rvx: 0, rvy: 0, spin: true, spinSpeed: 1, discAngle: 0,
  mixTarget: 0, current: 0,
};
const REST_Z = -0.07;

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
  state.rvx = state.rvy = 0;
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
  state.ry += dx * 0.006;
  state.rx += dy * 0.006;
  state.rvy = dx * 0.006; state.rvx = dy * 0.006;
  clampRot();
});
function endDrag(e) {
  if (!drag) return;
  canvas.classList.remove('drag');
  if (drag.moved < 6 && performance.now() - drag.t < 450) toggleOpen();
  drag = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function clampRot() {
  state.rx = THREE.MathUtils.clamp(state.rx, -0.75, 0.75);
  state.ry = THREE.MathUtils.clamp(state.ry, -0.95, 0.95);
}
function toggleOpen(v) {
  state.openTarget = v ?? (state.openTarget > 0.5 ? 0 : 1);
  document.getElementById('hint').style.opacity = '0';
}

const btnOpen = document.getElementById('btnOpen');
btnOpen.addEventListener('click', () => toggleOpen());
document.getElementById('btnReset').addEventListener('click', () => { state.rx = state.ry = state.rvx = state.rvy = 0; });
const btnSpin = document.getElementById('btnSpin');
const icoPause = document.getElementById('icoPause');
btnSpin.addEventListener('click', () => {
  state.spin = !state.spin;
  btnSpin.classList.toggle('off', !state.spin);
  icoPause.innerHTML = state.spin
    ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'
    : '<path d="M8 5.5v13l11-6.5z"/>';
});
window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggleOpen(); } });

const thumbs = [...document.querySelectorAll('.thumb')];
thumbs.forEach((b, i) => {
  paintThumb(b.querySelector('canvas'), variants[i]);
  b.addEventListener('click', () => selectVariant(i));
});
function selectVariant(i) {
  if (i === state.current) return;
  const u = discMat.uniforms;
  if (u.uMix.value > 0) finishMix();
  const v = variants[i];
  u.uTexB.value = v.tex;
  u.uBaseB.value.set(...v.base);
  u.uHoloB.value = v.holo;
  u.uHPB.value = v.holoPrint;
  state.mixTarget = 1;
  state.current = i;
  thumbs.forEach((t, k) => t.classList.toggle('is-on', k === i));
}
function finishMix() {
  const u = discMat.uniforms;
  u.uTexA.value = u.uTexB.value;
  u.uBaseA.value.copy(u.uBaseB.value);
  u.uHoloA.value = u.uHoloB.value;
  u.uHPA.value = u.uHPB.value;
  u.uMix.value = 0;
  state.mixTarget = 0;
}

/* ------------------------------------------------------------------ *
 *  Loop
 * ------------------------------------------------------------------ */
const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  const t = now / 1000;

  // lid spring (slightly under-damped, so it settles with a tiny bounce)
  const k = 70, c = 9.5;
  const acc = k * (state.openTarget - state.open) - c * state.openVel;
  state.openVel += acc * dt;
  state.open += state.openVel * dt;
  state.open = Math.max(-0.02, state.open);
  const o = state.open;
  const oc = THREE.MathUtils.clamp(o, 0, 1);

  // turn with inertia, then drift back to rest
  if (!drag) {
    state.ry += state.rvy; state.rx += state.rvx;
    const f = Math.pow(0.9, dt * 60);
    state.rvy *= f; state.rvx *= f;
    const back = 1 - Math.pow(0.985, dt * 60);
    state.ry -= state.ry * back * 0.5;
    state.rx -= state.rx * back * 0.5;
    clampRot();
  }
  rig.rotation.set(state.rx, state.ry, REST_Z + Math.sin(t * 0.6) * 0.008);

  // lid + framing
  lidPivot.rotation.y = -Math.min(o, 1.05) * OPEN_ANGLE;
  shadowMat.uniforms.uAngle.value = Math.min(Math.max(o, 0), 1.05) * OPEN_ANGLE;
  const ease = oc * oc * (3 - 2 * oc);
  rig.position.set(ease * HW, 0.28 + Math.sin(t * 0.9) * 0.03, 0);

  const W = THREE.MathUtils.lerp(8.4, 15.4, ease);
  const H = 9.6;
  const dist = Math.max(H / (2 * tanHalf), W / (aspect * 2 * tanHalf));
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);

  // disc
  state.spinSpeed += ((state.spin ? 1 : 0) - state.spinSpeed) * Math.min(1, dt * 3);
  state.discAngle += dt * 0.55 * state.spinSpeed;
  disc.rotation.z = state.discAngle;
  disc.position.z = 0.02 + 0.02 * Math.sin(t * 1.3);

  // variant cross-fade
  if (state.mixTarget > 0) {
    discMat.uniforms.uMix.value = Math.min(1, discMat.uniforms.uMix.value + dt * 3.2);
    if (discMat.uniforms.uMix.value >= 1) finishMix();
  }

  renderFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debugging / verification hooks
window.__cd = { state, toggleOpen, selectVariant };
