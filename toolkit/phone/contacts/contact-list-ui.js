/**
 * 联系人列表界面
 * @module phone/contacts/contact-list-ui
 */

import logger from '../../../logger.js';
import {
  loadContacts,
  markFriendAsAgreed,
  getAgreedFriends,
  getUnreadFriendRequestsCount,
  getPendingRequests,
  loadContactGroups,
  getAIAwareDeletedRequests
} from './contact-list-data.js';
import { loadData, saveData } from '../data-storage/storage-api.js';
import { hidePage, showPage } from '../phone-main-ui.js';
import { showSuccessToast } from '../ui-components/toast-notification.js';
import { getThumbnailUrl } from '../../../../../../../script.js';
import { formatTime } from '../utils/time-helper.js';

/**
 * 渲染联系人列表
 * 
 * @description
 * 创建联系人页面的内容（不包含外层容器），包括搜索框、
 * 特殊项（新朋友/群通知）、分组列表等
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 联系人列表内容片段
 */
async function renderContactList() {
  logger.debug('[ContactList] 渲染联系人列表');

  try {
    // 加载联系人数据
    const contacts = await loadContacts();

    // 使用文档片段（不创建外层容器）
    const fragment = document.createDocumentFragment();

    // 1. 创建搜索框
    fragment.appendChild(createSearchBar());

    // 2. 创建特殊项（新朋友/群通知）- 异步获取徽章数量
    const specialItems = await createSpecialItems();
    fragment.appendChild(specialItems);

    // 3. 创建分组列表（异步）
    const groupsElement = await createContactGroups(contacts);
    fragment.appendChild(groupsElement);

    logger.info('[ContactList] 联系人列表渲染完成，共', contacts.length, '个联系人');
    return fragment;
  } catch (error) {
    logger.error('[ContactList] 渲染联系人列表失败:', error);

    // 返回错误提示
    const fragment = document.createDocumentFragment();
    const errorDiv = document.createElement('div');
    errorDiv.textContent = '加载联系人失败';
    errorDiv.style.cssText = 'padding: 20px; text-align: center; color: #999;';
    fragment.appendChild(errorDiv);
    return fragment;
  }
}

/**
 * 创建搜索框
 * @returns {HTMLElement} 搜索框元素
 */
function createSearchBar() {
  const searchBar = document.createElement('div');
  searchBar.className = 'contact-search-bar';
  searchBar.innerHTML = `
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="text" placeholder="搜索">
  `;
  return searchBar;
}

/**
 * 创建特殊项（新朋友/群通知）
 * 
 * @description
 * 创建特殊项列表，"新朋友"右侧显示未同意角色数量的徽章
 * 
 * @async
 * @returns {Promise<HTMLElement>} 特殊项容器
 */
async function createSpecialItems() {
  const container = document.createElement('div');
  container.className = 'contact-special-items';

  // 计算未同意的好友数量
  const unreadCount = await getUnreadFriendRequestsCount();

  // 新朋友
  const newFriends = document.createElement('div');
  newFriends.className = 'contact-special-item';
  newFriends.innerHTML = `
    <i class="fa-solid fa-user-plus contact-special-icon"></i>
    <span class="contact-special-text">新朋友</span>
    ${unreadCount > 0 ? `<div class="contact-special-badge">${unreadCount}</div>` : ''}
    <i class="fa-solid fa-chevron-right contact-special-arrow"></i>
  `;

  // 绑定点击事件 - 跳转到新朋友页面
  newFriends.addEventListener('click', () => {
    logger.info('[ContactList] 点击新朋友');
    const phoneOverlay = document.querySelector('.phone-overlay');
    if (phoneOverlay) {
      showPage(/** @type {HTMLElement} */(phoneOverlay), 'new-friends');
    }
  });

  // 群通知
  const groupNotify = document.createElement('div');
  groupNotify.className = 'contact-special-item';
  groupNotify.innerHTML = `
    <i class="fa-solid fa-users contact-special-icon"></i>
    <span class="contact-special-text">群通知</span>
    <i class="fa-solid fa-chevron-right contact-special-arrow"></i>
  `;

  container.appendChild(newFriends);
  container.appendChild(groupNotify);

  return container;
}

