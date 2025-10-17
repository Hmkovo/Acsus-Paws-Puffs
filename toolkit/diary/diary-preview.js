/**
 * 日记UI - AI回复预览模块
 * 
 * @description
 * 负责管理AI回复预览面板：
 * - 显示/隐藏预览面板
 * - 实时更新预览内容（流式生成）
 * - 编辑预览内容
 * - 手动解析并应用
 * - 清空预览
 * 
 * @module DiaryPreview
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { getContext } from '../../../../../extensions.js';
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from './diary-toast.js';

// ========================================
// [CORE] AI预览管理类
// ========================================

/**
 * AI回复预览管理器
 * 
 * @class DiaryPreview
 */
export class DiaryPreview {
  /**
   * 创建AI预览管理器
   * 
   * @param {HTMLElement} panelElement - 日记面板元素
   * @param {Object} options - 配置选项
   * @param {Object} options.dataManager - 数据管理器
   * @param {Object} options.api - API管理器
   * @param {Function} options.getCurrentIndexFunc - 获取当前索引的函数
   * @param {Function} options.refreshCallback - 刷新日记的回调函数
   */
  constructor(panelElement, options) {
    this.panelElement = panelElement;
    this.dataManager = options.dataManager;
    this.api = options.api;
    this.getCurrentIndexFunc = options.getCurrentIndexFunc;
    this.refreshCallback = options.refreshCallback;

    // 初始化预览文本（使用当前角色名）
    this.initPreviewText();
  }

  /**
   * 初始化预览文本（动态显示当前角色名）
   */
  initPreviewText() {
    const textarea = /** @type {HTMLTextAreaElement|null} */ (this.panelElement?.querySelector('#diaryAiPreviewText'));
    if (!textarea) return;

    const ctx = getContext();
    const charName = ctx.name2 || '角色名';

    const defaultText = `这里会显示 AI 的原始回复内容。

你可以点击"编辑"按钮修改格式错误的地方，然后点击"解析并应用"让它生效。

示例格式：
[评论]
${charName}评论了20251017_123456_789：今天天气不错呢~
路人A评论了20251017_123456_790：确实很舒服！
[/评论]`;

    textarea.value = defaultText;
    logger.debug('[DiaryPreview.initPreviewText] 已初始化预览文本，角色名:', charName);
  }

  /**
   * 切换AI回复预览面板
   */
  togglePanel() {
    const panel = /** @type {HTMLElement|null} */ (this.panelElement?.querySelector('#diaryAiPreviewPanel'));
    if (!panel) return;

    const isVisible = panel.style.display !== 'none';

    if (isVisible) {
      this.closePanel();
    } else {
      panel.style.display = 'flex';
      // 每次打开时更新角色名（防止切换角色后还显示旧角色名）
      const textarea = /** @type {HTMLTextAreaElement|null} */ (panel.querySelector('#diaryAiPreviewText'));
      if (textarea && textarea.value.includes('角色名评论了')) {
        this.initPreviewText();
      }
      logger.debug('[DiaryPreview.togglePanel] AI回复预览面板已打开');
    }
  }

  /**
   * 关闭AI回复预览面板
   */
  closePanel() {
    const panel = /** @type {HTMLElement|null} */ (this.panelElement?.querySelector('#diaryAiPreviewPanel'));
    if (panel) {
      panel.style.display = 'none';
      logger.debug('[DiaryPreview.closePanel] AI回复预览面板已关闭');
    }
  }

