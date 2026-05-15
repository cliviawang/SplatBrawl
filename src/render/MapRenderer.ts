import Phaser from 'phaser';
import { AssetRegistry } from './AssetRegistry';
import type { GameState } from '@/core/types';

/**
 * 地图渲染：把 GameState.tiles 投影成 Phaser Rectangle 网格。
 * 颜色一律走 AssetRegistry.getColor('tile.<color>')，渲染层不出现 hex 字面量。
 *
 * 后续接入图片：当 tiles.json 里某色填了路径，可在此切到 add.image。当前仅几何图元。
 */
export class MapRenderer {
  private rects: Phaser.GameObjects.Rectangle[][] = [];

  constructor(scene: Phaser.Scene, state: GameState, public tileSize = 64) {
    for (let r = 0; r < state.tiles.length; r++) {
      this.rects[r] = [];
      for (let c = 0; c < state.tiles[0].length; c++) {
        const color = AssetRegistry.getColor(`tile.${state.tiles[r][c].color}`);
        const rect = scene.add.rectangle(
          c * tileSize + tileSize / 2,
          r * tileSize + tileSize / 2,
          tileSize - 2,
          tileSize - 2,
          color
        );
        this.rects[r][c] = rect;
      }
    }
  }

  /** 每帧同步：根据 state.tiles 更新每格 fillColor */
  sync(state: GameState): void {
    for (let r = 0; r < state.tiles.length; r++) {
      for (let c = 0; c < state.tiles[0].length; c++) {
        this.rects[r][c].fillColor = AssetRegistry.getColor(`tile.${state.tiles[r][c].color}`);
      }
    }
  }
}
