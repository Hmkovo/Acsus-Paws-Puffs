/**
 * 日记API管理器（重构版）
 *
 * @description
 * 负责与AI交互（核心功能）：
 * - 使用 generateRaw 独立生成评论/日记（不依赖全局上下文）
 * - 支持默认API（复用酒馆设置）和自定义API（不污染全局）
 * - 支持流式生成（实时预览）
 * - 后台异步生成（不阻塞用户操作）
 * - 中止生成
 * - 拦截官方聊天消息，提取日记内容
 *
 * 职责边界（重构后）：
 * - ✅ API调用、流式处理、中止控制
 * - ❌ 不构建上下文（交给 diary-api-builder.js）
 * - ❌ 不解析AI回复（交给 diary-api-parser.js）
 *
 * @module DiaryAPI
 * @version 2.0.0 (重构版)
 */

// ========================================
// [IMPORT] SillyTavern API
// ========================================
import {
  generateRaw,
  eventSource,
  event_types,
  getRequestHeaders,
  extractMessageFromData
} from '../../../../../../script.js';
import { extension_settings, getContext } from '../../../../../extensions.js';
import {
  chat_completion_sources,
  oai_settings,
  sendOpenAIRequest,
  getStreamingReply
} from '../../../../../openai.js';
import { getEventSourceStream } from '../../../../../sse-stream.js';
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast, showDiaryReplyNotification } from './diary-toast.js';

// ========================================
// [IMPORT] 日记子模块
// ========================================
import { DiaryAPIBuilder, PASSERBY_PERSONALITIES } from './diary-api-builder.js';
import { DiaryAPIParser } from './diary-api-parser.js';

