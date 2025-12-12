/**
 * 角色个人页界面
 * @module phone/contacts/contact-profile-ui
 */

import logger from '../../../logger.js';
import { loadContacts, saveContact } from './contact-list-data.js';
import { getThumbnailUrl } from '../../../../../../../script.js';
import { getSystemBackgrounds, showBackgroundPicker } from '../utils/background-picker.js';
import { showInputPopup } from '../utils/popup-helper.js';
import { syncContactDisplayName } from '../utils/contact-display-helper.js';
import { stateManager } from '../utils/state-manager.js';

/**
 * 渲染角色个人页
 * 
 * @description
 * 显示角色的详细资料页面，包括头像、名字、备注、互动标识、
 * QQ空间入口、精选照片等。顶部背景图可点击更换。
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 角色个人页内容片段
 */
export async function renderContactProfile(contactId) {
  logger.info('[ContactProfile] ========== 开始渲染角色个人页 ==========');
  logger.debug('[ContactProfile] contactId:', contactId);

  try {
    // 加载联系人数据
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('[ContactProfile] 未找到联系人:', contactId);
      return createErrorView();
    }

    const fragment = document.createDocumentFragment();

    // 创建完整页面容器
    const container = document.createElement('div');
    container.className = 'contact-profile-page';

    // 1. 顶部黑色背景区（带返回和设置按钮）
    container.appendChild(createTopBackground(contact));

    // 2. 主内容卡片
    container.appendChild(createMainCard(contact));

    fragment.appendChild(container);

    // 3. 设置个签更新事件监听器
    setupSignatureUpdateListener(contactId);

    // 4. 为会员徽章绑定点击事件
    await bindMembershipBadgeClickEvent(container, contact);

    logger.info('[ContactProfile] 角色个人页渲染完成:', contact.name);
    return fragment;
  } catch (error) {
    logger.error('[ContactProfile] 渲染角色个人页失败:', error);
    return createErrorView();
  }
}

/**
 * 创建顶部背景区
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 顶部背景容器
 */
function createTopBackground(contact) {
  const topBg = document.createElement('div');
  topBg.className = 'contact-profile-top-bg';

  // 从存储中获取背景图（如果有）
  const bgImage = contact.profileBgImage || '';
  if (bgImage) {
    // URL中可能有空格，必须加引号
    topBg.style.backgroundImage = `url("${bgImage}")`;
  }

  topBg.innerHTML = `
        <button class="contact-profile-back-btn">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <button class="contact-profile-settings-btn">
            <i class="fa-solid fa-gear"></i>
        </button>
    `;

  // 点击背景图区域（不是按钮）可以更换背景
  topBg.addEventListener('click', (e) => {
    if (!e.target.closest('button')) {
      handleChangeBackground(contact.id);
    }
  });

  // 返回按钮
  const backBtn = topBg.querySelector('.contact-profile-back-btn');
  backBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleBack();
  });

  // 设置按钮（暂时占位）
  const settingsBtn = topBg.querySelector('.contact-profile-settings-btn');
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSettings(contact.id);
  });

  return topBg;
}

/**
 * 创建主内容卡片
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 主内容卡片容器
 */
function createMainCard(contact) {
  const card = document.createElement('div');
  card.className = 'contact-profile-main-card';

  // 1. 角色基础信息
  card.appendChild(createBasicInfo(contact));

  // 2. 等级徽章区
  card.appendChild(createBadges(contact));

  // 3. 个性签名行
  card.appendChild(createSignatureRow(contact));

  // 4. 互动标识区
  card.appendChild(createInteractionBadges(contact));

  // 4. QQ空间入口
  card.appendChild(createQZoneEntry(contact));

  // 5. 精选照片区
  card.appendChild(createPhotoGallery(contact));

  // 6. 底部三个按钮
  card.appendChild(createBottomButtons(contact));

  return card;
}

/**
 * 创建角色基础信息区
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 基础信息容器
 */
function createBasicInfo(contact) {
  const infoDiv = document.createElement('div');
  infoDiv.className = 'contact-profile-basic-info';

  // 获取头像URL
  const avatarUrl = getThumbnailUrl('avatar', contact.avatar);

  // 判断显示逻辑：有备注显示备注+昵称，无备注只显示名字
  const displayName = contact.remark || contact.name;
  const showNickname = !!contact.remark; // 有备注才显示昵称行

  infoDiv.innerHTML = `
        <div class="contact-profile-avatar">
            <img src="${avatarUrl}" alt="${contact.name}">
        </div>
        <div class="contact-profile-info-text" data-contact-id="${contact.id}">
            <div class="contact-profile-name">${displayName}</div>
            ${showNickname ? `<div class="contact-profile-nickname">昵称：${contact.name}</div>` : ''}
        </div>
        <div class="contact-profile-likes">
            <i class="fa-solid fa-thumbs-up"></i>
            <span>0</span>
        </div>
    `;

  // 添加点击事件：编辑备注
  const infoText = infoDiv.querySelector('.contact-profile-info-text');
  infoText.addEventListener('click', () => {
    handleEditRemark(contact);
  });

  return infoDiv;
}

