/**
 * 日记API管理器（共享API层版）
 *
 * @description
 * 负责与AI交互（核心功能）：
 * - 统一通过 shared/api/api-client.js 发起请求
 * - 支持默认API（复用酒馆设置）和自定义API（不污染全局）
 * - 支持流式生成（实时预览）
 * - 后台异步生成（不阻塞用户操作）
 * - 中止生成
 * - 监听官方聊天消息，提取日记内容
 *
 * 职责边界：
 * - API调用、流式处理、中止控制
 * - 不构建上下文（交给 diary-api-builder.js）
 * - 不解析AI回复（交给 diary-api-parser.js）
 *
 * @module DiaryAPI
 */

import { getContext } from '../../../../../extensions.js';
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast, showDiaryReplyNotification } from './diary-toast.js';
import { DiaryAPIBuilder } from './diary-api-builder.js';
import { DiaryAPIParser } from './diary-api-parser.js';
import { getDefaultParams } from '../../shared/api/api-params-config.js';
import { generate, generateStream, generateWithDefault } from '../../shared/api/api-client.js';
import { resolveSource, getDefaultUrl } from '../../shared/api/api-config-schema.js';

/**
 * 将旧参数命名转换为共享 API 层所需命名。
 *
 * @param {Object} [params={}] - 旧参数对象。
 * @returns {Object} 新参数对象。
 */
function normalizeParams(params = {}) {
  return {
    temperature: params.temperature,
    maxTokens: params.max_tokens,
    topP: params.top_p,
    topK: params.top_k,
    frequencyPenalty: params.frequency_penalty,
    presencePenalty: params.presence_penalty,
    repetitionPenalty: params.repetition_penalty,
    minP: params.min_p,
    topA: params.top_a,
    stop: params.stop,
    logitBias: params.logit_bias,
    n: params.n,
    seed: params.seed,
    logprobs: params.logprobs,
    includeReasoning: params.include_reasoning,
    reasoningEffort: params.reasoning_effort,
  };
}

