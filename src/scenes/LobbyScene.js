/**
 * 大厅场景
 * 三个按钮：创建房间 / 加入房间 / AI快速开始
 * 金钱信用条可点击跳转个人信息
 */

const { UI } = require('../config');

class LobbyScene {
  constructor(renderer, events, game) {
    this.renderer = renderer;
    this.events = events;
    this.game = game;
    this.pressedBtn = null;
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
    const btnW = w * 0.7;
    const btnH = 52;
    const gap = 16;
    const startX = (w - btnW) / 2;
    const startY = h * 0.36;

    // 创建房间
    this.events.register('btn_create', {
      x: startX, y: startY, w: btnW, h: btnH
    }, {
      onTap: () => this.game.switchScene('createRoom'),
      onDown: () => { this.pressedBtn = 'btn_create'; },
      onUp: () => { this.pressedBtn = null; }
    });

    // 加入房间
    this.events.register('btn_join', {
      x: startX, y: startY + btnH + gap, w: btnW, h: btnH
    }, {
      onTap: () => this.game.showJoinRoomDialog(),
      onDown: () => { this.pressedBtn = 'btn_join'; },
      onUp: () => { this.pressedBtn = null; }
    });

    // AI快速开始
    this.events.register('btn_ai', {
      x: startX, y: startY + (btnH + gap) * 2, w: btnW, h: btnH
    }, {
      onTap: () => this.game.startAIQuickGame(),
      onDown: () => { this.pressedBtn = 'btn_ai'; },
      onUp: () => { this.pressedBtn = null; }
    });

    // 个人信息（点击金钱信用条）
    this.events.register('btn_info', {
      x: 20, y: h * 0.2, w: w - 40, h: 56
    }, {
      onTap: () => this.game.showProfile(),
      onDown: () => { this.pressedBtn = 'btn_info'; },
      onUp: () => { this.pressedBtn = null; }
    });

    // 头像（点击触发微信授权）
    this.events.register('btn_avatar', {
      x: w - 50, y: 20, w: 36, h: 36
    }, {
      onTap: () => {
        this.game.tryGetWeChatProfile();
      }
    });

    // 地下钱庄按钮
    this.events.register('btn_bank', {
      x: startX, y: startY + (btnH + gap) * 3, w: btnW, h: btnH
    }, {
      onTap: () => this.game.showLoanCenter(),
      onDown: () => { this.pressedBtn = 'btn_bank'; },
      onUp: () => { this.pressedBtn = null; }
    });

    // 服务器设置按钮（右下角齿轮）
    this.events.register('btn_settings', {
      x: w - 44, y: h - 44, w: 32, h: 32
    }, {
      onTap: () => this.game.showServerSettings()
    });
  }

  update(dt) {
    // 动画更新
  }

  render() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;

    // 背景
    r.gradientBg(0, 0, w, h, '#0d1b0d', '#1a3a1a');

    // 标题
    r.ctx.fillStyle = UI.COLORS.GOLD;
    r.ctx.font = 'bold 28px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText('德州扑克', w / 2, h * 0.12);

    r.ctx.fillStyle = 'rgba(255,255,255,0.5)';
    r.ctx.font = '12px sans-serif';
    r.ctx.fillText("Texas Hold'em Poker", w / 2, h * 0.12 + 26);

    // 玩家信息条（可点击）
    const infoY = h * 0.2;
    const infoPressed = this.pressedBtn === 'btn_info';
    r.roundRect(20, infoY, w - 40, 56, 12);
    r.ctx.fillStyle = infoPressed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)';
    r.ctx.fill();
    r.ctx.strokeStyle = infoPressed ? 'rgba(255,215,0,0.6)' : 'rgba(255,215,0,0.3)';
    r.ctx.lineWidth = 1;
    r.ctx.stroke();

    const profile = this.game.playerData.getProfile();
    const economy = this.game.playerData.economy.getInfo();

    // 筹码（正数金色，负数红色）
    const coinsDisplay = economy.coins;
    r.ctx.fillStyle = coinsDisplay < 0 ? UI.COLORS.RED : UI.COLORS.GOLD;
    r.ctx.font = 'bold 20px sans-serif';
    r.ctx.textAlign = 'left';
    r.ctx.fillText('筹码: ' + coinsDisplay, 36, infoY + 20);

    // 欠款/日供信息
    if (economy.hasDebt) {
      r.ctx.fillStyle = UI.COLORS.RED;
      r.ctx.font = 'bold 11px sans-serif';
      r.ctx.fillText('欠款: ' + economy.loanBalance + ' | 日供: ' + economy.dailyPayment + '/局', 36, infoY + 42);
    } else {
      r.ctx.fillStyle = 'rgba(255,255,255,0.5)';
      r.ctx.font = '11px sans-serif';
      r.ctx.fillText('点击查看详细信息 >', 36, infoY + 42);
    }

    // 胜率
    r.ctx.fillStyle = 'rgba(255,255,255,0.5)';
    r.ctx.font = '12px sans-serif';
    r.ctx.textAlign = 'right';
    r.ctx.fillText('胜率: ' + profile.winRate + '% | 局数: ' + profile.handsPlayed, w - 36, infoY + 42);

    // 按钮组
    const btnW = w * 0.7;
    const btnH = 52;
    const gap = 16;
    const startX = (w - btnW) / 2;
    const startY = h * 0.36;

    r.drawButton(startX, startY, btnW, btnH, '创建房间', {
      pressed: this.pressedBtn === 'btn_create',
      bgColor: UI.COLORS.GREEN,
      fontSize: 18
    });

    r.drawButton(startX, startY + btnH + gap, btnW, btnH, '加入房间', {
      pressed: this.pressedBtn === 'btn_join',
      bgColor: UI.COLORS.BLUE,
      fontSize: 18
    });

    r.drawButton(startX, startY + (btnH + gap) * 2, btnW, btnH, 'AI 练习', {
      pressed: this.pressedBtn === 'btn_ai',
      bgColor: '#8e44ad',
      fontSize: 18
    });

    // 地下钱庄按钮
    r.drawButton(startX, startY + (btnH + gap) * 3, btnW, btnH, '地下钱庄', {
      pressed: this.pressedBtn === 'btn_bank',
      bgColor: '#c0392b',
      fontSize: 18
    });

    // 模式说明
    r.ctx.fillStyle = 'rgba(255,255,255,0.35)';
    r.ctx.font = '10px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    r.ctx.fillText('创建/加入 = 真实金币（钱庄+借贷，随时退）', w / 2, startY + btnH - 16);
    r.ctx.fillText('AI练习 = 真实金币，赢的钱可还债/攒着打好友局', w / 2, startY + (btnH + gap) * 2 + btnH - 16);

    // 头像
    r.drawAvatar(w - 50, 20, 36, profile.avatar, false, profile.nickname);

    // 底部提示
    r.ctx.fillStyle = 'rgba(255,255,255,0.3)';
    r.ctx.font = '11px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.fillText('v1.0 | 纯娱乐 · 不涉及真实货币', w / 2, h - 20);

    // 服务器设置按钮（右下角齿轮）
    r.ctx.fillStyle = 'rgba(255,255,255,0.4)';
    r.ctx.font = '20px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText('\u2699', w - 28, h - 28);
  }
}

module.exports = LobbyScene;