/**
 * 创建等级徽章区
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 徽章容器
 */
function createBadges(contact) {
  const badgesDiv = document.createElement('div');
  badgesDiv.className = 'contact-profile-badges';

  // 创建徽章容器
  const badgeItem = document.createElement('div');
  badgeItem.className = 'contact-profile-badge-item';
  
  // 添加会员徽章（如果有）
  if (contact.membership && contact.membership.type && contact.membership.type !== 'none') {
    // 获取徽章文本
    let badgeText = '';
    switch (contact.membership.type) {
      case 'vip':
        badgeText = 'VIP';
        break;
      case 'svip':
        badgeText = 'SVIP';
        break;
      case 'annual-svip':
        badgeText = '年SVIP';
        break;
    }
    
    if (badgeText) {
      const membershipBadge = document.createElement('span');
      membershipBadge.className = 'membership-badge';
      membershipBadge.style.marginRight = '0.5em';
      membershipBadge.textContent = badgeText;
      badgeItem.appendChild(membershipBadge);
    }
    
    // 可点击
    badgesDiv.style.opacity = '1';
    badgesDiv.style.cursor = 'pointer';
  } else {
    // 暂时不可点击
    badgesDiv.style.opacity = '0.6';
    badgesDiv.style.cursor = 'default';
  }
  
  // 添加等级星标（TODO: 后期对接等级系统）
  const levelStar = document.createElement('span');
  levelStar.textContent = '⭐';
  badgeItem.appendChild(levelStar);
  
  badgesDiv.appendChild(badgeItem);
  
  // 添加箭头
  const arrow = document.createElement('i');
  arrow.className = 'fa-solid fa-chevron-right contact-profile-badges-arrow';
  badgesDiv.appendChild(arrow);

  return badgesDiv;
}

/**
 * 创建个性签名行
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 个性签名行容器
 */
function createSignatureRow(contact) {
  const signatureDiv = document.createElement('div');
  signatureDiv.className = 'contact-profile-signature-row';
  signatureDiv.dataset.contactId = contact.id;  // 添加 data-contact-id 用于更新

  // 获取当前个签（如果有）
  const currentSignature = contact.signature?.current || '';

  signatureDiv.innerHTML = `
        <div class="contact-profile-signature-text">${currentSignature}</div>
        <i class="fa-solid fa-chevron-right"></i>
    `;

  // 点击进入个签历史页面
  signatureDiv.addEventListener('click', () => {
    handleOpenSignatureHistory(contact.id);
  });

  return signatureDiv;
}

/**
 * 处理打开个签历史页面
 * 
 * @async
 * @param {string} contactId - 角色ID
 */
async function handleOpenSignatureHistory(contactId) {
  logger.debug('[ContactProfile] 打开个签历史页:', contactId);

  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'signature-history', { targetType: 'contact', contactId });
  }
}

/**
 * 创建互动标识区
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 互动标识容器
 */
function createInteractionBadges(contact) {
  const interactionDiv = document.createElement('div');
  interactionDiv.className = 'contact-profile-interaction';

  // TODO: 后期实现"聊天多→心心多"的emoji系统
  interactionDiv.innerHTML = `
        <div class="contact-profile-interaction-header">
            <i class="fa-solid fa-gear"></i>
            <span>你们的互动标识</span>
            <i class="fa-solid fa-chevron-right"></i>
        </div>
    `;

  // 暂时不可点击
  interactionDiv.style.opacity = '0.6';
  interactionDiv.style.cursor = 'default';

  return interactionDiv;
}

/**
 * 创建QQ空间入口
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} QQ空间入口容器
 */
function createQZoneEntry(contact) {
  const qzoneDiv = document.createElement('div');
  qzoneDiv.className = 'contact-profile-qzone-entry';

  qzoneDiv.innerHTML = `
        <i class="fa-solid fa-star"></i>
        <span>TA的QQ空间</span>
        <i class="fa-solid fa-chevron-right"></i>
    `;

  // 暂时不可点击
  qzoneDiv.style.opacity = '0.6';
  qzoneDiv.style.cursor = 'default';

  // TODO: 后期实现QQ空间功能后，添加点击事件
  // qzoneDiv.addEventListener('click', () => {
  //     handleOpenQZone(contact.id);
  // });

  return qzoneDiv;
}

