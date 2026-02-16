/**
 * 手机API管理器（完全照搬日记）
 * @module phone/ai-integration/ai-send-controller
 *
 * @description
 * 负责与AI交互（核心功能）：
 * - 使用 generateRaw 或自定义API
 * - 支持流式生成
 * - 终止控制
 */

import logger from '../../../logger.js';
import { buildMessagesArray } from './ai-context-builder.js';
import { parseAIResponse, validateAIResponse, matchContactId } from './ai-response-parser.js';
import { getPendingMessages, clearPendingMessages, getAllPendingOperations } from './pending-operations.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { saveChatMessage, loadChatHistory } from '../messages/message-chat-data.js';
import { extension_settings, getContext } from '../../../../../../../scripts/extensions.js';
import { getRequestHeaders, extractMessageFromData, eventSource, event_types } from '../../../../../../../script.js';
import { chat_completion_sources, oai_settings, sendOpenAIRequest, getStreamingReply } from '../../../../../../../scripts/openai.js';
import { getEventSourceStream } from '../../../../../../../scripts/sse-stream.js';
import {
  getToolDefinitions,
  convertToolsToGemini,
  extractToolCallsFromOpenAI,
  extractToolCallsFromGemini,
  executeToolCalls
} from './ai-tool-calling.js';
import { getDefaultParams } from './phone-api-params-config.js';

// ========================================
// [CORE] API管理类
// ========================================

/**
 * 手机API管理器
 *
 * @class PhoneAPI
 */
export class PhoneAPI {
  /**
   * 创建API管理器
   */
  constructor() {
    this.currentAbortController = null;
    this.isGenerating = false;
    this.currentGeneratingContactId = null;  // 记录正在生成的联系人ID
    this.renderedMessageIds = new Map();     // 记录每个联系人已渲染的消息ID（contactId -> Set）
  }

  /**
   * 初始化
   */
  async init() {
    logger.info('phone','[PhoneAPI] 开始初始化');
    logger.info('phone','[PhoneAPI] 初始化完成');
  }

