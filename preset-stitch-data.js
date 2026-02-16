/**
 * 预设缝合器 - 数据层
 *
 * 负责收藏库数据的存储、读取和 CRUD 操作
 * 数据持久化到 extension_settings['Acsus-Paws-Puffs'].presetStitch
 */

import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { uuidv4 } from '../../../utils.js';
import logger from './logger.js';

// ========================================
// 数据结构
// ========================================

/**
 * 默认数据结构
 * @type {{enabled: boolean, items: Array, tags: Array}}
 */
const DEFAULT_DATA = {
  enabled: true,
  items: [],
  tags: []
};

// ========================================
// 内部辅助函数
// ========================================

/**
 * 获取数据存储对象
 * @returns {Object} 数据对象
 */
function getData() {
  extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
  extension_settings['Acsus-Paws-Puffs'].presetStitch = extension_settings['Acsus-Paws-Puffs'].presetStitch || { ...DEFAULT_DATA };
  return extension_settings['Acsus-Paws-Puffs'].presetStitch;
}

// ========================================
// 启用状态管理
// ========================================

/**
 * 检查功能是否启用
 * @returns {boolean} 是否启用
 */
export function isEnabled() {
  return getData().enabled !== false;
}

/**
 * 设置启用状态
 * @param {boolean} enabled - 是否启用
 */
export function setEnabled(enabled) {
  getData().enabled = enabled;
  saveData();
  logger.debug('preset', '[PresetStitchData] 启用状态已设置:', enabled);
}

// ========================================
// 条目 CRUD 操作
// ========================================

/**
 * 获取所有收藏条目
 * @returns {Array} 条目数组
 */
export function getItems() {
  return getData().items || [];
}

/**
 * 根据 ID 获取条目
 * @param {string} id - 条目 ID
 * @returns {Object|null} 条目对象或 null
 */
export function getItemById(id) {
  return getItems().find(item => item.id === id) || null;
}


/**
 * 添加新条目到收藏库
 * @param {Object} item - 条目数据
 * @param {string} item.name - 条目名称
 * @param {string} item.content - 提示词内容
 * @param {string} [item.role='system'] - 角色
 * @param {string[]} [item.tags=[]] - 标签数组
 * @param {string} [item.source='manual'] - 来源（preset/worldbook/manual）
 * @returns {string|null} 新条目的 ID，失败返回 null
 */
export function addItem(item) {
  if (!item.name || !item.content) {
    logger.warn('preset', '[PresetStitchData] 添加条目失败：名称或内容为空');
    return null;
  }

  const newItem = {
    id: uuidv4(),
    name: item.name,
    content: item.content,
    role: item.role || 'system',
    tags: item.tags || [],
    source: item.source || 'manual',
    createdAt: Date.now()
  };

  getData().items.push(newItem);
  saveData();
  logger.info('preset', '[PresetStitchData] 已添加条目:', newItem.name);
  return newItem.id;
}

/**
 * 更新条目
 * @param {string} id - 条目 ID
 * @param {Object} updates - 要更新的字段
 * @returns {boolean} 是否成功
 */
export function updateItem(id, updates) {
  const items = getItems();
  const index = items.findIndex(item => item.id === id);

  if (index === -1) {
    logger.warn('preset', '[PresetStitchData] 更新条目失败：未找到 ID:', id);
    return false;
  }

  // 只更新允许的字段，保留 id 和 createdAt
  const allowedFields = ['name', 'content', 'role', 'tags'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      items[index][field] = updates[field];
    }
  }

  saveData();
  logger.info('preset', '[PresetStitchData] 已更新条目:', items[index].name);
  return true;
}

/**
 * 删除条目
 * @param {string} id - 条目 ID
 * @returns {boolean} 是否成功
 */
