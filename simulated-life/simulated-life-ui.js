/**
 * 模拟人生 UI 模块 - 界面渲染和交互
 * 
 * 职责：
 * - 渲染工具包标签页内的"模拟人生"子标签页
 * - 处理按钮点击事件
 * - 显示世界书状态
 */

import logger from '../logger.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';

export class SimulatedLifeUI {
  /**
   * @param {import('./simulated-life.js').SimulatedLifeModule} module - 主模块实例
   */
  constructor(module) {
    this.module = module;

    // DOM 容器（将渲染到模拟人生主标签页）
    this.container = null;
  }

  /**
   * 渲染 UI
   */
  render() {
    logger.debug('[SimulatedLifeUI] 开始渲染 UI');

    // 找到模拟人生标签页容器
    const container = $('#paws-puffs-simulated-life-panel');
    if (!container.length) {
      logger.error('[SimulatedLifeUI] 找不到模拟人生标签页容器');
      return;
    }

    // 渲染内容到容器
    const contentHtml = `
            <div class="simulated-life-panel">
                ${this._renderMainContent()}
            </div>
        `;

    container.html(contentHtml);

    // 绑定事件
    this._bindEvents();

    // 更新状态显示
    this._updateStatus();

    // 渲染条目列表（如果世界书已存在）
    this._renderEntries();

    logger.debug('[SimulatedLifeUI] UI 渲染完成');
  }

  /**
   * 渲染主内容区域
   * @private
   * @returns {string} HTML 字符串
   */
  _renderMainContent() {
    return `
            <!-- 全局世界书开关 + 使用说明按钮 -->
            <div class="visual-editor-enable-section-compact" style="display: flex; align-items: center; justify-content: space-between;">
              <label class="checkbox_label">
                <input type="checkbox" id="simulated-life-global-enable" ${this.module.isInGlobalList() ? 'checked' : ''}>
                <span>启用全局世界书</span>
                <span class="hint-inline">开启后在所有对话中生效</span>
              </label>
              <button id="simulated-life-help-btn" class="menu_button compact icon-only interactable" title="查看使用说明" tabindex="0" role="button">
                <i class="fa fa-question-circle"></i>
              </button>
            </div>

            <!-- 手风琴（介绍和查看提示词） -->
            <div class="paws-puffs-settings-accordion-container">
              <!-- 卡片1：功能介绍 -->
              <div class="paws-puffs-settings-accordion-card active" data-card="intro">
                <div class="paws-puffs-settings-accordion-header" data-card="intro">
                  <div class="paws-puffs-settings-accordion-tab">
                    <i class="fa-solid fa-circle-info"></i>
                    <strong>功能介绍</strong>
                  </div>
                </div>
                <div class="paws-puffs-settings-accordion-body">
                  <h4 style="margin-top: 0; color: var(--SmartThemeQuoteColor);">模拟人生 - 溯的提示词</h4>
                  <p style="font-size: 0.9em; opacity: 0.8; margin-bottom: 12px;">
                    原作者：溯（Sus）<br>
                    最早发布时间：2025-5-13
                  </p>
                  
                  <p style="margin-bottom: 12px;">
                    让AI在对话中生成内联HTML效果，模拟各种物品（便签、票据、手机界面等），增强阅读体验。
                  </p>

                  <h4 style="color: var(--SmartThemeQuoteColor);">特点</h4>
                  <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.6;">
                    <li>沉浸式阅读：可视化物品让对话更生动有趣</li>
                    <li>轻量高效：提示词简洁，不过度占用token</li>
                    <li>生成克制：内联片段精简，不需要刻意删除</li>
                    <li>完全自包含：不依赖外部资源，兼容性好</li>
                    <li>移动端友好：手机端版本针对小屏幕优化</li>
                    <li>自然融入：不强制角色产生物品，顺应剧情</li>
                  </ul>

                  <h4 style="color: var(--SmartThemeQuoteColor);">版本说明</h4>
                  <ul style="margin: 8px 0; padding-left: 20px; line-height: 1.6;">
                    <li>通用版（溯 Sus）：桌面端和移动端通用，经过版本迭代优化</li>
                    <li>手机端优化版（白沉）：基于溯的二改，针对手机屏幕调整</li>
                  </ul>
                </div>
              </div>

              <!-- 卡片2：查看提示词 -->
              <div class="paws-puffs-settings-accordion-card" data-card="view-prompts">
                <div class="paws-puffs-settings-accordion-header" data-card="view-prompts">
                  <div class="paws-puffs-settings-accordion-tab">
                    <i class="fa-solid fa-eye"></i>
                    <strong>查看提示词</strong>
                  </div>
                </div>
                <div class="paws-puffs-settings-accordion-body">
                  <p style="margin-top: 0;">点击按钮查看完整提示词内容：</p>
                  
                  <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="view-sus-prompt-btn" class="menu_button compact" style="flex: 1; white-space: nowrap;">
                      <i class="fa-solid fa-code"></i>
                      查看溯 Sus 版本
                    </button>
                    <button id="view-mobile-prompt-btn" class="menu_button compact" style="flex: 1; white-space: nowrap;">
                      <i class="fa-solid fa-mobile-screen"></i>
                      查看白沉优化版
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 操作按钮区域（两列） -->
            <div class="simulated-life-actions" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 12px;">
                <button id="simulated-life-create-btn" class="menu_button interactable" style="white-space: nowrap; font-size: 0.85em;" tabindex="0" role="button">
                    <i class="fa-solid fa-plus"></i>
                    懒人一键试吃
                </button>
                
                <button id="simulated-life-refresh-btn" class="menu_button compact interactable" style="white-space: nowrap; font-size: 0.85em;" tabindex="0" role="button">
                    <i class="fa-solid fa-rotate"></i>
                    刷新条目状态
                </button>
            </div>

            <!-- 条目状态显示区域 -->
            <div id="simulated-life-entries-container" style="margin-bottom: 12px;">
                <!-- 条目列表会动态渲染到这里 -->
            </div>

            <!-- 世界书状态 -->
            <div class="simulated-life-status" style="padding: 10px; background: color-mix(in srgb, var(--SmartThemeBodyColor) 3%, var(--SmartThemeBlurTintColor) 97%); border-radius: 6px; font-size: 0.85em;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-circle-info" style="color: var(--SmartThemeQuoteColor);"></i>
                    <span id="simulated-life-status-text">正在检测...</span>
                </div>
            </div>
        `;
  }

