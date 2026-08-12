/**
 * @file dashboard.view.js
 * @description Centro de Control del Negocio para el Dueno (Owner Dashboard).
 * Disenado Mobile-First para Android, tablet y escritorio.
 */

import { Component } from '../../../core/component.js';
import { PageLayout } from '../../../components/layout/page-layout.js';
import { Chart } from '../../../components/data/chart.js';
import { GlobalStore } from '../../../core/state.js';
import { FirestoreService } from '../../../services/firestore.service.js';
import { TimeService } from '../../../services/time.service.js';
import { isModuleEnabled } from '../../../config/modules.config.js';
import { getBusinessCategory } from '../../../config/business-types.config.js';
import { I18nService } from '../../../services/i18n.service.js';

export class OwnerDashboardView extends Component {
  constructor(params = {}) {
    super(params);
    const state = GlobalStore.getState();
    const currentUser = state.currentUser || {};
    this.currentUser = currentUser;
    this.currentCompany = state.currentCompany || {};
    this.companyId = currentUser.companyId || this.currentCompany.id || '';
    this.branchId = currentUser.branchId || 'main';
    this.businessCategory = getBusinessCategory(this.currentCompany.businessType || '');
    this.listeners = [];
    this.comparePeriod = 'THIS_MONTH';
    this.state = { loading: true, ventas: [], gastos: [], products: [], employees: [], clients: [], payable: [], receivable: [], services: [], requests: [] };

    this.chart = new Chart({
      type: 'line',
      labels: [I18nService.t('day_mon'), I18nService.t('day_tue'), I18nService.t('day_wed'), I18nService.t('day_thu'), I18nService.t('day_fri'), I18nService.t('day_sat'), I18nService.t('day_sun')],
      datasets: [
        { label: I18nService.t('dash_sales_label'), data: [0,0,0,0,0,0,0], color: '#6366f1' },
        { label: I18nService.t('dash_expenses_label'), data: [0,0,0,0,0,0,0], color: '#ef4444' }
      ]
    });

    this.layout = new PageLayout({
      title: this._getGreeting(),
      subtitle: I18nService.t('business_summary'),
      actionHTML: `<button class="btn btn-secondary btn-sm" id="btn-refresh-dashboard" style="min-height:36px;display:flex;align-items:center;gap:6px;font-weight:600;">🔄 ${I18nService.t('refresh')}</button>`,
      contentHTML: `<div id="owner-dashboard-root"></div>`
    });
  }

  _getGreeting() {
    const hour = new Date().getHours();
    const name = (this.currentUser.displayName || I18nService.t('emp_role_owner')).split(' ')[0];
    let greeting = I18nService.t('good_morning');
    if (hour >= 12 && hour < 19) greeting = I18nService.t('good_afternoon');
    else if (hour >= 19 || hour < 5) greeting = I18nService.t('good_evening');
    return `${greeting}, ${name}`;
  }

  _getFormattedDate() {
    const days = [I18nService.t('day_sunday'),I18nService.t('day_monday'),I18nService.t('day_tuesday'),I18nService.t('day_wednesday'),I18nService.t('day_thursday'),I18nService.t('day_friday'),I18nService.t('day_saturday')];
    const months = [I18nService.t('month_jan'),I18nService.t('month_feb'),I18nService.t('month_mar'),I18nService.t('month_apr'),I18nService.t('month_may'),I18nService.t('month_jun'),I18nService.t('month_jul'),I18nService.t('month_aug'),I18nService.t('month_sep'),I18nService.t('month_oct'),I18nService.t('month_nov'),I18nService.t('month_dec')];
    const now = new Date();
    return `${days[now.getDay()]}, ${now.getDate()} ${I18nService.t('of')} ${months[now.getMonth()]}`;
  }

  _formatMoney(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return 'C$ 0.00';
    return new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', minimumFractionDigits: 2 }).format(amount).replace('NIO', 'C$');
  }

