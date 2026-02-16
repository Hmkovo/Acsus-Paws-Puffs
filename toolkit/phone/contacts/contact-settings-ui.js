/**
 * 联系人设置页面
 * @module phone/contacts/contact-settings-ui
 */

import logger from '../../../logger.js';
import { loadContacts, saveContact, loadContactGroups, deleteContact, addAIAwareDeletedRequest } from './contact-list-data.js';
import { showInputPopup, showConfirmPopup, showCustomPopup } from '../utils/popup-helper.js';
import { syncContactDisplayName } from '../utils/contact-display-helper.js';
import { clearChatHistory, addSystemMessage } from '../messages/message-chat-data.js';
import { showSuccessToast } from '../ui-components/toast-notification.js';
import { getCurrentTimestamp } from '../utils/time-helper.js';

/**
 * 渲染联系人设置页
 * 
 * @description
 * 显示联系人的详细设置选项，包括备注、分组、权限设置、
 * 亲密关系、线索笔记等。支持删除好友功能。
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 设置页内容片段
 */
export async function renderContactSettings(contactId) {
  logger.debug('phone','[ContactSettings] 渲染联系人设置页:', contactId);

  try {
    // 加载联系人数据
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('phone','[ContactSettings] 未找到联系人:', contactId);
      return createErrorView();
    }

    const fragment = document.createDocumentFragment();

    // 创建完整页面容器
    const container = document.createElement('div');
    container.className = 'contact-settings-page';

    // 1. 顶部栏
    container.appendChild(createTopBar(contact));

    // 2. 设置列表
    container.appendChild(await createSettingsList(contact));

    fragment.appendChild(container);

    logger.info('phone','[ContactSettings] 设置页渲染完成:', contact.name);
    return fragment;
  } catch (error) {
    logger.error('phone','[ContactSettings] 渲染设置页失败:', error);
    return createErrorView();
  }
}

/**
 * 创建顶部栏
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 顶部栏容器
 */
function createTopBar(contact) {
  const topBar = document.createElement('div');
  topBar.className = 'contact-settings-topbar';

  topBar.innerHTML = `
        <button class="contact-settings-back-btn">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="contact-settings-title">设置</div>
    `;

  // 返回按钮
  const backBtn = topBar.querySelector('.contact-settings-back-btn');
  backBtn.addEventListener('click', () => {
    handleBack();
  });

  return topBar;
}

/**
 * 创建设置列表
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @returns {Promise<HTMLElement>} 设置列表容器
 */
async function createSettingsList(contact) {
  const list = document.createElement('div');
  list.className = 'contact-settings-list';

  // 第一组：基础设置
  const group1 = document.createElement('div');
  group1.className = 'contact-settings-group';

  // 备注
  group1.appendChild(createRemarkItem(contact));

  // 分组
  group1.appendChild(await createGroupItem(contact));

  list.appendChild(group1);

  // 第二组：推荐
  const group2 = document.createElement('div');
  group2.className = 'contact-settings-group';

  group2.appendChild(createPlaceholderItem('推荐该联系人', false));

  list.appendChild(group2);

  // 第三组：关系与隐私
  const group3 = document.createElement('div');
  group3.className = 'contact-settings-group';

  group3.appendChild(createPlaceholderItem('权限设置', true));
  group3.appendChild(createPlaceholderItem('特别关心', true, '未开启'));
  group3.appendChild(createPlaceholderItem('亲密关系', true));
  group3.appendChild(createPlaceholderItem('关于他的线索', true));

  list.appendChild(group3);

  // 删除按钮
  list.appendChild(createDeleteButton(contact));

  return list;
}

/**
 * 创建备注设置项
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 备注设置项
 */
