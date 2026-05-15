/**
 * 炸弹技能（阶段 6.4.3，定位：干扰类——区域清色）。
 *
 * 释放（type='area'）：
 *   1. 在 caster 当前格 (cx, cy) = floor(pos) 推入一条 AreaEffect{
 *        type:'bomb', ownerId, centerX:cx, centerY:cy,
 *        expireAtTick: state.tick + delaySec * tickRate
 *      }
 *   2. 不阻挡走位，不互动，可踩；同位置允许多颗叠放（不查重，直接 push）
 *
 * 引爆（applyBombExplosions，每 tick 在 cleanupAreaEffects 之前调用）：
 *   - 扫描 state.areaEffects 中 type==='bomb' 且 state.tick >= expireAtTick 的条目
 *   - 5×5 范围（radius=2）clamp 到地图边界，跳过 shieldUntilTick > tick 的护盾格
 *   - 将范围内非护盾格统一清为米色（neutral）——含自己/他人颜色一并清除（玩法规则·干扰类）
 *   - 更新 lastPaintedTick = state.tick（视为一次"覆盖"，影响回溯/计分等下游系统）
 *   - 推入一条 BombExplosion 视觉记录（paintedTiles = 实际被清色的格子列表）
 *   - 不在此处删除 AreaEffect —— 同 tick 由 cleanupAreaEffects 自然清掉
 *
 * 视觉记录到期清理：cleanupBombExplosions —— 与 cleanupStarFlashes 同款。
 */
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import { registerSkill } from './registry';
import type { AreaEffect, BombExplosion, GameState, Vec2 } from '../types';

/** bomb id 序列号；与 rocket/shield 风格一致：`bomb_<tick>_<seq>` */
let bombSeq = 0;
/** explosion id 序列号 */
let explosionSeq = 0;

export function registerBomb(): void {
  registerSkill({
    id: 'bomb',
    type: 'area',
    onCast(state, casterId) {
      const caster = state.players[casterId];
      if (!caster) return;
      const cx = Math.floor(caster.pos.x);
      const cy = Math.floor(caster.pos.y);
      const ticks = Math.round(skillsCfg.bomb.delaySec * gameCfg.tickRate);
      const ae: AreaEffect = {
        id: `bomb_${state.tick}_${bombSeq++}`,
        type: 'bomb',
        ownerId: casterId,
        centerX: cx,
        centerY: cy,
        expireAtTick: state.tick + ticks,
      };
      state.areaEffects.push(ae);
    },
  });
}

/**
 * 引爆所有"本 tick 到期"的炸弹。
 * 调用顺序：在 cleanupAreaEffects 之前，与 applyProjectiles 等推进系统并列。
 */
export function applyBombExplosions(state: GameState): void {
  if (state.areaEffects.length === 0) return;

  const radius = skillsCfg.bomb.radius;
  const visualTicks = skillsCfg.bomb.explosionVisualTicks;
  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;

  for (const ae of state.areaEffects) {
    if (ae.type !== 'bomb') continue;
    if (state.tick < ae.expireAtTick) continue;

    // ownerId 仅用于视觉记录归属；不再用 owner.color 染色（玩法规则：干扰类，清米色）
    const cMin = Math.max(0, ae.centerX - radius);
    const cMax = Math.min(W - 1, ae.centerX + radius);
    const rMin = Math.max(0, ae.centerY - radius);
    const rMax = Math.min(H - 1, ae.centerY + radius);

    const paintedTiles: Vec2[] = [];
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const tile = state.tiles[r][c];
        if (tile.shieldUntilTick > state.tick) continue;
        tile.color = 'neutral';
        tile.lastPaintedTick = state.tick;
        paintedTiles.push({ x: c, y: r });
      }
    }

    const explosion: BombExplosion = {
      id: `bombex_${state.tick}_${explosionSeq++}`,
      ownerId: ae.ownerId,
      centerX: ae.centerX,
      centerY: ae.centerY,
      paintedTiles,
      spawnedAtTick: state.tick,
      expireAtTick: state.tick + visualTicks,
    };
    state.bombExplosions.push(explosion);
  }
}

/**
 * 炸弹爆炸视觉记录到期清理（每 tick 调用一次）。
 * 与 cleanupStarFlashes / cleanupLaserBeams 同款：state.tick >= expireAtTick 即移除。
 */
export function cleanupBombExplosions(state: GameState): void {
  if (state.bombExplosions.length === 0) return;
  state.bombExplosions = state.bombExplosions.filter((e) => state.tick < e.expireAtTick);
}
