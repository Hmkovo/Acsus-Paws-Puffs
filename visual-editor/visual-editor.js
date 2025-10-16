/**
 * @file 可视化编辑器 - 主控文件
 * @description
 * 总指挥，协调所有可视化编辑器模块。
 * 
 * 核心职责：
 * - 监听主题切换事件
 * - 检测输入框中的分隔符
 * - 提取中文CSS并编译
 * - 应用编译结果到DOM
 * - 管理UI面板状态
 * 
 * 核心架构（主题独立存储）：
 * - ❌ 不在 extension_settings 存储中文CSS
 * - ✅ 中文CSS存在输入框（power_user.custom_css）
 * - ✅ 使用分隔符标记可视化编辑区域
 * - ✅ 编译结果直接应用到DOM（不写回输入框）
 * - ✅ 每个主题独立存储（官方机制自动切换）
 * 
 * @module visual-editor
 * @requires visual-editor-ui - UI渲染
 * @requires visual-editor-compiler - 编译器
 * @requires extensions - SillyTavern原生API
 * @requires script - SillyTavern原生API
 * 
 * Grep标记：[IMPORT] [CORE] [EVENT] [EXPORT]
 */

// [IMPORT] 导入官方API
import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";

// [IMPORT] 导入UI模块
import { BeginnerMode } from './modes/beginner/beginner-mode.js';
// import { ExpertMode } from './modes/expert/expert-mode.js';  // P1阶段

// [IMPORT] 导入编译器
import {
  compileToEnglishCSS,
  parseElementStyles,
  extractChineseCSS,
  removeChineseCSSMarkers,
  VISUAL_MARKER_START,
  VISUAL_MARKER_END
} from './compiler.js';

// [IMPORT] 导入日志模块
import logger from '../logger.js';

export class VisualEditor {
  /**
   * 构造函数
   * 
   * @description
   * 初始化可视化编辑器的状态
   * - compilerEnabled: 中文CSS编译功能开关
   * - panelEnabled: 可视化编辑面板显示开关
   * - currentMode: 当前模式（'beginner' | 'expert'）
   * - beginnerMode: BeginnerMode 实例（新手模式 UI 管理者）
   * - expertMode: ExpertMode 实例（专家模式 UI 管理者）
   * - syncState: 共享公告板对象，所有模块共用防循环标记
   */
  constructor() {
    // 编辑器功能开关（从 extension_settings 读取）
    this.compilerEnabled = true;
    this.panelEnabled = false;

    // 当前模式
    this.currentMode = 'beginner';  // 'beginner' | 'expert'

    // 模式实例
    this.beginnerMode = null;
    this.expertMode = null;

    // ✅ 共享公告板：所有员工（UI、装饰、图标）共用这个对象防止循环
    // isUpdating=true 表示"扩展正在修改输入框，跳过input事件"
    this.syncState = { isUpdating: false };
  }

