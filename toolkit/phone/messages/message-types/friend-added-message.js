/**
 * 添加好友消息渲染器
 * @module phone/messages/message-types/friend-added-message
 * 
 * @description
 * 渲染"添加好友"系统提示消息（居中显示，类似撤回消息）
 */

import logger from '../../../../logger.js';

/**
 * 渲染添加好友消息气泡
 * 
 * @param {Object} message - 系统消息对象
 * @param {string} message.content - 消息内容
 * @param {number} message.time - 时间戳（秒）
 * @returns {HTMLElement} 消息气泡元素
 * 
 * @example
 * const bubble = renderFriendAddedMessage({
 *   content: '{{user}}添加了你为好友',
 *   time: 1699999999
 * });
 */
export function renderFriendAddedMessage(message) {
  const container = document.createElement('div');
  container.className = 'chat-msg chat-msg-system-center';  // 居中显示
  container.dataset.msgId = message.id;

  // 创建系统提示气泡
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble system-hint-bubble';

  const hint = document.createElement('span');
  hint.className = 'system-hint-text';
  hint.textContent = message.content;

  bubble.appendChild(hint);
  container.appendChild(bubble);

  logger.debug('phone','[FriendAddedMessage] 渲染添加好友消息');
  return container;
}

