/**
 * 转发消息渲染器
 * @module phone/messages/message-types/forwarded-message
 * 
 * @description
 * 渲染转发的聊天记录消息
 * 显示为卡片样式，包含原聊天记录的摘要
 */

import logger from '../../../../logger.js';
import { getUserDisplayName } from '../../utils/contact-display-helper.js';
import { getThumbnailUrl } from '../../../../../../../../../script.js';
import { bindLongPress } from '../../utils/message-actions-helper.js';
import { showCustomPopup } from '../../utils/popup-helper.js';

/**
 * 渲染转发消息
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.originalContactName - 原角色名称
 * @param {Array<Object>} message.messages - 转发的消息列表
 * @param {string} message.sender - 发送者（user或contact）
 * @param {number} message.time - 消息时间戳（秒）
 * @param {Object} contact - 当前联系人对象
 * @param {string} contactId - 当前联系人ID
 * @returns {HTMLElement} 消息气泡DOM
 * 
 * @example
 * const message = {
 *   type: 'forwarded',
 *   sender: 'user',
 *   originalContactName: '山光',
 *   messages: [
 *     { sender: 'user', senderName: '{{user}}', content: '你好', type: 'text' },
 *     { sender: 'contact', senderName: '山光', content: '你好啊', type: 'text' }
 *   ]
 * };
 */
export function renderForwardedMessage(message, contact, contactId) {
  logger.debug('[ForwardedMessage] 渲染转发消息');

  const userName = getUserDisplayName();

  const container = document.createElement('div');
  container.className = 'chat-msg';

  // 转发消息始终是用户发送的，显示在右侧
  const isSent = message.sender === 'user';
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');

  // 设置完整的 data- 属性（用于删除、多选等操作）
  container.dataset.msgId = message.id;
  container.dataset.messageTime = message.time.toString();
  container.dataset.time = message.time.toString();
  container.dataset.sender = message.sender;
  container.dataset.type = 'forwarded';
  container.dataset.contactId = contactId;

  // 创建头像
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

  // 转发消息卡片（作为气泡内容）
  const card = document.createElement('div');
  card.className = 'chat-msg-forwarded-card';

  // 标题行（图标 + "{{user}}与原角色的聊天记录"）
  const header = document.createElement('div');
  header.className = 'forwarded-header';
  
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-clipboard';
  
  const title = document.createElement('span');
  title.textContent = `${userName}与${message.originalContactName}的聊天记录`;
  
  header.appendChild(icon);
  header.appendChild(title);
  card.appendChild(header);

  // 消息内容区（最多显示3条）
  const content = document.createElement('div');
  content.className = 'forwarded-content';

  const displayMessages = message.messages.slice(0, 3);
  displayMessages.forEach(msg => {
    const msgLine = document.createElement('div');
    msgLine.className = 'forwarded-msg-line';
    
    // 替换{{user}}为实际用户名
    let senderName = msg.senderName;
    if (senderName === '{{user}}') {
      senderName = userName;
    }
    
    // 获取消息预览文本
    const previewText = getMessagePreviewText(msg);
    
    msgLine.textContent = `${senderName}：${previewText}`;
    content.appendChild(msgLine);
  });

  card.appendChild(content);

  // 总结行（如果超过3条）
  if (message.messages.length > 3) {
    const summary = document.createElement('div');
    summary.className = 'forwarded-summary';
    summary.textContent = `······ 共${message.messages.length}条消息`;
    
    // 点击summary预览全部消息
    summary.addEventListener('click', (e) => {
      e.stopPropagation();
      showForwardedMessagePreview(message, userName);
    });
    
    card.appendChild(summary);
  }

  // 创建气泡容器（包裹卡片）
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble';
  bubble.appendChild(card);

  // 组装（统一DOM顺序：头像在前，气泡在后）
  container.appendChild(avatar);
  container.appendChild(bubble);

  // ✅ 绑定长按操作菜单（支持删除/转发/收藏/多选，禁用引用）
  // 注：转发消息禁用引用是为了避免引用嵌套（引用一个转发消息会导致结构复杂）
  if (contactId) {
    bindLongPress(container, message, contactId, {
      disableQuote: true  // 转发消息不适合被引用（避免嵌套）
    });
  }

  return container;
}

