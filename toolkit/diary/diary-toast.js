/**
 * iOS风格通知
 * 
 * @description
 * 在酒馆顶部显示iOS风格的轻量级通知提示。
 * 支持自动消失、点击关闭、多种类型（成功/警告/错误）。
 * 
 * @module DiaryToast
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import logger from '../../logger.js';
import { getContext } from '../../../../../extensions.js';
import { getThumbnailUrl } from '../../../../../../script.js';

// ========================================
// [CORE] 通知工具类
// ========================================

/**
 * 显示iOS风格通知
 * 
 * @description
 * 在页面顶部显示通知，3秒后自动消失。
 * 
 * @param {string} message - 通知消息
 * @param {string} [type='success'] - 类型 'success' | 'warning' | 'error' | 'info'
 * @param {number} [duration=3000] - 显示时长（毫秒）
 * 
 * @example
 * showDiaryToast('日记已完成', 'success');
 * showDiaryToast('等待评论中...', 'info', 5000);
 */
export function showDiaryToast(message, type = 'success', duration = 3000) {
  // 获取角色头像
  const ctx = getContext();
  const character = ctx.characters?.[ctx.characterId];
  const avatarUrl = character ? getThumbnailUrl('avatar', character.avatar) : null;

  // 创建通知元素
  const toast = document.createElement('div');
  toast.className = `diary-toast diary-toast-${type}`;

  // 图标映射（iOS SF Symbols 风格）
  const icons = {
    success: 'fa-check-circle',
    warning: 'fa-exclamation-triangle',
    error: 'fa-xmark-circle',
    info: 'fa-info-circle'
  };

  // iOS 系统颜色映射
  const colors = {
    success: '#34C759',  // iOS Green
    warning: '#FF9500',  // iOS Orange
    error: '#FF3B30',    // iOS Red
    info: '#007AFF'      // iOS Blue
  };

  // 背景色映射（更淡的版本）
  const bgColors = {
    success: 'rgba(52, 199, 89, 0.1)',
    warning: 'rgba(255, 149, 0, 0.1)',
    error: 'rgba(255, 59, 48, 0.1)',
    info: 'rgba(0, 122, 255, 0.1)'
  };

  // 构建HTML（优先显示角色头像，无关闭按钮）
  const iconHTML = avatarUrl
    ? `<div class="diary-toast-avatar"><img src="${avatarUrl}" alt="avatar" /></div>`
    : `<div class="diary-toast-icon"><i class="fa-solid ${icons[type]}"></i></div>`;

  toast.innerHTML = `
        ${iconHTML}
        <div class="diary-toast-content">
            <div class="diary-toast-message">${message}</div>
            <div class="diary-toast-time">Now</div>
        </div>
    `;

  // 移动端检测
  const isMobile = window.innerWidth <= 768;

  // 样式（更iOS）
  Object.assign(toast.style, {
    position: 'fixed',
    top: '-120px',
    left: isMobile ? '20px' : '50%',
    right: isMobile ? '20px' : 'auto',
    transform: isMobile ? 'none' : 'translateX(-50%)',
    zIndex: '10000',

    display: 'flex',
    alignItems: 'center',
    gap: '10px',

    padding: '12px 16px 12px 12px',
    minWidth: isMobile ? 'auto' : '320px',
    maxWidth: isMobile ? 'none' : '420px',
    width: isMobile ? 'calc(100vw - 40px)' : 'auto',

    background: 'rgba(255, 255, 255, 0.98)',
    backdropFilter: 'blur(30px) saturate(180%)',
    WebkitBackdropFilter: 'blur(30px) saturate(180%)',

    borderRadius: '16px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06)',

    transition: 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    cursor: 'pointer',

    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '15px',
    fontWeight: '400',
    color: '#1a1a1a'
  });

  // 内容区样式
  const contentArea = toast.querySelector('.diary-toast-content');
  Object.assign(contentArea.style, {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px'
  });

  // 消息样式
  const messageEl = toast.querySelector('.diary-toast-message');
  Object.assign(messageEl.style, {
    flex: '1',
    lineHeight: '1.4',
    letterSpacing: '-0.2px'
  });

  // 时间样式
  const timeEl = toast.querySelector('.diary-toast-time');
  Object.assign(timeEl.style, {
    fontSize: '13px',
    color: '#8e8e93',
    fontWeight: '400',
    flexShrink: '0'
  });

  // 图标样式
  const iconContainer = toast.querySelector('.diary-toast-icon');
  if (iconContainer) {
    Object.assign(iconContainer.style, {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: bgColors[type],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0'
    });

    const iconEl = iconContainer.querySelector('i');
    if (iconEl) {
      iconEl.style.color = colors[type];
      iconEl.style.fontSize = '22px';
    }
  }

  // 头像样式
  const avatarContainer = toast.querySelector('.diary-toast-avatar');
  if (avatarContainer) {
    Object.assign(avatarContainer.style, {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: '0'
    });

    const avatarEl = avatarContainer.querySelector('img');
    if (avatarEl) {
      Object.assign(avatarEl.style, {
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      });
    }
  }

  // 悬停效果（PC端）
  if (!isMobile) {
    toast.addEventListener('mouseenter', () => {
      toast.style.transform = 'translateX(-50%) scale(1.02)';
      toast.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.12), 0 3px 10px rgba(0, 0, 0, 0.08)';
    });

    toast.addEventListener('mouseleave', () => {
      toast.style.transform = 'translateX(-50%) scale(1)';
      toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06)';
    });
  }

  // 添加到页面
  document.body.appendChild(toast);

  // 滑入动画 + 微弹效果
  requestAnimationFrame(() => {
    setTimeout(() => {
      toast.style.top = '20px';

      // 添加微弹效果（仅PC端）
      if (!isMobile) {
        setTimeout(() => {
          toast.style.transform = 'translateX(-50%) scale(1.02)';
          setTimeout(() => {
            toast.style.transform = 'translateX(-50%) scale(1)';
          }, 150);
        }, 300);
      }
    }, 10);
  });

  // 自动消失
  const autoHideTimer = setTimeout(() => {
    dismissToast(toast);
  }, duration);

  // 点击关闭
  toast.addEventListener('click', () => {
    clearTimeout(autoHideTimer);
    dismissToast(toast);
  });

  logger.debug('[DiaryToast] 显示通知:', message);
}

