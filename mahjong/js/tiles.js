// tiles.js — 长兴麻将：牌模型、牌墙、发牌、排序
// 牌结构：{ id: string, suit: 'm'|'p'|'s'|'z', rank: number }
//   m=万  p=筒  s=条
//   z(字牌)：1=东 2=南 3=西 4=北 5=中 6=发 7=白（白板，即赖子）

export const SUIT_ORDER = { m: 0, p: 1, s: 2, z: 3 };
export const SUIT_NAME = { m: '万', p: '筒', s: '条', z: '' };
export const Z_NAMES = ['', '东', '南', '西', '北', '中', '發', '白'];
const NUM_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 是否为白板（赖子）。@param {{suit:string,rank:number}} t */
export function isWhite(t) {
  return !!t && t.suit === 'z' && t.rank === 7;
}

/** 牌的类别键，如 'm1'、'z7'。@param {{suit:string,rank:number}} t */
export function tileKey(t) {
  return t.suit + t.rank;
}

/** 两张牌是否为同一种（忽略 id）。 */
export function sameTile(a, b) {
  return a.suit === b.suit && a.rank === b.rank;
}

/** 中文牌名，如 '一万'、'白板'。@param {{suit:string,rank:number}} t */
export function tileLabel(t) {
  if (!t) return '';
  if (t.suit === 'z') return Z_NAMES[t.rank];
  return NUM_NAMES[t.rank] + SUIT_NAME[t.suit];
}

/** 全部 34 种牌型（不含花色重复），供 UI 画图。 */
export function allTileTypes() {
  const out = [];
  for (const s of ['m', 'p', 's']) for (let r = 1; r <= 9; r++) out.push({ suit: s, rank: r });
  for (let r = 1; r <= 7; r++) out.push({ suit: 'z', rank: r });
  return out;
}

/** 全部牌型定义（等同 allTileTypes，别名以符合 SPEC 命名）。 */
export const TILE_TYPES = allTileTypes();

/**
 * 生成一副洗好的牌墙（136 张）。
 * @param {() => number} [rng] 随机源（便于测试注入）
 * @returns {{id:string,suit:string,rank:number}[]}
 */
export function createWall(rng = Math.random) {
  const wall = [];
  let n = 0;
  for (const s of ['m', 'p', 's'])
    for (let r = 1; r <= 9; r++)
      for (let k = 0; k < 4; k++) wall.push({ id: `${s}${r}#${n++}`, suit: s, rank: r });
  for (let r = 1; r <= 7; r++)
    for (let k = 0; k < 4; k++) wall.push({ id: `z${r}#${n++}`, suit: 'z', rank: r });
  // Fisher–Yates
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = wall[i]; wall[i] = wall[j]; wall[j] = tmp;
  }
  return wall;
}

/** 按 花色(m<p<s<z) → 点数 排序，返回新数组。 */
export function sortHand(tiles) {
  return [...tiles].sort(
    (a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.rank - b.rank,
  );
}
