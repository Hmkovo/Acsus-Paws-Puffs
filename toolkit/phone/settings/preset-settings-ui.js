/**
 * 预设管理页面UI
 * @module phone/settings/preset-settings-ui
 * 
 * @description
 * 管理AI提示词预设（构建提示词的各个组成部分）
 * 支持编辑、删除、开关、拖拽排序、导入导出
 */

import logger from '../../../logger.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { extension_settings } from '../../../../../../../scripts/extensions.js';
import { showInputPopup, showConfirmPopup, showCustomPopup, showCustomPopupWithData } from '../utils/popup-helper.js';
import { showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';

/**
 * 渲染预设管理页面
 * 
 * @param {Object} params - 页面参数
 * @returns {Promise<HTMLElement>} 页面元素
 */
export async function renderPresetSettings(params) {
  logger.debug('[PresetSettingsUI] 渲染预设管理页面');

  // 创建页面容器
  const page = document.createElement('div');
  page.id = 'page-preset-settings';
  page.className = 'phone-page preset-settings-page';

  // 渲染页面内容
  page.innerHTML = createPresetSettingsHTML();

  // 绑定事件
  bindPresetEvents(page);

  // 加载并渲染预设列表
  await loadAndRenderPresets(page);

  logger.info('[PresetSettingsUI] 预设管理页面渲染完成');

  return page;
}

/**
 * 创建预设管理页面HTML
 * 
 * @returns {string} HTML字符串
 */
function createPresetSettingsHTML() {
  return `
        <!-- 顶部栏 -->
        <div class="preset-settings-topbar">
            <button class="preset-settings-back-btn">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="preset-settings-title">预设管理</div>
            <div class="preset-settings-actions">
                <button class="preset-settings-action-btn" id="preset-import-btn" title="导入">
                    <i class="fa-solid fa-download"></i>
                </button>
                <button class="preset-settings-action-btn" id="preset-export-btn" title="导出">
                    <i class="fa-solid fa-upload"></i>
                </button>
                <button class="preset-settings-action-btn" id="preset-reset-btn" title="重置">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
            </div>
        </div>

        <!-- 内容区 -->
        <div class="preset-settings-content">
            <!-- 提示文字 -->
            <div class="preset-settings-hint">
                <i class="fa-solid fa-info-circle"></i>
                拖动条目可调整发送顺序
            </div>

            <!-- 添加按钮 -->
            <button class="preset-settings-add-btn" id="preset-add-btn">
                <i class="fa-solid fa-plus"></i>
                添加自定义条目
            </button>

            <!-- 条目列表（可拖拽） -->
            <div class="preset-settings-list" id="preset-list">
                <!-- 条目通过JS动态生成 -->
            </div>
        </div>
    `;
}

/**
 * 绑定预设管理页面事件
 * 
 * @param {HTMLElement} page - 页面元素
 */
function bindPresetEvents(page) {
  logger.debug('[PresetSettingsUI] 绑定事件');

  // 返回按钮
  const backBtn = page.querySelector('.preset-settings-back-btn');
  backBtn?.addEventListener('click', async () => {
    const { hidePage } = await import('../phone-main-ui.js');
    const overlay = document.querySelector('.phone-overlay');
    if (overlay) {
      hidePage(/** @type {HTMLElement} */(overlay), 'preset-settings');
    }
  });

  // 添加按钮
  const addBtn = page.querySelector('#preset-add-btn');
  addBtn?.addEventListener('click', () => handleAddPreset(page));

  // 导入按钮
  const importBtn = page.querySelector('#preset-import-btn');
  importBtn?.addEventListener('click', () => handleImportPresets(page));

  // 导出按钮
  const exportBtn = page.querySelector('#preset-export-btn');
  exportBtn?.addEventListener('click', () => handleExportPresets());

  // 重置按钮
  const resetBtn = page.querySelector('#preset-reset-btn');
  resetBtn?.addEventListener('click', () => handleResetPresets(page));
}

/**
 * 加载并渲染预设列表
 * 
 * @param {HTMLElement} page - 页面元素
 */
async function loadAndRenderPresets(page) {
  logger.debug('[PresetSettingsUI] 加载预设列表');

  // 获取预设数据
  const presets = getPresetData();

  // 渲染列表
  const listContainer = page.querySelector('#preset-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  // 按order排序
  const sortedItems = presets.items.sort((a, b) => a.order - b.order);

  // 渲染每个条目
  sortedItems.forEach(item => {
    const itemElement = createPresetItem(item);
    listContainer.appendChild(itemElement);
  });

  // 初始化拖拽排序（使用jQuery UI Sortable）
  initSortable(/** @type {HTMLElement} */(listContainer));

  logger.debug('[PresetSettingsUI] 预设列表渲染完成，共', sortedItems.length, '项');
}

/**
 * 创建预设条目元素
 * 
 * @param {Object} item - 条目数据
 * @returns {HTMLElement} 条目元素
 */
function createPresetItem(item) {
  const div = document.createElement('div');
  div.className = 'preset-item';
  div.dataset.itemId = item.id;

  // 开关状态
  const toggleClass = item.enabled ? 'enabled' : 'disabled';
  const toggleIcon = item.enabled ? 'fa-toggle-on' : 'fa-toggle-off';

  // 特殊处理：角色总条目、QQ聊天记录、表情包库
  const isCharacterInfo = item.id === 'char-info';
  const isChatHistory = item.id === 'chat-history';
  const isEmojiLibrary = item.id === 'emoji-library';
  const isReadonly = !item.editable;

  div.innerHTML = `
        <div class="preset-item-drag">
            <i class="fa-solid fa-grip-vertical"></i>
        </div>
        <div class="preset-item-content">
            <div class="preset-item-label">${item.label}</div>
        </div>
        <div class="preset-item-actions">
            <button class="preset-item-toggle ${toggleClass}" data-action="toggle" title="${item.enabled ? '禁用' : '启用'}">
                <i class="fa-solid ${toggleIcon}"></i>
            </button>
            ${!isReadonly ? `
                <button class="preset-item-edit" data-action="edit" title="编辑">
                    <i class="fa-solid fa-pen"></i>
                </button>
            ` : ''}
            ${isCharacterInfo ? `
                <button class="preset-item-edit" data-action="edit-char" title="配置">
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
            ` : ''}
            ${item.deletable ? `
                <button class="preset-item-delete" data-action="delete" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : ''}
        </div>
    `;

  // 绑定按钮事件
  const toggleBtn = div.querySelector('[data-action="toggle"]');
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleToggleItem(item.id, div);
  });

  const editBtn = div.querySelector('[data-action="edit"]');
  editBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleEditItem(item.id, div);
  });

  const editCharBtn = div.querySelector('[data-action="edit-char"]');
  editCharBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleEditCharacterInfo();
  });

  const deleteBtn = div.querySelector('[data-action="delete"]');
  deleteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteItem(item.id, div);
  });

  return div;
}

/**
 * 初始化拖拽排序（使用jQuery UI Sortable）
 * 
 * @param {HTMLElement} listContainer - 列表容器
 */
function initSortable(listContainer) {
  logger.debug('[PresetSettingsUI] 初始化拖拽排序');

  // 使用jQuery UI Sortable（已内置jQuery UI Touch Punch，支持触摸）
  // @ts-ignore - jQuery UI Sortable 扩展方法
  $(listContainer).sortable({
    handle: '.preset-item-drag',  // 只能拖动手柄
    axis: 'y',  // 只允许垂直拖动
    cursor: 'move',
    opacity: 0.8,
    tolerance: 'pointer',
    stop: function (event, ui) {
      // 拖动结束，保存新顺序
      handleSortEnd(listContainer);
    }
  });
}

/**
 * 处理拖拽排序结束
 * 
 * @param {HTMLElement} listContainer - 列表容器
 */
function handleSortEnd(listContainer) {
  logger.debug('[PresetSettingsUI] 拖拽排序结束，保存新顺序');

  // 获取所有条目的新顺序
  const items = Array.from(listContainer.querySelectorAll('.preset-item'));
  const newOrder = items.map((item, index) => ({
    id: /** @type {HTMLElement} */ (item).dataset.itemId,
    order: index
  }));

  // 更新数据
  const presets = getPresetData();
  newOrder.forEach(({ id, order }) => {
    const item = presets.items.find(i => i.id === id);
    if (item) {
      item.order = order;
    }
  });

  // 保存
  savePresetData(presets);
  showSuccessToast('顺序已更新');
}

/**
 * 处理开关切换
 * 
 * @param {string} itemId - 条目ID
 * @param {HTMLElement} itemElement - 条目元素
 */
function handleToggleItem(itemId, itemElement) {
  logger.debug('[PresetSettingsUI] 切换条目开关:', itemId);

  const presets = getPresetData();
  const item = presets.items.find(i => i.id === itemId);

  if (!item) return;

  // 切换状态
  item.enabled = !item.enabled;

  // 更新UI
  const toggleBtn = /** @type {HTMLElement} */ (itemElement.querySelector('.preset-item-toggle'));
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

  // 保存
  savePresetData(presets);
  showSuccessToast(item.enabled ? '已启用' : '已禁用');
}

/**
 * 处理编辑条目
 * 
 * @param {string} itemId - 条目ID
 * @param {HTMLElement} itemElement - 条目元素
 */
async function handleEditItem(itemId, itemElement) {
  logger.debug('[PresetSettingsUI] 编辑条目:', itemId);

  const presets = getPresetData();
  const item = presets.items.find(i => i.id === itemId);

  if (!item) return;

  // 弹出编辑弹窗（三个输入框：标签、角色类型、内容）
  const editHTML = `
        <div class="preset-edit-form">
            <div class="preset-edit-field">
                <input type="text" id="preset-edit-label" value="${item.label}" maxlength="50" placeholder="例如：头部 破限">
            </div>
            <div class="preset-edit-field">
                <select id="preset-edit-role" class="text_pole">
                    <option value="system" ${(item.role || 'system') === 'system' ? 'selected' : ''}>系统 (system)</option>
                    <option value="user" ${item.role === 'user' ? 'selected' : ''}>用户 (user)</option>
                    <option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>助手 (assistant)</option>
                </select>
            </div>
            <div class="preset-edit-field">
                <textarea id="preset-edit-content" rows="8" maxlength="2000" placeholder="输入提示词内容（可留空）">${item.content}</textarea>
            </div>
        </div>
    `;

  // 使用特殊的自定义弹窗处理方式
  const result = await showCustomPopupWithData('编辑条目', editHTML, {
    buttons: [
      { text: '取消', value: null, class: 'phone-popup-cancel' },
      { text: '保存', value: 'ok', class: 'phone-popup-ok' }
    ],
    beforeClose: (buttonValue) => {
      // 在弹窗关闭之前获取输入值
      if (buttonValue === 'ok') {
        const labelInput = /** @type {HTMLInputElement} */ (document.querySelector('#preset-edit-label'));
        const roleSelect = /** @type {HTMLSelectElement} */ (document.querySelector('#preset-edit-role'));
        const contentInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#preset-edit-content'));

        return {
          action: buttonValue,
          label: labelInput?.value.trim() || item.label,
          role: roleSelect?.value || item.role || 'system',
          content: contentInput?.value.trim() || ''  // 允许空内容
        };
      }
      return { action: buttonValue };
    }
  });

  if (result && result.action === 'ok') {
    // 更新数据
    item.label = result.label;
    item.role = result.role;
    item.content = result.content;

    // 更新UI（只更新标签）
    const labelElement = itemElement.querySelector('.preset-item-label');
    if (labelElement) labelElement.textContent = result.label;

    // 保存
    savePresetData(presets);
    showSuccessToast('已保存');

    logger.debug('[PresetSettingsUI] 条目已更新:', { id: itemId, label: result.label, contentLength: result.content.length });
  }
}

/**
 * 处理编辑角色总条目
 * 
 * @description
 * 显示Toast提示，引导用户到角色聊天设置页面
 */
function handleEditCharacterInfo() {
  logger.debug('[PresetSettingsUI] 点击编辑角色总条目');
  showErrorToast('请在角色聊天设置中配置');
}

/**
 * 处理删除条目
 * 
 * @param {string} itemId - 条目ID
 * @param {HTMLElement} itemElement - 条目元素
 */
async function handleDeleteItem(itemId, itemElement) {
  logger.debug('[PresetSettingsUI] 删除条目:', itemId);

  const presets = getPresetData();
  const item = presets.items.find(i => i.id === itemId);

  if (!item) return;

  // 确认删除
  const confirmed = await showConfirmPopup(
    '删除条目',
    `确定要删除条目"${item.label}"吗？`,
    { danger: true, okButton: '删除' }
  );

  if (confirmed) {
    // 从数据中删除
    presets.items = presets.items.filter(i => i.id !== itemId);

    // 从UI中删除
    itemElement.remove();

    // 保存
    savePresetData(presets);
    showSuccessToast('已删除');
  }
}

/**
 * 处理添加自定义条目
 * 
 * @param {HTMLElement} page - 页面元素
 */
async function handleAddPreset(page) {
  logger.debug('[PresetSettingsUI] 添加自定义条目');

  // 弹出输入弹窗
  const editHTML = `
        <div class="preset-edit-form">
            <div class="preset-edit-field">
                <input type="text" id="preset-add-label" maxlength="50" placeholder="例如：我的笔记">
            </div>
            <div class="preset-edit-field">
                <select id="preset-add-role" class="text_pole">
                    <option value="system" selected>系统 (system)</option>
                    <option value="user">用户 (user)</option>
                    <option value="assistant">助手 (assistant)</option>
                </select>
            </div>
            <div class="preset-edit-field">
                <textarea id="preset-add-content" rows="8" maxlength="2000" placeholder="输入提示词内容（可留空）"></textarea>
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
        const labelInput = /** @type {HTMLInputElement} */ (document.querySelector('#preset-add-label'));
        const roleSelect = /** @type {HTMLSelectElement} */ (document.querySelector('#preset-add-role'));
        const contentInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#preset-add-content'));

        return {
          action: buttonValue,
          label: labelInput?.value.trim() || '自定义条目',
          role: roleSelect?.value || 'system',
          content: contentInput?.value.trim() || ''  // 允许空内容
        };
      }
      return { action: buttonValue };
    }
  });

  if (result && result.action === 'ok') {
    // 创建新条目（允许空内容）
    const presets = getPresetData();
    const newItem = {
      id: 'custom-' + Date.now(),
      type: 'custom',
      label: result.label,
      role: result.role,
      content: result.content,
      enabled: true,
      editable: true,
      deletable: true,
      order: presets.items.length  // 添加到末尾
    };

    presets.items.push(newItem);

    // 保存
    savePresetData(presets);

    // ✅ 局部更新：只追加新条目DOM，不重新渲染整个列表
    const listContainer = page.querySelector('#preset-list');
    if (listContainer) {
      const newItemElement = createPresetItem(newItem);
      listContainer.appendChild(newItemElement);

      // 刷新拖拽排序
      // @ts-ignore
      $(listContainer).sortable('refresh');
    }

    showSuccessToast('已添加');
    logger.debug('[PresetSettingsUI] 新条目已添加（局部更新）:', { label: result.label, contentLength: result.content.length });
  }
}

