/**
 * 会员详情弹窗工具
 * 
 * @description
 * 显示角色会员详情（类型、到期时间、剩余天数）
 * 使用统一弹窗系统 showCustomPopup
 * 
 * @module membership-popup-helper
 */

import logger from '../../../logger.js';
import { getCharacterMembership } from '../data-storage/storage-membership.js';
import { showCustomPopup } from './popup-helper.js';

/**
 * 显示角色会员详情弹窗
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @param {string} contactName - 角色名字
 */
export async function showMembershipDetailPopup(contactId, contactName) {
  logger.info('phone','[MembershipPopup] 显示会员详情弹窗:', contactName);

  // 获取会员数据
  const membership = await getCharacterMembership(contactId);
  
  if (!membership || membership.type === 'none') {
    logger.warn('phone','[MembershipPopup] 角色无会员数据:', contactName);
    return;
  }

  // 计算剩余天数
  const now = Math.floor(Date.now() / 1000);
  const remainingDays = Math.ceil((membership.expireTime - now) / 86400);
  const expireDate = new Date(membership.expireTime * 1000).toLocaleDateString('zh-CN');

  // 会员类型文本和颜色
  let typeText = '';
  let typeColor = '';
  
  switch (membership.type) {
    case 'vip':
      typeText = 'VIP会员';
      typeColor = 'linear-gradient(135deg, #c94e50 0%, #d66668 100%)';
      break;
    case 'svip':
      typeText = 'SVIP会员';
      typeColor = 'linear-gradient(135deg, #cea77c 0%, #d9b88e 100%)';
      break;
    case 'annual-svip':
      typeText = '年SVIP会员';
      typeColor = 'linear-gradient(135deg, #cea77c 0%, #d9b88e 100%)';
      break;
  }

  // 创建弹窗内容
  const contentHTML = `
    <div class="membership-detail-header-badge" style="background: ${typeColor};">
      <i class="fa-solid fa-crown"></i>
      <span>${typeText}</span>
    </div>
    <div class="membership-detail-name">${contactName}</div>
    <div class="membership-detail-info">
      <div class="membership-detail-row">
        <span class="label">到期时间：</span>
        <span class="value">${expireDate}</span>
      </div>
      <div class="membership-detail-row">
        <span class="label">剩余天数：</span>
        <span class="value">${remainingDays} 天</span>
      </div>
    </div>
  `;

  // 使用统一弹窗系统
  await showCustomPopup('会员详情', contentHTML, {
    buttons: [
      { text: '关闭', value: 'close', class: 'cancel' }
    ],
    showClose: true,
    width: '18em'
  });

  logger.debug('phone','[MembershipPopup] 弹窗已关闭');
}
