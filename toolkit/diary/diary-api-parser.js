/**
 * 日记API - 解析模块
 * 
 * @description
 * 负责解析AI回复：
 * - 提取 [日记] 和 [评论] 标记
 * - 解析AI写的日记
 * - 解析批量评论（带临时编号）
 * - 解析单条评论
 * - 消除代码重复：提取公共的解析逻辑
 * 
 * @module DiaryAPIParser
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import logger from '../../logger.js';

// ========================================
// [CORE] 解析类
// ========================================

/**
 * 日记API解析器
 * 
 * @class DiaryAPIParser
 */
export class DiaryAPIParser {
  /**
   * 创建解析器
   * 
   * @param {Object} dataManager - 数据管理器
   * @param {Object} ui - UI管理器（用于刷新）
   */
  constructor(dataManager, ui) {
    this.dataManager = dataManager;
    this.ui = ui;
    this.currentTempIdMap = {};  // 临时日记编号映射
    this.currentTempCommentIdMap = {};  // 临时评论编号映射
  }

  /**
   * 设置临时编号映射
   * 
   * @param {Object} tempIdMap - 日记编号映射
   * @param {Object} tempCommentIdMap - 评论编号映射
   */
  setTempIdMaps(tempIdMap, tempCommentIdMap) {
    this.currentTempIdMap = tempIdMap;
    this.currentTempCommentIdMap = tempCommentIdMap;
  }

  /**
   * 从AI回复提取并保存内容
   * 
   * @async
   * @param {string} response - AI回复文本
   * @param {string} [targetDiaryId] - 目标日记ID（评论）
   * @returns {Object} 提取结果 { diaries: [], comments: [] }
   */
  async extractAndSave(response, targetDiaryId = null) {
    const result = { diaries: [], comments: [] };

    // 提取 [日记]...[/日记]
    const diaryMatches = [...response.matchAll(/\[日记\]([\s\S]*?)\[\/日记\]/g)];
    if (diaryMatches.length > 0) {
      diaryMatches.forEach(match => {
        const diaryContent = match[1].trim();
        this.saveAIDiary(diaryContent);
        result.diaries.push({ content: diaryContent });
      });
      logger.info('[DiaryAPIParser] 提取了', diaryMatches.length, '篇AI日记');
    }

    // 提取 [评论]...[/评论]
    const commentMatches = [...response.matchAll(/\[评论\]([\s\S]*?)\[\/评论\]/g)];
    if (commentMatches.length > 0) {
      commentMatches.forEach(match => {
        const commentContent = match[1].trim();
        const comments = this.parseAndSaveComments(commentContent, targetDiaryId);
        if (comments && comments.length > 0) {
          result.comments.push(...comments);
        }
      });
      logger.info('[DiaryAPIParser] 提取了评论');
    }

    return result;
  }

