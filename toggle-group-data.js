/**
 * 总开关数据层 - 管理开关组（Toggle Group）
 *
 * @module toggle-group-data
 * @description
 * 提供总开关的核心数据操作：
 * - 创建/删除/重命名开关组
 * - 添加/移除组内成员（预设条目或世界书条目）
 * - 批量切换组内所有成员的开关状态
 * - 导入/导出开关组配置
 *
 * 数据存储在 extension_settings['Acsus-Paws-Puffs'].toggleGroups
 */

import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { promptManager, oai_settings } from '../../../openai.js';
import logger from './logger.js';

// ========================================
// 常量定义
// ========================================

const EXT_ID = 'Acsus-Paws-Puffs';
const STORAGE_KEY = 'toggleGroups';

/**
 * 默认存储结构
 */
const DEFAULT_STORAGE = {
  groups: [],  // ToggleGroup[]
  menuSettings: {
    showToggleGroups: true,
    showQuickToggles: true,
    showSnapshots: true
  }
};

// ========================================
// 类型定义（JSDoc）
// ========================================

/**
 * 开关组成员条目
 * @typedef {Object} ToggleEntry
 * @property {'preset'|'worldinfo'} type - 条目类型
 * @property {string} identifier - 预设条目的identifier（type='preset'时）
 * @property {string} [worldName] - 世界书名称（type='worldinfo'时）
 * @property {number} [uid] - 世界书条目uid（type='worldinfo'时）
 * @property {string} displayName - 显示名称
 */

/**
 * 开关组
 * @typedef {Object} ToggleGroup
 * @property {string} id - 唯一ID
 * @property {string} name - 组名称
 * @property {ToggleEntry[]} entries - 组内成员
 * @property {number} order - 排序顺序
 * @property {boolean} [showInFloatingMenu] - 是否显示在悬浮按钮菜单中
 */

// ========================================
// 内部辅助函数
// ========================================

/**
 * 生成唯一ID
 * @returns {string} UUID
 */
function generateUUID() {
  return 'tg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 获取存储对象（确保结构完整）
 * @returns {Object} 存储对象
 */
function getStorage() {
  extension_settings[EXT_ID] = extension_settings[EXT_ID] || {};

  if (!extension_settings[EXT_ID][STORAGE_KEY]) {
    extension_settings[EXT_ID][STORAGE_KEY] = { ...DEFAULT_STORAGE };
  }

  const storage = extension_settings[EXT_ID][STORAGE_KEY];

  // 确保 groups 数组存在
  if (!Array.isArray(storage.groups)) {
    storage.groups = [];
  }

  // 确保 menuSettings 存在
  if (!storage.menuSettings) {
    storage.menuSettings = { ...DEFAULT_STORAGE.menuSettings };
  }

  return storage;
}

/**
 * 获取当前预设的 prompt_order
 * @returns {Array<{identifier: string, enabled: boolean}>} 条目列表
 */
function getCurrentPromptOrder() {
  try {
    if (!promptManager || !promptManager.activeCharacter) {
      logger.warn('[ToggleGroup] promptManager 或 activeCharacter 不存在');
      return [];
    }
    const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);
    return promptOrder || [];
  } catch (error) {
    logger.error('[ToggleGroup] 获取 prompt_order 失败:', error.message);
    return [];
  }
}

// ========================================
// 开关组 CRUD 操作
// ========================================

/**
 * 获取所有开关组
 * @returns {ToggleGroup[]} 开关组列表
 */
export function getToggleGroups() {
  const storage = getStorage();
  return storage.groups;
}

/**
 * 根据ID获取开关组
 * @param {string} groupId - 组ID
 * @returns {ToggleGroup|null} 开关组或null
 */
export function getToggleGroupById(groupId) {
  const groups = getToggleGroups();
  return groups.find(g => g.id === groupId) || null;
}

/**
 * 创建新的开关组
 * @param {string} name - 组名称
 * @returns {ToggleGroup|null} 创建的组，失败返回null
 */
export function createToggleGroup(name) {
  if (!name || !name.trim()) {
    logger.warn('[ToggleGroup] 组名称不能为空');
    return null;
  }

  const storage = getStorage();
  const trimmedName = name.trim();

  // 计算新的排序顺序
  const maxOrder = storage.groups.reduce((max, g) => Math.max(max, g.order || 0), 0);

  const newGroup = {
    id: generateUUID(),
    name: trimmedName,
    entries: [],
    order: maxOrder + 1,
    showInFloatingMenu: false  // 默认不显示在悬浮按钮菜单
  };

  storage.groups.push(newGroup);
  saveSettingsDebounced();

  logger.info('[ToggleGroup] 已创建开关组:', trimmedName);
  return newGroup;
}

