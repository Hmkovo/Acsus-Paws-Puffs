/**
 * 聊天界面美化 - 头像布局功能
 * @module beautify/beautify
 *
 * @description
 * 为聊天界面提供沉浸式阅读模式：
 * - 悬浮头像栏（根据当前消息类型动态切换 Char/User）
 * - 背景图区域（可自定义 Char/User 各自背景）
 * - 沉浸模式（隐藏顶部导航栏）
 * - 临时头像（不修改角色卡原头像）
 */

import logger from '../logger.js';
import { extension_settings, getContext } from '../../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, getThumbnailUrl, chat } from '../../../../../script.js';
import { openBeautifyPopup, initBeautifyPopup, applyDisplaySettings } from './beautify-popup.js';
import { timestampToMoment } from '../../../../utils.js';
import { getTokenCountAsync } from '../../../../tokenizers.js';


// ==========================================
// 常量定义
// ==========================================

const EXT_ID = 'pawsPuffs';

/** 文件前缀：定制头像 */
const AVATAR_PREFIX = 'acsus-paws-puffs_beautify_avatar_';

/** 文件前缀：背景图 */
const BG_PREFIX = 'acsus-paws-puffs_beautify_bg_';


// ==========================================
// 模块状态
// ==========================================

/** @type {boolean} 功能是否启用 */
let enabled = false;

/** @type {boolean} 是否已完整初始化 */
let initialized = false;

/** @type {IntersectionObserver|null} 消息可见性观察器 */
let messageObserver = null;

/** @type {HTMLElement|null} 悬浮头像栏元素 */
let stickyHeader = null;

/** @type {boolean} 沉浸模式是否开启 */
let immersiveMode = false;

// 防抖定时器已移除 - Intersection Observer 本身已足够高效

/** @type {boolean} 悬浮栏是否锁定（不跟随滚动） */
let isLocked = false;

/** @type {boolean} 悬浮按钮功能是否启用 */
let floatingBtnEnabled = false;

/** @type {HTMLElement|null} 悬浮按钮元素 */
let floatingBtn = null;

/** @type {boolean} 全宽文字模式是否启用 */
let fullwidthEnabled = false;

/** @type {number} 全宽模式宽度（0-100，0=最宽，100=最窄） */
let fullwidthWidth = 0;

/** @type {boolean} 全宽模式隐藏头像是否启用 */
let fullwidthHideAvatarEnabled = false;

/** @type {boolean} 全宽模式隐藏名字栏是否启用 */
let fullwidthHideNameEnabled = false;

/** @type {boolean} 全宽模式显示不可见消息提示是否启用 */
let fullwidthShowGhostEnabled = false;

/** @type {boolean} 隐藏滚动条是否启用 */
let hideScrollbarEnabled = false;

/** @type {boolean} 滑块变亮是否启用 */
let sliderBrightEnabled = false;

/** @type {boolean} 隐藏复制键是否启用 */
let hideCopyBtnEnabled = false;

/** @type {boolean} 隐藏ID名称是否启用 */
let hideNameEnabled = false;

/** @type {boolean} 代理警告隐藏是否启用 */
let hideProxyWarnEnabled = false;

/** @type {boolean} 快捷回复隐藏是否启用 */
let hideQrEnabled = false;

/** @type {boolean} 导航栏图标透明度是否启用自定义 */
let navIconOpacityEnabled = false;

/** @type {number} 导航栏图标透明度（官方默认0.3） */
let navIconOpacity = 0.3;

/** @type {boolean} 编辑按钮透明度是否启用自定义 */
let editBtnOpacityEnabled = false;

/** @type {number} 编辑按钮透明度（官方默认0.3） */
let editBtnOpacity = 0.3;

/** @type {boolean} 预设开关直觉优化是否启用 */
let presetToggleIntuitiveEnabled = false;

/** @type {boolean} 聊天字体独立设置是否启用 */
let chatFontIndependentEnabled = false;

/** @type {number} 聊天字体比例（0.5-1.5，默认1.0） */
let chatFontScale = 1.0;

/** @type {boolean} 人设选中状态优化是否启用 */
let personaSelectHighlightEnabled = false;

/** @type {boolean} 人设输入框显示头像是否启用 */
let personaAvatarPreviewEnabled = false;

/** @type {boolean} 修复旧版美化类名是否启用 */
let fixOldCssEnabled = false;

/** @type {number} 抽屉页面位置偏移（默认0，负数上移，正数下移） */
let drawerOffset = 0;

/** @type {boolean} 世界书按钮竖排是否启用 */
let wiButtonVerticalEnabled = false;

// ==========================================
// 去除阴影 - 状态变量
// ==========================================

/** @type {boolean} 一键去除所有阴影是否启用 */
let removeShadowAllEnabled = false;

/** @type {boolean} 去除文字阴影是否启用 */
let removeTextShadowEnabled = false;

/** @type {boolean} 去除图标滤镜阴影是否启用 */
let removeFilterShadowEnabled = false;

/** @type {boolean} 去除弹窗阴影是否启用 */
let removePopupShadowEnabled = false;

/** @type {boolean} 去除弹窗遮罩是否启用 */
let removeBackdropEnabled = false;

/** @type {boolean} 去除头像阴影是否启用 */
let removeAvatarShadowEnabled = false;

/** @type {boolean} 去除菜单阴影是否启用 */
let removeMenuShadowEnabled = false;

/** @type {boolean} 去除背景卡片阴影是否启用 */
let removeBgShadowEnabled = false;

// ==========================================
// 阅读辅助 - 状态变量
// ==========================================

/** @type {boolean} 阅读辅助模式是否启用 */
let readingAidEnabled = false;

/** @type {boolean} 文本下划线是否启用 */
let underlineEnabled = false;

/** @type {string} AI下划线颜色 */
let underlineAiColor = 'rgba(187, 193, 138, 0.5)';

/** @type {string} 用户下划线颜色 */
let underlineUserColor = 'rgba(170, 192, 199, 0.2)';

/** @type {boolean} 首字下沉是否启用 */
let dropcapEnabled = false;

/** @type {boolean} 首行缩进是否启用 */
let indentEnabled = false;

/** @type {boolean} 段落间距是否启用 */
let paragraphSpacingEnabled = false;

/** @type {string} 段落间距值 */
let paragraphSpacingValue = '0.8';

/** @type {boolean} 悬停段落高亮是否启用 */
let hoverHighlightEnabled = false;

/** @type {string} 悬停高亮颜色 */
let hoverHighlightColor = 'rgba(242, 198, 116, 0.15)';


// ==========================================
// 初始化
// ==========================================

/**
 * 初始化美化功能
 *
 * @async
 * @returns {Promise<void>}
 *
 * @description
 * 按需加载模式：
 * - 关闭状态：只加载设置，跳过完整初始化
 * - 开启状态：完整初始化所有功能
 */
export async function initBeautifySystem() {
    if (initialized) {
        logger.warn('[Beautify] 已经初始化过了');
        return;
    }

    logger.info('[Beautify] 开始初始化...');

    try {
        // 第一步：加载设置
        loadSettings();

        // 注意：开关绑定在 index.js 的 bindSettingsEvents() 中调用
        // 因为此时设置面板 HTML 还没加载

        // 第二步：检查是否启用，如果启用则完整初始化
        if (enabled) {
            await fullInitialize();
        } else {
            logger.info('[Beautify] 功能未启用，跳过完整初始化');
        }

        initialized = true;
        logger.info('[Beautify] 初始化完成');
    } catch (error) {
        logger.error('[Beautify] 初始化失败:', error);
        throw error;
    }
}

/**
 * 加载设置
 */
function loadSettings() {
    extension_settings[EXT_ID] = extension_settings[EXT_ID] || {};

    // 初始化 beautify 设置（保留已有设置，只添加缺失的字段）
    const defaultSettings = {
        enabled: false,
        floatingBtnEnabled: false,
        fullwidthEnabled: false,
        fullwidthWidth: 0,  // 全宽模式宽度（0=最宽，100=最窄）
        fullwidthHideAvatarEnabled: false,  // 全宽模式隐藏头像
        fullwidthHideNameEnabled: false,  // 全宽模式隐藏名字栏
        fullwidthShowGhostEnabled: false,  // 全宽模式显示不可见消息提示
        hideScrollbarEnabled: false,
        // 便捷小功能
        sliderBrightEnabled: false,
        hideCopyBtnEnabled: false,
        hideNameEnabled: false,
        hideProxyWarnEnabled: false,
        hideQrEnabled: false,
        navIconOpacityEnabled: false,  // 是否启用自定义导航栏图标透明度
        navIconOpacity: 0.3,  // 导航栏图标透明度值
        editBtnOpacityEnabled: false,  // 是否启用自定义编辑按钮透明度
        editBtnOpacity: 0.3,  // 编辑按钮透明度值
        fixOldCssEnabled: false,  // 修复旧版美化类名
        // 新增美化功能
        presetToggleIntuitiveEnabled: false,  // 预设开关直觉优化
        chatFontIndependentEnabled: false,  // 聊天字体独立设置
        chatFontScale: 1.0,  // 聊天字体比例（0.5-1.5）
        personaSelectHighlightEnabled: false,  // 人设选中状态优化
        personaAvatarPreviewEnabled: false,  // 人设输入框显示头像
        drawerOffset: 0,  // 抽屉页面位置偏移
        floatingBtnPosition: { x: window.innerWidth - 70, y: 100 },
        layoutMode: 'default',
        tempAvatars: {},
        backgrounds: {},
        // 悬浮按钮自定义设置
        floatingBtn: {
            size: 38,           // 按钮大小 5-80px
            color: '',          // 图标颜色（RGBA），空=使用主题色
            imageUrl: '',       // 自定义图片 URL
            imageOpacity: 1.0,  // 图片透明度 0.1-1.0
            savedImages: []     // 存档列表 { id, name, url, type, addedTime }
        },
        // 去除阴影
        removeShadowAllEnabled: false,
        removeTextShadowEnabled: false,
        removeFilterShadowEnabled: false,
        removePopupShadowEnabled: false,
        removeBackdropEnabled: false,
        removeAvatarShadowEnabled: false,
        removeMenuShadowEnabled: false,
        removeBgShadowEnabled: false,
        removeTopbarShadowEnabled: false,  // 去除导航栏阴影
        removePresetShadowEnabled: false,  // 去除预设按钮阴影
        removeEditShadowEnabled: false,  // 去除编辑按钮阴影
        // 阅读辅助
        readingAidEnabled: false,
        chatLineHeightEnabled: false,  // 聊天行高开关
        chatLineHeight: 1.6,  // 聊天行高值
        underlineEnabled: false,
        underlineAiColor: 'rgba(187, 193, 138, 0.5)',
        underlineUserColor: 'rgba(170, 192, 199, 0.2)',
        dropcapEnabled: false,
        indentEnabled: false,
        paragraphSpacingEnabled: false,
        paragraphSpacingValue: '0.8',
        hoverHighlightEnabled: false,
        hoverHighlightColor: 'rgba(242, 198, 116, 0.15)'
    };

    extension_settings[EXT_ID].beautify = extension_settings[EXT_ID].beautify || {};

    // 合并默认设置（只添加缺失的字段）
    for (const key in defaultSettings) {
        if (extension_settings[EXT_ID].beautify[key] === undefined) {
            extension_settings[EXT_ID].beautify[key] = defaultSettings[key];
        }
    }

    enabled = extension_settings[EXT_ID].beautify.enabled;
    floatingBtnEnabled = extension_settings[EXT_ID].beautify.floatingBtnEnabled;
    fullwidthEnabled = extension_settings[EXT_ID].beautify.fullwidthEnabled;
    fullwidthWidth = extension_settings[EXT_ID].beautify.fullwidthWidth;
    fullwidthHideAvatarEnabled = extension_settings[EXT_ID].beautify.fullwidthHideAvatarEnabled;
    fullwidthHideNameEnabled = extension_settings[EXT_ID].beautify.fullwidthHideNameEnabled;
    fullwidthShowGhostEnabled = extension_settings[EXT_ID].beautify.fullwidthShowGhostEnabled;
    hideScrollbarEnabled = extension_settings[EXT_ID].beautify.hideScrollbarEnabled;
    // 便捷小功能
    sliderBrightEnabled = extension_settings[EXT_ID].beautify.sliderBrightEnabled;
    hideCopyBtnEnabled = extension_settings[EXT_ID].beautify.hideCopyBtnEnabled;
    hideNameEnabled = extension_settings[EXT_ID].beautify.hideNameEnabled;
    hideProxyWarnEnabled = extension_settings[EXT_ID].beautify.hideProxyWarnEnabled;
    hideQrEnabled = extension_settings[EXT_ID].beautify.hideQrEnabled;
    navIconOpacityEnabled = extension_settings[EXT_ID].beautify.navIconOpacityEnabled;
    navIconOpacity = extension_settings[EXT_ID].beautify.navIconOpacity;
    editBtnOpacityEnabled = extension_settings[EXT_ID].beautify.editBtnOpacityEnabled;
    editBtnOpacity = extension_settings[EXT_ID].beautify.editBtnOpacity;
    fixOldCssEnabled = extension_settings[EXT_ID].beautify.fixOldCssEnabled;
    drawerOffset = extension_settings[EXT_ID].beautify.drawerOffset;
    wiButtonVerticalEnabled = extension_settings[EXT_ID].beautify.wiButtonVerticalEnabled;
    // 新增美化功能
    presetToggleIntuitiveEnabled = extension_settings[EXT_ID].beautify.presetToggleIntuitiveEnabled;
    chatFontIndependentEnabled = extension_settings[EXT_ID].beautify.chatFontIndependentEnabled;
    chatFontScale = extension_settings[EXT_ID].beautify.chatFontScale;
    personaSelectHighlightEnabled = extension_settings[EXT_ID].beautify.personaSelectHighlightEnabled;
    personaAvatarPreviewEnabled = extension_settings[EXT_ID].beautify.personaAvatarPreviewEnabled;
    // 去除阴影
    removeShadowAllEnabled = extension_settings[EXT_ID].beautify.removeShadowAllEnabled;
    removeTextShadowEnabled = extension_settings[EXT_ID].beautify.removeTextShadowEnabled;
    removeFilterShadowEnabled = extension_settings[EXT_ID].beautify.removeFilterShadowEnabled;
    removePopupShadowEnabled = extension_settings[EXT_ID].beautify.removePopupShadowEnabled;
    removeBackdropEnabled = extension_settings[EXT_ID].beautify.removeBackdropEnabled;
    removeAvatarShadowEnabled = extension_settings[EXT_ID].beautify.removeAvatarShadowEnabled;
    removeMenuShadowEnabled = extension_settings[EXT_ID].beautify.removeMenuShadowEnabled;
    removeBgShadowEnabled = extension_settings[EXT_ID].beautify.removeBgShadowEnabled;
    // 阅读辅助
    readingAidEnabled = extension_settings[EXT_ID].beautify.readingAidEnabled;
    underlineEnabled = extension_settings[EXT_ID].beautify.underlineEnabled;
    underlineAiColor = extension_settings[EXT_ID].beautify.underlineAiColor;
    underlineUserColor = extension_settings[EXT_ID].beautify.underlineUserColor;
    dropcapEnabled = extension_settings[EXT_ID].beautify.dropcapEnabled;
    indentEnabled = extension_settings[EXT_ID].beautify.indentEnabled;
    paragraphSpacingEnabled = extension_settings[EXT_ID].beautify.paragraphSpacingEnabled;
    paragraphSpacingValue = extension_settings[EXT_ID].beautify.paragraphSpacingValue;
    hoverHighlightEnabled = extension_settings[EXT_ID].beautify.hoverHighlightEnabled;
    hoverHighlightColor = extension_settings[EXT_ID].beautify.hoverHighlightColor;
    logger.debug('[Beautify] 设置已加载');
}

/**
 * 绑定美化功能的所有开关事件（由 index.js 在设置面板加载后调用）
 *
 * @description
 * 绑定以下元素：
 * 1. 头像布局开关 (#beautify-avatar-layout-enabled)
 * 2. 设置按钮 (#beautify-open-popup-btn) - 点击打开悬浮栏设置弹窗
 * 3. 悬浮按钮开关 (#beautify-floating-btn-enabled)
 *
 * 每个开关会：
 * - 同步初始状态到 UI
 * - 监听变更事件
 * - 保存到 extension_settings
 * - 调用对应的启用/禁用函数
 */