/**
 * 创建分组列表
 * 
 * @description
 * 从 contactGroups 读取分组配置，按分组显示联系人
 * 支持折叠/展开功能
 * 
 * @async
 * @param {Array} contacts - 联系人列表
 * @returns {Promise<HTMLElement>} 分组列表容器
 */
async function createContactGroups(contacts) {
  const groupsContainer = document.createElement('div');
  groupsContainer.className = 'contact-groups';

  // 如果没有联系人，显示提示
  if (contacts.length === 0) {
    const emptyHint = document.createElement('div');
    emptyHint.style.cssText = 'padding: 40px 20px; text-align: center; color: #999;';
    emptyHint.innerHTML = `
      <p>暂无联系人</p>
      <p style="font-size: 0.9em; margin-top: 10px;">点击右上角+号</p>
      <p style="font-size: 0.9em;">选择"同步酒馆角色"</p>
    `;
    groupsContainer.appendChild(emptyHint);
    return groupsContainer;
  }

  // 从 contactGroups 读取分组配置
  const groups = await loadContactGroups();

  // 读取折叠状态
  const collapsedGroups = await loadCollapsedGroups();

  // 按 order 排序
  const sortedGroups = groups.sort((a, b) => a.order - b.order);

  // 为每个分组创建UI（显示所有分组，包括空分组）
  for (const group of sortedGroups) {
    // 筛选该分组的联系人（默认分组包含没有 groupId 的联系人）
    const groupContacts = contacts.filter(c => {
      if (c.groupId) {
        return c.groupId === group.id;
      } else {
        // 没有 groupId 的联系人归到默认分组
        return group.isDefault;
      }
    });

    // 调试日志：查看每个分组的联系人分配情况
    logger.debug(`[ContactList] 分组"${group.name}" (${group.id}) 包含 ${groupContacts.length} 个联系人:`,
      groupContacts.map(c => `${c.name}(groupId: ${c.groupId || '无'})`).join(', '));

    // 显示所有分组（包括空分组）
    const isCollapsed = collapsedGroups.includes(group.id);
    groupsContainer.appendChild(
      await createGroup(group.id, group.name, groupContacts, isCollapsed)
    );
  }

  return groupsContainer;
}

/**
 * 创建单个分组
 * 
 * @description
 * 创建可折叠的分组，显示分组名称、联系人数量、箭头图标
 * 
 * @async
 * @param {string} groupId - 分组ID
 * @param {string} title - 分组标题
 * @param {Array} contacts - 联系人列表
 * @param {boolean} isCollapsed - 是否折叠状态
 * @returns {Promise<HTMLElement>} 分组元素
 */
async function createGroup(groupId, title, contacts, isCollapsed = false) {
  const group = document.createElement('div');
  group.className = 'contact-group';
  group.dataset.groupId = groupId;

  // 分组头部
  const header = document.createElement('div');
  header.className = 'contact-group-header';
  header.innerHTML = `
    <i class="fa-solid fa-caret-${isCollapsed ? 'right' : 'down'} contact-group-arrow"></i>
    <div class="contact-group-title">${title}</div>
    <div class="contact-group-count">${contacts.length}/${contacts.length}</div>
  `;

  // 绑定点击事件：折叠/展开
  header.addEventListener('click', () => {
    toggleGroupCollapse(groupId, group);
  });

  // 好友列表
  const friendList = document.createElement('div');
  friendList.className = 'contact-friend-list';

  // 如果折叠，隐藏列表
  if (isCollapsed) {
    friendList.style.display = 'none';
  }

  contacts.forEach(contact => {
    friendList.appendChild(createContactItem(contact));
  });

  group.appendChild(header);
  group.appendChild(friendList);

  return group;
}

/**
 * 创建单个联系人项
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 联系人项元素
 */
