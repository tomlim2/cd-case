// The stage: one WebGL canvas, the case (or, between albums, two of them) and the loop that moves
// and draws them.
//
// A frame is drawn in layers, back to front:
//   1. the page with its shadows, and everything opaque: disc, booklet, card      -> `whole`
//   2. each clear layer (a tray, a lid) over a copy of the picture so far, so that its rods can
//      bend what is behind them                                                    -> `patch`, ping-ponged
//   3. glints picked out of the picture and drawn into stars, then everything goes to the screen
import * as THREE from 'three';
import { QUAD_VERT } from './gl/studio.js';
import { ROD_VERT, ROD_FRAG, SHEET_VERT, SHEET_FRAG } from './gl/plastic.js';
import { DISC_VERT, DISC_FRAG, KIND } from './gl/disc.js';
import { PAPER_VERT, PAPER_FRAG } from './gl/paper.js';
import { PAGE_VERT, PAGE_FRAG, CASES, CASTERS } from './gl/page.js';
import { COPY_FRAG, SEED_FRAG, STREAK_FRAG, FINAL_FRAG } from './gl/post.js';
import { HALF, HINGE, LEVEL, BOOKLET, CARD, buildTray, buildLid, buildDisc, buildBooklet, buildCard } from './case.js';
import { clamp01, lerp, blank, resting, lidPose, leaving, arriving, OPENING, CLOSING, SWAP_TIME } from './motion.js';

const FOV = 28;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const PAGE_Z = -64; // the page hangs this far behind the case, so shadows fall wide and soft
const LIGHT = new THREE.Vector3(-0.34, 0.46, 1).normalize(); // from a point on the page toward the lamp
const SPIN = (16 * Math.PI) / 180; // the disc turns in its tray, radians a second
const IOR = 1.59; // polystyrene
const SOAK = [0.0046, 0.0033, 0.0027]; // what a millimetre of it absorbs: a faint cool grey
const SORT = { tray: -1, lid: 4 }; // a height in each clear layer, to order them by distance
const FACES = ['cover', 'liner', 'inside', 'back', 'disc'];

