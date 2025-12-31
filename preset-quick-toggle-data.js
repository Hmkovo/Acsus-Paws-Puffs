/**
 * 快速开关数据层 - 管理单个预设条目或世界书条目的快捷开关
 *
 * @module preset-quick-toggle-data
 * @description
 * 提供快速开关的核心数据操作：
 * - 添加/删除快速开关条目（按预设隔离）
 * - 支持预设条目和世界书条目两种类型
 * - 获取当前预设的快速开关列表
 * - 切换条目开关状态
 *
 * 数据存储在 extension_settings['Acsus-Paws-Puffs'].quickToggles
 */

import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { promptManager, oai_settings } from '../../../openai.js';
import logger from './logger.js';

// ========================================
// 常量定义
// ========================================

const EXT_ID = 'Acsus-Paws-Puffs';
const STORAGE_KEY = 'quickToggles';

/**
 * 默认存储结构
 */
const DEFAULT_STORAGE = {
    presets: {}  // { presetName: { items: [] } }
};

// ========================================
// 类型定义（JSDoc）
// ========================================

/**
 * 快速开关条目
 * @typedef {Object} QuickToggleItem
 * @property {'preset'|'worldinfo'} [type='preset'] - 条目类型，默认为preset
 * @property {string} identifier - 预设条目的identifier（type='preset'时）
 * @property {string} [worldName] - 世界书名称（type='worldinfo'时）
 * @property {number} [uid] - 世界书条目uid（type='worldinfo'时）
 * @property {string} name - 条目原始名称（世界书条目格式：世界书名:条目名）
 * @property {string} [displayAlias] - 悬浮菜单中显示的别名（可选，不设置则只显示条目名）
 */

/**
 * @typedef {Object} PresetQuickToggles
 * @property {QuickToggleItem[]} items - 该预设下的快速开关列表
 */

// ========================================
// 内部辅助函数
// ========================================

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
        if (oai_settings && oai_settings.preset_settings_openai) {
            return oai_settings.preset_settings_openai;
        }
        const presetSelect = document.querySelector('#settings_preset_openai');
        if (presetSelect) {
            const selectedOption = presetSelect.querySelector('option:checked');
            if (selectedOption) {
                return selectedOption.textContent || selectedOption.value || 'default';
            }
        }
        return 'default';
    } catch (error) {
        logger.warn('[QuickToggle] 获取预设名称失败:', error.message);
        return 'default';
    }
}

/**
 * 获取指定预设的数据（确保结构完整）
 * @param {string} presetName - 预设名称
 * @returns {PresetQuickToggles} 预设数据
 */
function getPresetData(presetName) {
    const storage = getStorage();

    if (!storage.presets[presetName]) {
        storage.presets[presetName] = { items: [] };
    }

    const presetData = storage.presets[presetName];
    if (!Array.isArray(presetData.items)) {
        presetData.items = [];
    }

    return presetData;
}

/**
 * 获取当前预设的 prompt_order
 * @returns {Array<{identifier: string, enabled: boolean}>} 条目列表
 */
function getCurrentPromptOrder() {
    try {
        if (!promptManager || !promptManager.activeCharacter) {
            logger.warn('[QuickToggle] promptManager 或 activeCharacter 不存在');
            return [];
        }
        const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);
        return promptOrder || [];
    } catch (error) {
        logger.error('[QuickToggle] 获取 prompt_order 失败:', error.message);
        return [];
    }
}

// ========================================
// 公开 API
// ========================================

/**
 * 获取当前预设的快速开关列表
 * @param {string} [presetName] - 预设名称，默认当前预设
 * @returns {QuickToggleItem[]} 快速开关列表
 */
export function getQuickToggles(presetName) {
    const targetPreset = presetName || getCurrentPresetName();
    const presetData = getPresetData(targetPreset);
    return presetData.items;
}

/**
 * 添加快速开关条目（预设条目）
 * @param {string} identifier - 条目标识符
 * @param {string} name - 条目名称
 * @returns {boolean} 是否成功
 */
export function addQuickToggle(identifier, name) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);

    // 检查是否已存在
    if (presetData.items.some(item => item.type !== 'worldinfo' && item.identifier === identifier)) {
        logger.warn('[QuickToggle] 条目已存在:', identifier);
        return false;
    }

    presetData.items.push({ type: 'preset', identifier, name });
    saveSettingsDebounced();

    logger.info('[QuickToggle] 已添加快速开关:', name, '预设:', presetName);
    return true;
}

/**
 * 添加世界书条目到快速开关
 * @param {string} worldName - 世界书名称
 * @param {number} uid - 条目uid
 * @param {string} name - 显示名称（格式：世界书名:条目名）
 * @param {string} [displayAlias] - 悬浮菜单中显示的别名（可选）
 * @returns {boolean} 是否成功
 */