function createContactItem(contact) {
  const item = document.createElement('div');
  item.className = 'contact-friend-item';
  item.dataset.contactId = contact.id; // 添加唯一标识，方便后续查找

  // 构建头像路径（使用 SillyTavern 的缩略图 API）
  const avatarUrl = contact.avatar
    ? getThumbnailUrl('avatar', contact.avatar)
    : 'https://i.postimg.cc/LXQrd0s0/icon.jpg';

  // 显示逻辑：有备注显示备注，无备注显示原名
  const displayName = contact.remark || contact.name;

  item.innerHTML = `
    <img src="${avatarUrl}" alt="头像" class="contact-friend-avatar" 
         onerror="this.src='https://i.postimg.cc/LXQrd0s0/icon.jpg'">
    <div class="contact-friend-info">
      <div class="contact-friend-name">${displayName}</div>
    </div>
  `;

  // 点击事件：跳转到角色个人页
  item.addEventListener('click', () => {
    logger.debug('[ContactList] 点击联系人:', contact.name);
    handleContactClick(contact.id);
  });

  return item;
}

/**
 * 处理联系人点击事件
 * 
 * @param {string} contactId - 联系人ID
 */
function handleContactClick(contactId) {
  logger.info('[ContactList] 打开角色个人页:', contactId);

  // 获取手机遮罩层元素
  const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlayElement) {
    // 动态导入showPage函数并跳转
    import('../phone-main-ui.js').then(({ showPage }) => {
      showPage(overlayElement, 'contact-profile', { contactId });
    });
  }
}


/**
 * 渲染新朋友页面
 * 
 * @description
 * 创建新朋友页面，显示所有酒馆角色的申请列表
 * 每个角色显示头像、名称、个性签名、同意按钮
 * 
 * @async
 * @returns {Promise<HTMLElement>} 新朋友页面元素
 */
export async function renderNewFriendsPage() {
  logger.debug('[NewFriends] 渲染新朋友页面');

  try {
    // 创建页面容器
    const page = document.createElement('div');
    page.className = 'phone-page';
    page.id = 'page-new-friends';

    // 1. 创建顶部栏
    page.appendChild(createNewFriendsHeader());

    // 2. 创建搜索框
    page.appendChild(createNewFriendsSearchBar());

    // 3. 创建角色申请列表
    const contentContainer = document.createElement('div');
    contentContainer.className = 'newfriend-content';

    const friendList = await createFriendRequestList();
    contentContainer.appendChild(friendList);

    page.appendChild(contentContainer);

    // 4. 监听AI生成完成事件，自动刷新页面
    bindNewFriendsPageEvents();

    logger.info('[NewFriends] 新朋友页面渲染完成');
    return page;
  } catch (error) {
    logger.error('[NewFriends] 渲染新朋友页面失败:', error);

    // 返回错误页面
    const errorPage = document.createElement('div');
    errorPage.className = 'phone-page';
    errorPage.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">加载失败</p>';
    return errorPage;
  }
}

/**
 * 创建新朋友页面顶部栏
 * @returns {HTMLElement} 顶部栏元素
 */
function createNewFriendsHeader() {
  const header = document.createElement('div');
  header.className = 'newfriend-header';

  header.innerHTML = `
    <button class="newfriend-header-back" id="newfriend-back-btn">
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <div class="newfriend-header-title">新朋友</div>
  `;

  // 绑定返回按钮
  const backBtn = header.querySelector('#newfriend-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      logger.info('[NewFriends] 点击返回按钮');
      const phoneOverlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      if (phoneOverlay) {
        hidePage(phoneOverlay, 'new-friends');
      }
    });
  }

  return header;
}

/**
 * 创建新朋友页面搜索框
 * 
 * @description
 * 创建搜索框，支持实时搜索角色名
 * 
 * @returns {HTMLElement} 搜索框元素
 */
function createNewFriendsSearchBar() {
  const searchBar = document.createElement('div');
  searchBar.className = 'contact-search-bar';
  searchBar.innerHTML = `
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="text" placeholder="搜索" id="newfriend-search-input">
  `;

  // 绑定搜索事件 - 实时过滤
  const input = searchBar.querySelector('#newfriend-search-input');
  if (input) {
    input.addEventListener('input', (e) => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      const keyword = target.value.trim().toLowerCase();
      filterFriendRequests(keyword);
    });
  }

  return searchBar;
}

