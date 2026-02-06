/**
 * V2 变量分析器 (Variable Analyzer V2)
 *
 * @description
 * 负责 V2 分析流程：
 * - 按顺序拼接所有可见的提示词条目
 * - 解析宏引用
 * - 调用 API
 * - 解析返回内容
 * - 分配到各变量
 */

import logger from '../logger.js';
import { getContext } from '../../../../extensions.js';
import { getSuiteManager } from './suite-manager.js';
import { getVariableManagerV2 } from './variable-manager-v2.js';
import { getMacroProcessor } from './macro-processor.js';
import { getTagParser } from './tag-parser.js';
import { getVariableAPI } from './variable-api-manager.js';
import { getChatContentProcessor } from './chat-content-processor.js';
import * as storage from './variable-storage.js';

// ============================================
// 类型导入（仅用于 JSDoc）
// ============================================

/**
 * @typedef {import('./variable-types.js').PromptSuite} PromptSuite
 * @typedef {import('./variable-types.js').VariableDefinitionV2} VariableDefinitionV2
 * @typedef {import('./variable-types.js').MacroContext} MacroContext
 * @typedef {import('./variable-types.js').ParsedContent} ParsedContent
 */

// ============================================
// VariableAnalyzerV2 类
// ============================================

/**
 * V2 变量分析器类
 */
export class VariableAnalyzerV2 {
    constructor() {
        /** @type {boolean} */
        this._isAnalyzing = false;
        /** @type {AbortController|null} */
        this._abortController = null;
        /** @type {string|null} 最后一次 AI 返回的原始内容 */
        this.lastResponse = null;
        /** @type {ParsedContent[]|null} 最后一次解析结果 */
        this.lastParsedResults = null;
        /** @type {string|null} 最后一次分析时的楼层范围 */
        this._lastFloorRange = null;
    }

    // ========================================
    // 主分析方法
    // ========================================

    /**
     * 分析指定套装
     * @async
     * @param {string} suiteId - 套装 ID
     * @param {AbortSignal} [signal] - 中止信号
     * @returns {Promise<{success: boolean, results?: ParsedContent[], error?: string}>}
     */
    async analyze(suiteId, signal) {
        if (this._isAnalyzing) {
            return { success: false, error: '正在分析中' };
        }

        this._isAnalyzing = true;
        this._abortController = new AbortController();

        try {
            // 1. 获取套装
            const suiteManager = getSuiteManager();
            const suite = suiteManager.getSuite(suiteId);
            if (!suite) {
                return { success: false, error: '套装不存在' };
            }

            // 2. 获取上下文
            const ctx = getContext();
            const chatId = ctx?.chatId;
            if (!chatId) {
                return { success: false, error: '没有活跃的聊天' };
            }

            const chat = ctx?.chat || [];
            const lastMessageId = chat.length;

            // 3. 构建宏上下文
            const variableManager = getVariableManagerV2();
            const variables = new Map();
            for (const def of variableManager.getDefinitions()) {
                variables.set(def.name, def);
            }

            /** @type {MacroContext} */
            const macroContext = {
                chatId,
                lastMessageId,
                variables
            };

            // 4. 构建提示词并计算楼层范围
            const { prompt, floorRange } = await this._buildPromptWithFloorRange(suite, macroContext);
            if (!prompt) {
                return { success: false, error: '没有可见的提示词条目' };
            }

            // 保存楼层范围供后续使用
            this._lastFloorRange = floorRange;

            // 5. 获取启用的变量
            const enabledVariableIds = suiteManager.getEnabledVariableIds(suiteId);
            const enabledVariables = enabledVariableIds
                .map(id => variableManager.getDefinition(id))
                .filter(v => v !== null);

            if (enabledVariables.length === 0) {
                return { success: false, error: '没有启用的变量' };
            }

            // 6. 生成标签指令
            const tagParser = getTagParser();
            const tagInstructions = tagParser.generateTagInstructions(enabledVariables);
            const fullPrompt = prompt + '\n\n' + tagInstructions;

            logger.debug('[VariableAnalyzerV2] 发送提示词:', fullPrompt.substring(0, 200) + '...');

            // 7. 调用 API
            const response = await this._callAPI(fullPrompt, signal);
            if (!response) {
                return { success: false, error: '分析被中止或失败' };
            }

            this.lastResponse = response;
            logger.debug('[VariableAnalyzerV2] AI 返回:', response.substring(0, 200) + '...');

            // 8. 解析返回内容
            const parsedResults = tagParser.parse(response, enabledVariables);
            this.lastParsedResults = parsedResults;

            // 9. 检查完整性
            const completeness = tagParser.checkCompleteness(parsedResults, enabledVariables);
            if (!completeness.complete) {
                logger.warn('[VariableAnalyzerV2] 部分标签未解析:', completeness.missing);
            }

            logger.info('[VariableAnalyzerV2] 分析完成，解析到', parsedResults.length, '个结果');

            return { success: true, results: parsedResults };

        } catch (error) {
            if (error.name === 'AbortError') {
                logger.info('[VariableAnalyzerV2] 分析已中止');
                return { success: false, error: '分析已中止' };
            }
            logger.error('[VariableAnalyzerV2] 分析失败:', error.message);
            return { success: false, error: error.message };
        } finally {
            this._isAnalyzing = false;
            this._abortController = null;
        }
    }

