/**
 * 监听器中心 - 统一管理所有事件监听器
 * 
 * @description
 * 设计理念（参考回退管理器）：
 * 1. 单一入口：所有监听器通过这里注册
 * 2. 自动清理：页面关闭时自动销毁，防止内存泄漏
 * 3. 分类管理：按页面分组，一键清理某页面的所有监听器
 * 4. 错误隔离：监听器出错不影响其他监听器
 * 5. 调试友好：统一日志，知道谁绑定了什么
 * 
 * @module phone/utils/listener-manager
 */

import logger from '../../../logger.js';

/**
 * 监听器注册表（按页面分组存储）
 * 结构：
 * {
 *   'message-chat': {
 *     listeners: [
 *       { eventName: 'emoji-data-changed', handler: fn, element: document },
 *       ...
 *     ],
 *     isDestroyed: false
 *   },
 *   ...
 * }
 */
const listenerRegistry = new Map();

/**
 * 全局监听器统计（用于调试）
 */
const stats = {
    totalRegistered: 0,    // 总注册数
    totalCleaned: 0,       // 总清理数
    activePages: 0,        // 活跃页面数
};

// ============ 核心功能 ============

/**
 * 注册监听器（单个）
 * 
 * @param {string} pageId - 页面标识（如 'message-chat', 'contact-list'）
 * @param {string} eventName - 事件名
 * @param {Function} handler - 事件处理函数
 * @param {Object} options - 可选配置
 * @param {Element} options.element - 监听的元素（默认document）
 * @param {string} options.description - 监听器描述（用于调试）
 * @param {boolean} options.once - 是否只触发一次
 * @returns {boolean} 是否注册成功
 * 
 * @example
 * registerListener('message-chat', 'emoji-data-changed', handleEmojiChange, {
 *   description: '刷新表情选择器'
 * });
 */
export function registerListener(pageId, eventName, handler, options = {}) {
    const {
        element = document,
        description = '',
        once = false,
    } = options;

    // 参数校验
    if (!pageId || !eventName || typeof handler !== 'function') {
        logger.error('phone','[ListenerManager] 注册失败：参数无效', { pageId, eventName, handler });
        return false;
    }

    // 获取或创建页面注册组
    if (!listenerRegistry.has(pageId)) {
        listenerRegistry.set(pageId, {
            listeners: [],
            isDestroyed: false,
        });
        stats.activePages++;
        logger.debug('phone',`[ListenerManager] 创建页面组: ${pageId}`);
    }

    const pageGroup = listenerRegistry.get(pageId);

    // 检查是否已销毁
    if (pageGroup.isDestroyed) {
        logger.warn('phone',`[ListenerManager] 页面 ${pageId} 已销毁，无法注册监听器`);
        return false;
    }

    // 包装处理函数（错误隔离）
    const wrappedHandler = (event) => {
        try {
            handler(event);
        } catch (error) {
            logger.error('phone',`[ListenerManager] 监听器执行出错`, {
                pageId,
                eventName,
                description,
                error: error.message || error,
            });
            // 错误不向外抛出，避免影响其他监听器
        }
    };

    // 如果是once模式，包装自动清理逻辑
    const finalHandler = once ? (event) => {
        wrappedHandler(event);
        unregisterListener(pageId, eventName, handler);
    } : wrappedHandler;

    // 绑定监听器
    element.addEventListener(eventName, finalHandler);

    // 记录到注册表
    pageGroup.listeners.push({
        eventName,
        handler,           // 保存原始handler用于后续移除
        wrappedHandler: finalHandler,
        element,
        description,
        registeredAt: new Date().toISOString(),
    });

    stats.totalRegistered++;

    logger.debug('phone',`[ListenerManager] 已注册监听器`, {
        pageId,
        eventName,
        description,
        总监听器数: pageGroup.listeners.length,
    });

    return true;
}

/**
 * 批量注册监听器（推荐使用）
 * 
 * @param {string} pageId - 页面标识
 * @param {Array<Object>} listeners - 监听器配置数组
 * 
 * @example
 * registerListeners('message-chat', [
 *   { eventName: 'emoji-data-changed', handler: handleEmoji, description: '刷新表情' },
 *   { eventName: 'phone-message-quote', handler: handleQuote, description: '显示引用' },
 * ]);
 */
export function registerListeners(pageId, listeners) {
    if (!Array.isArray(listeners)) {
        logger.error('phone','[ListenerManager] 批量注册失败：listeners必须是数组');
        return false;
    }

    logger.info('phone',`[ListenerManager] 开始批量注册，页面: ${pageId}, 数量: ${listeners.length}`);

    let successCount = 0;
    for (const config of listeners) {
        const { eventName, handler, ...options } = config;
        if (registerListener(pageId, eventName, handler, options)) {
            successCount++;
        }
    }

    logger.info('phone',`[ListenerManager] 批量注册完成: ${successCount}/${listeners.length} 成功`);
    return successCount === listeners.length;
}

/**
 * 移除单个监听器
 * 
 * @param {string} pageId - 页面标识
 * @param {string} eventName - 事件名
 * @param {Function} handler - 原始处理函数
 * @returns {boolean} 是否移除成功
 */
export function unregisterListener(pageId, eventName, handler) {
    const pageGroup = listenerRegistry.get(pageId);
    if (!pageGroup) {
        logger.warn('phone',`[ListenerManager] 移除失败：页面 ${pageId} 不存在`);
        return false;
    }

    const index = pageGroup.listeners.findIndex(
        (l) => l.eventName === eventName && l.handler === handler
    );

    if (index === -1) {
        logger.warn('phone',`[ListenerManager] 移除失败：监听器未找到`, { pageId, eventName });
        return false;
    }

    const listener = pageGroup.listeners[index];
    listener.element.removeEventListener(eventName, listener.wrappedHandler);
    pageGroup.listeners.splice(index, 1);
    stats.totalCleaned++;

    logger.debug('phone',`[ListenerManager] 已移除监听器`, { pageId, eventName });
    return true;
}

