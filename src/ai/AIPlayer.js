/**
 * AI 机器人决策引擎
 *
 * 四种难度：新手 / 普通 / 高手 / 职业
 *
 * 核心原则：AI 绝不读取其他玩家的底牌
 * 决策依据：
 *   1. 自己的手牌强度（蒙特卡洛模拟）
 *   2. 公共牌
 *   3. 底池赔率
 *   4. 位置（按钮/盲注/中间位/前位）
 *   5. 对手下注模式（激进/保守/正常）
 *   6. 历史行为
 */

const { evaluateHandStrength } = require('./HandStrength');
const {
  AI_DIFFICULTY, ACTION, PHASE, PLAYER_STATUS
} = require('../config');

class AIPlayer {
  constructor(difficulty = AI_DIFFICULTY.NORMAL) {
    this.difficulty = difficulty;
  }

  /**
   * AI 决策
   * @param {object} context - 决策上下文
   * @param {Player} context.player - AI玩家
   * @param {object} context.gameState - 游戏状态
   * @returns {{action: string, amount: number}}
   */
  decide(context) {
    const { player, gameState } = context;

    // 只看自己的牌和公共牌
    const holeCards = player.holeCards;
    const communityCards = gameState.communityCards || [];
    const callAmount = gameState.currentBet - player.currentBet;
    const pot = gameState.potTotal || 0;
    const activeOpponents = this._countActiveOpponents(player, gameState);
    const position = this._getPosition(player, gameState);
    const opponentAggression = this._estimateOpponentAggression(player, gameState);

    // 评估手牌强度（0-1）
    const handStrength = evaluateHandStrength(
      holeCards, communityCards, activeOpponents
    );

    // 底池赔率
    const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0;

    // 根据难度调整决策
    let decision;
    switch (this.difficulty) {
      case AI_DIFFICULTY.BEGINNER:
        decision = this._decideBeginner(handStrength, potOdds, callAmount, pot,
          player, position, activeOpponents);
        break;
      case AI_DIFFICULTY.NORMAL:
        decision = this._decideNormal(handStrength, potOdds, callAmount, pot,
          player, position, activeOpponents, communityCards, opponentAggression);
        break;
      case AI_DIFFICULTY.EXPERT:
        decision = this._decideExpert(handStrength, potOdds, callAmount, pot,
          player, position, activeOpponents, communityCards, opponentAggression, gameState);
        break;
      case AI_DIFFICULTY.PRO:
        decision = this._decidePro(handStrength, potOdds, callAmount, pot,
          player, position, activeOpponents, communityCards, opponentAggression, gameState);
        break;
      default:
        decision = this._decideNormal(handStrength, potOdds, callAmount, pot,
          player, position, activeOpponents, communityCards, opponentAggression);
    }

    // 练习（AI对战）模式：AI略弱，让真人胜率略高于AI（绝不读对手底牌）
    if (context.practiceMode) {
      decision = this._practiceHandicap(decision, player, gameState, handStrength, callAmount, pot, context.humanId);
    }

    return decision;
  }

  // ========== 新手难度 ==========
  _decideBeginner(strength, potOdds, callAmount, pot, player, position, oppCount) {
    // 新手特点：玩太多牌，不太懂赔率，随机性大

    // 加点随机噪声
    const noise = (Math.random() - 0.5) * 0.3;
    const effectiveStrength = Math.max(0, Math.min(1, strength + noise));

    // 新手不懂弃牌，经常跟注
    if (callAmount === 0) {
      // 可以过牌
      if (effectiveStrength > 0.5 && Math.random() < 0.3) {
        // 偶尔下注
        const betSize = pot * (0.3 + Math.random() * 0.4);
        return this._makeBet(player, pot, betSize);
      }
      return { action: ACTION.CHECK, amount: 0 };
    }

    // 需要跟注
    if (effectiveStrength > 0.3) {
      // 弱牌也经常跟
      if (callAmount > player.chips) {
        return { action: ACTION.ALL_IN, amount: player.chips };
      }
      // 偶尔加注（随机）
      if (effectiveStrength > 0.6 && Math.random() < 0.15) {
        const raiseTotal = (pot + callAmount) * (1.5 + Math.random());
        return this._makeRaise(player, callAmount, raiseTotal);
      }
      return { action: ACTION.CALL, amount: callAmount };
    }

    // 烂牌有时候也跟（新手特征）
    if (callAmount < pot * 0.15 && Math.random() < 0.5) {
      return { action: ACTION.CALL, amount: callAmount };
    }

    return { action: ACTION.FOLD, amount: 0 };
  }

