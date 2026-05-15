import { describe, it, expect } from 'vitest';
import { runHeadless } from '@/sim/HeadlessRunner';

/**
 * 阶段 9 验收：Medium AI 在对抗 3 个 Easy AI 的 50 局中应胜过至少 35 局（≥70%）。
 *
 * 注意：
 *   - 单局约 20~40ms；50 局约 1~3 秒，可在默认 timeout（5s）内完成
 *   - 若实测胜率不达 35：先查 Medium 实现是否有 bug，再考虑调参
 *     （decisionInterval 调小 / dashChancePerSec 调高 / awarenessRadius 调大）
 */
describe('AI battle (Medium vs 3×Easy)', () => {
  it(
    '中等 AI 应在 50 局中至少胜过简单 AI 35 局',
    () => {
      let wins = 0;
      let played = 0;
      for (let i = 0; i < 50; i++) {
        const result = runHeadless({
          players: ['medium', 'easy', 'easy', 'easy'],
          seed: i,
        });
        played++;
        if (result.winner === 0) wins++;
      }
      // 调试输出（仅在断言失败时显示）：
      if (wins < 35) {
        // eslint-disable-next-line no-console
        console.log(`Medium vs 3×Easy: ${wins}/${played} wins`);
      }
      expect(wins).toBeGreaterThanOrEqual(35);
    },
    20000,
  );
});
