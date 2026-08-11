/**
 * Combined HTTP + WebSocket server for Texas Hold'em online poker.
 *
 * - HTTP GET: serves static files from ./public/ (browser client)
 * - WebSocket: authoritative poker game server (Room/PokerGame/AIPlayer)
 *
 * Run: node deploy/server.js
 * Port: PORT env var (default 8080)
 *
 * The same URL serves both the browser client (HTTP) and the game (WS upgrade).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PokerGame = require(path.join(__dirname, '..', 'src', 'core', 'PokerGame'));
const Player = require(path.join(__dirname, '..', 'src', 'core', 'Player'));
const AIPlayer = require(path.join(__dirname, '..', 'src', 'ai', 'AIPlayer'));
const { ROOM_CONFIG, AI_DIFFICULTY, HAND_RANK_NAMES } = require(path.join(__dirname, '..', 'src', 'config'));

const PORT = parseInt(process.env.PORT || '8080', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ==================== HTTP static server ====================

const httpServer = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // Security: prevent path traversal
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html for SPA routes
      if (urlPath !== '/index.html') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not Found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(d2);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ==================== WebSocket server (attached to HTTP) ====================

const wss = new WebSocketServer({ server: httpServer });

// ==================== Room class (identical logic to server/server.js) ====================

class Room {
  constructor(id, config, hostPlayerId) {
    this.id = id;
    this.smallBlind = config.smallBlind || ROOM_CONFIG.DEFAULT_SMALL_BLIND;
    this.bigBlind = config.bigBlind || ROOM_CONFIG.DEFAULT_BIG_BLIND;
    this.initialChips = config.initialChips || ROOM_CONFIG.DEFAULT_INITIAL_CHIPS;
    this.maxPlayers = Math.max(2, Math.min(9, config.maxPlayers || ROOM_CONFIG.DEFAULT_MAX_PLAYERS));
    // aiCount：房主期望的固定AI数量；其余座位留作好友空位（不自动填AI）
    this.aiCount = config.aiCount != null ? Math.max(0, Math.min(config.aiCount, this.maxPlayers - 1)) : (this.maxPlayers - 1);
    this.aiDifficulty = config.aiDifficulty != null ? config.aiDifficulty : AI_DIFFICULTY.NORMAL;
    this.allowAIFill = config.allowAIFill !== false;

    this.members = new Map();
    this.hostId = hostPlayerId;
    this.game = null;
    this.aiEntries = new Map();
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

  addHuman(playerId, info, clientId, ws) {
    let m = this.members.get(playerId);
    if (m) {
      m.clientId = clientId;
      m.ws = ws;
      m.connected = true;
      if (info && info.name) m.name = info.name;
      if (info && info.avatar) m.avatar = info.avatar;
    } else {
      m = {
        playerId,
        name: (info && info.name) || ('Player' + playerId.slice(-4)),
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
    const names = ['诸葛亮', '曹操', '李白', '和珅', '周瑜', '韩信', '岳飞', '孙权'];
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

  startNextHand() {
    if (this.handInProgress) return;
    const humans = this.connectedHumans();
    if (humans.length === 0) return;

    const roster = humans.slice();
    let aiSeq = 0;
    // 只填充到「人类数 + 期望AI数」，剩余座位留给好友（不自动填AI）
    const targetTotal = Math.min(this.maxPlayers, humans.length + this.aiCount);
    while (roster.length < targetTotal) {
      let ai = [...this.members.values()].find(m => m.isAI && !roster.includes(m));
      if (!ai) ai = this._createAIMember(aiSeq++);
      roster.push(ai);
    }

    this.game = new PokerGame({
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      practiceMode: false,
      onEvent: () => {}
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

  _tick() {
    const game = this.game;
    if (!game) return;

    if (game.isHandOver) {
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
      const m = this.members.get(cur.id);
      if (!m || !m.connected) {
        try { game.playerFold(idx); } catch (e) { /* ignore */ }
        this._broadcastState();
        this._tick();
        return;
      }
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
          id: p.id, name: p.name, seatIndex: p.seatIndex,
          chips: p.chips, currentBet: p.currentBet, totalBet: p.totalBet,
          status: p.status, isFolded: p.isFolded, isAllIn: p.isAllIn,
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
    if (!cur || cur.id !== m.playerId) return;
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

  _buildSnapshotFor(member) {
    const game = this.game;
    if (!game) return null;
    const myPlayer = game.players.find(p => p.id === member.playerId);
    const mySeat = myPlayer ? myPlayer.seatIndex : -1;

    const players = game.players.map(p => {
      const pub = {
        id: p.id, name: p.name, avatar: p.avatar, seatIndex: p.seatIndex,
        chips: Math.floor(p.chips), currentBet: Math.floor(p.currentBet),
        totalBet: Math.floor(p.totalBet), isFolded: p.isFolded, isAllIn: p.isAllIn,
        isAI: p.isAI, lastAction: p.lastAction, status: p.status,
        holeCards: []
      };
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
        playerName: w.player ? w.player.name : (w.playerName || ''),
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

// ==================== Connection handling ====================

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
        room.startNextHand();
        break;
      }

      case 'joinRoom': {
        let target = rooms.get(message.roomId);
        if (!target) {
          // 房间不存在（常见于服务器休眠后内存清空）：自动创建，加入者先占位等待好友
          console.log('joinRoom: 房间', message.roomId, '不存在，自动创建');
          target = new Room(message.roomId, message.config || {}, clientId);
          rooms.set(message.roomId, target);
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
        target.broadcast({ type: 'playerJoined', playerId: pid, playerInfo: message.playerInfo }, clientId);
        const snap = target._buildSnapshotFor(target.members.get(pid));
        if (snap) ws.send(JSON.stringify(snap));
        // 好友中途加入：立即结束当前这手并重发新一手，让新玩家直接参与对局
        // （成员余额按入局前金额保存，中途重发不会丢失筹码）
        if (target.handInProgress) {
          if (target.aiTimer) { clearTimeout(target.aiTimer); target.aiTimer = null; }
          if (target.nextHandTimer) { clearTimeout(target.nextHandTimer); target.nextHandTimer = null; }
          target.handInProgress = false;
          if (target.game) target.game.isHandOver = true;
        }
        target.startNextHand();
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

// ==================== Start ====================

httpServer.listen(PORT, () => {
  console.log(`Texas Hold'em server running on port ${PORT}`);
  console.log(`  Browser client: http://localhost:${PORT}`);
  console.log(`  WebSocket:       ws://localhost:${PORT}`);
});

module.exports = { httpServer, wss, rooms, Room };
