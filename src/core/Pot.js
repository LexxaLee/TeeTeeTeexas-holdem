/**
 * 底池管理 - 包括主池和边池
 * 处理 All-In 时的边池分配
 */

class Pot {
  constructor() {
    this.pots = []; // [{ amount: number, eligiblePlayerIds: number[] }]
    this.totalBet = 0; // 本轮所有玩家下注总额
  }

  reset() {
    this.pots = [];
    this.totalBet = 0;
  }

  /**
   * 收集所有玩家的下注，计算主池和边池
   * 算法：按下注额升序排列，逐层剥离创建边池
   * @param {Map} playerBets - playerId => 本局总下注额
   * @param {Set} foldedPlayerIds - 已弃牌的玩家ID集合
   */
  collectBets(playerBets, foldedPlayerIds) {
    this.pots = [];

    // 收集所有下注信息
    const allBets = [];
    for (const [playerId, amount] of playerBets) {
      if (amount > 0) {
        allBets.push({ playerId, amount, folded: foldedPlayerIds.has(playerId) });
      }
    }

    if (allBets.length === 0) return;

    // 按下注额升序排列
    allBets.sort((a, b) => a.amount - b.amount);

    let processedAmount = 0;

    while (allBets.length > 0) {
      // 找到最小的非零下注
      const minAmount = allBets[0].amount;
      if (minAmount <= processedAmount) {
        allBets.shift();
        continue;
      }

      const layerHeight = minAmount - processedAmount;
      const layerAmount = Math.round(layerHeight * allBets.length);

      // 这一层有资格的玩家（未弃牌）
      const eligible = allBets
        .filter(b => !b.folded)
        .map(b => b.playerId);

      if (eligible.length > 0) {
        // 尝试合并到上一个池（如果资格相同）
        const lastPot = this.pots[this.pots.length - 1];
        if (lastPot &&
            lastPot.eligiblePlayerIds.length === eligible.length &&
            lastPot.eligiblePlayerIds.every(id => eligible.includes(id))) {
          lastPot.amount += layerAmount;
        } else {
          this.pots.push({ amount: layerAmount, eligiblePlayerIds: [...eligible] });
        }
      } else {
        // 所有人都弃牌了，金额归给最后一个未弃牌的玩家
        // 这种情况不应该发生（如果游戏逻辑正确）
        // 但作为保险，加到最后一个有资格的池
        if (this.pots.length > 0) {
          this.pots[this.pots.length - 1].amount += layerAmount;
        }
      }

      processedAmount = minAmount;

      // 移除已清零的玩家
      for (let i = allBets.length - 1; i >= 0; i--) {
        if (allBets[i].amount <= processedAmount) {
          allBets.splice(i, 1);
        }
      }
    }

    this.totalBet = this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * 分配底池给赢家
   * @param {Map} playerHandResults - playerId => { rank, kickers }
   * @returns {Map} playerId => 赢得的金额
   */
  distribute(playerHandResults) {
    const winnings = new Map();

    for (const pot of this.pots) {
      if (pot.eligiblePlayerIds.length === 0) continue;

      // 找出这个池中手牌最好的玩家
      let bestHand = null;
      let winners = [];

      for (const pid of pot.eligiblePlayerIds) {
        const hand = playerHandResults.get(pid);
        if (!hand) continue;

        if (bestHand === null) {
          bestHand = hand;
          winners = [pid];
        } else {
          const cmp = this._compareHandValues(hand, bestHand);
          if (cmp > 0) {
            bestHand = hand;
            winners = [pid];
          } else if (cmp === 0) {
            winners.push(pid);
          }
        }
      }

      // 平分底池
      if (winners.length > 0) {
        const share = Math.floor(pot.amount / winners.length);
        const remainder = pot.amount - share * winners.length;

        for (let i = 0; i < winners.length; i++) {
          const w = winners[i];
          const extra = i < remainder ? 1 : 0;
          winnings.set(w, (winnings.get(w) || 0) + share + extra);
        }
      }
    }

    return winnings;
  }

  _compareHandValues(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const len = Math.max(a.kickers.length, b.kickers.length);
    for (let i = 0; i < len; i++) {
      const ak = a.kickers[i] !== undefined ? a.kickers[i] : -1;
      const bk = b.kickers[i] !== undefined ? b.kickers[i] : -1;
      if (ak !== bk) return ak - bk;
    }
    return 0;
  }

  get totalAmount() {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * 获取底池信息（用于UI显示）
   */
  getInfo() {
    return {
      pots: this.pots.map(p => ({ amount: p.amount, eligible: p.eligiblePlayerIds })),
      total: this.totalAmount
    };
  }
}

module.exports = Pot;
