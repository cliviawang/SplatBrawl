import Phaser from 'phaser';
import type { GameState } from '@/core/types';
import { computeScores } from '@/core/scoring';
import { AssetRegistry } from './AssetRegistry';

/**
 * 顶部 HUD（阶段 11.3 重做）。
 *
 * 占用屏幕顶部 80px：
 *   - 左侧大字倒计时：剩余 ≤ 10s 切到 ui.warning（红）
 *   - 右侧 4 色比分：按 computeScores 已降序结果绘制（高分靠左/排前），
 *     每个条目 = chip(8x18 圆角矩形) + 玩家色块 + 数字
 *
 * 全部使用 setScrollFactor(0) 保持绝对位置；
 * MatchScene 已通过 cameras.main.scrollY=-80 把游戏区下沉。
 *
 * 资源：颜色全部走 AssetRegistry。
 */

/** TopHUD 高度（px），与 main.ts 画布高度一致：80 + 640 + 72 = 792 */
export const TOP_HUD_HEIGHT = 80;

/** 倒计时进入"警示色"的剩余秒数阈值（含此值） */
export const TIME_WARNING_THRESHOLD_SEC = 10;

/**
 * 把秒数格式化为 mm:ss，向上取整避免显示 0:00 时却仍在 playing。
 * 0  -> "0:00"
 * 59.6 -> "1:00"
 * 30   -> "0:30"
 */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 倒计时是否进入警示状态（≤ 阈值视为警示） */
export function isTimeWarning(seconds: number): boolean {
  return Math.max(0, seconds) <= TIME_WARNING_THRESHOLD_SEC;
}

/**
 * 把 0xRRGGBB number 转成 "#rrggbb" 字符串（Phaser Text color 字段需要）。
 */
