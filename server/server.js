/**
 * 德州扑克联机房 —— 权威服务器
 *
 * 架构：服务器持有权威的 PokerGame 实例，负责发牌、驱动 AI 回合、校验真人动作，
 *       并在每一步向所有客户端广播可序列化状态快照。客户端只负责渲染快照与发送动作，
 *       不本地运行任何游戏逻辑，从根本上避免多端状态不一致。
 *
 * 运行：node server/server.js   （依赖 ws：npm install ws）
 * 端口：环境变量 PORT / LISTEN_PORT，默认 8080
 * 生产部署：需用 wss:// 并配置可信证书，并在微信公众平台配置 request 合法域名。
 */

const { WebSocketServer } = require('ws');
const path = require('path');

const PokerGame = require(path.join(__dirname, '..', 'src', 'core', 'PokerGame'));
const Player = require(path.join(__dirname, '..', 'src', 'core', 'Player'));
const AIPlayer = require(path.join(__dirname, '..', 'src', 'ai', 'AIPlayer'));
const { ROOM_CONFIG, AI_DIFFICULTY, HAND_RANK_NAMES, RANK_NAMES, SUIT_SYMBOLS } = require(path.join(__dirname, '..', 'src', 'config'));

const PORT = parseInt(process.env.PORT || process.env.LISTEN_PORT || '8080', 10);

const wss = new WebSocketServer({ port: PORT });

// ==================== 房间管理 ====================

class Room {
  constructor(id, config, hostPlayerId) {
    this.id = id;
    this.smallBlind = config.smallBlind || ROOM_CONFIG.DEFAULT_SMALL_BLIND;
    this.bigBlind = config.bigBlind || ROOM_CONFIG.DEFAULT_BIG_BLIND;
    this.initialChips = config.initialChips || ROOM_CONFIG.DEFAULT_INITIAL_CHIPS;
    this.maxPlayers = Math.max(2, Math.min(9, config.maxPlayers || ROOM_CONFIG.DEFAULT_MAX_PLAYERS));
    this.aiDifficulty = config.aiDifficulty != null ? config.aiDifficulty : AI_DIFFICULTY.NORMAL;
    this.allowAIFill = config.allowAIFill !== false;

    // 成员表：playerId => Member
    // Member: { playerId, name, avatar, isAI, aiDifficulty, clientId, ws, connected, balance }
    this.members = new Map();
    this.hostId = hostPlayerId;

    this.game = null;
    this.aiEntries = new Map(); // seatIndex => AIPlayer
    this.handInProgress = false;
    this.nextHandTimer = null;
    this.aiTimer = null;
  }

  memberByClient(clientId) {
    for (const m of this.members.values()) {
      if (m.clientId === clientId) return m;
    }
    return null;
  }

  /**
   * 加入/重连一个真人。重连时（playerId 已存在）恢复其状态与余额。
   */
  addHuman(playerId, info, clientId, ws) {
    let m = this.members.get(playerId);
    if (m) {
      // 重连：恢复连接
      m.clientId = clientId;
      m.ws = ws;
      m.connected = true;
      if (info && info.name) m.name = info.name;
      if (info && info.avatar) m.avatar = info.avatar;
    } else {
      m = {
        playerId,
        name: (info && info.name) || ('玩家' + playerId.slice(-4)),
        avatar: (info && info.avatar) || '',
        isAI: false,
        aiDifficulty: 0,
        clientId,
        ws,
        connected: true,
        balance: this.initialChips
      };
      this.members.set(playerId, m);
    }
    return m;
  }

  _createAIMember(seq) {
    const names = ['诸葛亮', '曹操', '李白', '和珅', '周瑜', '韩信', '拿破仑', '牛顿'];
    const id = 'ai_' + this.id + '_' + seq;
    const m = {
      playerId: id,
      name: names[seq % names.length],
      avatar: '',
      isAI: true,
      aiDifficulty: this.aiDifficulty,
      clientId: null,
      ws: null,
      connected: true,
      balance: this.initialChips
    };
    this.members.set(id, m);
    return m;
  }

