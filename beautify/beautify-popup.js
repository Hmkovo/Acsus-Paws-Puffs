/**
 * 悬浮栏设置弹窗
 * @module beautify/beautify-popup
 *
 * @description
 * 提供悬浮栏的详细设置界面：
 * - 头像设置（头像框、位置调整）
 * - 背景设置（背景图、装饰条）
 * - 布局设置（头像位置、边框、高度）
 * - 显示设置（各种信息的显示/隐藏开关）
 */

import logger from '../logger.js';
import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced, getRequestHeaders, getThumbnailUrl } from '../../../../../script.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';
import {
  setFloatingBtnImage,
  clearFloatingBtnImage,
  saveFloatingBtnSettings,
  applyGifAnimationPack,
  clearGifAnimationPack
} from './beautify.js';


// ==========================================
// 常量定义
// ==========================================

const EXT_ID = 'pawsPuffs';

/** 每页显示的预设数量 */
const PRESETS_PER_PAGE = 10;

/** 默认弹窗设置 */
const DEFAULT_POPUP_SETTINGS = {
  // 预设列表
  presets: [],  // { id, name, settings, createdTime }
  // 用户自定义CSS
  customCSS: '',
  // 悬浮栏方案管理
  schemes: [],  // { id, name, customCSS, display, createdTime }
  currentScheme: '',  // 当前选中的方案ID
  display: {
    showName: true,
    showTime: true,
    showTokens: true,
    showMesId: true,
    showAvatar: true
  },
  layout: {
    // 1. 头像位置
    avatarPosition: 'sides',  // 'sides' | 'center'
    headerHeight: 160,        // 50 ~ 400
    // 背景圆角（四个角独立控制）
    bgRadiusTopLeft: 0,       // 0 ~ 50
    bgRadiusTopRight: 0,      // 0 ~ 50
    bgRadiusBottomLeft: 12,   // 0 ~ 50
    bgRadiusBottomRight: 12,  // 0 ~ 50
    // 2. 头像边框
    avatarBorder: true,
    avatarBorderWidth: 3,     // 0 ~ 20
    avatarBorderColor: 'rgba(255, 255, 255, 1)',
    // 3. 头像阴影
    avatarShadow: true,
    avatarShadowColor: 'rgba(0, 0, 0, 0.3)',
    // 4. 头像偏移
    avatarOffsetX: 0,         // -100 ~ 100
    avatarOffsetY: 0,         // -100 ~ 100
    avatarSize: 70,           // 30 ~ 200
    avatarRadius: 50,         // 0 ~ 50 (百分比，50=圆形，0=方形)
    // 5. 信息偏移
    infoOffsetX: 0,           // -100 ~ 100
    infoOffsetY: 0,           // -100 ~ 100
    infoSize: 1,              // 0.5 ~ 2 (em倍数)
    infoColor: '',            // 空=跟随主题
    // 6. 头像旋转
    avatarSpin: false,        // 是否启用唱片旋转效果
    // 7. 消息间距
    messageBottomPadding: 80  // 最新消息底部间距 20~200
  },
  background: {
    enabled: false,
    imageUrl: '',
    mode: 'cover',
    // 轮播设置
    carouselEnabled: false,   // 是否启用轮播
    carouselImages: [],       // 轮播图片列表（最多3张）
    carouselInterval: 5,      // 轮播间隔（秒）5/8/10/15
    carouselEffect: 'fade',   // 轮播动画效果 fade/slide/zoom/blur
    // 用户存档的背景图列表
    savedImages: []  // { id, name, url, type: 'local'|'url', addedTime }
  },
  decoration: {
    enabled: false,
    imageUrl: '',
    height: 30,       // 装饰条高度 5~150
    bottom: 0,        // 底部偏移 -100~100
    width: 100,       // 宽度百分比 10~200
    left: 50,         // 水平位置 0~100 (0=最左, 50=居中, 100=最右)
    // CSS边框装饰
    borderEnabled: false,
    borderWidth: 2,   // 边框粗细 1~10
    borderStyle: 'solid', // solid/dashed/dotted/double
    borderColor: 'rgba(255,255,255,0.3)',
    borderBottom: 0,  // 边框位置偏移 -50~50
    // 用户存档的装饰条列表
    savedImages: []
  },
  avatarFrame: {
    enabled: false,
    imageUrl: '',
    offsetX: 0,         // -100 ~ 100
    offsetY: 0,         // -100 ~ 100
    scale: 1,           // 0.5 ~ 2
    rotation: 0,        // 0 ~ 360
    // 用户存档的头像框列表
    savedImages: []     // { id, name, url, type: 'local'|'url', addedTime }
  }
};


// ==========================================
// 模块状态
// ==========================================

/** @type {HTMLElement|null} 弹窗遮罩层元素 */
let popupOverlay = null;

/** @type {Object} 当前设置（从 extension_settings 加载） */
let currentSettings = null;


// ==========================================
// 公开函数
// ==========================================

/**
 * 打开设置弹窗
 */
export function openBeautifyPopup() {
  logger.info('beautify', '打开设置弹窗');

  // 加载设置
  loadPopupSettings();

  // 创建弹窗 DOM
  createPopupDOM();

  // 显示弹窗（带动画）
  requestAnimationFrame(() => {
    popupOverlay?.classList.add('show');
  });
}

/**
 * 关闭设置弹窗
 */
export function closeBeautifyPopup() {
  if (!popupOverlay) return;

  logger.info('beautify', '关闭设置弹窗');

  // 保存设置
  savePopupSettings();

  // 隐藏动画
  popupOverlay.classList.remove('show');

  // 动画结束后移除 DOM
  setTimeout(() => {
    popupOverlay?.remove();
    popupOverlay = null;
  }, 300);
}

/**
 * 应用显示设置到悬浮栏
 */
export function applyDisplaySettings() {
  const stickyHeader = document.getElementById('beautify-sticky-header');
  if (!stickyHeader || !currentSettings) return;

  const { display } = currentSettings;

  // 通过 CSS 类控制各元素的显示/隐藏
  stickyHeader.classList.toggle('hide-name', !display.showName);
  stickyHeader.classList.toggle('hide-time', !display.showTime);
  stickyHeader.classList.toggle('hide-tokens', !display.showTokens);
  stickyHeader.classList.toggle('hide-mesid', !display.showMesId);
  stickyHeader.classList.toggle('hide-avatar', !display.showAvatar);

  logger.debug('beautify', '[BeautifyPopup] 显示设置已应用:', display);
}


// ==========================================
// 设置管理
// ==========================================

/**
 * 加载弹窗设置
 * @description 从 extension_settings 加载设置，并深度合并缺失的默认值
 * （包括子对象的新字段，确保新增设置项能正确初始化）
 */
function loadPopupSettings() {
  extension_settings[EXT_ID] = extension_settings[EXT_ID] || {};
  extension_settings[EXT_ID].beautify = extension_settings[EXT_ID].beautify || {};

  // 初始化 popup 设置（合并默认值）
  if (!extension_settings[EXT_ID].beautify.popup) {
    extension_settings[EXT_ID].beautify.popup = JSON.parse(JSON.stringify(DEFAULT_POPUP_SETTINGS));
  }

  // 深度合并缺失的字段（包括子对象的新字段）
  currentSettings = extension_settings[EXT_ID].beautify.popup;
  for (const key in DEFAULT_POPUP_SETTINGS) {
    if (currentSettings[key] === undefined) {
      currentSettings[key] = JSON.parse(JSON.stringify(DEFAULT_POPUP_SETTINGS[key]));
    } else if (typeof DEFAULT_POPUP_SETTINGS[key] === 'object' && !Array.isArray(DEFAULT_POPUP_SETTINGS[key])) {
      // 深度合并子对象的新字段
      for (const subKey in DEFAULT_POPUP_SETTINGS[key]) {
        if (currentSettings[key][subKey] === undefined) {
          currentSettings[key][subKey] = JSON.parse(JSON.stringify(DEFAULT_POPUP_SETTINGS[key][subKey]));
        }
      }
    }
  }

  logger.debug('beautify', '[BeautifyPopup] 设置已加载:', currentSettings);
}

/**
 * 保存弹窗设置
 */
function savePopupSettings() {
  if (!currentSettings) return;

  extension_settings[EXT_ID].beautify.popup = currentSettings;
  saveSettingsDebounced();

  logger.debug('beautify', '[BeautifyPopup] 设置已保存');
}


// ==========================================
// DOM 创建
// ==========================================

/**
 * 创建弹窗 DOM 结构
 */
function createPopupDOM() {
  // 如果已存在，先移除
  if (popupOverlay) {
    popupOverlay.remove();
  }

  // 创建遮罩层
  popupOverlay = document.createElement('div');
  popupOverlay.className = 'beautify-popup-overlay';
  popupOverlay.innerHTML = `
        <div class="beautify-popup">
            <!-- 头部 -->
            <div class="beautify-popup-header">
                <h3>悬浮栏设置</h3>
                <button class="beautify-popup-close" title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- 标签页导航 -->
            <div class="beautify-popup-tabs">
                <button class="beautify-popup-tab active" data-tab="preset">预设</button>
                <button class="beautify-popup-tab" data-tab="display">显示</button>
                <button class="beautify-popup-tab" data-tab="layout">布局</button>
                <button class="beautify-popup-tab" data-tab="background">背景</button>
                <button class="beautify-popup-tab" data-tab="avatar">头像</button>
            </div>

            <!-- 内容区 -->
            <div class="beautify-popup-content">
                ${createPresetTabContent()}
                ${createDisplayTabContent()}
                ${createLayoutTabContent()}
                ${createBackgroundTabContent()}
                ${createAvatarTabContent()}
            </div>
        </div>
    `;

  // 添加到 body
  document.body.appendChild(popupOverlay);

  // 绑定事件
  bindPopupEvents();
}

/**
 * 创建"预设"标签页内容
 * @returns {string} 预设标签页的 HTML 字符串
 */
function createPresetTabContent() {
  return `
        <div class="beautify-popup-panel active" data-panel="preset">
            <!-- 搜索框 + 保存按钮 -->
            <div class="beautify-preset-header">
                <div class="beautify-preset-search">
                    <i class="fa-solid fa-search"></i>
                    <input type="text" id="beautify-preset-search" placeholder="搜索预设...">
                </div>
                <button class="beautify-preset-save-btn" id="beautify-preset-save">
                    <i class="fa-solid fa-plus"></i> 保存当前
                </button>
            </div>

            <!-- 预设列表 -->
            <div class="beautify-preset-list" id="beautify-preset-list">
                ${renderPresetList()}
            </div>

            <!-- 翻页控制 -->
            <div class="beautify-preset-pagination" id="beautify-preset-pagination">
                ${renderPresetPagination()}
            </div>
        </div>
    `;
}

/** 当前预设页码 */
let currentPresetPage = 1;
/** 当前搜索关键词 */
let presetSearchKeyword = '';

/**
 * 渲染预设列表（根据当前页码和搜索关键词）
 * @returns {string} 预设列表的 HTML 字符串
 */
