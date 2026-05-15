/**
 * DashDecision（阶段 9 - Medium AI）：决定是否冲刺以及方向。
 *
 * 触发条件：
 *   - 玩家存在且未在 dashing/cooldown
 *   - 不在眩晕中
 *   - rand() < dashChancePerSec * dt
 *
 * 方向：
 *   - dashTargetPriority='nearest'：朝最近敌人或最近敌色格的方向；都无则朝最近敌色格随机方向
 *   - dashTargetPriority='random' / 'utility'：随机角度（utility 留给阶段 10 扩展）
 *   - 优先选最近敌人方向（命中可抢技能 + 击退）；其次最近敌色格（命中染色）
 */
import type { DecisionContext, DashResult } from './types';

export function evaluateDash(ctx: DecisionContext, dt: number): DashResult {
  const { state, playerId, config, rand } = ctx;
  const player = state.players[playerId];
  if (!player) return null;
  if (player.dashState.phase !== 'idle') return null;
  if (state.tick < player.stunUntilTick) return null;

  const trigger = rand() < config.dashChancePerSec * dt;
  if (!trigger) return null;

  if (config.dashTargetPriority === 'nearest') {
    // 1. 最近敌人
    let bestDx = 0;
    let bestDy = 0;
    let bestDistSq = Infinity;
    for (const other of state.players) {
      if (other.id === playerId) continue;
      const dx = other.pos.x - player.pos.x;
      const dy = other.pos.y - player.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestDx = dx;
        bestDy = dy;
      }
    }

    // 2. 最近敌色格（仅当无敌人或敌人离得远）
    const awarenessR = config.awarenessRadius ?? Math.max(state.tiles[0].length, state.tiles.length);
    const awarenessRSq = awarenessR * awarenessR;
    if (bestDistSq > 9) {
      // 玩家不在 3 格内时，看看附近有无敌色格更划算
      let tileBestDx = bestDx;
      let tileBestDy = bestDy;
      let tileBestDistSq = bestDistSq;
      for (let row = 0; row < state.tiles.length; row++) {
        for (let col = 0; col < state.tiles[row].length; col++) {
          const c = state.tiles[row][col].color;
          if (c === 'neutral' || c === player.color) continue;
          const tx = col + 0.5 - player.pos.x;
          const ty = row + 0.5 - player.pos.y;
          const d2 = tx * tx + ty * ty;
          if (d2 > awarenessRSq) continue;
          if (d2 < tileBestDistSq) {
            tileBestDistSq = d2;
            tileBestDx = tx;
            tileBestDy = ty;
          }
        }
      }
      bestDx = tileBestDx;
      bestDy = tileBestDy;
    }

    const mag = Math.hypot(bestDx, bestDy);
    if (mag > 0) {
      return { dir: { x: bestDx / mag, y: bestDy / mag } };
    }
    // 完全没目标：fallback 到随机角度
  }

  // random / utility / fallback：均匀角度
  const angle = rand() * Math.PI * 2;
  return { dir: { x: Math.cos(angle), y: Math.sin(angle) } };
}
