/**
 * 本地存储管理
 * 封装微信小游戏的本地存储API
 */

const STORAGE_PREFIX = 'thp_'; // Texas Hold'em Poker

const Storage = {
  /**
   * 读取数据
   */
  get(key, defaultValue = null) {
    try {
      const fullKey = STORAGE_PREFIX + key;
      const value = wx.getStorageSync(fullKey);
      if (value === '' || value === undefined || value === null) {
        return defaultValue;
      }
      return value;
    } catch (e) {
      console.error('Storage.get error:', key, e);
      return defaultValue;
    }
  },

  /**
   * 写入数据
   */
  set(key, value) {
    try {
      const fullKey = STORAGE_PREFIX + key;
      wx.setStorageSync(fullKey, value);
    } catch (e) {
      console.error('Storage.set error:', key, e);
    }
  },

  /**
   * 删除数据
   */
  remove(key) {
    try {
      const fullKey = STORAGE_PREFIX + key;
      wx.removeStorageSync(fullKey);
    } catch (e) {
      console.error('Storage.remove error:', key, e);
    }
  },

  /**
   * 清除所有游戏数据
   */
  clear() {
    try {
      wx.clearStorageSync();
    } catch (e) {
      console.error('Storage.clear error:', e);
    }
  }
};

module.exports = Storage;
