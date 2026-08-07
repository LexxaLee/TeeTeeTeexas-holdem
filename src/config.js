/**
 * 游戏全局配置
 */

// === 游戏阶段 ===
const PHASE = {
  WAITING: 'waiting',       // 等待开始
  PRE_FLOP: 'preflop',     // 翻牌前
  FLOP: 'flop',             // 翻牌（3张公共牌）
  TURN: 'turn',             // 转牌（第4张公共牌）
  RIVER: 'river',           // 河牌（第5张公共牌）
  SHOWDOWN: 'showdown',     // 摊牌
  HAND_OVER: 'handover'     // 本局结束
};

// === 玩家动作 ===
const ACTION = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  BET: 'bet',
  RAISE: 'raise',
  ALL_IN: 'allin',
  SMALL_BLIND: 'smallblind',
  BIG_BLIND: 'bigblind'
};

// === 玩家状态 ===
const PLAYER_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FOLDED: 'folded',
  ALL_IN: 'allin',
  SITTING_OUT: 'sittingout'
};

// === AI 难度 ===
const AI_DIFFICULTY = {
  BEGINNER: 0,   // 新手
  NORMAL: 1,     // 普通
  EXPERT: 2,     // 高手
  PRO: 3         // 职业
};

// === 牌型大小（从大到小）===
const HAND_RANK = {
  ROYAL_FLUSH: 10,       // 皇家同花顺
  STRAIGHT_FLUSH: 9,     // 同花顺
  FOUR_OF_A_KIND: 8,     // 四条
  FULL_HOUSE: 7,         // 葫芦
  FLUSH: 6,              // 同花
  STRAIGHT: 5,           // 顺子
  THREE_OF_A_KIND: 4,    // 三条
  TWO_PAIR: 3,           // 两对
  ONE_PAIR: 2,           // 一对
  HIGH_CARD: 1           // 高牌
};

const HAND_RANK_NAMES = {
  10: '皇家同花顺',
  9: '同花顺',
  8: '四条',
  7: '葫芦',
  6: '同花',
  5: '顺子',
  4: '三条',
  3: '两对',
  2: '一对',
  1: '高牌'
};

// === 花色 ===
const SUIT = {
  SPADES: 0,   // 黑桃
  HEARTS: 1,   // 红心
  DIAMONDS: 2, // 方块
  CLUBS: 3     // 梅花
};

const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = ['黑桃', '红心', '方块', '梅花'];

// === 点数 ===
// 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// === 经济系统 ===
const ECONOMY = {
  INITIAL_COINS: 10000,          // 新玩家初始金币
  MAX_LOAN_AMOUNT: 50000,         // 最大贷款额度
  BASE_CREDIT_LIMIT: 5000,        // 基础信用额度
  LOAN_INTEREST_RATE: 0.10,       // 每日利息 10%（娱乐向，高利贷模式）
  LOAN_UPFRONT_FEE_RATE: 0.20,    // 砍头息 20%（借1000到手800，欠1000）
  LOAN_REPAYMENT_DAYS: 7,         // 还款天数
  CREDIT_SCORE_BASE: 600,         // 基础信用分
  CREDIT_SCORE_MIN: 300,          // 最低信用分
  CREDIT_SCORE_MAX: 850,          // 最高信用分
  OVERDUE_PENALTY: 50,            // 逾期扣分
  CREDIT_RECOVERY_PER_DAY: 5,    // 每日信用恢复
  MIN_COINS_TO_PLAY: 100          // 最低进场金币
};

// === 房间设置 ===
const ROOM_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 9,
  DEFAULT_INITIAL_CHIPS: 5000,
  DEFAULT_SMALL_BLIND: 10,
  DEFAULT_BIG_BLIND: 20,
  DEFAULT_MAX_PLAYERS: 6,
  TURN_TIME_LIMIT: 30000,         // 每回合30秒
  AI_THINK_TIME_MIN: 800,         // AI思考最短时间
  AI_THINK_TIME_MAX: 2500         // AI思考最长时间
};

// === UI 尺寸 ===
const UI = {
  SCREEN_WIDTH: 375,
  SCREEN_HEIGHT: 667,
  CARD_WIDTH: 40,
  CARD_HEIGHT: 56,
  CARD_BACK_WIDTH: 30,
  CARD_BACK_HEIGHT: 42,
  CHIP_RADIUS: 12,
  AVATAR_SIZE: 44,
  COLORS: {
    BG: '#1a3a1a',
    TABLE: '#2d5a2d',
    TABLE_EDGE: '#1a3a1a',
    CARD_BG: '#ffffff',
    CARD_BACK: '#2255aa',
    TEXT: '#ffffff',
    TEXT_DARK: '#333333',
    GOLD: '#ffd700',
    RED: '#e74c3c',
    GREEN: '#27ae60',
    BLUE: '#3498db',
    GRAY: '#7f8c8d',
    DARK: '#1a1a2e',
    CHIP_RED: '#e74c3c',
    CHIP_BLUE: '#3498db',
    CHIP_GREEN: '#27ae60',
    CHIP_BLACK: '#2c3e50',
    CHIP_WHITE: '#ecf0f1',
    CHIP_PURPLE: '#9b59b6'
  }
};

module.exports = {
  PHASE,
  ACTION,
  PLAYER_STATUS,
  AI_DIFFICULTY,
  HAND_RANK,
  HAND_RANK_NAMES,
  SUIT,
  SUIT_SYMBOLS,
  SUIT_NAMES,
  RANK_NAMES,
  ECONOMY,
  ROOM_CONFIG,
  UI
};
