import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import { chooseSkillIconVisual, SKILL_LETTER } from './skillIconResolver';
import type { GameState, Player } from '@/core/types';

/**
 * 玩家技能槽渲染（阶段 6.1 视觉补丁 + 图标接入补丁）。
 *
 * 在每个玩家头顶上方画一个小标识：
 *   - skillSlot=null 时整体隐藏
 *   - 持有时按"图标 / 圆+字母" 二选一渲染（取决于 skill.<id>.icon 是否配置）
 *
 * 视觉两种状态：
 *   - 亮态（slot.used=false）：
 *       fallback 分支：圆底用 player.<color>，alpha 1.0
 *       image 分支   ：清除 tint，alpha 1.0
 *   - 灰态（slot.used=true，已释放但仍可被冲刺抢走）：
 *       fallback 分支：圆底改为 0x666666，alpha 0.6
 *       image 分支   ：tint 0x666666，alpha 0.6
 *
 * 关键约束：技能 id 在玩家持有期间不变，所以渲染对象只在
 *   "skillSlot 从 null → 非 null"或"切换到不同技能"时重建，避免每帧 destroy+create。
 *
 * 不订阅事件——纯 sync(state) 模式，与项目其他渲染器一致。
 */

/** 灰态视觉常量 */
const SLOT_TINT_USED = 0x666666;
const SLOT_ALPHA_ACTIVE = 1.0;
const SLOT_ALPHA_USED = 0.6;
/** 图标占格比例（与 PickupRenderer 0.6 略小，HUD 槽更紧凑） */
const ICON_SIZE_RATIO = 0.5;

interface SlotVisual {
  /** image 分支：sprite；fallback 分支：null */
  image: Phaser.GameObjects.Image | null;
  /** fallback 分支：圆底；image 分支：null */
  bg: Phaser.GameObjects.Arc | null;
  /** fallback 分支：字母；image 分支：null */
  letter: Phaser.GameObjects.Text | null;
  /** 当前使用的 skillId，便于检测是否切换 */
  skillId: string;
}

export class SkillSlotRenderer {
  private scene: Phaser.Scene;
  private slots: Array<SlotVisual | null> = [];
  /** 缓存每个玩家的"原色"，灰态切回时直接还原，避免每帧查 AssetRegistry */
  private activeColors: number[] = [];
  private tileSize: number;

  constructor(scene: Phaser.Scene, state: GameState, tileSize = 64) {
    this.scene = scene;
    this.tileSize = tileSize;
    for (const p of state.players) {
      this.activeColors.push(AssetRegistry.getColor(`player.${p.color}`));
      this.slots.push(null);
    }
  }

  sync(state: GameState): void {
    state.players.forEach((p, i) => {
      if (!p.skillSlot) {
        // 持有变空：销毁视觉
        const v = this.slots[i];
        if (v) {
          v.image?.destroy();
          v.bg?.destroy();
          v.letter?.destroy();
          this.slots[i] = null;
        }
        return;
      }

      // 持有了 / 切换到不同技能 → 重建
      let v = this.slots[i];
      if (!v || v.skillId !== p.skillSlot.id) {
        v?.image?.destroy();
        v?.bg?.destroy();
        v?.letter?.destroy();
        v = this.createSlot(p);
        this.slots[i] = v;
      }

      // 跟随玩家位置
      const cx = p.pos.x * this.tileSize;
      const cy = p.pos.y * this.tileSize - this.tileSize * 0.55;
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

      // 亮/灰态切换
      this.applyState(v, p, i);
    });
  }

  private createSlot(p: Player): SlotVisual {
    if (!p.skillSlot) throw new Error('createSlot 仅应在 skillSlot 非空时调用');
    const radius = this.tileSize * 0.2;
    const visual = chooseSkillIconVisual(p.skillSlot.id);
    const skillId = p.skillSlot.id;

    if (visual.kind === 'image') {
      const image = this.scene.add.image(0, 0, visual.textureKey);
      const target = this.tileSize * ICON_SIZE_RATIO;
      const sourceMax = Math.max(image.width, image.height) || target;
      image.setDisplaySize((image.width / sourceMax) * target, (image.height / sourceMax) * target);
      image.setDepth(120);
      return { image, bg: null, letter: null, skillId };
    }

    const bg = this.scene.add
      .circle(0, 0, radius, this.activeColors[0]) // 颜色稍后 applyState 真实下发
      .setStrokeStyle(2, AssetRegistry.getColor('ui.pickupRing'));
    bg.setDepth(120);

    const letter = this.scene.add
      .text(0, 0, SKILL_LETTER[p.skillSlot.id] ?? '?', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: `${Math.round(this.tileSize * 0.28)}px`,
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);
    letter.setDepth(121);

    return { image: null, bg, letter, skillId };
  }

  private applyState(v: SlotVisual, p: Player, playerIndex: number): void {
    const used = !!p.skillSlot?.used;
    const alpha = used ? SLOT_ALPHA_USED : SLOT_ALPHA_ACTIVE;

    if (v.image) {
      if (used) v.image.setTint(SLOT_TINT_USED);
      else v.image.clearTint();
      v.image.setAlpha(alpha);
      return;
    }

    if (v.bg && v.letter) {
      if (used) v.bg.setFillStyle(SLOT_TINT_USED);
      else v.bg.setFillStyle(this.activeColors[playerIndex]);
      v.bg.setAlpha(alpha);
      v.letter.setAlpha(alpha);
    }
  }
}
