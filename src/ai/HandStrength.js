/**
 * 手牌强度评估器
 * 使用蒙特卡洛模拟估算胜率
 *
 * 核心原则：只用AI自己的底牌和公共牌，绝不读取其他玩家的底牌
 */

const { Card, Deck } = require('../core/Deck');
const { evaluateBest } = require('../core/HandEvaluator');

/**
 * 翻牌前手牌强度表（简化版Sklansky分组）
 * 返回 0-1 的强度值
 */
function getPreflopStrength(card1, card2) {
  const r1 = card1.rank;
  const r2 = card2.rank;
  const suited = card1.suit === card2.suit;
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const pair = r1 === r2;
  const gap = high - low - 1; // 间隔牌数

  // 对子
  if (pair) {
    if (high >= 10) return 0.92;      // AA, KK, QQ
    if (high >= 8) return 0.85;       // JJ, TT
    if (high >= 5) return 0.72;       // 99, 88, 77
    if (high >= 2) return 0.60;       // 66, 55, 44, 33, 22
  }

  // 非对子
  let strength = 0;

  // 基础强度由高牌决定
  if (high === 12) { // A
    if (low >= 10) strength = 0.80;    // AK, AQ, AJ, AT
    else if (low >= 7) strength = 0.60; // A9-A8
    else if (low >= 4) strength = 0.50; // A7-A5
    else strength = 0.40;               // A4-A2
  } else if (high === 11) { // K
    if (low >= 9) strength = 0.72;     // KQ, KJ, KT
    else if (low >= 7) strength = 0.55;
    else strength = 0.40;
  } else if (high === 10) { // Q
    if (low >= 9) strength = 0.66;     // QJ, QT
    else if (low >= 7) strength = 0.50;
    else strength = 0.35;
  } else if (high === 9) { // J
    if (low >= 8) strength = 0.58;     // JT
    else if (low >= 6) strength = 0.42;
    else strength = 0.30;
  } else if (high === 8) { // T
    if (low >= 7) strength = 0.50;     // T9
    else strength = 0.30;
  } else {
    // 小牌
    if (gap === 0 && high >= 5) strength = 0.35; // 连张
    else strength = 0.20;
  }

  // 同花加成
  if (suited) strength += 0.08;

  // 连张加成
  if (gap === 0) strength += 0.05;
  else if (gap === 1) strength += 0.03;

  return Math.min(strength, 0.95);
}

/**
 * 蒙特卡洛模拟估算胜率
 * @param {Card[]} holeCards - AI的底牌
 * @param {Card[]} communityCards - 公共牌
 * @param {number} numOpponents - 对手数量
 * @param {number} iterations - 模拟次数
 * @returns {{winRate: number, tieRate: number, loseRate: number}}
 */
function monteCarloWinRate(holeCards, communityCards, numOpponents, iterations = 300) {
  if (numOpponents < 1) numOpponents = 1;

  // 收集已知牌
  const knownCards = new Set();
  for (const c of holeCards) knownCards.add(c.suit * 13 + c.rank);
  for (const c of communityCards) knownCards.add(c.suit * 13 + c.rank);

  // 构建剩余牌池
  const remainingDeck = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) {
      if (!knownCards.has(s * 13 + r)) {
        remainingDeck.push(new Card(s, r));
      }
    }
  }

  let wins = 0;
  let ties = 0;
  let losses = 0;

  const cardsNeeded = {
    community: 5 - communityCards.length,
    opponents: numOpponents * 2
  };

  for (let iter = 0; iter < iterations; iter++) {
    // 洗牌（Fisher-Yates 部分洗牌）
    const deck = [...remainingDeck];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    let idx = 0;

    // 发公共牌
    const fullCommunity = [...communityCards];
    for (let i = 0; i < cardsNeeded.community; i++) {
      fullCommunity.push(deck[idx++]);
    }

    // 发对手底牌
    const opponentHands = [];
    for (let i = 0; i < numOpponents; i++) {
      opponentHands.push([deck[idx++], deck[idx++]]);
    }

    // 评估AI的手牌
    const myBest = evaluateBest([...holeCards, ...fullCommunity]);

    // 评估每个对手的手牌
    let bestOpponentRank = null;
    for (const oppHand of opponentHands) {
      const oppBest = evaluateBest([...oppHand, ...fullCommunity]);
      if (bestOpponentRank === null || compareHandResults(oppBest, bestOpponentRank) > 0) {
        bestOpponentRank = oppBest;
      }
    }

    const cmp = compareHandResults(myBest, bestOpponentRank);
    if (cmp > 0) wins++;
    else if (cmp === 0) ties++;
    else losses++;
  }

  return {
    winRate: wins / iterations,
    tieRate: ties / iterations,
    loseRate: losses / iterations
  };
}

/**
 * 蒙特卡洛迭代次数（默认300）。测试可用 setMonteCarloIterations 调小以加速，
 * 不影响正式游戏手感（正式游戏保持默认300）。
 */
let MC_ITERATIONS = 300;
function setMonteCarloIterations(n) {
  if (typeof n === 'number' && n > 0) MC_ITERATIONS = Math.floor(n);
}

function compareHandResults(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    const ak = a.kickers[i] !== undefined ? a.kickers[i] : -1;
    const bk = b.kickers[i] !== undefined ? b.kickers[i] : -1;
    if (ak !== bk) return ak - bk;
  }
  return 0;
}

/**
 * 综合手牌强度评估
 * @param {Card[]} holeCards
 * @param {Card[]} communityCards
 * @param {number} numOpponents
 * @returns {number} 0-1 的胜率
 */
function evaluateHandStrength(holeCards, communityCards, numOpponents) {
  if (communityCards.length === 0) {
    // 翻牌前用查表法（快）
    const baseStrength = getPreflopStrength(holeCards[0], holeCards[1]);
    // 对手越多，胜率越低
    const adjusted = adjustForOpponents(baseStrength, numOpponents);
    return adjusted;
  }

  // 翻牌后用蒙特卡洛
  const iterations = numOpponents > 4 ? 200 : MC_ITERATIONS;
  const result = monteCarloWinRate(holeCards, communityCards, numOpponents, iterations);
  return result.winRate + result.tieRate * 0.5;
}

/**
 * 根据对手数量调整胜率
 */
function adjustForOpponents(strength, numOpponents) {
  // 简化模型：每增加一个对手，胜率大约乘以0.85
  let adjusted = strength;
  for (let i = 1; i < numOpponents; i++) {
    adjusted *= 0.85;
  }
  return Math.min(adjusted, 0.95);
}

module.exports = {
  getPreflopStrength,
  monteCarloWinRate,
  evaluateHandStrength,
  compareHandResults,
  setMonteCarloIterations
};
