import type { Color, GameState } from './types';

/**
 * 单项分数。
 *   - color: 颜色（含 'neutral'，调用方按需过滤）
 *   - count: 该颜色当前格子数
 *   - lastPaintedTick: 该颜色最后一次染色时所在 tick；用于 count 平局时判定
 *     （越大越靠前）。如果该颜色没有任何已染色格子（neutral 全图初始），返回 -1。
 */
export interface ColorScore {
  color: Color;
  count: number;
  lastPaintedTick: number;
}

const ALL_COLORS: Color[] = ['neutral', 'red', 'blue', 'yellow', 'green'];

/**
 * 统计当前 GameState 各颜色格数与最近染色时刻，按以下规则排序：
 *   1. count 降序（多者前）
 *   2. count 相同时 lastPaintedTick 降序（晚染色者前）
 *
 * 含 neutral 项；UI 通常仅展示 4 个玩家颜色。
 */
export function computeScores(state: GameState): ColorScore[] {
  const counts = new Map<Color, number>();
  const lastTicks = new Map<Color, number>();
  for (const c of ALL_COLORS) {
    counts.set(c, 0);
    lastTicks.set(c, -1);
  }

  for (const row of state.tiles) {
    for (const t of row) {
      counts.set(t.color, (counts.get(t.color) ?? 0) + 1);
      if (t.lastPaintedTick > (lastTicks.get(t.color) ?? -1)) {
        lastTicks.set(t.color, t.lastPaintedTick);
      }
    }
  }

  const scores: ColorScore[] = ALL_COLORS.map((color) => ({
    color,
    count: counts.get(color) ?? 0,
    lastPaintedTick: lastTicks.get(color) ?? -1,
  }));

  scores.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastPaintedTick - a.lastPaintedTick;
  });

  return scores;
}
