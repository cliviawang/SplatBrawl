/**
 * 涂刷技能（阶段 6.3.5）。
 *
 * 释放：在玩家身上设置 rollerUntilTick；时长来自 skills.json/roller.durationSec。
 * 实际宽染色生效在 movement.ts 内（state.tick < player.rollerUntilTick 时跨格扩展染色）。
 */
import skillsCfg from '@/config/skills.json';
import gameCfg from '@/config/game.json';
import { registerSkill } from './registry';

export function registerRoller(): void {
  registerSkill({
    id: 'roller',
    type: 'buff',
    onCast(state, casterId) {
      const caster = state.players[casterId];
      if (!caster) return;
      const ticks = Math.round(skillsCfg.roller.durationSec * gameCfg.tickRate);
      caster.rollerUntilTick = state.tick + ticks;
    },
  });
}
