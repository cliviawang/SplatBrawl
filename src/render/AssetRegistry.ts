import colors from '@/config/assets/colors.json';
import tiles from '@/config/assets/tiles.json';
import characters from '@/config/assets/characters.json';
import skills from '@/config/assets/skills.json';
import ui from '@/config/assets/ui.json';

/**
 * 资源中心：所有渲染层颜色 / 图片查询的唯一入口。
 *
 * - 颜色：来自 colors.json，必填，缺失返回 0xffffff 并 console.warn
 * - 图片：来自 tiles/characters/skills/ui，路径为空字符串时 hasTexture 返回 false，
 *   渲染层据此 fallback 到几何图元，不阻塞开发
 *
 * key 命名规范：使用点分扁平 key
 *   - 颜色：tile.red / player.blue / ui.bg
 *   - 图片：tile.red / character.red / skill.rocket.icon / skill.bomb.explosion / ui.button.start
 *
 * 颜色 key 与图片 key 走两套独立的扁平 map，互不干扰。
 */

type JsonObj = Record<string, unknown>;

/**
 * 把嵌套对象扁平化成 { 'a.b.c': value } 形式。
 */
function flatten(obj: JsonObj, prefix: string, out: Map<string, string>): void {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v as JsonObj, key, out);
    } else if (typeof v === 'string') {
      out.set(key, v);
    }
  }
}

// 颜色 map：tile.red -> "#e74c3c"
// 使用 let 而非 const，refresh() 时会重新构建（让 DevPanel 改 colors.json 字段后能立即反映）
let colorMap = new Map<string, string>();
function rebuildColorMap(): void {
  colorMap = new Map<string, string>();
  flatten(colors as JsonObj, '', colorMap);
}
rebuildColorMap();

// 图片 map：character.red / tile.red / skill.rocket.icon / ui.button.start -> 路径字符串
const textureMap = new Map<string, string>();
flatten(tiles as JsonObj, 'tile', textureMap);
flatten(characters as JsonObj, 'character', textureMap);
flatten(skills as JsonObj, 'skill', textureMap);
flatten(ui as JsonObj, 'ui', textureMap);

/**
 * hex 字符串转 number。"#e74c3c" -> 0xe74c3c。
 */
function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export const AssetRegistry = {
  /**
   * 取颜色（数字形式，Phaser 使用）。
   * key 形如 'tile.red' / 'player.blue' / 'ui.bg'。
   * 找不到 key 时返回 0xffffff 并 console.warn。
   */
  getColor(key: string): number {
    const hex = colorMap.get(key);
    if (!hex) {
      console.warn(`[AssetRegistry] 未找到颜色 key: ${key}，使用默认 0xffffff`);
      return 0xffffff;
    }
    return hexToNumber(hex);
  },

  /**
   * 是否存在可加载的纹理。
   * 路径为空字符串时返回 false，渲染层据此 fallback 到几何图元。
   */
  hasTexture(key: string): boolean {
    const path = textureMap.get(key);
    return typeof path === 'string' && path.length > 0;
  },

  /**
   * 取纹理原始路径字符串。BootScene 用它做 this.load.image(key, path)。
   * 不存在的 key 返回空字符串。
   */
  getTexturePath(key: string): string {
    return textureMap.get(key) ?? '';
  },

  /**
   * 列出所有已注册的纹理 key（含路径为空的）。
   * BootScene 启动时遍历筛选非空路径加载。
   */
  listAllTextureKeys(): string[] {
    return Array.from(textureMap.keys());
  },

  /**
   * 重新从 colors.json 对象扁平化构建内部 colorMap。
   *
   * 使用场景：DevPanel 直接 mutate colors.json 字段后调用，
   * 让后续 getColor 返回新色值。
   *
   * 注意：纹理路径不需要刷新（开发期不会改图路径，且改了也要 BootScene 重新 load）。
   */
  refresh(): void {
    rebuildColorMap();
  },
};
