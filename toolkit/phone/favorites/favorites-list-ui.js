/**
 * 收藏列表页面
 * @module phone/favorites/favorites-list-ui
 * 
 * @description
 * 显示所有收藏的消息，支持搜索、删除
 */

import logger from '../../../logger.js';
import { loadFavorites, deleteFavorite, searchFavorites } from './favorites-data.js';
import { showConfirmPopup } from '../utils/popup-helper.js';
import { showSuccessToast, showWarningToast } from '../ui-components/toast-notification.js';
import { getThumbnailUrl } from '../../../../../../../script.js';

/**
 * 渲染收藏列表页面
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderFavoritesList() {
  logger.info('[FavoritesList] 开始渲染收藏列表页面');

  const fragment = document.createDocumentFragment();

  // 创建页面容器
  const container = document.createElement('div');
  container.className = 'favorites-list-wrapper';

  // 1. 顶部栏
  container.appendChild(createTopBar());

  // 2. 搜索栏
  container.appendChild(createSearchBar());

  // 3. 收藏列表容器
  const listContainer = document.createElement('div');
  listContainer.className = 'favorites-list-content';
  container.appendChild(listContainer);

  // 4. 加载收藏列表
  await refreshFavoritesList(listContainer);

  fragment.appendChild(container);

  logger.info('[FavoritesList] 收藏列表页面渲染完成');
  return fragment;
}

/**
 * 创建顶部栏
 * 
 * @returns {HTMLElement} 顶部栏元素
 */
function createTopBar() {
  const topBar = document.createElement('div');
  topBar.className = 'favorites-list-topbar';

  topBar.innerHTML = `
    <button class="favorites-list-back-btn">
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <div class="favorites-list-title">我的收藏</div>
    <button class="favorites-list-clear-btn">清空</button>
  `;

  // 返回按钮
  const backBtn = topBar.querySelector('.favorites-list-back-btn');
  backBtn.addEventListener('click', handleBack);

  // 清空按钮
  const clearBtn = topBar.querySelector('.favorites-list-clear-btn');
  clearBtn.addEventListener('click', handleClearAll);

  return topBar;
}

/**
 * 创建搜索栏
 * 
 * @returns {HTMLElement} 搜索栏元素
 */
function createSearchBar() {
  const searchBar = document.createElement('div');
  searchBar.className = 'favorites-list-search-bar';

  searchBar.innerHTML = `
    <i class="fa-solid fa-search"></i>
    <input type="text" class="favorites-list-search-input" placeholder="搜索收藏内容">
    <button class="favorites-list-search-clear"><i class="fa-solid fa-xmark"></i></button>
  `;

  const input = searchBar.querySelector('.favorites-list-search-input');
  const clearBtn = searchBar.querySelector('.favorites-list-search-clear');

  // 输入搜索
  let searchTimer;
  input.addEventListener('input', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const keyword = target.value.trim();

    // 显示/隐藏清除按钮
    const clearButton = /** @type {HTMLElement} */ (clearBtn);
    clearButton.style.display = keyword ? 'flex' : 'none';

    // 防抖搜索（300ms）
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      handleSearch(keyword);
    }, 300);
  });

  // 清除搜索
  clearBtn.addEventListener('click', () => {
    const inputElement = /** @type {HTMLInputElement} */ (input);
    inputElement.value = '';
    const clearButton = /** @type {HTMLElement} */ (clearBtn);
    clearButton.style.display = 'none';
    handleSearch('');
  });

  return searchBar;
}

/**
 * 刷新收藏列表
 * 
 * @async
 * @param {HTMLElement} listContainer - 列表容器元素
 * @param {string} [keyword=''] - 搜索关键词
 */
async function refreshFavoritesList(listContainer, keyword = '') {
  logger.debug('[FavoritesList] 刷新收藏列表, keyword:', keyword || '(无)');

  // 获取收藏列表（搜索或全部）
  const favorites = keyword ? searchFavorites(keyword) : loadFavorites();

  // 清空容器
  listContainer.innerHTML = '';

  // 空状态
  if (favorites.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'favorites-list-empty';
    empty.innerHTML = `
      <i class="fa-solid fa-star"></i>
      <p>${keyword ? '未找到匹配的收藏' : '暂无收藏'}</p>
    `;
    listContainer.appendChild(empty);
    return;
  }

  // 渲染收藏项
  favorites.forEach(favorite => {
    const item = createFavoriteItem(favorite);
    listContainer.appendChild(item);
  });

  logger.debug('[FavoritesList] 收藏列表已刷新，共', favorites.length, '条');
}

/**
 * 创建单个收藏项
 * 
 * @param {Object} favorite - 收藏对象
 * @returns {HTMLElement} 收藏项元素
 */
