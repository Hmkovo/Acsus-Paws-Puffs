/**
 * 宏处理器 (Macro Processor)
 *
 * @description
 * 负责解析和替换 V2 宏，支持：
 * - 选择性引用：{{变量@1-5}}、{{变量@N-end}}
 * - 酒馆楼层引用：{{酒馆楼层@1-10}}
 * - 嵌套宏：{{变量@{{LastMessageId}}-5}}
 */

import logger from '../logger.js';
import { getContext } from '../../../../extensions.js';

// ============================================
// 类型导入（仅用于 JSDoc）
// ============================================

/**
 * @typedef {import('./variable-types.js').Range} Range
 * @typedef {import('./variable-types.js').ParsedReference} ParsedReference
 * @typedef {import('./variable-types.js').MacroContext} MacroContext
 * @typedef {import('./variable-types.js').VariableDefinitionV2} VariableDefinitionV2
 */

// ============================================
// 常量
// ============================================

/** 酒馆楼层宏名称 */
const CHAT_FLOOR_MACRO = '酒馆楼层';

/** 内置宏列表 */
const BUILTIN_MACROS = ['LastMessageId', 'lastMessageId'];

// ============================================
// MacroProcessor 类
// ============================================

/**
 * 宏处理器类
 */
export class MacroProcessor {
    /**
     * @param {Function} getVariableContent - 获取变量内容的回调
     */
    constructor(getVariableContent) {
        /** @type {Function} */
        this._getVariableContent = getVariableContent;
    }

    // ========================================
    // 主处理方法
    // ========================================

    /**
     * 处理模板中的所有宏
     * @param {string} template - 模板字符串
     * @param {MacroContext} context - 宏上下文
     * @returns {Promise<string>}
     */
    async process(template, context) {
        if (!template) return '';

        let result = template;

        // 1. 先解析嵌套宏（从内到外）
        result = this.resolveNested(result, context);

        // 2. 解析变量引用和酒馆楼层引用
        result = await this.resolveReferences(result, context);

        return result;
    }

    // ========================================
    // 嵌套宏解析
    // ========================================

    /**
     * 解析嵌套宏
     * @param {string} template
     * @param {MacroContext} context
     * @returns {string}
     */
    resolveNested(template, context) {
        let result = template;
        let maxIterations = 10; // 防止无限循环

        while (maxIterations-- > 0) {
            // 查找内置宏
            let changed = false;

            for (const macro of BUILTIN_MACROS) {
                const pattern = new RegExp(`\\{\\{${macro}\\}\\}`, 'g');
                if (pattern.test(result)) {
                    const value = this.resolveBuiltinMacro(macro, context);
                    result = result.replace(pattern, value);
                    changed = true;
                }
            }

            // 计算简单算术表达式（如 100-5）
            result = this.evaluateExpressions(result);

            if (!changed) break;
        }

        return result;
    }

    /**
     * 解析内置宏
     * @param {string} macro
     * @param {MacroContext} context
     * @returns {string}
     */
    resolveBuiltinMacro(macro, context) {
        switch (macro.toLowerCase()) {
            case 'lastmessageid':
                return String(context.lastMessageId);
            default:
                return '';
        }
    }

    /**
     * 计算简单算术表达式
     * @param {string} template
     * @returns {string}
     */
    evaluateExpressions(template) {
        // 匹配 @数字-数字 或 @数字+数字 格式中的表达式
        return template.replace(/@(\d+)([+-])(\d+)/g, (match, a, op, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            const result = op === '+' ? numA + numB : numA - numB;
            return '@' + result;
        });
    }

    // ========================================
    // 引用解析
    // ========================================

    /**
     * 解析所有引用
     * @param {string} template
     * @param {MacroContext} context
     * @returns {Promise<string>}
     */
    async resolveReferences(template, context) {
        let result = template;

        // 匹配 {{名称}} 或 {{名称@范围}}
        const pattern = /\{\{([^{}@]+)(@[^{}]+)?\}\}/g;
        const matches = [...template.matchAll(pattern)];

        for (const match of matches) {
            const fullMatch = match[0];
            const name = match[1].trim();
            const rangeStr = match[2] || '';

            let content = '';

            if (name === CHAT_FLOOR_MACRO) {
                // 酒馆楼层引用
                content = this.getChatFloorContent(rangeStr, context);
            } else {
                // 变量引用
                content = await this.getVariableContent(name, rangeStr, context);
            }

            result = result.replace(fullMatch, content);
        }

        return result;
    }