/**
 * 关闭通知
 * 
 * @description
 * 播放滑出动画后移除通知元素
 * 
 * @param {HTMLElement} toast - 通知元素
 */
function dismissToast(toast) {
  const isMobile = window.innerWidth <= 768;

  if (!isMobile) {
    toast.style.transform = 'translateX(-50%) scale(0.95)';
  }
  toast.style.opacity = '0';
  toast.style.top = '-120px';

  setTimeout(() => {
    toast.remove();
  }, 500);
}

/**
 * 快捷方法：成功通知
 * 
 * @param {string} message - 消息
 */
export function showSuccessToast(message) {
  showDiaryToast(message, 'success');
}

/**
 * 快捷方法：警告通知
 * 
 * @param {string} message - 消息
 */
export function showWarningToast(message) {
  showDiaryToast(message, 'warning');
}

/**
 * 快捷方法：错误通知
 * 
 * @param {string} message - 消息
 */
export function showErrorToast(message) {
  showDiaryToast(message, 'error', 5000);
}

/**
 * 快捷方法：信息通知
 * 
 * @param {string} message - 消息
 */
export function showInfoToast(message) {
  showDiaryToast(message, 'info');
}

/**
 * 显示日记回复通知（iOS锁屏风格）
 * 
 * @description
 * 显示更丰富的通知，包含头像、名字、内容预览
 * 
 * @param {Object} options - 通知选项
 * @param {string} options.characterName - 角色名称
 * @param {string} [options.title] - 标题（默认"回复了你的日记"）
 * @param {string} [options.content] - 回复内容（自动截取前两句）
 * @param {string} [options.status] - 状态：'loading' | 'success'
 * @param {function} [options.onClick] - 点击回调
 * @param {number} [options.duration] - 显示时长（默认4000ms）
 * 
 * @example
 * showDiaryReplyNotification({
 *   characterName: 'Seraphina',
 *   content: '听起来今天过得很充实呢！我也喜欢在阳光明媚的日子里散步。',
 *   onClick: () => openDiaryPanel()
 * });
 */
