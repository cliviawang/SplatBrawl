import { describe, it, expect, afterEach } from 'vitest';
import { AssetRegistry } from '@/render/AssetRegistry';
import colorsJson from '@/config/assets/colors.json';

describe('AssetRegistry', () => {
  it('getColor 应返回 colors.json 中配置的色值（hex 转 number）', () => {
    expect(AssetRegistry.getColor('tile.red')).toBe(0xe74c3c);
    expect(AssetRegistry.getColor('player.blue')).toBe(0x2980b9);
  });

  it('getColor 应包含 ui.warning（覆盖减速描边色）', () => {
    expect(AssetRegistry.getColor('ui.warning')).toBe(0xff0000);
  });

  it('getColor 找不到 key 时返回默认色 0xffffff 并控制台警告', () => {
    expect(AssetRegistry.getColor('not.exist')).toBe(0xffffff);
  });

  it('hasTexture 在路径为空字符串时返回 false', () => {
    // 注：随着图标陆续接入，原先空路径的 skill.*.icon 多数已填上。
    // 这里改用仍稳定为空的 skill.speed.trail（速度技能拖尾，未做图）和 ui.button.start（UI 按钮图未做）。
    expect(AssetRegistry.hasTexture('skill.speed.trail')).toBe(false);
    expect(AssetRegistry.hasTexture('ui.button.start')).toBe(false);
  });

  it('hasTexture 在路径已配置时返回 true（rocket 图标已接入）', () => {
    expect(AssetRegistry.hasTexture('skill.rocket.icon')).toBe(true);
  });

  it('getTexturePath 返回清单中的原始路径字符串（用于 BootScene 预加载）', () => {
    // 空字符串路径（仍未接图的特效字段）
    expect(AssetRegistry.getTexturePath('skill.speed.trail')).toBe('');
    // 已配置的真实路径透传
    expect(AssetRegistry.getTexturePath('character.red')).toBe('images/characters/red.png');
    expect(AssetRegistry.getTexturePath('skill.rocket.icon')).toBe('images/skills/rocket-icon.png');
  });

  describe('refresh', () => {
    // 改完后必须还原，避免污染其他测试
    const originalRed = colorsJson.tile.red;
    afterEach(() => {
      colorsJson.tile.red = originalRed;
      AssetRegistry.refresh();
    });

    it('改 colors.json 字段后调 refresh，getColor 返回新色值', () => {
      colorsJson.tile.red = '#112233';
      AssetRegistry.refresh();
      expect(AssetRegistry.getColor('tile.red')).toBe(0x112233);
    });

    it('未调 refresh 前，getColor 仍返回旧色值（由内部缓存提供）', () => {
      colorsJson.tile.red = '#445566';
      // 故意不 refresh
      expect(AssetRegistry.getColor('tile.red')).toBe(0xe74c3c);
    });
  });
});