function createRemarkItem(contact) {
  const item = document.createElement('div');
  item.className = 'contact-settings-item';
  item.dataset.contactId = contact.id;

  const displayRemark = contact.remark || contact.name;

  item.innerHTML = `
        <div class="contact-settings-item-label">备注</div>
        <div class="contact-settings-item-value">
            <span class="contact-settings-remark-text">${displayRemark}</span>
            <i class="fa-solid fa-chevron-right"></i>
        </div>
    `;

  // 点击编辑备注
  item.addEventListener('click', () => {
    handleEditRemark(contact);
  });

  return item;
}

/**
 * 创建分组设置项
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @returns {Promise<HTMLElement>} 分组设置项
 */
async function createGroupItem(contact) {
  const item = document.createElement('div');
  item.className = 'contact-settings-item';
  item.dataset.contactId = contact.id;

  // 获取当前分组名称
  const groups = await loadContactGroups();
  const currentGroup = groups.find(g => g.id === contact.groupId);
  const groupName = currentGroup ? currentGroup.name : '酒馆角色';

  item.innerHTML = `
        <div class="contact-settings-item-label">分组</div>
        <div class="contact-settings-item-value">
            <span class="contact-settings-group-text">${groupName}</span>
            <i class="fa-solid fa-chevron-right"></i>
        </div>
    `;

  // 点击选择分组
  item.addEventListener('click', () => {
    handleSelectGroup(contact);
  });

  return item;
}

/**
 * 创建占位设置项（暂未实现功能）
 * 
 * @param {string} label - 标签文字
 * @param {boolean} hasArrow - 是否显示右箭头
 * @param {string} [valueText] - 右侧值文字（可选）
 * @returns {HTMLElement} 占位设置项
 */
function createPlaceholderItem(label, hasArrow = true, valueText = '') {
  const item = document.createElement('div');
  item.className = 'contact-settings-item contact-settings-item-disabled';

  const valueHTML = valueText
    ? `<span class="contact-settings-item-value-text">${valueText}</span>`
    : '';

  const arrowHTML = hasArrow
    ? '<i class="fa-solid fa-chevron-right"></i>'
    : '';

  item.innerHTML = `
        <div class="contact-settings-item-label">${label}</div>
        <div class="contact-settings-item-value">
            ${valueHTML}
            ${arrowHTML}
        </div>
    `;

  return item;
}

/**
 * 创建删除好友按钮
 * 
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 删除按钮容器
 */
function createDeleteButton(contact) {
  const container = document.createElement('div');
  container.className = 'contact-settings-delete-container';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'contact-settings-delete-btn';
  deleteBtn.textContent = '删除好友';

  deleteBtn.addEventListener('click', () => {
    handleDeleteContact(contact);
  });

  container.appendChild(deleteBtn);
  return container;
}

