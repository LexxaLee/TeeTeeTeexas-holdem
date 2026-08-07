/**
 * 事件系统 - 触摸事件分发
 */

class EventSystem {
  constructor() {
    this.listeners = []; // [{ x, y, w, h, onTap, onDown, onUp, onMove, id }]
    this.touchStartPos = null;
    this.pressedId = null;
  }

  /**
   * 注册可点击区域
   */
  register(id, area, callbacks) {
    // 移除同ID的旧注册
    this.listeners = this.listeners.filter(l => l.id !== id);
    this.listeners.push({
      id,
      x: area.x,
      y: area.y,
      w: area.w,
      h: area.h,
      onTap: callbacks.onTap || null,
      onDown: callbacks.onDown || null,
      onUp: callbacks.onUp || null,
      onMove: callbacks.onMove || null
    });
  }

  /**
   * 移除注册
   */
  unregister(id) {
    this.listeners = this.listeners.filter(l => l.id !== id);
  }

  /**
   * 清除所有注册
   */
  clear() {
    this.listeners = [];
  }

  /**
   * 检查点是否在区域内
   */
  _hitTest(x, y, listener) {
    return x >= listener.x && x <= listener.x + listener.w &&
           y >= listener.y && y <= listener.y + listener.h;
  }

  /**
   * 触摸开始
   */
  onTouchStart(x, y) {
    this.touchStartPos = { x, y };

    // 从后往前检查（后面的在上层）
    for (let i = this.listeners.length - 1; i >= 0; i--) {
      const l = this.listeners[i];
      if (this._hitTest(x, y, l)) {
        this.pressedId = l.id;
        if (l.onDown) l.onDown();
        break;
      }
    }
  }

  /**
   * 触摸移动
   */
  onTouchMove(x, y) {
    if (this.pressedId !== null) {
      const l = this.listeners.find(l => l.id === this.pressedId);
      if (l && l.onMove) l.onMove(x, y);
    }
  }

  /**
   * 触摸结束
   */
  onTouchEnd(x, y) {
    if (this.touchStartPos) {
      const dx = Math.abs(x - this.touchStartPos.x);
      const dy = Math.abs(y - this.touchStartPos.y);

      // 判定为点击（移动距离小于阈值）
      if (dx < 15 && dy < 15) {
        for (let i = this.listeners.length - 1; i >= 0; i--) {
          const l = this.listeners[i];
          if (this._hitTest(x, y, l) && l.onTap) {
            l.onTap();
            break;
          }
        }
      }
    }

    // 触发 onUp
    if (this.pressedId !== null) {
      const l = this.listeners.find(l => l.id === this.pressedId);
      if (l && l.onUp) l.onUp();
    }

    this.pressedId = null;
    this.touchStartPos = null;
  }
}

module.exports = EventSystem;
