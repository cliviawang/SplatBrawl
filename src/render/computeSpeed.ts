import type { Vec2 } from '@/core/types';

/**
 * 反推玩家速度（格/秒）：基于上一帧位置 + 当前帧位置 + 步长。
 *
 * - prev 为 null（首帧）或 dt <= 0 时返回 0，避免 NaN/Infinity
 * - 调试 HUD 用，不进核心逻辑层
 */
export function computeSpeed(prev: Vec2 | null, cur: Vec2, dt: number): number {
  if (prev === null || dt <= 0) return 0;
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  return Math.hypot(dx, dy) / dt;
}