/**
 * 过滤好友申请列表
 * 
 * @description
 * 根据关键词实时过滤显示的申请项（搜索角色名）
 * 
 * @param {string} keyword - 搜索关键词
 */
function filterFriendRequests(keyword) {
  logger.debug('[NewFriends] 搜索关键词:', keyword);

  const allItems = document.querySelectorAll('.newfriend-item');

  allItems.forEach(item => {
    const itemElement = /** @type {HTMLElement} */ (item);
    const nameElement = itemElement.querySelector('.newfriend-item-name');
    if (!nameElement) return;

    const name = nameElement.textContent.toLowerCase();

    // 显示或隐藏申请项
    if (keyword === '' || name.includes(keyword)) {
      itemElement.style.display = '';
    } else {
      itemElement.style.display = 'none';
    }
  });

  logger.debug('[NewFriends] 搜索完成');
}

/**
 * 创建好友申请列表
 * 
 * @description
 * 从待处理列表（快照）中读取角色，为每个角色创建申请项
 * 只有点击"同步酒馆角色"后才会有数据
 * 性能优化：一次性获取已同意列表，避免重复读取
 * 
 * @async
 * @returns {Promise<HTMLElement>} 申请列表容器
 */
async function createFriendRequestList() {
  logger.debug('[NewFriends] 创建好友申请列表');

  const listContainer = document.createElement('div');
  listContainer.className = 'newfriend-list';

  try {
    // 1. 获取AI感知删除的申请（置顶显示）
    const aiAwareRequests = await getAIAwareDeletedRequests();

    // 2. 从待处理列表（快照）获取普通角色
    const characters = await getPendingRequests();

    // 3. 性能优化：一次性获取已同意列表
    const agreedList = await getAgreedFriends();

    // 4. 如果两个列表都为空
    if (aiAwareRequests.length === 0 && characters.length === 0) {
      const emptyHint = document.createElement('div');
      emptyHint.style.cssText = 'padding: 40px 20px; text-align: center; color: #999;';
      emptyHint.innerHTML = `
        <p>暂无待处理申请</p>
        <p style="font-size: 0.9em; margin-top: 10px;">点击右上角+号</p>
        <p style="font-size: 0.9em;">选择"同步酒馆角色"</p>
      `;
      listContainer.appendChild(emptyHint);
      return listContainer;
    }

    // 5. 先显示AI感知删除的申请（按最新消息时间倒序）
    const sortedAIRequests = aiAwareRequests
      .map(req => ({
        ...req,
        lastMessageTime: req.reapplyMessages.length > 0
          ? req.reapplyMessages[req.reapplyMessages.length - 1].time
          : req.deleteTime
      }))
      .sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    for (const request of sortedAIRequests) {
      const requestItem = await createAIAwareRequestItem(request);
      listContainer.appendChild(requestItem);
    }

    // 6. 再显示普通角色申请
    for (const character of characters) {
      const requestItem = createFriendRequestItem(character, agreedList);
      listContainer.appendChild(requestItem);
    }

    logger.info('[NewFriends] 好友申请列表创建完成，AI感知:', aiAwareRequests.length, '普通:', characters.length);
    return listContainer;
  } catch (error) {
    logger.error('[NewFriends] 创建申请列表失败:', error);
    return listContainer;
  }
}

/**
 * 创建AI感知删除的好友申请项
 * 
 * @async
 * @param {Object} request - AI感知删除申请对象
 * @returns {Promise<HTMLElement>} 申请项元素
 */
