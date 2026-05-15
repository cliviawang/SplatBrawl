/**
 * 任务 6.3.3：护盾（shield）。
 *
 * 计划要点：
 *   - 3×3 自己格子标记 shielded
 *   - 5 秒后失效
 *   - 其他玩家踩上不染色（已在 movement.ts 阶段 6.3.1 顺手实现的 shieldUntilTick 检查）
 *
 * 实现备注：
 *   - 释放时同时设置：
 *     1. tile.shieldUntilTick （影响染色）
 *     2. state.areaEffects 推入一条 shield 类型（影响渲染层 + pickup 互斥）
 *   - 持续时长来自 skills.json/shield.durationSec
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '@/core/GameState';
import { _resetRegistry, getSkill } from '@/core/skills/registry';
import { registerShield } from '@/core/skills/shield';
import { applySkillUse } from '@/core/skills/applySkillUse';
import { applyMovement } from '@/core/movement';
import skillsCfg from '@/config/skills.json';
import gameCfg from '@/config/game.json';
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

describe('护盾（shield）', () => {
  beforeEach(() => {
    _resetRegistry();
    registerShield();
  });

  it('注册到 registry，type=area', () => {
    const skill = getSkill('shield');
    expect(skill).not.toBeNull();
    expect(skill!.type).toBe('area');
  });

  it('释放后中心 3×3 范围内"自己颜色"格子的 shieldUntilTick 被设置', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 5.5, y: 5.5 };
    state.players[0].skillSlot = { id: 'shield', used: false };
    // 把 3×3 全部涂成自己色（red）
    for (let r = 4; r <= 6; r++) {
      for (let c = 4; c <= 6; c++) {
        state.tiles[r][c].color = 'red';
      }
    }
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const expected = state.tick + Math.round(skillsCfg.shield.durationSec * gameCfg.tickRate);
    // 3×3：col=4..6, row=4..6
    for (let r = 4; r <= 6; r++) {
      for (let c = 4; c <= 6; c++) {
        expect(state.tiles[r][c].shieldUntilTick).toBe(expected);
      }
    }
    // 槽位置灰（保留 id，used=true）
    expect(state.players[0].skillSlot).toEqual({ id: 'shield', used: true });
  });

  it('释放后：3×3 范围内米色 / 敌色格子不被加盾', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 5.5, y: 5.5 };
    state.players[0].skillSlot = { id: 'shield', used: false };
    // 中心 (5,5) 自己色，周围混合：左上 neutral、右上 blue、其余 red
    for (let r = 4; r <= 6; r++) {
      for (let c = 4; c <= 6; c++) {
        state.tiles[r][c].color = 'red';
      }
    }
    state.tiles[4][4].color = 'neutral';
    state.tiles[4][6].color = 'blue';
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const expected = state.tick + Math.round(skillsCfg.shield.durationSec * gameCfg.tickRate);
    // 自己色：被加盾
    expect(state.tiles[5][5].shieldUntilTick).toBe(expected);
    expect(state.tiles[4][5].shieldUntilTick).toBe(expected);
    expect(state.tiles[6][6].shieldUntilTick).toBe(expected);
    // 米色 / 敌色：不加盾
    expect(state.tiles[4][4].shieldUntilTick).toBe(0);
    expect(state.tiles[4][6].shieldUntilTick).toBe(0);
  });

  it('释放后生成一条 shield AreaEffect，centerXY/owner/expireAtTick 正确', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 5.5, y: 5.5 };
    state.players[0].skillSlot = { id: 'shield', used: false };
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.areaEffects.length).toBe(1);
    const ae = state.areaEffects[0];
    expect(ae.type).toBe('shield');
    expect(ae.ownerId).toBe(0);
    expect(ae.centerX).toBe(5);
    expect(ae.centerY).toBe(5);
    const expected = state.tick + Math.round(skillsCfg.shield.durationSec * gameCfg.tickRate);
    expect(ae.expireAtTick).toBe(expected);
  });

  it('护盾区域内：其他玩家路过不染色', () => {
    const state = createInitialState();
    // 让护盾覆盖 (5,5)
    state.tiles[5][5].shieldUntilTick = state.tick + 300; // 5 秒
    state.tiles[5][5].color = 'neutral';
    // player[1] 蓝色，从 (4.5,5.5) 移动到 (5.5,5.5)
    state.players[1].pos = { x: 4.9, y: 5.5 };
    applyMovement(state, makeIntent(1, { moveDir: { x: 1, y: 0 } }), DT * 60); // 大步直接跨
    expect(state.tiles[5][5].color).toBe('neutral');
  });

  it('护盾区域内：施法者自己路过也不染色（简化处理）', () => {
    const state = createInitialState();
    state.tiles[5][5].shieldUntilTick = state.tick + 300;
    state.tiles[5][5].color = 'neutral';
    state.players[0].pos = { x: 4.9, y: 5.5 };
    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT * 60);
    expect(state.tiles[5][5].color).toBe('neutral');
  });

  it('边界：玩家在角落 (0.5, 0.5) 释放护盾 → 仅 2×2 自己色格子受影响（越界格跳过）', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 0.5, y: 0.5 };
    state.players[0].skillSlot = { id: 'shield', used: false };
    // 角落 2×2 涂成自己色
    state.tiles[0][0].color = 'red';
    state.tiles[0][1].color = 'red';
    state.tiles[1][0].color = 'red';
    state.tiles[1][1].color = 'red';
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const expected = state.tick + Math.round(skillsCfg.shield.durationSec * gameCfg.tickRate);
    // 仅 (0,0)/(1,0)/(0,1)/(1,1) 应受影响
    expect(state.tiles[0][0].shieldUntilTick).toBe(expected);
    expect(state.tiles[0][1].shieldUntilTick).toBe(expected);
    expect(state.tiles[1][0].shieldUntilTick).toBe(expected);
    expect(state.tiles[1][1].shieldUntilTick).toBe(expected);
  });
});
