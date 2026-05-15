import { describe, it, expect } from 'vitest';
import { applyDashTick } from '@/core/dash';
import { applyCollisions } from '@/core/collision';
import { createInitialState } from '@/core/GameState';
import type { GameState, PlayerIntent } from '@/core/types';
import playerCfg from '@/config/player.json';
import gameCfg from '@/config/game.json';

/**
 * 阶段 8：冲刺命中（抢夺 + 击退 + 硬直）+ 冲刺与碰撞优先级
 *
 * 玩法规则（docs/玩法规则.md 冲刺攻击章节）：
 *   - 命中对方：对方击退 dashHitPushback(=2 格) + dashHitStunSec(=0.3s) 硬直；
 *     若对方持有技能（无论亮/灰），技能被抢走，转移后状态置为 used=false
 *   - 双方同时冲刺：互相穿过，不击退、不抢夺，各自终点格染色
 *   - 未命中（dashing 走完时长且本次未命中任何人）：dasher 自身 dashMissStunSec(=0.3s) 硬直
 *   - 冲刺优先级 > 普通碰撞：dashing 玩家不参与 applyCollisions 的反弹
 *
 * 设计：
 *   - 检测点在 applyDashTick 中，dashing 玩家位移后与所有非 dashing 玩家做圆碰撞
 *   - 命中即触发 applyDashHit：技能转移 + 击退 + 硬直 + dasher 立刻切 cooldown（不再继续穿过其他人）
 */

const dt = 1 / 60;

function intent(playerId: number, dx: number, dy: number, dash = false): PlayerIntent {
  return { playerId, moveDir: { x: dx, y: dy }, dash, useSkill: false };
}

function intents(...list: PlayerIntent[]): Map<number, PlayerIntent> {
  const m = new Map<number, PlayerIntent>();
  for (const it of list) m.set(it.playerId, it);
  return m;
}

function step(s: GameState, ix: Map<number, PlayerIntent>, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    applyDashTick(s, ix, dt);
    s.tick++;
  }
}

