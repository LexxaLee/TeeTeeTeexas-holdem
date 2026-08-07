/**
 * 创建房间场景
 * 设置：总人数、AI数量、AI初始筹码、盲注、AI难度
 *
 * 约束规则：
 * - 总人数 2~6
 * - AI数量 0 ~ (总人数-1)，至少保留1个真人座位
 * - 调小总人数时，AI数量自动收敛
 * - 其余座位留给联网好友（本地模式由AI补位已生成的AI数，未生成部分待联网）
 */

const { UI, ROOM_CONFIG, AI_DIFFICULTY } = require('../config');

class CreateRoomScene {
  constructor(renderer, events, game) {
    this.renderer = renderer;
    this.events = game.events || events;
    this.game = game;
    this.pressedBtn = null;

    // 房间设置
    this.settings = {
      maxPlayers: ROOM_CONFIG.DEFAULT_MAX_PLAYERS,  // 总人数
      initialChips: ROOM_CONFIG.DEFAULT_INITIAL_CHIPS, // AI初始筹码（玩家用真实金币）
      smallBlind: ROOM_CONFIG.DEFAULT_SMALL_BLIND,
      bigBlind: ROOM_CONFIG.DEFAULT_BIG_BLIND,
      aiCount: 3,  // AI数量
      aiDifficulty: AI_DIFFICULTY.NORMAL
    };
  }

  onEnter() {
    this._registerButtons();
  }

  onExit() {
    this.events.clear();
  }

  _registerButtons() {
    const w = this.renderer.width;
    const h = this.renderer.height;
    const startY = 90;
    const rowH = 50;
    const margin = 20;

    // 返回
    this.events.register('btn_back', {
      x: 10, y: 10, w: 36, h: 36
    }, {
      onTap: () => this.game.switchScene('lobby')
    });

    // 总人数 - 减
    this.events.register('players_minus', {
      x: w - margin - 100, y: startY, w: 32, h: 32
    }, {
      onTap: () => this._adjust('maxPlayers', -1, ROOM_CONFIG.MIN_PLAYERS, 6)
    });

    // 总人数 - 加
    this.events.register('players_plus', {
      x: w - margin - 36, y: startY, w: 32, h: 32
    }, {
      onTap: () => this._adjust('maxPlayers', 1, ROOM_CONFIG.MIN_PLAYERS, 6)
    });

    // AI数量 - 减
    this.events.register('ai_count_minus', {
      x: w - margin - 100, y: startY + rowH, w: 32, h: 32
    }, {
      onTap: () => this._adjust('aiCount', -1, 0, this.settings.maxPlayers - 1)
    });

    // AI数量 - 加（动态上限：总人数-1）
    this.events.register('ai_count_plus', {
      x: w - margin - 36, y: startY + rowH, w: 32, h: 32
    }, {
      onTap: () => this._adjust('aiCount', 1, 0, this.settings.maxPlayers - 1)
    });

    // AI初始筹码 - 减/加
    this.events.register('chips_minus', {
      x: w - margin - 100, y: startY + rowH * 2, w: 32, h: 32
    }, {
      onTap: () => this._adjust('initialChips', -500, 500, 100000)
    });

    this.events.register('chips_plus', {
      x: w - margin - 36, y: startY + rowH * 2, w: 32, h: 32
    }, {
      onTap: () => this._adjust('initialChips', 500, 500, 100000)
    });

    // 小盲 - 减/加
    this.events.register('sb_minus', {
      x: w - margin - 100, y: startY + rowH * 3, w: 32, h: 32
    }, {
      onTap: () => this._adjust('smallBlind', -5, 1, 1000)
    });

    this.events.register('sb_plus', {
      x: w - margin - 36, y: startY + rowH * 3, w: 32, h: 32
    }, {
      onTap: () => this._adjust('smallBlind', 5, 1, 1000)
    });

    // 大盲 - 减/加
    this.events.register('bb_minus', {
      x: w - margin - 100, y: startY + rowH * 4, w: 32, h: 32
    }, {
      onTap: () => this._adjust('bigBlind', -10, 2, 2000)
    });

    this.events.register('bb_plus', {
      x: w - margin - 36, y: startY + rowH * 4, w: 32, h: 32
    }, {
      onTap: () => this._adjust('bigBlind', 10, 2, 2000)
    });

    // AI难度选择
    const difficulties = [
      { key: AI_DIFFICULTY.BEGINNER, label: '新手' },
      { key: AI_DIFFICULTY.NORMAL, label: '普通' },
      { key: AI_DIFFICULTY.EXPERT, label: '高手' },
      { key: AI_DIFFICULTY.PRO, label: '职业' }
    ];
    const diffStartX = margin + 80;
    const diffW = 52;
    difficulties.forEach((d, i) => {
      this.events.register('diff_' + d.key, {
        x: diffStartX + i * (diffW + 4), y: startY + rowH * 5, w: diffW, h: 28
      }, {
        onTap: () => { this.settings.aiDifficulty = d.key; }
      });
    });

    // 创建按钮
    this.events.register('btn_create', {
      x: margin, y: h - 70, w: w - margin * 2, h: 48
    }, {
      onTap: () => this._createRoom(),
      onDown: () => { this.pressedBtn = 'btn_create'; },
      onUp: () => { this.pressedBtn = null; }
    });
  }