  /**
   * 初始化可视化编辑器
   * 
   * @description
   * 从 extension_settings 加载功能开关状态：
   * - compilerEnabled: 默认开启（将中文CSS编译为英文CSS）
   * - panelEnabled: 默认关闭（在导航栏显示可视化面板按钮）
   * 
   * 关键变化：不再从 extension_settings 读取中文CSS
   * 改为从输入框提取分隔符内的中文CSS
   * 
   * 时序控制：使用 DOM 检测而不是 setTimeout 猜测
   * - 如果 DOM 还在加载：等待 DOMContentLoaded 事件
   * - 如果 DOM 已加载：立即执行初始编译
   * 
   * @async
   */
  async init() {
    logger.debug('[VisualEditor.init] 开始初始化可视化编辑器');

    // 确保设置对象存在
    extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
    extension_settings['Acsus-Paws-Puffs'].visualEditor = extension_settings['Acsus-Paws-Puffs'].visualEditor || {};

    // 加载功能开关状态
    const settings = extension_settings['Acsus-Paws-Puffs'].visualEditor;
    this.compilerEnabled = settings.compilerEnabled !== false; // 默认开启
    this.panelEnabled = settings.panelEnabled === true; // 默认关闭

    logger.debug('[VisualEditor.init] 中文CSS编译:', this.compilerEnabled ? '启用' : '禁用');
    logger.debug('[VisualEditor.init] 可视化面板:', this.panelEnabled ? '启用' : '禁用');

    // ✅ 使用DOM检测而不是setTimeout猜测
    if (document.readyState === 'loading') {
      // DOM还没加载好，等待DOMContentLoaded事件
      logger.debug('[VisualEditor.init] DOM正在加载中，等待DOMContentLoaded事件');
      document.addEventListener('DOMContentLoaded', () => {
        logger.debug('[VisualEditor.init] DOM加载完成，开始初始编译');
        this.compileAndApply();
      });
    } else {
      // DOM已经加载好了，立即执行
      logger.debug('[VisualEditor.init] DOM已就绪，立即执行初始编译');
      this.compileAndApply();
    }

    logger.info('[VisualEditor.init] 可视化编辑器初始化完成');
  }

  /**
   * 渲染 UI 界面
   * 
   * @description
   * 初始化可视化编辑器UI：
   * 1. 绑定设置页面事件（HTML在settings.html）
   * 2. 设置输入框监听
   * 3. 监听主题切换
   * 4. 如果面板开启，加载内嵌面板并初始化模式
   * 
   * @async
   * @param {HTMLElement} container - UI 容器元素
   */
  async renderUI(container) {
    if (!container) {
      logger.warn('[VisualEditor.renderUI] 容器元素不存在');
      return;
    }

    logger.debug('[VisualEditor.renderUI] 开始渲染UI');

    // 1. 绑定设置页面事件（HTML已在settings.html）
    this.bindSettingsEvents(container);

    // 2. 设置输入框监听（主控职责：监听官方#customCSS）
    this.setupInputBoxSync();

    // 3. 监听主题切换事件（主题切换后检测分隔符并编译）
    this.setupThemeChangeSync();

    // 4. 如果面板开启，加载内嵌面板并初始化模式
    if (this.panelEnabled) {
      await this.loadEmbeddedPanel();
    }

    logger.debug('[VisualEditor.renderUI] UI渲染完成');
  }

