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
let loadContacts, buildChatHistoryInfo, buildHistoryChatInfo;

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

  loadContacts = contactModule.loadContacts;
  buildChatHistoryInfo = contextModule.buildChatHistoryInfo;
  buildHistoryChatInfo = contextModule.buildHistoryChatInfo;

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
 * 宏函数必须是同步的，直接从持久化存储读取数据
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
 * 宏函数必须是同步的，直接从持久化存储读取数据
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
 * 根据角色名获取消息（同步，直接读取持久化存储）
 * 
 * @description
 * 宏函数必须是同步的，不能返回 Promise
 * 通过角色名查找对应的联系人ID，然后读取持久化存储
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
 * 根据 contactId 获取消息（同步，直接读取持久化存储）
 * 
 * @description
 * 宏函数必须是同步的，直接从 extension_settings 读取数据并格式化
 * 
 * @param {'recent'|'history'} type - 消息类型
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 * @returns {string} 格式化的聊天记录
 */
function getContactMessages(type, contactId, contact) {
  try {
    // 从持久化存储读取聊天记录
    const STORAGE_KEY = 'acsusPawsPuffs';
    const chatKey = `chat_${contactId}`;
    const messages = extension_settings[STORAGE_KEY]?.phone?.chats?.[chatKey] || [];

    if (messages.length === 0) {
      return ''; // 没有消息
    }

    // 根据类型选择消息范围
    let selectedMessages;
    if (type === 'recent') {
      // 最新消息：最后20条
      selectedMessages = messages.slice(-20);
    } else {
      // 历史消息：除最新20条外的所有消息
      selectedMessages = messages.slice(0, -20);
    }

    if (selectedMessages.length === 0) {
      return '';
    }

    // 格式化消息（同步版本，简化格式）
    return formatMessagesSync(selectedMessages, contact);
  } catch (error) {
    logger.error(`[TavernMacros] 获取联系人消息失败 (${contactId}):`, error);
    return '';
  }
}

/**
 * 格式化消息（同步版本）
 * 
 * @description
 * 将消息数组格式化为可读的字符串
 * 简化版本，不需要异步操作
 * 
 * @param {Array<Object>} messages - 消息数组
 * @param {Object} contact - 联系人对象
 * @returns {string} 格式化的消息文本
 */
function formatMessagesSync(messages, contact) {
  const lines = [];

  for (const msg of messages) {
    // 格式化时间
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }) : '';

    // 格式化发送者
    const sender = msg.sender === 'user' ? '我' : contact.name;

    // 格式化内容
    const content = msg.content || '';

    // 组装消息行
    if (time) {
      lines.push(`[${time}] ${sender}: ${content}`);
    } else {
      lines.push(`${sender}: ${content}`);
    }
  }

  return lines.join('\n');
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