/**
 * 清理页面所有监听器（页面关闭时调用）
 * 
 * @param {string} pageId - 页面标识
 * @returns {number} 清理的监听器数量
 * 
 * @example
 * // 在页面关闭时调用
 * destroyPageListeners('message-chat');
 */
export function destroyPageListeners(pageId) {
    const pageGroup = listenerRegistry.get(pageId);
    if (!pageGroup) {
        logger.warn('phone',`[ListenerManager] 清理失败：页面 ${pageId} 不存在`);
        return 0;
    }

    if (pageGroup.isDestroyed) {
        logger.warn('phone',`[ListenerManager] 页面 ${pageId} 已清理过`);
        return 0;
    }

    const count = pageGroup.listeners.length;

    // 移除所有监听器
    for (const listener of pageGroup.listeners) {
        listener.element.removeEventListener(listener.eventName, listener.wrappedHandler);
    }

    pageGroup.listeners = [];
    pageGroup.isDestroyed = true;
    stats.totalCleaned += count;
    stats.activePages--;

    logger.info('phone',`[ListenerManager] 已清理页面 ${pageId}，共 ${count} 个监听器`);

    // 从注册表删除
    listenerRegistry.delete(pageId);

    return count;
}

/**
 * 清理所有监听器（调试或重置时使用）
 * 
 * @returns {number} 清理的总数
 */
export function destroyAllListeners() {
    let totalCount = 0;
    for (const pageId of listenerRegistry.keys()) {
        totalCount += destroyPageListeners(pageId);
    }
    logger.warn('phone',`[ListenerManager] 已清理所有监听器，共 ${totalCount} 个`);
    return totalCount;
}

// ============ 高级功能：页面生命周期管理 ============

/**
 * 创建页面监听器管理器（推荐使用！）
 * 
 * @description
 * 自动管理页面监听器的生命周期：
 * 1. 页面创建时批量注册
 * 2. 页面移除时自动清理
 * 
 * @param {string} pageId - 页面标识
 * @param {Element} pageElement - 页面根元素
 * @param {Array<Object>} listeners - 监听器配置
 * @returns {Object} 管理器对象
 * 
 * @example
 * const chatPage = createPageListenerManager(
 *   'message-chat',
 *   document.getElementById('phone-message-chat'),
 *   [
 *     { eventName: 'emoji-data-changed', handler: handleEmoji, description: '刷新表情' },
 *     { eventName: 'phone-message-quote', handler: handleQuote, description: '显示引用' },
 *   ]
 * );
 * 
 * // 页面会在被移除时自动清理监听器
 */
export function createPageListenerManager(pageId, pageElement, listeners) {
    if (!pageElement) {
        logger.error('phone','[ListenerManager] 创建管理器失败：pageElement为空');
        return null;
    }

    // 批量注册监听器
    registerListeners(pageId, listeners);

    // 监听页面元素被移除
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
                if (node === pageElement) {
                    logger.debug('phone',`[ListenerManager] 检测到页面 ${pageId} 被移除，自动清理`);
                    destroyPageListeners(pageId);
                    observer.disconnect();
                    return;
                }
            }
        }
    });

    // 监听父节点的子节点变化
    if (pageElement.parentNode) {
        observer.observe(pageElement.parentNode, { childList: true });
    }

    return {
        pageId,
        destroy: () => destroyPageListeners(pageId),
        addListener: (eventName, handler, options) => 
            registerListener(pageId, eventName, handler, options),
    };
}

// ============ 调试和统计 ============

/**
 * 获取监听器统计信息
 * @returns {Object} 统计数据
 */
export function getStats() {
    return {
        ...stats,
        pages: Array.from(listenerRegistry.keys()),
        details: Array.from(listenerRegistry.entries()).map(([pageId, group]) => ({
            pageId,
            listenerCount: group.listeners.length,
            isDestroyed: group.isDestroyed,
        })),
    };
}

/**
 * 打印监听器清单（调试用）
 */
export function printListeners() {
    logger.debug('phone', '=== 监听器中心状态 ===');
    logger.debug('phone', '统计:', stats);
    logger.debug('phone', '\n页面详情:');
    
    for (const [pageId, group] of listenerRegistry.entries()) {
        logger.debug('phone', `\n📄 ${pageId} (${group.listeners.length}个监听器)`);
        group.listeners.forEach((l, i) => {
            logger.debug('phone', `  ${i + 1}. ${l.eventName} - ${l.description || '(无描述)'}`);
        });
    }
}

/**
 * 获取某个事件的所有监听者（用于调试）
 * @param {string} eventName - 事件名
 * @returns {Array} 监听者列表
 */
export function getListenersByEvent(eventName) {
    const result = [];
    for (const [pageId, group] of listenerRegistry.entries()) {
        const listeners = group.listeners.filter(l => l.eventName === eventName);
        if (listeners.length > 0) {
            result.push({
                pageId,
                listeners: listeners.map(l => ({
                    description: l.description,
                    registeredAt: l.registeredAt,
                })),
            });
        }
    }
    return result;
}

// ============ 导出默认实例 ============

export default {
    registerListener,
    registerListeners,
    unregisterListener,
    destroyPageListeners,
    destroyAllListeners,
    createPageListenerManager,
    getStats,
    printListeners,
    getListenersByEvent,
};
