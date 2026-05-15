import { describe, it, expect } from 'vitest';
import { GameLoop } from '@/single/GameLoop';
import gameCfg from '@/config/game.json';

const TICK_DT = 1 / gameCfg.tickRate;

describe('比赛计时与状态机', () => {
  it('初始 phase 为 playing', () => {
    const loop = new GameLoop();
    expect(loop.state.matchPhase).toBe('playing');
  });

  it('每 tick 减少 matchTimeRemaining', () => {
    const loop = new GameLoop();
    const before = loop.state.matchTimeRemaining;
    // 推进 60 个 tick = 1 秒；GameLoop 每次 update 至多 5 tick，分 12 次喂入
    for (let i = 0; i < 12; i++) loop.update(TICK_DT * 5);
    expect(loop.state.matchTimeRemaining).toBeCloseTo(before - 1, 5);
  });

  it('matchTimeRemaining 不会变成负数', () => {
    const loop = new GameLoop();
    // 远超 60 秒：每次推 5 tick = 1/12 秒，跑 60*12*2 = 1440 次
    for (let i = 0; i < 60 * 12 * 2; i++) loop.update(TICK_DT * 5);
    expect(loop.state.matchTimeRemaining).toBe(0);
  });

  it('matchDurationSec 秒后 phase 变为 ended', () => {
    const loop = new GameLoop();
    const totalTicks = gameCfg.matchDurationSec * gameCfg.tickRate;
    // 跑足 totalTicks（每次最多 5 个 tick，由 GameLoop 的 maxSteps 限制 → 这里循环投递）
    let t = 0;
    while (loop.state.matchPhase === 'playing' && t < totalTicks * 2) {
      loop.update(TICK_DT * 5); // 一次推 5 tick
      t += 5;
    }
    expect(loop.state.matchPhase).toBe('ended');
    expect(loop.state.matchTimeRemaining).toBe(0);
  });

  it('ended 阶段冻结：玩家移动 intent 不再改变 pos', () => {
    const loop = new GameLoop();
    // 把 matchTimeRemaining 直接拨到 0 + tick 一次让 phase 切到 ended
    loop.state.matchTimeRemaining = TICK_DT / 2;
    loop.update(TICK_DT);
    expect(loop.state.matchPhase).toBe('ended');

    const p = loop.state.players[0];
    const before = { x: p.pos.x, y: p.pos.y };
    loop.setIntent({
      playerId: 0,
      moveDir: { x: 1, y: 0 },
      dash: false,
      useSkill: false,
    });
    // 推 30 tick，pos 应不变
    for (let i = 0; i < 30; i++) loop.update(TICK_DT);
    expect(p.pos.x).toBe(before.x);
    expect(p.pos.y).toBe(before.y);
  });
});
