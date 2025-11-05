/**
 * 待处理操作队列管理器
 * @module phone/ai-integration/pending-operations
 * 
 * @description
 * 管理所有待发送的操作（消息、说说、好友申请等）
 * 支持多联系人结构，方便后续扩展
 */

import logger from '../../../logger.js';

/**
 * 待处理操作队列
 * @private
 */
const pendingOperations = {
    /** @type {Object<string, Array<Object>>} 联系人ID → 消息列表 */
    messages: {},
    /** @type {Array<Object>} 待发布的说说 */
    moments: [],
    /** @type {Array<Object>} 待处理的好友申请 */
    friendRequests: []
};

/**
 * 添加待发送消息
 * @param {string} contactId - 联系人ID
 * @param {string} content - 消息内容
 * @param {number} time - 时间戳（秒）
 */
export function addPendingMessage(contactId, content, time) {
    if (!pendingOperations.messages[contactId]) {
        pendingOperations.messages[contactId] = [];
    }

    pendingOperations.messages[contactId].push({
        content,
        time,
        type: 'text'
    });

    logger.debug('[PendingOps] 添加待发送消息:', contactId, content.substring(0, 20));
}

/**
 * 获取指定联系人的待发送消息
 * @param {string} contactId - 联系人ID
 * @returns {Array<Object>} 消息列表
 */
export function getPendingMessages(contactId) {
    return pendingOperations.messages[contactId] || [];
}

/**
 * 获取所有待处理操作
 * @returns {Object} 完整的待处理操作对象
 */
export function getAllPendingOperations() {
    return {
        messages: { ...pendingOperations.messages },
        moments: [...pendingOperations.moments],
        friendRequests: [...pendingOperations.friendRequests]
    };
}

/**
 * 清空指定联系人的待发送消息
 * @param {string} contactId - 联系人ID
 */
export function clearPendingMessages(contactId) {
    if (pendingOperations.messages[contactId]) {
        delete pendingOperations.messages[contactId];
        logger.debug('[PendingOps] 清空待发送消息:', contactId);
    }
}

/**
 * 清空所有待处理操作
 */
export function clearAllPendingOperations() {
    pendingOperations.messages = {};
    pendingOperations.moments = [];
    pendingOperations.friendRequests = [];
    logger.debug('[PendingOps] 清空所有待处理操作');
}

/**
 * 检查是否有待处理操作
 * @returns {boolean} 是否有待处理操作
 */
export function hasPendingOperations() {
    const hasMessages = Object.keys(pendingOperations.messages).length > 0;
    const hasMoments = pendingOperations.moments.length > 0;
    const hasRequests = pendingOperations.friendRequests.length > 0;

    return hasMessages || hasMoments || hasRequests;
}

/**
 * 获取待处理消息的联系人ID列表
 * @returns {Array<string>} 联系人ID列表
 */
export function getPendingContactIds() {
    return Object.keys(pendingOperations.messages);
}

