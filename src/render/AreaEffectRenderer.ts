import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import skillsCfg from '@/config/skills.json';
import type { AreaEffect, GameState } from '@/core/types';

/**
 * 区域效果渲染（阶段 6.3.3 / 6.4.1 视觉补丁）。
 *
 * 当前支持 type='shield'：
 *   - 配置了 skill.shield.bubble 图：用 image + ownerColor tint，覆盖 (radius*2+1) 个格
 *   - 未配置：半透明浅蓝矩形 + 深蓝描边（fallback）
 * 后续 6.4.3 bomb：橙色脉冲 + 倒计时（在 type 分支内补即可）。
 *
 * AreaEffect 上没有 radius 字段，按 type 从 skills.json 反查。
 */

interface AreaVisual {
  fill: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
}

/** 按 AreaEffect.type 取覆盖半径（格） */
function radiusOf(type: AreaEffect['type']): number {
  if (type === 'shield') return skillsCfg.shield.radius;
  if (type === 'bomb') return skillsCfg.bomb.radius;
  return 1;
}

/** 按 AreaEffect.type 取对应的纹理 key（用于 hasTexture / image 加载） */
function textureKeyOf(type: AreaEffect['type']): string {
  if (type === 'shield') return 'skill.shield.bubble';
  return ''; // bomb 由 BombRenderer 负责
}

export class AreaEffectRenderer {
  private scene: Phaser.Scene;
  private items = new Map<string, AreaVisual>();
  private tileSize: number;

  constructor(scene: Phaser.Scene, tileSize = 64) {
    this.scene = scene;
    this.tileSize = tileSize;
  }

  sync(state: GameState): void {
    const seen = new Set<string>();
    for (const ae of state.areaEffects) {
      // bomb 的视觉（倒计时红圆 + 引爆白圆）由 BombRenderer 单独负责，本渲染器跳过
      if (ae.type === 'bomb') continue;
      seen.add(ae.id);
      let v = this.items.get(ae.id);
      if (!v) {
        v = this.create(ae);
        this.items.set(ae.id, v);
      }
    }
    for (const [id, v] of this.items) {
      if (!seen.has(id)) {
        v.fill.destroy();
        this.items.delete(id);
      }
    }
  }

  private create(ae: AreaEffect): AreaVisual {
    const radius = radiusOf(ae.type);
    const size = (radius * 2 + 1) * this.tileSize;
    // centerX/centerY 是整数格坐标，矩形中心 = (cx + 0.5) * tileSize
    const cx = (ae.centerX + 0.5) * this.tileSize;
    const cy = (ae.centerY + 0.5) * this.tileSize;

    const textureKey = textureKeyOf(ae.type);
    let fill: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;

    if (textureKey && AssetRegistry.hasTexture(textureKey)) {
      // 有配置图：image 覆盖整片区域
      fill = this.scene.add
        .image(cx, cy, textureKey)
        .setDisplaySize(size, size)
        .setDepth(20);
    } else {
      // 无图 fallback：原矩形 + 描边
      let fillColor: number;
      let strokeColor: number;
      if (ae.type === 'shield') {
        fillColor = AssetRegistry.getColor('ui.shieldFill');
        strokeColor = AssetRegistry.getColor('ui.shieldRing');
      } else {
        // 其他类型先用 warning 色占位
        fillColor = AssetRegistry.getColor('ui.warning');
        strokeColor = AssetRegistry.getColor('ui.pickupRing');
      }
      fill = this.scene.add
        .rectangle(cx, cy, size, size, fillColor, 0.28)
        .setStrokeStyle(3, strokeColor, 0.85)
        .setDepth(20); // 高于 tile，低于 pickup/玩家
    }

    // 入场轻微脉冲
    fill.setScale(0.7);
    this.scene.tweens.add({
      targets: fill,
      scale: 1,
      duration: 180,
      ease: 'Back.Out',
    });

    return { fill };
  }
}
