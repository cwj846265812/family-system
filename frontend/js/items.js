/* ============================================================
   家庭管理系统 - 物品模块 JS
   ============================================================ */

let currentMemberId = null;
let allMembers = [];
let itemsData = [];
let currentRiskFilter = 'all';
let currentStatusFilter = 'all';

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

  // 加载物品
  try {
    const data = await getItems(currentMemberId);
    itemsData = data.items || [];
  } catch (e) {
    itemsData = [];
    showError(e.message);
  }

  renderPage();
}

function renderPage() {
  const container = document.getElementById('itemsApp');

  const riskLabels = { safe: '安全', caution: '谨慎', avoid: '避免', danger: '禁用' };
  const statusLabels = { active: '在役', idle: '闲置', pending: '待处理', discarded: '已丢弃' };

  container.innerHTML = `
    <!-- 新增按钮 -->
    <div class="flex-between mb-md">
      <h2 class="page-title" style="margin-bottom:0;">物品管理</h2>
      <button class="btn btn-primary" onclick="openItemModal()">+ 新增物品</button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar" id="riskFilter">
      <span class="filter-chip active" data-risk="all">全部风险</span>
      <span class="filter-chip tag-green" data-risk="safe" style="border:none;">安全</span>
      <span class="filter-chip tag-yellow" data-risk="caution" style="border:none;">谨慎</span>
      <span class="filter-chip tag-orange" data-risk="avoid" style="border:none;">避免</span>
      <span class="filter-chip tag-red" data-risk="danger" style="border:none;">禁用</span>
    </div>
    <div class="filter-bar" id="statusFilter">
      <span class="filter-chip active" data-status="all">全部状态</span>
      <span class="filter-chip" data-status="active">在役</span>
      <span class="filter-chip" data-status="idle">闲置</span>
      <span class="filter-chip" data-status="pending">待处理</span>
      <span class="filter-chip" data-status="discarded">已丢弃</span>
    </div>

    <!-- 物品列表 -->
    <div class="items-grid" id="itemsGrid"></div>
  `;

  bindFilters();
  renderItems();
}

