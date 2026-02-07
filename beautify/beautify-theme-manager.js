/**
 * 美化主题管理模块
 * @module beautify/beautify-theme-manager
 *
 * @description
 * 为官方UI主题添加管理功能：
 * - 获取官方主题列表
 * - 标签管理（创建/删除/打标签）
 * - 主题列表渲染
 * - 搜索/筛选
 * - 当前使用中的主题置顶
 * - 分页
 * - 删除主题（本地文件彻底删除）
 */

import logger from '../logger.js';
import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced, getRequestHeaders } from '../../../../../script.js';
import { debounce } from '../../../../utils.js';
import { power_user } from '../../../../power-user.js';


const EXT_ID = 'pawsPuffs';


// ==========================================
// 常量定义
// ==========================================

const ITEMS_PER_PAGE = 10;

// ==========================================
// 模块状态
// ==========================================

/** @type {boolean} 功能是否已启用 */
let enabled = false;

/** @type {boolean} 是否已尝试初始化 */
let initialized = false;

/** @type {string|null} 当前选中的标签ID（筛选用） */
let currentTagId = null;

/** @type {string} 当前搜索关键词 */
let searchKeyword = '';

/** @type {number} 当前页码 */
let currentPage = 1;

/** @type {boolean} 是否折叠 */
let isCollapsed = false;

/** @type {Array} 官方主题列表缓存 */
let themesCache = null;


// ==========================================
// 公开 API
// ==========================================

/**
 * 绑定主题管理开关
 * @export
 * @param {boolean} isEnabled - 是否启用
 */
export function bindThemeManagerToggle(isEnabled) {
  enabled = isEnabled;

  if (enabled) {
    initThemeManager();
  } else {
    destroyThemeManager();
  }
}

/**
 * 刷新主题列表（供外部调用）
 * @export
 */
export function refreshThemeList() {
  if (!enabled) return;
  renderThemeList();
}

/**
 * 获取标签列表
 * @export
 * @returns {Array<{id: string, name: string, themeNames: string[]}>}
 */
export function getThemeTags() {
  return extension_settings[EXT_ID]?.beautify?.themeTags || [];
}


// ==========================================
// 核心功能
// ==========================================

/**
 * 初始化主题管理
 */
function initThemeManager() {
  if (initialized) return;

  logger.info('[ThemeManager] 开始初始化...');

  fetchOfficialThemes().then(themes => {
    themesCache = themes;

    createContainer();
    renderThemeList();
    bindEvents();

    // 监听弹窗中标签变更事件，自动刷新
    document.addEventListener('beautify-theme-tags-changed', handleThemeTagsChanged);

    // 监听官方 #themes 下拉框切换 → 更新"当前"标记
    const themesSelect = document.getElementById('themes');
    if (themesSelect) {
      themesSelect.addEventListener('change', () => {
        // 延迟等 power_user.theme 被 SillyTavern 更新后再渲染
        setTimeout(() => renderThemeList(), 150);
      });
    }

    initialized = true;
    logger.info('[ThemeManager] 初始化完成，共', themes.length, '个主题');
  }).catch(error => {
    logger.error('[ThemeManager] 初始化失败:', error);
  });
}

/**
 * 销毁主题管理
 */
function destroyThemeManager() {
  const container = document.getElementById('beautify-theme-manager-container');
  if (container) container.remove();

  const infoOverlay = document.querySelector('.beautify-theme-manager-info-overlay');
  if (infoOverlay) infoOverlay.remove();

  document.removeEventListener('beautify-theme-tags-changed', handleThemeTagsChanged);

  initialized = false;
  logger.info('[ThemeManager] 已销毁');
}

/**
 * 处理弹窗中标签变更事件
 */
function handleThemeTagsChanged() {
  logger.debug('[ThemeManager] 检测到标签变更，刷新列表');
  renderTagFilter();
  renderThemeList();
}

/**
 * 获取官方主题列表
 * @returns {Promise<Array<{name: string}>>}
 */
async function fetchOfficialThemes() {
  if (typeof themes !== 'undefined' && Array.isArray(themes)) {
    return themes;
  }

  const select = document.getElementById('themes');
  if (select) {
    const options = select.querySelectorAll('option');
    return Array.from(options).map(opt => ({ name: opt.value }));
  }

  return [];
}

/**
 * 获取「删除前是否确认」设置
 * @returns {boolean}
 */
function getConfirmBeforeDelete() {
  return extension_settings[EXT_ID]?.beautify?.themeDeleteConfirm !== false; // 默认 true
}

/**
 * 设置「删除前是否确认」
 * @param {boolean} value
 */
function setConfirmBeforeDelete(value) {
  if (!extension_settings[EXT_ID].beautify) {
    extension_settings[EXT_ID].beautify = {};
  }
  extension_settings[EXT_ID].beautify.themeDeleteConfirm = value;
  saveSettingsDebounced();
}

