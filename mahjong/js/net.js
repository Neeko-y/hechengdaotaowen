import { createEngine } from './engine.js';
import { botAction } from './bot.js';

const PREFIX = 'cxmj-';
const FALLBACK_NAMES = ['你', '电脑·南', '电脑·西', '电脑·北'];

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randomToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function loadToken(code) {
  try { return localStorage.getItem('mj-token-' + code); } catch { return null; }
}
function saveToken(code, token) {
  try {
    localStorage.setItem('mj-token-' + code, token);
    return true;
  } catch {
    return false;
  }
}

export function createHostSession({ name = '房主', onRoom } = {}) {
  const engine = createEngine();
  engine.setName(0, name);
  const code = randomCode();
  const peer = new Peer(PREFIX + code);
  const conns = new Map();
  const seatToken = [null, null, null, null];
  const tokenSeat = new Map();
  let uiListener = () => {};
  let timer = null;
  let started = false;

  function firstFreeSeat() {
    for (let s = 1; s < 4; s++) if (!conns.has(s)) return s;
    return null;
  }

  function refresh() {
    uiListener(engine.getView(0));
  }

  function broadcast() {
    for (const [seat, conn] of conns) {
      if (conn.open) conn.send({ type: 'view', view: engine.getView(seat) });
    }
  }

  function onChange(state) {
    if (state.phase === 'over') {
      for (let s = 1; s < 4; s++) if (!conns.has(s)) state.ready[s] = true;
    }
    refresh();
    broadcast();
    const a = state.awaiting;
    if (!a || a.seat === 0 || conns.has(a.seat)) return;
    clearTimeout(timer);
    const seat = a.seat;
    timer = setTimeout(() => {
      if (conns.has(seat)) return;
      const cur = engine.getState().awaiting;
      if (!cur || cur.seat !== seat) return;
      engine.dispatch(seat, botAction(cur, engine.getState()));
    }, 500);
  }

  engine.subscribe(onChange);

  peer.on('open', () => { if (onRoom) onRoom(code); });
  peer.on('error', (e) => {
    for (const conn of conns.values()) conn.send({ type: 'error', message: e.type });
  });
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      const meta = conn.metadata || {};
      const tok = typeof meta.token === 'string' ? meta.token : null;
      let seat = null;
      if (tok && tokenSeat.has(tok)) {
        const s = tokenSeat.get(tok);
        if (!conns.has(s)) seat = s;
      }
      if (seat == null && !started) seat = firstFreeSeat();
      if (seat == null) {
        conn.send({ type: 'full' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      conn.__seat = seat;
      conns.set(seat, conn);
      let token = seatToken[seat];
      if (!token) {
        token = randomToken();
        seatToken[seat] = token;
        tokenSeat.set(token, seat);
      }
      engine.setName(seat, meta.name || FALLBACK_NAMES[seat]);
      conn.send({ type: 'welcome', seat, code, token, started });
      refresh();
      broadcast();
    });
    conn.on('data', (msg) => {
      if (!msg || conn.__seat == null) return;
      if (msg.type === 'action') {
        const act = msg.action || {};
        if (act.type === 'restart') {
          if (conn.__seat === 0 && engine.getState().ready.every(Boolean)) engine.newRound();
        } else if (act.type === 'ready') {
          engine.setReady(conn.__seat, true);
        } else {
          engine.dispatch(conn.__seat, act);
        }
      } else if (msg.type === 'name') {
        engine.setName(conn.__seat, msg.name);
        refresh();
        broadcast();
      }
    });
    conn.on('close', () => {
      if (conn.__seat != null) {
        conns.delete(conn.__seat);
        refresh();
      }
    });
  });

  return {
    mode: 'host',
    get roomCode() { return code; },
    get started() { return started; },
    playerCount: () => 1 + conns.size,
    getState: () => engine.getView(0),
    dispatch: (action) => {
      if (action.type === 'restart') {
        if (engine.getState().ready.every(Boolean)) engine.newRound();
        return;
      }
      if (action.type === 'ready') return engine.setReady(0, true);
      engine.dispatch(0, action);
    },
    subscribe: (fn) => { uiListener = fn; fn(engine.getView(0)); },
    start: () => {
      if (started) return;
      started = true;
      engine.begin();
      broadcast();
      refresh();
    },
  };
}

export function createClientSession({ code, name = '玩家' } = {}) {
  const peer = new Peer();
  let conn = null;
  let view = null;
  let listener = () => {};
  let mySeat = null;
  let status = 'connecting';
  let token = loadToken(code);

  function snapshot() {
    return Object.assign({}, view || {}, { you: mySeat, status, mode: 'client' });
  }
  function push() { listener(snapshot()); }

  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { metadata: { name, token }, reliable: true });
    conn.on('open', () => { conn.send({ type: 'name', name }); });
    conn.on('data', (msg) => {
      if (!msg) return;
      if (msg.type === 'welcome') {
        mySeat = msg.seat;
        if (msg.token) { token = msg.token; saveToken(code, token); }
        status = msg.started ? 'playing' : 'waiting';
        push();
      } else if (msg.type === 'view') {
        view = msg.view;
        if (status === 'waiting' && view.phase !== 'idle') status = 'playing';
        push();
      } else if (msg.type === 'full') {
        status = 'full';
        push();
      } else if (msg.type === 'error') {
        status = 'error:' + msg.message;
        push();
      }
    });
    conn.on('close', () => { status = 'closed'; push(); });
  });
  peer.on('error', (e) => { status = 'error:' + e.type; push(); });

  return {
    mode: 'client',
    code,
    name,
    get mySeat() { return mySeat; },
    get status() { return status; },
    getState: () => snapshot(),
    dispatch: (action) => { if (conn && conn.open) conn.send({ type: 'action', action }); },
    subscribe: (fn) => { listener = fn; fn(snapshot()); },
  };
}
