/**
 * MediumAIController（阶段 9）：
 *
 *   - 调用 src/ai/decisions 下三个纯函数 Decision 模块组合 Intent
 *   - 仍持有 AIContext（决策计时器 + 当前目标格），跨 tick 维护
 *   - 与 AIController（Easy）平行存在，便于阶段 10 增加 HardAIController 时不互相影响
 *
 * 不变量：
 *   - 不 import phaser
 *   - 不使用 Date.now / setTimeout（确定性：所有计时通过 dt 累积）
 *   - 对 GameState 只读
 */
import type { GameState, PlayerIntent } from '@/core/types';
import type { AIConfig, AIContext, AIDecider } from './AIContext';
import { evaluateMovement } from './decisions/MovementDecision';
import { evaluateDash } from './decisions/DashDecision';
import { evaluateSkill } from './decisions/SkillDecision';

export class MediumAIController implements AIDecider {
  public readonly playerId: number;
  private readonly ctx: AIContext;
  private readonly rand: () => number;

  constructor(playerId: number, config: AIConfig, rand: () => number = Math.random) {
    this.playerId = playerId;
    this.rand = rand;
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

    // 1. 决策计时器推进；到期 / 首次调用 / 已抵达目标格时重选
    this.ctx.decisionTimer += dt;
    const intervalSec = this.ctx.config.decisionInterval / 1000;
    let shouldRepick =
      this.ctx.decisionTimer >= intervalSec || this.ctx.currentTargetCell === null;
    if (!shouldRepick && this.ctx.currentTargetCell) {
      // 抵达目标格中心（<0.6 格 ≈ 已踩到该格）时立即重选，避免静止空转 400ms
      const tx = this.ctx.currentTargetCell.col + 0.5 - player.pos.x;
      const ty = this.ctx.currentTargetCell.row + 0.5 - player.pos.y;
      if (tx * tx + ty * ty < 0.6 * 0.6) shouldRepick = true;
    }
    if (shouldRepick) {
      const target = evaluateMovement({
        state,
        playerId: this.playerId,
        config: this.ctx.config,
        rand: this.rand,
      });
      if (target) this.ctx.currentTargetCell = target;
      this.ctx.decisionTimer = 0;
    }

    // 2. moveDir = 目标格中心 - 当前位置（与 movement 层归一化对称）
    let moveDir = { x: 0, y: 0 };
    const t = this.ctx.currentTargetCell;
    if (t) {
      const dx = t.col + 0.5 - player.pos.x;
      const dy = t.row + 0.5 - player.pos.y;
      const dist = Math.hypot(dx, dy);
      moveDir = dist < 0.1 ? { x: 0, y: 0 } : { x: dx, y: dy };
    }

    // 3. Dash：DashDecision 决定
    const dashRes = evaluateDash(
      { state, playerId: this.playerId, config: this.ctx.config, rand: this.rand },
      dt,
    );
    let dash = false;
    if (dashRes) {
      dash = true;
      // dash 方向由 movement.applyDash 内 fallback 到 moveDir/facing 处理；为了让 dash 方向贴近
      // DashDecision 推荐方向，把 moveDir 暂时覆盖为 dashRes.dir（强度 1）。
      // 注：这只在 dash=true 那一帧生效，不影响后续目标格驱动的常规移动。
      moveDir = { x: dashRes.dir.x, y: dashRes.dir.y };
    }

    // 4. Skill：SkillDecision 决定
    const useSkill = evaluateSkill({
      state,
      playerId: this.playerId,
      config: this.ctx.config,
      rand: this.rand,
    });

    return {
      playerId: this.playerId,
      moveDir,
      dash,
      useSkill,
    };
  }
}