/**
 * 创建容器DOM（插入到 UI Theme h4 标题下方）
 */
function createContainer() {
  if (document.getElementById('beautify-theme-manager-container')) return;

  // 找到 UI-presets-block 里的 title_restorable h4
  const uiPresetsBlock = document.getElementById('UI-presets-block');
  if (uiPresetsBlock) {
    const titleH4 = uiPresetsBlock.querySelector('h4.title_restorable');
    if (titleH4) {
      const container = buildContainerDOM();
      titleH4.after(container);
      logger.debug('[ThemeManager] 容器已创建在 UI Theme h4 下方');
      return;
    }
  }

  // 降级方案：找到主题颜色折叠栏
  const themeColorDrawer = document.querySelector('.inline-drawer-toggle[data-i18n="[title]Specify colors for your theme."]');
  if (themeColorDrawer) {
    const drawerContainer = themeColorDrawer.closest('.inline-drawer');
    if (drawerContainer && drawerContainer.parentElement) {
      const container = buildContainerDOM();
      drawerContainer.parentElement.insertBefore(container, drawerContainer);
      logger.debug('[ThemeManager] 容器已创建在主题颜色折叠栏上方');
      return;
    }
  }

  // 降级方案：尝试插入到 #UI-Theme-Block 后面
  const uiThemeBlock = document.getElementById('UI-Theme-Block');
  if (!uiThemeBlock) {
    const themesSelect = document.getElementById('themes');
    if (!themesSelect) {
      logger.warn('[ThemeManager] 未找到 UI-presets-block、主题颜色折叠栏和 #themes');
      return;
    }
    logger.warn('[ThemeManager] 未找到 UI-presets-block，降级插入');
    const container = buildContainerDOM();
    const parentBlock = themesSelect.closest('.inline-drawer-content, div');
    if (parentBlock) parentBlock.after(container);
    return;
  }

  const container = buildContainerDOM();
  uiThemeBlock.after(container);
  logger.debug('[ThemeManager] 容器已创建（#UI-Theme-Block 降级方案）');
}

/**
 * 构建容器 DOM
 * @returns {HTMLElement}
 */
function buildContainerDOM() {
  const container = document.createElement('div');
  container.id = 'beautify-theme-manager-container';
  container.className = 'inline-drawer beautify-theme-manager-container enabled wide100p flexFlowColumn';

  isCollapsed = extension_settings[EXT_ID]?.beautify?.themeManagerCollapsed || false;
  const confirmChecked = getConfirmBeforeDelete();

  container.innerHTML = `
    <!-- 折叠头部 -->
    <div class="inline-drawer-toggle inline-drawer-header beautify-theme-manager-header interactable" role="button" tabindex="0">
      <div class="beautify-theme-manager-title">
        <span>主题管理</span>
      </div>
      <i class="fa-solid inline-drawer-icon beautify-theme-manager-icon interactable ${isCollapsed ? 'down' : 'up'} fa-circle-chevron-${isCollapsed ? 'down' : 'up'}"></i>
    </div>

    <!-- 折叠内容（使用官方类） -->
    <div class="inline-drawer-content beautify-theme-manager-body${isCollapsed ? '' : ' forceExpand'}">
      <!-- 搜索框 + 删除确认开关 -->
      <div class="beautify-theme-manager-toolbar">
        <div class="beautify-theme-manager-search-input-wrap">
          <i class="fa-solid fa-magnifying-glass beautify-theme-manager-search-icon"></i>
          <input type="text" id="beautify-theme-manager-search" placeholder="搜索主题或标签..." class="beautify-theme-manager-search-input">
          <button class="beautify-theme-manager-search-clear" title="清除" style="display: none;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <label class="beautify-theme-manager-confirm-toggle" title="开启后删除主题前会弹窗确认">
          <input type="checkbox" id="beautify-theme-manager-confirm-delete" ${confirmChecked ? 'checked' : ''}>
          <span>删除确认</span>
        </label>
      </div>

      <!-- 标签筛选行 -->
      <div class="beautify-theme-manager-tags" id="beautify-theme-manager-tags"></div>

      <!-- 主题列表 -->
      <div class="beautify-theme-manager-list" id="beautify-theme-manager-list"></div>

      <!-- 分页控件 -->
      <div class="beautify-theme-manager-pagination" id="beautify-theme-manager-pagination"></div>
    </div>
  `;

  return container;
}

/**
 * 绑定事件
 */
