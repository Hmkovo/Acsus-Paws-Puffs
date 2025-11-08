/**
 * AI消息调试界面
 * @module phone/messages/message-debug-ui
 * 
 * @description
 * 用于查看、修改、重roll AI返回的原始消息
 * - 保存AI原始响应（成功/报错）
 * - 对比模式（示例 vs AI返回）
 * - 辅助检查（标签完整性）
 * - 重新应用（回退+重新解析）
 * - 重roll（重新调用API）
 * - 版本管理（翻页）
 */

import logger from '../../../logger.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { loadChatHistory, saveChatMessage } from './message-chat-data.js';
import { parseAIResponse } from '../ai-integration/ai-response-parser.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';

// ========================================
// [CORE] 状态管理
// ========================================

/**
 * 调试状态存储（内存，临时）
 * @type {Map<string, Object>}
 */
const debugStates = new Map();

/**
 * 清空调试状态（每次点纸飞机时调用）
 * @param {string} contactId - 联系人ID
 */
export function clearDebugState(contactId) {
  debugStates.delete(contactId);
  logger.debug('[Debug] 清空调试状态:', contactId);
}

/**
 * 保存快照（发送前的状态）
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} snapshotData - 快照数据
 * @param {number} snapshotData.messageCount - 发送前的消息数量
 * @param {Object} [snapshotData.allPendingMessages] - 所有待发送消息（多联系人）格式：{ contactId: [messages] }
 * 
 * @description
 * 保存完整的发送前状态，用于重roll时恢复：
 * - messageCount：聊天记录数量（用于回退）
 * - allPendingMessages：所有待发送消息（包括多个联系人，用于重新构建上下文）
 */
export function saveSnapshot(contactId, snapshotData) {
  let state = debugStates.get(contactId);
  if (!state) {
    state = {
      versions: [],
      currentIndex: 0,
      snapshot: { messageCount: 0 }
    };
    debugStates.set(contactId, state);
  }

  state.snapshot = {
    messageCount: snapshotData.messageCount || snapshotData, // 兼容旧版本：如果传数字则作为 messageCount
    allPendingMessages: snapshotData.allPendingMessages || null
  };

  logger.debug('[Debug] 保存快照:', contactId, '消息数量:', state.snapshot.messageCount, '待发送联系人数:',
    state.snapshot.allPendingMessages ? Object.keys(state.snapshot.allPendingMessages).length : 0);
}

/**
 * 保存调试版本（AI返回时调用）
 * @param {string} contactId - 联系人ID
 * @param {string} text - AI返回的原始文本
 */
export function saveDebugVersion(contactId, text) {
  let state = debugStates.get(contactId);
  if (!state) {
    state = {
      versions: [],
      currentIndex: 0,
      snapshot: { messageCount: 0 }
    };
    debugStates.set(contactId, state);
  }

  state.versions.push({
    text: text,
    timestamp: Date.now()
  });
  state.currentIndex = state.versions.length - 1;

  logger.info('[Debug] 保存版本:', contactId, `长度=${text.length}字符`);
}

// ========================================
// [UI] 调试界面
// ========================================

/**
 * 当前打开的弹窗元素
 * @type {HTMLElement|null}
 */
let currentPopup = null;

/**
 * 当前调试的联系人ID
 * @type {string|null}
 */
let currentContactId = null;

/**
 * 当前字体大小
 * @type {number}
 */
let currentFontSize = 14;

/**
 * 是否处于对比模式
 * @type {boolean}
 */
let isCompareMode = false;

/**
 * 打开调试界面
 * @async
 * @param {string} contactId - 联系人ID
 */
export async function openDebugUI(contactId) {
  logger.info('[Debug] 打开调试界面:', contactId);

  const state = debugStates.get(contactId);
  if (!state || state.versions.length === 0) {
    const toastr = window.toastr;
    if (toastr) {
      toastr.warning('暂无调试数据，请先发送消息');
    }
    return;
  }

  currentContactId = contactId;
  currentFontSize = 14;
  isCompareMode = false;

  // 创建弹窗
  const popup = createDebugPopup(contactId, state);
  currentPopup = popup;

  document.body.appendChild(popup);

  // 触发动画（和通用弹窗一致）
  requestAnimationFrame(() => {
    popup.classList.add('show');
  });

  // 绑定事件
  bindDebugEvents(popup, contactId);
}

/**
 * 关闭调试界面
 */
function closeDebugUI() {
  if (currentPopup) {
    // 先移除 .show 类触发动画
    currentPopup.classList.remove('show');

    // 等待动画结束后再移除元素
    setTimeout(() => {
      currentPopup.remove();
      currentPopup = null;
      currentContactId = null;
    }, 300);  // 300ms 和 CSS transition 时长一致
  }
}

