/* 3D-слой поверх страницы: цепь по сплайну через все секции (один InstancedMesh), шар из клавиш
   со звездой в hero, объёмные карточки работ, привязанные к HTML-рамкам, и бейдж на цепочке в контактах.
   Камера смотрит на страницу как на лист: 1 единица сцены = PX пикселей, y = -пиксели страницы.
   Кадр рисуется только когда что-то движется (заставка, hero на экране, прокрутка, наведение). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FOV = 32;
// Звено: овал с прямыми сторонами. Rw — полуширина осевой линии, Lh — её полудлина, r — радиус прутка.
// Шаг между центрами чуть меньше 2·Lh − 2·r, чтобы концы соседних звеньев упирались друг в друга, как в натянутой цепи
const LINK = { Rw: .27, Lh: .7, r: .1, pitch: 1.14 };
const MAX_LINKS = 520;
const PULL = .85;                                        // на сколько единиц цепь проезжает по пути на единицу прокрутки
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const CAP_COLORS = ['#d7262d', '#d7262d', '#d7262d', '#171717', '#d7262d', '#f4f4f4', '#d7262d', '#171717', '#d7262d', '#171717', '#f4f4f4', '#d7262d'];
const TONES = { red: '#c62424', dark: '#141417', white: '#ebebeb', navy: '#111a26' };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeBack = t => { t = clamp(t, 0, 1); return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2); };
const rand = (a, b) => a + Math.random() * (b - a);

// Звезда: 6 осевых и 8 диагональных пирамидок вокруг ядра, грани плоские
function starGeometry() {
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(d => [new THREE.Vector3(...d), 1]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) dirs.push([new THREE.Vector3(sx, sy, sz).normalize(), .72]);
  const parts = [], q = new THREE.Quaternion();
  for (const [d, len] of dirs) {
    const g = new THREE.ConeGeometry(.1 + .05 * len, len, 4, 1).toNonIndexed();
    g.translate(0, len / 2, 0);
    q.setFromUnitVectors(Y_AXIS, d);
    g.applyQuaternion(q);
    parts.push(g);
  }
  parts.push(new THREE.IcosahedronGeometry(.27, 1).toNonIndexed());
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  parts.forEach(g => g.dispose());
  return merged;
}

// Геометрия звена: труба по стадиону (две прямые и два полукруга). В цвет вершин запечено затемнение
// там, где звено касается соседей: внутренняя сторона дуги на концах и «седло» снаружи кончика
function linkGeometry() {
  const { Rw, Lh, r } = LINK, s = Lh - Rw, total = 4 * s + 2 * Math.PI * Rw;
  const curve = new THREE.Curve();
  curve.getPoint = (t, v = new THREE.Vector3()) => {
    let d = t * total;
    if (d < 2 * s) return v.set(Rw, -s + d, 0);
    d -= 2 * s;
    if (d < Math.PI * Rw) { const a = d / Rw; return v.set(Rw * Math.cos(a), s + Rw * Math.sin(a), 0); }
    d -= Math.PI * Rw;
    if (d < 2 * s) return v.set(-Rw, s - d, 0);
    d -= 2 * s;
    const a = d / Rw;
    return v.set(-Rw * Math.cos(a), -s - Rw * Math.sin(a), 0);
  };
  const g = new THREE.TubeGeometry(curve, 64, r, 12, true);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ay = Math.abs(y);
    let ao = 1;
    if (ay > s * .6) {
      const ey = Math.sign(y) * s, dx = x, dy = y - ey, L = Math.hypot(dx, dy) || 1;
      const ox = dx / L, oy = dy / L;                       // наружу от центра дуги
      const cx = ox * Rw, cy = ey + oy * Rw;                 // ближайшая точка осевой линии
      const nx = (x - cx) / r, ny = (y - cy) / r, nz = z / r;
      const facing = nx * ox + ny * oy;                     // >0 наружу, <0 внутрь дуги
      const end = smooth((ay - s * .6) / Rw);
      ao -= .5 * end * Math.pow(Math.max(0, -facing), 1.3);
      ao -= .38 * smooth((ay - s) / (Rw * .9)) * Math.pow(Math.max(0, facing), 1.5) * Math.max(0, 1 - Math.abs(nz) * 1.2);
    } else {
      const sx = Math.sign(x) || 1, nx = (x - sx * Rw) / r;
      ao -= .1 * Math.max(0, -nx * sx);
    }
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Мягкие пятна шероховатости и микрорельефа, чтобы хром не был идеально стерильным
function noiseTexture() {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#d2d2d2'; x.fillRect(0, 0, n, n);
  for (let i = 0; i < 260; i++) {
    const r = rand(4, 22), v = Math.round(rand(150, 255)), gr = x.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.save(); x.translate(rand(0, n), rand(0, n)); x.fillStyle = gr; x.fillRect(-r, -r, r * 2, r * 2); x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

function whiteColors(g) {
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

export function createScene({ canvas, sections, stage, comps: compSpecs, badge: badgeEl, isTouch, reduce }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 200);
  scene.add(camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  pmrem.dispose();

  // Свет прикреплён к камере, чтобы блики не зависели от прокрутки; цель — центр страницы перед камерой.
  // Ключевой свет отбрасывает тени: звенья затеняют друг друга, предметы — карточки, а цепь — страницу.
  const target = new THREE.Object3D();
  camera.add(target);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(9, 12, 8); key.target = target; camera.add(key);
  key.castShadow = true;
  key.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  key.shadow.bias = -.0004; key.shadow.normalBias = .03;
  const fill = new THREE.DirectionalLight(0xff4040, 0);
  fill.position.set(-12, -8, 8); fill.target = target; camera.add(fill);
  const rim = new THREE.DirectionalLight(0x62d8ff, 0);
  rim.position.set(10, 6, -30); rim.target = target; camera.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, .35));
  // Невидимая плоскость на глубине страницы: принимает только тень
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: .18, transparent: true, depthWrite: false }));
  shadowPlane.receiveShadow = true; shadowPlane.renderOrder = -1;
  camera.add(shadowPlane);

  const grain = noiseTexture();
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 1, roughness: .3, roughnessMap: grain, bumpMap: grain, bumpScale: .003, envMapIntensity: 1.1, vertexColors: true });
  const starMat = new THREE.MeshStandardMaterial({ color: 0xd6d6d6, metalness: 1, roughness: .13, envMapIntensity: 1.2 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4, metalness: .1 });
  const toneMat = {};
  for (const k in TONES) toneMat[k] = new THREE.MeshStandardMaterial({ color: TONES[k], roughness: .62, metalness: 0 });
  const capMats = {};
  const capMatFor = c => capMats[c] || (capMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: .4, metalness: .1 }));

  const linkGeo = linkGeometry();
  const capGeo = new RoundedBoxGeometry(.44, .44, .3, 3, .07);
  const starGeo = starGeometry();

  let vw = 1, vh = 1, PX = 70;
  const rects = {};
  const toX = px => (px - vw / 2) / PX;
  const toY = py => -py / PX;
  const rectOf = el => { const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }; };

  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _v = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _rm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _s = new THREE.Vector3();

  /* ---------- Цепь ---------- */
  const chain = new THREE.InstancedMesh(linkGeo, chromeMat, MAX_LINKS);
  chain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chain.frustumCulled = false;
  chain.castShadow = chain.receiveShadow = true;
  chain.count = 0;
  scene.add(chain);
  let curveLen = 1, nLinks = 0, SEG = 1, tab = null, chainDirty = true;

  // Опорные точки пути в пикселях страницы: [x, y, z]. z > 0 — ближе к зрителю.
  function waypoints() {
    const H = rects.hero, S = rects.studio, W = rects.work, K = rects.contact, F = rects.footer;
    const cx = HS.cx, cy = HS.cy, r = (HS.R + .3) * PX;
    const bx = badgeU.rect ? badgeU.rect.x + badgeU.rect.w / 2 : vw * .75, hy = hookY();
    const ring = [
      [cx - 1.12 * r, cy + .6 * r, 1.3],
      [cx - 1.16 * r, cy - .42 * r, -.4],
      [cx - .05 * r, cy - 1.24 * r, -1.6],
      [cx + 1.16 * r, cy - .3 * r, -.4],
      [cx + .95 * r, cy + .95 * r, 1.4],
    ];
    // На телефоне шар стоит над текстом: цепь обходит его и уходит вправо, а по слову проходит отдельно
    const heroPath = vw < 760 ? [
      [-.2 * vw, cy + .3 * r, .8],
      ...ring,
      [1.3 * vw, cy + 1.25 * r, .6],
      [1.35 * vw, H.y + .72 * H.h, 0],
      [.7 * vw, H.y + .93 * H.h, 1.2],
      [.1 * vw, H.y + .99 * H.h, 1],
      [-.25 * vw, S.y + .04 * S.h, .3],
    ] : [
      [-.12 * vw, H.y + 1.14 * H.h, .6],
      [.2 * vw, H.y + .97 * H.h, 1.4],
      ...ring,
      [.5 * vw, H.y + .9 * H.h, 1.7],
      [.76 * vw, H.y + .84 * H.h, 1.2],
      [1.18 * vw, H.y + .98 * H.h, .4],
    ];
    return [
      ...heroPath,
      [1.24 * vw, S.y + .08 * S.h, 0],
      [.82 * vw, S.y + .17 * S.h, .7],
      [.42 * vw, S.y + .22 * S.h, .4],
      [-.18 * vw, S.y + .3 * S.h, .3],
      [-.24 * vw, S.y + .4 * S.h, 0],
      [.18 * vw, S.y + .64 * S.h, .9],
      [.62 * vw, S.y + .67 * S.h, .5],
      [1.2 * vw, S.y + .72 * S.h, .2],
      [1.26 * vw, S.y + .8 * S.h, 0],
      [.7 * vw, S.y + .88 * S.h, .6],
      [.2 * vw, S.y + .95 * S.h, .9],
      [-.18 * vw, W.y + .03 * W.h, .3],
      [-.24 * vw, W.y + .1 * W.h, 0],
      [.3 * vw, W.y + .17 * W.h, .8],
      [.8 * vw, W.y + .25 * W.h, -.5],
      [1.2 * vw, W.y + .33 * W.h, .2],
      [1.25 * vw, W.y + .42 * W.h, 0],
      [.6 * vw, W.y + .5 * W.h, .9],
      [.1 * vw, W.y + .58 * W.h, .4],
      [-.2 * vw, W.y + .66 * W.h, 0],
      [-.22 * vw, W.y + .74 * W.h, .2],
      [.4 * vw, W.y + .82 * W.h, -.4],
      [.9 * vw, W.y + .9 * W.h, .8],
      [1.22 * vw, W.y + .99 * W.h, .2],
      [1.26 * vw, hy - .06 * vh, 0],
      [bx, hy, .5],
      [.4 * vw, hy + .04 * vh, .9],
      [0, hy - .03 * vh, .4],
      [-.2 * vw, hy + .12 * vh, 0],
      [-.3 * vw, K.y + .6 * K.h, 0],
      [-.4 * vw, F.y + F.h, 0],
    ];
  }

  // Большая цепь проходит под шапкой контактов; к ней подвешен бейдж
  const hookY = () => rects.contact.y + 64 + .03 * vh;

  function buildChain() {
    const pts = waypoints().map(([x, y, z]) => new THREE.Vector3(toX(x), toY(y), z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    curve.arcLengthDivisions = 2400;
    curveLen = curve.getLength();
    nLinks = Math.min(MAX_LINKS, Math.floor(curveLen / LINK.pitch));
    nLinks -= nLinks & 1;                 // чётное число: чередование поворотов сходится на стыке пути
    chain.count = nLinks;
    SEG = clamp(Math.ceil(curveLen * 5), 200, 3200);
    const fr = curve.computeFrenetFrames(SEG, false);   // кадры идут по длине дуги, как и getPointAt
    const n = SEG + 1;
    tab = { p: new Float32Array(n * 3), n: new Float32Array(n * 3), t: new Float32Array(n * 3) };
    for (let k = 0; k < n; k++) {
      curve.getPointAt(k / SEG, _v);
      const o = k * 3;
      tab.p[o] = _v.x; tab.p[o + 1] = _v.y; tab.p[o + 2] = _v.z;
      const nn = fr.normals[k], tt = fr.tangents[k];
      tab.n[o] = nn.x; tab.n[o + 1] = nn.y; tab.n[o + 2] = nn.z;
      tab.t[o] = tt.x; tab.t[o + 1] = tt.y; tab.t[o + 2] = tt.z;
    }
    chainDirty = true;
  }

  function sample(t) {
    const k = t * SEG, k0 = Math.min(SEG - 1, Math.floor(k)), f = k - k0, a = k0 * 3, c = a + 3;
    const P = tab.p, N = tab.n, T = tab.t;
    _p.set(P[a] + (P[c] - P[a]) * f, P[a + 1] + (P[c + 1] - P[a + 1]) * f, P[a + 2] + (P[c + 2] - P[a + 2]) * f);
    _t.set(T[a] + (T[c] - T[a]) * f, T[a + 1] + (T[c + 1] - T[a + 1]) * f, T[a + 2] + (T[c + 2] - T[a + 2]) * f).normalize();
    _n.set(N[a] + (N[c] - N[a]) * f, N[a + 1] + (N[c + 1] - N[a + 1]) * f, N[a + 2] + (N[c + 2] - N[a + 2]) * f);
    _n.addScaledVector(_t, -_n.dot(_t)).normalize();
    _b.crossVectors(_n, _t);
  }

  // Звено i стоит на доле пути t = (i / N + offset) mod 1, вытянуто вдоль касательной, каждое второе повёрнуто на 90°
  function updateChain(offset, reveal) {
    if (!tab) return;
    for (let i = 0; i < nLinks; i++) {
      let t = (i / nLinks + offset) % 1;
      if (t < 0) t += 1;
      const s = reveal >= 1 ? 1 : smooth((reveal - t) / .035 + 1);
      if (s <= .001) { _m.makeScale(0, 0, 0); chain.setMatrixAt(i, _m); continue; }
      sample(t);
      _rm.makeBasis(_n, _t, _b);
      _q.setFromRotationMatrix(_rm);
      _qt.setFromAxisAngle(Y_AXIS, (i & 1) * Math.PI / 2 + (((i * 7919) % 13) / 13 - .5) * .1);
      _q.multiply(_qt);
      _s.setScalar(s);
      _m.compose(_p, _q, _s);
      chain.setMatrixAt(i, _m);
    }
    chain.instanceMatrix.needsUpdate = true;
  }

  // Короткие цепочки в карточках и на бейдже: по кривой или по вертикали
  function addLinksCurve(group, curve, scale) {
    const pitch = LINK.pitch * scale, n = Math.max(2, Math.floor(curve.getLength() / pitch));
    const mesh = new THREE.InstancedMesh(linkGeo, chromeMat, n + 1);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    for (let j = 0; j <= n; j++) {
      curve.getPointAt(j / n, _p);
      curve.getTangentAt(j / n, _t);
      _q.setFromUnitVectors(Y_AXIS, _t);
      _qt.setFromAxisAngle(Y_AXIS, (j & 1) * Math.PI / 2);
      _q.multiply(_qt);
      _s.setScalar(scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(j, _m);
    }
    group.add(mesh);
    return mesh;
  }
  function addLinksDown(group, x, yTop, z, length, scale) {
    const pitch = LINK.pitch * scale, n = Math.max(1, Math.round(length / pitch));
    const mesh = new THREE.InstancedMesh(linkGeo, chromeMat, n);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    for (let j = 0; j < n; j++) {
      _p.set(x, yTop - j * pitch, z);
      _q.setFromAxisAngle(Y_AXIS, (j & 1) * Math.PI / 2);
      _s.setScalar(scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(j, _m);
    }
    group.add(mesh);
    return n * pitch;
  }

  /* ---------- Hero: шар из клавиш и звезда ---------- */
  const HS = { R: 2.5, cx: 0, cy: 0 };
  const hero = new THREE.Group();
  hero.visible = false;
  scene.add(hero);
  const NCAP = isTouch ? 96 : 160;
  const caps = new THREE.InstancedMesh(capGeo, capMat, NCAP);
  caps.frustumCulled = false;
  caps.castShadow = caps.receiveShadow = true;
  hero.add(caps);
  const star = new THREE.Mesh(starGeo, starMat);
  star.castShadow = star.receiveShadow = true;
  hero.add(star);
  const capData = [];
  {
    const col = new THREE.Color(), qr = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < NCAP; i++) {
      // Шар: спираль Фибоначчи, клавиша смотрит наружу
      const y = 1 - 2 * (i + .5) / NCAP, rr = Math.sqrt(1 - y * y), phi = i * 2.39996;
      const sp = new THREE.Vector3(rr * Math.cos(phi), y, rr * Math.sin(phi));
      const sq = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, sp);
      qr.setFromAxisAngle(sp, rand(0, Math.PI)); sq.premultiply(qr);
      // Кольцо: тор радиуса 1 с трубкой 0.24, клавиша смотрит от оси трубки
      const a = i / NCAP * Math.PI * 2, b = i * 2.39996, rho = .24;
      const rp = new THREE.Vector3((1 + rho * Math.cos(b)) * Math.cos(a), (1 + rho * Math.cos(b)) * Math.sin(a), rho * Math.sin(b));
      const out = new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b));
      const rq = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, out);
      qr.setFromAxisAngle(out, a); rq.premultiply(qr);
      // Старт заставки: разлетевшиеся далеко клавиши
      const start = new THREE.Vector3().randomDirection().multiplyScalar(rand(3.4, 6.5));
      const startQ = new THREE.Quaternion().setFromEuler(e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
      capData.push({ sp, sq, rp, rq, start, startQ, delay: Math.random() * .55 });
      col.set(CAP_COLORS[(i * 7 + (i >> 3)) % CAP_COLORS.length]);
      caps.setColorAt(i, col);
    }
    caps.instanceColor.needsUpdate = true;
  }
  let form = 0;   // 0 — шар, 1 — кольцо

  function updateHero(T, intro, px, py) {
    const t = T * .001, R = HS.R, cs = R * .235 / .44, e = easeInOut(form);
    hero.rotation.set(.22 * form + Math.sin(t * .21) * .12 + py * .2, Math.sin(t * .3) * .26 + px * .3, t * .07 * form + t * .04 * (1 - form));
    for (let i = 0; i < NCAP; i++) {
      const d = capData[i];
      _p.lerpVectors(d.sp, d.rp, e).multiplyScalar(R);
      _q.slerpQuaternions(d.sq, d.rq, e);
      let s = cs;
      if (intro < 1) {
        const k = easeOut((intro - d.delay) / .45);
        _v.copy(d.start).multiplyScalar(R);
        _p.lerpVectors(_v, _p, k);
        _q2.copy(_q);
        _q.slerpQuaternions(d.startQ, _q2, k);
        s = cs * (.15 + .85 * k);
      }
      _s.setScalar(s);
      _m.compose(_p, _q, _s);
      caps.setMatrixAt(i, _m);
    }
    caps.instanceMatrix.needsUpdate = true;
    const ss = intro < 1 ? easeBack((intro - .3) / .55) : 1;
    star.scale.setScalar(Math.max(.001, R * .8 * ss));
    star.rotation.set(t * .5, t * .33, 0);
  }

  /* ---------- Карточки, привязанные к HTML-рамкам ---------- */
  const comps = compSpecs.map(spec => {
    const g = new THREE.Group();
    g.visible = false;
    g.userData = { ...spec, rect: null, tx: 0, ty: 0, cx: 0, cy: 0, geos: [] };
    scene.add(g);
    return g;
  });
  const compByEl = new Map(comps.map(g => [g.userData.el, g]));

  function layoutComp(g) {
    const u = g.userData, r = u.rect = rectOf(u.el);
    const w = r.w / PX, h = r.h / PX, m = Math.min(w, h);
    g.position.set(toX(r.x + r.w / 2), toY(r.y + r.h / 2), 0);
    u.geos.forEach(x => x.dispose()); u.geos = [];
    while (g.children.length) g.remove(g.children[0]);
    const slabGeo = new RoundedBoxGeometry(w, h, .16, 2, .05);
    u.geos.push(slabGeo);
    const slab = new THREE.Mesh(slabGeo, toneMat[u.tone] || toneMat.dark);
    slab.position.z = -.08;
    g.add(slab);
    const inner = new THREE.Group();
    g.add(inner);
    const CAPS = ['#d7262d', '#171717', '#f4f4f4'];
    switch (u.type) {
      case 'star': {
        const s = new THREE.Mesh(starGeo, starMat);
        s.scale.setScalar(m * .3); s.position.z = m * .3; s.rotation.set(.55, .35, .25);
        inner.add(s);
        break;
      }
      case 'pendant': {
        const len = addLinksDown(inner, 0, h / 2 + .2, .5, h * .5, .5);
        const s = new THREE.Mesh(starGeo, starMat);
        s.scale.setScalar(m * .15); s.position.set(0, h / 2 + .2 - len - m * .06, .5); s.rotation.set(.3, .4, 0);
        inner.add(s);
        break;
      }
      case 'keys': {
        const sc = m * .36 / .44;
        [[-.26, .1, .5, .4, .3, .5], [.02, -.14, .8, -.3, .6, -.2], [.28, .16, .6, .5, -.4, .9]].forEach(([x, y, z, rx, ry, rz], i) => {
          const mesh = new THREE.Mesh(capGeo, capMatFor(CAPS[i]));
          mesh.position.set(x * w, y * h, z); mesh.rotation.set(rx, ry, rz); mesh.scale.setScalar(sc);
          inner.add(mesh);
        });
        break;
      }
      case 'chain': {
        const pts = [];
        for (let k = 0; k <= 40; k++) {
          const f = k / 40;
          pts.push(new THREE.Vector3(-w / 2 - .5 + f * (w + 1), h * .24 - h * .36 * (1 - Math.pow(2 * f - 1, 2)), .55));
        }
        addLinksCurve(inner, new THREE.CatmullRomCurve3(pts), .55);
        break;
      }
      case 'cluster': {
        const sc = m * .19 / .44, gap = m * .22, tilt = new THREE.Group();
        tilt.rotation.set(.35, -.4, .15); tilt.position.z = .6;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          const mesh = new THREE.Mesh(capGeo, capMatFor(CAPS[(a * 3 + b) % 4 === 3 ? 0 : (a * 3 + b) % 3]));
          mesh.position.set((a - 1) * gap, (b - 1) * gap, 0); mesh.scale.setScalar(sc);
          tilt.add(mesh);
        }
        inner.add(tilt);
        break;
      }
      case 'ring': {
        const n = 16, rr = m * .3, sc = m * .11 / .44, ring = new THREE.Group();
        ring.rotation.set(.5, 0, 0); ring.position.z = .4;
        for (let j = 0; j < n; j++) {
          const a = j / n * Math.PI * 2, mesh = new THREE.Mesh(capGeo, capMatFor(CAPS[j % 3]));
          mesh.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0); mesh.rotation.set(0, 0, a); mesh.scale.setScalar(sc);
          ring.add(mesh);
        }
        const s = new THREE.Mesh(starGeo, starMat);
        s.scale.setScalar(m * .12); s.rotation.set(.4, .5, 0);
        ring.add(s);
        inner.add(ring);
        break;
      }
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  }

  let hoverAnim = false;
  function updateComps(y) {
    hoverAnim = false;
    for (const g of comps) {
      const u = g.userData;
      if (!u.rect) continue;
      const vis = u.rect.y < y + vh * 1.3 && u.rect.y + u.rect.h > y - vh * .3;
      g.visible = vis;
      if (!vis) continue;
      const dx = u.tx - u.cx, dy = u.ty - u.cy;
      if (Math.abs(dx) > .002 || Math.abs(dy) > .002) { u.cx += dx * .12; u.cy += dy * .12; hoverAnim = true; }
      g.rotation.set(-u.cy * .16, u.cx * .16, 0);
    }
  }

  /* ---------- Бейдж на цепочке ---------- */
  const badge = new THREE.Group();
  badge.visible = false;
  scene.add(badge);
  const badgeU = { rect: null, ang: 0, vel: 0, geos: [], tex: null };

  function badgeTexture(aspect) {
    const W = 512, H = Math.round(W / aspect), c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#c8281c'; x.fillRect(0, 0, W, H);
    x.save(); x.translate(W / 2, H * .38); x.fillStyle = '#111214'; x.beginPath();
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, rad = i % 2 ? W * .13 : W * .33; x.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    x.closePath(); x.fill(); x.restore();
    x.textAlign = 'center'; x.fillStyle = '#f4f4f4';
    x.font = `700 ${W * .19}px Montserrat, sans-serif`; x.fillText('tether', W / 2, H * .8);
    x.font = `500 ${W * .045}px "JetBrains Mono", monospace`; x.fillStyle = 'rgba(255,255,255,.78)';
    if ('letterSpacing' in x) x.letterSpacing = '6px';
    x.fillText('WEB STUDIO', W / 2, H * .88);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; x.strokeRect(W * .05, H * .04, W * .9, H * .92);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  function layoutBadge() {
    if (!badgeEl || !rects.contact) return;
    const r = badgeU.rect = rectOf(badgeEl), w = r.w / PX, h = r.h / PX;
    const hy = hookY();
    const lanyard = Math.max(.5, (r.y - hy) / PX);
    badge.position.set(toX(r.x + r.w / 2), toY(hy), 0);
    badgeU.geos.forEach(g => g.dispose()); badgeU.geos = [];
    while (badge.children.length) badge.remove(badge.children[0]);
    const body = new THREE.Group();
    body.position.y = -(lanyard + h / 2);
    badge.add(body);
    const bodyGeo = new RoundedBoxGeometry(w, h, .22, 3, .14);
    body.add(new THREE.Mesh(bodyGeo, toneMat.dark));
    const sw = w * .84, sh = h * .8, sGeo = new THREE.PlaneGeometry(sw, sh);
    if (!badgeU.tex) badgeU.tex = badgeTexture(sw / sh);
    const screen = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ map: badgeU.tex, roughness: .55, metalness: 0 }));
    screen.position.set(0, -h * .015, .115);
    body.add(screen);
    const btnGeo = new RoundedBoxGeometry(.07, h * .08, .12, 1, .02);
    const b1 = new THREE.Mesh(btnGeo, toneMat.red); b1.position.set(-w / 2 - .02, h * .22, 0); body.add(b1);
    const b2 = b1.clone(); b2.position.y = h * .08; body.add(b2);
    const loopGeo = whiteColors(new THREE.TorusGeometry(.16, .045, 8, 20));
    const loop = new THREE.Mesh(loopGeo, chromeMat); loop.position.set(0, h / 2 + .1, 0); body.add(loop);
    badgeU.geos.push(bodyGeo, sGeo, btnGeo, loopGeo);
    addLinksDown(badge, 0, .1, .1, lanyard, .45);
    badge.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  }

  let badgeAnim = false;
  function updateBadge(y, dy, dt) {
    const r = badgeU.rect;
    if (!r) return;
    const vis = r.y - vh < y + vh && r.y + r.h > y - vh * .2;
    badge.visible = vis;
    if (!vis) { badgeU.ang = badgeU.vel = 0; badgeAnim = false; return; }
    const u = badgeU;
    u.vel += (-u.ang * 9 - u.vel * 1.5) * dt + clamp(dy, -80, 80) * .0008;
    u.ang = clamp(u.ang + u.vel * dt, -.45, .45);
    badge.rotation.z = u.ang;
    badgeAnim = Math.abs(u.vel) > 1e-3 || Math.abs(u.ang) > 1e-3;
  }

  /* ---------- Раскладка, стиль, кадр ---------- */
  function measure() {
    for (const k in sections) if (sections[k]) rects[k] = rectOf(sections[k]);
    const s = rectOf(stage);
    HS.cx = s.x + s.w / 2; HS.cy = s.y + s.h / 2; HS.R = Math.max(.8, s.w / 2 / PX - .3);
    hero.position.set(toX(HS.cx), toY(HS.cy), 0);
    comps.forEach(layoutComp);
    layoutBadge();
    buildChain();
    dirty = true;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    vw = w; vh = h; PX = clamp(vw / 18, 44, 72);
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    const D = (vh / PX / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.position.z = D; camera.far = D + 80;
    camera.updateProjectionMatrix();
    target.position.set(0, 0, -D);
    shadowPlane.position.set(0, 0, -D - .2);
    shadowPlane.scale.set(vw / PX * 1.3, vh / PX * 1.3, 1);
    const S = Math.hypot(vw, vh) / PX / 2 * 1.1 + 2, sc = key.shadow.camera;
    sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 2; sc.far = 90;
    sc.updateProjectionMatrix();
    measure();
  }

  function applyStyle(s) {
    chromeMat.color.setRGB(s.chain[0], s.chain[1], s.chain[2], THREE.SRGBColorSpace);
    chromeMat.envMapIntensity = s.env;
    starMat.envMapIntensity = s.env;
    key.color.setRGB(s.key[0], s.key[1], s.key[2], THREE.SRGBColorSpace); key.intensity = s.ki;
    fill.color.setRGB(s.fill[0], s.fill[1], s.fill[2], THREE.SRGBColorSpace); fill.intensity = s.fi;
    rim.color.setRGB(s.rim[0], s.rim[1], s.rim[2], THREE.SRGBColorSpace); rim.intensity = s.ri;
  }

  let dirty = true, lastY = 0, lastReveal = -1, introStart = -1, introDone = false, introT = 0;

  function startIntro(now) {
    introStart = now; introT = 0;
    if (reduce) { introDone = true; form = 1; }
    dirty = true;
  }

  function frame({ y, t, dt, style, pointer }) {
    const H = rects.hero;
    if (!H || !tab) return false;
    const heroVis = y < H.y + H.h + vh * .1;
    const dy = y - lastY, scrolled = Math.abs(dy) > .02;
    let intro = 0, reveal = 0, introActive = false;
    if (introStart >= 0 && introDone) { intro = 1; reveal = 1; }
    else if (introStart >= 0) {
      introActive = true;
      introT += Math.min(dt, .05);
      const T = introT;
      intro = clamp(T / 1.7, 0, 1);
      const rp = clamp((T - 1.1) / 1.7, 0, 1);
      reveal = rp < .75 ? rp / .75 * .17 : .17 + (rp - .75) / .25 * .83;
      form = easeInOut((T - 3.4) / 2.6);
      if (T > 6.2) { introDone = true; form = 1; }
    }
    const heroAnim = heroVis && introStart >= 0 && !reduce;
    if (!(introActive || heroAnim || scrolled || hoverAnim || badgeAnim || dirty)) return false;

    camera.position.y = -(y + vh / 2) / PX;
    applyStyle(style);
    const offset = (y / PX) * PULL / curveLen;
    if (scrolled || dirty || chainDirty || reveal !== lastReveal) { updateChain(offset, reveal); lastReveal = reveal; chainDirty = false; }
    hero.visible = heroVis && introStart >= 0;
    if (hero.visible) updateHero(t, intro, pointer.x, pointer.y);
    updateComps(y);
    updateBadge(y, dy, dt);
    renderer.render(scene, camera);
    lastY = y; dirty = false;
    return true;
  }

  function hover(el, nx, ny) {
    const g = compByEl.get(el);
    if (!g) return;
    g.userData.tx = clamp(nx, -1, 1); g.userData.ty = clamp(ny, -1, 1);
    dirty = true;
  }

  return { resize, measure, frame, startIntro, hover, get links() { return nLinks; }, get pathLength() { return curveLen; } };
}
