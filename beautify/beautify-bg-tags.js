/**
 * 背景图标签管理模块
 * @module beautify/beautify-bg-tags
 *
 * @description
 * 为官方背景图设置添加自定义标签管理功能：
 * - 在背景图抽屉工具栏显示标签管理按钮
 * - 支持创建、编辑、删除自定义标签
 * - 每个标签可关联多张背景图
 * - 点击标签可随机切换该标签下的背景图
 * - 完全独立管理，不影响官方背景图功能
 */

import logger from '../logger.js';
import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';


// ==========================================
// 常量定义
// ==========================================

const EXT_ID = 'pawsPuffs';


// ==========================================
// 模块状态
// ==========================================

/** @type {boolean} 是否已经尝试过添加按钮 */
let bgTagButtonAdded = false;

/** @type {HTMLElement|null} +号按钮元素 */
let bgTagAddBtn = null;

/** @type {HTMLUListElement|null} 标签列表元素 */
let bgTabsList = null;


// ==========================================
// 公开 API
// ==========================================

/**
 * 初始化背景图标签管理功能
 * @export
 */
export function initBgTagManager() {
  logger.info('beautify', '[BgTagManager] 开始初始化...');

  // 检查是否已启用
  const enabled = extension_settings[EXT_ID]?.beautify?.bgTagManagerEnabled;
  if (!enabled) {
    logger.info('beautify', '[BgTagManager] 功能未启用，跳过初始化');
    return;
  }

  // 启用功能
  enableBgTagManager();
}

/**
 * 绑定背景图标签管理开关
 * @export
 * @param {boolean} enabled - 是否启用
 */
export function bindBgTagManagerToggle(enabled) {
  if (enabled) {
    enableBgTagManager();
  } else {
    disableBgTagManager();
  }
}

/**
 * 刷新搜索框下方的标签显示
 * 供弹窗删除/编辑标签后调用
 * @export
 */
export function refreshBgTagsHeader() {
  const row2 = document.querySelector('#Backgrounds .bg-header-row-2');
  if (row2) {
    renderBgTagsToHeader(row2);
  }
}


// ==========================================
// 核心功能
// ==========================================

/**
 * 启用背景图标签管理功能
 */
function enableBgTagManager() {
  // 尝试查找并添加按钮
  attemptAddBgTagButton();

  // 监听抽屉打开事件
  document.body.addEventListener('click', handleBgDrawerToggle);

  logger.info('beautify', '[BgTagManager] 功能已启用');
}

/**
 * 禁用背景图标签管理功能
 */
function disableBgTagManager() {
  // 移除抽屉打开监听
  document.body.removeEventListener('click', handleBgDrawerToggle);

  // 移除临时测试按钮
  const tempBtn = document.getElementById('beautify-bg-tag-temp-btn');
  if (tempBtn) {
    tempBtn.remove();
  }

  bgTagButtonAdded = false;

  // 移除所有自定义标签
  removeAllBgTags();

  // 清除筛选
  clearTagFilter();

  logger.info('beautify', '[BgTagManager] 功能已禁用');
}

/**
 * 处理背景图抽屉的点击事件
 * @param {Event} e
 */
function handleBgDrawerToggle(e) {
  // 检查是否点击了背景图按钮
  const bgButton = e.target.closest('#backgrounds-button, #backgrounds-drawer-toggle, #backgrounds, [data-drawer="Backgrounds"]');
  if (bgButton) {
    logger.debug('beautify', '[BgTagManager] 检测到背景图按钮点击');
    // 延迟检查，因为抽屉打开有动画
    setTimeout(() => {
      attemptAddBgTagButton();
    }, 500);
  }
}

/**
 * 尝试添加背景图标签按钮
 */
function attemptAddBgTagButton() {
  if (bgTagButtonAdded) return;

  // 在搜索栏下方添加按钮和标签
  const bgHeaderRow2 = document.querySelector('#Backgrounds .bg-header-row-2');
  if (bgHeaderRow2) {
    logger.info('beautify', '[BgTagManager] 找到搜索栏区域，添加按钮和标签...');

    // 渲染标签到搜索栏下方（会自动创建新的一行）
    renderBgTagsToHeader(bgHeaderRow2);

    bgTagButtonAdded = true;
    logger.info('beautify', '[BgTagManager] 背景图标签按钮和标签已添加');
    return;
  }

  logger.debug('beautify', '[BgTagManager] 未找到搜索栏区域');
}

/**
 * 渲染标签到搜索栏下方（搜索框后面）
 * 在搜索框后面添加一行专门放标签
 * @param {HTMLElement} headerRow2 - 搜索栏容器
 */
