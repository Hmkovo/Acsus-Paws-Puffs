/**
 * 联系人选择器弹窗
 * @module phone/utils/contact-selector-popup
 * 
 * @description
 * 提供联系人选择功能，用于转发消息等场景
 * 支持单选/多选、搜索过滤、排除特定联系人
 */

import logger from '../../../logger.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from './contact-display-helper.js';
import { showCustomPopupWithData } from './popup-helper.js';
import { showWarningToast } from '../ui-components/toast-notification.js';
import { getThumbnailUrl } from '../../../../../../../script.js';

/**
 * 显示联系人选择器弹窗
 * 
 * @async
 * @param {Object} options - 配置项
 * @param {boolean} [options.multiple=true] - 是否多选
 * @param {string[]} [options.exclude=[]] - 排除的联系人ID（如当前对话角色）
 * @param {string} [options.title='选择联系人'] - 弹窗标题
 * @returns {Promise<string[]|null>} 选中的联系人ID数组，取消返回null
 * 
 * @example
 * // 单选
 * const contactIds = await showContactSelectorPopup({ multiple: false });
 * 
 * // 多选，排除当前角色
 * const contactIds = await showContactSelectorPopup({ 
 *   multiple: true, 
 *   exclude: ['current_contact_id'] 
 * });
 */
export async function showContactSelectorPopup(options = {}) {
  const {
    multiple = true,
    exclude = [],
    title = '选择联系人'
  } = options;

  logger.debug('phone','[ContactSelector] 显示联系人选择器', { multiple, exclude });

  // 加载联系人列表
  const allContacts = await loadContacts();

  // 过滤掉排除的联系人
  const contacts = allContacts.filter(c => !exclude.includes(c.id));

  if (contacts.length === 0) {
    showWarningToast('暂无可选联系人');
    return null;
  }

  // 创建选择器HTML
  const pickerHTML = createContactPickerHTML(contacts, multiple);

  // 显示弹窗
  const result = await showCustomPopupWithData(
    title,
    pickerHTML,
    {
      buttons: [
        { text: '取消', value: null, class: 'phone-popup-cancel' },
        { text: '确定', value: 'confirm', class: 'phone-popup-ok' }
      ],
      width: '90%',
      onShow: (overlayElement) => {
        bindContactPickerEvents(overlayElement, multiple);
      },
      beforeClose: (buttonValue, overlayElement) => {
        if (buttonValue === 'confirm') {
          // 获取选中的联系人ID
          const selectedIds = getSelectedContactIds(overlayElement);

          if (selectedIds.length === 0) {
            showWarningToast('请选择至少一个联系人');
            return 'prevent'; // 阻止关闭
          }

          logger.info('phone','[ContactSelector] 选中联系人:', selectedIds);
          return selectedIds;
        }

        return null;
      }
    }
  );

  // 检查是否阻止关闭
  if (result === 'prevent') {
    // 不关闭弹窗，重新监听
    return showContactSelectorPopup(options);
  }

  return result;
}

/**
 * 创建联系人选择器HTML
 * 
 * @private
 * @param {Array} contacts - 联系人列表
 * @param {boolean} multiple - 是否多选
 * @returns {string} HTML字符串
 */
function createContactPickerHTML(contacts, multiple) {
  return `
    <div class="contact-selector-container">
      <!-- 搜索栏 -->
      <div class="contact-selector-search">
        <i class="fa-solid fa-search"></i>
        <input type="text" class="contact-selector-search-input" placeholder="搜索联系人">
        <button class="contact-selector-search-clear"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <!-- 联系人列表 -->
      <div class="contact-selector-list">
        ${contacts.map(contact => createContactPickerItemHTML(contact, multiple)).join('')}
      </div>
    </div>
  `;
}

/**
 * 创建单个联系人项HTML
 * 
 * @private
 * @param {Object} contact - 联系人对象
 * @param {boolean} multiple - 是否多选
 * @returns {string} HTML字符串
 */
