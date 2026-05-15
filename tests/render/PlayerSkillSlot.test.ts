import { describe, it, expect } from 'vitest';
import { computeSkillSlotPhase } from '@/render/hudPure';
import type { Player } from '@/core/types';

/**
 * 阶段 11.3：技能槽 displayPhase 推导（纯函数）。
 *
 * 规则（来自 plans 6.5 / 6.8）：
 *   1. skillSlot === null               → 'empty'
 *   2. skillSlot.used === false 且未眩晕 → 'active'
 *   3. skillSlot.used === false 且眩晕中 → 'disabled'
 *   4. skillSlot.used === true（无论是否眩晕） → 'spent'
 *
 * 关键负向断言：spent 态**不**叠加 disabled —— 即使眩晕中，spent 永远是 spent。
 */
function makePlayer(over: Partial<Player> = {}): Player {
  return {
    id: 0,
    color: 'red',
    pos: { x: 0, y: 0 },
    facing: { x: 0, y: 1 },
    collisionInvulnUntilTick: 0,
    slowUntilTick: 0,
    dashState: { phase: 'idle', timer: 0, dashDir: { x: 0, y: 0 } },
    skillSlot: null,
    stunUntilTick: 0,
    speedBoostUntilTick: 0,
    rollerUntilTick: 0,
    ...over,
  };
}

describe('computeSkillSlotPhase', () => {
  it('skillSlot === null → empty', () => {
    const p = makePlayer({ skillSlot: null });
    expect(computeSkillSlotPhase(p, 0)).toBe('empty');
  });

  it('skillSlot.used=false 且未眩晕 → active', () => {
    const p = makePlayer({ skillSlot: { id: 'rocket', used: false }, stunUntilTick: 0 });
    expect(computeSkillSlotPhase(p, 100)).toBe('active');
  });

  it('skillSlot.used=false 且眩晕中 → disabled', () => {
    const p = makePlayer({ skillSlot: { id: 'rocket', used: false }, stunUntilTick: 200 });
    expect(computeSkillSlotPhase(p, 100)).toBe('disabled');
  });

  it('skillSlot.used=true 即使未眩晕 → spent（不是 disabled）', () => {
    const p = makePlayer({ skillSlot: { id: 'rocket', used: true }, stunUntilTick: 0 });
    expect(computeSkillSlotPhase(p, 100)).toBe('spent');
  });

  it('skillSlot.used=true 且眩晕中 → spent（关键负向：不叠加 disabled）', () => {
    const p = makePlayer({ skillSlot: { id: 'rocket', used: true }, stunUntilTick: 200 });
    expect(computeSkillSlotPhase(p, 100)).toBe('spent');
  });

  it('眩晕边界：currentTick === stunUntilTick 视为已解除（state.tick < stunUntilTick）', () => {
    const p = makePlayer({ skillSlot: { id: 'rocket', used: false }, stunUntilTick: 100 });
    expect(computeSkillSlotPhase(p, 100)).toBe('active');
  });
});
