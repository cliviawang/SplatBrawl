import type { Player } from '@/core/types';

/**
 * 阶段 11.3：HUD 渲染层共用的纯函数集合（不引 Phaser，直接受 happy-dom 测试）。
 *
 * 抽出原因：渲染类如 PlayerSkillSlot / DashIndicator 顶部 `import Phaser` 会在 happy-dom
 *           测试环境下因为 canvas/WebGL stub 不全而崩；而 displayPhase / progress 的推导
 *           本质是纯逻辑，与 Phaser 完全无关，单独成模块直接单测。
 */

/**
 * 玩家自身技能槽显示相位（plans 6.5 / 6.8）：
 *   1. skillSlot === null               → 'empty'
 *   2. skillSlot.used === false 且未眩晕 → 'active'
 *   3. skillSlot.used === false 且眩晕中 → 'disabled'
 *   4. skillSlot.used === true（无论是否眩晕） → 'spent'
 *
 * 关键：spent 永远是 spent —— 不会因为眩晕而升级为 disabled，灰态本来就不可用。
 */
export type SkillSlotPhase = 'empty' | 'active' | 'disabled' | 'spent';

export function computeSkillSlotPhase(player: Player, currentTick: number): SkillSlotPhase {
  if (player.skillSlot === null) return 'empty';
  if (player.skillSlot.used) return 'spent';
  // used = false：判定眩晕
  if (currentTick < player.stunUntilTick) return 'disabled';
  return 'active';
}

/**
 * 冲刺指示器显示状态：
 *   - 'ready'    : 可立即冲刺
 *   - 'dashing'  : 当前正在冲（短暂高亮）
 *   - 'cooldown' : 冷却中，progress 表示已恢复百分比
 *
 * progress ∈ [0,1]，0=刚开始冷却，1=满格可用。
 *
 * cdMaxSec 异常 ≤0 时不应除零，统一返回 progress=1（保险）。
 */
export type DashDisplayKind = 'ready' | 'dashing' | 'cooldown';
export interface DashDisplay {
  kind: DashDisplayKind;
  progress: number;
}

export function computeDashDisplay(player: Player, cdMaxSec: number): DashDisplay {
  const phase = player.dashState.phase;
  if (phase === 'idle') return { kind: 'ready', progress: 1 };
  if (phase === 'dashing') return { kind: 'dashing', progress: 1 };
  // cooldown
  if (cdMaxSec <= 0) return { kind: 'cooldown', progress: 1 };
  const timer = Math.max(0, player.dashState.timer);
  const progress = Math.max(0, Math.min(1, 1 - timer / cdMaxSec));
  return { kind: 'cooldown', progress };
}
