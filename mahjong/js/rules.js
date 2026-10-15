// rules.js — 长兴麻将规则内核：带赖子的胡牌判定、特殊牌型、计分
// 详见 SPEC.md §4 / §5.2。白板(z7)在【普通胡/杠开/特殊胡】里是万能赖子；
// 在【七对】【十三不搭】里当普通牌。
import { isWhite, sameTile, tileKey, allTileTypes } from './tiles.js';

/* ============================================================
 * 一、底层计数工具
 * ========================================================== */

/** 牌 → 0..33 的类别序号（m0-8 p9-17 s18-26 z27-33）。 */
function idx(t) {
  if (t.suit === 'z') return 27 + (t.rank - 1);
  if (t.suit === 'm') return t.rank - 1;
  if (t.suit === 'p') return 9 + (t.rank - 1);
  return 18 + (t.rank - 1); // s
}

/** 计数数组（**不含**白板；白板即赖子，单独算）。 */
function toCounts(tiles) {
  const c = new Array(34).fill(0);
  for (const t of tiles) if (!isWhite(t)) c[idx(t)]++;
  return c;
}

/** 计数数组（**含**白板，白板当普通牌用）。 */
function toCountsAll(tiles) {
  const c = new Array(34).fill(0);
  for (const t of tiles) c[idx(t)]++;
  return c;
}

function countWhite(tiles) {
  let n = 0;
  for (const t of tiles) if (isWhite(t)) n++;
  return n;
}

function meldTiles(melds) {
  return melds.flatMap((m) => (m && m.tiles) || []);
}

/* ============================================================
 * 二、面子拆解（赖子补位）—— 递归回溯
 * ========================================================== */

/**
 * counts 中的非白牌 + wild 张赖子，能否恰好组成 needMelds 个面子（顺子/刻子）。
 * 会原地修改 counts，返回后恢复。
 */
function canFormMelds(counts, wild, needMelds) {
  if (needMelds === 0) return counts.every((x) => x === 0) && wild === 0;
  const t = counts.findIndex((x) => x > 0);
  if (t === -1) return wild === needMelds * 3;
  const honor = t >= 27;
  const pos = t % 9;
  const maxReal = Math.min(counts[t], 3);
  for (let useReal = maxReal; useReal >= 1; useReal--) {
    const need = 3 - useReal;
    if (need > wild) continue;
    const saved = counts[t];
    counts[t] -= useReal;
    if (canFormMelds(counts, wild - need, needMelds - 1)) { counts[t] = saved; return true; }
    counts[t] = saved;
  }
  if (!honor) {
    const starts = [];
    if (pos <= 6) starts.push(t);
    if (pos >= 1 && pos <= 7) starts.push(t - 1);
    if (pos >= 2) starts.push(t - 2);
    for (const s of starts) {
      const a = s;
      const b = s + 1;
      const c = s + 2;
      const da = counts[a] > 0 ? 1 : 0;
      const db = counts[b] > 0 ? 1 : 0;
      const dc = counts[c] > 0 ? 1 : 0;
      const need = 3 - (da + db + dc);
      if (need > wild) continue;
      counts[a] -= da; counts[b] -= db; counts[c] -= dc;
      const ok = canFormMelds(counts, wild - need, needMelds - 1);
      counts[a] += da; counts[b] += db; counts[c] += dc;
      if (ok) return true;
    }
  }
  return false;
}

/** 标准胡：needMelds 个面子 + 1 个将（乱将，可赖子补）。 */
function canStandardWin(counts, wild, needMelds) {
  for (let t = 0; t < 34; t++) {
    const c = counts[t];
    if (c >= 2) {
      counts[t] = c - 2;
      const ok = canFormMelds(counts, wild, needMelds);
      counts[t] = c;
      if (ok) return true;
    } else if (c === 1 && wild >= 1) {
      counts[t] = 0;
      const ok = canFormMelds(counts, wild - 1, needMelds);
      counts[t] = c;
      if (ok) return true;
    }
  }
  // 将 = 两张赖子
  if (wild >= 2 && canFormMelds(counts, wild - 2, needMelds)) return true;
  return false;
}

