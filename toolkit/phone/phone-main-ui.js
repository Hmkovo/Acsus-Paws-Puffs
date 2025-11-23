/**
 * 手机主界面框架
 * 
 * 职责：
 * - 渲染手机容器（顶部栏、内容区、底部导航）
 * - 管理标签页切换
 * - 处理全局手势（关闭、返回）
 * 
 * 依赖：
 * - templates/phone-frame-template.js
 * - ../../logger.js
 */

import logger from '../../logger.js';
import { getPhoneFrameHTML } from './templates/phone-frame-template.js';
import { createPlusMenu, bindPlusMenuEvents } from './ui-components/button-plus-menu.js';
import { renderContactList } from './contacts/contact-list-ui.js';
import { renderGroupManagePage } from './contacts/contact-group-manage-ui.js';
import { showSuccessToast } from './ui-components/toast-notification.js';
import { getUserAvatar, user_avatar } from '../../../../../../scripts/personas.js';
import { saveSettingsDebounced } from '../../../../../../script.js';
import { extension_settings } from '../../../../../../scripts/extensions.js';
import { showConfirmPopup } from './utils/popup-helper.js';
import pageStack from './utils/page-stack-helper.js';
import { getUserDisplayName } from './utils/contact-display-helper.js';

/**
 * 渲染手机框架
 * 
 * @description
 * 创建手机遮罩层和容器元素，包含完整的界面结构（顶部栏、三个标签页、底部导航）
 * 并绑定所有必要的事件监听器
 * 
 * @returns {HTMLElement} 手机遮罩层元素（.phone-overlay）
 */
export function renderPhoneFrame() {
  logger.debug('[PhoneUI.renderPhoneFrame] 开始渲染手机框架');

  // 创建临时容器来解析 HTML
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = getPhoneFrameHTML();

  // 获取手机遮罩层元素（最外层）
  const phoneOverlay = /** @type {HTMLElement} */ (tempContainer.firstElementChild);

  // 添加加号菜单内容
  const menuContainer = phoneOverlay.querySelector('#add-menu');
  if (menuContainer) {
    const plusMenu = createPlusMenu();
    // 将菜单项添加到容器中
    while (plusMenu.firstChild) {
      menuContainer.appendChild(plusMenu.firstChild);
    }
  }

  // 绑定事件
  bindFrameEvents(phoneOverlay);

  // 初始化用户信息显示
  updateUserInfo(phoneOverlay);

  // 初始化消息列表（异步，不阻塞）
  renderMessageListTab(phoneOverlay).catch(error => {
    logger.error('[PhoneUI] 初始化消息列表失败:', error);
  });

  logger.info('[PhoneUI.renderPhoneFrame] 手机框架渲染完成');

  return phoneOverlay;
}

/**
 * 绑定手机框架的所有事件
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素（.phone-overlay）
 */
function bindFrameEvents(overlayElement) {
  logger.debug('[PhoneUI.bindFrameEvents] 绑定框架事件');

  // 关闭按钮事件
  const closeBtn = overlayElement.querySelector('#phone-btn-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      logger.info('[PhoneUI] 用户点击关闭按钮');
      closePhoneUI();
    });
  }

  // 用户头像点击事件（打开用户个人主页）
  const userAvatar = /** @type {HTMLElement} */ (overlayElement.querySelector('#phone-user-avatar'));
  if (userAvatar) {
    userAvatar.addEventListener('click', () => {
      logger.debug('[PhoneUI] 用户点击头像，打开个人主页');
      showPage(overlayElement, 'user-profile');
    });
    // 添加鼠标指针样式
    userAvatar.style.cursor = 'pointer';
  }

  // 加号菜单事件（集成加号菜单组件）
  bindPlusMenuEvents(overlayElement, handlePlusMenuAction);

  // 底部导航按钮事件（所有导航按钮）
  const navButtons = overlayElement.querySelectorAll('.phone-nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = /** @type {HTMLElement} */ (btn).dataset.tab;
      handleBottomNavClick(overlayElement, tabName);
    });
  });

  // 监听自定义事件（刷新联系人列表）
  // 注意：绑定在 overlayElement 而不是 document
  // 当手机关闭（overlayElement被移除）时，监听器会自动清理，避免累积
  overlayElement.addEventListener('phone:refresh-contact-list', () => {
    logger.debug('[PhoneUI] 接收到刷新联系人列表事件');
    // 直接刷新联系人列表（不管标签页是否active）
    // 因为联系人列表DOM是持久化的，需要更新数据
    renderContactListTab(overlayElement);
  });
}

/**
 * 处理底部导航点击
 * 
 * @description
 * 点击底部导航时的统一处理：
 * 1. 如果不在主页面，先返回主布局（清空页面栈）
 * 2. 再切换到目标标签页
 * 3. 清空栈并更新当前主页面
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 * @param {string} tabName - 标签页名称（messages/contacts/moments）
 */
async function handleBottomNavClick(overlayElement, tabName) {
  logger.debug('[PhoneUI.handleBottomNavClick] 点击底部导航:', tabName);

  // 如果不在主页面，先返回主布局
  if (!pageStack.isOnMainPage()) {
    logger.debug('[PhoneUI] 不在主页面，先返回主布局');

    // 隐藏所有子页面
    const allPages = overlayElement.querySelectorAll('.phone-page');
    allPages.forEach(page => {
      page.classList.remove('active');
    });

    // 显示主布局
    showMainLayout(overlayElement);
  }

  // 切换标签页
  await switchTab(overlayElement, tabName);

  // 清空栈并更新当前主页面
  pageStack.resetStack(tabName);

  // 显示底部导航
  showBottomNav(overlayElement);

  logger.info('[PhoneUI] 已切换到主页面:', tabName);
}

/**
 * 切换标签页
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 * @param {string} tabName - 标签页名称（messages/contacts/moments）
 */