export function bindBeautifyToggle() {
    // 头像布局开关
    const checkbox = document.getElementById('beautify-avatar-layout-enabled');
    if (!checkbox) {
        logger.warn('[Beautify] 未找到开关元素 #beautify-avatar-layout-enabled');
        return;
    }

    // 同步初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = enabled;
    logger.debug('[Beautify] 开关初始状态:', enabled);

    checkbox.addEventListener('change', async function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        extension_settings[EXT_ID].beautify.enabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 开关状态变更:', newState);

        if (newState) {
            await enableBeautify();
        } else {
            disableBeautify();
        }
    });

    // 绑定设置按钮（直接打开悬浮栏设置弹窗）
    const openPopupBtn = document.getElementById('beautify-open-popup-btn');
    if (openPopupBtn) {
        openPopupBtn.addEventListener('click', () => {
            openBeautifyPopup();
            logger.debug('[Beautify] 从设置按钮打开弹窗');
        });
    }

    // 悬浮按钮开关
    const floatingBtnCheckbox = document.getElementById('beautify-floating-btn-enabled');
    if (!floatingBtnCheckbox) {
        logger.warn('[Beautify] 未找到悬浮按钮开关元素 #beautify-floating-btn-enabled');
        return;
    }

    // 同步初始状态
    /** @type {HTMLInputElement} */ (floatingBtnCheckbox).checked = floatingBtnEnabled;
    logger.debug('[Beautify] 悬浮按钮开关初始状态:', floatingBtnEnabled);

    floatingBtnCheckbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        extension_settings[EXT_ID].beautify.floatingBtnEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 悬浮按钮开关状态变更:', newState);

        if (newState) {
            enableFloatingBtn();
        } else {
            disableFloatingBtn();
        }
    });

    // 如果悬浮按钮已启用，立即显示
    if (floatingBtnEnabled) {
        enableFloatingBtn();
    }

    // 绑定复位按钮位置
    const resetPositionBtn = document.getElementById('floating-btn-reset-position');
    if (resetPositionBtn) {
        resetPositionBtn.addEventListener('click', resetFloatingBtnPosition);
    }

    // 全宽文字模式开关
    const fullwidthCheckbox = document.getElementById('beautify-fullwidth-enabled');
    const fullwidthWidthSetting = document.getElementById('beautify-fullwidth-width-setting');
    if (!fullwidthCheckbox) {
        logger.warn('[Beautify] 未找到全宽模式开关元素 #beautify-fullwidth-enabled');
        return;
    }

    // 同步初始状态
    /** @type {HTMLInputElement} */ (fullwidthCheckbox).checked = fullwidthEnabled;
    logger.debug('[Beautify] 全宽模式开关初始状态:', fullwidthEnabled);

    // 根据开关状态显示/隐藏宽度滑块
    if (fullwidthWidthSetting) {
        fullwidthWidthSetting.style.display = fullwidthEnabled ? 'block' : 'none';
    }

    fullwidthCheckbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        extension_settings[EXT_ID].beautify.fullwidthEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 全宽模式开关状态变更:', newState);

        // 显示/隐藏宽度滑块
        if (fullwidthWidthSetting) {
            fullwidthWidthSetting.style.display = newState ? 'block' : 'none';
        }

        if (newState) {
            enableFullwidthMode();
        } else {
            disableFullwidthMode();
        }
    });

    // 绑定全宽模式宽度滑块
    bindFullwidthWidthSlider();

    // 绑定全宽模式子选项
    bindFullwidthSubOptions();

    // 如果全宽模式已启用，立即应用
    if (fullwidthEnabled) {
        enableFullwidthMode();
    }

    // 隐藏滚动条开关
    const hideScrollbarCheckbox = document.getElementById('beautify-hide-scrollbar-enabled');
    if (!hideScrollbarCheckbox) {
        logger.warn('[Beautify] 未找到隐藏滚动条开关元素 #beautify-hide-scrollbar-enabled');
        return;
    }

    // 同步初始状态
    /** @type {HTMLInputElement} */ (hideScrollbarCheckbox).checked = hideScrollbarEnabled;
    logger.debug('[Beautify] 隐藏滚动条开关初始状态:', hideScrollbarEnabled);

    hideScrollbarCheckbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        extension_settings[EXT_ID].beautify.hideScrollbarEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 隐藏滚动条开关状态变更:', newState);

        if (newState) {
            enableHideScrollbar();
        } else {
            disableHideScrollbar();
        }
    });

    // 如果隐藏滚动条已启用，立即应用
    if (hideScrollbarEnabled) {
        enableHideScrollbar();
    }

    // 绑定便捷小功能
    bindMiscFeatures();
}

/**
 * 绑定便捷小功能的所有开关和滑块
 */
function bindMiscFeatures() {
    // 滑块变亮
    bindCheckboxToggle('beautify-slider-bright-enabled', 'sliderBrightEnabled', sliderBrightEnabled,
        () => document.body.classList.add('beautify-slider-bright'),
        () => document.body.classList.remove('beautify-slider-bright')
    );

    // 隐藏复制键
    bindCheckboxToggle('beautify-hide-copy-btn-enabled', 'hideCopyBtnEnabled', hideCopyBtnEnabled,
        () => document.body.classList.add('beautify-hide-copy-btn'),
        () => document.body.classList.remove('beautify-hide-copy-btn')
    );

    // 隐藏ID名称
    bindCheckboxToggle('beautify-hide-name-enabled', 'hideNameEnabled', hideNameEnabled,
        () => document.body.classList.add('beautify-hide-name'),
        () => document.body.classList.remove('beautify-hide-name')
    );

    // 代理警告隐藏
    bindCheckboxToggle('beautify-hide-proxy-warn-enabled', 'hideProxyWarnEnabled', hideProxyWarnEnabled,
        () => document.body.classList.add('beautify-hide-proxy-warn'),
        () => document.body.classList.remove('beautify-hide-proxy-warn')
    );

    // 快捷回复隐藏
    bindCheckboxToggle('beautify-hide-qr-enabled', 'hideQrEnabled', hideQrEnabled,
        () => document.body.classList.add('beautify-hide-qr'),
        () => document.body.classList.remove('beautify-hide-qr')
    );

    // 预设开关直觉优化
    bindCheckboxToggle('beautify-preset-toggle-intuitive-enabled', 'presetToggleIntuitiveEnabled', presetToggleIntuitiveEnabled,
        () => document.body.classList.add('beautify-preset-toggle-intuitive'),
        () => document.body.classList.remove('beautify-preset-toggle-intuitive')
    );

    // 人设选中状态优化
    bindCheckboxToggle('beautify-persona-select-highlight-enabled', 'personaSelectHighlightEnabled', personaSelectHighlightEnabled,
        () => document.body.classList.add('beautify-persona-select-highlight'),
        () => document.body.classList.remove('beautify-persona-select-highlight')
    );

    // 聊天字体独立设置（勾选框+滑块）
    bindChatFontIndependent();

    // 人设输入框显示头像
    bindPersonaAvatarPreview();

    // 导航栏图标透明度（勾选框+滑块）
    bindOpacityWithToggle(
        'beautify-nav-icon-opacity-enabled',
        'beautify-nav-icon-opacity',
        'beautify-nav-icon-opacity-setting',
        'navIconOpacityEnabled',
        'navIconOpacity',
        navIconOpacityEnabled,
        navIconOpacity,
        applyNavIconOpacity,
        clearNavIconOpacity
    );

    // 编辑按钮透明度（勾选框+滑块）
    bindOpacityWithToggle(
        'beautify-edit-btn-opacity-enabled',
        'beautify-edit-btn-opacity',
        'beautify-edit-btn-opacity-setting',
        'editBtnOpacityEnabled',
        'editBtnOpacity',
        editBtnOpacityEnabled,
        editBtnOpacity,
        applyEditBtnOpacity,
        clearEditBtnOpacity
    );

    // 抽屉页面位置偏移滑块
    bindDrawerOffsetSlider();

    // 搜索功能
    bindMiscSearch();

    // 修复旧版美化类名
    bindFixOldCss();

    // 世界书按钮竖排
    bindWiButtonVertical();

    // 去除阴影功能组
    bindRemoveShadowGroup();

    // 阅读辅助功能组
    bindReadingAidGroup();

    logger.debug('[Beautify] 便捷小功能已绑定');
}

/**
 * 通用勾选框绑定函数
 * @param {string} elementId - 元素ID
 * @param {string} settingKey - 设置键名
 * @param {boolean} initialValue - 初始值
 * @param {Function} enableFn - 启用函数
 * @param {Function} disableFn - 禁用函数
 */
function bindCheckboxToggle(elementId, settingKey, initialValue, enableFn, disableFn) {
    const checkbox = document.getElementById(elementId);
    if (!checkbox) {
        logger.warn(`[Beautify] 未找到元素 #${elementId}`);
        return;
    }

    /** @type {HTMLInputElement} */ (checkbox).checked = initialValue;

    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        extension_settings[EXT_ID].beautify[settingKey] = newState;
        saveSettingsDebounced();
        logger.info(`[Beautify] ${settingKey} 状态变更:`, newState);

        if (newState) {
            enableFn();
        } else {
            disableFn();
        }
    });

    // 如果已启用，立即应用
    if (initialValue) {
        enableFn();
    }
}

/**
 * 通用透明度滑块绑定函数
 * @param {string} elementId - 滑块元素ID
 * @param {string} settingKey - 设置键名
 * @param {number} initialValue - 初始值
 * @param {Function} applyFn - 应用函数
 */
function bindOpacitySlider(elementId, settingKey, initialValue, applyFn) {
    const slider = document.getElementById(elementId);
    const valueDisplay = document.getElementById(`${elementId}-value`);
    if (!slider) {
        logger.warn(`[Beautify] 未找到滑块元素 #${elementId}`);
        return;
    }

    /** @type {HTMLInputElement} */ (slider).value = String(initialValue);
    if (valueDisplay) {
        valueDisplay.textContent = String(initialValue);
    }

    slider.addEventListener('input', function () {
        const value = parseFloat(/** @type {HTMLInputElement} */ (this).value);
        extension_settings[EXT_ID].beautify[settingKey] = value;
        saveSettingsDebounced();

        if (valueDisplay) {
            valueDisplay.textContent = String(value);
        }

        applyFn(value);
    });

    // 立即应用初始值
    applyFn(initialValue);
}

/**
 * 绑定带开关的透明度滑块（勾选后才生效）
 *
 * @description
 * 用于导航栏图标透明度、编辑按钮透明度等功能。
 * 勾选后显示滑块并应用透明度，取消勾选则隐藏滑块并清除自定义样式。
 *
 * @param {string} checkboxId - 勾选框元素ID
 * @param {string} sliderId - 滑块元素ID
 * @param {string} settingContainerId - 滑块容器ID（用于显示/隐藏）
 * @param {string} enabledKey - 启用状态的设置键名
 * @param {string} valueKey - 透明度值的设置键名
 * @param {boolean} enabledInitial - 启用状态初始值
 * @param {number} valueInitial - 透明度初始值
 * @param {Function} applyFn - 应用透明度的函数
 * @param {Function} clearFn - 清除透明度的函数
 */
function bindOpacityWithToggle(checkboxId, sliderId, settingContainerId, enabledKey, valueKey, enabledInitial, valueInitial, applyFn, clearFn) {
    const checkbox = document.getElementById(checkboxId);
    const slider = document.getElementById(sliderId);
    const settingContainer = document.getElementById(settingContainerId);
    const valueDisplay = document.getElementById(`${sliderId}-value`);

    if (!checkbox) {
        logger.warn(`[Beautify] 未找到勾选框 #${checkboxId}`);
        return;
    }

    // 同步勾选框初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = enabledInitial;

    // 同步滑块初始值
    if (slider) {
        /** @type {HTMLInputElement} */ (slider).value = String(valueInitial);
    }
    if (valueDisplay) {
        valueDisplay.textContent = String(valueInitial);
    }

    // 根据启用状态显示/隐藏滑块容器
    if (settingContainer) {
        settingContainer.style.display = enabledInitial ? 'block' : 'none';
    }

    // 如果已启用，立即应用
    if (enabledInitial) {
        applyFn(valueInitial);
    }

    // 勾选框事件
    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        extension_settings[EXT_ID].beautify[enabledKey] = newState;
        saveSettingsDebounced();
        logger.info(`[Beautify] ${enabledKey} 状态变更:`, newState);

        // 显示/隐藏滑块容器
        if (settingContainer) {
            settingContainer.style.display = newState ? 'block' : 'none';
        }

        if (newState) {
            // 启用：应用当前滑块值
            const currentValue = slider ? parseFloat(/** @type {HTMLInputElement} */ (slider).value) : valueInitial;
            applyFn(currentValue);
        } else {
            // 禁用：清除自定义样式
            clearFn();
        }
    });

    // 滑块事件
    if (slider) {
        slider.addEventListener('input', function () {
            const value = parseFloat(/** @type {HTMLInputElement} */ (this).value);
            extension_settings[EXT_ID].beautify[valueKey] = value;
            saveSettingsDebounced();

            if (valueDisplay) {
                valueDisplay.textContent = String(value);
            }

            // 只有启用时才应用
            if (/** @type {HTMLInputElement} */ (checkbox).checked) {
                applyFn(value);
            }
        });
    }
}

/**
 * 应用导航栏图标透明度
 * @param {number} value - 透明度值 (0-1)
 */
function applyNavIconOpacity(value) {
    document.querySelectorAll('.drawer-icon.closedIcon').forEach(el => {
        /** @type {HTMLElement} */ (el).style.setProperty('opacity', String(value), 'important');
    });
    logger.debug('[Beautify] 导航栏图标透明度已应用:', value);
}

/**
 * 清除导航栏图标透明度（恢复默认/主题设置）
 */
function clearNavIconOpacity() {
    document.querySelectorAll('.drawer-icon.closedIcon').forEach(el => {
        /** @type {HTMLElement} */ (el).style.removeProperty('opacity');
    });
    logger.debug('[Beautify] 导航栏图标透明度已清除');
}

/**
 * 应用编辑按钮透明度
 * @param {number} value - 透明度值 (0-1)
 */
function applyEditBtnOpacity(value) {
    document.querySelectorAll('.mes_button.extraMesButtonsHint, .mes_button.mes_edit').forEach(el => {
        /** @type {HTMLElement} */ (el).style.setProperty('opacity', String(value), 'important');
    });
    logger.debug('[Beautify] 编辑按钮透明度已应用:', value);
}

/**
 * 清除编辑按钮透明度（恢复默认/主题设置）
 */
function clearEditBtnOpacity() {
    document.querySelectorAll('.mes_button.extraMesButtonsHint, .mes_button.mes_edit').forEach(el => {
        /** @type {HTMLElement} */ (el).style.removeProperty('opacity');
    });
    logger.debug('[Beautify] 编辑按钮透明度已清除');
}

/**
 * 绑定抽屉页面位置偏移滑块
 * @description 调整导航栏展开页面的上下位置，通过 CSS 变量控制
 */
function bindDrawerOffsetSlider() {
    const slider = document.getElementById('beautify-drawer-offset');
    const valueDisplay = document.getElementById('beautify-drawer-offset-value');
    if (!slider) {
        logger.warn('[Beautify] 未找到抽屉偏移滑块 #beautify-drawer-offset');
        return;
    }

    /** @type {HTMLInputElement} */ (slider).value = String(drawerOffset);
    if (valueDisplay) {
        valueDisplay.textContent = `${drawerOffset}px`;
    }

    slider.addEventListener('input', function () {
        const value = parseInt(/** @type {HTMLInputElement} */ (this).value, 10);
        drawerOffset = value;
        extension_settings[EXT_ID].beautify.drawerOffset = value;
        saveSettingsDebounced();

        if (valueDisplay) {
            valueDisplay.textContent = `${value}px`;
        }

        // 通过 CSS 变量应用偏移
        document.documentElement.style.setProperty('--beautify-drawer-offset', `${value}px`);
        logger.debug('[Beautify] 抽屉页面偏移:', value);
    });

    // 立即应用初始值
    document.documentElement.style.setProperty('--beautify-drawer-offset', `${drawerOffset}px`);
}

/**
 * 绑定聊天字体独立设置（勾选框+滑块）
 * @description 聊天区域使用独立的字体比例，不受官方 font_scale 影响
 */
function bindChatFontIndependent() {
    const checkbox = document.getElementById('beautify-chat-font-independent-enabled');
    const slider = document.getElementById('beautify-chat-font-scale');
    const settingContainer = document.getElementById('beautify-chat-font-scale-setting');
    const valueDisplay = document.getElementById('beautify-chat-font-scale-value');

    if (!checkbox) {
        logger.warn('[Beautify] 未找到聊天字体独立设置勾选框 #beautify-chat-font-independent-enabled');
        return;
    }

    // 同步勾选框初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = chatFontIndependentEnabled;

    // 同步滑块初始值
    if (slider) {
        /** @type {HTMLInputElement} */ (slider).value = String(chatFontScale);
    }
    if (valueDisplay) {
        valueDisplay.textContent = chatFontScale.toFixed(2);
    }

    // 根据启用状态显示/隐藏滑块容器
    if (settingContainer) {
        settingContainer.style.display = chatFontIndependentEnabled ? 'block' : 'none';
    }

    // 如果已启用，立即应用
    if (chatFontIndependentEnabled) {
        document.body.classList.add('beautify-chat-font-independent');
        applyChatFontScale(chatFontScale);
    }

    // 勾选框事件
    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        chatFontIndependentEnabled = newState;
        extension_settings[EXT_ID].beautify.chatFontIndependentEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 聊天字体独立设置状态变更:', newState);

        // 显示/隐藏滑块容器
        if (settingContainer) {
            settingContainer.style.display = newState ? 'block' : 'none';
        }

        if (newState) {
            document.body.classList.add('beautify-chat-font-independent');
            const currentValue = slider ? parseFloat(/** @type {HTMLInputElement} */ (slider).value) : chatFontScale;
            applyChatFontScale(currentValue);
        } else {
            document.body.classList.remove('beautify-chat-font-independent');
            clearChatFontScale();
        }
    });

    // 滑块事件
    if (slider) {
        slider.addEventListener('input', function () {
            const value = parseFloat(/** @type {HTMLInputElement} */ (this).value);
            chatFontScale = value;
            extension_settings[EXT_ID].beautify.chatFontScale = value;
            saveSettingsDebounced();

            if (valueDisplay) {
                valueDisplay.textContent = value.toFixed(2);
            }

            // 只有启用时才应用
            if (/** @type {HTMLInputElement} */ (checkbox).checked) {
                applyChatFontScale(value);
            }
        });
    }
}

