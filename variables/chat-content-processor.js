/**
 * 正文条目处理器 (Chat Content Processor)
 *
 * @description
 * 负责处理正文条目的核心逻辑：
 * - 楼层计算：根据范围配置计算选中的楼层
 * - 内容获取：获取指定楼层的聊天内容
 * - 正则处理：对每个楼层单独应用正则脚本（按顺序：自定义 → 全局 → 预设 → 局部）
 * - 预览格式化：生成楼层预览文本
 *
 * @version 2.1 - 2026-01-14
 * - 正则改为对每个楼层单独应用，而不是拼接后应用
 * - 支持自定义正则脚本
 * - 支持正则脚本拖拽排序
 */

import logger from '../logger.js';
import { getContext } from '../../../../extensions.js';
import { regexFromString } from '../../../../utils.js';

// ============================================
// 类型定义（JSDoc）
// ============================================

/**
 * @typedef {'fixed'|'latest'|'relative'|'interval'|'percentage'|'exclude'} RangeType
 */

/**
 * @typedef {Object} RangeConfig
 * @property {RangeType} type - 范围类型
 * @property {number} [start] - 起始楼（fixed, interval）
 * @property {number} [end] - 结束楼（fixed）
 * @property {number} [count] - 数量（latest, relative）
 * @property {number} [skip] - 跳过数量（relative）
 * @property {number} [step] - 间隔步长（interval）
 * @property {number} [percent] - 百分比（percentage）
 * @property {'start'|'end'} [position] - 位置（percentage）
 * @property {number} [excludeStart] - 排除起始（exclude）
 * @property {number} [excludeEnd] - 排除结束（exclude）
 */

/**
 * @typedef {Object} RegexScript
 * @property {string} id - 脚本 ID
 * @property {string} scriptName - 脚本名称
 * @property {string} findRegex - 查找正则表达式
 * @property {string} replaceString - 替换字符串
 * @property {string[]} [trimStrings] - 修剪字符串数组
 * @property {boolean} [only_format_prompt] - 是否仅格式提示词
 * @property {boolean} [disabled] - 是否禁用
 * @property {string} [source] - 来源（custom/global/preset/scoped）
 */

/**
 * @typedef {Object} RegexConfig
 * @property {boolean} usePromptOnly - 使用「仅格式提示词」正则
 * @property {string[]} enabledScripts - 启用的脚本 ID
 * @property {string[]} disabledScripts - 禁用的脚本 ID
 * @property {RegexScript[]} [customScripts] - 自定义正则脚本（按顺序）
 * @property {string[]} [scriptOrder] - 脚本执行顺序（脚本ID数组）
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 是否有效
 * @property {string} [error] - 错误消息
 */

// ============================================
// 常量
// ============================================

/** 默认范围配置 */
const DEFAULT_RANGE_CONFIG = {
    type: 'latest',
    count: 20
};

// ============================================
// ChatContentProcessor 类
// ============================================

/**
 * 正文条目处理器类
 */
export class ChatContentProcessor {
    constructor() {
        // 无状态，所有方法都是纯函数
    }

    // ========================================
    // 楼层计算
    // ========================================

    /**
     * 计算选中的楼层列表
     *
     * @param {RangeConfig} config - 范围配置
     * @param {number} chatLength - 当前聊天长度
     * @param {boolean} excludeUser - 是否排除 User 楼层
     * @param {Array} [chat] - 聊天历史（用于判断 is_user）
     * @returns {number[]} 楼层编号数组（从1开始）
     */
    calculateFloors(config, chatLength, excludeUser = false, chat = []) {
        if (chatLength === 0) return [];

        let floors = [];

        switch (config.type) {
            case 'fixed':
                floors = this._calculateFixed(config, chatLength);
                break;
            case 'latest':
                floors = this._calculateLatest(config, chatLength);
                break;
            case 'relative':
                floors = this._calculateRelative(config, chatLength);
                break;
            case 'interval':
                floors = this._calculateInterval(config, chatLength);
                break;
            case 'percentage':
                floors = this._calculatePercentage(config, chatLength);
                break;
            case 'exclude':
                floors = this._calculateExclude(config, chatLength);
                break;
            default:
                logger.warn('[ChatContentProcessor] 未知范围类型:', config.type);
                return [];
        }

        // 排除 User 楼层
        if (excludeUser && chat.length > 0) {
            floors = floors.filter(floor => {
                const msg = chat[floor - 1];
                return msg && !msg.is_user;
            });
        }

        return floors;
    }

