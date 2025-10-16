/**
 * 日记视觉设置管理器
 * 
 * @description
 * 管理日记面板的视觉设置，包括：
 * - 卡片透明度调整
 * - 评论者颜色自定义
 * - 卡片背景图管理（预存、切换、遮罩）
 * - 评论框样式自定义
 * 
 * @module DiaryVisualSettings
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { extension_settings } from '../../../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../../popup.js';
import { showSuccessToast, showInfoToast, showErrorToast } from './diary-toast.js';
import logger from '../../logger.js';

const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'diary';

// ========================================
// [CORE] 视觉设置管理类
// ========================================

/**
 * 日记视觉设置管理器
 * 
 * @class DiaryVisualSettings
 */
export class DiaryVisualSettings {
  /**
   * 创建视觉设置管理器
   * 
   * @param {import('./diary-data.js').DiaryDataManager} dataManager - 数据管理器
   */
  constructor(dataManager) {
    /**
     * 数据管理器引用
     * @type {import('./diary-data.js').DiaryDataManager}
     */
    this.dataManager = dataManager;

    /**
     * 面板元素引用
     * @type {HTMLElement|null}
     */
    this.panelElement = null;

    logger.info('[DiaryVisualSettings] 视觉设置管理器已创建');
  }

  // ========================================
  // [CORE] 核心方法
  // ========================================

