/**
 * iOS风格通知（手机模块专用）
 * 
 * @description
 * 在酒馆顶部显示iOS风格的轻量级通知提示。
 * 支持自动消失、点击关闭、多种类型（成功/警告/错误/信息）。
 * 
 * @module PhoneToast
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import logger from '../../../logger.js';
import { getContext } from '../../../../../../extensions.js';
import { getThumbnailUrl } from '../../../../../../../script.js';

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
 * showPhoneToast('已同步联系人', 'success');
 * showPhoneToast('正在处理中...', 'info', 5000);
 */
export function showPhoneToast(message, type = 'success', duration = 3000) {
  // 获取角色头像
  const ctx = getContext();
  const character = ctx.characters?.[ctx.characterId];
  const avatarUrl = character ? getThumbnailUrl('avatar', character.avatar) : null;

  // 创建通知元素
  const toast = document.createElement('div');
  toast.className = `phone-toast phone-toast-${type}`;

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
    ? `<div class="phone-toast-avatar"><img src="${avatarUrl}" alt="avatar" /></div>`
    : `<div class="phone-toast-icon"><i class="fa-solid ${icons[type]}"></i></div>`;

  toast.innerHTML = `
        ${iconHTML}
        <div class="phone-toast-content">
            <div class="phone-toast-message">${message}</div>
            <div class="phone-toast-time">Now</div>
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
    fontSize: '15px',
    color: '#1a1a1a'
  });

  // 内容区样式
  const contentArea = toast.querySelector('.phone-toast-content');
  Object.assign(contentArea.style, {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px'
  });

  // 消息样式
  const messageEl = toast.querySelector('.phone-toast-message');
  Object.assign(messageEl.style, {
    flex: '1',
    lineHeight: '1.4',
    letterSpacing: '-0.2px'
  });

  // 时间样式
  const timeEl = toast.querySelector('.phone-toast-time');
  Object.assign(timeEl.style, {
    fontSize: '13px',
    color: '#8e8e93',
    flexShrink: '0'
  });

  // 图标样式
  const iconContainer = toast.querySelector('.phone-toast-icon');
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
  const avatarContainer = toast.querySelector('.phone-toast-avatar');
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

  logger.debug('[PhoneToast] 显示通知:', message);
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
  showPhoneToast(message, 'success');
}

/**
 * 快捷方法：警告通知
 * 
 * @param {string} message - 消息
 */
export function showWarningToast(message) {
  showPhoneToast(message, 'warning');
}

/**
 * 快捷方法：错误通知
 * 
 * @param {string} message - 消息
 */
export function showErrorToast(message) {
  showPhoneToast(message, 'error', 5000);
}

/**
 * 快捷方法：信息通知
 * 
 * @param {string} message - 消息
 */
export function showInfoToast(message) {
  showPhoneToast(message, 'info');
}

/**
 * 显示消息通知（iOS锁屏风格）
 * 
 * @description
 * 显示更丰富的通知，包含头像、名字、内容预览。
 * 适用于显示角色发来的消息、回复等场景。
 * 
 * @param {Object} options - 通知选项
 * @param {string} [options.contactId] - 联系人ID（用于获取对应角色头像）
 * @param {string} options.characterName - 角色名称
 * @param {string} [options.title] - 标题（默认"发来新消息"）
 * @param {string} [options.content] - 消息内容（自动截取前两句）
 * @param {string} [options.status] - 状态：'loading' | 'success'
 * @param {function} [options.onClick] - 点击回调
 * @param {number} [options.duration] - 显示时长（默认4000ms，0表示不自动消失）
 * @param {HTMLElement} [options.existingNotification] - 现有通知元素（用于无缝更新）
 * 
 * @returns {Object} 控制对象 { update, dismiss, element }
 * 
 * @example
 * showPhoneMessageNotification({
 *   contactId: 'tavern_xxx',  // ← 新增：传入contactId获取对应头像
 *   characterName: 'Seraphina',
 *   title: '发来新消息',
 *   content: '今天天气真好呢！你在做什么？',
 *   onClick: () => openChat()
 * });
 */
export function showPhoneMessageNotification(options = {}) {
  const {
    contactId = null,
    characterName = '未知',
    title = '发来新消息',
    content = '',
    status = 'success',
    onClick = null,
    duration = 4000,
    existingNotification = null
  } = options;

  // 获取角色头像（根据contactId获取对应角色）
  let avatarUrl = null;

  if (contactId) {
    // ✅ 新逻辑：根据contactId获取对应角色的头像
    const ctx = getContext();

    // 解析contactId获取角色avatar（格式：tavern_角色文件名）
    if (contactId.startsWith('tavern_')) {
      const avatarName = contactId.replace('tavern_', '') + '.png';
      avatarUrl = getThumbnailUrl('avatar', avatarName);
    }
  } else {
    // 兼容旧逻辑：获取当前酒馆角色的头像
    const ctx = getContext();
    const character = ctx.characters?.[ctx.characterId];
    avatarUrl = character ? getThumbnailUrl('avatar', character.avatar) : null;
  }

  // 处理内容预览（显示全部内容，CSS控制单行截断）
  let preview = content || '';

  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = 'phone-message-notification';

  // 加载状态
  if (status === 'loading') {
    notification.innerHTML = `
      <div class="phone-notification-avatar">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${characterName}" />` : '<i class="fa-regular fa-user"></i>'}
      </div>
      <div class="phone-notification-content">
        <div class="phone-notification-header">
          <span class="phone-notification-name">${characterName}</span>
          <span class="phone-notification-time">Now</span>
        </div>
        <div class="phone-notification-preview">
          <i class="fa-solid fa-spinner fa-spin"></i> 正在生成...
        </div>
      </div>
    `;
  } else {
    // 成功状态（删除了 phone-notification-title 元素）
    notification.innerHTML = `
      <div class="phone-notification-avatar">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${characterName}" />` : '<i class="fa-regular fa-user-circle"></i>'}
      </div>
      <div class="phone-notification-content">
        <div class="phone-notification-header">
          <span class="phone-notification-name">${characterName}</span>
          <span class="phone-notification-time">Now</span>
        </div>
        ${preview ? `<div class="phone-notification-preview">${preview}</div>` : ''}
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
  const avatarContainer = notification.querySelector('.phone-notification-avatar');
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
  const contentArea = notification.querySelector('.phone-notification-content');
  Object.assign(contentArea.style, {
    flex: '1',
    minWidth: '0'
  });

  // 头部样式
  const header = notification.querySelector('.phone-notification-header');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  });

  const nameEl = notification.querySelector('.phone-notification-name');
  Object.assign(nameEl.style, {
    fontSize: '15px',
    fontWeight: '600',
    color: '#1a1a1a',
    letterSpacing: '-0.2px'
  });

  const timeEl = notification.querySelector('.phone-notification-time');
  Object.assign(timeEl.style, {
    fontSize: '13px',
    color: '#8e8e93'
  });

  // 预览样式（单行显示，超出显示省略号）
  const previewEl = notification.querySelector('.phone-notification-preview');
  if (previewEl) {
    Object.assign(previewEl.style, {
      fontSize: '14px',
      color: '#3a3a3c',
      lineHeight: '1.4',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'  // ← 改成单行显示
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
      dismissMessageNotification(notification);
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

  // 自动消失（仅当duration > 0时）
  let autoHideTimer;
  if (duration > 0) {
    autoHideTimer = setTimeout(() => {
      dismissMessageNotification(notification);
    }, duration);
  }

  // 返回控制对象（用于手动更新或关闭）
  return {
    // 无缝更新通知内容
    update: (newOptions) => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }

      // 检查通知是否还在DOM中（用户可能已点击关闭）
      if (!notification.parentElement) {
        // 通知已被移除，创建新通知
        logger.debug('[PhoneToast] 原通知已关闭，创建新通知');
        const newNotification = showPhoneMessageNotification({
          ...options,
          ...newOptions
        });
        return newNotification;
      }

      // 合并选项
      const updatedOptions = { ...options, ...newOptions, existingNotification: notification };

      // 获取新内容的预览（显示全部内容，CSS控制单行截断）
      const newPreview = newOptions.content || '';

      // 直接更新DOM元素，而不是重新创建（无缝过渡）
      const previewEl = notification.querySelector('.phone-notification-preview');
      const nameEl = notification.querySelector('.phone-notification-name');

      if (previewEl && newPreview) {
        // 移除加载图标，显示预览内容
        previewEl.textContent = newPreview;
      }

      if (nameEl && newOptions.characterName) {
        nameEl.textContent = newOptions.characterName;
      }

      // 更新点击事件
      if (newOptions.onClick) {
        notification.onclick = () => {
          newOptions.onClick();
          dismissMessageNotification(notification);
        };
      }

      // 重新设置自动消失定时器
      const newDuration = newOptions.duration !== undefined ? newOptions.duration : 4000;
      if (newDuration > 0) {
        autoHideTimer = setTimeout(() => {
          dismissMessageNotification(notification);
        }, newDuration);
      } else {
        autoHideTimer = null;  // duration=0 表示不自动消失
      }

      logger.debug('[PhoneToast] 通知已无缝更新:', newOptions.title);

      // 返回自己，支持链式调用
      return this;
    },
    dismiss: () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
      dismissMessageNotification(notification);
    },
    // 暴露通知元素，供外部调试使用
    element: notification
  };
}

/**
 * 关闭消息通知
 * 
 * @param {HTMLElement} notification - 通知元素
 */
function dismissMessageNotification(notification) {
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

