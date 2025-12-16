/**
 * 预设快照数据层 - 管理预设条目开关状态的保存和恢复
 *
 * @module preset-snapshot-data
 * @description
 * 提供预设快照的核心数据操作：
 * - 保存当前预设条目的开关状态（按预设隔离）
 * - 加载和验证已保存的快照
 * - 应用快照到当前预设
 * - 重命名和删除快照
 *
 * 数据存储在 extension_settings['Acsus-Paws-Puffs'].presetSnapshot
 *
 * 数据结构 v2（按预设隔离）：
 * {
 *   enabled: boolean,
 *   presets: {
 *     [presetName]: {
 *       snapshots: Snapshot[],
 *       lastApplied: string | null
 *     }
 *   }
 * }
 */

import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource } from '../../../../script.js';
import { promptManager, oai_settings } from '../../../openai.js';
import logger from './logger.js';

// ========================================
// 常量定义
// ========================================

const EXT_ID = 'Acsus-Paws-Puffs';
const STORAGE_KEY = 'presetSnapshot';

/**
 * 默认存储结构 v2
 * @type {PresetSnapshotStorageV2}
 */
const DEFAULT_STORAGE = {
    enabled: false,
    presets: {}  // { presetName: { snapshots: [], lastApplied: null } }
};

// ========================================
// 类型定义（JSDoc）
// ========================================

/**
 * @typedef {Object} PromptState
 * @property {string} identifier - 条目的唯一标识符
 * @property {boolean} enabled - 开关状态
 */

/**
 * @typedef {Object} Snapshot
 * @property {string} id - UUID，唯一标识
 * @property {string} name - 用户命名
 * @property {number} createdAt - 创建时间戳（毫秒）
 * @property {PromptState[]} states - 条目状态列表
 */

/**
 * @typedef {Object} SnapshotListItem
 * @property {string} id - UUID
 * @property {string} name - 用户命名
 * @property {number} createdAt - 创建时间戳
 * @property {number} stateCount - 条目数量
 */

/**
 * @typedef {Object} PresetData
 * @property {Snapshot[]} snapshots - 该预设下的快照列表
 * @property {string|null} lastApplied - 该预设下上次应用的快照ID
 */

/**
 * @typedef {Object} PresetSnapshotStorageV2
 * @property {boolean} enabled - 功能开关
 * @property {Object.<string, PresetData>} presets - 按预设名隔离的快照数据
 */

// ========================================
// 内部辅助函数
// ========================================

/**
 * 生成 UUID v4
 * @returns {string} UUID 字符串
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 获取存储对象（确保结构完整，支持 v1 到 v2 迁移）
 * @returns {PresetSnapshotStorageV2} 存储对象
 */
function getStorage() {
    extension_settings[EXT_ID] = extension_settings[EXT_ID] || {};

    if (!extension_settings[EXT_ID][STORAGE_KEY]) {
        extension_settings[EXT_ID][STORAGE_KEY] = { ...DEFAULT_STORAGE };
    }

    const storage = extension_settings[EXT_ID][STORAGE_KEY];

    // 确保所有字段存在
    if (storage.enabled === undefined) storage.enabled = false;

    // v1 到 v2 迁移：如果存在旧的 snapshots 数组，迁移到 presets 结构
    if (Array.isArray(storage.snapshots) && storage.snapshots.length > 0) {
        logger.info('[PresetSnapshot] 检测到 v1 数据结构，开始迁移...');
        const currentPreset = getCurrentPresetName();
        storage.presets = storage.presets || {};
        storage.presets[currentPreset] = {
            snapshots: storage.snapshots,
            lastApplied: storage.lastApplied || null
        };
        delete storage.snapshots;
        delete storage.lastApplied;
        saveSettingsDebounced();
        logger.info('[PresetSnapshot] 数据迁移完成，已迁移到预设:', currentPreset);
    }

    // 确保 presets 对象存在
    if (!storage.presets || typeof storage.presets !== 'object') {
        storage.presets = {};
    }

    return storage;
}

/**
 * 获取当前预设名称
 * @returns {string} 预设名称
 */
export function getCurrentPresetName() {
    try {
        // 从 oai_settings 获取当前预设名称
        if (oai_settings && oai_settings.preset_settings_openai) {
            return oai_settings.preset_settings_openai;
        }
        // 备用：从 DOM 获取
        const presetSelect = document.querySelector('#settings_preset_openai');
        if (presetSelect) {
            const selectedOption = presetSelect.querySelector('option:checked');
            if (selectedOption) {
                return selectedOption.textContent || selectedOption.value || 'default';
            }
        }
        return 'default';
    } catch (error) {
        logger.warn('[PresetSnapshot] 获取预设名称失败:', error.message);
        return 'default';
    }
}

/**
 * 获取指定预设的数据（确保结构完整）
 * @param {string} presetName - 预设名称
 * @returns {PresetData} 预设数据
 */
