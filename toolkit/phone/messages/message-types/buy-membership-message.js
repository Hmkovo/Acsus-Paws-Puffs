/**
 * 角色给自己买会员消息渲染器
 * @module phone/messages/message-types/buy-membership-message
 * 
 * @description
 * 渲染角色给自己开通会员的系统提示消息
 * 
 * 显示效果：
 * - 居中显示的小气泡
 * - VIP红色渐变，SVIP金色渐变
 * - 包含皇冠图标
 * 
 * 业务逻辑：
 * - 自动给角色开通会员
 * - 防重复处理机制
 * - 触发刷新事件
 */

import logger from '../../../../logger.js';

/**
 * 已处理的开会员消息ID集合（防重复）
 * @type {Set<string>}
 */
const savedBuyMembershipMessages = new Set();

/**
 * 渲染角色买会员消息
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.sender - 发送者（'contact'）
 * @param {string} message.membershipType - 会员类型（'vip' 或 'svip'）
 * @param {number} message.months - 月数（1 或 12）
 * @param {Object} contact - 联系人对象
 * @param {string} contact.name - 联系人名称
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement} 消息容器元素
 */
export function renderBuyMembershipMessage(message, contact, contactId) {
  logger.debug('phone','[BuyMembershipMessage]] 渲染角色买会员消息:', message);
  
  // 创建容器
  const container = document.createElement('div');
  container.className = 'chat-msg chat-msg-buy-membership';
  
  // 确定样式类名和文本
  const typeClass = message.membershipType === 'vip' ? 'vip' : 'svip';
  const typeText = message.membershipType === 'vip' ? 'VIP' : 'SVIP';
  
  // 居中系统提示样式
  container.innerHTML = `
    <div class="buy-membership-notice ${typeClass}">
      <i class="fa-solid fa-crown"></i>
      ${contact.name} 开通了${message.months}个月${typeText}会员
    </div>
  `;
  
  // ✅ 业务逻辑：角色给自己买会员
  if (message.sender === 'contact' && !savedBuyMembershipMessages.has(message.id)) {
    handleBuyMembership(contactId, message);
  }
  
  return container;
}

/**
 * 处理角色买会员业务逻辑
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} message - 消息对象
 * 
 * @description
 * 1. 标记消息为已处理（防重复）
 * 2. 调用会员数据模块开通会员
 * 3. 触发刷新事件通知其他页面
 * 4. 失败时删除标记允许重试
 */
async function handleBuyMembership(contactId, message) {
  savedBuyMembershipMessages.add(message.id);
  
  try {
    // 动态导入会员模块（和gift-membership-message.js保持一致）
    const { grantCharacterMembership } = await import('../../data-storage/storage-membership.js');
    
    // 调用会员数据模块开通会员
    // months参数：1 或 12
    await grantCharacterMembership(contactId, message.membershipType, message.months, {
      from: 'ai-buy'
    });
    
    logger.info('phone','[BuyMembershipMessage]] 角色开通会员成功:', {
      contactId,
      type: message.membershipType,
      months: message.months
    });
    
    // 注：grantCharacterMembership 已通过 stateManager.set 自动触发角色会员变化通知，不需要重复触发
  } catch (error) {
    logger.error('phone','[BuyMembershipMessage]] 角色开通会员失败:', error);
    // 失败时删除标记，允许重试
    savedBuyMembershipMessages.delete(message.id);
  }
}
