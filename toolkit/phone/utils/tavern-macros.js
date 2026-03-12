/**
 * 酒馆宏注册器
 * @module phone/utils/tavern-macros
 *
 * @description
 * 将手机变量注册到 SillyTavern 的新宏系统。
 *
 * 支持的新宏：
 * - {{phoneRecent}} - 当前角色的最新消息
 * - {{phoneRecent::角色名}} - 指定角色的最新消息
 * - {{phoneHistory}} - 当前角色的历史消息
 * - {{phoneHistory::角色名}} - 指定角色的历史消息
 * - {{phoneTime}} - 当前时间（手机格式）
 * - {{phoneWeather}} - 当前天气（手机格式）
 */

import logger from '../../../logger.js';
import { macros } from '../../../../../../macros/macro-system.js';
import { extension_settings } from '../../../../../../extensions.js';
import { getUserDisplayName } from './contact-display-helper.js';

// 延迟导入，避免循环依赖
let loadContacts, buildChatHistoryInfo, buildHistoryChatInfo, loadChatHistory, getChatSendSettings;

/** @type {{ contactListChanged: ((event: Event) => Promise<void>)|null }} 模块级监听器引用 */
let savedHandlers = {
  contactListChanged: null
};

/** @type {boolean} 宏是否已注册（防止重复注册） */
let macrosRegistered = false;

/**
 * 注册所有手机相关的酒馆宏
 *
 * @description
 * 初始化动态依赖后，注册新引擎英文宏，
 * 并保留联系人变化监听器用于日志追踪。
 *
 * @async
 * @returns {Promise<void>}
 */
export async function registerPhoneMacros() {
  if (macrosRegistered) {
    logger.debug('phone','[TavernMacros] 宏已注册，跳过');
    return;
  }

  // 动态导入依赖
  const contactModule = await import('../contacts/contact-list-data.js');
  const contextModule = await import('../ai-integration/ai-context-builder.js');
  const chatDataModule = await import('../messages/message-chat-data.js');

  loadContacts = contactModule.loadContacts;
  buildChatHistoryInfo = contextModule.buildChatHistoryInfo;
  buildHistoryChatInfo = contextModule.buildHistoryChatInfo;
  loadChatHistory = chatDataModule.loadChatHistory;
  getChatSendSettings = chatDataModule.getChatSendSettings;

  registerNewEngineMacros();
  setupContactChangeListener();

  macrosRegistered = true;
  logger.info('phone','[TavernMacros] ✅ 手机宏注册完成: {{phoneRecent}}, {{phoneHistory}}, {{phoneTime}}, {{phoneWeather}}');
}

/**
 * 用新引擎 API 注册所有手机宏
 *
 * @description
 * 注册以下宏：
 * - {{phoneRecent}} / {{phoneRecent::角色名}} - 最新消息
 * - {{phoneHistory}} / {{phoneHistory::角色名}} - 历史消息
 * - {{phoneTime}} - 当前时间
 * - {{phoneWeather}} - 当前天气
 *
 * @returns {void}
 */
function registerNewEngineMacros() {
  try {
    macros.register('phoneRecent', {
      category: 'custom',
      description: '手机最新消息。无参数=当前角色，有参数=指定角色',
      returns: '格式化的聊天记录文本',
      unnamedArgs: [
        {
          name: 'contactName',
          optional: true,
          type: 'string',
          description: '角色名（可选，不填则使用当前角色）'
        }
      ],
      handler: ({ unnamedArgs: [contactName] }) => {
        const targetName = typeof contactName === 'string' ? contactName.trim() : '';
        if (targetName) {
          return getMessagesByCharName('recent', targetName);
        }
        return getRecentMessages();
      }
    });

    macros.register('phoneHistory', {
      category: 'custom',
      description: '手机历史消息。无参数=当前角色，有参数=指定角色',
      returns: '格式化的聊天记录文本',
      unnamedArgs: [
        {
          name: 'contactName',
          optional: true,
          type: 'string',
          description: '角色名（可选，不填则使用当前角色）'
        }
      ],
      handler: ({ unnamedArgs: [contactName] }) => {
        const targetName = typeof contactName === 'string' ? contactName.trim() : '';
        if (targetName) {
          return getMessagesByCharName('history', targetName);
        }
        return getHistoryMessages();
      }
    });

    macros.register('phoneTime', {
      category: 'custom',
      description: '当前时间（手机格式）',
      returns: '格式化的时间字符串，如 [2025-10-28 21:43]',
      handler: () => getCurrentTime()
    });

    macros.register('phoneWeather', {
      category: 'custom',
      description: '当前天气（手机格式）',
      returns: '天气信息，如“北京 晴 29°C”',
      handler: () => getCurrentWeather()
    });

    logger.info('phone','[TavernMacros] ✅ 新引擎宏已注册');
  } catch (error) {
    logger.error('phone','[TavernMacros] 新引擎宏注册失败:', error);
  }
}