  removeByClient(clientId) {
    const m = this.memberByClient(clientId);
    if (m) {
      m.connected = false;
      m.clientId = null;
      m.ws = null;
      // 通知其它人
      this.broadcast({ type: 'playerLeft', playerId: m.playerId, connected: false }, clientId);
    }
  }

  connectedHumans() {
    return [...this.members.values()].filter(m => !m.isAI && m.connected);
  }

  broadcast(message, excludeClientId) {
    const data = JSON.stringify(message);
    for (const m of this.members.values()) {
      if (m.ws && m.connected && m.clientId !== excludeClientId) {
        try { m.ws.send(data); } catch (e) { /* ignore */ }
      }
    }
  }

  // ==================== 牌局生命周期 ====================

  startNextHand() {
    if (this.handInProgress) return;
    const humans = this.connectedHumans();
    if (humans.length === 0) {
      // 没有真人，不开始（等有人加入）
      return;
    }

    // 组成本局名单：已连真人在前，AI 补位至 maxPlayers
    const roster = humans.slice();
    let aiSeq = 0;
    while (roster.length < this.maxPlayers) {
      let ai = [...this.members.values()].find(m => m.isAI && !roster.includes(m));
      if (!ai) ai = this._createAIMember(aiSeq++);
      roster.push(ai);
    }

    this.game = new PokerGame({
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      practiceMode: false, // 联机公平模式：不偏置发牌、AI 不刻意让利
      onEvent: () => {}     // 服务器内状态变更统一在 tick 后广播，无需事件
    });
    this.aiEntries = new Map();

    for (const m of roster) {
      const chips = m.isAI ? this.initialChips : Math.max(0, Math.floor(m.balance));
      const pl = new Player(m.playerId, m.name, m.avatar, chips, {
        isAI: m.isAI,
        aiDifficulty: m.aiDifficulty
      });
      this.game.addPlayer(pl);
      if (m.isAI) {
        this.aiEntries.set(pl.id, new AIPlayer(m.aiDifficulty));
      }
    }

    this.handInProgress = true;
    this.game.startNewHand();

    this._broadcastState();
    this._tick();
  }

  /**
   * 回合驱动：根据当前行动者决定是 AI 思考、等待真人，还是进入下一局
   */
  _tick() {
    const game = this.game;
    if (!game) return;

    if (game.isHandOver) {
      // 本局结束：回写余额，广播，安排下一局
      for (const p of game.players) {
        const m = this.members.get(p.id);
        if (m) m.balance = Math.floor(p.chips);
      }
      this.handInProgress = false;
      this._broadcastState();

      if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
      this.nextHandTimer = setTimeout(() => this.startNextHand(), 6000);
      return;
    }

    const idx = game.currentPlayerIndex;
    if (idx < 0) return;
    const cur = game.players[idx];
    if (!cur) return;

    if (cur.isAI) {
      const think = 800 + Math.random() * 1500;
      if (this.aiTimer) clearTimeout(this.aiTimer);
      this.aiTimer = setTimeout(() => {
        if (this.game !== game || game.isHandOver) return;
        if (game.currentPlayerIndex !== idx) return;
        const entry = this.aiEntries.get(cur.id);
        if (!entry) return;
        const decision = entry.decide(this._buildAIContext(cur));
        this._applyDecision(idx, decision);
        this._broadcastState();
        this._tick();
      }, think);
    } else {
      // 真人回合
      const m = this.members.get(cur.id);
      if (!m || !m.connected) {
        // 掉线真人自动弃牌，避免卡死
        try { game.playerFold(idx); } catch (e) { /* ignore */ }
        this._broadcastState();
        this._tick();
        return;
      }
      // 等待真人客户端发送动作
      this._broadcastState();
    }
  }

