/**
 * 决策模块共享类型（阶段 9）。
 *
 * 设计原则：
 *   - 每个 evaluate* 函数为纯函数：相同输入 → 相同输出（前提：rand 注入）
 *   - 不修改 state（只读访问）
 *   - 不依赖 Phaser；可被 Headless 服务端原样复用（联机时只搬 src/ai 即可）
 */
import type { GameState, Vec2 } from '@/core/types';
import type { AIConfig } from '../AIContext';

/** 决策上下文：所有 Decision 共用 */
export interface DecisionContext {
  state: GameState;
  playerId: number;
  config: AIConfig;
  /** [0,1) 伪随机源；调用方可注入 seed PRNG 保证可重放 */
  rand: () => number;
}

/** 移动决策返回的目标格（整数格坐标）；null = 玩家缺失或无可选目标 */
export type MovementResult = { col: number; row: number } | null;

/** 冲刺决策返回的方向（单位向量）；null = 不冲刺 */
export type DashResult = { dir: Vec2 } | null;
