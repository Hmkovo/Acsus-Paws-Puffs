/**
 * 预设缝合器 - UI 模块
 *
 * 负责：
 * - 弹窗的创建和管理
 * - 条目列表渲染
 * - 标签筛选和搜索
 * - 表单交互
 */

import { callGenericPopup } from '../../../popup.js';
import * as stitchData from './preset-stitch-data.js';
import logger from './logger.js';

/**
 * 修改弹窗的OK按钮文字为"关闭"
 * @description 因为ST的弹窗默认显示"OK"，但在表单弹窗中容易让用户误解
 */
function fixPopupOkButton() {
    setTimeout(() => {
        const okBtn = document.querySelector('.popup-button-ok');
        if (okBtn && okBtn.textContent === 'OK') {
            okBtn.textContent = '关闭';
        }
    }, 50);
}

export class PresetStitchUI {
  /**
   * @param {Object} module - PresetStitchModule 实例
   */
  constructor(module) {
    this.module = module;
    this.popupEl = null;
    this.currentTagFilter = null;  // 当前选中的标签筛选
    this.searchKeyword = '';       // 当前搜索关键词
    this.selectedItems = new Set(); // 选中的条目ID（用于批量操作）
    this.batchMode = false;        // 批量模式开关
  }

  /**
   * 显示收藏库弹窗
   */
  show() {
    logger.debug('[PresetStitchUI] 显示收藏库弹窗');
    this.createPopup();
  }

  /**
   * 隐藏弹窗
   */
  hide() {
    // callGenericPopup 会自动处理关闭
    this.popupEl = null;
    this.selectedItems.clear();
  }

  /**
   * 创建弹窗
   */
  createPopup() {
    const items = stitchData.getItems();
    const tags = stitchData.getTags();

    const popupHtml = `
      <div class="stitch-library-popup">
        <!-- 标题栏 -->
        <div class="stitch-header">
          <h3><i class="fa-solid fa-puzzle-piece"></i> 条目收藏库</h3>
          <span class="stitch-item-count">${items.length} 个条目</span>
        </div>

        <!-- 工具栏：搜索图标 + 搜索框 + 添加按钮 + 批量插入按钮（同一行） -->
        <div class="stitch-toolbar">
          <i class="fa-solid fa-search stitch-search-icon"></i>
          <input type="text" class="text_pole stitch-search-input" placeholder="搜索条目...">
          <div class="stitch-add-dropdown">
            <button class="menu_button stitch-add-btn">
              <i class="fa-solid fa-plus"></i> 添加条目
            </button>
            <div class="stitch-add-menu" style="display: none;">
              <div class="stitch-add-option" data-action="from-preset">
                <i class="fa-solid fa-sliders"></i> 从当前预设添加
              </div>
              <div class="stitch-add-option" data-action="from-other-preset">
                <i class="fa-solid fa-folder-open"></i> 从其他预设添加
              </div>
              <div class="stitch-add-option" data-action="from-worldbook">
                <i class="fa-solid fa-book"></i> 从世界书添加
              </div>
              <div class="stitch-add-option" data-action="manual">
                <i class="fa-solid fa-pen"></i> 手动创建
              </div>
            </div>
          </div>
          <button class="menu_button stitch-batch-toggle-btn" title="批量操作模式">
            <i class="fa-solid fa-layer-group"></i>
          </button>
        </div>

        <!-- 批量操作栏（批量模式下显示） -->
        <div class="stitch-batch-bar" style="display: none;">
          <span class="stitch-batch-hint">已选择 <span class="stitch-selected-count">0</span> 个条目</span>
          <button class="menu_button stitch-batch-cancel-btn">取消</button>
          <button class="menu_button stitch-batch-delete-btn" disabled>
            <i class="fa-solid fa-trash"></i> 删除
          </button>
          <button class="menu_button stitch-batch-tag-btn" disabled>
            <i class="fa-solid fa-tag"></i> 打标签
          </button>
          <button class="menu_button stitch-batch-confirm-btn" disabled>
            <i class="fa-solid fa-arrow-right"></i> 插入
          </button>
        </div>
        <p class="stitch-batch-tip" style="display: none;">勾选条目后，可批量删除、打标签或插入到当前预设</p>

        <!-- 标签筛选栏 -->
        <div class="stitch-tag-bar">
          <span class="stitch-tag-item active" data-tag="">全部</span>
          ${tags.map(tag => `<span class="stitch-tag-item" data-tag="${tag}">${tag}<i class="fa-solid fa-xmark stitch-tag-delete" title="删除标签"></i></span>`).join('')}
          <span class="stitch-tag-add" title="添加标签"><i class="fa-solid fa-plus"></i></span>
        </div>

        <!-- 条目列表 -->
        <div class="stitch-entry-list" id="stitch-entry-list">
          ${this.renderEntryListHtml(items)}
        </div>
      </div>
    `;

    // 显示弹窗
    callGenericPopup(popupHtml, 1, '条目收藏库');

    // 等待 DOM 更新后绑定事件
    setTimeout(() => {
      this.popupEl = document.querySelector('.stitch-library-popup');
      if (this.popupEl) {
        this.bindPopupEvents();
      }
    }, 100);
  }


