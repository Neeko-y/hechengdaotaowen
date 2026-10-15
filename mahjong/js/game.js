// game.js — 本地单人模式：引擎 + 本地控制器（你 + 3 机器人）
import { createEngine } from './engine.js';
import { botAction } from './bot.js';

const NAMES = ['你', '电脑·南', '电脑·西', '电脑·北'];

export function createGame(options = {}) {
  const botDelay = options.botDelay ?? 650;
  const engine = createEngine();
  for (let i = 0; i < 4; i++) engine.setName(i, NAMES[i]);

  let timer = null;
  let uiListener = () => {};

  function onChange(state) {
    uiListener(engine.getView(0));
    const a = state.awaiting;
    if (!a || a.seat === 0) return;
    clearTimeout(timer);
    const seat = a.seat;
    timer = setTimeout(() => {
      const cur = engine.getState().awaiting;
      if (!cur || cur.seat !== seat) return;
      engine.dispatch(seat, botAction(cur, engine.getState()));
    }, botDelay);
  }

  engine.subscribe(onChange);
  engine.begin();

  return {
    mode: 'local',
    getState: () => engine.getView(0),
    dispatch: (action) => (action.type === 'restart' ? engine.newRound() : engine.dispatch(0, action)),
    subscribe: (fn) => { uiListener = fn; fn(engine.getView(0)); },
    newRound: () => engine.newRound(),
  };
}
