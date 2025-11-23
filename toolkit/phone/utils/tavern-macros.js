/**
 * 酒馆宏注册器
 * @module phone/utils/tavern-macros
 * 
 * @description
 * 将手机变量注册到 SillyTavern 的全局宏系统
 * 使手机数据可在酒馆的任何提示词位置使用
 * 
 * 支持的宏：
 * - {{最新消息}} - 当前角色的最新消息
 * - {{历史消息}} - 当前角色的历史消息
 * - {{最新消息_角色名}} - 指定角色的最新消息
 * - {{历史消息_角色名}} - 指定角色的历史消息
 * - {{当前时间}} - 当前时间（手机格式）
 * - {{当前天气}} - 当前天气（手机格式）
 * 
 * @example
 * // 在酒馆提示词中使用
 * "看看我和李四的聊天记录：{{最新消息_李四}}"
 * "今天的天气：{{当前天气}}"
 */

import logger from '../../../logger.js';
import { extension_settings } from '../../../../../../extensions.js';

// 延迟导入，避免循环依赖
let loadContacts, buildChatHistoryInfo, buildHistoryChatInfo, loadChatHistory, getChatSendSettings;

// 已注册的角色宏（用于清理）
const registeredCharacterMacros = new Set();

/**
 * 注册所有手机相关的酒馆宏
 * 
 * @async
 * @returns {Promise<void>}
 */
export async function registerPhoneMacros() {
  // 动态导入依赖
  const contactModule = await import('../contacts/contact-list-data.js');
  const contextModule = await import('../ai-integration/ai-context-builder.js');
  const chatDataModule = await import('../messages/message-chat-data.js');

  loadContacts = contactModule.loadContacts;
  buildChatHistoryInfo = contextModule.buildChatHistoryInfo;
  buildHistoryChatInfo = contextModule.buildHistoryChatInfo;
  loadChatHistory = chatDataModule.loadChatHistory;
  getChatSendSettings = chatDataModule.getChatSendSettings;

  // 使用官方 API（不直接导入 SillyTavern 内部模块）
  const { registerMacro } = SillyTavern.getContext();

  // 注册固定宏（当前角色）
  registerMacro('最新消息', getRecentMessages, '当前角色的手机最新消息（QQ聊天记录）');
  registerMacro('历史消息', getHistoryMessages, '当前角色的手机历史消息');
  registerMacro('当前时间', getCurrentTime, '当前时间（手机格式）');
  registerMacro('当前天气', getCurrentWeather, '当前天气（手机格式）');

  // 注册所有联系人的宏
  await registerAllContactMacros();

  logger.info('[TavernMacros] 已注册手机宏: {{最新消息}}, {{历史消息}}, {{当前时间}}, {{当前天气}}');

  // 监听联系人变化事件（只监听联系人列表变化）
  setupContactChangeListener();
}


/**
 * 注册所有联系人的专属宏
 * 
 * @async
 * @private
 * @returns {Promise<void>}
 */
async function registerAllContactMacros() {
  try {
    const contacts = await loadContacts();

    // 使用官方 API
    const { registerMacro, unregisterMacro } = SillyTavern.getContext();

    // 先清理旧的宏
    for (const macroName of registeredCharacterMacros) {
      unregisterMacro(macroName);
    }
    registeredCharacterMacros.clear();

    // 为每个联系人注册宏
    for (const contact of contacts) {
      const safeName = sanitizeMacroName(contact.name);

      if (!safeName) {
        logger.warn(`[TavernMacros] 联系人名字无效，跳过: ${contact.name}`);
        continue;
      }

      // 注册最新消息宏
      const recentMacroName = `最新消息_${safeName}`;
      registerMacro(
        recentMacroName,
        () => getContactMessages('recent', contact.id),
        `${contact.name}的手机最新消息`
      );
      registeredCharacterMacros.add(recentMacroName);

      // 注册历史消息宏
      const historyMacroName = `历史消息_${safeName}`;
      registerMacro(
        historyMacroName,
        () => getContactMessages('history', contact.id),
        `${contact.name}的手机历史消息`
      );
      registeredCharacterMacros.add(historyMacroName);
    }

    logger.info(`[TavernMacros] 已为 ${contacts.length} 个联系人注册专属宏`);
  } catch (error) {
    logger.error('[TavernMacros] 注册联系人宏失败:', error);
  }
}

/**
 * 监听联系人变化事件
 * 
 * @description
 * 监听联系人列表变化事件，重新注册宏
 * 
 * @private
 */
