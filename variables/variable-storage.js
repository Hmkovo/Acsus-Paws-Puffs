/**
 * 变量存储模块 (Variable Storage) - V2
 *
 * @description
 * 使用 SillyTavern 的文件 API 将变量数据持久化到 JSON 文件
 * V2 版本支持：套装、条目列表、叠加/覆盖模式、选择性引用等
 *
 * 文件位置:
 * - 主配置: data/default-user/user/files/acsus-paws-puffs-variables-v2.json
 * - 变量值: data/default-user/user/files/acsus-paws-puffs-variables-v2-{chatId}.json
 */

import { getRequestHeaders } from '../../../../../script.js';
import logger from '../logger.js';

// ============================================
// 常量定义
// ============================================

/** V2 存储文件名 */
const STORAGE_FILENAME_V2 = 'acsus-paws-puffs-variables-v2.json';

/** V1 存储文件名（用于迁移） */
const STORAGE_FILENAME_V1 = 'acsus-paws-puffs-variables.json';

/** V2 文件路径 */
const FILE_PATH_V2 = `/user/files/${STORAGE_FILENAME_V2}`;

/** V1 文件路径 */
const FILE_PATH_V1 = `/user/files/${STORAGE_FILENAME_V1}`;

/** 变量值文件名前缀 */
const VALUES_FILENAME_PREFIX = 'acsus-paws-puffs-variables-v2-';

// ============================================
// 类型导入（仅用于 JSDoc）
// ============================================

/**
 * @typedef {import('./variable-types.js').PromptSuite} PromptSuite
 * @typedef {import('./variable-types.js').VariableDefinitionV2} VariableDefinitionV2
 * @typedef {import('./variable-types.js').VariableSettingsV2} VariableSettingsV2
 * @typedef {import('./variable-types.js').VariableStorageDataV2} VariableStorageDataV2
 * @typedef {import('./variable-types.js').VariableValueV2} VariableValueV2
 * @typedef {import('./variable-types.js').StackVariableValue} StackVariableValue
 * @typedef {import('./variable-types.js').ReplaceVariableValue} ReplaceVariableValue
 */

// ============================================
// 数据结构
// ============================================

/**
 * V1 数据结构（用于迁移）
 * @typedef {Object} VariableStorageDataV1
 * @property {number} version - 数据版本号
 * @property {Array} definitions - 变量定义列表
 * @property {Object} settings - 全局设置
 * @property {Object} values - 变量值
 */

/** @type {VariableStorageDataV2} */
const DEFAULT_DATA_V2 = {
    version: 2,
    suites: {},
    variables: {},
    settings: {
        enabled: false,
        activeSuiteId: null,
        apiConfig: {
            source: 'default',
            baseUrl: '',
            apiKey: '',
            model: '',
            format: 'openai',
            params: {}
        },
        messageCounts: {}
    }
};

// V1 默认数据（保留用于兼容）
/** @type {VariableStorageDataV1} */
const DEFAULT_DATA_V1 = {
    version: 1,
    definitions: [],
    settings: {
        enabled: false,
        autoTrigger: {
            enabled: false,
            messageCount: 10
        },
        contextSettings: {
            messageCount: 50,
            includeAll: false
        },
        apiConfig: {
            source: 'default',
            baseUrl: '',
            apiKey: '',
            model: '',
            format: 'openai',
            params: {}
        }
    },
    values: {}
};

// ============================================
// 内存缓存
// ============================================

/** @type {VariableStorageDataV2|null} V2 缓存 */
let cachedDataV2 = null;

/** @type {VariableStorageDataV1|null} V1 缓存（兼容） */
let cachedDataV1 = null;

/** @type {Object<string, Object<string, VariableValueV2>>} 变量值缓存（按 chatId） */
let cachedValues = {};

/** @type {boolean} */
let isDirtyV2 = false;

/** @type {boolean} */
let isDirtyV1 = false;

