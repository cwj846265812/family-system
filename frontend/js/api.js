/* ============================================================
   家庭管理系统 - API 封装
   ============================================================ */

const API_BASE = 'http://localhost:5000';

let authToken = localStorage.getItem('family_token') || '';

function setToken(token) {
  authToken = token;
  localStorage.setItem('family_token', token);
}

function clearToken() {
  authToken = '';
  localStorage.removeItem('family_token');
  localStorage.removeItem('family_member_id');
}

async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new Error(err.error || err.message || `请求失败 (${res.status})`);
    }
    return await res.json();
  } catch (e) {
    if (e.message === 'Failed to fetch') {
      throw new Error('无法连接到服务器，请确认后端已启动');
    }
    throw e;
  }
}

/* ---- 成员 ---- */
async function getMembers() {
  return apiFetch('/api/members');
}

async function login(name, password) {
  const data = await apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ name, password }),
  });
  if (data.token) {
    setToken(data.token);
    localStorage.setItem('family_member_id', data.member_id);
  }
  return data;
}

async function createMember(memberData) {
  return apiFetch('/api/members', {
    method: 'POST',
    body: JSON.stringify(memberData),
  });
}

async function updateMember(memberId, memberData) {
  return apiFetch(`/api/members/${memberId}`, {
    method: 'PUT',
    body: JSON.stringify(memberData),
  });
}

/* ---- 仪表板 ---- */
async function getDashboard(memberId) {
  return apiFetch(`/api/dashboard/${memberId}`);
}

/* ---- 打卡 ---- */
async function getHealthCheckins(memberId, type, date) {
  let url = `/api/health/checkins/${memberId}`;
  const params = [];
  if (type) params.push(`type=${encodeURIComponent(type)}`);
  if (date) params.push(`date=${encodeURIComponent(date)}`);
  if (params.length) url += '?' + params.join('&');
  return apiFetch(url);
}

async function saveCheckin(memberId, data) {
  return apiFetch(`/api/health/checkins`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId, ...data }),
  });
}

async function updateCheckin(checkinId, data) {
  return apiFetch(`/api/health/checkins/item/${checkinId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function deleteCheckin(checkinId) {
  return apiFetch(`/api/health/checkins/item/${checkinId}`, {
    method: 'DELETE',
  });
}

/* ---- 健康检查 ---- */
async function getHealthChecks(memberId) {
  return apiFetch(`/api/health/checks/${memberId}`);
}

/* ---- 运动推荐 ---- */
async function getExerciseRecommendations(memberId) {
  return apiFetch(`/api/health/exercise/recommendations/${memberId}`);
}

async function saveHealthCheck(memberId, data) {
  return apiFetch(`/api/health/checks`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId, ...data }),
  });
}

/* ---- 健康报告 ---- */
async function getHealthReports(memberId) {
  return apiFetch(`/api/health/reports/${memberId}`);
}

/* ---- 备孕计划 ---- */
async function getPregnancyPlan(memberId) {
  return apiFetch(`/api/pregnancy/plan/${memberId}`);
}

async function updatePregnancyPlan(memberId, data) {
  return apiFetch(`/api/pregnancy/plan/${memberId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

async function getPregnancyTodos(memberId) {
  return apiFetch(`/api/pregnancy/todos/${memberId}`);
}

async function confirmPregnancy(memberId, confirmedDate) {
  return apiFetch(`/api/pregnancy/confirm`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId, confirmed_date: confirmedDate }),
  });
}

/* ---- 物品 ---- */
async function getItems(memberId, filters = {}) {
  const params = new URLSearchParams();
  if (filters.risk) params.set('risk', filters.risk);
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiFetch(`/api/items/${memberId}${qs ? '?' + qs : ''}`);
}

async function saveItem(memberId, data) {
  return apiFetch(`/api/items`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId, ...data }),
  });
}

async function deleteItem(itemId) {
  return apiFetch(`/api/items/${itemId}`, {
    method: 'DELETE',
  });
}

/* ---- 通用错误弹窗 ---- */
function showError(message) {
  const toast = document.createElement('div');
  toast.className = 'toast error';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function showSuccess(message) {
  const toast = document.createElement('div');
  toast.className = 'toast success';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2500);
}

/* ---- 日期工具 ---- */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr() {
  return formatDate(new Date());
}
