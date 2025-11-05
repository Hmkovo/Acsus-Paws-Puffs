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
import { getRequestHeaders, extractMessageFromData } from '../../../../../../../script.js';
import { chat_completion_sources, oai_settings, getStreamingReply } from '../../../../../../../scripts/openai.js';
import { getEventSourceStream } from '../../../../../../../scripts/sse-stream.js';
import {
  getToolDefinitions,
  convertToolsToGemini,
  extractToolCallsFromOpenAI,
  extractToolCallsFromGemini,
  executeToolCalls
} from './ai-tool-calling.js';

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
    logger.info('[PhoneAPI] 开始初始化');
    logger.info('[PhoneAPI] 初始化完成');
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
      logger.info('[PhoneAPI.abort] 已中止生成');
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
    logger.debug('[PhoneAPI.resetRenderedState] 已重置渲染状态:', contactId);
  }

  /**
   * 发送消息到AI并处理回复
   * 
   * @async
   * @param {string} contactId - 联系人ID
   * @param {Function} onMessageReceived - 收到消息的回调函数（接收解析后的消息对象）
   * @param {Function} onComplete - 完成的回调函数
   * @param {Function} onError - 错误的回调函数
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
   */
  async sendToAI(contactId, onMessageReceived, onComplete, onError) {
    logger.info('[PhoneAPI.sendToAI] 开始发送到AI:', contactId);

    // ✅ 检查是否启用工具调用
    const phoneSettings = this.getSettings();
    const useToolCalling = phoneSettings.apiConfig?.useToolCalling || false;
    const apiSource = phoneSettings.apiConfig?.source || 'default';

    // 工具调用仅在自定义API模式下可用
    if (useToolCalling && apiSource === 'custom') {
      logger.info('[PhoneAPI.sendToAI] 使用工具调用模式');
      return await this.sendToAIWithToolCalling(contactId, onMessageReceived, onComplete, onError);
    }

    // 否则使用传统的标签解析模式
    logger.info('[PhoneAPI.sendToAI] 使用传统标签解析模式');

    try {
      // 获取待发送消息（先从暂存队列读取）
      let pendingMessages = getPendingMessages(contactId);

      // 如果暂存队列为空（刷新页面后），尝试从聊天历史中读取
      if (pendingMessages.length === 0) {
        logger.debug('[PhoneAPI] 暂存队列为空，从聊天历史查找待回复消息');

        // 从聊天历史中找最后的用户消息
        const chatHistory = await loadChatHistory(contactId);

        if (chatHistory.length === 0) {
          logger.warn('[PhoneAPI] 没有聊天历史');
          onError?.('请先发送消息');
          return;
        }

        // 找到最后一条用户消息
        const lastUserMessageIndex = chatHistory.findLastIndex(msg => msg.sender === 'user');

        if (lastUserMessageIndex === -1) {
          logger.warn('[PhoneAPI] 没有用户消息');
          onError?.('请先发送消息');
          return;
        }

        // 检查这条用户消息后面有没有AI回复
        const hasAIReplyAfter = chatHistory.slice(lastUserMessageIndex + 1).some(msg => msg.sender === 'contact');

        if (hasAIReplyAfter) {
          // 最后的用户消息已经有AI回复了，需要发新消息
          logger.warn('[PhoneAPI] 最后的用户消息已有AI回复');
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
        logger.info('[PhoneAPI] 从聊天历史中找到待回复消息:', previewText);
      } else {
        logger.debug('[PhoneAPI] 从暂存队列获取待发送消息，共', pendingMessages.length, '条');
      }

      // ✅ 获取所有待操作（包括其他联系人的消息）
      const allPendingOps = getAllPendingOperations();
      const allPendingMessages = allPendingOps.messages;

      // 构建messages数组（新版，返回messages和编号映射表）
      const buildResult = await buildMessagesArray(contactId, allPendingMessages);
      const messages = buildResult.messages;
      const messageNumberMap = buildResult.messageNumberMap;

      logger.debug('[PhoneAPI] messages数组构建完成，共', messages.length, '条，编号映射表大小:', messageNumberMap.size);

      // 创建终止控制器
      this.currentAbortController = new AbortController();
      this.isGenerating = true;
      this.currentGeneratingContactId = contactId;  // ← 记录正在生成的联系人ID

      // ✅ 触发开始生成事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-start', {
        detail: { contactId }
      }));
      logger.debug('[PhoneAPI] 已触发 phone-ai-generation-start 事件');

      // 获取API配置（完全照搬日记）
      const phoneSettings = this.getSettings();
      const apiSettings = phoneSettings.apiConfig || { source: 'default', stream: false };

      // 构造 API 配置对象
      let apiConfig = {
        source: apiSettings.source,
        stream: apiSettings.stream
      };

      if (apiSettings.source === 'custom') {
        const currentConfigId = apiSettings.currentConfigId;
        const customConfigs = apiSettings.customConfigs || [];
        const currentConfig = customConfigs.find(c => c.id === currentConfigId);

        if (!currentConfig) {
          logger.error('[PhoneAPI.sendToAI] 未找到当前API配置');
          throw new Error('未找到API配置，请先在设置中保存一个配置');
        }

        apiConfig = {
          ...apiConfig,
          baseUrl: currentConfig.baseUrl,
          apiKey: currentConfig.apiKey,
          model: currentConfig.model,
          format: currentConfig.format
        };

        logger.debug('[PhoneAPI.sendToAI] 使用自定义API配置:', {
          name: currentConfig.name,
          baseUrl: currentConfig.baseUrl,
          model: currentConfig.model,
          format: currentConfig.format || 'openai (默认)'
        });
      }

      logger.debug('[PhoneAPI] ========== 发送给AI的messages ==========');
      logger.debug(JSON.stringify(messages, null, 2));
      logger.debug('[PhoneAPI] ========== messages结束 ==========');
      logger.debug('[PhoneAPI] API配置:', apiConfig.source, '流式:', apiConfig.stream);

      // 获取 generateRaw 函数
      const ctx = getContext();
      const generateRaw = ctx.generateRaw;

      // 使用try-catch捕获终止异常
      let response;
      try {
        if (apiConfig.source === 'custom') {
          // 使用自定义API（传入messages数组）
          response = await this.callAPIWithStreaming(messages, apiConfig, this.currentAbortController.signal);
        } else {
          // 使用默认API（酒馆配置）
          // ✅ 修复：generateRaw支持直接传messages数组，不要合并成字符串！
          logger.info('[PhoneAPI] 使用默认API（generateRaw），直接传入messages数组');
          response = await generateRaw({
            prompt: messages  // ← 直接传messages数组，让generateRaw自动适配API格式
          });
        }
      } catch (error) {
        // 检查是否是终止异常
        if (error.name === 'AbortError' || this.currentAbortController.signal.aborted) {
          logger.info('[PhoneAPI] 生成已被终止');
          onError?.('生成已终止');
          return;
        }
        throw error; // 其他错误继续抛出
      }

      // 再次检查是否被终止
      if (this.currentAbortController.signal.aborted) {
        logger.info('[PhoneAPI] 生成已被终止');
        onError?.('生成已终止');
        return;
      }

      logger.debug('[PhoneAPI] AI回复接收完成，长度:', response.length);

      // ✅ 保存原始响应到调试器
      const { saveDebugVersion } = await import('../messages/message-debug-ui.js');
      saveDebugVersion(contactId, response);

      // 验证格式
      if (!validateAIResponse(response)) {
        logger.error('[PhoneAPI] AI回复格式错误');

        // ✅ 触发生成错误事件（修复按钮状态不恢复的bug）
        document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
          detail: { contactId, error: 'AI回复格式错误' }
        }));
        logger.debug('[PhoneAPI] 已触发 phone-ai-generation-error 事件');

        onError?.('AI回复格式错误');
        return;
      }

      // 解析回复（传递编号映射表和contactId，用于精确查找引用消息）
      const parsedMessages = await parseAIResponse(response, contactId, messageNumberMap);

      if (parsedMessages.length === 0) {
        logger.warn('[PhoneAPI] 未解析到任何消息');

        // ✅ 触发生成错误事件
        document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
          detail: { contactId, error: 'AI未返回有效消息' }
        }));
        logger.debug('[PhoneAPI] 已触发 phone-ai-generation-error 事件');

        onError?.('AI未返回有效消息');
        return;
      }

      // 获取联系人列表（用于匹配角色名）
      const contacts = await loadContacts();

      // 逐条处理消息
      for (let i = 0; i < parsedMessages.length; i++) {
        const msg = parsedMessages[i];

        // 匹配联系人ID
        const matchedContactId = matchContactId(msg.role, contacts);

        if (!matchedContactId) {
          logger.warn('[PhoneAPI] 跳过未知角色的消息:', msg.role);
          continue;
        }

        // 只处理当前联系人的消息
        if (matchedContactId !== contactId) {
          logger.warn('[PhoneAPI] 跳过其他联系人的消息:', msg.role);
          continue;
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

        await saveChatMessage(contactId, messageToSave);

        // ✅ 转账消息自动到账（数据层处理，不依赖UI）
        if (message.type === 'transfer' && message.sender === 'contact') {
          const { receiveTransfer } = await import('../data-storage/storage-wallet.js');
          try {
            // ✅ 传递消息ID，建立转账记录和聊天消息的关联
            await receiveTransfer(contactId, message.amount, message.message || '', message.id);
            logger.info('[PhoneAPI] AI转账已自动到账:', message.amount, '(数据层处理)');
          } catch (error) {
            logger.error('[PhoneAPI] AI转账到账失败:', error.message);
          }
        }

        // 如果不是第一条消息，先延迟（模拟打字时间）
        if (i > 0) {
          const delay = this.calculateTypingDelay(message);
          logger.debug('[PhoneAPI] 模拟打字中...', delay, 'ms（字数:', message.content?.length || 0, '）');
          await this.sleep(delay);
        }

        // 触发回调（显示气泡）
        // ✅ 传入原始消息对象（包括recalled-pending），用于触发动画
        logger.debug('[PhoneAPI] 触发onMessageReceived回调，消息类型:', message.type);
        if (onMessageReceived) {
          try {
            await onMessageReceived(message);
            logger.debug('[PhoneAPI] 消息已显示');
          } catch (error) {
            logger.error('[PhoneAPI] onMessageReceived回调执行失败:', error);
            throw error;
          }
        } else {
          logger.warn('[PhoneAPI] onMessageReceived回调未定义！');
        }
      }

      // 清空待发送消息
      clearPendingMessages(contactId);

      // ✅ 触发生成完成事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-complete', {
        detail: { contactId }
      }));
      logger.debug('[PhoneAPI] 已触发 phone-ai-generation-complete 事件');

      // 完成回调（保持向后兼容）
      onComplete?.();

      logger.info('[PhoneAPI] 发送流程完成');

    } catch (error) {
      logger.error('[PhoneAPI] 发送失败:', error);

      // ✅ 保存错误信息到调试器
      const { saveDebugVersion } = await import('../messages/message-debug-ui.js');
      const errorText = `错误: ${error.message || error}\n\n完整错误信息:\n${JSON.stringify(error, null, 2)}`;
      saveDebugVersion(contactId, errorText);

      // ✅ 触发生成错误事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
        detail: { contactId, error: error.message || '发送失败' }
      }));
      logger.debug('[PhoneAPI] 已触发 phone-ai-generation-error 事件');

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
   * 调用API（支持流式和自定义配置）
   * 
   * @async
   * @param {Array<Object>} messages - messages数组（支持多种角色类型）
   * @param {Object} apiConfig - API配置对象
   * @param {AbortSignal} signal - 终止信号
   * @returns {Promise<string>} AI回复文本
   */
  async callAPIWithStreaming(messages, apiConfig, signal) {
    // 🔍 调试日志：记录传入的完整 apiConfig（完全照搬日记）
    logger.debug('[PhoneAPI.callAPIWithStreaming] === 自定义API调试开始 ===');
    logger.debug('[PhoneAPI.callAPIWithStreaming] 传入的 apiConfig:', JSON.stringify(apiConfig, null, 2));
    logger.debug('[PhoneAPI.callAPIWithStreaming] apiConfig.source:', apiConfig.source);
    logger.debug('[PhoneAPI.callAPIWithStreaming] apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, '(类型:', typeof apiConfig.baseUrl, ', 长度:', apiConfig.baseUrl?.length || 0, ')');
    logger.debug('[PhoneAPI.callAPIWithStreaming] apiConfig.model:', apiConfig.model);
    logger.debug('[PhoneAPI.callAPIWithStreaming] apiConfig.apiKey:', apiConfig.apiKey ? '已设置(已隐藏)' : '未设置');
    logger.debug('[PhoneAPI.callAPIWithStreaming] messages数组长度:', messages.length);

    // 获取当前使用的 API 源
    let currentSource;
    if (apiConfig.source === 'custom') {
      // 根据用户选择的格式映射到对应的 chat_completion_sources
      const formatMap = {
        'openai': chat_completion_sources.CUSTOM,
        'claude': chat_completion_sources.CLAUDE,
        'google': chat_completion_sources.MAKERSUITE,
        'openrouter': chat_completion_sources.OPENROUTER,
        'scale': chat_completion_sources.CUSTOM,
        'ai21': chat_completion_sources.AI21,
        'mistral': chat_completion_sources.MISTRALAI,
        'custom': 'auto'
      };

      const userFormat = apiConfig.format || 'openai';

      if (userFormat === 'custom') {
        currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
        logger.debug('[SendController] 自定义API - 自动检测模式，使用酒馆API源:', currentSource);
      } else {
        currentSource = formatMap[userFormat] || chat_completion_sources.CUSTOM;
        logger.debug('[PhoneAPI] 自定义API - 用户选择格式:', userFormat, '→ 映射到:', currentSource);
      }
    } else {
      currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
      logger.debug('[PhoneAPI] 使用酒馆API源:', currentSource);
    }

    let model = apiConfig.model;
    if (!model) {
      model = oai_settings.openai_model || 'gpt-4o-mini';
      logger.warn('[PhoneAPI.callAPIWithStreaming] 未设置模型，使用官方默认:', model);
    }
    logger.debug('[PhoneAPI.callAPIWithStreaming] 最终使用的 model:', model);

    // 读取 max_tokens 配置
    const maxTokensRaw = oai_settings.openai_max_tokens;
    const maxTokensNumber = Number(maxTokensRaw);
    const maxTokensFinal = maxTokensNumber || 2000;

    logger.info('[PhoneAPI.callAPIWithStreaming] max_tokens读取详情:');
    logger.info('  - 原始值 (oai_settings.openai_max_tokens):', maxTokensRaw, '类型:', typeof maxTokensRaw);
    logger.info('  - Number转换后:', maxTokensNumber);
    logger.info('  - 最终使用值:', maxTokensFinal, maxTokensFinal === 2000 ? '(使用默认值)' : '(使用用户配置)');

    const body = {
      type: 'quiet',
      messages: messages,
      model: model,
      stream: apiConfig.stream || false,
      chat_completion_source: currentSource,
      max_tokens: maxTokensFinal,
      temperature: Number(oai_settings.temp_openai) || 1.0,
      frequency_penalty: Number(oai_settings.freq_pen_openai) || 0,
      presence_penalty: Number(oai_settings.pres_pen_openai) || 0,
      top_p: Number(oai_settings.top_p_openai) || 1.0,
      use_makersuite_sysprompt: true,
      claude_use_sysprompt: true
    };

    if (apiConfig.source === 'custom') {
      logger.debug('[PhoneAPI.callAPIWithStreaming] 🔍 进入自定义API分支');
      logger.debug('[PhoneAPI.callAPIWithStreaming] 检查前 - apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, ', trim后:', `"${apiConfig.baseUrl?.trim()}"`);
      logger.debug('[PhoneAPI.callAPIWithStreaming] 检查前 - apiConfig.model:', `"${apiConfig.model}"`, ', trim后:', `"${apiConfig.model?.trim()}"`);

      // ✅ 修复：检查必填字段，避免传递空值导致 Invalid URL
      if (!apiConfig.baseUrl || !apiConfig.baseUrl.trim()) {
        const error = new Error('自定义API配置错误：缺少 API 端点 (Base URL)');
        logger.error('[PhoneAPI.callAPIWithStreaming]', error.message);
        logger.error('[PhoneAPI.callAPIWithStreaming] baseUrl 值:', apiConfig.baseUrl, ', 类型:', typeof apiConfig.baseUrl);
        throw error;
      }
      if (!apiConfig.model || !apiConfig.model.trim()) {
        const error = new Error('自定义API配置错误：缺少模型名称');
        logger.error('[PhoneAPI.callAPIWithStreaming]', error.message);
        logger.error('[PhoneAPI.callAPIWithStreaming] model 值:', apiConfig.model, ', 类型:', typeof apiConfig.model);
        throw error;
      }

      logger.debug('[PhoneAPI.callAPIWithStreaming] ✅ 验证通过，开始设置 API 端点');

      // 🔧 修复：chat_completion_source 为 "custom" 时，后端读取 custom_url 而不是 reverse_proxy
      // 所以需要同时设置两个字段
      body.reverse_proxy = apiConfig.baseUrl.trim();
      body.custom_url = apiConfig.baseUrl.trim();  // ← 关键：custom 源需要 custom_url
      logger.debug('[PhoneAPI.callAPIWithStreaming] body.reverse_proxy 已设置为:', `"${body.reverse_proxy}"`);
      logger.debug('[PhoneAPI.callAPIWithStreaming] body.custom_url 已设置为:', `"${body.custom_url}"`);

      if (apiConfig.apiKey) {
        body.proxy_password = apiConfig.apiKey.trim();
        logger.debug('[PhoneAPI.callAPIWithStreaming] body.proxy_password 已设置');
      }
    } else {
      logger.debug('[PhoneAPI.callAPIWithStreaming] 跳过自定义API分支 (source !== "custom")');
    }

    // 🔍 最终检查：记录 body 中的 reverse_proxy
    logger.debug('[PhoneAPI.callAPIWithStreaming] 最终 body.reverse_proxy:', body.reverse_proxy);
    logger.debug('[PhoneAPI.callAPIWithStreaming] 完整 body 对象:', JSON.stringify(body, null, 2));

    logger.info('[PhoneAPI.callAPIWithStreaming] 最终请求配置:', {
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
      logger.error('[PhoneAPI] API调用失败:', response.status, errorText);
      throw new Error(`API调用失败: ${response.status} ${errorText}`);
    }

    if (apiConfig.stream) {
      return await this.handleStreamResponse(response, signal, currentSource);
    } else {
      const data = await response.json();
      // ✅ 修复：使用 extractMessageFromData 自动适配各种 API 格式（OpenAI/Claude/Google AI等）
      const message = extractMessageFromData(data);
      return message || '';
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

    logger.debug('[PhoneAPI.handleStreamResponse] 使用API源解析流式响应:', currentSource);

    try {
      while (true) {
        if (signal.aborted) {
          logger.info('[PhoneAPI] 流式生成被中止');
          break;
        }

        const { done, value } = await reader.read();

        if (done || !value?.data || value.data === '[DONE]') {
          logger.debug('[PhoneAPI] 流式生成完成');
          break;
        }

        let parsed;
        try {
          parsed = JSON.parse(value.data);
        } catch (error) {
          logger.warn('[PhoneAPI] 解析SSE数据失败:', error);
          continue;
        }

        const chunk = getStreamingReply(parsed, state, {
          chatCompletionSource: currentSource
        });

        if (typeof chunk === 'string' && chunk) {
          fullText += chunk;
          logger.debug('[PhoneAPI] 收到文本块，当前长度:', fullText.length);
        }
      }

      return fullText;

    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) {
        logger.info('[PhoneAPI] 流式生成被中止，返回部分文本');
        return fullText;
      }

      throw error;

    } finally {
      try {
        reader.releaseLock?.();
      } catch (error) {
        logger.warn('[PhoneAPI] 释放读取器失败:', error);
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
   * @returns {Promise<void>}
   */
  async sendToAIWithToolCalling(contactId, onMessageReceived, onComplete, onError) {
    logger.info('[PhoneAPI.sendToAIWithToolCalling] 使用工具调用模式发送到AI:', contactId);

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

      // 构建 messages 数组（返回messages和编号映射表）
      const allPendingOps = getAllPendingOperations();
      const buildResult = await buildMessagesArray(contactId, allPendingOps.messages);
      const messages = buildResult.messages;
      const messageNumberMap = buildResult.messageNumberMap;

      logger.debug('[PhoneAPI] 工具调用模式 - messages 构建完成，共', messages.length, '条，编号映射表大小:', messageNumberMap.size);

      // 创建终止控制器
      this.currentAbortController = new AbortController();
      this.isGenerating = true;
      this.currentGeneratingContactId = contactId;  // ← 记录正在生成的联系人ID

      // ✅ 触发开始生成事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-start', {
        detail: { contactId }
      }));
      logger.debug('[PhoneAPI] 已触发 phone-ai-generation-start 事件（工具调用模式）');

      // 获取工具定义
      const tools = getToolDefinitions();
      logger.debug('[PhoneAPI] 工具定义已加载，共', tools.length, '个工具');

      // 调用 API（直接调用，不走 SillyTavern）
      const phoneSettings = this.getSettings();
      const apiSettings = phoneSettings.apiConfig || {};
      const format = apiSettings.customConfigs?.find(c => c.id === apiSettings.currentConfigId)?.format || 'openai';

      logger.info('[PhoneAPI] 使用工具调用，API格式:', format);

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
        logger.warn('[PhoneAPI] AI 未调用任何工具');
        onError?.('AI 未返回消息');
        return;
      }

      // 执行工具调用
      const executionResults = await executeToolCalls(toolCalls, contactId);

      logger.info('[PhoneAPI] 工具执行完成，共', executionResults.length, '条结果');

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
            logger.debug('[PhoneAPI] [工具调用] 模拟打字中...', delay, 'ms（字数:', message.content?.length || 0, '）');
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
      logger.debug('[PhoneAPI] 已触发 phone-ai-generation-complete 事件（工具调用模式）');

      // 完成回调（保持向后兼容）
      onComplete?.();

      logger.info('[PhoneAPI] 工具调用流程完成');

    } catch (error) {
      logger.error('[PhoneAPI] 工具调用失败:', error);

      // ✅ 触发生成错误事件
      document.dispatchEvent(new CustomEvent('phone-ai-generation-error', {
        detail: { contactId, error: error.message || '发送失败' }
      }));
      logger.debug('[PhoneAPI] 已触发 phone-ai-generation-error 事件（工具调用模式）');

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

    logger.info('[PhoneAPI.callDirectAPIWithTools] 调用第三方 API:', { baseUrl, model, format });

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

    logger.debug('[PhoneAPI] 请求 URL:', url);
    logger.debug('[PhoneAPI] 请求 body:', JSON.stringify(body, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[PhoneAPI] API 调用失败:', response.status, errorText);
      throw new Error(`API 调用失败: ${response.status}`);
    }

    const data = await response.json();
    logger.debug('[PhoneAPI] API 响应:', JSON.stringify(data, null, 2));

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
}