  // ========== 普通难度 ==========
  _decideNormal(strength, potOdds, callAmount, pot, player, position, oppCount,
                communityCards, aggression) {
    // 普通AI：基本赔率意识，合理弃牌

    // 位置调整
    const posBonus = this._getPositionBonus(position);
    const adjustedStrength = Math.min(1, strength + posBonus);

    if (callAmount === 0) {
      // 可以过牌
      if (adjustedStrength > 0.65) {
        // 强牌下注
        const betSize = pot * (0.5 + Math.random() * 0.3);
        return this._makeBet(player, pot, betSize);
      }
      // 中等牌偶尔诈唬
      if (adjustedStrength < 0.4 && Math.random() < 0.1) {
        const betSize = pot * 0.4;
        return this._makeBet(player, pot, betSize);
      }
      return { action: ACTION.CHECK, amount: 0 };
    }

    // 需要跟注：比较手牌强度和底池赔率
    if (adjustedStrength > potOdds + 0.05) {
      // 有利可图

      if (adjustedStrength > 0.75) {
        // 强牌加注
        const raiseTotal = (pot + callAmount) * (1.8 + Math.random() * 0.7);
        return this._makeRaise(player, callAmount, raiseTotal);
      }

      return { action: ACTION.CALL, amount: callAmount };
    }

    // 边缘情况
    if (adjustedStrength > potOdds - 0.05 && callAmount < pot * 0.2) {
      return { action: ACTION.CALL, amount: callAmount };
    }

    return { action: ACTION.FOLD, amount: 0 };
  }

  // ========== 高手难度 ==========
  _decideExpert(strength, potOdds, callAmount, pot, player, position, oppCount,
                communityCards, aggression, gameState) {
    // 高手AI：位置意识强，半诈唬，读牌

    const posBonus = this._getPositionBonus(position);
    const adjustedStrength = Math.min(1, strength + posBonus);

    // 对手激进度调整
    const aggressionAdjust = aggression > 0.6 ? -0.05 : (aggression < 0.3 ? 0.05 : 0);
    const finalStrength = adjustedStrength + aggressionAdjust;

    // 是否有听牌
    const drawPotential = this._evaluateDraws(player.holeCards, communityCards);

    if (callAmount === 0) {
      // 可以过牌
      if (finalStrength > 0.7) {
        // 强牌：价值下注
        const betSize = pot * (0.6 + Math.random() * 0.3);
        return this._makeBet(player, pot, betSize);
      }

      // 半诈唬：有听牌 + 位置好
      if (drawPotential > 0.3 && position >= 3 && Math.random() < 0.4) {
        const betSize = pot * 0.5;
        return this._makeBet(player, pot, betSize);
      }

      // 偶尔纯诈唬
      if (finalStrength < 0.35 && position >= 4 && Math.random() < 0.15) {
        const betSize = pot * 0.45;
        return this._makeBet(player, pot, betSize);
      }

      return { action: ACTION.CHECK, amount: 0 };
    }

    // 需要跟注
    const effectiveStrength = finalStrength + drawPotential * 0.5;

    if (effectiveStrength > 0.8) {
      // 非常强：加注
      const raiseTotal = (pot + callAmount) * (2 + Math.random() * 0.8);
      return this._makeRaise(player, callAmount, raiseTotal);
    }

    if (effectiveStrength > potOdds + 0.03) {
      // 有利可图的跟注
      // 偶尔用强牌加注
      if (effectiveStrength > 0.7 && Math.random() < 0.3) {
        const raiseTotal = (pot + callAmount) * 1.8;
        return this._makeRaise(player, callAmount, raiseTotal);
      }
      return { action: ACTION.CALL, amount: callAmount };
    }

    // 有好听牌可以跟
    if (drawPotential > 0.35 && potOdds < 0.3) {
      return { action: ACTION.CALL, amount: callAmount };
    }

    return { action: ACTION.FOLD, amount: 0 };
  }