  /**
   * 更新AI回复预览内容（用于实时流式显示）
   * 
   * @param {string} text - AI回复的累积文本
   * @description
   * 此方法会被 diary-api.js 调用，用于实时更新预览区域的内容
   */
  updatePreview(text) {
    if (!this.panelElement) return;

    const textarea = /** @type {HTMLTextAreaElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewText'));
    const hint = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('.diary-ai-preview-hint'));
    const badge = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryPreviewBadge'));
    const previewBtn = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewBtn'));

    if (!textarea) return;

    // 更新文本内容
    textarea.value = text;

    // 隐藏提示，显示内容
    if (hint) hint.style.display = 'none';
    textarea.style.display = 'block';

    // 显示预览按钮和徽章
    if (previewBtn) previewBtn.style.display = 'flex';
    if (badge) {
      badge.style.display = 'block';
      badge.textContent = '1';
    }

    // 自动滚动到底部
    textarea.scrollTop = textarea.scrollHeight;

    logger.debug('[DiaryPreview.updatePreview] AI回复预览已更新，当前长度:', text.length);
  }

  /**
   * 编辑AI回复预览
   * 
   * @description
   * 将文本框设为可编辑状态，允许用户修改AI回复（防止格式错误）
   */
  editPreview() {
    const textarea = this.panelElement?.querySelector('#diaryAiPreviewText');
    if (!textarea) return;

    const textareaElement = /** @type {HTMLTextAreaElement} */ (textarea);

    // 切换只读状态
    if (textareaElement.readOnly) {
      textareaElement.readOnly = false;
      textareaElement.focus();
      textareaElement.style.borderColor = 'var(--SmartThemeQuoteColor)';
      showInfoToast('已进入编辑模式');
      logger.debug('[DiaryPreview.editPreview] AI回复预览进入编辑模式');
    } else {
      textareaElement.readOnly = true;
      textareaElement.style.borderColor = '';
      showSuccessToast('已保存编辑');
      logger.debug('[DiaryPreview.editPreview] AI回复预览退出编辑模式');
    }
  }

  /**
   * 解析并应用AI回复预览
   * 
   * @async
   * @description
   * 手动解析预览框中的文本，提取[日记]和[评论]标记，
   * 并应用到日记系统中。用于处理AI格式错误的情况。
   */
  async parsePreview() {
    if (!this.api) {
      showErrorToast('API管理器未初始化');
      return;
    }

    const textarea = this.panelElement?.querySelector('#diaryAiPreviewText');
    if (!textarea) return;

    const text = /** @type {HTMLTextAreaElement} */ (textarea).value.trim();

    if (!text) {
      showErrorToast('预览内容为空');
      return;
    }

    try {
      // 获取当前日记ID
      const diaries = this.dataManager.getDiaries();
      if (diaries.length === 0) {
        showErrorToast('没有可用的日记');
        return;
      }

      // 使用当前索引获取日记ID
      const currentIndex = this.getCurrentIndexFunc ? this.getCurrentIndexFunc() : 0;
      const currentDiary = diaries[currentIndex];
      if (!currentDiary) {
        showErrorToast('无法获取当前日记');
        return;
      }

      // 调用API的解析方法
      await this.api.extractAndSave(text, currentDiary.id);

      // 刷新UI（保持当前位置）
      this.refreshCallback(true);

      // 清空预览（隐藏按钮）
      this.clearPreview(true);

      showSuccessToast('已解析并应用AI回复');
      logger.info('[DiaryPreview.parsePreview] AI回复已解析并应用');
    } catch (error) {
      logger.error('[DiaryPreview.parsePreview] 解析失败:', error);
      showErrorToast('解析失败：' + error.message);
    }
  }

  /**
   * 清空AI回复预览
   * 
   * @param {boolean} [hideButton=false] - 是否隐藏预览按钮
   * @description
   * 清空预览框内容，重置状态。
   * 发送消息前：只清空内容，不隐藏按钮（hideButton=false）
   * 手动清空：清空内容并隐藏按钮（hideButton=true）
   */
  clearPreview(hideButton = false) {
    if (!this.panelElement) return;

    const textarea = /** @type {HTMLTextAreaElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewText'));
    const hint = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('.diary-ai-preview-hint'));
    const badge = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryPreviewBadge'));
    const previewBtn = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryAiPreviewBtn'));

    if (textarea) {
      // 动态生成初始提示文本（使用当前角色名）
      const ctx = getContext();
      const charName = ctx.name2 || '角色名';

      const defaultText = `这里会显示 AI 的原始回复内容。

你可以点击"编辑"按钮修改格式错误的地方，然后点击"解析并应用"让它生效。

示例格式：
[评论]
${charName}评论了20251017_123456_789：今天天气不错呢~
路人A评论了20251017_123456_790：确实很舒服！
[/评论]`;

      textarea.value = defaultText;
      textarea.readOnly = true;
      textarea.style.borderColor = '';
    }

    if (hint) hint.style.display = 'block';

    // 只在手动清空时隐藏按钮和徽章
    if (hideButton) {
      if (badge) badge.style.display = 'none';
      if (previewBtn) previewBtn.style.display = 'none';
      // 关闭预览面板
      this.closePanel();
    }

    logger.debug('[DiaryPreview.clearPreview] AI回复预览已清空', hideButton ? '（隐藏按钮）' : '');
  }
}

