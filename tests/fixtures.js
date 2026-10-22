'use strict';
const cat = (...parts) => Uint8Array.from(parts.flatMap(p => Array.from(p)));
function v(n) {
  let x = BigInt(n); if (x < 0n) x = BigInt.asUintN(64, x);
  const a = []; do { let b = Number(x & 127n); x >>= 7n; if (x) b |= 128; a.push(b); } while (x); return Uint8Array.from(a);
}
const n = (id, value) => cat(v(id * 8), v(value));
const b = (id, value) => cat(v(id * 8 + 2), v(value.length), value);
const t = (id, value) => b(id, new TextEncoder().encode(value));
const strings = (id, values) => cat(...values.map(x => t(id, x)));
const packed = (id, values) => b(id, cat(...values.map(v)));
const wrap = (name, data) => cat(t(1, name), b(2, data));
const frame = (type, name, data, id = 0) => cat([type], type === 1 ? [] : [id & 255, id >> 8], wrap(name, data));
const hand = ['7m','2p','4s','6s','8s','8s','8s','9s','2z','3z','4z','5z','6z'];
const liveRound = () => cat(n(1, 0), n(2, 0), strings(4, hand), t(5, '7p'), packed(6, [25000,25000,25000,25000]), n(13, 69), b(7, cat(n(1, 1), b(2, n(1, 1)))));
const replayRound = () => cat(n(1, 0), n(2, 0), t(4, '7p'), packed(5, [25000,25000,25000,25000]), ...[7,8,9,10].map(id => strings(id, hand)), n(15, 69));
module.exports = { cat, v, n, b, t, strings, packed, wrap, frame, hand, liveRound, replayRound };
