/* ============================================================
   家庭管理系统 - 文档模块 JS
   ============================================================ */

let currentMemberId = null;
let allMembers = [];
let allDocuments = [];
let activeCategory = 'all';

const CATEGORIES = [
  { key: 'report', name: '体检报告', icon: '📋' },
  { key: 'checkup', name: '检查单', icon: '🔬' },
  { key: 'cert', name: '证件扫描', icon: '🪪' },
  { key: 'insurance', name: '保险单', icon: '🛡️' },
  { key: 'other', name: '其他', icon: '📄' }
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.key, c.name]));

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

  await loadDocuments();
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

async function loadDocuments() {
  const container = document.getElementById('documentsApp');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> 加载中...</div>';

  try {
    const data = await apiFetch(`/api/documents?member_id=${currentMemberId}`);
    allDocuments = data.documents || [];
    renderUI();
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-text">${e.message}</div></div>`;
  }
}

function renderUI() {
  const container = document.getElementById('documentsApp');

  // 分类计数
  const counts = {};
  CATEGORIES.forEach(c => { counts[c.key] = 0; });
  allDocuments.forEach(d => {
    if (counts[d.category] !== undefined) counts[d.category]++;
  });

  container.innerHTML = `
    <!-- 分类卡片 -->
    <div class="doc-category-grid">
      <div class="doc-category-card ${activeCategory === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">
        <div class="doc-category-icon">📁</div>
        <div class="doc-category-name">全部文档</div>
        <div class="doc-category-count">${allDocuments.length} 份</div>
      </div>
      ${CATEGORIES.map(c => `
      <div class="doc-category-card ${activeCategory === c.key ? 'active' : ''}" onclick="filterByCategory('${c.key}')">
        <div class="doc-category-icon">${c.icon}</div>
        <div class="doc-category-name">${c.name}</div>
        <div class="doc-category-count">${counts[c.key]} 份</div>
      </div>
      `).join('')}
    </div>

    <!-- 上传区域 -->
    <div class="upload-zone" onclick="simulateUpload()">
      <div class="upload-icon">&#128194;</div>
      <div style="font-weight:600;">点击上传文档</div>
      <div style="font-size:var(--font-size-xs);color:var(--text-light);margin-top:var(--space-xs);">支持 PDF、JPG、PNG 格式</div>
    </div>

    <!-- 添加文档表单 -->
    <div class="card" style="margin-bottom:var(--space-lg);">
      <div class="card-header">添加文档记录</div>
      <div class="card-body">
        <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="flex:2;min-width:150px;margin-bottom:0;">
            <label class="form-label">文档名称</label>
            <input type="text" id="docName" class="form-input" placeholder="如：2024年度体检报告">
          </div>
          <div class="form-group" style="flex:1;min-width:120px;margin-bottom:0;">
            <label class="form-label">分类</label>
            <select id="docCategory" class="form-select">
              ${CATEGORIES.map(c => `<option value="${c.key}">${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:1;min-width:120px;margin-bottom:0;">
            <label class="form-label">日期</label>
            <input type="date" id="docDate" class="form-input" value="${todayStr()}">
          </div>
          <button class="btn btn-primary" onclick="addDocument()" style="height:42px;">添加记录</button>
        </div>
      </div>
    </div>

    <!-- 文档列表 -->
    <div class="card">
      <div class="card-header">
        <span>文档列表</span>
        <span style="font-size:var(--font-size-xs);color:var(--text-light);">${getFilteredDocs().length} 条</span>
      </div>
      <div class="card-body" style="padding:0;" id="docList"></div>
    </div>
  `;

  renderDocList();
}

function getFilteredDocs() {
  if (activeCategory === 'all') return allDocuments;
  return allDocuments.filter(d => d.category === activeCategory);
}

function filterByCategory(cat) {
  activeCategory = cat;
  renderUI();
}

function renderDocList() {
  const list = document.getElementById('docList');
  if (!list) return;
  const docs = getFilteredDocs();

  if (docs.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-text">暂无文档</div></div>';
    return;
  }

  list.innerHTML = docs.map(d => `
    <div class="doc-list-item">
      <div style="display:flex;align-items:center;gap:var(--space-md);">
        <span class="tag tag-purple">${CATEGORY_LABELS[d.category] || d.category}</span>
        <span style="font-weight:500;">${d.name}</span>
        ${d.notes ? `<span style="color:var(--text-light);font-size:var(--font-size-xs);">${d.notes}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-lg);">
        <span style="font-size:var(--font-size-xs);color:var(--text-light);">${d.doc_date || '-'}</span>
        <button class="btn btn-outline btn-sm" onclick="deleteDocument(${d.id})" style="padding:2px 8px;font-size:11px;">删除</button>
      </div>
    </div>
  `).join('');
}

async function addDocument() {
  const name = document.getElementById('docName').value.trim();
  const category = document.getElementById('docCategory').value;
  const docDate = document.getElementById('docDate').value;
  const filePath = document.getElementById('docFilePath') ? document.getElementById('docFilePath').value : '';

  if (!name) {
    showError('请输入文档名称');
    return;
  }

  try {
    await apiFetch('/api/documents', {
      method: 'POST',
      body: JSON.stringify({
        member_id: parseInt(currentMemberId),
        name, category, doc_date: docDate || null,
        file_path: filePath || '',
        notes: ''
      })
    });
    showSuccess('文档记录已添加');
    loadDocuments();
  } catch (e) {
    showError(e.message);
  }
}

async function deleteDocument(id) {
  try {
    await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
    showSuccess('文档记录已删除');
    loadDocuments();
  } catch (e) {
    showError(e.message);
  }
}

function simulateUpload() {
  // 模拟上传：提示本地路径
  const name = prompt('请输入文档名称（模拟上传）：');
  if (!name) return;

  const doc = {
    member_id: parseInt(currentMemberId),
    name: name,
    category: 'other',
    doc_date: todayStr(),
    file_path: `C:/Users/Uploads/${name}`,
    notes: '（模拟上传，需手动指定文件路径）'
  };

  apiFetch('/api/documents', {
    method: 'POST',
    body: JSON.stringify(doc)
  }).then(() => {
    showSuccess('文档记录已添加（模拟路径）');
    loadDocuments();
  }).catch(e => {
    showError(e.message);
  });
}

init();
