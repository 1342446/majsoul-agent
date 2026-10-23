(function () {
  'use strict';
  const available = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  const selection = { game: true, rivers: 'all', hand: false };
  let task = 'both', enabled = false, busy = false, result = null, failure = '', preview = false;
  let current, context, repaint, requestId = 0;
  const send = message => chrome.runtime.sendMessage(message);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function snapshot() { return MJAnalysis.snapshot(current, selection); }
  function fingerprint() { try { return JSON.stringify({ context, round: current.round, phase: current.phase, snapshot: snapshot() }); } catch (_) { return ''; } }
  async function refresh() {
    if (!available) return;
    try { const status = await send({ type: 'model:status' });
      if (enabled !== !!status?.enabled) result = null;
      enabled = !!status?.enabled; }
    catch (_) { enabled = false; }
    repaint?.();
  }
  if (available) {
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.modelConfig) { result = null; refresh(); } });
    window.addEventListener('focus', refresh);
    refresh();
  }
  function mount(container, state, position, render) {
    current = state; context = position; repaint = render;
    const stale = result && result.fingerprint !== fingerprint();
    let payload = '', error = '';
    try { payload = JSON.stringify(snapshot(), null, 2); } catch (e) { error = e.message; }
    container.innerHTML = `<style>
      .analysis{border-top:2px solid #24838a;margin-top:14px;padding-top:8px}.analysis h3{margin:0 0 6px}.analysis label{display:block;margin:7px 0}.analysis select{max-width:100%;padding:4px}.analysis .result{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;margin-top:8px;padding:8px;background:#e5f0f3;max-height:300px;overflow:auto}.analysis pre{font:11px/1.5 monospace;max-height:180px;overflow:auto;background:#edf3f7;padding:8px;white-space:pre-wrap}.analysis .controls{margin-top:8px}
      </style><section class="analysis" aria-label="模型分析"><h3>模型分析</h3>
      <p class="muted">${!available ? '离线演示不发送模型请求。' : enabled ? '已开启 · 仅点击分析时发送所选数据' : '默认关闭 · 在设置中接入自己的模型'}</p>
      <div class="controls"><button id="model-settings" ${!available ? 'disabled' : ''}>模型设置</button><button id="model-refresh" ${!available ? 'disabled' : ''}>刷新设置状态</button></div>
      <label><input id="model-game" type="checkbox" ${selection.game ? 'checked' : ''}> 对局信息（点数、宝牌、副露、立直等，不含牌河和手牌）</label>
      <label>发送牌河 <select id="model-rivers"><option value="none">不发送</option><option value="all">所有玩家</option>${state.players.slice(0, state.scores.length === 3 ? 3 : 4).map((_, i) => `<option value="${i}">${escape(__MJ_OBSERVER_STATE_V1__.seatWind(state, i))}家 · 座位 ${i}</option>`).join('')}</select></label>
      <label><input id="model-hand" type="checkbox" ${selection.hand ? 'checked' : ''}> 自家手牌（需先选定自家座位）</label>
      <label>分析内容 <select id="model-task"><option value="both">危险牌 + 出牌建议</option><option value="danger">危险牌</option><option value="discard">建议打的牌</option></select></label>
      ${error ? `<p class="warn">${escape(error)}</p>` : ''}
      <div class="controls"><button id="model-run" ${!enabled || busy || !!error ? 'disabled' : ''}>${busy ? '正在分析…' : '发送所选数据并分析'}</button><button id="model-preview">${preview ? '收起' : '预览'}发送数据</button>${busy ? '<button id="model-cancel">取消</button>' : ''}</div>
      ${preview ? `<pre>${escape(payload || error)}</pre>` : ''}
      <div role="status" aria-live="polite">${failure ? `<p class="warn">${escape(failure)}</p>` : ''}
      ${result ? `<p class="${stale ? 'warn' : 'muted'}">${stale ? '局面或发送范围已变化，以下为旧结果，请重新分析。' : '对应点击分析时的局面快照'} · ${escape(result.model)} · ${escape(result.time)}</p><div class="result">${escape(result.text)}</div>` : ''}</div></section>`;
    const $ = id => container.querySelector('#' + id);
    $('model-rivers').value = selection.rivers; $('model-task').value = task;
    $('model-settings').onclick = event => { if (event.isTrusted) send({ type: 'model:settings' }).catch(() => { failure = '扩展连接失效，请刷新游戏。'; render(); }); };
    $('model-refresh').onclick = refresh;
    for (const [id, key] of [['model-game', 'game'], ['model-hand', 'hand']]) $(id).onchange = e => { selection[key] = e.target.checked; render(); };
    $('model-rivers').onchange = e => { selection.rivers = e.target.value; render(); };
    $('model-task').onchange = e => { task = e.target.value; result = null; render(); };
    $('model-preview').onclick = () => { preview = !preview; render(); };
    if (busy) $('model-cancel').onclick = () => {
      requestId++; busy = false; failure = '已取消分析。';
      send({ type: 'model:cancel' }).catch(() => {}); render();
    };
    $('model-run').onclick = async event => {
      if (!event.isTrusted) return;
      const id = ++requestId;
      try {
        const data = snapshot(), captured = fingerprint(); busy = true; failure = ''; result = null; render();
        const response = await send({ type: 'model:analyze', task, snapshot: data });
        if (id !== requestId) return;
        if (!response?.ok) throw new Error(response?.error || '模型请求失败，请刷新设置状态后重试。');
        result = { ...response, fingerprint: captured, time: new Date().toLocaleTimeString('zh-CN') };
      } catch (e) { if (id === requestId) failure = e.message; }
      finally { if (id === requestId) { busy = false; render(); } }
    };
  }
  globalThis.MJAnalysisPanel = { mount };
})();
