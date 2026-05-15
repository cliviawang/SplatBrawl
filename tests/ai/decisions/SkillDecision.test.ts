import { describe, it, expect } from 'vitest';
import { evaluateSkill } from '@/ai/decisions/SkillDecision';
import { createInitialState } from '@/core/GameState';
import mediumCfg from '@/config/ai/medium.json';
import type { AIConfig } from '@/ai/AIContext';

const config = mediumCfg as AIConfig;

describe('SkillDecision (Medium)', () => {
  it('未持有技能时返回 false', () => {
    const state = createInitialState();
    expect(state.players[0].skillSlot).toBeNull();
    const out = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(out).toBe(false);
  });

  it('技能已被释放（used=true）时返回 false', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'rocket', used: true };
    const out = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(out).toBe(false);
  });

  it('眩晕中返回 false', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'rocket', used: false };
    state.players[0].stunUntilTick = state.tick + 30;
    const out = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(out).toBe(false);
  });

  it('skillPositionAware=true：rocket 仅当感知半径内有敌人时触发', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'rocket', used: false };
    // 把所有其他玩家挪到远处（玩家 0 在 (8.5,1.5)，把别人挪到 (15,9)）
    for (let i = 1; i < state.players.length; i++) {
      state.players[i].pos = { x: 15.5, y: 9.5 };
    }
    // awarenessRadius=8 → 玩家 0 到 (15.5,9.5) 距离 ≈ √(49+64) ≈ 10.6 → 不在半径内
    const out = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(out).toBe(false);
  });

  it('skillPositionAware=true：rocket 在感知半径内有敌人时触发', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'rocket', used: false };
    // 把玩家 1 挪到玩家 0 旁边
    state.players[1].pos = { x: state.players[0].pos.x + 2, y: state.players[0].pos.y };
    const out = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(out).toBe(true);
  });

  it('speed/laser 类技能持有即倾向于立即释放', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'speed', used: false };
    const out = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(out).toBe(true);
  });

  it('shield 类区域技能仅在自身周围有敌色格时触发', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'shield', used: false };
    // 玩家 0 (red) 在 (8.5, 1.5)；附近全 neutral → 不该立即放
    const outNear = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(outNear).toBe(false);
    // 把附近格子染成 blue（敌色），应该立即护盾保护
    state.tiles[1][7].color = 'blue';
    state.tiles[2][8].color = 'blue';
    const outAfter = evaluateSkill({ state, playerId: 0, config, rand: () => 0 });
    expect(outAfter).toBe(true);
  });

  it('skillPositionAware=false 时持有技能即触发', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'rocket', used: false };
    // 把别的玩家挪很远
    for (let i = 1; i < state.players.length; i++) {
      state.players[i].pos = { x: 15.5, y: 9.5 };
    }
    const cfgNoAware: AIConfig = { ...config, skillPositionAware: false };
    const out = evaluateSkill({ state, playerId: 0, config: cfgNoAware, rand: () => 0 });
    expect(out).toBe(true);
  });

  it('playerId 不存在时返回 false', () => {
    const state = createInitialState();
    const out = evaluateSkill({ state, playerId: 99, config, rand: () => 0 });
    expect(out).toBe(false);
  });
});