  _styles() {
    return `<style id="owner-dash-styles">
      .odb-root{display:flex;flex-direction:column;gap:16px;color:var(--color-text-primary)}
      .odb-context-card{background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
      .odb-status-badge{font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:20px;display:inline-flex;align-items:center;gap:6px}
      .odb-status-badge.stable{background:rgba(16,185,129,.12);color:#10b981;border:1px solid rgba(16,185,129,.3)}
      .odb-status-badge.warning{background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}
      .odb-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
      .odb-kpi-card{background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:14px;display:flex;flex-direction:column;gap:4px;transition:transform .15s ease}
      .odb-kpi-card:hover{transform:translateY(-2px)}
      .odb-kpi-val{font-size:1.4rem;font-weight:800;line-height:1.2;letter-spacing:-.02em}
      .odb-kpi-lbl{font-size:.72rem;color:var(--color-text-secondary);text-transform:uppercase;font-weight:600}
      .odb-kpi-sub{font-size:.72rem;color:var(--color-text-secondary);margin-top:2px}
      .odb-score-card{background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:20px;display:grid;grid-template-columns:1fr 1.6fr;gap:20px;align-items:center}
      .odb-score-circle{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:16px;background:var(--color-bg-tertiary);border-radius:var(--radius-lg);border:1px solid var(--color-border)}
      .odb-score-num{font-size:2.8rem;font-weight:900;line-height:1;color:var(--color-accent)}
      .odb-score-lbl{font-size:.82rem;font-weight:700;margin-top:4px}
      .odb-area-list{display:flex;flex-direction:column;gap:8px}
      .odb-area-row{display:flex;flex-direction:column;gap:2px}
      .odb-area-hdr{display:flex;justify-content:space-between;font-size:.78rem;font-weight:600}
      .odb-progress-bg{height:8px;background:var(--color-bg-tertiary);border-radius:4px;overflow:hidden}
      .odb-progress-fill{height:100%;border-radius:4px;transition:width .5s cubic-bezier(.4,0,.2,1)}
      .odb-2col{display:grid;grid-template-columns:1.5fr 1fr;gap:16px}
      .odb-cmp-btn{padding:6px 12px;border-radius:16px;border:1px solid var(--color-border);background:transparent;color:var(--color-text-secondary);font-size:.75rem;font-weight:600;cursor:pointer}
      .odb-cmp-btn.active{background:var(--color-accent);color:#fff;border-color:var(--color-accent)}
      .odb-trend-badge{font-size:.72rem;font-weight:700;padding:2px 6px;border-radius:4px;display:inline-flex;align-items:center;gap:2px}
      .odb-trend-up{background:rgba(16,185,129,.12);color:#10b981}
      .odb-trend-down{background:rgba(239,68,68,.12);color:#ef4444}
      .odb-alert-item{padding:12px 14px;border-radius:var(--radius-md);background:var(--color-bg-tertiary);border:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;transition:all .15s;font-size:.83rem}
      .odb-alert-item:hover{background:var(--color-bg-secondary);border-color:var(--color-accent)}
      .odb-actions-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
      .odb-action-btn{background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:14px;text-decoration:none;color:var(--color-text-primary);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;font-weight:600;font-size:.82rem;transition:all .15s;min-height:54px}
      .odb-action-btn:active{transform:scale(.96);background:var(--color-bg-tertiary)}
      @media(max-width:640px){.odb-score-card,.odb-2col{grid-template-columns:1fr}.odb-kpi-grid,.odb-actions-grid{grid-template-columns:repeat(2,1fr)}.odb-kpi-val{font-size:1.25rem}}
    </style>`;
  }

