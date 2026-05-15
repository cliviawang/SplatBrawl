import Phaser from 'phaser';
import type { GameState } from '@/core/types';
import playerCfg from '@/config/player.json';
import { AssetRegistry } from './AssetRegistry';
import { computeDashDisplay, type DashDisplayKind } from './hudPure';

/**
 * 冲刺指示器（阶段 11.3）。BottomHUD 左下槽位。
 *
 * 视觉：
 *   - 半径 22 的圆环：底层灰圈（ringTrack），上层按 progress 画扇形（玩家色）
 *   - 圆心写 "DASH" 字样：ready 时玩家色，cooldown / dashing 时灰
 *   - dashing 期间圆环整体 alpha=1.0 + scale 1.1 闪烁（pulse）
 *
 * 数据：
 *   - 从 GameState.players[playerIndex].dashState 推导
 *   - cdMaxSec 取自 player.json `dashCooldownSec`
 *
 * 容器：BottomHUD 把它当子节点，整体 setScrollFactor(0)，无需自身设定。
 */

const RING_RADIUS = 22;
const RING_THICKNESS = 5;

export class DashIndicator {
  private container: Phaser.GameObjects.Container;
  private bgRing: Phaser.GameObjects.Graphics;
  private fillArc: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private playerColorHex: number;
  private trackColor: number;
  private dimColor: number;
  private cdMaxSec: number;
  private playerIndex: number;
  private lastKind: DashDisplayKind | null = null;
  private lastProgress = -1;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, playerIndex: number, state: GameState, x = 0, y = 0) {
    this.playerIndex = playerIndex;
    const player = state.players[playerIndex];
    this.playerColorHex = AssetRegistry.getColor(`player.${player.color}`);
    this.trackColor = AssetRegistry.getColor('ui.ringTrack');
    this.dimColor = AssetRegistry.getColor('ui.dim');
    this.cdMaxSec = playerCfg.dashCooldownSec;

    this.bgRing = scene.add.graphics();
    this.bgRing.lineStyle(RING_THICKNESS, this.trackColor, 1);
    this.bgRing.strokeCircle(0, 0, RING_RADIUS);

    this.fillArc = scene.add.graphics();

    this.label = scene.add
      .text(0, 0, 'DASH', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: hexStr(this.playerColorHex),
      })
      .setOrigin(0.5, 0.5);

    this.container = scene.add.container(x, y, [this.bgRing, this.fillArc, this.label]);
  }

  /** 给 BottomHUD 用，挂到 BottomHUD 容器下，再交由 BottomHUD 统一 setScrollFactor */
  getRoot(): Phaser.GameObjects.Container {
    return this.container;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  sync(state: GameState): void {
    const player = state.players[this.playerIndex];
    if (!player) return;
    const display = computeDashDisplay(player, this.cdMaxSec);

    // 重画扇形：仅当 progress 变化（避免每帧重建 Graphics）
    if (Math.abs(display.progress - this.lastProgress) > 0.01 || display.kind !== this.lastKind) {
      this.fillArc.clear();
      // ready / dashing：满圆，玩家色
      // cooldown：从 12 点钟方向起按 progress 画扇形，进度 1.0 = 整圆，0 = 空
      const color = display.kind === 'cooldown' ? this.playerColorHex : this.playerColorHex;
      this.fillArc.lineStyle(RING_THICKNESS, color, 1);
      if (display.progress >= 0.999) {
        this.fillArc.strokeCircle(0, 0, RING_RADIUS);
      } else if (display.progress > 0) {
        const start = -Math.PI / 2;
        const end = start + Math.PI * 2 * display.progress;
        this.fillArc.beginPath();
        this.fillArc.arc(0, 0, RING_RADIUS, start, end, false);
        this.fillArc.strokePath();
      }
      this.lastProgress = display.progress;
    }

    // kind 变化时更新文字色 + pulse
    if (display.kind !== this.lastKind) {
      const labelColor = display.kind === 'ready' || display.kind === 'dashing'
        ? this.playerColorHex
        : this.dimColor;
      this.label.setColor(hexStr(labelColor));

      if (display.kind === 'dashing') {
        this.startPulse();
      } else {
        this.stopPulse();
      }
      this.lastKind = display.kind;
    }
  }

  private startPulse(): void {
    if (this.pulseTween) return;
    this.pulseTween = this.container.scene.tweens.add({
      targets: this.container,
      scale: { from: 1, to: 1.15 },
      duration: 100,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.container.setScale(1);
        this.pulseTween = null;
      },
    });
  }

  private stopPulse(): void {
    if (this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
    }
    this.container.setScale(1);
  }
}

function hexStr(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
