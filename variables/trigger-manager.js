/**
 * 触发管理器 (Trigger Manager)
 *
 * @description
 * 管理各套装的触发逻辑，支持：
 * - 消息计数（间隔触发）
 * - 关键词检测
 * - 手动触发
 */

import logger from '../logger.js';
import { eventSource, event_types } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { getSuiteManager } from './suite-manager.js';
import { getSendQueueManager } from './send-queue-manager.js';
import * as storage from './variable-storage.js';
import { refreshVariableMacros, preloadAllVariableValues } from './global-macro-registry.js';

// ============================================
// 类型导入（仅用于 JSDoc）
// ============================================

/**
 * @typedef {import('./variable-types.js').PromptSuite} PromptSuite
 */

// ============================================
// TriggerManager 类
// ============================================

/**
 * 触发管理器类
 */
export class TriggerManager {
    constructor() {
        /** @type {Object<string, Object<string, number>>} 消息计数 {suiteId: {chatId: count}} */
        this.messageCounts = {};
        /** @type {boolean} */
        this.initialized = false;

        // 绑定事件处理器
        this._onMessageReceived = this._onMessageReceived.bind(this);
        this._onMessageSent = this._onMessageSent.bind(this);
        this._onChatChanged = this._onChatChanged.bind(this);
    }

    /**
     * 初始化
     * @param {Function} [_analyzeCallback] - 已废弃，保留参数兼容
     */
    async init(_analyzeCallback) {
        if (this.initialized) {
            logger.debug('variable', '[TriggerManager] 已初始化，跳过');
            return;
        }

        // 加载消息计数
        const settings = await storage.getSettingsV2();
        this.messageCounts = settings.messageCounts || {};

        // 注册事件监听
        eventSource.on(event_types.MESSAGE_RECEIVED, this._onMessageReceived);
        eventSource.on(event_types.MESSAGE_SENT, this._onMessageSent);
        eventSource.on(event_types.CHAT_CHANGED, this._onChatChanged);

        this.initialized = true;
        logger.info('variable', '[TriggerManager] 初始化完成');
    }

    /**
     * 销毁
     */
    destroy() {
        eventSource.off(event_types.MESSAGE_RECEIVED, this._onMessageReceived);
        eventSource.off(event_types.MESSAGE_SENT, this._onMessageSent);
        eventSource.off(event_types.CHAT_CHANGED, this._onChatChanged);

        this.abortAnalysis();
        this.initialized = false;
        logger.info('variable', '[TriggerManager] 已销毁');
    }

    // ========================================
    // 事件处理
    // ========================================

    /**
     * 处理收到消息
     * @private
     */
    async _onMessageReceived(messageIndex) {
        await this._handleNewMessage(messageIndex, 'received');
    }

    /**
     * 处理发送消息
     * @private
     */
    async _onMessageSent(messageIndex) {
        await this._handleNewMessage(messageIndex, 'sent');
    }

    /**
     * 处理新消息
     * @private
     * @param {number} messageIndex
     * @param {'received' | 'sent'} type
     */
    async _handleNewMessage(messageIndex, type) {
        const ctx = getContext();
        const chatId = ctx?.chatId;
        if (!chatId) return;

        const suiteManager = getSuiteManager();
        const suites = suiteManager.getSuites();

        // 获取最新消息内容（用于关键词检测）
        const chat = ctx?.chat || [];
        const latestMessage = chat[messageIndex];
        const messageContent = latestMessage?.mes || '';

        for (const suite of suites) {
            if (!suite.enabled) continue;

            const trigger = suite.trigger;

            if (trigger.type === 'interval') {
                // 间隔触发：计数
                await this._incrementCount(suite.id, chatId);
                const count = this.getCount(suite.id, chatId);
                const interval = trigger.interval || 5;

                if (count >= interval) {
                    logger.info('variable', '[TriggerManager] 间隔触发:', suite.name, '计数:', count);
                    await this.triggerAnalysis(suite.id, 'interval');
                    this.resetCount(suite.id, chatId);
                }
            } else if (trigger.type === 'keyword') {
                // 关键词触发
                if (this.checkKeywords(messageContent, suite)) {
                    logger.info('variable', '[TriggerManager] 关键词触发:', suite.name);
                    await this.triggerAnalysis(suite.id, 'keyword');
                }
            }
            // manual 类型不自动触发
        }
    }

