import { describe, it, expect } from 'vitest';
import { AIController } from '@/ai/AIController';
import { createInitialState } from '@/core/GameState';
import easyCfg from '@/config/ai/easy.json';
import type { AIConfig } from '@/ai/AIContext';

const config = easyCfg as AIConfig;
const dt = 1 / 60;

/**
 * 构造一个固定序列的伪随机函数，便于断言确定性行为。
 * 传入 [v1, v2, ...]，循环读取（用完 wrap 回 0）。
 */
function seqRand(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe('AIController (Easy)', () => {
  it('decide 返回的 Intent playerId 与构造时一致', () => {
    const ai = new AIController(1, config);
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    expect(intent.playerId).toBe(1);
  });

  it('首次调用即选定目标格（不等 decisionInterval 到期）', () => {
    const ai = new AIController(1, config);
    const state = createInitialState();
    ai.decide(state, dt);
    expect(ai.getContext().currentTargetCell).not.toBeNull();
  });

  it('moveDir 指向目标格中心（非归一化，由 movement 统一处理）', () => {
    // 用固定随机让目标格确定落在 (col=2,row=3)
    // pickRandomCell: col = floor(0.15 * 16) = 2, row = floor(0.35 * 10) = 3
    // 后续 rand 决定 dash：给一个大值保证不触发 dash
    const ai = new AIController(1, config, seqRand([0.15, 0.35, 0.99]));
    const state = createInitialState();
    const p = state.players[1];
    const intent = ai.decide(state, dt);
    const expectedTx = 2 + 0.5;
    const expectedTy = 3 + 0.5;
    expect(intent.moveDir.x).toBeCloseTo(expectedTx - p.pos.x, 5);
    expect(intent.moveDir.y).toBeCloseTo(expectedTy - p.pos.y, 5);
  });

  it('decisionInterval 未到期前目标格保持不变', () => {
    const ai = new AIController(1, config, seqRand([0.15, 0.35, 0.99]));
    const state = createInitialState();
    ai.decide(state, dt);
    const firstTarget = { ...ai.getContext().currentTargetCell! };
    // 再走 10 tick，远远不到 800ms
    for (let i = 0; i < 10; i++) ai.decide(state, dt);
    const latest = ai.getContext().currentTargetCell!;
    expect(latest).toEqual(firstTarget);
  });

  it('经过 decisionInterval 秒后应重新选目标格', () => {
    // 首次抽 (col=2,row=3)，再抽 (col=10,row=7)
    // 再之间的 rand 给高值避免 dash 触发
    const ai = new AIController(
      1,
      config,
      seqRand([0.15, 0.35, 0.99, 0.65, 0.75, 0.99]),
    );
    const state = createInitialState();
    ai.decide(state, dt);
    const before = { ...ai.getContext().currentTargetCell! };
    // 模拟经过 0.8 秒（decisionInterval=800ms）
    const ticksToInterval = Math.ceil(config.decisionInterval / 1000 / dt);
    for (let i = 0; i < ticksToInterval; i++) ai.decide(state, dt);
    const after = ai.getContext().currentTargetCell!;
    expect(after).not.toEqual(before);
  });

  it('多次独立采样应产生分布在多个不同格的目标（随机性证据）', () => {
    // 不用 seq，让真实 Math.random 跑
    const uniqueCells = new Set<string>();
    for (let k = 0; k < 30; k++) {
      const ai = new AIController(1, config);
      const state = createInitialState();
      ai.decide(state, dt);
      const t = ai.getContext().currentTargetCell!;
      uniqueCells.add(`${t.col},${t.row}`);
    }
    // 30 次抽样在 160 格里至少落 5 个不同格。Easy 的 pathRandomness=0.7 意味着主要是随机。
    expect(uniqueCells.size).toBeGreaterThanOrEqual(5);
  });

  it('dash 概率约等于 dashChancePerSec * dt，大量采样逼近期望值', () => {
    // 让目标格选取不影响 dash 概率：把每次 decide 的随机消耗分开
    // 此处用独立 controller 各跑一次（每次首次 decide 会消耗 2 个 rand 抽目标 + 1 个判 dash）
    // 改用 10000 tick 跑同一 controller 更稳定
    let dashCount = 0;
    const totalTicks = 10000;
    const ai = new AIController(1, config);
    const state = createInitialState();
    for (let i = 0; i < totalTicks; i++) {
      const intent = ai.decide(state, dt);
      if (intent.dash) dashCount++;
    }
    const observedPerSec = dashCount / (totalTicks * dt);
    // 期望 ≈ 0.2/秒。宽松区间容忍噪声
    expect(observedPerSec).toBeGreaterThan(0.1);
    expect(observedPerSec).toBeLessThan(0.3);
  });

  it('useSkill 在本阶段恒为 false（阶段 6 才引入技能系统）', () => {
    const ai = new AIController(1, config);
    const state = createInitialState();
    for (let i = 0; i < 200; i++) {
      const intent = ai.decide(state, dt);
      expect(intent.useSkill).toBe(false);
    }
  });

  it('playerId 越界时返回零输入，不抛错', () => {
    const ai = new AIController(99, config);
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    expect(intent.playerId).toBe(99);
    expect(intent.moveDir).toEqual({ x: 0, y: 0 });
    expect(intent.dash).toBe(false);
  });
});