describe('冲刺命中（applyDashTick 内嵌 dashHit）', () => {
  it('冲刺命中持有技能玩家 → 技能转移到冲刺者，新槽 used=false', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 6, y: 5 }; // 距离 1，冲刺向右必命中
    s.players[1].skillSlot = { id: 'rocket', used: true };

    // 触发冲刺
    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    // 推几个 tick 直到撞上
    step(s, intents(intent(0, 1, 0, false), intent(1, 0, 0, false)), 6);

    // 技能已转移
    expect(s.players[0].skillSlot).not.toBeNull();
    expect(s.players[0].skillSlot?.id).toBe('rocket');
    expect(s.players[0].skillSlot?.used).toBe(false);
    expect(s.players[1].skillSlot).toBeNull();
  });

  it('冲刺命中无技能玩家 → 不抢夺但仍触发击退与硬直', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 6, y: 5 };
    s.players[1].skillSlot = null;

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    step(s, intents(intent(0, 1, 0, false), intent(1, 0, 0, false)), 6);

    // 双方槽位仍为空
    expect(s.players[0].skillSlot).toBeNull();
    expect(s.players[1].skillSlot).toBeNull();
    // target 进入 stun
    expect(s.players[1].stunUntilTick).toBeGreaterThan(s.tick);
  });

  it('冲刺命中：target 沿连线方向被推 dashHitPushback 格', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 6, y: 5 };
    const beforeX = s.players[1].pos.x;

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    step(s, intents(intent(0, 1, 0, false), intent(1, 0, 0, false)), 6);

    // target 应被推向右（远离 dasher 当时的位置），位移 ~ pushback
    expect(s.players[1].pos.x - beforeX).toBeGreaterThan(playerCfg.dashHitPushback - 0.5);
  });

  it('冲刺命中：target 进入 dashHitStunSec 硬直', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 6, y: 5 };

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    step(s, intents(intent(0, 1, 0, false), intent(1, 0, 0, false)), 6);

    const stunTicks = Math.ceil(playerCfg.dashHitStunSec * gameCfg.tickRate);
    // target 的 stunUntilTick 应≥当前 tick + (stunTicks - 余量)
    expect(s.players[1].stunUntilTick).toBeGreaterThanOrEqual(s.tick + stunTicks - 6);
  });

  it('冲刺命中后 dasher 立即切到 cooldown（不再继续穿过别人）', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 6, y: 5 };
    s.players[2].pos = { x: 7, y: 5 };
    s.players[2].skillSlot = { id: 'star', used: false };

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    step(s, intents(intent(0, 1, 0, false), intent(1, 0, 0, false), intent(2, 0, 0, false)), 6);

    // 命中第一个目标后立刻 cooldown
    expect(s.players[0].dashState.phase).toBe('cooldown');
    // 不应再去抢第三个玩家的技能
    expect(s.players[2].skillSlot?.id).toBe('star');
  });

  it('双方同时冲刺 → 互相穿过，不击退、不抢夺', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 7, y: 5 };
    s.players[0].skillSlot = { id: 'rocket', used: false };
    s.players[1].skillSlot = { id: 'star', used: false };

    // 双方同时触发冲刺，相向而行
    applyDashTick(
      s,
      intents(intent(0, 1, 0, true), intent(1, -1, 0, true)),
      dt,
    );
    s.tick++;

    // 推 dashing 时长结束
    const durTicks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, 1, 0, false), intent(1, -1, 0, false)), durTicks);

    // 技能各自保留
    expect(s.players[0].skillSlot?.id).toBe('rocket');
    expect(s.players[1].skillSlot?.id).toBe('star');
    // 双方都进 cooldown（dashing 走完时长正常结束）
    expect(s.players[0].dashState.phase).toBe('cooldown');
    expect(s.players[1].dashState.phase).toBe('cooldown');
    // 注：双方同时冲刺 = 各自都没命中任何人 → 各自都进 miss stun，
    // 这不与"不击退、不抢夺"冲突；规则中"未命中=自己硬直"独立适用
  });

  it('冲刺未命中任何人 → dasher 进入 dashMissStunSec 硬直', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    // 其他玩家挪远，确保不可能命中
    s.players[1].pos = { x: 15, y: 8 };
    s.players[2].pos = { x: 1, y: 1 };
    s.players[3].pos = { x: 14, y: 8 };

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    const durTicks = Math.round(playerCfg.dashDurationSec / dt);
    step(s, intents(intent(0, 1, 0, false)), durTicks);

    // dashing 走完
    expect(s.players[0].dashState.phase).toBe('cooldown');
    // 进入 miss stun
    expect(s.players[0].stunUntilTick).toBeGreaterThan(s.tick);
  });

  it('冲刺命中后 dasher 不应进入 miss stun', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 6, y: 5 };

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    step(s, intents(intent(0, 1, 0, false), intent(1, 0, 0, false)), 6);

    // 命中后 dasher 不进 stun
    expect(s.players[0].stunUntilTick).toBeLessThanOrEqual(s.tick);
  });

  it('冲刺命中 used=true 的技能也能抢走，并重置为 used=false', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 6, y: 5 };
    s.players[1].skillSlot = { id: 'shield', used: true };

    applyDashTick(s, intents(intent(0, 1, 0, true)), dt);
    s.tick++;
    step(s, intents(intent(0, 1, 0, false), intent(1, 0, 0, false)), 6);

    expect(s.players[0].skillSlot?.id).toBe('shield');
    expect(s.players[0].skillSlot?.used).toBe(false);
    expect(s.players[1].skillSlot).toBeNull();
  });
});

describe('冲刺与碰撞的优先级（任务 8.2）', () => {
  it('dashing 玩家不应参与 applyCollisions 的普通反弹', () => {
    const s = createInitialState();
    s.players[0].pos = { x: 5, y: 5 };
    s.players[1].pos = { x: 5.5, y: 5 }; // 距离 0.5 < 0.8 重叠

    // 把玩家 0 强制置为 dashing（不依赖 applyDashTick，单独验证 collision 跳过逻辑）
    s.players[0].dashState = { phase: 'dashing', timer: 0, dashDir: { x: 1, y: 0 } };

    applyCollisions(s);

    // 双方都不被反弹位移
    expect(s.players[0].pos.x).toBe(5);
    expect(s.players[1].pos.x).toBe(5.5);
    // 也不应记录 invuln（避免下一帧 dashing 结束时被这帧的 invuln 影响）
    expect(s.players[0].collisionInvulnUntilTick).toBe(0);
    expect(s.players[1].collisionInvulnUntilTick).toBe(0);
  });
});