/**
 * 创建精选照片区
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 精选照片容器
 */
function createPhotoGallery(contact) {
  const galleryDiv = document.createElement('div');
  galleryDiv.className = 'contact-profile-photo-gallery';

  galleryDiv.innerHTML = `
        <div class="contact-profile-photo-header">
            <i class="fa-solid fa-image"></i>
            <span>精选照片</span>
            <i class="fa-solid fa-chevron-right"></i>
        </div>
        <div class="contact-profile-photo-placeholder">
            暂无照片
        </div>
    `;

  // TODO: 后期添加照片上传/管理功能
  return galleryDiv;
}

/**
 * 创建底部三个按钮
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 底部按钮容器
 */
function createBottomButtons(contact) {
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'contact-profile-bottom-buttons';

  buttonsDiv.innerHTML = `
        <button class="contact-profile-btn contact-profile-btn-disabled">
            音视频通话
        </button>
        <button class="contact-profile-btn contact-profile-btn-disabled">
            送礼物
        </button>
        <button class="contact-profile-btn contact-profile-btn-primary">
            发消息
        </button>
    `;

  // 绑定按钮事件
  const buttons = buttonsDiv.querySelectorAll('button');
  const messageBtn = buttons[2]; // 第3个按钮是"发消息"

  logger.debug('[ContactProfile] 创建底部按钮，contactId:', contact.id);
  logger.debug('[ContactProfile] 发消息按钮元素:', messageBtn);

  // "发消息"按钮：跳转到聊天页面
  messageBtn.addEventListener('click', (e) => {
    logger.info('[ContactProfile] ========== 点击发消息按钮 ==========');
    logger.info('[ContactProfile] contactId:', contact.id);
    logger.debug('[ContactProfile] 按钮元素:', messageBtn);
    logger.debug('[ContactProfile] 事件对象:', e);

    const profilePage = document.querySelector('#page-contact-profile');
    const profileClasses = Array.from(profilePage?.classList || []);
    const profilePointerEvents = profilePage ? window.getComputedStyle(profilePage).pointerEvents : 'unknown';

    logger.debug('[ContactProfile] 个人页DOM状态:', {
      exists: !!profilePage,
      classList: profileClasses,
      pointerEvents: profilePointerEvents,
      hasDimmed: profileClasses.includes('phone-page-dimmed'),
      hasActive: profileClasses.includes('active')
    });

    // 检查所有active页面（诊断用）
    const allActivePages = Array.from(document.querySelectorAll('.phone-page.active'));
    logger.warn('[ContactProfile] ⚠️ 当前所有active页面:', {
      count: allActivePages.length,
      pageIds: allActivePages.map(p => p.id)
    });

    if (allActivePages.length > 1) {
      logger.error('[ContactProfile] ❌ 发现多个active页面！按钮可能被遮挡！');
    }

    logger.info('[ContactProfile] 准备调用 handleSendMessage');
    handleSendMessage(contact.id);
  });

  logger.debug('[ContactProfile] 发消息按钮事件监听器已绑定');

  // 其他按钮：暂时占位
  buttons[0].addEventListener('click', (e) => {
    e.preventDefault();
    logger.debug('[ContactProfile] 音视频通话功能待实现');
  });

  buttons[1].addEventListener('click', (e) => {
    e.preventDefault();
    logger.debug('[ContactProfile] 送礼物功能待实现');
  });

  return buttonsDiv;
}

/**
 * 处理更换背景图
 * 
 * @description
 * 弹出背景选择器，让用户从系统背景中选择
 * 
 * @async
 * @param {string} contactId - 联系人ID
 */
async function handleChangeBackground(contactId) {
  logger.debug('[ContactProfile] 点击更换背景图:', contactId);

  try {
    // 获取系统背景列表
    const backgrounds = await getSystemBackgrounds();

    if (!backgrounds || backgrounds.length === 0) {
      logger.warn('[ContactProfile] 未获取到系统背景列表');
      return;
    }

    // 显示背景选择器弹窗
    const selectedBg = await showBackgroundPicker(backgrounds);

    if (selectedBg) {
      // 应用背景图
      await applyBackgroundImage(contactId, selectedBg);
    }
  } catch (error) {
    logger.error('[ContactProfile] 更换背景失败:', error);
  }
}

/**
 * 处理返回
 */
