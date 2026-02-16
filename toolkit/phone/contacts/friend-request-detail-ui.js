/**
 * 好友申请详情页
 * @module phone/contacts/friend-request-detail-ui
 * 
 * @description
 * 显示AI感知删除的好友详细信息、附加消息历史、概率设置等
 */

import logger from '../../../logger.js';
import { getAIAwareDeletedRequests, updateReapplyConfig, markReapplyMessagesAsRead, removeAIAwareDeletedRequest, deleteReapplyMessage } from './contact-list-data.js';
import { saveContact } from './contact-list-data.js';
import { getThumbnailUrl } from '../../../../../../../script.js';
import { formatTime } from '../utils/time-helper.js';
import { showConfirmPopup } from '../utils/popup-helper.js';
import { showSuccessToast } from '../ui-components/toast-notification.js';
import { addSystemMessage } from '../messages/message-chat-data.js';
import { getCurrentTimestamp } from '../utils/time-helper.js';
import { registerListener, destroyPageListeners } from '../utils/listener-manager.js';

// 存储当前页面的 contactId
let currentContactId = null;

// 用于跟踪当前显示删除按钮的消息项（移动端）
let activeMessageItem = null;
let hideActionsTimer = null;

/**
 * 渲染好友申请详情页
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 详情页内容片段
 */
export async function renderFriendRequestDetail(contactId) {
  logger.debug('phone','[FriendRequestDetail] 渲染详情页:', contactId);

  try {
    // 保存当前 contactId
    currentContactId = contactId;

    // 获取申请数据
    const requests = await getAIAwareDeletedRequests();
    const request = requests.find(r => r.contactId === contactId);

    if (!request) {
      logger.warn('phone','[FriendRequestDetail] 未找到申请数据:', contactId);
      return createEmptyFragment();
    }

    // 标记所有消息为已读
    await markReapplyMessagesAsRead(contactId);

    const fragment = document.createDocumentFragment();

    // 创建页面容器
    // 注意：将contactId中的特殊字符（空格、特殊符号）转为下划线，避免querySelector失败
    const safeContactId = contactId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const page = document.createElement('div');
    page.className = 'friend-request-detail-page';
    page.id = `page-friend-request-${safeContactId}`;
    page.dataset.contactId = contactId;  // 保存原始contactId，用于数据查询

    // 顶部栏
    page.appendChild(createHeader(request));

    // 内容区域
    const contentContainer = document.createElement('div');
    contentContainer.className = 'friend-request-detail-content';

    // 删除提示
    contentContainer.appendChild(createDeleteHint(request));

    // 概率设置（放在消息列表之前，避免被挤下去）
    contentContainer.appendChild(createProbabilitySettings(request));

    // 底部操作按钮（放在消息列表之前，避免被挤下去）
    contentContainer.appendChild(createActionButtons(request));

    // 附加消息列表（放在最后，即使很长也不会影响上面的设置和按钮）
    if (request.reapplyMessages.length > 0) {
      contentContainer.appendChild(createMessageList(request));
    } else {
      contentContainer.appendChild(createEmptyHint());
    }

    page.appendChild(contentContainer);
    fragment.appendChild(page);

    // 绑定事件监听（传入 pageId 用于管理监听器）
    bindEventListeners(page.id);

    logger.info('phone','[FriendRequestDetail] 详情页渲染完成:', request.contactName);
    return fragment;
  } catch (error) {
    logger.error('phone','[FriendRequestDetail] 渲染详情页失败:', error);
    return createEmptyFragment();
  }
}

/**
 * 创建顶部栏
 * 
 * @private
 * @param {Object} request - 申请对象
 * @returns {HTMLElement} 顶部栏元素
 */
function createHeader(request) {
  const header = document.createElement('div');
  header.className = 'friend-request-detail-header';
  header.innerHTML = `
    <button class="friend-request-detail-back">
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <div class="friend-request-detail-title">${request.contactName}</div>
  `;

  // 返回按钮
  const backBtn = header.querySelector('.friend-request-detail-back');
  backBtn.addEventListener('click', handleBack);

  return header;
}

