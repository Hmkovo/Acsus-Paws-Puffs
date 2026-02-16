/**
 * 联系人分组管理页面
 * 
 * @module phone/contacts/contact-group-manage-ui
 * 
 * @description
 * 管理联系人分组的创建、编辑、删除和排序
 * 
 * 功能：
 * - 显示所有分组列表
 * - 添加新分组
 * - 编辑分组名称
 * - 删除分组（非默认分组）
 * - 拖动排序分组
 */

import logger from '../../../logger.js';
import {
  loadContactGroups,
  saveContactGroup,
  deleteContactGroup,
  updateGroupsOrder
} from './contact-list-data.js';
import { showInputPopup, showConfirmPopup } from '../utils/popup-helper.js';
import { showSuccessToast, showWarningToast } from '../ui-components/toast-notification.js';

/**
 * 渲染分组管理页面
 * 
 * @description
 * 创建一个独立的分组管理页面，包含顶部栏、添加按钮、分组列表
 * 
 * @returns {Promise<HTMLElement>} 分组管理页面元素（.phone-page）
 */
export async function renderGroupManagePage() {
  logger.debug('phone','[GroupManage] 开始渲染分组管理页面');

  const page = document.createElement('div');
  page.id = 'page-group-manage';
  page.className = 'phone-page';

  // 加载分组数据
  const groups = await loadContactGroups();

  page.innerHTML = `
        <!-- 顶部栏 -->
        <div class="group-manage-header">
            <button class="group-manage-back-btn" id="group-manage-back">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="group-manage-header-title">分组管理</div>
        </div>

        <!-- 内容区 -->
        <div class="group-manage-content">
            <!-- 添加分组按钮 -->
            <div class="group-manage-add-btn" id="group-manage-add-btn">
                <div class="group-manage-add-icon">+</div>
                <span class="group-manage-add-text">添加分组</span>
            </div>

            <!-- 分组列表 -->
            <div class="group-manage-list" id="group-manage-list">
                ${await renderGroupList(groups)}
            </div>
        </div>
    `;

  // 绑定事件
  bindGroupManageEvents(page);

  logger.info('phone','[GroupManage] 分组管理页面渲染完成，共', groups.length, '个分组');

  return page;
}

/**
 * 渲染分组列表
 * 
 * @param {Array} groups - 分组数据数组
 * @returns {Promise<string>} 分组列表HTML
 */
async function renderGroupList(groups) {
  logger.debug('phone','[GroupManage] 渲染分组列表，共', groups.length, '个分组');

  // 按 order 排序
  const sortedGroups = groups.sort((a, b) => a.order - b.order);

  return sortedGroups.map(group => `
        <div class="group-manage-item" data-group-id="${group.id}" data-group-name="${group.name}" data-is-default="${group.isDefault}" draggable="true">
            <button class="group-manage-item-delete" ${group.isDefault ? 'disabled' : ''}>
                <i class="fa-solid fa-circle-minus"></i>
            </button>
            <div class="group-manage-item-name">${group.name || '(无名称)'}</div>
            <div class="group-manage-item-drag">
                <i class="fa-solid fa-grip-lines"></i>
            </div>
        </div>
    `).join('');
}

/**
 * 绑定分组管理页面的所有事件
 * 
 * @param {HTMLElement} pageElement - 分组管理页面元素
 */
function bindGroupManageEvents(pageElement) {
  logger.debug('phone','[GroupManage] 绑定分组管理事件');

  // 返回按钮：返回联系人页面
  const backBtn = pageElement.querySelector('#group-manage-back');
  backBtn.addEventListener('click', () => {
    logger.info('phone','[GroupManage] 点击返回按钮');
    closeGroupManagePage();
  });

  // 添加分组按钮
  const addBtn = pageElement.querySelector('#group-manage-add-btn');
  addBtn.addEventListener('click', () => {
    handleAddGroup();
  });

  // 分组列表事件
  const listContainer = pageElement.querySelector('#group-manage-list');

  // 删除按钮
  listContainer.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const deleteBtn = /** @type {HTMLButtonElement} */ (target.closest('.group-manage-item-delete'));
    if (deleteBtn && !deleteBtn.disabled) {
      const groupItem = /** @type {HTMLElement} */ (deleteBtn.closest('.group-manage-item'));
      const groupId = groupItem.dataset.groupId;
      handleDeleteGroup(groupId);
      return;
    }

    // 编辑分组名（点击分组名弹出编辑弹窗）
    const nameElement = target.closest('.group-manage-item-name');
    if (nameElement) {
      const groupItem = /** @type {HTMLElement} */ (nameElement.closest('.group-manage-item'));
      const groupId = groupItem.dataset.groupId;
      const currentName = groupItem.dataset.groupName;
      handleEditGroupNamePopup(groupId, currentName);
    }
  });

  // 拖拽排序事件
  bindDragSortEvents(/** @type {HTMLElement} */(listContainer));

  logger.info('phone','[GroupManage] 分组管理事件绑定完成');
}