export function addWorldInfoQuickToggle(worldName, uid, name, displayAlias) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);

    // 检查是否已存在
    if (presetData.items.some(item => item.type === 'worldinfo' && item.worldName === worldName && item.uid === uid)) {
        logger.warn('[QuickToggle] 世界书条目已存在:', worldName, uid);
        return false;
    }

    const item = { type: 'worldinfo', worldName, uid, name };
    // 只有设置了别名才添加 displayAlias 字段
    if (displayAlias && displayAlias.trim()) {
        item.displayAlias = displayAlias.trim();
    }
    presetData.items.push(item);
    saveSettingsDebounced();

    logger.info('[QuickToggle] 已添加世界书快速开关:', name, '预设:', presetName);
    return true;
}

/**
 * 批量设置快速开关（替换现有列表）
 * @param {QuickToggleItem[]} items - 新的快速开关列表
 */
export function setQuickToggles(items) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);

    presetData.items = items;
    saveSettingsDebounced();

    logger.info('[QuickToggle] 已更新快速开关列表，共', items.length, '项');
}

/**
 * 删除快速开关条目
 * @param {string} identifier - 条目标识符（预设条目）
 * @param {string} [worldName] - 世界书名称（世界书条目）
 * @param {number} [uid] - 世界书条目uid（世界书条目）
 * @returns {boolean} 是否成功
 */
export function removeQuickToggle(identifier, worldName, uid) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);

    let index;
    if (worldName !== undefined && uid !== undefined) {
        // 删除世界书条目
        index = presetData.items.findIndex(item => item.type === 'worldinfo' && item.worldName === worldName && item.uid === uid);
    } else {
        // 删除预设条目
        index = presetData.items.findIndex(item => item.type !== 'worldinfo' && item.identifier === identifier);
    }

    if (index === -1) {
        logger.warn('[QuickToggle] 未找到条目:', identifier || `${worldName}:${uid}`);
        return false;
    }

    const removed = presetData.items.splice(index, 1)[0];
    saveSettingsDebounced();

    logger.info('[QuickToggle] 已删除快速开关:', removed.name);
    return true;
}

/**
 * 获取条目当前的开关状态
 * @param {string} identifier - 条目标识符
 * @returns {boolean|null} 开关状态，找不到返回 null
 */
export function getToggleState(identifier) {
    const promptOrder = getCurrentPromptOrder();
    const entry = promptOrder.find(e => e.identifier === identifier);
    return entry ? !!entry.enabled : null;
}

/**
 * 切换条目开关状态
 *
 * @description
 * 支持预设条目和世界书条目两种类型。
 * 预设条目：在 prompt_order 中找到对应条目并反转其 enabled 状态。
 * 世界书条目：修改世界书条目的 disable 字段。
 *
 * @param {string} identifier - 条目标识符（预设条目）
 * @param {string} [worldName] - 世界书名称（世界书条目）
 * @param {number} [uid] - 世界书条目uid（世界书条目）
 * @returns {Promise<boolean|null>} 新的开关状态，找不到条目返回 null
 */
export async function toggleState(identifier, worldName, uid) {
    // 世界书条目
    if (worldName !== undefined && uid !== undefined) {
        return await toggleWorldInfoState(worldName, uid);
    }

    // 预设条目
    const promptOrder = getCurrentPromptOrder();
    const entry = promptOrder.find(e => e.identifier === identifier);

    if (!entry) {
        logger.warn('[QuickToggle] 未找到条目:', identifier);
        return null;
    }

    entry.enabled = !entry.enabled;
    saveSettingsDebounced();

    // 触发 promptManager 重新渲染
    if (promptManager && typeof promptManager.render === 'function') {
        promptManager.render(false);
    }

    logger.info('[QuickToggle] 已切换:', identifier, '→', entry.enabled ? '开' : '关');
    return entry.enabled;
}

/**
 * 切换世界书条目开关状态（内部函数）
 * @param {string} worldName - 世界书名称
 * @param {number} uid - 条目uid
 * @returns {Promise<boolean|null>} 新的开关状态
 */
async function toggleWorldInfoState(worldName, uid) {
    try {
        const { loadWorldInfo, saveWorldInfo, reloadEditor } = await import('../../../world-info.js');

        const worldData = await loadWorldInfo(worldName);
        if (!worldData || !worldData.entries) {
            logger.warn('[QuickToggle] 无法加载世界书:', worldName);
            return null;
        }

        const entry = worldData.entries[uid] || worldData.entries[String(uid)];
        if (!entry) {
            logger.warn('[QuickToggle] 世界书条目不存在:', worldName, 'uid:', uid);
            return null;
        }

        // 切换 disable 状态
        entry.disable = !entry.disable;
        await saveWorldInfo(worldName, worldData);

        // 刷新世界书编辑器UI
        reloadEditor(worldName);

        const newState = !entry.disable;  // disable=false 表示启用
        logger.info('[QuickToggle] 已切换世界书条目:', entry.comment || worldName, 'uid:', uid, '→', newState ? '开' : '关');
        return newState;
    } catch (error) {
        logger.error('[QuickToggle] 切换世界书条目失败:', error.message);
        return null;
    }
}