export function showDiaryReplyNotification(options = {}) {
  const {
    characterName = '未知',
    title = '回复了你的日记',
    content = '',
    status = 'success',
    onClick = null,
    duration = 4000
  } = options;

  // 获取角色头像
  const ctx = getContext();
  const character = ctx.characters?.[ctx.characterId];
  const avatarUrl = character ? getThumbnailUrl('avatar', character.avatar) : null;

  // 处理内容预览（最多两句）
  let preview = '';
  if (content) {
    const sentences = content.match(/[^。！？.!?]+[。！？.!?]+/g) || [content];
    preview = sentences.slice(0, 2).join('');
    if (sentences.length > 2) {
      preview += '...';
    }
  }

  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = 'diary-reply-notification';

  // 加载状态
  if (status === 'loading') {
    notification.innerHTML = `
      <div class="diary-notification-avatar">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${characterName}" />` : '<i class="fa-solid fa-book"></i>'}
      </div>
      <div class="diary-notification-content">
        <div class="diary-notification-header">
          <span class="diary-notification-name">日记系统</span>
          <span class="diary-notification-time">Now</span>
        </div>
        <div class="diary-notification-title">日记推送中...</div>
        <div class="diary-notification-preview">
          <i class="fa-solid fa-spinner fa-spin"></i> 正在等待回复
        </div>
      </div>
    `;
  } else {
    // 成功状态
    notification.innerHTML = `
      <div class="diary-notification-avatar">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${characterName}" />` : '<i class="fa-solid fa-user-circle"></i>'}
      </div>
      <div class="diary-notification-content">
        <div class="diary-notification-header">
          <span class="diary-notification-name">${characterName}</span>
          <span class="diary-notification-time">Now</span>
        </div>
        <div class="diary-notification-title">${title}</div>
        ${preview ? `<div class="diary-notification-preview">${preview}</div>` : ''}
      </div>
    `;
  }

  // 移动端检测
  const isMobile = window.innerWidth <= 768;

  // 样式（内联以确保生效）
  Object.assign(notification.style, {
    position: 'fixed',
    top: '-150px',
    left: isMobile ? '20px' : '50%',
    right: isMobile ? '20px' : 'auto',
    transform: isMobile ? 'none' : 'translateX(-50%)',
    zIndex: '10001',

    display: 'flex',
    gap: '10px',
    padding: '12px 16px 12px 12px',
    width: isMobile ? 'calc(100vw - 40px)' : '380px',
    maxWidth: isMobile ? 'none' : '90vw',

    background: 'rgba(255, 255, 255, 0.98)',
    backdropFilter: 'blur(30px) saturate(180%)',
    WebkitBackdropFilter: 'blur(30px) saturate(180%)',

    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.12), 0 2px 10px rgba(0, 0, 0, 0.08)',

    transition: 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    cursor: onClick ? 'pointer' : 'default',

    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });

  // 头像样式
  const avatarContainer = notification.querySelector('.diary-notification-avatar');
  Object.assign(avatarContainer.style, {
    flexShrink: '0',
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    overflow: 'hidden',
    background: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });

  const avatarImg = avatarContainer.querySelector('img');
  if (avatarImg) {
    Object.assign(avatarImg.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    });
  }

  const avatarIcon = avatarContainer.querySelector('i');
  if (avatarIcon) {
    Object.assign(avatarIcon.style, {
      fontSize: '24px',
      color: '#999'
    });
  }

  // 内容区样式
  const contentArea = notification.querySelector('.diary-notification-content');
  Object.assign(contentArea.style, {
    flex: '1',
    minWidth: '0'
  });

  // 头部样式
  const header = notification.querySelector('.diary-notification-header');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px'
  });

  const nameEl = notification.querySelector('.diary-notification-name');
  Object.assign(nameEl.style, {
    fontSize: '15px',
    fontWeight: '600',
    color: '#1a1a1a',
    letterSpacing: '-0.2px'
  });

  const timeEl = notification.querySelector('.diary-notification-time');
  Object.assign(timeEl.style, {
    fontSize: '13px',
    color: '#8e8e93',
    fontWeight: '400'
  });

  // 标题样式
  const titleEl = notification.querySelector('.diary-notification-title');
  Object.assign(titleEl.style, {
    fontSize: '14px',
    color: '#3a3a3c',
    marginBottom: preview ? '4px' : '0',
    fontWeight: '400'
  });

  // 预览样式
  const previewEl = notification.querySelector('.diary-notification-preview');
  if (previewEl) {
    Object.assign(previewEl.style, {
      fontSize: '13px',
      color: '#6e6e73',
      lineHeight: '1.4',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: '-webkit-box',
      WebkitLineClamp: '2',
      WebkitBoxOrient: 'vertical'
    });
  }

  // 添加到页面
  document.body.appendChild(notification);

  // 滑入动画
  requestAnimationFrame(() => {
    setTimeout(() => {
      notification.style.top = '20px';

      // 添加微弹效果（仅PC端）
      if (!isMobile) {
        setTimeout(() => {
          notification.style.transform = 'translateX(-50%) scale(1.02)';
          setTimeout(() => {
            notification.style.transform = 'translateX(-50%) scale(1)';
          }, 150);
        }, 300);
      }
    }, 10);
  });

  // 点击事件
  if (onClick) {
    notification.addEventListener('click', () => {
      onClick();
      dismissNotification(notification);
    });

    // 悬停效果（仅PC端）
    if (!isMobile) {
      notification.addEventListener('mouseenter', () => {
        notification.style.transform = 'translateX(-50%) scale(1.02)';
        notification.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)';
      });

      notification.addEventListener('mouseleave', () => {
        notification.style.transform = 'translateX(-50%) scale(1)';
        notification.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.12), 0 2px 10px rgba(0, 0, 0, 0.08)';
      });
    }
  }

  // 自动消失
  const autoHideTimer = setTimeout(() => {
    dismissNotification(notification);
  }, duration);

  // 返回控制对象（用于手动更新或关闭）
  return {
    update: (newOptions) => {
      clearTimeout(autoHideTimer);
      notification.remove();
      return showDiaryReplyNotification({ ...options, ...newOptions });
    },
    dismiss: () => {
      clearTimeout(autoHideTimer);
      dismissNotification(notification);
    }
  };
}

/**
 * 关闭日记回复通知
 * 
 * @param {HTMLElement} notification - 通知元素
 */
function dismissNotification(notification) {
  const isMobile = window.innerWidth <= 768;

  if (!isMobile) {
    notification.style.transform = 'translateX(-50%) scale(0.95)';
  }
  notification.style.opacity = '0';
  notification.style.top = '-150px';

  setTimeout(() => {
    notification.remove();
  }, 500);
}






