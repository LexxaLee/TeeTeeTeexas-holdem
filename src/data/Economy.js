/**
 * 地下钱庄系统
 * 
 * 核心规则：
 * - 借款额度 = 当前大盲注 × 100（仅在筹码归零时可借）
 * - 还款年限 = 玩家自选 1~999 年
 * - 年利率 = 10%（单利）
 * - 日供 = ceil(总欠款 / (年限 × 365))，最低1筹码，无小数
 * - 每局结束后自动扣款（还钱庄）
 * - 筹码可为负（负=欠钱状态）
 * - 随时可退出，负债可后续再还，无强制惩罚（已取消"留下打工"机制）
 */

const Storage = require('./Storage');
const { ECONOMY } = require('../config');

// 钱庄台词
const BANK_TAUNTS = {
  onBorrow: '选个年限吧，我活得比你久。',
  onNegative: '从现在起，你赢的每一分都是我的。'
};

class Economy {
  constructor() {
    this.coins = ECONOMY.INITIAL_COINS;
    this.loanBalance = 0;        // 总欠款（本金+利息）
    this.loanPrincipal = 0;      // 借款本金
    this.dailyPayment = 0;       // 日供（每局扣这么多）
    this.borrowYears = 0;        // 借款年限
    this.loanDate = null;        // 借款日期ISO
    this.handsSinceDeduct = 0;  // 自上次扣款后的局数
    this.load();
  }

  load() {
    this.coins = Storage.get('coins', ECONOMY.INITIAL_COINS);
    this.loanBalance = Storage.get('loanBalance', 0);
    this.loanPrincipal = Storage.get('loanPrincipal', 0);
    this.dailyPayment = Storage.get('dailyPayment', 0);
    this.borrowYears = Storage.get('borrowYears', 0);
    this.loanDate = Storage.get('loanDate', null);
    this.handsSinceDeduct = Storage.get('handsSinceDeduct', 0);
  }

  save() {
    Storage.set('coins', Math.floor(this.coins));
    Storage.set('loanBalance', Math.floor(this.loanBalance));
    Storage.set('loanPrincipal', Math.floor(this.loanPrincipal));
    Storage.set('dailyPayment', Math.floor(this.dailyPayment));
    Storage.set('borrowYears', this.borrowYears);
    Storage.set('loanDate', this.loanDate);
    Storage.set('handsSinceDeduct', this.handsSinceDeduct);
  }

  /**
   * 是否可以借款（筹码<=0且无负债）
   */
  canBorrow() {
    return this.coins <= 0 && this.loanBalance <= 0;
  }

  /**
   * 是否在打工状态（筹码为负）
   */
  isInDebtState() {
    return this.coins < 0;
  }

  /**
   * 是否有负债
   */
  hasDebt() {
    return this.loanBalance > 0;
  }

  /**
   * 是否可以退出游戏（随时可退，负债可后续还清）
   */
  canExit() {
    return true;
  }

  /**
   * 计算贷款详情（不实际执行）
   * @param {number} bigBlind - 当前大盲注
   * @param {number} years - 还款年限
   * @returns {object} 贷款计算详情
   */
  calculateLoan(bigBlind, years) {
    const loanAmount = Math.floor(bigBlind * 100);
    const totalDebt = Math.floor(loanAmount * (1 + 0.10 * years)); // 单利
    const dailyPayment = Math.max(1, Math.ceil(totalDebt / (years * 365)));

    return {
      loanAmount: loanAmount,
      totalDebt: totalDebt,
      totalInterest: totalDebt - loanAmount,
      dailyPayment: dailyPayment,
      years: years,
      annualRate: 10,
      annualRatePercent: '10%'
    };
  }

  /**
   * 借款
   * @param {number} bigBlind - 当前大盲注
   * @param {number} years - 还款年限（1~999）
   * @returns {{success: boolean, message: string, detail?: object}}
   */
  borrow(bigBlind, years) {
    years = Math.floor(years);
    if (years < 1 || years > 999) {
      return { success: false, message: '年限必须在1~999年之间' };
    }

    if (!this.canBorrow()) {
      if (this.loanBalance > 0) {
        return { success: false, message: '负债未清，不能再借。赢了自动抵债，继续打工吧。' };
      }
      return { success: false, message: '筹码大于0时不能借款' };
    }

    const calc = this.calculateLoan(bigBlind, years);

    this.coins += calc.loanAmount;
    this.loanBalance = calc.totalDebt;
    this.loanPrincipal = calc.loanAmount;
    this.dailyPayment = calc.dailyPayment;
    this.borrowYears = years;
    this.handsSinceDeduct = 0;
    this.loanDate = new Date().toISOString();

    // 标记有活跃负债（用于负债状态展示）
    Storage.set('hasActiveDebt', true);

    this.save();

    return {
      success: true,
      message: BANK_TAUNTS.onBorrow,
      detail: calc
    };
  }

