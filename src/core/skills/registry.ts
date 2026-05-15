import type { Skill, SkillId } from './types';

/**
 * 技能注册表：id → Skill 单例。
 *
 * 通过 `registerSkill` 在模块加载时注册（典型用法见 `src/core/skills/index.ts`）。
 * 联机服务端复用同一份注册表，因此严禁注册依赖 Phaser 的逻辑。
 */
const registry = new Map<string, Skill>();

export function registerSkill(skill: Skill): void {
  if (registry.has(skill.id)) {
    console.warn(`[SkillRegistry] 重复注册技能 id: ${skill.id}，覆盖前者`);
  }
  registry.set(skill.id, skill);
}

export function getSkill(id: SkillId | string): Skill | undefined {
  return registry.get(id);
}

export function hasSkill(id: SkillId | string): boolean {
  return registry.has(id);
}

export function listSkills(): string[] {
  return Array.from(registry.keys());
}

/**
 * **仅供测试使用**——清空注册表。生产代码不应调用。
 */
export function _resetRegistry(): void {
  registry.clear();
}