/**
 * 获取当前预设的所有可用条目（用于添加弹窗）
 *
 * @description
 * 遍历当前 prompt_order，尝试通过 promptManager.getPromptById 获取条目名称。
 * 如果获取失败则使用 identifier 作为显示名称。
 * 主要用于"添加快速开关"弹窗中显示可选条目列表。
 *
 * @returns {Array<{identifier: string, name: string, enabled: boolean}>} 条目列表
 * @example
 * const prompts = getAvailablePrompts();
 * // [{ identifier: 'main_prompt', name: '主提示词', enabled: true }, ...]
 */
export function getAvailablePrompts() {
    const promptOrder = getCurrentPromptOrder();

    return promptOrder.map(entry => {
        // 尝试获取条目名称
        let name = entry.identifier;
        try {
            const prompt = promptManager.getPromptById(entry.identifier);
            if (prompt && prompt.name) {
                name = prompt.name;
            }
        } catch (e) {
            // 忽略错误，使用 identifier 作为名称
        }

        return {
            identifier: entry.identifier,
            name: name,
            enabled: !!entry.enabled
        };
    });
}

/**
 * 获取快速开关列表（带实时状态）
 *
 * @description
 * 将保存的快速开关列表与当前状态合并。
 * 预设条目：从 prompt_order 获取状态。
 * 世界书条目：返回保存的条目信息（状态需要异步获取，这里标记为需要检查）。
 * 不存在的预设条目会被自动过滤掉。
 *
 * @param {string} [presetName] - 预设名称，默认当前预设
 * @returns {Array<{type: string, identifier?: string, worldName?: string, uid?: number, name: string, displayAlias?: string, enabled: boolean}>} 带状态的列表
 * @example
 * const toggles = getQuickTogglesWithState();
 * // 预设条目: { type: 'preset', identifier: 'main_prompt', name: '主提示词', enabled: true }
 * // 世界书条目: { type: 'worldinfo', worldName: '设定集', uid: 123, name: '设定集:角色设定', displayAlias: '角色设定', enabled: true }
 */
export function getQuickTogglesWithState(presetName) {
    const items = getQuickToggles(presetName);
    const promptOrder = getCurrentPromptOrder();

    return items.map(item => {
        if (item.type === 'worldinfo') {
            // 世界书条目：返回基本信息，enabled 状态需要异步获取
            return {
                type: 'worldinfo',
                worldName: item.worldName,
                uid: item.uid,
                name: item.name,
                displayAlias: item.displayAlias || '',  // 传递别名
                enabled: true  // 默认显示为开启，实际状态需要用 getWorldInfoStateAsync 获取
            };
        } else {
            // 预设条目
            const entry = promptOrder.find(e => e.identifier === item.identifier);
            if (!entry) {
                return null;  // 条目不存在，过滤掉
            }
            return {
                type: 'preset',
                identifier: item.identifier,
                name: item.name,
                enabled: !!entry.enabled
            };
        }
    }).filter(item => item !== null);
}

/**
 * 异步获取世界书条目的真实启用状态
 *
 * @description
 * 从世界书数据中读取条目的 disable 字段，返回真实的启用状态。
 * 因为需要调用 loadWorldInfo() 加载世界书数据，所以是异步函数。
 *
 * @param {string} worldName - 世界书名称
 * @param {number} uid - 条目uid
 * @returns {Promise<boolean>} 是否启用（true=启用，false=禁用）
 */
export async function getWorldInfoStateAsync(worldName, uid) {
    try {
        const { loadWorldInfo } = await import('../../../world-info.js');
        const worldData = await loadWorldInfo(worldName);

        if (!worldData || !worldData.entries) {
            logger.warn('[QuickToggle] 无法加载世界书:', worldName);
            return true;  // 加载失败时默认显示为启用
        }

        const entry = worldData.entries[uid] || worldData.entries[String(uid)];
        if (!entry) {
            logger.warn('[QuickToggle] 世界书条目不存在:', worldName, 'uid:', uid);
            return true;  // 条目不存在时默认显示为启用
        }

        // disable=false 表示启用，disable=true 表示禁用
        return !entry.disable;
    } catch (error) {
        logger.error('[QuickToggle] 获取世界书条目状态失败:', error.message);
        return true;  // 出错时默认显示为启用
    }
}

/**
 * 更新世界书条目的别名
 * @param {string} worldName - 世界书名称
 * @param {number} uid - 条目uid
 * @param {string} displayAlias - 新的别名（空字符串表示清除别名）
 * @returns {boolean} 是否成功
 */
export function updateWorldInfoAlias(worldName, uid, displayAlias) {
    const presetName = getCurrentPresetName();
    const presetData = getPresetData(presetName);

    const item = presetData.items.find(
        i => i.type === 'worldinfo' && i.worldName === worldName && i.uid === uid
    );

    if (!item) {
        logger.warn('[QuickToggle] 未找到世界书条目:', worldName, uid);
        return false;
    }

    if (displayAlias && displayAlias.trim()) {
        item.displayAlias = displayAlias.trim();
    } else {
        // 清除别名
        delete item.displayAlias;
    }

    saveSettingsDebounced();
    logger.info('[QuickToggle] 已更新世界书条目别名:', worldName, uid, '→', displayAlias || '(无)');
    return true;
}
