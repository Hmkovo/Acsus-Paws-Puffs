/**
 * 聊天数据管理（JSONL格式）
 * @module phone/messages/message-chat-data
 * 
 * @description
 * 使用JSONL格式存储聊天记录（参考酒馆）
 * 每行一个JSON对象，方便追加和读取
 */

import logger from '../../../logger.js';
import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { incrementUnread } from './unread-badge-manager.js';

/**
 * 获取聊天文件路径（基于extension_settings）
 * @private
 * @param {string} contactId - 联系人ID
 * @returns {string} 聊天文件标识（存储在extension_settings中的key）
 */
function getChatKey(contactId) {
  return `chat_${contactId}`;
}

/**
 * 确保手机数据结构存在
 * @private
 */
function ensurePhoneData() {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.chats) {
    extension_settings.acsusPawsPuffs.phone.chats = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.unreadCounts) {
    extension_settings.acsusPawsPuffs.phone.unreadCounts = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.chatRounds) {
    extension_settings.acsusPawsPuffs.phone.chatRounds = {};
  }
}

/**
 * 加载聊天历史
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<Array<Object>>} 聊天记录数组
 * @example
 * const history = await loadChatHistory('tavern_张三');
 * // 返回：[
 * //   { sender: 'user', content: '你好', time: 1729756800, type: 'text' },
 * //   { sender: 'contact', content: '你好啊', time: 1729756810, type: 'text' }
 * // ]
 */
export async function loadChatHistory(contactId) {
  ensurePhoneData();

  const chatKey = getChatKey(contactId);
  const chatData = extension_settings.acsusPawsPuffs.phone.chats[chatKey];

  if (!chatData || !Array.isArray(chatData)) {
    logger.debug('[ChatData] 聊天记录不存在，返回空数组:', contactId);
    return [];
  }

  logger.debug('[ChatData] 加载聊天记录:', contactId, `共${chatData.length}条`);
  return chatData;
}

/**
 * 获取消息预览文本（用于日志显示）
 * 
 * @private
 * @param {Object} message - 消息对象
 * @returns {string} 预览文本
 */
function getMessagePreview(message) {
  switch (message.type) {
    case 'text':
      // 检查是否是计划消息
      if (message.content?.startsWith('[约定计划')) {
        const match = message.content.match(/^\[约定计划(?:已完成)?\](.+)$/);
        if (match) {
          return `[计划] ${match[1].substring(0, 15)}`;
        }
      }
      return message.content?.substring(0, 20) || '[空文本]';
    case 'emoji':
      return `[表情] ${message.content || message.emojiName || '未知'}`;
    case 'image':
      return `[图片] ${message.description?.substring(0, 20) || '无描述'}`;
    case 'redpacket':
      return `[红包] ¥${message.amount || '0'}`;
    case 'transfer':
      return `[转账] ¥${message.amount || '0'} ${message.message?.substring(0, 10) || ''}`;
    case 'video':
      return `[视频] ${message.description?.substring(0, 20) || '无描述'}`;
    case 'file':
      return `[文件] ${message.filename || '未知文件'}`;
    case 'poke':
      // 戳一戳消息
      return '[戳一戳]';
    case 'recalled':
      // 撤回消息：根据发送者显示不同提示
      return message.sender === 'user' ? '你撤回了一条消息' : '撤回了一条消息';
    default:
      return `[${message.type}消息]`;
  }
}

/**
 * 保存单条聊天消息（追加到聊天记录）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} message - 消息对象
 * @param {string} [message.id] - 消息ID（可选）
 * @param {string} message.sender - 发送者（'user' | 'contact'）
 * @param {string} message.type - 消息类型（'text' | 'emoji' | 'image' | 'redpacket' | 'transfer' | 'video' | 'file' | 'quote'）
 * @param {number} message.time - 时间戳（秒）
 * 
 * 不同消息类型的字段：
 * - text: content
 * - emoji: content (表情包ID) + emojiName (表情名)
 * - image: description + imageUrl (可选)
 * - redpacket: amount
 * - transfer: amount + message
 * - video: description
 * - file: filename + size
 * - quote: quotedMessage + replyContent
 */
export async function saveChatMessage(contactId, message) {
  ensurePhoneData();

  const chatKey = getChatKey(contactId);

  // 获取现有聊天记录
  if (!extension_settings.acsusPawsPuffs.phone.chats[chatKey]) {
    extension_settings.acsusPawsPuffs.phone.chats[chatKey] = [];
  }

  // 追加消息
  extension_settings.acsusPawsPuffs.phone.chats[chatKey].push(message);

  // 保存到服务器
  saveSettingsDebounced();

  logger.debug('[ChatData] 保存消息:', contactId, getMessagePreview(message));

  // ✅ 如果是AI回复且聊天页面不可见，增加未读计数
  if (message.sender === 'contact') {
    const isChatVisible = isChatPageVisible(contactId);
    if (!isChatVisible) {
      incrementUnread(contactId);
      logger.debug('[ChatData] AI回复且页面不可见，未读+1:', contactId);
    }
  }
}