function getPresetData(presetName) {
    const storage = getStorage();

    if (!storage.presets[presetName]) {
        storage.presets[presetName] = {
            snapshots: [],
            lastApplied: null
        };
    }

    const presetData = storage.presets[presetName];

    // 确保字段完整
    if (!Array.isArray(presetData.snapshots)) presetData.snapshots = [];
    if (presetData.lastApplied === undefined) presetData.lastApplied = null;

    return presetData;
}

/**
 * 获取所有有快照的预设名称列表
 * @returns {string[]} 预设名称列表
 */
export function getPresetsWithSnapshots() {
    const storage = getStorage();
    return Object.keys(storage.presets).filter(name => {
        const data = storage.presets[name];
        return data && Array.isArray(data.snapshots) && data.snapshots.length > 0;
    });
}

/**
 * 删除指定预设的所有快照
 * @param {string} presetName - 预设名称
 * @returns {number} 删除的快照数量
 */
export function deletePresetSnapshots(presetName) {
    const storage = getStorage();

    if (!storage.presets[presetName]) {
        return 0;
    }

    const count = storage.presets[presetName].snapshots?.length || 0;
    delete storage.presets[presetName];
    saveSettingsDebounced();

    logger.info('[PresetSnapshot] 已删除预设的所有快照:', presetName, '共', count, '个');
    return count;
}

/**
 * 验证快照数据结构是否有效
 * @param {any} snapshot - 待验证的快照对象
 * @returns {boolean} 是否有效
 */
function isValidSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (typeof snapshot.id !== 'string' || !snapshot.id) return false;
    if (typeof snapshot.name !== 'string') return false;
    if (typeof snapshot.createdAt !== 'number') return false;
    if (!Array.isArray(snapshot.states)) return false;

    // 验证每个状态条目
    for (const state of snapshot.states) {
        if (!state || typeof state !== 'object') return false;
        if (typeof state.identifier !== 'string' || !state.identifier) return false;
        if (typeof state.enabled !== 'boolean') return false;
    }

    return true;
}

/**
 * 获取当前预设的 prompt_order
 * @returns {Array<{identifier: string, enabled: boolean}>} 条目列表
 */
function getCurrentPromptOrder() {
    try {
        // promptManager 使用 activeCharacter 来获取当前的 prompt_order
        if (!promptManager || !promptManager.activeCharacter) {
            logger.warn('[PresetSnapshot] promptManager 或 activeCharacter 不存在');
            return [];
        }

        const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);
        return promptOrder || [];
    } catch (error) {
        logger.error('[PresetSnapshot] 获取 prompt_order 失败:', error.message);
        return [];
    }
}

// ========================================
// 公开 API
// ========================================

/**
 * 检查功能是否启用
 * @returns {boolean} 是否启用
 */
export function isEnabled() {
    return getStorage().enabled;
}

/**
 * 设置功能启用状态
 * @param {boolean} enabled - 是否启用
 */
export function setEnabled(enabled) {
    const storage = getStorage();
    storage.enabled = !!enabled;
    saveSettingsDebounced();
    logger.info('[PresetSnapshot] 功能状态已更新:', enabled ? '启用' : '禁用');
}


/**
 * 加载指定预设的快照（验证数据结构，跳过损坏条目）
 * @param {string} [presetName] - 预设名称，默认当前预设
 * @returns {Snapshot[]} 有效的快照列表
 */
export function loadSnapshots(presetName) {
    const targetPreset = presetName || getCurrentPresetName();
    const presetData = getPresetData(targetPreset);
    const validSnapshots = [];

    for (const snapshot of presetData.snapshots) {
        if (isValidSnapshot(snapshot)) {
            validSnapshots.push(snapshot);
        } else {
            logger.warn('[PresetSnapshot] 跳过损坏的快照条目:', snapshot?.id || 'unknown');
        }
    }

    // 如果有损坏条目，更新存储
    if (validSnapshots.length !== presetData.snapshots.length) {
        presetData.snapshots = validSnapshots;
        saveSettingsDebounced();
        logger.info('[PresetSnapshot] 已清理损坏的快照条目');
    }

    return validSnapshots;
}

/**
 * 获取快照列表（用于 UI 显示）
 * @param {string} [presetName] - 预设名称，默认当前预设
 * @returns {SnapshotListItem[]} 快照列表项
 */
export function getSnapshotList(presetName) {
    const snapshots = loadSnapshots(presetName);

    return snapshots.map(snapshot => ({
        id: snapshot.id,
        name: snapshot.name,
        createdAt: snapshot.createdAt,
        stateCount: snapshot.states.length
    }));
}

/**
 * 保存当前预设状态为快照
 * @param {string} name - 快照名称
 * @returns {string} 新快照的 UUID
 */
