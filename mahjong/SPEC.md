# 长兴麻将 · 规格说明（M1）

> 本文件是**唯一真源**。所有实现（前端/后端/测试）以此为准，如有冲突先改本文件。

## 0. M1 目标

**本地单机跑通**：牌桌 UI + 发牌 + **带赖子的胡牌判定** + 计分。纯前端，无网络。
跑通后 M2 接 Cloudflare Durable Object 做多人同步。

## 1. 技术约束

- 纯 **vanilla JS（ES Modules）**，无框架、无构建步骤。风格参考「合成大西瓜」（单页、PWA 可选）。
- 直接用浏览器打开 `index.html` 即可玩（`file://` 或本地静态服务器均可）。
- 单元测试用 **bun test**：`~/.bun/bin/bun test`（bun 不在 PATH，用全路径）。
- 手机端优先（触屏点选），桌面端也要能用。

## 2. 目录结构

```
麻将/
├── index.html            # 入口：大厅(建房/加入占位) + 牌桌
├── css/style.css
├── js/
│   ├── tiles.js          # 牌模型、牌墙、发牌、排序
│   ├── rules.js          # 胡牌判定（赖子）、特殊牌型、计分
│   ├── game.js           # 回合流程、动作、本地四家状态机
│   └── ui.js             # 渲染 + 交互（DOM）
├── tests/rules.test.js   # 规则/计分单元测试
├── SPEC.md
└── README.md
```

## 3. 牌（tiles）

- 共 **136 张**，无花牌。
  - 万 `m`、条 `s`、筒 `p`：各 rank 1-9，每种 4 张 → 108 张
  - 字牌 `z`：rank 1=东 2=南 3=西 4=北 5=中 6=发 7=**白**，每种 4 张 → 28 张
- Tile 结构：`{ id: string, suit: 'm'|'p'|'s'|'z', rank: number }`
  - `id` 全局唯一（便于 UI diff）。
  - **白板** = `{ suit:'z', rank:7 }`，`isWhite(tile)` 判定。

## 4. 规则

### 4.1 基本流程
- 4 人局，庄家起手 **14 张**，闲家 **13 张**。
- 轮流摸打；可 **吃**（仅上家）、**碰**（三家）、**杠**（明杠/暗杠/补杠）。
- **乱将**：任意对子都可以作将（不需要是 2/5/8）。
- **一炮多响不允许**：某张牌若多家可胡，只有逆时针方向离出牌者**最近**的一家能胡。
- 过胡不胡、荒庄：**第一版不做**。

### 4.2 白板（赖子）—— 全项目最关键的规则
- 在【普通胡 / 杠开 / 特殊胡】分支里：白板是**万用赖子**，可代任意**非白板**牌组成面子或将。
- 手里**有白板** → **只能自摸胡，不能点炮胡**。
- 自己手里的白板**不能**用于吃/碰/杠；只能留手或打出。
- 出牌方**打出白板**后：别人**可以用白板碰/杠这张白板本身**（碰/杠的是白板）；白板**不能被吃、不能被点炮胡**。
- **七对子**里：白板当**普通牌**（必须真成对，不赖）。
- **十三不搭**里：白板当**普通风牌**（效力等同 中/发，不赖）。
- 白板在【四白板】牌型里就是白板本身。

### 4.3 胡牌牌型与计分

基础分（points，按“每玩家”计）：

| 牌型 | 条件 | 分数 |
|---|---|---|
| 自摸·硬货 | 自摸且**手里无白板** | 6 / 人 |
| 自摸·有白板 | 自摸且**手里有白板** | 3 / 人 |
| 放炮·硬货 | 胡牌者**手里无白板**，点炮胡 | 炮者 4，其余两家各 2 |
| 爆头 | 摸牌前 4 面子齐 + 单张白板作将 → 摸任意牌必自摸 | 5 / 人 |
| 四白板 | 碰/杠/摸集齐 **4 张白板**（已打出的白板不计）→ 直接和 | 10 / 人 |
| 天胡 | 庄家起手即胡（未打任何牌前） | 10 / 人 |
| 十三不搭 | 见 4.4 | 自摸 6 / 人；放炮：炮者 4、其余各 2 |

**倍率（乘算，指数增长）**：
- 杠开（杠后补牌自摸）×2
- 七对 ×2
- 豪华七对（七对 + 4 张相同 = 暗杠形态）在七对基础上再 ×2
- 其余特殊倍率：**待补充**（留扩展点）

**组合示例**：硬货杠开自摸 = 6×2 = 12；硬货七对自摸 = 6×2 = 12；硬货豪华七对自摸 = 6×2×2 = 24。
（注：杠开与七对**不会同时出现**。）