function renderPresetList() {
  const presets = getFilteredPresets();
  const startIndex = (currentPresetPage - 1) * PRESETS_PER_PAGE;
  const pagePresets = presets.slice(startIndex, startIndex + PRESETS_PER_PAGE);

  if (pagePresets.length === 0) {
    if (presetSearchKeyword) {
      return '<div class="beautify-preset-empty"><i class="fa-solid fa-search"></i> 没有找到匹配的预设</div>';
    }
    return '<div class="beautify-preset-empty"><i class="fa-solid fa-bookmark"></i> 暂无预设，点击"保存当前"创建</div>';
  }

  return pagePresets.map(preset => `
        <div class="beautify-preset-item" data-id="${preset.id}">
            <div class="beautify-preset-info">
                <span class="beautify-preset-name">${preset.name}</span>
                <span class="beautify-preset-time">${formatPresetTime(preset.createdTime)}</span>
            </div>
            <div class="beautify-preset-actions">
                <button class="beautify-preset-load" data-id="${preset.id}" title="应用">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button class="beautify-preset-delete" data-id="${preset.id}" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * 渲染翻页控制（上一页/下一页按钮）
 * @returns {string} 翻页控制的 HTML 字符串
 */
function renderPresetPagination() {
  const presets = getFilteredPresets();
  const totalPages = Math.ceil(presets.length / PRESETS_PER_PAGE) || 1;

  return `
        <button class="beautify-preset-page-btn" id="beautify-preset-prev" ${currentPresetPage <= 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span class="beautify-preset-page-info">${currentPresetPage} / ${totalPages}</span>
        <button class="beautify-preset-page-btn" id="beautify-preset-next" ${currentPresetPage >= totalPages ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;
}

/**
 * 获取过滤后的预设列表（按搜索关键词过滤）
 * @returns {Array<Object>} 过滤后的预设数组
 */
function getFilteredPresets() {
  const presets = currentSettings.presets || [];
  if (!presetSearchKeyword) return presets;
  return presets.filter(p => p.name.toLowerCase().includes(presetSearchKeyword.toLowerCase()));
}

/**
 * 格式化预设时间为简短格式（如 12/11 14:30）
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatPresetTime(timestamp) {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 创建"显示"标签页内容
 *
 * @description
 * 包含三部分：
 * 1. 显示开关（折叠）：控制悬浮栏显示哪些信息
 * 2. 自定义CSS：用户可以写CSS美化悬浮栏（实时更新）
 * 3. 方案管理：导入/导出/切换悬浮栏方案
 */
function createDisplayTabContent() {
  const { display } = currentSettings;
  const customCSS = currentSettings.customCSS || '';
  const schemes = currentSettings.schemes || [];
  const currentScheme = currentSettings.currentScheme || '';

  return `
        <div class="beautify-popup-panel" data-panel="display">
            <!-- 方案管理区域 -->
            <div class="beautify-scheme-header">
                <select id="beautify-scheme-select" class="beautify-scheme-select">
                    <option value="">默认方案</option>
                    ${schemes.map(s => `<option value="${s.id}" ${currentScheme === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                </select>
                <div class="beautify-scheme-actions">
                    <button class="beautify-scheme-btn" id="beautify-scheme-save" title="保存当前方案">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                    <button class="beautify-scheme-btn" id="beautify-scheme-import" title="导入方案">
                        <i class="fa-solid fa-file-import"></i>
                    </button>
                    <button class="beautify-scheme-btn" id="beautify-scheme-export" title="导出方案">
                        <i class="fa-solid fa-file-export"></i>
                    </button>
                    <button class="beautify-scheme-btn" id="beautify-scheme-delete" title="删除方案">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
                <input type="file" id="beautify-scheme-file" accept=".json" hidden>
            </div>

            <!-- 显示开关（折叠） -->
            <details class="beautify-display-details">
                <summary class="beautify-display-summary">
                    <i class="fa-solid fa-eye"></i> 显示设置
                </summary>
                <div class="beautify-display-switches">
                    <label class="beautify-popup-switch">
                        <input type="checkbox" id="beautify-show-name" ${display.showName ? 'checked' : ''}>
                        <span class="beautify-popup-switch-label">显示名字</span>
                    </label>
                    <label class="beautify-popup-switch">
                        <input type="checkbox" id="beautify-show-time" ${display.showTime ? 'checked' : ''}>
                        <span class="beautify-popup-switch-label">显示时间</span>
                    </label>
                    <label class="beautify-popup-switch">
                        <input type="checkbox" id="beautify-show-tokens" ${display.showTokens ? 'checked' : ''}>
                        <span class="beautify-popup-switch-label">显示 Token 数</span>
                    </label>
                    <label class="beautify-popup-switch">
                        <input type="checkbox" id="beautify-show-mesid" ${display.showMesId ? 'checked' : ''}>
                        <span class="beautify-popup-switch-label">显示楼层号</span>
                    </label>
                    <label class="beautify-popup-switch">
                        <input type="checkbox" id="beautify-show-avatar" ${display.showAvatar ? 'checked' : ''}>
                        <span class="beautify-popup-switch-label">显示头像</span>
                    </label>
                </div>
            </details>

            <!-- 自定义CSS区域（实时更新） -->
            <div class="beautify-css-section">
                <div class="beautify-css-header">
                    <span class="beautify-popup-hint-small">在这里写CSS美化悬浮栏，实时生效</span>
                    <button class="beautify-scheme-btn" id="beautify-css-help" title="查看类名和结构说明">
                        <i class="fa-solid fa-circle-question"></i>
                    </button>
                </div>
                <textarea id="beautify-custom-css" class="beautify-custom-css-input" placeholder="/* 示例：给角色悬浮栏添加装饰 */
.beautify-sticky-header[is_user='false'] .beautify-deco-1 {
    display: block;
    background-image: url('...');
}">${escapeHtml(customCSS)}</textarea>
            </div>
        </div>
    `;
}

/**
 * HTML转义（防止XSS）
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 创建"布局"标签页内容
 * 使用下拉框切换不同设置面板：头像位置、背景圆角、头像边框、头像阴影、头像偏移、信息偏移
 * @returns {string} 布局设置面板的 HTML 字符串
 */
function createLayoutTabContent() {
  const { layout } = currentSettings;

  return `
        <div class="beautify-popup-panel" data-panel="layout">
            <!-- 下拉框选择器 -->
            <div class="beautify-popup-select-wrapper">
                <select id="beautify-layout-select" class="beautify-popup-select">
                    <option value="position">头像位置</option>
                    <option value="bg-radius">背景圆角</option>
                    <option value="border">头像边框</option>
                    <option value="shadow">头像阴影</option>
                    <option value="avatar-offset">头像偏移</option>
                    <option value="info-offset">信息偏移</option>
                    <option value="message-spacing">消息间距</option>
                </select>
            </div>

            <!-- 1. 头像位置面板 -->
            <div class="beautify-layout-panel active" data-layout-panel="position">
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">位置模式</div>
                        <div class="beautify-popup-btn-group">
                            <button class="beautify-popup-btn ${layout.avatarPosition === 'sides' ? 'active' : ''}" data-position="sides">左右</button>
                            <button class="beautify-popup-btn ${layout.avatarPosition === 'center' ? 'active' : ''}" data-position="center">居中</button>
                        </div>
                    </div>
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        悬浮栏高度 <span class="beautify-popup-value" id="beautify-height-value">${layout.headerHeight}px</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-header-height"
                        min="50" max="400" step="10" value="${layout.headerHeight}">
                </div>
            </div>

            <!-- 1.5 背景圆角面板 -->
            <div class="beautify-layout-panel" data-layout-panel="bg-radius">
                <div class="beautify-popup-hint">调整背景图四个角的圆角</div>
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">左上 <span class="beautify-popup-value" id="beautify-bg-tl-value">${layout.bgRadiusTopLeft}px</span></div>
                        <input type="range" class="beautify-popup-slider-compact" id="beautify-bg-radius-tl"
                            min="0" max="50" step="2" value="${layout.bgRadiusTopLeft}">
                    </div>
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">右上 <span class="beautify-popup-value" id="beautify-bg-tr-value">${layout.bgRadiusTopRight}px</span></div>
                        <input type="range" class="beautify-popup-slider-compact" id="beautify-bg-radius-tr"
                            min="0" max="50" step="2" value="${layout.bgRadiusTopRight}">
                    </div>
                </div>
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">左下 <span class="beautify-popup-value" id="beautify-bg-bl-value">${layout.bgRadiusBottomLeft}px</span></div>
                        <input type="range" class="beautify-popup-slider-compact" id="beautify-bg-radius-bl"
                            min="0" max="50" step="2" value="${layout.bgRadiusBottomLeft}">
                    </div>
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">右下 <span class="beautify-popup-value" id="beautify-bg-br-value">${layout.bgRadiusBottomRight}px</span></div>
                        <input type="range" class="beautify-popup-slider-compact" id="beautify-bg-radius-br"
                            min="0" max="50" step="2" value="${layout.bgRadiusBottomRight}">
                    </div>
                </div>
            </div>

            <!-- 2. 头像边框面板 -->
            <div class="beautify-layout-panel" data-layout-panel="border">
                <div class="beautify-popup-row">
                    <label class="beautify-popup-switch-compact">
                        <input type="checkbox" id="beautify-avatar-border" ${layout.avatarBorder ? 'checked' : ''}>
                        <span>启用边框</span>
                    </label>
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        粗细 <span class="beautify-popup-value" id="beautify-border-width-value">${layout.avatarBorderWidth}px</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-border-width"
                        min="0" max="20" step="1" value="${layout.avatarBorderWidth}">
                </div>
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">颜色</div>
                        <div class="beautify-popup-color-wrapper">
                            <toolcool-color-picker id="beautify-border-color" color="${layout.avatarBorderColor}"></toolcool-color-picker>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. 头像阴影面板 -->
            <div class="beautify-layout-panel" data-layout-panel="shadow">
                <div class="beautify-popup-row">
                    <label class="beautify-popup-switch-compact">
                        <input type="checkbox" id="beautify-avatar-shadow" ${layout.avatarShadow ? 'checked' : ''}>
                        <span>启用阴影</span>
                    </label>
                </div>
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">颜色（含透明度）</div>
                        <div class="beautify-popup-color-wrapper">
                            <toolcool-color-picker id="beautify-shadow-color" color="${layout.avatarShadowColor}"></toolcool-color-picker>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. 头像偏移面板 -->
            <div class="beautify-layout-panel" data-layout-panel="avatar-offset">
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">偏移</div>
                        <div class="beautify-popup-dpad" data-target="avatar">
                            <button class="dpad-btn dpad-up" data-dir="up"><i class="fa-solid fa-caret-up"></i></button>
                            <button class="dpad-btn dpad-left" data-dir="left"><i class="fa-solid fa-caret-left"></i></button>
                            <span class="dpad-value" id="avatar-offset-value">${layout.avatarOffsetX},${layout.avatarOffsetY}</span>
                            <button class="dpad-btn dpad-right" data-dir="right"><i class="fa-solid fa-caret-right"></i></button>
                            <button class="dpad-btn dpad-down" data-dir="down"><i class="fa-solid fa-caret-down"></i></button>
                            <button class="dpad-btn dpad-reset" data-dir="reset"><i class="fa-solid fa-rotate-left"></i></button>
                        </div>
                    </div>
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        头像大小 <span class="beautify-popup-value" id="beautify-avatar-size-value">${layout.avatarSize}px</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-avatar-size"
                        min="30" max="200" step="5" value="${layout.avatarSize}">
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        头像圆角 <span class="beautify-popup-value" id="beautify-avatar-radius-value">${layout.avatarRadius}%</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-avatar-radius"
                        min="0" max="50" step="5" value="${layout.avatarRadius}">
                    <div class="beautify-popup-hint-small">0%=方形 50%=圆形</div>
                </div>
                <div class="beautify-popup-row" style="margin-top: 0.5em;">
                    <label class="beautify-popup-switch-compact">
                        <input type="checkbox" id="beautify-avatar-spin" ${layout.avatarSpin ? 'checked' : ''}>
                        <span>唱片旋转</span>
                    </label>
                    <div class="beautify-popup-hint-small" style="margin-left: 0.5em;">头像像唱片一样慢慢转动</div>
                </div>
            </div>

            <!-- 5. 信息偏移面板 -->
            <div class="beautify-layout-panel" data-layout-panel="info-offset">
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">偏移</div>
                        <div class="beautify-popup-dpad" data-target="info">
                            <button class="dpad-btn dpad-up" data-dir="up"><i class="fa-solid fa-caret-up"></i></button>
                            <button class="dpad-btn dpad-left" data-dir="left"><i class="fa-solid fa-caret-left"></i></button>
                            <span class="dpad-value" id="info-offset-value">${layout.infoOffsetX},${layout.infoOffsetY}</span>
                            <button class="dpad-btn dpad-right" data-dir="right"><i class="fa-solid fa-caret-right"></i></button>
                            <button class="dpad-btn dpad-down" data-dir="down"><i class="fa-solid fa-caret-down"></i></button>
                            <button class="dpad-btn dpad-reset" data-dir="reset"><i class="fa-solid fa-rotate-left"></i></button>
                        </div>
                    </div>
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        文字大小 <span class="beautify-popup-value" id="beautify-info-size-value">${layout.infoSize}x</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-info-size"
                        min="0.5" max="2" step="0.1" value="${layout.infoSize}">
                </div>
                <div class="beautify-popup-row">
                    <div class="beautify-popup-col">
                        <div class="beautify-popup-label">文字颜色（空=跟随主题）</div>
                        <div class="beautify-popup-color-wrapper">
                            <toolcool-color-picker id="beautify-info-color" color="${layout.infoColor || 'rgba(255,255,255,1)'}"></toolcool-color-picker>
                            <button class="beautify-popup-btn-small" id="beautify-info-color-reset" title="重置为跟随主题">
                                <i class="fa-solid fa-rotate-left"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 6. 消息间距面板 -->
            <div class="beautify-layout-panel" data-layout-panel="message-spacing">
                <div class="beautify-popup-hint">调整最新消息与悬浮栏之间的底部间距</div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        底部间距 <span class="beautify-popup-value" id="beautify-msg-padding-value">${layout.messageBottomPadding}px</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-msg-padding"
                        min="20" max="200" step="10" value="${layout.messageBottomPadding}">
                    <div class="beautify-popup-hint-small">默认80px，数值越大间距越大</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * 创建"背景"标签页内容
 * 使用下拉框切换：背景图 / 装饰条
 */
function createBackgroundTabContent() {
  const { background, decoration } = currentSettings;

  return `
        <div class="beautify-popup-panel" data-panel="background">
            <!-- 下拉框选择器 -->
            <div class="beautify-popup-select-wrapper">
                <select id="beautify-bg-select" class="beautify-popup-select">
                    <option value="bg-image">背景图</option>
                    <option value="decoration">装饰条</option>
                </select>
            </div>

            <!-- 背景图面板 -->
            <div class="beautify-bg-panel active" data-bg-panel="bg-image">
                <!-- 启用开关 + 预览（同一行） -->
                <div class="beautify-bg-header-row">
                    <label class="beautify-popup-switch-compact">
                        <input type="checkbox" id="beautify-bg-enabled" ${background.enabled ? 'checked' : ''}>
                        <span>启用</span>
                    </label>
                    <div class="beautify-bg-preview-inline" id="beautify-bg-preview">
                        ${background.imageUrl
      ? `<img src="${background.imageUrl}" alt="当前背景"><button class="beautify-bg-clear-btn" id="beautify-bg-clear" title="清除"><i class="fa-solid fa-xmark"></i></button>`
      : '<span class="beautify-bg-preview-placeholder">未设置</span>'}
                    </div>
                </div>

                <!-- 轮播设置 -->
                <div class="beautify-carousel-section">
                    <div class="beautify-carousel-header">
                        <label class="beautify-popup-switch-compact">
                            <input type="checkbox" id="beautify-carousel-enabled" ${background.carouselEnabled ? 'checked' : ''}>
                            <span>轮播模式</span>
                        </label>
                        <div class="beautify-carousel-options">
                            <select id="beautify-carousel-interval" class="beautify-carousel-select">
                                <option value="5" ${(background.carouselInterval || 8) === 5 ? 'selected' : ''}>5秒</option>
                                <option value="8" ${(background.carouselInterval || 8) === 8 ? 'selected' : ''}>8秒</option>
                                <option value="10" ${background.carouselInterval === 10 ? 'selected' : ''}>10秒</option>
                                <option value="15" ${background.carouselInterval === 15 ? 'selected' : ''}>15秒</option>
                                <option value="20" ${background.carouselInterval === 20 ? 'selected' : ''}>20秒</option>
                                <option value="30" ${background.carouselInterval === 30 ? 'selected' : ''}>30秒</option>
                            </select>
                            <select id="beautify-carousel-effect" class="beautify-carousel-select">
                                <option value="fade" ${(background.carouselEffect || 'fade') === 'fade' ? 'selected' : ''}>淡入淡出</option>
                                <option value="slide" ${background.carouselEffect === 'slide' ? 'selected' : ''}>左右滑动</option>
                                <option value="zoom" ${background.carouselEffect === 'zoom' ? 'selected' : ''}>缩放渐变</option>
                                <option value="blur" ${background.carouselEffect === 'blur' ? 'selected' : ''}>模糊过渡</option>
                            </select>
                        </div>
                    </div>
                    <div class="beautify-carousel-images" id="beautify-carousel-images">
                        ${renderCarouselImages(background.carouselImages || [])}
                    </div>
                    <div class="beautify-popup-hint-small">
                        <i class="fa-solid fa-circle-info"></i> 最多5张，建议8-15秒间隔
                    </div>
                </div>

                <!-- 添加方式选择 -->
                <div class="beautify-bg-source-tabs">
                    <button class="beautify-bg-source-tab active" data-source="system">系统背景</button>
                    <button class="beautify-bg-source-tab" data-source="upload">本地上传</button>
                    <button class="beautify-bg-source-tab" data-source="url">网络链接</button>
                    <button class="beautify-bg-source-tab" data-source="saved">我的存档</button>
                </div>

                <!-- 系统背景面板 -->
                <div class="beautify-bg-source-panel active" data-source-panel="system">
                    <div class="beautify-bg-grid" id="beautify-system-bg-grid">
                        <div class="beautify-bg-loading"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>
                    </div>
                </div>

                <!-- 本地上传面板 -->
                <div class="beautify-bg-source-panel" data-source-panel="upload">
                    <input type="file" id="beautify-bg-file-input" accept="image/*" style="display: none;">
                    <label for="beautify-bg-file-input" class="beautify-bg-upload-area">
                        <i class="fa-solid fa-upload"></i>
                        <span>点击选择图片</span>
                        <small>支持 JPG、PNG、GIF、WEBP</small>
                    </label>
                    <div class="beautify-popup-hint-small" style="margin-top: 0.5em;">
                        <i class="fa-solid fa-folder"></i> 本地存储路径：data/default-user/user/files/
                    </div>
                </div>

                <!-- 网络链接面板 -->
                <div class="beautify-bg-source-panel" data-source-panel="url">
                    <div class="beautify-bg-url-input-wrapper">
                        <input type="text" id="beautify-bg-url-input" class="beautify-bg-url-input" placeholder="粘贴图片链接（https://...）">
                        <button class="beautify-bg-url-btn" id="beautify-bg-url-add">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                </div>

                <!-- 我的存档面板 -->
                <div class="beautify-bg-source-panel" data-source-panel="saved">
                    <div class="beautify-bg-saved-hint">
                        <i class="fa-solid fa-circle-info"></i> 删除存档会同时删除本地文件
                    </div>
                    <div class="beautify-bg-grid" id="beautify-saved-bg-grid">
                        ${renderSavedImages(background.savedImages || [], 'bg')}
                    </div>
                    ${(background.savedImages || []).length === 0 ? '<div class="beautify-bg-empty">暂无存档，上传或添加链接后会自动保存</div>' : ''}
                </div>
            </div>

            <!-- 装饰条面板 -->
            <div class="beautify-bg-panel" data-bg-panel="decoration">
                <!-- 启用开关 + 预览（同一行） -->
                <div class="beautify-bg-header-row">
                    <label class="beautify-popup-switch-compact">
                        <input type="checkbox" id="beautify-deco-enabled" ${decoration.enabled ? 'checked' : ''}>
                        <span>启用</span>
                    </label>
                    <div class="beautify-bg-preview-inline beautify-deco-preview-inline" id="beautify-deco-preview">
                        ${decoration.imageUrl
      ? `<img src="${decoration.imageUrl}" alt="当前装饰条"><button class="beautify-bg-clear-btn" id="beautify-deco-clear" title="清除"><i class="fa-solid fa-xmark"></i></button>`
      : '<span class="beautify-bg-preview-placeholder">未设置</span>'}
                    </div>
                </div>

                <!-- 图片装饰条调整 -->
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        高度 <span class="beautify-popup-value" id="beautify-deco-height-value">${decoration.height}px</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-deco-height"
                        min="5" max="150" step="5" value="${decoration.height}">
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        底部偏移 <span class="beautify-popup-value" id="beautify-deco-bottom-value">${decoration.bottom}px</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-deco-bottom"
                        min="-100" max="100" step="5" value="${decoration.bottom}">
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        宽度 <span class="beautify-popup-value" id="beautify-deco-width-value">${decoration.width}%</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-deco-width"
                        min="10" max="200" step="5" value="${decoration.width}">
                </div>
                <div class="beautify-popup-section-compact">
                    <div class="beautify-popup-label">
                        水平位置 <span class="beautify-popup-value" id="beautify-deco-left-value">${decoration.left ?? 50}%</span>
                    </div>
                    <input type="range" class="beautify-popup-slider-compact" id="beautify-deco-left"
                        min="0" max="100" step="5" value="${decoration.left ?? 50}">
                    <div class="beautify-popup-hint-small">0%=最左 50%=居中 100%=最右</div>
                </div>
                <!-- CSS边框装饰 -->
                <div class="beautify-popup-label" style="margin-top: 0.75em;">
                    <label class="beautify-popup-switch-compact">
                        <input type="checkbox" id="beautify-border-deco-enabled" ${decoration.borderEnabled ? 'checked' : ''}>
                        <span>底部边框线</span>
                    </label>
                </div>
                <div class="beautify-border-deco-settings" style="display: ${decoration.borderEnabled ? 'block' : 'none'};">
                    <div class="beautify-popup-row">
                        <div class="beautify-popup-col">
                            <div class="beautify-popup-label">粗细 <span id="beautify-border-deco-width-value">${decoration.borderWidth ?? 2}px</span></div>
                            <input type="range" class="beautify-popup-slider-compact" id="beautify-border-deco-width"
                                min="1" max="10" step="1" value="${decoration.borderWidth ?? 2}">
                        </div>
                        <div class="beautify-popup-col">
                            <div class="beautify-popup-label">样式</div>
                            <select id="beautify-border-deco-style" class="beautify-carousel-select" style="width: 100%;">
                                <option value="solid" ${(decoration.borderStyle || 'solid') === 'solid' ? 'selected' : ''}>实线</option>
                                <option value="dashed" ${decoration.borderStyle === 'dashed' ? 'selected' : ''}>虚线</option>
                                <option value="dotted" ${decoration.borderStyle === 'dotted' ? 'selected' : ''}>点线</option>
                                <option value="double" ${decoration.borderStyle === 'double' ? 'selected' : ''}>双线</option>
                            </select>
                        </div>
                    </div>
                    <div class="beautify-popup-row">
                        <div class="beautify-popup-col">
                            <div class="beautify-popup-label">颜色</div>
                            <div class="beautify-popup-color-wrapper">
                                <toolcool-color-picker id="beautify-border-deco-color" color="${decoration.borderColor || 'rgba(255,255,255,0.3)'}"></toolcool-color-picker>
                            </div>
                        </div>
                    </div>
                    <div class="beautify-popup-section-compact">
                        <div class="beautify-popup-label">
                            位置偏移 <span class="beautify-popup-value" id="beautify-border-deco-bottom-value">${decoration.borderBottom ?? 0}px</span>
                        </div>
                        <input type="range" class="beautify-popup-slider-compact" id="beautify-border-deco-bottom"
                            min="-50" max="50" step="2" value="${decoration.borderBottom ?? 0}">
                        <div class="beautify-popup-hint-small">负值向下，正值向上</div>
                    </div>
                </div>

                <!-- 添加方式选择 -->
                <div class="beautify-popup-label" style="margin-top: 0.75em;">添加装饰条</div>
                <div class="beautify-bg-source-tabs" data-target="deco">
                    <button class="beautify-bg-source-tab active" data-source="upload">本地上传</button>
                    <button class="beautify-bg-source-tab" data-source="url">网络链接</button>
                    <button class="beautify-bg-source-tab" data-source="saved">我的存档</button>
                </div>

                <!-- 本地上传面板 -->
                <div class="beautify-deco-source-panel active" data-source-panel="upload">
                    <input type="file" id="beautify-deco-file-input" accept="image/*" style="display: none;">
                    <label for="beautify-deco-file-input" class="beautify-bg-upload-area">
                        <i class="fa-solid fa-upload"></i>
                        <span>点击选择图片</span>
                    </label>
                </div>

                <!-- 网络链接面板 -->
                <div class="beautify-deco-source-panel" data-source-panel="url">
                    <div class="beautify-bg-url-input-wrapper">
                        <input type="text" id="beautify-deco-url-input" class="beautify-bg-url-input" placeholder="粘贴图片链接（https://...）">
                        <button class="beautify-bg-url-btn" id="beautify-deco-url-add">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                </div>

                <!-- 我的存档面板 -->
                <div class="beautify-deco-source-panel" data-source-panel="saved">
                    <div class="beautify-bg-saved-hint">
                        <i class="fa-solid fa-circle-info"></i> 删除存档会同时删除本地文件
                    </div>
                    <div class="beautify-bg-grid" id="beautify-saved-deco-grid">
                        ${renderSavedImages(decoration.savedImages || [], 'deco')}
                    </div>
                    ${(decoration.savedImages || []).length === 0 ? '<div class="beautify-bg-empty">暂无存档</div>' : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * 渲染存档图片网格
 * @param {Array} images - 存档图片列表
 * @param {string} type - 'bg' 或 'deco'
 * @returns {string} HTML 字符串
 */
function renderSavedImages(images, type) {
  if (!images || images.length === 0) return '';

  return images.map(img => `
        <div class="beautify-bg-item" data-id="${img.id}" data-url="${img.url}" data-type="${type}">
            <img src="${img.url}" alt="${img.name || '存档图片'}">
            <button class="beautify-bg-item-delete" data-id="${img.id}" title="删除">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
}

/**
 * 渲染轮播图片列表
 * @param {Array} images - 轮播图片URL列表
 * @returns {string} HTML 字符串
 */
function renderCarouselImages(images) {
  if (!images || images.length === 0) {
    return '<div class="beautify-carousel-empty">点击下方图片添加到轮播</div>';
  }

  return images.map((url, index) => `
        <div class="beautify-carousel-item" data-index="${index}" data-url="${url}">
            <img src="${url}" alt="轮播图${index + 1}">
            <span class="beautify-carousel-index">${index + 1}</span>
            <button class="beautify-carousel-remove" title="移除">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `).join('');
}

/**
 * 创建"头像"标签页内容（占位）
 */
function createAvatarTabContent() {
  const { avatarFrame } = currentSettings;

  return `
        <div class="beautify-popup-panel" data-panel="avatar">
            <!-- 启用开关 + 预览（同一行） -->
            <div class="beautify-bg-header-row">
                <label class="beautify-popup-switch-compact">
                    <input type="checkbox" id="beautify-frame-enabled" ${avatarFrame.enabled ? 'checked' : ''}>
                    <span>启用头像框</span>
                </label>
                <div class="beautify-frame-preview" id="beautify-frame-preview">
                    ${avatarFrame.imageUrl
      ? `<img src="${avatarFrame.imageUrl}" alt="当前头像框"><button class="beautify-bg-clear-btn" id="beautify-frame-clear" title="清除"><i class="fa-solid fa-xmark"></i></button>`
      : '<span class="beautify-bg-preview-placeholder"><i class="fa-solid fa-image"></i></span>'}
                </div>
            </div>

            <!-- 位置偏移 -->
            <div class="beautify-popup-section-compact">
                <div class="beautify-popup-label">
                    X偏移 <span class="beautify-popup-value" id="beautify-frame-x-value">${avatarFrame.offsetX}px</span>
                </div>
                <input type="range" class="beautify-popup-slider-compact" id="beautify-frame-offset-x"
                    min="-100" max="100" step="2" value="${avatarFrame.offsetX}">
            </div>
            <div class="beautify-popup-section-compact">
                <div class="beautify-popup-label">
                    Y偏移 <span class="beautify-popup-value" id="beautify-frame-y-value">${avatarFrame.offsetY}px</span>
                </div>
                <input type="range" class="beautify-popup-slider-compact" id="beautify-frame-offset-y"
                    min="-100" max="100" step="2" value="${avatarFrame.offsetY}">
            </div>

            <!-- 缩放 -->
            <div class="beautify-popup-section-compact">
                <div class="beautify-popup-label">
                    缩放 <span class="beautify-popup-value" id="beautify-frame-scale-value">${avatarFrame.scale}x</span>
                </div>
                <input type="range" class="beautify-popup-slider-compact" id="beautify-frame-scale"
                    min="0.5" max="2" step="0.1" value="${avatarFrame.scale}">
                <div class="beautify-popup-hint-small">1x=原始大小</div>
            </div>

            <!-- 旋转 -->
            <div class="beautify-popup-section-compact">
                <div class="beautify-popup-label">
                    旋转 <span class="beautify-popup-value" id="beautify-frame-rotation-value">${avatarFrame.rotation ?? 0}°</span>
                </div>
                <input type="range" class="beautify-popup-slider-compact" id="beautify-frame-rotation"
                    min="0" max="360" step="15" value="${avatarFrame.rotation ?? 0}">
            </div>

            <!-- 添加方式选择 -->
            <div class="beautify-popup-label" style="margin-top: 0.75em;">添加头像框</div>
            <div class="beautify-bg-source-tabs" data-target="frame">
                <button class="beautify-bg-source-tab active" data-source="upload">本地上传</button>
                <button class="beautify-bg-source-tab" data-source="url">网络链接</button>
                <button class="beautify-bg-source-tab" data-source="saved">我的存档</button>
            </div>

            <!-- 本地上传面板 -->
            <div class="beautify-frame-source-panel active" data-source-panel="upload">
                <input type="file" id="beautify-frame-file-input" accept="image/*" style="display: none;">
                <label for="beautify-frame-file-input" class="beautify-bg-upload-area">
                    <i class="fa-solid fa-upload"></i>
                    <span>点击选择图片</span>
                    <small>建议使用PNG透明背景</small>
                </label>
            </div>

            <!-- 网络链接面板 -->
            <div class="beautify-frame-source-panel" data-source-panel="url">
                <div class="beautify-bg-url-input-wrapper">
                    <input type="text" id="beautify-frame-url-input" class="beautify-bg-url-input" placeholder="粘贴图片链接（https://...）">
                    <button class="beautify-bg-url-btn" id="beautify-frame-url-add">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>

            <!-- 我的存档面板 -->
            <div class="beautify-frame-source-panel" data-source-panel="saved">
                <div class="beautify-bg-saved-hint">
                    <i class="fa-solid fa-circle-info"></i> 删除存档会同时删除本地文件
                </div>
                <div class="beautify-bg-grid" id="beautify-saved-frame-grid">
                    ${renderSavedImages(avatarFrame.savedImages || [], 'frame')}
                </div>
                ${(avatarFrame.savedImages || []).length === 0 ? '<div class="beautify-bg-empty">暂无存档</div>' : ''}
            </div>
        </div>
    `;
}


// ==========================================
// 事件绑定
// ==========================================

/**
 * 绑定弹窗事件
 */
function bindPopupEvents() {
  if (!popupOverlay) return;

  // 点击关闭按钮
  const closeBtn = popupOverlay.querySelector('.beautify-popup-close');
  closeBtn?.addEventListener('click', closeBeautifyPopup);

  // ESC 键关闭
  const handleEsc = (e) => {
    if (e.key === 'Escape' && popupOverlay) {
      closeBeautifyPopup();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // 标签页切换
  const tabs = popupOverlay.querySelectorAll('.beautify-popup-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 预设设置
  bindPresetSettings();

  // 显示设置开关
  bindDisplaySwitches();

  // 布局设置
  bindLayoutSettings();

  // 背景设置
  bindBackgroundSettings();

  // 头像框设置
  bindAvatarFrameSettings();
}

/**
 * 切换标签页
 * @param {string} tabName - 标签页名称
 */
function switchTab(tabName) {
  if (!popupOverlay) return;

  // 更新标签页按钮状态
  const tabs = popupOverlay.querySelectorAll('.beautify-popup-tab');
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // 更新内容面板显示
  const panels = popupOverlay.querySelectorAll('.beautify-popup-panel');
  panels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });

  logger.debug('beautify', '[BeautifyPopup] 切换到标签页:', tabName);
}

/**
 * 绑定预设设置事件
 */
function bindPresetSettings() {
  if (!popupOverlay || !currentSettings) return;

  // 搜索框
  const searchInput = popupOverlay.querySelector('#beautify-preset-search');
  searchInput?.addEventListener('input', (e) => {
    presetSearchKeyword = e.target.value.trim();
    currentPresetPage = 1;
    refreshPresetList();
  });

  // 保存当前设置为预设
  const saveBtn = popupOverlay.querySelector('#beautify-preset-save');
  saveBtn?.addEventListener('click', () => saveAsPreset());

  // 预设列表点击事件（事件委托）
  const presetList = popupOverlay.querySelector('#beautify-preset-list');
  presetList?.addEventListener('click', (e) => {
    const loadBtn = e.target.closest('.beautify-preset-load');
    if (loadBtn) {
      loadPreset(loadBtn.dataset.id);
      return;
    }

    const deleteBtn = e.target.closest('.beautify-preset-delete');
    if (deleteBtn) {
      deletePreset(deleteBtn.dataset.id);
      return;
    }

    // 点击预设项也可以加载
    const presetItem = e.target.closest('.beautify-preset-item');
    if (presetItem && !e.target.closest('.beautify-preset-actions')) {
      loadPreset(presetItem.dataset.id);
    }
  });

  // 翻页按钮
  const pagination = popupOverlay.querySelector('#beautify-preset-pagination');
  pagination?.addEventListener('click', (e) => {
    const prevBtn = e.target.closest('#beautify-preset-prev');
    if (prevBtn && currentPresetPage > 1) {
      currentPresetPage--;
      refreshPresetList();
      return;
    }

    const nextBtn = e.target.closest('#beautify-preset-next');
    const totalPages = Math.ceil(getFilteredPresets().length / PRESETS_PER_PAGE) || 1;
    if (nextBtn && currentPresetPage < totalPages) {
      currentPresetPage++;
      refreshPresetList();
    }
  });
}

/**
 * 刷新预设列表和翻页
 */
function refreshPresetList() {
  const listEl = popupOverlay?.querySelector('#beautify-preset-list');
  const paginationEl = popupOverlay?.querySelector('#beautify-preset-pagination');
  if (listEl) listEl.innerHTML = renderPresetList();
  if (paginationEl) paginationEl.innerHTML = renderPresetPagination();
}

/**
 * 保存当前设置为预设
 */
async function saveAsPreset() {
  // 弹窗输入预设名称
  const name = await callGenericPopup('请输入预设名称：', POPUP_TYPE.INPUT, '我的预设');
  // 返回 false 表示取消，null 表示关闭，字符串表示输入值
  if (name === false || name === null) return;

  // 确保 name 是字符串并去除空格
  const presetName = String(name).trim() || '我的预设';

  const preset = {
    id: `preset_${Date.now()}`,
    name: presetName,
    settings: {
      display: JSON.parse(JSON.stringify(currentSettings.display)),
      layout: JSON.parse(JSON.stringify(currentSettings.layout)),
      background: {
        enabled: currentSettings.background.enabled,
        imageUrl: currentSettings.background.imageUrl,
        mode: currentSettings.background.mode,
        carouselEnabled: currentSettings.background.carouselEnabled,
        carouselImages: [...(currentSettings.background.carouselImages || [])],
        carouselInterval: currentSettings.background.carouselInterval,
        carouselEffect: currentSettings.background.carouselEffect
      },
      decoration: {
        enabled: currentSettings.decoration.enabled,
        imageUrl: currentSettings.decoration.imageUrl,
        height: currentSettings.decoration.height,
        bottom: currentSettings.decoration.bottom,
        width: currentSettings.decoration.width,
        left: currentSettings.decoration.left,
        borderEnabled: currentSettings.decoration.borderEnabled,
        borderWidth: currentSettings.decoration.borderWidth,
        borderStyle: currentSettings.decoration.borderStyle,
        borderColor: currentSettings.decoration.borderColor,
        borderBottom: currentSettings.decoration.borderBottom
      },
      avatarFrame: {
        enabled: currentSettings.avatarFrame.enabled,
        imageUrl: currentSettings.avatarFrame.imageUrl,
        offsetX: currentSettings.avatarFrame.offsetX,
        offsetY: currentSettings.avatarFrame.offsetY,
        scale: currentSettings.avatarFrame.scale,
        rotation: currentSettings.avatarFrame.rotation
      }
    },
    createdTime: Date.now()
  };

  // 添加到预设列表
  if (!currentSettings.presets) currentSettings.presets = [];
  currentSettings.presets.unshift(preset);

  // 保存并刷新
  savePopupSettings();
  currentPresetPage = 1;
  presetSearchKeyword = '';
  const searchInput = popupOverlay?.querySelector('#beautify-preset-search');
  if (searchInput) searchInput.value = '';
  refreshPresetList();

  toastr.success(`预设"${presetName}"已保存`);
  logger.info('beautify', '预设已保存:', presetName);
}

/**
 * 加载预设
 * @param {string} id - 预设ID
 */
function loadPreset(id) {
  const preset = currentSettings.presets?.find(p => p.id === id);
  if (!preset) {
    toastr.warning('预设不存在');
    return;
  }

  // 应用预设设置（深度合并）
  const { settings } = preset;

  // 显示设置
  if (settings.display) {
    Object.assign(currentSettings.display, settings.display);
  }

  // 布局设置
  if (settings.layout) {
    Object.assign(currentSettings.layout, settings.layout);
  }

  // 背景设置（不覆盖存档）
  if (settings.background) {
    currentSettings.background.enabled = settings.background.enabled;
    currentSettings.background.imageUrl = settings.background.imageUrl;
    currentSettings.background.mode = settings.background.mode;
    currentSettings.background.carouselEnabled = settings.background.carouselEnabled;
    currentSettings.background.carouselImages = settings.background.carouselImages || [];
    currentSettings.background.carouselInterval = settings.background.carouselInterval;
    currentSettings.background.carouselEffect = settings.background.carouselEffect;
  }

  // 装饰条设置（不覆盖存档）
  if (settings.decoration) {
    currentSettings.decoration.enabled = settings.decoration.enabled;
    currentSettings.decoration.imageUrl = settings.decoration.imageUrl;
    currentSettings.decoration.height = settings.decoration.height;
    currentSettings.decoration.bottom = settings.decoration.bottom;
    currentSettings.decoration.width = settings.decoration.width;
    currentSettings.decoration.left = settings.decoration.left;
    currentSettings.decoration.borderEnabled = settings.decoration.borderEnabled;
    currentSettings.decoration.borderWidth = settings.decoration.borderWidth;
    currentSettings.decoration.borderStyle = settings.decoration.borderStyle;
    currentSettings.decoration.borderColor = settings.decoration.borderColor;
    currentSettings.decoration.borderBottom = settings.decoration.borderBottom;
  }

  // 头像框设置（不覆盖存档）
  if (settings.avatarFrame) {
    currentSettings.avatarFrame.enabled = settings.avatarFrame.enabled;
    currentSettings.avatarFrame.imageUrl = settings.avatarFrame.imageUrl;
    currentSettings.avatarFrame.offsetX = settings.avatarFrame.offsetX;
    currentSettings.avatarFrame.offsetY = settings.avatarFrame.offsetY;
    currentSettings.avatarFrame.scale = settings.avatarFrame.scale;
    currentSettings.avatarFrame.rotation = settings.avatarFrame.rotation;
  }

  // 应用所有设置
  applyDisplaySettings();
  applyLayoutSettings();
  applyBackgroundSettings();
  applyAvatarFrameSettings();
  savePopupSettings();

  toastr.success(`已应用预设"${preset.name}"`);
  logger.info('beautify', '预设已加载:', preset.name);
}

/**
 * 删除预设
 * @param {string} id - 预设ID
 */
async function deletePreset(id) {
  const preset = currentSettings.presets?.find(p => p.id === id);
  if (!preset) return;

  const result = await callGenericPopup(`确定删除预设"${preset.name}"吗？`, POPUP_TYPE.CONFIRM);
  // CONFIRM 返回数字：1=确认，0=取消，null=关闭
  if (result !== 1) return;

  const index = currentSettings.presets.findIndex(p => p.id === id);
  if (index !== -1) {
    currentSettings.presets.splice(index, 1);
    savePopupSettings();
    refreshPresetList();
    toastr.success(`预设"${preset.name}"已删除`);
    logger.info('beautify', '预设已删除:', preset.name);
  }
}

/**
 * 绑定显示设置开关事件
 */
function bindDisplaySwitches() {
  if (!popupOverlay || !currentSettings) return;

  const switches = [
    { id: 'beautify-show-name', key: 'showName' },
    { id: 'beautify-show-time', key: 'showTime' },
    { id: 'beautify-show-tokens', key: 'showTokens' },
    { id: 'beautify-show-mesid', key: 'showMesId' },
    { id: 'beautify-show-avatar', key: 'showAvatar' }
  ];

  switches.forEach(({ id, key }) => {
    const checkbox = popupOverlay.querySelector(`#${id}`);
    checkbox?.addEventListener('change', (e) => {
      currentSettings.display[key] = e.target.checked;
      applyDisplaySettings();
      savePopupSettings();
      logger.info(`[BeautifyPopup] ${key} 设置为:`, e.target.checked);
    });
  });

  // 自定义CSS实时更新（和官方一样，input事件直接应用）
  const cssTextarea = popupOverlay.querySelector('#beautify-custom-css');
  cssTextarea?.addEventListener('input', (e) => {
    const css = e.target.value || '';
    currentSettings.customCSS = css;
    applyCustomCSS(css);
    savePopupSettings();
  });

  // 方案管理
  bindSchemeEvents();

  // CSS帮助按钮
  const helpBtn = popupOverlay.querySelector('#beautify-css-help');
  helpBtn?.addEventListener('click', showCssHelpPopup);
}

/**
 * 绑定方案管理事件
 */
function bindSchemeEvents() {
  if (!popupOverlay || !currentSettings) return;

  // 方案选择
  const schemeSelect = popupOverlay.querySelector('#beautify-scheme-select');
  schemeSelect?.addEventListener('change', (e) => {
    const schemeId = e.target.value;
    loadScheme(schemeId);
  });

  // 保存方案
  const saveBtn = popupOverlay.querySelector('#beautify-scheme-save');
  saveBtn?.addEventListener('click', saveCurrentScheme);

  // 导入方案
  const importBtn = popupOverlay.querySelector('#beautify-scheme-import');
  const importFile = popupOverlay.querySelector('#beautify-scheme-file');
  importBtn?.addEventListener('click', () => importFile?.click());
  importFile?.addEventListener('change', handleSchemeImport);

  // 导出方案
  const exportBtn = popupOverlay.querySelector('#beautify-scheme-export');
  exportBtn?.addEventListener('click', exportCurrentScheme);

  // 删除方案
  const deleteBtn = popupOverlay.querySelector('#beautify-scheme-delete');
  deleteBtn?.addEventListener('click', deleteCurrentScheme);
}

/**
 * 加载方案
 * @param {string} schemeId - 方案ID，空字符串表示默认方案
 */
function loadScheme(schemeId) {
  currentSettings.currentScheme = schemeId;

  if (!schemeId) {
    // 默认方案：清空CSS
    currentSettings.customCSS = '';
    currentSettings.display = {
      showName: true,
      showTime: true,
      showTokens: true,
      showMesId: true,
      showAvatar: true
    };
  } else {
    const scheme = currentSettings.schemes?.find(s => s.id === schemeId);
    if (scheme) {
      currentSettings.customCSS = scheme.customCSS || '';
      if (scheme.display) {
        currentSettings.display = { ...currentSettings.display, ...scheme.display };
      }
    }
  }

  // 更新UI
  const cssTextarea = popupOverlay?.querySelector('#beautify-custom-css');
  if (cssTextarea) {
    cssTextarea.value = currentSettings.customCSS;
  }

  // 更新显示开关
  const switches = [
    { id: 'beautify-show-name', key: 'showName' },
    { id: 'beautify-show-time', key: 'showTime' },
    { id: 'beautify-show-tokens', key: 'showTokens' },
    { id: 'beautify-show-mesid', key: 'showMesId' },
    { id: 'beautify-show-avatar', key: 'showAvatar' }
  ];
  switches.forEach(({ id, key }) => {
    const checkbox = popupOverlay?.querySelector(`#${id}`);
    if (checkbox) {
      checkbox.checked = currentSettings.display[key];
    }
  });

  // 应用设置
  applyCustomCSS(currentSettings.customCSS);
  applyDisplaySettings();
  savePopupSettings();

  logger.info('beautify', '已加载方案:', schemeId || '默认');
}

/**
 * 保存当前方案
 */
async function saveCurrentScheme() {
  const name = await callGenericPopup('请输入方案名称：', POPUP_TYPE.INPUT, '我的悬浮栏方案');
  if (name === false || name === null) return;

  const schemeName = String(name).trim() || '我的悬浮栏方案';

  const scheme = {
    id: `scheme_${Date.now()}`,
    name: schemeName,
    customCSS: currentSettings.customCSS || '',
    display: { ...currentSettings.display },
    createdTime: Date.now()
  };

  if (!currentSettings.schemes) currentSettings.schemes = [];
  currentSettings.schemes.push(scheme);
  currentSettings.currentScheme = scheme.id;

  // 更新下拉框
  refreshSchemeSelect();
  savePopupSettings();

  toastr.success(`方案"${schemeName}"已保存`);
  logger.info('beautify', '方案已保存:', schemeName);
}

/**
 * 导入方案
 * @param {Event} e - change事件
 */
async function handleSchemeImport(e) {
  const file = e.target?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed.name) {
      throw new Error('方案文件缺少名称');
    }

    // 检查是否已存在同名方案
    if (currentSettings.schemes?.some(s => s.name === parsed.name)) {
      const confirm = await callGenericPopup(`方案"${parsed.name}"已存在，是否覆盖？`, POPUP_TYPE.CONFIRM);
      if (!confirm) return;
      // 删除旧方案
      currentSettings.schemes = currentSettings.schemes.filter(s => s.name !== parsed.name);
    }

    const scheme = {
      id: `scheme_${Date.now()}`,
      name: parsed.name,
      customCSS: parsed.customCSS || '',
      display: parsed.display || {},
      createdTime: Date.now()
    };

    if (!currentSettings.schemes) currentSettings.schemes = [];
    currentSettings.schemes.push(scheme);

    // 自动切换到导入的方案
    loadScheme(scheme.id);
    refreshSchemeSelect();

    toastr.success(`方案"${parsed.name}"已导入`);
    logger.info('beautify', '方案已导入:', parsed.name);
  } catch (error) {
    toastr.error(String(error), '导入失败');
    logger.error('[BeautifyPopup] 导入方案失败:', error);
  } finally {
    e.target.value = null;
  }
}

/**
 * 导出当前方案
 */
function exportCurrentScheme() {
  const schemeId = currentSettings.currentScheme;
  let scheme;

  if (!schemeId) {
    // 导出当前设置为新方案
    scheme = {
      name: '悬浮栏方案',
      customCSS: currentSettings.customCSS || '',
      display: { ...currentSettings.display }
    };
  } else {
    scheme = currentSettings.schemes?.find(s => s.id === schemeId);
    if (!scheme) {
      toastr.warning('请先选择一个方案');
      return;
    }
  }

  const fileName = `${scheme.name}.json`;
  const data = {
    name: scheme.name,
    customCSS: scheme.customCSS,
    display: scheme.display
  };

  // 下载文件
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  toastr.success(`方案"${scheme.name}"已导出`);
  logger.info('beautify', '方案已导出:', scheme.name);
}

/**
 * 删除当前方案
 */
async function deleteCurrentScheme() {
  const schemeId = currentSettings.currentScheme;
  if (!schemeId) {
    toastr.warning('默认方案无法删除');
    return;
  }

  const scheme = currentSettings.schemes?.find(s => s.id === schemeId);
  if (!scheme) return;

  const confirm = await callGenericPopup(`确定要删除方案"${scheme.name}"吗？`, POPUP_TYPE.CONFIRM);
  if (!confirm) return;

  currentSettings.schemes = currentSettings.schemes.filter(s => s.id !== schemeId);
  loadScheme('');  // 切换回默认方案
  refreshSchemeSelect();

  toastr.info(`方案"${scheme.name}"已删除`);
  logger.info('beautify', '方案已删除:', scheme.name);
}

/**
 * 刷新方案下拉框
 */
function refreshSchemeSelect() {
  const select = popupOverlay?.querySelector('#beautify-scheme-select');
  if (!select) return;

  const schemes = currentSettings.schemes || [];
  const currentScheme = currentSettings.currentScheme || '';

  select.innerHTML = `
        <option value="">默认方案</option>
        ${schemes.map(s => `<option value="${s.id}" ${currentScheme === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
    `;
}

/**
 * 绑定布局设置事件
 */
function bindLayoutSettings() {
  if (!popupOverlay || !currentSettings) return;

  // 下拉框切换面板
  const layoutSelect = popupOverlay.querySelector('#beautify-layout-select');
  layoutSelect?.addEventListener('change', (e) => {
    const panelName = e.target.value;
    const panels = popupOverlay.querySelectorAll('.beautify-layout-panel');
    panels.forEach(panel => {
      panel.classList.toggle('active', panel.dataset.layoutPanel === panelName);
    });
  });

  // === 1. 头像位置面板 ===
  const positionBtns = popupOverlay.querySelectorAll('[data-layout-panel="position"] .beautify-popup-btn');
  positionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const position = btn.dataset.position;
      if (!position) return;
      currentSettings.layout.avatarPosition = position;
      positionBtns.forEach(b => b.classList.toggle('active', b.dataset.position === position));
      applyLayoutSettings();
      logger.info('beautify', '头像位置:', position);
    });
  });

  // 悬浮栏高度滑块
  bindSlider('beautify-header-height', 'beautify-height-value', 'headerHeight', 'px', parseInt);

  // === 1.5 背景圆角面板 ===
  bindSlider('beautify-bg-radius-tl', 'beautify-bg-tl-value', 'bgRadiusTopLeft', 'px', parseInt);
  bindSlider('beautify-bg-radius-tr', 'beautify-bg-tr-value', 'bgRadiusTopRight', 'px', parseInt);
  bindSlider('beautify-bg-radius-bl', 'beautify-bg-bl-value', 'bgRadiusBottomLeft', 'px', parseInt);
  bindSlider('beautify-bg-radius-br', 'beautify-bg-br-value', 'bgRadiusBottomRight', 'px', parseInt);

  // === 2. 头像边框面板 ===
  bindCheckbox('beautify-avatar-border', 'avatarBorder', '头像边框');
  bindSlider('beautify-border-width', 'beautify-border-width-value', 'avatarBorderWidth', 'px', parseInt);
  bindColorPicker('beautify-border-color', 'avatarBorderColor', '边框颜色');

  // === 3. 头像阴影面板 ===
  bindCheckbox('beautify-avatar-shadow', 'avatarShadow', '头像阴影');
  bindColorPicker('beautify-shadow-color', 'avatarShadowColor', '阴影颜色');

  // === 4. 头像偏移面板 ===
  bindDpad('avatar');
  bindSlider('beautify-avatar-size', 'beautify-avatar-size-value', 'avatarSize', 'px', parseInt);
  bindSlider('beautify-avatar-radius', 'beautify-avatar-radius-value', 'avatarRadius', '%', parseInt);
  bindCheckbox('beautify-avatar-spin', 'avatarSpin', '唱片旋转');

  // === 5. 信息偏移面板 ===
  bindDpad('info');
  bindSlider('beautify-info-size', 'beautify-info-size-value', 'infoSize', 'x', parseFloat);
  bindColorPicker('beautify-info-color', 'infoColor', '信息颜色');

  // 信息颜色重置按钮
  const infoColorReset = popupOverlay.querySelector('#beautify-info-color-reset');
  infoColorReset?.addEventListener('click', () => {
    currentSettings.layout.infoColor = '';
    const picker = popupOverlay.querySelector('#beautify-info-color');
    if (picker) picker.color = 'rgba(255,255,255,1)';
    applyLayoutSettings();
    logger.info('beautify', '信息颜色已重置');
  });

  // === 6. 消息间距面板 ===
  bindSlider('beautify-msg-padding', 'beautify-msg-padding-value', 'messageBottomPadding', 'px', parseInt);
}

/**
 * 绑定滑块事件（通用辅助函数）
 * @param {string} sliderId - 滑块元素的 ID
 * @param {string} valueId - 显示数值的元素 ID
 * @param {string} settingKey - currentSettings.layout 中的属性名
 * @param {string} unit - 显示单位（如 'px', '%', 'x'）
 * @param {Function} parser - 值解析函数（如 parseInt, parseFloat）
 */
function bindSlider(sliderId, valueId, settingKey, unit, parser) {
  const slider = popupOverlay?.querySelector(`#${sliderId}`);
  const valueEl = popupOverlay?.querySelector(`#${valueId}`);
  slider?.addEventListener('input', (e) => {
    const rawValue = e.target.value;
    const parsedValue = parser(rawValue);
    currentSettings.layout[settingKey] = parsedValue;
    // 显示值：透明度特殊处理
    if (unit === '%') {
      valueEl && (valueEl.textContent = `${rawValue}%`);
    } else {
      valueEl && (valueEl.textContent = `${parsedValue}${unit}`);
    }
    applyLayoutSettings();
  });
  slider?.addEventListener('change', () => {
    logger.info(`[BeautifyPopup] ${settingKey}:`, currentSettings.layout[settingKey]);
  });
}

/**
 * 绑定开关事件（通用辅助函数）
 * @param {string} checkboxId - 复选框元素的 ID
 * @param {string} settingKey - currentSettings.layout 中的属性名
 * @param {string} logName - 日志中显示的名称
 */
function bindCheckbox(checkboxId, settingKey, logName) {
  const checkbox = popupOverlay?.querySelector(`#${checkboxId}`);
  checkbox?.addEventListener('change', (e) => {
    currentSettings.layout[settingKey] = e.target.checked;
    applyLayoutSettings();
    logger.info(`[BeautifyPopup] ${logName}:`, e.target.checked);
  });
}

/**
 * 绑定颜色选择器事件（通用辅助函数）
 * @param {string} pickerId - 颜色选择器元素的 ID
 * @param {string} settingKey - currentSettings.layout 中的属性名
 * @param {string} logName - 日志中显示的名称
 */
function bindColorPicker(pickerId, settingKey, logName) {
  const picker = popupOverlay?.querySelector(`#${pickerId}`);
  picker?.addEventListener('change', (e) => {
    const color = e.detail?.rgba || e.target?.color;
    if (color) {
      currentSettings.layout[settingKey] = color;
      applyLayoutSettings();
      logger.info(`[BeautifyPopup] ${logName}:`, color);
    }
  });
}

/**
 * 绑定方向键控制器（通用辅助函数）
 * @param {string} target - 控制目标，'avatar'（头像偏移）或 'info'（信息偏移）
 */
function bindDpad(target) {
  const dpad = popupOverlay?.querySelector(`.beautify-popup-dpad[data-target="${target}"]`);
  if (!dpad) return;
  const btns = dpad.querySelectorAll('.dpad-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => handleDpadClick(target, btn.dataset.dir));
  });
}

/**
 * 处理方向键点击
 * @param {string} target - 'avatar' 或 'info'
 * @param {string} dir - 'up' | 'down' | 'left' | 'right' | 'reset'
 */
function handleDpadClick(target, dir) {
  const layout = currentSettings.layout;
  const step = 5; // 每次移动 5px
  const max = 100;
  const min = -100;

  // 获取当前偏移值
  let offsetX = target === 'avatar' ? layout.avatarOffsetX : layout.infoOffsetX;
  let offsetY = target === 'avatar' ? layout.avatarOffsetY : layout.infoOffsetY;

  // 根据方向调整
  switch (dir) {
    case 'up': offsetY = Math.max(min, offsetY - step); break;
    case 'down': offsetY = Math.min(max, offsetY + step); break;
    case 'left': offsetX = Math.max(min, offsetX - step); break;
    case 'right': offsetX = Math.min(max, offsetX + step); break;
    case 'reset': offsetX = 0; offsetY = 0; break;
  }

  // 保存新值
  if (target === 'avatar') {
    layout.avatarOffsetX = offsetX;
    layout.avatarOffsetY = offsetY;
  } else {
    layout.infoOffsetX = offsetX;
    layout.infoOffsetY = offsetY;
  }

  // 更新显示
  const valueEl = popupOverlay?.querySelector(`#${target}-offset-value`);
  if (valueEl) valueEl.textContent = `${offsetX},${offsetY}`;

  applyLayoutSettings();
}

/**
 * 应用布局设置到悬浮栏
 * 通过 CSS 变量控制所有布局相关样式
 */
export function applyLayoutSettings() {
  const stickyHeader = document.getElementById('beautify-sticky-header');
  if (!stickyHeader || !currentSettings) return;

  const { layout } = currentSettings;

  // 1. 头像位置
  stickyHeader.classList.toggle('avatar-center', layout.avatarPosition === 'center');
  stickyHeader.classList.toggle('avatar-sides', layout.avatarPosition === 'sides');
  stickyHeader.style.setProperty('--beautify-header-height', `${layout.headerHeight}px`);

  // 1.5 背景圆角（注意：用 ?? 而不是 ||，因为 0 是有效值）
  const tl = layout.bgRadiusTopLeft ?? 0;
  const tr = layout.bgRadiusTopRight ?? 0;
  const br = layout.bgRadiusBottomRight ?? 12;
  const bl = layout.bgRadiusBottomLeft ?? 12;
  stickyHeader.style.setProperty('--beautify-bg-radius', `${tl}px ${tr}px ${br}px ${bl}px`);

  // 2. 头像边框
  stickyHeader.classList.toggle('avatar-no-border', !layout.avatarBorder);
  stickyHeader.style.setProperty('--beautify-avatar-border-width', `${layout.avatarBorderWidth}px`);
  stickyHeader.style.setProperty('--beautify-avatar-border-color', layout.avatarBorderColor);

  // 3. 头像阴影
  stickyHeader.classList.toggle('avatar-no-shadow', !layout.avatarShadow);
  stickyHeader.style.setProperty('--beautify-avatar-shadow-color', layout.avatarShadowColor);

  // 4. 头像偏移 + 大小 + 圆角
  stickyHeader.style.setProperty('--beautify-avatar-offset-x', `${layout.avatarOffsetX || 0}px`);
  stickyHeader.style.setProperty('--beautify-avatar-offset-y', `${layout.avatarOffsetY || 0}px`);
  stickyHeader.style.setProperty('--beautify-avatar-size', `${layout.avatarSize}px`);
  stickyHeader.style.setProperty('--beautify-avatar-radius', `${layout.avatarRadius ?? 50}%`);

  // 5. 信息偏移 + 大小 + 颜色
  stickyHeader.style.setProperty('--beautify-info-offset-x', `${layout.infoOffsetX || 0}px`);
  stickyHeader.style.setProperty('--beautify-info-offset-y', `${layout.infoOffsetY || 0}px`);
  stickyHeader.style.setProperty('--beautify-info-size', `${layout.infoSize}`);
  // 信息颜色：空值时不设置，让 CSS 继承主题色
  if (layout.infoColor) {
    stickyHeader.style.setProperty('--beautify-info-color', layout.infoColor);
  } else {
    stickyHeader.style.removeProperty('--beautify-info-color');
  }

  // 6. 头像旋转（唱片效果）
  stickyHeader.classList.toggle('avatar-spin', !!layout.avatarSpin);

  // 7. 消息间距（设置CSS变量到body，让CSS规则生效）
  document.body.style.setProperty('--beautify-msg-bottom-padding', `${layout.messageBottomPadding ?? 80}px`);

  logger.debug('[BeautifyPopup] 布局设置已应用:', layout);
}


// ==========================================
// 背景设置
// ==========================================

/**
 * 绑定背景设置事件
 */
function bindBackgroundSettings() {
  if (!popupOverlay || !currentSettings) return;

  // 下拉框切换面板（背景图/装饰条）
  const bgSelect = popupOverlay.querySelector('#beautify-bg-select');
  bgSelect?.addEventListener('change', (e) => {
    const panelName = e.target.value;
    const panels = popupOverlay.querySelectorAll('.beautify-bg-panel');
    panels.forEach(panel => {
      panel.classList.toggle('active', panel.dataset.bgPanel === panelName);
    });
  });

  // === 背景图设置 ===
  bindBgImageSettings();

  // === 装饰条设置 ===
  bindDecorationSettings();
}

/**
 * 绑定背景图设置事件
 */
function bindBgImageSettings() {
  // 启用开关
  const bgEnabled = popupOverlay.querySelector('#beautify-bg-enabled');
  bgEnabled?.addEventListener('change', (e) => {
    currentSettings.background.enabled = e.target.checked;
    applyBackgroundSettings();
    logger.info('beautify', '背景图启用:', e.target.checked);
  });

  // 清除背景按钮
  const bgClear = popupOverlay.querySelector('#beautify-bg-clear');
  bgClear?.addEventListener('click', () => {
    currentSettings.background.imageUrl = '';
    updateBgPreview('');
    applyBackgroundSettings();
    logger.info('beautify', '背景图已清除');
  });

  // 来源标签页切换
  const sourceTabs = popupOverlay.querySelectorAll('[data-panel="background"] .beautify-bg-source-tabs:not([data-target]) .beautify-bg-source-tab');
  sourceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const source = tab.dataset.source;
      // 更新标签状态
      sourceTabs.forEach(t => t.classList.toggle('active', t.dataset.source === source));
      // 更新面板显示
      const panels = popupOverlay.querySelectorAll('.beautify-bg-source-panel');
      panels.forEach(p => p.classList.toggle('active', p.dataset.sourcePanel === source));
      // 如果切换到系统背景，加载列表
      if (source === 'system') {
        loadSystemBackgrounds();
      }
    });
  });

  // 加载系统背景（默认显示）
  loadSystemBackgrounds();

  // 本地上传
  const fileInput = popupOverlay.querySelector('#beautify-bg-file-input');
  fileInput?.addEventListener('change', (e) => handleBgFileUpload(e, 'bg'));

  // 网络链接添加
  const urlAddBtn = popupOverlay.querySelector('#beautify-bg-url-add');
  urlAddBtn?.addEventListener('click', () => handleBgUrlAdd('bg'));

  // 存档图片点击选择
  const savedGrid = popupOverlay.querySelector('#beautify-saved-bg-grid');
  savedGrid?.addEventListener('click', (e) => handleSavedImageClick(e, 'bg'));

  // === 轮播设置 ===
  bindCarouselSettings();
}

