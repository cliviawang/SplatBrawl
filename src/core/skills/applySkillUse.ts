/**
 * 技能释放调度器（阶段 6.3+）。
 *
 * 每 tick 从 GameLoop 调用一次：检查每个玩家的 useSkill Intent，
 * 若持有可用技能且非眩晕，则调用对应 Skill.onCast，并把槽位置为灰态（used=true）。
 *
 * 槽位语义（修订）：释放后槽位保留为 { id, used: true }（灰态），
 * 仅在被冲刺抢走 / 被新道具替换 / 局末重置时才清空。
 * 这样冲刺者仍能从"刚释放完技能"的玩家身上抢到（虽然抢到的是亮态，对应玩法规则 8.2）。
 */
import { getSkill } from './registry';
import type { GameState, PlayerIntent } from '../types';

export function applySkillUse(state: GameState, intents: Map<number, PlayerIntent>): void {
  for (const intent of intents.values()) {
    if (!intent.useSkill) continue;
    const player = state.players[intent.playerId];
    if (!player) continue;
    // 眩晕中无法释放
    if (state.tick < player.stunUntilTick) continue;
    const slot = player.skillSlot;
    if (!slot || slot.used) continue;
    const skill = getSkill(slot.id);
    if (!skill) continue;
    skill.onCast(state, intent.playerId);
    // 释放后置为灰态，保留 id 以便后续被冲刺抢夺
    slot.used = true;
  }
}