function bindEvents() {
  const root = document.getElementById('beautify-theme-manager-container');
  if (!root) return;

  // 折叠头部 - 使用官方的 inline-drawer-toggle 机制（会有滑动动画）
  // 监听官方事件来同步状态和保存设置
  const header = root.querySelector('.beautify-theme-manager-header');
  if (header) {
    // 监听官方的 inline-drawer-toggle 事件
    root.addEventListener('inline-drawer-toggle', () => {
      // 官方已经切换了显示状态，我们只需要同步 isCollapsed 并保存
      // 通过检查内容是否隐藏来判断当前状态
      const content = root.querySelector('.beautify-theme-manager-body');
      if (content) {
        isCollapsed = content.style.display === 'none';
        if (!extension_settings[EXT_ID].beautify) extension_settings[EXT_ID].beautify = {};
        extension_settings[EXT_ID].beautify.themeManagerCollapsed = isCollapsed;
        saveSettingsDebounced();
        logger.debug('[ThemeManager] 折叠状态已同步:', isCollapsed);
      }
    });

    // 键盘支持（官方的 inline-drawer-toggle 可能没有绑定键盘事件）
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click(); // 触发官方的点击处理
      }
    });
  }

  // 搜索框
  const searchInput = document.getElementById('beautify-theme-manager-search');
  const searchClear = root.querySelector('.beautify-theme-manager-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      handleSearchInput(e.target.value);
    }, 200));
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      handleSearchInput('');
    });
  }

  // 删除确认开关
  const confirmCheckbox = document.getElementById('beautify-theme-manager-confirm-delete');
  if (confirmCheckbox) {
    confirmCheckbox.addEventListener('change', function () {
      setConfirmBeforeDelete(this.checked);
      logger.debug('[ThemeManager] 删除确认:', this.checked);
    });
  }

  // 主题列表事件委托（删除 + 重命名按钮）
  const listContainer = document.getElementById('beautify-theme-manager-list');
  if (listContainer) {
    listContainer.addEventListener('click', async (e) => {
      // 应用按钮
      const applyBtn = e.target.closest('.beautify-theme-manager-apply-btn');
      if (applyBtn && !applyBtn.disabled) {
        e.stopPropagation();
        const themeName = applyBtn.getAttribute('data-theme');
        if (themeName) {
          await handleApplyTheme(themeName);
        }
        return;
      }

      // 删除按钮
      const deleteBtn = e.target.closest('.beautify-theme-manager-delete-btn');
      if (deleteBtn && !deleteBtn.disabled) {
        e.stopPropagation();
        const themeName = deleteBtn.getAttribute('data-theme');
        if (themeName) {
          await handleDeleteTheme(themeName);
        }
        return;
      }

      // 重命名按钮
      const renameBtn = e.target.closest('.beautify-theme-manager-rename-btn');
      if (renameBtn) {
        e.stopPropagation();
        if (renameBtn.disabled) {
          toastr.info('请先切换到该主题后再重命名');
          return;
        }
        const themeName = renameBtn.getAttribute('data-theme');
        if (themeName) {
          await handleRenameTheme(themeName);
        }
      }
    });
  }

  // 说明按钮
  const infoBtn = document.getElementById('beautify-theme-manager-info-btn');
  if (infoBtn) {
    infoBtn.addEventListener('click', () => {
      openInfoPopup();
    });
  }
}

/**
 * 处理搜索输入
 */
function handleSearchInput(keyword) {
  searchKeyword = keyword.trim().toLowerCase();

  const root = document.getElementById('beautify-theme-manager-container');
  const searchClear = root?.querySelector('.beautify-theme-manager-search-clear');
  if (searchClear) {
    searchClear.style.display = searchKeyword ? 'flex' : 'none';
  }

  currentPage = 1;
  renderThemeList();
}


// ==========================================
// 应用主题
// ==========================================

/**
 * 处理应用主题
 * 通过设置 #themes 下拉框的值并触发 change 事件来切换主题
 * SillyTavern 的 power-user.js 会监听 change 事件自动完成剩余工作
 * @param {string} themeName - 要应用的主题名
 */
function handleApplyTheme(themeName) {
  const themesSelect = document.getElementById('themes');
  if (!themesSelect) {
    toastr.error('找不到主题下拉框');
    return;
  }

  // 检查主题是否存在
  const option = themesSelect.querySelector(`option[value="${CSS.escape(themeName)}"]`);
  if (!option) {
    toastr.error(`主题不存在: ${themeName}`);
    return;
  }

  // 设置下拉框值为目标主题
  themesSelect.value = themeName;

  // 触发 change 事件，SillyTavern 会自动：
  // 1. 更新 power_user.theme
  // 2. 调用 applyTheme(themeName) 应用样式
  // 3. 保存设置
  themesSelect.dispatchEvent(new Event('change', { bubbles: true }));

  toastr.success(`已切换到主题: ${themeName}`);
  logger.info('[ThemeManager] 已应用主题:', themeName);
}


