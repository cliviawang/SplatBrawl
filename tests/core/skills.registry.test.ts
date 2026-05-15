import { describe, it, expect, beforeEach } from 'vitest';
import { registerSkill, getSkill, hasSkill, listSkills, _resetRegistry } from '@/core/skills/registry';
import type { Skill } from '@/core/skills/types';
import { createInitialState } from '@/core/GameState';

/**
 * 任务 6.1：技能注册系统
 *
 * 注册器是一个简单的 id → Skill 的 map，要求：
 *   - registerSkill(skill) 把技能登记进 map（重复 id 后写覆盖前者，但需 console.warn）
 *   - getSkill(id) 返回 Skill | undefined
 *   - hasSkill(id) 返回 boolean
 *   - listSkills() 返回所有已注册的 id 列表
 *   - _resetRegistry() 仅供测试用，清空注册表（生产代码不应调用）
 */

describe('Skill Registry', () => {
  beforeEach(() => {
    _resetRegistry();
  });

  it('未注册的技能 getSkill 返回 undefined', () => {
    expect(getSkill('rocket')).toBeUndefined();
    expect(hasSkill('rocket')).toBe(false);
  });

  it('注册后能查到', () => {
    const dummy: Skill = {
      id: 'rocket',
      type: 'instant',
      onCast: () => {},
    };
    registerSkill(dummy);
    expect(hasSkill('rocket')).toBe(true);
    expect(getSkill('rocket')).toBe(dummy);
  });

  it('listSkills 返回所有已注册 id', () => {
    registerSkill({ id: 'rocket', type: 'instant', onCast: () => {} });
    registerSkill({ id: 'speed', type: 'instant', onCast: () => {} });
    expect(listSkills().sort()).toEqual(['rocket', 'speed']);
  });

  it('onCast 被调用时收到 state 与 casterId', () => {
    let captured: { state: unknown; casterId: number } | null = null;
    registerSkill({
      id: 'rocket',
      type: 'instant',
      onCast: (state, casterId) => {
        captured = { state, casterId };
      },
    });
    const state = createInitialState();
    getSkill('rocket')!.onCast(state, 0);
    expect(captured).not.toBeNull();
    expect(captured!.casterId).toBe(0);
    expect(captured!.state).toBe(state);
  });
});
