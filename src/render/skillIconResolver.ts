import { AssetRegistry } from './AssetRegistry';
import type { SkillId } from '@/core/skills/types';

/**
 * 技能视觉资源分支决策（纯函数）。
 *
 * 设计目的：把"有图走 image / 无图走字母 fallback"这一分支判断从渲染器里独立出来，
 * 让 PickupRenderer 与 SkillSlotRenderer 共享同一套规则，并可被单测覆盖。
 *
 * key 约定：`skill.<id>.icon`，路径来自 src/config/assets/skills.json。
 *
 * 返回结构故意做成 discriminated union，渲染层用 `kind` 分支即可，不用再查 AssetRegistry。
 */

/** 技能 id → 单字母标识（fallback 圆里显示的字符） */
export const SKILL_LETTER: Record<SkillId, string> = {
  rocket: 'R',
  speed: 'S',
  shield: 'D', // Defense
  laser: 'L',
  roller: 'P', // Paint
  star: '★',
  bomb: 'B',
  charge: 'C',
  seed: 'E', // sEed
  ripple: '~',
  mark: 'M',
  rewind: '↺',
};

export type SkillIconVisual =
  | { kind: 'image'; textureKey: string }
  | { kind: 'fallback'; letter: string };

/**
 * 决定技能视觉走哪条分支。
 *
 * - 配置了图标路径（hasTexture=true） → image，渲染层用 `scene.add.image(textureKey)`
 * - 未配置 → fallback，渲染层走原来的圆 + 字母
 */
export function chooseSkillIconVisual(skillId: SkillId): SkillIconVisual {
  const textureKey = `skill.${skillId}.icon`;
  if (AssetRegistry.hasTexture(textureKey)) {
    return { kind: 'image', textureKey };
  }
  return { kind: 'fallback', letter: SKILL_LETTER[skillId] ?? '?' };
}
