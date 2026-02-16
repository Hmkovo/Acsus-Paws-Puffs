/**
 * 约定计划执行器
 * @module phone/plans/plan-executor
 * 
 * @description
 * 处理计划的执行流程
 * 职责：
 * - 显示执行弹窗
 * - 处理接受/拒绝操作
 * - 执行骰子逻辑
 * - 生成结果并发送消息
 */

import logger from '../../../logger.js';
import { showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';
import { createPlan, updatePlanResult, updatePlanStatus, getPlanByMessageId } from './plan-data.js';
import { saveChatMessage } from '../messages/message-chat-data.js';
import { getUserDisplayName } from '../utils/contact-display-helper.js';

/**
 * 掷骰子（1d100）
 * @returns {number} 骰子结果（1-100）
 */
function rollDice() {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * 根据骰子结果判断结局类型
 * 
 * @param {number} diceResult - 骰子结果（1-100）
 * @returns {string} 结局类型（'顺利' | '麻烦' | '好事'）
 */
function getOutcomeType(diceResult) {
  if (diceResult <= 40) return '顺利';
  if (diceResult <= 80) return '麻烦';
  return '好事';
}

/**
 * 生成剧情梗概
 * 
 * @param {string} planTitle - 计划标题
 * @param {number} diceResult - 骰子结果
 * @param {string} outcomeType - 结局类型
 * @returns {string} 剧情梗概提示词
 */
function generateStoryPrompt(planTitle, diceResult, outcomeType) {
  const templates = {
    '顺利': [
      '一切都很顺利，没有发生意外',
      '过程很愉快，双方都很满意',
      '按照计划完成，气氛融洽'
    ],
    '麻烦': [
      '遇到了一些小波折，但最终还是完成了',
      '过程中出现了小意外，增添了一些趣味',
      '发生了点小麻烦，不过也不是什么大事'
    ],
    '好事': [
      '意外收获了惊喜！',
      '发生了意想不到的好事',
      '运气真好，遇到了特别开心的事'
    ]
  };

  const template = templates[outcomeType][Math.floor(Math.random() * templates[outcomeType].length)];
  return template;
}

/**
 * 打开计划执行弹窗
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} message - 消息对象
 * @param {Object} planData - 解析后的计划数据
 */
export async function openPlanExecutor(contactId, message, planData) {
  logger.debug('phone','[PlanExecutor] 打开执行弹窗:', planData.title);

  const isSentByUser = message.sender === 'user';
  const userName = getUserDisplayName();

  // 创建弹窗遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'phone-popup-overlay';

  const popupHTML = `
    <div class="phone-popup plan-executor-popup">
      <div class="phone-popup-header">
        <h3>约定计划</h3>
        <button class="phone-popup-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="phone-popup-content">
        <div class="plan-executor-body">
          <div class="plan-executor-title">${planData.title}</div>
          ${isSentByUser ? `
            <div class="plan-executor-hint">等待对方响应...</div>
          ` : `
            <div class="plan-executor-actions">
              <button class="plan-executor-btn accept-btn">
                <i class="fa-solid fa-check"></i> 接受
              </button>
              <button class="plan-executor-btn reject-btn">
                <i class="fa-solid fa-xmark"></i> 拒绝
              </button>
            </div>
            <div class="plan-executor-options" style="display: none;">
              <label>
                <input type="checkbox" class="option-inner-thought">
                输出角色内心印象
              </label>
              <label>
                <input type="checkbox" class="option-record">
                输出过程记录
              </label>
            </div>
            <div class="plan-executor-dice" style="display: none;">
              <button class="plan-executor-btn dice-btn">
                <i class="fa-solid fa-dice"></i> 掷骰子
              </button>
              <div class="dice-result" style="display: none;"></div>
            </div>
          `}
        </div>
      </div>
      <div class="phone-popup-footer">
        <button class="phone-popup-cancel">取消</button>
        <button class="plan-executor-btn confirm-btn" style="display: none;">确认完成</button>
      </div>
    </div>
  `;

  overlay.innerHTML = popupHTML;
  document.body.appendChild(overlay);

  // 触发动画
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });

  const popup = overlay.querySelector('.phone-popup');

  // 关闭弹窗函数
  const closePopup = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  };

  // 如果是 User 发起的，只能查看，不能操作
  if (isSentByUser) {
    const closeBtn = popup.querySelector('.phone-popup-close');
    const cancelBtn = popup.querySelector('.phone-popup-cancel');
    closeBtn?.addEventListener('click', closePopup);
    cancelBtn?.addEventListener('click', closePopup);
    return;
  }

  // 绑定事件
  const acceptBtn = popup.querySelector('.accept-btn');
  const rejectBtn = popup.querySelector('.reject-btn');
  const diceBtn = popup.querySelector('.dice-btn');
  const confirmBtn = popup.querySelector('.confirm-btn');
  const cancelBtn = popup.querySelector('.phone-popup-cancel');
  const closeBtn = popup.querySelector('.phone-popup-close');
  const optionsDiv = popup.querySelector('.plan-executor-options');
  const diceDiv = popup.querySelector('.plan-executor-dice');
  const actionsDiv = popup.querySelector('.plan-executor-actions');

  let diceResult = null;
  let outcomeType = null;

  // 接受按钮
  acceptBtn?.addEventListener('click', async () => {
    logger.debug('phone','[PlanExecutor] 接受计划');

    // 创建或更新计划数据
    let plan = getPlanByMessageId(contactId, message.id);
    if (!plan) {
      plan = createPlan(contactId, {
        messageId: message.id,
        title: planData.title,
        content: planData.title,
        initiator: 'contact',
        timestamp: message.time || Date.now()
      });
    }

    // 生成消息ID和时间戳
    const { generateMessageId } = await import('../utils/message-actions-helper.js');
    const responseMessageId = generateMessageId();
    const timestamp = Math.floor(Date.now() / 1000);

    // 创建接受响应消息对象
    const responseMessage = {
      id: responseMessageId,
      sender: 'user',
      type: 'text',
      content: `[约定计划]${userName}接受了约定计划`,
      time: timestamp
    };

    // 保存到数据库
    await saveChatMessage(contactId, responseMessage);

    // 显示到聊天区
    const chatPage = document.querySelector(`#page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (chatPage && chatPage.parentElement) {
      const { appendMessageToChat } = await import('../messages/message-chat-ui.js');
      const { loadContacts } = await import('../contacts/contact-list-data.js');
      const contacts = await loadContacts();
      const contact = contacts.find(c => c.id === contactId);

      await appendMessageToChat(chatPage, responseMessage, contact, contactId);

      // 滚动到底部
      const chatContent = chatPage.querySelector('.chat-content');
      if (chatContent) {
        chatContent.scrollTop = chatContent.scrollHeight;
      }
    }

    // 更新消息列表
    const { updateContactItem } = await import('../messages/message-list-ui.js');
    await updateContactItem(contactId);

    // 显示选项和骰子
    actionsDiv.style.display = 'none';
    optionsDiv.style.display = 'block';
    diceDiv.style.display = 'block';

    showSuccessToast('已接受约定计划');
  });

  // 拒绝按钮
  rejectBtn?.addEventListener('click', async () => {
    logger.debug('phone','[PlanExecutor] 拒绝计划');

    // 生成消息ID和时间戳
    const { generateMessageId } = await import('../utils/message-actions-helper.js');
    const responseMessageId = generateMessageId();
    const timestamp = Math.floor(Date.now() / 1000);

    // 创建拒绝响应消息对象
    const responseMessage = {
      id: responseMessageId,
      sender: 'user',
      type: 'text',
      content: `[约定计划]${userName}拒绝了约定计划`,
      time: timestamp
    };

    // 保存到数据库
    await saveChatMessage(contactId, responseMessage);

    // 显示到聊天区
    const chatPage = document.querySelector(`#page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (chatPage && chatPage.parentElement) {
      const { appendMessageToChat } = await import('../messages/message-chat-ui.js');
      const { loadContacts } = await import('../contacts/contact-list-data.js');
      const contacts = await loadContacts();
      const contact = contacts.find(c => c.id === contactId);

      await appendMessageToChat(chatPage, responseMessage, contact, contactId);

      // 滚动到底部
      const chatContent = chatPage.querySelector('.chat-content');
      if (chatContent) {
        chatContent.scrollTop = chatContent.scrollHeight;
      }
    }

    // 更新消息列表
    const { updateContactItem } = await import('../messages/message-list-ui.js');
    await updateContactItem(contactId);

    closePopup();
    showSuccessToast('已拒绝约定计划');
  });

  // 掷骰子按钮
  diceBtn?.addEventListener('click', () => {
    diceResult = rollDice();
    outcomeType = getOutcomeType(diceResult);

    const resultDiv = popup.querySelector('.dice-result');
    resultDiv.innerHTML = `
            <div class="dice-number">🎲 ${diceResult}</div>
            <div class="dice-outcome">${outcomeType === '顺利' ? '✅' : outcomeType === '麻烦' ? '⚠️' : '🎉'} ${outcomeType}</div>
        `;
    resultDiv.style.display = 'block';
    diceBtn.style.display = 'none';

    confirmBtn.style.display = 'block';

    logger.info('phone','[PlanExecutor] 掷骰子结果:', diceResult, outcomeType);
  });

  // 确认完成按钮
  confirmBtn?.addEventListener('click', async () => {
    if (!diceResult) {
      showErrorToast('请先掷骰子');
      return;
    }

    const includeInnerThought = popup.querySelector('.option-inner-thought')?.checked || false;
    const includeRecord = popup.querySelector('.option-record')?.checked || false;

    const storyPrompt = generateStoryPrompt(planData.title, diceResult, outcomeType);

    // 查找或创建计划
    let plan = getPlanByMessageId(contactId, message.id);
    if (!plan) {
      plan = createPlan(contactId, {
        messageId: message.id,
        title: planData.title,
        content: planData.title,
        initiator: 'contact',
        timestamp: message.time || Date.now()
      });
    }

    // 更新计划结果
    updatePlanResult(contactId, plan.id, {
      diceResult,
      outcome: outcomeType,
      story: storyPrompt,
      options: {
        includeInnerThought,
        includeRecord
      }
    });

    // 修改原消息为已完成
    const { updateMessage } = await import('../messages/message-chat-data.js');
    await updateMessage(contactId, message.id, {
      content: `[约定计划已完成]${planData.title}`
    });

    // 触发页面刷新
    window.dispatchEvent(new CustomEvent('phone-chat-updated', {
      detail: { contactId }
    }));

    closePopup();
    showSuccessToast('计划已完成，请点击纸飞机发送');

    logger.info('phone','[PlanExecutor] ✅ 计划执行完成:', planData.title);
  });

  // 取消和关闭按钮
  cancelBtn?.addEventListener('click', closePopup);
  closeBtn?.addEventListener('click', closePopup);

  // 点击遮罩层关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });
}

