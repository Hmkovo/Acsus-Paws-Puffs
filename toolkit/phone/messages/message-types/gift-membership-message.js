/**
 * 会员送礼消息渲染器
 *
 * @description
 * 渲染会员送礼消息气泡
 * 职责：
 * - 渲染会员送礼气泡（用户送AI/AI送用户）
 * - 集成消息操作菜单（支持删除，不支持引用）
 * - 自动处理会员赠送（发送时给角色开会员，接收时给用户开会员）
 *
 * @module gift-membership-message
 */

import { getThumbnailUrl } from '../../../../../../../../script.js';
import logger from '../../../../logger.js';

/**
 * 已处理的会员送礼消息ID集合（防止重复处理）
 * @type {Set<string>}
 */
const savedGiftMembershipMessages = new Set();

/**
 * 从content解析会员送礼字段（兼容旧消息）
 *
 * @param {string} content - 消息内容（如"送你1个月SVIP会员"）
 * @returns {Object|null} 解析结果 { membershipType, months, duration }
 */
function parseContentToFields(content) {
  if (!content) return null;

  // 匹配格式：送你X个月的VIP/SVIP会员 或 送你X个月VIP/SVIP会员
  const match = content.match(/送.*?(\d+)个月.*?(VIP|SVIP)/i);
  if (!match) return null;

  const months = parseInt(match[1]);
  const membershipType = match[2].toLowerCase();
  const duration = months === 1 ? 30 : 365;

  return { membershipType, months, duration };
}

/**
 * 渲染会员送礼消息气泡
 *
 * @param {Object} message - 消息对象
 * @param {string} message.sender - 发送者（'user'或'contact'）
 * @param {string} message.membershipType - 会员类型（'vip'或'svip'）
 * @param {number} message.duration - 天数（30或365）
 * @param {number} message.months - 月数（1或12，用于显示）
 * @param {string} message.content - 显示文本
 * @param {number} message.time - 时间戳（秒级）
 * @param {string} message.id - 消息ID
 * @param {Object} contact - 联系人对象
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement} 消息气泡DOM元素
 */
