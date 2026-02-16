/**
 * 聊天设置页面
 * @module phone/messages/message-chat-settings-ui
 */

import logger from '../../../logger.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { getThumbnailUrl } from '../../../../../../../script.js';
import { getChatSendSettings } from './message-chat-data.js';

/**
 * 渲染聊天设置页
 *
 * @description
 * 显示聊天的设置选项，包括查找记录、置顶、免打扰等。
 * 所有功能都是占位符，开关状态不存储，只做视觉切换。
 *
 * @async
 * @param {Object} params - 参数对象
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 设置页内容片段
 */
export async function renderChatSettings(params) {
  const { contactId } = params;
  logger.debug('phone','[ChatSettings] 渲染聊天设置页:', contactId);

  try {
    // 加载联系人数据
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('phone','[ChatSettings] 未找到联系人:', contactId);
      return createErrorView();
    }

    const fragment = document.createDocumentFragment();

    // 创建完整页面容器
    const container = document.createElement('div');
    container.className = 'chat-settings-page';

    // 1. 顶部栏
    container.appendChild(createTopBar());

    // 2. 创建内容区容器（可滚动）
    const contentContainer = document.createElement('div');
    contentContainer.className = 'chat-settings-content';

    // 3. 联系人卡片
    contentContainer.appendChild(createContactCard(contact));

    // 4. 设置列表
    contentContainer.appendChild(createSettingsList(contact));

    container.appendChild(contentContainer);

    fragment.appendChild(container);

    logger.info('phone','[ChatSettings] 聊天设置页渲染完成:', contact.name);
    return fragment;
  } catch (error) {
    logger.error('phone','[ChatSettings] 渲染聊天设置页失败:', error);
    return createErrorView();
  }
}

/**
 * 创建顶部栏
 * @returns {HTMLElement} 顶部栏容器
 */
function createTopBar() {
  const topBar = document.createElement('div');
  topBar.className = 'chat-settings-topbar';

  topBar.innerHTML = `
        <button class="chat-settings-back-btn">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="chat-settings-title">聊天设置</div>
    `;

  // 返回按钮
  const backBtn = topBar.querySelector('.chat-settings-back-btn');
  backBtn.addEventListener('click', () => {
    handleBack();
  });

  return topBar;
}

/**
 * 创建联系人卡片
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 联系人卡片容器
 */
function createContactCard(contact) {
  const card = document.createElement('div');
  card.className = 'chat-settings-contact-card';

  const displayName = getContactDisplayName(contact);

  // 获取头像URL（使用SillyTavern的缩略图API）
  const avatarUrl = getThumbnailUrl('avatar', contact.avatar);

  card.innerHTML = `
        <img src="${avatarUrl}" alt="${displayName}" class="chat-settings-contact-avatar">
        <div class="chat-settings-contact-name">${displayName}</div>
        <i class="fa-solid fa-chevron-right chat-settings-contact-arrow"></i>
    `;

  // 点击卡片跳转到角色个人页
  card.addEventListener('click', async (e) => {
    // 防止重复触发
    e.stopPropagation();

    logger.info('phone','[ChatSettings] 点击联系人卡片，跳转到角色个人页:', contact.id);
    const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    const { showPage } = await import('../phone-main-ui.js');
    showPage(overlay, 'contact-profile', { contactId: contact.id });
  });

  return card;
}

/**
 * 创建设置列表
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 设置列表容器
 */
