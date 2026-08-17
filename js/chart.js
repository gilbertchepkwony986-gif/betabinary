/* ==========================================================================
   BetaBinary - High-Performance Canvas Chart Renderer (chart.js)
   ========================================================================== */

import { priceEngine } from './engine.js';
import { stateManager } from './state.js';

export class ChartRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.chartType = 'area'; // 'area' or 'candles'
    this.timeframe = 1; // in seconds
    this.activeIndicators = {
      sma: true,
      ema: false,
      bollinger: false,
      rsi: false
    };

    this.mousePos = null;
    this.animationId = null;

    this.initCanvasSize();
    this.setupEvents();
  }

  initCanvasSize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setupEvents() {
    window.addEventListener('resize', () => this.initCanvasSize());

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mousePos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mousePos = null;
    });
  }

  setChartType(type) {
    this.chartType = type;
  }

  setTimeframe(tf) {
    this.timeframe = tf;
  }

  toggleIndicator(name) {
    if (this.activeIndicators.hasOwnProperty(name)) {
      this.activeIndicators[name] = !this.activeIndicators[name];
    }
  }

  render(assetId, openPositions = []) {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    ctx.clearRect(0, 0, width, height);

    // Background Grid
    this.drawGrid(width, height);

    if (this.chartType === 'area') {
      const history = priceEngine.getTickHistory(assetId);
      if (history.length < 2) return;
      this.drawAreaChart(history, openPositions);
    } else {
      const candles = priceEngine.getCandles(assetId, this.timeframe);
      if (candles.length < 2) return;
      this.drawCandleChart(candles, openPositions);
    }

    // Crosshairs
    if (this.mousePos) {
      this.drawCrosshair(this.mousePos);
    }
  }

  drawGrid(width, height) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const rows = 6;
    for (let i = 1; i < rows; i++) {
      const y = (height / rows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Vertical grid lines
    const cols = 8;
    for (let j = 1; j < cols; j++) {
      const x = (width / cols) * j;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAreaChart(data, openPositions) {
    const ctx = this.ctx;
    const width = this.width - 70; // reserve 70px for right price scale
    const height = this.height;

    // Calculate Min & Max Prices
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const d of data) {
      if (d.price < minPrice) minPrice = d.price;
      if (d.price > maxPrice) maxPrice = d.price;
    }

    // Margin padding
    const padding = (maxPrice - minPrice) * 0.15 || 1;
    minPrice -= padding;
    maxPrice += padding;

    const priceToY = (price) => height - ((price - minPrice) / (maxPrice - minPrice)) * (height - 40) - 20;
    const indexToX = (idx) => (idx / (data.length - 1)) * width;

    // Draw SMA Indicator if enabled
    if (this.activeIndicators.sma && data.length >= 20) {
      this.drawSMA(data, 20, indexToX, priceToY, 'rgba(245, 158, 11, 0.7)');
    }

    // Draw Area gradient & line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, height);

    for (let i = 0; i < data.length; i++) {
      const x = indexToX(i);
      const y = priceToY(data[i].price);
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        // Smooth bezier curve
        const prevX = indexToX(i - 1);
        const prevY = priceToY(data[i - 1].price);
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    }

    ctx.lineTo(width, height);
    ctx.closePath();

    // Area Fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    gradient.addColorStop(0.7, 'rgba(6, 182, 212, 0.05)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = indexToX(i);
      const y = priceToY(data[i].price);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevX = indexToX(i - 1);
        const prevY = priceToY(data[i - 1].price);
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    }
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(6, 182, 212, 0.75)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    // Pulsing Current Price Dot & Horizontal Line
    const lastPoint = data[data.length - 1];
    const currentX = width;
    const currentY = priceToY(lastPoint.price);

    ctx.save();
    // Dashed price line
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(this.width, currentY);
    ctx.stroke();

    // Glowing dot
    ctx.setLineDash([]);
    ctx.fillStyle = '#06b6d4';
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Active Positions Entry Lines
    this.drawOpenPositionsMarkers(openPositions, priceToY, width);

    // Draw Right Axis Price Scale
    this.drawPriceAxis(minPrice, maxPrice, lastPoint.price, currentY);
  }

  drawCandleChart(candles, openPositions) {
    const ctx = this.ctx;
    const width = this.width - 70;
    const height = this.height;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const c of candles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    const padding = (maxPrice - minPrice) * 0.15 || 1;
    minPrice -= padding;
    maxPrice += padding;

    const priceToY = (price) => height - ((price - minPrice) / (maxPrice - minPrice)) * (height - 40) - 20;
    const candleWidth = Math.max(3, (width / candles.length) * 0.7);

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = (i / (candles.length - 1)) * (width - candleWidth) + candleWidth / 2;
      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);
      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);

      const isUp = c.close >= c.open;
      const color = isUp ? '#10b981' : '#f43f5e';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.2;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const topY = Math.min(openY, closeY);
      const bodyH = Math.max(2, Math.abs(closeY - openY));
      ctx.fillRect(x - candleWidth / 2, topY, candleWidth, bodyH);
      ctx.restore();
    }

    const lastCandle = candles[candles.length - 1];
    const currentY = priceToY(lastCandle.close);
    this.drawOpenPositionsMarkers(openPositions, priceToY, width);
    this.drawPriceAxis(minPrice, maxPrice, lastCandle.close, currentY);
  }

  drawSMA(data, period, indexToX, priceToY, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    let started = false;
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].price;
      }
      const sma = sum / period;
      const x = indexToX(i);
      const y = priceToY(sma);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawOpenPositionsMarkers(openPositions, priceToY, width) {
    const ctx = this.ctx;
    for (const pos of openPositions) {
      const y = priceToY(pos.entryPrice);
      const isCall = pos.prediction === 'higher' || pos.prediction === 'even' || pos.prediction === 'over';
      const color = isCall ? '#10b981' : '#f43f5e';

      ctx.save();
      // Entry Line
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Position Flag Tag
      ctx.fillStyle = color;
      ctx.fillRect(10, y - 12, 90, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`${pos.prediction.toUpperCase()} $${pos.stake}`, 16, y + 4);
      ctx.restore();
    }
  }

  drawPriceAxis(minPrice, maxPrice, currentPrice, currentY) {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    ctx.save();
    // Axis background
    ctx.fillStyle = '#080d17';
    ctx.fillRect(width - 70, 0, 70, height);
    ctx.strokeStyle = 'var(--border-subtle)';
    ctx.strokeRect(width - 70, 0, 1, height);

    // Current Price Badge
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(width - 68, currentY - 10, 66, 20);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(currentPrice.toFixed(2), width - 64, currentY + 4);
    ctx.restore();
  }

  drawCrosshair(pos) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(pos.x, 0);
    ctx.lineTo(pos.x, this.height);
    ctx.moveTo(0, pos.y);
    ctx.lineTo(this.width, pos.y);
    ctx.stroke();
    ctx.restore();
  }
}