// ==========================================
// 删除主题
// ==========================================

/**
 * 处理删除主题
 * @param {string} themeName - 要删除的主题名
 */
async function handleDeleteTheme(themeName) {
  // 检查是否是当前使用中的主题
  const currentTheme = power_user?.theme || '';
  if (themeName === currentTheme) {
    toastr.warning('不能删除当前正在使用的主题');
    return;
  }

  // 是否需要确认
  if (getConfirmBeforeDelete()) {
    const confirmed = await showDeleteConfirm(themeName);
    if (!confirmed) return;
  }

  // 调用 API 删除
  try {
    const response = await fetch('/api/themes/delete', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ name: themeName }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        toastr.error(`主题文件不存在: ${themeName}`);
      } else {
        toastr.error(`删除失败 (${response.status})`);
      }
      return;
    }

    // 删除成功 - 更新缓存
    if (themesCache) {
      themesCache = themesCache.filter(t => t.name !== themeName);
    }

    // 更新官方 #themes 下拉框
    const themesSelect = document.getElementById('themes');
    if (themesSelect) {
      const option = themesSelect.querySelector(`option[value="${CSS.escape(themeName)}"]`);
      if (option) option.remove();
    }

    // 从所有标签中移除该主题
    removeThemeFromAllTags(themeName);

    // 重新渲染
    renderThemeList();

    toastr.success(`主题 "${themeName}" 已删除`);
    logger.info('[ThemeManager] 主题已删除:', themeName);
  } catch (error) {
    logger.error('[ThemeManager] 删除主题失败:', error);
    toastr.error('删除主题时出错');
  }
}

/**
 * 显示删除确认弹窗
 * @param {string} themeName
 * @returns {Promise<boolean>}
 */
async function showDeleteConfirm(themeName) {
  return new Promise((resolve) => {
    // 创建弹窗
    const overlay = document.createElement('div');
    overlay.className = 'beautify-theme-manager-rename-overlay';
    overlay.innerHTML = `
      <div class="beautify-theme-manager-rename-popup">
        <h3>删除主题</h3>
        <div style="margin-bottom: 16px;">
          <p style="margin: 0; color: var(--SmartThemeBodyColor); font-size: 0.9em;">
            确定要永久删除主题 "<strong>${escapeHtml(themeName)}</strong>" 吗？
          </p>
          <p style="margin: 8px 0 0; color: var(--SmartThemeEmColor); font-size: 0.85em;">
            ⚠️ 此操作不可恢复，主题文件将从本地彻底删除。
          </p>
        </div>
        <div class="beautify-theme-manager-rename-buttons">
          <button class="beautify-theme-manager-rename-cancel">取消</button>
          <button class="beautify-theme-manager-rename-confirm" style="background: #dc3545;">删除</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 300);
      resolve(result);
    };

    overlay.querySelector('.beautify-theme-manager-rename-cancel').onclick = () => close(false);
    overlay.querySelector('.beautify-theme-manager-rename-confirm').onclick = () => close(true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

/**
 * 从所有标签中移除指定主题
 * @param {string} themeName
 */
function removeThemeFromAllTags(themeName) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];
  let changed = false;

  tags.forEach(tag => {
    if (tag.themeNames && tag.themeNames.includes(themeName)) {
      tag.themeNames = tag.themeNames.filter(n => n !== themeName);
      changed = true;
    }
  });

  if (changed) {
    extension_settings[EXT_ID].beautify.themeTags = tags;
    saveSettingsDebounced();
    renderTagFilter();
    logger.debug('[ThemeManager] 已从标签中移除主题:', themeName);
  }
}


// ==========================================
// 重命名主题
// ==========================================

/**
 * 处理重命名主题（仅当前主题可用）
 * 原理：从 power_user 提取当前主题数据 → 改名 → save 新文件 → delete 旧文件
 * @param {string} oldName - 当前主题名
 */
async function handleRenameTheme(oldName) {
  // 二次确认：必须是当前主题
  if (power_user.theme !== oldName) {
    toastr.info('请先切换到该主题后再重命名');
    return;
  }

  const newName = await showRenameInput(oldName);
  if (!newName || newName === oldName) return;

  // 检查新名字是否已存在
  const allThemeNames = getGlobalThemeNames();
  if (allThemeNames.includes(newName)) {
    toastr.warning(`主题 "${newName}" 已存在，请使用其他名字`);
    return;
  }

  try {
    // 1. 从 SillyTavern 全局 themes 缓存获取完整主题数据
    const fullThemeData = getFullThemeData(oldName);
    if (!fullThemeData) {
      toastr.error('无法获取完整主题数据，请刷新页面后重试');
      return;
    }

    // 2. 改名 → 保存新文件
    const newTheme = { ...fullThemeData, name: newName };
    const saveResp = await fetch('/api/themes/save', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(newTheme),
    });

    if (!saveResp.ok) {
      toastr.error(`保存新主题失败 (${saveResp.status})`);
      return;
    }

    // 3. 删除旧文件
    const delResp = await fetch('/api/themes/delete', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ name: oldName }),
    });

    if (!delResp.ok) {
      logger.warn('[ThemeManager] 删除旧主题文件失败，但新文件已保存:', delResp.status);
    }

    // 4. 更新 SillyTavern 全局 themes 缓存（关键！不更新则切换时找不到数据）
    updateGlobalThemesCache(oldName, newTheme);

    // 5. 更新 power_user.theme
    power_user.theme = newName;

    // 6. 更新官方 #themes 下拉框
    updateThemesSelect(oldName, newName);

    // 7. 更新本地管理列表缓存
    if (themesCache) {
      const idx = themesCache.findIndex(t => t.name === oldName);
      if (idx !== -1) {
        themesCache[idx] = { ...themesCache[idx], name: newName };
      }
    }

    // 8. 更新标签中的主题引用
    renameThemeInAllTags(oldName, newName);

    // 9. 重新渲染
    renderThemeList();

    toastr.success(`已重命名为 "${newName}"`);
    logger.info('[ThemeManager] 主题已重命名:', oldName, '→', newName);
  } catch (error) {
    logger.error('[ThemeManager] 重命名失败:', error);
    toastr.error('重命名时出错');
  }
}

/**
 * 显示重命名输入弹窗
 * @param {string} currentName
 * @returns {Promise<string|null>}
 */
async function showRenameInput(currentName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'beautify-theme-manager-rename-overlay';
    overlay.innerHTML = `
      <div class="beautify-theme-manager-rename-popup">
        <h3>重命名主题</h3>
        <input type="text" class="beautify-theme-manager-rename-input"
               value="${escapeHtml(currentName)}" placeholder="输入新名称"
               maxlength="100">
        <div class="beautify-theme-manager-rename-buttons">
          <button class="beautify-theme-manager-rename-cancel">取消</button>
          <button class="beautify-theme-manager-rename-confirm">确认</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const input = overlay.querySelector('.beautify-theme-manager-rename-input');
    input.focus();
    input.select();

    const close = (result) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 300);
      resolve(result);
    };

    overlay.querySelector('.beautify-theme-manager-rename-cancel').onclick = () => close(null);
    overlay.querySelector('.beautify-theme-manager-rename-confirm').onclick = () => {
      const val = input.value.trim();
      if (!val) {
        toastr.warning('名称不能为空');
        return;
      }
      close(val);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        overlay.querySelector('.beautify-theme-manager-rename-confirm').click();
      }
      if (e.key === 'Escape') close(null);
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  });
}