/* ============================================================
 * 三、特殊整体牌型（白板当普通牌）
 * ========================================================== */

/** 七对：14 张全部成对（含白板作普通牌）。 */
export function isSevenPairs(tiles) {
  if (tiles.length !== 14) return false;
  const c = toCountsAll(tiles);
  let pairs = 0;
  for (const n of c) {
    if (n % 2 !== 0) return false;
    pairs += n / 2;
  }
  return pairs === 7;
}

/** 豪华七对：七对且含 4 张相同（暗杠形态）。 */
export function isLuxurySevenPairs(tiles) {
  return isSevenPairs(tiles) && toCountsAll(tiles).some((n) => n === 4);
}

/**
 * 十三不搭：14 张，字牌互不相同、数牌同花色内两两相差 >= 3（不能成搭），
 * 且至多一个对子。白板在此当普通字牌（SPEC §4.4，精确张数定义见 README TBD）。
 */
export function isShisanBuDa(tiles) {
  if (tiles.length !== 14) return false;
  const c = toCountsAll(tiles);
  let pairs = 0;
  for (let i = 0; i < 34; i++) {
    if (c[i] > 2) return false;
    if (c[i] === 2) pairs++;
  }
  if (pairs > 1) return false;
  for (const base of [0, 9, 18]) {
    for (let r = 0; r < 9; r++) {
      const a = base + r;
      if (c[a] === 0) continue;
      if (r + 1 < 9 && c[a + 1] > 0) return false;
      if (r + 2 < 9 && c[a + 2] > 0) return false;
    }
  }
  return true;
}

/** 特殊胡：白板作将（将中含至少一张白板），其余（含剩余白板当赖子）成 4 - 副露数 个面子。 */
function isSpecialWinHand(hand, melds) {
  const needMelds = 4 - melds.length;
  if (hand.length !== needMelds * 3 + 2) return false;
  const whites = countWhite(hand);
  if (whites === 0) return false;
  const counts = toCounts(hand);
  if (whites >= 2 && canFormMelds(counts.slice(), whites - 2, needMelds)) return true;
  for (let i = 0; i < 34; i++) {
    if (counts[i] === 0) continue;
    const c = counts.slice();
    c[i]--;
    if (canFormMelds(c, whites - 1, needMelds)) return true;
  }
  return false;
}

/** 特殊听牌：手牌 = 4 - 副露数 个完整面子 + 单张白板作将，下次摸任意牌必自摸。 */
export function isSpecialTing(hand, melds = []) {
  const needMelds = 4 - melds.length;
  if (hand.length !== needMelds * 3 + 1) return false;
  const whites = countWhite(hand);
  if (whites === 0) return false;
  return canFormMelds(toCounts(hand), whites - 1, needMelds);
}

/** 四白板：手中/副露集齐 4 张白板（已打出不计）→ 直接和。 */
export function hasFourWhite(hand, melds = []) {
  return countWhite(hand) + countWhite(meldTiles(melds)) >= 4;
}

/* ============================================================
 * 四、胡牌判定
 * ========================================================== */

/**
 * 判定能否胡牌。
 * @param {Array} hand   暗牌，**包含胡的那张**（自摸时已摸入手牌）
 * @param {Array} melds  副露：[{type:'chi'|'peng'|'minggang'|'angang'|'bugang', tiles:[]}]
 * @param {Object|null} winTile 胡的那张（引用，用于阅别；可为 null）
 * @param {{selfDraw?:boolean, isTianHu?:boolean, gangKai?:boolean}} ctx
 * @returns {null | {patterns:string[], multipliers:number, settle:'self'|'dianpao'|'perEach',
 *   baseSelfDraw:number, baseDianpao:null|{dianpao:number,others:number},
 *   usesWildcard:boolean, hasWhite:boolean}}
 */
