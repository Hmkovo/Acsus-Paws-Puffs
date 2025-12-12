/**
 * 装扮应用模块
 *
 * @description
 * 处理装扮应用逻辑：
 * - 应用气泡样式（修改body的data属性）
 * - 保存当前使用的装扮
 * - 管理装扮作用范围（仅用户/仅角色X/全部）
 *
 * @module customization-apply
 */

import logger from '../../../logger.js';
import { loadData, saveData } from '../data-storage/storage-api.js';
import { stateManager } from '../utils/state-manager.js';

/**
 * 获取装扮数据
 * @returns {Promise<Object>} 装扮数据对象
 */
async function getCustomizationData() {
  const data = await loadData('userCustomization');

  if (!data) {
    return {
      owned: [],
      current: {
        bubble: 'default',
        avatar: 'default',
        theme: 'default'
      },
      vipDailyUse: {
        date: getTodayDate(),
        bubble: 0,
        avatar: 0,
        theme: 0
      },
      scopes: {}
    };
  }

  if (!data.scopes) {
    data.scopes = {};
  }

  return data;
}

/**
 * 保存装扮数据并通知订阅者
 * @param {Object} customizationData - 装扮数据对象
 * @param {Object} [meta={}] - 元数据
 */
async function saveCustomizationData(customizationData, meta = {}) {
  await stateManager.set('userCustomization', customizationData, meta);
}

/**
 * 获取今天的日期字符串
 * @returns {string} YYYY-MM-DD
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * 应用气泡装扮
 *
 * @description
 * 通过修改body的data-bubble-theme属性来应用气泡样式
 * CSS会自动响应，无需重新渲染DOM
 *
 * @param {string} bubbleId - 气泡ID（'default'表示恢复默认）
 * @param {Object} [scope] - 作用范围配置
 * @param {string} scope.type - 作用范围类型（'user-only' / 'character-only' / 'all'）
 * @param {string} [scope.characterId] - 角色ID（type为'character-only'时必需）
 * @returns {Promise<void>}
 */
export async function applyBubbleTheme(bubbleId, scope = null) {
  logger.info('[Apply] 应用气泡装扮:', bubbleId, '作用范围:', scope);

  const customizationData = await getCustomizationData();

  // 1. 保存当前使用的装扮
  customizationData.current.bubble = bubbleId;

  // 2. 保存作用范围配置
  if (scope) {
    customizationData.scopes[bubbleId] = scope;
  }

  // 3. 应用CSS（修改body的data属性）
  const body = document.body;
  if (bubbleId === 'default') {
    body.removeAttribute('data-bubble-theme');
    logger.debug('[Apply] 已恢复默认气泡');
  } else {
    body.setAttribute('data-bubble-theme', bubbleId);
    logger.debug('[Apply] 已设置气泡主题:', bubbleId);
  }

  // 4. 保存数据
  await saveCustomizationData(customizationData, {
    action: 'apply',
    itemId: bubbleId,
    category: 'bubble',
    scope
  });

  logger.info('[Apply] 气泡装扮已应用');
}

/**
 * 获取当前使用的装扮
 * @param {string} category - 装扮分类
 * @returns {Promise<string>} 装扮ID
 */
export async function getCurrentItem(category = 'bubble') {
  const customizationData = await getCustomizationData();
  return customizationData.current[category] || 'default';
}

/**
 * 获取装扮的作用范围配置
 * @param {string} itemId - 装扮ID
 * @returns {Promise<Object|null>} 作用范围配置
 */
export async function getItemScope(itemId) {
  const customizationData = await getCustomizationData();
  return customizationData.scopes[itemId] || null;
}

/**
 * 应用角色专属气泡装扮
 *
 * @description
 * 根据角色ID应用专属装扮，优先级：角色专属 > 全局装扮 > 默认样式
 * 用于聊天页面打开时调用
 *
 * 用户气泡：复用 data-bubble-theme（角色专属优先，否则用全局）
 * 角色气泡：使用 data-character-bubble-theme（仅角色专属有效）
 *
 * @param {string} contactId - 联系人ID
 * @returns {Promise<void>}
 */
export async function applyBubbleThemeForCharacter(contactId) {
  logger.info('[Apply] 应用角色专属装扮:', contactId);

  // 1. 获取角色专属装扮数据
  const characterCustomization = await loadData('characterCustomization');
  const characterData = characterCustomization?.[contactId];

  // 2. 获取全局装扮数据
  const customizationData = await getCustomizationData();
  const globalBubble = customizationData.current.bubble;

  // 3. 判断优先级：角色专属 > 全局装扮 > 默认
  let userBubble = 'default';
  let characterBubble = 'default';

  if (characterData) {
    // 有角色专属装扮
    // 用户气泡：角色专属 > 全局 > 默认
    userBubble = characterData.userBubble && characterData.userBubble !== 'default'
      ? characterData.userBubble
      : (globalBubble || 'default');
    // 角色气泡：仅角色专属
    characterBubble = characterData.characterBubble || 'default';
    logger.debug('[Apply] 使用角色专属装扮:', { userBubble, characterBubble });
  } else {
    // 没有角色专属装扮，使用全局装扮
    userBubble = globalBubble || 'default';
    logger.debug('[Apply] 使用全局装扮:', userBubble);
  }

  // 4. 应用CSS（修改body的data属性）
  const body = document.body;

  // 用户气泡：复用 data-bubble-theme（和全局装扮共用CSS规则）
  if (userBubble === 'default') {
    body.removeAttribute('data-bubble-theme');
  } else {
    body.setAttribute('data-bubble-theme', userBubble);
  }

  // 角色气泡：使用 data-character-bubble-theme（独立CSS规则）
  if (characterBubble === 'default') {
    body.removeAttribute('data-character-bubble-theme');
  } else {
    body.setAttribute('data-character-bubble-theme', characterBubble);
  }

  logger.info('[Apply] 角色专属装扮已应用:', { userBubble, characterBubble });
}

/**
 * 初始化装扮（页面加载时调用）
 *
 * @description
 * 从存储中读取当前使用的装扮并应用
 */
export async function initializeCustomization() {
  logger.info('[Apply] 初始化装扮系统');

  const customizationData = await getCustomizationData();

  // 应用气泡装扮
  const currentBubble = customizationData.current.bubble;
  if (currentBubble && currentBubble !== 'default') {
    const body = document.body;
    body.setAttribute('data-bubble-theme', currentBubble);
    logger.info('[Apply] 已恢复气泡装扮:', currentBubble);
  }

  // TODO: 应用头像挂件
  // TODO: 应用主题
}
