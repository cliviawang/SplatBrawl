import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import gameCfg from '@/config/game.json';
import skillsCfg from '@/config/skills.json';
import type { AreaEffect, BombExplosion, GameState } from '@/core/types';

/**
 * 炸弹视觉（阶段 6.4.3 视觉补丁）。
 *
 * 两个独立 diff：
 *   1) 倒计时阶段 —— 跟踪 state.areaEffects 中 type==='bomb' 的条目
 *      · 在 (centerX+0.5, centerY+0.5) 画一个红色填充圆，半径 ≈ 0.35 * tileSize
 *      · 外圈用 owner 色描边 2px，便于分辨"谁的弹"
 *      · 脉冲：scale 在 0.85 ↔ 1.15 之间 yoyo
 *        - 距引爆 >= 0.5s（tick 差 >= 30）：周期 500ms（缓和提示）
 *        - 距引爆 < 0.5s：周期 150ms（急促警示）
 *      · 当 AreaEffect 从 state 消失（同 tick 被 cleanupAreaEffects 清掉）→ 销毁圆
 *
 *   2) 引爆瞬间 —— 跟踪 state.bombExplosions 新增项
 *      · 在 (centerX+0.5, centerY+0.5) 画一个白色圆，初始 scale 0、alpha 1
 *      · tween 到 scale = (radius*2+1)*0.7、alpha = 0，duration ≈ visualTicks/tickRate * 1000
 *      · 同帧触发 scene.cameras.main.shake(100, 0.005)
 *      · BombExplosion 从 state 移除（cleanupBombExplosions 到期）→ 销毁圆
 *
 * 两个 Map 用各自 id 作 key，互不干扰。
 */

/** fuse 阶段视觉对象：可能是 Arc（无图 fallback）或 Image（配置了 skill.bomb.fuse） */
type FuseTarget = Phaser.GameObjects.Arc | Phaser.GameObjects.Image;
/** explosion 阶段视觉对象：可能是 Arc（无图 fallback）或 Image（配置了 skill.bomb.explosion） */
type ExplosionTarget = Phaser.GameObjects.Arc | Phaser.GameObjects.Image;

interface FuseVisual {
  circle: FuseTarget;
  /** 当前脉冲 tween，频率切换时需要先 stop 再重建 */
  pulse: Phaser.Tweens.Tween;
  /** 当前是否处于"急促"模式，用于避免每帧重建 tween */
  fast: boolean;
}

interface ExplosionVisual {
  circle: ExplosionTarget;
}

/** 进入急促脉冲的剩余 tick 阈值（约 0.5 秒） */
const FAST_PULSE_THRESHOLD = 30;
/** 缓和脉冲周期（毫秒） */
const SLOW_PULSE_MS = 500;
/** 急促脉冲周期（毫秒） */
const FAST_PULSE_MS = 150;

export class BombRenderer {
  private scene: Phaser.Scene;
  private fuses = new Map<string, FuseVisual>();
  private explosions = new Map<string, ExplosionVisual>();
  private tileSize: number;

  constructor(scene: Phaser.Scene, tileSize = 64) {
    this.scene = scene;
    this.tileSize = tileSize;
  }

  sync(state: GameState): void {
    this.syncFuses(state);
    this.syncExplosions(state);
  }

  // ───────── 倒计时圆 ─────────
  private syncFuses(state: GameState): void {
    const seen = new Set<string>();
    for (const ae of state.areaEffects) {
      if (ae.type !== 'bomb') continue;
      seen.add(ae.id);
      let v = this.fuses.get(ae.id);
      if (!v) {
        v = this.createFuse(ae, state);
        this.fuses.set(ae.id, v);
      } else {
        // 频率切换：剩余 tick 进入阈值即升级到急促脉冲（仅切一次）
        const remaining = ae.expireAtTick - state.tick;
        if (!v.fast && remaining < FAST_PULSE_THRESHOLD) {
          v.pulse.stop();
          v.pulse = this.makePulse(v.circle, FAST_PULSE_MS);
          v.fast = true;
        }
      }
    }
    for (const [id, v] of this.fuses) {
      if (!seen.has(id)) {
        v.pulse.stop();
        v.circle.destroy();
        this.fuses.delete(id);
      }
    }
  }

