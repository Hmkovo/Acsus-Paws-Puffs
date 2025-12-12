import logger from '../../../../logger.js';
import { getThumbnailUrl } from '../../../../../../../../script.js';

/**
 * 渲染假装图片消息气泡（AI过家家，不识别）
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.sender - 发送者 ('user' | 'contact')
 * @param {string} message.description - 图片描述（必需）
 * @param {string} [message.linkUrl] - 可选的图片链接URL（类型3）
 * @param {number} message.time - 消息时间戳
 * @param {Object} contact - 联系人对象
 * @param {string} contact.avatar - 联系人头像
 * @param {string} [contactId] - 联系人ID（用于删除等操作）
 * @returns {HTMLElement} 消息DOM元素
 * 
 * @description
 * 类型2/3：假装图片（AI过家家）
 * - 显示正方形气泡 + 描述文本居中
 * - 类型2：纯描述（无linkUrl）
 * - 类型3：描述 + 链接（有linkUrl，点击气泡可查看）
 * - 不包含 imageRound（AI不处理）
 * - 支持长按操作菜单（删除、收藏等）
 * 
 * @example
 * // 类型2：纯描述
 * const message = {
 *   id: 'fake_img_123',
 *   sender: 'contact',
 *   type: 'image-fake',
 *   description: '一只可爱的猫咪',
 *   time: 1234567890
 * };
 * 
 * // 类型3：描述 + 链接
 * const message = {
 *   id: 'fake_img_456',
 *   sender: 'user',
 *   type: 'image-fake',
 *   description: '我的新头像',
 *   linkUrl: 'https://example.com/avatar.jpg',
 *   time: 1234567890
 * };
 */
export function renderImageFakeMessage(message, contact, contactId) {
  logger.debug('[ImageFakeMessage] 渲染假装图片消息:', message);

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
  container.dataset.type = 'image-fake';
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

  // 创建假装图片气泡（正方形+文字居中）
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble chat-msg-bubble-fake-image';

  // 描述文本
  const descriptionSpan = document.createElement('span');
  descriptionSpan.textContent = message.description || '图片';

  bubble.appendChild(descriptionSpan);

  // ✅ 类型3：如果有链接，添加点击预览功能
  if (message.linkUrl) {
    bubble.style.cursor = 'pointer';
    bubble.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { showImagePreview } = await import('../../utils/image-helper.js');
      showImagePreview(message.linkUrl);
    });
  }

  // 组装（统一DOM顺序：头像在前，气泡在后）
  container.appendChild(avatar);
  container.appendChild(bubble);

  // 长按操作菜单由 message-chat-ui.js 统一绑定

  return container;
}
