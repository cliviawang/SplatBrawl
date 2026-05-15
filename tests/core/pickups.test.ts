import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/core/GameState';
import {
  tryRefreshPickups,
  applyPickupCollection,
  type RefreshContext,
} from '@/core/skills/pickups';
import pickupsCfg from '@/config/pickups.json';
import gameCfg from '@/config/game.json';

/**
 * 任务 6.2：道具刷新系统
 *
 * 关键规则（玩法规则 7.3）：
 *   - 第 10/20/30/40/50 秒各刷 1 次，每次 2 个道具，全局共 10 个
 *   - 60 秒结束时不刷新（即第 60 秒触发会被忽略）
 *   - 不刷在玩家脚下
 *   - 等概率从池中随机
 *   - 区域类技能（shield / bomb）单次刷新最多出现 1 个；
 *     若地图上已有 areaEffect 或任意玩家持有区域类技能 → 本次不出区域类
 *   - 玩家踩到道具自动入槽（覆盖原有）
 *
 * tickToSec: tick / tickRate（gameCfg.tickRate=60，第 10 秒 = tick 600）
 *
 * 这里把"决定本 tick 是否刷"做成纯函数 + 注入 RNG，便于测试可重放。
 */

const tickAt = (sec: number) => sec * gameCfg.tickRate;

/** 构造一个最小可控的 RefreshContext —— RNG 给定固定序列 */
function ctxWith(values: number[]): RefreshContext {
  let i = 0;
  return {
    rng: () => {
      const v = values[i % values.length];
      i++;
      return v;
    },
  };
}

