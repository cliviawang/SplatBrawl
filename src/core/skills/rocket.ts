/**
 * 火箭技能（阶段 6.3.1）。
 *
 * 释放：在玩家当前位置朝 8 个均匀方向（每 45°）各生成一颗投射物；speed/stunSec 来自 skills.json。
 *       directions 数量来自 skills.json.rocket.directions（默认 8）。与玩家 facing 无关。
 * 飞行：每 tick 推进 velocity*dt；命中其他玩家 → 眩晕 stunSec + 命中格染色；飞出地图边界 → 移除。
 *
 * 命中判定使用粗略的"扫掠 AABB vs 圆"近似：每 tick 内取移动向量上等距采样 N 点，
 * 任一点落在某玩家的 collisionRadius 圆内即命中。N 取 max(1, ceil(stepLen / r))，保证不漏检。
 */
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import playerCfg from '@/config/player.json';
import { registerSkill } from './registry';
import type { GameState, Projectile } from '../types';

let projectileSeq = 0;

export function registerRocket(): void {
  registerSkill({
    id: 'rocket',
    type: 'projectile',
    onCast(state, casterId) {
      const caster = state.players[casterId];
      if (!caster) return;
      const speed = skillsCfg.rocket.speed;
      const dirCount = skillsCfg.rocket.directions ?? 8;
      for (let i = 0; i < dirCount; i++) {
        const angle = (i * 2 * Math.PI) / dirCount;
        const proj: Projectile = {
          id: `rocket_${state.tick}_${projectileSeq++}`,
          ownerId: casterId,
          type: 'rocket',
          pos: { x: caster.pos.x, y: caster.pos.y },
          velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          ownerColor: caster.color,
          spawnTick: state.tick,
        };
        state.projectiles.push(proj);
      }
    },
  });
}

/**
 * 推进所有投射物一个 tick：移动、命中检测、出界移除。
 * 按 GameLoop 调用一次 / tick；dt 即固定步长（1/60 s）。
 */
export function applyProjectiles(state: GameState, dt: number): void {
  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;
  const stunTicks = Math.round(skillsCfg.rocket.stunSec * gameCfg.tickRate);
  const playerR = playerCfg.collisionRadius;

  // 倒序遍历方便 splice
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    const startX = proj.pos.x;
    const startY = proj.pos.y;
    const dxStep = proj.velocity.x * dt;
    const dyStep = proj.velocity.y * dt;
    const stepLen = Math.hypot(dxStep, dyStep);
    const samples = Math.max(1, Math.ceil(stepLen / playerR));

    let hit = false;
    for (let s = 1; s <= samples && !hit; s++) {
      const t = s / samples;
      const sx = startX + dxStep * t;
      const sy = startY + dyStep * t;
      // 命中玩家？
      for (const target of state.players) {
        if (target.id === proj.ownerId) continue;
        const ddx = target.pos.x - sx;
        const ddy = target.pos.y - sy;
        if (ddx * ddx + ddy * ddy <= playerR * playerR) {
          // 命中：眩晕 + 命中格染色（跳过护盾）
          target.stunUntilTick = state.tick + stunTicks;
          const hx = Math.floor(sx);
          const hy = Math.floor(sy);
          if (hx >= 0 && hx < W && hy >= 0 && hy < H) {
            const tile = state.tiles[hy][hx];
            if (state.tick >= tile.shieldUntilTick) {
              tile.color = proj.ownerColor;
              tile.lastPaintedTick = state.tick;
            }
          }
          state.projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }
    }
    if (hit) continue;

    // 未命中：推进并检查边界
    proj.pos.x = startX + dxStep;
    proj.pos.y = startY + dyStep;
    if (proj.pos.x < 0 || proj.pos.x > W || proj.pos.y < 0 || proj.pos.y > H) {
      state.projectiles.splice(i, 1);
    }
  }
}
