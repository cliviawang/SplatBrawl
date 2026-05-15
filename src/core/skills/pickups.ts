import gameCfg from '@/config/game.json';
import pickupsCfg from '@/config/pickups.json';
import type { GameState, Pickup } from '@/core/types';
import type { SkillId } from './types';

/**
 * 任务 6.2：道具刷新系统。
 *
 * 玩法规则 7.3：
 *   - 第 10/20/30/40/50 秒各刷 1 次，每次 2 个；60 秒不刷
 *   - 等概率从 pool 中随机选技能种类
 *   - 不刷在玩家脚下；同次刷新不同位置
 *   - 区域类技能（shield/bomb）单次刷新最多 1 个；
 *     若已有活跃 areaEffect 或玩家持有区域类技能 → 本次完全不出区域类
 *
 * 设计：注入 RNG（默认 Math.random），便于测试可重放 + 联机将来用同步种子。
 */

export interface RefreshContext {
  /** 返回 [0, 1) 的伪随机数 */
  rng: () => number;
}

const POOL = pickupsCfg.pool as SkillId[];
const AREA_SET = new Set<string>(pickupsCfg.areaSkills);

/** 当前 tick 是否落在"应触发刷新"的整秒点 */
function shouldRefresh(state: GameState): { yes: boolean; sec: number } {
  const sec = Math.floor(state.tick / gameCfg.tickRate);
  if (sec <= 0 || sec >= 60) return { yes: false, sec };
  if (sec % pickupsCfg.intervalSec !== 0) return { yes: false, sec };
  if (sec === state.lastRefreshSec) return { yes: false, sec };
  // sec 必须落在 10/20/30/40/50 之一（intervalSec=10 时正好满足）
  return { yes: true, sec };
}

/** 是否本次刷新允许产出区域类技能 */
function allowAreaThisCycle(state: GameState): boolean {
  if (state.areaEffects.length > 0) return false;
  for (const p of state.players) {
    // 仅"亮态"区域技能（未释放）阻止刷新；灰态是历史标记，已释放过一次，不应继续占名额
    if (p.skillSlot && !p.skillSlot.used && AREA_SET.has(p.skillSlot.id)) return false;
  }
  return true;
}

/** 玩家当前所占格集合（key = "col,row"） */
function playerCellSet(state: GameState): Set<string> {
  const set = new Set<string>();
  for (const p of state.players) {
    set.add(`${Math.floor(p.pos.x)},${Math.floor(p.pos.y)}`);
  }
  return set;
}

/** 现有道具占据的格集合 */
function pickupCellSet(state: GameState): Set<string> {
  return new Set(state.pickups.map((pk) => `${pk.col},${pk.row}`));
}

/**
 * 选一个技能 id。
 *
 * @param rng         RNG（每次调用消费固定次数：1 或 2 次）
 * @param areaAllowed 是否允许区域类
 * @param excludeIds  本轮已选过的 id，避免一次刷新出现两个相同技能
 *
 * 策略：
 *   1. 先按 (areaAllowed + excludeIds) 过滤出候选池
 *   2. 候选池非空 → 在其上等概率取 1 个
 *   3. 候选池为空（极端兜底，4 元素池下不会发生）→ 退回原池等概率取 1 个
 */
function pickSkillId(
  rng: () => number,
  areaAllowed: boolean,
  excludeIds: ReadonlySet<SkillId>,
): SkillId {
  const candidates = POOL.filter((id) => {
    if (excludeIds.has(id)) return false;
    if (!areaAllowed && AREA_SET.has(id)) return false;
    return true;
  });
  const pool = candidates.length > 0 ? candidates : POOL;
  const r = rng();
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}

/** 选一个空格（不与玩家、不与现有道具同格）；尝试若干次后兜底扫描全图 */
function pickEmptyCell(
  state: GameState,
  rng: () => number,
  occupied: Set<string>,
): { col: number; row: number } | null {
  const W = gameCfg.mapWidth;
  const H = gameCfg.mapHeight;
  const players = playerCellSet(state);

  for (let i = 0; i < 32; i++) {
    const col = Math.min(W - 1, Math.floor(rng() * W));
    const row = Math.min(H - 1, Math.floor(rng() * H));
    const key = `${col},${row}`;
    if (players.has(key) || occupied.has(key)) continue;
    return { col, row };
  }
  // 兜底：扫描全图找第一个空格
  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const key = `${col},${row}`;
      if (!players.has(key) && !occupied.has(key)) {
        return { col, row };
      }
    }
  }
  return null;
}

let pickupIdSeq = 0;
function nextPickupId(): string {
  pickupIdSeq += 1;
  return `pk-${pickupIdSeq}`;
}

/**
 * 主入口：在 GameLoop 每 tick 调一次。仅在合规时机才会刷新。
 */
export function tryRefreshPickups(state: GameState, ctx: RefreshContext): void {
  const { yes, sec } = shouldRefresh(state);
  if (!yes) return;

  const occupied = pickupCellSet(state);
  let areaUsedThisCycle = !allowAreaThisCycle(state);
  const usedIds = new Set<SkillId>();

  for (let i = 0; i < pickupsCfg.spawnsPerCycle; i++) {
    const skillId = pickSkillId(ctx.rng, !areaUsedThisCycle, usedIds);
    const cell = pickEmptyCell(state, ctx.rng, occupied);
    if (!cell) break; // 地图无空位则放弃后续

    const pk: Pickup = {
      id: nextPickupId(),
      skillId,
      col: cell.col,
      row: cell.row,
    };
    state.pickups.push(pk);
    occupied.add(`${cell.col},${cell.row}`);
    usedIds.add(skillId);
    if (AREA_SET.has(skillId)) areaUsedThisCycle = true;
  }

  state.lastRefreshSec = sec;
}

/**
 * 玩家踩到道具时自动入槽（覆盖原槽位）。GameLoop 每 tick 调一次。
 * 玩家圆心所在格 == 道具格 视为踩到。
 */
export function applyPickupCollection(state: GameState): void {
  if (state.pickups.length === 0) return;
  const remaining: Pickup[] = [];
  for (const pk of state.pickups) {
    let consumed = false;
    for (const p of state.players) {
      const px = Math.floor(p.pos.x);
      const py = Math.floor(p.pos.y);
      if (px === pk.col && py === pk.row) {
        p.skillSlot = { id: pk.skillId, used: false };
        consumed = true;
        break;
      }
    }
    if (!consumed) remaining.push(pk);
  }
  state.pickups = remaining;
}