async function switchTab(overlayElement, tabName) {
  logger.debug('[PhoneUI.switchTab] 切换到标签页:', tabName);

  // 隐藏所有标签页（.phone-tab）
  const allTabs = overlayElement.querySelectorAll('.phone-tab');
  allTabs.forEach(tab => {
    tab.classList.remove('active');
  });

  // 显示指定标签页
  const targetTab = overlayElement.querySelector(`#tab-${tabName}`);
  if (targetTab) {
    targetTab.classList.add('active');
  } else {
    logger.warn('[PhoneUI.switchTab] 标签页不存在:', tabName);
    return;
  }

  // 如果是消息标签页，渲染消息列表
  if (tabName === 'messages') {
    await renderMessageListTab(overlayElement);
  }

  // 如果是联系人标签页,渲染联系人列表
  if (tabName === 'contacts') {
    await renderContactListTab(overlayElement);
  }

  // 更新顶部标题（只修改子元素内容，不破坏两行结构）
  updateHeaderTitle(overlayElement, tabName);

  // 更新所有导航按钮的高亮状态
  const allNavButtons = overlayElement.querySelectorAll('.phone-nav-item');
  allNavButtons.forEach(btn => {
    const htmlBtn = /** @type {HTMLElement} */ (btn);
    if (htmlBtn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * 更新用户信息（头像、名字、状态）
 * 
 * @description
 * 从 SillyTavern 获取当前用户头像和名字，并更新顶部栏显示
 * 显示格式：用户名（上） + 在线状态（下）
 * 注意：只修改子元素内容，不覆盖整个结构
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
function updateUserInfo(overlayElement) {
  logger.debug('[PhoneUI.updateUserInfo] 更新用户信息');

  try {
    // 1. 更新用户头像
    const userAvatarPath = getUserAvatar(user_avatar);
    const avatarImg = overlayElement.querySelector('#phone-user-avatar');
    if (avatarImg && userAvatarPath) {
      avatarImg.setAttribute('src', userAvatarPath);
      logger.debug('[PhoneUI.updateUserInfo] 用户头像已更新:', userAvatarPath);
    }

    // 2. 更新用户名（使用统一工具函数）
    const userName = overlayElement.querySelector('.phone-header-user-name');
    if (userName) {
      const displayName = getUserDisplayName();
      userName.textContent = displayName;
      logger.debug('[PhoneUI.updateUserInfo] 用户名已更新:', displayName);
    }
  } catch (error) {
    logger.error('[PhoneUI.updateUserInfo] 更新用户信息失败:', error);
  }
}

/**
 * 更新顶部栏标题
 * 
 * @description
 * 根据当前标签页更新顶部栏标题
 * - 消息页：显示"用户名 + 在线"
 * - 其他页：显示"标签页名称"（单行）
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 * @param {string} tabName - 标签页名称（messages/contacts/moments）
 */
function updateHeaderTitle(overlayElement, tabName) {
  const userName = /** @type {HTMLElement} */ (overlayElement.querySelector('.phone-header-user-name'));
  const userStatus = /** @type {HTMLElement} */ (overlayElement.querySelector('.phone-header-user-status'));

  if (!userName || !userStatus) {
    logger.warn('[PhoneUI.updateHeaderTitle] 找不到标题元素');
    return;
  }

  if (tabName === 'messages') {
    // 消息页：显示用户名 + 在线状态（使用统一工具函数）
    userName.textContent = getUserDisplayName();
    userStatus.textContent = '在线';
    userStatus.style.display = '';
  } else {
    // 其他页：显示标签页名称（单行）
    const titleMap = {
      'contacts': '联系人',
      'moments': '动态'
    };
    userName.textContent = titleMap[tabName] || '';
    userStatus.style.display = 'none';  // 隐藏第二行
  }

  logger.debug('[PhoneUI.updateHeaderTitle] 标题已更新:', tabName);
}

/**
 * 关闭手机界面
 * 
 * @description
 * 从 DOM 中移除手机遮罩层（包含整个手机界面）
 */
function closePhoneUI() {
  logger.info('[PhoneUI.closePhoneUI] 关闭手机界面');

  const phoneOverlay = document.querySelector('.phone-overlay');
  if (phoneOverlay) {
    phoneOverlay.remove();
    // 清空页面栈
    pageStack.resetStack('messages');
    logger.debug('[PhoneUI.closePhoneUI] 手机界面已移除，栈已清空');
  } else {
    logger.warn('[PhoneUI.closePhoneUI] 找不到手机界面元素');
  }
}

/**
 * 显示主布局（三个标签页）
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
function showMainLayout(overlayElement) {
  const mainLayout = overlayElement.querySelector('#main-layout');
  if (mainLayout) {
    mainLayout.classList.add('active');
    logger.debug('[PhoneUI.showMainLayout] 主布局已显示');
  }
}

/**
 * 隐藏主布局（三个标签页）
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
function hideMainLayout(overlayElement) {
  const mainLayout = overlayElement.querySelector('#main-layout');
  if (mainLayout) {
    mainLayout.classList.remove('active');
    logger.debug('[PhoneUI.hideMainLayout] 主布局已隐藏');
  }
}

/**
 * 显示底部导航
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
function showBottomNav(overlayElement) {
  const bottomNav = /** @type {HTMLElement} */ (overlayElement.querySelector('.phone-bottom-nav'));
  if (bottomNav) {
    bottomNav.style.display = 'flex';
    logger.debug('[PhoneUI.showBottomNav] 底部导航已显示');
  }
}

/**
 * 隐藏底部导航
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
function hideBottomNav(overlayElement) {
  const bottomNav = /** @type {HTMLElement} */ (overlayElement.querySelector('.phone-bottom-nav'));
  if (bottomNav) {
    bottomNav.style.display = 'none';
    logger.debug('[PhoneUI.hideBottomNav] 底部导航已隐藏');
  }
}

/**
 * 获取当前激活的标签页
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 * @returns {string} 当前标签页名称（messages/contacts/moments）
 */
function getCurrentActiveTab(overlayElement) {
  const activeBtn = overlayElement.querySelector('.phone-nav-item.active');
  if (activeBtn) {
    return /** @type {HTMLElement} */ (activeBtn).dataset.tab || 'messages';
  }
  return 'messages';
}

/**
 * 检查页面参数是否变化
 * 
 * @description
 * 判断页面关键参数（如contactId）是否与上次不同
 * 如果变化了，需要刷新页面内容；否则可以直接显示
 * 
 * 注意：聊天页使用独立ID（page-chat-{contactId}），不需要检查参数
 * 
 * @param {HTMLElement} pageElement - 页面元素
 * @param {Object} newParams - 新参数
 * @param {string} pageName - 页面名称
 * @returns {boolean} 是否需要刷新
 */
function checkIfParamsChanged(pageElement, newParams, pageName) {
  // 聊天页使用独立ID，每个角色一个DOM，不需要检查参数
  if (pageName === 'chat') {
    return false;
  }

  // 收藏列表页每次显示时都刷新（数据可能已变化）
  if (pageName === 'favorites-list') {
    logger.debug('[PhoneUI.checkIfParamsChanged] 收藏列表页，需要刷新');
    return true;
  }

  // 个签历史页需要检查 targetType 和 contactId
  if (pageName === 'signature-history') {
    const oldTargetType = pageElement.dataset.targetType;
    const newTargetType = newParams.targetType;
    const oldContactId = pageElement.dataset.contactId;
    const newContactId = newParams.contactId;

    // targetType 变化（用户 ↔ 角色）
    if (oldTargetType !== newTargetType) {
      logger.debug('[PhoneUI.checkIfParamsChanged] targetType变化:', oldTargetType, '→', newTargetType);
      return true;
    }

    // contactId 变化（不同角色）
    if (oldContactId && newContactId && oldContactId !== newContactId) {
      logger.debug('[PhoneUI.checkIfParamsChanged] contactId变化:', oldContactId, '→', newContactId);
      return true;
    }

    return false;
  }

  // 从页面元素的dataset读取上次的参数
  const oldContactId = pageElement.dataset.contactId;
  const newContactId = newParams.contactId;

  // 如果contactId不同，需要刷新
  if (oldContactId && newContactId && oldContactId !== newContactId) {
    logger.debug('[PhoneUI.checkIfParamsChanged] contactId变化:', oldContactId, '→', newContactId);
    return true;
  }

  // 其他情况不刷新
  return false;
}

/**
 * 渲染消息列表标签页
 * 
 * @description
 * 调用 message-list-ui.js 的 renderMessageList() 渲染消息列表
 * 
 * @async
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
async function renderMessageListTab(overlayElement) {
  logger.debug('[PhoneUI.renderMessageListTab] 开始渲染消息列表');

  try {
    const tabContainer = overlayElement.querySelector('#tab-messages');
    if (!tabContainer) {
      logger.warn('[PhoneUI.renderMessageListTab] 找不到消息标签页容器');
      return;
    }

    // 动态导入消息列表渲染函数
    const { renderMessageList } = await import('./messages/message-list-ui.js');

    // 调用 renderMessageList() 获取UI内容
    const messageListContent = await renderMessageList();

    // 清空容器并插入内容
    tabContainer.innerHTML = '';
    if (messageListContent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      tabContainer.appendChild(messageListContent);
    } else {
      // 如果返回的是完整元素，提取其子元素
      while (messageListContent.firstChild) {
        tabContainer.appendChild(messageListContent.firstChild);
      }
    }

    logger.info('[PhoneUI.renderMessageListTab] 消息列表渲染完成');
  } catch (error) {
    logger.error('[PhoneUI.renderMessageListTab] 渲染消息列表失败:', error);
  }
}

/**
 * 渲染联系人标签页
 * 
 * @description
 * 调用 contact-list-ui.js 的 renderContactList() 渲染联系人列表
 * 
 * @async
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
async function renderContactListTab(overlayElement) {
  logger.debug('[PhoneUI.renderContactListTab] 开始渲染联系人列表');

  try {
    const tabContainer = overlayElement.querySelector('#tab-contacts');
    if (!tabContainer) {
      logger.warn('[PhoneUI.renderContactListTab] 找不到联系人标签页容器');
      return;
    }

    // 调用 renderContactList() 获取UI内容
    const contactListContent = await renderContactList();

    // 清空容器并插入内容
    tabContainer.innerHTML = '';
    if (contactListContent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      tabContainer.appendChild(contactListContent);
    } else {
      // 如果返回的是完整元素，提取其子元素
      while (contactListContent.firstChild) {
        tabContainer.appendChild(contactListContent.firstChild);
      }
    }

    logger.info('[PhoneUI.renderContactListTab] 联系人列表渲染完成');
  } catch (error) {
    logger.error('[PhoneUI.renderContactListTab] 渲染联系人列表失败:', error);
  }
}

/**
 * 处理加号菜单项点击
 * 
 * @description
 * 根据不同的菜单项执行不同的操作
 * 
 * @async
 * @param {string} action - 菜单项的 action 值
 */
async function handlePlusMenuAction(action) {
  logger.info('[PhoneUI.handlePlusMenuAction] 处理菜单操作:', action);

  const phoneOverlay = document.querySelector('.phone-overlay');
  if (!phoneOverlay) {
    logger.warn('[PhoneUI.handlePlusMenuAction] 找不到手机界面');
    return;
  }

  switch (action) {
    case 'sync-tavern-characters':
      // 同步酒馆角色 → 执行同步，留在联系人页面
      await handleSyncTavernCharacters(/** @type {HTMLElement} */(phoneOverlay));
      break;

    case 'manage-groups':
      // 分组管理 → 打开分组管理页面
      await handleOpenGroupManage(/** @type {HTMLElement} */(phoneOverlay));
      break;

    case 'api-settings':
      // API设置 → 打开API设置页面
      logger.info('[PhoneUI] 打开API设置页面');
      showPage(/** @type {HTMLElement} */(phoneOverlay), 'api-settings');
      break;

    case 'preset-settings':
      // 预设管理 → 打开预设管理页面
      logger.info('[PhoneUI] 打开预设管理页面');
      showPage(/** @type {HTMLElement} */(phoneOverlay), 'preset-settings');
      break;

    case 'clear-phone-data':
      // 清空手机数据（临时功能）
      await handleClearPhoneData(/** @type {HTMLElement} */(phoneOverlay));
      break;

    case 'create-group':
    case 'add-friend':
    case 'send-file':
      // 待添加功能，暂时不做任何操作
      logger.debug('[PhoneUI] 功能待添加:', action);
      break;

    default:
      logger.warn('[PhoneUI] 未知的菜单操作:', action);
  }
}

/**
 * 处理同步酒馆角色
 * 
 * @description
 * 从酒馆获取角色列表，增量合并到待处理列表
 * 只添加新角色，不删除已有的（保持历史累积）
 * 不会自动添加联系人，需要用户在"新朋友"页面手动同意
 * 
 * @async
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
async function handleSyncTavernCharacters(overlayElement) {
  logger.info('[PhoneUI] 同步酒馆角色');

  try {
    // 1. 从酒馆获取角色列表
    const { getTavernCharacters } = await import('./contacts/contact-sync-tavern.js');
    const characters = await getTavernCharacters();

    // 2. 增量合并到待处理列表（只添加新角色，不覆盖）
    const { mergePendingRequests } = await import('./contacts/contact-list-data.js');
    const result = await mergePendingRequests(characters);

    // 3. 显示通知
    if (result.added > 0) {
      showSuccessToast(`已同步 ${result.added} 个新角色，共 ${result.total} 个`);
    } else {
      showSuccessToast('已是最新，无新角色');
    }

    // 4. 刷新联系人列表（更新"新朋友"徽章数字）
    await renderContactListTab(overlayElement);

    logger.info('[PhoneUI] 同步完成，新增', result.added, '个，总计', result.total, '个');
  } catch (error) {
    logger.error('[PhoneUI] 同步失败:', error);
    alert('同步失败，请查看控制台');
  }
}

/**
 * 处理打开分组管理页面
 * 
 * @description
 * 打开分组管理独立页面，允许用户添加、编辑、删除、排序分组
 * 使用统一的 showPage 系统
 * 
 * @async
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
async function handleOpenGroupManage(overlayElement) {
  logger.info('[PhoneUI] 打开分组管理页面');

  try {
    // 使用统一的 showPage 系统
    await showPage(overlayElement, 'group-manage');

    logger.info('[PhoneUI] 分组管理页面已显示');
  } catch (error) {
    logger.error('[PhoneUI] 打开分组管理页面失败:', error);
    alert('打开分组管理页面失败，请查看控制台');
  }
}

/**
 * 处理清空手机数据（临时功能）
 * 
 * @description
 * 清空 extension_settings.acsusPawsPuffs.phone 中的所有数据
 * 用于调试和测试，清空后会重新初始化为默认值
 * 
 * @async
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 */
async function handleClearPhoneData(overlayElement) {
  logger.warn('[PhoneUI] 请求清空手机数据');

  try {
    // 弹出确认弹窗（危险操作，使用自定义弹窗）
    const confirmed = await showConfirmPopup(
      '⚠️ 警告',
      '此操作将清空手机的所有数据！\n\n包括：\n• 所有联系人\n• 所有聊天记录\n• 所有分组\n• 所有设置\n\n此操作不可恢复，确定要清空吗？',
      {
        danger: true,
        okButton: '确定清空',
        cancelButton: '取消'
      }
    );

    if (!confirmed) {
      logger.debug('[PhoneUI] 用户取消清空操作');
      return;
    }

    // 清空 phone 数据
    if (!extension_settings.acsusPawsPuffs) {
      extension_settings.acsusPawsPuffs = {};
    }

    extension_settings.acsusPawsPuffs.phone = {};

    // 保存到服务器
    await saveSettingsDebounced();

    logger.info('[PhoneUI] 手机数据已清空');
    showSuccessToast('手机数据已清空，正在刷新...');

    // 等待一下让用户看到提示
    await new Promise(resolve => setTimeout(resolve, 500));

    // 刷新联系人列表（会重新加载默认数据）
    await renderContactListTab(overlayElement);

    showSuccessToast('刷新完成！现在是全新的手机数据');

    logger.info('[PhoneUI] 清空完成，数据已重新初始化');
  } catch (error) {
    logger.error('[PhoneUI] 清空手机数据失败:', error);
    alert('清空失败，请查看控制台：' + error.message);
  }
}

/**
 * 显示独立页面（带滑动动画）
 * 
 * @description
 * 隐藏主布局（三个标签页），显示指定的独立页面
 * 页面只创建一次，后续显示时只刷新内容（不删除DOM）
 * 自动管理页面栈和底部导航显隐
 * 
 * 动画效果：
 * - 新页面从右向左滑入（iOS push风格）
 * - 背景页面变暗（如果有上一页面）
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 * @param {string} pageName - 页面名称（如 'new-friends', 'chat', 'contact-profile'）
 * @param {Object} [params] - 页面参数（可选，如 {contactId: 'xxx'}）
 */
export async function showPage(overlayElement, pageName, params = {}) {
  logger.info('[PhoneUI.showPage] 显示页面:', pageName, '参数:', params);

  try {
    // 生成实际的DOM ID（聊天页和转账页使用动态ID，每个联系人独立DOM）
    // 注意：将contactId中的特殊字符（空格、特殊符号）转为下划线，避免querySelector失败
    const pageId = ((pageName === 'chat' || pageName === 'transfer') && params.contactId)
      ? `page-${pageName}-${params.contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : `page-${pageName}`;

    logger.debug('[PhoneUI.showPage] 实际DOM ID:', pageId);

    // 检查目标页面是否已经是当前页面（栈顶）
    const currentPage = pageStack.getCurrentPage();
    if (currentPage && currentPage.pageId === pageId) {
      logger.debug('[PhoneUI.showPage] 目标页面已经是当前页面，忽略操作:', pageId);
      return;
    }

    // 检查页面是否已在栈中（防止重复入栈）
    const existingIndex = pageStack.findPageIndex(pageId);

    if (existingIndex >= 0) {
      // 页面已在栈中，出栈到该位置（类似"返回到已有页面"）
      logger.warn('[PhoneUI.showPage] ⚠️ 页面已在栈中（索引', existingIndex, '），将出栈到该位置');

      const currentPageItem = pageStack.getCurrentPage();

      // 出栈到目标位置（移除后面的所有页面）
      const removedPages = pageStack.popToIndex(existingIndex);

      // 隐藏被移除的页面DOM（直接用pageId，不需要判断）
      removedPages.forEach(removed => {
        const removedElement = overlayElement.querySelector(`#${removed.pageId}`);
        if (removedElement) {
          removedElement.classList.remove('active', 'phone-page-dimmed');
          logger.debug('[PhoneUI.showPage] 隐藏被移除的页面:', removed.pageId);
        } else {
          logger.warn('[PhoneUI.showPage] ⚠️ 找不到被移除页面的DOM:', removed.pageId);
        }
      });

      // 隐藏当前页面（如果有，直接用pageId）
      if (currentPageItem) {
        const currentPageElement = overlayElement.querySelector(`#${currentPageItem.pageId}`);
        if (currentPageElement) {
          currentPageElement.classList.remove('active', 'phone-page-dimmed');
          logger.debug('[PhoneUI.showPage] 隐藏当前页面:', currentPageItem.pageId);
        }
      }

      // 显示目标页面（不重新压栈）
      const targetPage = overlayElement.querySelector(`#${pageId}`);

      if (targetPage) {
        targetPage.classList.remove('phone-page-dimmed');
        targetPage.classList.add('active');
        logger.info('[PhoneUI.showPage] 已返回到已有页面:', pageName, 'ID:', pageId, '栈深度:', pageStack.getDepth());
      } else {
        logger.error('[PhoneUI.showPage] ❌ 找不到目标页面DOM:', pageId);
      }

      return;
    }

    // 页面不在栈中，正常压栈流程
    logger.debug('[PhoneUI.showPage] 页面不在栈中，正常压栈');

    // 获取当前主页面（从栈底或当前标签页）
    const fromMainTab = pageStack.isOnMainPage()
      ? getCurrentActiveTab(overlayElement)
      : pageStack.getBaseMainTab();

    // 获取当前页面（即将成为背景页面）
    const currentPageItem = pageStack.getCurrentPage();
    const currentPageElement = currentPageItem
      ? overlayElement.querySelector(`#${currentPageItem.pageId}`)
      : null;

    // 隐藏主布局
    hideMainLayout(overlayElement);

    // 隐藏底部导航
    hideBottomNav(overlayElement);

    // 查找目标页面（直接用pageId）
    let targetPage = overlayElement.querySelector(`#${pageId}`);

    if (!targetPage) {
      // 页面不存在，首次创建
      logger.debug('[PhoneUI.showPage] 首次创建页面:', pageName, 'ID:', pageId);

      targetPage = await createPage(pageName, params);
      logger.debug('[PhoneUI.showPage] createPage返回值:', {
        exists: !!targetPage,
        id: targetPage?.id,
        className: targetPage?.className,
        childrenCount: targetPage?.children?.length
      });

      if (targetPage) {
        logger.debug('[PhoneUI.showPage] ========== 添加页面到DOM树 ==========');
        logger.debug('[PhoneUI.showPage] overlayElement:', {
          tagName: overlayElement.tagName,
          classList: Array.from(overlayElement.classList),
          id: overlayElement.id
        });

        const container = overlayElement.querySelector('.phone-container');
        logger.debug('[PhoneUI.showPage] 查找.phone-container结果:', !!container);

        if (container) {
          logger.debug('[PhoneUI.showPage] container详情:', {
            tagName: container.tagName,
            classList: Array.from(container.classList),
            childrenCount: container.children.length
          });

          logger.debug('[PhoneUI.showPage] 添加前 - targetPage.isConnected:', targetPage.isConnected);
          logger.debug('[PhoneUI.showPage] 准备将页面添加到container');

          container.appendChild(targetPage);

          logger.debug('[PhoneUI.showPage] 添加后 - targetPage.isConnected:', targetPage.isConnected);
          logger.debug('[PhoneUI.showPage] 页面已添加到container');

          // 检查添加后的DOM状态
          const addedPage = overlayElement.querySelector(`#${pageId}`);
          logger.debug('[PhoneUI.showPage] querySelector查找结果:', !!addedPage);

          if (addedPage) {
            const computedStyle = window.getComputedStyle(addedPage);
            logger.debug('[PhoneUI.showPage] 添加后的页面状态:', {
              found: true,
              id: addedPage.id,
              classList: Array.from(addedPage.classList),
              childrenCount: addedPage.children.length,
              isConnected: addedPage.isConnected,
              computedDisplay: computedStyle.display,
              computedZIndex: computedStyle.zIndex,
              computedPosition: computedStyle.position,
              computedWidth: computedStyle.width,
              computedHeight: computedStyle.height
            });
          } else {
            logger.error('[PhoneUI.showPage] ❌ appendChild后仍然无法querySelector到页面！');
          }
        } else {
          logger.error('[PhoneUI.showPage] ❌❌❌ 找不到.phone-container容器！');
          logger.error('[PhoneUI.showPage] overlayElement的所有子元素:');
          Array.from(overlayElement.children).forEach((child, i) => {
            const el = /** @type {HTMLElement} */ (child);
            logger.error(`  [${i}]`, el.tagName, el.className, el.id);
          });
        }

        logger.debug('[PhoneUI.showPage] ========== 添加页面到DOM树结束 ==========');
      } else {
        logger.error('[PhoneUI.showPage] createPage返回null！');
      }
    } else {
      // 页面已存在，检查参数是否变化
      const needsRefresh = checkIfParamsChanged(/** @type {HTMLElement} */(targetPage), params, pageName);

      if (needsRefresh) {
        // 参数变化（如contactId不同），需要刷新内容
        logger.debug('[PhoneUI.showPage] 参数已变化，刷新页面内容');
        await refreshPageContent(pageName, params);
      } else {
        // 参数未变化，直接显示
        logger.debug('[PhoneUI.showPage] 页面已存在，直接显示（参数未变）');
        
        // 好友申请详情页需要重新绑定监听器（因为hidePage时被清理了）
        if (pageName === 'friend-request-detail') {
          const { bindEventListeners } = await import('./contacts/friend-request-detail-ui.js');
          bindEventListeners(pageId);
          logger.debug('[PhoneUI.showPage] 已重新绑定好友申请详情页监听器');
        }
      }
    }

    // 压栈（记录页面跳转，包含实际的pageId）
    pageStack.pushPage(pageName, pageId, params, fromMainTab);

    // ✅ 打开聊天页时，清除未读计数（无条件执行，不管是首次进入还是切换）
    if (pageName === 'chat' && params.contactId) {
      const { clearUnread } = await import('./messages/unread-badge-manager.js');
      clearUnread(params.contactId);
      logger.debug('[PhoneUI.showPage] 已清除未读计数:', params.contactId);
    }

    // 显示目标页面（带动画）
    if (targetPage) {
      // 0. 移除目标页面的dimmed状态（如果之前被变暗过）
      const wasDimmed = targetPage.classList.contains('phone-page-dimmed');
      if (wasDimmed) {
        logger.debug('[PhoneUI.showPage] 目标页面之前被变暗，正在移除dimmed状态:', pageId);
      }
      targetPage.classList.remove('phone-page-dimmed');

      // 1. 如果有当前页面，添加变暗效果（同时移除active，避免z-index冲突）
      if (currentPageElement) {
        const hadActive = currentPageElement.classList.contains('active');
        currentPageElement.classList.remove('active');  // 先移除active
        currentPageElement.classList.add('phone-page-dimmed');
        logger.debug('[PhoneUI.showPage] 当前页面已隐藏并变暗:', currentPageItem.pageName, {
          pageId: currentPageItem.pageId,
          hadActive,
          nowClasses: Array.from(currentPageElement.classList),
          zIndex: window.getComputedStyle(currentPageElement).zIndex
        });
      }

      // 2. 添加滑入动画类（初始状态：在右边100%）
      logger.debug('[PhoneUI.showPage] 步骤2: 添加滑入动画类');
      targetPage.classList.add('phone-slide-in-right');
      logger.debug('[PhoneUI.showPage] 步骤2完成，classList:', Array.from(targetPage.classList));

      // 3. 显示页面（display: flex）
      logger.debug('[PhoneUI.showPage] 步骤3: 添加active类');
      logger.debug('[PhoneUI.showPage] 步骤3前状态:', {
        classList: Array.from(targetPage.classList),
        computedDisplay: window.getComputedStyle(targetPage).display,
        computedZIndex: window.getComputedStyle(targetPage).zIndex
      });

      targetPage.classList.add('active');

      // 强制浏览器重新计算样式
      void /** @type {HTMLElement} */ (targetPage).offsetHeight;

      const computedAfterActive = window.getComputedStyle(targetPage);
      logger.debug('[PhoneUI.showPage] 步骤3后状态:', {
        classList: Array.from(targetPage.classList),
        classListString: targetPage.className,
        hasActive: targetPage.classList.contains('active'),
        hasPhonePage: targetPage.classList.contains('phone-page'),
        computedDisplay: computedAfterActive.display,
        computedZIndex: computedAfterActive.zIndex,
        computedVisibility: computedAfterActive.visibility,
        computedOpacity: computedAfterActive.opacity,
        computedFlexDirection: computedAfterActive.flexDirection
      });

      // 检查CSS规则是否存在（详细版，调试白屏问题）
      logger.debug('[PhoneUI.showPage] ==================== CSS规则检查 ====================');
      logger.debug('[PhoneUI.showPage] 目标元素:', {
        id: targetPage.id,
        classList: Array.from(targetPage.classList),
        tagName: targetPage.tagName
      });

      const relevantRules = [];
      let foundPhonePageActive = false;
      let foundPhonePage = false;

      try {
        for (let i = 0; i < document.styleSheets.length; i++) {
          const sheet = document.styleSheets[i];
          const sheetHref = sheet.href || '(内联样式)';

          try {
            const rules = sheet.cssRules || sheet.rules;
            for (let j = 0; j < rules.length; j++) {
              const rule = /** @type {CSSStyleRule} */ (rules[j]);
              if (rule.selectorText) {
                // 收集所有相关的.phone-page规则
                if (rule.selectorText.includes('.phone-page')) {
                  relevantRules.push({
                    selector: rule.selectorText,
                    cssText: rule.cssText,
                    sheet: sheetHref.substring(sheetHref.lastIndexOf('/') + 1)
                  });

                  if (rule.selectorText === '.phone-page.active' || rule.selectorText === '.active.phone-page') {
                    foundPhonePageActive = true;
                  }
                  if (rule.selectorText === '.phone-page') {
                    foundPhonePage = true;
                  }
                }
              }
            }
          } catch (e) {
            // 跨域样式表，跳过（正常情况）
            if (sheetHref !== '(内联样式)') {
              logger.debug('[PhoneUI.showPage] 跨域样式表（跳过）:', sheetHref);
            }
          }
        }
      } catch (e) {
        logger.warn('[PhoneUI.showPage] CSS规则扫描失败:', e.message);
      }

      logger.debug('[PhoneUI.showPage] CSS规则检查结果:', {
        找到phonePageActive规则: foundPhonePageActive,
        找到phonePage规则: foundPhonePage,
        相关规则总数: relevantRules.length
      });

      if (relevantRules.length > 0) {
        logger.debug('[PhoneUI.showPage] 所有.phone-page相关规则:');
        relevantRules.forEach((r, index) => {
          logger.debug(`  [${index + 1}] ${r.selector}`, r.cssText);
        });
      }

      if (!foundPhonePageActive) {
        logger.warn('[PhoneUI.showPage] ⚠️ 未找到.phone-page.active的CSS规则！这可能导致页面不显示');
      }

      if (!foundPhonePage) {
        logger.warn('[PhoneUI.showPage] ⚠️ 未找到.phone-page的基础CSS规则！');
      }

      // 额外：检查元素是否在DOM树中
      const isConnected = targetPage.isConnected;
      logger.debug('[PhoneUI.showPage] 元素是否在DOM树中:', isConnected);

      if (!isConnected) {
        logger.error('[PhoneUI.showPage] ❌❌❌ 页面元素未连接到DOM树！这是白屏的根本原因！');
        logger.error('[PhoneUI.showPage] 可能原因：container.appendChild(targetPage)失败或未执行');
      }

      logger.debug('[PhoneUI.showPage] ==================== CSS规则检查结束 ====================');

      // 4. 强制浏览器重排（确保初始状态生效）
      logger.debug('[PhoneUI.showPage] 步骤4: 强制重排');
      void /** @type {HTMLElement} */ (targetPage).offsetWidth;

      // 5. 移除滑入类，触发动画（滑到0%）
      logger.debug('[PhoneUI.showPage] 步骤5: 移除滑入类，触发动画');
      requestAnimationFrame(() => {
        targetPage.classList.remove('phone-slide-in-right');
        logger.debug('[PhoneUI.showPage] 步骤5完成，classList:', Array.from(targetPage.classList));
      });

      // 6. 动画结束后清理类名（400ms后）
      setTimeout(() => {
        targetPage.classList.remove('phone-slide-in-right');

        // 验证最终状态（详细版，用于调试）
        const computedStyle = window.getComputedStyle(targetPage);
        logger.debug('[PhoneUI.showPage] 动画结束后页面状态:', {
          pageName,
          pageId,
          classList: Array.from(targetPage.classList),
          zIndex: computedStyle.zIndex,
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          opacity: computedStyle.opacity,
          position: computedStyle.position,
          width: computedStyle.width,
          height: computedStyle.height,
          transform: computedStyle.transform
        });
      }, 450);

      logger.info('[PhoneUI.showPage] 页面已显示（带动画）:', pageName, 'ID:', pageId, '栈深度:', pageStack.getDepth());
    } else {
      logger.warn('[PhoneUI.showPage] 无法创建页面:', pageName);
      // 创建失败，出栈
      pageStack.popPage();
    }
  } catch (error) {
    logger.error('[PhoneUI.showPage] 显示页面失败:', error);
    // 失败时出栈
    pageStack.popPage();
  }
}