export function evaluateWin(hand, melds = [], winTile = null, ctx = {}) {
  const selfDraw = !!ctx.selfDraw;
  const allWhite = countWhite(hand) + countWhite(meldTiles(melds));
  const hasWhite = allWhite > 0;

  // ① 四白板（无视常规结构，集齐即和）
  if (allWhite >= 4) {
    return {
      patterns: ['四白板'], multipliers: 1, settle: 'perEach',
      baseSelfDraw: 10, baseDianpao: null, usesWildcard: false, hasWhite: true,
    };
  }

  // ② 无副露的整手牌型（白板当普通牌）
  if (melds.length === 0 && hand.length === 14) {
    if (isShisanBuDa(hand)) {
      if (hasWhite && !selfDraw) return null; // 手里有白板只能自摸
      return {
        patterns: ['十三不搭'], multipliers: 1,
        settle: selfDraw ? 'self' : 'dianpao', baseSelfDraw: 6,
        baseDianpao: { dianpao: 4, others: 2 }, usesWildcard: false, hasWhite,
      };
    }
    if (isSevenPairs(hand)) {
      const luxury = isLuxurySevenPairs(hand);
      if (hasWhite && !selfDraw) return null;
      return {
        patterns: luxury ? ['七对', '豪华七对'] : ['七对'],
        multipliers: luxury ? 4 : 2,
        settle: selfDraw ? 'self' : 'dianpao', baseSelfDraw: 6,
        baseDianpao: { dianpao: 4, others: 2 }, usesWildcard: false, hasWhite,
      };
    }
  }

  // ③ 常规：needMelds 个面子 + 将
  const needMelds = 4 - melds.length;
  if (hand.length !== needMelds * 3 + 2) return null;
  const wild = countWhite(hand);
  if (!canStandardWin(toCounts(hand), wild, needMelds)) return null;

  // 特殊胡（4 面子 + 单白板作将）——只能自摸
  if (isSpecialWinHand(hand, melds)) {
    if (!selfDraw) return null;
    return {
      patterns: ['特殊胡'], multipliers: 1, settle: 'perEach',
      baseSelfDraw: 5, baseDianpao: null, usesWildcard: true, hasWhite: true,
    };
  }

  // 手上有赖子 → 只能自摸，不能点炮
  if (wild > 0 && !selfDraw) return null;

  const gangKai = ctx.gangKai ? 2 : 1;
  if (ctx.isTianHu) {
    return {
      patterns: ['天胡'], multipliers: gangKai, settle: 'perEach',
      baseSelfDraw: 10, baseDianpao: null, usesWildcard: wild > 0, hasWhite,
    };
  }
  if (hasWhite) {
    return {
      patterns: [], multipliers: gangKai, settle: selfDraw ? 'self' : 'dianpao',
      baseSelfDraw: 3, baseDianpao: selfDraw ? null : { dianpao: 4, others: 2 },
      usesWildcard: wild > 0, hasWhite: true,
    };
  }
  return {
    patterns: [], multipliers: gangKai, settle: selfDraw ? 'self' : 'dianpao',
    baseSelfDraw: 6, baseDianpao: selfDraw ? null : { dianpao: 4, others: 2 },
    usesWildcard: false, hasWhite: false,
  };
}

/* ============================================================
 * 五、计分
 * ========================================================== */

/**
 * 结算：返回 4 个座位的得分增减。
 * @param {ReturnType<typeof evaluateWin>} winResult
 * @param {{selfDraw:boolean, winnerSeat:number, discarderSeat?:number, playerCount?:number}} ctx
 */
