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
// (不再需要固定条目常量)

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
      <div class="diary-preset-search">
        <input type="text" id="diaryPresetSearch" class="text_pole" placeholder="搜索预设..." />
        <span class="fa-solid fa-magnifying-glass diary-preset-search-icon"></span>
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

    // 搜索
    const searchInput = document.getElementById('diaryPresetSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterPresets(e.target.value);
      });
    }
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

    const presets = this.dataManager.getPresets();  // 获取所有预设

    if (presets.length === 0) {
      listElement.innerHTML = '<div class="diary-preset-empty">暂无预设，点击"添加预设"开始创建</div>';
      return;
    }

    listElement.innerHTML = '';

    // 分组渲染：日记指令和其他预设
    const diaryInstructions = presets.filter(p => p.type === 'instruction');
    const otherPresets = presets.filter(p => p.type !== 'instruction');

    // 创建分组（总是显示，即使为空）
    const group = this.createDiaryInstructionGroup(diaryInstructions);

    // 获取分组的保存位置
    const savedPosition = parseInt(localStorage.getItem('diary-instruction-group-position') || '-1');

    // 渲染所有预设和分组（按照位置）
    let insertedGroup = false;
    otherPresets.forEach((preset, index) => {
      // 如果到达分组应该插入的位置，先插入分组
      if (index === savedPosition && !insertedGroup) {
        listElement.appendChild(group);
        insertedGroup = true;
      }
      const item = this.createPresetItem(preset);
      listElement.appendChild(item);
    });

    // 如果分组还没插入（位置在末尾或无效位置），在末尾插入
    if (!insertedGroup) {
      listElement.appendChild(group);
    }

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

    // 禁用状态
    if (!preset.enabled) {
      item.classList.add('diary-preset-disabled');
    }

    // 角色类型标签
    const roleClass = `diary-preset-role-${preset.role}`;

    // 上下文条目：显示"动态生成"提示
    const isContextPreset = preset.type === 'context';

    // 统一渲染：拖拽手柄 + 角色标签 + 内容 + 操作按钮
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

    // 绑定事件（所有条目统一处理）
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

    // 使用原生拖拽API（所有条目都可拖拽，包括分组内的和分组本身）
    const items = listElement.querySelectorAll('.diary-preset-item');
    const groups = listElement.querySelectorAll('.diary-preset-group');

    items.forEach(item => {
      item.draggable = true;

      // 检查条目是否在分组内
      const isInGroup = item.closest('.diary-preset-group-content');

      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.innerHTML);
        // 标记是否在分组内
        if (isInGroup) {
          item.dataset.fromGroup = 'true';
        }
      });

      item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
        delete item.dataset.fromGroup;
        this.updateOrder();
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const dragging = listElement.querySelector('.dragging');
        if (dragging && dragging !== item) {
          // 检查拖拽的条目和目标条目是否都在同一个容器内
          const draggingInGroup = dragging.dataset.fromGroup === 'true';
          const targetInGroup = item.closest('.diary-preset-group-content');

          // 只允许同一容器内的拖拽
          if ((draggingInGroup && targetInGroup) || (!draggingInGroup && !targetInGroup)) {
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            if (e.clientY < midY) {
              item.parentNode.insertBefore(dragging, item);
            } else {
              item.parentNode.insertBefore(dragging, item.nextSibling);
            }
          }
        }
      });
    });

    // 让分组也可以拖拽
    groups.forEach(group => {
      const header = group.querySelector('.diary-preset-group-header');
      if (!header) return;

      // 给分组设置可拖拽属性
      group.draggable = true;
      group.dataset.groupId = 'diary-instructions'; // 标记为分组

      // 拖拽开始
      group.addEventListener('dragstart', (e) => {
        group.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', group.innerHTML);
      });

      // 拖拽结束
      group.addEventListener('dragend', (e) => {
        group.classList.remove('dragging');
        this.updateOrder();
      });

      // 在分组上方拖拽时
      group.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const dragging = listElement.querySelector('.dragging');
        if (dragging && dragging !== group) {
          const rect = group.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;

          if (e.clientY < midY) {
            listElement.insertBefore(dragging, group);
          } else {
            listElement.insertBefore(dragging, group.nextSibling);
          }
        }
      });

      // 阻止拖拽手柄之外的区域触发拖拽（避免和折叠冲突）
      header.addEventListener('mousedown', (e) => {
        const isDragHandle = e.target.closest('.diary-preset-drag-handle');
        if (!isDragHandle) {
          // 如果不是拖拽手柄，禁用拖拽
          group.draggable = false;
          // 恢复拖拽能力（延迟，避免影响当前操作）
          setTimeout(() => {
            group.draggable = true;
          }, 10);
        }
      });
    });

    logger.debug('[DiaryPresetUI] 拖拽排序已初始化（包含分组）');
  }

  /**
   * 更新预设顺序
   */
  updateOrder() {
    const listElement = document.getElementById('diaryPresetList');
    if (!listElement) return;

    // 获取所有预设项目（包括分组内的）
    const items = Array.from(listElement.querySelectorAll('.diary-preset-item'));
    const orderedIds = items.map(item => item.dataset.presetId);

    this.dataManager.updateOrder(orderedIds);

    // 保存分组的位置
    const group = listElement.querySelector('.diary-preset-group');
    if (group) {
      const allChildren = Array.from(listElement.children);
      const groupIndex = allChildren.indexOf(group);
      localStorage.setItem('diary-instruction-group-position', groupIndex.toString());
      logger.debug('[DiaryPresetUI] 分组位置已保存:', groupIndex);
    }

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
          <div class="diary-preset-dialog-buttons">
            <button class="diary-preset-dialog-btn diary-preset-dialog-cancel">取消</button>
            <button class="diary-preset-dialog-btn diary-preset-dialog-ok">添加</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 添加 active 类触发显示动画
      setTimeout(() => {
        overlay.classList.add('active');
      }, 10);

      // 绑定事件
      const cancelBtn = overlay.querySelector('.diary-preset-dialog-cancel');
      const okBtn = overlay.querySelector('.diary-preset-dialog-ok');

      const close = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.remove();
          resolve(false);
        }, 300);
      };

      const save = () => {
        const name = overlay.querySelector('#diaryPresetDialogName')?.value || '未命名预设';
        const role = overlay.querySelector('#diaryPresetDialogRole')?.value || 'system';
        const content = overlay.querySelector('#diaryPresetDialogContent')?.value || '';

        logger.debug('[DiaryPresetUI.showAddPresetDialog] 添加预设:', { name, role });

        this.dataManager.addPreset({ name, role, content });
        this.render();

        showSuccessToast('预设已添加');

        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.remove();
          resolve(true);
        }, 300);
      };

      cancelBtn.addEventListener('click', close);
      okBtn.addEventListener('click', save);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    });
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

      // 显示动画（和日记编辑器一样）
      requestAnimationFrame(() => {
        overlay.classList.add('active');
      });

      // 绑定事件
      const cancelBtn = overlay.querySelector('.diary-preset-dialog-cancel');
      const okBtn = overlay.querySelector('.diary-preset-dialog-ok');

      const close = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.remove();
          resolve(false);
        }, 300);
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

        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.remove();
          resolve(true);
        }, 300);
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
    const isContext = preset?.type === 'context';

    return `
      <div class="diary-preset-dialog">
        <div class="diary-preset-dialog-field">
          <label>预设名称</label>
          <input type="text" id="diaryPresetDialogName" class="text_pole" value="${this.escapeHtml(name)}" placeholder="例如: 破限提示词" ${isContext ? 'disabled' : ''}>
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
          <textarea id="diaryPresetDialogContent" class="text_pole" rows="10" placeholder="${isContext ? '内容动态生成（无法编辑）' : '输入你的提示词内容...'}" ${isContext ? 'disabled' : ''}>${isContext ? '(动态生成)' : this.escapeHtml(content)}</textarea>
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
   * 获取角色类型的中文标签
   * 
   * @param {string} role - 角色类型（system/user/assistant）
   * @returns {string} 中文标签（系统/用户/助手）
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
   * @param {string} text - 需要转义的文本
   * @returns {string} 转义后的安全HTML
   * @description
   * 防止XSS攻击，将特殊字符转义（如 < > & " '）
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 创建日记指令分组
   * 
   * @param {Array<Object>} instructions - 日记指令预设数组
   * @returns {HTMLElement} 分组元素
   */
  createDiaryInstructionGroup(instructions) {
    const group = document.createElement('div');
    group.className = 'diary-preset-group';
    group.dataset.groupType = 'diary-instructions';

    // 检查分组是否折叠（从localStorage读取）
    const isCollapsed = localStorage.getItem('diary-instruction-group-collapsed') === 'true';

    // 统计启用的数量
    const enabledCount = instructions.filter(i => i.enabled).length;

    group.innerHTML = `
      <div class="diary-preset-group-header ${isCollapsed ? 'collapsed' : ''}">
        <div class="diary-preset-drag-handle" title="拖动排序">
          ☰
        </div>
        <div class="diary-preset-role diary-preset-role-system">指令</div>
        <div class="diary-preset-content">
          <div class="diary-preset-name">📝 日记提示词 (${enabledCount}/${instructions.length})</div>
        </div>
        <div class="diary-preset-actions">
          <button class="diary-preset-btn-icon diary-preset-group-add" title="添加日记模板">
            <span class="fa-solid fa-plus"></span>
          </button>
        </div>
      </div>
      <div class="diary-preset-group-content ${isCollapsed ? 'collapsed' : ''}">
        ${instructions.length === 0 ? '<div class="diary-preset-group-empty">暂无日记模板，点击"+"添加</div>' : ''}
      </div>
    `;

    // 渲染指令条目
    const content = group.querySelector('.diary-preset-group-content');
    instructions.forEach(instruction => {
      const item = this.createPresetItem(instruction);
      content.appendChild(item);
    });

    // 绑定事件
    const header = group.querySelector('.diary-preset-group-header');
    header.addEventListener('click', (e) => {
      // 点击+按钮不触发折叠
      if (!e.target.closest('.diary-preset-group-add')) {
        this.toggleGroup(group);
      }
    });

    const addBtn = group.querySelector('.diary-preset-group-add');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡到header
      this.showAddDiaryInstructionDialog();
    });

    return group;
  }

  /**
   * 切换分组折叠状态
   * 
   * @param {HTMLElement} group - 分组元素
   */
  toggleGroup(group) {
    const header = group.querySelector('.diary-preset-group-header');
    const content = group.querySelector('.diary-preset-group-content');

    const isCollapsed = header.classList.contains('collapsed');

    if (isCollapsed) {
      // 展开
      header.classList.remove('collapsed');
      content.classList.remove('collapsed');
      localStorage.setItem('diary-instruction-group-collapsed', 'false');
    } else {
      // 折叠
      header.classList.add('collapsed');
      content.classList.add('collapsed');
      localStorage.setItem('diary-instruction-group-collapsed', 'true');
    }
  }

  /**
   * 显示添加日记指令对话框
   */
  async showAddDiaryInstructionDialog() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'diary-preset-dialog-overlay';
      overlay.innerHTML = `
        <div class="diary-preset-dialog-container">
          <div class="diary-preset-dialog">
            <div class="diary-preset-dialog-field">
              <label>模板名称</label>
              <input type="text" id="diaryPresetDialogName" class="text_pole" placeholder="例如: 日常日记模板">
            </div>
            <div class="diary-preset-dialog-field">
              <label>角色类型</label>
              <select id="diaryPresetDialogRole" class="text_pole">
                <option value="system" selected>系统 (system)</option>
                <option value="user">用户 (user)</option>
                <option value="assistant">助手 (assistant)</option>
              </select>
            </div>
            <div class="diary-preset-dialog-field">
              <label>模板内容</label>
              <textarea id="diaryPresetDialogContent" class="text_pole" rows="10" placeholder="输入日记写作指南...">${this.escapeHtml(this.dataManager.getDiaryInstructionContent())}</textarea>
            </div>
          </div>
          <div class="diary-preset-dialog-buttons">
            <button class="diary-preset-dialog-btn diary-preset-dialog-cancel">取消</button>
            <button class="diary-preset-dialog-btn diary-preset-dialog-ok">添加</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 添加 active 类触发显示动画
      setTimeout(() => {
        overlay.classList.add('active');
      }, 10);

      const close = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
          overlay.remove();
          resolve(false);
        }, 300); // 等待动画完成
      };

      const save = () => {
        const name = overlay.querySelector('#diaryPresetDialogName')?.value || '新日记模板';
        const role = overlay.querySelector('#diaryPresetDialogRole')?.value || 'system';
        const content = overlay.querySelector('#diaryPresetDialogContent')?.value || '';

        this.dataManager.addPreset({
          name,
          role,
          content,
          type: 'instruction'
        });
        this.render();

        showSuccessToast('日记模板已添加');

        overlay.remove();
        resolve(true);
      };

      overlay.querySelector('.diary-preset-dialog-cancel').addEventListener('click', close);
      overlay.querySelector('.diary-preset-dialog-ok').addEventListener('click', save);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    });
  }

  /**
   * 过滤预设（搜索功能）
   * 
   * @param {string} searchTerm - 搜索关键词
   */
  filterPresets(searchTerm) {
    const items = document.querySelectorAll('.diary-preset-item');
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
      // 无搜索词，显示所有
      items.forEach(item => item.style.display = '');
      return;
    }

    items.forEach(item => {
      const name = item.querySelector('.diary-preset-name')?.textContent.toLowerCase() || '';
      const match = name.includes(term);
      item.style.display = match ? '' : 'none';
    });

    // 更新分组显示
    const groups = document.querySelectorAll('.diary-preset-group');
    groups.forEach(group => {
      const visibleItems = group.querySelectorAll('.diary-preset-item:not([style*="display: none"])');
      const hasVisibleItems = visibleItems.length > 0;

      // 如果组内有匹配项或搜索框为空，显示分组
      group.style.display = hasVisibleItems || !term ? '' : 'none';
    });
  }
}