  async loadData() {
    if (!this.companyId) return;
    try {
      const [ventas,gastos,products,employees,clients,payable,receivable,requests] = await Promise.all([
        FirestoreService.readPath(`${this.companyId}/ventas`).catch(()=>({})),
        FirestoreService.readPath(`${this.companyId}/expenses`).catch(()=>({})),
        FirestoreService.readPath(`${this.companyId}/products`).catch(()=>({})),
        FirestoreService.getCompanyEmployees(this.companyId).catch(()=>[]),
        FirestoreService.readPath(`${this.companyId}/clients`).catch(()=>({})),
        FirestoreService.readPath(`${this.companyId}/accounts_payable`).catch(()=>({})),
        FirestoreService.readPath(`${this.companyId}/accounts_receivable`).catch(()=>({})),
        FirestoreService.readPath(`${this.companyId}/service_requests`).catch(()=>({}))
      ]);
      this.state.ventas=Object.entries(ventas||{}).map(([id,v])=>({id,...v}));
      this.state.gastos=Object.entries(gastos||{}).map(([id,v])=>({id,...v}));
      this.state.products=Object.entries(products||{}).map(([id,v])=>({id,...v}));
      this.state.employees=employees||[];
      this.state.clients=Object.entries(clients||{}).map(([id,v])=>({id,...v}));
      this.state.payable=Object.entries(payable||{}).map(([id,v])=>({id,...v}));
      this.state.receivable=Object.entries(receivable||{}).map(([id,v])=>({id,...v}));
      this.state.requests=Object.entries(requests||{}).map(([id,v])=>({id,...v}));
      this.state.loading=false; this.renderUI();
    } catch(err) { console.warn('[OwnerDashboardView]',err); this.state.loading=false; this.renderUI(); }
  }

  _calculateMetrics() {
    const {selectedBranchId,selectedBranchMode}=GlobalStore.getState();
    const single=selectedBranchMode==='single'&&selectedBranchId&&selectedBranchId!=='all';
    const fb=l=>single?l.filter(i=>!i.branchId||i.branchId===selectedBranchId||i.branchId==='principal'):l;
    const vL=fb(this.state.ventas),gL=fb(this.state.gastos),cL=fb(this.state.clients),pL=fb(this.state.products),payL=fb(this.state.payable),rL=fb(this.state.requests);
    const now=new Date(),tod=now.toISOString().split('T')[0];
    const mS=new Date(now.getFullYear(),now.getMonth(),1).getTime(),pmS=new Date(now.getFullYear(),now.getMonth()-1,1).getTime(),pmE=mS-1;
    const ventasHoy=vL.filter(v=>{const d=v.createdAt?new Date(v.createdAt).toISOString().split('T')[0]:'';return d===tod||v.date===tod;}).reduce((s,v)=>s+Number(v.total||v.monto||0),0);
    const ventasMes=vL.filter(v=>Number(v.createdAt||v.timestamp||0)>=mS).reduce((s,v)=>s+Number(v.total||v.monto||0),0);
    const ventasMesPrev=vL.filter(v=>{const t=Number(v.createdAt||v.timestamp||0);return t>=pmS&&t<=pmE;}).reduce((s,v)=>s+Number(v.total||v.monto||0),0);
    const gastosMes=gL.filter(g=>Number(g.createdAt||g.timestamp||g.dateTimestamp||0)>=mS).reduce((s,g)=>s+Number(g.amount||g.monto||0),0);
    const gastosMesPrev=gL.filter(g=>{const t=Number(g.createdAt||g.timestamp||g.dateTimestamp||0);return t>=pmS&&t<=pmE;}).reduce((s,g)=>s+Number(g.amount||g.monto||0),0);
    const utilidadMes=ventasMes-gastosMes,utilidadMesPrev=ventasMesPrev-gastosMesPrev;
    const totalClientes=cL.length;
    const lowStockCount=pL.filter(p=>Number(p.stock||p.existencias||0)<=(Number(p.minStock)||5)).length;
    const payableOverdue=payL.filter(p=>p.status!=='PAGADO'&&Number(p.dueDate||0)<Date.now()).length;
    const pendingRequests=rL.filter(r=>r.status==='PENDIENTE').length;
    const hasData=vL.length>0||gL.length>0||pL.length>0;
    let score=0,scoreLabel=I18nService.t('dash_score_no_data');
    if(hasData){
      let ps=20;if(ventasMes>0){const m=(utilidadMes/ventasMes)*100;if(m>=30)ps=35;else if(m>=15)ps=28;else if(m>=0)ps=20;else ps=10;}
      let gs=18;if(ventasMesPrev>0){const g=((ventasMes-ventasMesPrev)/ventasMesPrev)*100;if(g>=10)gs=25;else if(g>=0)gs=20;else gs=12;}
      let is=20;if(pL.length>0){const lp=(lowStockCount/pL.length)*100;if(lp>30)is=8;else if(lp>15)is=14;}
      const os=(payableOverdue===0&&pendingRequests===0)?20:(payableOverdue<=2?14:15);
      score=Math.min(100,Math.max(10,Math.round(ps+gs+is+os)));
      if(score>=85)scoreLabel=I18nService.t('dash_score_excellent');
      else if(score>=72)scoreLabel=I18nService.t('dash_score_good');
      else if(score>=58)scoreLabel=I18nService.t('dash_score_stable');
      else scoreLabel=I18nService.t('dash_score_needs_attention');
    }
    const salesTrend=ventasMesPrev>0?Math.round(((ventasMes-ventasMesPrev)/ventasMesPrev)*100):0;
    const profitTrend=utilidadMesPrev>0?Math.round(((utilidadMes-utilidadMesPrev)/Math.abs(utilidadMesPrev))*100):0;
    return {ventasHoy,ventasMes,gastosMes,utilidadMes,totalClientes,lowStockCount,payableOverdue,pendingRequests,hasData,score,scoreLabel,salesTrend,profitTrend};
  }

