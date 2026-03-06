/**
 * 日记UI渲染器（重构版）
 *
 * @description
 * 负责日记面板的核心UI渲染：
 * - 轮播图渲染和翻页
 * - 日记卡片生成
 * - 评论区渲染（递归嵌套）
 * - 评论交互（回复、删除）
 *
 * 职责边界：
 * - ✅ 渲染UI、处理DOM
 * - ✅ 翻页、刷新逻辑
 * - ❌ 不处理就地编辑（交给 diary-ui-edit.js）
 * - ❌ 不处理筛选逻辑（交给 diary-ui-filter.js）
 * - ❌ 不处理面板切换（交给 diary-ui-panels.js）
 * - ❌ 不处理API配置（交给 diary-apiconfig.js）
 * - ❌ 不处理AI预览（交给 diary-preview.js）
 *
 * @module DiaryUI
 */

// ========================================
// [IMPORT] SillyTavern API
// ========================================
import { getContext } from '../../../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../../popup.js';
import logger from '../../logger.js';
import {
  showDiaryToast,
  showSuccessToast,
  showInfoToast,
  showErrorToast
} from './diary-toast.js';

// ========================================
// [IMPORT] 日记子模块
// ========================================
import { DiaryPresetDataManager } from './diary-preset-data.js';
import { DiaryPresetUI } from './diary-preset-ui.js';
import { DiaryVisualSettings } from './diary-visual-settings.js';

// 新拆分的子模块
import { DiaryUIEdit } from './diary-ui-edit.js';
import { DiaryUIFilter } from './diary-ui-filter.js';
import { DiaryUIPanels } from './diary-ui-panels.js';
import { DiaryPreview } from './diary-preview.js';
import { DiaryAPIConfig } from './diary-apiconfig.js';

// ========================================
// [CORE] UI管理类
// ========================================

/**
 * 日记UI管理器
 *
 * @class DiaryUI
 */
export class DiaryUI {
  /**
   * 创建UI管理器
   *
   * @param {import('./diary-data.js').DiaryDataManager} dataManager - 数据管理器
   */
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.presetDataManager = new DiaryPresetDataManager();
    this.presetUI = new DiaryPresetUI(this.presetDataManager);
    this.visualSettings = new DiaryVisualSettings(dataManager);

    this.api = null;
    this.editor = null;
    this.panelElement = null;
    this.sliderElement = null;

    this.filter = {
      type: 'all',
      searchText: '',
      weekOffset: 0,
      monthOffset: 0,
      selectedDate: '',
      dateRangeStart: '',
      dateRangeEnd: ''
    };

    this.currentIndex = 0;

