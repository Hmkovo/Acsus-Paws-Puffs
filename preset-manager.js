/**
 * 预设管理器 - 主控制器
 *
 * 核心功能：
 * - 世界书条目集成管理
 * - 条目收纳模式（不干扰ST原生拖拽）
 * - 与SillyTavern原生预设系统无缝集成
 */

// ========================================
// ✅ SillyTavern 原生 API 导入（推荐方式）
// ========================================
import {
  extension_settings
} from '../../../extensions.js';

import {
  saveSettingsDebounced,
  eventSource,
  event_types
} from '../../../../script.js';

import { callGenericPopup } from '../../../popup.js';

import { isMobile } from '../../../RossAscends-mods.js';

// ========================================
// 本地模块导入
// ========================================
import { PresetManagerUI } from './preset-manager-ui.js';
import { WorldInfoIntegration } from './preset-manager-worldinfo.js';
import { PresetStitchModule } from './preset-stitch.js';
import * as snapshotData from './preset-snapshot-data.js';
import logger from './logger.js';

// ========================================
// 预设管理器主模块
// ========================================
export class PresetManagerModule {
  constructor() {
    // 模块状态
    this.enabled = true;
    this.initialized = false;
    this.moduleId = 'preset-manager';

    // UI实例
    this.ui = null;

    // 世界书集成
    this.worldInfo = null;

    // 预设缝合器
    this.stitch = null;

    // 当前活动预设
    this.currentPreset = null;

    // DOM观察器
    this.presetObserver = null;

    // 事件处理器引用（用于对称解绑）
    this._handlers = {};

    // 运行时是否已启动（监听器/Observer/子模块）
    this._runtimeActive = false;
  }

  /**
   * 初始化模块
   *
   * @description
   * 先加载持久化开关状态，再决定是否启动运行时资源。
   * 这样能保证“关闭=不注册监听器，不注入，不观察DOM”，从根本上避免关闭后继续执行。
   *
   * @returns {Promise<void>}
   * @throws {Error} 当子模块初始化失败时向上抛出，避免半初始化状态
   *
   * @example
   * const module = new PresetManagerModule();
   * await module.init();
   */
  async init() {
    logger.debug('preset', '[PresetManager.init] 初始化预设管理器...');

    // 加载设置
    await this.loadSettings();

    await this.activateRuntime();

    this.initialized = true;
    logger.info('preset', '[PresetManager.init] 预设管理器初始化完成，启用状态:', this.enabled);
  }

  /**
   * 启动运行时资源
   *
   * @description
   * 集中管理子模块初始化、DOM监听与事件绑定，确保启用路径一致且可复用。
   * 这样 setEnabled(true) 与 init() 都走同一条路径，避免遗漏。
   *
   * @returns {Promise<void>}
   * @throws {Error} 当 worldInfo/stitch 初始化失败时抛出
   *
   * @example
   * await this.activateRuntime();
   */
  async activateRuntime() {
    if (this._runtimeActive) {
      logger.debug('preset', '[PresetManager.activateRuntime] 运行时已激活，跳过重复初始化');
      return;
    }

    // 初始化世界书集成（仅在世界书工具开关启用时）
    if (this.enabled) {
      this.worldInfo = this.worldInfo || new WorldInfoIntegration(this);
      await this.worldInfo.init();
    }

    // 初始化预设缝合器（独立开关，不受世界书工具开关控制）
    this.stitch = this.stitch || new PresetStitchModule(this);
    await this.stitch.init();

    // 监听预设页面出现
    this.observePresetPage();

    // 设置事件监听
    this.setupEventListeners();

    // 设置快照功能事件监听（只调用一次）
    this.setupSnapshotEvents();

    this._runtimeActive = true;

    setTimeout(() => {
      this.checkAndEnhancePresetPage();
    }, 500);
  }

  /**
   * 渲染UI（由index.js调用，参考字体管理器的架构）
   * @param {HTMLElement} container - UI容器元素
   */
  async renderUI(container) {
    if (!container) {
      logger.warn('preset', '[PresetManager.renderUI] 容器元素不存在');
      return;
    }

    try {
      // 实例化UI类（内部管理，不暴露给index.js）
      this.ui = new PresetManagerUI(this);
      await this.ui.init(container);
      logger.debug('preset', 'PresetManager.renderUI] UI渲染成功');
    } catch (error) {
      logger.error('preset', '[PresetManager.renderUI] UI渲染失败:', error.message);
      throw error;
    }
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    try {
      extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
      extension_settings['Acsus-Paws-Puffs'].presetManager = extension_settings['Acsus-Paws-Puffs'].presetManager || {};

      const settings = extension_settings['Acsus-Paws-Puffs'].presetManager;
      this.enabled = settings.enabled !== false;

      logger.debug('preset', 'PresetManager.loadSettings] 设置已加载，启用状态:', this.enabled);
    } catch (error) {
      logger.error('preset', '[PresetManager.loadSettings] 加载设置失败:', error.message || error);
      this.enabled = true;
    }
  }