function setupContactChangeListener() {
  // 监听联系人列表变化事件（新增/删除联系人时重新注册宏）
  document.addEventListener('phone-contact-list-changed', async () => {
    logger.debug('[TavernMacros] 检测到联系人变化，重新注册宏');
    await registerAllContactMacros();
  });

  logger.debug('[TavernMacros] 已设置联系人变化监听器');
}

/**
 * 清理宏名（移除不允许的字符）
 * 
 * @description
 * MacrosParser 不允许宏名包含某些特殊字符
 * 这里只保留中文、英文、数字、下划线
 * 
 * @param {string} name - 原始名字
 * @returns {string} 清理后的名字
 * 
 * @example
 * sanitizeMacroName('张三@123') // '张三123'
 * sanitizeMacroName('李四 (VIP)') // '李四VIP'
 */
function sanitizeMacroName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // 移除特殊字符，只保留中文、英文、数字、下划线
  return name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, '').trim();
}

/**
 * 获取当前角色的最新消息（用于 {{最新消息}}）
 * 
 * @description
 * ⚠️ 同步实现：宏系统不支持Promise
 * 直接从持久化存储读取数据，使用正确的字段和格式化逻辑
 * 
 * @returns {string} 格式化的聊天记录
 */
function getRecentMessages() {
  try {
    // 从官方 API 获取当前角色名
    const context = SillyTavern.getContext();
    const currentCharName = context.name2;

    if (!currentCharName) {
      return ''; // 没有当前角色，保持原样
    }

    return getMessagesByCharName('recent', currentCharName);
  } catch (error) {
    logger.error('[TavernMacros] 获取最新消息失败:', error);
    return '';
  }
}

/**
 * 获取当前角色的历史消息（用于 {{历史消息}}）
 * 
 * @description
 * ⚠️ 同步实现：宏系统不支持Promise
 * 直接从持久化存储读取数据，使用正确的字段和格式化逻辑
 * 
 * @returns {string} 格式化的聊天记录
 */
function getHistoryMessages() {
  try {
    // 从官方 API 获取当前角色名
    const context = SillyTavern.getContext();
    const currentCharName = context.name2;

    if (!currentCharName) {
      return ''; // 没有当前角色，保持原样
    }

    return getMessagesByCharName('history', currentCharName);
  } catch (error) {
    logger.error('[TavernMacros] 获取历史消息失败:', error);
    return '';
  }
}

/**
 * 根据角色名获取消息（同步）
 * 
 * @description
 * ⚠️ 同步实现：宏系统不支持Promise
 * 通过角色名查找对应的联系人ID，然后同步格式化消息
 * 
 * @param {'recent'|'history'} type - 消息类型
 * @param {string} charName - 角色名（从酒馆的 name2 获取）
 * @returns {string} 格式化的聊天记录
 */
function getMessagesByCharName(type, charName) {
  try {
    // 从持久化存储读取联系人列表
    const STORAGE_KEY = 'acsusPawsPuffs';
    const contacts = extension_settings[STORAGE_KEY]?.phone?.contacts || [];

    // 查找匹配的联系人
    const contact = contacts.find(c => c.name === charName);

    if (!contact) {
      logger.debug(`[TavernMacros] 角色 ${charName} 没有手机联系人记录`);
      return ''; // 没有手机记录，返回空字符串
    }

    return getContactMessages(type, contact.id, contact);
  } catch (error) {
    logger.error(`[TavernMacros] 获取角色消息失败 (${charName}):`, error);
    return '';
  }
}

/**
 * 根据 contactId 获取消息（同步实现）
 * 
 * @description
 * ⚠️ 同步实现：宏系统不支持Promise
 * 直接从持久化存储读取数据，使用正确的字段名和格式化逻辑
 * 复用 formatTimeForAISync 和消息类型处理逻辑
 * 
 * @param {'recent'|'history'} type - 消息类型
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 * @returns {string} 格式化的聊天记录
 */
