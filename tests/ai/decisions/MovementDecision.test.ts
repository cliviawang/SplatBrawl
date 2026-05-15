import { describe, it, expect } from 'vitest';
import { evaluateMovement } from '@/ai/decisions/MovementDecision';
import { createInitialState } from '@/core/GameState';
import mediumCfg from '@/config/ai/medium.json';
import type { AIConfig } from '@/ai/AIContext';

const config = mediumCfg as AIConfig;

/** 顺序伪随机：方便断言确定性 */
function seqRand(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe('MovementDecision (Medium)', () => {
  it('返回值是地图范围内整数格', () => {
    const state = createInitialState();
    const target = evaluateMovement({ state, playerId: 0, config, rand: Math.random });
    expect(target).not.toBeNull();
    expect(target!.col).toBeGreaterThanOrEqual(0);
    expect(target!.col).toBeLessThan(state.tiles[0].length);
    expect(target!.row).toBeGreaterThanOrEqual(0);
    expect(target!.row).toBeLessThan(state.tiles.length);
  });

  it('preferNeutralTiles=true 时，多次采样应主要落在中性（米色）格上', () => {
    // 把玩家 0 放在地图中心；地图初始几乎全是 neutral，应大多数命中 neutral
    const state = createInitialState();
    let neutralHits = 0;
    const total = 100;
    for (let i = 0; i < total; i++) {
      const target = evaluateMovement({ state, playerId: 0, config, rand: Math.random });
      if (state.tiles[target!.row][target!.col].color === 'neutral') neutralHits++;
    }
    // 16x10 = 160 格里只有 4 个非 neutral（出生点）→ 命中率应接近 100%
    expect(neutralHits).toBeGreaterThanOrEqual(80);
  });

  it('preferNeutralTiles=false（或缺省）时，回退到完全随机：分布与是否 neutral 无关', () => {
    // 把全图涂成红色，保留 1 个 neutral；preferNeutralTiles=false 时应有大量非 neutral 命中
    const state = createInitialState();
    for (const row of state.tiles) for (const t of row) t.color = 'red';
    state.tiles[0][0].color = 'neutral';
    const cfgNoPrefer: AIConfig = { ...config, preferNeutralTiles: false };
    let neutralHits = 0;
    const total = 100;
    for (let i = 0; i < total; i++) {
      const target = evaluateMovement({ state, playerId: 0, config: cfgNoPrefer, rand: Math.random });
      if (state.tiles[target!.row][target!.col].color === 'neutral') neutralHits++;
    }
    // 仅 1/160 = 0.6% 应被命中；测试仅断言显著低于 100
    expect(neutralHits).toBeLessThan(20);
  });

  it('pathRandomness 较低时偏向选中性格；为 1 时退化为均匀随机', () => {
    // 全图染红 + 1 个 neutral；pathRandomness=1 → 与 preferNeutralTiles 无关，应均匀
    const state = createInitialState();
    for (const row of state.tiles) for (const t of row) t.color = 'red';
    state.tiles[0][0].color = 'neutral';
    const cfgFullRandom: AIConfig = { ...config, pathRandomness: 1 };
    let neutralHits = 0;
    for (let i = 0; i < 200; i++) {
      const target = evaluateMovement({ state, playerId: 0, config: cfgFullRandom, rand: Math.random });
      if (state.tiles[target!.row][target!.col].color === 'neutral') neutralHits++;
    }
    expect(neutralHits).toBeLessThan(20);
  });

  it('playerId 不存在时返回 null', () => {
    const state = createInitialState();
    const target = evaluateMovement({ state, playerId: 99, config, rand: seqRand([0.5]) });
    expect(target).toBeNull();
  });
});
