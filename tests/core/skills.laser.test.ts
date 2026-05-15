/**
 * 任务 6.3.4：激光（laser）。
 *
 * 计划要点：
 *   - 瞬发（type='instant'）；释放即生效，无 statusEffect / areaEffect / projectile
 *   - 根据 facing 量化为上/下/左/右四方向：从玩家所在格出发，沿朝向到边界的"半段"染色
 *     - right：第 cy 行 c ∈ [cx, W-1]
 *     - left ：第 cy 行 c ∈ [0, cx]
 *     - down ：第 cx 列 r ∈ [cy, H-1]
 *     - up   ：第 cx 列 r ∈ [0, cy]
 *   - 米色 / 敌色 / 自色 一律覆盖为施法者颜色，护盾格（shieldUntilTick > tick）跳过
 *   - 包含玩家所在格本身（脚下格也染）；玩家身后保持原色
 *   - 量化规则：|facing.x| > |facing.y| → 水平；反之 → 垂直；相等优先水平；零向量回退到垂直（默认朝下）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '@/core/GameState';
import { _resetRegistry, getSkill } from '@/core/skills/registry';
import { registerLaser, cleanupLaserBeams } from '@/core/skills/laser';
import { applySkillUse } from '@/core/skills/applySkillUse';
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import type { PlayerIntent } from '@/core/types';

function makeIntent(playerId: number, partial: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    playerId,
    moveDir: { x: 0, y: 0 },
    dash: false,
    useSkill: false,
    ...partial,
  };
}

describe('激光（laser）', () => {
  beforeEach(() => {
    _resetRegistry();
    registerLaser();
  });

  it('注册到 registry，type=instant', () => {
    const skill = getSkill('laser');
    expect(skill).not.toBeUndefined();
    expect(skill!.type).toBe('instant');
  });

  it('面朝右（1,0）：从脚下格到右边界染色，左侧保留原色', () => {
    const state = createInitialState();
    const p = state.players[0]; // red
    p.pos = { x: 5.5, y: 7.5 }; // cx=5
    p.facing = { x: 1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };

    // 第 7 行混合颜色（左侧应保留，右侧应染）
    state.tiles[7][0].color = 'blue';
    state.tiles[7][3].color = 'yellow';
    state.tiles[7][5].color = 'red';
    state.tiles[7][gameCfg.mapWidth - 1].color = 'green';
    // 其他行不应被染
    state.tiles[6][5].color = 'blue';
    state.tiles[8][5].color = 'blue';

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 第 7 行 c ∈ [5, W-1] 染为 red
    for (let c = 5; c < gameCfg.mapWidth; c++) {
      expect(state.tiles[7][c].color).toBe('red');
    }
    // 玩家身后 c ∈ [0, 4] 保持原色
    expect(state.tiles[7][0].color).toBe('blue');
    expect(state.tiles[7][3].color).toBe('yellow');
    // 其他行不受影响
    expect(state.tiles[6][5].color).toBe('blue');
    expect(state.tiles[8][5].color).toBe('blue');
    // 槽位置灰（保留 id，used=true）
    expect(state.players[0].skillSlot).toEqual({ id: 'laser', used: true });
  });

  it('面朝左（-1,0）：从脚下格到左边界染色，右侧保留原色', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 10.5, y: 4.5 }; // cx=10
    p.facing = { x: -1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };

    state.tiles[4][0].color = 'blue';
    state.tiles[4][gameCfg.mapWidth - 1].color = 'yellow';

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // c ∈ [0, 10] 染为 red
    for (let c = 0; c <= 10; c++) {
      expect(state.tiles[4][c].color).toBe('red');
    }
    // c ∈ [11, W-1] 保留原色
    expect(state.tiles[4][gameCfg.mapWidth - 1].color).toBe('yellow');
    expect(state.tiles[4][11].color).toBe('neutral');
  });

  it('面朝下（0,1）：从脚下格到下边界染色，上方保留原色', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 6.5, y: 5.5 }; // cy=5
    p.facing = { x: 0, y: 1 };
    p.skillSlot = { id: 'laser', used: false };

    state.tiles[0][6].color = 'blue';
    state.tiles[gameCfg.mapHeight - 1][6].color = 'yellow';
    state.tiles[5][7].color = 'blue'; // 邻列不染

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // r ∈ [5, H-1] 染为 red
    for (let r = 5; r < gameCfg.mapHeight; r++) {
      expect(state.tiles[r][6].color).toBe('red');
    }
    // r ∈ [0, 4] 保留原色
    expect(state.tiles[0][6].color).toBe('blue');
    expect(state.tiles[3][6].color).toBe('neutral');
    // 邻列不受影响
    expect(state.tiles[5][7].color).toBe('blue');
  });

  it('面朝上（0,-1）：从脚下格到上边界染色，下方保留原色', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 2.5, y: 8.5 }; // cy=8
    p.facing = { x: 0, y: -1 };
    p.skillSlot = { id: 'laser', used: false };

    state.tiles[gameCfg.mapHeight - 1][2].color = 'green';

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // r ∈ [0, 8] 染为 red
    for (let r = 0; r <= 8; r++) {
      expect(state.tiles[r][2].color).toBe('red');
    }
    // r=9 保留原色
    expect(state.tiles[gameCfg.mapHeight - 1][2].color).toBe('green');
  });

  it('量化：|x|>|y| 优先水平（前向半段，朝右）', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 5.5, y: 5.5 }; // cx=5
    p.facing = { x: 0.7, y: 0.3 };
    p.skillSlot = { id: 'laser', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 第 5 行 c ∈ [5, W-1] 染为 red；c ∈ [0, 4] 保持 neutral
    for (let c = 5; c < gameCfg.mapWidth; c++) {
      expect(state.tiles[5][c].color).toBe('red');
    }
    expect(state.tiles[5][4].color).toBe('neutral');
    expect(state.tiles[5][0].color).toBe('neutral');
    // 邻行不受影响
    expect(state.tiles[4][5].color).toBe('neutral');
  });

  it('量化：|y|>|x| 走垂直（前向半段，朝下）', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 5.5, y: 5.5 }; // cy=5
    p.facing = { x: 0.3, y: 0.7 };
    p.skillSlot = { id: 'laser', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // r ∈ [5, H-1] 染为 red；r ∈ [0, 4] 保持 neutral
    for (let r = 5; r < gameCfg.mapHeight; r++) {
      expect(state.tiles[r][5].color).toBe('red');
    }
    expect(state.tiles[4][5].color).toBe('neutral');
    expect(state.tiles[0][5].color).toBe('neutral');
    // 邻列不受影响
    expect(state.tiles[5][4].color).toBe('neutral');
  });

  it('量化：零向量 facing 回退到垂直朝下（脚下格到下边界染色）', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 4.5, y: 5.5 }; // cy=5
    p.facing = { x: 0, y: 0 };
    p.skillSlot = { id: 'laser', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // r ∈ [5, H-1] 染为 red；r ∈ [0, 4] 保持 neutral
    for (let r = 5; r < gameCfg.mapHeight; r++) {
      expect(state.tiles[r][4].color).toBe('red');
    }
    expect(state.tiles[4][4].color).toBe('neutral');
  });

  it('包含脚下格：玩家所在格也被染色', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 7.5, y: 3.5 }; // cx=7, cy=3
    p.facing = { x: 1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };

    state.tiles[3][7].color = 'blue';

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 脚下格被染
    expect(state.tiles[3][7].color).toBe('red');
  });

  it('紧贴边界释放：朝右站在最右列只染脚下 1 格', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: gameCfg.mapWidth - 0.5, y: 4.5 }; // cx = W-1
    p.facing = { x: 1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };

    // 同行其它格预涂蓝色，验证未被染
    state.tiles[4][0].color = 'blue';
    state.tiles[4][gameCfg.mapWidth - 2].color = 'blue';

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 仅脚下格被染
    expect(state.tiles[4][gameCfg.mapWidth - 1].color).toBe('red');
    // 左侧任何格保持蓝色 / 米色
    expect(state.tiles[4][gameCfg.mapWidth - 2].color).toBe('blue');
    expect(state.tiles[4][0].color).toBe('blue');
    expect(state.tiles[4][5].color).toBe('neutral');
  });

  it('护盾格被跳过：受护盾保护的格子保持原色', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 5.5, y: 7.5 };
    p.facing = { x: 1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };

    // 第 7 行的第 7 列上盾，且预先涂为蓝色（位于前向射程内）
    state.tiles[7][7].color = 'blue';
    state.tiles[7][7].shieldUntilTick = state.tick + 60;
    // 第 7 行的第 8 列也上盾，但本身就是米色
    state.tiles[7][8].color = 'neutral';
    state.tiles[7][8].shieldUntilTick = state.tick + 60;

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    // 受护盾格保持原色
    expect(state.tiles[7][7].color).toBe('blue');
    expect(state.tiles[7][8].color).toBe('neutral');
    // 前向其他格被染
    expect(state.tiles[7][5].color).toBe('red');
    expect(state.tiles[7][6].color).toBe('red');
    expect(state.tiles[7][9].color).toBe('red');
  });

  it('不会推入 projectiles / areaEffects（瞬发，无副带状态；laserBeams 由专门用例覆盖）', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 5.5, y: 5.5 };
    p.facing = { x: 1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };
    const projBefore = state.projectiles.length;
    const aeBefore = state.areaEffects.length;

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.projectiles.length).toBe(projBefore);
    expect(state.areaEffects.length).toBe(aeBefore);
  });

  it('lastPaintedTick 在被激光染色的格子上更新到当前 tick', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 5.5, y: 7.5 }; // cx=5, 朝右 → 前向 [5, W-1]
    p.facing = { x: 1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    for (let c = 5; c < gameCfg.mapWidth; c++) {
      expect(state.tiles[7][c].lastPaintedTick).toBe(state.tick);
    }
  });

  it('释放后 state.laserBeams 新增一条，字段（ownerId/ownerColor/origin/direction/spawnedAtTick/expireAtTick）正确', () => {
    const state = createInitialState();
    const p = state.players[0]; // red
    p.pos = { x: 5.5, y: 7.5 };
    p.facing = { x: 1, y: 0 }; // → 'right'
    p.skillSlot = { id: 'laser', used: false };
    state.tick = 100;

    const before = state.laserBeams.length;

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.laserBeams.length).toBe(before + 1);
    const beam = state.laserBeams[state.laserBeams.length - 1];
    expect(beam.ownerId).toBe(0);
    expect(beam.ownerColor).toBe('red');
    expect(beam.origin).toEqual({ x: 5, y: 7 });
    expect(beam.direction).toBe('right');
    expect(beam.spawnedAtTick).toBe(100);
    expect(beam.expireAtTick).toBe(100 + skillsCfg.laser.visualTicks);
  });

  it('LaserBeam.direction 覆盖四方向：上 / 下 / 左 / 右 各自正确', () => {
    const cases: Array<{ facing: { x: number; y: number }; expected: 'up' | 'down' | 'left' | 'right' }> = [
      { facing: { x: 1, y: 0 }, expected: 'right' },
      { facing: { x: -1, y: 0 }, expected: 'left' },
      { facing: { x: 0, y: 1 }, expected: 'down' },
      { facing: { x: 0, y: -1 }, expected: 'up' },
    ];
    for (const { facing, expected } of cases) {
      const state = createInitialState();
      const p = state.players[0];
      p.pos = { x: 5.5, y: 5.5 };
      p.facing = facing;
      p.skillSlot = { id: 'laser', used: false };

      const intents = new Map<number, PlayerIntent>();
      intents.set(0, makeIntent(0, { useSkill: true }));
      applySkillUse(state, intents);

      const beam = state.laserBeams[state.laserBeams.length - 1];
      expect(beam.direction).toBe(expected);
    }
  });

  it('cleanupLaserBeams：到期 beam 被移除，未到期保留', () => {
    const state = createInitialState();
    const p = state.players[0];
    p.pos = { x: 5.5, y: 5.5 };
    p.facing = { x: 1, y: 0 };
    p.skillSlot = { id: 'laser', used: false };
    state.tick = 50;

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    applySkillUse(state, intents);

    const v = skillsCfg.laser.visualTicks;
    expect(state.laserBeams.length).toBe(1);

    // 到期前一 tick：仍保留
    state.tick = 50 + v - 1;
    cleanupLaserBeams(state);
    expect(state.laserBeams.length).toBe(1);

    // 到期 tick：被清掉（条件 state.tick < expireAtTick = 50 + v 不再成立）
    state.tick = 50 + v;
    cleanupLaserBeams(state);
    expect(state.laserBeams.length).toBe(0);
  });

  it('多个玩家同 tick 各自释放：laserBeams 各加一条且独立清理', () => {
    const state = createInitialState();
    const p0 = state.players[0];
    const p1 = state.players[1];
    p0.pos = { x: 3.5, y: 3.5 };
    p0.facing = { x: 1, y: 0 };
    p0.skillSlot = { id: 'laser', used: false };
    p1.pos = { x: 8.5, y: 8.5 };
    p1.facing = { x: 0, y: 1 };
    p1.skillSlot = { id: 'laser', used: false };
    state.tick = 200;

    const intents = new Map<number, PlayerIntent>();
    intents.set(0, makeIntent(0, { useSkill: true }));
    intents.set(1, makeIntent(1, { useSkill: true }));
    applySkillUse(state, intents);

    expect(state.laserBeams.length).toBe(2);
    const owners = state.laserBeams.map((b) => b.ownerId).sort();
    expect(owners).toEqual([0, 1]);
    // beam id 唯一
    expect(state.laserBeams[0].id).not.toBe(state.laserBeams[1].id);
  });
});
