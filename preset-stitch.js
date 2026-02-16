/**
 * 预设缝合器 - 主控制器
 *
 * 负责：
 * - 模块初始化和销毁
 * - 入口按钮的添加和管理（使用 MutationObserver 模式）
 * - 与 SillyTavern promptManager 的交互
 * - 事件监听和分发
 */

import { eventSource } from '../../../../script.js';
import { oai_settings, promptManager } from '../../../openai.js';
import { uuidv4 } from '../../../utils.js';
import * as stitchData from './preset-stitch-data.js';
import { PresetStitchUI } from './preset-stitch-ui.js';
import logger from './logger.js';

// ========================================
// 预设缝合器主模块
// ========================================

export class PresetStitchModule {
  /**
   * @param {Object} presetManager - PresetManagerModule 实例
   */
  constructor(presetManager) {
    this.presetManager = presetManager;
    this.initialized = false;
    this.ui = null; // UI 实例，后续创建
  }

  /**
   * 初始化模块
   */
  async init() {
    logger.debug('preset', 'PresetStitch.init] 初始化预设缝合器...');

    // 加载数据
    stitchData.loadData();

    // 创建 UI 实例
    this.ui = new PresetStitchUI(this);

    // 设置事件监听
    this.setupEventListeners();

    this.initialized = true;
    logger.info('preset', '[PresetStitch.init] 预设缝合器初始化完成，启用状态:', stitchData.isEnabled());
  }

  /**
   * 设置启用状态
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    stitchData.setEnabled(enabled);

    // 更新按钮显示状态
    const btn = document.querySelector('#paws-stitch-btn');
    if (btn) {
      btn.style.display = enabled ? '' : 'none';
    }

    // 发送事件通知
    eventSource.emit('pawsStitchEnabledChanged', enabled);
    logger.debug('preset', 'PresetStitch] 功能状态变化:', enabled ? '启用' : '禁用');
  }

  /**
   * 检查功能是否启用
   * @returns {boolean}
   */
  isEnabled() {
    return stitchData.isEnabled();
  }


  /**
   * 添加缝合器入口按钮到预设页面底部
   *
   * @description
   * 参考快照按钮的实现模式：
   * - 按钮可能被 promptManager.render() 删除，所以每次增强时都要检查并重新添加
   * - 使用 MutationObserver 监听 footer 出现
   * - 采用"先删除旧的，再创建新的"策略
   */
  addStitchButton() {
    const footer = document.querySelector('.completion_prompt_manager_footer');

    if (!footer) {
      // footer 还没创建，用 MutationObserver 监听它的出现
      logger.debug('preset', 'PresetStitch] footer 未就绪，监听其出现');

      const observer = new MutationObserver(() => {
        const footer = document.querySelector('.completion_prompt_manager_footer');
        if (footer) {
          observer.disconnect();
          logger.debug('preset', 'PresetStitch] 检测到 footer 出现，立即添加按钮');
          this.addStitchButton();
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
          logger.warn('preset', '[PresetStitch] footer 超时未出现，停止监听');
        }
      }, 1000);

      return;
    }

    // 先删除旧按钮（如果存在）
    const existingBtn = footer.querySelector('#paws-stitch-btn');
    if (existingBtn) {
      existingBtn.remove();
      logger.debug('preset', 'PresetStitch] 已删除旧的缝合按钮');
    }

    // 创建新按钮
    const stitchBtn = document.createElement('a');
    stitchBtn.id = 'paws-stitch-btn';
    stitchBtn.className = 'menu_button fa-puzzle-piece fa-solid fa-fw interactable';
    stitchBtn.title = '打开条目收藏库';
    stitchBtn.tabIndex = 0;
    stitchBtn.role = 'button';

    // 根据功能开关状态显示/隐藏
    stitchBtn.style.display = stitchData.isEnabled() ? '' : 'none';

    // 绑定点击事件
    stitchBtn.addEventListener('click', () => {
      this.openLibraryPopup();
    });

    // 插入到底部栏（在快照按钮之后，或在第一个按钮之前）
    const snapshotBtn = footer.querySelector('#paws-save-snapshot-btn');
    if (snapshotBtn && snapshotBtn.nextSibling) {
      footer.insertBefore(stitchBtn, snapshotBtn.nextSibling);
    } else if (snapshotBtn) {
      footer.appendChild(stitchBtn);
    } else {
      const firstBtn = footer.querySelector('.menu_button');
      if (firstBtn) {
        footer.insertBefore(stitchBtn, firstBtn);
      } else {
        footer.appendChild(stitchBtn);
      }
    }

    logger.debug('preset', 'PresetStitch] 缝合按钮已添加');
  }