    /**
     * 固定范围：第 N 楼到第 M 楼
     * @private
     */
    _calculateFixed(config, chatLength) {
        const start = Math.max(1, config.start || 1);
        const end = Math.min(chatLength, config.end || chatLength);

        if (start > end) return [];

        const floors = [];
        for (let i = start; i <= end; i++) {
            floors.push(i);
        }
        return floors;
    }

    /**
     * 最新 N 楼：从最新往回数
     * @private
     */
    _calculateLatest(config, chatLength) {
        const count = Math.min(config.count || 20, chatLength);
        const start = Math.max(1, chatLength - count + 1);

        const floors = [];
        for (let i = start; i <= chatLength; i++) {
            floors.push(i);
        }
        return floors;
    }

    /**
     * 相对范围：跳过最近 X 楼，取 Y 楼
     * @private
     */
    _calculateRelative(config, chatLength) {
        const skip = config.skip || 0;
        const count = config.count || 20;

        // 从最新往回跳过 skip 楼后的位置
        const end = chatLength - skip;
        if (end < 1) return [];

        const start = Math.max(1, end - count + 1);

        const floors = [];
        for (let i = start; i <= end; i++) {
            floors.push(i);
        }
        return floors;
    }

    /**
     * 间隔采样：从第 N 楼开始，每 M 楼取 1 条
     * @private
     */
    _calculateInterval(config, chatLength) {
        const start = Math.max(1, config.start || 1);
        const step = Math.max(1, config.step || 5);

        const floors = [];
        for (let i = start; i <= chatLength; i += step) {
            floors.push(i);
        }
        return floors;
    }

    /**
     * 百分比范围：取前/后 X%
     * @private
     */
    _calculatePercentage(config, chatLength) {
        const percent = Math.max(0, Math.min(100, config.percent || 30));
        const count = Math.max(1, Math.round(chatLength * percent / 100));
        const position = config.position || 'end';

        const floors = [];
        if (position === 'start') {
            // 取前 X%
            for (let i = 1; i <= count; i++) {
                floors.push(i);
            }
        } else {
            // 取后 X%
            const start = Math.max(1, chatLength - count + 1);
            for (let i = start; i <= chatLength; i++) {
                floors.push(i);
            }
        }
        return floors;
    }

    /**
     * 排除范围：全部楼层，但排除某些楼
     * @private
     */
    _calculateExclude(config, chatLength) {
        const excludeStart = config.excludeStart || 1;
        const excludeEnd = config.excludeEnd || excludeStart;

        const floors = [];
        for (let i = 1; i <= chatLength; i++) {
            if (i < excludeStart || i > excludeEnd) {
                floors.push(i);
            }
        }
        return floors;
    }

    // ========================================
    // 内容获取
    // ========================================

    /**
     * 获取指定楼层的内容（不应用正则）
     *
     * @param {number[]} floors - 楼层列表
     * @param {Array} chat - 聊天历史
     * @returns {string} 拼接后的内容
     */
    fetchContent(floors, chat) {
        if (!floors || floors.length === 0 || !chat || chat.length === 0) {
            return '';
        }

        const contents = [];
        for (const floor of floors) {
            const msg = chat[floor - 1];
            if (msg && msg.mes) {
                const sender = msg.is_user ? 'User' : (msg.name || 'Assistant');
                contents.push(`[${floor}楼] ${sender}: ${msg.mes}`);
            }
        }

        return contents.join('\n\n');
    }

    /**
     * 获取指定楼层的内容（对每个楼层单独应用正则）
     *
     * @param {number[]} floors - 楼层列表
     * @param {Array} chat - 聊天历史
     * @param {RegexConfig} [regexConfig] - 正则配置
     * @returns {string} 拼接后的内容（已应用正则）
     */
    fetchContentWithRegex(floors, chat, regexConfig) {
        if (!floors || floors.length === 0 || !chat || chat.length === 0) {
            return '';
        }

        const contents = [];
        for (const floor of floors) {
            const msg = chat[floor - 1];
            if (msg && msg.mes) {
                const sender = msg.is_user ? 'User' : (msg.name || 'Assistant');

                // 对每个楼层的内容单独应用正则
                let content = msg.mes;
                if (regexConfig && regexConfig.usePromptOnly) {
                    content = this.applyRegexToContent(content, regexConfig);
                }

                // 如果正则处理后内容为空，跳过这个楼层
                if (content.trim()) {
                    contents.push(`[${floor}楼] ${sender}: ${content}`);
                }
            }
        }

        return contents.join('\n\n');
    }