/**
 * 绑定轮播设置事件
 *
 * @description
 * 绑定轮播相关的所有事件监听器：
 * - 轮播启用开关
 * - 轮播间隔输入框（3-15秒）
 * - 轮播图片列表的移除按钮
 */
function bindCarouselSettings() {
  // 轮播启用开关
  const carouselEnabled = popupOverlay.querySelector('#beautify-carousel-enabled');
  carouselEnabled?.addEventListener('change', (e) => {
    currentSettings.background.carouselEnabled = e.target.checked;
    applyBackgroundSettings();
    logger.info('beautify', '轮播模式:', e.target.checked ? '启用' : '禁用');
  });

  // 轮播间隔（下拉框）
  const intervalSelect = popupOverlay.querySelector('#beautify-carousel-interval');
  intervalSelect?.addEventListener('change', (e) => {
    const value = parseInt(e.target.value) || 5;
    currentSettings.background.carouselInterval = value;
    applyBackgroundSettings();
    logger.info('beautify', '轮播间隔:', value, '秒');
  });

  // 轮播动画效果（下拉框）
  const effectSelect = popupOverlay.querySelector('#beautify-carousel-effect');
  effectSelect?.addEventListener('change', (e) => {
    currentSettings.background.carouselEffect = e.target.value;
    applyBackgroundSettings();
    logger.info('beautify', '轮播效果:', e.target.value);
  });

  // 轮播图片移除
  const carouselImages = popupOverlay.querySelector('#beautify-carousel-images');
  carouselImages?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.beautify-carousel-remove');
    if (removeBtn) {
      e.stopPropagation();
      const item = removeBtn.closest('.beautify-carousel-item');
      const index = parseInt(item?.dataset.index);
      if (!isNaN(index)) {
        removeFromCarousel(index);
      }
    }
  });
}

/**
 * 添加图片到轮播
 * @param {string} url - 图片URL
 */
function addToCarousel(url) {
  if (!url) return;

  const images = currentSettings.background.carouselImages || [];

  // 检查是否已存在
  if (images.includes(url)) {
    toastr.warning('该图片已在轮播列表中');
    return;
  }

  // 最多5张
  if (images.length >= 5) {
    toastr.warning('轮播最多支持5张图片');
    return;
  }

  images.push(url);
  currentSettings.background.carouselImages = images;

  // 更新UI
  updateCarouselUI();
  applyBackgroundSettings();
  logger.info('beautify', '添加到轮播:', url);
  toastr.success('已添加到轮播');
}

/**
 * 从轮播移除图片
 * @param {number} index - 图片索引
 */
function removeFromCarousel(index) {
  const images = currentSettings.background.carouselImages || [];
  if (index < 0 || index >= images.length) return;

  const removed = images.splice(index, 1);
  currentSettings.background.carouselImages = images;

  // 更新UI
  updateCarouselUI();
  applyBackgroundSettings();
  logger.info('beautify', '从轮播移除:', removed[0]);
}

/**
 * 更新轮播UI
 */
function updateCarouselUI() {
  const container = popupOverlay?.querySelector('#beautify-carousel-images');
  if (!container) return;

  const images = currentSettings.background.carouselImages || [];
  container.innerHTML = renderCarouselImages(images);
}

/**
 * 绑定装饰条设置事件
 */
function bindDecorationSettings() {
  // 启用开关
  const decoEnabled = popupOverlay.querySelector('#beautify-deco-enabled');
  decoEnabled?.addEventListener('change', (e) => {
    currentSettings.decoration.enabled = e.target.checked;
    applyBackgroundSettings();
    logger.info('beautify', '装饰条启用:', e.target.checked);
  });

  // 清除装饰条按钮
  const decoClear = popupOverlay.querySelector('#beautify-deco-clear');
  decoClear?.addEventListener('click', () => {
    currentSettings.decoration.imageUrl = '';
    updateDecoPreview('');
    applyBackgroundSettings();
    logger.info('beautify', '装饰条已清除');
  });

  // 装饰条滑块
  bindDecoSlider('beautify-deco-height', 'beautify-deco-height-value', 'height', 'px');
  bindDecoSlider('beautify-deco-bottom', 'beautify-deco-bottom-value', 'bottom', 'px');
  bindDecoSlider('beautify-deco-width', 'beautify-deco-width-value', 'width', '%');
  bindDecoSlider('beautify-deco-left', 'beautify-deco-left-value', 'left', '%');

  // CSS边框装饰
  const borderEnabled = popupOverlay.querySelector('#beautify-border-deco-enabled');
  const borderSettings = popupOverlay.querySelector('.beautify-border-deco-settings');
  borderEnabled?.addEventListener('change', (e) => {
    currentSettings.decoration.borderEnabled = e.target.checked;
    if (borderSettings) borderSettings.style.display = e.target.checked ? 'block' : 'none';
    applyBackgroundSettings();
    logger.info('beautify', '边框装饰:', e.target.checked ? '启用' : '禁用');
  });

  // 边框粗细
  bindDecoSlider('beautify-border-deco-width', 'beautify-border-deco-width-value', 'borderWidth', 'px');

  // 边框样式
  const borderStyle = popupOverlay.querySelector('#beautify-border-deco-style');
  borderStyle?.addEventListener('change', (e) => {
    currentSettings.decoration.borderStyle = e.target.value;
    applyBackgroundSettings();
  });

  // 边框颜色
  const borderColor = popupOverlay.querySelector('#beautify-border-deco-color');
  borderColor?.addEventListener('change', (e) => {
    currentSettings.decoration.borderColor = e.detail.rgba;
    applyBackgroundSettings();
  });

  // 边框位置偏移
  bindDecoSlider('beautify-border-deco-bottom', 'beautify-border-deco-bottom-value', 'borderBottom', 'px');

  // 来源标签页切换
  const sourceTabs = popupOverlay.querySelectorAll('.beautify-bg-source-tabs[data-target="deco"] .beautify-bg-source-tab');
  sourceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const source = tab.dataset.source;
      sourceTabs.forEach(t => t.classList.toggle('active', t.dataset.source === source));
      const panels = popupOverlay.querySelectorAll('.beautify-deco-source-panel');
      panels.forEach(p => p.classList.toggle('active', p.dataset.sourcePanel === source));
    });
  });

  // 本地上传
  const fileInput = popupOverlay.querySelector('#beautify-deco-file-input');
  fileInput?.addEventListener('change', (e) => handleBgFileUpload(e, 'deco'));

  // 网络链接添加
  const urlAddBtn = popupOverlay.querySelector('#beautify-deco-url-add');
  urlAddBtn?.addEventListener('click', () => handleBgUrlAdd('deco'));

  // 存档图片点击选择
  const savedGrid = popupOverlay.querySelector('#beautify-saved-deco-grid');
  savedGrid?.addEventListener('click', (e) => handleSavedImageClick(e, 'deco'));
}

/**
 * 绑定装饰条滑块
 */
function bindDecoSlider(sliderId, valueId, key, unit) {
  const slider = popupOverlay?.querySelector(`#${sliderId}`);
  const valueEl = popupOverlay?.querySelector(`#${valueId}`);
  slider?.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    currentSettings.decoration[key] = value;
    valueEl && (valueEl.textContent = `${value}${unit}`);
    applyBackgroundSettings();
  });
}

/**
 * 加载系统背景列表
 */
async function loadSystemBackgrounds() {
  const grid = popupOverlay?.querySelector('#beautify-system-bg-grid');
  if (!grid) return;

  try {
    const response = await fetch('/api/backgrounds/all', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({})
    });

    if (!response.ok) {
      grid.innerHTML = '<div class="beautify-bg-error">加载失败</div>';
      return;
    }

    const { images } = await response.json();

    if (!images || images.length === 0) {
      grid.innerHTML = '<div class="beautify-bg-empty">暂无系统背景</div>';
      return;
    }

    // 渲染背景图网格
    grid.innerHTML = images.map(bg => `
            <div class="beautify-bg-item" data-url="/backgrounds/${bg}" data-type="system">
                <img src="/backgrounds/${bg}" alt="${bg}" loading="lazy">
            </div>
        `).join('');

    // 绑定点击事件
    grid.querySelectorAll('.beautify-bg-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        selectBgImage(url, 'bg');
      });
    });

    logger.debug('[BeautifyPopup] 系统背景已加载:', images.length);
  } catch (error) {
    logger.error('[BeautifyPopup] 加载系统背景失败:', error);
    grid.innerHTML = '<div class="beautify-bg-error">加载失败</div>';
  }
}

/**
 * 处理本地文件上传
 * @param {Event} e - change 事件
 * @param {string} type - 'bg' 或 'deco'
 */
async function handleBgFileUpload(e, type) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    // 读取文件为 base64
    const base64Data = await fileToBase64(file);

    // 生成文件名（使用前缀区分）
    const timestamp = Date.now();
    const ext = file.name.split('.').pop();
    const prefix = type === 'bg' ? 'beautify_bg' : 'beautify_deco';
    const fileName = `acsus-paws-puffs_${prefix}_${timestamp}.${ext}`;

    // 上传到服务器
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({
        name: fileName,
        data: base64Data
      })
    });

    if (!response.ok) {
      throw new Error(`上传失败（状态码：${response.status}）`);
    }

    const result = await response.json();
    const filePath = result.path;

    // 保存到存档
    const savedImage = {
      id: `${prefix}_${timestamp}`,
      name: file.name,
      url: filePath,
      type: 'local',
      addedTime: timestamp
    };

    if (type === 'bg') {
      currentSettings.background.savedImages.push(savedImage);
      selectBgImage(filePath, 'bg');
      refreshSavedGrid('bg');
    } else {
      currentSettings.decoration.savedImages.push(savedImage);
      selectBgImage(filePath, 'deco');
      refreshSavedGrid('deco');
    }

    logger.info(`[BeautifyPopup] ${type === 'bg' ? '背景图' : '装饰条'}上传成功:`, filePath);
  } catch (error) {
    logger.error('[BeautifyPopup] 上传失败:', error);
    alert('上传失败：' + error.message);
  }

  // 清空 input，允许重复选择同一文件
  e.target.value = '';
}

/**
 * 处理网络链接添加
 * @param {string} type - 'bg' 或 'deco'
 */
function handleBgUrlAdd(type) {
  const inputId = type === 'bg' ? 'beautify-bg-url-input' : 'beautify-deco-url-input';
  const input = popupOverlay?.querySelector(`#${inputId}`);
  const url = input?.value?.trim();

  if (!url) {
    alert('请输入图片链接');
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('请输入有效的图片链接（需要 http:// 或 https://）');
    return;
  }

  // 保存到存档
  const timestamp = Date.now();
  const prefix = type === 'bg' ? 'beautify_bg' : 'beautify_deco';
  const savedImage = {
    id: `${prefix}_url_${timestamp}`,
    name: url.split('/').pop() || '网络图片',
    url: url,
    type: 'url',
    addedTime: timestamp
  };

  if (type === 'bg') {
    currentSettings.background.savedImages.push(savedImage);
    selectBgImage(url, 'bg');
    refreshSavedGrid('bg');
  } else {
    currentSettings.decoration.savedImages.push(savedImage);
    selectBgImage(url, 'deco');
    refreshSavedGrid('deco');
  }

  // 清空输入框
  if (input) input.value = '';

  logger.info(`[BeautifyPopup] ${type === 'bg' ? '背景图' : '装饰条'}链接已添加:`, url);
}

/**
 * 处理存档图片点击
 * @param {Event} e - click 事件
 * @param {string} type - 'bg' | 'deco' | 'frame'
 */
async function handleSavedImageClick(e, type) {
  const target = e.target;

  // 删除按钮
  const deleteBtn = target.closest('.beautify-bg-item-delete');
  if (deleteBtn) {
    e.stopPropagation();
    const id = deleteBtn.dataset.id;
    await deleteSavedImage(id, type);
    return;
  }

  // 选择图片
  const item = target.closest('.beautify-bg-item');
  if (item) {
    const url = item.dataset.url;
    // 头像框使用专门的选择函数
    if (type === 'frame') {
      selectFrameImage(url);
    } else {
      selectBgImage(url, type);
    }
  }
}

/**
 * 删除存档图片
 * @param {string} id - 图片 ID
 * @param {string} type - 'bg' | 'deco' | 'frame'
 */
