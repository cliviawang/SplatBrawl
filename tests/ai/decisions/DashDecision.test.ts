import { describe, it, expect } from 'vitest';
import { evaluateDash } from '@/ai/decisions/DashDecision';
import { createInitialState } from '@/core/GameState';
import mediumCfg from '@/config/ai/medium.json';
import type { AIConfig } from '@/ai/AIContext';

const config = mediumCfg as AIConfig;
const dt = 1 / 60;

function seqRand(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe('DashDecision (Medium)', () => {
  it('冲刺正在冷却时返回 null', () => {
    const state = createInitialState();
    state.players[0].dashState.phase = 'cooldown';
    state.players[0].dashState.timer = 1;
    const out = evaluateDash({ state, playerId: 0, config, rand: seqRand([0]) }, dt);
    expect(out).toBeNull();
  });

  it('正在冲刺中返回 null（不重复触发）', () => {
    const state = createInitialState();
    state.players[0].dashState.phase = 'dashing';
    const out = evaluateDash({ state, playerId: 0, config, rand: seqRand([0]) }, dt);
    expect(out).toBeNull();
  });

  it('idle 且抽到的随机数小于阈值时返回方向向量', () => {
    const state = createInitialState();
    // dashChancePerSec=0.5, dt=1/60 → 阈值 ≈ 0.00833；rand=0 必触发
    const out = evaluateDash({ state, playerId: 0, config, rand: seqRand([0]) }, dt);
    expect(out).not.toBeNull();
    expect(typeof out!.dir.x).toBe('number');
    expect(typeof out!.dir.y).toBe('number');
  });

  it('idle 但抽到的随机数大于阈值时返回 null', () => {
    const state = createInitialState();
    const out = evaluateDash({ state, playerId: 0, config, rand: seqRand([0.99]) }, dt);
    expect(out).toBeNull();
  });

  it('dashTargetPriority="nearest" 时方向指向最近的敌色格（若可见）', () => {
    const state = createInitialState();
    // 玩家 0 (red) 在 (8,1) 中心。把 (9,1) 染成 blue（敌色，距离 1 格）
    // 把 (0,0) 染成 yellow（敌色，距离更远）
    state.tiles[1][9].color = 'blue';
    state.tiles[0][0].color = 'yellow';
    const out = evaluateDash({ state, playerId: 0, config, rand: seqRand([0]) }, dt);
    expect(out).not.toBeNull();
    // 朝 (9,1) 的方向：dx>0, dy≈0
    expect(out!.dir.x).toBeGreaterThan(0);
    expect(Math.abs(out!.dir.y)).toBeLessThan(0.5);
  });

  it('dashTargetPriority="random" 时方向是单位向量但不依赖最近敌色格', () => {
    const state = createInitialState();
    const cfgRandom: AIConfig = { ...config, dashTargetPriority: 'random' };
    // 给一组：rand=0 触发 dash；后两个 rand 决定方向（角度随机化）
    const out = evaluateDash(
      { state, playerId: 0, config: cfgRandom, rand: seqRand([0, 0.25, 0.75]) },
      dt,
    );
    expect(out).not.toBeNull();
    const mag = Math.hypot(out!.dir.x, out!.dir.y);
    expect(mag).toBeCloseTo(1, 3);
  });

  it('返回方向是单位向量', () => {
    const state = createInitialState();
    state.tiles[1][10].color = 'blue';
    const out = evaluateDash({ state, playerId: 0, config, rand: seqRand([0]) }, dt);
    expect(out).not.toBeNull();
    const mag = Math.hypot(out!.dir.x, out!.dir.y);
    expect(mag).toBeCloseTo(1, 3);
  });

  it('眩晕中返回 null', () => {
    const state = createInitialState();
    state.players[0].stunUntilTick = state.tick + 30;
    const out = evaluateDash({ state, playerId: 0, config, rand: seqRand([0]) }, dt);
    expect(out).toBeNull();
  });

  it('playerId 不存在时返回 null', () => {
    const state = createInitialState();
    const out = evaluateDash({ state, playerId: 99, config, rand: seqRand([0]) }, dt);
    expect(out).toBeNull();
  });
});
