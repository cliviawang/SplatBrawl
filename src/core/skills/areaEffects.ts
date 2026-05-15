/**
 * 区域效果清理（阶段 6.3.3+）。
 * 每 tick 调用一次：移除已经过期的 AreaEffect。
 *
 * 注意：tile.shieldUntilTick 字段不需要主动清零——
 *   读取处统一用 `state.tick < tile.shieldUntilTick` 判断生效，过了就自然失效。
 */
import type { GameState } from '../types';

export function cleanupAreaEffects(state: GameState): void {
  if (state.areaEffects.length === 0) return;
  state.areaEffects = state.areaEffects.filter((ae) => state.tick < ae.expireAtTick);
}
