/**
 * 玩家数据管理
 * ID、昵称、头像、金币、信用等级、贷款余额、历史战绩、胜率、最大盈利、最大连胜
 */

const Storage = require('./Storage');
const Economy = require('./Economy');
const { ECONOMY } = require('../config');

class PlayerData {
  constructor() {
    this.id = '';
    this.nickname = '';
    this.avatar = '';
    this.economy = new Economy();

    // 历史战绩
    this.handsPlayed = 0;
    this.handsWon = 0;
    this.maxProfit = 0;
    this.maxLoss = 0;
    this.maxWinStreak = 0;
    this.currentWinStreak = 0;
    this.totalProfit = 0;

    this.load();
  }

  load() {
    this.id = Storage.get('playerId', '');
    this.nickname = Storage.get('nickname', '');
    this.avatar = Storage.get('avatar', '');
    this.handsPlayed = Storage.get('handsPlayed', 0);
    this.handsWon = Storage.get('handsWon', 0);
    this.maxProfit = Storage.get('maxProfit', 0);
    this.maxLoss = Storage.get('maxLoss', 0);
    this.maxWinStreak = Storage.get('maxWinStreak', 0);
    this.currentWinStreak = Storage.get('currentWinStreak', 0);
    this.totalProfit = Storage.get('totalProfit', 0);
  }

  save() {
    Storage.set('playerId', this.id);
    Storage.set('nickname', this.nickname);
    Storage.set('avatar', this.avatar);
    Storage.set('handsPlayed', this.handsPlayed);
    Storage.set('handsWon', this.handsWon);
    Storage.set('maxProfit', this.maxProfit);
    Storage.set('maxLoss', this.maxLoss);
    Storage.set('maxWinStreak', this.maxWinStreak);
    Storage.set('currentWinStreak', this.currentWinStreak);
    Storage.set('totalProfit', this.totalProfit);
    this.economy.save();
  }

  /**
   * 初始化玩家信息（从微信登录获取）
   */
  initFromWeChat(userInfo) {
    if (!this.id) {
      this.id = 'p_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    }
    if (userInfo) {
      this.nickname = userInfo.nickName || this.nickname || '玩家';
      this.avatar = userInfo.avatarUrl || this.avatar || '';
    }
    this.save();
  }

  /**
   * 记录一局结果
   */
  recordHandResult(won, profit) {
    this.handsPlayed++;
    this.totalProfit += profit;

    if (won) {
      this.handsWon++;
      this.currentWinStreak++;
      this.maxWinStreak = Math.max(this.maxWinStreak, this.currentWinStreak);
      this.maxProfit = Math.max(this.maxProfit, profit);
    } else {
      this.currentWinStreak = 0;
      this.maxLoss = Math.min(this.maxLoss, profit);
    }

    this.save();
  }

  getWinRate() {
    if (this.handsPlayed === 0) return 0;
    return (this.handsWon / this.handsPlayed * 100).toFixed(1);
  }

  getStats() {
    return {
      handsPlayed: this.handsPlayed,
      handsWon: this.handsWon,
      winRate: this.getWinRate(),
      maxProfit: this.maxProfit,
      maxLoss: this.maxLoss,
      maxWinStreak: this.maxWinStreak,
      totalProfit: this.totalProfit
    };
  }

  getProfile() {
    const eco = this.economy.getInfo();
    return {
      id: this.id,
      nickname: this.nickname,
      avatar: this.avatar,
      coins: eco.coins,
      loanBalance: eco.loanBalance,
      dailyPayment: eco.dailyPayment,
      ...this.getStats()
    };
  }
}

module.exports = PlayerData;