  /**
   * 编译并应用CSS（主题独立存储）
   * 
   * @description
   * 核心逻辑（主题独立存储）：
   * 1. 从输入框提取分隔符内的中文CSS
   * 2. 如果有中文CSS，编译成英文CSS
   * 3. 编译结果直接应用到DOM（不写回输入框）
   * 4. 如果没有分隔符，清空style标签
   * 
   * 关键机制：
   * - ❌ 不从 extension_settings 读取中文CSS
   * - ✅ 从输入框提取分隔符内的中文CSS
   * - ✅ 编译结果直接应用到 <style id="paws-puffs-custom-style">
   * - ✅ 不写回输入框（保持输入框只有中文CSS）
   * - ✅ 每次编译都覆盖旧的style标签（不累积）
   * 
   * 流程：
   * 1. 读取输入框全部内容
   * 2. 提取分隔符内的中文CSS
   * 3. 如果有中文CSS，编译并应用；如果没有，清空style标签
   * 
   * @async
   */
  async compileAndApply() {
    // 检查编译器开关
    if (!this.compilerEnabled) {
      logger.debug('[VisualEditor.compileAndApply] 编译器已禁用，跳过');
      return;
    }

    // 获取输入框元素
    const customCSSInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#customCSS'));
    if (!customCSSInput) {
      logger.error('[VisualEditor.compileAndApply] 未找到#customCSS输入框');
      return;
    }

    // 1. 读取输入框全部内容
    const inputContent = customCSSInput.value || '';

    // 2. 提取分隔符内的中文CSS
    const chineseCSS = extractChineseCSS(inputContent);

    if (!chineseCSS || !chineseCSS.trim()) {
      logger.debug('[VisualEditor.compileAndApply] 未找到分隔符或中文CSS为空');

      // 清空style标签（没有分隔符时）
      const style = document.getElementById('paws-puffs-custom-style');
      if (style) {
        style.remove();
        logger.debug('[VisualEditor.compileAndApply] 已清空style标签（无分隔符）');
      }

      // 注意：不自动重置操作面板，用户可手动点击"↻ 重置键"
      logger.debug('[VisualEditor.compileAndApply] 操作面板保持当前状态');

      return;
    }

    logger.debug('[VisualEditor.compileAndApply] 开始编译中文CSS');
    logger.debug('[VisualEditor.compileAndApply] 中文CSS:', chineseCSS);

    // 3. 编译成英文CSS
    const englishCSS = compileToEnglishCSS(chineseCSS);

    if (!englishCSS || !englishCSS.trim()) {
      logger.warn('[VisualEditor.compileAndApply] 编译结果为空');
      return;
    }

    logger.debug('[VisualEditor.compileAndApply] 编译完成');
    logger.debug('[VisualEditor.compileAndApply] 英文CSS:', englishCSS);

    // 4. 应用编译结果到DOM（覆盖，不累积）
    let style = document.getElementById('paws-puffs-custom-style');
    if (style) {
      // 覆盖旧的（innerHTML = 赋值，不是追加）
      style.innerHTML = englishCSS;
      logger.debug('[VisualEditor.compileAndApply] 已覆盖style标签内容');
    } else {
      // 创建新的style标签
      style = document.createElement('style');
      style.setAttribute('type', 'text/css');
      style.setAttribute('id', 'paws-puffs-custom-style');
      style.innerHTML = englishCSS;
      document.head.appendChild(style);
      logger.debug('[VisualEditor.compileAndApply] 已创建并添加style标签');
    }

    logger.info('[VisualEditor.compileAndApply] CSS已应用到界面（主题独立）');
  }

  /**
   * 监听主题切换事件
   * 
   * @description
   * 监听官方 #themes 下拉框的 change 事件：
   * 1. 用户切换主题
   * 2. 延迟100ms等待官方加载完主题
   * 3. 检测输入框是否有分隔符
   * 4. 有分隔符 → 提取中文CSS → 编译并应用 → 更新UI面板
   * 5. 无分隔符 → 清空style标签 → 重置UI面板
   * 
   * 关键：主题切换时，power_user.custom_css 会自动切换
   * 我们只需要重新检测并编译即可
   * 
   * 注意：无论是否启用"可视化面板"，只要有分隔符就编译
   */
  setupThemeChangeSync() {
    const themesSelect = document.querySelector('#themes');
    if (!themesSelect) {
      logger.warn('[VisualEditor.setupThemeChangeSync] 未找到#themes下拉框');
      return;
    }

    themesSelect.addEventListener('change', () => {
      logger.debug('[VisualEditor.setupThemeChangeSync] 检测到主题切换');

      // 延迟执行，确保官方主题已完全加载
      setTimeout(() => {
        logger.info('[VisualEditor.setupThemeChangeSync] 主题切换后重新编译CSS');

        // 重新编译并应用（会自动检测分隔符）
        this.compileAndApply();

        // 注意：不自动更新操作面板，用户需要手动点击"🔄 关联键"触发同步
        logger.debug('[VisualEditor.setupThemeChangeSync] 操作面板保持当前状态，用户可手动点击关联键同步');
      }, 100);
    });

    logger.debug('[VisualEditor.setupThemeChangeSync] 主题切换监听已设置');
  }

