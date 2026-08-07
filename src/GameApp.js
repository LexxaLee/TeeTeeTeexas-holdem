/**
 * 主游戏控制器
 * 协调游戏逻辑、AI、UI、网络
 */

const PokerGame = require('./core/PokerGame');
const Player = require('./core/Player');
const AIPlayer = require('./ai/AIPlayer');
const { maybeTaunt } = require('./ai/Taunts');
const PlayerData = require('./data/PlayerData');
const Storage = require('./data/Storage');
const RemoteGame = require('./network/RemoteGame');
const { ROOM_CONFIG, AI_DIFFICULTY, PLAYER_STATUS, PHASE } = require('./config');

// AI机器人名字池——历史人物和名人
const AI_NAMES = [
  '诸葛亮', '曹操', '刘备', '孙权', '司马懿', '周瑜', '韩信', '项羽',
  '和珅', '韦小宝', '李白', '苏轼', '纪晓岚', '东方不败', '鳌拜', '唐伯虎',
  '拿破仑', '丘吉尔', '爱因斯坦', '达芬奇', '莎士比亚', '牛顿', '莫扎特', '成吉思汗'
];

function pickAINames(count) {
  const shuffled = [...AI_NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * 解析金额输入 — 支持全角数字、空格、逗号
 * @returns {number|null} 解析后的整数，或null
 */
function _parseAmount(input) {
  if (!input) return null;
  let s = String(input).trim();
  // 全角数字转半角
  s = s.replace(/[\uff10-\uff19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 全角小数点
  s = s.replace(/\uff0e/g, '.');
  // 去除逗号
  s = s.replace(/,/g, '');
  const n = Number(s);
  if (isNaN(n) || n <= 0) return null;
  return Math.floor(n);
}

class GameApp {
  constructor(canvas) {
    this.canvas = canvas;

    // 渲染和事件
    const Renderer = require('./ui/Renderer');
    const EventSystem = require('./ui/EventSystem');
    const SceneManager = require('./scenes/SceneManager');

    this.renderer = new Renderer(canvas);
    this.events = new EventSystem();

    // 玩家数据
    this.playerData = new PlayerData();

    // 游戏逻辑
    this.gameLogic = null;
    this.mySeatIndex = 0;
    this.aiPlayers = []; // [{ player, ai }]
    this.roomSettings = null;
    this.roomId = null;  // 房间号（6位数字）
    this.isOnline = false; // 是否联机模式
    this.gameMode = null; // 'practice'（练习模式） | 'real'（真实金币模式）

    // 场景
    this.sceneManager = new SceneManager(this.renderer, this.events);

    const LobbyScene = require('./scenes/LobbyScene');
    const GameScene = require('./scenes/GameScene');
    const CreateRoomScene = require('./scenes/CreateRoomScene');

    this.scenes = {
      lobby: new LobbyScene(this.renderer, this.events, this),
      game: new GameScene(this.renderer, this.events, this),
      createRoom: new CreateRoomScene(this.renderer, this.events, this)
    };

    for (const [name, scene] of Object.entries(this.scenes)) {
      this.sceneManager.register(name, scene);
    }

    // 每日结算 & 强制关闭检测
    this.playerData.economy.dailyCheck();

    // 微信头像/昵称首次初始化
    this._initWeChatUser();

    this._setupTouchEvents();
  }

  /**
   * 微信头像/昵称初始化
   */
  _initWeChatUser() {
    if (!this.playerData.nickname || !this.playerData.avatar) {
      // 首次登录，尝试获取微信信息
      if (typeof wx !== 'undefined' && wx.getUserProfile) {
        // 在按钮回调中调用getUserProfile
        // 这里先标记需要初始化，实际调用在用户点击时触发
        this._needWeChatInit = true;
      }
    }
  }

  /**
   * 触发微信授权获取头像和昵称
   */
  tryGetWeChatProfile() {
    if (this.playerData.nickname && this.playerData.avatar) {
      return; // 已有
    }
    if (typeof wx !== 'undefined' && wx.getUserProfile) {
      wx.getUserProfile({
        desc: '用于显示头像和昵称',
        success: (res) => {
          const userInfo = res.userInfo || {};
          this.playerData.initFromWeChat({
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl
          });
          // 提示可以修改昵称
          wx.showModal({
            title: '欢迎',
            content: '已获取微信头像和昵称。要修改昵称吗？',
            confirmText: '改昵称',
            cancelText: '不用',
            success: (modal) => {
              if (modal.confirm) {
                this._editNickname();
              }
            }
          });
        },
        fail: () => {
          // 用户拒绝，用默认值
          this.playerData.initFromWeChat({
            nickName: '玩家' + Math.floor(Math.random() * 10000),
            avatarUrl: ''
          });
        }
      });
    }
  }

  /**
   * 编辑昵称
   */
  _editNickname() {
    wx.showModal({
      title: '修改昵称',
      content: '当前昵称：' + (this.playerData.nickname || '未设置'),
      editable: true,
      placeholderText: '输入新昵称',
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          this.playerData.nickname = res.content.trim();
          this.playerData.save();
          wx.showToast({ title: '昵称已修改', icon: 'success' });
        }
      }
    });
  }

  /**
   * 设置触摸事件
   */
  _setupTouchEvents() {
    wx.onTouchStart((e) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        this.events.onTouchStart(t.clientX, t.clientY);
      }
    });

    wx.onTouchMove((e) => {
      if (e.touches.length > 0) {
        const t = e.touches[0];
        this.events.onTouchMove(t.clientX, t.clientY);
      }
    });

    wx.onTouchEnd((e) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        this.events.onTouchEnd(t.clientX, t.clientY);
      }
    });
  }

  /**
   * 启动游戏
   */
  start() {
    this.sceneManager.switchTo('lobby');
    this.sceneManager.start();
  }

  /**
   * 切换场景
   */
  switchScene(name, params) {
    this.sceneManager.switchTo(name, params);
  }

  // ==================== 游戏逻辑 ====================

  /**
   * AI快速开始
   * 使用真实金币（与好友对战共用一个金币池），赢的钱可还钱庄、也可在好友对战使用
   * 随时可退出，不惩罚（AI对战规则）
   */
  startAIQuickGame() {
    this.gameMode = 'practice';

    // 创建游戏
    this.gameLogic = new PokerGame({
      smallBlind: ROOM_CONFIG.DEFAULT_SMALL_BLIND,
      bigBlind: ROOM_CONFIG.DEFAULT_BIG_BLIND,
      practiceMode: this.gameMode === 'practice', // AI对战：偏置发牌+AI让利
      onEvent: (event, data) => this._onGameEvent(event, data)
    });

    this.aiPlayers = [];
    this.mySeatIndex = 0;

    // 玩家使用真实金币余额作为筹码
    const profile = this.playerData.getProfile();
    const me = new Player(
      this.playerData.id || 'me',
      this.playerData.nickname || '我',
      this.playerData.avatar,
      profile.coins,
      { isAI: false }
    );
    this.gameLogic.addPlayer(me);

    // 添加AI玩家（固定初始筹码，仅作对手，不影响玩家经济）
    const aiCount = 3;
    const aiNames = pickAINames(aiCount);
    const difficulties = [AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.EXPERT,
                          AI_DIFFICULTY.BEGINNER, AI_DIFFICULTY.PRO];

    for (let i = 0; i < aiCount; i++) {
      const aiPlayer = new Player(
        'ai_' + i,
        aiNames[i],
        '',
        ROOM_CONFIG.DEFAULT_INITIAL_CHIPS,
        { isAI: true, aiDifficulty: difficulties[i % difficulties.length] }
      );
      this.gameLogic.addPlayer(aiPlayer);
      this.aiPlayers.push({
        player: aiPlayer,
        ai: new AIPlayer(difficulties[i % difficulties.length])
      });
    }

    // 切换到游戏场景
    this.switchScene('game');

    // 开始第一局
    setTimeout(() => this.startNextHand(), 500);
  }

  /**
   * 生成6位随机房间号
   */
  _generateRoomId() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * 创建房间
   * 优先使用权威联机服务器：创建后可分享房间号给好友跨设备加入。
   * 若联机服务器不可达，自动回退为本地 AI 对战（保证随时可玩）。
   */
  createRoom(settings) {
    this.roomSettings = settings;

    const GameClient = require('./network/GameClient');
    const client = new GameClient();
    const SERVER_URL = this._getServerUrl();
    let connected = false;
    let fallbackTriggered = false;

    const fallback = (reason) => {
      if (fallbackTriggered || connected) return;
      fallbackTriggered = true;
      console.log('联机服务器未响应，创建房间回退为本地AI模式:', reason);
      wx.showToast({ title: '联机不可用，进入本地AI房', icon: 'none', duration: 2500 });
      this._createLocalRoom(settings);
    };

    try {
      client.connect(SERVER_URL).then(() => {
        connected = true;
        this._setupOnline(client, null, {
          config: {
            maxPlayers: settings.maxPlayers,
            initialChips: settings.initialChips,
            smallBlind: settings.smallBlind,
            bigBlind: settings.bigBlind,
            aiDifficulty: settings.aiDifficulty
          }
        });
      }).catch((err) => fallback(err));
    } catch (e) {
      fallback(e);
    }

    setTimeout(() => {
      if (!connected && !fallbackTriggered) fallback('timeout');
    }, 3000);
  }

  /**
   * 本地房间（联机不可用时的回退）：其余座位由AI补位
   */
  _createLocalRoom(settings) {
    this.roomId = this._generateRoomId();
    this.isOnline = false;
    this.gameMode = 'practice'; // 本地房间 = AI对战规则（真实金币，随时退）

    const profile = this.playerData.getProfile();

    this.gameLogic = new PokerGame({
      smallBlind: settings.smallBlind,
      bigBlind: settings.bigBlind,
      practiceMode: true, // AI对战：偏置发牌+AI让利
      onEvent: (event, data) => this._onGameEvent(event, data)
    });

    this.aiPlayers = [];
    this.mySeatIndex = 0;

    const me = new Player(
      this.playerData.id || 'me',
      this.playerData.nickname || '我',
      this.playerData.avatar,
      profile.coins,
      { isAI: false }
    );
    this.gameLogic.addPlayer(me);

    const aiCount = Math.min(settings.aiCount, settings.maxPlayers - 1);
    const aiNames = pickAINames(aiCount);
    for (let i = 0; i < aiCount; i++) {
      const aiPlayer = new Player(
        'ai_' + i,
        aiNames[i],
        '',
        settings.initialChips,
        { isAI: true, aiDifficulty: settings.aiDifficulty }
      );
      this.gameLogic.addPlayer(aiPlayer);
      this.aiPlayers.push({
        player: aiPlayer,
        ai: new AIPlayer(settings.aiDifficulty)
      });
    }

    this.switchScene('game');
    setTimeout(() => {
      this.scenes.game.showMessage(`房间号: ${this.roomId}（${settings.maxPlayers}人房·${aiCount}个AI）`, 5000);
    }, 300);
    setTimeout(() => this.startNextHand(), 800);
  }

  /**
   * 开始下一局
   * 所有模式使用真实金币：筹码归零时提示借钱/打工
   */
  startNextHand() {
    if (!this.gameLogic) return;

    const me = this.gameLogic.players[this.mySeatIndex];

    if (me && me.chips <= 0) {
      const economy = this.playerData.economy.getInfo();
      if (economy.canBorrow) {
        // 可以借款（筹码归零且无负债）
        this._showBorrowDialog();
        return;
      }
      if (economy.hasDebt) {
        // 已负债：提示可通过赢钱还款
        this.scenes.game.showMessage('负债中，赢钱自动抵债', 2000);
      }
    }

    this.gameLogic.startNewHand();
  }

  /**
   * 玩家行动后
   */
  afterPlayerAction() {
    // 联机模式：AI 由权威服务器驱动，客户端不本地推进
    if (this.isOnline) return;
    this._checkAITurn();
  }

  /**
   * 检查是否轮到AI行动
   */
  _checkAITurn() {
    if (!this.gameLogic || this.gameLogic.isHandOver) return;

    const current = this.gameLogic.players[this.gameLogic.currentPlayerIndex];
    if (current && current.isAI) {
      // AI思考延迟
      const thinkTime = 800 + Math.random() * 1500;

      setTimeout(() => {
        if (this.gameLogic.isHandOver) return;
        if (this.gameLogic.currentPlayerIndex === -1) return;

        const currentPlayer = this.gameLogic.players[this.gameLogic.currentPlayerIndex];
        if (!currentPlayer || !currentPlayer.isAI) return;

        this._executeAITurn();
      }, thinkTime);
    }
  }

  /**
   * 执行AI回合
   */
  _executeAITurn() {
    const game = this.gameLogic;
    if (!game || game.isHandOver) return;

    const playerIndex = game.currentPlayerIndex;
    const player = game.players[playerIndex];
    if (!player || !player.isAI) return;

    const aiEntry = this.aiPlayers.find(a => a.player.id === player.id);
    if (!aiEntry) return;

    // 构建AI决策上下文（只包含公开信息）
    const humanPlayer = this.gameLogic.players[this.mySeatIndex];
    const context = {
      player: player,
      practiceMode: this.gameMode === 'practice', // AI对战时AI略弱、牌型更丰富
      humanId: humanPlayer ? humanPlayer.id : null, // 定向让利：AI对真人的下注更易弃牌
      gameState: {
        phase: game.phase,
        currentBet: game.currentBet,
        potTotal: game.pot.totalAmount || 0,
        communityCards: game.communityCards,
        buttonIndex: game.buttonIndex,
        players: game.players.map(p => ({
          id: p.id,
          name: p.name,
          seatIndex: p.seatIndex,
          chips: p.chips,
          currentBet: p.currentBet,
          totalBet: p.totalBet,
          status: p.status,
          isFolded: p.isFolded,
          isAllIn: p.isAllIn,
          lastAction: p.lastAction,
          actionHistory: p.actionHistory
          // 注意：不包含 holeCards
        }))
      }
    };

    // AI决策
    const decision = aiEntry.ai.decide(context);

    // 执行决策
    try {
      if (decision.action === 'fold') {
        game.playerFold(playerIndex);
      } else if (decision.action === 'check') {
        game.playerCheck(playerIndex);
      } else if (decision.action === 'call') {
        game.playerCall(playerIndex);
      } else if (decision.action === 'raise' || decision.action === 'bet') {
        game.playerRaise(playerIndex, decision.amount);
        // AI加注嘲讽
        const taunt = maybeTaunt('aiRaise');
        if (taunt) {
          setTimeout(() => this.scenes.game.showTaunt(taunt, playerIndex), 300);
        }
      } else if (decision.action === 'allin') {
        game.playerAllIn(playerIndex);
        // AI全押嘲讽
        const taunt = maybeTaunt('aiAllIn');
        if (taunt) {
          setTimeout(() => this.scenes.game.showTaunt(taunt, playerIndex), 300);
        }
      }
    } catch (e) {
      // 决策出错时默认过牌或弃牌
      console.error('AI action error:', e);
      try {
        const callAmount = game.getCallAmount(playerIndex);
        if (callAmount === 0) {
          game.playerCheck(playerIndex);
        } else {
          game.playerFold(playerIndex);
        }
      } catch (e2) {
        console.error('AI fallback error:', e2);
      }
    }

    // 继续检查
    this._checkAITurn();
  }

  /**
   * 游戏事件处理
   */
  _onGameEvent(event, data) {
    const gameScene = this.scenes.game;

    switch (event) {
      case 'handStart':
        // 游戏开始
        break;

      case 'phaseChange':
        if (data.communityCards) {
          gameScene.showMessage(this._getPhaseMessage(data.phase), 1500);
        }
        break;

      case 'playerAction':
        // 玩家行动
        const actionMsgs = {
          'fold': '弃牌',
          'check': '过牌',
          'call': '跟注',
          'raise': '加注',
          'bet': '下注',
          'allin': '全押!'
        };
        const player = this.gameLogic.players[data.playerIndex];
        const msg = player ? `${player.name} ${actionMsgs[data.action] || data.action}` : '';
        if (msg) {
          gameScene.showMessage(msg, 1200);
        }

        // 玩家弃牌时，AI嘲讽
        if (data.action === 'fold' && data.playerIndex === this.mySeatIndex) {
          const taunt = maybeTaunt('playerFold');
          if (taunt) {
            setTimeout(() => gameScene.showTaunt(taunt), 800);
          }
        }
        break;

      case 'showdown':
        // 摊牌
        let resultMsg = '';
        let aiWon = false;
        for (const w of data.winners) {
          const p = this.gameLogic.players.find(pl => pl.id === w.playerId);
          if (p) {
            resultMsg += `${p.name} 赢得 ${w.amount}`;
            if (w.handRankName) resultMsg += ` (${w.handRankName})`;
            // 检查是否AI赢了
            if (p.isAI) aiWon = true;
          }
        }
        gameScene.showMessage(resultMsg, 4000);

        // AI赢牌嘲讽
        if (aiWon) {
          const taunt = maybeTaunt('win');
          if (taunt) {
            setTimeout(() => gameScene.showTaunt(taunt), 1500);
          }
        }

        // 记录玩家数据
        this._recordPlayerStats(data);

        // 玩家输了且筹码少，触发嘲讽
        const meAfter = this.gameLogic.players[this.mySeatIndex];
        if (meAfter && meAfter.chips < 200 && !aiWon) {
          setTimeout(() => {
            const t = maybeTaunt('playerLowChips');
            if (t) gameScene.showTaunt(t);
          }, 2500);
        }
        break;

      case 'handOver':
        if (data.reason === 'everyone_else_folded') {
          const w = data.winners[0];
          const p = this.gameLogic.players.find(pl => pl.id === w.playerId);
          if (p) {
            gameScene.showMessage(`${p.name} 赢得 ${w.amount}（其他人弃牌）`, 3000);
            // AI赢牌嘲讽
            if (p.isAI) {
              const taunt = maybeTaunt('win');
              if (taunt) {
                setTimeout(() => gameScene.showTaunt(taunt), 800);
              }
            }
          }
          this._recordPlayerStats(data);
        }
        break;

      case 'turn':
        // 轮到某人
        if (data.playerIndex === this.mySeatIndex) {
          gameScene.countdown = 30;
        } else {
          gameScene.countdown = 0;
        }
        break;
    }

    // 检查AI回合
    if (event === 'turn' || event === 'phaseChange') {
      this._checkAITurn();
    }
  }

  _getPhaseMessage(phase) {
    const msgs = {
      'flop': '翻牌！',
      'turn': '转牌！',
      'river': '河牌！',
      'showdown': '摊牌！'
    };
    return msgs[phase] || '';
  }

  /**
   * 记录玩家统计
   * 所有模式都使用真实金币经济系统：
   * - 赢钱/输钱直接增减金币
   * - 每局结束自动从金币扣钱庄日供（赢钱自动抵债）
   */
  _recordPlayerStats(data) {
    const me = this.gameLogic.players[this.mySeatIndex];
    if (!me) return;

    let myWin = 0;
    for (const w of data.winners) {
      if (w.playerId === me.id) {
        myWin = w.amount;
      }
    }

    const profit = myWin - me.totalBet;
    const won = myWin > 0;
    this.playerData.recordHandResult(won, profit);

    // 更新经济系统 — 允许负筹码（所有模式统一）
    if (profit > 0) {
      this.playerData.economy.addCoins(profit);
    } else if (profit < 0) {
      this.playerData.economy.removeCoins(-profit);
    }

    // 每局结束自动扣款（地下钱庄日供）
    const deductResult = this.playerData.economy.autoDeduct();

    // 同步玩家筹码到经济系统
    const mePlayer = this.gameLogic.players[this.mySeatIndex];
    if (mePlayer) {
      mePlayer.chips = Math.floor(this.playerData.economy.coins);
    }

    if (deductResult) {
      // 显示扣款提示
      if (this.scenes.game) {
        let msg = '日供扣除: ' + deductResult.deduction;
        if (deductResult.newCoins < 0) {
          msg += '\n进入负债状态，赢钱自动抵债';
        }
        if (deductResult.debtCleared) {
          msg = '日供扣除: ' + deductResult.deduction + '\n负债已还清！';
        }
        setTimeout(() => {
          if (this.scenes.game) this.scenes.game.showMessage(msg, 3000);
        }, 1500);
      }
    }
  }

  /**
   * 显示加入房间对话框
   */
  showJoinRoomDialog() {
    wx.showModal({
      title: '加入房间',
      content: '请输入6位房间号',
      editable: true,
      placeholderText: '如: 384756',
      success: (res) => {
        if (res.confirm && res.content) {
          const roomId = res.content.trim();
          if (roomId.length !== 6 || !/^\d{6}$/.test(roomId)) {
            wx.showToast({ title: '请输入6位数字房间号', icon: 'none' });
            return;
          }
          this._joinRoom(roomId);
        }
      }
    });
  }

  /**
   * 加入房间
   * 优先连接权威联机服务器；不可达则回退为本地 AI 对战（沿用同一房间号）。
   */
  _joinRoom(roomId) {
    this.roomId = roomId;

    const GameClient = require('./network/GameClient');
    const client = new GameClient();
    const SERVER_URL = this._getServerUrl();
    let connected = false;
    let fallbackTriggered = false;

    const fallback = (reason) => {
      if (fallbackTriggered || connected) return;
      fallbackTriggered = true;
      console.log('联机服务器未响应，加入房间回退为AI模式:', reason);
      wx.showToast({ title: '联机不可用，进入本地AI房', icon: 'none', duration: 2500 });
      this._startAIGameWithRoomId(roomId);
    };

    try {
      client.connect(SERVER_URL).then(() => {
        connected = true;
        this._setupOnline(client, roomId, null);
      }).catch((err) => fallback(err));
    } catch (e) {
      fallback(e);
    }

    setTimeout(() => {
      if (!connected && !fallbackTriggered) fallback('timeout');
    }, 3000);
  }

  /**
   * 接入权威联机对局：用服务器快照驱动 GameScene，动作发往服务器。
   * @param {GameClient} client 已连接的客户端
   * @param {string|null} roomId 加入已有房间时传入；创建房间时传 null（稍后由 roomCreated 回填）
   * @param {object|null} createOpts 创建房间时传入 { config }
   */
  _setupOnline(client, roomId, createOpts) {
    this.isOnline = true;
    this.gameMode = 'online';
    if (roomId) this.roomId = roomId;
    this.gameClient = client;

    const playerInfo = {
      playerId: this.playerData.id || ('me_' + Date.now()),
      name: this.playerData.nickname || '我',
      avatar: this.playerData.avatar || ''
    };

    const remote = new RemoteGame(client, {
      onState: (snap) => {
        this.mySeatIndex = remote.mySeatIndex;
        const scene = this.scenes && this.scenes.game;
        if (scene) {
          scene.countdown = (snap.currentPlayerIndex === remote.mySeatIndex && !snap.isHandOver) ? 30 : 0;
        }
      },
      onError: (msg) => {
        const scene = this.scenes && this.scenes.game;
        if (scene) scene.showMessage('联机错误: ' + msg, 2200);
      }
    });

    this.gameLogic = remote;
    this.aiPlayers = [];
    this.mySeatIndex = 0;

    if (createOpts) {
      client.createRoom(createOpts.config, playerInfo);
    } else {
      client.joinRoom(this.roomId, '', playerInfo);
    }

    // 监听房间事件，回填房间号并进入棋盘
    client.on('roomCreated', (msg) => {
      this.roomId = msg.roomId;
      this.playerData.id = msg.playerId || this.playerData.id;
      this.switchScene('game');
      wx.showToast({ title: '房间 ' + this.roomId + ' 已创建，可分享给好友', icon: 'none', duration: 2500 });
    });
    client.on('roomJoined', (msg) => {
      this.roomId = msg.roomId;
      this.playerData.id = msg.playerId || this.playerData.id;
      this.switchScene('game');
      wx.showToast({ title: '已加入房间 ' + this.roomId, icon: 'success' });
    });

    // 若房间事件已来不及（连接极快），确保仍能进入棋盘
    if (!this.gameLogic) return;
    if (this.roomId) {
      this.switchScene('game');
    }
  }

  /**
   * 联机服务器地址（可在微信侧通过设置 serverUrl 覆盖；生产环境换成 wss://）
   */
  _getServerUrl() {
    try {
      const saved = Storage.get('serverUrl', null);
      if (saved) return saved;
    } catch (e) { /* ignore */ }
    return 'ws://localhost:8080';
  }

  /**
   * 退出联机房时断开连接
   */
  leaveOnlineIfAny() {
    if (this.isOnline && this.gameClient) {
      try { this.gameClient.leaveRoom(); } catch (e) { /* ignore */ }
      try { this.gameClient.disconnect(); } catch (e) { /* ignore */ }
      this.gameClient = null;
    }
    this.isOnline = false;
  }

  /**
   * 以指定房间号开始AI游戏（联机服务器未启动时的回退方案）
   */
  _startAIGameWithRoomId(roomId) {
    if (this.gameLogic) return; // 已经开始了

    this.roomId = roomId;
    this.gameMode = 'practice'; // 联机未开启时回退到AI对战（真实金币，随时退）
    const profile = this.playerData.getProfile();

    this.gameLogic = new PokerGame({
      smallBlind: ROOM_CONFIG.DEFAULT_SMALL_BLIND,
      bigBlind: ROOM_CONFIG.DEFAULT_BIG_BLIND,
      practiceMode: this.gameMode === 'practice', // AI对战：偏置发牌+AI让利
      onEvent: (event, data) => this._onGameEvent(event, data)
    });

    this.aiPlayers = [];
    this.mySeatIndex = 0;

    const me = new Player(
      this.playerData.id || 'me',
      this.playerData.nickname || '我',
      this.playerData.avatar,
      profile.coins,
      { isAI: false }
    );
    this.gameLogic.addPlayer(me);

    // 添加3个AI
    const aiNames = pickAINames(3);
    const difficulties = [AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.EXPERT, AI_DIFFICULTY.BEGINNER];
    for (let i = 0; i < 3; i++) {
      const aiPlayer = new Player(
        'ai_' + i,
        aiNames[i],
        '',
        ROOM_CONFIG.DEFAULT_INITIAL_CHIPS,
        { isAI: true, aiDifficulty: difficulties[i] }
      );
      this.gameLogic.addPlayer(aiPlayer);
      this.aiPlayers.push({
        player: aiPlayer,
        ai: new AIPlayer(difficulties[i])
      });
    }

    this.switchScene('game');
    setTimeout(() => {
      this.scenes.game.showMessage(`房间号: ${roomId}`, 5000);
    }, 300);
    setTimeout(() => this.startNextHand(), 800);
  }

  /**
   * 分享房间给好友
   */
  shareRoom() {
    if (!this.roomId) return;

    wx.shareAppMessage({
      title: `来打德州扑克！房间号: ${this.roomId}`,
      imageUrl: '', // 可以后续添加分享图
    });

    wx.showToast({
      title: '已发起分享，请发送给好友',
      icon: 'none',
      duration: 2000
    });
  }

  /**
   * 显示个人信息（详细版：胜率、每局盈亏、贷款痕迹）
   */
  showProfile() {
    const profile = this.playerData.getProfile();
    const economy = this.playerData.economy.getInfo();

    let content = '=== 资产 ===\n';
    content += '筹码: ' + economy.coins;
    if (economy.coins < 0) content += ' (负债中)';
    content += '\n';

    if (economy.hasDebt) {
      content += '欠款: ' + economy.loanBalance + '\n';
      content += '日供: ' + economy.dailyPayment + '/局\n';
      content += '借款本金: ' + economy.loanPrincipal + '\n';
      content += '还款年限: ' + economy.borrowYears + '年\n';
    } else {
      content += '欠款: 无\n';
    }

    content += '\n=== 战绩 ===\n';
    content += '总局数: ' + profile.handsPlayed + '\n';
    content += '胜局: ' + profile.handsWon + '\n';
    content += '胜率: ' + profile.winRate + '%\n';
    content += '总盈亏: ' + Math.floor(profile.totalProfit) + '\n';
    content += '最大单局盈利: ' + Math.floor(profile.maxProfit) + '\n';
    content += '最大单局亏损: ' + Math.floor(profile.maxLoss) + '\n';
    content += '最大连胜: ' + profile.maxWinStreak + '局\n';

    // 贷款历史痕迹
    const loanHistory = Storage.get('loanHistory', []);
    if (loanHistory.length > 0) {
      content += '\n=== 借贷记录 ===\n';
      content += '累计借贷: ' + loanHistory.length + '次\n';
      const lastLoan = loanHistory[loanHistory.length - 1];
      if (lastLoan) {
        content += '最近: 借' + lastLoan.amount + '到手' + (lastLoan.actualReceived || lastLoan.amount) + '\n';
      }
    }

    wx.showModal({
      title: (profile.nickname || '玩家'),
      content: content,
      showCancel: true,
      cancelText: '关闭',
      confirmText: economy.hasDebt ? '去还款' : '钱庄',
      success: (res) => {
        if (res.confirm) {
          if (economy.hasDebt) {
            this._showRepayDialog();
          } else {
            this.showLoanCenter();
          }
        }
      }
    });
  }

  /**
   * 地下钱庄 — 借款流程
   * 步骤1：显示信息 + 输入年限
   * 步骤2：显示计算结果 + 确认
   */
  showLoanCenter() {
    const economy = this.playerData.economy.getInfo();

    if (!economy.canBorrow) {
      if (economy.hasDebt) {
        wx.showModal({
          title: '地下钱庄',
          content: '负债未清，不能再借。\n当前欠款: ' + economy.loanBalance + '\n日供: ' + economy.dailyPayment + '/局\n\n赢了自动抵债，继续游戏。',
          showCancel: true,
          cancelText: '关闭',
          confirmText: '去还款',
          success: (res) => {
            if (res.confirm) this._showRepayDialog();
          }
        });
      } else {
        wx.showModal({
          title: '地下钱庄',
          content: '筹码大于0时不能借款。\n等筹码归零了再来找我。',
          showCancel: false,
          confirmText: '知道了'
        });
      }
      return;
    }

    // 获取当前大盲注
    const bigBlind = this.gameLogic ? this.gameLogic.bigBlind : ROOM_CONFIG.DEFAULT_BIG_BLIND;
    const loanAmount = bigBlind * 100;

    // 显示借款信息 + 输入年限
    let content = '借款额度: ' + loanAmount + '（大盲注' + bigBlind + '×100）\n';
    content += '年利率: 10%（单利）\n';
    content += '无砍头息，到手即全额\n\n';
    content += '输入还款年限（1~999年）:';
    content += '\n\n钱庄老板: ' + this.playerData.economy.getTaunt('onBorrow');

    wx.showModal({
      title: '地下钱庄 - 借款',
      content: content,
      editable: true,
      placeholderText: '如: 10',
      success: (res) => {
        if (res.confirm && res.content) {
          const years = parseInt(res.content);
          if (isNaN(years) || years < 1 || years > 999) {
            wx.showToast({ title: '请输入1~999之间的数字', icon: 'none' });
            return;
          }
          this._confirmBorrow(bigBlind, years);
        }
      }
    });
  }

  /**
   * 确认借款 — 显示计算结果
   */
  _confirmBorrow(bigBlind, years) {
    const calc = this.playerData.economy.calculateLoan(bigBlind, years);

    let content = '借款本金: ' + calc.loanAmount + '\n';
    content += '还款年限: ' + calc.years + '年\n';
    content += '年利率: ' + calc.annualRatePercent + '（单利）\n';
    content += '总利息: ' + calc.totalInterest + '\n';
    content += '总欠款: ' + calc.totalDebt + '\n';
    content += '日供: ' + calc.dailyPayment + ' 筹码/局\n';
    content += '还款方式: 每局结束自动扣款\n';
    content += '\n筹码归零才能再借。\n随时可退出，负债可后续还清。\n确认借款吗？';

    wx.showModal({
      title: '借款确认',
      content: content,
      confirmText: '确认借款',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) {
          const result = this.playerData.economy.borrow(bigBlind, years);
          if (result.success) {
            // 同步到游戏中的玩家筹码
            if (this.gameLogic && this.gameLogic.players[this.mySeatIndex]) {
              this.gameLogic.players[this.mySeatIndex].chips = this.playerData.economy.coins;
            }
            wx.showModal({
              title: '借款成功',
              content: '到手: ' + calc.loanAmount + '\n日供: ' + calc.dailyPayment + '/局\n总欠: ' + calc.totalDebt + '\n\n' + result.message,
              showCancel: false,
              confirmText: '开工还钱'
            });

            // 如果游戏场景中，继续游戏
            if (this.scenes.game && this.gameLogic) {
              this.scenes.game.showMessage('借款到手' + calc.loanAmount + '，开始玩', 2000);
              setTimeout(() => this.startNextHand(), 1000);
            }
          } else {
            wx.showToast({ title: result.message, icon: 'none', duration: 3000 });
          }
        }
      }
    });
  }

  /**
   * 还款 — 游戏中用Canvas面板，大厅用wx.showModal
   */
  _showRepayDialog() {
    const economy = this.playerData.economy.getInfo();
    if (economy.loanBalance <= 0) {
      wx.showToast({ title: '当前没有贷款', icon: 'none' });
      return;
    }

    // 如果在游戏场景中，用Canvas面板
    if (this.scenes.game && this.gameLogic) {
      this.scenes.game.showRepayPanel = true;
      this.scenes.game.repayAmount = Math.min(economy.coins > 0 ? economy.coins : 0, economy.loanBalance);
      return;
    }

    // 大厅中用wx.showModal（缩短内容避免太小）
    wx.showModal({
      title: '地下钱庄 - 还款',
      content: '欠款:' + economy.loanBalance + ' 日供:' + economy.dailyPayment + '/局 筹码:' + economy.coins + '\n输入还款金额(≤' + economy.coins + '):',
      editable: true,
      placeholderText: '金额',
      success: (res) => {
        if (res.confirm && res.content) {
          const amount = _parseAmount(res.content);
          if (amount === null || amount <= 0) {
            wx.showToast({ title: '请输入有效金额', icon: 'none' });
            return;
          }
          const result = this.playerData.economy.repay(amount);
          if (result.success) {
            if (this.gameLogic && this.gameLogic.players[this.mySeatIndex]) {
              this.gameLogic.players[this.mySeatIndex].chips = this.playerData.economy.coins;
            }
            wx.showModal({
              title: '还款成功',
              content: result.message + (this.playerData.economy.getInfo().hasDebt ? '' : '\n\n负债已清！恢复自由身'),
              showCancel: false,
              confirmText: '好的'
            });
          } else {
            wx.showToast({ title: result.message, icon: 'none', duration: 2500 });
          }
        }
      }
    });
  }

  /**
   * 局内钱庄入口（所有模式通用：真实金币 + 地下钱庄）
   */
  showInGameLoan() {
    const economy = this.playerData.economy.getInfo();

    if (economy.canBorrow) {
      // 可以借款（筹码归零且无负债）
      this.showLoanCenter();
    } else if (economy.hasDebt) {
      // 有负债，可以还款
      wx.showModal({
        title: '地下钱庄',
        content: '当前欠款: ' + economy.loanBalance + '\n日供: ' + economy.dailyPayment + '/局\n筹码: ' + economy.coins + '\n\n要还款吗？',
        confirmText: '去还款',
        cancelText: '关闭',
        success: (res) => {
          if (res.confirm) this._showRepayDialog();
        }
      });
    } else {
      wx.showToast({
        title: '筹码充足，无需借贷',
        icon: 'none',
        duration: 2000
      });
    }
  }

  /**
   * 借款弹窗（筹码归零时触发）
   */
  _showBorrowDialog() {
    const economy = this.playerData.economy.getInfo();
    const bigBlind = this.gameLogic ? this.gameLogic.bigBlind : ROOM_CONFIG.DEFAULT_BIG_BLIND;
    const loanAmount = bigBlind * 100;

    wx.showModal({
      title: '筹码归零！',
      content: '地下钱庄可以借你 ' + loanAmount + ' 筹码。\n年利率10%，每局自动扣日供。\n\n' + this.playerData.economy.getTaunt('onBorrow') + '\n\n去钱庄借款？',
      confirmText: '去借钱',
      cancelText: '返回大厅',
      success: (res) => {
        if (res.confirm) {
          this.showLoanCenter();
        } else {
          // 选择返回大厅
          this.switchScene('lobby');
        }
      }
    });
  }

  /**
   * 确认还款（从Canvas面板调用）
   */
  confirmRepay(amount) {
    const result = this.playerData.economy.repay(amount);
    if (result.success) {
      if (this.gameLogic && this.gameLogic.players[this.mySeatIndex]) {
        this.gameLogic.players[this.mySeatIndex].chips = this.playerData.economy.coins;
      }
      const cleared = !this.playerData.economy.getInfo().hasDebt;
      if (this.scenes.game) {
        let msg = result.message;
        if (cleared) msg += '\n负债已清！恢复自由身';
        this.scenes.game.showMessage(msg, 3000);
      }
    } else {
      if (this.scenes.game) {
        this.scenes.game.showMessage(result.message, 2500);
      }
    }
    return result;
  }

  /**
   * 退出游戏 — 所有模式随时可退，不惩罚
   * 负债可以留着，通过AI对战赚钱还款
   */
  tryExitGame() {
    return true;
  }

  /**
   * 服务器地址设置（联机对战需要配置）
   */
  showServerSettings() {
    const current = this._getServerUrl();
    wx.showModal({
      title: '联机服务器地址',
      content: '当前: ' + current + '\n\n输入 wss:// 或 ws:// 开头的地址。\n留空则恢复默认。',
      editable: true,
      placeholderText: 'wss://your-server.com',
      success: (res) => {
        if (res.confirm) {
          const url = (res.content || '').trim();
          if (url === '') {
            Storage.remove('serverUrl');
            wx.showToast({ title: '已恢复默认地址', icon: 'none' });
          } else if (/^wss?:\/\//.test(url)) {
            Storage.set('serverUrl', url);
            wx.showToast({ title: '服务器地址已保存', icon: 'success' });
          } else {
            wx.showToast({ title: '地址需以 ws:// 或 wss:// 开头', icon: 'none', duration: 2500 });
          }
        }
      }
    });
  }
}

module.exports = GameApp;
