/* ============================================================
   家庭管理系统 - 仪表板 JS
   ============================================================ */

let currentMemberId = null;
let dashboardData = null;
let allMembers = [];

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

  // 加载成员列表用于切换
  try {
    const membersData = await getMembers();
    allMembers = membersData.members || [];
    renderMemberSwitcher();
  } catch (e) { /* 静默失败 */ }

  // 加载仪表板
  try {
    dashboardData = await getDashboard(currentMemberId);
  } catch (e) {
    document.getElementById('dashboardApp').innerHTML =
      `<div class="empty-state"><div class="empty-icon">!</div><div class="empty-text">${e.message}</div></div>`;
    return;
  }

  renderDashboard();
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
  // 刷新当前页面内容（不跳转）
  init();
}

function renderDashboard() {
  const container = document.getElementById('dashboardApp');
  const d = dashboardData;

  if (!d) {
    container.innerHTML = '<div class="empty-state"><div class="empty-text">暂无数据</div></div>';
    return;
  }

  const stageInfo = d.stage_info || {};
  const stageName = stageInfo.stage_name || '未知阶段';
  const stageDesc = stageInfo.days_to_target || '';
  const countdown = stageInfo.days_to_target ? `距目标日期: ${stageInfo.days_to_target} 天` : '';
  const cta = stageInfo.cta || null;
  const isInactive = stageInfo.stage === 'inactive';
  const todos = d.today_todos || [];
  const checkins = d.today_checkins || [];
  const cp = d.check_progress || { total: 0, completed: 0 };
  const checkProgress = cp.total > 0 ? Math.round(cp.completed / cp.total * 100) : -1;
  const readinessScore = d.prep_score ? Math.round(d.prep_score.score * 100) : 0;

  // 周期阶段信息
  const pp = stageInfo.period_phase || {};
  const phaseName = pp.phase_name || '--';
  const phaseDesc = pp.phase_desc || '';
  const dayInCycle = pp.day_in_cycle;
  const nextPredicted = pp.next_predicted;
  const todayStr = stageInfo.today || '';

  const phaseColors = {
    menstrual: { bg: '#FFE0E0', text: '#D44', icon: '🩸' },
    follicular: { bg: '#D0EDDA', text: '#3A7D44', icon: '🌱' },
    ovulatory: { bg: '#E8F5E9', text: '#2E7D32', icon: '✨' },
    luteal: { bg: '#F5E6D3', text: '#C4956A', icon: '🌙' },
    unknown: { bg: '#F2EBEB', text: '#8A7A7A', icon: '📋' }
  };
  const pc = phaseColors[pp.phase] || phaseColors.unknown;

  container.innerHTML = `
    <!-- 日期与周期阶段卡片 -->
    <div class="period-banner" style="background:${pc.bg};border-left:4px solid ${pc.text};border-radius:var(--radius-lg);padding:var(--space-lg);margin-bottom:var(--space-lg);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-md);">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--text-secondary);">${todayStr}</div>
          <div style="font-size:var(--font-size-xl);font-weight:700;color:${pc.text};margin-top:4px;">
            ${pc.icon} ${phaseName}
            ${dayInCycle ? `<span style="font-size:var(--font-size-sm);font-weight:400;opacity:0.7;">第${dayInCycle}天</span>` : ''}
          </div>
          <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:4px;">${phaseDesc}</div>
        </div>
        ${nextPredicted ? `<div style="text-align:right;font-size:var(--font-size-xs);color:var(--text-secondary);">预测下次经期<br><strong style="color:var(--warning);font-size:var(--font-size-sm);">${nextPredicted}</strong></div>` : ''}
      </div>
    </div>

    <!-- 阶段卡片 -->
    <div class="stage-card">
      <div class="stage-name">${stageName}</div>
      ${stageDesc ? `<div class="stage-info">${stageDesc}</div>` : ''}
      ${countdown ? `<div class="stage-countdown">${countdown}</div>` : ''}
      ${cta ? `<a href="${cta.link}?member_id=${currentMemberId}" class="btn btn-primary" style="margin-top:var(--space-md);display:inline-block;text-decoration:none;">${cta.text}</a>` : ''}
    </div>

    <div class="grid-auto" style="margin-top: var(--space-lg);">
      <!-- 今日待办 -->
      <div class="card">
        <div class="card-header">今日待办</div>
        <div class="card-body" style="padding: 0;">
          <ul class="todo-list" id="todoList">
            ${todos.length === 0 ? '<div class="empty-state" style="padding:var(--space-lg);"><div class="empty-text">暂无待办</div></div>' : ''}
          </ul>
        </div>
      </div>

      <!-- 检查进度 -->
      <div class="card">
        <div class="card-header">检查进度</div>
        <div class="card-body" style="text-align:center;">
          ${checkProgress >= 0 ? `
          <div class="progress-ring-container">
            <div class="progress-ring">
              <canvas id="progressRing" width="120" height="120"></canvas>
              <div class="progress-ring-text">${Math.round(checkProgress)}%</div>
            </div>
          </div>
          ` : `
          <div class="empty-state">
            <div class="empty-text">尚未添加检查项目</div>
            <a href="health.html?member_id=${currentMemberId}" class="btn btn-outline btn-sm" style="margin-top:var(--space-sm);text-decoration:none;">去健康模块添加</a>
          </div>
          `}
          ${readinessScore > 0 ? `<div style="margin-top:var(--space-md); font-weight:600; color:var(--accent);">备孕准备度: ${readinessScore}/100</div>` : ''}
        </div>
      </div>
    </div>

    <!-- 打卡区 -->
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">
        <span>今日打卡</span>
        <div class="filter-bar" style="margin:0;" id="checkinFilter">
          <span class="filter-chip active" data-filter="all">全部</span>
          <span class="filter-chip" data-filter="H">H-健康</span>
          <span class="filter-chip" data-filter="B">B-孕产育</span>
        </div>
      </div>
      <div class="card-body">
        <div class="checkin-grid" id="checkinGrid"></div>
      </div>
    </div>
  `;

  // 渲染待办
  renderTodos(todos);
  // 渲染打卡
  renderCheckins(checkins);
  // 绑定筛选
  bindCheckinFilter();
  // 绘制环形图
  drawProgressRing(checkProgress);
}