/**
 * 创建调试弹窗
 * @private
 * @param {string} contactId - 联系人ID
 * @param {Object} state - 调试状态
 * @returns {HTMLElement} 弹窗元素
 */
function createDebugPopup(contactId, state) {
  const overlay = document.createElement('div');
  overlay.className = 'debug-overlay';

  const popup = document.createElement('div');
  popup.className = 'debug-popup';

  // 顶部按钮区
  popup.appendChild(createHeader());

  // 内容区
  popup.appendChild(createContentArea(state));

  // 底部操作区
  popup.appendChild(createFooter());

  overlay.appendChild(popup);
  return overlay;
}

/**
 * 创建顶部按钮区
 * @private
 * @returns {HTMLElement}
 */
function createHeader() {
  const header = document.createElement('div');
  header.className = 'debug-header';
  header.innerHTML = `
        <button class="debug-btn debug-compare-btn" title="对比模式">对比</button>
        <button class="debug-btn debug-validate-btn" title="辅助检查">检查</button>
        <button class="debug-btn debug-font-minus" title="缩小字体">A-</button>
        <button class="debug-btn debug-font-plus" title="放大字体">A+</button>
        <div class="debug-header-spacer"></div>
        <button class="debug-btn debug-close-btn" title="关闭">
            <i class="fa-regular fa-circle-xmark"></i>
        </button>
    `;
  return header;
}

/**
 * 创建内容区
 * @private
 * @param {Object} state - 调试状态
 * @returns {HTMLElement}
 */
function createContentArea(state) {
  const content = document.createElement('div');
  content.className = 'debug-content';

  const currentVersion = state.versions[state.currentIndex];

  // 单视图模式（默认）
  const textareaContainer = document.createElement('div');
  textareaContainer.className = 'debug-textarea-container';

  const textarea = document.createElement('textarea');
  textarea.className = 'debug-textarea';
  textarea.value = currentVersion.text;
  textarea.style.fontSize = `${currentFontSize}px`;

  textareaContainer.appendChild(textarea);

  // 版本指示器
  if (state.versions.length > 1) {
    const versionIndicator = document.createElement('div');
    versionIndicator.className = 'debug-version-indicator';
    versionIndicator.innerHTML = `
            <button class="debug-version-prev" ${state.currentIndex === 0 ? 'disabled' : ''}>
                <i class="fa-regular fa-chevron-left"></i>
            </button>
            <span class="debug-version-text">${state.currentIndex + 1}/${state.versions.length}</span>
            <button class="debug-version-next" ${state.currentIndex === state.versions.length - 1 ? 'disabled' : ''}>
                <i class="fa-regular fa-chevron-right"></i>
            </button>
        `;
    textareaContainer.appendChild(versionIndicator);
  }

  content.appendChild(textareaContainer);

  return content;
}

/**
 * 创建底部操作区
 * @private
 * @returns {HTMLElement}
 */
function createFooter() {
  const footer = document.createElement('div');
  footer.className = 'debug-footer';
  footer.innerHTML = `
        <button class="debug-btn-primary debug-reapply-btn">重新应用</button>
        <button class="debug-btn-secondary debug-reroll-btn">重roll</button>
    `;
  return footer;
}

/**
 * 绑定调试界面事件
 * @private
 * @param {HTMLElement} popup - 弹窗元素
 * @param {string} contactId - 联系人ID
 */
