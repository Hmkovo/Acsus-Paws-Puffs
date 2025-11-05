/**
 * 约定计划剧情消息渲染器
 * @module phone/messages/message-types/plan-story-message
 * 
 * @description
 * 渲染约定计划的剧情输出消息
 * 支持三种类型：
 * - [约定计划过程]xxx
 * - [约定计划内心印象]xxx
 * - [约定计划过程记录]xxx
 */

import logger from '../../../../logger.js';
import { bindLongPress } from '../../utils/message-actions-helper.js';

/**
 * 解析计划剧情消息格式
 * 
 * @param {string} content - 消息内容
 * @returns {Object|null} 解析结果 { type, title, storyContent }
 */
export function parsePlanStoryMessage(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // [约定计划过程]xxx
  const processMatch = content.match(/^\[约定计划过程\](.+)$/s);
  if (processMatch) {
    return {
      type: 'plan-story-process',
      title: '计划过程',
      storyContent: processMatch[1].trim(),
      icon: 'fa-book',
      color: '#4caf50'
    };
  }

  // [约定计划内心印象]xxx
  const thoughtMatch = content.match(/^\[约定计划内心印象\](.+)$/s);
  if (thoughtMatch) {
    return {
      type: 'plan-story-thought',
      title: '内心印象',
      storyContent: thoughtMatch[1].trim(),
      icon: 'fa-heart',
      color: '#ff9800'
    };
  }

  // [约定计划过程记录]xxx
  const recordMatch = content.match(/^\[约定计划过程记录\](.+)$/s);
  if (recordMatch) {
    return {
      type: 'plan-story-record',
      title: '过程记录',
      storyContent: recordMatch[1].trim(),
      icon: 'fa-list-ul',
      color: '#2196f3'
    };
  }

  return null;
}

/**
 * 检查消息是否是计划剧情消息
 * @param {Object} message - 消息对象
 * @returns {boolean}
 */
export function isPlanStoryMessage(message) {
  if (message.type !== 'text') return false;
  return parsePlanStoryMessage(message.content) !== null;
}

/**
 * 渲染约定计划剧情消息
 * 
 * @param {Object} message - 消息对象
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement} 消息元素
 */
export function renderPlanStoryMessage(message, contactId) {
  logger.debug('[PlanStoryMessage] 渲染计划剧情消息');

  const storyData = parsePlanStoryMessage(message.content);
  if (!storyData) {
    logger.warn('[PlanStoryMessage] 无法解析计划剧情消息:', message.content?.substring(0, 50));
    return null;
  }

  const container = document.createElement('div');
  container.className = 'chat-msg chat-msg-plan-story';
  container.setAttribute('data-msg-id', message.id);
  container.setAttribute('data-message-time', message.time?.toString() || '');

  // 创建卡片
  const card = document.createElement('div');
  card.className = 'plan-story-card';
  card.dataset.expanded = 'false';

  card.innerHTML = `
    <div class="plan-story-header">
      <div class="plan-story-icon" style="color: ${storyData.color}">
        <i class="fa-solid ${storyData.icon}"></i>
      </div>
      <div class="plan-story-title">${storyData.title}</div>
      <button class="plan-story-toggle" title="展开/折叠">
        <i class="fa-solid fa-chevron-down"></i>
      </button>
    </div>
    <div class="plan-story-content" style="display: none;">
      <div class="plan-story-text">${storyData.storyContent}</div>
      <div class="plan-story-actions">
        <button class="plan-story-send-btn" title="发送到酒馆">
          <i class="fa-solid fa-paper-plane"></i> 发送到酒馆
        </button>
      </div>
    </div>
  `;

  // 绑定展开/折叠
  const toggleBtn = card.querySelector('.plan-story-toggle');
  const contentDiv = card.querySelector('.plan-story-content');
  const toggleIcon = toggleBtn.querySelector('i');

  toggleBtn.addEventListener('click', () => {
    const isExpanded = card.dataset.expanded === 'true';

    if (isExpanded) {
      // 折叠
      contentDiv.style.display = 'none';
      toggleIcon.className = 'fa-solid fa-chevron-down';
      card.dataset.expanded = 'false';
    } else {
      // 展开
      contentDiv.style.display = 'block';
      toggleIcon.className = 'fa-solid fa-chevron-up';
      card.dataset.expanded = 'true';
    }
  });

  // 绑定发送到酒馆
  const sendBtn = card.querySelector('.plan-story-send-btn');
  sendBtn.addEventListener('click', async () => {
    const tavernTextarea = document.querySelector('#send_textarea');
    if (!tavernTextarea) {
      const { showErrorToast } = await import('../../ui-components/toast-notification.js');
      showErrorToast('未找到酒馆输入框');
      return;
    }

    // 插入内容
    tavernTextarea.value = storyData.storyContent;
    tavernTextarea.focus();
    tavernTextarea.dispatchEvent(new Event('input', { bubbles: true }));

    const { showSuccessToast } = await import('../../ui-components/toast-notification.js');
    showSuccessToast('已发送到酒馆输入框');

    logger.info('[PlanStoryMessage] 已发送到酒馆:', storyData.title);
  });

  container.appendChild(card);

  // 绑定长按删除功能
  bindLongPress(card, message, contactId, {
    disableQuote: true  // 禁用引用功能（剧情消息不适合引用）
  });

  logger.info('[PlanStoryMessage] ✅ 计划剧情消息渲染完成:', storyData.title);
  return container;
}