/**
 * 检查聊天页面是否可见
 * @private
 * @param {string} contactId - 联系人ID
 * @returns {boolean} 是否可见
 */
function isChatPageVisible(contactId) {
  const pageId = `page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const page = document.getElementById(pageId);
  return !!(page && page.classList.contains('active') && page.parentElement);
}

/**
 * 批量保存聊天消息
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Array<Object>} messages - 消息数组
 */
export async function saveChatMessages(contactId, messages) {
  ensurePhoneData();

  const chatKey = getChatKey(contactId);

  // 获取现有聊天记录
  if (!extension_settings.acsusPawsPuffs.phone.chats[chatKey]) {
    extension_settings.acsusPawsPuffs.phone.chats[chatKey] = [];
  }

  // 批量追加
  extension_settings.acsusPawsPuffs.phone.chats[chatKey].push(...messages);

  // 保存到服务器
  saveSettingsDebounced();

  logger.debug('[ChatData] 批量保存消息:', contactId, `共${messages.length}条`);
}

/**
 * 加载最近聊天列表（按最后消息时间排序）
 * 
 * @async
 * @returns {Promise<Array<Object>>} 最近聊天列表
 * @example
 * const recentChats = await loadRecentChats();
 * // 返回：[
 * //   { contactId: 'tavern_张三', lastMessage: {...}, unreadCount: 0 },
 * //   { contactId: 'tavern_李四', lastMessage: {...}, unreadCount: 2 }
 * // ]
 */
export async function loadRecentChats() {
  ensurePhoneData();

  const chats = extension_settings.acsusPawsPuffs.phone.chats;
  const unreadCounts = extension_settings.acsusPawsPuffs.phone.unreadCounts;
  const recentChats = [];

  // 遍历所有聊天记录
  for (const [chatKey, messages] of Object.entries(chats)) {
    if (!Array.isArray(messages) || messages.length === 0) continue;

    // 提取contactId（去掉'chat_'前缀）
    const contactId = chatKey.replace(/^chat_/, '');

    // 获取最后一条消息
    const lastMessage = messages[messages.length - 1];

    recentChats.push({
      contactId,
      lastMessage,
      unreadCount: unreadCounts[contactId] || 0
    });
  }

  // 按最后消息时间降序排序
  recentChats.sort((a, b) => b.lastMessage.time - a.lastMessage.time);

  logger.debug('[ChatData] 加载最近聊天:', `共${recentChats.length}个`);
  return recentChats;
}

/**
 * 清空指定联系人的聊天记录
 * 
 * @async
 * @param {string} contactId - 联系人ID
 */
export async function clearChatHistory(contactId) {
  ensurePhoneData();

  const chatKey = getChatKey(contactId);
  delete extension_settings.acsusPawsPuffs.phone.chats[chatKey];

  saveSettingsDebounced();

  logger.info('[ChatData] 清空聊天记录:', contactId);
}

/**
 * 批量保存聊天记录（替换整个数组）
 * 
 * @description
 * 用于批量修改消息（如排除/恢复发送），替换整个聊天记录数组
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Array<Object>} messages - 消息数组
 */
export async function saveChatHistory(contactId, messages) {
  ensurePhoneData();

  const chatKey = getChatKey(contactId);
  extension_settings.acsusPawsPuffs.phone.chats[chatKey] = messages;

  saveSettingsDebounced();

  logger.debug('[ChatData] 批量保存聊天记录:', contactId, `共${messages.length}条`);
}

/**
 * 获取聊天发送设置
 * 
 * @description
 * 获取该联系人的消息发送配置（最新条数、历史条数）
 * 
 * @param {string} contactId - 联系人ID
 * @returns {Object} { recentCount, historyCount }
 */
export function getChatSendSettings(contactId) {
  ensurePhoneData();

  if (!extension_settings.acsusPawsPuffs.phone.chatSendSettings) {
    extension_settings.acsusPawsPuffs.phone.chatSendSettings = {};
  }

  const settings = extension_settings.acsusPawsPuffs.phone.chatSendSettings[contactId];

  // 返回默认值或已保存的值
  return {
    recentCount: settings?.recentCount || 20,
    historyCount: settings?.historyCount || 99,
    initialLoadCount: settings?.initialLoadCount || 100
  };
}

/**
 * 更新聊天发送设置
 * 
 * @description
 * 更新该联系人的消息发送配置
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} updates - 更新内容 { recentCount?, historyCount? }
 */
export async function updateChatSendSettings(contactId, updates) {
  ensurePhoneData();

  if (!extension_settings.acsusPawsPuffs.phone.chatSendSettings) {
    extension_settings.acsusPawsPuffs.phone.chatSendSettings = {};
  }

  if (!extension_settings.acsusPawsPuffs.phone.chatSendSettings[contactId]) {
    extension_settings.acsusPawsPuffs.phone.chatSendSettings[contactId] = {
      recentCount: 20,
      historyCount: 99,
      initialLoadCount: 100
    };
  }

  // 合并更新
  Object.assign(extension_settings.acsusPawsPuffs.phone.chatSendSettings[contactId], updates);

  saveSettingsDebounced();

  logger.debug('[ChatData] 更新发送设置:', contactId, updates);
}

/**
 * 根据ID查找消息
 * 
 * @description
 * 从聊天历史中根据ID查找消息（用于引用跳转、AI引用解析等）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} messageId - 消息ID
 * @returns {Promise<Object|null>} 消息对象（找不到返回null）
 */
export async function findMessageById(contactId, messageId) {
  const chatHistory = await loadChatHistory(contactId);
  return chatHistory.find(msg => msg.id === messageId) || null;
}

/**
 * 更新指定消息（用于撤回等操作）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} messageId - 消息ID
 * @param {Object} updates - 要更新的字段
 * @returns {Promise<boolean>} 是否更新成功
 * 
 * @example
 * // 撤回消息
 * await updateMessage('tavern_张三', 'msg_123', {
 *   type: 'recalled',
 *   recalledTime: Date.now() / 1000,
 *   originalContent: '原始内容',
 *   originalType: 'text'
 * });
 */
export async function updateMessage(contactId, messageId, updates) {
  ensurePhoneData();

  const chatKey = getChatKey(contactId);
  const chatData = extension_settings.acsusPawsPuffs.phone.chats[chatKey];

  if (!chatData || !Array.isArray(chatData)) {
    logger.warn('[ChatData] 聊天记录不存在，无法更新消息:', contactId);
    return false;
  }

  // 查找消息索引
  const messageIndex = chatData.findIndex(msg => msg.id === messageId);

  if (messageIndex === -1) {
    logger.warn('[ChatData] 消息不存在，无法更新:', messageId);
    return false;
  }

  // 更新消息（合并字段）
  extension_settings.acsusPawsPuffs.phone.chats[chatKey][messageIndex] = {
    ...chatData[messageIndex],
    ...updates
  };

  // 保存到服务器
  saveSettingsDebounced();

  logger.info('[ChatData] 更新消息成功:', messageId, '更新字段:', Object.keys(updates));
  return true;
}

/**
 * 添加系统消息
 * 
 * @description
 * 添加特殊类型的系统消息（如"添加好友"提示）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} systemMessage - 系统消息对象
 * @param {string} systemMessage.type - 系统消息类型（'friend_added' 等）
 * @param {string} systemMessage.content - 消息内容
 * @param {number} systemMessage.time - 时间戳（秒）
 * @returns {Promise<boolean>} 是否添加成功
 * 
 * @example
 * await addSystemMessage('tavern_Wade', {
 *   type: 'friend_added',
 *   content: '{{user}}添加了你为好友',
 *   time: 1699999999
 * });
 */
export async function addSystemMessage(contactId, systemMessage) {
  logger.debug('[ChatData] 添加系统消息:', contactId, systemMessage.type);

  try {
    // 加载现有聊天记录
    const messages = await loadChatHistory(contactId);

    // 创建系统消息对象
    const message = {
      id: `msg_system_${Date.now()}`,
      sender: 'system',
      type: systemMessage.type,
      content: systemMessage.content,
      time: systemMessage.time
    };

    // 添加到消息列表
    messages.push(message);

    // 保存回去
    await saveChatHistory(contactId, messages);

    logger.info('[ChatData] 已添加系统消息:', contactId, systemMessage.type);
    return true;
  } catch (error) {
    logger.error('[ChatData] 添加系统消息失败:', error);
    return false;
  }
}

// 注意：未读计数管理函数已迁移到 unread-badge-manager.js
// 使用 incrementUnread()、clearUnread()、getUnread() 替代

/**
 * 获取当前轮次
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<number>} 当前轮次（从1开始）
 * 
 * @description
 * 用于图片消息的轮次控制，标记图片属于哪一轮对话
 */
export async function getCurrentRound(contactId) {
  ensurePhoneData();

  if (!extension_settings.acsusPawsPuffs.phone.chatRounds[contactId]) {
    extension_settings.acsusPawsPuffs.phone.chatRounds[contactId] = 1;
  }

  return extension_settings.acsusPawsPuffs.phone.chatRounds[contactId];
}

/**
 * 递增轮次
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<number>} 新的轮次
 * 
 * @description
 * 每次用户发送消息后调用，轮次+1
 */
export async function incrementRound(contactId) {
  ensurePhoneData();

  if (!extension_settings.acsusPawsPuffs.phone.chatRounds[contactId]) {
    extension_settings.acsusPawsPuffs.phone.chatRounds[contactId] = 1;
  }

  extension_settings.acsusPawsPuffs.phone.chatRounds[contactId]++;
  saveSettingsDebounced();

  const newRound = extension_settings.acsusPawsPuffs.phone.chatRounds[contactId];
  logger.debug('[ChatData] 轮次递增:', contactId, `现在是第${newRound}轮`);

  return newRound;
}

