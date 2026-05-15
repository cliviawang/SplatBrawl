import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/core/GameState';
import { computeScores } from '@/core/scoring';
import type { Color } from '@/core/types';

describe('computeScores', () => {
  it('按格数降序返回 4 色 + neutral 的分数', () => {
    const s = createInitialState();
    // 整图染成单色（除一个 blue 格）便于排序断言
    const H = s.tiles.length;
    const W = s.tiles[0].length;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        s.tiles[r][c].color = 'red';
        s.tiles[r][c].lastPaintedTick = 1;
      }
    }
    s.tiles[0][0].color = 'blue';
    s.tiles[0][0].lastPaintedTick = 2;

    const scores = computeScores(s);
    // 分数最高在第一位
    expect(scores[0].color).toBe('red');
    expect(scores[0].count).toBe(H * W - 1);
    // blue 1 格紧随其后
    const blue = scores.find((e) => e.color === 'blue')!;
    expect(blue.count).toBe(1);
  });

  it('包含全部 5 种颜色（含未染色 neutral）', () => {
    const s = createInitialState();
    const scores = computeScores(s);
    const colors = scores.map((e) => e.color).sort();
    expect(colors).toEqual(['blue', 'green', 'neutral', 'red', 'yellow']);
  });

  it('count 相同时 lastPaintedTick 较大者排前', () => {
    const s = createInitialState();
    // 清空已染色出生点，方便构造
    for (const row of s.tiles) for (const t of row) {
      t.color = 'neutral';
      t.lastPaintedTick = -1;
    }
    // red 1 格 tick=10；blue 1 格 tick=20
    s.tiles[0][0].color = 'red';
    s.tiles[0][0].lastPaintedTick = 10;
    s.tiles[0][1].color = 'blue';
    s.tiles[0][1].lastPaintedTick = 20;

    const scores = computeScores(s);
    // 取出 red / blue 在结果中的下标，blue 必须在 red 之前
    const idx = (c: Color) => scores.findIndex((e) => e.color === c);
    expect(idx('blue')).toBeLessThan(idx('red'));
  });

  it('各项 count 之和等于地图总格数', () => {
    const s = createInitialState();
    const total = s.tiles.length * s.tiles[0].length;
    const sum = computeScores(s).reduce((acc, e) => acc + e.count, 0);
    expect(sum).toBe(total);
  });
});