/**
 * 应用聊天字体比例
 * @param {number} value - 字体比例值 (0.5-1.5)
 */
function applyChatFontScale(value) {
    document.documentElement.style.setProperty('--beautify-chat-font-scale', String(value));
    logger.debug('[Beautify] 聊天字体比例已应用:', value);
}

/**
 * 清除聊天字体比例（恢复默认）
 */
function clearChatFontScale() {
    document.documentElement.style.setProperty('--beautify-chat-font-scale', '1');
    logger.debug('[Beautify] 聊天字体比例已清除');
}

/**
 * 绑定人设输入框显示头像功能
 * @description 在 persona_description 输入框左边显示当前选中人设的头像
 */
function bindPersonaAvatarPreview() {
    const checkbox = document.getElementById('beautify-persona-avatar-preview-enabled');
    if (!checkbox) {
        logger.warn('[Beautify] 未找到人设头像预览勾选框 #beautify-persona-avatar-preview-enabled');
        return;
    }

    /** @type {HTMLInputElement} */ (checkbox).checked = personaAvatarPreviewEnabled;

    // 如果已启用，立即创建头像预览
    if (personaAvatarPreviewEnabled) {
        createPersonaAvatarPreview();
    }

    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        personaAvatarPreviewEnabled = newState;
        extension_settings[EXT_ID].beautify.personaAvatarPreviewEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 人设头像预览状态变更:', newState);

        if (newState) {
            createPersonaAvatarPreview();
        } else {
            removePersonaAvatarPreview();
        }
    });
}

/**
 * 创建人设头像预览
 * @description 在 persona_description 输入框左边插入头像
 */
function createPersonaAvatarPreview() {
    const textarea = document.getElementById('persona_description');
    if (!textarea) {
        logger.warn('[Beautify] 未找到 #persona_description 输入框');
        return;
    }

    // 如果已存在，先移除
    removePersonaAvatarPreview();

    // 创建包装容器
    const wrapper = document.createElement('div');
    wrapper.id = 'beautify-persona-preview-wrapper';
    wrapper.className = 'beautify-persona-preview-wrapper';

    // 创建头像元素
    const avatar = document.createElement('img');
    avatar.id = 'beautify-persona-preview-avatar';
    avatar.className = 'beautify-persona-preview-avatar';
    avatar.alt = 'Persona Avatar';

    // 获取当前人设头像并设置
    updatePersonaAvatarPreview(avatar);

    wrapper.appendChild(avatar);

    // 在输入框前插入包装容器
    textarea.parentNode.insertBefore(wrapper, textarea);
    // 把输入框移到包装容器内
    wrapper.appendChild(textarea);

    // 监听人设切换事件（SETTINGS_UPDATED 在人设切换时触发）
    // 使用闭包捕获 wrapper 引用，当 wrapper 被移除时自动停止更新
    const updateHandler = () => {
        // 检查 wrapper 是否还存在于 DOM 中
        const currentWrapper = document.getElementById('beautify-persona-preview-wrapper');
        if (!currentWrapper || !personaAvatarPreviewEnabled) {
            return; // wrapper 已被移除或功能已禁用，不再更新
        }
        const avatarEl = document.getElementById('beautify-persona-preview-avatar');
        if (avatarEl) {
            updatePersonaAvatarPreview(/** @type {HTMLImageElement} */ (avatarEl));
        }
    };

    // 注册事件监听（事件会一直存在，但 handler 会检查 wrapper 是否存在）
    eventSource.on(event_types.SETTINGS_UPDATED, updateHandler);

    logger.info('[Beautify] 人设头像预览已创建');
}

/**
 * 更新人设头像预览
 * @param {HTMLImageElement} avatarEl - 头像元素
 */
function updatePersonaAvatarPreview(avatarEl) {
    // 动态导入 personas.js 获取当前人设头像
    // 路径：从 beautify/beautify.js 到 scripts/personas.js 需要上4级
    // 官方用 getThumbnailUrl('persona', user_avatar) 获取缩略图 URL
    import('../../../../personas.js').then(({ user_avatar }) => {
        if (user_avatar) {
            avatarEl.src = getThumbnailUrl('persona', user_avatar);
            avatarEl.style.display = 'block';
        } else {
            // 没有选中人设时显示默认图
            avatarEl.src = 'img/ai4.png';
            avatarEl.style.display = 'block';
        }
        logger.debug('[Beautify] 人设头像已更新:', user_avatar || '默认');
    }).catch(err => {
        logger.error('[Beautify] 导入 personas.js 失败:', err);
    });
}

/**
 * 移除人设头像预览
 * @description 通过设置 _disabled 标记禁用事件处理，然后移除 DOM 元素
 */
function removePersonaAvatarPreview() {
    const wrapper = document.getElementById('beautify-persona-preview-wrapper');
    if (!wrapper) return;

    const textarea = wrapper.querySelector('#persona_description');

    // 标记为已禁用，事件处理器会检查这个标记
    // @ts-ignore
    wrapper._disabled = true;

    // 把输入框移回原位置
    if (textarea && wrapper.parentNode) {
        wrapper.parentNode.insertBefore(textarea, wrapper);
    }

    // 移除包装容器
    wrapper.remove();

    logger.info('[Beautify] 人设头像预览已移除');
}

/**
 * 绑定全宽模式宽度滑块
 * @description 调整全宽模式下文字区域的宽度，0%=最宽，100%=最窄
 */
function bindFullwidthWidthSlider() {
    const slider = document.getElementById('beautify-fullwidth-width');
    const valueDisplay = document.getElementById('beautify-fullwidth-width-value');
    if (!slider) {
        logger.warn('[Beautify] 未找到全宽宽度滑块 #beautify-fullwidth-width');
        return;
    }

    /** @type {HTMLInputElement} */ (slider).value = String(fullwidthWidth);
    if (valueDisplay) {
        valueDisplay.textContent = `${fullwidthWidth}%`;
    }

    slider.addEventListener('input', function () {
        const value = parseInt(/** @type {HTMLInputElement} */ (this).value, 10);
        fullwidthWidth = value;
        extension_settings[EXT_ID].beautify.fullwidthWidth = value;
        saveSettingsDebounced();

        if (valueDisplay) {
            valueDisplay.textContent = `${value}%`;
        }

        // 应用宽度：滑块值转换为 padding 百分比
        // 0% → 0% padding（最宽）
        // 100% → 25% padding（最窄，约50%屏幕宽度）
        applyFullwidthWidth(value);
    });

    // 立即应用初始值
    applyFullwidthWidth(fullwidthWidth);
}

/**
 * 应用全宽模式宽度
 * @param {number} value - 滑块值（0-100）
 */
function applyFullwidthWidth(value) {
    // 将滑块值（0-100）转换为 padding 百分比（0%-25%）
    const paddingPercent = (value / 100) * 25;
    document.documentElement.style.setProperty('--beautify-fullwidth-padding', `${paddingPercent}%`);
    logger.debug('[Beautify] 全宽模式宽度:', value, '% → padding:', paddingPercent, '%');
}

/**
 * 绑定搜索功能
 */
function bindMiscSearch() {
    const searchInput = document.getElementById('beautify-misc-search-input');
    const listContainer = document.getElementById('beautify-misc-list');
    if (!searchInput || !listContainer) return;

    searchInput.addEventListener('input', function () {
        const keyword = /** @type {HTMLInputElement} */ (this).value.toLowerCase().trim();
        const items = listContainer.querySelectorAll('.beautify-setting-item');

        items.forEach(item => {
            if (!keyword) {
                item.classList.remove('hidden');
                return;
            }

            const keywords = (item.getAttribute('data-keywords') || '').toLowerCase();
            const text = item.textContent?.toLowerCase() || '';

            if (keywords.includes(keyword) || text.includes(keyword)) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        });
    });
}

/**
 * 绑定修复旧版美化类名功能
 * @description
 * 将旧版 #logo_block 替换为新版 #backgrounds-drawer-toggle
 * 触发时机：勾选时、切换主题时、页面加载时
 */
function bindFixOldCss() {
    const checkbox = document.getElementById('beautify-fix-old-css-enabled');
    if (!checkbox) {
        logger.warn('[Beautify] 未找到修复旧版美化开关 #beautify-fix-old-css-enabled');
        return;
    }

    // 同步初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = fixOldCssEnabled;

    // 勾选事件
    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        fixOldCssEnabled = newState;
        extension_settings[EXT_ID].beautify.fixOldCssEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 修复旧版美化类名状态变更:', newState);

        if (newState) {
            applyCompatCSS();
        } else {
            removeCompatCSS();
        }
    });

    // 监听主题切换（被动触发）
    const themesSelect = document.getElementById('themes');
    if (themesSelect) {
        themesSelect.addEventListener('change', () => {
            if (fixOldCssEnabled) {
                // 延迟100ms等官方加载完主题
                setTimeout(applyCompatCSS, 100);
            }
        });
    }

    // 如果已启用，页面加载时自动应用
    if (fixOldCssEnabled) {
        applyCompatCSS();
    }
}

/**
 * 应用兼容CSS（正则替换旧类名）
 * @description
 * 读取官方 custom-style 的内容，替换 #logo_block 为 #backgrounds-drawer-toggle
 * 注入到独立的 <style id="beautify-compat-style"> 标签
 */
function applyCompatCSS() {
    // 读取官方的 custom-style
    const customStyle = document.getElementById('custom-style');
    if (!customStyle) {
        logger.warn('[Beautify] 未找到官方 #custom-style 标签');
        return;
    }

    const originalCSS = customStyle.innerHTML || '';
    if (!originalCSS) {
        logger.debug('[Beautify] 官方 CSS 为空，跳过兼容处理');
        removeCompatCSS();
        return;
    }

    // 正则替换：#logo_block → #backgrounds-drawer-toggle
    const compatCSS = originalCSS.replace(/#logo_block/g, '#backgrounds-drawer-toggle');

    // 检查是否有变化（如果没有旧类名，不需要注入）
    if (compatCSS === originalCSS) {
        logger.debug('[Beautify] CSS 中没有 #logo_block，无需兼容处理');
        removeCompatCSS();
        return;
    }

    // 注入兼容样式
    let compatStyleEl = document.getElementById('beautify-compat-style');
    if (!compatStyleEl) {
        compatStyleEl = document.createElement('style');
        compatStyleEl.id = 'beautify-compat-style';
        compatStyleEl.setAttribute('type', 'text/css');
        document.head.appendChild(compatStyleEl);
    }
    compatStyleEl.innerHTML = compatCSS;

    logger.info('[Beautify] 已应用旧版美化兼容CSS');
}

/**
 * 移除兼容CSS
 */
function removeCompatCSS() {
    const compatStyleEl = document.getElementById('beautify-compat-style');
    if (compatStyleEl) {
        compatStyleEl.remove();
        logger.info('[Beautify] 已移除旧版美化兼容CSS');
    }
}

/**
 * 绑定世界书按钮竖排功能
 * @description
 * 勾选时执行一次包裹，取消勾选时执行一次解除
 * 监听世界书图标点击，打开时自动包裹
 */
function bindWiButtonVertical() {
    const checkbox = document.getElementById('beautify-wi-button-vertical-enabled');
    if (!checkbox) {
        logger.warn('[Beautify] 未找到世界书按钮竖排开关 #beautify-wi-button-vertical-enabled');
        return;
    }

    // 同步初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = wiButtonVerticalEnabled;

    // 如果已启用，添加class（CSS会自动生效）
    if (wiButtonVerticalEnabled) {
        document.body.classList.add('beautify-wi-button-vertical');
    }

    // 勾选事件：执行一次包裹/解除
    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        wiButtonVerticalEnabled = newState;
        extension_settings[EXT_ID].beautify.wiButtonVerticalEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 世界书按钮竖排状态变更:', newState);

        if (newState) {
            document.body.classList.add('beautify-wi-button-vertical');
            wrapWiButtons(); // 执行一次包裹
        } else {
            document.body.classList.remove('beautify-wi-button-vertical');
            unwrapWiButtons(); // 执行一次解除
        }
    });

    // 监听世界书图标点击，打开时自动包裹
    const wiDrawerIcon = document.getElementById('WIDrawerIcon');
    if (wiDrawerIcon) {
        wiDrawerIcon.addEventListener('click', () => {
            if (!wiButtonVerticalEnabled) return;
            // 延迟执行，等待世界书DOM加载完成
            setTimeout(wrapWiButtons, 300);
        });
        logger.debug('[Beautify] 已绑定世界书图标点击事件');
    }
}

/**
 * 包裹世界书按钮
 * @description 将三个按钮包进一个容器，方便 CSS 竖排
 */
function wrapWiButtons() {
    const entries = document.querySelectorAll('.world_entry .inline-drawer-header.gap5px');
    entries.forEach(header => {
        // 检查是否已经包裹过
        if (header.querySelector('.beautify-wi-btn-group')) return;

        const moveBtn = header.querySelector('i.move_entry_button');
        const dupBtn = header.querySelector('i.duplicate_entry_button');
        const delBtn = header.querySelector('i.delete_entry_button');

        if (moveBtn && dupBtn && delBtn) {
            // 创建包裹容器
            const wrapper = document.createElement('div');
            wrapper.className = 'beautify-wi-btn-group';

            // 移动按钮到容器中
            wrapper.appendChild(moveBtn);
            wrapper.appendChild(dupBtn);
            wrapper.appendChild(delBtn);

            // 添加到 header 末尾
            header.appendChild(wrapper);
            logger.debug('[Beautify] 已包裹世界书按钮');
        }
    });
}

/**
 * 解除世界书按钮包裹
 * @description 将按钮从容器中移出，恢复原状
 */
function unwrapWiButtons() {
    const wrappers = document.querySelectorAll('.beautify-wi-btn-group');
    wrappers.forEach(wrapper => {
        const parent = wrapper.parentElement;
        if (parent) {
            // 将按钮移回 parent
            while (wrapper.firstChild) {
                parent.appendChild(wrapper.firstChild);
            }
            wrapper.remove();
        }
    });
    logger.debug('[Beautify] 已解除世界书按钮包裹');
}

/**
 * 完整初始化（仅在启用时执行）
 *
 * @async
 */
async function fullInitialize() {
    logger.debug('[Beautify] 开始完整初始化');

    // 创建悬浮头像栏
    createStickyHeader();

    // 确保悬浮栏在 DOM 中
    ensureStickyHeaderInDOM();

    // 初始化弹窗模块（加载设置并应用）
    initBeautifyPopup();

    // 创建消息观察器
    setupMessageObserver();

    // 绑定全局事件
    bindGlobalEvents();

    // 显示悬浮栏
    showStickyHeader();

    logger.debug('[Beautify] 完整初始化完成');
}


// ==========================================
// 启用/禁用
// ==========================================

/**
 * 启用美化功能
 *
 * @description
 * 首次启用时执行完整初始化（创建悬浮栏、绑定事件等）
 * 已初始化时会重新确保悬浮栏在 DOM 中（因为切换角色时 #chat 会被替换）
 * 并重新观察消息、初始化首条消息头像
 *
 * @async
 */
async function enableBeautify() {
    enabled = true;

    // 检查是否需要补充初始化
    if (!stickyHeader) {
        logger.info('[Beautify] 检测到未完整初始化，开始加载');
        await fullInitialize();
    } else {
        // 已初始化，但需要确保悬浮栏在当前 #chat 中
        // 因为切换角色时 #chat 会被替换，悬浮栏可能已不在 DOM 中
        ensureStickyHeaderInDOM();
        showStickyHeader();
        // 重新观察当前聊天的所有消息
        observeAllMessages();
        // 初始化首条消息
        initializeFirstMessage();
    }

    logger.info('[Beautify] 功能已启用');
}

/**
 * 禁用美化功能
 */
function disableBeautify() {
    enabled = false;

    // 隐藏悬浮栏
    hideStickyHeader();

    // 退出沉浸模式
    if (immersiveMode) {
        exitImmersiveMode();
    }

    logger.info('[Beautify] 功能已禁用');
}


// ==========================================
// 悬浮头像栏
// ==========================================

