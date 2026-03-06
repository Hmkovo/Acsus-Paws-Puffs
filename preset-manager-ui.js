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
import * as quickToggleData from './preset-quick-toggle-data.js';
import * as toggleGroupData from './toggle-group-data.js';
import * as stitchData from './preset-stitch-data.js';

export class PresetManagerUI {
  // ========================================
  // 生命周期
  // ========================================

  constructor(presetManager) {
    this.presetManager = presetManager;
    this.container = null;
    this._handlers = {};
  }

  /**
   * 初始化UI
   */
  async init(container) {
    if (!container) {
      logger.warn('preset', '[PresetManagerUI.init] 容器元素不存在');
      return;
    }

    logger.debug('preset', 'PresetManagerUI.init] 初始化预设管理UI');
    this.container = container;
    this.render();
    this.bindEvents();
    logger.debug('preset', 'PresetManagerUI.init] 初始化完成');
  }

  // ========================================
  // 渲染
  // ========================================

  /**
   * 渲染UI
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="enhanced-section preset-manager-section">
        <!-- 功能介绍条 -->
        <div class="preset-intro-bar">
          <div class="preset-intro-text">
            <i class="fa-solid fa-info-circle"></i>
            预设管理工具：让预设操作更方便快捷
          </div>
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
              <!-- 功能开关（移到手风琴内部） -->
              <div class="preset-setting-item">
                <label class="checkbox_label">
                  <input type="checkbox" id="preset-manager-enabled" ${this.presetManager.enabled ? 'checked' : ''}>
                  <span>启用世界书工具</span>
                </label>
                <span class="preset-hint">在预设页面添加独立的世界书管理工具</span>
              </div>

              <h4 style="margin-top: 12px; color: var(--SmartThemeQuoteColor);">这是什么功能？</h4>
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
              <div class="preset-setting-item">
                <label class="checkbox_label">
                  <input type="checkbox" id="snapshot-enabled" ${snapshotData.isEnabled() ? 'checked' : ''}>
                  <span>启用预设快照</span>
                </label>
                <span class="preset-hint">保存预设开关状态，通过悬浮按钮快捷切换</span>
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

              <!-- 统一搜索框 -->
              <div class="snapshot-search-box">
                <i class="fa-solid fa-search"></i>
                <input type="text" id="snapshot-search-input" placeholder="搜索快速开关或快照..." class="text_pole">
              </div>

              <!-- 折叠分组容器 -->
              <div class="snapshot-collapsible-container" id="snapshot-collapsible-container">
                <!-- 总开关分组（默认折叠） -->
                <div class="snapshot-collapsible-group" data-group="toggle-groups">
                  <div class="snapshot-collapsible-header" data-group="toggle-groups">
                    <i class="fa-solid fa-chevron-right collapsible-icon"></i>
                    <span class="collapsible-title">总开关</span>
                    <span class="collapsible-count" id="toggle-group-count">(0)</span>
                  </div>
                  <div class="snapshot-collapsible-body collapsed" id="toggle-group-list-container">
                    <!-- 总开关列表将在这里渲染 -->
                  </div>
                </div>

                <!-- 快速开关分组（默认折叠） -->
                <div class="snapshot-collapsible-group" data-group="quick-toggles">
                  <div class="snapshot-collapsible-header" data-group="quick-toggles">
                    <i class="fa-solid fa-chevron-right collapsible-icon"></i>
                    <span class="collapsible-title">快速开关</span>
                    <span class="collapsible-count" id="quick-toggle-count">(0)</span>
                  </div>
                  <div class="snapshot-collapsible-body collapsed" id="quick-toggle-list-container">
                    <!-- 快速开关列表将在这里渲染 -->
                  </div>
                </div>

                <!-- 快照分组（默认折叠） -->
                <div class="snapshot-collapsible-group" data-group="snapshots">
                  <div class="snapshot-collapsible-header" data-group="snapshots">
                    <i class="fa-solid fa-chevron-right collapsible-icon"></i>
                    <span class="collapsible-title">快照</span>
                    <span class="collapsible-count" id="snapshot-count">(0)</span>
                  </div>
                  <div class="snapshot-collapsible-body collapsed" id="snapshot-list-container">
                    <!-- 快照列表将在这里渲染 -->
                  </div>
                </div>
              </div>

              <!-- 预设选择下拉框（移到底部） -->
              <div class="snapshot-preset-selector">
                <label style="font-size: 0.9em; opacity: 0.8;">选择预设查看快照：</label>
                <select id="snapshot-preset-select" class="text_pole">
                  <!-- 选项将动态填充 -->
                </select>
              </div>
            </div>
          </div>

          <!-- 卡片：预设缝合 -->
          <div class="preset-accordion-card" data-card="stitch">
            <div class="preset-accordion-header" data-card="stitch">
              <div class="preset-accordion-tab">
                <i class="fa-solid fa-puzzle-piece"></i>
                <strong>预设缝合</strong>
              </div>
            </div>
            <div class="preset-accordion-body">
              <!-- 功能开关 -->
              <div class="preset-setting-item">
                <label class="checkbox_label">
                  <input type="checkbox" id="preset-stitch-enabled" ${stitchData.isEnabled() ? 'checked' : ''}>
                  <span>启用预设缝合</span>
                </label>
                <span class="preset-hint">在预设页面添加条目收藏库，快速缝合常用条目</span>
              </div>

              <h4 style="margin-top: 12px; color: var(--SmartThemeQuoteColor);">这是什么功能？</h4>
              <p>预设缝合就像一个<strong>条目收藏夹</strong>，把你常用的条目存起来，换预设时一键加入。</p>

              <h4 style="color: var(--SmartThemeQuoteColor);">解决什么问题？</h4>
              <p style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 10px; border-radius: 5px;">
                朋友更新了预设，但你之前加的自定义条目没了？用这个功能：
              </p>
              <ul class="preset-feature-list">
                <li><i class="fa-solid fa-bookmark" style="color: var(--SmartThemeQuoteColor);"></i> 把常用条目<strong>收藏到库里</strong></li>
                <li><i class="fa-solid fa-bolt" style="color: var(--SmartThemeQuoteColor);"></i> 换新预设后，<strong>一键插入</strong>到指定位置</li>
                <li><i class="fa-solid fa-wand-magic-sparkles" style="color: var(--SmartThemeQuoteColor);"></i> 还能把<strong>世界书条目转成预设条目</strong></li>
              </ul>

              <h4 style="color: var(--SmartThemeQuoteColor);">怎么使用？</h4>
              <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                <strong style="color: var(--SmartThemeQuoteColor);">第一步：打开收藏库</strong>
                <p style="margin: 5px 0 0 0;">打开预设页面，底部工具栏有个<strong>拼图按钮</strong>，点击打开收藏库。</p>
              </div>
              <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                <strong style="color: var(--SmartThemeQuoteColor);">第二步：收藏条目</strong>
                <p style="margin: 5px 0 0 0;">点击"添加条目"，可以从当前预设、世界书添加，或手动创建。</p>
              </div>
              <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 12px; border-radius: 5px; margin-bottom: 10px;">
                <strong style="color: var(--SmartThemeQuoteColor);">第三步：插入到预设</strong>
                <p style="margin: 5px 0 0 0;">选择插入位置（能看到每个条目是什么），点击插入即可。</p>
              </div>

              <h4 style="color: var(--SmartThemeQuoteColor);">核心功能</h4>
              <ul class="preset-feature-list">
                <li><i class="fa-solid fa-tags" style="color: var(--SmartThemeQuoteColor);"></i> <strong>标签分类</strong>：自定义标签，快速筛选条目</li>
                <li><i class="fa-solid fa-location-dot" style="color: var(--SmartThemeQuoteColor);"></i> <strong>精准插入</strong>：选择插入到哪个条目之后</li>
                <li><i class="fa-solid fa-layer-group" style="color: var(--SmartThemeQuoteColor);"></i> <strong>批量操作</strong>：一次插入多个条目</li>
                <li><i class="fa-solid fa-rotate" style="color: var(--SmartThemeQuoteColor);"></i> <strong>世界书转换</strong>：把世界书条目变成预设条目</li>
              </ul>

              <h4 style="color: var(--SmartThemeUnderlineColor);">温馨提示</h4>
              <ul class="preset-feature-list">
                <li>收藏库是全局的，所有预设共享</li>
                <li>插入的条目默认是关闭状态，需要手动开启</li>
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

  // ========================================
  // 主事件绑定
  // ========================================

  /**
   * 绑定事件
   *
   * @description
   * 统一保存跨模块事件总线的处理器引用，确保 destroy() 可对称解绑，
   * 避免 UI 已销毁后仍接收事件导致的重复渲染或内存泄漏。
   *
   * @returns {void}
   */
  bindEvents() {
    if (!this.container) return;

    // 功能开关
    const enabledCheckbox = this.container.querySelector('#preset-manager-enabled');
    if (enabledCheckbox) {
      enabledCheckbox.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        logger.info('preset', '[PresetManagerUI] 用户切换世界书工具:', enabled ? '启用' : '禁用');

        await this.presetManager.setEnabled(enabled);

        // 更新状态显示
        const statusElement = this.container.querySelector('#preset-status');
        if (statusElement) {
          statusElement.textContent = enabled ? '已启用' : '已禁用';
        }

        if (enabled) {
          toastr.success('世界书工具已启用');
        } else {
          toastr.info('世界书工具已禁用');
        }
      });
    }

    // 监听预设名称变化
    this._handlers.onPresetEnabledChanged = (enabled) => {
      if (enabledCheckbox) {
        enabledCheckbox.checked = enabled;
      }
    };
    eventSource.on('pawsPresetEnabledChanged', this._handlers.onPresetEnabledChanged);

    // ✨ 手风琴效果：点击标题切换展开的卡片
    const accordionHeaders = this.container.querySelectorAll('.preset-accordion-header');
    accordionHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        const clickedCard = header.dataset.card;
        logger.debug('preset', 'PresetManagerUI] 切换手风琴卡片:', clickedCard);

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
    this.bindStitchToggle();  // 绑定缝合器开关
    this.bindPresetSelector();
    this.bindCollapsibleGroups();
    this.renderToggleGroupList();
    this.renderQuickToggleList();
    this.renderSnapshotList();

    // 监听快照保存事件，刷新列表
    this._handlers.onSnapshotSaved = () => {
      logger.debug('preset', 'PresetManagerUI] 收到快照保存事件，刷新列表');
      this.refreshPresetSelector();
      this.renderSnapshotList();
    };
    eventSource.on('pawsSnapshotSaved', this._handlers.onSnapshotSaved);
  }

  // ========================================
  // 折叠分组相关
  // ========================================

  /**
   * 绑定折叠分组的点击事件
   */
  bindCollapsibleGroups() {
    const headers = this.container?.querySelectorAll('.snapshot-collapsible-header');
    if (!headers) return;

    headers.forEach(header => {
      header.addEventListener('click', () => {
        const group = header.dataset.group;
        const body = header.nextElementSibling;
        const icon = header.querySelector('.collapsible-icon');

        // 如果正在搜索，不允许折叠
        const searchInput = this.container?.querySelector('#snapshot-search-input');
        if (searchInput?.value?.trim()) {
          return;
        }

        // 切换展开/折叠状态
        const isExpanded = header.classList.contains('expanded');

        if (isExpanded) {
          header.classList.remove('expanded');
          body?.classList.add('collapsed');
          icon?.classList.remove('fa-chevron-down');
          icon?.classList.add('fa-chevron-right');
        } else {
          header.classList.add('expanded');
          body?.classList.remove('collapsed');
          icon?.classList.remove('fa-chevron-right');
          icon?.classList.add('fa-chevron-down');
        }

        logger.debug('preset', 'PresetManagerUI] 切换折叠分组:', group, isExpanded ? '折叠' : '展开');
      });
    });
  }

  // ========================================
  // 总开关相关
  // ========================================

  /**
   * 渲染总开关列表
   *
   * @description
   * 显示所有开关组，支持搜索过滤。每个组显示名称、成员数量、当前状态（全开/全关/混合）。
   * 空状态时显示添加按钮，有数据时底部也有添加按钮。
   */
  renderToggleGroupList() {
    const container = this.container?.querySelector('#toggle-group-list-container');
    const countEl = this.container?.querySelector('#toggle-group-count');
    if (!container) return;

    const groups = toggleGroupData.getToggleGroups();

    // 更新计数
    if (countEl) {
      countEl.textContent = `(${groups.length})`;
    }

    // 获取搜索关键词
    const searchInput = this.container?.querySelector('#snapshot-search-input');
    const searchKeyword = searchInput?.value?.trim().toLowerCase() || '';

    // 过滤
    const filteredGroups = searchKeyword
      ? groups.filter(g => g.name.toLowerCase().includes(searchKeyword))
      : groups;

    // 空状态
    if (groups.length === 0) {
      container.innerHTML = `
        <div class="toggle-group-empty">
          <p>还没有创建总开关</p>
          <button class="menu_button" id="toggle-group-add-btn">
            <i class="fa-solid fa-plus"></i> 添加
          </button>
        </div>
      `;
      this.bindAddToggleGroupBtn();
      return;
    }

    // 搜索无结果
    if (filteredGroups.length === 0 && searchKeyword) {
      container.innerHTML = `
        <div class="toggle-group-empty">
          <p style="opacity: 0.6;">没有匹配的总开关</p>
        </div>
      `;
      return;
    }

    // 渲染列表
    const listHtml = filteredGroups.map(group => {
      const state = toggleGroupData.getGroupState(group.id);
      const stateClass = state === true ? 'on' : (state === false ? 'off' : 'mixed');
      const stateIcon = state === true ? 'fa-toggle-on' : (state === false ? 'fa-toggle-off' : 'fa-circle-half-stroke');
      const stateTitle = state === true ? '全部开启' : (state === false ? '全部关闭' : '部分开启');

      return `
        <div class="toggle-group-item" data-group-id="${group.id}">
          <div class="toggle-group-header">
            <span class="toggle-group-name" title="${group.name}">${group.name}</span>
            <span class="toggle-group-count">(${group.entries.length})</span>
            <div class="toggle-group-actions">
              <span class="toggle-group-switch ${stateClass}" title="${stateTitle}">
                <i class="fa-solid ${stateIcon}"></i>
              </span>
              <button class="toggle-group-edit-btn" title="编辑">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="toggle-group-delete-btn" title="删除">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      ${listHtml}
      <button class="menu_button toggle-group-add-inline" id="toggle-group-add-btn">
        <i class="fa-solid fa-plus"></i> 添加
      </button>
    `;

    this.bindToggleGroupListEvents();
    this.bindAddToggleGroupBtn();
  }

  /**
   * 绑定总开关列表事件
   *
   * @description
   * 为列表中的每个开关组绑定三种交互：
   * 1. 开关图标点击 - 切换整组状态（开→关 或 关/混合→开）
   * 2. 编辑按钮 - 打开编辑弹窗
   * 3. 删除按钮 - 二次确认后删除
   */
  bindToggleGroupListEvents() {
    const container = this.container?.querySelector('#toggle-group-list-container');
    if (!container) return;

    // 开关点击 - 切换整组状态
    container.querySelectorAll('.toggle-group-switch').forEach(switchEl => {
      switchEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = e.target.closest('.toggle-group-item');
        const groupId = item?.dataset.groupId;
        if (!groupId) return;

        const currentState = toggleGroupData.getGroupState(groupId);
        // 如果当前是开启或混合状态，则关闭；否则开启
        const newState = currentState !== true;

        const result = await toggleGroupData.toggleGroup(groupId, newState);
        if (result.success > 0 || result.skipped > 0) {
          toastr.success(`已${newState ? '开启' : '关闭'} ${result.success} 个条目`);
          this.renderToggleGroupList();
          this.renderQuickToggleList();  // 快速开关状态可能也变了
        }
      });
    });

    // 编辑按钮
    container.querySelectorAll('.toggle-group-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.toggle-group-item');
        const groupId = item?.dataset.groupId;
        if (!groupId) return;

        this.showEditToggleGroupPopup(groupId);
      });
    });

    // 删除按钮
    container.querySelectorAll('.toggle-group-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = e.target.closest('.toggle-group-item');
        const groupId = item?.dataset.groupId;
        if (!groupId) return;

        const group = toggleGroupData.getToggleGroupById(groupId);
        if (!group) return;

        const confirmed = await callGenericPopup(
          `确定要删除总开关「${group.name}」吗？`,
          2  // POPUP_TYPE.CONFIRM
        );

        if (confirmed) {
          toggleGroupData.deleteToggleGroup(groupId);
          this.renderToggleGroupList();
          toastr.info('已删除总开关');
        }
      });
    });
  }

  /**
   * 绑定添加总开关按钮
   */
  bindAddToggleGroupBtn() {
    const btn = this.container?.querySelector('#toggle-group-add-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      this.showCreateToggleGroupPopup();
    });
  }

  /**
   * 显示创建总开关弹窗
   *
   * @description
   * 弹出输入框让用户输入名称，创建成功后自动打开编辑弹窗添加成员。
   *
   * @async
   */
  async showCreateToggleGroupPopup() {
    const name = await callGenericPopup(
      '请输入总开关名称：',
      3,  // POPUP_TYPE.INPUT
      ''
    );

    if (name && name.trim()) {
      const group = toggleGroupData.createToggleGroup(name.trim());
      if (group) {
        toastr.success('已创建总开关：' + group.name);
        this.renderToggleGroupList();
        // 创建后直接打开编辑弹窗
        this.showEditToggleGroupPopup(group.id);
      }
    }
  }

  /**
   * 显示编辑总开关弹窗
   *
   * @description
   * 弹窗内容包括：重命名输入框、"加入悬浮按钮菜单"选项、成员列表（可移除）、添加成员按钮。
   * 点击添加成员会打开 showAddEntryPopup 选择预设条目或世界书条目。
   *
   * @async
   * @param {string} groupId - 要编辑的开关组ID
   */
  async showEditToggleGroupPopup(groupId) {
    const group = toggleGroupData.getToggleGroupById(groupId);
    if (!group) return;

    // 保存 this 引用
    const self = this;

    // 构建弹窗内容
    const popupHtml = `
      <div class="toggle-group-edit-popup">
        <div class="toggle-group-edit-header">
          <input type="text" class="text_pole toggle-group-name-input" value="${group.name}" placeholder="总开关名称">
          <button class="menu_button toggle-group-rename-btn" title="重命名">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>

        <div class="toggle-group-floating-option">
          <label class="checkbox_label">
            <input type="checkbox" class="toggle-group-floating-checkbox" ${group.showInFloatingMenu ? 'checked' : ''}>
            <span>加入悬浮按钮菜单</span>
          </label>
        </div>

        <div class="toggle-group-entries-section">
          <div class="toggle-group-entries-header">
            <span>组内成员 (${group.entries.length})</span>
            <button class="menu_button toggle-group-add-entry-btn">
              <i class="fa-solid fa-plus"></i> 添加
            </button>
          </div>
          <div class="toggle-group-entries-list">
            ${group.entries.length === 0 ? '<p class="toggle-group-empty-hint">还没有添加成员，点击上方按钮添加</p>' : ''}
            ${group.entries.map((entry, index) => `
              <div class="toggle-group-entry-item" data-index="${index}">
                <span class="toggle-group-entry-type ${entry.type}">
                  ${entry.type === 'preset' ? '<i class="fa-solid fa-sliders"></i>' : '<i class="fa-solid fa-book"></i>'}
                </span>
                <span class="toggle-group-entry-name" title="${entry.displayName}">${entry.displayName}</span>
                <button class="toggle-group-entry-remove" title="移除">
                  <i class="fa-solid fa-times"></i>
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // 显示弹窗（不await，让代码继续执行绑定事件）
    callGenericPopup(popupHtml, 1);  // POPUP_TYPE.TEXT

    // 等待DOM更新后绑定事件
    await new Promise(resolve => setTimeout(resolve, 100));

    const popupEl = document.querySelector('.toggle-group-edit-popup');
    if (!popupEl) return;

    // 重命名按钮
    const renameBtn = popupEl.querySelector('.toggle-group-rename-btn');
    const nameInput = popupEl.querySelector('.toggle-group-name-input');
    renameBtn?.addEventListener('click', () => {
      const newName = nameInput?.value?.trim();
      if (newName && newName !== group.name) {
        toggleGroupData.renameToggleGroup(groupId, newName);
        toastr.success('已重命名');
        self.renderToggleGroupList();
      }
    });

    // 悬浮按钮选项
    const floatingCheckbox = popupEl.querySelector('.toggle-group-floating-checkbox');
    floatingCheckbox?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      toggleGroupData.setShowInFloatingMenu(groupId, checked);
      toastr.info(checked ? '已加入悬浮按钮菜单' : '已从悬浮按钮菜单移除');
    });

    // 添加成员按钮
    const addEntryBtn = popupEl.querySelector('.toggle-group-add-entry-btn');
    addEntryBtn?.addEventListener('click', () => {
      self.showAddEntryPopup(groupId);
    });

    // 移除成员按钮
    popupEl.querySelectorAll('.toggle-group-entry-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.toggle-group-entry-item');
        const index = parseInt(item?.dataset.index);
        if (!isNaN(index)) {
          toggleGroupData.removeEntry(groupId, index);
          toastr.info('已移除成员');
          // 刷新弹窗
          self.showEditToggleGroupPopup(groupId);
        }
      });
    });
  }

  /**
   * 显示添加成员弹窗
   *
   * @description
   * 弹窗分两个标签页：预设条目、世界书条目。
   * 预设条目从当前预设的prompt_order获取。
   * 世界书条目默认显示所有世界书的条目列表，支持搜索过滤。
   *
   * @async
   * @param {string} groupId - 要添加成员的开关组ID
   */
  async showAddEntryPopup(groupId) {
    // 保存 this 引用和groupId
    const self = this;
    this._currentEditingGroupId = groupId;

    const popupHtml = `
      <div class="toggle-group-add-entry-popup">
        <div class="toggle-group-add-entry-tabs">
          <button class="toggle-group-tab active" data-tab="preset">预设条目</button>
          <button class="toggle-group-tab" data-tab="worldinfo">世界书条目</button>
        </div>
        <div class="toggle-group-add-entry-content">
          <div class="toggle-group-tab-panel active" data-panel="preset">
            <div class="toggle-group-entry-list" id="preset-entry-list">
              <p class="loading-hint">加载中...</p>
            </div>
          </div>
          <div class="toggle-group-tab-panel" data-panel="worldinfo">
            <select class="text_pole" id="worldinfo-book-select" style="margin-bottom:8px;">
              <option value="">-- 选择世界书 --</option>
            </select>
            <div class="toggle-group-worldinfo-search">
              <input type="text" class="text_pole" id="worldinfo-search-input" placeholder="搜索过滤条目...">
            </div>
            <div class="toggle-group-entry-list" id="worldinfo-entry-list">
              <p class="toggle-group-empty-hint">请先选择世界书</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // 显示弹窗（不await）
    callGenericPopup(popupHtml, 1);

    // 等待DOM更新后绑定事件
    await new Promise(resolve => setTimeout(resolve, 100));

    const popupEl = document.querySelector('.toggle-group-add-entry-popup');
    if (!popupEl) return;

    // 标签切换
    popupEl.querySelectorAll('.toggle-group-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        // 切换标签激活状态
        popupEl.querySelectorAll('.toggle-group-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 切换面板显示
        popupEl.querySelectorAll('.toggle-group-tab-panel').forEach(p => p.classList.remove('active'));
        popupEl.querySelector(`[data-panel="${tabName}"]`)?.classList.add('active');
      });
    });

    // 渲染预设条目列表
    this.renderPresetEntryList(groupId, popupEl);

    // 加载世界书列表到下拉框
    this.loadWorldBookSelect(popupEl);

    // 世界书下拉框选择事件
    const bookSelect = popupEl.querySelector('#worldinfo-book-select');
    bookSelect?.addEventListener('change', async () => {
      const worldName = bookSelect.value;
      if (!worldName) {
        const container = popupEl.querySelector('#worldinfo-entry-list');
        if (container) container.innerHTML = '<p class="toggle-group-empty-hint">请先选择世界书</p>';
        return;
      }
      await self.loadWorldInfoEntriesForBook(groupId, popupEl, worldName);
    });

    // 绑定世界书搜索（实时过滤）
    const searchInput = popupEl.querySelector('#worldinfo-search-input');
    searchInput?.addEventListener('input', () => {
      const keyword = searchInput?.value?.trim().toLowerCase() || '';
      self.filterWorldInfoEntries(popupEl, keyword);
    });
  }

  /**
   * 渲染预设条目列表（添加成员弹窗用）
   *
   * @description
   * 从 quickToggleData.getAvailablePrompts() 获取所有可用预设条目，
   * 过滤掉已添加到该组的条目，渲染成可点击的列表。
   *
   * @param {string} groupId - 开关组ID
   * @param {HTMLElement} popupEl - 弹窗DOM元素
   */
  renderPresetEntryList(groupId, popupEl) {
    const container = popupEl.querySelector('#preset-entry-list');
    if (!container) return;

    const group = toggleGroupData.getToggleGroupById(groupId);
    const prompts = quickToggleData.getAvailablePrompts();

    // 过滤掉已添加的
    const existingIdentifiers = new Set(
      group.entries.filter(e => e.type === 'preset').map(e => e.identifier)
    );
    const availablePrompts = prompts.filter(p => !existingIdentifiers.has(p.identifier));

    if (availablePrompts.length === 0) {
      container.innerHTML = '<p class="toggle-group-empty-hint">没有可添加的预设条目</p>';
      return;
    }

    container.innerHTML = availablePrompts.map(p => `
      <div class="toggle-group-available-entry" data-identifier="${p.identifier}" data-name="${p.name}">
        <span class="entry-name">${p.name}</span>
        <button class="menu_button entry-add-btn">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
    `).join('');

    // 绑定添加按钮
    const self = this;
    container.querySelectorAll('.entry-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.toggle-group-available-entry');
        const identifier = item?.dataset.identifier;
        const name = item?.dataset.name;
        if (!identifier || !name) return;

        const success = toggleGroupData.addPresetEntry(groupId, identifier, name);
        if (success) {
          toastr.success('已添加：' + name);
          item.remove();
          self.renderToggleGroupList();
          self.refreshEditPopupEntries(groupId);
        } else {
          toastr.warning('添加失败，可能已存在');
        }
      });
    });
  }

  /**
   * 加载世界书列表到下拉框
   * @param {HTMLElement} popupEl - 弹窗DOM元素
   */
  async loadWorldBookSelect(popupEl) {
    const select = popupEl.querySelector('#worldinfo-book-select');
    if (!select) return;

    try {
      const { world_names } = await import('../../../world-info.js');
      const worldList = world_names || [];

      if (worldList.length === 0) {
        select.innerHTML = '<option value="">没有世界书</option>';
        return;
      }

      let optionsHtml = '<option value="">-- 选择世界书 --</option>';
      worldList.forEach(name => {
        optionsHtml += `<option value="${name}">${name}</option>`;
      });
      select.innerHTML = optionsHtml;
    } catch (error) {
      logger.error('preset', '[ToggleGroup] 加载世界书列表失败:', error.message);
      select.innerHTML = '<option value="">加载失败</option>';
    }
  }

  /**
   * 加载指定世界书的条目
   * @param {string} groupId - 开关组ID
   * @param {HTMLElement} popupEl - 弹窗DOM元素
   * @param {string} worldName - 世界书名称
   */
  async loadWorldInfoEntriesForBook(groupId, popupEl, worldName) {
    const container = popupEl.querySelector('#worldinfo-entry-list');
    if (!container) return;

    container.innerHTML = '<p class="loading-hint"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</p>';

    try {
      const { loadWorldInfo } = await import('../../../world-info.js');
      const data = await loadWorldInfo(worldName);

      if (!data || !data.entries) {
        container.innerHTML = '<p class="toggle-group-empty-hint">该世界书没有条目</p>';
        return;
      }

      const group = toggleGroupData.getToggleGroupById(groupId);
      const existingKeys = new Set(
        group.entries.filter(e => e.type === 'worldinfo').map(e => `${e.worldName}:${e.uid}`)
      );

      const entries = [];
      for (const [uid, entry] of Object.entries(data.entries)) {
        const entryName = entry.comment || entry.key?.join(', ') || `条目${uid}`;
        const key = `${worldName}:${uid}`;

        if (!existingKeys.has(key)) {
          entries.push({
            worldName,
            uid: parseInt(uid),
            name: entryName,
            content: entry.content || ''
          });
        }
      }

      // 存储到临时变量供过滤使用
      this._worldInfoEntries = entries;

      // 渲染列表
      this.renderWorldInfoEntryItems(popupEl, entries, groupId);

    } catch (error) {
      logger.error('preset', '[ToggleGroup] 加载世界书条目失败:', error.message);
      container.innerHTML = '<p class="toggle-group-empty-hint">加载失败，请重试</p>';
    }
  }

  /**
   * 过滤世界书条目
   * @param {HTMLElement} popupEl - 弹窗DOM元素
   * @param {string} keyword - 搜索关键词
   */
  filterWorldInfoEntries(popupEl, keyword) {
    const allEntries = this._worldInfoEntries || [];
    const groupId = this._currentEditingGroupId;

    if (!keyword) {
      this.renderWorldInfoEntryItems(popupEl, allEntries, groupId);
      return;
    }

    const filtered = allEntries.filter(item => {
      return item.worldName.toLowerCase().includes(keyword) ||
             item.name.toLowerCase().includes(keyword) ||
             item.content.toLowerCase().includes(keyword);
    });

    this.renderWorldInfoEntryItems(popupEl, filtered, groupId);
  }

  /**
   * 渲染世界书条目列表项
   * @param {HTMLElement} popupEl - 弹窗DOM元素
   * @param {Array} entries - 条目数组
   * @param {string} groupId - 开关组ID
   */
  renderWorldInfoEntryItems(popupEl, entries, groupId) {
    const container = popupEl.querySelector('#worldinfo-entry-list');
    if (!container) return;

    if (entries.length === 0) {
      container.innerHTML = '<p class="toggle-group-empty-hint">没有可添加的世界书条目</p>';
      return;
    }

    container.innerHTML = entries.slice(0, 100).map(item => `
      <div class="toggle-group-available-entry"
           data-world-name="${item.worldName}"
           data-uid="${item.uid}"
           data-name="${item.name}">
        <span class="entry-name" title="${item.worldName}: ${item.name}">
          <span class="entry-world-tag">${item.worldName}</span>
          ${item.name}
        </span>
        <button class="menu_button entry-add-btn">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
    `).join('');

    if (entries.length > 100) {
      container.innerHTML += '<p class="toggle-group-empty-hint">显示前100条，请使用搜索缩小范围</p>';
    }

    // 绑定添加按钮
    const self = this;
    container.querySelectorAll('.entry-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.toggle-group-available-entry');
        const worldName = item?.dataset.worldName;
        const uid = parseInt(item?.dataset.uid);
        const name = item?.dataset.name;
        if (!worldName || isNaN(uid) || !name) return;

        const displayName = `${worldName}: ${name}`;
        const success = toggleGroupData.addWorldInfoEntry(groupId, worldName, uid, displayName);
        if (success) {
          toastr.success('已添加：' + name);
          item.remove();
          self.renderToggleGroupList();
          // 从临时数组中移除
          const idx = self._worldInfoEntries?.findIndex(e => e.worldName === worldName && e.uid === uid);
          if (idx !== undefined && idx >= 0) {
            self._worldInfoEntries.splice(idx, 1);
          }
          // 刷新编辑弹窗中的成员列表
          self.refreshEditPopupEntries(groupId);
        } else {
          toastr.warning('添加失败，可能已存在');
        }
      });
    });
  }

  /**
   * 刷新编辑弹窗中的成员列表
   * @param {string} groupId - 开关组ID
   */
  refreshEditPopupEntries(groupId) {
    const editPopup = document.querySelector('.toggle-group-edit-popup');
    if (!editPopup) return;

    const group = toggleGroupData.getToggleGroupById(groupId);
    if (!group) return;

    const entriesList = editPopup.querySelector('.toggle-group-entries-list');
    const countSpan = editPopup.querySelector('.toggle-group-entries-header span');

    if (countSpan) {
      countSpan.textContent = `组内成员 (${group.entries.length})`;
    }

    if (entriesList) {
      if (group.entries.length === 0) {
        entriesList.innerHTML = '<p class="toggle-group-empty-hint">还没有添加成员，点击上方按钮添加</p>';
      } else {
        entriesList.innerHTML = group.entries.map((entry, index) => `
          <div class="toggle-group-entry-item" data-index="${index}">
            <span class="toggle-group-entry-type ${entry.type}">
              ${entry.type === 'preset' ? '<i class="fa-solid fa-sliders"></i>' : '<i class="fa-solid fa-book"></i>'}
            </span>
            <span class="toggle-group-entry-name" title="${entry.displayName}">${entry.displayName}</span>
            <button class="toggle-group-entry-remove" title="移除">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
        `).join('');

        // 重新绑定移除按钮事件
        const self = this;
        entriesList.querySelectorAll('.toggle-group-entry-remove').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const item = e.target.closest('.toggle-group-entry-item');
            const index = parseInt(item?.dataset.index);
            if (!isNaN(index)) {
              toggleGroupData.removeEntry(groupId, index);
              toastr.info('已移除成员');
              self.refreshEditPopupEntries(groupId);
              self.renderToggleGroupList();
            }
          });
        });
      }
    }
  }

  // ========================================
  // 快速开关相关
  // ========================================

  /** @type {Object<string, boolean>} 快速开关列表中世界书分组的展开状态 */
  quickToggleGroupExpanded = {};

  /**
   * 获取世界书条目的显示名称（用于快速开关列表）
   * @param {Object} toggle - 世界书条目
   * @returns {string} 显示名称
   */
  getWorldInfoDisplayName(toggle) {
    // 优先使用别名
    if (toggle.displayAlias) {
      return toggle.displayAlias;
    }
    // 从原始名称中提取条目名（格式：世界书名: 条目名）
    const colonIndex = toggle.name.indexOf(': ');
    if (colonIndex !== -1) {
      return toggle.name.substring(colonIndex + 2);
    }
    return toggle.name;
  }

  /**
   * 渲染快速开关列表
   * @description 根据选中的预设加载快速开关，预设条目直接显示，世界书条目按世界书分组折叠显示
   */
  renderQuickToggleList() {
    const container = this.container?.querySelector('#quick-toggle-list-container');
    const countEl = this.container?.querySelector('#quick-toggle-count');
    if (!container) return;

    // 使用选中的预设（和快照列表保持一致）
    const selectedPreset = this.getSelectedPreset();
    const toggles = quickToggleData.getQuickTogglesWithState(selectedPreset);

    // 更新计数
    if (countEl) {
      countEl.textContent = `(${toggles.length})`;
    }

    // 获取搜索关键词
    const searchInput = this.container?.querySelector('#snapshot-search-input');
    const searchKeyword = searchInput?.value?.trim().toLowerCase() || '';

    // 过滤
    const filteredToggles = searchKeyword
      ? toggles.filter(t => t.name.toLowerCase().includes(searchKeyword))
      : toggles;

    // 空状态
    if (toggles.length === 0) {
      container.innerHTML = `
        <div class="quick-toggle-empty">
          <p>还没有添加快速开关</p>
          <button class="menu_button" id="quick-toggle-add-btn">
            <i class="fa-solid fa-plus"></i> 添加
          </button>
        </div>
      `;
      this.bindAddQuickToggleBtn();
      return;
    }

    // 搜索无结果
    if (filteredToggles.length === 0 && searchKeyword) {
      container.innerHTML = `
        <div class="quick-toggle-empty">
          <p style="opacity: 0.6;">没有匹配的快速开关</p>
        </div>
      `;
      return;
    }

    // 分离预设条目和世界书条目
    const presetToggles = filteredToggles.filter(t => t.type === 'preset');
    const worldInfoToggles = filteredToggles.filter(t => t.type === 'worldinfo');

    let listHtml = '';

    // 渲染预设条目（不分组）
    if (presetToggles.length > 0) {
      listHtml += presetToggles.map(toggle => `
        <div class="quick-toggle-item quick-toggle-preset" data-identifier="${toggle.identifier}">
          <span class="quick-toggle-name" title="${toggle.name}">${toggle.name}</span>
          <div class="quick-toggle-actions">
            <span class="quick-toggle-switch ${toggle.enabled ? 'on' : 'off'}"
                  title="${toggle.enabled ? '点击关闭' : '点击开启'}">
              <i class="fa-solid ${toggle.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
            </span>
            <button class="quick-toggle-remove-btn" title="移除">
              <i class="fa-solid fa-times"></i>
            </button>
          </div>
        </div>
      `).join('');
    }

    // 按世界书分组渲染世界书条目
    if (worldInfoToggles.length > 0) {
      // 按世界书名分组
      const worldInfoGroups = {};
      worldInfoToggles.forEach(t => {
        if (!worldInfoGroups[t.worldName]) {
          worldInfoGroups[t.worldName] = [];
        }
        worldInfoGroups[t.worldName].push(t);
      });

      // 渲染每个世界书分组
      Object.keys(worldInfoGroups).forEach(worldName => {
        const entries = worldInfoGroups[worldName];
        const isExpanded = this.quickToggleGroupExpanded[worldName] !== false; // 默认展开
        const groupId = `qt-wi-group-${worldName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        listHtml += `
          <div class="quick-toggle-wi-group" data-world-name="${worldName}">
            <div class="quick-toggle-wi-header ${isExpanded ? 'expanded' : ''}" data-group-id="${groupId}">
              <i class="fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} wi-group-icon"></i>
              <span class="wi-group-name">${worldName}</span>
              <span class="wi-group-count">(${entries.length})</span>
            </div>
            <div class="quick-toggle-wi-entries ${isExpanded ? '' : 'collapsed'}" id="${groupId}">
              ${entries.map(toggle => `
                <div class="quick-toggle-item quick-toggle-worldinfo"
                     data-world-name="${toggle.worldName}"
                     data-uid="${toggle.uid}">
                  <span class="quick-toggle-name" title="${toggle.name}">${this.getWorldInfoDisplayName(toggle)}</span>
                  <div class="quick-toggle-actions">
                    <button class="quick-toggle-edit-btn" title="编辑别名">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                    <span class="quick-toggle-switch ${toggle.enabled ? 'on' : 'off'}"
                          title="${toggle.enabled ? '点击关闭' : '点击开启'}">
                      <i class="fa-solid ${toggle.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                    </span>
                    <button class="quick-toggle-remove-btn" title="移除">
                      <i class="fa-solid fa-times"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = `
      ${listHtml}
      <button class="menu_button quick-toggle-add-inline" id="quick-toggle-add-btn">
        <i class="fa-solid fa-plus"></i> 添加
      </button>
    `;

    this.bindQuickToggleListEvents();
    this.bindAddQuickToggleBtn();
  }

  /**
   * 绑定快速开关列表事件
   * @description 绑定分组折叠、开关点击、编辑按钮、移除按钮事件
   */
  bindQuickToggleListEvents() {
    const container = this.container?.querySelector('#quick-toggle-list-container');
    if (!container) return;

    // 世界书分组折叠事件
    container.querySelectorAll('.quick-toggle-wi-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const worldName = header.closest('.quick-toggle-wi-group')?.dataset.worldName;
        const groupId = header.dataset.groupId;
        const entriesEl = document.getElementById(groupId);
        const icon = header.querySelector('.wi-group-icon');

        if (!entriesEl || !worldName) return;

        const isExpanded = header.classList.contains('expanded');

        if (isExpanded) {
          // 折叠
          header.classList.remove('expanded');
          entriesEl.classList.add('collapsed');
          icon?.classList.remove('fa-chevron-down');
          icon?.classList.add('fa-chevron-right');
          this.quickToggleGroupExpanded[worldName] = false;
        } else {
          // 展开
          header.classList.add('expanded');
          entriesEl.classList.remove('collapsed');
          icon?.classList.remove('fa-chevron-right');
          icon?.classList.add('fa-chevron-down');
          this.quickToggleGroupExpanded[worldName] = true;
        }
      });
    });

    // 预设条目开关点击
    container.querySelectorAll('.quick-toggle-preset .quick-toggle-switch').forEach(switchEl => {
      switchEl.addEventListener('click', async (e) => {
        const item = e.target.closest('.quick-toggle-item');
        const identifier = item?.dataset.identifier;
        if (!identifier) return;

        const newState = await quickToggleData.toggleState(identifier);
        if (newState !== null) {
          this.updateToggleSwitchUI(switchEl, newState);
        }
      });
    });

    // 世界书条目开关点击
    container.querySelectorAll('.quick-toggle-worldinfo .quick-toggle-switch').forEach(switchEl => {
      switchEl.addEventListener('click', async (e) => {
        const item = e.target.closest('.quick-toggle-item');
        const worldName = item?.dataset.worldName;
        const uid = parseInt(item?.dataset.uid, 10);
        if (!worldName || isNaN(uid)) return;

        const newState = await quickToggleData.toggleState(null, worldName, uid);
        if (newState !== null) {
          this.updateToggleSwitchUI(switchEl, newState);
        }
      });
    });

    // 世界书条目编辑按钮（编辑别名）
    container.querySelectorAll('.quick-toggle-worldinfo .quick-toggle-edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = e.target.closest('.quick-toggle-item');
        const worldName = item?.dataset.worldName;
        const uid = parseInt(item?.dataset.uid, 10);
        if (!worldName || isNaN(uid)) return;

        await this.showEditAliasPopup(worldName, uid);
      });
    });

    // 预设条目移除按钮
    container.querySelectorAll('.quick-toggle-preset .quick-toggle-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.quick-toggle-item');
        const identifier = item?.dataset.identifier;
        if (!identifier) return;

        quickToggleData.removeQuickToggle(identifier);
        this.renderQuickToggleList();
        toastr.info('已移除快速开关');
      });
    });

    // 世界书条目移除按钮
    container.querySelectorAll('.quick-toggle-worldinfo .quick-toggle-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.quick-toggle-item');
        const worldName = item?.dataset.worldName;
        const uid = parseInt(item?.dataset.uid, 10);
        if (!worldName || isNaN(uid)) return;

        quickToggleData.removeQuickToggle(null, worldName, uid);
        this.renderQuickToggleList();
        toastr.info('已移除快速开关');
      });
    });
  }

  /**
   * 显示编辑别名弹窗
   * @description 弹窗让用户修改世界书条目在悬浮菜单中的显示名称，不影响世界书本身
   * @param {string} worldName - 世界书名称
   * @param {number} uid - 条目uid
   */
  async showEditAliasPopup(worldName, uid) {
    // 获取当前别名
    const toggles = quickToggleData.getQuickToggles();
    const toggle = toggles.find(t => t.type === 'worldinfo' && t.worldName === worldName && t.uid === uid);
    if (!toggle) return;

    const currentAlias = toggle.displayAlias || '';
    // 从原始名称中提取条目名
    const colonIndex = toggle.name.indexOf(': ');
    const entryName = colonIndex !== -1 ? toggle.name.substring(colonIndex + 2) : toggle.name;

    // 用一个对象来存储输入值，因为弹窗关闭后DOM会被移除
    let inputValue = currentAlias;

    const popupHtml = `
      <div class="edit-alias-popup">
        <p style="margin:0 0 10px 0;font-size:0.9em;opacity:0.8;">
          <i class="fa-solid fa-info-circle"></i>
          修改的是悬浮菜单中的显示名称，不会影响世界书条目本身
        </p>
        <div style="margin-bottom:8px;">
          <label style="font-size:0.85em;opacity:0.7;">原始条目名：</label>
          <div style="padding:6px 10px;background:var(--SmartThemeBlurTintColor);border-radius:4px;font-size:0.9em;">${entryName}</div>
        </div>
        <div>
          <label style="font-size:0.85em;opacity:0.7;">悬浮菜单显示名（留空则显示原始条目名）：</label>
          <input type="text" class="text_pole" id="edit-alias-input" value="${currentAlias}" placeholder="输入自定义显示名...">
        </div>
      </div>
    `;

    // 在弹窗显示后绑定输入事件，实时记录输入值
    setTimeout(() => {
      const input = document.querySelector('#edit-alias-input');
      if (input) {
        input.addEventListener('input', (e) => {
          inputValue = e.target.value;
        });
      }
    }, 100);

    const result = await callGenericPopup(popupHtml, 1, '编辑显示名称');

    if (result) {
      const newAlias = inputValue.trim();
      quickToggleData.updateWorldInfoAlias(worldName, uid, newAlias);
      this.renderQuickToggleList();
      toastr.success(newAlias ? '已设置显示名称' : '已清除显示名称');
    }
  }

  /**
   * 更新开关UI状态
   * @param {Element} switchEl - 开关元素
   * @param {boolean} newState - 新状态
   */
  updateToggleSwitchUI(switchEl, newState) {
    const icon = switchEl.querySelector('i');
    if (newState) {
      switchEl.classList.remove('off');
      switchEl.classList.add('on');
      icon?.classList.remove('fa-toggle-off');
      icon?.classList.add('fa-toggle-on');
      switchEl.title = '点击关闭';
    } else {
      switchEl.classList.remove('on');
      switchEl.classList.add('off');
      icon?.classList.remove('fa-toggle-on');
      icon?.classList.add('fa-toggle-off');
      switchEl.title = '点击开启';
    }
  }

  /**
   * 绑定添加快速开关按钮
   */
  bindAddQuickToggleBtn() {
    const btn = this.container?.querySelector('#quick-toggle-add-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      this.showAddQuickTogglePopup();
    });
  }

  /**
   * 显示添加快速开关弹窗
   *
   * @description
   * 弹窗分两个标签页：预设条目和世界书条目。
   * - 预设条目：从当前预设的 prompt_order 获取，点击即可选中/取消
   * - 世界书条目：先用下拉框选择一个世界书，加载该世界书的所有条目（最多显示100条），
   *   搜索框用于实时过滤已加载的条目（匹配名称或内容）
   *
   * 保存逻辑（重要）：
   * - 收集选中项时，会检查原有列表是否已有该条目，有则保留原有对象（包含别名等属性）
   * - 如果用户没有切换到世界书标签页，则保留原有的世界书条目不动（避免误删）
   * - 这样编辑别名后再打开弹窗确认，别名不会丢失
   *
   * @async
   * @returns {Promise<void>}
   */
  async showAddQuickTogglePopup() {
    const availablePrompts = quickToggleData.getAvailablePrompts();
    const currentToggles = quickToggleData.getQuickToggles();

    // 构建预设条目列表
    const presetListHtml = availablePrompts.map(prompt => {
      const isAdded = currentToggles.some(t => t.type !== 'worldinfo' && t.identifier === prompt.identifier);
      return `
        <div class="quick-toggle-select-item ${isAdded ? 'selected' : ''}"
             data-type="preset"
             data-identifier="${prompt.identifier}"
             data-name="${prompt.name}">
          <span class="select-item-name">${prompt.name}</span>
          <span class="select-item-check">
            <i class="fa-solid ${isAdded ? 'fa-check-square' : 'fa-square'}"></i>
          </span>
        </div>
      `;
    }).join('');

    const htmlContent = `
      <div class="quick-toggle-select-popup">
        <!-- 标签页切换 -->
        <div class="quick-toggle-tabs">
          <button class="quick-toggle-tab active" data-tab="preset">预设条目</button>
          <button class="quick-toggle-tab" data-tab="worldinfo">世界书条目</button>
        </div>

        <!-- 预设条目标签页 -->
        <div class="quick-toggle-tab-content active" data-tab="preset">
          <div class="quick-toggle-select-list">
            ${presetListHtml || '<div style="text-align:center;padding:20px;opacity:0.6;">当前预设没有可用的条目</div>'}
          </div>
        </div>

        <!-- 世界书条目标签页 -->
        <div class="quick-toggle-tab-content" data-tab="worldinfo" style="display:none;">
          <select class="text_pole" id="quick-toggle-wi-select" style="margin-bottom:8px;">
            <option value="">-- 选择世界书 --</option>
          </select>
          <div class="quick-toggle-worldinfo-search">
            <input type="text" class="text_pole" placeholder="搜索过滤条目..." id="quick-toggle-wi-search">
          </div>
          <div class="quick-toggle-select-list" id="quick-toggle-wi-list">
            <div style="text-align:center;padding:20px;opacity:0.6;">请先选择世界书</div>
          </div>
        </div>
      </div>
    `;

    const $html = $(htmlContent);

    // 标签页切换
    $html.find('.quick-toggle-tab').on('click', function () {
      const tab = $(this).data('tab');
      $html.find('.quick-toggle-tab').removeClass('active');
      $(this).addClass('active');
      $html.find('.quick-toggle-tab-content').hide();
      $html.find(`.quick-toggle-tab-content[data-tab="${tab}"]`).show();

      // 切换到世界书标签页时加载世界书列表
      if (tab === 'worldinfo') {
        loadWorldBookList($html);
      }
    });

    // 预设条目点击事件
    $html.find('.quick-toggle-select-item[data-type="preset"]').on('click', function () {
      $(this).toggleClass('selected');
      const $icon = $(this).find('.select-item-check i');
      if ($(this).hasClass('selected')) {
        $icon.removeClass('fa-square').addClass('fa-check-square');
      } else {
        $icon.removeClass('fa-check-square').addClass('fa-square');
      }
    });

    // 世界书选择变化
    $html.find('#quick-toggle-wi-select').on('change', async function () {
      const worldName = $(this).val();
      if (!worldName) {
        $html.find('#quick-toggle-wi-list').html('<div style="text-align:center;padding:20px;opacity:0.6;">请先选择世界书</div>');
        return;
      }
      await loadWorldInfoEntries($html, worldName, currentToggles);
    });

    // 世界书搜索过滤
    $html.find('#quick-toggle-wi-search').on('input', function () {
      const keyword = $(this).val().trim().toLowerCase();
      filterWorldInfoEntries($html, keyword);
    });

    // 加载世界书列表
    async function loadWorldBookList($popup) {
      const $select = $popup.find('#quick-toggle-wi-select');
      if ($select.find('option').length > 1) return;  // 已加载过

      try {
        const { world_names } = await import('../../../world-info.js');
        const worldList = world_names || [];

        if (worldList.length === 0) {
          $select.html('<option value="">没有世界书</option>');
          return;
        }

        let optionsHtml = '<option value="">-- 选择世界书 --</option>';
        worldList.forEach(name => {
          optionsHtml += `<option value="${name}">${name}</option>`;
        });
        $select.html(optionsHtml);
      } catch (error) {
        $select.html('<option value="">加载失败</option>');
      }
    }

    // 加载世界书条目
    let allWorldInfoEntries = [];
    async function loadWorldInfoEntries($popup, worldName, existingToggles) {
      const $list = $popup.find('#quick-toggle-wi-list');
      $list.html('<div style="text-align:center;padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>');

      try {
        const { loadWorldInfo } = await import('../../../world-info.js');
        const data = await loadWorldInfo(worldName);
        if (!data || !data.entries) {
          $list.html('<div style="text-align:center;padding:20px;opacity:0.6;">该世界书没有条目</div>');
          return;
        }

        allWorldInfoEntries = [];
        for (const [uid, entry] of Object.entries(data.entries)) {
          const name = entry.comment || '未命名条目';
          allWorldInfoEntries.push({
            worldName,
            uid: parseInt(uid, 10),
            name,
            displayName: `${worldName}: ${name}`,
            content: entry.content || ''
          });
        }

        renderWorldInfoList($popup, allWorldInfoEntries, existingToggles);
      } catch (error) {
        $list.html('<div style="text-align:center;padding:20px;color:#ff6b6b;">加载失败</div>');
      }
    }

    // 过滤世界书条目
    function filterWorldInfoEntries($popup, keyword) {
      if (!keyword) {
        renderWorldInfoList($popup, allWorldInfoEntries, currentToggles);
        return;
      }
      const filtered = allWorldInfoEntries.filter(item =>
        item.name.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword)
      );
      renderWorldInfoList($popup, filtered, currentToggles);
    }

    // 渲染世界书条目列表
    function renderWorldInfoList($popup, entries, existingToggles) {
      const $list = $popup.find('#quick-toggle-wi-list');

      if (entries.length === 0) {
        $list.html('<div style="text-align:center;padding:20px;opacity:0.6;">没有匹配的条目</div>');
        return;
      }

      const listHtml = entries.slice(0, 100).map(item => {
        const isAdded = existingToggles.some(t => t.type === 'worldinfo' && t.worldName === item.worldName && t.uid === item.uid);
        return `
          <div class="quick-toggle-select-item ${isAdded ? 'selected' : ''}"
               data-type="worldinfo"
               data-world-name="${item.worldName}"
               data-uid="${item.uid}"
               data-name="${item.displayName}">
            <span class="select-item-name">${item.name}</span>
            <span class="select-item-check">
              <i class="fa-solid ${isAdded ? 'fa-check-square' : 'fa-square'}"></i>
            </span>
          </div>
        `;
      }).join('');

      $list.html(listHtml);

      if (entries.length > 100) {
        $list.append('<div style="text-align:center;padding:10px;opacity:0.6;font-size:0.9em;">显示前100条，请使用搜索缩小范围</div>');
      }

      // 绑定点击事件
      $list.find('.quick-toggle-select-item').on('click', function () {
        $(this).toggleClass('selected');
        const $icon = $(this).find('.select-item-check i');
        if ($(this).hasClass('selected')) {
          $icon.removeClass('fa-square').addClass('fa-check-square');
        } else {
          $icon.removeClass('fa-check-square').addClass('fa-square');
        }
      });
    }

    // 显示弹窗
    const result = await callGenericPopup($html, 1, '添加快速开关');

    if (result) {
      // 保留原有的条目，只更新用户操作过的部分
      const existingToggles = quickToggleData.getQuickToggles();
      const newToggles = [];

      // 收集预设条目（用户在预设标签页操作过，所以用弹窗中的选中状态）
      $html.find('.quick-toggle-select-item[data-type="preset"].selected').each(function () {
        const identifier = $(this).data('identifier');
        // 检查原有列表中是否有这个条目（保留原有属性）
        const existing = existingToggles.find(t => t.type === 'preset' && t.identifier === identifier);
        if (existing) {
          newToggles.push(existing);
        } else {
          newToggles.push({
            type: 'preset',
            identifier: identifier,
            name: $(this).data('name')
          });
        }
      });

      // 检查用户是否切换到过世界书标签页
      const worldInfoTabVisited = $html.find('#quick-toggle-wi-select option').length > 1;

      if (worldInfoTabVisited) {
        // 用户访问过世界书标签页，使用弹窗中的选中状态
        $html.find('.quick-toggle-select-item[data-type="worldinfo"].selected').each(function () {
          const worldName = $(this).data('world-name');
          const uid = $(this).data('uid');
          // 检查原有列表中是否有这个条目（保留别名等属性）
          const existing = existingToggles.find(t => t.type === 'worldinfo' && t.worldName === worldName && t.uid === uid);
          if (existing) {
            newToggles.push(existing);
          } else {
            newToggles.push({
              type: 'worldinfo',
              worldName: worldName,
              uid: uid,
              name: $(this).data('name')
            });
          }
        });
      } else {
        // 用户没有访问过世界书标签页，保留原有的世界书条目
        existingToggles.filter(t => t.type === 'worldinfo').forEach(t => {
          newToggles.push(t);
        });
      }

      quickToggleData.setQuickToggles(newToggles);
      this.renderQuickToggleList();
      toastr.success(`已更新快速开关，共 ${newToggles.length} 项`);
    }
  }

  // ========================================
  // 快照相关
  // ========================================

  /**
   * 渲染快照列表
   * @description
   * 快照功能关闭时直接返回并清空容器，确保“关闭 = 不可执行”。
   * 这样可以从渲染入口阻断后续操作按钮的创建，避免禁用状态仍触发增删改用逻辑。
   * @returns {void}
   */
  renderSnapshotList() {
    const container = this.container?.querySelector('#snapshot-list-container');
    const countEl = this.container?.querySelector('#snapshot-count');
    if (!container) return;
    if (!snapshotData.isEnabled()) {
      container.innerHTML = '';
      if (countEl) {
        countEl.textContent = '(0)';
      }
      logger.debug('preset', '[PresetManagerUI.renderSnapshotList] 快照功能已禁用，跳过列表渲染');
      return;
    }

    const selectedPreset = this.getSelectedPreset();
    const snapshots = snapshotData.getSnapshotList(selectedPreset);
    const lastAppliedId = snapshotData.getLastAppliedId();

    // 更新计数
    if (countEl) {
      countEl.textContent = `(${snapshots.length})`;
    }

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
          <span class="snapshot-item-name" title="${snapshot.name}">${snapshot.name}</span>
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
   *
   * @description
   * 快照禁用时不绑定任何操作事件，防止已有 DOM 或异步重渲染导致回调仍可触发。
   *
   * @returns {void}
   * @example
   * this.bindSnapshotListEvents();
   */
  bindSnapshotListEvents() {
    const container = this.container?.querySelector('#snapshot-list-container');
    if (!container) return;
    if (!snapshotData.isEnabled()) {
      logger.debug('preset', '[PresetManagerUI.bindSnapshotListEvents] 快照功能已禁用，跳过事件绑定');
      return;
    }

    // 应用按钮
    container.querySelectorAll('.snapshot-apply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.snapshot-item');
        const id = item?.dataset.id;
        if (id) {
          const success = snapshotData.applySnapshot(id);
          if (success) {
            toastr.success('快照已应用');
            this.renderSnapshotList(); // 刷新列表显示"上次应用"标记
          } else {
            toastr.error('应用快照失败');
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
            toastr.success('已重命名');
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
            toastr.info('已删除');
            this.renderSnapshotList();
          }
        }
      });
    });
  }

  // ========================================
  // 设置面板相关
  // ========================================

  /**
   * 绑定快照功能开关事件
   */
  bindSnapshotToggle() {
    const checkbox = this.container?.querySelector('#snapshot-enabled');
    if (!checkbox) return;

    checkbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      snapshotData.setEnabled(enabled);
      logger.info('preset', '[PresetManagerUI] 预设快照功能:', enabled ? '启用' : '禁用');

      if (enabled) {
        toastr.success('预设快照已启用');
        // 检查悬浮按钮是否启用，给出提示
        this.checkFloatingBtnStatus();
      } else {
        toastr.info('预设快照已禁用');
      }

      // 触发事件通知其他模块
      eventSource.emit('pawsSnapshotEnabledChanged', enabled);
      this.renderSnapshotList();
    });

    // 绑定弹窗样式滑块
    this.bindMenuStyleSliders();

    // 绑定帮助弹窗按钮
    this.bindInfoPopupBtn();

    // 绑定搜索框
    this.bindSearchBox();
  }

  /**
   * 绑定缝合器功能开关事件
   */
  bindStitchToggle() {
    const checkbox = this.container?.querySelector('#preset-stitch-enabled');
    if (!checkbox) return;

    checkbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      stitchData.setEnabled(enabled);
      logger.info('preset', '[PresetManagerUI] 预设缝合功能:', enabled ? '启用' : '禁用');

      // 更新按钮显示状态
      if (this.presetManager.stitch) {
        this.presetManager.stitch.setEnabled(enabled);
      }

      if (enabled) {
        toastr.success('预设缝合已启用');
      } else {
        toastr.info('预设缝合已禁用');
      }

      // 触发事件通知其他模块
      eventSource.emit('pawsStitchEnabledChanged', enabled);
    });
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
      const keyword = searchInput.value?.trim();

      // 搜索时强制展开所有分组
      if (keyword) {
        this.expandAllGroups();
      }

      // 刷新两个列表
      this.renderQuickToggleList();
      this.renderSnapshotList();
    });
  }

  /**
   * 展开所有折叠分组
   */
  expandAllGroups() {
    const headers = this.container?.querySelectorAll('.snapshot-collapsible-header');
    headers?.forEach(header => {
      const body = header.nextElementSibling;
      const icon = header.querySelector('.collapsible-icon');

      header.classList.add('expanded');
      body?.classList.remove('collapsed');
      icon?.classList.remove('fa-chevron-right');
      icon?.classList.add('fa-chevron-down');
    });
  }

  /**
   * 显示功能说明弹窗
   *
   * @description
   * 用 callGenericPopup 显示预设快照功能的使用说明，
   * 包括总开关、快速开关、预设快照三个功能的介绍。
   *
   * @returns {void}
   */
  showInfoPopup() {
    const content = `
      <div style="max-width: 450px; max-height: 70vh; overflow-y: auto; text-align: left;">
        <p style="margin-top: 0; opacity: 0.8;">这里提供三种快捷操作方式，都可以通过<strong>长按悬浮按钮</strong>快速访问。</p>

        <h4 style="margin-top: 12px; color: var(--SmartThemeQuoteColor);"><i class="fa-solid fa-layer-group"></i> 总开关</h4>
        <p>把多个条目打包成一个开关组，<strong>一键批量开启或关闭</strong>。</p>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 8px; border-radius: 5px; margin-bottom: 8px;">
          <strong>使用场景：</strong>比如把"开车相关"的5个预设条目+3个世界书条目组成一个总开关，需要时一键全开，不需要时一键全关。
        </div>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 8px; border-radius: 5px;">
          <strong>怎么用：</strong>在下方"总开关"区域点击添加，创建开关组后添加成员（预设条目或世界书条目），勾选"加入悬浮按钮菜单"即可在悬浮栏快速操作。
        </div>

        <h4 style="margin-top: 16px; color: var(--SmartThemeQuoteColor);"><i class="fa-solid fa-toggle-on"></i> 快速开关</h4>
        <p>把<strong>单个条目</strong>加入悬浮栏，直接点击开关。</p>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 8px; border-radius: 5px; margin-bottom: 8px;">
          <strong>使用场景：</strong>某个预设条目或世界书条目经常需要开关，但不想每次都打开设置页面找。
        </div>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 8px; border-radius: 5px;">
          <strong>怎么用：</strong>在下方"快速开关"区域点击添加，选择预设条目或世界书条目，添加后长按悬浮按钮即可快速开关。
        </div>

        <h4 style="margin-top: 16px; color: var(--SmartThemeQuoteColor);"><i class="fa-solid fa-camera"></i> 预设快照</h4>
        <p><strong>保存当前所有预设条目的开关状态</strong>，一键恢复。</p>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 8px; border-radius: 5px; margin-bottom: 8px;">
          <strong>使用场景：</strong>日常聊天用一套开关配置、开车用另一套、纯净模式又是一套。保存后随时切换。
        </div>
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent 90%); padding: 8px; border-radius: 5px;">
          <strong>怎么用：</strong>在预设页面底部点击 <i class="fa-solid fa-camera"></i> 按钮保存快照，长按悬浮按钮选择快照即可应用。
        </div>

        <h4 style="margin-top: 16px; color: var(--SmartThemeUnderlineColor);"><i class="fa-solid fa-lightbulb"></i> 小提示</h4>
        <ul style="margin: 0; padding-left: 20px; opacity: 0.9;">
          <li><strong>总开关</strong>适合批量控制一组相关条目</li>
          <li><strong>快速开关</strong>适合频繁单独开关的条目</li>
          <li><strong>预设快照</strong>适合保存整套配置方案</li>
        </ul>
      </div>
    `;

    // 使用 SillyTavern 的弹窗
    if (typeof callGenericPopup === 'function') {
      callGenericPopup(content, 1, '快捷操作使用说明');
    } else {
      // 备用：使用 alert
      alert('快捷操作：总开关批量控制、快速开关单个控制、预设快照保存整套配置');
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
        toastr.info('提示：长按悬浮按钮可快捷切换快照，建议同时启用悬浮按钮');
      }, 500);
    }
  }

  // ========================================
  // 预设选择器相关
  // ========================================

  /**
   * 绑定预设选择下拉框事件
   *
   * @description
   * 处理两个场景的预设切换：
   * 1. 设置面板内的下拉框切换 - 刷新快速开关和快照列表
   * 2. SillyTavern 主界面的预设选择器切换 - 同步刷新设置面板
   */
  bindPresetSelector() {
    const select = this.container?.querySelector('#snapshot-preset-select');
    if (!select) return;

    // 点击时刷新预设列表（每次点击都重新扫描）
    select.addEventListener('focus', () => {
      this.refreshPresetSelector();
    });

    // 选择变化时刷新两个列表
    select.addEventListener('change', () => {
      this.refreshAllLists();
    });

    // 监听 SillyTavern 主界面的预设切换
    const mainPresetSelect = document.querySelector('#settings_preset_openai');
    if (mainPresetSelect) {
      mainPresetSelect.addEventListener('change', () => {
        // 延迟一点等待 SillyTavern 内部状态更新
        setTimeout(() => {
          this.refreshPresetSelector();
          this.refreshAllLists();
        }, 100);
      });
    }

    // 初始填充
    this.refreshPresetSelector();
  }

  /**
   * 刷新所有列表（快速开关 + 快照）
   * @description 统一刷新方法，确保两个列表同步更新
   */
  refreshAllLists() {
    this.renderQuickToggleList();
    this.renderSnapshotList();
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
          toastr.info(`已删除预设"${presetName}"的 ${count} 个快照`);
          this.refreshPresetSelector();
        }
        break; // 一次只处理一个
      }
    }
  }

  // ========================================
  // 工具函数
  // ========================================

  /**
   * 获取当前选中的预设名称
   */
  getSelectedPreset() {
    const select = this.container?.querySelector('#snapshot-preset-select');
    return select?.value || snapshotData.getCurrentPresetName();
  }

  /**
   * 显示消息提示
   * @param {string} message - 消息内容
   * @param {string} type - 消息类型：success/warning/error/info
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
   *
   * @description
   * 必须手动移除 eventSource 监听，浏览器不会自动清理事件总线回调。
   *
   * @returns {void}
   */
  destroy() {
    if (this._handlers.onPresetEnabledChanged) {
      eventSource.removeListener('pawsPresetEnabledChanged', this._handlers.onPresetEnabledChanged);
      this._handlers.onPresetEnabledChanged = null;
    }

    if (this._handlers.onSnapshotSaved) {
      eventSource.removeListener('pawsSnapshotSaved', this._handlers.onSnapshotSaved);
      this._handlers.onSnapshotSaved = null;
    }
  }
}