  /**
   * 保存设置
   */
  async saveSettings() {
    try {
      extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
      extension_settings['Acsus-Paws-Puffs'].presetManager = extension_settings['Acsus-Paws-Puffs'].presetManager || {};
      extension_settings['Acsus-Paws-Puffs'].presetManager.enabled = this.enabled;

      saveSettingsDebounced();
      logger.debug('preset', 'PresetManager.saveSettings] 设置已保存');
    } catch (error) {
      logger.error('preset', '[PresetManager.saveSettings] 保存设置失败:', error.message || error);
    }
  }

  /**
   * 设置模块启用状态
   *
   * @description
   * 关闭时必须彻底停止运行时：解绑监听、断开Observer、撤销注入；启用时再按需完整恢复。
   *
   * @param {boolean} enabled - 是否启用模块
   * @returns {Promise<void>}
   */
  async setEnabled(enabled) {
    this.enabled = enabled;
    await this.saveSettings();

    if (enabled) {
      await this.activateRuntime();

      // 移除旧的增强标记，强制重新增强
      const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
      if (promptList) {
        promptList.removeAttribute('data-paws-enhanced');
      }

      this.checkAndEnhancePresetPage();

      if (!promptList) {
        setTimeout(() => {
          this.checkAndEnhancePresetPage();
        }, 300);
      }
    } else {
      this.deactivateRuntime();
    }

    eventSource.emit('pawsPresetEnabledChanged', enabled);
    logger.debug('preset', '[PresetManager.setEnabled] 预设管理功能', enabled ? '已启用' : '已禁用');
  }

  /**
   * 停止运行时资源
   *
   * @description
   * 统一处理禁用路径的完整清理，保证“关闭即停止执行”。
   * 包括：增强UI、Observer、DOM监听、eventSource监听、子模块副作用。
   *
   * @returns {void}
   */
  deactivateRuntime() {
    this.cleanupEnhancements();

    if (this.presetObserver) {
      this.presetObserver.disconnect();
      this.presetObserver = null;
    }

    if (this._handlers.onPresetSelectionChanged) {
      document.removeEventListener('change', this._handlers.onPresetSelectionChanged);
      this._handlers.onPresetSelectionChanged = null;
    }

    if (this._handlers.onSnapshotEnabledChanged) {
      eventSource.removeListener('pawsSnapshotEnabledChanged', this._handlers.onSnapshotEnabledChanged);
      this._handlers.onSnapshotEnabledChanged = null;
    }

    if (this.stitch) {
      this.stitch.destroy();
    }

    this._runtimeActive = false;
    logger.debug('preset', '[PresetManager.deactivateRuntime] 运行时资源已清理');
  }

  /**
   * 检查并增强预设页面
   */
  checkAndEnhancePresetPage() {
    logger.debug('preset', '检查预设页面状态...');
    const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');

    if (promptList) {
      logger.debug('preset', '找到预设列表，状态:', {
        enabled: this.enabled,
        enhanced: promptList.hasAttribute('data-paws-enhanced')
      });

      if (!promptList.hasAttribute('data-paws-enhanced')) {
        logger.debug('preset', '执行预设页面增强');
        this.enhancePresetPage();
      }
    } else {
      logger.debug('preset', '未找到预设列表');
    }
  }

  /**
   * 监听预设页面出现
   *
   * @description
   * 监听 #openai_settings 容器，检测预设列表的出现和重建。
   *
   * ⚠️ 重要警告（2025-01-01 修复）：
   * 禁止使用 switchToFooterObserver() 或类似的"缩小监听范围"优化！
   *
   * 原因：SillyTavern 的 promptManager.render() 会执行 innerHTML = ''，
   * 这会删除整个预设管理器容器的内容（包括我们添加的世界书折叠栏和快照按钮），
   * 然后重新创建新的 DOM 结构。如果 Observer 只监听被删除的元素，
   * 它会随着元素被删除而失效，无法检测到新元素的创建。
   *
   * 必须持续监听 #openai_settings（或更上层的容器），
   * 才能在 promptManager.render() 重建 DOM 后重新添加我们的增强功能。
   */
  observePresetPage() {
    if (this.presetObserver) {
      this.presetObserver.disconnect();
    }

    this.presetObserver = new MutationObserver(() => {
      const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
      if (!promptList) return;

      // 检查是否需要增强页面
      // 每次 promptManager.render() 都会删除 data-paws-enhanced 标记，所以需要重新增强
      if (!promptList.hasAttribute('data-paws-enhanced')) {
        logger.debug('preset', '检测到预设列表需要增强');
        this.enhancePresetPage();
      }
    });

    // 监听 openai_settings 容器
    // ⚠️ 不要切换到更小的监听范围！见上方警告
    const settingsContainer = document.querySelector('#openai_settings') || document.body;
    this.presetObserver.observe(settingsContainer, {
      childList: true,
      subtree: true
    });

    this.checkAndEnhancePresetPage();
  }