export function scoreWin(winResult, ctx = {}) {
  const deltas = [0, 0, 0, 0];
  const mult = winResult.multipliers || 1;
  const w = ctx.winnerSeat;
  const n = ctx.playerCount || 4;
  const tag = winResult.patterns.join('+');
  let breakdown = '';

  if (winResult.settle === 'perEach') {
    const each = winResult.baseSelfDraw * mult;
    for (let i = 0; i < n; i++) if (i !== w) { deltas[i] -= each; deltas[w] += each; }
    breakdown = `${tag || '和牌'} · 每家 ${each}`;
  } else if (ctx.selfDraw) {
    const each = winResult.baseSelfDraw * mult;
    for (let i = 0; i < n; i++) if (i !== w) { deltas[i] -= each; deltas[w] += each; }
    breakdown = `自摸${tag ? '·' + tag : ''} · 每家 ${each}`;
  } else {
    const d = winResult.baseDianpao.dianpao * mult;
    const o = winResult.baseDianpao.others * mult;
    const disc = ctx.discarderSeat;
    for (let i = 0; i < n; i++) {
      if (i === w) continue;
      const pay = i === disc ? d : o;
      deltas[i] -= pay;
      deltas[w] += pay;
    }
    breakdown = `点炮${tag ? '·' + tag : ''} · 炮者 ${d} 其余 ${o}`;
  }
  return { deltas, breakdown };
}

/* ============================================================
 * 六、副露判定
 * ========================================================== */

/** 能否碰。别人打白板时，需用手中白板碰（自己白板不能当赖子去碰别的牌）。 */
export function canPeng(hand, tile) {
  if (isWhite(tile)) return countWhite(hand) >= 2;
  return hand.filter((t) => sameTile(t, tile)).length >= 2;
}

/** 能否明杠（碰别人打出的牌）。 */
export function canMingGang(hand, tile) {
  if (isWhite(tile)) return countWhite(hand) >= 3;
  return hand.filter((t) => sameTile(t, tile)).length >= 3;
}

/** 能否补杠（已碰的牌，手里还有第 4 张）。 */
export function canAddGang(hand, meld) {
  if (!meld || meld.type !== 'peng') return false;
  const t = meld.tiles[0];
  if (isWhite(t)) return countWhite(hand) >= 1;
  return hand.some((h) => sameTile(h, t));
}

/** 能否暗杠：返回可杠的四张组。 */
export function canAnGang(hand) {
  const groups = new Map();
  for (const t of hand) {
    const k = tileKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const arr of groups.values()) if (arr.length === 4) out.push(arr);
  return out;
}

/** 能否吃上家打出的牌：返回可行的两组（不含白板，白板不能吃）。 */
export function canChi(hand, tile) {
  if (!tile || tile.suit === 'z' || isWhite(tile)) return [];
  const find = (r) => hand.find((t) => t.suit === tile.suit && t.rank === r);
  const r = tile.rank;
  const res = [];
  if (r - 2 >= 1) { const a = find(r - 2), b = find(r - 1); if (a && b) res.push({ tiles: [a, b], rank: r }); }
  if (r - 1 >= 1 && r + 1 <= 9) { const a = find(r - 1), b = find(r + 1); if (a && b) res.push({ tiles: [a, b], rank: r }); }
  if (r + 2 <= 9) { const a = find(r + 1), b = find(r + 2); if (a && b) res.push({ tiles: [a, b], rank: r }); }
  return res;
}

/* ============================================================
 * 七、听牌 / 冲突裁决
 * ========================================================== */

/** 是否听牌（存在某张牌补入后可胡）。 */
export function isTing(hand, melds = []) {
  for (const t of allTileTypes()) {
    const test = hand.concat([{ id: '__probe__', suit: t.suit, rank: t.rank }]);
    if (evaluateWin(test, melds, null, { selfDraw: true })) return true;
  }
  return false;
}

/**
 * 一炮多响裁决：不允许，只让逆时针方向离出牌者最近的一家胡。
 * @param {Array} _players 预留（当前用座位号即可）
 * @param {number} discarderSeat
 * @param {number[]} candidates 能胡的座位号
 * @returns {number|null}
 */
export function resolveDiscardWinners(_players, discarderSeat, candidates) {
  if (!candidates || candidates.length === 0) return null;
  let best = null;
  let bestD = 99;
  for (const s of candidates) {
    const d = (s - discarderSeat + 4) % 4;
    if (d > 0 && d < bestD) { bestD = d; best = s; }
  }
  return best;
}
