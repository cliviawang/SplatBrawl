import { describe, it, expect } from 'vitest';
import { applyDashTick } from '@/core/dash';
import { createInitialState } from '@/core/GameState';
import type { GameState, PlayerIntent } from '@/core/types';
import playerCfg from '@/config/player.json';
import gameCfg from '@/config/game.json';

const dt = 1 / 60;

function intent(playerId: number, dx: number, dy: number, dash = false): PlayerIntent {
  return { playerId, moveDir: { x: dx, y: dy }, dash, useSkill: false };
}

/** 把所有玩家的 intent 装成 Map，模拟 GameLoop 的 intents 集合 */
function intents(...list: PlayerIntent[]): Map<number, PlayerIntent> {
  const m = new Map<number, PlayerIntent>();
  for (const it of list) m.set(it.playerId, it);
  return m;
}

/** 推进 N 个 tick，返回最终 state（每 tick 把同一份 intent 投递一次） */
function step(s: GameState, ix: Map<number, PlayerIntent>, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    applyDashTick(s, ix, dt);
    s.tick++;
  }
}

describe('applyDashTick', () => {
  it('初始 dashState 为 idle，timer=0', () => {
    const s = createInitialState();
    for (const p of s.players) {
      expect(p.dashState.phase).toBe('idle');
      expect(p.dashState.timer).toBe(0);
    }
  });

  it('按下 dash + 有方向 → 进入 dashing 阶段', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    expect(s.players[0].dashState.phase).toBe('dashing');
  });

  it('按下 dash 但 moveDir=(0,0) 时，用玩家 facing 作为冲刺方向', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[0].facing = { x: 1, y: 0 };
    applyDashTick(s, intents(intent(0, 0, 0, true)), dt);
    expect(s.players[0].dashState.phase).toBe('dashing');
    expect(s.players[0].dashState.dashDir.x).toBeCloseTo(1, 5);
    expect(s.players[0].dashState.dashDir.y).toBeCloseTo(0, 5);
  });

  it('按下 dash 但 moveDir 与 facing 同为 (0,0) → 不触发（兜底）', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[0].facing = { x: 0, y: 0 };
    applyDashTick(s, intents(intent(0, 0, 0, true)), dt);
    expect(s.players[0].dashState.phase).toBe('idle');
  });

  it('dashing 0.2 秒内移动 dashDistance=3 格（速度 = 距离/时长）', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    // 第一帧触发 dash（仅切状态，不推进），后续帧无需再按
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    const startX = 5;
    // dashDuration=0.2s = 12 ticks 全部用于推进
    const totalTicks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, 1, 0, false)), totalTicks);

    const expected = startX + playerCfg.dashDistance;
    const tolerance = (playerCfg.dashDistance / playerCfg.dashDurationSec) * dt + 0.01;
    expect(Math.abs(s.players[0].pos.x - expected)).toBeLessThan(tolerance);
  });

  it('dashing 期间途经格不染色，仅终点格染色', () => {
    const s = createInitialState();
    // 把玩家挪到一片中性区域，避免出生点染色干扰
    s.players[0].pos = { x: 5, y: 5 };
    // 清掉所有非中性格（避免出生点色干扰）
    for (const row of s.tiles) for (const t of row) t.color = 'neutral';

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    const totalTicks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, 1, 0, false)), totalTicks);

    // 起点 (5, 5) 不应被染（途经不染）
    expect(s.tiles[5][5].color).toBe('neutral');

    // 终点格应被染为玩家颜色
    const endCx = Math.floor(s.players[0].pos.x);
    const endCy = Math.floor(s.players[0].pos.y);
    expect(s.tiles[endCy][endCx].color).toBe(s.players[0].color);

    // 中间格 (6, 5) / (7, 5) 不应被染（除非恰好是终点）
    for (let x = 6; x < endCx; x++) {
      expect(s.tiles[5][x].color).toBe('neutral');
    }
  });

  it('dashing 结束后进入 cooldown，timer = dashCooldownSec', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    const totalTicks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, 1, 0, false)), totalTicks);
    expect(s.players[0].dashState.phase).toBe('cooldown');
    expect(s.players[0].dashState.timer).toBeCloseTo(playerCfg.dashCooldownSec, 2);
  });

  it('cooldown 期间再按 dash 无效（保持 cooldown）', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[0].dashState = { phase: 'cooldown', timer: 3, dashDir: { x: 0, y: 0 } };
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    expect(s.players[0].dashState.phase).toBe('cooldown');
  });

  it('cooldown 结束后回到 idle', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[0].dashState = { phase: 'cooldown', timer: dt * 2, dashDir: { x: 0, y: 0 } };
    // 推 3 个 tick，timer 应该归零并切回 idle
    step(s, intents(intent(0, 0, 0, false)), 3);
    expect(s.players[0].dashState.phase).toBe('idle');
    expect(s.players[0].dashState.timer).toBe(0);
  });

  it('dashing 期间改变 moveDir 不改变 dash 方向', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 8, y: 5 };
    // 起手向右
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    // 后续每 tick 投递向上的 intent
    const ticks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, 0, -1, false)), ticks);

    // 玩家 y 坐标不应明显改变（仍以右方向冲）
    expect(s.players[0].pos.y).toBeCloseTo(5, 1);
    expect(s.players[0].pos.x).toBeGreaterThan(8 + 2);
  });

  it('dashing 期间再按 dash 无效', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    const beforeTimer = s.players[0].dashState.timer;
    // 再按一次 dash（向下），不应重置 timer 也不应换方向
    applyDashTick(s, intents(intent(0, 0, 1, true)), dt);
    expect(s.players[0].dashState.phase).toBe('dashing');
    expect(s.players[0].dashState.timer).toBeGreaterThan(beforeTimer);
  });

  it('dashing 撞到地图边界时位置 clamp 但仍走完时长进入 cooldown', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 1, y: 5 }; // 距左边界 1 格
    applyDashTick(s, intents(intent(0, -1, 0, true)), dt);
    s.tick++;
    const totalTicks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, -1, 0, false)), totalTicks);
    expect(s.players[0].pos.x).toBeGreaterThanOrEqual(playerCfg.collisionRadius);
    expect(s.players[0].dashState.phase).toBe('cooldown');
  });

  it('斜向 dash 总位移仍为 dashDistance（方向归一化）', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    applyDashTick(s, intents(intent(0, 1, 1, true)), dt);
    s.tick++;
    const totalTicks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, 1, 1, false)), totalTicks);
    const dist = Math.hypot(s.players[0].pos.x - 5, s.players[0].pos.y - 5);
    const tolerance = (playerCfg.dashDistance / playerCfg.dashDurationSec) * dt + 0.01;
    expect(Math.abs(dist - playerCfg.dashDistance)).toBeLessThan(tolerance);
  });

  it('多玩家独立维护 dashState：玩家 0 dashing 时玩家 1 仍可触发 dash', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 10, y: 5 };
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    expect(s.players[0].dashState.phase).toBe('dashing');
    expect(s.players[1].dashState.phase).toBe('idle');

    applyDashTick(s, intents(intent(0, 1, 0, false), intent(1, -1, 0, true)), dt);
    expect(s.players[1].dashState.phase).toBe('dashing');
  });
});

// 哨兵：确保 game.json 的 tickRate 与本测试假设一致
describe('dash.test 前提', () => {
  it('tickRate 应为 60', () => {
    expect(gameCfg.tickRate).toBe(60);
  });
});
