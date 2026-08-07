/**
 * 微信小游戏入口
 * Texas Hold'em Poker
 */

// 获取系统信息
const systemInfo = wx.getSystemInfoSync();
const screenWidth = systemInfo.screenWidth;
const screenHeight = systemInfo.screenHeight;

// 获取主canvas
const canvas = wx.createCanvas();
canvas.width = screenWidth;
canvas.height = screenHeight;

// 导入游戏主控制器
const GameApp = require('./src/GameApp');

// 创建并启动游戏
const game = new GameApp(canvas);
game.start();

// 微信登录（获取用户信息）
wx.login({
  success: (res) => {
    // 登录成功，可以获取用户信息
    if (wx.getUserProfile) {
      // 较新版本的微信需要用户主动触发
      // 暂时使用默认信息
      if (!game.playerData.nickname) {
        game.playerData.initFromWeChat({
          nickName: '玩家' + Math.floor(Math.random() * 1000),
          avatarUrl: ''
        });
      }
    }
  }
});

// 监听小游戏隐藏/显示
wx.onHide(() => {
  console.log('Game hidden');
});

wx.onShow(() => {
  console.log('Game shown');
  // 每日结算
  if (game.playerData) {
    game.playerData.economy.dailyCheck();
  }
});