function createSettingsList(contact) {
  const list = document.createElement('div');
  list.className = 'chat-settings-list';

  // 读取当前发送设置
  const sendSettings = getChatSendSettings(contact.id);

  // 读取置顶状态
  const isPinned = contact.isPinned || false;

  // 直接用HTML模板字符串创建固定结构
  list.innerHTML = `
        <!-- 角色提示词设置 -->
        <div class="chat-settings-item" data-action="prompt-settings">
            <span class="chat-settings-item-label">角色提示词设置</span>
            <div class="chat-settings-item-right">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        </div>

        <!-- 消息发送管理 -->
        <div class="chat-settings-item" data-action="send-custom">
            <span class="chat-settings-item-label">消息发送管理</span>
            <div class="chat-settings-item-right">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        </div>

        <!-- 聊天记录发送设置 -->
        <div class="chat-settings-section-title">聊天记录发送设置</div>

        <!-- 最新消息条数 -->
        <div class="chat-settings-item chat-settings-item-number">
            <span class="chat-settings-item-label">最新消息条数</span>
            <input type="number"
                   class="chat-settings-number-input"
                   value="${sendSettings.recentCount}"
                   min="1"
                   placeholder="发送到 [QQ聊天记录]"
                   data-key="recentCount">
        </div>

        <!-- 历史消息条数 -->
        <div class="chat-settings-item chat-settings-item-number">
            <span class="chat-settings-item-label">历史消息条数</span>
            <input type="number"
                   class="chat-settings-number-input"
                   value="${sendSettings.historyCount}"
                   min="1"
                   placeholder="发送到 [历史聊天记录]"
                   data-key="historyCount">
        </div>
        <div class="chat-settings-item-desc">影响手机发送给AI的消息条数,也影响酒馆{{最新消息}}、{{历史消息}}宏获取的条数</div>

        <!-- 聊天设置 -->
        <div class="chat-settings-section-title">聊天设置</div>

        <!-- 初始加载消息条数 -->
        <div class="chat-settings-item chat-settings-item-number">
            <span class="chat-settings-item-label">初始加载消息条数</span>
            <input type="number"
                   class="chat-settings-number-input"
                   value="${sendSettings.initialLoadCount || 100}"
                   min="1"
                   placeholder="仅影响聊天页面显示"
                   data-key="initialLoadCount">
        </div>
        <div class="chat-settings-item-desc">仅影响聊天页面显示,不影响发送给AI的消息条数</div>

        <!-- 白色框框：聊天设置分组 -->
        <div class="chat-settings-section-content">
            <!-- 设为置顶 -->
            <div class="chat-settings-item" data-action="toggle-top">
                <span class="chat-settings-item-label">设为置顶</span>
                <div class="chat-settings-toggle ${isPinned ? 'active' : ''}">
                    <div class="chat-settings-toggle-thumb"></div>
                </div>
            </div>

            <!-- 往来记录 -->
            <div class="chat-settings-item" data-action="transactions">
                <span class="chat-settings-item-label">往来记录</span>
                <div class="chat-settings-item-right">
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            </div>

            <!-- 隐藏会话 -->
            <div class="chat-settings-item" data-action="hide-chat">
                <span class="chat-settings-item-label">隐藏会话</span>
                <div class="chat-settings-toggle">
                    <div class="chat-settings-toggle-thumb"></div>
                </div>
            </div>

            <!-- 消息免打扰 -->
            <div class="chat-settings-item" data-action="mute">
                <span class="chat-settings-item-label">消息免打扰</span>
                <div class="chat-settings-toggle">
                    <div class="chat-settings-toggle-thumb"></div>
                </div>
            </div>

            <!-- 消息通知设置 -->
            <div class="chat-settings-item" data-action="notification-settings">
                <span class="chat-settings-item-label">消息通知设置</span>
                <div class="chat-settings-item-right">
                    <span class="chat-settings-item-text">通知预览、提示音等</span>
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            </div>
        </div>

        <!-- 个性装扮 -->
        <div class="chat-settings-item" data-action="character-customization">
            <span class="chat-settings-item-label">个性装扮</span>
            <div class="chat-settings-item-right">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        </div>

        <!-- 设置当前聊天背景 -->
        <div class="chat-settings-item" data-action="set-background">
            <span class="chat-settings-item-label">设置当前聊天背景</span>
            <div class="chat-settings-item-right">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        </div>

        <!-- 删除聊天记录 -->
        <div class="chat-settings-item" data-action="delete-history">
            <span class="chat-settings-item-label">删除聊天记录</span>
            <div class="chat-settings-item-right">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        </div>
    `;

  // 绑定事件
  bindSettingsEvents(list, contact);

  return list;
}

