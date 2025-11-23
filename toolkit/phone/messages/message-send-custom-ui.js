/**
 * 消息发送管理页面
 * @module phone/messages/message-send-custom-ui
 * 
 * @description
 * 可视化管理聊天记录的发送策略：
 * - 最新消息发送到[QQ聊天记录]（预设管理）
 * - 历史消息发送到[历史聊天记录]（角色总条目）
 * - 超出范围的消息不发送
 * - 支持手动排除/恢复单条消息
 * - 支持多选批量操作
 */

import logger from '../../../logger.js';
import { loadChatHistory, updateChatSendSettings, getChatSendSettings } from './message-chat-data.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { getThumbnailUrl, user_avatar } from '../../../../../../../script.js';
import { showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';
import { formatTimeForMessageList } from '../utils/time-helper.js';
import { renderTextMessage } from './message-types/text-message.js';
import { renderEmojiMessage } from './message-types/emoji-message.js';
import { renderImageMessage } from './message-types/image-message.js';
import { renderQuoteMessage } from './message-types/quote-message.js';
import { renderTransferMessage } from './message-types/transfer-message.js';
import { renderRecalledMessage } from './message-types/recalled-message.js';
import { renderPlanMessage } from './message-types/plan-message.js';
import { renderPlanStoryMessage } from './message-types/plan-story-message.js';
import { renderPokeMessage } from './message-types/poke-message.js';

/**
 * 渲染消息发送管理页面
 * 
 * @param {Object} params - 参数对象
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderMessageSendCustom(params) {
  const { contactId } = params;
  logger.debug('[MessageSendCustom] 渲染消息发送管理页:', contactId);

  try {
    // 加载联系人数据
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('[MessageSendCustom] 未找到联系人:', contactId);
      return createErrorView();
    }

    // 加载聊天记录
    const allMessages = await loadChatHistory(contactId);

    // 加载发送设置
    const sendSettings = getChatSendSettings(contactId);

    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'msg-send-custom-page';
    container.dataset.contactId = contactId;

    // 1. 顶部栏
    container.appendChild(createTopBar(contact));

    // 2. 提示区域
    container.appendChild(createHintArea(sendSettings));

    // 3. 工具栏
    container.appendChild(createToolbar(container, contactId));

    // 4. 消息列表（带分割线）
    container.appendChild(await createMessageList(allMessages, contact, sendSettings, contactId));

    fragment.appendChild(container);


    logger.info('[MessageSendCustom] 页面渲染完成');
    return fragment;
  } catch (error) {
    logger.error('[MessageSendCustom] 渲染失败:', error);
    return createErrorView();
  }
}

/**
 * 创建顶部栏
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement}
 */
function createTopBar(contact) {
  const topBar = document.createElement('div');
  topBar.className = 'msg-send-custom-topbar';

  const displayName = getContactDisplayName(contact);

  topBar.innerHTML = `
        <button class="msg-send-custom-back-btn">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="msg-send-custom-title">消息发送管理 - ${displayName}</div>
    `;

  // 返回按钮
  const backBtn = topBar.querySelector('.msg-send-custom-back-btn');
  backBtn.addEventListener('click', () => handleBack());

  return topBar;
}

/**
 * 创建提示区域
 * @param {Object} sendSettings - 发送设置
 * @returns {HTMLElement}
 */
function createHintArea(sendSettings) {
  const hintArea = document.createElement('div');
  hintArea.className = 'msg-send-custom-hint';

  hintArea.innerHTML = `
        <i class="fa-solid fa-info-circle"></i>
        <div>
            <div>最新 <strong>${sendSettings.recentCount}</strong> 条发送到 [QQ聊天记录]</div>
            <div>往期 <strong>${sendSettings.historyCount}</strong> 条发送到 [历史聊天记录]</div>
            <div>超出范围的消息不发送（可通过多选恢复）</div>
        </div>
    `;

  return hintArea;
}

/**
 * 创建工具栏
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement}
 */
function createToolbar(container, contactId) {
  const toolbar = document.createElement('div');
  toolbar.className = 'msg-send-custom-toolbar';

  toolbar.innerHTML = `
        <button class="msg-send-custom-select-btn" id="toggle-select-mode">
            <i class="fa-solid fa-check-square"></i>
            多选模式
        </button>
        <div class="msg-send-custom-select-actions" id="select-actions" style="display: none;">
            <button class="msg-send-custom-action-btn" id="exclude-selected">
                <i class="fa-solid fa-eye-slash"></i>
                标记为不发送
            </button>
            <button class="msg-send-custom-action-btn" id="include-selected">
                <i class="fa-solid fa-eye"></i>
                恢复发送
            </button>
            <button class="msg-send-custom-action-btn msg-send-custom-cancel" id="cancel-select">
                取消
            </button>
        </div>
    `;

  // 绑定事件
  bindToolbarEvents(toolbar, container, contactId);

  return toolbar;
}

/**
 * 创建消息列表（所有消息按原始顺序渲染，分割线动态插入）
 * 
 * @description
 * 核心设计：消息永远不移动位置，只改变视觉状态
 * - 所有消息按时间顺序渲染（不分段）
 * - 分割线根据设置动态插入
 * - 被排除的消息停留在原地，只改半透明状态
 * - 分割线数量动态计算（跳过被排除的消息）
 * 
 * @param {Array<Object>} allMessages - 所有消息
 * @param {Object} contact - 联系人对象
 * @param {Object} sendSettings - 发送设置
 * @param {string} contactId - 联系人ID
 * @returns {Promise<HTMLElement>}
 */
async function createMessageList(allMessages, contact, sendSettings, contactId) {
  const listContainer = document.createElement('div');
  listContainer.className = 'msg-send-custom-list';
  listContainer.dataset.contactId = contactId;

  if (allMessages.length === 0) {
    listContainer.innerHTML = '<div class="msg-send-custom-empty">暂无聊天记录</div>';
    return listContainer;
  }

  // 1. 渲染所有消息（按原始顺序，不分段，不移动）
  for (const msg of allMessages) {
    const item = await createMessageBubble(msg, contact, contactId);
    listContainer.appendChild(item);
  }

  // 2. 动态插入分割线（根据设置计算位置）
  insertDividers(listContainer, allMessages, sendSettings);

  // 3. 绑定分割线自动更新监听器
  bindDividerUpdater(listContainer, contactId, sendSettings);

  // 自动滚动到底部
  setTimeout(() => {
    listContainer.scrollTop = listContainer.scrollHeight;
  }, 100);

  return listContainer;
}

/**
 * 动态插入分割线（根据设置计算位置，跳过被排除的消息）
 * 
 * @description
 * 核心算法（符合QQ真实行为）：
 * 1. 最新消息分割线 → 永远在最底部（最后一条消息下方）
 * 2. 历史消息分割线 → 从后往前数，跳过被排除的消息，找到第recentCount条有效消息的上方
 * 3. 存档消息分割线 → 从后往前数，找到第(recentCount+historyCount)条有效消息的上方
 * 4. 分割线文字显示配置数量（如"以上5条最新消息"）
 * 
 * @param {HTMLElement} listContainer - 消息列表容器
 * @param {Array<Object>} allMessages - 所有消息数据
 * @param {Object} sendSettings - 发送设置
 */
function insertDividers(listContainer, allMessages, sendSettings) {
  const { recentCount, historyCount } = sendSettings;

  // 清除旧分割线
  listContainer.querySelectorAll('.msg-send-divider').forEach(div => div.remove());

  // 获取所有消息项DOM（按时间从旧到新）
  const items = Array.from(listContainer.querySelectorAll('.msg-send-item'));

  if (items.length === 0) return;

  // 1. 最新消息分割线 → 永远在最底部
  const lastItem = items[items.length - 1];
  const recentDivider = createDivider('recent', sendSettings);
  lastItem.insertAdjacentElement('afterend', recentDivider);
  logger.debug('[MessageSendCustom] 插入最新消息分割线（最底部）');

  // 2. 从后往前遍历，找到第recentCount条有效消息的上方 → 插入历史分割线
  let validCount = 0;
  let historyDividerInserted = false;
  let archivedDividerInserted = false;

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const isExcluded = item.dataset.excluded === 'true';

    // 跳过被排除的消息
    if (isExcluded) {
      continue;
    }

    validCount++;

    // 达到历史消息阈值 → 在这条消息的上方插入"历史消息"分割线
    if (!historyDividerInserted && validCount === recentCount) {
      const divider = createDivider('history', sendSettings);
      item.insertAdjacentElement('beforebegin', divider);
      historyDividerInserted = true;
      logger.debug('[MessageSendCustom] 插入历史消息分割线，位置:', i, '有效消息数:', validCount);
    }

    // 达到存档消息阈值 → 在这条消息的上方插入"存档消息"分割线
    if (!archivedDividerInserted && validCount === recentCount + historyCount) {
      const divider = createDivider('archived', sendSettings);
      item.insertAdjacentElement('beforebegin', divider);
      archivedDividerInserted = true;
      logger.debug('[MessageSendCustom] 插入存档消息分割线，位置:', i, '有效消息数:', validCount);
    }
  }
}

