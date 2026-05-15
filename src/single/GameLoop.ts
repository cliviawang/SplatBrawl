import gameCfg from '@/config/game.json';
import { EventBus } from '@/core/EventBus';
import { createInitialState } from '@/core/GameState';
import { applyCollisions } from '@/core/collision';
import { applyDashTick } from '@/core/dash';
import { applyMovement } from '@/core/movement';
import { applyPickupCollection, tryRefreshPickups } from '@/core/skills/pickups';
import { applySkillUse } from '@/core/skills/applySkillUse';
import { applyProjectiles } from '@/core/skills/rocket';
import { cleanupAreaEffects } from '@/core/skills/areaEffects';
import { cleanupLaserBeams } from '@/core/skills/laser';
import { cleanupStarFlashes } from '@/core/skills/star';
import { applyBombExplosions, cleanupBombExplosions } from '@/core/skills/bomb';
import { _resetRegistry, registerAllSkills } from '@/core/skills';
import type { GameState, PlayerIntent } from '@/core/types';

/**
 * 单机版 Tick 循环：固定步长 dt = 1/tickRate（默认 1/60 秒）。
 *
 * - update(realDt) 由 Phaser Scene 每帧调用，使用 accumulator 把不稳定的真实帧时间
 *   切成多个固定步长的 tick，保证逻辑层确定性
 * - setIntent() 由输入层 / AI 层投递；同一 tick 内同一 playerId 的最后一份 Intent 生效
 * - 联机版本会用 src/server/GameLoop.ts 替换本文件，逻辑层与配置完全复用
 *
 * tick 内的子系统执行顺序（关键 —— 改动会破坏交互一致性）：
 *   1. applyDashTick：状态机推进（idle/dashing/cooldown），dashing 玩家位移由它接管
 *   2. applyMovement：仅对非 dashing 玩家生效，处理常规移动 + 染色
 *   3. applyCollisions：玩家两两重叠分离（dashing 玩家暂仍参与，阶段 8 改造）
 */
export class GameLoop {
  state: GameState;
  bus = new EventBus();

  private intents = new Map<number, PlayerIntent>();
  private dt = 1 / gameCfg.tickRate;
  private accumulator = 0;

  constructor() {
    this.state = createInitialState();
    // 注册当前版本所有技能（幂等：先 reset 再 register，便于 GameLoop 在测试中多次实例化）
    _resetRegistry();
    registerAllSkills();
  }

  /** 投递（覆盖式更新）一份玩家指令，下一 tick 起生效 */
  setIntent(intent: PlayerIntent): void {
    this.intents.set(intent.playerId, intent);
  }

  /**
   * Phaser update 回调：传入真实帧间隔（秒）。
   * 返回本次实际推进的 tick 数（可能为 0），调用方据此决定是否消费离散输入 latch。
   */
  update(realDt: number): number {
    this.accumulator += realDt;
    // 防止 tab 切回时累积过大导致死循环
    const maxSteps = 5;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < maxSteps) {
      this.tick();
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps >= maxSteps) {
      this.accumulator = 0;
    }
    return steps;
  }

  private tick(): void {
    // ended 阶段冻结所有玩法子系统，仅自增 tick 并广播事件，
    // 让结算面板等订阅者继续工作。
    if (this.state.matchPhase === 'ended') {
      this.state.tick++;
      this.bus.emit('tick', this.state);
      return;
    }

    // 1. 冲刺状态机：dashing 玩家此处完成位移
    applyDashTick(this.state, this.intents, this.dt);

    // 2. 常规移动：跳过 dashing 玩家
    for (const intent of this.intents.values()) {
      const p = this.state.players[intent.playerId];
      if (!p || p.dashState.phase === 'dashing') continue;
      applyMovement(this.state, intent, this.dt);
    }

    // 3. 技能释放（阶段 6.3+）：在 movement 之后、collision 之前
    //    —— 子弹按"释放当帧的玩家位置"产生，且当帧不会与施法者立即自命中
    applySkillUse(this.state, this.intents);

    // 4. 投射物推进（阶段 6.3.1）
    applyProjectiles(this.state, this.dt);

    // 4b. 炸弹引爆（阶段 6.4.3）：本 tick 引爆已到期的 bomb，染色 + 推视觉记录
    applyBombExplosions(this.state);

    // 5. 碰撞分离
    applyCollisions(this.state);

    // 6. 道具刷新 + 自动拾取（阶段 6.2）
    tryRefreshPickups(this.state, { rng: Math.random });
    applyPickupCollection(this.state);

    // 7. 区域效果到期清理（阶段 6.3.3+）
    cleanupAreaEffects(this.state);
    // 7b. 激光视觉记录到期清理（阶段 6.3.4，纯渲染数据）
    cleanupLaserBeams(this.state);
    // 7c. 星星视觉记录到期清理（阶段 6.3.x，纯渲染数据）
    cleanupStarFlashes(this.state);
    // 7d. 炸弹爆炸视觉记录到期清理（阶段 6.4.3，纯渲染数据）
    cleanupBombExplosions(this.state);

    // 8. 计时：每 tick 减少 dt 秒；归零时夹到 0 并切到 ended
    this.state.matchTimeRemaining -= this.dt;
    if (this.state.matchTimeRemaining <= 0) {
      this.state.matchTimeRemaining = 0;
      this.state.matchPhase = 'ended';
      this.bus.emit('match-ended', this.state);
    }

    this.state.tick++;
    this.bus.emit('tick', this.state);
  }
}
