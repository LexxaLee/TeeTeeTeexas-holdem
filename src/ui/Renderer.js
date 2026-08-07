/**
 * Canvas 渲染器
 * 封装常用绘制操作
 */

const { UI } = require('../config');

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.dpr = wx.getSystemInfoSync().pixelRatio || 1;
  }

  clear(color) {
    this.ctx.fillStyle = color || UI.COLORS.BG;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * 绘制矩形
   */
  rect(x, y, w, h, fill, radius) {
    if (radius) {
      this.roundRect(x, y, w, h, radius);
      if (fill) {
        this.ctx.fillStyle = fill;
        this.ctx.fill();
      }
    } else {
      if (fill) {
        this.ctx.fillStyle = fill;
        this.ctx.fillRect(x, y, w, h);
      }
    }
  }

  /**
   * 绘制圆角矩形路径
   */
  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /**
   * 绘制描边矩形
   */
  strokeRect(x, y, w, h, stroke, lineWidth, radius) {
    if (radius) {
      this.roundRect(x, y, w, h, radius);
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = lineWidth || 1;
      this.ctx.stroke();
    } else {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = lineWidth || 1;
      this.ctx.strokeRect(x, y, w, h);
    }
  }

  /**
   * 绘制圆形
   */
  circle(x, y, r, fill, stroke, lineWidth) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  /**
   * 绘制文字
   */
  text(str, x, y, options = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = options.color || UI.COLORS.TEXT;
    ctx.font = options.font || '14px sans-serif';
    ctx.textAlign = options.align || 'left';
    ctx.textBaseline = options.baseline || 'top';

    if (options.maxWidth) {
      // 自动截断
      let text = str;
      const metrics = ctx.measureText(text);
      if (metrics.width > options.maxWidth) {
        while (text.length > 0 && ctx.measureText(text + '...').width > options.maxWidth) {
          text = text.slice(0, -1);
        }
        text += '...';
      }
      ctx.fillText(text, x, y);
    } else {
      ctx.fillText(str, x, y);
    }
  }

  /**
   * 绘制居中文字
   */
  textCenter(str, x, y, options = {}) {
    options.align = 'center';
    this.text(str, x, y, options);
  }

  /**
   * 绘制扑克牌
   */
  drawCard(x, y, w, h, card, faceDown) {
    const ctx = this.ctx;

    if (faceDown) {
      // 牌背
      this.roundRect(x, y, w, h, 4);
      ctx.fillStyle = UI.COLORS.CARD_BACK;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 装饰
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, w * 0.3 - i * 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    } else if (card) {
      // 牌面
      this.roundRect(x, y, w, h, 4);
      ctx.fillStyle = UI.COLORS.CARD_BG;
      ctx.fill();
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // 点数和花色
      const isRed = card.isRed;
      const color = isRed ? UI.COLORS.RED : '#222222';
      const rankStr = card.rankName;

      // 左上角点数 — "10"是两位数，需要缩小字体
      ctx.fillStyle = color;
      const cornerFontSize = rankStr.length > 1 ? Math.floor(w * 0.26) : Math.floor(w * 0.32);
      ctx.font = 'bold ' + cornerFontSize + 'px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(rankStr, x + 3, y + 3);

      // 中央大花色（唯一的花色显示）
      ctx.font = Math.floor(w * 0.65) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(card.suitSymbol, x + w / 2, y + h / 2);
    }
  }

  /**
   * 绘制筹码
   */
  drawChip(x, y, r, amount) {
    const ctx = this.ctx;
    const safeAmount = Math.floor(amount);
    const colors = this._getChipColors(safeAmount);

    // 底部阴影
    ctx.beginPath();
    ctx.arc(x, y + 2, r, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // 筹码主体
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = colors.main;
    ctx.fill();

    // 边缘装饰
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 内圈
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 金额
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.max(8, r * 0.7) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._formatChip(safeAmount), x, y);
  }

  _getChipColors(amount) {
    if (amount >= 10000) return { main: UI.COLORS.CHIP_PURPLE, edge: '#7d3c98' };
    if (amount >= 1000) return { main: UI.COLORS.CHIP_BLACK, edge: '#1a1a2e' };
    if (amount >= 100) return { main: UI.COLORS.CHIP_BLUE, edge: '#2980b9' };
    if (amount >= 10) return { main: UI.COLORS.CHIP_GREEN, edge: '#229954' };
    return { main: UI.COLORS.CHIP_RED, edge: '#c0392b' };
  }

  _formatChip(amount) {
    const safe = Math.floor(amount);
    if (safe >= 10000) return Math.floor(safe / 1000) + 'k';
    return safe.toString();
  }

  /**
   * 绘制头像
   */
  drawAvatar(x, y, size, avatarUrl, isAI, name) {
    const ctx = this.ctx;

    // AI 用特殊颜色边框
    const borderColor = isAI ? UI.COLORS.BLUE : UI.COLORS.GOLD;

    // 圆形背景
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#444444';
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (avatarUrl && this._images[avatarUrl]) {
      // 绘制头像图片
      try {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(this._images[avatarUrl], x + 1, y + 1, size - 2, size - 2);
        ctx.restore();
      } catch (e) {
        this._drawAvatarFallback(x, y, size, isAI, name);
      }
    } else {
      this._drawAvatarFallback(x, y, size, isAI, name);
    }
  }

  _drawAvatarFallback(x, y, size, isAI, name) {
    const ctx = this.ctx;
    ctx.fillStyle = isAI ? '#3498db' : '#8e44ad';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, 2 * Math.PI);
    ctx.fill();

    // 首字母
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(size * 0.4)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name ? name.charAt(0) : '?', x + size / 2, y + size / 2);
  }

  /**
   * 图片缓存
   */
  _images = {};

  loadImage(url, callback) {
    if (this._images[url]) {
      callback && callback();
      return;
    }
    const img = wx.createImage();
    img.onload = () => {
      this._images[url] = img;
      callback && callback();
    };
    img.onerror = () => {
      console.error('Failed to load image:', url);
    };
    img.src = url;
  }

  /**
   * 绘制渐变背景
   */
  gradientBg(x, y, w, h, color1, color2) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }

  /**
   * 绘制按钮
   */
  drawButton(x, y, w, h, text, options = {}) {
    const pressed = options.pressed || false;
    const bgColor = pressed ? (options.pressedColor || '#2980b9') : (options.bgColor || UI.COLORS.GREEN);
    const textColor = options.textColor || '#ffffff';
    const fontSize = options.fontSize || 16;

    const offsetY = pressed ? 2 : 0;

    // 阴影
    if (!pressed) {
      this.roundRect(x, y + 3, w, h, 8);
      this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
      this.ctx.fill();
    }

    // 按钮主体
    this.roundRect(x, y + offsetY, w, h, 8);
    this.ctx.fillStyle = bgColor;
    this.ctx.fill();

    // 文字
    this.ctx.fillStyle = textColor;
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x + w / 2, y + offsetY + h / 2);

    if (options.disabled) {
      this.roundRect(x, y + offsetY, w, h, 8);
      this.ctx.fillStyle = 'rgba(0,0,0,0.4)';
      this.ctx.fill();
    }
  }
}

module.exports = Renderer;