/**
 * 重命名开关组
 * @param {string} groupId - 组ID
 * @param {string} newName - 新名称
 * @returns {boolean} 是否成功
 */
export function renameToggleGroup(groupId, newName) {
  if (!newName || !newName.trim()) {
    logger.warn('[ToggleGroup] 新名称不能为空');
    return false;
  }

  const group = getToggleGroupById(groupId);
  if (!group) {
    logger.warn('[ToggleGroup] 未找到开关组:', groupId);
    return false;
  }

  const oldName = group.name;
  group.name = newName.trim();
  saveSettingsDebounced();

  logger.info('[ToggleGroup] 已重命名开关组:', oldName, '→', group.name);
  return true;
}

/**
 * 删除开关组
 * @param {string} groupId - 组ID
 * @returns {boolean} 是否成功
 */
export function deleteToggleGroup(groupId) {
  const storage = getStorage();
  const index = storage.groups.findIndex(g => g.id === groupId);

  if (index === -1) {
    logger.warn('[ToggleGroup] 未找到开关组:', groupId);
    return false;
  }

  const removed = storage.groups.splice(index, 1)[0];
  saveSettingsDebounced();

  logger.info('[ToggleGroup] 已删除开关组:', removed.name);
  return true;
}

/**
 * 设置开关组是否显示在悬浮按钮菜单
 * @param {string} groupId - 组ID
 * @param {boolean} show - 是否显示
 * @returns {boolean} 是否成功
 */
export function setShowInFloatingMenu(groupId, show) {
  const group = getToggleGroupById(groupId);
  if (!group) {
    logger.warn('[ToggleGroup] 未找到开关组:', groupId);
    return false;
  }

  group.showInFloatingMenu = show;
  saveSettingsDebounced();

  logger.info('[ToggleGroup] 设置悬浮菜单显示:', group.name, '→', show ? '显示' : '隐藏');
  return true;
}

/**
 * 获取需要显示在悬浮按钮菜单的开关组
 * @returns {ToggleGroup[]} 开关组列表
 */
export function getFloatingMenuGroups() {
  const groups = getToggleGroups();
  return groups.filter(g => g.showInFloatingMenu);
}

// ========================================
// 组成员管理
// ========================================

/**
 * 添加预设条目到开关组
 * @param {string} groupId - 组ID
 * @param {string} identifier - 预设条目identifier
 * @param {string} displayName - 显示名称
 * @returns {boolean} 是否成功
 */
export function addPresetEntry(groupId, identifier, displayName) {
  const group = getToggleGroupById(groupId);
  if (!group) {
    logger.warn('[ToggleGroup] 未找到开关组:', groupId);
    return false;
  }

  // 检查是否已存在
  const exists = group.entries.some(
    e => e.type === 'preset' && e.identifier === identifier
  );
  if (exists) {
    logger.warn('[ToggleGroup] 预设条目已存在:', identifier);
    return false;
  }

  group.entries.push({
    type: 'preset',
    identifier,
    displayName
  });
  saveSettingsDebounced();

  logger.info('[ToggleGroup] 已添加预设条目到组:', displayName, '→', group.name);
  return true;
}

/**
 * 添加世界书条目到开关组
 * @param {string} groupId - 组ID
 * @param {string} worldName - 世界书名称
 * @param {number} uid - 条目uid
 * @param {string} displayName - 显示名称
 * @returns {boolean} 是否成功
 */
export function addWorldInfoEntry(groupId, worldName, uid, displayName) {
  const group = getToggleGroupById(groupId);
  if (!group) {
    logger.warn('[ToggleGroup] 未找到开关组:', groupId);
    return false;
  }

  // 检查是否已存在
  const exists = group.entries.some(
    e => e.type === 'worldinfo' && e.worldName === worldName && e.uid === uid
  );
  if (exists) {
    logger.warn('[ToggleGroup] 世界书条目已存在:', worldName, uid);
    return false;
  }

  group.entries.push({
    type: 'worldinfo',
    worldName,
    uid,
    displayName
  });
  saveSettingsDebounced();

  logger.info('[ToggleGroup] 已添加世界书条目到组:', displayName, '→', group.name);
  return true;
}