  /**
   * 设置输入框同步监听（反向同步：输入框 → 控件）
   * 
   * @description
   * 监听官方CSS输入框的变化，当用户手动修改分隔符内的中文CSS时：
   * 1. 提取分隔符内的中文CSS
   * 2. 重新编译并应用
   * 3. 如果有选中的元素，更新控件值
   * 
   * 关键：不保存到 extension_settings
   * 中文CSS已经在输入框里了，不需要重复存储
   * 
   * ⚠️ 防循环机制说明：
   * - 当前代码：通过 JavaScript 修改 input.value 不会触发 input 事件（浏览器原生行为）
   * - 所以防循环机制（syncState.isUpdating）实际上不会被触发
   * - 但我们保留它作为"保险机制"，防止以下情况：
   *   1. 未来添加的模块可能手动触发 input 事件（dispatchEvent）
   *   2. SillyTavern 官方代码可能触发 input 事件
   *   3. 浏览器扩展或其他脚本可能触发
   * - 旧代码问题：曾使用 dispatchEvent(new Event('input')) 导致无限循环
   */
  setupInputBoxSync() {
    const customCSSInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#customCSS'));
    if (!customCSSInput) {
      logger.warn('[VisualEditor.setupInputBoxSync] 未找到#customCSS输入框');
      return;
    }

    // 防抖处理（300ms）
    let inputDebounceTimer = null;

    // 监听输入框变化
    customCSSInput.addEventListener('input', () => {
      // 防循环：检查共享公告板，如果扩展正在修改输入框，跳过处理
      if (this.syncState.isUpdating) {
        logger.debug('[VisualEditor.setupInputBoxSync] 跳过：扩展自己触发的input事件');
        return;
      }

      // 清除之前的定时器
      clearTimeout(inputDebounceTimer);

      // 防抖：300ms后才处理
      inputDebounceTimer = setTimeout(() => {
        logger.debug('[VisualEditor.setupInputBoxSync] 输入框内容变化');

        // 获取输入框全部内容
        const inputContent = customCSSInput.value || '';

        // 提取分隔符内的中文CSS
        const chineseCSS = extractChineseCSS(inputContent);

        if (!chineseCSS) {
          logger.debug('[VisualEditor.setupInputBoxSync] 未找到分隔符内的中文CSS');
          // 重新编译（会清空style标签）
          this.compileAndApply();
          return;
        }

        // 重新编译并应用
        this.compileAndApply();

        // 🆕 智能实时同步：如果有选中的元素，更新控件值（不重新渲染）
        if (this.beginnerMode && this.beginnerMode.selectedElement) {
          logger.debug('[VisualEditor.setupInputBoxSync] 检测到选中元素，触发控件值同步');
          this.beginnerMode.syncControlValues();
        }
      }, 300);
    });

    logger.debug('[VisualEditor.setupInputBoxSync] 输入框监听已设置');
  }

  /**
   * 导出分隔符常量供UI使用
   * 
   * @description
   * UI面板需要显示分隔符样式供用户复制
   * 
   * @returns {Object} 包含开始和结束分隔符的对象
   */
  getMarkers() {
    return {
      start: VISUAL_MARKER_START,
      end: VISUAL_MARKER_END
    };
  }

  /**
   * 绑定设置页面事件
   * 
   * @description
   * 绑定settings.html中设置页面的所有事件：
   * - 功能开关（启用编译器、启用面板）
   * - 清理按钮（清理CSS、图标、所有数据）
   * - 手风琴切换
   * 
   * @param {HTMLElement} container - 设置页面容器
   */
  bindSettingsEvents(container) {
    if (!container) return;

    logger.debug('[VisualEditor.bindSettingsEvents] 绑定设置页面事件');

    // 绑定手风琴
    this.bindAccordion(container);

    // 绑定功能开关
    this.bindSwitches(container);

    // 绑定清理按钮
    this.bindCleanupButtons(container);

    // 加载设置（复选框状态）
    this.loadSettings(container);
  }