  /**
   * 渲染条目列表 HTML
   * @param {Array} items - 条目数组
   * @returns {string} HTML 字符串
   */
  renderEntryListHtml(items) {
    if (items.length === 0) {
      return `
        <div class="stitch-empty-state">
          <i class="fa-solid fa-box-open"></i>
          <p>收藏库是空的</p>
          <p style="opacity: 0.7; font-size: 0.9em;">点击上方"添加条目"开始收藏</p>
        </div>
      `;
    }

    // 应用筛选
    let filteredItems = items;

    // 标签筛选
    if (this.currentTagFilter) {
      filteredItems = filteredItems.filter(item =>
        item.tags && item.tags.includes(this.currentTagFilter)
      );
    }

    // 搜索筛选
    if (this.searchKeyword) {
      const keyword = this.searchKeyword.toLowerCase();
      filteredItems = filteredItems.filter(item =>
        item.name.toLowerCase().includes(keyword) ||
        item.content.toLowerCase().includes(keyword)
      );
    }

    if (filteredItems.length === 0) {
      return `
        <div class="stitch-empty-state">
          <i class="fa-solid fa-search"></i>
          <p>没有匹配的条目</p>
        </div>
      `;
    }

    return filteredItems.map(item => this.renderEntryItemHtml(item)).join('');
  }