export function deleteItem(id) {
  const data = getData();
  const index = data.items.findIndex(item => item.id === id);

  if (index === -1) {
    logger.warn('preset', '[PresetStitchData] 删除条目失败：未找到 ID:', id);
    return false;
  }

  const deletedItem = data.items.splice(index, 1)[0];
  saveData();
  logger.info('preset', '[PresetStitchData] 已删除条目:', deletedItem.name);
  return true;
}

// ========================================
// 标签管理
// ========================================

/**
 * 获取所有标签
 * @returns {string[]} 标签数组
 */
export function getTags() {
  return getData().tags || [];
}

/**
 * 添加新标签
 * @param {string} name - 标签名称
 * @returns {boolean} 是否成功
 */
export function addTag(name) {
  if (!name || typeof name !== 'string') {
    logger.warn('preset', '[PresetStitchData] 添加标签失败：名称无效');
    return false;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    logger.warn('preset', '[PresetStitchData] 添加标签失败：名称为空');
    return false;
  }

  const tags = getTags();
  if (tags.includes(trimmedName)) {
    logger.warn('preset', '[PresetStitchData] 添加标签失败：标签已存在:', trimmedName);
    return false;
  }

  getData().tags.push(trimmedName);
  saveData();
  logger.info('preset', '[PresetStitchData] 已添加标签:', trimmedName);
  return true;
}

/**
 * 重命名标签
 * @param {string} oldName - 旧名称
 * @param {string} newName - 新名称
 * @returns {boolean} 是否成功
 */
export function renameTag(oldName, newName) {
  const trimmedNew = newName?.trim();
  if (!trimmedNew) {
    logger.warn('preset', '[PresetStitchData] 重命名标签失败：新名称为空');
    return false;
  }

  const data = getData();
  const tagIndex = data.tags.indexOf(oldName);

  if (tagIndex === -1) {
    logger.warn('preset', '[PresetStitchData] 重命名标签失败：未找到标签:', oldName);
    return false;
  }

  if (data.tags.includes(trimmedNew) && trimmedNew !== oldName) {
    logger.warn('preset', '[PresetStitchData] 重命名标签失败：新名称已存在:', trimmedNew);
    return false;
  }

  // 更新标签列表
  data.tags[tagIndex] = trimmedNew;

  // 更新所有条目中的标签引用
  for (const item of data.items) {
    const itemTagIndex = item.tags?.indexOf(oldName);
    if (itemTagIndex !== -1 && itemTagIndex !== undefined) {
      item.tags[itemTagIndex] = trimmedNew;
    }
  }

  saveData();
  logger.info('preset', '[PresetStitchData] 已重命名标签:', oldName, '->', trimmedNew);
  return true;
}

/**
 * 删除标签
 * @param {string} name - 标签名称
 * @returns {boolean} 是否成功
 */
export function deleteTag(name) {
  const data = getData();
  const tagIndex = data.tags.indexOf(name);

  if (tagIndex === -1) {
    logger.warn('preset', '[PresetStitchData] 删除标签失败：未找到标签:', name);
    return false;
  }

  // 从标签列表中删除
  data.tags.splice(tagIndex, 1);

  // 从所有条目中移除该标签
  for (const item of data.items) {
    if (item.tags) {
      const itemTagIndex = item.tags.indexOf(name);
      if (itemTagIndex !== -1) {
        item.tags.splice(itemTagIndex, 1);
      }
    }
  }

  saveData();
  logger.info('preset', '[PresetStitchData] 已删除标签:', name);
  return true;
}

// ========================================
// 数据持久化
// ========================================

/**
 * 保存数据到 extension_settings
 */
export function saveData() {
  saveSettingsDebounced();
}

/**
 * 加载数据（初始化时调用）
 * @returns {Object} 加载的数据
 */
export function loadData() {
  const data = getData();
  logger.debug('preset', '[PresetStitchData] 数据已加载，条目数:', data.items?.length || 0, '标签数:', data.tags?.length || 0);
  return data;
}