/**
 * 从开关组移除成员
 * @param {string} groupId - 组ID
 * @param {number} entryIndex - 成员索引
 * @returns {boolean} 是否成功
 */
export function removeEntry(groupId, entryIndex) {
  const group = getToggleGroupById(groupId);
  if (!group) {
    logger.warn('[ToggleGroup] 未找到开关组:', groupId);
    return false;
  }

  if (entryIndex < 0 || entryIndex >= group.entries.length) {
    logger.warn('[ToggleGroup] 无效的成员索引:', entryIndex);
    return false;
  }

  const removed = group.entries.splice(entryIndex, 1)[0];
  saveSettingsDebounced();

  logger.info('[ToggleGroup] 已移除成员:', removed.displayName, '从', group.name);
  return true;
}

// ========================================
// 开关切换操作
// ========================================

/**
 * 切换开关组状态（批量开启或关闭所有成员）
 * @param {string} groupId - 组ID
 * @param {boolean} state - 目标状态（true=开启，false=关闭）
 * @returns {Promise<{success: number, failed: number, skipped: number}>} 操作结果
 */
export async function toggleGroup(groupId, state) {
  const group = getToggleGroupById(groupId);
  if (!group) {
    logger.warn('[ToggleGroup] 未找到开关组:', groupId);
    return { success: 0, failed: 0, skipped: 0 };
  }

  const result = { success: 0, failed: 0, skipped: 0 };
  const promptOrder = getCurrentPromptOrder();
  const affectedWorlds = new Set();  // 记录涉及到的世界书，用于刷新UI

  for (const entry of group.entries) {
    try {
      if (entry.type === 'preset') {
        // 处理预设条目
        const promptEntry = promptOrder.find(e => e.identifier === entry.identifier);
        if (promptEntry) {
          promptEntry.enabled = state;
          result.success++;
        } else {
          logger.warn('[ToggleGroup] 预设条目不存在，跳过:', entry.identifier);
          result.skipped++;
        }
      } else if (entry.type === 'worldinfo') {
        // 处理世界书条目
        const wiResult = await toggleWorldInfoEntry(entry.worldName, entry.uid, state);
        if (wiResult) {
          result.success++;
          affectedWorlds.add(entry.worldName);  // 记录涉及的世界书
        } else {
          result.skipped++;
        }
      }
    } catch (error) {
      logger.error('[ToggleGroup] 切换条目失败:', entry.displayName, error.message);
      result.failed++;
    }
  }

  // 保存组的当前状态（用于getGroupState）
  group.currentState = state;

  // 保存设置并刷新UI
  saveSettingsDebounced();
  if (promptManager && typeof promptManager.render === 'function') {
    promptManager.render(false);
  }

  // 刷新涉及到的世界书编辑器UI
  if (affectedWorlds.size > 0) {
    try {
      const { reloadEditor } = await import('../../../world-info.js');
      for (const worldName of affectedWorlds) {
        reloadEditor(worldName);
      }
    } catch (error) {
      // 刷新UI失败不影响主流程，只记录警告
      logger.warn('[ToggleGroup] 刷新世界书UI失败:', error.message);
    }
  }

  logger.info('[ToggleGroup] 切换完成:', group.name, '→', state ? '开启' : '关闭',
    `成功:${result.success} 跳过:${result.skipped} 失败:${result.failed}`);

  return result;
}

/**
 * 切换世界书条目状态（内部辅助函数）
 *
 * @description
 * 直接修改世界书条目的 disable 字段，就像在官方世界书界面点击开关一样。
 * 使用 worldName + uid 组合来唯一标识条目。
 *
 * @async
 * @param {string} worldName - 世界书名称
 * @param {number} uid - 条目uid
 * @param {boolean} state - 目标状态（true=启用, false=禁用）
 * @returns {Promise<boolean>} 是否成功
 */
