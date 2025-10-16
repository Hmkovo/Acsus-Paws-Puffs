/**
 * 字体管理器 - UI 界面
 * 
 * @description
 * 负责字体管理的所有 UI 交互和渲染：
 * - 渲染字体列表（支持搜索、筛选、分页）
 * - 渲染标签管理界面
 * - 处理用户操作（添加、删除、编辑、导入导出）
 * - 监听 FontManager 的事件并刷新 UI
 * 
 * 采用事件驱动架构，与 FontManager 通过 eventSource 通信
 */

import { eventSource } from "../../../../script.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";
import logger from './logger.js';

export class FontManagerUI {
  /**
   * 构造函数
   * 
   * @description
   * 初始化 UI 管理器并保存 FontManager 实例引用
   * uiState 保存所有 UI 状态（搜索、筛选、分页、展开等）
   * 
   * @param {Object} fontManager - 字体管理器核心实例
   */
  constructor(fontManager) {
    // 字体管理器实例
    this.fontManager = fontManager;

    // 容器元素
    this.container = null;

    // UI状态
    this.uiState = {
      fontSearchQuery: '',         // 搜索关键词
      fontFilterTag: 'all',        // 筛选标签
      fontSortBy: 'name',          // 排序方式
      fontAddExpanded: false,      // 添加区域展开状态
      expandedFonts: new Set(),    // 展开的字体项
      importMergeMode: true,       // 导入模式（合并/替换）
      tagManagerExpanded: false,   // 标签管理展开状态
      fontListExpanded: true,      // 字体库展开状态
      fontCurrentPage: 1,          // 字体列表当前页
      fontPageSize: 20,            // 字体列表每页显示数量
      tagCurrentPage: 1,           // 标签列表当前页
      tagPageSize: 10,             // 标签列表每页显示数量
      batchDeleteMode: false,      // 批量删除模式
      selectedFontsForDelete: new Set()  // 选中待删除的字体
    };
  }

  /**
   * 初始化 UI
   * 
   * @description
   * 在指定容器中渲染字体管理界面并绑定事件：
   * 1. 保存容器引用
   * 2. 调用 render() 生成 HTML
   * 3. 调用 bindEvents() 绑定交互事件
   * 
   * @async
   * @param {HTMLElement} container - UI 容器元素（由 index.js 传入）
   */
  async init(container) {
    if (!container) {
      logger.warn('[FontManagerUI.init] 容器元素不存在');
      return;
    }

    logger.debug('[FontManagerUI.init] 初始化字体管理UI');
    this.container = container;
    this.render();
    this.bindEvents();
    logger.debug('[FontManagerUI.init] 初始化完成');
  }

