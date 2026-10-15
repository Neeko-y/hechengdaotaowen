import { sameTile, isWhite } from './tiles.js';

export function botChooseDiscard(hand) {
  let best = 0;
  let bestScore = Infinity;
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i];
    let sc;
    if (isWhite(t)) {
      sc = 100;
    } else {
      const same = hand.filter((x) => sameTile(x, t)).length;
      let near = 0;
      for (const x of hand) {
        if (x.suit === t.suit && !isWhite(x) && x.rank !== t.rank && Math.abs(x.rank - t.rank) <= 2) near++;
      }
      sc = same * 3 + near;
    }
    if (sc < bestScore) { bestScore = sc; best = i; }
  }
  return best;
}

export function botAction(a, state) {
  if (a.kind === 'discard') {
    if (a.canHu) return { type: 'hu' };
    if (a.gangs.length) return { type: 'gang', index: 0 };
    return { type: 'discard', index: botChooseDiscard(state.players[a.seat].hand) };
  }
  const o = a.options;
  if (o.hu) return { type: 'respond', action: 'hu' };
  if (o.gang) return { type: 'respond', action: 'gang' };
  if (o.peng) return { type: 'respond', action: 'peng' };
  return { type: 'respond', action: 'pass' };
}