  // ========== 职业难度 ==========
  _decidePro(strength, potOdds, callAmount, pot, player, position, oppCount,
             communityCards, aggression, gameState) {
    // 职业AI：最优策略，范围平衡，利用对手

    const posBonus = this._getPositionBonus(position);
    const adjustedStrength = Math.min(1, strength + posBonus);

    // 读对手：激进度分析
    const aggressionAdjust = this._advancedAggressionRead(aggression, callAmount, pot);
    const finalStrength = adjustedStrength + aggressionAdjust;

    // 听牌评估
    const drawPotential = this._evaluateDraws(player.holeCards, communityCards);
    const effectiveStrength = finalStrength + drawPotential * 0.6;

    // 混合策略频率
    const random = Math.random();

    if (callAmount === 0) {
      // 可以过牌
      if (effectiveStrength > 0.8) {
        // 超强牌：大部分时候下注，偶尔慢打（陷阱）
        if (random < 0.85) {
          const betSize = pot * (0.65 + Math.random() * 0.35);
          return this._makeBet(player, pot, betSize);
        }
        return { action: ACTION.CHECK, amount: 0 }; // 陷阱
      }

      if (effectiveStrength > 0.6) {
        // 强牌：价值下注 + 偶尔过牌
        if (random < 0.75) {
          const betSize = pot * (0.5 + Math.random() * 0.3);
          return this._makeBet(player, pot, betSize);
        }
        return { action: ACTION.CHECK, amount: 0 };
      }

      // 半诈唬：有听牌
      if (drawPotential > 0.35 && position >= 3) {
        if (random < 0.5) {
          const betSize = pot * 0.55;
          return this._makeBet(player, pot, betSize);
        }
      }

      // 纯诈唬：好位置 + 低频率
      if (effectiveStrength < 0.3 && position >= 4 && oppCount <= 3 && random < 0.2) {
        const betSize = pot * 0.5;
        return this._makeBet(player, pot, betSize);
      }

      return { action: ACTION.CHECK, amount: 0 };
    }

    // 需要跟注
    // 计算期望值
    const ev = effectiveStrength * (pot + callAmount) - (1 - effectiveStrength) * callAmount;

    if (effectiveStrength > 0.85) {
      // 超强牌：加注获取价值
      const raiseTotal = (pot + callAmount) * (2.2 + Math.random() * 0.8);
      return this._makeRaise(player, callAmount, raiseTotal);
    }

    if (effectiveStrength > 0.7) {
      // 强牌：混合加注和跟注
      if (random < 0.4) {
        const raiseTotal = (pot + callAmount) * (1.8 + Math.random() * 0.5);
        return this._makeRaise(player, callAmount, raiseTotal);
      }
      return { action: ACTION.CALL, amount: callAmount };
    }

    if (ev > 0 || effectiveStrength > potOdds) {
      // +EV 跟注
      return { action: ACTION.CALL, amount: callAmount };
    }

    // 强听牌 + 好赔率：偶尔半诈唬加注
    if (drawPotential > 0.4 && potOdds < 0.25 && random < 0.3) {
      const raiseTotal = (pot + callAmount) * 1.5;
      return this._makeRaise(player, callAmount, raiseTotal);
    }

    return { action: ACTION.FOLD, amount: 0 };
  }