// ========================================
// [CONST] 常量
// ========================================
const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'diary';

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
    this.ui = null;
    this.currentAbortController = null;
    this.isGenerating = false;
    this.presetManager = null;
    this.selectedDiaryIds = null;  // 用户选中的日记ID（用于批量发送）

    // 初始化子模块
    this.builder = new DiaryAPIBuilder(dataManager);
    this.parser = new DiaryAPIParser(dataManager, null);  // UI引用稍后注入
  }

  /**
   * 设置UI引用
   */
  setUI(ui) {
    this.ui = ui;
    this.parser.ui = ui;  // 注入到解析器
  }

  /**
   * 设置预设管理器引用
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

      if (this.ui) {
        this.ui.updateSendButtonState(false);
      }
    }
  }

  /**
   * 初始化
   */
  async init() {
    logger.info('[DiaryAPI] 开始初始化');
    logger.info('[DiaryAPI] 初始化完成');
  }

  /**
   * 异步请求AI评论（后台生成，不阻塞）
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

    // 随机选择加载中文案（3种）
    const loadingMessages = [
      `${charName}正在看你的日记...`,
      '日记已送达，等待回复中...',
      `${charName}打开了你的日记本...`
    ];
    const randomLoadingMsg = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

    // 显示加载状态的通知（可点击关闭）
    const notificationHandle = showDiaryReplyNotification({
      characterName: charName,
      title: randomLoadingMsg,
      status: 'loading',
      duration: 0,  // 不自动消失，等待AI完成
      onClick: () => { }  // 点击后仅关闭通知，不触发其他操作
    });

    logger.info('[DiaryAPI.requestCommentAsync] 后台生成已启动, diaryId:', diaryId);
    logger.debug('[DiaryAPI.requestCommentAsync] 使用加载文案:', randomLoadingMsg);

    // 通知UI更新按钮状态
    if (this.ui) {
      this.ui.updateSendButtonState(true);
    }

    // 后台异步生成（不等待）
    this.backgroundGenerate(diaryId, charName, this.currentAbortController.signal)
      .then(response => {
        if (!response) {
          logger.info('[DiaryAPI.requestCommentAsync] 生成已中止');
          notificationHandle.dismiss();
          return;
        }

        // 更新预览面板
        if (this.ui) {
          this.ui.updateAiPreview(response);
        }

        // 提取并保存评论
        const result = this.parser.extractAndSave(response, diaryId);

        // 直接从保存后的日记对象中获取最新评论（更可靠）
        const diary = this.dataManager.getDiary(diaryId);
        let commentPreview = '';
        if (diary && diary.comments && diary.comments.length > 0) {
          // 获取最后一条评论（最新的）
          const latestComment = diary.comments[diary.comments.length - 1];
          commentPreview = latestComment.content || '';

          // 如果是嵌套回复，递归获取最深层的评论
          const getLastReply = (comment) => {
            if (comment.replies && comment.replies.length > 0) {
              return getLastReply(comment.replies[comment.replies.length - 1]);
            }
            return comment;
          };

          const deepestComment = getLastReply(latestComment);
          commentPreview = deepestComment.content || '';
        }

        // 添加调试日志
        logger.info('[DiaryAPI.requestCommentAsync] 提取结果:', {
          diaryCount: result.diaries?.length || 0,
          commentCount: result.comments?.length || 0,
          savedComments: diary?.comments?.length || 0,
          previewLength: commentPreview.length
        });
        logger.debug('[DiaryAPI.requestCommentAsync] 评论预览内容:', commentPreview.substring(0, 100));

        // 随机选择成功文案（4种）
        const successTitles = [
          `${charName}回复了！`,                 // 方案A：惊喜感
          '你有一条新评论',                      // 方案B：社交化
          `${charName}评论了你的日记`,           // 方案C：简洁直接
          '日记本'                                // 方案D：模拟锁屏通知
        ];
        const randomIndex = Math.floor(Math.random() * successTitles.length);
        const randomTitle = successTitles[randomIndex];

        logger.debug('[DiaryAPI.requestCommentAsync] 使用成功文案:', randomTitle, '(方案', String.fromCharCode(65 + randomIndex) + ')');

        // 更新通知为成功状态
        notificationHandle.update({
          status: 'success',
          title: randomTitle,
          content: commentPreview,
          duration: 4000,
          onClick: () => {
            // 打开日记面板
            if (this.ui) {
              this.ui.openPanel();
            }
          }
        });

        // 如果面板还开着，刷新UI
        if (this.ui && this.ui.isPanelOpen()) {
          this.ui.refreshDiaries(true);
        }

        logger.info('[DiaryAPI.requestCommentAsync] 后台生成完成');
      })
      .catch(error => {
        // 关闭通知
        notificationHandle.dismiss();

        if (error.name === 'AbortError') {
          logger.info('[DiaryAPI.requestCommentAsync] 用户中止生成');
          showInfoToast('已取消，可以重新发送');
        } else {
          logger.error('[DiaryAPI.requestCommentAsync] 生成失败:', error);
          showErrorToast('出了点小问题，试试重新发送或检查网络连接');
        }
      })
      .finally(() => {
        this.currentAbortController = null;
        this.isGenerating = false;

        if (this.ui) {
          this.ui.updateSendButtonState(false);
        }
      });

    return;
  }

  /**
   * 后台生成评论（支持流式和自定义API）
   */
  async backgroundGenerate(diaryId, charName, signal) {
    const diary = this.dataManager.getDiary(diaryId);
    if (!diary) {
      throw new Error('日记不存在');
    }

    const ctx = getContext();

    if (signal.aborted) {
      logger.info('[DiaryAPI.backgroundGenerate] 生成已在开始前中止');
      return null;
    }

    try {
      // 步骤1：构造上下文内容（使用builder子模块）
      const { contextContents, tempIdMap, tempCommentIdMap } = await this.builder.buildCompleteSystemPrompt(
        diary,
        charName,
        ctx,
        this.presetManager,
        this.selectedDiaryIds  // 传入用户选中的日记ID
      );

      // 保存临时编号映射到parser
      this.parser.setTempIdMaps(tempIdMap, tempCommentIdMap);

      // 步骤2：构建评论任务（如果需要）
      const settings = this.dataManager.getSettings();
      let commentTask = '';
      const hasCommentTask = settings.allowCharacterComment || settings.allowPasserbyComments;
      if (hasCommentTask) {
        const diariesToSend = [];
        if (settings.includeHistoryDiaries) {
          const count = settings.historyDiaryCount || 3;
          const historyDiaries = this.builder.getHistoryDiariesObjects(diary.id, count);
          diariesToSend.push(...historyDiaries);
        }
        diariesToSend.push(diary);
        commentTask = this.builder.buildCommentTask(diariesToSend, charName, settings);
      }

      // 步骤3：使用预设管理器构建 messages 数组
      let messages;

      if (this.presetManager) {
        messages = this.presetManager.buildMessagesArray(contextContents);
        logger.debug('[DiaryAPI.backgroundGenerate] 使用预设构建messages，共', messages.length, '条');
      } else {
        logger.warn('[DiaryAPI.backgroundGenerate] 预设管理器未初始化，使用简单方式');
        // 将所有上下文内容合并成一个系统消息
        let combinedContent = Object.values(contextContents).join('\n\n');
        messages = [{ role: 'system', content: combinedContent }];
      }

      // 步骤4：如果有评论任务，添加到最后
      if (commentTask) {
        messages.push({
          role: 'system',  // ← 修复：改为 system，让评论任务和日记保持在一起
          content: commentTask
        });
        logger.debug('[DiaryAPI.backgroundGenerate] 已添加评论任务');
      }

      if (signal.aborted) {
        logger.info('[DiaryAPI.backgroundGenerate] 构建完成后检测到中止');
        return null;
      }

      // 步骤5：获取 API 配置（使用新的配置结构）
      const apiSettings = settings.apiConfig || { source: 'default', stream: false };

      logger.debug('[DiaryAPI.backgroundGenerate] ========== 发送给AI的messages ==========');
      logger.debug(JSON.stringify(messages, null, 2));
      logger.debug('[DiaryAPI.backgroundGenerate] ========== messages结束 ==========');
      logger.debug('[DiaryAPI.backgroundGenerate] API配置源:', apiSettings.source, '流式:', apiSettings.stream);

      // 步骤6：获取完整的自定义配置
      const customConfig = this.getCurrentCustomConfig(apiSettings);

      // 步骤7：调用API
      let response;

      logger.info('[DiaryAPI.backgroundGenerate] ========== API调用配置 ==========');
      logger.info('[DiaryAPI.backgroundGenerate] API配置源:', apiSettings.source);
      logger.info('[DiaryAPI.backgroundGenerate] 酒馆当前API源:', oai_settings.chat_completion_source);
      logger.info('[DiaryAPI.backgroundGenerate] 酒馆max_tokens配置:', oai_settings.openai_max_tokens);

      if (apiSettings.source === 'custom' && customConfig) {
        // ========================================
        // 自定义API模式：通过事件拦截注入自定义配置
        // ========================================
        logger.info('[DiaryAPI.backgroundGenerate] 使用自定义API模式，通过事件拦截注入配置');
        logger.debug('[DiaryAPI.backgroundGenerate] 自定义配置:', {
          format: customConfig.format,
          model: customConfig.model,
          hasApiKey: !!customConfig.apiKey,
          hasBaseUrl: !!customConfig.baseUrl
        });

        // 设置一次性事件拦截器
        const eventHandler = (data) => {
          // 根据 API 类型注入不同的配置
          if (customConfig.baseUrl) {
            data.reverse_proxy = customConfig.baseUrl;
          }
          if (customConfig.apiKey) {
            data.proxy_password = customConfig.apiKey;
          }
          if (customConfig.model) {
            data.model = customConfig.model;
          }

          // 注入高级参数
          if (customConfig.params) {
            if (customConfig.params.temperature !== undefined) {
              data.temperature = customConfig.params.temperature;
            }
            if (customConfig.params.top_p !== undefined) {
              data.top_p = customConfig.params.top_p;
            }
            if (customConfig.params.max_tokens !== undefined) {
              data.max_tokens = customConfig.params.max_tokens;
            }
            if (customConfig.params.frequency_penalty !== undefined) {
              data.frequency_penalty = customConfig.params.frequency_penalty;
            }
            if (customConfig.params.presence_penalty !== undefined) {
              data.presence_penalty = customConfig.params.presence_penalty;
            }
          }

          logger.debug('[DiaryAPI] 事件拦截注入自定义配置完成:', {
            reverse_proxy: data.reverse_proxy,
            model: data.model,
            temperature: data.temperature
          });
        };
        eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);

        try {
          // 调用官方API
          const rawResponse = await sendOpenAIRequest('quiet', messages, signal);
          // sendOpenAIRequest 返回的是完整的 JSON 对象，需要提取消息内容
          response = extractMessageFromData(rawResponse);
        } catch (err) {
          // 清理事件监听器
          eventSource.removeListener(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);
          throw err;
        }

        logger.info('[DiaryAPI.backgroundGenerate] sendOpenAIRequest调用完成');
      } else {
        // ========================================
        // 默认API模式：直接使用酒馆设置
        // ========================================
        logger.info('[DiaryAPI.backgroundGenerate] 使用默认API（generateRaw）');
        response = await generateRaw({
          prompt: messages
        });
        logger.info('[DiaryAPI.backgroundGenerate] generateRaw调用完成');
      }

      logger.info('[DiaryAPI.backgroundGenerate] ========== API调用完成 ==========');

      // 确保 response 是字符串
      if (typeof response !== 'string') {
        response = extractMessageFromData(response);
      }

      logger.debug('[DiaryAPI.backgroundGenerate] AI回复:', response?.substring(0, 100) || '');

      return response;

    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) {
        logger.info('[DiaryAPI.backgroundGenerate] 生成被中止');
        return null;
      }

      throw error;
    }
  }

  /**
   * @deprecated 此方法已被新的事件拦截方式替代，不再使用
   * 请使用 backgroundGenerate 中的 sendOpenAIRequest + 事件拦截方案
   *
   * 调用API（支持流式和自定义配置）
   */
  async callAPIWithStreaming(messages, apiConfig, signal) {
    // 🔍 调试日志：记录传入的完整 apiConfig
    logger.debug('[DiaryAPI.callAPIWithStreaming] === 自定义API调试开始 ===');
    logger.debug('[DiaryAPI.callAPIWithStreaming] 传入的 apiConfig:', JSON.stringify(apiConfig, null, 2));
    logger.debug('[DiaryAPI.callAPIWithStreaming] apiConfig.source:', apiConfig.source);
    logger.debug('[DiaryAPI.callAPIWithStreaming] apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, '(类型:', typeof apiConfig.baseUrl, ', 长度:', apiConfig.baseUrl?.length || 0, ')');
    logger.debug('[DiaryAPI.callAPIWithStreaming] apiConfig.model:', apiConfig.model);
    logger.debug('[DiaryAPI.callAPIWithStreaming] apiConfig.apiKey:', apiConfig.apiKey ? '已设置(已隐藏)' : '未设置');

    // 获取用户当前使用的 API 源
    // ✅ 方案1：自定义API使用用户在扩展中选择的格式
    let currentSource;
    if (apiConfig.source === 'custom') {
      // 根据用户选择的格式映射到对应的 chat_completion_sources
      const formatMap = {
        'openai': chat_completion_sources.CUSTOM,      // OpenAI 兼容格式（大部分代理）
        'claude': chat_completion_sources.CLAUDE,      // Claude (Anthropic)
        'google': chat_completion_sources.MAKERSUITE,  // Google AI (Gemini/PaLM)
        'openrouter': chat_completion_sources.OPENROUTER,
        'scale': chat_completion_sources.CUSTOM,       // Scale也是OpenAI兼容
        'ai21': chat_completion_sources.AI21,
        'mistral': chat_completion_sources.MISTRALAI,
        'custom': 'auto'  // 自动检测（保留原有逻辑）
      };

      const userFormat = apiConfig.format || 'openai';  // 默认OpenAI格式

      if (userFormat === 'custom') {
        // 自动检测：使用酒馆当前设置
        currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
        logger.debug('[DiaryAPI.callAPIWithStreaming] 自定义API - 自动检测模式，使用酒馆API源:', currentSource);
      } else {
        currentSource = formatMap[userFormat] || chat_completion_sources.CUSTOM;
        logger.debug('[DiaryAPI.callAPIWithStreaming] 自定义API - 用户选择格式:', userFormat, '→ 映射到:', currentSource);
      }
    } else {
      currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
      logger.debug('[DiaryAPI.callAPIWithStreaming] 使用酒馆API源:', currentSource);
    }

    let model = apiConfig.model;
    if (!model) {
      model = oai_settings.openai_model || 'gpt-4o-mini';
      logger.warn('[DiaryAPI.callAPIWithStreaming] 未设置模型，使用官方默认:', model);
    }
    logger.debug('[DiaryAPI.callAPIWithStreaming] 最终使用的 model:', model);

    // 读取 max_tokens 配置
    const maxTokensRaw = oai_settings.openai_max_tokens;
    const maxTokensNumber = Number(maxTokensRaw);
    const maxTokensFinal = maxTokensNumber || 2000;

    logger.info('[DiaryAPI.callAPIWithStreaming] max_tokens读取详情:');
    logger.info('  - 原始值 (oai_settings.openai_max_tokens):', maxTokensRaw, '类型:', typeof maxTokensRaw);
    logger.info('  - Number转换后:', maxTokensNumber);
    logger.info('  - 最终使用值:', maxTokensFinal, maxTokensFinal === 2000 ? '(使用默认值)' : '(使用用户配置)');

    const body = {
      type: 'quiet',
      messages: messages,
      model: model,
      stream: apiConfig.stream || false,
      chat_completion_source: currentSource,  // 使用用户实际配置的 API 源
      max_tokens: maxTokensFinal,
      temperature: Number(oai_settings.temp_openai) || 1.0,
      frequency_penalty: Number(oai_settings.freq_pen_openai) || 0,
      presence_penalty: Number(oai_settings.pres_pen_openai) || 0,
      top_p: Number(oai_settings.top_p_openai) || 1.0,
      // ✅ 修复：添加各个API源必需的参数（参考 ChatCompletionService）
      use_makersuite_sysprompt: true,  // Google AI (makersuite) 必需
      claude_use_sysprompt: true       // Claude 必需
    };

    if (apiConfig.source === 'custom') {
      logger.debug('[DiaryAPI.callAPIWithStreaming] 🔍 进入自定义API分支');
      logger.debug('[DiaryAPI.callAPIWithStreaming] 检查前 - apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, ', trim后:', `"${apiConfig.baseUrl?.trim()}"`);
      logger.debug('[DiaryAPI.callAPIWithStreaming] 检查前 - apiConfig.model:', `"${apiConfig.model}"`, ', trim后:', `"${apiConfig.model?.trim()}"`);

      // ✅ 修复：检查必填字段，避免传递空值导致 Invalid URL
      if (!apiConfig.baseUrl || !apiConfig.baseUrl.trim()) {
        const error = new Error('自定义API配置错误：缺少 API 端点 (Base URL)');
        logger.error('[DiaryAPI.callAPIWithStreaming]', error.message);
        logger.error('[DiaryAPI.callAPIWithStreaming] baseUrl 值:', apiConfig.baseUrl, ', 类型:', typeof apiConfig.baseUrl);
        throw error;
      }
      if (!apiConfig.model || !apiConfig.model.trim()) {
        const error = new Error('自定义API配置错误：缺少模型名称');
        logger.error('[DiaryAPI.callAPIWithStreaming]', error.message);
        logger.error('[DiaryAPI.callAPIWithStreaming] model 值:', apiConfig.model, ', 类型:', typeof apiConfig.model);
        throw error;
      }

      logger.debug('[DiaryAPI.callAPIWithStreaming] ✅ 验证通过，开始设置 API 端点');

      // 🔧 修复：chat_completion_source 为 "custom" 时，后端读取 custom_url 而不是 reverse_proxy
      // 所以需要同时设置两个字段
      body.reverse_proxy = apiConfig.baseUrl.trim();
      body.custom_url = apiConfig.baseUrl.trim();  // ← 关键：custom 源需要 custom_url
      logger.debug('[DiaryAPI.callAPIWithStreaming] body.reverse_proxy 已设置为:', `"${body.reverse_proxy}"`);
      logger.debug('[DiaryAPI.callAPIWithStreaming] body.custom_url 已设置为:', `"${body.custom_url}"`);

      if (apiConfig.apiKey) {
        body.proxy_password = apiConfig.apiKey.trim();
        logger.debug('[DiaryAPI.callAPIWithStreaming] body.proxy_password 已设置');
      }
    } else {
      logger.debug('[DiaryAPI.callAPIWithStreaming] 跳过自定义API分支 (source !== "custom")');
    }

    // 🔍 最终检查：记录 body 中的 reverse_proxy
    logger.debug('[DiaryAPI.callAPIWithStreaming] 最终 body.reverse_proxy:', body.reverse_proxy);
    logger.debug('[DiaryAPI.callAPIWithStreaming] 完整 body 对象:', JSON.stringify(body, null, 2));

    logger.info('[DiaryAPI.callAPIWithStreaming] 最终请求配置:', {
      扩展API配置源: apiConfig.source,
      酒馆API源: currentSource,
      流式传输: body.stream,
      模型: body.model,
      反向代理: body.reverse_proxy || '使用酒馆默认',
      温度: body.temperature,
      最终max_tokens: body.max_tokens
    });

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

    if (apiConfig.stream) {
      return await this.handleStreamResponse(response, signal, currentSource);
    } else {
      const data = await response.json();
      const message = extractMessageFromData(data);
      return message || '';
    }
  }

  /**
   * 处理流式响应（实时更新预览面板）
   *
   * @param {Response} response - fetch响应对象
   * @param {AbortSignal} signal - 中止信号
   * @param {string} currentSource - 当前使用的API源（从callAPIWithStreaming传入）
   */
  async handleStreamResponse(response, signal, currentSource) {
    const eventStream = getEventSourceStream();
    response.body.pipeThrough(eventStream);
    const reader = eventStream.readable.getReader();

    let fullText = '';
    const state = { reasoning: '', image: '' };

    logger.debug('[DiaryAPI.handleStreamResponse] 使用API源解析流式响应:', currentSource);

    try {
      while (true) {
        if (signal.aborted) {
          logger.info('[DiaryAPI.handleStreamResponse] 流式生成被中止');
          break;
        }

        const { done, value } = await reader.read();

        if (done || !value?.data || value.data === '[DONE]') {
          logger.debug('[DiaryAPI.handleStreamResponse] 流式生成完成');
          break;
        }

        let parsed;
        try {
          parsed = JSON.parse(value.data);
        } catch (error) {
          logger.warn('[DiaryAPI.handleStreamResponse] 解析SSE数据失败:', error);
          continue;
        }

        const chunk = getStreamingReply(parsed, state, {
          chatCompletionSource: currentSource  // 使用用户实际配置的 API 源
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
      if (error.name === 'AbortError' || signal.aborted) {
        logger.info('[DiaryAPI.handleStreamResponse] 流式生成被中止，返回部分文本');
        return fullText;
      }

      throw error;

    } finally {
      try {
        reader.releaseLock?.();
      } catch (error) {
        logger.warn('[DiaryAPI.handleStreamResponse] 释放读取器失败:', error);
      }
    }
  }

  /**
   * 从聊天消息提取日记和评论
   *
   * @param {number} messageId - 消息ID（chat数组索引）
   * @description
   * 监听 MESSAGE_RECEIVED 事件后触发。
   * 使用 String() 强制转换确保 content 为字符串，
   * 防止不同 SillyTavern 版本或 API 返回非字符串类型导致崩溃。
   */
  extractFromMessage(messageId) {
    const ctx = getContext();
    const message = ctx.chat[messageId];
    if (!message) return;

    // 强制转换为字符串，防止非字符串类型导致崩溃
    // 兼容 v1.12.x 版本可能返回对象/数组的情况
    let content = '';
    if (message.mes != null) {
      content = String(message.mes);
    }

    // 空内容不处理
    if (!content.trim()) {
      return;
    }

    this.parser.extractAndSave(content);

    logger.debug('[DiaryAPI.extractFromMessage] 已提取消息:', messageId);
  }

  /**
   * 为选中的多篇日记生成评论（批量生成）
   *
   * @description
   * 用户在"选择日记发送"面板中选择了多篇日记后，
   * 直接调用此方法为这些日记生成评论（一次API调用）
   *
   * @param {Array<string>} diaryIds - 日记ID数组
   */
  async requestCommentForSelectedDiaries(diaryIds) {
    if (!diaryIds || diaryIds.length === 0) {
      showErrorToast('请至少选择一篇日记');
      return;
    }

    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    logger.info('[DiaryAPI.requestCommentForSelectedDiaries] 开始为', diaryIds.length, '篇日记生成评论');

    // 检查是否正在生成
    if (this.isGenerating) {
      showInfoToast('AI正在生成中，请稍候');
      return;
    }

    this.isGenerating = true;
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    // 更新按钮状态
    if (this.ui) {
      this.ui.updateSendButtonState(true);
    }

    // 显示通知
    const notificationHandle = showDiaryReplyNotification({
      characterName: charName,
      status: 'loading'
    });

    // 后台生成
    this.backgroundGenerateForSelected(diaryIds, charName, signal)
      .then(response => {
        // 关闭通知
        notificationHandle.dismiss();

        if (!response) {
          logger.warn('[DiaryAPI.requestCommentForSelectedDiaries] 生成被中止或无结果');
          return;
        }

        // 提取并保存评论（不指定targetDiaryId，让parser自动处理）
        this.parser.extractAndSave(response);

        // 刷新UI
        if (this.ui && this.ui.isPanelOpen()) {
          this.ui.refreshDiaries(true);
        }

        // 显示成功提示
        showSuccessToast(`已为 ${diaryIds.length} 篇日记`);
        logger.info('[DiaryAPI.requestCommentForSelectedDiaries] 批量生成完成');
      })
      .catch(error => {
        notificationHandle.dismiss();

        if (error.name === 'AbortError') {
          logger.info('[DiaryAPI.requestCommentForSelectedDiaries] 用户中止生成');
          showInfoToast('已中止生成');
        } else {
          logger.error('[DiaryAPI.requestCommentForSelectedDiaries] 生成失败:', error);
          showErrorToast('评论失败：' + error.message);
        }
      })
      .finally(() => {
        this.currentAbortController = null;
        this.isGenerating = false;

        if (this.ui) {
          this.ui.updateSendButtonState(false);
        }
      });
  }

  /**
   * 为选中的多篇日记后台生成评论
   *
   * @param {Array<string>} diaryIds - 日记ID数组
   * @param {string} charName - 角色名称
   * @param {AbortSignal} signal - 中止信号
   * @returns {Promise<string>} AI回复
   */
  async backgroundGenerateForSelected(diaryIds, charName, signal) {
    const ctx = getContext();
    const settings = this.dataManager.getSettings();

    if (signal.aborted) {
      logger.info('[DiaryAPI.backgroundGenerateForSelected] 生成已在开始前中止');
      return null;
    }

    try {
      // 获取选中的日记对象
      const selectedDiaries = diaryIds
        .map(id => this.dataManager.getDiary(id))
        .filter(d => d && !d.privacy);  // 排除不存在的和隐私日记

      if (selectedDiaries.length === 0) {
        throw new Error('没有可发送的日记');
      }

      logger.debug('[DiaryAPI.backgroundGenerateForSelected] 将发送', selectedDiaries.length, '篇日记');

      // 【重构】使用专门的批量评论上下文构建方法
      // 1. 构建通用上下文（不包含日记）
      const contextContents = await this.builder.buildContextForSelectedDiaries(
        charName,
        ctx,
        this.presetManager
      );

      // 2. 构建日记内容和临时编号映射
      const { diariesContent, tempIdMap, tempCommentIdMap } = this.builder.buildDiariesContentWithMapping(
        selectedDiaries
      );

      // 3. 将日记内容添加到上下文
      contextContents.historyDiaries = diariesContent;

      // 保存临时编号映射到parser
      this.parser.setTempIdMaps(tempIdMap, tempCommentIdMap);
      logger.debug('[DiaryAPI.backgroundGenerateForSelected] 临时日记编号映射:', tempIdMap);
      logger.debug('[DiaryAPI.backgroundGenerateForSelected] 临时评论编号映射:', tempCommentIdMap);

      // 手动构建评论任务（使用选中的日记）
      const commentTask = this.builder.buildCommentTask(selectedDiaries, charName, settings);

      // 使用预设管理器构建messages数组
      let messages;
      if (this.presetManager) {
        messages = this.presetManager.buildMessagesArray(contextContents);
        logger.debug('[DiaryAPI.backgroundGenerateForSelected] 使用预设构建messages，共', messages.length, '条');
      } else {
        logger.warn('[DiaryAPI.backgroundGenerateForSelected] 预设管理器未初始化，使用简单方式');
        let combinedContent = Object.values(contextContents).join('\n\n');
        messages = [{ role: 'system', content: combinedContent }];
      }

      // 添加评论任务
      if (commentTask) {
        messages.push({ role: 'system', content: commentTask });  // ← 修复：改为 system，保持正确顺序
        logger.debug('[DiaryAPI.backgroundGenerateForSelected] 已添加评论任务');
      }

      // 打印完整的messages（调试用）
      logger.debug('[DiaryAPI.backgroundGenerateForSelected] ========== 发送给AI的messages ==========');
      logger.debug(JSON.stringify(messages, null, 2));
      logger.debug('[DiaryAPI.backgroundGenerateForSelected] ========== messages结束 ==========');

      // 获取API配置（使用新的配置结构）
      const apiSettings = settings.apiConfig || { source: 'default', stream: false };
      logger.debug('[DiaryAPI.backgroundGenerateForSelected] API配置源:', apiSettings.source || 'default', '流式:', apiSettings.stream || false);

      // 获取完整的自定义配置
      const customConfig = this.getCurrentCustomConfig(apiSettings);

      // 调用API
      let response;
      if (apiSettings.source === 'custom' && customConfig) {
        // ========================================
        // 自定义API模式：通过事件拦截注入自定义配置
        // ========================================
        logger.info('[DiaryAPI.backgroundGenerateForSelected] 使用自定义API模式');
        logger.debug('[DiaryAPI.backgroundGenerateForSelected] 自定义配置:', {
          format: customConfig.format,
          model: customConfig.model,
          hasApiKey: !!customConfig.apiKey,
          hasBaseUrl: !!customConfig.baseUrl
        });

        // 设置一次性事件拦截器
        const eventHandler = (data) => {
          if (customConfig.baseUrl) {
            data.reverse_proxy = customConfig.baseUrl;
          }
          if (customConfig.apiKey) {
            data.proxy_password = customConfig.apiKey;
          }
          if (customConfig.model) {
            data.model = customConfig.model;
          }

          // 注入高级参数
          if (customConfig.params) {
            if (customConfig.params.temperature !== undefined) {
              data.temperature = customConfig.params.temperature;
            }
            if (customConfig.params.top_p !== undefined) {
              data.top_p = customConfig.params.top_p;
            }
            if (customConfig.params.max_tokens !== undefined) {
              data.max_tokens = customConfig.params.max_tokens;
            }
          }

          logger.debug('[DiaryAPI] 事件拦截注入配置完成');
        };
        eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);

        try {
          const rawResponse = await sendOpenAIRequest('quiet', messages, signal);
          // sendOpenAIRequest 返回的是完整的 JSON 对象，需要提取消息内容
          response = extractMessageFromData(rawResponse);
        } catch (err) {
          eventSource.removeListener(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);
          throw err;
        }
      } else {
        // 使用默认API（复用酒馆设置）
        logger.info('[DiaryAPI.backgroundGenerateForSelected] 使用默认API（generateRaw）');
        response = await generateRaw({
          prompt: messages
        });
      }

      // 确保 response 是字符串
      if (typeof response !== 'string') {
        response = extractMessageFromData(response);
      }

      if (signal.aborted) {
        logger.info('[DiaryAPI.backgroundGenerateForSelected] 生成已被中止');
        return null;
      }

      logger.debug('[DiaryAPI.backgroundGenerateForSelected] AI回复:', response?.substring(0, 100) || '');

      // 更新预览
      if (this.ui) {
        this.ui.updateAiPreview(response);
      }

      return response;
    } catch (error) {
      if (signal.aborted || error.name === 'AbortError') {
        logger.info('[DiaryAPI.backgroundGenerateForSelected] 生成已被中止');
        return null;
      }
      throw error;
    }
  }

  /**
   * 设置用户选中的日记ID
   *
   * @description
   * 保存用户在"选择日记发送"面板中选中的日记ID，
   * 下次生成评论时将优先使用这些日记作为历史上下文
   *
   * @param {Array<string>} diaryIds - 日记ID数组
   */
  setSelectedDiaryIds(diaryIds) {
    this.selectedDiaryIds = diaryIds;
    logger.info('[DiaryAPI.setSelectedDiaryIds] 已设置选中的日记:', diaryIds.length, '篇');
  }

  /**
   * 清除选中的日记ID
   *
   * @description
   * 清除用户选中的日记状态，恢复使用默认的历史日记获取逻辑
   */
  clearSelectedDiaryIds() {
    this.selectedDiaryIds = null;
    logger.debug('[DiaryAPI.clearSelectedDiaryIds] 已清除选中状态');
  }

  /**
   * 获取当前自定义 API 配置
   *
   * @description
   * 从 apiConfig 中读取当前的自定义配置，支持新的配置结构
   *
   * @param {Object} apiSettings - API 设置对象
   * @returns {Object|null} 自定义配置对象，如果不是自定义模式则返回 null
   */
  getCurrentCustomConfig(apiSettings) {
    if (apiSettings.source !== 'custom') {
      return null;
    }

    const format = apiSettings.format || 'openai';
    let config = {
      format: format,
      stream: apiSettings.stream || false,
      model: apiSettings.model || '',
      params: apiSettings.params || {}
    };

    // 根据 API 类型获取特定配置
    if (format === 'openrouter') {
      config.apiKey = apiSettings.openRouterKey || '';
      config.baseUrl = 'https://openrouter.ai/api';
    } else if (format === 'custom') {
      // 自定义端点
      const customConfig = apiSettings.customApiConfig || {};
      config.baseUrl = customConfig.baseUrl || '';
      config.apiKey = customConfig.apiKey || '';
      config.model = customConfig.model || config.model;
    } else if (format === 'vertexai') {
      // Vertex AI
      const vertexConfig = apiSettings.vertexConfig || {};
      config.vertexConfig = vertexConfig;
      // Vertex AI 使用特殊的认证方式，不需要 baseUrl
    } else if (format === 'azure_openai') {
      // Azure OpenAI
      const azureConfig = apiSettings.azureConfig || {};
      config.azureConfig = azureConfig;
      config.baseUrl = azureConfig.baseUrl || '';
      config.apiKey = azureConfig.apiKey || '';
      config.model = azureConfig.modelName || config.model;
    } else {
      // 通用 API（OpenAI、Claude、Gemini 等）
      config.apiKey = apiSettings.apiKey || '';

      // 检查反向代理
      if (apiSettings.reverseProxyUrl) {
        config.baseUrl = apiSettings.reverseProxyUrl;
        config.proxyPassword = apiSettings.reverseProxyPassword || '';
      } else {
        // 使用默认端点
        config.baseUrl = this.getDefaultBaseUrl(format);
      }
    }

    logger.debug('[DiaryAPI.getCurrentCustomConfig] 配置:', {
      format: config.format,
      model: config.model,
      hasApiKey: !!config.apiKey,
      hasBaseUrl: !!config.baseUrl
    });

    return config;
  }

  /**
   * 获取 API 类型的默认端点
   *
   * @param {string} format - API 类型
   * @returns {string} 默认端点 URL
   */
  getDefaultBaseUrl(format) {
    const defaultUrls = {
      openai: 'https://api.openai.com',
      claude: 'https://api.anthropic.com',
      makersuite: 'https://generativelanguage.googleapis.com',
      deepseek: 'https://api.deepseek.com',
      mistralai: 'https://api.mistral.ai',
      cohere: 'https://api.cohere.ai',
      perplexity: 'https://api.perplexity.ai',
      groq: 'https://api.groq.com/openai',
      xai: 'https://api.x.ai',
      ai21: 'https://api.ai21.com',
      moonshot: 'https://api.moonshot.cn',
      fireworks: 'https://api.fireworks.ai/inference',
      electronhub: 'https://api.electronhub.top',
      chutes: 'https://llm.chutes.ai',
      nanogpt: 'https://nano-gpt.com/api',
      aimlapi: 'https://api.aimlapi.com',
      pollinations: 'https://text.pollinations.ai',
      siliconflow: 'https://api.siliconflow.cn',
      zai: 'https://open.bigmodel.cn/api/paas'
    };

    return defaultUrls[format] || 'https://api.openai.com';
  }
}

