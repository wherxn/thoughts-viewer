/**
 * 想法记录浏览页面 - 前端交互逻辑
 * 功能：数据加载、关键词搜索、三级分类联动筛选、收藏标注筛选、卡片渲染、附件下载
 */

// ===== 全局状态 =====
let allRecords = []; // 所有记录（从飞书加载）
let currentFilters = {
  search: '',
  category1: '',
  category2: '',
  category3: '',
  favorite: '',
};
let isLoading = false;

// ===== DOM 元素引用 =====
const elements = {
  // 登录相关
  loginView: document.getElementById('loginView'),
  mainView: document.getElementById('mainView'),
  userOpenId: document.getElementById('userOpenId'),
  loginError: document.getElementById('loginError'),
  // 主内容
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  filterCategory1: document.getElementById('filterCategory1'),
  filterCategory2: document.getElementById('filterCategory2'),
  filterCategory3: document.getElementById('filterCategory3'),
  filterFavorite: document.getElementById('filterFavorite'),
  refreshBtn: document.getElementById('refreshBtn'),
  recordCount: document.getElementById('recordCount'),
  filterHint: document.getElementById('filterHint'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  errorMessage: document.getElementById('errorMessage'),
  retryBtn: document.getElementById('retryBtn'),
  emptyState: document.getElementById('emptyState'),
  cardList: document.getElementById('cardList'),
};

// ===== 工具函数 =====

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 转义 HTML 特殊字符，防止 XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 高亮搜索关键词
 */
function highlightKeyword(text, keyword) {
  if (!keyword || !text) return escapeHtml(text);
  const escapedText = escapeHtml(text);
  const escapedKeyword = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedKeyword})`, 'gi');
  return escapedText.replace(regex, '<mark class="highlight">$1</mark>');
}

// ===== 登录检测 =====

/**
 * 检查当前登录状态
 * 调用 /api/auth/me，已登录显示主内容，未登录显示登录页
 */
async function checkLoginStatus() {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (result.success && result.loggedIn && result.user) {
      // 已登录：显示主内容，显示用户 open_id
      elements.loginView.style.display = 'none';
      elements.mainView.style.display = 'block';
      if (elements.userOpenId) {
        elements.userOpenId.textContent = result.user.open_id;
        elements.userOpenId.title = result.user.open_id;
      }
      // 登录成功后加载数据
      loadRecords();
      return true;
    } else {
      // 未登录：显示登录页
      elements.loginView.style.display = 'flex';
      elements.mainView.style.display = 'none';
      return false;
    }
  } catch (error) {
    console.error('检查登录状态失败:', error);
    // 检查失败也显示登录页
    elements.loginView.style.display = 'flex';
    elements.mainView.style.display = 'none';
    return false;
  }
}

/**
 * 显示登录错误信息
 */
function showLoginError(message) {
  if (elements.loginError) {
    elements.loginError.textContent = message;
    elements.loginError.style.display = 'block';
  }
}

// ===== 数据加载 =====

/**
 * 从后端 API 加载所有记录
 */
async function loadRecords() {
  if (isLoading) return;
  isLoading = true;

  showState('loading');

  try {
    const response = await fetch('/api/get-records', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    // 401 未登录：跳转到登录页
    if (response.status === 401) {
      elements.loginView.style.display = 'flex';
      elements.mainView.style.display = 'none';
      showLoginError('登录已过期，请重新登录');
      isLoading = false;
      return;
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || '加载失败');
    }

    allRecords = result.data || [];
    console.log(`成功加载 ${allRecords.length} 条记录`);

    // 初始化筛选器选项
    initFilterOptions();

    // 应用筛选并渲染
    applyFiltersAndRender();

    showState('content');
  } catch (error) {
    console.error('加载记录失败:', error);
    elements.errorMessage.textContent = error.message || '加载失败，请检查网络连接或应用配置';
    showState('error');
  } finally {
    isLoading = false;
  }
}

// ===== 筛选器管理 =====

/**
 * 初始化所有筛选器的选项（基于全部数据）
 */
function initFilterOptions() {
  updateSelectOptions(elements.filterCategory1, getUniqueValues(allRecords, 'category1'), '全部一级');
  updateSelectOptions(elements.filterCategory2, getUniqueValues(allRecords, 'category2'), '全部二级');
  updateSelectOptions(elements.filterCategory3, getUniqueValues(allRecords, 'category3'), '全部三级');
  updateSelectOptions(elements.filterFavorite, getUniqueValues(allRecords, 'favorite'), '全部标注');
}

/**
 * 从记录数组中提取某个字段的去重值（按出现顺序）
 */
function getUniqueValues(records, field) {
  const seen = new Set();
  const result = [];
  for (const record of records) {
    const value = record[field];
    if (value && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

/**
 * 更新下拉框选项，保留当前已选中的值（如果还在选项列表中）
 */
function updateSelectOptions(selectElement, options, defaultLabel) {
  const currentValue = selectElement.value;

  // 清空现有选项
  selectElement.innerHTML = '';

  // 添加默认选项
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = defaultLabel;
  selectElement.appendChild(defaultOption);

  // 添加新选项
  for (const value of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  }

  // 恢复之前选中的值（如果还存在）
  if (currentValue && options.includes(currentValue)) {
    selectElement.value = currentValue;
  } else {
    selectElement.value = '';
  }
}

/**
 * 根据当前筛选条件过滤记录
 */
function filterRecords() {
  const { search, category1, category2, category3, favorite } = currentFilters;
  const searchLower = search.toLowerCase().trim();

  return allRecords.filter((record) => {
    // 分类筛选
    if (category1 && record.category1 !== category1) return false;
    if (category2 && record.category2 !== category2) return false;
    if (category3 && record.category3 !== category3) return false;
    if (favorite && record.favorite !== favorite) return false;

    // 关键词搜索（搜索标题、内容、三个分类）
    if (searchLower) {
      const searchFields = [
        record.title,
        record.content,
        record.category1,
        record.category2,
        record.category3,
        record.favorite,
      ];
      const matched = searchFields.some((field) =>
        field && field.toLowerCase().includes(searchLower)
      );
      if (!matched) return false;
    }

    return true;
  });
}

/**
 * 应用筛选条件并更新 UI（筛选器选项 + 卡片列表 + 计数）
 */
function applyFiltersAndRender() {
  const filteredRecords = filterRecords();

  // 动态更新筛选器选项（基于当前过滤后的结果）
  // 注意：更新选项时要保留其他筛选器的当前选中值
  updateSelectOptions(elements.filterCategory1, getUniqueValues(filteredRecords, 'category1'), '全部一级');
  updateSelectOptions(elements.filterCategory2, getUniqueValues(filteredRecords, 'category2'), '全部二级');
  updateSelectOptions(elements.filterCategory3, getUniqueValues(filteredRecords, 'category3'), '全部三级');
  updateSelectOptions(elements.filterFavorite, getUniqueValues(filteredRecords, 'favorite'), '全部标注');

  // 恢复当前筛选值（因为 updateSelectOptions 可能会重置）
  elements.filterCategory1.value = currentFilters.category1;
  elements.filterCategory2.value = currentFilters.category2;
  elements.filterCategory3.value = currentFilters.category3;
  elements.filterFavorite.value = currentFilters.favorite;

  // 渲染卡片
  renderCards(filteredRecords);

  // 更新计数
  updateStats(filteredRecords.length);
}

// ===== 渲染 =====

/**
 * 渲染卡片列表
 */
function renderCards(records) {
  if (records.length === 0) {
    elements.cardList.innerHTML = '';
    showState('empty');
    return;
  }

  showState('content');

  const { search } = currentFilters;
  const html = records.map((record) => renderCard(record, search)).join('');
  elements.cardList.innerHTML = html;

  // 绑定附件点击事件
  bindAttachmentEvents();
}

/**
 * 渲染单张卡片
 */
function renderCard(record, keyword) {
  const tagsHtml = [];

  if (record.category1) {
    tagsHtml.push(`<span class="tag tag-cat1">${escapeHtml(record.category1)}</span>`);
  }
  if (record.category2) {
    tagsHtml.push(`<span class="tag tag-cat2">${escapeHtml(record.category2)}</span>`);
  }
  if (record.category3) {
    tagsHtml.push(`<span class="tag tag-cat3">${escapeHtml(record.category3)}</span>`);
  }
  if (record.favorite) {
    tagsHtml.push(`<span class="tag tag-favorite">${escapeHtml(record.favorite)}</span>`);
  }

  // 附件 HTML
  let attachmentsHtml = '';
  if (record.attachments && record.attachments.length > 0) {
    attachmentsHtml = '<div class="card-attachments">';
    record.attachments.forEach((file, index) => {
      attachmentsHtml += `
        <div class="attachment-item" data-file-token="${escapeHtml(file.file_token)}" data-file-name="${escapeHtml(file.name)}">
          <svg class="attachment-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <path d="M14 2v6h6"></path>
          </svg>
          <span class="attachment-name">${escapeHtml(file.name)}</span>
          <span class="attachment-size">${formatFileSize(file.size)}</span>
        </div>
      `;
    });
    attachmentsHtml += '</div>';
  }

  return `
    <div class="card" data-record-id="${escapeHtml(record.record_id)}">
      <div class="card-header">
        <div class="card-tags">${tagsHtml.join('')}</div>
        <div class="card-meta">
          <span class="card-date">${escapeHtml(record.created_time)}</span>
        </div>
      </div>
      <div class="card-title">${highlightKeyword(record.title, keyword)}</div>
      <div class="card-content">${highlightKeyword(record.content, keyword)}</div>
      ${attachmentsHtml}
    </div>
  `;
}

/**
 * 更新统计信息
 */
function updateStats(count) {
  elements.recordCount.innerHTML = `共 <span>${count}</span> 条记录`;

  // 显示当前筛选条件提示
  const activeFilters = [];
  if (currentFilters.search) activeFilters.push(`关键词"${currentFilters.search}"`);
  if (currentFilters.category1) activeFilters.push(currentFilters.category1);
  if (currentFilters.category2) activeFilters.push(currentFilters.category2);
  if (currentFilters.category3) activeFilters.push(currentFilters.category3);
  if (currentFilters.favorite) activeFilters.push(currentFilters.favorite);

  elements.filterHint.textContent = activeFilters.length > 0
    ? `（已筛选：${activeFilters.join(' / ')}）`
    : '';
}

// ===== 状态切换 =====

function showState(state) {
  elements.loadingState.style.display = state === 'loading' ? 'flex' : 'none';
  elements.errorState.style.display = state === 'error' ? 'flex' : 'none';
  elements.emptyState.style.display = state === 'empty' ? 'flex' : 'none';
  elements.cardList.style.display = state === 'content' ? 'flex' : 'none';
}

// ===== 事件绑定 =====

/**
 * 绑定附件点击事件（获取临时下载链接并下载）
 */
function bindAttachmentEvents() {
  document.querySelectorAll('.attachment-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const fileToken = item.dataset.fileToken;
      const fileName = item.dataset.fileName;

      if (!fileToken) return;

      // 显示加载状态
      const originalContent = item.innerHTML;
      item.innerHTML = '<span style="font-size:13px;color:#8f959e;">正在获取下载链接...</span>';

      try {
        const response = await fetch('/api/get-attachment-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_tokens: [fileToken] }),
        });

        const result = await response.json();

        if (!result.success || !result.data || result.data.length === 0) {
          throw new Error(result.error || '获取下载链接失败');
        }

        const tmpUrl = result.data[0].tmp_download_url;

        // 触发下载
        const link = document.createElement('a');
        link.href = tmpUrl;
        link.download = fileName || 'download';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 恢复原始内容
        item.innerHTML = originalContent;
      } catch (error) {
        console.error('下载附件失败:', error);
        item.innerHTML = `<span style="font-size:13px;color:#f53f3f;">下载失败：${error.message}</span>`;
        setTimeout(() => {
          item.innerHTML = originalContent;
        }, 3000);
      }
    });
  });
}

/**
 * 初始化所有事件监听
 */
function initEventListeners() {
  // 搜索框输入（防抖）
  let searchTimer;
  elements.searchInput.addEventListener('input', (e) => {
    const value = e.target.value;
    elements.clearSearchBtn.style.display = value ? 'flex' : 'none';

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentFilters.search = value;
      applyFiltersAndRender();
    }, 200);
  });

  // 清除搜索
  elements.clearSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.clearSearchBtn.style.display = 'none';
    currentFilters.search = '';
    applyFiltersAndRender();
  });

  // 筛选器变化
  elements.filterCategory1.addEventListener('change', (e) => {
    currentFilters.category1 = e.target.value;
    applyFiltersAndRender();
  });

  elements.filterCategory2.addEventListener('change', (e) => {
    currentFilters.category2 = e.target.value;
    applyFiltersAndRender();
  });

  elements.filterCategory3.addEventListener('change', (e) => {
    currentFilters.category3 = e.target.value;
    applyFiltersAndRender();
  });

  elements.filterFavorite.addEventListener('change', (e) => {
    currentFilters.favorite = e.target.value;
    applyFiltersAndRender();
  });

  // 刷新按钮
  elements.refreshBtn.addEventListener('click', () => {
    loadRecords();
  });

  // 重试按钮
  elements.retryBtn.addEventListener('click', () => {
    loadRecords();
  });
}

// ===== 启动 =====

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  checkLoginStatus(); // 先检查登录状态，已登录才加载数据
});