/**
 * 绑定设置项事件
 * @param {HTMLElement} list - 设置列表容器
 * @param {Object} contact - 联系人对象
 */
function bindSettingsEvents(list, contact) {
  // 角色提示词设置
  list.querySelector('[data-action="prompt-settings"]').addEventListener('click', () => {
    handleCharacterPromptSettings(contact);
  });

  // 消息发送管理
  list.querySelector('[data-action="send-custom"]').addEventListener('click', () => {
    handleMessageSendCustom(contact);
  });

  // 数字输入框
  list.querySelectorAll('.chat-settings-number-input').forEach((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.addEventListener('change', () => {
      const key = input.dataset.key;
      const value = parseInt(input.value);
      if (!isNaN(value) && value > 0) {
        handleUpdateSendSettings(contact, key, value);
      } else {
        // 恢复默认值
        const sendSettings = getChatSendSettings(contact.id);
        input.value = sendSettings[key];
      }
    });
  });

  // 设为置顶（开关）
  const toggleTopBtn = list.querySelector('[data-action="toggle-top"] .chat-settings-toggle');
  toggleTopBtn.addEventListener('click', () => {
    const isActive = toggleTopBtn.classList.contains('active');
    toggleTopBtn.classList.toggle('active');
    handleToggleTop(contact, !isActive);
  });

  // 往来记录（链接）
  list.querySelector('[data-action="transactions"]').addEventListener('click', () => {
    handleTransactions(contact);
  });

  // 隐藏会话（开关）
  const hideChatBtn = list.querySelector('[data-action="hide-chat"] .chat-settings-toggle');
  hideChatBtn.addEventListener('click', () => {
    const isActive = hideChatBtn.classList.contains('active');
    hideChatBtn.classList.toggle('active');
    handleHideChat(contact, !isActive);
  });

  // 消息免打扰（开关）
  const muteBtn = list.querySelector('[data-action="mute"] .chat-settings-toggle');
  muteBtn.addEventListener('click', () => {
    const isActive = muteBtn.classList.contains('active');
    muteBtn.classList.toggle('active');
    handleMute(contact, !isActive);
  });

  // 消息通知设置（链接）
  list.querySelector('[data-action="notification-settings"]').addEventListener('click', () => {
    handleNotificationSettings(contact);
  });

  // 个性装扮（链接）
  list.querySelector('[data-action="character-customization"]').addEventListener('click', () => {
    handleCharacterCustomization(contact);
  });

  // 设置当前聊天背景（链接）
  list.querySelector('[data-action="set-background"]').addEventListener('click', () => {
    handleSetBackground(contact);
  });

  // 删除聊天记录（链接）
  list.querySelector('[data-action="delete-history"]').addEventListener('click', () => {
    handleDeleteHistory(contact);
  });
}

/**
 * 处理返回
 */
function handleBack() {
  logger.debug('phone','[ChatSettings] 返回上一页');
  const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  const pageName = 'chat-settings';
  import('../phone-main-ui.js').then(({ hidePage }) => {
    hidePage(overlay, pageName);
  });
}

// ========================================
// 占位功能处理函数（暂不实现具体逻辑）
// ========================================

/**
 * 打开角色提示词设置页面
 * @param {Object} contact - 联系人对象
 */
async function handleCharacterPromptSettings(contact) {
  logger.info('phone','[ChatSettings] 打开角色提示词设置:', contact.name);

  const { showPage } = await import('../phone-main-ui.js');
  const overlay = document.querySelector('.phone-overlay');
  if (overlay) {
    showPage(/** @type {HTMLElement} */(overlay), 'character-prompt-settings', {
      contactId: contact.id
    });
  }
}

