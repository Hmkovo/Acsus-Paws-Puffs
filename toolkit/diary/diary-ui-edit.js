/**
 * 日记UI - 就地编辑模块
 * 
 * @description
 * 负责在日记卡片上直接编辑的功能：
 * - 进入/退出编辑模式
 * - 保存就地编辑
 * - 复制日记
 * - 切换隐私模式
 * - 删除日记
 * 
 * @module DiaryUIEdit
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { getContext } from '../../../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../../popup.js';
import logger from '../../logger.js';

// ========================================
// [CORE] 就地编辑类
// ========================================

/**
 * 日记就地编辑管理器
 * 
 * @class DiaryUIEdit
 */
export class DiaryUIEdit {
  /**
   * 创建就地编辑管理器
   * 
   * @param {Object} dataManager - 数据管理器
   * @param {Object} ui - UI管理器（用于刷新和创建卡片）
   */
  constructor(dataManager, ui) {
    this.dataManager = dataManager;
    this.ui = ui;
  }

  /**
   * 切换日记编辑模式
   * 
   * @param {HTMLElement} card - 卡片元素
   * @param {Object} diary - 日记对象
   */
  toggleEditMode(card, diary) {
    const content = card.querySelector('.diary-content');
    const isEditing = content.classList.contains('editing');

    logger.debug('[DiaryUIEdit.toggleEditMode] 当前状态 - editing类:', isEditing, 'diaryId:', diary.id);

    if (isEditing) {
      // 退出编辑模式
      logger.debug('[DiaryUIEdit.toggleEditMode] 退出编辑模式');
      this.exitEditMode(card);
    } else {
      // 进入编辑模式
      logger.debug('[DiaryUIEdit.toggleEditMode] 进入编辑模式');
      this.enterEditMode(card, diary);
    }
  }

