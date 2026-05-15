import Phaser from 'phaser';
import { AssetRegistry } from '@/render/AssetRegistry';
import { UIButton } from '@/render/UIButton';

/**
 * 主菜单场景（阶段 11.1）。
 *
 * 内容：
 *   - 标题 "SPLATBRAWL"
 *   - 副标题 "选择难度"
 *   - 三个难度按钮：简单 / 中等 / 困难（点击 → scene.start('Match', { difficulty }))
 *
 * 数据流：
 *   - 难度直接传给 MatchScene.init(data)，由 MatchScene 决定如何映射 AI 配置
 *   - 不在此处构造任何 GameLoop / AIController，保持职责单一
 *
 * 资源：
 *   - 颜色经 AssetRegistry；按钮纹理 ui.button.{easy,medium,hard} 留空，
 *     UIButton 自动 fallback 到 Rectangle，方便后续接图
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyEntry {
  id: Difficulty;
  label: string;
  /** 按钮辅助说明，画在按钮下方小字 */
  hint: string;
  /** 资源 key（路径填好后自动接图） */
  textureKey: string;
}

/** 难度按钮配置：顺序即从上到下显示顺序 */
export const DIFFICULTY_ENTRIES: readonly DifficultyEntry[] = [
  { id: 'easy', label: '简单', hint: '随机走位 + 拾到就放', textureKey: 'ui.button.easy' },
  { id: 'medium', label: '中等', hint: '会找近格 / 反应一般', textureKey: 'ui.button.medium' },
  { id: 'hard', label: '困难', hint: '抢技能 / 高侵略', textureKey: 'ui.button.hard' },
] as const;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // 半透明深底（让画布背景色不直接贴在按钮后面）
    const bgColor = AssetRegistry.getColor('ui.bg');
    this.add.rectangle(0, 0, w, h, bgColor, 0.55).setOrigin(0, 0);

    const textHex = `#${AssetRegistry.getColor('ui.text').toString(16).padStart(6, '0')}`;

    // 标题
    this.add
      .text(w / 2, h * 0.18, 'SPLATBRAWL', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: textHex,
      })
      .setOrigin(0.5, 0.5);

    // 副标题
    this.add
      .text(w / 2, h * 0.32, '选择难度', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '24px',
        color: textHex,
      })
      .setOrigin(0.5, 0.5);

    // 三个难度按钮纵向排列
    const btnW = 320;
    const btnH = 60;
    const gap = 24;
    const startY = h * 0.46;
    DIFFICULTY_ENTRIES.forEach((entry, i) => {
      const y = startY + i * (btnH + gap + 14); // +14 给小字预留
      const btn = new UIButton(this, w / 2, y, btnW, btnH, entry.label, {
        textureKey: entry.textureKey,
        fontSize: 28,
      });
      btn.onClick(() => this.startMatch(entry.id));
      // 按钮下方小字提示
      this.add
        .text(w / 2, y + btnH / 2 + 12, entry.hint, {
          fontFamily: '"Segoe UI", Arial, sans-serif',
          fontSize: '14px',
          color: textHex,
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.7);
    });

    // 底部版本提示
    this.add
      .text(w / 2, h - 16, 'SplatBrawl Demo · 单机版 · 60s/局', {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: '12px',
        color: textHex,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.5);
  }

  private startMatch(difficulty: Difficulty): void {
    this.scene.start('Match', { difficulty });
  }
}
