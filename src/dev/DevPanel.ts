import playerCfg from '@/config/player.json';
import skillsCfg from '@/config/skills.json';
import colorsJson from '@/config/assets/colors.json';
import { AssetRegistry } from '@/render/AssetRegistry';
import {
  flattenNumberFields,
  mutateColor,
  mutateNumber,
} from './configMutator';

/**
 * 开发者调参面板（仅 ?dev=1 时挂载）。
 *
 * 设计要点：
 *   - 裸 DOM，零依赖，挂在右侧固定浮层
 *   - 数值字段：自动从 player.json / skills.json 扁平化生成 number input
 *     change 事件直接 mutate JSON 对象字段 → 项目里所有 `import xxxCfg`
 *     都是引用，下一帧 tick 自动用新值
 *   - 颜色字段：colors.json 全部三组（tile/player/ui），用 <input type="color">
 *     change 后 mutateColor + AssetRegistry.refresh()。MapRenderer 每帧 sync
 *     都重读 AssetRegistry，地图色立即生效；玩家色 / UI 色多在 constructor
 *     缓存，需要"新开一局"才彻底刷新（本期接受）
 *   - 默认折叠隐藏，左上角按钮切换；`Ctrl + ~` 也可切换
 *
 * 不进生产路径：仅 main.ts 在 URLSearchParams 含 `dev` 时实例化。
 */
