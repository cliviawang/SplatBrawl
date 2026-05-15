/**
 * 护盾技能（阶段 6.3.3）。
 *
 * 释放：
 *   1. 在玩家所在格周围 (2*radius+1)² 范围内，"属于自己颜色"的格子设置 shieldUntilTick；
 *      米色和他人格子不受影响（与玩法规则一致）。
 *   2. 在 state.areaEffects 推入一条 shield 类型条目；视觉光罩仍按 3×3 整片画，
 *      逻辑上仅自己色格子有真实护盾效果（tile.shieldUntilTick 是单一来源）。
 *
 * 实际"染色被阻挡"的逻辑写在 movement.ts / 其他染色源处，统一查 tile.shieldUntilTick。
 */
import skillsCfg from '@/config/skills.json';
import gameCfg from '@/config/game.json';
import { registerSkill } from './registry';
import type { AreaEffect } from '../types';

let shieldSeq = 0;

export function registerShield(): void {
  registerSkill({
    id: 'shield',
    type: 'area',
    onCast(state, casterId) {
      const caster = state.players[casterId];
      if (!caster) return;
      const radius = skillsCfg.shield.radius;
      const ticks = Math.round(skillsCfg.shield.durationSec * gameCfg.tickRate);
      const expireAtTick = state.tick + ticks;
      const cx = Math.floor(caster.pos.x);
      const cy = Math.floor(caster.pos.y);

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const c = cx + dx;
          const r = cy + dy;
          if (c < 0 || c >= gameCfg.mapWidth || r < 0 || r >= gameCfg.mapHeight) continue;
          const tile = state.tiles[r][c];
          // 仅保护"自己颜色"的格子；米色和他人格子不受影响
          if (tile.color !== caster.color) continue;
          tile.shieldUntilTick = expireAtTick;
        }
      }

      const ae: AreaEffect = {
        id: `shield_${state.tick}_${shieldSeq++}`,
        type: 'shield',
        ownerId: casterId,
        centerX: cx,
        centerY: cy,
        expireAtTick,
      };
      state.areaEffects.push(ae);
    },
  });
}
