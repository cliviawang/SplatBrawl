import gameCfg from '@/config/game.json';
import spawnsCfg from '@/config/spawns.json';
import type { Color, GameState, Player, Tile } from './types';

/**
 * 出生点配置项：从 spawns.json 读取。
 * row/col 为格索引（整数），玩家会在该格中心位置出生（pos = col + 0.5, row + 0.5）。
 */
interface SpawnConfig {
  playerId: number;
  color: Color;
  row: number;
  col: number;
}

/**
 * 创建初始 GameState：
 *   - W×H 米色格子地图（由 game.json 决定）
 *   - 玩家数量与出生点由 spawns.json 决定（联机时仅替换此配置即可）
 *   - 玩家 pos 为对应格的中心连续坐标 (col + 0.5, row + 0.5)
 *   - 出生点格子立即染为玩家颜色
 */
export function createInitialState(): GameState {
  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;

  const tiles: Tile[][] = Array.from({ length: H }, () =>
    Array.from(
      { length: W },
      () =>
        ({
          color: 'neutral' as Color,
          lastPaintedTick: -1,
          shieldUntilTick: 0,
        }) as Tile
    )
  );

  const spawns = spawnsCfg.spawns as SpawnConfig[];

  const players: Player[] = spawns.map((s) => ({
    id: s.playerId,
    color: s.color,
    pos: { x: s.col + 0.5, y: s.row + 0.5 },
    facing: { x: 0, y: 1 },
    collisionInvulnUntilTick: 0,
    slowUntilTick: 0,
    dashState: { phase: 'idle', timer: 0, dashDir: { x: 0, y: 0 } },
    skillSlot: null,
    stunUntilTick: 0,
    speedBoostUntilTick: 0,
    rollerUntilTick: 0,
  }));

  // 出生点立即染色
  for (const p of players) {
    const cy = Math.floor(p.pos.y);
    const cx = Math.floor(p.pos.x);
    tiles[cy][cx].color = p.color;
    tiles[cy][cx].lastPaintedTick = 0;
  }

  return {
    tick: 0,
    tiles,
    players,
    matchTimeRemaining: gameCfg.matchDurationSec,
    matchPhase: 'playing',
    pickups: [],
    areaEffects: [],
    projectiles: [],
    laserBeams: [],
    starFlashes: [],
    bombExplosions: [],
    lastRefreshSec: 0,
  };
}
