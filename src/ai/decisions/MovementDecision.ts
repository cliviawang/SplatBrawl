/**
 * MovementDecision（阶段 9 - Medium AI）：选下一个目标格。
 *
 * 策略：
 *   - 以 pathRandomness 概率走纯随机（与 Easy 行为一致），保留探索性
 *   - 否则若 preferNeutralTiles=true：从"邻近中性格"中加权选一个
 *     - 收集距离玩家 awarenessRadius 内的中性格（按距离平方做轮盘赌权重，越近权重越高）
 *     - 半径内若没有中性格 → 退化为半径内任意敌色格（去抢回）
 *     - 都没有 → 全图随机抽一个中性格 → 都没有 → 完全随机一格
 *
 * 设计理由（来自阶段 9 50 局对战的实证调试）：
 *   v1（全图均匀挑中性格）会让 AI 频繁跨图长途奔袭，自家边缘容易被敌方蚕食。
 *   v2 改成"近邻偏好"后，AI 更倾向把自家周围的米色快速涂掉，类似真人玩家的"先扩边"。
 */
import gameCfg from '@/config/game.json';
import type { Color, Vec2 } from '@/core/types';
import type { DecisionContext, MovementResult } from './types';

interface CellScore {
  col: number;
  row: number;
  weight: number;
}

function pickWeighted(items: CellScore[], rand: () => number): { col: number; row: number } | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const it of items) total += it.weight;
  if (total <= 0) return items[Math.floor(rand() * items.length)];
  let r = rand() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return { col: it.col, row: it.row };
  }
  return items[items.length - 1];
}

export function evaluateMovement(ctx: DecisionContext): MovementResult {
  const { state, playerId, config, rand } = ctx;
  const player = state.players[playerId];
  if (!player) return null;

  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;

  if (rand() < config.pathRandomness) {
    return { col: Math.floor(rand() * W), row: Math.floor(rand() * H) };
  }

  if (config.preferNeutralTiles) {
    const r = config.awarenessRadius ?? Math.max(W, H);
    const r2 = r * r;
    const myColor: Color = player.color;
    const playerPos: Vec2 = player.pos;

    const neutralsLocal: CellScore[] = [];
    const enemiesLocal: CellScore[] = [];
    const neutralsGlobal: { col: number; row: number }[] = [];

    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const c = state.tiles[row][col].color;
        const dx = col + 0.5 - playerPos.x;
        const dy = row + 0.5 - playerPos.y;
        const d2 = dx * dx + dy * dy;
        if (c === 'neutral') {
          neutralsGlobal.push({ col, row });
          if (d2 <= r2) {
            // 越近权重越大；+0.5 防止除零，且让自身格不会过分独占权重
            neutralsLocal.push({ col, row, weight: 1 / (d2 + 0.5) });
          }
        } else if (c !== myColor && d2 <= r2) {
          // 敌色格的权重略低于中性（中性是"白送的染色"）
          enemiesLocal.push({ col, row, weight: 0.5 / (d2 + 0.5) });
        }
      }
    }

    const localPool = neutralsLocal.length > 0 ? neutralsLocal : enemiesLocal;
    const picked = pickWeighted(localPool, rand);
    if (picked) return picked;

    if (neutralsGlobal.length > 0) {
      return neutralsGlobal[Math.floor(rand() * neutralsGlobal.length)];
    }
  }

  return { col: Math.floor(rand() * W), row: Math.floor(rand() * H) };
}
