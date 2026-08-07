/**
 * 牌组管理
 * 52张标准扑克牌，不含大小王
 */

const { SUIT, RANK_NAMES } = require('../config');

class Card {
  constructor(suit, rank) {
    this.suit = suit;  // 0-3
    this.rank = rank;  // 0-12 (2=0, A=12)
  }

  get rankName() {
    return RANK_NAMES[this.rank];
  }

  get suitSymbol() {
    return ['♠', '♥', '♦', '♣'][this.suit];
  }

  get isRed() {
    return this.suit === SUIT.HEARTS || this.suit === SUIT.DIAMONDS;
  }

  toString() {
    return this.rankName + this.suitSymbol;
  }
}

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    for (let s = 0; s < 4; s++) {
      for (let r = 0; r < 13; r++) {
        this.cards.push(new Card(s, r));
      }
    }
    this.shuffle();
  }

  /**
   * Fisher-Yates 洗牌
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * 发一张牌
   */
  deal() {
    if (this.cards.length === 0) {
      throw new Error('牌组已空');
    }
    return this.cards.pop();
  }

  get remaining() {
    return this.cards.length;
  }
}

module.exports = { Card, Deck };