  _buildAIContext(player) {
    const game = this.game;
    return {
      player,
      practiceMode: false,
      humanId: null,
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
          lastAction: p.lastAction
        }))
      }
    };
  }

  _applyDecision(idx, decision) {
    const game = this.game;
    if (!decision) return;
    try {
      if (decision.action === 'fold') game.playerFold(idx);
      else if (decision.action === 'check') game.playerCheck(idx);
      else if (decision.action === 'call') game.playerCall(idx);
      else if (decision.action === 'raise' || decision.action === 'bet') game.playerRaise(idx, decision.amount);
      else if (decision.action === 'allin') game.playerAllIn(idx);
    } catch (e) {
      console.error('AI 决策执行失败:', e.message);
      try {
        const call = game.getCallAmount(idx);
        if (call === 0) game.playerCheck(idx);
        else game.playerFold(idx);
      } catch (e2) { /* ignore */ }
    }
  }

  handleAction(clientId, action, amount) {
    const m = this.memberByClient(clientId);
    if (!m || !m.connected) return;
    const game = this.game;
    if (!game || game.isHandOver) return;
    const idx = game.currentPlayerIndex;
    if (idx < 0) return;
    const cur = game.players[idx];
    if (!cur || cur.id !== m.playerId) return; // 不是该玩家回合
    if (cur.isAI) return;

    try {
      if (action === 'fold') game.playerFold(idx);
      else if (action === 'check') game.playerCheck(idx);
      else if (action === 'call') game.playerCall(idx);
      else if (action === 'raise' || action === 'bet') game.playerRaise(idx, Math.round(amount));
      else if (action === 'allin') game.playerAllIn(idx);
      else return;
    } catch (e) {
      m.ws && m.ws.send(JSON.stringify({ type: 'error', message: e.message }));
      return;
    }
    this._broadcastState();
    this._tick();
  }

  // ==================== 快照 ====================

  _buildSnapshotFor(member) {
    const game = this.game;
    if (!game) return null;
    const myPlayer = game.players.find(p => p.id === member.playerId);
    const mySeat = myPlayer ? myPlayer.seatIndex : -1;

    const players = game.players.map(p => {
      const pub = {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seatIndex: p.seatIndex,
        chips: Math.floor(p.chips),
        currentBet: Math.floor(p.currentBet),
        totalBet: Math.floor(p.totalBet),
        isFolded: p.isFolded,
        isAllIn: p.isAllIn,
        isAI: p.isAI,
        lastAction: p.lastAction,
        status: p.status,
        holeCards: []
      };
      // 仅向本人下发自己的底牌（对局中），其余人不可见
      if (p.id === member.playerId && !game.isHandOver && p.holeCards) {
        pub.holeCards = p.holeCards.map(c => ({ rank: c.rank, suit: c.suit }));
      }
      return pub;
    });

    return {
      type: 'state',
      roomId: this.id,
      phase: game.phase,
      communityCards: game.communityCards.map(c => ({ rank: c.rank, suit: c.suit })),
      potTotal: game.isHandOver ? 0 : Math.floor(game.pot.totalAmount),
      currentPlayerIndex: game.currentPlayerIndex,
      buttonIndex: game.buttonIndex,
      isHandOver: game.isHandOver,
      mySeatIndex: mySeat,
      minRaise: Math.floor(game.minRaise),
      currentBet: Math.floor(game.currentBet),
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      players,
      revealedHands: game.isHandOver ? this._serializeRevealed(game) : {},
      winners: game.winners.map(w => ({
        playerId: w.player ? w.player.id : (w.playerId || ''),
        amount: Math.floor(w.amount),
        handRankName: w.hand ? HAND_RANK_NAMES[w.hand.rank] : (w.handRankName || '')
      }))
    };
  }

  _serializeRevealed(game) {
    const map = {};
    for (const p of game.players) {
      const rev = game.revealedHands[p.id];
      map[p.id] = {
        cards: p.holeCards.map(c => ({ rank: c.rank, suit: c.suit })),
        rankName: rev ? rev.rankName : '',
        rank: rev ? rev.rank : 0,
        folded: rev ? rev.folded : p.isFolded
      };
    }
    return map;
  }

  _broadcastState() {
    for (const m of this.members.values()) {
      if (!m.ws || !m.connected) continue;
      const snap = this._buildSnapshotFor(m);
      if (snap) {
        try { m.ws.send(JSON.stringify(snap)); } catch (e) { /* ignore */ }
      }
    }
  }

  getInfo() {
    return {
      id: this.id,
      maxPlayers: this.maxPlayers,
      currentPlayers: this.connectedHumans().length,
      inGame: this.handInProgress,
      hasPassword: false
    };
  }
}

