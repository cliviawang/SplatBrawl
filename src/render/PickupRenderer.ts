import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import { chooseSkillIconVisual, SKILL_LETTER } from './skillIconResolver';
import type { GameState, Pickup } from '@/core/types';

/**
 * 道具渲染（阶段 6.2 视觉补丁 + 图标接入补丁）。
 *
 * 设计：
 *   - 状态驱动 sync：按 pickup.id diff 现有 sprite，create on demand / destroy on disappear
 *   - 视觉两条分支（由 chooseSkillIconVisual 决定）：
 *       1) 配置了 skill.<id>.icon 路径 → scene.add.image(textureKey)
 *       2) 未配置 → 圆形白底 + 黑边 + 居中字母（兼容现状）
 *   - 渐进式接图：只改 skills.json 路径即可切换到图标，不动一行代码
 *
 * 注意：渲染层不重排 pickup 顺序，仅按 id 跟踪生命周期，避免一次刷新里多个 pickup
 *       入场时位置抖动。
 */

// 重新导出，向后兼容曾经从此模块取 SKILL_LETTER 的引用
export { SKILL_LETTER };

/** 入场动效（image / fallback 分支共用） */
const ENTER_TWEEN_DURATION_MS = 140;
const ENTER_TWEEN_EASE = 'Back.Out';
/** 图标占格比例（fallback 圆 0.32 半径 ≈ 0.64 直径，图片直径取 0.6 略小一点更清爽） */
const ICON_SIZE_RATIO = 0.6;

interface PickupVisual {
  /** image 分支：单一 sprite；fallback 分支：null */
  image: Phaser.GameObjects.Image | null;
  /** fallback 分支：圆底；image 分支：null */
  bg: Phaser.GameObjects.Arc | null;
  /** fallback 分支：字母；image 分支：null */
  letter: Phaser.GameObjects.Text | null;
}

export class PickupRenderer {
  private scene: Phaser.Scene;
  private items = new Map<string, PickupVisual>();
  private tileSize: number;

  constructor(scene: Phaser.Scene, tileSize = 64) {
    this.scene = scene;
    this.tileSize = tileSize;
  }

  sync(state: GameState): void {
    const seen = new Set<string>();
    for (const pk of state.pickups) {
      seen.add(pk.id);
      let v = this.items.get(pk.id);
      if (!v) {
        v = this.create(pk);
        this.items.set(pk.id, v);
      }
      // 位置每帧也同步（pickup 当前不会移动，但保持简单一致）
      const cx = pk.col * this.tileSize + this.tileSize / 2;
      const cy = pk.row * this.tileSize + this.tileSize / 2;
      if (v.image) {
        v.image.x = cx;
        v.image.y = cy;
      }
      if (v.bg) {
        v.bg.x = cx;
        v.bg.y = cy;
      }
      if (v.letter) {
        v.letter.x = cx;
        v.letter.y = cy;
      }
    }
    // 清理已消失的
    for (const [id, v] of this.items) {
      if (!seen.has(id)) {
        v.image?.destroy();
        v.bg?.destroy();
        v.letter?.destroy();
        this.items.delete(id);
      }
    }
  }

  private create(pk: Pickup): PickupVisual {
    const cx = pk.col * this.tileSize + this.tileSize / 2;
    const cy = pk.row * this.tileSize + this.tileSize / 2;
    const visual = chooseSkillIconVisual(pk.skillId);

    if (visual.kind === 'image') {
      const image = this.scene.add.image(cx, cy, visual.textureKey);
      // 按目标直径 = tileSize * ICON_SIZE_RATIO 等比缩放
      const target = this.tileSize * ICON_SIZE_RATIO;
      const sourceMax = Math.max(image.width, image.height) || target;
      image.setDisplaySize((image.width / sourceMax) * target, (image.height / sourceMax) * target);
      image.setDepth(50);

      // 入场动效：从 0 缩放到 1
      const finalScaleX = image.scaleX;
      const finalScaleY = image.scaleY;
      image.setScale(0);
      this.scene.tweens.add({
        targets: image,
        scaleX: finalScaleX,
        scaleY: finalScaleY,
        duration: ENTER_TWEEN_DURATION_MS,
        ease: ENTER_TWEEN_EASE,
      });

      return { image, bg: null, letter: null };
    }

    // fallback：圆底 + 字母
    const radius = this.tileSize * 0.32;
    const bg = this.scene.add
      .circle(cx, cy, radius, AssetRegistry.getColor('ui.pickupBg'))
      .setStrokeStyle(2, AssetRegistry.getColor('ui.pickupRing'));
    bg.setDepth(50);

    const letter = this.scene.add
      .text(cx, cy, visual.letter, {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: `${Math.round(this.tileSize * 0.42)}px`,
        fontStyle: 'bold',
        color: '#000000',
      })
      .setOrigin(0.5, 0.5);
    letter.setDepth(51);

    bg.setScale(0);
    letter.setScale(0);
    this.scene.tweens.add({
      targets: [bg, letter],
      scale: 1,
      duration: ENTER_TWEEN_DURATION_MS,
      ease: ENTER_TWEEN_EASE,
    });

    return { image: null, bg, letter };
  }
}