    // ========================================
    // 预览格式化
    // ========================================

    /**
     * 格式化楼层预览文本
     *
     * @param {number[]} floors - 楼层列表
     * @returns {string} 预览文本
     */
    formatPreview(floors) {
        if (!floors || floors.length === 0) {
            return '（无选中楼层）';
        }

        const count = floors.length;

        if (count <= 10) {
            // 个别显示
            return `第 ${floors.join(', ')} 楼`;
        } else {
            // 压缩显示
            const min = Math.min(...floors);
            const max = Math.max(...floors);

            // 检查是否连续
            const isConsecutive = (max - min + 1) === count;

            if (isConsecutive) {
                return `第 ${min}-${max} 楼（共 ${count} 条）`;
            } else {
                return `共 ${count} 条（第 ${min}-${max} 楼范围内）`;
            }
        }
    }

    // ========================================
    // 范围验证
    // ========================================

    /**
     * 验证范围配置
     *
     * @param {RangeConfig} config - 范围配置
     * @param {number} chatLength - 当前聊天长度
     * @returns {ValidationResult}
     */
    validateRange(config, chatLength) {
        if (chatLength === 0) {
            return { valid: false, error: '当前没有聊天记录' };
        }

        switch (config.type) {
            case 'fixed':
                return this._validateFixed(config, chatLength);
            case 'latest':
                return this._validateLatest(config, chatLength);
            case 'relative':
                return this._validateRelative(config, chatLength);
            case 'interval':
                return this._validateInterval(config, chatLength);
            case 'percentage':
                return this._validatePercentage(config);
            case 'exclude':
                return this._validateExclude(config, chatLength);
            default:
                return { valid: false, error: '未知范围类型' };
        }
    }

    /** @private */
    _validateFixed(config, chatLength) {
        const start = config.start || 1;
        const end = config.end || chatLength;

        if (start < 1) {
            return { valid: false, error: '起始楼层必须大于 0' };
        }
        if (start > chatLength) {
            return { valid: false, error: `起始楼层超出范围，当前最大楼层：${chatLength}` };
        }
        if (end > chatLength) {
            return { valid: false, error: `结束楼层超出范围，当前最大楼层：${chatLength}` };
        }
        if (start > end) {
            return { valid: false, error: '起始楼层不能大于结束楼层' };
        }
        return { valid: true };
    }

    /** @private */
    _validateLatest(config, chatLength) {
        const count = config.count || 20;
        if (count <= 0) {
            return { valid: false, error: '楼层数量必须大于 0' };
        }
        return { valid: true };
    }

    /** @private */
    _validateRelative(config, chatLength) {
        const skip = config.skip || 0;
        const count = config.count || 20;

        if (skip < 0) {
            return { valid: false, error: '跳过数量不能为负数' };
        }
        if (count <= 0) {
            return { valid: false, error: '获取数量必须大于 0' };
        }
        if (skip >= chatLength) {
            return { valid: false, error: `跳过数量超出范围，当前最大楼层：${chatLength}` };
        }
        return { valid: true };
    }

    /** @private */
    _validateInterval(config, chatLength) {
        const start = config.start || 1;
        const step = config.step || 5;

        if (start < 1) {
            return { valid: false, error: '起始楼层必须大于 0' };
        }
        if (start > chatLength) {
            return { valid: false, error: `起始楼层超出范围，当前最大楼层：${chatLength}` };
        }
        if (step <= 0) {
            return { valid: false, error: '间隔步长必须大于 0' };
        }
        return { valid: true };
    }

    /** @private */
    _validatePercentage(config) {
        const percent = config.percent || 30;
        if (percent <= 0 || percent > 100) {
            return { valid: false, error: '百分比必须在 1-100 之间' };
        }
        return { valid: true };
    }

    /** @private */
    _validateExclude(config, chatLength) {
        const excludeStart = config.excludeStart || 1;
        const excludeEnd = config.excludeEnd || excludeStart;

        if (excludeStart < 1) {
            return { valid: false, error: '排除起始楼层必须大于 0' };
        }
        if (excludeStart > excludeEnd) {
            return { valid: false, error: '排除起始楼层不能大于结束楼层' };
        }
        // 检查是否排除了所有楼层
        if (excludeStart === 1 && excludeEnd >= chatLength) {
            return { valid: false, error: '不能排除所有楼层' };
        }
        return { valid: true };
    }

