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

    // 当前活动预设
    this.currentPreset = null;

    // DOM观察器
    this.presetObserver = null;
  }

  /**
   * 初始化模块
   */
  async init() {
    logger.debug('[PresetManager.init] 初始化预设管理器...');

    // 加载设置
    await this.loadSettings();

    // 初始化世界书集成
    this.worldInfo = new WorldInfoIntegration(this);
    await this.worldInfo.init();

    // 监听预设页面出现
    this.observePresetPage();

    // 设置事件监听
    this.setupEventListeners();

    // 设置快照功能事件监听（只调用一次）
    this.setupSnapshotEvents();

    this.initialized = true;
    logger.info('[PresetManager.init] 预设管理器初始化完成，启用状态:', this.enabled);

    // 如果已启用，延迟检查预设页面
    if (this.enabled) {
      setTimeout(() => {
        this.checkAndEnhancePresetPage();
      }, 500);
    }
  }

  /**
   * 渲染UI（由index.js调用，参考字体管理器的架构）
   * @param {HTMLElement} container - UI容器元素
   */
  async renderUI(container) {
    if (!container) {
      logger.warn('[PresetManager.renderUI] 容器元素不存在');
      return;
    }

    try {
      // 实例化UI类（内部管理，不暴露给index.js）
      this.ui = new PresetManagerUI(this);
      await this.ui.init(container);
      logger.debug('[PresetManager.renderUI] UI渲染成功');
    } catch (error) {
      logger.error('[PresetManager.renderUI] UI渲染失败:', error.message);
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

      logger.debug('[PresetManager.loadSettings] 设置已加载，启用状态:', this.enabled);
    } catch (error) {
      logger.error('[PresetManager.loadSettings] 加载设置失败:', error.message || error);
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
      logger.debug('[PresetManager.saveSettings] 设置已保存');
    } catch (error) {
      logger.error('[PresetManager.saveSettings] 保存设置失败:', error.message || error);
    }
  }

  /**
   * 设置模块启用状态
   */
  async setEnabled(enabled) {
    this.enabled = enabled;
    await this.saveSettings();

    if (enabled) {
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
      this.cleanupEnhancements();
    }

    eventSource.emit('pawsPresetEnabledChanged', enabled);
    logger.debug(' 预设管理功能', enabled ? '已启用' : '已禁用');
  }


  /**
   * 检查并增强预设页面
   */
  checkAndEnhancePresetPage() {
    logger.debug(' 检查预设页面状态...');
    const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');

    if (promptList) {
      logger.debug(' 找到预设列表，状态:', {
        enabled: this.enabled,
        enhanced: promptList.hasAttribute('data-paws-enhanced')
      });

      if (!promptList.hasAttribute('data-paws-enhanced')) {
        logger.debug(' 执行预设页面增强');
        this.enhancePresetPage();
      }
    } else {
      logger.debug(' 未找到预设列表');
    }
  }

  /**
   * 监听预设页面出现
   * @description 使用 MutationObserver 监听 DOM 变化，检测预设页面出现或按钮被删除的情况
   */
  observePresetPage() {
    this.presetObserver = new MutationObserver((mutations) => {
      const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
      if (!promptList) return;

      // 检查是否需要增强页面（首次出现）
      if (!promptList.hasAttribute('data-paws-enhanced')) {
        logger.debug(' 检测到预设列表，开始增强');
        this.enhancePresetPage();
        return;
      }

      // 检查按钮是否被删除（promptManager.render() 会清空 footer）
      // 这是解决切换预设后按钮消失问题的关键
      const footer = document.querySelector('.completion_prompt_manager_footer');
      if (footer && !footer.querySelector('#paws-save-snapshot-btn')) {
        logger.debug('[PresetManager] 检测到快照按钮被删除，重新添加');
        this.addSnapshotSaveButton();
      }
    });

    if (document.body) {
      this.presetObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

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

    logger.debug(' 预设页面增强完成');
  }

  /**
   * 添加快照保存按钮到预设页面底部
   * @description 按钮可能被 promptManager.render() 删除，所以每次增强时都要检查并重新添加
   */
  addSnapshotSaveButton() {
    const footer = document.querySelector('.completion_prompt_manager_footer');
    if (!footer) {
      logger.debug('[PresetManager] 未找到预设页面底部栏');
      return;
    }

    // 检查是否已添加（避免重复添加）
    if (footer.querySelector('#paws-save-snapshot-btn')) {
      // 按钮已存在，只需更新显示状态
      const existingBtn = footer.querySelector('#paws-save-snapshot-btn');
      existingBtn.style.display = snapshotData.isEnabled() ? '' : 'none';
      return;
    }

    // 创建保存按钮
    const saveBtn = document.createElement('a');
    saveBtn.id = 'paws-save-snapshot-btn';
    saveBtn.className = 'menu_button fa-camera fa-solid fa-fw interactable';
    saveBtn.title = '保存当前开关状态为快照';
    saveBtn.tabIndex = 0;
    saveBtn.role = 'button';

    // 根据功能开关状态显示/隐藏
    saveBtn.style.display = snapshotData.isEnabled() ? '' : 'none';

    // 绑定点击事件
    saveBtn.addEventListener('click', async () => {
      await this.showSaveSnapshotDialog();
    });

    // 插入到底部栏（在第一个按钮之前）
    const firstBtn = footer.querySelector('.menu_button');
    if (firstBtn) {
      footer.insertBefore(saveBtn, firstBtn);
    } else {
      footer.appendChild(saveBtn);
    }

    logger.debug('[PresetManager] 快照保存按钮已添加');
  }

  /**
   * 设置快照功能事件监听
   * @description 监听功能开关变化事件，更新按钮显示状态
   * 注意：按钮被删除后的恢复逻辑已移至 observePresetPage() 的 MutationObserver 中
   */
  setupSnapshotEvents() {
    // 监听功能开关变化，更新按钮显示状态
    eventSource.on('pawsSnapshotEnabledChanged', (enabled) => {
      const saveBtn = document.querySelector('#paws-save-snapshot-btn');
      if (saveBtn) {
        saveBtn.style.display = enabled ? '' : 'none';
      }
      logger.debug('[PresetManager] 快照功能状态变化:', enabled ? '启用' : '禁用');
    });
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
      this.showMessage(`快照"${snapshotName}"已保存`, 'success');
    } else {
      this.showMessage('保存快照失败', 'error');
    }
  }

  /**
   * 检测当前预设
   */
  detectCurrentPreset() {
    const presetSelect = document.querySelector('#settings_preset_openai, #settings_preset');
    if (presetSelect) {
      this.currentPreset = presetSelect.value;
      logger.debug(' 当前预设:', this.currentPreset);
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
    document.addEventListener('change', (e) => {
      if (e.target.matches('#settings_preset_openai, #settings_preset')) {
        this.currentPreset = e.target.value;
        logger.debug(' 预设已切换到:', this.currentPreset);
      }
    });

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
    this.cleanupEnhancements();

    if (this.presetObserver) {
      this.presetObserver.disconnect();
    }

    if (this.ui) {
      this.ui.destroy();
    }

    if (this.worldInfo) {
      this.worldInfo.destroy();
    }
  }
}
