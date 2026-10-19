// tests/rules.test.js — 长兴麻将规则内核单测（bun test）
import { describe, test, expect } from 'bun:test';
import { createWall, isWhite, allTileTypes, tileLabel, sortHand } from '../js/tiles.js';
import {
  evaluateWin, scoreWin, canPeng, canMingGang, canAddGang, canAnGang, canChi,
  isSevenPairs, isLuxurySevenPairs, isShisanBuDa, isSpecialTing, hasFourWhite,
  isTing, resolveDiscardWinners,
} from '../js/rules.js';

let uid = 0;
/** '1m2m3m' → [{suit:'m',rank:1},{suit:'m',rank:2},...] */
function P(str) {
  const tiles = [];
  for (let i = 0; i < str.length; i += 2) {
    tiles.push({ id: `t${uid++}`, suit: str[i + 1], rank: Number(str[i]) });
  }
  return tiles;
}
const selfDrawDeltas = (each) => [3 * each, -each, -each, -each];

describe('牌与牌墙', () => {
  test('牌墙 136 张，白板 4 张', () => {
    const w = createWall(() => 0.5); // 确定性洗牌
    expect(w.length).toBe(136);
    expect(w.filter(isWhite).length).toBe(4);
    expect(allTileTypes().length).toBe(34);
  });
  test('白板识别与牌名', () => {
    expect(isWhite({ suit: 'z', rank: 7 })).toBe(true);
    expect(isWhite({ suit: 'z', rank: 6 })).toBe(false);
    expect(tileLabel({ suit: 'm', rank: 1 })).toBe('一万');
    expect(tileLabel({ suit: 'z', rank: 7 })).toBe('白');
  });
  test('sortHand 按花色点数排序', () => {
    const s = sortHand(P('7z1m5p3s'));
    expect(s.map((t) => t.suit + t.rank).join(',')).toBe('m1,p5,s3,z7');
  });
});

describe('基础计分：自摸 / 放炮 / 杠开', () => {
  const hardWin = P('1m2m3m4m5m6m1p2p3p7s8s9s5z5z'); // 硬货（无白板）
  const softWin = P('1m2m3m4m5m6m1p2p3p7s8s7z5z5z'); // 有白板（赖子补顺子，非特殊胡）

  test('硬货自摸：每家 6，赢家 +18', () => {
    const r = evaluateWin(hardWin, [], null, { selfDraw: true });
    expect(r).not.toBeNull();
    expect(r.patterns).toEqual([]);
    expect(r.baseSelfDraw).toBe(6);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(6));
  });

  test('有白板自摸：每家 3，赢家 +9', () => {
    const r = evaluateWin(softWin, [], null, { selfDraw: true });
    expect(r).not.toBeNull();
    expect(r.hasWhite).toBe(true);
    expect(r.baseSelfDraw).toBe(3);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(3));
  });

  test('有白板不能点炮胡', () => {
    expect(evaluateWin(softWin, [], null, { selfDraw: false })).toBeNull();
  });

  test('硬货放炮：炮者 4、其余 2', () => {
    const r = evaluateWin(hardWin, [], null, { selfDraw: false });
    expect(r.settle).toBe('dianpao');
    expect(r.baseDianpao).toEqual({ dianpao: 4, others: 2 });
    const { deltas } = scoreWin(r, { selfDraw: false, winnerSeat: 0, discarderSeat: 2 });
    expect(deltas).toEqual([8, -2, -4, -2]);
  });

  test('杠开 ×2：硬货杠开自摸每家 12', () => {
    const r = evaluateWin(hardWin, [], null, { selfDraw: true, gangKai: true });
    expect(r.multipliers).toBe(2);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(12));
  });
});