  /**
   * 获取默认视觉设置
   * 
   * @returns {Object} 默认视觉设置对象
   */
  getDefaultVisualSettings() {
    return {
      cardOpacity: 1.0,
      themeColor: '',           // 主题色（--SmartThemeQuoteColor）
      textColor: '',            // 主要文本颜色（--SmartThemeBodyColor）
      panelBgColor: '',         // 面板背景色（--SmartThemeBlurTintColor）
      panelBgOpacity: 1.0,      // 面板背景透明度
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
   * 
   * @returns {Object} 视觉设置对象引用
   */
  ensureVisualSettings() {
    if (!extension_settings[EXT_ID][MODULE_NAME].settings.visualSettings) {
      extension_settings[EXT_ID][MODULE_NAME].settings.visualSettings = this.getDefaultVisualSettings();
    }
    return extension_settings[EXT_ID][MODULE_NAME].settings.visualSettings;
  }

  /**
   * 初始化视觉设置面板
   * 
   * @param {HTMLElement} panelElement - 日记面板元素
   */
  init(panelElement) {
    this.panelElement = panelElement;
    this.apply();
    logger.info('[DiaryVisualSettings] 视觉设置已初始化');
  }

  /**
   * 应用所有视觉设置到DOM
   * 
   * @description
   * 从数据管理器读取设置，应用到日记面板
   */
  apply() {
    const settings = this.dataManager.getSettings().visualSettings;

    if (!settings) {
      logger.warn('[DiaryVisualSettings.apply] 未找到视觉设置，跳过应用');
      return;
    }

    // 应用卡片透明度
    this.applyCardOpacity(settings.cardOpacity);

    // 应用日记主题色（空值时移除）
    if (settings.themeColor) {
      this.applyThemeColor(settings.themeColor);
    } else {
      this.removeThemeColor();
    }

    // 应用日记文本颜色（空值时移除）
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

    // 应用评论框样式
    this.applyCommentBoxStyles(settings.commentBox);

    logger.debug('[DiaryVisualSettings.apply] 所有视觉设置已应用');
  }

  /**
   * 加载设置到UI
   * 
   * @description
   * 渲染视觉设置面板的UI，绑定事件
   */
  loadUI() {
    const visualPanel = this.panelElement.querySelector('#diaryVisualPanel');
    if (!visualPanel) {
      logger.warn('[DiaryVisualSettings.loadUI] 未找到视觉设置面板');
      return;
    }

    const settings = this.dataManager.getSettings().visualSettings;

    // 渲染UI
    visualPanel.innerHTML = this.renderUI(settings);

    // 绑定事件
    this.bindEvents();

    logger.debug('[DiaryVisualSettings.loadUI] UI已加载');
  }

  /**
   * 渲染视觉设置UI
   * 
   * @param {Object} settings - 视觉设置对象
   * @returns {string} HTML字符串
   */
  renderUI(settings) {
    return `
            <div class="diary-visual-settings-content">
                <!-- 标题 -->
                <div class="diary-visual-header">
                    <h3>自定义视觉</h3>
                    <button class="diary-visual-reset-all" title="重置所有颜色设置">
                        <span class="fa-solid fa-rotate-left"></span>
                    </button>
                </div>

                <!-- 卡片透明度 -->
                <div class="diary-visual-group">
                    <div class="diary-visual-group-header">
                        <span class="fa-solid fa-droplet"></span>
                        卡片透明度
                    </div>
                    <div class="diary-visual-group-content">
                        <div class="diary-visual-slider-wrapper">
                            <input type="range" id="diaryCardOpacity" 
                                   min="0" max="100" step="1" 
                                   value="${settings.cardOpacity * 100}"
                                   class="diary-visual-slider">
                            <span class="diary-visual-slider-value">${Math.round(settings.cardOpacity * 100)}%</span>
                        </div>
                        <button class="diary-visual-reset-btn" data-setting="cardOpacity">重置</button>
                    </div>
                </div>

                <!-- 日记主题色 -->
                <div class="diary-visual-group">
                    <div class="diary-visual-group-header">
                        <span class="fa-solid fa-paint-brush"></span>
                        日记主题色
                    </div>
                    <div class="diary-visual-group-content">
                        <div class="diary-visual-color-item">
                            <label>主题色</label>
                            <input type="color" id="diaryThemeColor" 
                                   value="${settings.themeColor || '#9B59B6'}">
                            <button class="diary-visual-reset-btn" data-setting="themeColor">重置</button>
                        </div>
                        <div class="diary-visual-hint">
                            调整菜单、按钮、回复/删除按钮的强调色
                        </div>
                    </div>
                </div>

                <!-- 日记文本颜色 -->
                <div class="diary-visual-group">
                    <div class="diary-visual-group-header">
                        <span class="fa-solid fa-font"></span>
                        日记文本颜色
                    </div>
                    <div class="diary-visual-group-content">
                        <div class="diary-visual-color-item">
                            <label>文本颜色</label>
                            <input type="color" id="diaryTextColor" 
                                   value="${settings.textColor || '#FFFFFF'}">
                            <button class="diary-visual-reset-btn" data-setting="textColor">重置</button>
                        </div>
                        <div class="diary-visual-hint">
                            调整日记中所有文字和按钮文字的颜色
                        </div>
                    </div>
                </div>

                <!-- 面板背景色 -->
                <div class="diary-visual-group">
                    <div class="diary-visual-group-header">
                        <span class="fa-solid fa-fill-drip"></span>
                        面板背景色
                    </div>
                    <div class="diary-visual-group-content">
                        <div class="diary-visual-color-item">
                            <label>背景色</label>
                            <input type="color" id="diaryPanelBgColor" 
                                   value="${settings.panelBgColor || '#1A1A1A'}">
                            <button class="diary-visual-reset-btn" data-setting="panelBgColor">重置</button>
                        </div>
                        <div class="diary-visual-slider-wrapper">
                            <label>透明度</label>
                            <input type="range" id="diaryPanelBgOpacity" 
                                   min="0" max="100" step="1" 
                                   value="${settings.panelBgOpacity * 100}"
                                   class="diary-visual-slider">
                            <span class="diary-visual-slider-value">${Math.round(settings.panelBgOpacity * 100)}%</span>
                        </div>
                        <div class="diary-visual-hint">
                            调整顶部栏、所有展开面板、按钮、卡片的背景色
                        </div>
                    </div>
                </div>

                <!-- 评论者颜色 -->
                <div class="diary-visual-group">
                    <div class="diary-visual-group-header">
                        <span class="fa-solid fa-palette"></span>
                        评论者颜色
                    </div>
                    <div class="diary-visual-group-content">
                        <div class="diary-visual-color-item">
                            <label>User</label>
                            <input type="color" id="diaryColorUser" 
                                   value="${settings.authorColors.user || '#4A90E2'}">
                            <button class="diary-visual-reset-btn" data-setting="authorColors.user">重置</button>
                        </div>
                        <div class="diary-visual-color-item">
                            <label>AI</label>
                            <input type="color" id="diaryColorAI" 
                                   value="${settings.authorColors.ai || '#50C878'}">
                            <button class="diary-visual-reset-btn" data-setting="authorColors.ai">重置</button>
                        </div>
                        <div class="diary-visual-color-item">
                            <label>路人</label>
                            <input type="color" id="diaryColorPasserby" 
                                   value="${settings.authorColors.passerby || '#9B59B6'}">
                            <button class="diary-visual-reset-btn" data-setting="authorColors.passerby">重置</button>
                        </div>
                    </div>
                </div>

                <!-- 卡片背景 -->
                <div class="diary-visual-group diary-visual-collapsible collapsed">
                    <div class="diary-visual-group-header" data-collapse-target="cardBackground">
                        <span class="fa-solid fa-image"></span>
                        卡片背景
                        <span class="diary-visual-collapse-icon fa-solid fa-chevron-right"></span>
                    </div>
                    <div class="diary-visual-group-content" data-collapse-id="cardBackground">
                        <label class="diary-visual-checkbox">
                            <input type="checkbox" id="diaryBgEnabled" 
                                   ${settings.background.enabled ? 'checked' : ''}>
                            <span>启用背景图</span>
                        </label>
                        
                        <div class="diary-visual-input-group">
                            <input type="text" id="diaryBgUrl" 
                                   placeholder="输入图片链接..." 
                                   value="${settings.background.currentImageUrl || ''}">
                            <button class="diary-visual-save-btn" id="diarySaveImageBtn" title="保存到预存">
                                <span class="fa-solid fa-floppy-disk"></span>
                            </button>
                        </div>

                        <!-- 预存图片列表 -->
                        <div class="diary-visual-preset-images">
                            <div class="diary-visual-preset-header">
                                <span>预存图片 (${settings.background.savedImages.length}张)</span>
                            </div>
                            ${this.renderPresetImagesGrid(settings.background.savedImages)}
                        </div>

                        <!-- 遮罩设置 -->
                        <label class="diary-visual-checkbox">
                            <input type="checkbox" id="diaryMaskEnabled" 
                                   ${settings.background.maskEnabled ? 'checked' : ''}>
                            <span>启用遮罩</span>
                        </label>

                        <div class="diary-visual-color-item">
                            <label>遮罩颜色</label>
                            <input type="color" id="diaryMaskColor" 
                                   value="${settings.background.maskColor || '#000000'}">
                        </div>

                        <div class="diary-visual-slider-wrapper">
                            <label>遮罩透明度</label>
                            <input type="range" id="diaryMaskOpacity" 
                                   min="0" max="100" step="1" 
                                   value="${settings.background.maskOpacity * 100}"
                                   class="diary-visual-slider">
                            <span class="diary-visual-slider-value">${Math.round(settings.background.maskOpacity * 100)}%</span>
                        </div>
                    </div>
                </div>

                <!-- 评论框样式 -->
                <div class="diary-visual-group">
                    <div class="diary-visual-group-header">
                        <span class="fa-solid fa-comment"></span>
                        评论框样式
                    </div>
                    <div class="diary-visual-group-content">
                        <div class="diary-visual-color-item">
                            <label>背景色</label>
                            <input type="color" id="diaryCommentBg" 
                                   value="${settings.commentBox.backgroundColor || '#FFFFFF'}">
                            <button class="diary-visual-reset-btn" data-setting="commentBox.backgroundColor">重置</button>
                        </div>

                        <div class="diary-visual-slider-wrapper">
                            <label>透明度</label>
                            <input type="range" id="diaryCommentOpacity" 
                                   min="0" max="100" step="1" 
                                   value="${settings.commentBox.opacity * 100}"
                                   class="diary-visual-slider">
                            <span class="diary-visual-slider-value">${Math.round(settings.commentBox.opacity * 100)}%</span>
                        </div>

                        <div class="diary-visual-color-item">
                            <label>边框颜色</label>
                            <input type="color" id="diaryCommentBorder" 
                                   value="${settings.commentBox.borderColor || '#CCCCCC'}">
                            <button class="diary-visual-reset-btn" data-setting="commentBox.borderColor">重置</button>
                        </div>

                        <div class="diary-visual-color-item">
                            <label>回复边框</label>
                            <input type="color" id="diaryCommentReplyBorder" 
                                   value="${settings.commentBox.replyBorderColor || '#9B59B6'}">
                            <button class="diary-visual-reset-btn" data-setting="commentBox.replyBorderColor">重置</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
  }

  /**
   * 渲染预存图片网格
   * 
   * @param {string[]} images - 图片URL数组
   * @returns {string} HTML字符串
   */
  renderPresetImagesGrid(images) {
    if (images.length === 0) {
      return '<div class="diary-visual-preset-empty">暂无预存图片</div>';
    }

    const gridItems = images.map((url, index) => `
            <div class="diary-preset-image-item" data-url="${url}" style="background-image: url('${url}')">
                <button class="diary-preset-image-delete" title="删除">
                    <span class="fa-solid fa-trash"></span>
                </button>
            </div>
        `).join('');

    return `<div class="diary-preset-images-grid">${gridItems}</div>`;
  }

  /**
   * 绑定UI事件
   */
  bindEvents() {
    const visualPanel = this.panelElement.querySelector('#diaryVisualPanel');
    if (!visualPanel) return;

    // 卡片透明度滑块
    const opacitySlider = visualPanel.querySelector('#diaryCardOpacity');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        this.updateCardOpacity(value);
      });
    }

    // 日记主题色
    const themeColor = visualPanel.querySelector('#diaryThemeColor');
    if (themeColor) {
      themeColor.addEventListener('input', (e) => this.updateThemeColor(e.target.value));
    }

    // 日记文本颜色
    const textColor = visualPanel.querySelector('#diaryTextColor');
    if (textColor) {
      textColor.addEventListener('input', (e) => this.updateTextColor(e.target.value));
    }

    // 面板背景色
    const panelBgColor = visualPanel.querySelector('#diaryPanelBgColor');
    if (panelBgColor) {
      panelBgColor.addEventListener('input', (e) => this.updatePanelBgColor(e.target.value));
    }

    // 面板背景透明度
    const panelBgOpacity = visualPanel.querySelector('#diaryPanelBgOpacity');
    if (panelBgOpacity) {
      panelBgOpacity.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        this.updatePanelBgOpacity(value);
      });
    }

    // 评论者颜色
    const userColor = visualPanel.querySelector('#diaryColorUser');
    const aiColor = visualPanel.querySelector('#diaryColorAI');
    const passerbyColor = visualPanel.querySelector('#diaryColorPasserby');

    if (userColor) userColor.addEventListener('input', (e) => this.updateAuthorColor('user', e.target.value));
    if (aiColor) aiColor.addEventListener('input', (e) => this.updateAuthorColor('ai', e.target.value));
    if (passerbyColor) passerbyColor.addEventListener('input', (e) => this.updateAuthorColor('passerby', e.target.value));

    // 背景启用开关
    const bgEnabled = visualPanel.querySelector('#diaryBgEnabled');
    if (bgEnabled) {
      bgEnabled.addEventListener('change', (e) => this.toggleBackground(e.target.checked));
    }

    // 背景URL输入
    const bgUrl = visualPanel.querySelector('#diaryBgUrl');
    if (bgUrl) {
      bgUrl.addEventListener('input', (e) => this.updateBackgroundUrl(e.target.value));
    }

    // 保存图片按钮
    const saveImageBtn = visualPanel.querySelector('#diarySaveImageBtn');
    if (saveImageBtn) {
      saveImageBtn.addEventListener('click', () => this.saveImageToPreset());
    }

    // 预存图片点击（应用）和删除
    const imageItems = visualPanel.querySelectorAll('.diary-preset-image-item');
    imageItems.forEach(item => {
      const url = item.dataset.url;

      // 点击应用
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.diary-preset-image-delete')) {
          this.applyPresetImage(url);
        }
      });

      // 删除按钮
      const deleteBtn = item.querySelector('.diary-preset-image-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deletePresetImage(url);
        });
      }
    });

    // 遮罩启用开关
    const maskEnabled = visualPanel.querySelector('#diaryMaskEnabled');
    if (maskEnabled) {
      maskEnabled.addEventListener('change', (e) => this.toggleMask(e.target.checked));
    }

    // 遮罩颜色
    const maskColor = visualPanel.querySelector('#diaryMaskColor');
    if (maskColor) {
      maskColor.addEventListener('input', (e) => this.updateMaskColor(e.target.value));
    }

    // 遮罩透明度
    const maskOpacity = visualPanel.querySelector('#diaryMaskOpacity');
    if (maskOpacity) {
      maskOpacity.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        this.updateMaskOpacity(value);
      });
    }

    // 评论框背景色
    const commentBg = visualPanel.querySelector('#diaryCommentBg');
    if (commentBg) {
      commentBg.addEventListener('input', (e) => this.updateCommentBoxBg(e.target.value));
    }

    // 评论框透明度
    const commentOpacity = visualPanel.querySelector('#diaryCommentOpacity');
    if (commentOpacity) {
      commentOpacity.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        this.updateCommentBoxOpacity(value);
      });
    }

    // 评论框边框
    const commentBorder = visualPanel.querySelector('#diaryCommentBorder');
    if (commentBorder) {
      commentBorder.addEventListener('input', (e) => this.updateCommentBoxBorder(e.target.value));
    }

    // 回复边框
    const replyBorder = visualPanel.querySelector('#diaryCommentReplyBorder');
    if (replyBorder) {
      replyBorder.addEventListener('input', (e) => this.updateCommentReplyBorder(e.target.value));
    }

    // 重置按钮
    const resetButtons = visualPanel.querySelectorAll('.diary-visual-reset-btn');
    resetButtons.forEach(btn => {
      const setting = btn.dataset.setting;
      btn.addEventListener('click', () => this.resetSetting(setting));
    });

    // 全部重置按钮
    const resetAllBtn = visualPanel.querySelector('.diary-visual-reset-all');
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', () => this.resetAll());
    }

    // 折叠功能
    const collapseHeaders = visualPanel.querySelectorAll('.diary-visual-group-header[data-collapse-target]');
    collapseHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const target = header.dataset.collapseTarget;
        const content = visualPanel.querySelector(`[data-collapse-id="${target}"]`);
        const icon = header.querySelector('.diary-visual-collapse-icon');
        const group = header.closest('.diary-visual-group');

        if (content && group) {
          group.classList.toggle('collapsed');
          if (icon) {
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-right');
          }
        }
      });
    });

    logger.debug('[DiaryVisualSettings.bindEvents] 事件已绑定');
  }

  // ========================================
  // [UPDATE] 更新设置方法
  // ========================================

  /**
   * 更新卡片透明度
   * 
   * @param {number} opacity - 透明度（0-1）
   */
  updateCardOpacity(opacity) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.cardOpacity = opacity;

    // 使用 updateSettings 保存（会自动调用 saveSettingsDebounced）
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyCardOpacity(opacity);

    // 更新滑块显示
    const valueSpan = this.panelElement.querySelector('#diaryCardOpacity + .diary-visual-slider-value');
    if (valueSpan) {
      valueSpan.textContent = `${Math.round(opacity * 100)}%`;
    }

    logger.debug('[DiaryVisualSettings.updateCardOpacity] 卡片透明度已更新:', opacity);
  }

  /**
   * 更新日记主题色
   * 
   * @param {string} color - 颜色值
   */
  updateThemeColor(color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.themeColor = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyThemeColor(color);

    logger.debug('[DiaryVisualSettings.updateThemeColor] 主题色已更新:', color);
  }

  /**
   * 更新日记文本颜色
   * 
   * @param {string} color - 颜色值
   */
  updateTextColor(color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.textColor = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyTextColor(color);

    logger.debug('[DiaryVisualSettings.updateTextColor] 文本颜色已更新:', color);
  }

  /**
   * 更新面板背景色
   * 
   * @param {string} color - 颜色值
   */
  updatePanelBgColor(color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.panelBgColor = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyPanelBgColor(color);

    logger.debug('[DiaryVisualSettings.updatePanelBgColor] 面板背景色已更新:', color);
  }

  /**
   * 更新面板背景透明度
   * 
   * @param {number} opacity - 透明度（0-1）
   */
  updatePanelBgOpacity(opacity) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.panelBgOpacity = opacity;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    // 重新应用背景色（使用新透明度）
    const settings = this.dataManager.getSettings();
    if (settings.visualSettings.panelBgColor) {
      this.applyPanelBgColor(settings.visualSettings.panelBgColor, opacity);
    }

    // 更新滑块显示
    const valueSpan = this.panelElement.querySelector('#diaryPanelBgOpacity + .diary-visual-slider-value');
    if (valueSpan) {
      valueSpan.textContent = `${Math.round(opacity * 100)}%`;
    }

    logger.debug('[DiaryVisualSettings.updatePanelBgOpacity] 面板背景透明度已更新:', opacity);
  }

  /**
   * 更新评论者颜色
   * 
   * @param {string} type - 类型（user/ai/passerby）
   * @param {string} color - 颜色值
   */
  updateAuthorColor(type, color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.authorColors[type] = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    const settings = this.dataManager.getSettings();
    this.applyAuthorColors(settings.visualSettings.authorColors);

    logger.debug(`[DiaryVisualSettings.updateAuthorColor] ${type}颜色已更新:`, color);
  }

  /**
   * 切换背景启用状态
   * 
   * @param {boolean} enabled - 是否启用
   */
  toggleBackground(enabled) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.background.enabled = enabled;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    if (enabled) {
      this.applyCardBackground(visualSettings.background);
      showInfoToast('背景图已启用');
    } else {
      this.removeCardBackground();
      showInfoToast('背景图已禁用');
    }

    logger.info('[DiaryVisualSettings.toggleBackground] 背景启用状态:', enabled);
  }

  /**
   * 更新背景URL
   * 
   * @param {string} url - 图片URL
   */
  updateBackgroundUrl(url) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.background.currentImageUrl = url;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    if (visualSettings.background.enabled && url) {
      this.applyCardBackground(visualSettings.background);
    }

    logger.debug('[DiaryVisualSettings.updateBackgroundUrl] 背景URL已更新:', url);
  }

  /**
   * 保存图片到预存列表
   */
  async saveImageToPreset() {
    const urlInput = this.panelElement.querySelector('#diaryBgUrl');
    if (!urlInput) return;

    const url = /** @type {HTMLInputElement} */(urlInput).value.trim();
    if (!url) {
      showErrorToast('请输入图片链接');
      return;
    }

    const visualSettings = this.ensureVisualSettings();

    // 检查是否已存在
    if (visualSettings.background.savedImages.includes(url)) {
      showErrorToast('该图片已存在预存列表');
      return;
    }

    // 添加到预存列表
    visualSettings.background.savedImages.push(url);

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    // 刷新UI
    this.loadUI();

    showSuccessToast('图片已保存到预存列表');
    logger.info('[DiaryVisualSettings.saveImageToPreset] 图片已保存:', url);
  }

  /**
   * 应用预存图片
   * 
   * @param {string} url - 图片URL
   */
  applyPresetImage(url) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.background.currentImageUrl = url;
    visualSettings.background.enabled = true;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyCardBackground(visualSettings.background);

    // 更新输入框
    const urlInput = this.panelElement.querySelector('#diaryBgUrl');
    if (urlInput) {
            /** @type {HTMLInputElement} */(urlInput).value = url;
    }

    // 更新启用开关
    const bgEnabled = this.panelElement.querySelector('#diaryBgEnabled');
    if (bgEnabled) {
            /** @type {HTMLInputElement} */(bgEnabled).checked = true;
    }

    showSuccessToast('背景图已应用');
    logger.info('[DiaryVisualSettings.applyPresetImage] 预存图片已应用:', url);
  }

  /**
   * 删除预存图片
   * 
   * @param {string} url - 图片URL
   */
  async deletePresetImage(url) {
    const confirmed = await callGenericPopup(
      `确认删除这张预存图片吗？\n\n${url.substring(0, 60)}...`,
      POPUP_TYPE.CONFIRM
    );

    if (!confirmed) return;

    const visualSettings = this.ensureVisualSettings();
    const index = visualSettings.background.savedImages.indexOf(url);

    if (index !== -1) {
      visualSettings.background.savedImages.splice(index, 1);

      // 如果删除的是当前使用的图片，清空当前URL
      if (visualSettings.background.currentImageUrl === url) {
        visualSettings.background.currentImageUrl = '';
        this.removeCardBackground();
      }

      // 使用 updateSettings 保存
      this.dataManager.updateSettings({ visualSettings: visualSettings });

      // 刷新UI
      this.loadUI();

      showSuccessToast('预存图片已删除');
      logger.info('[DiaryVisualSettings.deletePresetImage] 预存图片已删除:', url);
    }
  }

  /**
   * 切换遮罩启用状态
   * 
   * @param {boolean} enabled - 是否启用
   */
  toggleMask(enabled) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.background.maskEnabled = enabled;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    if (visualSettings.background.enabled) {
      this.applyCardBackground(visualSettings.background);
    }

    logger.debug('[DiaryVisualSettings.toggleMask] 遮罩启用状态:', enabled);
  }

  /**
   * 更新遮罩颜色
   * 
   * @param {string} color - 颜色值
   */
  updateMaskColor(color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.background.maskColor = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    if (visualSettings.background.enabled && visualSettings.background.maskEnabled) {
      this.applyCardBackground(visualSettings.background);
    }

    logger.debug('[DiaryVisualSettings.updateMaskColor] 遮罩颜色已更新:', color);
  }

  /**
   * 更新遮罩透明度
   * 
   * @param {number} opacity - 透明度（0-1）
   */
  updateMaskOpacity(opacity) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.background.maskOpacity = opacity;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    if (visualSettings.background.enabled && visualSettings.background.maskEnabled) {
      this.applyCardBackground(visualSettings.background);
    }

    // 更新滑块显示
    const valueSpan = this.panelElement.querySelector('#diaryMaskOpacity + .diary-visual-slider-value');
    if (valueSpan) {
      valueSpan.textContent = `${Math.round(opacity * 100)}%`;
    }

    logger.debug('[DiaryVisualSettings.updateMaskOpacity] 遮罩透明度已更新:', opacity);
  }

  /**
   * 更新评论框背景色
   * 
   * @param {string} color - 颜色值
   */
  updateCommentBoxBg(color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.commentBox.backgroundColor = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyCommentBoxStyles(visualSettings.commentBox);

    logger.debug('[DiaryVisualSettings.updateCommentBoxBg] 评论框背景色已更新:', color);
  }

  /**
   * 更新评论框透明度
   * 
   * @param {number} opacity - 透明度（0-1）
   */
  updateCommentBoxOpacity(opacity) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.commentBox.opacity = opacity;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyCommentBoxStyles(visualSettings.commentBox);

    // 更新滑块显示
    const valueSpan = this.panelElement.querySelector('#diaryCommentOpacity + .diary-visual-slider-value');
    if (valueSpan) {
      valueSpan.textContent = `${Math.round(opacity * 100)}%`;
    }

    logger.debug('[DiaryVisualSettings.updateCommentBoxOpacity] 评论框透明度已更新:', opacity);
  }

  /**
   * 更新评论框边框颜色
   * 
   * @param {string} color - 颜色值
   */
  updateCommentBoxBorder(color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.commentBox.borderColor = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyCommentBoxStyles(visualSettings.commentBox);

    logger.debug('[DiaryVisualSettings.updateCommentBoxBorder] 评论框边框已更新:', color);
  }

  /**
   * 更新回复边框颜色
   * 
   * @param {string} color - 颜色值
   */
  updateCommentReplyBorder(color) {
    const visualSettings = this.ensureVisualSettings();
    visualSettings.commentBox.replyBorderColor = color;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    this.applyCommentBoxStyles(visualSettings.commentBox);

    logger.debug('[DiaryVisualSettings.updateCommentReplyBorder] 回复边框已更新:', color);
  }

  // ========================================
  // [APPLY] 应用样式方法
  // ========================================

  /**
   * 应用卡片透明度
   * 
   * @param {number} opacity - 透明度（0-1）
   */
  applyCardOpacity(opacity) {
    const styleId = 'diary-visual-opacity-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    // 调整背景的透明度，不是整个元素的opacity
    // opacity=1 时：100%背景色，0%透明（完全不透明）
    // opacity=0 时：0%背景色，100%透明（完全透明）
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

    logger.debug('[DiaryVisualSettings.applyCardOpacity] 卡片透明度已应用:', opacity);
  }

  /**
   * 应用日记主题色
   * 
   * @param {string} color - 颜色值
   */
  applyThemeColor(color) {
    const styleId = 'diary-visual-theme-color-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    // 只作用于日记面板，覆盖 --SmartThemeQuoteColor
    style.textContent = `
            .diary-panel {
                --SmartThemeQuoteColor: ${color} !important;
            }
        `;

    logger.debug('[DiaryVisualSettings.applyThemeColor] 主题色已应用:', color);
  }

  /**
   * 应用日记文本颜色
   * 
   * @param {string} color - 颜色值
   */
  applyTextColor(color) {
    const styleId = 'diary-visual-text-color-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    // 只作用于日记面板，覆盖 --SmartThemeBodyColor
    style.textContent = `
            .diary-panel {
                --SmartThemeBodyColor: ${color} !important;
            }
        `;

    logger.debug('[DiaryVisualSettings.applyTextColor] 文本颜色已应用:', color);
  }

  /**
   * 应用面板背景色
   * 
   * @param {string} color - 颜色值
   * @param {number} opacity - 透明度（0-1）
   */
  applyPanelBgColor(color, opacity = 1.0) {
    const styleId = 'diary-visual-panel-bg-color-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    // 转换为RGBA
    const colorWithOpacity = this.hexToRgba(color, opacity);

    // 只作用于日记面板，覆盖 --SmartThemeBlurTintColor
    style.textContent = `
            .diary-panel {
                --SmartThemeBlurTintColor: ${colorWithOpacity} !important;
            }
        `;

    logger.debug('[DiaryVisualSettings.applyPanelBgColor] 面板背景色已应用:', color, 'opacity:', opacity);
  }

  /**
   * 移除日记主题色（恢复默认）
   */
  removeThemeColor() {
    const styleId = 'diary-visual-theme-color-style';
    const style = document.getElementById(styleId);
    if (style) {
      style.textContent = '';
    }
    logger.debug('[DiaryVisualSettings.removeThemeColor] 主题色已移除，恢复官方默认');
  }

  /**
   * 移除日记文本颜色（恢复默认）
   */
  removeTextColor() {
    const styleId = 'diary-visual-text-color-style';
    const style = document.getElementById(styleId);
    if (style) {
      style.textContent = '';
    }
    logger.debug('[DiaryVisualSettings.removeTextColor] 文本颜色已移除，恢复官方默认');
  }

  /**
   * 移除面板背景色（恢复默认）
   */
  removePanelBgColor() {
    const styleId = 'diary-visual-panel-bg-color-style';
    const style = document.getElementById(styleId);
    if (style) {
      style.textContent = '';
    }
    logger.debug('[DiaryVisualSettings.removePanelBgColor] 面板背景色已移除，恢复官方默认');
  }

  /**
   * 应用评论者颜色
   * 
   * @param {Object} colors - 颜色配置对象
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

    if (colors.user) {
      css += `.comment-author-user { color: ${colors.user} !important; }\n`;
    }

    if (colors.ai) {
      css += `.comment-author-ai { color: ${colors.ai} !important; }\n`;
    }

    if (colors.passerby) {
      css += `.comment-author-passerby { color: ${colors.passerby} !important; }\n`;
    }

    style.textContent = css;

    logger.debug('[DiaryVisualSettings.applyAuthorColors] 评论者颜色已应用');
  }

  /**
   * 应用卡片背景
   * 
   * @param {Object} bgSettings - 背景设置对象
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
            .diary-card .diary-content {
                background-image: url('${bgSettings.currentImageUrl}') !important;
                background-size: cover !important;
                background-position: center !important;
                background-repeat: no-repeat !important;
        `;

    // 如果启用遮罩
    if (bgSettings.maskEnabled) {
      const maskRgba = this.hexToRgba(bgSettings.maskColor, bgSettings.maskOpacity);
      css += `
                position: relative !important;
            }
            .diary-card .diary-content::before {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                background: ${maskRgba} !important;
                pointer-events: none !important;
                z-index: 0 !important;
            }
            `;
    } else {
      css += `}\n`;
    }

    style.textContent = css;

    logger.debug('[DiaryVisualSettings.applyCardBackground] 卡片背景已应用');
  }

  /**
   * 移除卡片背景
   */
  removeCardBackground() {
    const styleId = 'diary-visual-background-style';
    const style = document.getElementById(styleId);
    if (style) {
      style.textContent = '';
    }

    logger.debug('[DiaryVisualSettings.removeCardBackground] 卡片背景已移除');
  }

  /**
   * 应用评论框样式
   * 
   * @param {Object} styles - 样式配置对象
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

    // 背景色和透明度
    if (styles.backgroundColor) {
      const bgRgba = this.hexToRgba(styles.backgroundColor, styles.opacity);
      css += `.comment-item { background: ${bgRgba} !important; }\n`;
    } else if (styles.opacity !== 1.0) {
      // 只有透明度变化
      css += `.comment-item { opacity: ${styles.opacity} !important; }\n`;
    }

    // 边框颜色
    if (styles.borderColor) {
      css += `.comment-item { border-color: ${styles.borderColor} !important; }\n`;
    }

    // 回复边框颜色
    if (styles.replyBorderColor) {
      css += `.comment-replies { border-left-color: ${styles.replyBorderColor} !important; }\n`;
    }

    style.textContent = css;

    logger.debug('[DiaryVisualSettings.applyCommentBoxStyles] 评论框样式已应用');
  }

  // ========================================
  // [RESET] 重置方法
  // ========================================

  /**
   * 重置单个设置
   * 
   * @param {string} settingKey - 设置键（支持点号分隔）
   */
  async resetSetting(settingKey) {
    const visualSettings = this.ensureVisualSettings();
    const keys = settingKey.split('.');

    // 获取默认值
    const defaults = {
      cardOpacity: 1.0,
      themeColor: '',
      textColor: '',
      panelBgColor: '',
      panelBgOpacity: 1.0,
      'authorColors.user': '',
      'authorColors.ai': '',
      'authorColors.passerby': '',
      'commentBox.backgroundColor': '',
      'commentBox.borderColor': '',
      'commentBox.replyBorderColor': ''
    };

    const defaultValue = defaults[settingKey];

    // 设置为默认值
    if (keys.length === 1) {
      visualSettings[keys[0]] = defaultValue;
    } else if (keys.length === 2) {
      visualSettings[keys[0]][keys[1]] = defaultValue;
    }

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: visualSettings });

    // 重新应用
    this.apply();

    // 刷新UI
    this.loadUI();

    showSuccessToast('设置已重置');
    logger.info('[DiaryVisualSettings.resetSetting] 设置已重置:', settingKey);
  }

  /**
   * 重置所有设置
   */
  async resetAll() {
    const confirmed = await callGenericPopup(
      '确认重置所有视觉设置为默认值吗？',
      POPUP_TYPE.CONFIRM
    );

    if (!confirmed) return;

    const visualSettings = this.ensureVisualSettings();
    const savedImages = visualSettings.background.savedImages || [];

    // 重置为默认值（保留预存图片）
    const newSettings = this.getDefaultVisualSettings();
    newSettings.background.savedImages = savedImages;

    extension_settings[EXT_ID][MODULE_NAME].settings.visualSettings = newSettings;

    // 使用 updateSettings 保存
    this.dataManager.updateSettings({ visualSettings: newSettings });

    // 重新应用
    this.apply();

    // 刷新UI
    this.loadUI();

    showSuccessToast('所有设置已重置');
    logger.info('[DiaryVisualSettings.resetAll] 所有设置已重置');
  }

  // ========================================
  // [UTIL] 工具方法
  // ========================================

  /**
   * 十六进制颜色转RGBA
   * 
   * @param {string} hex - 十六进制颜色
   * @param {number} alpha - 透明度（0-1）
   * @returns {string} RGBA字符串
   */
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
