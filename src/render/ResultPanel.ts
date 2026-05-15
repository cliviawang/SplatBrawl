import Phaser from 'phaser';
import type { GameState } from '@/core/types';
import { computeScores } from '@/core/scoring';
import { AssetRegistry } from './AssetRegistry';
import { UIButton } from './UIButton';

/**
 * 结算面板：matchPhase==='ended' 时显示。
 *
 * 阶段 11.2 增强：
 *   - 排名下方追加两个按钮：再来一局 / 返回菜单
 *   - 回调由 MatchScene 注入；点击立即触发 scene 切换
 *
 * - 半透明黑遮罩盖住整个画布
 * - 居中竖排 4 行排名（仅展示 4 个玩家颜色，过滤 neutral）
 * - 第一名字号放大 + 加金色边框
 * - 颜色全部走 AssetRegistry
 * - 一次性创建，通过 setVisible 切换显示
 */
export interface ResultPanelOptions {
  /** 点击"再来一局"回调（沿用当前难度重启 Match） */
  onRestart?: () => void;
  /** 点击"返回菜单"回调 */
  onBackToMenu?: () => void;
}

export class ResultPanel {
  private container: Phaser.GameObjects.Container;
  private overlay: Phaser.GameObjects.Rectangle;
  private titleText: Phaser.GameObjects.Text;
  private rankTexts: Phaser.GameObjects.Text[] = [];
  private rankChips: Phaser.GameObjects.Rectangle[] = [];
  private restartBtn: UIButton | null = null;
  private backBtn: UIButton | null = null;
  private shown = false;

  constructor(private scene: Phaser.Scene, options: ResultPanelOptions = {}) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    const bgColor = AssetRegistry.getColor('ui.bg');
    const textColor = `#${AssetRegistry.getColor('ui.text').toString(16).padStart(6, '0')}`;

    this.overlay = scene.add.rectangle(0, 0, w, h, bgColor, 0.78).setOrigin(0, 0);

    this.titleText = scene.add
      .text(w / 2, h / 2 - 160, 'MATCH OVER', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '36px',
        fontStyle: 'bold',
        color: textColor,
      })
      .setOrigin(0.5, 0.5);

    // 4 行排名占位（先按最大尺寸创建，sync 时改文本）
    for (let i = 0; i < 4; i++) {
      const y = h / 2 - 90 + i * 44;
      const fontSize = i === 0 ? '28px' : '20px';
      const chip = scene.add
        .rectangle(w / 2 - 80, y, 24, 24, 0xffffff)
        .setOrigin(0.5, 0.5)
        .setStrokeStyle(2, 0x000000);
      const text = scene.add
        .text(w / 2 - 60, y, '', {
          fontFamily: '"Segoe UI", Arial, sans-serif',
          fontSize,
          fontStyle: 'bold',
          color: textColor,
        })
        .setOrigin(0, 0.5);
      this.rankChips.push(chip);
      this.rankTexts.push(text);
    }

    // 阶段 11.2：底部并排两个按钮
    const btnW = 160;
    const btnH = 48;
    const btnY = h / 2 + 130;
    const gap = 24;
    this.restartBtn = new UIButton(
      scene,
      w / 2 - btnW / 2 - gap / 2,
      btnY,
      btnW,
      btnH,
      '再来一局',
      { textureKey: 'ui.button.restart', fontSize: 22 },
    ).onClick(() => options.onRestart?.());
    this.backBtn = new UIButton(
      scene,
      w / 2 + btnW / 2 + gap / 2,
      btnY,
      btnW,
      btnH,
      '返回菜单',
      { textureKey: 'ui.button.back', fontSize: 22 },
    ).onClick(() => options.onBackToMenu?.());

    this.container = scene.add.container(0, 0, [
      this.overlay,
      this.titleText,
      ...this.rankChips,
      ...this.rankTexts,
      this.restartBtn.container,
      this.backBtn.container,
    ]);
    this.container.setDepth(10001).setScrollFactor(0).setVisible(false);
  }

  /** 每帧由场景调用，自动根据 phase 决定显隐 */
  sync(state: GameState): void {
    if (state.matchPhase !== 'ended') {
      if (this.shown) {
        this.container.setVisible(false);
        this.shown = false;
      }
      return;
    }
    if (this.shown) return;
    // 第一次切到 ended：填充排名并显示
    const scores = computeScores(state).filter((s) => s.color !== 'neutral');
    for (let i = 0; i < this.rankTexts.length; i++) {
      const s = scores[i];
      if (!s) {
        this.rankTexts[i].setVisible(false);
        this.rankChips[i].setVisible(false);
        continue;
      }
      this.rankChips[i].fillColor = AssetRegistry.getColor(`player.${s.color}`);
      // 第一名格外金色描边
      this.rankChips[i].setStrokeStyle(i === 0 ? 3 : 1, i === 0 ? 0xf1c40f : 0x000000);
      this.rankTexts[i].setText(`${i + 1}.  ${s.color.toUpperCase().padEnd(7)}  ${s.count} 格`);
    }
    this.container.setVisible(true);
    this.shown = true;
  }
}