/**
 * 绑定分割线自动更新监听器（MutationObserver）
 * 
 * @description
 * 监听消息的 data-excluded 属性变化，自动重新计算分割线位置
 * 页面销毁时自动清理监听器（防止内存泄漏）
 * 
 * @param {HTMLElement} listContainer - 消息列表容器
 * @param {string} contactId - 联系人ID
 * @param {Object} sendSettings - 发送设置
 */
function bindDividerUpdater(listContainer, contactId, sendSettings) {
  /**
   * 处理属性变化事件
   * @param {MutationRecord[]} mutations - 变更记录
   */
  const handleMutation = (mutations) => {
    // 检查是否有 data-excluded 属性变化
    const hasExcludedChange = mutations.some(mutation =>
      mutation.type === 'attributes' &&
      mutation.attributeName === 'data-excluded'
    );

    if (hasExcludedChange) {
      logger.debug('[MessageSendCustom] 检测到消息排除状态变化，更新分割线');
      updateDividers(listContainer, contactId, sendSettings);
    }
  };

  // 创建 MutationObserver
  const observer = new MutationObserver(handleMutation);

  // 监听列表容器的子元素属性变化
  observer.observe(listContainer, {
    attributes: true,
    attributeFilter: ['data-excluded'],
    subtree: true  // 监听所有子元素
  });

  logger.debug('[MessageSendCustom] 已绑定分割线自动更新监听器');

  // 页面销毁时自动清理监听器（使用父容器的 MutationObserver）
  const parentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === listContainer || (node instanceof HTMLElement && node.contains(listContainer))) {
          observer.disconnect();
          parentObserver.disconnect();
          logger.debug('[MessageSendCustom] 页面销毁，已清理分割线监听器');
        }
      });
    });
  });

  if (listContainer.parentElement) {
    parentObserver.observe(listContainer.parentElement, { childList: true });
  }
}

