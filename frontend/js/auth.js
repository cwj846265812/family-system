/* ============================================================
   家庭管理系统 - 认证检查
   ============================================================ */

(function () {
  // 不需要登录的页面列表
  const publicPages = ['index.html', ''];

  const currentPage = window.location.pathname.split('/').pop() || '';

  if (publicPages.includes(currentPage)) return;

  const token = localStorage.getItem('family_token');
  if (!token) {
    window.location.href = 'index.html';
  }
})();