async function createAIAwareRequestItem(request) {
  const item = document.createElement('div');
  item.className = 'newfriend-item ai-aware-deleted';

  // 构建头像路径
  const avatarUrl = getThumbnailUrl('avatar', request.avatar);

  // 最新的附加消息
  const latestMessage = request.reapplyMessages.length > 0
    ? request.reapplyMessages[request.reapplyMessages.length - 1].message
    : '（暂无申请消息）';

  item.innerHTML = `
    <img src="${avatarUrl}" alt="头像" class="newfriend-item-avatar"
         onerror="this.src='https://i.postimg.cc/LXQrd0s0/icon.jpg'">
    <div class="newfriend-item-info">
      <div class="newfriend-item-name">${request.contactName}</div>
      <div class="newfriend-item-message">${escapeHtml(latestMessage)}</div>
    </div>
  `;

  // 创建"查看"按钮
  const viewBtn = document.createElement('button');
  viewBtn.className = 'newfriend-item-btn-view';
  viewBtn.textContent = '查看';
  viewBtn.addEventListener('click', () => handleViewAIAwareRequest(request));
  item.appendChild(viewBtn);

  return item;
}

/**
 * 处理查看AI感知删除申请
 * 
 * @async
 * @param {Object} request - 申请对象
 */
async function handleViewAIAwareRequest(request) {
  logger.info('[NewFriends] 查看AI感知删除申请:', request.contactName);

  try {
    // 获取手机遮罩层元素
    const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    if (!overlayElement) {
      logger.warn('[NewFriends] 未找到手机遮罩层元素');
      return;
    }

    // 动态导入showPage函数并跳转
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'friend-request-detail', { contactId: request.contactId });
  } catch (error) {
    logger.error('[NewFriends] 打开详情页失败:', error);
  }
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
 * 创建单个好友申请项
 * 
 * @description
 * 创建好友申请项的DOM元素，显示头像、名称、签名和按钮
 * 
 * @param {Object} character - 角色对象（联系人格式）
 * @param {Array<string>} agreedList - 已同意的好友ID列表（性能优化）
 * @returns {HTMLElement} 申请项元素
 */
function createFriendRequestItem(character, agreedList) {
  const item = document.createElement('div');
  item.className = 'newfriend-item';

  // 检查是否已同意（直接判断，不调用 isFriendAgreed()）
  const isAgreed = agreedList.includes(character.id);

  // 构建头像路径（使用 SillyTavern 的缩略图 API）
  const avatarUrl = character.avatar
    ? getThumbnailUrl('avatar', character.avatar)
    : 'https://i.postimg.cc/LXQrd0s0/icon.jpg';

  item.innerHTML = `
    <img src="${avatarUrl}" alt="头像" class="newfriend-item-avatar"
         onerror="this.src='https://i.postimg.cc/LXQrd0s0/icon.jpg'">
    <div class="newfriend-item-info">
      <div class="newfriend-item-name">${character.name}</div>
    </div>
  `;

  // 创建按钮
  if (isAgreed) {
    // 已同意状态
    const agreedBtn = document.createElement('button');
    agreedBtn.className = 'newfriend-item-btn-agreed';
    agreedBtn.textContent = '已同意';
    agreedBtn.disabled = true;
    item.appendChild(agreedBtn);
  } else {
    // 未同意状态
    const agreeBtn = document.createElement('button');
    agreeBtn.className = 'newfriend-item-btn-agree';
    agreeBtn.textContent = '同意';

    // 绑定同意按钮点击事件
    agreeBtn.addEventListener('click', async () => {
      await handleAgreeRequest(character, agreeBtn);
    });

    item.appendChild(agreeBtn);
  }

  return item;
}

/**
 * 处理返回联系人列表
 * 
 * @description
 * 通过直接操作DOM实现页面切换，避免循环依赖
 */
function handleBackToContactList() {
  const phoneOverlay = document.querySelector('.phone-overlay');
  if (!phoneOverlay) return;

  // 隐藏新朋友页面
  const newFriendsPage = phoneOverlay.querySelector('#page-new-friends');
  if (newFriendsPage) {
    newFriendsPage.classList.remove('active');
  }

  // 显示主布局
  const mainLayout = phoneOverlay.querySelector('#main-layout');
  if (mainLayout) {
    mainLayout.classList.add('active');
  }

  logger.debug('[NewFriends] 已返回联系人列表');
}

/**
 * 处理同意好友申请
 * 
 * @description
 * 点击"同意"按钮后：
 * 1. 保存联系人到联系人列表
 * 2. 标记为已同意
 * 3. 局部更新按钮状态（变灰，显示"已同意"）
 * 4. 刷新联系人标签页（显示新添加的联系人）
 * 5. 刷新徽章数字
 * 
 * @async
 * @param {Object} character - 角色对象
 * @param {HTMLButtonElement} buttonElement - 按钮元素
 */