/**
 * 更新分割线位置（重新计算并插入）
 * 
 * @description
 * 从所有消息项中重新读取当前状态，重新计算分割线位置
 * 
 * @param {HTMLElement} listContainer - 消息列表容器
 * @param {string} contactId - 联系人ID
 * @param {Object} sendSettings - 发送设置
 */
async function updateDividers(listContainer, contactId, sendSettings) {
  // 从DOM读取当前所有消息的状态（实时读取，不依赖旧数据）
  const items = Array.from(listContainer.querySelectorAll('.msg-send-item'));

  // 构造消息数据数组（只需要 excluded 状态）
  const messagesState = items.map(item => ({
    excluded: item.dataset.excluded === 'true'
  }));

  // 调用插入分割线函数（会自动清除旧分割线）
  insertDividers(listContainer, messagesState, sendSettings);
}

/**
 * 创建分割线
 * @param {string} type - 分割线类型（'recent'|'history'|'archived'）
 * @param {Object} sendSettings - 发送设置
 * @returns {HTMLElement}
 */
function createDivider(type, sendSettings) {
  const divider = document.createElement('div');
  divider.className = `msg-send-divider msg-send-divider-${type}`;

  let mainText = '';
  let subText = '';

  if (type === 'recent') {
    mainText = `以上 ${sendSettings.recentCount} 条最新消息`;
    subText = '（对应主界面右上角`预设`管理页 → QQ聊天记录）';
  } else if (type === 'history') {
    mainText = `以上 ${sendSettings.historyCount} 条历史消息`;
    subText = '（对应`聊天设置`→`角色提示词设置` → 历史聊天记录）';
  } else if (type === 'archived') {
    mainText = '以上消息超出设置范围（不发送AI）';
    subText = '可通过多选模式恢复发送';
  }

  divider.innerHTML = `
    <div class="msg-send-divider-main">${mainText}</div>
    <div class="msg-send-divider-sub">${subText}</div>
  `;

  return divider;
}

