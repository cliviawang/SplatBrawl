import gameCfg from '@/config/game.json';
import type { GameState, PlayerIntent } from '@/core/types';
import type { AIConfig, AIContext, AIDecider } from './AIContext';

/**
 * 简单 AI（阶段 4 Easy）：
 *
 *   - 每 decisionInterval 毫秒随机选地图内一个格子作为移动目标
 *   - 每 tick 根据当前位置与目标格中心的相对位置产出 moveDir（非归一化，由
 *     movement 层统一归一化，保持与键盘输入对称）
 *   - 冲刺：每 tick 以 dashChancePerSec * dt 的概率触发一次
 *   - 不使用技能（阶段 6 注册技能系统后扩展；本阶段 useSkill 恒为 false）
 *
 * 约束（必须保持）：
 *   - 不 import phaser（check:purity 扫描）
 *   - 不使用 Date.now / setTimeout（确定性：所有计时通过 dt 累积）
 *   - 对 GameState 只读；状态变更通过返回的 Intent 交给逻辑层
 */
export class AIController implements AIDecider {
  public readonly playerId: number;
  private readonly ctx: AIContext;

  /**
   * 随机源。默认用 Math.random；阶段 9 引入 seeded RNG 时从这里注入替换，
   * 不需要改 decide 逻辑。参数化是为了单测可控（可注入固定序列）。
   */
  private readonly rand: () => number;

  constructor(playerId: number, config: AIConfig, rand: () => number = Math.random) {
    this.playerId = playerId;
    this.rand = rand;
    this.ctx = {
      playerId,
      config,
      decisionTimer: Infinity, // 初始强制在首次 decide 时选目标
      currentTargetCell: null,
    };
  }

  /** 暴露 context 只读视图给测试断言（不允许外部直接改） */
  getContext(): Readonly<AIContext> {
    return this.ctx;
  }

  decide(state: GameState, dt: number): PlayerIntent {
    const player = state.players[this.playerId];
    // 玩家缺失时兜底：零输入，不 throw（保持 controller 容错）
    if (!player) {
      return { playerId: this.playerId, moveDir: { x: 0, y: 0 }, dash: false, useSkill: false };
    }

    // 1. 决策计时器推进；到期重新抽一个目标格
    this.ctx.decisionTimer += dt;
    const intervalSec = this.ctx.config.decisionInterval / 1000;
    if (this.ctx.decisionTimer >= intervalSec || this.ctx.currentTargetCell === null) {
      this.ctx.currentTargetCell = this.pickRandomCell();
      this.ctx.decisionTimer = 0;
    }

    // 2. moveDir = (目标格中心 - 当前位置)；接近目标（<0.1 格）时输出 0 避免抖动
    const target = this.ctx.currentTargetCell;
    const tx = target.col + 0.5;
    const ty = target.row + 0.5;
    const dx = tx - player.pos.x;
    const dy = ty - player.pos.y;
    const dist = Math.hypot(dx, dy);
    const moveDir = dist < 0.1 ? { x: 0, y: 0 } : { x: dx, y: dy };

    // 3. 冲刺：每 tick 独立以 dashChancePerSec * dt 的概率触发
    //    近似"每秒期望触发 dashChancePerSec 次"，和连续时间近似成立
    const dashProbThisTick = this.ctx.config.dashChancePerSec * dt;
    const dash = this.rand() < dashProbThisTick;

    return {
      playerId: this.playerId,
      moveDir,
      dash,
      useSkill: false,
    };
  }

  /** 在地图范围内均匀抽一个格子 (col, row)。阶段 9 可替换为"偏好米色格"等策略。 */
  private pickRandomCell(): { col: number; row: number } {
    const col = Math.floor(this.rand() * gameCfg.mapWidth);
    const row = Math.floor(this.rand() * gameCfg.mapHeight);
    return { col, row };
  }
}
