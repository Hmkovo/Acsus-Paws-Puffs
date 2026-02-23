/**
 * 套装管理器 (Suite Manager)
 *
 * @description
 * 管理提示词套装的 CRUD 操作
 * - 套装包含条目列表（提示词条目 + 变量条目）
 * - 套装只管理触发方式，不管理提示词内容（提示词在条目列表中管理）
 * - 发送时按当前顺序拼接所有可见的提示词条目
 */

import logger from '../logger.js';

// ============================================
// 类型导入（仅用于 JSDoc）
// ============================================

/**
 * @typedef {import('./variable-types.js').PromptSuite} PromptSuite
 * @typedef {import('./variable-types.js').SuiteItem} SuiteItem
 * @typedef {import('./variable-types.js').PromptItem} PromptItem
 * @typedef {import('./variable-types.js').VariableItem} VariableItem
 * @typedef {import('./variable-types.js').ChatContentItem} ChatContentItem
 * @typedef {import('./variable-types.js').CharPromptItem} CharPromptItem
 * @typedef {import('./variable-types.js').TriggerConfig} TriggerConfig
 * @typedef {import('./variable-types.js').RangeConfig} RangeConfig
 * @typedef {import('./variable-types.js').RegexConfig} RegexConfig
 */

// ============================================
// SuiteManager 类
// ============================================

/**
 * 套装管理器类
 */
export class SuiteManager {
    /**
     * @param {Function} saveCallback - 保存回调函数
     */
    constructor(saveCallback) {
        /** @type {Object<string, PromptSuite>} */
        this.suites = {};
        /** @type {string|null} */
        this.activeSuiteId = null;
        /** @type {Function} */
        this._saveCallback = saveCallback;
    }

    /**
     * 从存储数据初始化
     * @param {Object<string, PromptSuite>} suites - 套装数据
     * @param {string|null} activeSuiteId - 当前激活的套装 ID
     */
    init(suites, activeSuiteId) {
        this.suites = suites || {};
        this.activeSuiteId = activeSuiteId;
        logger.info('variable', '[SuiteManager] 初始化完成，已加载', Object.keys(this.suites).length, '个套装');
    }

    // ========================================
    // 套装 CRUD
    // ========================================

    /**
     * 获取所有套装
     * @returns {PromptSuite[]}
     */
    getSuites() {
        return Object.values(this.suites);
    }

    /**
     * 根据 ID 获取套装
     * @param {string} id - 套装 ID
     * @returns {PromptSuite|null}
     */
    getSuite(id) {
        return this.suites[id] || null;
    }

    /**
     * 获取当前激活的套装
     * @returns {PromptSuite|null}
     */
    getActiveSuite() {
        if (!this.activeSuiteId) return null;
        return this.suites[this.activeSuiteId] || null;
    }

    /**
     * 设置当前激活的套装
     * @param {string} id - 套装 ID
     */
    setActiveSuite(id) {
        if (this.suites[id]) {
            this.activeSuiteId = id;
            this._save();
            logger.info('variable', '[SuiteManager] 切换到套装:', this.suites[id].name);
        }
    }

    /**
     * 创建新套装
     * @param {Partial<PromptSuite>} data - 套装数据
     * @returns {PromptSuite}
     */
    createSuite(data = {}) {
        const now = Date.now();
        const id = this._generateId();

        /** @type {PromptSuite} */
        const suite = {
            id,
            name: data.name || '新套装',
            enabled: data.enabled !== false,
            trigger: data.trigger || { type: 'manual' },
            items: data.items || [],
            createdAt: now,
            updatedAt: now
        };

        this.suites[id] = suite;

        // 如果是第一个套装，自动设为激活
        if (Object.keys(this.suites).length === 1) {
            this.activeSuiteId = id;
        }

        this._save();
        logger.info('variable', '[SuiteManager] 创建套装:', suite.name);
        return suite;
    }

    /**
     * 更新套装
     * @param {string} id - 套装 ID
     * @param {Partial<PromptSuite>} updates - 更新内容
     * @returns {boolean} 是否成功
     */
    updateSuite(id, updates) {
        const suite = this.suites[id];
        if (!suite) {
            logger.warn('variable', '[SuiteManager] 套装不存在:', id);
            return false;
        }

        // 不允许修改 id 和 createdAt
        const { id: _, createdAt: __, ...safeUpdates } = updates;

        Object.assign(suite, safeUpdates, { updatedAt: Date.now() });
        this._save();
        logger.info('variable', '[SuiteManager] 更新套装:', suite.name);
        return true;
    }

