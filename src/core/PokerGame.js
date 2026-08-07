/**
 * 德州扑克游戏状态机
 * 100% 符合国际德州扑克规则
 *
 * 流程：发牌 → 盲注 → 翻牌前 → 翻牌 → 转牌 → 河牌 → 摊牌 → 分配底池
 */

const { Deck, Card } = require('./Deck');
const Player = require('./Player');
const Pot = require('./Pot');
const { evaluateBest, compareHands } = require('./HandEvaluator');
const {
  PHASE, ACTION, PLAYER_STATUS, HAND_RANK_NAMES
} = require('../config');

class PokerGame {
  constructor(config = {}) {
    this.smallBlind = config.smallBlind || 10;
    this.bigBlind = config.bigBlind || 20;
    this.players = [];
    this.deck = null;
    this.communityCards = [];
    this.pot = new Pot();
    this.phase = PHASE.WAITING;
    this.buttonIndex = 0;
    this.currentPlayerIndex = -1;
    this.currentBet = 0;        // 本轮当前最高下注
    this.minRaise = 0;          // 最小加注额
    this.lastRaiserIndex = -1;  // 最后一个加注者
    this.handNumber = 0;
    this.winners = [];
    this.isHandOver = false;
    this.revealedHands = {}; // 局末亮牌：playerId => { cards, rank, rankName, folded }
    this.allowAIFill = config.allowAIFill !== false;
    // 练习（AI对战）模式：公共牌偏向同花/顺子/葫芦等低概率牌型，使其更常出现
    this.practiceMode = config.practiceMode === true;
    this.pendingBoard = null; // 预制偏置公共牌（练习模式使用）

    // 事件回调
    this.onEvent = config.onEvent || (() => {});
  }

  /**
   * 添加玩家
   */
  addPlayer(player) {
    if (this.players.length >= 9) {
      throw new Error('房间已满（最多9人）');
    }
    player.seatIndex = this.players.length;
    this.players.push(player);
    return player;
  }

