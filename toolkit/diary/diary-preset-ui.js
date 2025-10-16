/**
 * 日记预设UI管理器
 * 
 * @description
 * 负责预设面板的UI渲染和交互：
 * - 渲染预设列表（头部预设 + 固定构建提示词 + 尾部预设）
 * - 拖拽排序（固定条目不可移动）
 * - 添加/编辑/删除预设弹窗
 * - 导入/导出按钮
 * 
 * @module DiaryPresetUI
 */

// ========================================
// [IMPORT] SillyTavern 原生 API
// ========================================
import { callGenericPopup, POPUP_TYPE } from '../../../../../popup.js';
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from './diary-toast.js';

// ========================================
// [CONST] 常量
// ========================================
const FIXED_PRESET_ID = 'FIXED_CONTEXT';
const FIXED_DIARY_PRESET_ID = 'FIXED_DIARY';

// ========================================
// [CORE] 预设UI管理类
// ========================================

/**
 * 日记预设UI管理器
 * 
 * @class DiaryPresetUI
 */
export class DiaryPresetUI {
  /**
   * 创建预设UI管理器
   * 
   * @param {import('./diary-preset-data.js').DiaryPresetDataManager} dataManager - 数据管理器
   */
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.panelElement = null;
    this.isOpen = false;
    this.sortable = null;
  }

  /**
   * 初始化
   */
  init() {
    this.createPanel();
    this.bindEvents();

    logger.info('[DiaryPresetUI] 初始化完成');
  }

  /**
   * 创建预设面板
   */
  createPanel() {
    // 创建面板容器（类似设置面板）
    const panel = document.createElement('div');
    panel.className = 'diary-preset-panel';  // 默认隐藏，通过 CSS 控制
    panel.innerHTML = `
      <div class="diary-preset-header">
        <h3>日记评论预设管理</h3>
        <div class="diary-preset-actions-left">
          <button class="diary-preset-btn" id="diaryPresetImport" title="导入预设">
            <span class="fa-solid fa-file-import"></span>
          </button>
          <button class="diary-preset-btn" id="diaryPresetExport" title="导出预设">
            <span class="fa-solid fa-file-export"></span>
          </button>
        </div>
        <button class="diary-preset-btn-add" id="diaryPresetAdd" title="添加预设">
          <span class="fa-solid fa-plus"></span>
        </button>
      </div>
      <div class="diary-preset-list" id="diaryPresetList">
        <!-- 预设列表动态生成 -->
      </div>
    `;

    // 插入到日记面板中（在工具栏下方）
    const diaryPanel = document.querySelector('#diaryPanel');
    if (diaryPanel) {
      // 找到工具栏
      const toolbar = diaryPanel.querySelector('.diary-toolbar');
      if (toolbar) {
        toolbar.after(panel);
      } else {
        diaryPanel.appendChild(panel);
      }
    } else {
      logger.error('[DiaryPresetUI.createPanel] 未找到日记面板容器 #diaryPanel');
    }

    this.panelElement = panel;

    logger.debug('[DiaryPresetUI] 预设面板已创建');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 添加预设
    document.getElementById('diaryPresetAdd')?.addEventListener('click', () => {
      this.showAddPresetDialog();
    });

    // 导入
    document.getElementById('diaryPresetImport')?.addEventListener('click', () => {
      this.showImportDialog();
    });

    // 导出
    document.getElementById('diaryPresetExport')?.addEventListener('click', () => {
      this.exportPresets();
    });
  }

  /**
   * 切换面板显示
   */
  toggle() {
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * 打开面板
   */
  open() {
    if (!this.panelElement) return;

    this.isOpen = true;
    this.panelElement.classList.add('active');
    this.render();

    logger.debug('[DiaryPresetUI] 预设面板已打开');
  }

  /**
   * 关闭面板
   */
  close() {
    if (!this.panelElement) return;

    this.isOpen = false;
    this.panelElement.classList.remove('active');

    logger.debug('[DiaryPresetUI] 预设面板已关闭');
  }

  /**
   * 渲染预设列表
   */
  render() {
    const listElement = document.getElementById('diaryPresetList');
    if (!listElement) return;

    const presets = this.dataManager.getPresets(true);  // 包含固定条目

    if (presets.length === 0) {
      listElement.innerHTML = '<div class="diary-preset-empty">暂无预设，点击"添加预设"开始创建</div>';
      return;
    }

    listElement.innerHTML = '';

    presets.forEach(preset => {
      const item = this.createPresetItem(preset);
      listElement.appendChild(item);
    });

    // 初始化拖拽排序
    this.initSortable();

    logger.debug('[DiaryPresetUI] 已渲染', presets.length, '个预设');
  }

  /**
   * 创建预设条目元素
   * 
   * @param {Object} preset - 预设对象
   * @returns {HTMLElement}
   */
  createPresetItem(preset) {
    const item = document.createElement('div');
    item.className = 'diary-preset-item';
    item.dataset.presetId = preset.id;

    // 固定条目特殊样式
    if (preset.locked) {
      item.classList.add('diary-preset-fixed');
    }

    // 禁用状态
    if (!preset.enabled) {
      item.classList.add('diary-preset-disabled');
    }

    // 角色类型标签
    const roleClass = `diary-preset-role-${preset.role}`;

    // 区分两种锁定状态：
    // - FIXED_PRESET_ID（构建提示词）：完全不可操作
    // - FIXED_DIARY_PRESET_ID（日记提示词）：可以编辑和禁用，但不能删除
    const isConstructPreset = preset.id === FIXED_PRESET_ID;
    const isDiaryPreset = preset.id === FIXED_DIARY_PRESET_ID;

    // 构建提示词：简化显示（没有任何按钮）
    if (isConstructPreset) {
      item.innerHTML = `
        <div class="diary-preset-content" style="flex: 1;">
          <div class="diary-preset-name">${this.escapeHtml(preset.name)}</div>
        </div>
      `;
    }
    // 日记提示词：可以编辑和禁用，但不能删除（没有拖拽手柄）
    else if (isDiaryPreset) {
      item.innerHTML = `
        <div class="diary-preset-role ${roleClass}">${this.getRoleLabel(preset.role)}</div>
        <div class="diary-preset-content">
          <div class="diary-preset-name">${this.escapeHtml(preset.name)}</div>
        </div>
        <div class="diary-preset-actions">
          <button class="diary-preset-btn-icon diary-preset-toggle" data-id="${preset.id}" title="${preset.enabled ? '禁用' : '启用'}">
            <span class="fa-solid ${preset.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></span>
          </button>
          <button class="diary-preset-btn-icon diary-preset-edit" data-id="${preset.id}" title="编辑">
            <span class="fa-solid fa-pencil fa-xs"></span>
          </button>
        </div>
      `;
    }
    // 普通预设：完整功能（拖拽、编辑、删除）
    else {
      item.innerHTML = `
        <div class="diary-preset-drag-handle" title="拖动排序">
          ☰
        </div>
        <div class="diary-preset-role ${roleClass}">${this.getRoleLabel(preset.role)}</div>
        <div class="diary-preset-content">
          <div class="diary-preset-name">${this.escapeHtml(preset.name)}</div>
        </div>
        <div class="diary-preset-actions">
          <button class="diary-preset-btn-icon diary-preset-toggle" data-id="${preset.id}" title="${preset.enabled ? '禁用' : '启用'}">
            <span class="fa-solid ${preset.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></span>
          </button>
          <button class="diary-preset-btn-icon diary-preset-edit" data-id="${preset.id}" title="编辑">
            <span class="fa-solid fa-pencil fa-xs"></span>
          </button>
          <button class="diary-preset-btn-icon diary-preset-delete" data-id="${preset.id}" title="删除预设">
            <span class="fa-solid fa-trash-can"></span>
          </button>
        </div>
      `;
    }

    // 绑定事件
    // 构建提示词：完全不可操作
    if (isConstructPreset) {
      // 没有任何事件
    }
    // 日记提示词：可以编辑和禁用
    else if (isDiaryPreset) {
      item.querySelector('.diary-preset-toggle')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this.togglePreset(btn.dataset.id);
      });

      item.querySelector('.diary-preset-edit')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this.showEditPresetDialog(btn.dataset.id);
      });
    }
    // 普通预设：完整事件
    else {
      item.querySelector('.diary-preset-toggle')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this.togglePreset(btn.dataset.id);
      });

      item.querySelector('.diary-preset-edit')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this.showEditPresetDialog(btn.dataset.id);
      });

      item.querySelector('.diary-preset-delete')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this.deletePreset(btn.dataset.id);
      });
    }

    return item;
  }

  /**
   * 初始化拖拽排序
   */
  initSortable() {
    const listElement = document.getElementById('diaryPresetList');
    if (!listElement) return;

    // 销毁旧的 sortable 实例
    if (this.sortable) {
      this.sortable.destroy();
    }

    // 使用原生拖拽API
    const items = listElement.querySelectorAll('.diary-preset-item:not(.diary-preset-fixed)');

    items.forEach(item => {
      item.draggable = true;

      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.innerHTML);
      });

      item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
        this.updateOrder();
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const dragging = listElement.querySelector('.dragging');
        if (dragging && dragging !== item && !item.classList.contains('diary-preset-fixed')) {
          const rect = item.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          if (e.clientY < midY) {
            item.parentNode.insertBefore(dragging, item);
          } else {
            item.parentNode.insertBefore(dragging, item.nextSibling);
          }
        }
      });
    });

    logger.debug('[DiaryPresetUI] 拖拽排序已初始化');
  }

  /**
   * 更新预设顺序
   */
  updateOrder() {
    const listElement = document.getElementById('diaryPresetList');
    if (!listElement) return;

    const items = Array.from(listElement.querySelectorAll('.diary-preset-item'));
    const fixedIndex = items.findIndex(item => item.classList.contains('diary-preset-fixed'));

    // 分别获取固定条目前后的预设ID
    const beforeFixed = [];
    const afterFixed = [];

    items.forEach((item, index) => {
      if (item.classList.contains('diary-preset-fixed')) return;

      const presetId = item.dataset.presetId;
      if (index < fixedIndex) {
        beforeFixed.push(presetId);
      } else {
        afterFixed.push(presetId);
      }
    });

    this.dataManager.updateOrderWithFixed(beforeFixed, afterFixed);

    logger.debug('[DiaryPresetUI] 预设顺序已更新');
  }

  /**
   * 切换预设启用状态
   * 
   * @param {string} id - 预设ID
   */
  togglePreset(id) {
    const success = this.dataManager.togglePreset(id);
    if (success) {
      this.render();
      logger.debug('[DiaryPresetUI.togglePreset] 已切换预设状态:', id);
    }
  }

  /**
   * 删除预设
   * 
   * @param {string} id - 预设ID
   */
  async deletePreset(id) {
    const confirmed = await callGenericPopup('确定要删除这个预设吗？', POPUP_TYPE.CONFIRM);
    if (!confirmed) return;

    this.dataManager.deletePreset(id);
    this.render();

    showSuccessToast('预设已删除');
  }

  /**
   * 显示添加预设对话框
   */
  async showAddPresetDialog() {
    return new Promise((resolve) => {
      // 创建弹窗元素
      const overlay = document.createElement('div');
      overlay.className = 'diary-preset-dialog-overlay';
      overlay.innerHTML = `
        <div class="diary-preset-dialog-container">
          ${this.createPresetDialogHTML()}
          <div class="diary-preset-dialog-field">
            <label>位置</label>
            <select id="diaryPresetDialogPosition" class="text_pole">
              <option value="before">固定构建提示词之前</option>
              <option value="after">固定构建提示词之后</option>
            </select>
          </div>
          <div class="diary-preset-dialog-buttons">
            <button class="diary-preset-dialog-btn diary-preset-dialog-cancel">取消</button>
            <button class="diary-preset-dialog-btn diary-preset-dialog-ok">添加</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 绑定事件
      const cancelBtn = overlay.querySelector('.diary-preset-dialog-cancel');
      const okBtn = overlay.querySelector('.diary-preset-dialog-ok');

      const close = () => {
        overlay.remove();
        resolve(false);
      };

      const save = () => {
        const name = overlay.querySelector('#diaryPresetDialogName')?.value || '未命名预设';
        const role = overlay.querySelector('#diaryPresetDialogRole')?.value || 'system';
        const content = overlay.querySelector('#diaryPresetDialogContent')?.value || '';
        const position = overlay.querySelector('#diaryPresetDialogPosition')?.value || 'before';

        // 计算 order
        const order = position === 'before' ? this.getMaxOrderBefore() + 100 : this.getMaxOrderAfter() + 100;

        logger.debug('[DiaryPresetUI.showAddPresetDialog] 添加预设:', { name, role, position, order });

        this.dataManager.addPreset({ name, role, content, order });
        this.render();

        showSuccessToast('预设已添加');

        overlay.remove();
        resolve(true);
      };

      cancelBtn.addEventListener('click', close);
      okBtn.addEventListener('click', save);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    });
  }

  /**
   * 获取固定条目前的最大 order
   */
  getMaxOrderBefore() {
    const presets = this.dataManager.presets.filter(p => p.order < 500);
    return presets.length > 0 ? Math.max(...presets.map(p => p.order)) : 0;
  }

  /**
   * 获取固定条目后的最大 order
   */
  getMaxOrderAfter() {
    const presets = this.dataManager.presets.filter(p => p.order > 500);
    return presets.length > 0 ? Math.max(...presets.map(p => p.order)) : 500;
  }

  /**
   * 显示编辑预设对话框
   * 
   * @param {string} id - 预设ID
   */
  async showEditPresetDialog(id) {
    const preset = this.dataManager.getPreset(id);
    if (!preset) {
      logger.warn('[DiaryPresetUI.showEditPresetDialog] 预设不存在:', id);
      return;
    }

    return new Promise((resolve) => {
      // 创建弹窗元素
      const overlay = document.createElement('div');
      overlay.className = 'diary-preset-dialog-overlay';
      overlay.innerHTML = `
        <div class="diary-preset-dialog-container">
          ${this.createPresetDialogHTML(preset)}
          <div class="diary-preset-dialog-buttons">
            <button class="diary-preset-dialog-btn diary-preset-dialog-cancel">取消</button>
            <button class="diary-preset-dialog-btn diary-preset-dialog-ok">保存</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 绑定事件
      const cancelBtn = overlay.querySelector('.diary-preset-dialog-cancel');
      const okBtn = overlay.querySelector('.diary-preset-dialog-ok');

      const close = () => {
        overlay.remove();
        resolve(false);
      };

      const save = () => {
        const name = overlay.querySelector('#diaryPresetDialogName')?.value || preset.name;
        const role = overlay.querySelector('#diaryPresetDialogRole')?.value || preset.role;
        const content = overlay.querySelector('#diaryPresetDialogContent')?.value || preset.content;

        logger.debug('[DiaryPresetUI.showEditPresetDialog] 更新前:', { name: preset.name, role: preset.role });
        logger.debug('[DiaryPresetUI.showEditPresetDialog] 更新后:', { name, role, content: content.substring(0, 50) });

        this.dataManager.updatePreset(id, { name, role, content });
        this.render();

        showSuccessToast('预设已保存');

        overlay.remove();
        resolve(true);
      };

      cancelBtn.addEventListener('click', close);
      okBtn.addEventListener('click', save);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    });
  }

  /**
   * 创建预设对话框HTML
   * 
   * @param {Object|null} preset - 预设对象（编辑模式）
   * @returns {string}
   */
  createPresetDialogHTML(preset = null) {
    const isEdit = preset !== null;
    const name = preset?.name || '';
    const role = preset?.role || 'system';
    const content = preset?.content || '';

    return `
      <div class="diary-preset-dialog">
        <div class="diary-preset-dialog-field">
          <label>预设名称</label>
          <input type="text" id="diaryPresetDialogName" class="text_pole" value="${this.escapeHtml(name)}" placeholder="例如: 破限提示词">
        </div>
        <div class="diary-preset-dialog-field">
          <label>角色类型</label>
          <select id="diaryPresetDialogRole" class="text_pole">
            <option value="system" ${role === 'system' ? 'selected' : ''}>系统 (system)</option>
            <option value="user" ${role === 'user' ? 'selected' : ''}>用户 (user)</option>
            <option value="assistant" ${role === 'assistant' ? 'selected' : ''}>助手 (assistant)</option>
          </select>
        </div>
        <div class="diary-preset-dialog-field">
          <label>预设内容</label>
          <textarea id="diaryPresetDialogContent" class="text_pole" rows="10" placeholder="输入你的提示词内容...">${this.escapeHtml(content)}</textarea>
        </div>
      </div>
    `;
  }

  /**
   * 显示导入对话框
   */
  async showImportDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const result = this.dataManager.importPresets(text, false);

        this.render();
        showSuccessToast(`导入完成: ${result.success} 成功, ${result.skipped} 跳过`);

      } catch (error) {
        showErrorToast('导入失败：' + error.message);
      }
    });

    input.click();
  }

  /**
   * 导出预设
   */
  exportPresets() {
    try {
      this.dataManager.downloadPresets();
      showSuccessToast('预设已导出');
    } catch (error) {
      showErrorToast('导出失败：' + error.message);
    }
  }

  /**
   * 获取角色标签
   * 
   * @param {string} role - 角色类型
   * @returns {string}
   */
  getRoleLabel(role) {
    const labels = {
      'system': '系统',
      'user': '用户',
      'assistant': '助手'
    };
    return labels[role] || role;
  }

  /**
   * HTML转义
   * 
   * @param {string} text - 文本
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

