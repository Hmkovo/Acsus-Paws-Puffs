/**
 * 日记编辑器
 * 
 * @description
 * 负责日记编辑功能：
 * - 自定义标题、日期、颜色
 * - 添加/删除内容块（文字框、图片框）
 * - 隐私控制（小眼睛）
 * - 标签管理
 * 
 * @module DiaryEditor
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import logger from '../../logger.js';

// ========================================
// [CORE] 编辑器类
// ========================================

/**
 * 日记编辑器
 * 
 * @class DiaryEditor
 */
export class DiaryEditor {
  /**
   * 创建编辑器
   * 
   * @param {import('./diary-data.js').DiaryDataManager} dataManager - 数据管理器
   */
  constructor(dataManager) {
    this.dataManager = dataManager;

    /**
     * UI管理器引用（用于刷新UI）
     * @type {import('./diary-ui.js').DiaryUI|null}
     */
    this.ui = null;

    /**
     * 编辑器面板元素
     * @type {HTMLElement|null}
     */
    this.editorPanel = null;

    /**
     * 当前编辑的日记ID
     * @type {string|null}
     */
    this.currentDiaryId = null;
  }

  /**
   * 设置UI管理器引用
   * 
   * @param {import('./diary-ui.js').DiaryUI} ui - UI管理器
   */
  setUI(ui) {
    this.ui = ui;
  }

  /**
   * 初始化
   * 
   * @async
   */
  async init() {
    logger.info('[DiaryEditor] 初始化完成');
  }

  /**
   * 打开编辑器
   * 
   * @param {string|null} diaryId - 日记ID（null=新建）
   */
  open(diaryId = null) {
    this.currentDiaryId = diaryId;
    this.isNewDiary = !diaryId;  // 标记是否为新建

    if (diaryId) {
      // 编辑现有日记
      const diary = this.dataManager.getDiary(diaryId);
      if (!diary) {
        logger.error('[DiaryEditor.open] 日记不存在:', diaryId);
        return;
      }
      this.renderEditor(diary);
    } else {
      // 创建临时日记对象（不保存到存储）
      const tempDiary = this.createTempDiary();
      this.currentDiaryId = tempDiary.id;
      this.tempDiary = tempDiary;  // 保存临时对象
      this.renderEditor(tempDiary);
    }

    logger.info('[DiaryEditor.open] 编辑器已打开:', this.currentDiaryId, '新建:', this.isNewDiary);
  }

  /**
   * 创建临时日记对象（不保存到存储）
   * 
   * @returns {Object} 临时日记对象
   */
  createTempDiary() {
    const id = this.dataManager.generateTimestampId();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];

