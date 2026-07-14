/**
 * @file chart.js
 * @description Native Canvas-based chart wrapper component. Supports bar and line chart types.
 * No external dependencies — uses the HTML5 Canvas API directly.
 */

import { Component } from '../../core/component.js';

export class Chart extends Component {
  /**
   * @param {Object} props
   * @param {'bar'|'line'|'doughnut'} props.type
   * @param {Array<string>} props.labels
   * @param {Array<Object>} props.datasets - { label, data[], color }
   * @param {string} [props.width]
   * @param {string} [props.height]
   * @param {string} [props.id]
   */
  constructor(props = {}) {
    super(props);
    this.props = {
      type: 'bar',
      labels: [],
      datasets: [],
      width: '100%',
      height: '280px',
      id: `chart-${Date.now()}`,
      ...props
    };
    this.canvas = null;
    this.ctx = null;
  }

  render() {
    const { id, width, height } = this.props;
    return `
      <div class="chart-wrapper" style="width: ${width}; height: ${height}; position: relative;">
        <canvas id="${id}" style="width: 100%; height: 100%;"></canvas>
      </div>
    `;
  }

  afterMount() {
    const { id, type } = this.props;
    this.canvas = document.getElementById(id);
    if (!this.canvas) return;

    // Resolve actual dimensions from parent container
    const parentEl = this.canvas.parentElement;
    this.canvas.width = parentEl.offsetWidth || 600;
    this.canvas.height = parentEl.offsetHeight || 280;

    this.ctx = this.canvas.getContext('2d');

    switch (type) {
      case 'bar':
        this.drawBarChart();
        break;
      case 'line':
        this.drawLineChart();
        break;
      default:
        this.drawBarChart();
    }
  }

  /** Render bar chart using canvas primitives */
  drawBarChart() {
    const { labels, datasets } = this.props;
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = canvas.width - padding.left - padding.right;
    const chartH = canvas.height - padding.top - padding.bottom;

    // Determine max value for scale
    const allValues = datasets.flatMap(d => d.data);
    const maxValue = Math.max(...allValues, 1);
    const groupWidth = chartW / labels.length;
    const barWidth = (groupWidth * 0.6) / datasets.length;

    // Resolve theme background and text colors from CSS variables
    const isDark = document.body.classList.contains('theme-dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#8b8c94' : '#62636c';
    const defaultColors = ['#7c75ff', '#34d399', '#fbbf24', '#60a5fa', '#f87171'];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw horizontal grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      // Y-axis labels
      const label = Math.round(maxValue - (maxValue / gridLines) * i);
      ctx.fillStyle = textColor;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // Draw bars
    labels.forEach((label, labelIdx) => {
      const groupX = padding.left + groupWidth * labelIdx;

      datasets.forEach((dataset, dsIdx) => {
        const value = dataset.data[labelIdx] || 0;
        const barH = (value / maxValue) * chartH;
        const x = groupX + (groupWidth * 0.2) + barWidth * dsIdx;
        const y = padding.top + chartH - barH;
        const color = dataset.color || defaultColors[dsIdx % defaultColors.length];

        // Rounded top bars
        const radius = Math.min(4, barW => barWidth / 2);
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.roundRect
          ? ctx.roundRect(x, y, barWidth - 2, barH, [4, 4, 0, 0])
          : ctx.rect(x, y, barWidth - 2, barH);
        ctx.fill();
      });

      // X-axis labels
      ctx.fillStyle = textColor;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        label.length > 8 ? label.slice(0, 7) + '…' : label,
        groupX + groupWidth / 2,
        canvas.height - 10
      );
    });
  }

  /** Render smooth line chart */
  drawLineChart() {
    const { labels, datasets } = this.props;
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = canvas.width - padding.left - padding.right;
    const chartH = canvas.height - padding.top - padding.bottom;
    const allValues = datasets.flatMap(d => d.data);
    const maxValue = Math.max(...allValues, 1);
    const isDark = document.body.classList.contains('theme-dark');
    const textColor = isDark ? '#8b8c94' : '#62636c';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const defaultColors = ['#7c75ff', '#34d399', '#fbbf24', '#60a5fa'];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      const labelVal = Math.round(maxValue - (maxValue / 4) * i);
      ctx.fillStyle = textColor;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(labelVal, padding.left - 8, y + 4);
    }

    // Draw each dataset line
    datasets.forEach((dataset, dsIdx) => {
      const color = dataset.color || defaultColors[dsIdx % defaultColors.length];

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      dataset.data.forEach((value, i) => {
        const x = padding.left + (chartW / (labels.length - 1)) * i;
        const y = padding.top + chartH - (value / maxValue) * chartH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });

      ctx.stroke();

      // Draw data points
      dataset.data.forEach((value, i) => {
        const x = padding.left + (chartW / (labels.length - 1)) * i;
        const y = padding.top + chartH - (value / maxValue) * chartH;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // X-axis labels
    labels.forEach((label, i) => {
      const x = padding.left + (chartW / (labels.length - 1)) * i;
      ctx.fillStyle = textColor;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        label.length > 6 ? label.slice(0, 5) + '…' : label,
        x,
        canvas.height - 10
      );
    });
  }
}