    /**
     * 删除套装
     * @param {string} id - 套装 ID
     * @returns {boolean} 是否成功
     */
    deleteSuite(id) {
        if (!this.suites[id]) {
            logger.warn('variable', '[SuiteManager] 套装不存在:', id);
            return false;
        }

        const name = this.suites[id].name;
        delete this.suites[id];

        // 如果删除的是当前激活的套装，切换到第一个
        if (this.activeSuiteId === id) {
            const remaining = Object.keys(this.suites);
            this.activeSuiteId = remaining.length > 0 ? remaining[0] : null;
        }

        this._save();
        logger.info('variable', '[SuiteManager] 删除套装:', name);
        return true;
    }

    // ========================================
    // 条目管理
    // ========================================

    /**
     * 添加提示词条目到套装
     * @param {string} suiteId - 套装 ID
     * @param {string} content - 提示词内容
     * @param {Object} [options] - 可选参数
     * @param {string} [options.name] - 提示词名称（用于显示）
     * @param {number} [options.index] - 插入位置（默认末尾）
     * @returns {PromptItem|null}
     */
    addPromptItem(suiteId, content, options = {}) {
        const suite = this.suites[suiteId];
        if (!suite) return null;

        const { name = '', index } = options;

        /** @type {PromptItem} */
        const item = {
            type: 'prompt',
            id: this._generateItemId(),
            name: name || '',
            content: content || '',
            enabled: true
        };

        if (index !== undefined && index >= 0 && index <= suite.items.length) {
            suite.items.splice(index, 0, item);
        } else {
            suite.items.push(item);
        }

        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 添加提示词条目到套装:', suite.name);
        return item;
    }

    /**
     * 添加变量条目到套装
     * @param {string} suiteId - 套装 ID
     * @param {string} variableId - 变量定义 ID
     * @param {number} [index] - 插入位置（默认末尾）
     * @returns {VariableItem|null}
     */
    addVariableItem(suiteId, variableId, index) {
        const suite = this.suites[suiteId];
        if (!suite) return null;

        // 检查是否已存在
        const exists = suite.items.some(
            item => item.type === 'variable' && item.id === variableId
        );
        if (exists) {
            logger.warn('variable', '[SuiteManager] 变量已在套装中:', variableId);
            return null;
        }

        /** @type {VariableItem} */
        const item = {
            type: 'variable',
            id: variableId,
            enabled: true
        };

        if (index !== undefined && index >= 0 && index <= suite.items.length) {
            suite.items.splice(index, 0, item);
        } else {
            suite.items.push(item);
        }

        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 添加变量条目到套装:', suite.name);
        return item;
    }

    /**
     * 移除条目
     * @param {string} suiteId - 套装 ID
     * @param {string} itemId - 条目 ID（提示词条目的 id、变量条目的 variableId、正文条目的 id 或角色条目的 id）
     * @returns {boolean}
     */
    removeItem(suiteId, itemId) {
        const suite = this.suites[suiteId];
        if (!suite) return false;

        const index = suite.items.findIndex(item => {
            if (item.type === 'prompt') return item.id === itemId;
            if (item.type === 'variable') return item.id === itemId;
            if (item.type === 'chat-content') return item.id === itemId;
            if (item.type === 'char-prompt') return item.id === itemId;
            return false;
        });

        if (index === -1) return false;

        suite.items.splice(index, 1);
        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 移除条目:', itemId);
        return true;
    }

    /**
     * 更新提示词条目
     * @param {string} suiteId - 套装 ID
     * @param {string} itemId - 条目 ID
     * @param {Partial<PromptItem>} updates - 更新内容
     * @returns {boolean}
     */
    updatePromptItem(suiteId, itemId, updates) {
        const suite = this.suites[suiteId];
        if (!suite) return false;

        const item = suite.items.find(
            i => i.type === 'prompt' && i.id === itemId
        );
        if (!item) return false;

        // 允许更新 name、content 和 enabled
        if (updates.name !== undefined) item.name = updates.name;
        if (updates.content !== undefined) item.content = updates.content;
        if (updates.enabled !== undefined) item.enabled = updates.enabled;

        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 更新提示词条目:', itemId, 'enabled:', item.enabled);
        return true;
    }

    /**
     * 更新变量条目
     * @param {string} suiteId - 套装 ID
     * @param {string} variableId - 变量 ID
     * @param {Partial<VariableItem>} updates - 更新内容
     * @returns {boolean}
     */
    updateVariableItem(suiteId, variableId, updates) {
        const suite = this.suites[suiteId];
        if (!suite) return false;

        const item = suite.items.find(
            i => i.type === 'variable' && i.id === variableId
        );
        if (!item) return false;

        // 只允许更新 enabled
        if (updates.enabled !== undefined) item.enabled = updates.enabled;

        suite.updatedAt = Date.now();
        this._save();
        return true;
    }