  /**
   * 绑定手风琴切换事件
   * 
   * @param {HTMLElement} container - 设置页面容器
   */
  bindAccordion(container) {
    const headers = container.querySelectorAll('.paws-puffs-settings-accordion-header');

    headers.forEach(header => {
      header.addEventListener('click', () => {
        const clickedCard = /** @type {HTMLElement} */ (header).dataset.card;
        logger.debug('[VisualEditor.bindAccordion] 切换手风琴卡片:', clickedCard);

        const allCards = container.querySelectorAll('.paws-puffs-settings-accordion-card');

        // 切换所有卡片的active状态
        allCards.forEach(card => {
          if (/** @type {HTMLElement} */ (card).dataset.card === clickedCard) {
            card.classList.add('active');
          } else {
            card.classList.remove('active');
          }
        });
      });
    });
  }

  /**
   * 绑定功能开关
   * 
   * @param {HTMLElement} container - 设置页面容器
   */
  bindSwitches(container) {
    // 开关1：启用中文CSS编译
    const compilerCheckbox = /** @type {HTMLInputElement} */ (container.querySelector('#paws-puffs-ve-enable-compiler'));
    if (compilerCheckbox) {
      compilerCheckbox.addEventListener('change', () => {
        extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
        extension_settings['Acsus-Paws-Puffs'].visualEditor = extension_settings['Acsus-Paws-Puffs'].visualEditor || {};
        extension_settings['Acsus-Paws-Puffs'].visualEditor.compilerEnabled = compilerCheckbox.checked;
        this.compilerEnabled = compilerCheckbox.checked;
        saveSettingsDebounced();
        logger.info('[VisualEditor.bindSwitches] 中文CSS编译:', compilerCheckbox.checked ? '启用' : '禁用');

        // 触发编译或清除样式
        if (compilerCheckbox.checked) {
          // 启用编译：立即触发一次编译
          this.compileAndApply();
        } else {
          // 禁用编译：清除style标签
          const style = document.getElementById('paws-puffs-custom-style');
          if (style) {
            style.remove();
            logger.debug('[VisualEditor.bindSwitches] 已清除style标签');
          }
        }
      });
    }

    // 开关2：启用可视化编辑面板
    const panelCheckbox = /** @type {HTMLInputElement} */ (container.querySelector('#paws-puffs-ve-enable-panel'));
    if (panelCheckbox) {
      panelCheckbox.addEventListener('change', async () => {
        extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
        extension_settings['Acsus-Paws-Puffs'].visualEditor = extension_settings['Acsus-Paws-Puffs'].visualEditor || {};
        extension_settings['Acsus-Paws-Puffs'].visualEditor.panelEnabled = panelCheckbox.checked;
        this.panelEnabled = panelCheckbox.checked;
        saveSettingsDebounced();
        logger.info('[VisualEditor.bindSwitches] 可视化编辑面板:', panelCheckbox.checked ? '启用' : '禁用');

        // 显示/隐藏内嵌面板
        if (panelCheckbox.checked) {
          await this.loadEmbeddedPanel();
        } else {
          const panelContainer = document.querySelector('#paws-puffs-ve-embedded-panel');
          if (panelContainer) {
            panelContainer.innerHTML = '';
            logger.debug('[VisualEditor.bindSwitches] 已清空内嵌面板');
          }

          // ✅ 修复Bug：重置模式实例（关键！）
          this.beginnerMode = null;
          this.expertMode = null;
          logger.debug('[VisualEditor.bindSwitches] 已重置模式实例');
        }
      });
    }
  }

