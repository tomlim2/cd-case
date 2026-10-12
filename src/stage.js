// The stage: one WebGL canvas, the cases on it, and the loop that moves and draws them.
//
// A frame is drawn in layers, back to front:
//   1. the page with its shadows, and the discs                        -> `whole`
//   2. each clear layer (a tray, a lid) over a copy of the picture so far, so that its rods can
//      bend what is behind them                                          -> `patch`, ping-ponged
//   3. glints picked out of the picture and drawn into stars, then everything goes to the screen
import * as THREE from 'three';
import { QUAD_VERT } from './gl/studio.js';
import { ROD_VERT, ROD_FRAG, SHEET_VERT, SHEET_FRAG } from './gl/plastic.js';
import { DISC_VERT, DISC_FRAG, KIND } from './gl/disc.js';
import { PAGE_VERT, PAGE_FRAG, CASTERS } from './gl/page.js';
import { COPY_FRAG, SEED_FRAG, STREAK_FRAG, FINAL_FRAG } from './gl/post.js';
import { HALF, HINGE, LEVEL, buildTray, buildLid, buildDisc } from './case.js';
import { clamp01, lerp, blank, resting, lidPose, leaving, arriving, OPENING, CLOSING, SWAP_TIME } from './motion.js';

const FOV = 28;
const PAGE_Z = -64; // the page hangs this far behind the case, so shadows fall wide and soft
const LIGHT = new THREE.Vector3(-0.34, 0.46, 1).normalize(); // from a point on the page toward the lamp
const SPIN = (18 * Math.PI) / 180; // the disc's speed, radians a second
const IOR = 1.59; // polystyrene
const SOAK = [0.0046, 0.0033, 0.0027]; // what a millimetre of it absorbs: a faint cool grey
const DOCK_LIFT = 42; // css pixels the view is raised by, to clear the dock

// when nobody touches it the stage plays itself: open, close, next
const AUTO = { open: 2.4, hold: 1.2, next: 8.6 };

