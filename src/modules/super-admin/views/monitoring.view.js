/**
 * @file monitoring.view.js
 * @description SuperAdmin Monitoring View — Live health status and telemetry ping for Firebase RTDB services.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { db } from '../../../config/firebase.config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { I18nService } from '../../../services/i18n.service.js';

export class MonitoringView extends Component {
  constructor(params = {}) {
    super(params);
    this.layout = new PageLayout({
      title: I18nService.t('mon_title'),
      subtitle: 'Real-time telemetry and database connection latency monitoring.',
      actionHTML: `<button type="button" id="btn-ping-mon" class="btn btn-secondary btn-sm">⚡ ${I18nService.t('refresh')}</button>`,
      contentHTML: `
        <div class="grid-stats">
          <div class="card p-4">
            <span class="text-sm text-secondary">${I18nService.t('mon_db_status')}</span>
            <h3 id="mon-db-status" class="text-2xl font-bold mt-1 text-primary">${I18nService.t('loading')}</h3>
            <span id="mon-db-badge" class="text-xs text-success font-semibold">● ${I18nService.t('mon_online')}</span>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Connection Latency</span>
            <h3 id="mon-latency-val" class="text-2xl font-bold mt-1 text-primary">-- ms</h3>
            <span id="mon-latency-quality" class="text-xs text-success font-semibold">● Measuring...</span>
          </div>
          <div class="card p-4">
            <span class="text-sm text-secondary">Database Nodes</span>
            <h3 id="mon-total-nodes" class="text-2xl font-bold mt-1 text-primary">0</h3>
            <span id="mon-nodes-sub" class="text-xs text-secondary">Scanning root...</span>
          </div>
        </div>

        <div class="grid-responsive mt-6">
          <div class="col-8 card p-5">
            <h3 class="text-lg font-semibold mb-4">Response Latency History (ms)</h3>
            <div id="monitoring-chart-container" style="width: 100%; height: 280px;"></div>
          </div>
          <div class="col-4 card p-5">
            <h3 class="text-lg font-semibold mb-4">System Services</h3>
            <ul style="list-style: none; padding: 0;" class="d-flex flex-column gap-3 text-sm">
              <li class="d-flex justify-content-between"><span>Firebase Authentication</span> <span id="srv-auth" class="text-success">${I18nService.t('active')}</span></li>
              <li class="d-flex justify-content-between"><span>Realtime Database (RTDB)</span> <span id="srv-rtdb" class="text-success">${I18nService.t('active')}</span></li>
              <li class="d-flex justify-content-between"><span>Service Worker Cache</span> <span id="srv-sw" class="text-success">${I18nService.t('mon_online')}</span></li>
              <li class="d-flex justify-content-between"><span>Audit Log & History</span> <span id="srv-audit" class="text-success font-semibold">${I18nService.t('active')}</span></li>
            </ul>
          </div>
        </div>
      `
    });

    this.latencyHistory = [35, 42, 38, 29, 31, 26, 30];

    this.chart = new Chart({
      type: 'line',
      labels: ['-6m', '-5m', '-4m', '-3m', '-2m', '-1m', I18nService.t('dash_today')],
      datasets: [
        { label: 'Latency (ms)', data: this.latencyHistory, color: '#34d399' }
      ]
    });
  }

  mount() {
    const el = this.layout.mount();
    const chartContainer = el.querySelector('#monitoring-chart-container');
    if (chartContainer) {
      chartContainer.appendChild(this.chart.mount());
    }

    const pingBtn = el.querySelector('#btn-ping-mon');
    if (pingBtn) {
      pingBtn.addEventListener('click', () => this.measureTelemetry(el));
    }

    this.measureTelemetry(el);
    return el;
  }

  async measureTelemetry(root) {
    if (!db) return;
    const dbStatusEl = root.querySelector('#mon-db-status');
    const latencyValEl = root.querySelector('#mon-latency-val');
    const latencyQualityEl = root.querySelector('#mon-latency-quality');
    const totalNodesEl = root.querySelector('#mon-total-nodes');
    const nodesSubEl = root.querySelector('#mon-nodes-sub');

    try {
      const t0 = performance.now();
      const snap = await get(ref(db));
      const t1 = performance.now();

      const ms = Math.round(t1 - t0);
      const rootData = snap.exists() ? snap.val() : {};
      const nodeCount = Object.keys(rootData).length;

      if (dbStatusEl) dbStatusEl.textContent = 'En Línea';
      if (latencyValEl) latencyValEl.textContent = `${ms} ms`;

      if (latencyQualityEl) {
        if (ms < 100) {
          latencyQualityEl.textContent = '● Latencia excelente (<100ms)';
          latencyQualityEl.style.color = '#34d399';
        } else if (ms < 300) {
          latencyQualityEl.textContent = '● Latencia moderada (<300ms)';
          latencyQualityEl.style.color = '#fbbf24';
        } else {
          latencyQualityEl.textContent = '● Latencia elevada';
          latencyQualityEl.style.color = '#f87171';
        }
      }

      if (totalNodesEl) totalNodesEl.textContent = nodeCount.toLocaleString();
      if (nodesSubEl) nodesSubEl.textContent = `Raíz RTDB: ${nodeCount} colecciones principales`;

      // Update chart history
      this.latencyHistory.shift();
      this.latencyHistory.push(ms);
      if (this.chart && typeof this.chart.update === 'function') {
        this.chart.update({
          datasets: [{ label: 'Latencia (ms)', data: this.latencyHistory, color: '#34d399' }]
        });
      }

    } catch (err) {
      console.warn('[MonitoringView] Telemetry error:', err);
      if (dbStatusEl) dbStatusEl.textContent = 'Desconectado';
      if (latencyValEl) latencyValEl.textContent = 'Error';
    }
  }

  unmount() {
    this.chart.unmount();
    this.layout.unmount();
    super.unmount();
  }
}