/**
 * 刷新页面内容
 * 
 * @description
 * 根据页面类型刷新对应的内容，不删除DOM
 * 
 * @async
 * @param {string} pageName - 页面名称
 * @param {Object} [params] - 页面参数
 */
async function refreshPageContent(pageName, params = {}) {
  logger.debug('[PhoneUI.refreshPageContent] 刷新页面内容:', pageName, params);

  switch (pageName) {
    case 'new-friends':
      // 刷新新朋友页面内容
      const { refreshNewFriendsPage } = await import('./contacts/contact-list-ui.js');
      await refreshNewFriendsPage();
      break;

    case 'contact-profile':
      // 刷新角色个人页内容
      if (params.contactId) {
        const pageElement = /** @type {HTMLElement} */ (document.querySelector('#page-contact-profile'));
        if (pageElement) {
          const { renderContactProfile } = await import('./contacts/contact-profile-ui.js');
          const newContent = await renderContactProfile(params.contactId);
          pageElement.innerHTML = '';
          pageElement.appendChild(newContent);
          pageElement.dataset.contactId = params.contactId;  // 更新contactId
        }
      }
      break;

    case 'contact-settings':
      // 刷新联系人设置页内容
      if (params.contactId) {
        const pageElement = /** @type {HTMLElement} */ (document.querySelector('#page-contact-settings'));
        if (pageElement) {
          const { renderContactSettings } = await import('./contacts/contact-settings-ui.js');
          const newContent = await renderContactSettings(params.contactId);
          pageElement.innerHTML = '';
          pageElement.appendChild(newContent);
          pageElement.dataset.contactId = params.contactId;  // 更新contactId
          logger.debug('[PhoneUI] 设置页内容已刷新:', params.contactId);
        }
      }
      break;

    case 'chat-settings':
      // 刷新聊天设置页内容
      if (params.contactId) {
        const chatSettingsElement = /** @type {HTMLElement} */ (document.querySelector('#page-chat-settings'));
        if (chatSettingsElement) {
          const { renderChatSettings } = await import('./messages/message-chat-settings-ui.js');
          const newContent = await renderChatSettings(params);
          chatSettingsElement.innerHTML = '';
          chatSettingsElement.appendChild(newContent);
          chatSettingsElement.dataset.contactId = params.contactId;  // 更新contactId
          logger.debug('[PhoneUI] 聊天设置页内容已刷新:', params.contactId);
        }
      }
      break;

    case 'character-prompt-settings':
      // 刷新角色提示词设置页内容（返回的是 DocumentFragment）
      if (params.contactId) {
        const charPromptElement = /** @type {HTMLElement} */ (document.querySelector('#page-character-prompt-settings'));
        if (charPromptElement) {
          const { renderCharacterPromptSettings } = await import('./settings/character-prompt-settings-ui.js');
          const newContent = await renderCharacterPromptSettings(params);
          charPromptElement.innerHTML = '';
          charPromptElement.appendChild(newContent);  // appendChild fragment，自动提取内容
          charPromptElement.dataset.contactId = params.contactId;  // 更新contactId
          logger.debug('[PhoneUI] 角色提示词设置页内容已刷新:', params.contactId);
        }
      }
      break;

    case 'user-profile':
      // 刷新用户个人主页内容
      const userProfilePage = document.querySelector('#page-user-profile');
      if (userProfilePage) {
        const { renderUserProfile } = await import('./profile/user-profile-ui.js');
        const newContent = await renderUserProfile();
        userProfilePage.innerHTML = '';
        userProfilePage.appendChild(newContent);
        logger.debug('[PhoneUI] 用户个人主页内容已刷新');
      }
      break;

    case 'favorites-list':
      // 刷新收藏列表页内容
      const favoritesPage = document.querySelector('#page-favorites-list');
      if (favoritesPage) {
        const { renderFavoritesList } = await import('./favorites/favorites-list-ui.js');
        const newContent = await renderFavoritesList();
        favoritesPage.innerHTML = '';
        favoritesPage.appendChild(newContent);
        logger.debug('[PhoneUI] 收藏列表页内容已刷新');
      }
      break;

    case 'signature-history':
      // 刷新个签历史页内容
      const signatureHistoryPage = /** @type {HTMLElement} */ (document.querySelector('#page-signature-history'));
      if (signatureHistoryPage) {
        const { renderSignatureHistory } = await import('./profile/signature-history-ui.js');
        const newContent = await renderSignatureHistory(params);
        signatureHistoryPage.innerHTML = '';
        signatureHistoryPage.appendChild(newContent);
        // 更新 dataset
        signatureHistoryPage.dataset.targetType = params.targetType;
        if (params.contactId) {
          signatureHistoryPage.dataset.contactId = params.contactId;
        } else {
          delete signatureHistoryPage.dataset.contactId;
        }
        logger.debug('[PhoneUI] 个签历史页内容已刷新:', params);
      }
      break;

    case 'chat':
      // 聊天页使用独立ID（page-chat-{contactId}），每个角色一个DOM
      // 不需要刷新逻辑，因为切换角色时会创建新的DOM
      // 注意：清除未读的逻辑已移至 showPage() 函数中（压栈后），无条件执行
      logger.debug('[PhoneUI] 聊天页使用独立DOM，无需刷新');
      break;

    case 'plan-list':
      // 刷新约定计划列表页内容
      if (params.contactId) {
        const planListPage = /** @type {HTMLElement} */ (document.querySelector('#page-plan-list'));
        if (planListPage) {
          const { renderPlanList } = await import('./plans/plan-list-ui.js');
          const newContent = await renderPlanList(params);
          planListPage.innerHTML = '';
          planListPage.appendChild(newContent);
          planListPage.dataset.contactId = params.contactId;  // 更新contactId
          logger.debug('[PhoneUI] 约定计划列表页内容已刷新:', params.contactId);
        }
      }
      break;

    default:
      logger.debug('[PhoneUI] 页面不需要刷新:', pageName);
  }
}

