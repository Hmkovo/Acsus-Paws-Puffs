/**
 * 约定计划数据管理
 * @module phone/plans/plan-data
 * 
 * @description
 * 管理约定计划的数据存储和状态
 * 职责：
 * - 计划的增删改查
 * - 状态管理（待响应、已接受、已拒绝、已完成）
 * - 数据持久化到 extension_settings
 */

import logger from '../../../logger.js';
import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';

/**
 * 确保计划数据结构存在
 * @private
 */
function ensurePlansData() {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.plans) {
    extension_settings.acsusPawsPuffs.phone.plans = {};
  }
}

/**
 * 获取联系人的所有计划
 * @param {string} contactId - 联系人ID
 * @returns {Array<Object>} 计划列表
 */
export function getPlans(contactId) {
  ensurePlansData();

  if (!extension_settings.acsusPawsPuffs.phone.plans[contactId]) {
    extension_settings.acsusPawsPuffs.phone.plans[contactId] = [];
  }

  return extension_settings.acsusPawsPuffs.phone.plans[contactId];
}

/**
 * 根据消息ID查找计划
 * @param {string} contactId - 联系人ID
 * @param {string} messageId - 消息ID
 * @returns {Object|null} 计划对象或null
 */
export function getPlanByMessageId(contactId, messageId) {
  const plans = getPlans(contactId);
  return plans.find(p => p.messageId === messageId) || null;
}

/**
 * 创建新计划
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} planData - 计划数据
 * @param {string} planData.messageId - 关联的消息ID
 * @param {string} planData.title - 计划标题
 * @param {string} planData.content - 计划内容
 * @param {string} planData.initiator - 发起者（'user' | 'char'）
 * @param {number} planData.timestamp - 创建时间戳
 * @returns {Object} 创建的计划对象
 */
export function createPlan(contactId, planData) {
  ensurePlansData();

  const plans = getPlans(contactId);

  // 创建计划对象
  const plan = {
    id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    messageId: planData.messageId,
    title: planData.title,
    content: planData.content,
    initiator: planData.initiator,
    status: 'pending', // pending待响应 / accepted已接受 / rejected已拒绝 / completed已完成
    timestamp: planData.timestamp,
    diceResult: null,
    outcome: null, // '顺利' | '麻烦' | '好事'
    story: null,
    storyGenerated: false, // 是否已生成剧情（避免重复提示）
    options: {
      includeInnerThought: false,
      includeRecord: false
    }
  };

  plans.push(plan);
  extension_settings.acsusPawsPuffs.phone.plans[contactId] = plans;
  saveSettingsDebounced();

  logger.info('[PlanData] 创建计划:', plan.title, 'ID:', plan.id);
  return plan;
}

/**
 * 更新计划状态
 * 
 * @param {string} contactId - 联系人ID
 * @param {string} planId - 计划ID
 * @param {string} status - 新状态（'pending' | 'accepted' | 'rejected' | 'completed'）
 * @returns {boolean} 是否成功
 */
export function updatePlanStatus(contactId, planId, status) {
  const plans = getPlans(contactId);
  const plan = plans.find(p => p.id === planId);

  if (!plan) {
    logger.warn('[PlanData] 未找到计划:', planId);
    return false;
  }

  plan.status = status;
  saveSettingsDebounced();

  logger.info('[PlanData] 更新计划状态:', plan.title, '→', status);
  return true;
}

/**
 * 更新计划执行结果
 * 
 * @param {string} contactId - 联系人ID
 * @param {string} planId - 计划ID
 * @param {Object} result - 执行结果
 * @param {number} result.diceResult - 骰子结果（1-100）
 * @param {string} result.outcome - 结果类型（'顺利' | '麻烦' | '好事'）
 * @param {string} result.story - 剧情梗概
 * @param {Object} [result.options] - 可选配置
 * @returns {boolean} 是否成功
 */
export function updatePlanResult(contactId, planId, result) {
  const plans = getPlans(contactId);
  const plan = plans.find(p => p.id === planId);

  if (!plan) {
    logger.warn('[PlanData] 未找到计划:', planId);
    return false;
  }

  plan.diceResult = result.diceResult;
  plan.outcome = result.outcome;
  plan.story = result.story;

  if (result.options) {
    plan.options = { ...plan.options, ...result.options };
  }

  plan.status = 'completed';
  saveSettingsDebounced();

  logger.info('[PlanData] 更新计划结果:', plan.title, '骰子:', plan.diceResult, '结果:', plan.outcome);
  return true;
}

/**
 * 删除计划
 * @param {string} contactId - 联系人ID
 * @param {string} planId - 计划ID
 * @returns {boolean} 是否成功
 */
export function deletePlan(contactId, planId) {
  ensurePlansData();

  const plans = getPlans(contactId);
  const index = plans.findIndex(p => p.id === planId);

  if (index === -1) {
    logger.warn('[PlanData] 未找到计划:', planId);
    return false;
  }

  const plan = plans[index];
  plans.splice(index, 1);
  extension_settings.acsusPawsPuffs.phone.plans[contactId] = plans;
  saveSettingsDebounced();

  logger.info('[PlanData] 删除计划:', plan.title);
  return true;
}

/**
 * 获取待响应的计划
 * @param {string} contactId - 联系人ID
 * @returns {Array<Object>} 待响应计划列表
 */
export function getPendingPlans(contactId) {
  const plans = getPlans(contactId);
  return plans.filter(p => p.status === 'pending' || p.status === 'accepted');
}

/**
 * 获取已完成的计划
 * @param {string} contactId - 联系人ID
 * @returns {Array<Object>} 已完成计划列表
 */
export function getCompletedPlans(contactId) {
  const plans = getPlans(contactId);
  return plans.filter(p => p.status === 'completed');
}

/**
 * 标记计划的剧情已生成
 * @param {string} contactId - 联系人ID
 * @param {string} planId - 计划ID
 * @param {boolean} generated - 是否已生成
 * @returns {boolean} 是否成功
 */
export function updatePlanStoryGenerated(contactId, planId, generated) {
  const plans = getPlans(contactId);
  const plan = plans.find(p => p.id === planId);

  if (!plan) {
    logger.warn('[PlanData] 未找到计划:', planId);
    return false;
  }

  plan.storyGenerated = generated;
  saveSettingsDebounced();

  logger.info('[PlanData] 更新剧情生成状态:', plan.title, '→', generated);
  return true;
}

