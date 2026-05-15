/**
 * 任务 6.3.x：星星（star）。
 *
 * 计划要点：
 *   - 瞬发（type='instant'）；释放即生效，无 statusEffect / areaEffect / projectile / laserBeam
 *   - 统计全图各颜色格数（不含 neutral），找最多色；并列时随机选一种
 *   - 从该颜色的格子中随机选 min(tilesToClear, 候选数) 个变为 neutral
 *   - 护盾格（shieldUntilTick > tick）跳过
 *   - 候选数 < tilesToClear 时全部清除
 *   - 全图无任何彩色格（全 neutral）时为 no-op
 *   - 释放后 skillSlot 由 applySkillUse 清空
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createInitialState } from '@/core/GameState';
import { _resetRegistry, getSkill } from '@/core/skills/registry';
import { registerStar, cleanupStarFlashes } from '@/core/skills/star';
import { applySkillUse } from '@/core/skills/applySkillUse';
import skillsCfg from '@/config/skills.json';
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

/** 把整张地图先重置为 neutral，方便逐个布置测试场景。 */
function clearMap(state: GameState): void {
  for (let r = 0; r < state.tiles.length; r++) {
    for (let c = 0; c < state.tiles[r].length; c++) {
      state.tiles[r][c].color = 'neutral';
      state.tiles[r][c].lastPaintedTick = -1;
      state.tiles[r][c].shieldUntilTick = 0;
    }
  }
}

/** 统计全图某颜色格数。 */
function countColor(state: GameState, color: Color): number {
  let n = 0;
  for (const row of state.tiles) for (const t of row) if (t.color === color) n++;
  return n;
}

