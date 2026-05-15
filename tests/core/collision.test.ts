import { describe, it, expect } from 'vitest';
import { applyCollisions } from '@/core/collision';
import { createInitialState } from '@/core/GameState';
import playerCfg from '@/config/player.json';
import gameCfg from '@/config/game.json';

/**
 * 碰撞规则（阶段 2.1）：
 *   - 玩家半径 0.4，距离 < 0.8 视为重叠
 *   - 重叠时沿连线方向各退 collisionPushback/2，合计分离 collisionPushback
 *   - 触发后双方进入无敌帧 collisionInvulnSec，期间不再被碰撞结算
 *   - 推开后位置必须 clamp 在地图边界内
 *   - 距离 ≥ 0.8 不触发
 *   - 完全重合（dx=dy=0）时使用稳定 fallback 方向，避免 NaN
 */
describe('applyCollisions', () => {
  it('两玩家重叠时应沿连线方向各退 pushback/2', () => {
    const s = createInitialState();
    // 把玩家 0、1 强制摆成水平距离 0.5（< 0.8）
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 5.5, y: 5 };

    applyCollisions(s);

    const half = playerCfg.collisionPushback / 2;
    // 玩家 0 在左，应被推向更左
    expect(s.players[0].pos.x).toBeCloseTo(5 - half, 5);
    expect(s.players[0].pos.y).toBeCloseTo(5, 5);
    // 玩家 1 在右，应被推向更右
    expect(s.players[1].pos.x).toBeCloseTo(5.5 + half, 5);
    expect(s.players[1].pos.y).toBeCloseTo(5, 5);
  });

  it('距离 ≥ 0.8 时不触发，位置不变', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 5.9, y: 5 }; // 距离 0.9

    applyCollisions(s);

    expect(s.players[0].pos.x).toBe(5);
    expect(s.players[1].pos.x).toBe(5.9);
  });

  it('触发后双方应记录 collisionInvulnUntilTick', () => {
    const s = createInitialState();
    s.tick = 100;
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 5.5, y: 5 };

    applyCollisions(s);

    const invulnTicks = Math.ceil(playerCfg.collisionInvulnSec * gameCfg.tickRate);
    expect(s.players[0].collisionInvulnUntilTick).toBe(100 + invulnTicks);
    expect(s.players[1].collisionInvulnUntilTick).toBe(100 + invulnTicks);
  });

  it('无敌帧期间再次重叠时不再推开', () => {
    const s = createInitialState();
    s.tick = 100;
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 5.5, y: 5 };
    // 直接置为未来某 tick 的无敌（模拟刚触发过）
    s.players[0].collisionInvulnUntilTick = 200;
    s.players[1].collisionInvulnUntilTick = 200;

    applyCollisions(s);

    expect(s.players[0].pos.x).toBe(5);
    expect(s.players[1].pos.x).toBe(5.5);
  });

  it('被推开后位置应被夹紧在地图边界内（圆心距边界 ≥ collisionRadius）', () => {
    const s = createInitialState();
    // 把两个玩家放到左边界附近，玩家 0 应被推到 x=radius 而不是更小
    s.players[0].pos = { x: playerCfg.collisionRadius + 0.05, y: 5 };
    s.players[1].pos = { x: playerCfg.collisionRadius + 0.5, y: 5 };

    applyCollisions(s);

    expect(s.players[0].pos.x).toBeGreaterThanOrEqual(playerCfg.collisionRadius);
    expect(s.players[0].pos.x).toBeLessThanOrEqual(gameCfg.mapWidth - playerCfg.collisionRadius);
    expect(s.players[1].pos.x).toBeGreaterThanOrEqual(playerCfg.collisionRadius);
    expect(s.players[1].pos.x).toBeLessThanOrEqual(gameCfg.mapWidth - playerCfg.collisionRadius);
  });

  it('完全重合时也应安全分离（不产生 NaN）', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 5, y: 5 };

    applyCollisions(s);

    expect(Number.isFinite(s.players[0].pos.x)).toBe(true);
    expect(Number.isFinite(s.players[0].pos.y)).toBe(true);
    expect(Number.isFinite(s.players[1].pos.x)).toBe(true);
    expect(Number.isFinite(s.players[1].pos.y)).toBe(true);
    // 分离后两人 x 或 y 至少有一个不再相等
    const samePos =
      s.players[0].pos.x === s.players[1].pos.x &&
      s.players[0].pos.y === s.players[1].pos.y;
    expect(samePos).toBe(false);
  });

  it('多人混合：仅重叠的对触发，无关玩家不受影响', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 5.5, y: 5 }; // 与 0 重叠
    s.players[2].pos = { x: 12, y: 5 };  // 远离
    s.players[3].pos = { x: 12.5, y: 8 }; // 远离

    applyCollisions(s);

    expect(s.players[2].pos.x).toBe(12);
    expect(s.players[2].pos.y).toBe(5);
    expect(s.players[3].pos.x).toBe(12.5);
    expect(s.players[3].pos.y).toBe(8);
    expect(s.players[2].collisionInvulnUntilTick).toBe(0);
    expect(s.players[3].collisionInvulnUntilTick).toBe(0);
  });
});