function handleBack() {
  logger.debug('[ContactProfile] 点击返回');

  // 获取手机遮罩层元素
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    // 动态导入hidePage函数
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'contact-profile');
    });
  }
}

/**
 * 处理设置按钮
 * 
 * @param {string} contactId - 联系人ID
 */
/**
 * 处理打开设置页面
 * 
 * @description
 * 直接调用 showPage 显示联系人设置页（不用自定义事件，避免重复触发）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 */
async function handleSettings(contactId) {
  logger.debug('[ContactProfile] 打开设置页:', contactId);

  // 直接调用 showPage（不用自定义事件）
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'contact-settings', { contactId });
  }
}

/**
 * 处理发消息（跳转到聊天页面）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 */
async function handleSendMessage(contactId) {
  logger.info('[ContactProfile] 发消息，跳转到聊天页面:', contactId);

  // 获取 overlay 元素
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'chat', { contactId });
  }
}

/**
 * 处理编辑备注
 * 
 * @description
 * 弹出输入框让用户输入备注，保存后局部更新DOM（不刷新整个页面）
 * 
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleEditRemark(contact) {
  logger.debug('[ContactProfile] 点击编辑备注:', contact.name);

  try {
    // 弹出输入框（使用自定义弹窗）
    const currentRemark = contact.remark || '';
    const newRemark = await showInputPopup(
      '设置备注名',
      currentRemark,
      {
        placeholder: '留空则使用角色原名',
        okButton: '保存',
        cancelButton: '取消'
      }
    );

    // 用户取消
    if (newRemark === null) {
      logger.debug('[ContactProfile] 用户取消编辑备注');
      return;
    }

    // 去除首尾空格
    const trimmedRemark = newRemark.trim();

    // 更新联系人对象
    contact.remark = trimmedRemark || undefined; // 空备注保存为 undefined

    // 保存到存储
    const success = await saveContact(contact);
    if (success) {
      logger.info('[ContactProfile] 备注已保存:', trimmedRemark || '(清空备注)');

      // 获取显示名称
      const displayName = contact.remark || contact.name;

      // 同步更新所有位置的名称显示（使用统一工具函数）
      syncContactDisplayName(contact.id, displayName, contact.name);
    } else {
      logger.error('[ContactProfile] 备注保存失败');
    }
  } catch (error) {
    logger.error('[ContactProfile] 编辑备注失败:', error);
  }
}

/**
 * 局部更新个人页的名称显示
 * 
 * @description
 * 只更新当前页面的角色名/备注显示，不重新渲染整个页面
 * 
 * @param {Object} contact - 联系人对象
 */
function updateProfileNameDisplay(contact) {
  logger.debug('[ContactProfile] 局部更新名称显示:', contact.name);

  const infoText = document.querySelector('.contact-profile-info-text');
  if (!infoText) return;

  const displayName = contact.remark || contact.name;
  const showNickname = !!contact.remark;

  // 更新大字（名字/备注）
  const nameElement = infoText.querySelector('.contact-profile-name');
  if (nameElement) {
    nameElement.textContent = displayName;
  }

  // 更新或删除昵称行
  const nicknameElement = infoText.querySelector('.contact-profile-nickname');
  if (showNickname) {
    // 需要显示昵称
    if (nicknameElement) {
      // 昵称行已存在，更新内容
      nicknameElement.textContent = `昵称：${contact.name}`;
    } else {
      // 昵称行不存在，创建并插入
      const newNickname = document.createElement('div');
      newNickname.className = 'contact-profile-nickname';
      newNickname.textContent = `昵称：${contact.name}`;
      infoText.appendChild(newNickname);
    }
  } else {
    // 不需要显示昵称，删除昵称行（如果存在）
    if (nicknameElement) {
      nicknameElement.remove();
    }
  }
}

/**
 * 同步更新联系人列表中的名称
 * 
 * @description
 * 通过 data-contact-id 找到对应的联系人项，只更新其显示名称
 * 
 * @param {Object} contact - 联系人对象
 */
function updateContactListItemName(contact) {
  logger.debug('[ContactProfile] 同步更新联系人列表:', contact.name);

  // 通过 data-contact-id 查找对应的联系人项
  const contactItem = document.querySelector(`.contact-friend-item[data-contact-id="${contact.id}"]`);

  if (contactItem) {
    // 找到对应的联系人项，更新名称
    const nameElement = contactItem.querySelector('.contact-friend-name');
    if (nameElement) {
      const displayName = contact.remark || contact.name;
      nameElement.textContent = displayName;
      logger.debug('[ContactProfile] 已更新联系人列表项名称:', displayName);
    }
  } else {
    logger.debug('[ContactProfile] 联系人列表中未找到该项（可能未渲染）');
  }
}


