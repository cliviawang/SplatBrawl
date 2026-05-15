/**
 * 任务 6.3.5：涂刷（roller）。
 *
 * 计划要点：
 *   - 玩家 buff 期间，移动跨入新格时除染脚下格外，左右相邻格（垂直于 facing 主轴的两侧 ±1）一并染色
 *   - 持续时长来自 skills.json/roller.durationSec
 *
 * 实现备注：
 *   - 沿用 *UntilTick 风格 → Player 加 rollerUntilTick
 *   - 量化方向复用 laser 的 quantizeDirection；扩展轴 = 主轴的垂直方向
 *   - 染色一致性：扩展格也要做 shieldUntilTick / 越界检查；不检查格上有没有人（与全局染色哲学一致）
 *   - 同 tick 多人染同格："后执行覆盖"，与普通走路染色一致，无额外仲裁
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '@/core/GameState';
import { _resetRegistry, getSkill } from '@/core/skills/registry';
import { registerRoller } from '@/core/skills/roller';
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

describe('涂刷（roller）', () => {
  beforeEach(() => {
    _resetRegistry();
    registerRoller();
  });

  it('注册到 registry，type=buff', () => {
    const skill = getSkill('roller');
    expect(skill).not.toBeNull();
    expect(skill!.type).toBe('buff');
  });

  it('释放后 rollerUntilTick = tick + durationSec * tickRate，槽位清空', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'roller', used: false };
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const expected = state.tick + Math.round(skillsCfg.roller.durationSec * gameCfg.tickRate);
    expect(state.players[0].rollerUntilTick).toBe(expected);
    expect(state.players[0].skillSlot).toEqual({ id: 'roller', used: true });
  });

  it('眩晕中无法释放涂刷（卡槽不消耗）', () => {
    const state = createInitialState();
    state.players[0].stunUntilTick = state.tick + 30;
    state.players[0].skillSlot = { id: 'roller', used: false };
    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);
    expect(state.players[0].rollerUntilTick).toBe(0);
    expect(state.players[0].skillSlot).not.toBeNull();
  });

  it('生效期内水平移动跨格：除脚下格外，上下两个邻格一并染色', () => {
    const state = createInitialState();
    const p = state.players[0];
    // 放到地图中央，远离边界，避免出界跳过干扰
    p.pos.x = 5.99; // 紧贴右边界，本帧必跨入第 6 列
    p.pos.y = 5.5;
    // 将 6 列周围 3 格初始化为 neutral，方便断言
    state.tiles[5][6].color = 'neutral';
    state.tiles[4][6].color = 'neutral';
    state.tiles[6][6].color = 'neutral';
    p.rollerUntilTick = state.tick + 60;

    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);

    // 脚下格（行=5）+ 上下邻格（行=4 / 行=6），第 6 列三格都被染成 red
    expect(state.tiles[5][6].color).toBe(p.color);
    expect(state.tiles[4][6].color).toBe(p.color);
    expect(state.tiles[6][6].color).toBe(p.color);
  });

  it('生效期内垂直移动跨格：除脚下格外，左右两个邻格一并染色', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos.x = 5.5;
    p.pos.y = 5.99; // 紧贴下边界，本帧必跨入第 6 行
    p.facing = { x: 0, y: 1 }; // 显式设为垂直，避免 createInitialState 默认 facing 影响判定
    state.tiles[6][5].color = 'neutral';
    state.tiles[6][4].color = 'neutral';
    state.tiles[6][6].color = 'neutral';
    p.rollerUntilTick = state.tick + 60;

    applyMovement(state, makeIntent(0, { moveDir: { x: 0, y: 1 } }), DT);

    // 脚下格（列=5）+ 左右邻格（列=4 / 列=6），第 6 行三格都被染成 red
    expect(state.tiles[6][5].color).toBe(p.color);
    expect(state.tiles[6][4].color).toBe(p.color);
    expect(state.tiles[6][6].color).toBe(p.color);
  });

  it('未跨格时不触发宽染色（只在跨格瞬间扩展）', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos.x = 5.5; // 格内中央
    p.pos.y = 5.5;
    state.tiles[4][5].color = 'neutral';
    state.tiles[6][5].color = 'neutral';
    p.rollerUntilTick = state.tick + 60;

    // 一帧位移远小于 1 格 → 不会跨格
    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);

    // 上下邻格保持 neutral
    expect(state.tiles[4][5].color).toBe('neutral');
    expect(state.tiles[6][5].color).toBe('neutral');
  });

  it('生效期外：跨格只染脚下格，不扩展', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos.x = 5.99;
    p.pos.y = 5.5;
    state.tiles[5][6].color = 'neutral';
    state.tiles[4][6].color = 'neutral';
    state.tiles[6][6].color = 'neutral';
    // rollerUntilTick = 0 即默认未生效

    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);

    // 脚下格被染，上下邻格保持 neutral
    expect(state.tiles[5][6].color).toBe(p.color);
    expect(state.tiles[4][6].color).toBe('neutral');
    expect(state.tiles[6][6].color).toBe('neutral');
  });

  it('扩展染色跳过护盾格', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos.x = 5.99;
    p.pos.y = 5.5;
    state.tiles[5][6].color = 'neutral';
    state.tiles[4][6].color = 'neutral';
    state.tiles[6][6].color = 'neutral';
    // 上邻格被护盾保护
    state.tiles[4][6].shieldUntilTick = state.tick + 300;
    p.rollerUntilTick = state.tick + 60;

    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);

    // 脚下格 + 下邻格染色，上邻格因护盾保持 neutral
    expect(state.tiles[5][6].color).toBe(p.color);
    expect(state.tiles[6][6].color).toBe(p.color);
    expect(state.tiles[4][6].color).toBe('neutral');
  });

  it('扩展染色越界跳过：贴上边界时只染脚下 + 下邻格', () => {
    const state = createInitialState();
    const p = state.players[0];
    // 玩家在第 0 行，水平移动跨格 → 主轴水平 → 扩展轴垂直
    // 上邻格 (row=-1) 越界应跳过；下邻格 (row=1) 正常染
    p.pos.x = 5.99;
    p.pos.y = 0.5;
    state.tiles[0][6].color = 'neutral';
    state.tiles[1][6].color = 'neutral';
    p.rollerUntilTick = state.tick + 60;

    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);

    expect(state.tiles[0][6].color).toBe(p.color);
    expect(state.tiles[1][6].color).toBe(p.color);
  });

  it('扩展染色覆盖敌色格（无优先级，后画的覆盖前画的）', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos.x = 5.99;
    p.pos.y = 5.5;
    // 上邻格本来是敌色
    state.tiles[4][6].color = 'blue';
    state.tiles[5][6].color = 'neutral';
    state.tiles[6][6].color = 'neutral';
    p.rollerUntilTick = state.tick + 60;

    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0 } }), DT);

    // 敌色被覆盖为自己色
    expect(state.tiles[4][6].color).toBe(p.color);
  });

  it('斜向移动：按 facing 主轴量化扩展方向（|x|>=|y| → 水平主轴 → 上下扩）', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos.x = 5.99;
    p.pos.y = 5.5;
    state.tiles[4][6].color = 'neutral';
    state.tiles[6][6].color = 'neutral';
    p.rollerUntilTick = state.tick + 60;

    // 斜向 (1, 0.3) 主轴是 x
    applyMovement(state, makeIntent(0, { moveDir: { x: 1, y: 0.3 } }), DT);

    expect(state.tiles[4][6].color).toBe(p.color);
    expect(state.tiles[6][6].color).toBe(p.color);
  });
});
