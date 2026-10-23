'use strict';
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const providerOf = c => c?.provider === 'mjai' ? 'mjai' : 'chat';
let currentProvider = 'chat', drafts = {};
let operationGeneration = 0, storageQueue = Promise.resolve();
// An already-started storage write cannot be cancelled; later destructive writes
// must run after it. Permission requests stay outside this queue for user gestures.
function writeInOrder(operation) {
  const pending = storageQueue.then(operation);
  storageQueue = pending.catch(() => {});
  return pending;
}
function copyProviders(value) { return Object.fromEntries(Object.entries(value).map(([provider, config]) => [provider, { ...config }])); }
const defaults = provider => ({ provider, enabled: false, endpoint: provider === 'mjai' ? 'http://127.0.0.1:17341/analyze' : '', model: provider === 'mjai' ? 'mjai' : '', apiKey: '' });
function fields(provider) { return { provider, enabled: $('enabled').checked, endpoint: $('endpoint').value.trim(), model: provider === 'mjai' ? 'mjai' : $('model').value.trim(), apiKey: $('key').value.trim() }; }
function show(provider) {
  const c = drafts[provider] || defaults(provider), engine = provider === 'mjai';
  currentProvider = provider;
  $('provider').value = provider; $('enabled').checked = !!c.enabled;
  $('endpoint').value = c.endpoint || ''; $('endpoint').placeholder = engine ? 'http://127.0.0.1:17341/analyze' : 'https://api.openai.com/v1/chat/completions';
  $('endpointHint').textContent = engine ? '仅支持 HTTP 的 localhost / 127.0.0.1 本地 /analyze 接口。保存时仅申请该本地服务的访问权限。' : '支持 HTTPS 服务，以及 HTTP 的 localhost / 127.0.0.1 本地服务。保存时仅申请该服务地址的访问权限。';
  $('model').value = engine ? 'mjai' : c.model || ''; $('model').readOnly = engine;
  $('key').value = c.apiKey || ''; $('key').required = engine;
  $('key').placeholder = engine ? '本地桥接服务显示的 Bearer Token（必填）' : '本地服务无需密钥时可留空';
  $('keyLabel').textContent = engine ? 'Bearer Token（必填）' : 'API Key';
  $('providerHint').textContent = engine ? '可选适配，默认不用。请手动启动本地桥接服务并自备兼容模型（如 Mortal）；插件不捆绑权重。当前仅支持无副露四麻的弃牌、立直意向和跳过。' : '聊天模型提供局面分析与解释。';
}
async function load(generation = operationGeneration) {
  const { modelConfig: c, analysisProviders: saved } = await chrome.storage.local.get(['modelConfig', 'analysisProviders']);
  if (generation !== operationGeneration) return;
  drafts = {};
  for (const provider of ['chat', 'mjai']) {
    const item = saved?.[provider];
    if (item && typeof item === 'object') drafts[provider] = { ...defaults(provider), enabled: !!item.enabled,
      endpoint: typeof item.endpoint === 'string' ? item.endpoint : defaults(provider).endpoint,
      model: provider === 'mjai' ? 'mjai' : typeof item.model === 'string' ? item.model : '', apiKey: typeof item.apiKey === 'string' ? item.apiKey : '' };
  }
  // Older modelConfig values belong exclusively to the chat provider.
  if (c) drafts[providerOf(c)] = { ...defaults(providerOf(c)), ...c, provider: providerOf(c) };
  show(providerOf(c));
}
load().catch(() => status('读取设置失败，请重新打开设置页。'));
$('provider').onchange = () => { drafts[currentProvider] = fields(currentProvider); show($('provider').value === 'mjai' ? 'mjai' : 'chat'); status(''); };
$('config').onsubmit = async event => {
  event.preventDefault();
  const generation = ++operationGeneration;
  try {
    const c = fields(currentProvider), adapter = c.provider === 'mjai' ? MJEngineEndpoint : MJModelEndpoint;
    const url = adapter.endpoint(c.endpoint);
    if (!c.model) throw new Error('请填写模型名称。');
    if (c.provider === 'mjai' && !c.apiKey) throw new Error('请填写本地桥接服务的 Bearer Token。');
    // Request inside the submit gesture, before any asynchronous storage work.
    const allowed = await chrome.permissions.request({ origins: [adapter.permissionOrigin(url.href)] });
    if (generation !== operationGeneration) return;
    if (!allowed) throw new Error('未授予接口访问权限，设置尚未保存。');
    c.endpoint = url.href;
    const providers = copyProviders({ ...drafts, [c.provider]: c });
    await writeInOrder(async () => {
      if (generation !== operationGeneration) return;
      await chrome.storage.local.set({ modelConfig: c, analysisProviders: providers });
      if (generation === operationGeneration) drafts = providers;
    });
    if (generation === operationGeneration) status('设置已保存。返回牌局面板，选择数据后点击分析。');
  } catch (error) { if (generation === operationGeneration) status(error.message); }
};
$('disable').onclick = async () => {
  const generation = ++operationGeneration;
  for (const provider of ['chat', 'mjai']) if (drafts[provider]) drafts[provider].enabled = false;
  const providers = copyProviders(drafts);
  $('enabled').checked = false;
  try {
    await writeInOrder(async () => {
      const { modelConfig: c } = await chrome.storage.local.get('modelConfig');
      await chrome.storage.local.set({ ...(c ? { modelConfig: { ...c, enabled: false } } : {}), analysisProviders: providers });
    });
    if (generation === operationGeneration) status('模型分析已关闭，正在进行的请求将取消。');
  } catch (_) { if (generation === operationGeneration) status('关闭失败，请重试。'); }
};
$('clear').onclick = async () => {
  const generation = ++operationGeneration;
  drafts = {}; show('chat');
  try {
    await writeInOrder(() => chrome.storage.local.remove(['modelConfig', 'analysisProviders']));
    if (generation === operationGeneration) status('已清除所有服务配置和密钥。');
  } catch (_) { if (generation === operationGeneration) status('清除失败，请重试。'); }
};