describe('星星（star）', () => {
  beforeEach(() => {
    _resetRegistry();
    registerStar();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('注册到 registry，type=instant', () => {
    const skill = getSkill('star');
    expect(skill).not.toBeUndefined();
    expect(skill!.type).toBe('instant');
  });

  it('全图最多色为 red，候选数 > tilesToClear：清除恰好 tilesToClear 个 red 格变为 neutral', () => {
    const state = createInitialState();
    clearMap(state);
    // 布 10 个 red、5 个 blue
    for (let i = 0; i < 10; i++) state.tiles[0][i].color = 'red';
    for (let i = 0; i < 5; i++) state.tiles[1][i].color = 'blue';

    const p = state.players[0]; // red caster（颜色不影响 star 的选择）
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const N = skillsCfg.star.tilesToClear;
    expect(countColor(state, 'red')).toBe(10 - N);
    expect(countColor(state, 'blue')).toBe(5); // 非最多色不动
  });

  it('最多色候选数不足 tilesToClear：候选格全部清空，其它颜色不动', () => {
    const state = createInitialState();
    clearMap(state);
    // red 仅 3 格（< 5）；blue 2 格
    state.tiles[0][0].color = 'red';
    state.tiles[0][1].color = 'red';
    state.tiles[0][2].color = 'red';
    state.tiles[1][0].color = 'blue';
    state.tiles[1][1].color = 'blue';

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(countColor(state, 'red')).toBe(0);
    expect(countColor(state, 'blue')).toBe(2);
  });

  it('全图无彩色格（全 neutral）：no-op，状态不变', () => {
    const state = createInitialState();
    clearMap(state);

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const tick = state.tick;
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(countColor(state, 'neutral')).toBe(state.tiles.length * state.tiles[0].length);
    // 所有 tile 的 lastPaintedTick 仍为 -1（说明 onCast 没动它们）
    for (const row of state.tiles) for (const t of row) expect(t.lastPaintedTick).toBe(-1);
    expect(state.tick).toBe(tick);
  });

  it('护盾格被跳过：受护盾保护的最多色格保留', () => {
    const state = createInitialState();
    clearMap(state);
    // 8 个 red：其中 5 个上护盾，剩下 3 个无护盾
    for (let i = 0; i < 5; i++) {
      state.tiles[0][i].color = 'red';
      state.tiles[0][i].shieldUntilTick = state.tick + 60;
    }
    for (let i = 5; i < 8; i++) {
      state.tiles[0][i].color = 'red';
    }
    // 1 个 blue 不动
    state.tiles[1][0].color = 'blue';

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 5 个护盾 red 必须保留，无护盾 3 个被全清（< tilesToClear=5 → 全清）
    for (let i = 0; i < 5; i++) expect(state.tiles[0][i].color).toBe('red');
    for (let i = 5; i < 8; i++) expect(state.tiles[0][i].color).toBe('neutral');
    expect(countColor(state, 'red')).toBe(5);
    expect(countColor(state, 'blue')).toBe(1);
  });

  it('并列最多：red 与 blue 各 8 格，random=0 时选 red（仅清 red），blue 不变', () => {
    const state = createInitialState();
    clearMap(state);
    for (let i = 0; i < 8; i++) state.tiles[0][i].color = 'red';
    for (let i = 0; i < 8; i++) state.tiles[1][i].color = 'blue';

    // Math.random() = 0 → 候选颜色数组里第 0 个被选中。
    // 实现里候选颜色按固定顺序枚举（red, blue, yellow, green），故 0 → red。
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const N = skillsCfg.star.tilesToClear;
    expect(countColor(state, 'red')).toBe(8 - N);
    expect(countColor(state, 'blue')).toBe(8); // blue 完全不动
  });

  it('并列最多：random≈0.99 时选 blue（仅清 blue），red 不变', () => {
    const state = createInitialState();
    clearMap(state);
    for (let i = 0; i < 8; i++) state.tiles[0][i].color = 'red';
    for (let i = 0; i < 8; i++) state.tiles[1][i].color = 'blue';

    // 候选颜色顺序 [red, blue]，random=0.99 → 索引 floor(0.99*2)=1 → blue
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const N = skillsCfg.star.tilesToClear;
    expect(countColor(state, 'red')).toBe(8);
    expect(countColor(state, 'blue')).toBe(8 - N);
  });

  it('被清格 lastPaintedTick 更新到当前 tick', () => {
    const state = createInitialState();
    clearMap(state);
    for (let i = 0; i < 10; i++) state.tiles[0][i].color = 'red';
    state.tick = 123;

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 找到所有变 neutral 的格子，它们的 lastPaintedTick 应为 123
    let cleared = 0;
    for (let i = 0; i < 10; i++) {
      if (state.tiles[0][i].color === 'neutral') {
        expect(state.tiles[0][i].lastPaintedTick).toBe(123);
        cleared++;
      }
    }
    expect(cleared).toBe(skillsCfg.star.tilesToClear);
  });

  it('不会推入 projectiles / areaEffects / laserBeams', () => {
    const state = createInitialState();
    clearMap(state);
    for (let i = 0; i < 10; i++) state.tiles[0][i].color = 'red';

    const projBefore = state.projectiles.length;
    const aeBefore = state.areaEffects.length;
    const lbBefore = state.laserBeams.length;

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.projectiles.length).toBe(projBefore);
    expect(state.areaEffects.length).toBe(aeBefore);
    expect(state.laserBeams.length).toBe(lbBefore);
  });

  it('释放后 state.starFlashes 新增一条，包含被清格坐标 / clearedColor / spawnedAtTick / expireAtTick', () => {
    const state = createInitialState();
    clearMap(state);
    for (let i = 0; i < 10; i++) state.tiles[0][i].color = 'red';
    state.tick = 100;

    const before = state.starFlashes.length;

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.starFlashes.length).toBe(before + 1);
    const flash = state.starFlashes[state.starFlashes.length - 1];
    expect(flash.ownerId).toBe(0);
    expect(flash.clearedColor).toBe('red');
    expect(flash.spawnedAtTick).toBe(100);
    expect(flash.expireAtTick).toBe(100 + skillsCfg.star.visualTicks);
    // tiles 数量应等于本次清色数（red 10 格、tilesToClear=5 → 5 格）
    expect(flash.tiles.length).toBe(skillsCfg.star.tilesToClear);
    // tiles 中的每个坐标对应的格子在 state 中确实已变为 neutral
    for (const t of flash.tiles) {
      expect(state.tiles[t.y][t.x].color).toBe('neutral');
    }
  });

  it('全图无彩色（no-op）：starFlashes 不新增', () => {
    const state = createInitialState();
    clearMap(state);
    const before = state.starFlashes.length;

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.starFlashes.length).toBe(before);
  });

  it('cleanupStarFlashes：到期 flash 被移除，未到期保留', () => {
    const state = createInitialState();
    clearMap(state);
    for (let i = 0; i < 10; i++) state.tiles[0][i].color = 'red';
    state.tick = 50;

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const v = skillsCfg.star.visualTicks;
    expect(state.starFlashes.length).toBe(1);

    // 到期前一 tick：仍保留
    state.tick = 50 + v - 1;
    cleanupStarFlashes(state);
    expect(state.starFlashes.length).toBe(1);

    // 到期 tick：被清掉
    state.tick = 50 + v;
    cleanupStarFlashes(state);
    expect(state.starFlashes.length).toBe(0);
  });

  it('释放后玩家 skillSlot 被清空（applySkillUse 通用流程）', () => {
    const state = createInitialState();
    clearMap(state);
    for (let i = 0; i < 10; i++) state.tiles[0][i].color = 'red';

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.players[0].skillSlot).toEqual({ id: 'star', used: true });
  });

  it('neutral 不计入最多色：即使 neutral 占绝大多数，也只清最多的彩色', () => {
    const state = createInitialState();
    clearMap(state); // 全 neutral
    // 仅 2 格 yellow
    state.tiles[0][0].color = 'yellow';
    state.tiles[0][1].color = 'yellow';

    const p = state.players[0];
    p.skillSlot = { id: 'star', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 2 < tilesToClear → 两格 yellow 全部变 neutral
    expect(countColor(state, 'yellow')).toBe(0);
  });
});