async function toggleWorldInfoEntry(worldName, uid, state) {
  try {
    // 动态导入需要的模块
    const { loadWorldInfo, saveWorldInfo } = await import('../../../world-info.js');

    // 加载世界书数据
    const worldData = await loadWorldInfo(worldName);
    if (!worldData || !worldData.entries) {
      logger.warn('[ToggleGroup] 无法加载世界书:', worldName);
      return false;
    }

    // 在entries中查找匹配的条目（uid可能是数字或字符串）
    const entry = worldData.entries[uid] || worldData.entries[String(uid)];
    if (!entry) {
      logger.warn('[ToggleGroup] 世界书条目不存在:', worldName, 'uid:', uid);
      return false;
    }

    // 修改 disable 字段（state=true表示启用，所以disable=false）
    const newDisableState = !state;

    // 如果状态没变，跳过
    if (entry.disable === newDisableState) {
      logger.debug('[ToggleGroup] 世界书条目状态未变:', entry.comment || worldName, 'uid:', uid);
      return true;
    }

    // 更新条目状态
    entry.disable = newDisableState;

    // 保存世界书
    await saveWorldInfo(worldName, worldData);

    logger.debug('[ToggleGroup] 已切换世界书条目:', entry.comment || worldName, 'uid:', uid, '→', state ? '启用' : '禁用');
    return true;
  } catch (error) {
    logger.error('[ToggleGroup] 切换世界书条目失败:', error.message);
    return false;
  }
}

/**
 * 获取开关组的当前状态
 *
 * @description
 * 优先使用组的 currentState 字段（由 toggleGroup 设置）。
 * 如果没有 currentState，则检查预设条目的实际状态。
 *
 * @param {string} groupId - 组ID
 * @returns {boolean|null} true=全部开启, false=全部关闭, null=混合状态或未知
 */
export function getGroupState(groupId) {
  const group = getToggleGroupById(groupId);
  if (!group || group.entries.length === 0) {
    return null;
  }

  // 如果有保存的状态，直接返回
  if (typeof group.currentState === 'boolean') {
    return group.currentState;
  }

  // 没有保存的状态时，检查预设条目的实际状态
  const promptOrder = getCurrentPromptOrder();
  let enabledCount = 0;
  let totalPresets = 0;

  for (const entry of group.entries) {
    if (entry.type === 'preset') {
      const promptEntry = promptOrder.find(e => e.identifier === entry.identifier);
      if (promptEntry) {
        totalPresets++;
        if (promptEntry.enabled) enabledCount++;
      }
    }
  }

  // 如果有预设条目，根据预设状态判断
  if (totalPresets > 0) {
    if (enabledCount === totalPresets) return true;
    if (enabledCount === 0) return false;
    return null;  // 混合状态
  }

  // 只有世界书条目且没有保存状态，返回null
  return null;
}

// ========================================
// 导入导出
// ========================================

/**
 * 导出所有开关组
 * @returns {Object} 导出数据
 */
export function exportToggleGroups() {
  const storage = getStorage();
  return {
    version: 1,
    exportTime: new Date().toISOString(),
    groups: storage.groups
  };
}

/**
 * 导入开关组
 * @param {Object} data - 导入数据
 * @returns {{success: number, skipped: number}} 导入结果
 */
export function importToggleGroups(data) {
  if (!data || !Array.isArray(data.groups)) {
    logger.warn('[ToggleGroup] 导入数据格式无效');
    return { success: 0, skipped: 0 };
  }

  const storage = getStorage();
  const existingNames = new Set(storage.groups.map(g => g.name));
  let success = 0;
  let skipped = 0;

  for (const group of data.groups) {
    if (!group.name || !Array.isArray(group.entries)) {
      skipped++;
      continue;
    }

    // 处理重名
    let finalName = group.name;
    let counter = 1;
    while (existingNames.has(finalName)) {
      finalName = `${group.name} (${counter++})`;
    }

    const newGroup = {
      id: generateUUID(),
      name: finalName,
      entries: group.entries,
      order: storage.groups.length
    };

    storage.groups.push(newGroup);
    existingNames.add(finalName);
    success++;
  }

  saveSettingsDebounced();
  logger.info('[ToggleGroup] 导入完成:', `成功:${success} 跳过:${skipped}`);

  return { success, skipped };
}

// ========================================
// 菜单设置
// ========================================

/**
 * 获取菜单设置
 * @returns {Object} 菜单设置
 */
export function getMenuSettings() {
  const storage = getStorage();
  return storage.menuSettings;
}

/**
 * 更新菜单设置
 * @param {Object} settings - 新设置
 */
export function updateMenuSettings(settings) {
  const storage = getStorage();
  storage.menuSettings = { ...storage.menuSettings, ...settings };
  saveSettingsDebounced();
  logger.info('[ToggleGroup] 已更新菜单设置');
}
