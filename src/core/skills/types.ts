import type { GameState } from '@/core/types';

/**
 * 技能 ID 联合类型。
 *
 * 本版本（阶段 6）注册到 registry 的仅有前 7 个；后 5 个（seed/ripple/mark/rewind/charge）
 * 在 skills.json 数值配置中保留条目以避免破坏配置结构，但不实现 onCast、不参与刷新池。
 * charge（霸体）暂缓原因：单机模式下无手动配置入口、效果难肉眼测试，留待联机版本。
 */
export type SkillId =
  | 'rocket'
  | 'speed'
  | 'shield'
  | 'laser'
  | 'roller'
  | 'star'
  | 'bomb'
  | 'charge'
  // future（不在本版本注册）
  | 'seed'
  | 'ripple'
  | 'mark'
  | 'rewind';

/**
 * 技能类型：
 *   - 'instant'    立即生效（如星星：执行 onCast 时直接修改 state）
 *   - 'projectile' 发射物（如火箭：onCast 推入 state.projectiles）
 *   - 'buff'       持续 buff（如极速/护盾/涂刷；future: 霸体）
 *   - 'area'       区域效果（如炸弹：onCast 推入 state.areaEffects）
 *
 * 仅作元信息；具体逻辑由 onCast 内部承担。
 */
export type SkillType = 'instant' | 'projectile' | 'buff' | 'area';

/**
 * 技能定义。`onCast` 在玩家释放技能时被调用，直接修改传入 state（与其他纯逻辑系统一致）。
 */
export interface Skill {
  id: SkillId;
  type: SkillType;
  /**
   * 释放回调。
   * @param state 当前游戏状态，可直接修改
   * @param casterId 施法者 playerId
   */
  onCast(state: GameState, casterId: number): void;
}