  // ========== 练习模式让利（仅影响AI，不影响真人） ==========
  // 让真人胜率略高于AI（真人≈26%，每个AI≈24.7%）的三板斧（绝不读取任何对手底牌）：
  //  1) 定向让利：真人是当前下注者时，AI 高概率弃掉本该跟注/加注的牌（含强牌），
  //     把筹码直接转给真人，真人持强牌下注即可收池；
  //  2) 降低激进度：本该下注/加注时改为跟注或过牌，不榨取真人价值、也不诈唬吓退真人；
  //  3) 多弃牌：面对（非真人的）下注时更易弃牌，稀释人数、提升真人相对权益。
  // 三者都只在"真人仍在局中"时生效。
  _practiceHandicap(decision, player, gameState, strength, callAmount, pot, humanId) {
    const chips = Math.floor(player.chips);
    if (!humanId || !gameState.players) return decision;

    const humanInHand = gameState.players.some(p => p.id === humanId &&
      !p.isFolded && p.status !== PLAYER_STATUS.SITTING_OUT);
    if (!humanInHand) return decision;

    const bettorIsHuman = gameState.players.some(p => p.id === humanId &&
      gameState.currentBet > 0 && p.currentBet === gameState.currentBet);

    // 1) 定向让利：真人是当前下注者时，AI 高概率弃掉本该跟注/加注的牌（含强牌）
    //    —— 把筹码直接转给真人；真人持强牌下注即可收池（绝不读取对手底牌）
    if (bettorIsHuman && callAmount > 0 && callAmount <= chips &&
        (decision.action === ACTION.CALL || decision.action === ACTION.RAISE)) {
      if (Math.random() < 0.85) {
        return { action: ACTION.FOLD, amount: 0 };
      }
    }

    // 2) 降低激进度：本该下注/加注时，改为跟注或过牌 —— 不榨取真人价值、也不诈唬吓退真人
    if (decision.action === ACTION.RAISE || decision.action === ACTION.BET) {
      if (Math.random() < 0.60) {
        const ca = gameState.currentBet - player.currentBet;
        if (ca > 0 && ca <= chips) return { action: ACTION.CALL, amount: ca };
        return { action: ACTION.CHECK, amount: 0 };
      }
    }

    // 3) 多弃牌：面对（非真人的）下注时，本该跟注/加注也更易弃牌，稀释人数、提升真人权益
    if (!bettorIsHuman && callAmount > 0 && callAmount <= chips &&
        (decision.action === ACTION.CALL || decision.action === ACTION.RAISE)) {
      if (Math.random() < 0.40) {
        return { action: ACTION.FOLD, amount: 0 };
      }
    }

    return decision;
  }

  // ========== 辅助方法 ==========

  /**
   * 统计活跃对手数量
   */
  _countActiveOpponents(player, gameState) {
    if (!gameState.players) return 1;
    return gameState.players.filter(p =>
      p.id !== player.id &&
      !p.isFolded &&
      p.status !== PLAYER_STATUS.SITTING_OUT
    ).length;
  }

  /**
   * 获取位置编号
   * 0=UTG(前位) 1=中间位 2=后位 3=CO 4=Button 5=SB 6=BB
   */
  _getPosition(player, gameState) {
    if (!gameState.players) return 2;
    const active = gameState.players.filter(p =>
      p.status !== PLAYER_STATUS.SITTING_OUT
    );
    const n = active.length;
    if (n <= 1) return 4;

    const mySeat = player.seatIndex;
    const buttonSeat = gameState.buttonIndex;

    // 计算距离按钮的位置
    let distance = (mySeat - buttonSeat + n) % n;

    if (distance === 0) return 4; // Button
    if (distance === 1 || distance === n - 1) return 5; // SB/BB
    if (distance === 2) return 0; // UTG
    if (distance <= n / 2) return 1; // 中间位
    return 3; // CO/后位
  }

  /**
   * 位置加成
   */
  _getPositionBonus(position) {
    const bonuses = [0, 0.02, 0.04, 0.06, 0.08, -0.03, -0.02];
    return bonuses[position] || 0;
  }

