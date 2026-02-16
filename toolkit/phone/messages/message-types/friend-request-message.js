/**
 * 好友申请消息渲染器
 * @module phone/messages/message-types/friend-request-message
 * 
 * @description
 * 渲染好友申请消息（角色发送的申请消息，显示在聊天记录中）
 * 支持鼠标悬停显示删除按钮
 */

import logger from '../../../../logger.js';
import { loadChatHistory, saveChatHistory } from '../message-chat-data.js';
import { showSuccessToast } from '../../ui-components/toast-notification.js';

/**
 * 渲染好友申请消息气泡
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.content - 消息内容
 * @param {number} message.time - 时间戳（秒）
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 消息气泡元素
 * 
 * @example
 * const bubble = renderFriendRequestMessage({
 *   id: 'msg_123',
 *   content: '你好，可以加个好友吗？',
 *   time: 1699999999
 * }, contactId, contact);
 */
export function renderFriendRequestMessage(message, contactId, contact) {
  const container = document.createElement('div');
  container.className = 'chat-msg chat-msg-contact';
  container.dataset.msgId = message.id;

  // 创建消息气泡
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble friend-request-bubble';

  // 好友申请标签
  const tag = document.createElement('div');
  tag.className = 'friend-request-tag';
  tag.textContent = '好友申请';

  // 消息内容
  const content = document.createElement('div');
  content.className = 'friend-request-content';
  content.textContent = message.content;

  bubble.appendChild(tag);
  bubble.appendChild(content);

  // ✅ 删除按钮（鼠标悬停3秒后显示）
  const actions = document.createElement('div');
  actions.className = 'friend-request-message-actions';
  actions.style.display = 'none';  // 初始隐藏

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'friend-request-delete-btn';
  deleteBtn.title = '删除';
  deleteBtn.innerHTML = '<span class="fa-solid fa-trash"></span>';

  // 点击删除
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleDeleteMessage(message, contactId, container);
  });

  actions.appendChild(deleteBtn);
  bubble.appendChild(actions);

  // ✅ 鼠标悬停3秒后显示删除按钮
  let hoverTimer = null;
  container.addEventListener('mouseenter', () => {
    hoverTimer = setTimeout(() => {
      actions.style.display = 'flex';
    }, 3000);  // 3秒后显示
  });

  container.addEventListener('mouseleave', () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    actions.style.display = 'none';
  });

  container.appendChild(bubble);

  logger.debug('phone','[FriendRequestMessage] 渲染好友申请消息:', message.content.substring(0, 20));
  return container;
}

/**
 * 处理删除消息
 * 
 * @private
 * @async
 * @param {Object} message - 消息对象
 * @param {string} contactId - 联系人ID
 * @param {HTMLElement} container - 消息容器元素
 */
async function handleDeleteMessage(message, contactId, container) {
  logger.info('phone','[FriendRequestMessage] 删除好友申请消息:', message.id);

  try {
    // 从聊天记录中删除
    const messages = await loadChatHistory(contactId);
    const filteredMessages = messages.filter(msg => msg.id !== message.id);
    await saveChatHistory(contactId, filteredMessages);

    // 从DOM中移除
    container.remove();

    showSuccessToast('已删除好友申请消息');
  } catch (error) {
    logger.error('phone','[FriendRequestMessage] 删除消息失败:', error);
  }
}