/**
 * 应用背景图
 * 
 * @description
 * 保存背景图到联系人数据，并局部更新页面显示
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} bgUrl - 背景图URL（空字符串表示恢复默认）
 */
async function applyBackgroundImage(contactId, bgUrl) {
  logger.debug('[ContactProfile] 应用背景图:', bgUrl || '(默认白色)');

  try {
    // 加载联系人数据
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('[ContactProfile] 未找到联系人:', contactId);
      return;
    }

    // 更新背景图字段
    contact.profileBgImage = bgUrl || undefined;

    // 保存到存储
    const success = await saveContact(contact);
    if (success) {
      logger.info('[ContactProfile] 背景图已保存');

      // 局部更新背景图显示
      const topBg = document.querySelector('.contact-profile-top-bg');
      if (topBg) {
        if (bgUrl) {
          // URL中可能有空格，必须加引号
          topBg.style.backgroundImage = `url("${bgUrl}")`;
        } else {
          topBg.style.backgroundImage = '';
          topBg.style.background = '#ffffff';
        }
      }
    } else {
      logger.error('[ContactProfile] 背景图保存失败');
    }
  } catch (error) {
    logger.error('[ContactProfile] 应用背景图失败:', error);
  }
}

/**
 * 创建错误提示视图
 * 
 * @returns {DocumentFragment} 错误提示片段
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const errorDiv = document.createElement('div');
  errorDiv.textContent = '加载角色资料失败';
  errorDiv.style.cssText = 'padding: 20px; text-align: center; color: #999;';
  fragment.appendChild(errorDiv);
  return fragment;
}

/**
 * 设置个签更新事件监听器
 * 
 * @description
 * 订阅 signature 状态变化，当角色改签时自动更新显示
 * 
 * @param {string} contactId - 联系人ID
 */
function setupSignatureUpdateListener(contactId) {
  const pageId = `contact-profile-${contactId}`;

  // 订阅个签数据变化
  stateManager.subscribe(pageId, 'signature', async (meta) => {
    // 检查是否匹配当前页面
    if (meta.targetType !== 'contact' || meta.contactId !== contactId) {
      return;
    }

    logger.debug('[ContactProfile] 检测到个签更新，刷新显示');

    // 查找个签行元素
    const signatureRow = document.querySelector(`.contact-profile-signature-row[data-contact-id="${contactId}"]`);
    if (!signatureRow) {
      logger.warn('[ContactProfile] 未找到个签行元素');
      return;
    }

    // 检查元素是否还在DOM中
    if (!document.contains(signatureRow)) {
      logger.debug('[ContactProfile] 页面已关闭，跳过刷新');
      return;
    }

    // 更新显示
    const signatureText = signatureRow.querySelector('.contact-profile-signature-text');
    if (signatureText) {
      // 获取最新个签数据
      const data = await stateManager.get('signature');
      const signature = data?.signature || '';
      signatureText.textContent = signature;
      logger.info('[ContactProfile] 个签显示已更新');
    }
  });

  // 监听页面移除，自动清理订阅
  const profilePage = document.querySelector('#page-contact-profile');
  if (profilePage) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node === profilePage || node.contains?.(profilePage)) {
            stateManager.unsubscribeAll(pageId);
            observer.disconnect();
            logger.debug('[ContactProfile] 页面已关闭，已清理订阅');
            return;
          }
        }
      }
    });

    // 监听父容器的子节点变化
    const parent = profilePage.parentElement;
    if (parent) {
      observer.observe(parent, { childList: true, subtree: true });
    }
  }

  logger.debug('[ContactProfile] 已订阅个签数据变化');
}

/**
 * 为会员徽章绑定点击事件
 * 
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {Object} contact - 联系人对象
 */
async function bindMembershipBadgeClickEvent(container, contact) {
  // 只有角色有会员时才绑定
  if (!contact.membership || !contact.membership.type || contact.membership.type === 'none') {
    return;
  }

  // 查找徽章元素
  const badgeElement = container.querySelector('.membership-badge');
  if (!badgeElement) {
    logger.warn('[ContactProfile] 未找到会员徽章元素');
    return;
  }

  try {
    const { bindMembershipBadgeClick } = await import('../utils/membership-badge-helper.js');
    await bindMembershipBadgeClick(badgeElement, contact.id, contact.name);
    logger.debug('[ContactProfile] 已绑定会员徽章点击事件:', contact.name);
  } catch (error) {
    logger.error('[ContactProfile] 绑定会员徽章点击事件失败:', error);
  }
}

