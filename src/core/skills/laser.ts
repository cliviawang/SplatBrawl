/**
 * 激光技能（阶段 6.3.4）。
 *
 * 释放（瞬发）：
 *   1. 根据玩家 facing 量化为四方向（up/down/left/right）；
 *   2. 从玩家所在格出发，沿朝向到边界的"半段"染色（含脚下格，玩家身后保持原色）：
 *        - right：第 cy 行 c ∈ [cx, W-1]
 *        - left ：第 cy 行 c ∈ [0, cx]
 *        - down ：第 cx 列 r ∈ [cy, H-1]
 *        - up   ：第 cx 列 r ∈ [0, cy]
 *      —— 站在边界释放可覆盖整行/整列；站在中央仅覆盖一半，鼓励走位卡边界。
 *   3. 米色 / 敌色 / 自色 一律覆盖为施法者颜色；护盾格（shieldUntilTick > tick）跳过；
 *   4. 不推入 projectile / areaEffect / statusEffect —— 瞬发即结束；
 *   5. 推入一条 LaserBeam 视觉记录到 state.laserBeams，渲染层据此播光束动画，
 *      visualTicks（来自 skills.json）后由 cleanupLaserBeams 自动清除。
 *
 * 量化规则（quantizeDirection）：
 *   - |x| > |y| → 水平：x > 0 → 'right'，x < 0 → 'left'
 *   - |y| > |x| → 垂直：y > 0 → 'down'，y < 0 → 'up'
 *   - |x| === |y| 且非零 → 优先水平（侧扫直觉）
 *   - 零向量 → 'down'（与 Player.facing 默认 (0,1) 一致）
 */
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import { registerSkill } from './registry';
import type { GameState, LaserBeam, Vec2 } from '../types';

export type LaserDirection = 'up' | 'down' | 'left' | 'right';
export type LaserAxis = 'horizontal' | 'vertical';

/** 纯函数：把任意 facing 量化为四方向。导出便于单测细化。 */
export function quantizeDirection(facing: Vec2): LaserDirection {
  const ax = Math.abs(facing.x);
  const ay = Math.abs(facing.y);
  if (ax === 0 && ay === 0) return 'down';
  if (ax >= ay) return facing.x >= 0 ? 'right' : 'left';
  return facing.y >= 0 ? 'down' : 'up';
}

/** 兼容老命名：仅按轴量化。保留导出以防外部引用，新代码请用 quantizeDirection。 */
export function quantizeFacing(facing: Vec2): LaserAxis {
  const dir = quantizeDirection(facing);
  return dir === 'left' || dir === 'right' ? 'horizontal' : 'vertical';
}

/** beam id 序列号；与 rocket/shield 风格一致：`laser_<tick>_<seq>` */
let beamSeq = 0;

export function registerLaser(): void {
  registerSkill({
    id: 'laser',
    type: 'instant',
    onCast(state, casterId) {
      const caster = state.players[casterId];
      if (!caster) return;

      const direction = quantizeDirection(caster.facing);
      const cx = Math.floor(caster.pos.x);
      const cy = Math.floor(caster.pos.y);

      if (direction === 'left' || direction === 'right') {
        const row = cy;
        if (row < 0 || row >= gameCfg.mapHeight) return;
        // 前向半段：right → [cx, W-1]；left → [0, cx]
        const cStart = direction === 'right' ? Math.max(0, cx) : 0;
        const cEnd =
          direction === 'right' ? gameCfg.mapWidth - 1 : Math.min(gameCfg.mapWidth - 1, cx);
        for (let c = cStart; c <= cEnd; c++) {
          const tile = state.tiles[row][c];
          if (tile.shieldUntilTick > state.tick) continue;
          tile.color = caster.color;
          tile.lastPaintedTick = state.tick;
        }
      } else {
        const col = cx;
        if (col < 0 || col >= gameCfg.mapWidth) return;
        // 前向半段：down → [cy, H-1]；up → [0, cy]
        const rStart = direction === 'down' ? Math.max(0, cy) : 0;
        const rEnd =
          direction === 'down' ? gameCfg.mapHeight - 1 : Math.min(gameCfg.mapHeight - 1, cy);
        for (let r = rStart; r <= rEnd; r++) {
          const tile = state.tiles[r][col];
          if (tile.shieldUntilTick > state.tick) continue;
          tile.color = caster.color;
          tile.lastPaintedTick = state.tick;
        }
      }

      const visualTicks = skillsCfg.laser.visualTicks;
      const beam: LaserBeam = {
        id: `laser_${state.tick}_${beamSeq++}`,
        ownerId: casterId,
        ownerColor: caster.color,
        origin: { x: cx, y: cy },
        direction,
        spawnedAtTick: state.tick,
        expireAtTick: state.tick + visualTicks,
      };
      state.laserBeams.push(beam);
    },
  });
}

/**
 * 激光视觉记录到期清理（每 tick 调用一次）。
 * 与 cleanupAreaEffects 同款：state.tick >= expireAtTick 即移除。
 */
export function cleanupLaserBeams(state: GameState): void {
  if (state.laserBeams.length === 0) return;
  state.laserBeams = state.laserBeams.filter((b) => state.tick < b.expireAtTick);
}