// ==================== 服务器入口 ====================

const rooms = new Map();

function generateRoomId() {
  let id;
  do {
    id = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(id));
  return id;
}

wss.on('connection', (ws) => {
  let clientId = 'c_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  let currentRoom = null;

  ws.on('message', (rawData) => {
    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch (e) {
      return;
    }

    switch (message.type) {
      case 'createRoom': {
        const roomId = generateRoomId();
        const hostId = (message.playerInfo && message.playerInfo.playerId) || clientId;
        const room = new Room(roomId, message.config || {}, hostId);
        room.addHuman(hostId, message.playerInfo, clientId, ws);
        rooms.set(roomId, room);
        currentRoom = roomId;

        ws.send(JSON.stringify({
          type: 'roomCreated',
          roomId,
          playerId: hostId,
          roomInfo: room.getInfo()
        }));

        // 房主自动开局
        room.startNextHand();
        break;
      }

      case 'joinRoom': {
        const target = rooms.get(message.roomId);
        if (!target) {
          ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
          return;
        }
        const pid = (message.playerInfo && message.playerInfo.playerId) || clientId;
        target.addHuman(pid, message.playerInfo, clientId, ws);
        currentRoom = message.roomId;

        ws.send(JSON.stringify({
          type: 'roomJoined',
          roomId: message.roomId,
          playerId: pid,
          roomInfo: target.getInfo()
        }));

        // 通知房间内其它成员
        target.broadcast({ type: 'playerJoined', playerId: pid, playerInfo: message.playerInfo }, clientId);

        // 立即下发当前状态（即便牌局进行中也能看到桌面）
        const snap = target._buildSnapshotFor(target.members.get(pid));
        if (snap) ws.send(JSON.stringify(snap));

        // 若当前无人进行中的牌局且已有真人，尝试开局
        if (!target.handInProgress) target.startNextHand();
        break;
      }

      case 'action': {
        if (currentRoom) {
          const r = rooms.get(currentRoom);
          if (r) r.handleAction(clientId, message.action, message.amount);
        }
        break;
      }

      case 'leaveRoom': {
        if (currentRoom) {
          const r = rooms.get(currentRoom);
          if (r) r.removeByClient(clientId);
          currentRoom = null;
        }
        break;
      }

      case 'chat': {
        if (currentRoom) {
          const r = rooms.get(currentRoom);
          if (r) r.broadcast({ type: 'chat', playerId: message.playerId, text: message.text }, clientId);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.removeByClient(clientId);
        // 房间无真人则销毁（保留 AI 无意义）
        if (room.connectedHumans().length === 0) {
          if (room.nextHandTimer) clearTimeout(room.nextHandTimer);
          if (room.aiTimer) clearTimeout(room.aiTimer);
          rooms.delete(currentRoom);
        }
      }
    }
  });

  ws.send(JSON.stringify({ type: 'connected', clientId }));
});

console.log(`Texas Hold'em 权威联机服务器已启动: ws://localhost:${PORT}`);
module.exports = { wss, rooms, Room };