/**
 * 处理添加分组
 * 
 * @description
 * 弹出输入框，让用户输入新分组名称
 */
async function handleAddGroup() {
  logger.debug('phone','[GroupManage] 开始添加分组');

  const groupName = await showInputPopup(
    '添加分组',
    '',
    {
      placeholder: '请输入分组名称',
      okButton: '添加',
      cancelButton: '取消'
    }
  );

  if (!groupName || groupName.trim() === '') {
    logger.debug('phone','[GroupManage] 用户取消添加或输入为空');
    return;
  }

  const trimmedName = groupName.trim();

  // 检查是否重名
  const groups = await loadContactGroups();
  if (groups.some(g => g.name === trimmedName)) {
    showWarningToast('分组名称已存在');
    logger.warn('phone','[GroupManage] 分组名称重复:', trimmedName);
    return;
  }

  // 创建新分组
  const newGroup = {
    id: `group_${Date.now()}`,
    name: trimmedName,
    order: groups.length, // 最后一位
    isDefault: false
  };

  await saveContactGroup(newGroup);

  logger.info('phone','[GroupManage] 已添加分组:', trimmedName);
  showSuccessToast(`已添加分组"${trimmedName}"`);

  // 刷新列表
  await refreshGroupList();
}

/**
 * 处理编辑分组名称（弹窗方式）
 * 
 * @description
 * 点击分组名时弹出编辑弹窗，让用户输入新名称
 * 
 * @param {string} groupId - 分组ID
 * @param {string} currentName - 当前分组名称
 */
async function handleEditGroupNamePopup(groupId, currentName) {
  logger.debug('phone','[GroupManage] 编辑分组名称（弹窗）:', groupId, currentName);

  const newName = await showInputPopup(
    '编辑分组',
    currentName,
    {
      placeholder: '请输入新的分组名称',
      okButton: '保存',
      cancelButton: '取消'
    }
  );

  // 用户点击取消
  if (newName === null) {
    logger.debug('phone','[GroupManage] 用户取消编辑');
    return;
  }

  // 允许空字符串，只需要是 string 类型
  const finalName = typeof newName === 'string' ? newName.trim() : '';

  // 如果名称没变，跳过
  if (finalName === currentName) {
    logger.debug('phone','[GroupManage] 分组名称未变化');
    return;
  }

  // 检查是否重名（允许多个空名称，因为可以通过位置区分）
  const groups = await loadContactGroups();
  if (finalName !== '' && groups.some(g => g.id !== groupId && g.name === finalName)) {
    showWarningToast('分组名称已存在');
    logger.warn('phone','[GroupManage] 分组名称重复:', finalName);
    return;
  }

  // 更新分组名称
  const currentGroup = groups.find(g => g.id === groupId);
  if (!currentGroup) {
    logger.error('phone','[GroupManage] 找不到分组:', groupId);
    return;
  }

  currentGroup.name = finalName;
  await saveContactGroup(currentGroup);

  logger.info('phone','[GroupManage] 已更新分组名称:', finalName || '(空名称)');
  showSuccessToast(finalName ? `已更新分组名称为"${finalName}"` : '已更新分组名称为空');

  // 刷新列表
  await refreshGroupList();
}

/**
 * 处理删除分组
 * 
 * @description
 * 弹出确认弹窗，删除后将该分组的联系人移至默认分组
 * 
 * @param {string} groupId - 分组ID
 */