describe('七对 / 豪华七对', () => {
  const sevenPairs = P('1m1m2m2m3m3m4p4p5p5p6s6s7z7z'); // 含白板对子（当普通牌）
  const luxury = P('1m1m1m1m2m2m3m3m4p4p5p5p6s6s');      // 含 4 张相同

  test('七对：白板当普通牌，×2', () => {
    expect(isSevenPairs(sevenPairs)).toBe(true);
    expect(isLuxurySevenPairs(sevenPairs)).toBe(false);
    const r = evaluateWin(sevenPairs, [], null, { selfDraw: true });
    expect(r.patterns).toEqual(['七对']);
    expect(r.multipliers).toBe(2);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(12));
  });

  test('豪华七对：在七对基础上再 ×2（共 ×4）', () => {
    expect(isLuxurySevenPairs(luxury)).toBe(true);
    const r = evaluateWin(luxury, [], null, { selfDraw: true });
    expect(r.patterns).toEqual(['七对', '豪华七对']);
    expect(r.multipliers).toBe(4);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(24));
  });
});

describe('十三不搭', () => {
  const hand = P('1m4m7m2p5p8p3s6s9s1z2z3z4z5z');

  test('识别 + 自摸 6/人', () => {
    expect(isShisanBuDa(hand)).toBe(true);
    const r = evaluateWin(hand, [], null, { selfDraw: true });
    expect(r.patterns).toEqual(['十三不搭']);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(6));
  });

  test('放炮：炮者 4、其余 2', () => {
    const r = evaluateWin(hand, [], null, { selfDraw: false });
    expect(r.settle).toBe('dianpao');
    const { deltas } = scoreWin(r, { selfDraw: false, winnerSeat: 0, discarderSeat: 3 });
    expect(deltas).toEqual([8, -2, -2, -4]);
  });

  test('听牌：147万 258筒 14条 东南西北中 → 听 789条/发/白；摸对子不算', () => {
    const pre = P('1m4m7m2p5p8p1s4s1z2z3z4z5z');
    for (const d of ['7s', '8s', '9s', '6z', '7z']) {
      const r = evaluateWin([...pre, P(d)[0]], [], null, { selfDraw: true });
      expect(r).not.toBeNull();
      expect(r.patterns).toEqual(['十三不搭']);
    }
    expect(isShisanBuDa([...pre, P('1s')[0]])).toBe(false);
    expect(isShisanBuDa([...pre, P('1m')[0]])).toBe(false);
    expect(evaluateWin([...pre, P('1s')[0]], [], null, { selfDraw: true })).toBeNull();
  });
});

describe('四白板 / 爆头 / 爆头听牌', () => {
  test('四白板：集齐即和，10/人', () => {
    const hand = P('7z7z7z7z1m2m3m4m5m6m1p2p3p5p');
    expect(hasFourWhite(hand, [])).toBe(true);
    const r = evaluateWin(hand, [], null, { selfDraw: true });
    expect(r.patterns).toEqual(['四白板']);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(10));
  });

  test('爆头：4 面子 + 单白板作将，摸任意牌自摸 5/人', () => {
    const pre = P('1m2m3m4m5m6m1p2p3p7s8s9s7z');
    const drawn = P('5z')[0];
    const hand = [...pre, drawn];
    expect(isSpecialTing(pre, [])).toBe(true);
    const r = evaluateWin(hand, [], drawn, { selfDraw: true, boTou: true });
    expect(r.patterns).toEqual(['爆头']);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(5));
    expect(evaluateWin(hand, [], drawn, { selfDraw: false })).toBeNull();
  });

  test('爆头听牌：4 面子 + 单白板', () => {
    const ting = P('1m2m3m4m5m6m1p2p3p7s8s9s7z'); // 13 张
    expect(isSpecialTing(ting, [])).toBe(true);
    expect(isTing(ting, [])).toBe(true);
  });

  test('天胡：庄家起手胡 10/人', () => {
    const r = evaluateWin(P('1m2m3m4m5m6m1p2p3p7s8s9s5z5z'), [], null, { selfDraw: true, isTianHu: true });
    expect(r.patterns).toEqual(['天胡']);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(10));
  });
});

