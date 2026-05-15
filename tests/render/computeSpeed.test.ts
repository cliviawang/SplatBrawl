import { describe, it, expect } from 'vitest';
import { computeSpeed } from '@/render/computeSpeed';

describe('computeSpeed', () => {
  it('prev 为 null 时返回 0（首帧无法反推）', () => {
    expect(computeSpeed(null, { x: 1, y: 1 }, 1 / 60)).toBe(0);
  });

  it('dt <= 0 时返回 0（防除零）', () => {
    expect(computeSpeed({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(0);
    expect(computeSpeed({ x: 0, y: 0 }, { x: 1, y: 0 }, -0.1)).toBe(0);
  });

  it('沿 X 移动 1 单位/帧（dt=1/60）应得到 60 格/秒', () => {
    const v = computeSpeed({ x: 0, y: 0 }, { x: 1, y: 0 }, 1 / 60);
    expect(v).toBeCloseTo(60, 5);
  });

  it('斜向移动取欧氏距离', () => {
    const v = computeSpeed({ x: 0, y: 0 }, { x: 3, y: 4 }, 1);
    expect(v).toBeCloseTo(5, 5);
  });

  it('原地不动返回 0', () => {
    const v = computeSpeed({ x: 2, y: 3 }, { x: 2, y: 3 }, 1 / 60);
    expect(v).toBe(0);
  });
});