export function createStage(host, discs, hooks = {}) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '디스크가 든 투명 주얼 케이스. 누르면 뚜껑이 열리고, 끌면 돌아갑니다.');
  host.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    hooks.onFail?.();
    return null;
  }
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) {
    renderer.dispose();
    canvas.remove();
    hooks.onFail?.();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  renderer.setClearColor(0xffffff, 0);

  const owned = []; // everything to dispose of
  const keep = (x) => (owned.push(x), x);

  /* ---------------------------------------------------------------- targets */
  const target = (samples, depth) =>
    keep(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: depth, stencilBuffer: false, resolveDepthBuffer: false }));
  const whole = target(4, true);
  const patch = [target(4, true), target(4, true)];
  const seeds = target(0, false);
  const streakA = target(0, false);
  const streakB = target(0, false);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 4000);
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = keep(new THREE.PlaneGeometry(2, 2));
  const pass = (frag, uniforms) => {
    const material = keep(new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false }));
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(quad, material));
    return { scene, material, u: material.uniforms };
  };

  /* ---------------------------------------------------------------- the page and the discs */
  const pageScene = new THREE.Scene();
  const cast = {
    uCast: { value: Array.from({ length: CASTERS }, () => new THREE.Matrix3()) },
    uShow: { value: new Array(CASTERS).fill(0) },
    uSize: { value: new Array(CASTERS).fill(1) },
    uDisc: { value: [0, 0] },
  };
  const page = new THREE.Mesh(keep(new THREE.PlaneGeometry(8000, 8000)), keep(new THREE.ShaderMaterial({ uniforms: cast, vertexShader: PAGE_VERT, fragmentShader: PAGE_FRAG })));
  page.position.z = PAGE_Z;
  page.updateMatrixWorld();
  pageScene.add(page);

  /* ---------------------------------------------------------------- the plastic */
  const plasticScene = new THREE.Scene();
  const copyMat = keep(new THREE.ShaderMaterial({ uniforms: { uTex: { value: null } }, vertexShader: QUAD_VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false }));
  const copy = new THREE.Mesh(quad, copyMat);
  copy.frustumCulled = false;
  copy.renderOrder = -10;
  plasticScene.add(copy);

  const rect = new THREE.Vector4(0, 0, 1, 1);
  const rodMat = keep(
    new THREE.ShaderMaterial({
      uniforms: {
        uPicture: { value: null },
        uProj: { value: camera.projectionMatrix },
        uRect: { value: rect },
        uGap: { value: 12 },
        uIor: { value: IOR },
        uSoak: { value: new THREE.Vector3(...SOAK) },
        uFade: { value: 1 },
        uTaps: { value: window.matchMedia('(pointer: coarse)').matches ? 2 : 4 }, // rays per pixel, in pairs
      },
      vertexShader: ROD_VERT,
      fragmentShader: ROD_FRAG,
    })
  );
  const sheetMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { uIor: { value: IOR }, uSoak: { value: new THREE.Vector3(...SOAK) }, uFade: { value: 1 } },
      vertexShader: SHEET_VERT,
      fragmentShader: SHEET_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      // picture = picture * (1 - a) + rgb, and the picture's own alpha is left alone
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    })
  );
  const hideMat = keep(new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));

  const shapes = {};
  const shape = (key, make) => {
    if (!shapes[key]) {
      const made = make();
      for (const g of made.isBufferGeometry ? [made] : Object.values(made)) keep(g);
      shapes[key] = made;
    }
    return shapes[key];
  };
  const part = (mesh, scene) => {
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const cases = discs.map((data, i) => {
    const clearHub = data.kind === 'print' || data.kind === 'holo';
    const tray = shape(clearHub ? 'tray-cd' : 'tray', () => buildTray({ clearHub }));
    const lid = shape('lid', buildLid);
    const discGeo = shape(clearHub ? 'disc-cd' : 'disc', () => buildDisc({ clearHub }));
    const art = keep(new THREE.CanvasTexture(data.art));
    art.colorSpace = data.relief ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    art.anisotropy = maxAniso;
    renderer.initTexture(art); // uploaded now, so the first change of disc does not stall
    const discMat = keep(
      new THREE.ShaderMaterial({
        uniforms: { uArt: { value: art }, uKind: { value: KIND[data.kind] }, uInner: { value: data.inner }, uOuter: { value: data.outer }, uFade: { value: 1 } },
        vertexShader: DISC_VERT,
        fragmentShader: DISC_FRAG,
        side: THREE.DoubleSide,
      })
    );
    const sheets = (g) => {
      const m = new THREE.Mesh(g, sheetMat);
      m.renderOrder = 1;
      return m;
    };
    const hidden = new THREE.Mesh(discGeo, hideMat);
    hidden.renderOrder = -5;
    return {
      data,
      seed: 1.7 * i + 0.4,
      trayRods: part(new THREE.Mesh(tray.rods, rodMat), plasticScene),
      traySheets: part(sheets(tray.sheets), plasticScene),
      lidRods: part(new THREE.Mesh(lid.rods, rodMat), plasticScene),
      lidSheets: part(sheets(lid.sheets), plasticScene),
      disc: part(new THREE.Mesh(discGeo, discMat), pageScene),
      discHide: part(hidden, plasticScene),
      discMat,
      mCase: new THREE.Matrix4(),
      mLid: new THREE.Matrix4(),
      iCase: new THREE.Matrix4(),
      iLid: new THREE.Matrix4(),
      shown: false,
      fade: 1,
      size: 1,
      zTray: 0,
      zLid: 0,
    };
  });
  const partsOf = (c) => [c.trayRods, c.traySheets, c.lidRods, c.lidSheets, c.disc, c.discHide];

  /* ---------------------------------------------------------------- post */
  const frameU = { uWhole: { value: whole.texture }, uPatch: { value: whole.texture }, uRect: { value: rect } };
  const seedPass = pass(SEED_FRAG, { ...frameU, uTexel: { value: new THREE.Vector2() }, uFloor: { value: 1.6 } });
  const streakPass = pass(STREAK_FRAG, { uTex: { value: seeds.texture }, uStep: { value: new THREE.Vector2() }, uDecay: { value: 0.72 } });
  const finalPass = pass(FINAL_FRAG, { ...frameU, uStreakA: { value: streakA.texture }, uStreakB: { value: streakB.texture }, uGlint: { value: 1.5 } });

  /* ---------------------------------------------------------------- state */
  const st = {
    t: 0,
    cur: 0,
    swap: null, // { from, to, start, dir, lid: { phase, at } }
    queued: null,
    swaps: 0,
    phase: 'rest', // rest | opening | open | closing
    phaseAt: 0,
    auto: false,
    closeNext: false,
    idle: 0,
    spin: 0,
    spinRate: SPIN,
    open: false,
  };
  const flags = { spin: true, paused: false, ready: false, frozen: null, noGlint: false, noLid: false, noTray: false };
  const pointer = { x: 0, y: 0, over: false };
  const lean = { x: 0, y: 0 }; // the case leaning toward the pointer
  const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, start: null, last: null, moved: 0, at: 0, flick: { x: 0, y: 0 } };
  let view = { w: 1, h: 1, openSize: 1 };
  let raf = 0;
  let before = 0;

  const setOpen = (v) => {
    if (st.open !== v) {
      st.open = v;
      hooks.onOpen?.(v);
    }
  };
  function open(auto) {
    if (st.phase !== 'rest') return;
    st.phase = 'opening';
    st.phaseAt = st.t;
    st.auto = auto;
    setOpen(true);
  }
  function close() {
    if (st.phase === 'opening') {
      st.closeNext = true; // let it finish opening first
      st.auto = true;
    } else if (st.phase === 'open') {
      st.phase = 'closing';
      st.phaseAt = st.t;
      setOpen(false);
    }
  }
  function toggle(want = st.phase === 'rest' || st.phase === 'closing') {
    if (!flags.ready || st.swap) return;
    if (want) open(false);
    else close();
  }
  function goTo(i) {
    if (!flags.ready || i < 0 || i >= cases.length) return;
    if (st.swap) {
      st.queued = i;
      return;
    }
    if (i === st.cur) return;
    // the outgoing case keeps doing whatever its lid was doing
    st.swap = { from: st.cur, to: i, start: st.t, dir: Math.floor(st.swaps / 2) % 2 ? -1 : 1, lid: { phase: st.phase, at: st.phaseAt } };
    st.swaps++;
    st.phase = 'rest';
    st.phaseAt = st.t;
    st.auto = false;
    st.closeNext = false;
    setOpen(false);
    hooks.onIndex?.(i);
  }
  const step = (by) => goTo(((st.swap ? st.swap.to : st.cur) + by + cases.length) % cases.length);

  /* ---------------------------------------------------------------- placing a case */
  const euler = new THREE.Euler(0, 0, 0, 'XYZ');
  const quat = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const m1 = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();
  const m3 = new THREE.Matrix3();
  const ld = new THREE.Vector3();

  // The matrix that takes a point of the page (x, y, 1) to where its ray toward the lamp crosses the
  // plane z = level of the part whose inverse world matrix is `inv`: (x, y there, distance to it).
  function castInto(out, inv, level) {
    ld.copy(LIGHT).applyMatrix3(m3.setFromMatrix4(inv));
    if (Math.abs(ld.z) < 1e-4) return out.set(0, 0, 0, 0, 0, 0, 0, 0, -1); // edge on to the lamp: no shadow
    const hit = (x, y) => {
      v.set(x, y, PAGE_Z).applyMatrix4(inv);
      const d = (level - v.z) / ld.z;
      return [v.x + ld.x * d, v.y + ld.y * d, d];
    };
    const o = hit(0, 0);
    const ex = hit(1, 0);
    const ey = hit(0, 1);
    return out.set(ex[0] - o[0], ey[0] - o[0], o[0], ex[1] - o[1], ey[1] - o[1], o[1], ex[2] - o[2], ey[2] - o[2], o[2]);
  }

  function place(c, pose, slot) {
    const size = pose.size * lerp(1, view.openSize, pose.spread);
    euler.set(pose.pitch + lean.x + drag.x, pose.yaw + lean.y + drag.y, pose.roll);
    quat.setFromEuler(euler);
    // open, the pair is centred: the tray moves right to make room for the lid
    v.set(pose.x + HALF * size * pose.spread * 0.94, pose.y, pose.z);
    c.mCase.compose(v, quat, s3.setScalar(size));
    m1.makeTranslation(HINGE.x, 0, HINGE.z);
    m2.makeRotationY(-pose.lid);
    c.mLid.copy(c.mCase).multiply(m1).multiply(m2).multiply(m1.makeTranslation(-HINGE.x, 0, -HINGE.z));
    c.iCase.copy(c.mCase).invert();
    c.iLid.copy(c.mLid).invert();
    m2.makeRotationZ(-st.spin);
    c.disc.matrix.copy(c.mCase).multiply(m2);
    c.discHide.matrix.copy(c.disc.matrix);
    c.trayRods.matrix.copy(c.mCase);
    c.traySheets.matrix.copy(c.mCase);
    c.lidRods.matrix.copy(c.mLid);
    c.lidSheets.matrix.copy(c.mLid);
    for (const p of partsOf(c)) {
      p.matrixWorld.copy(p.matrix);
      p.visible = true;
    }
    c.discMat.uniforms.uFade.value = pose.fade;
    c.fade = pose.fade;
    c.size = size;
    c.zTray = v.set(0, 0, LEVEL.tray).applyMatrix4(c.mCase).applyMatrix4(camera.matrixWorldInverse).z;
    c.zLid = v.set(0, 0, LEVEL.lid).applyMatrix4(c.mLid).applyMatrix4(camera.matrixWorldInverse).z;
    c.shown = true;
    // shadows
    const k = slot * 3;
    m1.copy(c.disc.matrix).invert();
    castInto(cast.uCast.value[k], c.iCase, LEVEL.tray);
    castInto(cast.uCast.value[k + 1], m1, LEVEL.disc);
    castInto(cast.uCast.value[k + 2], c.iLid, LEVEL.lid);
    for (let j = 0; j < 3; j++) {
      cast.uShow.value[k + j] = pose.fade;
      cast.uSize.value[k + j] = size;
    }
    cast.uDisc.value[slot] = c.data.shadow;
  }
  function hide(c) {
    for (const p of partsOf(c)) p.visible = false;
    c.shown = false;
  }

  // is the pointer (in clip coordinates) over the current case?
  const ro = new THREE.Vector3();
  const rd = new THREE.Vector3();
  function over(x, y) {
    const c = cases[st.cur];
    if (!c?.shown) return false;
    for (const [inv, level] of [[c.iCase, 0], [c.iLid, LEVEL.lid]]) {
      ro.copy(camera.position).applyMatrix4(inv);
      rd.set(x, y, 0.5).unproject(camera).applyMatrix4(inv).sub(ro);
      if (Math.abs(rd.z) < 1e-6) continue;
      const d = (level - ro.z) / rd.z;
      if (d > 0 && Math.abs(ro.x + rd.x * d) <= HALF && Math.abs(ro.y + rd.y * d) <= HALF) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- a frame */
  function tick(dt) {
    st.t += dt;
    const t = st.t;
    st.spinRate += ((flags.spin ? SPIN : 0) - st.spinRate) * (1 - Math.exp(-2.7 * dt));
    st.spin += st.spinRate * dt;

    // the case leans a little toward the pointer; a drag turns it, and letting go springs it back
    const hovering = pointer.over && !drag.on;
    const ease = 1 - Math.exp(-4 * dt);
    lean.x += ((hovering ? 0.2 * pointer.y : 0) - lean.x) * ease;
    lean.y += ((hovering ? -0.32 * pointer.x : 0) - lean.y) * ease;
    if (!drag.on) {
      drag.vx += (-18 * drag.x - 6 * drag.vx) * dt;
      drag.vy += (-18 * drag.y - 6 * drag.vy) * dt;
      drag.x += drag.vx * dt;
      drag.y += drag.vy * dt;
    }

    if (st.swap && t - st.swap.start >= SWAP_TIME) {
      st.cur = st.swap.to;
      st.swap = null;
      st.idle = 0;
      const q = st.queued;
      st.queued = null;
      if (q !== null && q !== st.cur) goTo(q);
    }
    const into = t - st.phaseAt;
    if (st.phase === 'opening' && into >= OPENING.time) {
      st.phase = 'open';
      st.phaseAt = t;
    } else if (st.phase === 'closing' && into >= CLOSING.time) {
      st.phase = 'rest';
      st.phaseAt = t;
      st.idle = Math.max(st.idle, AUTO.next - 1.8);
    }

    // playing itself, unless someone is at it
    const held = drag.on || (hovering && over(pointer.x, pointer.y)) || (st.phase === 'open' && !st.auto);
    const playing = flags.ready && !flags.paused && !held && !st.swap;
    if (st.phase === 'open' && (st.closeNext || (st.auto && playing && t - st.phaseAt >= AUTO.hold))) {
      st.closeNext = false;
      close();
    }
    if (playing) {
      st.idle += dt;
      if (st.phase === 'rest' && st.idle >= AUTO.open && st.idle < AUTO.open + 0.5) open(true);
      if (st.phase === 'rest' && st.idle >= AUTO.next) step(1);
    }
    hooks.onProgress?.(st.swap ? 0 : clamp01(st.idle / AUTO.next));

    // who is on stage, and where
    const sw = st.swap;
    const along = sw ? clamp01((t - sw.start) / SWAP_TIME) : 0;
    let slot = 0;
    cases.forEach((c, i) => {
      if (sw && i === sw.from) place(c, leaving(lidPose(sw.lid.phase, t - sw.lid.at, t, c.seed, calm), along, sw.dir), slot++);
      else if (sw && i === sw.to) place(c, arriving(resting(t, c.seed, calm), along, sw.dir), slot++);
      else if (!sw && i === st.cur) place(c, lidPose(st.phase, t - st.phaseAt, t, c.seed, calm), slot++);
      else hide(c);
    });
    for (; slot < 2; slot++) for (let j = 0; j < 3; j++) cast.uShow.value[slot * 3 + j] = 0;
    draw();
  }

  // the screen rectangle the cases cover, in pixels, with a margin
  const corner = new THREE.Vector3();
  function cover(w, h) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cases) {
      if (!c.shown) continue;
      for (const m of [c.mCase, c.mLid]) {
        for (let i = 0; i < 8; i++) {
          corner.set(i & 1 ? 76 : -76, i & 2 ? 76 : -76, i & 4 ? 7 : -7).applyMatrix4(m).project(camera);
          x0 = Math.min(x0, corner.x);
          x1 = Math.max(x1, corner.x);
          y0 = Math.min(y0, corner.y);
          y1 = Math.max(y1, corner.y);
        }
      }
    }
    if (x0 > x1) return null;
    const pad = 0.04 * Math.max(x1 - x0, y1 - y0) + 0.02;
    const px = (n, size) => Math.min(size, Math.max(0, Math.round(((n + 1) / 2) * size)));
    const r = { x: px(x0 - pad, w), y: px(y0 - pad, h), x1: px(x1 + pad, w), y1: px(y1 + pad, h) };
    return r.x1 > r.x && r.y1 > r.y ? r : null;
  }

  const layers = [];
  function draw() {
    // 1. page, shadows, discs
    renderer.setRenderTarget(whole);
    renderer.clear();
    renderer.render(pageScene, camera);

    // 2. the clear layers, furthest first
    layers.length = 0;
    for (const c of cases) {
      if (!c.shown) continue;
      if (!flags.noTray) layers.push({ z: c.zTray, rods: c.trayRods, sheets: c.traySheets, fade: c.fade, size: c.size });
      if (!flags.noLid) layers.push({ z: c.zLid, rods: c.lidRods, sheets: c.lidSheets, fade: c.fade, size: c.size });
    }
    layers.sort((a, b) => a.z - b.z);
    const w = whole.width;
    const h = whole.height;
    const box = layers.length ? cover(w, h) : null;
    let picture = whole;
    if (box) {
      rect.set(box.x / w, box.y / h, box.x1 / w, box.y1 / h);
      const clear = cases.flatMap((c) => [c.trayRods, c.traySheets, c.lidRods, c.lidSheets]);
      const was = clear.map((m) => m.visible);
      for (const p of patch) {
        p.scissor.set(box.x, box.y, box.x1 - box.x, box.y1 - box.y);
        p.scissorTest = true;
      }
      layers.forEach((layer, i) => {
        const into = patch[i % 2];
        for (const m of clear) m.visible = m === layer.rods || m === layer.sheets;
        copyMat.uniforms.uTex.value = picture.texture;
        rodMat.uniforms.uPicture.value = picture.texture;
        rodMat.uniforms.uFade.value = layer.fade;
        rodMat.uniforms.uGap.value = 12 * layer.size;
        sheetMat.uniforms.uFade.value = layer.fade;
        renderer.setRenderTarget(into);
        renderer.clear();
        renderer.render(plasticScene, camera);
        picture = into;
      });
      clear.forEach((m, i) => (m.visible = was[i]));
    } else {
      rect.set(0, 0, 0, 0);
    }
    frameU.uPatch.value = picture.texture;

    // 3. glints, then out
    if (!flags.noGlint) {
      seedPass.u.uTexel.value.set(1 / seeds.width, 1 / seeds.height);
      renderer.setRenderTarget(seeds);
      renderer.render(seedPass.scene, flat);
      streakPass.u.uStep.value.set(1.5 / seeds.width, 0);
      renderer.setRenderTarget(streakA);
      renderer.render(streakPass.scene, flat);
      streakPass.u.uStep.value.set(0, 1.5 / seeds.height);
      renderer.setRenderTarget(streakB);
      renderer.render(streakPass.scene, flat);
    }
    finalPass.u.uGlint.value = flags.noGlint ? 0 : 1.5;
    renderer.setRenderTarget(null);
    renderer.render(finalPass.scene, flat);
  }

  /* ---------------------------------------------------------------- size */
  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    whole.setSize(buf.x, buf.y);
    for (const p of patch) p.setSize(buf.x, buf.y);
    const hw = Math.max(1, Math.round(buf.x / 2));
    const hh = Math.max(1, Math.round(buf.y / 2));
    for (const s of [seeds, streakA, streakB]) s.setSize(hw, hh);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // the closed case takes 58% of the height, or on a narrow screen 78% of the width
    const dist = Math.max(146 / 0.58 / 2 / tan, 146 / 0.78 / 2 / (tan * camera.aspect));
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(w, h, 0, DOCK_LIFT, w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // open, lid and tray lie side by side: scaled to keep the pair inside the width
    view = { w, h, openSize: Math.min(1.04, (0.9 * 2 * dist * tan * camera.aspect) / 296) };
  }
  const watcher = new ResizeObserver(resize);
  watcher.observe(host);

  /* ---------------------------------------------------------------- pointer */
  const toClip = (e) => {
    const b = host.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * 2 - 1, 1 - ((e.clientY - b.top) / b.height) * 2];
  };
  const onMove = (e) => {
    [pointer.x, pointer.y] = toClip(e);
    pointer.over = true;
    if (!drag.on) {
      host.style.cursor = over(pointer.x, pointer.y) ? 'pointer' : '';
      return;
    }
    const dx = (e.clientX - drag.last.x) * 0.008;
    const dy = (e.clientY - drag.last.y) * 0.008;
    drag.last = { x: e.clientX, y: e.clientY };
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y));
    drag.y = Math.min(0.9, Math.max(-0.9, drag.y + dx));
    drag.x = Math.min(0.45, Math.max(-0.45, drag.x + dy));
    drag.flick = { x: dy * 60, y: dx * 60 };
    drag.at = performance.now();
  };
  const onLeave = () => {
    pointer.over = false;
  };
  const onDown = (e) => {
    if (!flags.ready || st.swap || e.button !== 0) return;
    const [x, y] = toClip(e);
    if (!over(x, y)) return;
    drag.on = true;
    drag.start = { x: e.clientX, y: e.clientY };
    drag.last = { x: e.clientX, y: e.clientY };
    drag.moved = 0;
    drag.flick = { x: 0, y: 0 };
    drag.at = performance.now();
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that cannot be captured still drags, it just has to stay over the stage
    }
    host.style.cursor = 'grabbing';
  };
  const onUp = (e) => {
    if (!drag.on) return;
    drag.on = false;
    // a flick carries on; a drag that had come to rest just lets go
    const still = performance.now() - drag.at > 90;
    drag.vx = still ? 0 : drag.flick.x;
    drag.vy = still ? 0 : drag.flick.y;
    if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    host.style.cursor = '';
    if (e.type === 'pointerup' && drag.moved < 6) toggle();
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);

  /* ---------------------------------------------------------------- loop */
  // if frames are slow, give up resolution before smoothness
  const times = [];
  let tuning = true;
  function tune(dt) {
    if (!tuning || document.hidden || dt > 0.1) return;
    times.push(dt);
    if (times.length < 90) return;
    times.sort((a, b) => a - b);
    const mid = times[times.length >> 1];
    times.length = 0;
    const ratio = renderer.getPixelRatio();
    if (mid < 1 / 42 || ratio <= 1) {
      tuning = false;
      return;
    }
    renderer.setPixelRatio(Math.max(1, Math.min(ratio - 0.25, Math.round(ratio * Math.sqrt(1 / 48 / mid) * 4) / 4)));
    resize();
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = before ? (now - before) / 1000 : 1 / 60;
    before = now;
    if (!flags.ready || flags.frozen) return;
    tick(Math.min(dt, 0.05));
    tune(dt);
  }

  resize();
  flags.ready = true;
  hooks.onIndex?.(0);
  hooks.onReady?.();
  raf = requestAnimationFrame(loop);

  return {
    next: () => step(1),
    prev: () => step(-1),
    goTo,
    toggle,
    setSpin: (on) => (flags.spin = on),
    setPaused: (on) => (flags.paused = on),
    // for looking at one moment at a time while tuning
    debug: {
      st,
      flags,
      renderer,
      rodMat,
      sheetMat,
      cases,
      targets: { whole, patch, seeds },
      ratio(r) {
        renderer.setPixelRatio(r);
        resize();
      },
      // draw the current case in a given pose and stop the clock
      pose(p) {
        flags.frozen = true;
        cases.forEach(hide);
        place(cases[st.cur], { ...blank(), ...p }, 0);
        for (let j = 3; j < CASTERS; j++) cast.uShow.value[j] = 0;
        draw();
      },
      // run the clock to t seconds from a fresh start on disc i, then stop
      at(i, t, stepSize = 1 / 60) {
        flags.frozen = true;
        Object.assign(st, { t: 0, cur: i, swap: null, queued: null, idle: 0, phase: 'rest', phaseAt: 0, spin: 0, auto: false });
        lean.x = lean.y = drag.x = drag.y = drag.vx = drag.vy = 0;
        for (let x = 0; x < t; x += stepSize) tick(Math.min(stepSize, t - x));
        if (t <= 0) tick(0);
      },
      tick,
      resume() {
        flags.frozen = false;
      },
    },
    dispose() {
      cancelAnimationFrame(raf);
      watcher.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      for (const o of owned) o.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
