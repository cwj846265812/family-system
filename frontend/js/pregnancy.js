/* ============================================================
   家庭管理系统 - 孕产育模块 JS
   ============================================================ */

let currentMemberId = null;
let allMembers = [];
let pregnancyData = null;

(function () {
  const token = localStorage.getItem('family_token');
  if (!token) { window.location.href = 'index.html'; return; }
})();

function getMemberId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('member_id') || localStorage.getItem('family_member_id');
}

function switchMember(memberId) {
  currentMemberId = memberId;
  localStorage.setItem('family_member_id', memberId);
  init();
}

async function init() {
  currentMemberId = getMemberId();
  if (!currentMemberId) { window.location.href = 'index.html'; return; }

  try {
    const data = await getMembers();
    allMembers = data.members || [];
    const sel = document.getElementById('memberSwitcher');
    if (sel) {
      sel.innerHTML = allMembers.map(m =>
        `<option value="${m.id}" ${m.id == currentMemberId ? 'selected' : ''}>${m.name}</option>`
      ).join('');
    }
  } catch (e) { /* ignore */ }

  // 加载数据
  try {
    const plan = await getPregnancyPlan(currentMemberId);
    const todos = await getPregnancyTodos(currentMemberId);
    pregnancyData = { plan, todos };
  } catch (e) {
    pregnancyData = { plan: null, todos: null };
  }

  renderPage();
}

function renderPage() {
  const container = document.getElementById('pregnancyApp');
  const plan = pregnancyData.plan || {};
  const isPregnant = plan.is_pregnant || plan.confirmed;
  const stage = plan.stage || {};
  const todos = pregnancyData.todos ? (pregnancyData.todos.todos || []) : [];

  container.innerHTML = `
    <!-- 备孕计划设置区 -->
    <div class="card">
      <div class="card-header">备孕计划</div>
      <div class="card-body">
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">计划怀孕月份</label>
            <input type="month" class="form-input" id="plannedDate" value="${plan.planned_date || ''}">
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end;">
            <button class="btn btn-primary" onclick="savePregnancyPlan()">保存计划</button>
          </div>
        </div>
        ${!isPregnant ? `
          <div style="margin-top:var(--space-md);">
            <button class="btn btn-secondary" onclick="confirmPregnancyDialog()">确认怀孕</button>
          </div>
        ` : `
          <div style="margin-top:var(--space-md);" id="pregnancyStatus">
            <span class="tag tag-green" style="font-size:var(--font-size);">已确认怀孕</span>
            ${plan.confirmed_date ? `<span style="margin-left:var(--space-md);color:var(--text-secondary);">确认日期: ${formatDate(plan.confirmed_date)}</span>` : ''}
            ${plan.current_week ? `<span style="margin-left:var(--space-md);font-weight:700;color:var(--accent);">当前孕${plan.current_week}周</span>` : ''}
          </div>
          ${plan.confirmed_date ? renderPregnancyProgress(plan) : ''}
        `}
      </div>
    </div>

    <!-- 阶段状态卡片 -->
    <div class="stage-card" style="margin-top: var(--space-lg);">
      <div class="stage-name">${stage.name || '备孕期'}</div>
      ${stage.info ? `<div class="stage-info">${stage.info}</div>` : ''}
      ${stage.countdown ? `<div class="stage-countdown">${stage.countdown}</div>` : ''}
    </div>

    <!-- 备孕待办清单（五分段） -->
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">备孕待办清单</div>
      <div class="card-body" id="pregnancyTodos">
        ${renderTodosBySegment(todos)}
      </div>
    </div>

    <!-- 备孕打卡区 -->
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">备孕打卡</div>
      <div class="card-body">
        <div class="checkin-grid" id="pregnancyCheckinGrid">
          <div class="checkin-item" onclick="togglePregCheckin(this, 'folate_wife')">
            <div class="checkin-icon"></div>
            <div class="checkin-label">女方叶酸</div>
          </div>
          <div class="checkin-item" onclick="togglePregCheckin(this, 'folate_husband')">
            <div class="checkin-icon"></div>
            <div class="checkin-label">男方叶酸</div>
          </div>
          <div class="checkin-item" onclick="quickBBT()">
            <div class="checkin-icon"></div>
            <div class="checkin-label">BBT体温录入</div>
          </div>
          <div class="checkin-item" onclick="togglePregCheckin(this, 'ovulation_test')">
            <div class="checkin-icon"></div>
            <div class="checkin-label">排卵试纸</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 孕期：产检时间表 -->
    ${isPregnant ? renderPrenatalSchedule(plan) : ''}
  `;
}

