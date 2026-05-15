import { describe, it, expect } from 'vitest';
import { runHeadless } from '@/sim/HeadlessRunner';

/**
 * 阶段 10 验收：Hard AI 在对抗 3 个 Medium AI 的 50 局中应胜过至少 32 局（≥65%）。
 *
 * 注意：
 *   - 单局约 30~60ms（Hard 每帧多算一次 computeScores + scoreBestMoveTarget）；
 *     50 局约 2~4 秒，timeout 设 30s 留余量
 *   - 若胜率不达 32：先查 Hard 实现 / 配置，再考虑调 hard.json
 *     （laggingAggressionFactor / leadingDefenseFactor / decisionInterval / dashChancePerSec）
 */
describe('AI battle (Hard vs 3×Medium)', () => {
  it(
    '困难 AI 应在 50 局中至少胜过中等 AI 32 局',
    () => {
      let wins = 0;
      let played = 0;
      for (let i = 0; i < 50; i++) {
        const result = runHeadless({
          players: ['hard', 'medium', 'medium', 'medium'],
          seed: i,
        });
        played++;
        if (result.winner === 0) wins++;
      }
      if (wins < 32) {
        // eslint-disable-next-line no-console
        console.log(`Hard vs 3×Medium: ${wins}/${played} wins`);
      }
      expect(wins).toBeGreaterThanOrEqual(32);
    },
    30000,
  );
});
