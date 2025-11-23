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
  friendRequests: [],
  /** @type {Array<Object>} 用户个签操作记录 */
  signatureActions: []
};

/**
 * 添加待发送消息（统一对象接口）
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} message - 消息对象
 * @param {string} message.id - 消息ID
 * @param {string} message.sender - 发送者（'user' | 'character'）
 * @param {string} message.type - 消息类型（'text' | 'emoji' | 'image' | 'poke' | 'quote' | 'link' | ...）
 * @param {number} message.time - 时间戳（秒）
 * @param {string} message.content - 显示内容（用于文本显示）
 * 
 * @description
 * 支持的消息类型及其特定字段：
 * - text: 普通文字消息，只需基础字段
 * - emoji: 表情消息，额外字段: emojiName（表情包名称，冗余存储）
 * - image: 图片消息，额外字段: imageUrl, imageRound, description
 * - poke: 戳一戳消息，只需基础字段
 * - quote: 引用消息，额外字段: quotedMessage, replyContent
 * - link: 链接消息（未来扩展），额外字段: linkUrl, linkTitle, linkDescription, linkImage, needAIFetch
 * 
 * @example
 * // 文字消息
 * addPendingMessage(contactId, {
 *   id: 'msg_123',
 *   sender: 'user',
 *   type: 'text',
 *   time: 1763365585,
 *   content: '你好'
 * });
 * 
 * // 图片消息
 * addPendingMessage(contactId, {
 *   id: 'msg_125',
 *   sender: 'user',
 *   type: 'image',
 *   time: 1763365587,
 *   content: '[图片]截图|/user/files/xxx.webp',
 *   imageUrl: '/user/files/xxx.webp',
 *   imageRound: 3,
 *   description: '截图'
 * });
 */
export function addPendingMessage(contactId, message) {
  if (!pendingOperations.messages[contactId]) {
    pendingOperations.messages[contactId] = [];
  }

  // ✅ 直接存储完整对象
  pendingOperations.messages[contactId].push(message);

  logger.debug('[PendingOps] 添加待发送消息:', 
    contactId,
    'Type:', message.type,
    'ID:', message.id?.substring(0, 20),
    'Content:', message.content?.substring(0, 20)
  );
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
    friendRequests: [...pendingOperations.friendRequests],
    signatureActions: [...pendingOperations.signatureActions]
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
  pendingOperations.signatureActions = [];
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

/**
 * 添加用户个签操作记录
 * @param {string} actionType - 操作类型（'update'=修改自己个签, 'like'=点赞角色个签, 'comment'=评论角色个签）
 * @param {Object} data - 操作数据
 * @param {string} [data.contactId] - 角色ID（点赞/评论时必需）
 * @param {string} [data.contactName] - 角色名（点赞/评论时必需）
 * @param {string} [data.signature] - 个签内容（修改自己个签时必需）
 * @param {string} [data.comment] - 评论内容（评论时必需）
 * @param {number} data.time - 时间戳（秒）
 */
export function addSignatureAction(actionType, data) {
  pendingOperations.signatureActions.push({
    actionType,
    ...data,
    timestamp: Date.now()
  });

  logger.debug('[PendingOps] 添加个签操作记录:', actionType, data);
}

/**
 * 获取所有个签操作记录
 * @returns {Array<Object>} 个签操作列表
 */
export function getSignatureActions() {
  return pendingOperations.signatureActions;
}

/**
 * 清空个签操作记录
 */
export function clearSignatureActions() {
  pendingOperations.signatureActions = [];
  logger.debug('[PendingOps] 清空个签操作记录');
}

/**
 * 恢复个签操作记录（从快照恢复，用于重roll）
 * @param {Array<Object>} actions - 个签操作列表
 */
export function restoreSignatureActions(actions) {
  pendingOperations.signatureActions = [...actions];
  logger.debug('[PendingOps] 恢复个签操作记录，共', actions.length, '条');
}

