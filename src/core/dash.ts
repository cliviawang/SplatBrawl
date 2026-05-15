import gameCfg from '@/config/game.json';
import playerCfg from '@/config/player.json';
import type { GameState, Player, PlayerIntent } from './types';

/**
 * 冲刺系统（阶段 3 + 阶段 8）。纯逻辑层，零 Phaser 依赖。
 *
 * 状态机：
 *   idle → (dash + 有方向) → dashing → (推进满 dashDurationTicks 或命中目标) → cooldown
 *                                                                            → (推进满 dashCooldownTicks) → idle
 *
 * 规则（阶段 3）：
 *   - 触发时机：phase === 'idle' 且 intent.dash === true
 *   - 冲刺方向：按下 dash 那一 tick，moveDir 非零则用 moveDir 归一化；否则回退 player.facing
 *   - 冲刺速度：dashDistance / dashDurationSec（默认 3 / 0.2 = 15 格/秒）
 *   - 冲刺期间：忽略本玩家的 moveDir 与 dash 输入；不走 movement
 *   - 染色：途经格不染，仅 dash 结束那一 tick 把终点格染为玩家色
 *   - 边界：dashing 期间位置 clamp 到 [r, W-r] × [r, H-r]
 *   - 冷却：进入 cooldown 时 timer = dashCooldownSec，每 tick -dt，<=0 时回 idle
 *
 * 阶段 8 新增（冲刺命中）：
 *   - dashing 玩家每 tick 推进位置后，与所有 phase!=='dashing' 的玩家做圆碰撞检测
 *   - 命中：调用 applyDashHit（技能转移 + 击退 + 硬直），dasher 立即切到 cooldown
 *   - 双方同时冲刺：互相穿过，不击退、不抢夺（dashing 玩家彼此免疫，仅与非 dashing 玩家做命中判定）
 *   - 未命中（dashing 自然走完时长）：dasher 进入 dashMissStunSec 硬直
 *   - 命中时立即结束本次冲刺并染色终点格（与正常结束逻辑一致）
 *
 * 与 collision 的协作：
 *   - dashing 玩家不参与 applyCollisions 的普通反弹（在 collision 内跳过）
 *
 * 时长判定用 tick 计数（Math.round(durationSec * tickRate)）而非浮点累加，
 * 避免 0.0166666 × 12 = 0.19999... 这种舍入误差导致结束 tick 偏移。
 *
 * @param state 当前游戏状态（直接修改）
 * @param intents 本 tick 各玩家投递的指令
 * @param dt 步长（秒）
 */
export function applyDashTick(
  state: GameState,
  intents: Map<number, PlayerIntent>,
  dt: number,
): void {
  const dashSpeed = playerCfg.dashDistance / playerCfg.dashDurationSec;
  const r = playerCfg.collisionRadius;
  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;
  const dashDurationTicks = Math.max(1, Math.round(playerCfg.dashDurationSec * gameCfg.tickRate));
  const missStunTicks = Math.ceil(playerCfg.dashMissStunSec * gameCfg.tickRate);
  const overlapThreshold = r * 2;
  const overlapThresholdSq = overlapThreshold * overlapThreshold;

  for (const p of state.players) {
    const intent = intents.get(p.id);
    const ds = p.dashState;

    if (ds.phase === 'idle') {
      // 触发条件：intent.dash=true（眩晕中无法触发）
      if (state.tick < p.stunUntilTick) {
        continue;
      }
      if (intent && intent.dash) {
        let dirX = intent.moveDir.x;
        let dirY = intent.moveDir.y;
        if (dirX === 0 && dirY === 0) {
          dirX = p.facing.x;
          dirY = p.facing.y;
        }
        const mag = Math.hypot(dirX, dirY);
        if (mag > 0) {
          ds.phase = 'dashing';
          ds.timer = 0; // 此处复用 timer 字段记录已推进 tick 数（整数）
          ds.dashDir = { x: dirX / mag, y: dirY / mag };
          // 标记本次冲刺尚未命中（用 _hitDuringDash 不污染共享类型，下文会用闭包跟踪）
        }
      }
      continue;
    }

    if (ds.phase === 'dashing') {
      // 推进位置（无视 intent.moveDir）
      let nx = p.pos.x + ds.dashDir.x * dashSpeed * dt;
      let ny = p.pos.y + ds.dashDir.y * dashSpeed * dt;
      nx = Math.max(r, Math.min(W - r, nx));
      ny = Math.max(r, Math.min(H - r, ny));
      p.pos.x = nx;
      p.pos.y = ny;
      // 朝向跟随冲刺方向（影响渲染层 facing 计算）
      p.facing = { x: ds.dashDir.x, y: ds.dashDir.y };

      ds.timer += 1; // 按 tick 计数

      // 命中检测：仅与 phase!=='dashing' 的玩家做圆碰撞
      let hitTarget: Player | null = null;
      for (const other of state.players) {
        if (other.id === p.id) continue;
        if (other.dashState.phase === 'dashing') continue;
        const dx = other.pos.x - p.pos.x;
        const dy = other.pos.y - p.pos.y;
        if (dx * dx + dy * dy < overlapThresholdSq) {
          hitTarget = other;
          break;
        }
      }

      if (hitTarget) {
        applyDashHit(state, p, hitTarget);
        // 命中即结束本次冲刺：染终点格 + 切 cooldown，命中不进 miss stun
        finishDashAndCooldown(state, p);
        continue;
      }

      // 推进满 N 个 tick → 切到 cooldown，并染色终点格；未命中则进入 miss stun
      if (ds.timer >= dashDurationTicks) {
        finishDashAndCooldown(state, p);
        // miss：本次未命中任何人 → dasher 进入 miss stun
        p.stunUntilTick = state.tick + missStunTicks;
      }
      continue;
    }

    if (ds.phase === 'cooldown') {
      ds.timer -= dt;
      if (ds.timer <= 0) {
        ds.phase = 'idle';
        ds.timer = 0;
      }
      continue;
    }
  }
}