function renderBgTagsToHeader(headerRow2) {
  // 查找或创建标签行容器
  let tagRow = document.getElementById('beautify-bg-tag-row');
  if (!tagRow) {
    // 创建新的一行
    tagRow = document.createElement('div');
    tagRow.id = 'beautify-bg-tag-row';
    tagRow.className = 'beautify-bg-tag-row';
    tagRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px;';
    // 在 bg-header-row-2 后面插入
    headerRow2.after(tagRow);
  }

  // 清空标签行
  tagRow.innerHTML = '';

  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];

  // 渲染每个标签
  tags.forEach(tag => {
    const tagElement = document.createElement('div');
    tagElement.className = 'beautify-bg-tag-info beautify-bg-tag-chip interactable';
    tagElement.setAttribute('data-tag-id', tag.id);
    tagElement.setAttribute('title', `筛选 "${tag.name}"（${tag.backgrounds?.length || 0}张）`);
    tagElement.setAttribute('tabindex', '0');
    tagElement.setAttribute('role', 'button');
    tagElement.innerHTML = `
      <span class="beautify-bg-tag-name">${escapeHtml(tag.name)}</span>
    `;

    // 绑定点击事件（筛选背景图）
    tagElement.addEventListener('click', function () {
      // 如果已经是激活状态，移除筛选
      if (this.classList.contains('active')) {
        clearTagFilter();
        this.classList.remove('active');
        return;
      }

      // 移除其他标签的激活状态
      tagRow.querySelectorAll('.beautify-bg-tag-chip').forEach(t => {
        t.classList.remove('active');
      });

      // 激活当前标签
      this.classList.add('active');

      // 筛选背景图
      filterBgByTag(tag);
    });

    tagRow.appendChild(tagElement);
    logger.debug('beautify', '[BgTagManager] 标签已渲染:', tag.name);
  });

  // 把创建按钮移到标签行
  addTempTestButtonToRow(tagRow);

  logger.info('beautify', '[BgTagManager] 标签渲染完成:', tags.length, '个标签');
}

/**
 * 将创建按钮添加到标签行
 * @param {HTMLElement} tagRow - 标签行容器
 */
function addTempTestButtonToRow(tagRow) {
  // 检查标签行中是否已有创建按钮
  if (tagRow.querySelector('#beautify-bg-tag-temp-btn')) {
    return;
  }

  // 检查是否已在别处存在
  const existingBtn = document.getElementById('beautify-bg-tag-temp-btn');
  if (existingBtn) {
    existingBtn.remove();
  }

  // 创建按钮
  const btn = document.createElement('button');
  btn.id = 'beautify-bg-tag-temp-btn';
  btn.className = 'menu_button menu_button_icon interactable';
  btn.title = '创建标签';
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('role', 'button');
  btn.innerHTML = '<i class="fa-solid fa-plus"></i>';

  // 绑定点击事件
  btn.addEventListener('click', function () {
    console.log('[BgTagManager] 创建标签按钮被点击');
    openTagManagerPopup();
  });

  // 添加到标签行
  tagRow.appendChild(btn);
}

/**
 * 打开标签管理弹窗
 */
function openTagManagerPopup() {
  // 导入弹窗系统并打开弹窗
  import('./beautify-popup.js').then(({ openTagManagerPopup: openPopup }) => {
    openPopup();
  }).catch(error => {
    logger.error('beautify', '[BgTagManager] 打开弹窗失败:', error);
  });
}


// ==========================================
// 标签增删改功能
// ==========================================
function clearTagFilter() {
  // 显示所有背景图
  document.querySelectorAll('#bg_menu_content .bg_example, #bg_custom_content .bg_example').forEach(el => {
    el.style.display = '';
  });
  // 清除筛选状态
  window._bgTagFilterActive = false;
  window._bgTagFilterTagId = null;
  logger.debug('beautify', '[BgTagManager] 已清除筛选');
}

/**
 * 根据标签筛选背景图
 * @param {Object} tag - 标签对象
 */
function filterBgByTag(tag) {
  if (!tag.backgrounds || tag.backgrounds.length === 0) {
    toastr.warning('该标签没有添加背景图');
    return;
  }

  const tagBgSet = new Set(tag.backgrounds);

  // 筛选系统背景图
  document.querySelectorAll('#bg_menu_content .bg_example').forEach(el => {
    const bgFile = el.getAttribute('bgfile');
    el.style.display = tagBgSet.has(bgFile) ? '' : 'none';
  });

  // 筛选聊天背景图
  document.querySelectorAll('#bg_custom_content .bg_example').forEach(el => {
    const bgFile = el.getAttribute('bgfile');
    el.style.display = tagBgSet.has(bgFile) ? '' : 'none';
  });

  // 设置筛选状态
  window._bgTagFilterActive = true;
  window._bgTagFilterTagId = tag.id;

  logger.info('beautify', '[BgTagManager] 已筛选标签:', tag.name, '共', tag.backgrounds.length, '张');
}