describe('道具刷新系统', () => {
  it('第 10/20/30/40/50 秒各刷 2 个，60 秒不刷', () => {
    const state = createInitialState();
    state.pickups = [];
    const refreshSeconds: number[] = [];
    for (let sec = 1; sec <= 60; sec++) {
      // 模拟整秒到达瞬间
      state.tick = tickAt(sec);
      const before = state.pickups.length;
      tryRefreshPickups(state, ctxWith([0.1, 0.2, 0.3, 0.4]));
      if (state.pickups.length > before) {
        refreshSeconds.push(sec);
      }
    }
    expect(refreshSeconds).toEqual([10, 20, 30, 40, 50]);
    // 总数：理想情况下 5 轮 × 2 = 10
    // 注意：默认地图够大，玩家只占 4 格，理论上能放下
    expect(state.pickups.length).toBe(10);
  });

  it('每次刷新生成的位置不在玩家脚下', () => {
    const state = createInitialState();
    state.pickups = [];
    state.tick = tickAt(10);
    // RNG 序列让前几个候选格命中玩家脚下，应被跳过
    tryRefreshPickups(state, ctxWith([0, 0, 0.05, 0.05, 0.99, 0.99, 0.5, 0.5]));
    const playerCells = new Set(
      state.players.map((p) => `${Math.floor(p.pos.x)},${Math.floor(p.pos.y)}`),
    );
    for (const pk of state.pickups) {
      expect(playerCells.has(`${pk.col},${pk.row}`)).toBe(false);
    }
  });

  it('同次刷新不会同位置重复', () => {
    const state = createInitialState();
    state.pickups = [];
    state.tick = tickAt(10);
    tryRefreshPickups(state, ctxWith([0.5, 0.5, 0.6, 0.6]));
    const cells = new Set(state.pickups.map((pk) => `${pk.col},${pk.row}`));
    expect(cells.size).toBe(state.pickups.length);
  });

  it('区域类技能：本次刷新最多 1 个', () => {
    const state = createInitialState();
    state.pickups = [];
    state.tick = tickAt(10);
    // 让池索引先后命中 shield 和 bomb（区域类）
    // pool: rocket(0) speed(1) shield(2) laser(3) roller(4) star(5) bomb(6) charge(7)
    // 区域类索引：shield=2, bomb=6 → r∈[2/8,3/8)=0.25..0.375 选 shield；[6/8,7/8)=0.75..0.875 选 bomb
    // 给 RNG: 第一个道具 r=0.3（shield），第二个道具 r=0.8（bomb，应被替换为非区域类）
    // 后续位置 RNG 任意
    const ctx = ctxWith([
      0.3,  // 第 1 个道具：技能 r → shield
      0.5,  // 第 1 个道具：行 r
      0.5,  // 第 1 个道具：列 r
      0.8,  // 第 2 个道具：技能 r → 原本会选 bomb，但区域类已用 → 重新走非区域类池
      0.9,  // 第 2 个道具：行 r
      0.9,  // 第 2 个道具：列 r
    ]);
    tryRefreshPickups(state, ctx);
    const areaCount = state.pickups.filter(
      (pk) => pickupsCfg.areaSkills.includes(pk.skillId as string),
    ).length;
    expect(areaCount).toBeLessThanOrEqual(1);
    expect(state.pickups.length).toBe(2);
  });

  it('已有活跃 areaEffect 时本次不出区域类', () => {
    const state = createInitialState();
    state.pickups = [];
    state.areaEffects = [
      {
        id: 'a1',
        type: 'shield',
        ownerId: 0,
        centerX: 1,
        centerY: 1,
        expireAtTick: 99999,
      },
    ];
    state.tick = tickAt(10);
    // RNG 倾向于选 shield/bomb（区域类），但应被替换
    tryRefreshPickups(state, ctxWith([0.3, 0.5, 0.5, 0.8, 0.9, 0.9]));
    const areaCount = state.pickups.filter(
      (pk) => pickupsCfg.areaSkills.includes(pk.skillId as string),
    ).length;
    expect(areaCount).toBe(0);
    expect(state.pickups.length).toBe(2);
  });

  it('已有玩家持有区域类技能时本次不出区域类', () => {
    const state = createInitialState();
    state.pickups = [];
    state.players[0].skillSlot = { id: 'shield', used: false };
    state.tick = tickAt(10);
    tryRefreshPickups(state, ctxWith([0.3, 0.5, 0.5, 0.8, 0.9, 0.9]));
    const areaCount = state.pickups.filter(
      (pk) => pickupsCfg.areaSkills.includes(pk.skillId as string),
    ).length;
    expect(areaCount).toBe(0);
  });

  it('玩家踩到道具时自动入槽并消耗道具', () => {
    const state = createInitialState();
    state.pickups = [{ id: 'pk1', skillId: 'rocket', col: 5, row: 5 }];
    // 让 player[0] 站到 (5,5)
    state.players[0].pos = { x: 5.5, y: 5.5 };
    applyPickupCollection(state);
    expect(state.players[0].skillSlot).toEqual({ id: 'rocket', used: false });
    expect(state.pickups.length).toBe(0);
  });

  it('玩家踩到道具时覆盖原槽位（玩法规则 7.6.4）', () => {
    const state = createInitialState();
    state.players[0].skillSlot = { id: 'speed', used: true };
    state.pickups = [{ id: 'pk1', skillId: 'rocket', col: 5, row: 5 }];
    state.players[0].pos = { x: 5.5, y: 5.5 };
    applyPickupCollection(state);
    expect(state.players[0].skillSlot).toEqual({ id: 'rocket', used: false });
  });

  it('同一次刷新不会出现 2 个相同技能（去重）', () => {
    const state = createInitialState();
    state.pickups = [];
    state.tick = tickAt(10);
    // pool: rocket(0) speed(1) shield(2) laser(3)
    // 让两次"技能 r"都落在 [0, 0.25) → 都会指向 rocket(0)
    // 若不去重 → 两个都是 rocket；去重后第 2 个应从剩余 [speed/shield/laser] 中选
    const ctx = ctxWith([
      0.1,  // 第 1 个：技能 r → rocket
      0.5, 0.5, // 第 1 个：行/列 r
      0.1,  // 第 2 个：技能 r → 原本仍是 rocket，应被排除并改选其他
      0.9, 0.9, // 第 2 个：行/列 r
    ]);
    tryRefreshPickups(state, ctx);
    expect(state.pickups.length).toBe(2);
    expect(state.pickups[0].skillId).not.toBe(state.pickups[1].skillId);
  });

  it('同一次刷新不会出现 2 个相同技能（区域类回退场景下也成立）', () => {
    const state = createInitialState();
    state.pickups = [];
    state.tick = tickAt(10);
    // 第 1 个 r=0.6 → shield（区域类，命中 areaUsed 置位）
    // 第 2 个技能 r=0.6 → 原本也指 shield；
    //   先排除 shield（已选），再走非区域类回退（areaUsed=true，剩 rocket/speed/laser）
    //   非区域类池里如果再指向 shield 也不可能（已被过滤）
    const ctx = ctxWith([
      0.6,  // 第 1 个：技能 r → shield
      0.5, 0.5,
      0.6,  // 第 2 个：技能 r → 应排除 shield
      0.0,  // 第 2 个：非区域类回退池中的 r（rocket）
      0.9, 0.9,
    ]);
    tryRefreshPickups(state, ctx);
    expect(state.pickups.length).toBe(2);
    expect(state.pickups[0].skillId).not.toBe(state.pickups[1].skillId);
  });

  it('同一秒只刷一次（tick 在该秒边界附近多次调用不重复）', () => {
    const state = createInitialState();
    state.pickups = [];
    state.tick = tickAt(10);
    tryRefreshPickups(state, ctxWith([0.1, 0.2, 0.3, 0.4]));
    expect(state.pickups.length).toBe(2);
    // 同一秒内再次调用：已记录 lastRefreshSec=10，应被跳过
    state.tick = tickAt(10) + 30;
    tryRefreshPickups(state, ctxWith([0.1, 0.2, 0.3, 0.4]));
    expect(state.pickups.length).toBe(2);
  });
});
