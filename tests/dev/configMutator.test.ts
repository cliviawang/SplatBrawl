import { describe, it, expect } from 'vitest';
import {
  mutateNumber,
  mutateColor,
  flattenNumberFields,
  isHexColor,
} from '@/dev/configMutator';

describe('configMutator', () => {
  describe('isHexColor', () => {
    it('接受 #RRGGBB 形式', () => {
      expect(isHexColor('#a1b2c3')).toBe(true);
      expect(isHexColor('#ABCDEF')).toBe(true);
      expect(isHexColor('#000000')).toBe(true);
    });
    it('拒绝其他格式', () => {
      expect(isHexColor('a1b2c3')).toBe(false);
      expect(isHexColor('#abc')).toBe(false);
      expect(isHexColor('#a1b2c3d')).toBe(false);
      expect(isHexColor('#zzzzzz')).toBe(false);
      expect(isHexColor('')).toBe(false);
    });
  });

  describe('mutateNumber', () => {
    it('按顶层路径写入数值', () => {
      const obj: Record<string, unknown> = { a: 1, b: 2 };
      mutateNumber(obj, 'a', 99);
      expect(obj.a).toBe(99);
      expect(obj.b).toBe(2);
    });

    it('按嵌套路径写入数值', () => {
      const obj = { skills: { rocket: { speed: 8, stunSec: 1 } } };
      mutateNumber(obj, 'skills.rocket.speed', 12);
      expect(obj.skills.rocket.speed).toBe(12);
      expect(obj.skills.rocket.stunSec).toBe(1);
    });

    it('路径不存在时抛错', () => {
      const obj = { a: 1 };
      expect(() => mutateNumber(obj, 'b', 2)).toThrow(/路径不存在/);
      expect(() => mutateNumber(obj, 'a.b', 2)).toThrow(/路径不存在/);
    });

    it('目标字段不是数值时抛错', () => {
      const obj = { a: 'hello' };
      expect(() => mutateNumber(obj, 'a', 1)).toThrow(/不是数值字段/);
    });

    it('值不是有限数值时抛错', () => {
      const obj = { a: 1 };
      expect(() => mutateNumber(obj, 'a', NaN)).toThrow(/有限数值/);
      expect(() => mutateNumber(obj, 'a', Infinity)).toThrow(/有限数值/);
    });
  });

  describe('mutateColor', () => {
    it('按嵌套路径写入颜色字符串', () => {
      const colors = { tile: { red: '#e74c3c', blue: '#3498db' } };
      mutateColor(colors, 'tile.red', '#ff0000');
      expect(colors.tile.red).toBe('#ff0000');
      expect(colors.tile.blue).toBe('#3498db');
    });

    it('非法颜色格式抛错', () => {
      const colors = { tile: { red: '#e74c3c' } };
      expect(() => mutateColor(colors, 'tile.red', 'red')).toThrow(/非法颜色/);
      expect(() => mutateColor(colors, 'tile.red', '#abc')).toThrow(/非法颜色/);
    });

    it('路径不存在抛错', () => {
      const colors = { tile: { red: '#e74c3c' } };
      expect(() => mutateColor(colors, 'tile.purple', '#ffffff')).toThrow(/路径不存在/);
    });

    it('目标字段不是字符串抛错', () => {
      const colors: Record<string, unknown> = { x: 1 };
      expect(() => mutateColor(colors, 'x', '#ffffff')).toThrow(/不是颜色字段/);
    });
  });

  describe('flattenNumberFields', () => {
    it('扁平化顶层数值字段', () => {
      const obj = { a: 1, b: 2, c: 'skip' };
      const res = flattenNumberFields(obj);
      expect(res).toEqual([
        { path: 'a', value: 1 },
        { path: 'b', value: 2 },
      ]);
    });

    it('递归嵌套对象', () => {
      const obj = {
        rocket: { speed: 8, stunSec: 1 },
        speed: { multiplier: 2, durationSec: 3 },
      };
      const res = flattenNumberFields(obj);
      expect(res).toEqual([
        { path: 'rocket.speed', value: 8 },
        { path: 'rocket.stunSec', value: 1 },
        { path: 'speed.multiplier', value: 2 },
        { path: 'speed.durationSec', value: 3 },
      ]);
    });

    it('忽略非数值字段（字符串/数组/null）', () => {
      const obj = {
        a: 1,
        b: 'x',
        c: [1, 2, 3],
        d: null,
        nested: { e: 5 },
      };
      const res = flattenNumberFields(obj);
      expect(res).toEqual([
        { path: 'a', value: 1 },
        { path: 'nested.e', value: 5 },
      ]);
    });

    it('空对象返回空数组', () => {
      expect(flattenNumberFields({})).toEqual([]);
    });

    it('忽略 NaN/Infinity', () => {
      const obj = { a: 1, b: NaN, c: Infinity };
      expect(flattenNumberFields(obj)).toEqual([{ path: 'a', value: 1 }]);
    });
  });
});
