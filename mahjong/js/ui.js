// ui.js — 大厅 + 牌桌渲染与交互；渲染本地/联机统一的 view
import { createGame } from './game.js';
import { createHostSession, createClientSession } from './net.js';
import { tileLabel, isWhite } from './tiles.js';

const root = document.getElementById('app');
const SUIT_CHAR = { m: '万', p: '筒', s: '条' };
const SEAT_POS = ['bottom', 'right', 'top', 'left'];

let session = null;
let lastView = null;
let openMelds = null;

function face(t, small, extra = '') {
  const honor = t.suit !== 'z' ? '' : t.rank === 5 ? ' red' : t.rank === 6 ? ' green' : '';
  const cls = `tile${small ? ' small' : ''}${isWhite(t) ? ' white' : ''} ${t.suit}${honor}${extra ? ' ' + extra : ''}`;
  const inner = t.suit === 'z'
    ? `<span class="zh">${tileLabel(t)}</span>`
    : `<span class="num">${t.rank}</span><span class="suit">${SUIT_CHAR[t.suit]}</span>`;
  return `<div class="${cls}">${inner}</div>`;
}

function meldsHtml(p) {
  if (!p.melds.length) return '';
  return `<div class="melds">${p.melds
    .map((m) => `<div class="meld">${m.tiles.map((t) => face(t, true)).join('')}</div>`)
    .join('')}</div>`;
}

function discardsHtml(p) {
  return `<div class="discards">${p.discards.map((t) => face(t, true)).join('')}</div>`;
}

function seatPanel(p, state) {
  const rel = ((p.seat - (state.you ?? 0)) + 4) % 4;
  const pos = SEAT_POS[rel];
  const active = state.turn === p.seat && state.phase !== 'over';
  const isSelf = rel === 0;
  const dealerTag = p.seat === state.dealer ? ' <i>庄</i>' : '';
  const scoreTag = ` · <span class="score">${p.score} 分</span>`;
  const turnTag = active ? ' · <span class="turn">▶</span>' : '';
  if (isSelf) {
    const meta = `<div class="meta"><b>${p.name}</b>${dealerTag}${scoreTag}${turnTag}</div>`;
    const hand = `<div class="hand">${(p.hand || [])
      .map((t, i) => `<div class="slot" data-idx="${i}">${face(t)}</div>`)
      .join('')}</div>`;
    return `<div class="seat ${pos} human ${active ? 'active' : ''}">${meta}${meldsHtml(p)}${hand}${discardsHtml(p)}</div>`;
  }
  const peek = p.melds.length ? ` <span class="peek">副露${p.melds.length}</span>` : '';
  const meta = `<div class="meta clickable" data-pmelds="${p.seat}"><b>${p.name}</b>${dealerTag}${scoreTag}${turnTag}${peek}</div>`;
  const backs = `<div class="hand backs">${Array.from({ length: p.handCount }, () => '<div class="tile small back"></div>').join('')}</div>`;
  return `<div class="seat ${pos} ${active ? 'active' : ''}">${meta}${backs}${discardsHtml(p)}</div>`;
}

function actionsHtml(state) {
  const a = state.awaiting;
  const btns = [];
  if (a?.kind === 'discard') {
    if (a.canHu) btns.push(`<button data-act="hu" class="primary">胡</button>`);
    (a.gangs || []).forEach((g, i) => btns.push(`<button data-act="gang" data-idx="${i}">杠</button>`));
    if (!btns.length) btns.push(`<span class="hint">轮到你出牌 · 点一张手牌打出</span>`);
    else btns.push(`<span class="hint">点手牌出牌，或选择上方操作</span>`);
  } else if (a?.kind === 'respond') {
    const o = a.options;
    if (o.hu) btns.push(`<button data-act="r-hu" class="primary">胡</button>`);
    if (o.gang) btns.push(`<button data-act="r-gang">杠</button>`);
    if (o.peng) btns.push(`<button data-act="r-peng">碰</button>`);
    if (o.chi) btns.push(`<button data-act="r-chi">吃</button>`);
    btns.push(`<button data-act="r-pass">过</button>`);
  } else if (state.phase === 'over') {
    btns.push(`<button data-act="restart" class="primary">再来一局</button>`);
    if (session && session.mode !== 'local') btns.push(`<button data-act="lobby">退出房间</button>`);
  } else {
    btns.push(`<span class="hint">等待其他玩家…</span>`);
  }
  return `<div class="actions">${btns.join('')}</div>`;
}