  /**
   * 增强预设页面
   */
  enhancePresetPage() {
    const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
    if (!promptList || promptList.hasAttribute('data-paws-enhanced')) return;

    // 标记已增强
    promptList.setAttribute('data-paws-enhanced', 'true');

    // 获取当前预设名称
    this.detectCurrentPreset();

    // 创建世界书折叠栏（替代弹窗）
    if (this.enabled && this.worldInfo) {
      this.worldInfo.createWorldBookDrawer();
    }

    // 添加快照保存按钮
    this.addSnapshotSaveButton();

    // 添加缝合器按钮
    if (this.stitch) {
      this.stitch.addStitchButton();
    }

    logger.debug('preset', '预设页面增强完成');
  }

  /**
   * 添加快照保存按钮到预设页面底部
   *
   * @description
   * 按钮可能被 promptManager.render() 删除，所以每次增强时都要检查并重新添加。
   * 采用"先删除旧的，再创建新的"策略，避免 timing 问题导致按钮丢失。
   *
   * ⚠️ 重要：SillyTavern 的异步渲染顺序问题
   *
   * SillyTavern 的 promptManager.render() 执行顺序：
   * 1. innerHTML = '' 清空容器
   * 2. 创建预设列表（#completion_prompt_manager_list）  ← MutationObserver 在这里触发
   * 3. 异步创建底部工具栏（.completion_prompt_manager_footer）
   *
   * 问题：MutationObserver 检测到 list 出现就触发 enhancePresetPage()，
   * 但此时 footer 可能还没创建，所以需要等待 footer 出现。
   *
   * 世界书折叠栏为什么不需要等待？
   * 因为世界书折叠栏插入到 list 之前（list.parentElement.insertBefore），
   * 而 list 在 MutationObserver 触发时已经存在，可以立即插入，无延迟。
   *
   * ⚠️ 禁止使用 setTimeout 轮询！
   * 使用 setTimeout(() => this.addSnapshotSaveButton(), 100) 会导致：
   * - 固定延迟 100ms，用户能感知到按钮"闪烁"（先消失，100ms 后再出现）
   * - 世界书折叠栏是立即重建，快照按钮延迟重建，体验不一致
   *
   * 正确做法：使用 MutationObserver 监听 footer 出现，footer 一出现就立即添加按钮。
   */
  addSnapshotSaveButton() {
    if (!snapshotData.isEnabled()) {
      this.removeSnapshotSaveButton();
      logger.debug('preset', '[PresetManager.addSnapshotSaveButton] 快照功能已禁用，跳过按钮创建');
      return;
    }

    const footer = document.querySelector('.completion_prompt_manager_footer');

    if (!footer) {
      // footer 还没创建，用 MutationObserver 监听它的出现
      logger.debug('preset', 'PresetManager] footer 未就绪，监听其出现');

      const observer = new MutationObserver(() => {
        const footer = document.querySelector('.completion_prompt_manager_footer');
        if (footer) {
          observer.disconnect();
          logger.debug('preset', 'PresetManager] 检测到 footer 出现，立即添加按钮');
          this.addSnapshotSaveButton();
        }
      });

      // 监听预设管理器容器
      const container = document.querySelector('.completion_prompt_manager') ||
        document.querySelector('#openai_settings') ||
        document.body;
      observer.observe(container, { childList: true, subtree: true });

      // 超时保护：1秒后仍未出现则停止监听
      setTimeout(() => {
        observer.disconnect();
        if (!document.querySelector('.completion_prompt_manager_footer')) {
          logger.warn('preset', '[PresetManager] footer 超时未出现，停止监听');
        }
      }, 1000);

      return;
    }

    // ✅ 先删除旧按钮（如果存在）
    const existingBtn = footer.querySelector('#paws-save-snapshot-btn');
    if (existingBtn) {
      existingBtn.remove();
      logger.debug('preset', 'PresetManager] 已删除旧的快照按钮');
    }

    // ✅ 创建新按钮
    const saveBtn = document.createElement('a');
    saveBtn.id = 'paws-save-snapshot-btn';
    saveBtn.className = 'menu_button fa-camera fa-solid fa-fw interactable';
    saveBtn.title = '保存当前开关状态为快照';
    saveBtn.tabIndex = 0;
    saveBtn.role = 'button';

    if (!this._handlers.onSnapshotSaveClick) {
      this._handlers.onSnapshotSaveClick = async () => {
        await this.showSaveSnapshotDialog();
      };
    }

    // 绑定点击事件
    saveBtn.addEventListener('click', this._handlers.onSnapshotSaveClick);

    // 插入到底部栏（在第一个按钮之前）
    const firstBtn = footer.querySelector('.menu_button');
    if (firstBtn) {
      footer.insertBefore(saveBtn, firstBtn);
    } else {
      footer.appendChild(saveBtn);
    }

    logger.debug('preset', 'PresetManager] 快照保存按钮已添加');
  }