async function handleAgreeRequest(character, buttonElement) {
  logger.info('[NewFriends] 同意好友申请:', character.name);

  try {
    // 导入所需函数
    const { saveContact } = await import('./contact-list-data.js');
    const { addSystemMessage } = await import('../messages/message-chat-data.js');
    const { getCurrentTimestamp } = await import('../utils/time-helper.js');

    // 1. 保存到联系人列表
    const success = await saveContact(character);

    if (!success) {
      logger.error('[NewFriends] 保存联系人失败');
      alert('添加失败，请重试');
      return;
    }

    // 2. 标记为已同意
    await markFriendAsAgreed(character.id);

    // 3. ✅ 添加系统消息："{{user}}添加了你为好友"
    const currentTime = getCurrentTimestamp();
    await addSystemMessage(character.id, {
      type: 'friend_added',
      content: '{{user}}添加了你为好友',
      time: currentTime
    });
    logger.info('[NewFriends] 已插入同意好友系统消息');

    // 4. 局部更新按钮状态（最小化影响范围）
    buttonElement.className = 'newfriend-item-btn-agreed';
    buttonElement.textContent = '已同意';
    buttonElement.disabled = true;

    // 5. 刷新联系人标签页（显示新添加的联系人）
    await refreshContactListInBackground();

    // 6. 显示成功通知
    showSuccessToast(`已添加 ${character.name} 为联系人`);

    logger.info('[NewFriends] 好友申请已同意:', character.name);
  } catch (error) {
    logger.error('[NewFriends] 处理同意申请失败:', error);
    alert('操作失败，请查看控制台');
  }
}

/**
 * 在后台刷新联系人列表
 * 
 * @description
 * 同意好友后，刷新联系人标签页的内容
 * 不影响当前显示的新朋友页面
 * 
 * @async
 */
async function refreshContactListInBackground() {
  logger.debug('[NewFriends] 在后台刷新联系人列表');

  try {
    // 获取手机容器
    const phoneOverlay = document.querySelector('.phone-overlay');
    if (!phoneOverlay) {
      logger.warn('[NewFriends] 找不到手机容器');
      return;
    }

    // 获取联系人标签页容器
    const tabContainer = phoneOverlay.querySelector('#tab-contacts');
    if (!tabContainer) {
      logger.warn('[NewFriends] 找不到联系人标签页');
      return;
    }

    // 重新渲染联系人列表
    const contactListContent = await renderContactList();

    // 清空容器并插入新内容
    tabContainer.innerHTML = '';
    if (contactListContent.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      tabContainer.appendChild(contactListContent);
    } else {
      while (contactListContent.firstChild) {
        tabContainer.appendChild(contactListContent.firstChild);
      }
    }

    logger.info('[NewFriends] 联系人列表已在后台刷新');
  } catch (error) {
    logger.error('[NewFriends] 刷新联系人列表失败:', error);
  }
}

/**
 * 绑定新朋友页面事件
 * 
 * @description
 * 监听AI生成完成事件，自动刷新页面内容
 * 
 * @private
 */
function bindNewFriendsPageEvents() {
  // 监听 AI 生成完成事件，自动刷新页面
  const handleAIGenerationComplete = async () => {
    // 等待一小段时间，确保数据已保存
    await new Promise(resolve => setTimeout(resolve, 200));

    // 刷新新朋友页面
    await refreshNewFriendsPage();
    logger.debug('[NewFriends] AI生成完成，已刷新页面');
  };

  document.addEventListener('phone-ai-generation-complete', handleAIGenerationComplete);
  logger.debug('[NewFriends] 已绑定AI生成完成事件');
}

/**
 * 刷新新朋友页面内容
 * 
 * @description
 * 重新加载申请列表，不删除整个页面，只更新列表部分
 * 用于同步后更新新朋友页面的数据
 * 
 * @async
 * @returns {Promise<void>}
 */