  /**
   * 渲染单个条目 HTML
   *
   * @description
   * 简化版条目显示：[勾选框] + 来源图标 + 名称 + 标签 + 操作按钮
   * 批量模式下才显示勾选框（在最左边）
   *
   * @param {Object} item - 条目对象
   * @returns {string} HTML 字符串
   */
  renderEntryItemHtml(item) {
    const isSelected = this.selectedItems.has(item.id);
    const tagHtml = item.tags && item.tags.length > 0
      ? item.tags.map(t => `<span class="stitch-entry-tag">${t}</span>`).join('')
      : '';

    const sourceIcon = item.source === 'worldbook'
      ? '<i class="fa-solid fa-book" title="来自世界书"></i>'
      : item.source === 'preset'
        ? '<i class="fa-solid fa-sliders" title="来自预设"></i>'
        : '<i class="fa-solid fa-pen" title="手动创建"></i>';

    // 批量模式下显示勾选框（在最左边）
    const checkboxHtml = this.batchMode
      ? `<div class="stitch-entry-checkbox">
          <input type="checkbox" ${isSelected ? 'checked' : ''}>
        </div>`
      : '';

    return `
      <div class="stitch-entry-item ${isSelected ? 'selected' : ''}" data-id="${item.id}">
        ${checkboxHtml}
        <div class="stitch-entry-info">
          <span class="stitch-entry-source">${sourceIcon}</span>
          <span class="stitch-entry-name" title="${item.name}">${item.name}</span>
          <div class="stitch-entry-tags">${tagHtml}</div>
        </div>
        <div class="stitch-entry-actions">
          <button class="stitch-action-btn stitch-delete-btn" title="删除">
            <i class="fa-solid fa-trash"></i>
          </button>
          <button class="stitch-action-btn stitch-edit-btn" title="编辑">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="stitch-action-btn stitch-insert-btn" title="插入到预设">
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染位置选择器选项 HTML
   * @returns {string} HTML 字符串
   */
  renderPositionOptionsHtml() {
    const entries = this.module.getCurrentPresetEntries();

    let html = '<option value="top">最顶部</option>';

    entries.forEach((entry, index) => {
      // 跳过 marker 类型的条目
      if (entry.marker) return;

      const displayName = entry.name || entry.identifier;
      html += `<option value="${entry.identifier}">${index + 1}. ${displayName} 之后</option>`;
    });

    html += '<option value="bottom">最底部</option>';

    return html;
  }

  /**
   * 刷新条目列表
   */
  refreshEntryList() {
    const listEl = this.popupEl?.querySelector('#stitch-entry-list');
    const countEl = this.popupEl?.querySelector('.stitch-item-count');

    if (listEl) {
      const items = stitchData.getItems();
      listEl.innerHTML = this.renderEntryListHtml(items);
      this.bindEntryListEvents();

      if (countEl) {
        countEl.textContent = `${items.length} 个条目`;
      }
    }
  }

  /**
   * 刷新标签栏
   */
  refreshTagBar() {
    const tagBar = this.popupEl?.querySelector('.stitch-tag-bar');
    if (!tagBar) return;

    const tags = stitchData.getTags();

    tagBar.innerHTML = `
      <span class="stitch-tag-item ${!this.currentTagFilter ? 'active' : ''}" data-tag="">全部</span>
      ${tags.map(tag => `<span class="stitch-tag-item ${this.currentTagFilter === tag ? 'active' : ''}" data-tag="${tag}">${tag}<i class="fa-solid fa-xmark stitch-tag-delete" title="删除标签"></i></span>`).join('')}
      <span class="stitch-tag-add" title="添加标签"><i class="fa-solid fa-plus"></i></span>
    `;

    this.bindTagBarEvents();
  }

  /**
   * 更新选中计数
   */
  updateSelectedCount() {
    const countEl = this.popupEl?.querySelector('.stitch-selected-count');
    const confirmBtn = this.popupEl?.querySelector('.stitch-batch-confirm-btn');
    const tagBtn = this.popupEl?.querySelector('.stitch-batch-tag-btn');
    const deleteBtn = this.popupEl?.querySelector('.stitch-batch-delete-btn');

    if (countEl) {
      countEl.textContent = this.selectedItems.size;
    }

    const hasSelection = this.selectedItems.size > 0;
    if (confirmBtn) {
      confirmBtn.disabled = !hasSelection;
    }
    if (tagBtn) {
      tagBtn.disabled = !hasSelection;
    }
    if (deleteBtn) {
      deleteBtn.disabled = !hasSelection;
    }
  }

  /**
   * 切换批量模式
   * @param {boolean} enabled - 是否启用批量模式
   */
  toggleBatchMode(enabled) {
    this.batchMode = enabled;
    this.selectedItems.clear();

    // 更新批量操作栏和提示文字显示
    const batchBar = this.popupEl?.querySelector('.stitch-batch-bar');
    const batchTip = this.popupEl?.querySelector('.stitch-batch-tip');
    const batchToggleBtn = this.popupEl?.querySelector('.stitch-batch-toggle-btn');

    if (batchBar) {
      batchBar.style.display = enabled ? 'flex' : 'none';
    }
    if (batchTip) {
      batchTip.style.display = enabled ? 'block' : 'none';
    }
    if (batchToggleBtn) {
      batchToggleBtn.classList.toggle('active', enabled);
    }

    // 刷新列表以显示/隐藏勾选框
    this.refreshEntryList();
    this.updateSelectedCount();
  }

  /**
   * 绑定弹窗事件
   */
  bindPopupEvents() {
    if (!this.popupEl) return;

    // 搜索框
    const searchInput = this.popupEl.querySelector('.stitch-search-input');
    searchInput?.addEventListener('input', (e) => {
      this.searchKeyword = e.target.value.trim();
      this.refreshEntryList();
    });

    // 添加按钮下拉菜单
    this.bindAddDropdown();

    // 标签栏
    this.bindTagBarEvents();

    // 条目列表
    this.bindEntryListEvents();

    // 批量模式切换按钮
    const batchToggleBtn = this.popupEl.querySelector('.stitch-batch-toggle-btn');
    batchToggleBtn?.addEventListener('click', () => {
      this.toggleBatchMode(!this.batchMode);
    });

    // 批量取消按钮
    const batchCancelBtn = this.popupEl.querySelector('.stitch-batch-cancel-btn');
    batchCancelBtn?.addEventListener('click', () => {
      this.toggleBatchMode(false);
    });

    // 批量确认插入按钮
    const batchConfirmBtn = this.popupEl.querySelector('.stitch-batch-confirm-btn');
    batchConfirmBtn?.addEventListener('click', () => {
      this.showBatchInsertDialog();
    });

    // 批量打标签按钮
    const batchTagBtn = this.popupEl.querySelector('.stitch-batch-tag-btn');
    batchTagBtn?.addEventListener('click', () => {
      this.showBatchTagDialog();
    });

    // 批量删除按钮
    const batchDeleteBtn = this.popupEl.querySelector('.stitch-batch-delete-btn');
    batchDeleteBtn?.addEventListener('click', () => {
      this.showBatchDeleteDialog();
    });
  }

  /**
   * 绑定添加按钮下拉菜单
   */
  bindAddDropdown() {
    const addBtn = this.popupEl?.querySelector('.stitch-add-btn');
    const addMenu = this.popupEl?.querySelector('.stitch-add-menu');

    if (!addBtn || !addMenu) return;

    // 点击按钮切换菜单
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = addMenu.style.display !== 'none';
      addMenu.style.display = isVisible ? 'none' : 'block';
    });

    // 点击菜单选项
    addMenu.querySelectorAll('.stitch-add-option').forEach(option => {
      option.addEventListener('click', (e) => {
        const action = option.dataset.action;
        addMenu.style.display = 'none';

        switch (action) {
          case 'from-preset':
            this.showPresetPicker();
            break;
          case 'from-other-preset':
            this.showOtherPresetPicker();
            break;
          case 'from-worldbook':
            this.showWorldBookPicker();
            break;
          case 'manual':
            this.showManualCreateForm();
            break;
        }
      });
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
      addMenu.style.display = 'none';
    });
  }

  /**
   * 绑定标签栏事件
   */
  bindTagBarEvents() {
    const tagBar = this.popupEl?.querySelector('.stitch-tag-bar');
    if (!tagBar) return;

    // 标签点击筛选（排除×按钮的点击）
    tagBar.querySelectorAll('.stitch-tag-item').forEach(tagEl => {
      tagEl.addEventListener('click', (e) => {
        // 如果点击的是×按钮，不触发筛选
        if (e.target.classList.contains('stitch-tag-delete')) return;

        const tag = tagEl.dataset.tag;
        this.currentTagFilter = tag || null;

        // 更新激活状态
        tagBar.querySelectorAll('.stitch-tag-item').forEach(t => t.classList.remove('active'));
        tagEl.classList.add('active');

        this.refreshEntryList();
      });
    });

    // ×按钮快捷删除标签
    tagBar.querySelectorAll('.stitch-tag-delete').forEach(deleteBtn => {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // 阻止冒泡到标签点击事件
        const tagEl = e.target.closest('.stitch-tag-item');
        const tag = tagEl?.dataset.tag;
        if (!tag) return;

        // 使用ST弹窗确认删除
        const confirmed = await callGenericPopup(
          `<p style="text-align: center;">确定要删除标签「<strong>${tag}</strong>」吗？</p>`,
          2 // POPUP_TYPE.CONFIRM
        );

        if (confirmed) {
          stitchData.deleteTag(tag);
          toastr.info('标签已删除');
          if (this.currentTagFilter === tag) {
            this.currentTagFilter = null;
          }
          this.refreshTagBar();
          this.refreshEntryList();
        }
      });
    });

    // 添加标签按钮
    const addTagBtn = tagBar.querySelector('.stitch-tag-add');
    addTagBtn?.addEventListener('click', async () => {
      // 使用ST弹窗输入标签名称
      const name = await callGenericPopup(
        '<p>请输入标签名称：</p>',
        3, // POPUP_TYPE.INPUT
        ''
      );

      if (name && name.trim()) {
        const success = stitchData.addTag(name.trim());
        if (success) {
          toastr.success('标签已添加');
          this.refreshTagBar();
        } else {
          toastr.warning('标签已存在');
        }
      }
    });

    // 标签右键菜单（重命名）- 保留右键重命名功能
    tagBar.querySelectorAll('.stitch-tag-item[data-tag]').forEach(tagEl => {
      if (!tagEl.dataset.tag) return; // 跳过"全部"

      tagEl.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const tag = tagEl.dataset.tag;
        if (!tag) return;

        // 使用ST弹窗输入新名称
        const newName = await callGenericPopup(
          '<p>重命名标签：</p>',
          3, // POPUP_TYPE.INPUT
          tag
        );

        if (newName && newName.trim() && newName !== tag) {
          const success = stitchData.renameTag(tag, newName.trim());
          if (success) {
            toastr.success('标签已重命名');
            if (this.currentTagFilter === tag) {
              this.currentTagFilter = newName.trim();
            }
            this.refreshTagBar();
            this.refreshEntryList();
          }
        }
      });
    });
  }

  /**
   * 绑定条目列表事件
   */
  bindEntryListEvents() {
    const listEl = this.popupEl?.querySelector('#stitch-entry-list');
    if (!listEl) return;

    // 复选框（批量模式下）
    listEl.querySelectorAll('.stitch-entry-checkbox input').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const item = e.target.closest('.stitch-entry-item');
        const id = item?.dataset.id;
        if (!id) return;

        if (e.target.checked) {
          this.selectedItems.add(id);
          item.classList.add('selected');
        } else {
          this.selectedItems.delete(id);
          item.classList.remove('selected');
        }

        this.updateSelectedCount();
      });
    });

    // 单个插入按钮 - 弹窗选择位置
    listEl.querySelectorAll('.stitch-insert-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.stitch-entry-item');
        const id = item?.dataset.id;
        if (!id) return;

        this.showInsertPositionDialog(id);
      });
    });

    // 编辑按钮
    listEl.querySelectorAll('.stitch-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.stitch-entry-item');
        const id = item?.dataset.id;
        if (id) {
          this.showEditForm(id);
        }
      });
    });

    // 删除按钮
    listEl.querySelectorAll('.stitch-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.stitch-entry-item');
        const id = item?.dataset.id;
        if (!id) return;

        const entry = stitchData.getItemById(id);
        // 使用ST弹窗确认删除
        const confirmed = await callGenericPopup(
          `<p style="text-align: center;">确定要删除条目「<strong>${entry?.name}</strong>」吗？</p>`,
          2 // POPUP_TYPE.CONFIRM
        );

        if (confirmed) {
          stitchData.deleteItem(id);
          this.selectedItems.delete(id);
          toastr.info('条目已删除');
          this.refreshEntryList();
          this.updateSelectedCount();
        }
      });
    });
  }


  // ========================================
  // 添加条目相关
  // ========================================

  /**
   * 显示从预设添加的选择器
   */
  async showPresetPicker() {
    const entries = this.module.getCurrentPresetEntries();

    // 调试：打印获取到的条目
    logger.debug('[PresetStitchUI] 获取到的预设条目数量:', entries.length);
    logger.debug('[PresetStitchUI] 条目详情:', entries.map(e => ({
      name: e.name,
      marker: e.marker,
      contentLength: e.content?.length || 0
    })));

    // 只过滤掉标记（marker: true），保留所有条目（不管有没有内容）
    const userEntries = entries.filter(e => !e.marker);

    logger.debug('[PresetStitchUI] 过滤后的条目数量:', userEntries.length);

    if (userEntries.length === 0) {
      toastr.warning('当前预设没有可添加的条目');
      return;
    }

    const listHtml = userEntries.map(entry => `
      <div class="stitch-picker-item" data-identifier="${entry.identifier}">
        <input type="checkbox">
        <span class="picker-item-name">${entry.name}</span>
      </div>
    `).join('');

    const popupHtml = `
      <div class="stitch-picker-popup">
        <p>选择要添加到收藏库的条目：</p>
        <div class="stitch-picker-list">${listHtml}</div>
        <div class="stitch-picker-footer">
          <button class="menu_button stitch-picker-confirm">确认添加</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '从预设添加');
    fixPopupOkButton();