/**
 * 冲刺命中处理（阶段 8）：技能转移 + 击退 + 硬直。
 *
 * 玩法规则：
 *   - target 沿 dasher→target 方向被推 dashHitPushback 格（clamp 到地图边界）
 *   - target 进入 dashHitStunSec 硬直
 *   - 若 target 持有技能（无论亮/灰），技能转移到 dasher，新槽 used=false
 *   - 不影响 dasher 的 stun（命中不算 miss）
 *
 * 注意：本函数不切换 dashState（由调用方 finishDashAndCooldown 完成）。
 */
export function applyDashHit(state: GameState, dasher: Player, target: Player): void {
  const r = playerCfg.collisionRadius;
  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;
  const hitStunTicks = Math.ceil(playerCfg.dashHitStunSec * gameCfg.tickRate);

  // 1. 技能转移：无论 used 状态，转移后 used=false
  if (target.skillSlot) {
    dasher.skillSlot = { id: target.skillSlot.id, used: false };
    target.skillSlot = null;
  }

  // 2. 击退：沿 dasher→target 方向（dasher 当前位置→target 当前位置），完全重合时退化为 dasher.dashDir
  let nxDir = target.pos.x - dasher.pos.x;
  let nyDir = target.pos.y - dasher.pos.y;
  let mag = Math.hypot(nxDir, nyDir);
  if (mag === 0) {
    nxDir = dasher.dashState.dashDir.x;
    nyDir = dasher.dashState.dashDir.y;
    mag = Math.hypot(nxDir, nyDir);
  }
  if (mag > 0) {
    nxDir /= mag;
    nyDir /= mag;
    target.pos.x = Math.max(r, Math.min(W - r, target.pos.x + nxDir * playerCfg.dashHitPushback));
    target.pos.y = Math.max(r, Math.min(H - r, target.pos.y + nyDir * playerCfg.dashHitPushback));
  }

  // 3. 硬直
  target.stunUntilTick = state.tick + hitStunTicks;
}

/** 染色终点格 + 切 cooldown（命中提前结束 / 自然结束都用此函数） */
function finishDashAndCooldown(state: GameState, p: Player): void {
  const cx = Math.floor(p.pos.x);
  const cy = Math.floor(p.pos.y);
  const tile = state.tiles[cy]?.[cx];
  if (tile && state.tick >= tile.shieldUntilTick) {
    tile.color = p.color;
    tile.lastPaintedTick = state.tick;
  }
  p.dashState.phase = 'cooldown';
  // 冷却期 timer 转回"剩余秒数"语义
  p.dashState.timer = playerCfg.dashCooldownSec;
  p.dashState.dashDir = { x: 0, y: 0 };
}

/**
 * 玩家是否处于冲刺中。供 GameLoop 决定该玩家本 tick 是否跳过 applyMovement。
 */
export function isDashing(state: GameState, playerId: number): boolean {
  return state.players[playerId]?.dashState.phase === 'dashing';
}
