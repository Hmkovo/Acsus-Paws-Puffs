/**
 * 日记视觉设置 - 数据管理模块
 * 
 * @description
 * 负责视觉设置的数据管理和CSS应用：
 * - 获取/更新视觉设置
 * - 应用CSS样式到DOM
 * - 重置设置
 * - 消除代码重复：统一的 updateSetting 方法
 * 
 * @module DiaryVisualData
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { extension_settings } from '../../../../../extensions.js';
import logger from '../../logger.js';

const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'diary';

// ========================================
// [CORE] 视觉设置数据类
// ========================================

/**
 * 日记视觉设置数据管理器
 * 
 * @class DiaryVisualData
 */
export class DiaryVisualData {
  /**
   * 创建视觉设置数据管理器
   * 
   * @param {Object} dataManager - 数据管理器
   */
  constructor(dataManager) {
    this.dataManager = dataManager;
  }

  /**
   * 获取默认视觉设置
   */
  getDefaultVisualSettings() {
    return {
      cardOpacity: 1.0,
      themeColor: '',
      textColor: '',
      panelBgColor: '',
      panelBgOpacity: 1.0,
      authorColors: {
        user: '',
        ai: '',
        passerby: ''
      },
      background: {
        enabled: false,
        currentImageUrl: '',
        savedImages: [],
        maskEnabled: false,
        maskColor: '#000000',
        maskOpacity: 0.3
      },
      commentBox: {
        backgroundColor: '',
        opacity: 1.0,
        borderColor: '',
        replyBorderColor: ''
      }
    };
  }

  /**
   * 确保视觉设置存在并返回引用
   */
  ensureVisualSettings() {
    if (!extension_settings[EXT_ID][MODULE_NAME].settings.visualSettings) {
      extension_settings[EXT_ID][MODULE_NAME].settings.visualSettings = this.getDefaultVisualSettings();
    }
    return extension_settings[EXT_ID][MODULE_NAME].settings.visualSettings;
  }

  // ========================================
  // [UPDATE] 更新设置方法（消除重复P9）
  // ========================================

  /**
   * 统一的设置更新方法（消除代码重复）
   * 
   * @param {string} key - 设置键（支持嵌套，如 'authorColors.user'）
   * @param {any} value - 设置值
   * @param {Function} [applyFunc] - 应用函数（可选）
   * 
   * @description
   * 提取公共逻辑：更新设置、保存、应用CSS、更新UI显示
   * 消除了10+个 updateXXX 方法的重复代码
   */
  updateSetting(key, value, applyFunc = null) {
    const visualSettings = this.ensureVisualSettings();

    // 支持嵌套键（如 'authorColors.user'）
    const keys = key.split('.');
    if (keys.length === 1) {
      visualSettings[keys[0]] = value;
    } else if (keys.length === 2) {
      if (!visualSettings[keys[0]]) {
        visualSettings[keys[0]] = {};
      }
      visualSettings[keys[0]][keys[1]] = value;
    }

    // 保存设置
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    // 应用CSS（如果提供了应用函数）
    if (applyFunc) {
      applyFunc(value);
    }

    logger.debug(`[DiaryVisualData] 设置已更新: ${key}`, value);
  }

  /**
   * 更新卡片透明度
   */
  updateCardOpacity(opacity) {
    this.updateSetting('cardOpacity', opacity, (val) => this.applyCardOpacity(val));
  }

  /**
   * 更新主题色
   */
  updateThemeColor(color) {
    this.updateSetting('themeColor', color, (val) => this.applyThemeColor(val));
  }

  /**
   * 更新文本颜色
   */
  updateTextColor(color) {
    this.updateSetting('textColor', color, (val) => this.applyTextColor(val));
  }

  /**
   * 更新面板背景色
   */
  updatePanelBgColor(color) {
    this.updateSetting('panelBgColor', color, (val) => {
      const settings = this.dataManager.getSettings();
      this.applyPanelBgColor(val, settings.visualSettings.panelBgOpacity);
    });
  }

