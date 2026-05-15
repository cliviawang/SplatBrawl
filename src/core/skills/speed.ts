/**
 * 极速技能（阶段 6.3.2）。
 * 释放：在玩家身上设置 speedBoostUntilTick；时长来自 skills.json/speed.durationSec。
 * 实际加速生效在 movement.ts 内（state.tick < player.speedBoostUntilTick 时 ×multiplier）。
 */
import skillsCfg from '@/config/skills.json';
import gameCfg from '@/config/game.json';
import { registerSkill } from './registry';

export function registerSpeed(): void {
  registerSkill({
    id: 'speed',
    type: 'buff',
    onCast(state, casterId) {
      const caster = state.players[casterId];
      if (!caster) return;
      const ticks = Math.round(skillsCfg.speed.durationSec * gameCfg.tickRate);
      caster.speedBoostUntilTick = state.tick + ticks;
    },
  });
}