export function renderGiftMembershipMessage(message, contact, contactId) {
  logger.debug('phone', '[GiftMembershipMessage]] 开始渲染会员送礼消息');
  logger.debug('phone', '[GiftMembershipMessage]] 消息对象:', message);
  logger.debug('phone', '[GiftMembershipMessage]] contactId:', contactId);

  // ✅ 容错处理：如果旧消息缺少字段，从content解析
  if (!message.membershipType || !message.months || !message.duration) {
    logger.warn('phone', '[GiftMembershipMessage]] 检测到旧格式消息，尝试从content解析字段');
    const parseResult = parseContentToFields(message.content);
    if (parseResult) {
      message.membershipType = parseResult.membershipType;
      message.months = parseResult.months;
      message.duration = parseResult.duration;
      logger.debug('phone', '[GiftMembershipMessage]] 解析成功:', parseResult);
    } else {
      logger.error('phone', '[GiftMembershipMessage]] 无法解析content，使用默认值');
      message.membershipType = 'vip';
      message.months = 1;
      message.duration = 30;
    }
  }

  const container = document.createElement('div');
  container.className = 'chat-msg';

  // 判断是发送还是接收
  const isSent = message.sender === 'user';
  logger.debug('phone', '[GiftMembershipMessage]] isSent:', isSent);

  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');
  container.setAttribute('data-msg-id', message.id);
  container.setAttribute('data-message-time', message.time.toString());

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

  // 创建会员送礼气泡
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble chat-msg-bubble-gift-membership';

  // 根据会员类型决定颜色
  const isVIP = message.membershipType === 'vip';
  const typeClass = isVIP ? 'vip' : 'svip';
  const typeColor = isVIP ? '#c94e50' : '#cea77c';
  const typeText = isVIP ? 'VIP' : 'SVIP';

  // 顶部区域（渐变背景）
  const header = document.createElement('div');
  header.className = `chat-msg-gift-membership-header ${typeClass}`;
  header.style.background = isVIP
    ? 'linear-gradient(135deg, #c94e50 0%, #d66668 100%)'
    : 'linear-gradient(135deg, #cea77c 0%, #d9b88e 100%)';

  // 会员图标
  const icon = document.createElement('div');
  icon.className = 'chat-msg-gift-membership-icon';
  icon.innerHTML = '<i class="fa-solid fa-crown"></i>';
  header.appendChild(icon);

  // 会员类型和月数
  const top = document.createElement('div');
  top.className = 'chat-msg-gift-membership-top';

  // 会员类型
  const typeLabel = document.createElement('div');
  typeLabel.className = 'chat-msg-gift-membership-type';
  typeLabel.textContent = typeText + '会员';
  top.appendChild(typeLabel);

  // 月数
  const monthsLabel = document.createElement('div');
  monthsLabel.className = 'chat-msg-gift-membership-months';
  monthsLabel.textContent = `${message.months}个月`;
  top.appendChild(monthsLabel);

  header.appendChild(top);
  bubble.appendChild(header);

  // 底部区域（白色背景）
  const body = document.createElement('div');
  body.className = 'chat-msg-gift-membership-body';

  // 显示文本
  const text = document.createElement('div');
  text.className = 'chat-msg-gift-membership-text';
  text.textContent = message.content || (isSent ? `送你${message.months}个月的${typeText}会员` : `送了你${message.months}个月的${typeText}会员`);
  body.appendChild(text);

  bubble.appendChild(body);

  container.appendChild(avatar);
  container.appendChild(bubble);

  // 长按操作菜单由 message-chat-ui.js 统一绑定

  logger.info('phone', '[GiftMembershipMessage]] ✅ 会员送礼消息渲染完成:', message.id);

  // 自动处理会员赠送（双层去重机制）
  // 第一层：内存去重（防止同一会话中重复渲染）
  // 第二层：持久化去重（在grantMembership中检查grantedByMsgId，防止跨会话重复）
  if (savedGiftMembershipMessages.has(message.id)) {
    logger.debug('phone', '[GiftMembershipMessage]] 跳过会员赠送处理（内存去重）msgId:', message.id);
  } else {
    if (isSent) {
      // 用户送AI：给角色开通会员
      handleGiftToCharacter(contactId, message);
    } else {
      // AI送用户：给用户开通会员
      handleGiftToUser(message);
    }
  }

  logger.info('phone', '[GiftMembershipMessage]] ✅ 会员送礼消息渲染完成:', message.id);
  return container;
}

/**
 * 处理用户送角色会员（给角色开通会员）
 *
 * @description
 * 当渲染用户发送的会员送礼消息时，自动调用此函数给角色开通会员
 * 防止重复处理：使用 savedGiftMembershipMessages 集合记录已处理的消息ID
 *
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} message - 会员送礼消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.membershipType - 会员类型
 * @param {number} message.duration - 天数
 */
async function handleGiftToCharacter(contactId, message) {
  logger.debug('phone', '[GiftMembershipMessage]] 处理用户送角色会员，msgId:', message.id);

  try {
    // 标记为正在处理（防止异步期间重复调用）
    savedGiftMembershipMessages.add(message.id);

    // 导入会员模块
    const { grantCharacterMembership } = await import('../../data-storage/storage-membership.js');

    // 给角色开通会员（自动更新会员数据、触发事件）
    await grantCharacterMembership(contactId, message.membershipType, message.duration, {
      from: 'user-gift',
      msgId: message.id
    });

    logger.info('phone', '[GiftMembershipMessage]] ✅ 角色会员已开通:', message.membershipType, message.duration, 'msgId:', message.id);

    // ✅ 保存交易记录到钱包（礼物-支出）
    const { addTransaction } = await import('../../data-storage/storage-wallet.js');
    await addTransaction({
      contactId,
      type: 'gift',
      direction: 'sent',
      amount: message.price || 0,
      itemName: `${message.membershipType === 'vip' ? 'VIP' : 'SVIP'}会员 ${message.months}个月`,
      time: message.time,
      relatedMsgId: message.id  // 关联消息ID（用于回退）
    });
    logger.debug('phone', '[GiftMembershipMessage]] 交易记录已保存（支出）');

    // 注：grantCharacterMembership 已通过 stateManager.set 自动触发角色会员变化通知，不需要重复触发
    // 注：addTransaction 已通过 stateManager.set 自动触发钱包数据变化通知，不需要重复触发
  } catch (error) {
    logger.error('phone', '[GiftMembershipMessage]] ❌ 角色会员开通失败:', error);
    // 处理失败时移除标记，允许下次重试
    savedGiftMembershipMessages.delete(message.id);
  }
}

