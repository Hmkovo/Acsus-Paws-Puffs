/**
 * 约定计划发送到酒馆
 * @module phone/plans/plan-tavern-sender
 * 
 * @description
 * 将已完成的计划发送到酒馆输入框
 * 职责：
 * - 构建计划剧情提示词
 * - 插入到酒馆输入框
 */

import logger from '../../../logger.js';
import { showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';

/**
 * 发送计划到酒馆
 * 
 * @param {Object} plan - 计划对象
 * @param {string} contactId - 联系人ID
 * @returns {Promise<void>}
 */
export async function sendPlanToTavern(plan, contactId) {
  logger.debug('[PlanTavernSender] 发送计划到酒馆:', plan.title);

  try {
    // 查找酒馆输入框
    const tavernTextarea = document.querySelector('#send_textarea');
    if (!tavernTextarea) {
      logger.warn('[PlanTavernSender] 未找到酒馆输入框');
      showErrorToast('未找到酒馆输入框，请先打开SillyTavern');
      return;
    }

    // 加载联系人信息
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);
    const contactName = contact ? getContactDisplayName(contact) : '角色';

    // 构建提示词
    const prompt = buildPlanPrompt(plan, contactName);

    // 插入到输入框
    tavernTextarea.value = prompt;
    tavernTextarea.focus();

    // 触发 input 事件（某些插件可能需要）
    tavernTextarea.dispatchEvent(new Event('input', { bubbles: true }));

    showSuccessToast('已发送到酒馆输入框，请自行发送');
    logger.info('[PlanTavernSender] ✅ 已发送到酒馆:', plan.title);
  } catch (error) {
    logger.error('[PlanTavernSender] 发送失败:', error);
    showErrorToast('发送失败');
  }
}

/**
 * 构建计划剧情提示词
 * 
 * @param {Object} plan - 计划对象
 * @param {string} contactName - 联系人名称
 * @returns {string} 提示词
 */
function buildPlanPrompt(plan, contactName) {
  const date = new Date(plan.timestamp);
  const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

  let prompt = `在${dateStr}，{{user}}和${contactName}一起${plan.title}。\n\n`;
  prompt += `过程结果：🎲 ${plan.diceResult} - ${plan.outcome}\n`;
  prompt += `${plan.story}\n\n`;
  prompt += `请详细描述这次经历的完整过程（200字左右）。`;

  if (plan.options?.includeInnerThought) {
    prompt += `\n\n同时请输出 [约定计划内心印象]，描述${contactName}对这次经历的内心感受。`;
  }

  if (plan.options?.includeRecord) {
    prompt += `\n\n同时请输出 [约定计划过程记录]，简要记录这次经历的关键事件。`;
  }

  return prompt;
}

