/**
 * 角色个性签名更新消息渲染器
 * @module phone/messages/message-types/signature-message
 * 
 * @description
 * 渲染角色发送的个性签名更新消息
 * 格式：[改个签]xxx
 */

import logger from '../../../../logger.js';
import { updateContactSignature } from '../../profile/signature-data.js';
import { getThumbnailUrl } from '../../../../../../../../script.js';

// 已保存的个签消息ID集合（防止重复保存）
const savedSignatureMessages = new Set();

/**
 * 解析个签更新消息格式
 * 
 * @param {string} content - 消息内容
 * @returns {Object|null} 解析结果 { newSignature }
 */
export function parseSignatureMessage(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // [改个签]xxx
  const match = content.match(/^\[改个签\](.+)$/s);
  if (match) {
    const newSignature = match[1].trim();

    // 检查字数限制
    if (newSignature.length > 80) {
      logger.warn('phone','[SignatureMessage] 个签超过80字符限制:', newSignature.length);
      return null;
    }

    return {
      newSignature: newSignature
    };
  }

  return null;
}

/**
 * 检查消息是否是个签更新消息
 * @param {Object} message - 消息对象
 * @returns {boolean}
 */
export function isSignatureMessage(message) {
  if (message.type !== 'text') return false;
  return parseSignatureMessage(message.content) !== null;
}

/**
 * 渲染个签更新消息
 * 
 * @param {Object} message - 消息对象
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象（可选）
 * @returns {HTMLElement} 消息元素
 */
export function renderSignatureMessage(message, contactId, contact = null) {
  logger.debug('phone','[SignatureMessage] 渲染个签更新消息');

  const signatureData = parseSignatureMessage(message.content);
  if (!signatureData) {
    logger.warn('phone','[SignatureMessage] 无法解析个签更新消息:', message.content?.substring(0, 50));
    return null;
  }

  const container = document.createElement('div');
  container.className = 'chat-msg chat-msg-signature-update chat-msg-enter-ai';
  container.setAttribute('data-msg-id', message.id);
  container.setAttribute('data-message-time', message.time?.toString() || '');

  // 获取角色头像
  const avatarUrl = contact?.avatar
    ? getThumbnailUrl('avatar', contact.avatar)
    : 'img/ai4.png'; // 默认头像

  // 创建卡片（简化版，无折叠，无点赞）
  const card = document.createElement('div');
  card.className = 'signature-update-card';

  card.innerHTML = `
    <div class="signature-update-header">
      <img class="signature-update-avatar" src="${avatarUrl}" alt="头像">
      <span class="signature-update-title">更新了个签</span>
    </div>
    <div class="signature-update-text">${signatureData.newSignature}</div>
  `;

  container.appendChild(card);

  // 自动保存个签到数据（使用消息ID去重，防止重复保存）
  if (!savedSignatureMessages.has(message.id)) {
    handleSaveSignature(contactId, signatureData.newSignature, message.id, card);
  }

  logger.info('phone','[SignatureMessage] ✅ 个签更新消息渲染完成:', message.id);
  return container;
}

/**
 * 保存个签到数据（渲染时自动调用）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} newSignature - 新个签
 * @param {string} msgId - 消息ID
 * @param {HTMLElement} card - 卡片元素
 */
async function handleSaveSignature(contactId, newSignature, msgId, card) {
  logger.debug('phone','[SignatureMessage] 保存个签到数据，msgId:', msgId);

  try {
    // 标记为正在保存（防止异步期间重复调用）
    savedSignatureMessages.add(msgId);

    const historyItem = await updateContactSignature(contactId, newSignature, msgId);

    if (historyItem) {
      card.dataset.signatureSaved = 'true';
      card.dataset.signatureId = historyItem.id;
      logger.info('phone','[SignatureMessage] 个签已保存到数据，msgId:', msgId);
    } else {
      logger.warn('phone','[SignatureMessage] 个签保存失败（可能已保存过），msgId:', msgId);
    }
  } catch (error) {
    logger.error('phone','[SignatureMessage] 保存个签失败:', error);
    // 保存失败时移除标记，允许下次重试
    savedSignatureMessages.delete(msgId);
  }
}

