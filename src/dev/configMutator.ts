/**
 * 配置实时改写工具（仅开发模式 DevPanel 用）。
 *
 * 设计前提：
 *   - 项目里所有模块都是 `import cfg from '@/config/xxx.json'`，ESM 导出对象是引用，
 *     直接改字段（mutate）就能让所有持有者下一次读取拿到新值，无需 getConfig() 重构。
 *   - 本模块只提供"按路径定位 + 类型校验 + 写值"，不引入任何运行时状态。
 *
 * 路径语法：扁平点分，'a.b.c' → obj.a.b.c。不支持数组下标（当前 JSON 配置无数组）。
 */

/**
 * 校验 #RRGGBB 形式（不接受 #RGB 简写、不接受无 # 形式）。
 */
export function isHexColor(s: unknown): boolean {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

/**
 * 沿点分路径定位"父对象 + 末段 key"。路径不存在抛错。
 */
function resolveParent(
  obj: Record<string, unknown>,
  path: string,
): { parent: Record<string, unknown>; key: string } {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur === null || typeof cur !== 'object' || !(parts[i] in (cur as object))) {
      throw new Error(`路径不存在: ${path}（在 "${parts[i]}" 处中断）`);
    }
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (cur === null || typeof cur !== 'object') {
    throw new Error(`路径不存在: ${path}（父级不是对象）`);
  }
  const key = parts[parts.length - 1];
  if (!(key in (cur as object))) {
    throw new Error(`路径不存在: ${path}（缺少 "${key}"）`);
  }
  return { parent: cur as Record<string, unknown>, key };
}

/**
 * 按点分路径写入数值字段。
 *   - 路径不存在 → throw
 *   - 目标字段当前值不是 number → throw（保护类型一致性）
 *   - 写入值不是有限数 → throw
 */
export function mutateNumber(
  obj: Record<string, unknown>,
  path: string,
  value: number,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`mutateNumber 需要有限数值，得到: ${value}`);
  }
  const { parent, key } = resolveParent(obj, path);
  if (typeof parent[key] !== 'number') {
    throw new Error(`路径 ${path} 不是数值字段（实际类型: ${typeof parent[key]}）`);
  }
  parent[key] = value;
}

/**
 * 按点分路径写入颜色字符串字段。
 *   - 路径不存在 → throw
 *   - 目标字段当前值不是 string → throw
 *   - 颜色非 #RRGGBB → throw
 */
export function mutateColor(
  obj: Record<string, unknown>,
  path: string,
  hex: string,
): void {
  if (!isHexColor(hex)) {
    throw new Error(`非法颜色: ${hex}（要求 #RRGGBB）`);
  }
  const { parent, key } = resolveParent(obj, path);
  if (typeof parent[key] !== 'string') {
    throw new Error(`路径 ${path} 不是颜色字段（实际类型: ${typeof parent[key]}）`);
  }
  parent[key] = hex;
}

/**
 * 把对象里所有数值字段（递归）扁平化成 [{ path, value }, ...]。
 * - 跳过非数值（字符串/数组/null/undefined/对象不是字段本身）
 * - 忽略 NaN / Infinity
 * - 用于自动渲染 DevPanel 的 number input 列表
 */
export function flattenNumberFields(
  obj: Record<string, unknown>,
  prefix = '',
): Array<{ path: string; value: number }> {
  const out: Array<{ path: string; value: number }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) {
        out.push({ path, value: v });
      }
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenNumberFields(v as Record<string, unknown>, path));
    }
  }
  return out;
}
