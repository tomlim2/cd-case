import { makeAlbum, KINDS } from './album/index.js';
import { today, isDate, fresh } from './album/rng.js';
import { createStage } from './stage.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const field = { title: $('fTitle'), artist: $('fArtist'), tracks: $('fTracks') };

/* ---------------------------------------------------------------- what is on stage, and the URL */

// seed picks the album; anything else non-empty is the visitor's own, laid over it
const state = { seed: today(), title: '', artist: '', tracks: '', kind: '', image: null };
const KEYS = { s: 'seed', t: 'title', a: 'artist', tr: 'tracks', k: 'kind' };

function readUrl() {
  const q = new URLSearchParams(location.hash.slice(1));
  const next = { seed: today(), title: '', artist: '', tracks: '', kind: '' };
  for (const [short, key] of Object.entries(KEYS)) if (q.get(short)) next[key] = q.get(short).slice(0, key === 'tracks' ? 900 : 80);
  if (!KINDS[next.kind]) next.kind = '';
  return next;
}
function writeUrl() {
  const q = new URLSearchParams();
  for (const [short, key] of Object.entries(KEYS)) {
    if (key === 'seed' ? state.seed !== today() : state[key]) q.set(short, state[key]);
  }
  const hash = q.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

let album = null;
let stage = null;

const fmtDate = (seed) => `${seed.slice(0, 4)}.${seed.slice(4, 6)}.${seed.slice(6, 8)}`;
const shiftDay = (seed, by) => {
  const d = new Date(+seed.slice(0, 4), +seed.slice(4, 6) - 1, +seed.slice(6, 8) + by);
  return today(d);
};

// work the album out again and put it on stage: `move` slides a different one in, otherwise the
// one that is there is simply reprinted
function print({ move = false, instant = false } = {}) {
  album = makeAlbum(state, album);
  if (move || instant) stage.show(album, { instant });
  else stage.refresh(album);
  // the corner
  const dated = isDate(state.seed);
  $('stamp').textContent = dated ? (state.seed === today() ? `오늘 · ${fmtDate(state.seed)}` : fmtDate(state.seed)) : `시드 ${state.seed}`;
  $('prev').hidden = $('next').hidden = !dated;
  $('next').disabled = dated && state.seed >= today();
  const cap = $('caption');
  cap.replaceChildren(Object.assign(document.createElement('b'), { textContent: album.title }), ` — ${album.artist}`);
  document.querySelector('.stage-canvas')?.setAttribute('aria-label', `투명 주얼 케이스에 든 음반 「${album.title}」, ${album.artist}. 누르면 열리고, 끌면 돌아갑니다.`);
  $('live').textContent = `${album.title}, ${album.artist}`;
  // the editor: what the seed came up with shows as placeholders
  field.title.placeholder = album.suggested.title;
  field.artist.placeholder = album.suggested.artist;
  field.tracks.placeholder = album.suggested.tracks.map((t) => t.name).join('\n');
  for (const b of $('kinds').children) b.setAttribute('aria-pressed', String(b.dataset.kind === album.kind));
  $('unpick').hidden = !state.image;
  writeUrl();
}

// Another album. While the editor is open that means another design for what has been typed in;
// otherwise it is a clean start, and whatever was laid over the last one goes.
function setSeed(seed) {
  state.seed = String(seed);
  if ($('editor').hidden) clearOwn();
  print({ move: true });
}
function clearOwn() {
  if (state.image) URL.revokeObjectURL(state.image.src);
  Object.assign(state, { title: '', artist: '', tracks: '', kind: '', image: null });
  for (const el of Object.values(field)) el.value = '';
}

/* ---------------------------------------------------------------- the stage */

stage = createStage($('stage'), {
  onOpen(open) {
    $('open').setAttribute('aria-pressed', String(open));
    $('open').setAttribute('aria-label', open ? '케이스 닫기' : '케이스 열기');
    if (open) $('hint').style.opacity = '0';
  },
  onFace(back) {
    $('flip').setAttribute('aria-pressed', String(back));
    $('flip').setAttribute('aria-label', back ? '앞면 보기' : '뒷면 보기');
  },
});

// how much room the page's own furniture takes from the stage
const wide = matchMedia('(min-width: 761px)');
function insets(instant) {
  const editing = !$('editor').hidden;
  const panel = editing ? $('editor').getBoundingClientRect() : null;
  stage.setInsets(
    {
      top: 46,
      bottom: editing && !wide.matches ? innerHeight - panel.top + 8 : 92,
      right: editing && wide.matches && innerWidth > 980 ? innerWidth - panel.left : 0,
      left: 0,
    },
    { instant }
  );
}

if (!stage) {
  $('fail').hidden = false;
} else {
  Object.assign(state, readUrl());
  // disc kinds, as chips
  for (const [kind, spec] of Object.entries(KINDS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.kind = kind;
    b.append(document.createElement('i'), spec.label);
    b.addEventListener('click', () => {
      state.kind = kind;
      print();
    });
    $('kinds').append(b);
  }
  field.title.value = state.title;
  field.artist.value = state.artist;
  field.tracks.value = state.tracks;
  insets(true);
  print({ instant: true });
  app.setAttribute('data-ready', '');
  wire();
}

/* ---------------------------------------------------------------- controls */

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), 2200);
}

function setEditing(on) {
  $('editor').hidden = !on;
  $('edit').setAttribute('aria-expanded', String(on));
  app.toggleAttribute('data-editing', on);
  insets(false);
  if (on && wide.matches) field.title.focus({ preventScroll: true });
}