  /**
   * 估算对手激进度
   * 返回 0-1，越高越激进
   */
  _estimateOpponentAggression(player, gameState) {
    if (!gameState.players) return 0.5;

    let totalActions = 0;
    let aggressiveActions = 0;

    for (const p of gameState.players) {
      if (p.id === player.id) continue;
      if (!p.actionHistory) continue;

      for (const act of p.actionHistory) {
        totalActions++;
        if (act.action === ACTION.RAISE || act.action === ACTION.BET ||
            act.action === ACTION.ALL_IN) {
          aggressiveActions++;
        }
      }
    }

    if (totalActions === 0) return 0.5;
    return aggressiveActions / totalActions;
  }

  /**
   * 高级激进度分析
   */
  _advancedAggressionRead(aggression, callAmount, pot) {
    if (aggression > 0.7) {
      // 对手很激进，我们收紧范围但更愿意跟注
      return callAmount > pot * 0.5 ? 0.05 : 0;
    }
    if (aggression < 0.25) {
      // 对手很保守，下注更可信
      return callAmount > pot * 0.3 ? -0.08 : 0;
    }
    return 0;
  }

  /**
   * 评估听牌潜力
   * 返回 0-1
   */
  _evaluateDraws(holeCards, communityCards) {
    if (!holeCards || holeCards.length < 2) return 0;
    if (!communityCards || communityCards.length === 0) return 0;

    const allCards = [...holeCards, ...communityCards];
    let drawStrength = 0;

    // 同花听牌
    const suitCounts = {};
    for (const c of allCards) {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    }
    const maxSuit = Math.max(...Object.values(suitCounts));
    if (maxSuit === 4) {
      // 同花听牌：还有1-2张牌要来
      const cardsToCome = 5 - communityCards.length;
      if (cardsToCome >= 1) {
        drawStrength += 0.35; // 约35%概率完成
      }
    }

    // 顺子听牌
    const ranks = allCards.map(c => c.rank).sort((a, b) => a - b);
    const uniqueRanks = [...new Set(ranks)];

    // 检查连续性
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < uniqueRanks.length; i++) {
      if (uniqueRanks[i] - uniqueRanks[i - 1] === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    if (maxStreak === 4) {
      // 开放式顺子听牌
      const cardsToCome = 5 - communityCards.length;
      if (cardsToCome >= 1) {
        drawStrength += 0.25;
      }
    }

    // 检查A-2-3-4-5轮子顺子
    if (uniqueRanks.includes(12) && uniqueRanks.includes(0) &&
        uniqueRanks.includes(1) && uniqueRanks.includes(2) &&
        uniqueRanks.includes(3)) {
      drawStrength = Math.max(drawStrength, 0.3);
    }

    // 对子听三条
    const rankCounts = {};
    for (const c of allCards) {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    }
    for (const count of Object.values(rankCounts)) {
      if (count === 2 && communityCards.length < 5) {
        drawStrength += 0.08; // 暗三条听牌
      }
    }

    return Math.min(drawStrength, 0.6);
  }

  /**
   * 生成下注动作
   */
  _makeBet(player, pot, desiredAmount) {
    const amount = Math.min(Math.round(desiredAmount), player.chips);
    if (amount >= player.chips) {
      return { action: ACTION.ALL_IN, amount: player.chips };
    }
    const minBet = Math.max(1, Math.round(pot * 0.1));
    return { action: ACTION.BET, amount: Math.max(amount, minBet) };
  }

  /**
   * 生成加注动作
   */
  _makeRaise(player, callAmount, raiseTotal) {
    const maxTotal = player.chips + player.currentBet;
    const total = Math.min(Math.round(raiseTotal), maxTotal);

    if (total >= maxTotal) {
      return { action: ACTION.ALL_IN, amount: player.chips };
    }

    return { action: ACTION.RAISE, amount: total };
  }
}

module.exports = AIPlayer;