/**
 * 创建悬浮头像栏
 *
 * @description
 * 悬浮栏结构说明：
 * - beautify-deco-1 ~ beautify-deco-10：10个装饰元素，用户可用CSS贴素材
 * - beautify-bg-container：背景图容器
 * - beautify-info-row：头像和消息信息区域
 */
function createStickyHeader() {
    if (stickyHeader) return;

    stickyHeader = document.createElement('div');
    stickyHeader.id = 'beautify-sticky-header';
    stickyHeader.className = 'beautify-sticky-header';
    stickyHeader.innerHTML = `
        <!-- 装饰元素层（用户可用CSS贴素材，共10个） -->
        <div class="beautify-deco beautify-deco-1"></div>
        <div class="beautify-deco beautify-deco-2"></div>
        <div class="beautify-deco beautify-deco-3"></div>
        <div class="beautify-deco beautify-deco-4"></div>
        <div class="beautify-deco beautify-deco-5"></div>
        <div class="beautify-deco beautify-deco-6"></div>
        <div class="beautify-deco beautify-deco-7"></div>
        <div class="beautify-deco beautify-deco-8"></div>
        <div class="beautify-deco beautify-deco-9"></div>
        <div class="beautify-deco beautify-deco-10"></div>

        <!-- 背景图区域（包含所有信息和按钮） -->
        <div class="beautify-bg-container">
            <div class="beautify-bg" id="beautify-bg"></div>

            <!-- 右上角按钮：锁定按钮 -->
            <button class="beautify-lock-btn" id="beautify-lock-btn" title="锁定悬浮栏（停止自动跟随）">
                <i class="fa-solid fa-lock-open"></i>
            </button>

            <!-- 头像信息区域（在背景图底部） -->
            <div class="beautify-info-row">
                <!-- 头像（下半部分露出悬浮栏） -->
                <div class="beautify-avatar-wrapper">
                    <img class="beautify-avatar" id="beautify-avatar" src="" alt="Avatar">
                </div>

                <!-- 消息信息 -->
                <div class="beautify-message-info">
                    <span class="beautify-name" id="beautify-name"></span>
                    <span class="beautify-meta">
                        <span id="beautify-time"></span>
                        <span id="beautify-timer"></span>
                        <span id="beautify-tokens"></span>
                        <span id="beautify-mesid"></span>
                    </span>
                </div>
            </div>
        </div>
    `;

    // 绑定悬浮栏事件
    bindStickyHeaderEvents();

    logger.debug('[Beautify] 悬浮头像栏已创建');
}

/**
 * 确保悬浮栏在 DOM 中
 *
 * @description
 * SillyTavern 在切换聊天时会清空 #chat 内容，所以需要重新插入悬浮栏
 */
function ensureStickyHeaderInDOM() {
    if (!stickyHeader) {
        createStickyHeader();
    }

    const chatElement = document.getElementById('chat');
    if (!chatElement) {
        logger.warn('[Beautify] #chat 不存在，无法插入悬浮栏');
        return false;
    }

    // 检查悬浮栏是否已在 #chat 中
    if (!chatElement.contains(stickyHeader)) {
        chatElement.insertBefore(stickyHeader, chatElement.firstChild);
        logger.debug('[Beautify] 悬浮栏已重新插入 #chat');
    }

    return true;
}

/**
 * 绑定悬浮栏事件
 */
function bindStickyHeaderEvents() {
    if (!stickyHeader) return;

    // 锁定按钮
    const lockBtn = stickyHeader.querySelector('#beautify-lock-btn');
    lockBtn?.addEventListener('click', toggleLock);

    // 点击头像更换临时头像
    const avatar = stickyHeader.querySelector('#beautify-avatar');
    avatar?.addEventListener('click', handleAvatarClick);

    // 点击背景图更换
    const bg = stickyHeader.querySelector('#beautify-bg');
    bg?.addEventListener('click', handleBgClick);
}

/**
 * 显示悬浮头像栏
 * @description 显示悬浮栏并为聊天区域添加顶部间距（beautify-msg-spacing class）
 */
function showStickyHeader() {
    if (!stickyHeader) {
        logger.debug('[Beautify] showStickyHeader: 悬浮栏不存在');
        return;
    }

    // 检测是否在聊天中（有消息才显示）
    const chatElement = document.getElementById('chat');
    const hasMessages = chatElement && chatElement.querySelector('.mes');

    logger.debug('[Beautify] showStickyHeader: chatElement存在=', !!chatElement, ', hasMessages=', !!hasMessages);

    if (!hasMessages) {
        logger.debug('[Beautify] 未检测到聊天消息，不显示悬浮栏');
        stickyHeader.style.display = 'none';
        // 移除消息间距class
        document.getElementById('chat')?.classList.remove('beautify-msg-spacing');
        return;
    }

    stickyHeader.style.display = 'flex';
    // 添加消息间距class
    document.getElementById('chat')?.classList.add('beautify-msg-spacing');
    logger.debug('[Beautify] 悬浮栏已显示 (display: flex)');
}

/**
 * 隐藏悬浮头像栏
 * @description 隐藏悬浮栏并移除聊天区域的顶部间距（beautify-msg-spacing class）
 */
function hideStickyHeader() {
    if (stickyHeader) {
        stickyHeader.style.display = 'none';
    }
    // 移除消息间距class
    document.getElementById('chat')?.classList.remove('beautify-msg-spacing');
}


// ==========================================
// 消息观察器（Intersection Observer）
// ==========================================

/**
 * 设置消息观察器
 *
 * @description
 * 使用 IntersectionObserver 监视聊天消息，当消息滚动到悬浮栏区域时实时更新悬浮栏内容。
 * 采用"检测线穿过"算法：悬浮栏底部作为检测线，穿过哪条消息就显示哪条。
 *
 * 工作原理：
 * 1. 监视整个视口（root: null），用 11 个阈值提高触发频率
 * 2. 每次触发时遍历所有消息（因为 entries 只含状态变化的消息，不可靠）
 * 3. 检测线位置 = 悬浮栏底部（无偏移，精确对齐）
 * 4. 判断条件：消息顶部 <= 检测线 <= 消息底部（检测线穿过消息）
 * 5. user 消息特殊处理：检测区域向上扩展 80px（解决 user 气泡太短检测不到的问题）
 * 6. 兜底逻辑：如果没有消息被穿过，选择"最接近检测线"的消息（用于短消息场景）
 * 7. 用该消息的头像和信息更新悬浮栏
 *
 * 为什么用"检测线穿过"：逻辑最简单直观，检测线在哪条消息里就显示哪条。
 * 为什么 user 消息要扩展检测区域：user 气泡通常很短，检测线可能无法"穿过"它，扩展后更容易被检测到。
 * 为什么需要兜底：短消息可能完全在检测线上方或下方，不会被"穿过"，需要备选方案。
 * 为什么遍历所有消息：Observer 的 entries 只包含状态变化的消息，不是全部，会漏掉。
 */
function setupMessageObserver() {
    const chatElement = document.getElementById('chat');
    if (!chatElement) {
        logger.warn('[Beautify] 未找到 #chat 元素');
        return;
    }

    // 创建观察器（实时更新）
    // 注意：Observer 的 entries 只包含状态变化的消息，不是所有消息
    // 所以我们在每次触发时遍历所有消息，找到检测线穿过的那条
    messageObserver = new IntersectionObserver(() => {
        // 如果功能未启用或锁定了，不更新
        if (!enabled || isLocked) return;

        // 动态获取悬浮栏实际高度作为检测线
        // 不加偏移，检测线就在悬浮栏底部
        const stickyHeaderBottom = stickyHeader ? stickyHeader.offsetHeight : 160;

        // 遍历所有消息，找到检测线穿过的那条
        const allMessages = document.querySelectorAll('#chat .mes');
        let targetMessage = null;
        let closestMessage = null;
        let closestDistance = Infinity;

        allMessages.forEach(mes => {
            const rect = mes.getBoundingClientRect();
            const messageTop = rect.top;
            const messageBottom = rect.bottom;
            const mesId = mes.getAttribute('mesid');
            const isUser = mes.getAttribute('is_user') === 'true';

            // user 消息的检测区域向上扩展，解决 user 气泡太短检测不到的问题
            // 原理：user 气泡通常很短，检测线可能无法"穿过"它
            // 扩展后，user 消息的"虚拟顶部"会覆盖到上方 char 消息的位置
            const userDetectionExtend = 80;  // user 消息向上扩展的检测距离
            const effectiveTop = isUser ? (messageTop - userDetectionExtend) : messageTop;

            // 调试：打印每条消息的位置（只打印在视口内的消息，减少日志量）
            if (messageBottom > 0 && messageTop < window.innerHeight) {
                logger.debug(`[Beautify] 消息#${mesId}: top=${Math.round(messageTop)}${isUser ? `(扩展后=${Math.round(effectiveTop)})` : ''}, bottom=${Math.round(messageBottom)}, 检测线=${Math.round(stickyHeaderBottom)}`);
            }

            // 检测线穿过这条消息：消息顶部 <= 检测线 <= 消息底部
            // user 消息使用扩展后的顶部位置
            if (effectiveTop <= stickyHeaderBottom && messageBottom >= stickyHeaderBottom) {
                logger.debug(`[Beautify] → 检测线穿过消息#${mesId}${isUser ? '(user扩展检测)' : ''}`);
                targetMessage = mes;
            }

            // 同时记录"最接近检测线"的消息（用于短消息兜底）
            // 只考虑消息底部在检测线下方的（即消息还没完全滚过去）
            if (messageBottom >= stickyHeaderBottom) {
                const distance = Math.abs(effectiveTop - stickyHeaderBottom);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestMessage = mes;
                }
            }
        });

        // 更新悬浮栏
        // 优先使用"检测线穿过"的消息，如果没有则使用"最接近检测线"的消息
        const finalMessage = targetMessage || closestMessage;
        if (finalMessage) {
            const mesId = finalMessage.getAttribute('mesid');
            const isUser = finalMessage.getAttribute('is_user') === 'true';
            logger.debug(`[Beautify] 最终选择消息#${mesId} (isUser=${isUser}, 方式=${targetMessage ? '穿过' : '最近'})`);
            updateStickyHeaderFromMessage(finalMessage);
        } else {
            logger.debug('[Beautify] 没有找到合适的消息');
        }
    }, {
        root: null,  // 监视整个视口
        rootMargin: '0px 0px 0px 0px',  // 恢复全屏检测，灵敏度最高
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]  // 11个阈值，触发频繁
    });

    // 观察所有现有消息
    observeAllMessages();

    // 初始化时获取首条可见消息的信息
    initializeFirstMessage();

    logger.debug('[Beautify] 消息观察器已设置');
}

/**
 * 观察所有消息
 */
function observeAllMessages() {
    if (!messageObserver) {
        logger.warn('[Beautify] observeAllMessages: messageObserver 不存在');
        return;
    }

    const messages = document.querySelectorAll('#chat .mes');
    logger.debug('[Beautify] observeAllMessages: 找到', messages.length, '条消息');

    messages.forEach(mes => {
        const mesId = mes.getAttribute('mesid');
        logger.debug('[Beautify] 开始观察消息:', mesId);
        messageObserver.observe(mes);
    });
}

/**
 * 初始化首条可见消息的信息
 *
 * @description
 * 在初始化时获取第一条消息的头像等信息，避免头像裂图
 * 使用延迟确保消息和头像已完全渲染
 */
function initializeFirstMessage() {
    // 延迟 100ms 确保消息和头像已渲染
    setTimeout(() => {
        const firstMessage = document.querySelector('#chat .mes');
        if (firstMessage) {
            updateStickyHeaderFromMessage(firstMessage);
            logger.debug('[Beautify] 初始化首条消息头像');
        }
    }, 100);
}

/**
 * 根据消息更新悬浮头像栏
 *
 * @description
 * 从 chat 数组读取 token 数和时间，不依赖 DOM 元素的可见性。
 * 这样即使用户关闭了官方的 token 计数/计时器开关，悬浮栏仍能正常显示。
 *
 * @param {Element} mesElement - 消息元素
 */
function updateStickyHeaderFromMessage(mesElement) {
    if (!stickyHeader || !mesElement) return;

    const isUser = mesElement.getAttribute('is_user') === 'true';
    const mesId = mesElement.getAttribute('mesid');
    const charName = mesElement.getAttribute('ch_name');

    // 更新头像栏类名（控制头像位置：左/右）
    stickyHeader.classList.toggle('is-user', isUser);
    stickyHeader.classList.toggle('is-char', !isUser);
    // 添加 is_user 属性，方便用户用 CSS 选择器分离定义样式
    stickyHeader.setAttribute('is_user', isUser ? 'true' : 'false');

    // 更新头像（带淡入淡出动画，仿现代社交软件风格）
    const avatarImg = mesElement.querySelector('.avatar img');
    const beautifyAvatar = stickyHeader.querySelector('#beautify-avatar');
    if (avatarImg && beautifyAvatar) {
        const newSrc = avatarImg.src;
        // 只有头像真正变化时才播放动画，避免同一头像重复动画
        if (beautifyAvatar.src !== newSrc) {
            // 添加切换动画类（淡出到透明）
            beautifyAvatar.classList.add('switching');
            // 400ms 后切换图片并淡入（配合 CSS 过渡时间）
            setTimeout(() => {
                beautifyAvatar.src = newSrc;
                beautifyAvatar.classList.remove('switching');
            }, 400);
        }
    }

    // 更新名字
    const nameEl = stickyHeader.querySelector('#beautify-name');
    if (nameEl) {
        nameEl.textContent = charName || '';
    }

    // 更新楼层号
    const mesIdEl = stickyHeader.querySelector('#beautify-mesid');
    if (mesIdEl) {
        mesIdEl.textContent = `#${mesId}`;
    }

    // 从 chat 数组读取数据（不依赖 DOM 元素的可见性）
    const mesIdNum = parseInt(mesId, 10);
    const message = chat[mesIdNum];

    // 更新时间（优先从 chat 数组读取，兜底从 DOM 读取）
    const timeEl = stickyHeader.querySelector('#beautify-time');
    if (timeEl) {
        if (message?.send_date) {
            // 格式化时间：从 send_date 提取时间部分（中文格式）
            timeEl.textContent = formatMessageTime(message.send_date);
        } else {
            // 兜底：从 DOM 读取
            const timestamp = mesElement.querySelector('.timestamp');
            timeEl.textContent = timestamp?.textContent || '';
        }
    }

    // 更新生成耗时（从 chat 数组读取 gen_finished - gen_started）
    const timerEl = stickyHeader.querySelector('#beautify-timer');
    if (timerEl) {
        const genTime = message?.extra?.gen_finished && message?.extra?.gen_started
            ? ((message.extra.gen_finished - message.extra.gen_started) / 1000).toFixed(1)
            : null;
        if (genTime) {
            timerEl.textContent = `${genTime}s`;
        } else {
            // 兜底：从 DOM 读取
            const mesTimer = mesElement.querySelector('.mes_timer');
            timerEl.textContent = mesTimer?.textContent || '';
        }
    }

    // 更新 token 数（优先从 chat 数组读取，没有则自己计算）
    const tokensEl = stickyHeader.querySelector('#beautify-tokens');
    if (tokensEl) {
        const tokenCount = message?.extra?.token_count;
        if (tokenCount) {
            tokensEl.textContent = `${tokenCount}t`;
        } else if (message?.mes) {
            // 如果没有 token_count，自己计算（异步）
            const tokenCountText = (message?.extra?.reasoning || '') + message.mes;
            getTokenCountAsync(tokenCountText, 0).then(count => {
                if (count > 0) {
                    tokensEl.textContent = `${count}t`;
                }
            }).catch(() => {
                // 计算失败时静默处理
            });
        } else {
            // 兜底：从 DOM 读取
            const tokenCounter = mesElement.querySelector('.tokenCounterDisplay');
            tokensEl.textContent = tokenCounter?.textContent || '';
        }
    }

    // 更新背景图
    updateBackground(isUser);

    // 记录当前消息 ID，用于事件委托
    stickyHeader.dataset.currentMesId = mesId;

    logger.debug('[Beautify] 悬浮栏已更新，mesId:', mesId, 'isUser:', isUser);
}

/**
 * 格式化消息时间（使用官方moment库，自动跟随系统语言）
 * @param {string} sendDate - 消息的 send_date 字符串
 * @returns {string} 格式化后的时间字符串，如 "2025年12月20日 04:29"
 */
function formatMessageTime(sendDate) {
    if (!sendDate) return '';

    try {
        // 使用官方的 timestampToMoment 函数，自动处理语言和格式
        const momentDate = timestampToMoment(sendDate);
        if (!momentDate.isValid()) {
            return sendDate;
        }
        // 使用和官方一样的格式：'LL LT' = "2025年12月20日 04:29"
        return momentDate.format('LL LT');
    } catch {
        return sendDate;
    }
}


// ==========================================
// 沉浸模式
// ==========================================

/**
 * 切换锁定状态
 */