function hexStr(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

interface ScoreNode {
  /** 容器 container（position 作为整组锚点） */
  container: Phaser.GameObjects.Container;
  /** 玩家色块 */
  chip: Phaser.GameObjects.Rectangle;
  /** 名次（"1" / "2" / "3" / "4"） */
  rankText: Phaser.GameObjects.Text;
  /** 分数数字 */
  scoreText: Phaser.GameObjects.Text;
  /** 当前绑定的玩家颜色（用于变化时更新 chip 色） */
  boundColor: string | null;
  /** 当前显示的分数（避免重复 setText） */
  lastScore: number;
}

export class HUD {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private timerText: Phaser.GameObjects.Text;
  private scoreNodes: ScoreNode[] = [];
  private lastTimerStr = '';
  private lastTimerWarning: boolean | null = null;
  /** 缓存上一帧排序签名，未变化则不刷新分数节点 */
  private lastScoreSig = '';

  /** 文本颜色：常态用 ui.text，警示用 ui.warning */
  private textColorNormal: number;
  private textColorWarning: number;

  constructor(scene: Phaser.Scene) {
    const w = scene.scale.width;
    const bgColor = AssetRegistry.getColor('ui.bg');
    this.textColorNormal = AssetRegistry.getColor('ui.text');
    this.textColorWarning = AssetRegistry.getColor('ui.warning');

    // 背景：从屏幕顶到 80 行，半透明黑底
    this.bg = scene.add
      .rectangle(0, 0, w, TOP_HUD_HEIGHT, bgColor, 0.78)
      .setOrigin(0, 0);

    // 倒计时：左侧 16px 内边距，垂直居中于 80px
    this.timerText = scene.add
      .text(20, TOP_HUD_HEIGHT / 2, '1:00', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: hexStr(this.textColorNormal),
      })
      .setOrigin(0, 0.5);

    // 4 个比分节点：从右往左排（最高分最靠右贴边显示反而过于刺眼，
    // 改为最高分靠中心、最低分贴右边？—— 还是按传统做"最高分排第一在最左/最右"的视觉惯例）。
    // 选定：最高分靠左（更容易首先注意到第 1 名），4 个 chip 从屏幕中心右侧 sortedX 起向右延展。
    // 实现：右对齐，最高分在最右；视觉上"最强的玩家"出现在分数条最显眼的位置。
    const startX = w - 16;
    for (let i = 0; i < 4; i++) {
      const node = this.createScoreNode(scene);
      // 占位定位：每个节点宽约 110px（数字 60 + chip 18 + rank 18 + 间隔），最右侧节点右贴 startX
      node.container.x = startX - i * 110;
      node.container.y = TOP_HUD_HEIGHT / 2;
      this.scoreNodes.push(node);
    }

    this.container = scene.add.container(0, 0, [
      this.bg,
      this.timerText,
      ...this.scoreNodes.map((n) => n.container),
    ]);
    this.container.setDepth(9000).setScrollFactor(0);
  }

  /** 单个比分节点的 Phaser 元素组 */
  private createScoreNode(scene: Phaser.Scene): ScoreNode {
    // 节点结构：[rank# | chip | scoreText]，整体右对齐到 container 原点（0,0）
    const scoreText = scene.add
      .text(0, 0, '0', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: hexStr(this.textColorNormal),
      })
      .setOrigin(1, 0.5);
    // 数字之前 8px 间隔
    const chip = scene.add
      .rectangle(-(scoreText.width + 8 + 18), 0, 18, 28, 0xffffff)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x000000);
    // 名次：在 chip 之前，再加 6px 间隔
    const rankText = scene.add
      .text(0, 0, '#1', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '14px',
        color: hexStr(this.textColorNormal),
      })
      .setOrigin(1, 0.5);
    // rankText 位置稍后由 layout() 重算
    const container = scene.add.container(0, 0, [rankText, chip, scoreText]);
    container.setSize(110, TOP_HUD_HEIGHT);
    container.setScrollFactor(0);

    return {
      container,
      chip,
      rankText,
      scoreText,
      boundColor: null,
      lastScore: -1,
    };
  }

  /** 重排单个节点内子元素位置（数字宽度变化时重新对齐） */
  private layoutScoreNode(node: ScoreNode): void {
    // scoreText 右对齐到 0；chip 紧挨 scoreText 左侧；rankText 在 chip 之前
    const chipW = 18;
    const gap = 8;
    const rankGap = 6;
    node.scoreText.setX(0);
    const chipX = -node.scoreText.width - gap - chipW;
    node.chip.setX(chipX);
    node.rankText.setX(chipX - rankGap);
  }

  /** 每帧由场景调用，根据当前 state 刷新文本 */
  sync(state: GameState): void {
    // 1) 倒计时
    const timerStr = formatTime(state.matchTimeRemaining);
    if (timerStr !== this.lastTimerStr) {
      this.timerText.setText(timerStr);
      this.lastTimerStr = timerStr;
    }
    const warning = isTimeWarning(state.matchTimeRemaining);
    if (warning !== this.lastTimerWarning) {
      this.timerText.setColor(hexStr(warning ? this.textColorWarning : this.textColorNormal));
      this.lastTimerWarning = warning;
    }

    // 2) 比分（computeScores 已按 count 降序，平局按最近一次染色 tick 排序）
    const allScores = computeScores(state).filter((s) => s.color !== 'neutral');
    const sig = allScores.map((s) => `${s.color}:${s.count}`).join('|');
    if (sig === this.lastScoreSig) return;
    this.lastScoreSig = sig;

    // 把降序结果映射到 4 个固定节点：节点 0 = 第一名（最右）...节点 3 = 第四名（最左）
    for (let i = 0; i < this.scoreNodes.length; i++) {
      const node = this.scoreNodes[i];
      const s = allScores[i];
      if (!s) {
        node.container.setVisible(false);
        continue;
      }
      node.container.setVisible(true);
      // chip 颜色
      if (node.boundColor !== s.color) {
        node.chip.fillColor = AssetRegistry.getColor(`player.${s.color}`);
        node.boundColor = s.color;
      }
      // 名次：1..4
      node.rankText.setText(`#${i + 1}`);
      // 分数
      if (node.lastScore !== s.count) {
        node.scoreText.setText(String(s.count));
        node.lastScore = s.count;
      }
      // 重新对齐子元素
      this.layoutScoreNode(node);
    }
  }
}
