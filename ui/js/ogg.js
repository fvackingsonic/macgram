// Перепаковка Opus из WebM в OGG и упаковка волны голосового (без внешних зависимостей).
// ── разбор WebM (EBML) ──
const MASTER = new Set([0x18538067, 0x1F43B675, 0xA0, 0x1654AE6B, 0xAE]); // Segment, Cluster, BlockGroup, Tracks, TrackEntry
function readVint(b, p, keepMarker) {
  const first = b[p];
  let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 8) throw new Error('bad vint');
  let v = keepMarker ? first : first & (mask - 1);
  let unknown = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i++) { v = v * 256 + b[p + i]; if (b[p + i] !== 0xff) unknown = false; }
  return { v, len, unknown: !keepMarker && unknown };
}
export function webmToOpusPackets(buf) {
  const b = new Uint8Array(buf);
  const packets = [];
  let codecPrivate = null;
  let p = 0;
  while (p < b.length) {
    let id, size;
    try { id = readVint(b, p, true); size = readVint(b, p + id.len, false); } catch { break; }
    const head = id.len + size.len;
    const start = p + head;
    if (MASTER.has(id.v)) { p = start; continue; } // контейнер — спускаемся внутрь
    const end = size.unknown ? b.length : Math.min(b.length, start + size.v);
    if (id.v === 0x63A2) codecPrivate = b.slice(start, end);
    if (id.v === 0xA3 || id.v === 0xA1) { // SimpleBlock / Block
      const track = readVint(b, start, false);
      const dataStart = start + track.len + 3; // таймкод (2 байта) + флаги (1 байт)
      packets.push(b.slice(dataStart, end));
    }
    p = end;
  }
  return { packets, codecPrivate };
}

// ── сборка OGG ──
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; }
  return t;
})();
function crc32(data) { let c = 0; for (let i = 0; i < data.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ data[i]) & 0xff]) >>> 0; return c; }
function oggPage(packet, granule, serial, seq, flags) {
  const segs = [];
  let n = packet.length;
  while (n >= 255) { segs.push(255); n -= 255; }
  segs.push(n);
  const page = new Uint8Array(27 + segs.length + packet.length);
  const dv = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // OggS
  page[4] = 0; page[5] = flags;
  dv.setUint32(6, granule % 0x100000000, true); dv.setUint32(10, Math.floor(granule / 0x100000000), true);
  dv.setUint32(14, serial, true); dv.setUint32(18, seq, true); dv.setUint32(22, 0, true);
  page[26] = segs.length; page.set(segs, 27); page.set(packet, 27 + segs.length);
  dv.setUint32(22, crc32(page), true);
  return page;
}
function opusSamples(pkt) {
  if (!pkt.length) return 0;
  const toc = pkt[0], cfg = toc >> 3;
  const ms = cfg < 12 ? [10, 20, 40, 60][cfg & 3] : cfg < 16 ? [10, 20][cfg & 1] : [2.5, 5, 10, 20][cfg & 3];
  const c = toc & 3;
  const frames = c === 0 ? 1 : c === 3 ? (pkt[1] & 0x3f) : 2;
  return Math.round(frames * ms * 48);
}
export function packOgg(packets, codecPrivate) {
  const serial = (Math.random() * 0xffffffff) >>> 0;
  let head = codecPrivate && String.fromCharCode(...codecPrivate.slice(0, 8)) === 'OpusHead' ? codecPrivate : null;
  if (!head) { // OpusHead по умолчанию: моно, 48 кГц
    head = new Uint8Array(19); head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 1]);
    new DataView(head.buffer).setUint16(10, 312, true); new DataView(head.buffer).setUint32(12, 48000, true);
  }
  const vendor = new TextEncoder().encode('MacTele');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(new TextEncoder().encode('OpusTags')); new DataView(tags.buffer).setUint32(8, vendor.length, true); tags.set(vendor, 12);
  const pages = [oggPage(head, 0, serial, 0, 2), oggPage(tags, 0, serial, 1, 0)];
  let granule = 0, seq = 2;
  packets.forEach((pk, i) => { granule += opusSamples(pk); pages.push(oggPage(pk, granule, serial, seq++, i === packets.length - 1 ? 4 : 0)); });
  const total = pages.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const p of pages) { out.set(p, o); o += p.length; }
  return { bytes: out, duration: granule / 48000 };
}

// Волна Telegram: 100 значений по 5 бит, упакованные подряд.
export function packWaveform(levels) {
  const n = 100, vals = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * levels.length / n), z = Math.max(a + 1, Math.floor((i + 1) * levels.length / n));
    let m = 0; for (let j = a; j < z && j < levels.length; j++) m = Math.max(m, levels[j]);
    vals.push(m);
  }
  const peak = Math.max(0.01, ...vals);
  const bytes = new Uint8Array(Math.ceil(n * 5 / 8) + 1);
  vals.forEach((v, i) => {
    const q = Math.min(31, Math.round(v / peak * 31)), bit = i * 5, byte = bit >> 3, sh = bit & 7;
    bytes[byte] |= (q << sh) & 0xff; bytes[byte + 1] |= q >> (8 - sh);
  });
  return bytes.slice(0, Math.ceil(n * 5 / 8));
}
export const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