  /**
   * 更新面板背景透明度
   */
  updatePanelBgOpacity(opacity) {
    this.updateSetting('panelBgOpacity', opacity, () => {
      const settings = this.dataManager.getSettings();
      if (settings.visualSettings.panelBgColor) {
        this.applyPanelBgColor(settings.visualSettings.panelBgColor, opacity);
      }
    });
  }

  /**
   * 更新评论者颜色
   */
  updateAuthorColor(type, color) {
    this.updateSetting(`authorColors.${type}`, color, () => {
      const settings = this.dataManager.getSettings();
      this.applyAuthorColors(settings.visualSettings.authorColors);
    });
  }

  /**
   * 更新内容块背景色
   * @param {string} color - 颜色值
   */
  updateEntryBlockBgColor(color) {
    this.updateSetting('entryBlockBgColor', color, (val) => {
      const settings = this.dataManager.getSettings();
      this.applyEntryBlockStyles({
        backgroundColor: val,
        opacity: settings.visualSettings.entryBlockOpacity
      });
    });
  }

  /**
   * 更新内容块透明度
   * @param {number} opacity - 透明度（0-1）
   */
  updateEntryBlockOpacity(opacity) {
    this.updateSetting('entryBlockOpacity', opacity, () => {
      const settings = this.dataManager.getSettings();
      this.applyEntryBlockStyles({
        backgroundColor: settings.visualSettings.entryBlockBgColor,
        opacity: opacity
      });
    });
  }

  /**
   * 切换背景启用状态
   */
  toggleBackground(enabled) {
    this.updateSetting('background.enabled', enabled, () => {
      const visualSettings = this.ensureVisualSettings();
      if (enabled) {
        this.applyCardBackground(visualSettings.background);
      } else {
        this.removeCardBackground();
      }
    });
  }

  /**
   * 更新背景URL
   */
  updateBackgroundUrl(url) {
    this.updateSetting('background.currentImageUrl', url, () => {
      const visualSettings = this.ensureVisualSettings();
      if (visualSettings.background.enabled && url) {
        this.applyCardBackground(visualSettings.background);
      }
    });
  }

  // ========================================
  // [APPLY] 应用样式方法
  // ========================================

  /**
   * 应用卡片透明度
   */
  applyCardOpacity(opacity) {
    const styleId = 'diary-visual-opacity-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    const bgPercent = opacity * 100;
    const transparentPercent = 100 - bgPercent;

    style.textContent = `
            .diary-panel .diary-card .diary-content,
            .diary-panel .diary-card:nth-child(2) .diary-content {
                background: color-mix(
                    in srgb, 
                    var(--SmartThemeBlurTintColor) ${bgPercent}%, 
                    transparent ${transparentPercent}%
                ) !important;
            }
        `;

    logger.debug('[DiaryVisualData.applyCardOpacity] 卡片透明度已应用:', opacity);
  }

