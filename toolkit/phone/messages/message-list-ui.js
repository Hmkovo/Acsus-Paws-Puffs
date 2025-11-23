/**
 * 消息列表界面
 * @module phone/messages/message-list-ui
 */

import logger from '../../../logger.js';
import { loadRecentChats } from './message-chat-data.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { getThumbnailUrl } from '../../../../../../../script.js';
import { findEmojiById } from '../emojis/emoji-manager-data.js';
import { registerListener, destroyPageListeners } from '../utils/listener-manager.js';
import { bindUnreadBadgeListener } from './unread-badge-manager.js';

/**
 * 渲染消息列表
 * 
 * @async
 * @returns {Promise<HTMLElement>} 消息列表容器
 */
export async function renderMessageList() {
  logger.debug('[MessageList] 渲染消息列表');

  const container = document.createElement('div');
  container.id = 'phone-tab-messages';
  container.className = 'phone-tab active';

  // 创建搜索框
  const searchBar = createSearchBar();
  container.appendChild(searchBar);

  // 创建消息列表容器
  const listContainer = document.createElement('div');
  listContainer.className = 'msg-list';
  container.appendChild(listContainer);

  // 加载并渲染最近聊天
  await loadAndRenderChats(listContainer);

  // ✅ 绑定全局消息接收事件监听器
  bindMessageReceivedListener(listContainer);

  // ✅ 绑定未读徽章UI更新监听器
  bindUnreadBadgeListener(listContainer);

  logger.debug('[MessageList] 消息列表渲染完成');
  return container;
}

/**
 * 创建搜索框
 * @private
 */
function createSearchBar() {
  const searchBar = document.createElement('div');
  searchBar.className = 'msg-search-bar';
  searchBar.innerHTML = `
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="text" placeholder="搜索">
  `;
  return searchBar;
}

/**
 * 加载并渲染最近聊天列表
 * @private
 * @async
 */
async function loadAndRenderChats(listContainer) {
  // 加载最近聊天
  const recentChats = await loadRecentChats();

  if (recentChats.length === 0) {
    logger.debug('[MessageList] 没有聊天记录');
    listContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 2em;">暂无聊天记录</div>';
    return;
  }

  // 加载联系人数据（用于获取头像和名字）
  const contacts = await loadContacts();

  // 合并联系人数据到聊天项（用于排序）
  const chatItemsWithContact = recentChats
    .map(chatItem => {
      const contact = contacts.find(c => c.id === chatItem.contactId);
      if (!contact) {
        logger.warn('[MessageList] 联系人不存在，跳过:', chatItem.contactId);
        return null;
      }
      return { contact, chatItem };
    })
    .filter(item => item !== null);

  // 排序：置顶优先，同组按时间降序
  sortChatItems(chatItemsWithContact);

  // 渲染每个聊天项
  chatItemsWithContact.forEach(({ contact, chatItem }) => {
    const item = createMessageItem(contact, chatItem);
    listContainer.appendChild(item);
  });

  logger.debug('[MessageList] 渲染完成，共', chatItemsWithContact.length, '个聊天');
}

/**
 * 排序聊天项（置顶优先，同组按时间降序）
 * 
 * @private
 * @param {Array<Object>} chatItemsWithContact - 聊天项数组（包含contact和chatItem）
 * 
 * @description
 * 排序规则：
 * 1. 置顶的（isPinned=true）排在前面
 * 2. 置顶的之间按最新消息时间降序
 * 3. 非置顶的按最新消息时间降序
 */
function sortChatItems(chatItemsWithContact) {
  chatItemsWithContact.sort((a, b) => {
    const isPinnedA = a.contact.isPinned || false;
    const isPinnedB = b.contact.isPinned || false;

    // 1. 先按置顶排序
    if (isPinnedA && !isPinnedB) return -1; // A置顶，A排前面
    if (!isPinnedA && isPinnedB) return 1;  // B置顶，B排前面

    // 2. 同组内按时间降序（最新的排前面）
    return b.chatItem.lastMessage.time - a.chatItem.lastMessage.time;
  });
}

