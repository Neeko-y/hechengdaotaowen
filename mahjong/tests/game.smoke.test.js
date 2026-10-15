// tests/game.smoke.test.js — 状态机冒烟：自动打完整局，确保不崩溃、能结算
import { test, expect } from 'bun:test';
import { createGame } from '../js/game.js';

function autoPlay(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const game = createGame({ botDelay: 0 });
    const start = Date.now();
    let done = false;
    game.subscribe((state) => {
      if (done) return;
      if (Date.now() - start > timeoutMs) { done = true; return reject(new Error('timeout')); }
      if (state.phase === 'over') { done = true; return resolve(state); }
      const a = state.awaiting;
      if (a?.kind === 'discard') {
        const idx = state.players[0].hand.length - 1;
        queueMicrotask(() => game.dispatch({ type: 'discard', index: idx }));
      } else if (a?.kind === 'respond') {
        const o = a.options;
        const action = o.hu ? 'hu' : o.gang ? 'gang' : o.peng ? 'peng' : o.chi ? 'chi' : 'pass';
        queueMicrotask(() => game.dispatch({ type: 'respond', action }));
      }
    });
  });
}

test('单机对局可跑到结束并结算', async () => {
  const s = await autoPlay();
  expect(s.phase).toBe('over');
  expect(s.result).toBeTruthy();
  const scored = s.players.reduce((a, p) => a + p.score, 0);
  expect(scored).toBe(s.players[0].score + s.players[1].score + s.players[2].score + s.players[3].score);
}, 15000);

test('连打多局不崩溃', async () => {
  for (let i = 0; i < 5; i++) {
    const s = await autoPlay();
    expect(s.phase).toBe('over');
  }
}, 30000);