export function saveSnapshot(name) {
    const currentPreset = getCurrentPresetName();
    const presetData = getPresetData(currentPreset);
    const promptOrder = getCurrentPromptOrder();

    // 提取所有条目的 identifier 和 enabled 状态
    const states = promptOrder.map(entry => ({
        identifier: entry.identifier,
        enabled: !!entry.enabled
    }));

    // 创建新快照
    const snapshot = {
        id: generateUUID(),
        name: name || `快照 ${new Date().toLocaleString('zh-CN')}`,
        createdAt: Date.now(),
        states: states
    };

    presetData.snapshots.push(snapshot);
    saveSettingsDebounced();

    logger.info('[PresetSnapshot] 已保存快照:', snapshot.name, '包含', states.length, '个条目', '预设:', currentPreset);

    // 触发事件通知 UI 刷新
    eventSource.emit('pawsSnapshotSaved', { presetName: currentPreset, snapshot });

    return snapshot.id;
}

/**
 * 应用快照到当前预设
 * @param {string} id - 快照 UUID
 * @returns {boolean} 是否成功
 */
export function applySnapshot(id) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);
    const snapshot = presetData.snapshots.find(s => s.id === id);

    if (!snapshot) {
        logger.warn('[PresetSnapshot] 未找到快照:', id);
        return false;
    }

    const promptOrder = getCurrentPromptOrder();

    if (promptOrder.length === 0) {
        logger.warn('[PresetSnapshot] 当前 prompt_order 为空，无法应用快照');
        return false;
    }

    // 创建 identifier -> enabled 的映射
    const stateMap = new Map(snapshot.states.map(s => [s.identifier, s.enabled]));

    let appliedCount = 0;
    let skippedCount = 0;

    // 遍历当前 prompt_order，按 identifier 匹配并更新
    for (const entry of promptOrder) {
        if (stateMap.has(entry.identifier)) {
            entry.enabled = stateMap.get(entry.identifier);
            appliedCount++;
        }
        // 不在快照中的条目保持原状态
    }

    // 统计快照中有但当前不存在的条目
    for (const state of snapshot.states) {
        const exists = promptOrder.some(e => e.identifier === state.identifier);
        if (!exists) {
            skippedCount++;
        }
    }

    // 更新该预设下上次应用的快照
    presetData.lastApplied = id;

    // 保存设置并刷新 UI
    saveSettingsDebounced();

    // 触发 promptManager 重新渲染
    if (promptManager && typeof promptManager.render === 'function') {
        promptManager.render(false);
    }

    logger.info('[PresetSnapshot] 已应用快照:', snapshot.name,
        '- 应用:', appliedCount, '个, 跳过:', skippedCount, '个');

    return true;
}

/**
 * 重命名快照（在当前预设下查找）
 * @param {string} id - 快照 UUID
 * @param {string} newName - 新名称
 * @returns {boolean} 是否成功
 */
export function renameSnapshot(id, newName) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);
    const snapshot = presetData.snapshots.find(s => s.id === id);

    if (!snapshot) {
        logger.warn('[PresetSnapshot] 未找到快照:', id);
        return false;
    }

    const oldName = snapshot.name;
    snapshot.name = newName || snapshot.name;
    saveSettingsDebounced();

    logger.info('[PresetSnapshot] 已重命名快照:', oldName, '->', snapshot.name);
    return true;
}

/**
 * 删除快照（在当前预设下查找）
 * @param {string} id - 快照 UUID
 * @returns {boolean} 是否成功
 */
export function deleteSnapshot(id) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);
    const index = presetData.snapshots.findIndex(s => s.id === id);

    if (index === -1) {
        logger.warn('[PresetSnapshot] 未找到快照:', id);
        return false;
    }

    const deleted = presetData.snapshots.splice(index, 1)[0];

    // 如果删除的是上次应用的快照，清除记录
    if (presetData.lastApplied === id) {
        presetData.lastApplied = null;
    }

    saveSettingsDebounced();

    logger.info('[PresetSnapshot] 已删除快照:', deleted.name);
    return true;
}

/**
 * 根据 ID 获取快照
 * @param {string} id - 快照 UUID
 * @returns {Snapshot|null} 快照对象或 null
 */
export function getSnapshotById(id) {
    const snapshots = loadSnapshots();
    return snapshots.find(s => s.id === id) || null;
}

/**
 * 获取当前预设下上次应用的快照 ID
 * @returns {string|null} 快照 ID 或 null
 */
export function getLastAppliedId() {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);
    return presetData.lastApplied;
}

/**
 * 获取弹窗菜单样式设置
 * @returns {{menuScale: number, fontScale: number}} 样式设置
 */
export function getMenuSettings() {
    const storage = getStorage();
    return {
        menuScale: storage.menuScale || 1,
        fontScale: storage.fontScale || 1
    };
}

/**
 * 设置弹窗菜单样式
 * @param {{menuScale?: number, fontScale?: number}} settings - 样式设置
 */
export function setMenuSettings(settings) {
    const storage = getStorage();
    if (settings.menuScale !== undefined) {
        storage.menuScale = settings.menuScale;
    }
    if (settings.fontScale !== undefined) {
        storage.fontScale = settings.fontScale;
    }
    saveSettingsDebounced();
    logger.debug('[PresetSnapshot] 菜单样式已更新:', settings);
}
