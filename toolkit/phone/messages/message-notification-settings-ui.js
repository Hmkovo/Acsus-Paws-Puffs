/**
 * 消息通知设置页面
 * @module phone/messages/message-notification-settings-ui
 */

import logger from '../../../logger.js';
import { loadContacts, saveContact } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';

/**
 * 渲染消息通知设置页面
 * 
 * @description
 * 显示两个开关：
 * 1. 关闭消息弹窗（主开关）：开启=完全不弹通知，关闭=弹通知
 * 2. 通知显示消息预览（子开关）：开启=显示内容，关闭=只显示"发来了新消息"
 * 
 * @async
 * @param {Object} params - 参数对象
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 设置页内容片段
 */
export async function renderNotificationSettings(params) {
  const { contactId } = params;
  logger.debug('phone','[NotificationSettings] 渲染消息通知设置页:', contactId);

  try {
    // 加载联系人数据
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('phone','[NotificationSettings] 未找到联系人:', contactId);
      return createErrorView();
    }

    const fragment = document.createDocumentFragment();

    // 创建完整页面容器
    const container = document.createElement('div');
    container.className = 'msg-notification-settings-page';

    // 1. 顶部栏
    container.appendChild(createTopBar());

    // 2. 创建内容区容器（可滚动）
    const contentContainer = document.createElement('div');
    contentContainer.className = 'msg-notification-settings-content';

    // 3. 设置列表
    contentContainer.appendChild(createSettingsList(contact));

    container.appendChild(contentContainer);

    fragment.appendChild(container);

    logger.info('phone','[NotificationSettings] 消息通知设置页渲染完成:', contact.name);
    return fragment;
  } catch (error) {
    logger.error('phone','[NotificationSettings] 渲染消息通知设置页失败:', error);
    return createErrorView();
  }
}

/**
 * 创建顶部栏
 * @returns {HTMLElement} 顶部栏容器
 */
function createTopBar() {
  const topBar = document.createElement('div');
  topBar.className = 'msg-notification-settings-topbar';

  topBar.innerHTML = `
        <button class="msg-notification-settings-back-btn">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="msg-notification-settings-title">消息通知设置</div>
    `;

  // 返回按钮
  const backBtn = topBar.querySelector('.msg-notification-settings-back-btn');
  backBtn.addEventListener('click', () => {
    handleBack();
  });

  return topBar;
}

/**
 * 创建设置列表
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 设置列表容器
 */
function createSettingsList(contact) {
  const list = document.createElement('div');
  list.className = 'msg-notification-settings-list';

  // 获取当前设置（默认值：notificationDisabled=false, notificationPreview=true）
  const notificationDisabled = contact.notificationDisabled === true;
  const notificationPreview = contact.notificationPreview !== false;

  list.innerHTML = `
        <!-- 关闭消息弹窗 -->
        <div class="msg-notification-settings-item" data-setting="disabled">
            <span class="msg-notification-settings-label">关闭消息弹窗</span>
            <div class="msg-notification-settings-toggle ${notificationDisabled ? 'active' : ''}">
                <div class="msg-notification-settings-toggle-thumb"></div>
            </div>
        </div>
        <div class="msg-notification-settings-hint">
            开启后,系统通知将不显示该联系人的消息通知弹窗。
        </div>

        <!-- 通知显示消息预览 -->
        <div class="msg-notification-settings-item" data-setting="preview">
            <span class="msg-notification-settings-label">通知显示消息预览</span>
            <div class="msg-notification-settings-toggle ${notificationPreview ? 'active' : ''}">
                <div class="msg-notification-settings-toggle-thumb"></div>
            </div>
        </div>
        <div class="msg-notification-settings-hint">
            关闭后,系统通知将只显示"[角色名] 发来了新消息"。
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
  // 关闭消息弹窗（开关）
  const disabledToggle = list.querySelector('[data-setting="disabled"] .msg-notification-settings-toggle');
  disabledToggle.addEventListener('click', () => {
    const isActive = disabledToggle.classList.contains('active');
    disabledToggle.classList.toggle('active');
    handleToggleDisabled(contact, !isActive);
  });

  // 通知显示消息预览（开关）
  const previewToggle = list.querySelector('[data-setting="preview"] .msg-notification-settings-toggle');
  previewToggle.addEventListener('click', () => {
    const isActive = previewToggle.classList.contains('active');
    previewToggle.classList.toggle('active');
    handleTogglePreview(contact, !isActive);
  });
}

/**
 * 处理返回
 */
function handleBack() {
  logger.debug('phone','[NotificationSettings] 返回上一页');
  const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  const pageName = 'notification-settings';
  import('../phone-main-ui.js').then(({ hidePage }) => {
    hidePage(overlay, pageName);
  });
}

/**
 * 处理切换"关闭消息弹窗"
 * 
 * @description
 * 开启：完全不弹通知
 * 关闭：弹通知（根据预览设置决定内容）
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {boolean} disabled - 是否关闭通知
 */
async function handleToggleDisabled(contact, disabled) {
  logger.info('phone','[NotificationSettings] 切换"关闭消息弹窗":', contact.name, disabled);

  // 更新联系人数据
  contact.notificationDisabled = disabled;
  await saveContact(contact);

  // 触发事件通知（可选，用于实时更新其他页面）
  document.dispatchEvent(new CustomEvent('notification-settings-changed', {
    detail: { contactId: contact.id }
  }));

  logger.debug('phone','[NotificationSettings] 设置已保存:', { contactId: contact.id, notificationDisabled: disabled });
}

/**
 * 处理切换"通知显示消息预览"
 * 
 * @description
 * 开启：显示消息内容（如"你好啊"）
 * 关闭：只显示"[角色名] 发来了新消息"
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {boolean} preview - 是否显示预览
 */
async function handleTogglePreview(contact, preview) {
  logger.info('phone','[NotificationSettings] 切换"通知显示消息预览":', contact.name, preview);

  // 更新联系人数据
  contact.notificationPreview = preview;
  await saveContact(contact);

  // 触发事件通知（可选，用于实时更新其他页面）
  document.dispatchEvent(new CustomEvent('notification-settings-changed', {
    detail: { contactId: contact.id }
  }));

  logger.debug('phone','[NotificationSettings] 设置已保存:', { contactId: contact.id, notificationPreview: preview });
}

/**
 * 创建错误视图
 * @returns {DocumentFragment} 错误视图片段
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'msg-notification-settings-error';
  error.textContent = '加载失败';
  fragment.appendChild(error);
  return fragment;
}