async function useImage(file) {
  if (!file || !file.type.startsWith('image/')) return toast('이미지 파일이 아니에요');
  const img = new Image();
  img.src = URL.createObjectURL(file);
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(img.src);
    return toast('이 이미지는 열 수 없어요');
  }
  if (state.image) URL.revokeObjectURL(state.image.src);
  state.image = img;
  print();
  toast('커버에 올렸어요');
}

function wire() {
  $('shuffle').addEventListener('click', () => setSeed(fresh()));
  $('prev').addEventListener('click', () => isDate(state.seed) && setSeed(shiftDay(state.seed, -1)));
  $('next').addEventListener('click', () => isDate(state.seed) && state.seed < today() && setSeed(shiftDay(state.seed, 1)));
  $('open').addEventListener('click', () => stage.toggle());
  $('flip').addEventListener('click', () => stage.flip());
  $('edit').addEventListener('click', () => setEditing($('editor').hidden));
  $('closeEditor').addEventListener('click', () => setEditing(false));

  // typing reprints the album, once the keys go quiet
  let pending = 0;
  for (const [key, el] of Object.entries(field)) {
    el.addEventListener('input', () => {
      state[key] = el.value;
      clearTimeout(pending);
      pending = setTimeout(() => print(), 160);
    });
  }
  $('reset').addEventListener('click', () => {
    clearOwn();
    print();
  });

  $('pick').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', (e) => {
    useImage(e.target.files[0]);
    e.target.value = '';
  });
  $('unpick').addEventListener('click', () => {
    if (state.image) URL.revokeObjectURL(state.image.src);
    state.image = null;
    print();
  });

  // a picture dropped anywhere on the window becomes the cover
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    $('drop').hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) $('drop').hidden = true;
  });
  window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    $('drop').hidden = true;
    useImage(e.dataTransfer.files[0]);
  });

  $('link').addEventListener('click', async () => {
    writeUrl();
    try {
      await navigator.clipboard.writeText(location.href);
      toast(state.image ? '링크를 복사했어요 · 올린 이미지는 링크에 담기지 않아요' : '링크를 복사했어요');
    } catch {
      toast('복사하지 못했어요 · 주소창의 주소를 직접 복사해 주세요');
    }
  });
  $('save').addEventListener('click', async () => {
    const blob = await stage.snapshot();
    if (!blob) return toast('저장하지 못했어요');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `disc-${state.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && !$('editor').hidden) return setEditing(false);
    // typing in the editor is typing, not shortcuts
    if (e.target instanceof Element && e.target.closest('input, textarea')) return;
    const key = e.key.toLowerCase();
    if (key === 'o') stage.toggle();
    else if (key === 'f') stage.flip();
    else if (key === 'r') setSeed(fresh());
    else if (key === 'e') setEditing($('editor').hidden);
    else if (key === 'arrowleft') $('prev').click();
    else if (key === 'arrowright') $('next').click();
  });

  // someone pasted a different link into the same tab
  window.addEventListener('hashchange', () => {
    const next = readUrl();
    const moved = next.seed !== state.seed;
    Object.assign(state, next);
    for (const [key, el] of Object.entries(field)) el.value = state[key];
    print({ move: moved });
  });
  window.addEventListener('resize', () => insets(true));
  wide.addEventListener('change', () => insets(true));
}

if (import.meta.env.DEV && stage) {
  // handles for poking at the stage from the console while tuning
  window.__cd = Object.assign(stage.debug, { stage, state, print, album: () => album });
  // peek(x, y, zoom): lay a region of the canvas over the page, one canvas pixel to one screenshot
  // pixel (for an 800x600 capture). peek() takes it away again.
  window.peek = (x, y, zoom = 1) => {
    let o = $('peek');
    if (x === undefined) return o?.remove();
    if (!o) {
      o = document.createElement('canvas');
      o.id = 'peek';
      o.width = 800;
      o.height = 600;
      o.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:9;background:#fff;image-rendering:pixelated';
      document.body.append(o);
    }
    stage.debug.tick(0);
    const g = o.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 800, 600);
    g.drawImage(document.querySelector('.stage-canvas'), x, y, 800 / zoom, 600 / zoom, 0, 0, 800, 600);
  };
  // gallery(n, face, from): the same face of n albums in a row of seeds, to judge the variety
  window.gallery = (n = 12, face = 'cover', from = 0) => {
    $('faces')?.remove();
    if (!n) return;
    const wrap = document.createElement('div');
    wrap.id = 'faces';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9;background:#888;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px;overflow:auto';
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = makeAlbum({ seed: `g${from + i}` });
      const copy = document.createElement('canvas');
      copy.width = copy.height = 384;
      copy.getContext('2d').drawImage(a.faces[face], 0, 0, 384, 384);
      copy.style.cssText = 'width:100%;background:#111';
      wrap.append(copy);
      out.push(`${a.style}/${a.kind}/${a.type}: ${a.title} — ${a.artist}`);
    }
    document.body.append(wrap);
    return out;
  };
  // faces(): lay the album's five printed faces over the page. faces(false) takes them away.
  window.faces = (on = true) => {
    $('faces')?.remove();
    if (!on) return;
    const wrap = document.createElement('div');
    wrap.id = 'faces';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9;background:#888;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;overflow:auto';
    for (const c of Object.values(album.faces)) {
      const copy = document.createElement('canvas');
      copy.width = copy.height = 512;
      copy.getContext('2d').drawImage(c, 0, 0, 512, 512);
      copy.style.cssText = 'width:100%;background:#111';
      wrap.append(copy);
    }
    document.body.append(wrap);
  };
}
