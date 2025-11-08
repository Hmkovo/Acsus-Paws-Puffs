/**
 * 约定计划回退处理器
 * @module phone/plans/plan-rollback-handler
 * 
 * @description
 * 注册约定计划的回退逻辑到统一回退管理器
 * 当重roll时，自动删除被回退的计划消息对应的计划数据
 */

import logger from '../../../logger.js';
import { registerRollbackHandler } from '../messages/message-rollback-manager.js';
import { getPlanByMessageId, deletePlan } from './plan-data.js';

/**
 * 初始化约定计划回退处理器
 * 
 * @description
 * 在扩展初始化时调用，注册回退逻辑
 */
export function initPlanRollbackHandler() {
    registerRollbackHandler({
        name: '约定计划',
        priority: 10, // 优先级较高，尽早删除计划数据
        rollback: async (contactId, deletedMessages, deletedMessageIds) => {
            logger.debug('[PlanRollback] 开始回退约定计划');

            let deletedCount = 0;
            const deletedPlanTitles = [];

            // 遍历所有被删除的AI消息，查找约定计划消息
            for (const aiMsg of deletedMessages) {
                const content = aiMsg.content || '';

                // 检查是否是计划消息（包括发起、接受、拒绝）
                if (content.startsWith('[约定计划')) {
                    // 尝试找到对应的计划数据
                    const plan = getPlanByMessageId(contactId, aiMsg.id);

                    if (plan) {
                        // 删除计划数据
                        logger.debug('[PlanRollback] 发现需要删除的计划:', plan.title, 'ID:', plan.id, '消息ID:', aiMsg.id);
                        deletePlan(contactId, plan.id);
                        deletedCount++;
                        deletedPlanTitles.push(plan.title);
                    } else {
                        logger.debug('[PlanRollback] 消息无对应计划数据:', aiMsg.id, '内容:', content.substring(0, 50));
                    }
                }
            }

            if (deletedCount > 0) {
                logger.info('[PlanRollback] 共删除', deletedCount, '个计划:', deletedPlanTitles.join(', '));
            } else {
                logger.debug('[PlanRollback] 没有需要删除的计划');
            }
        }
    });

    logger.info('[PlanRollback] 约定计划回退处理器已初始化');
}