  /**
   * 保存AI的日记
   */
  saveAIDiary(content) {
    logger.debug('[DiaryAPIParser.saveAIDiary] 开始解析AI日记，原始内容:', content.substring(0, 100));

    // 解析标题、日期、星期
    const titleMatch = content.match(/标题[:：]\s*(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : 'AI的日记';

    const dateMatch = content.match(/日期[:：]\s*(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

    const dayOfWeekMatch = content.match(/星期[:：]\s*(周[一二三四五六日])/);
    const dayOfWeek = dayOfWeekMatch ? dayOfWeekMatch[1] : '';

    // 去除头部，提取正文
    let bodyContent = content;
    bodyContent = bodyContent.replace(/标题[:：].*?\n/, '');
    bodyContent = bodyContent.replace(/日期[:：].*?\n/, '');
    bodyContent = bodyContent.replace(/星期[:：].*?\n/, '');
    bodyContent = bodyContent.trim();

    // 解析内容块
    const contentBlocks = [];
    const lines = bodyContent.split('\n');
    let currentTextBlock = '';

    lines.forEach(line => {
      line = line.trim();
      if (!line) {
        if (currentTextBlock) {
          contentBlocks.push({
            type: 'text',
            tag: '',
            time: '',
            content: currentTextBlock.trim()
          });
          currentTextBlock = '';
        }
        return;
      }

      const imageMatch = line.match(/\[图片[:：](.+?)\]/);
      if (imageMatch) {
        if (currentTextBlock) {
          contentBlocks.push({
            type: 'text',
            tag: '',
            time: '',
            content: currentTextBlock.trim()
          });
          currentTextBlock = '';
        }

        const imageDesc = imageMatch[1].trim();
        contentBlocks.push({
          type: 'image',
          tag: '📷',
          time: '',
          imageUrl: '',
          imageDesc: imageDesc,
          content: `[图片：${imageDesc}]`
        });
      } else {
        if (currentTextBlock) {
          currentTextBlock += '\n' + line;
        } else {
          currentTextBlock = line;
        }
      }
    });

    if (currentTextBlock) {
      contentBlocks.push({
        type: 'text',
        tag: '',
        time: '',
        content: currentTextBlock.trim()
      });
    }

    // 创建日记对象
    const diary = {
      id: this.dataManager.generateTimestampId(),
      author: 'ai',
      characterId: this.dataManager.getCurrentCharacterId(),
      status: 'draft',
      privacy: false,
      date: date,
      dayOfWeek: dayOfWeek || this.getDayOfWeekFromDate(date),
      title: title,
      contentBlocks: contentBlocks,
      comments: [],
      tags: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sendToAI: true
      }
    };

    this.dataManager.diaries.push(diary);
    this.dataManager.saveDiaries();

    logger.info('[DiaryAPIParser.saveAIDiary] 已保存AI日记:', {
      id: diary.id,
      title: diary.title,
      date: diary.date,
      contentBlocksCount: contentBlocks.length
    });

    if (this.ui) {
      this.ui.refreshDiaries();
    }
  }

  /**
   * 从日期字符串计算星期
   * 
   * @param {string} dateStr - 日期字符串（如 '2025-10-17'）
   * @returns {string} 星期（如 '周五'）
   */
  getDayOfWeekFromDate(dateStr) {
    const date = new Date(dateStr);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  }

  /**
   * 解析并保存评论（支持批量和单条）
   * @returns {Array} 解析的评论数组
   */
  parseAndSaveComments(commentText, diaryId) {
    const hasTempId = /#\d+\s+/.test(commentText);

    if (hasTempId) {
      return this.parseBatchComments(commentText);
    } else {
      return this.parseSingleComment(commentText, diaryId);
    }
  }

  // ========================================
  // [FUNC] 解析逻辑（消除重复P8）
  // ========================================

  /**
   * 解析作者和回复目标（公共逻辑，消除重复）
   * 
   * @param {string} authorPart - 作者部分（可能包含"回复@"）
   * @param {Object} authorMap - 作者映射
   * @returns {{authorName: string, replyTarget: string|null, parentCommentId: string|null}}
   * 
   * @description
   * 提取公共逻辑：解析作者名和回复目标，查找父评论ID
   * 支持两种回复格式：
   * - 回复@c1（临时评论编号，推荐）
   * - 回复@作者名（旧格式，兼容）
   */
  parseAuthorAndReplyTarget(authorPart, authorMap) {
    let authorName = authorPart.trim();
    let replyTarget = null;
    let parentCommentId = null;

    // 匹配回复格式
    const replyMatch = authorPart.match(/^(.+?)回复@(c\d+|.+?)$/);
    if (replyMatch) {
      authorName = replyMatch[1].trim();
      replyTarget = replyMatch[2].trim();

      // 查找父评论ID
      if (replyTarget.startsWith('c') && this.currentTempCommentIdMap[replyTarget]) {
        // 使用临时评论编号映射（精确）
        parentCommentId = this.currentTempCommentIdMap[replyTarget];
        logger.debug('[DiaryAPIParser.parseAuthorAndReplyTarget] 使用临时评论编号映射:', replyTarget, '→', parentCommentId);
      } else if (authorMap[replyTarget]) {
        // 使用作者名映射（兼容旧格式）
        parentCommentId = authorMap[replyTarget];
        logger.debug('[DiaryAPIParser.parseAuthorAndReplyTarget] 使用作者名映射:', replyTarget, '→', parentCommentId);
      }
    }

    return { authorName, replyTarget, parentCommentId };
  }

  /**
   * 解析批量评论（使用临时编号映射）
   * @returns {Array} 解析的评论数组
   */
  parseBatchComments(commentText) {
    const lines = commentText.split('\n').map(l => l.trim()).filter(l => l);
    const diaryAuthorMap = {};
    const allComments = [];

    lines.forEach(line => {
      const match = line.match(/^#(\d+)\s+(.+?)[:：]\s*(.+)$/);
      if (!match) return;

      const [, tempIdStr, authorPart, content] = match;
      const tempId = parseInt(tempIdStr);

      const realDiaryId = this.currentTempIdMap[tempId];
      if (!realDiaryId) {
        logger.warn('[DiaryAPIParser.parseBatchComments] 无效的临时日记编号:', tempId);
        return;
      }

      if (!diaryAuthorMap[realDiaryId]) {
        diaryAuthorMap[realDiaryId] = {};
      }

      // 使用公共方法解析（消除重复）
      const { authorName, parentCommentId } = this.parseAuthorAndReplyTarget(authorPart, diaryAuthorMap[realDiaryId]);

      // 创建评论
      const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const comment = {
        id: commentId,
        author: authorName,
        authorName: authorName,
        content: content.trim(),
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
      };

      this.dataManager.addComment(
        realDiaryId,
        comment,
        parentCommentId
      );

      allComments.push(comment);

      diaryAuthorMap[realDiaryId][authorName] = commentId;

      logger.debug('[DiaryAPIParser.parseBatchComments] 已保存评论:', authorName, parentCommentId ? '（回复）' : '');
    });

    return allComments;
  }

  /**
   * 解析单条评论（不使用临时日记编号）
   * @returns {Array} 解析的评论数组
   */
  parseSingleComment(commentText, diaryId) {
    if (!diaryId) {
      logger.warn('[DiaryAPIParser.parseSingleComment] 缺少目标日记ID，跳过单条评论保存');
      return [];
    }

    const lines = commentText.split('\n').map(l => l.trim()).filter(l => l);
    const authorMap = {};
    const allComments = [];

    lines.forEach(line => {
      const match = line.match(/^(.+?)[:：]\s*(.+)$/);
      if (!match) return;

      const [, authorPart, content] = match;

      // 使用公共方法解析（消除重复）
      const { authorName, parentCommentId } = this.parseAuthorAndReplyTarget(authorPart, authorMap);

      // 创建评论
      const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const comment = {
        id: commentId,
        author: authorName,
        authorName: authorName,
        content: content.trim(),
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
      };

      this.dataManager.addComment(
        diaryId,
        comment,
        parentCommentId
      );

      allComments.push(comment);

      authorMap[authorName] = commentId;

      logger.debug('[DiaryAPIParser.parseSingleComment] 已保存单条评论:', authorName, parentCommentId ? '（回复）' : '');
    });

    return allComments;
  }
}

