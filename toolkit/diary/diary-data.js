/**
 * 日记数据管理器
 * 
 * @description
 * 负责日记数据的增删改查、持久化存储、时间戳ID生成。
 * 数据存储在 extension_settings 中，按角色卡ID分类。
 * 
 * @module DiaryDataManager
 */

// ========================================
// [IMPORT] SillyTavern 原生 API
// ========================================
import { extension_settings, getContext } from '../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../script.js';
import logger from '../../logger.js';

// ========================================
// [CONST] 常量定义
// ========================================
const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'diary';

// ========================================
// [CORE] 数据管理类
// ========================================

/**
 * 日记数据管理器
 * 
 * @class DiaryDataManager
 */
export class DiaryDataManager {
  constructor() {
    /**
     * 日记列表（当前角色的）
     * @type {Array<Object>}
     */
    this.diaries = [];

    /**
     * 当前角色ID
     * @type {string|null}
     */
    this.currentCharacterId = null;
  }

  /**
   * 初始化
   * 
   * @async
   */
  async init() {
    logger.info('[DiaryData] 开始初始化');
    this.loadDiaries();
    logger.info('[DiaryData] 初始化完成，已加载', this.diaries.length, '篇日记');
  }

  /**
   * 生成时间戳ID
   * 
   * @description
   * 格式：年月日_时分秒 (如 20251013_143020)
   * 保证唯一性，避免并发时重复
   * 
   * @returns {string} 时间戳ID
   * @example
   * const id = generateTimestampId();
   * // 返回: "20251013_143020"
   */
  generateTimestampId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    // 添加毫秒避免并发时重复
    const ms = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}${month}${day}_${hour}${minute}${second}_${ms}`;
  }

  /**
   * 获取当前角色ID
   * 
   * @returns {string|null}
   */
  getCurrentCharacterId() {
    const ctx = getContext();
    return ctx.characterId || ctx.groupId || null;
  }

  /**
   * 加载日记（当前角色）
   * 
   * @description
   * 根本逻辑：
   * 1. 获取当前角色ID
   * 2. 从所有日记中过滤当前角色的
   * 3. 按时间戳排序（最新的在后）
   */
  loadDiaries() {
    this.currentCharacterId = this.getCurrentCharacterId();

    logger.debug('[DiaryData.loadDiaries] ========== 开始加载日记 ==========');
    logger.debug('[DiaryData.loadDiaries] 当前角色ID:', this.currentCharacterId);

    if (!this.currentCharacterId) {
      logger.warn('[DiaryData.loadDiaries] ⚠️ 未选择角色，清空日记列表');
      this.diaries = [];
      return;
    }

    const allDiaries = extension_settings[EXT_ID]?.[MODULE_NAME]?.diaries || [];

    logger.debug('[DiaryData.loadDiaries] 存储中的总日记数:', allDiaries.length);

    // 输出所有日记的角色ID（用于调试）
    if (allDiaries.length > 0) {
      logger.debug('[DiaryData.loadDiaries] 存储中的日记列表:');
      allDiaries.forEach((d, index) => {
        logger.debug(`  [${index}] ID:${d.id}, title:${d.title}, charId:${d.characterId}, 匹配:${d.characterId === this.currentCharacterId}`);
      });
    }

    // 过滤当前角色的日记
    this.diaries = allDiaries.filter(d => d.characterId === this.currentCharacterId);

    logger.debug('[DiaryData.loadDiaries] 过滤后（当前角色）:', this.diaries.length, '篇');

    // 按时间排序（最新的在前面）- 降序排序
    // 这样数组[0]是最新的，轮播图会把最新的放在第一张（左侧隐藏）
    // 然后可以通过CSS或初始翻页让最新的显示在大卡片
    this.diaries.sort((a, b) => b.id.localeCompare(a.id));

    logger.debug('[DiaryData.loadDiaries] 排序后的日记ID顺序（最新→最旧）:');
    this.diaries.forEach((d, index) => {
      logger.debug(`  [${index}] ${d.id} - ${d.title}`);
    });

    logger.debug('[DiaryData.loadDiaries] ========== 加载完成 ==========');
  }

  /**
   * 保存日记到存储
   */
  saveDiaries() {
    const allDiaries = extension_settings[EXT_ID]?.[MODULE_NAME]?.diaries || [];

    // 移除当前角色的旧数据
    const otherDiaries = allDiaries.filter(d => d.characterId !== this.currentCharacterId);

    // 合并当前角色的新数据
    extension_settings[EXT_ID][MODULE_NAME].diaries = [...otherDiaries, ...this.diaries];

    saveSettingsDebounced();
    logger.debug('[DiaryData.saveDiaries] 已保存', this.diaries.length, '篇日记');
  }

  /**
   * 创建新日记（草稿）
   * 
   * @param {Object} [options={}] - 可选参数
   * @param {string} [options.title] - 标题
   * @param {string} [options.date] - 日期
   * @returns {Object} 新日记对象
   */
  createDiary({ title = '', date = null } = {}) {
    const now = new Date();

    // 重新获取当前角色ID（确保最新）
    this.currentCharacterId = this.getCurrentCharacterId();

    const diary = {
      id: this.generateTimestampId(),
      author: 'user',
      characterId: this.currentCharacterId,
      status: 'draft',
      privacy: false,

      // 基本信息
      date: date || now.toISOString().split('T')[0],
      dayOfWeek: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()],
      title: title || '未命名日记',

      // 内容和评论
      contentBlocks: [],
      comments: [],
      tags: [],

      // 元数据
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sendToAI: true
      }
    };

    this.diaries.push(diary);
    this.saveDiaries();

    logger.info('[DiaryData.createDiary] 已创建日记:', diary.id);
    return diary;
  }

  /**
   * 获取日记
   * 
   * @param {string} id - 日记ID
   * @returns {Object|null}
   */
  getDiary(id) {
    return this.diaries.find(d => d.id === id) || null;
  }

  /**
   * 更新日记
   * 
   * @param {string} id - 日记ID
   * @param {Object} updates - 更新内容
   */
  updateDiary(id, updates) {
    const diary = this.getDiary(id);
    if (!diary) {
      logger.warn('[DiaryData.updateDiary] 日记不存在:', id);
      return;
    }

    Object.assign(diary, updates);
    diary.metadata.updatedAt = Date.now();
    this.saveDiaries();

    logger.debug('[DiaryData.updateDiary] 已更新日记:', id);
  }

  /**
   * 删除日记
   * 
   * @param {string} id - 日记ID
   * 
   * @description
   * 根本逻辑：
   * 1. 从内存数组删除
   * 2. 保存到存储（会合并所有角色的日记）
   * 3. 重新加载（确保数据一致）
   */
  deleteDiary(id) {
    logger.debug('[DiaryData.deleteDiary] ========== 开始删除 ==========');
    logger.debug('[DiaryData.deleteDiary] 要删除的ID:', id);
    logger.debug('[DiaryData.deleteDiary] 删除前日记数:', this.diaries.length);

    const index = this.diaries.findIndex(d => d.id === id);
    if (index === -1) {
      logger.warn('[DiaryData.deleteDiary] ⚠️ 日记不存在（可能已被删除）');
      return;
    }

    const diary = this.diaries[index];
    logger.debug('[DiaryData.deleteDiary] 找到日记:', diary.title, '索引:', index);

    this.diaries.splice(index, 1);
    logger.debug('[DiaryData.deleteDiary] 已从数组移除，剩余:', this.diaries.length, '篇');

    this.saveDiaries();
    logger.debug('[DiaryData.deleteDiary] 已保存到存储');

    // 重新加载验证
    this.loadDiaries();
    logger.debug('[DiaryData.deleteDiary] 重新加载后:', this.diaries.length, '篇');
    logger.debug('[DiaryData.deleteDiary] ========== 删除完成 ==========');
  }

  /**
   * 获取所有日记（当前角色）
   * 
   * @param {Object} [filter={}] - 过滤条件
   * @param {string} [filter.author] - 'user' | 'ai'
   * @param {string} [filter.status] - 'draft' | 'archived'
   * @param {Array<string>} [filter.tags] - 标签列表
   * @returns {Array<Object>}
   */
  getDiaries({ author = null, status = null, tags = null } = {}) {
    let filtered = [...this.diaries];

    if (author) {
      filtered = filtered.filter(d => d.author === author);
    }

    if (status) {
      filtered = filtered.filter(d => d.status === status);
    }

    if (tags && tags.length > 0) {
      filtered = filtered.filter(d =>
        tags.some(tag => d.tags.includes(tag))
      );
    }

    return filtered;
  }

  /**
   * 添加评论到日记
   * 
   * @param {string} diaryId - 日记ID
   * @param {Object} comment - 评论对象
   * @param {string} comment.id - 评论ID
   * @param {string} comment.author - 'user' | 'ai' | '路人A'
   * @param {string} comment.authorName - 作者名称
   * @param {string} comment.content - 评论内容
   * @param {string} [parentCommentId] - 父评论ID（回复评论）
   */
  addComment(diaryId, comment, parentCommentId = null) {
    const diary = this.getDiary(diaryId);
    if (!diary) {
      logger.warn('[DiaryData.addComment] 日记不存在:', diaryId);
      return;
    }

    // 如果是回复评论，找到父评论
    if (parentCommentId) {
      const parentComment = this.findComment(diary.comments, parentCommentId);
      if (parentComment) {
        parentComment.replies = parentComment.replies || [];
        parentComment.replies.push({
          ...comment,
          timestamp: Date.now(),
          replies: []
        });
      }
    } else {
      // 顶层评论
      diary.comments.push({
        ...comment,
        timestamp: Date.now(),
        replies: []
      });
    }

    diary.metadata.updatedAt = Date.now();
    this.saveDiaries();

    logger.info('[DiaryData.addComment] 已添加评论到:', diaryId);
  }

  /**
   * 递归查找评论
   * 
   * @param {Array<Object>} comments - 评论列表
   * @param {string} commentId - 评论ID
   * @returns {Object|null}
   */
  findComment(comments, commentId) {
    for (const comment of comments) {
      if (comment.id === commentId) {
        return comment;
      }
      if (comment.replies && comment.replies.length > 0) {
        const found = this.findComment(comment.replies, commentId);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 删除评论
   * 
   * @param {string} diaryId - 日记ID
   * @param {string} commentId - 评论ID
   */
  deleteComment(diaryId, commentId) {
    const diary = this.getDiary(diaryId);
    if (!diary) {
      logger.warn('[DiaryData.deleteComment] 日记不存在:', diaryId);
      return;
    }

    logger.debug('[DiaryData.deleteComment] 开始删除评论:', {
      diaryId,
      commentId,
      删除前评论总数: this.countAllComments(diary.comments)
    });

    // 递归删除评论
    const removeComment = (comments, level = 0) => {
      const index = comments.findIndex(c => c.id === commentId);
      if (index !== -1) {
        const deletedComment = comments[index];
        logger.debug('[DiaryData.deleteComment] 找到目标评论:', {
          level,
          index,
          author: deletedComment.authorName,
          content: deletedComment.content.substring(0, 30),
          hasReplies: !!(deletedComment.replies && deletedComment.replies.length > 0),
          replyCount: deletedComment.replies?.length || 0
        });

        comments.splice(index, 1);
        return true;
      }

      for (const comment of comments) {
        if (comment.replies && removeComment(comment.replies, level + 1)) {
          return true;
        }
      }
      return false;
    };

    if (removeComment(diary.comments)) {
      diary.metadata.updatedAt = Date.now();

      logger.debug('[DiaryData.deleteComment] 删除后评论总数:', this.countAllComments(diary.comments));
      logger.debug('[DiaryData.deleteComment] 删除后的评论结构:', JSON.stringify(diary.comments, null, 2));

      this.saveDiaries();
      logger.info('[DiaryData.deleteComment] 已删除评论:', commentId);
    } else {
      logger.warn('[DiaryData.deleteComment] 未找到评论:', commentId);
    }
  }

  /**
   * 统计所有评论数量（递归）
   * 
   * @param {Array<Object>} comments - 评论数组
   * @returns {number} 总评论数
   */
  countAllComments(comments) {
    if (!comments || comments.length === 0) return 0;

    let count = comments.length;
    comments.forEach(comment => {
      if (comment.replies && comment.replies.length > 0) {
        count += this.countAllComments(comment.replies);
      }
    });
    return count;
  }

  // ========================================
  // [SETTINGS] 设置管理
  // ========================================

  /**
   * 获取日记设置（完整版）
   * 
   * @returns {Object} 设置对象
   * 
   * @property {boolean} includePersonaDescription - 包含用户设定
   * @property {boolean} includeCharDescription - 包含角色描述
   * @property {boolean} includeCharPersonality - 包含角色性格
   * @property {boolean} includeCharScenario - 包含角色场景
   * @property {boolean} includeWorldInfo - 包含世界书
   * @property {boolean} includeRecentChat - 包含最近对话
   * @property {number} recentChatCount - 最近对话数量（1-20）
   * @property {boolean} includeHistoryDiaries - 包含历史日记
   * @property {number} historyDiaryCount - 历史日记数量（1-10）
   * @property {boolean} allowCharacterComment - 允许角色评论（默认true）
   * @property {boolean} allowPasserbyComments - 允许路人评论
   * @property {string} passerbyPersonality - 路人性格类型（15种可选）
   * @property {number} passerbyCommentMin - 路人评论最小数量
   * @property {number} passerbyCommentMax - 路人评论最大数量
   * @property {boolean} skipDeleteConfirm - 跳过删除确认
   * @property {Object} visualSettings - 视觉设置对象（卡片透明度、主题色、文本色、背景等）
   * @property {string} visualSettings.cardOpacity - 卡片透明度（0-1）
   * @property {string} visualSettings.themeColor - 主题色
   * @property {string} visualSettings.textColor - 文本颜色
   * @property {string} visualSettings.panelBgColor - 面板背景色
   * @property {number} visualSettings.panelBgOpacity - 面板背景透明度（0-1）
   * @property {Object} visualSettings.authorColors - 评论者颜色配置
   * @property {Object} visualSettings.background - 背景图配置
   * @property {Object} visualSettings.commentBox - 评论框样式配置
   * @property {Object} apiConfig - API配置对象（来源、流式、自定义配置列表）
   * @property {string} apiConfig.source - API来源（'default' | 'custom'）
   * @property {boolean} apiConfig.stream - 是否流式生成
   * @property {string|null} apiConfig.currentConfigId - 当前使用的配置ID
   * @property {Array<Object>} apiConfig.customConfigs - 自定义配置列表
   */
  getSettings() {
    const settings = extension_settings[EXT_ID]?.[MODULE_NAME]?.settings || {};

    // 返回设置（带默认值）
    return {
      // 用户设定（按 SillyTavern 官方顺序）
      includePersonaDescription: settings.includePersonaDescription !== false,  // 默认true

      // 角色信息
      includeCharDescription: settings.includeCharDescription !== false,  // 默认true
      includeCharPersonality: settings.includeCharPersonality !== false,  // 默认true
      includeCharScenario: settings.includeCharScenario !== false,        // 默认true

      // 世界书
      includeWorldInfo: settings.includeWorldInfo !== false,              // 默认true

      // 最近对话
      includeRecentChat: settings.includeRecentChat !== false,            // 默认true
      recentChatCount: settings.recentChatCount || 5,

      // 历史日记
      includeHistoryDiaries: settings.includeHistoryDiaries || false,     // 默认false
      historyDiaryCount: settings.historyDiaryCount || 3,

      // 评论设置
      allowCharacterComment: settings.allowCharacterComment !== false,    // 允许角色评论（默认true）
      allowPasserbyComments: settings.allowPasserbyComments || false,     // 默认false
      passerbyPersonality: settings.passerbyPersonality || 'default',     // 路人性格类型
      passerbyCommentMin: settings.passerbyCommentMin || 3,               // 路人评论最小数量
      passerbyCommentMax: settings.passerbyCommentMax || 5,               // 路人评论最大数量

      // 交互设置
      skipDeleteConfirm: settings.skipDeleteConfirm || false,             // 跳过删除确认（默认false）

      // 视觉设置
      visualSettings: settings.visualSettings || {
        cardOpacity: 1.0,                         // 卡片透明度（0-1）
        themeColor: '',                           // 日记主题色（空=使用默认）
        textColor: '',                            // 日记文本颜色（空=使用默认）
        panelBgColor: '',                         // 面板背景色（空=使用默认）
        panelBgOpacity: 1.0,                      // 面板背景透明度（0-1）
        entryBlockBgColor: '',                    // 内容块背景色（空=使用默认）
        entryBlockOpacity: 1.0,                   // 内容块透明度（0-1）
        authorColors: {
          user: '',                               // 用户颜色（空=使用默认）
          ai: '',                                 // AI颜色（空=使用默认）
          passerby: ''                            // 路人颜色（空=使用默认）
        },
        background: {
          enabled: false,                         // 是否启用背景图
          currentImageUrl: '',                    // 当前背景图URL
          savedImages: [],                        // 预存图片数组
          maskEnabled: false,                     // 是否启用遮罩
          maskColor: '#000000',                   // 遮罩颜色
          maskOpacity: 0.3                        // 遮罩透明度（0-1）
        },
        commentBox: {
          backgroundColor: '',                    // 评论框背景色（空=使用默认）
          opacity: 1.0,                           // 评论框透明度（0-1）
          borderColor: '',                        // 边框颜色（空=使用默认）
          replyBorderColor: ''                    // 回复边框颜色（空=使用默认）
        }
      },

      // API 设置
      apiConfig: settings.apiConfig || {
        source: 'default',                        // 'default' | 'custom'
        stream: false,                            // 是否流式生成
        currentConfigId: null,                    // 当前使用的配置ID
        customConfigs: []                         // 自定义配置列表
      }
    };
  }

  /**
   * 更新日记设置
   * 
   * @param {Object} newSettings - 新设置对象
   * @param {boolean} [newSettings.includePersonaDescription] - 包含用户设定
   * @param {boolean} [newSettings.includeCharDescription] - 包含角色描述
   * @param {boolean} [newSettings.includeCharPersonality] - 包含角色性格
   * @param {boolean} [newSettings.includeCharScenario] - 包含角色场景
   * @param {boolean} [newSettings.includeWorldInfo] - 包含世界书
   * @param {boolean} [newSettings.includeRecentChat] - 包含最近对话
   * @param {number} [newSettings.recentChatCount] - 最近对话数量
   * @param {boolean} [newSettings.includeHistoryDiaries] - 包含历史日记
   * @param {number} [newSettings.historyDiaryCount] - 历史日记数量
   * @param {boolean} [newSettings.allowCharacterComment] - 允许角色评论（默认true）
   * @param {boolean} [newSettings.allowPasserbyComments] - 允许路人评论
   * @param {string} [newSettings.passerbyPersonality] - 路人性格类型
   * @param {number} [newSettings.passerbyCommentMin] - 路人评论最小数量
   * @param {number} [newSettings.passerbyCommentMax] - 路人评论最大数量
   * @param {boolean} [newSettings.skipDeleteConfirm] - 跳过删除确认
   */
  updateSettings(newSettings) {
    // 确保设置对象存在
    if (!extension_settings[EXT_ID]) {
      extension_settings[EXT_ID] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME]) {
      extension_settings[EXT_ID][MODULE_NAME] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME].settings) {
      extension_settings[EXT_ID][MODULE_NAME].settings = {};
    }

    // 更新设置
    Object.assign(extension_settings[EXT_ID][MODULE_NAME].settings, newSettings);

    // 保存到存储
    saveSettingsDebounced();

    logger.info('[DiaryData.updateSettings] 设置已更新:', newSettings);
  }
}

