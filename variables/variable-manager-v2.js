/**
 * V2 变量管理器 (Variable Manager V2)
 *
 * @description
 * 管理 V2 变量定义和值，支持：
 * - tag（AI 输出标签）和 mode（叠加/覆盖模式）
 * - 叠加模式：条目管理（添加、编辑、删除、隐藏）
 * - 覆盖模式：历史导航和版本切换
 */

import logger from '../logger.js';
import * as storage from './variable-storage.js';
import { registerVariableMacro, unregisterVariableMacro } from './global-macro-registry.js';

// ============================================
// 类型导入（仅用于 JSDoc）
// ============================================

/**
 * @typedef {import('./variable-types.js').VariableDefinitionV2} VariableDefinitionV2
 * @typedef {import('./variable-types.js').VariableEntry} VariableEntry
 * @typedef {import('./variable-types.js').StackVariableValue} StackVariableValue
 * @typedef {import('./variable-types.js').ReplaceVariableValue} ReplaceVariableValue
 * @typedef {import('./variable-types.js').VariableValueV2} VariableValueV2
 */

// ============================================
// VariableManagerV2 类
// ============================================

/**
 * V2 变量管理器类
 */
export class VariableManagerV2 {
    constructor() {
        /** @type {Object<string, VariableDefinitionV2>} */
        this.variables = {};
        /** @type {boolean} */
        this.initialized = false;
    }

    /**
     * 初始化
     * @async
     */
    async init() {
        if (this.initialized) {
            logger.debug('[VariableManagerV2] 已初始化，跳过');
            return;
        }

        logger.info('[VariableManagerV2] 开始初始化...');
        this.variables = await storage.getDefinitionsV2();
        this.initialized = true;
        logger.info('[VariableManagerV2] 初始化完成，已加载', Object.keys(this.variables).length, '个变量');
    }

    // ========================================
    // 变量定义 CRUD
    // ========================================

    /**
     * 获取所有变量定义
     * @returns {VariableDefinitionV2[]}
     */
    getDefinitions() {
        return Object.values(this.variables);
    }

    /**
     * 根据 ID 获取变量定义
     * @param {string} id
     * @returns {VariableDefinitionV2|null}
     */
    getDefinition(id) {
        return this.variables[id] || null;
    }

    /**
     * 根据名称获取变量定义
     * @param {string} name
     * @returns {VariableDefinitionV2|null}
     */
    getDefinitionByName(name) {
        return Object.values(this.variables).find(v => v.name === name) || null;
    }

    /**
     * 根据标签获取变量定义
     * @param {string} tag
     * @returns {VariableDefinitionV2|null}
     */
    getDefinitionByTag(tag) {
        return Object.values(this.variables).find(v => v.tag === tag) || null;
    }

    /**
     * 验证变量名
     * @param {string} name
     * @returns {{valid: boolean, error?: string}}
     */
    validateName(name) {
        if (!name || name.trim() === '') {
            return { valid: false, error: '变量名不能为空' };
        }
        // 只允许字母、数字、中文
        const pattern = /^[a-zA-Z0-9\u4e00-\u9fa5]+$/;
        if (!pattern.test(name)) {
            return { valid: false, error: '变量名只能包含字母、数字和中文' };
        }
        return { valid: true };
    }

    /**
     * 验证标签格式
     * @param {string} tag
     * @returns {{valid: boolean, error?: string}}
     */
    validateTag(tag) {
        if (!tag || tag.trim() === '') {
            return { valid: false, error: '标签不能为空' };
        }
        // 标签格式：[xxx] 或自定义
        return { valid: true };
    }

    /**
     * 检查变量名是否重复
     * @param {string} name
     * @param {string} [excludeId]
     * @returns {boolean}
     */
    isNameDuplicate(name, excludeId) {
        return Object.values(this.variables).some(v => v.name === name && v.id !== excludeId);
    }

    /**
     * 检查标签是否重复
     * @param {string} tag
     * @param {string} [excludeId]
     * @returns {boolean}
     */
    isTagDuplicate(tag, excludeId) {
        return Object.values(this.variables).some(v => v.tag === tag && v.id !== excludeId);
    }


