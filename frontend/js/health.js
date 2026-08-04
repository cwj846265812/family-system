/* ============================================================
   家庭管理系统 - 健康模块 JS
   ============================================================ */

let currentMemberId = null;
let allMembers = [];
let activeTab = 'calendar';
let currentPeriodData = null;
let menstrualRecords = [];       // 经期记录原始数据（含id/value）
let dragStartDate = null;       // 拖选起始日期
let editingRecordId = null;     // 正在编辑的记录id（null=新增）
let longPressTimer = null;      // 移动端长按计时器
function isTouchDevice() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

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

  renderPage();
}

function renderPage() {
  const container = document.getElementById('healthApp');
  container.innerHTML = `
    <!-- 生理期标签栏 -->
    <div class="content-tabs" id="periodTabs">
      <button class="ctab active" data-tab="calendar">日历</button>
      <button class="ctab" data-tab="bbt">BBT体温</button>
      <button class="ctab" data-tab="record">记录</button>
    </div>
    <div id="periodContent"></div>

    <!-- 周期运动推荐 -->
    <div id="exerciseRecommendCard"></div>

    <!-- 运动打卡 -->
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">运动打卡</div>
      <div class="card-body">
        <div class="checkin-grid" id="exerciseGrid">
          <div class="checkin-item" onclick="toggleExercise(this, 'walk')">
            <div class="checkin-icon">🚶</div>
            <div class="checkin-label">散步</div>
            <div class="checkin-duration">20-30分钟</div>
          </div>
          <div class="checkin-item" onclick="toggleExercise(this, 'yoga')">
            <div class="checkin-icon">🧘</div>
            <div class="checkin-label">瑜伽</div>
            <div class="checkin-duration">20分钟</div>
          </div>
          <div class="checkin-item" onclick="toggleExercise(this, 'swim')">
            <div class="checkin-icon">🏊</div>
            <div class="checkin-label">游泳</div>
            <div class="checkin-duration">30分钟</div>
          </div>
          <div class="checkin-item" onclick="toggleExercise(this, 'pilates')">
            <div class="checkin-icon">💪</div>
            <div class="checkin-label">普拉提</div>
            <div class="checkin-duration">30分钟</div>
          </div>
          <div class="checkin-item" onclick="toggleExercise(this, 'jog')">
            <div class="checkin-icon">🏃</div>
            <div class="checkin-label">慢跑</div>
            <div class="checkin-duration">20分钟</div>
          </div>
          <div class="checkin-item" onclick="toggleExercise(this, 'stretch')">
            <div class="checkin-icon">🤸</div>
            <div class="checkin-label">拉伸</div>
            <div class="checkin-duration">15分钟</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 健康自评 -->
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">健康自评</div>
      <div class="card-body">
        <div class="self-asse-tags" id="selfAsseTags">
          <span class="self-asse-tag" data-tag="tired" onclick="toggleSelfAsse(this)">疲倦</span>
          <span class="self-asse-tag" data-tag="energetic" onclick="toggleSelfAsse(this)">精力充沛</span>
          <span class="self-asse-tag" data-tag="headache" onclick="toggleSelfAsse(this)">头痛</span>
          <span class="self-asse-tag" data-tag="backpain" onclick="toggleSelfAsse(this)">腰酸</span>
          <span class="self-asse-tag" data-tag="nausea" onclick="toggleSelfAsse(this)">恶心</span>
          <span class="self-asse-tag" data-tag="insomnia" onclick="toggleSelfAsse(this)">失眠</span>
          <span class="self-asse-tag" data-tag="moody" onclick="toggleSelfAsse(this)">情绪波动</span>
          <span class="self-asse-tag" data-tag="cramp" onclick="toggleSelfAsse(this)">腹痛</span>
        </div>
        <textarea class="form-textarea mt-md" placeholder="自由备注..." id="selfRemarks"></textarea>
        <button class="btn btn-primary btn-sm mt-md" onclick="saveSelfAsse()">保存自评</button>
      </div>
    </div>

    <!-- 检查项目列表 -->
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">检查项目</div>
      <div class="card-body" id="healthChecksList">
        <div class="loading"><div class="spinner"></div> 加载中...</div>
      </div>
    </div>

    <!-- 报告时间线 -->
    <div class="card" style="margin-top: var(--space-lg);">
      <div class="card-header">报告时间线</div>
      <div class="card-body" id="reportsTimeline">
        <div class="loading"><div class="spinner"></div> 加载中...</div>
      </div>
    </div>
  `;

  bindPeriodTabs();
  switchPeriodTab('calendar');
  loadExerciseRecommendations();
  loadHealthChecks();
  loadHealthReports();
}

