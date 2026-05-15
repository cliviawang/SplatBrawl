import Phaser from 'phaser';
import type { GameState } from '@/core/types';
import type { SkillId } from '@/core/skills/types';
import { AssetRegistry } from './AssetRegistry';
import { chooseSkillIconVisual } from './skillIconResolver';
import { computeSkillSlotPhase, type SkillSlotPhase } from './hudPure';

/**
 * 玩家自身技能槽（阶段 11.3）。BottomHUD 右下槽位。
 *
 * 与头顶 SkillSlotRenderer 区别：这是"我自己手里那把"，体积更大、状态语义更丰富，
 * 提供四相 + tween 切换；头顶那个仅给"看别人持有什么"用。
 *
 * 三态 + 一个眩晕叠加层：
 *   - empty    半透明灰框，无图标，按键提示淡灰
 *   - active   玩家色边框 + 图标 + 缓 pulse + 按键提示醒目
 *   - disabled active 之上叠红色蒙版（仅 used=false 且眩晕中）
 *   - spent    灰 tint + 边框深灰 + alpha 0.5 + 隐藏按键提示，**不**叠 disabled
 *
 * 数据：computeSkillSlotPhase（纯函数，已 hudPure 单测覆盖）。
 */

// 视觉常量：尺寸（像素）
const SLOT_W = 44;
const SLOT_H = 44;
const ICON_FONT_SIZE = 26;
/** image 模式图标显示尺寸（约 70% 槽宽，留边框可见） */
const ICON_IMAGE_SIZE = 30;
const KEY_HINT_FONT_SIZE = 14;
const KEY_HINT_OFFSET_X = -32;

// alpha 常量
const EMPTY_ALPHA = 0.3;
const SPENT_ALPHA = 0.5;
const ACTIVE_ALPHA = 1.0;

/** spent 态用的灰 tint（仅 image 模式生效） */
const SPENT_TINT = 0x666666;

export class PlayerSkillSlot {
  private container: Phaser.GameObjects.Container;
  /** 边框背景（圆角矩形 fallback：用 Rectangle） */
  private bg: Phaser.GameObjects.Rectangle;
  /** 技能图标：有图走 Image，无图走 Text 字母 fallback；技能切换时重建 */
  private icon: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  private iconKind: 'image' | 'fallback';
  /** 按键提示（"SPACE"） */
  private keyHint: Phaser.GameObjects.Text;
  /** 禁用蒙版（红色，仅 disabled 态可见） */
  private disabledOverlay: Phaser.GameObjects.Rectangle;

  private playerColorHex: number;
  private dimColor: number;
  private disabledColor: number;
  private bg2Color: number;

