/**
 * @file 可视化编辑器 - 主控文件
 * @description
 * 总指挥，协调所有可视化编辑器模块。
 * 
 * 核心职责：
 * - 管理独立弹窗（打开/关闭/拖动）
 * - 控件路线：接收 BeginnerMode 的CSS字符串 → 注入 paws-puffs-controls-style
 * - 输入框路线：监听插件CSS输入框 → 编译 → 注入 paws-puffs-input-style
 * - 中文CSS编译器功能（#customCSS分隔符，可选功能）
 * 
 * 架构（2026-02-24 重构后）：
 * - 控件 CSS → <style id="paws-puffs-controls-style">（中优先级）
 * - 插件输入框 CSS → <style id="paws-puffs-input-style">（高优先级）
 * - 两条路线完全独立，互不干扰
 * - 旧的 #customCSS 分隔符编译器作为独立功能继续保留
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
import { buildCSSFromControlsData } from './modes/beginner/beginner-mode.js';
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

// [IMPORT] 导入可视化编辑器存储模块
import {
  getActiveScheme,
  saveControlsData,
  savePluginCSS,
  createScheme,
  deleteScheme,
  renameScheme,
  switchScheme,
  getSchemeList
} from './visual-editor-storage.js';

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
    this.compilerEnabled = false;
    this.panelEnabled = false;

    // 当前模式
    this.currentMode = 'beginner';  // 'beginner' | 'expert'

    // 模式实例
    this.beginnerMode = null;
    this.expertMode = null;

    // 弹窗状态
    this.dialogOpen = false;

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
    this.compilerEnabled = settings.compilerEnabled === true; // 默认关闭
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

    // 从存储恢复CSS效果（页面加载时立即注入，不等用户打开弹窗）
    try {
      const scheme = await getActiveScheme();

      if (Object.keys(scheme.controlsData || {}).length > 0) {
        const css = buildCSSFromControlsData(scheme.controlsData);
        this.applyControlsCSS(css);
        logger.info('[VisualEditor.init] 已从存储恢复控件CSS');
      }

      if (scheme.pluginInputCSS?.trim()) {
        this.applyInputCSS(scheme.pluginInputCSS);
        logger.info('[VisualEditor.init] 已从存储恢复输入框CSS');
      }
    } catch (err) {
      logger.warn('[VisualEditor.init] 恢复存储CSS失败:', err.message);
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
   * 4. 初始化独立弹窗DOM（不显示）
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

    // 4. 初始化独立弹窗DOM（不显示，只加载到页面）
    await this.initDialog();

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

        // 开关控制导航栏按钮的显示/隐藏
        // 实际的弹窗打开由导航栏按钮触发
        logger.debug('[VisualEditor.bindSwitches] 面板开关已切换，导航栏按钮会相应显示/隐藏');
      });
    }

    // 打开可视化编辑器弹窗按钮
    const openDialogBtn = container.querySelector('#paws-puffs-ve-open-dialog');
    if (openDialogBtn) {
      openDialogBtn.addEventListener('click', async () => {
        logger.debug('[VisualEditor.bindSwitches] 用户点击打开可视化编辑器');
        await this.openDialog();
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
  }

  /**
   * 初始化独立弹窗DOM
   * 
   * @description
   * 将弹窗HTML加载到页面并绑定CSS，但不显示
   * 1. 加载弹窗HTML到 body
   * 2. 加载弹窗CSS
   * 3. 绑定关闭按钮事件
   * 
   * @async
   */
  async initDialog() {
    logger.debug('[VisualEditor.initDialog] 开始初始化弹窗DOM');

    // 检查是否已经加载
    if (document.querySelector('#paws-puffs-ve-dialog-overlay')) {
      logger.debug('[VisualEditor.initDialog] 弹窗DOM已存在');
      return;
    }

    // 1. 加载弹窗HTML
    try {
      const response = await fetch('scripts/extensions/third-party/Acsus-Paws-Puffs/visual-editor/visual-editor-dialog.html');
      const html = await response.text();
      
      // 插入到 body 末尾
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container.firstElementChild);
      
      logger.debug('[VisualEditor.initDialog] 弹窗HTML已加载');
    } catch (error) {
      logger.error('[VisualEditor.initDialog] 加载弹窗HTML失败:', error);
      return;
    }

    // 2. 加载弹窗CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'scripts/extensions/third-party/Acsus-Paws-Puffs/visual-editor/visual-editor-dialog.css';
    document.head.appendChild(cssLink);
    logger.debug('[VisualEditor.initDialog] 弹窗CSS已加载');

    // 3. 绑定关闭按钮
    const closeBtn = document.querySelector('#paws-puffs-ve-dialog-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDialog());
    }

    // 4. 绑定标题栏拖动功能
    this.initDialogDrag();

    logger.debug('[VisualEditor.initDialog] 弹窗DOM初始化完成');
  }

  /**
   * 初始化弹窗拖动功能
   * 
   * @description
   * 绑定标题栏拖动事件，支持拖动弹窗并限制在屏幕边界内
   * 1. 标题栏 mousedown - 记录初始位置
   * 2. document mousemove - 移动弹窗
   * 3. document mouseup - 结束拖动
   * 4. 边界检测 - 防止超出屏幕（考虑dvh单位）
   */
  initDialogDrag() {
    const header = document.querySelector('.paws-puffs-ve-dialog-header');
    const dialogContainer = /** @type {HTMLElement} */ (document.querySelector('.paws-puffs-ve-dialog-container'));
    
    if (!header || !dialogContainer) {
      logger.warn('[VisualEditor.initDialogDrag] 未找到标题栏或弹窗容器');
      return;
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    // 鼠标按下 - 开始拖动
    header.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => {
      // 点击关闭按钮不触发拖动
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('.paws-puffs-ve-dialog-close-btn')) {
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // 获取当前位置（拖动前的实际位置）
      const rect = dialogContainer.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // 第一次拖动时，切换为absolute定位并保持当前位置
      if (!dialogContainer.style.position || dialogContainer.style.position !== 'absolute') {
        dialogContainer.style.position = 'absolute';
        dialogContainer.style.left = `${initialLeft}px`;
        dialogContainer.style.top = `${initialTop}px`;
        logger.debug('[VisualEditor.initDialogDrag] 切换为absolute定位');
      } else {
        // 如果已经是absolute，直接读取当前位置
        initialLeft = parseFloat(dialogContainer.style.left);
        initialTop = parseFloat(dialogContainer.style.top);
      }

      logger.debug('[VisualEditor.initDialogDrag] 开始拖动');
    });

    // 鼠标移动 - 移动弹窗
    document.addEventListener('mousemove', (/** @type {MouseEvent} */ e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      // 边界检测
      const rect = dialogContainer.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // 左边界
      if (newLeft < 0) {
        newLeft = 0;
      }
      // 右边界（确保弹窗右边缘不超出屏幕）
      if (newLeft + rect.width > viewportWidth) {
        newLeft = viewportWidth - rect.width;
      }
      // 上边界
      if (newTop < 0) {
        newTop = 0;
      }
      // 下边界（确保弹窗下边缘不超出屏幕）
      if (newTop + rect.height > viewportHeight) {
        newTop = viewportHeight - rect.height;
      }

      // 应用新位置
      dialogContainer.style.left = `${newLeft}px`;
      dialogContainer.style.top = `${newTop}px`;
    });

    // 鼠标释放 - 结束拖动
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        logger.debug('[VisualEditor.initDialogDrag] 结束拖动');
      }
    });
  }

  /**
   * 打开独立弹窗
   * 
   * @description
   * 显示弹窗并初始化内部UI：
   * 1. 显示弹窗
   * 2. 绑定标签页切换
   * 3. 绑定功能按钮
   * 4. 初始化元素编辑标签页
   * 5. 同步插件CSS输入框
   * 
   * @async
   */
  async openDialog() {
    if (this.dialogOpen) {
      logger.debug('[VisualEditor.openDialog] 弹窗已打开');
      return;
    }

    logger.debug('[VisualEditor.openDialog] 打开弹窗');

    const overlay = document.querySelector('#paws-puffs-ve-dialog-overlay');
    if (!overlay) {
      logger.error('[VisualEditor.openDialog] 未找到弹窗DOM');
      return;
    }

    // 显示弹窗
    /** @type {HTMLElement} */ (overlay).style.display = 'flex';
    this.dialogOpen = true;

    // 重置模式实例（每次打开弹窗都重新初始化）
    this.beginnerMode = null;
    this.expertMode = null;

    // 绑定标签页切换
    this.bindTabSwitching(overlay);

    // 绑定功能按钮
    this.bindActionButtons(overlay);

    // 初始化方案管理栏
    await this.initSchemeBar(overlay);

    // 初始化元素编辑标签页
    await this.initElementsTab(overlay);

    // 同步插件CSS输入框（从当前方案加载）
    await this.syncPluginCSSInput();

    // 设置插件CSS输入框的实时监听（新架构）
    this.setupPluginInputSync();

    logger.info('[VisualEditor.openDialog] 弹窗已打开');
  }

  /**
   * 初始化方案管理栏
   *
   * @description
   * 填充方案下拉列表，并绑定新建/重命名/删除/切换事件。
   * 每次打开弹窗时调用（openDialog内调用，重复调用安全）。
   *
   * @async
   * @param {HTMLElement} overlay - 弹窗遮罩层元素
   */
  async initSchemeBar(overlay) {
    const selectEl = overlay.querySelector('#paws-puffs-ve-scheme-select');
    const newBtn = overlay.querySelector('#paws-puffs-ve-scheme-new-btn');
    const renameBtn = overlay.querySelector('#paws-puffs-ve-scheme-rename-btn');
    const deleteBtn = overlay.querySelector('#paws-puffs-ve-scheme-delete-btn');

    if (!selectEl || !newBtn || !renameBtn || !deleteBtn) {
      logger.warn('[VisualEditor.initSchemeBar] 方案管理栏元素未找到');
      return;
    }

    if (overlay.dataset.schemeBarBound === 'true') {
      this._renderSchemeOptions(/** @type {HTMLSelectElement} */ (selectEl));
      return;
    }
    overlay.dataset.schemeBarBound = 'true';

    await getActiveScheme();
    this._renderSchemeOptions(/** @type {HTMLSelectElement} */ (selectEl));

    selectEl.addEventListener('change', async () => {
      await this._applyScheme(/** @type {HTMLSelectElement} */ (selectEl).value);
      logger.info('[VisualEditor.initSchemeBar] 切换方案:', /** @type {HTMLSelectElement} */ (selectEl).value);
    });

    newBtn.addEventListener('click', async () => {
      const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');
      const name = await callGenericPopup('请输入新方案名称：', POPUP_TYPE.INPUT, '新方案');
      if (!name) return;
      await createScheme(name);
      this._renderSchemeOptions(/** @type {HTMLSelectElement} */ (selectEl));
      await this._applyScheme(getSchemeList().find(s => s.isActive)?.id);
      logger.info('[VisualEditor.initSchemeBar] 新建方案完成:', name);
    });

    renameBtn.addEventListener('click', async () => {
      const activeScheme = await getActiveScheme();
      const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');
      const name = await callGenericPopup('请输入新名称：', POPUP_TYPE.INPUT, activeScheme.name);
      if (!name) return;
      await renameScheme(activeScheme.id, name);
      this._renderSchemeOptions(/** @type {HTMLSelectElement} */ (selectEl));
      logger.info('[VisualEditor.initSchemeBar] 重命名完成:', name);
    });

    deleteBtn.addEventListener('click', async () => {
      const activeScheme = await getActiveScheme();
      if (activeScheme.id === 'default') {
        toastr.warning('默认方案不可删除');
        return;
      }
      if (getSchemeList().length <= 1) {
        toastr.warning('至少保留一个方案');
        return;
      }
      const { callGenericPopup, POPUP_TYPE } = await import('../../../../popup.js');
      const confirmed = await callGenericPopup(
        `确定删除方案「${activeScheme.name}」吗？此操作不可恢复。`,
        POPUP_TYPE.CONFIRM
      );
      if (!confirmed) return;
      await deleteScheme(activeScheme.id);
      this._renderSchemeOptions(/** @type {HTMLSelectElement} */ (selectEl));
      const newActive = getSchemeList().find(s => s.isActive);
      if (newActive) await this._applyScheme(newActive.id);
      logger.info('[VisualEditor.initSchemeBar] 删除方案完成');
    });

    logger.info('[VisualEditor.initSchemeBar] 方案管理栏初始化完成');
  }

  /**
   * 渲染方案下拉列表
   *
   * @description
   * 清空并重新填充 <select> 的 <option>，同步高亮当前激活方案。
   * 下划线前缀表示供内部调用的辅助方法。
   *
   * @param {HTMLSelectElement} selectEl - 方案选择下拉框元素
   */
  _renderSchemeOptions(selectEl) {
    const schemes = getSchemeList();
    selectEl.innerHTML = '';
    for (const scheme of schemes) {
      const option = document.createElement('option');
      option.value = scheme.id;
      option.textContent = scheme.name;
      option.selected = scheme.isActive;
      selectEl.appendChild(option);
    }
    logger.debug('[VisualEditor._renderSchemeOptions] 渲染方案列表，共', schemes.length, '个');
  }

  /**
   * 切换到指定方案并重新注入CSS
   *
   * @description
   * 完整的方案切换流程：
   * 1. 调用 switchScheme 更新存储，获取目标方案的快照
   * 2. 重新注入控件CSS和输入框CSS
   * 3. 更新输入框的文字内容
   * 4. 直接用已获取的 scheme 数据重新初始化 BeginnerMode，
   *    不再通过 switchMode → getActiveScheme() 二次读缓存，
   *    避免快速连续切换时读到错误方案导致数据跨方案污染
   *
   * @async
   * @param {string} id - 目标方案ID
   */
  async _applyScheme(id) {
    if (!id) return;

    // switchScheme 返回的 scheme 是此次切换目标的数据快照，直接使用而非再读缓存
    const scheme = await switchScheme(id);
    if (!scheme) return;

    // 重新注入控件CSS（新方案可能为空，空字符串会清空 style 标签）
    const css = buildCSSFromControlsData(scheme.controlsData || {});
    this.applyControlsCSS(css);

    // 更新插件输入框
    const pluginInput = document.querySelector('#paws-puffs-ve-dialog-css-input');
    if (pluginInput) {
      /** @type {HTMLTextAreaElement} */ (pluginInput).value = scheme.pluginInputCSS || '';
    }
    this.applyInputCSS(scheme.pluginInputCSS || '');

    // 重置模式实例，直接用已获取的 scheme 数据初始化
    // 深拷贝：断开 BeginnerMode.controlsData 与存储对象的共享引用，防止跨方案污染
    this.beginnerMode = null;
    this.expertMode = null;

    if (this.currentMode === 'beginner') {
      const container = /** @type {HTMLElement} */ (document.querySelector('.beginner-mode-container'));
      if (container) {
        this.beginnerMode = new BeginnerMode();
        await this.beginnerMode.init(
          container,
          (cssString) => this.applyControlsCSS(cssString),
          (data) => saveControlsData(data),
          this.syncState,
          JSON.parse(JSON.stringify(scheme.controlsData || {}))
        );
        logger.info('[VisualEditor._applyScheme] 新手模式已用新方案数据重新初始化');
      }
    }

    logger.info('[VisualEditor._applyScheme] 方案切换完成:', id);
  }

  /**
   * 关闭独立弹窗
   * 
   * @description
   * 隐藏弹窗
   */
  closeDialog() {
    logger.debug('[VisualEditor.closeDialog] 关闭弹窗');

    const overlay = document.querySelector('#paws-puffs-ve-dialog-overlay');
    if (overlay) {
      /** @type {HTMLElement} */ (overlay).style.display = 'none';
    }

    this.dialogOpen = false;
    logger.info('[VisualEditor.closeDialog] 弹窗已关闭');
  }

  /**
   * 同步插件CSS输入框（新架构）
   *
   * @description
   * 新架构下，插件输入框与 #customCSS 完全分离。
   * 当前阶段：打开弹窗时输入框保持现有内容（不清空）。
   * 未来：改为从文件存储读取当前方案的 pluginInputCSS 字段。
   *
   * @async
   */
  async syncPluginCSSInput() {
    const pluginInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#paws-puffs-ve-dialog-css-input'));
    if (!pluginInput) {
      logger.warn('[VisualEditor.syncPluginCSSInput] 未找到插件CSS输入框');
      return;
    }

    // 从文件存储读取当前方案的 pluginInputCSS
    const scheme = await getActiveScheme();
    const savedCSS = scheme.pluginInputCSS || '';

    if (savedCSS.trim()) {
      pluginInput.value = savedCSS;
      this.applyInputCSS(savedCSS);
      logger.debug('[VisualEditor.syncPluginCSSInput] 已从存储恢复输入框内容');
    } else {
      logger.debug('[VisualEditor.syncPluginCSSInput] 存储中无输入框内容，保持空白');
    }
  }

  /**
   * 绑定标签页切换（元素编辑、快速模板、图标组）
   * 
   * @param {HTMLElement} container - 弹窗容器
   */
  bindTabSwitching(container) {
    const tabButtons = container.querySelectorAll('.paws-puffs-ve-dialog-tab-btn');
    const tabPanels = container.querySelectorAll('.paws-puffs-ve-dialog-tab-panel');

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
   * @param {HTMLElement} container - 弹窗容器
   * @async
   */
  async initElementsTab(container) {
    // 查找元素编辑标签页
    const elementsPanel = container.querySelector('[data-panel="elements"]');
    if (!elementsPanel) {
      logger.warn('[VisualEditor.initElementsTab] 未找到元素编辑标签页');
      return;
    }

    // 绑定模式切换开关
    const modeToggle = /** @type {HTMLInputElement} */ (elementsPanel.querySelector('#paws-puffs-ve-dialog-mode-toggle'));
    const modeLabel = elementsPanel.querySelector('#paws-puffs-ve-dialog-mode-label');

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
        // 从存储加载初始数据
        const scheme = await getActiveScheme();
        await this.beginnerMode.init(
          container,
          // 新架构：回调接收英文CSS字符串，直接注入独立style标签
          (cssString) => this.applyControlsCSS(cssString),
          (data) => saveControlsData(data),
          this.syncState,
          scheme.controlsData || {}
        );
        logger.info('[VisualEditor.switchMode] 新手模式已初始化（含存储数据）');
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
   * @param {HTMLElement} container - 弹窗容器
   */
  bindActionButtons(container) {
    const syncBtn = container.querySelector('#paws-puffs-ve-dialog-sync-btn');
    const resetBtn = container.querySelector('#paws-puffs-ve-dialog-reset-btn');

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

  // =========================================================
  // [NEW] 2026-02-24 新架构：两条独立的CSS注入管道
  // =========================================================

  /**
   * 注入控件生成的CSS（控件路线）
   *
   * @description
   * 接收 BeginnerMode.buildControlsCSS() 生成的英文CSS字符串，
   * 注入到独立的 <style id="paws-puffs-controls-style"> 标签。
   * 优先级：低于插件输入框CSS，高于ST官方CSS。
   *
   * @param {string} cssString - 完整的英文CSS字符串
   */
  applyControlsCSS(cssString) {
    logger.debug('[VisualEditor.applyControlsCSS] 注入控件CSS，长度:', cssString?.length ?? 0);

    let style = document.getElementById('paws-puffs-controls-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'paws-puffs-controls-style';
      document.head.appendChild(style);
      logger.debug('[VisualEditor.applyControlsCSS] 创建新style标签');
    }

    style.textContent = cssString || '';
    logger.info('[VisualEditor.applyControlsCSS] ✅ 控件CSS已注入');
  }

  /**
   * 编译并注入插件输入框的CSS（输入框路线）
   *
   * @description
   * 接收用户在弹窗输入框中写的CSS（中文或英文均可）：
   * 1. 调用编译器将中文CSS翻译为英文CSS
   * 2. 注入到独立的 <style id="paws-puffs-input-style"> 标签
   * 优先级：最高（覆盖控件CSS和ST官方CSS）。
   *
   * @param {string} content - 用户输入的CSS内容（可含中文CSS）
   */
  applyInputCSS(content) {
    logger.debug('[VisualEditor.applyInputCSS] 处理输入框CSS，长度:', content?.length ?? 0);

    let style = document.getElementById('paws-puffs-input-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'paws-puffs-input-style';
      document.head.appendChild(style);
      logger.debug('[VisualEditor.applyInputCSS] 创建新style标签');
    }

    if (!content || !content.trim()) {
      style.textContent = '';
      logger.debug('[VisualEditor.applyInputCSS] 内容为空，已清空style标签');
      return;
    }

    // 编译器负责处理中英文混写（纯英文CSS也能通过）
    const englishCSS = compileToEnglishCSS(content);
    style.textContent = englishCSS || '';
    logger.info('[VisualEditor.applyInputCSS] ✅ 输入框CSS已编译注入');
  }

  /**
   * 设置插件CSS输入框的实时监听（输入框路线）
   *
   * @description
   * 监听弹窗内 #paws-puffs-ve-dialog-css-input 的输入事件。
   * 防抖300ms后调用 applyInputCSS() 编译注入。
   * 每次打开弹窗时调用，重复调用安全（检查已绑定标记）。
   */
  setupPluginInputSync() {
    const pluginInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#paws-puffs-ve-dialog-css-input'));
    if (!pluginInput) {
      logger.warn('[VisualEditor.setupPluginInputSync] 未找到插件CSS输入框');
      return;
    }

    // 防止重复绑定（每次打开弹窗都会调用此方法）
    if (pluginInput.dataset.syncBound === 'true') {
      logger.debug('[VisualEditor.setupPluginInputSync] 监听已存在，跳过重复绑定');
      return;
    }

    let debounceTimer = null;

    pluginInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        logger.debug('[VisualEditor.setupPluginInputSync] 输入框内容变化，触发编译并保存');
        this.applyInputCSS(pluginInput.value);
        savePluginCSS(pluginInput.value);
      }, 300);
    });

    pluginInput.dataset.syncBound = 'true';
    logger.debug('[VisualEditor.setupPluginInputSync] ✅ 插件CSS输入框监听已设置');
  }
}