function toggleLock() {
    isLocked = !isLocked;

    // 更新按钮图标
    const lockBtn = stickyHeader?.querySelector('#beautify-lock-btn i');
    if (lockBtn) {
        lockBtn.className = isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
    }

    // 更新按钮标题
    const lockBtnEl = stickyHeader?.querySelector('#beautify-lock-btn');
    if (lockBtnEl) {
        lockBtnEl.title = isLocked ? '解锁悬浮栏（恢复自动跟随）' : '锁定悬浮栏（停止自动跟随）';
    }

    // 更新悬浮栏样式（锁定时添加视觉提示）
    if (stickyHeader) {
        stickyHeader.classList.toggle('is-locked', isLocked);
    }

    logger.info('[Beautify] 悬浮栏锁定状态:', isLocked);
}

/**
 * 切换沉浸模式
 */
function toggleImmersiveMode() {
    if (immersiveMode) {
        exitImmersiveMode();
    } else {
        enterImmersiveMode();
    }
}

/**
 * 进入沉浸模式
 */
function enterImmersiveMode() {
    // 同时隐藏 #top-bar 和 #top-settings-holder
    const topBar = document.getElementById('top-bar');
    const topSettingsHolder = document.getElementById('top-settings-holder');

    if (topBar) {
        topBar.classList.add('beautify-hidden');
    }
    if (topSettingsHolder) {
        topSettingsHolder.classList.add('beautify-hidden');
    }

    immersiveMode = true;

    // 更新按钮图标
    const btn = stickyHeader?.querySelector('#beautify-immersive-btn i');
    if (btn) {
        btn.className = 'fa-solid fa-bars'; // 切换为菜单图标
    }

    logger.info('[Beautify] 进入沉浸模式');
}

/**
 * 退出沉浸模式
 */
function exitImmersiveMode() {
    // 同时显示 #top-bar 和 #top-settings-holder
    const topBar = document.getElementById('top-bar');
    const topSettingsHolder = document.getElementById('top-settings-holder');

    if (topBar) {
        topBar.classList.remove('beautify-hidden');
    }
    if (topSettingsHolder) {
        topSettingsHolder.classList.remove('beautify-hidden');
    }

    immersiveMode = false;

    // 更新按钮图标
    const btn = stickyHeader?.querySelector('#beautify-immersive-btn i');
    if (btn) {
        btn.className = 'fa-solid fa-circle'; // 切换为圆点图标
    }

    logger.info('[Beautify] 退出沉浸模式');
}


// ==========================================
// 事件处理（委托到原消息）
// ==========================================

/** @type {Element|null} 当前消息元素（缓存） */
let currentMesElement = null;

/**
 * 获取当前消息元素
 * @returns {Element|null}
 */
function getCurrentMesElement() {
    const mesId = stickyHeader?.dataset.currentMesId;
    if (!mesId) return null;
    return document.querySelector(`#chat .mes[mesid="${mesId}"]`);
}

/**
 * 处理头像点击（打开设置弹窗）
 */
function handleAvatarClick() {
    openBeautifyPopup();
}

/**
 * 处理背景图点击
 * @description 预留函数，目前不做任何操作
 */
function handleBgClick() {
    // 预留：以后可能实现背景图快速切换
}


// ==========================================
// 辅助函数
// ==========================================

/**
 * 更新背景图
 * @param {boolean} isUser - 是否是用户消息
 */
function updateBackground(isUser) {
    // 背景图由 beautify-popup.js 的 applyBackgroundSettings 控制
    // 这里不再重置背景，避免覆盖用户设置
    // 如果以后需要根据 isUser 切换不同背景，可以在这里实现
}




// ==========================================
// 全局事件绑定
// ==========================================

/**
 * 绑定全局事件
 */
function bindGlobalEvents() {
    // 切换聊天时：退出沉浸模式 + 解锁 + 重新插入悬浮栏
    eventSource.on(event_types.CHAT_CHANGED, () => {
        // 如果功能未启用，不执行任何操作
        if (!enabled) return;

        if (immersiveMode) {
            exitImmersiveMode();
        }
        // 解锁悬浮栏
        if (isLocked) {
            isLocked = false;
            const lockBtn = stickyHeader?.querySelector('#beautify-lock-btn i');
            if (lockBtn) {
                lockBtn.className = 'fa-solid fa-lock-open';
            }
            stickyHeader?.classList.remove('is-locked');
        }
        // 延迟后重新检测聊天并刷新头像
        setTimeout(() => {
            // 再次检查，防止在延迟期间被禁用
            if (!enabled) return;
            // 确保悬浮栏在 DOM 中（SillyTavern 可能清空了 #chat）
            ensureStickyHeaderInDOM();
            showStickyHeader();
            observeAllMessages();
            initializeFirstMessage();
        }, 200);
    });

    // 监听新消息渲染（用户和角色消息都要监听）
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        // 如果功能未启用，不执行
        if (!enabled) return;
        logger.debug('[Beautify] 检测到角色消息渲染，重新观察消息');
        observeAllMessages();
    });
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
        // 如果功能未启用，不执行
        if (!enabled) return;
        logger.debug('[Beautify] 检测到用户消息渲染，重新观察消息');
        observeAllMessages();
    });

    // ESC 键退出沉浸模式
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && immersiveMode) {
            exitImmersiveMode();
        }
    });

    // 滚动到顶部时退出沉浸模式
    const chatElement = document.getElementById('chat');
    if (chatElement) {
        chatElement.addEventListener('scroll', () => {
            if (immersiveMode && chatElement.scrollTop < 50) {
                exitImmersiveMode();
            }
        });
    }

    logger.debug('[Beautify] 全局事件已绑定');
}


// ==========================================
// 悬浮按钮（顶栏隐藏按钮）
// ==========================================

/**
 * 启用悬浮按钮
 */
function enableFloatingBtn() {
    floatingBtnEnabled = true;

    // 创建悬浮按钮（如果不存在）
    if (!floatingBtn) {
        createFloatingBtn();
    }

    // 初始化等待动画监听器（只初始化一次）
    if (!waitingAnimState.listenersInitialized) {
        initWaitingAnimationListeners();
        waitingAnimState.listenersInitialized = true;
    }

    // 显示悬浮按钮
    if (floatingBtn) {
        floatingBtn.style.display = 'flex';
        logger.info('[Beautify] 悬浮按钮已启用');
    }
}

/**
 * 禁用悬浮按钮
 */
function disableFloatingBtn() {
    floatingBtnEnabled = false;

    // 隐藏悬浮按钮
    if (floatingBtn) {
        floatingBtn.style.display = 'none';
        logger.info('[Beautify] 悬浮按钮已禁用');
    }

    // 如果沉浸模式开启，退出
    if (immersiveMode) {
        exitImmersiveMode();
    }
}


// ==========================================
// 全宽文字模式
// ==========================================

/**
 * 启用全宽文字模式
 *
 * @description
 * 隐藏消息的头像、名字栏、计数等元素，让文字左右占满。
 * 通过给 body 添加 class 来控制样式，宽度通过 CSS 变量控制。
 */
function enableFullwidthMode() {
    fullwidthEnabled = true;
    document.body.classList.add('beautify-fullwidth-mode');
    // 应用宽度设置
    applyFullwidthWidth(fullwidthWidth);
    // 应用子选项
    if (fullwidthHideAvatarEnabled) {
        document.body.classList.add('beautify-fullwidth-hide-avatar');
    }
    if (fullwidthHideNameEnabled) {
        document.body.classList.add('beautify-fullwidth-hide-name');
    }
    if (fullwidthShowGhostEnabled) {
        document.body.classList.add('beautify-fullwidth-show-ghost');
    }
    logger.info('[Beautify] 全宽文字模式已启用，宽度:', fullwidthWidth, '%');
}

/**
 * 禁用全宽文字模式
 * @description 移除全宽模式类名，同时清理子选项（隐藏头像、隐藏名字栏、显示小幽灵）的类名
 */
function disableFullwidthMode() {
    fullwidthEnabled = false;
    document.body.classList.remove('beautify-fullwidth-mode');
    // 同时移除子选项的类名
    document.body.classList.remove('beautify-fullwidth-hide-avatar');
    document.body.classList.remove('beautify-fullwidth-hide-name');
    document.body.classList.remove('beautify-fullwidth-show-ghost');
    logger.info('[Beautify] 全宽文字模式已禁用');
}

/**
 * 绑定全宽模式子选项（隐藏头像、隐藏名字栏、显示不可见消息提示）
 *
 * @description
 * 为子选项勾选框绑定事件：
 * 1. 初始化时根据保存的设置恢复勾选状态
 * 2. 如果全宽模式已启用且子选项也启用，立即应用对应CSS类名
 * 3. 勾选变更时，只有在全宽模式启用的情况下才会应用/移除CSS类名
 * 4. "显示不可见消息提示"只有在勾选了"隐藏名字栏"时才显示
 */
function bindFullwidthSubOptions() {
    const showGhostSetting = document.getElementById('beautify-fullwidth-show-ghost-setting');

    // 隐藏头像子选项
    const hideAvatarCheckbox = document.getElementById('beautify-fullwidth-hide-avatar-enabled');
    if (hideAvatarCheckbox) {
        /** @type {HTMLInputElement} */ (hideAvatarCheckbox).checked = fullwidthHideAvatarEnabled;

        // 如果全宽模式和子选项都启用，立即应用
        if (fullwidthEnabled && fullwidthHideAvatarEnabled) {
            document.body.classList.add('beautify-fullwidth-hide-avatar');
        }

        hideAvatarCheckbox.addEventListener('change', function () {
            const newState = /** @type {HTMLInputElement} */ (this).checked;
            fullwidthHideAvatarEnabled = newState;
            extension_settings[EXT_ID].beautify.fullwidthHideAvatarEnabled = newState;
            saveSettingsDebounced();
            logger.info('[Beautify] 全宽模式隐藏头像状态变更:', newState);

            // 只有全宽模式启用时才应用
            if (fullwidthEnabled) {
                if (newState) {
                    document.body.classList.add('beautify-fullwidth-hide-avatar');
                } else {
                    document.body.classList.remove('beautify-fullwidth-hide-avatar');
                }
            }
        });
    }

    // 隐藏名字栏子选项
    const hideNameCheckbox = document.getElementById('beautify-fullwidth-hide-name-enabled');
    if (hideNameCheckbox) {
        /** @type {HTMLInputElement} */ (hideNameCheckbox).checked = fullwidthHideNameEnabled;

        // 根据隐藏名字栏状态显示/隐藏"显示不可见消息提示"选项
        if (showGhostSetting) {
            showGhostSetting.style.display = fullwidthHideNameEnabled ? 'block' : 'none';
        }

        // 如果全宽模式和子选项都启用，立即应用
        if (fullwidthEnabled && fullwidthHideNameEnabled) {
            document.body.classList.add('beautify-fullwidth-hide-name');
        }

        hideNameCheckbox.addEventListener('change', function () {
            const newState = /** @type {HTMLInputElement} */ (this).checked;
            fullwidthHideNameEnabled = newState;
            extension_settings[EXT_ID].beautify.fullwidthHideNameEnabled = newState;
            saveSettingsDebounced();
            logger.info('[Beautify] 全宽模式隐藏名字栏状态变更:', newState);

            // 显示/隐藏"显示不可见消息提示"选项
            if (showGhostSetting) {
                showGhostSetting.style.display = newState ? 'block' : 'none';
            }

            // 只有全宽模式启用时才应用
            if (fullwidthEnabled) {
                if (newState) {
                    document.body.classList.add('beautify-fullwidth-hide-name');
                } else {
                    document.body.classList.remove('beautify-fullwidth-hide-name');
                    // 取消隐藏名字栏时，也移除小幽灵显示（因为名字栏本身就会显示小幽灵）
                    document.body.classList.remove('beautify-fullwidth-show-ghost');
                }
            }
        });
    }

    // 显示不可见消息提示子选项（隐藏名字栏的子选项）
    const showGhostCheckbox = document.getElementById('beautify-fullwidth-show-ghost-enabled');
    if (showGhostCheckbox) {
        /** @type {HTMLInputElement} */ (showGhostCheckbox).checked = fullwidthShowGhostEnabled;

        // 如果全宽模式、隐藏名字栏、显示小幽灵都启用，立即应用
        if (fullwidthEnabled && fullwidthHideNameEnabled && fullwidthShowGhostEnabled) {
            document.body.classList.add('beautify-fullwidth-show-ghost');
        }

        showGhostCheckbox.addEventListener('change', function () {
            const newState = /** @type {HTMLInputElement} */ (this).checked;
            fullwidthShowGhostEnabled = newState;
            extension_settings[EXT_ID].beautify.fullwidthShowGhostEnabled = newState;
            saveSettingsDebounced();
            logger.info('[Beautify] 全宽模式显示不可见消息提示状态变更:', newState);

            // 只有全宽模式和隐藏名字栏都启用时才应用
            if (fullwidthEnabled && fullwidthHideNameEnabled) {
                if (newState) {
                    document.body.classList.add('beautify-fullwidth-show-ghost');
                } else {
                    document.body.classList.remove('beautify-fullwidth-show-ghost');
                }
            }
        });
    }
}


// ==========================================
// 隐藏滚动条
// ==========================================

/**
 * 启用隐藏滚动条
 * @description 通过给 body 添加 class 来隐藏所有滚动条，适合手机端使用
 */
function enableHideScrollbar() {
    hideScrollbarEnabled = true;
    document.body.classList.add('beautify-hide-scrollbar');
    logger.info('[Beautify] 隐藏滚动条已启用');
}

/**
 * 禁用隐藏滚动条
 */
function disableHideScrollbar() {
    hideScrollbarEnabled = false;
    document.body.classList.remove('beautify-hide-scrollbar');
    logger.info('[Beautify] 隐藏滚动条已禁用');
}




/**
 * 创建悬浮按钮
 */
function createFloatingBtn() {
    floatingBtn = document.createElement('div');
    floatingBtn.id = 'beautify-floating-btn';
    floatingBtn.className = 'beautify-floating-btn';
    floatingBtn.innerHTML = `
        <i class="fa-solid fa-circle"></i>
    `;
    floatingBtn.title = '隐藏/显示顶部工具栏';

    // 设置初始位置（如果没有保存的位置，使用默认值）
    const savedPosition = extension_settings[EXT_ID].beautify.floatingBtnPosition || {
        x: window.innerWidth - 70,
        y: 100
    };
    floatingBtn.style.left = `${savedPosition.x}px`;
    floatingBtn.style.top = `${savedPosition.y}px`;

    // 绑定事件
    bindFloatingBtnEvents();

    // 监听窗口缩放，确保按钮不超出可见区域
    window.addEventListener('resize', () => constrainFloatingBtnPosition());

    // 添加到 body
    document.body.appendChild(floatingBtn);

    // 应用自定义设置（大小、颜色、透明度、图片）
    applyFloatingBtnSettings();

    logger.debug('[Beautify] 悬浮按钮已创建');
}

/**
 * 限制悬浮按钮位置在窗口内
 */
function constrainFloatingBtnPosition() {
    if (!floatingBtn || floatingBtn.style.display === 'none') return;

    const maxX = window.innerWidth - floatingBtn.offsetWidth;
    const maxY = window.innerHeight - floatingBtn.offsetHeight;

    let currentX = floatingBtn.offsetLeft;
    let currentY = floatingBtn.offsetTop;

    // 限制在窗口内
    currentX = Math.max(0, Math.min(currentX, maxX));
    currentY = Math.max(0, Math.min(currentY, maxY));

    // 更新位置
    floatingBtn.style.left = `${currentX}px`;
    floatingBtn.style.top = `${currentY}px`;

    // 保存位置
    extension_settings[EXT_ID].beautify.floatingBtnPosition = {
        x: currentX,
        y: currentY
    };
}

/**
 * 复位悬浮按钮位置到屏幕右上角
 * @description 当按钮跑到屏幕外时，用户可以点击复位按钮将其移回可见区域
 * @returns {void}
 */
export function resetFloatingBtnPosition() {
    if (!floatingBtn) {
        logger.warn('[Beautify] 悬浮按钮不存在，无法复位');
        return;
    }

    // 默认位置：屏幕右上角，距离边缘 20px
    const defaultX = window.innerWidth - 70;
    const defaultY = 100;

    // 更新位置
    floatingBtn.style.left = `${defaultX}px`;
    floatingBtn.style.top = `${defaultY}px`;
    floatingBtn.style.transform = '';  // 清除可能存在的 transform

    // 保存位置
    extension_settings[EXT_ID].beautify.floatingBtnPosition = {
        x: defaultX,
        y: defaultY
    };
    saveSettingsDebounced();

    logger.info('[Beautify] 悬浮按钮位置已复位:', defaultX, defaultY);
    toastr.success('悬浮按钮已复位到屏幕右上角');
}

/**
 * 绑定悬浮按钮事件（使用 transform 优化性能）
 *
 * @description
 * 实现悬浮按钮的拖动、点击和长按功能：
 * - 拖动时使用 transform 而不是 left/top（避免触发重排，性能更好）
 * - 使用 requestAnimationFrame 优化渲染
 * - 拖动结束后将 transform 转换为 left/top 保存位置
 * - 通过 hasMoved 标志区分点击和拖动（移动超过 5px 才算拖动）
 * - 长按 350ms 显示快照菜单
 * - 支持 pointercancel 事件（处理意外中断）
 */