function bindFilters() {
  document.querySelectorAll('#riskFilter .filter-chip').forEach(chip => {
    chip.addEventListener('click', function () {
      document.querySelectorAll('#riskFilter .filter-chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      currentRiskFilter = this.dataset.risk;
      renderItems();
    });
  });

  document.querySelectorAll('#statusFilter .filter-chip').forEach(chip => {
    chip.addEventListener('click', function () {
      document.querySelectorAll('#statusFilter .filter-chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      currentStatusFilter = this.dataset.status;
      renderItems();
    });
  });
}

function getFilteredItems() {
  return itemsData.filter(item => {
    if (currentRiskFilter !== 'all' && item.risk_level !== currentRiskFilter) return false;
    if (currentStatusFilter !== 'all' && item.status !== currentStatusFilter) return false;
    return true;
  });
}

function renderItems() {
  const grid = document.getElementById('itemsGrid');
  if (!grid) return;
  const filtered = getFilteredItems();

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">&#9741;</div><div class="empty-text">暂无物品</div></div>';
    return;
  }

  const riskLabels = { safe: '安全', caution: '谨慎', avoid: '避免', danger: '禁用' };
  const riskTagClasses = { safe: 'tag-green', caution: 'tag-yellow', avoid: 'tag-orange', danger: 'tag-red' };
  const statusLabels = { active: '在役', idle: '闲置', pending: '待处理', discarded: '已丢弃' };
  const now = new Date();

  grid.innerHTML = filtered.map(item => {
    const riskCls = 'risk-' + (item.risk || 'safe');
    const riskLabel = riskLabels[item.risk] || item.risk || '未设置';
    const riskTagCls = riskTagClasses[item.risk] || 'tag-green';

    // 到期预警：30天内
    let expiryHtml = '';
    let isUrgent = false;
    if (item.expiry_date) {
      const expiry = new Date(item.expiry_date);
      const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      isUrgent = diffDays <= 30 && diffDays >= 0;
      expiryHtml = `<div class="item-expiry ${isUrgent ? 'urgent' : ''}">
        到期: ${formatDate(item.expiry_date)} ${isUrgent ? ' (即将到期)' : ''}
      </div>`;
    }

    return `
      <div class="item-card ${riskCls}" onclick="openItemModal(${JSON.stringify(item).replace(/"/g, '&quot;')})">
        <div class="item-name">${item.name}</div>
        <div class="item-meta">
          ${item.category ? `<span class="tag tag-purple">${item.category}</span>` : ''}
          <span class="tag ${riskTagCls}">${riskLabel}</span>
          <span class="badge">${statusLabels[item.status] || item.status || '未知'}</span>
        </div>
        ${expiryHtml}
        <button class="btn-icon" style="position:absolute;top:12px;right:12px;" 
          onclick="event.stopPropagation(); deleteItemConfirm('${item.id}')" title="删除">&#10005;</button>
      </div>
    `;
  }).join('');
}

/* ---- 新增/编辑物品弹窗 ---- */
function openItemModal(existingItem) {
  const isEdit = !!existingItem;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'itemModal';

  const item = existingItem || {};
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span>${isEdit ? '编辑物品' : '新增物品'}</span>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">名称</label>
          <input class="form-input" id="itemName" value="${item.name || ''}" placeholder="物品名称">
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <select class="form-select" id="itemCategory">
            <option value="">请选择</option>
            <option value="食品" ${item.category === '食品' ? 'selected' : ''}>食品</option>
            <option value="药品" ${item.category === '药品' ? 'selected' : ''}>药品</option>
            <option value="化妆品" ${item.category === '化妆品' ? 'selected' : ''}>化妆品</option>
            <option value="清洁用品" ${item.category === '清洁用品' ? 'selected' : ''}>清洁用品</option>
            <option value="衣物" ${item.category === '衣物' ? 'selected' : ''}>衣物</option>
            <option value="母婴用品" ${item.category === '母婴用品' ? 'selected' : ''}>母婴用品</option>
            <option value="其他" ${item.category === '其他' ? 'selected' : ''}>其他</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">风险等级</label>
          <select class="form-select" id="itemRisk">
            <option value="safe" ${item.risk_level === 'safe' ? 'selected' : ''}>安全</option>
            <option value="caution" ${item.risk_level === 'caution' ? 'selected' : ''}>谨慎</option>
            <option value="avoid" ${item.risk_level === 'avoid' ? 'selected' : ''}>避免</option>
            <option value="danger" ${item.risk_level === 'danger' ? 'selected' : ''}>禁用</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">状态</label>
          <select class="form-select" id="itemStatus">
            <option value="active" ${item.status === 'active' ? 'selected' : ''}>在役</option>
            <option value="idle" ${item.status === 'idle' ? 'selected' : ''}>闲置</option>
            <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>待处理</option>
            <option value="discarded" ${item.status === 'discarded' ? 'selected' : ''}>已丢弃</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">到期日期</label>
          <input type="date" class="form-input" id="itemExpiry" value="${item.expiry_date || ''}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline btn-sm" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary btn-sm" onclick="saveItemData('${item.id || ''}')">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function saveItemData(itemId) {
  const data = {
    name: document.getElementById('itemName').value.trim(),
    category: document.getElementById('itemCategory').value,
    risk_level: document.getElementById('itemRisk').value,
    status: document.getElementById('itemStatus').value,
    expiry_date: document.getElementById('itemExpiry').value,
  };

  if (!data.name) return showError('请输入物品名称');

  try {
    if (itemId) {
      data.id = itemId;
    }
    await saveItem(currentMemberId, data);
    document.getElementById('itemModal').remove();
    showSuccess(itemId ? '物品已更新' : '物品已添加');

    // 重新加载
    const result = await getItems(currentMemberId);
    itemsData = result.items || [];
    renderItems();
  } catch (e) {
    showError(e.message);
  }
}

function deleteItemConfirm(itemId) {
  if (!confirm('确定要删除这个物品吗？')) return;
  deleteItem(itemId).then(() => {
    itemsData = itemsData.filter(i => i.id != itemId);
    renderItems();
    showSuccess('物品已删除');
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