/**
 * 日记API管理器
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
    this.selectedDiaryIds = null;

    this.builder = new DiaryAPIBuilder(dataManager);
    this.parser = new DiaryAPIParser(dataManager, null);
  }

  /**
   * 设置UI引用
   */
  setUI(ui) {
    this.ui = ui;
    this.parser.ui = ui;
  }

  /**
   * 设置预设管理器引用
   */
  setPresetManager(presetManager) {
    this.presetManager = presetManager;
    logger.debug('diary', '[DiaryAPI.setPresetManager] 预设管理器已设置');
  }

  /**
   * 中止当前生成
   */
  abort() {
    if (!this.currentAbortController) {
      return;
    }

    this.currentAbortController.abort();
    this.currentAbortController = null;
    this.isGenerating = false;

    showInfoToast('已中止生成');
    logger.info('diary', '[DiaryAPI.abort] 已中止后台生成');

    if (this.ui) {
      this.ui.updateSendButtonState(false);
    }
  }

  /**
   * 初始化
   */
  async init() {
    logger.info('diary', '[DiaryAPI] 开始初始化');
    logger.info('diary', '[DiaryAPI] 初始化完成');
  }

  /**
   * 获取设置
   */
  getSettings() {
    return this.dataManager.getSettings();
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

    if (this.ui) {
      this.ui.clearAiPreview();
    }

    this.currentAbortController = new AbortController();
    this.isGenerating = true;

    const loadingMessages = [
      `${charName}正在看你的日记...`,
      '日记已送达，等待回复中...',
      `${charName}打开了你的日记本...`,
    ];
    const randomLoadingMsg = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

    const notificationHandle = showDiaryReplyNotification({
      characterName: charName,
      title: randomLoadingMsg,
      status: 'loading',
      duration: 0,
      onClick: () => {},
    });

    logger.info('diary', '[DiaryAPI.requestCommentAsync] 后台生成已启动, diaryId:', diaryId);

    if (this.ui) {
      this.ui.updateSendButtonState(true);
    }

    this.backgroundGenerate(diaryId, charName, this.currentAbortController.signal)
      .then((response) => {
        if (!response) {
          logger.info('diary', '[DiaryAPI.requestCommentAsync] 生成已中止');
          notificationHandle.dismiss();
          return;
        }

        if (this.ui) {
          this.ui.updateAiPreview(response);
        }

        const result = this.parser.extractAndSave(response, diaryId);

        const savedDiary = this.dataManager.getDiary(diaryId);
        let commentPreview = '';

        if (savedDiary?.comments?.length > 0) {
          const latestComment = savedDiary.comments[savedDiary.comments.length - 1];
          const getLastReply = (comment) => {
            if (comment.replies && comment.replies.length > 0) {
              return getLastReply(comment.replies[comment.replies.length - 1]);
            }
            return comment;
          };
          commentPreview = getLastReply(latestComment)?.content || '';
        }

        logger.info('diary', '[DiaryAPI.requestCommentAsync] 提取结果:', {
          diaryCount: result.diaries?.length || 0,
          commentCount: result.comments?.length || 0,
          savedComments: savedDiary?.comments?.length || 0,
          previewLength: commentPreview.length,
        });

        const successTitles = [
          `${charName}回复了！`,
          '你有一条新评论',
          `${charName}评论了你的日记`,
          '日记本',
        ];
        const randomTitle = successTitles[Math.floor(Math.random() * successTitles.length)];

        notificationHandle.update({
          status: 'success',
          title: randomTitle,
          content: commentPreview,
          duration: 4000,
          onClick: () => {
            if (this.ui) {
              this.ui.openPanel();
            }
          },
        });

        if (this.ui && this.ui.isPanelOpen()) {
          this.ui.refreshDiaries(true);
        }

        logger.info('diary', '[DiaryAPI.requestCommentAsync] 后台生成完成');
      })
      .catch((error) => {
        notificationHandle.dismiss();

        if (error?.name === 'AbortError') {
          logger.info('diary', '[DiaryAPI.requestCommentAsync] 用户中止生成');
          showInfoToast('已取消，可以重新发送');
        } else {
          logger.error('diary', '[DiaryAPI.requestCommentAsync] 生成失败:', error);
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
      logger.info('diary', '[DiaryAPI.backgroundGenerate] 生成已在开始前中止');
      return null;
    }

    try {
      const { contextContents, tempIdMap, tempCommentIdMap } = await this.builder.buildCompleteSystemPrompt(
        diary,
        charName,
        ctx,
        this.presetManager,
        this.selectedDiaryIds,
      );

      this.parser.setTempIdMaps(tempIdMap, tempCommentIdMap);

      const settings = this.getSettings();
      let commentTask = '';
      const hasCommentTask = settings.allowCharacterComment || settings.allowPasserbyComments;

      if (hasCommentTask) {
        const diariesToSend = [];
        if (settings.includeHistoryDiaries) {
          const count = settings.historyDiaryCount || 3;
          const historyDiaries = this.builder.getHistoryDiariesObjects(diary.id, count, this.selectedDiaryIds);
          diariesToSend.push(...historyDiaries);
        }
        diariesToSend.push(diary);
        commentTask = this.builder.buildCommentTask(diariesToSend, charName, settings);
      }

      let messages;
      if (this.presetManager) {
        messages = this.presetManager.buildMessagesArray(contextContents);
      } else {
        const combinedContent = Object.values(contextContents).join('\n\n');
        messages = [{ role: 'system', content: combinedContent }];
      }

      if (commentTask) {
        messages.push({ role: 'system', content: commentTask });
      }

      if (signal.aborted) {
        logger.info('diary', '[DiaryAPI.backgroundGenerate] 构建完成后检测到中止');
        return null;
      }

      const apiSettings = settings.apiConfig || { source: 'default', stream: false };

      logger.debug('diary', '[DiaryAPI.backgroundGenerate] API配置源:', apiSettings.source, '流式:', apiSettings.stream);

      let previewText = '';
      const response = await this._generateDiaryResponse(messages, apiSettings, signal, {
        onChunk: (chunk) => {
          previewText += chunk;
          if (this.ui) {
            this.ui.updateAiPreview(previewText);
          }
        },
      });

      logger.debug('diary', '[DiaryAPI.backgroundGenerate] AI回复:', response?.substring(0, 100) || '');
      return response;
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError' || error?.message === '生成已终止') {
        logger.info('diary', '[DiaryAPI.backgroundGenerate] 生成被中止');
        return null;
      }
      throw error;
    }
  }

  /**
   * 从聊天消息提取日记和评论
   */
  extractFromMessage(messageId) {
    const ctx = getContext();
    const message = ctx.chat[messageId];
    if (!message) {
      return;
    }

    let content = '';
    if (message.mes != null) {
      content = String(message.mes);
    }

    if (!content.trim()) {
      return;
    }

    this.parser.extractAndSave(content);
    logger.debug('diary', '[DiaryAPI.extractFromMessage] 已提取消息:', messageId);
  }

  /**
   * 为选中的多篇日记生成评论（批量生成）
   */
  async requestCommentForSelectedDiaries(diaryIds) {
    if (!diaryIds || diaryIds.length === 0) {
      showErrorToast('请至少选择一篇日记');
      return;
    }

    const ctx = getContext();
    const charName = ctx.name2 || 'AI';

    logger.info('diary', '[DiaryAPI.requestCommentForSelectedDiaries] 开始为', diaryIds.length, '篇日记生成评论');

    if (this.isGenerating) {
      showInfoToast('AI正在生成中，请稍候');
      return;
    }

    this.isGenerating = true;
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    if (this.ui) {
      this.ui.updateSendButtonState(true);
      this.ui.clearAiPreview();
    }

    const notificationHandle = showDiaryReplyNotification({
      characterName: charName,
      status: 'loading',
    });

    this.backgroundGenerateForSelected(diaryIds, charName, signal)
      .then((response) => {
        notificationHandle.dismiss();

        if (!response) {
          logger.warn('diary', '[DiaryAPI.requestCommentForSelectedDiaries] 生成被中止或无结果');
          return;
        }

        // P0修复兜底：若模型未按批量格式返回，回退保存到首篇目标日记，避免评论丢失。
        const fallbackDiaryId = diaryIds[0] || null;
        this.parser.extractAndSave(response, fallbackDiaryId);

        if (this.ui && this.ui.isPanelOpen()) {
          this.ui.refreshDiaries(true);
        }

        showSuccessToast(`已为 ${diaryIds.length} 篇日记生成评论`);
        logger.info('diary', '[DiaryAPI.requestCommentForSelectedDiaries] 批量生成完成');
      })
      .catch((error) => {
        notificationHandle.dismiss();

        if (error?.name === 'AbortError') {
          logger.info('diary', '[DiaryAPI.requestCommentForSelectedDiaries] 用户中止生成');
          showInfoToast('已中止生成');
        } else {
          logger.error('diary', '[DiaryAPI.requestCommentForSelectedDiaries] 生成失败:', error);
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
   */
  async backgroundGenerateForSelected(diaryIds, charName, signal) {
    const ctx = getContext();
    const settings = this.getSettings();

    if (signal.aborted) {
      logger.info('diary', '[DiaryAPI.backgroundGenerateForSelected] 生成已在开始前中止');
      return null;
    }

    try {
      const selectedDiaries = diaryIds
        .map((id) => this.dataManager.getDiary(id))
        .filter((d) => d && !d.privacy);

      if (selectedDiaries.length === 0) {
        throw new Error('没有可发送的日记');
      }

      const contextContents = await this.builder.buildContextForSelectedDiaries(
        charName,
        ctx,
        this.presetManager,
      );

      const { diariesContent, tempIdMap, tempCommentIdMap } = this.builder.buildDiariesContentWithMapping(
        selectedDiaries,
      );

      contextContents.historyDiaries = diariesContent;
      this.parser.setTempIdMaps(tempIdMap, tempCommentIdMap);

      const commentTask = this.builder.buildCommentTask(selectedDiaries, charName, settings);

      let messages;
      if (this.presetManager) {
        messages = this.presetManager.buildMessagesArray(contextContents);
      } else {
        const combinedContent = Object.values(contextContents).join('\n\n');
        messages = [{ role: 'system', content: combinedContent }];
      }

      if (commentTask) {
        messages.push({ role: 'system', content: commentTask });
      }

      const apiSettings = settings.apiConfig || { source: 'default', stream: false };

      let previewText = '';
      const response = await this._generateDiaryResponse(messages, apiSettings, signal, {
        onChunk: (chunk) => {
          previewText += chunk;
          if (this.ui) {
            this.ui.updateAiPreview(previewText);
          }
        },
      });

      if (signal.aborted) {
        logger.info('diary', '[DiaryAPI.backgroundGenerateForSelected] 生成已被中止');
        return null;
      }

      if (this.ui && !apiSettings.stream) {
        this.ui.updateAiPreview(response);
      }

      logger.debug('diary', '[DiaryAPI.backgroundGenerateForSelected] AI回复:', response?.substring(0, 100) || '');
      return response;
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError' || error?.message === '生成已终止') {
        logger.info('diary', '[DiaryAPI.backgroundGenerateForSelected] 生成已被中止');
        return null;
      }
      throw error;
    }
  }

  /**
   * 统一生成入口
   *
   * @param {Array<Object>} messages - OpenAI风格消息数组
   * @param {Object} apiSettings - 日记模块 API 配置
   * @param {AbortSignal} signal - 中止信号
   * @param {Object} [options={}] - 选项
   * @param {Function} [options.onChunk] - 流式回调
   * @returns {Promise<string>} AI回复
   */
  async _generateDiaryResponse(messages, apiSettings, signal, options = {}) {
    const source = apiSettings?.source || 'default';

    if (source === 'default') {
      const result = await generateWithDefault(messages, {
        signal,
        module: 'diary',
      });
      return result.text || '';
    }

    const requestConfig = this._buildCustomApiClientConfig(apiSettings);

    const response = requestConfig.stream
      ? await generateStream(requestConfig, messages, {
        signal,
        onChunk: options.onChunk,
        module: 'diary',
      })
      : await generate(requestConfig, messages, {
        signal,
        module: 'diary',
      });

    return response.text || '';
  }

  /**
   * 构建共享层 client 配置
   *
   * @param {Object} apiSettings - 日记API设置
   * @returns {Object} 共享API层配置
   */
  _buildCustomApiClientConfig(apiSettings) {
    const customConfig = this.getCurrentCustomConfig(apiSettings);

    if (!customConfig || !customConfig.baseUrl) {
      throw new Error('未找到 API 配置，请先在设置中保存一个配置');
    }

    const requestConfig = {
      source: customConfig.format || 'openai',
      model: customConfig.model,
      baseUrl: customConfig.baseUrl,
      apiKey: customConfig.apiKey,
      useDefault: false,
      stream: Boolean(apiSettings.stream),
      ...normalizeParams(customConfig.params || {}),
      azureConfig: customConfig.azureConfig,
      customUrl: customConfig.customUrl,
    };

    if (!requestConfig.model) {
      throw new Error('未配置模型名称，请先在设置中选择模型');
    }

    return requestConfig;
  }

  /**
   * 获取当前自定义 API 配置（含兜底）
   */
  getCurrentCustomConfig(apiSettings) {
    if (!apiSettings || apiSettings.source !== 'custom') {
      return null;
    }

    const format = apiSettings.format || 'openai';
    const defaultParams = getDefaultParams(format, 'diary');
    const mergedParams = { ...defaultParams, ...(apiSettings.params || {}) };

    let baseUrl = '';
    let apiKey = '';
    let model = apiSettings.model || '';

    const config = {
      format,
      stream: Boolean(apiSettings.stream),
      model,
      params: mergedParams,
      baseUrl: '',
      apiKey: '',
    };

    if (format === 'openrouter') {
      baseUrl = 'https://openrouter.ai/api';
      apiKey = apiSettings.openRouterKey || '';
    } else if (format === 'custom') {
      const customApiConfig = apiSettings.customApiConfig || {};
      baseUrl = customApiConfig.baseUrl || '';
      apiKey = customApiConfig.apiKey || '';
      model = customApiConfig.model || model;
    } else if (format === 'azure_openai') {
      const azureConfig = apiSettings.azureConfig || {};
      baseUrl = azureConfig.baseUrl || '';
      apiKey = azureConfig.apiKey || '';
      model = azureConfig.modelName || model;
      config.azureConfig = azureConfig;
    } else if (format === 'vertexai') {
      const vertexConfig = apiSettings.vertexConfig || {};
      baseUrl = apiSettings.reverseProxyUrl || '';
      apiKey = apiSettings.reverseProxyPassword || '';
      config.vertexConfig = vertexConfig;
    } else {
      const currentProxyPreset = apiSettings.currentProxyPreset || '';
      const proxyPresets = apiSettings.proxyPresets || [];

      if (currentProxyPreset) {
        const preset = proxyPresets.find((p) => p.name === currentProxyPreset);
        if (preset?.url) {
          baseUrl = preset.url;
          apiKey = preset.password || '';
          logger.debug('diary', '[DiaryAPI.getCurrentCustomConfig] 使用反向代理预设:', currentProxyPreset);
        }
      }

      if (!baseUrl && apiSettings.reverseProxyUrl) {
        baseUrl = apiSettings.reverseProxyUrl;
        apiKey = apiSettings.reverseProxyPassword || '';
      }

      if (!baseUrl) {
        baseUrl = getDefaultUrl(resolveSource(format));
      }

      if (!apiKey) {
        apiKey = apiSettings.apiKey || '';
      }
    }

    config.baseUrl = baseUrl;
    config.apiKey = apiKey;
    config.model = model;

    logger.debug('diary', '[DiaryAPI.getCurrentCustomConfig] 配置:', {
      format: config.format,
      model: config.model,
      hasApiKey: Boolean(config.apiKey),
      hasBaseUrl: Boolean(config.baseUrl),
    });

    return config;
  }

  /**
   * 设置用户选中的日记ID
   */
  setSelectedDiaryIds(diaryIds) {
    this.selectedDiaryIds = diaryIds;
    logger.info('diary', '[DiaryAPI.setSelectedDiaryIds] 已设置选中的日记:', diaryIds.length, '篇');
  }

  /**
   * 清除选中的日记ID
   */
  clearSelectedDiaryIds() {
    this.selectedDiaryIds = null;
    logger.debug('diary', '[DiaryAPI.clearSelectedDiaryIds] 已清除选中状态');
  }
}