/**
 * 隐藏独立页面，层级式返回（带滑动动画）
 * 
 * @description
 * 智能返回逻辑：
 * 1. 出栈当前页面
 * 2. 检查栈顶：如果有上一页面，返回上一页面
 * 3. 如果栈空了，返回主布局
 * 
 * 动画效果：
 * - 当前页面向右滑出（iOS pop风格）
 * - 上一页面从变暗恢复正常
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素
 * @param {string} pageName - 当前页面名称
 */
export async function hidePage(overlayElement, pageName) {
  logger.info('[PhoneUI.hidePage] 返回上一页，当前页面:', pageName);

  // 出栈当前页面
  const poppedPage = pageStack.popPage();

  // 获取当前页面元素（直接用pageId，不需要判断）
  let currentPage;
  if (poppedPage) {
    logger.debug('[PhoneUI.hidePage] 已出栈:', poppedPage.pageName, 'ID:', poppedPage.pageId);
    currentPage = overlayElement.querySelector(`#${poppedPage.pageId}`);

    if (!currentPage) {
      logger.warn('[PhoneUI.hidePage] ⚠️ 找不到被出栈页面的DOM:', poppedPage.pageId);
    }
  }

  // 检查栈顶（上一页面）
  const previousPage = pageStack.getCurrentPage();

  if (previousPage) {
    // 有上一页面，返回到上一页面（带动画）
    logger.info('[PhoneUI.hidePage] 返回到上一页面:', previousPage.pageName, 'ID:', previousPage.pageId);

    // 获取上一页面元素（直接用pageId，不需要判断）
    const targetPage = overlayElement.querySelector(`#${previousPage.pageId}`);

    if (targetPage) {
      // 1. 移除上一页面的变暗效果（恢复亮度）
      targetPage.classList.remove('phone-page-dimmed');
      logger.debug('[PhoneUI.hidePage] 上一页面已移除dimmed');

      // 2. 隐藏其他所有active页面（确保只有1个active）
      const allPages = overlayElement.querySelectorAll('.phone-page.active');
      allPages.forEach(page => {
        if (page !== targetPage) {
          page.classList.remove('active');
          logger.debug('[PhoneUI.hidePage] 隐藏其他active页面:', page.id);
        }
      });

      // 3. 显示上一页面（不刷新，保留事件监听器）
      targetPage.classList.add('active');

      // 4. 当前页面添加滑出动画
      if (currentPage) {
        currentPage.classList.add('phone-slide-out-right');
        void /** @type {HTMLElement} */ (currentPage).offsetWidth;

        requestAnimationFrame(() => {
          currentPage.classList.add('hiding');
        });

        // 5. 清理特定页面的事件监听
        if (poppedPage && poppedPage.pageName === 'friend-request-detail') {
          const { cleanupEventListeners } = await import('./contacts/friend-request-detail-ui.js');
          cleanupEventListeners(poppedPage.pageId);
          logger.debug('[PhoneUI.hidePage] 已清理好友申请详情页事件监听');
        }

        // 6. 立即检查聊天页/转账页是否在栈中（决策要在栈改变前做）
        // 注意：判断pageName而不是ID前缀（chat-settings也包含'page-chat-'）
        const shouldDeletePage = poppedPage
          && (poppedPage.pageName === 'chat' || poppedPage.pageName === 'transfer')
          && pageStack.findPageIndex(currentPage.id) < 0;

        if (shouldDeletePage) {
          logger.debug('[PhoneUI.hidePage] 页面不在栈中，将在动画后删除:', currentPage.id);
        } else if (poppedPage && (poppedPage.pageName === 'chat' || poppedPage.pageName === 'transfer')) {
          logger.debug('[PhoneUI.hidePage] 页面还在栈中，保留DOM:', currentPage.id);
        }

        // 6. 动画结束后移除当前页面（400ms后）
        setTimeout(() => {
          currentPage.classList.remove('active', 'phone-slide-out-right', 'hiding');

          // 聊天页/转账页：根据之前的决策删除（不在这里检查栈，因为栈可能已变化）
          if (shouldDeletePage) {
            logger.warn('[PhoneUI.hidePage] ⚠️⚠️⚠️ 即将删除页面DOM:', currentPage.id, {
              决策时刻: '立即检查（450ms前）',
              当时栈深度: '见上方日志',
              删除原因: '页面不在栈中'
            });

            // 清理计划列表监听器（防止内存泄漏）
            if (poppedPage && poppedPage.pageName === 'plan-list') {
              import('./plans/plan-list-ui.js').then(({ cleanupPlanListUI }) => {
                cleanupPlanListUI();
              });
            }

            currentPage.remove();
            logger.warn('[PhoneUI.hidePage] 页面DOM已删除 ← 如果误删，检查这里');
          }

          logger.debug('[PhoneUI.hidePage] 已隐藏当前页面:', pageName);
        }, 450);
      }

      logger.debug('[PhoneUI.hidePage] 已显示上一页面（带动画）:', previousPage.pageName, 'ID:', previousPage.pageId, '栈深度:', pageStack.getDepth());
    } else {
      logger.warn('[PhoneUI.hidePage] ⚠️ 找不到上一页面DOM:', previousPage.pageId);
      // 找不到页面，直接隐藏当前页面，回到主布局
      if (currentPage) {
        // 立即检查聊天页/转账页是否在栈中（判断pageName，不是ID前缀）
        const shouldDeletePage = poppedPage
          && (poppedPage.pageName === 'chat' || poppedPage.pageName === 'transfer')
          && pageStack.findPageIndex(currentPage.id) < 0;

        // 清理计划列表监听器（防止内存泄漏）
        if (shouldDeletePage && poppedPage && poppedPage.pageName === 'plan-list') {
          import('./plans/plan-list-ui.js').then(({ cleanupPlanListUI }) => {
            cleanupPlanListUI();
          });
        }

        currentPage.classList.remove('active');

        // 聊天页/转账页：根据决策删除
        if (shouldDeletePage) {
          currentPage.remove();
          logger.debug('[PhoneUI.hidePage] 页面不在栈中，删除DOM:', currentPage.id);
        } else if (poppedPage && (poppedPage.pageName === 'chat' || poppedPage.pageName === 'transfer')) {
          logger.debug('[PhoneUI.hidePage] 页面还在栈中，保留DOM:', currentPage.id);
        }
      }
      showMainLayout(overlayElement);
      showBottomNav(overlayElement);
    }
  } else {
    // 栈空了，返回主布局（带动画）
    logger.info('[PhoneUI.hidePage] 栈已空，返回主布局');

    if (currentPage) {
      logger.debug('[PhoneUI.hidePage] 找到当前页面，添加滑出动画:', currentPage.id);

      // 添加滑出动画
      currentPage.classList.add('phone-slide-out-right');
      void /** @type {HTMLElement} */ (currentPage).offsetWidth;

      requestAnimationFrame(() => {
        currentPage.classList.add('hiding');
      });

      // 动画结束后隐藏并显示主布局
      setTimeout(() => {
        currentPage.classList.remove('active', 'phone-slide-out-right', 'hiding');

        // 聊天页/转账页：栈空了，一定不在栈中，可以删除DOM
        // 注意：判断pageName而不是ID前缀（chat-settings也包含'page-chat-'）
        if (poppedPage && (poppedPage.pageName === 'chat' || poppedPage.pageName === 'transfer')) {
          currentPage.remove();
          logger.debug('[PhoneUI.hidePage] 栈空，页面DOM已删除:', currentPage.id);
        }

        showMainLayout(overlayElement);
        showBottomNav(overlayElement);
        logger.debug('[PhoneUI.hidePage] 页面已隐藏，主布局已显示');
      }, 450);
    } else {
      // 没有当前页面，强制隐藏所有active页面
      logger.warn('[PhoneUI.hidePage] ⚠️ 找不到当前页面DOM，强制隐藏所有active页面');

      const allActivePages = overlayElement.querySelectorAll('.phone-page.active');
      allActivePages.forEach(page => {
        page.classList.remove('active');
        logger.debug('[PhoneUI.hidePage] 强制隐藏:', page.id);
      });

      showMainLayout(overlayElement);
      showBottomNav(overlayElement);
    }
  }
}