  /**
   * 渲染条目列表
   * @private
   * @async
   */
  async _renderEntries() {
    const container = $('#simulated-life-entries-container');
    if (!container.length) return;

    // 获取条目
    const entries = await this.module.getEntries();

    if (entries.length === 0) {
      container.html('');
      return;
    }

    // 检查是否两个都开启了
    const enabledCount = entries.filter(e => !e.disable).length;
    const showWarning = (enabledCount > 1);

    // 渲染条目列表
    let html = `
      <div style="padding: 10px; background: color-mix(in srgb, var(--SmartThemeBodyColor) 3%, var(--SmartThemeBlurTintColor) 97%); border-radius: 6px;">
        <div style="margin-bottom: 8px; font-size: 0.85em; color: var(--SmartThemeQuoteColor);">
          <strong>当前条目：</strong>
        </div>
    `;

    // 重复开启提醒
    if (showWarning) {
      html += `
        <div style="margin-bottom: 8px; padding: 6px 8px; background: rgba(243, 156, 18, 0.1); border-left: 3px solid #f39c12; border-radius: 4px; font-size: 0.8em; line-height: 1.4;">
          <span style="color: #f39c12;">提示：两个版本功能重复，建议只开启一个（选择通用版或手机端优化版）</span>
        </div>
      `;
    }

    // 两列布局显示条目（手机端自动变单列）
    html += `
      <div class="simulated-life-entries-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
      <style>
        @media (max-width: 600px) {
          .simulated-life-entries-grid {
            grid-template-columns: 1fr !important;
          }
        }
      </style>
    `;

    entries.forEach(entry => {
      const isEnabled = !entry.disable;
      const statusColor = isEnabled ? '#2ecc71' : '#888';
      const statusText = isEnabled ? '已开启' : '已禁用';

      // 缩短显示名称（只在UI显示，不改变世界书条目名称）
      let displayName = entry.comment;
      if (displayName.includes('内联代码模拟多模态')) {
        displayName = '通用版 - 溯';
      } else if (displayName.includes('叙事增强式内联HTML')) {
        displayName = '手机端 - 白沉';
      }

      html += `
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(0, 0, 0, 0.1); border-radius: 4px;">
          <label class="checkbox_label" style="flex: 1; margin: 0; display: flex; align-items: center; min-width: 0;">
            <input type="checkbox" class="entry-toggle" data-uid="${entry.uid}" ${isEnabled ? 'checked' : ''}>
            <span style="font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</span>
          </label>
          <span style="font-size: 0.75em; color: ${statusColor}; white-space: nowrap; flex-shrink: 0;">${statusText}</span>
        </div>
      `;
    });

    html += `</div></div>`;
    container.html(html);

    // 绑定切换事件
    $('.entry-toggle').off('change').on('change', async (e) => {
      const uid = parseInt($(e.target).data('uid'));
      const enable = $(e.target).is(':checked');

      logger.debug('[SimulatedLifeUI] 切换条目状态:', uid, enable ? '开启' : '禁用');

      const success = await this.module.toggleEntry(uid, enable);
      if (success) {
        // 重新渲染条目列表
        await this._renderEntries();
      } else {
        // 失败时恢复原状态
        $(e.target).prop('checked', !enable);
      }
    });
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 绑定手风琴切换事件
    this._bindAccordion();

    // 绑定全局世界书开关
    this._bindGlobalToggle();

    // 创建世界书按钮
    $(document).off('click', '#simulated-life-create-btn');
    $(document).on('click', '#simulated-life-create-btn', async () => {
      logger.debug('[SimulatedLifeUI] 点击创建世界书按钮');

      const btn = $('#simulated-life-create-btn');
      const originalText = btn.html();

      // 禁用按钮并显示加载状态
      btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> 创建中...');

      try {
        const success = await this.module.createWorldBookWithEntries();

        if (success) {
          // 更新状态显示
          this._updateStatus();
          // 渲染条目列表
          await this._renderEntries();
        }
      } finally {
        // 恢复按钮状态
        btn.prop('disabled', false).html(originalText);
      }
    });

    // 刷新条目状态按钮
    $(document).off('click', '#simulated-life-refresh-btn');
    $(document).on('click', '#simulated-life-refresh-btn', async () => {
      logger.debug('[SimulatedLifeUI] 点击刷新条目状态按钮');
      this._updateStatus();
      await this._renderEntries();
      toastr.info('状态已刷新', '模拟人生');
    });

    // 查看溯 Sus 版本按钮
    $(document).off('click', '#view-sus-prompt-btn');
    $(document).on('click', '#view-sus-prompt-btn', async () => {
      logger.debug('[SimulatedLifeUI] 点击查看溯版本按钮');
      const promptContent = this.module.getDesktopPrompt();
      const htmlContent = `
        <div style="text-align: left; max-height: 70vh; overflow-y: auto;">
          <h3 style="color: var(--SmartThemeQuoteColor); margin-top: 0;">
            内联代码模拟多模态 - 通用
          </h3>
          <p style="margin-bottom: 12px; opacity: 0.8;">
            <strong>原作者：</strong>溯（Sus）<br>
            <strong>适用平台：</strong>桌面端和移动端通用
          </p>
          <pre style="background: var(--black50a); padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;">${this._escapeHtml(promptContent)}</pre>
        </div>
      `;
      await callGenericPopup(htmlContent, POPUP_TYPE.TEXT, '', { wide: true, large: true });
    });

    // 查看白沉优化版按钮
    $(document).off('click', '#view-mobile-prompt-btn');
    $(document).on('click', '#view-mobile-prompt-btn', async () => {
      logger.debug('[SimulatedLifeUI] 点击查看白沉版本按钮');
      const promptContent = this.module.getMobilePrompt();
      const htmlContent = `
        <div style="text-align: left; max-height: 70vh; overflow-y: auto;">
          <h3 style="color: var(--SmartThemeQuoteColor); margin-top: 0;">
            叙事增强式内联HTML - 手机端
          </h3>
          <p style="margin-bottom: 12px; opacity: 0.8;">
            <strong>作者：</strong>白沉（基于溯的二改）<br>
            <strong>优化说明：</strong>针对手机端屏幕调整
          </p>
          <pre style="background: var(--black50a); padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;">${this._escapeHtml(promptContent)}</pre>
        </div>
      `;
      await callGenericPopup(htmlContent, POPUP_TYPE.TEXT, '', { wide: true, large: true });
    });

    // 使用说明按钮
    $(document).off('click', '#simulated-life-help-btn');
    $(document).on('click', '#simulated-life-help-btn', async () => {
      logger.debug('[SimulatedLifeUI] 点击查看使用说明');
      const htmlContent = `
        <div style="text-align: left; line-height: 1.6;">
          <h3 style="color: var(--SmartThemeQuoteColor); margin-top: 0;">使用说明</h3>
          <ol style="margin: 8px 0; padding-left: 20px;">
            <li>点击"懒人一键"按钮，自动创建并添加两个版本的提示词</li>
            <li>创建后会显示条目列表，可以直接在这里切换开关</li>
            <li>点击"刷新条目状态"可以手动更新条目显示</li>
            <li>系统会自动将世界书添加到全局，无需手动操作</li>
            <li>建议只开启一个版本（通用版或手机端优化版）</li>
          </ol>
        </div>
      `;
      await callGenericPopup(htmlContent, POPUP_TYPE.TEXT, '使用说明');
    });
  }

