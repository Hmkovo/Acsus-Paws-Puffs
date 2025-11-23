/**
 * 表情消息渲染器
 * @module phone/messages/message-types/emoji-message
 */

import logger from '../../../../logger.js';
import { findEmojiById } from '../../emojis/emoji-manager-data.js';
import { getThumbnailUrl } from '../../../../../../../../script.js';
import { bindLongPress } from '../../utils/message-actions-helper.js';

/**
 * 渲染表情消息
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.sender - 发送者（'user' 或 'contact'）
 * @param {string} message.content - 表情包ID（改用ID存储，支持改名）
 * @param {string} [message.emojiName] - 表情包名字（冗余存储，表情包删除后保留语境）
 * @param {Object} contact - 联系人对象（用于获取头像）
 * @param {string} [contactId] - 联系人ID（用于删除等操作）
 * @returns {HTMLElement} 消息气泡元素
 */
export function renderEmojiMessage(message, contact, contactId) {
  const emoji = findEmojiById(message.content);  // ← 改用ID查找

  if (!emoji) {
    logger.warn('[EmojiMessage] 找不到表情包 ID:', message.content, '名字:', message.emojiName);
    // 降级显示文字（表情包被删除，保留表情名字作为语境）
    return renderFallbackMessage(message, contact, contactId);
  }

  const container = document.createElement('div');
  container.className = 'chat-msg';

  // 判断是发送还是接收
  const isSent = message.sender === 'user';
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');

  // 创建头像（与text-message.js保持一致）
  const avatar = document.createElement('img');
  avatar.className = 'chat-msg-avatar';

  if (isSent) {
    // 用户头像（从顶部栏获取）
    const userAvatar = /** @type {HTMLImageElement} */ (document.querySelector('#phone-user-avatar'));
    avatar.src = userAvatar?.src || 'img/default-user.png';
  } else {
    // 联系人头像
    avatar.src = getThumbnailUrl('avatar', contact?.avatar) || 'img/default-avatar.png';
  }

  // 创建气泡容器（为了保持与demo一致的DOM结构）
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble';

  // 表情包图片
  const img = document.createElement('img');
  img.src = emoji.imagePath;
  img.alt = emoji.name;
  img.className = 'chat-msg-image';

  // 组装（统一DOM顺序：头像在前，气泡在后）
  bubble.appendChild(img);
  container.appendChild(avatar);
  container.appendChild(bubble);

  // ✅ 绑定长按操作菜单（支持删除/转发/收藏/多选，禁用引用）
  // 注：表情消息禁用引用是因为引用一个表情没有上下文意义
  if (contactId) {
    bindLongPress(container, message, contactId, {
      disableQuote: true  // 表情消息不适合被引用
    });
  }

  return container;
}

/**
 * 降级显示（表情包不存在时）
 * 
 * @private
 * @param {Object} message - 消息对象
 * @param {Object} contact - 联系人对象
 * @param {string} [contactId] - 联系人ID（用于删除等操作）
 * @returns {HTMLElement} 消息气泡元素
 * 
 * @description
 * 当表情包被删除或ID找不到时，显示降级文本
 * 优先显示保存的表情包名字（保留语境）
 */
function renderFallbackMessage(message, contact, contactId) {
  const container = document.createElement('div');
  container.className = 'chat-msg';

  // 判断是发送还是接收
  const isSent = message.sender === 'user';
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');

  // 创建头像
  const avatar = document.createElement('img');
  avatar.className = 'chat-msg-avatar';

  if (isSent) {
    // 用户头像
    const userAvatar = /** @type {HTMLImageElement} */ (document.querySelector('#phone-user-avatar'));
    avatar.src = userAvatar?.src || 'img/default-user.png';
  } else {
    // 联系人头像
    avatar.src = getThumbnailUrl('avatar', contact?.avatar) || 'img/default-avatar.png';
  }

  // 设置完整的 data- 属性
  container.dataset.msgId = message.id;
  container.dataset.messageTime = message.time.toString();
  container.dataset.time = message.time.toString();
  container.dataset.sender = message.sender;
  container.dataset.type = 'emoji';
  container.dataset.contactId = contactId;

  // 创建气泡（优先显示保存的表情包名字，保留语境）
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble';

  if (message.emojiName) {
    // 如果保存了名字，显示 [表情]企鹅震惊 (已删除)
    bubble.textContent = `[表情]${message.emojiName} (已删除)`;
  } else {
    // 旧数据兼容：没有保存名字
    bubble.textContent = '[表情包已删除]';
  }

  bubble.style.color = 'var(--phone-text-secondary)';
  bubble.style.fontStyle = 'italic';

  // 组装
  container.appendChild(avatar);
  container.appendChild(bubble);

  // ✅ 绑定长按操作菜单（支持删除/转发/收藏/多选，禁用引用）
  if (contactId) {
    bindLongPress(container, message, contactId, {
      disableQuote: true  // 表情消息不适合被引用
    });
  }

  return container;
}

