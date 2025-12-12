/**
 * 角色提示词设置页面
 * @module phone/settings/character-prompt-settings-ui
 * 
 * @description
 * 管理单个角色的提示词配置（插入到全局预设的[角色总条目]位置）
 * 支持：角色设定、性格、场景、酒馆上下文、世界书条目、自定义条目
 * 每个角色独立存储，互不影响
 */

import logger from '../../../logger.js';
import { saveSettingsDebounced, characters } from '../../../../../../../script.js';
import { extension_settings } from '../../../../../../../scripts/extensions.js';
import { world_info, loadWorldInfo } from '../../../../../../../scripts/world-info.js';
import { showInputPopup, showConfirmPopup, showCustomPopup, showCustomPopupWithData } from '../utils/popup-helper.js';
import { showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';

/**
 * 渲染角色提示词设置页面
 * 
 * @description
 * 返回页面内容片段（DocumentFragment），由 phone-main-ui.js 创建外层容器
 * 
 * @param {Object} params - 页面参数
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderCharacterPromptSettings(params) {
  const { contactId } = params;
  logger.debug('[CharPromptUI] 渲染角色提示词设置页:', contactId);

  const fragment = document.createDocumentFragment();

  // 创建内容容器（注意：不是 phone-page，外层容器由 phone-main-ui.js 创建）
  const container = document.createElement('div');
  container.className = 'char-prompt-page';

  // 渲染页面内容
  container.innerHTML = createCharPromptHTML();

  // 绑定事件
  bindCharPromptEvents(container, contactId);

  // 加载并渲染条目列表
  await loadAndRenderItems(container, contactId);

  fragment.appendChild(container);

  logger.info('[CharPromptUI] 角色提示词设置页渲染完成');

  return fragment;
}

/**
 * 创建页面HTML
 * @returns {string} HTML字符串
 */
function createCharPromptHTML() {
  return `
        <!-- 顶部栏 -->
        <div class="char-prompt-topbar">
            <button class="char-prompt-back-btn">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="char-prompt-title">角色提示词设置</div>
            <div class="char-prompt-actions">
                <button class="char-prompt-action-btn" id="char-prompt-reset-btn" title="重置">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
        </div>

        <!-- 内容区 -->
        <div class="char-prompt-content">
            <!-- 提示文字 -->
            <div class="char-prompt-hint">
                <i class="fa-solid fa-info-circle"></i>
                拖动条目可调整在[角色总条目]内的顺序
            </div>

            <!-- 添加按钮组 -->
            <div class="char-prompt-add-buttons">
                <button class="char-prompt-add-btn" id="char-prompt-add-custom">
                    <i class="fa-solid fa-plus"></i>
                    添加自定义条目
                </button>

                <button class="char-prompt-add-btn char-prompt-add-worldbook" id="char-prompt-add-worldbook">
                    <i class="fa-solid fa-book"></i>
                    从世界书选择条目
                </button>

                <button class="char-prompt-add-btn char-prompt-add-regex" id="char-prompt-add-regex">
                    <i class="fa-solid fa-wrench"></i>
                    配置酒馆正则
                </button>
            </div>

            <!-- 条目列表（可拖拽） -->
            <div class="char-prompt-list" id="char-prompt-list">
                <!-- 条目通过JS动态生成 -->
            </div>
        </div>
    `;
}

/**
 * 绑定事件
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
function bindCharPromptEvents(page, contactId) {
  logger.debug('[CharPromptUI] 绑定事件');

  // 返回按钮
  const backBtn = page.querySelector('.char-prompt-back-btn');
  backBtn?.addEventListener('click', async () => {
    const { hidePage } = await import('../phone-main-ui.js');
    const overlay = document.querySelector('.phone-overlay');
    if (overlay) {
      hidePage(/** @type {HTMLElement} */(overlay), 'character-prompt-settings');
    }
  });

  // 添加自定义条目
  const addCustomBtn = page.querySelector('#char-prompt-add-custom');
  addCustomBtn?.addEventListener('click', () => handleAddCustomItem(page, contactId));

  // 从世界书选择
  const addWorldbookBtn = page.querySelector('#char-prompt-add-worldbook');
  addWorldbookBtn?.addEventListener('click', () => handleAddFromWorldbook(page, contactId));

  // 配置酒馆正则
  const addRegexBtn = page.querySelector('#char-prompt-add-regex');
  addRegexBtn?.addEventListener('click', () => handleOpenRegexSettings(contactId));

  // 重置按钮
  const resetBtn = page.querySelector('#char-prompt-reset-btn');
  resetBtn?.addEventListener('click', () => handleReset(page, contactId));
}

