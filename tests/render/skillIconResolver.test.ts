import { describe, it, expect, afterEach } from 'vitest';
import { chooseSkillIconVisual, SKILL_LETTER } from '@/render/skillIconResolver';
import { AssetRegistry } from '@/render/AssetRegistry';
import skillsJson from '@/config/assets/skills.json';

/**
 * chooseSkillIconVisual 分支决策测试。
 *
 * 现状（2026-05 阶段）：rocket 已接入 icon，其余技能 icon 路径仍为空字符串。
 * 这两类样本足以覆盖 image / fallback 两条分支。
 *
 * 注意：测试结尾要把 skills.json mutate 还原（虽然 hasTexture 走的是模块级 textureMap
 * 一次性扁平化，运行期改 JSON 不会影响 Map，但仍按惯例 afterEach 还原避免别处依赖）。
 */
describe('chooseSkillIconVisual', () => {
  it('skill.rocket.icon 配置非空路径 → 返回 image 分支', () => {
    // 前置：当前 skills.json 里 rocket.icon 已填路径
    expect(AssetRegistry.hasTexture('skill.rocket.icon')).toBe(true);
    const v = chooseSkillIconVisual('rocket');
    expect(v.kind).toBe('image');
    if (v.kind === 'image') {
      expect(v.textureKey).toBe('skill.rocket.icon');
    }
  });

  it('skill.seed.icon 路径为空 → 返回 fallback 分支，letter 为 D', () => {
    // 注：seed/charge/ripple/mark/rewind 这批技能 icon 仍未接图，稳定走 fallback 分支
    expect(AssetRegistry.hasTexture('skill.seed.icon')).toBe(false);
    const v = chooseSkillIconVisual('seed');
    expect(v.kind).toBe('fallback');
    if (v.kind === 'fallback') {
      expect(v.letter).toBe(SKILL_LETTER.seed);
    }
  });

  it('所有 SkillId 都在 SKILL_LETTER 中有映射，避免出现 ? 兜底字符', () => {
    // 这条断言把"以后新增技能忘了补 letter"的退化挡在 CI
    for (const id of Object.keys(skillsJson) as Array<keyof typeof skillsJson>) {
      expect(SKILL_LETTER[id as keyof typeof SKILL_LETTER]).toBeTruthy();
    }
  });

  describe('与配置联动', () => {
    // 此处只 mutate 外部 JSON 是否会影响 textureMap，要看 AssetRegistry 实现
    // 当前 AssetRegistry 的 textureMap 在模块加载时扁平化一次，运行期改 JSON 字段
    // 不会改变 hasTexture 行为；本组用例只验证"路径与 key 的对应关系是稳定的"。
    afterEach(() => {
      // 占位：未来若 AssetRegistry 提供 refreshTextures，可在此还原
    });

    it('其他空路径技能（seed/charge/ripple/mark/rewind 等）一律返回 fallback', () => {
      const emptyKeys: Array<keyof typeof skillsJson> = ['seed', 'charge', 'ripple', 'mark', 'rewind'];
      for (const id of emptyKeys) {
        const v = chooseSkillIconVisual(id as keyof typeof SKILL_LETTER);
        expect(v.kind).toBe('fallback');
      }
    });
  });
});