/**
 * 格式化预览文本（根据消息类型）
 * 
 * @private
 * @param {Object} lastMessage - 最后一条消息
 * @param {string} lastMessage.type - 消息类型（'text' | 'emoji'）
 * @param {string} lastMessage.content - 消息内容（文字）或表情ID
 * @param {string} [lastMessage.emojiName] - 表情包名字（表情消息专用，保留语境）
 * @returns {string} 格式化后的预览文本
 * 
 * @description
 * 根据消息类型格式化预览文字：
 * - 表情消息：优先显示冗余存储的 emojiName（表情包删除后仍能保留语境）
 * - 文字消息：显示文本内容（最多30字符）
 * - 包含防御性检查，即使数据损坏也不会崩溃
 */
function formatPreviewText(lastMessage) {
  // 防御：检查消息有效性
  if (!lastMessage || typeof lastMessage !== 'object') {
    logger.warn('[formatPreviewText] 无效的lastMessage:', lastMessage);
    return '(消息加载失败)';
  }

  const { type, content, emojiName } = lastMessage;
  // @ts-ignore - 引用消息有额外字段 replyContent 和 quotedMessage
  const { replyContent } = lastMessage;

  if (type === 'emoji') {
    // 表情消息：显示 [表情]表情名
    // 优先使用冗余存储的名字（表情包删除后仍能保留语境）
    if (emojiName) {
      return `[表情]${emojiName}`;
    } else {
      // 旧数据兼容：通过ID查找
      const emoji = findEmojiById(content);
      if (emoji) {
        return `[表情]${emoji.name}`;
      } else {
        // 表情包不存在且没有保存名字
        return '[表情]';
      }
    }
  } else if (type === 'quote') {
    // 引用消息：显示回复内容
    if (typeof replyContent === 'string') {
      const preview = replyContent.substring(0, 30);
      return preview.length < replyContent.length
        ? preview + '...'
        : preview;
    } else {
      return '[引用消息]';
    }
  } else if (type === 'image') {
    // 图片消息：显示 [图片]描述
    // @ts-ignore - 图片消息有 description 字段
    const { description } = lastMessage;
    if (description) {
      return `[图片]${description.substring(0, 20)}`;
    } else {
      return '[图片]';
    }
  } else if (type === 'transfer') {
    // 转账消息：显示 [转账] ¥金额
    // @ts-ignore - 转账消息有 amount 和 message 字段
    const { amount, message: transferMsg } = lastMessage;
    if (transferMsg) {
      return `[转账] ¥${amount} ${transferMsg.substring(0, 10)}`;
    } else {
      return `[转账] ¥${amount}`;
    }
  } else if (type === 'text') {
    // 文字消息：正常截取
    // 防御：检查content有效性
    if (typeof content !== 'string') {
      logger.warn('[formatPreviewText] content不是字符串:', { type, content });
      return '(文本消息损坏)';
    }

    const lastContent = content.substring(0, 30);
    return lastContent.length < content.length
      ? lastContent + '...'
      : lastContent;
  } else {
    // 未知类型：显示类型名
    return `[${type || '未知消息'}]`;
  }
}

/**
 * 创建单个消息项
 * 
 * @private
 * @param {Object} contact - 联系人对象
 * @param {Object} chatItem - 聊天项对象
 * @param {Object} chatItem.lastMessage - 最后一条消息
 * @param {number} chatItem.unreadCount - 未读消息数
 * @returns {HTMLElement} 消息项元素
 */
