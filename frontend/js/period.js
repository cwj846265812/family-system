/* ============================================================
   家庭管理系统 - 经期管理模块 JS
   参考 Flo / Clue / 美柚 交互设计
   ============================================================ */

let currentMemberId = null;
let currentYear, currentMonth;
let periodRecords = [];         // [{id, date, value: {start_date, end_date, flow, symptoms}, ...}]
let periodDaySet = new Set();   // "YYYY-MM-DD" of all period days
let editingRecordId = null;     // 当前编辑的记录 ID
let editingFlow = 'normal';

(function () {
  const token = localStorage.getItem('family_token');
  if (!token) { window.location.href = 'index.html'; return; }
})();

function getMemberId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('member_id') || localStorage.getItem('family_member_id');
}

async function init() {
  currentMemberId = getMemberId();
  if (!currentMemberId) { window.location.href = 'index.html'; return; }

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;

  await loadPeriodData();
  renderAll();
}

/* ---- 数据加载 ---- */
async function loadPeriodData() {
  try {
    const data = await getHealthCheckins(currentMemberId, 'menstrual');
    periodRecords = data.checkins || [];

    // 构建经期日集合（展开每个记录的开始~结束）
    periodDaySet.clear();
    periodRecords.forEach(r => {
      const val = r.value || {};
      const start = val.start_date || r.date;
      const end = val.end_date || start;
      if (start) addDateRange(periodDaySet, start, end);
    });
  } catch (e) {
    periodRecords = [];
    periodDaySet.clear();
  }
}