    // ========================================
    // 便捷方法
    // ========================================

    /**
     * 获取当前聊天历史
     * @returns {Array}
     */
    getChat() {
        const ctx = getContext();
        return ctx?.chat || [];
    }

    /**
     * 获取当前聊天长度
     * @returns {number}
     */
    getChatLength() {
        return this.getChat().length;
    }

    // ========================================
    // 正则处理
    // ========================================

    /**
     * 动态导入酒馆正则引擎
     * @private
     * @returns {Promise<{getScriptsByType: Function, SCRIPT_TYPES: Object}|null>}
     */
    async _importRegexEngine() {
        try {
            const engine = await import('../../../../extensions/regex/engine.js');
            return engine;
        } catch (error) {
            logger.warn('[ChatContentProcessor] 无法导入正则引擎:', error.message);
            return null;
        }
    }

    /**
     * 加载当前可用的正则脚本（仅 promptOnly=true 的）
     *
     * @returns {Promise<{global: RegexScript[], preset: RegexScript[], scoped: RegexScript[]}>}
     */
    async loadRegexScripts() {
        try {
            const engine = await this._importRegexEngine();
            if (!engine) {
                return { global: [], preset: [], scoped: [] };
            }

            const { getScriptsByType, SCRIPT_TYPES } = engine;

            // 全局正则 - 用户设置的，相对固定
            const globalScripts = (getScriptsByType(SCRIPT_TYPES.GLOBAL) || [])
                .filter(s => s.promptOnly && !s.disabled)
                .map(s => ({ ...s, source: 'global' }));

            // 预设正则 - 跟随当前预设变化
            const presetScripts = (getScriptsByType(SCRIPT_TYPES.PRESET) || [])
                .filter(s => s.promptOnly && !s.disabled)
                .map(s => ({ ...s, source: 'preset' }));

            // 局部正则 - 跟随当前角色卡变化
            const scopedScripts = (getScriptsByType(SCRIPT_TYPES.SCOPED) || [])
                .filter(s => s.promptOnly && !s.disabled)
                .map(s => ({ ...s, source: 'scoped' }));

            return { global: globalScripts, preset: presetScripts, scoped: scopedScripts };
        } catch (error) {
            logger.error('[ChatContentProcessor] 加载正则脚本失败:', error.message);
            return { global: [], preset: [], scoped: [] };
        }
    }

    /**
     * 同步加载正则脚本（用于非异步场景）
     * 注意：这个方法会缓存结果，需要手动刷新
     *
     * @returns {{global: RegexScript[], preset: RegexScript[], scoped: RegexScript[]}}
     */
    loadRegexScriptsSync() {
        // 如果有缓存，直接返回
        if (this._cachedScripts) {
            return this._cachedScripts;
        }

        try {
            // 尝试同步获取（如果模块已加载）
            const { extension_settings } = require('../../../../extensions.js');

            // 全局正则
            const globalScripts = (extension_settings.regex || [])
                .filter(s => s.promptOnly && !s.disabled)
                .map(s => ({ ...s, source: 'global', id: s.scriptName || s.id }));

            return { global: globalScripts, preset: [], scoped: [] };
        } catch (error) {
            logger.warn('[ChatContentProcessor] 同步加载正则失败，返回空列表');
            return { global: [], preset: [], scoped: [] };
        }
    }

    /**
     * 执行单个正则脚本
     *
     * @private
     * @param {RegexScript} script - 正则脚本
     * @param {string} text - 输入文本
     * @returns {string} 处理后的文本
     */
    _runSingleScript(script, text) {
        if (!script.findRegex || !text) return text;

        try {
            // 使用酒馆的正则解析函数（支持 /pattern/flags 格式）
            const regex = regexFromString(script.findRegex);

            if (!regex) {
                logger.warn('[ChatContentProcessor] 无效的正则表达式:', script.scriptName, script.findRegex);
                return text;
            }

            // 执行替换
            let result = text.replace(regex, script.replaceString || '');

            // 处理 trimStrings
            if (script.trimStrings && Array.isArray(script.trimStrings)) {
                script.trimStrings.forEach(trimStr => {
                    if (trimStr) {
                        result = result.replaceAll(trimStr, '');
                    }
                });
            }

            return result;
        } catch (error) {
            logger.error('[ChatContentProcessor] 正则脚本执行失败:', script.scriptName, error.message);
            return text;
        }
    }

