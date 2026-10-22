/* Runs only in the extension service worker. History never shares the model settings key. */
'use strict';
let historyWrites = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['history:load', 'history:save'].includes(message?.type)) return;
  let game = false;
  try { const u = new URL(sender.url); game = sender.id === chrome.runtime.id && !!sender.tab && sender.frameId === 0 && u.origin === 'https://game.maj-soul.com'; } catch (_) {}
  if (!game) return;
  const work = async () => {
    const { roundHistoryV1 = [] } = await chrome.storage.local.get('roundHistoryV1');
    if (message.type === 'history:load') return { ok: true, matches: roundHistoryV1 };
    if (typeof message.match !== 'object' || JSON.stringify(message.match).length > 1000000) throw new Error('整场记录过大');
    const matches = MJHistory.merge(roundHistoryV1, message.match);
    await chrome.storage.local.set({ roundHistoryV1: matches });
    return { ok: true, matches };
  };
  const operation = historyWrites.then(work);
  historyWrites = operation.catch(() => {});
  operation.then(respond).catch(() => respond({ ok: false, error: '本地记录保存或读取失败，请导出核对记录备份。' }));
  return true;
});
