import Phaser from 'phaser';
import type { PlayerIntent } from '@/core/types';

/**
 * 键盘输入采集器：每帧 poll 出一份 PlayerIntent 投递给 GameLoop。
 *
 * 离散按键 latch（修复"按好几下空格才冲"问题）：
 *   背景：渲染帧率 > tick 频率（高刷屏 144 fps，tick 60 Hz），且 GameLoop 用
 *         accumulator 累积时间，可能某个渲染帧内跑 0 个 tick。若 dash 用
 *         Phaser.JustDown 在 poll 中"一次性消费"，那么"按下 → JustDown=true"
 *         的渲染帧若恰好对应"0 tick"，下一个渲染帧 JustDown=false，按键信号
 *         就丢了。
 *
 *   方案：SPACE / J 改用事件监听 + 内部 latch（pendingDash / pendingUseSkill）。
 *         keydown-* 触发即置 true，poll() 把 latch 反映到 intent 但不清空。
 *         由 MatchScene 在 GameLoop 实际跑过 tick 后调 consume() 清空，
 *         保证按下事件至少被一个 tick 消费过才丢弃。
 *
 *   联机场景：latch 模型同样适用——网络层把"按下事件"转发即可，
 *             只是 consume 时机由服务端 tick 节奏决定。
 */
export class KeyboardInput {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private pendingDash = false;
  private pendingUseSkill = false;

  constructor(scene: Phaser.Scene, public playerId: number) {
    const kb = scene.input.keyboard;
    if (!kb) {
      throw new Error('KeyboardInput: scene.input.keyboard 不可用');
    }
    this.keys = {
      W: kb.addKey('W'),
      A: kb.addKey('A'),
      S: kb.addKey('S'),
      D: kb.addKey('D'),
      SPACE: kb.addKey('SPACE'),
      J: kb.addKey('J'),
    };
    // 离散按键事件：触发即 latch
    this.keys.SPACE.on('down', () => {
      this.pendingDash = true;
    });
    this.keys.J.on('down', () => {
      this.pendingUseSkill = true;
    });
    // 鼠标左键也作为技能释放触发源（与 J 共享同一 latch）
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.pendingUseSkill = true;
      }
    });
  }

  /**
   * 采集一份 PlayerIntent。
   * 注意：离散按键的 latch 不在此处清零，需在 GameLoop 实际跑过 tick 后调 consume()。
   */
  poll(): PlayerIntent {
    let dx = 0;
    let dy = 0;
    if (this.keys.A.isDown) dx -= 1;
    if (this.keys.D.isDown) dx += 1;
    if (this.keys.W.isDown) dy -= 1;
    if (this.keys.S.isDown) dy += 1;
    return {
      playerId: this.playerId,
      moveDir: { x: dx, y: dy },
      dash: this.pendingDash,
      useSkill: this.pendingUseSkill,
    };
  }

  /**
   * 清空离散按键 latch。应在 GameLoop 至少跑过一个 tick（intent 已被消费）后调用。
   * 若该渲染帧 GameLoop 跑了 0 个 tick，不应调用本方法，否则会丢失按键信号。
   */
  consume(): void {
    this.pendingDash = false;
    this.pendingUseSkill = false;
  }
}