function bindFloatingBtnEvents() {
    if (!floatingBtn) return;

    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let animationFrameId = null;

    // 长按相关
    let longPressTimer = null;
    let isLongPress = false;
    const LONG_PRESS_DURATION = 350; // 长按时间 350ms

    // 点击切换沉浸模式（只在非长按、非拖动时触发）
    floatingBtn.addEventListener('click', (e) => {
        // 如果刚拖动过或长按过，不触发点击
        if (hasMoved || isLongPress) {
            hasMoved = false;
            isLongPress = false;
            return;
        }
        toggleImmersiveMode();
    });

    // 拖动开始
    floatingBtn.addEventListener('pointerdown', (e) => {
        // 只响应主按钮（鼠标左键/触摸）
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        hasMoved = false;
        isLongPress = false;
        startX = e.clientX;
        startY = e.clientY;

        // 获取当前位置
        const rect = floatingBtn.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        currentX = initialX;
        currentY = initialY;

        floatingBtn.setPointerCapture(e.pointerId);
        floatingBtn.classList.add('dragging');

        // 开始长按计时
        longPressTimer = setTimeout(() => {
            // 只有在没有移动的情况下才触发长按
            if (!hasMoved) {
                isLongPress = true;
                floatingBtn.classList.remove('dragging');
                floatingBtn.classList.add('long-pressing');
                showSnapshotMenu(e.clientX, e.clientY);
            }
        }, LONG_PRESS_DURATION);

        // 添加长按视觉反馈
        floatingBtn.classList.add('pressing');
    });

    // 拖动中（使用 transform 而不是 left/top）
    floatingBtn.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        e.preventDefault();

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // 移动超过 5px 才算拖动，同时取消长按计时
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            hasMoved = true;
            // 取消长按计时
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            floatingBtn.classList.remove('pressing');
        }

        if (hasMoved && !isLongPress) {
            // 取消之前的动画帧
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }

            // 使用 requestAnimationFrame 优化性能
            animationFrameId = requestAnimationFrame(() => {
                if (!floatingBtn) return;

                currentX = initialX + deltaX;
                currentY = initialY + deltaY;

                // 限制在窗口内
                const maxX = window.innerWidth - floatingBtn.offsetWidth;
                const maxY = window.innerHeight - floatingBtn.offsetHeight;

                currentX = Math.max(0, Math.min(currentX, maxX));
                currentY = Math.max(0, Math.min(currentY, maxY));

                // 使用 transform 而不是 left/top（性能更好）
                floatingBtn.style.transform = `translate(${currentX - initialX}px, ${currentY - initialY}px)`;

                animationFrameId = null;
            });
        }
    });

    // 拖动结束
    floatingBtn.addEventListener('pointerup', (e) => {
        if (!isDragging) return;

        e.preventDefault();
        isDragging = false;

        // 取消长按计时
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        floatingBtn.classList.remove('pressing');
        floatingBtn.classList.remove('long-pressing');

        // 取消未完成的动画帧
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        if (floatingBtn.hasPointerCapture(e.pointerId)) {
            floatingBtn.releasePointerCapture(e.pointerId);
        }

        floatingBtn.classList.remove('dragging');

        // 保存位置（将 transform 转换为 left/top）
        if (hasMoved && !isLongPress) {
            floatingBtn.style.left = `${currentX}px`;
            floatingBtn.style.top = `${currentY}px`;
            floatingBtn.style.transform = '';  // 清除 transform

            extension_settings[EXT_ID].beautify.floatingBtnPosition = {
                x: currentX,
                y: currentY
            };
            saveSettingsDebounced();
            logger.debug('[Beautify] 悬浮按钮位置已保存:', currentX, currentY);
        }

        // 延迟重置标志，避免触发点击
        setTimeout(() => {
            hasMoved = false;
            isLongPress = false;
        }, 100);
    });

    // 取消拖动（处理意外中断）
    floatingBtn.addEventListener('pointercancel', (e) => {
        if (!isDragging) return;

        isDragging = false;
        hasMoved = false;
        isLongPress = false;

        // 取消长按计时
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        floatingBtn.classList.remove('pressing');
        floatingBtn.classList.remove('long-pressing');

        // 取消未完成的动画帧
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        floatingBtn.classList.remove('dragging');

        // 恢复到拖动前的位置
        floatingBtn.style.transform = '';

        logger.debug('[Beautify] 拖动被取消');
    });
}

// ==========================================
// 快照长按菜单
// ==========================================

/** @type {HTMLElement|null} 快照菜单元素 */
let snapshotMenu = null;

/** @type {Object<string, boolean>} 世界书分组展开状态 */
let worldInfoGroupExpanded = {};

/**
 * 获取世界书条目的显示名称
 * @description 优先使用别名，否则从原始名称中提取条目名（去掉世界书名前缀）
 * @param {Object} item - 世界书条目
 * @returns {string} 显示名称
 */
function getWorldInfoDisplayName(item) {
    // 优先使用别名
    if (item.displayAlias) {
        return item.displayAlias;
    }
    // 从原始名称中提取条目名（格式：世界书名: 条目名）
    const colonIndex = item.name.indexOf(': ');
    if (colonIndex !== -1) {
        return item.name.substring(colonIndex + 2);
    }
    return item.name;
}

/**
 * 显示快照菜单（包含总开关、快速开关和快照三个区域）
 * @description 世界书条目按世界书分组显示，支持折叠展开
 * @param {number} x - 点击位置 X
 * @param {number} y - 点击位置 Y
 */
async function showSnapshotMenu(x, y) {
    // 动态导入数据模块
    const snapshotData = await import('../preset-snapshot-data.js');
    const quickToggleData = await import('../preset-quick-toggle-data.js');
    const toggleGroupData = await import('../toggle-group-data.js');

    // 检查功能是否启用
    if (!snapshotData.isEnabled()) {
        // 功能禁用时，触发单击行为
        toggleImmersiveMode();
        return;
    }

    // 关闭已存在的菜单
    hideSnapshotMenu();

    const snapshots = snapshotData.getSnapshotList();
    const quickToggles = quickToggleData.getQuickTogglesWithState();
    const toggleGroups = toggleGroupData.getFloatingMenuGroups();

    // 如果三个区域都为空，显示空状态
    if (snapshots.length === 0 && quickToggles.length === 0 && toggleGroups.length === 0) {
        snapshotMenu = document.createElement('div');
        snapshotMenu.className = 'snapshot-floating-menu';
        snapshotMenu.innerHTML = `
            <div class="snapshot-menu-empty">
                <i class="fa-solid fa-inbox"></i>
                <span>暂无内容</span>
            </div>
        `;
        positionAndShowMenu(x, y);
        return;
    }

    // 创建菜单
    snapshotMenu = document.createElement('div');
    snapshotMenu.className = 'snapshot-floating-menu';

    let menuHtml = '';
    let hasContent = false;

    // 总开关组区域（最上面）
    if (toggleGroups.length > 0) {
        const groupsHtml = toggleGroups.map(g => {
            const state = toggleGroupData.getGroupState(g.id);
            const isOn = state === true;
            return `
            <div class="snapshot-menu-toggle toggle-group-item" data-group-id="${g.id}">
                <span class="menu-toggle-name">${g.name}</span>
                <span class="menu-toggle-switch ${isOn ? 'on' : 'off'}">
                    <i class="fa-solid ${isOn ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                </span>
            </div>
        `;
        }).join('');
        menuHtml += groupsHtml;
        hasContent = true;
    }

    // 分隔线
    if (hasContent && quickToggles.length > 0) {
        menuHtml += '<div class="snapshot-menu-divider"></div>';
    }

    // 快速开关区域（预设条目 + 世界书条目分组）
    if (quickToggles.length > 0) {
        // 分离预设条目和世界书条目
        const presetToggles = quickToggles.filter(t => t.type === 'preset');
        const worldInfoToggles = quickToggles.filter(t => t.type === 'worldinfo');

        // 渲染预设条目
        if (presetToggles.length > 0) {
            const presetsHtml = presetToggles.map(t => `
                <div class="snapshot-menu-toggle quick-toggle-preset" data-identifier="${t.identifier}">
                    <span class="menu-toggle-name">${t.name}</span>
                    <span class="menu-toggle-switch ${t.enabled ? 'on' : 'off'}">
                        <i class="fa-solid ${t.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                    </span>
                </div>
            `).join('');
            menuHtml += presetsHtml;
        }

        // 按世界书分组渲染世界书条目
        if (worldInfoToggles.length > 0) {
            // 异步获取所有世界书条目的真实状态
            const statePromises = worldInfoToggles.map(t =>
                quickToggleData.getWorldInfoStateAsync(t.worldName, t.uid)
            );
            const states = await Promise.all(statePromises);

            // 把真实状态写回条目
            worldInfoToggles.forEach((t, index) => {
                t.enabled = states[index];
            });

            // 按世界书名分组
            const worldInfoGroups = {};
            worldInfoToggles.forEach(t => {
                if (!worldInfoGroups[t.worldName]) {
                    worldInfoGroups[t.worldName] = [];
                }
                worldInfoGroups[t.worldName].push(t);
            });

            // 渲染每个世界书分组
            Object.keys(worldInfoGroups).forEach(worldName => {
                const entries = worldInfoGroups[worldName];
                const isExpanded = worldInfoGroupExpanded[worldName] !== false; // 默认展开
                const groupId = `wi-group-${worldName.replace(/[^a-zA-Z0-9]/g, '_')}`;

                menuHtml += `
                    <div class="snapshot-menu-wi-group" data-world-name="${worldName}">
                        <div class="snapshot-menu-wi-header ${isExpanded ? 'expanded' : ''}" data-group-id="${groupId}">
                            <i class="fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} wi-group-icon"></i>
                            <span class="wi-group-name">${worldName}</span>
                            <span class="wi-group-count">(${entries.length})</span>
                        </div>
                        <div class="snapshot-menu-wi-entries ${isExpanded ? '' : 'collapsed'}" id="${groupId}">
                            ${entries.map(t => `
                                <div class="snapshot-menu-toggle quick-toggle-worldinfo"
                                     data-world-name="${t.worldName}"
                                     data-uid="${t.uid}">
                                    <span class="menu-toggle-name">${getWorldInfoDisplayName(t)}</span>
                                    <span class="menu-toggle-switch ${t.enabled ? 'on' : 'off'}">
                                        <i class="fa-solid ${t.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
        }

        hasContent = true;
    }

    // 分隔线（如果有内容且有快照）
    if (hasContent && snapshots.length > 0) {
        menuHtml += '<div class="snapshot-menu-divider"></div>';
    }

    // 快照区域
    if (snapshots.length > 0) {
        const snapshotsHtml = snapshots.map(s => `
            <div class="snapshot-menu-item" data-id="${s.id}">
                <i class="fa-solid fa-camera"></i>
                <span>${s.name}</span>
            </div>
        `).join('');
        menuHtml += snapshotsHtml;
    }

    snapshotMenu.innerHTML = menuHtml;

    // 定位并显示菜单
    positionAndShowMenu(x, y);

    // 绑定世界书分组折叠事件
    snapshotMenu.querySelectorAll('.snapshot-menu-wi-header').forEach(header => {
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            const worldName = header.closest('.snapshot-menu-wi-group')?.dataset.worldName;
            const groupId = header.dataset.groupId;
            const entriesEl = document.getElementById(groupId);
            const icon = header.querySelector('.wi-group-icon');

            if (!entriesEl || !worldName) return;

            const isExpanded = header.classList.contains('expanded');

            if (isExpanded) {
                // 折叠
                header.classList.remove('expanded');
                entriesEl.classList.add('collapsed');
                icon?.classList.remove('fa-chevron-down');
                icon?.classList.add('fa-chevron-right');
                worldInfoGroupExpanded[worldName] = false;
            } else {
                // 展开
                header.classList.add('expanded');
                entriesEl.classList.remove('collapsed');
                icon?.classList.remove('fa-chevron-right');
                icon?.classList.add('fa-chevron-down');
                worldInfoGroupExpanded[worldName] = true;
            }
        });
    });

    // 绑定总开关组事件
    snapshotMenu.querySelectorAll('.toggle-group-item').forEach(item => {
        item.addEventListener('click', async () => {
            const groupId = item.dataset.groupId;
            const currentState = toggleGroupData.getGroupState(groupId);
            const newState = currentState !== true;  // 如果当前是true则关闭，否则开启

            await toggleGroupData.toggleGroup(groupId, newState);

            // 更新菜单内的开关显示
            const switchEl = item.querySelector('.menu-toggle-switch');
            const icon = switchEl?.querySelector('i');

            if (newState) {
                switchEl?.classList.remove('off');
                switchEl?.classList.add('on');
                icon?.classList.remove('fa-toggle-off');
                icon?.classList.add('fa-toggle-on');
            } else {
                switchEl?.classList.remove('on');
                switchEl?.classList.add('off');
                icon?.classList.remove('fa-toggle-on');
                icon?.classList.add('fa-toggle-off');
            }
            // 不关闭菜单，允许连续操作
        });
    });

    // 绑定快速开关事件（预设条目）
    snapshotMenu.querySelectorAll('.quick-toggle-preset').forEach(item => {
        item.addEventListener('click', async () => {
            const identifier = item.dataset.identifier;
            const newState = await quickToggleData.toggleState(identifier);

            if (newState !== null) {
                // 更新菜单内的开关显示
                const switchEl = item.querySelector('.menu-toggle-switch');
                const icon = switchEl?.querySelector('i');

                if (newState) {
                    switchEl?.classList.remove('off');
                    switchEl?.classList.add('on');
                    icon?.classList.remove('fa-toggle-off');
                    icon?.classList.add('fa-toggle-on');
                } else {
                    switchEl?.classList.remove('on');
                    switchEl?.classList.add('off');
                    icon?.classList.remove('fa-toggle-on');
                    icon?.classList.add('fa-toggle-off');
                }
            }
            // 不关闭菜单，允许连续操作
        });
    });

    // 绑定快速开关事件（世界书条目）
    snapshotMenu.querySelectorAll('.quick-toggle-worldinfo').forEach(item => {
        item.addEventListener('click', async () => {
            const worldName = item.dataset.worldName;
            const uid = parseInt(item.dataset.uid, 10);
            const newState = await quickToggleData.toggleState(null, worldName, uid);

            if (newState !== null) {
                // 更新菜单内的开关显示
                const switchEl = item.querySelector('.menu-toggle-switch');
                const icon = switchEl?.querySelector('i');

                if (newState) {
                    switchEl?.classList.remove('off');
                    switchEl?.classList.add('on');
                    icon?.classList.remove('fa-toggle-off');
                    icon?.classList.add('fa-toggle-on');
                } else {
                    switchEl?.classList.remove('on');
                    switchEl?.classList.add('off');
                    icon?.classList.remove('fa-toggle-on');
                    icon?.classList.add('fa-toggle-off');
                }
            }
            // 不关闭菜单，允许连续操作
        });
    });

    // 绑定快照事件
    snapshotMenu.querySelectorAll('.snapshot-menu-item[data-id]').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.id;
            const success = snapshotData.applySnapshot(id);
            if (success) {
                toastr.success('快照已应用');
            }
            hideSnapshotMenu();
        });
    });

    // 点击外部关闭菜单
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
        document.addEventListener('pointerdown', handleOutsideClick);
    }, 100);

    logger.debug('[Beautify] 快照菜单已显示，总开关:', toggleGroups.length, '快速开关:', quickToggles.length, '快照:', snapshots.length);
}

/**
 * 定位并显示菜单
 * @param {number} x - 点击位置 X
 * @param {number} y - 点击位置 Y
 */
function positionAndShowMenu(x, y) {
    if (!snapshotMenu) return;

    document.body.appendChild(snapshotMenu);

    // 计算位置（避免超出屏幕）
    const menuRect = snapshotMenu.getBoundingClientRect();
    let menuX = x - menuRect.width / 2;
    let menuY = y - menuRect.height - 10;

    // 边界检查
    if (menuX < 10) menuX = 10;
    if (menuX + menuRect.width > window.innerWidth - 10) {
        menuX = window.innerWidth - menuRect.width - 10;
    }
    if (menuY < 10) {
        menuY = y + 50; // 显示在下方
    }

    snapshotMenu.style.left = `${menuX}px`;
    snapshotMenu.style.top = `${menuY}px`;
}

/**
 * 隐藏快照菜单
 */
function hideSnapshotMenu() {
    if (snapshotMenu) {
        snapshotMenu.remove();
        snapshotMenu = null;
    }
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('pointerdown', handleOutsideClick);
}

/**
 * 处理点击外部关闭菜单
 */
function handleOutsideClick(e) {
    if (snapshotMenu && !snapshotMenu.contains(e.target) && e.target !== floatingBtn) {
        hideSnapshotMenu();
    }
}


// ==========================================
// 悬浮按钮自定义样式
// ==========================================