async function deleteSavedImage(id, type) {
  // 根据类型获取对应的设置对象
  let settings;
  if (type === 'bg') {
    settings = currentSettings.background;
  } else if (type === 'deco') {
    settings = currentSettings.decoration;
  } else if (type === 'frame') {
    settings = currentSettings.avatarFrame;
  } else {
    return;
  }

  const index = settings.savedImages.findIndex(img => img.id === id);
  if (index === -1) return;

  const image = settings.savedImages[index];

  // 如果是本地文件，删除服务器上的文件
  if (image.type === 'local') {
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path: image.url })
      });
      logger.info('beautify', '已删除本地文件:', image.url);
    } catch (error) {
      logger.warn('beautify', '删除本地文件失败:', error);
    }
  }

  // 从存档中移除
  settings.savedImages.splice(index, 1);

  // 如果当前使用的就是这张图，清除
  if (settings.imageUrl === image.url) {
    settings.imageUrl = '';
    if (type === 'bg') {
      updateBgPreview('');
      applyBackgroundSettings();
    } else if (type === 'deco') {
      updateDecoPreview('');
      applyBackgroundSettings();
    } else if (type === 'frame') {
      updateFramePreview('');
      applyAvatarFrameSettings();
    }
  }

  // 刷新网格
  if (type === 'frame') {
    refreshFrameSavedGrid();
  } else {
    refreshSavedGrid(type);
  }

  logger.info('beautify', '存档图片已删除:', id);
}

/**
 * 选择背景图/装饰条
 * 如果是背景图且轮播模式启用，会添加到轮播列表而不是设为当前背景
 * @param {string} url - 图片 URL
 * @param {string} type - 'bg' 或 'deco'
 */
function selectBgImage(url, type) {
  if (type === 'bg') {
    // 如果轮播模式启用，添加到轮播而不是设为当前背景
    if (currentSettings.background.carouselEnabled) {
      addToCarousel(url);
      return;
    }

    currentSettings.background.imageUrl = url;
    currentSettings.background.enabled = true;
    updateBgPreview(url);
    // 更新启用开关
    const checkbox = popupOverlay?.querySelector('#beautify-bg-enabled');
    if (checkbox) checkbox.checked = true;
  } else {
    currentSettings.decoration.imageUrl = url;
    currentSettings.decoration.enabled = true;
    updateDecoPreview(url);
    const checkbox = popupOverlay?.querySelector('#beautify-deco-enabled');
    if (checkbox) checkbox.checked = true;
  }

  applyBackgroundSettings();
  logger.info(`[BeautifyPopup] ${type === 'bg' ? '背景图' : '装饰条'}已选择:`, url);
}

/**
 * 更新背景图预览（内联版）
 * @param {string} url - 图片 URL
 */
function updateBgPreview(url) {
  const preview = popupOverlay?.querySelector('#beautify-bg-preview');
  if (!preview) return;

  if (url) {
    // 清除按钮在预览容器内部
    preview.innerHTML = `
            <img src="${url}" alt="当前背景">
            <button class="beautify-bg-clear-btn" id="beautify-bg-clear" title="清除">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
    // 绑定清除按钮事件
    const clearBtn = preview.querySelector('.beautify-bg-clear-btn');
    clearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSettings.background.imageUrl = '';
      updateBgPreview('');
      applyBackgroundSettings();
    });
  } else {
    preview.innerHTML = '<span class="beautify-bg-preview-placeholder">未设置</span>';
  }
}

/**
 * 更新装饰条预览（内联版）
 * @param {string} url - 图片 URL
 */
function updateDecoPreview(url) {
  const preview = popupOverlay?.querySelector('#beautify-deco-preview');
  if (!preview) return;

  if (url) {
    preview.innerHTML = `
            <img src="${url}" alt="当前装饰条">
            <button class="beautify-bg-clear-btn" id="beautify-deco-clear" title="清除">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
    const clearBtn = preview.querySelector('.beautify-bg-clear-btn');
    clearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSettings.decoration.imageUrl = '';
      updateDecoPreview('');
      applyBackgroundSettings();
    });
  } else {
    preview.innerHTML = '<span class="beautify-bg-preview-placeholder">未设置</span>';
  }
}

/**
 * 刷新存档网格
 * @param {string} type - 'bg' 或 'deco'
 */
function refreshSavedGrid(type) {
  const gridId = type === 'bg' ? 'beautify-saved-bg-grid' : 'beautify-saved-deco-grid';
  const grid = popupOverlay?.querySelector(`#${gridId}`);
  if (!grid) return;

  const images = type === 'bg'
    ? (currentSettings.background.savedImages || [])
    : (currentSettings.decoration.savedImages || []);

  grid.innerHTML = renderSavedImages(images, type);

  // 更新空提示
  const panel = grid.parentElement;
  let emptyHint = panel?.querySelector('.beautify-bg-empty');
  if (images.length === 0) {
    if (!emptyHint) {
      emptyHint = document.createElement('div');
      emptyHint.className = 'beautify-bg-empty';
      emptyHint.textContent = '暂无存档';
      panel?.appendChild(emptyHint);
    }
  } else {
    emptyHint?.remove();
  }
}

/**
 * 将文件转换为 Base64
 * @param {File} file - 文件对象
 * @returns {Promise<string>} Base64 字符串（不含前缀）
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 轮播定时器
let carouselTimer = null;
let carouselIndex = 0;

/**
 * 应用背景设置到悬浮栏
 */
export function applyBackgroundSettings() {
  const stickyHeader = document.getElementById('beautify-sticky-header');
  if (!stickyHeader || !currentSettings) return;

  const { background, decoration } = currentSettings;
  const bgContainer = stickyHeader.querySelector('.beautify-bg-container');
  const bgElement = stickyHeader.querySelector('.beautify-bg');

  // 清除旧的轮播定时器
  if (carouselTimer) {
    clearInterval(carouselTimer);
    carouselTimer = null;
  }

  // 背景图
  if (bgElement) {
    // 轮播模式
    if (background.carouselEnabled && background.carouselImages?.length > 0) {
      bgElement.style.backgroundColor = 'transparent';  // 有背景图时透明
      startCarousel(bgElement, background);
    }
    // 静态背景
    else if (background.enabled && background.imageUrl) {
      bgElement.style.backgroundImage = `url('${background.imageUrl}')`;
      bgElement.style.backgroundSize = background.mode || 'cover';
      bgElement.style.backgroundPosition = 'center';
      bgElement.style.backgroundColor = 'transparent';  // 有背景图时透明
    } else {
      bgElement.style.backgroundImage = '';
      bgElement.style.backgroundColor = '';  // 恢复默认系统配色
    }
  }

  // 图片装饰条
  let decoElement = stickyHeader.querySelector('.beautify-decoration');
  if (decoration.enabled && decoration.imageUrl) {
    if (!decoElement) {
      decoElement = document.createElement('div');
      decoElement.className = 'beautify-decoration';
      bgContainer?.appendChild(decoElement);
    }
    decoElement.style.backgroundImage = `url('${decoration.imageUrl}')`;
    decoElement.style.height = `${decoration.height}px`;
    decoElement.style.bottom = `${decoration.bottom}px`;
    decoElement.style.width = `${decoration.width}%`;
    // 水平位置
    const leftPos = decoration.left ?? 50;
    decoElement.style.left = `${leftPos}%`;
    decoElement.style.transform = `translateX(-${leftPos}%)`;
    decoElement.style.display = 'block';
  } else if (decoElement) {
    decoElement.style.display = 'none';
  }

  // CSS边框装饰
  let borderDeco = stickyHeader.querySelector('.beautify-border-decoration');
  if (decoration.borderEnabled) {
    if (!borderDeco) {
      borderDeco = document.createElement('div');
      borderDeco.className = 'beautify-border-decoration';
      bgContainer?.appendChild(borderDeco);
    }
    borderDeco.style.borderBottom = `${decoration.borderWidth ?? 2}px ${decoration.borderStyle || 'solid'} ${decoration.borderColor || 'rgba(255,255,255,0.3)'}`;
    borderDeco.style.bottom = `${decoration.borderBottom ?? 0}px`;
    borderDeco.style.display = 'block';
  } else if (borderDeco) {
    borderDeco.style.display = 'none';
  }

  logger.debug('beautify', '[BeautifyPopup] 背景设置已应用');
}

/**
 * 启动背景轮播
 *
 * @description
 * 支持4种切换效果：fade(淡入淡出)、slide(左右滑动)、zoom(缩放)、blur(模糊)
 *
 * @param {HTMLElement} bgElement - 背景元素
 * @param {Object} background - 背景设置
 * @param {string[]} background.carouselImages - 轮播图片URL数组
 * @param {number} [background.carouselInterval=5] - 切换间隔（秒）
 * @param {string} [background.carouselEffect='fade'] - 动画效果类型
 * @param {string} [background.mode='cover'] - 背景图显示模式
 */
function startCarousel(bgElement, background) {
  const images = background.carouselImages;
  const interval = (background.carouselInterval || 5) * 1000;
  const effect = background.carouselEffect || 'fade';

  if (images.length === 0) return;

  // 设置初始背景
  carouselIndex = 0;
  bgElement.style.backgroundImage = `url('${images[carouselIndex]}')`;
  bgElement.style.backgroundSize = background.mode || 'cover';
  bgElement.style.backgroundPosition = 'center';

  // 重置所有过渡效果相关的样式
  bgElement.style.opacity = '1';
  bgElement.style.transform = 'scale(1) translateX(0)';
  bgElement.style.filter = 'blur(0)';

  // 如果只有一张图，不需要轮播
  if (images.length === 1) return;

  // 根据效果设置过渡
  const transitions = {
    fade: 'opacity 0.8s ease',
    slide: 'transform 0.8s ease, opacity 0.8s ease',
    zoom: 'transform 1s ease, opacity 0.8s ease',
    blur: 'filter 0.6s ease, opacity 0.8s ease'
  };
  bgElement.style.transition = transitions[effect] || transitions.fade;

  // 启动定时器
  carouselTimer = setInterval(() => {
    applyCarouselEffect(bgElement, effect, 'out');

    setTimeout(() => {
      // 切换图片
      carouselIndex = (carouselIndex + 1) % images.length;
      bgElement.style.backgroundImage = `url('${images[carouselIndex]}')`;

      // 淡入效果
      applyCarouselEffect(bgElement, effect, 'in');
    }, effect === 'blur' ? 400 : 500);
  }, interval);

  logger.debug('[BeautifyPopup] 轮播已启动，效果:', effect, '图片数:', images.length);
}

/**
 * 应用轮播动画效果
 *
 * @description
 * 根据效果类型应用不同的CSS动画。每种效果都有"淡出"和"淡入"两个阶段。
 *
 * 【如何添加新效果】
 * 1. 在 createBackgroundTabContent() 的下拉框中添加新选项：
 *    `<option value="newEffect">新效果名称</option>`
 * 2. 在 startCarousel() 的 transitions 对象中添加过渡定义：
 *    `newEffect: 'transform 0.8s ease, opacity 0.8s ease'`
 * 3. 在本函数的 switch 中添加新的 case 分支
 *
 * @param {HTMLElement} el - 背景元素（.beautify-bg）
 * @param {string} effect - 效果类型：'fade' | 'slide' | 'zoom' | 'blur'
 * @param {string} phase - 动画阶段：'in'（淡入）| 'out'（淡出）
 *
 * @example
 * // 添加新效果示例（如：旋转效果）
 * case 'rotate':
 *     if (isOut) {
 *         el.style.transform = 'rotate(10deg)';
 *         el.style.opacity = '0';
 *     } else {
 *         el.style.transform = 'rotate(0)';
 *         el.style.opacity = '1';
 *     }
 *     break;
 */
function applyCarouselEffect(el, effect, phase) {
  const isOut = phase === 'out';

  switch (effect) {
    case 'fade':
      // 淡入淡出：简单的透明度变化
      el.style.opacity = isOut ? '0' : '1';
      break;

    case 'slide':
      // 左右滑动：向左滑出，从右滑入
      if (isOut) {
        el.style.transform = 'translateX(-30px)';
        el.style.opacity = '0';
      } else {
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
      }
      break;

    case 'zoom':
      // 缩放渐变：放大淡出，正常淡入
      if (isOut) {
        el.style.transform = 'scale(1.1)';
        el.style.opacity = '0';
      } else {
        el.style.transform = 'scale(1)';
        el.style.opacity = '1';
      }
      break;

    case 'blur':
      // 模糊过渡：模糊淡出，清晰淡入
      if (isOut) {
        el.style.filter = 'blur(10px)';
        el.style.opacity = '0';
      } else {
        el.style.filter = 'blur(0)';
        el.style.opacity = '1';
      }
      break;

    default:
      el.style.opacity = isOut ? '0' : '1';
  }
}


// ==========================================
// 头像框设置
// ==========================================

/**
 * 绑定头像框设置事件
 */
function bindAvatarFrameSettings() {
  if (!popupOverlay || !currentSettings) return;

  const { avatarFrame } = currentSettings;

  // 启用开关
  const enabledCheckbox = popupOverlay.querySelector('#beautify-frame-enabled');
  enabledCheckbox?.addEventListener('change', (e) => {
    currentSettings.avatarFrame.enabled = e.target.checked;
    applyAvatarFrameSettings();
    logger.info('beautify', '头像框启用:', e.target.checked);
  });

  // 通用滑块绑定函数
  const bindFrameSlider = (sliderId, valueId, key, unit, isFloat = false) => {
    const slider = popupOverlay?.querySelector(`#${sliderId}`);
    const valueEl = popupOverlay?.querySelector(`#${valueId}`);
    slider?.addEventListener('input', (e) => {
      const value = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
      currentSettings.avatarFrame[key] = value;
      valueEl && (valueEl.textContent = `${value}${unit}`);
      applyAvatarFrameSettings();
    });
  };

  // X偏移
  bindFrameSlider('beautify-frame-offset-x', 'beautify-frame-x-value', 'offsetX', 'px');
  // Y偏移
  bindFrameSlider('beautify-frame-offset-y', 'beautify-frame-y-value', 'offsetY', 'px');
  // 缩放
  bindFrameSlider('beautify-frame-scale', 'beautify-frame-scale-value', 'scale', 'x', true);
  // 旋转
  bindFrameSlider('beautify-frame-rotation', 'beautify-frame-rotation-value', 'rotation', '°');

  // 来源标签页切换
  const sourceTabs = popupOverlay.querySelectorAll('.beautify-bg-source-tabs[data-target="frame"] .beautify-bg-source-tab');
  sourceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const source = tab.dataset.source;
      sourceTabs.forEach(t => t.classList.toggle('active', t.dataset.source === source));
      const panels = popupOverlay.querySelectorAll('.beautify-frame-source-panel');
      panels.forEach(p => p.classList.toggle('active', p.dataset.sourcePanel === source));
    });
  });

  // 本地上传
  const fileInput = popupOverlay.querySelector('#beautify-frame-file-input');
  fileInput?.addEventListener('change', (e) => handleFrameFileUpload(e));

  // 网络链接添加
  const urlAddBtn = popupOverlay.querySelector('#beautify-frame-url-add');
  urlAddBtn?.addEventListener('click', () => handleFrameUrlAdd());

  // 存档图片点击选择
  const savedGrid = popupOverlay.querySelector('#beautify-saved-frame-grid');
  savedGrid?.addEventListener('click', (e) => handleSavedImageClick(e, 'frame'));

  // 清除按钮
  const clearBtn = popupOverlay.querySelector('#beautify-frame-clear');
  clearBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentSettings.avatarFrame.imageUrl = '';
    updateFramePreview('');
    applyAvatarFrameSettings();
  });
}

/**
 * 处理头像框本地文件上传
 * @param {Event} e - change 事件
 */
async function handleFrameFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const base64Data = await fileToBase64(file);
    const timestamp = Date.now();
    const ext = file.name.split('.').pop();
    const fileName = `acsus-paws-puffs_beautify_frame_${timestamp}.${ext}`;

    // 上传到服务器
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({
        name: fileName,
        data: base64Data
      })
    });

    if (!response.ok) {
      throw new Error('上传失败');
    }

    const result = await response.json();
    const url = result.path;

    // 保存到存档
    const savedImages = currentSettings.avatarFrame.savedImages || [];
    savedImages.push({
      id: `frame_${timestamp}`,
      name: fileName,
      url: url,
      type: 'local',
      addedTime: timestamp
    });
    currentSettings.avatarFrame.savedImages = savedImages;

    // 设为当前头像框
    selectFrameImage(url);

    // 刷新存档网格
    refreshFrameSavedGrid();

    logger.info('beautify', '头像框已上传:', fileName);
  } catch (error) {
    logger.error('[BeautifyPopup] 头像框上传失败:', error);
    toastr.error('上传失败，请重试');
  }

  // 清空 input
  e.target.value = '';
}

/**
 * 处理头像框网络链接添加
 */
function handleFrameUrlAdd() {
  const input = popupOverlay?.querySelector('#beautify-frame-url-input');
  const url = input?.value?.trim();

  if (!url) {
    toastr.warning('请输入图片链接');
    return;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    toastr.warning('请输入有效的网络链接（http:// 或 https://）');
    return;
  }

  // 保存到存档
  const timestamp = Date.now();
  const savedImages = currentSettings.avatarFrame.savedImages || [];
  savedImages.push({
    id: `frame_url_${timestamp}`,
    name: '网络图片',
    url: url,
    type: 'url',
    addedTime: timestamp
  });
  currentSettings.avatarFrame.savedImages = savedImages;

  // 设为当前头像框
  selectFrameImage(url);

  // 刷新存档网格
  refreshFrameSavedGrid();

  // 清空输入框
  if (input) input.value = '';

  logger.info('beautify', '头像框链接已添加:', url);
}

/**
 * 选择头像框图片
 * @param {string} url - 图片 URL
 */
function selectFrameImage(url) {
  currentSettings.avatarFrame.imageUrl = url;
  currentSettings.avatarFrame.enabled = true;
  updateFramePreview(url);

  // 更新启用开关
  const checkbox = popupOverlay?.querySelector('#beautify-frame-enabled');
  if (checkbox) checkbox.checked = true;

  applyAvatarFrameSettings();
  logger.info('beautify', '头像框已选择:', url);
}

/**
 * 更新头像框预览
 * @param {string} url - 图片 URL
 */
function updateFramePreview(url) {
  const preview = popupOverlay?.querySelector('#beautify-frame-preview');
  if (!preview) return;

  if (url) {
    preview.innerHTML = `
            <img src="${url}" alt="当前头像框">
            <button class="beautify-bg-clear-btn" id="beautify-frame-clear" title="清除">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
    // 重新绑定清除按钮事件
    const clearBtn = preview.querySelector('.beautify-bg-clear-btn');
    clearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentSettings.avatarFrame.imageUrl = '';
      updateFramePreview('');
      applyAvatarFrameSettings();
    });
  } else {
    preview.innerHTML = '<span class="beautify-bg-preview-placeholder"><i class="fa-solid fa-image"></i></span>';
  }
}

/**
 * 刷新头像框存档网格
 */
function refreshFrameSavedGrid() {
  const grid = popupOverlay?.querySelector('#beautify-saved-frame-grid');
  if (!grid) return;

  const images = currentSettings.avatarFrame.savedImages || [];
  grid.innerHTML = renderSavedImages(images, 'frame');

  // 更新空提示
  const panel = grid.parentElement;
  let emptyHint = panel?.querySelector('.beautify-bg-empty');
  if (images.length === 0) {
    if (!emptyHint) {
      emptyHint = document.createElement('div');
      emptyHint.className = 'beautify-bg-empty';
      emptyHint.textContent = '暂无存档';
      panel?.appendChild(emptyHint);
    }
  } else {
    emptyHint?.remove();
  }
}

/**
 * 应用头像框设置到悬浮栏
 */
export function applyAvatarFrameSettings() {
  const stickyHeader = document.getElementById('beautify-sticky-header');
  if (!stickyHeader || !currentSettings) return;

  const { avatarFrame } = currentSettings;
  const avatarWrapper = stickyHeader.querySelector('.beautify-avatar-wrapper');
  if (!avatarWrapper) return;

  // 查找或创建头像框元素
  let frameElement = avatarWrapper.querySelector('.beautify-avatar-frame');

  if (avatarFrame.enabled && avatarFrame.imageUrl) {
    if (!frameElement) {
      frameElement = document.createElement('div');
      frameElement.className = 'beautify-avatar-frame';
      avatarWrapper.appendChild(frameElement);
    }

    // 应用样式
    frameElement.style.backgroundImage = `url('${avatarFrame.imageUrl}')`;
    frameElement.style.transform = `translate(${avatarFrame.offsetX}px, ${avatarFrame.offsetY}px) scale(${avatarFrame.scale}) rotate(${avatarFrame.rotation ?? 0}deg)`;
    frameElement.style.display = 'block';
  } else if (frameElement) {
    frameElement.style.display = 'none';
  }

  logger.debug('beautify', '[BeautifyPopup] 头像框设置已应用');
}


// ==========================================
// 初始化
// ==========================================

/**
 * 初始化弹窗模块（页面加载时调用）
 *
 * @description
 * 加载保存的设置并应用到悬浮栏
 */
export function initBeautifyPopup() {
  loadPopupSettings();
  applyDisplaySettings();
  applyLayoutSettings();
  applyBackgroundSettings();
  applyAvatarFrameSettings();
  // 应用用户自定义CSS
  if (currentSettings?.customCSS) {
    applyCustomCSS(currentSettings.customCSS);
  }
  logger.info('beautify', '弹窗模块已初始化');
}

/**
 * 应用用户自定义CSS
 * @param {string} css - CSS字符串
 * @description 将用户的CSS注入到页面，覆盖悬浮栏默认样式
 */
function applyCustomCSS(css) {
  const styleId = 'beautify-user-custom-css';
  let styleEl = document.getElementById(styleId);

  if (!css) {
    // 清空CSS时移除style标签
    if (styleEl) {
      styleEl.remove();
      logger.debug('beautify', '[BeautifyPopup] 用户自定义CSS已移除');
    }
    return;
  }

  // 创建或更新style标签
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.setAttribute('type', 'text/css');
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = css;
  logger.debug('beautify', '[BeautifyPopup] 用户自定义CSS已应用');
}

/**
 * 显示CSS帮助弹窗
 * @description 展示悬浮栏的HTML结构和可用类名，方便用户写CSS。带复制按钮，左对齐，可滚动
 */
function showCssHelpPopup() {
  // 悬浮栏结构（纯文本，方便复制）
  const structureText = `<div class="beautify-sticky-header" is_user="true/false">
  <!-- 10个装饰元素，默认隐藏，用CSS显示 -->
  <div class="beautify-deco beautify-deco-1"></div>
  <div class="beautify-deco beautify-deco-2"></div>
  ... (beautify-deco-3 ~ beautify-deco-10)

  <div class="beautify-bg-container">
    <div class="beautify-bg"></div>  <!-- 背景图 -->
    <button class="beautify-lock-btn"></button>  <!-- 锁定按钮 -->

    <div class="beautify-info-row">
      <div class="beautify-avatar-wrapper">
        <img class="beautify-avatar">  <!-- 头像 -->
      </div>
      <div class="beautify-message-info">
        <span class="beautify-name"></span>  <!-- 名字 -->
        <span class="beautify-meta">
          <span id="beautify-time"></span>    <!-- 时间 -->
          <span id="beautify-timer"></span>   <!-- 生成耗时 -->
          <span id="beautify-tokens"></span>  <!-- Token数 -->
          <span id="beautify-mesid"></span>   <!-- 楼层号 -->
        </span>
      </div>
    </div>
  </div>
</div>`;

  // CSS示例（纯文本，方便复制）
  const cssExampleText = `/* 角色消息的悬浮栏 */
.beautify-sticky-header[is_user='false'] {
    /* 你的样式 */
}
.beautify-sticky-header[is_user='false'] .beautify-avatar {
    border-color: pink;
}

/* 用户消息的悬浮栏 */
.beautify-sticky-header[is_user='true'] {
    /* 你的样式 */
}
.beautify-sticky-header[is_user='true'] .beautify-avatar {
    border-color: skyblue;
}

/* 装饰元素示例 */
.beautify-sticky-header[is_user='false'] .beautify-deco-1 {
    display: block;
    position: absolute;
    top: 10px;
    left: 10px;
    width: 50px;
    height: 50px;
    background-image: url('你的图片链接');
    background-size: contain;
    pointer-events: none;
}`;

  const helpContent = `
<div style="font-size: 13px; line-height: 1.6; text-align: left; max-height: 70vh; overflow-y: auto;">

<h4 style="margin: 0 0 8px; color: var(--SmartThemeQuoteColor);">📋 悬浮栏结构（复制给AI用）</h4>
<div style="position: relative; margin-bottom: 12px;">
    <button id="copy-structure-btn" style="position: absolute; top: 4px; right: 4px; padding: 4px 8px; font-size: 11px; background: var(--SmartThemeQuoteColor); color: white; border: none; border-radius: 4px; cursor: pointer;">
        <i class="fa-solid fa-copy"></i> 复制
    </button>
    <pre id="structure-text" style="background: var(--SmartThemeBlurTintColor); padding: 10px; padding-right: 60px; border-radius: 6px; overflow-x: auto; font-size: 11px; white-space: pre-wrap; word-break: break-all;">${structureText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</div>

<h4 style="margin: 0 0 8px; color: var(--SmartThemeQuoteColor);">🎨 CSS写法示例（复制后修改）</h4>
<div style="position: relative; margin-bottom: 12px;">
    <button id="copy-css-btn" style="position: absolute; top: 4px; right: 4px; padding: 4px 8px; font-size: 11px; background: var(--SmartThemeQuoteColor); color: white; border: none; border-radius: 4px; cursor: pointer;">
        <i class="fa-solid fa-copy"></i> 复制
    </button>
    <pre id="css-text" style="background: var(--SmartThemeBlurTintColor); padding: 10px; padding-right: 60px; border-radius: 6px; overflow-x: auto; font-size: 11px; white-space: pre-wrap;">${cssExampleText}</pre>
</div>

<h4 style="margin: 0 0 8px; color: var(--SmartThemeQuoteColor);">📝 常用类名速查</h4>
<table style="width: 100%; font-size: 11px; border-collapse: collapse; text-align: left;">
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-sticky-header</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">悬浮栏容器</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>[is_user='false']</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">角色消息（属性选择器）</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>[is_user='true']</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">用户消息（属性选择器）</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-deco-1~10</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">装饰元素（默认隐藏）</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-bg-container</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">背景容器（控制高度）</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-bg</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">背景图</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-avatar-wrapper</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">头像容器</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-avatar</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">头像图片</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-name</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">名字</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.beautify-meta</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">信息区（时间/耗时/Token/楼层）</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.is-user / .is-char</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">类名方式区分（也可用）</td>
</tr>
</table>

<p style="margin: 12px 0 0; font-size: 11px; color: var(--SmartThemeEmColor);">
    💡 提示：复制结构和CSS示例给AI，说明你想要的效果，AI可以帮你写CSS
</p>
</div>
    `;

  callGenericPopup(helpContent, POPUP_TYPE.TEXT, '', { wide: true, large: true });

  // 绑定复制按钮事件（延迟等待DOM渲染）
  setTimeout(() => {
    const copyStructureBtn = document.getElementById('copy-structure-btn');
    const copyCssBtn = document.getElementById('copy-css-btn');

    copyStructureBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(structureText).then(() => {
        toastr.success('结构已复制');
        copyStructureBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
        setTimeout(() => {
          copyStructureBtn.innerHTML = '<i class="fa-solid fa-copy"></i> 复制';
        }, 2000);
      });
    });

    copyCssBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(cssExampleText).then(() => {
        toastr.success('CSS示例已复制');
        copyCssBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
        setTimeout(() => {
          copyCssBtn.innerHTML = '<i class="fa-solid fa-copy"></i> 复制';
        }, 2000);
      });
    });
  }, 100);

  logger.debug('beautify', '[BeautifyPopup] 显示CSS帮助弹窗');
}


// ==========================================
// 悬浮按钮图片设置弹窗
// ==========================================

/**
 * 打开悬浮按钮图片设置弹窗
 * @description 复用 beautify-popup 的弹窗风格，支持待机图片、点击动画、等待动画三种模式
 */
export function openFloatingBtnImagePopup() {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const savedImages = settings.savedImages || [];
  const currentImageUrl = settings.imageUrl || '';
  const imageOpacity = settings.imageOpacity || 1.0;
  const gifPacks = settings.gifPacks || [];
  const currentGifPackId = settings.currentGifPackId || '';
  const waitingPacks = settings.waitingPacks || [];
  const currentWaitingPackId = settings.currentWaitingPackId || '';
  const currentTab = settings.lastTab || 'static'; // 记住上次选择的tab

  // 创建弹窗 HTML
  const popupHtml = `
        <div class="beautify-popup-overlay floating-btn-popup-overlay">
            <div class="beautify-popup floating-btn-popup">
                <!-- 头部 -->
                <div class="beautify-popup-header">
                    <h3><i class="fa-solid fa-image"></i> 悬浮按钮图片</h3>
                    <button class="beautify-popup-close floating-btn-popup-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Tab切换（三个Tab） -->
                <div class="floating-btn-tabs">
                    <button class="floating-btn-tab ${currentTab === 'static' ? 'active' : ''}" data-tab="static">
                        <i class="fa-solid fa-image"></i> 待机图片
                    </button>
                    <button class="floating-btn-tab ${currentTab === 'gif' ? 'active' : ''}" data-tab="gif">
                        <i class="fa-solid fa-hand-pointer"></i> 点击动画
                    </button>
                    <button class="floating-btn-tab ${currentTab === 'waiting' ? 'active' : ''}" data-tab="waiting">
                        <i class="fa-solid fa-spinner"></i> 等待动画
                    </button>
                </div>

                <!-- 内容区域 -->
                <div class="beautify-popup-content floating-btn-popup-content">
                    <!-- 待机图片Tab内容 -->
                    <div class="floating-btn-tab-content ${currentTab === 'static' ? 'active' : ''}" data-tab-content="static">
                        <!-- 当前图片预览 -->
                        <div class="floating-btn-preview-section">
                            <div class="floating-btn-preview" id="floating-btn-popup-preview">
                                ${currentImageUrl ? `<img src="${currentImageUrl}" alt="当前图片">` : '<i class="fa-solid fa-image"></i>'}
                            </div>
                            <div class="floating-btn-opacity-control">
                                <label>
                                    <i class="fa-solid fa-droplet"></i>
                                    <span>图片透明度</span>
                                </label>
                                <input type="range" id="floating-btn-popup-opacity" min="10" max="100" value="${Math.round(imageOpacity * 100)}">
                                <span id="floating-btn-popup-opacity-value">${Math.round(imageOpacity * 100)}%</span>
                            </div>
                        </div>

                        <!-- 图片来源 -->
                        <div class="floating-btn-sources">
                            <button class="beautify-popup-btn" id="floating-btn-upload-local">
                                <i class="fa-solid fa-upload"></i>
                                <span>本地上传</span>
                            </button>
                            <button class="beautify-popup-btn" id="floating-btn-add-url">
                                <i class="fa-solid fa-link"></i>
                                <span>网络链接</span>
                            </button>
                            <button class="beautify-popup-btn" id="floating-btn-clear-image">
                                <i class="fa-solid fa-trash"></i>
                                <span>清除图片</span>
                            </button>
                        </div>

                        <!-- 提示 -->
                        <div class="floating-btn-hint">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>图床链接可能会因为魔法和网络问题导致图标看不见</span>
                        </div>

                        <!-- 存档列表 -->
                        <div class="floating-btn-saved-section">
                            <h4><i class="fa-solid fa-bookmark"></i> 存档</h4>
                            <div class="floating-btn-saved-grid" id="floating-btn-saved-grid">
                                ${renderFloatingBtnSavedGrid(savedImages, currentImageUrl)}
                            </div>
                        </div>
                    </div>

                    <!-- 点击动画Tab内容（原GIF动画库） -->
                    <div class="floating-btn-tab-content ${currentTab === 'gif' ? 'active' : ''}" data-tab-content="gif">
                        <!-- 当前使用的动画库预览 -->
                        <div class="gif-pack-current-section">
                            ${renderCurrentGifPack(gifPacks, currentGifPackId)}
                        </div>

                        <!-- 动画库列表 -->
                        <div class="gif-pack-list-section">
                            <div class="gif-pack-list-header">
                                <h4><i class="fa-solid fa-folder-open"></i> 我的点击动画库</h4>
                                <div class="gif-pack-actions">
                                    <input type="text" class="gif-pack-search" id="gif-pack-search" placeholder="搜索...">
                                    <button class="beautify-popup-btn gif-pack-create-btn" id="gif-pack-create">
                                        <i class="fa-solid fa-plus"></i> 新建
                                    </button>
                                </div>
                            </div>
                            <div class="gif-pack-grid" id="gif-pack-grid">
                                ${renderGifPackGrid(gifPacks, currentGifPackId)}
                            </div>
                        </div>
                    </div>

                    <!-- 等待动画Tab内容（新增） -->
                    <div class="floating-btn-tab-content ${currentTab === 'waiting' ? 'active' : ''}" data-tab-content="waiting">
                        <!-- 当前使用的等待动画预览 -->
                        <div class="waiting-pack-current-section">
                            ${renderCurrentWaitingPack(waitingPacks, currentWaitingPackId)}
                        </div>

                        <!-- 等待动画库列表 -->
                        <div class="waiting-pack-list-section">
                            <div class="waiting-pack-list-header">
                                <h4><i class="fa-solid fa-folder-open"></i> 我的等待动画库</h4>
                                <div class="waiting-pack-actions">
                                    <input type="text" class="waiting-pack-search" id="waiting-pack-search" placeholder="搜索...">
                                    <button class="beautify-popup-btn waiting-pack-create-btn" id="waiting-pack-create">
                                        <i class="fa-solid fa-plus"></i> 新建
                                    </button>
                                </div>
                            </div>
                            <div class="waiting-pack-grid" id="waiting-pack-grid">
                                ${renderWaitingPackGrid(waitingPacks, currentWaitingPackId)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

  // 添加到 body
  document.body.insertAdjacentHTML('beforeend', popupHtml);

  // 获取弹窗元素
  const overlay = document.querySelector('.floating-btn-popup-overlay');

  // 显示动画
  requestAnimationFrame(() => {
    overlay?.classList.add('show');
  });

  // 绑定事件
  bindFloatingBtnPopupEvents(overlay);

  logger.info('beautify', '悬浮按钮图片弹窗已打开');
}

/**
 * 关闭悬浮按钮图片弹窗
 */
function closeFloatingBtnImagePopup() {
  const overlay = document.querySelector('.floating-btn-popup-overlay');
  if (!overlay) return;

  overlay.classList.remove('show');

  setTimeout(() => {
    overlay.remove();
  }, 300);

  logger.info('beautify', '悬浮按钮图片弹窗已关闭');
}

/**
 * 渲染存档图片网格
 */
function renderFloatingBtnSavedGrid(savedImages, currentImageUrl) {
  if (!savedImages || savedImages.length === 0) {
    return '<div class="floating-btn-saved-empty">暂无存档</div>';
  }

  return savedImages.map(img => `
        <div class="floating-btn-saved-item ${img.url === currentImageUrl ? 'active' : ''}"
             data-url="${img.url}" data-id="${img.id}" data-type="${img.type}">
            <img src="${img.url}" alt="${img.name}">
            <span class="floating-btn-saved-name">${img.name}</span>
            ${img.type === 'local' || img.type === 'url' ? `
                <button class="floating-btn-saved-delete" data-id="${img.id}" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            ` : ''}
        </div>
    `).join('');
}

/**
 * 绑定悬浮按钮设置弹窗的所有事件
 *
 * @description
 * 为悬浮按钮设置弹窗绑定各类交互事件，包括：
 * - 基础操作：关闭弹窗（点击遮罩/关闭按钮/ESC键）
 * - Tab切换：在不同标签页之间切换
 * - 图片设置：透明度调节、本地上传、网络链接、清除图片
 * - 存档管理：点击存档图片应用/删除
 * - 点击动画库：新建动画库、搜索过滤、点击应用/编辑/删除
 * - 等待动画库：新建等待动画库、搜索过滤、点击应用/编辑/删除
 *
 * @param {HTMLElement} overlay - 弹窗遮罩层元素
 */
function bindFloatingBtnPopupEvents(overlay) {
  if (!overlay) return;

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeFloatingBtnImagePopup();
    }
  });

  // 关闭按钮
  const closeBtn = overlay.querySelector('.floating-btn-popup-close');
  closeBtn?.addEventListener('click', closeFloatingBtnImagePopup);

  // ESC 键关闭
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeFloatingBtnImagePopup();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // Tab切换
  const tabs = overlay.querySelectorAll('.floating-btn-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchFloatingBtnTab(overlay, tabName);
    });
  });

  // 透明度滑块
  const opacitySlider = overlay.querySelector('#floating-btn-popup-opacity');
  const opacityValue = overlay.querySelector('#floating-btn-popup-opacity-value');
  opacitySlider?.addEventListener('input', (e) => {
    const percent = parseInt(e.target.value);
    const opacity = percent / 100;
    opacityValue.textContent = `${percent}%`;

    const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
    if (settings.imageUrl) {
      setFloatingBtnImage(settings.imageUrl, opacity);
      saveFloatingBtnSettings({ imageOpacity: opacity });
    }
  });

  // 本地上传按钮
  const uploadBtn = overlay.querySelector('#floating-btn-upload-local');
  uploadBtn?.addEventListener('click', () => handleFloatingBtnUpload(overlay));

  // 网络链接按钮
  const urlBtn = overlay.querySelector('#floating-btn-add-url');
  urlBtn?.addEventListener('click', () => handleFloatingBtnAddUrl(overlay));

  // 清除图片按钮
  const clearBtn = overlay.querySelector('#floating-btn-clear-image');
  clearBtn?.addEventListener('click', () => {
    clearFloatingBtnImage();
    saveFloatingBtnSettings({ imageUrl: '', imageOpacity: 1.0 });
    updateFloatingBtnPopupPreview(overlay, '');
    refreshFloatingBtnSavedGrid(overlay);
    // 更新设置面板中的预览
    updateFloatingBtnSettingsPreview('');
    logger.info('beautify', '悬浮按钮图片已清除');
  });

  // 存档图片点击
  const savedGrid = overlay.querySelector('#floating-btn-saved-grid');
  savedGrid?.addEventListener('click', (e) => handleFloatingBtnSavedClick(e, overlay));

  // === GIF动画库相关事件 ===

  // 新建动画库按钮
  const createBtn = overlay.querySelector('#gif-pack-create');
  createBtn?.addEventListener('click', () => openGifPackEditor(overlay, null));

  // 搜索框
  const searchInput = overlay.querySelector('#gif-pack-search');
  searchInput?.addEventListener('input', (e) => {
    filterGifPacks(overlay, e.target.value);
  });

  // 动画库网格点击
  const gifPackGrid = overlay.querySelector('#gif-pack-grid');
  gifPackGrid?.addEventListener('click', (e) => handleGifPackGridClick(e, overlay));

  // 点击动画库清除按钮（初始绑定）
  const gifPackClearBtn = overlay.querySelector('#gif-pack-clear-current');
  gifPackClearBtn?.addEventListener('click', () => {
    saveFloatingBtnSettings({ currentGifPackId: '' });
    clearGifAnimationPack();
    refreshGifPackUI(overlay);
    logger.info('beautify', '已取消使用动画库');
  });

  // === 等待动画库相关事件 ===

  // 新建等待动画库按钮
  const waitingCreateBtn = overlay.querySelector('#waiting-pack-create');
  waitingCreateBtn?.addEventListener('click', () => openWaitingPackEditor(overlay, null));

  // 等待动画库搜索框
  const waitingSearchInput = overlay.querySelector('#waiting-pack-search');
  waitingSearchInput?.addEventListener('input', (e) => {
    filterWaitingPacks(overlay, e.target.value);
  });

  // 等待动画库网格点击
  const waitingPackGrid = overlay.querySelector('#waiting-pack-grid');
  waitingPackGrid?.addEventListener('click', (e) => handleWaitingPackGridClick(e, overlay));

  // 等待动画库清除按钮（初始绑定）
  const waitingPackClearBtn = overlay.querySelector('#waiting-pack-clear-current');
  waitingPackClearBtn?.addEventListener('click', () => {
    saveFloatingBtnSettings({ currentWaitingPackId: '' });
    refreshWaitingPackUI(overlay);
    logger.info('beautify', '已取消使用等待动画库');
  });
}

