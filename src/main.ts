import Phaser from 'phaser';
import { BootScene } from '@/scenes/BootScene';
import { MenuScene } from '@/scenes/MenuScene';
import { MatchScene } from '@/scenes/MatchScene';

/**
 * 画布尺寸：1024 × 792
 *   - 宽 16 × 64 = 1024（与 mapWidth × tileSize 对齐）
 *   - 高 = TopHUD(80) + 游戏区(10 × 64 = 640) + BottomHUD(72) = 792
 *
 * 阶段 11 把游戏区下沉 80px 给顶部 HUD 让位：
 *   MatchScene 在 create 里设 cameras.main.scrollY = -80，
 *   cell 坐标渲染器（地图 / 玩家 / pickup / 投射物）天然跟随 camera 滚动；
 *   HUD / ResultPanel / DebugHUD 都已 setScrollFactor(0)，绝对坐标不受影响。
 */
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 16 * 64,
  height: 80 + 10 * 64 + 72,
  backgroundColor: '#D2B48C',
  // 首场景为 BootScene；BootScene → 'Menu'（选难度）→ 'Match'（对局，结算后回 Menu）
  scene: [BootScene, MenuScene, MatchScene],
});

// 阶段 12：开发者调参面板。仅当 URL 含 ?dev=1 时挂载，不影响生产路径。
// 用动态 import 而非顶层 import，避免无意中把 DevPanel 代码打进默认产物。
if (new URLSearchParams(window.location.search).has('dev')) {
  void import('@/dev/DevPanel').then(({ DevPanel }) => {
    new DevPanel();
  });
}