    /**
     * 确认并分配解析结果到变量
     * @async
     * @param {ParsedContent[]} results - 解析结果
     * @param {string} chatId - 聊天 ID
     * @param {string} floorRange - 楼层范围（如 "56-65"）
     * @returns {Promise<{success: boolean, assigned: number}>}
     */
    async assignResults(results, chatId, floorRange) {
        const variableManager = getVariableManagerV2();
        let assigned = 0;

        for (const result of results) {
            // 根据标签找到变量
            const variable = variableManager.getDefinitionByTag(result.tag);
            if (!variable) {
                logger.warn('[VariableAnalyzerV2] 未找到标签对应的变量:', result.tag);
                continue;
            }

            try {
                if (variable.mode === 'stack') {
                    // 叠加模式：添加条目
                    await variableManager.addEntry(variable.id, chatId, result.content, floorRange);
                } else {
                    // 覆盖模式：设置值
                    await variableManager.setValue(variable.id, chatId, result.content, floorRange);
                }
                assigned++;
                logger.debug('[VariableAnalyzerV2] 已分配到变量:', variable.name);
            } catch (error) {
                logger.error('[VariableAnalyzerV2] 分配失败:', variable.name, error.message);
            }
        }

        return { success: true, assigned };
    }

    // ========================================
    // 内部方法
    // ========================================

    /**
     * 构建提示词（包含提示词条目和正文条目）并计算楼层范围
     * @private
     * @param {PromptSuite} suite
     * @param {MacroContext} context
     * @returns {Promise<{prompt: string, floorRange: string}>}
     */
    async _buildPromptWithFloorRange(suite, context) {
        const suiteManager = getSuiteManager();
        const chatContentProcessor = getChatContentProcessor();

        // 获取所有可见的内容条目（提示词 + 正文），按顺序
        const visibleItems = suiteManager.getVisibleContentItems(suite.id);

        if (visibleItems.length === 0) {
            return { prompt: '', floorRange: '' };
        }

        const macroProcessor = getMacroProcessor(this._getVariableContentCallback());
        const parts = [];
        const allFloors = []; // 收集所有正文条目的楼层

        for (const item of visibleItems) {
            if (item.type === 'prompt') {
                // 提示词条目：处理宏
                const resolved = await macroProcessor.process(item.content, context);
                parts.push(resolved);
            } else if (item.type === 'chat-content') {
                // 正文条目：获取聊天内容
                const content = chatContentProcessor.getItemContent(item);
                if (content) {
                    parts.push(content);

                    // 计算这个正文条目的楼层
                    const chat = chatContentProcessor.getChat();
                    const chatLength = chat.length;
                    const floors = chatContentProcessor.calculateFloors(
                        item.rangeConfig,
                        chatLength,
                        item.excludeUser,
                        chat
                    );
                    allFloors.push(...floors);
                }
            }
        }

        // 计算楼层范围字符串
        let floorRange = '';
        if (allFloors.length > 0) {
            const uniqueFloors = [...new Set(allFloors)].sort((a, b) => a - b);
            const min = Math.min(...uniqueFloors);
            const max = Math.max(...uniqueFloors);

            if (min === max) {
                floorRange = String(min);
            } else {
                floorRange = `${min}-${max}`;
            }
        } else {
            // 没有正文条目，使用当前楼层
            floorRange = String(context.lastMessageId);
        }

        return { prompt: parts.join('\n'), floorRange };
    }