    /**
     * 对单个内容应用正则处理
     * 按顺序应用：自定义 → 全局 → 预设 → 局部
     *
     * @param {string} content - 原始内容
     * @param {RegexConfig} config - 正则配置
     * @returns {string} 处理后的内容
     */
    applyRegexToContent(content, config) {
        if (!content || !config || !config.usePromptOnly) {
            return content;
        }

        let result = content;

        // 获取所有脚本
        const tavernScripts = this.loadRegexScriptsSync();
        const customScripts = config.customScripts || [];

        // 合并所有脚本（按顺序：自定义 → 全局 → 预设 → 局部）
        let allScripts = [
            ...customScripts.filter(s => !s.disabled),
            ...tavernScripts.global,
            ...tavernScripts.preset,
            ...tavernScripts.scoped
        ];

        // 如果有自定义排序，按排序应用
        if (config.scriptOrder && config.scriptOrder.length > 0) {
            const orderedScripts = [];
            const scriptMap = new Map();

            // 建立脚本映射
            allScripts.forEach(s => {
                const id = s.id || s.scriptName;
                if (id) scriptMap.set(id, s);
            });

            // 按顺序添加
            config.scriptOrder.forEach(id => {
                const script = scriptMap.get(id);
                if (script) {
                    orderedScripts.push(script);
                    scriptMap.delete(id);
                }
            });

            // 添加未排序的脚本
            scriptMap.forEach(script => orderedScripts.push(script));
            allScripts = orderedScripts;
        }

        // 过滤禁用的脚本
        const enabledScripts = allScripts.filter(script => {
            const scriptId = script.id || script.scriptName;

            // 检查是否在禁用列表中
            if (config.disabledScripts && config.disabledScripts.includes(scriptId)) {
                return false;
            }

            // 如果有启用列表且不为空，只应用列表中的脚本
            if (config.enabledScripts && config.enabledScripts.length > 0) {
                return config.enabledScripts.includes(scriptId);
            }

            return true;
        });

        // 应用每个脚本
        for (const script of enabledScripts) {
            try {
                result = this._runSingleScript(script, result);
            } catch (error) {
                logger.warn('[ChatContentProcessor] 正则脚本执行失败:', script.scriptName || script.id, error.message);
            }
        }

        return result;
    }

    /**
     * 应用正则处理（兼容旧接口）
     *
     * @param {string} content - 原始内容
     * @param {RegexConfig} config - 正则配置
     * @returns {string} 处理后的内容
     * @deprecated 使用 applyRegexToContent 代替
     */
    applyRegex(content, config) {
        return this.applyRegexToContent(content, config);
    }

    /**
     * 获取正文条目的完整内容（计算楼层 + 获取内容 + 对每个楼层应用正则）
     *
     * @param {Object} item - 正文条目
     * @param {RangeConfig} item.rangeConfig - 范围配置
     * @param {boolean} item.excludeUser - 排除 User 楼层
     * @param {RegexConfig} item.regexConfig - 正则配置
     * @returns {string} 处理后的内容
     */
    getItemContent(item) {
        const chat = this.getChat();
        const chatLength = chat.length;

        if (chatLength === 0) {
            return '';
        }

        // 1. 计算楼层
        const floors = this.calculateFloors(
            item.rangeConfig,
            chatLength,
            item.excludeUser,
            chat
        );

        if (floors.length === 0) {
            return '';
        }

        // 2. 获取内容并对每个楼层单独应用正则
        const content = this.fetchContentWithRegex(floors, chat, item.regexConfig);

        return content;
    }

    /**
     * 刷新正则脚本缓存
     * 在切换预设、角色等场景后调用
     */
    refreshScriptsCache() {
        this._cachedScripts = null;
        logger.debug('[ChatContentProcessor] 正则脚本缓存已刷新');
    }
}

// ============================================
// 导出单例
// ============================================

/** @type {ChatContentProcessor|null} */
let instance = null;

/**
 * 获取 ChatContentProcessor 单例
 * @returns {ChatContentProcessor}
 */
export function getChatContentProcessor() {
    if (!instance) {
        instance = new ChatContentProcessor();
    }
    return instance;
}

/**
 * 重置单例（用于测试）
 */
export function resetChatContentProcessor() {
    instance = null;
}

export default ChatContentProcessor;
