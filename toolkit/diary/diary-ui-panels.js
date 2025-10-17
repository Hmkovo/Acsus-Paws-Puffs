/**
 * 日记UI - 面板管理模块
 * 
 * @description
 * 负责管理日记面板中的各种展开式面板：
 * - 搜索栏
 * - 设置面板
 * - 预设面板
 * - 视觉设置面板
 * - 筛选面板（周/月/日期）
 * 
 * @module DiaryUIPanels
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from './diary-toast.js';

// ========================================
// [CORE] 面板管理类
// ========================================

/**
 * 日记面板管理器
 * 
 * @class DiaryUIPanels
 */
export class DiaryUIPanels {
  /**
   * 创建面板管理器
   * 
   * @param {HTMLElement} panelElement - 日记面板元素
   * @param {Object} options - 配置选项
   * @param {Object} options.dataManager - 数据管理器
   * @param {Object} options.filter - 筛选状态对象（引用）
   * @param {Object} options.filterHelper - 筛选辅助对象
   * @param {Object} options.presetUI - 预设UI管理器
   * @param {Object} options.visualSettings - 视觉设置管理器
   * @param {Function} options.refreshCallback - 刷新日记的回调函数
   */
  constructor(panelElement, options) {
    this.panelElement = panelElement;
    this.dataManager = options.dataManager;
    this.filter = options.filter;
    this.filterHelper = options.filterHelper;
    this.presetUI = options.presetUI;
    this.visualSettings = options.visualSettings;
    this.refreshCallback = options.refreshCallback;
  }

  // ========================================
  // [CORE] 面板切换（重构后，消除重复）
  // ========================================

  /**
   * 关闭所有面板（除了指定的面板）
   * 
   * @param {string|null} exceptPanel - 要保持打开的面板名称
   * @description
   * 统一的面板关闭逻辑，消除代码重复
   */
  closeAllPanelsExcept(exceptPanel = null) {
    const panels = {
      search: '#diarySearchBar',
      settings: '#diarySettingsPanel',
      visual: '#diaryVisualPanel'
    };

    const buttons = {
      search: '#diarySearchToggleBtn',
      settings: '#diarySettingsBtn',
      visual: '#diaryVisualBtn',
      preset: '#diaryPresetBtn'
    };

    // 关闭面板
    Object.keys(panels).forEach(name => {
      if (name !== exceptPanel) {
        const panel = this.panelElement.querySelector(panels[name]);
        if (panel) panel.classList.remove('active');
      }
    });

    // 关闭按钮
    Object.keys(buttons).forEach(name => {
      if (name !== exceptPanel) {
        const btn = this.panelElement.querySelector(buttons[name]);
        if (btn) btn.classList.remove('active');
      }
    });

    // 关闭筛选面板
    if (this.filterHelper) {
      this.filterHelper.closeAllFilterPanels();
    }

    // 特殊处理：预设面板
    if (exceptPanel !== 'preset' && this.presetUI) {
      this.presetUI.close();
    }

    logger.debug('[DiaryUIPanels.closeAllPanelsExcept] 已关闭所有面板，除了:', exceptPanel || '无');
  }

  /**
   * 切换搜索栏显示/隐藏
   * 
   * @param {Object} filter - 筛选状态对象（引用）
   */
  toggleSearchBar(filter) {
    const searchBar = this.panelElement.querySelector('#diarySearchBar');
    const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
    const searchInput = this.panelElement.querySelector('#diarySearchInput');

    if (!searchBar || !searchToggleBtn) return;

    const isActive = searchBar.classList.contains('active');

    if (isActive) {
      // 关闭搜索栏
      searchBar.classList.remove('active');
      searchToggleBtn.classList.remove('active');

      // 清空搜索内容并刷新
      if (searchInput) {
                /** @type {HTMLInputElement} */ (searchInput).value = '';
        filter.searchText = '';
        this.refreshCallback();
      }

      logger.debug('[DiaryUIPanels.toggleSearchBar] 搜索栏已关闭');
    } else {
      // 打开搜索栏前，先关闭其他面板
      this.closeAllPanelsExcept('search');

      // 打开搜索栏
      searchBar.classList.add('active');
      searchToggleBtn.classList.add('active');

      // 自动聚焦到搜索框
      setTimeout(() => {
        if (searchInput) {
                    /** @type {HTMLInputElement} */ (searchInput).focus();
        }
      }, 300);

      logger.debug('[DiaryUIPanels.toggleSearchBar] 搜索栏已打开');
    }
  }

