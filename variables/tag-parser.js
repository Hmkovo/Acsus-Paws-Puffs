/**
 * 标签解析器 (Tag Parser)
 *
 * @description
 * 负责解析 AI 返回的带标签内容，支持：
 * - [标签]...[/标签] 格式
 * - [标签]... 到下一个标签格式
 * - 多个相同标签的合并
 * - 生成标签格式说明
 */

import logger from '../logger.js';

// ============================================
// 类型导入（仅用于 JSDoc）
// ============================================

/**
 * @typedef {import('./variable-types.js').ParsedContent} ParsedContent
 * @typedef {import('./variable-types.js').VariableDefinitionV2} VariableDefinitionV2
 */

// ============================================
// TagParser 类
// ============================================

/**
 * 标签解析器类
 */
export class TagParser {
    constructor() {
        // 无状态，不需要初始化
    }

    // ========================================
    // 主解析方法
    // ========================================

    /**
     * 解析 AI 返回内容
     * @param {string} response - AI 返回的原始内容
     * @param {VariableDefinitionV2[]} variables - 变量定义列表
     * @returns {ParsedContent[]}
     *
     * @description
     * 支持两种格式：
     * 1. [标签]内容[/标签] - 完整闭合格式
     * 2. [标签]内容[下一个标签] - 到下一个标签为止
     */
    parse(response, variables) {
        if (!response || !variables || variables.length === 0) {
            return [];
        }

        const results = [];

        // 提取所有标签名（去掉方括号）
        const tagNames = variables.map(v => this._extractTagName(v.tag));

        for (const variable of variables) {
            const tagName = this._extractTagName(variable.tag);
            const content = this._extractContent(response, tagName, tagNames);

            if (content) {
                results.push({
                    tag: variable.tag,
                    content: content.trim()
                });
            }
        }

        return results;
    }

    /**
     * 从标签格式中提取标签名
     * @private
     * @param {string} tag - 如 "[摘要]"
     * @returns {string} - 如 "摘要"
     */
    _extractTagName(tag) {
        // 移除方括号
        return tag.replace(/^\[|\]$/g, '');
    }

    /**
     * 提取标签内容
     * @private
     * @param {string} response
     * @param {string} tagName
     * @param {string[]} allTagNames
     * @returns {string|null}
     */
    _extractContent(response, tagName, allTagNames) {
        // 转义正则特殊字符
        const escapedTag = this._escapeRegex(tagName);

        // 方式1：尝试匹配 [标签]...[/标签] 格式
        const closedPattern = new RegExp(
            `\\[${escapedTag}\\]([\\s\\S]*?)\\[\\/${escapedTag}\\]`,
            'gi'
        );

        const closedMatches = [...response.matchAll(closedPattern)];
        if (closedMatches.length > 0) {
            // 合并多个相同标签的内容
            return closedMatches.map(m => m[1].trim()).join('\n\n');
        }

        // 方式2：尝试匹配 [标签]... 到下一个标签或结尾
        const openPattern = new RegExp(`\\[${escapedTag}\\]([\\s\\S]*?)(?=\\[(?:${allTagNames.map(t => this._escapeRegex(t)).join('|')}|\\/)\\]|$)`, 'gi');

        const openMatches = [...response.matchAll(openPattern)];
        if (openMatches.length > 0) {
            return openMatches.map(m => m[1].trim()).join('\n\n');
        }

        return null;
    }

    /**
     * 转义正则表达式特殊字符
     * @private
     * @param {string} str
     * @returns {string}
     */
    _escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ========================================
    // 标签指令生成
    // ========================================

    /**
     * 生成标签格式说明（附加到提示词末尾）
     * @param {VariableDefinitionV2[]} variables - 启用的变量列表
     * @returns {string}
     *
     * @description
     * 根据启用的变量自动生成格式说明，告诉 AI 如何输出
     */
    generateTagInstructions(variables) {
        if (!variables || variables.length === 0) {
            return '';
        }

        const lines = ['请按以下格式输出：'];

        for (const variable of variables) {
            const tagName = this._extractTagName(variable.tag);
            const modeDesc = variable.mode === 'stack' ? '（可多条）' : '（单条）';
            lines.push(`[${tagName}]你的${tagName}内容${modeDesc}[/${tagName}]`);
        }

        return lines.join('\n');
    }

    /**
     * 生成简洁的标签格式示例
     * @param {VariableDefinitionV2[]} variables
     * @returns {string}
     */
    generateTagExample(variables) {
        if (!variables || variables.length === 0) {
            return '';
        }

        const parts = variables.map(v => {
            const tagName = this._extractTagName(v.tag);
            return `[${tagName}]...[/${tagName}]`;
        });

        return parts.join('');
    }

    // ========================================
    // 验证方法
    // ========================================

    /**
     * 检查响应中是否包含指定标签
     * @param {string} response
     * @param {string} tag
     * @returns {boolean}
     */
    hasTag(response, tag) {
        const tagName = this._extractTagName(tag);
        const pattern = new RegExp(`\\[${this._escapeRegex(tagName)}\\]`, 'i');
        return pattern.test(response);
    }

    /**
     * 获取响应中所有识别到的标签
     * @param {string} response
     * @returns {string[]}
     */
    findAllTags(response) {
        const pattern = /\[([^\[\]\/]+)\]/g;
        const tags = new Set();

        let match;
        while ((match = pattern.exec(response)) !== null) {
            tags.add(match[1]);
        }

        return [...tags];
    }

    /**
     * 检查解析结果是否完整
     * @param {ParsedContent[]} results
     * @param {VariableDefinitionV2[]} variables
     * @returns {{complete: boolean, missing: string[]}}
     */
    checkCompleteness(results, variables) {
        const parsedTags = new Set(results.map(r => r.tag));
        const missing = [];

        for (const variable of variables) {
            if (!parsedTags.has(variable.tag)) {
                missing.push(variable.tag);
            }
        }

        return {
            complete: missing.length === 0,
            missing
        };
    }
}

// ============================================
// 导出单例
// ============================================

/** @type {TagParser|null} */
let instance = null;

/**
 * 获取 TagParser 单例
 * @returns {TagParser}
 */
export function getTagParser() {
    if (!instance) {
        instance = new TagParser();
    }
    return instance;
}

/**
 * 重置单例
 */
export function resetTagParser() {
    instance = null;
}

export default TagParser;
