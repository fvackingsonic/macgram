// Небольшой генератор QR-кодов (байтовый режим, коррекция M, версии 1–15) — для входа по QR,
// как на первом экране Telegram для macOS. Алгоритм по стандарту ISO/IEC 18004.

const ECC_M = { // версия: [кодовых слов коррекции на блок, блоков группы 1, данных в блоке 1, блоков группы 2, данных в блоке 2]
  1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51], 12: [22, 6, 36, 2, 37], 13: [22, 8, 37, 1, 38], 14: [24, 4, 40, 5, 41], 15: [24, 5, 41, 5, 42],
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46],
  10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70] };

// Арифметика поля GF(256) для кодов Рида — Соломона.
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
function rsRemainder(data, n) {
  const g = rsGenerator(n);
  const r = new Array(n).fill(0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
  }
  return r;
}

function encodeData(bytes, ver) {
  const [ecLen, b1, d1, b2, d2] = ECC_M[ver];
  const cap = b1 * d1 + b2 * d2;
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, x) => (a << 1) | x, 0));
  for (let p = 0; data.length < cap; p++) data.push(p % 2 ? 0x11 : 0xec);
  // делим на блоки, считаем коррекцию, перемежаем
  const blocks = [], ecs = [];
  let k = 0;
  for (let i = 0; i < b1 + b2; i++) { const len = i < b1 ? d1 : d2; const blk = data.slice(k, k + len); k += len; blocks.push(blk); ecs.push(rsRemainder(blk, ecLen)); }
  const out = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

function capacity(ver) { const [, b1, d1, b2, d2] = ECC_M[ver]; return b1 * d1 + b2 * d2 - (ver < 10 ? 2 : 3); }

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= 15 && capacity(ver) < bytes.length) ver++;
  if (ver > 15) throw new Error('слишком длинный текст для QR');
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null)); // null — свободно
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { m[y][x] = v; fixed[y][x] = true; };
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  for (let i = 0; i < size; i++) { if (!fixed[6][i]) set(i, 6, i % 2 === 0); if (!fixed[i][6]) set(6, i, i % 2 === 0); }
  const al = ALIGN[ver];
  const last = al[al.length - 1];
  for (const ay of al) for (const ax of al) {
    // пропускаем только углы с поисковыми узорами
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === last) || (ax === last && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // резерв под формат и версию
  for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(i, 8, false); if (!fixed[i][8]) set(8, i, false); }
  for (let i = 0; i < 8; i++) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false); }
  set(8, size - 8, true); // тёмный модуль
  if (ver >= 7) for (let i = 0; i < 18; i++) { set(size - 11 + (i % 3), Math.floor(i / 3), false); set(Math.floor(i / 3), size - 11 + (i % 3), false); }

  // данные зигзагом
  const data = encodeData(bytes, ver);
  const bits = []; for (const b of data) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (fixed[y][x]) continue;
      m[y][x] = bi < bits.length ? bits[bi] === 1 : false; bi++;
    }
  }

  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];

  const withFormat = (grid, mask) => {
    const g = grid.map(r => r.slice());
    let d = (0b00 << 3) | mask; // уровень M = 00
    let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fbits = ((d << 10) | rem) ^ 0x5412;
    const bit = i => ((fbits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) g[i][8] = bit(i);
    g[7][8] = bit(6); g[8][8] = bit(7); g[8][7] = bit(8);
    for (let i = 9; i < 15; i++) g[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) g[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) g[size - 15 + i][8] = bit(i);
    g[size - 8][8] = true;
    if (ver >= 7) {
      let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const vb = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const b = ((vb >>> i) & 1) === 1; const a = size - 11 + (i % 3), c = Math.floor(i / 3); g[c][a] = b; g[a][c] = b; }
    }
    return g;
  };
  const penalty = g => {
    let p = 0;
    for (let y = 0; y < size; y++) { let run = 1; for (let x = 1; x < size; x++) { if (g[y][x] === g[y][x - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let x = 0; x < size; x++) { let run = 1; for (let y = 1; y < size; y++) { if (g[y][x] === g[y - 1][x]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = g[y][x]; if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) p += 3; }
    let dark = 0; for (const r of g) for (const c of r) if (c) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = null, bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    const g = m.map((r, y) => r.map((c, x) => (fixed[y][x] ? c : c !== MASKS[k](x, y))));
    const f = withFormat(g, k);
    const p = penalty(f);
    if (p < bestP) { bestP = p; best = f; }
  }
  return best;
}

// SVG-картинка QR-кода: квадратные модули с лёгким скруглением (надёжно читается любой камерой).
export function qrSvg(text, { size = 200, color = '#000', bg = 'transparent', quiet = 3 } = {}) {
  const g = qrMatrix(text);
  const n = g.length, total = n + quiet * 2, s = size / total;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!g[y][x]) continue;
    const px = (x + quiet) * s, py = (y + quiet) * s;
    d += `M${px.toFixed(2)} ${py.toFixed(2)}h${(s + .02).toFixed(2)}v${(s + .02).toFixed(2)}h${(-s - .02).toFixed(2)}z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path d="${d}" fill="${color}"/></svg>`;
}