function createContactPickerItemHTML(contact, multiple) {
  const displayName = getContactDisplayName(contact);

  // 获取头像
  let avatarHTML = '<i class="fa-solid fa-user-circle"></i>';
  if (contact.avatar) {
    const avatarUrl = getThumbnailUrl('avatar', contact.avatar);
    avatarHTML = `<img src="${avatarUrl}" alt="${displayName}">`;
  }

  // 副标题（显示角色原名，如果有备注的话）
  let subtitleHTML = '';
  if (contact.remark) {
    subtitleHTML = `<span class="contact-selector-item-subtitle">昵称：${contact.name}</span>`;
  }

  return `
    <div class="contact-selector-item" data-contact-id="${contact.id}">
      <div class="contact-selector-item-avatar">
        ${avatarHTML}
      </div>
      <div class="contact-selector-item-info">
        <div class="contact-selector-item-name">${displayName}</div>
        ${subtitleHTML}
      </div>
      <div class="contact-selector-item-check">
        <i class="fa-solid ${multiple ? 'fa-square-check' : 'fa-circle-check'}"></i>
      </div>
    </div>
  `;
}

/**
 * 绑定联系人选择器事件
 * 
 * @private
 * @param {HTMLElement} overlay - 弹窗元素
 * @param {boolean} multiple - 是否多选
 */
function bindContactPickerEvents(overlay, multiple) {
  const searchInput = overlay.querySelector('.contact-selector-search-input');
  const clearBtn = overlay.querySelector('.contact-selector-search-clear');
  const listContainer = overlay.querySelector('.contact-selector-list');

  // 搜索功能
  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const keyword = target.value.trim();

    // 显示/隐藏清除按钮
    const clearButton = /** @type {HTMLElement} */ (clearBtn);
    clearButton.style.display = keyword ? 'flex' : 'none';

    // 防抖搜索
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const listElement = /** @type {HTMLElement} */ (listContainer);
      handleContactPickerSearch(keyword, listElement);
    }, 300);
  });

  // 清除搜索
  clearBtn.addEventListener('click', () => {
    const inputElement = /** @type {HTMLInputElement} */ (searchInput);
    inputElement.value = '';
    const clearButton = /** @type {HTMLElement} */ (clearBtn);
    clearButton.style.display = 'none';
    const listElement = /** @type {HTMLElement} */ (listContainer);
    handleContactPickerSearch('', listElement);
  });

  // 点击选择
  listContainer.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const item = target.closest('.contact-selector-item');
    if (!item) return;

    if (multiple) {
      // 多选：切换选中状态
      item.classList.toggle('selected');
    } else {
      // 单选：取消其他选中
      listContainer.querySelectorAll('.contact-selector-item').forEach(el => {
        el.classList.remove('selected');
      });
      item.classList.add('selected');
    }
  });
}

/**
 * 处理联系人选择器搜索
 * 
 * @private
 * @param {string} searchKeyword - 搜索关键词
 * @param {HTMLElement} listContainer - 列表容器
 */
async function handleContactPickerSearch(searchKeyword, listContainer) {
  logger.debug('phone','[ContactSelector] 搜索:', searchKeyword || '(全部)');

  // 重新加载联系人列表
  const allContacts = await loadContacts();

  // 过滤联系人（大小写不敏感）
  const keyword = searchKeyword.trim().toLowerCase();
  const filteredContacts = keyword
    ? allContacts.filter(contact => {
        const displayName = getContactDisplayName(contact).toLowerCase();
        const originalName = (contact.name || '').toLowerCase();
        return displayName.includes(keyword) || originalName.includes(keyword);
      })
    : allContacts;

  // 清空列表
  listContainer.innerHTML = '';

  // 空状态
  if (filteredContacts.length === 0) {
    listContainer.innerHTML = `
      <div class="contact-selector-empty">
        <i class="fa-solid fa-user-group"></i>
        <p>未找到匹配的联系人</p>
      </div>
    `;
    return;
  }

  // 重新渲染
  filteredContacts.forEach(contact => {
    const itemHTML = createContactPickerItemHTML(contact, true); // 假设多选
    const temp = document.createElement('div');
    temp.innerHTML = itemHTML;
    listContainer.appendChild(temp.firstElementChild);
  });
}

/**
 * 获取选中的联系人ID
 * 
 * @private
 * @param {HTMLElement} overlay - 弹窗元素
 * @returns {string[]} 选中的联系人ID数组
 */
function getSelectedContactIds(overlay) {
  const selectedItems = overlay.querySelectorAll('.contact-selector-item.selected');
  const ids = [];

  selectedItems.forEach(item => {
    const element = /** @type {HTMLElement} */ (item);
    const contactId = element.dataset.contactId;
    if (contactId) {
      ids.push(contactId);
    }
  });

  return ids;
}
