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

    // 显示加载状态的通知
    const notificationHandle = showDiaryReplyNotification({
      characterName: charName,
      status: 'loading',
      duration: 0  // 不自动消失
    });

    logger.info('[DiaryAPI.requestCommentAsync] 后台生成已启动, diaryId:', diaryId);

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

        // 获取评论内容预览
        let commentPreview = '';
        if (result && result.comments && result.comments.length > 0) {
          // 获取第一条评论的内容作为预览
          commentPreview = result.comments[0].content || '';
        }

        // 更新通知为成功状态
        notificationHandle.update({
          status: 'success',
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
          showInfoToast('已中止生成');
        } else {
          logger.error('[DiaryAPI.requestCommentAsync] 生成失败:', error);
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
      // 步骤1：构造完整的系统提示词（使用builder子模块）
      const { systemPrompt, tempIdMap, tempCommentIdMap } = await this.builder.buildCompleteSystemPrompt(diary, charName, ctx);

      // 保存临时编号映射到parser
      this.parser.setTempIdMaps(tempIdMap, tempCommentIdMap);

      // 步骤2：使用预设管理器构建 messages 数组
      let messages;

      if (this.presetManager) {
        messages = this.presetManager.buildMessagesArray(systemPrompt);
        logger.debug('[DiaryAPI.backgroundGenerate] 使用预设构建messages，共', messages.length, '条');
      } else {
        logger.warn('[DiaryAPI.backgroundGenerate] 预设管理器未初始化，使用简单方式');
        messages = [{ role: 'system', content: systemPrompt }];
      }

      if (signal.aborted) {
        logger.info('[DiaryAPI.backgroundGenerate] 构建完成后检测到中止');
        return null;
      }

      // 步骤3：获取 API 配置
      const settings = this.dataManager.getSettings();
      const apiSettings = settings.apiConfig || { source: 'default', stream: false };

      logger.debug('[DiaryAPI.backgroundGenerate] ========== 发送给AI的messages ==========');
      logger.debug(JSON.stringify(messages, null, 2));
      logger.debug('[DiaryAPI.backgroundGenerate] ========== messages结束 ==========');
      logger.debug('[DiaryAPI.backgroundGenerate] API配置源:', apiSettings.source, '流式:', apiSettings.stream);

      // 步骤4：构造 API 配置对象
      let apiConfig = {
        source: apiSettings.source,
        stream: apiSettings.stream
      };

      if (apiSettings.source === 'custom') {
        const currentConfigId = apiSettings.currentConfigId;
        const customConfigs = apiSettings.customConfigs || [];
        const currentConfig = customConfigs.find(c => c.id === currentConfigId);

        if (!currentConfig) {
          logger.error('[DiaryAPI.backgroundGenerate] 未找到当前API配置');
          throw new Error('未找到API配置，请先在设置中保存一个配置');
        }

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

      // 步骤5：调用API
      let response;

      if (apiConfig.source === 'custom') {
        response = await this.callAPIWithStreaming(messages, apiConfig, signal);
      } else {
        response = await generateRaw({
          prompt: messages,
          responseLength: 200,
          api: null
        });
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
   * 调用API（支持流式和自定义配置）
   */
  async callAPIWithStreaming(messages, apiConfig, signal) {
    let model = apiConfig.model;
    if (!model) {
      model = oai_settings.openai_model || 'gpt-4o-mini';
      logger.warn('[DiaryAPI.callAPIWithStreaming] 未设置模型，使用官方默认:', model);
    }

    const body = {
      type: 'quiet',
      messages: messages,
      model: model,
      stream: apiConfig.stream || false,
      chat_completion_source: chat_completion_sources.OPENAI,
      max_tokens: Number(oai_settings.openai_max_tokens) || 200,
      temperature: Number(oai_settings.temp_openai) || 1.0,
      frequency_penalty: Number(oai_settings.freq_pen_openai) || 0,
      presence_penalty: Number(oai_settings.pres_pen_openai) || 0,
      top_p: Number(oai_settings.top_p_openai) || 1.0
    };

    if (apiConfig.source === 'custom') {
      if (apiConfig.baseUrl) body.reverse_proxy = apiConfig.baseUrl;
      if (apiConfig.apiKey) body.proxy_password = apiConfig.apiKey;
    }

    logger.debug('[DiaryAPI.callAPIWithStreaming] 请求配置:', {
      source: apiConfig.source,
      stream: body.stream,
      model: body.model,
      baseUrl: body.reverse_proxy || '使用酒馆默认',
      temperature: body.temperature,
      maxTokens: body.max_tokens
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
      return await this.handleStreamResponse(response, signal);
    } else {
      const data = await response.json();
      const message = extractMessageFromData(data);
      return message || '';
    }
  }

  /**
   * 处理流式响应（实时更新预览面板）
   */
  async handleStreamResponse(response, signal) {
    const eventStream = getEventSourceStream();
    response.body.pipeThrough(eventStream);
    const reader = eventStream.readable.getReader();

    let fullText = '';
    const state = { reasoning: '', image: '' };

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
   */
  extractFromMessage(messageId) {
    const ctx = getContext();
    const message = ctx.chat[messageId];
    if (!message) return;

    const content = message.mes || '';
    this.parser.extractAndSave(content);

    logger.debug('[DiaryAPI.extractFromMessage] 已提取消息:', messageId);
  }

  /**
   * 发送选中的日记给AI（使用独立生成）
   */
  async sendSelectedDiaries(diaryIds) {
    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    logger.debug('[DiaryAPI.sendSelectedDiaries] 开始发送', diaryIds.length, '篇日记');

    const selectedDiaries = diaryIds
      .map(id => this.dataManager.getDiary(id))
      .filter(d => d);

    if (selectedDiaries.length === 0) {
      throw new Error('选中的日记不存在');
    }

    // TODO: 实现临时编号系统和批量评论生成
    showInfoToast(`选中 ${selectedDiaries.length} 篇日记（功能开发中）`);
    logger.info('[DiaryAPI.sendSelectedDiaries] 发送功能待实现');
  }
}