function bindDebugEvents(popup, contactId) {
  // 关闭按钮
  const closeBtn = popup.querySelector('.debug-close-btn');
  closeBtn?.addEventListener('click', closeDebugUI);

  // 对比模式
  const compareBtn = popup.querySelector('.debug-compare-btn');
  compareBtn?.addEventListener('click', () => handleCompare(popup, contactId));

  // 辅助检查
  const validateBtn = popup.querySelector('.debug-validate-btn');
  validateBtn?.addEventListener('click', () => handleValidate(popup, contactId));

  // 字体调节
  const fontMinusBtn = popup.querySelector('.debug-font-minus');
  const fontPlusBtn = popup.querySelector('.debug-font-plus');
  fontMinusBtn?.addEventListener('click', () => handleFontSize(popup, -2));
  fontPlusBtn?.addEventListener('click', () => handleFontSize(popup, 2));

  // 重新应用
  const reapplyBtn = popup.querySelector('.debug-reapply-btn');
  reapplyBtn?.addEventListener('click', () => handleReapply(popup, contactId));

  // 重roll
  const rerollBtn = popup.querySelector('.debug-reroll-btn');
  rerollBtn?.addEventListener('click', () => handleReroll(popup, contactId));

  // 版本翻页
  const prevBtn = popup.querySelector('.debug-version-prev');
  const nextBtn = popup.querySelector('.debug-version-next');
  prevBtn?.addEventListener('click', () => handleVersionChange(popup, contactId, -1));
  nextBtn?.addEventListener('click', () => handleVersionChange(popup, contactId, 1));

  // 点击遮罩关闭
  popup.parentElement.addEventListener('click', (e) => {
    if (e.target === popup.parentElement) {
      closeDebugUI();
    }
  });

  // ✅ 监听重roll结束事件和AI生成完成事件，同步调试界面按钮状态
  const handleRerollEnd = (e) => {
    if (e.detail.contactId !== contactId) return;

    const rerollBtn = popup.querySelector('.debug-reroll-btn');
    if (rerollBtn) {
      rerollBtn.disabled = false;
      rerollBtn.textContent = '重roll';
      logger.debug('[Debug] 收到重roll结束事件，恢复按钮状态');
    }
  };

  const handleAIGenerationComplete = (e) => {
    if (e.detail.contactId !== contactId) return;

    const rerollBtn = popup.querySelector('.debug-reroll-btn');
    if (rerollBtn) {
      rerollBtn.disabled = false;
      rerollBtn.textContent = '重roll';
      logger.debug('[Debug] 收到AI生成完成事件，恢复按钮状态');
    }
  };

  const handleAIGenerationError = (e) => {
    if (e.detail.contactId !== contactId) return;

    const rerollBtn = popup.querySelector('.debug-reroll-btn');
    if (rerollBtn) {
      rerollBtn.disabled = false;
      rerollBtn.textContent = '重roll';
      logger.debug('[Debug] 收到AI生成错误事件，恢复按钮状态');
    }
  };

  document.addEventListener('phone-debug-reroll-end', handleRerollEnd);
  document.addEventListener('phone-ai-generation-complete', handleAIGenerationComplete);
  document.addEventListener('phone-ai-generation-error', handleAIGenerationError);

  // 弹窗关闭时清理监听器
  const originalClose = closeDebugUI;
  const cleanupAndClose = () => {
    document.removeEventListener('phone-debug-reroll-end', handleRerollEnd);
    document.removeEventListener('phone-ai-generation-complete', handleAIGenerationComplete);
    document.removeEventListener('phone-ai-generation-error', handleAIGenerationError);
    originalClose();
  };

  // 临时替换关闭函数（确保清理监听器）
  const closeBtnForCleanup = popup.querySelector('.debug-close-btn');
  if (closeBtnForCleanup) {
    closeBtnForCleanup.removeEventListener('click', closeDebugUI);
    closeBtnForCleanup.addEventListener('click', cleanupAndClose);
  }
}

// ========================================
// [ACTIONS] 功能处理
// ========================================

/**
 * 处理对比模式
 * @private
 * @param {HTMLElement} popup - 弹窗元素
 * @param {string} contactId - 联系人ID
 */