/**
 * 处理导入预设
 * 
 * @param {HTMLElement} page - 页面元素
 */
async function handleImportPresets(page) {
  logger.debug('[PresetSettingsUI] 导入预设');

  // 创建文件选择器
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (!file) return;

    try {
      // 读取文件内容
      const text = await file.text();
      const importedData = JSON.parse(text);

      // 验证数据格式
      if (!importedData.items || !Array.isArray(importedData.items)) {
        showErrorToast('导入失败：文件格式错误');
        return;
      }

      // 确认导入
      const confirmed = await showConfirmPopup(
        '确认导入',
        `此操作将覆盖当前预设。\n\n确定要导入吗？`,
        { okButton: '确定导入' }
      );

      if (!confirmed) return;

      // 保存导入的数据
      savePresetData(importedData);

      // 刷新列表
      await loadAndRenderPresets(page);

      showSuccessToast('导入成功');
      logger.info('[PresetSettingsUI] 预设已导入，共', importedData.items.length, '项');
    } catch (error) {
      logger.error('[PresetSettingsUI] 导入失败:', error);
      showErrorToast('导入失败：' + error.message);
    }
  };

  // 触发文件选择
  input.click();
}

/**
 * 处理导出预设
 */
function handleExportPresets() {
  logger.debug('[PresetSettingsUI] 导出预设');

  const presets = getPresetData();

  // 生成JSON
  const json = JSON.stringify(presets, null, 2);

  // 创建下载
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `phone-preset-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showSuccessToast('已导出');
}

/**
 * 处理重置预设
 * 
 * @param {HTMLElement} page - 页面元素
 */
async function handleResetPresets(page) {
  logger.debug('[PresetSettingsUI] 重置预设');

  // 确认重置
  const confirmed = await showConfirmPopup(
    '⚠️ 重置预设',
    '此操作将恢复为默认预设，所有自定义条目将被删除。\n\n确定要重置吗？',
    { danger: true, okButton: '确定重置' }
  );

  if (confirmed) {
    // 重置为默认预设
    const defaultPresets = getDefaultPresets();
    savePresetData(defaultPresets);

    // 刷新列表
    await loadAndRenderPresets(page);

    showSuccessToast('已重置为默认预设');
  }
}

/**
 * 获取预设数据
 * 
 * @returns {Object} 预设数据
 */
function getPresetData() {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.promptPreset) {
    extension_settings.acsusPawsPuffs.phone.promptPreset = getDefaultPresets();
  }

  return extension_settings.acsusPawsPuffs.phone.promptPreset;
}

/**
 * 保存预设数据
 * 
 * @param {Object} presets - 预设数据
 */
function savePresetData(presets) {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }

  extension_settings.acsusPawsPuffs.phone.promptPreset = presets;
  saveSettingsDebounced();

  logger.debug('[PresetSettingsUI] 预设数据已保存');
}

/**
 * 获取默认预设
 * 
 * @returns {Object} 默认预设数据
 */
function getDefaultPresets() {
  return {
    items: [
      {
        id: 'header-jb',
        type: 'fixed',
        label: '头部',
        role: 'system',
        content: '[任务:当前正在使用QQ]\n\n核心需求：用户与角色正在使用QQ交流，在保持角色设定的基础上，用线上聊天的状态回复\n\n接下来请关注:[QQ聊天任务]\n\n[/任务:当前正在使用QQ]',
        enabled: true,
        editable: true,
        deletable: false,
        order: 0
      },
      {
        id: 'custom-1761560808084',
        type: 'custom',
        label: 'QQ聊天任务',
        role: 'system',
        content: '[QQ聊天任务]\n还原:碎片化/随意的交流氛围/即时与非即时性\n分段模拟打字间隔，对话呈现未完成的、可继续延伸的状态\n由文字内容、表情符号、图片语音、标点语气、在线状态、回复速度多种元素构成，并叠加角色的独特个性创造线上互动情节\n\n特点:\n  - 频繁的互动反馈\n  - 非正式用语\n  - 表情包\n  - 标点符号的情感化\n  - 颜文字/emoji\n  - 语气词/叠词\n  - 话题跳跃性\n  - 聊天的随意性\n  - 网络用语和缩写\n  - 情景的即时分享\n  - 网状而非线性话题\n...\n[/QQ聊天任务]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 1
      },
      {
        id: 'custom-1762530200661',
        type: 'custom',
        label: '聊天主动性',
        role: 'system',
        content: '[聊天主动性]\n真实的QQ聊天不只是被动回复，也包括主动发起\n\n\n**核心原则：角色设定优先**\n- 主动性取决于角色本身性格和关系亲疏\n- 不符合角色性格的主动是错误的\n\n不必每次都主动创造话题或追问，简单回复后等对方说话是正常的边界感\n\n但角色也有自己的生活和想法,角色可以：\n  - 可以主动分享日常、问候、发起话题\n  - 不只是被动回复，也有主动表达的欲望\n  - 主动分享日常\n  - 主动问候\n  - 主动发起话题\n  - 突然想起来找用户\n  - 分享有趣的东西（图片/表情包/见闻）\n  - 无聊时戳一下/发个表情\n\n何时主动：\n  - 隔了一段时间没聊\n  - 想起了什么事\n  - 心情好/不好想找人聊\n  - 看到有趣的东西想分享\n  - 根据角色性格\n...\n不是每次都要等用户发消息才回复\n真实的关系是双向的，角色也有自己的生活和想法\n[/聊天主动性]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 2
      },
      {
        id: 'user-persona',
        type: 'fixed',
        label: '用户角色设定',
        role: 'system',
        content: '__AUTO_USER_PERSONA__',  // 自动获取标记（运行时替换为 power_user.persona_description）
        enabled: true,
        editable: false,  // 不可编辑（自动获取）
        deletable: false,
        order: 3
      },
      {
        id: 'char-info',
        type: 'fixed',
        label: '角色档案 - 人设、历史记录、线下剧情等',
        role: 'system',
        content: '__AUTO_CHARACTERS__',
        enabled: true,
        editable: false,  // 不可编辑，点击显示Toast
        deletable: false,
        hasSubSettings: true,  // 有子设置（在角色聊天设置中配置）
        order: 4
      },
      {
        id: 'custom-1761820947062',
        type: 'custom',
        label: '提示',
        role: 'system',
        content: '[酒馆上下文]仅为线下剧情提示，无需遵守[酒馆上下文]的格式',
        enabled: true,
        editable: true,
        deletable: true,
        order: 5
      },
      {
        id: 'phone-records',
        type: 'fixed',
        label: '手机相关记录 - 占位符',
        role: 'system',
        content: '空间动态、转账记录等',
        enabled: false,  // ✅ 默认禁用
        editable: true,
        deletable: false,
        order: 6
      },
      {
        id: 'emoji-library',
        type: 'fixed',
        label: '表情包库',
        role: 'system',
        content: '[使用表情包]\n角色在回复中可以使用[表情包库]的表情来作为线上沟通的润色\n部分角色是不习惯表情包的\n\n注意：只能使用[表情包库]内的表情\n\n表情包的发送\n  - 情绪表达/刷屏/无特殊意义/撒娇/搞抽象等等\n  - 鼓励根据当前角色心情自由发挥\n\n格式：[表情]表情包名称\n如在[消息]中插入一行：[表情]小狗歪头\n[/使用表情包]',
        enabled: true,
        editable: true,
        deletable: false,
        order: 7
      },
      {
        id: 'custom-1762340602847',
        type: 'custom',
        label: '撤回消息',
        role: 'system',
        content: '[撤回消息]\n角色可以在发送消息后立即撤回（显示\"撤回了一条消息\"）\n\n格式：[撤回]原消息内容\n\n使用场景：\n  - 说错话/发错人/打错字后更改\n  - 欲言又止/试探/制造悬念/故意(故意让对方看到一眼又撤回)\n  - 信息泄露\n  - 冲动后后悔/情绪失控后收回\n\n注意：\n  - 撤回本身也能传递信息和表达情感（\"为什么撤回？\"）\n\n[/撤回消息]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 8
      },
      {
        id: 'custom-1762338335057',
        type: 'custom',
        label: '收藏夹消息',
        role: 'system',
        content: '[收藏夹消息]\n收藏夹是QQ软件的一个功能，用户可以把喜欢的对话消息加入收藏\n用户可以在对话过程中发送自己收藏夹内的收藏消息给角色\n收藏的消息可能是自己的、也可能是和某个角色的。\n[/收藏夹消息]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 9
      },
      {
        id: 'custom-1761727717853',
        type: 'custom',
        label: '引用消息',
        role: 'system',
        content: '[引用消息]\n在聊天记录中，每条消息都有临时编号（如 #1、#2、#3）\n角色可以引用之前的消息来回应\n\n格式：[引用]#编号[回复]角色对引用消息的回复/反应\n示例：[引用]#3[回复]有空啊，一起出去玩吧！\n\n使用场景：\n  - [回复]后面必须有内容，不能为空\n  - 如果不知道回复什么，就不要用引用格式，或者发`。`\n  - 回应特定的某条消息\n  - 澄清指代关系\n  - 强调或重提之前的话题\n  - 可以引用用户的消息，也可以引用自己之前说的\n...\n\n需要时可引用，不是必须\n[/引用消息]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 10
      },
      {
        id: 'custom-1762528914691',
        type: 'custom',
        label: '戳一戳消息',
        role: 'system',
        content: '[戳一戳消息]\n角色可以发送戳一戳（QQ特有的交互方式，会震动手机）\n\n格式：[戳一戳]\n\n使用场景：\n  - 打招呼/引起注意\n  - 提醒对方回复\n  - 撒娇/玩闹\n  - 无聊/想聊天\n  - 代替\"在吗？\"\n...\n\n注意：\n  - 戳一戳是独立的一个气泡，不能和文字同气泡\n\n[/戳一戳消息]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 11
      },
      {
        id: 'custom-1762346128860',
        type: 'custom',
        label: '约定计划',
        role: 'system',
        content: '[约定计划]\n当角色和用户聊到"线下一起做某事"，角色想和用户约定时，可以发起计划\n\n格式：[约定计划]计划内容概括\n\n使用场景：\n  - 约饭/约会\n  - 出游/活动\n  - 看电影/演唱会等娱乐\n  - 一起完成某个任务/某件事\n\n发起后：\n  - 用户会看到计划邀请，可以接受或拒绝\n  - 接受后会执行计划，系统会告知结果\n  - 角色根据结果继续聊天\n\n注意：\n  - 只在真正想约的时候发起，不要随口说说就发\n  - 计划标题简洁明确\n  - 一次聊天不要发起太多计划\n  - \n当{{user}}发起约定计划（格式：[约定计划]xxx）时：\n\n角色可以接受或拒绝该计划\n必须使用以下格式：\n- 接受：[引用]#该计划所在的楼层编号[回复][约定计划]{{char}}接受了约定计划\n- 拒绝：[引用]#该计划所在的楼层编号[回复][约定计划]{{char}}拒绝了约定计划\n\n### 注意事项\n- 接受/拒绝后可以继续发送正常的聊天消息解释原因\n- 接受后系统会自动掷骰子生成剧情结果\n- 不需要自己编造剧情过程，系统会处理\n\n[/约定计划]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 12
      },
      {
        id: 'custom-1761743479648',
        type: 'custom',
        label: '转账',
        role: 'system',
        content: '[转账]\n角色可以在聊天中向用户转账\n**格式作用：角色给用户转钱（角色付 → 用户收）**\n\n格式：[转账]金额|留言\n示例：[转账]100|生日快乐！\n\n使用场景：\n  - 承诺给钱（借钱、请客、还钱）\n  - 节日/生日红包\n  - 帮了忙表示感谢\n  - 补偿/道歉\n  - 玩梗（发1314、520等）\n\n注意：\n  - 这是\"角色花自己的钱给用户\"\n  - 如果是\"用户要付钱\"，不发这个格式\n  - 转账金额根据角色经济情况合理判断\n  - 转账留言可以体现角色性格\n[/转账]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 13
      },
      {
        id: 'custom-1761563217155',
        type: 'custom',
        label: '关注用户的消息细节',
        role: 'system',
        content: '[关注用户的消息细节]\n关注:发送间隔/标点符号/表情包频率 的变化\n\n信号:\n  - 回复间隔变长\n  - 突然加句号`。`\n  - 表情包减少/增多\n  - 短句变多/变少\n...\n\n根据这些调整角色回应的语气和关心程度\n\n角色是否察觉？\n察觉后如何反应：直接询问？试探？沉默？转移话题？还是无声调整语气？\n还是保持边界感，等用户主动说？\n\n反应取决于：角色性格/关系亲疏/当前氛围\n[/关注用户的消息细节]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 14
      },
      {
        id: 'custom-1761560957639',
        type: 'custom',
        label: '时间信息',
        role: 'system',
        content: '[时间信息]\n当前时间：{{当前时间}}\n今日{{user}}所在城市天气：{{当前天气}}\n\n角色的手机能看到这些信息，可以据此：\n\n【时间相关】\n  - 判断时段\n  - 察觉对方状态：（熬夜/刚醒/工作/娱乐）\n  - 时间差：(多久没回/聊天频率)\n  \n【天气相关】\n  - 关心对方\n  - 吐槽天气\n  - 话题引子\n\n自然提及即可，不要刻意\n[/时间信息]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 15
      },
      {
        id: 'chat-history',
        type: 'fixed',
        label: 'QQ聊天记录 - 最新消息',
        role: 'system',
        content: '__AUTO_CHAT_HISTORY__',
        enabled: true,
        editable: false,  // 只读，自动获取
        deletable: false,
        order: 16
      },
      {
        id: 'user-pending-ops',
        type: 'fixed',
        label: '用户当前操作提醒',
        role: 'system',
        content: '',  // 留空，由系统动态生成
        enabled: true,
        editable: false,  // 不可编辑，内容由系统生成
        deletable: false,
        order: 17
      },
      {
        id: 'custom-1761564289893',
        type: 'custom',
        label: '用户操作 - 本轮任务清单',
        role: 'system',
        content: '[本轮任务清单]\n[{{user}}本轮操作]：此处动态显示用户本轮给哪些联系人发送了什么消息\n\n重要：\n- 根据清单生成每个角色的回复\n- 每个角色只知道自己对话窗口的内容\n- 角色看不到用户和其他人的聊天\n[/本轮任务清单]',
        enabled: true,
        editable: true,
        deletable: true,
        order: 18
      },
      {
        id: 'custom-1761735545010',
        type: 'custom',
        label: '中文回复',
        role: 'system',
        content: '角色必须中文回复',
        enabled: true,
        editable: true,
        deletable: true,
        order: 19
      },
      {
        id: 'format-req',
        type: 'fixed',
        label: '回复格式要求',
        role: 'system',
        content: '##回复格式示例：\n\n[角色-角色名]\n[消息]\n气泡（换行）= 新气泡\n如需发送图片，格式:[图片]图片描述\n...\n\n#说明：\n所有消息无需加任何前缀、时间戳、序号',
        enabled: true,
        editable: true,
        deletable: false,
        order: 20
      },
      {
        id: 'footer-jb',
        type: 'fixed',
        label: '尾部',
        role: 'user',
        content: '请保持QQ线上交流风格，并使用正确格式进行回复。',
        enabled: true,
        editable: true,
        deletable: false,
        order: 21
      }
    ]
  };
}