function createMessageItem(contact, chatItem) {
  const item = document.createElement('div');
  item.className = 'msg-item';
  item.dataset.contactId = contact.id;

  // 获取显示名称
  const displayName = getContactDisplayName(contact);

  // 格式化最后消息内容（复用格式化逻辑）
  const previewText = formatPreviewText(chatItem.lastMessage);

  // 格式化时间
  const timeStr = formatMessageTime(chatItem.lastMessage.time);

  // 获取头像URL
  const avatarUrl = contact.avatar
    ? getThumbnailUrl('avatar', contact.avatar)
    : 'https://i.postimg.cc/LXQrd0s0/icon.jpg';

  // 创建HTML
  item.innerHTML = `
    <div class="msg-item-avatar-wrapper">
      <img src="${avatarUrl}" alt="${displayName}" class="msg-item-avatar" 
           onerror="this.src='https://i.postimg.cc/LXQrd0s0/icon.jpg'">
      ${chatItem.unreadCount > 0 ? `<div class="msg-item-badge">${chatItem.unreadCount}</div>` : ''}
    </div>
    <div class="msg-item-content">
      <div class="msg-item-header">
        <div class="msg-item-name">${displayName}</div>
        <div class="msg-item-time">${timeStr}</div>
      </div>
      <div class="msg-item-preview">${previewText}</div>
    </div>
  `;

  // 绑定点击事件
  item.addEventListener('click', async () => {
    logger.info('[MessageList] 点击聊天项，跳转到聊天页面:', contact.id);

    const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    if (overlay) {
      const { showPage } = await import('../phone-main-ui.js');
      await showPage(overlay, 'chat', { contactId: contact.id });
    }
  });

  return item;
}

/**
 * 格式化消息时间
 * @private
 */
function formatMessageTime(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  // 今天：显示时间
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  }

  // 一周内：显示星期
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date > weekAgo) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[date.getDay()];
  }

  // 更早：显示日期
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 更新联系人项（最小化渲染）
 * 
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 发送消息后立即调用，局部更新消息列表中的预览文本、时间、未读徽章。
 * 复用 formatPreviewText 确保表情消息显示正确（不显示ID码）。
 */
export async function updateContactItem(contactId) {
  logger.debug('[MessageList] 更新联系人项:', contactId);

  // 查找对应的DOM元素
  const item = document.querySelector(`.msg-item[data-contact-id="${contactId}"]`);
  if (!item) {
    logger.warn('[MessageList] 未找到消息项DOM:', contactId);
    return;
  }

  // 重新加载数据
  const recentChats = await loadRecentChats();
  const chatItem = recentChats.find(c => c.contactId === contactId);

  if (!chatItem) {
    logger.warn('[MessageList] 未找到聊天数据:', contactId);
    return;
  }

  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  if (!contact) {
    logger.warn('[MessageList] 未找到联系人:', contactId);
    return;
  }

  // 局部更新：最后消息内容（复用格式化逻辑，支持表情消息）
  const previewEl = item.querySelector('.msg-item-preview');
  if (previewEl) {
    const previewText = formatPreviewText(chatItem.lastMessage);
    previewEl.textContent = previewText;
  }

  // 局部更新：时间
  const timeEl = item.querySelector('.msg-item-time');
  if (timeEl) {
    timeEl.textContent = formatMessageTime(chatItem.lastMessage.time);
  }

  // 注意：未读徽章更新已由 unread-badge-manager 通过事件驱动自动处理
  // 不需要在这里手动更新DOM

  logger.debug('[MessageList] 联系人项已更新');
}

/**
 * 标记为已读（已废弃，使用 unread-badge-manager 替代）
 * 
 * @deprecated 请使用 `clearUnread(contactId)` from './unread-badge-manager.js'
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 此函数已迁移到 unread-badge-manager.js 模块。
 * 新的设计通过事件驱动自动更新UI，调用 clearUnread() 即可。
 */
export async function markAsRead(contactId) {
  logger.warn('[MessageList] markAsRead已废弃，请使用 unread-badge-manager.clearUnread()');
  const { clearUnread } = await import('./unread-badge-manager.js');
  clearUnread(contactId);
}

/**
 * 更新消息项位置（局部更新，不重新渲染）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 置顶状态改变或接收到新消息时调用，重新计算该消息项的正确位置并移动DOM。
 * 不重新渲染整个列表，只移动单个DOM元素，实现最小化操作。
 */
