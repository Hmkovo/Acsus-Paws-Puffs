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

// 消息缓存（用于同步宏函数）
// 结构：{ contactId: { recent: '...', history: '...' } }
const messageCache = new Map();

// 角色名到 contactId 的映射（用于快速查找）
// 结构：{ '张三': 'tavern_zhang_san' }
const nameToIdMap = new Map();

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

  // 预加载所有消息到缓存（异步）
  await refreshMessageCache();

  // 注册所有联系人的宏
  await registerAllContactMacros();

  logger.info('[TavernMacros] 已注册手机宏: {{最新消息}}, {{历史消息}}, {{当前时间}}, {{当前天气}}');

  // 监听联系人变化事件（最小化监听）
  setupContactChangeListener();
}

/**
 * 刷新消息缓存
 * 
 * @description
 * 预加载所有联系人的消息到缓存
 * 因为宏函数必须是同步的，所以需要提前缓存数据
 * 同时构建 name -> contactId 映射
 * 
 * @async
 * @private
 * @returns {Promise<void>}
 */
async function refreshMessageCache() {
  try {
    const contacts = await loadContacts();

    messageCache.clear();
    nameToIdMap.clear();

    for (const contact of contacts) {
      try {
        // ✅ 创建临时的 messageNumberMap（酒馆宏不需要编号，但函数签名需要）
        const tempMap = new Map();

        const recentResult = await buildChatHistoryInfo(contact.id, contact, tempMap, 1);
        const historyResult = await buildHistoryChatInfo(contact.id, contact, new Map());

        // ✅ 提取 content 字段（函数返回 { content, nextNumber }）
        messageCache.set(contact.id, {
          recent: recentResult.content,
          history: historyResult.content
        });
        nameToIdMap.set(contact.name, contact.id);  // 构建名字映射
      } catch (error) {
        logger.warn(`[TavernMacros] 加载消息失败 (${contact.name}):`, error);
        // 设置空缓存，避免后续报错
        messageCache.set(contact.id, { recent: '', history: '' });
        nameToIdMap.set(contact.name, contact.id);
      }
    }

    logger.debug(`[TavernMacros] 消息缓存已刷新，共 ${contacts.length} 个联系人`);
  } catch (error) {
    logger.error('[TavernMacros] 刷新消息缓存失败:', error);
  }
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
 * 监听联系人变化事件（最小化监听）
 * 
 * @description
 * 只监听一个事件：phone_contact_list_changed
 * 当联系人列表发生变化时（同步角色、添加好友、删除好友），自动刷新宏和缓存
 * 
 * @private
 */
function setupContactChangeListener() {
  // 监听联系人列表变化事件
  document.addEventListener('phone-contact-list-changed', async () => {
    logger.debug('[TavernMacros] 检测到联系人变化，刷新缓存和宏');
    await refreshMessageCache();  // 先刷新缓存
    await registerAllContactMacros();  // 再注册宏
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
 * 宏函数必须是同步的，从缓存读取数据
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
 * 宏函数必须是同步的，从缓存读取数据
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
 * 根据角色名获取消息（同步，从缓存读取）
 * 
 * @description
 * 宏函数必须是同步的，不能返回 Promise
 * 通过 name -> contactId 映射快速查找
 * 
 * @param {'recent'|'history'} type - 消息类型
 * @param {string} charName - 角色名（从酒馆的 name2 获取）
 * @returns {string} 格式化的聊天记录
 */
function getMessagesByCharName(type, charName) {
  // 通过名字查找 contactId
  const contactId = nameToIdMap.get(charName);

  if (!contactId) {
    logger.debug(`[TavernMacros] 角色 ${charName} 没有手机聊天记录或缓存未加载`);
    return ''; // 没有手机记录，返回空字符串
  }

  return getContactMessages(type, contactId);
}

/**
 * 根据 contactId 获取消息（同步，从缓存读取）
 * 
 * @description
 * 宏函数必须是同步的，从缓存直接读取
 * 
 * @param {'recent'|'history'} type - 消息类型
 * @param {string} contactId - 联系人ID
 * @returns {string} 格式化的聊天记录
 */
function getContactMessages(type, contactId) {
  const cached = messageCache.get(contactId);

  if (!cached) {
    logger.debug(`[TavernMacros] 联系人 ${contactId} 缓存不存在`);
    return '';
  }

  return cached[type] || '';
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
 * @async
 * @returns {Promise<void>}
 * 
 * @example
 * import { refreshPhoneMacros } from './utils/tavern-macros.js';
 * await refreshPhoneMacros(); // 手动刷新宏
 */
export async function refreshPhoneMacros() {
  logger.info('[TavernMacros] 手动刷新宏...');
  await refreshMessageCache();  // 先刷新缓存
  await registerAllContactMacros();  // 再注册宏
}