  /**
   * 移除快照保存按钮及其事件监听
   * @returns {void}
   */
  removeSnapshotSaveButton() {
    const saveBtn = document.querySelector('#paws-save-snapshot-btn');
    if (!saveBtn) return;

    if (this._handlers.onSnapshotSaveClick) {
      saveBtn.removeEventListener('click', this._handlers.onSnapshotSaveClick);
    }

    saveBtn.remove();
    logger.debug('preset', '[PresetManager.removeSnapshotSaveButton] 快照保存按钮已移除');
  }

  /**
   * 设置快照功能事件监听
   *
   * @description
   * 监听快照开关变化并执行对称清理：启用时恢复按钮，禁用时移除按钮和点击监听，
   * 这样可以避免“仅隐藏UI但逻辑仍活跃”的状态残留。
   *
   * @returns {void}
   */
  setupSnapshotEvents() {
    if (this._handlers.onSnapshotEnabledChanged) return;

    // 监听功能开关变化，更新按钮显示状态
    this._handlers.onSnapshotEnabledChanged = (enabled) => {
      if (enabled) {
        this.addSnapshotSaveButton();
      } else {
        this.removeSnapshotSaveButton();
      }

      logger.debug('preset', '[PresetManager.setupSnapshotEvents] 快照功能状态变化:', enabled ? '启用' : '禁用');
    };

    eventSource.on('pawsSnapshotEnabledChanged', this._handlers.onSnapshotEnabledChanged);
  }

  /**
   * 显示保存快照对话框
   */
  async showSaveSnapshotDialog() {
    const defaultName = `快照 ${new Date().toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    })}`;

    const name = prompt('请输入快照名称:', defaultName);

    if (name === null) {
      // 用户取消
      return;
    }

    const snapshotName = name.trim() || defaultName;
    const id = snapshotData.saveSnapshot(snapshotName);

    if (id) {
      toastr.success(`快照"${snapshotName}"已保存`);
    } else {
      toastr.error('保存快照失败');
    }
  }

  /**
   * 检测当前预设
   */
  detectCurrentPreset() {
    const presetSelect = document.querySelector('#settings_preset_openai, #settings_preset');
    if (presetSelect) {
      this.currentPreset = presetSelect.value;
      logger.debug('preset', '当前预设:', this.currentPreset);
    }
  }

  /**
   * 清理增强功能
   */
  cleanupEnhancements() {
    const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
    if (promptList) {
      promptList.removeAttribute('data-paws-enhanced');
    }

    this.removeSnapshotSaveButton();

    // 删除世界书折叠栏
    if (this.worldInfo) {
      this.worldInfo.destroy();
    }
  }

  /**
   * 显示消息提示
   */
  showMessage(message, type = 'info') {
    logger.info(`${type.toUpperCase()}: ${message}`);

    if (typeof toastr !== 'undefined') {
      switch (type) {
        case 'success': toastr.success(message); break;
        case 'warning': toastr.warning(message); break;
        case 'error': toastr.error(message); break;
        default: toastr.info(message);
      }
    } else {
      alert(`${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (this._handlers.onPresetSelectionChanged) return;

    this._handlers.onPresetSelectionChanged = (e) => {
      if (e.target.matches('#settings_preset_openai, #settings_preset')) {
        this.currentPreset = e.target.value;
        logger.debug('preset', '预设已切换到:', this.currentPreset);
      }
    };

    document.addEventListener('change', this._handlers.onPresetSelectionChanged);

    // 世界书功能已移至独立工具
  }

  /**
   * 获取标签页配置
   */
  getTabConfig() {
    return {
      id: this.moduleId,
      title: '预设管理',
      icon: 'fa-list',
      ui: PresetManagerUI,
      order: 4
    };
  }

  /**
   * 获取模块统计信息
   */
  getStats() {
    return {
      enabled: this.enabled,
      currentPreset: this.currentPreset
    };
  }

  /**
   * 销毁模块
   */
  destroy() {
    this.deactivateRuntime();

    if (this.ui) {
      this.ui.destroy();
    }
  }
}
