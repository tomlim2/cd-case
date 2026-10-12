import { makeDiscs } from './art/index.js';
import { createStage } from './stage.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const rail = $('rail');
const buttons = { spin: $('spin'), open: $('open'), pause: $('pause') };

const discs = makeDiscs();
const ui = { index: 0, open: false, spin: true, paused: false };
let stage = null;

// one thumbnail per disc, with a timer under it for when the stage is playing itself
const thumbs = discs.map((disc, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'thumb';
  b.setAttribute('aria-label', disc.name);
  b.style.setProperty('--tilt', `${disc.tilt}deg`);
  const timer = document.createElement('span');
  timer.className = 'timer';
  b.append(disc.thumb, timer);
  b.addEventListener('click', () => stage?.goTo(i));
  rail.append(b);
  return b;
});

const say = () => ($('live').textContent = `${discs[ui.index].name}${ui.open ? ', 케이스 열림' : ''}`);

stage = createStage($('stage'), discs, {
  onReady: () => app.setAttribute('data-ready', ''),
  onFail: () => ($('fail').hidden = false),
  onIndex(i) {
    ui.index = i;
    thumbs.forEach((t, k) => {
      t.toggleAttribute('data-active', k === i);
      t.toggleAttribute('aria-current', k === i);
    });
    // on a narrow screen the rail scrolls: bring the playing disc to the middle
    const t = thumbs[i];
    if (rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: t.offsetLeft - (rail.clientWidth - t.offsetWidth) / 2, behavior: 'smooth' });
    say();
  },
  onOpen(open) {
    ui.open = open;
    buttons.open.setAttribute('aria-pressed', String(open));
    buttons.open.setAttribute('aria-label', open ? '케이스 닫기' : '케이스 열기');
    say();
  },
  onProgress: (p) => rail.style.setProperty('--p', p.toFixed(3)),
});

function setSpin(on) {
  ui.spin = on;
  buttons.spin.setAttribute('aria-pressed', String(on));
  stage?.setSpin(on);
}
function setPaused(on) {
  ui.paused = on;
  buttons.pause.setAttribute('aria-pressed', String(on));
  buttons.pause.setAttribute('aria-label', on ? '자동 재생 켜기' : '자동 재생 멈춤');
  stage?.setPaused(on);
}
buttons.spin.addEventListener('click', () => setSpin(!ui.spin));
buttons.open.addEventListener('click', () => stage?.toggle());
buttons.pause.addEventListener('click', () => setPaused(!ui.paused));

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // a focused button keeps space and enter for itself
  const onButton = e.target instanceof Element && e.target.closest('button');
  const key = e.key.toLowerCase();
  if (key === 'arrowright') stage?.next();
  else if (key === 'arrowleft') stage?.prev();
  else if (key === 'o') stage?.toggle();
  else if (key === 's') setSpin(!ui.spin);
  else if (key === ' ' && !onButton) {
    e.preventDefault();
    setPaused(!ui.paused);
  }
});

if (import.meta.env.DEV && stage) {
  // a handle for poking at the stage from the console
  window.__cd = Object.assign(stage.debug, { stage });

  // peek(x, y, zoom): lay a region of the canvas over the page, one canvas pixel to one screenshot
  // pixel (for an 800x600 capture), to look at detail while tuning. peek() takes it away again.
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
  // showArt(i): lay a disc's painted face over the page, on black. showArt() takes it away.
  window.showArt = (i, zoom = 1, cx = 0.5, cy = 0.5) => {
    let o = $('art');
    if (i === undefined) return o?.remove();
    if (!o) {
      o = document.createElement('canvas');
      o.id = 'art';
      o.width = o.height = 1200;
      o.style.cssText = 'position:fixed;left:50%;top:50%;height:100vh;aspect-ratio:1;translate:-50% -50%;z-index:9;background:#0a0a0e';
      document.body.append(o);
    }
    const g = o.getContext('2d');
    const a = discs[i].art;
    const span = a.width / zoom;
    g.fillStyle = i === 1 ? '#000' : '#0a0a0e';
    g.fillRect(0, 0, 1200, 1200);
    g.drawImage(a, a.width * cx - span / 2, a.height * cy - span / 2, span, span, 0, 0, 1200, 1200);
  };
}