/**
 * 创建独立页面
 * 
 * @description
 * 根据页面名称动态创建页面内容
 * 
 * @async
 * @param {string} pageName - 页面名称
 * @param {Object} [params] - 页面参数
 * @returns {Promise<HTMLElement|null>} 页面元素或null
 */
async function createPage(pageName, params = {}) {
  logger.debug('[PhoneUI.createPage] 创建页面:', pageName, params);

  switch (pageName) {
    case 'new-friends':
      // 动态导入新朋友页面渲染函数
      const { renderNewFriendsPage } = await import('./contacts/contact-list-ui.js');
      const newFriendsPage = await renderNewFriendsPage();
      // 添加布局模式类
      if (newFriendsPage) {
        newFriendsPage.classList.add('phone-page-scrollable');
      }
      return newFriendsPage;

    case 'friend-request-detail':
      // 动态导入好友申请详情页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 好友申请详情页缺少contactId参数');
        return null;
      }
      const { renderFriendRequestDetail } = await import('./contacts/friend-request-detail-ui.js');
      const detailContent = await renderFriendRequestDetail(params.contactId);

      // 创建页面容器
      const detailPage = document.createElement('div');
      detailPage.id = 'page-friend-request-detail';
      detailPage.className = 'phone-page phone-page-scrollable';
      detailPage.dataset.contactId = params.contactId;  // 保存contactId，用于参数比较

      // 将内容添加到容器中（DocumentFragment 的子节点会被移动）
      if (detailContent) {
        detailPage.appendChild(detailContent);
      }

      return detailPage;

    case 'contact-profile':
      // 动态导入角色个人页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 角色个人页缺少contactId参数');
        return null;
      }
      const { renderContactProfile } = await import('./contacts/contact-profile-ui.js');
      const profileContent = await renderContactProfile(params.contactId);

      // 创建页面容器
      const profilePage = document.createElement('div');
      profilePage.id = 'page-contact-profile';
      profilePage.className = 'phone-page phone-page-fixed';  // 自定义布局：固定头部+局部滚动
      profilePage.dataset.contactId = params.contactId;  // 保存contactId，用于参数比较
      profilePage.appendChild(profileContent);

      return profilePage;

    case 'contact-settings':
      // 动态导入联系人设置页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 设置页缺少contactId参数');
        return null;
      }
      const { renderContactSettings } = await import('./contacts/contact-settings-ui.js');
      const settingsContent = await renderContactSettings(params.contactId);

      // 创建页面容器
      const settingsPage = document.createElement('div');
      settingsPage.id = 'page-contact-settings';
      settingsPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      settingsPage.dataset.contactId = params.contactId;  // 保存contactId
      settingsPage.appendChild(settingsContent);

      return settingsPage;

    case 'chat':
      // 动态导入聊天界面渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 聊天页面缺少contactId参数');
        return null;
      }
      const { renderChatView } = await import('./messages/message-chat-ui.js');
      return await renderChatView(params.contactId);

    case 'chat-settings':
      // 动态导入聊天设置页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 聊天设置页缺少contactId参数');
        return null;
      }
      const { renderChatSettings } = await import('./messages/message-chat-settings-ui.js');
      const chatSettingsContent = await renderChatSettings(params);

      // 创建页面容器
      const chatSettingsPage = document.createElement('div');
      chatSettingsPage.id = 'page-chat-settings';
      chatSettingsPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      chatSettingsPage.dataset.contactId = params.contactId;  // 保存contactId
      chatSettingsPage.appendChild(chatSettingsContent);

      return chatSettingsPage;

    case 'notification-settings':
      // 动态导入消息通知设置页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 消息通知设置页缺少contactId参数');
        return null;
      }
      const { renderNotificationSettings } = await import('./messages/message-notification-settings-ui.js');
      const notificationSettingsContent = await renderNotificationSettings(params);

      // 创建页面容器
      const notificationSettingsPage = document.createElement('div');
      notificationSettingsPage.id = 'page-notification-settings';
      notificationSettingsPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      notificationSettingsPage.dataset.contactId = params.contactId;  // 保存contactId
      notificationSettingsPage.appendChild(notificationSettingsContent);

      return notificationSettingsPage;

    case 'chat-background-settings':
      // 动态导入聊天背景设置页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 聊天背景设置页缺少contactId参数');
        return null;
      }
      const { renderChatBackgroundSettings } = await import('./messages/message-chat-background-ui.js');
      const chatBgContent = await renderChatBackgroundSettings(params);

      // 创建页面容器
      const chatBgPage = document.createElement('div');
      chatBgPage.id = 'page-chat-background-settings';
      chatBgPage.className = 'phone-page phone-page-fixed';  // 固定布局：固定头部+控制区+滚动内容+固定底部
      chatBgPage.dataset.contactId = params.contactId;  // 保存contactId
      chatBgPage.appendChild(chatBgContent);

      return chatBgPage;

    case 'user-profile':
      // 动态导入用户个人主页渲染函数
      const { renderUserProfile } = await import('./profile/user-profile-ui.js');
      const userProfileContent = await renderUserProfile();

      // 创建页面容器
      const userProfilePage = document.createElement('div');
      userProfilePage.id = 'page-user-profile';
      userProfilePage.className = 'phone-page phone-page-fixed';  // 自定义布局：固定头部+局部滚动
      userProfilePage.appendChild(userProfileContent);

      return userProfilePage;

    case 'group-manage':
      // 动态导入分组管理页面渲染函数
      const { renderGroupManagePage } = await import('./contacts/contact-group-manage-ui.js');
      const groupManagePage = await renderGroupManagePage();
      // 添加布局模式类
      if (groupManagePage) {
        groupManagePage.classList.add('phone-page-scrollable');
      }
      return groupManagePage;

    case 'user-settings':
      // 动态导入用户设置页渲染函数
      const { renderUserSettings } = await import('./profile/user-settings-ui.js');
      const settingsContentFrag = await renderUserSettings();

      // 创建页面容器
      const settingsPageEl = document.createElement('div');
      settingsPageEl.id = 'page-user-settings';
      settingsPageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      settingsPageEl.appendChild(settingsContentFrag);

      return settingsPageEl;

    case 'image-mode-settings':
      // 动态导入图片识别模式设置页渲染函数
      const { renderImageModeSettings } = await import('./settings/image-mode-settings-ui.js');
      const imageModeSettingsContentFrag = await renderImageModeSettings();

      // 创建页面容器
      const imageModeSettingsPageEl = document.createElement('div');
      imageModeSettingsPageEl.id = 'page-image-mode-settings';
      imageModeSettingsPageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      imageModeSettingsPageEl.appendChild(imageModeSettingsContentFrag);

      return imageModeSettingsPageEl;

    case 'storage-space':
      // 动态导入存储空间页渲染函数
      const { renderStorageSpace } = await import('./storage/storage-space-ui.js');
      const storageSpaceContentFrag = await renderStorageSpace();

      // 创建页面容器
      const storageSpacePageEl = document.createElement('div');
      storageSpacePageEl.id = 'page-storage-space';
      storageSpacePageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      storageSpacePageEl.appendChild(storageSpaceContentFrag);

      return storageSpacePageEl;

    case 'image-storage':
      // 动态导入图片管理页渲染函数
      const { renderImageStorage } = await import('./storage/image-storage-ui.js');
      const imageStorageContentFrag = await renderImageStorage();

      // 创建页面容器
      const imageStoragePageEl = document.createElement('div');
      imageStoragePageEl.id = 'page-image-storage';
      imageStoragePageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      imageStoragePageEl.appendChild(imageStorageContentFrag);

      return imageStoragePageEl;

    case 'favorites-list':
      // 动态导入收藏列表页渲染函数
      const { renderFavoritesList } = await import('./favorites/favorites-list-ui.js');
      const favoritesContentFrag = await renderFavoritesList();

      // 创建页面容器
      const favoritesPageEl = document.createElement('div');
      favoritesPageEl.id = 'page-favorites-list';
      favoritesPageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：固定topbar+内容滚动
      favoritesPageEl.appendChild(favoritesContentFrag);

      return favoritesPageEl;

    case 'plan-list':
      // 动态导入约定计划列表页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 约定计划列表页缺少contactId参数');
        return null;
      }
      const { renderPlanList } = await import('./plans/plan-list-ui.js');
      const planListContentFrag = await renderPlanList(params);

      // 创建页面容器
      const planListPageEl = document.createElement('div');
      planListPageEl.id = 'page-plan-list';
      planListPageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：固定topbar+内容滚动
      planListPageEl.dataset.contactId = params.contactId;
      planListPageEl.appendChild(planListContentFrag);

      return planListPageEl;

    case 'user-wallet':
      // 动态导入钱包页面渲染函数
      const { renderUserWallet } = await import('./profile/user-wallet-ui.js');

      // 创建页面容器
      const walletPageEl = document.createElement('div');
      walletPageEl.id = 'page-user-wallet';
      walletPageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动

      // 调用渲染函数
      await renderUserWallet({ container: walletPageEl });

      return walletPageEl;

    case 'contact-transactions':
      // 动态导入往来记录页面渲染函数
      const { renderContactTransactions } = await import('./contacts/contact-transactions-ui.js');

      // 创建页面容器
      const transactionsPageEl = document.createElement('div');
      transactionsPageEl.id = 'page-contact-transactions';
      transactionsPageEl.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      transactionsPageEl.dataset.contactId = params.contactId;  // 保存contactId

      // 调用渲染函数
      await renderContactTransactions({ container: transactionsPageEl, contactId: params.contactId });

      return transactionsPageEl;

    case 'api-settings':
      // 动态导入API设置页渲染函数
      const { renderAPISettings } = await import('./settings/api-settings-ui.js');
      const apiSettingsPage = await renderAPISettings(params);
      // 添加布局模式类
      if (apiSettingsPage) {
        apiSettingsPage.classList.add('phone-page-scrollable');
      }
      return apiSettingsPage;

    case 'preset-settings':
      // 动态导入预设管理页渲染函数
      const { renderPresetSettings } = await import('./settings/preset-settings-ui.js');
      const presetSettingsPage = await renderPresetSettings(params);
      // 添加布局模式类
      if (presetSettingsPage) {
        presetSettingsPage.classList.add('phone-page-scrollable');
      }
      return presetSettingsPage;

    case 'message-send-custom':
      // 动态导入消息发送管理页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 消息发送管理页缺少contactId参数');
        return null;
      }
      const { renderMessageSendCustom } = await import('./messages/message-send-custom-ui.js');
      const msgSendCustomContent = await renderMessageSendCustom(params);

      // 创建页面容器
      const msgSendCustomPage = document.createElement('div');
      msgSendCustomPage.id = 'page-message-send-custom';
      msgSendCustomPage.className = 'phone-page phone-page-scrollable';
      msgSendCustomPage.dataset.contactId = params.contactId;
      msgSendCustomPage.appendChild(msgSendCustomContent);

      return msgSendCustomPage;

    case 'character-prompt-settings':
      // 动态导入角色提示词设置页渲染函数
      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 角色提示词设置页缺少contactId参数');
        return null;
      }
      const { renderCharacterPromptSettings } = await import('./settings/character-prompt-settings-ui.js');
      const charPromptContent = await renderCharacterPromptSettings(params);

      // 创建页面容器（和 chat-settings 一样的逻辑）
      const charPromptPage = document.createElement('div');
      charPromptPage.id = 'page-character-prompt-settings';
      charPromptPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      charPromptPage.dataset.contactId = params.contactId;  // 保存contactId
      charPromptPage.appendChild(charPromptContent);

      return charPromptPage;

    case 'emoji-manager':
      // 动态导入表情包管理页渲染函数
      const { renderEmojiManager } = await import('./emojis/emoji-manager-ui.js');
      const emojiManagerContent = await renderEmojiManager();

      // 创建页面容器
      const emojiManagerPage = document.createElement('div');
      emojiManagerPage.id = 'page-emoji-manager';
      emojiManagerPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      emojiManagerPage.appendChild(emojiManagerContent);

      return emojiManagerPage;

    case 'help-center':
      // 动态导入帮助中心页渲染函数
      const { renderHelpCenter } = await import('./help/help-center-ui.js');
      const helpCenterContent = await renderHelpCenter();

      // 创建页面容器
      const helpCenterPage = document.createElement('div');
      helpCenterPage.id = 'page-help-center';
      helpCenterPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      helpCenterPage.appendChild(helpCenterContent);

      return helpCenterPage;

    case 'signature-history':
      // 动态导入个签历史页渲染函数
      if (!params.targetType) {
        logger.warn('[PhoneUI.createPage] 个签历史页缺少targetType参数');
        return null;
      }

      const { renderSignatureHistory } = await import('./profile/signature-history-ui.js');
      const signatureHistoryContent = await renderSignatureHistory(params);

      // 创建页面容器
      const signatureHistoryPage = document.createElement('div');
      signatureHistoryPage.id = 'page-signature-history';
      signatureHistoryPage.className = 'phone-page phone-page-scrollable';  // 标准布局
      signatureHistoryPage.dataset.targetType = params.targetType;
      if (params.contactId) {
        signatureHistoryPage.dataset.contactId = params.contactId;
      }
      signatureHistoryPage.appendChild(signatureHistoryContent);

      return signatureHistoryPage;

    case 'emoji-guide-detail':
      // 动态导入表情包详细说明页渲染函数
      const { renderEmojiGuideDetail } = await import('./help/emoji-guide-detail-ui.js');
      const emojiGuideDetailContent = await renderEmojiGuideDetail();

      // 创建页面容器
      const emojiGuideDetailPage = document.createElement('div');
      emojiGuideDetailPage.id = 'page-emoji-guide-detail';
      emojiGuideDetailPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      emojiGuideDetailPage.appendChild(emojiGuideDetailContent);

      return emojiGuideDetailPage;

    case 'faq-detail':
      // 动态导入常见问题详细页渲染函数
      const { renderFaqDetail } = await import('./help/faq-detail-ui.js');
      const faqDetailContent = await renderFaqDetail();

      // 创建页面容器
      const faqDetailPage = document.createElement('div');
      faqDetailPage.id = 'page-faq-detail';
      faqDetailPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      faqDetailPage.appendChild(faqDetailContent);

      return faqDetailPage;

    case 'macro-guide-detail':
      // 动态导入宏变量使用教程页渲染函数
      const { renderMacroGuideDetail } = await import('./help/macro-guide-detail.js');
      const macroGuideDetailContent = await renderMacroGuideDetail();

      // 创建页面容器
      const macroGuideDetailPage = document.createElement('div');
      macroGuideDetailPage.id = 'page-macro-guide-detail';
      macroGuideDetailPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      macroGuideDetailPage.appendChild(macroGuideDetailContent);

      return macroGuideDetailPage;

    case 'transfer':
      // 动态导入转账页面渲染函数
      logger.debug('[PhoneUI.createPage] 开始创建转账页，params:', params);

      if (!params.contactId) {
        logger.warn('[PhoneUI.createPage] 转账页面缺少contactId参数');
        return null;
      }

      const { renderTransferPage } = await import('./messages/transfer-ui.js');
      logger.debug('[PhoneUI.createPage] 已导入renderTransferPage函数');

      const transferContent = await renderTransferPage(params);
      logger.debug('[PhoneUI.createPage] 渲染函数已返回，类型:', transferContent ? transferContent.constructor.name : 'null');
      logger.debug('[PhoneUI.createPage] transferContent详情:', {
        nodeType: transferContent?.nodeType,
        childNodes: transferContent?.childNodes?.length,
        firstChild: transferContent?.firstChild,
        firstChildClass: transferContent?.firstChild ? /** @type {HTMLElement} */ (transferContent.firstChild).className : 'null'
      });

      // 创建外层页面容器（每个联系人独立DOM）
      const transferPage = document.createElement('div');
      const safeId = params.contactId.replace(/[^a-zA-Z0-9_-]/g, '_');
      transferPage.id = `page-transfer-${safeId}`;
      transferPage.className = 'phone-page phone-page-scrollable';  // 标准布局：整页滚动
      transferPage.dataset.contactId = params.contactId;  // 保存contactId

      logger.debug('[PhoneUI.createPage] 外层容器已创建:', {
        id: transferPage.id,
        className: transferPage.className,
        datasetContactId: transferPage.dataset.contactId
      });

      transferPage.appendChild(transferContent);
      logger.debug('[PhoneUI.createPage] transferContent已添加到外层容器');
      logger.debug('[PhoneUI.createPage] 外层容器子元素数量:', transferPage.children.length);
      logger.debug('[PhoneUI.createPage] 外层容器第一个子元素:', transferPage.children[0]?.className);

      // 检查DOM嵌套结构（防止容器嵌套导致样式失效）
      logger.debug('[PhoneUI.createPage] DOM结构检查:');
      logger.debug('[PhoneUI.createPage] - 第1层（外层）:', transferPage.id, transferPage.className);
      if (transferPage.children[0]) {
        const secondLayer = /** @type {HTMLElement} */ (transferPage.children[0]);
        logger.debug('[PhoneUI.createPage] - 第2层（内容）:', secondLayer.className);
        if (secondLayer.children.length > 0) {
          logger.debug('[PhoneUI.createPage] - 第3层子元素数量:', secondLayer.children.length);
          const thirdLayer = /** @type {HTMLElement} */ (secondLayer.children[0]);
          logger.debug('[PhoneUI.createPage] - 第3层第一个:', thirdLayer?.className);
        }
      }

      logger.info('[PhoneUI.createPage] 转账页面已创建，联系人:', params.contactId);
      logger.debug('[PhoneUI.createPage] 返回的transferPage:', {
        id: transferPage.id,
        className: transferPage.className,
        childrenCount: transferPage.children.length,
        outerHTML前200字符: transferPage.outerHTML.substring(0, 200) + '...',
        innerHTML前200字符: transferPage.innerHTML.substring(0, 200) + '...'
      });

      return transferPage;

    default:
      logger.warn('[PhoneUI.createPage] 未知的页面:', pageName);
      return null;
  }
}

/**
 * 导出供其他模块使用的函数
 */
export { switchTab, updateUserInfo, closePhoneUI };


