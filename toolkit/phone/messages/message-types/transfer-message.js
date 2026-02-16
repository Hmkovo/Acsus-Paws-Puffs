/**
 * 转账消息渲染器
 * 
 * @description
 * 渲染转账消息气泡
 * 职责：
 * - 渲染转账气泡（发送/接收样式）
 * - 集成消息操作菜单（支持删除，不支持引用）
 * - 自动处理转账到账（接收时保存转账记录）
 * 
 * @module transfer-message
 */

import { getThumbnailUrl } from '../../../../../../../../script.js';
import logger from '../../../../logger.js';

/**
 * 已处理的转账消息ID集合（防止重复保存）
 * @type {Set<string>}
 */
const savedTransferMessages = new Set();

/**
 * 渲染转账消息气泡
 * @param {Object} message - 消息对象
 * @param {string} message.sender - 发送者（'user'或'contact'）
 * @param {number} message.amount - 转账金额
 * @param {string} [message.message] - 转账留言
 * @param {number} message.time - 时间戳
 * @param {string} message.id - 消息ID
 * @param {Object} contact - 联系人对象
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement} 消息气泡DOM元素
 */
export function renderTransferMessage(message, contact, contactId) {
  logger.debug('phone','[TransferMessage] ==================== 开始渲染转账消息 ====================');
  logger.debug('phone','[TransferMessage] 消息对象:', message);
  logger.debug('phone','[TransferMessage] contact:', contact);
  logger.debug('phone','[TransferMessage] contactId:', contactId);
  
  const container = document.createElement('div');
  container.className = 'chat-msg';
  logger.debug('phone','[TransferMessage] container已创建');

  // 判断是发送还是接收
  const isSent = message.sender === 'user';
  logger.debug('phone','[TransferMessage] isSent:', isSent, 'sender:', message.sender);
  
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');
  container.setAttribute('data-msg-id', message.id);
  container.setAttribute('data-message-time', message.time.toString());
  
  logger.debug('phone','[TransferMessage] container类名和属性已设置:', {
    className: container.className,
    msgId: message.id,
    time: message.time
  });

  // 创建头像（完全照搬 text-message.js）
  logger.debug('phone','[TransferMessage] 开始创建头像');
  
  const avatar = document.createElement('img');
  avatar.className = 'chat-msg-avatar';

  if (isSent) {
    // 用户头像（从顶部栏获取，完整路径，不压缩）
    const userAvatar = /** @type {HTMLImageElement} */ (document.querySelector('#phone-user-avatar'));
    avatar.src = userAvatar?.src || 'img/default-user.png';
    logger.debug('phone','[TransferMessage] 用户头像src:', avatar.src);
  } else {
    // 联系人头像（使用getThumbnailUrl，不压缩）
    avatar.src = getThumbnailUrl('avatar', contact?.avatar) || 'img/default-avatar.png';
    logger.debug('phone','[TransferMessage] 联系人头像src:', avatar.src);
  }
  
  logger.debug('phone','[TransferMessage] 头像已创建');

  // 创建转账气泡
  logger.debug('phone','[TransferMessage] 开始创建转账气泡');
  
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble chat-msg-bubble-transfer';
  logger.debug('phone','[TransferMessage] bubble已创建，className:', bubble.className);

  // 顶部区域（蓝色渐变）
  const header = document.createElement('div');
  header.className = 'chat-msg-transfer-header';

  // 转账图标
  const icon = document.createElement('div');
  icon.className = 'chat-msg-transfer-icon';
  icon.innerHTML = '<i class="fa-solid fa-right-left"></i>';
  header.appendChild(icon);

  // 金额和留言区域
  const top = document.createElement('div');
  top.className = 'chat-msg-transfer-top';

  // 金额
  const amount = document.createElement('div');
  amount.className = 'chat-msg-transfer-amount';
  amount.textContent = `¥ ${message.amount}`;
  top.appendChild(amount);
  logger.debug('phone','[TransferMessage] 金额已添加:', message.amount);

  // 转账留言（如果有）
  if (message.message && message.message.trim()) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg-transfer-message';
    msg.textContent = message.message;
    top.appendChild(msg);
    logger.debug('phone','[TransferMessage] 留言已添加:', message.message);
  } else {
    logger.debug('phone','[TransferMessage] 无留言');
  }

  header.appendChild(top);
  bubble.appendChild(header);
  logger.debug('phone','[TransferMessage] header已添加到bubble');

  // 底部"转账"标签
  const body = document.createElement('div');
  body.className = 'chat-msg-transfer-body';
  const label = document.createElement('div');
  label.className = 'chat-msg-transfer-label';
  label.textContent = '转账';
  body.appendChild(label);
  bubble.appendChild(body);
  logger.debug('phone','[TransferMessage] body已添加到bubble');

  // 组装（统一DOM顺序：头像在前，气泡在后）
  // CSS的 flex-direction: row-reverse 会控制视觉顺序
  logger.debug('phone','[TransferMessage] 开始组装container');
  container.appendChild(avatar);
  container.appendChild(bubble);
  logger.debug('phone','[TransferMessage] container组装完成，子元素数量:', container.children.length);

  // 长按操作菜单由 message-chat-ui.js 统一绑定

  logger.info('phone','[TransferMessage] ✅ 转账消息渲染完成:', message.id);
  logger.debug('phone','[TransferMessage] 返回的container:', {
    tagName: container.tagName,
    className: container.className,
    childrenCount: container.children.length,
    msgId: container.getAttribute('data-msg-id')
  });
  logger.debug('phone','[TransferMessage] ==================== 渲染转账消息结束 ====================');

  // ✅ 自动处理转账到账（双层去重机制）
  // 第一层：内存去重（防止同一会话中重复渲染）
  // 第二层：持久化去重（在receiveTransfer中检查messageId，防止跨会话重复）
  if (message.sender === 'contact') {
    if (savedTransferMessages.has(message.id)) {
      logger.debug('phone','[TransferMessage] 跳过转账处理（内存去重）msgId:', message.id);
    } else {
      handleReceiveTransfer(contactId, message);
    }
  }

  logger.info('phone','[TransferMessage] ✅ 转账消息渲染完成:', message.id, '金额:', message.amount);
  logger.debug('phone','[TransferMessage] 返回的container:', {
    tagName: container.tagName,
    className: container.className,
    childrenCount: container.children.length,
    msgId: container.getAttribute('data-msg-id')
  });
  logger.debug('phone','[TransferMessage] ==================== 渲染转账消息结束 ====================');

  return container;
}