/**
 * 获取完整主题数据（用于重命名保存）
 * 策略：
 *   1. 从全局 themes 缓存中获取完整对象
 *   2. 失败则从 power_user 中提取当前主题数据（仅当前主题可用）
 * @param {string} themeName
 * @returns {object|null}
 */
function getFullThemeData(themeName) {
  // 方式1：全局 themes 数组（SillyTavern 内部缓存）
  if (typeof themes !== 'undefined' && Array.isArray(themes)) {
    // 可能是完整对象，也可能只是 { name: "..." } 或字符串
    const found = themes.find(t => {
      if (typeof t === 'string') return t === themeName;
      if (typeof t === 'object' && t !== null) return t.name === themeName;
      return false;
    });

    // 如果找到且是完整对象（有颜色字段等，不只是 name）
    if (found && typeof found === 'object' && ('main_text_color' in found || 'blur_strength' in found)) {
      logger.debug('[ThemeManager] 从全局 themes 缓存获取到完整主题数据:', themeName);
      return found;
    }
  }

  // 方式2：从 power_user 构建（只适用于当前主题）
  if (power_user && power_user.theme === themeName) {
    logger.debug('[ThemeManager] 从 power_user 构建主题数据:', themeName);
    return buildThemeFromPowerUser(themeName);
  }

  logger.warn('[ThemeManager] 无法获取主题数据:', themeName);
  return null;
}

/**
 * 从 power_user 提取当前主题的所有字段构建主题对象
 * 对应 SillyTavern power-user.js 中 getThemeObject() 的字段
 * @param {string} name
 * @returns {object}
 */