/**
 * 创建消息项（复用聊天页面渲染器）
 * 
 * @description
 * 复用所有消息类型渲染器，保持和主聊天界面完全一致的视觉效果
 * 在外层包装时间、复选框、排除状态等额外功能
 * 
 * @param {Object} message - 消息对象
 * @param {Object} contact - 联系人对象
 * @param {string} contactId - 联系人ID
 * @returns {Promise<HTMLElement>}
 */
async function createMessageBubble(message, contact, contactId) {
  // 1. 复用聊天页面的渲染器（得到完全一致的气泡）
  let innerBubble;

  switch (message.type) {
    case 'emoji':
      innerBubble = renderEmojiMessage(message, contact, contactId);
      break;

    case 'text':
      // 检查是否是个签更新消息
      if (message.content?.startsWith('[改个签]')) {
        const { renderSignatureMessage } = await import('./message-types/signature-message.js');
        innerBubble = renderSignatureMessage(message, contactId, contact);
      }
      // 检查是否是计划剧情消息
      else if (message.content?.match(/^\[约定计划(过程|内心印象|过程记录)\]/)) {
        innerBubble = renderPlanStoryMessage(message, contactId);
      }
      // 检查是否是计划消息
      else if (message.content?.startsWith('[约定计划')) {
        innerBubble = await renderPlanMessage(message, contact, contactId);
        // 如果返回 null（例如旧数据的响应消息缺少 quotedPlanId），降级为普通文本
        if (!innerBubble) {
          logger.debug('[MessageSendCustom] 计划消息渲染器返回null，降级为普通文本');
          innerBubble = renderTextMessage(message, contact, contactId);
        }
      } else {
        innerBubble = renderTextMessage(message, contact, contactId);
      }
      break;

    case 'image':
    case 'image-real':  // ✅ 新增：真实图片类型
    case 'image-fake':  // ✅ 新增：假装图片类型
      innerBubble = renderImageMessage(message, contact, contactId);
      break;

    case 'quote':
      innerBubble = renderQuoteMessage(message, contact, contactId);
      break;

    case 'transfer':
      innerBubble = renderTransferMessage(message, contact, contactId);
      break;

    case 'recalled':
      // 已撤回消息（直接显示撤回提示）
      innerBubble = renderRecalledMessage(message, contact, contactId);
      break;

    case 'recalled-pending':
      // 待撤回消息（在发送管理页面直接显示原消息，不触发动画）
      innerBubble = renderTextMessage(message, contact, contactId);
      logger.debug('[MessageSendCustom] 待撤回消息（发送管理页不触发动画）');
      break;

    case 'friend_added':
      // 添加好友系统消息（居中显示）
      {
        const { renderFriendAddedMessage } = await import('./message-types/friend-added-message.js');
        innerBubble = renderFriendAddedMessage(message);
      }
      break;

    case 'poke':
      // 戳一戳消息
      innerBubble = renderPokeMessage(message, contact, contactId);
      break;

    case 'forwarded':
      // 转发消息
      {
        const { renderForwardedMessage: renderForwarded } = await import('./message-types/forwarded-message.js');
        innerBubble = renderForwarded(message, contact, contactId);
      }
      break;

    // TODO 第二期：实现专门的渲染器
    // 临时降级：显示为文字提示
    case 'redpacket':
      innerBubble = renderTextMessage({
        ...message,
        content: `[红包] ¥${message.amount}`,
        type: 'text'
      }, contact, contactId);
      break;

    case 'video':
      innerBubble = renderTextMessage({
        ...message,
        content: `[视频] ${message.description}`,
        type: 'text'
      }, contact, contactId);
      break;

    case 'file':
      innerBubble = renderTextMessage({
        ...message,
        content: `[文件] ${message.filename} (${message.size})`,
        type: 'text'
      }, contact, contactId);
      break;

    default:
      // 未知类型，降级为文字
      logger.warn('[MessageSendCustom] 未知消息类型:', message.type);
      innerBubble = renderTextMessage({
        ...message,
        content: message.content || '[未知消息类型]',
        type: 'text'
      }, contact, contactId);
      break;
  }

  // 安全检查：确保 innerBubble 不为 null
  if (!innerBubble) {
    logger.error('[MessageSendCustom] 渲染器返回null，消息:', message);
    innerBubble = renderTextMessage({ ...message, content: message.content || '[渲染失败]', type: 'text' }, contact, contactId);
  }

  // 2. 创建外层容器（添加额外功能）
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-send-item';
  wrapper.dataset.time = message.time;
  wrapper.dataset.excluded = message.excluded ? 'true' : 'false';

  // 如果被排除，添加特殊类（CSS会添加半透明效果）
  if (message.excluded) {
    wrapper.classList.add('msg-send-item-excluded');
  }

  // 3. 时间 + 眼睛图标容器（放在气泡上方）
  const timeRow = document.createElement('div');
  timeRow.className = 'msg-send-item-time-row';

  // 时间显示（智能格式化：今天只显示时间，其他显示日期+时间）
  const timeLabel = document.createElement('span');
  timeLabel.className = 'msg-send-item-time';
  timeLabel.textContent = formatTimeForMessageList(message.time);
  timeRow.appendChild(timeLabel);

  // 眼睛图标（被排除时显示，放在时间旁边）
  if (message.excluded) {
    const eyeIcon = document.createElement('button');
    eyeIcon.className = 'msg-send-item-eye';
    eyeIcon.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    eyeIcon.title = '点击恢复发送';
    eyeIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      handleToggleExclude(message.time, contactId, false);
    });
    timeRow.appendChild(eyeIcon);
  }

  // 4. 多选复选框（初始隐藏，多选模式时显示在最左侧）
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'msg-send-item-checkbox';
  checkbox.dataset.time = message.time;
  checkbox.style.display = 'none';

  // 5. 组装（从上到下：时间行 → 消息气泡；复选框独立定位）
  wrapper.appendChild(checkbox);    // 复选框（绝对定位，最左侧）
  wrapper.appendChild(timeRow);     // 时间+眼睛图标
  wrapper.appendChild(innerBubble); // 消息气泡（复用渲染器）

  return wrapper;
}