  private createFuse(ae: AreaEffect, state: GameState): FuseVisual {
    const cx = (ae.centerX + 0.5) * this.tileSize;
    const cy = (ae.centerY + 0.5) * this.tileSize;
    const owner = state.players[ae.ownerId];
    const ownerColorKey = owner ? `player.${owner.color}` : 'ui.text';
    const strokeColor = AssetRegistry.getColor(ownerColorKey);

    let circle: FuseTarget;
    if (AssetRegistry.hasTexture('skill.bomb.fuse')) {
      // 有配置图：用炸弹图片，owner 色 tint 区分归属
      const img = this.scene.add
        .image(cx, cy, 'skill.bomb.fuse')
        .setDisplaySize(this.tileSize * 0.7, this.tileSize * 0.7)
        .setTint(strokeColor)
        .setDepth(22);
      circle = img;
    } else {
      // 无图 fallback：原红圆 + owner 色描边
      const fillColor = AssetRegistry.getColor('ui.warning'); // 红
      circle = this.scene.add
        .circle(cx, cy, this.tileSize * 0.35, fillColor, 1)
        .setStrokeStyle(2, strokeColor, 1)
        .setDepth(22); // 高于 tile / shield(20)，低于 player(30+)
    }

    const remaining = ae.expireAtTick - state.tick;
    const fast = remaining < FAST_PULSE_THRESHOLD;
    const pulse = this.makePulse(circle, fast ? FAST_PULSE_MS : SLOW_PULSE_MS);
    return { circle, pulse, fast };
  }

  private makePulse(target: FuseTarget, periodMs: number): Phaser.Tweens.Tween {
    return this.scene.tweens.add({
      targets: target,
      scale: { from: 0.85, to: 1.15 },
      duration: periodMs,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
  }

  // ───────── 引爆冲击波 ─────────
  private syncExplosions(state: GameState): void {
    const seen = new Set<string>();
    for (const ex of state.bombExplosions) {
      seen.add(ex.id);
      if (!this.explosions.has(ex.id)) {
        this.explosions.set(ex.id, this.createExplosion(ex));
        // 引爆瞬间触发 camera shake（仅在新建时调用一次）
        this.scene.cameras.main.shake(100, 0.005);
      }
    }
    for (const [id, v] of this.explosions) {
      if (!seen.has(id)) {
        v.circle.destroy();
        this.explosions.delete(id);
      }
    }
  }

  private createExplosion(ex: BombExplosion): ExplosionVisual {
    const cx = (ex.centerX + 0.5) * this.tileSize;
    const cy = (ex.centerY + 0.5) * this.tileSize;
    const radius = skillsCfg.bomb.radius;
    // 目标覆盖直径 = (radius*2+1) 格的 90%（留点边距视觉更舒服）
    const targetDiameterPx = (radius * 2 + 1) * this.tileSize * 0.9;

    let circle: ExplosionTarget;
    let finalScale: number;
    if (AssetRegistry.hasTexture('skill.bomb.explosion')) {
      // 有配置图：用炸弹图片，setDisplaySize 先把基准尺寸设为 tileSize，再 scale 0→finalScale
      const baseSize = this.tileSize;
      finalScale = targetDiameterPx / baseSize;
      circle = this.scene.add
        .image(cx, cy, 'skill.bomb.explosion')
        .setDisplaySize(baseSize, baseSize)
        .setDepth(35);
    } else {
      // 无图 fallback：原白圆放大消失
      const whiteColor = AssetRegistry.getColor('ui.text'); // #ffffff
      const baseRadius = this.tileSize * 0.5;
      finalScale = (targetDiameterPx * 0.5) / baseRadius;
      circle = this.scene.add
        .circle(cx, cy, baseRadius, whiteColor, 1)
        .setDepth(35); // 高于 player，盖过去
    }
    circle.setScale(0);
    circle.setAlpha(1);

    const totalMs = (skillsCfg.bomb.explosionVisualTicks / gameCfg.tickRate) * 1000;
    this.scene.tweens.add({
      targets: circle,
      scale: finalScale,
      alpha: 0,
      duration: totalMs,
      ease: 'Quad.Out',
    });
    return { circle };
  }
}