/**
 * 获取悬浮按钮设置
 * @returns {Object} 悬浮按钮设置对象
 */
function getFloatingBtnSettings() {
    return extension_settings[EXT_ID]?.beautify?.floatingBtn || {
        size: 38,
        color: '',
        imageUrl: '',
        imageOpacity: 1.0,
        savedImages: []
    };
}

/**
 * 应用悬浮按钮所有设置
 * @description 读取设置并应用到悬浮按钮，包括大小、颜色、自定义图片、GIF动画库，
 * 并初始化等待动画监听器（只初始化一次，防止重复注册事件）
 */
export function applyFloatingBtnSettings() {
    if (!floatingBtn) return;

    const settings = getFloatingBtnSettings();

    updateFloatingBtnSize(settings.size);
    updateFloatingBtnColor(settings.color);

    // 优先检查是否有GIF动画库
    if (settings.currentGifPackId && settings.gifPacks) {
        const pack = settings.gifPacks.find(p => p.id === settings.currentGifPackId);
        if (pack) {
            applyGifAnimationPack(pack);
            logger.debug('[Beautify] 悬浮按钮已应用GIF动画库:', pack.name);
            return;
        }
    }

    // 没有动画库，使用静态图片
    if (settings.imageUrl) {
        setFloatingBtnImage(settings.imageUrl, settings.imageOpacity);
    } else {
        clearFloatingBtnImage();
    }

    logger.debug('[Beautify] 悬浮按钮设置已应用');
}

/**
 * 更新悬浮按钮大小
 * @param {number} size - 按钮大小 (0-300px)
 */
export function updateFloatingBtnSize(size) {
    if (!floatingBtn) return;

    // 限制范围
    size = Math.max(0, Math.min(300, size));

    floatingBtn.style.width = `${size}px`;
    floatingBtn.style.height = `${size}px`;

    // 图标大小跟随按钮大小调整（约为按钮的 47%）
    const icon = floatingBtn.querySelector('i');
    if (icon) {
        icon.style.fontSize = `${Math.max(8, size * 0.47)}px`;
    }

    // 自定义图片大小也跟随调整
    const img = floatingBtn.querySelector('img');
    if (img) {
        img.style.width = `${size * 0.8}px`;
        img.style.height = `${size * 0.8}px`;
    }

    logger.debug('[Beautify] 悬浮按钮大小已更新:', size);
}

/**
 * 更新悬浮按钮图标颜色
 * @param {string} color - 颜色值，空字符串表示使用主题色
 */
export function updateFloatingBtnColor(color) {
    if (!floatingBtn) return;

    const icon = floatingBtn.querySelector('i');
    if (icon) {
        // 空字符串时使用 CSS 变量（主题色）
        icon.style.color = color || '';
    }

    logger.debug('[Beautify] 悬浮按钮颜色已更新:', color || '主题色');
}

/**
 * 设置悬浮按钮自定义图片
 * @param {string} url - 图片 URL
 * @param {number} opacity - 图片透明度 (0.1-1.0)
 */
export function setFloatingBtnImage(url, opacity = 1.0) {
    if (!floatingBtn || !url) return;

    // 限制透明度范围
    opacity = Math.max(0.1, Math.min(1.0, opacity));

    // 隐藏图标
    const icon = floatingBtn.querySelector('i');
    if (icon) {
        icon.style.display = 'none';
    }

    // 创建或更新图片元素
    let img = floatingBtn.querySelector('img');
    if (!img) {
        img = document.createElement('img');
        // 不设置 border-radius，保持图片原始形状（用户可能上传非圆形图标）
        img.style.objectFit = 'contain';  // contain 保持比例不裁剪
        img.style.pointerEvents = 'none';
        floatingBtn.appendChild(img);
    }

    // 获取当前按钮大小
    const settings = getFloatingBtnSettings();
    const size = settings.size || 38;

    img.src = url;
    img.style.width = `${size * 0.8}px`;
    img.style.height = `${size * 0.8}px`;
    img.style.opacity = String(opacity);
    img.style.display = 'block';

    logger.debug('[Beautify] 悬浮按钮图片已设置:', url);
}

/**
 * 清除悬浮按钮自定义图片
 */
export function clearFloatingBtnImage() {
    if (!floatingBtn) return;

    // 移除图片元素
    const img = floatingBtn.querySelector('img');
    if (img) {
        img.remove();
    }

    // 显示图标
    const icon = floatingBtn.querySelector('i');
    if (icon) {
        icon.style.display = '';
    }

    logger.debug('[Beautify] 悬浮按钮图片已清除');
}

/**
 * 保存悬浮按钮设置
 * @param {Object} newSettings - 要更新的设置字段
 */
export function saveFloatingBtnSettings(newSettings) {
    if (!extension_settings[EXT_ID]?.beautify) return;

    // 合并新设置
    extension_settings[EXT_ID].beautify.floatingBtn = {
        ...getFloatingBtnSettings(),
        ...newSettings
    };

    saveSettingsDebounced();
    logger.debug('[Beautify] 悬浮按钮设置已保存:', newSettings);
}

// ==========================================
// GIF动画库功能
// ==========================================

/** 当前动画库状态 */
let currentGifPackState = {
    pack: null,           // 当前动画库数据
    state: 'idle',        // 'idle' | 'clicking' | 'afterClick'
    restoreTimer: null    // 恢复待机的定时器
};

/**
 * 应用GIF动画库到悬浮按钮
 * @param {Object} pack - 动画库数据
 */
export function applyGifAnimationPack(pack) {
    if (!floatingBtn || !pack) return;

    // 清除之前的状态
    clearGifPackState();

    // 保存当前动画库
    currentGifPackState.pack = pack;
    currentGifPackState.state = 'idle';

    // 显示待机图片
    if (pack.idle) {
        setFloatingBtnImageInternal(pack.idle);
    }

    // 绑定点击事件（如果有点击动画）
    if (pack.clickAnim || pack.afterClick) {
        floatingBtn.addEventListener('click', handleGifPackClick);
    }

    logger.info('[Beautify] 已应用GIF动画库:', pack.name);
}

/**
 * 清除GIF动画库
 */
export function clearGifAnimationPack() {
    clearGifPackState();
    clearFloatingBtnImage();
    logger.info('[Beautify] 已清除GIF动画库');
}

/**
 * 清除动画库状态
 */
function clearGifPackState() {
    // 清除定时器
    if (currentGifPackState.restoreTimer) {
        clearTimeout(currentGifPackState.restoreTimer);
        currentGifPackState.restoreTimer = null;
    }

    // 移除点击事件
    if (floatingBtn) {
        floatingBtn.removeEventListener('click', handleGifPackClick);
    }

    // 重置状态
    currentGifPackState.pack = null;
    currentGifPackState.state = 'idle';
}

/**
 * 处理GIF动画库点击
 * @param {Event} e - 点击事件
 */
function handleGifPackClick(e) {
    const pack = currentGifPackState.pack;
    if (!pack) return;

    // 阻止事件冒泡，避免触发悬浮按钮的其他点击事件
    e.stopPropagation();

    const currentState = currentGifPackState.state;

    // 清除之前的恢复定时器
    if (currentGifPackState.restoreTimer) {
        clearTimeout(currentGifPackState.restoreTimer);
        currentGifPackState.restoreTimer = null;
    }

    if (currentState === 'idle') {
        // 从待机状态点击 → 播放点击动画
        if (pack.clickAnim) {
            currentGifPackState.state = 'clicking';
            playClickAnimation(pack);
        } else if (pack.afterClick) {
            // 没有点击动画，直接显示点击后图片
            currentGifPackState.state = 'afterClick';
            setFloatingBtnImageInternal(pack.afterClick);
            scheduleRestoreIdle(pack);
        }
    } else if (currentState === 'afterClick') {
        // 从点击后状态再次点击 → 恢复待机
        currentGifPackState.state = 'idle';
        if (pack.idle) {
            setFloatingBtnImageInternal(pack.idle);
        }
    }
    // clicking状态下点击不做处理，等动画播完
}

/**
 * 播放点击动画
 * @param {Object} pack - 动画库数据
 */
function playClickAnimation(pack) {
    if (!pack.clickAnim) return;

    // 显示点击动画GIF
    // 为了让GIF重新播放，需要重新设置src（加时间戳强制刷新）
    const gifUrl = pack.clickAnim + '?t=' + Date.now();
    setFloatingBtnImageInternal(gifUrl);

    // 使用用户设置的动画时长（秒转毫秒），默认2秒
    const animDuration = (pack.animDuration || 2) * 1000;

    setTimeout(() => {
        if (currentGifPackState.state !== 'clicking') return;

        // 动画播完，切换到点击后状态
        if (pack.afterClick) {
            currentGifPackState.state = 'afterClick';
            setFloatingBtnImageInternal(pack.afterClick);
            scheduleRestoreIdle(pack);
        } else {
            // 没有点击后图片，直接恢复
            currentGifPackState.state = 'idle';

            // 检查是否正在等待AI响应
            if (waitingAnimState.isWaiting && waitingAnimState.currentPack?.waitingGif) {
                // 正在等待中，恢复到等待动画
                const waitingGifUrl = waitingAnimState.currentPack.waitingGif + '?t=' + Date.now();
                setFloatingBtnImageInternal(waitingGifUrl);
                logger.debug('[Beautify] 点击动画播完，恢复到等待动画');
            } else if (pack.idle) {
                // 不在等待中，恢复到待机图片
                setFloatingBtnImageInternal(pack.idle);
            }
        }
    }, animDuration);
}

/**
 * 安排恢复待机状态
 * @description 点击动画播完后，延迟恢复。如果正在等待AI响应，则恢复到等待动画而不是待机图片
 * @param {Object} pack - 动画库数据
 */
function scheduleRestoreIdle(pack) {
    if (!pack.restoreDelay || pack.restoreDelay <= 0) return;

    currentGifPackState.restoreTimer = setTimeout(() => {
        if (currentGifPackState.state === 'afterClick') {
            currentGifPackState.state = 'idle';

            // 检查是否正在等待AI响应
            if (waitingAnimState.isWaiting && waitingAnimState.currentPack) {
                // 正在等待中，恢复到等待动画
                const waitingPack = waitingAnimState.currentPack;
                if (waitingPack.waitingGif) {
                    const gifUrl = waitingPack.waitingGif + '?t=' + Date.now();
                    setFloatingBtnImageInternal(gifUrl);
                    logger.debug('[Beautify] 点击动画播完，恢复到等待动画');
                    return;
                }
            }

            // 不在等待中，恢复到待机图片
            if (pack.idle) {
                setFloatingBtnImageInternal(pack.idle);
                logger.debug('[Beautify] GIF动画库已自动恢复待机');
            }
        }
    }, pack.restoreDelay * 1000);
}

/**
 * 内部设置悬浮按钮图片（不保存设置）
 * @param {string} url - 图片URL
 */
function setFloatingBtnImageInternal(url) {
    if (!floatingBtn || !url) return;

    // 隐藏图标
    const icon = floatingBtn.querySelector('i');
    if (icon) {
        icon.style.display = 'none';
    }

    // 创建或更新图片元素
    let img = floatingBtn.querySelector('img');
    if (!img) {
        img = document.createElement('img');
        img.style.objectFit = 'contain';
        img.style.pointerEvents = 'none';
        floatingBtn.appendChild(img);
    }

    // 获取当前按钮大小
    const settings = getFloatingBtnSettings();
    const size = settings.size || 38;

    img.src = url;
    img.style.width = `${size * 0.8}px`;
    img.style.height = `${size * 0.8}px`;
    img.style.display = 'block';
}

// ==========================================
// 等待动画功能（发送消息时的动画）
// ==========================================

/** 等待动画状态 */
let waitingAnimState = {
    isWaiting: false,         // 是否正在等待AI响应
    currentPack: null,        // 当前使用的等待动画库
    startTimer: null,         // 开始动画定时器（播完后切换到等待动画）
    completeTimer: null,      // 完成动画定时器
    previousImageUrl: '',     // 等待前的图片URL（用于恢复）
    previousOpacity: 1.0,     // 等待前的透明度
    listenersInitialized: false  // 监听器是否已初始化
};

/**
 * 初始化等待动画监听器
 * @description 监听发送消息和生成完成事件，自动切换等待动画
 */
export function initWaitingAnimationListeners() {
    // 监听生成开始事件（用户点击发送后触发）
    eventSource.on(event_types.GENERATION_STARTED, handleGenerationStarted);

    // 监听生成结束事件（AI输出完成后触发）
    eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);

    // 监听生成终止事件（用户点击终止按钮后触发）
    eventSource.on(event_types.GENERATION_STOPPED, handleGenerationStopped);

    logger.info('[Beautify] 等待动画监听器已初始化');
}

/**
 * 处理生成开始事件
 * @description 用户点击发送后，先播放开始动画（如有），再切换到等待动画
 * @param {string} type - 生成类型（normal/regenerate/swipe/continue/impersonate/quiet）
 * @param {Object} params - 生成参数
 * @param {boolean} dryRun - 是否为干运行（只组装提示词，不实际生成）
 */
function handleGenerationStarted(type, params, dryRun) {
    // 忽略静默生成（后台生成，不显示终止键）和干运行
    if (type === 'quiet' || dryRun) {
        logger.debug('[Beautify] 忽略静默生成或干运行，type:', type, 'dryRun:', dryRun);
        return;
    }

    // 如果已经在等待状态，忽略
    if (waitingAnimState.isWaiting) return;

    // 获取当前等待动画库设置
    const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};
    const waitingPacks = settings.waitingPacks || [];
    const currentWaitingPackId = settings.currentWaitingPackId || '';

    // 如果没有设置等待动画库，不做任何处理
    if (!currentWaitingPackId || waitingPacks.length === 0) {
        logger.debug('[Beautify] 未设置等待动画库，保持当前状态');
        return;
    }

    // 查找当前使用的等待动画库
    const pack = waitingPacks.find(p => p.id === currentWaitingPackId);
    if (!pack || (!pack.startGif && !pack.waitingGif)) {
        logger.debug('[Beautify] 等待动画库无效或没有动画GIF');
        return;
    }

    // 保存当前状态（用于恢复）
    waitingAnimState.previousImageUrl = settings.imageUrl || '';
    waitingAnimState.previousOpacity = settings.imageOpacity || 1.0;

    // 切换到等待状态
    waitingAnimState.isWaiting = true;
    waitingAnimState.currentPack = pack;

    // 如果有开始动画，先播放开始动画
    if (pack.startGif) {
        // 显示开始动画（加时间戳强制GIF重新播放）
        const startGifUrl = pack.startGif + '?t=' + Date.now();
        setFloatingBtnImageInternal(startGifUrl);

        logger.info('[Beautify] 播放开始动画:', pack.name, '时长:', pack.startDuration, '秒');

        // 设置定时器，开始动画播完后切换到等待动画
        const startDuration = (pack.startDuration || 2) * 1000;
        waitingAnimState.startTimer = setTimeout(() => {
            // 检查是否还在等待状态（可能被用户终止了）
            if (!waitingAnimState.isWaiting) return;

            // 切换到等待动画
            if (pack.waitingGif) {
                const waitingGifUrl = pack.waitingGif + '?t=' + Date.now();
                setFloatingBtnImageInternal(waitingGifUrl);
                logger.debug('[Beautify] 切换到等待动画（循环播放）');
            }
        }, startDuration);
    } else {
        // 没有开始动画，直接显示等待动画
        const gifUrl = pack.waitingGif + '?t=' + Date.now();
        setFloatingBtnImageInternal(gifUrl);
        logger.info('[Beautify] 开始播放等待动画:', pack.name);
    }
}

/**
 * 处理生成结束事件
 * @description AI输出完成后，播放完成动画，然后恢复待机
 */
function handleGenerationEnded() {
    // 如果不在等待状态，忽略
    if (!waitingAnimState.isWaiting) return;

    const pack = waitingAnimState.currentPack;

    // 如果有完成动画，播放它
    if (pack && pack.completeGif) {
        // 显示完成动画
        const gifUrl = pack.completeGif + '?t=' + Date.now();
        setFloatingBtnImageInternal(gifUrl);

        // 设置定时器，完成动画播放完后恢复待机
        const duration = (pack.completeDuration || 3) * 1000;
        waitingAnimState.completeTimer = setTimeout(() => {
            restoreToIdleState();
        }, duration);

        logger.info('[Beautify] 播放完成动画，', pack.completeDuration, '秒后恢复待机');
    } else {
        // 没有完成动画，直接恢复待机
        restoreToIdleState();
    }
}

/**
 * 处理生成终止事件
 * @description 用户点击终止按钮，直接恢复待机（不播放完成动画）
 */
function handleGenerationStopped() {
    // 如果不在等待状态，忽略
    if (!waitingAnimState.isWaiting) return;

    logger.info('[Beautify] 用户终止生成，直接恢复待机');

    // 清除开始动画定时器（如果有）
    if (waitingAnimState.startTimer) {
        clearTimeout(waitingAnimState.startTimer);
        waitingAnimState.startTimer = null;
    }

    // 清除完成动画定时器（如果有）
    if (waitingAnimState.completeTimer) {
        clearTimeout(waitingAnimState.completeTimer);
        waitingAnimState.completeTimer = null;
    }

    // 直接恢复待机
    restoreToIdleState();
}

