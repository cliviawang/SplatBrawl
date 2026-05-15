import { describe, it, expect } from 'vitest';
import { computeDashDisplay } from '@/render/hudPure';
import type { Player } from '@/core/types';

/**
 * 阶段 11.3：冲刺指示器 displayState 推导（纯函数）。
 *
 * 规则：
 *   - dashState.phase === 'idle'    → { kind: 'ready', progress: 1 }
 *   - dashState.phase === 'dashing' → { kind: 'dashing', progress: 1 }（高亮分支，进度满）
 *   - dashState.phase === 'cooldown'→ { kind: 'cooldown', progress: 1 - timer/cdMaxSec }
 *
 * progress ∈ [0,1]，0 = 完全冷却中，1 = 满格可用。
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

describe('computeDashDisplay', () => {
  it('idle → ready, progress=1', () => {
    const p = makePlayer({ dashState: { phase: 'idle', timer: 0, dashDir: { x: 0, y: 0 } } });
    const d = computeDashDisplay(p, 5);
    expect(d.kind).toBe('ready');
    expect(d.progress).toBe(1);
  });

  it('dashing → dashing, progress=1（高亮分支）', () => {
    const p = makePlayer({ dashState: { phase: 'dashing', timer: 0.1, dashDir: { x: 1, y: 0 } } });
    const d = computeDashDisplay(p, 5);
    expect(d.kind).toBe('dashing');
    expect(d.progress).toBe(1);
  });

  it('cooldown 刚开始：timer ≈ cdMaxSec → progress ≈ 0', () => {
    const p = makePlayer({ dashState: { phase: 'cooldown', timer: 5, dashDir: { x: 0, y: 0 } } });
    const d = computeDashDisplay(p, 5);
    expect(d.kind).toBe('cooldown');
    expect(d.progress).toBe(0);
  });

  it('cooldown 进度过半：timer = 2.5, cdMax = 5 → progress = 0.5', () => {
    const p = makePlayer({ dashState: { phase: 'cooldown', timer: 2.5, dashDir: { x: 0, y: 0 } } });
    const d = computeDashDisplay(p, 5);
    expect(d.kind).toBe('cooldown');
    expect(d.progress).toBeCloseTo(0.5, 5);
  });

  it('cooldown 接近结束：timer ≈ 0 → progress ≈ 1', () => {
    const p = makePlayer({ dashState: { phase: 'cooldown', timer: 0.01, dashDir: { x: 0, y: 0 } } });
    const d = computeDashDisplay(p, 5);
    expect(d.kind).toBe('cooldown');
    expect(d.progress).toBeGreaterThan(0.99);
  });

  it('cdMaxSec 异常 0 时不应除零：返回 progress=1（保险分支）', () => {
    const p = makePlayer({ dashState: { phase: 'cooldown', timer: 0, dashDir: { x: 0, y: 0 } } });
    const d = computeDashDisplay(p, 0);
    expect(d.progress).toBe(1);
  });
});