function getContactMessages(type, contactId, contact) {
  try {
    // 从持久化存储读取聊天记录和设置
    const STORAGE_KEY = 'acsusPawsPuffs';
    const chatKey = `chat_${contactId}`;
    const allMessages = extension_settings[STORAGE_KEY]?.phone?.chats?.[chatKey] || [];
    const sendSettings = extension_settings[STORAGE_KEY]?.phone?.chatSettings?.[contactId] || {
      recentCount: 20,
      historyCount: 99
    };

    if (allMessages.length === 0) {
      return ''; // 没有消息
    }

    // 过滤出非排除的消息
    const validMessages = allMessages.filter(msg => !msg.excluded);

    // 根据类型选择消息范围
    let selectedMessages;
    if (type === 'recent') {
      // 最新消息：最后recentCount条
      selectedMessages = validMessages.slice(Math.max(0, validMessages.length - sendSettings.recentCount));
    } else {
      // 历史消息：除最新recentCount条外的historyCount条
      const historyEnd = Math.max(0, validMessages.length - sendSettings.recentCount);
      const historyStart = Math.max(0, historyEnd - sendSettings.historyCount);
      selectedMessages = validMessages.slice(historyStart, historyEnd);
    }

    if (selectedMessages.length === 0) {
      return '';
    }

    // 格式化消息（同步版本）
    return formatMessagesForMacro(selectedMessages, contact);
  } catch (error) {
    logger.error(`[TavernMacros] 获取联系人消息失败 (${contactId}):`, error);
    return '';
  }
}

/**
 * 格式化消息列表为宏输出（同步版本）
 * 
 * @description
 * ✅ 正确的同步实现：
 * - 使用 msg.time（秒级时间戳）
 * - 获取真实用户名
 * - 处理所有消息类型（emoji、image、quote等）
 * - 复用时间格式化逻辑
 * 
 * @param {Array<Object>} messages - 消息数组
 * @param {Object} contact - 联系人对象
 * @returns {string} 格式化的消息文本
 */
function formatMessagesForMacro(messages, contact) {
  // 获取真实用户名（而不是硬编码"我"）
  const STORAGE_KEY = 'acsusPawsPuffs';
  const userName = extension_settings[STORAGE_KEY]?.phone?.userProfile?.displayName || '我';
  
  const lines = [];

  for (let index = 0; index < messages.length; index++) {
    const msg = messages[index];
    const senderName = msg.sender === 'user' ? userName : contact.name;
    const prevTime = index > 0 ? messages[index - 1].time : null;
    const isFirst = index === 0;

    // 格式化时间（使用 msg.time 而不是 msg.timestamp）
    const timeStr = formatTimeForAISync(msg.time, prevTime, isFirst);

    // 根据消息类型处理内容
    let messageContent = formatMessageContent(msg);

    // 组装消息行
    lines.push(`${timeStr}${senderName}: ${messageContent}`);
  }

  return lines.join('\n');
}

/**
 * 格式化消息内容（根据类型）
 * 
 * @param {Object} msg - 消息对象
 * @returns {string} 格式化后的内容
 */
function formatMessageContent(msg) {
  // 同步版本：无法查询表情包名称，直接使用冗余存储的名字
  if (msg.type === 'poke') {
    return '[戳一戳]';
  } else if (msg.type === 'emoji') {
    return msg.emojiName ? `[表情]${msg.emojiName}` : `[表情包]`;
  } else if (msg.type === 'image-real' || (msg.type === 'image' && msg.imageUrl)) {
    return msg.description ? `[图片]${msg.description}` : '[图片]';
  } else if (msg.type === 'image-fake' || (msg.type === 'image' && !msg.imageUrl)) {
    return `[图片]${msg.description || '无描述'}`;
  } else if (msg.type === 'quote') {
    const quotedText = msg.quotedMessage?.content || '(已删除)';
    return `[引用]${quotedText}[回复]${msg.replyContent}`;
  } else if (msg.type === 'transfer') {
    return msg.message ? `[转账]${msg.amount}元 ${msg.message}` : `[转账]${msg.amount}元`;
  } else if (msg.type === 'recalled') {
    // 撤回消息只显示提示，不显示原内容
    return '撤回了一条消息';
  } else if (msg.type === 'forwarded') {
    return '[转发聊天记录]';
  } else if (msg.type === 'plan') {
    return `[约定计划]${msg.content}`;
  } else {
    // 默认：文字消息
    return msg.content || '';
  }
}

/**
 * 格式化时间为AI可读格式（同步版本）
 * 
 * @param {number} timestamp - Unix时间戳（秒）
 * @param {number|null} prevTimestamp - 上一条消息的时间戳
 * @param {boolean} isFirst - 是否是第一条消息
 * @returns {string} 格式化的时间字符串
 */
