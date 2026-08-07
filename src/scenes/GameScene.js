/**
 * 游戏桌面场景
 * 左侧：玩家信息（头像、筹码、手牌）
 * 中间：公共牌 + 底池
 * 右侧：AI对手信息
 * 底部：操作按钮
 */

const { UI, ACTION, PHASE, PLAYER_STATUS, HAND_RANK_NAMES, SUIT_SYMBOLS, RANK_NAMES } = require('../config');

// 手机安全区域偏移（刘海/状态栏），所有顶部元素统一加此偏移
const TOP_SAFE = 28;

class GameScene {
  constructor(renderer, events, game) {
    this.renderer = renderer;
    this.events = events;
    this.game = game;

    this.pressedBtn = null;
    this.raiseAmount = 0;
    this.showRaisePanel = false;
    this.showRepayPanel = false;
    this.repayAmount = 0;
    this.message = '';
    this.messageTimer = 0;
    this.actionLog = [];
    this.aiThinking = false;
    this.countdown = 0;
    this.tauntText = '';
    this.tauntTimer = 0;
    this.tauntSeatIndex = -1;
    this._nextBtnRegistered = false;
    this.showMenu = false; // 顶部菜单下拉开关
  }

  onEnter(params) {
    this.params = params || {};
    this.showRaisePanel = false;
    this.showRepayPanel = false;
    this.showMenu = false;
    this.raiseAmount = 0;
    this.repayAmount = 0;
    this._registerButtons();
  }

  onExit() {
    this.events.clear();
  }

  // ==================== 按钮注册 ====================

  _registerButtons() {
    const w = this.renderer.width;

    // 操作按钮
    this._registerActionButtons();

    // 返回大厅（安全区域偏移，避免刘海遮挡）
    this.events.register('btn_back', {
      x: 8, y: TOP_SAFE, w: 34, h: 34
    }, {
      onTap: () => {
        if (this.game.tryExitGame()) {
          this.game.leaveOnlineIfAny();
          this.game.switchScene('lobby');
        }
      }
    });

    // 菜单按钮 ☰ （右上角，始终可见）
    this.events.register('btn_menu', {
      x: w - 44, y: TOP_SAFE, w: 36, h: 30
    }, {
      onTap: () => {
        this.showMenu = !this.showMenu;
        if (this.showMenu) {
          this._registerMenuItems();
        } else {
          this._unregisterMenuItems();
        }
      },
      onDown: () => { this.pressedBtn = 'btn_menu'; },
      onUp: () => { this.pressedBtn = null; }
    });

    // 菜单展开时注册菜单项；关闭时注销
    if (this.showMenu) {
      this._registerMenuItems();
    }

    this._registerRaisePanelButtons();
    this._registerRepayPanelButtons();
  }

  _registerMenuItems() {
    const w = this.renderer.width;
    // 菜单面板从右上角向下展开
    const panelX = w - 152;
    const panelY = TOP_SAFE + 34;
    const itemH = 36;
    const itemGap = 4;
    let idx = 0;

    // 邀请按钮（仅联机房间）
    if (this.game.roomId) {
      this.events.register('btn_share', {
        x: panelX + 8, y: panelY + 8 + idx * (itemH + itemGap), w: 136, h: itemH
      }, {
        onTap: () => {
          this.game.shareRoom();
          this.showMenu = false;
          this._unregisterMenuItems();
        },
        onDown: () => { this.pressedBtn = 'btn_share'; },
        onUp: () => { this.pressedBtn = null; }
      });
      idx++;
    }

    // 钱庄按钮（所有模式都显示，均可借贷/还款）
    this.events.register('btn_loan', {
      x: panelX + 8, y: panelY + 8 + idx * (itemH + itemGap), w: 136, h: itemH
    }, {
      onTap: () => {
        this.game.showInGameLoan();
        this.showMenu = false;
        this._unregisterMenuItems();
      },
      onDown: () => { this.pressedBtn = 'btn_loan'; },
      onUp: () => { this.pressedBtn = null; }
    });
  }

  _unregisterMenuItems() {
    this.events.unregister('btn_share');
    this.events.unregister('btn_loan');
  }