  private playerIndex: number;
  private lastPhase: SkillSlotPhase | null = null;
  private lastSkillId: SkillId | null = null;
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private overlayTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, playerIndex: number, state: GameState, x = 0, y = 0, keyLabel = 'SPACE') {
    this.playerIndex = playerIndex;
    const player = state.players[playerIndex];
    this.playerColorHex = AssetRegistry.getColor(`player.${player.color}`);
    this.dimColor = AssetRegistry.getColor('ui.dim');
    this.disabledColor = AssetRegistry.getColor('ui.disabled');
    this.bg2Color = AssetRegistry.getColor('ui.bg2');

    // 背景：bg2 填充 + 玩家色描边（active 时）；其他态在 sync 时切换
    this.bg = scene.add
      .rectangle(0, 0, SLOT_W, SLOT_H, this.bg2Color, 1)
      .setStrokeStyle(2, this.playerColorHex);

    // 技能图标：初始为空 Text fallback；sync 时根据 skillSlot 重建
    this.icon = createFallbackText(scene, '');
    this.iconKind = 'fallback';

    // 按键提示在槽左侧
    this.keyHint = scene.add
      .text(KEY_HINT_OFFSET_X, 0, keyLabel, {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: `${KEY_HINT_FONT_SIZE}px`,
        fontStyle: 'bold',
        color: hexStr(AssetRegistry.getColor('ui.text')),
      })
      .setOrigin(1, 0.5);

    // 禁用蒙版：红色 alpha 0.4 覆盖整个 bg；初始隐藏
    this.disabledOverlay = scene.add
      .rectangle(0, 0, SLOT_W, SLOT_H, this.disabledColor, 0.4)
      .setVisible(false);

    this.container = scene.add.container(x, y, [
      this.bg,
      this.icon,
      this.disabledOverlay,
      this.keyHint,
    ]);
  }

  getRoot(): Phaser.GameObjects.Container {
    return this.container;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  sync(state: GameState): void {
    const player = state.players[this.playerIndex];
    if (!player) return;
    const phase = computeSkillSlotPhase(player, state.tick);

    // 技能 id 变化时重建图标（image ↔ fallback 切换走这里）
    const currentSkillId: SkillId | null = player.skillSlot ? player.skillSlot.id : null;
    if (currentSkillId !== this.lastSkillId) {
      this.rebuildIcon(currentSkillId);
      this.lastSkillId = currentSkillId;
      // 强制重新应用相位，让新图标拿到正确的 alpha/tint
      this.lastPhase = null;
    }

    if (phase !== this.lastPhase) {
      this.applyPhase(phase, this.lastPhase);
      this.lastPhase = phase;
    }
  }

  /**
   * 按 skillId 重建图标对象：null → 空 Text；有图 → Image；无图 → 字母 Text。
   * 销毁旧对象，新对象插入到 disabledOverlay 之前（与原顺序一致）。
   */
  private rebuildIcon(skillId: SkillId | null): void {
    const scene = this.container.scene;
    this.container.remove(this.icon, true); // true = destroyChild

    if (skillId === null) {
      this.icon = createFallbackText(scene, '');
      this.iconKind = 'fallback';
    } else {
      const visual = chooseSkillIconVisual(skillId);
      if (visual.kind === 'image') {
        const img = scene.add.image(0, 0, visual.textureKey).setOrigin(0.5, 0.5);
        const scale = ICON_IMAGE_SIZE / Math.max(img.width, img.height);
        img.setScale(scale);
        this.icon = img;
        this.iconKind = 'image';
      } else {
        this.icon = createFallbackText(scene, visual.letter);
        this.iconKind = 'fallback';
      }
    }
    // 维持原来的子节点顺序：bg, icon, disabledOverlay, keyHint
    // disabledOverlay 已经在容器里，把 icon 插到它之前
    const overlayIdx = this.container.getIndex(this.disabledOverlay);
    this.container.addAt(this.icon, overlayIdx);
  }

  /**
   * 应用相位变化，处理样式 + tween。
   * 不重复应用相同 phase（由调用方 diff 保证）。
   */
  private applyPhase(phase: SkillSlotPhase, prev: SkillSlotPhase | null): void {
    switch (phase) {
      case 'empty':
        this.bg.setStrokeStyle(2, this.dimColor);
        this.bg.setAlpha(EMPTY_ALPHA);
        this.icon.setAlpha(EMPTY_ALPHA);
        this.applyIconNeutralTint();
        this.keyHint.setVisible(false);
        this.fadeOverlay(false);
        this.stopPulse();
        if (prev === 'active' || prev === 'disabled' || prev === 'spent') {
          this.fadeOut();
        }
        break;
      case 'active':
        this.bg.setStrokeStyle(2, this.playerColorHex);
        this.bg.setAlpha(ACTIVE_ALPHA);
        this.icon.setAlpha(ACTIVE_ALPHA);
        this.applyIconNeutralTint();
        this.keyHint.setVisible(true);
        this.fadeOverlay(false);
        this.startPulse();
        if (prev === 'empty') this.popIn();
        break;
      case 'disabled':
        this.bg.setStrokeStyle(2, this.playerColorHex);
        this.bg.setAlpha(ACTIVE_ALPHA);
        this.icon.setAlpha(ACTIVE_ALPHA);
        this.applyIconNeutralTint();
        this.keyHint.setVisible(true);
        this.fadeOverlay(true);
        this.stopPulse();
        break;
      case 'spent':
        this.bg.setStrokeStyle(2, this.dimColor);
        this.bg.setAlpha(SPENT_ALPHA);
        this.icon.setAlpha(SPENT_ALPHA);
        this.applyIconSpentTint();
        this.keyHint.setVisible(false);
        this.fadeOverlay(false); // 关键：spent 不叠加 disabled 蒙版
        this.stopPulse();
        break;
    }
  }

  /** 非 spent 态：image 清 tint，text 恢复默认色 */
  private applyIconNeutralTint(): void {
    if (this.iconKind === 'image') {
      (this.icon as Phaser.GameObjects.Image).clearTint();
    } else {
      (this.icon as Phaser.GameObjects.Text).setColor(hexStr(AssetRegistry.getColor('ui.text')));
    }
  }

  /** spent 态：image 套灰 tint，text 改 dim 色 */
  private applyIconSpentTint(): void {
    if (this.iconKind === 'image') {
      (this.icon as Phaser.GameObjects.Image).setTint(SPENT_TINT);
    } else {
      (this.icon as Phaser.GameObjects.Text).setColor(hexStr(this.dimColor));
    }
  }

  private startPulse(): void {
    if (this.pulseTween) return;
    this.pulseTween = this.container.scene.tweens.add({
      targets: this.bg,
      scale: { from: 1, to: 1.04 },
      duration: 750,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private stopPulse(): void {
    if (this.pulseTween) {
      this.pulseTween.stop();
      this.pulseTween = null;
    }
    this.bg.setScale(1);
  }

  private popIn(): void {
    this.container.setScale(0.5);
    this.container.scene.tweens.add({
      targets: this.container,
      scale: 1,
      duration: 200,
      ease: 'Back.Out',
    });
  }

  private fadeOut(): void {
    // 暂不主动 fade —— 数据驱动直接转 empty 时会瞬切到半透明
    // 留口子给后续做"被抢走"特效
  }

  private fadeOverlay(visible: boolean): void {
    if (this.overlayTween) {
      this.overlayTween.stop();
      this.overlayTween = null;
    }
    if (visible) {
      this.disabledOverlay.setVisible(true);
      this.disabledOverlay.setAlpha(0);
      this.overlayTween = this.container.scene.tweens.add({
        targets: this.disabledOverlay,
        alpha: 0.4,
        duration: 100,
      });
    } else if (this.disabledOverlay.visible) {
      this.overlayTween = this.container.scene.tweens.add({
        targets: this.disabledOverlay,
        alpha: 0,
        duration: 100,
        onComplete: () => this.disabledOverlay.setVisible(false),
      });
    }
  }
}

function hexStr(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function createFallbackText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, text, {
      fontFamily: '"Segoe UI", Arial, sans-serif',
      fontSize: `${ICON_FONT_SIZE}px`,
      fontStyle: 'bold',
      color: hexStr(AssetRegistry.getColor('ui.text')),
    })
    .setOrigin(0.5, 0.5);
}
