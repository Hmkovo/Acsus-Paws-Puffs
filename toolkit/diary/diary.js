/**
 * 日记系统 - 主入口
 * 
 * @description
 * 翻页书式日记系统，支持User和AI互相写日记、评论、回复。
 * 利用官方上下文构建，通过 generateQuietPrompt 实现隐藏对话。
 * 
 * @module DiarySystem
 * @author Acsus
 * @version 1.0.0
 */

// ========================================
// [IMPORT] SillyTavern 原生 API
// ========================================
import { eventSource, event_types, saveSettingsDebounced } from '../../../../../../script.js';
import { extension_settings, getContext } from '../../../../../extensions.js';
import logger from '../../logger.js';

// ========================================
// [IMPORT] 日记子模块
// ========================================
import { DiaryDataManager } from './diary-data.js';
import { DiaryUI } from './diary-ui.js';
import { DiaryEditor } from './diary-editor.js';
import { DiaryAPI } from './diary-api.js';

// ========================================
// [CONST] 常量定义
// ========================================
const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'diary';

// ========================================
// [CORE] 日记系统主类
// ========================================

/**
 * 日记系统主类
 * 
 * @class DiarySystem
 * @description
 * 负责协调各个子模块，提供统一的API接口。
 * 职责：初始化、模块协调、全局事件监听
 */
export class DiarySystem {
  /**
   * 创建日记系统实例
   */
  constructor() {
    /**
     * 数据管理器
     * @type {DiaryDataManager}
     */
    this.dataManager = null;

    /**
     * UI渲染器
     * @type {DiaryUI}
     */
    this.ui = null;

    /**
     * 编辑器
     * @type {DiaryEditor}
     */
    this.editor = null;

    /**
     * API管理器
     * @type {DiaryAPI}
     */
    this.api = null;

    /**
     * 是否已初始化
     * @type {boolean}
     */
    this.initialized = false;

    /**
     * 功能是否启用
     * @type {boolean}
     */
    this.enabled = false;
  }

  /**
   * 初始化日记系统
   * 
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      logger.warn('[DiarySystem] 已经初始化过了');
      return;
    }

    logger.info('[DiarySystem] 开始初始化...');

    try {
      // 加载设置
      this.loadSettings();

      // 如果功能未启用，跳过完整初始化，节省资源
      if (!this.enabled) {
        logger.info('[DiarySystem] 功能未启用，跳过完整初始化');
        this.initialized = true;
        return;
      }

      // 初始化子模块
      this.dataManager = new DiaryDataManager();
      this.ui = new DiaryUI(this.dataManager);
      this.editor = new DiaryEditor(this.dataManager);
      this.api = new DiaryAPI(this.dataManager);

      // 注入引用（相互依赖）
      this.ui.setAPI(this.api);
      this.ui.setEditor(this.editor);
      this.editor.setUI(this.ui);  // 编辑器需要UI引用来刷新
      this.api.setUI(this.ui);     // API需要UI引用来后台刷新

      await this.dataManager.init();
      await this.ui.init();
      await this.editor.init();
      await this.api.init();

      // 注册扩展菜单
      this.registerMenuEntry();

      // 绑定全局事件
      this.bindEvents();

      this.initialized = true;
      logger.info('[DiarySystem] 初始化完成');
    } catch (error) {
      logger.error('[DiarySystem] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载设置
   */
  loadSettings() {
    extension_settings[EXT_ID] = extension_settings[EXT_ID] || {};
    extension_settings[EXT_ID][MODULE_NAME] = extension_settings[EXT_ID][MODULE_NAME] || {
      enabled: false,
      diaries: [],
      settings: {
        // 上下文设置（生成评论时包含的内容）
        includeCharDescription: true,
        includeCharPersonality: true,
        includeCharScenario: true,
        includeWorldInfo: true,
        includeRecentChat: true,
        recentChatCount: 5,
        includeHistoryDiaries: false,
        historyDiaryCount: 3,

        // 评论设置
        allowPasserbyComments: false,
        passerbyPersonality: 'default',  // 路人性格类型
        passerbyCommentMin: 3,           // 路人评论最小数量
        passerbyCommentMax: 5,           // 路人评论最大数量

        // 自动提取（保留）
        autoExtractDiary: true,
        autoExtractComments: true
      }
    };

    this.enabled = extension_settings[EXT_ID][MODULE_NAME].enabled;
    logger.debug('[DiarySystem] 设置已加载，功能启用状态:', this.enabled);
  }

  /**
   * 保存设置
   */
  saveSettings() {
    saveSettingsDebounced();
    logger.debug('[DiarySystem] 设置已保存');
  }

  /**
   * 注册扩展菜单入口
   * 
   * @description
   * 在 extensionsMenuButton 的菜单中添加【日记】选项
   * 根据 enabled 状态控制菜单项的显示/隐藏
   */
  registerMenuEntry() {
    eventSource.on(event_types.APP_READY, () => {
      try {
        const extensionsMenu = document.querySelector('#extensionsMenu');
        if (!extensionsMenu) {
          logger.warn('[DiarySystem] 未找到扩展菜单');
          return;
        }

        // 创建【日记】菜单项
        const menuItem = document.createElement('div');
        menuItem.className = 'list-group-item flex-container flexGap5';
        menuItem.id = 'diary-menu-entry';
        menuItem.innerHTML = `
                    <div class="fa-solid fa-book extensionsMenuExtensionButton"></div>
                    <span>日记</span>
                `;

        // 根据当前启用状态设置初始可见性
        menuItem.style.display = this.enabled ? '' : 'none';

        // 点击打开日记面板
        menuItem.addEventListener('click', () => {
          if (this.enabled) {
            this.ui.openPanel();
          } else {
            logger.warn('[DiarySystem] 日记功能未启用');
            if (typeof toastr !== 'undefined') {
              toastr.warning('请先在"工具包"设置中启用日记功能');
            }
          }
        });

        extensionsMenu.appendChild(menuItem);
        logger.info('[DiarySystem] 扩展菜单入口已注册，初始可见性:', this.enabled);
      } catch (error) {
        logger.error('[DiarySystem] 注册菜单入口失败:', error);
      }
    });
  }