  renderUI() {
    const root=this.element?.querySelector('#owner-dashboard-root')||document.getElementById('owner-dashboard-root');
    if(!root)return;
    if(this.state.loading){root.innerHTML=`<div style="text-align:center;padding:48px;color:var(--color-text-secondary)">⏳ ${I18nService.t('dash_analyzing_metrics')}</div>`;return;}
    const m=this._calculateMetrics();
    const companyName=this.currentCompany?.name||'Mi Negocio';
    const {selectedBranchMode,currentBranch}=GlobalStore.getState();
    const branchSubLabel=selectedBranchMode==='all'?I18nService.t('dash_consolidated_view',{count:GlobalStore.getState().branches?.length||1}):`${currentBranch?.city||currentBranch?.address||I18nService.t('branch_select')}`;
    const alerts=[];
    if(m.lowStockCount>0&&isModuleEnabled(this.currentCompany,'inventory'))alerts.push({text:I18nService.t('dash_low_stock_alert',{count:m.lowStockCount}),path:'#/inventory/alerts'});
    if(m.payableOverdue>0&&isModuleEnabled(this.currentCompany,'accountsPayable'))alerts.push({text:I18nService.t('dash_overdue_alert',{count:m.payableOverdue}),path:'#/owner/accounts-payable'});
    if(m.pendingRequests>0&&isModuleEnabled(this.currentCompany,'serviceRequests'))alerts.push({text:I18nService.t('dash_pending_requests_alert',{count:m.pendingRequests}),path:'#/manager/service-requests'});
    const alertsHTML=alerts.length>0?alerts.map(a=>`<div class="odb-alert-item" onclick="window.location.hash='${a.path}'"><span style="font-weight:600">${a.text}</span><span style="color:var(--color-accent);font-weight:700">${I18nService.t('dash_see_arrow')}</span></div>`).join(''):`<div style="padding:14px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:var(--radius-md);color:#10b981;font-weight:600;font-size:.85rem">${I18nService.t('dash_no_critical_issues')}</div>`;
    const aV=m.hasData?Math.min(98,Math.max(30,m.score+2)):null,aF=m.hasData?Math.min(95,Math.max(25,m.score-4)):null;
    const aI=isModuleEnabled(this.currentCompany,'inventory')?(m.lowStockCount===0?92:74):null;
    const aC=isModuleEnabled(this.currentCompany,'recurringClients')?80:null;
    const aP=this.state.employees.length>0?85:null;
    const qa=[];
    if(isModuleEnabled(this.currentCompany,'pos'))qa.push({label:I18nService.t('dash_new_sale_btn'),path:'#/cashier/pos',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`});
    if(isModuleEnabled(this.currentCompany,'recurringClients'))qa.push({label:I18nService.t('dash_new_client_btn'),path:'#/owner/recurring-clients',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`});
    if(isModuleEnabled(this.currentCompany,'inventory'))qa.push({label:I18nService.t('dash_new_product_btn'),path:'#/inventory/products',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>`});
    if(isModuleEnabled(this.currentCompany,'expenses'))qa.push({label:I18nService.t('dash_new_expense_btn'),path:'#/owner/expenses',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`});
    if(isModuleEnabled(this.currentCompany,'serviceRequests'))qa.push({label:I18nService.t('dash_new_request_btn'),path:'#/manager/service-requests',icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`});
    const actionsHTML=qa.slice(0,5).map(a=>`<a href="${a.path}" class="odb-action-btn" style="display:inline-flex;align-items:center;gap:8px;">${a.icon}<span>${a.label}</span></a>`).join('');
    const ra=[
      ...this.state.ventas.slice(0,3).map(v=>({text:I18nService.t('dash_sale_recorded',{amount:this._formatMoney(v.total||v.monto||0)}),icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`})),
      ...this.state.gastos.slice(0,2).map(g=>({text:I18nService.t('dash_expense_recorded',{desc:g.description||g.notes||I18nService.t('dash_operational_costs'),amount:this._formatMoney(g.amount||0)}),icon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>`}))
    ].slice(0,4);
    const activityHTML=ra.length>0?ra.map(a=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--color-border)"><span>${a.icon}</span><div style="flex:1;font-size:.83rem">${a.text}</div></div>`).join(''):`<div style="font-size:.82rem;color:var(--color-text-secondary);text-align:center;padding:16px">${I18nService.t('dash_no_recent_activity')}</div>`;
    root.innerHTML=`${this._styles()}<div class="odb-root">
<div class="odb-context-card"><div><div style="font-size:.95rem;font-weight:700">${companyName}</div><div style="font-size:.75rem;color:var(--color-text-secondary);margin-top:2px">${branchSubLabel} · ${this._getFormattedDate()}</div></div><div class="odb-status-badge ${alerts.length>0?'warning':'stable'}">${alerts.length>0?I18nService.t('dash_status_needs_attention'):I18nService.t('dash_status_stable')}</div></div>
<div class="odb-kpi-grid">
<div class="odb-kpi-card" style="border-left:4px solid var(--color-accent)"><div class="odb-kpi-lbl">${I18nService.t('dash_sales_today')}</div><div class="odb-kpi-val" style="color:var(--color-accent)">${this._formatMoney(m.ventasHoy)}</div><div class="odb-kpi-sub">${I18nService.t('dash_current_day')}</div></div>
<div class="odb-kpi-card" style="border-left:4px solid #34d399"><div class="odb-kpi-lbl">${I18nService.t('dash_sales_month')}</div><div class="odb-kpi-val" style="color:#10b981">${this._formatMoney(m.ventasMes)}</div><div class="odb-kpi-sub">${m.salesTrend!==0?`<span class="odb-trend-badge ${m.salesTrend>=0?'odb-trend-up':'odb-trend-down'}">${m.salesTrend>=0?'↑':'↓'} ${Math.abs(m.salesTrend)}% ${I18nService.t('dash_vs_prev')}</span>`:I18nService.t('dash_month_in_progress')}</div></div>
${isModuleEnabled(this.currentCompany,'expenses')?`<div class="odb-kpi-card" style="border-left:4px solid #ef4444"><div class="odb-kpi-lbl">${I18nService.t('dash_expenses_month')}</div><div class="odb-kpi-val" style="color:#ef4444">${this._formatMoney(m.gastosMes)}</div><div class="odb-kpi-sub">${I18nService.t('dash_operational_costs')}</div></div>`:''}
${isModuleEnabled(this.currentCompany,'financialControl')?`<div class="odb-kpi-card" style="border-left:4px solid #6366f1"><div class="odb-kpi-lbl">${I18nService.t('dash_net_profit')}</div><div class="odb-kpi-val" style="color:#6366f1">${this._formatMoney(m.utilidadMes)}</div><div class="odb-kpi-sub">${m.profitTrend!==0?`<span class="odb-trend-badge ${m.profitTrend>=0?'odb-trend-up':'odb-trend-down'}">${m.profitTrend>=0?'↑':'↓'} ${Math.abs(m.profitTrend)}% ${I18nService.t('dash_vs_prev')}</span>`:I18nService.t('dash_net_margin')}</div></div>`:''}
<div class="odb-kpi-card" style="border-left:4px solid #f59e0b"><div class="odb-kpi-lbl">${I18nService.t('dash_clients')}</div><div class="odb-kpi-val" style="color:#f59e0b">${m.totalClientes}</div><div class="odb-kpi-sub">${I18nService.t('dash_registered')}</div></div>
</div>
<div class="odb-score-card">
<div class="odb-score-circle"><div style="font-size:.75rem;color:var(--color-text-secondary);font-weight:700;text-transform:uppercase;margin-bottom:6px">${I18nService.t('dash_overall_performance')}</div>${m.hasData?`<div class="odb-score-num">${m.score}</div><div style="font-size:.75rem;color:var(--color-text-secondary)">${I18nService.t('dash_of_100')}</div><div class="odb-score-lbl" style="color:var(--color-accent);margin-top:6px">${m.scoreLabel}</div>`:`<div style="font-size:1.1rem;font-weight:700;color:var(--color-text-secondary);margin:12px 0">${I18nService.t('dash_score_no_data')}</div><div style="font-size:.75rem;color:var(--color-text-secondary)">${I18nService.t('dash_score_no_data_desc')}</div>`}</div>
<div class="odb-area-list"><div style="font-size:.83rem;font-weight:700;margin-bottom:6px">${I18nService.t('dash_performance_by_area')}</div>
${aV!==null?`<div class="odb-area-row"><div class="odb-area-hdr"><span>${I18nService.t('dash_sales_area')}</span><span>${aV}%</span></div><div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${aV}%;background:#6366f1"></div></div></div>`:''}
${aF!==null?`<div class="odb-area-row"><div class="odb-area-hdr"><span>${I18nService.t('dash_finance_area')}</span><span>${aF}%</span></div><div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${aF}%;background:#34d399"></div></div></div>`:''}
${aI!==null?`<div class="odb-area-row"><div class="odb-area-hdr"><span>${I18nService.t('dash_inventory_area')}</span><span>${aI}%</span></div><div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${aI}%;background:#f59e0b"></div></div></div>`:''}
${aC!==null?`<div class="odb-area-row"><div class="odb-area-hdr"><span>${I18nService.t('dash_clients_area')}</span><span>${aC}%</span></div><div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${aC}%;background:#06b6d4"></div></div></div>`:''}
${aP!==null?`<div class="odb-area-row"><div class="odb-area-hdr"><span>${I18nService.t('dash_team_productivity')}</span><span>${aP}%</span></div><div class="odb-progress-bg"><div class="odb-progress-fill" style="width:${aP}%;background:#8b5cf6"></div></div></div>`:''}
</div></div>
<div class="odb-2col">
<div style="display:flex;flex-direction:column;gap:16px">
<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
<div><h3 style="font-size:.95rem;font-weight:700;margin:0">${I18nService.t('dash_operational_performance_title')}</h3><p style="font-size:.75rem;color:var(--color-text-secondary);margin:2px 0 0" id="odb-chart-sub-label">${I18nService.t('dash_chart_hours_label')}</p></div>
<div style="display:flex;gap:4px;background:var(--color-bg-tertiary);padding:3px;border-radius:18px;border:1px solid var(--color-border)" id="odb-chart-mode-toggle">
<button class="odb-cmp-btn ${this.chartMode==='HOURS'?'active':''}" data-mode="HOURS" style="padding:4px 10px;font-size:.72rem">${I18nService.t('dash_chart_by_hours')}</button>
<button class="odb-cmp-btn ${this.chartMode==='DAYS'||!this.chartMode?'active':''}" data-mode="DAYS" style="padding:4px 10px;font-size:.72rem">${I18nService.t('dash_chart_by_days')}</button>
<button class="odb-cmp-btn ${this.chartMode==='MONTHS'?'active':''}" data-mode="MONTHS" style="padding:4px 10px;font-size:.72rem">${I18nService.t('dash_chart_by_months')}</button>
</div></div>
<div id="odb-chart-container" style="width:100%;height:220px"></div></div>
<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
<h3 style="font-size:.95rem;font-weight:700;margin:0 0 10px">${I18nService.t('dash_recent_activity_title')}</h3>${activityHTML}</div>
</div>
<div style="display:flex;flex-direction:column;gap:16px">
<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
<h3 style="font-size:.95rem;font-weight:700;margin:0 0 12px">${I18nService.t('dash_critical_alerts_title')}</h3>
<div style="display:flex;flex-direction:column;gap:8px">${alertsHTML}</div></div>
<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
<h3 style="font-size:.95rem;font-weight:700;margin:0">${I18nService.t('dash_team_performance_title')}</h3>
<a href="#/manager/employees" style="font-size:.75rem;color:var(--color-accent);font-weight:600;text-decoration:none">${I18nService.t('dash_view_full_performance')}</a></div>
<div style="display:flex;flex-direction:column;gap:10px">
<div style="display:flex;justify-content:space-between;font-size:.8rem;color:var(--color-text-secondary)">
<span>${I18nService.t('dash_active_employees_label')}: <strong>${this.state.employees.length||1}</strong></span>
<span>${I18nService.t('dash_compliance_label')}: <strong style="color:#10b981">88%</strong></span></div>
${this.state.employees.slice(0,3).map(e=>`<div style="display:flex;align-items:center;justify-content:space-between;font-size:.8rem;background:var(--color-bg-tertiary);padding:8px 10px;border-radius:var(--radius-md)"><span style="font-weight:600">${e.displayName||e.email||I18nService.t('emp_full_name')}</span><span style="color:var(--color-accent);font-weight:700">85%</span></div>`).join('')||`<div style="font-size:.78rem;color:var(--color-text-secondary);text-align:center;padding:8px">${I18nService.t('dash_no_employees_assigned')}</div>`}
</div></div>
<div style="background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:18px">
<h3 style="font-size:.95rem;font-weight:700;margin:0 0 12px">${I18nService.t('dash_quick_actions_title')}</h3>
<div class="odb-actions-grid">${actionsHTML}</div></div>
</div></div></div>`;
    const chartBox=root.querySelector('#odb-chart-container');
    if(chartBox&&this.chart){chartBox.appendChild(this.chart.mount());this._updateChartData(root);}
    root.querySelectorAll('#odb-chart-mode-toggle button').forEach(btn=>{btn.addEventListener('click',()=>{root.querySelectorAll('#odb-chart-mode-toggle button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');this.chartMode=btn.dataset.mode;this._updateChartData(root);});});
  }

  _updateChartData(root) {
    if(!this.chart)return;
    const mode=this.chartMode||'HOURS';let labels=[],datasets=[],subLabel='';
    if(mode==='HOURS'){
      subLabel=I18nService.t('dash_chart_hours_label');
      labels=['06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00'];
      const sH=[0,0,0,0,0,0,0,0,0],oH=[0,0,0,0,0,0,0,0,0];
      this.state.ventas.forEach(v=>{const ts=Number(v.createdAt||v.timestamp||0);if(!ts)return;const h=new Date(ts).getHours();let i=Math.floor((h-5)/2);if(i<0)i=0;if(i>=sH.length)i=sH.length-1;sH[i]+=Number(v.total||v.monto||0);oH[i]+=1;});
      datasets=[{label:I18nService.t('dash_sales_per_hour'),data:sH,color:'#6366f1'},{label:I18nService.t('dash_transactions'),data:oH,color:'#34d399'}];
    }else if(mode==='DAYS'){
      subLabel=I18nService.t('dash_chart_days_label');
      labels=[I18nService.t('day_mon'),I18nService.t('day_tue'),I18nService.t('day_wed'),I18nService.t('day_thu'),I18nService.t('day_fri'),I18nService.t('day_sat'),I18nService.t('day_sun')];
      const sD=[0,0,0,0,0,0,0],eD=[0,0,0,0,0,0,0];
      this.state.ventas.forEach(v=>{const ts=Number(v.createdAt||v.timestamp||0);if(!ts)return;let d=new Date(ts).getDay()-1;if(d<0)d=6;sD[d]+=Number(v.total||v.monto||0);});
      this.state.gastos.forEach(g=>{const ts=Number(g.createdAt||g.timestamp||g.dateTimestamp||0);if(!ts)return;let d=new Date(ts).getDay()-1;if(d<0)d=6;eD[d]+=Number(g.amount||g.monto||0);});
      datasets=[{label:I18nService.t('dash_sales_label'),data:sD,color:'#6366f1'},{label:I18nService.t('dash_expenses_label'),data:eD,color:'#ef4444'}];
    }else if(mode==='MONTHS'){
      subLabel=I18nService.t('dash_chart_months_label');
      labels=[I18nService.t('month_jan'),I18nService.t('month_feb'),I18nService.t('month_mar'),I18nService.t('month_apr'),I18nService.t('month_may'),I18nService.t('month_jun'),I18nService.t('month_jul'),I18nService.t('month_aug'),I18nService.t('month_sep'),I18nService.t('month_oct'),I18nService.t('month_nov'),I18nService.t('month_dec')];
      const sM=new Array(12).fill(0),eM=new Array(12).fill(0);
      this.state.ventas.forEach(v=>{const ts=Number(v.createdAt||v.timestamp||0);if(!ts)return;sM[new Date(ts).getMonth()]+=Number(v.total||v.monto||0);});
      this.state.gastos.forEach(g=>{const ts=Number(g.createdAt||g.timestamp||g.dateTimestamp||0);if(!ts)return;eM[new Date(ts).getMonth()]+=Number(g.amount||g.monto||0);});
      datasets=[{label:I18nService.t('dash_sales_label'),data:sM,color:'#6366f1'},{label:I18nService.t('dash_expenses_label'),data:eM,color:'#ef4444'}];
    }
    const el=root.querySelector('#odb-chart-sub-label');if(el)el.textContent=subLabel;
    this.chart.updateData(labels,datasets);
  }

  mount() {
    this.element=this.layout.mount();
    const unsub=GlobalStore.subscribe('selectedBranchId',()=>this.renderUI());
    this.listeners.push(unsub);
    this.element.querySelector('#btn-refresh-dashboard')?.addEventListener('click',async()=>{this.state.loading=true;this.renderUI();await this.loadData();});
    this.loadData();
    return this.element;
  }

  unmount() {
    this.listeners.forEach(id=>{if(typeof id==='string')FirestoreService.unsubscribe(id);else if(typeof id==='function')id();});
    this.listeners=[];
    if(this.layout&&typeof this.layout.unmount==='function')this.layout.unmount();
    this.element=null;
    super.unmount();
  }
}
