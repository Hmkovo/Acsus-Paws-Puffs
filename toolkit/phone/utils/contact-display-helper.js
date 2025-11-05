/**
 * 联系人和用户名称显示工具
 * @module phone/utils/contact-display-helper
 * 
 * @description
 * 提取公共的名称显示逻辑，统一管理所有名称相关的DOM更新。
 * 
 * 提取的公共逻辑位置：
 * - 联系人名称显示：
 *   1. 聊天页顶部标题（message-chat-ui.js）
 *   2. 角色个人页名称区（contact-profile-ui.js）
 *   3. 联系人设置页备注（contact-settings-ui.js）
 *   4. 联系人列表（contact-list-ui.js）
 *   5. 消息列表（message-list-ui.js）
 * 
 * - 用户名称显示：
 *   1. 手机顶部栏用户名（phone-main-ui.js）
 *   2. 用户个人主页名称（user-profile-ui.js）
 */

import logger from '../../../logger.js';
import { name1 } from '../../../../../../../script.js';

/* ==================== 联系人名称相关 ==================== */

/**
 * 获取联系人显示名称（备注优先）
 * 
 * @description
 * 统一的名称显示逻辑：如果有备注则显示备注，否则显示原名
 * 
 * @param {Object} contact - 联系人对象
 * @param {string} contact.name - 角色原名
 * @param {string} [contact.remark] - 备注名称
 * @returns {string} 显示名称
 */
export function getContactDisplayName(contact) {
  if (!contact) {
    logger.warn('[ContactDisplayHelper] 联系人对象为空');
    return '';
  }
  return contact.remark || contact.name || '';
}

/**
 * 同步更新所有位置的联系人显示名称（DOM同步）
 * 
 * @description
 * 当备注修改后，自动更新所有显示该联系人名称的DOM元素：
 * 1. 聊天页顶部标题
 * 2. 个人页名称区（大字显示名+小字昵称）
 * 3. 设置页备注显示
 * 4. 联系人列表
 * 5. 消息列表
 * 
 * @param {string} contactId - 联系人ID
 * @param {string} displayName - 显示名称（备注或原名）
 * @param {string} originalName - 角色原名
 */
export function syncContactDisplayName(contactId, displayName, originalName) {
  logger.debug('[ContactDisplayHelper] 同步名称显示:', contactId, displayName);

  const hasRemark = displayName !== originalName;

  // 1. 聊天页顶部标题
  const chatTitle = document.querySelector(`#page-chat .phone-header-title[data-contact-id="${contactId}"]`);
  if (chatTitle) {
    chatTitle.textContent = displayName;
    logger.debug('[ContactDisplayHelper] 已更新聊天页标题');
  }

  // 2. 个人页名称区
  const profileInfoText = document.querySelector(`.contact-profile-info-text[data-contact-id="${contactId}"]`);
  if (profileInfoText) {
    const profileName = profileInfoText.querySelector('.contact-profile-name');
    const profileNickname = profileInfoText.querySelector('.contact-profile-nickname');

    if (profileName) {
      profileName.textContent = displayName;
    }

    // 如果有备注，显示"昵称：原名"；否则隐藏
    if (profileNickname) {
      if (hasRemark) {
        profileNickname.textContent = `昵称：${originalName}`;
        profileNickname.style.display = 'block';
      } else {
        profileNickname.style.display = 'none';
      }
    }

    logger.debug('[ContactDisplayHelper] 已更新个人页名称');
  }

  // 3. 设置页备注显示
  const settingsItem = document.querySelector(`.contact-settings-item[data-contact-id="${contactId}"]`);
  if (settingsItem) {
    const settingsRemark = settingsItem.querySelector('.contact-settings-remark-text');
    if (settingsRemark) {
      settingsRemark.textContent = displayName;
      logger.debug('[ContactDisplayHelper] 已更新设置页备注');
    }
  }

  // 4. 联系人列表（如果在页面上）
  const contactItem = document.querySelector(`.contact-item[data-contact-id="${contactId}"]`);
  if (contactItem) {
    const contactItemName = contactItem.querySelector('.contact-item-name');
    if (contactItemName) {
      contactItemName.textContent = displayName;
      logger.debug('[ContactDisplayHelper] 已更新联系人列表');
    }
  }

  // 5. 消息列表（如果在页面上）
  const msgItem = document.querySelector(`.msg-item[data-contact-id="${contactId}"]`);
  if (msgItem) {
    const msgItemName = msgItem.querySelector('.msg-item-name');
    if (msgItemName) {
      msgItemName.textContent = displayName;
      logger.debug('[ContactDisplayHelper] 已更新消息列表');
    }
  }
}

/* ==================== 用户名称相关 ==================== */

/**
 * 获取用户显示名称
 * 
 * @description
 * 从 SillyTavern 的 script.js 获取当前用户名（name1 变量）
 * 
 * @returns {string} 用户名
 */
export function getUserDisplayName() {
  return name1 || '用户';
}

/**
 * 同步更新所有位置的用户名称显示（DOM同步）
 * 
 * @description
 * 当用户名修改后（虽然目前不支持修改，但预留此函数），
 * 自动更新所有显示用户名的DOM元素：
 * 1. 手机顶部栏用户名（phone-main-ui.js）
 * 2. 用户个人主页名称（user-profile-ui.js）
 * 
 * @param {string} newUserName - 新用户名
 */
export function syncUserDisplayName(newUserName) {
  logger.debug('[ContactDisplayHelper] 同步用户名显示:', newUserName);

  // 1. 手机顶部栏用户名
  const headerUserName = document.querySelector('.phone-header-user-name');
  if (headerUserName) {
    headerUserName.textContent = newUserName;
    logger.debug('[ContactDisplayHelper] 已更新顶部栏用户名');
  }

  // 2. 用户个人主页名称
  const profileUserName = document.querySelector('.user-profile-name');
  if (profileUserName) {
    profileUserName.textContent = newUserName;
    logger.debug('[ContactDisplayHelper] 已更新用户主页名称');
  }
}

