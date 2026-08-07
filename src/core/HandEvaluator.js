/**
 * 牌型评估器
 * 从7张牌中找出最佳5张组合，返回牌型和用于比较的权重
 *
 * 牌型从大到小：
 * 10 皇家同花顺
 * 9  同花顺
 * 8  四条
 * 7  葫芦
 * 6  同花
 * 5  顺子
 * 4  三条
 * 3  两对
 * 2  一对
 * 1  高牌
 */

const { HAND_RANK } = require('../config');

/**
 * 评估5张牌的牌型
 * @param {number[]} ranks - 5张牌的点数数组 (0-12)
 * @param {number[]} suits - 5张牌的花色数组 (0-3)
 * @returns {{rank: number, kickers: number[]}} 牌型和踢脚牌
 */
function evaluate5(ranks, suits) {
  const sorted = [...ranks].sort((a, b) => b - a); // 从大到小
  const isFlush = suits.every(s => s === suits[0]);

  // 检查顺子
  let isStraight = false;
  let straightHigh = -1;

  // 普通顺子
  if (sorted[0] - sorted[1] === 1 && sorted[1] - sorted[2] === 1 &&
      sorted[2] - sorted[3] === 1 && sorted[3] - sorted[4] === 1) {
    isStraight = true;
    straightHigh = sorted[0];
  }

  // A-2-3-4-5 轮子顺子 (A=12, 5=3, 4=2, 3=1, 2=0)
  if (sorted[0] === 12 && sorted[1] === 3 && sorted[2] === 2 &&
      sorted[3] === 1 && sorted[4] === 0) {
    isStraight = true;
    straightHigh = 3; // 轮子顺子的最高牌是5 (rank 3)
  }

  // 统计每个点数的出现次数
  const counts = {};
  for (const r of sorted) {
    counts[r] = (counts[r] || 0) + 1;
  }
  // 按出现次数降序、点数降序排列
  const groups = Object.entries(counts)
    .map(([r, c]) => ({ rank: parseInt(r), count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 同花顺 / 皇家同花顺
  if (isFlush && isStraight) {
    if (straightHigh === 12) {
      return { rank: HAND_RANK.ROYAL_FLUSH, kickers: [12] };
    }
    return { rank: HAND_RANK.STRAIGHT_FLUSH, kickers: [straightHigh] };
  }

  // 四条
  if (groups[0].count === 4) {
    return {
      rank: HAND_RANK.FOUR_OF_A_KIND,
      kickers: [groups[0].rank, groups[1].rank]
    };
  }

  // 葫芦
  if (groups[0].count === 3 && groups[1] && groups[1].count >= 2) {
    return {
      rank: HAND_RANK.FULL_HOUSE,
      kickers: [groups[0].rank, groups[1].rank]
    };
  }

  // 同花
  if (isFlush) {
    return { rank: HAND_RANK.FLUSH, kickers: sorted };
  }

  // 顺子
  if (isStraight) {
    return { rank: HAND_RANK.STRAIGHT, kickers: [straightHigh] };
  }

  // 三条
  if (groups[0].count === 3) {
    const kickers = groups.slice(1).map(g => g.rank);
    return {
      rank: HAND_RANK.THREE_OF_A_KIND,
      kickers: [groups[0].rank, ...kickers]
    };
  }

  // 两对
  if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
    return {
      rank: HAND_RANK.TWO_PAIR,
      kickers: [groups[0].rank, groups[1].rank, groups[2] ? groups[2].rank : 0]
    };
  }

  // 一对
  if (groups[0].count === 2) {
    const kickers = groups.slice(1).map(g => g.rank);
    return {
      rank: HAND_RANK.ONE_PAIR,
      kickers: [groups[0].rank, ...kickers]
    };
  }

  // 高牌
  return { rank: HAND_RANK.HIGH_CARD, kickers: sorted };
}

/**
 * 从多张牌中找出最佳5张组合
 * @param {Card[]} cards - 5-7张牌
 * @returns {{rank: number, kickers: number[], bestFive: Card[]}}
 */
function evaluateBest(cards) {
  const n = cards.length;
  if (n < 5) {
    throw new Error('至少需要5张牌');
  }

  let best = null;
  let bestFive = null;

  // 生成所有C(n,5)组合
  const indices = combination(n, 5);
  for (const combo of indices) {
    const five = combo.map(i => cards[i]);
    const ranks = five.map(c => c.rank);
    const suits = five.map(c => c.suit);
    const result = evaluate5(ranks, suits);

    if (best === null || compareHands(result, best) > 0) {
      best = result;
      bestFive = five;
    }
  }

  return { ...best, bestFive };
}

/**
 * 比较两手牌的大小
 * @returns {number} >0 表示a大, <0 表示b大, 0 表示相等
 */
function compareHands(a, b) {
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }
  // 比较踢脚牌
  const len = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < len; i++) {
    const ak = a.kickers[i] !== undefined ? a.kickers[i] : -1;
    const bk = b.kickers[i] !== undefined ? b.kickers[i] : -1;
    if (ak !== bk) {
      return ak - bk;
    }
  }
  return 0;
}

/**
 * 生成 C(n, k) 的所有组合索引
 */
function combination(n, k) {
  const result = [];
  const combo = [];

  function helper(start, depth) {
    if (depth === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i <= n - (k - depth); i++) {
      combo.push(i);
      helper(i + 1, depth + 1);
      combo.pop();
    }
  }

  helper(0, 0);
  return result;
}

module.exports = {
  evaluate5,
  evaluateBest,
  compareHands,
  combination
};