### 4.4 十三不搭
- 白板在此牌型中当**普通字牌**。
- 牌型：14 张**全部互不相同**（不能成对），且同花色内任意两张点数相差 ≥ 3（不能成搭）。
- 即：必须再摸到一张“不搭”的牌才成牌；摸到与手牌相同的牌（成对）**不算**。

### 4.5 爆头（“白板作将 · 下次必自摸”）
- 局面：手牌 = **（4 - 副露数）个完整面子 + 单张白板**（白板作将之一），张数 = 3×(4-副露数)+1。
- 面子可用**其余白板当赖子补齐**（如 8万9万+白板=7万8万9万，赖子可补顺子任意位置）；作将的那张白板单独留出。
- 因为白板可配任意牌成将，故**下一次摸到任意牌都能自摸**；此情形**自动结算**，分数按 5/人。
- 判定以**摸牌前**的手牌为准：摸牌前已处于上述听牌状态（已有一张白板作将）→ 爆头。
- 若只是“单将听牌”（等某张牌成将）**摸到白板**凑成将 → **不算爆头**，按普通“有白板自摸”（3/人）。

### 4.6 待确认（TBD，实现时留可配置项，先用默认值）
1. 七对 / 十三不搭里，若含白板（当普通牌），自摸基础分是 6 还是 3？（默认：**按“手里有白板”取 3**，可配置）
2. 杠开与七对各自 ×2 的“基础分”用哪一档（有白板 3 / 无白板 6）？（默认按实际是否含白板）
3. 十三不搭的精确张数定义。

## 5. 数据模型与模块接口（**冻结**，前后端/UI/测试都按此对接）

### 5.1 tiles.js
```js
export function isWhite(tile): boolean                 // suit==='z' && rank===7
export function tileKey(tile): string                  // 'm1' 'z7' ...
export function sameTile(a, b): boolean
export function createWall(rng = Math.random): Tile[]  // 136 张，已洗牌
export function sortHand(tiles: Tile[]): Tile[]        // 按 花色+点数 排序
export function tileLabel(tile): string                // '一万' '白板' ...
export const TILE_TYPES: ...                           // 全部牌型定义（供 UI 画图）
```

### 5.2 rules.js
```js
// meld: { type:'chi'|'peng'|'minggang'|'angang'|'bugang', tiles: Tile[], from?: number }
// hand: 暗牌（不含副露）；winTile: 胡的那张（自摸时已在 hand 内）

// 判定能否胡；不能胡返回 null
export function evaluateWin(hand, melds, winTile, ctx): WinResult | null
//   ctx: { selfDraw: boolean, isTianHu?: boolean, playerCount?: number }
//   WinResult: {
//     patterns: string[],          // 如 ['七对','豪华七对'] / ['特殊胡'] / ['十三不搭'] / ['四白板'] / []
//     multipliers: number,         // 乘算倍率（1/2/4...）
//     usesWildcard: boolean,       // 是否把白板当赖子使用（决定能否点炮、基础分档）
//     baseSelfDraw: number,        // 自摸每玩家基础分
//     baseDianpao: { dianpao: number, others: number },  // 放炮基础分
//   }

// 结算：返回 4 个座位各自的得分增减
export function scoreWin(winResult, ctx): { deltas: number[], breakdown: string }
//   ctx: { selfDraw, winnerSeat, discarderSeat?, isDealer }

// 副露判定
export function canPeng(hand, tile): boolean
export function canMingGang(hand, tile): boolean
export function canAddGang(hand, meld): boolean
export function canAnGang(hand): Tile[][]              // 可暗杠的四张组
export function canChi(hand, tile): Array<{ tiles:[Tile,Tile], rank:number }>  // 上家出 tile 时的吃法

// 听牌 / 特殊听牌
export function isTing(hand, melds): boolean
export function isSpecialTing(hand, melds): boolean    // 4面子+单白板
export function hasFourWhite(hand, melds): boolean     // 四白板即时胡
```

### 5.3 game.js
- 本地单机回合状态机：发牌 → 庄家打牌 → 摸/打循环 → 副露响应（吃碰杠胡，含超时/点击）→ 结算。
- 暴露 `createGame()`, `getState()`, `dispatch(action)`；UI 只读 state + 派发 action。

### 5.4 ui.js
- 渲染牌桌：四家（自己朝上、他家朝下/张数）、弃牌区、副露区、动作按钮（吃/碰/杠/胡/过）、结算弹窗。
- 手机端优先；点选打牌。

## 6. 验收标准（M1）
- [ ] `~/.bun/bin/bun test` 全绿。
- [ ] 单元测试覆盖：硬货自摸、有白板自摸、放炮、杠开、七对、豪华七对、十三不搭、四白板、特殊胡、一炮多响取最近家。
- [ ] 浏览器打开 `index.html` 能完整打完一局（含副露与胡牌结算）。
- [ ] 无 console error。
