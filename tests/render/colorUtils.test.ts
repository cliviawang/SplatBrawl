import { describe, it, expect } from 'vitest';
import { darkenColor } from '@/render/colorUtils';

describe('colorUtils.darkenColor', () => {
  it('factor=1 时颜色不变', () => {
    expect(darkenColor(0xabcdef, 1)).toBe(0xabcdef);
  });

  it('factor=0 时全黑', () => {
    expect(darkenColor(0xabcdef, 0)).toBe(0x000000);
  });

  it('factor=0.5 时各通道减半（0xff -> 0x80，四舍五入）', () => {
    // 0xff * 0.5 = 127.5 → 128 = 0x80
    expect(darkenColor(0xffffff, 0.5)).toBe(0x808080);
  });

  it('factor 越界（>1）夹到 1', () => {
    expect(darkenColor(0xabcdef, 2)).toBe(0xabcdef);
  });

  it('factor 越界（<0）夹到 0', () => {
    expect(darkenColor(0xabcdef, -1)).toBe(0x000000);
  });

  it('R/G/B 三通道独立缩放', () => {
    // R=0x80=128 *0.5=64=0x40, G=0x40=64 *0.5=32=0x20, B=0x20=32 *0.5=16=0x10
    expect(darkenColor(0x804020, 0.5)).toBe(0x402010);
  });
});
