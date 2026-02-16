/**
 * 聊天工具 - 消息折叠功能
 *
 * @description
 * 实现聊天消息的折叠功能：
 * - 在消息操作菜单中添加折叠按钮
 * - 折叠后显示可编辑标题的折叠栏
 * - 支持展开/收起原始消息内容
 * - 支持删除折叠栏还原消息
 */

// ========================================
// 导入
// ========================================

import { extension_settings, getContext } from '../../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../../script.js';
import logger from '../logger.js';

// ========================================
// 常量定义
// ========================================

const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'chatTools';

// 存储键名
const STORAGE_KEYS = {
  enabled: 'chatTools.fold.enabled',
  allowUser: 'chatTools.fold.allowUser',
  allowAI: 'chatTools.fold.allowAI',
  presets: 'chatTools.fold.presets',
  foldedMessages: 'chatTools.fold.foldedMessages'
};

// ========================================
// 状态管理
// ========================================

/** @type {Object<string, {title: string, isCollapsed: boolean}>} */
let foldedMessages = {};

/** @type {boolean} */
let isEnabled = false;

/** @type {boolean} */
let allowFoldUser = true;

/** @type {boolean} */
let allowFoldAI = true;

/** @type {string[]} */
let quickPresets = [];

/** @type {boolean} 是否已绑定全局点击事件 */
let globalClickBound = false;

// ========================================
// 工具函数
// ========================================

/**
 * 获取设置值
 * @param {string} key - 设置键
 * @param {any} defaultValue - 默认值
 * @returns {any}
 */
function getSetting(key, defaultValue = null) {
  const keys = key.split('.');
  let value = extension_settings[EXT_ID];
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      return defaultValue;
    }
  }
  return value !== undefined ? value : defaultValue;
}

/**
 * 保存设置值
 * @param {string} key - 设置键
 * @param {any} value - 要保存的值
 */
function saveSetting(key, value) {
  const keys = key.split('.');
  let obj = extension_settings[EXT_ID];
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]]) {
      obj[keys[i]] = {};
    }
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;
  saveSettingsDebounced();
}

/**
 * 获取折叠消息的存储
 * @returns {Object<string, {title: string, isCollapsed: boolean}>}
 */
function getFoldedMessages() {
  return getSetting(STORAGE_KEYS.foldedMessages, {});
}

/**
 * 保存折叠消息的存储
 */
function saveFoldedMessages() {
  saveSetting(STORAGE_KEYS.foldedMessages, foldedMessages);
}

// ========================================
// 核心功能
// ========================================

/**
 * 检查是否允许折叠该消息
 * @param {HTMLElement} mesElement - 消息元素
 * @returns {boolean}
 */
function canFoldMessage(mesElement) {
  const isUser = mesElement.getAttribute('is_user') === 'true';

  if (isUser && !allowFoldUser) return false;
  if (!isUser && !allowFoldAI) return false;

  return true;
}

/**
 * 获取消息的 ID
 * @param {HTMLElement} mesElement - 消息元素
 * @returns {string|null}
 */
function getMessageId(mesElement) {
  return mesElement.getAttribute('mesid');
}

/**
 * 获取折叠栏的 HTML
 * @param {string} mesId - 消息ID
 * @param {string} title - 折叠标题
 * @param {boolean} isCollapsed - 是否收起
 * @returns {string}
 */