function addDateRange(set, startStr, endStr) {
  if (!startStr) return;
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : start;
  const cur = new Date(start);
  while (cur <= end) {
    set.add(formatDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
}

/* ---- 概览计算 ---- */
function getLatestPeriod() {
  let latest = null;
  periodRecords.forEach(r => {
    const val = r.value || {};
    const d = val.start_date || r.date;
    if (d && (!latest || d > latest)) latest = d;
  });
  return latest;
}

function getCycleLength() {
  if (periodRecords.length < 2) return null;
  const starts = [];
  periodRecords.forEach(r => {
    const val = r.value || {};
    const d = val.start_date || r.date;
    if (d) starts.push(d);
  });
  starts.sort();
  const diffs = [];
  for (let i = 1; i < starts.length; i++) {
    const diff = Math.round((new Date(starts[i]) - new Date(starts[i-1])) / 86400000);
    if (diff >= 20 && diff <= 45) diffs.push(diff);
  }
  if (diffs.length === 0) return null;
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

function getAvgPeriodLength() {
  const lengths = [];
  periodRecords.forEach(r => {
    const val = r.value || {};
    const s = val.start_date || r.date;
    const e = val.end_date || s;
    const len = Math.round((new Date(e) - new Date(s)) / 86400000) + 1;
    if (len >= 2 && len <= 10) lengths.push(len);
  });
  if (lengths.length === 0) return null;
  return Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
}

function predictNextPeriod() {
  const latest = getLatestPeriod();
  const cycleLen = getCycleLength();
  if (!latest || !cycleLen) return null;
  const next = new Date(latest);
  next.setDate(next.getDate() + cycleLen);
  return next;
}

function daysUntil(nextDate) {
  if (!nextDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((nextDate - today) / 86400000);
}

/* ---- 渲染全部 ---- */
function renderAll() {
  renderOverview();
  renderCalendar();
  renderHistory();
}

function renderOverview() {
  const latest = getLatestPeriod();
  const cycleLen = getCycleLength();
  const periodLen = getAvgPeriodLength();
  const next = predictNextPeriod();
  const until = daysUntil(next);

  document.getElementById('statLastPeriod').textContent = latest ? formatShortDate(latest) : '--';
  document.getElementById('statCycleLen').textContent = cycleLen ? `${cycleLen}天` : '--';
  document.getElementById('statPeriodLen').textContent = periodLen ? `${periodLen}天` : '--';

  if (until !== null) {
    const label = until > 0 ? `${until}天` : (until === 0 ? '今天' : `${Math.abs(until)}天前`);
    document.getElementById('statNextPeriod').textContent = label;
  } else {
    document.getElementById('statNextPeriod').textContent = '--';
  }
}

/* ---- 日历渲染 ---- */
function renderCalendar() {
  document.getElementById('monthTitle').textContent = `${currentYear}年${currentMonth}月`;

  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const prevDaysInMonth = new Date(currentYear, currentMonth - 1, 0).getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  const today = new Date();
  const todayStr = formatDateStr(today);
  const next = predictNextPeriod();
  const nextStr = next ? formatDateStr(next) : null;

  // 计算排卵日和易孕期（基于最近一次经期）
  const latest = getLatestPeriod();
  let ovulationStr = null;
  let fertileStart = null, fertileEnd = null;
  if (latest) {
    const ovDay = new Date(latest);
    ovDay.setDate(ovDay.getDate() + 14); // 简易推算
    ovulationStr = formatDateStr(ovDay);
    fertileStart = new Date(ovDay);
    fertileStart.setDate(fertileStart.getDate() - 3);
    fertileEnd = new Date(ovDay);
    fertileEnd.setDate(fertileEnd.getDate() + 1);
  }

  // 预测经期范围（持续 avg period length）
  const predPeriodLen = getAvgPeriodLength() || 5;
  const predSet = new Set();
  if (next) {
    for (let i = 0; i < predPeriodLen; i++) {
      const d = new Date(next);
      d.setDate(d.getDate() + i);
      predSet.add(formatDateStr(d));
    }
  }

  let html = '<table><thead><tr>';
  weekdays.forEach(d => html += `<th>${d}</th>`);
  html += '</tr></thead><tbody>';

  const totalCells = firstDay + daysInMonth;
  const totalRows = Math.ceil(totalCells / 7);
  let cellCount = 0;

  for (let r = 0; r < totalRows; r++) {
    html += '<tr>';
    for (let c = 0; c < 7; c++) {
      cellCount++;
      if (cellCount <= firstDay) {
        // 上月残日
        const d = prevDaysInMonth - firstDay + cellCount;
        const ds = formatDateStr(new Date(currentYear, currentMonth - 2, d));
        html += `<td><span class="cal-day other-month">${d}</span></td>`;
      } else if (cellCount > firstDay + daysInMonth) {
        // 下月残日
        const d = cellCount - firstDay - daysInMonth;
        html += `<td><span class="cal-day other-month">${d}</span></td>`;
      } else {
        const d = cellCount - firstDay;
        const ds = formatDateStr(new Date(currentYear, currentMonth - 1, d));
        let cls = 'cal-day';
        if (ds === todayStr) cls += ' today';
        if (periodDaySet.has(ds)) cls += ' period-day';
        else if (predSet.has(ds)) cls += ' predicted';
        else if (ds === ovulationStr) cls += ' ovulation';
        else if (fertileStart && fertileEnd) {
          if (ds >= formatDateStr(fertileStart) && ds <= formatDateStr(fertileEnd)) cls += ' fertile';
        }
        html += `<td><span class="${cls}" onclick="togglePeriodDay('${ds}')">${d}</span></td>`;
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  document.getElementById('periodCalendar').innerHTML = html;
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  renderCalendar();
}

/* ---- 点击日历日期：快速 toggle ---- */
async function togglePeriodDay(dateStr) {
  // 检查是否已是经期日
  if (periodDaySet.has(dateStr)) {
    // 移除：找到包含此日期的记录
    const found = periodRecords.find(r => {
      const val = r.value || {};
      const s = val.start_date || r.date;
      const e = val.end_date || s;
      return dateStr >= s && dateStr <= e;
    });
    if (found) {
      if (!confirm(`是否删除该经期记录 (${found.value?.start_date || found.date})？`)) return;
      try {
        await deleteCheckin(found.id);
        showSuccess('已删除');
        await loadPeriodData();
        renderAll();
      } catch (e) { showError(e.message); }
    }
    return;
  }

  // 添加：打开弹窗，预填日期
  editingRecordId = null;
  editingFlow = 'normal';
  document.getElementById('editPeriodStart').value = dateStr;
  document.getElementById('editPeriodEnd').value = dateStr;
  document.getElementById('periodModalTitle').textContent = '添加经期记录';
  document.getElementById('btnSavePeriod').textContent = '保存';

  // 重置症状和流量
  document.querySelectorAll('#editSymptoms .symptom-tag').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#editFlowSelector .flow-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.flow === 'normal');
  });

  document.getElementById('periodModal').style.display = 'flex';
}

/* ---- 历史列表 ---- */
function renderHistory() {
  const container = document.getElementById('periodHistory');
  if (!container) return;

  if (periodRecords.length === 0) {
    container.innerHTML = `<div class="period-empty"><div class="empty-icon">&#128203;</div><div class="empty-text">暂无经期记录</div><div style="color:var(--text-light);font-size:var(--font-size-xs);margin-top:8px;">点击日历日期或"添加记录"开始</div></div>`;
    return;
  }

  // 按 start_date 降序
  const sorted = [...periodRecords].sort((a, b) => {
    const va = a.value || {}, vb = b.value || {};
    const sa = va.start_date || a.date, sb = vb.start_date || b.date;
    return sb.localeCompare(sa);
  });

  let html = '';
  sorted.forEach(r => {
    const val = r.value || {};
    const start = val.start_date || r.date;
    const end = val.end_date || start;
    const duration = end !== start ? Math.round((new Date(end) - new Date(start)) / 86400000) + 1 : 1;
    const flow = val.flow || 'normal';
    const symptoms = val.symptoms || [];

    const symptomsHtml = symptoms.length > 0
      ? `<div class="period-symptoms">${symptoms.map(s => `<span class="mini-symptom">${symptomLabel(s)}</span>`).join('')}</div>`
      : '';

    html += `
      <div class="history-item">
        <div class="period-range">
          <div class="period-dates">${formatShortDate(start)} ~ ${formatShortDate(end)}</div>
          <div class="period-duration">${duration}天 · <span class="period-flow-badge ${flow}">${flowLabel(flow)}</span></div>
          ${symptomsHtml}
        </div>
        <div class="history-actions">
          <button onclick='editPeriodRecord(${JSON.stringify(r).replace(/'/g, "&#39;")})' title="编辑">&#9998;</button>
          <button class="delete" onclick='deletePeriodRecord(${r.id})' title="删除">&#10005;</button>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

/* ---- 新增记录弹窗 ---- */
function openAddPeriodModal() {
  editingRecordId = null;
  editingFlow = 'normal';
  const today = formatDateStr(new Date());
  document.getElementById('editPeriodStart').value = today;
  document.getElementById('editPeriodEnd').value = today;
  document.getElementById('periodModalTitle').textContent = '添加经期记录';
  document.getElementById('btnSavePeriod').textContent = '保存';
  document.querySelectorAll('#editSymptoms .symptom-tag').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#editFlowSelector .flow-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.flow === 'normal');
  });
  document.getElementById('periodModal').style.display = 'flex';
}

/* ---- 编辑记录 ---- */
function editPeriodRecord(record) {
  editingRecordId = record.id;
  const val = record.value || {};
  document.getElementById('editPeriodStart').value = val.start_date || record.date;
  document.getElementById('editPeriodEnd').value = val.end_date || val.start_date || record.date;
  document.getElementById('periodModalTitle').textContent = '编辑经期记录';
  document.getElementById('btnSavePeriod').textContent = '更新';

  // flow
  const flow = val.flow || 'normal';
  editingFlow = flow;
  document.querySelectorAll('#editFlowSelector .flow-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.flow === flow);
  });

  // symptoms
  const symptoms = val.symptoms || [];
  document.querySelectorAll('#editSymptoms .symptom-tag').forEach(t => {
    t.classList.toggle('active', symptoms.includes(t.dataset.tag));
  });

  document.getElementById('periodModal').style.display = 'flex';
}

/* ---- 删除记录 ---- */
async function deletePeriodRecord(id) {
  if (!confirm('确定删除这条经期记录吗？')) return;
  try {
    await deleteCheckin(id);
    showSuccess('已删除');
    await loadPeriodData();
    renderAll();
  } catch (e) { showError(e.message); }
}

/* ---- 弹窗交互 ---- */
function closePeriodModal() {
  document.getElementById('periodModal').style.display = 'none';
}

function selectFlow(flow) {
  editingFlow = flow;
  document.querySelectorAll('#editFlowSelector .flow-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.flow === flow);
  });
}

function toggleSymptom(el) {
  el.classList.toggle('active');
}

/* ---- 保存记录 ---- */
async function savePeriodRecord() {
  const start = document.getElementById('editPeriodStart').value;
  const end = document.getElementById('editPeriodEnd').value;
  if (!start) return showError('请选择开始日期');

  const symptoms = [];
  document.querySelectorAll('#editSymptoms .symptom-tag.active').forEach(t => {
    symptoms.push(t.dataset.tag);
  });

  const valueData = {
    start_date: start,
    end_date: end || start,
    flow: editingFlow,
    symptoms: symptoms
  };

  try {
    if (editingRecordId) {
      await updateCheckin(editingRecordId, { value: valueData, date: start });
      showSuccess('记录已更新');
    } else {
      await saveCheckin(currentMemberId, {
        type: 'menstrual',
        date: start,
        value: valueData
      });
      showSuccess('记录已保存');
    }
    closePeriodModal();
    await loadPeriodData();
    renderAll();
  } catch (e) {
    showError(e.message);
  }
}

/* ---- 工具函数 ---- */
function formatDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function flowLabel(flow) {
  const map = { light: '偏少', normal: '正常', heavy: '偏多' };
  return map[flow] || flow;
}

function symptomLabel(tag) {
  const map = {
    cramp: '腹痛', backpain: '腰痛', breast: '乳房胀痛', headache: '头痛',
    fatigue: '疲劳', mood: '情绪波动', nausea: '恶心', insomnia: '失眠',
    bloating: '腹胀', acne: '长痘'
  };
  return map[tag] || tag;
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