export async function updateMessageItemPosition(contactId) {
  logger.debug('[MessageList] 更新消息项位置:', contactId);

  // 1. 查找该项的DOM元素
  const itemElement = document.querySelector(`.msg-item[data-contact-id="${contactId}"]`);
  if (!itemElement) {
    logger.warn('[MessageList] 未找到消息项DOM:', contactId);
    return;
  }

  // 2. 重新加载数据（获取最新状态）
  const recentChats = await loadRecentChats();
  const contacts = await loadContacts();

  // 3. 合并数据并排序
  const chatItemsWithContact = recentChats
    .map(chatItem => {
      const contact = contacts.find(c => c.id === chatItem.contactId);
      if (!contact) return null;
      return { contact, chatItem };
    })
    .filter(item => item !== null);

  sortChatItems(chatItemsWithContact);

  // 4. 计算正确位置
  const correctIndex = chatItemsWithContact.findIndex(
    item => item.contact.id === contactId
  );

  if (correctIndex === -1) {
    logger.warn('[MessageList] 未找到聊天数据:', contactId);
    return;
  }

  // 5. 移动DOM元素到正确位置
  const container = document.querySelector('.msg-list');
  if (!container) {
    logger.warn('[MessageList] 未找到消息列表容器');
    return;
  }

  // 获取目标位置的元素
  const targetElement = container.children[correctIndex];

  // 如果位置不对，移动DOM
  if (targetElement !== itemElement) {
    if (targetElement) {
      // 插入到目标元素之前
      container.insertBefore(itemElement, targetElement);
    } else {
      // 目标位置是末尾，直接追加
      container.appendChild(itemElement);
    }
    logger.debug('[MessageList] 消息项已移动到位置:', correctIndex);
  } else {
    logger.debug('[MessageList] 消息项位置正确，无需移动');
  }
}

/**
 * 从消息列表移除联系人项（删除聊天记录后调用）
 * 
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 删除聊天记录后，从消息列表UI移除该联系人项。
 * 如果列表为空，显示"暂无聊天记录"提示。
 */
export function removeContactItemFromList(contactId) {
  logger.debug('[MessageList] 从列表移除联系人项:', contactId);

  const item = document.querySelector(`.msg-item[data-contact-id="${contactId}"]`);
  if (!item) {
    logger.warn('[MessageList] 未找到要移除的消息项:', contactId);
    return;
  }

  // 移除DOM元素
  item.remove();

  // 检查列表是否为空
  const listContainer = document.querySelector('.msg-list');
  if (listContainer && listContainer.children.length === 0) {
    logger.debug('[MessageList] 列表已空，显示空状态提示');
    listContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 2em;">暂无聊天记录</div>';
  }

  logger.info('[MessageList] 已从列表移除:', contactId);
}

/**
 * 绑定全局消息接收事件监听器
 * 
 * @param {HTMLElement} listContainer - 消息列表容器
 * 
 * @description
 * 监听 `phone-message-received` 事件，当AI生成的消息路由到其他联系人时，
 * 自动刷新消息列表中对应联系人的消息项（更新预览文本、时间、小红点）。
 * 
 * **事件来源：**
 * - ai-send-controller.js 触发（当前聊天界面收到其他联系人的消息）
 * 
 * **清理机制：**
 * - 使用 listenerManager 自动管理监听器生命周期
 */
function bindMessageReceivedListener(listContainer) {
  const handleMessageReceived = async (e) => {
    const { contactId, message } = e.detail;
    logger.info('[MessageList] 收到全局消息事件，刷新联系人项:', contactId);
    await updateContactItem(contactId);
    await updateMessageItemPosition(contactId);
  };

  registerListener('message-list', 'phone-message-received', handleMessageReceived, {
    description: '消息接收后刷新列表项'
  });
  logger.debug('[MessageList] 已绑定全局消息接收事件监听器');
}