function createFoldedBarHTML(mesId, title, isCollapsed) {
  // 如果没有标题，显示默认文字
  const displayTitle = title || '点击编辑标题...';
  // 箭头图标：收起状态显示向下，展开状态显示向上
  const arrowClass = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
  const arrowTitle = isCollapsed ? '展开' : '收起';
  return `
        <div class="chat-tools-fold-bar" data-mesid="${mesId}">
            <div class="chat-tools-fold-header">
                <button class="chat-tools-fold-btn chat-tools-fold-preview"
                    data-mesid="${mesId}"
                    title="${arrowTitle}">
                    <i class="fa-solid ${arrowClass}"></i>
                </button>
                <span class="chat-tools-fold-title">${displayTitle}</span>
                <div class="chat-tools-fold-edit-area" style="display: none;">
                    <input type="text" class="chat-tools-fold-title-input"
                        placeholder="输入标题..."
                        value="${title || ''}"
                        data-mesid="${mesId}">
                    <button class="chat-tools-fold-btn chat-tools-fold-preset-toggle"
                        data-mesid="${mesId}"
                        title="选择预设">
                        <i class="fa-solid fa-list-ul"></i>
                    </button>
                    <button class="chat-tools-fold-btn chat-tools-fold-confirm"
                        data-mesid="${mesId}"
                        title="确认">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
                <div class="chat-tools-fold-actions">
                    <button class="chat-tools-fold-btn chat-tools-fold-edit"
                        data-mesid="${mesId}"
                        title="编辑标题">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="chat-tools-fold-btn chat-tools-fold-delete"
                        data-mesid="${mesId}"
                        title="删除折叠栏">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <!-- 预设选择下拉 -->
            <div class="chat-tools-fold-preset-dropdown" data-mesid="${mesId}" style="display: none;">
                <div class="chat-tools-fold-preset-list">
                    <!-- 预设选项会在这里动态生成 -->
                </div>
            </div>
        </div>
    `;
}

/**
 * 折叠消息
 * @param {string} mesId - 消息ID
 * @param {HTMLElement} mesElement - 消息元素
 */
function foldMessage(mesId, mesElement) {
  logger.info('chatTools', '[Fold] 折叠消息:', mesId);

  // 防重复检查：如果已经折叠，直接返回
  if (foldedMessages[mesId]) {
    logger.warn('chatTools', '[Fold] 消息已折叠，跳过');
    return;
  }

  // 防重复检查：DOM 中是否已存在折叠栏
  const existingFoldBar = document.querySelector(`.chat-tools-fold-bar[data-mesid="${mesId}"]`);
  if (existingFoldBar) {
    logger.warn('chatTools', '[Fold] DOM中已存在折叠栏，跳过');
    return;
  }

  // 创建折叠栏
  const foldBar = document.createElement('div');
  foldBar.className = 'chat-tools-fold-wrapper';
  foldBar.innerHTML = createFoldedBarHTML(mesId, '', false);

  // 获取折叠栏元素
  const foldBarElement = /** @type {HTMLElement} */ (foldBar.firstElementChild);

  // 隐藏原始消息（用 display: none 不占据空间）
  mesElement.style.display = 'none';
  mesElement.classList.add('chat-tools-folded');

  // 在原始消息位置插入折叠栏
  mesElement.parentNode.insertBefore(foldBarElement, mesElement.nextSibling);

  // 保存折叠状态（默认是收起状态，因为消息已被隐藏）
  foldedMessages[mesId] = {
    title: '',
    isCollapsed: true
  };
  saveFoldedMessages();

  // 绑定折叠栏事件
  bindFoldBarEvents(foldBarElement);
}

/**
 * 展开/收起折叠栏
 * @param {string} mesId - 消息ID
 */
function toggleFold(mesId) {
  const foldBar = document.querySelector(`.chat-tools-fold-bar[data-mesid="${mesId}"]`);
  const originalMes = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${mesId}"]`));
  if (!foldBar || !originalMes) return;

  const toggleBtn = /** @type {HTMLElement} */ (foldBar.querySelector('.chat-tools-fold-toggle'));
  const isCollapsed = foldedMessages[mesId]?.isCollapsed ?? false;

  if (isCollapsed) {
    // 展开 - 显示原始消息
    originalMes.style.display = '';
    toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    toggleBtn.title = '收起';
    foldedMessages[mesId].isCollapsed = false;
  } else {
    // 收起 - 隐藏原始消息
    originalMes.style.display = 'none';
    toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    toggleBtn.title = '展开';
    foldedMessages[mesId].isCollapsed = true;
  }

  saveFoldedMessages();
  logger.debug('chatTools', '[Fold] 切换折叠状态:', mesId, isCollapsed ? '收起' : '展开');
}

/**
 * 删除折叠栏，还原消息
 * @param {string} mesId - 消息ID
 */