/** @type {Set<string>} 脏的变量值文件 */
let dirtyValueFiles = new Set();

/** @type {number|null} */
let saveTimeoutV2 = null;

/** @type {number|null} */
let saveTimeoutV1 = null;

/** @type {number|null} */
let saveTimeoutValues = null;

// ============================================
// V2 核心函数
// ============================================

/**
 * 加载 V2 存储数据
 * @async
 * @returns {Promise<VariableStorageDataV2>}
 */
export async function loadStorageV2() {
    if (cachedDataV2) {
        return cachedDataV2;
    }

    try {
        logger.debug('[VariableStorage] 尝试加载 V2 存储文件...');

        const response = await fetch(FILE_PATH_V2, {
            method: 'GET',
            headers: getRequestHeaders()
        });

        if (response.ok) {
            const text = await response.text();
            cachedDataV2 = JSON.parse(text);
            logger.info('[VariableStorage] V2 存储文件加载成功');
            return cachedDataV2;
        } else if (response.status === 404) {
            logger.info('[VariableStorage] V2 存储文件不存在，创建默认数据');
            cachedDataV2 = JSON.parse(JSON.stringify(DEFAULT_DATA_V2));
            await saveStorageV2();
            return cachedDataV2;
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        logger.error('[VariableStorage] V2 加载失败:', error.message);
        cachedDataV2 = JSON.parse(JSON.stringify(DEFAULT_DATA_V2));
        return cachedDataV2;
    }
}

/**
 * 保存 V2 存储数据
 * @async
 * @returns {Promise<boolean>}
 */
export async function saveStorageV2() {
    if (!cachedDataV2) {
        logger.warn('[VariableStorage] V2 没有数据可保存');
        return false;
    }

    try {
        const jsonString = JSON.stringify(cachedDataV2, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: STORAGE_FILENAME_V2,
                data: base64Data
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        isDirtyV2 = false;
        logger.debug('[VariableStorage] V2 数据已保存');
        return true;
    } catch (error) {
        logger.error('[VariableStorage] V2 保存失败:', error.message);
        return false;
    }
}

/**
 * V2 延迟保存（防抖）
 */
export function saveStorageV2Debounced() {
    isDirtyV2 = true;

    if (saveTimeoutV2) {
        clearTimeout(saveTimeoutV2);
    }

    saveTimeoutV2 = setTimeout(async () => {
        saveTimeoutV2 = null;
        if (isDirtyV2) {
            await saveStorageV2();
        }
    }, 300);
}

// ============================================
// V2 套装操作
// ============================================

/**
 * 获取所有套装
 * @async
 * @returns {Promise<Object<string, PromptSuite>>}
 */
export async function getSuitesV2() {
    const data = await loadStorageV2();
    return data.suites;
}

/**
 * 保存套装
 * @async
 * @param {Object<string, PromptSuite>} suites
 */
export async function saveSuitesV2(suites) {
    const data = await loadStorageV2();
    data.suites = suites;
    saveStorageV2Debounced();
}

// ============================================
// V2 变量定义操作
// ============================================

/**
 * 获取所有 V2 变量定义
 * @async
 * @returns {Promise<Object<string, VariableDefinitionV2>>}
 */
export async function getDefinitionsV2() {
    const data = await loadStorageV2();
    return data.variables;
}

/**
 * 保存 V2 变量定义
 * @async
 * @param {Object<string, VariableDefinitionV2>} variables
 */
export async function saveDefinitionsV2(variables) {
    const data = await loadStorageV2();
    data.variables = variables;
    saveStorageV2Debounced();
}

// ============================================
// V2 设置操作
// ============================================

/**
 * 获取 V2 设置
 * @async
 * @returns {Promise<VariableSettingsV2>}
 */
export async function getSettingsV2() {
    const data = await loadStorageV2();
    return { ...data.settings };
}

/**
 * 保存 V2 设置
 * @async
 * @param {VariableSettingsV2} settings
 */
export async function saveSettingsV2(settings) {
    const data = await loadStorageV2();
    data.settings = settings;
    saveStorageV2Debounced();
}

// ============================================
// V2 变量值操作（按聊天分文件）
// ============================================

/**
 * 获取变量值文件名
 * @param {string} chatId
 * @returns {string}
 */
function getValuesFilename(chatId) {
    // 清理 chatId 中的特殊字符
    const safeChatId = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${VALUES_FILENAME_PREFIX}${safeChatId}.json`;
}

/**
 * 加载聊天的变量值
 * @async
 * @param {string} chatId
 * @returns {Promise<Object<string, VariableValueV2>>}
 */
export async function loadValuesV2(chatId) {
    if (cachedValues[chatId]) {
        return cachedValues[chatId];
    }

    const filename = getValuesFilename(chatId);
    const filePath = `/user/files/${filename}`;

    try {
        const response = await fetch(filePath, {
            method: 'GET',
            headers: getRequestHeaders()
        });

        if (response.ok) {
            const data = JSON.parse(await response.text());
            cachedValues[chatId] = data.values || {};
            return cachedValues[chatId];
        } else if (response.status === 404) {
            cachedValues[chatId] = {};
            return cachedValues[chatId];
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        logger.error('[VariableStorage] 加载变量值失败:', chatId, error.message);
        cachedValues[chatId] = {};
        return cachedValues[chatId];
    }
}

/**
 * 保存聊天的变量值
 * @async
 * @param {string} chatId
 * @returns {Promise<boolean>}
 */
export async function saveValuesV2(chatId) {
    const values = cachedValues[chatId];
    if (!values) return false;

    const filename = getValuesFilename(chatId);

    try {
        const data = { chatId, values };
        const jsonString = JSON.stringify(data, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: filename,
                data: base64Data
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        dirtyValueFiles.delete(chatId);
        logger.debug('[VariableStorage] 变量值已保存:', chatId);
        return true;
    } catch (error) {
        logger.error('[VariableStorage] 保存变量值失败:', chatId, error.message);
        return false;
    }
}

/**
 * 延迟保存变量值（防抖）
 * @param {string} chatId
 */
export function saveValuesV2Debounced(chatId) {
    dirtyValueFiles.add(chatId);

    if (saveTimeoutValues) {
        clearTimeout(saveTimeoutValues);
    }

    saveTimeoutValues = setTimeout(async () => {
        saveTimeoutValues = null;
        for (const id of dirtyValueFiles) {
            await saveValuesV2(id);
        }
    }, 300);
}

/**
 * 获取 V2 变量值
 * @async
 * @param {string} variableId
 * @param {string} chatId
 * @returns {Promise<VariableValueV2|null>}
 */
export async function getValueV2(variableId, chatId) {
    const values = await loadValuesV2(chatId);
    return values[variableId] || null;
}

/**
 * 同步获取 V2 变量值（从缓存）
 *
 * @description
 * 用于全局宏替换，因为 SillyTavern 的宏替换是同步的。
 * 只返回已缓存的数据，不会触发异步加载。
 *
 * @param {string} variableId
 * @param {string} chatId
 * @returns {VariableValueV2|null}
 */
export function getCachedValueV2(variableId, chatId) {
    // 直接从内存缓存读取，不触发异步加载
    if (!cachedValues[chatId]) {
        return null;
    }
    return cachedValues[chatId][variableId] || null;
}

/**
 * 确保缓存已加载（同步阻塞方式）
 * 用于宏处理器中，确保数据已就绪
 * @param {string} variableId
 * @param {string} chatId
 * @returns {VariableValueV2|null}
 */
export function ensureCacheLoaded(variableId, chatId) {
    // 先尝试从缓存读取
    if (cachedValues[chatId] && cachedValues[chatId][variableId]) {
        return cachedValues[chatId][variableId];
    }

    // 缓存未加载，触发异步加载（虽然会等待，但这是同步调用的兜底方案）
    // 注意：这在宏处理器中是阻塞的，但在预加载完成后通常不会执行到这里
    loadValuesV2(chatId).catch(() => { /* 静默处理加载失败 */ });
    return null;
}

/**
 * 设置 V2 变量值
 * @async
 * @param {string} variableId
 * @param {string} chatId
 * @param {VariableValueV2} value
 */
export async function setValueV2(variableId, chatId, value) {
    const values = await loadValuesV2(chatId);
    values[variableId] = value;
    saveValuesV2Debounced(chatId);
}

/**
 * 删除 V2 变量的所有值
 * @async
 * @param {string} variableId
 */
export async function deleteVariableValuesV2(variableId) {
    for (const chatId of Object.keys(cachedValues)) {
        if (cachedValues[chatId][variableId]) {
            delete cachedValues[chatId][variableId];
            saveValuesV2Debounced(chatId);
        }
    }
    logger.debug('[VariableStorage] 已删除 V2 变量的所有值:', variableId);
}

// ============================================
// V2 工具函数
// ============================================

/**
 * 强制刷新 V2 缓存
 */
export function invalidateCacheV2() {
    cachedDataV2 = null;
    cachedValues = {};
    isDirtyV2 = false;
    dirtyValueFiles.clear();

    if (saveTimeoutV2) {
        clearTimeout(saveTimeoutV2);
        saveTimeoutV2 = null;
    }
    if (saveTimeoutValues) {
        clearTimeout(saveTimeoutValues);
        saveTimeoutValues = null;
    }
}

// ============================================
// V1 兼容函数（保留原有功能）
// ============================================

/**
 * 加载 V1 存储数据（兼容）
 * @async
 * @returns {Promise<VariableStorageDataV1>}
 */
export async function loadStorage() {
    if (cachedDataV1) {
        return cachedDataV1;
    }

    try {
        logger.debug('[VariableStorage] 尝试加载 V1 存储文件...');

        const response = await fetch(FILE_PATH_V1, {
            method: 'GET',
            headers: getRequestHeaders()
        });

        if (response.ok) {
            const text = await response.text();
            cachedDataV1 = JSON.parse(text);
            logger.info('[VariableStorage] V1 存储文件加载成功');
            return cachedDataV1;
        } else if (response.status === 404) {
            logger.info('[VariableStorage] V1 存储文件不存在，创建默认数据');
            cachedDataV1 = JSON.parse(JSON.stringify(DEFAULT_DATA_V1));
            await saveStorage();
            return cachedDataV1;
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        logger.error('[VariableStorage] V1 加载失败:', error.message);
        cachedDataV1 = JSON.parse(JSON.stringify(DEFAULT_DATA_V1));
        return cachedDataV1;
    }
}

/**
 * 保存 V1 存储数据（兼容）
 * @async
 * @returns {Promise<boolean>}
 */
export async function saveStorage() {
    if (!cachedDataV1) {
        logger.warn('[VariableStorage] V1 没有数据可保存');
        return false;
    }

    try {
        const jsonString = JSON.stringify(cachedDataV1, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: STORAGE_FILENAME_V1,
                data: base64Data
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        isDirtyV1 = false;
        logger.debug('[VariableStorage] V1 数据已保存');
        return true;
    } catch (error) {
        logger.error('[VariableStorage] V1 保存失败:', error.message);
        return false;
    }
}

/**
 * V1 延迟保存（兼容）
 */
export function saveStorageDebounced() {
    isDirtyV1 = true;

    if (saveTimeoutV1) {
        clearTimeout(saveTimeoutV1);
    }

    saveTimeoutV1 = setTimeout(async () => {
        saveTimeoutV1 = null;
        if (isDirtyV1) {
            await saveStorage();
        }
    }, 300);
}

// V1 变量定义操作（兼容）

/**
 * 获取所有 V1 变量定义（兼容）
 * @async
 * @returns {Promise<Array>}
 */
export async function getDefinitions() {
    const data = await loadStorage();
    return [...data.definitions];
}

/**
 * 保存 V1 变量定义（兼容）
 * @async
 * @param {Array} definitions
 */
export async function saveDefinitions(definitions) {
    const data = await loadStorage();
    data.definitions = definitions;
    saveStorageDebounced();
}

// V1 设置操作（兼容）

/**
 * 获取 V1 设置（兼容）
 * @async
 * @returns {Promise<Object>}
 */
export async function getSettings() {
    const data = await loadStorage();
    return { ...data.settings };
}

/**
 * 保存 V1 设置（兼容）
 * @async
 * @param {Object} settings
 */
export async function saveSettings(settings) {
    const data = await loadStorage();
    data.settings = settings;
    saveStorageDebounced();
}

// V1 变量值操作（兼容）

/**
 * 获取 V1 变量值（兼容）
 * @async
 * @param {string} variableId
 * @param {string} chatId
 * @returns {Promise<Object|null>}
 */
export async function getValue(variableId, chatId) {
    const data = await loadStorage();
    return data.values[chatId]?.[variableId] || null;
}

/**
 * 设置 V1 变量值（兼容）
 * @async
 * @param {string} variableId
 * @param {string} chatId
 * @param {Object} value
 */
export async function setValue(variableId, chatId, value) {
    const data = await loadStorage();
    if (!data.values[chatId]) {
        data.values[chatId] = {};
    }
    data.values[chatId][variableId] = value;
    saveStorageDebounced();
}

/**
 * 获取聊天的所有 V1 变量值（兼容）
 * @async
 * @param {string} chatId
 * @returns {Promise<Object>}
 */
export async function getChatValues(chatId) {
    const data = await loadStorage();
    return data.values[chatId] || {};
}

/**
 * 删除 V1 变量的所有值（兼容）
 * @async
 * @param {string} variableId
 */
export async function deleteVariableValues(variableId) {
    const data = await loadStorage();
    for (const chatId of Object.keys(data.values)) {
        if (data.values[chatId][variableId]) {
            delete data.values[chatId][variableId];
        }
    }
    saveStorageDebounced();
    logger.debug('[VariableStorage] 已删除 V1 变量的所有值:', variableId);
}

/**
 * 清理空的聊天记录（兼容）
 * @async
 */
export async function cleanupEmptyChats() {
    const data = await loadStorage();
    for (const chatId of Object.keys(data.values)) {
        if (Object.keys(data.values[chatId]).length === 0) {
            delete data.values[chatId];
        }
    }
    saveStorageDebounced();
}

/**
 * 强制刷新 V1 缓存（兼容）
 */
export function invalidateCache() {
    cachedDataV1 = null;
    isDirtyV1 = false;
    if (saveTimeoutV1) {
        clearTimeout(saveTimeoutV1);
        saveTimeoutV1 = null;
    }
}

/**
 * 获取 V1 存储文件路径（兼容）
 * @returns {string}
 */
export function getStorageFilePath() {
    return FILE_PATH_V1;
}

// ============================================
// 导出
// ============================================

export default {
    // V2 函数
    loadStorageV2,
    saveStorageV2,
    saveStorageV2Debounced,
    getSuitesV2,
    saveSuitesV2,
    getDefinitionsV2,
    saveDefinitionsV2,
    getSettingsV2,
    saveSettingsV2,
    loadValuesV2,
    saveValuesV2,
    saveValuesV2Debounced,
    getValueV2,
    setValueV2,
    deleteVariableValuesV2,
    invalidateCacheV2,
    // V1 兼容函数
    loadStorage,
    saveStorage,
    saveStorageDebounced,
    getDefinitions,
    saveDefinitions,
    getSettings,
    saveSettings,
    getValue,
    setValue,
    getChatValues,
    deleteVariableValues,
    cleanupEmptyChats,
    invalidateCache,
    getStorageFilePath
};