/* ---- 生理期标签切换 ---- */
function bindPeriodTabs() {
  document.querySelectorAll('#periodTabs .ctab').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#periodTabs .ctab').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      switchPeriodTab(this.dataset.tab);
    });
  });
}

function switchPeriodTab(tab) {
  activeTab = tab;
  const content = document.getElementById('periodContent');
  if (tab === 'calendar') renderCalendar(content);
  else if (tab === 'bbt') renderBBTChart(content);
  else if (tab === 'record') renderPeriodRecord(content);
}

/* ---- 日历视图 ---- */
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-based

/**
 * 解析记录的 value 字段（兼容 JSON 字符串和 dict）
 */
function parseRecordValue(r) {
  let v = r.value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch(e) { v = {}; } }
  return v || {};
}

/**
 * 将日期对象转为 yyyy-MM-dd 字符串
 */
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 给定某天，找出属于哪条经期记录（在该记录 start_date ~ end_date 范围内）
 */
function findRecordForDate(dateStr) {
  for (const r of menstrualRecords) {
    const v = parseRecordValue(r);
    const s = v.start_date;
    const e = v.end_date || s;
    if (dateStr >= s && dateStr <= e) return r;
  }
  return null;
}

async function renderCalendar(container) {
  dragStartDate = null;
  editingRecordId = null;

  // 加载经期数据
  let periodDays = [];
  let predictedDays = [];
  menstrualRecords = [];
  try {
    const data = await getHealthCheckins(currentMemberId, 'menstrual');
    menstrualRecords = data.checkins || [];

    // 收集已记录的经期日 + 构建 date->recordId 映射
    menstrualRecords.forEach(r => {
      const v = parseRecordValue(r);
      if (v && v.start_date) {
        const start = new Date(v.start_date + 'T00:00:00');
        const end = v.end_date ? new Date(v.end_date + 'T00:00:00') : new Date(start.getTime() + 4 * 86400000);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          periodDays.push(dateStr(d));
        }
      }
    });

    // 预测下次经期（基于最近一次 start_date + 28）
    if (menstrualRecords.length > 0) {
      let latestStart = null;
      for (const r of menstrualRecords) {
        const v = parseRecordValue(r);
        if (v && v.start_date && (!latestStart || v.start_date > latestStart)) {
          latestStart = v.start_date;
        }
      }
      if (latestStart) {
        const next = new Date(latestStart + 'T00:00:00');
        next.setDate(next.getDate() + 28);
        for (let i = 0; i < 5; i++) {
          const d = new Date(next);
          d.setDate(d.getDate() + i);
          predictedDays.push(dateStr(d));
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load period data:', e);
  }

  const today = dateStr(new Date());
  const year = calendarYear;
  const month = calendarMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const periodSet = new Set(periodDays);
  const predictedSet = new Set(predictedDays);

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md);">
    <button class="btn btn-outline btn-sm" onclick="changeCalendarMonth(-1)">&larr; 上月</button>
    <strong style="font-size:var(--font-size-lg);">${year}年 ${monthNames[month]}</strong>
    <button class="btn btn-outline btn-sm" onclick="changeCalendarMonth(1)">下月 &rarr;</button>
  </div>`;

  // 拖选提示
  html += `<div id="dragHint" style="text-align:center;font-size:var(--font-size-xs);color:var(--text-light);margin-bottom:var(--space-sm);min-height:18px;"></div>`;

  html += '<table class="calendar"><thead><tr>';
  weekdays.forEach(d => html += `<th>${d}</th>`);
  html += '</tr></thead><tbody><tr>';

  for (let i = 0; i < firstDay; i++) {
    html += '<td class="other-month"></td>';
  }

  let dayCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if ((firstDay + dayCount) % 7 === 0 && dayCount > 0) html += '</tr><tr>';
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let cls = '';
    if (ds === today) cls += ' today';
    if (periodSet.has(ds)) cls += ' period';
    else if (predictedSet.has(ds)) cls += ' predicted-period';
    html += `<td class="${cls.trim()}" data-date="${ds}" onclick="onCalendarDayClick(this, '${ds}')" ontouchstart="onCalendarTouchStart(event, this, '${ds}')" ontouchend="onCalendarTouchEnd(event, this, '${ds}')">${d}</td>`;
    dayCount++;
  }

  while ((firstDay + dayCount) % 7 !== 0) {
    html += '<td class="other-month"></td>';
    dayCount++;
  }

  html += '</tr></tbody></table>';

  // 图例
  html += `<div style="margin-top:var(--space-md);font-size:var(--font-size-xs);color:var(--text-secondary);display:flex;gap:var(--space-lg);flex-wrap:wrap;align-items:center;">
    <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#FFE0E0;border:1px solid #FF6B6B;"></span> 经期日（点击编辑）</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#FFF0F0;border:1px dashed #FFA0A0;"></span> 预测经期</span>
    <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;border:2px solid var(--accent);"></span> 今天</span>
    <span style="display:flex;align-items:center;gap:4px;color:var(--accent);"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;border:2px dashed var(--accent);"></span> 选中范围</span>
  </div>`;

  // 编辑面板占位
  html += '<div id="periodEditPanel" class="period-edit-panel" style="display:none;"></div>';

  container.innerHTML = html;
}

/* ---- 移动端长按拖选支持 ---- */
function onCalendarTouchStart(e, el, ds) {
  if (!isTouchDevice()) return;
  const record = findRecordForDate(ds);
  if (record) return;
  if (dragStartDate) return;
  longPressTimer = setTimeout(() => {
    dragStartDate = ds;
    highlightDragRange(ds, ds);
    const hint = document.getElementById('dragHint');
    if (hint) hint.textContent = `已选择起始日 ${ds}，请点击结束日完成范围选择`;
    if (navigator.vibrate) navigator.vibrate(30);
  }, 500);
}

function onCalendarTouchEnd(e, el, ds) {
  clearTimeout(longPressTimer);
  longPressTimer = null;
}

/* ---- 日历日期点击 ---- */
function onCalendarDayClick(el, ds) {
  const record = findRecordForDate(ds);

  if (record) {
    // 点击已有经期日 → 编辑模式
    if (dragStartDate) { return; }
    showPeriodEditPanel(record);
  } else {
    // 点击非经期日 → 拖选或新增
    if (!dragStartDate) {
      // 第一次点击：设置拖选起点（移动端通过长按已设，此处兼容桌面端点击）
      dragStartDate = ds;
      highlightDragRange(ds, ds);
      const hint = document.getElementById('dragHint');
      if (hint) hint.textContent = `已选择起始日 ${ds}，请点击结束日完成范围选择（点击同一日期取消）`;
    } else if (dragStartDate === ds) {
      // 再次点击同一日期：取消拖选，打开新增面板
      dragStartDate = null;
      clearDragHighlight();
      const hint = document.getElementById('dragHint');
      if (hint) hint.textContent = '';
      showPeriodAddPanel(ds, ds);
    } else {
      // 第二次点击不同日期：完成范围选择
      const start = dragStartDate < ds ? dragStartDate : ds;
      const end = dragStartDate < ds ? ds : dragStartDate;
      dragStartDate = null;
      clearDragHighlight();
      const hint = document.getElementById('dragHint');
      if (hint) hint.textContent = '';
      showPeriodAddPanel(start, end);
    }
  }
}

/* ---- 拖选高亮 ---- */
function highlightDragRange(from, to) {
  clearDragHighlight();
  const start = from < to ? from : to;
  const end = from < to ? to : from;
  document.querySelectorAll('.calendar td[data-date]').forEach(td => {
    const d = td.dataset.date;
    if (d >= start && d <= end) {
      td.classList.add('drag-selected');
    }
  });
}

function clearDragHighlight() {
  document.querySelectorAll('.calendar td.drag-selected').forEach(td => {
    td.classList.remove('drag-selected');
  });
}

/* ---- 编辑面板 ---- */
function showPeriodEditPanel(record) {
  editingRecordId = record.id;
  const v = parseRecordValue(record);
  const panel = document.getElementById('periodEditPanel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = buildPanelHTML(v.start_date, v.end_date || v.start_date, v.flow || 'normal', v.symptoms || [], 'edit');
  bindPanelEvents();
}

/* ---- 新增面板 ---- */
function showPeriodAddPanel(startDate, endDate) {
  editingRecordId = null;
  const panel = document.getElementById('periodEditPanel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = buildPanelHTML(startDate, endDate, 'normal', [], 'add');
  bindPanelEvents();
}

function buildPanelHTML(startDate, endDate, flow, symptoms, mode) {
  const flowOptions = [
    ['light', '偏少'], ['normal', '正常'], ['heavy', '偏多']
  ];
  const symptomOptions = ['cramp', 'headache', 'fatigue', 'mood', 'bloating', 'nausea', 'backpain', 'insomnia'];
  const symptomLabels = {
    cramp: '痛经', headache: '头痛', fatigue: '疲劳', mood: '情绪波动',
    bloating: '腹胀', nausea: '恶心', backpain: '腰酸', insomnia: '失眠'
  };

  const checkedSymptoms = new Set(symptoms);
  const symptomTags = symptomOptions.map(s => {
    const sel = checkedSymptoms.has(s) ? ' selected' : '';
    return `<span class="self-asse-tag${sel}" data-tag="${s}" onclick="this.classList.toggle('selected')">${symptomLabels[s]}</span>`;
  }).join('');

  const title = mode === 'edit' ? '编辑经期记录' : '新增经期记录';
  const btnRow = mode === 'edit'
    ? `<button class="btn btn-primary btn-sm" onclick="savePeriodFromPanel()">保存修改</button>
       <button class="btn btn-danger btn-sm" onclick="deletePeriodFromPanel()">删除记录</button>`
    : `<button class="btn btn-primary btn-sm" onclick="savePeriodFromPanel()">保存记录</button>`;

  return `
    <div class="period-panel-header">
      <strong>${title}</strong>
      <button class="btn-close-panel" onclick="closePeriodPanel()">&times;</button>
    </div>
    <div class="period-panel-body">
      <div class="form-group">
        <label class="form-label">开始日期</label>
        <input type="date" class="form-input" id="panelStartDate" value="${startDate}">
      </div>
      <div class="form-group">
        <label class="form-label">结束日期</label>
        <input type="date" class="form-input" id="panelEndDate" value="${endDate}">
      </div>
      <div class="form-group">
        <label class="form-label">经量</label>
        <select class="form-select" id="panelFlow">
          ${flowOptions.map(([v, l]) => `<option value="${v}" ${flow === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">症状（可多选）</label>
        <div class="self-asse-tags" id="panelSymptoms">${symptomTags}</div>
      </div>
      <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md);">
        ${btnRow}
        <button class="btn btn-outline btn-sm" onclick="closePeriodPanel()">取消</button>
      </div>
    </div>
  `;
}

function bindPanelEvents() {
  // 日期变更时更新拖选高亮
  const startEl = document.getElementById('panelStartDate');
  const endEl = document.getElementById('panelEndDate');
  if (startEl && endEl) {
    const updateHighlight = () => {
      clearDragHighlight();
      if (startEl.value && endEl.value) {
        highlightDragRange(startEl.value, endEl.value);
      }
    };
    startEl.addEventListener('change', updateHighlight);
    endEl.addEventListener('change', updateHighlight);
    // 初始高亮
    updateHighlight();
  }
}

async function savePeriodFromPanel() {
  const start = document.getElementById('panelStartDate').value;
  const end = document.getElementById('panelEndDate').value;
  const flow = document.getElementById('panelFlow').value;
  if (!start) return showError('请选择开始日期');

  const symptoms = [];
  document.querySelectorAll('#panelSymptoms .self-asse-tag.selected').forEach(t => {
    symptoms.push(t.dataset.tag);
  });

  const value = {
    start_date: start,
    end_date: end || start,
    flow: flow,
    symptoms: symptoms,
  };

  try {
    if (editingRecordId) {
      // 修改
      await updateCheckin(editingRecordId, { value, date: start });
      showSuccess('经期记录已更新');
    } else {
      // 新增
      await saveCheckin(currentMemberId, {
        type: 'menstrual',
        value: value,
        date: start,
      });
      showSuccess('经期记录已保存');
    }
    closePeriodPanel();
    clearDragHighlight();
    // 刷新日历
    renderCalendar(document.getElementById('periodContent'));
  } catch (e) {
    showError(e.message);
  }
}

async function deletePeriodFromPanel() {
  if (!editingRecordId) return;
  if (!confirm('确定删除这条经期记录吗？')) return;

  try {
    await deleteCheckin(editingRecordId);
    showSuccess('经期记录已删除');
    closePeriodPanel();
    clearDragHighlight();
    renderCalendar(document.getElementById('periodContent'));
  } catch (e) {
    showError(e.message);
  }
}

function closePeriodPanel() {
  const panel = document.getElementById('periodEditPanel');
  if (panel) {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
  dragStartDate = null;
  editingRecordId = null;
  clearDragHighlight();
  const hint = document.getElementById('dragHint');
  if (hint) hint.textContent = '';
}

function changeCalendarMonth(delta) {
  closePeriodPanel();
  dragStartDate = null;
  clearTimeout(longPressTimer);
  longPressTimer = null;
  calendarMonth += delta;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar(document.getElementById('periodContent'));
}

/* ---- BBT体温折线图 ---- */
function renderBBTChart(container) {
  container.innerHTML = `
    <div class="chart-container" style="height:260px;">
      <canvas id="bbtCanvas"></canvas>
    </div>
    <p style="margin-top:var(--space-sm);font-size:var(--font-size-xs);color:var(--text-light);text-align:center;">
      横轴: 周期天数 &nbsp;|&nbsp; 纵轴: 基础体温 (°C) &nbsp;|&nbsp; 虚线: 36.5°C 基准线
    </p>
  `;

  setTimeout(() => {
    const canvas = document.getElementById('bbtCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 260 * 2;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '260px';
    ctx.scale(2, 2);

    const w = rect.width;
    const h = 260;
    const padding = { top: 30, right: 30, bottom: 40, left: 50 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    // 模拟 BBT 数据
    const days = 28;
    const temps = [
      36.3, 36.4, 36.3, 36.2, 36.3, 36.4, 36.3, 36.2,
      36.3, 36.3, 36.2, 36.1, 36.2, 36.2, 36.6, 36.8,
      36.9, 37.0, 36.9, 37.0, 37.1, 37.0, 37.1, 37.0,
      36.9, 36.8, 36.7, 36.7
    ];
    const minT = 36.0;
    const maxT = 37.2;

    // 坐标轴
    ctx.strokeStyle = '#E8DEDE';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.lineTo(w - padding.right, h - padding.bottom);
    ctx.stroke();

    // 基准线 36.5
    const baseY = h - padding.bottom - ((36.5 - minT) / (maxT - minT)) * plotH;
    ctx.strokeStyle = '#FF6B6B';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, baseY);
    ctx.lineTo(w - padding.right, baseY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 标注
    ctx.fillStyle = '#FF6B6B';
    ctx.font = '10px sans-serif';
    ctx.fillText('36.5°C', w - padding.right - 40, baseY - 4);

    // Y轴刻度
    ctx.fillStyle = '#B5A5A5';
    ctx.font = '10px sans-serif';
    for (let t = 36.0; t <= 37.2; t += 0.2) {
      const y = h - padding.bottom - ((t - minT) / (maxT - minT)) * plotH;
      ctx.fillText(t.toFixed(1), padding.left - 35, y + 4);
      ctx.strokeStyle = '#F2EBEB';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    // 折线
    ctx.strokeStyle = '#9B7EBD';
    ctx.lineWidth = 2;
    ctx.beginPath();
    temps.forEach((t, i) => {
      const x = padding.left + (i / (days - 1)) * plotW;
      const y = h - padding.bottom - ((t - minT) / (maxT - minT)) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 数据点
    temps.forEach((t, i) => {
      const x = padding.left + (i / (days - 1)) * plotW;
      const y = h - padding.bottom - ((t - minT) / (maxT - minT)) * plotH;
      ctx.fillStyle = i >= 14 ? '#E8B4B8' : '#A8D8B9';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 排卵日标注
    ctx.fillStyle = '#2E7D32';
    ctx.font = 'bold 11px sans-serif';
    const ovX = padding.left + (14 / (days - 1)) * plotW;
    ctx.fillText('排卵日', ovX - 15, padding.top - 8);
    // 竖线
    ctx.strokeStyle = '#2E7D32';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(ovX, padding.top);
    ctx.lineTo(ovX, h - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // X轴刻度
    ctx.fillStyle = '#B5A5A5';
    ctx.font = '10px sans-serif';
    for (let i = 0; i < days; i += 4) {
      const x = padding.left + (i / (days - 1)) * plotW;
      ctx.fillText(`D${i + 1}`, x - 8, h - padding.bottom + 16);
    }
  }, 100);
}

/* ---- 经期记录 ---- */
function renderPeriodRecord(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">开始日期</label>
          <input type="date" class="form-input" id="periodStart">
        </div>
        <div class="form-group">
          <label class="form-label">结束日期</label>
          <input type="date" class="form-input" id="periodEnd">
        </div>
        <div class="form-group">
          <label class="form-label">经量</label>
          <select class="form-select" id="periodFlow">
            <option value="light">偏少</option>
            <option value="normal" selected>正常</option>
            <option value="heavy">偏多</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">症状</label>
          <div class="self-asse-tags" id="periodSymptoms">
            <span class="self-asse-tag" data-tag="cramp" onclick="this.classList.toggle('selected')">痛经</span>
            <span class="self-asse-tag" data-tag="headache" onclick="this.classList.toggle('selected')">头痛</span>
            <span class="self-asse-tag" data-tag="fatigue" onclick="this.classList.toggle('selected')">疲劳</span>
            <span class="self-asse-tag" data-tag="mood" onclick="this.classList.toggle('selected')">情绪波动</span>
            <span class="self-asse-tag" data-tag="bloating" onclick="this.classList.toggle('selected')">腹胀</span>
          </div>
        </div>
        <button class="btn btn-primary" onclick="savePeriodRecord()">保存记录</button>
      </div>
    </div>
  `;
}

async function savePeriodRecord() {
  const start = document.getElementById('periodStart').value;
  const end = document.getElementById('periodEnd').value;
  if (!start) return showError('请选择开始日期');

  // 收集症状
  const symptoms = [];
  document.querySelectorAll('#periodSymptoms .self-asse-tag.selected').forEach(t => {
    symptoms.push(t.dataset.tag);
  });

  try {
    await saveCheckin(currentMemberId, {
      type: 'menstrual',
      value: {
        start_date: start,
        end_date: end,
        flow: document.getElementById('periodFlow').value,
        symptoms: symptoms,
      },
      date: todayStr(),
    });
    showSuccess('经期记录已保存');
  } catch (e) {
    showError(e.message);
  }
}

/* ---- 运动打卡 ---- */
function toggleExercise(el, exerciseName) {
  el.classList.toggle('completed');
  const icon = el.querySelector('.checkin-icon');
  icon.innerHTML = el.classList.contains('completed') ? '&#10003;' : '';

  saveCheckin(currentMemberId, {
    type: 'exercise',
    value: { name: exerciseName, completed: el.classList.contains('completed') },
    date: todayStr(),
  }).catch(e => {
    el.classList.toggle('completed');
    icon.innerHTML = el.classList.contains('completed') ? '' : '&#10003;';
  });
}

/* ---- 周期运动推荐 ---- */
const phaseColors = {
  'menstrual': { bg: '#FFE0E0', text: '#D44', tag: '#月经期' },
  'follicular': { bg: '#E8F5E9', text: '#2E7D32', tag: '#卵泡期' },
  'ovulatory': { bg: '#E3F2FD', text: '#1565C0', tag: '#排卵期' },
  'luteal': { bg: '#FFF3E0', text: '#E65100', tag: '#黄体期' },
};

const intensityLabels = { 'low': '低强度', 'medium': '中强度', 'high': '高强度' };
const intensityClasses = { 'low': 'tag-green', 'medium': 'tag-blue', 'high': 'tag-red' };

async function loadExerciseRecommendations() {
  const container = document.getElementById('exerciseRecommendCard');
  if (!container) return;

  try {
    const data = await getExerciseRecommendations(currentMemberId);

    if (!data.has_data) {
      container.innerHTML = '';
      return;
    }

    const colors = phaseColors[data.phase_key] || phaseColors['luteal'];
    const dayInfo = data.phase_day ? ` · 第${data.phase_day}天` : '';

    // 推荐运动标签
    const recTags = data.recommendations.map(r => {
      const icls = intensityClasses[r.intensity] || 'tag-green';
      return `<div class="exercise-rec-item" onclick="quickCheckinExercise('${r.name}', '${r.duration}', '${r.icon}')">
        <span class="exercise-rec-name">${r.name}</span>
        <span class="exercise-rec-duration">${r.duration}</span>
        <span class="tag ${icls} exercise-rec-intensity">${intensityLabels[r.intensity]}</span>
      </div>`;
    }).join('');

    // 禁忌运动标签
    const avoidTags = data.avoid.length > 0
      ? data.avoid.map(a => `<span class="tag tag-gray exercise-avoid-tag">${a}</span>`).join('')
      : '<span style="color:var(--text-light);font-size:var(--font-size-xs);">本阶段无特别禁忌，尽情享受运动！</span>';

    container.innerHTML = `
      <div class="card" style="border-left: 4px solid ${colors.text};">
        <div class="card-header" style="background:${colors.bg};display:flex;align-items:center;justify-content:space-between;">
          <span>
            <span class="phase-badge" style="background:${colors.text};color:#fff;padding:2px 8px;border-radius:12px;font-size:var(--font-size-xs);margin-right:var(--space-sm);">${data.phase}${dayInfo}</span>
            周期运动推荐
          </span>
          <span style="font-size:var(--font-size-xs);color:var(--text-light);">${data.today}</span>
        </div>
        <div class="card-body">
          <!-- 推荐运动 -->
          <div class="rec-section">
            <div class="rec-section-title" style="color:${colors.text};">推荐运动（点击快速打卡）</div>
            <div class="exercise-rec-grid">${recTags}</div>
          </div>
          <!-- 禁忌运动 -->
          <div class="rec-section" style="margin-top:var(--space-md);">
            <div class="rec-section-title" style="color:var(--text-secondary);">不宜进行</div>
            <div class="exercise-avoid-list">${avoidTags}</div>
          </div>
          <!-- 小贴士 -->
          <div class="rec-tips" style="margin-top:var(--space-md);padding:var(--space-sm) var(--space-md);background:var(--bg);border-radius:var(--radius-sm);font-size:var(--font-size-sm);color:var(--text-secondary);">
            ${data.tips}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '';
    console.warn('Failed to load exercise recommendations:', e);
  }
}

async function quickCheckinExercise(name, duration, icon) {
  try {
    await saveCheckin(currentMemberId, {
      type: 'exercise',
      value: { name, duration, icon, recommended: true },
      date: todayStr(),
    });
    showSuccess(`已打卡：${name} ${duration}`);
  } catch (e) {
    showError(e.message);
  }
}

/* ---- 健康自评 ---- */
function toggleSelfAsse(el) {
  el.classList.toggle('selected');
}

async function saveSelfAsse() {
  const tags = [];
  document.querySelectorAll('#selfAsseTags .self-asse-tag.selected').forEach(t => {
    tags.push(t.dataset.tag);
  });
  const remarks = document.getElementById('selfRemarks').value.trim();

  try {
    await saveCheckin(currentMemberId, {
      type: 'health_self',
      value: {
        tags: tags,
        remarks: remarks,
      },
      date: todayStr(),
    });
    showSuccess('健康自评已保存');
  } catch (e) {
    showError(e.message);
  }
}

/* ---- 检查项目 ---- */
async function loadHealthChecks() {
  const container = document.getElementById('healthChecksList');
  if (!container) return;
  try {
    const data = await getHealthChecks(currentMemberId);
    const checks = data.checks || [];
    if (checks.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-text">暂无检查项目</div></div>';
      return;
    }
    // 按类型分组
    const groups = {};
    checks.forEach(c => {
      const g = c.category || '其他';
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    });

    const statusLabels = { pending: '进行中', booked: '已预约', done: '已完成', abnormal: '异常' };
    const statusColors = { pending: 'tag-yellow', booked: 'tag-blue', done: 'tag-green', abnormal: 'tag-red' };

    let html = '';
    for (const [group, items] of Object.entries(groups)) {
      html += `<div class="section-title" style="margin-top:var(--space-md);">${group}</div>`;
      html += '<div class="segment-list">';
      items.forEach(item => {
        const cls = statusColors[item.status] || 'tag-yellow';
        const due = item.due_date ? new Date(item.due_date) : null;
        const isUrgent = due && (due - new Date()) < 7 * 24 * 3600 * 1000 && item.status !== 'done';
        html += `
          <div class="segment-group">
            <div class="segment-group-header">
              <span>${item.name} ${isUrgent ? '<span style="color:#FF6B6B;">&#9888; 即将到期</span>' : ''}</span>
              <span class="tag ${cls}">${statusLabels[item.status] || item.status}</span>
            </div>
            <div class="segment-group-body">
              <span class="text-muted" style="font-size:var(--font-size-xs);">${item.due_date ? '截止: ' + formatDate(item.due_date) : ''}</span>
              ${item.notes ? `<p style="margin-top:4px;font-size:var(--font-size-sm);">${item.notes}</p>` : ''}
            </div>
          </div>`;
      });
      html += '</div>';
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-text">${e.message}</div></div>`;
  }
}

/* ---- 报告时间线 ---- */
async function loadHealthReports() {
  const container = document.getElementById('reportsTimeline');
  if (!container) return;
  try {
    const data = await getHealthReports(currentMemberId);
    const reports = data.reports || [];
    if (reports.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-text">暂无报告</div></div>';
      return;
    }
    container.innerHTML = '<div class="timeline">' + reports.map(r => `
      <div class="timeline-item">
        <div class="tl-date">${formatDate(r.date || r.created_at)}</div>
        <div class="tl-title">${r.title || r.name}</div>
        ${r.description ? `<div class="tl-desc">${r.description}</div>` : ''}
        ${r.file_path ? `<a href="${r.file_path}" style="font-size:var(--font-size-xs);">查看报告</a>` : ''}
      </div>
    `).join('') + '</div>';
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-text">${e.message}</div></div>`;
  }
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