  /**
   * 绑定全局事件
   */
  bindEvents() {
    // 监听角色切换
    eventSource.on(event_types.CHAT_CHANGED, () => {
      if (this.enabled && this.ui.isPanelOpen()) {
        this.ui.refreshDiaries();
      }
    });

    // 监听消息接收（提取AI的日记和评论）
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId, type) => {
      if (!this.enabled) return;
      this.api.extractFromMessage(messageId);
    });

    logger.debug('[DiarySystem] 全局事件已绑定');
  }

  /**
   * 启用日记系统
   * 
   * @async
   * @description
   * 启用日记功能，如果之前未完整初始化（因为功能关闭），则触发完整初始化
   */
  async enable() {
    this.enabled = true;
    extension_settings[EXT_ID][MODULE_NAME].enabled = true;
    this.saveSettings();

    // 如果之前因为功能关闭而跳过了完整初始化，现在补上
    if (!this.dataManager) {
      logger.info('[DiarySystem] 检测到未完整初始化，开始加载子模块');

      try {
        // 初始化子模块
        this.dataManager = new DiaryDataManager();
        this.ui = new DiaryUI(this.dataManager);
        this.editor = new DiaryEditor(this.dataManager);
        this.api = new DiaryAPI(this.dataManager);

        // 注入引用（相互依赖）
        this.ui.setAPI(this.api);
        this.ui.setEditor(this.editor);
        this.editor.setUI(this.ui);
        this.api.setUI(this.ui);

        await this.dataManager.init();
        await this.ui.init();
        await this.editor.init();
        await this.api.init();

        // 注册扩展菜单
        this.registerMenuEntry();

        // 绑定全局事件
        this.bindEvents();

        logger.info('[DiarySystem] 完整初始化完成');
      } catch (error) {
        logger.error('[DiarySystem] 启用时初始化失败:', error);
        throw error;
      }
    } else {
      // 已经完整初始化过，只需显示菜单图标
      this.showMenuEntry();
    }

    logger.info('[DiarySystem] 日记系统已启用');
  }

  /**
   * 禁用日记系统
   * 
   * @description
   * 禁用日记功能，同时隐藏扩展菜单中的日记图标
   */
  disable() {
    this.enabled = false;
    extension_settings[EXT_ID][MODULE_NAME].enabled = false;
    this.saveSettings();

    // 关闭面板
    if (this.ui && this.ui.isPanelOpen()) {
      this.ui.closePanel();
    }

    // 隐藏扩展菜单中的日记图标
    this.hideMenuEntry();

    logger.info('[DiarySystem] 日记系统已禁用');
  }

  /**
   * 显示扩展菜单中的日记图标
   * 
   * @description
   * 设置菜单项为可见状态（display: ''）
   * 如果菜单项尚未创建，则不执行任何操作（等待 APP_READY 事件触发）
   */
  showMenuEntry() {
    try {
      const menuItem = document.getElementById('diary-menu-entry');
      if (menuItem) {
        menuItem.style.display = '';
        logger.debug('[DiarySystem] 扩展菜单图标已显示');
      } else {
        logger.debug('[DiarySystem] 菜单项尚未创建，跳过显示操作');
      }
    } catch (error) {
      logger.error('[DiarySystem] 显示菜单图标失败:', error);
    }
  }

  /**
   * 隐藏扩展菜单中的日记图标
   * 
   * @description
   * 设置菜单项为隐藏状态（display: 'none'）
   * 如果菜单项尚未创建，则不执行任何操作
   */
  hideMenuEntry() {
    try {
      const menuItem = document.getElementById('diary-menu-entry');
      if (menuItem) {
        menuItem.style.display = 'none';
        logger.debug('[DiarySystem] 扩展菜单图标已隐藏');
      } else {
        logger.debug('[DiarySystem] 菜单项尚未创建，跳过隐藏操作');
      }
    } catch (error) {
      logger.error('[DiarySystem] 隐藏菜单图标失败:', error);
    }
  }

  /**
   * 销毁日记系统
   */
  destroy() {
    if (this.ui) {
      this.ui.destroy();
    }

    this.initialized = false;
    logger.info('[DiarySystem] 日记系统已销毁');
  }
}

// ========================================
// [EXPORT] 导出
// ========================================

/**
 * 全局日记系统实例
 * @type {DiarySystem}
 */
let diarySystemInstance = null;

/**
 * 初始化日记系统
 * 
 * @async
 * @returns {Promise<DiarySystem>}
 */
export async function initDiarySystem() {
  if (!diarySystemInstance) {
    diarySystemInstance = new DiarySystem();
    await diarySystemInstance.init();
  }
  return diarySystemInstance;
}

/**
 * 获取日记系统实例
 * 
 * @returns {DiarySystem|null}
 */
export function getDiarySystem() {
  return diarySystemInstance;
}

