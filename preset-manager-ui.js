/**
 * 预设管理UI模块 - 管理预设增强功能的界面
 * 功能：预设管理标签页的UI渲染和交互
 *
 * 简化版：仅保留世界书集成功能
 */

import { eventSource } from "../../../../script.js";
import { callGenericPopup } from '../../../popup.js';
import logger from './logger.js';
import * as snapshotData from './preset-snapshot-data.js';

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

          <!-- 卡片：预设快照 -->
          <div class="preset-accordion-card" data-card="snapshot">
            <div class="preset-accordion-header" data-card="snapshot">
              <div class="preset-accordion-tab">
                <i class="fa-solid fa-camera"></i>
                <strong>预设快照</strong>
              </div>
            </div>
            <div class="preset-accordion-body">
              <!-- 使用说明入口 -->
              <div class="snapshot-info-link" id="snapshot-info-link">
                <i class="fa-solid fa-circle-question"></i>
                <span>点击查看使用说明</span>
              </div>

              <!-- 功能开关 -->
              <div class="snapshot-enable-section">
                <label class="checkbox_label">
                  <input type="checkbox" id="snapshot-enabled" ${snapshotData.isEnabled() ? 'checked' : ''}>
                  <span>启用预设快照</span>
                  <span class="hint-inline">保存预设开关状态，通过悬浮按钮快捷切换</span>
                </label>
              </div>

              <!-- 弹窗菜单样式设置 -->
              <div class="snapshot-menu-settings">
                <div class="snapshot-setting-row">
                  <label>弹窗大小</label>
                  <input type="range" id="snapshot-menu-scale" min="0.7" max="1.3" step="0.05" value="1">
                  <span id="snapshot-menu-scale-value">1.0</span>
                </div>
                <div class="snapshot-setting-row">
                  <label>文字大小</label>
                  <input type="range" id="snapshot-menu-font-scale" min="0.8" max="1.4" step="0.05" value="1">
                  <span id="snapshot-menu-font-scale-value">1.0</span>
                </div>
              </div>

              <h4 style="color: var(--SmartThemeQuoteColor);">已保存的快照</h4>
              <!-- 搜索框 -->
              <div class="snapshot-search-box">
                <i class="fa-solid fa-search"></i>
                <input type="text" id="snapshot-search-input" placeholder="搜索快照..." class="text_pole">
              </div>
              <!-- 预设选择下拉框 -->
              <div class="snapshot-preset-selector">
                <label style="font-size: 0.9em; opacity: 0.8;">选择预设查看快照：</label>
                <select id="snapshot-preset-select" class="text_pole">
                  <!-- 选项将动态填充 -->
                </select>
              </div>
              <div id="snapshot-list-container" class="snapshot-list-container">
                <!-- 快照列表将在这里渲染 -->
              </div>
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

    // 绑定快照功能
    this.bindSnapshotToggle();
    this.bindPresetSelector();
    this.renderSnapshotList();

    // 监听快照保存事件，刷新列表
    eventSource.on('pawsSnapshotSaved', ({ presetName }) => {
      logger.debug('[PresetManagerUI] 收到快照保存事件，刷新列表');
      this.refreshPresetSelector();
      this.renderSnapshotList();
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
   * 渲染快照列表
   * @description 根据选中的预设加载快照，支持按名称搜索过滤
   * @returns {void}
   */
  renderSnapshotList() {
    const container = this.container?.querySelector('#snapshot-list-container');
    if (!container) return;

    const selectedPreset = this.getSelectedPreset();
    const snapshots = snapshotData.getSnapshotList(selectedPreset);
    const lastAppliedId = snapshotData.getLastAppliedId();

    if (snapshots.length === 0) {
      container.innerHTML = `
        <div class="snapshot-empty-hint">
          <i class="fa-solid fa-inbox" style="font-size: 24px; opacity: 0.5;"></i>
          <p style="margin: 8px 0 0 0; opacity: 0.7;">还没有保存任何快照</p>
          <p style="margin: 4px 0 0 0; font-size: 0.9em; opacity: 0.5;">在预设页面点击 <i class="fa-solid fa-camera"></i> 保存当前状态</p>
        </div>
      `;
      return;
    }

    // 获取搜索关键词
    const searchInput = this.container?.querySelector('#snapshot-search-input');
    const searchKeyword = searchInput?.value?.trim().toLowerCase() || '';

    // 过滤快照
    const filteredSnapshots = searchKeyword
      ? snapshots.filter(s => s.name.toLowerCase().includes(searchKeyword))
      : snapshots;

    if (filteredSnapshots.length === 0 && searchKeyword) {
      container.innerHTML = `
        <div class="snapshot-empty-hint">
          <i class="fa-solid fa-search" style="font-size: 20px; opacity: 0.5;"></i>
          <p style="margin: 8px 0 0 0; opacity: 0.7;">没有找到匹配的快照</p>
        </div>
      `;
      return;
    }

    const listHtml = filteredSnapshots.map(snapshot => {
      const isLastApplied = snapshot.id === lastAppliedId;

      return `
        <div class="snapshot-item ${isLastApplied ? 'last-applied' : ''}" data-id="${snapshot.id}">
          <div class="snapshot-item-info">
            <span class="snapshot-item-name" title="${snapshot.name}">${snapshot.name}</span>
            <span class="snapshot-item-meta">${snapshot.stateCount}项</span>
          </div>
          <div class="snapshot-item-actions">
            <button class="snapshot-btn snapshot-apply-btn" title="应用此快照">
              <i class="fa-solid fa-play"></i>
            </button>
            <button class="snapshot-btn snapshot-rename-btn" title="重命名">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="snapshot-btn snapshot-delete-btn" title="删除">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = listHtml;
    this.bindSnapshotListEvents();
  }

  /**
   * 绑定快照列表事件
   */
  bindSnapshotListEvents() {
    const container = this.container?.querySelector('#snapshot-list-container');
    if (!container) return;

    // 应用按钮
    container.querySelectorAll('.snapshot-apply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.snapshot-item');
        const id = item?.dataset.id;
        if (id) {
          const success = snapshotData.applySnapshot(id);
          if (success) {
            this.showMessage('快照已应用', 'success');
            this.renderSnapshotList(); // 刷新列表显示"上次应用"标记
          } else {
            this.showMessage('应用快照失败', 'error');
          }
        }
      });
    });

    // 重命名按钮
    container.querySelectorAll('.snapshot-rename-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.snapshot-item');
        const id = item?.dataset.id;
        const nameEl = item?.querySelector('.snapshot-item-name');
        if (!id || !nameEl) return;

        const currentName = nameEl.textContent;
        const newName = prompt('输入新名称:', currentName);

        if (newName && newName !== currentName) {
          const success = snapshotData.renameSnapshot(id, newName);
          if (success) {
            this.showMessage('已重命名', 'success');
            this.renderSnapshotList();
          }
        }
      });
    });

    // 删除按钮
    container.querySelectorAll('.snapshot-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.snapshot-item');
        const id = item?.dataset.id;
        const nameEl = item?.querySelector('.snapshot-item-name');
        if (!id) return;

        const confirmed = confirm(`确定要删除快照"${nameEl?.textContent}"吗？`);
        if (confirmed) {
          const success = snapshotData.deleteSnapshot(id);
          if (success) {
            this.showMessage('已删除', 'info');
            this.renderSnapshotList();
          }
        }
      });
    });
  }

  /**
   * 绑定快照功能开关事件
   */
  bindSnapshotToggle() {
    const checkbox = this.container?.querySelector('#snapshot-enabled');
    if (!checkbox) return;

    checkbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      snapshotData.setEnabled(enabled);
      logger.info('[PresetManagerUI] 预设快照功能:', enabled ? '启用' : '禁用');

      if (enabled) {
        this.showMessage('预设快照已启用', 'success');
        // 检查悬浮按钮是否启用，给出提示
        this.checkFloatingBtnStatus();
      } else {
        this.showMessage('预设快照已禁用', 'info');
      }

      // 触发事件通知其他模块
      eventSource.emit('pawsSnapshotEnabledChanged', enabled);
    });

    // 绑定弹窗样式滑块
    this.bindMenuStyleSliders();

    // 绑定帮助弹窗按钮
    this.bindInfoPopupBtn();

    // 绑定搜索框
    this.bindSearchBox();
  }

  /**
   * 绑定弹窗样式滑块事件
   *
   * @description
   * 绑定"弹窗缩放"和"字体缩放"两个滑块的事件。
   * 从存储加载初始值，拖动时实时更新 CSS 变量和存储。
   * CSS 变量用于控制长按悬浮按钮弹出的快照菜单的大小。
   *
   * @returns {void}
   */
  bindMenuStyleSliders() {
    const scaleSlider = this.container?.querySelector('#snapshot-menu-scale');
    const scaleValue = this.container?.querySelector('#snapshot-menu-scale-value');
    const fontSlider = this.container?.querySelector('#snapshot-menu-font-scale');
    const fontValue = this.container?.querySelector('#snapshot-menu-font-scale-value');

    // 从存储加载设置
    const settings = snapshotData.getMenuSettings();

    if (scaleSlider) {
      scaleSlider.value = settings.menuScale || 1;
      if (scaleValue) scaleValue.textContent = (settings.menuScale || 1).toFixed(2);

      scaleSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (scaleValue) scaleValue.textContent = value.toFixed(2);
        snapshotData.setMenuSettings({ menuScale: value });
        // 应用到 CSS 变量
        document.documentElement.style.setProperty('--snapshot-menu-scale', value);
      });
    }

    if (fontSlider) {
      fontSlider.value = settings.fontScale || 1;
      if (fontValue) fontValue.textContent = (settings.fontScale || 1).toFixed(2);

      fontSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (fontValue) fontValue.textContent = value.toFixed(2);
        snapshotData.setMenuSettings({ fontScale: value });
        // 应用到 CSS 变量
        document.documentElement.style.setProperty('--snapshot-menu-font-scale', value);
      });
    }

    // 初始应用 CSS 变量
    document.documentElement.style.setProperty('--snapshot-menu-scale', settings.menuScale || 1);
    document.documentElement.style.setProperty('--snapshot-menu-font-scale', settings.fontScale || 1);
  }

  /**
   * 绑定帮助弹窗按钮（使用说明链接）
   * @returns {void}
   */
  bindInfoPopupBtn() {
    const link = this.container?.querySelector('#snapshot-info-link');
    if (!link) return;

    link.addEventListener('click', () => {
      this.showInfoPopup();
    });
  }

  /**
   * 绑定搜索框事件
   * @returns {void}
   */
  bindSearchBox() {
    const searchInput = this.container?.querySelector('#snapshot-search-input');
    if (!searchInput) return;

    // 输入时实时过滤
    searchInput.addEventListener('input', () => {
      this.renderSnapshotList();
    });
  }

  /**
   * 显示功能说明弹窗
   *
   * @description
   * 用 callGenericPopup 显示预设快照的使用说明，
   * 包括"是什么"和"怎么使用"两部分内容。
   *
   * @returns {void}
   */
  showInfoPopup() {
    const content = `
      <div style="max-width: 400px;">
        <h4 style="margin-top: 0; color: var(--SmartThemeQuoteColor);">预设快照是什么？</h4>
        <p>预设快照可以<strong>保存当前所有预设条目的开关状态</strong>，方便你在不同场景快速切换。</p>
        <p style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 8px; border-radius: 5px;">
          比如：日常聊天用一套开关、开车用另一套、纯净模式又是一套。保存后，长按悬浮按钮就能一键切换！
        </p>

        <h4 style="color: var(--SmartThemeQuoteColor);">怎么使用？</h4>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 10px; border-radius: 5px; margin-bottom: 8px;">
          <strong style="color: var(--SmartThemeQuoteColor);">保存快照</strong>
          <p style="margin: 4px 0 0 0;">在预设页面底部点击 <i class="fa-solid fa-camera"></i> 按钮，输入名称保存当前开关状态。</p>
        </div>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 10px; border-radius: 5px;">
          <strong style="color: var(--SmartThemeQuoteColor);">快捷切换</strong>
          <p style="margin: 4px 0 0 0;"><strong>长按悬浮按钮（350ms）</strong>弹出快照菜单，点击即可应用。</p>
        </div>
      </div>
    `;

    // 使用 SillyTavern 的弹窗
    if (typeof callGenericPopup === 'function') {
      callGenericPopup(content, 1, '预设快照使用说明');
    } else {
      // 备用：使用 alert
      alert('预设快照：保存预设开关状态，长按悬浮按钮快捷切换');
    }
  }

  /**
   * 检查悬浮按钮状态，给出提示
   */
  checkFloatingBtnStatus() {
    const floatingBtnCheckbox = document.getElementById('beautify-floating-btn-enabled');
    if (floatingBtnCheckbox && !floatingBtnCheckbox.checked) {
      // 悬浮按钮未启用，给出提示
      setTimeout(() => {
        this.showMessage('提示：长按悬浮按钮可快捷切换快照，建议同时启用悬浮按钮', 'info');
      }, 500);
    }
  }

  /**
   * 绑定预设选择下拉框事件
   */
  bindPresetSelector() {
    const select = this.container?.querySelector('#snapshot-preset-select');
    if (!select) return;

    // 点击时刷新预设列表（每次点击都重新扫描）
    select.addEventListener('focus', () => {
      this.refreshPresetSelector();
    });

    // 选择变化时刷新快照列表
    select.addEventListener('change', () => {
      this.renderSnapshotList();
    });

    // 初始填充
    this.refreshPresetSelector();
  }

  /**
   * 刷新预设选择下拉框
   */
  refreshPresetSelector() {
    const select = this.container?.querySelector('#snapshot-preset-select');
    if (!select) return;

    const currentPreset = snapshotData.getCurrentPresetName();
    const presetsWithSnapshots = snapshotData.getPresetsWithSnapshots();
    const previousValue = select.value;

    // 构建选项列表
    let options = `<option value="${currentPreset}">${currentPreset}（当前）</option>`;

    // 添加其他有快照的预设
    for (const presetName of presetsWithSnapshots) {
      if (presetName !== currentPreset) {
        options += `<option value="${presetName}">${presetName}</option>`;
      }
    }

    select.innerHTML = options;

    // 尝试恢复之前的选择
    if (previousValue && [...select.options].some(opt => opt.value === previousValue)) {
      select.value = previousValue;
    } else {
      select.value = currentPreset;
    }

    // 检查是否有已删除的预设
    this.checkDeletedPresets(presetsWithSnapshots);
  }

  /**
   * 检查是否有已删除的预设（有快照但预设不存在）
   */
  checkDeletedPresets(presetsWithSnapshots) {
    // 获取当前 SillyTavern 中的预设列表
    const presetSelect = document.querySelector('#settings_preset_openai');
    if (!presetSelect) return;

    const existingPresets = new Set();
    presetSelect.querySelectorAll('option').forEach(opt => {
      if (opt.value) existingPresets.add(opt.textContent || opt.value);
    });

    // 检查有快照但预设已不存在的情况
    for (const presetName of presetsWithSnapshots) {
      if (!existingPresets.has(presetName)) {
        // 预设已被删除，询问用户是否删除关联的快照
        const count = snapshotData.getSnapshotList(presetName).length;
        const confirmed = confirm(
          `预设"${presetName}"已被删除，但仍有 ${count} 个关联的快照。\n是否删除这些快照？`
        );
        if (confirmed) {
          snapshotData.deletePresetSnapshots(presetName);
          this.showMessage(`已删除预设"${presetName}"的 ${count} 个快照`, 'info');
          this.refreshPresetSelector();
        }
        break; // 一次只处理一个
      }
    }
  }

  /**
   * 获取当前选中的预设名称
   */
  getSelectedPreset() {
    const select = this.container?.querySelector('#snapshot-preset-select');
    return select?.value || snapshotData.getCurrentPresetName();
  }

  /**
   * 销毁UI
   */
  destroy() {
    // 清理事件监听器
    // （由于使用了简单的事件绑定，浏览器会自动清理）
  }
}