function renderTodos(todos) {
  const list = document.getElementById('todoList');
  if (!list || todos.length === 0) return;

  list.innerHTML = todos.map((t, i) => `
    <li class="todo-item ${t.overdue ? 'overdue' : ''} ${t.completed ? 'completed' : ''}" data-index="${i}">
      <div class="todo-check" onclick="toggleTodo(${i})">${t.completed ? '&#10003;' : ''}</div>
      <span class="todo-text">${t.title}</span>
      <span class="todo-meta">${t.date || ''}</span>
    </li>
  `).join('');

  // 点击整行也切换
  list.querySelectorAll('.todo-item').forEach(item => {
    item.addEventListener('click', function (e) {
      if (e.target.classList.contains('todo-check')) return;
      const idx = parseInt(this.dataset.index);
      toggleTodo(idx);
    });
  });
}

function toggleTodo(index) {
  // 视觉上切换，后端通过后续API更新
  const todos = dashboardData.todos;
  if (!todos || !todos[index]) return;
  todos[index].completed = !todos[index].completed;
  renderTodos(todos);
}

function renderCheckins(checkins) {
  const grid = document.getElementById('checkinGrid');
  if (!grid) return;
  grid.dataset.allCheckins = JSON.stringify(checkins);
  applyCheckinFilter('all');
}

function applyCheckinFilter(filter) {
  const grid = document.getElementById('checkinGrid');
  if (!grid) return;
  const allCheckins = JSON.parse(grid.dataset.allCheckins || '[]');
  const filtered = filter === 'all' ? allCheckins : allCheckins.filter(c => c.category === filter);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="empty-text">暂无打卡项</div>
      <div style="margin-top:var(--space-sm);font-size:var(--font-size-xs);color:var(--text-secondary);">
        请先在<a href="pregnancy.html?member_id=${currentMemberId}" style="color:var(--accent);">孕产育模块</a>设置备孕计划激活阶段，或在<a href="health.html?member_id=${currentMemberId}" style="color:var(--accent);">健康模块</a>添加健康检查
      </div>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map((c, i) => `
    <div class="checkin-item ${c.done ? 'completed' : ''}" data-checkin-index="${i}" data-checkin-type="${c.type}" data-checkin-category="${c.category}" onclick="toggleCheckin(this)">
      <div class="checkin-icon">${c.done ? '&#10003;' : ''}</div>
      <div class="checkin-label">${c.name}</div>
    </div>
  `).join('');
}

function bindCheckinFilter() {
  const filterBar = document.getElementById('checkinFilter');
  if (!filterBar) return;
  filterBar.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', function () {
      filterBar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      applyCheckinFilter(this.dataset.filter);
    });
  });
}

function toggleCheckin(el) {
  el.classList.toggle('completed');
  const icon = el.querySelector('.checkin-icon');
  const type = el.dataset.checkinType;
  const isDone = el.classList.contains('completed');
  icon.innerHTML = isDone ? '&#10003;' : '';

  saveCheckin(currentMemberId, {
    type: type,
    date: todayStr(),
    value: isDone ? 'done' : null,
  }).catch(e => {
    el.classList.toggle('completed');
    icon.innerHTML = isDone ? '' : '&#10003;';
    showError(e.message);
  });
}

function drawProgressRing(percent) {
  const canvas = document.getElementById('progressRing');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 48;
  const lineWidth = 8;
  const startAngle = -0.5 * Math.PI;
  const endAngle = startAngle + (2 * Math.PI * Math.min(percent, 100) / 100);

  ctx.clearRect(0, 0, w, h);

  // bg ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = '#F2EBEB';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // progress ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9B7EBD';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast error';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

init();