async function handleCompare(popup, contactId) {
  isCompareMode = !isCompareMode;

  const content = popup.querySelector('.debug-content');
  const state = debugStates.get(contactId);
  const currentVersion = state.versions[state.currentIndex];

  if (isCompareMode) {
    // 切换到对比模式
    content.innerHTML = '';
    content.className = 'debug-content debug-compare-mode';

    // 左侧：示例模板
    const leftContainer = document.createElement('div');
    leftContainer.className = 'debug-compare-left';
    leftContainer.innerHTML = `
            <div class="debug-compare-label">【正确示例】</div>
            <textarea class="debug-textarea debug-textarea-readonly" readonly style="font-size: ${currentFontSize}px;">${await getExampleTemplate(contactId)}</textarea>
        `;

    // 右侧：AI返回
    const rightContainer = document.createElement('div');
    rightContainer.className = 'debug-compare-right';
    rightContainer.innerHTML = `
            <div class="debug-compare-label">【AI返回】</div>
            <div class="debug-textarea-container">
                <textarea class="debug-textarea" style="font-size: ${currentFontSize}px;">${currentVersion.text}</textarea>
            </div>
        `;

    // 版本指示器（如果有多个版本）
    if (state.versions.length > 1) {
      const versionIndicator = document.createElement('div');
      versionIndicator.className = 'debug-version-indicator';
      versionIndicator.innerHTML = `
                <button class="debug-version-prev" ${state.currentIndex === 0 ? 'disabled' : ''}>
                    <i class="fa-regular fa-chevron-left"></i>
                </button>
                <span class="debug-version-text">${state.currentIndex + 1}/${state.versions.length}</span>
                <button class="debug-version-next" ${state.currentIndex === state.versions.length - 1 ? 'disabled' : ''}>
                    <i class="fa-regular fa-chevron-right"></i>
                </button>
            `;
      rightContainer.querySelector('.debug-textarea-container').appendChild(versionIndicator);

      // 重新绑定翻页事件
      const prevBtn = versionIndicator.querySelector('.debug-version-prev');
      const nextBtn = versionIndicator.querySelector('.debug-version-next');
      prevBtn?.addEventListener('click', () => handleVersionChange(popup, contactId, -1));
      nextBtn?.addEventListener('click', () => handleVersionChange(popup, contactId, 1));
    }

    content.appendChild(leftContainer);
    content.appendChild(rightContainer);

    popup.querySelector('.debug-compare-btn').classList.add('active');
  } else {
    // 切换回单视图
    content.innerHTML = '';
    content.className = 'debug-content';
    content.appendChild(createContentArea(state));

    // 重新绑定翻页事件
    const prevBtn = content.querySelector('.debug-version-prev');
    const nextBtn = content.querySelector('.debug-version-next');
    prevBtn?.addEventListener('click', () => handleVersionChange(popup, contactId, -1));
    nextBtn?.addEventListener('click', () => handleVersionChange(popup, contactId, 1));

    popup.querySelector('.debug-compare-btn').classList.remove('active');
  }
}

/**
 * 获取示例模板
 * @private
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<string>} 示例模板
 */
async function getExampleTemplate(contactId) {
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);
  const displayName = contact ? getContactDisplayName(contact) : '角色名';

  return `[角色-${displayName}]
[消息]
你好啊
最近怎么样？`;
}

/**
 * 处理辅助检查
 * @private
 * @param {HTMLElement} popup - 弹窗元素
 * @param {string} contactId - 联系人ID
 */
async function handleValidate(popup, contactId) {
  const textarea = popup.querySelector('.debug-textarea:not(.debug-textarea-readonly)');
  const text = textarea.value;

  const result = await validateTags(text, contactId);

  const toastr = window.toastr;
  if (!toastr) return;

  if (result.ok) {
    toastr.success(result.message);
  } else {
    toastr.error(result.errors.join('\n'), '格式检查', { timeOut: 5000 });
  }
}

/**
 * 验证标签完整性
 * @private
 * @async
 * @param {string} text - 要验证的文本
 * @param {string} contactId - 联系人ID
 * @returns {Promise<Object>} 验证结果
 */
async function validateTags(text, contactId) {
  const errors = [];

  // 检查 [角色-XXX] 标签
  const roleMatches = text.match(/\[角色-([^\]]+)\]/g);
  if (!roleMatches || roleMatches.length === 0) {
    errors.push('❌ 缺少 [角色-XXX] 开始标签');
  } else {
    // 检查角色名是否匹配联系人
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      const displayName = getContactDisplayName(contact);
      const roleName = roleMatches[0].match(/\[角色-([^\]]+)\]/)[1];
      if (roleName !== displayName) {
        errors.push(`⚠️ 角色名不匹配：期望 "${displayName}"，实际 "${roleName}"`);
      }
    }
  }

  // 检查 [消息] 标签
  if (!text.includes('[消息]')) {
    errors.push('❌ 缺少 [消息] 开始标签');
  }

  // 成功提示
  if (errors.length === 0) {
    return { ok: true, message: '✅ 格式正确' };
  }

  return { ok: false, errors };
}

/**
 * 处理字体大小调节
 * @private
 * @param {HTMLElement} popup - 弹窗元素
 * @param {number} delta - 调整量（正数放大，负数缩小）
 */
function handleFontSize(popup, delta) {
  currentFontSize += delta;

  // 限制范围 6-20px
  if (currentFontSize < 6) currentFontSize = 6;
  if (currentFontSize > 20) currentFontSize = 20;

  // 更新所有textarea的字体
  const textareas = popup.querySelectorAll('.debug-textarea');
  textareas.forEach(textarea => {
    textarea.style.fontSize = `${currentFontSize}px`;
  });
}

/**
 * 处理重新应用
 * @private
 * @async
 * @param {HTMLElement} popup - 弹窗元素
 * @param {string} contactId - 联系人ID
 */