  _registerRaisePanelButtons() {
    const w = this.renderer.width;
    const h = this.renderer.height;
    const panelW = 280;
    const panelX = Math.floor((w - panelW) / 2);
    const panelY = Math.floor(h * 0.25);

    this.events.register('btn_raise_minus', {
      x: panelX + 10, y: panelY + 55, w: 40, h: 40
    }, {
      onTap: () => { if (this.showRaisePanel) this._adjustRaise(-100); },
      onDown: () => { this.pressedBtn = 'btn_raise_minus'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_raise_plus', {
      x: panelX + panelW - 50, y: panelY + 55, w: 40, h: 40
    }, {
      onTap: () => { if (this.showRaisePanel) this._adjustRaise(100); },
      onDown: () => { this.pressedBtn = 'btn_raise_plus'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_raise_half', {
      x: panelX + 10, y: panelY + 105, w: 80, h: 30
    }, {
      onTap: () => { if (this.showRaisePanel) this._setRaiseToHalfPot(); },
      onDown: () => { this.pressedBtn = 'btn_raise_half'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_raise_pot', {
      x: panelX + 100, y: panelY + 105, w: 80, h: 30
    }, {
      onTap: () => { if (this.showRaisePanel) this._setRaiseToPot(); },
      onDown: () => { this.pressedBtn = 'btn_raise_pot'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_raise_max', {
      x: panelX + 190, y: panelY + 105, w: 80, h: 30
    }, {
      onTap: () => { if (this.showRaisePanel) this._setRaiseToMax(); },
      onDown: () => { this.pressedBtn = 'btn_raise_max'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_raise_confirm', {
      x: panelX + panelW / 2 + 10, y: panelY + 145, w: 100, h: 36
    }, {
      onTap: () => { if (this.showRaisePanel) this._confirmRaise(); },
      onDown: () => { this.pressedBtn = 'btn_raise_confirm'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_raise_cancel', {
      x: panelX + panelW / 2 - 110, y: panelY + 145, w: 100, h: 36
    }, {
      onTap: () => { this.showRaisePanel = false; },
      onDown: () => { this.pressedBtn = 'btn_raise_cancel'; },
      onUp: () => { this.pressedBtn = null; }
    });
  }

  _registerRepayPanelButtons() {
    const w = this.renderer.width;
    const rPanelW = 300;
    const rPanelX = Math.floor((w - rPanelW) / 2);
    const rPanelY = 90;

    this.events.register('btn_repay_minus', {
      x: rPanelX + 15, y: rPanelY + 120, w: 40, h: 40
    }, {
      onTap: () => { if (this.showRepayPanel) this._adjustRepay(-100); },
      onDown: () => { this.pressedBtn = 'btn_repay_minus'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_repay_plus', {
      x: rPanelX + rPanelW - 55, y: rPanelY + 120, w: 40, h: 40
    }, {
      onTap: () => { if (this.showRepayPanel) this._adjustRepay(100); },
      onDown: () => { this.pressedBtn = 'btn_repay_plus'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_repay_all', {
      x: rPanelX + 15, y: rPanelY + 170, w: 85, h: 30
    }, {
      onTap: () => { if (this.showRepayPanel) this._setRepayToMax(); },
      onDown: () => { this.pressedBtn = 'btn_repay_all'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_repay_half', {
      x: rPanelX + 107, y: rPanelY + 170, w: 85, h: 30
    }, {
      onTap: () => { if (this.showRepayPanel) this._setRepayToHalf(); },
      onDown: () => { this.pressedBtn = 'btn_repay_half'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_repay_custom', {
      x: rPanelX + 200, y: rPanelY + 170, w: 85, h: 30
    }, {
      onTap: () => { if (this.showRepayPanel) this._customRepay(); },
      onDown: () => { this.pressedBtn = 'btn_repay_custom'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_repay_cancel', {
      x: rPanelX + 30, y: rPanelY + 215, w: 110, h: 38
    }, {
      onTap: () => { this.showRepayPanel = false; },
      onDown: () => { this.pressedBtn = 'btn_repay_cancel'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_repay_confirm', {
      x: rPanelX + 160, y: rPanelY + 215, w: 110, h: 38
    }, {
      onTap: () => { if (this.showRepayPanel) this._confirmRepay(); },
      onDown: () => { this.pressedBtn = 'btn_repay_confirm'; },
      onUp: () => { this.pressedBtn = null; }
    });
  }

  // ==================== 更新循环 ====================

  update(dt) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
    }
    if (this.tauntTimer > 0) {
      this.tauntTimer -= dt;
    }
    this._updateNextButton();
  }

  _updateNextButton() {
    const game = this.game.gameLogic;
    if (!game) return;

    // 联机模式：服务器自动推进下一局，客户端不注册"下一局"按钮
    if (this.game.isOnline) {
      if (this._nextBtnRegistered) {
        this.events.unregister('btn_next');
        this._nextBtnRegistered = false;
      }
      return;
    }

    if (game.isHandOver && !this._nextBtnRegistered) {
      this.events.unregister('btn_fold');
      this.events.unregister('btn_call');
      this.events.unregister('btn_raise');
      this.events.unregister('btn_allin');

      const w = this.renderer.width;
      const h = this.renderer.height;
      const btnY = h - 70;
      this.events.register('btn_next', {
        x: w / 2 - 60, y: btnY, w: 120, h: 44
      }, {
        onTap: () => {
          if (game.isHandOver) {
            this.game.startNextHand();
          }
        },
        onDown: () => { this.pressedBtn = 'btn_next'; },
        onUp: () => { this.pressedBtn = null; }
      });
      this._nextBtnRegistered = true;
    } else if (!game.isHandOver && this._nextBtnRegistered) {
      this.events.unregister('btn_next');
      this._registerActionButtons();
      this._nextBtnRegistered = false;
    }
  }

  _registerActionButtons() {
    const w = this.renderer.width;
    const h = this.renderer.height;
    const btnY = h - 70;
    const btnH = 44;
    const btnW = Math.floor((w - 60) / 4);

    this.events.register('btn_fold', {
      x: 20, y: btnY, w: btnW, h: btnH
    }, {
      onTap: () => this._playerAction(ACTION.FOLD),
      onDown: () => { this.pressedBtn = 'btn_fold'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_call', {
      x: 20 + btnW + 8, y: btnY, w: btnW, h: btnH
    }, {
      onTap: () => this._playerAction(ACTION.CHECK_CALL),
      onDown: () => { this.pressedBtn = 'btn_call'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_raise', {
      x: 20 + (btnW + 8) * 2, y: btnY, w: btnW, h: btnH
    }, {
      onTap: () => this._toggleRaisePanel(),
      onDown: () => { this.pressedBtn = 'btn_raise'; },
      onUp: () => { this.pressedBtn = null; }
    });

    this.events.register('btn_allin', {
      x: 20 + (btnW + 8) * 3, y: btnY, w: btnW, h: btnH
    }, {
      onTap: () => this._playerAction(ACTION.ALL_IN),
      onDown: () => { this.pressedBtn = 'btn_allin'; },
      onUp: () => { this.pressedBtn = null; }
    });
  }

  // ==================== 渲染 ====================

  render() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;

    // 背景
    r.gradientBg(0, 0, w, h, '#0d1b0d', '#0a1209');

    // 中心桌面背景
    this._drawTableBg();

    // 中间 — 公共牌 + 底池（始终绘制，结算时作为桌面背景）
    this._drawCommunityCards();
    this._drawPot();

    const game = this.game.gameLogic;

    // 对局中：环绕牌桌绘制各座位（对手不显示手牌背面）
    // 结算时：弹出大牌结算遮罩
    if (game && game.isHandOver) {
      this._drawShowdown(game);
    } else if (game) {
      this._drawSeats(game);
    }

    // 顶部栏（始终在最上层，不遮挡）
    this._drawTopBar();

    // 底部操作按钮（结算时显示"下一局"，覆盖在遮罩之上，保持可点）
    this._drawActionButtons();

    // 加注面板
    if (this.showRaisePanel) {
      this._drawRaisePanel();
    }

    // 还款面板
    if (this.showRepayPanel) {
      this._drawRepayPanel();
    }

    // 消息提示
    if (this.messageTimer > 0) {
      this._drawMessage();
    }

    // 嘲讽气泡
    if (this.tauntTimer > 0) {
      this._drawTaunt();
    }
  }

  // ==================== 顶部栏 ====================

  _drawTopBar() {
    const r = this.renderer;
    const w = r.width;

    // 返回按钮
    r.ctx.fillStyle = 'rgba(255,255,255,0.7)';
    r.ctx.font = '22px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText('\u2039', 24, TOP_SAFE + 17);

    // 模式标签
    const mode = this.game.gameMode;
    let modeText, modeColor;
    if (mode === 'online') {
      modeText = '联机';
      modeColor = '#2980b9';
    } else if (mode === 'practice') {
      modeText = '练习';
      modeColor = '#8e44ad';
    } else {
      modeText = '金币';
      modeColor = UI.COLORS.GOLD;
    }

    r.roundRect(46, TOP_SAFE, 64, 24, 12);
    r.ctx.fillStyle = modeColor;
    r.ctx.globalAlpha = 0.3;
    r.ctx.fill();
    r.ctx.globalAlpha = 1;
    r.ctx.strokeStyle = modeColor;
    r.ctx.lineWidth = 1;
    r.ctx.stroke();

    r.ctx.fillStyle = modeColor;
    r.ctx.font = 'bold 12px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(modeText, 78, TOP_SAFE + 12);

    // 菜单按钮 ☰ （右上角，始终可见）
    r.drawButton(w - 44, TOP_SAFE, 36, 30, '\u2630', {
      pressed: this.pressedBtn === 'btn_menu',
      bgColor: 'rgba(40,50,40,0.8)',
      fontSize: 16
    });

    // 菜单下拉面板
    if (this.showMenu) {
      this._drawMenuPanel();
    }
  }

  _drawMenuPanel() {
    const r = this.renderer;
    const w = r.width;

    const panelW = 152;
    const panelX = w - panelW;
    const panelY = TOP_SAFE + 34;

    // 计算面板高度
    const items = [];
    if (this.game.roomId) {
      items.push({ type: 'room', label: '房间 ' + this.game.roomId });
      items.push({ type: 'share', label: '邀请好友' });
    }
    items.push({ type: 'loan', label: '钱庄' });

    const itemH = 36;
    const itemGap = 4;
    const panelH = 8 + items.length * (itemH + itemGap) + 8;

    // 半透明背景遮罩（点击空白处关闭菜单）
    r.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    r.ctx.fillRect(0, 0, w, this.renderer.height);

    // 面板背景
    r.roundRect(panelX, panelY, panelW, panelH, 10);
    r.ctx.fillStyle = 'rgba(20,30,20,0.95)';
    r.ctx.fill();
    r.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    r.ctx.lineWidth = 1;
    r.ctx.stroke();

    // 各菜单项
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const iy = panelY + 8 + i * (itemH + itemGap);

      // 项目背景
      const isPressed = (item.type === 'share' && this.pressedBtn === 'btn_share') ||
                        (item.type === 'loan' && this.pressedBtn === 'btn_loan');
      r.roundRect(panelX + 8, iy, panelW - 16, itemH, 6);
      r.ctx.fillStyle = isPressed ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)';
      r.ctx.fill();

      // 图标 + 文字
      let icon = '';
      let color = '#fff';
      if (item.type === 'room') {
        icon = '\u2316';
        color = UI.COLORS.GOLD;
      } else if (item.type === 'share') {
        icon = '\u2709';
        color = '#3498db';
      } else if (item.type === 'loan') {
        icon = '\u00a5';
        color = '#e67e22';
      }

      r.ctx.fillStyle = color;
      r.ctx.font = 'bold 14px sans-serif';
      r.ctx.textAlign = 'left';
      r.ctx.textBaseline = 'middle';
      r.ctx.fillText(icon + ' ' + item.label, panelX + 16, iy + itemH / 2);
    }
  }

  // ==================== 中心桌面 ====================

  _drawTableBg() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;

    // 居中椭圆桌面（座位环绕其分布）
    const cx = w / 2;
    const cy = h * 0.45;
    const rx = w * 0.46;
    const ry = h * 0.34;

    r.ctx.beginPath();
    r.ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    const grad = r.ctx.createRadialGradient(cx, cy, 10, cx, cy, rx);
    grad.addColorStop(0, 'rgba(45,90,45,0.45)');
    grad.addColorStop(1, 'rgba(31,74,31,0.22)');
    r.ctx.fillStyle = grad;
    r.ctx.fill();

    r.ctx.strokeStyle = 'rgba(58,40,23,0.5)';
    r.ctx.lineWidth = 3;
    r.ctx.stroke();

    // 内圈描边
    r.ctx.beginPath();
    r.ctx.ellipse(cx, cy, rx - 14, ry - 14, 0, 0, 2 * Math.PI);
    r.ctx.strokeStyle = 'rgba(120,90,50,0.35)';
    r.ctx.lineWidth = 1;
    r.ctx.stroke();
  }

  _drawCommunityCards() {
    const r = this.renderer;
    const w = r.width;
    const game = this.game.gameLogic;
    const community = game ? game.communityCards : [];
    const cardW = 46;
    const cardH = 64;
    const gap = 5;
    const totalW = 5 * cardW + 4 * gap;
    const startX = Math.floor((w - totalW) / 2);
    const y = Math.floor(this.renderer.height * 0.45) - Math.floor(cardH / 2);

    for (let i = 0; i < 5; i++) {
      const x = startX + i * (cardW + gap);
      const card = (community && i < community.length) ? community[i] : null;
      if (card) {
        const disp = this._cardFromAny(card);
        r.drawCard(x, y, cardW, cardH, disp, false);
      } else {
        r.roundRect(x, y, cardW, cardH, 5);
        r.ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        r.ctx.lineWidth = 1;
        r.ctx.stroke();
      }
    }
  }

  _drawPot() {
    const r = this.renderer;
    const w = r.width;
    const game = this.game.gameLogic;
    const potTotal = game ? Math.floor(game.pot.totalAmount) : 0;
    const centerX = w / 2;
    const cy = this.renderer.height * 0.45;

    // 阶段（牌桌上方）
    const phase = game ? game.phase : '';
    const phaseNames = {
      'preflop': '翻牌前', 'flop': '翻牌', 'turn': '转牌',
      'river': '河牌', 'showdown': '摊牌', 'handover': '本局结束'
    };
    r.ctx.fillStyle = 'rgba(255,255,255,0.55)';
    r.ctx.font = '12px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(phaseNames[phase] || '', centerX, cy - 70);

    // 底池（牌桌下方）— 局末底池已派彩，结算遮罩会展示赢家与金额，此处不再显示
    if (potTotal > 0 && !game.isHandOver) {
      r.ctx.fillStyle = UI.COLORS.GOLD;
      r.ctx.font = 'bold 16px sans-serif';
      r.ctx.fillText('底池 ' + potTotal, centerX, cy + 64);
      r.drawChip(centerX - 42, cy + 64, 9, potTotal);
    }
  }

  // ==================== 座位布局 ====================

  /**
   * 计算每位玩家的屏幕坐标
   * 自己固定在底部中央；其余对手沿牌桌上方圆弧均匀分布。
   * @returns {object} seatIndex => { x, y, role }
   */
  _seatPositions(game) {
    const w = this.renderer.width;
    const h = this.renderer.height;
    const positions = {};
    const mySeat = this.game.mySeatIndex;

    // 自己：底部中央
    positions[mySeat] = { x: w / 2, y: h - 237, role: 'hero' };

    // 对手：上方圆弧
    const opp = [];
    for (let i = 0; i < game.players.length; i++) {
      if (i !== mySeat) opp.push(i);
    }
    const k = opp.length;
    const cx = w / 2;
    const cy = h * 0.45;
    const rx = w * 0.40;
    const ry = h * 0.30;
    for (let j = 0; j < k; j++) {
      const theta = (j + 1) / (k + 1) * Math.PI; // 0 ~ PI
      const x = cx + rx * Math.cos(theta);
      const y = cy - ry * Math.sin(theta) - 8;
      positions[opp[j]] = { x, y, role: 'opp' };
    }
    return positions;
  }

  /**
   * 统一把各种牌表示规整为渲染所需的 {rankName, suitSymbol, isRed}
   * 兼容：{rank,suit} 对象、字符串 "♠A"、以及已有的显示对象
   */
  _cardFromAny(c) {
    if (!c) return null;
    if (c.rank !== undefined && c.suit !== undefined) {
      return {
        rankName: RANK_NAMES[c.rank],
        suitSymbol: SUIT_SYMBOLS[c.suit],
        isRed: c.suit === 1 || c.suit === 2
      };
    }
    if (typeof c === 'string') {
      const suitSymbol = c.slice(-1);
      const rankName = c.slice(0, -1);
      return {
        rankName,
        suitSymbol,
        isRed: suitSymbol === '♥' || suitSymbol === '♦'
      };
    }
    if (c.rankName) return c;
    return null;
  }

  _drawSeats(game) {
    const positions = this._seatPositions(game);
    for (let i = 0; i < game.players.length; i++) {
      const pos = positions[i];
      if (!pos) continue;
      if (pos.role === 'hero') {
        this._drawHero(i, pos, game);
      } else {
        this._drawOpponent(i, pos, game);
      }
    }
  }

  _drawHero(seatIndex, pos, game) {
    const r = this.renderer;
    const player = game.players[seatIndex];
    if (!player) return;

    const x = pos.x;
    const y = pos.y; // 头像中心
    const avatarSize = 46;

    const isCurrent = seatIndex === game.currentPlayerIndex;
    const isFolded = player.isFolded;
    const isAllIn = player.isAllIn;
    const isButton = seatIndex === game.buttonIndex;

    // 当前回合高亮 + 倒计时环
    if (isCurrent && !game.isHandOver) {
      r.ctx.beginPath();
      r.ctx.arc(x, y, avatarSize / 2 + 6, 0, 2 * Math.PI);
      r.ctx.strokeStyle = UI.COLORS.GOLD;
      r.ctx.lineWidth = 3;
      r.ctx.stroke();

      if (this.countdown > 0) {
        const progress = Math.max(0, Math.min(1, this.countdown / 30));
        r.ctx.beginPath();
        r.ctx.arc(x, y, avatarSize / 2 + 6, -Math.PI / 2,
          -Math.PI / 2 + progress * 2 * Math.PI);
        r.ctx.strokeStyle = UI.COLORS.RED;
        r.ctx.lineWidth = 3;
        r.ctx.stroke();
      }
    }

    if (isFolded) r.ctx.globalAlpha = 0.4;
    r.drawAvatar(x - avatarSize / 2, y - avatarSize / 2, avatarSize,
      player.avatar, false, player.name);
    r.ctx.globalAlpha = 1;

    if (isButton) {
      r.circle(x + avatarSize / 2, y - avatarSize / 2, 8, '#ffffff', '#333', 1);
      r.ctx.fillStyle = '#333';
      r.ctx.font = 'bold 9px sans-serif';
      r.ctx.textAlign = 'center';
      r.ctx.textBaseline = 'middle';
      r.ctx.fillText('D', x + avatarSize / 2, y - avatarSize / 2);
    }

    const nameY = y + avatarSize / 2 + 5;
    const chips = Math.floor(player.chips);
    const isNeg = chips < 0;

    r.ctx.fillStyle = isFolded ? 'rgba(255,255,255,0.3)' : '#ffffff';
    r.ctx.font = 'bold 13px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    r.ctx.fillText(player.name, x, nameY);

    r.ctx.fillStyle = isNeg ? UI.COLORS.RED : UI.COLORS.GOLD;
    r.ctx.font = 'bold 14px sans-serif';
    r.ctx.fillText('筹码 ' + chips, x, nameY + 17);

    if (player.currentBet > 0) {
      r.ctx.fillStyle = 'rgba(255,215,0,0.85)';
      r.ctx.font = '11px sans-serif';
      r.ctx.fillText('下注 ' + Math.floor(player.currentBet), x, nameY + 35);
    }

    // 自己手牌：始终明牌展示（大尺寸、清晰可读）
    const cardW = 44;
    const cardH = 62;
    const cardGap = 4;
    const cardTotalW = 2 * cardW + cardGap;
    const cardX = x - cardTotalW / 2;
    const cardY = nameY + 52;
    if (player.holeCards && player.holeCards.length > 0) {
      for (let c = 0; c < player.holeCards.length; c++) {
        const disp = this._cardFromAny(player.holeCards[c]);
        if (isFolded) r.ctx.globalAlpha = 0.3;
        r.drawCard(cardX + c * (cardW + cardGap), cardY, cardW, cardH, disp, false);
        r.ctx.globalAlpha = 1;
      }
    }

    // 牌型（亮牌时显示，便于核实胜负）
    if (game.isHandOver && game.revealedHands) {
      const rev = game.revealedHands[player.id];
      if (rev && rev.rankName) {
        const isWinner = this._isWinner(game, player.id);
        r.ctx.fillStyle = isWinner ? UI.COLORS.GOLD : 'rgba(255,255,255,0.85)';
        r.ctx.font = 'bold 13px sans-serif';
        r.ctx.textAlign = 'center';
        r.ctx.textBaseline = 'top';
        r.ctx.fillText('牌型: ' + rev.rankName, x, cardY + cardH + 6);
      }
    }

    // 动作标签（头像上方空白区）
    this._drawActionLabel(player, x, y - avatarSize / 2 - 16, isAllIn);

    if (isFolded) {
      r.ctx.fillStyle = 'rgba(231,76,60,0.85)';
      r.ctx.font = 'bold 11px sans-serif';
      r.ctx.textAlign = 'center';
      r.ctx.fillText('已弃牌', x, y - avatarSize / 2 - 30);
    }
  }

  _drawOpponent(seatIndex, pos, game) {
    const r = this.renderer;
    const player = game.players[seatIndex];
    if (!player) return;

    const x = pos.x;
    const y = pos.y; // 头像中心
    const avatarSize = 40;

    const isCurrent = seatIndex === game.currentPlayerIndex;
    const isFolded = player.isFolded;
    const isAllIn = player.isAllIn;
    const isButton = seatIndex === game.buttonIndex;

    if (isCurrent && !game.isHandOver) {
      r.ctx.beginPath();
      r.ctx.arc(x, y, avatarSize / 2 + 5, 0, 2 * Math.PI);
      r.ctx.strokeStyle = UI.COLORS.GOLD;
      r.ctx.lineWidth = 2;
      r.ctx.stroke();
    }

    if (isFolded) r.ctx.globalAlpha = 0.4;
    r.drawAvatar(x - avatarSize / 2, y - avatarSize / 2, avatarSize,
      player.avatar, true, player.name);
    r.ctx.globalAlpha = 1;

    if (isButton) {
      r.circle(x + avatarSize / 2, y - avatarSize / 2, 7, '#ffffff', '#333', 1);
      r.ctx.fillStyle = '#333';
      r.ctx.font = 'bold 8px sans-serif';
      r.ctx.textAlign = 'center';
      r.ctx.textBaseline = 'middle';
      r.ctx.fillText('D', x + avatarSize / 2, y - avatarSize / 2);
    }

    const nameY = y + avatarSize / 2 + 3;
    const chips = Math.floor(player.chips);

    r.ctx.fillStyle = isFolded ? 'rgba(255,255,255,0.3)' : '#ffffff';
    r.ctx.font = '11px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    r.ctx.fillText(player.name.length > 5 ? player.name.slice(0, 5) : player.name, x, nameY);

    r.ctx.fillStyle = isFolded ? 'rgba(255,215,0,0.3)' : UI.COLORS.GOLD;
    r.ctx.font = 'bold 11px sans-serif';
    r.ctx.fillText('筹码 ' + chips, x, nameY + 15);

    // 当前下注筹码图标（显示在头像右上）
    if (player.currentBet > 0 && !isFolded) {
      r.drawChip(x + avatarSize / 2 + 2, y - 14, 8, Math.floor(player.currentBet));
    }

    // 注：对局过程中不展示对手手牌（既不显示牌面也不显示牌背），
    // 仅在局末结算遮罩中统一亮明，避免遮挡并保证公平。

    this._drawActionLabel(player, x, nameY + 31, isAllIn);

    if (isFolded) {
      r.ctx.fillStyle = 'rgba(231,76,60,0.8)';
      r.ctx.font = 'bold 10px sans-serif';
      r.ctx.textAlign = 'center';
      r.ctx.fillText('已弃牌', x, y - avatarSize / 2 - 26);
    }
  }

  /**
   * 结算遮罩：大尺寸亮明所有玩家手牌 + 牌型，赢家高亮
   */
  _drawShowdown(game) {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;

    // 半透明遮罩
    r.ctx.fillStyle = 'rgba(0,0,0,0.85)';
    r.ctx.fillRect(0, 0, w, h);

    // 标题
    r.ctx.fillStyle = UI.COLORS.GOLD;
    r.ctx.font = 'bold 18px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    r.ctx.fillText('本局结算', w / 2, TOP_SAFE + 28);

    const players = game.players;
    const n = players.length;
    const cols = 2;
    const rows = Math.ceil(n / cols);
    const pad = 14;
    const cellW = (w - pad * (cols + 1)) / cols;
    const topY = TOP_SAFE + 60;
    const bottomReserve = 86; // 给"下一局"按钮留位置
    const rowH = Math.min(96, Math.floor((h - topY - bottomReserve - (rows - 1) * 8) / rows));
    const cardW = 40;
    const cardH = 56;
    const cardGap = 4;

    for (let i = 0; i < n; i++) {
      const p = players[i];
      const rev = game.revealedHands ? game.revealedHands[p.id] : null;
      const cardsRaw = (rev && rev.cards) ? rev.cards : (p.holeCards || []);
      const rankName = rev ? rev.rankName : '';
      const folded = rev ? rev.folded : p.isFolded;
      const isWinner = this._isWinner(game, p.id);

      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellX = pad + col * (cellW + pad);
      const cellY = topY + row * (rowH + 8);

      // 赢家金边
      if (isWinner) {
        r.roundRect(cellX - 2, cellY - 2, cellW + 4, rowH + 4, 8);
        r.ctx.strokeStyle = UI.COLORS.GOLD;
        r.ctx.lineWidth = 2;
        r.ctx.stroke();
      }

      // 名字
      r.ctx.fillStyle = isWinner ? UI.COLORS.GOLD : '#ffffff';
      r.ctx.font = 'bold 13px sans-serif';
      r.ctx.textAlign = 'center';
      r.ctx.textBaseline = 'top';
      r.ctx.fillText(p.name + (isWinner ? ' 赢' : ''), cellX + cellW / 2, cellY + 4);

      // 两张底牌（大尺寸）
      const totalW = 2 * cardW + cardGap;
      const startX = cellX + (cellW - totalW) / 2;
      const cy = cellY + 24;
      for (let c = 0; c < 2; c++) {
        const disp = this._cardFromAny(cardsRaw[c]);
        r.drawCard(startX + c * (cardW + cardGap), cy, cardW, cardH, disp, false);
      }

      // 牌型 / 弃牌
      r.ctx.fillStyle = isWinner ? UI.COLORS.GOLD : 'rgba(255,255,255,0.8)';
      r.ctx.font = 'bold 12px sans-serif';
      r.ctx.textAlign = 'center';
      r.ctx.textBaseline = 'top';
      const label = folded ? '已弃牌' : (rankName || '');
      r.ctx.fillText(label, cellX + cellW / 2, cy + cardH + 4);
    }
  }

  _isWinner(game, playerId) {
    const winners = game.winners;
    if (!winners) return false;
    return winners.some(w =>
      (w.playerId && w.playerId === playerId) ||
      (w.player && w.player.id === playerId));
  }

  // ==================== 通用绘制方法 ====================

  _drawActionLabel(player, x, y, isAllIn) {
    const r = this.renderer;
    if (!player.lastAction) return;

    const actionLabels = {
      'fold': '弃牌', 'check': '过牌', 'call': '跟注',
      'raise': '加注', 'bet': '下注', 'allin': '全押',
      'smallblind': '小盲', 'bigblind': '大盲'
    };
    const label = actionLabels[player.lastAction];
    if (!label) return;
    if (player.isFolded && label === '弃牌') return;

    const labelY = y;
    r.roundRect(x - 24, labelY, 48, 16, 8);
    r.ctx.fillStyle = isAllIn ? UI.COLORS.RED : 'rgba(0,0,0,0.6)';
    r.ctx.fill();
    r.ctx.fillStyle = '#fff';
    r.ctx.font = '10px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(label, x, labelY + 8);
  }

  // ==================== 底部操作按钮 ====================

  _drawActionButtons() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;
    const game = this.game.gameLogic;
    if (!game) return;

    const btnY = h - 70;
    const btnH = 44;
    const btnW = Math.floor((w - 60) / 4);

    // 本局结束
    if (game.isHandOver) {
      if (this.game.isOnline) {
        // 联机：服务器约 6 秒后自动发下一局，提示等待即可
        r.ctx.fillStyle = 'rgba(255,255,255,0.6)';
        r.ctx.font = '14px sans-serif';
        r.ctx.textAlign = 'center';
        r.ctx.textBaseline = 'middle';
        r.ctx.fillText('下一局即将开始...', w / 2, btnY + btnH / 2);
      } else {
        r.drawButton(w / 2 - 60, btnY, 120, btnH, '下一局', {
          pressed: this.pressedBtn === 'btn_next',
          bgColor: UI.COLORS.GOLD,
          textColor: '#333',
          fontSize: 16
        });
      }
      return;
    }

    const isMyTurn = game.currentPlayerIndex === this.game.mySeatIndex && !game.isHandOver;
    const callAmount = isMyTurn ? Math.floor(game.getCallAmount(this.game.mySeatIndex)) : 0;
    const panelOpen = this.showRaisePanel || this.showRepayPanel;

    r.drawButton(20, btnY, btnW, btnH, '弃牌', {
      pressed: this.pressedBtn === 'btn_fold',
      bgColor: '#666',
      fontSize: 14,
      disabled: !isMyTurn || panelOpen
    });

    const callLabel = callAmount > 0 ? '跟注 ' + callAmount : '过牌';
    r.drawButton(20 + btnW + 8, btnY, btnW, btnH, callLabel, {
      pressed: this.pressedBtn === 'btn_call',
      bgColor: UI.COLORS.BLUE,
      fontSize: 13,
      disabled: !isMyTurn || panelOpen
    });

    r.drawButton(20 + (btnW + 8) * 2, btnY, btnW, btnH, '加注', {
      pressed: this.pressedBtn === 'btn_raise',
      bgColor: UI.COLORS.GREEN,
      fontSize: 14,
      disabled: !isMyTurn || panelOpen
    });

    r.drawButton(20 + (btnW + 8) * 3, btnY, btnW, btnH, '全押', {
      pressed: this.pressedBtn === 'btn_allin',
      bgColor: UI.COLORS.RED,
      fontSize: 14,
      disabled: !isMyTurn || panelOpen
    });

    // 等待提示
    if (!isMyTurn && !game.isHandOver) {
      const current = game.players[game.currentPlayerIndex];
      if (current) {
        r.ctx.fillStyle = 'rgba(255,255,255,0.5)';
        r.ctx.font = '12px sans-serif';
        r.ctx.textAlign = 'center';
        r.ctx.fillText('等待 ' + current.name + ' 行动...', w / 2, btnY - 12);
      }
    }
  }

  // ==================== 加注面板 ====================

  _drawRaisePanel() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;
    const game = this.game.gameLogic;
    if (!game) return;

    const panelW = 280;
    const panelX = Math.floor((w - panelW) / 2);
    const panelY = Math.floor(h * 0.25);

    const callAmount = Math.floor(game.getCallAmount(this.game.mySeatIndex));
    const minRaise = Math.floor(game.getMinRaiseTotal(this.game.mySeatIndex));
    const myPlayer = game.players[this.game.mySeatIndex];
    const maxRaise = myPlayer ? Math.floor(myPlayer.chips + myPlayer.currentBet) : minRaise;

    if (this.raiseAmount === 0) {
      this.raiseAmount = minRaise;
    }
    this.raiseAmount = Math.max(minRaise, Math.min(maxRaise, this.raiseAmount));

    // 半透明遮罩
    r.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    r.ctx.fillRect(0, 0, w, h);

    // 面板背景
    r.roundRect(panelX, panelY, panelW, 195, 12);
    r.ctx.fillStyle = 'rgba(20,30,20,0.95)';
    r.ctx.fill();
    r.ctx.strokeStyle = UI.COLORS.GOLD;
    r.ctx.lineWidth = 2;
    r.ctx.stroke();

    // 标题
    r.ctx.fillStyle = UI.COLORS.GOLD;
    r.ctx.font = 'bold 16px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    r.ctx.fillText('加注', panelX + panelW / 2, panelY + 10);

    // 金额显示框
    r.roundRect(panelX + 55, panelY + 50, panelW - 110, 50, 8);
    r.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    r.ctx.fill();
    r.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    r.ctx.lineWidth = 1;
    r.ctx.stroke();

    r.ctx.fillStyle = UI.COLORS.GOLD;
    r.ctx.font = 'bold 24px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(this.raiseAmount.toString(), panelX + panelW / 2, panelY + 76);

    r.drawButton(panelX + 10, panelY + 55, 40, 40, '-', {
      pressed: this.pressedBtn === 'btn_raise_minus',
      bgColor: '#e74c3c', fontSize: 22
    });
    r.drawButton(panelX + panelW - 50, panelY + 55, 40, 40, '+', {
      pressed: this.pressedBtn === 'btn_raise_plus',
      bgColor: UI.COLORS.GREEN, fontSize: 22
    });

    r.drawButton(panelX + 10, panelY + 105, 80, 30, '1/2底池', {
      pressed: this.pressedBtn === 'btn_raise_half',
      bgColor: '#3498db', fontSize: 12
    });
    r.drawButton(panelX + 100, panelY + 105, 80, 30, '底池', {
      pressed: this.pressedBtn === 'btn_raise_pot',
      bgColor: '#3498db', fontSize: 12
    });
    r.drawButton(panelX + 190, panelY + 105, 80, 30, '最大', {
      pressed: this.pressedBtn === 'btn_raise_max',
      bgColor: '#3498db', fontSize: 12
    });

    r.ctx.fillStyle = 'rgba(255,255,255,0.5)';
    r.ctx.font = '10px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.fillText('最小 ' + minRaise + ' / 最大 ' + maxRaise, panelX + panelW / 2, panelY + 140);

    r.drawButton(panelX + panelW / 2 - 110, panelY + 155, 100, 36, '取消', {
      pressed: this.pressedBtn === 'btn_raise_cancel',
      bgColor: '#666', fontSize: 14
    });
    r.drawButton(panelX + panelW / 2 + 10, panelY + 155, 100, 36, '确认加注', {
      pressed: this.pressedBtn === 'btn_raise_confirm',
      bgColor: UI.COLORS.GREEN, fontSize: 14
    });
  }

  // ==================== 还款面板 ====================

  _drawRepayPanel() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;

    const economy = this.game.playerData.economy.getInfo();
    const panelW = 300;
    const panelX = Math.floor((w - panelW) / 2);
    const panelY = 90;
    const panelH = 270;

    // 确保repayAmount在有效范围
    const maxRepay = Math.min(Math.max(0, economy.coins), economy.loanBalance);
    if (this.repayAmount <= 0 || this.repayAmount > maxRepay) {
      this.repayAmount = maxRepay;
    }

    // 半透明遮罩
    r.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    r.ctx.fillRect(0, 0, w, h);

    // 面板背景
    r.roundRect(panelX, panelY, panelW, panelH, 14);
    r.ctx.fillStyle = 'rgba(30,20,10,0.96)';
    r.ctx.fill();
    r.ctx.strokeStyle = '#e67e22';
    r.ctx.lineWidth = 2;
    r.ctx.stroke();

    // 标题
    r.ctx.fillStyle = '#e67e22';
    r.ctx.font = 'bold 18px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    r.ctx.fillText('地下钱庄 - 还款', panelX + panelW / 2, panelY + 12);

    // 信息区域
    const infoY = panelY + 42;
    r.ctx.fillStyle = '#ffffff';
    r.ctx.font = '14px sans-serif';
    r.ctx.textAlign = 'left';
    r.ctx.textBaseline = 'top';

    r.ctx.fillStyle = UI.COLORS.RED;
    r.ctx.fillText('当前欠款: ' + economy.loanBalance, panelX + 25, infoY);

    r.ctx.fillStyle = '#e67e22';
    r.ctx.fillText('日供: ' + economy.dailyPayment + ' /局', panelX + 25, infoY + 22);

    r.ctx.fillStyle = economy.coins < 0 ? UI.COLORS.RED : UI.COLORS.GOLD;
    r.ctx.fillText('筹码余额: ' + economy.coins, panelX + 25, infoY + 44);

    // 分隔线
    r.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    r.ctx.lineWidth = 1;
    r.ctx.beginPath();
    r.ctx.moveTo(panelX + 20, panelY + 105);
    r.ctx.lineTo(panelX + panelW - 20, panelY + 105);
    r.ctx.stroke();

    // 金额显示框
    r.roundRect(panelX + 55, panelY + 115, panelW - 110, 50, 8);
    r.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    r.ctx.fill();
    r.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    r.ctx.lineWidth = 1;
    r.ctx.stroke();

    r.ctx.fillStyle = UI.COLORS.GOLD;
    r.ctx.font = 'bold 28px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(this.repayAmount.toString(), panelX + panelW / 2, panelY + 141);

    // - / + 按钮
    r.drawButton(panelX + 15, panelY + 120, 40, 40, '-', {
      pressed: this.pressedBtn === 'btn_repay_minus',
      bgColor: '#e74c3c', fontSize: 22
    });
    r.drawButton(panelX + panelW - 55, panelY + 120, 40, 40, '+', {
      pressed: this.pressedBtn === 'btn_repay_plus',
      bgColor: UI.COLORS.GREEN, fontSize: 22
    });

    // 快捷按钮
    r.drawButton(panelX + 15, panelY + 170, 85, 30, '还全部', {
      pressed: this.pressedBtn === 'btn_repay_all',
      bgColor: '#e67e22', fontSize: 12
    });
    r.drawButton(panelX + 107, panelY + 170, 85, 30, '还一半', {
      pressed: this.pressedBtn === 'btn_repay_half',
      bgColor: '#3498db', fontSize: 12
    });
    r.drawButton(panelX + 200, panelY + 170, 85, 30, '自定义', {
      pressed: this.pressedBtn === 'btn_repay_custom',
      bgColor: '#8e44ad', fontSize: 12
    });

    // 还款后信息
    const afterRepay = economy.loanBalance - this.repayAmount;
    r.ctx.fillStyle = 'rgba(255,255,255,0.5)';
    r.ctx.font = '11px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'top';
    if (afterRepay > 0) {
      r.ctx.fillText('还款后剩余欠款: ' + afterRepay, panelX + panelW / 2, panelY + 198);
    } else {
      r.ctx.fillStyle = UI.COLORS.GREEN;
      r.ctx.fillText('还款后负债清零！恢复自由身', panelX + panelW / 2, panelY + 198);
    }

    // 取消/确认按钮
    r.drawButton(panelX + 30, panelY + 215, 110, 38, '取消', {
      pressed: this.pressedBtn === 'btn_repay_cancel',
      bgColor: '#666', fontSize: 15
    });
    r.drawButton(panelX + 160, panelY + 215, 110, 38, '确认还款', {
      pressed: this.pressedBtn === 'btn_repay_confirm',
      bgColor: UI.COLORS.GREEN, fontSize: 15
    });
  }

  // ==================== 还款操作 ====================

  _adjustRepay(delta) {
    const economy = this.game.playerData.economy.getInfo();
    const maxRepay = Math.min(Math.max(0, economy.coins), economy.loanBalance);
    this.repayAmount = Math.max(1, Math.min(maxRepay, this.repayAmount + delta));
  }

  _setRepayToMax() {
    const economy = this.game.playerData.economy.getInfo();
    this.repayAmount = Math.min(Math.max(0, economy.coins), economy.loanBalance);
  }

  _setRepayToHalf() {
    const economy = this.game.playerData.economy.getInfo();
    const maxRepay = Math.min(Math.max(0, economy.coins), economy.loanBalance);
    this.repayAmount = Math.max(1, Math.floor(maxRepay / 2));
  }

  _customRepay() {
    const economy = this.game.playerData.economy.getInfo();
    const maxRepay = Math.min(Math.max(0, economy.coins), economy.loanBalance);

    wx.showModal({
      title: '自定义还款',
      content: '可还 1 ~ ' + maxRepay,
      editable: true,
      placeholderText: '输入金额',
      success: (res) => {
        if (res.confirm && res.content) {
          let s = String(res.content).trim();
          s = s.replace(/[\uff10-\uff19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
          s = s.replace(/,/g, '');
          const n = Number(s);
          if (isNaN(n) || n <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
          }
          if (n > maxRepay) {
            wx.showToast({ title: '最多可还 ' + maxRepay, icon: 'none' });
            return;
          }
          this.repayAmount = Math.floor(n);
        }
      }
    });
  }

  _confirmRepay() {
    const result = this.game.confirmRepay(this.repayAmount);
    if (result.success) {
      this.showRepayPanel = false;
    }
  }

  // ==================== 消息/嘲讽 ====================

  _drawMessage() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;
    const alpha = Math.min(1, this.messageTimer / 500);
    const lines = this.message.split('\n');
    const msgH = lines.length * 22 + 20;

    r.ctx.fillStyle = 'rgba(0,0,0,' + (0.75 * alpha) + ')';
    r.ctx.fillRect(0, h / 2 - msgH / 2, w, msgH);

    r.ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    r.ctx.font = 'bold 16px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) {
      r.ctx.fillText(lines[i], w / 2, h / 2 - (lines.length - 1) * 11 + i * 22);
    }
  }

  showMessage(msg, duration) {
    this.message = msg;
    this.messageTimer = duration || 2000;
  }

  showTaunt(text, seatIndex) {
    this.tauntText = text;
    this.tauntTimer = 3000;
    this.tauntSeatIndex = seatIndex !== undefined ? seatIndex : -1;
  }

  _drawTaunt() {
    const r = this.renderer;
    const w = r.width;
    const h = r.height;
    const alpha = Math.min(1, this.tauntTimer / 500);

    let bx = w / 2;
    let by = h * 0.18;

    // 如果有指定seatIndex，定位到对应座位
    if (this.tauntSeatIndex >= 0 && this.game.gameLogic) {
      const game = this.game.gameLogic;
      const positions = this._seatPositions(game);
      const pos = positions[this.tauntSeatIndex];
      if (pos && pos.role === 'opp') {
        bx = pos.x;
        by = pos.y - 34;
      }
    }

    r.ctx.font = 'bold 14px sans-serif';
    const textW = r.ctx.measureText(this.tauntText).width;
    const bubbleW = textW + 30;
    const bubbleH = 36;
    const bubbleX = bx - bubbleW / 2;
    const bubbleY = by - bubbleH / 2;

    r.ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * alpha) + ')';
    r.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 18);
    r.ctx.fill();
    r.ctx.strokeStyle = 'rgba(230,126,34,' + alpha + ')';
    r.ctx.lineWidth = 2;
    r.ctx.stroke();

    r.ctx.beginPath();
    r.ctx.moveTo(bx - 6, bubbleY + bubbleH);
    r.ctx.lineTo(bx + 6, bubbleY + bubbleH);
    r.ctx.lineTo(bx, bubbleY + bubbleH + 8);
    r.ctx.closePath();
    r.ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * alpha) + ')';
    r.ctx.fill();

    r.ctx.fillStyle = 'rgba(51,51,51,' + alpha + ')';
    r.ctx.font = 'bold 14px sans-serif';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(this.tauntText, bx, by);
  }

  // ==================== 玩家操作 ====================

  _playerAction(action) {
    if (this.showMenu) return;
    const game = this.game.gameLogic;
    if (!game || game.isHandOver) return;
    if (game.currentPlayerIndex !== this.game.mySeatIndex) return;
    if (this.showRaisePanel || this.showRepayPanel) return;

    if (action === ACTION.FOLD) {
      game.playerFold(this.game.mySeatIndex);
    } else if (action === ACTION.CHECK_CALL) {
      const callAmount = game.getCallAmount(this.game.mySeatIndex);
      if (callAmount === 0) {
        game.playerCheck(this.game.mySeatIndex);
      } else {
        game.playerCall(this.game.mySeatIndex);
      }
    } else if (action === ACTION.ALL_IN) {
      game.playerAllIn(this.game.mySeatIndex);
    }

    this.showRaisePanel = false;
    this.game.afterPlayerAction();
  }

  _toggleRaisePanel() {
    if (this.showMenu) return;
    const game = this.game.gameLogic;
    if (!game || game.isHandOver) return;
    if (game.currentPlayerIndex !== this.game.mySeatIndex) return;
    if (this.showRepayPanel) return;
    this.showRaisePanel = !this.showRaisePanel;
    if (this.showRaisePanel) {
      this.raiseAmount = Math.floor(game.getMinRaiseTotal(this.game.mySeatIndex));
    }
  }

  _confirmRaise() {
    const game = this.game.gameLogic;
    if (!game || game.isHandOver) return;
    if (game.currentPlayerIndex !== this.game.mySeatIndex) return;

    game.playerRaise(this.game.mySeatIndex, this.raiseAmount);
    this.showRaisePanel = false;
    this.game.afterPlayerAction();
  }

  _adjustRaise(delta) {
    const game = this.game.gameLogic;
    if (!game) return;
    const minRaise = Math.floor(game.getMinRaiseTotal(this.game.mySeatIndex));
    const myPlayer = game.players[this.game.mySeatIndex];
    const maxRaise = myPlayer ? Math.floor(myPlayer.chips + myPlayer.currentBet) : minRaise;
    this.raiseAmount = Math.max(minRaise, Math.min(maxRaise, this.raiseAmount + delta));
  }

  _setRaiseToHalfPot() {
    const game = this.game.gameLogic;
    if (!game) return;
    const pot = Math.floor(game.pot.totalAmount);
    const callAmount = Math.floor(game.getCallAmount(this.game.mySeatIndex));
    const myPlayer = game.players[this.game.mySeatIndex];
    const minRaise = Math.floor(game.getMinRaiseTotal(this.game.mySeatIndex));
    const maxRaise = myPlayer ? Math.floor(myPlayer.chips + myPlayer.currentBet) : minRaise;
    const target = callAmount + Math.floor(pot / 2);
    this.raiseAmount = Math.max(minRaise, Math.min(maxRaise, target));
  }

  _setRaiseToPot() {
    const game = this.game.gameLogic;
    if (!game) return;
    const pot = Math.floor(game.pot.totalAmount);
    const callAmount = Math.floor(game.getCallAmount(this.game.mySeatIndex));
    const myPlayer = game.players[this.game.mySeatIndex];
    const minRaise = Math.floor(game.getMinRaiseTotal(this.game.mySeatIndex));
    const maxRaise = myPlayer ? Math.floor(myPlayer.chips + myPlayer.currentBet) : minRaise;
    const target = callAmount + pot;
    this.raiseAmount = Math.max(minRaise, Math.min(maxRaise, target));
  }

  _setRaiseToMax() {
    const game = this.game.gameLogic;
    if (!game) return;
    const myPlayer = game.players[this.game.mySeatIndex];
    if (myPlayer) {
      this.raiseAmount = Math.floor(myPlayer.chips + myPlayer.currentBet);
    }
  }
}

module.exports = GameScene;
