'use strict';
(function () {
  const element = id => document.getElementById(id);
  const status = text => { element('memoryStatus').textContent = text; };
  async function request(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || '记忆操作失败，请重试。');
    return result;
  }
  function render(value) {
    element('memoryEnabled').checked = value.enabled;
    const list = element('memoryEntries'); list.replaceChildren();
    for (const entry of value.entries || []) {
      const row = document.createElement('div'), text = document.createElement('p'), edit = document.createElement('button'), remove = document.createElement('button');
      text.textContent = `${entry.status === 'confirmed' ? '明确偏好' : '待确认候选'}：${entry.text}${entry.context ? '（' + entry.context + '）' : ''}${entry.status === 'candidate' ? `；引用 ${entry.samples} 个动作 / ${entry.opportunities} 个所列情境机会，来源 ${entry.matchId}` : ''}`;
      edit.type = remove.type = 'button'; edit.textContent = '修正 / 确认为明确偏好'; remove.textContent = '删除';
      edit.onclick = () => { element('memoryPreference').value = entry.text; element('memoryPreference').dataset.entryId = entry.id; element('memoryPreference').focus(); };
      remove.onclick = () => act({ type: 'memory:edit', edit: { entryId: entry.id, remove: true } });
      row.append(text, edit, remove); list.append(row);
    }
    const jobs = value.jobs || [];
    const labels = { queued: '待处理', running: '总结中', insufficient: '完整数据不足，未请求模型', completed: '总结完成',
      failed: '总结失败，不自动重试', cancelled: '已取消', uncertain: '请求结果不确定，不自动重试', expired: '证据已过期', 'budget-exceeded': '证据超过输入预算，未请求模型' };
    const number = n => Number.isFinite(n) ? String(n) : '未知';
    element('memoryJobs').textContent = `记忆版本 ${value.version}\n` + (jobs.length ? jobs.map(job => {
      const a = job.accounting, cost = a?.cost;
      return `${labels[job.status] || '未知状态'} · 请求 ${number(a?.calls ?? job.calls)} 次 · 输入 ${number(a?.usage?.inputTokens)} / 输出 ${number(a?.usage?.outputTokens)} tokens · 费用 ${cost?.totalCost !== null && cost?.totalCost !== undefined ? cost.totalCost + ' ' + (cost.currency || '') : '未知'}`;
    }).join('\n') : '尚无整场学习任务。');
    element('memoryRawJobs').textContent = JSON.stringify({ version: value.version, jobs }, null, 2);
  }
  async function act(message) {
    try { render(await request(message)); status('已保存。'); } catch (error) { status(error.message); }
  }
  element('memoryEnabled').onchange = () => act({ type: 'memory:configure', enabled: element('memoryEnabled').checked });
  element('memorySave').onclick = () => {
    const input = element('memoryPreference');
    if (!input.value.trim()) { status('请填写明确偏好。'); return; }
    const edit = { value: input.value, entryId: input.dataset.entryId };
    input.value = ''; delete input.dataset.entryId; act({ type: 'memory:edit', edit });
  };
  element('memoryClear').onclick = () => act({ type: 'memory:clear' });
  element('memoryRefresh').onclick = () => act({ type: 'memory:status' });
  request({ type: 'memory:status' }).then(render).catch(error => status(error.message));
})();