async function handleReapply(popup, contactId) {
  logger.info('[Debug] 开始重新应用');

  const textarea = popup.querySelector('.debug-textarea:not(.debug-textarea-readonly)');
  const newText = textarea.value;

  try {
    await rollbackAndReparse(contactId, newText);
    closeDebugUI();

    const toastr = window.toastr;
    if (toastr) {
      toastr.success('已重新应用');
    }
  } catch (error) {
    logger.error('[Debug] 重新应用失败:', error);
    const toastr = window.toastr;
    if (toastr) {
      toastr.error(`重新应用失败: ${error.message}`);
    }
  }
}

/**
 * 处理重roll
 * @private
 * @async
 * @param {HTMLElement} popup - 弹窗元素
 * @param {string} contactId - 联系人ID
 */
async function handleReroll(popup, contactId) {
  logger.info('🎲 [重roll] ========== 开始重roll ==========');
  logger.info('🎲 [重roll] 联系人:', contactId);

  const rerollBtn = popup.querySelector('.debug-reroll-btn');
  const originalText = rerollBtn.textContent;

  try {
    // 显示加载状态
    rerollBtn.disabled = true;
    rerollBtn.innerHTML = '<i class="fa-regular fa-spinner fa-spin"></i> 生成中...';

    // ✅ 触发事件：通知聊天页面改变按钮状态
    document.dispatchEvent(new CustomEvent('phone-debug-reroll-start', {
      detail: { contactId }
    }));

    logger.info('🎲 [重roll] 步骤1：回退到快照');
    // 先回退到快照
    await rollbackToSnapshot(contactId);
    logger.info('🎲 [重roll] 步骤1完成：回退成功');

    // ✅ 获取快照中的多联系人消息（用于重新构建上下文）
    const state = debugStates.get(contactId);
    const snapshot = state?.snapshot;
    const allPendingMessages = snapshot?.allPendingMessages || null;

    if (allPendingMessages) {
      const contactCount = Object.keys(allPendingMessages).length;
      logger.info('🎲 [重roll] 从快照恢复多联系人消息，共', contactCount, '个联系人');
    } else {
      logger.debug('🎲 [重roll] 快照中没有多联系人消息（可能是旧版本快照）');
    }

    logger.info('🎲 [重roll] 步骤2：重新调用API生成消息');
    // 重新调用API
    const { getPhoneSystem } = await import('../phone-system.js');
    const phoneSystem = getPhoneSystem();

    if (!phoneSystem || !phoneSystem.api) {
      throw new Error('手机系统未初始化');
    }

    // ✅ 调用API（传递快照中的多联系人消息）
    await phoneSystem.api.sendToAI(
      contactId,
      async (message) => {
        // ✅ 渲染消息到聊天页面（重roll时也要显示气泡）
        logger.debug('🎲 [重roll] 收到AI消息，开始渲染 类型:', message.type, 'ID:', message.id);
        const page = findActiveChatPage(contactId);
        if (page) {
          const contacts = await loadContacts();
          const contact = contacts.find(c => c.id === contactId);
          if (contact) {
            const { appendMessageToChat } = await import('./message-chat-ui.js');
            await appendMessageToChat(page, message, contact, contactId);
            logger.debug('🎲 [重roll] 消息渲染完成 ID:', message.id);
          }
        }
      },
      () => {
        // 完成
        logger.info('🎲 [重roll] 步骤2完成：AI生成完成');
        logger.info('🎲 [重roll] ========== 重roll成功 ==========');
        rerollBtn.disabled = false;
        rerollBtn.textContent = originalText;

        // ✅ 触发事件：通知聊天页面恢复按钮状态
        document.dispatchEvent(new CustomEvent('phone-debug-reroll-end', {
          detail: { contactId }
        }));

        // 更新UI（显示新版本）
        updateDebugUI(popup, contactId);

        const toastr = window.toastr;
        if (toastr) {
          toastr.success('重roll完成');
        }
      },
      (error) => {
        // 失败
        logger.error('🎲 [重roll] ❌ AI生成失败:', error);
        logger.info('🎲 [重roll] ========== 重roll失败（API错误）==========');
        rerollBtn.disabled = false;
        rerollBtn.textContent = originalText;

        // ✅ 触发事件：通知聊天页面恢复按钮状态
        document.dispatchEvent(new CustomEvent('phone-debug-reroll-end', {
          detail: { contactId }
        }));

        const toastr = window.toastr;
        if (toastr) {
          toastr.error(`重roll失败: ${error}`);
        }
      },
      // ✅ 可选参数：从快照恢复多联系人消息（用于多角色触发）
      allPendingMessages ? { allPendingMessages } : undefined
    );
  } catch (error) {
    logger.error('🎲 [重roll] ❌ 重roll异常:', error);
    logger.info('🎲 [重roll] ========== 重roll失败（系统异常）==========');
    rerollBtn.disabled = false;
    rerollBtn.textContent = originalText;

    // ✅ 触发事件：通知聊天页面恢复按钮状态
    document.dispatchEvent(new CustomEvent('phone-debug-reroll-end', {
      detail: { contactId }
    }));

    const toastr = window.toastr;
    if (toastr) {
      toastr.error(`重roll失败: ${error.message}`);
    }
  }
}