/**
 * 处理本地上传
 * 使用酒馆的 /api/files/upload API
 * 文件保存在 data/default-user/user/files/ 目录
 */
function handleFloatingBtnUpload(overlay) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async function () {
    const file = this.files?.[0];
    if (!file) return;

    try {
      // 读取文件为 base64（移除前缀，只保留纯 base64 数据）
      const base64Data = await fileToBase64(file);

      // 生成唯一文件名（使用前缀区分不同功能的图片）
      const timestamp = Date.now();
      const ext = file.name.split('.').pop();
      const fileName = `acsus-paws-puffs_floatingbtn_${timestamp}.${ext}`;

      // 上传到服务器
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: fileName,
          data: base64Data
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[BeautifyPopup] 上传失败，状态码:', response.status, '错误:', errorText);
        throw new Error(`上传失败（状态码：${response.status}）`);
      }

      const result = await response.json();
      const filePath = result.path;

      // 应用图片并保存到存档
      applyFloatingBtnImage(overlay, filePath, file.name, 'local');
      logger.info('beautify', '悬浮按钮图片已上传:', filePath);

    } catch (error) {
      logger.error('[BeautifyPopup] 上传失败:', error);
      alert('上传失败：' + error.message);
    }
  });

  input.click();
}

/**
 * 处理添加网络链接
 */
function handleFloatingBtnAddUrl(overlay) {
  const url = prompt('请输入图片 URL：');
  if (!url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('请输入有效的 URL（以 http:// 或 https:// 开头）');
    return;
  }

  // 验证图片
  const img = new Image();
  img.onload = () => {
    const name = url.split('/').pop()?.split('?')[0] || '网络图片';
    applyFloatingBtnImage(overlay, url, name, 'url');
    logger.info('beautify', '网络图片已添加:', url);
  };
  img.onerror = () => {
    alert('无法加载图片，请检查 URL 是否正确');
  };
  img.src = url;
}

/**
 * 处理存档图片点击
 */
function handleFloatingBtnSavedClick(e, overlay) {
  const target = e.target;

  // 删除按钮
  const deleteBtn = target.closest('.floating-btn-saved-delete');
  if (deleteBtn) {
    const id = deleteBtn.getAttribute('data-id');
    handleFloatingBtnDeleteImage(id, overlay);
    return;
  }

  // 选择图片
  const item = target.closest('.floating-btn-saved-item');
  if (item) {
    const url = item.getAttribute('data-url');
    if (url) {
      const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
      const opacity = settings.imageOpacity || 1.0;

      setFloatingBtnImage(url, opacity);
      saveFloatingBtnSettings({ imageUrl: url });
      updateFloatingBtnPopupPreview(overlay, url);
      updateFloatingBtnSettingsPreview(url);

      // 更新选中状态
      overlay.querySelectorAll('.floating-btn-saved-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      logger.info('beautify', '已选择存档图片');
    }
  }
}

/**
 * 处理删除存档图片
 */
async function handleFloatingBtnDeleteImage(id, overlay) {
  if (!id) return;

  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const savedImages = settings.savedImages || [];
  const imageToDelete = savedImages.find(img => img.id === id);

  if (!imageToDelete) return;
  if (!confirm(`确定要删除 "${imageToDelete.name}" 吗？`)) return;

  // 如果是本地上传的图片，删除服务器文件
  if (imageToDelete.type === 'local') {
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path: imageToDelete.url })
      });
      logger.info('beautify', '服务器文件已删除:', imageToDelete.url);
    } catch (error) {
      logger.warn('beautify', '删除服务器文件失败:', error);
    }
  }

  // 从存档中移除
  const newSavedImages = savedImages.filter(img => img.id !== id);
  saveFloatingBtnSettings({ savedImages: newSavedImages });

  // 如果删除的是当前使用的图片，清除
  if (settings.imageUrl === imageToDelete.url) {
    clearFloatingBtnImage();
    saveFloatingBtnSettings({ imageUrl: '', imageOpacity: 1.0 });
    updateFloatingBtnPopupPreview(overlay, '');
    updateFloatingBtnSettingsPreview('');
  }

  refreshFloatingBtnSavedGrid(overlay);
  logger.info('beautify', '存档图片已删除:', imageToDelete.name);
}

/**
 * 应用选中的图片
 */
function applyFloatingBtnImage(overlay, url, name, type) {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const savedImages = settings.savedImages || [];
  const opacity = settings.imageOpacity || 1.0;

  // 检查是否已存在
  const exists = savedImages.some(img => img.url === url);
  if (!exists) {
    savedImages.push({
      id: `img_${Date.now()}`,
      name: name,
      url: url,
      type: type,
      addedTime: Date.now()
    });
    saveFloatingBtnSettings({ savedImages });
  }

  // 应用图片
  setFloatingBtnImage(url, opacity);
  saveFloatingBtnSettings({ imageUrl: url });
  updateFloatingBtnPopupPreview(overlay, url);
  updateFloatingBtnSettingsPreview(url);
  refreshFloatingBtnSavedGrid(overlay);
}

/**
 * 更新弹窗中的预览
 */
function updateFloatingBtnPopupPreview(overlay, url) {
  const preview = overlay?.querySelector('#floating-btn-popup-preview');
  if (!preview) return;

  if (url) {
    preview.innerHTML = `<img src="${url}" alt="当前图片">`;
  } else {
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
  }
}

/**
 * 更新设置面板中的预览
 */
function updateFloatingBtnSettingsPreview(url) {
  const preview = document.getElementById('floating-btn-image-preview');
  if (!preview) return;

  if (url) {
    preview.innerHTML = `<img src="${url}" alt="预览">`;
  } else {
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
  }
}

/**
 * 刷新存档网格
 */
function refreshFloatingBtnSavedGrid(overlay) {
  const grid = overlay?.querySelector('#floating-btn-saved-grid');
  if (!grid) return;

  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  grid.innerHTML = renderFloatingBtnSavedGrid(settings.savedImages || [], settings.imageUrl || '');
}

// ==========================================
// GIF动画库相关函数
// ==========================================

/**
 * 切换Tab
 * @param {Element} overlay - 弹窗元素
 * @param {string} tabName - Tab名称 ('static' | 'gif')
 */
function switchFloatingBtnTab(overlay, tabName) {
  // 更新Tab按钮状态
  overlay.querySelectorAll('.floating-btn-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabName);
  });

  // 更新Tab内容显示
  overlay.querySelectorAll('.floating-btn-tab-content').forEach(content => {
    content.classList.toggle('active', content.getAttribute('data-tab-content') === tabName);
  });

  // 保存最后选择的Tab
  saveFloatingBtnSettings({ lastTab: tabName });
  logger.debug('[BeautifyPopup] 切换到Tab:', tabName);
}

/**
 * 渲染当前使用的GIF动画库预览
 * @param {Array} gifPacks - 动画库列表
 * @param {string} currentGifPackId - 当前使用的动画库ID
 * @returns {string} HTML字符串
 */
function renderCurrentGifPack(gifPacks, currentGifPackId) {
  const currentPack = gifPacks.find(p => p.id === currentGifPackId);

  if (!currentPack) {
    return `
            <div class="gif-pack-current-empty">
                <i class="fa-solid fa-film"></i>
                <span>未选择动画库</span>
                <p>点击下方"新建"创建你的第一个GIF动画库</p>
            </div>
        `;
  }

  return `
        <div class="gif-pack-current">
            <div class="gif-pack-current-header">
                <span class="gif-pack-current-name">${currentPack.name}</span>
                <button class="gif-pack-current-clear" id="gif-pack-clear-current" title="取消使用">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="gif-pack-current-hint">点击 × 取消使用此动画库</div>
            <div class="gif-pack-current-preview">
                <div class="gif-pack-preview-item">
                    <div class="gif-pack-preview-img">
                        ${currentPack.idle ? `<img src="${currentPack.idle}" alt="待机">` : '<i class="fa-solid fa-image"></i>'}
                    </div>
                    <span>待机</span>
                </div>
                <div class="gif-pack-preview-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                <div class="gif-pack-preview-item">
                    <div class="gif-pack-preview-img">
                        ${currentPack.clickAnim ? `<img src="${currentPack.clickAnim}" alt="点击动画">` : '<i class="fa-solid fa-image"></i>'}
                    </div>
                    <span>点击时</span>
                </div>
                <div class="gif-pack-preview-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                <div class="gif-pack-preview-item">
                    <div class="gif-pack-preview-img">
                        ${currentPack.afterClick ? `<img src="${currentPack.afterClick}" alt="点击后">` : '<i class="fa-solid fa-image"></i>'}
                    </div>
                    <span>点击后</span>
                </div>
            </div>
            <div class="gif-pack-current-info">
                <span><i class="fa-solid fa-clock"></i> ${currentPack.restoreDelay || 0}秒后恢复待机</span>
            </div>
        </div>
    `;
}

/**
 * 渲染GIF动画库网格
 * @param {Array} gifPacks - 动画库列表
 * @param {string} currentGifPackId - 当前使用的动画库ID
 * @returns {string} HTML字符串
 */
function renderGifPackGrid(gifPacks, currentGifPackId) {
  if (!gifPacks || gifPacks.length === 0) {
    return '<div class="gif-pack-grid-empty">暂无动画库，点击"新建"创建</div>';
  }

  return gifPacks.map(pack => `
        <div class="gif-pack-item ${pack.id === currentGifPackId ? 'active' : ''}" data-pack-id="${pack.id}">
            <div class="gif-pack-item-preview">
                ${pack.idle ? `<img src="${pack.idle}" alt="${pack.name}">` : '<i class="fa-solid fa-film"></i>'}
            </div>
            <div class="gif-pack-item-info">
                <span class="gif-pack-item-name">${pack.name}</span>
            </div>
            <div class="gif-pack-item-actions">
                <button class="gif-pack-item-edit" data-pack-id="${pack.id}" title="编辑">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="gif-pack-item-delete" data-pack-id="${pack.id}" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

/**
 * 处理GIF动画库网格点击
 * @param {Event} e - 点击事件
 * @param {Element} overlay - 弹窗元素
 */
function handleGifPackGridClick(e, overlay) {
  const target = e.target;

  // 编辑按钮
  const editBtn = target.closest('.gif-pack-item-edit');
  if (editBtn) {
    const packId = editBtn.getAttribute('data-pack-id');
    const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
    const pack = settings.gifPacks?.find(p => p.id === packId);
    if (pack) {
      openGifPackEditor(overlay, pack);
    }
    return;
  }

  // 删除按钮
  const deleteBtn = target.closest('.gif-pack-item-delete');
  if (deleteBtn) {
    const packId = deleteBtn.getAttribute('data-pack-id');
    handleDeleteGifPack(overlay, packId);
    return;
  }

  // 点击整个卡片 = 应用该动画库
  const packItem = target.closest('.gif-pack-item');
  if (packItem && !target.closest('.gif-pack-item-actions')) {
    const packId = packItem.getAttribute('data-pack-id');
    applyGifPack(overlay, packId);
  }
}

/**
 * 应用GIF动画库
 * @param {Element} overlay - 弹窗元素
 * @param {string} packId - 动画库ID
 */
function applyGifPack(overlay, packId) {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const pack = settings.gifPacks?.find(p => p.id === packId);

  if (!pack) {
    logger.warn('beautify', '找不到动画库:', packId);
    return;
  }

  // 保存当前使用的动画库ID
  saveFloatingBtnSettings({ currentGifPackId: packId });

  // 应用动画库到悬浮按钮
  applyGifAnimationPack(pack);

  // 刷新UI
  refreshGifPackUI(overlay);

  logger.info('beautify', '已应用动画库:', pack.name);
}

/**
 * 删除GIF动画库
 * @param {Element} overlay - 弹窗元素
 * @param {string} packId - 动画库ID
 */
async function handleDeleteGifPack(overlay, packId) {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const gifPacks = settings.gifPacks || [];
  const pack = gifPacks.find(p => p.id === packId);

  if (!pack) return;
  if (!confirm(`确定要删除动画库 "${pack.name}" 吗？\n相关的本地图片文件也会被删除。`)) return;

  // 删除服务器上的本地图片文件（只删除本地上传的，不删除网络链接）
  const filesToDelete = [pack.idle, pack.clickAnim, pack.afterClick].filter(url => {
    // 本地上传的文件路径格式：/user/files/xxx 或包含 acsus-paws-puffs 前缀
    return url && (url.startsWith('/user/files/') || url.includes('acsus-paws-puffs'));
  });

  for (const fileUrl of filesToDelete) {
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path: fileUrl })
      });
      logger.info('beautify', '已删除本地文件:', fileUrl);
    } catch (error) {
      logger.warn('beautify', '删除文件失败:', fileUrl, error);
    }
  }

  // 从列表中移除
  const newGifPacks = gifPacks.filter(p => p.id !== packId);

  // 如果删除的是当前使用的动画库，清除当前选择
  let newCurrentId = settings.currentGifPackId;
  if (settings.currentGifPackId === packId) {
    newCurrentId = '';
    clearGifAnimationPack();
  }

  saveFloatingBtnSettings({ gifPacks: newGifPacks, currentGifPackId: newCurrentId });
  refreshGifPackUI(overlay);

  logger.info('beautify', '已删除动画库:', pack.name);
}

/**
 * 刷新GIF动画库UI
 * @param {Element} overlay - 弹窗元素
 */
function refreshGifPackUI(overlay) {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const gifPacks = settings.gifPacks || [];
  const currentGifPackId = settings.currentGifPackId || '';

  // 刷新当前使用的动画库预览
  const currentSection = overlay.querySelector('.gif-pack-current-section');
  if (currentSection) {
    currentSection.innerHTML = renderCurrentGifPack(gifPacks, currentGifPackId);
    // 重新绑定清除按钮事件
    const clearBtn = currentSection.querySelector('#gif-pack-clear-current');
    clearBtn?.addEventListener('click', () => {
      saveFloatingBtnSettings({ currentGifPackId: '' });
      clearGifAnimationPack();
      refreshGifPackUI(overlay);
      logger.info('beautify', '已取消使用动画库');
    });
  }

  // 刷新动画库网格
  const grid = overlay.querySelector('#gif-pack-grid');
  if (grid) {
    grid.innerHTML = renderGifPackGrid(gifPacks, currentGifPackId);
  }
}

/**
 * 搜索过滤GIF动画库
 * @param {Element} overlay - 弹窗元素
 * @param {string} keyword - 搜索关键词
 */
function filterGifPacks(overlay, keyword) {
  const items = overlay.querySelectorAll('.gif-pack-item');
  const lowerKeyword = keyword.toLowerCase().trim();

  items.forEach(item => {
    const name = item.querySelector('.gif-pack-item-name')?.textContent?.toLowerCase() || '';
    const match = !lowerKeyword || name.includes(lowerKeyword);
    item.style.display = match ? '' : 'none';
  });
}

/**
 * 打开GIF动画库编辑器
 * @param {Element} overlay - 主弹窗元素
 * @param {Object|null} pack - 要编辑的动画库，null表示新建
 */
function openGifPackEditor(overlay, pack) {
  const isNew = !pack;
  const packData = pack || {
    id: `gifpack_${Date.now()}`,
    name: '',
    idle: '',
    clickAnim: '',
    afterClick: '',
    restoreDelay: 5
  };

  const editorHtml = `
        <div class="gif-pack-editor-overlay">
            <div class="gif-pack-editor">
                <div class="gif-pack-editor-header">
                    <h3><i class="fa-solid fa-${isNew ? 'plus' : 'pen'}"></i> ${isNew ? '新建' : '编辑'}动画库</h3>
                    <button class="gif-pack-editor-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="gif-pack-editor-content">
                    <!-- 库名称 -->
                    <div class="gif-pack-editor-field">
                        <label><i class="fa-solid fa-tag"></i> 库名称</label>
                        <input type="text" id="gif-pack-name" value="${packData.name}" placeholder="给动画库起个名字...">
                    </div>

                    <!-- 待机图片 -->
                    <div class="gif-pack-editor-field">
                        <label><i class="fa-solid fa-image"></i> ① 待机图片（平时显示）</label>
                        <div class="gif-pack-editor-upload" data-field="idle">
                            <div class="gif-pack-editor-preview" id="gif-pack-idle-preview">
                                ${packData.idle ? `<img src="${packData.idle}" alt="待机">` : '<i class="fa-solid fa-image"></i>'}
                            </div>
                            <div class="gif-pack-editor-btns">
                                <button class="beautify-popup-btn gif-pack-upload-btn" data-field="idle">
                                    <i class="fa-solid fa-upload"></i> 上传
                                </button>
                                <button class="beautify-popup-btn gif-pack-url-btn" data-field="idle">
                                    <i class="fa-solid fa-link"></i>
                                </button>
                                <button class="beautify-popup-btn gif-pack-clear-btn" data-field="idle">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <input type="hidden" id="gif-pack-idle" value="${packData.idle || ''}">
                        </div>
                    </div>

                    <!-- 点击动画 -->
                    <div class="gif-pack-editor-field">
                        <label><i class="fa-solid fa-play"></i> ② 点击动画（点击时播放，播放一次）</label>
                        <div class="gif-pack-editor-upload" data-field="clickAnim">
                            <div class="gif-pack-editor-preview" id="gif-pack-clickAnim-preview">
                                ${packData.clickAnim ? `<img src="${packData.clickAnim}" alt="点击动画">` : '<i class="fa-solid fa-film"></i>'}
                            </div>
                            <div class="gif-pack-editor-btns">
                                <button class="beautify-popup-btn gif-pack-upload-btn" data-field="clickAnim">
                                    <i class="fa-solid fa-upload"></i> 上传
                                </button>
                                <button class="beautify-popup-btn gif-pack-url-btn" data-field="clickAnim">
                                    <i class="fa-solid fa-link"></i>
                                </button>
                                <button class="beautify-popup-btn gif-pack-clear-btn" data-field="clickAnim">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <input type="hidden" id="gif-pack-clickAnim" value="${packData.clickAnim || ''}">
                        </div>
                        <div class="gif-pack-editor-delay" style="margin-top: 8px;">
                            <span>动画时长：</span>
                            <input type="number" id="gif-pack-animDuration" value="${packData.animDuration || 2}" min="0.5" max="30" step="0.5">
                            <span>秒（GIF播放多久后切换到点击后图片）</span>
                        </div>
                    </div>

                    <!-- 点击后图片 -->
                    <div class="gif-pack-editor-field">
                        <label><i class="fa-solid fa-check"></i> ③ 点击后图片（动画播完后显示）</label>
                        <div class="gif-pack-editor-upload" data-field="afterClick">
                            <div class="gif-pack-editor-preview" id="gif-pack-afterClick-preview">
                                ${packData.afterClick ? `<img src="${packData.afterClick}" alt="点击后">` : '<i class="fa-solid fa-image"></i>'}
                            </div>
                            <div class="gif-pack-editor-btns">
                                <button class="beautify-popup-btn gif-pack-upload-btn" data-field="afterClick">
                                    <i class="fa-solid fa-upload"></i> 上传
                                </button>
                                <button class="beautify-popup-btn gif-pack-url-btn" data-field="afterClick">
                                    <i class="fa-solid fa-link"></i>
                                </button>
                                <button class="beautify-popup-btn gif-pack-clear-btn" data-field="afterClick">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <input type="hidden" id="gif-pack-afterClick" value="${packData.afterClick || ''}">
                        </div>
                    </div>

                    <!-- 恢复延迟 -->
                    <div class="gif-pack-editor-field">
                        <label><i class="fa-solid fa-clock"></i> ④ 恢复延迟</label>
                        <div class="gif-pack-editor-delay">
                            <input type="number" id="gif-pack-restoreDelay" value="${packData.restoreDelay || 5}" min="0" max="60">
                            <span>秒后恢复待机（0 = 不自动恢复）</span>
                        </div>
                    </div>
                </div>

                <div class="gif-pack-editor-footer">
                    <div class="gif-pack-editor-footer-row">
                        <button class="beautify-popup-btn gif-pack-editor-import" id="gif-pack-import" title="导入动画库（ZIP格式）">
                            <i class="fa-solid fa-file-import"></i> 导入
                        </button>
                        <button class="beautify-popup-btn gif-pack-editor-export" id="gif-pack-export" title="导出动画库（ZIP格式，含图片）">
                            <i class="fa-solid fa-file-export"></i> 导出
                        </button>
                    </div>
                    <div class="gif-pack-editor-footer-row">
                        <button class="beautify-popup-btn gif-pack-editor-save" id="gif-pack-save">
                            <i class="fa-solid fa-check"></i> 保存
                        </button>
                        ${!isNew ? `
                            <button class="beautify-popup-btn gif-pack-editor-delete" id="gif-pack-delete">
                                <i class="fa-solid fa-trash"></i> 删除
                            </button>
                        ` : ''}
                        <button class="beautify-popup-btn gif-pack-editor-cancel" id="gif-pack-cancel">
                            <i class="fa-solid fa-xmark"></i> 取消
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

  // 添加到弹窗内
  overlay.insertAdjacentHTML('beforeend', editorHtml);

  const editorOverlay = overlay.querySelector('.gif-pack-editor-overlay');

  // 显示动画
  requestAnimationFrame(() => {
    editorOverlay?.classList.add('show');
  });

  // 绑定编辑器事件
  bindGifPackEditorEvents(overlay, editorOverlay, packData, isNew);
}

/**
 * 绑定GIF动画库编辑器事件
 * @param {Element} mainOverlay - 主弹窗元素
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {Object} packData - 动画库数据
 * @param {boolean} isNew - 是否是新建
 */
function bindGifPackEditorEvents(mainOverlay, editorOverlay, packData, isNew) {
  // 关闭按钮
  const closeBtn = editorOverlay.querySelector('.gif-pack-editor-close');
  closeBtn?.addEventListener('click', () => closeGifPackEditor(editorOverlay));

  // 取消按钮
  const cancelBtn = editorOverlay.querySelector('#gif-pack-cancel');
  cancelBtn?.addEventListener('click', () => closeGifPackEditor(editorOverlay));

  // 点击遮罩关闭
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) {
      closeGifPackEditor(editorOverlay);
    }
  });

  // 上传按钮
  const uploadBtns = editorOverlay.querySelectorAll('.gif-pack-upload-btn');
  uploadBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-field');
      handleGifPackFieldUpload(editorOverlay, field);
    });
  });

  // URL按钮
  const urlBtns = editorOverlay.querySelectorAll('.gif-pack-url-btn');
  urlBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-field');
      handleGifPackFieldUrl(editorOverlay, field);
    });
  });

  // 清除按钮
  const clearBtns = editorOverlay.querySelectorAll('.gif-pack-clear-btn');
  clearBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-field');
      clearGifPackField(editorOverlay, field);
    });
  });

  // 导出按钮
  const exportBtn = editorOverlay.querySelector('#gif-pack-export');
  exportBtn?.addEventListener('click', () => {
    exportGifPack(editorOverlay);
  });

  // 导入按钮
  const importBtn = editorOverlay.querySelector('#gif-pack-import');
  importBtn?.addEventListener('click', () => {
    importGifPack(editorOverlay);
  });

  // 保存按钮
  const saveBtn = editorOverlay.querySelector('#gif-pack-save');
  saveBtn?.addEventListener('click', () => {
    saveGifPack(mainOverlay, editorOverlay, packData.id, isNew);
  });

  // 删除按钮
  const deleteBtn = editorOverlay.querySelector('#gif-pack-delete');
  deleteBtn?.addEventListener('click', () => {
    if (confirm(`确定要删除动画库 "${packData.name}" 吗？`)) {
      handleDeleteGifPack(mainOverlay, packData.id);
      closeGifPackEditor(editorOverlay);
    }
  });
}

