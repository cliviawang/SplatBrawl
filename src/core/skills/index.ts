/**
 * 技能模块入口。
 *
 * - 导出类型 / 注册器 / 调度器
 * - registerAllSkills() 由 GameLoop 在创建时调用一次，集中注册当前版本所有可用技能
 *   （单测中如需隔离，可调用 _resetRegistry() 后再 registerXxx() 单独注册）
 */

export * from './types';
export * from './registry';
export { applySkillUse } from './applySkillUse';
export { applyProjectiles } from './rocket';
export { tryRefreshPickups, applyPickupCollection } from './pickups';
export { cleanupAreaEffects } from './areaEffects';
export { cleanupLaserBeams } from './laser';
export { applyBombExplosions, cleanupBombExplosions } from './bomb';

import { registerRocket } from './rocket';
import { registerSpeed } from './speed';
import { registerShield } from './shield';
import { registerLaser } from './laser';
import { registerStar } from './star';
import { registerRoller } from './roller';
import { registerBomb } from './bomb';

/**
 * 注册当前版本所有技能。GameLoop 在构造时调用。
 */
export function registerAllSkills(): void {
  registerRocket();
  registerSpeed();
  registerShield();
  registerLaser();
  registerStar();
  registerRoller();
  registerBomb();
}