  /**
   * 中止当前生成
   */
  abort() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      this.isGenerating = false;
      this.currentGeneratingContactId = null;  // ← 清空正在生成的联系人ID
      logger.info('phone','[PhoneAPI.abort] 已中止生成');
    }
  }

  /**
   * 检查消息是否已渲染
   * @param {string} contactId - 联系人ID
   * @param {string} messageId - 消息ID
   * @returns {boolean} 是否已渲染
   */
  isMessageRendered(contactId, messageId) {
    if (!this.renderedMessageIds.has(contactId)) {
      return false;
    }
    return this.renderedMessageIds.get(contactId).has(messageId);
  }

  /**
   * 标记消息已渲染
   * @param {string} contactId - 联系人ID
   * @param {string} messageId - 消息ID
   */
  markMessageRendered(contactId, messageId) {
    if (!this.renderedMessageIds.has(contactId)) {
      this.renderedMessageIds.set(contactId, new Set());
    }
    this.renderedMessageIds.get(contactId).add(messageId);
  }

  /**
   * 重置渲染状态（页面重建时调用）
   * @param {string} contactId - 联系人ID
   */
  resetRenderedState(contactId) {
    this.renderedMessageIds.delete(contactId);
    logger.debug('phone','[PhoneAPI.resetRenderedState] 已重置渲染状态:', contactId);
  }

  /**
   * 获取当前选中的自定义API配置
   *
   * @description
   * 从 extension_settings 读取当前的 API 配置：
   * - API类型（format）：从存储的 apiConfig.format 读取
   * - 端点和密钥：根据 API 类型决定
   *   - Custom API：使用 customApiConfig
   *   - OpenRouter：使用固定端点 + openRouterKey
   *   - 其他API：有反代用反代，无反代用默认端点+通用密钥
   * - 模型：从存储的 apiConfig.model 读取
   * - 参数：从存储的 apiConfig.params 读取
   *
   * @returns {Object|null} 配置对象，包含 baseUrl, apiKey, model, format, params 等
   */
  getCurrentCustomConfig() {
    const settings = this.getSettings();
    const apiConfig = settings.apiConfig || {};

    // 读取 API 类型（format）
    const format = apiConfig.format || 'openai';

    // 根据 API 类型获取端点和密钥
    let baseUrl = '';
    let apiKey = '';
    let model = '';

    if (format === 'custom') {
      // Custom API：从 customApiConfig 读取
      const customConfig = apiConfig.customApiConfig || {};
      baseUrl = customConfig.baseUrl || '';
      apiKey = customConfig.apiKey || '';
      model = customConfig.model || '';
    } else if (format === 'openrouter') {
      // OpenRouter：固定端点 + 专用密钥
      baseUrl = 'https://openrouter.ai/api';
      apiKey = apiConfig.openRouterKey || '';
      model = apiConfig.model || '';
    } else {
      // 其他 API：检查是否有反向代理
      const currentProxyPreset = apiConfig.currentProxyPreset || '';
      const proxyPresets = apiConfig.proxyPresets || [];

      if (currentProxyPreset) {
        // 有反向代理预设：使用预设的 URL 和密码
        const preset = proxyPresets.find(p => p.name === currentProxyPreset);
        if (preset && preset.url) {
          baseUrl = preset.url;
          apiKey = preset.password || '';
          logger.debug('phone','[PhoneAPI.getCurrentCustomConfig] 使用反向代理预设:', currentProxyPreset);
        }
      }

      // 如果没有反代或反代无效，使用默认端点和通用密钥
      if (!baseUrl) {
        baseUrl = this.getDefaultBaseUrl(format);
        apiKey = apiConfig.apiKey || '';
      }

      model = apiConfig.model || '';
    }

    // 验证必填项
    if (!baseUrl) {
      logger.warn('phone','[PhoneAPI.getCurrentCustomConfig] 未配置 API 端点');
      return null;
    }

    // ✅ 获取默认参数值，然后用用户保存的值覆盖
    const defaultParams = getDefaultParams(format);
    const userParams = apiConfig.params || {};
    const mergedParams = { ...defaultParams, ...userParams };

    // 构造返回对象
    const config = {
      baseUrl: baseUrl,
      apiKey: apiKey,
      model: model,
      format: format,
      params: mergedParams
    };

    logger.debug('phone','[PhoneAPI.getCurrentCustomConfig] 返回配置:', {
      format: config.format,
      baseUrl: config.baseUrl ? config.baseUrl.substring(0, 30) + '...' : '',
      model: config.model,
      hasApiKey: !!config.apiKey,
      params: Object.keys(config.params)
    });

    return config;
  }

  /**
   * 获取 API 类型的默认端点 URL
   *
   * @param {string} format - API 类型
   * @returns {string} 默认端点 URL
   */
  getDefaultBaseUrl(format) {
    const defaultUrls = {
      'openai': 'https://api.openai.com',
      'claude': 'https://api.anthropic.com',
      'makersuite': 'https://generativelanguage.googleapis.com',
      'deepseek': 'https://api.deepseek.com',
      'mistralai': 'https://api.mistral.ai',
      'cohere': 'https://api.cohere.ai',
      'perplexity': 'https://api.perplexity.ai',
      'groq': 'https://api.groq.com/openai',
      'xai': 'https://api.x.ai',
      'ai21': 'https://api.ai21.com',
      'moonshot': 'https://api.moonshot.cn',
      'fireworks': 'https://api.fireworks.ai/inference',
      'electronhub': 'https://api.electronhub.top',
      'nanogpt': 'https://nano-gpt.com/api',
      'aimlapi': 'https://api.aimlapi.com',
      'pollinations': 'https://text.pollinations.ai',
      'siliconflow': 'https://api.siliconflow.cn',
      'openrouter': 'https://openrouter.ai/api'
    };
    return defaultUrls[format] || '';
  }

  /**
   * 发送消息到AI并处理回复
   *
   * @async
   * @param {string} contactId - 联系人ID
   * @param {Function} onMessageReceived - 收到消息的回调函数（接收解析后的消息对象）
   * @param {Function} onComplete - 完成的回调函数
   * @param {Function} onError - 错误的回调函数
   * @param {Object} [options] - 可选配置（用于重roll等场景）
   * @param {Object} [options.allPendingMessages] - 所有待发送消息（多联系人）格式：{ contactId: [messages] }
   * @returns {Promise<void>}
   *
   * @description
   * 支持多种消息类型（自动解析和保存）：
   * - text: { sender, content, time, type: 'text' }
   * - emoji: { sender, content, time, type: 'emoji' }
   * - redpacket: { sender, amount, time, type: 'redpacket' }
   * - transfer: { sender, amount, message, time, type: 'transfer' }
   * - image: { sender, description, time, type: 'image' }
   * - video: { sender, description, time, type: 'video' }
   * - file: { sender, filename, size, time, type: 'file' }
   *
   * ✅ 支持重roll场景（2025-11-07新增）：
   * - 如果提供 options.allPendingMessages，则使用该数据构建上下文
   * - 否则自动从暂存队列或聊天历史中获取
   */
  async sendToAI(contactId, onMessageReceived, onComplete, onError, options = {}) {
    logger.info('phone','[PhoneAPI.sendToAI] 开始发送到AI:', contactId);

    // ✅ 检查是否启用工具调用
    const phoneSettings = this.getSettings();
    const useToolCalling = phoneSettings.apiConfig?.useToolCalling || false;
    const apiSource = phoneSettings.apiConfig?.source || 'default';

    // 工具调用仅在自定义API模式下可用
    if (useToolCalling && apiSource === 'custom') {
      logger.info('phone','[PhoneAPI.sendToAI] 使用工具调用模式');
      return await this.sendToAIWithToolCalling(contactId, onMessageReceived, onComplete, onError, options);
    }

    // 否则使用传统的标签解析模式
    logger.info('phone','[PhoneAPI.sendToAI] 使用传统标签解析模式');

    try {
      // 获取待发送消息（先从暂存队列读取）
      let pendingMessages = getPendingMessages(contactId);

      // 如果暂存队列为空（刷新页面后），尝试从聊天历史中读取
      if (pendingMessages.length === 0) {
        logger.debug('phone','[PhoneAPI] 暂存队列为空，从聊天历史查找待回复消息');

        // 从聊天历史中找最后的用户消息
        const chatHistory = await loadChatHistory(contactId);

        if (chatHistory.length === 0) {
          logger.warn('phone','[PhoneAPI] 没有聊天历史');
          onError?.('请先发送消息');
          return;
        }

        // 找到最后一条用户消息
        const lastUserMessageIndex = chatHistory.findLastIndex(msg => msg.sender === 'user');

        if (lastUserMessageIndex === -1) {
          logger.warn('phone','[PhoneAPI] 没有用户消息');
          onError?.('请先发送消息');
          return;
        }

        // 检查这条用户消息后面有没有AI回复
        const hasAIReplyAfter = chatHistory.slice(lastUserMessageIndex + 1).some(msg => msg.sender === 'contact');

        if (hasAIReplyAfter) {
          // 最后的用户消息已经有AI回复了，需要发新消息
          logger.warn('phone','[PhoneAPI] 最后的用户消息已有AI回复');
          onError?.('请先发送新消息');
          return;
        }

        // 找到待回复的用户消息，构建成暂存格式
        const lastUserMessage = chatHistory[lastUserMessageIndex];

        // ✅ 处理引用消息：构建成 [引用]...[回复]... 格式
        let messageContent = lastUserMessage.content;
        if (lastUserMessage.type === 'quote' && lastUserMessage.quotedMessage) {
          // 引用消息：简单格式化（只显示回复部分）
          const quotedText = lastUserMessage.quotedMessage.content
            || lastUserMessage.quotedMessage.replyContent
            || '引用消息';
          messageContent = `[引用]${quotedText}[回复]${lastUserMessage.replyContent}`;
        }

        pendingMessages = [{
          content: messageContent,
          time: lastUserMessage.time,
          type: lastUserMessage.type
        }];

        // 日志显示（兼容引用消息）
        const previewText = lastUserMessage.content
          ? lastUserMessage.content.substring(0, 20)
          : (lastUserMessage.replyContent ? `[引用]${lastUserMessage.replyContent.substring(0, 20)}` : '[无内容]');
        logger.info('phone','[PhoneAPI] 从聊天历史中找到待回复消息:', previewText);
      } else {
        logger.debug('phone','[PhoneAPI] 从暂存队列获取待发送消息，共', pendingMessages.length, '条');
      }

      // ✅ 获取所有待操作（支持从 options 传入，用于重roll场景）
      let allPendingMessages;
      if (options.allPendingMessages) {
        allPendingMessages = options.allPendingMessages;
        logger.info('phone','[PhoneAPI] 使用传入的多联系人消息（重roll模式），共', Object.keys(allPendingMessages).length, '个联系人');
      } else {
        const allPendingOps = getAllPendingOperations();
        allPendingMessages = allPendingOps.messages;
        logger.debug('phone','[PhoneAPI] 从暂存队列获取多联系人消息');
      }

      // 构建messages数组（新版，返回messages和编号映射表）
      const buildResult = await buildMessagesArray(contactId, allPendingMessages);
      let messages = buildResult.messages;  // ← 改为 let，允许后续 Gemini 格式转换
      const messageNumberMap = buildResult.messageNumberMap;
      const imagesToAttach = buildResult.imagesToAttach || [];

      logger.debug('phone','[PhoneAPI] messages数组构建完成，共', messages.length, '条，编号映射表大小:', messageNumberMap.size);
      if (imagesToAttach.length > 0) {
        logger.info('phone','[PhoneAPI] 检测到待附加图片，数量:', imagesToAttach.length);
      }

      // ✅ 移除手动宏替换：generateRaw 会自动处理
      logger.debug('phone','[PhoneAPI] 跳过手动宏替换（由 generateRaw 内部处理）');

      // 创建终止控制器
      this.currentAbortController = new AbortController();
      this.isGenerating = true;
      this.currentGeneratingContactId = contactId;  // ← 记录正在生成的联系人ID

      // ✅ 触发开始生成事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-start', {
        detail: { contactId }
      }));
      logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-start 事件');

      // 获取API配置（完全照搬日记）
      const phoneSettings = this.getSettings();
      const apiSettings = phoneSettings.apiConfig || { source: 'default', stream: false };

      // 构造 API 配置对象
      let apiConfig = {
        source: apiSettings.source,
        stream: apiSettings.stream
      };

      // ✅ 修复：使用 getCurrentCustomConfig() 读取新的配置结构
      if (apiSettings.source === 'custom') {
        const currentConfig = this.getCurrentCustomConfig();

        if (!currentConfig || !currentConfig.baseUrl) {
          logger.error('phone','[PhoneAPI.sendToAI] 未找到API配置');
          throw new Error('未找到API配置，请先在设置中保存一个配置');
        }

        apiConfig = {
          ...apiConfig,
          baseUrl: currentConfig.baseUrl,
          apiKey: currentConfig.apiKey,
          model: currentConfig.model,
          format: currentConfig.format,
          params: currentConfig.params || {}
        };

        logger.debug('phone','[PhoneAPI.sendToAI] 使用自定义API配置:', {
          baseUrl: currentConfig.baseUrl ? currentConfig.baseUrl.substring(0, 30) + '...' : '',
          model: currentConfig.model,
          format: currentConfig.format || 'openai (默认)',
          params: currentConfig.params ? Object.keys(currentConfig.params).length + '个参数' : '无参数'
        });
      }

      logger.debug('phone','[PhoneAPI] ========== 发送给AI的messages ==========');
      logger.debug('phone',JSON.stringify(messages, null, 2));
      logger.debug('phone','[PhoneAPI] ========== messages结束 ==========');
      logger.debug('phone','[PhoneAPI] API配置:', apiConfig.source, '流式:', apiConfig.stream);

      // ✅ 临时绕过酒馆的 image_inlining 开关（2025-11-16新增）
      // 原因：手机的图片识别设置应独立于酒馆的全局设置
      const originalImageInlining = oai_settings.image_inlining;
      const phoneImageMode = extension_settings.acsusPawsPuffs?.phone?.imageMode || 'once';

      // 如果手机需要发送图片（imageMode != 'never'），临时开启酒馆的图片发送
      if (phoneImageMode !== 'never') {
        logger.info('phone','[PhoneAPI] 临时开启酒馆的 image_inlining（手机图片模式:', phoneImageMode, '）');
        logger.debug('phone','[PhoneAPI] 原始 image_inlining 状态:', originalImageInlining);
        oai_settings.image_inlining = true;
      } else {
        logger.info('phone','[PhoneAPI] 手机图片模式为 never，不修改 image_inlining（当前:', originalImageInlining, '）');
      }

      // ✅ 图片处理逻辑：区分自定义API和默认API
      if (apiConfig.source === 'custom') {
        // 🔥 自定义API：直接在 messages 中转换图片URL为base64
        logger.info('phone','[PhoneAPI] 自定义API：开始转换结构化消息中的图片');

        let successCount = 0;
        let failCount = 0;

        for (const message of messages) {
          if (Array.isArray(message.content)) {
            // ✅ 遍历并处理图片，失败的图片会被标记删除
            const partsToKeep = [];

            for (const part of message.content) {
              if (part.type === 'image_url' && part.image_url?.url) {
                const imageUrl = part.image_url.url;

                // 如果已经是base64，保留
                if (imageUrl.startsWith('data:image/')) {
                  logger.debug('phone','[PhoneAPI] 图片已是base64格式，保留:', imageUrl.substring(0, 50));
                  partsToKeep.push(part);
                  continue;
                }

                // 尝试转换图片
                try {
                  const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${window.location.origin}${imageUrl}`;
                  logger.debug('phone','[PhoneAPI] 正在转换图片:', fullUrl);
                  const response = await fetch(fullUrl, { method: 'GET', cache: 'force-cache' });

                  if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
                  }

                  const blob = await response.blob();
                  const reader = new FileReader();
                  const imageBase64 = await new Promise((resolve) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                  });

                  // ✅ 转换成功，更新 URL 并保留
                  part.image_url.url = imageBase64;
                  partsToKeep.push(part);
                  successCount++;
                  logger.debug('phone','[PhoneAPI] ✅ 图片转换成功');
                } catch (error) {
                  // ❌ 转换失败，移除此图片
                  failCount++;
                  logger.warn('phone','[PhoneAPI] ⚠️ 图片转换失败，已从请求中移除:', imageUrl, error.message);
                }
              } else {
                // 非图片内容，保留
                partsToKeep.push(part);
              }
            }

            // ✅ 更新 message.content，只保留成功的部分
            message.content = partsToKeep;
          }
        }

        if (successCount > 0 || failCount > 0) {
          logger.info('phone',`[PhoneAPI] 图片转换完成: ${successCount} 成功, ${failCount} 失败（已移除）`);
        } else {
          logger.debug('phone','[PhoneAPI] 没有检测到需要转换的图片');
        }
      }

      // ✅ 默认API：提前转换图片为 base64（在注册事件之前）
      let convertedImages = [];
      if (apiConfig.source === 'default' && imagesToAttach.length > 0 && phoneImageMode !== 'never') {
        logger.info('phone','[PhoneAPI] 默认API：开始转换图片为 base64');
        try {
          for (const img of imagesToAttach) {
            // ✅ 如果是相对路径，转换为绝对路径
            const fullUrl = img.url.startsWith('http') ? img.url : `${window.location.origin}${img.url}`;
            logger.debug('phone','[PhoneAPI] 正在转换图片:', fullUrl);
            const response = await fetch(fullUrl, { method: 'GET', cache: 'force-cache' });
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            const blob = await response.blob();
            const reader = new FileReader();
            const imageBase64 = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            convertedImages.push({ ...img, base64: imageBase64 });
            logger.debug('phone','[PhoneAPI] 图片转换完成');
          }
          logger.info('phone','[PhoneAPI] ✅ 默认API图片已转换为 base64，数量:', convertedImages.length);
        } catch (error) {
          logger.error('phone','[PhoneAPI] ❌ 默认API图片转换失败:', error);
          convertedImages = []; // 转换失败，清空
        }
      }

      // 获取 generateRaw 函数
      const ctx = getContext();
      const generateRaw = ctx.generateRaw;

      // ✅ 关键：注册同步事件处理器，在宏替换后附加图片（仅默认API）
      if (apiConfig.source === 'default' && convertedImages.length > 0) {
        const attachImageHandler = (eventData) => {  // ← 同步函数！
          try {
            logger.info('phone','[PhoneAPI] 🖼️ 开始在事件中附加图片');

            // 找到最后一条 user 消息
            let lastUserMessageIndex = -1;
            for (let i = eventData.chat.length - 1; i >= 0; i--) {
              if (eventData.chat[i].role === 'user') {
                lastUserMessageIndex = i;
                break;
              }
            }

            if (lastUserMessageIndex !== -1) {
              const userMessage = eventData.chat[lastUserMessageIndex];

              // ✅ 转换为多模态格式，附加所有图片
              const textContent = userMessage.content;
              const contentArray = [{ type: 'text', text: textContent }];

              // ✅ 遍历所有图片并添加到 content 数组
              for (const img of convertedImages) {
                contentArray.push({
                  type: 'image_url',
                  image_url: { url: img.base64 }
                });
              }

              userMessage.content = contentArray;

              logger.info('phone','[PhoneAPI] ✅ 图片已附加到用户消息');
              logger.debug('phone','[PhoneAPI] 附加图片数量:', convertedImages.length);
              logger.debug('phone','[PhoneAPI] 图片URL列表:', convertedImages.map(img => img.url));
              logger.debug('phone','[PhoneAPI] 多模态content长度:', userMessage.content.length)
            } else {
              logger.warn('phone','[PhoneAPI] 未找到 user 消息，无法附加图片');
            }
          } catch (error) {
            logger.error('phone','[PhoneAPI] ❌ 图片附加失败:', error);
            // 图片附加失败不影响整体流程，继续执行
          }
        };

        eventSource.once(event_types.CHAT_COMPLETION_PROMPT_READY, attachImageHandler);
        logger.info('phone','[PhoneAPI] 已注册同步图片附加事件监听器');
      }

      // ✅ 打印最终发送的 messages 结构（调试用）
      logger.info('phone','[PhoneAPI] ========== 最终发送给AI的messages ==========');
      logger.info('phone','[PhoneAPI] API源:', apiConfig.source);
      logger.info('phone','[PhoneAPI] messages数量:', messages.length);
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (Array.isArray(msg.content)) {
          logger.debug('phone',`[PhoneAPI] [${i}] role: ${msg.role}, content: 数组(${msg.content.length}项)`);
          msg.content.forEach((part, j) => {
            if (part.type === 'text') {
              logger.debug('phone',`  [${j}] type: text, text: ${part.text.substring(0, 50)}...`);
            } else if (part.type === 'image_url') {
              const url = part.image_url?.url || '';
              logger.debug('phone',`  [${j}] type: image_url, url: ${url.substring(0, 60)}...`);
            }
          });
        } else {
          logger.debug('phone',`[PhoneAPI] [${i}] role: ${msg.role}, content: ${typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : msg.content}`);
        }
      }
      logger.info('phone','[PhoneAPI] =============================================');

      // ⭐ Gemini 格式转换（已禁用）
      // ❌ 原因：大多数代理的 Gemini 渠道不支持 Google AI Studio 原生格式（inlineData）
      // ❌ 测试结果：代理返回 HTTP 500 错误，无法识别 Gemini 图片格式
      // ✅ 结论：继续使用 OpenAI 格式，GPT/Claude 渠道都能正常识别图片
      //
      // 📌 如需启用（适用场景：官方 Google AI Studio API 或支持原生格式的代理）：
      //    1. 取消注释（ai-send-controller.js 第 462-485 行）
      //    2. 删除测试代码（第 463 行的 `const imageFormat = ...` 改为读取设置）
      //    3. 添加 UI 设置（可选，让用户选择格式）
      /*
      const imageFormat = extension_settings.acsusPawsPuffs?.phone?.imageFormat || 'openai';
      if (apiConfig.source === 'custom' && imageFormat === 'gemini') {
        logger.info('phone','[PhoneAPI] 🎯 检测到 Gemini 格式设置，开始转换');
        messages = convertToGeminiFormat(messages);

        // 打印转换后的格式（仅显示包含图片的消息）
        logger.info('phone','[PhoneAPI] ========== 转换后的 Gemini 格式 ==========');
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          if (Array.isArray(msg.content) && msg.content.some(p => p.inlineData)) {
            logger.debug('phone',`[PhoneAPI] [${i}] role: ${msg.role}, content: 数组(${msg.content.length}项)`);
            msg.content.forEach((part, j) => {
              if (part.type === 'text') {
                logger.debug('phone',`  [${j}] type: text, text: ${part.text.substring(0, 50)}...`);
              } else if (part.inlineData) {
                logger.debug('phone',`  [${j}] inlineData: { mimeType: '${part.inlineData.mimeType}', data: '${part.inlineData.data.substring(0, 30)}...' }`);
              }
            });
          }
        }
        logger.info('phone','[PhoneAPI] =============================================');
      }
      */

      // ========================================
      // [核心] 使用事件拦截调用官方 sendOpenAIRequest
      // ========================================
      let response = null;
      let eventHandler = null;

      try {
        // 根据API源决定如何调用
        if (apiConfig.source === 'custom') {
          // ========================================
          // 自定义API模式：通过事件拦截注入自定义配置
          // ========================================
          const currentConfig = this.getCurrentCustomConfig();
          if (!currentConfig || !currentConfig.baseUrl) {
            throw new Error('请先在API设置中配置自定义API');
          }

          logger.info('phone','[PhoneAPI] 使用自定义API模式，通过事件拦截注入配置');

          // 设置一次性事件拦截器
          eventHandler = (data) => {
            data.reverse_proxy = currentConfig.baseUrl;
            data.proxy_password = currentConfig.apiKey || '';
            data.model = currentConfig.model || 'gpt-4o-mini';

            // ✅ 关键：注入 chat_completion_source，决定消息格式转换方式
            // currentConfig.format 对应官方的 chat_completion_sources（如 'openai', 'claude', 'makersuite' 等）
            if (currentConfig.format && currentConfig.format !== 'custom') {
              data.chat_completion_source = currentConfig.format;
              logger.debug('phone','[PhoneAPI] 已注入 chat_completion_source:', currentConfig.format);
            }

            // 注入自定义参数（根据API类型支持的参数）
            if (currentConfig.params) {
              // 通用参数
              if (currentConfig.params.temperature !== undefined) data.temperature = currentConfig.params.temperature;
              if (currentConfig.params.max_tokens !== undefined) data.max_tokens = currentConfig.params.max_tokens;
              if (currentConfig.params.top_p !== undefined) data.top_p = currentConfig.params.top_p;

              // OpenAI系列参数
              if (currentConfig.params.frequency_penalty !== undefined) data.frequency_penalty = currentConfig.params.frequency_penalty;
              if (currentConfig.params.presence_penalty !== undefined) data.presence_penalty = currentConfig.params.presence_penalty;

              // Claude/Google系列参数
              if (currentConfig.params.top_k !== undefined) data.top_k = currentConfig.params.top_k;

              // OpenRouter专用参数
              if (currentConfig.params.repetition_penalty !== undefined) data.repetition_penalty = currentConfig.params.repetition_penalty;
              if (currentConfig.params.min_p !== undefined) data.min_p = currentConfig.params.min_p;
              if (currentConfig.params.top_a !== undefined) data.top_a = currentConfig.params.top_a;
            }
            logger.debug('phone','[PhoneAPI] 事件拦截注入自定义配置完成:', {
              reverse_proxy: data.reverse_proxy,
              model: data.model,
              chat_completion_source: data.chat_completion_source,
              params: currentConfig.params ? Object.keys(currentConfig.params) : []
            });
          };
          eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);

          // 调用官方API
          response = await sendOpenAIRequest('quiet', messages, this.currentAbortController.signal);

        } else if (apiConfig.source === 'default') {
          // ========================================
          // 跟随酒馆设置：直接调用，不拦截任何参数
          // ========================================
          logger.info('phone','[PhoneAPI] 使用跟随酒馆设置模式，直接调用官方API');
          response = await sendOpenAIRequest('quiet', messages, this.currentAbortController.signal);

        } else {
          // ========================================
          // 未知来源：回退到默认模式
          // ========================================
          logger.warn('phone','[PhoneAPI] 未知的API来源:', apiConfig.source, '，回退到默认模式');
          response = await sendOpenAIRequest('quiet', messages, this.currentAbortController.signal);
        }

      } catch (error) {
        // 清理事件监听器
        if (eventHandler) {
          eventSource.removeListener(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);
        }

        // 检查是否是终止异常
        if (error.name === 'AbortError' || this.currentAbortController?.signal?.aborted) {
          logger.info('phone','[PhoneAPI] 生成已被终止');
          onError?.('生成已终止');
          return;
        }
        throw error; // 其他错误继续抛出

      } finally {
        // ✅ 关键：恢复原始 image_inlining 设置（无论成功或失败）
        if (phoneImageMode !== 'never') {
          oai_settings.image_inlining = originalImageInlining;
          logger.debug('phone','[PhoneAPI] 已恢复原始 image_inlining 状态:', originalImageInlining);
        }
      }

      // 再次检查是否被终止
      if (this.currentAbortController.signal.aborted) {
        logger.info('phone','[PhoneAPI] 生成已被终止');
        onError?.('生成已终止');
        return;
      }

      // ✅ 处理响应对象
      // sendOpenAIRequest 返回原始JSON对象，需要用 extractMessageFromData 提取文本
      let responseText;
      let responseMetadata = {};

      if (typeof response === 'string') {
        // 流式模式：直接是字符串
        responseText = response;
        logger.debug('phone','[PhoneAPI] AI回复接收完成（流式），长度:', responseText.length);
      } else if (typeof response === 'object') {
        // 非流式模式：返回原始JSON对象，需要提取文本
        responseText = extractMessageFromData(response);
        logger.debug('phone','[PhoneAPI] AI回复接收完成（非流式），长度:', responseText?.length || 0);

        // 尝试提取元数据（如果有）
        if (response.metadata) {
          responseMetadata = response.metadata;
          logger.info('phone','[PhoneAPI] 响应包含元数据:', Object.keys(responseMetadata));
        }
      } else {
        logger.error('phone','[PhoneAPI] 未知的响应类型:', typeof response);
        onError?.('API返回格式错误');
        return;
      }

      // 检查提取结果
      if (!responseText) {
        logger.error('phone','[PhoneAPI] 无法从响应中提取文本，原始响应:', response);
        onError?.('API返回空响应');
        return;
      }

      // ✅ 保存原始响应到调试器
      const { saveDebugVersion } = await import('../messages/message-debug-ui.js');
      saveDebugVersion(contactId, responseText);

      // 验证格式
      if (!validateAIResponse(responseText)) {
        logger.error('phone','[PhoneAPI] AI回复格式错误');

        // ✅ 触发生成错误事件（修复按钮状态不恢复的bug）
        document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
          detail: { contactId, error: 'AI回复格式错误' }
        }));
        logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-error 事件');

        onError?.('AI回复格式错误');
        return;
      }

      // 解析回复（传递编号映射表和contactId，用于精确查找引用消息）
      const parsedMessages = await parseAIResponse(responseText, contactId, messageNumberMap);

      if (parsedMessages.length === 0) {
        logger.warn('phone','[PhoneAPI] 未解析到任何消息');

        // ✅ 触发生成错误事件
        document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
          detail: { contactId, error: 'AI未返回有效消息' }
        }));
        logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-error 事件');

        onError?.('AI未返回有效消息');
        return;
      }

      // 获取联系人列表（用于匹配角色名）
      const contacts = await loadContacts();

      // ✅ 如果有新的 API 元数据（如 Gemini 签名），先清除所有联系人的旧签名
      if (Object.keys(responseMetadata).length > 0) {
        logger.info('phone','[PhoneAPI] 检测到新的 API 元数据，开始清除旧签名...');
        const { loadChatHistory, saveChatHistory } = await import('../messages/message-chat-data.js');

        // 获取本次响应涉及的所有角色（从 parsedMessages 提取）
        const involvedContactIds = new Set(
          parsedMessages
            .map(msg => msg.role)
            .map(roleName => {
              const contact = contacts.find(c => c.name === roleName || c.name.replace(/\s/g, '') === roleName.replace(/\s/g, ''));
              return contact ? contact.id : `tavern_${roleName}`;
            })
        );

        // 清除每个涉及联系人的旧签名
        for (const cid of involvedContactIds) {
          const history = await loadChatHistory(cid);
          let hasOldSignature = false;

          // 遍历消息，清除旧签名
          history.forEach(msg => {
            if (msg.metadata?.gemini?.thoughtSignature) {
              delete msg.metadata.gemini.thoughtSignature;
              hasOldSignature = true;

              // 如果 gemini 对象为空，也删除它
              if (Object.keys(msg.metadata.gemini).length === 0) {
                delete msg.metadata.gemini;
              }

              // 如果 metadata 对象为空，也删除它
              if (Object.keys(msg.metadata).length === 0) {
                delete msg.metadata;
              }
            }
          });

          // 如果有旧签名被删除，保存更新后的历史记录
          if (hasOldSignature) {
            await saveChatHistory(cid, history);
            logger.info('phone',`[PhoneAPI] 已清除联系人 ${cid} 的旧签名`);
          }
        }

        logger.info('phone','[PhoneAPI] 旧签名清除完成，准备保存新签名');
      }

      // ✅ 收集所有触发的联系人ID（用于清空待发送消息）
      const triggeredContactIds = new Set();

      // 逐条处理消息
      for (let i = 0; i < parsedMessages.length; i++) {
        const msg = parsedMessages[i];

        // ✅ 特殊处理：好友申请消息（联系人已被删除，不在列表中）
        if (msg.type === 'friend_request') {
          // 从角色名推导contactId（格式：tavern_角色名）
          const friendRequestContactId = `tavern_${msg.role}`;

          logger.debug('phone','[PhoneAPI] 处理好友申请消息:', msg.role, '→', friendRequestContactId);

          // 保存消息到聊天记录
          const message = {
            id: msg.id,
            sender: 'contact',
            time: msg.time,
            type: 'friend_request',
            content: msg.content
          };

          await saveChatMessage(friendRequestContactId, message);

          // 模拟打字间隔（好友申请消息不需要太长间隔）
          const typingDelay = 800;
          logger.debug('phone','[PhoneAPI] 模拟打字中...', typingDelay, 'ms（好友申请）');
          await new Promise(resolve => setTimeout(resolve, typingDelay));

          // ✅ 好友申请消息不应在当前聊天界面显示（因为是其他联系人的消息）
          // 只触发全局消息列表刷新事件（显示小红点）
          logger.debug('phone','[PhoneAPI] 触发全局消息列表刷新');
          document.dispatchEvent(new CustomEvent('phone-message-received', {
            detail: { contactId: friendRequestContactId, message }
          }));

          logger.info('phone','[PhoneAPI] 好友申请消息已保存，不在当前界面显示');
          continue;  // 跳过后续的普通消息处理逻辑
        }

        // 匹配联系人ID（支持多角色消息路由）
        const matchedContactId = matchContactId(msg.role, contacts);

        if (!matchedContactId) {
          logger.warn('phone','[PhoneAPI] 跳过未知角色的消息:', msg.role);
          continue;
        }

        // ✅ 新逻辑：所有消息都处理，但根据目标联系人路由
        const isCurrentChat = (matchedContactId === contactId);

        // 收集触发的联系人ID
        triggeredContactIds.add(matchedContactId);

        if (!isCurrentChat) {
          logger.info('phone','[PhoneAPI] 检测到其他联系人的消息，将保存并触发通知:', msg.role);
        }

        // 保存消息到数据库（保留解析器返回的ID和时间戳，避免误删）
        const message = {
          id: msg.id,           // 保留解析器生成的唯一ID
          sender: 'contact',
          time: msg.time,       // 保留解析器生成的时间戳
          type: msg.type || 'text'
        };

        // 根据消息类型填充不同字段
        switch (msg.type) {
          case 'emoji':
            message.content = msg.content;  // 表情包名称
            break;
          case 'redpacket':
            message.amount = msg.amount;    // 红包金额
            break;
          case 'transfer':
            message.amount = msg.amount;    // 转账金额
            message.message = msg.message;  // 转账留言
            break;
          case 'gift-membership':
            message.membershipType = msg.membershipType;  // 会员类型（vip/svip）
            message.months = msg.months;                  // 月数
            message.duration = msg.duration;              // 时长标识（monthly/annual）
            message.content = msg.content;                // 显示文本
            break;
          case 'buy-membership':
            message.membershipType = msg.membershipType;  // 会员类型（vip/svip）
            message.months = msg.months;                  // 月数
            message.content = msg.content;                // 显示文本
            break;
          case 'image':
            message.description = msg.description;  // 图片描述
            message.imageUrl = msg.imageUrl;        // 图片链接（可选）
            break;
          case 'video':
            message.description = msg.description;  // 视频描述
            break;
          case 'file':
            message.filename = msg.filename;  // 文件名
            message.size = msg.size;          // 文件大小
            break;
          case 'quote':
            message.quotedMessage = msg.quotedMessage;  // 被引用的消息（完整快照）
            message.replyContent = msg.replyContent;    // 回复内容
            break;
          case 'recalled-pending':
            // 待撤回消息：保留所有字段（用于触发动画）
            message.originalContent = msg.originalContent;  // 原始消息内容
            message.originalType = msg.originalType;        // 原始消息类型
            message.canPeek = msg.canPeek;                  // 是否可以偷看
            message.role = msg.role;                        // 角色名称
            break;
          case 'text':
          default:
            message.content = msg.content;  // 文字内容
            break;
        }

        // ✅ 待撤回消息：保存为recalled类型（存储里不保存pending状态）
        const messageToSave = message.type === 'recalled-pending'
          ? {
            ...message,
            type: 'recalled',  // 转换为recalled保存
            recalledTime: message.time  // 记录撤回时间
          }
          : message;

        // ✅ 为第一条 assistant 消息添加 API 元数据（如 Gemini 的 thoughtSignature）
        // 官方要求：签名附加到整个回复的第一个 part
        logger.debug('phone',`[PhoneAPI] 检查元数据附加条件: i=${i}, msg.sender=${msg.sender}, responseMetadata.keys=${Object.keys(responseMetadata)}, 条件满足=${i === 0 && msg.sender === 'contact' && Object.keys(responseMetadata).length > 0}`);

        if (i === 0 && msg.sender === 'contact' && Object.keys(responseMetadata).length > 0) {
          messageToSave.metadata = responseMetadata;
          logger.info('phone','[PhoneAPI] ✅ 第一条 assistant 消息已附加 API 元数据:', Object.keys(responseMetadata));
        }

        // ✅ 保存到目标联系人的聊天记录（不是当前界面的contactId）
        await saveChatMessage(matchedContactId, messageToSave);

        // ❌ 已删除：转账消息自动到账逻辑
        // 理由：业务逻辑已统一到 transfer-message.js 渲染器中处理
        // 现在无论是重roll、重新应用还是手动添加，都会在渲染时自动保存转账记录
        // 这样架构更统一，避免"重新应用"绕过此处导致转账不生效的问题

        // 如果不是第一条消息，先延迟（模拟打字时间）
        if (i > 0) {
          const delay = this.calculateTypingDelay(message);
          logger.debug('phone','[PhoneAPI] 模拟打字中...', delay, 'ms（字数:', message.content?.length || 0, '）');
          await this.sleep(delay);
        }

        // ✅ 判断是否需要立即显示（只有当前聊天界面的消息才立即显示）
        if (isCurrentChat) {
          // 触发回调（显示气泡）
          logger.debug('phone','[PhoneAPI] 触发onMessageReceived回调，消息类型:', message.type);
          if (onMessageReceived) {
            try {
              // ✅ 只传递 message 参数，contactId 可以从 message.contactId 获取
              await onMessageReceived(message);
              logger.debug('phone','[PhoneAPI] 消息已显示');
            } catch (error) {
              logger.error('phone','[PhoneAPI] onMessageReceived回调执行失败:', error);
              throw error;
            }
          } else {
            logger.warn('phone','[PhoneAPI] onMessageReceived回调未定义！');
          }
        } else {
          // ✅ 其他联系人的消息：触发全局事件（更新消息列表小红点）
          logger.debug('phone','[PhoneAPI] 触发全局消息列表刷新');
          document.dispatchEvent(new CustomEvent('phone-message-received', {
            detail: { contactId: matchedContactId, message }
          }));
          logger.info('phone','[PhoneAPI] 其他联系人消息已保存并触发通知:', msg.role);
        }
      }

      // ✅ 清空所有触发联系人的待发送消息
      triggeredContactIds.forEach(triggeredId => {
        clearPendingMessages(triggeredId);
        logger.debug('phone','[PhoneAPI] 已清空待发送消息:', triggeredId);
      });

      // ✅ 触发生成完成事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-complete', {
        detail: { contactId }
      }));
      logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-complete 事件');

      // 完成回调（保持向后兼容）
      onComplete?.();

      logger.info('phone','[PhoneAPI] 发送流程完成');

    } catch (error) {
      logger.error('phone','[PhoneAPI] 发送失败:', error);

      // ✅ 保存错误信息到调试器
      const { saveDebugVersion } = await import('../messages/message-debug-ui.js');
      const errorText = `错误: ${error.message || error}\n\n完整错误信息:\n${JSON.stringify(error, null, 2)}`;
      saveDebugVersion(contactId, errorText);

      // ✅ 触发生成错误事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
        detail: { contactId, error: error.message || '发送失败' }
      }));
      logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-error 事件');

      // 错误回调（保持向后兼容）
      onError?.(error.message || '发送失败');
    } finally {
      // 清理终止控制器
      this.currentAbortController = null;
      this.isGenerating = false;
      this.currentGeneratingContactId = null;  // ← 清空正在生成的联系人ID
    }
  }

  /**
   * @deprecated 此方法已被新的事件拦截方式替代，不再使用
   * 请使用 sendToAI 中的 sendOpenAIRequest + 事件拦截方案
   *
   * 调用API（支持流式和自定义配置）
   *
   * @async
   * @param {Array<Object>} messages - messages数组（支持多种角色类型）
   * @param {Object} apiConfig - API配置对象
   * @param {AbortSignal} signal - 终止信号
   * @param {string} contactId - 联系人ID（用于保存错误信息到调试器）
   * @returns {Promise<string>} AI回复文本
   */
  async callAPIWithStreaming(messages, apiConfig, signal, contactId) {
    // 🔍 调试日志：记录传入的完整 apiConfig（完全照搬日记）
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] === 自定义API调试开始 ===');
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 传入的 apiConfig:', JSON.stringify(apiConfig, null, 2));
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] apiConfig.source:', apiConfig.source);
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, '(类型:', typeof apiConfig.baseUrl, ', 长度:', apiConfig.baseUrl?.length || 0, ')');
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] apiConfig.model:', apiConfig.model);
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] apiConfig.apiKey:', apiConfig.apiKey ? '已设置(已隐藏)' : '未设置');
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] messages数组长度:', messages.length);

    // 获取当前使用的 API 源
    let currentSource;
    if (apiConfig.source === 'custom') {
      // ✅ 修复：统一使用 OPENAI 源，通过 reverse_proxy 模式让后端使用我们的 proxy_password
      // 原因：CUSTOM 源会强制从本地密钥文件读取，忽略 proxy_password，导致 401 认证失败
      const formatMap = {
        'openai': chat_completion_sources.OPENAI,      // ← 改为 OPENAI
        'claude': chat_completion_sources.CLAUDE,
        'google': chat_completion_sources.MAKERSUITE,
        'openrouter': chat_completion_sources.OPENROUTER,
        'scale': chat_completion_sources.OPENAI,       // ← 改为 OPENAI
        'ai21': chat_completion_sources.AI21,
        'mistral': chat_completion_sources.MISTRALAI,
        'custom': 'auto'
      };

      const userFormat = apiConfig.format || 'openai';

      if (userFormat === 'custom') {
        currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
        logger.debug('phone','[PhoneAPI] 自定义API - 自动检测模式，使用酒馆API源:', currentSource);
      } else {
        currentSource = formatMap[userFormat] || chat_completion_sources.OPENAI;  // ← 默认改为 OPENAI
        logger.debug('phone','[PhoneAPI] 自定义API - 用户选择格式:', userFormat, '→ 映射到:', currentSource);
      }
    } else {
      currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
      logger.debug('phone','[PhoneAPI] 使用酒馆API源:', currentSource);
    }

    let model = apiConfig.model;
    if (!model) {
      model = oai_settings.openai_model || 'gpt-4o-mini';
      logger.warn('phone','[PhoneAPI.callAPIWithStreaming] 未设置模型，使用官方默认:', model);
    }

    // ✅ 移除 models/ 前缀（避免 URL 重复：/models/models/xxx）
    // 参考：SillyTavern 官方在获取模型列表时也会 replace('models/', '')
    if (model && model.startsWith('models/')) {
      const originalModel = model;
      model = model.replace('models/', '');
      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 移除 models/ 前缀:', originalModel, '→', model);
    }

    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 最终使用的 model:', model);

    // ✅ 核心修复：区分 default 模式和 custom 模式的参数读取
    let bodyParams = {};

    if (apiConfig.source === 'custom') {
      // ✅ custom 模式：使用保存的参数配置（完全独立）
      const savedParams = apiConfig.params || {};

      // 只添加用户保存的参数（避免发送不支持的参数）
      if (savedParams.temperature !== undefined) {
        bodyParams.temperature = savedParams.temperature;
      } else {
        bodyParams.temperature = 0.8; // 默认值
      }

      if (savedParams.max_tokens !== undefined) {
        bodyParams.max_tokens = savedParams.max_tokens;
      } else {
        bodyParams.max_tokens = 8000; // 默认值
      }

      // 可选参数：只在用户设置了才添加
      if (savedParams.frequency_penalty !== undefined) {
        bodyParams.frequency_penalty = savedParams.frequency_penalty;
      }
      if (savedParams.presence_penalty !== undefined) {
        bodyParams.presence_penalty = savedParams.presence_penalty;
      }
      if (savedParams.top_p !== undefined) {
        bodyParams.top_p = savedParams.top_p;
      }
      if (savedParams.top_k !== undefined) {
        bodyParams.top_k = savedParams.top_k;
      }
      if (savedParams.repetition_penalty !== undefined) {
        bodyParams.repetition_penalty = savedParams.repetition_penalty;
      }
      if (savedParams.min_p !== undefined) {
        bodyParams.min_p = savedParams.min_p;
      }
      if (savedParams.top_a !== undefined) {
        bodyParams.top_a = savedParams.top_a;
      }

      logger.info('phone','[PhoneAPI.callAPIWithStreaming] ✅ 使用自定义参数配置:', bodyParams);
    } else {
      // ✅ default 模式：使用酒馆配置
      bodyParams.temperature = Number(oai_settings.temp_openai) || 1.0;
      bodyParams.max_tokens = Number(oai_settings.openai_max_tokens) || 2000;
      bodyParams.frequency_penalty = Number(oai_settings.freq_pen_openai) || 0;
      bodyParams.presence_penalty = Number(oai_settings.pres_pen_openai) || 0;
      bodyParams.top_p = Number(oai_settings.top_p_openai) || 1.0;

      const topK = Number(oai_settings.top_k_openai);
      if (topK) bodyParams.top_k = topK;

      logger.info('phone','[PhoneAPI.callAPIWithStreaming] ✅ 使用酒馆参数配置:', bodyParams);
    }

    const body = {
      type: 'quiet',
      messages: messages,
      model: model,
      stream: apiConfig.stream || false,
      chat_completion_source: currentSource,
      ...bodyParams,  // ← 只包含有值的参数
      use_makersuite_sysprompt: true,
      claude_use_sysprompt: true
    };

    if (apiConfig.source === 'custom') {
      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 🔍 进入自定义API分支');
      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 检查前 - apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, ', trim后:', `"${apiConfig.baseUrl?.trim()}"`);
      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 检查前 - apiConfig.model:', `"${apiConfig.model}"`, ', trim后:', `"${apiConfig.model?.trim()}"`);

      // ✅ 修复：检查必填字段，避免传递空值导致 Invalid URL
      if (!apiConfig.baseUrl || !apiConfig.baseUrl.trim()) {
        const error = new Error('自定义API配置错误：缺少 API 端点 (Base URL)');
        logger.error('phone','[PhoneAPI.callAPIWithStreaming]', error.message);
        logger.error('phone','[PhoneAPI.callAPIWithStreaming] baseUrl 值:', apiConfig.baseUrl, ', 类型:', typeof apiConfig.baseUrl);
        throw error;
      }
      if (!apiConfig.model || !apiConfig.model.trim()) {
        const error = new Error('自定义API配置错误：缺少模型名称');
        logger.error('phone','[PhoneAPI.callAPIWithStreaming]', error.message);
        logger.error('phone','[PhoneAPI.callAPIWithStreaming] model 值:', apiConfig.model, ', 类型:', typeof apiConfig.model);
        throw error;
      }

      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] ✅ 验证通过，开始设置 API 端点');

      // ✅ 修复：使用 reverse_proxy 模式让后端使用我们的 proxy_password
      // 原因：CUSTOM 源会从本地密钥文件读取，忽略 proxy_password，导致 401 认证失败
      // 现在使用 OPENAI 源（见上方映射），后端会检查 reverse_proxy 并使用 proxy_password
      body.reverse_proxy = apiConfig.baseUrl.trim();
      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] body.reverse_proxy 已设置为:', `"${body.reverse_proxy}"`);

      if (apiConfig.apiKey) {
        body.proxy_password = apiConfig.apiKey.trim();
        logger.debug('phone','[PhoneAPI.callAPIWithStreaming] body.proxy_password 已设置（后端将使用此密钥）');
      }
    } else {
      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 跳过自定义API分支 (source !== "custom")');
    }

    // 🔍 最终检查：记录 body 中的 reverse_proxy
    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 最终 body.reverse_proxy:', body.reverse_proxy);

    // 🎯 检查 messages 中是否有 thoughtSignature
    let hasSignatureInRequest = false;
    body.messages.forEach((msg, idx) => {
      if (Array.isArray(msg.content)) {
        const signaturePart = msg.content.find(part => part.thoughtSignature);
        if (signaturePart) {
          hasSignatureInRequest = true;
          logger.info('phone',`[PhoneAPI.callAPIWithStreaming] 🎯 请求中包含 thoughtSignature: messages[${idx}].role=${msg.role}, 签名长度=${signaturePart.thoughtSignature.length}`);
          logger.debug('phone',`[PhoneAPI.callAPIWithStreaming] 签名内容（前100字符）: ${signaturePart.thoughtSignature.substring(0, 100)}...`);
        }
      }
    });
    if (!hasSignatureInRequest) {
      logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 请求中不包含 thoughtSignature');
    }

    logger.debug('phone','[PhoneAPI.callAPIWithStreaming] 完整 body 对象:', JSON.stringify(body, null, 2));

    logger.info('phone','[PhoneAPI.callAPIWithStreaming] 最终请求配置:', {
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
      // ✅ 提取完整响应体（原封不动）
      const errorText = await response.text();

      // ✅ 尝试解析 JSON 格式的错误
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {
        // 不是 JSON，保持原样
      }

      // ✅ 记录到日志（格式化 JSON）
      logger.error('phone','[PhoneAPI] ========== API 错误详情 ==========');
      logger.error('phone','[PhoneAPI] 状态码:', response.status);
      logger.error('phone','[PhoneAPI] 状态文本:', response.statusText);
      if (errorJson) {
        logger.error('phone','[PhoneAPI] 错误内容（JSON）:', JSON.stringify(errorJson, null, 2));
      } else {
        logger.error('phone','[PhoneAPI] 错误内容（纯文本）:', errorText);
      }
      logger.error('phone','[PhoneAPI] ======================================');

      // ✅ 保存完整响应到调试器（让用户可以在 debug-textarea 中查看）
      if (contactId) {
        const { saveDebugVersion } = await import('../messages/message-debug-ui.js');
        saveDebugVersion(contactId, errorText);
      }

      // ✅ 抛出简洁的错误（给toast显示）
      throw new Error(`API调用失败 (${response.status})`);
    }

    if (apiConfig.stream) {
      return await this.handleStreamResponse(response, signal, currentSource);
    } else {
      const data = await response.json();
      // ✅ 修复：使用 extractMessageFromData 自动适配各种 API 格式（OpenAI/Claude/Google AI等）
      const message = extractMessageFromData(data);

      // ✅ 提取 API 元数据（如 Gemini 的 thoughtSignature）
      const metadata = this.extractAPIMetadata(data, currentSource);

      // ✅ 返回结构化对象（而不只是文本）
      return {
        text: message || '',
        metadata: metadata
      };
    }
  }

  /**
   * 处理流式响应
   *
   * @async
   * @param {Response} response - fetch响应对象
   * @param {AbortSignal} signal - 中止信号
   * @param {string} currentSource - 当前使用的API源
   * @returns {Promise<string>} 完整回复文本
   */
  async handleStreamResponse(response, signal, currentSource) {
    const eventStream = getEventSourceStream();
    response.body.pipeThrough(eventStream);
    const reader = eventStream.readable.getReader();

    let fullText = '';
    const state = { reasoning: '', image: '' };

    logger.debug('phone','[PhoneAPI.handleStreamResponse] 使用API源解析流式响应:', currentSource);

    try {
      while (true) {
        if (signal.aborted) {
          logger.info('phone','[PhoneAPI] 流式生成被中止');
          break;
        }

        const { done, value } = await reader.read();

        if (done || !value?.data || value.data === '[DONE]') {
          logger.debug('phone','[PhoneAPI] 流式生成完成');
          break;
        }

        let parsed;
        try {
          parsed = JSON.parse(value.data);
        } catch (error) {
          logger.warn('phone','[PhoneAPI] 解析SSE数据失败:', error);
          continue;
        }

        const chunk = getStreamingReply(parsed, state, {
          chatCompletionSource: currentSource
        });

        if (typeof chunk === 'string' && chunk) {
          fullText += chunk;
          logger.debug('phone','[PhoneAPI] 收到文本块，当前长度:', fullText.length);
        }
      }

      return fullText;

    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) {
        logger.info('phone','[PhoneAPI] 流式生成被中止，返回部分文本');
        return fullText;
      }

      throw error;

    } finally {
      try {
        reader.releaseLock?.();
      } catch (error) {
        logger.warn('phone','[PhoneAPI] 释放读取器失败:', error);
      }
    }
  }

  /**
   * 获取手机设置
   *
   * @returns {Object} 手机设置对象
   */
  getSettings() {
    const EXT_ID = 'acsusPawsPuffs';
    const MODULE_NAME = 'phone';

    if (!extension_settings[EXT_ID]) {
      extension_settings[EXT_ID] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME]) {
      extension_settings[EXT_ID][MODULE_NAME] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME].apiConfig) {
      extension_settings[EXT_ID][MODULE_NAME].apiConfig = {
        source: 'default',
        stream: false,
        useToolCalling: false,  // 默认关闭工具调用
        customConfigs: [],
        currentConfigId: null
      };
    }
    return extension_settings[EXT_ID][MODULE_NAME];
  }

  /**
   * 使用工具调用方式发送消息（Function Calling）
   *
   * @async
   * @param {string} contactId - 联系人ID
   * @param {Function} onMessageReceived - 收到消息的回调函数
   * @param {Function} onComplete - 完成的回调函数
   * @param {Function} onError - 错误的回调函数
   * @param {Object} [options] - 可选配置（用于重roll等场景）
   * @param {Object} [options.allPendingMessages] - 所有待发送消息（多联系人）格式：{ contactId: [messages] }
   * @returns {Promise<void>}
   */
  async sendToAIWithToolCalling(contactId, onMessageReceived, onComplete, onError, options = {}) {
    logger.info('phone','[PhoneAPI.sendToAIWithToolCalling] 使用工具调用模式发送到AI:', contactId);

    try {
      // 获取待发送消息（复用原有逻辑）
      let pendingMessages = getPendingMessages(contactId);

      if (pendingMessages.length === 0) {
        const chatHistory = await loadChatHistory(contactId);
        if (chatHistory.length === 0) {
          onError?.('请先发送消息');
          return;
        }

        const lastUserMessageIndex = chatHistory.findLastIndex(msg => msg.sender === 'user');
        if (lastUserMessageIndex === -1) {
          onError?.('请先发送消息');
          return;
        }

        const hasAIReplyAfter = chatHistory.slice(lastUserMessageIndex + 1).some(msg => msg.sender === 'contact');
        if (hasAIReplyAfter) {
          onError?.('请先发送新消息');
          return;
        }

        const lastUserMessage = chatHistory[lastUserMessageIndex];
        pendingMessages = [{
          content: lastUserMessage.content,
          time: lastUserMessage.time,
          type: lastUserMessage.type
        }];
      }

      // ✅ 获取所有待操作（支持从 options 传入，用于重roll场景）
      let allPendingMessages;
      if (options.allPendingMessages) {
        allPendingMessages = options.allPendingMessages;
        logger.info('phone','[PhoneAPI] 工具调用模式 - 使用传入的多联系人消息（重roll模式），共', Object.keys(allPendingMessages).length, '个联系人');
      } else {
        const allPendingOps = getAllPendingOperations();
        allPendingMessages = allPendingOps.messages;
        logger.debug('phone','[PhoneAPI] 工具调用模式 - 从暂存队列获取多联系人消息');
      }

      // 构建 messages 数组（返回messages和编号映射表）
      const buildResult = await buildMessagesArray(contactId, allPendingMessages);
      const messages = buildResult.messages;
      const messageNumberMap = buildResult.messageNumberMap;

      logger.debug('phone','[PhoneAPI] 工具调用模式 - messages 构建完成，共', messages.length, '条，编号映射表大小:', messageNumberMap.size);

      // ✅ 替换宏（{{user}}、{{当前时间}}、{{当前天气}} 等）
      try {
        const { substituteParams } = getContext();
        if (substituteParams) {
          for (const message of messages) {
            if (message.content && typeof message.content === 'string') {
              message.content = substituteParams(message.content);
            }
          }
          logger.debug('phone','[PhoneAPI] 已替换所有宏变量（工具调用模式）');
        }
      } catch (error) {
        logger.warn('phone','[PhoneAPI] 宏替换失败（继续发送）:', error);
      }

      // 创建终止控制器
      this.currentAbortController = new AbortController();
      this.isGenerating = true;
      this.currentGeneratingContactId = contactId;  // ← 记录正在生成的联系人ID

      // ✅ 触发开始生成事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-start', {
        detail: { contactId }
      }));
      logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-start 事件（工具调用模式）');

      // 获取工具定义
      const tools = getToolDefinitions();
      logger.debug('phone','[PhoneAPI] 工具定义已加载，共', tools.length, '个工具');

      // 调用 API（直接调用，不走 SillyTavern）
      const phoneSettings = this.getSettings();
      const apiSettings = phoneSettings.apiConfig || {};
      const format = apiSettings.customConfigs?.find(c => c.id === apiSettings.currentConfigId)?.format || 'openai';

      logger.info('phone','[PhoneAPI] 使用工具调用，API格式:', format);

      // 调用 API
      const result = await this.callDirectAPIWithTools(messages, tools, format, this.currentAbortController.signal);

      if (!result) {
        onError?.('API 未返回有效响应');
        return;
      }

      // 解析工具调用
      let toolCalls;
      if (format === 'google') {
        toolCalls = extractToolCallsFromGemini(result);
      } else {
        toolCalls = extractToolCallsFromOpenAI(result);
      }

      if (!toolCalls || toolCalls.length === 0) {
        logger.warn('phone','[PhoneAPI] AI 未调用任何工具');
        onError?.('AI 未返回消息');
        return;
      }

      // 执行工具调用
      const executionResults = await executeToolCalls(toolCalls, contactId);

      logger.info('phone','[PhoneAPI] 工具执行完成，共', executionResults.length, '条结果');

      // 触发回调（显示消息气泡）
      let index = 0;
      for (const result of executionResults) {
        if (result.result.success) {
          const message = {
            sender: 'contact',
            content: result.result.message,
            time: Math.floor(Date.now() / 1000),
            type: result.result.type || 'text'
          };

          // 如果不是第一条消息，先延迟（模拟打字时间）
          if (index > 0) {
            const delay = this.calculateTypingDelay(message);
            logger.debug('phone','[PhoneAPI] [工具调用] 模拟打字中...', delay, 'ms（字数:', message.content?.length || 0, '）');
            await this.sleep(delay);
          }

          onMessageReceived?.(message);
          index++;
        }
      }

      // 清空待发送消息
      clearPendingMessages(contactId);

      // ✅ 触发生成完成事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-complete', {
        detail: { contactId }
      }));
      logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-complete 事件（工具调用模式）');

      // 完成回调（保持向后兼容）
      onComplete?.();

      logger.info('phone','[PhoneAPI] 工具调用流程完成');

    } catch (error) {
      logger.error('phone','[PhoneAPI] 工具调用失败:', error);

      // ✅ 触发生成错误事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
        detail: { contactId, error: error.message || '发送失败' }
      }));
      logger.debug('phone','[PhoneAPI] 已触发 phone-ai-generation-error 事件（工具调用模式）');

      // 错误回调（保持向后兼容）
      onError?.(error.message || '发送失败');
    } finally {
      this.currentAbortController = null;
      this.isGenerating = false;
      this.currentGeneratingContactId = null;  // ← 清空正在生成的联系人ID
    }
  }

  /**
   * 直接调用第三方 API（带工具支持）
   *
   * @async
   * @param {Array<Object>} messages - messages 数组
   * @param {Array<Object>} tools - 工具定义数组
   * @param {string} format - API 格式（openai/google）
   * @param {AbortSignal} signal - 终止信号
   * @returns {Promise<Object>} API 响应
   */
  async callDirectAPIWithTools(messages, tools, format, signal) {
    const phoneSettings = this.getSettings();
    const apiSettings = phoneSettings.apiConfig;
    const currentConfig = apiSettings.customConfigs?.find(c => c.id === apiSettings.currentConfigId);

    if (!currentConfig) {
      throw new Error('未找到 API 配置，请先保存配置');
    }

    const { baseUrl, apiKey, model } = currentConfig;

    logger.info('phone','[PhoneAPI.callDirectAPIWithTools] 调用第三方 API:', { baseUrl, model, format });

    // 根据格式构建请求
    let url, headers, body;

    if (format === 'google') {
      // Gemini API
      // ✅ 修复：去掉 model 名称中的 "models/" 前缀（如果有）
      const cleanModel = model.replace(/^models\//, '');
      url = `${baseUrl}/v1beta/models/${cleanModel}:generateContent`;
      headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      };

      // 转换 messages 为 Gemini 格式
      const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      body = {
        contents: contents,
        tools: [convertToolsToGemini(tools)]
      };
    } else {
      // OpenAI 兼容格式
      url = `${baseUrl}/v1/chat/completions`;
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };

      body = {
        model: model,
        messages: messages,
        tools: tools
      };
    }

    logger.debug('phone','[PhoneAPI] 请求 URL:', url);
    logger.debug('phone','[PhoneAPI] 请求 body:', JSON.stringify(body, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('phone','[PhoneAPI] API 调用失败:', response.status, errorText);
      throw new Error(`API 调用失败: ${response.status}`);
    }

    const data = await response.json();
    logger.debug('phone','[PhoneAPI] API 响应:', JSON.stringify(data, null, 2));

    return data;
  }

  /**
   * 根据消息内容计算打字延迟（模拟真人打字速度）
   *
   * @private
   * @param {Object} message - 消息对象
   * @returns {number} 延迟毫秒数
   *
   * @description
   * 文字消息：基础100ms + 字数×150ms（约6-7字/秒）
   * 其他消息（系统/图片/红包/转账/表情）：固定800ms
   */
  calculateTypingDelay(message) {
    if (message.type === 'text') {
      const charCount = message.content.length;
      // 打字速度：150ms/字（约6-7字/秒）
      // 基础反应时间：100ms（按下发送键的延迟）
      return 100 + charCount * 150;
    } else {
      // 系统消息/图片/红包/转账/表情：固定800ms
      return 800;
    }
  }

  /**
   * 延迟函数
   * @private
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 提取 API 元数据（如 Gemini 的 thoughtSignature）
   *
   * @param {Object} data - API 响应数据
   * @param {string} currentSource - API 源（makersuite / openai / claude 等）
   * @returns {Object} 元数据对象，按 API 源分类
   *
   * @description
   * 从 API 响应中提取特定于该 API 的元数据：
   * - Gemini (makersuite)：thoughtSignature、thinkingTokens
   * - OpenAI：（暂无）
   * - Claude：（暂无）
   *
   * @example
   * const metadata = this.extractAPIMetadata(geminiResponse, 'makersuite');
   * // 返回：{ gemini: { thoughtSignature: '...', thinkingTokens: 1078 } }
   */
  extractAPIMetadata(data, currentSource) {
    const metadata = {};

    // ✅ Gemini / MakerSuite
    if (currentSource === 'makersuite' || currentSource === chat_completion_sources.MAKERSUITE) {
      metadata.gemini = {};

      // 🔍 调试：打印接收到的 data 结构
      logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 接收到的 data 对象键:', Object.keys(data));
      logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 data.candidates:', data.candidates ? '存在' : '不存在');
      logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 data.usageMetadata:', data.usageMetadata ? JSON.stringify(data.usageMetadata) : '不存在');

      // 🔍 检查是否是 OpenAI 格式（SillyTavern 转换后）
      if (data.choices && data.responseContent) {
        logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 检测到 OpenAI 格式，尝试从 responseContent 提取');

        // SillyTavern 返回的 responseContent 直接是 content 对象：{ parts: [...], role: '...' }
        // 需要重构为 Gemini 原始格式：{ candidates: [{ content: {...} }] }
        if (data.responseContent.parts) {
          logger.info('phone','[PhoneAPI.extractAPIMetadata] 🎯 从 responseContent.parts 重构 Gemini 响应');
          data = {
            candidates: [{
              content: data.responseContent
            }],
            usageMetadata: data.usageMetadata  // 保留 token 统计
          };
        }
      }

      if (data.candidates) {
        logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 candidates[0]:', data.candidates[0] ? '存在' : '不存在');
        if (data.candidates[0]) {
          logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 candidates[0] 键:', Object.keys(data.candidates[0]));
          logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 candidates[0].content:', data.candidates[0].content ? '存在' : '不存在');
          if (data.candidates[0].content) {
            logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 content 键:', Object.keys(data.candidates[0].content));
            logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 content.parts:', data.candidates[0].content.parts ? `存在，长度: ${data.candidates[0].content.parts.length}` : '不存在');
            if (data.candidates[0].content.parts?.[0]) {
              logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 parts[0] 键:', Object.keys(data.candidates[0].content.parts[0]));
              logger.debug('phone','[PhoneAPI.extractAPIMetadata] 🔍 parts[0].thoughtSignature:', data.candidates[0].content.parts[0].thoughtSignature ? '存在' : '不存在');
            }
          }
        }
      }

      try {
        // 从第一个 candidate 的第一个 part 提取 thoughtSignature
        const thoughtSignature = data.candidates?.[0]?.content?.parts?.[0]?.thoughtSignature;
        if (thoughtSignature) {
          metadata.gemini.thoughtSignature = thoughtSignature;
          logger.info('phone','[PhoneAPI.extractAPIMetadata] ✅ 提取到 Gemini thoughtSignature');
          logger.debug('phone','[PhoneAPI.extractAPIMetadata] Signature 长度:', thoughtSignature.length);
        } else {
          logger.warn('phone','[PhoneAPI.extractAPIMetadata] ❌ 未找到 thoughtSignature');
        }

        // 提取 thinking tokens 统计
        const thinkingTokens = data.usageMetadata?.thoughtsTokenCount;
        if (thinkingTokens) {
          metadata.gemini.thinkingTokens = thinkingTokens;
          logger.debug('phone','[PhoneAPI.extractAPIMetadata] Thinking tokens:', thinkingTokens);
        } else {
          logger.debug('phone','[PhoneAPI.extractAPIMetadata] 未找到 thoughtsTokenCount');
        }
      } catch (error) {
        logger.warn('phone','[PhoneAPI.extractAPIMetadata] Gemini 元数据提取失败:', error.message);
      }
    }

    // ✅ Claude（未来扩展）
    // if (currentSource === 'claude' || currentSource === chat_completion_sources.CLAUDE) {
    //   metadata.claude = {};
    //   // 提取 Claude 特有元数据
    // }

    // ✅ OpenAI（未来扩展）
    // if (currentSource === 'openai' || currentSource === chat_completion_sources.OPENAI) {
    //   metadata.openai = {};
    //   // 提取 OpenAI 特有元数据
    // }

    logger.debug('phone','[PhoneAPI.extractAPIMetadata] 元数据提取完成:', Object.keys(metadata));
    return metadata;
  }
}

// ========================================
// [UTILITY] 格式转换工具函数（已禁用）
// ========================================

/**
 * 转换 OpenAI 格式消息为 Gemini 格式
 *
 * ⚠️ 当前已禁用：大多数代理不支持 Google AI Studio 原生格式
 * 📌 保留此函数以备将来使用（如官方 API 或支持的代理）
 *
 * 🔧 如需启用：
 * 1. 取消注释（ai-send-controller.js 第 462-485 行）
 * 2. 删除测试代码（第 463 行的 `const imageFormat = ...` 改为读取设置）
 * 3. 添加 UI 设置（可选，让用户选择格式）
 *
 * @description
 * Gemini API 的格式要求（参考 SillyTavern 官方 prompt-converters.js）：
 * 1. role: 'assistant' → 'model'
 * 2. content 数组中的 image_url → inlineData
 * 3. ⚠️ 注意：Gemini 不需要 type 字段！只保留 inlineData
 * 4. 图片 URL 拆分：'data:image/jpeg;base64,xxx' → { mimeType: 'image/jpeg', data: 'xxx' }
 *
 * @param {Array<Object>} messages - OpenAI 格式的 messages
 * @returns {Array<Object>} Gemini 兼容格式的 messages
 *
 * @example
 * // OpenAI 格式
 * { role: 'user', content: [
 *   { type: 'text', text: '你好' },
 *   { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,xxx' } }
 * ]}
 *
 * // Gemini 格式（与 SillyTavern 官方一致）
 * { role: 'user', content: [
 *   { type: 'text', text: '你好' },
 *   { inlineData: { mimeType: 'image/jpeg', data: 'xxx' } }
 * ]}
 */
function convertToGeminiFormat(messages) {
  logger.info('phone','[FormatConverter] 🔄 开始转换为 Gemini 格式');
  let convertedImageCount = 0;

  const converted = messages.map((msg, msgIndex) => {
    // 1. 转换 role（Gemini 用 'model' 而不是 'assistant'）
    const role = msg.role === 'assistant' ? 'model' : msg.role;

    // 2. 如果 content 不是数组，直接返回（纯文本消息）
    if (!Array.isArray(msg.content)) {
      return { ...msg, role };
    }

    // 3. 转换 content 数组中的图片格式
    const convertedContent = msg.content.map((part, partIndex) => {
      if (part.type === 'text') {
        return part; // 文本部分不变
      }
      else if (part.type === 'image_url') {
        // OpenAI: { type: 'image_url', image_url: { url: 'data:image/webp;base64,...' } }
        // Gemini: { inlineData: { mimeType: 'image/webp', data: '...' } }
        //         ↑ 注意：Gemini 不需要 type 字段！

        const url = part.image_url.url;

        // 拆分 data URL
        if (!url.startsWith('data:')) {
          logger.warn('phone','[FormatConverter] ⚠️ 图片 URL 不是 data URL，跳过:', url.substring(0, 50));
          return part;
        }

        const [header, data] = url.split(',');
        if (!header || !data) {
          logger.error('phone','[FormatConverter] ❌ 无法解析图片 URL:', url.substring(0, 50));
          return part;
        }

        const mimeType = header.split(';')[0].split(':')[1];

        convertedImageCount++;
        logger.debug('phone',`[FormatConverter] ✅ [消息${msgIndex}/部分${partIndex}] ${mimeType}, 数据长度 ${data.length}`);

        // ✅ 修复：删除 type 字段，只保留 inlineData（与 SillyTavern 官方一致）
        return {
          inlineData: {
            mimeType: mimeType,
            data: data  // 纯 base64，不带前缀
          }
        };
      }
      return part; // 其他类型保持不变
    });

    return {
      role: role,
      content: convertedContent
    };
  });

  logger.info('phone',`[FormatConverter] ✅ Gemini 格式转换完成，共转换 ${convertedImageCount} 张图片`);
  return converted;
}
