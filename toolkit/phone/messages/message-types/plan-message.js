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
import { bindLongPress } from '../../utils/message-actions-helper.js';

/**
 * 解析计划消息格式
 * 
 * @param {string} content - 消息内容
 * @returns {Object|null} 解析结果 { type, title, accepter, isCompleted }
 * 
 * @description
 * 支持的格式：
 * - [约定计划]一起去吃卷饼
 * - [约定计划]{{user}}接受了约定计划
 * - [约定计划]{{char}}拒绝了约定计划
 * - [约定计划已完成]一起去吃卷饼
 */
export function parsePlanMessage(content) {
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
      return {
        type: 'plan-response',
        accepter: acceptMatch[1].trim(),
        action: acceptMatch[2], // '接受' | '拒绝'
        isCompleted: false
      };
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

  return parsePlanMessage(message.content) !== null;
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
export function renderPlanMessage(message, contact, contactId) {
  logger.debug('[PlanMessage] 渲染计划消息:', message.content);

  const planData = parsePlanMessage(message.content);
  if (!planData) {
    logger.warn('[PlanMessage] 无法解析计划消息:', message.content);
    return null;
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
            ${!planData.isCompleted ? '<button class="chat-msg-plan-action-btn" title="执行计划"><i class="fa-solid fa-play"></i></button>' : ''}
        `;

    // 绑定按钮点击事件（只有未完成的才显示按钮）
    if (!planData.isCompleted) {
      const actionBtn = bubble.querySelector('.chat-msg-plan-action-btn');
      actionBtn?.addEventListener('click', async (e) => {
        e.stopPropagation(); // 阻止事件冒泡到气泡
        logger.debug('[PlanMessage] 点击执行按钮:', planData.title);
        const { openPlanExecutor } = await import('../../plans/plan-executor.js');
        await openPlanExecutor(contactId, message, planData);
      });
    }
  }

  // 组装
  container.appendChild(avatar);
  container.appendChild(bubble);

  // 绑定长按删除功能（所有计划消息都支持删除）
  bindLongPress(bubble, message, contactId, {
    disableQuote: true  // 禁用引用功能（计划消息不适合引用）
  });

  logger.info('[PlanMessage] ✅ 计划消息渲染完成:', planData.title || '响应消息');
  return container;
}

