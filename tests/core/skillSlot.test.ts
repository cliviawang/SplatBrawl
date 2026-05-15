import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/core/GameState';

/**
 * 任务 6.1：Player 增加 skillSlot 字段
 *
 * 初始状态下所有玩家 skillSlot 应为 null（未持有任何技能）。
 */

describe('Player.skillSlot', () => {
  it('初始 skillSlot 为 null', () => {
    const state = createInitialState();
    for (const p of state.players) {
      expect(p.skillSlot).toBeNull();
    }
  });
});
