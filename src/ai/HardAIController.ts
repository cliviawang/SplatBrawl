/**
 * HardAIController（阶段 10）：
 *
 * 与 Medium 对比的关键升级：
 *   1. 决策走 UtilityScorer 打分（任务 10.1）：每帧重新评估候选行为，最高分执行
 *   2. 释放技能前可 combo dash 凑位（任务 10.2）：rocket 贴近敌人、laser 贴近边缘
 *   3. 局势感知（任务 10.3）：每帧算一次 self-rank + topColor，动态调整移动权重
 *
 * 仍然遵守的不变量：
 *   - 不 import phaser
 *   - 不使用 Date.now / setTimeout（rand 注入，与 Medium 一致）
 *   - 对 GameState 只读
 *
 * 注意：HardAIController 不复用 MovementDecision/DashDecision/SkillDecision
 *      —— 那三个函数面向 Medium 的"概率随机 + 简单优先"语义，把 Hard 强行套进去
 *      会让两边逻辑互相牵制。这里直接调用 UtilityScorer 的三个评估器，
 *      Hard 与 Medium 平行存在（联机时仍按难度选 controller，互不影响）。
 */
import type { GameState, PlayerIntent, Color, Vec2 } from '@/core/types';
import gameCfg from '@/config/game.json';
import spawnsCfg from '@/config/spawns.json';
import { computeScores } from '@/core/scoring';
import type { AIConfig, AIContext, AIDecider } from './AIContext';
import {
  computeColorCentroid,
  scoreBestMoveTarget,
  scoreDashTarget,
  scoreSkillCast,
  type ScoringContext,
} from './scoring/UtilityScorer';

/** 地盘偏置默认参数。集中放这里，方便后续调参或挪进 hard.json。 */
const HOME_BIAS_STRENGTH_DEFAULT = 0.3;
const HOME_BIAS_RADIUS_DEFAULT = 6;

interface SpawnEntry {
  playerId: number;
  row: number;
  col: number;
}

/**
 * 由 spawn 位置算出该 AI 的"地盘方向"单位向量：spawn 中心 → 地图中心 的反向。
 * 物理意义：每只 AI 倾向于在自己出生点那一侧活动，4 只 AI 出生点分散 → 自然形成
 * 4 个象限的"势力范围"，从根上消除截图中"3 AI 挤一起绕圈"的几何吸引子。
 *
 * 若 spawn 位于地图正中心 → 返回零向量（不施加偏置）。
 */
function computeHomeDir(playerId: number): Vec2 {
  const spawns = spawnsCfg.spawns as SpawnEntry[];
  const s = spawns.find((sp) => sp.playerId === playerId);
  if (!s) return { x: 0, y: 0 };
  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;
  const cx = W / 2;
  const cy = H / 2;
  // spawn 格中心 = (col + 0.5, row + 0.5)
  const dx = s.col + 0.5 - cx;
  const dy = s.row + 0.5 - cy;
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return { x: 0, y: 0 };
  return { x: dx / mag, y: dy / mag };
}

export class HardAIController implements AIDecider {
  public readonly playerId: number;
  private readonly ctx: AIContext;
  private readonly rand: () => number;
  private readonly homeDir: Vec2;
  /**
   * 反站立保险：连续输出零 moveDir 的 tick 数。
   * 达到 STATIC_GUARD_TICKS 时强制随机偏移目标格，避免 AI 看起来"掉线"。
   * 60fps 下 15 tick ≈ 0.25s。
   */
  private staticTickCount = 0;
  private static readonly STATIC_GUARD_TICKS = 15;

  constructor(playerId: number, config: AIConfig, rand: () => number = Math.random) {
    this.playerId = playerId;
    this.rand = rand;
    this.homeDir = computeHomeDir(playerId);
    this.ctx = {
      playerId,
      config,
      decisionTimer: Infinity,
      currentTargetCell: null,
    };
  }

  getContext(): Readonly<AIContext> {
    return this.ctx;
  }

