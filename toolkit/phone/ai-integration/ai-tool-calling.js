/**
 * AI 工具调用（Function Calling）模块
 * @module phone/ai-integration/ai-tool-calling
 * 
 * @description
 * 实现真正的 Function Calling（OpenAI/Gemini API）
 * - 定义工具列表
 * - 解析工具调用
 * - 执行工具并返回结果
 */

import logger from '../../../logger.js';
import { saveChatMessage } from '../messages/message-chat-data.js';
import { loadContacts } from '../contacts/contact-list-data.js';

// ========================================
// [TOOLS] 工具定义
// ========================================

/**
 * 获取工具定义列表（OpenAI 格式）
 * 
 * @returns {Array<Object>} 工具定义数组
 */
export function getToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'phone_send_message',
        description: '发送一条消息到手机聊天界面。你扮演的角色用这个工具回复用户的消息。',
        parameters: {
          type: 'object',
          properties: {
            contact_name: {
              type: 'string',
              description: '你扮演的角色名字（如 Jerry Hickfang）。注意：这是角色自己的名字，不是用户的名字。'
            },
            message: {
              type: 'string',
              description: '要发送的消息内容'
            },
            message_type: {
              type: 'string',
              enum: ['text', 'emoji'],
              description: '消息类型：text=文字消息，emoji=表情消息'
            }
          },
          required: ['contact_name', 'message']
        }
      }
    }
  ];
}

/**
 * 将 OpenAI 工具定义转换为 Gemini 格式
 * 
 * @param {Array<Object>} openaiTools - OpenAI 格式的工具定义
 * @returns {Object} Gemini 格式的工具定义
 */
export function convertToolsToGemini(openaiTools) {
  const functionDeclarations = openaiTools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));

  return {
    functionDeclarations: functionDeclarations
  };
}

// ========================================
// [PARSE] 解析工具调用
// ========================================

/**
 * 从 OpenAI 响应中提取工具调用
 * 
 * @param {Object} response - OpenAI API 响应
 * @returns {Array<Object>|null} 工具调用数组，格式：[{ name, arguments }]
 */
export function extractToolCallsFromOpenAI(response) {
  try {
    const choice = response.choices?.[0];
    if (!choice) return null;

    const toolCalls = choice.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return null;

    logger.debug('[ToolCalling] 提取到', toolCalls.length, '个 OpenAI 工具调用');

    return toolCalls.map(call => ({
      id: call.id,
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments)
    }));
  } catch (error) {
    logger.error('[ToolCalling] 解析 OpenAI 工具调用失败:', error);
    return null;
  }
}

/**
 * 从 Gemini 响应中提取工具调用
 * 
 * @param {Object} response - Gemini API 响应
 * @returns {Array<Object>|null} 工具调用数组，格式：[{ name, arguments }]
 */
export function extractToolCallsFromGemini(response) {
  try {
    const candidate = response.candidates?.[0];
    if (!candidate) return null;

    const parts = candidate.content?.parts;
    if (!parts) return null;

    const functionCalls = parts.filter(part => part.functionCall);
    if (functionCalls.length === 0) return null;

    logger.debug('[ToolCalling] 提取到', functionCalls.length, '个 Gemini 工具调用');

    return functionCalls.map(part => ({
      name: part.functionCall.name,
      arguments: part.functionCall.args
    }));
  } catch (error) {
    logger.error('[ToolCalling] 解析 Gemini 工具调用失败:', error);
    return null;
  }
}

// ========================================
// [EXECUTE] 执行工具
// ========================================

/**
 * 执行工具调用
 * 
 * @async
 * @param {Array<Object>} toolCalls - 工具调用数组
 * @param {string} currentContactId - 当前聊天的联系人ID
 * @returns {Promise<Array<Object>>} 执行结果数组
 */
export async function executeToolCalls(toolCalls, currentContactId) {
  const results = [];

  for (const call of toolCalls) {
    logger.info('[ToolCalling] 执行工具:', call.name, '参数:', call.arguments);

    try {
      let result;

      switch (call.name) {
        case 'phone_send_message':
          result = await executeSendMessage(call.arguments, currentContactId);
          break;

        default:
          logger.warn('[ToolCalling] 未知工具:', call.name);
          result = { error: '未知工具' };
      }

      results.push({
        tool_call_id: call.id,
        name: call.name,
        result: result
      });

    } catch (error) {
      logger.error('[ToolCalling] 执行工具失败:', error);
      results.push({
        tool_call_id: call.id,
        name: call.name,
        result: { error: error.message }
      });
    }
  }

  return results;
}

/**
 * 执行发送消息工具
 * 
 * @async
 * @param {Object} args - 工具参数
 * @param {string} args.contact_name - 联系人姓名
 * @param {string} args.message - 消息内容
 * @param {string} [args.message_type='text'] - 消息类型
 * @param {string} currentContactId - 当前聊天的联系人ID
 * @returns {Promise<Object>} 执行结果
 */
async function executeSendMessage(args, currentContactId) {
  const { contact_name, message, message_type = 'text' } = args;

  // 匹配联系人ID
  const contacts = await loadContacts();
  const contact = contacts.find(c =>
    c.name === contact_name ||
    c.id === contact_name
  );

  if (!contact) {
    logger.warn('[ToolCalling] 找不到联系人:', contact_name);
    return { error: `找不到联系人：${contact_name}` };
  }

  // 保存消息到数据库
  const messageData = {
    sender: 'contact',
    content: message,
    time: Math.floor(Date.now() / 1000),
    type: message_type
  };

  await saveChatMessage(contact.id, messageData);

  logger.info('[ToolCalling] 消息已保存:', contact.name, '-', message.substring(0, 20));

  return {
    success: true,
    contact_id: contact.id,
    contact_name: contact.name,
    message: message,
    type: message_type
  };
}

