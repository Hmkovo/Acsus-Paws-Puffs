/**
 * 撤回消息渲染器
 * @module phone/messages/message-types/recalled-message
 */

import logger from '../../../../logger.js';
import { getThumbnailUrl } from '../../../../../../../../script.js';
import { getContactDisplayName } from '../../utils/contact-display-helper.js';

/**
 * 渲染撤回消息气泡
 * 
 * @param {Object} message - 撤回消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.sender - 发送者（'user' | 'contact'）
 * @param {string} [message.role] - 角色名称（contact消息需要）
 * @param {number} message.time - 原消息时间戳（秒）
 * @param {number} message.recalledTime - 撤回时间戳（秒）
 * @param {string} [message.originalContent] - 原始消息内容（用于偷看）
 * @param {string} [message.originalType] - 原始消息类型（text/emoji/image等）
 * @param {boolean} [message.canPeek] - 是否可以偷看（角色撤回时为true）
 * @param {Object} contact - 联系人对象（用于获取头像和名称）
 * @param {string} [contactId] - 联系人ID（用于操作）
 * @returns {HTMLElement} 撤回消息气泡元素
 * 
 * @example
 * const bubble = renderRecalledMessage(
 *   { 
 *     sender: 'contact', 
 *     role: '张三',
 *     time: 1729756800,
 *     recalledTime: 1729756810,
 *     originalContent: '我喜欢你',
 *     originalType: 'text',
 *     canPeek: true
 *   },
 *   { avatar: 'path/to/avatar.png', name: '张三' },
 *   'tavern_张三'
 * );
 */
export function renderRecalledMessage(message, contact, contactId) {
  const container = document.createElement('div');
  container.className = 'chat-msg chat-msg-recalled';  // 添加特殊类名（用于隐藏头像、居中显示）

  // 判断是发送还是接收
  const isSent = message.sender === 'user';
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');

  // 设置完整的 data- 属性（用于删除、多选等操作）
  container.dataset.msgId = message.id;
  container.dataset.messageTime = message.time.toString();
  container.dataset.time = message.time.toString();
  container.dataset.sender = message.sender;
  container.dataset.type = 'recalled';
  container.dataset.contactId = contactId;

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

  // 创建撤回提示气泡
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble recalled-bubble';
  bubble.dataset.msgId = message.id;

  // 撤回提示文字
  const hintText = isSent
    ? '你撤回了一条消息'
    : `${message.role || getContactDisplayName(contact)}撤回了一条消息`;

  const hint = document.createElement('span');
  hint.className = 'recalled-hint-text';
  hint.textContent = hintText;

  bubble.appendChild(hint);

  // 角色撤回消息可以偷看
  if (!isSent && message.canPeek && message.originalContent) {
    const peekBtn = document.createElement('span');
    peekBtn.className = 'recalled-peek-btn';
    peekBtn.textContent = '偷看';
    peekBtn.onclick = (e) => {
      e.stopPropagation();  // 防止触发长按菜单
      showPeekPopup(message, contact);
    };
    bubble.appendChild(peekBtn);
  }

  // 用户撤回消息也可以偷看（查看自己撤回了什么）
  if (isSent && message.originalContent) {
    const peekBtn = document.createElement('span');
    peekBtn.className = 'recalled-peek-btn';
    peekBtn.textContent = '偷看';
    peekBtn.onclick = (e) => {
      e.stopPropagation();
      showPeekPopup(message, contact);
    };
    bubble.appendChild(peekBtn);
  }

  // 组装容器
  container.appendChild(avatar);
  container.appendChild(bubble);

  // 长按操作菜单由 message-chat-ui.js 统一绑定

  return container;
}

/**
 * 显示偷看弹窗
 * 
 * @private
 * @async
 * @param {Object} message - 撤回消息对象
 * @param {Object} contact - 联系人对象
 * 
 * @description
 * 根据原始消息类型渲染偷看内容（文字/表情/图片等）
 */
async function showPeekPopup(message, contact) {
  const { showCustomPopup } = await import('../../utils/popup-helper.js');
  const { getUserDisplayName } = await import('../../utils/contact-display-helper.js');

  logger.info('phone','[RecalledMessage] 偷看撤回的消息，类型:', message.originalType);

  // 根据原始类型渲染内容
  let content = '';
  const isSent = message.sender === 'user';
  const senderName = isSent ? getUserDisplayName() : (message.role || getContactDisplayName(contact));

  switch (message.originalType) {
    case 'text':
      content = `<div class="recalled-peek-content">${escapeHtml(message.originalContent)}</div>`;
      break;

    case 'emoji':
      content = `<div class="recalled-peek-content">[表情]${escapeHtml(message.emojiName || message.originalContent)}</div>`;
      break;

    case 'image':
      content = `<div class="recalled-peek-content">
        <div>[图片]${escapeHtml(message.description || '')}</div>
        ${message.imageUrl ? `<img src="${message.imageUrl}" style="max-width: 100%; margin-top: 10px; border-radius: 4px;">` : ''}
      </div>`;
      break;

    case 'quote':
      content = `<div class="recalled-peek-content">
        <div style="color: #888; font-size: 13px; margin-bottom: 5px;">引用了一条消息</div>
        <div>${escapeHtml(message.replyContent || message.originalContent)}</div>
      </div>`;
    case 'transfer':
      content = `<div class="recalled-peek-content">
        <div>[转账]</div>
        <div>金额：¥${message.amount || 0}</div>
      </div>`;
      break;

    case 'gift-membership':
      const typeText = message.membershipType === 'vip' ? 'VIP' : 'SVIP';
      content = `<div class="recalled-peek-content">
        <div>[送会员]</div>
        <div>${message.months}个月${typeText}会员</div>
      </div>`;
      break;

    case 'buy-membership':
      const buyTypeText = message.membershipType === 'vip' ? 'VIP' : 'SVIP';
      content = `<div class="recalled-peek-content">
        <div>[开会员]</div>
        <div>${message.months}个月${buyTypeText}会员</div>
      </div>`;
      break;

    case 'quote':
      content = `<div class="recalled-peek-content">
        <div style="color: #888; font-size: 13px; margin-bottom: 5px;">引用了一条消息</div>
        <div>${escapeHtml(message.replyContent || message.originalContent)}</div>
      </div>`;
      break;

    default:
      content = `<div class="recalled-peek-content">${escapeHtml(message.originalContent || '(无法显示)')}</div>`;
  }

  // ✅ 修复：showCustomPopup 参数是 (title, contentHTML, options)，不是对象
  showCustomPopup(`${senderName}撤回的消息`, content, {
    buttons: [
      { text: '关闭', value: null }
    ]
  });
}

/**
 * HTML转义（防止XSS）
 * 
 * @private
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

