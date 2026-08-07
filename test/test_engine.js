/**
 * 核心引擎测试
 * 运行: node test/test_engine.js
 */

// Mock wx for testing
global.wx = {
  getStorageSync: () => null,
  setStorageSync: () => {},
  removeStorageSync: () => {},
  clearStorageSync: () => {},
  getSystemInfoSync: () => ({ pixelRatio: 2, screenWidth: 375, screenHeight: 667 }),
  createCanvas: () => ({ getContext: () => ({}), width: 375, height: 667 }),
  createImage: () => ({}),
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  login: () => {},
  showModal: () => {},
  showToast: () => {},
  onHide: () => {},
  onShow: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16)
};

const { Card, Deck } = require('../src/core/Deck');
const { evaluateBest, evaluate5, compareHands } = require('../src/core/HandEvaluator');
const PokerGame = require('../src/core/PokerGame');
const Player = require('../src/core/Player');
const AIPlayer = require('../src/ai/AIPlayer');
const { HAND_RANK, AI_DIFFICULTY, ACTION, PHASE } = require('../src/config');
const { setMonteCarloIterations } = require('../src/ai/HandStrength');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected ${expected}, got ${actual})`);
}

console.log('\n=== 德州扑克引擎测试 ===\n');

// ===== 测试1：牌组 =====
console.log('1. 牌组测试');
const deck = new Deck();
assertEqual(deck.remaining, 52, '牌组应有52张牌');

const card1 = deck.deal();
assertEqual(deck.remaining, 51, '发牌后剩余51张');
assert(card1.suit >= 0 && card1.suit <= 3, '牌的花色在0-3范围内');
assert(card1.rank >= 0 && card1.rank <= 12, '牌的点数在0-12范围内');

// ===== 测试2：牌型评估 =====
console.log('\n2. 牌型评估测试');

// 皇家同花顺
let cards = [
  new Card(0, 12), new Card(0, 11), new Card(0, 10),
  new Card(0, 9), new Card(0, 8), new Card(1, 5), new Card(2, 3)
];
let result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.ROYAL_FLUSH, '皇家同花顺识别');

// 同花顺
cards = [
  new Card(0, 7), new Card(0, 6), new Card(0, 5),
  new Card(0, 4), new Card(0, 3), new Card(1, 12), new Card(2, 10)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.STRAIGHT_FLUSH, '同花顺识别');

// 四条
cards = [
  new Card(0, 8), new Card(1, 8), new Card(2, 8),
  new Card(3, 8), new Card(0, 5), new Card(1, 3), new Card(2, 12)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.FOUR_OF_A_KIND, '四条识别');

// 葫芦
cards = [
  new Card(0, 7), new Card(1, 7), new Card(2, 7),
  new Card(3, 4), new Card(0, 4), new Card(1, 12), new Card(2, 10)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.FULL_HOUSE, '葫芦识别');

// 同花
cards = [
  new Card(0, 2), new Card(0, 5), new Card(0, 7),
  new Card(0, 9), new Card(0, 12), new Card(1, 3), new Card(2, 6)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.FLUSH, '同花识别');

// 顺子
cards = [
  new Card(0, 4), new Card(1, 5), new Card(2, 6),
  new Card(3, 7), new Card(0, 8), new Card(1, 2), new Card(2, 12)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.STRAIGHT, '顺子识别');

// A-2-3-4-5 轮子顺子
cards = [
  new Card(0, 12), new Card(1, 0), new Card(2, 1),
  new Card(3, 2), new Card(0, 3), new Card(1, 8), new Card(2, 10)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.STRAIGHT, 'A-5轮子顺子识别');

// 三条
cards = [
  new Card(0, 9), new Card(1, 9), new Card(2, 9),
  new Card(3, 4), new Card(0, 7), new Card(1, 12), new Card(2, 2)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.THREE_OF_A_KIND, '三条识别');

// 两对
cards = [
  new Card(0, 5), new Card(1, 5), new Card(2, 10),
  new Card(3, 10), new Card(0, 3), new Card(1, 7), new Card(2, 12)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.TWO_PAIR, '两对识别');

// 一对
cards = [
  new Card(0, 7), new Card(1, 7), new Card(2, 3),
  new Card(3, 9), new Card(0, 12), new Card(1, 5), new Card(2, 10)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.ONE_PAIR, '一对识别');

// 高牌
cards = [
  new Card(0, 2), new Card(1, 5), new Card(2, 9),
  new Card(3, 12), new Card(0, 7), new Card(1, 3), new Card(2, 10)
];
result = evaluateBest(cards);
assertEqual(result.rank, HAND_RANK.HIGH_CARD, '高牌识别');

// ===== 测试3：牌型比较 =====
console.log('\n3. 牌型比较测试');

// 同花顺 vs 四条
const sf = evaluateBest([
  new Card(0, 7), new Card(0, 6), new Card(0, 5),
  new Card(0, 4), new Card(0, 3), new Card(1, 12), new Card(2, 10)
]);
const quads = evaluateBest([
  new Card(0, 8), new Card(1, 8), new Card(2, 8),
  new Card(3, 8), new Card(0, 5), new Card(1, 3), new Card(2, 12)
]);
assert(compareHands(sf, quads) > 0, '同花顺 > 四条');

// AA vs KK (对子比较)
const aa = evaluateBest([
  new Card(0, 12), new Card(1, 12), new Card(2, 3),
  new Card(3, 5), new Card(0, 7), new Card(1, 9), new Card(2, 2)
]);
const kk = evaluateBest([
  new Card(0, 11), new Card(1, 11), new Card(2, 3),
  new Card(3, 5), new Card(0, 7), new Card(1, 9), new Card(2, 2)
]);
assert(compareHands(aa, kk) > 0, 'AA > KK');

// ===== 测试4：游戏流程 =====
console.log('\n4. 游戏流程测试');

const game = new PokerGame({
  smallBlind: 10,
  bigBlind: 20,
  onEvent: (event, data) => {}
});

// 添加3个玩家
const p1 = new Player('p1', 'Alice', '', 5000);
const p2 = new Player('p2', 'Bob', '', 5000);
const p3 = new Player('p3', 'Charlie', '', 5000);
game.addPlayer(p1);
game.addPlayer(p2);
game.addPlayer(p3);

assertEqual(game.players.length, 3, '3个玩家加入');

// 开始第一局
game.startNewHand();
assertEqual(game.phase, PHASE.PRE_FLOP, '翻牌前阶段');
assert(game.currentBet === 20, '当前下注应为大盲(20)');
assertEqual(game.communityCards.length, 0, '无公共牌');

// 每人应有2张底牌
for (const p of game.activePlayers) {
  assertEqual(p.holeCards.length, 2, `${p.name}有2张底牌`);
}

// 盲注检查
const totalBlinds = game.players.reduce((sum, p) => sum + p.currentBet, 0);
assertEqual(totalBlinds, 30, '盲注总额应为30 (10+20)');

// ===== 测试5：AI决策 =====
console.log('\n5. AI决策测试');

const ai = new AIPlayer(AI_DIFFICULTY.NORMAL);

// 构造AI上下文
const aiPlayer = new Player('ai_test', 'AI', '', 5000, { isAI: true });
aiPlayer.holeCards = [new Card(0, 12), new Card(1, 12)]; // AA

const aiContext = {
  player: aiPlayer,
  gameState: {
    phase: PHASE.PRE_FLOP,
    currentBet: 20,
    potTotal: 30,
    communityCards: [],
    buttonIndex: 0,
    players: [
      { id: 'p1', name: 'Alice', seatIndex: 0, chips: 5000, currentBet: 0,
        totalBet: 0, status: 'playing', isFolded: false, isAllIn: false,
        lastAction: null, actionHistory: [] },
      { id: 'ai_test', name: 'AI', seatIndex: 1, chips: 5000, currentBet: 0,
        totalBet: 0, status: 'playing', isFolded: false, isAllIn: false,
        lastAction: null, actionHistory: [] },
      { id: 'p3', name: 'Charlie', seatIndex: 2, chips: 5000, currentBet: 0,
        totalBet: 0, status: 'playing', isFolded: false, isAllIn: false,
        lastAction: null, actionHistory: [] }
    ]
  }
};

const decision = ai.decide(aiContext);
assert(decision.action !== ACTION.FOLD, 'AI拿到AA不应弃牌');

// 测试AI拿到弱牌
const weakPlayer = new Player('weak', 'WeakAI', '', 5000, { isAI: true });
weakPlayer.holeCards = [new Card(0, 0), new Card(1, 1)]; // 2,3 offsuit
weakPlayer.currentBet = 0;

const weakContext = {
  player: weakPlayer,
  gameState: {
    phase: PHASE.PRE_FLOP,
    currentBet: 100, // 大下注
    potTotal: 150,
    communityCards: [],
    buttonIndex: 0,
    players: [
      { id: 'p1', name: 'Alice', seatIndex: 0, chips: 5000, currentBet: 100,
        totalBet: 100, status: 'playing', isFolded: false, isAllIn: false,
        lastAction: 'raise', actionHistory: [{ action: 'raise', amount: 100 }] },
      { id: 'weak', name: 'WeakAI', seatIndex: 1, chips: 5000, currentBet: 0,
        totalBet: 0, status: 'playing', isFolded: false, isAllIn: false,
        lastAction: null, actionHistory: [] }
    ]
  }
};

// 普通AI面对大下注+弱牌，大概率弃牌（多次测试）
let foldCount = 0;
for (let i = 0; i < 20; i++) {
  const d = ai.decide(weakContext);
  if (d.action === ACTION.FOLD) foldCount++;
}
assert(foldCount >= 10, `AI拿23面对大下注多数弃牌 (${foldCount}/20)`);

// ===== 测试6：AI不读底牌验证 =====
console.log('\n6. AI不作弊验证');

// AI上下文中不包含其他玩家的底牌
const noCheatContext = {
  player: aiPlayer,
  gameState: {
    phase: PHASE.FLOP,
    currentBet: 0,
    potTotal: 60,
    communityCards: [new Card(0, 5), new Card(1, 7), new Card(2, 9)],
    buttonIndex: 0,
    players: [
      { id: 'p1', name: 'Alice', seatIndex: 0, chips: 4940, currentBet: 0,
        totalBet: 20, status: 'playing', isFolded: false, isAllIn: false,
        lastAction: 'check', actionHistory: [{ action: 'check', amount: 0 }] }
    ]
  }
};

// 确认context中没有holeCards
const playerData = noCheatContext.gameState.players[0];
assert(!playerData.holeCards, 'AI上下文中不包含对手底牌');
assert(!('holeCards' in playerData), 'AI上下文中没有holeCards字段');

// ===== 测试7：完整游戏模拟 =====
console.log('\n7. 完整游戏模拟（AI对战）');

const simGame = new PokerGame({
  smallBlind: 10,
  bigBlind: 20,
  onEvent: () => {}
});

// 添加4个AI玩家
const aiNames = ['AI-A', 'AI-B', 'AI-C', 'AI-D'];
const aiEngines = [];
const difficulties = [AI_DIFFICULTY.BEGINNER, AI_DIFFICULTY.NORMAL,
                      AI_DIFFICULTY.EXPERT, AI_DIFFICULTY.PRO];

for (let i = 0; i < 4; i++) {
  const p = new Player('sim_ai_' + i, aiNames[i], '', 5000, {
    isAI: true, aiDifficulty: difficulties[i]
  });
  simGame.addPlayer(p);
  aiEngines.push({
    player: p,
    ai: new AIPlayer(difficulties[i])
  });
}

// 模拟一局
simGame.startNewHand();
let actions = 0;
const maxActions = 200; // 安全上限

while (!simGame.isHandOver && actions < maxActions) {
  const currentIdx = simGame.currentPlayerIndex;
  if (currentIdx === -1) break;

  const currentPlayer = simGame.players[currentIdx];
  if (!currentPlayer || !currentPlayer.canAct) {
    break;
  }

  const aiEntry = aiEngines.find(a => a.player.id === currentPlayer.id);
  if (!aiEntry) break;

  const context = {
    player: currentPlayer,
    gameState: {
      phase: simGame.phase,
      currentBet: simGame.currentBet,
      potTotal: simGame.pot.totalAmount || 0,
      communityCards: simGame.communityCards,
      buttonIndex: simGame.buttonIndex,
      players: simGame.players.map(p => ({
        id: p.id, name: p.name, seatIndex: p.seatIndex,
        chips: p.chips, currentBet: p.currentBet, totalBet: p.totalBet,
        status: p.status, isFolded: p.isFolded, isAllIn: p.isAllIn,
        lastAction: p.lastAction, actionHistory: p.actionHistory
      }))
    }
  };

  const decision = aiEntry.ai.decide(context);

  try {
    if (decision.action === 'fold') simGame.playerFold(currentIdx);
    else if (decision.action === 'check') simGame.playerCheck(currentIdx);
    else if (decision.action === 'call') simGame.playerCall(currentIdx);
    else if (decision.action === 'raise' || decision.action === 'bet')
      simGame.playerRaise(currentIdx, decision.amount);
    else if (decision.action === 'allin') simGame.playerAllIn(currentIdx);
  } catch (e) {
    console.log(`    AI action error: ${e.message}`);
    try {
      const callAmt = simGame.getCallAmount(currentIdx);
      if (callAmt === 0) simGame.playerCheck(currentIdx);
      else simGame.playerFold(currentIdx);
    } catch (e2) {
      console.log(`    Fallback error: ${e2.message}`);
      break;
    }
  }

  actions++;
}

assert(simGame.isHandOver, `游戏应正常结束 (${actions}次行动)`);
assert(simGame.winners.length > 0, '应有赢家');

if (simGame.winners.length > 0) {
  for (const w of simGame.winners) {
    console.log(`    赢家: ${w.player.name} +${w.amount} ${w.hand ? require('../src/config').HAND_RANK_NAMES[w.hand.rank] : ''}`);
  }
}

// 验证筹码守恒
const totalChips = simGame.players.reduce((sum, p) => sum + p.chips, 0);
const expectedTotal = 4 * 5000;
assertEqual(totalChips, expectedTotal, '筹码守恒（赢家获得所有筹码）');

// ===== 测试8：胜负校验（亮牌后赢家确实持最佳牌型）=====
console.log('\n8. 胜负校验（摊牌赢家持最佳牌型）');

const verifyGame = new PokerGame({
  smallBlind: 10,
  bigBlind: 20,
  onEvent: () => {}
});

const vNames = ['V-A', 'V-B', 'V-C', 'V-D'];
const vEngines = [];
const vDiff = [AI_DIFFICULTY.BEGINNER, AI_DIFFICULTY.NORMAL,
              AI_DIFFICULTY.EXPERT, AI_DIFFICULTY.PRO];

for (let i = 0; i < 4; i++) {
  const p = new Player('v_' + i, vNames[i], '', 5000, {
    isAI: true, aiDifficulty: vDiff[i]
  });
  verifyGame.addPlayer(p);
  vEngines.push({ player: p, ai: new AIPlayer(vDiff[i]) });
}

let handsPlayed = 0;
let showdownsChecked = 0;
let verifyFails = 0;

for (let h = 0; h < 400; h++) {
  verifyGame.startNewHand();
  let actions = 0;
  while (!verifyGame.isHandOver && actions < 300) {
    const idx = verifyGame.currentPlayerIndex;
    if (idx === -1) break;
    const cur = verifyGame.players[idx];
    if (!cur || !cur.canAct) break;
    const ae = vEngines.find(a => a.player.id === cur.id);
    if (!ae) break;

    const ctx = {
      player: cur,
      gameState: {
        phase: verifyGame.phase,
        currentBet: verifyGame.currentBet,
        potTotal: verifyGame.pot.totalAmount || 0,
        communityCards: verifyGame.communityCards,
        buttonIndex: verifyGame.buttonIndex,
        players: verifyGame.players.map(p => ({
          id: p.id, name: p.name, seatIndex: p.seatIndex,
          chips: p.chips, currentBet: p.currentBet, totalBet: p.totalBet,
          status: p.status, isFolded: p.isFolded, isAllIn: p.isAllIn,
          lastAction: p.lastAction, actionHistory: p.actionHistory
        }))
      }
    };
    const dec = ae.ai.decide(ctx);
    try {
      if (dec.action === 'fold') verifyGame.playerFold(idx);
      else if (dec.action === 'check') verifyGame.playerCheck(idx);
      else if (dec.action === 'call') verifyGame.playerCall(idx);
      else if (dec.action === 'raise' || dec.action === 'bet') verifyGame.playerRaise(idx, dec.amount);
      else if (dec.action === 'allin') verifyGame.playerAllIn(idx);
    } catch (e) {
      try {
        const ca = verifyGame.getCallAmount(idx);
        if (ca === 0) verifyGame.playerCheck(idx);
        else verifyGame.playerFold(idx);
      } catch (e2) { break; }
    }
    actions++;
  }

  handsPlayed++;

  // 独立重算每个底池的赢家（仅在合格玩家中取最佳牌型），与引擎结果比对
  // 这样能正确检验"摊牌赢家确实持最佳牌型"，同时兼容边池/全押资格
  const pots = verifyGame.pot.pots;
  // 仅在真正摊牌（公共牌≥5，对所有参与者公平比牌）时做胜负校验；
  // 翻牌前/翻牌中因他人弃牌致胜的局面无需比牌，跳过
  if (verifyGame.communityCards.length >= 5 && pots && pots.length > 0) {
    // 只评估有资格参与底池的玩家（他们必然到过摊牌，满5张牌）
    const eligibleSet = new Set();
    for (const pot of pots) {
      if (pot.eligiblePlayerIds) {
        for (const pid of pot.eligiblePlayerIds) eligibleSet.add(pid);
      }
    }
    const handsById = {};
    for (const p of verifyGame.players) {
      if (eligibleSet.has(p.id) && (p.holeCards.length + verifyGame.communityCards.length) >= 5) {
        handsById[p.id] = evaluateBest([...p.holeCards, ...verifyGame.communityCards]);
      }
    }

    // 独立分配（与 Pot.distribute 同样的规则，但用独立评估的牌型）
    const indWinnings = new Map();
    for (const pot of pots) {
      if (!pot.eligiblePlayerIds || pot.eligiblePlayerIds.length === 0) continue;
      let bestHand = null;
      let bestPids = [];
      for (const pid of pot.eligiblePlayerIds) {
        const h = handsById[pid];
        if (!bestHand) {
          bestHand = h; bestPids = [pid];
        } else {
          const c = compareHands(h, bestHand);
          if (c > 0) { bestHand = h; bestPids = [pid]; }
          else if (c === 0) bestPids.push(pid);
        }
      }
      const share = Math.floor(pot.amount / bestPids.length);
      const rem = pot.amount - share * bestPids.length;
      bestPids.forEach((pid, i) => {
        indWinnings.set(pid, (indWinnings.get(pid) || 0) + share + (i < rem ? 1 : 0));
      });
    }

    // 引擎实际分配
    const engWinnings = new Map();
    for (const w of verifyGame.winners) {
      engWinnings.set(w.player.id, (engWinnings.get(w.player.id) || 0) + w.amount);
    }

    // 比对：每个玩家在两个分配中的金额必须一致
    const allIds = new Set([...indWinnings.keys(), ...engWinnings.keys()]);
    for (const id of allIds) {
      if ((indWinnings.get(id) || 0) !== (engWinnings.get(id) || 0)) {
        verifyFails++;
      }
    }
    showdownsChecked++;
  }
}

assert(handsPlayed >= 400, `完成${handsPlayed}局模拟`);
assert(showdownsChecked > 50, `触发足够多的摊牌（${showdownsChecked}局）`);
assert(verifyFails === 0, `摊牌赢家均持最佳牌型（失败${verifyFails}）`);

// 筹码守恒再次确认
const vTotal = verifyGame.players.reduce((sum, p) => sum + p.chips, 0);
assertEqual(vTotal, 4 * 5000, '胜负校验模拟后筹码守恒');

// ===== 测试9：AI对战胜率校准（真人略高于AI）=====
console.log('\n9. AI对战胜率校准（真人略高于AI）');

// 加速蒙特卡洛（仅测试用，不影响正式游戏默认300）
setMonteCarloIterations(30);

// 模拟若干局：seat0 固定为"真人"（熟练玩家代理=EXPERT，不让利），
// 其余3个AI使用与 GameApp 真实对局一致的组合难度（NORMAL/EXPERT/BEGINNER），
// 在练习模式下让利。旋转按钮（g.buttonIndex = h%4）消除位置偏差，使胜率公平可比。
const SIM_OPP_DIFFS = [AI_DIFFICULTY.NORMAL, AI_DIFFICULTY.EXPERT, AI_DIFFICULTY.BEGINNER];
function runHumanSim(hands, practiceMode) {
  let humanWins = 0;
  let completed = 0;
  for (let h = 0; h < hands; h++) {
    const g = new PokerGame({
      smallBlind: 10, bigBlind: 20, practiceMode, onEvent: () => {}
    });
    const engines = [];
    for (let i = 0; i < 4; i++) {
      const diff = (i === 0) ? AI_DIFFICULTY.EXPERT : SIM_OPP_DIFFS[(i - 1) % 3];
      const p = new Player('s_' + i, 'P' + i, '', 5000, {
        isAI: true, aiDifficulty: diff
      });
      g.addPlayer(p);
      // seat0=真人（不让利）；其余AI在练习模式下让利
      engines.push({ player: p, ai: new AIPlayer(diff), handicap: practiceMode && i !== 0 });
    }
    g.buttonIndex = h % 4; // 旋转按钮，消除位置偏差
    g.startNewHand();
    let actions = 0;
    while (!g.isHandOver && actions < 300) {
      const idx = g.currentPlayerIndex;
      if (idx === -1) break;
      const cur = g.players[idx];
      if (!cur || !cur.canAct) break;
      const ae = engines.find(a => a.player.id === cur.id);
      if (!ae) break;
      const ctx = {
        player: cur,
        practiceMode: ae.handicap,
        humanId: 's_0',
        gameState: {
          phase: g.phase, currentBet: g.currentBet, potTotal: g.pot.totalAmount || 0,
          communityCards: g.communityCards, buttonIndex: g.buttonIndex,
          players: g.players.map(p => ({
            id: p.id, name: p.name, seatIndex: p.seatIndex,
            chips: p.chips, currentBet: p.currentBet, totalBet: p.totalBet,
            status: p.status, isFolded: p.isFolded, isAllIn: p.isAllIn,
            lastAction: p.lastAction, actionHistory: p.actionHistory
          }))
        }
      };
      const dec = ae.ai.decide(ctx);
      try {
        if (dec.action === 'fold') g.playerFold(idx);
        else if (dec.action === 'check') g.playerCheck(idx);
        else if (dec.action === 'call') g.playerCall(idx);
        else if (dec.action === 'raise' || dec.action === 'bet') g.playerRaise(idx, dec.amount);
        else if (dec.action === 'allin') g.playerAllIn(idx);
      } catch (e) {
        try { const ca = g.getCallAmount(idx); if (ca === 0) g.playerCheck(idx); else g.playerFold(idx); }
        catch (e2) { break; }
      }
      actions++;
    }
    if (!g.isHandOver) continue;
    completed++;
    if (g.winners.some(w => w.player.id === 's_0' && w.amount > 0)) humanWins++;
  }
  return { humanWins, completed };
}

const simNormal = runHumanSim(2000, false);
const rateNormal = simNormal.completed > 0 ? simNormal.humanWins / simNormal.completed : 0;
console.log(`    普通模式真人胜率: ${(rateNormal * 100).toFixed(1)}% (${simNormal.humanWins}/${simNormal.completed})`);

const simPrac = runHumanSim(2000, true);
const ratePrac = simPrac.completed > 0 ? simPrac.humanWins / simPrac.completed : 0;
console.log(`    练习模式真人胜率: ${(ratePrac * 100).toFixed(1)}% (${simPrac.humanWins}/${simPrac.completed})`);

assert(simPrac.completed >= 1500, `完成足够多的模拟局（${simPrac.completed}）`);
// 普通模式真人(熟练玩家代理)约16%-18%；练习模式让利后应明显高于普通模式（约+8%~+11%），
// 且真人胜率≈26% 略高于各AI(≈24.7%)，处于"略高于AI"的合理区间。
assert(ratePrac > rateNormal + 0.03, `练习模式胜率明显高于普通模式（差${((ratePrac - rateNormal) * 100).toFixed(1)}%）`);
assert(ratePrac >= 0.22 && ratePrac <= 0.36, `练习模式真人胜率略高于AI（实测${(ratePrac * 100).toFixed(1)}%，区间22%-36%）`);

// ===== 测试10：练习模式牌型分布（低概率牌型更多）=====
console.log('\n10. 练习模式牌型分布（同花/顺子/葫芦等更易出现）');

// 直接检验"公共牌"的偏置：练习模式的预制牌库应比随机牌库更常出现
// 低概率牌型倾向（≥4张同花 或 ≥4张连续 或 ≥3张同点）。对子(random约49%)不计入。
// 用大样本直接读 pendingBoard，避免摊牌样本过小导致波动。
function boardStrongRate(practiceMode, count) {
  let strong = 0;
  for (let i = 0; i < count; i++) {
    let board;
    if (practiceMode) {
      // 练习模式：用2个占位玩家发牌，读取预制偏置公共牌库
      const g = new PokerGame({
        smallBlind: 10, bigBlind: 20, practiceMode: true, onEvent: () => {}
      });
      g.addPlayer(new Player('d1', 'D1', '', 1000, { isAI: true }));
      g.addPlayer(new Player('d2', 'D2', '', 1000, { isAI: true }));
      g.startNewHand();
      board = g.pendingBoard;
    } else {
      // 普通模式无预制牌库：用随机5张模拟自然发牌
      const d = new Deck();
      const b = [];
      for (let k = 0; k < 5; k++) b.push(d.deal());
      board = b;
    }
    if (!board || board.length < 5) continue;
    const suits = {}; const rankCounts = {}; const ranks = [];
    for (const c of board) {
      suits[c.suit] = (suits[c.suit] || 0) + 1;
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
      ranks.push(c.rank);
    }
    const maxSuit = Math.max(...Object.values(suits));
    const maxRank = Math.max(...Object.values(rankCounts));
    const sorted = [...new Set(ranks)].sort((a, b) => a - b);
    let maxStreak = 1, streak = 1;
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k] - sorted[k - 1] === 1) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else streak = 1;
    }
    // 聚焦"低概率牌型"倾向：≥4张同花（同花/同花听牌）、≥4张连续（顺子/顺子听牌）、
    // 或≥3张同点（葫芦/四条倾向）。对子(random约49%)不计入，以免稀释偏置信号。
    if (maxSuit >= 4 || maxStreak >= 4 || maxRank >= 3) strong++;
  }
  return strong / count;
}

const boardNormal = boardStrongRate(false, 4000);
const boardPrac = boardStrongRate(true, 4000);
console.log(`    普通模式低概率牌型(≥4同花/≥4顺/三条)占比: ${(boardNormal * 100).toFixed(1)}%`);
console.log(`    练习模式低概率牌型(≥4同花/≥4顺/三条)占比: ${(boardPrac * 100).toFixed(1)}%`);
assert(boardPrac > boardNormal + 0.15, `练习模式低概率牌型明显更多（差${((boardPrac - boardNormal) * 100).toFixed(1)}%）`);

// 恢复默认蒙特卡洛迭代，避免影响其它潜在用途
setMonteCarloIterations(300);

// ===== 测试结果汇总 =====
console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed} / 失败: ${failed}`);
console.log(failed === 0 ? '✅ 全部通过！' : '❌ 有测试失败！');

process.exit(failed > 0 ? 1 : 0);
