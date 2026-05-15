/**
 * 任务 6.4.3：炸弹（bomb）。
 *
 * 计划要点（与玩法规则对齐：干扰类，区域清米色）：
 *   - type='area'；释放即刻在 caster 当前格生成一条 AreaEffect{ type:'bomb', expireAtTick=tick+delaySec*60 }
 *   - 不阻挡走位、不互动、可踩；同位置允许多颗叠放（不合并）
 *   - 引爆当 tick：以中心 (cx,cy) 为基准，5×5 范围（radius=2）全部清为 neutral（含自己/他人颜色）
 *     - 越界 clamp（仅清地图内格）
 *     - 护盾格（shieldUntilTick > tick）跳过
 *     - 被清格 lastPaintedTick 更新到当前 tick
 *   - 引爆同 tick 推入 BombExplosion 视觉记录（paintedTiles = 实际被清色的格子列表）
 *   - 同 tick 由 cleanupAreaEffects 自然移除已到期的 bomb areaEffect
 *   - 视觉记录到期由 cleanupBombExplosions 移除（state.tick >= expireAtTick）
 *   - 释放后 skillSlot 由 applySkillUse 清空（通用流程）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import { createInitialState } from '@/core/GameState';
import { _resetRegistry, getSkill } from '@/core/skills/registry';
import { registerBomb, applyBombExplosions, cleanupBombExplosions } from '@/core/skills/bomb';
import { applySkillUse } from '@/core/skills/applySkillUse';
import { cleanupAreaEffects } from '@/core/skills/areaEffects';
import type { Color, GameState, PlayerIntent } from '@/core/types';

function makeIntent(playerId: number, partial: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    playerId,
    moveDir: { x: 0, y: 0 },
    dash: false,
    useSkill: false,
    ...partial,
  };
}

/** 重置整张地图为 neutral，便于在新场景上断言。 */
function clearMap(state: GameState): void {
  for (let r = 0; r < state.tiles.length; r++) {
    for (let c = 0; c < state.tiles[r].length; c++) {
      state.tiles[r][c].color = 'neutral';
      state.tiles[r][c].lastPaintedTick = -1;
      state.tiles[r][c].shieldUntilTick = 0;
    }
  }
}

/** 把玩家放到指定整数格（pos = col+0.5, row+0.5）。 */
function placePlayer(state: GameState, playerId: number, col: number, row: number): void {
  state.players[playerId].pos = { x: col + 0.5, y: row + 0.5 };
}

function countColor(state: GameState, color: Color): number {
  let n = 0;
  for (const row of state.tiles) for (const t of row) if (t.color === color) n++;
  return n;
}

