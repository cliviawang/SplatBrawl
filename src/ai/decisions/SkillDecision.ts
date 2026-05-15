/**
 * SkillDecision（阶段 9 - Medium AI）：决定本 tick 是否释放技能。
 *
 * 前置门：
 *   - 玩家存在且持有亮态技能（slot.used=false）
 *   - 不在眩晕中
 *
 * 释放策略（skillPositionAware=true 时按技能类型差异化）：
 *   - rocket：感知半径内有其他玩家时立即释放（火箭飞过染色 + 命中眩晕）
 *   - laser / speed / roller：buff/染色类无情境约束，立即释放（持有 = 浪费）
 *   - shield：自身周围 3x3 内有敌色格时释放（保护自家染色 / 阻断敌人染色）
 *   - bomb / 其他区域类：立即释放（地图小，2 格半径基本总能蹭到敌色）
 *
 * skillPositionAware=false 时持有即放（与 Easy 思路接近，但 Easy 当前完全不用技能）。
 */
import type { Color } from '@/core/types';
import type { DecisionContext } from './types';

export function evaluateSkill(ctx: DecisionContext): boolean {
  const { state, playerId, config } = ctx;
  const player = state.players[playerId];
  if (!player) return false;
  if (!player.skillSlot || player.skillSlot.used) return false;
  if (state.tick < player.stunUntilTick) return false;

  const skillId = player.skillSlot.id;

  if (!config.skillPositionAware) return true;

  // rocket：需要有敌人在感知半径内
  if (skillId === 'rocket') {
    const r = config.awarenessRadius ?? Math.max(state.tiles[0].length, state.tiles.length);
    const r2 = r * r;
    for (const other of state.players) {
      if (other.id === playerId) continue;
      const dx = other.pos.x - player.pos.x;
      const dy = other.pos.y - player.pos.y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  // shield：周围 3x3 内有敌色格才释放
  if (skillId === 'shield') {
    const cx = Math.floor(player.pos.x);
    const cy = Math.floor(player.pos.y);
    const myColor: Color = player.color;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const row = cy + dy;
        const col = cx + dx;
        if (row < 0 || row >= state.tiles.length) continue;
        if (col < 0 || col >= state.tiles[0].length) continue;
        const c = state.tiles[row][col].color;
        if (c !== 'neutral' && c !== myColor) return true;
      }
    }
    return false;
  }

  // 其他（speed/laser/roller/bomb/star/charge/seed/ripple/mark/rewind）：立即释放
  return true;
}
