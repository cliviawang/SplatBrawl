import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import { darkenColor } from './colorUtils';

/**
 * 通用按钮组件（阶段 11）。
 *
 * 设计：
 *   - Container 包 [bg, label]，统一 setPosition / setVisible
 *   - bg 默认走 ui.bg 颜色 + Rectangle，hasTexture(textureKey) 时换成 Image
 *   - 文字色走 ui.text；按下 / hover 用 alpha + 微缩放表达
 *   - onClick 注册一次回调，单击触发；按下不松开移出按钮也不触发，符合直觉
 *
 * 资源策略：
 *   - 颜色全部经 AssetRegistry，避免代码内出现 hex 字面量
 *   - 当 ui.button.<key> 路径填好时，自动切到 image，无需改源码
 *
 * 测试策略：
 *   - 类本身重 Phaser 依赖，按项目约定不写单测
 *   - 纯函数 darkenColor 抽到 colorUtils 单独测试
 */

export interface UIButtonOptions {
  /** 背景颜色 key，默认 'ui.bg' */
  bgColorKey?: string;
  /** 文字颜色 key，默认 'ui.text' */
  textColorKey?: string;
  /** 文字字号，默认 22px */
  fontSize?: number;
  /** 是否加粗，默认 true */
  bold?: boolean;
  /** 资源 textureKey（如 'ui.button.start'），如有图片则替代 Rectangle */
  textureKey?: string;
  /** 描边颜色 key，默认 'ui.text'；不需要描边传 null */
  strokeColorKey?: string | null;
  /** 描边宽度，默认 2 */
  strokeWidth?: number;
}

export class UIButton {
  readonly container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private bgColor: number;
  private bgColorPressed: number;
  private clickHandler: (() => void) | null = null;
  private isDown = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    options: UIButtonOptions = {},
  ) {
    const bgColorKey = options.bgColorKey ?? 'ui.bg';
    const textColorKey = options.textColorKey ?? 'ui.text';
    const fontSize = options.fontSize ?? 22;
    const bold = options.bold ?? true;
    const strokeColorKey = options.strokeColorKey === undefined ? 'ui.text' : options.strokeColorKey;
    const strokeWidth = options.strokeWidth ?? 2;

    this.bgColor = AssetRegistry.getColor(bgColorKey);
    this.bgColorPressed = darkenColor(this.bgColor, 0.6);

    if (options.textureKey && AssetRegistry.hasTexture(options.textureKey)) {
      this.bg = scene.add.image(0, 0, options.textureKey).setDisplaySize(width, height);
    } else {
      const rect = scene.add.rectangle(0, 0, width, height, this.bgColor, 1);
      if (strokeColorKey) {
        rect.setStrokeStyle(strokeWidth, AssetRegistry.getColor(strokeColorKey));
      }
      this.bg = rect;
    }

    const textHex = `#${AssetRegistry.getColor(textColorKey).toString(16).padStart(6, '0')}`;
    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color: textHex,
      })
      .setOrigin(0.5, 0.5);

    this.container = scene.add.container(x, y, [this.bg, this.label]);
    this.container.setSize(width, height);
    this.container.setScrollFactor(0);
    // 关键：scrollFactor 不沿父子继承，必须给所有子物体单独设置。
    // 否则在 MatchScene（cameras.main.scrollY=-80）下：
    //   - bg 视觉位置因父 container 的 scrollFactor=0 不偏移
    //   - 但 bg 命中判定按自己的 scrollFactor=1（默认）走，命中区会被相机滚动整体下移 80px
    //   - 现象就是"按钮下方一段空白区才能点中"
    this.bg.setScrollFactor(0);
    this.label.setScrollFactor(0);

    // 直接给 bg 挂 interactive：bg 自身就是 width × height 的矩形且 origin=0.5，
    // hit area 严格等于 bg 视觉矩形，不会因 container 的 size/scale 产生错位。
    // 之前给 container 设 hitArea 在右半边失效，根因是 container 把 label 子物体的
    // 文字宽度计入 bounds 后，input 命中判定与我们手算的本地矩形对不齐。
    this.bg.setInteractive({ useHandCursor: true });

    this.bg.on('pointerover', () => {
      this.container.setScale(1.04);
    });
    this.bg.on('pointerout', () => {
      this.container.setScale(1);
      // 注意：不重置 isDown，否则按下后鼠标稍移出就再也触发不了点击
      this.applyBgColor(this.bgColor);
    });
    this.bg.on('pointerdown', () => {
      this.isDown = true;
      this.applyBgColor(this.bgColorPressed);
    });
    this.bg.on('pointerup', () => {
      if (this.isDown && this.clickHandler) {
        this.clickHandler();
      }
      this.isDown = false;
      this.applyBgColor(this.bgColor);
    });
    // 抬起时鼠标已经在按钮外：仍然取消按下态，但不触发 click（符合常见 UI 直觉）
    this.bg.on('pointerupoutside', () => {
      this.isDown = false;
      this.applyBgColor(this.bgColor);
    });
  }

  /** 注册点击回调（同一按钮覆盖式） */
  onClick(fn: () => void): this {
    this.clickHandler = fn;
    return this;
  }

  /** 设置文本（用于按钮内容随状态变化） */
  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  /** 设置位置（中心点） */
  setPosition(x: number, y: number): this {
    this.container.setPosition(x, y);
    return this;
  }

  /** 显隐 */
  setVisible(visible: boolean): this {
    this.container.setVisible(visible);
    return this;
  }

  /** 渲染层级 */
  setDepth(depth: number): this {
    this.container.setDepth(depth);
    return this;
  }

  /** 销毁所有内部对象 */
  destroy(): void {
    this.container.destroy();
  }

  /** 仅 Rectangle 分支生效；Image 分支 fillColor 无效，跳过 */
  private applyBgColor(color: number): void {
    if (this.bg instanceof Phaser.GameObjects.Rectangle) {
      this.bg.fillColor = color;
    }
  }
}