/**
 * 打开消息发送管理页面
 * @param {Object} contact - 联系人对象
 */
async function handleMessageSendCustom(contact) {
  logger.info('phone','[ChatSettings] 打开消息发送管理:', contact.name);

  const { showPage } = await import('../phone-main-ui.js');
  const overlay = document.querySelector('.phone-overlay');
  if (overlay) {
    showPage(/** @type {HTMLElement} */(overlay), 'message-send-custom', {
      contactId: contact.id
    });
  }
}

/**
 * 更新发送设置
 * @param {Object} contact - 联系人对象
 * @param {string} key - 设置键名
 * @param {number} value - 设置值
 */
async function handleUpdateSendSettings(contact, key, value) {
  logger.info('phone','[ChatSettings] 更新发送设置:', contact.name, key, value);

  const { updateChatSendSettings } = await import('./message-chat-data.js');
  await updateChatSendSettings(contact.id, { [key]: value });

  const { showSuccessToast } = await import('../ui-components/toast-notification.js');
  showSuccessToast('设置已保存');

  // 触发事件通知（可选，用于实时更新其他页面）
  document.dispatchEvent(new CustomEvent('chat-send-settings-changed', {
    detail: { contactId: contact.id }
  }));
}

/**
 * 查找聊天记录（占位）
 * @param {Object} contact - 联系人对象
 */
function handleSearchChat(contact) {
  logger.info('phone','[ChatSettings] 查找聊天记录（功能待实现）:', contact.name);
  // TODO: 跳转到查找聊天记录页面
}

/**
 * 设为置顶
 *
 * @async
 * @param {Object} contact - 联系人对象
 * @param {boolean} checked - 是否置顶
 *
 * @description
 * 修改联系人的置顶状态，保存到数据库，并调用局部更新函数移动消息列表中的位置。
 */
async function handleToggleTop(contact, checked) {
  logger.info('phone','[ChatSettings] 设为置顶:', contact.name, checked);

  // 修改联系人数据
  contact.isPinned = checked;

  // 保存到数据库
  const { saveContact } = await import('../contacts/contact-list-data.js');
  await saveContact(contact);

  // 局部更新消息列表位置（最小化操作，不刷新整个列表）
  const { updateMessageItemPosition } = await import('./message-list-ui.js');
  await updateMessageItemPosition(contact.id);

  logger.info('phone','[ChatSettings] 置顶状态已更新');
}

/**
 * 打开往来记录页面
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleTransactions(contact) {
  logger.debug('phone','[ChatSettings] 打开往来记录页面:', contact.name);

  const { showPage } = await import('../phone-main-ui.js');
  const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlayElement) {
    await showPage(overlayElement, 'contact-transactions', { contactId: contact.id });
  }

  logger.info('phone','[ChatSettings] 已打开往来记录页面');
}

/**
 * 隐藏会话（占位）
 * @param {Object} contact - 联系人对象
 * @param {boolean} checked - 是否隐藏
 */
function handleHideChat(contact, checked) {
  logger.info('phone','[ChatSettings] 隐藏会话:', contact.name, checked);
  // TODO: 实现隐藏会话逻辑（存储状态、更新列表显示）
}

/**
 * 消息免打扰（占位）
 * @param {Object} contact - 联系人对象
 * @param {boolean} checked - 是否免打扰
 */
function handleMute(contact, checked) {
  logger.info('phone','[ChatSettings] 消息免打扰:', contact.name, checked);
  // TODO: 实现免打扰逻辑（存储状态、控制通知）
}

/**
 * 消息通知设置
 *
 * @description
 * 跳转到消息通知设置页面，配置通知开关和预览显示
 *
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleNotificationSettings(contact) {
  logger.info('phone','[ChatSettings] 打开消息通知设置:', contact.name);

  const { showPage } = await import('../phone-main-ui.js');
  const overlay = document.querySelector('.phone-overlay');
  if (overlay) {
    showPage(/** @type {HTMLElement} */(overlay), 'notification-settings', {
      contactId: contact.id
    });
  }
}

