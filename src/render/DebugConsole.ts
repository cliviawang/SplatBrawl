import Phaser from 'phaser';
import { listSkills, hasSkill } from '@/core/skills/registry';

/**
 * 调试控制台：浮在 canvas 上的命令行输入框，仅供开发期使用。
 *
 * 触发：按 `（反引号）呼出，再次按下或 Esc 关闭；Enter 执行命令并关闭。
 *
 * 已支持命令：
 *   s <编号|id>   强制下一次拾取/当前槽位为指定技能（编号取自 listSkills() 顺序）
 *   s off         取消强制，恢复随机
 *   help          打印命令列表（输出到浏览器 console）
 *
 * 实现要点：
 *   - 不依赖 core/，仅读取 listSkills() 来识别合法 id
 *   - 强制状态存在本类，外部通过 getForceSkillId() 读取
 *   - 整个类用 import.meta.env.DEV 守护就够生产剥离；当前先做开发期可用
 */
export class DebugConsole {
  private input: HTMLInputElement;
  private hint: HTMLDivElement;
  private forceSkillId: string | null = null;
  private aiFrozen = false;
  private opened = false;

  constructor(scene: Phaser.Scene) {
    // 输入框：Phaser canvas 之外的独立 DOM，定位在画布底部中间
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = "调试命令（s <编号|id> / s off / ai on|off / help）";
    input.spellcheck = false;
    input.autocomplete = 'off';
    Object.assign(input.style, {
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      transform: 'translateX(-50%)',
      width: 'min(560px, 70vw)',
      padding: '8px 12px',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '14px',
      color: '#00ff88',
      background: 'rgba(0,0,0,0.85)',
      border: '1px solid #00ff88',
      borderRadius: '4px',
      outline: 'none',
      display: 'none',
      zIndex: '99999',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(input);
    this.input = input;

    // 小提示条（可选）：呼出时显示在输入框上方，列出技能编号
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed',
      left: '50%',
      bottom: '64px',
      transform: 'translateX(-50%)',
      width: 'min(560px, 70vw)',
      padding: '6px 10px',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: '12px',
      color: '#cccccc',
      background: 'rgba(0,0,0,0.75)',
      border: '1px solid #444',
      borderRadius: '4px',
      display: 'none',
      whiteSpace: 'pre-wrap',
      zIndex: '99999',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(hint);
    this.hint = hint;

    // 全局键盘监听：Phaser 的 input.keyboard 在 input 框聚焦时不会派发，所以走 window
    window.addEventListener('keydown', this.handleKey);

    // 输入框 Enter / Esc
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.execute(input.value.trim());
        this.close();
      } else if (e.key === 'Escape' || e.key === '`') {
        e.preventDefault();
        this.close();
      }
      // 阻止冒泡到 Phaser，避免误触游戏快捷键
      e.stopPropagation();
    });

    // 场景销毁时清理 DOM（避免热重载时残留）
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
  }

  /** 当前强制的技能 id；null 表示未启用 */
  getForceSkillId(): string | null {
    return this.forceSkillId;
  }

  /** AI 是否被冻结（true = AI 玩家原地静止、不冲刺、不主动放技能；技能槽保留以便被冲刺抢） */
  isAiFrozen(): boolean {
    return this.aiFrozen;
  }

  private handleKey = (e: KeyboardEvent): void => {
    // 只响应反引号呼出 / 关闭
    if (e.key === '`') {
      e.preventDefault();
      if (this.opened) this.close();
      else this.open();
    }
  };

  private open(): void {
    this.opened = true;
    this.refreshHint();
    this.input.style.display = 'block';
    this.hint.style.display = 'block';
    this.input.value = '';
    // 推迟 focus，避开 keydown 同帧的 ` 字符注入
    setTimeout(() => this.input.focus(), 0);
  }

  private close(): void {
    this.opened = false;
    this.input.style.display = 'none';
    this.hint.style.display = 'none';
    this.input.blur();
  }

  /** 解析并执行一行命令 */
  private execute(line: string): void {
    if (!line) return;
    const tokens = line.split(/\s+/);
    const cmd = tokens[0]?.toLowerCase();
    switch (cmd) {
      case 's':
      case 'skill':
        this.cmdSkill(tokens.slice(1));
        break;
      case 'ai':
        this.cmdAi(tokens.slice(1));
        break;
      case 'help':
      case '?':
        console.log(
          [
            '调试命令：',
            '  s <编号|id>   强制下次拾取/当前槽位为该技能',
            '  s off          取消强制',
            '  ai on|off      启停 AI（off=AI 静止但保留技能槽，便于测试冲刺抢技能）',
            '  ai             切换 AI 启停',
            '  help           显示本帮助',
            '当前已注册技能：' + this.formatSkillList(),
          ].join('\n'),
        );
        break;
      default:
        console.warn(`[DebugConsole] 未知命令: ${cmd}`);
    }
  }

  private cmdSkill(args: string[]): void {
    const arg = args[0];
    if (!arg) {
      console.warn('[DebugConsole] 用法: s <编号|id> | s off');
      return;
    }
    if (arg.toLowerCase() === 'off') {
      this.forceSkillId = null;
      console.log('[DebugConsole] 已取消强制技能');
      return;
    }
    const skills = listSkills();
    let target: string | null = null;
    // 支持纯数字编号
    if (/^\d+$/.test(arg)) {
      const idx = parseInt(arg, 10) - 1;
      if (idx < 0 || idx >= skills.length) {
        console.warn(
          `[DebugConsole] 编号越界（共 ${skills.length} 个）。可选: ${this.formatSkillList()}`,
        );
        return;
      }
      target = skills[idx];
    } else {
      // 当作 id
      if (!hasSkill(arg)) {
        console.warn(
          `[DebugConsole] 未知技能 id: ${arg}。可选: ${this.formatSkillList()}`,
        );
        return;
      }
      target = arg;
    }
    this.forceSkillId = target;
    console.log(`[DebugConsole] 已强制技能: ${target}`);
  }

  /**
   * ai 命令：on / off / 无参（toggle）
   * 冻结时 MatchScene 会给所有 AI 玩家投递零意图，AI 原地静止；
   * 但 GameState.players[i].skillSlot 不受影响 —— 冲刺撞上去仍能抢技能。
   */
  private cmdAi(args: string[]): void {
    const arg = args[0]?.toLowerCase();
    if (arg === 'on') this.aiFrozen = false;
    else if (arg === 'off') this.aiFrozen = true;
    else if (!arg) this.aiFrozen = !this.aiFrozen;
    else {
      console.warn('[DebugConsole] 用法: ai on | ai off | ai');
      return;
    }
    console.log(`[DebugConsole] AI 状态: ${this.aiFrozen ? 'FROZEN' : 'RUNNING'}`);
  }

  /** 控制台呼出时填充提示条文本 */
  private refreshHint(): void {
    const force = this.forceSkillId ? ` | FORCE: ${this.forceSkillId}` : '';
    const ai = ` | AI: ${this.aiFrozen ? 'FROZEN' : 'RUNNING'}`;
    this.hint.textContent = `skills  ${this.formatSkillList()}${force}${ai}`;
  }

  private formatSkillList(): string {
    return listSkills()
      .map((id, i) => `${i + 1}:${id}`)
      .join('  ');
  }

  private destroy(): void {
    window.removeEventListener('keydown', this.handleKey);
    this.input.remove();
    this.hint.remove();
  }
}