  /**
   * 渲染 UI 界面
   * 
   * @description
   * 生成完整的字体管理 HTML 结构：
   * - 字体功能开关
   * - 添加新字体区域（可折叠）
   * - 工具栏（搜索、筛选、导入导出）
   * - 字体库列表（可折叠、支持分页）
   * - 标签管理（可折叠、支持分页）
   * 
   * 渲染完成后自动调用 refresh 方法更新数据显示
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="enhanced-section font-manager-section">
        <!-- 字体功能开关 -->
        <div class="font-enable-section-compact">
          <label class="checkbox_label">
            <input type="checkbox" id="font-enabled" ${this.fontManager.fontEnabled ? 'checked' : ''}>
            <span>启用字体功能</span>
            <span class="hint-inline">关闭后将使用系统默认字体设置</span>
          </label>
        </div>
        
        <!-- 添加新字体区域 -->
        <div class="font-add-section">
          <div class="font-add-header" id="font-add-toggle">
            <h4>+ 添加新字体</h4>
            <i class="fa fa-chevron-${this.uiState.fontAddExpanded ? 'up' : 'down'}" id="font-add-icon"></i>
          </div>
          <div class="font-add-content" id="font-add-content" style="${this.uiState.fontAddExpanded ? '' : 'display: none;'}">
            <!-- 字体网站链接 -->
            <div style="margin-bottom: 8px; padding: 6px 10px; background: color-mix(in srgb, var(--SmartThemeBodyColor) 5%, var(--SmartThemeBlurTintColor) 95%); border-radius: 4px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-globe" style="color: var(--SmartThemeBodyColor); opacity: 0.7;"></i>
                <a href="https://fonts.zeoseven.com/browse/" target="_blank" style="color: var(--SmartThemeBodyColor); text-decoration: underline; flex: 1;">
                  前往字体网站浏览和选择字体
                </a>
              </div>
            </div>
            
            <textarea id="font-input" placeholder='支持多种格式：
1. 完整字体代码：
@import url("https://fontsapi.zeoseven.com/256/main/result.css");
body {
    font-family: "Huiwen-mincho";
}

2. 仅@import链接（需填写自定义名称）：
@import url("https://fontsapi.zeoseven.com/119/main/result.css");' rows="5"></textarea>
            <div class="font-add-controls">
              <input type="text" id="font-name-input" placeholder="自定义字体名称（某些格式必填）" class="text_pole">
              <button id="add-font-btn" class="menu_button compact-btn">
                + 添加
              </button>
            </div>
          </div>
        </div>
        
        <!-- 工具栏 -->
        <div class="font-toolbar">
          <div class="toolbar-left">
            <input type="text" id="font-search" placeholder="搜索..." class="text_pole compact" value="${this.uiState.fontSearchQuery}">
            <select id="font-tag-filter" class="text_pole compact">
              <option value="all">所有标签</option>
              <option value="untagged">未分类</option>
            </select>
          </div>
          <div class="toolbar-right">
            ${this.uiState.batchDeleteMode ? `
              <!-- 批量删除模式激活后的按钮 -->
              <span id="batch-delete-hint" style="margin-right: 8px; color: var(--SmartThemeBodyColor); opacity: 0.8;">
                已选中 <strong id="batch-delete-count">0</strong> 个字体
              </span>
              <button id="font-batch-confirm-btn" class="menu_button compact danger" title="确认删除">
                <i class="fa fa-check"></i> 确认删除
              </button>
              <button id="font-batch-cancel-btn" class="menu_button compact" title="取消">
                <i class="fa fa-times"></i> 取消
              </button>
            ` : `
              <!-- 普通模式的按钮 -->
              <button id="font-guide-btn" class="menu_button compact icon-only" title="使用指南">
                <i class="fa fa-question-circle"></i>
              </button>
              <label class="checkbox_label compact-checkbox">
                <input type="checkbox" id="import-merge" ${this.uiState.importMergeMode ? 'checked' : ''}>
                <span>合并</span>
              </label>
              <button id="font-import-btn" class="menu_button compact icon-only" title="导入">
                <i class="fa fa-download"></i>
              </button>
              <button id="font-export-btn" class="menu_button compact icon-only" title="导出">
                <i class="fa fa-upload"></i>
              </button>
              <button id="font-batch-delete-btn" class="menu_button compact icon-only" title="批量删除">
                <i class="fa fa-tasks"></i>
              </button>
              <button id="font-clear-all-btn" class="menu_button compact icon-only danger" title="清空所有字体">
                <i class="fa fa-trash"></i>
              </button>
            `}
          </div>
        </div>
        
        <!-- 字体库 -->
        <div class="font-warehouse-section">
          <div class="font-warehouse-header" id="font-warehouse-toggle">
            <h4>˚₊·⸅ 字体小仓库 ⸅·₊˚</h4>
            <i class="fa fa-chevron-${this.uiState.fontListExpanded ? 'up' : 'down'}" id="font-warehouse-icon"></i>
          </div>
          <div class="font-warehouse-content" id="font-warehouse-content" style="${this.uiState.fontListExpanded ? '' : 'display: none;'}">
            <div class="font-list-container">
              <!-- 批量删除模式：全选复选框 -->
              ${this.uiState.batchDeleteMode ? `
                <div class="batch-select-all-container">
                  <label class="checkbox_label">
                    <input type="checkbox" id="batch-select-all-checkbox">
                    <span>全选当前页</span>
                  </label>
                </div>
              ` : ''}
              
              <div id="font-list" class="font-list">
                <!-- 字体项会动态生成 -->
              </div>
              
              <!-- 空状态提示 -->
              <div class="font-empty-state" style="display: none;">
                <i class="fa fa-font fa-2x"></i>
                <p>还没有添加任何字体</p>
                <p class="hint">点击上方"添加新字体"开始使用</p>
              </div>
              
              <!-- 字体列表分页导航 -->
              <div id="font-pagination" class="pagination-container"></div>
            </div>
          </div>
        </div>
        
        <!-- 标签管理 -->
        <div class="tag-manager-section-compact">
          <div class="tag-manager-header" id="tag-manager-toggle">
            <h4><i class="fa fa-tags"></i> 标签管理</h4>
            <i class="fa fa-chevron-${this.uiState.tagManagerExpanded ? 'up' : 'down'}" id="tag-manager-icon"></i>
          </div>
          <div class="tag-manager-content-compact" id="tag-manager-content" style="${this.uiState.tagManagerExpanded ? '' : 'display: none;'}">
            <div id="tag-manager-list" class="tag-manager-list">
              <!-- 标签项会动态生成 -->
            </div>
            <div class="tag-manager-empty" style="display: none;">
              <p class="hint">暂无标签</p>
            </div>
            
            <!-- 标签管理分页导航 -->
            <div id="tag-pagination" class="pagination-container"></div>
          </div>
        </div>
        
        <!-- 隐藏的文件选择器 -->
        <input type="file" id="font-import-file" accept=".json" style="display: none;">
      </div>
    `;

    this.refreshFontList();
    this.refreshTagManager();
    this.updateTagFilter();
  }

  /**
   * 绑定 UI 事件
   * 
   * @description
   * 为所有交互元素绑定事件监听器：
   * 1. 字体功能开关（change 事件）
   * 2. 折叠区域切换（click 事件）
   * 3. 添加字体按钮（click 事件）
   * 4. 搜索和筛选（input/change 事件）
   * 5. 导入导出按钮（click 事件）
   * 6. 清空所有字体按钮（click 事件，含确认）
   * 7. 监听 FontManager 的事件（pawsFontAdded 等）
   */
  bindEvents() {
    // 字体功能开关
    const fontEnabledCheckbox = this.container.querySelector('#font-enabled');
    if (fontEnabledCheckbox) {
      fontEnabledCheckbox.addEventListener('change', async (e) => {
        await this.fontManager.setEnabled(e.target.checked);
      });
    }

    // 添加字体区域折叠
    const toggleBtn = this.container.querySelector('#font-add-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const content = this.container.querySelector('#font-add-content');
        const icon = this.container.querySelector('#font-add-icon');

        this.uiState.fontAddExpanded = !this.uiState.fontAddExpanded;
        content.style.display = this.uiState.fontAddExpanded ? 'block' : 'none';
        icon.className = `fa fa-chevron-${this.uiState.fontAddExpanded ? 'up' : 'down'}`;
      });
    }

    // 字体库折叠
    const warehouseToggle = this.container.querySelector('#font-warehouse-toggle');
    if (warehouseToggle) {
      warehouseToggle.addEventListener('click', () => {
        const content = this.container.querySelector('#font-warehouse-content');
        const icon = this.container.querySelector('#font-warehouse-icon');

        this.uiState.fontListExpanded = !this.uiState.fontListExpanded;
        content.style.display = this.uiState.fontListExpanded ? 'block' : 'none';
        icon.className = `fa fa-chevron-${this.uiState.fontListExpanded ? 'up' : 'down'}`;

        if (this.uiState.fontListExpanded) {
          this.refreshFontList();
        }
      });
    }

    // 标签管理折叠
    const tagManagerToggle = this.container.querySelector('#tag-manager-toggle');
    if (tagManagerToggle) {
      tagManagerToggle.addEventListener('click', () => {
        const content = this.container.querySelector('#tag-manager-content');
        const icon = this.container.querySelector('#tag-manager-icon');

        this.uiState.tagManagerExpanded = !this.uiState.tagManagerExpanded;
        content.style.display = this.uiState.tagManagerExpanded ? 'block' : 'none';
        icon.className = `fa fa-chevron-${this.uiState.tagManagerExpanded ? 'up' : 'down'}`;

        if (this.uiState.tagManagerExpanded) {
          this.refreshTagManager();
        }
      });
    }

    // 添加字体按钮
    const addFontBtn = this.container.querySelector('#add-font-btn');
    if (addFontBtn) {
      addFontBtn.addEventListener('click', () => this.handleAddFont());
    }

    // 搜索框（搜索时重置到第1页）
    const searchInput = this.container.querySelector('#font-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.uiState.fontSearchQuery = e.target.value;
        this.uiState.fontCurrentPage = 1; // 重置到第1页
        this.refreshFontList();
      });
    }

    // 标签筛选（筛选时重置到第1页）
    const tagFilter = this.container.querySelector('#font-tag-filter');
    if (tagFilter) {
      tagFilter.addEventListener('change', (e) => {
        this.uiState.fontFilterTag = e.target.value;
        this.uiState.fontCurrentPage = 1; // 重置到第1页
        this.refreshFontList();
      });
    }

    // 导入按钮
    const importBtn = this.container.querySelector('#font-import-btn');
    const importFile = this.container.querySelector('#font-import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImportFile(e));
    }

    // 导出按钮
    const exportBtn = this.container.querySelector('#font-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExportFonts());
    }

    // 清空所有字体
    const clearAllBtn = this.container.querySelector('#font-clear-all-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async () => {
        const confirmed = await callGenericPopup(
          '确定要清空所有字体吗？此操作不可恢复！',
          POPUP_TYPE.CONFIRM,
          '',
          { okButton: '确认清空', cancelButton: '取消' }
        );

        if (confirmed) {
          await this.fontManager.clearAllFonts();
          this.refreshFontList();
          toastr.success('已清空所有字体');
        }
      });
    }

    // 批量删除按钮
    const batchDeleteBtn = this.container.querySelector('#font-batch-delete-btn');
    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener('click', () => {
        this.toggleBatchDeleteMode(true);
      });
    }

    // 批量删除确认按钮
    const batchConfirmBtn = this.container.querySelector('#font-batch-confirm-btn');
    if (batchConfirmBtn) {
      batchConfirmBtn.addEventListener('click', async () => {
        await this.executeBatchDelete();
      });
    }

    // 批量删除取消按钮
    const batchCancelBtn = this.container.querySelector('#font-batch-cancel-btn');
    if (batchCancelBtn) {
      batchCancelBtn.addEventListener('click', () => {
        this.toggleBatchDeleteMode(false);
      });
    }

    // 全选当前页复选框
    const selectAllCheckbox = this.container.querySelector('#batch-select-all-checkbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.currentTarget.checked;

        // 获取当前页显示的所有字体复选框
        this.container.querySelectorAll('.batch-delete-font-checkbox').forEach(checkbox => {
          checkbox.checked = checked;
          const fontName = checkbox.dataset.font;

          if (checked) {
            this.uiState.selectedFontsForDelete.add(fontName);
          } else {
            this.uiState.selectedFontsForDelete.delete(fontName);
          }
        });

        // 更新选中数量显示并刷新列表（已选中的字体会置顶）
        this.updateBatchDeleteCount();
        this.refreshFontList();
      });
    }

    // 使用指南按钮
    const guideBtn = this.container.querySelector('#font-guide-btn');
    if (guideBtn) {
      guideBtn.addEventListener('click', () => this.showGuide());
    }

    // 监听字体管理器的事件
    eventSource.on('pawsFontAdded', () => this.refreshFontList());
    eventSource.on('pawsFontRemoved', () => this.refreshFontList());
    eventSource.on('pawsFontUpdated', () => this.refreshFontList());
    eventSource.on('pawsFontTagsChanged', () => {
      this.refreshTagManager();
      this.updateTagFilter();
    });
  }

  /**
   * 处理添加字体操作
   * 
   * @description
   * 用户点击"添加"按钮后的处理流程：
   * 1. 读取输入框的 CSS 代码和自定义名称
   * 2. 如果只有 import 没有 font-family，强制要求输入自定义名称
   * 3. 调用 fontManager.parseFont() 解析字体数据
   * 4. 调用 fontManager.addFont() 添加到管理器
   * 5. 添加成功后自动应用该字体
   * 6. 清空输入框并刷新列表
   * 
   * @async
   */
  async handleAddFont() {
    const input = this.container.querySelector('#font-input').value.trim();
    const customName = this.container.querySelector('#font-name-input').value.trim();

    if (!input) {
      logger.warn('[FontManagerUI.handleAddFont] 用户未输入字体代码');
      toastr.warning('请输入字体代码');
      return;
    }

    logger.debug('[FontManagerUI.handleAddFont] 开始添加字体，自定义名称:', customName || '无');

    // 解析字体
    let fontData = null;

    // 检查是否只有@import（没有font-family）
    if (input.includes('@import') && !input.includes('font-family')) {
      if (!customName) {
        logger.warn('[FontManagerUI.handleAddFont] 仅包含@import但未提供自定义名称');
        toastr.warning('检测到仅包含@import链接，请输入自定义字体名称');
        return;
      }

      fontData = this.fontManager.parseFont(input, customName);
      if (fontData) {
        fontData.css = `${input}\nbody { font-family: "${customName}"; }`;
        fontData.fontFamily = customName;
      }
    } else {
      fontData = this.fontManager.parseFont(input, customName);
    }

    if (!fontData) {
      logger.warn('[FontManagerUI.handleAddFont] 解析字体失败，输入:', input.substring(0, 100) + '...');
      toastr.error('无法解析字体代码，请检查格式');
      return;
    }

    // 添加字体
    const success = await this.fontManager.addFont(fontData);

    if (success) {
      // 清空输入
      this.container.querySelector('#font-input').value = '';
      this.container.querySelector('#font-name-input').value = '';

      // 自动应用
      await this.fontManager.setCurrentFont(fontData.name);

      this.refreshFontList();
      logger.info('[FontManagerUI.handleAddFont] 字体添加成功:', fontData.name);
      toastr.success('字体添加成功');
    } else {
      logger.warn('[FontManagerUI.handleAddFont] 字体添加失败:', fontData.name);
      toastr.error('字体添加失败，可能已存在同名字体');
    }
  }

  /**
   * 处理导入文件操作
   * 
   * @description
   * 用户选择 JSON 文件后的处理流程：
   * 1. 读取文件内容
   * 2. 检查导入模式（合并/替换）
   * 3. 调用 fontManager.importFonts() 导入
   * 4. 显示导入结果（成功数量和模式）
   * 5. 刷新字体列表
   * 
   * @async
   * @param {Event} event - 文件选择事件
   */
  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) {
      logger.debug('[FontManagerUI.handleImportFile] 用户取消选择文件');
      return;
    }

    const mergeCheckbox = this.container.querySelector('#import-merge');
    const merge = mergeCheckbox ? mergeCheckbox.checked : true;

    logger.debug('[FontManagerUI.handleImportFile] 开始导入文件:', file.name, '大小:', file.size, '字节, 模式:', merge ? '合并' : '替换');

    try {
      const text = await file.text();
      const count = await this.fontManager.importFonts(text, merge);

      const modeText = merge ? '增加' : '覆盖';
      logger.info('[FontManagerUI.handleImportFile] 导入成功:', count, '个字体，文件:', file.name);
      toastr.success(`成功导入 ${count} 个字体（${modeText}模式）`);

      event.target.value = '';
      this.refreshFontList();
    } catch (error) {
      logger.error('[FontManagerUI.handleImportFile] 导入失败:', error.message || error);
      toastr.error('导入失败: ' + error.message);
      event.target.value = '';
    }
  }

  /**
   * 处理导出字体操作
   * 
   * @description
   * 将所有字体配置导出为 JSON 文件：
   * 1. 调用 fontManager.exportFonts() 生成 JSON 数据
   * 2. 创建 Blob 对象
   * 3. 触发浏览器下载（文件名包含日期）
   * 4. 显示成功提示
   */
  handleExportFonts() {
    const fontCount = this.fontManager.fonts.size;
    logger.debug('[FontManagerUI.handleExportFonts] 开始导出', fontCount, '个字体');

    const data = this.fontManager.exportFonts();

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `paws-puffs-fonts-${new Date().toISOString().split('T')[0]}.json`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    logger.info('[FontManagerUI.handleExportFonts] 导出成功:', fontCount, '个字体，文件名:', filename);
    toastr.success('字体配置已导出');
  }

  /**
   * 刷新字体列表
   * 
   * @description
   * 根据当前状态（搜索、筛选、排序、分页）渲染字体列表：
   * 1. 从 fontManager 获取字体数据
   * 2. 应用搜索过滤（匹配字体名、显示名、标签）
   * 3. 应用标签筛选（all/untagged/具体标签）
   * 4. 排序（name/date/custom）
   * 5. 当前字体置顶
   * 6. 分页处理
   * 7. 渲染字体项 HTML
   * 8. 绑定字体项事件
   * 9. 渲染分页导航
   * 
   * 搜索或筛选时会重置到第1页
   */
  refreshFontList() {
    const fontList = this.container.querySelector('#font-list');
    const emptyState = this.container.querySelector('.font-empty-state');

    if (!fontList) return;

    // 获取字体列表
    let fonts = this.fontManager.getAllFonts(this.uiState.fontFilterTag);

    // 搜索过滤
    if (this.uiState.fontSearchQuery) {
      const query = this.uiState.fontSearchQuery.toLowerCase();
      fonts = fonts.filter(font =>
        font.name.toLowerCase().includes(query) ||
        font.displayName.toLowerCase().includes(query) ||
        (font.tags && font.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    // 排序
    fonts.sort((a, b) => {
      switch (this.uiState.fontSortBy) {
        case 'name':
          return a.displayName.localeCompare(b.displayName);
        case 'date':
          return new Date(b.addedAt) - new Date(a.addedAt);
        case 'custom':
          return (a.order || 0) - (b.order || 0);
        default:
          return 0;
      }
    });

    // 当前字体置顶（普通模式）
    const currentFontName = this.fontManager.currentFont;
    if (currentFontName && !this.uiState.batchDeleteMode) {
      const currentFontIndex = fonts.findIndex(font => font.name === currentFontName);
      if (currentFontIndex > 0) {
        const currentFont = fonts.splice(currentFontIndex, 1)[0];
        fonts.unshift(currentFont);
      }
    }

    // 批量删除模式：已选中的字体置顶
    if (this.uiState.batchDeleteMode && this.uiState.selectedFontsForDelete.size > 0) {
      const selectedFonts = [];
      const unselectedFonts = [];

      fonts.forEach(font => {
        if (this.uiState.selectedFontsForDelete.has(font.name)) {
          selectedFonts.push(font);
        } else {
          unselectedFonts.push(font);
        }
      });

      // 重新组合：已选中的在前，未选中的在后
      fonts = [...selectedFonts, ...unselectedFonts];
    }

    // 显示空状态或字体列表
    if (fonts.length === 0) {
      fontList.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      this.renderFontPagination(0, 0);
    } else {
      if (emptyState) emptyState.style.display = 'none';

      // 分页逻辑
      const totalFonts = fonts.length;
      const totalPages = Math.ceil(totalFonts / this.uiState.fontPageSize);

      // 确保当前页不超出范围
      if (this.uiState.fontCurrentPage > totalPages) {
        this.uiState.fontCurrentPage = totalPages || 1;
      }

      // 计算当前页显示的字体
      const startIndex = (this.uiState.fontCurrentPage - 1) * this.uiState.fontPageSize;
      const endIndex = startIndex + this.uiState.fontPageSize;
      const displayFonts = fonts.slice(startIndex, endIndex);

      // 渲染字体列表
      fontList.innerHTML = displayFonts.map(font => this.createFontItem(font)).join('');

      // 绑定字体项事件
      this.bindFontItemEvents();

      // 渲染分页导航
      this.renderFontPagination(totalFonts, totalPages);
    }
  }

  /**
   * 创建字体项 HTML
   * 
   * @description
   * 为单个字体生成完整的 HTML 结构：
   * - 主信息行：字体名称、标签、操作按钮（使用、编辑、删除）
   * - 详情区域（可展开）：
   *   - 当前标签列表（可删除单个标签）
   *   - 添加新标签（输入框 + 按钮）
   *   - 现有标签复选框（批量添加）
   * 
   * @param {Object} font - 字体数据对象
   * @returns {string} 字体项的 HTML 字符串
   */
  createFontItem(font) {
    const isCurrent = this.fontManager.currentFont === font.name;
    const isExpanded = this.uiState.expandedFonts.has(font.name);
    const isSelected = this.uiState.selectedFontsForDelete.has(font.name);

    const tagsHtml = font.tags && font.tags.length > 0
      ? font.tags.map(tag => `<span class="font-tag">${tag}</span>`).join('')
      : '<span class="font-tag-empty">无标签</span>';

    // 所有标签的复选框
    const allTags = Array.from(this.fontManager.tags);
    const tagCheckboxes = allTags.map(tag => `
      <label class="tag-checkbox">
        <input type="checkbox" value="${tag}" ${font.tags && font.tags.includes(tag) ? 'checked' : ''}>
        <span>${tag}</span>
      </label>
    `).join('');

    // 当前字体的标签列表
    const currentTagsList = font.tags && font.tags.length > 0
      ? font.tags.map(tag => `
        <div class="tag-item">
          <span>${tag}</span>
          <button class="remove-tag-btn" data-font="${font.name}" data-tag="${tag}">×</button>
        </div>
      `).join('')
      : '<div class="no-tags">暂无标签</div>';

    return `
      <div class="font-item ${isCurrent ? 'current' : ''} ${isExpanded ? 'expanded' : ''} ${this.uiState.batchDeleteMode ? 'batch-mode' : ''}" 
           data-font-name="${font.name}">
        
        <!-- 主信息行 -->
        <div class="font-item-main">
          ${this.uiState.batchDeleteMode ? `
            <!-- 批量删除模式：勾选框 -->
            <label class="batch-delete-checkbox">
              <input type="checkbox" class="batch-delete-font-checkbox" data-font="${font.name}" ${isSelected ? 'checked' : ''}>
            </label>
          ` : ''}
          
          <div class="font-item-header" data-font="${font.name}" ${this.uiState.batchDeleteMode ? 'style="cursor: default;"' : ''}>
            ${this.uiState.batchDeleteMode ? '' : `<i class="fa fa-chevron-${isExpanded ? 'up' : 'down'} expand-icon"></i>`}
            <span class="font-item-name">
              ${font.displayName || font.name}
              ${isCurrent ? ' <span class="current-badge">✔</span>' : ''}
            </span>
            <div class="font-item-tags">
              ${tagsHtml}
            </div>
          </div>
          
          ${this.uiState.batchDeleteMode ? '' : `
            <div class="font-item-actions">
              <button class="font-action-btn font-use-btn" data-font="${font.name}" title="使用">
                <i class="fa fa-check"></i>
              </button>
              <button class="font-action-btn font-edit-btn" data-font="${font.name}" title="编辑名称">
                <i class="fa fa-edit"></i>
              </button>
              <button class="font-action-btn font-delete-btn" data-font="${font.name}" title="删除">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          `}
        </div>
        
        <!-- 展开的详情区域（批量删除模式下隐藏） -->
        <div class="font-item-details" style="display: ${!this.uiState.batchDeleteMode && isExpanded ? 'block' : 'none'};">
          <div class="tag-editor">
            <div class="tag-section">
              <h6>当前标签</h6>
              <div class="current-tags">
                ${currentTagsList}
              </div>
            </div>
            
            <div class="tag-section">
              <h6>添加标签</h6>
              <div class="tag-input-group">
                <input type="text" class="tag-new-input" placeholder="输入新标签" data-font="${font.name}">
                <button class="add-new-tag-btn" data-font="${font.name}">添加</button>
              </div>
              
              ${allTags.length > 0 ? `
                <div class="existing-tags">
                  ${tagCheckboxes}
                </div>
                <button class="apply-tags-btn" data-font="${font.name}">应用选中标签</button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定字体项事件
   * 
   * @description
   * 为渲染后的字体项绑定交互事件：
   * 1. 展开/折叠详情（点击标题行）
   * 2. 使用字体（点击使用按钮）
   * 3. 编辑字体名称（点击编辑按钮，弹出输入框）
   * 4. 删除字体（点击删除按钮，弹出确认）
   * 5. 删除单个标签（点击标签的 × 按钮）
   * 6. 添加新标签（点击添加按钮或按 Enter）
   * 7. 应用选中标签（勾选复选框后点击应用按钮）
   * 
   * 所有操作完成后保持展开状态并刷新列表
   */
  bindFontItemEvents() {
    // 展开/折叠字体详情（批量删除模式下禁用）
    this.container.querySelectorAll('.font-item-header').forEach(header => {
      header.addEventListener('click', (e) => {
        // 批量删除模式下禁用展开功能
        if (this.uiState.batchDeleteMode) {
          return;
        }

        const fontName = e.currentTarget.dataset.font;
        const fontItem = this.container.querySelector(`.font-item[data-font-name="${fontName}"]`);
        const details = fontItem.querySelector('.font-item-details');
        const icon = fontItem.querySelector('.expand-icon');

        if (this.uiState.expandedFonts.has(fontName)) {
          this.uiState.expandedFonts.delete(fontName);
          details.style.display = 'none';
          fontItem.classList.remove('expanded');
          icon.className = 'fa fa-chevron-down expand-icon';
        } else {
          this.uiState.expandedFonts.add(fontName);
          details.style.display = 'block';
          fontItem.classList.add('expanded');
          icon.className = 'fa fa-chevron-up expand-icon';
        }
      });
    });

    // 批量删除：勾选框事件
    this.container.querySelectorAll('.batch-delete-font-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const fontName = e.currentTarget.dataset.font;

        if (e.currentTarget.checked) {
          this.uiState.selectedFontsForDelete.add(fontName);
        } else {
          this.uiState.selectedFontsForDelete.delete(fontName);
        }

        // 更新选中数量显示并刷新列表（已选中的字体会置顶）
        this.updateBatchDeleteCount();
        this.refreshFontList();
      });
    });

    // 使用字体
    this.container.querySelectorAll('.font-use-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fontName = e.currentTarget.dataset.font;
        await this.fontManager.setCurrentFont(fontName);
        this.refreshFontList();
      });
    });

    // 编辑字体名称
    this.container.querySelectorAll('.font-edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fontName = e.currentTarget.dataset.font;
        const font = this.fontManager.getFont(fontName);
        if (!font) return;

        const newName = await callGenericPopup(
          '编辑字体名称',
          POPUP_TYPE.INPUT,
          font.displayName || font.name,
          { okButton: '确认', cancelButton: '取消' }
        );

        if (newName && newName !== font.displayName) {
          this.fontManager.updateFont(fontName, {
            displayName: newName
          });
          this.refreshFontList();
        }
      });
    });

    // 删除字体
    this.container.querySelectorAll('.font-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fontName = e.currentTarget.dataset.font;

        const confirmed = await callGenericPopup(
          `确定要删除字体 "${fontName}" 吗？`,
          POPUP_TYPE.CONFIRM,
          '',
          { okButton: '确认删除', cancelButton: '取消' }
        );

        if (confirmed) {
          await this.fontManager.removeFont(fontName);
          this.refreshFontList();
        }
      });
    });

    // 删除单个标签
    this.container.querySelectorAll('.remove-tag-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const fontName = e.currentTarget.dataset.font;
        const tagToRemove = e.currentTarget.dataset.tag;
        const font = this.fontManager.getFont(fontName);

        if (font && font.tags) {
          const updatedTags = font.tags.filter(tag => tag !== tagToRemove);
          await this.fontManager.updateFont(fontName, {
            tags: updatedTags
          });

          this.uiState.expandedFonts.add(fontName);
          this.refreshFontList();
        }
      });
    });

    // 添加新标签
    this.container.querySelectorAll('.add-new-tag-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const fontName = e.currentTarget.dataset.font;
        const input = this.container.querySelector(`.tag-new-input[data-font="${fontName}"]`);
        const newTag = input.value.trim();

        if (newTag) {
          const font = this.fontManager.getFont(fontName);
          const updatedTags = [...new Set([...(font.tags || []), newTag])];

          await this.fontManager.updateFont(fontName, {
            tags: updatedTags
          });

          input.value = '';
          this.uiState.expandedFonts.add(fontName);
          this.refreshFontList();
        }
      });
    });

    // 应用选中的标签
    this.container.querySelectorAll('.apply-tags-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const fontName = e.currentTarget.dataset.font;
        const fontItem = this.container.querySelector(`.font-item[data-font-name="${fontName}"]`);
        const checkboxes = fontItem.querySelectorAll('.tag-checkbox input:checked');

        const selectedTags = Array.from(checkboxes).map(cb => cb.value);

        if (selectedTags.length > 0) {
          const font = this.fontManager.getFont(fontName);
          const updatedTags = [...new Set([...(font.tags || []), ...selectedTags])];

          await this.fontManager.updateFont(fontName, {
            tags: updatedTags
          });

          this.uiState.expandedFonts.add(fontName);
          this.refreshFontList();
        }
      });
    });

    // Enter键添加标签
    this.container.querySelectorAll('.tag-new-input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const fontName = e.currentTarget.dataset.font;
          const addBtn = this.container.querySelector(`.add-new-tag-btn[data-font="${fontName}"]`);
          if (addBtn) addBtn.click();
        }
      });
    });
  }

  /**
   * 刷新标签管理器
   * 
   * @description
   * 渲染标签管理区域：
   * 1. 从 fontManager 获取所有标签
   * 2. 分页处理
   * 3. 统计每个标签的使用次数
   * 4. 渲染标签项（标签名 + 使用次数 + 删除按钮）
   * 5. 绑定删除标签事件（含确认提示）
   * 6. 渲染分页导航
   */
  refreshTagManager() {
    const tagManagerList = this.container.querySelector('#tag-manager-list');
    const tagManagerEmpty = this.container.querySelector('.tag-manager-empty');

    if (!tagManagerList) return;

    const tags = Array.from(this.fontManager.tags);

    if (tags.length === 0) {
      tagManagerList.innerHTML = '';
      if (tagManagerEmpty) tagManagerEmpty.style.display = 'block';
      this.renderTagPagination(0, 0);
    } else {
      if (tagManagerEmpty) tagManagerEmpty.style.display = 'none';

      // 分页逻辑
      const totalTags = tags.length;
      const totalPages = Math.ceil(totalTags / this.uiState.tagPageSize);

      // 确保当前页不超出范围
      if (this.uiState.tagCurrentPage > totalPages) {
        this.uiState.tagCurrentPage = totalPages || 1;
      }

      // 计算当前页显示的标签
      const startIndex = (this.uiState.tagCurrentPage - 1) * this.uiState.tagPageSize;
      const endIndex = startIndex + this.uiState.tagPageSize;
      const displayTags = tags.slice(startIndex, endIndex);

      // 统计每个标签的使用次数
      const tagUsage = {};
      displayTags.forEach(tag => {
        tagUsage[tag] = 0;
        this.fontManager.fonts.forEach(font => {
          if (font.tags && font.tags.includes(tag)) {
            tagUsage[tag]++;
          }
        });
      });

      // 生成标签管理项
      tagManagerList.innerHTML = displayTags.map(tag => `
        <div class="tag-manager-item-compact">
          <div class="tag-info">
            <span class="tag-name">${tag}</span>
            <span class="tag-usage">${tagUsage[tag]} 个</span>
          </div>
          <button class="tag-delete-btn-compact" data-tag="${tag}" title="删除标签">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      `).join('');

      // 绑定删除标签事件
      this.container.querySelectorAll('.tag-delete-btn-compact').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tagToDelete = e.currentTarget.dataset.tag;

          const confirmed = await callGenericPopup(
            `确定要删除标签 "${tagToDelete}" 吗？\n\n这将从所有字体中移除该标签。`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: '确认删除', cancelButton: '取消' }
          );

          if (confirmed) {
            await this.fontManager.deleteTag(tagToDelete);
            this.refreshTagManager();
            this.refreshFontList();
          }
        });
      });

      // 渲染分页导航
      this.renderTagPagination(totalTags, totalPages);
    }
  }

  /**
   * 更新标签筛选器选项
   * 
   * @description
   * 重建标签筛选下拉框的选项：
   * 1. 保留"所有标签"和"未分类"选项
   * 2. 添加所有现有标签
   * 3. 恢复之前的选择状态
   * 
   * 当标签增删时调用，确保筛选器与实际标签同步
   */
  updateTagFilter() {
    const filter = this.container.querySelector('#font-tag-filter');
    if (!filter) return;

    const currentValue = filter.value;
    const tags = Array.from(this.fontManager.tags);

    // 重建选项
    filter.innerHTML = `
      <option value="all">所有标签</option>
      <option value="untagged">未分类</option>
      ${tags.map(tag => `<option value="${tag}">${tag}</option>`).join('')}
    `;

    // 恢复选择
    filter.value = currentValue;
  }

  /**
   * 刷新整个 UI
   * 
   * @description
   * 同时刷新字体列表、标签管理器和标签筛选器
   * 通常在初始化或数据批量变化时调用
   */
  refresh() {
    this.refreshFontList();
    this.refreshTagManager();
    this.updateTagFilter();
  }

  /**
   * 通用分页渲染器
   * 
   * @description
   * 生成分页控件 HTML 和事件绑定（提取重复逻辑，符合 DRY 原则）
   * 
   * @param {Object} config - 分页配置对象
   * @param {string} config.containerId - 分页容器的 CSS 选择器
   * @param {number} config.totalItems - 项目总数
   * @param {number} config.pageSize - 每页显示数量
   * @param {number} config.currentPage - 当前页码
   * @param {string} config.itemName - 项目名称（如"字体"、"标签"）
   * @param {Function} config.onPageChange - 页码变化回调函数
   */
  renderPagination(config) {
    const { containerId, totalItems, pageSize, currentPage, itemName, onPageChange } = config;
    const paginationContainer = this.container.querySelector(containerId);
    if (!paginationContainer) return;

    // 如果总数少于等于每页数量，隐藏分页
    if (totalItems <= pageSize) {
      paginationContainer.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(totalItems / pageSize);
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, totalItems);

    // 生成分页HTML
    paginationContainer.innerHTML = `
      <div class="pagination-info">
        显示 ${startIndex}-${endIndex} / 共 ${totalItems} 个${itemName}
      </div>
      <div class="pagination-controls">
        <button class="pagination-btn" data-page="1" ${currentPage === 1 ? 'disabled' : ''}>
          <i class="fa fa-angle-double-left"></i>
        </button>
        <button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>
          <i class="fa fa-angle-left"></i>
        </button>
        <span class="pagination-current">第 ${currentPage} / ${totalPages} 页</span>
        <button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>
          <i class="fa fa-angle-right"></i>
        </button>
        <button class="pagination-btn" data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''}>
          <i class="fa fa-angle-double-right"></i>
        </button>
      </div>
    `;

    // 绑定分页按钮事件
    paginationContainer.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const newPage = parseInt(btn.dataset.page);
        onPageChange(newPage);
      });
    });
  }

  /**
   * 渲染字体列表分页导航
   * @param {number} totalFonts - 字体总数
   * @param {number} totalPages - 总页数
   */
  renderFontPagination(totalFonts, totalPages) {
    this.renderPagination({
      containerId: '#font-pagination',
      totalItems: totalFonts,
      pageSize: this.uiState.fontPageSize,
      currentPage: this.uiState.fontCurrentPage,
      itemName: '字体',
      onPageChange: (newPage) => {
        this.uiState.fontCurrentPage = newPage;
        this.refreshFontList();
      }
    });
  }

  /**
   * 渲染标签管理分页导航
   * @param {number} totalTags - 标签总数
   * @param {number} totalPages - 总页数
   */
  renderTagPagination(totalTags, totalPages) {
    this.renderPagination({
      containerId: '#tag-pagination',
      totalItems: totalTags,
      pageSize: this.uiState.tagPageSize,
      currentPage: this.uiState.tagCurrentPage,
      itemName: '标签',
      onPageChange: (newPage) => {
        this.uiState.tagCurrentPage = newPage;
        this.refreshTagManager();
      }
    });
  }

  /**
   * 显示使用指南弹窗
   * 
   * @description
   * 用户点击"使用指南"按钮（? 图标）后，弹出官方弹窗显示：
   * - 字体添加和使用技巧
   * - 标签管理说明
   * - 导入模式说明（合并 vs 替换）
   * - 备份和云端用户注意事项
   * - 问题排查方法
   * 
   * 使用 callGenericPopup + allowVerticalScrolling 支持内容滚动
   * 
   * @async
   */
  async showGuide() {
    const guideContent = `
      <div style="line-height: 2; font-size: 1.05em; max-width: 600px; margin: 0 auto; text-align: left;">
        
        <!-- 卡片1：新手快速上手 -->
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 8%, var(--SmartThemeBlurTintColor) 92%); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid var(--SmartThemeQuoteColor);">
          <h3 style="margin: 0 0 12px 0; color: var(--SmartThemeQuoteColor); font-size: 1.15em;">新手快速上手</h3>
          <p style="margin: 8px 0; font-size: 1em;">
            <strong>第一步：</strong>点击上方"前往字体网站"链接，浏览喜欢的字体<br>
            <strong>第二步：</strong>复制字体代码，粘贴到输入框，点击"添加"<br>
            <strong>第三步：</strong>字体自动应用，立即生效
          </p>
        </div>

        <!-- 卡片2：标签管理 -->
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 8%, var(--SmartThemeBlurTintColor) 92%); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid var(--SmartThemeQuoteColor);">
          <h3 style="margin: 0 0 12px 0; color: var(--SmartThemeQuoteColor); font-size: 1.15em;">标签怎么用</h3>
          <p style="margin: 8px 0; font-size: 1em;">
            • 展开字体项可以添加自定义标签<br>
            • 用标签分类字体（如"衬线体"、"我喜欢"）<br>
            • 标签筛选器可以快速找到想要的字体
          </p>
          <p style="margin: 12px 0 8px 0; font-size: 0.95em; opacity: 0.9;">
            <strong>不需要的标签可以删除：</strong><br>
            打开"标签管理"区域 → 点击标签旁的垃圾桶图标<br>
            （包括"已验证"和"问题"标签也可以删除）
          </p>
        </div>

        <!-- 卡片3：导入模式说明 -->
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 8%, var(--SmartThemeBlurTintColor) 92%); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid var(--SmartThemeQuoteColor);">
          <h3 style="margin: 0 0 12px 0; color: var(--SmartThemeQuoteColor); font-size: 1.15em;">导入模式：合并 vs 替换</h3>
          <p style="margin: 8px 0; font-size: 1em;">
            工具栏上"↓导入"按钮旁边有个"合并"复选框，控制导入模式：
          </p>
          <p style="margin: 8px 0; font-size: 1em;">
            <strong>勾选"合并"（推荐）：</strong><br>
            保留现有字体，只添加新的字体。如果有同名字体会跳过。<br>
            适合：导入新字体包、从其他用户导入字体
          </p>
          <p style="margin: 8px 0; font-size: 1em;">
            <strong>不勾选"合并"（替换模式）：</strong><br>
            清空所有现有字体，完全使用导入的字体列表。<br>
            适合：恢复备份、重置字体库
          </p>
        </div>

        <!-- 卡片4：备份和云端用户 -->
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 8%, var(--SmartThemeBlurTintColor) 92%); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid var(--SmartThemeQuoteColor);">
          <h3 style="margin: 0 0 12px 0; color: var(--SmartThemeQuoteColor); font-size: 1.15em;">备份你的字体</h3>
          <p style="margin: 8px 0; font-size: 1em;">
            点击工具栏的 <strong>↑导出</strong> 按钮，保存字体配置到文件。<br>
            以后可以用 <strong>↓导入</strong> 按钮恢复。
          </p>
          <p style="margin: 12px 0 8px 0; font-size: 0.95em; background: color-mix(in srgb, #ff9800 15%, transparent 85%); padding: 8px; border-radius: 4px;">
            <strong>云端酒馆用户注意：</strong><br>
            卸载扩展前，请先点击 <strong>清空所有字体</strong> 按钮，<br>
            否则字体数据可能会残留在云端设置中
          </p>
        </div>

        <!-- 卡片5：遇到问题时 -->
        <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 8%, var(--SmartThemeBlurTintColor) 92%); padding: 16px; border-radius: 8px; border-left: 4px solid var(--SmartThemeQuoteColor);">
          <h3 style="margin: 0 0 12px 0; color: var(--SmartThemeQuoteColor); font-size: 1.15em;">字体不能用怎么办</h3>
          <p style="margin: 8px 0; font-size: 1em;">
            <strong>情况1：所有字体都不能用</strong><br>
            → 可能是扩展问题，刷新页面试试
          </p>
          <p style="margin: 8px 0; font-size: 1em;">
            <strong>情况2：只有几个字体不能用</strong><br>
            → 可能是字体网站下架了<br>
            → 逐个手动点击"使用"按钮测试<br>
            → 确实不能用的，点击"删除"按钮移除
          </p>
          <p style="margin: 8px 0; font-size: 1em;">
            <strong>情况3：部分字体有时能用有时不能</strong><br>
            → 可能是网络问题，等一会再试
          </p>
        </div>
      </div>
    `;

    await callGenericPopup(
      guideContent,
      POPUP_TYPE.TEXT,
      '',
      {
        wide: false,
        large: false,
        allowVerticalScrolling: true,
        okButton: '知道了'
      }
    );

    logger.debug('[FontManagerUI.showGuide] 已显示使用指南');
  }

  /**
   * 切换批量删除模式
   * 
   * @description
   * 进入/退出批量删除模式：
   * 1. 进入时：清空选中列表、刷新UI显示勾选框
   * 2. 退出时：清空选中列表、刷新UI恢复普通模式
   * 
   * @param {boolean} enable - 是否启用批量删除模式
   */
  toggleBatchDeleteMode(enable) {
    this.uiState.batchDeleteMode = enable;
    this.uiState.selectedFontsForDelete.clear();

    // 重新渲染工具栏和字体列表
    this.render();
    this.bindEvents();

    logger.info('[FontManagerUI.toggleBatchDeleteMode] 批量删除模式:', enable ? '已启用' : '已关闭');
  }

  /**
   * 执行批量删除
   * 
   * @description
   * 删除选中的字体：
   * 1. 检查是否有选中的字体
   * 2. 使用官方弹窗确认（超过10个显示摘要）
   * 3. 逐个删除字体
   * 4. 显示删除结果
   * 5. 退出批量删除模式
   * 
   * @async
   */
  async executeBatchDelete() {
    const selectedFonts = Array.from(this.uiState.selectedFontsForDelete);

    if (selectedFonts.length === 0) {
      toastr.warning('请先选择要删除的字体');
      return;
    }

    // 生成确认弹窗内容
    let confirmMessage;
    if (selectedFonts.length <= 10) {
      // 10个以内，显示完整列表
      const fontList = selectedFonts.map(name => `• ${name}`).join('\n');
      confirmMessage = `即将删除 ${selectedFonts.length} 个字体：\n\n${fontList}\n\n确定删除吗？（不可恢复）`;
    } else {
      // 超过10个，显示摘要
      const preview = selectedFonts.slice(0, 5).map(name => `• ${name}`).join('\n');
      confirmMessage = `即将删除 ${selectedFonts.length} 个字体\n\n前5个字体：\n${preview}\n... 及其他 ${selectedFonts.length - 5} 个字体\n\n确定删除吗？（不可恢复）`;
    }

    const confirmed = await callGenericPopup(
      confirmMessage,
      POPUP_TYPE.CONFIRM,
      '',
      { okButton: '确认删除', cancelButton: '取消' }
    );

    if (confirmed) {
      let deleted = 0;
      let failed = 0;

      for (const fontName of selectedFonts) {
        if (await this.fontManager.removeFont(fontName)) {
          deleted++;
        } else {
          failed++;
        }
      }

      logger.info(`[FontManagerUI.executeBatchDelete] 批量删除完成: ${deleted} 成功, ${failed} 失败`);
      toastr.success(`已删除 ${deleted} 个字体${failed > 0 ? `，${failed} 个失败` : ''}`);

      // 退出批量删除模式
      this.toggleBatchDeleteMode(false);
    }
  }

  /**
   * 更新批量删除选中数量显示
   * 
   * @description
   * 更新工具栏的"已选中 X 个字体"显示
   */
  updateBatchDeleteCount() {
    const countElement = this.container.querySelector('#batch-delete-count');
    if (countElement) {
      countElement.textContent = this.uiState.selectedFontsForDelete.size;
    }
  }

  /**
   * 销毁 UI
   * 
   * @description
   * 清空容器 innerHTML，释放 UI 资源
   * 通常在卸载扩展时由 FontManager.destroy() 调用
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
