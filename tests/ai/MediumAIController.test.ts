import { describe, it, expect } from 'vitest';
import { MediumAIController } from '@/ai/MediumAIController';
import { createInitialState } from '@/core/GameState';
import mediumCfg from '@/config/ai/medium.json';
import type { AIConfig } from '@/ai/AIContext';

const config = mediumCfg as AIConfig;
const dt = 1 / 60;

describe('MediumAIController', () => {
  it('decide 返回 Intent，playerId 与构造一致', () => {
    const ai = new MediumAIController(0, config);
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    expect(intent.playerId).toBe(0);
  });

  it('首次 decide 即选定目标格', () => {
    const ai = new MediumAIController(0, config);
    const state = createInitialState();
    ai.decide(state, dt);
    expect(ai.getContext().currentTargetCell).not.toBeNull();
  });

  it('未到 decisionInterval 时目标格保持稳定', () => {
    const ai = new MediumAIController(0, config);
    const state = createInitialState();
    ai.decide(state, dt);
    const first = { ...ai.getContext().currentTargetCell! };
    for (let i = 0; i < 5; i++) ai.decide(state, dt);
    expect(ai.getContext().currentTargetCell).toEqual(first);
  });

  it('过 decisionInterval 后目标格可能更新', () => {
    const ai = new MediumAIController(0, config);
    const state = createInitialState();
    ai.decide(state, dt);
    // Medium decisionInterval=400ms → 0.4s × 60Hz = 24 ticks
    const ticks = Math.ceil(config.decisionInterval / 1000 / dt) + 1;
    let changed = false;
    const initial = JSON.stringify(ai.getContext().currentTargetCell);
    for (let i = 0; i < ticks * 5; i++) {
      ai.decide(state, dt);
      if (JSON.stringify(ai.getContext().currentTargetCell) !== initial) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('moveDir 指向当前目标格中心方向', () => {
    const ai = new MediumAIController(0, config);
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    const target = ai.getContext().currentTargetCell!;
    const player = state.players[0];
    const expectedX = target.col + 0.5 - player.pos.x;
    const expectedY = target.row + 0.5 - player.pos.y;
    expect(intent.moveDir.x).toBeCloseTo(expectedX, 5);
    expect(intent.moveDir.y).toBeCloseTo(expectedY, 5);
  });

  it('持有亮态 speed 技能时倾向立即触发 useSkill', () => {
    const ai = new MediumAIController(0, config);
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'speed', used: false };
    const intent = ai.decide(state, dt);
    expect(intent.useSkill).toBe(true);
  });

  it('未持有技能时 useSkill 恒为 false', () => {
    const ai = new MediumAIController(0, config);
    const state = createInitialState();
    for (let i = 0; i < 60; i++) {
      const intent = ai.decide(state, dt);
      expect(intent.useSkill).toBe(false);
    }
  });

  it('playerId 越界返回零输入，不抛错', () => {
    const ai = new MediumAIController(99, config);
    const state = createInitialState();
    const intent = ai.decide(state, dt);
    expect(intent.playerId).toBe(99);
    expect(intent.moveDir).toEqual({ x: 0, y: 0 });
    expect(intent.dash).toBe(false);
    expect(intent.useSkill).toBe(false);
  });

  it('注入种子 RNG 时行为可重放（同种子两次跑得到相同 Intent 序列）', () => {
    function mulberry32(seed: number): () => number {
      let t = seed >>> 0;
      return () => {
        t = (t + 0x6d2b79f5) >>> 0;
        let r = t;
        r = Math.imul(r ^ (r >>> 15), r | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }
    const ai1 = new MediumAIController(0, config, mulberry32(42));
    const ai2 = new MediumAIController(0, config, mulberry32(42));
    const s1 = createInitialState();
    const s2 = createInitialState();
    for (let i = 0; i < 200; i++) {
      const a = ai1.decide(s1, dt);
      const b = ai2.decide(s2, dt);
      expect(a).toEqual(b);
    }
  });
});
