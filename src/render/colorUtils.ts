/**
 * 颜色工具：渲染层用，纯函数 + 零依赖。
 *
 * 拆出来是为了在 vitest（happy-dom 环境）里能直接 import 并测试，
 * 而不被 UIButton 的 `import Phaser` 一并加载导致 canvas 初始化报错。
 */

/**
 * 把 0xRRGGBB 颜色按比例降亮（用于按下态背景等）。
 * factor=0 完全黑，factor=1 不变；越界自动夹到 [0,1]。
 */
export function darkenColor(color: number, factor: number): number {
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(((color >> 16) & 0xff) * f);
  const g = Math.round(((color >> 8) & 0xff) * f);
  const b = Math.round((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}
