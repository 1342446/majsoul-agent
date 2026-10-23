(function (root) {
  'use strict';
  function endpoint(value) {
    let u; try { u = new URL(value); } catch (_) { throw new Error('请输入有效的 API 请求地址。'); }
    if (u.username || u.password || u.search || u.hash || !(u.protocol === 'https:' ||
      (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new Error('接口须使用 HTTPS；本机 localhost / 127.0.0.1 可使用 HTTP，且不能包含账号、查询或片段。');
    const path = u.pathname.replace(/\/+$/, '');
    u.pathname = path.endsWith('/chat/completions') ? path : path + '/chat/completions';
    return u;
  }
  // Chrome match patterns use hostnames without ports; the actual fetch retains the port.
  function permissionOrigin(value) {
    const u = endpoint(value);
    return u.protocol + '//' + u.hostname + '/*';
  }
  function supportsThinking(address, model) {
    try { return endpoint(address).hostname === 'api.deepseek.com' &&
      ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'].includes(model?.trim()); }
    catch (_) { return false; }
  }
  const defaultMaxTokens = thinking => thinking ? 32768 : 8192;
  function outputOptions(config) {
    const supported = supportsThinking(config.endpoint, config.model), thinking = supported && config.thinking === true;
    const max = config.maxTokens ?? defaultMaxTokens(thinking);
    if (!Number.isInteger(max) || max < 1 || max > 393216) throw new Error('输出上限须为 1–393216 的整数，请按模型支持范围设置。');
    return { max_tokens: max, ...(supported ? { thinking: { type: thinking ? 'enabled' : 'disabled' } } : {}) };
  }
  const api = { endpoint, permissionOrigin, supportsThinking, defaultMaxTokens, outputOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MJModelEndpoint = api;
})(globalThis);
