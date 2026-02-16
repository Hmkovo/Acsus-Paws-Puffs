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
import { getCompletedPlans, savePlanNote, deletePlanNote } from '../../plans/plan-data.js';
import { showSuccessToast, showErrorToast } from '../../ui-components/toast-notification.js';
import { stateManager } from '../../utils/state-manager.js';
import { extension_settings } from '../../../../../../../extensions.js';

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
 * @param {Object} [cachedPlan] - 缓存的计划对象（可选，避免重复查找）
 * @returns {HTMLElement} 消息元素
 */
export function renderPlanStoryMessage(message, contactId, cachedPlan = null) {
  logger.debug('phone','[PlanStoryMessage]] 渲染计划剧情消息');

  const storyData = parsePlanStoryMessage(message.content);
  if (!storyData) {
    logger.warn('phone','[PlanStoryMessage]] 无法解析计划剧情消息:', message.content?.substring(0, 50));
    return null;
  }

  // 查找关联的计划（优先使用缓存，避免重复查找）
  let plan = cachedPlan;
  if (!plan) {
    const completedPlans = getCompletedPlans(contactId);
    plan = completedPlans.length > 0 ? completedPlans[completedPlans.length - 1] : null;
  }

  if (!plan) {
    logger.warn('phone','[PlanStoryMessage]] 未找到关联的计划');
  }

  const container = document.createElement('div');
  container.className = 'chat-msg chat-msg-plan-story';
  container.setAttribute('data-msg-id', message.id);
  container.setAttribute('data-message-time', message.time?.toString() || '');

  // 检查当前要点类型的保存状态
  const noteType = getNoteType(storyData.type);
  const noteField = getNoteField(noteType);
  const isSaved = plan && plan.notes && plan.notes[noteField];

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
        <button class="plan-story-save-note-btn ${isSaved ? 'saved' : ''}" title="${isSaved ? '已记录要点' : '记录要点'}">
          <i class="fa-solid fa-bookmark"></i> ${isSaved ? '已记录 ✓' : '记录要点'}
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

  // 绑定记录要点按钮
  const saveNoteBtn = card.querySelector('.plan-story-save-note-btn');
  saveNoteBtn.addEventListener('click', () => {
    if (!plan) {
      showErrorToast('未找到关联的计划');
      return;
    }

    // 检查当前状态（需要转换字段名）
    const noteField = getNoteField(noteType);
    const currentlySaved = plan.notes && plan.notes[noteField];

    if (currentlySaved) {
      // 已记录 → 取消记录
      deletePlanNote(contactId, plan.id, noteType);
      saveNoteBtn.classList.remove('saved');
      saveNoteBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> 记录要点';
      saveNoteBtn.title = '记录要点';
      showSuccessToast('已取消记录');
      logger.info('phone','[PlanStoryMessage]] 取消记录要点:', storyData.title);
    } else {
      // 未记录 → 记录要点
      savePlanNote(contactId, plan.id, noteType, storyData.storyContent);
      saveNoteBtn.classList.add('saved');
      saveNoteBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> 已记录 ✓';
      saveNoteBtn.title = '已记录要点';
      showSuccessToast('已记录要点');
      logger.info('phone','[PlanStoryMessage]] 记录要点:', storyData.title);
    }

    // 🔥 通过状态管理器通知订阅者
    stateManager.set('plans', extension_settings.acsusPawsPuffs.phone.plans, {
      contactId,
      planId: plan.id,
      action: 'update-notes'
    });
  });

  container.appendChild(card);

  // 长按操作菜单由 message-chat-ui.js 统一绑定

  logger.info('phone','[PlanStoryMessage]] ✅ 计划剧情消息渲染完成:', storyData.title);
  return container;
}

/**
 * 获取要点类型（用于保存）
 * @param {string} storyType - 剧情类型
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

