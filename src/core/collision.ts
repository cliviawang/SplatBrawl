import gameCfg from '@/config/game.json';
import playerCfg from '@/config/player.json';
import type { GameState, Player } from './types';

/**
 * 玩家碰撞解算（阶段 2.1，阶段 8 调整优先级）：
 *
 * 规则：
 *   - 玩家被视为半径 player.collisionRadius 的圆，距离 < 2*radius 视为重叠
 *   - 重叠时沿连线方向各退 collisionPushback/2，合计分离 collisionPushback
 *   - 完全重合时使用稳定 fallback 方向（+x），避免 NaN
 *   - 触发后双方进入 collisionInvulnSec 无敌帧（防抖动）
 *   - state.tick < player.collisionInvulnUntilTick 时跳过该玩家所有配对
 *   - 推开后位置 clamp：圆心 ∈ [radius, W-radius] × [radius, H-radius]，与 movement 一致
 *
 * 阶段 8 优先级调整：
 *   - 冲刺命中（dashHit）优先级 > 普通碰撞，dashing 玩家不参与本函数的反弹
 *   - 即任一方 dashState.phase === 'dashing' 的配对都被跳过；dashing 玩家与
 *     其他玩家的交互完全由 applyDashTick 内部的命中检测处理
 *
 * 设计决策：
 *   - 在 movement 之后调用：先各自移动，再统一解算重叠
 *   - 保持纯函数风格（直接修改 state，与 movement 一致）
 */

/** 边界 clamp：圆心保留 collisionRadius 距离，与 movement.ts 一致，避免半个角色穿出地图 */
function clampPos(p: Player): void {
  const r = playerCfg.collisionRadius;
  p.pos.x = Math.max(r, Math.min(gameCfg.mapWidth - r, p.pos.x));
  p.pos.y = Math.max(r, Math.min(gameCfg.mapHeight - r, p.pos.y));
}

export function applyCollisions(state: GameState): void {
  const players = state.players;
  const half = playerCfg.collisionPushback / 2;
  const invulnTicks = Math.ceil(playerCfg.collisionInvulnSec * gameCfg.tickRate);
  const overlapThreshold = playerCfg.collisionRadius * 2;
  const overlapThresholdSq = overlapThreshold * overlapThreshold;

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];

      // 任一方处于无敌帧 → 跳过这对（防抖动）
      if (
        state.tick < a.collisionInvulnUntilTick ||
        state.tick < b.collisionInvulnUntilTick
      ) {
        continue;
      }

      // 任一方处于 dashing → 跳过：冲刺命中由 applyDashTick 处理，普通碰撞不参与
      if (a.dashState.phase === 'dashing' || b.dashState.phase === 'dashing') {
        continue;
      }

      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= overlapThresholdSq) {
        continue;
      }

      // 单位连线方向：完全重合时退化为 (+1, 0)
      let nx: number;
      let ny: number;
      if (distSq === 0) {
        nx = 1;
        ny = 0;
      } else {
        const dist = Math.sqrt(distSq);
        nx = dx / dist;
        ny = dy / dist;
      }

      // a 沿连线反方向退 half，b 沿连线正方向退 half
      a.pos.x -= nx * half;
      a.pos.y -= ny * half;
      b.pos.x += nx * half;
      b.pos.y += ny * half;

      clampPos(a);
      clampPos(b);

      a.collisionInvulnUntilTick = state.tick + invulnTicks;
      b.collisionInvulnUntilTick = state.tick + invulnTicks;
    }
  }
}