    // 子模块（在 initSubModules 中初始化）
    this.editModule = null;
    this.filterModule = null;
    this.panelsModule = null;
    this.previewModule = null;
    this.apiConfigModule = null;
  }

  /**
   * 设置API管理器引用
   */
  setAPI(api) {
    this.api = api;
    if (api) {
      api.setPresetManager(this.presetDataManager);
    }
    // 注入到子模块
    if (this.previewModule) this.previewModule.api = api;
    if (this.apiConfigModule) this.apiConfigModule.api = api;
  }

  /**
   * 设置编辑器引用
   */
  setEditor(editor) {
    this.editor = editor;
  }

  /**
   * 初始化UI
   */
  async init() {
    logger.info('diary', '[DiaryUI] 开始初始化');

    await this.loadTemplate();
    this.createPanel();
    this.initSubModules();  // 初始化子模块

    this.presetUI.init();
    this.visualSettings.init(this.panelElement);
    this.visualSettings.apply();

    this.bindEvents();

    logger.info('diary', '[DiaryUI] 初始化完成');
  }

  /**
   * 初始化子模块
   *
   * @description
   * 创建并初始化所有UI子模块实例：
   * - DiaryUIEdit（就地编辑模块）
   * - DiaryUIFilter（筛选搜索模块）
   * - DiaryUIPanels（面板管理模块）
   * - DiaryPreview（AI预览面板）
   * - DiaryAPIConfig（API配置管理）
   *
   * 各模块通过依赖注入获取所需的引用（dataManager、ui等）
   */
  initSubModules() {
    this.editModule = new DiaryUIEdit(this.dataManager, this);
    this.filterModule = new DiaryUIFilter(this.dataManager, this.panelElement);
    this.panelsModule = new DiaryUIPanels(this.panelElement, {
      dataManager: this.dataManager,
      filter: this.filter,
      filterHelper: this.filterModule,
      presetUI: this.presetUI,
      visualSettings: this.visualSettings,
      refreshCallback: () => this.refreshDiaries()
    });
    this.previewModule = new DiaryPreview(this.panelElement, {
      dataManager: this.dataManager,
      api: this.api,
      getCurrentIndexFunc: () => this.currentIndex,
      refreshCallback: (keepPosition) => this.refreshDiaries(keepPosition)
    });
    this.apiConfigModule = new DiaryAPIConfig(this.panelElement, {
      dataManager: this.dataManager,
      api: this.api
    });

    // 注入面板管理器引用到预设UI（用于双向同步）
    this.presetUI.setPanelsManager(this.panelsModule);

    logger.debug('diary', '[DiaryUI.initSubModules] 子模块已初始化');
  }

  /**
   * 加载HTML模板
   */
  async loadTemplate() {
    try {
      const response = await fetch('/scripts/extensions/third-party/Acsus-Paws-Puffs/toolkit/diary/diary-panel.html');
      if (!response.ok) throw new Error('加载模板失败');
      this.templateHTML = await response.text();
      logger.debug('diary', '[DiaryUI.loadTemplate] HTML模板已加载');
    } catch (error) {
      logger.error('diary', '[DiaryUI.loadTemplate] 加载失败:', error);
      this.templateHTML = this.getInlineTemplate();
    }
  }

  /**
   * 获取内联HTML模板（后备方案）
   */
  getInlineTemplate() {
    return `
            <div class="diary-panel" id="diaryPanel">
                <div class="diary-header">
                    <h2>日记本 - <span id="diaryCharName"></span></h2>
                    <button class="diary-close-btn">❌</button>
                </div>
                <div class="diary-slider" id="diarySlider"></div>
                <div class="diary-controls">
                    <button class="diary-prev">◄</button>
                    <button class="diary-next">►</button>
                </div>
                <div class="diary-actions">
                    <button class="diary-new">+ 新日记</button>
                    <button class="diary-edit">编辑</button>
                    <button class="diary-complete">完成日记</button>
                    <button class="diary-filter">筛选</button>
                </div>
            </div>
        `;
  }

  /**
   * 创建面板DOM
   */
  createPanel() {
    let panel = document.getElementById('diaryPanel');
    if (panel) {
      this.panelElement = panel;
      this.sliderElement = panel.querySelector('#diarySlider');
      return;
    }

    const container = document.createElement('div');
    container.innerHTML = this.templateHTML;

    while (container.firstChild) {
      document.body.appendChild(container.firstChild);
    }

    this.panelElement = /** @type {HTMLElement} */ (document.getElementById('diaryPanel'));

    if (this.panelElement) {
      this.panelElement.style.display = 'none';
      this.sliderElement = this.panelElement.querySelector('#diarySlider');
    }

    logger.debug('diary', '[DiaryUI.createPanel] 面板DOM已创建');
  }

  /**
   * 绑定事件（重构版：直接调用子模块）
   * 注意：触摸和键盘导航已禁用，只支持按钮点击翻页
   */
  bindEvents() {
    if (!this.panelElement) return;

    // 关闭按钮
    const closeBtn = this.panelElement.querySelector('.diary-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closePanel());

    // 翻页按钮
    const prevBtn = this.panelElement.querySelector('.diary-prev');
    const nextBtn = this.panelElement.querySelector('.diary-next');
    if (prevBtn) prevBtn.addEventListener('click', () => this.prevPage());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextPage());

    // 操作按钮
    const newBtn = this.panelElement.querySelector('.diary-new');
    const sendBtn = this.panelElement.querySelector('.diary-send');

    if (newBtn) newBtn.addEventListener('click', () => this.createNewDiary());
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (this.api && this.api.isGenerating) {
          this.api.abort();
        } else {
          this.completeCurrentDiary();
        }
      });
    }

    // AI回复预览按钮（直接调用子模块）
    const aiPreviewBtn = this.panelElement.querySelector('#diaryAiPreviewBtn');
    if (aiPreviewBtn) {
      aiPreviewBtn.addEventListener('click', () => this.previewModule.togglePanel());
    }

    const aiPreviewCloseBtn = this.panelElement.querySelector('#diaryAiPreviewClose');
    const aiPreviewEditBtn = this.panelElement.querySelector('#diaryAiPreviewEdit');
    const aiPreviewParseBtn = this.panelElement.querySelector('#diaryAiPreviewParse');
    const aiPreviewClearBtn = this.panelElement.querySelector('#diaryAiPreviewClear');

    if (aiPreviewCloseBtn) aiPreviewCloseBtn.addEventListener('click', () => this.previewModule.closePanel());
    if (aiPreviewEditBtn) aiPreviewEditBtn.addEventListener('click', () => this.previewModule.editPreview());
    if (aiPreviewParseBtn) aiPreviewParseBtn.addEventListener('click', () => this.previewModule.parsePreview());
    if (aiPreviewClearBtn) aiPreviewClearBtn.addEventListener('click', () => this.previewModule.clearPreview(true));

    // 面板切换按钮（直接调用子模块）
    const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
    const presetBtn = this.panelElement.querySelector('#diaryPresetBtn');
    const visualBtn = this.panelElement.querySelector('#diaryVisualBtn');
    const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');

    if (searchToggleBtn) searchToggleBtn.addEventListener('click', () => this.panelsModule.toggleSearchBar(this.filter));
    if (presetBtn) presetBtn.addEventListener('click', () => this.panelsModule.togglePresetPanel());
    if (visualBtn) visualBtn.addEventListener('click', () => this.panelsModule.toggleVisualPanel());
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.panelsModule.toggleSettingsPanel());

    // 设置和API配置事件（直接调用子模块）
    this.panelsModule.bindSettingsPanelEvents();
    this.apiConfigModule.bindApiSettingsEvents();

    // 筛选下拉（直接调用子模块）
    const filterSelect = this.panelElement.querySelector('#diaryFilterSelect');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        const filterType = /** @type {HTMLSelectElement} */ (e.target).value;
        this.filterModule.handleFilterChange(filterType, this.filter, () => this.refreshDiaries());
      });
    }

    // 周/月筛选按钮（直接调用子模块）
    const weekPrevBtn = this.panelElement.querySelector('.diary-week-prev-btn');
    const weekNextBtn = this.panelElement.querySelector('.diary-week-next-btn');
    if (weekPrevBtn) {
      weekPrevBtn.addEventListener('click', () => {
        this.filter.weekOffset--;
        this.refreshDiaries();
        this.filterModule.updatePeriodLabel(this.filter);
      });
    }
    if (weekNextBtn) {
      weekNextBtn.addEventListener('click', () => {
        this.filter.weekOffset++;
        this.refreshDiaries();
        this.filterModule.updatePeriodLabel(this.filter);
      });
    }

    const monthPrevBtn = this.panelElement.querySelector('.diary-month-prev-btn');
    const monthNextBtn = this.panelElement.querySelector('.diary-month-next-btn');
    if (monthPrevBtn) {
      monthPrevBtn.addEventListener('click', () => {
        this.filter.monthOffset = (this.filter.monthOffset || 0) - 1;
        this.refreshDiaries();
        this.filterModule.updatePeriodLabel(this.filter);
      });
    }
    if (monthNextBtn) {
      monthNextBtn.addEventListener('click', () => {
        this.filter.monthOffset = (this.filter.monthOffset || 0) + 1;
        this.refreshDiaries();
        this.filterModule.updatePeriodLabel(this.filter);
      });
    }

    // 日期选择器
    const datePicker = this.panelElement.querySelector('#diaryDatePicker');
    const dateClearBtn = this.panelElement.querySelector('.diary-date-clear-btn');
    if (datePicker) {
      datePicker.addEventListener('change', (e) => {
        this.filter.selectedDate = /** @type {HTMLInputElement} */ (e.target).value;
        this.refreshDiaries();
        logger.info('diary', '[DiaryUI] 已选择日期:', this.filter.selectedDate);
      });
    }
    if (dateClearBtn) {
      dateClearBtn.addEventListener('click', () => {
        if (datePicker) /** @type {HTMLInputElement} */ (datePicker).value = '';
        this.filter.selectedDate = '';
        this.refreshDiaries();
        logger.info('diary', '[DiaryUI] 已清除日期筛选');
      });
    }

    // 日期范围选择器（持久化存储）
    const dateRangeStart = this.panelElement.querySelector('#diaryDateRangeStart');
    const dateRangeEnd = this.panelElement.querySelector('#diaryDateRangeEnd');
    const dateRangeClearBtn = this.panelElement.querySelector('#diaryDateRangeClear');
    if (dateRangeStart) {
      dateRangeStart.addEventListener('change', (e) => {
        this.filter.dateRangeStart = /** @type {HTMLInputElement} */ (e.target).value;
        this.dataManager.updateSettings({ dateRangeStart: this.filter.dateRangeStart });
        this.refreshDiaries();
        logger.info('diary', '[DiaryUI] 日期范围开始:', this.filter.dateRangeStart);
      });
    }
    if (dateRangeEnd) {
      dateRangeEnd.addEventListener('change', (e) => {
        this.filter.dateRangeEnd = /** @type {HTMLInputElement} */ (e.target).value;
        this.dataManager.updateSettings({ dateRangeEnd: this.filter.dateRangeEnd });
        this.refreshDiaries();
        logger.info('diary', '[DiaryUI] 日期范围结束:', this.filter.dateRangeEnd);
      });
    }
    if (dateRangeClearBtn) {
      dateRangeClearBtn.addEventListener('click', () => {
        if (dateRangeStart) /** @type {HTMLInputElement} */ (dateRangeStart).value = '';
        if (dateRangeEnd) /** @type {HTMLInputElement} */ (dateRangeEnd).value = '';
        this.filter.dateRangeStart = '';
        this.filter.dateRangeEnd = '';
        this.dataManager.updateSettings({ dateRangeStart: '', dateRangeEnd: '' });
        this.refreshDiaries();
        logger.info('diary', '[DiaryUI] 已清除日期范围筛选');
      });
    }

    // 搜索框
    const searchInput = this.panelElement.querySelector('#diarySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filter.searchText = e.target.value.trim();
        this.refreshDiaries();
      });
    }

    // 选择发送按钮
    const selectBtn = this.panelElement.querySelector('.diary-select');
    if (selectBtn) {
      selectBtn.addEventListener('click', () => this.showSelectSendPanel());
    }

    // 触摸、键盘、滚轮事件
    // this.bindTouchEvents();  // 已禁用：避免误触
    this.bindKeyboardEvents();  // 保留Escape键关闭功能
    this.bindWheelEvents();

    // 全局评论事件委托
    this.bindGlobalCommentEvents();

    logger.debug('diary', '[DiaryUI.bindEvents] 事件已绑定（重构版）');
  }

  /**
   * 绑定触摸事件（已禁用）
   * @deprecated 已禁用触摸滑动，避免误触。请使用 < > 按钮切换日记
   */
  bindTouchEvents() {
    // 已禁用：避免误触
    return;

    // if (!this.sliderElement) return;
    // let touchStartX = 0;
    // let touchEndX = 0;
    // this.sliderElement.addEventListener('touchstart', (e) => {
    //   touchStartX = e.touches[0].clientX;
    // }, { passive: true });
    // this.sliderElement.addEventListener('touchend', (e) => {
    //   touchEndX = e.changedTouches[0].clientX;
    //   const swipeThreshold = 50;
    //   if (touchStartX - touchEndX > swipeThreshold) {
    //     this.nextPage();
    //   } else if (touchEndX - touchStartX > swipeThreshold) {
    //     this.prevPage();
    //   }
    // }, { passive: true });
  }

  /**
   * 绑定键盘事件
   * 注意：左右箭头键导航已禁用，只保留Escape键关闭功能
   */
  bindKeyboardEvents() {
    const keyHandler = (e) => {
      if (!this.isPanelOpen()) return;

      // 只保留Escape键关闭功能
      if (e.key === 'Escape') {
        this.closePanel();
      }

      // 左右箭头键已禁用，避免误触
      // if (e.key === 'ArrowRight') {
      //   this.nextPage();
      // } else if (e.key === 'ArrowLeft') {
      //   this.prevPage();
      // }
    };

    document.addEventListener('keydown', keyHandler);
    this.keyHandler = keyHandler;
  }

  /**
   * 绑定滚轮事件（已禁用）
   */
  bindWheelEvents() {
    // 禁用滚轮翻页（用户反馈：只用箭头移动）
  }

  /**
   * 打开面板
   */
  openPanel() {
    if (!this.panelElement) {
      logger.error('diary', '[DiaryUI.openPanel] 面板未初始化');
      return;
    }

    // 从设置中恢复日期范围（持久化）
    const settings = this.dataManager.getSettings();

    // 重置筛选器（日期范围从设置恢复）
    this.filter.type = 'all';
    this.filter.searchText = '';
    this.filter.weekOffset = 0;
    this.filter.monthOffset = 0;
    this.filter.selectedDate = '';
    this.filter.dateRangeStart = settings.dateRangeStart || '';
    this.filter.dateRangeEnd = settings.dateRangeEnd || '';

    // 重置UI元素
    const filterSelect = this.panelElement.querySelector('#diaryFilterSelect');
    const searchInput = this.panelElement.querySelector('#diarySearchInput');
    const searchBar = this.panelElement.querySelector('#diarySearchBar');
    const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
    const settingsPanel = this.panelElement.querySelector('#diarySettingsPanel');
    const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');

    // 恢复日期范围输入框的值
    const dateRangeStart = this.panelElement.querySelector('#diaryDateRangeStart');
    const dateRangeEnd = this.panelElement.querySelector('#diaryDateRangeEnd');
    if (dateRangeStart) /** @type {HTMLInputElement} */ (dateRangeStart).value = this.filter.dateRangeStart;
    if (dateRangeEnd) /** @type {HTMLInputElement} */ (dateRangeEnd).value = this.filter.dateRangeEnd;

    if (filterSelect) /** @type {HTMLSelectElement} */ (filterSelect).value = 'all';
    if (searchInput) /** @type {HTMLInputElement} */ (searchInput).value = '';
    if (searchBar) searchBar.classList.remove('active');
    if (searchToggleBtn) searchToggleBtn.classList.remove('active');
    if (settingsPanel) settingsPanel.classList.remove('active');
    if (settingsBtn) settingsBtn.classList.remove('active');

    // 关闭所有筛选面板
    if (this.filterModule) {
      this.filterModule.closeAllFilterPanels();
    }

    // 刷新日记列表
    this.refreshDiaries();

    // 显示面板
    this.panelElement.style.display = 'flex';
    setTimeout(() => {
      this.panelElement.classList.add('active');
    }, 10);

    logger.info('diary', '[DiaryUI.openPanel] 面板已打开');
  }

  /**
   * 关闭面板
   */
  closePanel() {
    if (!this.panelElement) return;

    this.panelElement.classList.remove('active');
    setTimeout(() => {
      this.panelElement.style.display = 'none';
    }, 300);

    logger.info('diary', '[DiaryUI.closePanel] 面板已关闭');
  }

  /**
   * 检查面板是否打开
   */
  isPanelOpen() {
    return this.panelElement && this.panelElement.style.display !== 'none';
  }

  // ========================================
  // [CORE] 渲染方法
  // ========================================

  /**
   * 刷新日记列表
   */
  refreshDiaries(keepPosition = false) {
    this.dataManager.loadDiaries();
    const diaries = this.dataManager.diaries;
    logger.debug('diary', '[DiaryUI.refreshDiaries] 加载了', diaries.length, '篇日记');
    this.renderDiaries(keepPosition);
    logger.debug('diary', '[DiaryUI.refreshDiaries] 日记列表已刷新');
  }

  /**
   * 刷新日记列表并保持在指定日记（无跳跃）
   */
  refreshAndStayAtDiary(targetDiaryId) {
    this.dataManager.loadDiaries();

    logger.debug('diary', '[DiaryUI.refreshAndStayAtDiary] 目标日记ID:', targetDiaryId);

    const allCards = this.sliderElement.querySelectorAll('.diary-card');
    let targetCard = null;

    allCards.forEach(card => {
      const cardElement = /** @type {HTMLElement} */ (card);
      if (cardElement.dataset.diaryId === targetDiaryId) {
        targetCard = cardElement;
      }
    });

    if (!targetCard) {
      logger.warn('diary', '[DiaryUI.refreshAndStayAtDiary] 目标日记卡片不在DOM中，执行完整刷新');
      this.refreshDiaries(true);
      return;
    }

    const diary = this.dataManager.getDiary(targetDiaryId);
    if (!diary) {
      logger.warn('diary', '[DiaryUI.refreshAndStayAtDiary] 目标日记不存在');
      return;
    }

    const commentsEl = targetCard.querySelector('.diary-comments');
    if (commentsEl) {
      commentsEl.innerHTML = this.renderComments(diary.comments);
      logger.debug('diary', '[DiaryUI.refreshAndStayAtDiary] 已更新评论区，无视觉跳跃');
    }

    logger.debug('diary', '[DiaryUI.refreshAndStayAtDiary] 刷新完成，停留在目标日记');
  }

  /**
   * 渲染日记卡片
   */
  renderDiaries(keepPosition = false) {
    if (!this.sliderElement) return;

    // 使用子模块获取过滤后的日记
    const diaries = this.filterModule.getFilteredDiaries(this.filter);

    logger.debug('diary', '[DiaryUI.renderDiaries] 筛选后日记数:', diaries.length);
    logger.debug('diary', '[DiaryUI.renderDiaries] 当前筛选:', this.filter);

    if (diaries.length === 0) {
      this.sliderElement.innerHTML = `
                <div class="diary-empty">
                    <p>还没有日记哦~</p>
                    <p>点击"+ 新日记"开始记录吧！</p>
                    <p style="font-size: 12px; color: rgba(255,255,255,0.5);">提示：检查筛选器是否限制了显示</p>
                </div>
            `;
      return;
    }

    let currentDiaryId = null;
    if (keepPosition) {
      const allCards = this.sliderElement.querySelectorAll('.diary-card');
      if (allCards.length >= 2) {
        const currentCard = /** @type {HTMLElement} */ (allCards[1]);
        currentDiaryId = currentCard.dataset.diaryId;
        logger.debug('diary', '[DiaryUI.renderDiaries] 记住当前显示的日记ID:', currentDiaryId);
      }
    }

    this.sliderElement.innerHTML = '';
    diaries.forEach(diary => {
      const card = this.createDiaryCard(diary);
      this.sliderElement.appendChild(card);
    });

    if (keepPosition && currentDiaryId && diaries.length >= 2) {
      const allCards = this.sliderElement.querySelectorAll('.diary-card');
      let targetIndex = -1;

      allCards.forEach((card, index) => {
        const cardElement = /** @type {HTMLElement} */ (card);
        if (cardElement.dataset.diaryId === currentDiaryId) {
          targetIndex = index;
        }
      });

      if (targetIndex !== -1 && targetIndex !== 1) {
        if (targetIndex === 0) {
          const lastCard = allCards[allCards.length - 1];
          this.sliderElement.insertBefore(lastCard, allCards[0]);
        } else {
          for (let i = 1; i < targetIndex; i++) {
            this.sliderElement.appendChild(allCards[i]);
          }
        }
        logger.debug('diary', '[DiaryUI.renderDiaries] 已调整卡片顺序，保持显示:', currentDiaryId);
      }
    } else if (diaries.length >= 2 && !keepPosition) {
      setTimeout(() => {
        this.prevPage();
        logger.debug('diary', '[DiaryUI.renderDiaries] 已自动翻页，最新日记显示在大卡片');
      }, 50);
    }

    logger.debug('diary', '[DiaryUI.renderDiaries] 已渲染', diaries.length, '篇日记');
  }

  /**
   * 创建日记卡片DOM
   */
  createDiaryCard(diary) {
    const template = /** @type {HTMLTemplateElement} */ (document.getElementById('diaryCardTemplate'));
    const clonedContent = template.content.cloneNode(true);
    const card = /** @type {HTMLElement} */ (/** @type {DocumentFragment} */ (clonedContent).querySelector('.diary-card'));

    card.dataset.diaryId = diary.id;

    const dayEl = card.querySelector('.diary-day');
    const dateEl = card.querySelector('.diary-date');
    const entriesEl = card.querySelector('.diary-entries');
    const commentsEl = card.querySelector('.diary-comments');
    const privacyBtn = card.querySelector('.diary-privacy-toggle');
    const editBtn = card.querySelector('.diary-edit-toggle');

    if (dayEl) dayEl.textContent = diary.title;
    if (dateEl) {
      dateEl.innerHTML = `${diary.date} ${diary.dayOfWeek} ${diary.author === 'ai' ? '<span class="diary-author-badge">AI</span>' : ''}`;
    }
    if (entriesEl) entriesEl.innerHTML = this.renderContentBlocks(diary.contentBlocks);

    if (commentsEl) {
      const commentCount = diary.comments?.length || 0;
      logger.debug('diary', `[DiaryUI.createDiaryCard] 渲染日记"${diary.title}"的评论，数据中有 ${commentCount} 条顶层评论`);
      const commentsHTML = this.renderComments(diary.comments);

      commentsEl.innerHTML = '';
      if (commentsHTML) {
        const commentsContainer = document.createElement('div');
        commentsContainer.innerHTML = commentsHTML;
        commentsEl.appendChild(commentsContainer);
      }
    }

    // 隐私按钮（直接调用子模块）
    if (privacyBtn) {
      const iconSpan = privacyBtn.querySelector('span');
      if (diary.privacy) {
        privacyBtn.classList.add('active');
        /** @type {HTMLButtonElement} */ (privacyBtn).title = '隐私模式';
        if (iconSpan) iconSpan.className = 'fa-solid fa-eye-slash';
      } else {
        privacyBtn.classList.remove('active');
        /** @type {HTMLButtonElement} */ (privacyBtn).title = '公开';
        if (iconSpan) iconSpan.className = 'fa-solid fa-eye';
      }

      privacyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        logger.debug('diary', '[DiaryUI] 隐私按钮被点击 - diaryId:', diary.id);
        this.editModule.togglePrivacy(diary.id);
      });
    }

    // 编辑按钮（直接调用子模块）
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        logger.debug('diary', '[DiaryUI] 编辑按钮被点击 - diaryId:', diary.id);
        this.editModule.toggleEditMode(card, diary);
      });
    }

    return card;
  }

  /**
   * 渲染内容块
   */
  renderContentBlocks(blocks) {
    return blocks.map(block => {
      let contentHTML = '';

      if (block.type === 'image' && block.imageUrl) {
        contentHTML = `
            <div class="diary-entry diary-entry-image">
                <img src="${block.imageUrl}" alt="${block.imageDesc || '日记图片'}" class="diary-image"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <div class="diary-image-fallback" style="display: none;">
                    📷 [图片加载失败：${block.imageDesc || '无描述'}]
                </div>
                ${block.imageDesc ? `<div class="diary-image-desc">${block.imageDesc}</div>` : ''}
            </div>
        `;
      } else {
        contentHTML = `
            <div class="diary-entry">
                <div class="entry-content">${block.content}</div>
            </div>
        `;
      }

      return contentHTML;
    }).join('');
  }

  /**
   * 统计所有嵌套回复的数量
   * @param {Array} replies - 回复数组
   * @returns {number} 总回复数
   */
  countAllReplies(replies) {
    if (!replies || replies.length === 0) return 0;

    let count = replies.length;
    replies.forEach(reply => {
      if (reply.replies && reply.replies.length > 0) {
        count += this.countAllReplies(reply.replies);
      }
    });
    return count;
  }

  /**
   * 渲染评论（递归，支持嵌套）
   */
  renderComments(comments, level = 0) {
    if (!comments || comments.length === 0) return '';

    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    return comments.map(comment => {
      let authorType = 'passerby';
      if (comment.author === 'user') {
        authorType = 'user';
      } else if (comment.author === 'ai') {
        authorType = 'ai';
      } else if (comment.authorName === charName) {
        authorType = 'ai';
      }

      const hasReplies = comment.replies && comment.replies.length > 0;
      const replyCount = this.countAllReplies(comment.replies);
      const repliesHTML = hasReplies
        ? `<div class="comment-replies">${this.renderComments(comment.replies, level + 1)}</div>`
        : '';

      // 添加类和属性以支持折叠
      const commentClass = `comment-item ${hasReplies && level === 3 ? 'has-replies' : ''}`;
      const replyCountAttr = hasReplies && level === 3 ? `data-reply-count="${replyCount}"` : '';

      return `
                <div class="${commentClass}" data-comment-id="${comment.id}" data-level="${level}" ${replyCountAttr}>
                    <div class="comment-header">
                        <span class="comment-author comment-author-${authorType}">${comment.authorName}</span>
                    </div>
                    <div class="comment-content">${comment.content}</div>
                    <div class="comment-actions">
                        <button class="comment-reply-btn" data-comment-id="${comment.id}" title="回复">
                            <span class="fa-solid fa-reply"></span>
                        </button>
                        <button class="comment-delete-btn" data-comment-id="${comment.id}" title="删除">
                            <span class="fa-solid fa-trash"></span>
                        </button>
                    </div>
                    ${repliesHTML}
                </div>
            `;
    }).join('');
  }

  /**
   * 上一页
   */
  prevPage() {
    if (!this.sliderElement) return;

    const cards = this.sliderElement.querySelectorAll('.diary-card');
    if (cards.length === 0) return;

    this.sliderElement.prepend(cards[cards.length - 1]);
    logger.debug('diary', '[DiaryUI.prevPage] 上一页');
  }

  /**
   * 下一页
   */
  nextPage() {
    if (!this.sliderElement) return;

    const cards = this.sliderElement.querySelectorAll('.diary-card');
    if (cards.length === 0) return;

    this.sliderElement.appendChild(cards[0]);
    logger.debug('diary', '[DiaryUI.nextPage] 下一页');
  }

  /**
   * 获取当前显示的日记卡片
   */
  getCurrentCard() {
    if (!this.sliderElement) return null;

    const allCards = this.sliderElement.querySelectorAll('.diary-card');

    if (allCards.length === 0) {
      return null;
    } else if (allCards.length === 1) {
      return /** @type {HTMLElement} */ (allCards[0]);
    } else {
      return /** @type {HTMLElement} */ (this.sliderElement.querySelector('.diary-card:nth-child(2)'));
    }
  }

  /**
   * 更新发送按钮状态
   */
  updateSendButtonState(isGenerating) {
    const sendBtn = this.panelElement.querySelector('.diary-send');
    if (!sendBtn) return;

    const icon = sendBtn.querySelector('span');
    if (!icon) return;

    if (isGenerating) {
      icon.className = 'fa-solid fa-circle-stop';
      /** @type {HTMLElement} */ (sendBtn).title = '中止生成';
      sendBtn.classList.add('generating');
    } else {
      icon.className = 'fa-solid fa-paper-plane';
      /** @type {HTMLElement} */ (sendBtn).title = '发送消息';
      sendBtn.classList.remove('generating');
    }
  }

  // ========================================
  // [FUNC] 评论交互
  // ========================================

  /**
   * 绑定全局评论按钮事件（事件委托）
   */
  bindGlobalCommentEvents() {
    if (!this.sliderElement) return;

    // 评论点击显示按钮的状态管理
    let activeComment = null;
    let hideTimer = null;

    this.sliderElement.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const commentItem = target.closest('.comment-item');

      // 优先处理：点击第3层评论的折叠/展开提示
      // 检查是否点击了has-replies类的第3层评论（::after伪元素无法直接检测，所以检查父元素）
      if (commentItem && commentItem.classList.contains('has-replies') && commentItem.dataset.level === '3') {
        // 检查点击位置是否在评论内容之外（即::after区域）
        const clickedInContent = target.closest('.comment-content') || target.closest('.comment-header') || target.closest('.comment-actions');
        if (!clickedInContent) {
          commentItem.classList.toggle('expanded');
          const isExpanded = commentItem.classList.contains('expanded');
          logger.debug('diary', `[DiaryUI] 第3层评论折叠/展开: ${isExpanded ? '展开' : '收起'} ID:${commentItem.dataset.commentId}`);
          e.stopPropagation();
          return;
        }
      }

      // 点击评论项显示操作按钮（不包括按钮区域）
      if (commentItem && !target.closest('.comment-actions') && !target.closest('button')) {
        // 确保只处理最近的评论项，不影响嵌套的子评论
        const clickedComment = target.closest('.comment-content') || target.closest('.comment-header');
        if (!clickedComment || clickedComment.closest('.comment-item') !== commentItem) {
          logger.debug('diary', '[DiaryUI] 点击位置不在评论主体，跳过');
          return;
        }

        const commentId = commentItem.dataset.commentId;
        const commentLevel = commentItem.dataset.level;
        logger.debug('diary', `[DiaryUI] 点击评论 ID:${commentId} Level:${commentLevel}`);

        // 阻止事件冒泡到父评论
        e.stopPropagation();
        logger.debug('diary', '[DiaryUI] 已阻止事件冒泡');

        // 隐藏之前的按钮
        if (activeComment && activeComment !== commentItem) {
          const prevId = activeComment.dataset.commentId;
          activeComment.classList.remove('show-actions');
          logger.debug('diary', `[DiaryUI] 隐藏之前的评论按钮 ID:${prevId}`);
        }

        // 显示当前评论的按钮
        commentItem.classList.add('show-actions');
        activeComment = commentItem;
        logger.debug('diary', `[DiaryUI] 显示当前评论按钮 ID:${commentId}`);

        // 手机端3秒后自动隐藏
        if (window.innerWidth <= 768) {
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            commentItem.classList.remove('show-actions');
            if (activeComment === commentItem) {
              activeComment = null;
            }
            logger.debug('diary', `[DiaryUI] 手机端自动隐藏按钮 ID:${commentId}`);
          }, 3000);
        }
      }

      // 回复按钮
      const replyBtn = target.closest('.comment-reply-btn');
      if (replyBtn) {
        e.stopPropagation();
        const commentId = /** @type {HTMLElement} */ (replyBtn).dataset.commentId;
        const card = target.closest('.diary-card');
        if (!card) return;
        const diaryId = /** @type {HTMLElement} */ (card).dataset.diaryId;
        if (!diaryId) return;

        logger.debug('diary', '[DiaryUI] 回复按钮被点击 - commentId:', commentId);
        await this.replyToComment(diaryId, commentId);
        return;
      }

      // 删除按钮
      const deleteBtn = target.closest('.comment-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const commentId = /** @type {HTMLElement} */ (deleteBtn).dataset.commentId;
        const card = target.closest('.diary-card');
        if (!card) return;
        const diaryId = /** @type {HTMLElement} */ (card).dataset.diaryId;
        if (!diaryId) return;

        logger.debug('diary', '[DiaryUI] 删除按钮被点击 - commentId:', commentId);
        await this.deleteComment(diaryId, commentId);
        return;
      }

      // 添加评论按钮（固定在卡片右下角）
      const addCommentBtn = target.closest('.diary-add-comment-btn');
      if (addCommentBtn) {
        e.stopPropagation();
        logger.debug('diary', '[DiaryUI] 添加评论按钮被点击');
        await this.addCommentToCurrentDiary();
        return;
      }
    });

    logger.debug('diary', '[DiaryUI.bindGlobalCommentEvents] 全局评论事件已绑定');
  }

  /**
   * 回复评论
   */
  async replyToComment(diaryId, commentId) {
    const { callGenericPopup, POPUP_TYPE } = await import('../../../../../popup.js');

    const replyContent = await callGenericPopup(
      '写下你的回复...',
      POPUP_TYPE.INPUT,
      '',
      { okButton: '发送', cancelButton: '取消', wide: false, rows: 3 }
    );

    const replyText = String(replyContent || '');
    if (!replyText.trim()) {
      logger.debug('diary', '[DiaryUI.replyToComment] 用户取消或内容为空');
      return;
    }

    const ctx = getContext();
    const reply = {
      id: this.dataManager.generateTimestampId(),
      author: 'user',
      authorName: ctx.name1 || 'User',
      content: replyText.trim(),
      timestamp: Date.now(),
      replies: []
    };

    this.dataManager.addComment(diaryId, reply, commentId);
    this.refreshAndStayAtDiary(diaryId);

    showSuccessToast('回复已添加');
    logger.info('diary', '[DiaryUI.replyToComment] 回复已添加到评论:', commentId);
  }

  /**
   * 添加评论到当前日记
   *
   * @description
   * 弹出输入框让用户输入评论，保存到当前显示的日记
   *
   * @async
   */
  async addCommentToCurrentDiary() {
    const currentCard = this.getCurrentCard();
    if (!currentCard) {
      showErrorToast('没有当前日记');
      logger.warn('diary', '[DiaryUI.addCommentToCurrentDiary] 没有当前日记');
      return;
    }

    const diaryId = currentCard.dataset.diaryId;
    if (!diaryId) {
      logger.warn('diary', '[DiaryUI.addCommentToCurrentDiary] 卡片缺少diaryId');
      return;
    }

    const { callGenericPopup, POPUP_TYPE } = await import('../../../../../popup.js');

    const commentContent = await callGenericPopup(
      '写下你的评论...',
      POPUP_TYPE.INPUT,
      '',
      { okButton: '发送', cancelButton: '取消', wide: false, rows: 3 }
    );

    const commentText = String(commentContent || '');
    if (!commentText.trim()) {
      logger.debug('diary', '[DiaryUI.addCommentToCurrentDiary] 用户取消或内容为空');
      return;
    }

    const ctx = getContext();
    const comment = {
      id: this.dataManager.generateTimestampId(),
      author: 'user',
      authorName: ctx.name1 || 'User',
      content: commentText.trim(),
      timestamp: Date.now(),
      replies: []
    };

    this.dataManager.addComment(diaryId, comment);
    this.refreshAndStayAtDiary(diaryId);

    showSuccessToast('评论已添加');
    logger.info('diary', '[DiaryUI.addCommentToCurrentDiary] 评论已添加到日记:', diaryId);
  }

  /**
   * 删除评论
   * @param {string} diaryId - 日记ID
   * @param {string} commentId - 评论ID
   */
  async deleteComment(diaryId, commentId) {
    const { callGenericPopup, POPUP_TYPE } = await import('../../../../../popup.js');

    // 获取当前设置
    const settings = this.dataManager.getSettings();

    // 如果设置了跳过确认，直接删除
    if (settings.skipDeleteConfirm) {
      this.dataManager.deleteComment(diaryId, commentId);
      this.refreshAndStayAtDiary(diaryId);
      showInfoToast('评论已删除');
      logger.info('diary', '[DiaryUI.deleteComment] 评论已删除（跳过确认）:', commentId);
      return;
    }

    // 显示带有"不再提示"选项的确认对话框
    const confirmHtml = `
      <div>确认删除这条评论吗？</div>
      <div style="margin-top: 10px; color: var(--SmartThemeEmColor);">⚠️ 此操作不可撤销！</div>
      <div style="margin-top: 15px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="skipDeleteConfirm" style="cursor: pointer;">
          <span style="font-size: calc(var(--mainFontSize) * 0.9);">以后不再提示</span>
        </label>
      </div>
    `;

    // 用临时变量保存勾选状态
    let skipConfirmChecked = false;

    // 显示弹窗后立即绑定checkbox事件
    setTimeout(() => {
      const skipCheckbox = document.querySelector('#skipDeleteConfirm');
      if (skipCheckbox) {
        skipCheckbox.addEventListener('change', (e) => {
          skipConfirmChecked = e.target.checked;
          logger.debug('diary', '[DiaryUI.deleteComment] 用户勾选"不再提示":', skipConfirmChecked);
        });
      }
    }, 50);

    const confirmed = await callGenericPopup(
      confirmHtml,
      POPUP_TYPE.CONFIRM,
      '',
      { okButton: '删除', cancelButton: '取消' }
    );

    if (!confirmed) {
      logger.debug('diary', '[DiaryUI.deleteComment] 用户取消删除');
      return;
    }

    // 检查是否勾选了"不再提示"
    if (skipConfirmChecked) {
      // 保存设置
      this.dataManager.updateSettings({ skipDeleteConfirm: true });
      logger.info('diary', '[DiaryUI.deleteComment] 已设置跳过删除确认');

      // 同步更新设置面板的复选框
      const settingsCheckbox = this.panelElement.querySelector('#diarySkipDeleteConfirm');
      if (settingsCheckbox) {
        settingsCheckbox.checked = true;
        logger.debug('diary', '[DiaryUI.deleteComment] 已同步设置面板复选框');
      }
    }

    this.dataManager.deleteComment(diaryId, commentId);
    this.refreshAndStayAtDiary(diaryId);

    showSuccessToast('评论已删除');
    logger.info('diary', '[DiaryUI.deleteComment] 评论已删除:', commentId);
  }

  // ========================================
  // [FUNC] 操作方法
  // ========================================

  /**
   * 创建新日记
   */
  createNewDiary() {
    if (this.editor) {
      this.editor.open(null);
      logger.info('diary', '[DiaryUI.createNewDiary] 打开编辑器');
    }
  }

  /**
   * 完成当前日记（后台异步生成）
   */
  async completeCurrentDiary() {
    const currentCard = this.getCurrentCard();
    if (!currentCard) {
      logger.warn('diary', '[DiaryUI.completeCurrentDiary] 没有当前日记');
      return;
    }

    const diaryId = /** @type {HTMLElement} */ (currentCard).dataset.diaryId;
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) return;

    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    const confirmed = await callGenericPopup(
      `确认请求 ${charName} 评论这篇日记吗？\n\n✨ 评论将在后台生成，你可以继续其他操作。`,
      POPUP_TYPE.CONFIRM,
      '',
      { okButton: '确定', cancelButton: '取消' }
    );

    if (!confirmed) {
      logger.debug('diary', '[DiaryUI.completeCurrentDiary] 用户取消');
      return;
    }

    try {
      await this.api.requestCommentAsync(diaryId);
      logger.info('diary', '[DiaryUI.completeCurrentDiary] 后台生成已启动');
    } catch (error) {
      logger.error('diary', '[DiaryUI.completeCurrentDiary] 启动失败:', error);
      showErrorToast('请求评论失败：' + error.message);
    }
  }

  /**
   * 删除当前日记
   */
  async deleteCurrentDiary() {
    const currentCard = this.getCurrentCard();
    if (!currentCard) {
      logger.warn('diary', '[DiaryUI.deleteCurrentDiary] 没有当前日记');
      return;
    }

    const diaryId = /** @type {HTMLElement} */ (currentCard).dataset.diaryId;
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) return;

    const confirmed = await callGenericPopup(
      `确定删除日记"${diary.title}"吗？此操作无法撤销。`,
      POPUP_TYPE.CONFIRM,
      '',
      { okButton: '删除', cancelButton: '取消' }
    );

    if (!confirmed) {
      logger.debug('diary', '[DiaryUI.deleteCurrentDiary] 用户取消');
      return;
    }

    this.dataManager.deleteDiary(diaryId);
    this.refreshDiaries();

    if (typeof toastr !== 'undefined') {
      toastr.success('日记已删除');
    }

    logger.info('diary', '[DiaryUI.deleteCurrentDiary] 日记已删除:', diaryId);
  }

  /**
   * 显示选择发送面板
   *
   * @description
   * 显示当前筛选条件下的日记列表，让用户选择要生成评论的日记。
   * 选择后直接触发批量生成，只为这些日记生成评论（一次API调用）。
   * 面板只显示当前筛选条件下的日记。
   */
  async showSelectSendPanel() {
    // 使用筛选后的日记（而不是所有日记）
    const allDiaries = this.filterModule.getFilteredDiaries(this.filter);

    if (allDiaries.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('还没有日记可以选择');
      }
      return;
    }

    return new Promise((resolve) => {
      const diariesHTML = allDiaries.map(d => {
        const isPrivacy = d.privacy;
        const authorBadge = d.author === 'ai' ? '<span style="color: #667eea;">(AI)</span>' : '';
        const privacyMark = isPrivacy ? '<span style="color: #ff9800;">🔒</span>' : '';

        return `
          <label class="checkbox_label" style="margin: 8px 0; display: flex; ${isPrivacy ? 'opacity: 0.5;' : ''}">
            <input type="checkbox"
                   data-diary-id="${d.id}"
                   ${isPrivacy ? 'disabled title="隐私日记不可发送"' : ''}>
            <span>
              ${d.date} ${d.title} ${authorBadge} ${privacyMark}
            </span>
          </label>
        `;
      }).join('');

      // 创建自定义弹窗（类似 diary-preset-ui.js 的做法）
      const overlay = document.createElement('div');
      overlay.className = 'diary-preset-dialog-overlay';  // 复用预设弹窗样式
      overlay.innerHTML = `
        <div class="diary-preset-dialog-container" style="max-width: 600px;">
          <div style="text-align: left; max-height: 60vh; overflow-y: auto; padding: 20px;">
            <h3 style="margin-top: 0; color: var(--SmartThemeQuoteColor);">
              <i class="fa-solid fa-list-check"></i> 选择要发送给AI的日记
            </h3>

            <p style="color: var(--white50a); font-size: 0.9em; margin: 10px 0;">
              勾选的日记将在下次生成评论时作为历史日记上下文，隐私日记（🔒）无法勾选。
            </p>

            <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--SmartThemeBorderColor); opacity: 0.3;">

            <div style="margin: 15px 0;">
              ${diariesHTML}
            </div>

            <p style="color: var(--white50a); font-size: 0.9em; margin-top: 15px;">
              <i class="fa-solid fa-info-circle"></i>
              提示：选择后将优先使用这些日记，替代"历史日记数量"设置
            </p>
          </div>
          <div class="diary-preset-dialog-buttons">
            <button class="diary-preset-dialog-btn diary-preset-dialog-select-all" style="margin-right: auto;">
              全选
            </button>
            <button class="diary-preset-dialog-btn diary-preset-dialog-cancel">取消</button>
            <button class="diary-preset-dialog-btn diary-preset-dialog-ok">应用选择</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 添加 active 类触发显示动画
      setTimeout(() => {
        overlay.classList.add('active');
      }, 10);

      // 绑定事件
      const cancelBtn = overlay.querySelector('.diary-preset-dialog-cancel');
      const okBtn = overlay.querySelector('.diary-preset-dialog-ok');
      const selectAllBtn = overlay.querySelector('.diary-preset-dialog-select-all');

      const close = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.remove();
          resolve(false);
        }, 300);
      };

      const save = () => {
        // 在弹窗关闭前读取复选框状态
        const checkboxes = overlay.querySelectorAll('[data-diary-id]');
        const selectedIds = [];
        checkboxes.forEach(cb => {
          if (cb.checked && !cb.disabled) {
            selectedIds.push(cb.dataset.diaryId);
          }
        });

        logger.info('diary', '[DiaryUI.showSelectSendPanel] 用户选择了', selectedIds.length, '篇日记');

        if (selectedIds.length === 0) {
          if (typeof toastr !== 'undefined') {
            toastr.warning('请至少选择一篇日记');
          }
          return;
        }

        // 直接触发生成评论（不保存状态，不显示通知）
        if (this.api) {
          this.api.requestCommentForSelectedDiaries(selectedIds);
          logger.info('diary', '[DiaryUI.showSelectSendPanel] 已触发批量生成');
        }

        // 关闭弹窗
        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.remove();
          resolve(true);
        }, 300);
      };

      // 全选/取消全选功能
      const toggleSelectAll = () => {
        const checkboxes = overlay.querySelectorAll('[data-diary-id]:not([disabled])');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        if (allChecked) {
          // 当前全选 → 取消全选
          checkboxes.forEach(cb => cb.checked = false);
          selectAllBtn.textContent = '全选';
          logger.debug('diary', '[DiaryUI.showSelectSendPanel] 取消全选');
        } else {
          // 未全选 → 全选
          checkboxes.forEach(cb => cb.checked = true);
          selectAllBtn.textContent = '取消全选';
          logger.debug('diary', '[DiaryUI.showSelectSendPanel] 全选日记');
        }
      };

      cancelBtn.addEventListener('click', close);
      okBtn.addEventListener('click', save);
      selectAllBtn.addEventListener('click', toggleSelectAll);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    });
  }

  // ========================================
  // [FUNC] 向后兼容的委托方法
  // ========================================

  /**
   * 更新AI回复预览内容（委托给子模块）
   *
   * @description
   * 此方法被 diary-api.js 调用，委托给 previewModule 处理
   * 保留是为了向后兼容（不需要修改 API 模块的调用代码）
   */
  updateAiPreview(text) {
    this.previewModule.updatePreview(text);
  }

  /**
   * 清空AI回复预览（委托给子模块）
   *
   * @description
   * 此方法被 completeCurrentDiary 调用，委托给 previewModule 处理
   * 保留是为了向后兼容
   */
  clearAiPreview(hideButton = false) {
    this.previewModule.clearPreview(hideButton);
  }

  // ========================================
  // [FUNC] 调试方法
  // ========================================

  /**
   * 调试方法：检查日记数据和DOM一致性
   */
  debugDiaryComments() {
    logger.debug('diary', '\n========== 📊 日记数据检查（extension_settings中的原始数据） ==========\n');

    const diaries = this.dataManager.getDiaries();
    diaries.forEach((diary, index) => {
      logger.debug('diary', `[${index}] ${diary.title} (ID: ${diary.id})`);
      logger.debug('diary', `  📝 顶层评论数: ${diary.comments?.length || 0}`);

      if (diary.comments && diary.comments.length > 0) {
        let totalComments = 0;
        const countReplies = (comments) => {
          comments.forEach(comment => {
            totalComments++;
            if (comment.replies && comment.replies.length > 0) {
              countReplies(comment.replies);
            }
          });
        };
        countReplies(diary.comments);
        logger.debug('diary', `  💬 总评论数（含回复）: ${totalComments}`);

        diary.comments.forEach((comment, i) => {
          logger.debug('diary', `    [${i}] ${comment.authorName}: ${comment.content.substring(0, 40)}...`);
          if (comment.replies && comment.replies.length > 0) {
            const showReplies = (replies, level) => {
              replies.forEach((reply, j) => {
                const indent = '  '.repeat(level);
                logger.debug('diary', `    ${indent}└─ [${j}] ${reply.authorName}: ${reply.content.substring(0, 30)}...`);
                if (reply.replies && reply.replies.length > 0) {
                  showReplies(reply.replies, level + 1);
                }
              });
            };
            showReplies(comment.replies, 2);
          }
        });
      }
      logger.debug('diary', '');
    });

    logger.debug('diary', '\n========== 🎨 DOM卡片检查（实际渲染的HTML） ==========\n');
    const allCards = this.sliderElement.querySelectorAll('.diary-card');
    logger.debug('diary', `总卡片数: ${allCards.length}\n`);

    allCards.forEach((card, index) => {
      const cardElement = /** @type {HTMLElement} */ (card);
      const diaryId = cardElement.dataset.diaryId;
      const titleEl = card.querySelector('.diary-day');
      const title = titleEl?.textContent || '未知';
      const commentItems = card.querySelectorAll('.comment-item');

      const diaryData = diaries.find(d => d.id === diaryId);
      const dataCommentCount = diaryData?.comments?.length || 0;

      logger.debug('diary', `[${index}] ${title} (ID: ${diaryId})`);
      logger.debug('diary', `  📝 数据中的评论数: ${dataCommentCount}`);
      logger.debug('diary', `  🎨 DOM中的评论元素数: ${commentItems.length}`);

      if (dataCommentCount !== commentItems.length) {
        console.error(`  ⚠️ 不一致！数据有${dataCommentCount}条，DOM只显示${commentItems.length}条`);
      } else if (dataCommentCount > 0) {
        logger.debug('diary', '  ✅ 一致');
      }
      logger.debug('diary', '');
    });

    logger.debug('diary', '========================================\n');
  }

  /**
   * 销毁UI
   */
  destroy() {
    if (this.panelElement) {
      this.panelElement.remove();
      this.panelElement = null;
    }
    logger.debug('diary', '[DiaryUI.destroy] UI已销毁');
  }
}

// 导出调试方法到全局（方便控制台调用）
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).debugDiaryComments = function () {
    const diarySystem = /** @type {any} */ (window).getDiarySystem?.();
    if (diarySystem?.ui) {
      diarySystem.ui.debugDiaryComments();
    } else {
      logger.error('diary', '[DiaryUI.debugDiaryComments] 日记系统未初始化');
    }
  };
}
