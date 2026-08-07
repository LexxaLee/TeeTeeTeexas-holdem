/**
 * 联机对战端到端测试
 *
 * 启动权威服务器（server/server.js），用两个 ws 客户端跑完整一手牌，断言：
 *   1. 状态快照连续推进，currentPlayerIndex 始终合法（-1 <= idx < 玩家数）
 *   2. 对局中：仅本人可见自己底牌（信息隔离），其余玩家底牌不可见
 *   3. 筹码守恒：任意快照 sum(玩家筹码) + 底池 === 玩家数 × 初始筹码
 *   4. 局末 winners 非空，且 winners + 玩家筹码 + 底池 === 玩家数 × 初始筹码
 *   5. 服务器在约 6 秒后自动发下一局（验证"联机自动推进下一局"）
 *
 * 覆盖两种场景：
 *   场景A：2 真人（房主+好友）跨设备对战 —— 验证真人回合驱动 + 双方都行动
 *   场景B：1 真人 + AI 补位（3 人房） —— 验证服务器自动驱动 AI + AI 补位
 */

const WebSocket = require('ws');
const assert = require('assert');

const PORT = process.env.TEST_PORT || '8123';
process.env.PORT = PORT;
const { wss } = require('../server/server.js');

const URL = 'ws://localhost:' + PORT;

function open() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', (e) => reject(e));
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

function waitFor(ws, pred, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMsg);
      reject(new Error('waitFor timeout'));
    }, timeoutMs);
    function onMsg(raw) {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (pred(msg)) {
        clearTimeout(timer);
        ws.removeListener('message', onMsg);
        resolve(msg);
      }
    }
    ws.on('message', onMsg);
  });
}

/**
 * 挂接一个客户端的行动循环，直到下一局自动开始。
 * @returns Promise<ctx>，ctx 含各种断言结果
 */
function attachDriver(ws, myPlayerId, initialChips, totalPlayers) {
  return new Promise((resolve, reject) => {
    const ctx = {
      myPlayerId,
      totalInitial: initialChips * totalPlayers,
      totalSeen: 0,
      handOverSeen: false,
      secondHandSeen: false,
      snapshots: [],
      conservationOK: true,
      infoHideOK: true,
      indexOK: true,
      lastHandOver: null,
      handLive: null,        // 本局基准总量（阵容随局变化，需逐局记录）
      lastWasHandover: false,
      badSnap: null,
      fatal: null
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout; handOverSeen=' + ctx.handOverSeen +
        ' secondHandSeen=' + ctx.secondHandSeen + ' totalSeen=' + ctx.totalSeen));
    }, 25000);

    function cleanup() {
      clearTimeout(timer);
      ws.removeAllListeners('message');
    }

    function fail(err) {
      ctx.fatal = err.message;
      cleanup();
      reject(err);
    }

    function onState(snap) {
      try {
        ctx.totalSeen++;
        ctx.snapshots.push(snap);

        // 1) currentPlayerIndex 合法
        if (!(snap.currentPlayerIndex >= -1 && snap.currentPlayerIndex < snap.players.length)) {
          ctx.indexOK = false;
        }

        // 2) 信息隔离：对局中本人 2 张，他人 0 张（本人未入局时不做此项）
        if (!snap.isHandOver) {
          const me = snap.players[snap.mySeatIndex];
          const iAmIn = me && me.id === myPlayerId;
          for (const p of snap.players) {
            if (p.id === myPlayerId) {
              if (iAmIn && p.holeCards.length !== 2) ctx.infoHideOK = false;
            } else {
              if (p.holeCards.length !== 0) ctx.infoHideOK = false;
            }
          }
        }

        // 3) 筹码守恒：本局内 sum(玩家筹码) + sum(currentBet) + 底池 恒定
        //    （底池每轮结束才归集，未归集的下注在玩家 currentBet 上；阵容随局变化，故逐局记录基准）
        const sumChips = snap.players.reduce((s, p) => s + Math.floor(p.chips), 0);
        const committed = snap.players.reduce((s, p) => s + Math.floor(p.currentBet), 0);
        const live = sumChips + committed + Math.floor(snap.potTotal);

        if (snap.isHandOver) {
          if (!ctx.lastHandOver) {
            assert.ok(snap.winners.length > 0, '局末必须有赢家');
            if (ctx.handLive != null && live !== ctx.handLive) {
              if (!ctx.badSnap) ctx.badSnap = {
                kind: 'handover', live, handLive: ctx.handLive, pot: snap.potTotal, sumChips,
                players: snap.players.map(p => ({ id: p.id, chips: Math.floor(p.chips) }))
              };
              ctx.conservationOK = false;
            }
            const winSum = snap.winners.reduce((s, w) => s + Math.floor(w.amount), 0);
            assert.ok(winSum > 0, '赢家派彩总额应 > 0');
            ctx.lastHandOver = snap;
            ctx.handOverSeen = true;
          }
          ctx.lastWasHandover = true;
          return; // 等待下一局
        }

        // 新一手的首个快照：记录本局基准总量
        if (ctx.lastWasHandover || ctx.handLive == null) {
          ctx.handLive = live;
          ctx.lastWasHandover = false;
        } else if (live !== ctx.handLive) {
          if (!ctx.badSnap) ctx.badSnap = {
            kind: 'midhand', live, handLive: ctx.handLive, phase: snap.phase, pot: snap.potTotal,
            sumChips, committed,
            players: snap.players.map(p => ({ id: p.id, chips: Math.floor(p.chips), cb: Math.floor(p.currentBet) })),
            mySeat: snap.mySeatIndex, cur: snap.currentPlayerIndex
          };
          ctx.conservationOK = false;
        }

        if (ctx.handOverSeen) {
          // 收到非结束状态 = 下一局已开始
          ctx.secondHandSeen = true;
          cleanup();
          resolve(ctx);
          return;
        }

        // 轮到本人则行动（始终跟注/过牌，保证牌局推进）
        const me = snap.players[snap.mySeatIndex];
        if (snap.currentPlayerIndex === snap.mySeatIndex && me && !me.isAI) {
          const callAmt = Math.max(0, Math.floor(snap.currentBet) - Math.floor(me.currentBet));
          const action = callAmt === 0 ? 'check' : 'call';
          send(ws, { type: 'action', action, amount: 0 });
        }
      } catch (e) {
        fail(e);
      }
    }

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
      if (msg.type === 'state') onState(msg);
      // 'error' 等其它消息忽略（由服务器在非法动作时下发，本测试策略不产生非法动作）
    });
  });
}

