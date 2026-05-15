import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import type { GameState, Projectile } from '@/core/types';

/**
 * 投射物渲染（阶段 6.3.1 视觉补丁）。
 *
 * 简单状态驱动：按 projectile.id diff，新增即生 sprite，消失即销毁。
 * 火箭：
 *   - 配置了 skill.<type>.projectile 图：用 image + ownerColor tint
 *   - 未配置：小圆 + ownerColor 描边（fallback）
 */

interface ProjectileVisual {
  sprite: Phaser.GameObjects.Arc | Phaser.GameObjects.Image;
}

export class ProjectileRenderer {
  private scene: Phaser.Scene;
  private items = new Map<string, ProjectileVisual>();
  private tileSize: number;

  constructor(scene: Phaser.Scene, tileSize = 64) {
    this.scene = scene;
    this.tileSize = tileSize;
  }

  sync(state: GameState): void {
    const seen = new Set<string>();
    for (const pr of state.projectiles) {
      seen.add(pr.id);
      let v = this.items.get(pr.id);
      if (!v) {
        v = this.create(pr);
        this.items.set(pr.id, v);
      }
      v.sprite.x = pr.pos.x * this.tileSize;
      v.sprite.y = pr.pos.y * this.tileSize;
      // 朝向 -> 旋转
      v.sprite.rotation = Math.atan2(pr.velocity.y, pr.velocity.x);
    }
    for (const [id, v] of this.items) {
      if (!seen.has(id)) {
        v.sprite.destroy();
        this.items.delete(id);
      }
    }
  }

  private create(pr: Projectile): ProjectileVisual {
    const x = pr.pos.x * this.tileSize;
    const y = pr.pos.y * this.tileSize;
    const ownerColor = AssetRegistry.getColor(`player.${pr.ownerColor}`);
    const textureKey = `skill.${pr.type}.projectile`;

    let sprite: Phaser.GameObjects.Arc | Phaser.GameObjects.Image;
    if (AssetRegistry.hasTexture(textureKey)) {
      sprite = this.scene.add
        .image(x, y, textureKey)
        .setDisplaySize(this.tileSize * 0.5, this.tileSize * 0.5)
        .setTint(ownerColor);
    } else {
      sprite = this.scene.add
        .circle(x, y, this.tileSize * 0.18, ownerColor)
        .setStrokeStyle(2, AssetRegistry.getColor('ui.pickupRing'));
    }
    sprite.setDepth(80); // 高于玩家
    return { sprite };
  }
}