function buildThemeFromPowerUser(name) {
  const THEME_KEYS = [
    'blur_strength', 'main_text_color', 'italics_text_color', 'underline_text_color',
    'quote_text_color', 'blur_tint_color', 'chat_tint_color', 'user_mes_blur_tint_color',
    'bot_mes_blur_tint_color', 'shadow_color', 'shadow_width', 'border_color',
    'font_scale', 'fast_ui_mode', 'waifuMode', 'avatar_style', 'chat_display',
    'toastr_position', 'noShadows', 'chat_width', 'timer_enabled', 'timestamps_enabled',
    'timestamp_model_icon', 'mesIDDisplay_enabled', 'hideChatAvatars_enabled',
    'message_token_count_enabled', 'expand_message_actions', 'enableZenSliders',
    'enableLabMode', 'hotswap_enabled', 'custom_css', 'bogus_folders',
    'zoomed_avatar_magnification', 'reduced_motion', 'compact_input_area',
    'show_swipe_num_all_messages', 'click_to_edit', 'media_display',
  ];

  const theme = { name };
  for (const key of THEME_KEYS) {
    if (key in power_user) {
      theme[key] = power_user[key];
    }
  }
  return theme;
}

/**
 * 更新 SillyTavern 全局 themes 缓存
 * @param {string} oldName
 * @param {object} newThemeData - 完整的新主题对象
 */
function updateGlobalThemesCache(oldName, newThemeData) {
  if (typeof themes === 'undefined' || !Array.isArray(themes)) return;

  const idx = themes.findIndex(t => {
    if (typeof t === 'string') return t === oldName;
    if (typeof t === 'object' && t !== null) return t.name === oldName;
    return false;
  });

  if (idx !== -1) {
    // 如果原来是字符串，就替换为新字符串；如果是对象，替换为新对象
    if (typeof themes[idx] === 'string') {
      themes[idx] = newThemeData.name;
    } else {
      themes[idx] = newThemeData;
    }
    logger.debug('[ThemeManager] 全局 themes 缓存已更新:', oldName, '→', newThemeData.name);
  } else {
    themes.push(typeof themes[0] === 'string' ? newThemeData.name : newThemeData);
    logger.debug('[ThemeManager] 全局 themes 缓存中追加新主题:', newThemeData.name);
  }
}

/**
 * 获取全局主题名列表（用于重名检查）
 * @returns {string[]}
 */
function getGlobalThemeNames() {
  if (typeof themes !== 'undefined' && Array.isArray(themes)) {
    return themes.map(t => typeof t === 'object' ? t.name : t).filter(Boolean);
  }
  if (themesCache) {
    return themesCache.map(t => t.name);
  }
  return [];
}

/**
 * 更新 #themes 下拉框选项
 * @param {string} oldName
 * @param {string} newName
 */
function updateThemesSelect(oldName, newName) {
  const themesSelect = document.getElementById('themes');
  if (!themesSelect) return;

  const oldOption = themesSelect.querySelector(`option[value="${CSS.escape(oldName)}"]`);
  if (oldOption) {
    oldOption.value = newName;
    oldOption.textContent = newName;
  }

  // 确保选中状态更新为新名字
  themesSelect.value = newName;
}

/**
 * 在所有标签中把旧主题名替换为新名
 * @param {string} oldName
 * @param {string} newName
 */
function renameThemeInAllTags(oldName, newName) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];
  let changed = false;

  tags.forEach(tag => {
    if (tag.themeNames) {
      const idx = tag.themeNames.indexOf(oldName);
      if (idx !== -1) {
        tag.themeNames[idx] = newName;
        changed = true;
      }
    }
  });

  if (changed) {
    extension_settings[EXT_ID].beautify.themeTags = tags;
    saveSettingsDebounced();
    renderTagFilter();
    logger.debug('[ThemeManager] 标签中的主题引用已更新:', oldName, '→', newName);
  }
}


// ==========================================
// 渲染功能
// ==========================================

/**
 * 渲染主题列表
 */
