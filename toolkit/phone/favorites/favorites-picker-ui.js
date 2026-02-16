/**
 * 收藏选择器
 * @module phone/favorites/favorites-picker-ui
 * 
 * @description
 * 从收藏中选择内容发送到聊天
 */

import logger from '../../../logger.js';
import { loadFavorites, searchFavorites } from './favorites-data.js';
import { showCustomPopupWithData } from '../utils/popup-helper.js';
import { showWarningToast } from '../ui-components/toast-notification.js';
import { getThumbnailUrl } from '../../../../../../../script.js';

/**
 * 显示收藏选择器
 * 
 * @async
 * @returns {Promise<Object|null>} 选中的收藏项，取消返回null
 */
export async function showFavoritesPicker() {
  logger.debug('phone','[FavoritesPicker] 显示收藏选择器');

  // 加载收藏列表
  const favorites = loadFavorites();

  if (favorites.length === 0) {
    showWarningToast('暂无收藏');
    return null;
  }

  // 创建选择器HTML
  const pickerHTML = createPickerHTML(favorites);

  // 显示弹窗
  const result = await showCustomPopupWithData(
    '选择收藏',
    pickerHTML,
    {
      buttons: [
        { text: '取消', value: null, class: 'phone-popup-cancel' },
        { text: '发送', value: 'send', class: 'phone-popup-ok' }
      ],
      width: '90%',
      onShow: (overlayElement) => {
        bindPickerEvents(overlayElement);
      },
      beforeClose: (buttonValue, overlayElement) => {
        if (buttonValue === 'send') {
          // 获取选中的收藏项
          const selected = overlayElement.querySelector('.favorites-picker-item.selected');
          if (!selected) {
            showWarningToast('请选择一条收藏');
            return 'prevent'; // 阻止关闭
          }

          const favoriteId = selected.dataset.favoriteId;
          const favorite = favorites.find(f => f.id === favoriteId);

          if (!favorite) {
            showWarningToast('收藏不存在');
            return null;
          }

          logger.info('phone','[FavoritesPicker] 选中收藏:', favorite.id);
          return favorite;
        }

        return null;
      }
    }
  );

  // 检查是否阻止关闭
  if (result === 'prevent') {
    // 不关闭弹窗，返回showFavoritesPicker重新监听
    return showFavoritesPicker();
  }

  return result;
}

/**
 * 创建选择器HTML
 * 
 * @param {Array} favorites - 收藏列表
 * @returns {string} HTML字符串
 */
function createPickerHTML(favorites) {
  return `
    <div class="favorites-picker-container">
      <!-- 搜索栏 -->
      <div class="favorites-picker-search">
        <i class="fa-solid fa-search"></i>
        <input type="text" class="favorites-picker-search-input" placeholder="搜索收藏内容">
        <button class="favorites-picker-search-clear"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <!-- 收藏列表 -->
      <div class="favorites-picker-list">
        ${favorites.map(fav => createPickerItemHTML(fav)).join('')}
      </div>
    </div>
  `;
}

/**
 * 创建单个收藏项HTML
 * 
 * @param {Object} favorite - 收藏对象
 * @returns {string} HTML字符串
 */
function createPickerItemHTML(favorite) {
  // 获取头像
  let avatarHTML = '<i class="fa-solid fa-user-circle"></i>';
  if (favorite.contactAvatar) {
    const avatarUrl = getThumbnailUrl('avatar', favorite.contactAvatar);
    avatarHTML = `<img src="${avatarUrl}" alt="${favorite.contactName}">`;
  }

  // 获取类型图标
  const typeIcon = getTypeIcon(favorite.type);

  // 处理内容预览（根据类型格式化）
  let contentPreview = '';
  if (favorite.type === 'emoji') {
    contentPreview = `[表情] ${favorite.emojiName || '未知表情'}`;
  } else if (favorite.type === 'image') {
    contentPreview = `[图片] ${favorite.description || '无描述'}`;
  } else if (favorite.type === 'transfer') {
    contentPreview = favorite.message
      ? `[转账] ${favorite.amount}元 ${truncateText(favorite.message, 30)}`
      : `[转账] ${favorite.amount}元`;
  } else if (favorite.type === 'quote') {
    contentPreview = `[引用] ${truncateText(favorite.replyContent || '', 50)}`;
  } else {
    contentPreview = truncateText(favorite.content, 50);
  }

  // 格式化时间
  const timeStr = formatTimestamp(favorite.timestamp);

  return `
    <div class="favorites-picker-item" data-favorite-id="${favorite.id}">
      <div class="favorites-picker-item-avatar">
        ${avatarHTML}
      </div>
      <div class="favorites-picker-item-info">
        <div class="favorites-picker-item-header">
          <span class="favorites-picker-item-name">${favorite.contactName}</span>
          <span class="favorites-picker-item-time">${timeStr}</span>
        </div>
        <div class="favorites-picker-item-content">
          <i class="fa-solid ${typeIcon}"></i>
          <span>${contentPreview}</span>
        </div>
      </div>
      <div class="favorites-picker-item-check">
        <i class="fa-solid fa-circle-check"></i>
      </div>
    </div>
  `;
}

/**
 * 绑定选择器事件
 * 
 * @param {HTMLElement} overlay - 弹窗元素
 */
function bindPickerEvents(overlay) {
  const searchInput = overlay.querySelector('.favorites-picker-search-input');
  const clearBtn = overlay.querySelector('.favorites-picker-search-clear');
  const listContainer = /** @type {HTMLElement} */ (overlay.querySelector('.favorites-picker-list'));

  // 搜索功能
  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const keyword = target.value.trim();

    // 显示/隐藏清除按钮
    const clearButton = /** @type {HTMLElement} */ (clearBtn);
    clearButton.style.display = keyword ? 'flex' : 'none';

    // 防抖搜索
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (listContainer) {
        handlePickerSearch(keyword, listContainer);
      }
    }, 300);
  });

  // 清除搜索
  clearBtn.addEventListener('click', () => {
    const inputElement = /** @type {HTMLInputElement} */ (searchInput);
    inputElement.value = '';
    const clearButton = /** @type {HTMLElement} */ (clearBtn);
    clearButton.style.display = 'none';
    if (listContainer) {
      handlePickerSearch('', listContainer);
    }
  });

  // 点击选择
  listContainer.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const item = target.closest('.favorites-picker-item');
    if (item) {
      // 取消其他选中
      listContainer.querySelectorAll('.favorites-picker-item').forEach(el => {
        el.classList.remove('selected');
      });

      // 选中当前项
      item.classList.add('selected');
    }
  });
}

/**
 * 处理选择器搜索
 * 
 * @param {string} keyword - 搜索关键词
 * @param {HTMLElement} listContainer - 列表容器
 */
function handlePickerSearch(keyword, listContainer) {
  logger.debug('phone','[FavoritesPicker] 搜索:', keyword || '(全部)');

  // 获取搜索结果
  const favorites = keyword ? searchFavorites(keyword) : loadFavorites();

  // 清空列表
  listContainer.innerHTML = '';

  // 空状态
  if (favorites.length === 0) {
    listContainer.innerHTML = `
      <div class="favorites-picker-empty">
        <i class="fa-solid fa-star"></i>
        <p>未找到匹配的收藏</p>
      </div>
    `;
    return;
  }

  // 重新渲染
  favorites.forEach(fav => {
    const itemHTML = createPickerItemHTML(fav);
    const temp = document.createElement('div');
    temp.innerHTML = itemHTML;
    const firstChild = /** @type {HTMLElement} */ (temp.firstElementChild);
    listContainer.appendChild(firstChild);
  });
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

