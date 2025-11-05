/**
 * 预设管理UI模块 - 管理预设增强功能的界面
 * 功能：预设管理标签页的UI渲染和交互
 * 
 * 简化版：仅保留世界书集成功能
 */

import { eventSource } from "../../../../script.js";
import logger from './logger.js';

export class PresetManagerUI {
  constructor(presetManager) {
    this.presetManager = presetManager;
    this.container = null;
  }

  /**
   * 初始化UI
   */
  async init(container) {
    if (!container) {
      logger.warn('[PresetManagerUI.init] 容器元素不存在');
      return;
    }

    logger.debug('[PresetManagerUI.init] 初始化预设管理UI');
    this.container = container;
    this.render();
    this.bindEvents();
    logger.debug('[PresetManagerUI.init] 初始化完成');
  }

  /**
   * 渲染UI
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="enhanced-section preset-manager-section">
        <!-- 功能开关 -->
        <div class="preset-enable-section-compact">
          <label class="checkbox_label">
            <input type="checkbox" id="preset-manager-enabled" ${this.presetManager.enabled ? 'checked' : ''}>
            <span>启用世界书工具</span>
            <span class="hint-inline">在预设页面添加独立的世界书管理工具</span>
          </label>
        </div>

        <!-- 手风琴卡片容器 -->
        <div class="preset-accordion-container">
          <!-- 卡片：世界书工具 -->
          <div class="preset-accordion-card active" data-card="worldbook">
            <div class="preset-accordion-header" data-card="worldbook">
              <div class="preset-accordion-tab">
                <i class="fa-solid fa-book"></i>
                <strong>世界书工具</strong>
              </div>
            </div>
            <div class="preset-accordion-body">
              <h4 style="margin-top: 0; color: var(--SmartThemeQuoteColor);">这是什么功能？</h4>
              <p>世界书工具就像一个<strong>智能百科全书</strong>，可以根据聊天内容自动提供相关背景信息给AI。</p>
              <p style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 4px; border-radius: 5px;">
                举个例子：聊天里提到"小红"，世界书就能自动告诉AI"小红是你的猫咪，橘色的，爱吃鱼"，AI就能更准确地回答你。
              </p>

              <h4 style="color: var(--SmartThemeQuoteColor);">为什么要做这个工具？</h4>
              <p>传统的世界书使用很麻烦，需要这样操作：</p>
              <ul class="preset-feature-list">
                <li>先打开<strong>全局世界书</strong></li>
                <li>切换到世界书页面，把<strong>不用的条目一个个关闭</strong></li>
                <li>用完后还要<strong>重新开关</strong>，很繁琐</li>
              </ul>
              <p style="background: color-mix(in srgb, var(--SmartThemeUnderlineColor) 10%, transparent 90%); padding: 10px; border-radius: 5px; margin-top: 10px;">
                <strong>更麻烦的是：</strong>如果你从多个世界书里各挑了几个喜欢的条目（比如A世界书的第3条、B世界书的第1条），每次玩对话都要来回切换好几个世界书，确认全局开了、不要的条目关了……太累了，干脆不玩了 😭
              </p>

              <h4 style="color: var(--SmartThemeQuoteColor);">这个工具解决了什么问题？</h4>
              <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 12px; border-radius: 5px;">
                <p style="margin: 0 0 10px 0;"><strong style="color: var(--SmartThemeQuoteColor);">不能因为麻烦而挑食，要营养均衡！</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                  <li><strong>从各个世界书挑选喜欢的条目</strong>，组合到一起用</li>
                  <li><strong>在预设页面就能开关条目</strong>，不用切换到世界书页面</li>
                  <li><strong>不需要开全局世界书</strong>，只激活你要的条目</li>
                  <li><strong>随时切换不同组合</strong>，想怎么玩就怎么玩</li>
                </ul>
              </div>

              <h4 style="color: var(--SmartThemeQuoteColor);">工具在哪里？</h4>
              <p>打开<strong>AI响应配置 → 预设页面</strong>，在预设列表<strong>上方</strong>有个可以展开的"世界书工具"折叠栏。</p>

              <h4 style="color: var(--SmartThemeQuoteColor);">怎么使用？</h4>
              <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                <strong style="color: var(--SmartThemeQuoteColor);">第一步：选择世界书</strong>
                <p style="margin: 5px 0 0 0;">点击折叠栏里的下拉菜单，选择一个世界书。</p>
              </div>
              <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                <strong style="color: var(--SmartThemeQuoteColor);">第二步：添加条目</strong>
                <p style="margin: 5px 0 0 0;">下面会显示世界书里的所有条目，点击条目右边的<strong>+</strong>号就能添加到当前预设。</p>
              </div>
              <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                <strong style="color: var(--SmartThemeQuoteColor);">第三步：设置触发方式</strong>
                <p style="margin: 5px 0 0 0;">点击已添加的条目，可以选择：</p>
                <ul style="margin: 5px 0 0 20px; padding: 0;">
                  <li><strong>🟢 关键词匹配</strong>：聊天里出现"小红"就自动激活</li>
                  <li><strong>🔵 常驻模式</strong>：一直保持激活，适合重要背景</li>
                </ul>
              </div>

              <h4 style="color: var(--SmartThemeQuoteColor);">核心功能</h4>
              <ul class="preset-feature-list">
                <li><i class="fa-solid fa-key" style="color: var(--SmartThemeQuoteColor);"></i> <strong>关键词匹配</strong>：聊到啥就自动激活啥，不用手动开关</li>
                <li><i class="fa-solid fa-thumbtack" style="color: var(--SmartThemeQuoteColor);"></i> <strong>常驻模式</strong>：重要设定一直生效，AI不会忘记</li>
                <li><i class="fa-solid fa-layer-group" style="color: var(--SmartThemeQuoteColor);"></i> <strong>深度控制</strong>：设置条目在提示词里的位置，越小越靠前</li>
                <li><i class="fa-solid fa-copy" style="color: var(--SmartThemeQuoteColor);"></i> <strong>数据独立</strong>：工具里的条目是副本，编辑不会影响原世界书</li>
                <li><i class="fa-solid fa-download" style="color: var(--SmartThemeQuoteColor);"></i> <strong>导入导出</strong>：可以导出成JSON文件，换电脑也能用</li>
              </ul>

              <h4 style="color: var(--SmartThemeUnderlineColor);">温馨提示</h4>
              <ul class="preset-feature-list">
                <li>世界书条目太多会占用很多token（AI的"脑容量"），建议只加必要的</li>
                <li>常驻模式会一直占用token，不常用的建议用关键词匹配</li>
                <li>深度值影响条目在提示词里的顺序，重要的可以设小一点，让AI更重视</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 当前状态 -->
        <div class="preset-status-bar">
          <div class="status-item">
            <span class="status-label">功能状态</span>
            <span class="status-value" id="preset-status">${this.presetManager.enabled ? '已启用' : '已禁用'}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    if (!this.container) return;

    // 功能开关
    const enabledCheckbox = this.container.querySelector('#preset-manager-enabled');
    if (enabledCheckbox) {
      enabledCheckbox.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        logger.info('[PresetManagerUI] 用户切换世界书工具:', enabled ? '启用' : '禁用');

        await this.presetManager.setEnabled(enabled);

        // 更新状态显示
        const statusElement = this.container.querySelector('#preset-status');
        if (statusElement) {
          statusElement.textContent = enabled ? '已启用' : '已禁用';
        }

        if (enabled) {
          this.showMessage('世界书工具已启用', 'success');
        } else {
          this.showMessage('世界书工具已禁用', 'info');
        }
      });
    }

    // 监听预设名称变化
    eventSource.on('pawsPresetEnabledChanged', (enabled) => {
      if (enabledCheckbox) {
        enabledCheckbox.checked = enabled;
      }
    });

    // ✨ 手风琴效果：点击标题切换展开的卡片
    const accordionHeaders = this.container.querySelectorAll('.preset-accordion-header');
    accordionHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        const clickedCard = header.dataset.card;
        logger.debug('[PresetManagerUI] 切换手风琴卡片:', clickedCard);

        const allCards = this.container.querySelectorAll('.preset-accordion-card');

        // 切换所有卡片的active状态
        allCards.forEach(card => {
          if (card.dataset.card === clickedCard) {
            card.classList.add('active');
          } else {
            card.classList.remove('active');
          }
        });
      });
    });
  }

  /**
   * 显示消息
   */
  showMessage(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
      switch (type) {
        case 'success':
          toastr.success(message);
          break;
        case 'warning':
          toastr.warning(message);
          break;
        case 'error':
          toastr.error(message);
          break;
        default:
          toastr.info(message);
      }
    }
  }

  /**
   * 销毁UI
   */
  destroy() {
    // 清理事件监听器
    // （由于使用了简单的事件绑定，浏览器会自动清理）
  }
}