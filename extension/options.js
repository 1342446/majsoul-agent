'use strict';
const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
async function load() {
  const { modelConfig: c } = await chrome.storage.local.get('modelConfig');
  $('enabled').checked = !!c?.enabled; $('endpoint').value = c?.endpoint || '';
  $('model').value = c?.model || ''; $('key').value = c?.apiKey || '';
}
load().catch(() => status('读取设置失败，请重新打开设置页。'));
$('config').onsubmit = async event => {
  event.preventDefault();
  try {
    const url = MJModelEndpoint.endpoint($('endpoint').value.trim());
    const model = $('model').value.trim(); if (!model) throw new Error('请填写模型名称。');
    // Request inside the submit gesture, before any asynchronous storage work.
    if (!await chrome.permissions.request({ origins: [MJModelEndpoint.permissionOrigin(url.href)] })) throw new Error('未授予接口访问权限，设置尚未保存。');
    await chrome.storage.local.set({ modelConfig: { enabled: $('enabled').checked, endpoint: url.href,
      model, apiKey: $('key').value.trim() } });
    status('设置已保存。返回牌局面板，选择数据后点击分析。');
  } catch (error) { status(error.message); }
};
$('disable').onclick = async () => {
  try { const { modelConfig: c } = await chrome.storage.local.get('modelConfig');
    if (c) await chrome.storage.local.set({ modelConfig: { ...c, enabled: false } });
    $('enabled').checked = false; status('模型分析已关闭，正在进行的请求将取消。');
  } catch (_) { status('关闭失败，请重试。'); }
};
$('clear').onclick = async () => {
  try { await chrome.storage.local.remove('modelConfig'); await load(); status('已清除配置和密钥。'); }
  catch (_) { status('清除失败，请重试。'); }
};