/**
 * 打开角色专属装扮页面
 *
 * @description
 * 跳转到角色专属装扮页面，配置用户气泡、角色气泡
 *
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleCharacterCustomization(contact) {
  logger.info('phone','[ChatSettings] 打开角色专属装扮:', contact.name);

  const { showPage } = await import('../phone-main-ui.js');
  const overlay = document.querySelector('.phone-overlay');
  if (overlay) {
    showPage(/** @type {HTMLElement} */(overlay), 'character-customization', {
      contactId: contact.id
    });
  }
}

/**
 * 设置聊天背景
 *
 * @description
 * 跳转到聊天背景设置页面，配置背景图片、遮罩透明度、遮罩颜色
 *
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleSetBackground(contact) {
  logger.info('phone','[ChatSettings] 打开聊天背景设置:', contact.name);

  const { showPage } = await import('../phone-main-ui.js');
  const overlay = document.querySelector('.phone-overlay');
  if (overlay) {
    showPage(/** @type {HTMLElement} */(overlay), 'chat-background-settings', {
      contactId: contact.id
    });
  }
}

/**
 * 删除聊天记录
 *
 * @description
 * 弹出确认弹窗，用户确认后删除该联系人的所有聊天记录。
 * 删除后关闭设置页和聊天页，返回消息列表，并从列表移除该项。
 *
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleDeleteHistory(contact) {
  logger.info('phone','[ChatSettings] 删除聊天记录:', contact.name);

  const { showConfirmPopup } = await import('../utils/popup-helper.js');
  const { getContactDisplayName } = await import('../utils/contact-display-helper.js');

  const displayName = getContactDisplayName(contact);

  // 弹出确认弹窗（危险操作）
  const confirmed = await showConfirmPopup(
    '删除聊天记录',
    `确定要删除与【${displayName}】的所有聊天记录吗？此操作不可恢复。`,
    { danger: true, okButton: '删除' }
  );

  if (!confirmed) {
    logger.debug('phone','[ChatSettings] 用户取消删除');
    return;
  }

  // 删除数据
  const { clearChatHistory } = await import('./message-chat-data.js');
  await clearChatHistory(contact.id);

  // 关闭设置页和聊天页，返回消息列表
  const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  const { hidePage } = await import('../phone-main-ui.js');

  // 先关闭设置页
  hidePage(overlay, 'chat-settings');

  // 销毁该联系人的聊天页（DOM + 页面栈）
  const sanitizedId = contact.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const chatPageId = `page-chat-${sanitizedId}`;
  const chatPage = overlay.querySelector(`#${chatPageId}`);

  if (chatPage) {
    logger.debug('phone','[ChatSettings] 销毁聊天页:', contact.id);

    // 1. 如果聊天页正在显示，先关闭
    if (chatPage.classList.contains('active')) {
      hidePage(overlay, 'chat');
    }

    // 2. 从页面栈中移除（防止"幻影"问题）
    const pageStack = (await import('../utils/page-stack-helper.js')).default;
    pageStack.removePageById(chatPageId);

    // 3. 删除DOM（最后删除，避免引用丢失）
    chatPage.remove();
  }

  // 从消息列表移除该项
  const { removeContactItemFromList } = await import('./message-list-ui.js');
  removeContactItemFromList(contact.id);

  // 显示成功提示
  const { showSuccessToast } = await import('../ui-components/toast-notification.js');
  showSuccessToast('已删除聊天记录');

  logger.info('phone','[ChatSettings] 删除聊天记录完成:', contact.id);
}

/**
 * 创建错误视图
 * @returns {DocumentFragment} 错误视图片段
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'chat-settings-error';
  error.textContent = '加载失败';
  fragment.appendChild(error);
  return fragment;
}

