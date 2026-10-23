(function (root) {
  'use strict';
  const officialUrl = 'https://naga.dmv.nico/naga_report/order_form/';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const styleUrl = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('naga-panel.css') : new URL('naga-panel.css', document.currentScript?.src || location.href).href;
  const rendered = new WeakMap();
  let enabled = false, open = false, confirmed = false, rules = { roundType: '', redFives: '', kuitan: '' };
  let result = null, selected = new Set(), identity = '', replayIdentity = '', message = '', generation = 0, mountVersion = 0, host = null, context = null, repaint = null;
  function clear() { result = null; selected = new Set(); identity = ''; message = ''; generation++; }
  function text() {
    if (!result) return '';
    const rounds = result.rounds.filter(round => selected.has(String(round.id)));
    return rounds.map(round => round.url).join('\n');
  }
  function refresh() { if (repaint) repaint(); else if (host && context) mount(host, context); }
  function mount(container, options, render) {
    const version = ++mountVersion;
    host = container; context = options; repaint = render || null;
    let content = container.querySelector('[data-naga-content]');
    if (!content) {
      container.innerHTML = `<link rel="stylesheet" href="${escape(styleUrl)}"><div data-naga-content></div>`;
      content = container.querySelector('[data-naga-content]');
    }
    container = content;
    const replay = options.mode === 'replay' && options.recordCount > 0;
    const nextIdentity = replay ? JSON.stringify([options.replayRevision, options.recordCount]) : '';
    if (!replay || nextIdentity !== replayIdentity) { clear(); confirmed = false; }
    else if (result && identity !== nextIdentity) clear();
    replayIdentity = nextIdentity;
    const ready = replay && confirmed && rules.roundType && rules.redFives !== '' && rules.kuitan === 'true';
    const select = (id, label, value, values) => `<label>${label}<select id="${id}">${[['', '请选择'], ...values].map(([v, name]) => `<option value="${v}"${value === v ? ' selected' : ''}>${name}</option>`).join('')}</select></label>`;
    const markup = `<details class="naga-panel"${open ? ' open' : ''}><summary>牌谱复盘 · NAGA <span>${enabled ? '已启用' : '默认关闭'}</span></summary>
      <label class="naga-enable"><input id="naga-enabled" type="checkbox"${enabled ? ' checked' : ''}>启用 NAGA 牌谱导出（本页）</label>
      ${!enabled ? '<p class="naga-muted">启用后确认牌谱规则，选择局数并在本地生成文本。</p>' : `
      <p class="naga-muted">全场转换独立于当前游标，包含牌谱四家手牌，默认匿名。仅支持完整四人喰断牌谱。</p>
      ${!replay ? '<p class="naga-warn" role="status">请先打开完整牌谱。实战与历史局面不能导出 NAGA 牌谱。</p>' : ''}
      <div class="naga-rules">${select('naga-round-type', '对局长度', rules.roundType, [['tonpu', '东风'], ['hanchan', '半庄']])}${select('naga-red', '赤牌配置', rules.redFives, [['true', '三枚赤牌（万筒索各一）'], ['false', '无赤牌']])}${select('naga-kuitan', '四人规则', rules.kuitan, [['true', '四人喰断开启']])}</div>
      <label><input id="naga-confirm" type="checkbox"${confirmed ? ' checked' : ''}>我已核对这些规则与当前牌谱一致</label>
      <button id="naga-generate" type="button"${ready ? '' : ' disabled'}>生成全场牌谱文本</button>
      ${!ready && replay ? '<p class="naga-muted">首次使用请逐项选择规则并勾选确认。</p>' : ''}
      ${result ? `<fieldset class="naga-rounds"><legend>选择导出局数</legend>${result.rounds.map(round => `<label><input class="naga-round" type="checkbox" value="${escape(round.id)}"${selected.has(String(round.id)) ? ' checked' : ''}>${escape(round.label)}</label>`).join('') || '<p>没有可导出的完整局。</p>'}</fieldset>
      ${(result.rejected || []).map(round => `<p class="naga-warn">${escape(round.label)}：${escape(round.reason)}</p>`).join('')}
      ${result.rounds.length ? `<label>只读导出预览<textarea id="naga-preview" readonly rows="5" spellcheck="false">${escape(text())}</textarea></label><div class="naga-actions"><button id="naga-copy" type="button"${selected.size ? '' : ' disabled'}>复制文本</button><button id="naga-download" type="button"${selected.size ? '' : ' disabled'}>下载文本</button></div>` : ''}` : ''}
      <p class="naga-warn" role="status">${escape(message)}</p>
      <a class="naga-official" href="${officialUrl}" target="_blank" rel="noopener noreferrer">打开 NAGA 官方提交页</a>
      <p class="naga-muted">请在官方站自行登录、粘贴牌谱并选择额度与模型；费用以官方确认为准。本扩展不自动提交或扣费，不读取报告，不读取或保存账号密码。</p>`}</details>`;
    const renderKey = markup.replace('<details class="naga-panel" open>', '<details class="naga-panel">');
    if (rendered.get(container) !== renderKey) { container.innerHTML = markup; rendered.set(container, renderKey); }
    const element = id => container.querySelector('#' + id);
    const bind = (id, name, callback) => { const node = element(id); if (node) node[name] = event => { if (version === mountVersion) return callback(event); }; };
    const section = container.querySelector('.naga-panel');
    if (section) section.ontoggle = () => { if (version === mountVersion) open = section.open; };
    bind('naga-enabled', 'onchange', event => { enabled = event.target.checked; clear(); refresh(); });
    for (const [id, key] of [['naga-round-type', 'roundType'], ['naga-red', 'redFives'], ['naga-kuitan', 'kuitan']]) {
      bind(id, 'onchange', event => { rules[key] = event.target.value; confirmed = false; clear(); refresh(); });
    }
    bind('naga-confirm', 'onchange', event => { confirmed = event.target.checked; clear(); refresh(); });
    bind('naga-generate', 'onclick', () => {
      if (!enabled || !ready) return;
      clear();
      try {
        const observation = options.exportReplay();
        if (observation?.mode !== 'replay') throw new Error('当前已离开牌谱模式，请重新打开完整牌谱。');
        const converted = root.MJNagaReplay.fromObservation(observation, { rules: { roundType: rules.roundType, redFives: rules.redFives === 'true', kuitan: true } });
        result = converted; identity = JSON.stringify([options.replayRevision, options.recordCount]); selected = new Set(result.rounds.map(round => String(round.id)));
        message = '文本已在本地生成，请核对预览后在官方站自行提交。';
      } catch (error) { message = error.message || '无法转换这份牌谱。'; }
      refresh();
    });
    for (const node of container.querySelectorAll('.naga-round')) node.onchange = event => { if (version !== mountVersion) return; if (event.target.checked) selected.add(String(event.target.value)); else selected.delete(String(event.target.value)); message = ''; generation++; refresh(); };
    bind('naga-copy', 'onclick', async () => {
      if (!text()) return;
      const request = generation, value = text();
      try {
        await navigator.clipboard.writeText(value);
        if (request !== generation) return;
        message = '已复制文本。请在官方提交页自行粘贴。'; refresh();
      } catch (_) {
        if (request !== generation) return;
        message = '自动复制失败：请选中下方预览，按 Ctrl+C（macOS 使用 ⌘C）复制。'; refresh();
        const preview = host.querySelector('#naga-preview'); preview?.focus(); preview?.select();
      }
    });
    bind('naga-download', 'onclick', () => {
      if (!text()) return;
      const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'naga-replay.txt'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }
  function destroy() {
    mountVersion++;
    clear(); enabled = false; open = false; confirmed = false; replayIdentity = ''; rules = { roundType: '', redFives: '', kuitan: '' };
    if (host) host.innerHTML = '';
    host = context = repaint = null;
  }
  root.MJNagaPanel = Object.freeze({ mount, destroy });
})(typeof globalThis !== 'undefined' ? globalThis : this);