function renderPregnancyProgress(plan) {
  const confirmed = new Date(plan.confirmed_date);
  const now = new Date();
  const diffDays = Math.floor((now - confirmed) / (1000 * 60 * 60 * 24));
  const totalDays = 280; // 40 周
  const weeks = Math.floor(diffDays / 7);
  const days = diffDays % 7;
  const progressPct = Math.min(100, Math.round((diffDays / totalDays) * 100));

  const trimesters = [
    { name: '孕早期', weeks: '0-12周', range: [0, 12 * 7] },
    { name: '孕中期', weeks: '13-27周', range: [12 * 7 + 1, 27 * 7] },
    { name: '孕晚期', weeks: '28-40周', range: [27 * 7 + 1, 40 * 7] },
  ];
  const currentTri = trimesters.find(t => diffDays >= t.range[0] && diffDays <= t.range[1]);

  return `
    <div style="margin-top:var(--space-lg);">
      <div class="flex-between" style="margin-bottom:var(--space-sm);">
        <span class="text-muted" style="font-size:var(--font-size-sm);">孕期进度</span>
        <span style="font-weight:700;color:var(--accent);">孕${weeks}周+${days}天</span>
      </div>
      <div style="height:8px;background:var(--border-light);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${progressPct}%;background:linear-gradient(90deg,var(--secondary),var(--secondary-dark));border-radius:4px;transition:width 0.5s;"></div>
      </div>
      <div class="flex-between" style="margin-top:var(--space-xs);font-size:var(--font-size-xs);">
        <span class="text-muted">0周</span>
        <span style="color:var(--primary-dark);font-weight:600;">${currentTri ? currentTri.name : ''}</span>
        <span class="text-muted">40周</span>
      </div>
    </div>
  `;
}

function renderTodosBySegment(todos) {
  const segments = {
    prenatal_check: { name: '孕前检查', icon: '&#9764;' },
    vaccination: { name: '疫苗接种', icon: '&#9730;' },
    dental: { name: '口腔检查', icon: '&#9758;' },
    genetic: { name: '遗传咨询', icon: '&#9762;' },
    environment: { name: '环境排查', icon: '&#9737;' },
  };

  const grouped = {};
  todos.forEach(t => {
    const seg = segments[t.segment] ? t.segment : 'other';
    if (!grouped[seg]) grouped[seg] = [];
    grouped[seg].push(t);
  });

  const statusColors = { pending: '#8A7A7A', in_progress: '#9B7EBD', completed: '#A8D8B9', skipped: '#E8DEDE' };
  const statusLabels = { pending: '待办', in_progress: '进行中', completed: '已完成', skipped: '跳过' };

  let html = '<div class="segment-list">';
  for (const [key, seg] of Object.entries(segments)) {
    const items = grouped[key] || [];
    const doneCount = items.filter(i => i.status === 'completed').length;
    html += `
      <div class="segment-group">
        <div class="segment-group-header">
          <span>${seg.icon} ${seg.name}</span>
          <span class="text-muted" style="font-size:var(--font-size-xs);">${doneCount}/${items.length}</span>
        </div>
        <div class="segment-group-body">
          ${items.length === 0 ? '<span class="text-muted" style="font-size:var(--font-size-sm);">暂无项目</span>' : items.map(item => `
            <div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border-light);">
              <span style="font-size:var(--font-size-sm);">${item.title || item.name}</span>
              <span style="font-size:var(--font-size-xs);color:${statusColors[item.status] || '#8A7A7A'};font-weight:600;">${statusLabels[item.status] || item.status}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }
  html += '</div>';
  return html;
}