    // 绑定事件
    setTimeout(() => {
      const popup = document.querySelector('.stitch-picker-popup');
      if (!popup) return;

      popup.querySelector('.stitch-picker-confirm')?.addEventListener('click', () => {
        const selected = popup.querySelectorAll('.stitch-picker-item input:checked');
        let addedCount = 0;

        selected.forEach(checkbox => {
          const item = checkbox.closest('.stitch-picker-item');
          const identifier = item?.dataset.identifier;
          const entry = entries.find(e => e.identifier === identifier);

          if (entry) {
            stitchData.addItem({
              name: entry.name,
              content: entry.content,
              role: entry.role || 'system',
              source: 'preset'
            });
            addedCount++;
          }
        });

        if (addedCount > 0) {
          toastr.success(`已添加 ${addedCount} 个条目`);
          this.refreshEntryList();
        }
      });
    }, 100);
  }

  /**
   * 显示从其他预设添加的选择器
   * @description 先选择预设，再选择该预设中的条目
   */
  async showOtherPresetPicker() {
    // 获取预设列表
    let presetNames = [];
    let presetSettings = [];
    try {
      const { openai_setting_names, openai_settings } = await import('../../../openai.js');
      presetNames = Object.keys(openai_setting_names || {});
      presetSettings = openai_settings || [];
    } catch (error) {
      logger.error('[PresetStitchUI] 获取预设列表失败:', error);
      toastr.error('获取预设列表失败');
      return;
    }

    if (presetNames.length === 0) {
      toastr.warning('没有可用的预设');
      return;
    }

    const popupHtml = `
      <div class="stitch-other-preset-popup">
        <div class="stitch-preset-select">
          <label>选择预设：</label>
          <select class="text_pole" id="stitch-other-preset-select">
            <option value="">-- 请选择 --</option>
            ${presetNames.map(name => `<option value="${name}">${name}</option>`).join('')}
          </select>
        </div>
        <div class="stitch-preset-entries" id="stitch-other-preset-entries">
          <p style="text-align: center; opacity: 0.6;">请先选择预设</p>
        </div>
        <div class="stitch-picker-footer">
          <button class="menu_button stitch-picker-confirm">确认添加</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '从其他预设添加');
    fixPopupOkButton();

    // 绑定事件
    setTimeout(async () => {
      const popup = document.querySelector('.stitch-other-preset-popup');
      if (!popup) return;

      const select = popup.querySelector('#stitch-other-preset-select');
      const entriesContainer = popup.querySelector('#stitch-other-preset-entries');

      // 预设选择变化
      select?.addEventListener('change', async () => {
        const presetName = select.value;
        if (!presetName) {
          entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">请先选择预设</p>';
          return;
        }

        entriesContainer.innerHTML = '<p style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</p>';

        try {
          // 重新获取最新的预设数据
          const { openai_setting_names, openai_settings } = await import('../../../openai.js');
          const presetIndex = openai_setting_names[presetName];
          const preset = openai_settings[presetIndex];

          if (!preset || !preset.prompts || preset.prompts.length === 0) {
            entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">该预设没有条目</p>';
            return;
          }

          // 过滤掉marker类型的条目
          const entries = preset.prompts.filter(p => !p.marker && p.name);

          if (entries.length === 0) {
            entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">该预设没有可添加的条目</p>';
            return;
          }

          const listHtml = entries.map(entry => `
            <div class="stitch-picker-item" data-identifier="${entry.identifier}">
              <input type="checkbox">
              <span class="picker-item-name">${entry.name}</span>
            </div>
          `).join('');

          entriesContainer.innerHTML = `<div class="stitch-picker-list">${listHtml}</div>`;

          // 保存当前预设数据供确认时使用
          popup.dataset.currentPreset = presetName;
        } catch (error) {
          logger.error('[PresetStitchUI] 加载预设条目失败:', error);
          entriesContainer.innerHTML = '<p style="text-align: center; color: #ff6b6b;">加载失败</p>';
        }
      });

      // 确认添加
      popup.querySelector('.stitch-picker-confirm')?.addEventListener('click', async () => {
        const selected = popup.querySelectorAll('.stitch-picker-item input:checked');
        const presetName = popup.dataset.currentPreset;

        if (!presetName) {
          toastr.warning('请先选择预设');
          return;
        }

        let addedCount = 0;

        // 重新获取预设数据
        const { openai_setting_names, openai_settings } = await import('../../../openai.js');
        const presetIndex = openai_setting_names[presetName];
        const preset = openai_settings[presetIndex];

        if (!preset || !preset.prompts) return;

        selected.forEach(checkbox => {
          const item = checkbox.closest('.stitch-picker-item');
          const identifier = item?.dataset.identifier;
          const entry = preset.prompts.find(p => p.identifier === identifier);

          if (entry) {
            stitchData.addItem({
              name: entry.name,
              content: entry.content || '',
              role: entry.role || 'system',
              source: 'preset'
            });
            addedCount++;
          }
        });

        if (addedCount > 0) {
          toastr.success(`已添加 ${addedCount} 个条目`);
          this.refreshEntryList();
        }
      });
    }, 100);
  }

  /**
   * 显示从其他预设添加的选择器
   * @description 先选择预设，再选择该预设中的条目
   */
  async showOtherPresetPicker() {
    // 获取预设列表
    let presetNames = [];
    let presetSettings = [];
    try {
      const { openai_setting_names, openai_settings } = await import('../../../openai.js');
      presetNames = Object.keys(openai_setting_names || {});
      presetSettings = openai_settings || [];
    } catch (error) {
      logger.error('[PresetStitchUI] 获取预设列表失败:', error);
      toastr.error('获取预设列表失败');
      return;
    }

    if (presetNames.length === 0) {
      toastr.warning('没有可用的预设');
      return;
    }

    const popupHtml = `
      <div class="stitch-other-preset-popup">
        <div class="stitch-preset-select">
          <label>选择预设：</label>
          <select class="text_pole" id="stitch-preset-select">
            <option value="">-- 请选择 --</option>
            ${presetNames.map(name => `<option value="${name}">${name}</option>`).join('')}
          </select>
        </div>
        <div class="stitch-preset-entries" id="stitch-preset-entries">
          <p style="text-align: center; opacity: 0.6;">请先选择预设</p>
        </div>
        <div class="stitch-picker-footer">
          <button class="menu_button stitch-picker-confirm">确认添加</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '从其他预设添加');
    fixPopupOkButton();

    // 绑定事件
    setTimeout(() => {
      const popup = document.querySelector('.stitch-other-preset-popup');
      if (!popup) return;

      const select = popup.querySelector('#stitch-preset-select');
      const entriesContainer = popup.querySelector('#stitch-preset-entries');
      let currentPresetEntries = []; // 存储当前选中预设的条目

      // 预设选择变化
      select?.addEventListener('change', async () => {
        const presetName = select.value;
        if (!presetName) {
          entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">请先选择预设</p>';
          currentPresetEntries = [];
          return;
        }

        entriesContainer.innerHTML = '<p style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</p>';

        try {
          const { openai_setting_names, openai_settings } = await import('../../../openai.js');
          const presetIndex = openai_setting_names[presetName];
          const preset = openai_settings[presetIndex];

          if (!preset || !preset.prompts || preset.prompts.length === 0) {
            entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">该预设没有条目</p>';
            currentPresetEntries = [];
            return;
          }

          // 过滤掉marker类型的条目
          currentPresetEntries = preset.prompts.filter(p => !p.marker && p.name);

          if (currentPresetEntries.length === 0) {
            entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">该预设没有可添加的条目</p>';
            return;
          }

          const listHtml = currentPresetEntries.map((entry, index) => `
            <div class="stitch-picker-item" data-index="${index}">
              <input type="checkbox">
              <span class="picker-item-name">${entry.name}</span>
            </div>
          `).join('');

          entriesContainer.innerHTML = `<div class="stitch-picker-list">${listHtml}</div>`;
        } catch (error) {
          logger.error('[PresetStitchUI] 加载预设条目失败:', error);
          entriesContainer.innerHTML = '<p style="text-align: center; color: #ff6b6b;">加载失败</p>';
          currentPresetEntries = [];
        }
      });

      // 确认添加
      popup.querySelector('.stitch-picker-confirm')?.addEventListener('click', () => {
        const selected = popup.querySelectorAll('.stitch-picker-item input:checked');
        let addedCount = 0;

        selected.forEach(checkbox => {
          const item = checkbox.closest('.stitch-picker-item');
          const index = parseInt(item?.dataset.index);
          const entry = currentPresetEntries[index];

          if (entry) {
            stitchData.addItem({
              name: entry.name,
              content: entry.content || '',
              role: entry.role || 'system',
              source: 'preset'
            });
            addedCount++;
          }
        });

        if (addedCount > 0) {
          toastr.success(`已添加 ${addedCount} 个条目`);
          this.refreshEntryList();
        }
      });
    }, 100);
  }

  /**
   * 显示从世界书添加的选择器
   */
  async showWorldBookPicker() {
    // 获取世界书列表（world_names 是导出的变量，不是函数）
    let worldList = [];
    try {
      const { world_names } = await import('../../../world-info.js');
      worldList = world_names || [];
    } catch (error) {
      logger.error('[PresetStitchUI] 获取世界书列表失败:', error);
      toastr.error('获取世界书列表失败');
      return;
    }

    if (worldList.length === 0) {
      toastr.warning('没有可用的世界书');
      return;
    }

    const popupHtml = `
      <div class="stitch-worldbook-popup">
        <div class="stitch-worldbook-select">
          <label>选择世界书：</label>
          <select class="text_pole" id="stitch-worldbook-select">
            <option value="">-- 请选择 --</option>
            ${worldList.map(name => `<option value="${name}">${name}</option>`).join('')}
          </select>
        </div>
        <div class="stitch-worldbook-entries" id="stitch-worldbook-entries">
          <p style="text-align: center; opacity: 0.6;">请先选择世界书</p>
        </div>
        <div class="stitch-picker-footer">
          <button class="menu_button stitch-picker-confirm">确认添加</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '从世界书添加');
    fixPopupOkButton();

    // 绑定事件
    setTimeout(() => {
      const popup = document.querySelector('.stitch-worldbook-popup');
      if (!popup) return;

      const select = popup.querySelector('#stitch-worldbook-select');
      const entriesContainer = popup.querySelector('#stitch-worldbook-entries');

      // 世界书选择变化
      select?.addEventListener('change', async () => {
        const worldName = select.value;
        if (!worldName) {
          entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">请先选择世界书</p>';
          return;
        }

        entriesContainer.innerHTML = '<p style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</p>';

        try {
          const { loadWorldInfo } = await import('../../../world-info.js');
          const data = await loadWorldInfo(worldName);

          if (!data || !data.entries || Object.keys(data.entries).length === 0) {
            entriesContainer.innerHTML = '<p style="text-align: center; opacity: 0.6;">该世界书没有条目</p>';
            return;
          }

          const listHtml = Object.entries(data.entries).map(([uid, entry]) => {
            const name = entry.comment || '未命名条目';
            return `
              <div class="stitch-picker-item" data-uid="${uid}" data-world="${worldName}">
                <input type="checkbox">
                <span class="picker-item-name">${name}</span>
              </div>
            `;
          }).join('');

          entriesContainer.innerHTML = `<div class="stitch-picker-list">${listHtml}</div>`;
        } catch (error) {
          logger.error('[PresetStitchUI] 加载世界书条目失败:', error);
          entriesContainer.innerHTML = '<p style="text-align: center; color: #ff6b6b;">加载失败</p>';
        }
      });

      // 确认添加
      popup.querySelector('.stitch-picker-confirm')?.addEventListener('click', async () => {
        const selected = popup.querySelectorAll('.stitch-picker-item input:checked');
        let addedCount = 0;

        for (const checkbox of selected) {
          const item = checkbox.closest('.stitch-picker-item');
          const uid = item?.dataset.uid;
          const worldName = item?.dataset.world;

          if (uid && worldName) {
            try {
              const { loadWorldInfo } = await import('../../../world-info.js');
              const data = await loadWorldInfo(worldName);
              const entry = data?.entries?.[uid];

              if (entry) {
                stitchData.addItem({
                  name: entry.comment || '未命名条目',
                  content: entry.content || '',
                  role: 'system',
                  source: 'worldbook'
                });
                addedCount++;
              }
            } catch (error) {
              logger.error('[PresetStitchUI] 添加世界书条目失败:', error);
            }
          }
        }

        if (addedCount > 0) {
          toastr.success(`已添加 ${addedCount} 个条目`);
          this.refreshEntryList();
        }
      });
    }, 100);
  }


  /**
   * 显示手动创建表单
   */
  async showManualCreateForm() {
    const tags = stitchData.getTags();

    const popupHtml = `
      <div class="stitch-create-form">
        <div class="stitch-form-row">
          <label>名称 <span style="color: #ff6b6b;">*</span></label>
          <input type="text" class="text_pole" id="stitch-create-name" placeholder="条目名称">
        </div>
        <div class="stitch-form-row">
          <label>内容 <span style="color: #ff6b6b;">*</span></label>
          <textarea class="text_pole" id="stitch-create-content" rows="6" placeholder="提示词内容"></textarea>
        </div>
        <div class="stitch-form-row">
          <label>角色</label>
          <select class="text_pole" id="stitch-create-role">
            <option value="system">System</option>
            <option value="user">User</option>
            <option value="assistant">Assistant</option>
          </select>
        </div>
        <div class="stitch-form-row">
          <label>标签</label>
          <div class="stitch-tag-selector" id="stitch-create-tags">
            ${tags.map(tag => `
              <label class="stitch-tag-checkbox">
                <input type="checkbox" value="${tag}">
                <span>${tag}</span>
              </label>
            `).join('')}
            ${tags.length === 0 ? '<span style="opacity: 0.6;">暂无标签</span>' : ''}
          </div>
        </div>
        <div class="stitch-form-footer">
          <button class="menu_button stitch-create-confirm">创建</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '手动创建条目');
    fixPopupOkButton();

    setTimeout(() => {
      const popup = document.querySelector('.stitch-create-form');
      if (!popup) return;

      popup.querySelector('.stitch-create-confirm')?.addEventListener('click', () => {
        const name = popup.querySelector('#stitch-create-name')?.value?.trim();
        const content = popup.querySelector('#stitch-create-content')?.value?.trim();
        const role = popup.querySelector('#stitch-create-role')?.value || 'system';

        // 获取选中的标签
        const selectedTags = [];
        popup.querySelectorAll('#stitch-create-tags input:checked').forEach(cb => {
          selectedTags.push(cb.value);
        });

        if (!name) {
          toastr.warning('请输入条目名称');
          return;
        }
        if (!content) {
          toastr.warning('请输入条目内容');
          return;
        }

        const id = stitchData.addItem({
          name,
          content,
          role,
          tags: selectedTags,
          source: 'manual'
        });

        if (id) {
          toastr.success('条目已创建');
          this.refreshEntryList();
        }
      });
    }, 100);
  }

  /**
   * 显示编辑表单
   * @param {string} id - 条目 ID
   */
  async showEditForm(id) {
    const item = stitchData.getItemById(id);
    if (!item) return;

    const tags = stitchData.getTags();

    const popupHtml = `
      <div class="stitch-edit-form">
        <div class="stitch-form-row-inline">
          <div class="stitch-form-field">
            <label>名称</label>
            <input type="text" class="text_pole" id="stitch-edit-name" value="${item.name}">
          </div>
          <div class="stitch-form-field stitch-form-field-small">
            <label>角色</label>
            <select class="text_pole" id="stitch-edit-role">
              <option value="system" ${item.role === 'system' ? 'selected' : ''}>System</option>
              <option value="user" ${item.role === 'user' ? 'selected' : ''}>User</option>
              <option value="assistant" ${item.role === 'assistant' ? 'selected' : ''}>Assistant</option>
            </select>
          </div>
        </div>
        <div class="stitch-form-row">
          <label>内容</label>
          <textarea class="text_pole" id="stitch-edit-content" rows="6">${item.content}</textarea>
        </div>
        <div class="stitch-form-row">
          <label>标签</label>
          <div class="stitch-tag-selector" id="stitch-edit-tags">
            ${tags.map(tag => `
              <label class="stitch-tag-checkbox">
                <input type="checkbox" value="${tag}" ${item.tags?.includes(tag) ? 'checked' : ''}>
                <span>${tag}</span>
              </label>
            `).join('')}
            ${tags.length === 0 ? '<span style="opacity: 0.6; font-size: 0.9em;">暂无标签</span>' : ''}
          </div>
        </div>
        <div class="stitch-form-footer">
          <button class="menu_button stitch-edit-save">保存</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '编辑条目');
    fixPopupOkButton();

    setTimeout(() => {
      const popup = document.querySelector('.stitch-edit-form');
      if (!popup) return;

      popup.querySelector('.stitch-edit-save')?.addEventListener('click', () => {
        const name = popup.querySelector('#stitch-edit-name')?.value?.trim();
        const content = popup.querySelector('#stitch-edit-content')?.value?.trim();
        const role = popup.querySelector('#stitch-edit-role')?.value;

        const selectedTags = [];
        popup.querySelectorAll('#stitch-edit-tags input:checked').forEach(cb => {
          selectedTags.push(cb.value);
        });

        if (!name) {
          toastr.warning('名称不能为空');
          return;
        }

        stitchData.updateItem(id, {
          name,
          content,
          role,
          tags: selectedTags
        });

        toastr.success('条目已更新');
        this.refreshEntryList();
      });
    }, 100);
  }

  // ========================================
  // 插入功能
  // ========================================

  /**
   * 显示单个条目插入位置选择弹窗
   * @param {string} id - 条目 ID
   */
  async showInsertPositionDialog(id) {
    const item = stitchData.getItemById(id);
    if (!item) return;

    const popupHtml = `
      <div class="stitch-insert-popup">
        <p>将插入条目：<strong>${item.name}</strong></p>
        <div class="stitch-form-row">
          <label>选择插入位置：</label>
          <select class="text_pole" id="stitch-insert-position">
            ${this.renderPositionOptionsHtml()}
          </select>
        </div>
        <div class="stitch-form-footer">
          <button class="menu_button stitch-insert-confirm">确认插入</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '插入条目');
    fixPopupOkButton();

    setTimeout(() => {
      const popup = document.querySelector('.stitch-insert-popup');
      if (!popup) return;

      popup.querySelector('.stitch-insert-confirm')?.addEventListener('click', async () => {
        const position = popup.querySelector('#stitch-insert-position')?.value;

        if (!position) {
          toastr.warning('请选择插入位置');
          return;
        }

        await this.insertEntry(id, position);
      });
    }, 100);
  }

  /**
   * 插入单个条目到预设
   * @param {string} id - 条目 ID
   * @param {string} position - 插入位置
   */
  async insertEntry(id, position) {
    const item = stitchData.getItemById(id);
    if (!item) return;

    try {
      await this.module.insertEntryToPreset(item, position);
      toastr.success(`已插入"${item.name}"`);
    } catch (error) {
      logger.error('[PresetStitchUI] 插入条目失败:', error);
      toastr.error('插入失败');
    }
  }

  /**
   * 显示批量插入对话框
   */
  async showBatchInsertDialog() {
    if (this.selectedItems.size === 0) {
      toastr.warning('请先选择要插入的条目');
      return;
    }

    const popupHtml = `
      <div class="stitch-batch-popup">
        <p>将插入 <strong>${this.selectedItems.size}</strong> 个条目</p>
        <div class="stitch-form-row">
          <label>插入位置：</label>
          <select class="text_pole" id="stitch-batch-position">
            <option value="">选择位置...</option>
            ${this.renderPositionOptionsHtml()}
          </select>
        </div>
        <div class="stitch-form-footer">
          <button class="menu_button stitch-batch-confirm">确认插入</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '批量插入');
    fixPopupOkButton();

    setTimeout(() => {
      const popup = document.querySelector('.stitch-batch-popup');
      if (!popup) return;

      popup.querySelector('.stitch-batch-confirm')?.addEventListener('click', async () => {
        const position = popup.querySelector('#stitch-batch-position')?.value;

        if (!position) {
          toastr.warning('请选择插入位置');
          return;
        }

        let insertedCount = 0;
        let currentPosition = position;

        // 按顺序插入
        for (const id of this.selectedItems) {
          const item = stitchData.getItemById(id);
          if (item) {
            try {
              const newIdentifier = await this.module.insertEntryToPreset(item, currentPosition);
              if (newIdentifier) {
                // 下一个条目插入到刚插入的条目之后
                currentPosition = newIdentifier;
                insertedCount++;
              }
            } catch (error) {
              logger.error('[PresetStitchUI] 批量插入失败:', error);
            }
          }
        }

        if (insertedCount > 0) {
          toastr.success(`已插入 ${insertedCount} 个条目`);
          this.selectedItems.clear();
          this.refreshEntryList();
          this.updateSelectedCount();
        }
      });
    }, 100);
  }

  /**
   * 显示批量打标签对话框
   */
  async showBatchTagDialog() {
    if (this.selectedItems.size === 0) {
      toastr.warning('请先选择要打标签的条目');
      return;
    }

    const tags = stitchData.getTags();

    if (tags.length === 0) {
      toastr.warning('请先创建标签');
      return;
    }

    const popupHtml = `
      <div class="stitch-batch-tag-popup">
        <p>为 <strong>${this.selectedItems.size}</strong> 个条目添加标签：</p>
        <div class="stitch-tag-selector" id="stitch-batch-tag-select">
          ${tags.map(tag => `
            <label class="stitch-tag-checkbox">
              <input type="checkbox" value="${tag}">
              <span>${tag}</span>
            </label>
          `).join('')}
        </div>
        <div class="stitch-form-footer">
          <button class="menu_button stitch-batch-tag-confirm">确认添加</button>
        </div>
      </div>
    `;

    callGenericPopup(popupHtml, 1, '批量打标签');
    fixPopupOkButton();

    setTimeout(() => {
      const popup = document.querySelector('.stitch-batch-tag-popup');
      if (!popup) return;

      popup.querySelector('.stitch-batch-tag-confirm')?.addEventListener('click', () => {
        // 获取选中的标签
        const selectedTags = [];
        popup.querySelectorAll('#stitch-batch-tag-select input:checked').forEach(cb => {
          selectedTags.push(cb.value);
        });

        if (selectedTags.length === 0) {
          toastr.warning('请至少选择一个标签');
          return;
        }

        // 批量给条目添加标签
        let updatedCount = 0;
        for (const id of this.selectedItems) {
          const item = stitchData.getItemById(id);
          if (item) {
            // 合并现有标签和新标签（去重）
            const existingTags = item.tags || [];
            const mergedTags = [...new Set([...existingTags, ...selectedTags])];
            stitchData.updateItem(id, { tags: mergedTags });
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          toastr.success(`已为 ${updatedCount} 个条目添加标签`);
          this.refreshEntryList();
          this.refreshTagBar();
        }
      });
    }, 100);
  }

  /**
   * 显示批量删除确认对话框
   */
  async showBatchDeleteDialog() {
    if (this.selectedItems.size === 0) {
      toastr.warning('请先选择要删除的条目');
      return;
    }

    const confirmed = await callGenericPopup(
      `<p style="text-align: center;">确定要删除选中的 <strong>${this.selectedItems.size}</strong> 个条目吗？</p>
       <p style="text-align: center; font-size: 0.85em; opacity: 0.7;">此操作不可撤销</p>`,
      2 // POPUP_TYPE.CONFIRM
    );

    if (confirmed) {
      let deletedCount = 0;
      for (const id of this.selectedItems) {
        stitchData.deleteItem(id);
        deletedCount++;
      }

      this.selectedItems.clear();
      toastr.info(`已删除 ${deletedCount} 个条目`);
      this.refreshEntryList();
      this.updateSelectedCount();
    }
  }

  /**
   * 销毁 UI
   */
  destroy() {
    this.popupEl = null;
    this.selectedItems.clear();
  }
}