async function handleDeleteGroup(groupId) {
  logger.debug('phone','[GroupManage] 请求删除分组:', groupId);

  const groups = await loadContactGroups();
  const group = groups.find(g => g.id === groupId);

  if (!group) {
    logger.error('phone','[GroupManage] 找不到分组:', groupId);
    return;
  }

  if (group.isDefault) {
    showWarningToast('默认分组不能删除');
    logger.warn('phone','[GroupManage] 尝试删除默认分组:', group.name);
    return;
  }

  // 弹出确认弹窗（使用自定义弹窗）
  const confirmed = await showConfirmPopup(
    '删除分组',
    `删除"${group.name}"分组后，组内联系人将移至默认分组。\n\n确定要删除吗？`,
    {
      danger: true,
      okButton: '删除分组',
      cancelButton: '取消'
    }
  );

  if (!confirmed) {
    logger.debug('phone','[GroupManage] 用户取消删除');
    return;
  }

  // 删除分组
  await deleteContactGroup(groupId);

  logger.info('phone','[GroupManage] 已删除分组:', group.name);
  showSuccessToast(`已删除分组"${group.name}"`);

  // 刷新列表
  await refreshGroupList();
}

/**
 * 绑定拖拽排序事件
 * 
 * @param {HTMLElement} listContainer - 分组列表容器
 */
function bindDragSortEvents(listContainer) {
  logger.debug('phone','[GroupManage] 绑定拖拽排序事件');

  let draggedItem = null;

  listContainer.addEventListener('dragstart', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.classList.contains('group-manage-item')) {
      draggedItem = target;
      target.style.opacity = '0.5';
      logger.debug('phone','[GroupManage] 开始拖动分组');
    }
  });

  listContainer.addEventListener('dragend', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.classList.contains('group-manage-item')) {
      target.style.opacity = '1';
      draggedItem = null;
      logger.debug('phone','[GroupManage] 拖动结束');
    }
  });

  listContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    const target = /** @type {HTMLElement} */ (e.target);
    const targetItem = target.closest('.group-manage-item');
    if (targetItem && targetItem !== draggedItem) {
      const rect = targetItem.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) {
        listContainer.insertBefore(draggedItem, targetItem);
      } else {
        listContainer.insertBefore(draggedItem, targetItem.nextSibling);
      }
    }
  });

  listContainer.addEventListener('drop', async (e) => {
    e.preventDefault();
    logger.debug('phone','[GroupManage] 拖动完成，保存新顺序');
    await saveNewOrder(listContainer);
  });
}

/**
 * 保存新的分组顺序
 * 
 * @param {HTMLElement} listContainer - 分组列表容器
 */
async function saveNewOrder(listContainer) {
  const items = listContainer.querySelectorAll('.group-manage-item');
  const newOrder = Array.from(items).map((item, index) => {
    const elem = /** @type {HTMLElement} */ (item);
    return {
      id: elem.dataset.groupId,
      order: index
    };
  });

  await updateGroupsOrder(newOrder);

  logger.info('phone','[GroupManage] 已保存新的分组顺序');
  showSuccessToast('分组顺序已更新');
}

/**
 * 刷新分组列表
 * 
 * @description
 * 重新加载数据并更新列表DOM
 */
async function refreshGroupList() {
  logger.debug('phone','[GroupManage] 刷新分组列表');

  const groups = await loadContactGroups();
  const listContainer = document.querySelector('#group-manage-list');

  if (!listContainer) {
    logger.warn('phone','[GroupManage] 找不到分组列表容器');
    return;
  }

  listContainer.innerHTML = await renderGroupList(groups);

  logger.info('phone','[GroupManage] 分组列表已刷新');
}

/**
 * 关闭分组管理页面
 * 
 * @description
 * 返回到联系人页面（使用统一的页面栈系统）
 */
async function closeGroupManagePage() {
  logger.debug('phone','[GroupManage] 关闭分组管理页面');

  // 获取手机遮罩层元素
  const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlayElement) {
    // 使用统一的 hidePage 系统
    const { hidePage } = await import('../phone-main-ui.js');
    await hidePage(overlayElement, 'group-manage');

    // 触发刷新联系人列表事件（在overlayElement上触发）
    const event = new CustomEvent('phone:refresh-contact-list');
    overlayElement.dispatchEvent(event);
  }

  logger.info('phone','[GroupManage] 分组管理页面已关闭');
}

/**
 * 导出供外部调用的函数
 */
export { refreshGroupList, closeGroupManagePage };

