/* Сценарий страницы: Lenis, цвет фона и света по прокрутке, заставка, появление текста
   со «сборкой» букв, аккордеон услуг, бегущая строка, наклон карточек за курсором */
import { createScene } from './scene.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const doc = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const sections = { hero: $('#top'), studio: $('#studio'), work: $('#work'), contact: $('#contact'), footer: $('#footer') };

// Ключи по прокрутке: [секция, доля её высоты, фон, цвет цепи, [ключевой свет, сила], [заливка], [контровой], сила env-карты]
const KEYS = [
  ['hero', 0, '#e9e9e9', '#141518', ['#ffffff', 1.6], ['#ff4a4a', .35], ['#ffffff', 0], 1.0],
  ['studio', 0, '#dedede', '#141518', ['#ffffff', 1.6], ['#ff3a3a', .9], ['#ffffff', 0], 1.0],
  ['studio', .3, '#222225', '#f0f0f0', ['#ffffff', 1.8], ['#ff2020', 2.4], ['#ffffff', .5], 1.25],
  ['work', 0, '#0e0e11', '#f0f0f0', ['#ffffff', 1.5], ['#ff2020', 2.0], ['#62d8ff', 1.2], 1.3],
  ['work', .25, '#0a0f14', '#a6e6ff', ['#62d8ff', 2.0], ['#ff3030', 1.6], ['#62d8ff', 2.2], 1.35],
  ['work', .85, '#2a0608', '#a6e6ff', ['#62d8ff', 2.0], ['#ff5030', 2.4], ['#62d8ff', 2.0], 1.35],
  ['contact', 0, '#6a110a', '#a6e6ff', ['#62d8ff', 1.9], ['#ff6a3a', 2.6], ['#62d8ff', 1.8], 1.3],
  ['contact', .8, '#a42a10', '#a6e6ff', ['#62d8ff', 1.9], ['#ff7a3a', 2.6], ['#62d8ff', 1.8], 1.3],
  ['footer', 1, '#a42a10', '#a6e6ff', ['#62d8ff', 1.9], ['#ff7a3a', 2.6], ['#62d8ff', 1.8], 1.3],
].map(([sec, f, bg, chain, k, fl, rm, env]) => ({ sec, f, y: 0, bg: hex(bg), chain: hex(chain), key: hex(k[0]), ki: k[1], fill: hex(fl[0]), fi: fl[1], rim: hex(rm[0]), ri: rm[1], env }));
let cyanFrom = Infinity, vh = window.innerHeight;

function layout() {
  vh = window.innerHeight;
  for (const k of KEYS) {
    const r = sections[k.sec].getBoundingClientRect();
    k.y = r.top + window.scrollY + r.height * k.f;
  }
  cyanFrom = KEYS[4].y;
}

function styleAt(y) {
  let i = 0;
  while (i < KEYS.length - 2 && y > KEYS[i + 1].y) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = clamp((y - a.y) / Math.max(1, b.y - a.y));
  return {
    bg: mix(a.bg, b.bg, t), chain: mix(a.chain, b.chain, t), env: a.env + (b.env - a.env) * t,
    key: mix(a.key, b.key, t), ki: a.ki + (b.ki - a.ki) * t,
    fill: mix(a.fill, b.fill, t), fi: a.fi + (b.fi - a.fi) * t,
    rim: mix(a.rim, b.rim, t), ri: a.ri + (b.ri - a.ri) * t,
  };
}

let lastBg = '';
function paint(st, y) {
  const c = `rgb(${Math.round(st.bg[0] * 255)} ${Math.round(st.bg[1] * 255)} ${Math.round(st.bg[2] * 255)})`;
  if (c !== lastBg) {
    lastBg = c;
    document.body.style.backgroundColor = c;
    const lum = .299 * st.bg[0] + .587 * st.bg[1] + .114 * st.bg[2];
    doc.classList.toggle('is-dark', lum < .5);
  }
  doc.classList.toggle('is-cyan', y >= cyanFrom);
}

/* Lenis и 3D */
const lenis = window.Lenis && !reduce ? new Lenis({ lerp: .09, wheelMultiplier: 1, touchMultiplier: 1.4 }) : null;
window.lenis = lenis;
const scrollY = () => lenis ? lenis.scroll : window.scrollY;

let scene = null;
try {
  scene = createScene({
    canvas: $('#gl'), sections, stage: $('.hero__stage'),
    comps: $$('[data-scene]').map(el => ({ el, type: el.dataset.scene, tone: el.dataset.tone })),
    badge: $('.badge-anchor'), isTouch, reduce,
  });
} catch (e) {
  console.warn('WebGL is not available, the page runs without the chain', e);
  doc.classList.add('no-gl');
}
window.__tether = { scene, styleAt, KEYS };

