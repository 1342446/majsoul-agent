(function (root) {
  'use strict';
  function endpoint(value) {
    let u; try { u = new URL(value); } catch (_) { throw new Error('请输入完整的本地 mjai 接口地址。'); }
    if (typeof value !== 'string' || !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?\/analyze$/i.test(value) ||
        u.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(u.hostname) ||
        u.username || u.password || u.search || u.hash || u.pathname !== '/analyze') {
      throw new Error('mjai 仅支持 http://localhost 或 http://127.0.0.1 的 /analyze 地址，不能包含账号、查询或片段。');
    }
    return u;
  }
  function permissionOrigin(value) { const u = endpoint(value); return u.protocol + '//' + u.hostname + '/*'; }
  const api = { endpoint, permissionOrigin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJEngineEndpoint = api;
})(globalThis);