function renderPrenatalSchedule(plan) {
  // 产检时间表
  const schedule = [
    { week: '6-8周', item: '确认怀孕，B超检查' },
    { week: '12周', item: 'NT检查 + 建卡' },
    { week: '16周', item: '唐氏筛查' },
    { week: '20周', item: '大排畸B超' },
    { week: '24周', item: '糖耐量检查' },
    { week: '28周', item: '乙肝抗原复查' },
    { week: '30周', item: '浮肿检查、B超' },
    { week: '32周', item: '胎心监护' },
    { week: '34周', item: 'B超评估胎儿大小' },
    { week: '36周', item: '胎位检查' },
    { week: '37-40周', item: '每周产检 + 胎心监护' },
  ];

  const currentWeek = plan.current_week || 0;

  return `
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">产检时间表</div>
      <div class="card-body">
        <div class="timeline">
          ${schedule.map(s => {
            const weekNum = parseInt(s.week);
            const isPast = currentWeek > weekNum + 2;
            const isCurrent = currentWeek >= parseInt(s.week) && currentWeek <= weekNum + 2;
            return `
              <div class="timeline-item" style="${isPast ? 'opacity:0.5;' : ''}${isCurrent ? 'border-left:3px solid var(--primary);padding-left:var(--space-sm);' : ''}">
                <div class="tl-date">${s.week}</div>
                <div class="tl-title">${s.item}</div>
                ${isCurrent ? '<span class="tag tag-yellow" style="margin-top:2px;">当前阶段</span>' : ''}
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

/* ---- 交互 ---- */
async function savePregnancyPlan() {
  const plannedDate = document.getElementById('plannedDate').value;
  try {
    await updatePregnancyPlan(currentMemberId, { planned_date: plannedDate });
    showSuccess('备孕计划已保存');
    pregnancyData.plan.planned_date = plannedDate;
  } catch (e) {
    showError(e.message);
  }
}

function confirmPregnancyDialog() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'pregnancyConfirmModal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>确认怀孕</span>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">确认怀孕日期</label>
          <input type="date" class="form-input" id="confirmedDate" value="${todayStr()}">
        </div>
        <p style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-top:var(--space-sm);">
          确认后将自动计算孕周，并显示产检时间表。此操作不可撤销。
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline btn-sm" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary btn-sm" onclick="doConfirmPregnancy()">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function doConfirmPregnancy() {
  const date = document.getElementById('confirmedDate').value;
  if (!date) return showError('请选择日期');
  try {
    await confirmPregnancy(currentMemberId, date);
    document.getElementById('pregnancyConfirmModal').remove();
    showSuccess('已确认怀孕');
    init(); // 重新渲染
  } catch (e) {
    showError(e.message);
  }
}

function togglePregCheckin(el, checkinType) {
  el.classList.toggle('completed');
  const icon = el.querySelector('.checkin-icon');
  const isCompleted = el.classList.contains('completed');
  icon.innerHTML = isCompleted ? '&#10003;' : '';

  saveCheckin(currentMemberId, {
    type: checkinType,
    completed: isCompleted,
    date: todayStr(),
  }).catch(e => {
    el.classList.toggle('completed');
    icon.innerHTML = isCompleted ? '' : '&#10003;';
  });
}

function quickBBT() {
  const temp = prompt('请输入今日基础体温 (°C)，例如 36.50：', '36.50');
  if (!temp) return;
  const val = parseFloat(temp);
  if (isNaN(val) || val < 35 || val > 42) {
    return showError('请输入有效的体温值 (35.0 - 42.0)');
  }

  saveCheckin(currentMemberId, {
    type: 'bbt',
    value: val,
    completed: true,
    date: todayStr(),
  }).then(() => {
    showSuccess(`BBT ${val}°C 已记录`);
  }).catch(e => {
    showError(e.message);
  });
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast error';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showSuccess(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast success';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

init();
