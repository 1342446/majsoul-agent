const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const H = require('../extension/history.js'), S = require('../extension/state.js');
const P = require('../extension/protocol.js'), F = require('./fixtures.js');
const opening = more => ({ ...P.decodeEvent('ActionNewRound', F.liveRound(), 'live'), step: 0, ...more });
const event = (kind, more) => ({ source: 'live', kind, ...more });
const finish = (state, more) => S.apply(state, event('Hule', { step: 2, scores: [33000,17000,25000,25000],
  winners: [{ seat: 0, tile: '7m', tsumo: false, han: 3, fu: 40 }], ...more }));

test('win decoding retains multi-winner settlement fields but no names or raw hand metadata', () => {
  const winner = seat => F.b(1, F.cat(F.n(4, seat), F.t(3, '0p'), F.n(11, 3), F.n(13, 40), F.t(14, 'SECRET_NAME')));
  const e = P.decodeEvent('ActionHule', F.cat(winner(0), winner(2), F.packed(2,[25000,25000,25000,25000]),
    F.packed(3,[3900,-7800,3900,0]), F.b(6,F.packed(1,[28900,17200,28900,25000]))), 'live');
  assert.equal(e.gameEnded, true); assert.equal(e.winners.length, 2);
  assert.deepEqual(e.oldScores, [25000,25000,25000,25000]);
  assert.equal(JSON.stringify(e).includes('SECRET_NAME'), false);
  const state = S.apply(S.apply(S.initial(), opening()), { ...e, step: 1 });
  assert.deepEqual(state.result.scores, [28900,17200,28900,25000]);
});

test('exhaustive draw combines score transfers, preserves tenpai and detects match end', () => {
  const score = changes => F.b(3,F.cat(F.packed(2,[25000,25000,25000,25000]),F.packed(3,changes)));
  const e = P.decodeEvent('RecordNoTile', F.cat(score([3000,-1000,-1000,-1000]),score([-1000,3000,-1000,-1000]),
    F.b(2,F.n(3,1)),F.b(2,F.n(3,0)),F.n(1,1),F.n(4,1)), 'replay');
  assert.deepEqual(e.scores,[27000,27000,23000,23000]);
  assert.deepEqual(e.tenpai,[true,false]); assert.equal(e.gameEnded,true); assert.equal(e.nagashi,true);
});

test('abortive draw applies confirmed riichi payment and explicit final scores', () => {
  const e=P.decodeEvent('ActionLiuJu',F.cat(F.n(1,2),F.b(5,F.cat(F.n(1,1),F.n(2,24000),F.n(3,1)))), 'live');
  const s=S.apply(S.apply(S.initial(),opening()),{...e,step:1});
  assert.equal(s.result.kind,'LiuJu'); assert.equal(s.result.reason,2);
  assert.equal(s.result.scores[1],24000); assert.equal(s.result.deltas[1],-1000);
});

test('round net change includes riichi deposits; new round resets current result without mutating saved snapshot', () => {
  let s=S.apply(S.initial(),opening());
  s=S.apply(s,event('DealTile',{seat:2,tile:'?',step:1,riichiSuccess:{seat:1,score:24000,sticks:1}}));
  s=finish(s,{scores:[33000,16000,25000,25000]});
  assert.deepEqual(s.result.deltas,[8000,-9000,0,0]);
  const match=H.addRound(H.create('live','game-1'),s);
  s=S.apply(s,opening({round:1,scores:[33000,16000,25000,25000]}));
  assert.equal(s.result,null); assert.deepEqual(s.startScores,[33000,16000,25000,25000]);
  assert.equal(match.rounds[0].snapshot.result.kind,'Hule');
});

test('missing settlement stays unknown until next opening supplies scores', () => {
  let s=S.apply(S.apply(S.initial(),opening()),event('NoTile',{step:1}));
  assert.equal(s.result.scoresKnown,false); assert.deepEqual(s.result.scores,[]);
  let match=H.addRound(H.create('live','game-2'),s);
  match=H.reconcile(match,[26000,24000,26000,24000]);
  assert.equal(match.rounds[0].snapshot.result.scoresKnown,true);
  assert.deepEqual(match.rounds[0].snapshot.result.deltas,[1000,-1000,1000,-1000]);
});

test('round keys keep repeat dealer honba separate and duplicate result notifications update one entry', () => {
  const s=finish(S.apply(S.initial(),opening()));
  let match=H.addRound(H.create('live','game-3'),s);
  match=H.addRound(match,s);
  assert.equal(match.rounds.length,1);
  const next=finish(S.apply(s,opening({honba:1})));
  match=H.addRound(match,next);
  assert.equal(match.rounds.length,2); assert.equal(match.rounds[1].key,'0:0:1');
  const interrupted=H.addRound(match,S.apply(next,opening({round:1})),Date.now(),true);
  assert.equal(interrupted.rounds[2].snapshot.result.kind,'Interrupted');
  assert.equal(interrupted.rounds[2].snapshot.complete,false);
});

test('new match markers and round regression separate games while dealer repeats remain in the same game', () => {
  const s=finish(S.apply(S.initial(),opening({round:2})));
  const match=H.addRound(H.create('live','game-4'),s);
  assert.equal(H.isNewMatch(match,s,opening({round:2,honba:1})),false);
  assert.equal(H.isNewMatch(match,s,opening({round:3})),false);
  assert.equal(H.isNewMatch(match,s,opening({round:0})),true);
  assert.equal(H.isNewMatch(match,s,event('MJStart')),true);
  const reset=S.apply(s,event('MJStart',{step:0}));
  assert.equal(reset.selfSeat,null); assert.equal(reset.result,null); assert.equal(reset.round,null);
});