    /**
     * 获取变量内容回调（用于宏处理器）
     * @private
     * @returns {Function}
     */
    _getVariableContentCallback() {
        return async (name, ranges, context) => {
            const variableManager = getVariableManagerV2();
            const variable = variableManager.getDefinitionByName(name);
            if (!variable) return '';

            if (variable.mode === 'stack') {
                // 叠加模式：根据范围获取条目
                const value = await variableManager.getStackValue(variable.id, context.chatId);
                const macroProcessor = getMacroProcessor();
                const contents = macroProcessor.extractEntriesByRanges(value.entries, ranges);
                return contents.join('\n\n');
            } else {
                // 覆盖模式：返回当前值
                const value = await variableManager.getReplaceValue(variable.id, context.chatId);
                return value.currentValue;
            }
        };
    }

    /**
     * 调用 API
     * @private
     * @param {string} prompt
     * @param {AbortSignal} [signal]
     * @returns {Promise<string|null>}
     */
    async _callAPI(prompt, signal) {
        try {
            // 构建消息
            const messages = [
                { role: 'user', content: prompt }
            ];

            // ✅ 使用 VariableAPI 管理器调用 API（支持自定义配置）
            const api = getVariableAPI();
            const response = await api.sendToAI(messages, { signal });

            // sendToAI 返回 { text, metadata }，提取 text
            return response?.text || null;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            logger.error('[VariableAnalyzerV2] API 调用失败:', error.message);
            return null;
        }
    }

    // ========================================
    // 控制方法
    // ========================================

    /**
     * 中止分析
     */
    abort() {
        if (this._abortController) {
            this._abortController.abort();
        }
    }

    /**
     * 是否正在分析
     * @returns {boolean}
     */
    isAnalyzing() {
        return this._isAnalyzing;
    }

    /**
     * 获取最后一次 AI 返回
     * @returns {string|null}
     */
    getLastResponse() {
        return this.lastResponse;
    }

    /**
     * 获取最后一次解析结果
     * @returns {ParsedContent[]|null}
     */
    getLastParsedResults() {
        return this.lastParsedResults;
    }

    /**
     * 获取最后一次分析时的楼层范围
     * @returns {string|null}
     */
    getLastFloorRange() {
        return this._lastFloorRange;
    }

    /**
     * 解析并应用返回内容（用于重新应用编辑后的内容）
     * @async
     * @param {string} content - 要解析的内容
     * @param {string} suiteId - 套装 ID
     * @returns {Promise<{success: boolean, applied: number, error?: string}>}
     */
    async parseAndApply(content, suiteId) {
        try {
            const suiteManager = getSuiteManager();
            const variableManager = getVariableManagerV2();
            const tagParser = getTagParser();
            const ctx = getContext();

            const chatId = ctx?.chatId;
            if (!chatId) {
                return { success: false, applied: 0, error: '没有活跃的聊天' };
            }

            const chat = ctx?.chat || [];

            // 获取启用的变量
            const enabledVariableIds = suiteManager.getEnabledVariableIds(suiteId);
            const enabledVariables = enabledVariableIds
                .map(id => variableManager.getDefinition(id))
                .filter(v => v !== null);

            if (enabledVariables.length === 0) {
                return { success: false, applied: 0, error: '没有启用的变量' };
            }

            // 解析内容
            const parsedResults = tagParser.parse(content, enabledVariables);

            if (parsedResults.length === 0) {
                return { success: true, applied: 0 };
            }

            // 使用上次分析时保存的楼层范围，如果没有则使用当前楼层
            const floorRange = this._lastFloorRange || String(chat.length);

            // 分配结果
            const assignResult = await this.assignResults(parsedResults, chatId, floorRange);

            // 更新缓存
            this.lastResponse = content;
            this.lastParsedResults = parsedResults;

            return { success: true, applied: assignResult.assigned };
        } catch (error) {
            logger.error('[VariableAnalyzerV2] parseAndApply 失败:', error.message);
            return { success: false, applied: 0, error: error.message };
        }
    }
}

// ============================================
// 导出单例
// ============================================

/** @type {VariableAnalyzerV2|null} */
let instance = null;

/**
 * 获取 VariableAnalyzerV2 单例
 * @returns {VariableAnalyzerV2}
 */
export function getVariableAnalyzerV2() {
    if (!instance) {
        instance = new VariableAnalyzerV2();
    }
    return instance;
}

/**
 * 重置单例
 */
export function resetVariableAnalyzerV2() {
    if (instance) {
        instance.abort();
    }
    instance = null;
}

export default VariableAnalyzerV2;