  /**
   * 绑定手风琴切换事件
   * @private
   */
  _bindAccordion() {
    const headers = document.querySelectorAll('.paws-puffs-settings-accordion-header');

    headers.forEach(header => {
      header.addEventListener('click', () => {
        const clickedCard = /** @type {HTMLElement} */ (header).dataset.card;
        const allCards = document.querySelectorAll('.paws-puffs-settings-accordion-card');

        // 切换卡片的active状态
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
   * 绑定全局世界书开关
   * @private
   */
  _bindGlobalToggle() {
    $(document).off('change', '#simulated-life-global-enable');
    $(document).on('change', '#simulated-life-global-enable', async () => {
      const isChecked = $('#simulated-life-global-enable').is(':checked');
      logger.debug('[SimulatedLifeUI] 切换全局世界书:', isChecked ? '开启' : '关闭');

      if (isChecked) {
        // 添加到全局
        const success = await this.module.addToGlobal();
        if (!success) {
          // 失败时恢复原状态
          $('#simulated-life-global-enable').prop('checked', false);
        }
      } else {
        // 从全局移除
        const success = await this.module.removeFromGlobal();
        if (!success) {
          // 失败时恢复原状态
          $('#simulated-life-global-enable').prop('checked', true);
        }
      }
    });
  }

  /**
   * 更新状态显示
   * @private
   */
  _updateStatus() {
    // 更新世界书状态文字
    const statusText = $('#simulated-life-status-text');
    if (statusText.length) {
      const exists = this.module.isWorldBookExists();
      const inGlobal = this.module.isInGlobalList();

      let html = '';
      if (!exists) {
        html = '<span style="color: #888;">世界书未创建</span>';
      } else if (!inGlobal) {
        html = '<span style="color: #f39c12;">世界书已创建，但未在全局列表中</span>';
      } else {
        html = '<span style="color: #2ecc71;">世界书已创建并已在全局列表中</span>';
      }

      statusText.html(html);
    }

    // 更新全局开关状态
    const globalToggle = $('#simulated-life-global-enable');
    if (globalToggle.length) {
      globalToggle.prop('checked', this.module.isInGlobalList());
    }
  }

  /**
   * 转义 HTML 字符
   * @private
   * @param {string} text - 原始文本
   * @returns {string} 转义后的文本
   */
  _escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

