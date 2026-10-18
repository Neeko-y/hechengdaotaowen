// engine.js — 长兴麻将权威牌局引擎（无界面 / 无机器人 / 座位无关）
// 本地单人模式(js/game.js)与联机主机端(js/host.js)共用；规则判定见 js/rules.js。
import { createWall, sortHand, sameTile, isWhite, tileLabel } from './tiles.js';
import {
  evaluateWin, scoreWin, canPeng, canMingGang, canAnGang, canAddGang, canChi,
  resolveDiscardWinners, hasFourWhite, isSpecialTing,
} from './rules.js';

export function createEngine({ dealer = 0 } = {}) {
  const state = {
    players: [],
    wall: [],
    turn: dealer,
    dealer,
    round: 0,
    phase: 'idle',
    issued: false,
    pending: null,
    lastDiscard: null,
    drawn: null,
    gangKai: false,
    awaiting: null,
    winnerSeat: null,
    result: null,
    log: [],
  };

  let listener = () => {};
  const emit = () => listener(state);
  function log(msg) {
    state.log.push(msg);
    if (state.log.length > 80) state.log.shift();
  }
  function sortAll() {
    for (const p of state.players) p.hand = sortHand(p.hand);
  }

  function initPlayers() {
    state.players = [];
    for (let i = 0; i < 4; i++) {
      state.players.push({ seat: i, name: `玩家${i + 1}`, hand: [], melds: [], discards: [], score: 0 });
    }
  }

  function addGangOptions(p) {
    const out = [];
    for (const m of p.melds) {
      if (canAddGang(p.hand, m)) out.push({ kind: 'add', tiles: [m.tiles[0]], meld: m });
    }
    for (const four of canAnGang(p.hand)) out.push({ kind: 'an', tiles: four });
    return out;
  }

  function startRound() {
    state.round += 1;
    state.wall = createWall();
    state.turn = state.dealer;
    state.phase = 'idle';
    state.pending = null;
    state.lastDiscard = null;
    state.drawn = null;
    state.gangKai = false;
    state.awaiting = null;
    state.winnerSeat = null;
    state.result = null;
    state.log = [];
    for (const p of state.players) { p.hand = []; p.melds = []; p.discards = []; }
    for (let r = 0; r < 13; r++) for (let i = 0; i < 4; i++) state.players[i].hand.push(state.wall.pop());
    state.players[state.dealer].hand.push(state.wall.pop());
    sortAll();
    log(`第 ${state.round} 局开始`);
    enterDiscard(state.dealer, { draw: false, isFirst: true });
  }

  function drawTile(seat) {
    if (state.wall.length === 0) return null;
    const t = state.wall.pop();
    state.players[seat].hand.push(t);
    state.players[seat].hand = sortHand(state.players[seat].hand);
    state.drawn = t;
    return t;
  }

  function enterDiscard(seat, { draw = true, isFirst = false, gangKai = false } = {}) {
    state.gangKai = gangKai;
    state.pending = null;
    const p = state.players[seat];
    if (draw) {
      const t = drawTile(seat);
      if (!t) return endDraw();
    }
    state.turn = seat;
    let win = null;
    if (draw || isFirst) {
      let boTou = false;
      if (draw && state.drawn) {
        const pre = p.hand.filter((t) => t.id !== state.drawn.id);
        boTou = isSpecialTing(pre, p.melds);
      }
      win = evaluateWin(p.hand, p.melds, null, { selfDraw: true, isTianHu: isFirst, gangKai, boTou });
    }
    if (!win && hasFourWhite(p.hand, p.melds)) {
      win = evaluateWin(p.hand, p.melds, null, { selfDraw: true });
    }
    if (win && (win.patterns.includes('四白板') || win.patterns.includes('天胡') || win.patterns.includes('爆头'))) {
      return finishWin(seat, win, { selfDraw: true });
    }
    state.awaiting = { seat, kind: 'discard', canHu: !!win, huPatterns: win ? win.patterns : [], gangs: addGangOptions(p) };
    state.phase = 'awaiting';
    emit();
  }

  function nextTurn(fromSeat) {
    enterDiscard((fromSeat + 1) % 4, { draw: true });
  }

  function doDiscard(seat, index) {
    const p = state.players[seat];
    if (index < 0 || index >= p.hand.length) return;
    const tile = p.hand[index];
    p.hand.splice(index, 1);
    p.discards.push(tile);
    state.lastDiscard = { tile, seat };
    state.drawn = null;
    state.awaiting = null;
    log(`${p.name} 打出 ${tileLabel(tile)}`);
    const resp = evaluateResponse(seat, tile, []);
    if (!resp) return nextTurn(seat);
    setRespond(resp, seat, tile);
  }

  function claimsFor(seat, tile, discarderSeat) {
    const p = state.players[seat];
    const res = { hu: false, gang: false, peng: false, chi: false };
    if (!isWhite(tile)) {
      const test = p.hand.concat([{ id: '__d__', suit: tile.suit, rank: tile.rank }]);
      if (evaluateWin(test, p.melds, tile, { selfDraw: false })) res.hu = true;
    }
    if (canMingGang(p.hand, tile)) res.gang = true;
    if (canPeng(p.hand, tile)) res.peng = true;
    if (seat === (discarderSeat + 1) % 4 && canChi(p.hand, tile).length) res.chi = true;
    return res;
  }

  function evaluateResponse(d, tile, exclude) {
    const dist = (s) => (s - d + 4) % 4;
    const claims = [];
    for (let i = 0; i < 4; i++) {
      if (i === d || exclude.includes(i)) continue;
      claims.push({ seat: i, ...claimsFor(i, tile, d) });
    }
    const hu = claims.filter((c) => c.hu);
    if (hu.length) return { type: 'hu', seat: resolveDiscardWinners(null, d, hu.map((c) => c.seat)) };
    const gang = claims.filter((c) => c.gang).sort((a, b) => dist(a.seat) - dist(b.seat));
    if (gang.length) return { type: 'gang', seat: gang[0].seat };
    const peng = claims.filter((c) => c.peng).sort((a, b) => dist(a.seat) - dist(b.seat));
    if (peng.length) return { type: 'peng', seat: peng[0].seat };
    const chi = claims.filter((c) => c.chi);
    if (chi.length) return { type: 'chi', seat: chi[0].seat };
    return null;
  }

  function setRespond(resp, d, tile) {
    state.pending = { type: resp.type, seat: resp.seat, discarderSeat: d, tile };
    state.awaiting = {
      seat: resp.seat, kind: 'respond', options: claimsFor(resp.seat, tile, d), discarderSeat: d, tile,
    };
    state.phase = 'awaiting';
    emit();
  }

  function removeFromDiscards(seat, tile) {
    const d = state.players[seat].discards;
    for (let i = d.length - 1; i >= 0; i--) {
      if (d[i].id === tile.id) { d.splice(i, 1); return; }
    }
  }

  function takeExact(p, tile, count) {
    const taken = [];
    for (let i = p.hand.length - 1; i >= 0 && taken.length < count; i--) {
      if (sameTile(p.hand[i], tile)) taken.push(p.hand.splice(i, 1)[0]);
    }
    return taken;
  }

  function applyPeng(seat, tile, d) {
    const p = state.players[seat];
    const taken = takeExact(p, tile, 2);
    p.melds.push({ type: 'peng', tiles: [...taken, tile], from: d });
    removeFromDiscards(d, tile);
    log(`${p.name} 碰 ${tileLabel(tile)}`);
    enterDiscard(seat, { draw: false });
  }

  function applyMingGang(seat, tile, d) {
    const p = state.players[seat];
    const taken = takeExact(p, tile, 3);
    p.melds.push({ type: 'minggang', tiles: [...taken, tile], from: d });
    removeFromDiscards(d, tile);
    log(`${p.name} 明杠 ${tileLabel(tile)}`);
    enterDiscard(seat, { draw: true, gangKai: true });
  }

  function applyChi(seat, tile, d) {
    const p = state.players[seat];
    const opts = canChi(p.hand, tile);
    if (!opts.length) return;
    const use = opts[0].tiles;
    for (const u of use) {
      const i = p.hand.findIndex((t) => t.id === u.id);
      if (i >= 0) p.hand.splice(i, 1);
    }
    p.melds.push({ type: 'chi', tiles: [...use, tile], from: d });
    removeFromDiscards(d, tile);
    log(`${p.name} 吃 ${tileLabel(tile)}`);
    enterDiscard(seat, { draw: false });
  }

  function applyAnGang(seat, tiles) {
    const p = state.players[seat];
    const taken = takeExact(p, tiles[0], 4);
    p.melds.push({ type: 'angang', tiles: taken });
    log(`${p.name} 暗杠`);
    enterDiscard(seat, { draw: true, gangKai: true });
  }

  function applyAddGang(seat, tile, meld) {
    const p = state.players[seat];
    const taken = takeExact(p, tile, 1);
    meld.type = 'bugang';
    meld.tiles.push(taken[0]);
    log(`${p.name} 补杠 ${tileLabel(tile)}`);
    enterDiscard(seat, { draw: true, gangKai: true });
  }

  function finishWin(seat, winResult, ctx) {
    const p = state.players[seat];
    const winTile = ctx.selfDraw ? state.drawn : ctx.tile;
    if (!ctx.selfDraw && ctx.tile) {
      if (!p.hand.some((t) => t.id === ctx.tile.id)) p.hand.push(ctx.tile);
      p.hand = sortHand(p.hand);
      removeFromDiscards(ctx.discarderSeat, ctx.tile);
    }
    const r = winResult || evaluateWin(p.hand, p.melds, ctx.tile || null, {
      selfDraw: !!ctx.selfDraw, gangKai: state.gangKai,
    });
    if (!r) { state.phase = 'over'; return emit(); }
    const { deltas, breakdown } = scoreWin(r, {
      selfDraw: !!ctx.selfDraw, winnerSeat: seat, discarderSeat: ctx.discarderSeat,
    });
    for (let i = 0; i < 4; i++) state.players[i].score += deltas[i];
    state.phase = 'over';
    state.awaiting = null;
    state.winnerSeat = seat;
    state.result = {
      deltas, breakdown, patterns: r.patterns, selfDraw: !!ctx.selfDraw,
      winSeat: seat,
      winHand: p.hand.map((t) => ({ id: t.id, suit: t.suit, rank: t.rank })),
      winMelds: p.melds.map((m) => ({ type: m.type, tiles: m.tiles.map((t) => ({ id: t.id, suit: t.suit, rank: t.rank })) })),
      winTileId: winTile ? winTile.id : null,
    };
    log(`${p.name} ${ctx.selfDraw ? '自摸' : '和牌'}：${breakdown}`);
    emit();
  }

  function endDraw() {
    state.phase = 'over';
    state.awaiting = null;
    state.result = { draw: true, breakdown: '荒庄（牌墙摸完）' };
    log('荒庄');
    emit();
  }

  function dispatch(seat, action) {
    const a = state.awaiting;
    if (!a || a.seat !== seat) return;
    if (a.kind === 'discard') {
      if (action.type === 'discard') return doDiscard(seat, action.index);
      if (action.type === 'hu') {
        const r = evaluateWin(state.players[seat].hand, state.players[seat].melds, null, { selfDraw: true, gangKai: state.gangKai });
        if (r) return finishWin(seat, r, { selfDraw: true });
        return;
      }
      if (action.type === 'gang') {
        const g = a.gangs[action.index ?? 0];
        if (!g) return;
        return g.kind === 'an' ? applyAnGang(seat, g.tiles) : applyAddGang(seat, g.tiles[0], g.meld);
      }
      return;
    }
    const { discarderSeat: d, tile, options } = a;
    if (action.action === 'hu' && options.hu) return finishWin(seat, null, { selfDraw: false, discarderSeat: d, tile });
    if (action.action === 'peng' && options.peng) return applyPeng(seat, tile, d);
    if (action.action === 'gang' && options.gang) return applyMingGang(seat, tile, d);
    if (action.action === 'chi' && options.chi) return applyChi(seat, tile, d);
    const resp = evaluateResponse(d, tile, [seat]);
    if (!resp) return nextTurn(d);
    setRespond(resp, d, tile);
  }

  function getState() {
    return state;
  }

  function getView(seat) {
    const mine = state.awaiting && state.awaiting.seat === seat ? state.awaiting : null;
    return {
      you: seat,
      round: state.round,
      wall: { length: state.wall.length },
      turn: state.turn,
      dealer: state.dealer,
      phase: state.phase,
      lastDiscard: state.lastDiscard,
      drawn: state.turn === seat ? state.drawn : null,
      awaiting: mine,
      winnerSeat: state.winnerSeat,
      result: state.result,
      players: state.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        score: p.score,
        handCount: p.hand.length,
        hand: p.seat === seat ? p.hand : undefined,
        melds: p.melds,
        discards: p.discards,
      })),
    };
  }

  function setName(seat, name) {
    if (state.players[seat]) state.players[seat].name = name;
  }

  initPlayers();

  return { dispatch, getState, getView, subscribe: (fn) => { listener = fn; }, setName, newRound: startRound, begin: startRound };
}