describe('炸弹（bomb）', () => {
  beforeEach(() => {
    _resetRegistry();
    registerBomb();
  });

  it('注册到 registry，type=area', () => {
    const skill = getSkill('bomb');
    expect(skill).not.toBeUndefined();
    expect(skill!.type).toBe('area');
  });

  it('释放：在 caster 当前格生成一条 bomb AreaEffect，expireAtTick = tick + delaySec*tickRate', () => {
    const state = createInitialState();
    state.tick = 100;

    placePlayer(state, 0, 5, 4);
    state.players[0].skillSlot = { id: 'bomb', used: false };

    const aeBefore = state.areaEffects.length;
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.areaEffects.length).toBe(aeBefore + 1);
    const ae = state.areaEffects[state.areaEffects.length - 1];
    expect(ae.type).toBe('bomb');
    expect(ae.ownerId).toBe(0);
    expect(ae.centerX).toBe(5);
    expect(ae.centerY).toBe(4);
    expect(ae.expireAtTick).toBe(100 + skillsCfg.bomb.delaySec * gameCfg.tickRate);
  });

  it('释放后玩家 skillSlot 被清空（applySkillUse 通用流程）', () => {
    const state = createInitialState();
    placePlayer(state, 0, 5, 4);
    state.players[0].skillSlot = { id: 'bomb', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.players[0].skillSlot).toEqual({ id: 'bomb', used: true });
  });

  it('多颗叠放：连续两次释放（中间清 used 标记），areaEffects 长度 +2，且各自独立倒计时', () => {
    const state = createInitialState();
    state.tick = 50;
    placePlayer(state, 0, 5, 4);

    const intents = new Map<number, PlayerIntent>();

    // 第一次释放
    state.players[0].skillSlot = { id: 'bomb', used: false };
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 推进一 tick 再放第二次（拿到不同 expireAtTick）
    state.tick++;
    state.players[0].skillSlot = { id: 'bomb', used: false };
    applySkillUse(state, intents);

    const bombs = state.areaEffects.filter((ae) => ae.type === 'bomb');
    expect(bombs.length).toBe(2);
    // 两颗 expireAtTick 相差 1
    expect(bombs[1].expireAtTick - bombs[0].expireAtTick).toBe(1);
  });

  it('引爆：5×5 全部清为米色（远离边界），lastPaintedTick = 引爆 tick', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 5, 4); // owner=red（默认 spawn 0 号红）
    const ownerColor = state.players[0].color;

    // 先把目标 5×5 区域涂成 owner 色 + 范围外保留 neutral，验证"清色而非染色"
    for (let r = 2; r <= 6; r++) {
      for (let c = 3; c <= 7; c++) {
        state.tiles[r][c].color = ownerColor;
      }
    }

    // 直接构造一颗本 tick 引爆的 bomb
    state.tick = 200;
    state.areaEffects.push({
      id: 'bomb_test_0',
      type: 'bomb',
      ownerId: 0,
      centerX: 5,
      centerY: 4,
      expireAtTick: 200,
    });

    applyBombExplosions(state);

    // 5×5 = 25 格全部被清为 neutral（玩法规则·干扰类，含自己颜色一并清除）
    let cleared = 0;
    for (let r = 2; r <= 6; r++) {
      for (let c = 3; c <= 7; c++) {
        expect(state.tiles[r][c].color).toBe('neutral');
        expect(state.tiles[r][c].lastPaintedTick).toBe(200);
        cleared++;
      }
    }
    expect(cleared).toBe(25);
    // 范围外的格仍是 neutral（未被波及，也未被改写）
    expect(state.tiles[1][5].color).toBe('neutral');
    expect(state.tiles[7][5].color).toBe('neutral');
  });

  it('引爆边界 clamp：caster 在 (0,0)，仅清地图内 3×3 = 9 格', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 0, 0);
    const ownerColor = state.players[0].color;

    // 把整图涂成 owner 色（含目标 3×3 与范围外），验证"清色仅作用于范围内"
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[r].length; c++) {
        state.tiles[r][c].color = ownerColor;
      }
    }

    state.tick = 300;
    state.areaEffects.push({
      id: 'bomb_test_corner',
      type: 'bomb',
      ownerId: 0,
      centerX: 0,
      centerY: 0,
      expireAtTick: 300,
    });

    applyBombExplosions(state);

    // 左上 3×3 = (0..2, 0..2) 应被清为 neutral
    let cleared = 0;
    for (let r = 0; r <= 2; r++) {
      for (let c = 0; c <= 2; c++) {
        expect(state.tiles[r][c].color).toBe('neutral');
        cleared++;
      }
    }
    expect(cleared).toBe(9);
    // 全图 neutral 仅 9 格（其它仍 owner 色 —— 证明范围外未被波及）
    expect(countColor(state, 'neutral')).toBe(9);
  });

  it('护盾跳过：5×5 中部分格有 shield，清色仅作用在非护盾格', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 5, 4);

    // 把目标 5×5 涂成 blue（敌色），验证"护盾保留敌色，其它清米色"
    const enemyColor: Color = 'blue';
    for (let r = 2; r <= 6; r++) {
      for (let c = 3; c <= 7; c++) {
        state.tiles[r][c].color = enemyColor;
      }
    }

    state.tick = 400;
    // (col=4,row=3) 与 (col=5,row=4) 两格上护盾
    state.tiles[3][4].shieldUntilTick = state.tick + 60;
    state.tiles[4][5].shieldUntilTick = state.tick + 60;

    state.areaEffects.push({
      id: 'bomb_test_shield',
      type: 'bomb',
      ownerId: 0,
      centerX: 5,
      centerY: 4,
      expireAtTick: 400,
    });

    applyBombExplosions(state);

    // 护盾格保留 enemyColor（不被清），其它 23 格清为 neutral
    expect(state.tiles[3][4].color).toBe(enemyColor);
    expect(state.tiles[4][5].color).toBe(enemyColor);
    // 5×5 范围内：2 格仍 enemy，23 格变 neutral
    let neutralIn = 0;
    let enemyIn = 0;
    for (let r = 2; r <= 6; r++) {
      for (let c = 3; c <= 7; c++) {
        if (state.tiles[r][c].color === 'neutral') neutralIn++;
        else if (state.tiles[r][c].color === enemyColor) enemyIn++;
      }
    }
    expect(neutralIn).toBe(23);
    expect(enemyIn).toBe(2);
  });

  it('引爆同 tick 推入 BombExplosion 视觉记录，paintedTiles = 实际被清色的格子列表', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 5, 4);

    state.tick = 500;
    state.areaEffects.push({
      id: 'bomb_test_visual',
      type: 'bomb',
      ownerId: 0,
      centerX: 5,
      centerY: 4,
      expireAtTick: 500,
    });
    // 给一格上护盾，使 paintedTiles 为 24
    state.tiles[4][5].shieldUntilTick = state.tick + 60;

    const before = state.bombExplosions.length;
    applyBombExplosions(state);

    expect(state.bombExplosions.length).toBe(before + 1);
    const ex = state.bombExplosions[state.bombExplosions.length - 1];
    expect(ex.ownerId).toBe(0);
    expect(ex.centerX).toBe(5);
    expect(ex.centerY).toBe(4);
    expect(ex.spawnedAtTick).toBe(500);
    expect(ex.expireAtTick).toBe(500 + skillsCfg.bomb.explosionVisualTicks);
    // 24 格（25 - 1 护盾）
    expect(ex.paintedTiles.length).toBe(24);
    // paintedTiles 中不包含被护盾跳过的 (5,4)
    const hit = ex.paintedTiles.find((t) => t.x === 5 && t.y === 4);
    expect(hit).toBeUndefined();
  });

  it('引爆 + cleanupAreaEffects 同 tick：bomb areaEffect 被清，清色已生效', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 5, 4);
    const ownerColor = state.players[0].color;

    // 把目标中心格涂成 owner 色，验证引爆后被清米色
    state.tiles[4][5].color = ownerColor;

    state.tick = 600;
    state.areaEffects.push({
      id: 'bomb_test_cleanup',
      type: 'bomb',
      ownerId: 0,
      centerX: 5,
      centerY: 4,
      expireAtTick: 600,
    });

    // 真实 GameLoop 顺序：先引爆，再清理 areaEffects
    applyBombExplosions(state);
    cleanupAreaEffects(state);

    // 没有残留的 bomb areaEffect
    expect(state.areaEffects.filter((ae) => ae.id === 'bomb_test_cleanup').length).toBe(0);
    // 清色生效：原本的 owner 色被清为 neutral
    expect(state.tiles[4][5].color).toBe('neutral');
  });

  it('未到期的 bomb 不引爆', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 5, 4);
    const ownerColor = state.players[0].color;
    // 把目标中心格涂上 owner 色，验证"未引爆时不会被清"
    state.tiles[4][5].color = ownerColor;

    state.tick = 100;
    state.areaEffects.push({
      id: 'bomb_test_pending',
      type: 'bomb',
      ownerId: 0,
      centerX: 5,
      centerY: 4,
      expireAtTick: 200, // 远期
    });

    applyBombExplosions(state);

    // 染色未被清（仍为 owner 色）、没视觉记录
    expect(state.tiles[4][5].color).toBe(ownerColor);
    expect(state.bombExplosions.length).toBe(0);
    // areaEffect 仍在
    expect(state.areaEffects.length).toBe(1);
  });

  it('cleanupBombExplosions：到期记录被移除，未到期保留', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 5, 4);

    state.tick = 700;
    state.areaEffects.push({
      id: 'bomb_test_cb',
      type: 'bomb',
      ownerId: 0,
      centerX: 5,
      centerY: 4,
      expireAtTick: 700,
    });
    applyBombExplosions(state);

    expect(state.bombExplosions.length).toBe(1);
    const v = skillsCfg.bomb.explosionVisualTicks;

    // 到期前一 tick：保留
    state.tick = 700 + v - 1;
    cleanupBombExplosions(state);
    expect(state.bombExplosions.length).toBe(1);

    // 到期 tick：被清
    state.tick = 700 + v;
    cleanupBombExplosions(state);
    expect(state.bombExplosions.length).toBe(0);
  });

  it('多颗同 tick 同点引爆：分别推入两条 BombExplosion，清色幂等', () => {
    const state = createInitialState();
    clearMap(state);
    placePlayer(state, 0, 5, 4);
    const ownerColor = state.players[0].color;

    // 把目标 5×5 涂成 owner 色，便于验证两颗都引爆后整片清米色
    for (let r = 2; r <= 6; r++) {
      for (let c = 3; c <= 7; c++) {
        state.tiles[r][c].color = ownerColor;
      }
    }

    state.tick = 800;
    state.areaEffects.push(
      {
        id: 'bomb_test_a',
        type: 'bomb',
        ownerId: 0,
        centerX: 5,
        centerY: 4,
        expireAtTick: 800,
      },
      {
        id: 'bomb_test_b',
        type: 'bomb',
        ownerId: 0,
        centerX: 5,
        centerY: 4,
        expireAtTick: 800,
      }
    );

    applyBombExplosions(state);

    // 视觉记录两条
    expect(state.bombExplosions.length).toBe(2);
    // 清色幂等：5×5 = 25 格全部 neutral，第二颗在已清米色的格上再清一次仍是 neutral
    let neutralIn = 0;
    for (let r = 2; r <= 6; r++) {
      for (let c = 3; c <= 7; c++) {
        if (state.tiles[r][c].color === 'neutral') neutralIn++;
      }
    }
    expect(neutralIn).toBe(25);
  });
});
