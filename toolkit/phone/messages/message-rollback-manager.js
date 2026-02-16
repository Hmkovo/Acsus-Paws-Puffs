/**
 * 统一快照回退管理器
 * @module phone/messages/message-rollback-manager
 * 
 * @description
 * 提供统一的快照回退机制，让各个模块（约定计划、个签、空间消息等）
 * 只需注册回退处理器，重roll时自动调用
 * 
 * 核心优势：
 * - 新功能只需注册处理器，不需要修改 message-debug-ui.js
 * - 统一的错误处理和日志记录
 * - 支持异步处理器
 * - 自动捕获异常，不影响其他模块
 */

import logger from '../../../logger.js';

/**
 * 回退处理器注册表
 * @type {Array<Object>}
 * @private
 */
const rollbackHandlers = [];

/**
 * 注册回退处理器
 * 
 * @description
 * 各个模块在初始化时调用此函数注册自己的回退逻辑
 * 
 * @param {Object} handler - 回退处理器配置
 * @param {string} handler.name - 处理器名称（用于日志）
 * @param {number} [handler.priority=50] - 优先级（数字越小越先执行，默认50）
 * @param {Function} handler.rollback - 回退函数，接收参数：(contactId, deletedMessages, deletedMessageIds)
 * @returns {void}
 * 
 * @example
 * // 在 plan-data.js 中注册
 * registerRollbackHandler({
 *   name: '约定计划',
 *   priority: 10,
 *   rollback: async (contactId, deletedMessages, deletedMessageIds) => {
 *     // 删除计划数据
 *     for (const msg of deletedMessages) {
 *       if (msg.content.startsWith('[约定计划')) {
 *         const plan = getPlanByMessageId(contactId, msg.id);
 *         if (plan) deletePlan(contactId, plan.id);
 *       }
 *     }
 *   }
 * });
 */
export function registerRollbackHandler(handler) {
  if (!handler || !handler.name || !handler.rollback) {
    logger.error('phone','[RollbackManager] 注册失败：缺少必需参数', handler);
    return;
  }

  if (typeof handler.rollback !== 'function') {
    logger.error('phone','[RollbackManager] 注册失败：rollback必须是函数', handler.name);
    return;
  }

  // 检查是否已注册（避免重复）
  const existing = rollbackHandlers.find(h => h.name === handler.name);
  if (existing) {
    logger.warn('phone','[RollbackManager] 处理器已存在，跳过注册:', handler.name);
    return;
  }

  // 设置默认优先级
  const priority = handler.priority !== undefined ? handler.priority : 50;

  rollbackHandlers.push({
    name: handler.name,
    priority,
    rollback: handler.rollback
  });

  // 按优先级排序（数字越小越先执行）
  rollbackHandlers.sort((a, b) => a.priority - b.priority);

  logger.info('phone','[RollbackManager] 已注册回退处理器:', handler.name, '优先级:', priority);
}

/**
 * 注销回退处理器
 * 
 * @param {string} name - 处理器名称
 * @returns {boolean} 是否成功
 */
export function unregisterRollbackHandler(name) {
  const index = rollbackHandlers.findIndex(h => h.name === name);
  if (index === -1) {
    logger.warn('phone','[RollbackManager] 处理器不存在，无法注销:', name);
    return false;
  }

  rollbackHandlers.splice(index, 1);
  logger.info('phone','[RollbackManager] 已注销回退处理器:', name);
  return true;
}

/**
 * 执行所有回退处理器
 * 
 * @description
 * 在重roll时调用，按优先级顺序执行所有注册的回退处理器
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Array<Object>} deletedMessages - 被删除的AI消息列表
 * @returns {Promise<Object>} 执行结果统计
 * 
 * @example
 * // 在 message-debug-ui.js 中调用
 * const result = await executeRollbackHandlers(contactId, afterAI);
 * logger.info('phone','回退完成:', result.success, '成功', result.failed, '失败');
 */
export async function executeRollbackHandlers(contactId, deletedMessages) {
  if (rollbackHandlers.length === 0) {
    logger.debug('phone','[RollbackManager] 没有注册的回退处理器');
    return { success: 0, failed: 0, total: 0 };
  }

  logger.info('phone','[RollbackManager] ========== 开始执行回退处理器 ==========');
  logger.info('phone','[RollbackManager] 联系人:', contactId);
  logger.info('phone','[RollbackManager] 被删除消息数:', deletedMessages.length);
  logger.info('phone','[RollbackManager] 注册的处理器数:', rollbackHandlers.length);

  const deletedMessageIds = deletedMessages.map(msg => msg.id);
  let successCount = 0;
  let failedCount = 0;

  // 按优先级顺序执行所有处理器
  for (const handler of rollbackHandlers) {
    try {
      logger.info('phone',`[RollbackManager] 执行: ${handler.name} (优先级: ${handler.priority})`);

      // 调用处理器（支持异步）
      await handler.rollback(contactId, deletedMessages, deletedMessageIds);

      logger.info('phone',`[RollbackManager] ✅ ${handler.name} 执行成功`);
      successCount++;
    } catch (error) {
      logger.error('phone',`[RollbackManager] ❌ ${handler.name} 执行失败:`, error);
      failedCount++;
      // 不中断，继续执行其他处理器
    }
  }

  logger.info('phone','[RollbackManager] ========== 回退处理器执行完成 ==========');
  logger.info('phone','[RollbackManager] 成功:', successCount, '失败:', failedCount, '总计:', rollbackHandlers.length);

  return {
    success: successCount,
    failed: failedCount,
    total: rollbackHandlers.length
  };
}

/**
 * 获取已注册的处理器列表（用于调试）
 * @returns {Array<Object>} 处理器列表
 */
export function getRegisteredHandlers() {
  return rollbackHandlers.map(h => ({
    name: h.name,
    priority: h.priority
  }));
}

/**
 * 清空所有处理器（用于测试）
 * @private
 */
export function clearAllHandlers() {
  const count = rollbackHandlers.length;
  rollbackHandlers.length = 0;
  logger.warn('phone','[RollbackManager] 已清空所有处理器，共', count, '个');
}

