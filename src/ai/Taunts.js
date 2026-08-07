/**
 * AI 嘲讽话语库
 * 娱乐为主，让游戏更有趣
 */

const TAUNTS = {
  // AI 赢牌时
  win: [
    '就这？还想赢我？',
    '感谢大侠送来的筹码~',
    '哈哈哈，又是我赢！',
    '你这牌技，得多练练啊',
    '运气也是实力的一部分😎',
    '承让承让，筹码收下了',
    '别灰心，下次你也许能赢...大概吧',
    '这把稳了，你底牌我猜都不用猜',
    '谢谢老板，欢迎下次再来送',
    '你的筹码我真是一把接一把',
  ],

  // 玩家弃牌时
  playerFold: [
    '跑得真快，怂了吧？',
    '弃牌？明智的选择...对你来说',
    '这么快就怂了？还没开始呢',
    '怕了？怕就对了',
    '走好不送~',
    '溜得比兔子还快',
    '这都弃？胆子也太小了',
  ],

  // AI 加注时
  aiRaise: [
    '跟不跟？不敢跟就弃牌吧',
    '这把我要大的',
    '感受到压力了吗？',
    '加注！你敢跟吗？',
    '加注了，钱包够不够啊？',
    '要不要贷款跟我？🏦',
  ],

  // AI 全押时
  aiAllIn: [
    '全押！你敢跟吗？！',
    '梭哈！看你怎么办',
    'ALL IN！怕了吧？',
    '我把家底都押了，你呢？',
  ],

  // 玩家输牌后
  playerLose: [
    '哎呀，又输了呢~',
    '要不要再贷点款？银行随时欢迎',
    '看来今天不是你的幸运日',
    '输了别气馁，借点钱继续送嘛',
    '信用分还够吗？要不要再借点？',
    '连输几把了？冷静一下？算了我懂的',
  ],

  // 玩家筹码很少时
  playerLowChips: [
    '筹码不多了吧？贷款了解一下',
    '快没钱了？银行向你招手🏦',
    '要不要借点？砍头息很划算的~',
  ],
};

/**
 * 随机获取一条嘲讽
 * @param {string} type - 嘲讽类型
 * @returns {string}
 */
function getTaunt(type) {
  const list = TAUNTS[type];
  if (!list || list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * 有概率触发嘲讽（50%概率）
 * @param {string} type
 * @returns {string} 嘲讽文本，空字符串表示不触发
 */
function maybeTaunt(type) {
  if (Math.random() < 0.5) {
    return getTaunt(type);
  }
  return '';
}

module.exports = { TAUNTS, getTaunt, maybeTaunt };