  _adjust(key, delta, min, max) {
    this.settings[key] = Math.max(min, Math.min(max, this.settings[key] + delta));
    // 大盲至少是小盲的2倍
    if (key === 'smallBlind' && this.settings.bigBlind < this.settings.smallBlind * 2) {
      this.settings.bigBlind = this.settings.smallBlind * 2;
    }
    // 总人数变化后，AI数量收敛到 总人数-1 以内
    if (key === 'maxPlayers') {
      this.settings.aiCount = Math.min(this.settings.aiCount, this.settings.maxPlayers - 1);
    }
  }

  _createRoom() {
    // 最终保险：确保 AI数量 不超过 总人数-1
    this.settings.aiCount = Math.min(this.settings.aiCount, this.settings.maxPlayers - 1);
    this.game.createRoom(this.settings);
  }

  update(dt) {}

  render() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;
    const startY = 90;
    const rowH = 50;
    const margin = 20;

    r.gradientBg(0, 0, w, h, '#0d1b0d', '#1a2a1a');

    // 标题
    r.ctx.fillStyle = UI.COLORS.TEXT;
    r.ctx.font = 'bold 20px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText('创建房间', w / 2, 36);

    // 返回
    r.ctx.fillStyle = 'rgba(255,255,255,0.6)';
    r.ctx.font = '20px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.fillText('←', 28, 28);

    // 设置项
    this._drawSettingRow('总人数', this.settings.maxPlayers + '人', startY, '（2~6）');
    this._drawSettingRow('AI数量', this.settings.aiCount + '个', startY + rowH, '（最多' + (this.settings.maxPlayers - 1) + '个）');
    this._drawSettingRow('AI初始筹码', this.settings.initialChips, startY + rowH * 2);
    this._drawSettingRow('小盲注', this.settings.smallBlind, startY + rowH * 3);
    this._drawSettingRow('大盲注', this.settings.bigBlind, startY + rowH * 4);

    // AI难度
    r.ctx.fillStyle = 'rgba(255,255,255,0.7)';
    r.ctx.font = '14px sans-serif';
    r.ctx.textAlign = 'left';
    r.ctx.fillText('AI难度', margin, startY + rowH * 5 + 14);

    const difficulties = [
      { key: AI_DIFFICULTY.BEGINNER, label: '新手' },
      { key: AI_DIFFICULTY.NORMAL, label: '普通' },
      { key: AI_DIFFICULTY.EXPERT, label: '高手' },
      { key: AI_DIFFICULTY.PRO, label: '职业' }
    ];
    const diffStartX = margin + 80;
    const diffW = 52;
    difficulties.forEach((d, i) => {
      const x = diffStartX + i * (diffW + 4);
      const y = startY + rowH * 5;
      const selected = this.settings.aiDifficulty === d.key;
      r.drawButton(x, y, diffW, 28, d.label, {
        bgColor: selected ? UI.COLORS.GREEN : 'rgba(255,255,255,0.15)',
        fontSize: 12
      });
    });

    // 约束提示
    const friendSeats = this.settings.maxPlayers - 1 - this.settings.aiCount;
    r.ctx.fillStyle = 'rgba(255,255,255,0.4)';
    r.ctx.font = '11px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    if (friendSeats > 0) {
      r.ctx.fillText('你 + ' + this.settings.aiCount + '个AI，另有' + friendSeats + '个座位留给联网好友', w / 2, startY + rowH * 6 + 6);
    } else {
      r.ctx.fillText('你 + ' + this.settings.aiCount + '个AI，满座（纯AI对战）', w / 2, startY + rowH * 6 + 6);
    }

    // 创建按钮
    r.drawButton(margin, h - 70, w - margin * 2, 48, '创建房间并开始', {
      pressed: this.pressedBtn === 'btn_create',
      bgColor: UI.COLORS.GREEN,
      fontSize: 18
    });
  }

  _drawSettingRow(label, value, y, hint) {
    const r = this.renderer;
    const w = r.width;
    const margin = 20;

    // 背景行
    r.roundRect(margin, y, w - margin * 2, 40, 8);
    r.ctx.fillStyle = 'rgba(255,255,255,0.05)';
    r.ctx.fill();

    // 标签
    r.ctx.fillStyle = 'rgba(255,255,255,0.8)';
    r.ctx.font = '14px sans-serif';
    r.ctx.textAlign = 'left';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(label, margin + 12, y + 20);

    // 提示（小字）
    if (hint) {
      r.ctx.fillStyle = 'rgba(255,255,255,0.35)';
      r.ctx.font = '10px sans-serif';
      r.ctx.textAlign = 'left';
      r.ctx.fillText(hint, margin + 12, y + 34);
    }

    // 值
    r.ctx.fillStyle = UI.COLORS.GOLD;
    r.ctx.font = 'bold 14px sans-serif';
    r.ctx.textAlign = 'right';
    r.ctx.fillText(value.toString(), w - margin - 112, y + 20);

    // 减/加按钮
    r.drawButton(w - margin - 100, y + 4, 32, 32, '−', {
      bgColor: 'rgba(255,255,255,0.15)',
      fontSize: 18
    });
    r.drawButton(w - margin - 36, y + 4, 32, 32, '+', {
      bgColor: 'rgba(255,255,255,0.15)',
      fontSize: 18
    });
  }
}

module.exports = CreateRoomScene;