  /**
   * 每局结束后自动扣款
   * @returns {object|null} 扣款详情
   */
  autoDeduct() {
    if (this.loanBalance <= 0 || this.dailyPayment <= 0) return null;

    this.handsSinceDeduct++;
    const deduction = this.dailyPayment * this.handsSinceDeduct;

    // 扣减筹码（可以变负）
    this.coins -= deduction;

    // 抵扣欠款
    const actualRepay = Math.min(deduction, this.loanBalance);
    this.loanBalance -= actualRepay;

    this.handsSinceDeduct = 0;

    // 负债清零
    if (this.loanBalance <= 0) {
      this.loanBalance = 0;
      this.dailyPayment = 0;
      this.loanPrincipal = 0;
      this.borrowYears = 0;
      Storage.set('hasActiveDebt', false);
    }

    this.save();

    return {
      deduction: deduction,
      newCoins: Math.floor(this.coins),
      newLoanBalance: Math.floor(this.loanBalance),
      debtCleared: this.loanBalance <= 0
    };
  }

  /**
   * 手动还款
   * 支持全角数字、逗号分隔等格式
   * @param {number|string} amount - 还款金额
   * @returns {{success: boolean, message: string}}
   */
  repay(amount) {
    // 处理字符串输入（全角数字、逗号等）
    if (typeof amount === 'string') {
      let s = amount.trim();
      s = s.replace(/[\uff10-\uff19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
      s = s.replace(/\uff0e/g, '.');
      s = s.replace(/,/g, '');
      amount = Number(s);
    }

    amount = Math.floor(Number(amount));

    if (isNaN(amount) || amount <= 0) {
      return { success: false, message: '请输入有效金额（大于0的数字）' };
    }

    if (this.loanBalance <= 0) {
      return { success: false, message: '当前没有贷款' };
    }

    // 筹码不足时不能还（允许还到0，但不能还到负数）
    if (amount > this.coins) {
      return {
        success: false,
        message: '筹码不足，当前仅有 ' + Math.floor(this.coins) + '，最多可还 ' + Math.min(Math.floor(this.coins), this.loanBalance)
      };
    }

    // 实际还款额 = min(输入金额, 欠款)
    const actualRepay = Math.min(amount, this.loanBalance);
    this.coins -= actualRepay;
    this.loanBalance -= actualRepay;

    // 负债清零
    if (this.loanBalance <= 0) {
      this.loanBalance = 0;
      this.dailyPayment = 0;
      this.loanPrincipal = 0;
      this.borrowYears = 0;
      Storage.set('hasActiveDebt', false);
    }

    this.save();

    return {
      success: true,
      message: '成功还款 ' + actualRepay + '，剩余欠款：' + this.loanBalance
    };
  }

  /**
   * 筹码变化（赢/输后）
   */
  addCoins(amount) {
    this.coins += Math.floor(amount);
    this.save();
  }

  removeCoins(amount) {
    this.coins -= Math.floor(amount);
    // 不再clamp到0，允许负数
    this.save();
  }

  hasEnough(amount) {
    return this.coins >= amount;
  }

  /**
   * 获取完整信息（用于显示）
   */
  getInfo() {
    return {
      coins: Math.floor(this.coins),
      loanBalance: Math.floor(this.loanBalance),
      loanPrincipal: Math.floor(this.loanPrincipal),
      dailyPayment: Math.floor(this.dailyPayment),
      borrowYears: this.borrowYears,
      loanDate: this.loanDate,
      isInDebt: this.isInDebtState(),
      hasDebt: this.hasDebt(),
      canBorrow: this.canBorrow(),
      canExit: this.canExit()
    };
  }

  /**
   * 获取钱庄台词
   */
  getTaunt(key) {
    return BANK_TAUNTS[key] || '';
  }

  /**
   * 每日检查（保留接口）
   * 已取消强制关闭惩罚：玩家随时可退，负债可后续再还，不再处罚。
   */
  dailyCheck() {
    return { updates: [] };
  }
}

module.exports = Economy;