    /**
     * 添加正文条目到套装
     * @param {string} suiteId - 套装 ID
     * @param {Object} [options] - 可选参数
     * @param {string} [options.name] - 条目名称
     * @param {RangeConfig} [options.rangeConfig] - 范围配置
     * @param {boolean} [options.excludeUser] - 排除 User 楼层
     * @param {RegexConfig} [options.regexConfig] - 正则配置
     * @param {number} [options.index] - 插入位置（默认末尾）
     * @returns {ChatContentItem|null}
     */
    addChatContentItem(suiteId, options = {}) {
        const suite = this.suites[suiteId];
        if (!suite) return null;

        const { name = '', index, rangeConfig, excludeUser, regexConfig } = options;

        /** @type {ChatContentItem} */
        const item = {
            type: 'chat-content',
            id: this._generateItemId(),
            name: name || '',
            enabled: true,
            rangeConfig: rangeConfig || {
                type: 'latest',
                count: 20
            },
            excludeUser: excludeUser || false,
            regexConfig: regexConfig || {
                usePromptOnly: true,
                enabledScripts: [],
                disabledScripts: []
            }
        };

        if (index !== undefined && index >= 0 && index <= suite.items.length) {
            suite.items.splice(index, 0, item);
        } else {
            suite.items.push(item);
        }

        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 添加正文条目到套装:', suite.name);
        return item;
    }

    /**
     * 添加角色条目到套装
     * 每个角色每种固定类型（char-desc/personality/scenario）只允许一个，worldbook 允许多个
     * @param {string} suiteId - 套装 ID
     * @param {string} charId - 角色标识符（avatar 文件名）
     * @param {'char-desc'|'char-personality'|'char-scenario'|'worldbook'} subType - 子类型
     * @param {string} label - 显示标签
     * @param {number} [entryUid] - 世界书条目 UID（subType='worldbook' 时使用）
     * @returns {CharPromptItem|null}
     */
    addCharPromptItem(suiteId, charId, subType, label, entryUid) {
        const suite = this.suites[suiteId];
        if (!suite) return null;

        // 固定类型（非 worldbook）：每个角色只允许一个
        if (subType !== 'worldbook') {
            const exists = suite.items.some(
                item => item.type === 'char-prompt' && item.charId === charId && item.subType === subType
            );
            if (exists) {
                logger.warn('variable', '[SuiteManager] 角色条目已存在:', charId, subType);
                return null;
            }
        } else {
            // worldbook：同一条目 UID 只允许一个
            const exists = suite.items.some(
                item => item.type === 'char-prompt' && item.charId === charId
                    && item.subType === 'worldbook' && item.entryUid === entryUid
            );
            if (exists) {
                logger.warn('variable', '[SuiteManager] 世界书条目已存在:', charId, entryUid);
                return null;
            }
        }

        /** @type {CharPromptItem} */
        const item = {
            type: 'char-prompt',
            id: this._generateItemId(),
            charId,
            subType,
            label: label || `[${subType}]`,
            enabled: true,
            ...(entryUid !== undefined && { entryUid })
        };

        suite.items.push(item);
        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 添加角色条目:', charId, subType);
        return item;
    }

    /**
     * 更新角色条目
     * @param {string} suiteId - 套装 ID
     * @param {string} itemId - 条目 ID
     * @param {Partial<CharPromptItem>} updates - 更新内容
     * @returns {boolean}
     */
    updateCharPromptItem(suiteId, itemId, updates) {
        const suite = this.suites[suiteId];
        if (!suite) return false;

        const item = suite.items.find(
            i => i.type === 'char-prompt' && i.id === itemId
        );
        if (!item) return false;

        if (updates.enabled !== undefined) item.enabled = updates.enabled;

        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 更新角色条目:', itemId);
        return true;
    }

    /**
     * 更新正文条目
     * @param {string} suiteId - 套装 ID
     * @param {string} itemId - 条目 ID
     * @param {Partial<ChatContentItem>} updates - 更新内容
     * @returns {boolean}
     */
    updateChatContentItem(suiteId, itemId, updates) {
        const suite = this.suites[suiteId];
        if (!suite) return false;

        const item = suite.items.find(
            i => i.type === 'chat-content' && i.id === itemId
        );
        if (!item) return false;

        // 允许更新的字段
        if (updates.name !== undefined) item.name = updates.name;
        if (updates.enabled !== undefined) item.enabled = updates.enabled;
        if (updates.rangeConfig !== undefined) item.rangeConfig = updates.rangeConfig;
        if (updates.excludeUser !== undefined) item.excludeUser = updates.excludeUser;
        if (updates.regexConfig !== undefined) item.regexConfig = updates.regexConfig;

        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 更新正文条目:', itemId, 'enabled:', item.enabled);
        return true;
    }