/**
 * 绑定工具栏事件
 * @param {HTMLElement} toolbar - 工具栏元素
 * @param {HTMLElement} pageContainer - 页面容器
 * @param {string} contactId - 联系人ID
 */
function bindToolbarEvents(toolbar, pageContainer, contactId) {
  const toggleBtn = /** @type {HTMLElement} */ (toolbar.querySelector('#toggle-select-mode'));
  const selectActions = /** @type {HTMLElement} */ (toolbar.querySelector('#select-actions'));
  const excludeBtn = /** @type {HTMLElement} */ (toolbar.querySelector('#exclude-selected'));
  const includeBtn = /** @type {HTMLElement} */ (toolbar.querySelector('#include-selected'));
  const cancelBtn = /** @type {HTMLElement} */ (toolbar.querySelector('#cancel-select'));

  let isSelectMode = false;

  // 切换多选模式
  toggleBtn.addEventListener('click', () => {
    isSelectMode = !isSelectMode;

    if (isSelectMode) {
      enterSelectMode(pageContainer);
      toggleBtn.style.display = 'none';
      selectActions.style.display = 'flex';
    } else {
      exitSelectMode(pageContainer);
      toggleBtn.style.display = 'inline-flex';
      selectActions.style.display = 'none';
    }
  });

  // 标记为不发送（局部更新，不全局刷新）
  excludeBtn.addEventListener('click', async () => {
    const selected = getSelectedMessages(pageContainer);
    if (selected.length === 0) {
      showErrorToast('请先选择消息');
      return;
    }

    await batchToggleExclude(selected, contactId, true);
    showSuccessToast(`已标记 ${selected.length} 条消息为不发送`);
  });

  // 恢复发送（局部更新，不全局刷新）
  includeBtn.addEventListener('click', async () => {
    const selected = getSelectedMessages(pageContainer);
    if (selected.length === 0) {
      showErrorToast('请先选择消息');
      return;
    }

    await batchToggleExclude(selected, contactId, false);
    showSuccessToast(`已恢复 ${selected.length} 条消息`);
  });

  // 取消
  cancelBtn.addEventListener('click', () => {
    isSelectMode = false;
    exitSelectMode(pageContainer);
    toggleBtn.style.display = 'inline-flex';
    selectActions.style.display = 'none';
  });
}

