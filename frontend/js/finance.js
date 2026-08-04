/* ============================================================
   家庭管理系统 - 财务模块 JS
   ============================================================ */

let currentMemberId = null;
let allMembers = [];
let currentMonth = '';
let currentFilter = { type: 'all', category: 'all' };

(function () {
  const token = localStorage.getItem('family_token');
  if (!token) { window.location.href = 'index.html'; return; }
})();

function getMemberIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('member_id') || localStorage.getItem('family_member_id');
}

async function init() {
  currentMemberId = getMemberIdFromURL();
  if (!currentMemberId) { window.location.href = 'index.html'; return; }

  try {
    const membersData = await getMembers();
    allMembers = membersData.members || [];
    renderMemberSwitcher();
  } catch (e) { /* 静默 */ }

  const now = new Date();
  currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await loadFinanceData();
}

function renderMemberSwitcher() {
  const sel = document.getElementById('memberSwitcher');
  if (!sel) return;
  sel.innerHTML = allMembers.map(m =>
    `<option value="${m.id}" ${m.id == currentMemberId ? 'selected' : ''}>${m.name}</option>`
  ).join('');
}

function switchMember(memberId) {
  if (memberId == currentMemberId) return;
  currentMemberId = memberId;
  localStorage.setItem('family_member_id', memberId);
  init();
}

async function loadFinanceData() {
  const container = document.getElementById('financeApp');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> 加载中...</div>';

  try {
    const data = await apiFetch(
      `/api/finance/transactions?member_id=${currentMemberId}&month=${currentMonth}`
    );

    if (!data) {
      container.innerHTML = '<div class="empty-state"><div class="empty-text">暂无财务数据</div></div>';
      return;
    }

    renderUI(data);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-text">${e.message}</div></div>`;
  }
}

function renderUI(data) {
  const container = document.getElementById('financeApp');
  const stats = data.stats || {};
  const transactions = data.transactions || [];

  container.innerHTML = `
    <!-- 月度统计卡片 -->
    <div class="grid-3" style="margin-bottom:var(--space-lg);">
      <div class="card">
        <div class="card-body" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">本月收入</div>
          <div style="font-size:var(--font-size-xl);font-weight:700;color:var(--secondary-dark);">${stats.income_total ? '¥' + stats.income_total.toFixed(2) : '¥0.00'}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-body" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">本月支出</div>
          <div style="font-size:var(--font-size-xl);font-weight:700;color:var(--warning);">${stats.expense_total ? '¥' + stats.expense_total.toFixed(2) : '¥0.00'}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-body" style="text-align:center;">
          <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">本月结余</div>
          <div style="font-size:var(--font-size-xl);font-weight:700;color:${(stats.balance || 0) >= 0 ? 'var(--accent)' : 'var(--warning)'};">${stats.balance != null ? '¥' + stats.balance.toFixed(2) : '¥0.00'}</div>
        </div>
      </div>
    </div>

    <!-- 月份选择 + 饼图 -->
    <div style="display:flex;gap:var(--space-md);align-items:center;margin-bottom:var(--space-lg);flex-wrap:wrap;">
      <input type="month" id="monthPicker" value="${currentMonth}" onchange="changeMonth(this.value)" class="form-input" style="width:auto;max-width:180px;">
    </div>

    <!-- 分类饼图 -->
    <div class="card" style="margin-bottom:var(--space-lg);">
      <div class="card-header">分类支出统计</div>
      <div class="card-body" style="text-align:center;">
        <div id="pieChartContainer" style="position:relative;display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:var(--space-lg);">
          <canvas id="pieChart" width="220" height="220"></canvas>
          <div id="pieLegend" style="text-align:left;font-size:var(--font-size-xs);"></div>
        </div>
      </div>
    </div>

    <!-- 添加记录 -->
    <div class="card" style="margin-bottom:var(--space-lg);">
      <div class="card-header">添加收支记录</div>
      <div class="card-body">
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="flex:1;min-width:100px;margin-bottom:0;">
            <label class="form-label">日期</label>
            <input type="date" id="txDate" class="form-input" value="${todayStr()}">
          </div>
          <div class="form-group" style="flex:1;min-width:80px;margin-bottom:0;">
            <label class="form-label">类型</label>
            <select id="txType" class="form-select">
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;min-width:80px;margin-bottom:0;">
            <label class="form-label">金额</label>
            <input type="number" id="txAmount" class="form-input" placeholder="0.00" step="0.01" min="0">
          </div>
          <div class="form-group" style="flex:1;min-width:100px;margin-bottom:0;">
            <label class="form-label">分类</label>
            <select id="txCategory" class="form-select">
              <option value="餐饮">餐饮</option>
              <option value="交通">交通</option>
              <option value="医疗">医疗</option>
              <option value="购物">购物</option>
              <option value="教育">教育</option>
              <option value="居住">居住</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div class="form-group" style="flex:2;min-width:120px;margin-bottom:0;">
            <label class="form-label">备注</label>
            <input type="text" id="txNote" class="form-input" placeholder="选填">
          </div>
          <button class="btn btn-primary" onclick="addTransaction()" style="height:42px;">添加</button>
        </div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="card">
      <div class="card-header">
        <span>收支记录</span>
        <div style="display:flex;gap:var(--space-xs);">
          <select id="filterType" class="form-select" style="width:auto;padding:4px 10px;font-size:var(--font-size-xs);" onchange="applyFilters()">
            <option value="all">全部类型</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
          <select id="filterCategory" class="form-select" style="width:auto;padding:4px 10px;font-size:var(--font-size-xs);" onchange="applyFilters()">
            <option value="all">全部分类</option>
          </select>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div id="txList"></div>
      </div>
    </div>
  `;

  drawPieChart(data.stats ? data.stats.category_stats : []);
  renderTransactionList(transactions);
  populateCategoryFilter(transactions);

  // 保存原始数据
  container.dataset.allTransactions = JSON.stringify(transactions);
}