export async function refreshNewFriendsPage() {
  logger.debug('[NewFriends] 刷新新朋友页面内容');

  try {
    // 查找新朋友页面
    const page = document.getElementById('page-new-friends');
    if (!page) {
      logger.debug('[NewFriends] 页面不存在，无需刷新');
      return;
    }

    // 查找内容容器
    const contentContainer = page.querySelector('.newfriend-content');
    if (!contentContainer) {
      logger.warn('[NewFriends] 找不到内容容器');
      return;
    }

    // 重新创建申请列表
    const newList = await createFriendRequestList();

    // 查找旧列表
    const oldList = contentContainer.querySelector('.newfriend-list');
    if (oldList) {
      // 替换旧列表（最小化DOM操作）
      contentContainer.replaceChild(newList, oldList);
      logger.info('[NewFriends] 申请列表已刷新');
    } else {
      // 没有旧列表，直接添加
      contentContainer.appendChild(newList);
      logger.info('[NewFriends] 申请列表已添加');
    }
  } catch (error) {
    logger.error('[NewFriends] 刷新页面内容失败:', error);
  }
}

// ==================== 分组折叠/展开功能 ====================

const COLLAPSED_GROUPS_KEY = 'collapsedContactGroups';

/**
 * 加载折叠状态
 * 
 * @description
 * 从存储中读取已折叠的分组ID列表
 * 
 * @async
 * @returns {Promise<Array<string>>} 已折叠的分组ID数组
 */
async function loadCollapsedGroups() {
  try {
    const collapsed = await loadData(COLLAPSED_GROUPS_KEY);
    return Array.isArray(collapsed) ? collapsed : [];
  } catch (error) {
    logger.error('[ContactList] 加载折叠状态失败:', error);
    return [];
  }
}

/**
 * 保存折叠状态
 * 
 * @description
 * 将已折叠的分组ID列表保存到存储
 * 
 * @async
 * @param {Array<string>} collapsedGroups - 已折叠的分组ID数组
 * @returns {Promise<void>}
 */
async function saveCollapsedGroups(collapsedGroups) {
  try {
    await saveData(COLLAPSED_GROUPS_KEY, collapsedGroups);
    logger.debug('[ContactList] 折叠状态已保存');
  } catch (error) {
    logger.error('[ContactList] 保存折叠状态失败:', error);
  }
}

/**
 * 切换分组折叠/展开状态
 * 
 * @description
 * 点击分组头部时调用，切换展开/折叠状态，并持久化
 * 
 * @async
 * @param {string} groupId - 分组ID
 * @param {HTMLElement} groupElement - 分组DOM元素
 */
async function toggleGroupCollapse(groupId, groupElement) {
  logger.debug('[ContactList] 切换分组折叠状态:', groupId);

  const arrow = /** @type {HTMLElement} */ (groupElement.querySelector('.contact-group-arrow'));
  const friendList = /** @type {HTMLElement} */ (groupElement.querySelector('.contact-friend-list'));

  if (!arrow || !friendList) {
    logger.warn('[ContactList] 找不到箭头或列表元素');
    return;
  }

  // 读取当前折叠状态
  const collapsedGroups = await loadCollapsedGroups();
  const isCurrentlyCollapsed = collapsedGroups.includes(groupId);

  if (isCurrentlyCollapsed) {
    // 当前折叠 → 展开
    arrow.classList.remove('fa-caret-right');
    arrow.classList.add('fa-caret-down');
    friendList.style.display = '';

    // 从折叠列表中移除
    const newCollapsed = collapsedGroups.filter(id => id !== groupId);
    await saveCollapsedGroups(newCollapsed);

    logger.info('[ContactList] 分组已展开:', groupId);
  } else {
    // 当前展开 → 折叠
    arrow.classList.remove('fa-caret-down');
    arrow.classList.add('fa-caret-right');
    friendList.style.display = 'none';

    // 添加到折叠列表
    collapsedGroups.push(groupId);
    await saveCollapsedGroups(collapsedGroups);

    logger.info('[ContactList] 分组已折叠:', groupId);
  }
}

export { renderContactList };