/**
 * 移除搜索栏下方的所有自定义标签
 */
function removeAllBgTags() {
  // 移除标签行容器
  const tagRow = document.getElementById('beautify-bg-tag-row');
  if (tagRow) {
    tagRow.remove();
  }

  // 清除筛选
  clearTagFilter();
}


// ==========================================
// 标签增删改功能
// ==========================================

/**
 * 获取所有可用背景图列表
 * @returns {Promise<Array<{filename: string, isCustom: boolean}>>}
 */
export async function getAllBackgrounds() {
  const backgrounds = [];

  // 获取系统背景图
  const systemBgElements = document.querySelectorAll('#bg_menu_content .bg_example');
  systemBgElements.forEach(el => {
    const filename = el.getAttribute('bgfile');
    if (filename) {
      backgrounds.push({ filename, isCustom: false });
    }
  });

  // 获取聊天背景图
  const chatBgElements = document.querySelectorAll('#bg_custom_content .bg_example');
  chatBgElements.forEach(el => {
    const filename = el.getAttribute('bgfile');
    if (filename) {
      backgrounds.push({ filename, isCustom: true });
    }
  });

  return backgrounds;
}

/**
 * 创建新标签
 * @param {Object} tagData - 标签数据 { name, backgrounds }
 */
export function createBgTag(tagData) {
  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];

  // 检查名称是否重复
  if (tags.some(t => t.name === tagData.name)) {
    toastr.warning('标签名称已存在');
    return;
  }

  const newTag = {
    id: Date.now().toString(),
    name: tagData.name,
    backgrounds: tagData.backgrounds,
  };

  tags.push(newTag);
  extension_settings[EXT_ID].beautify.bgTags = tags;
  saveSettingsDebounced();

  // 重新渲染
  const row2 = document.querySelector('#Backgrounds .bg-header-row-2');
  if (row2) {
    renderBgTagsToHeader(row2);
  }
  toastr.success(`标签 "${tagData.name}" 创建成功`);
  logger.info('beautify', '[BgTagManager] 新标签已创建:', newTag);
}

/**
 * 更新标签
 * @param {number} index - 标签索引
 * @param {Object} tagData - 标签数据 { name, backgrounds }
 */
export function updateBgTag(index, tagData) {
  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];

  // 检查名称是否重复（排除自己）
  const duplicateIndex = tags.findIndex((t, i) => i !== index && t.name === tagData.name);
  if (duplicateIndex !== -1) {
    toastr.warning('标签名称已存在');
    return;
  }

  tags[index].name = tagData.name;
  tags[index].backgrounds = tagData.backgrounds;
  extension_settings[EXT_ID].beautify.bgTags = tags;
  saveSettingsDebounced();

  // 重新渲染
  const row2 = document.querySelector('#Backgrounds .bg-header-row-2');
  if (row2) {
    renderBgTagsToHeader(row2);
  }
  toastr.success(`标签 "${tagData.name}" 已更新`);
  logger.info('beautify', '[BgTagManager] 标签已更新:', tags[index]);
}

/**
 * 删除标签
 * @param {number} index - 标签索引
 */
export async function deleteBgTag(index) {
  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];
  const tag = tags[index];

  if (!tag) return;

  // 动态导入弹窗系统
  const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');

  callGenericPopup(
    `<p>确定要删除标签 "<strong>${escapeHtml(tag.name)}</strong>" 吗？<br>删除后无法恢复。</p>`,
    POPUP_TYPE.TEXT,
    {
      title: '删除标签',
      okButton: '删除',
      cancelButton: '取消',
      onOk: () => {
        tags.splice(index, 1);
        extension_settings[EXT_ID].beautify.bgTags = tags;
        saveSettingsDebounced();

        // 重新渲染
        const row2 = document.querySelector('#Backgrounds .bg-header-row-2');
        if (row2) {
          renderBgTagsToHeader(row2);
        }
        toastr.success(`标签 "${tag.name}" 已删除`);
        logger.info('beautify', '[BgTagManager] 标签已删除:', tag);
      },
    }
  );
}

/**
 * HTML转义
 * @param {string} text - 原始文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