    /**
     * 解析引用字符串
     * @param {string} refStr - 如 "@1-5" 或 "@1-3, @10-end"
     * @returns {Range[]}
     */
    parseRanges(refStr) {
        if (!refStr || refStr === '@') return [];

        const ranges = [];
        // 移除开头的 @，然后按逗号分割
        const parts = refStr.replace(/^@/, '').split(/,\s*@?/);

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            if (trimmed.includes('-')) {
                // 范围格式：1-5 或 1-end
                const [startStr, endStr] = trimmed.split('-');
                const start = startStr === 'end' ? 'end' : parseInt(startStr, 10);
                const end = endStr === 'end' ? 'end' : parseInt(endStr, 10);

                if ((typeof start === 'number' && !isNaN(start)) || start === 'end') {
                    ranges.push({ start, end: end || start });
                }
            } else {
                // 单个数字
                const num = parseInt(trimmed, 10);
                if (!isNaN(num)) {
                    ranges.push({ start: num, end: num });
                }
            }
        }

        return ranges;
    }

    // ========================================
    // 变量内容获取
    // ========================================

    /**
     * 获取变量内容
     * @param {string} name - 变量名
     * @param {string} rangeStr - 范围字符串
     * @param {MacroContext} context
     * @returns {Promise<string>}
     */
    async getVariableContent(name, rangeStr, context) {
        if (!this._getVariableContent) {
            logger.warn('[MacroProcessor] 未设置 getVariableContent 回调');
            return '';
        }

        const ranges = this.parseRanges(rangeStr);

        try {
            return await this._getVariableContent(name, ranges, context);
        } catch (error) {
            logger.error('[MacroProcessor] 获取变量内容失败:', name, error.message);
            return '';
        }
    }

    // ========================================
    // 酒馆楼层内容获取
    // ========================================

    /**
     * 获取酒馆楼层内容
     * @param {string} rangeStr - 范围字符串
     * @param {MacroContext} context
     * @returns {string}
     */
    getChatFloorContent(rangeStr, context) {
        const ranges = this.parseRanges(rangeStr);
        if (ranges.length === 0) {
            // 没有范围，返回空
            return '';
        }

        try {
            const ctx = getContext();
            const chat = ctx?.chat || [];

            if (chat.length === 0) {
                return '';
            }

            const contents = [];

            for (const range of ranges) {
                let start = range.start;
                let end = range.end;

                // 处理 'end'
                if (start === 'end') start = chat.length;
                if (end === 'end') end = chat.length;

                // 处理负数（相对于最新消息）
                if (typeof start === 'number' && start < 0) {
                    start = chat.length + start;
                }
                if (typeof end === 'number' && end < 0) {
                    end = chat.length + end;
                }

                // 确保范围有效
                start = Math.max(1, Math.min(start, chat.length));
                end = Math.max(1, Math.min(end, chat.length));

                // 确保 start <= end
                if (start > end) {
                    [start, end] = [end, start];
                }

                // 提取消息（楼层从1开始，数组从0开始）
                for (let i = start - 1; i < end; i++) {
                    const msg = chat[i];
                    if (msg) {
                        const sender = msg.is_user ? 'User' : (msg.name || 'Assistant');
                        contents.push(`[${i + 1}楼] ${sender}: ${msg.mes}`);
                    }
                }
            }

            return contents.join('\n\n');
        } catch (error) {
            logger.error('[MacroProcessor] 获取酒馆楼层失败:', error.message);
            return '';
        }
    }

    // ========================================
    // 范围内容提取（用于叠加模式）
    // ========================================

    /**
     * 根据范围提取条目
     * @param {Array<{id: number, content: string, hidden: boolean}>} entries
     * @param {Range[]} ranges
     * @returns {string[]}
     */
    extractEntriesByRanges(entries, ranges) {
        if (ranges.length === 0) {
            // 没有范围，返回所有可见条目
            return entries.filter(e => !e.hidden).map(e => e.content);
        }

        const result = [];
        const visibleEntries = entries.filter(e => !e.hidden);

        for (const range of ranges) {
            let start = range.start;
            let end = range.end;

            // 处理 'end'
            if (start === 'end') start = visibleEntries.length;
            if (end === 'end') end = visibleEntries.length;

            // 确保范围有效（条目 ID 从 1 开始）
            start = Math.max(1, start);
            end = Math.min(visibleEntries.length, end);

            // 提取条目
            for (let i = start - 1; i < end; i++) {
                if (visibleEntries[i]) {
                    result.push(visibleEntries[i].content);
                }
            }
        }

        return result;
    }
}

// ============================================
// 导出单例
// ============================================

/** @type {MacroProcessor|null} */
let instance = null;

/**
 * 获取 MacroProcessor 单例
 * @param {Function} [getVariableContent]
 * @returns {MacroProcessor}
 */
export function getMacroProcessor(getVariableContent) {
    if (!instance) {
        instance = new MacroProcessor(getVariableContent);
    }
    return instance;
}

/**
 * 重置单例
 */
export function resetMacroProcessor() {
    instance = null;
}

export default MacroProcessor;