  /**
   * 绑定清理按钮
   * 
   * @param {HTMLElement} container - 设置页面容器
   */
  async bindCleanupButtons(container) {
    const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');

    // 按钮1：清理中文CSS
    const clearChineseCssBtn = container.querySelector('#paws-puffs-ve-clear-chinese-css');
    if (clearChineseCssBtn) {
      clearChineseCssBtn.addEventListener('click', async () => {
        logger.debug('[VisualEditor.bindCleanupButtons] 用户点击清理中文CSS');

        const result = await callGenericPopup(
          '<h3 style="margin-top: 0;">确认清理？</h3>' +
          '<p>这会从输入框删除分隔符内的中文CSS（保留分隔符外的原生CSS）</p>' +
          '<p><strong>此操作不可恢复</strong>，确定要继续吗？</p>',
          POPUP_TYPE.CONFIRM,
          '',
          { okButton: '清理', cancelButton: '取消' }
        );

        if (result) {
          // 清理中文CSS
          const input = /** @type {HTMLTextAreaElement} */ (document.querySelector('#customCSS'));
          if (input) {
            const newContent = removeChineseCSSMarkers(input.value);
            input.value = newContent;
            saveSettingsDebounced();

            // 清除style标签
            const style = document.getElementById('paws-puffs-custom-style');
            if (style) style.remove();

            toastr.success('已清理中文CSS');
            logger.info('[VisualEditor.bindCleanupButtons] 中文CSS已清理');
          }
        }
      });
    }

    // 按钮2：清理图标设置
    const clearIconsBtn = container.querySelector('#paws-puffs-ve-clear-icons');
    if (clearIconsBtn) {
      clearIconsBtn.addEventListener('click', async () => {
        logger.debug('[VisualEditor.bindCleanupButtons] 用户点击清理图标设置');

        const result = await callGenericPopup(
          '<h3 style="margin-top: 0;">确认清理？</h3>' +
          '<p>这会删除所有图标替换设置</p>' +
          '<p><strong>此操作不可恢复</strong>，确定要继续吗？</p>',
          POPUP_TYPE.CONFIRM,
          '',
          { okButton: '清理', cancelButton: '取消' }
        );

        if (result) {
          extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
          extension_settings['Acsus-Paws-Puffs'].visualEditor = extension_settings['Acsus-Paws-Puffs'].visualEditor || {};
          extension_settings['Acsus-Paws-Puffs'].visualEditor.icons = {};
          saveSettingsDebounced();
          toastr.success('已清理图标设置');
          logger.info('[VisualEditor.bindCleanupButtons] 图标设置已清理');
        }
      });
    }

    // 按钮3：清理所有扩展数据
    const clearAllBtn = container.querySelector('#paws-puffs-ve-clear-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async () => {
        logger.debug('[VisualEditor.bindCleanupButtons] 用户点击清理所有扩展数据');

        const result = await callGenericPopup(
          '<h3 style="color: #ff4444; margin-top: 0;">⚠️ 警告：危险操作</h3>' +
          '<p>这会删除可视化编辑器的所有数据（中文CSS、图标设置等）！</p>' +
          '<p><strong>此操作不可恢复</strong>，确定要继续吗？</p>',
          POPUP_TYPE.CONFIRM,
          '',
          { okButton: '清理', cancelButton: '取消' }
        );

        if (result) {
          extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
          extension_settings['Acsus-Paws-Puffs'].visualEditor = {};
          saveSettingsDebounced();
          toastr.warning('已清理所有可视化编辑器数据');
          logger.info('[VisualEditor.bindCleanupButtons] 所有数据已清理');

          // 重新加载设置
          this.loadSettings(container);
        }
      });
    }
  }

  /**
   * 加载功能开关状态
   * 
   * @param {HTMLElement} container - 设置页面容器
   */
  loadSettings(container) {
    if (!container) return;

    logger.debug('[VisualEditor.loadSettings] 加载设置');
    const settings = extension_settings['Acsus-Paws-Puffs']?.visualEditor || {};

    // 加载开关1：启用中文CSS编译（默认开启）
    const compilerCheckbox = /** @type {HTMLInputElement} */ (container.querySelector('#paws-puffs-ve-enable-compiler'));
    if (compilerCheckbox) {
      compilerCheckbox.checked = settings.compilerEnabled !== false;
    }

    // 加载开关2：启用可视化编辑面板（默认关闭）
    const panelCheckbox = /** @type {HTMLInputElement} */ (container.querySelector('#paws-puffs-ve-enable-panel'));
    if (panelCheckbox) {
      panelCheckbox.checked = settings.panelEnabled === true;
    }

    logger.debug('[VisualEditor.loadSettings] 编译器:', settings.compilerEnabled !== false, '面板:', settings.panelEnabled === true);
  }

  /**
   * 加载内嵌编辑面板
   * 
   * @description
   * 在官方自定义CSS输入框下方动态插入内嵌面板
   * 
   * 位置：#CustomCSS-block 下方（官方用户设置页面）
   * 
   * @async
   */
  async loadEmbeddedPanel() {
    logger.debug('[VisualEditor.loadEmbeddedPanel] 开始加载内嵌面板');

    // 1. 查找官方自定义CSS输入框
    const customCssInput = document.querySelector('#customCSS');
    const customCssContainer = customCssInput?.parentElement;  // CustomCSS-textAreaBlock
    if (!customCssContainer) {
      logger.warn('[VisualEditor.loadEmbeddedPanel] 未找到自定义CSS输入框容器');
      return;
    }

    // 2. 查找或创建内嵌面板容器
    let panelContainer = /** @type {HTMLElement} */ (document.querySelector('#paws-puffs-ve-embedded-panel'));

    if (!panelContainer) {
      // 创建容器
      panelContainer = document.createElement('div');
      panelContainer.id = 'paws-puffs-ve-embedded-panel';
      panelContainer.style.marginTop = '10px';

      // 插入到自定义CSS输入框的父容器后面
      customCssContainer.parentNode.insertBefore(
        panelContainer,
        customCssContainer.nextSibling
      );

      logger.debug('[VisualEditor.loadEmbeddedPanel] 已创建内嵌面板容器');
    }

    // 3. 加载 embedded-panel.html
    try {
      const response = await fetch('scripts/extensions/third-party/Acsus-Paws-Puffs/visual-editor/embedded-panel.html');
      const html = await response.text();
      panelContainer.innerHTML = html;
      logger.debug('[VisualEditor.loadEmbeddedPanel] 已加载HTML模板');

      // ✅ 修复Bug：重置模式实例（因为容器已重新创建）
      this.beginnerMode = null;
      this.expertMode = null;
      logger.debug('[VisualEditor.loadEmbeddedPanel] 已重置模式实例');
    } catch (error) {
      logger.error('[VisualEditor.loadEmbeddedPanel] 加载HTML失败:', error);
      return;
    }

    // 4. 绑定标签页切换（元素编辑、快速模板、图标组）
    this.bindTabSwitching(panelContainer);

    // 5. 绑定功能按钮（同步、重置）
    this.bindActionButtons(panelContainer);

    // 6. 初始化元素编辑标签页（包含模式切换）
    await this.initElementsTab(panelContainer);

    logger.debug('[VisualEditor.loadEmbeddedPanel] 内嵌面板加载完成');
  }

  /**
   * 绑定标签页切换（元素编辑、快速模板、图标组）
   * 
   * @param {HTMLElement} panelContainer - 内嵌面板容器
   */
  bindTabSwitching(panelContainer) {
    const tabButtons = panelContainer.querySelectorAll('.paws-puffs-ve-tab-btn');
    const tabPanels = panelContainer.querySelectorAll('.paws-puffs-ve-tab-panel');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const htmlBtn = /** @type {HTMLElement} */ (button);
        const targetTab = htmlBtn.dataset.tab;
        logger.debug('[VisualEditor.bindTabSwitching] 切换标签页:', targetTab);

        // 切换按钮状态
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // 切换面板显示
        tabPanels.forEach(panel => {
          const htmlPanel = /** @type {HTMLElement} */ (panel);
          if (htmlPanel.dataset.panel === targetTab) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });
  }

  /**
   * 初始化元素编辑标签页（包含模式切换）
   * 
   * @param {HTMLElement} panelContainer - 内嵌面板容器
   * @async
   */
  async initElementsTab(panelContainer) {
    // 查找元素编辑标签页
    const elementsPanel = panelContainer.querySelector('[data-panel="elements"]');
    if (!elementsPanel) {
      logger.warn('[VisualEditor.initElementsTab] 未找到元素编辑标签页');
      return;
    }

    // 绑定模式切换开关
    const modeToggle = /** @type {HTMLInputElement} */ (elementsPanel.querySelector('#paws-puffs-ve-mode-toggle'));
    const modeLabel = elementsPanel.querySelector('#paws-puffs-ve-mode-label');

    if (modeToggle) {
      modeToggle.addEventListener('change', async () => {
        const mode = modeToggle.checked ? 'expert' : 'beginner';
        await this.switchMode(mode);

        // 更新标签文字
        if (modeLabel) {
          modeLabel.textContent = mode === 'beginner' ? '新手模式' : '专家模式';
        }

        logger.debug('[VisualEditor.initElementsTab] 模式切换:', mode);
      });
    }

    // 初始化新手模式
    await this.switchMode(this.currentMode);
  }

  /**
   * 切换模式
   * 
   * @param {string} mode - 'beginner' 或 'expert'
   * @async
   */
  async switchMode(mode) {
    this.currentMode = mode;
    logger.debug('[VisualEditor.switchMode] 切换到模式:', mode);

    if (mode === 'beginner') {
      // 显示新手模式容器
      const container = /** @type {HTMLElement} */ (document.querySelector('.beginner-mode-container'));
      if (container) {
        container.style.display = 'block';
      }
      const expertContainer = /** @type {HTMLElement} */ (document.querySelector('.expert-mode-container'));
      if (expertContainer) {
        expertContainer.style.display = 'none';
      }

      // 初始化新手模式
      if (!this.beginnerMode) {
        this.beginnerMode = new BeginnerMode();
        await this.beginnerMode.init(
          container,
          () => this.compileAndApply(),
          this.syncState
        );
        logger.info('[VisualEditor.switchMode] 新手模式已初始化');
      }
    } else {
      // 显示专家模式容器
      const container = /** @type {HTMLElement} */ (document.querySelector('.expert-mode-container'));
      if (container) {
        container.style.display = 'block';
      }
      const beginnerContainer = /** @type {HTMLElement} */ (document.querySelector('.beginner-mode-container'));
      if (beginnerContainer) {
        beginnerContainer.style.display = 'none';
      }

      // 初始化专家模式（P1阶段）
      logger.warn('[VisualEditor.switchMode] 专家模式尚未实现');
      // if (!this.expertMode) {
      //   this.expertMode = new ExpertMode();
      //   await this.expertMode.init(...);
      // }
    }
  }

  /**
   * 绑定功能按钮（同步、重置）
   * 
   * @param {HTMLElement} panelContainer - 内嵌面板容器
   */
  bindActionButtons(panelContainer) {
    const syncBtn = panelContainer.querySelector('#paws-puffs-ve-sync-btn');
    const resetBtn = panelContainer.querySelector('#paws-puffs-ve-reset-btn');

    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        logger.debug('[VisualEditor.bindActionButtons] 用户点击同步按钮');
        // 调用当前模式的同步方法
        if (this.currentMode === 'beginner' && this.beginnerMode) {
          this.beginnerMode.syncFromInput();
        } else if (this.currentMode === 'expert' && this.expertMode) {
          // this.expertMode.syncFromInput();
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        logger.debug('[VisualEditor.bindActionButtons] 用户点击重置按钮');
        // 调用当前模式的重置方法
        if (this.currentMode === 'beginner' && this.beginnerMode) {
          this.beginnerMode.resetPanel();
        } else if (this.currentMode === 'expert' && this.expertMode) {
          // this.expertMode.resetPanel();
        }
      });
    }

    logger.debug('[VisualEditor.bindActionButtons] 功能按钮事件已绑定');
  }
}