/**
 * 恢复到待机状态
 * @description 恢复等待前的图片，或使用点击动画库的待机图
 */
function restoreToIdleState() {
    // 清除开始动画定时器
    if (waitingAnimState.startTimer) {
        clearTimeout(waitingAnimState.startTimer);
        waitingAnimState.startTimer = null;
    }

    // 清除完成动画定时器
    if (waitingAnimState.completeTimer) {
        clearTimeout(waitingAnimState.completeTimer);
        waitingAnimState.completeTimer = null;
    }

    // 重置等待状态
    waitingAnimState.isWaiting = false;
    waitingAnimState.currentPack = null;

    // 恢复之前的图片
    const settings = extension_settings[EXT_ID]?.beautify?.floatingBtn || {};

    // 优先使用点击动画库的待机图
    if (settings.currentGifPackId && settings.gifPacks) {
        const gifPack = settings.gifPacks.find(p => p.id === settings.currentGifPackId);
        if (gifPack && gifPack.idle) {
            setFloatingBtnImageInternal(gifPack.idle);
            logger.debug('[Beautify] 恢复到点击动画库的待机图');
            return;
        }
    }

    // 其次使用静态待机图片
    if (waitingAnimState.previousImageUrl) {
        setFloatingBtnImage(waitingAnimState.previousImageUrl, waitingAnimState.previousOpacity);
        logger.debug('[Beautify] 恢复到静态待机图片');
        return;
    }

    // 最后清除图片，显示默认图标
    clearFloatingBtnImage();
    logger.debug('[Beautify] 恢复到默认图标');
}

/**
 * 检查是否正在等待AI响应
 * @returns {boolean} 是否正在等待
 */
export function isWaitingForGeneration() {
    return waitingAnimState.isWaiting;
}

// ==========================================
// 去除阴影功能组
// ==========================================

/**
 * 绑定去除阴影功能组
 * @description 折叠展开式，包含一键去除和分类去除
 */
function bindRemoveShadowGroup() {
    // 折叠展开绑定
    bindCollapsible('beautify-shadow-collapse-header', 'beautify-shadow-collapse-content');

    const allCheckbox = document.getElementById('beautify-remove-shadow-all-enabled');

    // 子开关配置
    const shadowSubItems = [
        { id: 'beautify-remove-text-shadow-enabled', key: 'removeTextShadowEnabled', className: 'beautify-remove-text-shadow' },
        { id: 'beautify-remove-filter-shadow-enabled', key: 'removeFilterShadowEnabled', className: 'beautify-remove-filter-shadow' },
        { id: 'beautify-remove-popup-shadow-enabled', key: 'removePopupShadowEnabled', className: 'beautify-remove-popup-shadow' },
        { id: 'beautify-remove-backdrop-enabled', key: 'removeBackdropEnabled', className: 'beautify-remove-backdrop' },
        { id: 'beautify-remove-avatar-shadow-enabled', key: 'removeAvatarShadowEnabled', className: 'beautify-remove-avatar-shadow' },
        { id: 'beautify-remove-menu-shadow-enabled', key: 'removeMenuShadowEnabled', className: 'beautify-remove-menu-shadow' },
        { id: 'beautify-remove-bg-shadow-enabled', key: 'removeBgShadowEnabled', className: 'beautify-remove-bg-shadow' },
        { id: 'beautify-remove-topbar-shadow-enabled', key: 'removeTopbarShadowEnabled', className: 'beautify-remove-topbar-shadow' },
        { id: 'beautify-remove-preset-shadow-enabled', key: 'removePresetShadowEnabled', className: 'beautify-remove-preset-shadow' },
        { id: 'beautify-remove-edit-shadow-enabled', key: 'removeEditShadowEnabled', className: 'beautify-remove-edit-shadow' }
    ];

    // 应用所有阴影设置
    const applyAllShadowSettings = (enabled) => {
        shadowSubItems.forEach(item => {
            const checkbox = document.getElementById(item.id);
            if (checkbox) {
                /** @type {HTMLInputElement} */ (checkbox).checked = enabled;
            }
            extension_settings[EXT_ID].beautify[item.key] = enabled;
            if (enabled) {
                document.body.classList.add(item.className);
            } else {
                document.body.classList.remove(item.className);
            }
        });
    };

    // 一键去除所有阴影
    if (allCheckbox) {
        /** @type {HTMLInputElement} */ (allCheckbox).checked = removeShadowAllEnabled;

        allCheckbox.addEventListener('change', function () {
            const newState = /** @type {HTMLInputElement} */ (this).checked;
            removeShadowAllEnabled = newState;
            extension_settings[EXT_ID].beautify.removeShadowAllEnabled = newState;
            saveSettingsDebounced();
            logger.info('[Beautify] 一键去除所有阴影:', newState);

            applyAllShadowSettings(newState);
        });

        // 如果已启用，立即应用
        if (removeShadowAllEnabled) {
            applyAllShadowSettings(true);
        }
    }

    // 绑定各个子开关
    shadowSubItems.forEach(item => {
        const initialValue = extension_settings[EXT_ID].beautify[item.key] || false;
        bindCheckboxToggle(item.id, item.key, initialValue,
            () => document.body.classList.add(item.className),
            () => document.body.classList.remove(item.className)
        );
    });

    logger.debug('[Beautify] 去除阴影功能组已绑定');
}

// ==========================================
// 阅读辅助功能组
// ==========================================

/**
 * 绑定阅读辅助功能组
 * @description 折叠展开式，无总开关，各功能独立控制
 */
function bindReadingAidGroup() {
    // 折叠展开绑定
    bindCollapsible('beautify-reading-aid-collapse-header', 'beautify-reading-aid-collapse-content');

    // 聊天行高（独立功能，勾选后显示滑块）
    bindChatLineHeight();

    // 文本下划线（勾选后显示子选项）
    const underlineCheckbox = document.getElementById('beautify-underline-enabled');
    const underlineOptions = document.getElementById('beautify-underline-options');

    if (underlineCheckbox) {
        /** @type {HTMLInputElement} */ (underlineCheckbox).checked = underlineEnabled;

        // 根据初始状态显示/隐藏子选项
        if (underlineOptions) {
            underlineOptions.style.display = underlineEnabled ? 'block' : 'none';
        }

        underlineCheckbox.addEventListener('change', function () {
            const newState = /** @type {HTMLInputElement} */ (this).checked;
            underlineEnabled = newState;
            extension_settings[EXT_ID].beautify.underlineEnabled = newState;
            saveSettingsDebounced();
            logger.info('[Beautify] 文本下划线:', newState);

            // 显示/隐藏子选项
            if (underlineOptions) {
                underlineOptions.style.display = newState ? 'block' : 'none';
            }

            if (newState) {
                document.body.classList.add('beautify-underline');
            } else {
                document.body.classList.remove('beautify-underline');
            }
        });

        // 如果已启用，立即应用
        if (underlineEnabled) {
            document.body.classList.add('beautify-underline');
        }
    }

    // AI下划线颜色
    bindColorPicker('beautify-underline-ai-color', 'underlineAiColor', underlineAiColor,
        (color) => document.documentElement.style.setProperty('--beautify-underline-ai-color', color)
    );

    // 用户下划线颜色
    bindColorPicker('beautify-underline-user-color', 'underlineUserColor', underlineUserColor,
        (color) => document.documentElement.style.setProperty('--beautify-underline-user-color', color)
    );

    // 首字下沉
    bindCheckboxToggle('beautify-dropcap-enabled', 'dropcapEnabled', dropcapEnabled,
        () => document.body.classList.add('beautify-dropcap'),
        () => document.body.classList.remove('beautify-dropcap')
    );

    // 首行缩进
    bindCheckboxToggle('beautify-indent-enabled', 'indentEnabled', indentEnabled,
        () => document.body.classList.add('beautify-indent'),
        () => document.body.classList.remove('beautify-indent')
    );

    // 段落间距
    bindParagraphSpacing();

    // 悬停段落高亮（勾选后显示颜色选择器）
    const hoverCheckbox = document.getElementById('beautify-hover-highlight-enabled');
    const hoverColorSetting = document.getElementById('beautify-hover-highlight-color-setting');

    if (hoverCheckbox) {
        /** @type {HTMLInputElement} */ (hoverCheckbox).checked = hoverHighlightEnabled;

        // 根据初始状态显示/隐藏颜色选择器
        if (hoverColorSetting) {
            hoverColorSetting.style.display = hoverHighlightEnabled ? 'block' : 'none';
        }

        hoverCheckbox.addEventListener('change', function () {
            const newState = /** @type {HTMLInputElement} */ (this).checked;
            hoverHighlightEnabled = newState;
            extension_settings[EXT_ID].beautify.hoverHighlightEnabled = newState;
            saveSettingsDebounced();
            logger.info('[Beautify] 悬停段落高亮:', newState);

            // 显示/隐藏颜色选择器
            if (hoverColorSetting) {
                hoverColorSetting.style.display = newState ? 'block' : 'none';
            }

            if (newState) {
                document.body.classList.add('beautify-hover-highlight');
            } else {
                document.body.classList.remove('beautify-hover-highlight');
            }
        });

        // 如果已启用，立即应用
        if (hoverHighlightEnabled) {
            document.body.classList.add('beautify-hover-highlight');
        }
    }

    // 悬停高亮颜色
    bindColorPicker('beautify-hover-highlight-color', 'hoverHighlightColor', hoverHighlightColor,
        (color) => document.documentElement.style.setProperty('--beautify-hover-highlight-color', color)
    );

    // 应用初始颜色值
    document.documentElement.style.setProperty('--beautify-underline-ai-color', underlineAiColor);
    document.documentElement.style.setProperty('--beautify-underline-user-color', underlineUserColor);
    document.documentElement.style.setProperty('--beautify-hover-highlight-color', hoverHighlightColor);

    logger.debug('[Beautify] 阅读辅助功能组已绑定');
}

/**
 * 绑定折叠展开功能
 * @param {string} headerId - 折叠标题元素ID
 * @param {string} contentId - 折叠内容元素ID
 */
function bindCollapsible(headerId, contentId) {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);

    if (!header || !content) {
        logger.warn(`[Beautify] 未找到折叠元素 #${headerId} 或 #${contentId}`);
        return;
    }

    // 默认折叠
    content.style.display = 'none';
    header.classList.remove('expanded');

    header.addEventListener('click', function () {
        const isExpanded = content.style.display !== 'none';

        if (isExpanded) {
            content.style.display = 'none';
            header.classList.remove('expanded');
        } else {
            content.style.display = 'block';
            header.classList.add('expanded');
        }
    });
}

/**
 * 绑定聊天行高功能
 * @description 勾选框 + 滑块，行高同时影响聊天文本和下划线
 */
function bindChatLineHeight() {
    const checkbox = document.getElementById('beautify-chat-line-height-enabled');
    const settingContainer = document.getElementById('beautify-chat-line-height-setting');
    const slider = document.getElementById('beautify-chat-line-height');
    const valueDisplay = document.getElementById('beautify-chat-line-height-value');

    if (!checkbox) {
        logger.warn('[Beautify] 未找到聊天行高勾选框');
        return;
    }

    // 从设置加载初始值
    const lineHeightEnabled = extension_settings[EXT_ID].beautify.chatLineHeightEnabled || false;
    const lineHeightValue = extension_settings[EXT_ID].beautify.chatLineHeight || 1.6;

    // 同步勾选框初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = lineHeightEnabled;

    // 同步滑块初始值
    if (slider) {
        /** @type {HTMLInputElement} */ (slider).value = String(lineHeightValue);
    }
    if (valueDisplay) {
        valueDisplay.textContent = String(lineHeightValue);
    }

    // 根据启用状态显示/隐藏滑块
    if (settingContainer) {
        settingContainer.style.display = lineHeightEnabled ? 'block' : 'none';
    }

    // 如果已启用，立即应用
    if (lineHeightEnabled) {
        document.body.classList.add('beautify-chat-line-height');
        applyLineHeight(lineHeightValue);
    }

    // 勾选框事件
    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        extension_settings[EXT_ID].beautify.chatLineHeightEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 聊天行高:', newState);

        // 显示/隐藏滑块
        if (settingContainer) {
            settingContainer.style.display = newState ? 'block' : 'none';
        }

        if (newState) {
            document.body.classList.add('beautify-chat-line-height');
            const currentValue = slider ? parseFloat(/** @type {HTMLInputElement} */ (slider).value) : lineHeightValue;
            applyLineHeight(currentValue);
        } else {
            document.body.classList.remove('beautify-chat-line-height');
        }
    });

    // 滑块事件
    if (slider) {
        slider.addEventListener('input', function () {
            const value = parseFloat(/** @type {HTMLInputElement} */ (this).value);
            extension_settings[EXT_ID].beautify.chatLineHeight = value;
            saveSettingsDebounced();

            if (valueDisplay) {
                valueDisplay.textContent = String(value);
            }

            // 只有启用时才应用
            if (/** @type {HTMLInputElement} */ (checkbox).checked) {
                applyLineHeight(value);
            }
        });
    }
}

/**
 * 应用行高值（同时影响聊天文本和下划线）
 * @param {number} value - 行高值
 */
function applyLineHeight(value) {
    document.documentElement.style.setProperty('--beautify-chat-line-height', String(value));
    document.documentElement.style.setProperty('--beautify-underline-line-height', `${value}em`);
    logger.debug('[Beautify] 行高已应用:', value);
}

/**
 * 绑定颜色选择器
 * @param {string} elementId - 颜色选择器元素ID
 * @param {string} settingKey - 设置键名
 * @param {string} initialValue - 初始颜色值
 * @param {Function} applyFn - 应用颜色的函数
 */
function bindColorPicker(elementId, settingKey, initialValue, applyFn) {
    const colorPicker = document.getElementById(elementId);
    if (!colorPicker) {
        logger.warn(`[Beautify] 未找到颜色选择器 #${elementId}`);
        return;
    }

    // 设置初始颜色
    colorPicker.setAttribute('color', initialValue);

    // 监听颜色变化
    colorPicker.addEventListener('change', function (e) {
        const color = e.detail?.rgba || initialValue;
        extension_settings[EXT_ID].beautify[settingKey] = color;
        saveSettingsDebounced();
        applyFn(color);
        logger.debug(`[Beautify] ${settingKey} 颜色变更:`, color);
    });

    // 立即应用初始颜色
    applyFn(initialValue);
}

/**
 * 绑定段落间距功能
 * @description 勾选框 + 单选按钮组
 */
function bindParagraphSpacing() {
    const checkbox = document.getElementById('beautify-paragraph-spacing-enabled');
    const settingContainer = document.getElementById('beautify-paragraph-spacing-setting');
    const radios = document.querySelectorAll('input[name="beautify-paragraph-spacing"]');

    if (!checkbox) {
        logger.warn('[Beautify] 未找到段落间距勾选框');
        return;
    }

    // 同步勾选框初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = paragraphSpacingEnabled;

    // 同步单选按钮初始值
    radios.forEach(radio => {
        if (/** @type {HTMLInputElement} */ (radio).value === paragraphSpacingValue) {
            /** @type {HTMLInputElement} */ (radio).checked = true;
        }
    });

    // 根据启用状态显示/隐藏单选按钮组
    if (settingContainer) {
        settingContainer.style.display = paragraphSpacingEnabled ? 'block' : 'none';
    }

    // 如果已启用，立即应用
    if (paragraphSpacingEnabled) {
        document.body.classList.add('beautify-paragraph-spacing');
        document.documentElement.style.setProperty('--beautify-paragraph-spacing', `${paragraphSpacingValue}em`);
    }

    // 勾选框事件
    checkbox.addEventListener('change', function () {
        const newState = /** @type {HTMLInputElement} */ (this).checked;
        paragraphSpacingEnabled = newState;
        extension_settings[EXT_ID].beautify.paragraphSpacingEnabled = newState;
        saveSettingsDebounced();
        logger.info('[Beautify] 段落间距:', newState);

        // 显示/隐藏单选按钮组
        if (settingContainer) {
            settingContainer.style.display = newState ? 'block' : 'none';
        }

        if (newState) {
            document.body.classList.add('beautify-paragraph-spacing');
            document.documentElement.style.setProperty('--beautify-paragraph-spacing', `${paragraphSpacingValue}em`);
        } else {
            document.body.classList.remove('beautify-paragraph-spacing');
        }
    });

    // 单选按钮事件
    radios.forEach(radio => {
        radio.addEventListener('change', function () {
            const value = /** @type {HTMLInputElement} */ (this).value;
            paragraphSpacingValue = value;
            extension_settings[EXT_ID].beautify.paragraphSpacingValue = value;
            saveSettingsDebounced();
            document.documentElement.style.setProperty('--beautify-paragraph-spacing', `${value}em`);
            logger.debug('[Beautify] 段落间距值:', value);
        });
    });
}