/**
 * 处理版本翻页
 * @private
 * @param {HTMLElement} popup - 弹窗元素
 * @param {string} contactId - 联系人ID
 * @param {number} direction - 方向（-1上一个，1下一个）
 */
function handleVersionChange(popup, contactId, direction) {
  const state = debugStates.get(contactId);
  if (!state) return;

  // 更新索引
  state.currentIndex += direction;

  // 限制范围
  if (state.currentIndex < 0) state.currentIndex = 0;
  if (state.currentIndex >= state.versions.length) {
    state.currentIndex = state.versions.length - 1;
  }

  // 更新UI
  updateDebugUI(popup, contactId);
}

/**
 * 更新调试界面
 * @private
 * @param {HTMLElement} popup - 弹窗元素
 * @param {string} contactId - 联系人ID
 */
function updateDebugUI(popup, contactId) {
  const state = debugStates.get(contactId);
  if (!state) return;

  const currentVersion = state.versions[state.currentIndex];

  // 更新textarea内容
  if (isCompareMode) {
    const textarea = popup.querySelector('.debug-compare-right .debug-textarea');
    if (textarea) {
      textarea.value = currentVersion.text;
    }
  } else {
    const textarea = popup.querySelector('.debug-textarea');
    if (textarea) {
      textarea.value = currentVersion.text;
    }
  }

  // 更新版本指示器
  const versionText = popup.querySelector('.debug-version-text');
  if (versionText) {
    versionText.textContent = `${state.currentIndex + 1}/${state.versions.length}`;
  }

  const prevBtn = popup.querySelector('.debug-version-prev');
  const nextBtn = popup.querySelector('.debug-version-next');
  if (prevBtn) {
    prevBtn.disabled = state.currentIndex === 0;
  }
  if (nextBtn) {
    nextBtn.disabled = state.currentIndex === state.versions.length - 1;
  }
}

// ========================================
// [CORE] 回退与重新解析
// ========================================

/**
 * 回退并重新解析
 * 
 * @description
 * 用于调试界面的"重新应用"按钮：
 * 1. 先调用 rollbackToSnapshot 智能回退（复用逻辑，避免重复代码）
 * 2. 重新解析用户修改后的文本
 * 3. 保存并渲染新解析的消息
 * 
 * @private
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} newText - 新的文本
 */
async function rollbackAndReparse(contactId, newText) {
  logger.info('📝 [重新应用] ========== 开始重新应用 ==========');
  logger.info('📝 [重新应用] 联系人:', contactId);
  logger.debug('📝 [重新应用] 新文本长度:', newText.length);

  // 步骤1：复用智能回退逻辑（删除AI消息，保留用户消息）
  logger.info('📝 [重新应用] 步骤1：回退到快照');
  await rollbackToSnapshot(contactId);
  logger.info('📝 [重新应用] 步骤1完成：回退成功');

  // 步骤2：加载回退后的聊天历史（用于构建引用映射表）
  const chatHistory = await loadChatHistory(contactId);
  logger.debug('📝 [重新应用] 回退后历史消息数:', chatHistory.length);

  // 步骤3：构建引用映射表（让引用消息能正确解析）
  logger.info('📝 [重新应用] 步骤2：构建引用映射表并解析新文本');
  const messageNumberMap = buildMessageNumberMap(chatHistory);
  logger.debug('📝 [重新应用] 映射表大小:', messageNumberMap.size);

  // 步骤4：重新解析
  const parsed = await parseAIResponse(newText, contactId, messageNumberMap);
  logger.debug('📝 [重新应用] 解析完成，共', parsed.length, '条消息');

  if (parsed.length === 0) {
    logger.warn('📝 [重新应用] 解析失败，没有找到有效消息');
    throw new Error('解析失败，没有找到有效消息');
  }

  // 步骤5：重新保存和渲染
  logger.info('📝 [重新应用] 步骤3：保存并渲染新消息');
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  if (!contact) {
    logger.error('📝 [重新应用] 联系人不存在:', contactId);
    throw new Error('联系人不存在');
  }

  const page = findActiveChatPage(contactId);
  for (const msg of parsed) {
    await saveChatMessage(contactId, msg);
    logger.debug('📝 [重新应用] 已保存消息:', msg.type, msg.id);

    if (page) {
      const { appendMessageToChat } = await import('./message-chat-ui.js');
      await appendMessageToChat(page, msg, contact, contactId);
      logger.debug('📝 [重新应用] 已渲染消息:', msg.id);
    }
  }

  logger.info('📝 [重新应用] 步骤3完成：已保存和渲染', parsed.length, '条消息');
  logger.info('📝 [重新应用] ========== 重新应用成功 ==========');
}