function deleteFold(mesId) {
  logger.info('chatTools', '[Fold] ========== 删除折叠栏开始 ==========');
  logger.info('chatTools', '[Fold] 删除折叠栏, mesId:', mesId);

  const foldBar = document.querySelector(`.chat-tools-fold-bar[data-mesid="${mesId}"]`);
  const originalMes = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${mesId}"]`));

  logger.info('chatTools', '[Fold] 找到折叠栏:', !!foldBar);
  logger.info('chatTools', '[Fold] 找到原始消息:', !!originalMes);

  if (!foldBar) {
    logger.warn('chatTools', '[Fold] 未找到折叠栏元素');
    return;
  }

  // 删除折叠栏
  foldBar.remove();
  logger.info('chatTools', '[Fold] 折叠栏已从DOM中移除');

  // 显示原始消息
  if (originalMes) {
    originalMes.style.display = '';
    originalMes.classList.remove('chat-tools-folded');
    // 移除 chat-tools-processed 类，这样 scanAllMessages 再次运行时按钮会重新出现
    originalMes.classList.remove('chat-tools-processed');
    logger.info('chatTools', '[Fold] 原始消息样式已恢复');
  } else {
    logger.warn('chatTools', '[Fold] 未找到原始消息元素');
  }

  // 删除折叠状态
  logger.info('chatTools', '[Fold] 删除前 foldedMessages 状态:', Object.keys(foldedMessages));
  delete foldedMessages[mesId];
  logger.info('chatTools', '[Fold] 删除后 foldedMessages 状态:', Object.keys(foldedMessages));
  saveFoldedMessages();
  logger.info('chatTools', '[Fold] ========== 删除折叠栏完成 ==========');
}

/**
 * 更新折叠栏标题
 * @param {string} mesId - 消息ID
 * @param {string} title - 新标题
 */
function updateFoldTitle(mesId, title) {
  if (foldedMessages[mesId]) {
    foldedMessages[mesId].title = title;
    saveFoldedMessages();
  }
}

// ========================================
// 事件绑定
// ========================================

/**
 * 预览/收起折叠栏中的消息
 * @param {string} mesId - 消息ID
 */
function togglePreview(mesId) {
  const foldBar = document.querySelector(`.chat-tools-fold-bar[data-mesid="${mesId}"]`);
  const originalMes = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${mesId}"]`));
  if (!foldBar || !originalMes) return;

  // 获取当前状态（从存储中读取，因为可能有多个折叠栏）
  const storedData = foldedMessages[mesId];
  const isPreviewShown = storedData ? !storedData.isCollapsed : false;

  const previewBtn = /** @type {HTMLElement} */ (foldBar.querySelector('.chat-tools-fold-preview'));

  if (isPreviewShown) {
    // 收起 - 隐藏原始消息
    originalMes.style.display = 'none';
    previewBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
    previewBtn.title = '展开';
    if (storedData) {
      storedData.isCollapsed = true;
    }
  } else {
    // 预览 - 显示原始消息
    originalMes.style.display = '';
    previewBtn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
    previewBtn.title = '收起';
    if (storedData) {
      storedData.isCollapsed = false;
    }
  }

  saveFoldedMessages();
  logger.debug('chatTools', '[Fold] 切换预览状态:', mesId, isPreviewShown ? '收起' : '展开');
}

/**
 * 渲染预设下拉列表
 * @param {HTMLElement} presetList - 预设列表容器
 * @param {string} mesId - 消息ID
 * @param {HTMLInputElement} titleInput - 标题输入框
 */
function renderPresetDropdown(presetList, mesId, titleInput) {
  presetList.innerHTML = '';

  if (quickPresets.length === 0) {
    presetList.innerHTML = '<div class="chat-tools-fold-preset-empty">暂无预设，请在设置中添加</div>';
    return;
  }

  quickPresets.forEach((preset) => {
    const item = document.createElement('div');
    item.className = 'chat-tools-fold-preset-item';
    item.dataset.preset = preset;
    item.dataset.mesid = mesId;
    item.textContent = preset;
    presetList.appendChild(item);
  });
}

/**
 * 绑定折叠栏的事件
 * @param {HTMLElement} foldBarElement - 折叠栏元素
 */
