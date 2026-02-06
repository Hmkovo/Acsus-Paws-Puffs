/**
 * 动态变量系统 - 模块入口
 *
 * @description
 * 统一导出所有模块，提供初始化和销毁接口
 * - 支持套装、条目列表、选择性引用等高级功能
 *
 */

import logger from '../logger.js';

// 核心模块
import { getSuiteManager, resetSuiteManager } from './suite-manager.js';
import { getVariableManagerV2, resetVariableManagerV2 } from './variable-manager-v2.js';
import { getMacroProcessor, resetMacroProcessor } from './macro-processor.js';
import { getTagParser, resetTagParser } from './tag-parser.js';
import { getTriggerManager, resetTriggerManager } from './trigger-manager.js';
import { getVariableAnalyzerV2, resetVariableAnalyzerV2 } from './variable-analyzer-v2.js';
import { getChatContentProcessor, resetChatContentProcessor } from './chat-content-processor.js';
import { getSendQueueManager } from './send-queue-manager.js';
import { registerAllGlobalMacros } from './global-macro-registry.js';

// 存储模块
import * as variableStorage from './variable-storage.js';

// API 配置
import { VariableAPIConfig } from './variable-api-settings.js';

// UI 模块
import {
    renderVariableListPageV2,
    addExtensionsMenuButton,
    removeExtensionsMenuButton
} from './ui/variable-list-ui-v2.js';
import { openChatContentEditPopup, openRegexSettingsPopup } from './ui/chat-content-ui.js';

// ============================================
// 初始化
// ============================================

/** @type {boolean} */
let initialized = false;

/**
 * 初始化动态变量系统
 * @async
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function initVariables() {
    if (initialized) {
        logger.debug('[Variables] 已初始化，跳过');
        return { success: true };
    }

    logger.info('[Variables] 开始初始化...');

    try {
        // 1. 加载存储数据
        const data = await variableStorage.loadStorageV2();
        logger.debug('[Variables] 存储数据已加载');

        // 2. 初始化套装管理器
        const suiteManager = getSuiteManager(variableStorage.saveStorageV2Debounced);
        suiteManager.init(data.suites, data.settings.activeSuiteId);

        // 3. 初始化变量管理器
        const variableManager = getVariableManagerV2();
        await variableManager.init();

        // 4. 初始化宏处理器（设置变量内容获取回调）
        const macroProcessor = getMacroProcessor(async (name, ranges, context) => {
            const variable = variableManager.getDefinitionByName(name);
            if (!variable) return '';

            if (variable.mode === 'stack') {
                const value = await variableManager.getStackValue(variable.id, context.chatId);
                const contents = macroProcessor.extractEntriesByRanges(value.entries, ranges);
                return contents.join('\n\n');
            } else {
                const value = await variableManager.getReplaceValue(variable.id, context.chatId);
                return value.currentValue;
            }
        });

        // 5. 初始化触发管理器
        const triggerManager = getTriggerManager();
        await triggerManager.init(async (suiteId, signal) => {
            const analyzer = getVariableAnalyzerV2();
            return await analyzer.analyze(suiteId, signal);
        });

        // 6. 注册全局宏（让变量在酒馆任何地方可用）
        await registerAllGlobalMacros();

        initialized = true;
        logger.info('[Variables] 初始化完成');
        return { success: true };

    } catch (error) {
        logger.error('[Variables] 初始化失败:', error.message || error);
        return { success: false, error: error.message };
    }
}

/**
 * 渲染变量 UI（扩展栏设置页）
 * @param {HTMLElement} container - 容器元素
 */
export function renderVariablesUI(container) {
    renderVariableListPageV2(container);
}

/**
 * 检查是否已初始化
 * @returns {boolean}
 */
export function isInitialized() {
    return initialized;
}

/**
 * 销毁动态变量系统
 */
export function destroyVariables() {
    if (!initialized) return;

    logger.info('[Variables] 开始销毁...');

    // 销毁触发管理器
    resetTriggerManager();

    // 销毁分析器
    resetVariableAnalyzerV2();

    // 重置其他模块
    resetMacroProcessor();
    resetTagParser();
    resetVariableManagerV2();
    resetSuiteManager();

    // 清理存储缓存
    variableStorage.invalidateCacheV2();

    initialized = false;
    logger.info('[Variables] 销毁完成');
}

// ============================================
// 导出模块获取函数
// ============================================

export {
    getSuiteManager,
    getVariableManagerV2,
    getMacroProcessor,
    getTagParser,
    getTriggerManager,
    getVariableAnalyzerV2,
    getChatContentProcessor,
    getSendQueueManager,
    VariableAPIConfig,
    variableStorage
};

// 导出 UI 函数
export {
    renderVariableListPageV2,
    addExtensionsMenuButton,
    removeExtensionsMenuButton,
    openChatContentEditPopup,
    openRegexSettingsPopup
};

// ============================================
// 默认导出
// ============================================

export default {
    initVariables,
    renderVariablesUI,
    isInitialized,
    destroyVariables,
    getSuiteManager,
    getVariableManagerV2,
    getMacroProcessor,
    getTagParser,
    getTriggerManager,
    getVariableAnalyzerV2,
    getChatContentProcessor,
    getSendQueueManager,
    variableStorage,
    renderVariableListPageV2,
    addExtensionsMenuButton,
    removeExtensionsMenuButton,
    openChatContentEditPopup,
    openRegexSettingsPopup
};