/**
 * 关闭GIF动画库编辑器
 * @param {Element} editorOverlay - 编辑器弹窗元素
 */
function closeGifPackEditor(editorOverlay) {
  editorOverlay.classList.remove('show');
  setTimeout(() => {
    editorOverlay.remove();
  }, 300);
}

/**
 * 处理GIF动画库字段上传
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名 ('idle' | 'clickAnim' | 'afterClick')
 */
function handleGifPackFieldUpload(editorOverlay, field) {
  const input = document.createElement('input');
  input.type = 'file';
  // 所有字段都允许上传任意图片格式（包括GIF和静态图）
  input.accept = 'image/*';

  input.addEventListener('change', async function () {
    const file = this.files?.[0];
    if (!file) return;

    // 如果当前字段已有本地文件，先删除旧文件
    const hiddenInput = editorOverlay.querySelector(`#gif-pack-${field}`);
    const oldUrl = hiddenInput?.value || '';
    if (oldUrl && (oldUrl.startsWith('/user/files/') || oldUrl.includes('acsus-paws-puffs'))) {
      try {
        await fetch('/api/files/delete', {
          method: 'POST',
          headers: getRequestHeaders(),
          body: JSON.stringify({ path: oldUrl })
        });
        logger.debug('[BeautifyPopup] 已删除旧文件:', oldUrl);
      } catch (error) {
        logger.warn('beautify', '删除旧文件失败:', oldUrl, error);
      }
    }

    try {
      const base64Data = await fileToBase64(file);
      const timestamp = Date.now();
      const ext = file.name.split('.').pop();
      const fileName = `acsus-paws-puffs_gifpack_${field}_${timestamp}.${ext}`;

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: fileName,
          data: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`上传失败（状态码：${response.status}）`);
      }

      const result = await response.json();
      const filePath = result.path;

      // 更新预览和隐藏字段
      const preview = editorOverlay.querySelector(`#gif-pack-${field}-preview`);

      if (preview) {
        preview.innerHTML = `<img src="${filePath}" alt="${field}">`;
      }
      if (hiddenInput) {
        hiddenInput.value = filePath;
      }

      logger.info('beautify', 'GIF动画库图片已上传:', field, filePath);

    } catch (error) {
      logger.error('[BeautifyPopup] 上传失败:', error);
      alert('上传失败：' + error.message);
    }
  });

  input.click();
}

/**
 * 清除GIF动画库字段（同时删除本地文件）
 * @async
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名（idle/clickAnim/afterClick）
 * @returns {Promise<void>}
 */
async function clearGifPackField(editorOverlay, field) {
  const preview = editorOverlay.querySelector(`#gif-pack-${field}-preview`);
  const hiddenInput = editorOverlay.querySelector(`#gif-pack-${field}`);
  const currentUrl = hiddenInput?.value || '';

  // 如果是本地上传的文件，删除服务器上的文件
  if (currentUrl && (currentUrl.startsWith('/user/files/') || currentUrl.includes('acsus-paws-puffs'))) {
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path: currentUrl })
      });
      logger.info('beautify', '已删除本地文件:', currentUrl);
    } catch (error) {
      logger.warn('beautify', '删除文件失败:', currentUrl, error);
    }
  }

  const iconMap = {
    idle: 'fa-image',
    clickAnim: 'fa-film',
    afterClick: 'fa-image'
  };

  if (preview) {
    preview.innerHTML = `<i class="fa-solid ${iconMap[field] || 'fa-image'}"></i>`;
  }
  if (hiddenInput) {
    hiddenInput.value = '';
  }
}

/**
 * 保存GIF动画库
 * @param {Element} mainOverlay - 主弹窗元素
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} packId - 动画库ID
 * @param {boolean} isNew - 是否是新建
 */
function saveGifPack(mainOverlay, editorOverlay, packId, isNew) {
  const name = editorOverlay.querySelector('#gif-pack-name')?.value?.trim();
  const idle = editorOverlay.querySelector('#gif-pack-idle')?.value || '';
  const clickAnim = editorOverlay.querySelector('#gif-pack-clickAnim')?.value || '';
  const afterClick = editorOverlay.querySelector('#gif-pack-afterClick')?.value || '';
  const animDuration = parseFloat(editorOverlay.querySelector('#gif-pack-animDuration')?.value) || 2;
  const restoreDelay = parseInt(editorOverlay.querySelector('#gif-pack-restoreDelay')?.value) || 0;

  // 验证
  if (!name) {
    alert('请输入库名称');
    return;
  }

  if (!idle && !clickAnim && !afterClick) {
    alert('请至少上传一张图片');
    return;
  }

  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const gifPacks = settings.gifPacks || [];

  const packData = {
    id: packId,
    name,
    idle,
    clickAnim,
    afterClick,
    animDuration,
    restoreDelay,
    updatedTime: Date.now()
  };

  if (isNew) {
    packData.createdTime = Date.now();
    gifPacks.push(packData);
  } else {
    const index = gifPacks.findIndex(p => p.id === packId);
    if (index !== -1) {
      gifPacks[index] = { ...gifPacks[index], ...packData };
    }
  }

  saveFloatingBtnSettings({ gifPacks });

  // 如果是当前使用的动画库，重新应用
  if (settings.currentGifPackId === packId) {
    applyGifAnimationPack(packData);
  }

  closeGifPackEditor(editorOverlay);
  refreshGifPackUI(mainOverlay);

  logger.info('beautify', '动画库已保存:', name);
}

/**
 * 处理GIF动画库字段URL输入
 *
 * @description
 * 让用户输入网络图片URL，验证后显示预览并保存到隐藏输入框。
 * 支持 idle/clickAnim/afterClick 三个字段。
 *
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名（idle/clickAnim/afterClick）
 * @returns {void}
 * @example
 * handleGifPackFieldUrl(editorOverlay, 'idle');
 */
function handleGifPackFieldUrl(editorOverlay, field) {
  const url = prompt('请输入图片URL：');
  if (!url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('请输入有效的URL（以 http:// 或 https:// 开头）');
    return;
  }

  // 验证图片
  const img = new Image();
  img.onload = () => {
    const preview = editorOverlay.querySelector(`#gif-pack-${field}-preview`);
    const hiddenInput = editorOverlay.querySelector(`#gif-pack-${field}`);

    if (preview) {
      preview.innerHTML = `<img src="${url}" alt="${field}">`;
    }
    if (hiddenInput) {
      hiddenInput.value = url;
    }

    logger.info('beautify', '已添加网络图片:', field, url);
  };
  img.onerror = () => {
    alert('无法加载图片，请检查URL是否正确');
  };
  img.src = url;
}

/**
 * 导出GIF动画库为ZIP压缩包（含图片文件）
 *
 * @description
 * 将当前编辑器中的动画库配置导出为ZIP压缩包：
 * - 网络图片（http/https）保持URL不变，写入config.json
 * - 本地图片打包成真实文件放入images文件夹
 * - 导出失败时会尝试用Base64作为降级方案
 *
 * @async
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @returns {Promise<void>}
 * @throws {Error} JSZip加载失败或ZIP生成失败时
 * @example
 * await exportGifPack(document.querySelector('.gif-pack-editor-overlay'));
 */
async function exportGifPack(editorOverlay) {
  const name = editorOverlay.querySelector('#gif-pack-name')?.value?.trim() || '未命名动画库';
  const idle = editorOverlay.querySelector('#gif-pack-idle')?.value || '';
  const clickAnim = editorOverlay.querySelector('#gif-pack-clickAnim')?.value || '';
  const afterClick = editorOverlay.querySelector('#gif-pack-afterClick')?.value || '';
  const animDuration = parseFloat(editorOverlay.querySelector('#gif-pack-animDuration')?.value) || 2;
  const restoreDelay = parseInt(editorOverlay.querySelector('#gif-pack-restoreDelay')?.value) || 0;

  // 显示加载提示
  const exportBtn = editorOverlay.querySelector('#gif-pack-export');
  const originalText = exportBtn?.innerHTML;
  if (exportBtn) {
    exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导出中...';
    exportBtn.disabled = true;
  }

  try {
    // 加载JSZip库
    if (!window.JSZip) {
      await import('../../../../../../lib/jszip.min.js');
    }

    const zip = new JSZip();
    const imagesFolder = zip.folder('images');

    // 配置数据
    const configData = {
      name,
      idle: '',
      clickAnim: '',
      afterClick: '',
      animDuration,
      restoreDelay,
      exportTime: Date.now(),
      version: '1.0'
    };

    // 处理每个图片字段
    const fields = [
      { key: 'idle', url: idle },
      { key: 'clickAnim', url: clickAnim },
      { key: 'afterClick', url: afterClick }
    ];

    for (const field of fields) {
      if (!field.url) continue;

      // 网络图片保持URL
      if (field.url.startsWith('http://') || field.url.startsWith('https://')) {
        configData[field.key] = field.url;
        continue;
      }

      // 本地图片转成文件放入ZIP
      try {
        const response = await fetch(field.url);
        const blob = await response.blob();

        // 从URL中提取文件扩展名
        const ext = field.url.split('.').pop() || 'png';
        const fileName = `${field.key}.${ext}`;

        imagesFolder.file(fileName, blob);
        configData[field.key] = `images/${fileName}`;

        logger.debug('[BeautifyPopup] 已添加图片到ZIP:', fileName);
      } catch (error) {
        logger.warn('beautify', '获取图片失败:', field.url, error);
        // 失败时尝试用Base64
        configData[field.key] = await urlToBase64(field.url);
      }
    }

    // 添加配置文件
    zip.file('config.json', JSON.stringify(configData, null, 2));

    // 生成ZIP并下载
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `gif-pack_${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${Date.now()}.zip`;
    a.click();

    URL.revokeObjectURL(url);
    logger.info('beautify', '动画库已导出为ZIP:', name);

  } catch (error) {
    logger.error('[BeautifyPopup] 导出失败:', error);
    alert('导出失败：' + error.message);
  } finally {
    if (exportBtn) {
      exportBtn.innerHTML = originalText;
      exportBtn.disabled = false;
    }
  }
}

/**
 * 导入GIF动画库（支持ZIP和JSON格式）
 *
 * @description
 * 从文件导入动画库配置到编辑器：
 * - ZIP格式：读取config.json配置，images文件夹中的图片转为Blob URL
 * - JSON格式：兼容旧版Base64格式的导出文件
 *
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @returns {void}
 * @example
 * importGifPack(document.querySelector('.gif-pack-editor-overlay'));
 */
function importGifPack(editorOverlay) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,.json';

  input.addEventListener('change', async function () {
    const file = this.files?.[0];
    if (!file) return;

    // 显示加载提示
    const importBtn = editorOverlay.querySelector('#gif-pack-import');
    const originalText = importBtn?.innerHTML;
    if (importBtn) {
      importBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导入中...';
      importBtn.disabled = true;
    }

    try {
      let data;
      let zipFile = null;

      // 判断文件类型
      if (file.name.endsWith('.zip')) {
        // ZIP格式
        if (!window.JSZip) {
          await import('../../../../../../lib/jszip.min.js');
        }

        zipFile = await JSZip.loadAsync(file);
        const configFile = zipFile.file('config.json');
        if (!configFile) {
          throw new Error('ZIP文件中缺少config.json');
        }
        const configText = await configFile.async('string');
        data = JSON.parse(configText);
      } else {
        // JSON格式（向后兼容）
        const text = await file.text();
        data = JSON.parse(text);
      }

      // 验证数据格式
      if (!data.name && !data.idle && !data.clickAnim && !data.afterClick) {
        throw new Error('无效的动画库文件');
      }

      // 填充名称
      const nameInput = editorOverlay.querySelector('#gif-pack-name');
      if (nameInput && data.name) {
        nameInput.value = data.name;
      }

      // 填充动画时长
      const animDurationInput = editorOverlay.querySelector('#gif-pack-animDuration');
      if (animDurationInput && data.animDuration) {
        animDurationInput.value = data.animDuration;
      }

      // 填充恢复延迟
      const restoreDelayInput = editorOverlay.querySelector('#gif-pack-restoreDelay');
      if (restoreDelayInput && data.restoreDelay !== undefined) {
        restoreDelayInput.value = data.restoreDelay;
      }

      // 处理图片
      if (data.idle) {
        await importGifPackImage(editorOverlay, 'idle', data.idle, zipFile);
      }
      if (data.clickAnim) {
        await importGifPackImage(editorOverlay, 'clickAnim', data.clickAnim, zipFile);
      }
      if (data.afterClick) {
        await importGifPackImage(editorOverlay, 'afterClick', data.afterClick, zipFile);
      }

      logger.info('beautify', '动画库已导入:', data.name);
      alert('导入成功！请检查内容后点击保存。');

    } catch (error) {
      logger.error('[BeautifyPopup] 导入失败:', error);
      alert('导入失败：' + error.message);
    } finally {
      if (importBtn) {
        importBtn.innerHTML = originalText;
        importBtn.disabled = false;
      }
    }
  });

  input.click();
}

/**
 * 导入单个图片字段到GIF动画库编辑器
 *
 * @description
 * 根据图片数据类型自动处理：
 * 1. 网络URL（http/https）→ 直接使用
 * 2. ZIP内路径（images/xxx）→ 从ZIP读取并上传到服务器
 * 3. Base64数据 → 上传到服务器
 *
 * @async
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名（idle/clickAnim/afterClick）
 * @param {string} imageData - 图片数据（Base64、URL或ZIP内路径）
 * @param {Object|null} [zipFile=null] - JSZip对象（从ZIP导入时传入）
 * @returns {Promise<void>}
 * @example
 * // 导入网络图片
 * await importGifPackImage(overlay, 'idle', 'https://example.com/img.png');
 * // 从ZIP导入
 * await importGifPackImage(overlay, 'idle', 'images/idle.png', zipFile);
 */
async function importGifPackImage(editorOverlay, field, imageData, zipFile = null) {
  const preview = editorOverlay.querySelector(`#gif-pack-${field}-preview`);
  const hiddenInput = editorOverlay.querySelector(`#gif-pack-${field}`);

  // 如果是URL（网络图片），直接使用
  if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
    if (preview) {
      preview.innerHTML = `<img src="${imageData}" alt="${field}">`;
    }
    if (hiddenInput) {
      hiddenInput.value = imageData;
    }
    return;
  }

  // 如果是ZIP内的图片路径（如 images/idle.png）
  if (zipFile && imageData.startsWith('images/')) {
    try {
      const imageFile = zipFile.file(imageData);
      if (!imageFile) {
        throw new Error(`ZIP中找不到图片: ${imageData}`);
      }

      // 从ZIP中读取图片为Blob
      const blob = await imageFile.async('blob');

      // 转成Base64上传
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          // 移除前缀
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 提取扩展名
      const ext = imageData.split('.').pop() || 'png';
      const timestamp = Date.now();
      const fileName = `acsus-paws-puffs_gifpack_${field}_${timestamp}.${ext}`;

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: fileName,
          data: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`上传失败（状态码：${response.status}）`);
      }

      const result = await response.json();
      const filePath = result.path;

      if (preview) {
        preview.innerHTML = `<img src="${filePath}" alt="${field}">`;
      }
      if (hiddenInput) {
        hiddenInput.value = filePath;
      }

      logger.debug('[BeautifyPopup] ZIP图片已上传:', field, filePath);
      return;

    } catch (error) {
      logger.error('[BeautifyPopup] 从ZIP导入图片失败:', field, error);
      return;
    }
  }

  // 如果是Base64，上传到服务器
  if (imageData.startsWith('data:')) {
    try {
      // 提取Base64数据和文件类型
      const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('无效的图片数据');
      }

      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const base64Data = matches[2];
      const timestamp = Date.now();
      const fileName = `acsus-paws-puffs_gifpack_${field}_${timestamp}.${ext}`;

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: fileName,
          data: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`上传失败（状态码：${response.status}）`);
      }

      const result = await response.json();
      const filePath = result.path;

      if (preview) {
        preview.innerHTML = `<img src="${filePath}" alt="${field}">`;
      }
      if (hiddenInput) {
        hiddenInput.value = filePath;
      }

      logger.debug('[BeautifyPopup] 导入图片已上传:', field, filePath);

    } catch (error) {
      logger.error('[BeautifyPopup] 导入图片失败:', field, error);
    }
  }
}

/**
 * 把URL转成Base64（用于导出）
 * @param {string} url - 图片URL
 * @returns {Promise<string>} Base64字符串或原URL
 */
async function urlToBase64(url) {
  if (!url) return '';

  // 如果是网络URL，直接返回（不转换）
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // 如果是本地文件，转成Base64
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    logger.warn('beautify', '转换Base64失败:', url, error);
    return url; // 失败时返回原URL
  }
}

// ==========================================
// 等待动画库相关函数（新增）
// ==========================================

/**
 * 渲染当前使用的等待动画预览
 * @param {Array} waitingPacks - 等待动画库列表
 * @param {string} currentWaitingPackId - 当前使用的等待动画库ID
 * @returns {string} HTML字符串
 */
function renderCurrentWaitingPack(waitingPacks, currentWaitingPackId) {
  const currentPack = waitingPacks.find(p => p.id === currentWaitingPackId);

  if (!currentPack) {
    return `
            <div class="waiting-pack-current-empty">
                <i class="fa-solid fa-spinner"></i>
                <span>未选择等待动画</span>
                <p>发送消息时将保持待机图片不变</p>
            </div>
        `;
  }

  // 根据是否有开始动画，决定显示2个还是3个预览项
  const hasStartGif = !!currentPack.startGif;

  return `
        <div class="waiting-pack-current">
            <div class="waiting-pack-current-header">
                <span class="waiting-pack-current-name">${currentPack.name}</span>
                <button class="waiting-pack-current-clear" id="waiting-pack-clear-current" title="取消使用">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="waiting-pack-current-hint">点击 × 取消使用此动画库</div>
            <div class="waiting-pack-current-preview ${hasStartGif ? 'has-start' : ''}">>
                ${hasStartGif ? `
                    <div class="waiting-pack-preview-item">
                        <div class="waiting-pack-preview-img">
                            <img src="${currentPack.startGif}" alt="开始动画">
                        </div>
                        <span>开始</span>
                    </div>
                    <div class="waiting-pack-preview-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                ` : ''}
                <div class="waiting-pack-preview-item">
                    <div class="waiting-pack-preview-img">
                        ${currentPack.waitingGif ? `<img src="${currentPack.waitingGif}" alt="等待动画">` : '<i class="fa-solid fa-spinner"></i>'}
                    </div>
                    <span>等待中</span>
                </div>
                <div class="waiting-pack-preview-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                <div class="waiting-pack-preview-item">
                    <div class="waiting-pack-preview-img">
                        ${currentPack.completeGif ? `<img src="${currentPack.completeGif}" alt="完成动画">` : '<i class="fa-solid fa-check"></i>'}
                    </div>
                    <span>完成</span>
                </div>
            </div>
            <div class="waiting-pack-current-info">
                ${hasStartGif ? `<span><i class="fa-solid fa-play"></i> 开始 ${currentPack.startDuration || 2}秒</span>` : ''}
                <span><i class="fa-solid fa-clock"></i> 完成 ${currentPack.completeDuration || 3}秒</span>
            </div>
        </div>
    `;
}


/**
 * 渲染等待动画库网格
 * @param {Array} waitingPacks - 等待动画库列表
 * @param {string} currentWaitingPackId - 当前使用的等待动画库ID
 * @returns {string} HTML字符串
 */
function renderWaitingPackGrid(waitingPacks, currentWaitingPackId) {
  if (!waitingPacks || waitingPacks.length === 0) {
    return '<div class="waiting-pack-grid-empty">暂无等待动画库，点击"新建"创建</div>';
  }

  return waitingPacks.map(pack => `
        <div class="waiting-pack-item ${pack.id === currentWaitingPackId ? 'active' : ''}" data-pack-id="${pack.id}">
            <div class="waiting-pack-item-preview">
                ${pack.waitingGif ? `<img src="${pack.waitingGif}" alt="${pack.name}">` : '<i class="fa-solid fa-spinner"></i>'}
            </div>
            <div class="waiting-pack-item-info">
                <span class="waiting-pack-item-name">${pack.name}</span>
            </div>
            <div class="waiting-pack-item-actions">
                <button class="waiting-pack-item-edit" data-pack-id="${pack.id}" title="编辑">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="waiting-pack-item-delete" data-pack-id="${pack.id}" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}


/**
 * 处理等待动画库网格点击
 * @param {Event} e - 点击事件
 * @param {Element} overlay - 弹窗元素
 */
function handleWaitingPackGridClick(e, overlay) {
  const target = e.target;

  // 编辑按钮
  const editBtn = target.closest('.waiting-pack-item-edit');
  if (editBtn) {
    const packId = editBtn.getAttribute('data-pack-id');
    const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
    const pack = settings.waitingPacks?.find(p => p.id === packId);
    if (pack) {
      openWaitingPackEditor(overlay, pack);
    }
    return;
  }

  // 删除按钮
  const deleteBtn = target.closest('.waiting-pack-item-delete');
  if (deleteBtn) {
    const packId = deleteBtn.getAttribute('data-pack-id');
    handleDeleteWaitingPack(overlay, packId);
    return;
  }

  // 点击整个卡片 = 应用该等待动画库
  const packItem = target.closest('.waiting-pack-item');
  if (packItem && !target.closest('.waiting-pack-item-actions')) {
    const packId = packItem.getAttribute('data-pack-id');
    applyWaitingPack(overlay, packId);
  }
}


/**
 * 应用等待动画库
 * @param {Element} overlay - 弹窗元素
 * @param {string} packId - 等待动画库ID
 */
function applyWaitingPack(overlay, packId) {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const pack = settings.waitingPacks?.find(p => p.id === packId);

  if (!pack) {
    logger.warn('beautify', '找不到等待动画库:', packId);
    return;
  }

  // 保存当前使用的等待动画库ID
  saveFloatingBtnSettings({ currentWaitingPackId: packId });

  // 刷新UI
  refreshWaitingPackUI(overlay);

  logger.info('beautify', '已应用等待动画库:', pack.name);
}

/**
 * 删除等待动画库
 * @async
 * @param {Element} overlay - 弹窗元素
 * @param {string} packId - 等待动画库ID
 */
async function handleDeleteWaitingPack(overlay, packId) {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const waitingPacks = settings.waitingPacks || [];
  const pack = waitingPacks.find(p => p.id === packId);

  if (!pack) return;
  if (!confirm(`确定要删除等待动画库 "${pack.name}" 吗？\n相关的本地图片文件也会被删除。`)) return;

  // 删除服务器上的本地图片文件
  const filesToDelete = [pack.waitingGif, pack.completeGif].filter(url => {
    return url && (url.startsWith('/user/files/') || url.includes('acsus-paws-puffs'));
  });

  for (const fileUrl of filesToDelete) {
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path: fileUrl })
      });
      logger.info('beautify', '已删除本地文件:', fileUrl);
    } catch (error) {
      logger.warn('beautify', '删除文件失败:', fileUrl, error);
    }
  }


  // 从列表中移除
  const newWaitingPacks = waitingPacks.filter(p => p.id !== packId);

  // 如果删除的是当前使用的等待动画库，清除当前选择
  let newCurrentId = settings.currentWaitingPackId;
  if (settings.currentWaitingPackId === packId) {
    newCurrentId = '';
  }

  saveFloatingBtnSettings({ waitingPacks: newWaitingPacks, currentWaitingPackId: newCurrentId });
  refreshWaitingPackUI(overlay);

  logger.info('beautify', '已删除等待动画库:', pack.name);
}

/**
 * 刷新等待动画库UI
 * @param {Element} overlay - 弹窗元素
 */