  /**
   * 应用主题色
   */
  applyThemeColor(color) {
    const styleId = 'diary-visual-theme-color-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
            .diary-panel {
                --SmartThemeQuoteColor: ${color} !important;
            }
        `;

    logger.debug('[DiaryVisualData.applyThemeColor] 主题色已应用:', color);
  }

  /**
   * 应用文本颜色
   */
  applyTextColor(color) {
    const styleId = 'diary-visual-text-color-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = `
            .diary-panel {
                --SmartThemeBodyColor: ${color} !important;
            }
        `;

    logger.debug('[DiaryVisualData.applyTextColor] 文本颜色已应用:', color);
  }

  /**
   * 应用面板背景色
   */
  applyPanelBgColor(color, opacity = 1.0) {
    const styleId = 'diary-visual-panel-bg-color-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    const colorWithOpacity = this.hexToRgba(color, opacity);

    style.textContent = `
            .diary-panel {
                --SmartThemeBlurTintColor: ${colorWithOpacity} !important;
            }
        `;

    logger.debug('[DiaryVisualData.applyPanelBgColor] 面板背景色已应用:', color, 'opacity:', opacity);
  }

  /**
   * 应用评论者颜色
   */
  applyAuthorColors(colors) {
    const styleId = 'diary-visual-author-colors-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    let css = '';
    if (colors.user) css += `.comment-author-user { color: ${colors.user} !important; }\n`;
    if (colors.ai) css += `.comment-author-ai { color: ${colors.ai} !important; }\n`;
    if (colors.passerby) css += `.comment-author-passerby { color: ${colors.passerby} !important; }\n`;

    style.textContent = css;

    logger.debug('[DiaryVisualData.applyAuthorColors] 评论者颜色已应用');
  }

  /**
   * 应用卡片背景
   */
  applyCardBackground(bgSettings) {
    const styleId = 'diary-visual-background-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    if (!bgSettings.currentImageUrl) {
      style.textContent = '';
      return;
    }

    let css = `
            /* 应用背景图，覆盖默认背景色 */
            .diary-panel .diary-card .diary-content,
            .diary-panel .diary-card:nth-child(2) .diary-content {
                background: url('${bgSettings.currentImageUrl}') center/cover no-repeat !important;
            }
        `;

    // 如果启用遮罩，添加半透明遮罩层
    if (bgSettings.maskEnabled) {
      const maskRgba = this.hexToRgba(bgSettings.maskColor, bgSettings.maskOpacity);
      css += `
            .diary-panel .diary-card .diary-content::after,
            .diary-panel .diary-card:nth-child(2) .diary-content::after {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                background: ${maskRgba} !important;
                pointer-events: none !important;
                z-index: 1 !important;
            }
            `;
    }

    style.textContent = css;

    logger.debug('[DiaryVisualData.applyCardBackground] 卡片背景已应用');
  }

  /**
   * 应用内容块样式
   * @param {Object} styles - 样式配置对象
   * @param {string} styles.backgroundColor - 背景颜色
   * @param {number} styles.opacity - 透明度（0-1）
   */
  applyEntryBlockStyles(styles) {
    const styleId = 'diary-visual-entry-block-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    let css = '';

    if (styles.backgroundColor) {
      const bgRgba = this.hexToRgba(styles.backgroundColor, styles.opacity);
      css += `.diary-panel .diary-entry { background: ${bgRgba} !important; }\n`;
    } else if (styles.opacity !== 1.0) {
      css += `.diary-panel .diary-entry { opacity: ${styles.opacity} !important; }\n`;
    }

    style.textContent = css;

    logger.debug('[DiaryVisualData.applyEntryBlockStyles] 内容块样式已应用');
  }

  /**
   * 应用评论框样式
   */
  applyCommentBoxStyles(styles) {
    const styleId = 'diary-visual-comment-box-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    let css = '';

    if (styles.backgroundColor) {
      const bgRgba = this.hexToRgba(styles.backgroundColor, styles.opacity);
      css += `.comment-item { background: ${bgRgba} !important; }\n`;
    } else if (styles.opacity !== 1.0) {
      css += `.comment-item { opacity: ${styles.opacity} !important; }\n`;
    }

    if (styles.borderColor) {
      css += `.comment-item { border-color: ${styles.borderColor} !important; }\n`;
    }

    if (styles.replyBorderColor) {
      css += `.comment-replies { border-left-color: ${styles.replyBorderColor} !important; }\n`;
    }

    style.textContent = css;

    logger.debug('[DiaryVisualData.applyCommentBoxStyles] 评论框样式已应用');
  }

  // ========================================
  // [REMOVE] 移除样式方法
  // ========================================

  /**
   * 移除主题色设置（恢复默认）
   * 
   * @description
   * 清空动态生成的主题色CSS，让日记面板恢复使用官方主题色
   */
  removeThemeColor() {
    const styleId = 'diary-visual-theme-color-style';
    const style = document.getElementById(styleId);
    if (style) style.textContent = '';
    logger.debug('[DiaryVisualData.removeThemeColor] 主题色已移除');
  }

  /**
   * 移除文本颜色设置（恢复默认）
   * 
   * @description
   * 清空动态生成的文本颜色CSS，让日记面板恢复使用官方文本色
   */
  removeTextColor() {
    const styleId = 'diary-visual-text-color-style';
    const style = document.getElementById(styleId);
    if (style) style.textContent = '';
    logger.debug('[DiaryVisualData.removeTextColor] 文本颜色已移除');
  }

  /**
   * 移除面板背景色设置（恢复默认）
   * 
   * @description
   * 清空动态生成的面板背景色CSS，让日记面板恢复使用官方背景色
   */
  removePanelBgColor() {
    const styleId = 'diary-visual-panel-bg-color-style';
    const style = document.getElementById(styleId);
    if (style) style.textContent = '';
    logger.debug('[DiaryVisualData.removePanelBgColor] 面板背景色已移除');
  }

  /**
   * 移除卡片背景图（恢复默认）
   * 
   * @description
   * 清空动态生成的背景图CSS，让日记卡片恢复使用纯色背景
   */
  removeCardBackground() {
    const styleId = 'diary-visual-background-style';
    const style = document.getElementById(styleId);
    if (style) style.textContent = '';
    logger.debug('[DiaryVisualData.removeCardBackground] 卡片背景已移除');
  }

  // ========================================
  // [UTIL] 工具方法
  // ========================================

  /**
   * 十六进制颜色转RGBA格式
   * 
   * @param {string} hex - 十六进制颜色（如 '#9B59B6'）
   * @param {number} alpha - 透明度（0-1，如 0.5）
   * @returns {string} RGBA字符串（如 'rgba(155, 89, 182, 0.5)'）
   * @description
   * 将颜色选择器返回的16进制格式转换为CSS的rgba格式，支持透明度控制
   */
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * 应用所有视觉设置到DOM
   * 
   * @description
   * 从dataManager读取视觉设置，逐个应用到日记面板：
   * - 卡片透明度
   * - 主题色、文本色、面板背景色
   * - 评论者颜色
   * - 卡片背景图和遮罩
   * - 评论框样式
   */
  apply() {
    const settings = this.dataManager.getSettings().visualSettings;

    if (!settings) {
      logger.warn('[DiaryVisualData.apply] 未找到视觉设置，跳过应用');
      return;
    }

    // 应用卡片透明度
    this.applyCardOpacity(settings.cardOpacity);

    // 应用主题色（空值时移除）
    if (settings.themeColor) {
      this.applyThemeColor(settings.themeColor);
    } else {
      this.removeThemeColor();
    }

    // 应用文本颜色（空值时移除）
    if (settings.textColor) {
      this.applyTextColor(settings.textColor);
    } else {
      this.removeTextColor();
    }

    // 应用面板背景色（空值时移除）
    if (settings.panelBgColor) {
      this.applyPanelBgColor(settings.panelBgColor, settings.panelBgOpacity);
    } else {
      this.removePanelBgColor();
    }

    // 应用评论者颜色
    this.applyAuthorColors(settings.authorColors);

    // 应用卡片背景
    if (settings.background.enabled) {
      this.applyCardBackground(settings.background);
    }

    // 应用内容块样式
    if (settings.entryBlockBgColor) {
      this.applyEntryBlockStyles({
        backgroundColor: settings.entryBlockBgColor,
        opacity: settings.entryBlockOpacity
      });
    }

    // 应用评论框样式
    this.applyCommentBoxStyles(settings.commentBox);

    logger.debug('[DiaryVisualData.apply] 所有视觉设置已应用');
  }
}