function bindFoldBarEvents(foldBarElement) {
  const titleSpan = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-title'));
  const editArea = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-edit-area'));
  const titleInput = /** @type {HTMLInputElement} */ (foldBarElement.querySelector('.chat-tools-fold-title-input'));

  // 预览按钮 - 显示/收起消息内容（但折叠栏仍然存在）
  const previewBtn = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-preview'));
  previewBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const mesId = previewBtn.dataset.mesid;
    if (mesId) {
      togglePreview(mesId);
    }
  });

  // 铅笔按钮 - 显示编辑区域
  const editBtn = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-edit'));
  editBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    // 显示编辑区域，隐藏标题
    titleSpan.style.display = 'none';
    editArea.style.display = 'flex';
    // 聚焦输入框
    titleInput.focus();
  });

  // 确认按钮 - 保存标题并隐藏编辑区域
  const confirmBtn = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-confirm'));
  confirmBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const mesId = confirmBtn.dataset.mesid;
    const newTitle = titleInput.value;
    // 更新标题
    updateFoldTitle(mesId, newTitle);
    // 更新显示的标题
    titleSpan.textContent = newTitle || '点击编辑标题...';
    // 隐藏编辑区域，显示标题
    editArea.style.display = 'none';
    titleSpan.style.display = '';
    // 隐藏预设下拉
    const dropdown = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-preset-dropdown'));
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  });

  // 预设按钮 - 显示/隐藏预设下拉
  const presetToggleBtn = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-preset-toggle'));
  const presetDropdown = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-preset-dropdown'));
  const presetList = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-preset-list'));

  presetToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const mesId = presetToggleBtn.dataset.mesid;
    const isVisible = presetDropdown.style.display !== 'none';

    if (isVisible) {
      // 隐藏下拉
      presetDropdown.style.display = 'none';
    } else {
      // 显示下拉，先渲染预设列表
      renderPresetDropdown(presetList, mesId, titleInput);
      presetDropdown.style.display = 'block';
    }
  });

  // 预设选项点击 - 选择预设标题
  presetList?.addEventListener('click', (e) => {
    const presetItem = /** @type {HTMLElement} */ (e.target).closest('.chat-tools-fold-preset-item');
    if (presetItem) {
      e.stopPropagation();
      const presetTitle = /** @type {HTMLElement} */ (presetItem).dataset.preset;
      const mesId = /** @type {HTMLElement} */ (presetItem).dataset.mesid;
      // 设置输入框的值
      titleInput.value = presetTitle || '';
      // 隐藏下拉
      presetDropdown.style.display = 'none';
      logger.debug('chatTools', '[Fold] 选择预设标题:', presetTitle);
    }
  });

  // 点击其他地方 - 隐藏预设下拉
  document.addEventListener('click', function hideDropdown(e) {
    if (!foldBarElement.contains(/** @type {HTMLElement} */(e.target))) {
      presetDropdown.style.display = 'none';
    }
  });

  // 输入框回车 - 相当于确认
  titleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      confirmBtn.click();
    }
  });

  // 删除按钮 - 阻止事件冒泡，避免触发消息扫描
  const deleteBtn = /** @type {HTMLElement} */ (foldBarElement.querySelector('.chat-tools-fold-delete'));
  deleteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const mesId = deleteBtn.dataset.mesid;
    deleteFold(mesId);
  });
}

/**
 * 在消息操作菜单中添加折叠按钮
 * @param {HTMLElement} mesElement - 消息元素
 */
