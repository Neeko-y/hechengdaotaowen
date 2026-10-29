/*
 * 爱倒班 · 排班核心逻辑
 * 纯函数，无 DOM 依赖，可单独加载与测试。
 *
 * 班组：一值 ~ 五值（5 个班组）
 * 循环：白 → 夜 → 休1 → 中 → 休2（5 天一个循环）
 * 锚点：2026-10-26（周一）为循环第 1 天，当天一值上白班
 *
 * 时间语义（重要）：
 *   白班 08:00-16:00  → 当天
 *   中班 16:00-24:00  → 当天
 *   夜班 00:00-08:00  → 当天凌晨（表上标注第 N 天的夜班 = 第 N 天 00:00 上班）
 *   休1 = 夜班之后的那个休息
 *   休2 = 中班之后的那个休息
 *
 * 月份参数 m 一律为 0-11（与 Date.getMonth() 一致），不是 1-12。
 */
(function (global) {
  'use strict';

  var SEQ = ['白', '夜', '休1', '中', '休2'];
  var TEAMS = ['一值', '二值', '三值', '四值', '五值'];

  // 锚点：2026-10-26，循环第 1 天，一值白班
  var ANCHOR = { y: 2026, m: 9, d: 26 };

  var SHIFT_TIMES = {
    '白':   { start: '08:00', end: '16:00', label: '白班', isWork: true,  startMin: 480,  endMin: 960  },
    '中':   { start: '16:00', end: '24:00', label: '中班', isWork: true,  startMin: 960,  endMin: 1440 },
    '夜':   { start: '00:00', end: '08:00', label: '夜班', isWork: true,  startMin: 0,    endMin: 480  },
    '休1':  { start: null,    end: null,    label: '休1',  isWork: false, startMin: null, endMin: null, restAfter: '夜' },
    '休2':  { start: null,    end: null,    label: '休2',  isWork: false, startMin: null, endMin: null, restAfter: '中' },
    '年休': { start: null,    end: null,    label: '年休', isWork: false, startMin: null, endMin: null }
  };

  var WORK_SHIFTS = ['白', '中', '夜'];
  var ALL_SHIFTS = ['白', '夜', '休1', '中', '休2', '年休'];

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  // 用 UTC 天数计算，避免夏令时导致取模结果偏移
  function utcDayNo(y, m, d) {
    return Math.floor(Date.UTC(y, m, d) / 86400000);
  }

  var ANCHOR_DAY = utcDayNo(ANCHOR.y, ANCHOR.m, ANCHOR.d);

  // 循环位置 0..4
  function dayIndex(y, m, d) {
    return mod(utcDayNo(y, m, d) - ANCHOR_DAY, 5);
  }

  // 班组相位：一值 0、二值 3、三值 1、四值 4、五值 2
  function teamPhase(teamIdx) {
    return mod(3 * teamIdx, 5);
  }

  // 某班组在某天的班次
  function shiftOfTeam(teamIdx, y, m, d) {
    return SEQ[mod(dayIndex(y, m, d) + teamPhase(teamIdx), 5)];
  }

  // 某班组在 Date 对象当天的班次
  function shiftForDate(teamIdx, date) {
    return shiftOfTeam(teamIdx, date.getFullYear(), date.getMonth(), date.getDate());
  }

  // 班次的时间窗口
  function shiftWindow(shiftKey) {
    var t = SHIFT_TIMES[shiftKey] || SHIFT_TIMES['休1'];
    var out = {
      label: t.label,
      start: t.start,
      end: t.end,
      isWork: t.isWork,
      startMin: t.startMin,
      endMin: t.endMin
    };
    if (t.restAfter) out.restAfter = t.restAfter;
    return out;
  }

  // 某天某班次的开始时间（本地时间 Date）。非上班班次返回 null。
  function shiftStartDate(y, m, d, shiftKey) {
    var t = SHIFT_TIMES[shiftKey];
    if (!t || !t.isWork) return null;
    return new Date(y, m, d, Math.floor(t.startMin / 60), t.startMin % 60, 0, 0);
  }

  // 某天某班次的结束时间（本地时间 Date）。24:00 自动落到次日 00:00。
  function shiftEndDate(y, m, d, shiftKey) {
    var t = SHIFT_TIMES[shiftKey];
    if (!t || !t.isWork) return null;
    return new Date(y, m, d, Math.floor(t.endMin / 60), t.endMin % 60, 0, 0);
  }

  function isWorkShift(shiftKey) {
    return !!(SHIFT_TIMES[shiftKey] && SHIFT_TIMES[shiftKey].isWork);
  }

  function dateKey(y, m, d) {
    return y + '-' + pad2(m + 1) + '-' + pad2(d);
  }

  function keyOfDate(date) {
    return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // 该天 5 个班组分别在做什么
  function shiftsOfDay(y, m, d) {
    var out = [];
    for (var i = 0; i < TEAMS.length; i++) {
      out.push({ teamIdx: i, team: TEAMS[i], shift: shiftOfTeam(i, y, m, d) });
    }
    return out;
  }

  var SCHED = {
    SEQ: SEQ,
    TEAMS: TEAMS,
    WORK_SHIFTS: WORK_SHIFTS,
    ALL_SHIFTS: ALL_SHIFTS,
    SHIFT_TIMES: SHIFT_TIMES,
    ANCHOR: ANCHOR,
    ANCHOR_DAY: ANCHOR_DAY,
    mod: mod,
    utcDayNo: utcDayNo,
    dayIndex: dayIndex,
    teamPhase: teamPhase,
    shiftOfTeam: shiftOfTeam,
    shiftForDate: shiftForDate,
    shiftWindow: shiftWindow,
    shiftStartDate: shiftStartDate,
    shiftEndDate: shiftEndDate,
    isWorkShift: isWorkShift,
    dateKey: dateKey,
    keyOfDate: keyOfDate,
    shiftsOfDay: shiftsOfDay
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SCHED;
  global.SCHED = SCHED;
})(typeof window !== 'undefined' ? window : globalThis);