/**
 * 处理编辑备注
 * 
 * @description
 * 弹出输入框让用户编辑备注，保存后同步更新所有相关显示
 * 
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleEditRemark(contact) {
  logger.debug('phone','[ContactSettings] 编辑备注:', contact.name);

  try {
    const currentRemark = contact.remark || '';

    // 使用自定义弹窗弹出输入框
    const newRemark = await showInputPopup(
      '设置备注',
      currentRemark,
      {
        placeholder: '留空则使用角色原名',
        okButton: '保存',
        cancelButton: '取消'
      }
    );

    // 用户取消或没有修改
    if (newRemark === null || newRemark === currentRemark) {
      return;
    }

    // 去除首尾空格
    const trimmedRemark = newRemark.trim();

    // 更新联系人对象
    contact.remark = trimmedRemark || undefined;

    // 保存到存储
    const success = await saveContact(contact);
    if (success) {
      logger.info('phone','[ContactSettings] 备注已保存:', trimmedRemark || '(清空备注)');

      // 获取显示名称
      const displayName = contact.remark || contact.name;

      // 同步更新所有位置的名称显示（使用统一工具函数）
      syncContactDisplayName(contact.id, displayName, contact.name);
    } else {
      logger.error('phone','[ContactSettings] 备注保存失败');
    }
  } catch (error) {
    logger.error('phone','[ContactSettings] 编辑备注失败:', error);
  }
}

/**
 * 处理选择分组
 * 
 * @description
 * 弹出分组选择器，让用户选择新分组
 * 
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleSelectGroup(contact) {
  logger.debug('phone','[ContactSettings] 选择分组:', contact.name);

  try {
    // 获取所有分组
    const groups = await loadContactGroups();

    if (groups.length === 0) {
      logger.warn('phone','[ContactSettings] 没有可用分组');
      return;
    }

    // 构建分组选项列表（使用按钮，点击直接选中）
    const groupButtons = groups.map(group => {
      const isSelected = group.id === contact.groupId;
      const checkIcon = isSelected ? '<i class="fa-solid fa-check"></i>' : '';
      return `
        <div class="group-selector-item ${isSelected ? 'selected' : ''}" data-group-id="${group.id}">
          <span>${group.name}</span>
          ${checkIcon}
        </div>
      `;
    }).join('');

    const selectorHTML = `
      <div class="group-selector-list">
        ${groupButtons}
      </div>
    `;

    // 使用自定义弹窗显示选择器
    const popupPromise = showCustomPopup(
      '选择分组',
      selectorHTML,
      {
        buttons: [{ text: '取消', value: null, class: 'cancel' }],
        showClose: true
      }
    );

    // 在弹窗显示后，绑定点击事件
    await new Promise(resolve => setTimeout(resolve, 100)); // 等待弹窗渲染

    const groupItems = document.querySelectorAll('.group-selector-item');
    groupItems.forEach(item => {
      item.addEventListener('click', async () => {
        const newGroupId = /** @type {HTMLElement} */ (item).dataset.groupId;

        // 如果分组没变，直接返回
        if (newGroupId === contact.groupId) {
          logger.debug('phone','[ContactSettings] 分组未变化');
          // 关闭自定义弹窗（通过移除遮罩层）
          document.querySelector('.phone-popup-overlay')?.remove();
          return;
        }

        // 更新联系人的分组
        contact.groupId = newGroupId;

        // 保存到存储
        const success = await saveContact(contact);
        if (success) {
          logger.info('phone','[ContactSettings] 分组已更新:', newGroupId);

          // 局部更新当前设置页的显示
          await updateSettingsGroupDisplay(contact);

          // 后台刷新联系人列表（触发重新渲染）
          refreshContactListInBackground();

          // 关闭自定义弹窗
          document.querySelector('.phone-popup-overlay')?.remove();
        } else {
          logger.error('phone','[ContactSettings] 分组保存失败');
        }
      });
    });

    await popupPromise;
  } catch (error) {
    logger.error('phone','[ContactSettings] 选择分组失败:', error);
  }
}

/**
 * 处理删除好友
 * 
 * @description
 * 显示删除模式选择、是否删除聊天记录的确认弹窗。
 * 支持"AI可知"和"AI不知"两种删除模式。
 * 删除后显示成功通知，停留1秒后返回联系人列表。
 * 
 * @async
 * @param {Object} contact - 联系人对象
 */