function refreshWaitingPackUI(overlay) {
  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const waitingPacks = settings.waitingPacks || [];
  const currentWaitingPackId = settings.currentWaitingPackId || '';

  // 刷新当前使用的等待动画预览
  const currentSection = overlay.querySelector('.waiting-pack-current-section');
  if (currentSection) {
    currentSection.innerHTML = renderCurrentWaitingPack(waitingPacks, currentWaitingPackId);
    // 重新绑定清除按钮事件
    const clearBtn = currentSection.querySelector('#waiting-pack-clear-current');
    clearBtn?.addEventListener('click', () => {
      saveFloatingBtnSettings({ currentWaitingPackId: '' });
      refreshWaitingPackUI(overlay);
      logger.info('beautify', '已取消使用等待动画库');
    });
  }

  // 刷新等待动画库网格
  const grid = overlay.querySelector('#waiting-pack-grid');
  if (grid) {
    grid.innerHTML = renderWaitingPackGrid(waitingPacks, currentWaitingPackId);
  }
}


/**
 * 搜索过滤等待动画库
 * @param {Element} overlay - 弹窗元素
 * @param {string} keyword - 搜索关键词
 */
function filterWaitingPacks(overlay, keyword) {
  const items = overlay.querySelectorAll('.waiting-pack-item');
  const lowerKeyword = keyword.toLowerCase().trim();

  items.forEach(item => {
    const name = item.querySelector('.waiting-pack-item-name')?.textContent?.toLowerCase() || '';
    const match = !lowerKeyword || name.includes(lowerKeyword);
    item.style.display = match ? '' : 'none';
  });
}

/**
 * 打开等待动画库编辑器
 * @param {Element} overlay - 主弹窗元素
 * @param {Object|null} pack - 要编辑的等待动画库，null表示新建
 */
function openWaitingPackEditor(overlay, pack) {
  const isNew = !pack;
  const packData = pack || {
    id: `waitpack_${Date.now()}`,
    name: '',
    startGif: '',           // 新增：开始动画
    startDuration: 2,       // 新增：开始动画时长
    waitingGif: '',
    waitingLoop: true,
    completeGif: '',
    completeDuration: 3
  };

  const editorHtml = `
        <div class="waiting-pack-editor-overlay">
            <div class="waiting-pack-editor">
                <div class="waiting-pack-editor-header">
                    <h3><i class="fa-solid fa-${isNew ? 'plus' : 'pen'}"></i> ${isNew ? '新建' : '编辑'}等待动画</h3>
                    <button class="waiting-pack-editor-close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="waiting-pack-editor-content">
                    <!-- 库名称 -->
                    <div class="waiting-pack-editor-field">
                        <label><i class="fa-solid fa-tag"></i> 库名称</label>
                        <input type="text" id="waiting-pack-name" value="${packData.name}" placeholder="给等待动画库起个名字...">
                    </div>

                    <!-- 开始动画（新增） -->
                    <div class="waiting-pack-editor-field">
                        <label><i class="fa-solid fa-play"></i> ① 开始动画（发送后播放一次）</label>
                        <div class="waiting-pack-editor-upload" data-field="startGif">
                            <div class="waiting-pack-editor-preview" id="waiting-pack-startGif-preview">
                                ${packData.startGif ? `<img src="${packData.startGif}" alt="开始动画">` : '<i class="fa-solid fa-play"></i>'}
                            </div>
                            <div class="waiting-pack-editor-btns">
                                <button class="beautify-popup-btn waiting-pack-upload-btn" data-field="startGif">
                                    <i class="fa-solid fa-upload"></i> 上传
                                </button>
                                <button class="beautify-popup-btn waiting-pack-url-btn" data-field="startGif">
                                    <i class="fa-solid fa-link"></i>
                                </button>
                                <button class="beautify-popup-btn waiting-pack-clear-btn" data-field="startGif">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <input type="hidden" id="waiting-pack-startGif" value="${packData.startGif || ''}">
                        </div>
                        <div class="waiting-pack-editor-delay">
                            <span>播放时长：</span>
                            <input type="number" id="waiting-pack-startDuration" value="${packData.startDuration || 2}" min="0.5" max="10" step="0.5">
                            <span>秒（播完后切换到等待动画）</span>
                        </div>
                    </div>

                    <!-- 等待动画 -->
                    <div class="waiting-pack-editor-field">
                        <label><i class="fa-solid fa-spinner"></i> ② 等待动画（开始动画播完后循环）</label>
                        <div class="waiting-pack-editor-upload" data-field="waitingGif">
                            <div class="waiting-pack-editor-preview" id="waiting-pack-waitingGif-preview">
                                ${packData.waitingGif ? `<img src="${packData.waitingGif}" alt="等待动画">` : '<i class="fa-solid fa-spinner"></i>'}
                            </div>
                            <div class="waiting-pack-editor-btns">
                                <button class="beautify-popup-btn waiting-pack-upload-btn" data-field="waitingGif">
                                    <i class="fa-solid fa-upload"></i> 上传
                                </button>
                                <button class="beautify-popup-btn waiting-pack-url-btn" data-field="waitingGif">
                                    <i class="fa-solid fa-link"></i>
                                </button>
                                <button class="beautify-popup-btn waiting-pack-clear-btn" data-field="waitingGif">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <input type="hidden" id="waiting-pack-waitingGif" value="${packData.waitingGif || ''}">
                        </div>
                    </div>

                    <!-- 完成动画 -->
                    <div class="waiting-pack-editor-field">
                        <label><i class="fa-solid fa-check"></i> ③ 完成动画（AI输出完成后播放）</label>
                        <div class="waiting-pack-editor-upload" data-field="completeGif">
                            <div class="waiting-pack-editor-preview" id="waiting-pack-completeGif-preview">
                                ${packData.completeGif ? `<img src="${packData.completeGif}" alt="完成动画">` : '<i class="fa-solid fa-check"></i>'}
                            </div>
                            <div class="waiting-pack-editor-btns">
                                <button class="beautify-popup-btn waiting-pack-upload-btn" data-field="completeGif">
                                    <i class="fa-solid fa-upload"></i> 上传
                                </button>
                                <button class="beautify-popup-btn waiting-pack-url-btn" data-field="completeGif">
                                    <i class="fa-solid fa-link"></i>
                                </button>
                                <button class="beautify-popup-btn waiting-pack-clear-btn" data-field="completeGif">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                            <input type="hidden" id="waiting-pack-completeGif" value="${packData.completeGif || ''}">
                        </div>
                        <div class="waiting-pack-editor-delay">
                            <span>播放时长：</span>
                            <input type="number" id="waiting-pack-completeDuration" value="${packData.completeDuration || 3}" min="1" max="30" step="1">
                            <span>秒（播放多久后恢复待机）</span>
                        </div>
                    </div>
                </div>

                <div class="waiting-pack-editor-footer">
                    <div class="waiting-pack-editor-footer-row">
                        <button class="beautify-popup-btn waiting-pack-editor-import" id="waiting-pack-import" title="导入等待动画库（JSON格式）">
                            <i class="fa-solid fa-file-import"></i> 导入
                        </button>
                        <button class="beautify-popup-btn waiting-pack-editor-export" id="waiting-pack-export" title="导出等待动画库（JSON格式）">
                            <i class="fa-solid fa-file-export"></i> 导出
                        </button>
                    </div>
                    <div class="waiting-pack-editor-footer-row">
                        <button class="beautify-popup-btn waiting-pack-editor-save" id="waiting-pack-save">
                            <i class="fa-solid fa-check"></i> 保存
                        </button>
                        ${!isNew ? `
                            <button class="beautify-popup-btn waiting-pack-editor-delete" id="waiting-pack-delete">
                                <i class="fa-solid fa-trash"></i> 删除
                            </button>
                        ` : ''}
                        <button class="beautify-popup-btn waiting-pack-editor-cancel" id="waiting-pack-cancel">
                            <i class="fa-solid fa-xmark"></i> 取消
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

  // 添加到弹窗内
  overlay.insertAdjacentHTML('beforeend', editorHtml);

  const editorOverlay = overlay.querySelector('.waiting-pack-editor-overlay');

  // 显示动画
  requestAnimationFrame(() => {
    editorOverlay?.classList.add('show');
  });

  // 绑定编辑器事件
  bindWaitingPackEditorEvents(overlay, editorOverlay, packData, isNew);
}


/**
 * 绑定等待动画库编辑器事件
 * @param {Element} mainOverlay - 主弹窗元素
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {Object} packData - 等待动画库数据
 * @param {boolean} isNew - 是否是新建
 */
function bindWaitingPackEditorEvents(mainOverlay, editorOverlay, packData, isNew) {
  // 关闭按钮
  const closeBtn = editorOverlay.querySelector('.waiting-pack-editor-close');
  closeBtn?.addEventListener('click', () => closeWaitingPackEditor(editorOverlay));

  // 取消按钮
  const cancelBtn = editorOverlay.querySelector('#waiting-pack-cancel');
  cancelBtn?.addEventListener('click', () => closeWaitingPackEditor(editorOverlay));

  // 点击遮罩关闭
  editorOverlay.addEventListener('click', (e) => {
    if (e.target === editorOverlay) {
      closeWaitingPackEditor(editorOverlay);
    }
  });

  // 上传按钮
  const uploadBtns = editorOverlay.querySelectorAll('.waiting-pack-upload-btn');
  uploadBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-field');
      handleWaitingPackFieldUpload(editorOverlay, field);
    });
  });

  // URL按钮
  const urlBtns = editorOverlay.querySelectorAll('.waiting-pack-url-btn');
  urlBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-field');
      handleWaitingPackFieldUrl(editorOverlay, field);
    });
  });

  // 清除按钮
  const clearBtns = editorOverlay.querySelectorAll('.waiting-pack-clear-btn');
  clearBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-field');
      clearWaitingPackField(editorOverlay, field);
    });
  });


  // 导出按钮
  const exportBtn = editorOverlay.querySelector('#waiting-pack-export');
  exportBtn?.addEventListener('click', () => {
    exportWaitingPack(editorOverlay);
  });

  // 导入按钮
  const importBtn = editorOverlay.querySelector('#waiting-pack-import');
  importBtn?.addEventListener('click', () => {
    importWaitingPack(editorOverlay);
  });

  // 保存按钮
  const saveBtn = editorOverlay.querySelector('#waiting-pack-save');
  saveBtn?.addEventListener('click', () => {
    saveWaitingPack(mainOverlay, editorOverlay, packData.id, isNew);
  });

  // 删除按钮
  const deleteBtn = editorOverlay.querySelector('#waiting-pack-delete');
  deleteBtn?.addEventListener('click', () => {
    if (confirm(`确定要删除等待动画库 "${packData.name}" 吗？`)) {
      handleDeleteWaitingPack(mainOverlay, packData.id);
      closeWaitingPackEditor(editorOverlay);
    }
  });
}

/**
 * 关闭等待动画库编辑器
 * @param {Element} editorOverlay - 编辑器弹窗元素
 */
function closeWaitingPackEditor(editorOverlay) {
  editorOverlay.classList.remove('show');
  setTimeout(() => {
    editorOverlay.remove();
  }, 300);
}


/**
 * 处理等待动画库字段上传
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名 ('waitingGif' | 'completeGif')
 */
function handleWaitingPackFieldUpload(editorOverlay, field) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async function () {
    const file = this.files?.[0];
    if (!file) return;

    // 如果当前字段已有本地文件，先删除旧文件
    const hiddenInput = editorOverlay.querySelector(`#waiting-pack-${field}`);
    const oldUrl = hiddenInput?.value || '';
    if (oldUrl && (oldUrl.startsWith('/user/files/') || oldUrl.includes('acsus-paws-puffs'))) {
      try {
        await fetch('/api/files/delete', {
          method: 'POST',
          headers: getRequestHeaders(),
          body: JSON.stringify({ path: oldUrl })
        });
        logger.debug('[BeautifyPopup] 已删除旧文件:', oldUrl);
      } catch (error) {
        logger.warn('beautify', '删除旧文件失败:', oldUrl, error);
      }
    }

    try {
      const base64Data = await fileToBase64(file);
      const timestamp = Date.now();
      const ext = file.name.split('.').pop();
      const fileName = `acsus-paws-puffs_waitpack_${field}_${timestamp}.${ext}`;

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: fileName,
          data: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`上传失败（状态码：${response.status}）`);
      }

      const result = await response.json();
      const filePath = result.path;


      // 更新预览和隐藏字段
      const preview = editorOverlay.querySelector(`#waiting-pack-${field}-preview`);

      if (preview) {
        preview.innerHTML = `<img src="${filePath}" alt="${field}">`;
      }
      if (hiddenInput) {
        hiddenInput.value = filePath;
      }

      logger.info('beautify', '等待动画库图片已上传:', field, filePath);

    } catch (error) {
      logger.error('[BeautifyPopup] 上传失败:', error);
      alert('上传失败：' + error.message);
    }
  });

  input.click();
}

/**
 * 处理等待动画库字段URL输入
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名（waitingGif/completeGif）
 */
function handleWaitingPackFieldUrl(editorOverlay, field) {
  const url = prompt('请输入图片URL：');
  if (!url) return;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('请输入有效的URL（以 http:// 或 https:// 开头）');
    return;
  }

  // 验证图片
  const img = new Image();
  img.onload = () => {
    const preview = editorOverlay.querySelector(`#waiting-pack-${field}-preview`);
    const hiddenInput = editorOverlay.querySelector(`#waiting-pack-${field}`);

    if (preview) {
      preview.innerHTML = `<img src="${url}" alt="${field}">`;
    }
    if (hiddenInput) {
      hiddenInput.value = url;
    }

    logger.info('beautify', '已添加网络图片:', field, url);
  };
  img.onerror = () => {
    alert('无法加载图片，请检查URL是否正确');
  };
  img.src = url;
}


/**
 * 清除等待动画库字段（同时删除本地文件）
 * @async
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名（waitingGif/completeGif）
 */
async function clearWaitingPackField(editorOverlay, field) {
  const preview = editorOverlay.querySelector(`#waiting-pack-${field}-preview`);
  const hiddenInput = editorOverlay.querySelector(`#waiting-pack-${field}`);
  const currentUrl = hiddenInput?.value || '';

  // 如果是本地上传的文件，删除服务器上的文件
  if (currentUrl && (currentUrl.startsWith('/user/files/') || currentUrl.includes('acsus-paws-puffs'))) {
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path: currentUrl })
      });
      logger.info('beautify', '已删除本地文件:', currentUrl);
    } catch (error) {
      logger.warn('beautify', '删除文件失败:', currentUrl, error);
    }
  }

  const iconMap = {
    startGif: 'fa-play',
    waitingGif: 'fa-spinner',
    completeGif: 'fa-check'
  };

  if (preview) {
    preview.innerHTML = `<i class="fa-solid ${iconMap[field] || 'fa-image'}"></i>`;
  }
  if (hiddenInput) {
    hiddenInput.value = '';
  }
}


/**
 * 保存等待动画库
 *
 * @description
 * 从编辑器弹窗读取用户填写的内容，验证后保存到 extension_settings。
 * 新建时添加到数组末尾，编辑时更新对应条目。
 * 保存成功后关闭编辑器并刷新UI。
 *
 * @param {Element} mainOverlay - 主弹窗元素（用于刷新UI）
 * @param {Element} editorOverlay - 编辑器弹窗元素（用于读取表单值）
 * @param {string} packId - 等待动画库ID（格式：waitpack_时间戳）
 * @param {boolean} isNew - 是否是新建（true=新建添加，false=编辑更新）
 * @returns {void} 验证失败时提前返回，不保存
 * @example
 * // 新建等待动画库
 * saveWaitingPack(mainOverlay, editorOverlay, 'waitpack_1234567890', true);
 * // 编辑已有动画库
 * saveWaitingPack(mainOverlay, editorOverlay, existingPack.id, false);
 */
function saveWaitingPack(mainOverlay, editorOverlay, packId, isNew) {
  const name = editorOverlay.querySelector('#waiting-pack-name')?.value?.trim();
  const startGif = editorOverlay.querySelector('#waiting-pack-startGif')?.value || '';
  const startDuration = parseFloat(editorOverlay.querySelector('#waiting-pack-startDuration')?.value) || 2;
  const waitingGif = editorOverlay.querySelector('#waiting-pack-waitingGif')?.value || '';
  const completeGif = editorOverlay.querySelector('#waiting-pack-completeGif')?.value || '';
  const completeDuration = parseInt(editorOverlay.querySelector('#waiting-pack-completeDuration')?.value) || 3;

  // 验证
  if (!name) {
    alert('请输入库名称');
    return;
  }

  if (!startGif && !waitingGif && !completeGif) {
    alert('请至少上传一张图片');
    return;
  }

  const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
  const waitingPacks = settings.waitingPacks || [];

  const packData = {
    id: packId,
    name,
    startGif,
    startDuration,
    waitingGif,
    completeGif,
    completeDuration,
    updatedTime: Date.now()
  };

  if (isNew) {
    packData.createdTime = Date.now();
    waitingPacks.push(packData);
  } else {
    const index = waitingPacks.findIndex(p => p.id === packId);
    if (index !== -1) {
      waitingPacks[index] = { ...waitingPacks[index], ...packData };
    }
  }

  saveFloatingBtnSettings({ waitingPacks });

  closeWaitingPackEditor(editorOverlay);
  refreshWaitingPackUI(mainOverlay);

  logger.info('beautify', '等待动画库已保存:', name);
}


/**
 * 导出等待动画库为ZIP
 *
 * @description
 * 将等待动画库导出为ZIP文件：
 * - 本地图片打包到images文件夹
 * - 网络图片保持URL
 * - 配置信息保存到config.json
 *
 * @async
 * @param {Element} editorOverlay - 编辑器弹窗元素
 */
async function exportWaitingPack(editorOverlay) {
  const name = editorOverlay.querySelector('#waiting-pack-name')?.value?.trim() || '未命名等待动画';
  const startGif = editorOverlay.querySelector('#waiting-pack-startGif')?.value || '';
  const startDuration = parseFloat(editorOverlay.querySelector('#waiting-pack-startDuration')?.value) || 2;
  const waitingGif = editorOverlay.querySelector('#waiting-pack-waitingGif')?.value || '';
  const completeGif = editorOverlay.querySelector('#waiting-pack-completeGif')?.value || '';
  const completeDuration = parseInt(editorOverlay.querySelector('#waiting-pack-completeDuration')?.value) || 3;

  const exportBtn = editorOverlay.querySelector('#waiting-pack-export');
  const originalText = exportBtn?.innerHTML;
  if (exportBtn) {
    exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导出中...';
    exportBtn.disabled = true;
  }

  try {
    // 加载JSZip库
    if (!window.JSZip) {
      await import('../../../../../../lib/jszip.min.js');
    }

    const zip = new JSZip();
    const imagesFolder = zip.folder('images');

    // 配置数据
    const configData = {
      name,
      startGif: '',
      startDuration,
      waitingGif: '',
      completeGif: '',
      completeDuration,
      exportTime: Date.now(),
      version: '2.0',
      type: 'waiting-pack'
    };

    // 处理每个图片字段
    const fields = [
      { key: 'startGif', url: startGif },
      { key: 'waitingGif', url: waitingGif },
      { key: 'completeGif', url: completeGif }
    ];

    for (const field of fields) {
      if (!field.url) continue;

      // 网络图片保持URL
      if (field.url.startsWith('http://') || field.url.startsWith('https://')) {
        configData[field.key] = field.url;
        continue;
      }

      // 本地图片转成文件放入ZIP
      try {
        const response = await fetch(field.url);
        const blob = await response.blob();

        // 从URL中提取文件扩展名
        const ext = field.url.split('.').pop() || 'gif';
        const fileName = `${field.key}.${ext}`;

        imagesFolder.file(fileName, blob);
        configData[field.key] = `images/${fileName}`;

        logger.debug('[BeautifyPopup] 已添加图片到ZIP:', fileName);
      } catch (error) {
        logger.warn('beautify', '获取图片失败:', field.url, error);
        // 失败时尝试用Base64
        configData[field.key] = await urlToBase64(field.url);
      }
    }

    // 添加配置文件
    zip.file('config.json', JSON.stringify(configData, null, 2));

    // 生成ZIP并下载
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `waiting-pack_${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${Date.now()}.zip`;
    a.click();

    URL.revokeObjectURL(url);
    logger.info('beautify', '等待动画库已导出为ZIP:', name);

  } catch (error) {
    logger.error('[BeautifyPopup] 导出失败:', error);
    alert('导出失败：' + error.message);
  } finally {
    if (exportBtn) {
      exportBtn.innerHTML = originalText;
      exportBtn.disabled = false;
    }
  }
}


/**
 * 导入等待动画库（支持ZIP和JSON格式）
 *
 * @description
 * 从文件导入等待动画库配置到编辑器：
 * - ZIP格式：读取config.json配置，images文件夹中的图片转为Blob URL
 * - JSON格式：兼容旧版Base64格式的导出文件
 *
 * @param {Element} editorOverlay - 编辑器弹窗元素
 */
function importWaitingPack(editorOverlay) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,.json';

  input.addEventListener('change', async function () {
    const file = this.files?.[0];
    if (!file) return;

    const importBtn = editorOverlay.querySelector('#waiting-pack-import');
    const originalText = importBtn?.innerHTML;
    if (importBtn) {
      importBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 导入中...';
      importBtn.disabled = true;
    }

    try {
      let data;
      let zipFile = null;

      // 判断文件类型
      if (file.name.endsWith('.zip')) {
        // ZIP格式
        if (!window.JSZip) {
          await import('../../../../../../lib/jszip.min.js');
        }

        zipFile = await JSZip.loadAsync(file);
        const configFile = zipFile.file('config.json');
        if (!configFile) {
          throw new Error('ZIP文件中缺少config.json');
        }
        const configText = await configFile.async('string');
        data = JSON.parse(configText);
      } else {
        // JSON格式（向后兼容）
        const text = await file.text();
        data = JSON.parse(text);
      }

      // 验证数据格式
      if (!data.name && !data.startGif && !data.waitingGif && !data.completeGif) {
        throw new Error('无效的等待动画库文件');
      }

      // 填充名称
      const nameInput = editorOverlay.querySelector('#waiting-pack-name');
      if (nameInput && data.name) {
        nameInput.value = data.name;
      }

      // 填充开始动画时长
      const startDurationInput = editorOverlay.querySelector('#waiting-pack-startDuration');
      if (startDurationInput && data.startDuration) {
        startDurationInput.value = data.startDuration;
      }

      // 填充完成动画时长
      const durationInput = editorOverlay.querySelector('#waiting-pack-completeDuration');
      if (durationInput && data.completeDuration) {
        durationInput.value = data.completeDuration;
      }

      // 处理图片
      if (data.startGif) {
        await importWaitingPackImage(editorOverlay, 'startGif', data.startGif, zipFile);
      }
      if (data.waitingGif) {
        await importWaitingPackImage(editorOverlay, 'waitingGif', data.waitingGif, zipFile);
      }
      if (data.completeGif) {
        await importWaitingPackImage(editorOverlay, 'completeGif', data.completeGif, zipFile);
      }

      logger.info('beautify', '等待动画库已导入:', data.name);
      alert('导入成功！请检查内容后点击保存。');

    } catch (error) {
      logger.error('[BeautifyPopup] 导入失败:', error);
      alert('导入失败：' + error.message);
    } finally {
      if (importBtn) {
        importBtn.innerHTML = originalText;
        importBtn.disabled = false;
      }
    }
  });

  input.click();
}


/**
 * 导入单个图片字段到等待动画库编辑器
 *
 * @description
 * 处理三种图片来源：
 * - ZIP内的图片文件：从ZIP读取并上传到服务器
 * - 网络URL：直接使用
 * - Base64：上传到服务器（兼容旧版JSON格式）
 *
 * @async
 * @param {Element} editorOverlay - 编辑器弹窗元素
 * @param {string} field - 字段名（startGif/waitingGif/completeGif）
 * @param {string} imageData - 图片数据（路径/URL/Base64）
 * @param {JSZip|null} zipFile - ZIP文件对象（如果是从ZIP导入）
 */
async function importWaitingPackImage(editorOverlay, field, imageData, zipFile = null) {
  const preview = editorOverlay.querySelector(`#waiting-pack-${field}-preview`);
  const hiddenInput = editorOverlay.querySelector(`#waiting-pack-${field}`);

  // 如果是URL（网络图片），直接使用
  if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
    if (preview) {
      preview.innerHTML = `<img src="${imageData}" alt="${field}">`;
    }
    if (hiddenInput) {
      hiddenInput.value = imageData;
    }
    return;
  }

  // 如果是ZIP内的图片路径
  if (zipFile && imageData.startsWith('images/')) {
    try {
      const imageFile = zipFile.file(imageData);
      if (!imageFile) {
        throw new Error(`ZIP中找不到图片: ${imageData}`);
      }

      const blob = await imageFile.async('blob');
      const ext = imageData.split('.').pop() || 'gif';
      const timestamp = Date.now();
      const fileName = `acsus-paws-puffs_waitpack_${field}_${timestamp}.${ext}`;

      // 转为Base64上传
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const dataUrl = await base64Promise;
      const base64Data = dataUrl.split(',')[1];

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: fileName,
          data: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`上传失败（状态码：${response.status}）`);
      }

      const result = await response.json();
      const filePath = result.path;

      if (preview) {
        preview.innerHTML = `<img src="${filePath}" alt="${field}">`;
      }
      if (hiddenInput) {
        hiddenInput.value = filePath;
      }

      logger.debug('[BeautifyPopup] ZIP图片已上传:', field, filePath);
      return;

    } catch (error) {
      logger.error('[BeautifyPopup] 导入ZIP图片失败:', field, error);
      return;
    }
  }

  // 如果是Base64（兼容旧版JSON格式）
  if (imageData.startsWith('data:')) {
    try {
      const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('无效的图片数据');
      }

      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const base64Data = matches[2];
      const timestamp = Date.now();
      const fileName = `acsus-paws-puffs_waitpack_${field}_${timestamp}.${ext}`;

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          name: fileName,
          data: base64Data
        })
      });

      if (!response.ok) {
        throw new Error(`上传失败（状态码：${response.status}）`);
      }

      const result = await response.json();
      const filePath = result.path;

      if (preview) {
        preview.innerHTML = `<img src="${filePath}" alt="${field}">`;
      }
      if (hiddenInput) {
        hiddenInput.value = filePath;
      }

      logger.debug('[BeautifyPopup] 导入图片已上传:', field, filePath);

    } catch (error) {
      logger.error('[BeautifyPopup] 导入图片失败:', field, error);
    }
  }
}


// ==========================================
// 背景图标签管理弹窗
// ==========================================

/**
 * 打开标签管理弹窗
 * @export
 */
export function openTagManagerPopup() {
  logger.info('beautify', '打开标签管理弹窗');

  // 创建弹窗 DOM
  const popup = createTagManagerDOM();

  // 显示弹窗（带动画）
  requestAnimationFrame(() => {
    popup.classList.add('show');
  });
}

/**
 * 创建标签管理弹窗 DOM
 * @returns {HTMLElement} 弹窗容器
 */
function createTagManagerDOM() {
  // 如果已存在弹窗，先移除
  const existingPopup = document.querySelector('.beautify-bg-tag-overlay');
  if (existingPopup) {
    existingPopup.remove();
  }

  // 创建弹窗遮罩
  const overlay = document.createElement('div');
  overlay.className = 'beautify-bg-tag-overlay';
  overlay.id = 'beautify-bg-tag-overlay';

  // 创建弹窗内容
  const container = document.createElement('div');
  container.className = 'beautify-bg-tag-popup-container';

  // 标题栏
  const header = document.createElement('div');
  header.className = 'beautify-bg-tag-popup-header';
  header.innerHTML = `
        <h3>背景图标签管理</h3>
        <button class="beautify-bg-tag-close" title="关闭">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
  container.appendChild(header);

  // 内容区
  const content = document.createElement('div');
  content.className = 'beautify-bg-tag-popup-content';

  // 获取标签列表
  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];

  if (tags.length === 0) {
    content.innerHTML = `
            <div class="beautify-bg-tag-empty">
                <i class="fa-solid fa-tags"></i>
                <p>暂无自定义标签</p>
            </div>
        `;
  } else {
    const list = document.createElement('div');
    list.className = 'beautify-bg-tag-list';

    tags.forEach((tag, index) => {
      const item = document.createElement('div');
      item.className = 'beautify-bg-tag-item';
      item.innerHTML = `
                <div class="beautify-bg-tag-info">
                    <span class="beautify-bg-tag-name">${escapeHtml(tag.name)}</span>
                    <span class="beautify-bg-tag-count">(${tag.backgrounds.length}张)</span>
                </div>
                <div class="beautify-bg-tag-actions">
                    <button class="beautify-bg-tag-edit" data-index="${index}" title="编辑">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="beautify-bg-tag-delete" data-index="${index}" title="删除">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
      list.appendChild(item);
    });

    content.appendChild(list);
  }

  container.appendChild(content);

  // 底部按钮区
  const footer = document.createElement('div');
  footer.className = 'beautify-bg-tag-popup-footer';
  footer.innerHTML = `
        <button class="beautify-bg-tag-create" id="beautify-bg-tag-create">
            <i class="fa-solid fa-plus"></i>
            <span>新建标签</span>
        </button>
    `;
  container.appendChild(footer);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // 绑定事件
  bindTagManagerEvents(overlay);

  return overlay;
}