function resultHtml(state) {
  if (state.phase !== 'over') return '';
  const r = state.result || {};
  const winner = state.winnerSeat != null ? state.players[state.winnerSeat].name : '';
  const title = r.draw
    ? '荒庄'
    : `${winner} ${r.selfDraw ? '自摸' : '和牌'}${r.patterns?.length ? ' · ' + r.patterns.join('+') : ''}`;
  const rows = state.players
    .map((p) => `<div class="rrow"><span>${p.name}</span><span class="${(r.deltas?.[p.seat] ?? 0) >= 0 ? 'pos' : 'neg'}">${(r.deltas?.[p.seat] ?? 0) >= 0 ? '+' : ''}${r.deltas?.[p.seat] ?? 0}</span></div>`)
    .join('');
  const totals = `总分：${state.players.map((p) => `${p.name} ${p.score}`).join(' · ')}`;
  const winHand = (!r.draw && r.winHand)
    ? `<div class="winhand">${[...(r.winMelds || []).flatMap((m) => m.tiles || []), ...r.winHand]
        .map((t) => face(t, true, t.id != null && t.id === r.winTileId ? 'win' : ''))
        .join('')}</div>`
    : '';
  return `<div class="modal"><div class="card"><h2>${title}</h2><p class="bd">${r.breakdown || ''}</p>${winHand}<div class="total">${totals}</div>${rows}<button data-act="restart" class="primary">再来一局</button></div></div>`;
}

function renderTable(state) {
  const center = `<div class="center">
      <div class="wallinfo">第 ${state.round} 局 · 牌墙 ${state.wall.length}</div>
      <div class="lastdiscard">${state.lastDiscard ? face(state.lastDiscard.tile) : ''}</div>
    </div>`;
  const seats = state.players.map((p) => seatPanel(p, state)).join('');
  root.innerHTML = `<div class="board">${seats}${center}</div>${actionsHtml(state)}${resultHtml(state)}${meldsPopHtml(state)}`;
  bind(state);
}

function meldsPopHtml(state) {
  if (openMelds == null) return '';
  const p = state.players.find((x) => x.seat === openMelds);
  if (!p) return '';
  const body = p.melds.length
    ? p.melds.map((m) => `<div class="meld">${m.tiles.map((t) => face(t, true)).join('')}</div>`).join('')
    : '<span class="hint">暂无副露</span>';
  return `<div class="melds-pop-back" data-pclose="1"><div class="melds-pop"><h3>${p.name} 的副露</h3><div class="melds">${body}</div></div></div>`;
}

function renderLobby(err = '') {
  root.innerHTML = `<div class="lobby">
      <h1>长兴麻将</h1>
      <button data-lobby="local">单机（对电脑）</button>
      <button data-lobby="host" class="primary">创建房间</button>
      <button data-lobby="join">加入房间</button>
      ${err ? `<p class="status err">${err}</p>` : ''}
    </div>`;
  bindLobby();
}

