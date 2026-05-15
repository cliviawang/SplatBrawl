/**
 * 星星技能（阶段 6.3.x）—— 干扰型瞬发。
 *
 * 释放（瞬发）：
 *   1. 统计全图各彩色格的数量（neutral 不参与）；
 *   2. 找出数量最多的颜色；并列时从所有最多色中等概率随机选一种为本次目标色；
 *   3. 收集该颜色所有"未受护盾保护"（shieldUntilTick > tick 视为受护）的格子作为候选；
 *   4. 从候选中随机选取 min(tilesToClear, 候选数) 个，全部清为 neutral；
 *      被清格 lastPaintedTick 同步刷新到当前 tick。
 *   5. 推入一条 StarFlash 视觉记录到 state.starFlashes（纯渲染数据），
 *      visualTicks 后由 cleanupStarFlashes 自动清除；不影响逻辑确定性。
 *
 * 边界：
 *   - 全图无任何彩色格（候选颜色集合为空）→ no-op 直接返回，不推 StarFlash。
 *   - 候选数 < tilesToClear → 候选全清。
 *
 * 随机性来源：仅 Math.random()。单测中 vi.spyOn(Math,'random') 即可注入确定值。
 * 候选颜色按固定顺序枚举（red, blue, yellow, green），保证"random=0 选第一个"的可复现行为。
 */
import skillsCfg from '@/config/skills.json';
import { registerSkill } from './registry';
import type { Color, GameState, StarFlash, Vec2 } from '../types';

/** 用于枚举的彩色顺序（与 neutral 隔离）。改动顺序会改变并列时随机选色的索引含义。 */
const PAINTABLE_COLORS: ReadonlyArray<Exclude<Color, 'neutral'>> = ['red', 'blue', 'yellow', 'green'];

/** flash id 序列号；与 laser/rocket 风格一致：`star_<tick>_<seq>` */
let flashSeq = 0;

export function registerStar(): void {
  registerSkill({
    id: 'star',
    type: 'instant',
    onCast(state, casterId) {
      // 1. 统计各颜色格数
      const counts: Record<Exclude<Color, 'neutral'>, number> = {
        red: 0,
        blue: 0,
        yellow: 0,
        green: 0,
      };
      for (const row of state.tiles) {
        for (const tile of row) {
          if (tile.color === 'neutral') continue;
          counts[tile.color]++;
        }
      }

      // 2. 找最大值与并列候选颜色
      let maxCount = 0;
      for (const color of PAINTABLE_COLORS) {
        if (counts[color] > maxCount) maxCount = counts[color];
      }
      if (maxCount === 0) return; // 全图无彩色：no-op

      const candidates: Array<Exclude<Color, 'neutral'>> = [];
      for (const color of PAINTABLE_COLORS) {
        if (counts[color] === maxCount) candidates.push(color);
      }
      const targetColor = candidates[Math.floor(Math.random() * candidates.length)];

      // 3. 收集目标色未受护盾保护的格子坐标
      const tileCandidates: Array<{ r: number; c: number }> = [];
      for (let r = 0; r < state.tiles.length; r++) {
        const row = state.tiles[r];
        for (let c = 0; c < row.length; c++) {
          const tile = row[c];
          if (tile.color !== targetColor) continue;
          if (tile.shieldUntilTick > state.tick) continue;
          tileCandidates.push({ r, c });
        }
      }
      if (tileCandidates.length === 0) return;

      // 4. 随机抽取 min(tilesToClear, 候选数) 个清为 neutral
      const N = Math.min(skillsCfg.star.tilesToClear, tileCandidates.length);
      // 部分洗牌（Fisher-Yates 截断版）：只洗前 N 个即可
      for (let i = 0; i < N; i++) {
        const j = i + Math.floor(Math.random() * (tileCandidates.length - i));
        const tmp = tileCandidates[i];
        tileCandidates[i] = tileCandidates[j];
        tileCandidates[j] = tmp;
      }
      const clearedTiles: Vec2[] = [];
      for (let i = 0; i < N; i++) {
        const { r, c } = tileCandidates[i];
        const tile = state.tiles[r][c];
        tile.color = 'neutral';
        tile.lastPaintedTick = state.tick;
        // 记录被清格用于渲染闪烁；x=col, y=row 与 Vec2 约定一致
        clearedTiles.push({ x: c, y: r });
      }

      // 5. 推入一条 StarFlash 视觉记录（纯渲染数据，逻辑层不依赖）
      const visualTicks = skillsCfg.star.visualTicks;
      const flash: StarFlash = {
        id: `star_${state.tick}_${flashSeq++}`,
        ownerId: casterId,
        tiles: clearedTiles,
        clearedColor: targetColor,
        spawnedAtTick: state.tick,
        expireAtTick: state.tick + visualTicks,
      };
      state.starFlashes.push(flash);
    },
  });
}

/**
 * 星星视觉记录到期清理（每 tick 调用一次）。
 * 与 cleanupLaserBeams 同款：state.tick >= expireAtTick 即移除。
 */
export function cleanupStarFlashes(state: GameState): void {
  if (state.starFlashes.length === 0) return;
  state.starFlashes = state.starFlashes.filter((f) => state.tick < f.expireAtTick);
}
