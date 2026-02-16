/**
 * 约定计划剧情要点回退处理器
 * @module phone/plans/plan-story-rollback-handler
 *
 * @description
 * 注册约定计划剧情消息的回退逻辑到统一回退管理器
 * 当重roll时，自动删除被回退的计划剧情消息对应的要点记录
 *
 * 回退逻辑：
 * - 查找被删除消息中的计划剧情消息（[约定计划过程/内心印象/过程记录]）
 * - 删除对应的要点记录
 * - 触发计划数据变化事件
 */

import logger from '../../../logger.js';
import { registerRollbackHandler } from '../messages/message-rollback-manager.js';
import { getCompletedPlans, deletePlanNote } from './plan-data.js';
import { parsePlanStoryMessage } from '../messages/message-types/plan-story-message.js';
import { stateManager } from '../utils/state-manager.js';
import { extension_settings } from '../../../../../../extensions.js';

/**
 * 根据剧情类型获取要点类型
 * @param {string} storyType - 剧情类型（'plan-story-process' | 'plan-story-thought' | 'plan-story-record'）
 * @returns {string} 要点类型（'process' | 'innerThought' | 'record'）
 */
function getNoteType(storyType) {
    const typeMap = {
        'plan-story-process': 'process',
        'plan-story-thought': 'innerThought',
        'plan-story-record': 'record'
    };
    return typeMap[storyType] || 'process';
}

/**
 * 初始化约定计划剧情要点回退处理器
 *
 * @description
 * 在扩展初始化时调用，注册回退逻辑
 * 当重roll删除AI消息时，自动删除对应的计划剧情要点记录
 * 通过状态管理器（stateManager）通知所有订阅者数据变化，自动刷新UI
 *
 * @async
 */
export function initPlanStoryRollbackHandler() {
    registerRollbackHandler({
        name: '约定计划剧情要点',
        priority: 15, // 优先级中等（在计划回退之后，但在一般消息之前）
        rollback: async (contactId, deletedMessages, deletedMessageIds) => {
            logger.debug('phone','[PlanStoryRollback] 开始回退计划剧情要点');

            let deletedCount = 0;
            const deletedNotes = [];

            // 获取该联系人的已完成计划列表
            const completedPlans = getCompletedPlans(contactId);

            if (completedPlans.length === 0) {
                logger.debug('phone','[PlanStoryRollback] 没有已完成的计划，跳过');
                return;
            }

            // 遍历所有被删除的AI消息，查找计划剧情消息
            for (const aiMsg of deletedMessages) {
                const content = aiMsg.content || '';

                // 解析计划剧情消息
                const storyData = parsePlanStoryMessage(content);

                if (storyData) {
                    logger.debug('phone','[PlanStoryRollback] 发现计划剧情消息:', storyData.title, '消息ID:', aiMsg.id);

                    // 获取要点类型
                    const noteType = getNoteType(storyData.type);

                    // 查找最近的已完成计划（剧情消息通常关联最新的计划）
                    const latestPlan = completedPlans[completedPlans.length - 1];

                    if (latestPlan && latestPlan.notes) {
                        // 检查该计划是否有对应的要点记录
                        const noteField = getNoteField(noteType);
                        const hasNote = latestPlan.notes[noteField];

                        if (hasNote) {
                            logger.debug('phone','[PlanStoryRollback] 发现需要删除的要点:', {
                                planId: latestPlan.id,
                                planTitle: latestPlan.title,
                                noteType,
                                storyTitle: storyData.title
                            });

                            // 删除要点记录
                            deletePlanNote(contactId, latestPlan.id, noteType);
                            deletedCount++;
                            deletedNotes.push({
                                planTitle: latestPlan.title,
                                noteType: storyData.title
                            });
                        } else {
                            logger.debug('phone','[PlanStoryRollback] 该计划没有对应的要点记录，跳过');
                        }
                    } else {
                        logger.debug('phone','[PlanStoryRollback] 未找到关联的计划或计划无要点数据');
                    }
                }
            }

            if (deletedCount > 0) {
                logger.info('phone','[PlanStoryRollback] 共回退', deletedCount, '条计划要点');
                logger.debug('phone','[PlanStoryRollback] 删除的要点:', deletedNotes.map(n =>
                    `${n.planTitle}-${n.noteType}`
                ).join(', '));

                // 🔥 通过状态管理器通知订阅者（自动刷新UI）
                await stateManager.set('plans', extension_settings.acsusPawsPuffs.phone.plans, {
                    contactId,
                    action: 'rollback-notes',
                    count: deletedCount
                });
            } else {
                logger.debug('phone','[PlanStoryRollback] 没有需要回退的计划要点');
            }
        }
    });

    logger.info('phone','[PlanStoryRollback] 约定计划剧情要点回退处理器已初始化');
}

/**
 * 将要点类型转换为数据字段名
 * @param {string} noteType - 要点类型（'process' | 'innerThought' | 'record'）
 * @returns {string} 数据字段名（'notedProcess' | 'notedInnerThought' | 'notedRecord'）
 */
function getNoteField(noteType) {
    const fieldMap = {
        'process': 'notedProcess',
        'innerThought': 'notedInnerThought',
        'record': 'notedRecord'
    };
    return fieldMap[noteType] || 'notedProcess';
}


