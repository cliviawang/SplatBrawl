import Phaser from 'phaser';
import gameCfg from '@/config/game.json';
import playerCfg from '@/config/player.json';
import type { GameState, Player, Vec2 } from '@/core/types';
import { computeSpeed } from '@/render/computeSpeed';

/**
 * 调试 HUD：左上角浮层，常驻渲染层。
 *
 * 特性：
 *   - F1 切换显示/隐藏（默认隐藏）
 *   - 内容：FPS、tick、剩余时间、玩家 0 的 pos / speed / facing / 所在格颜色
 *   - 速度按 tick 节奏反推：仅当 state.tick 变化时计算 (cur-prev) / (Δtick * 1/tickRate)
 *     —— 高刷显示器下，渲染帧率 > tick 频率，多数渲染帧 pos 不变；按真实帧 dt 反推会得 0。
 *   - 仅在文本变化时调 setText，避免 Phaser 无谓重排
 *
 * 不订阅事件、只读 GameState；后续可按 section 扩展（技能 CD、AI 决策等）。
 */
export class DebugHUD {
  private text: Phaser.GameObjects.Text;
  private prevPos: Vec2 | null = null;
  private lastTick = -1;
  private lastSpeed = 0;
  private lastContent = '';
  private readonly tickDt = 1 / gameCfg.tickRate;
  /** 可选：读取当前调试控制台强制的技能 id（仅用于显示） */
  private getForceSkillId: (() => string | null) | null = null;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(8, 36, '', {
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: '12px',
        color: '#00ff88',
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { left: 6, right: 6, top: 4, bottom: 4 },
      })
      .setScrollFactor(0)
      .setDepth(10000)
      .setVisible(false);

    scene.input.keyboard?.on('keydown-F1', () => {
      this.text.setVisible(!this.text.visible);
    });
  }

  /** 注入"当前强制技能"读取函数，HUD 据此追加一行显示 */
  setForceSkillProvider(fn: () => string | null): void {
    this.getForceSkillId = fn;
  }

  /** 每帧调用：根据 state 更新 HUD 文本（speed 仅在 tick 推进时重算） */
  update(state: GameState, _deltaSec: number, fps: number): void {
    if (!this.text.visible) return;

    const p0 = state.players[0];
    if (!p0) return;

    if (state.tick !== this.lastTick) {
      const tickDelta = this.lastTick < 0 ? 1 : state.tick - this.lastTick;
      const dt = tickDelta * this.tickDt;
      this.lastSpeed = computeSpeed(this.prevPos, p0.pos, dt);
      this.prevPos = { x: p0.pos.x, y: p0.pos.y };
      this.lastTick = state.tick;
    }

    const cx = Math.floor(p0.pos.x);
    const cy = Math.floor(p0.pos.y);
    const tile = state.tiles[cy]?.[cx];
    const tileColor = tile ? tile.color : '-';

    const lines = [
      `FPS  ${fps.toFixed(0).padStart(3)}   tick ${state.tick}   time ${state.matchTimeRemaining.toFixed(1)}s`,
      `--- player 0 (${p0.color}) ---`,
      `pos    ${p0.pos.x.toFixed(2)}, ${p0.pos.y.toFixed(2)}`,
      `speed  ${this.lastSpeed.toFixed(2)} / s`,
      `facing ${p0.facing.x.toFixed(2)}, ${p0.facing.y.toFixed(2)}`,
      `tile   ${tileColor}`,
      `dash   ${formatDash(p0)}`,
      `[F1] toggle  [\`] console`,
    ];
    const forceId = this.getForceSkillId?.() ?? null;
    if (forceId) {
      lines.push(`FORCE  ${forceId}`);
    }
    const content = lines.join('\n');
    if (content !== this.lastContent) {
      this.text.setText(content);
      this.lastContent = content;
    }
  }
}

/**
 * 把玩家的冲刺状态格式化成单行文本。
 *
 * 注意 dashState.timer 字段在不同 phase 下含义不同（见 dash.ts）：
 *   - dashing : 已推进的 tick 数（整数），换算成秒 = timer * (1/tickRate)
 *   - cooldown: 剩余冷却秒（浮点）
 *   - idle    : 0
 */
function formatDash(p: Player): string {
  const ds = p.dashState;
  if (ds.phase === 'idle') {
    return 'READY';
  }
  if (ds.phase === 'dashing') {
    const elapsed = ds.timer / gameCfg.tickRate;
    const dur = playerCfg.dashDurationSec;
    return `DASH ${elapsed.toFixed(2)}/${dur.toFixed(2)}s  dir ${ds.dashDir.x.toFixed(2)},${ds.dashDir.y.toFixed(2)}`;
  }
  // cooldown
  const remain = Math.max(0, ds.timer);
  const cd = playerCfg.dashCooldownSec;
  return `CD   ${remain.toFixed(2)}/${cd.toFixed(2)}s`;
}