  /**
   * 打开收藏库弹窗
   */
  openLibraryPopup() {
    logger.debug('preset', 'PresetStitch] 打开收藏库弹窗');

    if (this.ui) {
      this.ui.show();
    } else {
      // UI 模块尚未创建，显示临时提示
      toastr.info('收藏库功能开发中...');
    }
  }

  /**
   * 获取当前预设的条目列表
   *
   * @description
   * 使用 promptManager.getPromptOrderForCharacter 获取完整的条目列表，
   * 这是 SillyTavern 官方的获取方式，能获取到所有条目。
   *
   * @returns {Array} 条目数组，包含 identifier、name、enabled、marker 等信息
   */
  getCurrentPresetEntries() {
    try {
      if (!promptManager || !promptManager.activeCharacter) {
        logger.warn('preset', '[PresetStitch] promptManager 或 activeCharacter 不存在');
        return [];
      }

      // 使用官方方法获取 prompt_order
      const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);
      if (!promptOrder || promptOrder.length === 0) {
        logger.warn('preset', '[PresetStitch] 未找到当前预设的条目顺序');
        return [];
      }

      // 根据 order 获取条目详情
      const entries = [];
      for (const orderItem of promptOrder) {
        // 尝试获取条目详情
        let prompt = null;
        try {
          prompt = promptManager.getPromptById(orderItem.identifier);
        } catch (e) {
          // 忽略错误
        }

        entries.push({
          identifier: orderItem.identifier,
          name: prompt?.name || orderItem.identifier,
          content: prompt?.content || '',
          role: prompt?.role || 'system',
          enabled: orderItem.enabled,
          system_prompt: prompt?.system_prompt,
          marker: prompt?.marker
        });
      }

      return entries;
    } catch (error) {
      logger.error('preset', '[PresetStitch] 获取预设条目失败:', error.message);
      return [];
    }
  }

  /**
   * 插入条目到当前预设
   *
   * @description
   * 使用 promptManager 的官方方法添加条目：
   * 1. addPrompt() - 添加条目到 prompts 列表
   * 2. 手动操作 prompt_order 来控制插入位置
   * 3. render() - 重新渲染 UI
   * 4. saveServiceSettings() - 保存设置
   *
   * @param {Object} item - 收藏库条目
   * @param {string} position - 插入位置（'top'/'bottom'/条目identifier）
   * @returns {string} 新条目的 identifier
   * @throws {Error} promptManager 不可用或插入失败时抛出错误
   */
  async insertEntryToPreset(item, position) {
    try {
      if (!promptManager || !promptManager.activeCharacter) {
        throw new Error('promptManager 不可用');
      }

      // 创建新条目
      const newIdentifier = uuidv4();
      const newPrompt = {
        name: item.name,
        content: item.content || '',
        role: item.role || 'system',
        injection_position: 0,
        injection_depth: 4,
      };

      // 1. 添加到 prompts 列表
      promptManager.addPrompt(newPrompt, newIdentifier);

      // 2. 获取当前 prompt_order 并插入到指定位置
      const promptOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);

      // 计算插入位置索引
      let insertIndex = 0;
      if (position === 'top') {
        insertIndex = 0;
      } else if (position === 'bottom') {
        insertIndex = promptOrder.length;
      } else {
        // 在指定条目之后插入
        const targetIndex = promptOrder.findIndex(o => o.identifier === position);
        insertIndex = targetIndex !== -1 ? targetIndex + 1 : promptOrder.length;
      }

      // 插入到 prompt_order
      promptOrder.splice(insertIndex, 0, {
        identifier: newIdentifier,
        enabled: false
      });

      // 3. 重新渲染 UI
      if (typeof promptManager.render === 'function') {
        promptManager.render();
      }

      // 4. 保存设置
      if (typeof promptManager.saveServiceSettings === 'function') {
        promptManager.saveServiceSettings();
      }

      logger.info('preset', '[PresetStitch] 已插入条目:', item.name, '位置:', insertIndex);
      return newIdentifier;
    } catch (error) {
      logger.error('preset', '[PresetStitch] 插入条目失败:', error.message);
      throw error;
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 监听功能开关变化，更新按钮显示状态
    eventSource.on('pawsStitchEnabledChanged', (enabled) => {
      const btn = document.querySelector('#paws-stitch-btn');
      if (btn) {
        btn.style.display = enabled ? '' : 'none';
      }
    });
  }

  /**
   * 销毁模块
   */
  destroy() {
    // 移除按钮
    const btn = document.querySelector('#paws-stitch-btn');
    if (btn) {
      btn.remove();
    }

    // 销毁 UI
    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }

    this.initialized = false;
    logger.debug('preset', 'PresetStitch] 模块已销毁');
  }
}