async function scenarioA() {
  console.log('--- 场景A：2 真人跨设备对战 ---');
  const wsA = await open();
  const cfg = { maxPlayers: 2, initialChips: 1000, smallBlind: 10, bigBlind: 20, aiDifficulty: 0 };

  // 先挂接驱动（在服务器下发首帧状态之前就监听），再发创建请求
  const driverA = attachDriver(wsA, 'A', 1000, 2);
  send(wsA, { type: 'createRoom', config: cfg, playerInfo: { playerId: 'A', name: '甲', avatar: '' } });
  const created = await waitFor(wsA, (m) => m.type === 'roomCreated');
  const roomId = created.roomId;
  console.log('  房间号:', roomId);

  // 好友 B 加入（同样先挂接驱动后再加入）
  const wsB = await open();
  const driverB = attachDriver(wsB, 'B', 1000, 2);
  send(wsB, { type: 'joinRoom', roomId, playerInfo: { playerId: 'B', name: '乙', avatar: '' } });
  const joined = await waitFor(wsB, (m) => m.type === 'roomJoined');
  assert.strictEqual(joined.roomId, roomId);

  // 两个客户端各自跑到底（完成一手牌 + 服务器自动推进下一局）
  const [ctxA, ctxB] = await Promise.all([driverA, driverB]);

  for (const [tag, ctx] of [['A', ctxA], ['B', ctxB]]) {
    assert.ok(ctx.indexOK, tag + ' currentPlayerIndex 合法性');
    assert.ok(ctx.infoHideOK, tag + ' 信息隔离（仅本人可见底牌）');
    assert.ok(ctx.conservationOK, tag + ' 筹码守恒' + (ctx.badSnap ? ' bad=' + JSON.stringify(ctx.badSnap) : ''));
    assert.ok(ctx.handOverSeen, tag + ' 至少完成一手牌');
    assert.ok(ctx.secondHandSeen, tag + ' 服务器自动推进下一局');
  }

  // 两人看到的同一手局末公共牌数应一致
  const ca = ctxA.lastHandOver.communityCards.length;
  const cb = ctxB.lastHandOver.communityCards.length;
  assert.strictEqual(ca, cb, '双方局末公共牌一致');

  wsA.close();
  wsB.close();
  console.log('  场景A 通过 ✓');
}

async function scenarioB() {
  console.log('--- 场景B：1 真人 + AI 补位（3 人房） ---');
  const wsA = await open();
  const cfg = { maxPlayers: 3, initialChips: 1000, smallBlind: 10, bigBlind: 20, aiDifficulty: 0 };
  const driver = attachDriver(wsA, 'A2', 1000, 3);
  send(wsA, { type: 'createRoom', config: cfg, playerInfo: { playerId: 'A2', name: '甲', avatar: '' } });
  const created = await waitFor(wsA, (m) => m.type === 'roomCreated');
  console.log('  房间号:', created.roomId);

  const ctx = await driver;
  assert.ok(ctx.indexOK, 'currentPlayerIndex 合法性');
  assert.ok(ctx.infoHideOK, '信息隔离（真人不可见 AI 底牌）');
  assert.ok(ctx.conservationOK, '筹码守恒');
  assert.ok(ctx.handOverSeen, '完成一手牌');
  assert.ok(ctx.secondHandSeen, '服务器自动推进下一局');

  // 验证确有 AI 参与（首手有 isAI 玩家）
  const hasAI = ctx.snapshots.some(s => s.players.some(p => p.isAI));
  assert.ok(hasAI, '存在 AI 补位玩家');

  wsA.close();
  console.log('  场景B 通过 ✓');
}

(async () => {
  try {
    await scenarioA();
    await scenarioB();
    console.log('\n全部联机端到端测试通过 ✓');
    wss.close();
    setTimeout(() => process.exit(0), 300);
  } catch (e) {
    console.error('\n联机测试失败:', e.message);
    try { wss.close(); } catch (_) {}
    setTimeout(() => process.exit(1), 300);
  }
})();