function injectFoldButton(mesElement) {
  // 检查是否已处理过
  if (mesElement.classList.contains('chat-tools-processed')) {
    logger.debug('chatTools', '[Fold] 消息已处理过，跳过');
    return;
  }

  const mesId = getMessageId(mesElement);
  if (!mesId) {
    logger.warn('chatTools', '[Fold] 未获取到消息ID');
    return;
  }
  logger.debug('chatTools', '[Fold] 处理消息, mesId:', mesId);

  // 检查是否允许折叠（不检查是否已折叠，始终显示按钮）
  if (!canFoldMessage(mesElement)) {
    logger.debug('chatTools', '[Fold] 不允许折叠此消息');
    return;
  }

  // 查找隐藏菜单容器 .extraMesButtons（和翻译按钮一样）
  const extraButtons = mesElement.querySelector('.extraMesButtons');
  if (!extraButtons) {
    logger.warn('chatTools', '[Fold] 未找到 extraButtons 容器');
    return;
  }
  logger.debug('chatTools', '[Fold] 找到 extraButtons');

  // 检查是否已经有折叠按钮（直接检查容器内是否有）
  const existingBtn = extraButtons.querySelector('.chat-tools-fold-btn');
  if (existingBtn) {
    // 按钮已存在，只需要标记为已处理，避免重复添加
    mesElement.classList.add('chat-tools-processed');
    logger.debug('chatTools', '[Fold] 已有折叠按钮，跳过');
    return;
  }

  // 创建折叠按钮 - 完全和官方按钮一样，只添加自定义类名
  // 使用 fa-folder-open 表示可折叠的状态（和官方的隐藏眼睛图标区分开）
  const foldBtn = document.createElement('div');
  foldBtn.className = 'mes_button chat-tools-fold-btn fa-solid fa-folder-open interactable';
  foldBtn.title = '折叠消息';
  foldBtn.dataset.mesid = mesId;

  // 插入到 extraMesButtons 的第一个位置（和其他官方按钮一样）
  extraButtons.insertBefore(foldBtn, extraButtons.firstChild);

  mesElement.classList.add('chat-tools-processed');
  logger.info('chatTools', '[Fold] 已添加折叠按钮到消息:', mesId);
}

/**
 * 在消息操作菜单中添加折叠选项
 * @param {HTMLElement} mesElement - 消息元素
 * @param {string} mesId - 消息ID
 */
function addFoldOptionToMenu(mesElement, mesId) {
  // 查找操作菜单
  const menu = document.querySelector('.extraMesButtons.active');
  if (!menu) return;

  // 检查是否已经有折叠选项
  if (menu.querySelector('.chat-tools-menu-fold')) return;

  // 创建折叠选项
  const foldOption = document.createElement('div');
  foldOption.className = 'extraMesButton chat-tools-menu-fold';
  foldOption.innerHTML = '<i class="fa-solid fa-folder"></i> 折叠';
  foldOption.addEventListener('click', () => {
    foldMessage(mesId, mesElement);
    // 关闭菜单
    menu.classList.remove('active');
  });

  menu.appendChild(foldOption);
}

/**
 * 扫描并处理所有消息
 * @param {string} [caller] - 调用者标识
 */
function scanAllMessages(caller = 'unknown') {
  if (!isEnabled) return;

  logger.info('chatTools', '[Fold] ========== scanAllMessages 开始 ==========');
  logger.info('chatTools', '[Fold] scanAllMessages 调用者:', caller);
  logger.info('chatTools', '[Fold] isEnabled:', isEnabled);

  const messages = document.querySelectorAll('.mes:not(.chat-tools-processed)');
  logger.info('chatTools', '[Fold] 找到待处理消息数量:', messages.length);

  messages.forEach((mes, index) => {
    const mesId = getMessageId(/** @type {HTMLElement} */(mes));
    logger.debug('chatTools', '[Fold] 扫描消息:', index, 'mesId:', mesId);
    injectFoldButton(/** @type {HTMLElement} */(mes));
  });

  logger.info('chatTools', '[Fold] ========== scanAllMessages 完成 ==========');
}

/**
 * 恢复折叠状态
 */
function restoreFoldedMessages() {
  const stored = getFoldedMessages();
  if (!stored || Object.keys(stored).length === 0) return;

  logger.info('chatTools', '[Fold] 恢复折叠消息:', Object.keys(stored).length);

  for (const [mesId, data] of Object.entries(stored)) {
    const mesElement = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${mesId}"]`));
    if (mesElement) {
      // 消息存在，创建折叠栏
      const foldBar = document.createElement('div');
      foldBar.className = 'chat-tools-fold-wrapper';
      foldBar.innerHTML = createFoldedBarHTML(mesId, data.title, data.isCollapsed);

      const foldBarElement = /** @type {HTMLElement} */ (foldBar.firstElementChild);

      // 根据保存的状态决定隐藏或显示原始消息
      if (data.isCollapsed) {
        mesElement.style.display = 'none';
      } else {
        mesElement.style.display = '';
      }
      mesElement.classList.add('chat-tools-folded');

      // 插入折叠栏
      mesElement.parentNode.insertBefore(foldBarElement, mesElement.nextSibling);

      // 绑定事件
      bindFoldBarEvents(foldBarElement);
    }
  }

  // 同步内存中的状态
  foldedMessages = stored;
}