function renderHostPanel() {
  const code = session.roomCode;
  const url = `${location.origin}${location.pathname}?join=${code}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
  root.innerHTML = `<div class="lobby">
      <h1>房间号 <b class="code">${code}</b></h1>
      <img class="qr" src="${qr}" alt="扫码加入" />
      <p class="hint">其他人同一 WiFi 打开「${location.host}」或扫码，输入房间号加入</p>
      <p class="status">已就座：${session.playerCount()} 人（空位由电脑补）</p>
      <button data-lobby="start" class="primary">开始游戏</button>
      <button data-lobby="back">返回</button>
    </div>`;
  bindLobby();
}

function renderClientStatus(v) {
  const s = (v && v.status) || 'connecting';
  const msg = {
    connecting: '正在连接房主…',
    waiting: '已加入，等待房主开始…',
    playing: '同步中…',
    full: '房间已满',
    closed: '连接已断开',
  }[s] || (String(s).startsWith('error') ? '连接失败（' + String(s).slice(6) + '）' : '…');
  root.innerHTML = `<div class="lobby"><h1>长兴麻将</h1><p class="status">${msg}</p><button data-lobby="back">返回</button></div>`;
  bindLobby();
}

function bindLobby() {
  root.querySelectorAll('[data-lobby]').forEach((b) => b.addEventListener('click', () => onLobby(b.dataset.lobby)));
}

function startSession(factory) {
  if (typeof Peer === 'undefined') {
    renderLobby('PeerJS 未加载，请检查网络后强制刷新');
    return;
  }
  try {
    session = factory();
    session.subscribe(onView);
  } catch (e) {
    session = null;
    renderLobby('连接失败：' + ((e && e.message) || e));
  }
}

function onLobby(act) {
  openMelds = null;
  if (act === 'local') {
    session = createGame();
    session.subscribe(onView);
  } else if (act === 'host') {
    startSession(() => createHostSession({ name: '房主', onRoom: () => render() }));
  } else if (act === 'join') {
    const code = (prompt('输入房间号') || '').trim().toUpperCase();
    if (code) startSession(() => createClientSession({ code, name: '玩家' }));
  } else if (act === 'start') {
    session.start();
  } else if (act === 'back') {
    location.href = location.pathname;
  }
}

function onView(view) {
  lastView = view;
  render();
}

function render() {
  if (!session) { renderLobby(); return; }
  const v = lastView;
  if (session.mode === 'client' && (!v || v.status !== 'playing')) { renderClientStatus(v); return; }
  if (session.mode === 'host' && !session.started) { renderHostPanel(); return; }
  if (!v || !v.players) { renderClientStatus(v); return; }
  renderTable(v);
}

function bind(state) {
  root.querySelectorAll('.human .slot').forEach((slot) => {
    slot.addEventListener('click', () => {
      if (state.awaiting?.kind === 'discard') {
        session.dispatch({ type: 'discard', index: Number(slot.dataset.idx) });
      }
    });
  });
  root.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'hu') session.dispatch({ type: 'hu' });
      else if (act === 'gang') session.dispatch({ type: 'gang', index: Number(b.dataset.idx || 0) });
      else if (act === 'r-hu') session.dispatch({ type: 'respond', action: 'hu' });
      else if (act === 'r-gang') session.dispatch({ type: 'respond', action: 'gang' });
      else if (act === 'r-peng') session.dispatch({ type: 'respond', action: 'peng' });
      else if (act === 'r-chi') session.dispatch({ type: 'respond', action: 'chi' });
      else if (act === 'r-pass') session.dispatch({ type: 'respond', action: 'pass' });
      else if (act === 'restart') session.dispatch({ type: 'restart' });
      else if (act === 'lobby') location.href = location.pathname;
    });
  });
  root.querySelectorAll('[data-pmelds]').forEach((el) => {
    el.addEventListener('click', () => {
      const s = Number(el.dataset.pmelds);
      openMelds = openMelds === s ? null : s;
      render();
    });
  });
  const pop = root.querySelector('.melds-pop');
  if (pop) pop.addEventListener('click', (e) => e.stopPropagation());
  const back = root.querySelector('.melds-pop-back');
  if (back) back.addEventListener('click', () => { openMelds = null; render(); });
}

const join = new URLSearchParams(location.search).get('join');
if (join) {
  session = createClientSession({ code: join.toUpperCase(), name: '玩家' });
  session.subscribe(onView);
} else {
  renderLobby();
}