/**
 * 处理角色送用户会员（给用户开通会员）
 *
 * @description
 * 当渲染角色发送的会员送礼消息时，自动调用此函数给用户开通会员
 * 防止重复处理：使用 savedGiftMembershipMessages 集合记录已处理的消息ID
 *
 * @async
 * @param {Object} message - 会员送礼消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.membershipType - 会员类型
 * @param {number} message.duration - 天数
 */
async function handleGiftToUser(message) {
  logger.debug('phone', '[GiftMembershipMessage]] 处理角色送用户会员，msgId:', message.id);

  try {
    // 标记为正在处理
    savedGiftMembershipMessages.add(message.id);

    // 导入会员模块
    const { grantUserMembership } = await import('../../data-storage/storage-membership.js');

    // 给用户开通会员（自动更新会员数据、触发事件）
    await grantUserMembership(message.membershipType, message.duration, {
      from: 'character-gift',
      msgId: message.id
    });

    logger.info('phone', '[GiftMembershipMessage]] ✅ 用户会员已开通:', message.membershipType, message.duration, 'msgId:', message.id);

    // ✅ 保存交易记录到钱包（礼物-收入）
    // 注意：需要从消息中提取contactId（由于chats是按contactId组织的）
    const { addTransaction } = await import('../../data-storage/storage-wallet.js');
    const { loadData } = await import('../../data-storage/storage-api.js');

    // 查找发送者contactId（在chats中搜索包含该消息的聊天）
    const chats = (await loadData('chats')) || {};
    let senderContactId = null;
    for (const [cid, chatHistory] of Object.entries(chats)) {
      if (chatHistory.some(msg => msg.id === message.id)) {
        // ✅ 移除 'chat_' 前缀（chats 的键名为 'chat_xxx'，但 contactId 应该是 'tavern_xxx'）
        senderContactId = cid.startsWith('chat_') ? cid.replace('chat_', '') : cid;
        break;
      }
    }

    if (senderContactId) {
      // ✅ 礼物记录：不需要金额，主要记录物品名称
      await addTransaction({
        contactId: senderContactId,  // ✅ 已移除 'chat_' 前缀
        type: 'gift',
        direction: 'received',
        amount: 0,  // ✅ 礼物金额为0（往来记录主要看itemName）
        itemName: `${message.membershipType === 'vip' ? 'VIP' : 'SVIP'}会员 ${message.duration}天`,
        time: message.time,
        relatedMsgId: message.id  // 关联消息ID（用于回退）
      });
      logger.debug('phone', '[GiftMembershipMessage]] 交易记录已保存（收入）');

      // 注：addTransaction 已通过 stateManager.set 自动触发钱包数据变化通知，不需要重复触发
      logger.debug('phone', '[GiftMembershipMessage]] 已触发钱包数据变化事件');
    } else {
      logger.warn('phone', '[GiftMembershipMessage]] 未找到发送者contactId，无法保存交易记录');
    }

    // 注意：grantUserMembership 已通过 stateManager.set('userMembership') 自动通知订阅者，不需要重复触发
  } catch (error) {
    logger.error('phone', '[GiftMembershipMessage]] ❌ 用户会员开通失败:', error);
    // 处理失败时移除标记，允许下次重试
    savedGiftMembershipMessages.delete(message.id);
  }
}
