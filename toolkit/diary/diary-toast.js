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

  // 图标映射
  const icons = {
    success: 'fa-check-circle',
    warning: 'fa-exclamation-triangle',
    error: 'fa-times-circle',
    info: 'fa-info-circle'
  };

  // 颜色映射
  const colors = {
    success: '#4caf50',
    warning: '#ff9800',
    error: '#ff3b30',
    info: '#667eea'
  };

  // 构建HTML（优先显示角色头像）
  const iconHTML = avatarUrl
    ? `<div class="diary-toast-avatar"><img src="${avatarUrl}" alt="avatar" /></div>`
    : `<div class="diary-toast-icon"><i class="fa-solid ${icons[type]}"></i></div>`;

  toast.innerHTML = `
        ${iconHTML}
        <div class="diary-toast-message">${message}</div>
        <button class="diary-toast-close">
            <i class="fa-solid fa-times"></i>
        </button>
    `;

  // 样式
  Object.assign(toast.style, {
    position: 'fixed',
    top: '-100px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10000',

    display: 'flex',
    alignItems: 'center',
    gap: '12px',

    padding: '12px 20px',
    minWidth: '300px',
    maxWidth: '500px',

    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',

    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',

    transition: 'top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',

    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748'
  });

  // 图标或头像样式
  const iconEl = toast.querySelector('.diary-toast-icon i');
  if (iconEl) {
    iconEl.style.color = colors[type];
    iconEl.style.fontSize = '18px';
  }

  const avatarEl = toast.querySelector('.diary-toast-avatar img');
  if (avatarEl) {
    Object.assign(avatarEl.style, {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      objectFit: 'cover',
      border: `2px solid ${colors[type]}`
    });
  }

  // 关闭按钮样式
  const closeBtn = toast.querySelector('.diary-toast-close');
  Object.assign(closeBtn.style, {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    color: '#a0aec0',
    fontSize: '14px',
    marginLeft: 'auto',
    transition: 'color 0.2s'
  });

  // 关闭按钮事件
  closeBtn.addEventListener('click', () => dismissToast(toast));
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.color = '#4a5568';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.color = '#a0aec0';
  });

  // 添加到页面
  document.body.appendChild(toast);

  // 滑下动画
  requestAnimationFrame(() => {
    setTimeout(() => {
      toast.style.top = '20px';
    }, 10);
  });

  // 自动消失
  const autoHideTimer = setTimeout(() => {
    dismissToast(toast);
  }, duration);

  // 点击通知体关闭
  toast.addEventListener('click', (e) => {
    if (e.target !== closeBtn && !closeBtn.contains(e.target)) {
      clearTimeout(autoHideTimer);
      dismissToast(toast);
    }
  });

  logger.debug('[DiaryToast] 显示通知:', message);
}

/**
 * 关闭通知
 * 
 * @param {HTMLElement} toast - 通知元素
 */
function dismissToast(toast) {
  toast.style.top = '-100px';
  setTimeout(() => {
    toast.remove();
  }, 400);
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