const pointer = { x: 0, y: 0 };
window.addEventListener('pointermove', e => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

let last = performance.now(), running = false;
function loop(t) {
  if (!running) return;
  requestAnimationFrame(loop);
  if (lenis) lenis.raf(t);
  const dt = Math.min(.05, (t - last) / 1000);
  last = t;
  const y = scrollY();
  const st = styleAt(y + vh * .5);
  paint(st, y + vh * .5);
  doc.classList.toggle('is-scrolled', y > 60);
  if (scene) scene.frame({ y, t, dt, style: st, pointer });
}
function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(loop); }
document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else start(); });

/* «Сборка» заголовка: буквы перебирают случайные знаки и встают слева направо */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&/<>*+=';
function prep(el) {
  const walk = node => {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        ch.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const s = document.createElement('span');
          s.className = 'sw'; s.dataset.t = part; s.textContent = part;
          frag.append(s);
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    });
  };
  walk(el);
  return $$('.sw', el);
}
function scramble(el, dur = 900) {
  const words = el._sw || (el._sw = prep(el));
  let n = 0;
  words.forEach(w => n += w.dataset.t.length);
  const t0 = performance.now();
  let fr = 0;
  const tick = now => {
    const p = (now - t0) / dur;
    let idx = 0, pending = false;
    fr++;
    for (const w of words) {
      const src = w.dataset.t;
      let out = '';
      for (let i = 0; i < src.length; i++, idx++) {
        const r = .2 + .8 * idx / n;
        if (p >= r) out += src[i];
        else { pending = true; out += p < r - .4 ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
      }
      if (fr % 2 === 0 || !pending) w.textContent = out;
    }
    if (pending) requestAnimationFrame(tick);
    else words.forEach(w => { w.textContent = w.dataset.t; });
  };
  requestAnimationFrame(tick);
}

/* Появление блоков и заголовков */
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    e.target.classList.add('is-in');
    if (e.target.hasAttribute('data-scramble') && !reduce) scramble(e.target);
  }
}, { threshold: .2, rootMargin: '0px 0px -6% 0px' });
$$('.rv, [data-scramble]').forEach(el => { if (!el.closest('.hero')) io.observe(el); });

/* Активный пункт меню и плавные якоря */
const navLinks = $$('.nav__links a');
const secIO = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) navLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
}, { rootMargin: '-40% 0px -55% 0px' });
['studio', 'work', 'contact'].forEach(id => secIO.observe(sections[id]));
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  if (id.length < 2) { e.preventDefault(); return; }
  const target = $(id);
  if (!target) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(target, { offset: id === '#top' ? 0 : -8, duration: 1.4 });
  else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
}));

/* Аккордеон услуг: открыт один пункт */
const svcBtns = $$('.svc__btn');
svcBtns.forEach(btn => btn.addEventListener('click', () => {
  const open = btn.getAttribute('aria-expanded') === 'true';
  svcBtns.forEach(b => b.setAttribute('aria-expanded', 'false'));
  btn.setAttribute('aria-expanded', String(!open));
}));

/* Бегущая строка стоит, пока не на экране */
const mq = $('.marquee');
if (mq) new IntersectionObserver(([e]) => mq.classList.toggle('is-paused', !e.isIntersecting)).observe(mq);

/* Наклон карточек за курсором */
if (!isTouch && scene) $$('[data-scene]').forEach(el => {
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    scene.hover(el, ((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  el.addEventListener('pointerleave', () => scene.hover(el, 0, 0));
});

/* Пересчёт раскладки: окно, шрифты, высота страницы (аккордеон) */
let rsT = 0, lastW = window.innerWidth, lastH = window.innerHeight;
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  if (isTouch && w === lastW && Math.abs(h - lastH) < 160) return;   // телефон прячет адресную строку
  lastW = w; lastH = h;
  clearTimeout(rsT);
  rsT = setTimeout(() => { layout(); scene && scene.resize(); }, 120);
});
let roT = 0, booted = false;
new ResizeObserver(() => {
  if (!booted) return;
  clearTimeout(roT);
  roT = setTimeout(() => { layout(); scene && scene.measure(); }, 160);
}).observe(document.body);

/* Заставка: счётчик, разлёт клавиш, затем текст и прокрутка */
async function boot() {
  doc.classList.add('is-loading');
  if (lenis) lenis.stop();
  start();
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1800))]);
  layout();
  if (scene) { scene.resize(); scene.startIntro(performance.now()); }
  booted = true;
  const num = $('.loader__num'), t0 = performance.now(), dur = reduce ? 0 : 1400;
  await new Promise(res => {
    const tick = now => {
      const p = dur ? clamp((now - t0) / dur) : 1;
      num.textContent = String(Math.round(p * 100)).padStart(3, '0');
      if (p < 1) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  doc.classList.add('is-ready');
  if (!reduce) scramble($('.hero h1'), 1000);
  setTimeout(() => { doc.classList.remove('is-loading'); if (lenis) lenis.start(); }, reduce ? 0 : 600);
}
boot();