    return {
      id: id,
      author: 'user',
      characterId: this.dataManager.getCurrentCharacterId(),
      status: 'draft',
      privacy: false,
      date: dateStr,
      dayOfWeek: dayOfWeek,
      title: '未命名日记',
      contentBlocks: [],
      comments: [],
      tags: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sendToAI: true
      }
    };
  }

  /**
   * 获取当前日记对象
   * 
   * @description
   * 如果是新建日记，返回临时对象；否则从 dataManager 获取
   * 
   * @returns {Object|null} 日记对象
   */
  getCurrentDiary() {
    if (this.isNewDiary && this.tempDiary) {
      return this.tempDiary;
    }
    return this.dataManager.getDiary(this.currentDiaryId);
  }

  /**
   * 渲染编辑器
   * 
   * @param {Object} diary - 日记对象
   */
  renderEditor(diary) {
    // 创建编辑器面板
    if (this.editorPanel) {
      this.editorPanel.remove();
    }

    this.editorPanel = document.createElement('div');
    this.editorPanel.className = 'diary-editor-panel';
    this.editorPanel.innerHTML = `
            <div class="diary-editor-overlay"></div>
            <div class="diary-editor-content">
                <div class="diary-editor-header">
                    <h3><i class="fa-solid fa-pen"></i> 编辑日记</h3>
                    <button class="diary-editor-close">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
                
                <div class="diary-editor-body">
                    <label>
                        标题：
                        <input type="text" id="diary-edit-title" value="${diary.title}" placeholder="给日记起个标题">
                    </label>
                    
                    <label>
                        日期：
                        <input type="date" id="diary-edit-date" value="${diary.date}">
                    </label>
                    
                    <hr>
                    
                    <h4>内容块 <button class="diary-add-text-block"><i class="fa-solid fa-plus"></i> 文字</button> <button class="diary-add-image-block"><i class="fa-solid fa-image"></i> 图片</button></h4>
                    
                    <div class="diary-content-blocks" id="diary-content-blocks">
                        ${this.renderContentBlocks(diary.contentBlocks)}
                    </div>
                </div>
                
                <div class="diary-editor-footer">
                    <button class="diary-editor-save"><i class="fa-solid fa-save"></i> 保存</button>
                    <button class="diary-editor-cancel">取消</button>
                </div>
            </div>
        `;

    document.body.appendChild(this.editorPanel);

    // 绑定事件
    this.bindEditorEvents(diary);

    // 显示动画
    requestAnimationFrame(() => {
      this.editorPanel.classList.add('active');
    });

    logger.debug('[DiaryEditor.renderEditor] 编辑器已渲染');
  }

  /**
   * 渲染内容块列表
   * 
   * @param {Array<Object>} blocks - 内容块
   * @returns {string}
   */
  renderContentBlocks(blocks) {
    if (!blocks || blocks.length === 0) {
      return '<p class="diary-empty-hint">还没有内容，点击上方按钮添加</p>';
    }

    return blocks.map((block, index) => {
      if (block.type === 'text') {
        return `
                    <div class="diary-block diary-block-text" data-index="${index}">
                        <div class="diary-block-header">
                            <button class="diary-block-delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <textarea placeholder="写点什么...">${block.content}</textarea>
                    </div>
                `;
      } else if (block.type === 'image') {
        return `
                    <div class="diary-block diary-block-image" data-index="${index}">
                        <div class="diary-block-header">
                            <span class="diary-block-type-label">📷 图片</span>
                            <button class="diary-block-delete"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <input type="text" placeholder="图片URL" value="${block.imageUrl || ''}" data-field="url">
                        <input type="text" placeholder="图片描述（AI会看到）" value="${block.imageDesc || ''}" data-field="desc">
                    </div>
                `;
      }
      return '';
    }).join('');
  }

  /**
   * 绑定编辑器事件
   * 
   * @param {Object} diary - 日记对象
   */
  bindEditorEvents(diary) {
    if (!this.editorPanel) return;

    // 关闭按钮
    const closeBtn = this.editorPanel.querySelector('.diary-editor-close');
    const cancelBtn = this.editorPanel.querySelector('.diary-editor-cancel');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

    // 保存按钮
    const saveBtn = this.editorPanel.querySelector('.diary-editor-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveDiary(diary));
    }

    // 添加文字块
    const addTextBtn = this.editorPanel.querySelector('.diary-add-text-block');
    if (addTextBtn) {
      addTextBtn.addEventListener('click', () => {
        // 先保存当前编辑的内容
        this.saveCurrentEdits(diary);
        // 添加新块（增量添加，无闪烁）
        this.addContentBlock('text');
        this.appendContentBlockToEditor('text', diary.contentBlocks.length - 1);
      });
    }

    // 添加图片块
    const addImageBtn = this.editorPanel.querySelector('.diary-add-image-block');
    if (addImageBtn) {
      addImageBtn.addEventListener('click', () => {
        // 先保存当前编辑的内容
        this.saveCurrentEdits(diary);
        // 添加新块（增量添加，无闪烁）
        this.addContentBlock('image');
        this.appendContentBlockToEditor('image', diary.contentBlocks.length - 1);
      });
    }

    // 删除块按钮（使用事件委托，无需重新绑定）
    const blocksContainer = this.editorPanel.querySelector('#diary-content-blocks');
    if (blocksContainer) {
      blocksContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.diary-block-delete');
        if (deleteBtn) {
          const block = deleteBtn.closest('.diary-block');
          const index = parseInt(block.dataset.index);
          this.deleteContentBlock(index);
          // 删除DOM元素（无闪烁）
          block.remove();
          // 重新索引剩余块
          this.reindexContentBlocks();
        }
      });
    }

    logger.debug('[DiaryEditor.bindEditorEvents] 编辑器事件已绑定');
  }

  /**
   * 保存日记
   * 
   * @description
   * 如果是新建日记，保存时才真正添加到存储（避免产生空日记）
   * 
   * @param {Object} diary - 日记对象
   */
  saveDiary(diary) {
    // 获取表单数据
    const titleInput = this.editorPanel.querySelector('#diary-edit-title');
    const dateInput = this.editorPanel.querySelector('#diary-edit-date');

    if (titleInput) diary.title = titleInput.value || '未命名日记';
    if (dateInput && dateInput.value) {
      diary.date = dateInput.value;
      // 更新星期
      const dateObj = new Date(dateInput.value);
      diary.dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dateObj.getDay()];
    }

    // 更新内容块
    const blocks = this.editorPanel.querySelectorAll('.diary-block');
    diary.contentBlocks = [];

    blocks.forEach((blockEl) => {
      const type = blockEl.classList.contains('diary-block-text') ? 'text' : 'image';
      const tagInput = blockEl.querySelector('input[type="text"]');
      const timeInput = blockEl.querySelector('input[type="time"]');

      if (type === 'text') {
        const textarea = blockEl.querySelector('textarea');
        if (textarea && textarea.value.trim()) {
          diary.contentBlocks.push({
            type: 'text',
            tag: tagInput?.value || '🟡',
            time: timeInput?.value || '00:00',
            content: textarea.value.trim()
          });
        }
      } else if (type === 'image') {
        const urlInput = blockEl.querySelector('[data-field="url"]');
        const descInput = blockEl.querySelector('[data-field="desc"]');
        if (urlInput && descInput && descInput.value.trim()) {
          diary.contentBlocks.push({
            type: 'image',
            tag: tagInput?.value || '📷',
            time: timeInput?.value || '00:00',
            imageUrl: urlInput.value,
            imageDesc: descInput.value.trim(),
            content: `[图片：${descInput.value.trim()}]`
          });
        }
      }
    });

    // 如果是新建日记，添加到存储中（之前只是临时对象）
    if (this.isNewDiary && this.tempDiary) {
      this.dataManager.diaries.push(diary);
      logger.info('[DiaryEditor.saveDiary] 新日记已添加到存储:', diary.id);
    }

    // 保存到存储
    this.dataManager.saveDiaries();

    // 清除临时标记
    this.isNewDiary = false;
    this.tempDiary = null;

    // 刷新UI（renderDiaries会自动定位到最新日记）
    if (this.ui) {
      this.ui.refreshDiaries();
      logger.debug('[DiaryEditor.saveDiary] UI已刷新，最新日记将自动显示在大卡片');
    } else {
      logger.warn('[DiaryEditor.saveDiary] UI引用未设置');
    }

    // 关闭编辑器
    this.close();

    // 通知
    if (typeof toastr !== 'undefined') {
      toastr.success('日记已保存');
    }

    logger.info('[DiaryEditor.saveDiary] 日记已保存:', diary.id);
  }

  /**
   * 保存当前编辑的内容（不关闭编辑器）
   * 
   * @param {Object} diary - 日记对象
   */
  saveCurrentEdits(diary) {
    if (!this.editorPanel) return;

    // 保存标题和日期
    const titleInput = this.editorPanel.querySelector('#diary-edit-title');
    const dateInput = this.editorPanel.querySelector('#diary-edit-date');

    if (titleInput) diary.title = titleInput.value || '未命名日记';
    if (dateInput && dateInput.value) {
      diary.date = dateInput.value;
      const dateObj = new Date(dateInput.value);
      diary.dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dateObj.getDay()];
    }

    // 保存内容块
    const blocks = this.editorPanel.querySelectorAll('.diary-block');
    diary.contentBlocks = [];

    blocks.forEach((blockEl) => {
      const type = blockEl.classList.contains('diary-block-text') ? 'text' : 'image';

      if (type === 'text') {
        const textarea = blockEl.querySelector('textarea');
        if (textarea) {
          diary.contentBlocks.push({
            type: 'text',
            tag: '',      // 不保存tag
            time: '',     // 不保存time
            content: textarea.value || ''
          });
        }
      } else if (type === 'image') {
        const urlInput = blockEl.querySelector('[data-field="url"]');
        const descInput = blockEl.querySelector('[data-field="desc"]');
        diary.contentBlocks.push({
          type: 'image',
          tag: '📷',
          time: '',
          imageUrl: urlInput?.value || '',
          imageDesc: descInput?.value || '',
          content: descInput?.value ? `[图片：${descInput.value}]` : ''
        });
      }
    });

    logger.debug('[DiaryEditor.saveCurrentEdits] 当前编辑已保存');
  }

  /**
   * 添加内容块（数据层）
   * 
   * @param {string} type - 'text' | 'image'
   */
  addContentBlock(type) {
    const diary = this.getCurrentDiary();
    if (!diary) return;

    const block = {
      type: type,
      tag: '🟡',
      time: new Date().toTimeString().slice(0, 5),
      content: ''
    };

    if (type === 'image') {
      block.imageUrl = '';
      block.imageDesc = '';
    }

    diary.contentBlocks.push(block);
    this.dataManager.saveDiaries();

    logger.info('[DiaryEditor.addContentBlock] 已添加', type, '块');
  }

  /**
   * 增量添加内容块到编辑器（无需重新渲染，避免闪烁）
   * 
   * @param {string} type - 'text' | 'image'
   * @param {number} index - 块索引
   */
  appendContentBlockToEditor(type, index) {
    const blocksContainer = this.editorPanel.querySelector('#diary-content-blocks');
    if (!blocksContainer) return;

    // 移除空状态提示（如果存在）
    const emptyHint = blocksContainer.querySelector('.diary-empty-hint');
    if (emptyHint) emptyHint.remove();

    const diary = this.getCurrentDiary();
    const block = diary.contentBlocks[index];

    let blockHTML = '';
    if (type === 'text') {
      blockHTML = `
        <div class="diary-block diary-block-text" data-index="${index}">
          <div class="diary-block-header">
            <button class="diary-block-delete"><i class="fa-solid fa-trash"></i></button>
          </div>
          <textarea placeholder="写点什么...">${block.content}</textarea>
        </div>
      `;
    } else if (type === 'image') {
      blockHTML = `
        <div class="diary-block diary-block-image" data-index="${index}">
          <div class="diary-block-header">
            <span class="diary-block-type-label">📷 图片</span>
            <button class="diary-block-delete"><i class="fa-solid fa-trash"></i></button>
          </div>
          <input type="text" placeholder="图片URL" value="${block.imageUrl || ''}" data-field="url">
          <input type="text" placeholder="图片描述（AI会看到）" value="${block.imageDesc || ''}" data-field="desc">
        </div>
      `;
    }

    // 添加到容器
    blocksContainer.insertAdjacentHTML('beforeend', blockHTML);

    // 滚动到新添加的块
    const newBlock = blocksContainer.lastElementChild;
    if (newBlock) {
      newBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // 聚焦到输入框
      const focusTarget = newBlock.querySelector('textarea, input[data-field="url"]');
      if (focusTarget) focusTarget.focus();
    }

    logger.debug('[DiaryEditor.appendContentBlockToEditor] 已添加', type, '块到DOM');
  }

  /**
   * 重新索引内容块（删除后需要调用）
   */
  reindexContentBlocks() {
    const blocksContainer = this.editorPanel.querySelector('#diary-content-blocks');
    if (!blocksContainer) return;

    const blocks = blocksContainer.querySelectorAll('.diary-block');
    blocks.forEach((block, index) => {
      block.dataset.index = index;
    });

    // 如果没有内容块了，显示空状态提示
    if (blocks.length === 0) {
      blocksContainer.innerHTML = '<p class="diary-empty-hint">还没有内容，点击上方按钮添加</p>';
    }

    logger.debug('[DiaryEditor.reindexContentBlocks] 已重新索引，共', blocks.length, '个块');
  }

  /**
   * 删除内容块
   * 
   * @param {number} index - 块索引
   */
  deleteContentBlock(index) {
    const diary = this.getCurrentDiary();
    if (!diary) return;

    diary.contentBlocks.splice(index, 1);

    // 只有编辑现有日记时才保存（新建日记在saveDiary时统一保存）
    if (!this.isNewDiary) {
      this.dataManager.saveDiaries();
    }

    logger.info('[DiaryEditor.deleteContentBlock] 已删除第', index, '个块');
  }

  /**
   * 关闭编辑器
   * 
   * @description
   * 如果是取消新建，临时对象会被丢弃，不会保存到存储
   */
  close() {
    // 如果是未保存的新建日记，提示用户
    if (this.isNewDiary && this.tempDiary) {
      logger.info('[DiaryEditor.close] 取消新建，临时日记已丢弃:', this.currentDiaryId);
    }

    // 清理状态
    this.currentDiaryId = null;
    this.isNewDiary = false;
    this.tempDiary = null;

    // 移除编辑器DOM
    if (this.editorPanel) {
      this.editorPanel.remove();
      this.editorPanel = null;
    }

    logger.debug('[DiaryEditor.close] 编辑器已关闭');
  }
}