function createFavoriteItem(favorite) {
  const item = document.createElement('div');
  item.className = 'favorites-list-item';
  item.dataset.favoriteId = favorite.id;

  // 获取头像
  let avatarHTML = '<i class="fa-solid fa-user-circle"></i>';
  if (favorite.contactAvatar) {
    const avatarUrl = getThumbnailUrl('avatar', favorite.contactAvatar);
    avatarHTML = `<img src="${avatarUrl}" alt="${favorite.contactName}">`;
  }

  // 获取类型图标
  const typeIcon = getTypeIcon(favorite.type);

  // 格式化时间
  const timeStr = formatTimestamp(favorite.timestamp);

  // 处理内容预览（根据类型格式化）
  let contentPreview = '';
  if (favorite.type === 'emoji') {
    contentPreview = `[表情] ${favorite.emojiName || '未知表情'}`;
  } else if (favorite.type === 'image') {
    contentPreview = `[图片] ${favorite.description || '无描述'}`;
  } else if (favorite.type === 'transfer') {
    contentPreview = favorite.message
      ? `[转账] ${favorite.amount}元 ${favorite.message}`
      : `[转账] ${favorite.amount}元`;
  } else if (favorite.type === 'quote') {
    contentPreview = `[引用] ${favorite.replyContent || ''}`;
  } else {
    contentPreview = truncateText(favorite.content, 100);
  }

  item.innerHTML = `
    <div class="favorites-list-item-avatar">
      ${avatarHTML}
    </div>
    <div class="favorites-list-item-info">
      <div class="favorites-list-item-header">
        <span class="favorites-list-item-name">${favorite.contactName}</span>
        <span class="favorites-list-item-time">${timeStr}</span>
      </div>
      <div class="favorites-list-item-content">
        <i class="fa-solid ${typeIcon}"></i>
        <span>${contentPreview}</span>
      </div>
    </div>
    <button class="favorites-list-item-delete">
      <i class="fa-solid fa-trash"></i>
    </button>
  `;

  // 删除按钮
  const deleteBtn = item.querySelector('.favorites-list-item-delete');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteItem(favorite.id);
  });

  // 点击收藏项（TODO: 后期可以展开查看详情）
  item.addEventListener('click', () => {
    logger.debug('[FavoritesList] 点击收藏项:', favorite.id);
    // 暂时不做任何操作
  });

  return item;
}

/**
 * 获取消息类型对应的图标
 * 
 * @param {string} type - 消息类型
 * @returns {string} Font Awesome 图标类名
 */
function getTypeIcon(type) {
  const iconMap = {
    text: 'fa-comment',
    emoji: 'fa-face-smile',
    image: 'fa-image',
    video: 'fa-video',
    link: 'fa-link',
    sticker: 'fa-face-smile',
    voice: 'fa-microphone',
    transfer: 'fa-money-bill',
    quote: 'fa-quote-left'
  };
  return iconMap[type] || 'fa-comment';
}

/**
 * 格式化时间戳
 * 
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();

  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (isToday) {
    return timeStr;
  } else if (isYesterday) {
    return `昨天 ${timeStr}`;
  } else {
    const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
    return `${monthDay} ${timeStr}`;
  }
}

/**
 * 截断文本
 * 
 * @param {string} text - 原文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 处理返回
 */
function handleBack() {
  logger.debug('[FavoritesList] 点击返回');

  const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlayElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'favorites-list');
    });
  }
}

/**
 * 处理搜索
 * 
 * @param {string} keyword - 搜索关键词
 */
function handleSearch(keyword) {
  logger.debug('[FavoritesList] 搜索:', keyword || '(全部)');

  const listContainer = /** @type {HTMLElement} */ (document.querySelector('.favorites-list-content'));
  if (listContainer) {
    refreshFavoritesList(listContainer, keyword);
  }
}

/**
 * 处理删除单个收藏
 * 
 * @async
 * @param {string} favoriteId - 收藏ID
 */
async function handleDeleteItem(favoriteId) {
  logger.debug('[FavoritesList] 删除收藏:', favoriteId);

  // 二次确认
  const confirmed = await showConfirmPopup(
    '删除收藏',
    '确定要删除这条收藏吗？',
    { danger: true, okButton: '删除' }
  );

  if (!confirmed) return;

  // 删除
  const success = deleteFavorite(favoriteId);

  if (success) {
    showSuccessToast('已删除收藏');

    // 刷新列表
    const listContainer = /** @type {HTMLElement} */ (document.querySelector('.favorites-list-content'));
    const searchInput = /** @type {HTMLInputElement} */ (document.querySelector('.favorites-list-search-input'));
    const keyword = searchInput?.value.trim() || '';

    if (listContainer) {
      refreshFavoritesList(listContainer, keyword);
    }
  } else {
    showWarningToast('删除失败');
  }
}

/**
 * 处理清空所有收藏
 * 
 * @async
 */
async function handleClearAll() {
  logger.debug('[FavoritesList] 点击清空所有收藏');

  // 检查是否有收藏
  const favorites = loadFavorites();
  if (favorites.length === 0) {
    showWarningToast('暂无收藏');
    return;
  }

  // 二次确认
  const confirmed = await showConfirmPopup(
    '清空收藏',
    `确定要清空所有收藏吗？（共${favorites.length}条）`,
    { danger: true, okButton: '清空' }
  );

  if (!confirmed) return;

  // 清空（通过逐个删除，而不是clearAllFavorites，避免破坏数据结构）
  const { clearAllFavorites } = await import('./favorites-data.js');
  clearAllFavorites();

  showSuccessToast('已清空收藏');

  // 刷新列表
  const listContainer = /** @type {HTMLElement} */ (document.querySelector('.favorites-list-content'));
  if (listContainer) {
    refreshFavoritesList(listContainer);
  }

  // 清除搜索框
  const searchInput = /** @type {HTMLInputElement} */ (document.querySelector('.favorites-list-search-input'));
  if (searchInput) {
    searchInput.value = '';
  }

  const clearBtn = /** @type {HTMLElement} */ (document.querySelector('.favorites-list-search-clear'));
  if (clearBtn) {
    clearBtn.style.display = 'none';
  }
}

