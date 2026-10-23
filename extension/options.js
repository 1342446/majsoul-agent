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
function fields(provider) { return { provider, enabled: $('enabled').checked, endpoint: $('endpoint').value.trim(), model: provider === 'mjai' ? 'mjai' : $('model').value.trim(), apiKey: $('key').value.trim(),
  ...(provider === 'chat' ? { thinking: !$('thinking').disabled && $('thinking').checked, maxTokens: Number($('maxTokens').value) } : {}) }; }
function updateThinking() {
  const supported = currentProvider === 'chat' && MJModelEndpoint.supportsThinking($('endpoint').value.trim(), $('model').value.trim());
  $('thinking').disabled = !supported;
  $('thinkingHint').textContent = supported ? '默认关闭；开启后可能增加耗时和费用。' : '思考开关目前支持 DeepSeek Flash / V4 官方接口。';
}
function show(provider) {
  const c = drafts[provider] || defaults(provider), engine = provider === 'mjai';
  currentProvider = provider;
  $('provider').value = provider; $('enabled').checked = !!c.enabled;
  $('endpoint').value = c.endpoint || ''; $('endpoint').placeholder = engine ? 'http://127.0.0.1:17341/analyze' : 'https://api.openai.com/v1';
  $('endpointHint').textContent = engine ? '仅支持 localhost / 127.0.0.1 的 HTTP /analyze 接口。' : '自动补全 /chat/completions，也可填写完整接口地址。';
  $('model').value = engine ? 'mjai' : c.model || ''; $('model').readOnly = engine;
  $('chatOptions').hidden = engine; $('maxTokens').disabled = engine;
  $('thinking').checked = c.thinking === true;
  $('maxTokens').value = Number.isInteger(c.maxTokens) && c.maxTokens >= 1 && c.maxTokens <= 393216 ? c.maxTokens : MJModelEndpoint.defaultMaxTokens(c.thinking === true);
  updateThinking();
  $('key').value = c.apiKey || ''; $('key').required = engine;
  $('key').placeholder = engine ? '填写本地服务的 Token' : '填写密钥；无密钥的本地服务可留空';
  $('keyLabel').textContent = engine ? 'Bearer Token' : 'API Key';
  $('providerHint').textContent = engine ? '需手动启动桥接服务并自备模型，不捆绑权重。仅支持无副露四麻。' : '';
}
async function load(generation = operationGeneration) {
  const { modelConfig: c, analysisProviders: saved } = await chrome.storage.local.get(['modelConfig', 'analysisProviders']);
  if (generation !== operationGeneration) return;
  drafts = {};
  for (const provider of ['chat', 'mjai']) {
    const item = saved?.[provider];
    if (item && typeof item === 'object') drafts[provider] = { ...defaults(provider), enabled: !!item.enabled,
      endpoint: typeof item.endpoint === 'string' ? item.endpoint : defaults(provider).endpoint,
      model: provider === 'mjai' ? 'mjai' : typeof item.model === 'string' ? item.model : '', apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
      ...(provider === 'chat' ? { thinking: item.thinking === true, maxTokens: item.maxTokens } : {}) };
  }
  // Older modelConfig values belong exclusively to the chat provider.
  if (c) drafts[providerOf(c)] = { ...defaults(providerOf(c)), ...c, provider: providerOf(c) };
  show(providerOf(c));
}
load().catch(() => status('读取设置失败，请重新打开设置页。'));
$('provider').onchange = () => { drafts[currentProvider] = fields(currentProvider); show($('provider').value === 'mjai' ? 'mjai' : 'chat'); status(''); };
$('endpoint').oninput = updateThinking;
$('model').oninput = updateThinking;
$('thinking').onchange = () => {
  const previousDefault = MJModelEndpoint.defaultMaxTokens(!$('thinking').checked);
  if (Number($('maxTokens').value) === previousDefault) $('maxTokens').value = MJModelEndpoint.defaultMaxTokens($('thinking').checked);
};
$('config').onsubmit = async event => {
  event.preventDefault();
  const generation = ++operationGeneration;
  try {
    const c = fields(currentProvider), adapter = c.provider === 'mjai' ? MJEngineEndpoint : MJModelEndpoint;
    const url = adapter.endpoint(c.endpoint);
    if (c.provider === 'chat') MJModelEndpoint.outputOptions(c);
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
    if (generation === operationGeneration) {
      if (currentProvider === c.provider) $('endpoint').value = c.endpoint;
      status('已保存。在牌局面板开启“调用模型”即可使用。');
    }
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
