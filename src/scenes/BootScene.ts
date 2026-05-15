import Phaser from 'phaser';
import { AssetRegistry } from '@/render/AssetRegistry';

/**
 * 启动引导场景：
 *   - 统一扫描 AssetRegistry 的图片清单，对所有非空路径调用 this.load.image
 *   - 当前清单全为空字符串时 preload 秒过，直接切到 Match
 *   - 后续把 JSON 里路径改成真实图片，本场景无需任何改动自动加载
 *
 * 为什么独立出 BootScene：
 *   - 把资源加载从 MatchScene 解耦，MatchScene 只负责对局本身
 *   - 后续阶段 11 增加 MenuScene 时，同样可在 Boot 里预加载 UI 资源，只启动一次
 *   - 某个资源 404 时仅打 warn（渲染层有 hasTexture fallback），绝不阻塞流程
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // 404 只警告，不 throw，交给 AssetRegistry/渲染层走 fallback
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[BootScene] 资源加载失败 key=${file.key} path=${file.src}`);
    });

    for (const key of AssetRegistry.listAllTextureKeys()) {
      if (AssetRegistry.hasTexture(key)) {
        this.load.image(key, AssetRegistry.getTexturePath(key));
      }
    }
  }

  create(): void {
    // 阶段 11：先进主菜单选难度，再由 MenuScene 启动 Match
    this.scene.start('Menu');
  }
}