  /**
   * 移除玩家
   */
  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx >= 0) {
      this.players.splice(idx, 1);
      // 重新分配座位号
      this.players.forEach((p, i) => p.seatIndex = i);
      if (this.buttonIndex >= this.players.length) {
        this.buttonIndex = 0;
      }
    }
  }

  get activePlayers() {
    return this.players.filter(p => p.status !== PLAYER_STATUS.SITTING_OUT);
  }

  get playersInHand() {
    return this.players.filter(p => !p.isFolded && p.status !== PLAYER_STATUS.SITTING_OUT);
  }

  get playersCanAct() {
    return this.players.filter(p => p.canAct);
  }

  /**
   * 开始新一局
   */
  startNewHand() {
    if (this.activePlayers.length < 2) {
      throw new Error('至少需要2名玩家');
    }

    this.handNumber++;
    this.isHandOver = false;
    this.winners = [];
    this.communityCards = [];
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastRaiserIndex = -1;
    this.phase = PHASE.WAITING;

    // 重置底池（防止上一局残留数据）
    this.pot.reset();

    // 重置所有玩家
    for (const p of this.players) {
      p.resetForNewHand();
    }

    // 移动按钮（第一局不移动）
    if (this.handNumber > 1) {
      this.buttonIndex = this.getNextActiveIndex(this.buttonIndex);
    }

    // 洗牌
    this.deck = new Deck();

    // 练习模式：预制偏向"低概率牌型"的公共牌，使同花/顺子/葫芦等更易出现
    if (this.practiceMode) {
      const board = this._buildBiasedBoard();
      // 从牌库移除这5张，避免与随后发出的底牌冲突
      const ids = new Set(board.map(c => c.suit * 13 + c.rank));
      this.deck.cards = this.deck.cards.filter(c => !ids.has(c.suit * 13 + c.rank));
      this.pendingBoard = board;
    } else {
      this.pendingBoard = null;
    }

    // 发底牌（每人2张）
    for (let round = 0; round < 2; round++) {
      for (const p of this.activePlayers) {
        p.dealCard(this.deck.deal());
      }
    }

    // 设置玩家状态为游戏中的等待
    for (const p of this.activePlayers) {
      p.status = PLAYER_STATUS.PLAYING;
    }

    this._emit('handStart', {
      handNumber: this.handNumber,
      buttonIndex: this.buttonIndex
    });

    // 投入盲注
    this._postBlinds();

    // 进入翻牌前
    this.phase = PHASE.PRE_FLOP;
    this._emit('phaseChange', { phase: this.phase });

    // 设置第一个行动玩家
    this._setFirstActingPlayer();

    this._emit('turn', {
      playerIndex: this.currentPlayerIndex,
      phase: this.phase,
      currentBet: this.currentBet,
      minRaise: this.minRaise
    });

    return true;
  }

  /**
   * 投入盲注
   */
  _postBlinds() {
    const active = this.activePlayers;
    let sbIndex, bbIndex;

    if (active.length === 2) {
      // 单挑：按钮是小盲，另一个是大盲
      sbIndex = this.buttonIndex;
      bbIndex = this.getNextActiveIndex(sbIndex);
    } else {
      // 多人：按钮左边第一个是小盲，第二个是大盲
      sbIndex = this.getNextActiveIndex(this.buttonIndex);
      bbIndex = this.getNextActiveIndex(sbIndex);
    }

    const sbPlayer = this.players[sbIndex];
    const bbPlayer = this.players[bbIndex];

    const sbAmount = sbPlayer.postBlind(this.smallBlind);
    sbPlayer.lastAction = ACTION.SMALL_BLIND;
    sbPlayer.hasActed = false; // 盲注后仍需要行动

    const bbAmount = bbPlayer.postBlind(this.bigBlind);
    bbPlayer.lastAction = ACTION.BIG_BLIND;
    bbPlayer.hasActed = false;

    this.currentBet = bbAmount;

    this._emit('blindsPosted', {
      sbIndex, bbIndex,
      sbAmount, bbAmount
    });
  }

  /**
   * 设置翻牌前第一个行动玩家
   */
  _setFirstActingPlayer() {
    if (this.phase === PHASE.PRE_FLOP) {
      // 大盲左边第一个
      const active = this.activePlayers;
      let bbIndex;
      if (active.length === 2) {
        bbIndex = this.getNextActiveIndex(this.buttonIndex); // 非按钮玩家
        bbIndex = this.getNextActiveIndex(bbIndex); // 回到按钮玩家
        // 单挑中，翻牌前按钮玩家（小盲）先行动
        this.currentPlayerIndex = this.buttonIndex;
      } else {
        let sbIndex = this.getNextActiveIndex(this.buttonIndex);
        bbIndex = this.getNextActiveIndex(sbIndex);
        this.currentPlayerIndex = this.getNextActiveIndex(bbIndex);
      }
    } else {
      // 翻牌后：按钮左边第一个
      this.currentPlayerIndex = this.getNextActiveIndex(this.buttonIndex);
    }

    // 确保选中的玩家可以行动
    if (!this.players[this.currentPlayerIndex] || !this.players[this.currentPlayerIndex].canAct) {
      this._advanceToNextActor();
    }
  }

  /**
   * 获取下一个活跃玩家索引
   */
  getNextActiveIndex(fromIndex) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n;
      const p = this.players[idx];
      if (p && p.status !== PLAYER_STATUS.SITTING_OUT) {
        return idx;
      }
    }
    return fromIndex;
  }

  /**
   * 前进到下一个可以行动的玩家
   */
  _advanceToNextActor() {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % n;
      const p = this.players[this.currentPlayerIndex];
      if (p && p.canAct) {
        return true;
      }
    }
    this.currentPlayerIndex = -1;
    return false;
  }

  /**
   * 检查本轮下注是否结束
   */
  _isBettingRoundOver() {
    const canActPlayers = this.playersCanAct;
    if (canActPlayers.length === 0) return true;

    // 所有可行动玩家都已行动且下注一致
    for (const p of canActPlayers) {
      if (!p.hasActed) return false;
      if (p.currentBet < this.currentBet && !p.isAllIn) return false;
    }

    return true;
  }

  /**
   * 检查是否只剩一个未弃牌玩家
   */
  _onlyOnePlayerRemaining() {
    return this.playersInHand.length <= 1;
  }

  /**
   * 玩家行动：弃牌
   */
  playerFold(playerIndex) {
    this._validateTurn(playerIndex);
    const player = this.players[playerIndex];
    player.fold();

    this._emit('playerAction', {
      playerIndex, action: ACTION.FOLD, amount: 0
    });

    if (this._onlyOnePlayerRemaining()) {
      this._endHandEarly();
      return;
    }

    this._afterAction();
  }

  /**
   * 玩家行动：过牌
   */
  playerCheck(playerIndex) {
    this._validateTurn(playerIndex);
    const player = this.players[playerIndex];

    if (player.currentBet < this.currentBet) {
      throw new Error('当前需要跟注，无法过牌');
    }

    player.check();

    this._emit('playerAction', {
      playerIndex, action: ACTION.CHECK, amount: 0
    });

    this._afterAction();
  }

  /**
   * 玩家行动：跟注
   */
  playerCall(playerIndex) {
    this._validateTurn(playerIndex);
    const player = this.players[playerIndex];

    const callAmount = this.currentBet - player.currentBet;
    if (callAmount <= 0) {
      return this.playerCheck(playerIndex);
    }

    const actual = player.call(callAmount);

    this._emit('playerAction', {
      playerIndex,
      action: player.lastAction,
      amount: actual
    });

    this._afterAction();
  }

  /**
   * 玩家行动：加注/下注
   * @param {number} totalAmount - 加注到的总额
   */
  playerRaise(playerIndex, totalAmount) {
    this._validateTurn(playerIndex);
    const player = this.players[playerIndex];

    // 全局取整：防止浮点金额
    totalAmount = Math.round(totalAmount);

    if (totalAmount > player.chips + player.currentBet) {
      throw new Error('筹码不足');
    }

    const raiseAmount = totalAmount - this.currentBet;

    // 检查最小加注
    if (raiseAmount > 0 && raiseAmount < this.minRaise && totalAmount < player.chips + player.currentBet) {
      throw new Error(`最小加注额为 ${this.minRaise}`);
    }

    // 全押不受最小加注限制
    const actual = player.raise(totalAmount);
    const newBet = player.currentBet;

    if (newBet > this.currentBet) {
      const raiseDelta = newBet - this.currentBet;
      if (raiseDelta >= this.minRaise) {
        this.minRaise = raiseDelta;
      }
      this.currentBet = newBet;
      this.lastRaiserIndex = playerIndex;

      // 其他所有未全押的玩家需要重新行动
      for (const p of this.players) {
        if (p !== player && p.canAct) {
          p.hasActed = false;
        }
      }
    }

    this._emit('playerAction', {
      playerIndex,
      action: player.lastAction,
      amount: actual
    });

    this._afterAction();
  }

  /**
   * 玩家行动：全押
   */
  playerAllIn(playerIndex) {
    this._validateTurn(playerIndex);
    const player = this.players[playerIndex];

    const allInTotal = player.chips + player.currentBet;
    const actual = player.allIn();

    // 如果全押金额超过当前下注，相当于加注
    if (allInTotal > this.currentBet) {
      const raiseDelta = allInTotal - this.currentBet;
      // 全押可以不满最小加注
      if (raiseDelta >= this.minRaise) {
        this.minRaise = raiseDelta;
      }
      this.currentBet = allInTotal;
      this.lastRaiserIndex = playerIndex;

      for (const p of this.players) {
        if (p !== player && p.canAct) {
          p.hasActed = false;
        }
      }
    }

    this._emit('playerAction', {
      playerIndex,
      action: ACTION.ALL_IN,
      amount: actual
    });

    if (this._onlyOnePlayerRemaining()) {
      // 还有人没弃牌但只剩一个能比牌的
      // 继续到摊牌
    }

    this._afterAction();
  }

  /**
   * 行动后的处理
   */
  _afterAction() {
    // 检查本轮是否结束
    if (this._isBettingRoundOver()) {
      this._endBettingRound();
    } else {
      // 前进到下一个玩家
      this._advanceToNextActor();

      if (this.currentPlayerIndex === -1) {
        // 没有人可以行动了
        this._endBettingRound();
      } else {
        this._emit('turn', {
          playerIndex: this.currentPlayerIndex,
          phase: this.phase,
          currentBet: this.currentBet,
          minRaise: this.minRaise
        });
      }
    }
  }

  /**
   * 结束本轮下注
   */
  _endBettingRound() {
    // 收集本轮下注到底池
    this._collectPot();

    // 检查是否只剩一个未弃牌玩家
    if (this._onlyOnePlayerRemaining()) {
      this._endHandEarly();
      return;
    }

    // 检查是否所有剩余玩家都已全押
    const playersInHand = this.playersInHand;
    const allAllIn = playersInHand.every(p => p.isAllIn);

    // 推进到下一个阶段
    if (this.phase === PHASE.PRE_FLOP) {
      this._dealFlop();
    } else if (this.phase === PHASE.FLOP) {
      this._dealTurn();
    } else if (this.phase === PHASE.TURN) {
      this._dealRiver();
    } else if (this.phase === PHASE.RIVER) {
      this._showdown();
      return;
    }

    // 如果所有人都全押，直接发完所有牌然后摊牌
    if (allAllIn && this.phase !== PHASE.RIVER) {
      this._endBettingRound();
    } else if (allAllIn && this.phase === PHASE.RIVER) {
      this._showdown();
    } else {
      // 新一轮下注
      this.currentBet = 0;
      this.minRaise = this.bigBlind;
      this.lastRaiserIndex = -1;

      for (const p of this.players) {
        if (p.canAct) {
          p.resetForNewRound();
        }
      }

      this._setFirstActingPlayer();

      if (this.currentPlayerIndex === -1) {
        // 没有人可以行动（全全押场景）
        this._endBettingRound();
      } else {
        this._emit('turn', {
          playerIndex: this.currentPlayerIndex,
          phase: this.phase,
          currentBet: this.currentBet,
          minRaise: this.minRaise
        });
      }
    }
  }

  /**
   * 收集底池
   */
  _collectPot() {
    const playerBets = new Map();
    const foldedPlayerIds = new Set();

    for (const p of this.players) {
      if (p.totalBet > 0 || p.currentBet > 0) {
        playerBets.set(p.id, p.totalBet);
        if (p.isFolded) {
          foldedPlayerIds.add(p.id);
        }
      }
    }

    this.pot.collectBets(playerBets, foldedPlayerIds);

    this._emit('potUpdated', this.pot.getInfo());
  }

  _dealFlop() {
    this.deck.deal(); // 烧牌
    if (this.pendingBoard && this.pendingBoard.length > 0) {
      this.communityCards.push(this.pendingBoard.shift());
      this.communityCards.push(this.pendingBoard.shift());
      this.communityCards.push(this.pendingBoard.shift());
    } else {
      for (let i = 0; i < 3; i++) {
        this.communityCards.push(this.deck.deal());
      }
    }
    this.phase = PHASE.FLOP;
    this._emit('phaseChange', { phase: this.phase, communityCards: this.communityCards.map(c => c.toString()) });
  }

  _dealTurn() {
    this.deck.deal(); // 烧牌
    this.communityCards.push(
      this.pendingBoard && this.pendingBoard.length > 0
        ? this.pendingBoard.shift() : this.deck.deal()
    );
    this.phase = PHASE.TURN;
    this._emit('phaseChange', { phase: this.phase, communityCards: this.communityCards.map(c => c.toString()) });
  }

  _dealRiver() {
    this.deck.deal(); // 烧牌
    this.communityCards.push(
      this.pendingBoard && this.pendingBoard.length > 0
        ? this.pendingBoard.shift() : this.deck.deal()
    );
    this.phase = PHASE.RIVER;
    this._emit('phaseChange', { phase: this.phase, communityCards: this.communityCards.map(c => c.toString()) });
  }

  /**
   * 只剩一个玩家时提前结束
   */
  _endHandEarly() {
    // 收集当前轮次所有下注到底池（防止遗漏当前轮下注）
    this._collectPot();

    const winner = this.playersInHand[0];
    const winAmount = this.pot.totalAmount;

    winner.chips += winAmount;
    winner.recordHandResult(true, winAmount - winner.totalBet);

    // 记录其他玩家
    for (const p of this.players) {
      if (p !== winner && p.status !== PLAYER_STATUS.SITTING_OUT) {
        p.recordHandResult(false, -p.totalBet);
      }
    }

    this.winners = [{ player: winner, amount: winAmount, hand: null }];
    this.isHandOver = true;
    this.phase = PHASE.HAND_OVER;

    // 亮牌：即使他人弃牌，也展示所有人的底牌，便于玩家核实
    this.revealedHands = this._computeRevealedHands();

    this._emit('handOver', {
      winners: [{ playerId: winner.id, amount: winAmount }],
      reason: 'everyone_else_folded',
      revealedHands: this.revealedHands
    });
  }

  _calculatePotTotal() {
    return this.players.reduce((sum, p) => sum + p.totalBet, 0);
  }

  /**
   * 摊牌
   */
  _showdown() {
    this.phase = PHASE.SHOWDOWN;
    this._collectPot();

    // 评估每个玩家的手牌
    const handResults = new Map();
    const playerHands = {};

    for (const p of this.playersInHand) {
      const allCards = [...p.holeCards, ...this.communityCards];
      const result = evaluateBest(allCards);
      handResults.set(p.id, result);
      playerHands[p.id] = {
        cards: p.holeCards.map(c => c.toString()),
        rank: result.rank,
        rankName: HAND_RANK_NAMES[result.rank],
        kickers: result.kickers
      };
    }

    // 分配底池
    const winnings = this.pot.distribute(handResults);

    // 记录结果
    this.winners = [];
    for (const [playerId, amount] of winnings) {
      const player = this.players.find(p => p.id === playerId);
      if (player) {
        player.chips += amount;
        const profit = amount - player.totalBet;
        player.recordHandResult(profit > 0, profit);
        this.winners.push({
          player,
          amount,
          hand: handResults.get(playerId)
        });
      }
    }

    // 记录未赢的玩家
    for (const p of this.playersInHand) {
      if (!winnings.has(p.id)) {
        p.recordHandResult(false, -p.totalBet);
      }
    }

    // 亮牌：计算所有玩家（含弃牌）的牌型，供UI展示与胜负校验
    this.revealedHands = this._computeRevealedHands();

    this.isHandOver = true;
    this.phase = PHASE.HAND_OVER;

    this._emit('showdown', {
      communityCards: this.communityCards.map(c => c.toString()),
      playerHands,
      winners: this.winners.map(w => ({
        playerId: w.player.id,
        amount: w.amount,
        handRank: w.hand ? w.hand.rank : 0,
        handRankName: w.hand ? HAND_RANK_NAMES[w.hand.rank] : ''
      }))
    });

    this._emit('handOver', {
      winners: this.winners.map(w => ({
        playerId: w.player.id,
        amount: w.amount,
        handRankName: w.hand ? HAND_RANK_NAMES[w.hand.rank] : ''
      })),
      reason: 'showdown',
      revealedHands: this.revealedHands
    });
  }

  /**
   * 计算所有玩家的亮牌信息（含已弃牌玩家），用于局末展示与胜负校验
   * @returns {object} playerId => { cards, rank, rankName, folded }
   */
  _computeRevealedHands() {
    const map = {};
    for (const p of this.players) {
      if (!p.holeCards || p.holeCards.length < 2) continue;
      const all = [...p.holeCards, ...this.communityCards];
      if (all.length >= 5) {
        const res = evaluateBest(all);
        map[p.id] = {
          cards: p.holeCards.map(c => c.toString()),
          rank: res.rank,
          rankName: HAND_RANK_NAMES[res.rank],
          folded: p.isFolded
        };
      } else {
        // 未到摊牌（如翻牌前就弃牌），只亮底牌，无完整牌型
        map[p.id] = {
          cards: p.holeCards.map(c => c.toString()),
          rank: 0,
          rankName: '',
          folded: p.isFolded
        };
      }
    }
    return map;
  }

  /**
   * 练习模式：预制偏向"低概率牌型"的公共牌。
   * 从完整牌库挑选5张构成翻牌/转牌/河牌，使同花、顺子、葫芦等更易出现，
   * 让对局更刺激好看。返回后即可从牌库移除这5张，避免与底牌冲突。
   * @returns {Card[]} 恰好5张互不重复的牌
   */
  _buildBiasedBoard() {
    const pool = this.deck.cards.slice(); // 复制牌库，从中挑选
    const pick = (suit, rank) => {
      const idx = pool.findIndex(c => c.suit === suit && c.rank === rank);
      if (idx === -1) return null;
      return pool.splice(idx, 1)[0];
    };
    const board = [];
    const fill = () => {
      while (board.length < 5 && pool.length > 0) {
        const i = Math.floor(Math.random() * pool.length);
        board.push(pool.splice(i, 1)[0]);
      }
    };

    const r = Math.random();
    if (r < 0.30) {
      // 同花倾向：同一花色放3~4张
      const suit = Math.floor(Math.random() * 4);
      const n = Math.random() < 0.5 ? 3 : 4;
      const ranks = this._shuffleArr([...Array(13).keys()]).slice(0, n);
      for (const rk of ranks) { const c = pick(suit, rk); if (c) board.push(c); }
      fill();
    } else if (r < 0.55) {
      // 顺子倾向：连续点数放3~4张（可跨花色）
      const start = Math.floor(Math.random() * 9); // 0..8，保证 start+3 <= 11
      const n = Math.random() < 0.5 ? 3 : 4;
      for (let k = 0; k < n; k++) {
        let c = null, tries = 0;
        while (!c && tries < 4) { c = pick(Math.floor(Math.random() * 4), start + k); tries++; }
        if (c) board.push(c);
      }
      fill();
    } else if (r < 0.67) {
      // 葫芦/四条倾向：两个点数成对（3张 + 2张）
      const ranks = this._shuffleArr([...Array(13).keys()]);
      const r1 = ranks[0], r2 = ranks[1];
      const s1 = this._shuffleArr([0, 1, 2, 3]).slice(0, 3);
      const s2 = this._shuffleArr([0, 1, 2, 3]).slice(0, 2);
      for (const s of s1) { const c = pick(s, r1); if (c) board.push(c); }
      for (const s of s2) { const c = pick(s, r2); if (c) board.push(c); }
      fill();
    } else {
      // 普通随机5张
      fill();
    }
    fill(); // 兜底，确保恰好5张
    return board.slice(0, 5);
  }

  _shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _validateTurn(playerIndex) {
    if (this.isHandOver) {
      throw new Error('本局已结束');
    }
    if (playerIndex !== this.currentPlayerIndex) {
      throw new Error('不是你的回合');
    }
    const player = this.players[playerIndex];
    if (!player || !player.canAct) {
      throw new Error('该玩家无法行动');
    }
  }

  _emit(event, data) {
    this.onEvent(event, data);
  }

  /**
   * 获取当前需要跟注的金额
   */
  getCallAmount(playerIndex) {
    const player = this.players[playerIndex];
    if (!player) return 0;
    return Math.max(0, this.currentBet - player.currentBet);
  }

  /**
   * 获取最小加注到的总额
   */
  getMinRaiseTotal(playerIndex) {
    const player = this.players[playerIndex];
    if (!player) return 0;
    return this.currentBet + this.minRaise;
  }

  /**
   * 获取游戏状态快照
   */
  getState() {
    return {
      phase: this.phase,
      handNumber: this.handNumber,
      buttonIndex: this.buttonIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      potInfo: this.pot.getInfo(),
      communityCards: this.communityCards.map(c => c.toString()),
      players: this.players.map(p => ({
        ...p.toPublicInfo(),
        holeCards: p.holeCards.map(c => c.toString())
      })),
      isHandOver: this.isHandOver,
      winners: this.winners.map(w => ({
        playerId: w.player.id,
        amount: w.amount,
        handRankName: w.hand ? HAND_RANK_NAMES[w.hand.rank] : ''
      }))
    };
  }
}

module.exports = PokerGame;