async function handleDeleteContact(contact) {
  logger.debug('phone','[ContactSettings] 删除好友:', contact.name);

  try {
    // 第一次确认：是否删除好友
    const confirmDelete = await showConfirmPopup(
      '删除好友',
      `确定要删除好友"${contact.remark || contact.name}"吗？\n\n删除后可通过"同步酒馆角色"重新添加。`,
      {
        danger: true,
        okButton: '下一步',
        cancelButton: '取消'
      }
    );

    if (!confirmDelete) {
      return;
    }

    // 第二次：选择删除模式（AI可知 / AI不知）
    const deleteMode = await showDeleteModePopup(contact);

    if (deleteMode === null) {
      // 用户取消
      return;
    }

    // 第三次确认：是否删除聊天记录
    const deleteMessages = await showConfirmPopup(
      '删除聊天记录',
      '是否同时删除与该好友的所有聊天记录？',
      {
        danger: true,
        okButton: '删除记录',
        cancelButton: '保留记录'
      }
    );

    logger.info('phone','[ContactSettings] 删除好友确认:', {
      contactId: contact.id,
      deleteMode: deleteMode,
      deleteMessages: deleteMessages
    });

    // 1. 如果是"AI可知"模式，添加到AI感知删除列表并插入系统消息
    if (deleteMode === 'ai_aware') {
      const currentTime = getCurrentTimestamp();
      await addAIAwareDeletedRequest(contact, currentTime);
      logger.info('phone','[ContactSettings] 已添加到AI感知删除列表:', contact.name);

      // ✅ 插入系统消息："{{user}}于xxxx时间删除了你的好友"
      if (!deleteMessages) {
        await addSystemMessage(contact.id, {
          type: 'friend_deleted',
          content: `{{user}}删除了你为好友`,
          time: currentTime
        });
        logger.info('phone','[ContactSettings] 已插入好友删除系统消息');
      }
    }

    // 2. 从 contacts 列表中移除
    const deleteSuccess = await deleteContact(contact.id);

    if (!deleteSuccess) {
      logger.error('phone','[ContactSettings] 删除联系人失败');
      return;
    }

    // 3. 如果选择删除聊天记录
    if (deleteMessages) {
      await clearChatHistory(contact.id);
      logger.info('phone','[ContactSettings] 已删除聊天记录:', contact.id);
    } else {
      logger.info('phone','[ContactSettings] 已保留聊天记录:', contact.id);
    }

    // 4. 显示成功通知
    const displayName = contact.remark || contact.name;
    const modeText = deleteMode === 'ai_aware' ? '（AI可知）' : '';
    showSuccessToast(`已删除好友"${displayName}" ${modeText}`);

    // 5. 刷新联系人列表（后台）
    refreshContactListInBackground();

    // 6. 停留1秒后返回联系人列表
    setTimeout(() => {
      handleBackToContactList();
    }, 1000);

  } catch (error) {
    logger.error('phone','[ContactSettings] 删除好友失败:', error);
  }
}

/**
 * 显示删除模式选择弹窗
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @returns {Promise<string|null>} 删除模式（'ai_aware' | 'silent' | null=取消）
 */
