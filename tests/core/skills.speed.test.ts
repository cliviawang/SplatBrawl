/**
 * 任务 6.3.2：极速（speed）。
 *
 * 计划要点：
 *   - 玩家 statusEffect.speed 起效，3 秒后失效
 *   - 期间 speed × multiplier（默认 ×2）
 *   - movement.ts 读取 statusEffect
 *
 * 实现备注：
 *   - 沿用"Player 内嵌 *UntilTick 字段"风格 → speedBoostUntilTick（在 6.3.1 已加）
 *   - 释放：onCast 设置 speedBoostUntilTick = state.tick + durationSec * tickRate
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '@/core/GameState';
import { _resetRegistry, getSkill } from '@/core/skills/registry';
import { registerSpeed } from '@/core/skills/speed';
import { applySkillUse } from '@/core/skills/applySkillUse';
import { applyMovement } from '@/core/movement';
import skillsCfg from '@/config/skills.json';
import gameCfg from '@/config/game.json';
import playerCfg from '@/config/player.json';
import type { PlayerIntent } from '@/core/types';

const DT = 1 / gameCfg.tickRate;

function makeIntent(playerId: number, partial: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    playerId,
    moveDir: { x: 0, y: 0 },
    dash: false,
    useSkill: false,
    ...partial,
  };
}

describe('极速（speed）', () => {
  beforeEach(() => {
    _resetRegistry();
    registerSpeed();
  });

  it('注册到 registry', () => {
    const skill = getSkill('speed');
    expect(skill).not.toBeNull();
    expect(skill!.type).toBe('buff');
  });

  it('释放后 speedBoostUntilTick = tick + durationSec * tickRate，槽位清空', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'speed', used: false };
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const expected = state.tick + Math.round(skillsCfg.speed.durationSec * gameCfg.tickRate);
    expect(state.players[0].speedBoostUntilTick).toBe(expected);
    expect(state.players[0].skillSlot).toEqual({ id: 'speed', used: true });
  });

  it('生效期间 movement 速度 × multiplier', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 5, y: 5 };
    state.players[0].speedBoostUntilTick = state.tick + 60; // 1 秒
    const before = state.players[0].pos.x;
    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);
    const expectedDelta = playerCfg.moveSpeed * skillsCfg.speed.multiplier * DT;
    expect(state.players[0].pos.x - before).toBeCloseTo(expectedDelta, 5);
  });

  it('生效期外 movement 速度恢复正常', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 5, y: 5 };
    // speedBoostUntilTick = 0 即默认未生效
    const before = state.players[0].pos.x;
    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);
    expect(state.players[0].pos.x - before).toBeCloseTo(playerCfg.moveSpeed * DT, 5);
  });

  it('眩晕中无法释放极速（卡槽不消耗）', () => {
    const state = createInitialState();
    state.players[0].stunUntilTick = state.tick + 30;
    state.players[0].skillSlot = { id: 'speed', used: false };
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);
    expect(state.players[0].speedBoostUntilTick).toBe(0);
    expect(state.players[0].skillSlot).not.toBeNull();
  });
});