/**
 * 回退到快照（不重新解析）
 * 
 * @description
 * 智能回退逻辑：只删除快照后AI发送的消息，保留用户消息
 * - 数据层：根据 sender === 'contact' 判断删除
 * - DOM层：根据 data-msg-id 精准删除
 * - 渲染记录：清除 PhoneAPI 的渲染记录
 * 
 * @private
 * @async
 * @param {string} contactId - 联系人ID
 */
async function rollbackToSnapshot(contactId) {
  const state = debugStates.get(contactId);
  if (!state) {
    throw new Error('未找到调试状态');
  }

  const { snapshot } = state;

  logger.info('🔄 [重roll回退] ========== 开始回退 ==========');
  logger.info('🔄 [重roll回退] 联系人:', contactId);
  logger.info('🔄 [重roll回退] 快照点消息数:', snapshot.messageCount);

  // ========================================
  // 步骤1：回退数据层（只删除AI消息，保留用户消息）
  // ========================================
  const chatHistory = await loadChatHistory(contactId);
  logger.debug('🔄 [回退前] 数据层消息总数:', chatHistory.length);

  // 提取快照后的消息
  const beforeSnapshot = chatHistory.slice(0, snapshot.messageCount);
  const afterSnapshot = chatHistory.slice(snapshot.messageCount);

  logger.debug('🔄 [回退前] 快照前消息:', beforeSnapshot.length, '快照后消息:', afterSnapshot.length);

  // 统计快照后的消息类型
  const afterAI = afterSnapshot.filter(msg => msg.sender === 'contact');
  const afterUser = afterSnapshot.filter(msg => msg.sender === 'user');
  const afterOther = afterSnapshot.filter(msg => msg.sender !== 'contact' && msg.sender !== 'user');

  logger.info('🔄 [快照后消息] AI消息:', afterAI.length, '用户消息:', afterUser.length, '其他消息:', afterOther.length);

  // 记录要删除的AI消息ID
  const deletedAIIds = afterAI.map(msg => msg.id || '(无ID)');
  logger.info('🔄 [即将删除] AI消息ID:', deletedAIIds.join(', ') || '(无)');

  // 保留的用户消息ID
  const keepUserIds = afterUser.map(msg => msg.id || '(无ID)');
  logger.info('🔄 [保留] 用户消息ID:', keepUserIds.join(', ') || '(无)');

  // 重新组装：快照前 + 快照后的用户消息
  const newHistory = [...beforeSnapshot, ...afterUser];
  logger.debug('🔄 [回退后] 数据层消息总数:', newHistory.length, '(删除了', chatHistory.length - newHistory.length, '条AI消息)');

  // 保存回退后的历史
  const { saveChatHistory } = await import('./message-chat-data.js');
  await saveChatHistory(contactId, newHistory);

  // ========================================
  // 步骤2：回退DOM层（根据data-msg-id精准删除）
  // ========================================
  const page = findActiveChatPage(contactId);
  if (page) {
    const chatContent = page.querySelector('.chat-content');
    const allMessages = Array.from(chatContent.querySelectorAll('.chat-msg'));

    logger.debug('🔄 [回退前] DOM消息总数:', allMessages.length);

    let deletedDOMCount = 0;
    const deletedDOMIds = [];

    // 遍历所有DOM消息，删除AI消息ID匹配的
    allMessages.forEach(msgElement => {
      const msgId = msgElement.dataset.msgId;

      // 如果消息ID在要删除的AI消息列表中，删除它
      if (msgId && deletedAIIds.includes(msgId)) {
        logger.debug('🔄 [删除DOM] 消息ID:', msgId);
        msgElement.remove();
        deletedDOMCount++;
        deletedDOMIds.push(msgId);
      }
    });

    logger.info('🔄 [回退后] DOM删除数量:', deletedDOMCount, '删除的ID:', deletedDOMIds.join(', ') || '(无)');
    logger.debug('🔄 [回退后] DOM剩余消息:', chatContent.querySelectorAll('.chat-msg').length);
  } else {
    logger.warn('🔄 [警告] 未找到聊天页面，跳过DOM回退');
  }

  // ========================================
  // 步骤3：清除PhoneAPI的渲染记录
  // ========================================
  const { getPhoneSystem } = await import('../phone-system.js');
  const phoneSystem = getPhoneSystem();
  if (phoneSystem && phoneSystem.api) {
    phoneSystem.api.resetRenderedState(contactId);
    logger.info('🔄 [清除记录] PhoneAPI渲染记录已重置');
  } else {
    logger.warn('🔄 [警告] PhoneAPI未初始化，跳过渲染记录清除');
  }

  // ========================================
  // 步骤4：回退约定计划状态（防止roll导致数据不一致）
  // ========================================
  logger.info('🔄 [计划回退] 开始回退约定计划状态');

  try {
    const { getPlanByMessageId, updatePlanResult, updatePlanStatus } = await import('../plans/plan-data.js');

    let rollbackCount = 0;

    // 遍历快照后删除的AI消息，查找约定计划相关消息
    for (const aiMsg of afterAI) {
      // 检查消息内容是否包含约定计划标记
      const content = aiMsg.content || '';

      // 如果是约定计划响应消息（char接受/拒绝）
      if (content.includes('[约定计划]') && (content.includes('接受') || content.includes('拒绝'))) {
        // 尝试找到对应的计划（通过原始计划消息ID）
        // 注意：这里需要找到原始的user发起的计划消息

        // 遍历所有计划，找到状态被修改的
        const { getPlans } = await import('../plans/plan-data.js');
        const allPlans = getPlans(contactId);

        for (const plan of allPlans) {
          // 如果计划有骰子结果（说明被处理过了），且在快照后
          if (plan.diceResult && plan.status === 'completed') {
            // 回退计划状态
            logger.debug('🔄 [计划回退] 发现被处理的计划:', plan.title, 'ID:', plan.id);

            // 清除骰子结果，状态改回pending
            updatePlanResult(contactId, plan.id, {
              diceResult: null,
              outcome: null,
              story: null,
              options: {}
            });
            updatePlanStatus(contactId, plan.id, 'pending');

            rollbackCount++;
            logger.info('🔄 [计划回退] 已回退计划:', plan.title);
          }
        }
      }

      // 如果是约定计划原始消息（user发起），且状态被修改过
      if (content.startsWith('[约定计划]') && !content.includes('接受') && !content.includes('拒绝')) {
        const plan = getPlanByMessageId(contactId, aiMsg.id);
        if (plan && (plan.status === 'completed' || plan.status === 'rejected')) {
          // 回退状态
          updatePlanStatus(contactId, plan.id, 'pending');
          if (plan.diceResult) {
            updatePlanResult(contactId, plan.id, {
              diceResult: null,
              outcome: null,
              story: null,
              options: {}
            });
          }
          rollbackCount++;
          logger.info('🔄 [计划回退] 已回退计划:', plan.title);
        }
      }
    }

    if (rollbackCount > 0) {
      logger.info('🔄 [计划回退] 共回退', rollbackCount, '个计划状态');
    } else {
      logger.debug('🔄 [计划回退] 没有需要回退的计划');
    }
  } catch (error) {
    logger.error('🔄 [计划回退] 回退失败:', error);
    // 不影响主流程，继续执行
  }

  logger.info('🔄 [重roll回退] ========== 回退完成 ==========');
}

/**
 * 查找当前活跃的聊天页面
 * @private
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement|null} 页面元素
 */
function findActiveChatPage(contactId) {
  const sanitizedId = contactId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const page = document.getElementById(`page-chat-${sanitizedId}`);

  // 检查页面是否存在且可见
  if (page && page.classList.contains('active')) {
    return page;
  }

  return null;
}

/**
 * 构建消息编号映射表
 * @private
 * @param {Array<Object>} chatHistory - 聊天记录数组
 * @returns {Map<number, string>} 编号→消息ID的映射表
 * 
 * @description
 * 为所有历史消息分配编号，供引用消息解析使用
 * 编号从1开始递增，与AI上下文中的编号保持一致
 */
function buildMessageNumberMap(chatHistory) {
  const messageNumberMap = new Map();
  let currentNumber = 1;

  for (const msg of chatHistory) {
    if (msg.id) {
      messageNumberMap.set(currentNumber, msg.id);
      currentNumber++;
    }
  }

  logger.debug('[Debug.buildMessageNumberMap] 构建映射表完成，共', messageNumberMap.size, '条消息');
  return messageNumberMap;
}