describe('乱将 / 副露', () => {
  test('乱将：任意对子作将（3m 也对）', () => {
    const hand = P('3m3m1m1m1m2m2m2m4m5m6m7s8s9s');
    const r = evaluateWin(hand, [], null, { selfDraw: true });
    expect(r).not.toBeNull();
    expect(r.baseSelfDraw).toBe(6);
  });

  test('碰：真对子可碰；白板需用白板碰', () => {
    expect(canPeng(P('1m1m'), { suit: 'm', rank: 1 })).toBe(true);
    expect(canPeng(P('7z7z'), { suit: 'z', rank: 7 })).toBe(true);
    expect(canPeng(P('7z'), { suit: 'm', rank: 1 })).toBe(false); // 白板不能碰别的牌
  });

  test('杠：明杠/暗杠/补杠', () => {
    expect(canMingGang(P('3m3m3m'), { suit: 'm', rank: 3 })).toBe(true);
    expect(canAnGang(P('2m2m2m2m')).length).toBe(1);
    expect(canAddGang(P('5s'), { type: 'peng', tiles: P('5s5s5s') })).toBe(true);
  });

  test('吃：仅数牌、仅上家', () => {
    const chi = canChi(P('2m3m'), { suit: 'm', rank: 1 });
    expect(chi.length).toBe(1);
    expect(chi[0].tiles.map((t) => t.suit + t.rank)).toEqual(['m2', 'm3']);
    expect(canChi(P('1z2z'), { suit: 'z', rank: 3 }).length).toBe(0);
  });
});

describe('一炮多响裁决', () => {
  test('只让逆时针离出牌者最近的一家胡', () => {
    expect(resolveDiscardWinners(null, 0, [1, 3])).toBe(1);
    expect(resolveDiscardWinners(null, 0, [2, 3])).toBe(2);
    expect(resolveDiscardWinners(null, 3, [0, 1, 2])).toBe(0);
    expect(resolveDiscardWinners(null, 1, [])).toBeNull();
  });
});

describe('赖子补低位顺子 / 爆头', () => {
  test('赖子可补在顺子低位（8m9m+白=7m8m9m）', () => {
    const hand = P('8m9m7z1m1m1m2p2p2p3s3s3s5z5z');
    const r = evaluateWin(hand, [], null, { selfDraw: true });
    expect(r).not.toBeNull();
    expect(r.baseSelfDraw).toBe(3);
  });

  test('爆头：副露 + 白板作将（白板补面子）', () => {
    const melds = [{ type: 'chi', tiles: P('5s6s7s') }];
    const pre = P('4m4m8m9m7p8p9p7z7z7z');
    const drawn = P('3s')[0];
    const hand = [...pre, drawn];
    expect(isSpecialTing(pre, melds)).toBe(true);
    const r = evaluateWin(hand, melds, drawn, { selfDraw: true, boTou: true });
    expect(r).not.toBeNull();
    expect(r.patterns).toEqual(['爆头']);
    const { deltas } = scoreWin(r, { selfDraw: true, winnerSeat: 0 });
    expect(deltas).toEqual(selfDrawDeltas(5));
  });

  test('爆头听牌：3 白板（白板补面子 + 1 白板作将）', () => {
    const melds = [{ type: 'chi', tiles: P('5s6s7s') }];
    const ting = P('4m4m8m9m7p8p9p7z7z7z');
    expect(isSpecialTing(ting, melds)).toBe(true);
    expect(isTing(ting, melds)).toBe(true);
  });

  test('单将听牌摸到白板 → 不算爆头（普通有白板自摸 3/人）', () => {
    const pre = P('1m2m3m4m5m6m1p2p3p7s8s9s5z');
    const drawn = P('7z')[0];
    const hand = [...pre, drawn];
    expect(isSpecialTing(pre, [])).toBe(false);
    const r = evaluateWin(hand, [], drawn, { selfDraw: true, boTou: false });
    expect(r).not.toBeNull();
    expect(r.patterns).toEqual([]);
    expect(r.baseSelfDraw).toBe(3);
  });
});