/**
 * 创建删除提示
 * 
 * @private
 * @param {Object} request - 申请对象
 * @returns {HTMLElement} 删除提示元素
 */
function createDeleteHint(request) {
  const container = document.createElement('div');
  container.className = 'friend-request-delete-hint';

  const avatarUrl = getThumbnailUrl('avatar', request.avatar);
  const deleteTimeText = formatTime(request.deleteTime);

  container.innerHTML = `
    <img src="${avatarUrl}" alt="头像" class="friend-request-detail-avatar">
    <div class="friend-request-delete-text">
      {{user}}于 ${deleteTimeText} 删除了你为好友
    </div>
  `;

  return container;
}

/**
 * 创建附加消息列表
 * 
 * @private
 * @param {Object} request - 申请对象
 * @returns {HTMLElement} 消息列表元素
 */
function createMessageList(request) {
  const container = document.createElement('div');
  container.className = 'friend-request-message-list';

  const title = document.createElement('div');
  title.className = 'friend-request-section-title';
  title.textContent = '好友申请历史';
  container.appendChild(title);

  // 消息列表（倒序显示，最新的在上面）
  const messages = [...request.reapplyMessages].reverse();
  messages.forEach((msg, index) => {
    const item = document.createElement('div');
    item.className = 'friend-request-message-item';
    item.dataset.messageIndex = index.toString();

    const timeText = formatTime(msg.time);
    item.innerHTML = `
      <div class="friend-request-message-content">
        <div class="friend-request-message-text">${escapeHtml(msg.message)}</div>
        <div class="friend-request-message-meta">
          <span class="friend-request-message-time">${timeText}</span>
        </div>
      </div>
      <div class="friend-request-message-actions">
        <button class="friend-request-delete-message-btn" data-message-index="${index}" title="删除">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;

    // 点击消息项显示/隐藏删除按钮（移动端）
    item.addEventListener('click', (e) => {
      // 如果点击的是删除按钮本身，不处理
      if (e.target.closest('.friend-request-delete-message-btn')) {
        return;
      }

      handleToggleDeleteButton(item, container);
    });

    // 绑定删除按钮
    const deleteBtn = item.querySelector('.friend-request-delete-message-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // 防止触发消息项的点击事件
      await handleDeleteMessage(request, index, item);
    });

    container.appendChild(item);
  });

  return container;
}

/**
 * 创建空提示
 * 
 * @private
 * @returns {HTMLElement} 空提示元素
 */
function createEmptyHint() {
  const hint = document.createElement('div');
  hint.className = 'friend-request-empty-hint';
  hint.textContent = '暂无好友申请消息';
  return hint;
}

/**
 * 创建概率设置
 * 
 * @private
 * @param {Object} request - 申请对象
 * @returns {HTMLElement} 概率设置元素
 */
function createProbabilitySettings(request) {
  const container = document.createElement('div');
  container.className = 'friend-request-probability-settings';

  const title = document.createElement('div');
  title.className = 'friend-request-section-title';
  title.textContent = '继续申请设置';
  container.appendChild(title);

  const hint = document.createElement('div');
  hint.className = 'friend-request-probability-hint';
  hint.textContent = '当你与其他角色聊天时，此角色有一定概率再次申请加好友';
  container.appendChild(hint);

  // 滑块容器
  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'friend-request-slider-container';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = request.reapplyConfig.probability.toString();
  slider.className = 'friend-request-probability-slider';

  const valueDisplay = document.createElement('div');
  valueDisplay.className = 'friend-request-probability-value';
  valueDisplay.textContent = `${request.reapplyConfig.probability}%`;

  // 滑块事件
  slider.addEventListener('input', async (e) => {
    const value = parseInt(e.target.value);
    valueDisplay.textContent = `${value}%`;

    // 保存配置
    const allowReapply = value > 0;
    await updateReapplyConfig(request.contactId, {
      allowReapply: allowReapply,
      probability: value
    });

    logger.info('phone','[FriendRequestDetail] 更新概率设置:', request.contactName, value);
  });

  sliderContainer.appendChild(slider);
  sliderContainer.appendChild(valueDisplay);
  container.appendChild(sliderContainer);

  // 状态提示
  const status = document.createElement('div');
  status.className = 'friend-request-probability-status';
  status.textContent = request.reapplyConfig.probability === 0
    ? '已禁止继续申请'
    : '已允许继续申请';
  container.appendChild(status);

  return container;
}

/**
 * 创建操作按钮
 * 
 * @private
 * @param {Object} request - 申请对象
 * @returns {HTMLElement} 操作按钮容器
 */
function createActionButtons(request) {
  const container = document.createElement('div');
  container.className = 'friend-request-action-buttons';

  // 不通过按钮
  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'friend-request-btn friend-request-btn-reject';
  rejectBtn.textContent = '不通过';
  rejectBtn.addEventListener('click', () => handleReject(request));

  // 同意按钮
  const agreeBtn = document.createElement('button');
  agreeBtn.className = 'friend-request-btn friend-request-btn-agree';
  agreeBtn.textContent = '同意';
  agreeBtn.addEventListener('click', () => handleAgree(request));

  container.appendChild(rejectBtn);
  container.appendChild(agreeBtn);

  return container;
}

/**
 * 处理返回
 * 
 * @private
 */
async function handleBack() {
  logger.info('phone','[FriendRequestDetail] 点击返回按钮');

  // 获取手机遮罩层元素
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    // 动态导入 hidePage 函数
    const { hidePage } = await import('../phone-main-ui.js');
    hidePage(overlayElement, 'friend-request-detail');
  }
}

/**
 * 处理不通过
 * 
 * @private
 * @async
 * @param {Object} request - 申请对象
 */
async function handleReject(request) {
  logger.info('phone','[FriendRequestDetail] 点击不通过:', request.contactName);

  // 确认
  const confirmed = await showConfirmPopup(
    '确认不通过',
    `确定不通过"${request.contactName}"的好友申请吗？\n\n此操作会从申请列表中移除该角色。`,
    {
      danger: true,
      okButton: '不通过',
      cancelButton: '取消'
    }
  );

  if (!confirmed) {
    return;
  }

  // 移除申请
  await removeAIAwareDeletedRequest(request.contactId);
  showSuccessToast(`已拒绝"${request.contactName}"的好友申请`);

  // 返回新朋友页面
  const pageStackModule = await import('../utils/page-stack-helper.js');
  const pageStack = pageStackModule.default;
  pageStack.popPage();

  // 刷新新朋友页面
  const { refreshNewFriendsPage } = await import('./contact-list-ui.js');
  await refreshNewFriendsPage();
}

/**
 * 处理同意
 * 
 * @private
 * @async
 * @param {Object} request - 申请对象
 */
async function handleAgree(request) {
  logger.info('phone','[FriendRequestDetail] 点击同意:', request.contactName);

  try {
    // 1. 恢复联系人到列表
    const contact = {
      id: request.contactId,
      name: request.contactName,
      avatar: request.avatar,
      source: 'tavern',
      groupId: 'group_default_tavern'
    };

    await saveContact(contact);
    logger.info('phone','[FriendRequestDetail] 已恢复联系人:', request.contactName);

    // 2. 插入系统消息："{{user}}添加了你为好友"
    const currentTime = getCurrentTimestamp();
    await addSystemMessage(request.contactId, {
      type: 'friend_added',
      content: '{{user}}添加了你为好友',
      time: currentTime
    });
    logger.info('phone','[FriendRequestDetail] 已插入系统消息');

    // 3. 从AI感知删除列表中移除
    await removeAIAwareDeletedRequest(request.contactId);

    // 4. 显示成功通知
    showSuccessToast(`已同意"${request.contactName}"的好友申请`);

    // 5. 返回新朋友页面
    const pageStackModule = await import('../utils/page-stack-helper.js');
    const pageStack = pageStackModule.default;
    pageStack.popPage();

    // 6. 刷新新朋友页面和联系人列表
    const { refreshNewFriendsPage } = await import('./contact-list-ui.js');
    await refreshNewFriendsPage();

  } catch (error) {
    logger.error('phone','[FriendRequestDetail] 同意申请失败:', error);
  }
}

/**
 * 创建空片段
 * 
 * @private
 * @returns {DocumentFragment} 空片段
 */
function createEmptyFragment() {
  return document.createDocumentFragment();
}

/**
 * HTML转义
 * 
 * @private
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 绑定事件监听（使用监听器管理中心，自动管理生命周期）
 * 
 * @param {string} pageId - 页面ID（用于清理监听器）
 */
export function bindEventListeners(pageId) {
  // 监听 AI 生成完成事件，局部刷新消息列表
  registerListener(
    pageId,
    'phone-ai-generation-complete',
    handleAIGenerationComplete
  );

  logger.debug('phone','[FriendRequestDetail] 已绑定AI生成完成事件，pageId:', pageId);
}

/**
 * 处理AI生成完成事件
 * 
 * @private
 * @async
 */
async function handleAIGenerationComplete() {
  if (!currentContactId) return;

  logger.info('phone','[FriendRequestDetail] 检测到AI生成完成，准备刷新页面');

  // 等待一小段时间，确保数据已保存（增加延迟，确保存储操作完成）
  await new Promise(resolve => setTimeout(resolve, 200));

  // 刷新页面
  await refreshCurrentPage();
}

/**
 * 刷新当前页面的消息列表（局部更新，不重新渲染整个页面）
 * 
 * @private
 * @async
 */
async function refreshCurrentPage() {
  if (!currentContactId) return;

  logger.debug('phone','[FriendRequestDetail] 局部刷新消息列表:', currentContactId);

  try {
    // 获取最新数据
    const requests = await getAIAwareDeletedRequests();
    const request = requests.find(r => r.contactId === currentContactId);

    if (!request) {
      logger.warn('phone','[FriendRequestDetail] 未找到申请数据，页面可能已关闭');
      return;
    }

    // 查找页面元素（处理特殊字符，将非字母数字字符替换为下划线）
    const safeContactId = currentContactId.replace(/[^a-zA-Z0-9_-]/g, '_');
    let page = document.querySelector(`#page-friend-request-${safeContactId}`);

    // 如果使用安全ID找不到，尝试通过dataset查找（兼容旧数据和特殊字符）
    if (!page) {
      const allPages = document.querySelectorAll('.friend-request-detail-page');
      for (const p of allPages) {
        if ((p instanceof HTMLElement) && p.dataset.contactId === currentContactId) {
          page = p;
          break;
        }
      }
    }

    // 如果还是找不到，尝试使用原始ID（兼容旧数据）
    if (!page) {
      page = document.querySelector(`#page-friend-request-${currentContactId}`);
    }

    if (!page) {
      logger.warn('phone','[FriendRequestDetail] 未找到页面元素，contactId:', currentContactId);
      return;
    }

    // 查找内容容器
    const contentContainer = page.querySelector('.friend-request-detail-content');
    if (!contentContainer) {
      logger.warn('phone','[FriendRequestDetail] 未找到内容容器');
      return;
    }

    // 清空并重新渲染消息列表
    const oldMessageList = contentContainer.querySelector('.friend-request-message-list');
    const oldEmptyHint = contentContainer.querySelector('.friend-request-empty-hint');

    if (oldMessageList) {
      oldMessageList.remove();
    }
    if (oldEmptyHint) {
      oldEmptyHint.remove();
    }

    // 重新插入消息列表（在操作按钮之后）
    const actionButtons = contentContainer.querySelector('.friend-request-action-buttons');
    if (!actionButtons) {
      logger.warn('phone','[FriendRequestDetail] 未找到操作按钮元素');
      return;
    }

    if (request.reapplyMessages.length > 0) {
      const newMessageList = createMessageList(request);
      actionButtons.after(newMessageList);
      logger.info('phone','[FriendRequestDetail] 消息列表已局部刷新，消息数量:', request.reapplyMessages.length);
    } else {
      const emptyHint = createEmptyHint();
      actionButtons.after(emptyHint);
      logger.info('phone','[FriendRequestDetail] 消息列表已局部刷新，暂无消息');
    }

  } catch (error) {
    logger.error('phone','[FriendRequestDetail] 局部刷新消息列表失败:', error);
  }
}

/**
 * 切换删除按钮显示状态（移动端点击，PC端悬停）
 * 
 * @private
 * @param {HTMLElement} clickedItem - 被点击的消息项
 * @param {HTMLElement} container - 容器元素
 */
function handleToggleDeleteButton(clickedItem, container) {
  // 先隐藏所有其他项的删除按钮
  const allItems = container.querySelectorAll('.friend-request-message-item');
  allItems.forEach(item => {
    if (item !== clickedItem) {
      item.classList.remove('show-actions');
    }
  });

  // 清除之前的定时器
  if (hideActionsTimer) {
    clearTimeout(hideActionsTimer);
    hideActionsTimer = null;
  }

  // 切换当前项的删除按钮
  const isShowing = clickedItem.classList.contains('show-actions');
  if (isShowing) {
    clickedItem.classList.remove('show-actions');
    activeMessageItem = null;
  } else {
    clickedItem.classList.add('show-actions');
    activeMessageItem = clickedItem;

    // 手机端3秒后自动隐藏
    if (window.innerWidth <= 768) {
      hideActionsTimer = setTimeout(() => {
        clickedItem.classList.remove('show-actions');
        if (activeMessageItem === clickedItem) {
          activeMessageItem = null;
        }
      }, 3000);
    }
  }
}

/**
 * 删除好友申请消息
 * 
 * @private
 * @async
 * @param {Object} request - 申请对象
 * @param {number} index - 消息索引（倒序后的索引）
 * @param {HTMLElement} messageItemElement - 消息项DOM元素（可选，用于直接删除）
 */
async function handleDeleteMessage(request, index, messageItemElement) {
  logger.info('phone','[FriendRequestDetail] 删除好友申请消息:', index);

  try {
    // 重要：删除前先重新加载最新数据，确保使用正确的数组长度
    const requests = await getAIAwareDeletedRequests();
    const currentRequest = requests.find(r => r.contactId === request.contactId);

    if (!currentRequest) {
      logger.warn('phone','[FriendRequestDetail] 未找到申请数据:', request.contactId);
      return;
    }

    // 倒序索引转回正序（使用最新的数组长度）
    const actualIndex = currentRequest.reapplyMessages.length - 1 - index;

    // 验证索引范围
    if (actualIndex < 0 || actualIndex >= currentRequest.reapplyMessages.length) {
      logger.warn('phone','[FriendRequestDetail] 消息索引超出范围:', {
        uiIndex: index,
        actualIndex: actualIndex,
        arrayLength: currentRequest.reapplyMessages.length,
        contactId: request.contactId
      });
      // 如果索引无效，刷新页面重新加载数据
      await refreshCurrentPage();
      return;
    }

    // 使用数据管理器删除消息
    const success = await deleteReapplyMessage(request.contactId, actualIndex);

    if (!success) {
      logger.warn('phone','[FriendRequestDetail] 删除消息失败');
      return;
    }

    // 删除后重新刷新消息列表（确保数据同步）
    await refreshCurrentPage();

    showSuccessToast('已删除消息');

  } catch (error) {
    logger.error('phone','[FriendRequestDetail] 删除消息失败:', error);
    // 出错时也尝试刷新页面
    await refreshCurrentPage();
  }
}

/**
 * 清理事件监听（使用监听器管理中心自动清理）
 * 
 * @export
 * @param {string} pageId - 页面ID
 */
export function cleanupEventListeners(pageId) {
  destroyPageListeners(pageId);
  logger.debug('phone','[FriendRequestDetail] 已清理事件监听，pageId:', pageId);
  currentContactId = null;
}

