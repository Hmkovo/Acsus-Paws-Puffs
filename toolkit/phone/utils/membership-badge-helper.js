/**
 * 会员徽章工具函数
 * 
 * @description
 * 提供会员徽章的生成和名字颜色类名获取
 * 
 * @module membership-badge-helper
 */

import logger from '../../../logger.js';

/**
 * 获取会员类型对应的徽章文本
 * @param {string} type - 会员类型 ('vip' | 'svip' | 'annual-svip')
 * @returns {string} 徽章文本
 */
export function getMembershipBadgeText(type) {
  switch (type) {
    case 'vip':
      return 'VIP';
    case 'svip':
      return 'SVIP';
    case 'annual-svip':
      return '年SVIP';
    default:
      return '';
  }
}

/**
 * 获取会员类型对应的名字颜色类名
 * @param {string} type - 会员类型 ('vip' | 'svip' | 'annual-svip')
 * @returns {string} CSS类名
 */
export function getMembershipNameClass(type) {
  switch (type) {
    case 'vip':
      return 'name-vip';
    case 'svip':
    case 'annual-svip':
      return 'name-svip';
    default:
      return '';
  }
}

/**
 * 创建会员徽章元素
 * @param {string} type - 会员类型 ('vip' | 'svip' | 'annual-svip')
 * @returns {HTMLElement|null} 徽章元素，如果type为none则返回null
 */
export function createMembershipBadge(type) {
  if (!type || type === 'none') {
    return null;
  }

  const badge = document.createElement('span');
  badge.className = 'membership-badge';
  badge.textContent = getMembershipBadgeText(type);

  return badge;
}

/**
 * 为名字元素添加会员颜色类
 * @param {HTMLElement} nameElement - 名字元素
 * @param {string} type - 会员类型 ('vip' | 'svip' | 'annual-svip')
 */
export function applyMembershipNameColor(nameElement, type) {
  if (!nameElement || !type || type === 'none') {
    return;
  }

  const className = getMembershipNameClass(type);
  if (className) {
    nameElement.classList.add(className);
  }
}

/**
 * 为名字元素添加会员徽章（如果有会员）
 * @param {HTMLElement} nameElement - 名字元素
 * @param {string} type - 会员类型 ('vip' | 'svip' | 'annual-svip')
 */
export function addMembershipBadgeToName(nameElement, type) {
  if (!nameElement || !type || type === 'none') {
    return;
  }

  // 添加名字颜色
  applyMembershipNameColor(nameElement, type);

  // 添加徽章
  const badge = createMembershipBadge(type);
  if (badge) {
    nameElement.appendChild(badge);
  }
}

/**
 * 为角色徽章绑定点击事件（显示会员详情弹窗）
 * 
 * @async
 * @param {HTMLElement} badgeElement - 徽章元素
 * @param {string} contactId - 角色ID
 * @param {string} contactName - 角色名字
 */
export async function bindMembershipBadgeClick(badgeElement, contactId, contactName) {
  if (!badgeElement) {
    logger.warn('[MembershipBadge] 徽章元素不存在');
    return;
  }

  // 添加点击样式
  badgeElement.style.cursor = 'pointer';
  
  // 绑定点击事件
  badgeElement.addEventListener('click', async (e) => {
    e.stopPropagation(); // 阻止事件冒泡
    
    logger.debug('[MembershipBadge] 点击徽章:', contactName);
    
    // 动态导入弹窗函数
    const { showMembershipDetailPopup } = await import('./membership-popup-helper.js');
    await showMembershipDetailPopup(contactId, contactName);
  });
}
