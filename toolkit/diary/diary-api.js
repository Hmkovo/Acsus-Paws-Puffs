/**
 * 日记API管理器
 * 
 * @description
 * 负责与AI交互：
 * - 使用 generateQuietPrompt 请求评论/日记（利用官方上下文）
 * - 使用 setExtensionPrompt 注入日记到 D1
 * - 正则提取AI回复中的 [日记] 和 [评论] 标记
 * - 拦截官方聊天消息，提取日记内容
 * 
 * @module DiaryAPI
 */

// ========================================
// [IMPORT] SillyTavern 原生 API
// ========================================
import {
  generateRaw,  // 用于独立生成（不依赖全局控制器）
  eventSource,
  event_types,
  getRequestHeaders,  // 获取请求头
  extractMessageFromData  // 从响应数据提取消息
} from '../../../../../../script.js';
import { extension_settings, getContext } from '../../../../../extensions.js';
import {
  chat_completion_sources,  // API 来源枚举
  oai_settings,  // OpenAI 设置（用于读取官方参数）
  getStreamingReply  // 流式响应解析
} from '../../../../../openai.js';
import { power_user } from '../../../../../power-user.js';  // 用户设定
import { getEventSourceStream } from '../../../../../sse-stream.js';  // SSE 流处理
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from './diary-toast.js';

// ========================================
// [CONST] 常量
// ========================================
const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'diary';

/**
 * 路人性格类型定义（参考弹幕观众类型）
 * 
 * @description
 * 从弹幕观众类型中筛选出适合日记评论的类型
 * 排除了造NPC的类型（plotintervener、abyssalcreator等）
 */
const PASSERBY_PERSONALITIES = {
  default: {
    name: '默认观众',
    description: '正常发送评论，友好温和'
  },
  funny: {
    name: '搞笑观众',
    description: '偏好搞抽象/搞笑/幽默/乐子人/玩梗'
  },
  fanclub: {
    name: '饭圈观众',
    description: '热衷CP配对/磕糖/护短/应援'
  },
  fanficauthor: {
    name: '二创太太',
    description: '同人创作者视角，脑内有无数梗和paro'
  },
  analysis: {
    name: '分析观众',
    description: '分析剧情走向/预测心理/深度解读'
  },
  critic: {
    name: '烂梗吐槽役',
    description: '熟读网文影视剧，对套路了然于胸'
  },
  lore: {
    name: '设定考据党',
    description: '对世界观设定和角色背景了如指掌'
  },
  pessimist: {
    name: '悲观预言家',
    description: '永远能解读出最坏的可能'
  },
  shipper: {
    name: 'CP粉',
    description: '万物皆可CP，引力波都是爱情信号'
  },
  alien: {
    name: '外星观察员',
    description: '以疏离客观视角观察人类行为'
  },
  gamer: {
    name: '第四天灾玩家',
    description: '视为RPG游戏，寻找最优解'
  },
  crossovermaniac: {
    name: '串台乱入者',
    description: '脑子里没有次元壁，强行联动'
  },
  chaos: {
    name: '混乱拱火乐子人',
    description: '唯恐天下不乱，以挑起事端为乐'
  },
  pragmatic: {
    name: '功利不择手段者',
    description: '胜利才是一切，鼓励欺骗背叛'
  },
  vmefifty: {
    name: '好兄弟v我50',
    description: '每到周四就开始V我50咏唱仪式'
  }
};

// ========================================
// [CORE] API管理类
// ========================================

/**
 * 日记API管理器
 * 
 * @class DiaryAPI
 */
