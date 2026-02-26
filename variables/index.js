/**
 * 动态变量系统 - 模块入口
 *
 * @description
 * 统一导出所有模块，提供初始化和销毁接口
 * - 支持套装、条目列表、选择性引用等高级功能
 *
 */

import logger from '../logger.js';
import { eventSource, event_types, getRequestHeaders } from '../../../../../script.js';

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
import { initBranchInherit, destroyBranchInherit } from './branch-inherit-manager.js';

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

// 聊天列表变量标识的 MutationObserver
let chatListObserver = null;

/**
 * 检查单个聊天是否有变量文件
 * @param {string} chatId - 聊天ID
 * @returns {Promise<boolean>} 是否存在变量文件
 */
async function checkChatHasVariables(chatId) {
    try {
        const filename = variableStorage.getValuesFilename(chatId);
        const response = await fetch(`/user/files/${filename}`, {
            method: 'HEAD',  // 只获取响应头，不下载内容
            headers: getRequestHeaders()
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

/**
 * 为聊天列表项添加变量标识图标
 * @param {JQuery} chatBlock - 聊天列表项的 jQuery 对象
 * @param {string} chatId - 聊天ID
 */
async function addVariableIndicator(chatBlock, chatId) {
    const hasVariables = await checkChatHasVariables(chatId);
    if (hasVariables) {
        chatBlock.find('.chat_variables_indicator').css('display', 'inline');
    }
}

/**
 * 批量检查聊天列表中的变量标识
 */
async function updateChatListIndicators() {
    const chatBlocks = $('#select_chat_div .select_chat_block_wrapper');
    if (chatBlocks.length === 0) return;

    logger.debug('variable', `[Variables] 开始检查 ${chatBlocks.length} 个聊天的变量标识`);

    // 批量异步检查，但渐进式显示（不阻塞UI）
    const promises = [];
    chatBlocks.each((index, element) => {
        const $wrapper = $(element);
        const chatId = $wrapper.find('.select_chat_block').attr('file_name');
        if (chatId) {
            promises.push(addVariableIndicator($wrapper, chatId));
        }
    });

    await Promise.all(promises);
    logger.debug('variable', '[Variables] 变量标识检查完成');
}

/**
 * 初始化聊天列表变量标识监听
 */
function initChatListIndicators() {
    // 监听聊天列表容器的子元素变化
    const targetNode = document.getElementById('select_chat_div');
    if (!targetNode) {
        logger.warn('variable', '[Variables] 未找到聊天列表容器 #select_chat_div');
        return;
    }

    chatListObserver = new MutationObserver((mutations) => {
        // 检查是否有子元素添加
        const hasAddedNodes = mutations.some(mutation => mutation.addedNodes.length > 0);
        if (hasAddedNodes) {
            // 使用防抖延迟检查（等待列表渲染完成）
            setTimeout(() => updateChatListIndicators(), 100);
        }
    });

    chatListObserver.observe(targetNode, {
        childList: true,  // 监听子元素变化
        subtree: false    // 不监听更深层级
    });

    logger.debug('variable', '[Variables] 聊天列表变量标识监听已启动');
}

/**
 * 销毁聊天列表变量标识监听
 */
function destroyChatListIndicators() {
    if (chatListObserver) {
        chatListObserver.disconnect();
        chatListObserver = null;
        logger.debug('variable', '[Variables] 聊天列表变量标识监听已停止');
    }
}

/**
 * 聊天删除事件处理（自动清理对应的变量文件）
 * 
 * @async
 * @param {string} chatId - 被删除的聊天ID
 */
async function onChatDeleted(chatId) {
    if (!chatId) {
        logger.warn('variable', '[Variables] 聊天删除事件缺少chatId，跳过清理');
        return;
    }

    logger.info('variable', '[Variables] 检测到聊天删除，开始清理变量文件:', chatId);

    try {
        // 构造变量文件名（使用与保存时相同的清理规则）
        const filename = variableStorage.getValuesFilename(chatId);

        // 调用 SillyTavern 文件删除 API（POST /api/files/delete）
        const response = await fetch('/api/files/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: `user/files/${filename}` })
        });

        if (response.ok) {
            logger.info('variable', '[Variables] 变量文件已删除:', filename);
            // 清理该聊天的缓存（直接删除缓存中的条目）
            variableStorage.clearChatCache(chatId);
        } else if (response.status === 404) {
            logger.debug('variable', '[Variables] 变量文件不存在（该聊天可能没有变量数据）:', filename);
        } else {
            logger.warn('variable', '[Variables] 删除变量文件失败:', response.status, filename);
        }
    } catch (error) {
        // 静默处理错误，不影响聊天删除流程
        logger.error('variable', '[Variables] 清理变量文件时发生错误:', error.message);
    }
}

/**
 * 初始化动态变量系统
 * @async
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function initVariables() {
    if (initialized) {
        logger.debug('variable', '[Variables] 已初始化，跳过');
        return { success: true };
    }

    logger.info('variable', '[Variables] 开始初始化...');

    try {
        // 1. 加载存储数据
        const data = await variableStorage.loadStorageV2();
        logger.debug('variable', '[Variables] 存储数据已加载');

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

        // 7. 初始化分支继承监听
        initBranchInherit();

        // 8. 监听聊天删除事件，自动清理对应的变量文件
        eventSource.on(event_types.CHAT_DELETED, onChatDeleted);
        eventSource.on(event_types.GROUP_CHAT_DELETED, onChatDeleted);

        // 9. 初始化聊天列表变量标识
        initChatListIndicators();

        initialized = true;
        logger.info('variable', '[Variables] 初始化完成');
        return { success: true };

    } catch (error) {
        logger.error('variable', '[Variables] 初始化失败:', error.message || error);
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

    logger.info('variable', '[Variables] 开始销毁...');

    // 移除聊天删除事件监听
    eventSource.removeListener(event_types.CHAT_DELETED, onChatDeleted);
    eventSource.removeListener(event_types.GROUP_CHAT_DELETED, onChatDeleted);

    // 销毁聊天列表变量标识监听
    destroyChatListIndicators();

    // 销毁分支继承监听
    destroyBranchInherit();

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
    logger.info('variable', '[Variables] 销毁完成');
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