    /**
     * 创建新变量
     * @async
     * @param {Object} data
     * @param {string} data.name - 变量名
     * @param {string} data.tag - AI 输出标签
     * @param {'stack' | 'replace'} data.mode - 模式
     * @returns {Promise<{success: boolean, variable?: VariableDefinitionV2, error?: string}>}
     */
    async createVariable(data) {
        // 验证名称
        const nameValidation = this.validateName(data.name);
        if (!nameValidation.valid) {
            return { success: false, error: nameValidation.error };
        }

        // 验证标签
        const tagValidation = this.validateTag(data.tag);
        if (!tagValidation.valid) {
            return { success: false, error: tagValidation.error };
        }

        // 检查重复
        if (this.isNameDuplicate(data.name)) {
            return { success: false, error: `变量名 "${data.name}" 已存在` };
        }
        if (this.isTagDuplicate(data.tag)) {
            return { success: false, error: `标签 "${data.tag}" 已被使用` };
        }

        // 验证模式
        if (!['stack', 'replace'].includes(data.mode)) {
            return { success: false, error: '模式必须是 stack 或 replace' };
        }

        const now = Date.now();
        const id = this._generateId();

        /** @type {VariableDefinitionV2} */
        const variable = {
            id,
            name: data.name.trim(),
            tag: data.tag.trim(),
            mode: data.mode,
            createdAt: now,
            updatedAt: now
        };

        this.variables[id] = variable;
        await this._save();

        // 同步注册全局宏
        registerVariableMacro(variable.name);

        logger.info('[VariableManagerV2] 创建变量:', variable.name, '模式:', variable.mode);

        return { success: true, variable };
    }

    /**
     * 更新变量定义（只能更新名称，tag 和 mode 创建后不可修改）
     * @async
     * @param {string} id
     * @param {Partial<VariableDefinitionV2>} updates
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updateVariable(id, updates) {
        const variable = this.variables[id];
        if (!variable) {
            return { success: false, error: '变量不存在' };
        }

        // 只允许更新名称
        if (updates.name !== undefined) {
            const validation = this.validateName(updates.name);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }
            if (this.isNameDuplicate(updates.name, id)) {
                return { success: false, error: `变量名 "${updates.name}" 已存在` };
            }
            variable.name = updates.name.trim();
        }

        variable.updatedAt = Date.now();
        await this._save();
        logger.info('[VariableManagerV2] 更新变量:', variable.name);

        return { success: true };
    }

    /**
     * 删除变量
     * @async
     * @param {string} id
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteVariable(id) {
        const variable = this.variables[id];
        if (!variable) {
            return { success: false, error: '变量不存在' };
        }

        const name = variable.name;
        delete this.variables[id];
        await this._save();

        // 删除变量值
        await storage.deleteVariableValuesV2(id);

        // 同步注销全局宏
        unregisterVariableMacro(name);

        logger.info('[VariableManagerV2] 删除变量:', name);
        return { success: true };
    }

    // ========================================
    // 叠加模式 - 条目管理
    // ========================================

    /**
     * 获取叠加模式的变量值
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @returns {Promise<StackVariableValue>}
     */
    async getStackValue(variableId, chatId) {
        const value = await storage.getValueV2(variableId, chatId);
        if (value && 'entries' in value) {
            return value;
        }
        // 返回默认值
        return { entries: [], nextEntryId: 1 };
    }

    /**
     * 添加条目（叠加模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {string} content
     * @param {string} floorRange - 楼层范围（如 "56-65" 或 "65"）
     * @returns {Promise<VariableEntry>}
     */
    async addEntry(variableId, chatId, content, floorRange) {
        const value = await this.getStackValue(variableId, chatId);

        /** @type {VariableEntry} */
        const entry = {
            id: value.nextEntryId,
            content,
            floorRange,
            timestamp: Date.now(),
            hidden: false
        };

        value.entries.push(entry);
        value.nextEntryId++;

        await storage.setValueV2(variableId, chatId, value);
        logger.debug('[VariableManagerV2] 添加条目:', variableId, '楼层范围:', floorRange);

        return entry;
    }

    /**
     * 更新条目内容（叠加模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {number} entryId
     * @param {string} content
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async updateEntry(variableId, chatId, entryId, content) {
        const value = await this.getStackValue(variableId, chatId);
        const entry = value.entries.find(e => e.id === entryId);

        if (!entry) {
            return { success: false, error: '条目不存在' };
        }

        entry.content = content;
        await storage.setValueV2(variableId, chatId, value);
        logger.debug('[VariableManagerV2] 更新条目:', variableId, 'entryId:', entryId);

        return { success: true };
    }

    /**
     * 删除条目（叠加模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {number} entryId
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteEntry(variableId, chatId, entryId) {
        const value = await this.getStackValue(variableId, chatId);
        const index = value.entries.findIndex(e => e.id === entryId);

        if (index === -1) {
            return { success: false, error: '条目不存在' };
        }

        value.entries.splice(index, 1);
        await storage.setValueV2(variableId, chatId, value);
        logger.debug('[VariableManagerV2] 删除条目:', variableId, 'entryId:', entryId);

        return { success: true };
    }

    /**
     * 切换条目可见性（叠加模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {number} entryId
     * @returns {Promise<{success: boolean, hidden?: boolean, error?: string}>}
     */
    async toggleEntryVisibility(variableId, chatId, entryId) {
        const value = await this.getStackValue(variableId, chatId);
        const entry = value.entries.find(e => e.id === entryId);

        if (!entry) {
            return { success: false, error: '条目不存在' };
        }

        entry.hidden = !entry.hidden;
        await storage.setValueV2(variableId, chatId, value);
        logger.debug('[VariableManagerV2] 切换条目可见性:', variableId, 'hidden:', entry.hidden);

        return { success: true, hidden: entry.hidden };
    }