/**
 * 监听联系人变化事件
 *
 * @description
 * 参数宏不需要为每个联系人重新注册。
 * 这里只保留监听器，便于记录联系人列表变化并在禁用时清理监听。
 *
 * @private
 * @returns {void}
 */
function setupContactChangeListener() {
  if (savedHandlers.contactListChanged) {
    logger.debug('phone','[TavernMacros] 联系人变化监听器已存在，跳过重复注册');
    return;
  }

  savedHandlers.contactListChanged = async () => {
    logger.debug('phone','[TavernMacros] 联系人列表变化（参数宏无需重新注册）');
  };

  document.addEventListener('phone-contact-list-changed', savedHandlers.contactListChanged);
  logger.debug('phone','[TavernMacros] 已设置联系人变化监听器');
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
    logger.error('phone','[TavernMacros] 获取最新消息失败:', error);
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
    logger.error('phone','[TavernMacros] 获取历史消息失败:', error);
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
      logger.debug('phone',`[TavernMacros] 角色 ${charName} 没有手机联系人记录`);
      return ''; // 没有手机记录，返回空字符串
    }

    return getContactMessages(type, contact.id, contact);
  } catch (error) {
    logger.error('phone',`[TavernMacros] 获取角色消息失败 (${charName}):`, error);
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
    const sendSettings = extension_settings[STORAGE_KEY]?.phone?.chatSendSettings?.[contactId] || {
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
    logger.error('phone',`[TavernMacros] 获取联系人消息失败 (${contactId}):`, error);
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
  // 获取真实用户名（从 SillyTavern 的 {{user}} 宏，和其他函数保持一致）
  const userName = getUserDisplayName();
  
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
    logger.error('phone','[TavernMacros] 获取当前天气失败:', error);
    return '';
  }
}

/**
 * 注销所有手机宏（供外部调用）
 *
 * @description
 * 当手机功能被禁用时调用，注销新引擎英文宏，并清理兼容预处理器与监听器。
 *
 * @returns {void}
 */
export function unregisterPhoneMacros() {
  try {
    try {
      macros.registry.unregisterMacro('phoneRecent');
      macros.registry.unregisterMacro('phoneHistory');
      macros.registry.unregisterMacro('phoneTime');
      macros.registry.unregisterMacro('phoneWeather');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.debug('phone','[TavernMacros] 新引擎宏注销跳过: ' + errorMessage);
    }

    if (savedHandlers.contactListChanged) {
      document.removeEventListener('phone-contact-list-changed', savedHandlers.contactListChanged);
      savedHandlers.contactListChanged = null;
    }

    macrosRegistered = false;

    logger.info('phone','[TavernMacros] ✅ 已注销所有手机宏');
  } catch (error) {
    logger.error('phone','[TavernMacros] 注销宏失败:', error);
  }
}

/**
 * 手动刷新所有宏（兼容保留导出）
 *
 * @description
 * 已废弃：新引擎使用参数宏，不需要为每个联系人单独刷新注册。
 *
 * @async
 * @returns {Promise<void>}
 */
export async function refreshPhoneMacros() {
  logger.debug('phone','[TavernMacros] refreshPhoneMacros 已废弃（参数宏不需要刷新）');
}