  /**
   * 切换预设面板显示/隐藏
   */
  togglePresetPanel() {
    if (!this.presetUI) return;

    const presetBtn = this.panelElement.querySelector('#diaryPresetBtn');
    const isOpen = this.presetUI.isOpen;

    if (isOpen) {
      // 关闭预设面板
      this.presetUI.close();
      if (presetBtn) presetBtn.classList.remove('active');

      logger.debug('[DiaryUIPanels.togglePresetPanel] 预设面板已关闭');
    } else {
      // 打开预设面板前，先关闭其他面板
      this.closeAllPanelsExcept('preset');

      // 打开预设面板
      this.presetUI.open();
      if (presetBtn) presetBtn.classList.add('active');

      logger.debug('[DiaryUIPanels.togglePresetPanel] 预设面板已打开');
    }
  }

  /**
   * 切换设置面板显示/隐藏
   */
  toggleSettingsPanel() {
    const settingsPanel = this.panelElement.querySelector('#diarySettingsPanel');
    const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');

    if (!settingsPanel || !settingsBtn) return;

    const isActive = settingsPanel.classList.contains('active');

    if (isActive) {
      // 关闭设置面板
      settingsPanel.classList.remove('active');
      settingsBtn.classList.remove('active');

      logger.debug('[DiaryUIPanels.toggleSettingsPanel] 设置面板已关闭');
    } else {
      // 打开设置面板前，先关闭其他面板
      this.closeAllPanelsExcept('settings');

      // 打开设置面板
      settingsPanel.classList.add('active');
      settingsBtn.classList.add('active');

      // 加载当前设置到UI
      this.loadSettingsToPanel();

      logger.debug('[DiaryUIPanels.toggleSettingsPanel] 设置面板已打开');
    }
  }

  /**
   * 切换视觉设置面板显示/隐藏
   */
  toggleVisualPanel() {
    const visualPanel = this.panelElement.querySelector('#diaryVisualPanel');
    const visualBtn = this.panelElement.querySelector('#diaryVisualBtn');

    if (!visualPanel || !visualBtn) return;

    const isActive = visualPanel.classList.contains('active');

    if (isActive) {
      // 关闭视觉面板（设置已在修改时自动保存）
      visualPanel.classList.remove('active');
      visualBtn.classList.remove('active');

      logger.debug('[DiaryUIPanels.toggleVisualPanel] 视觉面板已关闭');
    } else {
      // 打开视觉面板前，先关闭其他面板
      this.closeAllPanelsExcept('visual');

      // 打开视觉面板
      visualPanel.classList.add('active');
      visualBtn.classList.add('active');

      // 加载视觉设置UI
      if (this.visualSettings) {
        this.visualSettings.loadUI();
      }

      logger.debug('[DiaryUIPanels.toggleVisualPanel] 视觉面板已打开');
    }
  }

  // ========================================
  // [FUNC] 设置面板管理
  // ========================================

  /**
   * 加载设置到面板
   */
  loadSettingsToPanel() {
    const settings = this.dataManager.getSettings();

    // 用户设定
    const personaDescCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryIncludePersonaDescription'));

    // 角色信息
    const charDescCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryIncludeCharDescription'));
    const charPersonalityCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryIncludeCharPersonality'));
    const charScenarioCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryIncludeCharScenario'));

    // 世界书
    const worldInfoCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryIncludeWorldInfo'));

    // 最近对话
    const recentChatCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryIncludeRecentChat'));
    const recentChatCountInput = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryRecentChatCount'));

    // 历史日记
    const historyDiariesCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryIncludeHistoryDiaries'));
    const historyDiaryCountInput = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryHistoryDiaryCount'));

    // 评论设置
    const disableCharacterCommentCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryDisableCharacterCommentCheckbox'));
    const allowPasserbyCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryAllowPasserbyCheckbox'));
    const passerbyCommentMinInput = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryPasserbyCommentMin'));
    const passerbyCommentMaxInput = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diaryPasserbyCommentMax'));
    const passerbyPersonalitySelect = /** @type {HTMLSelectElement} */ (this.panelElement.querySelector('#diaryPasserbyPersonalitySelect'));

    // 交互设置
    const skipDeleteConfirmCheckbox = /** @type {HTMLInputElement} */ (this.panelElement.querySelector('#diarySkipDeleteConfirm'));

    // 赋值
    if (personaDescCheckbox) personaDescCheckbox.checked = settings.includePersonaDescription;
    if (charDescCheckbox) charDescCheckbox.checked = settings.includeCharDescription;
    if (charPersonalityCheckbox) charPersonalityCheckbox.checked = settings.includeCharPersonality;
    if (charScenarioCheckbox) charScenarioCheckbox.checked = settings.includeCharScenario;
    if (worldInfoCheckbox) worldInfoCheckbox.checked = settings.includeWorldInfo;
    if (recentChatCheckbox) recentChatCheckbox.checked = settings.includeRecentChat;
    if (recentChatCountInput) recentChatCountInput.value = settings.recentChatCount.toString();
    if (historyDiariesCheckbox) historyDiariesCheckbox.checked = settings.includeHistoryDiaries;
    if (historyDiaryCountInput) historyDiaryCountInput.value = settings.historyDiaryCount.toString();
    // 注意：复选框是"关闭"开关，所以需要反转
    if (disableCharacterCommentCheckbox) disableCharacterCommentCheckbox.checked = !settings.allowCharacterComment;
    if (allowPasserbyCheckbox) allowPasserbyCheckbox.checked = settings.allowPasserbyComments;
    if (passerbyCommentMinInput) passerbyCommentMinInput.value = settings.passerbyCommentMin.toString();
    if (passerbyCommentMaxInput) passerbyCommentMaxInput.value = settings.passerbyCommentMax.toString();
    if (passerbyPersonalitySelect) passerbyPersonalitySelect.value = settings.passerbyPersonality;
    if (skipDeleteConfirmCheckbox) skipDeleteConfirmCheckbox.checked = settings.skipDeleteConfirm;

    logger.debug('[DiaryUIPanels.loadSettingsToPanel] 设置已加载到面板');
  }

