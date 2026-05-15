import { describe, it, expect } from 'vitest';
import { formatTime, isTimeWarning, TOP_HUD_HEIGHT, TIME_WARNING_THRESHOLD_SEC } from '@/render/HUD';

describe('HUD.formatTime', () => {
  it('60 秒 -> 1:00', () => {
    expect(formatTime(60)).toBe('1:00');
  });
  it('30 秒 -> 0:30', () => {
    expect(formatTime(30)).toBe('0:30');
  });
  it('小数向上取整：59.4 -> 1:00', () => {
    expect(formatTime(59.4)).toBe('1:00');
  });
  it('0 秒 -> 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });
  it('负数夹到 0:00', () => {
    expect(formatTime(-5)).toBe('0:00');
  });
  it('59.001 秒 -> 1:00（向上取整）', () => {
    expect(formatTime(59.001)).toBe('1:00');
  });
});

describe('HUD.isTimeWarning', () => {
  it(`> ${TIME_WARNING_THRESHOLD_SEC}s 不警示`, () => {
    expect(isTimeWarning(11)).toBe(false);
    expect(isTimeWarning(60)).toBe(false);
  });
  it(`= ${TIME_WARNING_THRESHOLD_SEC}s 即进入警示（含等号）`, () => {
    expect(isTimeWarning(10)).toBe(true);
  });
  it(`< ${TIME_WARNING_THRESHOLD_SEC}s 警示`, () => {
    expect(isTimeWarning(5)).toBe(true);
    expect(isTimeWarning(0.1)).toBe(true);
  });
  it('0 秒视为警示', () => {
    expect(isTimeWarning(0)).toBe(true);
  });
  it('负数视为警示（夹到 0 后仍 ≤ 阈值）', () => {
    expect(isTimeWarning(-5)).toBe(true);
  });
});

describe('HUD 常量', () => {
  it('TopHUD 高度为 80（与画布尺寸 1024×792 中预留的 80px HUD 区一致）', () => {
    expect(TOP_HUD_HEIGHT).toBe(80);
  });
  it('警示阈值为 10 秒', () => {
    expect(TIME_WARNING_THRESHOLD_SEC).toBe(10);
  });
});