// ========================================
// 设置项绑定
// ========================================

/**
 * 绑定设置项的事件（在 settings.html 加载后调用）
 */
export function bindFoldSettings() {
  logger.debug('chatTools', '[Fold] 开始绑定设置项');

  // 启用开关
  const enabledCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('chat-tools-fold-enabled'));
  if (enabledCheckbox) {
    logger.debug('chatTools', '[Fold] 找到启用开关元素');
    enabledCheckbox.addEventListener('change', (e) => {
      isEnabled = /** @type {HTMLInputElement} */ (e.target).checked;
      saveSetting(STORAGE_KEYS.enabled, isEnabled);
      logger.info('chatTools', '[Fold] 启用状态已更改:', isEnabled);

      if (isEnabled) {
        scanAllMessages('checkbox-toggle');
      }
    });
    // 初始化状态
    isEnabled = getSetting(STORAGE_KEYS.enabled, false);
    enabledCheckbox.checked = isEnabled;
    logger.debug('chatTools', '[Fold] 初始化启用状态:', isEnabled);
  } else {
    logger.warn('chatTools', '[Fold] 未找到启用开关元素');
  }

  // 允许折叠用户消息
  const userCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('chat-tools-fold-user'));
  if (userCheckbox) {
    userCheckbox.addEventListener('change', (e) => {
      allowFoldUser = /** @type {HTMLInputElement} */ (e.target).checked;
      saveSetting(STORAGE_KEYS.allowUser, allowFoldUser);
    });
    allowFoldUser = getSetting(STORAGE_KEYS.allowUser, true);
    userCheckbox.checked = allowFoldUser;
  }

  // 允许折叠AI消息
  const aiCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('chat-tools-fold-ai'));
  if (aiCheckbox) {
    aiCheckbox.addEventListener('change', (e) => {
      allowFoldAI = /** @type {HTMLInputElement} */ (e.target).checked;
      saveSetting(STORAGE_KEYS.allowAI, allowFoldAI);
    });
    allowFoldAI = getSetting(STORAGE_KEYS.allowAI, true);
    aiCheckbox.checked = allowFoldAI;
  }

  // 快速标题预设
  const presetsInput = /** @type {HTMLInputElement} */ (document.getElementById('chat-tools-fold-presets-input'));
  const presetsList = /** @type {HTMLElement} */ (document.getElementById('chat-tools-fold-presets-list'));
  const presetsAddBtn = /** @type {HTMLButtonElement} */ (document.getElementById('chat-tools-fold-presets-add'));

  if (presetsInput && presetsList && presetsAddBtn) {
    // 渲染预设列表
    function renderPresetsList() {
      presetsList.innerHTML = '';
      quickPresets.forEach((preset, index) => {
        const tag = document.createElement('span');
        tag.className = 'chat-tools-preset-tag';
        tag.innerHTML = `${preset}<button class="chat-tools-preset-remove" data-index="${index}" title="删除"><i class="fa-solid fa-xmark"></i></button>`;
        presetsList.appendChild(tag);
      });
    }

    // 添加预设
    presetsAddBtn.addEventListener('click', () => {
      const value = presetsInput.value.trim();
      if (value && !quickPresets.includes(value)) {
        quickPresets.push(value);
        saveSetting(STORAGE_KEYS.presets, quickPresets);
        presetsInput.value = '';
        renderPresetsList();
        logger.info('chatTools', '[Fold] 添加预设:', value);
      }
    });

    // 输入框回车添加
    presetsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        presetsAddBtn.click();
      }
    });

    // 删除预设（事件委托）
    presetsList.addEventListener('click', (e) => {
      const removeBtn = /** @type {HTMLElement} */ (e.target).closest('.chat-tools-preset-remove');
      if (removeBtn) {
        const index = parseInt(/** @type {HTMLElement} */(removeBtn).dataset.index, 10);
        const removed = quickPresets.splice(index, 1)[0];
        saveSetting(STORAGE_KEYS.presets, quickPresets);
        renderPresetsList();
        logger.info('chatTools', '[Fold] 删除预设:', removed);
      }
    });

    // 初始化
    quickPresets = getSetting(STORAGE_KEYS.presets, []);
    renderPresetsList();
  }
}

