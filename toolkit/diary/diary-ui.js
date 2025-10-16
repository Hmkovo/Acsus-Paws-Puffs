/**
 * 日记UI渲染器
 * 
 * @description
 * 负责渲染轮播图日记面板、卡片、评论区。
 * 处理用户交互（翻页、筛选、打开/关闭面板）。
 * 
 * @module DiaryUI
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { getContext } from '../../../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../../popup.js';
import {
  showDiaryToast,
  showSuccessToast,
  showInfoToast,
  showErrorToast
} from './diary-toast.js';
import logger from '../../logger.js';
import { DiaryPresetDataManager } from './diary-preset-data.js';
import { DiaryPresetUI } from './diary-preset-ui.js';
import { DiaryVisualSettings } from './diary-visual-settings.js';

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
    /**
     * 数据管理器引用
     * @type {import('./diary-data.js').DiaryDataManager}
     */
    this.dataManager = dataManager;

    /**
     * 预设数据管理器
     * @type {DiaryPresetDataManager}
     */
    this.presetDataManager = new DiaryPresetDataManager();

    /**
     * 预设UI管理器
     * @type {DiaryPresetUI}
     */
    this.presetUI = new DiaryPresetUI(this.presetDataManager);

    /**
     * 视觉设置管理器
     * @type {DiaryVisualSettings}
     */
    this.visualSettings = new DiaryVisualSettings(dataManager);

    /**
     * API管理器引用（后续注入）
     * @type {import('./diary-api.js').DiaryAPI|null}
     */
    this.api = null;

    /**
     * 编辑器引用（后续注入）
     * @type {import('./diary-editor.js').DiaryEditor|null}
     */
    this.editor = null;

    /**
     * 面板容器元素
     * @type {HTMLElement|null}
     */
    this.panelElement = null;

    /**
     * 轮播图容器
     * @type {HTMLElement|null}
     */
    this.sliderElement = null;

    /**
     * 当前筛选条件
     * @type {Object}
     */
    this.filter = {
      type: 'all',     // 'all' | 'user' | 'ai' | 'week' | 'month'
      searchText: '',
      weekOffset: 0    // 周偏移（0=本周，-1=上周，1=下周）
    };

    /**
     * 当前显示的日记索引
     * @type {number}
     */
    this.currentIndex = 0;
  }

  /**
   * 设置API管理器引用
   * 
   * @param {import('./diary-api.js').DiaryAPI} api - API管理器
   */
  setAPI(api) {
    this.api = api;
    // 将预设管理器传递给 API
    if (api) {
      api.setPresetManager(this.presetDataManager);
    }
  }

  /**
   * 设置编辑器引用
   * 
   * @param {import('./diary-editor.js').DiaryEditor} editor - 编辑器
   */
  setEditor(editor) {
    this.editor = editor;
  }

  /**
   * 初始化UI
   * 
   * @async
   */
  async init() {
    logger.info('[DiaryUI] 开始初始化');

    // 加载HTML模板
    await this.loadTemplate();

    // 创建面板DOM
    this.createPanel();

    // 初始化预设UI
    this.presetUI.init();

    // 初始化视觉设置
    this.visualSettings.init(this.panelElement);
    this.visualSettings.apply();

    // 绑定事件
    this.bindEvents();

    logger.info('[DiaryUI] 初始化完成');
  }

  /**
   * 加载HTML模板
   * 
   * @async
   */
  async loadTemplate() {
    try {
      const response = await fetch('/scripts/extensions/third-party/Acsus-Paws-Puffs/toolkit/diary/diary-panel.html');
      if (!response.ok) {
        throw new Error('加载模板失败');
      }
      this.templateHTML = await response.text();
      logger.debug('[DiaryUI.loadTemplate] HTML模板已加载');
    } catch (error) {
      logger.error('[DiaryUI.loadTemplate] 加载失败:', error);
      // 使用内联模板作为后备
      this.templateHTML = this.getInlineTemplate();
    }
  }

  /**
   * 获取内联HTML模板（后备方案）
   * 
   * @returns {string}
   */
  getInlineTemplate() {
    return `
            <div class="diary-panel" id="diaryPanel">
                <div class="diary-header">
                    <h2>日记本 - <span id="diaryCharName"></span></h2>
                    <button class="diary-close-btn">❌</button>
                </div>
                <div class="diary-slider" id="diarySlider">
                    <!-- 日记卡片将动态生成 -->
                </div>
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
    // 检查是否已存在
    let panel = document.getElementById('diaryPanel');
    if (panel) {
      this.panelElement = panel;
      this.sliderElement = panel.querySelector('#diarySlider');
      return;
    }

    // 创建容器并插入所有HTML内容（包括面板和模板）
    const container = document.createElement('div');
    container.innerHTML = this.templateHTML;

    // 将所有子元素添加到body（包括面板和template元素）
    while (container.firstChild) {
      document.body.appendChild(container.firstChild);
    }

    // 获取面板引用
    this.panelElement = /** @type {HTMLElement} */ (document.getElementById('diaryPanel'));

    // 隐藏面板（默认不显示）
    if (this.panelElement) {
      this.panelElement.style.display = 'none';

      // 获取轮播图容器
      this.sliderElement = this.panelElement.querySelector('#diarySlider');
    }

    logger.debug('[DiaryUI.createPanel] 面板DOM已创建（包括模板）');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    if (!this.panelElement) return;

    // 关闭按钮
    const closeBtn = this.panelElement.querySelector('.diary-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePanel());
    }

    // 翻页按钮
    const prevBtn = this.panelElement.querySelector('.diary-prev');
    const nextBtn = this.panelElement.querySelector('.diary-next');
    if (prevBtn) prevBtn.addEventListener('click', () => this.prevPage());
    if (nextBtn) nextBtn.addEventListener('click', () => this.nextPage());

    // 操作按钮（移除编辑和删除，已整合到卡片上）
    const newBtn = this.panelElement.querySelector('.diary-new');
    const sendBtn = this.panelElement.querySelector('.diary-send');

    if (newBtn) newBtn.addEventListener('click', () => this.createNewDiary());
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        // 检查是否正在生成
        if (this.api && this.api.isGenerating) {
          // 正在生成 → 中止
          this.api.abort();
        } else {
          // 未生成 → 开始生成
          this.completeCurrentDiary();
        }
      });
    }

    // AI回复预览按钮
    const aiPreviewBtn = this.panelElement.querySelector('#diaryAiPreviewBtn');
    if (aiPreviewBtn) {
      aiPreviewBtn.addEventListener('click', () => this.toggleAiPreviewPanel());
    }

    // AI回复预览面板事件
    const aiPreviewCloseBtn = this.panelElement.querySelector('#diaryAiPreviewClose');
    const aiPreviewEditBtn = this.panelElement.querySelector('#diaryAiPreviewEdit');
    const aiPreviewParseBtn = this.panelElement.querySelector('#diaryAiPreviewParse');
    const aiPreviewClearBtn = this.panelElement.querySelector('#diaryAiPreviewClear');

    if (aiPreviewCloseBtn) {
      aiPreviewCloseBtn.addEventListener('click', () => this.closeAiPreviewPanel());
    }
    if (aiPreviewEditBtn) {
      aiPreviewEditBtn.addEventListener('click', () => this.editAiPreview());
    }
    if (aiPreviewParseBtn) {
      aiPreviewParseBtn.addEventListener('click', () => this.parseAiPreview());
    }
    if (aiPreviewClearBtn) {
      aiPreviewClearBtn.addEventListener('click', () => this.clearAiPreview(true));
    }

    // 搜索切换按钮
    const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
    if (searchToggleBtn) searchToggleBtn.addEventListener('click', () => this.toggleSearchBar());

    // 预设按钮
    const presetBtn = this.panelElement.querySelector('#diaryPresetBtn');
    if (presetBtn) presetBtn.addEventListener('click', () => this.togglePresetPanel());

    // 视觉设置按钮
    const visualBtn = this.panelElement.querySelector('#diaryVisualBtn');
    if (visualBtn) visualBtn.addEventListener('click', () => this.toggleVisualPanel());

    // 设置按钮
    const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => this.toggleSettingsPanel());

    // 设置面板实时保存
    this.bindSettingsPanelEvents();

    // 筛选下拉
    const filterSelect = this.panelElement.querySelector('#diaryFilterSelect');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        const filterType = /** @type {HTMLSelectElement} */ (e.target).value;
        this.handleFilterChange(filterType);
      });
    }

    // 周筛选面板按钮
    const weekPrevBtn = this.panelElement.querySelector('.diary-week-prev-btn');
    const weekNextBtn = this.panelElement.querySelector('.diary-week-next-btn');
    if (weekPrevBtn) {
      weekPrevBtn.addEventListener('click', () => {
        this.filter.weekOffset--;
        this.refreshDiaries();
        this.updatePeriodLabel();
      });
    }
    if (weekNextBtn) {
      weekNextBtn.addEventListener('click', () => {
        this.filter.weekOffset++;
        this.refreshDiaries();
        this.updatePeriodLabel();
      });
    }

    // 月筛选面板按钮
    const monthPrevBtn = this.panelElement.querySelector('.diary-month-prev-btn');
    const monthNextBtn = this.panelElement.querySelector('.diary-month-next-btn');
    if (monthPrevBtn) {
      monthPrevBtn.addEventListener('click', () => {
        this.filter.monthOffset = (this.filter.monthOffset || 0) - 1;
        this.refreshDiaries();
        this.updatePeriodLabel();
      });
    }
    if (monthNextBtn) {
      monthNextBtn.addEventListener('click', () => {
        this.filter.monthOffset = (this.filter.monthOffset || 0) + 1;
        this.refreshDiaries();
        this.updatePeriodLabel();
      });
    }

    // 日期选择器
    const datePicker = this.panelElement.querySelector('#diaryDatePicker');
    const dateClearBtn = this.panelElement.querySelector('.diary-date-clear-btn');
    if (datePicker) {
      datePicker.addEventListener('change', (e) => {
        this.filter.selectedDate = /** @type {HTMLInputElement} */ (e.target).value;
        this.refreshDiaries();
        logger.info('[DiaryUI] 已选择日期:', this.filter.selectedDate);
      });
    }
    if (dateClearBtn) {
      dateClearBtn.addEventListener('click', () => {
        if (datePicker) /** @type {HTMLInputElement} */ (datePicker).value = '';
        this.filter.selectedDate = '';
        this.refreshDiaries();
        logger.info('[DiaryUI] 已清除日期筛选');
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

    // 触摸滑动支持（从你的HTML提取）
    this.bindTouchEvents();

    // 键盘支持
    this.bindKeyboardEvents();

    // 鼠标滚轮支持
    this.bindWheelEvents();

    // 全局评论按钮事件委托（修复重复绑定问题）
    this.bindGlobalCommentEvents();

    logger.debug('[DiaryUI.bindEvents] 事件已绑定');
  }

  /**
   * 绑定触摸事件
   */
  bindTouchEvents() {
    if (!this.sliderElement) return;

    let touchStartX = 0;
    let touchEndX = 0;

    this.sliderElement.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    this.sliderElement.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].clientX;

      const swipeThreshold = 50;
      if (touchStartX - touchEndX > swipeThreshold) {
        this.nextPage();
      } else if (touchEndX - touchStartX > swipeThreshold) {
        this.prevPage();
      }
    }, { passive: true });
  }

  /**
   * 绑定键盘事件
   */
  bindKeyboardEvents() {
    const keyHandler = (e) => {
      if (!this.isPanelOpen()) return;

      if (e.key === 'ArrowRight') {
        this.nextPage();
      } else if (e.key === 'ArrowLeft') {
        this.prevPage();
      } else if (e.key === 'Escape') {
        this.closePanel();
      }
    };

    document.addEventListener('keydown', keyHandler);
    this.keyHandler = keyHandler; // 保存引用，用于销毁时移除
  }

  /**
   * 绑定滚轮事件
   * 
   * @description
   * 已禁用鼠标滚轮翻页，只保留箭头键和按钮翻页
   */
  bindWheelEvents() {
    // 禁用滚轮翻页（用户反馈：只用箭头移动）
    // 代码已注释，不再绑定wheel事件
  }

  /**
   * 打开面板
   */
  openPanel() {
    if (!this.panelElement) {
      logger.error('[DiaryUI.openPanel] 面板未初始化');
      return;
    }

    // 重置筛选器为"全部"（确保用户能看到所有日记）
    this.filter.type = 'all';
    this.filter.searchText = '';
    this.filter.weekOffset = 0;
    this.filter.monthOffset = 0;
    this.filter.selectedDate = '';

    // 更新UI元素
    const filterSelect = this.panelElement.querySelector('#diaryFilterSelect');
    const searchInput = this.panelElement.querySelector('#diarySearchInput');
    const searchBar = this.panelElement.querySelector('#diarySearchBar');
    const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
    const weekNav = this.panelElement.querySelector('#diaryWeekNav');

    const settingsPanel = this.panelElement.querySelector('#diarySettingsPanel');
    const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');

    if (filterSelect) /** @type {HTMLSelectElement} */ (filterSelect).value = 'all';
    if (searchInput) /** @type {HTMLInputElement} */ (searchInput).value = '';
    if (searchBar) searchBar.classList.remove('active');  // 重置搜索栏为隐藏
    if (searchToggleBtn) searchToggleBtn.classList.remove('active');  // 重置搜索按钮状态
    if (settingsPanel) settingsPanel.classList.remove('active');  // 重置设置面板为隐藏
    if (settingsBtn) settingsBtn.classList.remove('active');  // 重置设置按钮状态

    // 关闭所有筛选面板
    this.closeAllFilterPanels();

    // 刷新日记列表
    this.refreshDiaries();

    // 显示面板（带动画）
    this.panelElement.style.display = 'flex';
    setTimeout(() => {
      this.panelElement.classList.add('active');
    }, 10);

    logger.info('[DiaryUI.openPanel] 面板已打开');
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

    logger.info('[DiaryUI.closePanel] 面板已关闭');
  }

  /**
   * 检查面板是否打开
   * 
   * @returns {boolean}
   */
  isPanelOpen() {
    return this.panelElement && this.panelElement.style.display !== 'none';
  }

  /**
   * 刷新日记列表
   * 
   * @param {boolean} [keepPosition=false] - 是否保持当前位置（不自动翻页）
   */
  refreshDiaries(keepPosition = false) {
    this.dataManager.loadDiaries();
    const diaries = this.dataManager.diaries;
    logger.debug('[DiaryUI.refreshDiaries] 加载了', diaries.length, '篇日记');
    this.renderDiaries(keepPosition);
    logger.debug('[DiaryUI.refreshDiaries] 日记列表已刷新');
  }

  /**
   * 刷新日记列表并保持在指定日记（无跳跃）
   * 
   * @param {string} targetDiaryId - 目标日记ID
   * 
   * @description
   * 用于删除/回复评论后，平滑刷新，不产生视觉跳跃
   * 策略：只更新目标日记的DOM，不重新渲染整个列表
   */
  refreshAndStayAtDiary(targetDiaryId) {
    // 刷新数据
    this.dataManager.loadDiaries();

    logger.debug('[DiaryUI.refreshAndStayAtDiary] 目标日记ID:', targetDiaryId);

    // 找到目标日记的卡片DOM
    const allCards = this.sliderElement.querySelectorAll('.diary-card');
    let targetCard = null;

    allCards.forEach(card => {
      const cardElement = /** @type {HTMLElement} */ (card);
      if (cardElement.dataset.diaryId === targetDiaryId) {
        targetCard = cardElement;
      }
    });

    if (!targetCard) {
      logger.warn('[DiaryUI.refreshAndStayAtDiary] 目标日记卡片不在DOM中，执行完整刷新');
      this.refreshDiaries(true);
      return;
    }

    // 只更新目标卡片的评论区
    const diary = this.dataManager.getDiary(targetDiaryId);
    if (!diary) {
      logger.warn('[DiaryUI.refreshAndStayAtDiary] 目标日记不存在');
      return;
    }

    // 找到评论区元素
    const commentsEl = targetCard.querySelector('.diary-comments');
    if (commentsEl) {
      // 重新渲染评论
      commentsEl.innerHTML = this.renderComments(diary.comments);
      logger.debug('[DiaryUI.refreshAndStayAtDiary] 已更新评论区，无视觉跳跃');
    }

    // 重新绑定评论按钮事件（因为DOM重新生成了）
    this.bindCommentButtons(targetCard, targetDiaryId);

    logger.debug('[DiaryUI.refreshAndStayAtDiary] 刷新完成，停留在目标日记');
  }

  /**
   * 渲染日记卡片
   * 
   * @param {boolean} [keepPosition=false] - 是否保持当前位置（不自动翻页）
   * @description
   * 重新渲染所有日记卡片。
   * - keepPosition=false: 默认显示最新日记
   * - keepPosition=true: 保持当前显示的日记（通过记住ID并调整DOM顺序）
   */
  renderDiaries(keepPosition = false) {
    if (!this.sliderElement) return;

    // 获取过滤后的日记
    const diaries = this.getFilteredDiaries();

    logger.debug('[DiaryUI.renderDiaries] 筛选后日记数:', diaries.length);
    logger.debug('[DiaryUI.renderDiaries] 当前筛选:', this.filter);

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

    // 如果 keepPosition=true，记住当前显示的日记ID（第二张卡片 = 中间大卡片）
    let currentDiaryId = null;
    if (keepPosition) {
      const allCards = this.sliderElement.querySelectorAll('.diary-card');
      if (allCards.length >= 2) {
        const currentCard = /** @type {HTMLElement} */ (allCards[1]);
        currentDiaryId = currentCard.dataset.diaryId;
        logger.debug('[DiaryUI.renderDiaries] 记住当前显示的日记ID:', currentDiaryId);
      }
    }

    // 渲染轮播图
    this.sliderElement.innerHTML = '';
    diaries.forEach(diary => {
      const card = this.createDiaryCard(diary);
      this.sliderElement.appendChild(card);
    });

    // 如果 keepPosition=true 且记住了日记ID，调整卡片顺序让它显示在中间
    if (keepPosition && currentDiaryId && diaries.length >= 2) {
      const allCards = this.sliderElement.querySelectorAll('.diary-card');
      let targetIndex = -1;

      // 找到目标卡片的当前DOM索引
      allCards.forEach((card, index) => {
        const cardElement = /** @type {HTMLElement} */ (card);
        if (cardElement.dataset.diaryId === currentDiaryId) {
          targetIndex = index;
        }
      });

      logger.debug('[DiaryUI.renderDiaries] 目标日记在DOM中的索引:', targetIndex, '（需要在索引1 = 中间位置）');

      // 调整DOM顺序：让目标卡片显示在 nth-child(2)（索引1）的位置
      if (targetIndex !== -1 && targetIndex !== 1) {
        if (targetIndex === 0) {
          // 目标在第一张（索引0），需要移到第二张（索引1）
          // 策略：把最后一张移到最前面
          const lastCard = allCards[allCards.length - 1];
          this.sliderElement.insertBefore(lastCard, allCards[0]);
          logger.debug('[DiaryUI.renderDiaries] 目标在第一张，把最后一张移到前面');
        } else {
          // 目标在第三张或更后面，需要移到第二张
          // 策略：把目标之前的卡片（除了第一张）移到最后
          for (let i = 1; i < targetIndex; i++) {
            this.sliderElement.appendChild(allCards[i]);
          }
          logger.debug('[DiaryUI.renderDiaries] 目标在第', targetIndex + 1, '张，已调整到中间');
        }
        logger.debug('[DiaryUI.renderDiaries] 已调整卡片顺序，保持显示:', currentDiaryId);
      } else if (targetIndex === 1) {
        logger.debug('[DiaryUI.renderDiaries] 当前日记已在中间位置（索引1），无需调整');
      } else if (targetIndex === -1) {
        logger.warn('[DiaryUI.renderDiaries] 未找到目标日记，可能已被筛选掉');
      }
    } else if (diaries.length >= 2 && !keepPosition) {
      // 默认显示最新日记
      setTimeout(() => {
        this.prevPage();
        logger.debug('[DiaryUI.renderDiaries] 已自动翻页，最新日记显示在大卡片');
      }, 50);  // 短延迟，等DOM渲染完成
    }

    logger.debug('[DiaryUI.renderDiaries] 已渲染', diaries.length, '篇日记', keepPosition ? '(保持位置)' : '');
  }

  /**
   * 创建日记卡片DOM
   * 
   * @description
   * 使用HTML模板克隆，而不是字符串拼接，结构更清晰
   * 
   * @param {Object} diary - 日记对象
   * @returns {HTMLElement}
   */
  createDiaryCard(diary) {
    // 克隆模板
    const template = /** @type {HTMLTemplateElement} */ (document.getElementById('diaryCardTemplate'));
    const clonedContent = template.content.cloneNode(true);
    const card = /** @type {HTMLElement} */ (/** @type {DocumentFragment} */ (clonedContent).querySelector('.diary-card'));

    card.dataset.diaryId = diary.id;

    // 填充数据
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

    // 渲染评论（添加详细日志）
    if (commentsEl) {
      const commentCount = diary.comments?.length || 0;
      logger.debug(`[DiaryUI.createDiaryCard] 渲染日记"${diary.title}"的评论，数据中有 ${commentCount} 条顶层评论`);
      const commentsHTML = this.renderComments(diary.comments);

      // 先清空，然后添加评论HTML
      commentsEl.innerHTML = '';
      if (commentsHTML) {
        const commentsContainer = document.createElement('div');
        commentsContainer.innerHTML = commentsHTML;
        commentsEl.appendChild(commentsContainer);
      }

      // 根据日记作者显示不同的按钮
      const requestCommentBtn = commentsEl.querySelector('.diary-request-comment-btn');
      const replyDiaryBtn = commentsEl.querySelector('.diary-reply-diary-btn');

      if (diary.author === 'user') {
        // 用户日记：显示"请求评论"按钮
        if (requestCommentBtn) {
          requestCommentBtn.style.display = '';
          const charNameSpan = requestCommentBtn.querySelector('.char-name');
          if (charNameSpan) {
            const ctx = getContext();
            charNameSpan.textContent = ctx.name2 || 'AI';
          }
        }
        if (replyDiaryBtn) replyDiaryBtn.style.display = 'none';
      } else if (diary.author === 'ai') {
        // AI日记：显示"回复日记"按钮
        if (requestCommentBtn) requestCommentBtn.style.display = 'none';
        if (replyDiaryBtn) replyDiaryBtn.style.display = '';
      }

      logger.debug(`[DiaryUI.createDiaryCard] 生成的评论HTML长度: ${commentsHTML.length} 字符`);
    }

    // 更新隐私按钮状态
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

      // 绑定事件
      privacyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        logger.debug('[DiaryUI] 隐私按钮被点击 - diaryId:', diary.id);
        this.togglePrivacy(diary.id);
      });
    }

    // 绑定编辑按钮事件
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        logger.debug('[DiaryUI] 编辑按钮被点击 - diaryId:', diary.id);
        this.toggleEditMode(card, diary);
      });
    }

    // 绑定评论按钮事件（使用事件委托处理动态生成的按钮）
    this.bindCommentButtons(card, diary.id);

    return card;
  }

  /**
   * 绑定全局评论按钮事件（只绑定一次，避免重复）
   * 
   * @description
   * 使用全局事件委托，监听整个轮播图容器的点击事件。
   * 修复了之前每次刷新都重复绑定导致的重复触发问题。
   */
  bindGlobalCommentEvents() {
    if (!this.sliderElement) return;

    // 全局事件委托（只绑定一次）
    this.sliderElement.addEventListener('click', async (e) => {
      const target = /** @type {HTMLElement} */ (e.target);

      // 回复按钮
      const replyBtn = target.closest('.comment-reply-btn');
      if (replyBtn) {
        e.stopPropagation();
        const commentId = /** @type {HTMLElement} */ (replyBtn).dataset.commentId;

        // 找到对应的日记卡片，获取日记ID
        const card = target.closest('.diary-card');
        if (!card) return;
        const diaryId = /** @type {HTMLElement} */ (card).dataset.diaryId;
        if (!diaryId) return;

        logger.debug('[DiaryUI] 回复按钮被点击 - commentId:', commentId);
        await this.replyToComment(diaryId, commentId);
        return;
      }

      // 删除按钮
      const deleteBtn = target.closest('.comment-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const commentId = /** @type {HTMLElement} */ (deleteBtn).dataset.commentId;

        // 找到对应的日记卡片，获取日记ID
        const card = target.closest('.diary-card');
        if (!card) return;
        const diaryId = /** @type {HTMLElement} */ (card).dataset.diaryId;
        if (!diaryId) return;

        logger.debug('[DiaryUI] 删除按钮被点击 - commentId:', commentId);
        await this.deleteComment(diaryId, commentId);
        return;
      }

      // 回复AI日记按钮
      const replyDiaryBtn = target.closest('.diary-reply-diary-btn');
      if (replyDiaryBtn) {
        e.stopPropagation();

        // 找到对应的日记卡片，获取日记ID
        const card = target.closest('.diary-card');
        if (!card) return;
        const diaryId = /** @type {HTMLElement} */ (card).dataset.diaryId;
        if (!diaryId) return;

        logger.debug('[DiaryUI] 回复日记按钮被点击 - diaryId:', diaryId);
        await this.replyToAIDiary(diaryId);
        return;
      }
    });

    logger.debug('[DiaryUI.bindGlobalCommentEvents] 全局评论事件已绑定（事件委托）');
  }

  /**
   * 绑定评论按钮事件（已废弃，改为全局事件委托）
   * 
   * @deprecated 使用 bindGlobalCommentEvents 代替
   * @param {HTMLElement} card - 卡片元素
   * @param {string} diaryId - 日记ID
   */
  bindCommentButtons(card, diaryId) {
    // 已改为全局事件委托，此方法保留为空，避免破坏现有调用
    // 不再绑定事件，防止重复绑定
  }

  /**
   * 回复评论
   * 
   * @async
   * @param {string} diaryId - 日记ID
   * @param {string} commentId - 评论ID
   */
  async replyToComment(diaryId, commentId) {
    const { callGenericPopup, POPUP_TYPE } = await import('../../../../../popup.js');

    // 弹出输入框
    const replyContent = await callGenericPopup(
      '<textarea id="comment-reply-input" rows="3" style="width: 100%; padding: 8px; background: var(--black30a); border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; color: var(--SmartThemeBodyColor); resize: vertical;" placeholder="写下你的回复..."></textarea>',
      POPUP_TYPE.INPUT,
      '',
      { okButton: '发送', cancelButton: '取消', wide: false }
    );

    // 类型检查和转换
    const replyText = String(replyContent || '');
    if (!replyText.trim()) {
      logger.debug('[DiaryUI.replyToComment] 用户取消或内容为空');
      return;
    }

    // 创建回复对象
    const ctx = getContext();
    const reply = {
      id: this.dataManager.generateTimestampId(),
      author: 'user',
      authorName: ctx.name1 || 'User',
      content: replyText.trim(),
      timestamp: Date.now(),
      replies: []
    };

    // 添加回复
    this.dataManager.addComment(diaryId, reply, commentId);

    // 刷新UI并保持在当前日记
    this.refreshAndStayAtDiary(diaryId);

    // 通知
    showSuccessToast('回复已添加');
    logger.info('[DiaryUI.replyToComment] 回复已添加到评论:', commentId);
  }

  /**
   * 回复AI的日记
   * 
   * @async
   * @param {string} diaryId - 日记ID
   * 
   * @description
   * 让用户回复AI写的日记，添加为顶层评论。
   * 与回复评论不同，这是直接回复整篇日记，不是回复某条评论。
   */
  async replyToAIDiary(diaryId) {
    const { callGenericPopup, POPUP_TYPE } = await import('../../../../../popup.js');

    // 弹出输入框
    const replyContent = await callGenericPopup(
      '<textarea id="diary-reply-input" rows="5" style="width: 100%; padding: 8px; background: var(--black30a); border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; color: var(--SmartThemeBodyColor); resize: vertical;" placeholder="写下你对这篇日记的回复..."></textarea>',
      POPUP_TYPE.INPUT,
      '',
      { okButton: '发送', cancelButton: '取消', wide: false }
    );

    // 类型检查和转换
    const replyText = String(replyContent || '');
    if (!replyText.trim()) {
      logger.debug('[DiaryUI.replyToAIDiary] 用户取消或内容为空');
      return;
    }

    // 创建回复对象（作为顶层评论）
    const ctx = getContext();
    const reply = {
      id: this.dataManager.generateTimestampId(),
      author: 'user',
      authorName: ctx.name1 || 'User',
      content: replyText.trim(),
      timestamp: Date.now(),
      replies: []
    };

    // 添加为顶层评论（不传 parentCommentId）
    this.dataManager.addComment(diaryId, reply);

    // 刷新UI并保持在当前日记
    this.refreshAndStayAtDiary(diaryId);

    // 通知
    showSuccessToast('回复已添加');
    logger.info('[DiaryUI.replyToAIDiary] 回复已添加到AI日记:', diaryId);
  }

  /**
   * 删除评论
   * 
   * @async
   * @param {string} diaryId - 日记ID
   * @param {string} commentId - 评论ID
   */
  async deleteComment(diaryId, commentId) {
    const { callGenericPopup, POPUP_TYPE } = await import('../../../../../popup.js');

    // 确认删除
    const confirmed = await callGenericPopup(
      '确认删除这条评论吗？\n\n⚠️ 此操作不可撤销！',
      POPUP_TYPE.CONFIRM,
      '',
      { okButton: '删除', cancelButton: '取消' }
    );

    if (!confirmed) {
      logger.debug('[DiaryUI.deleteComment] 用户取消删除');
      return;
    }

    // 删除评论
    this.dataManager.deleteComment(diaryId, commentId);

    // 刷新UI并保持在当前日记
    this.refreshAndStayAtDiary(diaryId);

    // 通知
    showSuccessToast('评论已删除');
    logger.info('[DiaryUI.deleteComment] 评论已删除:', commentId);
  }

  /**
   * 切换日记编辑模式
   * 
   * @param {HTMLElement} card - 卡片元素
   * @param {Object} diary - 日记对象
   */
  toggleEditMode(card, diary) {
    const content = card.querySelector('.diary-content');
    const isEditing = content.classList.contains('editing');

    logger.debug('[DiaryUI.toggleEditMode] 当前状态 - editing类:', isEditing, 'diaryId:', diary.id);

    if (isEditing) {
      // 退出编辑模式
      logger.debug('[DiaryUI.toggleEditMode] 退出编辑模式');
      this.exitEditMode(card);
    } else {
      // 进入编辑模式
      logger.debug('[DiaryUI.toggleEditMode] 进入编辑模式');
      this.enterEditMode(card, diary);
    }
  }

  /**
   * 进入编辑模式
   * 
   * @param {HTMLElement} card - 卡片元素
   * @param {Object} diary - 日记对象
   */
  enterEditMode(card, diary) {
    const content = card.querySelector('.diary-content');

    logger.debug('[DiaryUI.enterEditMode] 开始进入编辑模式 - diaryId:', diary.id);
    logger.debug('[DiaryUI.enterEditMode] content元素:', content);
    logger.debug('[DiaryUI.enterEditMode] 是否已有editing类:', content.classList.contains('editing'));

    // 如果已经在编辑模式，不重复进入
    if (content.classList.contains('editing')) {
      logger.warn('[DiaryUI.enterEditMode] 已在编辑模式，忽略（防止重复添加操作栏）');
      return;
    }

    // 检查是否已有操作栏
    const existingActionBar = content.querySelector('.diary-edit-actions');
    if (existingActionBar) {
      logger.warn('[DiaryUI.enterEditMode] 检测到已存在的操作栏，移除后重新添加');
      existingActionBar.remove();
    }

    content.classList.add('editing');
    logger.debug('[DiaryUI.enterEditMode] 已添加editing类');

    // 替换为可编辑版本
    const header = content.querySelector('.diary-header');
    const entries = content.querySelector('.diary-entries');

    // 标题和日期可编辑
    header.innerHTML = `
            <input type="text" class="diary-edit-title" value="${diary.title}" placeholder="标题">
            <input type="date" class="diary-edit-date" value="${diary.date}">
        `;

    // 内容块可编辑（区分文字块和图片块）
    entries.innerHTML = diary.contentBlocks.map((block, index) => {
      if (block.type === 'image') {
        // 图片块：显示URL和描述输入框
        return `
            <div class="diary-entry-editable diary-entry-image-edit" data-index="${index}" data-type="image">
                <div class="diary-image-edit-label">📷 图片</div>
                <input type="text" class="diary-image-url-edit" placeholder="图片URL" value="${block.imageUrl || ''}" data-field="url">
                <input type="text" class="diary-image-desc-edit" placeholder="图片描述" value="${block.imageDesc || ''}" data-field="desc">
            </div>
        `;
      } else {
        // 文字块：显示文本框
        return `
            <div class="diary-entry-editable" data-index="${index}" data-type="text">
                <textarea class="diary-content-edit">${block.content}</textarea>
            </div>
        `;
      }
    }).join('') + `
            <button class="diary-add-block-btn">
                <i class="fa-solid fa-plus"></i> 添加内容块
            </button>
        `;

    // 添加操作栏（插入到内容顶部，sticky固定）
    const actionBar = document.createElement('div');
    actionBar.className = 'diary-edit-actions';
    actionBar.innerHTML = `
            <button class="diary-edit-confirm" title="确认">
                <i class="fa-solid fa-check"></i>
            </button>
            <button class="diary-edit-cancel-btn" title="取消">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="diary-edit-delete-btn" title="删除">
                <i class="fa-solid fa-trash-can"></i>
            </button>
            <button class="diary-edit-copy-btn" title="复制">
                <i class="fa-solid fa-copy"></i>
            </button>
        `;

    // 插入到content的第一个子元素之前（顶部）
    content.insertBefore(actionBar, content.firstChild);

    logger.debug('[DiaryUI.enterEditMode] 操作栏已添加到顶部');

    // 绑定操作按钮（用我们自己的类名）
    actionBar.querySelector('.diary-edit-confirm').addEventListener('click', (e) => {
      e.stopPropagation();  // 阻止事件冒泡
      e.preventDefault();    // 阻止默认行为
      logger.debug('[DiaryUI] 确认按钮被点击');
      this.saveInlineEdit(card, diary);
    });
    actionBar.querySelector('.diary-edit-cancel-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      logger.debug('[DiaryUI] 取消按钮被点击');
      this.exitEditMode(card);
      this.refreshDiaries();  // 恢复原状
    });
    actionBar.querySelector('.diary-edit-delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      logger.debug('[DiaryUI] 删除按钮被点击');
      const confirmed = await callGenericPopup(`确定删除"${diary.title}"吗？`, POPUP_TYPE.CONFIRM);
      if (confirmed) {
        this.dataManager.deleteDiary(diary.id);
        this.refreshDiaries();
        if (typeof toastr !== 'undefined') toastr.success('日记已删除');
      }
    });
    actionBar.querySelector('.diary-edit-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      logger.debug('[DiaryUI] 复制按钮被点击');
      this.duplicateDiary(diary);
    });

    // 绑定添加块按钮
    const addBlockBtn = entries.querySelector('.diary-add-block-btn');
    if (addBlockBtn) {
      addBlockBtn.addEventListener('click', () => {
        const newBlock = document.createElement('div');
        newBlock.className = 'diary-entry-editable';
        newBlock.innerHTML = '<textarea class="diary-content-edit" placeholder="写点什么..."></textarea>';
        addBlockBtn.before(newBlock);
      });
    }

    logger.debug('[DiaryUI.enterEditMode] 进入编辑模式:', diary.id);
  }

  /**
   * 退出编辑模式
   * 
   * @param {HTMLElement} card - 卡片元素
   */
  exitEditMode(card) {
    const content = card.querySelector('.diary-content');

    logger.debug('[DiaryUI.exitEditMode] 开始退出编辑模式');
    logger.debug('[DiaryUI.exitEditMode] 退出前editing类:', content.classList.contains('editing'));

    // 移除编辑类
    content.classList.remove('editing');

    // 移除操作栏
    const actionBar = content.querySelector('.diary-edit-actions');
    if (actionBar) {
      actionBar.remove();
      logger.debug('[DiaryUI.exitEditMode] 操作栏已移除');
    }

    logger.debug('[DiaryUI.exitEditMode] 退出后editing类:', content.classList.contains('editing'));
    logger.debug('[DiaryUI.exitEditMode] 退出编辑模式完成');
  }

  /**
   * 保存就地编辑
   * 
   * @param {HTMLElement} card - 卡片元素
   * @param {Object} diary - 日记对象
   */
  saveInlineEdit(card, diary) {
    const content = card.querySelector('.diary-content');

    // 保存标题和日期
    const titleInput = content.querySelector('.diary-edit-title');
    const dateInput = content.querySelector('.diary-edit-date');

    if (titleInput) diary.title = titleInput.value || '未命名日记';
    if (dateInput && dateInput.value) {
      diary.date = dateInput.value;
      const dateObj = new Date(dateInput.value);
      diary.dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dateObj.getDay()];
    }

    // 保存内容块（区分文字块和图片块）
    const editableBlocks = content.querySelectorAll('.diary-entry-editable');
    diary.contentBlocks = [];

    editableBlocks.forEach((blockEl) => {
      const type = blockEl.dataset.type || 'text';

      if (type === 'image') {
        // 图片块：保存URL和描述
        const urlInput = blockEl.querySelector('[data-field="url"]');
        const descInput = blockEl.querySelector('[data-field="desc"]');

        if (urlInput && descInput && descInput.value.trim()) {
          diary.contentBlocks.push({
            type: 'image',
            tag: '📷',
            time: '',
            imageUrl: urlInput.value.trim(),
            imageDesc: descInput.value.trim(),
            content: `[图片：${descInput.value.trim()}]`
          });
        }
      } else {
        // 文字块：保存文字内容
        const textarea = blockEl.querySelector('.diary-content-edit');
        if (textarea && textarea.value.trim()) {
          diary.contentBlocks.push({
            type: 'text',
            tag: '',
            time: '',
            content: textarea.value.trim()
          });
        }
      }
    });

    // 保存
    this.dataManager.saveDiaries();

    logger.debug('[DiaryUI.saveInlineEdit] 保存完成，开始更新UI');

    // 关键修复：先退出编辑模式，再替换卡片
    // 这样新卡片就不会带editing类
    this.exitEditMode(card);

    logger.debug('[DiaryUI.saveInlineEdit] 已退出编辑模式');

    // 只更新当前卡片的显示（保持位置）
    const newCard = this.createDiaryCard(diary);
    card.replaceWith(newCard);

    logger.debug('[DiaryUI.saveInlineEdit] 卡片已替换');

    if (typeof toastr !== 'undefined') {
      toastr.success('日记已保存');
    }

    logger.info('[DiaryUI.saveInlineEdit] ========== 就地编辑完成 ==========');
  }

  /**
   * 复制日记
   * 
   * @param {Object} diary - 日记对象
   */
  duplicateDiary(diary) {
    const newDiary = {
      ...diary,
      id: this.dataManager.generateTimestampId(),
      title: diary.title + ' (副本)',
      contentBlocks: [...diary.contentBlocks],
      comments: [],  // 不复制评论
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sendToAI: true
      }
    };

    this.dataManager.diaries.push(newDiary);
    this.dataManager.saveDiaries();
    this.refreshDiaries();

    if (typeof toastr !== 'undefined') {
      toastr.success('日记已复制');
    }

    logger.info('[DiaryUI.duplicateDiary] 日记已复制:', newDiary.id);
  }

  /**
   * 切换日记隐私模式
   * 
   * @description
   * 隐私模式下，日记不会被发送给AI（通过注入时过滤实现）
   * 
   * @param {string} diaryId - 日记ID
   */
  togglePrivacy(diaryId) {
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) return;

    // 切换隐私状态
    diary.privacy = !diary.privacy;
    diary.metadata.sendToAI = !diary.privacy;

    // 保存
    this.dataManager.saveDiaries();

    // 刷新UI（更新图标）
    this.refreshDiaries();

    // 通知
    const status = diary.privacy ? '隐私模式（不发送给AI）' : '公开模式（发送给AI）';
    if (typeof toastr !== 'undefined') {
      toastr.info(`日记已设为${status}`);
    }

    // 重新注入日记（更新提示词）
    if (this.api) {
      this.api.injectRecentDiaries();
    }

    logger.info('[DiaryUI.togglePrivacy] 日记隐私状态:', diary.privacy);
  }

  /**
   * 渲染内容块
   * 
   * @param {Array<Object>} blocks - 内容块列表
   * @returns {string}
   */
  renderContentBlocks(blocks) {
    return blocks.map(block => {
      let contentHTML = '';

      // 图片类型：显示真实图片
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
      }
      // 文字类型：显示文字内容
      else {
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
   * 渲染评论（递归，支持嵌套）
   * 
   * @param {Array<Object>} comments - 评论列表
   * @param {number} [level=0] - 嵌套级别
   * @returns {string}
   */
  renderComments(comments, level = 0) {
    if (!comments || comments.length === 0) return '';

    // 获取当前角色名
    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    return comments.map(comment => {
      // 根据身份类型设置样式类
      // user（白沉）、ai（鬼面）、passerby（路人）
      let authorType = 'passerby';  // 默认路人
      if (comment.author === 'user') {
        authorType = 'user';
      } else if (comment.author === 'ai') {
        authorType = 'ai';
      } else if (comment.authorName === charName) {
        // 如果作者名等于角色名，也算ai
        authorType = 'ai';
      }

      // 递归渲染回复
      const repliesHTML = comment.replies && comment.replies.length > 0
        ? `<div class="comment-replies">${this.renderComments(comment.replies, level + 1)}</div>`
        : '';

      return `
                <div class="comment-item" data-comment-id="${comment.id}" data-level="${level}">
                    <div class="comment-header">
                        <span class="comment-author comment-author-${authorType}">${comment.authorName}</span>
                    </div>
                    <div class="comment-content">${comment.content}</div>
                    <div class="comment-actions">
                        <button class="comment-reply-btn" data-comment-id="${comment.id}" title="回复" aria-label="回复">
                            <span class="fa-solid fa-reply"></span>
                        </button>
                        <button class="comment-delete-btn" data-comment-id="${comment.id}" title="删除" aria-label="删除">
                            <span class="fa-solid fa-trash"></span>
                        </button>
                    </div>
                    ${repliesHTML}
                </div>
            `;
    }).join('');
  }

  /**
   * 获取过滤后的日记
   * 
   * @returns {Array<Object>}
   */
  getFilteredDiaries() {
    let diaries = this.dataManager.diaries;

    // 按类型筛选
    if (this.filter.type === 'user') {
      diaries = diaries.filter(d => d.author === 'user');
    } else if (this.filter.type === 'ai') {
      diaries = diaries.filter(d => d.author === 'ai');
    } else if (this.filter.type === 'week') {
      // 按周筛选（支持偏移）
      const weekStart = this.getWeekStart(this.filter.weekOffset);
      const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
      diaries = diaries.filter(d => {
        const created = d.metadata.createdAt;
        return created >= weekStart && created < weekEnd;
      });
    } else if (this.filter.type === 'month') {
      // 按月筛选（支持偏移）
      const monthStart = this.getMonthStart(this.filter.monthOffset || 0);
      const monthEnd = this.getMonthEnd(this.filter.monthOffset || 0);
      diaries = diaries.filter(d => {
        const created = d.metadata.createdAt;
        return created >= monthStart && created <= monthEnd;
      });
    } else if (this.filter.type === 'date') {
      // 按指定日期筛选
      if (this.filter.selectedDate) {
        const selectedDate = new Date(this.filter.selectedDate);
        selectedDate.setHours(0, 0, 0, 0);
        const dayStart = selectedDate.getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;

        diaries = diaries.filter(d => {
          const created = d.metadata.createdAt;
          return created >= dayStart && created < dayEnd;
        });
      }
    }

    // 搜索过滤
    if (this.filter.searchText) {
      const searchLower = this.filter.searchText.toLowerCase();
      diaries = diaries.filter(d => {
        // 搜索标题
        if (d.title.toLowerCase().includes(searchLower)) return true;

        // 搜索内容
        const hasContent = d.contentBlocks.some(block =>
          block.content.toLowerCase().includes(searchLower)
        );
        if (hasContent) return true;

        // 搜索评论
        const hasComment = this.searchInComments(d.comments, searchLower);
        if (hasComment) return true;

        return false;
      });
    }

    return diaries;
  }

  /**
   * 在评论中搜索（递归）
   * 
   * @param {Array<Object>} comments - 评论列表
   * @param {string} searchText - 搜索文本
   * @returns {boolean}
   */
  searchInComments(comments, searchText) {
    for (const comment of comments) {
      if (comment.content.toLowerCase().includes(searchText)) {
        return true;
      }
      if (comment.replies && this.searchInComments(comment.replies, searchText)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 上一页
   * 
   * @description
   * 轮播图核心逻辑：把最后一个卡片移到最前面
   * CSS transition 自动处理动画效果
   */
  prevPage() {
    if (!this.sliderElement) return;

    const cards = this.sliderElement.querySelectorAll('.diary-card');
    if (cards.length === 0) return;

    // 把最后一个卡片移到最前面（无缝切换）
    this.sliderElement.prepend(cards[cards.length - 1]);

    logger.debug('[DiaryUI.prevPage] 上一页');
  }

  /**
   * 下一页
   * 
   * @description
   * 轮播图核心逻辑：把第一个卡片移到最后
   * CSS transition 自动处理动画效果
   */
  nextPage() {
    if (!this.sliderElement) return;

    const cards = this.sliderElement.querySelectorAll('.diary-card');
    if (cards.length === 0) return;

    // 把第一个卡片移到最后（无缝切换）
    this.sliderElement.appendChild(cards[0]);

    logger.debug('[DiaryUI.nextPage] 下一页');
  }

  /**
   * 获取当前显示的日记卡片
   * 
   * @description
   * 轮播图逻辑：
   * - 只有1篇日记：在 nth-child(1) 位置（CSS :only-child 强制居中）
   * - 2篇及以上：在 nth-child(2) 位置（CSS 第2张居中）
   * 
   * @returns {HTMLElement|null} 当前卡片元素
   */
  getCurrentCard() {
    if (!this.sliderElement) return null;

    const allCards = this.sliderElement.querySelectorAll('.diary-card');

    if (allCards.length === 0) {
      return null;
    } else if (allCards.length === 1) {
      return /** @type {HTMLElement} */ (allCards[0]);  // 只有1篇，就是第1张
    } else {
      return /** @type {HTMLElement} */ (this.sliderElement.querySelector('.diary-card:nth-child(2)'));  // 多篇，第2张居中
    }
  }

  /**
   * 更新发送按钮状态
   * 
   * @param {boolean} isGenerating - 是否正在生成
   */
  updateSendButtonState(isGenerating) {
    const sendBtn = this.panelElement.querySelector('.diary-send');
    if (!sendBtn) return;

    const icon = sendBtn.querySelector('span');
    if (!icon) return;

    if (isGenerating) {
      // 正在生成 → 显示中止图标
      icon.className = 'fa-solid fa-circle-stop';
      /** @type {HTMLElement} */ (sendBtn).title = '中止生成';
      sendBtn.classList.add('generating');
      logger.debug('[DiaryUI.updateSendButtonState] 按钮切换为中止模式');
    } else {
      // 未生成 → 显示发送图标
      icon.className = 'fa-solid fa-paper-plane';
      /** @type {HTMLElement} */ (sendBtn).title = '发送消息';
      sendBtn.classList.remove('generating');
      logger.debug('[DiaryUI.updateSendButtonState] 按钮切换为发送模式');
    }
  }

  /**
   * 创建新日记
   * 
   * @description
   * 新建日记后，由编辑器自动刷新并定位（saveDiary方法负责）
   */
  createNewDiary() {
    if (this.editor) {
      this.editor.open(null); // null = 新建
      logger.info('[DiaryUI.createNewDiary] 打开编辑器');
    }
  }

  /**
   * 完成当前日记（后台异步生成）
   * 
   * @async
   * @description
   * 完成日记后，启动后台异步生成评论。
   * 用户可以立即关闭面板继续操作，不需要等待。
   * 生成完成后会显示iOS顶部通知。
   * 
   * ✨ 使用 generateQuietPrompt（自动包含角色卡+预设+世界书+聊天历史）
   * ⚠️ 注意：与主聊天共用全局 abortController，可能有中止冲突
   */
  async completeCurrentDiary() {
    // 获取当前显示的日记卡片
    const currentCard = this.getCurrentCard();

    if (!currentCard) {
      logger.warn('[DiaryUI.completeCurrentDiary] 没有当前日记');
      return;
    }

    const diaryId = /** @type {HTMLElement} */ (currentCard).dataset.diaryId;
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) return;

    // 确认框
    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    const confirmed = await callGenericPopup(
      `确认请求 ${charName} 评论这篇日记吗？\n\n✨ 评论将在后台生成，你可以继续其他操作。`,
      POPUP_TYPE.CONFIRM,
      '',
      { okButton: '确定', cancelButton: '取消' }
    );

    if (!confirmed) {
      logger.debug('[DiaryUI.completeCurrentDiary] 用户取消');
      return;
    }

    try {
      // 调用异步版本（立即返回，不等待）
      await this.api.requestCommentAsync(diaryId);

      logger.info('[DiaryUI.completeCurrentDiary] 后台生成已启动，用户可继续操作');
    } catch (error) {
      logger.error('[DiaryUI.completeCurrentDiary] 启动失败:', error);
      showErrorToast('请求评论失败：' + error.message);
    }
  }

  /**
   * 删除当前日记
   * 
   * @async
   */
  async deleteCurrentDiary() {
    // 获取当前显示的日记卡片
    const currentCard = this.getCurrentCard();

    if (!currentCard) {
      logger.warn('[DiaryUI.deleteCurrentDiary] 没有当前日记');
      return;
    }

    const diaryId = /** @type {HTMLElement} */ (currentCard).dataset.diaryId;
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) return;

    // 确认删除
    const ctx = getContext();
    const confirmed = await callGenericPopup(
      `确定删除日记"${diary.title}"吗？此操作无法撤销。`,
      POPUP_TYPE.CONFIRM,
      '',
      { okButton: '删除', cancelButton: '取消' }
    );

    if (!confirmed) {
      logger.debug('[DiaryUI.deleteCurrentDiary] 用户取消');
      return;
    }

    // 删除
    this.dataManager.deleteDiary(diaryId);

    // 刷新UI
    this.refreshDiaries();

    // 通知
    if (typeof toastr !== 'undefined') {
      toastr.success('日记已删除');
    }

    logger.info('[DiaryUI.deleteCurrentDiary] 日记已删除:', diaryId);
  }

  /**
   * 获取指定周的开始时间戳
   * 
   * @param {number} offset - 周偏移（0=本周，-1=上周，1=下周）
   * @returns {number} 时间戳
   */
  getWeekStart(offset = 0) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 距离周一的天数

    const monday = new Date(now);
    monday.setDate(now.getDate() - daysFromMonday + (offset * 7));
    monday.setHours(0, 0, 0, 0);

    return monday.getTime();
  }

  /**
   * 获取月开始时间（1日00:00）
   * 
   * @param {number} offset - 月偏移（0=本月，-1=上月，1=下月）
   * @returns {number} 时间戳
   */
  getMonthStart(offset = 0) {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    targetMonth.setHours(0, 0, 0, 0);
    return targetMonth.getTime();
  }

  /**
   * 获取月结束时间（最后一天23:59:59）
   * 
   * @param {number} offset - 月偏移（0=本月，-1=上月，1=下月）
   * @returns {number} 时间戳
   */
  getMonthEnd(offset = 0) {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    targetMonth.setHours(23, 59, 59, 999);
    return targetMonth.getTime();
  }

  /**
   * 切换搜索栏显示/隐藏
   */
  toggleSearchBar() {
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
        this.filter.searchText = '';
        this.refreshDiaries();
      }

      logger.debug('[DiaryUI.toggleSearchBar] 搜索栏已关闭');
    } else {
      // 打开搜索栏前，先关闭设置面板、预设面板、视觉面板和筛选面板
      const settingsPanel = this.panelElement.querySelector('#diarySettingsPanel');
      const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');
      const presetBtn = this.panelElement.querySelector('#diaryPresetBtn');
      const visualPanel = this.panelElement.querySelector('#diaryVisualPanel');
      const visualBtn = this.panelElement.querySelector('#diaryVisualBtn');

      if (settingsPanel) settingsPanel.classList.remove('active');
      if (settingsBtn) settingsBtn.classList.remove('active');

      // 关闭预设面板
      if (this.presetUI) {
        this.presetUI.close();
        if (presetBtn) presetBtn.classList.remove('active');
      }

      // 关闭视觉面板
      if (visualPanel) visualPanel.classList.remove('active');
      if (visualBtn) visualBtn.classList.remove('active');

      this.closeAllFilterPanels();

      // 打开搜索栏
      searchBar.classList.add('active');
      searchToggleBtn.classList.add('active');

      // 自动聚焦到搜索框
      setTimeout(() => {
        if (searchInput) {
          /** @type {HTMLInputElement} */ (searchInput).focus();
        }
      }, 300);

      logger.debug('[DiaryUI.toggleSearchBar] 搜索栏已打开');
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

      logger.debug('[DiaryUI.togglePresetPanel] 预设面板已关闭');
    } else {
      // 打开预设面板前，先关闭搜索栏、设置面板和视觉面板
      const searchBar = this.panelElement.querySelector('#diarySearchBar');
      const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
      const settingsPanel = this.panelElement.querySelector('#diarySettingsPanel');
      const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');
      const visualPanel = this.panelElement.querySelector('#diaryVisualPanel');
      const visualBtn = this.panelElement.querySelector('#diaryVisualBtn');

      if (searchBar) searchBar.classList.remove('active');
      if (searchToggleBtn) searchToggleBtn.classList.remove('active');
      if (settingsPanel) settingsPanel.classList.remove('active');
      if (settingsBtn) settingsBtn.classList.remove('active');

      // 关闭视觉面板
      if (visualPanel) visualPanel.classList.remove('active');
      if (visualBtn) visualBtn.classList.remove('active');
      this.closeAllFilterPanels();

      // 打开预设面板
      this.presetUI.open();
      if (presetBtn) presetBtn.classList.add('active');

      logger.debug('[DiaryUI.togglePresetPanel] 预设面板已打开');
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

      logger.debug('[DiaryUI.toggleSettingsPanel] 设置面板已关闭');
    } else {
      // 打开设置面板前，先关闭搜索栏、预设面板、视觉面板和筛选面板
      const searchBar = this.panelElement.querySelector('#diarySearchBar');
      const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
      const presetBtn = this.panelElement.querySelector('#diaryPresetBtn');
      const visualPanel = this.panelElement.querySelector('#diaryVisualPanel');
      const visualBtn = this.panelElement.querySelector('#diaryVisualBtn');

      if (searchBar) searchBar.classList.remove('active');
      if (searchToggleBtn) searchToggleBtn.classList.remove('active');

      // 关闭预设面板
      if (this.presetUI) {
        this.presetUI.close();
        if (presetBtn) presetBtn.classList.remove('active');
      }

      // 关闭视觉面板
      if (visualPanel) visualPanel.classList.remove('active');
      if (visualBtn) visualBtn.classList.remove('active');

      this.closeAllFilterPanels();

      // 打开设置面板
      settingsPanel.classList.add('active');
      settingsBtn.classList.add('active');

      // 加载当前设置到UI
      this.loadSettingsToPanel();

      logger.debug('[DiaryUI.toggleSettingsPanel] 设置面板已打开');
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

      logger.debug('[DiaryUI.toggleVisualPanel] 视觉面板已关闭');
    } else {
      // 打开视觉面板前，先关闭其他面板
      const searchBar = this.panelElement.querySelector('#diarySearchBar');
      const searchToggleBtn = this.panelElement.querySelector('#diarySearchToggleBtn');
      const presetBtn = this.panelElement.querySelector('#diaryPresetBtn');
      const settingsPanel = this.panelElement.querySelector('#diarySettingsPanel');
      const settingsBtn = this.panelElement.querySelector('#diarySettingsBtn');

      // 关闭搜索栏
      if (searchBar) searchBar.classList.remove('active');
      if (searchToggleBtn) searchToggleBtn.classList.remove('active');

      // 关闭预设面板
      if (this.presetUI) {
        this.presetUI.close();
        if (presetBtn) presetBtn.classList.remove('active');
      }

      // 关闭设置面板
      if (settingsPanel) settingsPanel.classList.remove('active');
      if (settingsBtn) settingsBtn.classList.remove('active');

      this.closeAllFilterPanels();

      // 打开视觉面板
      visualPanel.classList.add('active');
      visualBtn.classList.add('active');

      // 加载视觉设置UI
      if (this.visualSettings) {
        this.visualSettings.loadUI();
      }

      logger.debug('[DiaryUI.toggleVisualPanel] 视觉面板已打开');
    }
  }

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

    logger.debug('[DiaryUI.loadSettingsToPanel] 设置已加载到面板');
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

    // 绑定事件
    if (personaDescCheckbox) {
      personaDescCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ includePersonaDescription: /** @type {HTMLInputElement} */(personaDescCheckbox).checked });
      });
    }

    if (charDescCheckbox) {
      charDescCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ includeCharDescription: /** @type {HTMLInputElement} */(charDescCheckbox).checked });
      });
    }

    if (charPersonalityCheckbox) {
      charPersonalityCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ includeCharPersonality: /** @type {HTMLInputElement} */(charPersonalityCheckbox).checked });
      });
    }

    if (charScenarioCheckbox) {
      charScenarioCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ includeCharScenario: /** @type {HTMLInputElement} */(charScenarioCheckbox).checked });
      });
    }

    if (worldInfoCheckbox) {
      worldInfoCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ includeWorldInfo: /** @type {HTMLInputElement} */(worldInfoCheckbox).checked });
      });
    }

    if (recentChatCheckbox) {
      recentChatCheckbox.addEventListener('change', () => {
        this.dataManager.updateSettings({ includeRecentChat: /** @type {HTMLInputElement} */(recentChatCheckbox).checked });
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
        this.dataManager.updateSettings({ includeHistoryDiaries: /** @type {HTMLInputElement} */(historyDiariesCheckbox).checked });
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
        logger.info('[DiaryUI] 角色评论设置已更新:', !isDisabled ? '允许' : '关闭');
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
        logger.info('[DiaryUI] 路人性格类型已更新:', value);
      });
    }

    // API 设置事件绑定
    this.bindApiSettingsEvents();

    logger.debug('[DiaryUI.bindSettingsPanelEvents] 设置面板事件已绑定');
  }

  /**
   * 绑定 API 设置事件
   * 
   * @description
   * 处理 API 来源切换、配置管理、参数调整等操作
   */
  bindApiSettingsEvents() {
    // API 来源选择
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiSource'));
    const customApiSettings = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryCustomApiSettings'));

    if (apiSourceSelect) {
      apiSourceSelect.addEventListener('change', () => {
        const source = apiSourceSelect.value;
        const settings = this.dataManager.getSettings();

        // 更新配置
        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            source: source
          }
        });

        // 显示/隐藏自定义配置区域
        if (customApiSettings) {
          customApiSettings.style.display = source === 'custom' ? 'block' : 'none';
        }

        logger.info('[DiaryUI] API来源已切换:', source);
      });
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.addEventListener('change', () => {
        const settings = this.dataManager.getSettings();

        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            stream: apiStreamCheckbox.checked
          }
        });

        logger.info('[DiaryUI] 流式生成已', apiStreamCheckbox.checked ? '启用' : '禁用');
      });
    }

    // API 配置选择（切换配置）
    const apiConfigSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiConfigSelect'));
    if (apiConfigSelect) {
      apiConfigSelect.addEventListener('change', () => {
        const configId = apiConfigSelect.value;
        this.loadApiConfig(configId);
      });
    }

    // 保存配置
    const apiConfigSaveBtn = this.panelElement.querySelector('#diaryApiConfigSave');
    if (apiConfigSaveBtn) {
      apiConfigSaveBtn.addEventListener('click', () => {
        this.saveCurrentApiConfig();
      });
    }

    // 删除配置
    const apiConfigDeleteBtn = this.panelElement.querySelector('#diaryApiConfigDelete');
    if (apiConfigDeleteBtn) {
      apiConfigDeleteBtn.addEventListener('click', () => {
        this.deleteApiConfig();
      });
    }

    // 密钥显示/隐藏
    const apiKeyToggle = this.panelElement.querySelector('#diaryApiKeyToggle');
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    if (apiKeyToggle && apiKeyInput) {
      apiKeyToggle.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';

        const icon = apiKeyToggle.querySelector('i');
        if (icon) {
          icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    // 模型选择
    const apiModelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const apiModelManualWrapper = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryApiModelManualWrapper'));

    if (apiModelSelect) {
      apiModelSelect.addEventListener('change', () => {
        const value = apiModelSelect.value;

        // 如果选择"手动输入..."，显示手动输入框
        if (apiModelManualWrapper) {
          apiModelManualWrapper.style.display = value === '__manual__' ? 'block' : 'none';
        }
      });
    }

    // 刷新模型列表
    const apiRefreshModelsBtn = this.panelElement.querySelector('#diaryApiRefreshModels');
    if (apiRefreshModelsBtn) {
      apiRefreshModelsBtn.addEventListener('click', () => {
        this.refreshModelsFromAPI();
      });
    }

    // 测试连接
    const apiTestBtn = this.panelElement.querySelector('#diaryApiTest');
    if (apiTestBtn) {
      apiTestBtn.addEventListener('click', () => {
        this.testApiConnection();
      });
    }

    // 加载现有设置到 UI
    this.loadApiSettingsToUI();

    logger.debug('[DiaryUI.bindApiSettingsEvents] API设置事件已绑定');
  }

  /**
   * 处理筛选类型切换
   * 
   * @param {string} filterType - 筛选类型
   */
  handleFilterChange(filterType) {
    // 关闭所有展开面板
    this.closeAllFilterPanels();

    // 更新筛选类型
    this.filter.type = filterType;

    // 根据筛选类型展开对应面板
    if (filterType === 'week') {
      const weekPanel = this.panelElement.querySelector('#diaryWeekPanel');
      if (weekPanel) weekPanel.classList.add('active');
      this.filter.weekOffset = 0;
      this.updatePeriodLabel();
    } else if (filterType === 'month') {
      const monthPanel = this.panelElement.querySelector('#diaryMonthPanel');
      if (monthPanel) monthPanel.classList.add('active');
      this.filter.monthOffset = 0;
      this.updatePeriodLabel();
    } else if (filterType === 'date') {
      const datePanel = this.panelElement.querySelector('#diaryDatePickerPanel');
      if (datePanel) datePanel.classList.add('active');
    }

    // 刷新日记列表
    this.refreshDiaries();

    logger.debug('[DiaryUI.handleFilterChange] 筛选类型已切换:', filterType);
  }

  /**
   * 关闭所有筛选面板
   */
  closeAllFilterPanels() {
    const weekPanel = this.panelElement.querySelector('#diaryWeekPanel');
    const monthPanel = this.panelElement.querySelector('#diaryMonthPanel');
    const datePanel = this.panelElement.querySelector('#diaryDatePickerPanel');

    if (weekPanel) weekPanel.classList.remove('active');
    if (monthPanel) monthPanel.classList.remove('active');
    if (datePanel) datePanel.classList.remove('active');
  }

  /**
   * 更新周期标签显示（周/月）
   */
  updatePeriodLabel() {
    // 更新周标签
    const weekLabel = this.panelElement?.querySelector('#diaryWeekLabel');
    if (weekLabel) {
      const offset = this.filter.weekOffset || 0;
      if (offset === 0) {
        weekLabel.textContent = '本周';
      } else if (offset === -1) {
        weekLabel.textContent = '上周';
      } else if (offset === 1) {
        weekLabel.textContent = '下周';
      } else if (offset < -1) {
        weekLabel.textContent = `${Math.abs(offset)}周前`;
      } else {
        weekLabel.textContent = `${offset}周后`;
      }
    }

    // 更新月标签
    const monthLabel = this.panelElement?.querySelector('#diaryMonthLabel');
    if (monthLabel) {
      const offset = this.filter.monthOffset || 0;
      if (offset === 0) {
        monthLabel.textContent = '本月';
      } else if (offset === -1) {
        monthLabel.textContent = '上月';
      } else if (offset === 1) {
        monthLabel.textContent = '下月';
      } else if (offset < -1) {
        monthLabel.textContent = `${Math.abs(offset)}个月前`;
      } else {
        monthLabel.textContent = `${offset}个月后`;
      }
    }
  }

  /**
   * 显示选择发送面板
   * 
   * @description
   * 弹出管理界面，用户可以手动勾选要发送给AI的日记
   */
  async showSelectSendPanel() {
    const allDiaries = this.dataManager.diaries;

    if (allDiaries.length === 0) {
      if (typeof toastr !== 'undefined') {
        toastr.warning('还没有日记可以选择');
      }
      return;
    }

    // 构造勾选列表HTML
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

    const popupContent = `
      <div style="text-align: left; max-height: 60vh; overflow-y: auto;">
        <h3 style="margin-top: 0; color: var(--SmartThemeQuoteColor);">
          <i class="fa-solid fa-list-check"></i> 选择要发送给AI的日记
        </h3>
        
        <p style="color: var(--white50a); font-size: 0.9em; margin: 10px 0;">
          勾选的日记将在下次聊天时发送给AI，隐私日记（🔒）无法勾选。
        </p>
        
        <hr style="margin: 15px 0; border: none; border-top: 1px solid var(--SmartThemeBorderColor); opacity: 0.3;">
        
        <div style="margin: 15px 0;">
          ${diariesHTML}
        </div>
        
        <p style="color: var(--white50a); font-size: 0.9em; margin-top: 15px;">
          <i class="fa-solid fa-info-circle"></i> 
          提示：选择后将临时覆盖"最多发送日记数"设置
        </p>
      </div>
    `;

    const result = await callGenericPopup(popupContent, POPUP_TYPE.TEXT, '', {
      okButton: '应用选择',
      cancelButton: '取消',
      wide: true
    });

    if (result) {
      // 获取勾选的日记ID
      const checkboxes = document.querySelectorAll('[data-diary-id]');
      const selectedIds = [];
      checkboxes.forEach(cb => {
        if (cb.checked && !cb.disabled) {
          selectedIds.push(cb.dataset.diaryId);
        }
      });

      logger.info('[DiaryUI.showSelectSendPanel] 用户选择了', selectedIds.length, '篇日记');

      // 职责分离：调用 API 模块发送
      if (selectedIds.length === 0) {
        if (typeof toastr !== 'undefined') {
          toastr.warning('请至少选择一篇日记');
        }
        return;
      }

      // 调用 diary-api.js 的方法（职责分离）
      if (this.api) {
        try {
          await this.api.sendSelectedDiaries(selectedIds);
          showSuccessToast('日记已发送给AI！');
        } catch (error) {
          logger.error('[DiaryUI.showSelectSendPanel] 发送失败:', error);
          showErrorToast('发送失败：' + error.message);
        }
      }
    }
  }

  // ========================================
  // [FUNC] API 配置管理
  // ========================================

  /**
   * 加载 API 设置到 UI
   * 
   * @description
   * 从 dataManager 读取设置，填充到设置面板的表单中
   */
  loadApiSettingsToUI() {
    const settings = this.dataManager.getSettings();
    const apiConfig = settings.apiConfig;

    // API 来源
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiSource'));
    if (apiSourceSelect) {
      apiSourceSelect.value = apiConfig.source || 'default';
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.checked = apiConfig.stream || false;
    }

    // 显示/隐藏自定义配置区域
    const customApiSettings = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryCustomApiSettings'));
    if (customApiSettings) {
      customApiSettings.style.display = apiConfig.source === 'custom' ? 'block' : 'none';
    }

    // 加载配置列表到下拉框
    this.refreshApiConfigList();

    // 如果有当前配置，加载到表单
    if (apiConfig.currentConfigId) {
      this.loadApiConfig(apiConfig.currentConfigId);
    }

    logger.debug('[DiaryUI.loadApiSettingsToUI] API设置已加载到UI');
  }

  /**
   * 刷新 API 配置列表
   * 
   * @description
   * 更新配置下拉框的选项列表
   */
  refreshApiConfigList() {
    const settings = this.dataManager.getSettings();
    const configs = settings.apiConfig.customConfigs || [];

    const select = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiConfigSelect'));
    if (!select) return;

    // 清空现有选项（保留第一个"新建配置..."）
    select.innerHTML = '<option value="">新建配置...</option>';

    // 添加已保存的配置
    configs.forEach(config => {
      const option = document.createElement('option');
      option.value = config.id;
      option.textContent = config.name || config.id;
      select.appendChild(option);
    });

    // 选中当前配置
    if (settings.apiConfig.currentConfigId) {
      select.value = settings.apiConfig.currentConfigId;
    }

    logger.debug('[DiaryUI.refreshApiConfigList] 配置列表已刷新，共', configs.length, '个');
  }

  /**
   * 加载 API 配置到表单
   * 
   * @param {string} configId - 配置ID（空字符串=新建）
   */
  loadApiConfig(configId) {
    const settings = this.dataManager.getSettings();
    const configs = settings.apiConfig.customConfigs || [];

    // 查找配置
    const config = configs.find(c => c.id === configId);

    // 获取表单元素
    const nameInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiConfigName'));
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiModelManual'));
    const modelManualWrapper = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryApiModelManualWrapper'));

    if (config) {
      // 加载已有配置
      if (nameInput) nameInput.value = config.name || '';
      if (baseUrlInput) baseUrlInput.value = config.baseUrl || '';
      if (apiKeyInput) apiKeyInput.value = config.apiKey || '';

      // 加载模型（检查是否在下拉框中）
      if (modelSelect) {
        const modelInList = Array.from(modelSelect.options).some(opt => opt.value === config.model);

        if (modelInList) {
          // 模型在列表中，直接选择
          modelSelect.value = config.model || '';
          if (modelManualWrapper) modelManualWrapper.style.display = 'none';
        } else if (config.model) {
          // 模型不在列表中，使用手动输入
          modelSelect.value = '__manual__';
          if (modelManualInput) modelManualInput.value = config.model;
          if (modelManualWrapper) modelManualWrapper.style.display = 'block';
        }
      }

      // 更新当前配置ID
      this.dataManager.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentConfigId: configId
        }
      });

      logger.info('[DiaryUI.loadApiConfig] 已加载配置:', config.name);
    } else {
      // 清空表单（新建配置）
      if (nameInput) nameInput.value = '';
      if (baseUrlInput) baseUrlInput.value = '';
      if (apiKeyInput) apiKeyInput.value = '';
      if (modelSelect) modelSelect.value = '';
      if (modelManualInput) modelManualInput.value = '';
      if (modelManualWrapper) modelManualWrapper.style.display = 'none';

      // 清除当前配置ID
      this.dataManager.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentConfigId: null
        }
      });

      logger.debug('[DiaryUI.loadApiConfig] 表单已清空，准备新建配置');
    }
  }

  /**
   * 保存当前 API 配置
   * 
   * @async
   * @description
   * 从表单读取当前配置，保存或更新到 customConfigs 列表
   */
  async saveCurrentApiConfig() {
    // 读取表单数据
    const nameInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiConfigName'));
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiModelManual'));

    const name = nameInput?.value.trim();
    const baseUrl = baseUrlInput?.value.trim();
    const apiKey = apiKeyInput?.value.trim();

    // 获取模型名（优先使用手动输入）
    let model = '';
    if (modelSelect?.value === '__manual__') {
      model = modelManualInput?.value.trim() || '';
    } else {
      model = modelSelect?.value.trim() || '';
    }

    // 验证必填项
    if (!name) {
      showErrorToast('请填写配置名称');
      return;
    }

    if (!baseUrl) {
      showErrorToast('请填写 API 端点');
      return;
    }

    if (!model) {
      showErrorToast('请选择或输入模型名称');
      return;
    }

    const settings = this.dataManager.getSettings();
    const configs = [...(settings.apiConfig.customConfigs || [])];
    const currentConfigId = settings.apiConfig.currentConfigId;

    // 检查是否是更新现有配置
    const existingIndex = configs.findIndex(c => c.id === currentConfigId);

    const configData = {
      id: currentConfigId || `config_${Date.now()}`,
      name: name,
      baseUrl: baseUrl,
      apiKey: apiKey,
      model: model
    };

    if (existingIndex >= 0) {
      // 更新现有配置
      configs[existingIndex] = configData;
      logger.info('[DiaryUI.saveCurrentApiConfig] 已更新配置:', name);
    } else {
      // 新增配置
      configs.push(configData);
      logger.info('[DiaryUI.saveCurrentApiConfig] 已新增配置:', name);
    }

    // 保存到 settings
    this.dataManager.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        customConfigs: configs,
        currentConfigId: configData.id
      }
    });

    // 刷新配置列表
    this.refreshApiConfigList();

    showSuccessToast(`配置「${name}」已保存`);
  }

  /**
   * 删除 API 配置
   * 
   * @async
   * @description
   * 删除当前选中的配置（需要二次确认）
   */
  async deleteApiConfig() {
    const settings = this.dataManager.getSettings();
    const currentConfigId = settings.apiConfig.currentConfigId;

    if (!currentConfigId) {
      showErrorToast('请先选择要删除的配置');
      return;
    }

    const configs = settings.apiConfig.customConfigs || [];
    const config = configs.find(c => c.id === currentConfigId);

    if (!config) {
      showErrorToast('配置不存在');
      return;
    }

    // 二次确认
    const confirmed = await callGenericPopup(
      `确定要删除配置「${config.name}」吗？此操作不可撤销。`,
      POPUP_TYPE.CONFIRM
    );

    if (!confirmed) {
      return;
    }

    // 删除配置
    const newConfigs = configs.filter(c => c.id !== currentConfigId);

    this.dataManager.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        customConfigs: newConfigs,
        currentConfigId: null
      }
    });

    // 刷新配置列表
    this.refreshApiConfigList();

    // 清空表单
    this.loadApiConfig('');

    showSuccessToast(`配置「${config.name}」已删除`);
    logger.info('[DiaryUI.deleteApiConfig] 已删除配置:', config.name);
  }

  /**
   * 从 API 刷新可用模型列表
   * 
   * @async
   * @description
   * 调用 /v1/models API 获取可用模型，填充到下拉框
   */
  async refreshModelsFromAPI() {
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));

    const baseUrl = baseUrlInput?.value.trim();
    const apiKey = apiKeyInput?.value.trim();

    // 验证必填项
    if (!baseUrl) {
      showErrorToast('请先填写 API 端点');
      return;
    }

    if (!apiKey) {
      showErrorToast('请先填写 API 密钥');
      return;
    }

    showInfoToast('正在获取模型列表...');
    logger.info('[DiaryUI.refreshModelsFromAPI] 开始获取模型列表, baseUrl:', baseUrl);

    try {
      // 调用 /v1/models API
      const modelsUrl = `${baseUrl}/v1/models`;
      const response = await fetch(modelsUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API 返回错误: ${response.status}`);
      }

      const data = await response.json();

      // 提取模型列表
      let models = [];
      if (data.data && Array.isArray(data.data)) {
        models = data.data.map(m => m.id || m).filter(m => m);
      } else if (Array.isArray(data)) {
        models = data.map(m => m.id || m).filter(m => m);
      }

      if (models.length === 0) {
        showErrorToast('未获取到模型列表');
        logger.warn('[DiaryUI.refreshModelsFromAPI] 模型列表为空');
        return;
      }

      // 更新下拉框
      if (modelSelect) {
        // 保留当前选中的值
        const currentValue = modelSelect.value;

        // 清空现有选项
        modelSelect.innerHTML = '<option value="">请选择模型...</option>';

        // 添加获取到的模型
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });

        // 添加"手动输入..."选项
        const manualOption = document.createElement('option');
        manualOption.value = '__manual__';
        manualOption.textContent = '手动输入...';
        modelSelect.appendChild(manualOption);

        // 恢复之前的选择（如果还存在）
        if (currentValue && models.includes(currentValue)) {
          modelSelect.value = currentValue;
        }
      }

      showSuccessToast(`已获取 ${models.length} 个模型`);
      logger.info('[DiaryUI.refreshModelsFromAPI] 模型列表已更新，共', models.length, '个');

    } catch (error) {
      logger.error('[DiaryUI.refreshModelsFromAPI] 获取失败:', error);
      showErrorToast('获取模型列表失败：' + error.message);
    }
  }

  /**
   * 测试 API 连接
   * 
   * @async
   * @description
   * 发送简单的测试请求，验证 API 配置是否正确
   */
  async testApiConnection() {
    if (!this.api) {
      showErrorToast('API管理器未初始化');
      return;
    }

    // 读取当前表单数据
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiModelManual'));

    // 获取模型名
    let model = '';
    if (modelSelect?.value === '__manual__') {
      model = modelManualInput?.value.trim() || '';
    } else {
      model = modelSelect?.value.trim() || '';
    }

    const testConfig = {
      source: 'custom',
      stream: false,
      baseUrl: baseUrlInput?.value.trim() || '',
      apiKey: apiKeyInput?.value.trim() || '',
      model: model || 'gpt-4o-mini'
    };

    // 验证必填项
    if (!testConfig.baseUrl) {
      showErrorToast('请填写 API 端点');
      return;
    }

    if (!testConfig.model) {
      showErrorToast('请选择或输入模型名称');
      return;
    }

    showInfoToast('正在测试连接...');
    logger.info('[DiaryUI.testApiConnection] 开始测试 API 连接');

    try {
      // 构造简单的测试消息
      const testMessages = [
        { role: 'user', content: '测试连接，请回复"OK"' }
      ];

      // 创建测试用的 AbortController
      const abortController = new AbortController();

      // 调用 API
      const response = await this.api.callAPIWithStreaming(
        testMessages,
        testConfig,
        abortController.signal
      );

      if (response && response.length > 0) {
        showSuccessToast('API 连接成功！');
        logger.info('[DiaryUI.testApiConnection] 测试成功，响应长度:', response.length);
      } else {
        showErrorToast('API 返回空响应');
        logger.warn('[DiaryUI.testApiConnection] API返回空响应');
      }

    } catch (error) {
      logger.error('[DiaryUI.testApiConnection] 测试失败:', error);
      showErrorToast('连接失败：' + error.message);
    }
  }

  // ========================================
  // [FUNC] AI 回复预览
  // ========================================

  /**
   * 切换AI回复预览面板
   */
  toggleAiPreviewPanel() {
    const panel = /** @type {HTMLElement|null} */ (this.panelElement?.querySelector('#diaryAiPreviewPanel'));
    if (!panel) return;

    const isVisible = panel.style.display !== 'none';

    if (isVisible) {
      this.closeAiPreviewPanel();
    } else {
      panel.style.display = 'flex';
      logger.debug('[DiaryUI.toggleAiPreviewPanel] AI回复预览面板已打开');
    }
  }

  /**
   * 关闭AI回复预览面板
   */
  closeAiPreviewPanel() {
    const panel = /** @type {HTMLElement|null} */ (this.panelElement?.querySelector('#diaryAiPreviewPanel'));
    if (panel) {
      panel.style.display = 'none';
      logger.debug('[DiaryUI.closeAiPreviewPanel] AI回复预览面板已关闭');
    }
  }

  /**
   * 更新AI回复预览内容（用于实时流式显示）
   * 
   * @param {string} text - AI回复的累积文本
   * @description
   * 此方法会被 diary-api.js 调用，用于实时更新预览区域的内容
   */
  updateAiPreview(text) {
    if (!this.panelElement) return;

    const textarea = /** @type {HTMLTextAreaElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewText'));
    const hint = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('.diary-ai-preview-hint'));
    const badge = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryPreviewBadge'));
    const previewBtn = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewBtn'));

    if (!textarea) return;

    // 更新文本内容
    textarea.value = text;

    // 隐藏提示，显示内容
    if (hint) hint.style.display = 'none';
    textarea.style.display = 'block';

    // 显示预览按钮和徽章
    if (previewBtn) previewBtn.style.display = 'flex';
    if (badge) {
      badge.style.display = 'block';
      badge.textContent = '1';
    }

    // 自动滚动到底部
    textarea.scrollTop = textarea.scrollHeight;

    logger.debug('[DiaryUI.updateAiPreview] AI回复预览已更新，当前长度:', text.length);
  }

  /**
   * 编辑AI回复预览
   * 
   * @description
   * 将文本框设为可编辑状态，允许用户修改AI回复（防止格式错误）
   */
  editAiPreview() {
    const textarea = this.panelElement?.querySelector('#diaryAiPreviewText');
    if (!textarea) return;

    const textareaElement = /** @type {HTMLTextAreaElement} */ (textarea);

    // 切换只读状态
    if (textareaElement.readOnly) {
      textareaElement.readOnly = false;
      textareaElement.focus();
      textareaElement.style.borderColor = 'var(--SmartThemeQuoteColor)';
      showInfoToast('已进入编辑模式');
      logger.debug('[DiaryUI.editAiPreview] AI回复预览进入编辑模式');
    } else {
      textareaElement.readOnly = true;
      textareaElement.style.borderColor = '';
      showSuccessToast('已保存编辑');
      logger.debug('[DiaryUI.editAiPreview] AI回复预览退出编辑模式');
    }
  }

  /**
   * 解析并应用AI回复预览
   * 
   * @async
   * @description
   * 手动解析预览框中的文本，提取[日记]和[评论]标记，
   * 并应用到日记系统中。用于处理AI格式错误的情况。
   */
  async parseAiPreview() {
    if (!this.api) {
      showErrorToast('API管理器未初始化');
      return;
    }

    const textarea = this.panelElement?.querySelector('#diaryAiPreviewText');
    if (!textarea) return;

    const text = /** @type {HTMLTextAreaElement} */ (textarea).value.trim();

    if (!text) {
      showErrorToast('预览内容为空');
      return;
    }

    try {
      // 获取当前日记ID
      const diaries = this.dataManager.getDiaries();
      if (diaries.length === 0) {
        showErrorToast('没有可用的日记');
        return;
      }

      // 使用当前索引获取日记ID
      const currentDiary = diaries[this.currentIndex];
      if (!currentDiary) {
        showErrorToast('无法获取当前日记');
        return;
      }

      // 调用API的解析方法
      await this.api.extractAndSave(text, currentDiary.id);

      // 刷新UI（保持当前位置）
      this.refreshDiaries(true);

      // 清空预览（隐藏按钮）
      this.clearAiPreview(true);

      showSuccessToast('已解析并应用AI回复');
      logger.info('[DiaryUI.parseAiPreview] AI回复已解析并应用');
    } catch (error) {
      logger.error('[DiaryUI.parseAiPreview] 解析失败:', error);
      showErrorToast('解析失败：' + error.message);
    }
  }

  /**
   * 清空AI回复预览（发送消息前调用）
   * 
   * @param {boolean} [hideButton=false] - 是否隐藏预览按钮
   * @description
   * 清空预览框内容，重置状态。
   * 发送消息前：只清空内容，不隐藏按钮（hideButton=false）
   * 手动清空：清空内容并隐藏按钮（hideButton=true）
   */
  clearAiPreview(hideButton = false) {
    if (!this.panelElement) return;

    const textarea = /** @type {HTMLTextAreaElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewText'));
    const hint = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('.diary-ai-preview-hint'));
    const badge = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryPreviewBadge'));
    const previewBtn = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewBtn'));

    if (textarea) {
      textarea.value = '';
      textarea.readOnly = true;
      textarea.style.borderColor = '';
    }

    if (hint) hint.style.display = 'block';

    // 只在手动清空时隐藏按钮和徽章
    if (hideButton) {
      if (badge) badge.style.display = 'none';
      if (previewBtn) previewBtn.style.display = 'none';
      // 关闭预览面板
      this.closeAiPreviewPanel();
    }

    logger.debug('[DiaryUI.clearAiPreview] AI回复预览已清空', hideButton ? '（隐藏按钮）' : '');
  }

  /**
   * 调试方法：检查日记数据和DOM一致性
   * 
   * @description
   * 打印当前所有日记的评论数量，对比数据和DOM
   */
  debugDiaryComments() {
    console.log('\n========== 📊 日记数据检查（extension_settings中的原始数据） ==========\n');

    const diaries = this.dataManager.getDiaries();
    diaries.forEach((diary, index) => {
      console.log(`[${index}] ${diary.title} (ID: ${diary.id})`);
      console.log(`  📝 顶层评论数: ${diary.comments?.length || 0}`);

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
        console.log(`  💬 总评论数（含回复）: ${totalComments}`);

        diary.comments.forEach((comment, i) => {
          console.log(`    [${i}] ${comment.authorName}: ${comment.content.substring(0, 40)}...`);
          if (comment.replies && comment.replies.length > 0) {
            const showReplies = (replies, level) => {
              replies.forEach((reply, j) => {
                const indent = '  '.repeat(level);
                console.log(`    ${indent}└─ [${j}] ${reply.authorName}: ${reply.content.substring(0, 30)}...`);
                if (reply.replies && reply.replies.length > 0) {
                  showReplies(reply.replies, level + 1);
                }
              });
            };
            showReplies(comment.replies, 2);
          }
        });
      }
      console.log('');
    });

    console.log('\n========== 🎨 DOM卡片检查（实际渲染的HTML） ==========\n');
    const allCards = this.sliderElement.querySelectorAll('.diary-card');
    console.log(`总卡片数: ${allCards.length}\n`);

    allCards.forEach((card, index) => {
      const cardElement = /** @type {HTMLElement} */ (card);
      const diaryId = cardElement.dataset.diaryId;
      const titleEl = card.querySelector('.diary-day');
      const title = titleEl?.textContent || '未知';
      const commentsEl = card.querySelector('.diary-comments');
      const commentItems = card.querySelectorAll('.comment-item');

      // 找到对应的数据
      const diaryData = diaries.find(d => d.id === diaryId);
      const dataCommentCount = diaryData?.comments?.length || 0;

      console.log(`[${index}] ${title} (ID: ${diaryId})`);
      console.log(`  📝 数据中的评论数: ${dataCommentCount}`);
      console.log(`  🎨 DOM中的评论元素数: ${commentItems.length}`);

      if (dataCommentCount !== commentItems.length) {
        console.error(`  ⚠️ 不一致！数据有${dataCommentCount}条，DOM只显示${commentItems.length}条`);
        console.log(`  🔍 评论区HTML长度: ${commentsEl?.innerHTML?.length || 0} 字符`);
        console.log(`  🔍 评论区HTML片段:`, commentsEl?.innerHTML?.substring(0, 200));
      } else if (dataCommentCount > 0) {
        console.log(`  ✅ 一致`);
      }
      console.log('');
    });

    console.log('========================================\n');
  }

  /**
   * 销毁UI
   */
  destroy() {
    if (this.panelElement) {
      this.panelElement.remove();
      this.panelElement = null;
    }
    logger.debug('[DiaryUI.destroy] UI已销毁');
  }
}

// 导出调试方法到全局（方便控制台调用）
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).debugDiaryComments = function () {
    const diarySystem = /** @type {any} */ (window).getDiarySystem?.();
    if (diarySystem?.ui) {
      diarySystem.ui.debugDiaryComments();
    } else {
      console.error('日记系统未初始化');
    }
  };
}

