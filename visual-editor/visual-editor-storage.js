/**
 * @file 可视化编辑器存储模块
 * @description 负责可视化编辑器数据的文件持久化（单方案）
 */

import { getRequestHeaders } from '../../../../../script.js';
import logger from '../logger.js';

const STORAGE_FILENAME = 'acsus-paws-puffs-visual-editor.json';
const FILE_PATH = `/user/files/${STORAGE_FILENAME}`;

/**
 * @typedef {Object} VEScheme
 * @property {string} id
 * @property {string} name
 * @property {Object} controlsData
 * @property {string} pluginInputCSS
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} VEStorageData
 * @property {number} version
 * @property {Object<string, VEScheme>} schemes
 * @property {{ activeSchemeId: string }} settings
 */

/** @type {VEStorageData} */
const DEFAULT_DATA = {
  version: 1,
  schemes: {
    default: {
      id: 'default',
      name: '默认方案',
      controlsData: {},
      pluginInputCSS: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  },
  settings: {
    activeSchemeId: 'default'
  }
};

/** @type {VEStorageData|null} */
let cachedData = null;

/** @type {number|null} */
let saveTimeout = null;

/**
 * 复制默认存储数据
 * @returns {VEStorageData}
 */
function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

/**
 * 确保激活方案存在，不存在则按默认方案创建
 * @param {VEStorageData} data - 存储数据对象
 * @returns {VEScheme}
 */
function ensureActiveSchemeExists(data) {
  const schemeId = data.settings.activeSchemeId || 'default';
  if (!data.schemes[schemeId]) {
    const defaultScheme = JSON.parse(JSON.stringify(DEFAULT_DATA.schemes.default));
    defaultScheme.id = schemeId;
    data.schemes[schemeId] = defaultScheme;
  }
  return data.schemes[schemeId];
}

/**
 * 加载可视化编辑器存储数据
 * @async
 * @returns {Promise<VEStorageData>}
 */
export async function loadVEStorage() {
  if (cachedData) {
    return cachedData;
  }

  try {
    const response = await fetch(FILE_PATH, {
      method: 'GET',
      headers: getRequestHeaders()
    });

    if (response.ok) {
      const text = await response.text();
      cachedData = JSON.parse(text);
      logger.info('[VEStorage.loadVEStorage] 存储文件加载成功');
      return cachedData;
    }

    if (response.status === 404) {
      logger.info('[VEStorage.loadVEStorage] 存储文件不存在，创建默认数据');
      cachedData = cloneDefaultData();
      await saveVEStorage();
      return cachedData;
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  } catch (error) {
    logger.error('[VEStorage.loadVEStorage] 加载失败:', error.message);
    cachedData = cloneDefaultData();
    return cachedData;
  }
}

/**
 * 保存可视化编辑器存储数据到文件
 * @async
 * @returns {Promise<boolean>}
 */
export async function saveVEStorage() {
  if (!cachedData) {
    logger.warn('[VEStorage.saveVEStorage] 没有可保存的数据');
    return false;
  }

  try {
    const jsonString = JSON.stringify(cachedData, null, 2);
    const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({
        name: STORAGE_FILENAME,
        data: base64Data
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    logger.debug('[VEStorage.saveVEStorage] 存储文件保存成功');
    return true;
  } catch (error) {
    logger.error('[VEStorage.saveVEStorage] 保存失败:', error.message);
    return false;
  }
}

/**
 * 防抖保存（300ms）
 */
export function saveVEDebounced() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    saveVEStorage();
  }, 300);
}

/**
 * 获取当前激活方案的数据
 * @async
 * @returns {Promise<VEScheme>}
 */
export async function getActiveScheme() {
  const data = await loadVEStorage();
  return ensureActiveSchemeExists(data);
}

/**
 * 保存控件调整数据到当前激活方案
 * @async
 * @param {Object} controlsData - 控件数据 { 元素名: { css属性: 值 } }
 */
export async function saveControlsData(controlsData) {
  const data = await loadVEStorage();
  const scheme = ensureActiveSchemeExists(data);
  scheme.controlsData = controlsData;
  scheme.updatedAt = Date.now();
  saveVEDebounced();
}

/**
 * 保存插件输入框CSS到当前激活方案
 * @async
 * @param {string} css - 用户输入的CSS内容
 */
export async function savePluginCSS(css) {
  const data = await loadVEStorage();
  const scheme = ensureActiveSchemeExists(data);
  scheme.pluginInputCSS = css;
  scheme.updatedAt = Date.now();
  saveVEDebounced();
}

/**
 * 创建新方案
 *
 * @description
 * 1. 生成唯一ID（scheme-{时间戳}）
 * 2. 以当前激活方案的数据为模板，创建空白方案（controlsData为空，pluginInputCSS为空）
 * 3. 加入 schemes 字典
 * 4. 切换 activeSchemeId 为新方案
 * 5. 立即保存文件
 *
 * @async
 * @param {string} name - 新方案名称
 * @returns {Promise<VEScheme>} 新建的方案对象
 */
export async function createScheme(name) {
  const data = await loadVEStorage();
  const id = `scheme-${Date.now()}`;
  data.schemes[id] = {
    id,
    name: name.trim() || '新方案',
    controlsData: {},
    pluginInputCSS: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  data.settings.activeSchemeId = id;
  await saveVEStorage();
  logger.info('[VEStorage.createScheme] 新建方案:', name, id);
  return data.schemes[id];
}

/**
 * 删除指定方案
 *
 * @description
 * 安全删除逻辑：
 * - 不允许删除 'default' 方案
 * - 不允许在只有1个方案时删除
 * - 如果删除的是当前激活方案，自动切换到 'default' 或第一个可用方案
 * - 立即保存文件
 *
 * @async
 * @param {string} id - 要删除的方案ID
 * @returns {Promise<boolean>} 是否成功删除
 */
export async function deleteScheme(id) {
  const data = await loadVEStorage();

  if (id === 'default') {
    logger.warn('[VEStorage.deleteScheme] 不允许删除默认方案');
    return false;
  }

  const schemeIds = Object.keys(data.schemes);
  if (schemeIds.length <= 1) {
    logger.warn('[VEStorage.deleteScheme] 只剩一个方案，不允许删除');
    return false;
  }

  const isActive = data.settings.activeSchemeId === id;
  delete data.schemes[id];

  if (isActive) {
    data.settings.activeSchemeId = data.schemes.default
      ? 'default'
      : Object.keys(data.schemes)[0];
    logger.info('[VEStorage.deleteScheme] 已切换激活方案至:', data.settings.activeSchemeId);
  }

  await saveVEStorage();
  logger.info('[VEStorage.deleteScheme] 删除方案:', id);
  return true;
}

/**
 * 重命名方案
 *
 * @async
 * @param {string} id - 方案ID
 * @param {string} name - 新名称
 * @returns {Promise<boolean>} 是否成功
 */
export async function renameScheme(id, name) {
  const data = await loadVEStorage();
  if (!data.schemes[id]) {
    logger.warn('[VEStorage.renameScheme] 方案不存在:', id);
    return false;
  }
  data.schemes[id].name = name.trim() || data.schemes[id].name;
  data.schemes[id].updatedAt = Date.now();
  await saveVEStorage();
  logger.info('[VEStorage.renameScheme] 重命名方案:', id, '->', name);
  return true;
}

/**
 * 切换激活方案
 *
 * @description
 * 更新 activeSchemeId 并立即保存。
 * 注意：本函数只更新存储，不负责重新注入CSS，那是 visual-editor.js 的职责。
 *
 * @async
 * @param {string} id - 要切换到的方案ID
 * @returns {Promise<VEScheme|null>} 切换后的激活方案，失败返回 null
 */
export async function switchScheme(id) {
  const data = await loadVEStorage();
  if (!data.schemes[id]) {
    logger.warn('[VEStorage.switchScheme] 方案不存在:', id);
    return null;
  }
  data.settings.activeSchemeId = id;
  await saveVEStorage();
  logger.info('[VEStorage.switchScheme] 已切换至方案:', id);
  return data.schemes[id];
}

/**
 * 获取所有方案的列表（同步，需已加载缓存）
 *
 * @description
 * 同步函数，直接读取内存缓存。
 * 必须在 loadVEStorage() 完成后才能调用（getActiveScheme 已确保加载）。
 *
 * @returns {{ id: string, name: string, isActive: boolean }[]} 方案列表
 */
export function getSchemeList() {
  if (!cachedData) {
    logger.warn('[VEStorage.getSchemeList] 缓存未加载，返回空列表');
    return [];
  }
  const activeId = cachedData.settings.activeSchemeId;
  return Object.values(cachedData.schemes).map(s => ({
    id: s.id,
    name: s.name,
    isActive: s.id === activeId
  }));
}

export default {
  loadVEStorage,
  saveVEStorage,
  saveVEDebounced,
  getActiveScheme,
  saveControlsData,
  savePluginCSS,
  createScheme,
  deleteScheme,
  renameScheme,
  switchScheme,
  getSchemeList
};