export class DevPanel {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private collapsed = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'dev-panel';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      width: '320px',
      maxHeight: 'calc(100vh - 16px)',
      overflowY: 'auto',
      background: 'rgba(20,20,20,0.92)',
      color: '#e8e8e8',
      font: '12px/1.4 Consolas, "Courier New", monospace',
      border: '1px solid #444',
      borderRadius: '6px',
      padding: '8px',
      zIndex: '99999',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    } as Partial<CSSStyleDeclaration>);

    // 标题栏 + 折叠按钮
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '6px',
      paddingBottom: '4px',
      borderBottom: '1px solid #333',
    } as Partial<CSSStyleDeclaration>);
    const title = document.createElement('span');
    title.textContent = 'DevPanel';
    title.style.fontWeight = 'bold';
    title.style.color = '#00ff88';
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.textContent = '−';
    Object.assign(this.toggleBtn.style, {
      background: '#333',
      color: '#fff',
      border: '1px solid #555',
      borderRadius: '3px',
      width: '22px',
      height: '22px',
      cursor: 'pointer',
      font: 'inherit',
    } as Partial<CSSStyleDeclaration>);
    this.toggleBtn.addEventListener('click', () => this.toggle());
    header.appendChild(title);
    header.appendChild(this.toggleBtn);
    this.root.appendChild(header);

    // 内容区
    this.body = document.createElement('div');
    this.root.appendChild(this.body);

    this.renderSection('Player (player.json)', () => this.renderNumberFields(
      playerCfg as unknown as Record<string, unknown>,
    ));
    this.renderSection('Skills (skills.json)', () => this.renderNumberFields(
      skillsCfg as unknown as Record<string, unknown>,
    ));
    this.renderSection('Colors (assets/colors.json)', () => this.renderColorFields());

    // 快捷键：` 单独切换控制台（不冲突，DebugConsole 已占用）；这里用 Alt + D
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        this.toggle();
      }
    });

    document.body.appendChild(this.root);
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    this.body.style.display = this.collapsed ? 'none' : 'block';
    this.toggleBtn.textContent = this.collapsed ? '+' : '−';
  }

  /** 创建一个折叠分组 */
  private renderSection(label: string, build: () => HTMLElement): void {
    const wrap = document.createElement('details');
    wrap.open = true;
    Object.assign(wrap.style, {
      marginBottom: '6px',
      border: '1px solid #2a2a2a',
      borderRadius: '4px',
      padding: '4px 6px',
    } as Partial<CSSStyleDeclaration>);
    const summary = document.createElement('summary');
    summary.textContent = label;
    Object.assign(summary.style, {
      cursor: 'pointer',
      color: '#9ad',
      fontWeight: 'bold',
      marginBottom: '4px',
    } as Partial<CSSStyleDeclaration>);
    wrap.appendChild(summary);
    wrap.appendChild(build());
    this.body.appendChild(wrap);
  }

  /**
   * 数值字段渲染：扁平化对象后每个字段一行 `label : <input type="number">`。
   * change 时直接 mutateNumber(obj, path, value) —— obj 是 import 来的 JSON 对象引用。
   */
  private renderNumberFields(obj: Record<string, unknown>): HTMLElement {
    const list = document.createElement('div');
    const fields = flattenNumberFields(obj);
    if (fields.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '(无可调字段)';
      empty.style.color = '#666';
      list.appendChild(empty);
      return list;
    }
    for (const { path, value } of fields) {
      list.appendChild(this.makeNumberRow(obj, path, value));
    }
    return list;
  }

  private makeNumberRow(
    target: Record<string, unknown>,
    path: string,
    initial: number,
  ): HTMLElement {
    const row = document.createElement('label');
    Object.assign(row.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 90px',
      alignItems: 'center',
      gap: '6px',
      padding: '2px 0',
    } as Partial<CSSStyleDeclaration>);

    const name = document.createElement('span');
    name.textContent = path;
    name.style.color = '#ccc';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.title = path;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = inferStep(initial);
    input.value = String(initial);
    Object.assign(input.style, {
      background: '#111',
      color: '#fff',
      border: '1px solid #444',
      borderRadius: '3px',
      padding: '2px 4px',
      font: 'inherit',
      width: '100%',
    } as Partial<CSSStyleDeclaration>);
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) {
        input.value = String(initial);
        return;
      }
      try {
        mutateNumber(target, path, v);
      } catch (err) {
        console.warn('[DevPanel]', err);
        input.value = String(initial);
      }
    });

    row.appendChild(name);
    row.appendChild(input);
    return row;
  }

  /**
   * 颜色字段渲染：遍历 colors.json 的三组（tile/player/ui），每个叶子一行 color picker。
   * input 事件实时改色（拖动 picker 看效果），change 事件最终落定。
   */
  private renderColorFields(): HTMLElement {
    const list = document.createElement('div');
    const groups: Array<[string, Record<string, string>]> = [
      ['tile', colorsJson.tile as unknown as Record<string, string>],
      ['player', colorsJson.player as unknown as Record<string, string>],
      ['ui', colorsJson.ui as unknown as Record<string, string>],
    ];
    for (const [groupName, group] of groups) {
      const groupHeader = document.createElement('div');
      groupHeader.textContent = groupName;
      Object.assign(groupHeader.style, {
        color: '#888',
        marginTop: '4px',
        marginBottom: '2px',
      } as Partial<CSSStyleDeclaration>);
      list.appendChild(groupHeader);
      for (const [key, hex] of Object.entries(group)) {
        list.appendChild(this.makeColorRow(`${groupName}.${key}`, hex));
      }
    }
    return list;
  }

  private makeColorRow(path: string, initial: string): HTMLElement {
    const row = document.createElement('label');
    Object.assign(row.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 60px',
      alignItems: 'center',
      gap: '6px',
      padding: '2px 0',
    } as Partial<CSSStyleDeclaration>);

    const name = document.createElement('span');
    name.textContent = path;
    name.style.color = '#ccc';
    name.title = path;

    const input = document.createElement('input');
    input.type = 'color';
    input.value = initial;
    Object.assign(input.style, {
      background: 'transparent',
      border: '1px solid #444',
      borderRadius: '3px',
      width: '100%',
      height: '22px',
      padding: '0',
      cursor: 'pointer',
    } as Partial<CSSStyleDeclaration>);
    const apply = (): void => {
      try {
        mutateColor(
          colorsJson as unknown as Record<string, unknown>,
          path,
          input.value,
        );
        AssetRegistry.refresh();
      } catch (err) {
        console.warn('[DevPanel]', err);
        input.value = initial;
      }
    };
    input.addEventListener('input', apply);
    input.addEventListener('change', apply);

    row.appendChild(name);
    row.appendChild(input);
    return row;
  }
}

/**
 * 推断数值控件的 step：
 *   - 看上去像"秒数 / 浮点系数"（含小数）→ 0.1
 *   - 整数 → 1
 */
function inferStep(value: number): string {
  return Number.isInteger(value) ? '1' : '0.1';
}