function changeMonth(month) {
  currentMonth = month;
  loadFinanceData();
}

async function addTransaction() {
  const date = document.getElementById('txDate').value;
  const type = document.getElementById('txType').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const category = document.getElementById('txCategory').value;
  const note = document.getElementById('txNote').value;

  if (!date || !amount || amount <= 0) {
    showError('请填写日期和有效金额');
    return;
  }

  try {
    await apiFetch('/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({
        member_id: parseInt(currentMemberId),
        type, amount, category, date, note
      })
    });
    showSuccess('记录已添加');
    loadFinanceData();
  } catch (e) {
    showError(e.message);
  }
}

function renderTransactionList(transactions) {
  const list = document.getElementById('txList');
  if (!list) return;

  if (transactions.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-text">暂无记录</div></div>';
    return;
  }

  list.innerHTML = transactions.map(t => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-sm) var(--space-lg);border-bottom:1px solid var(--border-light);">
      <div style="display:flex;align-items:center;gap:var(--space-md);">
        <span class="tag ${t.type === 'income' ? 'tag-green' : 'tag-red'}">${t.type === 'income' ? '收入' : '支出'}</span>
        <span style="font-weight:600;">${t.category}</span>
        ${t.note ? `<span style="color:var(--text-light);font-size:var(--font-size-xs);">${t.note}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-lg);">
        <span style="font-size:var(--font-size-xs);color:var(--text-light);">${t.date || ''}</span>
        <span style="font-weight:700;color:${t.type === 'income' ? 'var(--secondary-dark)' : 'var(--warning)'};">${t.type === 'income' ? '+' : '-'}¥${t.amount.toFixed(2)}</span>
      </div>
    </div>
  `).join('');
}

function applyFilters() {
  const container = document.getElementById('financeApp');
  const allTx = JSON.parse(container.dataset.allTransactions || '[]');
  const type = document.getElementById('filterType').value;
  const category = document.getElementById('filterCategory').value;

  let filtered = allTx;
  if (type !== 'all') filtered = filtered.filter(t => t.type === type);
  if (category !== 'all') filtered = filtered.filter(t => t.category === category);

  renderTransactionList(filtered);
}

function populateCategoryFilter(transactions) {
  const sel = document.getElementById('filterCategory');
  if (!sel) return;
  const cats = [...new Set(transactions.map(t => t.category))];
  sel.innerHTML = '<option value="all">全部分类</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function drawPieChart(categoryStats) {
  const canvas = document.getElementById('pieChart');
  const legend = document.getElementById('pieLegend');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 80;

  ctx.clearRect(0, 0, w, h);

  if (!categoryStats || categoryStats.length === 0) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#B5A5A5';
    ctx.textAlign = 'center';
    ctx.fillText('暂无支出数据', cx, cy);
    if (legend) legend.innerHTML = '';
    return;
  }

  const total = categoryStats.reduce((s, c) => s + c.total, 0);
  if (total === 0) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#B5A5A5';
    ctx.textAlign = 'center';
    ctx.fillText('暂无支出数据', cx, cy);
    if (legend) legend.innerHTML = '';
    return;
  }

  const colors = ['#E8B4B8', '#A8D8B9', '#9B7EBD', '#FFB347', '#87CEEB', '#FF6B6B', '#C4B4D8'];
  let startAngle = -0.5 * Math.PI;

  if (legend) {
    legend.innerHTML = categoryStats.map((c, i) => {
      const pct = Math.round(c.total / total * 100);
      return `<div style="margin-bottom:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${colors[i % colors.length]};margin-right:6px;vertical-align:middle;"></span>${c.category} ${pct}%</div>`;
    }).join('');
  }

  categoryStats.forEach((c, i) => {
    const sliceAngle = (c.total / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    startAngle += sliceAngle;
  });
}

init();
