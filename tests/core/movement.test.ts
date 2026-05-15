import { describe, it, expect } from 'vitest';
import { applyMovement } from '@/core/movement';
import { createInitialState } from '@/core/GameState';
import type { PlayerIntent } from '@/core/types';
import playerCfg from '@/config/player.json';
import gameCfg from '@/config/game.json';

const dt = 1 / 60;

function intent(playerId: number, dx: number, dy: number): PlayerIntent {
  return { playerId, moveDir: { x: dx, y: dy }, dash: false, useSkill: false };
}

describe('applyMovement', () => {
  it('玩家向右移动应改变位置', () => {
    const s = createInitialState();
    const p = s.players[0];
    const oldX = p.pos.x;
    applyMovement(s, intent(0, 1, 0), dt);
    expect(p.pos.x).toBeGreaterThan(oldX);
  });

  it('进入新格子时染色为玩家颜色', () => {
    const s = createInitialState();
    const p = s.players[0];
    // 玩家 0 在 (8, 0.5)。让他向下走（向地图中央，远离边界）
    for (let i = 0; i < 60; i++) {
      applyMovement(s, intent(0, 0, 1), dt);
    }
    const cx = Math.floor(p.pos.x);
    const cy = Math.floor(p.pos.y);
    expect(s.tiles[cy][cx].color).toBe(p.color);
  });

  it('不能越过地图左边界（圆心距边界至少 collisionRadius）', () => {
    const s = createInitialState();
    const p = s.players[2]; // 左中玩家 (1.5, 4.5)
    for (let i = 0; i < 1000; i++) {
      applyMovement(s, intent(2, -1, 0), dt);
    }
    expect(p.pos.x).toBeGreaterThanOrEqual(playerCfg.collisionRadius);
  });

  it('不能越过地图右边界（圆心距边界至少 collisionRadius）', () => {
    const s = createInitialState();
    const p = s.players[3]; // 右中玩家 (14.5, 4.5)
    for (let i = 0; i < 1000; i++) {
      applyMovement(s, intent(3, 1, 0), dt);
    }
    expect(p.pos.x).toBeLessThanOrEqual(gameCfg.mapWidth - playerCfg.collisionRadius);
  });

  it('不能越过地图上下边界', () => {
    const s = createInitialState();
    const p0 = s.players[0]; // 上中
    const p1 = s.players[1]; // 下中
    for (let i = 0; i < 1000; i++) {
      applyMovement(s, intent(0, -1, 0), dt);
      applyMovement(s, intent(1, 0, 1), dt);
    }
    expect(p0.pos.y).toBeGreaterThanOrEqual(playerCfg.collisionRadius);
    expect(p1.pos.y).toBeLessThanOrEqual(gameCfg.mapHeight - playerCfg.collisionRadius);
  });

  it('踏入敌色格时获得减速 debuff（slowUntilTick 被设置）', () => {
    const s = createInitialState();
    const p = s.players[0];
    // 紧贴当前格右边，保证本帧跨入右邻格
    p.pos.x = Math.floor(p.pos.x) + 0.99;
    const curCx = Math.floor(p.pos.x);
    const curCy = Math.floor(p.pos.y);
    s.tiles[curCy][curCx].color = p.color; // 当前格己色
    s.tiles[curCy][curCx + 1].color = 'blue'; // 右邻格敌色

    expect(p.slowUntilTick).toBe(0);
    applyMovement(s, intent(0, 1, 0), dt);
    // 跨入敌色时应刷新 debuff 至 state.tick + coverSlowDurationTicks
    expect(p.slowUntilTick).toBe(s.tick + playerCfg.coverSlowDurationTicks);
  });

  it('处于 debuff 期间的 tick 按减速速率移动', () => {
    const s = createInitialState();
    const p = s.players[0];
    // 直接施加 debuff，并把玩家放到己色格中央（避免本帧跨格）
    const startCy = Math.floor(p.pos.y);
    p.pos.x = 0.5;
    p.pos.y = startCy + 0.5;
    s.tiles[startCy][0].color = p.color;
    p.slowUntilTick = s.tick + playerCfg.coverSlowDurationTicks;

    const before = p.pos.x;
    applyMovement(s, intent(0, 1, 0), dt);
    const moved = p.pos.x - before;
    expect(moved).toBeCloseTo(playerCfg.moveSpeed * playerCfg.coverSlowFactor * dt, 5);
  });

  it('无 debuff 且走己色格时按全速移动', () => {
    const s = createInitialState();
    const p = s.players[0];
    const startCy = Math.floor(p.pos.y);
    for (let c = 0; c < 10; c++) {
      s.tiles[startCy][c].color = p.color;
    }
    p.pos.x = 0.5;
    p.pos.y = startCy + 0.5;

    for (let i = 0; i < 60; i++) {
      applyMovement(s, intent(0, 1, 0), dt);
    }
    const traveled = p.pos.x - 0.5;
    expect(traveled).toBeCloseTo(playerCfg.moveSpeed, 1);
  });

  it('连续走过多个敌色格时每次跨格都刷新 debuff，全程减速', () => {
    const s = createInitialState();
    const p = s.players[0];
    const startCy = Math.floor(p.pos.y);
    for (let c = 0; c < 10; c++) {
      s.tiles[startCy][c].color = 'blue';
    }
    p.pos.x = 0.5;
    p.pos.y = startCy + 0.5;
    // 预先施加满 debuff，避免"首次跨格前全速段"污染总位移
    p.slowUntilTick = s.tick + playerCfg.coverSlowDurationTicks;

    // 跑 60 帧：只要每次跨格都刷新 debuff，就能持续减速到最后
    for (let i = 0; i < 60; i++) {
      applyMovement(s, intent(0, 1, 0), dt);
      s.tick++;
    }
    const traveled = p.pos.x - 0.5;
    const expectedSlow = playerCfg.moveSpeed * playerCfg.coverSlowFactor;
    expect(traveled).toBeCloseTo(expectedSlow, 1);
  });

  it('debuff 带尾巴：离开敌色区进入己色后，剩余 debuff 时间内仍减速', () => {
    const s = createInitialState();
    const p = s.players[0];
    const startCy = Math.floor(p.pos.y);
    // 构造：第 0 格敌色，第 1~5 格己色
    s.tiles[startCy][0].color = 'blue';
    for (let c = 1; c < 10; c++) {
      s.tiles[startCy][c].color = p.color;
    }
    p.pos.x = 0.5;
    p.pos.y = startCy + 0.5;
    p.slowUntilTick = 0;

    // 先让玩家通过某种方式处于敌色格 debuff 中：手动施加
    p.slowUntilTick = s.tick + playerCfg.coverSlowDurationTicks;

    // 此刻所站格子是敌色（第 0 格），下一帧会跨入己色格
    // 但 debuff 未到期 → 仍减速
    const before = p.pos.x;
    applyMovement(s, intent(0, 1, 0), dt);
    const moved = p.pos.x - before;
    expect(moved).toBeCloseTo(playerCfg.moveSpeed * playerCfg.coverSlowFactor * dt, 5);
    // 且 debuff 剩余时间未被重置（进入己色不刷新）
    expect(p.slowUntilTick).toBe(s.tick + playerCfg.coverSlowDurationTicks);
  });

  it('debuff 不叠加：连续踏入多个敌色格只刷新至满，不延长', () => {
    const s = createInitialState();
    const p = s.players[0];
    const startCy = Math.floor(p.pos.y);
    for (let c = 0; c < 10; c++) {
      s.tiles[startCy][c].color = 'blue';
    }
    p.pos.x = 0.5;
    p.pos.y = startCy + 0.5;

    // 第一次踏敌：推进到首次 slowUntilTick 被设置，记录触发时的 tick
    let firstSlowUntil = 0;
    let firstTriggerTick = -1;
    for (let i = 0; i < 120 && firstSlowUntil === 0; i++) {
      applyMovement(s, intent(0, 1, 0), dt);
      if (p.slowUntilTick > 0) {
        firstSlowUntil = p.slowUntilTick;
        firstTriggerTick = s.tick;
      }
      s.tick++;
    }
    expect(firstSlowUntil).toBe(firstTriggerTick + playerCfg.coverSlowDurationTicks);

    // 继续推进直到再次跨格刷新
    for (let i = 0; i < 120; i++) {
      const before = p.slowUntilTick;
      applyMovement(s, intent(0, 1, 0), dt);
      if (p.slowUntilTick !== before) {
        // 刷新值必须严格等于 s.tick + duration（而非 firstSlowUntil + duration 叠加）
        expect(p.slowUntilTick).toBe(s.tick + playerCfg.coverSlowDurationTicks);
        // 与叠加场景对比：叠加会得到 firstSlowUntil + duration（更大）
        const stackedValue = firstSlowUntil + playerCfg.coverSlowDurationTicks;
        expect(p.slowUntilTick).toBeLessThan(stackedValue);
        return;
      }
      s.tick++;
    }
    throw new Error('never refreshed second time');
  });

  it('debuff 超时后恢复全速', () => {
    const s = createInitialState();
    const p = s.players[0];
    const startCy = Math.floor(p.pos.y);
    for (let c = 0; c < 16; c++) {
      s.tiles[startCy][c].color = p.color; // 全己色
    }
    p.pos.x = 0.5;
    p.pos.y = startCy + 0.5;
    // 人为施加一个即将过期的 debuff
    p.slowUntilTick = s.tick + 5;

    // 推进 10 tick（> 5），debuff 应已过期
    for (let i = 0; i < 10; i++) {
      applyMovement(s, intent(0, 1, 0), dt);
      s.tick++;
    }
    // 再走一帧验证速度
    const before = p.pos.x;
    applyMovement(s, intent(0, 1, 0), dt);
    const moved = p.pos.x - before;
    expect(moved).toBeCloseTo(playerCfg.moveSpeed * dt, 5);
  });

  it('格内滑动未跨格时不触发 debuff 刷新', () => {
    const s = createInitialState();
    const p = s.players[0];
    p.pos.x = Math.floor(p.pos.x) + 0.5; // 放中央
    const cx = Math.floor(p.pos.x);
    const cy = Math.floor(p.pos.y);
    // 当前格染敌色（按旧语义可能被误判）
    s.tiles[cy][cx].color = 'blue';
    p.slowUntilTick = 0;

    applyMovement(s, intent(0, 1, 0), dt);
    // 未跨格 → slowUntilTick 保持 0
    expect(p.slowUntilTick).toBe(0);
  });

  it('斜向输入应被归一化（不会比单向快）', () => {
    const s = createInitialState();
    const p = s.players[0];
    const before = { x: p.pos.x, y: p.pos.y };
    applyMovement(s, intent(0, 1, 1), dt);
    const dist = Math.hypot(p.pos.x - before.x, p.pos.y - before.y);
    expect(dist).toBeCloseTo(playerCfg.moveSpeed * dt, 5);
  });

  it('moveDir=(0,0) 时不移动也不报错', () => {
    const s = createInitialState();
    const p = s.players[0];
    const before = { x: p.pos.x, y: p.pos.y };
    applyMovement(s, intent(0, 0, 0), dt);
    expect(p.pos.x).toBe(before.x);
    expect(p.pos.y).toBe(before.y);
  });
});
