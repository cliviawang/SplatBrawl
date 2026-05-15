import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import type { GameState, StarFlash } from '@/core/types';

/**
 * 星星清色视觉反馈（阶段 6.3.x 视觉补丁）。
 *
 * 星星技能逻辑层 onCast 已瞬间将选中格清为 neutral。本渲染层订阅 state.starFlashes：
 *   - 每出现一条新 StarFlash → 在被清格上叠加白色闪烁矩形 + 短促 tween（白闪 → 透明）
 *   - 闪烁总时长 ≈ visualTicks * (1/tickRate) 秒，与 cleanupStarFlashes 到期时刻同步
 *   - 闪烁结束（或 flash 从 state 消失）销毁矩形
 *
 * 实现要点：
 *   - 用 flash.id 做去重 key，diff 模式增删（与 AreaEffectRenderer / PickupRenderer 同款）
 *   - 一个 StarFlash 多格 → 一个 StarFlash 持有一组 Rectangle，统一销毁
 *   - 矩形 depth 设为 25：高于 tile（默认 0），低于 player（30+）
 */

interface FlashVisual {
  /** 该 flash 下的所有覆盖矩形 */
  rects: Phaser.GameObjects.Rectangle[];
}

export class StarFlashRenderer {
  private scene: Phaser.Scene;
  private items = new Map<string, FlashVisual>();
  private tileSize: number;

  constructor(scene: Phaser.Scene, tileSize = 64) {
    this.scene = scene;
    this.tileSize = tileSize;
  }

  sync(state: GameState): void {
    const seen = new Set<string>();
    for (const f of state.starFlashes) {
      seen.add(f.id);
      if (!this.items.has(f.id)) {
        this.items.set(f.id, this.create(f));
      }
    }
    // 已从 state 移除（到期或清空）→ 销毁残留矩形
    for (const [id, v] of this.items) {
      if (!seen.has(id)) {
        for (const r of v.rects) r.destroy();
        this.items.delete(id);
      }
    }
  }

  private create(f: StarFlash): FlashVisual {
    const whiteColor = AssetRegistry.getColor('ui.text'); // #ffffff
    // 总持续时间（毫秒）= visualTicks 个 tick；与逻辑层到期时刻一致
    const totalMs = (skillsCfg.star.visualTicks / gameCfg.tickRate) * 1000;
    // 单次"亮-暗"周期（毫秒）：用 2 次脉冲，让闪烁更有节奏
    const pulseMs = totalMs / 2;

    const rects: Phaser.GameObjects.Rectangle[] = [];
    for (const t of f.tiles) {
      const cx = (t.x + 0.5) * this.tileSize;
      const cy = (t.y + 0.5) * this.tileSize;
      const rect = this.scene.add
        .rectangle(cx, cy, this.tileSize - 2, this.tileSize - 2, whiteColor, 1)
        .setDepth(25);
      // 白闪 → 透明，yoyo 一次再淡出（共 ~2 个亮暗节拍）
      this.scene.tweens.add({
        targets: rect,
        alpha: 0,
        duration: pulseMs,
        ease: 'Quad.InOut',
        yoyo: true,
        repeat: 0,
        onComplete: () => {
          // 第二轮：直接淡出
          this.scene.tweens.add({
            targets: rect,
            alpha: 0,
            duration: pulseMs,
            ease: 'Quad.Out',
          });
        },
      });
      rects.push(rect);
    }
    return { rects };
  }
}