export class DiaryAPI {
  /**
   * 创建API管理器
   * 
   * @param {import('./diary-data.js').DiaryDataManager} dataManager - 数据管理器
   */
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.ui = null;  // UI引用（用于后台生成完成后刷新）
    this.currentAbortController = null;  // 当前生成的中止控制器
    this.isGenerating = false;  // 是否正在生成
    this.currentTempIdMap = {};  // 临时日记编号映射（用于批量评论解析）
    this.currentTempCommentIdMap = {};  // 临时评论编号映射（用于精确回复）
  }

  /**
   * 设置UI引用
   * 
   * @param {Object} ui - UI管理器
   */
  setUI(ui) {
    this.ui = ui;
  }

  /**
   * 设置预设管理器引用
   * 
   * @param {import('./diary-preset-data.js').DiaryPresetDataManager} presetManager - 预设管理器
   */
  setPresetManager(presetManager) {
    this.presetManager = presetManager;
    logger.debug('[DiaryAPI.setPresetManager] 预设管理器已设置');
  }

  /**
   * 中止当前生成
   */
  abort() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.isGenerating = false;

      showInfoToast('已中止生成');
      logger.info('[DiaryAPI.abort] 已中止后台生成');

      // 通知UI更新按钮状态
      if (this.ui) {
        this.ui.updateSendButtonState(false);
      }
    }
  }

  /**
   * 初始化
   * 
   * @async
   */
  async init() {
    logger.info('[DiaryAPI] 开始初始化');
    logger.info('[DiaryAPI] 初始化完成');
  }

  /**
   * 请求AI评论日记
   * 
   * @async
   * @param {string} diaryId - 日记ID
   * @param {Object} [options={}] - 选项
   * @param {boolean} [options.includeAIDiary=false] - 是否同时请求AI写日记
   * @returns {Promise<string>} AI回复
   */
  async requestComment(diaryId, { includeAIDiary = false } = {}) {
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) {
      throw new Error('日记不存在');
    }

    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    // 构造提示词
    let prompt = `请评论我的最新日记"${diary.title}"`;

    if (includeAIDiary) {
      prompt += `，并顺便写一篇你今天的日记`;
    }

    logger.info('[DiaryAPI.requestComment] 请求评论:', diaryId);

    try {
      // 调用 generateQuietPrompt（利用官方上下文，不显示在聊天）
      const response = await generateQuietPrompt({
        quietPrompt: prompt,
        quietToLoud: false,      // 不添加到聊天
        skipWIAN: false,         // 包含世界书和注入的日记
        quietName: null,
        responseLength: null
      });

      logger.debug('[DiaryAPI.requestComment] AI回复:', response.substring(0, 100));

      // 提取并保存评论和日记
      await this.extractAndSave(response, diaryId);

      return response;
    } catch (error) {
      logger.error('[DiaryAPI.requestComment] 请求失败:', error);
      throw error;
    }
  }

  /**
   * 异步请求AI评论（后台生成，不阻塞）
   * 
   * @async
   * @param {string} diaryId - 日记ID
   * @description
   * 启动后台异步生成，立即返回不等待。
   * 用户可以关闭面板继续操作，生成完成后显示iOS通知。
   * AI回复会实时显示在预览面板中。
   */
  async requestCommentAsync(diaryId) {
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) {
      throw new Error('日记不存在');
    }

    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    // 清空上次的预览内容
    if (this.ui) {
      this.ui.clearAiPreview();
    }

    // 创建中止控制器
    this.currentAbortController = new AbortController();
    this.isGenerating = true;

    // 显示开始通知
    showInfoToast(`正在请求 ${charName} 评论...`);
    logger.info('[DiaryAPI.requestCommentAsync] 后台生成已启动, diaryId:', diaryId);

    // 通知UI更新按钮状态（发送→中止）
    if (this.ui) {
      this.ui.updateSendButtonState(true);
    }

    // 后台异步生成（不等待）
    this.backgroundGenerate(diaryId, charName, this.currentAbortController.signal)
      .then(response => {
        // 检查是否被中止
        if (!response) {
          logger.info('[DiaryAPI.requestCommentAsync] 生成已中止');
          return;
        }

        // 更新预览面板（显示完整回复）
        if (this.ui) {
          this.ui.updateAiPreview(response);
        }

        // 提取并保存评论
        this.extractAndSave(response, diaryId);

        // 显示完成通知
        showSuccessToast(`${charName} 已评论你的日记！`);

        // 如果面板还开着，刷新UI（保持当前位置，不自动翻页）
        if (this.ui && this.ui.isPanelOpen()) {
          this.ui.refreshDiaries(true);  // ← 传入 true，保持位置
        }

        logger.info('[DiaryAPI.requestCommentAsync] 后台生成完成, diaryId:', diaryId);
      })
      .catch(error => {
        // 区分中止和错误
        if (error.name === 'AbortError') {
          logger.info('[DiaryAPI.requestCommentAsync] 用户中止生成');
          showInfoToast('已中止生成');
        } else {
          logger.error('[DiaryAPI.requestCommentAsync] 生成失败:', error);
          showErrorToast('评论失败：' + error.message);
        }
      })
      .finally(() => {
        // 清理状态
        this.currentAbortController = null;
        this.isGenerating = false;

        // 通知UI恢复按钮状态（中止→发送）
        if (this.ui) {
          this.ui.updateSendButtonState(false);
        }
      });

    // 立即返回，不等待
    return;
  }

  /**
   * 后台生成评论（支持流式和自定义API）
   * 
   * @async
   * @param {string} diaryId - 日记ID
   * @param {string} charName - 角色名称
   * @param {AbortSignal} signal - 中止信号
   * @returns {Promise<string|null>} AI回复（中止时返回null）
   * 
   * @description
   * 完全独立的实现策略：
   * 1. 手动获取角色卡信息
   * 2. 手动获取预设
   * 3. 手动获取世界书（简化版）
   * 4. 手动获取最近聊天历史
   * 5. 构造完整的systemPrompt
   * 6. 根据配置选择API调用方式：
   *    - 默认：使用 generateRaw（复用酒馆API设置）
   *    - 自定义：使用官方后端API（不污染全局设置）
   *    - 流式：实时更新预览面板
   * 
   * 优点：
   * - ✅ 完全独立（不触碰全局chat、不用全局控制器）
   * - ✅ 不会与主聊天冲突
   * - ✅ 可以真正中止
   * - ✅ 支持自定义API配置
   * - ✅ 支持流式和非流式
   * 
   * 包含的上下文：
   * - 角色卡（description、personality、scenario）
   * - 预设（main_prompt、jailbreak_prompt）
   * - 世界书（简化版：角色关联的世界书条目）
   * - 聊天历史（最近5条）
   * 
   * @throws {Error} 日记不存在
   */
  async backgroundGenerate(diaryId, charName, signal) {
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) {
      throw new Error('日记不存在');
    }

    const ctx = getContext();

    // 检查是否已中止
    if (signal.aborted) {
      logger.info('[DiaryAPI.backgroundGenerate] 生成已在开始前中止');
      return null;
    }

    try {
      // === 步骤1：构造完整的系统提示词（作为固定预设的内容） ===
      const { systemPrompt, tempIdMap, tempCommentIdMap } = await this.buildCompleteSystemPrompt(diary, charName, ctx);

      // 保存临时编号映射（用于后续解析评论）
      this.currentTempIdMap = tempIdMap;
      this.currentTempCommentIdMap = tempCommentIdMap;

      // === 步骤2：使用预设管理器构建 messages 数组 ===
      let messages;

      if (this.presetManager) {
        // 使用预设管理器构建完整的 messages 数组
        // 固定预设的内容会被替换为 systemPrompt
        messages = this.presetManager.buildMessagesArray(systemPrompt);
        logger.debug('[DiaryAPI.backgroundGenerate] 使用预设构建messages，共', messages.length, '条');
      } else {
        // 降级：如果预设管理器未初始化，使用简单方式
        logger.warn('[DiaryAPI.backgroundGenerate] 预设管理器未初始化，使用简单方式');
        messages = [
          { role: 'system', content: systemPrompt }
        ];
      }

      // 再次检查是否已中止
      if (signal.aborted) {
        logger.info('[DiaryAPI.backgroundGenerate] 构建完成后检测到中止');
        return null;
      }

      // === 步骤3：获取 API 配置 ===
      const settings = this.dataManager.getSettings();
      const apiSettings = settings.apiConfig || { source: 'default', stream: false };

      logger.debug('[DiaryAPI.backgroundGenerate] ========== 发送给AI的messages ==========');
      logger.debug(JSON.stringify(messages, null, 2));
      logger.debug('[DiaryAPI.backgroundGenerate] ========== messages结束 ==========');
      logger.debug('[DiaryAPI.backgroundGenerate] API配置源:', apiSettings.source, '流式:', apiSettings.stream);

      // === 步骤4：构造完整的 API 配置对象 ===
      let apiConfig = {
        source: apiSettings.source,
        stream: apiSettings.stream
      };

      // 如果是自定义 API，需要从 customConfigs 中获取具体配置
      if (apiSettings.source === 'custom') {
        const currentConfigId = apiSettings.currentConfigId;
        const customConfigs = apiSettings.customConfigs || [];
        const currentConfig = customConfigs.find(c => c.id === currentConfigId);

        if (!currentConfig) {
          logger.error('[DiaryAPI.backgroundGenerate] 未找到当前API配置，currentConfigId:', currentConfigId);
          throw new Error('未找到API配置，请先在设置中保存一个配置');
        }

        // 合并配置
        apiConfig = {
          ...apiConfig,
          baseUrl: currentConfig.baseUrl,
          apiKey: currentConfig.apiKey,
          model: currentConfig.model
        };

        logger.debug('[DiaryAPI.backgroundGenerate] 使用自定义API配置:', {
          name: currentConfig.name,
          baseUrl: currentConfig.baseUrl,
          model: currentConfig.model
        });
      }

      // === 步骤5：根据配置选择调用方式 ===
      let response;

      if (apiConfig.source === 'custom') {
        // 自定义 API：使用官方后端（不污染全局设置）
        response = await this.callAPIWithStreaming(messages, apiConfig, signal);
      } else {
        // 默认：使用 generateRaw（复用酒馆API设置）
        response = await generateRaw({
          prompt: messages,
          responseLength: 200,
          api: null  // 使用当前API
        });
      }

      logger.debug('[DiaryAPI.backgroundGenerate] AI回复:', response?.substring(0, 100) || '');

      return response;

    } catch (error) {
      // 如果是中止错误，返回null
      if (error.name === 'AbortError' || signal.aborted) {
        logger.info('[DiaryAPI.backgroundGenerate] 生成被中止');
        return null;
      }

      throw error;
    }
  }

  // ========================================
  // [FUNC] 流式API调用（参考官方后端）
  // ========================================

  /**
   * 调用API（支持流式和自定义配置）
   * 
   * @async
   * @param {Array<Object>} messages - 消息数组
   * @param {Object} apiConfig - API配置
   * @param {string} apiConfig.source - 'default' | 'custom'
   * @param {boolean} [apiConfig.stream=false] - 是否流式
   * @param {string} [apiConfig.baseUrl] - 自定义端点（仅 custom 时）
   * @param {string} [apiConfig.apiKey] - 自定义密钥（仅 custom 时）
   * @param {string} [apiConfig.model] - 自定义模型（仅 custom 时）
   * @param {AbortSignal} signal - 中止信号
   * @returns {Promise<string>} AI回复文本
   * 
   * @description
   * 参考官方后端API的实现，通过 /api/backends/chat-completions/generate 调用。
   * 配置通过请求 body 参数传递，不污染全局 oai_settings。
   * 
   * Temperature、Max Tokens 等参数使用官方 oai_settings 的值（不重复造轮子）。
   * 
   * 流式处理逻辑：
   * - 如果 stream=true，实时更新预览面板
   * - 如果 stream=false，等待完整响应
   */
  async callAPIWithStreaming(messages, apiConfig, signal) {
    // 获取模型名称（必需字段）
    let model = apiConfig.model;
    if (!model) {
      // 降级：使用官方的模型设置
      model = oai_settings.openai_model || 'gpt-4o-mini';
      logger.warn('[DiaryAPI.callAPIWithStreaming] 未设置模型，使用官方默认:', model);
    }

    // 构造请求 body（使用官方参数）
    const body = {
      type: 'quiet',  // 标记为 quiet 类型（不添加到聊天）
      messages: messages,
      model: model,  // 必需字段
      stream: apiConfig.stream || false,
      chat_completion_source: chat_completion_sources.OPENAI,  // 默认 OpenAI 兼容
      // 使用官方的参数设置（不重复造轮子）
      max_tokens: Number(oai_settings.openai_max_tokens) || 200,
      temperature: Number(oai_settings.temp_openai) || 1.0,
      frequency_penalty: Number(oai_settings.freq_pen_openai) || 0,
      presence_penalty: Number(oai_settings.pres_pen_openai) || 0,
      top_p: Number(oai_settings.top_p_openai) || 1.0
    };

    // 如果是自定义 API，添加配置
    if (apiConfig.source === 'custom') {
      if (apiConfig.baseUrl) {
        body.reverse_proxy = apiConfig.baseUrl;
      }
      if (apiConfig.apiKey) {
        body.proxy_password = apiConfig.apiKey;
      }
    }

    logger.debug('[DiaryAPI.callAPIWithStreaming] 请求配置:', {
      source: apiConfig.source,
      stream: body.stream,
      model: body.model,
      baseUrl: body.reverse_proxy || '使用酒馆默认',
      temperature: body.temperature,
      maxTokens: body.max_tokens
    });

    // 调用官方后端（不污染全局设置）
    const response = await fetch('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify(body),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[DiaryAPI.callAPIWithStreaming] API调用失败:', response.status, errorText);
      throw new Error(`API调用失败: ${response.status} ${errorText}`);
    }

    // 流式 vs 非流式
    if (apiConfig.stream) {
      // 流式处理（实时更新预览面板）
      return await this.handleStreamResponse(response, signal);
    } else {
      // 非流式处理（等待完整响应）
      const data = await response.json();
      const message = extractMessageFromData(data);
      return message || '';
    }
  }

  /**
   * 处理流式响应（实时更新预览面板）
   * 
   * @async
   * @param {Response} response - Fetch 响应对象
   * @param {AbortSignal} signal - 中止信号
   * @returns {Promise<string>} 完整的AI回复文本
   * 
   * @description
   * 参考官方流式处理逻辑，使用 SSE 流解析。
   * 每收到一块文本就实时更新预览面板。
   */
  async handleStreamResponse(response, signal) {
    const eventStream = getEventSourceStream();
    response.body.pipeThrough(eventStream);
    const reader = eventStream.readable.getReader();

    let fullText = '';
    const state = { reasoning: '', image: '' };  // 用于 getStreamingReply

    try {
      while (true) {
        // 检查是否已中止
        if (signal.aborted) {
          logger.info('[DiaryAPI.handleStreamResponse] 流式生成被中止');
          break;
        }

        const { done, value } = await reader.read();

        if (done || !value?.data || value.data === '[DONE]') {
          logger.debug('[DiaryAPI.handleStreamResponse] 流式生成完成');
          break;
        }

        // 解析 SSE 数据
        let parsed;
        try {
          parsed = JSON.parse(value.data);
        } catch (error) {
          logger.warn('[DiaryAPI.handleStreamResponse] 解析SSE数据失败:', error);
          continue;
        }

        // 提取文本块
        const chunk = getStreamingReply(parsed, state, {
          chatCompletionSource: chat_completion_sources.OPENAI
        });

        if (typeof chunk === 'string' && chunk) {
          fullText += chunk;

          // 实时更新预览面板
          if (this.ui) {
            this.ui.updateAiPreview(fullText);
          }

          logger.debug('[DiaryAPI.handleStreamResponse] 收到文本块，当前长度:', fullText.length);
        }
      }

      return fullText;

    } catch (error) {
      // 如果是中止错误，返回已有文本
      if (error.name === 'AbortError' || signal.aborted) {
        logger.info('[DiaryAPI.handleStreamResponse] 流式生成被中止，返回部分文本');
        return fullText;
      }

      throw error;

    } finally {
      // 释放读取器
      try {
        reader.releaseLock?.();
      } catch (error) {
        logger.warn('[DiaryAPI.handleStreamResponse] 释放读取器失败:', error);
      }
    }
  }

  // ========================================
  // [FUNC] 上下文构建
  // ========================================

  /**
   * 构造完整的系统提示词（支持临时编号和批量评论）
   * 
   * @async
   * @param {Object} diary - 当前日记对象
   * @param {string} charName - 角色名称
   * @param {Object} ctx - 上下文对象
   * @returns {Promise<{systemPrompt: string, tempIdMap: Object, tempCommentIdMap: Object}>} 系统提示词和临时编号映射
   * 
   * @description
   * 根据用户设置选择性包含上下文（按 SillyTavern 官方顺序）：
   * - 用户设定（Persona Description）
   * - 角色卡（description、personality、scenario）
   * - 世界书（常驻条目，已过滤未激活条目）
   * - 最近聊天历史
   * - 历史日记（按时间正序：最早到最新）
   * - 当前日记（含已有评论）
   * - 评论要求（支持路人评论和批量评论）
   * 
   * 使用临时编号系统：
   * - 如果包含历史日记：#1(最早历史)、#2(次早)、...、#N(当前)
   * - 如果不包含历史日记：单条日记，简化格式
   */
  async buildCompleteSystemPrompt(diary, charName, ctx) {
    let systemPrompt = '';
    const settings = this.dataManager.getSettings();
    const character = ctx.characters[ctx.characterId];

    // === 1. 用户设定（根据设置） ===
    if (settings.includePersonaDescription) {
      const personaDesc = power_user.persona_description;
      if (personaDesc && personaDesc.trim()) {
        systemPrompt += `# 用户设定\n${personaDesc}\n\n`;
        logger.debug('[DiaryAPI.buildCompleteSystemPrompt] 已包含用户设定');
      }
    }

    // === 2. 角色卡（根据设置选择性包含） ===
    if (character) {
      let hasCharInfo = false;
      let charInfo = '';

      if (settings.includeCharDescription && character.description) {
        charInfo += `${character.description}\n\n`;
        hasCharInfo = true;
      }

      if (settings.includeCharPersonality && character.personality) {
        charInfo += `性格：${character.personality}\n\n`;
        hasCharInfo = true;
      }

      if (settings.includeCharScenario && character.scenario) {
        charInfo += `场景：${character.scenario}\n\n`;
        hasCharInfo = true;
      }

      if (hasCharInfo) {
        systemPrompt += `# 角色信息\n`;
        systemPrompt += `你是 ${character.name}。\n\n`;
        systemPrompt += charInfo;
      }
    }

    // === 3. 世界书（根据设置） ===
    if (settings.includeWorldInfo) {
      const worldInfo = await this.getSimpleWorldInfo(ctx.characterId);
      if (worldInfo) {
        systemPrompt += worldInfo;
      }
    }

    // === 4. 最近聊天历史（根据设置和数量） ===
    if (settings.includeRecentChat) {
      const count = settings.recentChatCount || 5;
      const recentChat = this.getRecentChatHistory(ctx, count);
      if (recentChat) {
        systemPrompt += `# 最近对话\n${recentChat}\n\n`;
      }
    }

    // === 5. 收集要发送的日记（历史+当前） ===
    const diariesToSend = [];
    const tempIdMap = {};  // 临时日记编号映射：{1: 'realDiaryId1', 2: 'realDiaryId2'}
    const tempCommentIdMap = {};  // 临时评论编号映射：{c1: 'realCommentId1', c2: 'realCommentId2'}

    // 5.1 获取历史日记（如果启用）
    if (settings.includeHistoryDiaries) {
      const count = settings.historyDiaryCount || 3;
      const historyDiaries = this.getHistoryDiariesObjects(diary.id, count);
      diariesToSend.push(...historyDiaries);
    }

    // 5.2 添加当前日记（最后）
    diariesToSend.push(diary);

    // 5.3 创建临时日记编号映射（#1=最早, #2=次早, ..., #N=当前）
    diariesToSend.forEach((d, index) => {
      tempIdMap[index + 1] = d.id;  // {1: 'id1', 2: 'id2', ...}
    });

    // === 6. 构造日记内容部分 ===
    if (diariesToSend.length > 1) {
      // 批量日记：使用临时编号
      systemPrompt += `# 用户的最近日记（共${diariesToSend.length}篇）\n\n`;

      diariesToSend.forEach((d, index) => {
        const tempId = index + 1;
        // 格式化内容块：图片类型发送URL+描述，文字类型发送内容
        const content = d.contentBlocks
          .map(b => {
            if (b.type === 'image' && b.imageUrl) {
              return `[图片链接：${b.imageUrl}]\n[图片描述：${b.imageDesc || '无描述'}]`;
            }
            return b.content;
          })
          .filter(c => c.trim())
          .join('\n');

        systemPrompt += `#${tempId} ${d.title} (${d.date})\n`;
        systemPrompt += `${content || '（空白日记）'}\n`;

        // 包含已有评论（带层级结构和临时编号）
        if (d.comments && d.comments.length > 0) {
          logger.debug(`[DiaryAPI.buildCompleteSystemPrompt] 日记 #${index + 1} 的评论结构:`, JSON.stringify(d.comments, null, 2));
          systemPrompt += `\n已有评论：\n`;
          systemPrompt += this.formatCommentsWithReplies(d.comments, 1, tempCommentIdMap);
        }

        systemPrompt += `\n`;
      });
    } else {
      // 单条日记：简化格式（不用临时日记编号，但用临时评论编号）
      // 格式化内容块：图片类型发送URL+描述，文字类型发送内容
      const content = diary.contentBlocks
        .map(b => {
          if (b.type === 'image' && b.imageUrl) {
            return `[图片链接：${b.imageUrl}]\n[图片描述：${b.imageDesc || '无描述'}]`;
          }
          return b.content;
        })
        .filter(c => c.trim())
        .join('\n');

      systemPrompt += `# 用户的日记\n`;
      systemPrompt += `【标题】${diary.title}\n`;
      systemPrompt += `【日期】${diary.date}\n`;
      systemPrompt += `【内容】\n${content || '（空白日记）'}\n`;

      // 包含已有评论（带层级结构和临时编号）
      if (diary.comments && diary.comments.length > 0) {
        logger.debug('[DiaryAPI.buildCompleteSystemPrompt] 单条日记的评论结构:', JSON.stringify(diary.comments, null, 2));
        systemPrompt += `\n已有评论：\n`;
        systemPrompt += this.formatCommentsWithReplies(diary.comments, 1, tempCommentIdMap);
      }

      systemPrompt += '\n';
    }

    // === 6. 评论任务（可选，根据设置决定）===
    const hasCommentTask = settings.allowCharacterComment || settings.allowPasserbyComments;
    if (hasCommentTask) {
      systemPrompt += this.buildCommentTask(diariesToSend, charName, settings);
      logger.debug('[DiaryAPI.buildCompleteSystemPrompt] 已添加评论任务提示词');
    } else {
      logger.debug('[DiaryAPI.buildCompleteSystemPrompt] 已关闭角色评论和路人评论，跳过评论任务');
    }

    // 记录完整的系统提示词（用于调试）
    logger.debug('[DiaryAPI.buildCompleteSystemPrompt] ========== 完整系统提示词 ==========');
    logger.debug(systemPrompt);
    logger.debug('[DiaryAPI.buildCompleteSystemPrompt] ========== 提示词结束 ==========');
    logger.debug('[DiaryAPI.buildCompleteSystemPrompt] 临时日记编号映射:', tempIdMap);
    logger.debug('[DiaryAPI.buildCompleteSystemPrompt] 临时评论编号映射:', tempCommentIdMap);

    return { systemPrompt, tempIdMap, tempCommentIdMap };
  }

  /**
   * 格式化评论（带回复层级和临时评论编号）
   * 
   * @param {Array<Object>} comments - 评论数组
   * @param {number} [indent=1] - 缩进级别
   * @param {Object} [commentIdMap=null] - 评论ID映射（传入时会填充）
   * @param {Array} [counter=[1]] - 评论计数器（用于生成递增编号）
   * @returns {string} 格式化的评论文本
   * 
   * @description
   * 递归格式化评论，显示回复层级关系
   * 为每条评论分配临时编号（#c1, #c2, #c3...）
   * 避免AI重复已有的评论内容
   */
  formatCommentsWithReplies(comments, indent = 1, commentIdMap = null, counter = [1]) {
    if (!comments || comments.length === 0) {
      return '';
    }

    let result = '';
    const prefix = '  '.repeat(indent);

    comments.forEach(comment => {
      const authorDisplay = comment.authorName || comment.author;

      // 分配临时评论编号
      const tempCommentId = `c${counter[0]}`;
      if (commentIdMap) {
        commentIdMap[tempCommentId] = comment.id;  // 映射：c1 → 真实commentId
      }
      counter[0]++;  // 递增计数器

      // 格式：#c1 作者：内容
      result += `${prefix}#${tempCommentId} ${authorDisplay}：${comment.content}\n`;

      logger.debug('[DiaryAPI.formatCommentsWithReplies] 格式化评论:', {
        tempId: tempCommentId,
        realId: comment.id,
        author: authorDisplay,
        content: comment.content.substring(0, 30),
        hasReplies: !!(comment.replies && comment.replies.length > 0),
        replyCount: comment.replies?.length || 0,
        indent: indent
      });

      // 递归显示回复（使用同一个commentIdMap和counter）
      if (comment.replies && comment.replies.length > 0) {
        result += this.formatCommentsWithReplies(comment.replies, indent + 1, commentIdMap, counter);
      }
    });

    return result;
  }

  /**
   * 构建评论任务提示词（参考弹幕系统风格）
   * 
   * @param {Array<Object>} diariesToSend - 要评论的日记数组
   * @param {string} charName - 角色名称
   * @param {Object} settings - 设置对象
   * @returns {string} 评论任务提示词
   */
  buildCommentTask(diariesToSend, charName, settings) {
    const isBatch = diariesToSend.length > 1;
    const allowPasserby = settings.allowPasserbyComments;
    const personality = PASSERBY_PERSONALITIES[settings.passerbyPersonality] || PASSERBY_PERSONALITIES.default;

    let task = '';

    if (isBatch) {
      // 批量日记评论
      if (allowPasserby) {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了${diariesToSend.length}篇日记，需要你作为角色"${charName}"或"路人"进行评论

  角色扮演要求:
    作为${charName}评论时:
      - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
      - 评论的语气、用词、关注点必须符合${charName}的性格设定
    
    作为路人评论时:
      - 当前路人类型：**${personality.name}**
      - 性格特点：${personality.description}
      - 路人ID命名：符合当前路人类型，(参考微博/贴吧/小红书风格)
      - 同一路人ID在不同日记下保持一致性格

  互动规则:
    - ${charName}至少为每篇日记写1条评论
    - 路人评论数量：${settings.passerbyCommentMin}~${settings.passerbyCommentMax}条
    - 路人之间可以互相回复
    - 路人可以回复${charName}，${charName}也可以回复路人
    - 至少20%的评论应该形成互动（回复其他评论）

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，优先回复{{user}}
    2. 如果${charName}已评论过该日记：可以回复其他人，或根据性格补充新观点（不强制重复评论）
    3. 如果日记无评论：${charName}和路人都可以直接评论

  编号系统说明:
    日记编号（#1、#2、#3）:
      - 上方显示了多篇日记，每篇都有临时日记编号
      - #1 = 最早的日记，#2 = 次早，#3 = 最新（当前）
      - 评论时必须写明日记编号
    
    评论编号（#c1、#c2、#c3）:
      - 已有评论也有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
      - 用于精确回复某条评论（避免同一人有多条评论时混淆）
      - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: #日记编号 评论者ID：评论内容
    回复已有评论格式: #日记编号 评论者ID回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：写明日记编号即可（#1、#2、#3）
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 评论者ID和内容之间用中文冒号：或英文冒号:分隔

  输出示例:
    假设日记#3有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    #1 ${charName}：评论日记#1
    #1 @路人ID：评论日记#1
    #2 @路人ID：评论日记#2
    #3 ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    #3 @路人ID回复@c1：回复${charName}的#c1
    [/评论]
</日记评论任务>
`;
      } else {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了${diariesToSend.length}篇日记，需要你作为角色"${charName}"进行评论

  角色扮演要求:
    - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
    - 评论的语气、用词、关注点必须符合${charName}的性格设定
    - 评论数量根据角色性格和日记内容决定，但每篇日记下必须至少1条评论

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，${charName}应该优先回复{{user}}
    2. 如果${charName}已评论过该日记：可以回复其他人，或根据性格补充新观点（不强制重复评论）
    3. 如果日记无评论：${charName}直接评论日记内容

  编号系统说明:
    日记编号（#1、#2、#3）:
      - 上方显示了多篇日记，每篇都有临时日记编号
      - #1 = 最早的日记，#2 = 次早，#3 = 最新（当前）
      - 评论时必须写明日记编号
    
    评论编号（#c1、#c2、#c3）:
      - 已有评论也有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
      - 用于精确回复某条评论（避免同一人有多条评论时混淆）
      - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: #日记编号 ${charName}：评论内容
    回复已有评论格式: #日记编号 ${charName}回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：写明日记编号即可（#1、#2、#3）
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 必须使用你的名字"${charName}"
      - 评论者ID和内容之间用中文冒号：或英文冒号:分隔

  输出示例:
    假设日记#3有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    #1 ${charName}：评论日记#1
    #2 ${charName}：评论日记#2
    #3 ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    #3 ${charName}：也可以写新的评论
    [/评论]
</日记评论任务>
`;
      }
    } else {
      // 单条日记评论
      if (allowPasserby) {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了一篇日记，需要你作为角色"${charName}"或"路人"进行评论

  角色扮演要求:
    - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
    - 评论的语气、用词、关注点必须符合${charName}的性格设定
    - 评论数量根据角色性格和日记内容决定，但每篇日记下必须至少1条评论
    
    作为路人评论时:
      - 当前路人观众类型：**${personality.name}**
      - 性格特点：${personality.description}
      - 路人ID命名：符合当前路人类型，(参考微博/贴吧/小红书风格)

  互动规则:
    - ${charName}至少写1条评论
    - 路人评论数量：${settings.passerbyCommentMin}~${settings.passerbyCommentMax}条
    - 路人之间可以互相回复
    - 路人可以回复${charName}，${charName}也可以回复路人
    - 鼓励形成对话互动（回复其他评论）

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录，**每条评论都有临时编号（#c1、#c2、#c3...）**
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，${charName}或路人应该优先回复{{user}}
    2. 如果某人已评论过：可以回复其他人，或根据性格补充新观点（不强制重复）

  评论编号说明:
    - 已有评论有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
    - 用于精确回复某条评论（避免同一人有多条评论时混淆）
    - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: 评论者ID：评论内容
    回复已有评论格式: 评论者ID回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：直接写"评论者ID：内容"
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 评论者ID和内容之间用中文冒号：或英文冒号:分隔

  输出示例:
    假设日记有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    @路人ID：评论内容
    @路人ID回复@c1：回复${charName}的#c1
    [/评论]
</日记评论任务>
`;
      } else {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了一篇日记，需要你作为角色"${charName}"进行评论

  角色扮演要求:
    - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
    - 评论的语气、用词、关注点必须符合${charName}的性格设定
    - 评论数量根据角色性格和日记内容决定，但每篇日记下必须至少1条评论

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录，**每条评论都有临时编号（#c1、#c2、#c3...）**
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，${charName}应该优先回复{{user}}
    2. 如果${charName}已评论过：可以回复其他人，或根据性格补充新观点（不强制重复）

  评论编号说明:
    - 已有评论有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
    - 用于精确回复某条评论（避免同一人有多条评论时混淆）
    - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: ${charName}：评论内容
    回复已有评论格式: ${charName}回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：直接写"${charName}：内容"
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 可以写多条评论（每条另起一行）

  输出示例:
    假设日记有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    ${charName}：评论内容
    [/评论]
</日记评论任务>
`;
      }
    }

    return task;
  }

  /**
   * 获取简化版世界书
   * 
   * @async
   * @param {number} characterId - 角色ID
   * @returns {Promise<string>} 世界书文本
   * 
   * @description
   * 只获取角色关联世界书中的常驻条目（constant=true）
   * 不做关键词扫描，不限制数量
   */
  async getSimpleWorldInfo(characterId) {
    try {
      const ctx = getContext();
      const character = ctx.characters[characterId];

      if (!character || !character.data?.character_book) {
        return '';
      }

      const characterBook = character.data.character_book;
      const entries = characterBook.entries || [];

      if (entries.length === 0) {
        return '';
      }

      // 获取常驻条目（constant=true，不限制数量）
      const entriesAny = /** @type {any[]} */ (entries);
      const constantEntries = entriesAny
        .filter(e => {
          // 1. 排除未激活的（killSwitch off）
          if (e.enabled === false) return false;

          // 2. 排除禁用的
          if (e.disable || e.disabled) return false;

          // 3. 只保留常驻条目（绿灯）
          return e.constant === true;
        })
        .map(e => e.content || e.comment || '')
        .filter(c => c.trim())
        .join('\n\n');

      if (!constantEntries) {
        return '';
      }

      const constantCount = entriesAny.filter(e =>
        !e.disable && !e.disabled && e.constant === true
      ).length;

      logger.debug('[DiaryAPI.getSimpleWorldInfo] 已获取常驻世界书，条目数:', constantCount);

      return `# 世界设定\n${constantEntries}\n\n`;

    } catch (error) {
      logger.warn('[DiaryAPI.getSimpleWorldInfo] 获取世界书失败:', error.message);
      return '';
    }
  }

  /**
   * 获取最近聊天历史
   * 
   * @param {Object} ctx - 上下文对象
   * @param {number} count - 获取最近N条
   * @returns {string} 聊天历史文本
   */
  getRecentChatHistory(ctx, count = 5) {
    if (!ctx.chat || ctx.chat.length === 0) {
      return '';
    }

    const recentMessages = ctx.chat
      .slice(-count)
      .map(msg => {
        const author = msg.is_user ? ctx.name1 : ctx.name2;
        const content = msg.mes || '';
        return `${author}: ${content}`;
      })
      .join('\n');

    return recentMessages;
  }

  /**
   * 获取历史日记对象（用于批量评论）
   * 
   * @param {string} currentDiaryId - 当前日记ID（排除）
   * @param {number} count - 获取最近N条
   * @returns {Array<Object>} 历史日记对象数组（按时间正序：最早到最新）
   * 
   * @description
   * 获取最近的历史日记对象（排除当前日记和隐私日记）
   * 返回完整的日记对象数组，用于构造临时编号系统
   */
  getHistoryDiariesObjects(currentDiaryId, count = 3) {
    const allDiaries = this.dataManager.getDiaries();

    if (allDiaries.length === 0) {
      return [];
    }

    // 筛选：排除当前日记、排除隐私日记
    // 取最近N条，保持正序（最早到最新）
    const historyDiaries = allDiaries
      .filter(d => d.id !== currentDiaryId && !d.privacy)
      .slice(-count);  // 取最近N条（已经是正序）

    return historyDiaries;
  }

  /**
   * 从AI回复提取并保存内容
   * 
   * @async
   * @param {string} response - AI回复文本
   * @param {string} [targetDiaryId] - 目标日记ID（评论）
   */
  async extractAndSave(response, targetDiaryId = null) {
    // 提取 [日记]...[/日记]
    const diaryMatches = [...response.matchAll(/\[日记\]([\s\S]*?)\[\/日记\]/g)];
    if (diaryMatches.length > 0) {
      diaryMatches.forEach(match => {
        const diaryContent = match[1].trim();
        this.saveAIDiary(diaryContent);
      });
      logger.info('[DiaryAPI.extractAndSave] 提取了', diaryMatches.length, '篇AI日记');
    }

    // 提取 [评论]...[/评论]
    const commentMatches = [...response.matchAll(/\[评论\]([\s\S]*?)\[\/评论\]/g)];
    if (commentMatches.length > 0 && targetDiaryId) {
      commentMatches.forEach(match => {
        const commentContent = match[1].trim();
        this.parseAndSaveComments(commentContent, targetDiaryId);
      });
      logger.info('[DiaryAPI.extractAndSave] 提取了评论');
    }
  }

  /**
   * 保存AI的日记
   * 
   * @description
   * 解析AI写的日记内容，格式：
   * 标题：xxx
   * 日期：2025-10-16
   * 星期：周三
   * 
   * 正文内容
   * [图片：描述]
   * 
   * @param {string} content - 日记内容
   */
  saveAIDiary(content) {
    logger.debug('[DiaryAPI.saveAIDiary] 开始解析AI日记，原始内容:', content.substring(0, 100));

    // 解析标题
    const titleMatch = content.match(/标题[:：]\s*(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : 'AI的日记';

    // 解析日期
    const dateMatch = content.match(/日期[:：]\s*(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

    // 解析星期
    const dayOfWeekMatch = content.match(/星期[:：]\s*(周[一二三四五六日])/);
    const dayOfWeek = dayOfWeekMatch ? dayOfWeekMatch[1] : '';

    // 去除头部（标题、日期、星期），提取正文
    let bodyContent = content;
    bodyContent = bodyContent.replace(/标题[:：].*?\n/, '');
    bodyContent = bodyContent.replace(/日期[:：].*?\n/, '');
    bodyContent = bodyContent.replace(/星期[:：].*?\n/, '');
    bodyContent = bodyContent.trim();

    // 解析内容块（文字和图片）
    const contentBlocks = [];

    // 按行分割，处理文字和图片
    const lines = bodyContent.split('\n');
    let currentTextBlock = '';

    lines.forEach(line => {
      line = line.trim();
      if (!line) {
        // 空行：如果有累积的文字，保存为一个文字块
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

      // 检查是否是图片标记：[图片：描述]
      const imageMatch = line.match(/\[图片[:：](.+?)\]/);
      if (imageMatch) {
        // 先保存累积的文字块
        if (currentTextBlock) {
          contentBlocks.push({
            type: 'text',
            tag: '',
            time: '',
            content: currentTextBlock.trim()
          });
          currentTextBlock = '';
        }

        // 添加图片块
        const imageDesc = imageMatch[1].trim();
        contentBlocks.push({
          type: 'image',
          tag: '📷',
          time: '',
          imageUrl: '',  // AI不能发真实图片
          imageDesc: imageDesc,
          content: `[图片：${imageDesc}]`
        });
      } else {
        // 普通文字，累积到当前文字块
        if (currentTextBlock) {
          currentTextBlock += '\n' + line;
        } else {
          currentTextBlock = line;
        }
      }
    });

    // 保存最后的文字块
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

    // 保存到数据管理器
    this.dataManager.diaries.push(diary);
    this.dataManager.saveDiaries();

    logger.info('[DiaryAPI.saveAIDiary] 已保存AI日记:', {
      id: diary.id,
      title: diary.title,
      date: diary.date,
      contentBlocksCount: contentBlocks.length
    });

    // 刷新UI（如果有引用）
    if (this.ui) {
      this.ui.refreshDiaries();
    }
  }

  /**
   * 从日期字符串计算星期
   * 
   * @param {string} dateStr - 日期字符串（YYYY-MM-DD）
   * @returns {string} 星期（周一~周日）
   */
  getDayOfWeekFromDate(dateStr) {
    const date = new Date(dateStr);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
  }

  /**
   * 解析并保存评论（支持批量和单条）
   * 
   * @param {string} commentText - 评论文本
   * @param {string} diaryId - 目标日记ID（仅用于单条评论）
   * 
   * @description
   * 支持两种格式：
   * 
   * 1. 批量格式（使用临时编号）：
   *    #1 路人A：评论内容1
   *    #2 鬼面：评论内容2
   *    #3 路人B：评论内容3
   * 
   * 2. 单条格式（旧格式，兼容）：
   *    Seraphina：听起来很舒服呢~
   *    路人A：我也想洗澡
   */
  parseAndSaveComments(commentText, diaryId) {
    // 检测格式：是否包含 #编号
    const hasTempId = /#\d+\s+/.test(commentText);

    if (hasTempId) {
      // 批量格式：按行分组
      this.parseBatchComments(commentText);
    } else {
      // 单条格式：保存到指定日记
      this.parseSingleComment(commentText, diaryId);
    }
  }

  /**
   * 解析批量评论（使用临时编号映射）
   * 
   * @param {string} commentText - 评论文本
   * 
   * @example
   * #1 鬼面：今天看起来很开心呢~
   * #1 @爱吃螺蛳粉：螺蛳粉确实很辣！
   * #2 @深夜emo怪：抱抱，明天会更好的
   * #3 鬼面回复@c2：当然啦，我请你喝！（精确回复#c2）
   */
  parseBatchComments(commentText) {
    // 按行分割
    const lines = commentText.split('\n').map(l => l.trim()).filter(l => l);

    // 用于记录每个日记下的评论者ID映射（用于建立回复关系）
    const diaryAuthorMap = {};  // {realDiaryId: {authorName: lastCommentId}}

    lines.forEach(line => {
      // 正则：#编号 作者(可能带"回复@目标")：内容
      const match = line.match(/^#(\d+)\s+(.+?)[:：]\s*(.+)$/);
      if (!match) return;

      const [, tempIdStr, authorPart, content] = match;
      const tempId = parseInt(tempIdStr);

      // 使用临时编号映射获取真实日记ID
      const realDiaryId = this.currentTempIdMap[tempId];
      if (!realDiaryId) {
        logger.warn('[DiaryAPI.parseBatchComments] 无效的临时日记编号:', tempId);
        return;
      }

      // 解析作者和回复目标
      let authorName = authorPart.trim();
      let replyToTarget = null;

      // 匹配两种回复格式：
      // 1. 回复@c1（临时评论编号，推荐）
      // 2. 回复@作者名（旧格式，兼容）
      const replyMatch = authorPart.match(/^(.+?)回复@(c\d+|.+?)$/);
      if (replyMatch) {
        authorName = replyMatch[1].trim();
        replyToTarget = replyMatch[2].trim();
      }

      // 初始化这个日记的映射表
      if (!diaryAuthorMap[realDiaryId]) {
        diaryAuthorMap[realDiaryId] = {};
      }

      // 查找被回复的评论ID
      let parentCommentId = null;
      if (replyToTarget) {
        // 检查是否是临时评论编号（c1、c2、c3）
        if (replyToTarget.startsWith('c') && this.currentTempCommentIdMap[replyToTarget]) {
          // 使用临时评论编号映射（精确）
          parentCommentId = this.currentTempCommentIdMap[replyToTarget];
          logger.debug('[DiaryAPI.parseBatchComments] 使用临时评论编号映射:', replyToTarget, '→', parentCommentId);
        } else if (diaryAuthorMap[realDiaryId][replyToTarget]) {
          // 使用作者名映射（兼容旧格式）
          parentCommentId = diaryAuthorMap[realDiaryId][replyToTarget];
          logger.debug('[DiaryAPI.parseBatchComments] 使用作者名映射:', replyToTarget, '→', parentCommentId);
        }
      }

      // 创建评论
      const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 使用 parentCommentId 参数（而不是 replyTo 字段）
      this.dataManager.addComment(
        realDiaryId,
        {
          id: commentId,
          author: authorName,
          authorName: authorName,
          content: content.trim(),
          timestamp: Date.now(),
          createdAt: new Date().toISOString()
        },
        parentCommentId  // ← 传入 parentCommentId
      );

      // 记录这个作者的最新评论ID（用于后续被回复）
      diaryAuthorMap[realDiaryId][authorName] = commentId;

      logger.debug('[DiaryAPI.parseBatchComments] 已保存评论:', authorName, parentCommentId ? `回复${replyToTarget}` : '');
    });
  }

  /**
   * 解析单条评论（不使用临时日记编号）
   * 
   * @param {string} commentText - 评论文本
   * @param {string} diaryId - 目标日记ID
   * 
   * @example
   * Seraphina：听起来很舒服呢~
   * @路人A：我也想洗澡
   * 鬼面回复@c2：当然啦，我请你喝！（精确回复#c2）
   */
  parseSingleComment(commentText, diaryId) {
    // 按行分割，每行一条评论
    const lines = commentText.split('\n').map(l => l.trim()).filter(l => l);

    // 用于记录评论者ID映射（用于建立回复关系）
    const authorMap = {};  // {authorName: lastCommentId}

    lines.forEach(line => {
      // 正则：作者(可能带"回复@目标")：内容
      const match = line.match(/^(.+?)[:：]\s*(.+)$/);
      if (!match) return;

      const [, authorPart, content] = match;

      // 解析作者和回复目标
      let authorName = authorPart.trim();
      let replyToTarget = null;

      // 匹配两种回复格式：
      // 1. 回复@c1（临时评论编号，推荐）
      // 2. 回复@作者名（旧格式，兼容）
      const replyMatch = authorPart.match(/^(.+?)回复@(c\d+|.+?)$/);
      if (replyMatch) {
        authorName = replyMatch[1].trim();
        replyToTarget = replyMatch[2].trim();
      }

      // 查找被回复的评论ID
      let parentCommentId = null;
      if (replyToTarget) {
        // 检查是否是临时评论编号（c1、c2、c3）
        if (replyToTarget.startsWith('c') && this.currentTempCommentIdMap[replyToTarget]) {
          // 使用临时评论编号映射（精确）
          parentCommentId = this.currentTempCommentIdMap[replyToTarget];
          logger.debug('[DiaryAPI.parseSingleComment] 使用临时评论编号映射:', replyToTarget, '→', parentCommentId);
        } else if (authorMap[replyToTarget]) {
          // 使用作者名映射（兼容旧格式）
          parentCommentId = authorMap[replyToTarget];
          logger.debug('[DiaryAPI.parseSingleComment] 使用作者名映射:', replyToTarget, '→', parentCommentId);
        }
      }

      // 创建评论
      const commentId = `comment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 使用 parentCommentId 参数（而不是 replyTo 字段）
      this.dataManager.addComment(
        diaryId,
        {
          id: commentId,
          author: authorName,
          authorName: authorName,
          content: content.trim(),
          timestamp: Date.now(),
          createdAt: new Date().toISOString()
        },
        parentCommentId  // ← 传入 parentCommentId
      );

      // 记录这个作者的最新评论ID（用于后续被回复）
      authorMap[authorName] = commentId;

      logger.debug('[DiaryAPI.parseSingleComment] 已保存单条评论:', authorName, parentCommentId ? `回复${replyToTarget}` : '');
    });
  }

  /**
   * 从聊天消息提取日记和评论
   * 
   * @description
   * 监听 MESSAGE_RECEIVED 事件，如果消息包含 [日记] 或 [评论] 标记，
   * 自动提取并保存（用于捕获正常聊天中的日记内容）
   * 
   * @param {number} messageId - 消息ID
   */
  extractFromMessage(messageId) {
    const ctx = getContext();
    const message = ctx.chat[messageId];
    if (!message) return;

    const content = message.mes || '';

    // 提取并保存
    this.extractAndSave(content);

    logger.debug('[DiaryAPI.extractFromMessage] 已提取消息:', messageId);
  }

  /**
   * 发送选中的日记给AI（使用独立生成）
   * 
   * @async
   * @param {Array<string>} diaryIds - 选中的日记ID列表
   * @description
   * 使用新的临时编号系统和独立生成方式
   * TODO: 后续实现临时编号和批量评论解析
   */
  async sendSelectedDiaries(diaryIds) {
    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    logger.debug('[DiaryAPI.sendSelectedDiaries] 开始发送', diaryIds.length, '篇日记');

    // 获取选中的日记
    const selectedDiaries = diaryIds
      .map(id => this.dataManager.getDiary(id))
      .filter(d => d);

    if (selectedDiaries.length === 0) {
      throw new Error('选中的日记不存在');
    }

    // TODO: 实现临时编号系统和批量评论生成
    // 暂时使用简单提示
    showInfoToast(`选中 ${selectedDiaries.length} 篇日记（功能开发中）`);
    logger.info('[DiaryAPI.sendSelectedDiaries] 发送功能待实现');
  }
}