    /**
     * 获取可见条目（叠加模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @returns {Promise<VariableEntry[]>}
     */
    async getVisibleEntries(variableId, chatId) {
        const value = await this.getStackValue(variableId, chatId);
        return value.entries.filter(e => !e.hidden);
    }

    /**
     * 重新排序条目（叠加模式）
     * 拖拽排序后调用，更新条目在数组中的顺序
     * 注意：条目的 id 不变，只是数组顺序变化
     *
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {number[]} newOrder - 新的条目 ID 顺序数组
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async reorderEntries(variableId, chatId, newOrder) {
        const value = await this.getStackValue(variableId, chatId);

        if (value.entries.length === 0) {
            return { success: false, error: '没有条目可排序' };
        }

        // 验证 newOrder 包含所有条目 ID
        const existingIds = new Set(value.entries.map(e => e.id));
        const newOrderSet = new Set(newOrder);

        if (existingIds.size !== newOrderSet.size) {
            return { success: false, error: '排序数组长度不匹配' };
        }

        for (const id of newOrder) {
            if (!existingIds.has(id)) {
                return { success: false, error: `条目 ID ${id} 不存在` };
            }
        }

        // 按新顺序重排数组
        const entryMap = new Map(value.entries.map(e => [e.id, e]));
        value.entries = newOrder.map(id => entryMap.get(id));

        await storage.setValueV2(variableId, chatId, value);
        logger.debug('[VariableManagerV2] 重排条目:', variableId, '新顺序:', newOrder);

        return { success: true };
    }


    // ========================================
    // 覆盖模式 - 值和历史管理
    // ========================================

    /**
     * 获取覆盖模式的变量值
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @returns {Promise<ReplaceVariableValue>}
     */
    async getReplaceValue(variableId, chatId) {
        const value = await storage.getValueV2(variableId, chatId);
        if (value && 'currentValue' in value) {
            return value;
        }
        // 返回默认值
        return {
            currentValue: '',
            currentFloor: 0,
            history: [],
            historyIndex: -1  // -1 表示当前值
        };
    }

    /**
     * 设置值（覆盖模式）- 会将旧值加入历史
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {string} content
     * @param {string} floorRange - 楼层范围（如 "56-65" 或 "65"）
     * @returns {Promise<void>}
     */
    async setValue(variableId, chatId, content, floorRange) {
        const value = await this.getReplaceValue(variableId, chatId);

        // 如果有当前值，先保存到历史
        if (value.currentValue) {
            /** @type {VariableEntry} */
            const historyEntry = {
                id: value.history.length + 1,
                content: value.currentValue,
                floorRange: value.currentFloorRange || String(value.currentFloor || 0),
                timestamp: Date.now(),
                hidden: false
            };
            value.history.push(historyEntry);
        }

        // 设置新值
        value.currentValue = content;
        value.currentFloorRange = floorRange;
        value.currentFloor = undefined; // 兼容旧字段，标记为已迁移
        value.historyIndex = -1;  // 重置为当前值

        await storage.setValueV2(variableId, chatId, value);
        logger.debug('[VariableManagerV2] 设置值:', variableId, '楼层范围:', floorRange);
    }

    /**
     * 导航历史（覆盖模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {'prev' | 'next'} direction
     * @returns {Promise<{success: boolean, index?: number, total?: number, error?: string}>}
     */
    async navigateHistory(variableId, chatId, direction) {
        const value = await this.getReplaceValue(variableId, chatId);
        const total = value.history.length + 1;  // 历史 + 当前值

        if (total <= 1) {
            return { success: false, error: '没有历史记录' };
        }

        let newIndex = value.historyIndex;

        if (direction === 'prev') {
            // 向前（更旧）
            if (newIndex === -1) {
                // 从当前值到最新历史
                newIndex = value.history.length - 1;
            } else if (newIndex > 0) {
                newIndex--;
            } else {
                return { success: false, error: '已是最早的记录' };
            }
        } else {
            // 向后（更新）
            if (newIndex === -1) {
                return { success: false, error: '已是最新的记录' };
            } else if (newIndex < value.history.length - 1) {
                newIndex++;
            } else {
                // 从最新历史到当前值
                newIndex = -1;
            }
        }

        value.historyIndex = newIndex;
        await storage.setValueV2(variableId, chatId, value);

        // 计算显示位置（1-based，当前值是最后一个）
        const displayIndex = newIndex === -1 ? total : newIndex + 1;

        return { success: true, index: displayIndex, total };
    }

