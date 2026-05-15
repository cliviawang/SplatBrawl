import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/core/GameState';
import spawnsCfg from '@/config/spawns.json';

describe('GameState', () => {
  it('应初始化 16×10 米色格子', () => {
    const s = createInitialState();
    expect(s.tiles.length).toBe(10);
    expect(s.tiles[0].length).toBe(16);
    // 取一个非出生点格子断言米色
    expect(s.tiles[0][0].color).toBe('neutral');
  });

  it('玩家数量和出生点应来自 spawns.json，且出生格被染色', () => {
    const s = createInitialState();
    expect(s.players.length).toBe(spawnsCfg.spawns.length);
    for (const spawn of spawnsCfg.spawns) {
      // 该 spawn 配置下，对应格被染为对应颜色
      expect(s.tiles[spawn.row][spawn.col].color).toBe(spawn.color);
      // 玩家 pos 落在该格中心
      const player = s.players.find((p) => p.id === spawn.playerId);
      expect(player).toBeDefined();
      expect(player!.pos.x).toBe(spawn.col + 0.5);
      expect(player!.pos.y).toBe(spawn.row + 0.5);
      expect(player!.color).toBe(spawn.color);
    }
  });

  it('初始 tick 为 0，matchTimeRemaining 等于配置时长', () => {
    const s = createInitialState();
    expect(s.tick).toBe(0);
    expect(s.matchTimeRemaining).toBe(60);
  });
});