/**
 * 绑定标签管理弹窗事件
 * @param {HTMLElement} overlay - 遮罩元素
 */
function bindTagManagerEvents(overlay) {
  const container = overlay.querySelector('.beautify-bg-tag-popup-container');
  if (!container) return;

  // 关闭按钮
  const closeBtn = container.querySelector('.beautify-bg-tag-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      closeTagManagerPopup();
    };
  }

  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeTagManagerPopup();
    }
  };

  // 新建标签按钮
  const createBtn = container.querySelector('#beautify-bg-tag-create');
  if (createBtn) {
    createBtn.onclick = () => {
      showCreateTagForm(container);
    };
  }

  // 编辑标签按钮
  container.querySelectorAll('.beautify-bg-tag-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showEditTagForm(container, index);
    };
  });

  // 删除标签按钮
  container.querySelectorAll('.beautify-bg-tag-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showDeleteConfirm(container, index);
    };
  });

  logger.debug('beautify', '[BeautifyPopup] 标签管理弹窗事件已绑定');
}

/**
 * 关闭标签管理弹窗
 */
function closeTagManagerPopup() {
  const overlay = document.querySelector('.beautify-bg-tag-overlay');
  if (!overlay) return;

  logger.info('beautify', '关闭标签管理弹窗');
  overlay.classList.remove('show');

  // 动画结束后移除 DOM
  setTimeout(() => {
    overlay.remove();
  }, 300);
}

/**
 * 显示创建标签表单
 * @param {HTMLElement} container - 弹窗容器
 */
async function showCreateTagForm(container) {
  // 导入标签管理模块的函数
  const { getAllBackgrounds, createBgTag } = await import('./beautify-bg-tags.js');

  // 获取所有背景图
  const backgrounds = await getAllBackgrounds();

  let bgListHtml = '';
  if (backgrounds.length === 0) {
    bgListHtml = '<div class="beautify-bg-tag-empty">暂无可用背景图，请先添加背景图</div>';
  } else {
    bgListHtml = '<div class="beautify-bg-tag-selector-grid">';
    backgrounds.forEach(bg => {
      const title = bg.filename.split('/').pop()?.replace(/\.[^/.]+$/, '') || bg.filename;
      // 使用类似官方的背景图缩略图结构
      bgListHtml += `
                <div class="beautify-bg-tag-option ${bg.isCustom ? 'custom' : ''}" data-bg="${escapeHtml(bg.filename)}">
                    <div class="beautify-bg-tag-option-img" style="background-image: url('${getThumbnailUrl(bg.isCustom ? 'bg_custom' : 'bg', bg.filename)}')"></div>
                    <div class="beautify-bg-tag-option-check">
                        <i class="fa-solid fa-check-square"></i>
                    </div>
                </div>
            `;
    });
    bgListHtml += '</div>';
  }

  // 替换内容区
  const content = container.querySelector('.beautify-bg-tag-popup-content');
  content.innerHTML = `
        <div class="beautify-bg-tag-form">
            <div class="beautify-bg-tag-form-row">
                <label>标签名称</label>
                <input type="text" id="beautify-bg-tag-name" placeholder="输入标签名称" maxlength="20">
            </div>
            <div class="beautify-bg-tag-form-row">
                <label>选择背景图（可多选）</label>
                ${bgListHtml}
            </div>
        </div>
    `;

  // 绑定背景图选择事件
  content.querySelectorAll('.beautify-bg-tag-option').forEach(option => {
    option.onclick = () => {
      option.classList.toggle('selected');
      const isSelected = option.classList.contains('selected');
      option.querySelector('.beautify-bg-tag-option-check i').className = isSelected
        ? 'fa-solid fa-check-square'
        : 'fa-solid fa-square';
    };
  });

  // 替换底部按钮区
  const footer = container.querySelector('.beautify-bg-tag-popup-footer');
  footer.innerHTML = `
        <button class="beautify-bg-tag-cancel" id="beautify-bg-tag-cancel-create">
            取消
        </button>
        <button class="beautify-bg-tag-confirm" id="beautify-bg-tag-confirm-create">
            创建
        </button>
    `;

  // 取消按钮
  footer.querySelector('#beautify-bg-tag-cancel-create').onclick = () => {
    // 重新渲染主界面
    const mainContent = container.querySelector('.beautify-bg-tag-popup-content');
    renderTagList(mainContent);
    renderFooter(footer);
    bindListEvents(container);
  };

  // 创建按钮
  footer.querySelector('#beautify-bg-tag-confirm-create').onclick = () => {
    const nameInput = container.querySelector('#beautify-bg-tag-name');
    const name = nameInput?.value?.trim();
    if (!name) {
      toastr.warning('请输入标签名称');
      return;
    }

    // 获取选中的背景图
    const selectedBgs = [];
    container.querySelectorAll('.beautify-bg-tag-option.selected').forEach(el => {
      const bg = el.getAttribute('data-bg');
      if (bg) selectedBgs.push(bg);
    });

    if (selectedBgs.length === 0) {
      toastr.warning('请至少选择一张背景图');
      return;
    }

    createBgTag({ name, backgrounds: selectedBgs });

    // 重新渲染
    const mainContent = container.querySelector('.beautify-bg-tag-popup-content');
    renderTagList(mainContent);
    renderFooter(footer);
    bindListEvents(container);
  };
}

/**
 * 显示编辑标签表单
 * @param {HTMLElement} container - 弹窗容器
 * @param {number} index - 标签索引
 */
async function showEditTagForm(container, index) {
  // 导入标签管理模块的函数
  const { getAllBackgrounds, updateBgTag } = await import('./beautify-bg-tags.js');

  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];
  const tag = tags[index];
  if (!tag) return;

  // 获取所有背景图
  const backgrounds = await getAllBackgrounds();

  let bgListHtml = '';
  if (backgrounds.length === 0) {
    bgListHtml = '<div class="beautify-bg-tag-empty">暂无可用背景图</div>';
  } else {
    bgListHtml = '<div class="beautify-bg-tag-selector-grid">';
    backgrounds.forEach(bg => {
      const title = bg.filename.split('/').pop()?.replace(/\.[^/.]+$/, '') || bg.filename;
      const isSelected = tag.backgrounds.includes(bg.filename);
      bgListHtml += `
                <div class="beautify-bg-tag-option ${isSelected ? 'selected' : ''} ${bg.isCustom ? 'custom' : ''}" data-bg="${escapeHtml(bg.filename)}">
                    <div class="beautify-bg-tag-option-img" style="background-image: url('${getThumbnailUrl(bg.isCustom ? 'bg_custom' : 'bg', bg.filename)}')"></div>
                    <div class="beautify-bg-tag-option-check">
                        <i class="fa-solid ${isSelected ? 'fa-check-square' : 'fa-square'}"></i>
                    </div>
                </div>
            `;
    });
    bgListHtml += '</div>';
  }

  // 替换内容区
  const content = container.querySelector('.beautify-bg-tag-popup-content');
  content.innerHTML = `
        <div class="beautify-bg-tag-form">
            <div class="beautify-bg-tag-form-row">
                <label>标签名称</label>
                <input type="text" id="beautify-bg-tag-name" placeholder="输入标签名称" maxlength="20" value="${escapeHtml(tag.name)}">
            </div>
            <div class="beautify-bg-tag-form-row">
                <label>选择背景图（可多选）</label>
                ${bgListHtml}
            </div>
        </div>
    `;

  // 绑定背景图选择事件
  content.querySelectorAll('.beautify-bg-tag-option').forEach(option => {
    option.onclick = () => {
      option.classList.toggle('selected');
      const isSelected = option.classList.contains('selected');
      option.querySelector('.beautify-bg-tag-option-check i').className = isSelected
        ? 'fa-solid fa-check-square'
        : 'fa-solid fa-square';
    };
  });

  // 替换底部按钮区
  const footer = container.querySelector('.beautify-bg-tag-popup-footer');
  footer.innerHTML = `
        <button class="beautify-bg-tag-cancel" id="beautify-bg-tag-cancel-edit">
            取消
        </button>
        <button class="beautify-bg-tag-confirm" id="beautify-bg-tag-confirm-edit">
            保存
        </button>
    `;

  // 取消按钮
  footer.querySelector('#beautify-bg-tag-cancel-edit').onclick = () => {
    // 重新渲染主界面
    const mainContent = container.querySelector('.beautify-bg-tag-popup-content');
    renderTagList(mainContent);
    renderFooter(footer);
    bindListEvents(container);
  };

  // 保存按钮
  footer.querySelector('#beautify-bg-tag-confirm-edit').onclick = () => {
    const nameInput = container.querySelector('#beautify-bg-tag-name');
    const name = nameInput?.value?.trim();
    if (!name) {
      toastr.warning('请输入标签名称');
      return;
    }

    // 获取选中的背景图
    const selectedBgs = [];
    container.querySelectorAll('.beautify-bg-tag-option.selected').forEach(el => {
      const bg = el.getAttribute('data-bg');
      if (bg) selectedBgs.push(bg);
    });

    if (selectedBgs.length === 0) {
      toastr.warning('请至少选择一张背景图');
      return;
    }

    updateBgTag(index, { name, backgrounds: selectedBgs });

    // 重新渲染
    const mainContent = container.querySelector('.beautify-bg-tag-popup-content');
    renderTagList(mainContent);
    renderFooter(footer);
    bindListEvents(container);
  };
}

/**
 * 显示删除确认
 * @param {HTMLElement} container - 弹窗容器
 * @param {number} index - 标签索引
 */
async function showDeleteConfirm(container, index) {
  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];
  const tag = tags[index];
  if (!tag) return;

  const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');

  // 使用 CONFIRM 类型
  const result = await callGenericPopup(
    `<p>确定要删除标签 "<strong>${escapeHtml(tag.name)}</strong>" 吗？<br>删除后无法恢复。</p>`,
    POPUP_TYPE.CONFIRM,
    {
      title: '删除标签',
      okButton: '删除',
      cancelButton: '取消',
    }
  );

  // CONFIRM 返回数字：1=确认，0=取消，null=关闭
  if (result !== 1) return;

  // 从数组中删除
  tags.splice(index, 1);
  extension_settings[EXT_ID].beautify.bgTags = tags;
  saveSettingsDebounced();

  // 重新渲染弹窗内的列表
  const content = container.querySelector('.beautify-bg-tag-popup-content');
  renderTagList(content);
  bindListEvents(container);

  // 同步刷新搜索框下方的标签列表
  import('./beautify-bg-tags.js').then(module => {
    if (typeof module.refreshBgTagsHeader === 'function') {
      module.refreshBgTagsHeader();
    }
  }).catch(err => {
    logger.error('[BeautifyPopup] 刷新标签显示失败:', err);
  });

  toastr.success(`标签 "${tag.name}" 已删除`);
  logger.info('beautify', '标签已删除:', tag);
}

/**
 * 渲染标签列表
 * @param {HTMLElement} content - 内容区元素
 */
function renderTagList(content) {
  const tags = extension_settings[EXT_ID]?.beautify?.bgTags || [];

  if (tags.length === 0) {
    content.innerHTML = `
            <div class="beautify-bg-tag-empty">
                <i class="fa-solid fa-tags"></i>
                <p>暂无自定义标签</p>
            </div>
        `;
    return;
  }

  const list = document.createElement('div');
  list.className = 'beautify-bg-tag-list';

  tags.forEach((tag, index) => {
    const item = document.createElement('div');
    item.className = 'beautify-bg-tag-item';
    item.innerHTML = `
            <div class="beautify-bg-tag-info">
                <span class="beautify-bg-tag-name">${escapeHtml(tag.name)}</span>
                <span class="beautify-bg-tag-count">(${tag.backgrounds.length}张)</span>
            </div>
            <div class="beautify-bg-tag-actions">
                <button class="beautify-bg-tag-edit" data-index="${index}" title="编辑">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="beautify-bg-tag-delete" data-index="${index}" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    list.appendChild(item);
  });

  content.innerHTML = '';
  content.appendChild(list);
}

/**
 * 渲染底部按钮区
 * @param {HTMLElement} footer - 底部元素
 */
function renderFooter(footer) {
  footer.innerHTML = `
        <button class="beautify-bg-tag-create" id="beautify-bg-tag-create">
            <i class="fa-solid fa-plus"></i>
            <span>新建标签</span>
        </button>
    `;
}

/**
 * 绑定列表事件（编辑、删除按钮）
 * @param {HTMLElement} container - 弹窗容器
 */
async function bindListEvents(container) {
  // 新建标签按钮
  const createBtn = container.querySelector('#beautify-bg-tag-create');
  if (createBtn) {
    createBtn.onclick = () => {
      showCreateTagForm(container);
    };
  }

  // 编辑标签按钮
  container.querySelectorAll('.beautify-bg-tag-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showEditTagForm(container, index);
    };
  });

  // 删除标签按钮
  container.querySelectorAll('.beautify-bg-tag-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showDeleteConfirm(container, index);
    };
  });
}


// ==========================================
// 主题标签管理弹窗
// ==========================================

/**
 * 打开主题标签管理弹窗
 * @export
 */
export function openThemeTagManagerPopup() {
  logger.info('beautify', '打开主题标签管理弹窗');

  // 创建弹窗 DOM
  const popup = createThemeTagManagerDOM();

  // 显示弹窗（带动画）
  requestAnimationFrame(() => {
    popup.classList.add('show');
  });
}

/**
 * 创建主题标签管理弹窗 DOM
 * @returns {HTMLElement} 弹窗容器
 */
function createThemeTagManagerDOM() {
  // 如果已存在弹窗，先移除
  const existingPopup = document.querySelector('.beautify-theme-tag-overlay');
  if (existingPopup) {
    existingPopup.remove();
  }

  // 创建弹窗遮罩
  const overlay = document.createElement('div');
  overlay.className = 'beautify-theme-tag-overlay';
  overlay.id = 'beautify-theme-tag-overlay';

  // 创建弹窗内容
  const container = document.createElement('div');
  container.className = 'beautify-theme-tag-popup-container';

  // 标题栏
  const header = document.createElement('div');
  header.className = 'beautify-theme-tag-popup-header';
  header.innerHTML = `
    <h3>主题标签管理</h3>
    <button class="beautify-theme-tag-close" title="关闭">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  container.appendChild(header);

  // 内容区
  const content = document.createElement('div');
  content.className = 'beautify-theme-tag-popup-content';

  // 获取标签列表（使用主题标签）
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];

  if (tags.length === 0) {
    content.innerHTML = `
      <div class="beautify-theme-tag-empty">
        <i class="fa-solid fa-tags"></i>
        <p>暂无自定义标签</p>
      </div>
    `;
  } else {
    const list = document.createElement('div');
    list.className = 'beautify-theme-tag-list';

    tags.forEach((tag, index) => {
      const item = document.createElement('div');
      item.className = 'beautify-theme-tag-item';
      item.innerHTML = `
        <div class="beautify-theme-tag-info">
          <span class="beautify-theme-tag-name">${escapeHtml(tag.name)}</span>
          <span class="beautify-theme-tag-count">(${tag.themeNames?.length || 0}个)</span>
        </div>
        <div class="beautify-theme-tag-actions">
          <button class="beautify-theme-tag-edit" data-index="${index}" title="编辑">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="beautify-theme-tag-delete" data-index="${index}" title="删除">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
      list.appendChild(item);
    });

    content.appendChild(list);
  }

  container.appendChild(content);

  // 底部按钮区
  const footer = document.createElement('div');
  footer.className = 'beautify-theme-tag-popup-footer';
  footer.innerHTML = `
    <button class="beautify-theme-tag-create" id="beautify-theme-tag-create">
      <i class="fa-solid fa-plus"></i>
      <span>新建标签</span>
    </button>
  `;
  container.appendChild(footer);

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  // 绑定事件
  bindThemeTagManagerEvents(overlay);

  return overlay;
}

/**
 * 绑定主题标签管理弹窗事件
 * @param {HTMLElement} overlay - 遮罩元素
 */
function bindThemeTagManagerEvents(overlay) {
  const container = overlay.querySelector('.beautify-theme-tag-popup-container');
  if (!container) return;

  // 关闭按钮
  const closeBtn = container.querySelector('.beautify-theme-tag-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      closeThemeTagManagerPopup();
    };
  }

  // 点击遮罩关闭
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeThemeTagManagerPopup();
    }
  };

  // 新建标签按钮
  const createBtn = container.querySelector('#beautify-theme-tag-create');
  if (createBtn) {
    createBtn.onclick = () => {
      showThemeTagCreateForm(container);
    };
  }

  // 编辑标签按钮
  container.querySelectorAll('.beautify-theme-tag-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showThemeTagEditForm(container, index);
    };
  });

  // 删除标签按钮
  container.querySelectorAll('.beautify-theme-tag-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showThemeTagDeleteConfirm(container, index);
    };
  });

  logger.debug('beautify', '[BeautifyPopup] 主题标签管理弹窗事件已绑定');
}

/**
 * 关闭主题标签管理弹窗
 */
function closeThemeTagManagerPopup() {
  const overlay = document.querySelector('.beautify-theme-tag-overlay');
  if (!overlay) return;

  logger.info('beautify', '关闭主题标签管理弹窗');
  overlay.classList.remove('show');

  // 动画结束后移除 DOM
  setTimeout(() => {
    overlay.remove();
  }, 300);
}

/**
 * 获取可用主题列表
 * @returns {string[]} 主题名称数组
 */
function getThemesForTagging() {
  if (typeof themes !== 'undefined' && Array.isArray(themes)) {
    return themes.map(t => t.name);
  }
  // 降级：从官方下拉框获取
  const select = document.getElementById('themes');
  if (select) {
    return Array.from(select.querySelectorAll('option')).map(opt => opt.value).filter(Boolean);
  }
  return [];
}

/**
 * 显示创建主题标签表单
 * @param {HTMLElement} container - 弹窗容器
 */
async function showThemeTagCreateForm(container) {
  // 获取主题列表
  const themes = getThemesForTagging();

  let themeListHtml = '';
  if (themes.length === 0) {
    themeListHtml = '<div class="beautify-theme-tag-empty">暂无可用主题</div>';
  } else {
    themeListHtml = '<div class="beautify-theme-tag-selector-list">';
    themes.forEach(theme => {
      themeListHtml += `
        <div class="beautify-theme-tag-option" data-theme="${escapeHtml(theme)}">
          <span class="beautify-theme-tag-option-name">${escapeHtml(theme)}</span>
          <div class="beautify-theme-tag-option-check">
            <i class="fa-solid fa-square"></i>
          </div>
        </div>
      `;
    });
    themeListHtml += '</div>';
  }

  // 替换内容区
  const content = container.querySelector('.beautify-theme-tag-popup-content');
  content.innerHTML = `
    <div class="beautify-theme-tag-form">
      <div class="beautify-theme-tag-form-row">
        <label>标签名称</label>
        <input type="text" id="beautify-theme-tag-name" placeholder="输入标签名称" maxlength="20">
      </div>
      <div class="beautify-theme-tag-form-row">
        <label>选择主题（可多选）</label>
        ${themeListHtml}
      </div>
    </div>
  `;

  // 绑定主题选择事件
  content.querySelectorAll('.beautify-theme-tag-option').forEach(option => {
    option.onclick = () => {
      option.classList.toggle('selected');
      const isSelected = option.classList.contains('selected');
      option.querySelector('.beautify-theme-tag-option-check i').className = isSelected
        ? 'fa-solid fa-check-square'
        : 'fa-solid fa-square';
    };
  });

  // 替换底部按钮区
  const footer = container.querySelector('.beautify-theme-tag-popup-footer');
  footer.innerHTML = `
    <button class="beautify-theme-tag-cancel" id="beautify-theme-tag-cancel-create">取消</button>
    <button class="beautify-theme-tag-confirm" id="beautify-theme-tag-confirm-create">创建</button>
  `;

  // 取消按钮
  footer.querySelector('#beautify-theme-tag-cancel-create').onclick = () => {
    renderThemeTagList(content);
    renderThemeTagFooter(footer);
    bindThemeTagListEvents(container);
  };

  // 创建按钮
  footer.querySelector('#beautify-theme-tag-confirm-create').onclick = () => {
    const nameInput = container.querySelector('#beautify-theme-tag-name');
    const name = nameInput?.value?.trim();
    if (!name) {
      toastr.warning('请输入标签名称');
      return;
    }

    // 获取选中的主题
    const selectedThemes = [];
    container.querySelectorAll('.beautify-theme-tag-option.selected').forEach(el => {
      const theme = el.getAttribute('data-theme');
      if (theme) selectedThemes.push(theme);
    });

    createThemeTag({ name, themeNames: selectedThemes });

    // 重新渲染
    renderThemeTagList(content);
    renderThemeTagFooter(footer);
    bindThemeTagListEvents(container);
  };
}

/**
 * 创建主题标签
 * @param {Object} tagData - 标签数据
 */
function createThemeTag(tagData) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];

  // 检查名称是否重复
  if (tags.some(t => t.name === tagData.name)) {
    toastr.warning('标签名称已存在');
    return;
  }

  const newTag = {
    id: Date.now().toString(),
    name: tagData.name,
    themeNames: tagData.themeNames || [],
  };

  tags.push(newTag);
  extension_settings[EXT_ID].beautify.themeTags = tags;
  saveSettingsDebounced();

  toastr.success(`标签 "${tagData.name}" 创建成功`);
  logger.info('beautify', '主题标签已创建:', newTag);

  // 通知主题管理模块刷新
  document.dispatchEvent(new CustomEvent('beautify-theme-tags-changed'));
}

/**
 * 渲染主题标签列表
 * @param {HTMLElement} content - 内容区容器
 */
function renderThemeTagList(content) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];

  if (tags.length === 0) {
    content.innerHTML = `
      <div class="beautify-theme-tag-empty">
        <i class="fa-solid fa-tags"></i>
        <p>暂无自定义标签</p>
      </div>
    `;
    return;
  }

  const list = document.createElement('div');
  list.className = 'beautify-theme-tag-list';

  tags.forEach((tag, index) => {
    const item = document.createElement('div');
    item.className = 'beautify-theme-tag-item';
    item.innerHTML = `
      <div class="beautify-theme-tag-info">
        <span class="beautify-theme-tag-name">${escapeHtml(tag.name)}</span>
        <span class="beautify-theme-tag-count">(${tag.themeNames?.length || 0}个)</span>
      </div>
      <div class="beautify-theme-tag-actions">
        <button class="beautify-theme-tag-edit" data-index="${index}" title="编辑">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="beautify-theme-tag-delete" data-index="${index}" title="删除">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    list.appendChild(item);
  });

  content.innerHTML = '';
  content.appendChild(list);
}

/**
 * 渲染主题标签底部按钮区
 * @param {HTMLElement} footer - 底部元素
 */
function renderThemeTagFooter(footer) {
  footer.innerHTML = `
    <button class="beautify-theme-tag-create" id="beautify-theme-tag-create">
      <i class="fa-solid fa-plus"></i>
      <span>新建标签</span>
    </button>
  `;
}

/**
 * 绑定主题标签列表事件
 * @param {HTMLElement} container - 弹窗容器
 */
function bindThemeTagListEvents(container) {
  const createBtn = container.querySelector('#beautify-theme-tag-create');
  if (createBtn) {
    createBtn.onclick = () => {
      showThemeTagCreateForm(container);
    };
  }

  container.querySelectorAll('.beautify-theme-tag-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showThemeTagEditForm(container, index);
    };
  });

  container.querySelectorAll('.beautify-theme-tag-delete').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      showThemeTagDeleteConfirm(container, index);
    };
  });
}

/**
 * 显示编辑主题标签表单
 * @param {HTMLElement} container - 弹窗容器
 * @param {number} index - 标签索引
 */
async function showThemeTagEditForm(container, index) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];
  const tag = tags[index];
  if (!tag) return;

  // 获取主题列表
  const themes = getThemesForTagging();

  let themeListHtml = '';
  if (themes.length === 0) {
    themeListHtml = '<div class="beautify-theme-tag-empty">暂无可用主题</div>';
  } else {
    themeListHtml = '<div class="beautify-theme-tag-selector-list">';
    themes.forEach(theme => {
      const isSelected = tag.themeNames && tag.themeNames.includes(theme);
      themeListHtml += `
        <div class="beautify-theme-tag-option ${isSelected ? 'selected' : ''}" data-theme="${escapeHtml(theme)}">
          <span class="beautify-theme-tag-option-name">${escapeHtml(theme)}</span>
          <div class="beautify-theme-tag-option-check">
            <i class="fa-solid ${isSelected ? 'fa-check-square' : 'fa-square'}"></i>
          </div>
        </div>
      `;
    });
    themeListHtml += '</div>';
  }

  // 替换内容区
  const content = container.querySelector('.beautify-theme-tag-popup-content');
  content.innerHTML = `
    <div class="beautify-theme-tag-form">
      <div class="beautify-theme-tag-form-row">
        <label>标签名称</label>
        <input type="text" id="beautify-theme-tag-name" placeholder="输入标签名称" maxlength="20" value="${escapeHtml(tag.name)}">
      </div>
      <div class="beautify-theme-tag-form-row">
        <label>选择主题（可多选）</label>
        ${themeListHtml}
      </div>
    </div>
  `;

  // 绑定主题选择事件
  content.querySelectorAll('.beautify-theme-tag-option').forEach(option => {
    option.onclick = () => {
      option.classList.toggle('selected');
      const isSelected = option.classList.contains('selected');
      option.querySelector('.beautify-theme-tag-option-check i').className = isSelected
        ? 'fa-solid fa-check-square'
        : 'fa-solid fa-square';
    };
  });

  // 替换底部按钮区
  const footer = container.querySelector('.beautify-theme-tag-popup-footer');
  footer.innerHTML = `
    <button class="beautify-theme-tag-cancel" id="beautify-theme-tag-cancel-edit">取消</button>
    <button class="beautify-theme-tag-confirm" id="beautify-theme-tag-confirm-edit">保存</button>
  `;

  // 取消按钮
  footer.querySelector('#beautify-theme-tag-cancel-edit').onclick = () => {
    renderThemeTagList(content);
    renderThemeTagFooter(footer);
    bindThemeTagListEvents(container);
  };

  // 保存按钮
  footer.querySelector('#beautify-theme-tag-confirm-edit').onclick = () => {
    const nameInput = container.querySelector('#beautify-theme-tag-name');
    const name = nameInput?.value?.trim();
    if (!name) {
      toastr.warning('请输入标签名称');
      return;
    }

    // 获取选中的主题
    const selectedThemes = [];
    container.querySelectorAll('.beautify-theme-tag-option.selected').forEach(el => {
      const theme = el.getAttribute('data-theme');
      if (theme) selectedThemes.push(theme);
    });

    updateThemeTag(index, { name, themeNames: selectedThemes });

    // 重新渲染
    renderThemeTagList(content);
    renderThemeTagFooter(footer);
    bindThemeTagListEvents(container);
  };
}

/**
 * 更新主题标签
 * @param {number} index - 标签索引
 * @param {Object} tagData - 标签数据
 */
function updateThemeTag(index, tagData) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];

  // 检查名称是否重复（排除自己）
  const duplicateIndex = tags.findIndex((t, i) => i !== index && t.name === tagData.name);
  if (duplicateIndex !== -1) {
    toastr.warning('标签名称已存在');
    return;
  }

  tags[index].name = tagData.name;
  tags[index].themeNames = tagData.themeNames;
  extension_settings[EXT_ID].beautify.themeTags = tags;
  saveSettingsDebounced();

  toastr.success(`标签 "${tagData.name}" 已更新`);
  logger.info('beautify', '主题标签已更新:', tags[index]);

  // 通知主题管理模块刷新
  document.dispatchEvent(new CustomEvent('beautify-theme-tags-changed'));
}

/**
 * 显示删除确认
 * @param {HTMLElement} container - 弹窗容器
 * @param {number} index - 标签索引
 */
async function showThemeTagDeleteConfirm(container, index) {
  const tags = extension_settings[EXT_ID]?.beautify?.themeTags || [];
  const tag = tags[index];

  if (!tag) return;

  const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');

  // CONFIRM 返回数字：1=确认，0=取消，null=关闭
  const result = await callGenericPopup(
    `<p>确定要删除标签 "<strong>${escapeHtml(tag.name)}</strong>" 吗？<br>删除后无法恢复。</p>`,
    POPUP_TYPE.CONFIRM,
    {
      title: '删除标签',
      okButton: '删除',
      cancelButton: '取消',
    }
  );

  if (result !== 1) return;

  // 从数组中删除
  tags.splice(index, 1);
  extension_settings[EXT_ID].beautify.themeTags = tags;
  saveSettingsDebounced();

  toastr.success(`标签 "${tag.name}" 已删除`);
  logger.info('beautify', '主题标签已删除:', tag);

  // 通知主题管理模块刷新
  document.dispatchEvent(new CustomEvent('beautify-theme-tags-changed'));

  // 重新渲染弹窗内列表
  const content = container.querySelector('.beautify-theme-tag-popup-content');
  renderThemeTagList(content);
  const footer = container.querySelector('.beautify-theme-tag-popup-footer');
  renderThemeTagFooter(footer);
  bindThemeTagListEvents(container);
}