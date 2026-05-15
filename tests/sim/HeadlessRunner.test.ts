import { describe, it, expect } from 'vitest';
import { runHeadless } from '@/sim/HeadlessRunner';

describe('HeadlessRunner', () => {
  it('返回结果包含 winner / scores / 完整跑完 60 秒', () => {
    const result = runHeadless({ players: ['easy', 'easy', 'easy', 'easy'], seed: 1 });
    expect(result.scores.length).toBeGreaterThan(0);
    // 胜者 playerId 在 [0,3] 或 null（极端平局）
    if (result.winner !== null) {
      expect(result.winner).toBeGreaterThanOrEqual(0);
      expect(result.winner).toBeLessThan(4);
    }
    expect(result.matchPhase).toBe('ended');
  });

  it('同种子 + 同玩家配置 → 结果完全一致（确定性）', () => {
    const a = runHeadless({ players: ['easy', 'easy', 'easy', 'easy'], seed: 7 });
    const b = runHeadless({ players: ['easy', 'easy', 'easy', 'easy'], seed: 7 });
    expect(a.winner).toBe(b.winner);
    expect(a.scores).toEqual(b.scores);
  });

  it('不同种子可以产生不同结果（随机性证据）', () => {
    const winners = new Set<number | null>();
    for (let s = 0; s < 20; s++) {
      const r = runHeadless({ players: ['easy', 'easy', 'easy', 'easy'], seed: s });
      winners.add(r.winner);
    }
    // 4 个 Easy 同水平互打，应能出 2+ 个不同胜者
    expect(winners.size).toBeGreaterThanOrEqual(2);
  });

  it('支持 medium 与 easy 混合', () => {
    const r = runHeadless({ players: ['medium', 'easy', 'easy', 'easy'], seed: 0 });
    expect(r.matchPhase).toBe('ended');
  });
});
