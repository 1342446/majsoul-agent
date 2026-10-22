/* Minimal wire reader and explicitly selected game fields. No account payload is emitted. */
(function (root) {
  'use strict';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const MAX_BYTES = 16 * 1024 * 1024;
  function bytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new Error('消息不是二进制数据');
  }
  function varint(b, cursor) {
    let value = 0n;
    for (let i = 0; i < 10; i++) {
      if (cursor.p >= b.length) throw new Error('varint 被截断');
      const v = b[cursor.p++];
      if (i === 9 && v > 1) throw new Error('varint 超出64位');
      value |= BigInt(v & 127) << BigInt(7 * i);
      if (!(v & 128)) return value;
    }
    throw new Error('varint 过长');
  }
  function wire(input) {
    const b = bytes(input), c = { p: 0 }, fields = new Map();
    if (b.length > MAX_BYTES) throw new Error('消息超过16MiB限制');
    let count = 0;
    while (c.p < b.length) {
      if (++count > 200000) throw new Error('消息字段过多');
      const tag = Number(varint(b, c)), id = tag >>> 3, type = tag & 7;
      if (!id || tag > 0xffffffff) throw new Error('无效字段标记');
      let value;
      if (type === 0) value = varint(b, c);
      else if (type === 2) {
        const length = Number(varint(b, c));
        if (!Number.isSafeInteger(length) || length > b.length - c.p) throw new Error('字段被截断');
        value = b.subarray(c.p, c.p + length); c.p += length;
      } else if (type === 1 || type === 5) {
        const length = type === 1 ? 8 : 4;
        if (length > b.length - c.p) throw new Error('定长字段被截断');
        value = b.subarray(c.p, c.p + length); c.p += length;
      } else throw new Error('不支持的wire类型 ' + type);
      if (!fields.has(id)) fields.set(id, []);
      fields.get(id).push({ type, value });
    }
    return fields;
  }
  const blob = (f, id) => f.get(id)?.find(v => v.type === 2)?.value;
  const blobs = (f, id) => (f.get(id) || []).filter(v => v.type === 2).map(v => v.value);
  const num = (f, id, fallback = 0) => {
    const v = f.get(id)?.find(v => v.type === 0)?.value;
    return v === undefined ? fallback : Number(BigInt.asIntN(32, v));
  };
  const str = (f, id) => { const b = blob(f, id); return b ? decoder.decode(b) : ''; };
  const strs = (f, id) => blobs(f, id).map(b => decoder.decode(b));
  function nums(f, id) {
    const result = [];
    for (const v of f.get(id) || []) {
      if (v.type === 0) result.push(Number(BigInt.asIntN(32, v.value)));
      else if (v.type === 2) {
        const c = { p: 0 };
        while (c.p < v.value.length) result.push(Number(BigInt.asIntN(32, varint(v.value, c))));
      }
    }
    return result;
  }
  const validTile = t => /^(?:[1-9][mps]|0[mps]|[1-7]z)$/.test(t);
  function tile(t) { return validTile(t) ? t : '?'; }
  function tiles(f, id) { return strs(f, id).map(tile); }
  function wrapper(input) {
    const f = wire(input);
    return { name: str(f, 1), data: blob(f, 2) || new Uint8Array() };
  }
  function frame(input) {
    const b = bytes(input), type = b[0];
    if (![1, 2, 3].includes(type) || b.length < (type === 1 ? 2 : 4)) throw new Error('未知消息封装');
    const w = wrapper(b.subarray(type === 1 ? 1 : 3));
    return { type, id: type === 1 ? null : b[1] | b[2] << 8, ...w };
  }
  function unmask(input) {
    const b = bytes(input), result = new Uint8Array(b.length);
    const key = [132, 94, 78, 66, 57, 162, 31, 96, 28];
    for (let i = 0; i < b.length; i++) result[i] = b[i] ^ (((23 ^ b.length) + 5 * i + key[i % 9]) & 255);
    return result;
  }
  function operation(f, id) {
    const b = blob(f, id);
    if (!b) return undefined;
    const o = wire(b);
    return { seat: num(o, 1), types: blobs(o, 2).map(v => num(wire(v), 1)) };
  }
  function success(f, id = 5) {
    const b = blob(f, id);
    if (!b) return undefined;
    const o = wire(b);
    return { seat: num(o, 1), score: num(o, 2), sticks: num(o, 3), failed: !!num(o, 4) };
  }
  function decodeEvent(name, data, source) {
    const kind = name.replace(/^.*\./, '').replace(/^(Action|Record)/, '');
    const f = wire(data), replay = source === 'replay';
    const e = { kind, source };
    if (kind === 'NewRound') {
      Object.assign(e, { wind: num(f, 1), round: num(f, 2), honba: num(f, 3),
        scores: nums(f, replay ? 5 : 6), sticks: num(f, replay ? 6 : 8),
        remaining: num(f, replay ? 15 : 13, null),
        doras: tiles(f, replay ? 16 : 14) });
      if (!e.doras.length) { const d = str(f, replay ? 4 : 5); if (d) e.doras = [tile(d)]; }
      if (replay) e.hands = [7, 8, 9, 10].map(id => tiles(f, id));
      else { e.hand = tiles(f, 4); e.operation = operation(f, 7); }
      if (e.scores.length < 3 || e.scores.length > 4 || e.wind > 3 || e.round > 3 ||
          (e.remaining !== null && (e.remaining < 0 || e.remaining > 136))) throw new Error('开局字段不符合预期');
    } else if (kind === 'DealTile') {
      Object.assign(e, { seat: num(f, 1), tile: tile(str(f, 2)), remaining: num(f, 3, null),
        doras: tiles(f, 6), riichiSuccess: success(f), operation: operation(f, replay ? 8 : 4) });
    } else if (kind === 'DiscardTile') {
      Object.assign(e, { seat: num(f, 1), tile: tile(str(f, 2)), riichi: !!(num(f, 3) || num(f, 9)),
        tsumogiri: !!num(f, 5), doras: tiles(f, 8), scores: nums(f, 13),
        sticks: num(f, 14, null), operation: replay ? undefined : operation(f, 4) });
    } else if (kind === 'ChiPengGang') {
      Object.assign(e, { seat: num(f, 1), meldType: num(f, 2), tiles: tiles(f, 3), froms: nums(f, 4),
        riichiSuccess: success(f), scores: nums(f, 11), sticks: num(f, 12, null),
        operation: operation(f, replay ? 8 : 6) });
    } else if (kind === 'AnGangAddGang') {
      Object.assign(e, { seat: num(f, 1), meldType: num(f, 2), tile: tile(str(f, 3)), doras: tiles(f, 6),
        operation: replay ? undefined : operation(f, 4) });
    } else if (kind === 'BaBei') {
      Object.assign(e, { seat: num(f, 1), doras: tiles(f, 6), operation: replay ? undefined : operation(f, 4) });
    } else if (kind === 'Hule') {
      Object.assign(e, { scores: nums(f, 5), deltas: nums(f, 3), doras: tiles(f, 7),
        winners: blobs(f, 1).map(b => { const h = wire(b); return { seat: num(h, 4), tile: tile(str(h, 3)),
          tsumo: !!num(h, 5), han: num(h, 11), fu: num(h, 13) }; }) });
    } else if (kind === 'NoTile') {
      const list = blobs(f, 3).map(b => wire(b));
      const old = list.length ? nums(list[0], 2) : [], delta = list.length ? nums(list[0], 3) : [];
      if (old.length && old.length === delta.length) e.scores = old.map((v, i) => v + delta[i]);
    } else if (kind === 'LiuJu') e.reason = num(f, 1);
    else if (kind === 'MJStart') return e;
    else return { kind: 'Unsupported', source, name: String(name).slice(0, 100) };
    if ('seat' in e && (e.seat < 0 || e.seat > 3)) throw new Error('无效座位');
    return e;
  }
  function action(input) {
    const f = wire(input), name = str(f, 2), body = blob(f, 3);
    if (!/^Action[A-Za-z]+$/.test(name) || !body) throw new Error('动作封装不符合预期');
    const errors = [];
    for (const [encoding, data] of [['masked', unmask(body)], ['plain', body]]) {
      try { return { ...decodeEvent(name, data, 'live'), step: num(f, 1), encoding }; }
      catch (error) { errors.push(error.message); }
    }
    throw new Error('动作解析失败：' + errors.join(' / '));
  }
  function replay(input) {
    const w = wrapper(input);
    if (!/(?:^|\.)GameDetailRecords$/.test(w.name)) throw new Error('不是GameDetailRecords牌谱封装');
    const f = wire(w.data), records = blobs(f, 1).slice();
    if (!records.length) for (const b of blobs(f, 3)) { const result = blob(wire(b), 3); if (result?.length) records.push(result); }
    if (!records.length) throw new Error('牌谱没有可识别记录');
    if (records.length > 25000) throw new Error('牌谱超过25000条记录限制');
    return records.map((b, index) => {
      const w = wrapper(b);
      if (!/(?:^|\.)Record[A-Za-z]+$/.test(w.name)) throw new Error('牌谱记录封装不符合预期');
      return { ...decodeEvent(w.name, w.data, 'replay'), recordIndex: index };
    });
  }
  function recordResponse(input) {
    const f = wire(input);
    if (blob(f, 1)?.length) throw new Error('服务器返回牌谱错误');
    return { data: blob(f, 4), url: str(f, 5) };
  }
  const api = { bytes, wire, blob, blobs, num, str, nums, wrapper, frame, unmask, decodeEvent, action, replay, recordResponse, MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.defineProperty(root, '__MJ_OBSERVER_PROTOCOL_V1__', { value: api });
})(typeof globalThis !== 'undefined' ? globalThis : this);