async function showDeleteModePopup(contact) {
  logger.debug('phone','[ContactSettings] 显示删除模式选择:', contact.name);

  const displayName = contact.remark || contact.name;

  const content = `
    <div class="delete-mode-popup">
      <p class="delete-mode-hint">选择删除"${displayName}"的方式：</p>
      <div class="delete-mode-buttons">
        <button class="delete-mode-btn" data-mode="ai_aware">
          <i class="fa-solid fa-robot"></i>
          <span>AI可知</span>
          <small>AI会知道被删除，可能重新申请加好友</small>
        </button>
        <button class="delete-mode-btn" data-mode="silent">
          <i class="fa-solid fa-user-slash"></i>
          <span>AI不知</span>
          <small>静默删除，不触发任何AI行为</small>
        </button>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    showCustomPopup('删除模式', content, {
      buttons: [
        { text: '取消', value: null }
      ],
      onButtonClick: (value) => {
        // 如果点击了取消按钮
        resolve(value);
      }
    });

    // 绑定模式按钮事件
    setTimeout(() => {
      const modeButtons = document.querySelectorAll('.delete-mode-btn');
      modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          logger.info('phone','[ContactSettings] 选择删除模式:', mode);

          // 关闭弹窗
          const overlay = document.querySelector('.phone-popup-overlay');
          if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
          }

          resolve(mode);
        });
      });
    }, 100);
  });
}

/**
 * 局部更新设置页的备注显示
 * 
 * @param {Object} contact - 联系人对象
 */
function updateSettingsRemarkDisplay(contact) {
  logger.debug('phone','[ContactSettings] 局部更新备注显示:', contact.name);

  const remarkText = document.querySelector('.contact-settings-remark-text');
  if (remarkText) {
    const displayRemark = contact.remark || contact.name;
    remarkText.textContent = displayRemark;
  }
}

/**
 * 局部更新设置页的分组显示
 * 
 * @async
 * @param {Object} contact - 联系人对象
 */
async function updateSettingsGroupDisplay(contact) {
  logger.debug('phone','[ContactSettings] 局部更新分组显示:', contact.name);

  const groups = await loadContactGroups();
  const currentGroup = groups.find(g => g.id === contact.groupId);
  const groupName = currentGroup ? currentGroup.name : '酒馆角色';

  const groupText = document.querySelector('.contact-settings-group-text');
  if (groupText) {
    groupText.textContent = groupName;
  }
}

/**
 * 同步更新角色个人页的名称显示
 * 
 * @param {Object} contact - 联系人对象
 */
function updateProfileNameDisplay(contact) {
  logger.debug('phone','[ContactSettings] 同步更新角色个人页:', contact.name);

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
    if (nicknameElement) {
      nicknameElement.textContent = `昵称：${contact.name}`;
    } else {
      const newNickname = document.createElement('div');
      newNickname.className = 'contact-profile-nickname';
      newNickname.textContent = `昵称：${contact.name}`;
      infoText.appendChild(newNickname);
    }
  } else {
    if (nicknameElement) {
      nicknameElement.remove();
    }
  }
}

/**
 * 同步更新联系人列表中的名称
 * 
 * @param {Object} contact - 联系人对象
 */
function updateContactListItemName(contact) {
  logger.debug('phone','[ContactSettings] 同步更新联系人列表:', contact.name);

  const contactItem = document.querySelector(`.contact-friend-item[data-contact-id="${contact.id}"]`);

  if (contactItem) {
    const nameElement = contactItem.querySelector('.contact-friend-name');
    if (nameElement) {
      const displayName = contact.remark || contact.name;
      nameElement.textContent = displayName;
      logger.debug('phone','[ContactSettings] 已更新联系人列表项名称:', displayName);
    }
  } else {
    logger.debug('phone','[ContactSettings] 联系人列表中未找到该项（可能未渲染）');
  }
}

/**
 * 后台刷新联系人列表
 * 
 * @description
 * 触发联系人标签页重新渲染，但不切换当前页面
 * 
 * 注意：事件在 overlayElement 上触发，避免事件监听器累积
 */
function refreshContactListInBackground() {
  logger.debug('phone','[ContactSettings] 后台刷新联系人列表');

  // 触发自定义事件，通知联系人列表刷新（在overlayElement上触发）
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const event = new CustomEvent('phone:refresh-contact-list');
    overlayElement.dispatchEvent(event);
  }
}

/**
 * 处理返回操作
 * 
 * @description
 * 返回到角色个人页
 */
function handleBack() {
  logger.debug('phone','[ContactSettings] 返回上一页');

  // 获取手机遮罩层元素
  const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlayElement) {
    // 动态导入 hidePage 函数
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'contact-settings');
    });
  }
}

/**
 * 返回到联系人列表
 * 
 * @description
 * 删除好友后连续关闭两个页面：设置页 → 角色个人页，最终回到联系人列表
 */
function handleBackToContactList() {
  logger.debug('phone','[ContactSettings] 返回到联系人列表');

  // 获取手机遮罩层元素
  const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlayElement) {
    // 动态导入 hidePage 函数
    import('../phone-main-ui.js').then(({ hidePage }) => {
      // 连续隐藏两个页面：设置页 → 角色个人页
      hidePage(overlayElement, 'contact-settings');
      setTimeout(() => {
        hidePage(overlayElement, 'contact-profile');
      }, 100);
    });
  }
}

/**
 * 创建错误视图
 * 
 * @returns {DocumentFragment} 错误提示片段
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'contact-settings-error';
  error.textContent = '加载失败，请重试';
  fragment.appendChild(error);
  return fragment;
}

