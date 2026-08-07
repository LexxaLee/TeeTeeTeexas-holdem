global.wx = { getStorageSync: () => null, setStorageSync: () => {}, removeStorageSync: () => {}, clearStorageSync: () => {} };
const PokerGame = require('./src/core/PokerGame');
const Player = require('./src/core/Player');
const AIPlayer = require('./src/ai/AIPlayer');
const { AI_DIFFICULTY, PHASE, ACTION } = require('./src/config');

const g = new PokerGame({ smallBlind:10, bigBlind:20, onEvent:(e,d)=>{ if(e==='handOver') console.log('  HANDOVER reason=',d.reason,'winners=',JSON.stringify(d.winners)); } });
const engines=[];
const diffs=[AI_DIFFICULTY.NORMAL,AI_DIFFICULTY.NORMAL,AI_DIFFICULTY.NORMAL,AI_DIFFICULTY.NORMAL];
for(let i=0;i<4;i++){const p=new Player('as_'+i,'P'+i,'',5000,{isAI:true,aiDifficulty:diffs[i]});g.addPlayer(p);engines.push({player:p,ai:new AIPlayer(diffs[i]),assist:i!==0});}
g.startNewHand();
let actions=0;
console.log('button',g.buttonIndex,'SB/BB order: seats 0=BTN,1=SB,2=BB,3=UTG');
while(!g.isHandOver && actions<300){
  const idx=g.currentPlayerIndex; if(idx===-1)break;
  const cur=g.players[idx]; if(!cur||!cur.canAct)break;
  const ae=engines.find(a=>a.player.id===cur.id); if(!ae)break;
  const ctx={player:cur,assist:ae.assist,gameState:{phase:g.phase,currentBet:g.currentBet,potTotal:g.pot.totalAmount||0,communityCards:g.communityCards,buttonIndex:g.buttonIndex,players:g.players.map(p=>({id:p.id,name:p.name,seatIndex:p.seatIndex,chips:p.chips,currentBet:p.currentBet,totalBet:p.totalBet,status:p.status,isFolded:p.isFolded,isAllIn:p.isAllIn,lastAction:p.lastAction,actionHistory:p.actionHistory}))}};
  const dec=ae.ai.decide(ctx);
  console.log('act',g.players[idx].name,'->',dec.action, dec.amount||'', 'phase',g.phase);
  try{
    if(dec.action==='fold')g.playerFold(idx);
    else if(dec.action==='check')g.playerCheck(idx);
    else if(dec.action==='call')g.playerCall(idx);
    else if(dec.action==='raise'||dec.action==='bet')g.playerRaise(idx,dec.amount);
    else if(dec.action==='allin')g.playerAllIn(idx);
  }catch(e){console.log('ERR',e.message);break;}
  actions++;
}