  /**
   * 进入编辑模式
   * 
   * @param {HTMLElement} card - 卡片元素
   * @param {Object} diary - 日记对象
   */
  enterEditMode(card, diary) {
    const content = card.querySelector('.diary-content');

    logger.debug('[DiaryUIEdit.enterEditMode] 开始进入编辑模式 - diaryId:', diary.id);
    logger.debug('[DiaryUIEdit.enterEditMode] content元素:', content);
    logger.debug('[DiaryUIEdit.enterEditMode] 是否已有editing类:', content.classList.contains('editing'));

    // 如果已经在编辑模式，不重复进入
    if (content.classList.contains('editing')) {
      logger.warn('[DiaryUIEdit.enterEditMode] 已在编辑模式，忽略（防止重复添加操作栏）');
      return;
    }

    // 检查是否已有操作栏
    const existingActionBar = content.querySelector('.diary-edit-actions');
    if (existingActionBar) {
      logger.warn('[DiaryUIEdit.enterEditMode] 检测到已存在的操作栏，移除后重新添加');
      existingActionBar.remove();
    }

    content.classList.add('editing');
    logger.debug('[DiaryUIEdit.enterEditMode] 已添加editing类');

    // 替换为可编辑版本
    const header = content.querySelector('.diary-header');
    const entries = content.querySelector('.diary-entries');

    // 标题和日期可编辑
    header.innerHTML = `
            <input type="text" class="diary-edit-title" value="${diary.title}" placeholder="标题">
            <input type="date" class="diary-edit-date" value="${diary.date}">
        `;

    // 内容块可编辑（区分文字块和图片块）
    entries.innerHTML = diary.contentBlocks.map((block, index) => {
      if (block.type === 'image') {
        // 图片块：显示URL和描述输入框
        return `
            <div class="diary-entry-editable diary-entry-image-edit" data-index="${index}" data-type="image">
                <div class="diary-image-edit-label">📷 图片</div>
                <input type="text" class="diary-image-url-edit" placeholder="图片URL" value="${block.imageUrl || ''}" data-field="url">
                <input type="text" class="diary-image-desc-edit" placeholder="图片描述" value="${block.imageDesc || ''}" data-field="desc">
            </div>
        `;
      } else {
        // 文字块：显示文本框
        return `
            <div class="diary-entry-editable" data-index="${index}" data-type="text">
                <textarea class="diary-content-edit">${block.content}</textarea>
            </div>
        `;
      }
    }).join('') + `
            <button class="diary-add-block-btn">
                <i class="fa-solid fa-plus"></i> 添加内容块
            </button>
        `;

    // 添加操作栏（插入到内容顶部，sticky固定）
    const actionBar = document.createElement('div');
    actionBar.className = 'diary-edit-actions';
    actionBar.innerHTML = `
            <button class="diary-edit-confirm" title="确认">
                <i class="fa-solid fa-check"></i>
            </button>
            <button class="diary-edit-cancel-btn" title="取消">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <button class="diary-edit-delete-btn" title="删除">
                <i class="fa-solid fa-trash-can"></i>
            </button>
            <button class="diary-edit-copy-btn" title="复制">
                <i class="fa-solid fa-copy"></i>
            </button>
        `;

    // 插入到content的第一个子元素之前（顶部）
    content.insertBefore(actionBar, content.firstChild);

    logger.debug('[DiaryUIEdit.enterEditMode] 操作栏已添加到顶部');

    // 绑定操作按钮
    actionBar.querySelector('.diary-edit-confirm').addEventListener('click', (e) => {
      e.stopPropagation();  // 阻止事件冒泡
      e.preventDefault();    // 阻止默认行为
      logger.debug('[DiaryUIEdit] 确认按钮被点击');
      this.saveInlineEdit(card, diary);
    });
    actionBar.querySelector('.diary-edit-cancel-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      logger.debug('[DiaryUIEdit] 取消按钮被点击');
      this.exitEditMode(card);
      this.ui.refreshDiaries();  // 恢复原状
    });
    actionBar.querySelector('.diary-edit-delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      logger.debug('[DiaryUIEdit] 删除按钮被点击');
      await this.deleteCurrentDiary(diary);
    });
    actionBar.querySelector('.diary-edit-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      logger.debug('[DiaryUIEdit] 复制按钮被点击');
      this.duplicateDiary(diary);
    });

    // 绑定添加块按钮
    const addBlockBtn = entries.querySelector('.diary-add-block-btn');
    if (addBlockBtn) {
      addBlockBtn.addEventListener('click', () => {
        const newBlock = document.createElement('div');
        newBlock.className = 'diary-entry-editable';
        newBlock.innerHTML = '<textarea class="diary-content-edit" placeholder="写点什么..."></textarea>';
        addBlockBtn.before(newBlock);
      });
    }

    logger.debug('[DiaryUIEdit.enterEditMode] 进入编辑模式:', diary.id);
  }

  /**
   * 退出编辑模式
   * 
   * @param {HTMLElement} card - 卡片元素
   */
  exitEditMode(card) {
    const content = card.querySelector('.diary-content');

    logger.debug('[DiaryUIEdit.exitEditMode] 开始退出编辑模式');
    logger.debug('[DiaryUIEdit.exitEditMode] 退出前editing类:', content.classList.contains('editing'));

    // 移除编辑类
    content.classList.remove('editing');

    // 移除操作栏
    const actionBar = content.querySelector('.diary-edit-actions');
    if (actionBar) {
      actionBar.remove();
      logger.debug('[DiaryUIEdit.exitEditMode] 操作栏已移除');
    }

    logger.debug('[DiaryUIEdit.exitEditMode] 退出后editing类:', content.classList.contains('editing'));
    logger.debug('[DiaryUIEdit.exitEditMode] 退出编辑模式完成');
  }

  /**
   * 保存就地编辑
   * 
   * @param {HTMLElement} card - 卡片元素
   * @param {Object} diary - 日记对象
   */
  saveInlineEdit(card, diary) {
    const content = card.querySelector('.diary-content');

    // 保存标题和日期
    const titleInput = content.querySelector('.diary-edit-title');
    const dateInput = content.querySelector('.diary-edit-date');

    if (titleInput) diary.title = titleInput.value || '未命名日记';
    if (dateInput && dateInput.value) {
      diary.date = dateInput.value;
      const dateObj = new Date(dateInput.value);
      diary.dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dateObj.getDay()];
    }

    // 保存内容块（区分文字块和图片块）
    const editableBlocks = content.querySelectorAll('.diary-entry-editable');
    diary.contentBlocks = [];

    editableBlocks.forEach((blockEl) => {
      const type = blockEl.dataset.type || 'text';

      if (type === 'image') {
        // 图片块：保存URL和描述
        const urlInput = blockEl.querySelector('[data-field="url"]');
        const descInput = blockEl.querySelector('[data-field="desc"]');

        if (urlInput && descInput && descInput.value.trim()) {
          diary.contentBlocks.push({
            type: 'image',
            tag: '📷',
            time: '',
            imageUrl: urlInput.value.trim(),
            imageDesc: descInput.value.trim(),
            content: `[图片：${descInput.value.trim()}]`
          });
        }
      } else {
        // 文字块：保存文字内容
        const textarea = blockEl.querySelector('.diary-content-edit');
        if (textarea && textarea.value.trim()) {
          diary.contentBlocks.push({
            type: 'text',
            tag: '',
            time: '',
            content: textarea.value.trim()
          });
        }
      }
    });

    // 保存
    this.dataManager.saveDiaries();

    logger.debug('[DiaryUIEdit.saveInlineEdit] 保存完成，开始更新UI');

    // 关键修复：先退出编辑模式，再替换卡片
    // 这样新卡片就不会带editing类
    this.exitEditMode(card);

    logger.debug('[DiaryUIEdit.saveInlineEdit] 已退出编辑模式');

    // 只更新当前卡片的显示（保持位置）
    const newCard = this.ui.createDiaryCard(diary);
    card.replaceWith(newCard);

    logger.debug('[DiaryUIEdit.saveInlineEdit] 卡片已替换');

    if (typeof toastr !== 'undefined') {
      toastr.success('日记已保存');
    }

    logger.info('[DiaryUIEdit.saveInlineEdit] ========== 就地编辑完成 ==========');
  }

  /**
   * 复制日记
   * 
   * @param {Object} diary - 日记对象
   */
  duplicateDiary(diary) {
    const newDiary = {
      ...diary,
      id: this.dataManager.generateTimestampId(),
      title: diary.title + ' (副本)',
      contentBlocks: [...diary.contentBlocks],
      comments: [],  // 不复制评论
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sendToAI: true
      }
    };

    this.dataManager.diaries.push(newDiary);
    this.dataManager.saveDiaries();
    this.ui.refreshDiaries();

    if (typeof toastr !== 'undefined') {
      toastr.success('日记已复制');
    }

    logger.info('[DiaryUIEdit.duplicateDiary] 日记已复制:', newDiary.id);
  }

  /**
   * 切换日记隐私模式
   * 
   * @description
   * 隐私模式下，日记不会被发送给AI
   * 直接操作DOM更新图标，不触发刷新，停留在当前日记
   * 
   * @param {string} diaryId - 日记ID
   */
  togglePrivacy(diaryId) {
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) return;

    // 切换隐私状态
    diary.privacy = !diary.privacy;
    diary.metadata.sendToAI = !diary.privacy;

    // 保存
    this.dataManager.saveDiaries();

    // 直接更新当前卡片的图标（不触发刷新，停留在当前日记）
    const currentCard = this.ui.sliderElement.querySelector(
      `.diary-card[data-diary-id="${diaryId}"]`
    );

    if (currentCard) {
      const privacyBtn = currentCard.querySelector('.diary-privacy-toggle');
      const iconSpan = privacyBtn?.querySelector('span');

      if (privacyBtn && iconSpan) {
        if (diary.privacy) {
          // 隐私模式：闭眼
          privacyBtn.classList.add('active');
          privacyBtn.title = '隐私模式';
          iconSpan.className = 'fa-solid fa-eye-slash';
        } else {
          // 公开模式：睁眼
          privacyBtn.classList.remove('active');
          privacyBtn.title = '公开';
          iconSpan.className = 'fa-solid fa-eye';
        }

        logger.debug('[DiaryUIEdit.togglePrivacy] 已更新图标，无刷新');
      }
    }

    // 通知
    const status = diary.privacy ? '隐私模式（不发送给AI）' : '公开模式（发送给AI）';
    if (typeof toastr !== 'undefined') {
      toastr.info(`日记已设为${status}`);
    }

    logger.info('[DiaryUIEdit.togglePrivacy] 日记隐私状态:', diary.privacy);
  }

  /**
   * 删除日记（从就地编辑操作栏调用）
   * 
   * @async
   * @param {Object} diary - 日记对象
   */
  async deleteCurrentDiary(diary) {
    // 确认删除
    const confirmed = await callGenericPopup(
      `确定删除日记"${diary.title}"吗？此操作无法撤销。`,
      POPUP_TYPE.CONFIRM
    );

    if (!confirmed) {
      logger.debug('[DiaryUIEdit.deleteCurrentDiary] 用户取消');
      return;
    }

    // 删除
    this.dataManager.deleteDiary(diary.id);

    // 刷新UI
    this.ui.refreshDiaries();

    // 通知
    if (typeof toastr !== 'undefined') {
      toastr.success('日记已删除');
    }

    logger.info('[DiaryUIEdit.deleteCurrentDiary] 日记已删除:', diary.id);
  }
}