/**
 * 监听聊天消息加载事件
 */
function setupEventListeners() {
  // 监听用户消息渲染完成
  eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageId) => {
    logger.debug('chatTools', '[Fold] 收到 USER_MESSAGE_RENDERED 事件, messageId:', messageId);
    if (isEnabled) {
      // messageId 可能是数字或字符串，尝试两种方式查询
      let mesElement = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${messageId}"]`));
      if (!mesElement) {
        // 尝试将 messageId 转为数字查询
        mesElement = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${Number(messageId)}"]`));
      }
      if (mesElement) {
        logger.debug('chatTools', '[Fold] 找到消息元素:', mesElement.getAttribute('mesid'));
        injectFoldButton(mesElement);
      } else {
        logger.warn('chatTools', '[Fold] 未找到消息元素, messageId:', messageId);
      }
    }
  });

  // 监听 AI 消息渲染完成
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    logger.debug('chatTools', '[Fold] 收到 CHARACTER_MESSAGE_RENDERED 事件, messageId:', messageId);
    if (isEnabled) {
      let mesElement = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${messageId}"]`));
      if (!mesElement) {
        mesElement = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${Number(messageId)}"]`));
      }
      if (mesElement) {
        logger.debug('chatTools', '[Fold] 找到消息元素:', mesElement.getAttribute('mesid'));
        injectFoldButton(mesElement);
      } else {
        logger.warn('chatTools', '[Fold] 未找到消息元素, messageId:', messageId);
      }
    }
  });

  // 监听聊天切换（切换角色、切换聊天等）
  eventSource.on(event_types.CHAT_CHANGED, () => {
    // 每次都从存储中读取最新的启用状态，而不是依赖内存变量
    const currentEnabled = getSetting(STORAGE_KEYS.enabled, false);

    // 功能未启用，不执行任何操作
    if (!currentEnabled) {
      return;
    }

    logger.info('chatTools', '[Fold] 收到 CHAT_CHANGED 事件，功能已启用');

    // 恢复折叠状态
    restoreFoldedMessages();

    // 扫描所有消息
    scanAllMessages('chat-loaded');
  });

  // 绑定全局点击事件（使用事件委托）
  bindGlobalClickEvent();

  logger.info('chatTools', '[Fold] 事件监听已设置');
}

/**
 * 绑定全局点击事件（使用事件委托）
 * @description 处理折叠按钮的点击事件，不需要为每个消息单独绑定
 */
function bindGlobalClickEvent() {
  // 防止重复绑定
  if (globalClickBound) {
    return;
  }

  // 使用 jQuery 事件委托（和 SillyTavern 官方一样）
  $(document).on('click', '.chat-tools-fold-btn', function (e) {
    e.preventDefault();
    e.stopPropagation();

    const button = /** @type {HTMLElement} */ (this);
    const mesId = button.dataset.mesid;

    if (mesId) {
      const mesElement = /** @type {HTMLElement} */ (document.querySelector(`.mes[mesid="${mesId}"]`));
      if (mesElement) {
        foldMessage(mesId, mesElement);
      }
    }
  });

  globalClickBound = true;
  logger.debug('chatTools', '[Fold] 全局点击事件已绑定');
}

// ========================================
// 初始化
// ========================================

/**
 * 初始化折叠功能
 * 注意：bindSettings 不在这里调用，由 initSettingsPanel 在 settings.html 加载后调用
 */
export function initChatToolsFold() {
  logger.info('chatTools', '[Fold] 初始化折叠功能');

  // 不再这里绑定设置项，由 index.js 在 settings.html 加载后调用

  // 设置事件监听
  setupEventListeners();

  logger.info('chatTools', '[Fold] 折叠功能初始化完成');
}

/**
 * 启用折叠功能
 */
export function enableChatToolsFold() {
  isEnabled = true;
  saveSetting(STORAGE_KEYS.enabled, true);
  scanAllMessages('enableChatToolsFold');
  logger.info('chatTools', '[Fold] 折叠功能已启用');
}

/**
 * 禁用折叠功能
 */
export function disableChatToolsFold() {
  isEnabled = false;
  saveSetting(STORAGE_KEYS.enabled, false);
  logger.info('chatTools', '[Fold] 折叠功能已禁用');
}