/**
 * 加载并渲染条目列表
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function loadAndRenderItems(page, contactId) {
  logger.debug('[CharPromptUI] 加载条目列表');

  // 获取或初始化数据
  const data = getCharacterPromptData(contactId);

  // 渲染列表
  const listContainer = page.querySelector('#char-prompt-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  // 按order排序
  const sortedItems = data.items.sort((a, b) => a.order - b.order);

  // 渲染每个条目
  sortedItems.forEach(item => {
    const itemElement = createPromptItem(item, contactId);
    listContainer.appendChild(itemElement);
  });

  // 初始化拖拽排序
  initSortable(/** @type {HTMLElement} */(listContainer), contactId);

  logger.debug('[CharPromptUI] 条目列表渲染完成，共', sortedItems.length, '项');
}

/**
 * 创建条目元素
 * @param {Object} item - 条目数据
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement} 条目元素
 */
function createPromptItem(item, contactId) {
  const div = document.createElement('div');
  div.className = 'char-prompt-item';
  div.dataset.itemId = item.id;

  const toggleClass = item.enabled ? 'enabled' : 'disabled';
  const toggleIcon = item.enabled ? 'fa-toggle-on' : 'fa-toggle-off';

  // 特殊显示：酒馆上下文显示数量
  const labelText = item.type === 'tavern-context'
    ? `${item.label} [${item.contextCount || 5}条]`
    : item.label;

  div.innerHTML = `
        <div class="char-prompt-item-drag">
            <i class="fa-solid fa-grip-vertical"></i>
        </div>
        <div class="char-prompt-item-content">
            <div class="char-prompt-item-label">${labelText}</div>
        </div>
        <div class="char-prompt-item-actions">
            <button class="char-prompt-item-toggle ${toggleClass}" data-action="toggle" title="${item.enabled ? '禁用' : '启用'}">
                <i class="fa-solid ${toggleIcon}"></i>
            </button>
            ${item.editable ? `
                <button class="char-prompt-item-edit" data-action="edit" title="编辑">
                    <i class="fa-solid fa-pen"></i>
                </button>
            ` : ''}
            ${item.deletable ? `
                <button class="char-prompt-item-delete" data-action="delete" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : ''}
        </div>
    `;

  // 绑定按钮事件
  const toggleBtn = div.querySelector('[data-action="toggle"]');
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleToggleItem(item.id, contactId, div);
  });

  const editBtn = div.querySelector('[data-action="edit"]');
  editBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleEditItem(item.id, contactId, div);
  });

  const deleteBtn = div.querySelector('[data-action="delete"]');
  deleteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteItem(item.id, contactId, div);
  });

  return div;
}

/**
 * 初始化拖拽排序
 * @param {HTMLElement} listContainer - 列表容器
 * @param {string} contactId - 联系人ID
 */
function initSortable(listContainer, contactId) {
  logger.debug('[CharPromptUI] 初始化拖拽排序');

  // @ts-ignore - jQuery UI Sortable
  $(listContainer).sortable({
    handle: '.char-prompt-item-drag',
    axis: 'y',
    cursor: 'move',
    opacity: 0.8,
    tolerance: 'pointer',
    stop: function (event, ui) {
      handleSortEnd(listContainer, contactId);
    }
  });
}

/**
 * 处理拖拽排序结束
 * @param {HTMLElement} listContainer - 列表容器
 * @param {string} contactId - 联系人ID
 */
function handleSortEnd(listContainer, contactId) {
  logger.debug('[CharPromptUI] 拖拽排序结束，保存新顺序');

  const items = Array.from(listContainer.querySelectorAll('.char-prompt-item'));
  const newOrder = items.map((item, index) => ({
    id: /** @type {HTMLElement} */ (item).dataset.itemId,
    order: index
  }));

  const data = getCharacterPromptData(contactId);
  newOrder.forEach(({ id, order }) => {
    const item = data.items.find(i => i.id === id);
    if (item) {
      item.order = order;
    }
  });

  saveCharacterPromptData(contactId, data);
  showSuccessToast('顺序已更新');
}

/**
 * 处理开关切换
 * @param {string} itemId - 条目ID
 * @param {string} contactId - 联系人ID
 * @param {HTMLElement} itemElement - 条目元素
 */
function handleToggleItem(itemId, contactId, itemElement) {
  logger.debug('[CharPromptUI] 切换条目开关:', itemId);

  const data = getCharacterPromptData(contactId);
  const item = data.items.find(i => i.id === itemId);

  if (!item) return;

  item.enabled = !item.enabled;

  // 更新UI
  const toggleBtn = /** @type {HTMLElement} */ (itemElement.querySelector('.char-prompt-item-toggle'));
  if (toggleBtn) {
    if (item.enabled) {
      toggleBtn.classList.remove('disabled');
      toggleBtn.classList.add('enabled');
      const icon = toggleBtn.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-toggle-on';
      toggleBtn.title = '禁用';
    } else {
      toggleBtn.classList.remove('enabled');
      toggleBtn.classList.add('disabled');
      const icon = toggleBtn.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-toggle-off';
      toggleBtn.title = '启用';
    }
  }

  saveCharacterPromptData(contactId, data);
  showSuccessToast(item.enabled ? '已启用' : '已禁用');
}

/**
 * 处理编辑条目
 * @param {string} itemId - 条目ID
 * @param {string} contactId - 联系人ID
 * @param {HTMLElement} itemElement - 条目元素
 */
async function handleEditItem(itemId, contactId, itemElement) {
  logger.debug('[CharPromptUI] 编辑条目:', itemId);

  const data = getCharacterPromptData(contactId);
  const item = data.items.find(i => i.id === itemId);

  if (!item) return;

  // 特殊处理：酒馆上下文只能调整数量
  if (item.type === 'tavern-context') {
    const count = await showInputPopup(
      '设置获取数量',
      String(item.contextCount || 5),
      {
        placeholder: '输入数字（建议1-20）',
        okButton: '保存'
      }
    );

    if (count !== null) {
      const num = parseInt(count);
      if (isNaN(num) || num < 1) {
        showErrorToast('请输入有效数字');
        return;
      }

      item.contextCount = num;

      // 更新UI标签
      const labelElement = itemElement.querySelector('.char-prompt-item-label');
      if (labelElement) {
        labelElement.textContent = `${item.label} [${num}条]`;
      }

      saveCharacterPromptData(contactId, data);
      showSuccessToast('已保存');
    }
    return;
  }

  // 普通条目：编辑标签、角色类型、内容
  const editHTML = `
        <div class="preset-edit-form">
            <div class="preset-edit-field">
                <input type="text" id="char-prompt-edit-label" value="${item.label}" maxlength="50" placeholder="例如：角色设定">
            </div>
            <div class="preset-edit-field">
                <select id="char-prompt-edit-role" class="text_pole">
                    <option value="system" ${(item.role || 'system') === 'system' ? 'selected' : ''}>系统 (system)</option>
                    <option value="user" ${item.role === 'user' ? 'selected' : ''}>用户 (user)</option>
                    <option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>助手 (assistant)</option>
                </select>
            </div>
            <div class="preset-edit-field">
                <textarea id="char-prompt-edit-content" rows="8" maxlength="5000" placeholder="输入提示词内容（自动获取的条目不可编辑内容）">${item.content || ''}</textarea>
            </div>
        </div>
    `;

  const result = await showCustomPopupWithData('编辑条目', editHTML, {
    buttons: [
      { text: '取消', value: null, class: 'phone-popup-cancel' },
      { text: '保存', value: 'ok', class: 'phone-popup-ok' }
    ],
    beforeClose: (buttonValue) => {
      if (buttonValue === 'ok') {
        const labelInput = /** @type {HTMLInputElement} */ (document.querySelector('#char-prompt-edit-label'));
        const roleSelect = /** @type {HTMLSelectElement} */ (document.querySelector('#char-prompt-edit-role'));
        const contentInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#char-prompt-edit-content'));

        return {
          action: buttonValue,
          label: labelInput?.value.trim() || item.label,
          role: roleSelect?.value || item.role || 'system',
          content: contentInput?.value.trim() || ''
        };
      }
      return { action: buttonValue };
    }
  });

  if (result && result.action === 'ok') {
    item.label = result.label;
    item.role = result.role;
    if (item.type === 'custom' || item.type === 'worldbook') {
      item.content = result.content;  // 自定义和世界书条目可以编辑内容
    }

    // 更新UI
    const labelElement = itemElement.querySelector('.char-prompt-item-label');
    if (labelElement) labelElement.textContent = result.label;

    saveCharacterPromptData(contactId, data);
    showSuccessToast('已保存');

    logger.debug('[CharPromptUI] 条目已更新:', { id: item.id, label: result.label });
  }
}

/**
 * 处理删除条目
 * @param {string} itemId - 条目ID
 * @param {string} contactId - 联系人ID
 * @param {HTMLElement} itemElement - 条目元素
 */
async function handleDeleteItem(itemId, contactId, itemElement) {
  logger.debug('[CharPromptUI] 删除条目:', itemId);

  const data = getCharacterPromptData(contactId);
  const item = data.items.find(i => i.id === itemId);

  if (!item) return;

  const confirmed = await showConfirmPopup(
    '删除条目',
    `确定要删除条目"${item.label}"吗？`,
    { danger: true, okButton: '删除' }
  );

  if (confirmed) {
    data.items = data.items.filter(i => i.id !== itemId);
    itemElement.remove();
    saveCharacterPromptData(contactId, data);
    showSuccessToast('已删除');
  }
}

/**
 * 处理添加自定义条目
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function handleAddCustomItem(page, contactId) {
  logger.debug('[CharPromptUI] 添加自定义条目');

  const editHTML = `
        <div class="preset-edit-form">
            <div class="preset-edit-field">
                <input type="text" id="char-prompt-add-label" maxlength="50" placeholder="例如：我的笔记">
            </div>
            <div class="preset-edit-field">
                <select id="char-prompt-add-role" class="text_pole">
                    <option value="system" selected>系统 (system)</option>
                    <option value="user">用户 (user)</option>
                    <option value="assistant">助手 (assistant)</option>
                </select>
            </div>
            <div class="preset-edit-field">
                <textarea id="char-prompt-add-content" rows="8" maxlength="5000" placeholder="输入提示词内容"></textarea>
            </div>
        </div>
    `;

  const result = await showCustomPopupWithData('添加自定义条目', editHTML, {
    buttons: [
      { text: '取消', value: null, class: 'phone-popup-cancel' },
      { text: '添加', value: 'ok', class: 'phone-popup-ok' }
    ],
    beforeClose: (buttonValue) => {
      if (buttonValue === 'ok') {
        const labelInput = /** @type {HTMLInputElement} */ (document.querySelector('#char-prompt-add-label'));
        const roleSelect = /** @type {HTMLSelectElement} */ (document.querySelector('#char-prompt-add-role'));
        const contentInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#char-prompt-add-content'));

        return {
          action: buttonValue,
          label: labelInput?.value.trim() || '自定义条目',
          role: roleSelect?.value || 'system',
          content: contentInput?.value.trim() || ''
        };
      }
      return { action: buttonValue };
    }
  });

  if (result && result.action === 'ok') {
    const data = getCharacterPromptData(contactId);
    const newItem = {
      id: 'custom-' + Date.now(),
      type: 'custom',
      label: result.label,
      role: result.role,
      content: result.content,
      enabled: true,
      editable: true,
      deletable: true,
      order: data.items.length
    };

    data.items.push(newItem);
    saveCharacterPromptData(contactId, data);

    // ✅ 局部更新：只追加新条目DOM，不重新渲染整个列表
    const listContainer = page.querySelector('#char-prompt-list');
    if (listContainer) {
      const newItemElement = createPromptItem(newItem, contactId);
      listContainer.appendChild(newItemElement);

      // 刷新拖拽排序（jQuery UI需要刷新才能识别新元素）
      // @ts-ignore
      $(listContainer).sortable('refresh');
    }

    showSuccessToast('已添加');
    logger.debug('[CharPromptUI] 新条目已添加（局部更新）:', { label: result.label });
  }
}

/**
 * 处理从世界书添加条目
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function handleAddFromWorldbook(page, contactId) {
  logger.debug('[CharPromptUI] 打开世界书选择器');

  // 获取角色关联的世界书条目
  const entries = await getCharacterWorldbookEntries(contactId);

  if (!entries || entries.length === 0) {
    showErrorToast('该角色没有关联的世界书条目');
    return;
  }

  // 显示选择器弹窗
  const selected = await showWorldbookSelector(entries, contactId);

  if (selected && selected.length > 0) {
    // 添加选中的条目
    const data = getCharacterPromptData(contactId);
    const newItems = [];

    selected.forEach(entry => {
      // 检查是否已存在
      const exists = data.items.some(i => i.type === 'worldbook' && i.entryUid === entry.uid);
      if (exists) {
        logger.debug('[CharPromptUI] 条目已存在，跳过:', entry.comment);
        return;
      }

      const newItem = {
        id: 'worldbook-' + entry.uid,
        type: 'worldbook',
        label: `[世界书-${entry.comment || '未命名'}]`,
        role: 'system',
        content: entry.content || '',
        worldbookName: entry.worldbookName,
        entryUid: entry.uid,
        enabled: true,
        editable: true,
        deletable: true,
        order: data.items.length + newItems.length
      };

      data.items.push(newItem);
      newItems.push(newItem);
    });

    if (newItems.length > 0) {
      saveCharacterPromptData(contactId, data);

      // ✅ 局部更新：只追加新条目DOM，不重新渲染整个列表
      const listContainer = page.querySelector('#char-prompt-list');
      if (listContainer) {
        newItems.forEach(item => {
          const itemElement = createPromptItem(item, contactId);
          listContainer.appendChild(itemElement);
        });

        // 刷新拖拽排序
        // @ts-ignore
        $(listContainer).sortable('refresh');
      }

      showSuccessToast(`已添加 ${newItems.length} 个条目`);
      logger.debug('[CharPromptUI] 世界书条目已添加（局部更新）:', newItems.length, '个');
    } else {
      showErrorToast('所选条目已全部存在');
    }
  }
}

/**
 * 显示世界书选择器弹窗
 * @param {Array<Object>} entries - 世界书条目列表
 * @param {string} contactId - 联系人ID
 * @returns {Promise<Array<Object>|null>} 选中的条目列表
 */
async function showWorldbookSelector(entries, contactId) {
  logger.debug('[CharPromptUI] 显示世界书选择器，共', entries.length, '个条目');

  // 创建选择器HTML
  const selectorHTML = `
        <div class="worldbook-selector">
            <div class="worldbook-selector-search">
                <input type="text" id="worldbook-search" placeholder="搜索条目..." />
            </div>
            <div class="worldbook-selector-list" id="worldbook-list">
                ${entries.map((entry, index) => `
                    <label class="worldbook-selector-item">
                        <input type="checkbox" value="${index}" />
                        <span class="worldbook-item-name">${entry.comment || '未命名条目'}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

  const result = await showCustomPopupWithData('选择世界书条目', selectorHTML, {
    buttons: [
      { text: '取消', value: null, class: 'phone-popup-cancel' },
      { text: '添加', value: 'ok', class: 'phone-popup-ok' }
    ],
    width: '90%',

    // 弹窗显示后立即绑定搜索功能
    onShow: (overlay) => {
      const searchInput = /** @type {HTMLInputElement} */ (overlay.querySelector('#worldbook-search'));
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const keyword = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase();
          const items = overlay.querySelectorAll('.worldbook-selector-item');
          items.forEach(item => {
            const text = /** @type {HTMLElement} */ (item).textContent?.toLowerCase() || '';
            /** @type {HTMLElement} */ (item).style.display = text.includes(keyword) ? 'flex' : 'none';
          });
        });
        logger.debug('[CharPromptUI] 世界书搜索功能已绑定');
      }
    },

    beforeClose: (buttonValue) => {
      if (buttonValue === 'ok') {
        const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('#worldbook-list input[type="checkbox"]:checked'));
        const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
        return {
          action: buttonValue,
          selected: selectedIndices.map(i => entries[i])
        };
      }
      return { action: buttonValue };
    }
  });

  if (result && result.action === 'ok') {
    return result.selected || [];
  }

  return null;
}

/**
 * 获取角色关联的世界书条目
 * @param {string} contactId - 联系人ID
 * @returns {Promise<Array<Object>>} 世界书条目列表
 */
async function getCharacterWorldbookEntries(contactId) {
  try {
    // 从contactId提取角色名
    const charName = contactId.replace(/^tavern_/, '');

    // 在酒馆角色列表中查找
    const character = characters.find(c => {
      const avatar = c.avatar?.replace(/\.[^/.]+$/, '');
      return avatar === charName;
    });

    if (!character) {
      logger.warn('[CharPromptUI] 未找到对应的酒馆角色:', charName);
      return [];
    }

    // 获取角色关联的世界书
    const characterBook = character.data?.character_book;
    if (!characterBook || !characterBook.entries) {
      logger.debug('[CharPromptUI] 角色没有关联世界书');
      return [];
    }

    // 转换格式
    const entries = characterBook.entries.map(entry => ({
      uid: entry.uid || entry.id,
      comment: entry.comment || entry.key?.join(', '),
      content: entry.content || '',
      worldbookName: character.name + ' (角色世界书)'
    }));

    logger.debug('[CharPromptUI] 找到角色世界书条目:', entries.length, '个');
    return entries;

  } catch (error) {
    logger.error('[CharPromptUI] 获取世界书条目失败:', error);
    return [];
  }
}

/**
 * 处理重置
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function handleReset(page, contactId) {
  logger.debug('[CharPromptUI] 重置角色配置');

  const confirmed = await showConfirmPopup(
    '⚠️ 重置配置',
    '此操作将恢复为默认配置，所有自定义条目将被删除。\n\n确定要重置吗？',
    { danger: true, okButton: '确定重置' }
  );

  if (confirmed) {
    const defaultData = createDefaultCharacterPrompt();
    saveCharacterPromptData(contactId, defaultData);

    await loadAndRenderItems(page, contactId);
    showSuccessToast('已重置为默认配置');
  }
}

/**
 * 获取角色提示词数据
 * @param {string} contactId - 联系人ID
 * @returns {Object} 角色提示词数据
 */
function getCharacterPromptData(contactId) {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.characterPrompts) {
    extension_settings.acsusPawsPuffs.phone.characterPrompts = {};
  }

  // 如果该角色没有配置，创建默认配置
  if (!extension_settings.acsusPawsPuffs.phone.characterPrompts[contactId]) {
    logger.debug('[CharPromptUI] 首次打开，创建默认配置');
    extension_settings.acsusPawsPuffs.phone.characterPrompts[contactId] = createDefaultCharacterPrompt();
    saveSettingsDebounced();
  }

  return extension_settings.acsusPawsPuffs.phone.characterPrompts[contactId];
}

/**
 * 保存角色提示词数据
 * @param {string} contactId - 联系人ID
 * @param {Object} data - 角色提示词数据
 */
function saveCharacterPromptData(contactId, data) {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.characterPrompts) {
    extension_settings.acsusPawsPuffs.phone.characterPrompts = {};
  }

  extension_settings.acsusPawsPuffs.phone.characterPrompts[contactId] = data;
  saveSettingsDebounced();

  logger.debug('[CharPromptUI] 角色提示词数据已保存');
}

/**
 * 创建默认配置
 * @returns {Object} 默认配置数据
 */
function createDefaultCharacterPrompt() {
  return {
    items: [
      {
        id: 'char-desc',
        type: 'auto',
        label: '[角色设定]',
        role: 'system',
        content: '__AUTO_CHAR_DESC__',
        enabled: true,
        editable: true,  // 可以编辑role
        deletable: false,
        order: 0
      },
      {
        id: 'char-personality',
        type: 'auto',
        label: '[角色性格]',
        role: 'system',
        content: '__AUTO_CHAR_PERSONALITY__',
        enabled: true,
        editable: true,
        deletable: false,
        order: 1
      },
      {
        id: 'char-scenario',
        type: 'auto',
        label: '[角色场景]',
        role: 'system',
        content: '__AUTO_CHAR_SCENARIO__',
        enabled: true,
        editable: true,
        deletable: false,
        order: 2
      },
      {
        id: 'tavern-context',
        type: 'tavern-context',
        label: '[酒馆上下文]',
        role: 'system',
        content: '__AUTO_TAVERN_CONTEXT__',
        contextCount: 5,  // 默认5条
        enabled: true,
        editable: true,  // 可以调整数量和role
        deletable: false,
        order: 3
      },
      {
        id: 'membership-status',
        type: 'auto',
        label: '[会员状态]',
        role: 'system',
        content: '__AUTO_MEMBERSHIP_STATUS__',
        enabled: true,
        editable: true,
        deletable: false,
        order: 4
      },
      {
        id: 'history-chat',
        type: 'history-chat',
        label: '[历史聊天记录]',
        role: 'system',
        content: '__AUTO_HISTORY_CHAT__',
        enabled: true,
        editable: false,  // 不可编辑，自动从设置获取
        deletable: false,
        order: 5
      }
    ]
  };
}

/**
 * 处理打开正则配置页
 * 
 * @param {string} contactId - 联系人ID
 */
async function handleOpenRegexSettings(contactId) {
  logger.debug('[CharPromptUI] 打开正则配置页');
  
  // 获取手机遮罩层元素
  const overlay = document.querySelector('.phone-overlay');
  if (!overlay) {
    logger.error('[CharPromptUI] 找不到手机遮罩层');
    return;
  }
  
  // 动态导入页面
  const { showPage } = await import('../phone-main-ui.js');
  await showPage(overlay, 'contact-regex-settings', { contactId });
}

/**
 * 导出给ai-context-builder.js使用的函数
 * @param {string} contactId - 联系人ID
 * @returns {Object} 角色提示词数据
 */
export function getCharacterPromptConfig(contactId) {
  return getCharacterPromptData(contactId);
}