function renderThemeList() {
  if (!themesCache) return;

  const listContainer = document.getElementById('beautify-theme-manager-list');
  if (!listContainer) return;

  const currentTheme = power_user?.theme || '';

  // 过滤
  let filteredThemes = themesCache.filter(theme => {
    if (searchKeyword) {
      const themeTags = getThemeTagsForTheme(theme.name);
      const tagNames = themeTags.map(t => t.name).join(' ');
      if (!theme.name.toLowerCase().includes(searchKeyword) &&
        !tagNames.toLowerCase().includes(searchKeyword)) {
        return false;
      }
    }

    if (currentTagId) {
      const themeTagIds = getThemeTagIds(theme.name);
      if (!themeTagIds.includes(currentTagId)) return false;
    }

    return true;
  });

  // 当前主题置顶
  if (currentTheme) {
    const currentIndex = filteredThemes.findIndex(t => t.name === currentTheme);
    if (currentIndex > 0) {
      const currentItem = filteredThemes.splice(currentIndex, 1)[0];
      filteredThemes.unshift(currentItem);
    }
  }

  // 分页
  const totalPages = Math.ceil(filteredThemes.length / ITEMS_PER_PAGE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageThemes = filteredThemes.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // 渲染
  if (pageThemes.length === 0) {
    listContainer.innerHTML = `
      <div class="beautify-theme-manager-empty">
        <i class="fa-solid fa-palette"></i>
        <p>没有找到主题</p>
      </div>
    `;
  } else {
    listContainer.innerHTML = pageThemes.map(theme => {
      const isCurrent = theme.name === currentTheme;
      const themeTags = getThemeTagsForTheme(theme.name);

      return `
        <div class="beautify-theme-manager-item ${isCurrent ? 'current' : ''}" data-theme="${escapeHtml(theme.name)}">
          <div class="beautify-theme-manager-info">
            <div class="beautify-theme-manager-name-row">
              ${isCurrent ? '<span class="beautify-theme-manager-current-badge">当前</span>' : ''}
              <span class="beautify-theme-manager-name" title="${escapeHtml(theme.name)}">${escapeHtml(theme.name)}</span>
            </div>
            ${themeTags.length > 0 ? `
              <div class="beautify-theme-manager-item-tags">
                ${themeTags.map(tag => `<span class="beautify-theme-manager-item-tag" data-tag-id="${tag.id}">${escapeHtml(tag.name)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
          <div class="beautify-theme-manager-actions-row">
            <button class="beautify-theme-manager-apply-btn${isCurrent ? ' disabled' : ''}"
                    data-theme="${escapeHtml(theme.name)}"
                    title="${isCurrent ? '当前使用中' : '应用此主题'}"
                    ${isCurrent ? 'disabled' : ''}>
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="beautify-theme-manager-rename-btn"
                    data-theme="${escapeHtml(theme.name)}"
                    title="${isCurrent ? '重命名当前主题' : '请先切换到该主题再重命名'}"
                    ${!isCurrent ? 'disabled' : ''}>
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="beautify-theme-manager-delete-btn${isCurrent ? ' disabled' : ''}"
                    data-theme="${escapeHtml(theme.name)}"
                    title="${isCurrent ? '不能删除当前使用的主题' : '删除主题'}"
                    ${isCurrent ? 'disabled' : ''}>
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 分页
  renderPagination(filteredThemes.length);

  // 标签筛选行
  renderTagFilter();
}

/**
 * 渲染分页控件
 */
function renderPagination(totalItems) {
  const pagination = document.getElementById('beautify-theme-manager-pagination');
  if (!pagination) return;

  if (totalItems <= ITEMS_PER_PAGE) {
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  pagination.innerHTML = `
    <button class="beautify-theme-manager-page-btn" id="beautify-tm-prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
    <span class="beautify-theme-manager-page-info">第 ${currentPage} / ${totalPages} 页（共 ${totalItems} 个）</span>
    <button class="beautify-theme-manager-page-btn" id="beautify-tm-next" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
  `;

  const prevBtn = document.getElementById('beautify-tm-prev');
  const nextBtn = document.getElementById('beautify-tm-next');

  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener('click', () => { currentPage--; renderThemeList(); scrollListToTop(); });
  }
  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener('click', () => { currentPage++; renderThemeList(); scrollListToTop(); });
  }
}

function scrollListToTop() {
  const listContainer = document.getElementById('beautify-theme-manager-list');
  if (listContainer) listContainer.scrollTop = 0;
}


// ==========================================
// 标签筛选行
// ==========================================

/**
 * 渲染标签筛选行
 */
function renderTagFilter() {
  const tagContainer = document.getElementById('beautify-theme-manager-tags');
  if (!tagContainer) return;

  const tags = getThemeTags();

  // 清空容器，重新渲染
  tagContainer.innerHTML = '';

  // "全部" chip - 始终显示
  const allChip = document.createElement('span');
  allChip.className = `beautify-theme-manager-tag interactable ${!currentTagId ? 'active' : ''}`;
  allChip.setAttribute('data-tag-id', '');
  allChip.setAttribute('role', 'button');
  allChip.setAttribute('tabindex', '0');
  allChip.textContent = '全部';
  bindTagChipEvents(allChip);
  tagContainer.appendChild(allChip);

  // 如果有自定义标签，渲染它们
  if (tags.length > 0) {
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = `beautify-theme-manager-tag interactable ${currentTagId === tag.id ? 'active' : ''}`;
      chip.setAttribute('data-tag-id', tag.id);
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.textContent = tag.name;
      bindTagChipEvents(chip);
      tagContainer.appendChild(chip);
    });
  }

  appendTagManageButton(tagContainer);
}

function bindTagChipEvents(chip) {
  const handler = () => {
    const tagId = chip.getAttribute('data-tag-id');
    handleTagClick(tagId);
  };
  chip.addEventListener('click', handler);
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
  });
}

function appendTagManageButton(tagContainer) {
  const btn = document.createElement('button');
  btn.className = 'menu_button menu_button_icon interactable beautify-theme-manager-tag-add-btn';
  btn.title = '管理标签';
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('role', 'button');
  btn.style.cssText = 'padding: 2px 8px; min-height: auto; font-size: 0.85em;';
  btn.innerHTML = '<i class="fa-solid fa-plus"></i>';

  btn.addEventListener('click', async () => {
    try {
      const { openThemeTagManagerPopup } = await import('./beautify-popup.js');
      openThemeTagManagerPopup();
    } catch (error) {
      logger.error('[ThemeManager] 打开标签管理弹窗失败:', error);
    }
  });

  tagContainer.appendChild(btn);
}

function handleTagClick(tagId) {
  if (!tagId) {
    currentTagId = null;
  } else if (currentTagId === tagId) {
    currentTagId = null;
  } else {
    currentTagId = tagId;
  }

  currentPage = 1;
  renderThemeList();
}


// ==========================================
// 说明弹窗
// ==========================================

function openInfoPopup() {
  const existingOverlay = document.querySelector('.beautify-theme-manager-info-overlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'beautify-theme-manager-info-overlay';
  overlay.innerHTML = `
    <div class="beautify-theme-manager-info-popup">
      <div class="beautify-theme-manager-info-header">
        <h3>美化主题管理 - 使用说明</h3>
        <button class="beautify-theme-manager-info-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="beautify-theme-manager-info-content">
        <h4>功能介绍</h4>
        <p>美化主题管理可以帮助你更好地整理和筛选官方UI主题。</p>
        <h4>标签管理</h4>
        <ul>
          <li>点击标签可筛选对应的主题</li>
          <li>点击"+"打开标签管理弹窗</li>
          <li>一个主题可以打多个标签</li>
        </ul>
        <h4>删除主题</h4>
        <ul>
          <li>点击垃圾桶图标可删除主题</li>
          <li>勾选"删除确认"开关后，删除前会弹窗确认</li>
          <li>当前使用中的主题不能删除</li>
          <li>删除操作不可恢复</li>
        </ul>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const closeBtn = overlay.querySelector('.beautify-theme-manager-info-close');
  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}


// ==========================================
// 标签辅助函数
// ==========================================

function getThemeTagsForTheme(themeName) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];
  return tags.filter(tag => tag.themeNames?.includes(themeName))
    .map(tag => ({ id: tag.id, name: tag.name }));
}

function getThemeTagIds(themeName) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];
  return tags.filter(tag => tag.themeNames?.includes(themeName))
    .map(tag => tag.id);
}

/**
 * 创建主题标签
 */
export function createThemeTag(tagData) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];

  if (tags.some(t => t.name === tagData.name)) {
    toastr.warning('标签名称已存在');
    return;
  }

  const newTag = {
    id: Date.now().toString(),
    name: tagData.name,
    themeNames: tagData.themeNames,
  };

  tags.push(newTag);
  extension_settings[EXT_ID].beautify.themeTags = tags;
  saveSettingsDebounced();

  renderTagFilter();
  renderThemeList();

  toastr.success(`标签 "${tagData.name}" 创建成功`);
  logger.info('[ThemeManager] 新标签已创建:', newTag);
}

