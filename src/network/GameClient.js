/**
 * 联机客户端
 * 处理与好友房服务器的WebSocket通信
 */

const { ROOM_CONFIG } = require('../config');

class GameClient {
  constructor() {
    this.ws = null;
    this.clientId = '';
    this.roomId = null;
    this.connected = false;
    this.listeners = {};
  }

  /**
   * 连接服务器
   */
  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      this.ws = wx.connectSocket({
        url: serverUrl,
        success: () => {},
        fail: (err) => reject(err)
      });

      this.ws.onOpen(() => {
        this.connected = true;
        resolve();
      });

      this.ws.onError((err) => {
        reject(err);
      });

      this.ws.onClose(() => {
        this.connected = false;
        this._emit('disconnect');
      });

      this.ws.onMessage((res) => {
        try {
          const message = JSON.parse(res.data);
          this._handleMessage(message);
        } catch (e) {
          console.error('Parse message error:', e);
        }
      });
    });
  }

  /**
   * 创建房间
   */
  createRoom(config, playerInfo) {
    this._send({
      type: 'createRoom',
      config,
      playerInfo
    });
  }

  /**
   * 加入房间
   */
  joinRoom(roomId, password, playerInfo) {
    this._send({
      type: 'joinRoom',
      roomId,
      password,
      playerInfo
    });
  }

  /**
   * 离开房间
   */
  leaveRoom() {
    this._send({ type: 'leaveRoom' });
    this.roomId = null;
  }

  /**
   * 发送游戏动作（权威服务器协议）
   */
  sendAction(action, amount) {
    this._send({
      type: 'action',
      action,
      amount
    });
  }

  /**
   * 同步游戏状态（房主）
   */
  syncGameState(state) {
    this._send({
      type: 'gameStateSync',
      state
    });
  }

  /**
   * 发送准备
   */
  ready() {
    this._send({ type: 'ready' });
  }

  _send(message) {
    if (this.ws && this.connected) {
      this.ws.send({ data: JSON.stringify(message) });
    }
  }

  _handleMessage(message) {
    switch (message.type) {
      case 'connected':
        this.clientId = message.clientId;
        break;

      case 'roomCreated':
        this.roomId = message.roomId;
        this._emit('roomCreated', message);
        break;

      case 'roomJoined':
        this.roomId = message.roomInfo?.id;
        this._emit('roomJoined', message);
        break;

      case 'playerJoined':
        this._emit('playerJoined', message);
        break;

      case 'playerLeft':
        this._emit('playerLeft', message);
        break;

      case 'gameAction':
        this._emit('gameAction', message);
        break;

      case 'gameStateSync':
        this._emit('gameStateSync', message);
        break;

      case 'playerReady':
        this._emit('playerReady', message);
        break;

      case 'error':
        this._emit('error', message);
        break;

      case 'chat':
        this._emit('chat', message);
        break;
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(c => c !== callback);
    } else {
      this.listeners[event] = [];
    }
  }

  _emit(event, data) {
    if (this.listeners[event]) {
      for (const cb of this.listeners[event]) {
        cb(data);
      }
    }
  }

  disconnect() {
    if (this.ws) {
      this.leaveRoom();
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }
}

module.exports = GameClient;
