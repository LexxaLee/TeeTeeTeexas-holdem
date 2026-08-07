/**
 * 场景管理器
 * 负责场景切换和渲染循环
 */

class SceneManager {
  constructor(renderer, eventSystem) {
    this.renderer = renderer;
    this.events = eventSystem;
    this.currentScene = null;
    this.scenes = {};
    this.running = false;
    this.lastTime = 0;
  }

  register(name, scene) {
    this.scenes[name] = scene;
  }

  switchTo(name, params) {
    if (this.currentScene && this.currentScene.onExit) {
      this.currentScene.onExit();
    }
    this.events.clear();
    this.currentScene = this.scenes[name];
    if (this.currentScene && this.currentScene.onEnter) {
      this.currentScene.onEnter(params);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = Date.now();
    this._loop();
  }

  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;

    const now = Date.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    if (this.currentScene) {
      if (this.currentScene.update) {
        this.currentScene.update(dt);
      }
      if (this.currentScene.render) {
        this.currentScene.render();
      }
    }

    // 下一帧
    requestAnimationFrame(() => this._loop());
  }
}

module.exports = SceneManager;
