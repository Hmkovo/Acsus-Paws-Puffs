/**
 * 字体管理器 - UI界面
 * 
 * 功能：
 * - 字体列表显示
 * - 标签管理
 * - 导入导出
 */

import { eventSource } from "../../../../script.js";

export class FontManagerUI {
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
      tagPageSize: 10              // 标签列表每页显示数量
    };
  }

  /**
   * 初始化UI
   */
  async init(container) {
    this.container = container;
    this.render();
    this.bindEvents();
  }

  /**
   * 渲染UI界面
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
            
            <!-- 使用教程折叠 -->
            <details style="margin-bottom: 10px; padding: 6px 10px; background: color-mix(in srgb, var(--SmartThemeBodyColor) 3%, var(--SmartThemeBlurTintColor) 97%); border-radius: 4px;">
              <summary style="cursor: pointer; font-size: 0.9em; opacity: 0.8; padding: 2px 0;">
                <i class="fa-solid fa-lightbulb"></i> 新手使用指南（点击展开）
              </summary>
              <div style="margin-top: 8px; padding: 8px; font-size: 0.85em; line-height: 1.5; opacity: 0.9; border-left: 2px solid var(--SmartThemeBodyColor); padding-left: 10px;">
                <p style="margin: 4px 0;"><strong>💡 实用技巧：</strong></p>
                <p style="margin: 4px 0;">• 定期使用导出功能备份字体包，防止丢失</p>
                <p style="margin: 4px 0;">• 喜欢的字体可以打上自定义标签（如"我喜欢"），方便分类查找</p>
                <p style="margin: 4px 0;">• 云端酒馆用户：卸载扩展前请先清空所有字体</p>
                <p style="margin: 4px 0;">• 可以用标签管理删除不需要的标签</p>
                
                <p style="margin: 8px 0 4px 0;"><strong>⚠️ 字体无法使用时：</strong></p>
                <p style="margin: 4px 0;">1. 先检查字体网站是否删除了该字体</p>
                <p style="margin: 4px 0;">2. 测试其他字体：</p>
                <p style="margin: 4px 0 4px 12px;">• 所有字体都不能用 → 扩展问题</p>
                <p style="margin: 4px 0 4px 12px;">• 部分字体可用 + 网站未删除 → 等待一段时间再试</p>
                <p style="margin: 4px 0 4px 12px;">• 单独几个字体不能用 → 给这些字体打上"问题"标签，稍后测试或删除</p>
              </div>
            </details>
            
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
            <button id="font-clear-all-btn" class="menu_button compact icon-only danger" title="清空所有字体">
              <i class="fa fa-trash"></i>
            </button>
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
   * 绑定事件
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
        if (window.confirm('确定要清空所有字体吗？此操作不可恢复！')) {
          await this.fontManager.clearAllFonts();
          this.refreshFontList();
          toastr.success('已清空所有字体');
        }
      });
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
   * 处理添加字体
   */
  async handleAddFont() {
    const input = this.container.querySelector('#font-input').value.trim();
    const customName = this.container.querySelector('#font-name-input').value.trim();

    if (!input) {
      toastr.warning('请输入字体代码');
      return;
    }

    // 解析字体
    let fontData = null;

    // 检查是否只有@import（没有font-family）
    if (input.includes('@import') && !input.includes('font-family')) {
      if (!customName) {
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
      toastr.success('字体添加成功');
    } else {
      toastr.error('字体添加失败，可能已存在同名字体');
    }
  }

  /**
   * 处理导入文件
   */
  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const mergeCheckbox = this.container.querySelector('#import-merge');
    const merge = mergeCheckbox ? mergeCheckbox.checked : true;

    try {
      const text = await file.text();
      const count = await this.fontManager.importFonts(text, merge);

      const modeText = merge ? '增加' : '覆盖';
      toastr.success(`成功导入 ${count} 个字体（${modeText}模式）`);

      event.target.value = '';
      this.refreshFontList();
    } catch (error) {
      toastr.error('导入失败: ' + error.message);
      event.target.value = '';
    }
  }

  /**
   * 处理导出字体
   */
  handleExportFonts() {
    const data = this.fontManager.exportFonts();

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paws-puffs-fonts-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toastr.success('字体配置已导出');
  }

  /**
   * 刷新字体列表
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

    // 当前字体置顶
    const currentFontName = this.fontManager.currentFont;
    if (currentFontName) {
      const currentFontIndex = fonts.findIndex(font => font.name === currentFontName);
      if (currentFontIndex > 0) {
        const currentFont = fonts.splice(currentFontIndex, 1)[0];
        fonts.unshift(currentFont);
      }
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
   * 创建字体项HTML
   */
  createFontItem(font) {
    const isCurrent = this.fontManager.currentFont === font.name;
    const isExpanded = this.uiState.expandedFonts.has(font.name);

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
      <div class="font-item ${isCurrent ? 'current' : ''} ${isExpanded ? 'expanded' : ''}" 
           data-font-name="${font.name}">
        
        <!-- 主信息行 -->
        <div class="font-item-main">
          <div class="font-item-header" data-font="${font.name}">
            <i class="fa fa-chevron-${isExpanded ? 'up' : 'down'} expand-icon"></i>
            <span class="font-item-name">
              ${font.displayName || font.name}
              ${isCurrent ? ' <span class="current-badge">✔</span>' : ''}
            </span>
            <div class="font-item-tags">
              ${tagsHtml}
            </div>
          </div>
          
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
        </div>
        
        <!-- 展开的详情区域 -->
        <div class="font-item-details" style="display: ${isExpanded ? 'block' : 'none'};">
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
   */
  bindFontItemEvents() {
    // 展开/折叠字体详情
    this.container.querySelectorAll('.font-item-header').forEach(header => {
      header.addEventListener('click', (e) => {
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fontName = e.currentTarget.dataset.font;
        const font = this.fontManager.getFont(fontName);
        if (!font) return;

        const newName = window.prompt('编辑字体名称:', font.displayName || font.name);
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
        if (window.confirm(`确定要删除字体 "${fontName}" 吗？`)) {
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
          if (window.confirm(`确定要删除标签 "${tagToDelete}" 吗？\n这将从所有字体中移除该标签。`)) {
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
   * 更新标签筛选器
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
   * 刷新整个UI
   */
  refresh() {
    this.refreshFontList();
    this.refreshTagManager();
    this.updateTagFilter();
  }

  /**
   * 渲染字体列表分页导航
   */
  renderFontPagination(totalFonts, totalPages) {
    const paginationContainer = this.container.querySelector('#font-pagination');
    if (!paginationContainer) return;

    // 如果总数少于等于每页数量，隐藏分页
    if (totalFonts <= this.uiState.fontPageSize) {
      paginationContainer.innerHTML = '';
      return;
    }

    const currentPage = this.uiState.fontCurrentPage;
    const startIndex = (currentPage - 1) * this.uiState.fontPageSize + 1;
    const endIndex = Math.min(currentPage * this.uiState.fontPageSize, totalFonts);

    // 生成分页HTML
    paginationContainer.innerHTML = `
      <div class="pagination-info">
        显示 ${startIndex}-${endIndex} / 共 ${totalFonts} 个字体
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
        this.uiState.fontCurrentPage = parseInt(btn.dataset.page);
        this.refreshFontList();
      });
    });
  }

  /**
   * 渲染标签管理分页导航
   */
  renderTagPagination(totalTags, totalPages) {
    const paginationContainer = this.container.querySelector('#tag-pagination');
    if (!paginationContainer) return;

    // 如果总数少于等于每页数量，隐藏分页
    if (totalTags <= this.uiState.tagPageSize) {
      paginationContainer.innerHTML = '';
      return;
    }

    const currentPage = this.uiState.tagCurrentPage;
    const startIndex = (currentPage - 1) * this.uiState.tagPageSize + 1;
    const endIndex = Math.min(currentPage * this.uiState.tagPageSize, totalTags);

    // 生成分页HTML
    paginationContainer.innerHTML = `
      <div class="pagination-info">
        显示 ${startIndex}-${endIndex} / 共 ${totalTags} 个标签
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
        this.uiState.tagCurrentPage = parseInt(btn.dataset.page);
        this.refreshTagManager();
      });
    });
  }

  /**
   * 销毁UI
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