  /**
   * 绑定设置面板事件（实时保存）
   */
  bindSettingsPanelEvents() {
    // 用户设定勾选
    const personaDescCheckbox = this.panelElement.querySelector('#diaryIncludePersonaDescription');

    // 角色信息勾选
    const charDescCheckbox = this.panelElement.querySelector('#diaryIncludeCharDescription');
    const charPersonalityCheckbox = this.panelElement.querySelector('#diaryIncludeCharPersonality');
    const charScenarioCheckbox = this.panelElement.querySelector('#diaryIncludeCharScenario');

    // 世界书勾选
    const worldInfoCheckbox = this.panelElement.querySelector('#diaryIncludeWorldInfo');

    // 最近对话勾选和数量
    const recentChatCheckbox = this.panelElement.querySelector('#diaryIncludeRecentChat');
    const recentChatCountInput = this.panelElement.querySelector('#diaryRecentChatCount');

    // 历史日记勾选和数量
    const historyDiariesCheckbox = this.panelElement.querySelector('#diaryIncludeHistoryDiaries');
    const historyDiaryCountInput = this.panelElement.querySelector('#diaryHistoryDiaryCount');

    // 评论设置
    const disableCharacterCommentCheckbox = this.panelElement.querySelector('#diaryDisableCharacterCommentCheckbox');
    const allowPasserbyCheckbox = this.panelElement.querySelector('#diaryAllowPasserbyCheckbox');
    const passerbyCommentMinInput = this.panelElement.querySelector('#diaryPasserbyCommentMin');
    const passerbyCommentMaxInput = this.panelElement.querySelector('#diaryPasserbyCommentMax');
    const passerbyPersonalitySelect = this.panelElement.querySelector('#diaryPasserbyPersonalitySelect');

    // 交互设置
    const skipDeleteConfirmCheckbox = this.panelElement.querySelector('#diarySkipDeleteConfirm');

    // 绑定事件
    if (personaDescCheckbox) {
      personaDescCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ includePersonaDescription: /** @type {HTMLInputElement} */(personaDescCheckbox).checked });
      });
    }

    if (charDescCheckbox) {
      charDescCheckbox.addEventListener('change', () => {
        const checked = /** @type {HTMLInputElement} */(charDescCheckbox).checked;
        this.dataManager.updateSettings({ includeCharDescription: checked });
        this.syncContextPresetState('charDescription', checked);
      });
    }

    if (charPersonalityCheckbox) {
      charPersonalityCheckbox.addEventListener('change', () => {
        const checked = /** @type {HTMLInputElement} */(charPersonalityCheckbox).checked;
        this.dataManager.updateSettings({ includeCharPersonality: checked });
        this.syncContextPresetState('charPersonality', checked);
      });
    }

    if (charScenarioCheckbox) {
      charScenarioCheckbox.addEventListener('change', () => {
        const checked = /** @type {HTMLInputElement} */(charScenarioCheckbox).checked;
        this.dataManager.updateSettings({ includeCharScenario: checked });
        this.syncContextPresetState('charScenario', checked);
      });
    }

    if (worldInfoCheckbox) {
      worldInfoCheckbox.addEventListener('change', () => {
        const checked = /** @type {HTMLInputElement} */(worldInfoCheckbox).checked;
        this.dataManager.updateSettings({ includeWorldInfo: checked });
        this.syncContextPresetState('worldInfo', checked);
      });
    }

    if (recentChatCheckbox) {
      recentChatCheckbox.addEventListener('change', () => {
        const checked = /** @type {HTMLInputElement} */(recentChatCheckbox).checked;
        this.dataManager.updateSettings({ includeRecentChat: checked });
        this.syncContextPresetState('recentChat', checked);
      });
    }

    if (recentChatCountInput) {
      recentChatCountInput.addEventListener('change', () => {
        const value = parseInt(/** @type {HTMLInputElement} */(recentChatCountInput).value);
        if (value >= 1 && value <= 20) {
          this.dataManager.updateSettings({ recentChatCount: value });
        }
      });
    }

    if (historyDiariesCheckbox) {
      historyDiariesCheckbox.addEventListener('change', () => {
        const checked = /** @type {HTMLInputElement} */(historyDiariesCheckbox).checked;
        this.dataManager.updateSettings({ includeHistoryDiaries: checked });
        this.syncContextPresetState('historyDiaries', checked);
      });
    }

    if (historyDiaryCountInput) {
      historyDiaryCountInput.addEventListener('change', () => {
        const value = parseInt(/** @type {HTMLInputElement} */(historyDiaryCountInput).value);
        if (value >= 1 && value <= 10) {
          this.dataManager.updateSettings({ historyDiaryCount: value });
        }
      });
    }

    if (disableCharacterCommentCheckbox) {
      disableCharacterCommentCheckbox.addEventListener('change', () => {
        // 注意：复选框是"关闭"开关，所以需要反转
        const isDisabled = /** @type {HTMLInputElement} */(disableCharacterCommentCheckbox).checked;
        this.dataManager.updateSettings({ allowCharacterComment: !isDisabled });
        logger.info('[DiaryUIPanels] 角色评论设置已更新:', !isDisabled ? '允许' : '关闭');
      });
    }

    if (allowPasserbyCheckbox) {
      allowPasserbyCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ allowPasserbyComments: /** @type {HTMLInputElement} */(allowPasserbyCheckbox).checked });
      });
    }

    if (passerbyCommentMinInput) {
      passerbyCommentMinInput.addEventListener('change', () => {
        const value = parseInt(/** @type {HTMLInputElement} */(passerbyCommentMinInput).value);
        if (value >= 1 && value <= 50) {
          this.dataManager.updateSettings({ passerbyCommentMin: value });
        }
      });
    }

    if (passerbyCommentMaxInput) {
      passerbyCommentMaxInput.addEventListener('change', () => {
        const value = parseInt(/** @type {HTMLInputElement} */(passerbyCommentMaxInput).value);
        if (value >= 1 && value <= 50) {
          this.dataManager.updateSettings({ passerbyCommentMax: value });
        }
      });
    }

    if (passerbyPersonalitySelect) {
      passerbyPersonalitySelect.addEventListener('change', () => {
        const value = /** @type {HTMLSelectElement} */(passerbyPersonalitySelect).value;
        this.dataManager.updateSettings({ passerbyPersonality: value });
        logger.info('[DiaryUIPanels] 路人性格类型已更新:', value);
      });
    }

    // 删除确认复选框
    if (skipDeleteConfirmCheckbox) {
      skipDeleteConfirmCheckbox.addEventListener('change', () => {
        const checked = /** @type {HTMLInputElement} */(skipDeleteConfirmCheckbox).checked;
        this.dataManager.updateSettings({ skipDeleteConfirm: checked });
        logger.info('[DiaryUIPanels] 删除确认设置已更新:', checked ? '跳过确认' : '需要确认');
      });
    }

    logger.debug('[DiaryUIPanels.bindSettingsPanelEvents] 设置面板事件已绑定');
  }

  /**
   * 同步上下文预设状态
   * 
   * @param {string} subType - 上下文类型（charDescription/charPersonality等）
   * @param {boolean} enabled - 启用状态
   * @description
   * 当设置面板的复选框改变时，同步更新对应的上下文预设的 enabled 状态
   */
  syncContextPresetState(subType, enabled) {
    if (!this.presetUI || !this.presetUI.dataManager) return;

    const presets = this.presetUI.dataManager.presets;
    const preset = presets.find(p => p.type === 'context' && p.subType === subType);

    if (preset && preset.enabled !== enabled) {
      preset.enabled = enabled;
      this.presetUI.dataManager.savePresets();
      logger.debug('[DiaryUIPanels.syncContextPresetState] 已同步预设状态:', subType, enabled);
    }
  }
}