/**
 * 进入多选模式
 * @param {HTMLElement} pageContainer - 页面容器
 */
function enterSelectMode(pageContainer) {
  const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (
    pageContainer.querySelectorAll('.msg-send-item-checkbox')
  );
  checkboxes.forEach(cb => {
    cb.style.display = 'block';
    cb.checked = false;
  });

  // 添加多选模式类
  const listContainer = /** @type {HTMLElement} */ (pageContainer.querySelector('.msg-send-custom-list'));
  if (listContainer) {
    listContainer.classList.add('select-mode');
  }
}

/**
 * 退出多选模式
 * @param {HTMLElement} pageContainer - 页面容器
 */
function exitSelectMode(pageContainer) {
  const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (
    pageContainer.querySelectorAll('.msg-send-item-checkbox')
  );
  checkboxes.forEach(cb => {
    cb.style.display = 'none';
    cb.checked = false;
  });

  // 移除多选模式类
  const listContainer = /** @type {HTMLElement} */ (pageContainer.querySelector('.msg-send-custom-list'));
  if (listContainer) {
    listContainer.classList.remove('select-mode');
  }
}

/**
 * 获取选中的消息时间戳
 * @param {HTMLElement} pageContainer - 页面容器
 * @returns {Array<number>} 时间戳数组
 */
function getSelectedMessages(pageContainer) {
  const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (
    pageContainer.querySelectorAll('.msg-send-item-checkbox:checked')
  );
  return Array.from(checkboxes).map(cb => parseInt(cb.dataset.time));
}

/**
 * 切换单条消息的排除状态（局部更新，不刷新整个列表）
 * 
 * @description
 * 核心优化：消息停留在原地，只改变视觉状态
 * - 修改 data-excluded 属性 → 触发 MutationObserver → 自动更新分割线
 * - 不重新渲染列表，不移动消息位置
 * 
 * @param {number} timestamp - 消息时间戳
 * @param {string} contactId - 联系人ID
 * @param {boolean} exclude - 是否排除
 */
async function handleToggleExclude(timestamp, contactId, exclude) {
  logger.debug('[MessageSendCustom] 局部更新消息排除状态:', timestamp, exclude);

  // 1. 修改数据（保存到存储）
  const allMessages = await loadChatHistory(contactId);
  const message = allMessages.find(m => m.time === timestamp);

  if (!message) {
    logger.warn('[MessageSendCustom] 未找到消息:', timestamp);
    return;
  }

  message.excluded = exclude;

  const { saveChatHistory } = await import('./message-chat-data.js');
  await saveChatHistory(contactId, allMessages);

  // 2. 局部更新DOM（只改当前消息的视觉状态）
  const itemElement = document.querySelector(`.msg-send-item[data-time="${timestamp}"]`);
  if (itemElement) {
    // 修改属性 → 触发 MutationObserver → 自动更新分割线
    itemElement.dataset.excluded = exclude ? 'true' : 'false';

    // 更新CSS类（半透明效果）
    if (exclude) {
      itemElement.classList.add('msg-send-item-excluded');
    } else {
      itemElement.classList.remove('msg-send-item-excluded');
    }

    // 更新眼睛图标（动态添加/移除）
    updateEyeIcon(itemElement, exclude, timestamp, contactId);

    logger.debug('[MessageSendCustom] DOM已更新，消息停留在原地');
  }

  showSuccessToast(exclude ? '已标记为不发送' : '已恢复发送');
}

