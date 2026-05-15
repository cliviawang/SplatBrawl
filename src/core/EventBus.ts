/**
 * 极简事件总线。逻辑层 → 渲染层单向广播。
 * 不依赖 Phaser，便于在 Node.js 环境（联机服务端）下复用。
 */
type Handler = (...args: unknown[]) => void;

export class EventBus {
  private map = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(handler);
  }

  off(event: string, handler: Handler): void {
    this.map.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.map.get(event)?.forEach((h) => h(...args));
  }
}
