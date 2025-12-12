/**
 * 文字消息渲染器
 * @module phone/messages/message-types/text-message
 */

import { getThumbnailUrl } from '../../../../../../../../script.js';

/**
 * 渲染文字消息气泡
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.sender - 发送者（'user' | 'contact'）
 * @param {string} message.content - 消息内容
 * @param {number} message.time - 时间戳（秒）
 * @param {Object} contact - 联系人对象（用于获取头像）
 * @param {string} [contactId] - 联系人ID（用于删除等操作）
 * @returns {HTMLElement} 消息气泡元素
 * 
 * @description
 * 渲染基础文字消息气泡
 * - 长按操作菜单由 message-chat-ui.js 统一绑定
 * - data- 属性由 renderSingleBubble 统一补充
 * 
 * @example
 * const bubble = renderTextMessage(
 *   { sender: 'user', content: '你好', time: 1729756800 },
 *   { avatar: 'path/to/avatar.png' },
 *   'tavern_张三'
 * );
 */
export function renderTextMessage(message, contact, contactId) {
  const container = document.createElement('div');
  container.className = 'chat-msg';

  // 判断是发送还是接收
  const isSent = message.sender === 'user';
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');

  // 创建头像
  const avatar = document.createElement('img');
  avatar.className = 'chat-msg-avatar';

  if (isSent) {
    // 用户头像（从顶部栏获取，完整路径，不压缩）
    const userAvatar = /** @type {HTMLImageElement} */ (document.querySelector('#phone-user-avatar'));
    avatar.src = userAvatar?.src || 'img/default-user.png';
  } else {
    // 联系人头像（使用getThumbnailUrl，不压缩）
    avatar.src = getThumbnailUrl('avatar', contact?.avatar) || 'img/default-avatar.png';
  }

  // 创建气泡
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble';
  bubble.textContent = message.content;

  // 组装（统一DOM顺序：头像在前，气泡在后）
  // CSS的flex-direction: row-reverse会控制视觉顺序
  container.appendChild(avatar);
  container.appendChild(bubble);

  return container;
}

/**
 * 渲染时间分隔线
 * 
 * @param {number} timestamp - 时间戳（秒）
 * @returns {HTMLElement} 时间分隔元素
 */
export function renderTimeSepar(timestamp) {
  const separator = document.createElement('div');
  separator.className = 'chat-time';

  // 格式化时间（简单版，后续可优化）
  const date = new Date(timestamp * 1000);
  const now = new Date();

  let timeStr;
  if (date.toDateString() === now.toDateString()) {
    // 今天：显示时间
    timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else {
    // 其他：显示日期+时间
    timeStr = date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  separator.textContent = timeStr;
  return separator;
}