  decide(state: GameState, dt: number): PlayerIntent {
    const player = state.players[this.playerId];
    if (!player) {
      return { playerId: this.playerId, moveDir: { x: 0, y: 0 }, dash: false, useSkill: false };
    }

    // 1. 局势分析：算 self-rank + topColor + topColorCentroid
    const scoring = this.buildScoringContext(state);

    // 2. 决策计时器：每 decisionInterval 重选目标格 + 已抵达目标也重选
    this.ctx.decisionTimer += dt;
    const intervalSec = this.ctx.config.decisionInterval / 1000;
    let shouldRepick =
      this.ctx.decisionTimer >= intervalSec || this.ctx.currentTargetCell === null;
    if (!shouldRepick && this.ctx.currentTargetCell) {
      const tx = this.ctx.currentTargetCell.col + 0.5 - player.pos.x;
      const ty = this.ctx.currentTargetCell.row + 0.5 - player.pos.y;
      if (tx * tx + ty * ty < 0.6 * 0.6) shouldRepick = true;
    }
    if (shouldRepick) {
      const target = scoreBestMoveTarget(scoring);
      if (target) {
        const myCol = Math.floor(player.pos.x);
        const myRow = Math.floor(player.pos.y);
        // 兜底：scoreBestMoveTarget 已排除脚下格，但极端情况下（如 awarenessRadius
        // 内仅剩护盾格 / 视野狭窄）可能返回 null 或诡异目标 —— 这里再保一层。
        if (target.col === myCol && target.row === myRow) {
          const neighbor = this.pickBestNeighbor(state, player.pos.x, player.pos.y);
          this.ctx.currentTargetCell = neighbor ?? { col: target.col, row: target.row };
        } else {
          this.ctx.currentTargetCell = { col: target.col, row: target.row };
        }
      }
      this.ctx.decisionTimer = 0;
    }

    // 3. 重新评估当前目标格的"实时分数"，给 dash 候选用（避免 stale 分数）
    const liveBestMove = scoreBestMoveTarget(scoring);

    // 4. moveDir：默认指向当前目标格
    let moveDir = { x: 0, y: 0 };
    const t = this.ctx.currentTargetCell;
    if (t) {
      const dx = t.col + 0.5 - player.pos.x;
      const dy = t.row + 0.5 - player.pos.y;
      const dist = Math.hypot(dx, dy);
      moveDir = dist < 0.1 ? { x: 0, y: 0 } : { x: dx, y: dy };
    }

    // 4b. 静态守卫：连续 STATIC_GUARD_TICKS 输出零向量 → 强制随机非零方向
    // 触发条件包括：scoreBestMoveTarget 返回 null（全图自家色）、currentTargetCell
    // 与玩家所在格几乎重合等。任何看起来"AI 卡住不动"的场景都能被这层兜住。
    const moveMag = Math.hypot(moveDir.x, moveDir.y);
    if (moveMag < 0.01) {
      this.staticTickCount++;
      if (this.staticTickCount >= HardAIController.STATIC_GUARD_TICKS) {
        const angle = this.rand() * Math.PI * 2;
        moveDir = { x: Math.cos(angle), y: Math.sin(angle) };
        // 同步把目标格挪到这个随机方向上 2 格远，让后续 tick 有持续目标
        const targetCol = Math.floor(player.pos.x + moveDir.x * 2);
        const targetRow = Math.floor(player.pos.y + moveDir.y * 2);
        const W = state.tiles[0]?.length ?? 1;
        const H = state.tiles.length;
        this.ctx.currentTargetCell = {
          col: Math.max(0, Math.min(W - 1, targetCol)),
          row: Math.max(0, Math.min(H - 1, targetRow)),
        };
        this.staticTickCount = 0;
      }
    } else {
      this.staticTickCount = 0;
    }

    // 5. Skill 评估（含 combo）
    const skillRes = scoreSkillCast(scoring);
    let useSkill = false;
    let dash = false;

    if (skillRes.cast) {
      useSkill = true;
    } else if (skillRes.comboDashDir) {
      // combo dash：本 tick 优先 dash 凑位，不放技能
      // 触发门同 evaluateDash：dash 不在冷却 / 未眩晕（scoreSkillCast 已校验）
      dash = true;
      moveDir = { x: skillRes.comboDashDir.x, y: skillRes.comboDashDir.y };
    }

    // 6. 常规 dash（仅在没有 combo dash 时考虑）
    if (!dash) {
      const dashRes = scoreDashTarget(scoring, dt, this.rand, liveBestMove);
      if (dashRes) {
        dash = true;
        moveDir = { x: dashRes.dir.x, y: dashRes.dir.y };
      }
    }

    return { playerId: this.playerId, moveDir, dash, useSkill };
  }

  /**
   * 在玩家 8 邻里挑一个非自家色的合法格作为兜底目标。
   * 全是自家色 → 返回 null（让外层走静态守卫）。
   * 注意：本函数仅在 scoreBestMoveTarget 返回脚下格的极端兜底场景调用，
   * 是"目标 == 当前格"防御的第一层保险。
   */
  private pickBestNeighbor(
    state: GameState,
    px: number,
    py: number,
  ): { col: number; row: number } | null {
    const myCol = Math.floor(px);
    const myRow = Math.floor(py);
    const player = state.players[this.playerId];
    if (!player) return null;
    const myColor = player.color;
    const W = state.tiles[0]?.length ?? 0;
    const H = state.tiles.length;

    let bestCol = -1;
    let bestRow = -1;
    let bestPriority = -1;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = myRow + dr;
        const c = myCol + dc;
        if (r < 0 || r >= H || c < 0 || c >= W) continue;
        const color = state.tiles[r][c].color;
        if (color === myColor) continue;
        // 中性优先级 2，敌色 1
        const priority = color === 'neutral' ? 2 : 1;
        if (priority > bestPriority) {
          bestPriority = priority;
          bestCol = c;
          bestRow = r;
        }
      }
    }
    if (bestCol < 0) return null;
    return { col: bestCol, row: bestRow };
  }

  private buildScoringContext(state: GameState): ScoringContext {
    const scores = computeScores(state);
    const nonNeutral = scores.filter((s) => s.color !== 'neutral');
    const me = state.players[this.playerId];
    const myColor: Color | null = me ? me.color : null;
    let selfRank = nonNeutral.length; // 兜底：在末尾
    for (let i = 0; i < nonNeutral.length; i++) {
      if (nonNeutral[i].color === myColor) {
        selfRank = i;
        break;
      }
    }
    // top（非 neutral 的第一名）；若与自己同色（领先），topColor 仍记录"第二名"作为入侵焦点候选
    const topColor: Color | null =
      nonNeutral.length > 0 ? nonNeutral[0].color : null;
    // 若自己就是 top，把 centroid 指向第二名颜色（领先时入侵焦点用不上，但为防御性数据完整性保留）
    const focusColor: Color | null =
      selfRank === 0 && nonNeutral.length >= 2 ? nonNeutral[1].color : topColor;
    const topColorCentroid = focusColor ? computeColorCentroid(state, focusColor) : null;

    return {
      state,
      playerId: this.playerId,
      config: this.ctx.config,
      selfRank,
      topColor: focusColor,
      topColorCentroid,
      homeDir: this.homeDir,
      homeBiasStrength: HOME_BIAS_STRENGTH_DEFAULT,
      homeBiasRadius: HOME_BIAS_RADIUS_DEFAULT,
    };
  }
}
