/**
 * 联机对局视图（权威服务器驱动）
 *
 * 该类镜像 PokerGame 在 GameScene 中需要的只读接口与动作方法：
 * - GameScene 读取 players / communityCards / phase / currentPlayerIndex /
 *   buttonIndex / isHandOver / revealedHands / winners / pot.totalAmount 等字段；
 * - 动作方法（playerFold/playerCheck/playerCall/playerRaise/playerAllIn）改为把动作
 *   发往服务器，由服务器校验并推进权威状态。
 *
 * 所有展示用牌均转换为 { rankName, suitSymbol, isRed } 供 Renderer.drawCard 使用。
 */

const { RANK_NAMES, SUIT_SYMBOLS } = require('../config');

function toDisplayCard(c) {
  if (!c) return null;
  if (c.rankName) return c; // 已是展示对象
  if (c.rank !== undefined && c.suit !== undefined) {
    return {
      rankName: RANK_NAMES[c.rank],
      suitSymbol: SUIT_SYMBOLS[c.suit],
      isRed: c.suit === 1 || c.suit === 2
    };
  }
  return null;
}

class RemoteGame {
  /**
   * @param {GameClient} client 已连接的联机客户端
   * @param {object} opts { onState, onError }
   */
  constructor(client, opts = {}) {
    this.client = client;
    this.onState = opts.onState || (() => {});
    this.onError = opts.onError || (() => {});

    // 镜像 PokerGame 的只读字段
    this.players = [];
    this.communityCards = [];
    this.phase = 'waiting';
    this.currentPlayerIndex = -1;
    this.buttonIndex = 0;
    this.isHandOver = false;
    this.revealedHands = {};
    this.winners = [];
    this.pot = { totalAmount: 0 };
    this.mySeatIndex = 0;
    this.minRaise = 0;
    this.currentBet = 0;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.roomId = null;

    client.on('state', (msg) => this.applySnapshot(msg));
    client.on('error', (msg) => this.onError(msg && msg.message ? msg.message : '联机错误'));
  }

  applySnapshot(snap) {
    if (!snap) return;
    this.roomId = snap.roomId;
    this.phase = snap.phase;
    this.communityCards = (snap.communityCards || []).map(toDisplayCard);
    this.currentPlayerIndex = snap.currentPlayerIndex;
    this.buttonIndex = snap.buttonIndex;
    this.isHandOver = !!snap.isHandOver;
    this.mySeatIndex = snap.mySeatIndex != null ? snap.mySeatIndex : this.mySeatIndex;
    this.minRaise = snap.minRaise || 0;
    this.currentBet = snap.currentBet || 0;
    this.smallBlind = snap.smallBlind || this.smallBlind;
    this.bigBlind = snap.bigBlind || this.bigBlind;
    this.pot = { totalAmount: snap.potTotal || 0 };

    this.players = (snap.players || []).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      seatIndex: p.seatIndex,
      chips: p.chips,
      currentBet: p.currentBet,
      totalBet: p.totalBet,
      isFolded: p.isFolded,
      isAllIn: p.isAllIn,
      isAI: p.isAI,
      lastAction: p.lastAction,
      status: p.status,
      holeCards: (p.holeCards || []).map(toDisplayCard)
    }));

    this.revealedHands = {};
    const rh = snap.revealedHands || {};
    for (const pid of Object.keys(rh)) {
      const r = rh[pid];
      this.revealedHands[pid] = {
        cards: (r.cards || []).map(toDisplayCard),
        rankName: r.rankName || '',
        rank: r.rank || 0,
        folded: !!r.folded
      };
    }

    this.winners = (snap.winners || []).map(w => ({
      playerId: w.playerId,
      amount: w.amount,
      handRankName: w.handRankName || ''
    }));

    this.onState(snap);
  }

  // ==================== 动作（发往服务器） ====================

  _send(action, amount) {
    this.client.sendAction(action, amount);
  }

  playerFold(seat) { this._send('fold'); }
  playerCheck(seat) { this._send('check'); }
  playerCall(seat) { this._send('call'); }
  playerRaise(seat, amount) { this._send('raise', Math.round(amount)); }
  playerAllIn(seat) { this._send('allin'); }

  // ==================== 只读计算（客户端展示用） ====================

  getCallAmount(seat) {
    const p = this.players[seat];
    if (!p) return 0;
    return Math.max(0, this.currentBet - p.currentBet);
  }

  getMinRaiseTotal(seat) {
    const p = this.players[seat];
    if (!p) return this.currentBet + this.minRaise;
    return this.currentBet + this.minRaise;
  }
}

module.exports = RemoteGame;