export function createStage(host, hooks = {}) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  canvas.setAttribute('role', 'img');
  host.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    return null;
  }
  const gl = renderer.getContext();
  if (!renderer.extensions.has('EXT_color_buffer_float') && !renderer.extensions.has('EXT_color_buffer_half_float')) {
    renderer.dispose();
    canvas.remove();
    return null;
  }
  // without a GPU (a headless capture, say) every pixel is expensive: draw fewer of them
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe|software/i.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(software ? 1 : Math.min(window.devicePixelRatio || 1, 2));
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

  /* ---------------------------------------------------------------- the page and what is opaque */
  const pageScene = new THREE.Scene();
  const cast = {
    uCast: { value: Array.from({ length: CASTERS }, () => new THREE.Matrix3()) },
    uShow: { value: new Array(CASTERS).fill(0) },
    uSize: { value: new Array(CASTERS).fill(1) },
    // even casters are trays (with the card), odd ones lids (with the booklet)
    uPaper: { value: Array.from({ length: CASTERS }, (_, i) => (i % 2 ? new THREE.Vector2(BOOKLET.half, BOOKLET.corner) : new THREE.Vector2(CARD.half, CARD.corner))) },
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
        uTaps: { value: coarse || software ? 2 : 4 }, // rays per pixel, in pairs
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
  // drawn into depth only: whatever is opaque has to hide the plastic behind it
  const hideMat = keep(new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));

  const part = (mesh, scene, order = 0) => {
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = order;
    scene.add(mesh);
    return mesh;
  };
  const geo = {
    tray: { cd: buildTray({ clearHub: true }), plain: buildTray({ clearHub: false }) },
    lid: buildLid(),
    disc: { cd: keep(buildDisc({ clearHub: true })), plain: keep(buildDisc({ clearHub: false })) },
    booklet: keep(buildBooklet()),
    card: keep(buildCard()),
  };
  for (const g of [geo.tray.cd, geo.tray.plain, geo.lid]) {
    keep(g.rods);
    keep(g.sheets);
  }
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // A slot is one case on stage. There are two, so that one album can leave while the next arrives.
  const slots = Array.from({ length: CASES }, (_, i) => {
    const paperMat = () => keep(new THREE.ShaderMaterial({ uniforms: { uFront: { value: null }, uBack: { value: null }, uFade: { value: 1 } }, vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG, side: THREE.DoubleSide }));
    const mats = {
      disc: keep(new THREE.ShaderMaterial({ uniforms: { uArt: { value: null }, uKind: { value: 0 }, uInner: { value: 20 }, uOuter: { value: 58 }, uFade: { value: 1 } }, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, side: THREE.DoubleSide })),
      booklet: paperMat(),
      card: paperMat(),
    };
    const s = {
      album: null,
      tex: null,
      mats,
      variant: 'cd',
      seed: 1.7 * i + 0.4, // sets this slot's sway apart from the other's
      tray: {},
      disc: {},
      discHide: {},
      lidRods: part(new THREE.Mesh(geo.lid.rods, rodMat), plasticScene),
      lidSheets: part(new THREE.Mesh(geo.lid.sheets, sheetMat), plasticScene, 1),
      booklet: part(new THREE.Mesh(geo.booklet, mats.booklet), pageScene),
      card: part(new THREE.Mesh(geo.card, mats.card), pageScene),
      bookletHide: part(new THREE.Mesh(geo.booklet, hideMat), plasticScene, -5),
      cardHide: part(new THREE.Mesh(geo.card, hideMat), plasticScene, -5),
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
    for (const v of ['cd', 'plain']) {
      s.tray[v] = { rods: part(new THREE.Mesh(geo.tray[v].rods, rodMat), plasticScene), sheets: part(new THREE.Mesh(geo.tray[v].sheets, sheetMat), plasticScene, 1) };
      s.disc[v] = part(new THREE.Mesh(geo.disc[v], mats.disc), pageScene);
      s.discHide[v] = part(new THREE.Mesh(geo.disc[v], hideMat), plasticScene, -5);
    }
    return s;
  });
  const everyPart = (s) => [s.tray.cd.rods, s.tray.cd.sheets, s.tray.plain.rods, s.tray.plain.sheets, s.lidRods, s.lidSheets, s.disc.cd, s.disc.plain, s.discHide.cd, s.discHide.plain, s.booklet, s.card, s.bookletHide, s.cardHide];

  // print an album into a slot
  function load(s, album) {
    if (!s.tex) {
      s.tex = {};
      for (const f of FACES) {
        const t = keep(new THREE.CanvasTexture(album.faces[f]));
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso;
        s.tex[f] = t;
      }
      s.mats.booklet.uniforms.uFront.value = s.tex.cover;
      s.mats.booklet.uniforms.uBack.value = s.tex.liner;
      s.mats.card.uniforms.uFront.value = s.tex.inside;
      s.mats.card.uniforms.uBack.value = s.tex.back;
      s.mats.disc.uniforms.uArt.value = s.tex.disc;
    }
    for (const f of FACES) {
      // every album's faces are the same size, so the texture is refilled rather than remade
      s.tex[f].image = album.faces[f];
      s.tex[f].needsUpdate = true;
      renderer.initTexture(s.tex[f]); // uploaded now rather than in the middle of a move
    }
    const u = s.mats.disc.uniforms;
    u.uKind.value = KIND[album.kind];
    u.uInner.value = album.spec.inner;
    u.uOuter.value = album.spec.outer;
    s.variant = album.spec.clearHub ? 'cd' : 'plain';
    s.album = album;
  }

  /* ---------------------------------------------------------------- post */
  const frameU = { uWhole: { value: whole.texture }, uPatch: { value: whole.texture }, uRect: { value: rect } };
  const seedPass = pass(SEED_FRAG, { ...frameU, uTexel: { value: new THREE.Vector2() }, uFloor: { value: 1.6 } });
  const streakPass = pass(STREAK_FRAG, { uTex: { value: seeds.texture }, uStep: { value: new THREE.Vector2() }, uDecay: { value: 0.72 } });
  const finalPass = pass(FINAL_FRAG, { ...frameU, uStreakA: { value: streakA.texture }, uStreakB: { value: streakB.texture }, uGlint: { value: 1.5 } });

  /* ---------------------------------------------------------------- state */
  const st = {
    t: 0,
    cur: 0, // the slot on stage
    swap: null, // { from, to, start, dir, lid: { phase, at } }
    queued: null, // an album asked for while two were already moving
    swaps: 0,
    phase: 'rest', // rest | opening | open | closing
    phaseAt: 0,
    closeNext: false,
    spin: 0,
    open: false,
  };
  const flags = { ready: false, frozen: false, noGlint: false, noLid: false, noTray: false };
  const pointer = { x: 0, y: 0, over: false };
  const lean = { x: 0, y: 0 }; // the case leaning toward the pointer
  // Turning it by hand. Yaw is free and comes to rest on whichever face is nearer, front or back;
  // pitch only gives a little and springs back.
  const turn = { yaw: 0, vyaw: 0, pitch: 0, vpitch: 0, target: 0 };
  const drag = { on: false, start: null, last: null, moved: 0, at: 0 };
  const inset = { now: { top: 0, right: 0, bottom: 0, left: 0 }, want: { top: 0, right: 0, bottom: 0, left: 0 } };
  const view = { w: 1, h: 1, openSize: 1, reach: 400 };
  let raf = 0;
  let before = 0;

  const setOpen = (v) => {
    if (st.open !== v) {
      st.open = v;
      hooks.onOpen?.(v);
    }
  };
  const isBack = () => Math.round(turn.target / Math.PI) % 2 !== 0;
  function aim(target) {
    const was = isBack();
    turn.target = target;
    if (isBack() !== was) hooks.onFace?.(isBack());
  }
  const faceFront = () => aim(Math.round(turn.target / (Math.PI * 2)) * Math.PI * 2);
  function open() {
    if (st.phase !== 'rest') return;
    st.phase = 'opening';
    st.phaseAt = st.t;
    faceFront();
    setOpen(true);
  }
  function close() {
    if (st.phase === 'opening') st.closeNext = true; // let it finish opening first
    else if (st.phase === 'open') {
      st.phase = 'closing';
      st.phaseAt = st.t;
      setOpen(false);
    }
  }
  function toggle(want = st.phase === 'rest' || st.phase === 'closing') {
    if (!flags.ready || st.swap) return;
    if (want) open();
    else close();
  }
  function flip() {
    if (flags.ready) aim(turn.target + Math.PI);
  }

  // a different album: the one on stage is pushed aside and this one comes in after it
  function show(album, { instant = false } = {}) {
    const here = slots[st.cur];
    if (instant || !here.album) {
      load(here, album);
      return;
    }
    if (st.swap) {
      st.queued = album;
      return;
    }
    const to = 1 - st.cur;
    load(slots[to], album);
    // the outgoing case keeps doing whatever its lid was doing
    st.swap = { from: st.cur, to, start: st.t, dir: st.swaps % 2 ? -1 : 1, lid: { phase: st.phase, at: st.phaseAt } };
    st.swaps++;
    st.phase = 'rest';
    st.phaseAt = st.t;
    st.closeNext = false;
    faceFront();
    setOpen(false);
  }
  // the same album, printed again (its words or its disc changed): in place, no ceremony
  const refresh = (album) => load(slots[st.swap ? st.swap.to : st.cur], album);

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

  function place(s, pose, index) {
    const size = pose.size * lerp(1, view.openSize, pose.spread);
    euler.set(pose.pitch + lean.x + turn.pitch, pose.yaw + lean.y + turn.yaw, pose.roll);
    quat.setFromEuler(euler);
    // open, the pair is centred: the tray moves right to make room for the lid
    v.set(pose.x + HALF * size * pose.spread * 0.94, pose.y, pose.z);
    s.mCase.compose(v, quat, s3.setScalar(size));
    m1.makeTranslation(HINGE.x, 0, HINGE.z);
    m2.makeRotationY(-pose.lid);
    s.mLid.copy(s.mCase).multiply(m1).multiply(m2).multiply(m1.makeTranslation(-HINGE.x, 0, -HINGE.z));
    s.iCase.copy(s.mCase).invert();
    s.iLid.copy(s.mLid).invert();
    for (const p of everyPart(s)) p.visible = false;
    const k = s.variant;
    const tray = [s.tray[k].rods, s.tray[k].sheets, s.card, s.cardHide];
    const lid = [s.lidRods, s.lidSheets, s.booklet, s.bookletHide];
    const disc = [s.disc[k], s.discHide[k]];
    m2.copy(s.mCase).multiply(m1.makeRotationZ(-st.spin));
    for (const p of tray) p.matrix.copy(s.mCase);
    for (const p of lid) p.matrix.copy(s.mLid);
    for (const p of disc) p.matrix.copy(m2);
    for (const p of [...tray, ...lid, ...disc]) {
      p.matrixWorld.copy(p.matrix);
      p.visible = true;
    }
    for (const m of Object.values(s.mats)) m.uniforms.uFade.value = pose.fade;
    s.fade = pose.fade;
    s.size = size;
    s.zTray = v.set(0, 0, SORT.tray).applyMatrix4(s.mCase).applyMatrix4(camera.matrixWorldInverse).z;
    s.zLid = v.set(0, 0, SORT.lid).applyMatrix4(s.mLid).applyMatrix4(camera.matrixWorldInverse).z;
    s.shown = true;
    // shadows
    castInto(cast.uCast.value[index * 2], s.iCase, LEVEL.tray);
    castInto(cast.uCast.value[index * 2 + 1], s.iLid, LEVEL.lid);
    for (let j = 0; j < 2; j++) {
      cast.uShow.value[index * 2 + j] = pose.fade;
      cast.uSize.value[index * 2 + j] = size;
    }
  }
  function hide(s) {
    for (const p of everyPart(s)) p.visible = false;
    s.shown = false;
  }

  // is the pointer (in clip coordinates) over the case on stage?
  const ro = new THREE.Vector3();
  const rd = new THREE.Vector3();
  function over(x, y) {
    const s = slots[st.cur];
    if (!s.shown) return false;
    for (const [inv, level] of [[s.iCase, 0], [s.iLid, HINGE.z]]) {
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
    st.spin += SPIN * dt;

    // the room the page leaves round the stage can change (a panel opening); follow it smoothly
    let moved = false;
    for (const k of ['top', 'right', 'bottom', 'left']) {
      const d = inset.want[k] - inset.now[k];
      if (d === 0) continue;
      inset.now[k] = Math.abs(d) > 0.5 ? inset.now[k] + d * (1 - Math.exp(-9 * dt)) : inset.want[k];
      moved = true;
    }
    if (moved) frame();

    // the case leans a little toward the pointer
    const hovering = pointer.over && !drag.on;
    const ease = 1 - Math.exp(-4 * dt);
    lean.x += ((hovering ? 0.16 * pointer.y : 0) - lean.x) * ease;
    lean.y += ((hovering ? -0.26 * pointer.x : 0) - lean.y) * ease;
    // let go, it swings to the nearer face and its tilt springs back
    if (!drag.on) {
      turn.vyaw += (-22 * (turn.yaw - turn.target) - 7.5 * turn.vyaw) * dt;
      turn.yaw += turn.vyaw * dt;
      turn.vpitch += (-22 * turn.pitch - 7.5 * turn.vpitch) * dt;
      turn.pitch += turn.vpitch * dt;
    }

    if (st.swap && t - st.swap.start >= SWAP_TIME) {
      st.cur = st.swap.to;
      st.swap = null;
      const q = st.queued;
      st.queued = null;
      if (q) show(q);
    }
    const into = t - st.phaseAt;
    if (st.phase === 'opening' && into >= OPENING.time) {
      st.phase = 'open';
      st.phaseAt = t;
    } else if (st.phase === 'closing' && into >= CLOSING.time) {
      st.phase = 'rest';
      st.phaseAt = t;
    }
    if (st.phase === 'open' && st.closeNext) {
      st.closeNext = false;
      close();
    }

    // who is on stage, and where
    const sw = st.swap;
    const along = sw ? clamp01((t - sw.start) / SWAP_TIME) : 0;
    let index = 0;
    slots.forEach((s, i) => {
      if (sw && i === sw.from) place(s, leaving(lidPose(sw.lid.phase, t - sw.lid.at, t, s.seed, calm), along, sw.dir, view.reach), index++);
      else if (sw && i === sw.to) place(s, arriving(resting(t, s.seed, calm), along, sw.dir, view.reach), index++);
      else if (!sw && i === st.cur && s.album) place(s, lidPose(st.phase, t - st.phaseAt, t, s.seed, calm), index++);
      else hide(s);
    });
    for (; index < CASES; index++) for (let j = 0; j < 2; j++) cast.uShow.value[index * 2 + j] = 0;
    draw();
  }

  // the screen rectangle the cases cover, in pixels, with a margin
  const corner = new THREE.Vector3();
  function cover(w, h) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of slots) {
      if (!s.shown) continue;
      for (const m of [s.mCase, s.mLid]) {
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
  const clear = slots.flatMap((s) => [s.tray.cd.rods, s.tray.cd.sheets, s.tray.plain.rods, s.tray.plain.sheets, s.lidRods, s.lidSheets]);
  function draw() {
    // 1. page, shadows, and everything opaque
    renderer.setRenderTarget(whole);
    renderer.clear();
    renderer.render(pageScene, camera);

    // 2. the clear layers, furthest first
    layers.length = 0;
    for (const s of slots) {
      if (!s.shown) continue;
      if (!flags.noTray) layers.push({ z: s.zTray, rods: s.tray[s.variant].rods, sheets: s.tray[s.variant].sheets, fade: s.fade, size: s.size });
      if (!flags.noLid) layers.push({ z: s.zLid, rods: s.lidRods, sheets: s.lidSheets, fade: s.fade, size: s.size });
    }
    layers.sort((a, b) => a.z - b.z);
    const w = whole.width;
    const h = whole.height;
    const box = layers.length ? cover(w, h) : null;
    let picture = whole;
    if (box) {
      rect.set(box.x / w, box.y / h, box.x1 / w, box.y1 / h);
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
  // Put the camera where the closed case fills the part of the window that is free (the page keeps
  // some of it for its controls), and shift the view so that part's middle is the stage's middle.
  function frame() {
    const { w, h } = view;
    const i = inset.now;
    const freeW = Math.max(160, w - i.left - i.right);
    const freeH = Math.max(160, h - i.top - i.bottom);
    // the closed case takes 62% of the free height, or on a narrow screen 80% of the free width
    const dist = (146 * h) / (2 * TAN * Math.min(0.62 * freeH, 0.8 * freeW));
    camera.aspect = w / h;
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(w, h, (i.right - i.left) / 2, (i.bottom - i.top) / 2, w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const perMm = h / (2 * dist * TAN); // css pixels a millimetre covers
    // open, lid and tray lie side by side: scaled to keep the pair inside the free width
    view.openSize = Math.min(1.04, (0.92 * freeW) / (296 * perMm));
    // how far to one side is off stage
    view.reach = w / perMm / 2 + 110;
  }
  function resize() {
    view.w = host.clientWidth || 1;
    view.h = host.clientHeight || 1;
    renderer.setSize(view.w, view.h, false);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    whole.setSize(buf.x, buf.y);
    for (const p of patch) p.setSize(buf.x, buf.y);
    const hw = Math.max(1, Math.round(buf.x / 2));
    const hh = Math.max(1, Math.round(buf.y / 2));
    for (const s of [seeds, streakA, streakB]) s.setSize(hw, hh);
    frame();
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
    const now = performance.now();
    const dx = (e.clientX - drag.last.x) * 0.009;
    const dy = (e.clientY - drag.last.y) * 0.006;
    const dt = Math.max(1, now - drag.at) / 1000;
    drag.last = { x: e.clientX, y: e.clientY };
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y));
    turn.yaw += dx;
    turn.pitch = Math.min(0.5, Math.max(-0.5, turn.pitch + dy));
    // remember how fast it was going, for the flick
    turn.vyaw = lerp(turn.vyaw, dx / dt, 0.5);
    turn.vpitch = 0;
    drag.at = now;
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
    drag.at = performance.now();
    turn.vyaw = 0;
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
    // a drag that had come to rest just lets go; a flick carries it on, perhaps right over
    if (performance.now() - drag.at > 90) turn.vyaw = 0;
    turn.vyaw = Math.max(-9, Math.min(9, turn.vyaw));
    aim(Math.round((turn.yaw + turn.vyaw * 0.16) / Math.PI) * Math.PI);
    // an open case stays facing you: its lid is in the way of anything else
    if (st.phase !== 'rest') faceFront();
    if (host.hasPointerCapture?.(e.pointerId)) host.releasePointerCapture(e.pointerId);
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
  let tuning = !software;
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
  raf = requestAnimationFrame(loop);

  return {
    show,
    refresh,
    toggle,
    flip,
    // how much of the window the page keeps for itself on each side, in css pixels
    setInsets(next, { instant = false } = {}) {
      Object.assign(inset.want, next);
      if (instant) {
        Object.assign(inset.now, inset.want);
        frame();
      }
    },
    // the picture on stage right now, as a PNG
    snapshot() {
      draw();
      return new Promise((done) => canvas.toBlob(done, 'image/png'));
    },
    // for looking at one moment at a time while tuning
    debug: {
      st,
      flags,
      turn,
      renderer,
      rodMat,
      slots,
      software,
      ratio(r) {
        renderer.setPixelRatio(r);
        resize();
      },
      // draw the case on stage in a given pose and stop the clock
      pose(p) {
        flags.frozen = true;
        slots.forEach(hide);
        place(slots[st.cur], { ...blank(), ...p }, 0);
        for (let j = 2; j < CASTERS; j++) cast.uShow.value[j] = 0;
        draw();
      },
      // run the clock on by t seconds, then stop it
      run(t, stepSize = 1 / 60) {
        flags.frozen = true;
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