    /**
     * 应用历史版本（覆盖模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @param {number} historyIndex
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async applyHistoryVersion(variableId, chatId, historyIndex) {
        const value = await this.getReplaceValue(variableId, chatId);

        if (historyIndex < 0 || historyIndex >= value.history.length) {
            return { success: false, error: '历史索引无效' };
        }

        const historyEntry = value.history[historyIndex];

        // 将当前值保存到历史
        if (value.currentValue) {
            /** @type {VariableEntry} */
            const currentAsHistory = {
                id: value.history.length + 1,
                content: value.currentValue,
                floor: value.currentFloor,
                timestamp: Date.now(),
                hidden: false
            };
            value.history.push(currentAsHistory);
        }

        // 应用历史版本
        value.currentValue = historyEntry.content;
        value.currentFloor = historyEntry.floor;
        value.historyIndex = -1;

        await storage.setValueV2(variableId, chatId, value);
        logger.info('[VariableManagerV2] 应用历史版本:', variableId, '索引:', historyIndex);

        return { success: true };
    }

    /**
     * 获取当前显示的值（覆盖模式）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @returns {Promise<{content: string, floorRange: string, isHistory: boolean}>}
     */
    async getCurrentDisplayValue(variableId, chatId) {
        const value = await this.getReplaceValue(variableId, chatId);

        if (value.historyIndex === -1) {
            // 兼容旧数据：如果有 currentFloor 但没有 currentFloorRange
            const floorRange = value.currentFloorRange || String(value.currentFloor || 0);
            return {
                content: value.currentValue,
                floorRange,
                isHistory: false
            };
        }

        const historyEntry = value.history[value.historyIndex];
        // 兼容旧数据
        const floorRange = historyEntry?.floorRange || String(historyEntry?.floor || 0);
        return {
            content: historyEntry?.content || '',
            floorRange,
            isHistory: true
        };
    }

    // ========================================
    // 通用方法
    // ========================================

    /**
     * 获取变量的当前值（用于宏替换）
     * @async
     * @param {string} variableId
     * @param {string} chatId
     * @returns {Promise<string>}
     */
    async getVariableValue(variableId, chatId) {
        const variable = this.variables[variableId];
        if (!variable) return '';

        if (variable.mode === 'stack') {
            const entries = await this.getVisibleEntries(variableId, chatId);
            return entries.map(e => e.content).join('\n\n');
        } else {
            const value = await this.getReplaceValue(variableId, chatId);
            return value.currentValue;
        }
    }

    /**
     * 根据变量名获取值（用于宏替换）
     * @async
     * @param {string} name
     * @param {string} chatId
     * @returns {Promise<string>}
     */
    async getValueByName(name, chatId) {
        const variable = this.getDefinitionByName(name);
        if (!variable) return '';
        return await this.getVariableValue(variable.id, chatId);
    }

    // ========================================
    // 工具方法
    // ========================================

    /**
     * 生成唯一 ID
     * @private
     * @returns {string}
     */
    _generateId() {
        return 'var_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    /**
     * 保存到存储
     * @private
     * @async
     */
    async _save() {
        await storage.saveDefinitionsV2(this.variables);
    }

    /**
     * 刷新数据
     * @async
     */
    async refresh() {
        storage.invalidateCacheV2();
        this.variables = await storage.getDefinitionsV2();
        logger.debug('[VariableManagerV2] 数据已刷新');
    }

    /**
     * 导出数据
     * @returns {Object<string, VariableDefinitionV2>}
     */
    exportData() {
        return { ...this.variables };
    }
}

// ============================================
// 导出单例
// ============================================

/** @type {VariableManagerV2|null} */
let instance = null;

/**
 * 获取 VariableManagerV2 单例
 * @returns {VariableManagerV2}
 */
export function getVariableManagerV2() {
    if (!instance) {
        instance = new VariableManagerV2();
    }
    return instance;
}

/**
 * 重置单例（用于测试）
 */
export function resetVariableManagerV2() {
    instance = null;
}

export default VariableManagerV2;
