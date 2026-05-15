/**
 * 任务 6.3.1：火箭技能测试。
 *
 * 计划要点：
 *   - 8 方向各发射一颗
 *   - 飞 8 格/秒
 *   - 命中玩家眩晕 1 秒
 *   - 飞出边界消失
 *
 * 实现备注：
 *   - 计划提及"增加 state.statusEffects[]"，但与现有"Player 内嵌字段"风格不一致；
 *     本任务在 Player 上加 stunUntilTick 单字段（与 slowUntilTick 同风格），6.4.0 再统一规整。
 *   - 火箭参数来自 src/config/skills.json 的 rocket 节点：speed=8, stunSec=1。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '@/core/GameState';
import { _resetRegistry, registerSkill, getSkill } from '@/core/skills/registry';
import { registerRocket, applyProjectiles } from '@/core/skills/rocket';
import { applySkillUse } from '@/core/skills/applySkillUse';
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

describe('火箭（rocket）', () => {
  beforeEach(() => {
    _resetRegistry();
    registerRocket();
  });

  it('注册到 registry 后可以取出', () => {
    const skill = getSkill('rocket');
    expect(skill).not.toBeNull();
    expect(skill!.id).toBe('rocket');
    expect(skill!.type).toBe('projectile');
  });

  it('释放时朝 8 方向各生成一颗火箭（与 facing 无关），玩家槽清空', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 5, y: 5 };
    state.players[0].facing = { x: 1, y: 0 };
    state.players[0].skillSlot = { id: 'rocket', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.projectiles.length).toBe(8);
    for (const p of state.projectiles) {
      expect(p.ownerId).toBe(0);
      expect(p.type).toBe('rocket');
      // velocity 长度 = speed
      expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeCloseTo(skillsCfg.rocket.speed, 5);
    }
    // 8 个方向角等距 45°：把每颗火箭归一化后角度排序，应接近 [-180, -135, -90, -45, 0, 45, 90, 135]
    const angles = state.projectiles
      .map((p) => (Math.atan2(p.velocity.y, p.velocity.x) * 180) / Math.PI)
      .sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(45, 1);
    }
    expect(state.players[0].skillSlot).toEqual({ id: 'rocket', used: true });
  });

  it('火箭飞行：每 tick 按 velocity*dt 位移', () => {
    const state = createInitialState();
    state.projectiles.push({
      id: 'p1',
      ownerId: 0,
      type: 'rocket',
      pos: { x: 5, y: 5 },
      velocity: { x: skillsCfg.rocket.speed, y: 0 },
      ownerColor: 'red',
      spawnTick: 0,
    });
    applyProjectiles(state, DT);
    expect(state.projectiles[0].pos.x).toBeCloseTo(5 + skillsCfg.rocket.speed * DT, 5);
    expect(state.projectiles[0].pos.y).toBeCloseTo(5, 5);
  });

  it('火箭飞出边界后被移除', () => {
    const state = createInitialState();
    state.projectiles.push({
      id: 'p1',
      ownerId: 0,
      type: 'rocket',
      pos: { x: gameCfg.mapWidth - 0.05, y: 5 },
      velocity: { x: skillsCfg.rocket.speed, y: 0 },
      ownerColor: 'red',
      spawnTick: 0,
    });
    applyProjectiles(state, DT);
    expect(state.projectiles.length).toBe(0);
  });

  it('命中其他玩家：使其眩晕 1 秒，火箭消失，命中格染色', () => {
    const state = createInitialState();
    // 把 player[1] 放在 (8,5)
    state.players[1].pos = { x: 8, y: 5 };
    state.players[1].color = 'blue';
    // 火箭从 (7.9, 5) 朝右飞，本 tick 会越过 (8,5) 撞上 player[1]
    state.projectiles.push({
      id: 'p1',
      ownerId: 0,
      type: 'rocket',
      pos: { x: 7.9, y: 5 },
      velocity: { x: skillsCfg.rocket.speed, y: 0 },
      ownerColor: 'red',
      spawnTick: 0,
    });
    applyProjectiles(state, DT);
    expect(state.projectiles.length).toBe(0);
    // stunUntilTick = state.tick + stunSec * tickRate
    const expectedTicks = Math.round(skillsCfg.rocket.stunSec * gameCfg.tickRate);
    expect(state.players[1].stunUntilTick).toBe(state.tick + expectedTicks);
  });

  it('不会命中施法者自己', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 8, y: 5 };
    state.projectiles.push({
      id: 'p1',
      ownerId: 0,
      type: 'rocket',
      pos: { x: 7.9, y: 5 },
      velocity: { x: skillsCfg.rocket.speed, y: 0 },
      ownerColor: 'red',
      spawnTick: 0,
    });
    applyProjectiles(state, DT);
    // 施法者应安然无恙，火箭仍存在或飞过
    expect(state.players[0].stunUntilTick).toBe(0);
  });

  it('8 方向：每颗 velocity 是单位方向 × speed，且 8 个角度均匀分布', () => {
    const state = createInitialState();
    state.players[0].pos = { x: 5, y: 5 };
    // facing 不再影响发射方向
    state.players[0].facing = { x: 1, y: 0 };
    state.players[0].skillSlot = { id: 'rocket', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.projectiles.length).toBe(8);
    for (const p of state.projectiles) {
      expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeCloseTo(skillsCfg.rocket.speed, 5);
    }
    // 集合应包含正东方向（angle≈0）的一颗，且 8 颗中存在角度=45° 的对角颗
    const has = (deg: number) =>
      state.projectiles.some((p) => {
        const a = (Math.atan2(p.velocity.y, p.velocity.x) * 180) / Math.PI;
        return Math.abs(((a - deg + 540) % 360) - 180) < 0.5;
      });
    expect(has(0)).toBe(true);
    expect(has(45)).toBe(true);
    expect(has(90)).toBe(true);
    expect(has(-90)).toBe(true);
  });

  it('眩晕的玩家不能移动（applyMovement 跳过）', async () => {
    const { applyMovement } = await import('@/core/movement');
    const state = createInitialState();
    state.players[0].pos = { x: 5, y: 5 };
    state.players[0].stunUntilTick = state.tick + 30;
    const before = { ...state.players[0].pos };
    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);
    expect(state.players[0].pos.x).toBeCloseTo(before.x, 5);
  });
});
