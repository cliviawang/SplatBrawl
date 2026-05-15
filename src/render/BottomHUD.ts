import Phaser from 'phaser';
import type { GameState } from '@/core/types';
import { DashIndicator } from './DashIndicator';
import { PlayerSkillSlot } from './PlayerSkillSlot';

/**
 * 底部 HUD 容器（阶段 11.3）。
 *
 * 占用屏幕底部 72px：
 *   - 左侧 (40, h-36)：DashIndicator —— 玩家自身冲刺 CD
 *   - 右侧 (w-80, h-36)：PlayerSkillSlot —— 玩家自身技能槽
 *
 * 容器整体 setScrollFactor(0) 保持绝对位置；
 * 子组件位置在容器内部相对原点 (0,0) 摆放，BottomHUD 容器原点设在屏幕左上 (0,0)
 * 让子组件直接用屏幕绝对坐标即可。
 *
 * MatchScene 在 create 里实例化并每帧调用 sync。
 */

export const BOTTOM_HUD_HEIGHT = 72;

export class BottomHUD {
  private container: Phaser.GameObjects.Container;
  private dash: DashIndicator;
  private skill: PlayerSkillSlot;

  constructor(scene: Phaser.Scene, playerIndex: number, state: GameState) {
    const w = scene.scale.width;
    const h = scene.scale.height;
    const cy = h - BOTTOM_HUD_HEIGHT / 2; // 底部 HUD 中线

    this.dash = new DashIndicator(scene, playerIndex, state, 40, cy);
    this.skill = new PlayerSkillSlot(scene, playerIndex, state, w - 80, cy, 'SPACE');

    // 把两个子组件的根挂到 BottomHUD 容器下，统一 depth + scrollFactor
    this.container = scene.add.container(0, 0, [this.dash.getRoot(), this.skill.getRoot()]);
    this.container.setDepth(9000).setScrollFactor(0);
  }

  sync(state: GameState): void {
    this.dash.sync(state);
    this.skill.sync(state);
  }
}