    /**
     * 处理聊天切换
     * @private
     */
    async _onChatChanged() {
        // 聊天切换时不重置计数，计数是按 chatId 存储的
        logger.debug('variable', '[TriggerManager] 聊天已切换');

        // 刷新变量宏（因为之前的 chatId 是 undefined）
        await refreshVariableMacros();

        // 重新预加载当前聊天的变量值
        await preloadAllVariableValues();

        logger.debug('variable', '[TriggerManager] 变量宏已刷新，缓存已预加载');
    }

    // ========================================
    // 消息计数
    // ========================================

    /**
     * 增加计数
     * @private
     * @param {string} suiteId
     * @param {string} chatId
     */
    async _incrementCount(suiteId, chatId) {
        if (!this.messageCounts[suiteId]) {
            this.messageCounts[suiteId] = {};
        }
        if (!this.messageCounts[suiteId][chatId]) {
            this.messageCounts[suiteId][chatId] = 0;
        }
        this.messageCounts[suiteId][chatId]++;

        // 保存到存储
        await this._saveMessageCounts();
    }

    /**
     * 获取计数
     * @param {string} suiteId
     * @param {string} chatId
     * @returns {number}
     */
    getCount(suiteId, chatId) {
        return this.messageCounts[suiteId]?.[chatId] || 0;
    }

    /**
     * 重置计数
     * @param {string} suiteId
     * @param {string} chatId
     */
    async resetCount(suiteId, chatId) {
        if (this.messageCounts[suiteId]) {
            this.messageCounts[suiteId][chatId] = 0;
            await this._saveMessageCounts();
        }
    }

    /**
     * 保存消息计数
     * @private
     */
    async _saveMessageCounts() {
        const settings = await storage.getSettingsV2();
        settings.messageCounts = this.messageCounts;
        await storage.saveSettingsV2(settings);
    }

    // ========================================
    // 关键词检测
    // ========================================

    /**
     * 检查消息是否包含触发关键词
     * @param {string} message
     * @param {PromptSuite} suite
     * @returns {boolean}
     */
    checkKeywords(message, suite) {
        const keywords = suite.trigger.keywords || [];
        if (keywords.length === 0) return false;

        const lowerMessage = message.toLowerCase();
        return keywords.some(keyword =>
            lowerMessage.includes(keyword.toLowerCase())
        );
    }

    // ========================================
    // 触发分析（改为入队）
    // ========================================

    /**
     * 触发分析（将任务加入队列）
     * @param {string} suiteId
     * @param {'manual' | 'interval' | 'keyword'} [triggerType='manual'] - 触发类型
     * @returns {Promise<void>}
     */
    async triggerAnalysis(suiteId, triggerType = 'manual') {
        const suiteManager = getSuiteManager();
        const suite = suiteManager.getSuite(suiteId);

        if (!suite) {
            logger.warn('variable', '[TriggerManager] 套装不存在:', suiteId);
            return;
        }

        // 获取队列管理器
        const queueManager = getSendQueueManager();

        // 根据套装设置决定快照模式
        // 如果套装有 useSnapshotMode 设置，使用套装设置；否则使用队列全局设置
        if (suite.useSnapshotMode !== undefined) {
            queueManager.setSnapshotMode(suite.useSnapshotMode);
        }

        // 入队
        queueManager.enqueue(suiteId, suite.name, triggerType);
        logger.info('variable', '[TriggerManager] 任务已入队:', suite.name, '触发类型:', triggerType);
    }

    /**
     * 中止分析（中止队列中当前任务）
     */
    abortAnalysis() {
        const queueManager = getSendQueueManager();
        queueManager.abortCurrent();
    }

    /**
     * 是否正在分析
     * @returns {boolean}
     */
    isAnalyzing() {
        const queueManager = getSendQueueManager();
        return queueManager.isProcessing();
    }
}

// ============================================
// 导出单例
// ============================================

/** @type {TriggerManager|null} */
let instance = null;

/**
 * 获取 TriggerManager 单例
 * @returns {TriggerManager}
 */
export function getTriggerManager() {
    if (!instance) {
        instance = new TriggerManager();
    }
    return instance;
}

/**
 * 重置单例
 */
export function resetTriggerManager() {
    if (instance) {
        instance.destroy();
    }
    instance = null;
}

export default TriggerManager;