/**
 * 创建新计划（User 主动发起）
 * 
 * @param {string} contactId - 联系人ID
 * @returns {Promise<void>}
 */
export async function createNewPlan(contactId) {
  logger.debug('phone','[PlanExecutor] 创建新计划');

  // 创建弹窗遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'phone-popup-overlay';

  const popupHTML = `
    <div class="phone-popup plan-creator-popup">
      <div class="phone-popup-header">
        <h3>发起约定计划</h3>
        <button class="phone-popup-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="phone-popup-content">
        <div class="plan-creator-body">
          <textarea class="plan-creator-input" placeholder="输入计划内容，例如：一起去吃卷饼" maxlength="200"></textarea>
          <div class="plan-creator-hint">最多200字</div>
        </div>
      </div>
      <div class="phone-popup-footer">
        <button class="phone-popup-cancel">取消</button>
        <button class="plan-creator-btn send-btn">发送</button>
      </div>
    </div>
  `;

  overlay.innerHTML = popupHTML;
  document.body.appendChild(overlay);

  // 触发动画
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });

  const popup = overlay.querySelector('.phone-popup');
  const input = popup.querySelector('.plan-creator-input');
  const sendBtn = popup.querySelector('.send-btn');
  const cancelBtn = popup.querySelector('.phone-popup-cancel');
  const closeBtn = popup.querySelector('.phone-popup-close');

  // 聚焦输入框
  input?.focus();

  // 关闭弹窗函数
  const closePopup = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  };

  sendBtn?.addEventListener('click', async () => {
    const planContent = input?.value.trim();
    if (!planContent) {
      showErrorToast('请输入计划内容');
      return;
    }

    // 生成消息ID和时间戳
    const { generateMessageId } = await import('../utils/message-actions-helper.js');
    const messageId = generateMessageId();
    const timestamp = Math.floor(Date.now() / 1000);

    // 创建计划消息对象
    const message = {
      id: messageId,
      sender: 'user',
      type: 'text',
      content: `[约定计划]${planContent}`,
      time: timestamp
    };

    // 保存到数据库
    await saveChatMessage(contactId, message);

    // 创建计划数据
    createPlan(contactId, {
      messageId: messageId,
      title: planContent,
      content: planContent,
      initiator: 'user',
      timestamp: timestamp
    });

    // 显示到聊天区（和其他消息一样的流程）
    const chatPage = document.querySelector(`#page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (chatPage && chatPage.parentElement) {
      const { appendMessageToChat } = await import('../messages/message-chat-ui.js');
      const { loadContacts } = await import('../contacts/contact-list-data.js');
      const contacts = await loadContacts();
      const contact = contacts.find(c => c.id === contactId);

      await appendMessageToChat(chatPage, message, contact, contactId);

      // 滚动到底部
      const chatContent = chatPage.querySelector('.chat-content');
      if (chatContent) {
        chatContent.scrollTop = chatContent.scrollHeight;
      }
    }

    // 更新消息列表
    const { updateContactItem } = await import('../messages/message-list-ui.js');
    await updateContactItem(contactId);

    closePopup();
    showSuccessToast('计划已发送');

    logger.info('phone','[PlanExecutor] ✅ 发起新计划:', planContent);
  });

  // 取消和关闭按钮
  cancelBtn?.addEventListener('click', closePopup);
  closeBtn?.addEventListener('click', closePopup);

  // 点击遮罩层关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });
}

