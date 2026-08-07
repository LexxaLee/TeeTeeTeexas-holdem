/**
 * 玩家状态管理
 */

const { PLAYER_STATUS, ACTION } = require('../config');

class Player {
  constructor(id, name, avatar, chips, options = {}) {
    this.id = id;
    this.name = name;
    this.avatar = avatar || '';
    this.chips = chips;

    this.isAI = options.isAI || false;
    this.aiDifficulty = options.aiDifficulty || 0;

    this.status = PLAYER_STATUS.WAITING;
    this.seatIndex = -1;  // 座位号

    // 每局重置的字段
    this.holeCards = [];
    this.currentBet = 0;       // 本轮下注
    this.totalBet = 0;         // 本局总下注
    this.lastAction = null;     // 最后一个动作
    this.hasActed = false;      // 本轮是否已行动
    this.allInAmount = 0;       // All-in 时的金额
    this.timeBank = 0;

    // 统计
    this.handsPlayed = 0;
    this.handsWon = 0;
    this.maxWin = 0;
    this.maxWinStreak = 0;
    this.currentWinStreak = 0;
    this.totalProfit = 0;

    // AI 行为历史（供AI决策参考）
    this.actionHistory = [];   // [{ phase, action, amount }]
  }

  resetForNewHand() {
    this.holeCards = [];
    this.currentBet = 0;
    this.totalBet = 0;
    this.lastAction = null;
    this.hasActed = false;
    this.allInAmount = 0;
    this.actionHistory = [];
    if (this.status !== PLAYER_STATUS.SITTING_OUT) {
      this.status = PLAYER_STATUS.WAITING;
    }
  }

  resetForNewRound() {
    this.currentBet = 0;
    this.hasActed = false;
    // 不清除 lastAction，保留供参考
  }

  dealCard(card) {
    this.holeCards.push(card);
  }

  /**
   * 下注
   * @param {number} amount - 下注金额
   * @returns {number} 实际下注金额（可能受筹码限制）
   */
  bet(amount) {
    // 全局取整：防止浮点精度问题导致筹码丢失
    amount = Math.max(0, Math.floor(amount));
    const actual = Math.min(amount, Math.max(0, Math.floor(this.chips)));
    this.chips = Math.floor(this.chips - actual);
    this.currentBet += actual;
    this.totalBet += actual;

    if (this.chips <= 0) {
      this.status = PLAYER_STATUS.ALL_IN;
      this.allInAmount = this.currentBet;
    }

    return actual;
  }

  /**
   * 弃牌
   */
  fold() {
    this.status = PLAYER_STATUS.FOLDED;
    this.lastAction = ACTION.FOLD;
    this.hasActed = true;
    this.actionHistory.push({ action: ACTION.FOLD, amount: 0 });
  }

  /**
   * 过牌
   */
  check() {
    this.lastAction = ACTION.CHECK;
    this.hasActed = true;
    this.actionHistory.push({ action: ACTION.CHECK, amount: 0 });
  }

  /**
   * 跟注
   * @param {number} callAmount - 需要跟注的金额
   */
  call(callAmount) {
    const actual = this.bet(callAmount);
    this.lastAction = actual >= callAmount ? ACTION.CALL : ACTION.ALL_IN;
    this.hasActed = true;
    this.actionHistory.push({ action: this.lastAction, amount: actual });
    return actual;
  }

  /**
   * 加注
   * @param {number} totalAmount - 加注到的总额（不是增量）
   */
  raise(totalAmount) {
    const actual = this.bet(totalAmount);
    this.lastAction = this.chips === 0 ? ACTION.ALL_IN : ACTION.RAISE;
    this.hasActed = true;
    this.actionHistory.push({ action: this.lastAction, amount: actual });
    return actual;
  }

  /**
   * 全押
   */
  allIn() {
    const amount = Math.max(0, this.chips);
    this.bet(amount);
    this.lastAction = ACTION.ALL_IN;
    this.hasActed = true;
    this.allInAmount = this.currentBet;
    this.actionHistory.push({ action: ACTION.ALL_IN, amount });
    return amount;
  }

  /**
   * 投入盲注
   */
  postBlind(amount) {
    const actual = this.bet(amount);
    return actual;
  }
  get isFolded() {
    return this.status === PLAYER_STATUS.FOLDED;
  }

  get isAllIn() {
    return this.status === PLAYER_STATUS.ALL_IN;
  }

  get isActive() {
    return this.status === PLAYER_STATUS.PLAYING || this.status === PLAYER_STATUS.WAITING;
  }

  get canAct() {
    return !this.isFolded && !this.isAllIn &&
           this.status !== PLAYER_STATUS.SITTING_OUT;
  }

  /**
   * 记录本局结果
   */
  recordHandResult(won, profit) {
    this.handsPlayed++;
    this.totalProfit += profit;

    if (won) {
      this.handsWon++;
      this.currentWinStreak++;
      this.maxWinStreak = Math.max(this.maxWinStreak, this.currentWinStreak);
      this.maxWin = Math.max(this.maxWin, profit);
    } else {
      this.currentWinStreak = 0;
    }
  }

  getWinRate() {
    if (this.handsPlayed === 0) return 0;
    return this.handsWon / this.handsPlayed;
  }

  toPublicInfo() {
    return {
      id: this.id,
      name: this.name,
      avatar: this.avatar,
      chips: this.chips,
      status: this.status,
      seatIndex: this.seatIndex,
      currentBet: this.currentBet,
      lastAction: this.lastAction,
      isAI: this.isAI,
      hasActed: this.hasActed,
      actionHistory: this.actionHistory
    };
  }
}

module.exports = Player;