test('replay import collects all rounds without changing the active replay cursor and repeated imports deduplicate', () => {
  const first={...opening(),source:'replay',hand:undefined,hands:[F.hand,F.hand,F.hand,F.hand]};
  const events=[first,{kind:'Hule',source:'replay',scores:[33000,17000,25000,25000],winners:[]},
    {...first,round:1,scores:[33000,17000,25000,25000]}, {kind:'NoTile',source:'replay',scores:[34000,16000,26000,24000],gameEnded:true}];
  const match=H.fromReplay(events,S,'replay-1');
  assert.equal(match.rounds.length,2); assert.equal(match.closed,true);
  assert.equal(match.rounds[0].snapshot.source,'replay');
  assert.deepEqual(match.rounds[0].snapshot.players[2].hand,F.hand);
  assert.equal(H.merge(H.merge([],match),H.fromReplay(events,S,'replay-1')).length,1);
  assert.equal(events[0].round,0);
});

test('stored history is allowlisted and survives JSON reload, with bounded match retention', () => {
  const s=finish(S.apply(S.initial(),opening()));
  s.apiKey='SECRET'; s.account={token:'SECRET'}; s.players[0].name='SECRET';
  const match=H.addRound(H.create('live','game-5'),s);
  match.extra='SECRET'; match.rounds[0].raw='SECRET';
  const safe=H.sanitizeMatch(JSON.parse(JSON.stringify(match)));
  assert.equal(JSON.stringify(safe).includes('SECRET'),false);
  assert.deepEqual(safe.rounds[0].snapshot.result.scores,[33000,17000,25000,25000]);
  let all=[];
  for(let i=0;i<25;i++) all=H.merge(all,{...safe,id:'game-'+i,startedAt:Date.now()+i,updatedAt:Date.now()+i});
  assert.equal(all.length,20); assert.equal(all[0].id,'game-24');
});

test('worker serializes history updates, isolates model credentials and authenticates the sender', async () => {
  let listener; const stored={modelConfig:{apiKey:'SECRET'}};
  const chrome={runtime:{id:'test-extension',onMessage:{addListener(fn){listener=fn;}}},storage:{local:{
    async get(key){return {[key]:structuredClone(stored[key])};},
    async set(values){Object.assign(stored,structuredClone(values));}
  }}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/history-storage.js'),'utf8'),{chrome,MJHistory:H,URL,Promise});
  const sender={id:'test-extension',frameId:0,tab:{id:1},url:'https://game.maj-soul.com/1/'};
  const send=(message,from=sender)=>new Promise(resolve=>{const waiting=listener(message,from,resolve);if(!waiting)resolve(undefined);});
  const s=finish(S.apply(S.initial(),opening()));
  const a=H.addRound(H.create('live','game-a'),s), b=H.addRound(H.create('live','game-b'),s);
  const replies=await Promise.all([send({type:'history:save',match:a}),send({type:'history:save',match:b})]);
  assert.ok(replies.every(r=>r.ok)); assert.equal(stored.roundHistoryV1.length,2);
  const loaded=await send({type:'history:load'});
  assert.equal(loaded.matches.length,2); assert.equal(JSON.stringify(loaded).includes('SECRET'),false);
  assert.equal(stored.modelConfig.apiKey,'SECRET');
  assert.equal(await send({type:'history:save',match:a},{...sender,url:'https://evil.example/'}),undefined);
});


test('history snapshots and JSON reload preserve unknown discard methods and legacy boolean values', () => {
  const s = finish(S.apply(S.initial(), opening()));
  const values = [true, false, undefined, null, 0, 1, 'false'];
  s.players[0].discards = values.map(tsumogiri => ({ tile: '1m', tsumogiri }));
  const expected = [true, false, null, null, null, null, null];
  assert.deepEqual(H.snapshot(s).players[0].discards.map(d => d.tsumogiri), expected);
  // Sanitize raw saved records as well as newly captured snapshots.
  const raw = H.create('live', 'discard-semantics');
  raw.rounds = [{ snapshot: s, recordedAt: Date.now() }];
  const reloaded = H.sanitizeMatch(JSON.parse(JSON.stringify(raw)));
  const saved = H.addRound(reloaded, s);
  const exported = JSON.parse(JSON.stringify(H.sanitizeMatch(saved)));
  assert.deepEqual(exported.rounds[0].snapshot.players[0].discards.map(d => d.tsumogiri), expected);
});

test('river and event rendering distinguish unknown, tedashi and tsumogiri including saved history', () => {
  const context = {
    __MJ_OBSERVER_STATE_V1__: S, MJHistory: H, URL, location: { href: 'https://example.test/preview.html' },
    document: { getElementById: () => null, documentElement: null, addEventListener() {} },
    window: { addEventListener() {} }
  };
  const source = fs.readFileSync(require.resolve('../extension/overlay.js'), 'utf8');
  vm.runInNewContext(source, context);
  context.views = context.MJCollectorPanel.create({ controller: { subscribe() { return () => {}; } } }).renderers;
  const methods = [[true, '摸切'], [false, '手切'], [null, '切牌方式未知'], [undefined, '切牌方式未知']];
  for (const [tsumogiri, label] of methods) {
    const discard = { tile: '1m', tsumogiri };
    const html = context.views.riverHtml({ discards: [discard] }, 'saved river');
    assert.ok(html.includes('title="' + label + '"'));
    assert.ok(html.includes('<small>' + label + '</small>'));
    assert.ok(context.views.eventHtml({ ...discard, kind: 'DiscardTile' }).endsWith(' · ' + label));
  }
  const called = context.views.riverHtml({ discards: [{ tile: '1m', called: true, tsumogiri: null }] }, 'river');
  assert.ok(called.includes('已被鸣牌；切牌方式未知'));
  assert.ok(called.includes('<small>已鸣</small>'));
});
