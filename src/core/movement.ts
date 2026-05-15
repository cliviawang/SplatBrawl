import gameCfg from '@/config/game.json';
import playerCfg from '@/config/player.json';
import skillsCfg from '@/config/skills.json';
import type { GameState, PlayerIntent } from './types';
import { quantizeDirection } from './skills/laser';

/**
 * 应用一个玩家的移动 Intent。纯函数风格——直接修改传入的 state。
 *
 * 规则（来自《玩法规则.md》"染色规则"）：
 *   - moveDir 任意非零向量都会被归一化为单位向量
 *   - 边界：圆心夹紧在 [r, W-r] × [r, H-r]，r = collisionRadius，防止半身穿出
 *   - 进入新格子时染色为玩家颜色，记录 lastPaintedTick
 *   - **踏敌减速 debuff**：跨入敌色格时设置 slowUntilTick = tick + coverSlowDurationTicks
 *     - 不叠加：再次踏入只刷新至满，不延长
 *     - 带尾巴：state.tick < slowUntilTick 时持续减速，离开敌色不立即清除
 *     - 触发当帧本身就处于减速（先刷新 debuff，再算速度，state.tick < slowUntilTick 成立）
 *
 * 阶段 6 扩展：
 *   - 眩晕（state.tick < p.stunUntilTick）：完全跳过移动
 *   - 极速（state.tick < p.speedBoostUntilTick）：移动速度乘以 skills.speed.multiplier
 *   - 护盾格（tile.shieldUntilTick）：染色前检查；本玩家自己撑的盾不会让自己无法染色，
 *     但本版本简化处理为"盾内任何染色操作都跳过"（与玩法规则一致）
 *
 * 实现要点（避免 speed ↔ target 循环依赖）：
 *   1. 用全速试算目标格（仅用于"是否跨入敌色"的判定）
 *   2. 若预测跨入敌色 → 立即刷新 slowUntilTick（本帧已生效）
 *   3. 按 state.tick < slowUntilTick 决定本帧速度
 *   4. 用最终速度算真实位移、夹紧边界、染色（真实速度 ≤ 全速，落点要么仍在当前格，
 *      要么止步于预测目标格，不会出现"预测跨格但实际未跨格"）
 */
export function applyMovement(state: GameState, intent: PlayerIntent, dt: number): void {
  const p = state.players[intent.playerId];
  if (!p) return;
  // 眩晕中：完全跳过移动
  if (state.tick < p.stunUntilTick) return;
  if (intent.moveDir.x === 0 && intent.moveDir.y === 0) return;

  // 归一化方向
  const mag = Math.hypot(intent.moveDir.x, intent.moveDir.y);
  const dx = intent.moveDir.x / mag;
  const dy = intent.moveDir.y / mag;

  const r = playerCfg.collisionRadius;
  const speedBoosted = state.tick < p.speedBoostUntilTick;
  const fullSpeed = playerCfg.moveSpeed * (speedBoosted ? skillsCfg.speed.multiplier : 1);
  const curCx = Math.floor(p.pos.x);
  const curCy = Math.floor(p.pos.y);

  // ① 全速试算目标格（仅用于跨格 + 敌色判定）
  const tentativeX = Math.max(r, Math.min(gameCfg.mapWidth - r, p.pos.x + dx * fullSpeed * dt));
  const tentativeY = Math.max(r, Math.min(gameCfg.mapHeight - r, p.pos.y + dy * fullSpeed * dt));
  const probeCx = Math.floor(tentativeX);
  const probeCy = Math.floor(tentativeY);
  const willCrossCell = probeCx !== curCx || probeCy !== curCy;

  // ② 若预测跨入敌色格 → 刷新 debuff（本帧立即生效）
  if (willCrossCell) {
    const probeTile = state.tiles[probeCy][probeCx];
    if (probeTile.color !== 'neutral' && probeTile.color !== p.color) {
      p.slowUntilTick = state.tick + playerCfg.coverSlowDurationTicks;
    }
  }

  // ③ 按 debuff 状态决定本帧速度
  const slowed = state.tick < p.slowUntilTick;
  const speed = fullSpeed * (slowed ? playerCfg.coverSlowFactor : 1);

  // ④ 用最终速度算新位置 + 边界夹紧
  let nx = p.pos.x + dx * speed * dt;
  let ny = p.pos.y + dy * speed * dt;
  nx = Math.max(r, Math.min(gameCfg.mapWidth - r, nx));
  ny = Math.max(r, Math.min(gameCfg.mapHeight - r, ny));

  // ⑤ 进入新格子触发染色（护盾格跳过）
  const newCx = Math.floor(nx);
  const newCy = Math.floor(ny);
  if (newCx !== curCx || newCy !== curCy) {
    const targetTile = state.tiles[newCy][newCx];
    if (state.tick >= targetTile.shieldUntilTick) {
      targetTile.color = p.color;
      targetTile.lastPaintedTick = state.tick;
    }

    // 涂刷 buff 生效中：沿 facing 主轴的垂直方向扩 ±1 共 2 个邻格染色（width=3）
    // 扩展染色与脚下格走同一份"护盾跳过 / 越界跳过"检查；不检查格上是否有其他角色。
    if (state.tick < p.rollerUntilTick) {
      // 用本帧实际位移方向量化主轴；零向量时回退到 player.facing
      const mainDir =
        dx === 0 && dy === 0
          ? quantizeDirection(p.facing)
          : quantizeDirection({ x: dx, y: dy });
      // 主轴水平 → 上下扩；主轴垂直 → 左右扩
      const extendHorizontal = mainDir === 'up' || mainDir === 'down';
      const half = Math.floor((skillsCfg.roller.width - 1) / 2);
      for (let k = 1; k <= half; k++) {
        for (const sign of [-1, 1]) {
          const ex = extendHorizontal ? newCx + sign * k : newCx;
          const ey = extendHorizontal ? newCy : newCy + sign * k;
          if (ex < 0 || ex >= gameCfg.mapWidth || ey < 0 || ey >= gameCfg.mapHeight) continue;
          const tile = state.tiles[ey][ex];
          if (state.tick < tile.shieldUntilTick) continue;
          tile.color = p.color;
          tile.lastPaintedTick = state.tick;
        }
      }
    }
  }

  p.pos.x = nx;
  p.pos.y = ny;
  p.facing = { x: dx, y: dy };
}