/**
 * 处理接收转账（保存转账记录到钱包）
 * 
 * @description
 * 当渲染AI发送的转账消息时，自动调用此函数保存转账记录
 * 防止重复保存：使用 savedTransferMessages 集合记录已处理的消息ID
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} message - 转账消息对象
 * @param {string} message.id - 消息ID
 * @param {number} message.amount - 转账金额
 * @param {string} [message.message] - 转账留言
 */
async function handleReceiveTransfer(contactId, message) {
  logger.debug('phone','[TransferMessage] 处理接收转账，msgId:', message.id);

  try {
    // 标记为正在处理（防止异步期间重复调用）
    savedTransferMessages.add(message.id);

    // 导入钱包模块
    const { receiveTransfer } = await import('../../data-storage/storage-wallet.js');

    // 保存转账记录（receiveTransfer 会自动更新余额、保存记录、触发事件）
    await receiveTransfer(contactId, message.amount, message.message || '', message.id);

    logger.info('phone','[TransferMessage] ✅ 转账已自动到账:', message.amount, 'msgId:', message.id);
  } catch (error) {
    logger.error('phone','[TransferMessage] ❌ 转账到账失败:', error);
    // 保存失败时移除标记，允许下次重试
    savedTransferMessages.delete(message.id);
  }
}
