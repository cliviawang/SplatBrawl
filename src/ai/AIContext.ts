/**
 * AI 模块共享类型。纯数据结构，不依赖 Phaser，也不直接依赖 core 里的 Player 结构
 * （core 只按 playerId 寻址）。
 */

import type { GameState, PlayerIntent } from '@/core/types';

/**
 * 难度配置。阶段 4 只需要 Easy 相关字段，阶段 9/10 会在同类型上追加更多字段。
 * 先只声明当前用得上的；未来字段用可选，避免破坏 JSON 结构兼容。
 */
export interface AIConfig {
  /** 重新选择目标格的周期（毫秒）。内部按秒累计。 */
  decisionInterval: number;
  /** 路径随机度（0~1）。Easy=0.7（基本随机），Medium=0.3（多数时候有意图）。 */
  pathRandomness: number;
  /** 每秒触发一次冲刺的期望概率（0~1）。内部换算为每 tick 概率 = p * dt。 */
  dashChancePerSec: number;
  /** 冲刺目标优先级策略。Easy='random'，Medium='nearest'，Hard='utility'。 */
  dashTargetPriority: 'random' | 'nearest' | 'utility';
  /**
   * 阶段 9（Medium）字段，全部可选以保持 Easy JSON 兼容。
   */
  /** 选目标格时是否优先选中性（米色）格。默认 false。 */
  preferNeutralTiles?: boolean;
  /** 释放技能时是否考虑位置（如距离敌人远近、自身染色多寡）。默认 false。 */
  skillPositionAware?: boolean;
  /** 感知半径（格）：MovementDecision 在此半径内识别敌色格 / 敌人。默认全图。 */
  awarenessRadius?: number;
  /** 是否追踪比分趋势（落后时更激进）。当前阶段仅作为占位字段，Medium 暂未深度使用。 */
  trackScores?: boolean;

  /**
   * 阶段 10（Hard）字段，全部可选。
   * Hard AI 走"效用打分"路线：每帧给候选行为打分，取最高者执行。
   */
  /** 是否启用效用打分（Hard 必开）。默认 false → 走 Easy/Medium 旧逻辑。 */
  useUtilityScoring?: boolean;
  /** 落后系数：self-rank 每靠后 1 名，敌色格 / 第一名领地权重乘的额外倍数。默认 1.5。 */
  laggingAggressionFactor?: number;
  /** 领先系数：self-rank=0 时，自家边界附近格子的权重倍数。默认 1.8。 */
  leadingDefenseFactor?: number;
  /** 释放技能前是否做位置优化（dash 凑位再放）。默认 false。 */
  comboSkillCast?: boolean;
}

/**
 * 每个 AI 自身持有的本地持久状态。
 *
 * 为什么独立出 context：
 *   - Controller 被实例化后，decisionTimer / currentTargetCell 等字段必须跨 tick 保留
 *   - 把状态收敛进一个对象，方便阶段 9 以后对 AI 状态做快照 / 重放
 *   - 若后续引入 seeded RNG，rand 函数也挂在这里（当前阶段先不加，避免过度设计）
 */
export interface AIContext {
  playerId: number;
  config: AIConfig;
  /** 距离上次重选目标格经过的秒数，>= decisionInterval/1000 时重选 */
  decisionTimer: number;
  /** 当前正在走向的格子（col, row）。null 表示尚未选过 */
  currentTargetCell: { col: number; row: number } | null;
}

/**
 * AIController 对外契约。实现类仅暴露 decide()，由外层（MatchScene / HeadlessRunner）
 * 每 tick 调用一次并把返回的 Intent 投递给 GameLoop。
 */
export interface AIDecider {
  readonly playerId: number;
  decide(state: GameState, dt: number): PlayerIntent;
}
