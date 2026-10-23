(function (root) {
  'use strict';
  function endpoint(value) {
    let u; try { u = new URL(value); } catch (_) { throw new Error('请输入完整的接口地址。'); }
    if (u.username || u.password || u.search || u.hash || !(u.protocol === 'https:' ||
      (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new Error('接口须使用 HTTPS；本机 localhost / 127.0.0.1 可使用 HTTP，且不能包含账号、查询或片段。');
    if (!u.pathname.endsWith('/chat/completions')) throw new Error('请输入完整的 /chat/completions 接口地址。');
    return u;
  }
  // Chrome match patterns use hostnames without ports; the actual fetch retains the port.
  function permissionOrigin(value) {
    const u = endpoint(value);
    return u.protocol + '//' + u.hostname + '/*';
  }
  const api = { endpoint, permissionOrigin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJModelEndpoint = api;
})(globalThis);