/**
 * 更新主题标签
 */
export function updateThemeTag(index, tagData) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];

  const duplicateIndex = tags.findIndex((t, i) => i !== index && t.name === tagData.name);
  if (duplicateIndex !== -1) {
    toastr.warning('标签名称已存在');
    return;
  }

  tags[index].name = tagData.name;
  tags[index].themeNames = tagData.themeNames;
  extension_settings[EXT_ID].beautify.themeTags = tags;
  saveSettingsDebounced();

  renderTagFilter();
  renderThemeList();

  toastr.success(`标签 "${tagData.name}" 已更新`);
  logger.info('[ThemeManager] 标签已更新:', tags[index]);
}

/**
 * 删除主题标签
 */
export async function deleteThemeTag(index) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];
  const tag = tags[index];
  if (!tag) return;

  const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');

  callGenericPopup(
    `<p>确定要删除标签 "<strong>${escapeHtml(tag.name)}</strong>" 吗？<br>删除后无法恢复。</p>`,
    POPUP_TYPE.CONFIRM,
    {
      title: '删除标签',
      okButton: '删除',
      cancelButton: '取消',
      onOk: () => {
        tags.splice(index, 1);
        extension_settings[EXT_ID].beautify.themeTags = tags;
        saveSettingsDebounced();

        renderTagFilter();
        renderThemeList();

        toastr.success(`标签 "${tag.name}" 已删除`);
        logger.info('[ThemeManager] 标签已删除:', tag);
      },
    }
  );
}


// ==========================================
// 工具函数
// ==========================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}