/**
 * 获取消息预览文本（根据类型格式化）
 * 
 * @private
 * @param {Object} msg - 消息对象
 * @returns {string} 预览文本
 */
function getMessagePreviewText(msg) {
  const maxLength = 20; // 最多显示20字

  switch (msg.type) {
    case 'text':
      return truncateText(msg.content || '', maxLength);
    
    case 'emoji':
      return `[表情] ${msg.emojiName || ''}`;
    
    case 'image':
      return `[图片] ${truncateText(msg.description || '无描述', maxLength)}`;
    
    case 'quote':
      return `[引用] ${truncateText(msg.replyContent || '', maxLength)}`;
    
    case 'transfer':
      return `[转账] ¥${msg.amount || '0'}`;
    
    case 'redpacket':
      return `[红包] ¥${msg.amount || '0'}`;
    
    case 'video':
      return `[视频] ${truncateText(msg.description || '无描述', maxLength)}`;
    
    case 'file':
      return `[文件] ${msg.filename || '未知文件'}`;
    
    case 'recalled':
      return '[撤回的消息]';
    
    default:
      return truncateText(msg.content || '[未知消息]', maxLength);
  }
}

/**
 * 截断文本
 * 
 * @private
 * @param {string} text - 原文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 显示转发消息预览弹窗
 * 
 * @private
 * @param {Object} message - 转发消息对象
 * @param {string} userName - 用户显示名称
 */
function showForwardedMessagePreview(message, userName) {
  logger.debug('[ForwardedMessage] 显示全部消息预览');

  // 构造弹窗HTML
  const messageListHTML = message.messages.map((msg, index) => {
    // 替换{{user}}为实际用户名
    let senderName = msg.senderName;
    if (senderName === '{{user}}') {
      senderName = userName;
    }
    
    // 获取消息完整内容（不截断）
    const fullContent = getFullMessageContent(msg);
    
    return `
      <div class="forwarded-preview-item">
        <div class="forwarded-preview-sender">${senderName}</div>
        <div class="forwarded-preview-content">${fullContent}</div>
      </div>
    `;
  }).join('');

  const popupContent = `
    <div class="forwarded-preview-container">
      <div class="forwarded-preview-title">
        <i class="fa-solid fa-clipboard"></i>
        <span>${userName}与${message.originalContactName}的聊天记录</span>
      </div>
      <div class="forwarded-preview-list">
        ${messageListHTML}
      </div>
    </div>
  `;

  showCustomPopup('转发消息预览', popupContent, {
    buttons: [{ text: '关闭', value: 'close' }]
  });
}

/**
 * 获取消息完整内容（不截断）
 * 
 * @private
 * @param {Object} msg - 消息对象
 * @returns {string} 完整内容
 */
function getFullMessageContent(msg) {
  switch (msg.type) {
    case 'text':
      return msg.content || '';
    
    case 'emoji':
      return `[表情] ${msg.emojiName || ''}`;
    
    case 'image':
      return `[图片] ${msg.description || '无描述'}`;
    
    case 'quote':
      return `[引用] ${msg.replyContent || ''}`;
    
    case 'transfer':
      return `[转账] ¥${msg.amount || '0'}`;
    
    case 'redpacket':
      return `[红包] ¥${msg.amount || '0'}`;
    
    case 'video':
      return `[视频] ${msg.description || '无描述'}`;
    
    case 'file':
      return `[文件] ${msg.filename || '未知文件'}`;
    
    case 'recalled':
      return '[撤回的消息]';
    
    default:
      return msg.content || '[未知消息]';
  }
}