/**
 * 批量切换消息排除状态（局部更新，不刷新整个列表）
 * 
 * @description
 * 核心优化：批量修改消息状态，只更新DOM属性
 * - 批量修改 data-excluded 属性 → 触发一次 MutationObserver → 自动更新分割线
 * - 不重新渲染列表，所有消息停留在原地
 * 
 * @param {Array<number>} timestamps - 消息时间戳数组
 * @param {string} contactId - 联系人ID
 * @param {boolean} exclude - 是否排除
 */
async function batchToggleExclude(timestamps, contactId, exclude) {
  logger.debug('[MessageSendCustom] 批量局部更新排除状态:', timestamps.length, exclude);

  // 1. 修改数据（保存到存储）
  const allMessages = await loadChatHistory(contactId);

  timestamps.forEach(ts => {
    const message = allMessages.find(m => m.time === ts);
    if (message) {
      message.excluded = exclude;
    }
  });

  const { saveChatHistory } = await import('./message-chat-data.js');
  await saveChatHistory(contactId, allMessages);

  // 2. 批量局部更新DOM（只改视觉状态）
  timestamps.forEach(ts => {
    const itemElement = document.querySelector(`.msg-send-item[data-time="${ts}"]`);
    if (itemElement) {
      // 修改属性（批量修改会触发一次 MutationObserver）
      itemElement.dataset.excluded = exclude ? 'true' : 'false';

      // 更新CSS类
      if (exclude) {
        itemElement.classList.add('msg-send-item-excluded');
      } else {
        itemElement.classList.remove('msg-send-item-excluded');
      }

      // 更新眼睛图标
      updateEyeIcon(itemElement, exclude, ts, contactId);
    }
  });

  logger.debug('[MessageSendCustom] 批量DOM更新完成，消息停留在原地');
}

/**
 * 更新眼睛图标（动态添加/移除）
 * 
 * @description
 * 被排除时显示眼睛图标，恢复时移除图标
 * 
 * @param {HTMLElement} itemElement - 消息项元素
 * @param {boolean} excluded - 是否被排除
 * @param {number} timestamp - 消息时间戳
 * @param {string} contactId - 联系人ID
 */
function updateEyeIcon(itemElement, excluded, timestamp, contactId) {
  const timeRow = itemElement.querySelector('.msg-send-item-time-row');
  if (!timeRow) return;

  // 查找现有眼睛图标
  let eyeIcon = timeRow.querySelector('.msg-send-item-eye');

  if (excluded) {
    // 被排除 → 添加眼睛图标（如果不存在）
    if (!eyeIcon) {
      eyeIcon = document.createElement('button');
      eyeIcon.className = 'msg-send-item-eye';
      eyeIcon.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
      eyeIcon.title = '点击恢复发送';
      eyeIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        handleToggleExclude(timestamp, contactId, false);
      });
      timeRow.appendChild(eyeIcon);
    }
  } else {
    // 恢复发送 → 移除眼睛图标
    if (eyeIcon) {
      eyeIcon.remove();
    }
  }
}

/**
 * 处理返回
 */
function handleBack() {
  logger.debug('[MessageSendCustom] 返回上一页');
  const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  import('../phone-main-ui.js').then(({ hidePage }) => {
    hidePage(overlay, 'message-send-custom');
  });
}


/**
 * 创建错误视图
 * @returns {DocumentFragment}
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'msg-send-custom-error';
  error.textContent = '加载失败';
  fragment.appendChild(error);
  return fragment;
}

