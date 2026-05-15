/**
 * HeadlessRunner（阶段 9）：无渲染跑完整一局，用于：
 *
 *   1. AI 对战胜率统计（tests/ai/battle.test.ts）
 *   2. 阶段 12 的"自动复跑 N 局看分布"调参辅助
 *
 * 实现要点：
 *   - 直接复用 GameLoop（src/single/GameLoop.ts），不做渲染
 *   - AI 通过 AIController（Easy）/ MediumAIController（Medium）；rand 由 mulberry32(seed) 派生
 *   - 为了让 core 内部的非注入式随机源（如 src/core/skills/star.ts 的 Math.random）也确定化，
 *     run() 期间临时把全局 Math.random 替换为种子 PRNG，结束后恢复（即便测试抛错也恢复）。
 *   - 玩家数固定 4：与 spawns.json 对齐；players 数组按 playerId 0..3 顺序映射难度
 *   - tickRate 60Hz，60 秒 → 3600 tick；通过反复调用 GameLoop.update(dt) 推进
 */
import gameCfg from '@/config/game.json';
import { createAIController, type Difficulty } from '@/ai/factory';
import type { AIDecider } from '@/ai/AIContext';
import { GameLoop } from '@/single/GameLoop';
import { computeScores, type ColorScore } from '@/core/scoring';
import type { Color } from '@/core/types';

export type { Difficulty };

export interface RunHeadlessOptions {
  /** 4 个玩家的难度，按 playerId 0..3 映射 */
  players: Difficulty[];
  /** 种子；同种子保证可重放 */
  seed: number;
}

export interface RunHeadlessResult {
  /** 胜者 playerId（按颜色映射），并列或全图未染时返回 null */
  winner: number | null;
  /** 完整分数（含 neutral） */
  scores: ColorScore[];
  /** 比赛阶段（应为 'ended'） */
  matchPhase: 'playing' | 'ended';
}

/** mulberry32：32 位种子 → [0,1) 伪随机；纯函数式，便于重放 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeController(playerId: number, diff: Difficulty, rand: () => number): AIDecider {
  return createAIController(playerId, diff, rand);
}

/** 把颜色映射回 spawns.json 中对应的 playerId（与 GameState.players 一致） */
function colorToPlayerId(color: Color, players: { id: number; color: Color }[]): number | null {
  const p = players.find((x) => x.color === color);
  return p ? p.id : null;
}

export function runHeadless(opts: RunHeadlessOptions): RunHeadlessResult {
  const seed = opts.seed >>> 0;
  // 给每个 AI 派生独立 PRNG（基于 seed + playerId 做混合），避免它们共享同一序列时同步抖动
  const ais: AIDecider[] = opts.players.map((diff, i) =>
    makeController(i, diff, mulberry32(seed * 1000003 + i + 1)),
  );

  const loop = new GameLoop();

  // 临时替换全局 Math.random（覆盖 core 中 star.ts 等未注入的随机源）；
  // 注意 GameLoop.tryRefreshPickups 用了 Math.random（默认参数），也走这条注入。
  const originalRandom = Math.random;
  const globalRand = mulberry32(seed * 1000003 + 7919);
  Math.random = globalRand;

  try {
    const dt = 1 / gameCfg.tickRate;
    const totalTicks = Math.ceil(gameCfg.matchDurationSec * gameCfg.tickRate) + 60; // 多跑 1 秒确保切到 ended
    for (let t = 0; t < totalTicks; t++) {
      // 每 tick 让所有 AI 投递 Intent
      for (const ai of ais) {
        const intent = ai.decide(loop.state, dt);
        loop.setIntent(intent);
      }
      // 推进一步（GameLoop.update 内部按 accumulator 切 tick；这里直接给 dt 让它正好切 1 tick）
      loop.update(dt);
      if (loop.state.matchPhase === 'ended') break;
    }

    const scores = computeScores(loop.state);
    // 取首位非 neutral 颜色；首位若与第二位 count 相同则视为并列（winner=null）
    let winner: number | null = null;
    const nonNeutral = scores.filter((s) => s.color !== 'neutral');
    if (nonNeutral.length >= 1) {
      const top = nonNeutral[0];
      const tied = nonNeutral.length >= 2 && nonNeutral[1].count === top.count
        && nonNeutral[1].lastPaintedTick === top.lastPaintedTick;
      if (!tied && top.count > 0) {
        winner = colorToPlayerId(top.color, loop.state.players);
      }
    }

    return {
      winner,
      scores,
      matchPhase: loop.state.matchPhase,
    };
  } finally {
    Math.random = originalRandom;
  }
}
