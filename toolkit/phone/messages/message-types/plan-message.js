/**
 * 约定计划消息渲染器
 * @module phone/messages/message-types/plan-message
 * 
 * @description
 * 解析和渲染约定计划消息气泡
 * 职责：
 * - 解析 [约定计划] 格式
 * - 渲染计划气泡（带状态标签）
 * - 绑定点击事件（打开执行弹窗）
 */

import logger from '../../../../logger.js';
import { getThumbnailUrl } from '../../../../../../../../script.js';

/**
 * 解析计划消息格式
 * 
 * @param {string} content - 消息内容
 * @param {Object} message - 完整消息对象（用于检查 quotedPlanId）
 * @returns {Object|null} 解析结果 { type, title, accepter, isCompleted }
 * 
 * @description
 * 支持的格式：
 * - [约定计划]一起去吃卷饼
 * - [约定计划]Wade Wilson接受了约定计划（必须有 quotedPlanId 字段才显示特殊气泡）
 * - [约定计划已完成]一起去吃卷饼
 */
export function parsePlanMessage(content, message = {}) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // 已完成的计划
  const completedMatch = content.match(/^\[约定计划已完成\](.+)$/);
  if (completedMatch) {
    return {
      type: 'plan',
      title: completedMatch[1].trim(),
      isCompleted: true,
      accepter: null
    };
  }

  // 普通计划或接受/拒绝
  const planMatch = content.match(/^\[约定计划\](.+)$/);
  if (planMatch) {
    const planContent = planMatch[1].trim();

    // 检查是否是接受/拒绝格式
    const acceptMatch = planContent.match(/^(.+?)(接受|拒绝)了约定计划$/);
    if (acceptMatch) {
      // ⚠️ 只有通过引用格式（带 quotedPlanId）的响应才显示特殊气泡
      if (message.quotedPlanId) {
        logger.debug('phone','[PlanMessage] 检测到计划响应（有引用关联），显示特殊气泡');
        return {
          type: 'plan-response',
          accepter: acceptMatch[1].trim(),
          action: acceptMatch[2], // '接受' | '拒绝'
          isCompleted: false
        };
      } else {
        // 没有引用编号，降级为 null（会被当作普通文本显示）
        logger.warn('phone','[PlanMessage] 检测到计划响应格式但缺少引用关联（quotedPlanId），降级为普通文本');
        return null;
      }
    }

    // 普通计划发起
    return {
      type: 'plan',
      title: planContent,
      isCompleted: false,
      accepter: null
    };
  }

  return null;
}

/**
 * 检查消息是否是计划消息
 * @param {Object} message - 消息对象
 * @returns {boolean} 是否是计划消息
 */
export function isPlanMessage(message) {
  if (message.type === 'plan') return true;
  if (message.type !== 'text') return false;

  return parsePlanMessage(message.content, message) !== null;
}

/**
 * 渲染约定计划消息气泡
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.sender - 发送者（'user' | 'contact'）
 * @param {string} message.content - 消息内容
 * @param {string} message.id - 消息ID
 * @param {Object} contact - 联系人对象
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement} 消息气泡DOM元素
 */
export async function renderPlanMessage(message, contact, contactId) {
  logger.debug('phone','[PlanMessage] 渲染计划消息:', message.content, '是否有引用关联:', !!message.quotedPlanId);

  const planData = parsePlanMessage(message.content, message);
  if (!planData) {
    logger.warn('phone','[PlanMessage] 无法解析计划消息:', message.content);
    return null;
  }

  // 🎯 关键修复：如果是新计划发起（不是响应消息），立即创建计划数据
  if (planData.type === 'plan' && !planData.isCompleted) {
    const { getPlanByMessageId, createPlan } = await import('../../plans/plan-data.js');
    
    // 检查是否已经创建过（避免重复创建）
    const existingPlan = getPlanByMessageId(contactId, message.id);
    if (!existingPlan) {
      createPlan(contactId, {
        messageId: message.id,
        title: planData.title,
        content: planData.title,
        initiator: message.sender === 'user' ? 'user' : 'char',
        timestamp: message.time || Date.now()
      });
      logger.info('phone','[PlanMessage] ✅ 已自动创建计划数据:', planData.title);
    } else {
      logger.debug('phone','[PlanMessage] 计划数据已存在，跳过创建:', planData.title);
    }
  }

  const container = document.createElement('div');
  container.className = 'chat-msg';

  const isSent = message.sender === 'user';
  container.classList.add(isSent ? 'chat-msg-sent' : 'chat-msg-received');
  container.setAttribute('data-msg-id', message.id);
  container.setAttribute('data-message-time', message.time?.toString() || '');

  // 创建头像
  const avatar = document.createElement('img');
  avatar.className = 'chat-msg-avatar';

  if (isSent) {
    const userAvatar = /** @type {HTMLImageElement} */ (document.querySelector('#phone-user-avatar'));
    avatar.src = userAvatar?.src || 'img/default-user.png';
  } else {
    avatar.src = getThumbnailUrl('avatar', contact?.avatar) || 'img/default-avatar.png';
  }

  // 创建气泡
  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble chat-msg-bubble-plan';

  // 根据类型渲染不同内容
  if (planData.type === 'plan-response') {
    // 接受/拒绝消息（简单文本样式）
    bubble.classList.add('chat-msg-bubble-plan-response');
    bubble.innerHTML = `
            <div class="chat-msg-plan-response-text">
                <i class="fa-solid ${planData.action === '接受' ? 'fa-check' : 'fa-xmark'}"></i>
                <span>${planData.accepter}${planData.action}了约定计划</span>
            </div>
        `;
  } else {
    // 计划发起或已完成
    bubble.innerHTML = `
            <div class="chat-msg-plan-header">
                <i class="fa-solid fa-clipboard-list"></i>
                <span class="chat-msg-plan-label">约定计划</span>
                ${planData.isCompleted ? '<span class="chat-msg-plan-status completed">✓ 已完成</span>' : '<span class="chat-msg-plan-status pending">待执行</span>'}
            </div>
            <div class="chat-msg-plan-title">${planData.title}</div>
            ${!planData.isCompleted ? '<button class="chat-msg-plan-action-btn" title="编辑计划"><i class="fa-regular fa-pen-to-square"></i></button>' : ''}
        `;

    // 绑定按钮点击事件（只有未完成的才显示按钮）
    if (!planData.isCompleted) {
      const actionBtn = bubble.querySelector('.chat-msg-plan-action-btn');
      actionBtn?.addEventListener('click', async (e) => {
        e.stopPropagation(); // 阻止事件冒泡到气泡
        logger.debug('phone','[PlanMessage] 点击执行按钮:', planData.title);
        const { openPlanExecutor } = await import('../../plans/plan-executor.js');
        await openPlanExecutor(contactId, message, planData);
      });
    }
  }

  // 组装
  container.appendChild(avatar);
  container.appendChild(bubble);

  // 长按操作菜单由 message-chat-ui.js 统一绑定

  logger.info('phone','[PlanMessage] ✅ 约定计划消息渲染完成:', message.id);
  return container;
}