    /**
     * 重新排序条目
     * @param {string} suiteId - 套装 ID
     * @param {string[]} itemIds - 新的条目 ID 顺序
     * @returns {boolean}
     */
    reorderItems(suiteId, itemIds) {
        const suite = this.suites[suiteId];
        if (!suite) return false;

        // 根据新顺序重新排列
        const newItems = [];
        for (const id of itemIds) {
            const item = suite.items.find(i => {
                if (i.type === 'prompt') return i.id === id;
                if (i.type === 'variable') return i.id === id;
                if (i.type === 'chat-content') return i.id === id;
                if (i.type === 'char-prompt') return i.id === id;
                return false;
            });
            if (item) newItems.push(item);
        }

        // 确保没有丢失条目
        if (newItems.length !== suite.items.length) {
            logger.warn('variable', '[SuiteManager] 重排序条目数量不匹配');
            return false;
        }

        suite.items = newItems;
        suite.updatedAt = Date.now();
        this._save();
        logger.debug('variable', '[SuiteManager] 重排序条目:', suite.name);
        return true;
    }

    // ========================================
    // 查询方法
    // ========================================

    /**
     * 获取套装中所有启用的变量 ID
     * @param {string} suiteId - 套装 ID
     * @returns {string[]}
     */
    getEnabledVariableIds(suiteId) {
        const suite = this.suites[suiteId];
        if (!suite) return [];

        return suite.items
            .filter(item => item.type === 'variable' && item.enabled !== false)
            .map(item => item.id);
    }

    /**
     * 获取套装中所有可见的提示词条目
     * @param {string} suiteId - 套装 ID
     * @returns {PromptItem[]}
     */
    getVisiblePromptItems(suiteId) {
        const suite = this.suites[suiteId];
        if (!suite) return [];

        return suite.items.filter(
            item => item.type === 'prompt' && item.visible
        );
    }

    /**
     * 获取套装中所有可见的正文条目
     * @param {string} suiteId - 套装 ID
     * @returns {ChatContentItem[]}
     */
    getVisibleChatContentItems(suiteId) {
        const suite = this.suites[suiteId];
        if (!suite) return [];

        return suite.items.filter(
            item => item.type === 'chat-content' && item.visible
        );
    }

    /**
     * 从所有套装中移除变量引用
     * 用于彻底删除变量时清理
     * @param {string} variableId - 变量ID
     */
    removeVariableFromAllSuites(variableId) {
        let removedCount = 0;

        for (const suiteId of Object.keys(this.suites)) {
            const suite = this.suites[suiteId];
            const originalLength = suite.items.length;

            // 过滤掉该变量类型的条目
            suite.items = suite.items.filter(item => {
                // 保留非变量类型的条目，以及非当前变量ID的变量条目
                if (item.type !== 'variable') return true;
                return item.id !== variableId;
            });

            if (suite.items.length !== originalLength) {
                removedCount++;
                suite.updatedAt = Date.now();
                logger.debug('variable', '[SuiteManager] 从套装移除变量引用:', suite.name, '变量ID:', variableId);
            }
        }

        if (removedCount > 0) {
            this._save();
            logger.info('variable', '[SuiteManager] 从', removedCount, '个套装移除了变量引用');
        }
    }

    /**
     * 获取套装中所有可见的内容条目（提示词 + 正文），按顺序返回
     * @param {string} suiteId - 套装 ID
     * @returns {Array<PromptItem|ChatContentItem>}
     */
    getVisibleContentItems(suiteId) {
        const suite = this.suites[suiteId];
        if (!suite) return [];

        return suite.items.filter(
            item => (item.type === 'prompt' || item.type === 'chat-content') && item.enabled !== false
        );
    }

    // ========================================
    // 工具方法
    // ========================================

    /**
     * 生成套装 ID
     * @private
     * @returns {string}
     */
    _generateId() {
        return 'suite_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    /**
     * 生成条目 ID
     * @private
     * @returns {string}
     */
    _generateItemId() {
        return 'item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    /**
     * 触发保存
     * @private
     */
    _save() {
        if (this._saveCallback) {
            this._saveCallback();
        }
    }

    /**
     * 导出数据（用于存储）
     * @returns {{suites: Object<string, PromptSuite>, activeSuiteId: string|null}}
     */
    exportData() {
        return {
            suites: this.suites,
            activeSuiteId: this.activeSuiteId
        };
    }
}

// ============================================
// 导出单例
// ============================================

/** @type {SuiteManager|null} */
let instance = null;

/**
 * 获取 SuiteManager 单例
 * @param {Function} [saveCallback] - 保存回调（首次调用时需要）
 * @returns {SuiteManager}
 */
export function getSuiteManager(saveCallback) {
    if (!instance) {
        instance = new SuiteManager(saveCallback);
    }
    return instance;
}

/**
 * 重置单例（用于测试）
 */
export function resetSuiteManager() {
    instance = null;
}

export default SuiteManager;
