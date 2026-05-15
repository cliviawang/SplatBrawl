import easyCfg from '@/config/ai/easy.json';
import mediumCfg from '@/config/ai/medium.json';
import hardCfg from '@/config/ai/hard.json';
import { AIController } from './AIController';
import { MediumAIController } from './MediumAIController';
import { HardAIController } from './HardAIController';
import type { AIConfig, AIDecider } from './AIContext';

/**
 * AI 难度三档：与 src/config/ai/{easy,medium,hard}.json 一一对应。
 *
 * - easy：随机走位 + 拾到就放
 * - medium：会找近格 / 反应一般
 * - hard：抢技能 / 高侵略
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * 创建对应难度的 AI 控制器。MatchScene 与 HeadlessRunner 共用同一工厂，
 * 保证"客户端选了 medium → 服务端复跑也是 medium"的等价语义。
 *
 * @param playerId   GameState.players[] 的索引
 * @param difficulty 难度档位
 * @param rand       注入式随机源；不传走 Math.random（联机/确定性需求时务必显式传入）
 */
export function createAIController(
  playerId: number,
  difficulty: Difficulty,
  rand: () => number = Math.random,
): AIDecider {
  if (difficulty === 'hard') {
    return new HardAIController(playerId, hardCfg as AIConfig, rand);
  }
  if (difficulty === 'medium') {
    return new MediumAIController(playerId, mediumCfg as AIConfig, rand);
  }
  return new AIController(playerId, easyCfg as AIConfig, rand);
}
