import logger from '../../../../logger.js';
import { getThumbnailUrl } from '../../../../../../../../script.js';
import { showMessageActions } from '../../utils/message-actions-helper.js';

/**
 * 渲染图片消息气泡
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.sender - 发送者 ('user' | 'contact')
 * @param {string} message.description - 图片描述
 * @param {string} [message.imageUrl] - 图片链接（可选）
 * @param {Object} contact - 联系人对象
 * @param {string} contact.avatar - 联系人头像
 * @param {string} contact.name - 联系人名字
 * @param {string} [contactId] - 联系人ID（用于删除等操作）
 * @returns {HTMLElement} 消息DOM元素
 * 
 * @description
 * 根据是否有imageUrl选择不同的气泡模板：
 * - 无URL：正方形气泡，文字居中可滚动
 * - 有URL：图片+描述叠加
 */
export function renderImageMessage(message, contact, contactId) {
  logger.debug('[ImageMessage] 渲染图片消息:', message);

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
    // 联系人头像（使用getThumbnailUrl）
    avatar.src = getThumbnailUrl('avatar', contact?.avatar) || 'img/default-avatar.png';
  }

  // 创建气泡容器（图片消息不使用 chat-msg-bubble 类）
  const bubble = document.createElement('div');

  // 根据是否有URL选择模板
  if (message.imageUrl) {
    // 有URL：图片+描述
    bubble.className = 'chat-msg-bubble-image-with-url';

    const img = document.createElement('img');
    img.src = message.imageUrl;
    img.classList.add('chat-msg-image');
    img.alt = message.description || '图片';

    const descDiv = document.createElement('div');
    descDiv.classList.add('chat-msg-image-desc');
    descDiv.textContent = message.description || '';

    bubble.appendChild(img);
    bubble.appendChild(descDiv);
  } else {
    // 无URL：纯描述正方形气泡
    bubble.className = 'chat-msg-bubble-image-no-url';

    const placeholderDiv = document.createElement('div');
    placeholderDiv.classList.add('chat-msg-image-placeholder-text');
    placeholderDiv.textContent = message.description || '图片';

    bubble.appendChild(placeholderDiv);
  }

  // 添加点击事件（显示操作菜单）
  if (contactId) {
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      showMessageActions(container, message, contactId);
    });
  }

  // 组装（统一DOM顺序：头像在前，气泡在后）
  // CSS的flex-direction: row-reverse会控制视觉顺序
  container.appendChild(avatar);
  container.appendChild(bubble);

  return container;
}

