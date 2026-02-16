import logger from '../../../../logger.js';
import { getThumbnailUrl } from '../../../../../../../../script.js';

/**
 * 渲染真实图片消息气泡（AI可识别）
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.sender - 发送者 ('user' | 'contact')
 * @param {string} message.imageUrl - 真实图片URL（必需）
 * @param {string} [message.description] - 图片描述（可选，显示在图片下方）
 * @param {number} message.imageRound - 图片所属轮次（必需，用于AI识别筛选）
 * @param {number} message.time - 消息时间戳
 * @param {Object} contact - 联系人对象
 * @param {string} contact.avatar - 联系人头像
 * @param {string} [contactId] - 联系人ID（用于删除等操作）
 * @returns {HTMLElement} 消息DOM元素
 * 
 * @description
 * 类型1：真实图片（AI识别）
 * - 显示真实图片缩略图
 * - 可选显示描述文本（在图片下方）
 * - 点击图片放大查看
 * - 包含 imageRound 字段供AI识别筛选
 * - 支持长按操作菜单（删除、收藏等）
 * 
 * @example
 * // 拍照消息
 * const message = {
 *   id: 'photo_123',
 *   sender: 'user',
 *   type: 'image-real',
 *   imageUrl: '/user/files/photo.jpg',
 *   description: '这是什么？',
 *   imageRound: 1,
 *   time: 1234567890
 * };
 */
export function renderImageRealMessage(message, contact, contactId) {
  logger.debug('phone','[ImageRealMessage]] 渲染真实图片消息:', message);

  const container = document.createElement('div');
  container.className = 'chat-msg';

  // 判断是发送还是接收
  const isSent = message.sender === 'user';
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');

  // 设置完整的 data- 属性（用于删除、多选等操作）
  container.dataset.msgId = message.id;
  container.dataset.messageTime = message.time.toString();
  container.dataset.time = message.time.toString();
  container.dataset.sender = message.sender;
  container.dataset.type = 'image-real';
  container.dataset.contactId = contactId;

  // 创建头像
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

  // 创建图片容器
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble-image';

  // 创建图片元素
  const img = document.createElement('img');
  img.src = message.imageUrl;
  img.className = 'chat-msg-image';
  img.alt = message.description || '图片';
  img.loading = 'lazy';

  // 点击图片放大查看
  img.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { showImagePreview } = await import('../../utils/image-helper.js');
    showImagePreview(message.imageUrl);
  });

  bubble.appendChild(img);

  // ✅ 如果有描述文本，显示在图片下方
  if (message.description && message.description.trim()) {
    const descriptionText = document.createElement('div');
    descriptionText.className = 'chat-msg-image-description';
    descriptionText.textContent = message.description;
    bubble.appendChild(descriptionText);
  }

  // 组装（统一DOM顺序：头像在前，气泡在后）
  // CSS的flex-direction: row-reverse会控制视觉顺序
  container.appendChild(avatar);
  container.appendChild(bubble);

  // 长按操作菜单由 message-chat-ui.js 统一绑定

  return container;
}