function formatTimeForAISync(timestamp, prevTimestamp = null, isFirst = false) {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  // 第一条消息：显示完整日期
  if (isFirst) {
    return `[${year}-${month}-${day}]\n`;
  }

  // 如果有上一条消息，检查是否跨天
  if (prevTimestamp !== null) {
    const prevDate = new Date(prevTimestamp * 1000);
    const isSameDay = date.getFullYear() === prevDate.getFullYear() &&
      date.getMonth() === prevDate.getMonth() &&
      date.getDate() === prevDate.getDate();

    // 跨天了：显示新的日期分组
    if (!isSameDay) {
      return `[${year}-${month}-${day}]\n`;
    }
  }

  // 同一天内：只显示时间
  return `[${hour}:${minute}] `;
}

/**
 * 获取当前时间（手机格式）
 * 
 * @returns {string} 格式化的当前时间 [2025-10-28 21:43]
 */
function getCurrentTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');

  return `[${year}-${month}-${day} ${hour}:${minute}]`;
}

/**
 * 获取当前天气（手机格式）
 * 
 * @description
 * 同步读取用户设置的天气信息
 * 输出简洁格式：城市 天气 温度°C（如"北京 晴 29°C"）
 * 如果用户未设置天气，返回空字符串
 * 
 * @returns {string} 格式化的天气信息或空字符串
 * 
 * @example
 * getCurrentWeather() // "北京 晴 29°C"
 * getCurrentWeather() // ""（未设置时）
 */
function getCurrentWeather() {
  try {
    // 同步读取 extension_settings
    const STORAGE_KEY = 'acsusPawsPuffs';
    const userProfile = extension_settings[STORAGE_KEY]?.phone?.userProfile;

    // 检查天气数据是否存在
    if (!userProfile?.weatherCity || !userProfile?.weatherTemp) {
      return ''; // 没有设置天气，返回空字符串
    }

    // 天气图标名到中文的映射
    const iconToChinese = {
      'sun': '晴',
      'cloud-sun': '多云',
      'cloud': '阴',
      'cloud-rain': '雨',
      'cloud-showers-heavy': '大雨',
      'cloud-bolt': '雷暴',
      'snowflake': '雪',
      'smog': '雾霾'
    };

    // 获取天气中文描述（如果有icon的话）
    const weatherDesc = userProfile.weatherIcon
      ? iconToChinese[userProfile.weatherIcon] || ''
      : '';

    // 简洁格式：城市 天气 温度°C
    if (weatherDesc) {
      return `${userProfile.weatherCity} ${weatherDesc} ${userProfile.weatherTemp}°C`;
    } else {
      // 没有天气描述，只显示城市和温度
      return `${userProfile.weatherCity} ${userProfile.weatherTemp}°C`;
    }
  } catch (error) {
    logger.error('[TavernMacros] 获取当前天气失败:', error);
    return '';
  }
}

/**
 * 注销所有手机宏（供外部调用）
 * 
 * @description
 * 当手机功能被禁用时调用，注销所有手机相关宏
 * 包括：{{最新消息}}、{{历史消息}}、{{当前时间}}、{{当前天气}}、所有联系人专属宏
 * 
 * @returns {void}
 * 
 * @example
 * import { unregisterPhoneMacros } from './utils/tavern-macros.js';
 * unregisterPhoneMacros(); // 注销所有宏
 */
export function unregisterPhoneMacros() {
  try {
    const { unregisterMacro } = SillyTavern.getContext();

    // 注销固定宏
    unregisterMacro('最新消息');
    unregisterMacro('历史消息');
    unregisterMacro('当前时间');
    unregisterMacro('当前天气');

    // 注销所有联系人专属宏
    for (const macroName of registeredCharacterMacros) {
      unregisterMacro(macroName);
    }
    registeredCharacterMacros.clear();

    logger.info('[TavernMacros] ✅ 已注销所有手机宏');
  } catch (error) {
    logger.error('[TavernMacros] 注销宏失败:', error);
  }
}

/**
 * 手动刷新所有宏（供外部调用）
 * 
 * @description
 * 重新注册所有联系人的宏（当联系人列表变化时）
 * 
 * @async
 * @returns {Promise<void>}
 * 
 * @example
 * import { refreshPhoneMacros } from './utils/tavern-macros.js';
 * await refreshPhoneMacros(); // 手动刷新宏
 */
export async function refreshPhoneMacros() {
  logger.info('[TavernMacros] 手动刷新宏...');
  await registerAllContactMacros();
}

