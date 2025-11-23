/**
 * API 格式转换器（基于 SillyTavern 官方转换器）
 * @module phone/ai-integration/ai-format-converter
 * 
 * @description
 * 将 OpenAI 通用格式转换为各 API 的原生格式
 * 
 * @version 1.0.0
 * @source SillyTavern src/prompt-converters.js
 * @lastSync 2025-01-22
 * 
 * 同步说明：
 * - convertGooglePrompt: src/prompt-converters.js L425-574
 * - convertClaudeMessages: src/prompt-converters.js L190-361
 * - tryParse: src/util.js
 */

import logger from '../../../logger.js';

// ==================== 工具函数 ====================

/**
 * 安全解析 JSON
 * （从 SillyTavern/src/util.js 复制）
 * 
 * @param {string} str - JSON 字符串
 * @returns {any} 解析结果，失败返回 undefined
 */
function tryParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return undefined;
    }
}

// ==================== Gemini 转换器 ====================

/**
 * 转换为 Google Gemini 格式
 * （从 SillyTavern/src/prompt-converters.js L425-574 复制）
 * 
 * @param {Array<Object>} messages - OpenAI 格式的消息数组
 * @param {string} _model - 模型名称（保留参数名与官方一致）
 * @param {boolean} useSysPrompt - 是否使用系统提示
 * @param {Object} names - 提示名称对象（可选）
 * @returns {{contents: Array, system_instruction: Object}} Gemini 格式的提示
 */
export function convertGooglePrompt(messages, _model, useSysPrompt, names = {}) {
    // 为 names 提供默认值（兼容官方代码）
    names = names || {
        userName: '',
        charName: '',
        groupNames: [],
        startsWithGroupName: () => false
    };

    const sysPrompt = [];

    if (useSysPrompt) {
        while (messages.length > 1 && messages[0].role === 'system') {
            // Append example names if not already done by the frontend (e.g. for group chats).
            if (names.userName && messages[0].name === 'example_user') {
                if (!messages[0].content.startsWith(`${names.userName}: `)) {
                    messages[0].content = `${names.userName}: ${messages[0].content}`;
                }
            }
            if (names.charName && messages[0].name === 'example_assistant') {
                if (!messages[0].content.startsWith(`${names.charName}: `) && !names.startsWithGroupName(messages[0].content)) {
                    messages[0].content = `${names.charName}: ${messages[0].content}`;
                }
            }
            sysPrompt.push(messages[0].content);
            messages.shift();
        }
    }

    const system_instruction = { parts: sysPrompt.map(text => ({ text })) };
    const toolNameMap = {};

    const contents = [];
    messages.forEach((message, index) => {
        // fix the roles
        if (message.role === 'system' || message.role === 'tool') {
            message.role = 'user';
        } else if (message.role === 'assistant') {
            message.role = 'model';
        }

        // Convert the content to an array of parts
        if (!Array.isArray(message.content)) {
            const content = (() => {
                const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
                const hasToolCallId = typeof message.tool_call_id === 'string' && message.tool_call_id.length > 0;

                if (hasToolCalls) {
                    return { type: 'tool_calls', tool_calls: message.tool_calls };
                }

                if (hasToolCallId) {
                    return { type: 'tool_call_id', tool_call_id: message.tool_call_id, content: String(message.content ?? '') };
                }

                return { type: 'text', text: String(message.content ?? '') };
            })();
            message.content = [content];
        }

        // similar story as claude
        if (message.name) {
            message.content.forEach((part) => {
                if (part.type !== 'text') {
                    return;
                }
                if (message.name === 'example_user') {
                    if (names.userName && !part.text.startsWith(`${names.userName}: `)) {
                        part.text = `${names.userName}: ${part.text}`;
                    }
                } else if (message.name === 'example_assistant') {
                    if (names.charName && !part.text.startsWith(`${names.charName}: `) && !names.startsWithGroupName(part.text)) {
                        part.text = `${names.charName}: ${part.text}`;
                    }
                } else {
                    if (!part.text.startsWith(`${message.name}: `)) {
                        part.text = `${message.name}: ${part.text}`;
                    }
                }
            });

            delete message.name;
        }

        //create the prompt parts
        const parts = [];
        message.content.forEach((part) => {
            if (part.type === 'text') {
                parts.push({ text: part.text });
            } else if (part.type === 'tool_call_id') {
                const name = toolNameMap[part.tool_call_id] ?? 'unknown';
                parts.push({
                    functionResponse: {
                        name: name,
                        response: { name: name, content: part.content },
                    },
                });
            } else if (part.type === 'tool_calls') {
                part.tool_calls.forEach((toolCall) => {
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args: tryParse(toolCall.function.arguments) ?? toolCall.function.arguments,
                        },
                    });

                    toolNameMap[toolCall.id] = toolCall.function.name;
                });
            } else if (part.type === 'image_url') {
                const mimeType = part.image_url.url.split(';')[0].split(':')[1];
                const base64Data = part.image_url.url.split(',')[1];
                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data,
                    },
                });
            } else if (part.type === 'video_url') {
                const videoUrl = part.video_url?.url;
                if (videoUrl && videoUrl.startsWith('data:')) {
                    const [header, data] = videoUrl.split(',');
                    const mimeType = header.match(/data:([^;]+)/)?.[1] || 'video/mp4';

                    parts.push({
                        inlineData: {
                            mimeType: mimeType,
                            data: data,
                        },
                    });
                }
            }
        });

        // merge consecutive messages with the same role
        if (index > 0 && message.role === contents[contents.length - 1].role) {
            parts.forEach((part) => {
                if (part.text) {
                    const textPart = contents[contents.length - 1].parts.find(p => typeof p.text === 'string');
                    if (textPart) {
                        textPart.text += '\n\n' + part.text;
                    } else {
                        contents[contents.length - 1].parts.push(part);
                    }
                }
                if (part.inlineData || part.functionCall || part.functionResponse) {
                    contents[contents.length - 1].parts.push(part);
                }
            });
        } else {
            contents.push({
                role: message.role,
                parts: parts,
            });
        }
    });

    return { contents: contents, system_instruction: system_instruction };
}

// ==================== Claude 转换器 ====================

/**
 * 转换为 Claude 格式
 * （从 SillyTavern/src/prompt-converters.js L190-361 复制）
 * 
 * @param {Array<Object>} messages - OpenAI 格式的消息数组
 * @param {string} prefillString - 预填充字符串
 * @param {boolean} useSysPrompt - 是否使用系统提示
 * @param {boolean} useTools - 是否使用工具
 * @param {Object} names - 提示名称对象（可选）
 * @returns {{messages: Array, systemPrompt: Array}} Claude 格式的提示
 */
export function convertClaudeMessages(messages, prefillString, useSysPrompt, useTools, names = {}) {
    // 为 names 提供默认值
    names = names || {
        userName: '',
        charName: '',
        groupNames: [],
        startsWithGroupName: () => false
    };

    let systemPrompt = [];
    if (useSysPrompt) {
        // Collect all the system messages up until the first instance of a non-system message, and then remove them from the messages array.
        let i;
        for (i = 0; i < messages.length; i++) {
            if (messages[i].role !== 'system') {
                break;
            }
            // Append example names if not already done by the frontend (e.g. for group chats).
            if (names.userName && messages[i].name === 'example_user') {
                if (!messages[i].content.startsWith(`${names.userName}: `)) {
                    messages[i].content = `${names.userName}: ${messages[i].content}`;
                }
            }
            if (names.charName && messages[i].name === 'example_assistant') {
                if (!messages[i].content.startsWith(`${names.charName}: `) && !names.startsWithGroupName(messages[i].content)) {
                    messages[i].content = `${names.charName}: ${messages[i].content}`;
                }
            }
            systemPrompt.push({ type: 'text', text: messages[i].content, ...(messages[i].name && { cache_control: { type: 'ephemeral' } }) });
        }
        messages.splice(0, i);
    }

    // Wrap user messages in an array, if they're not already. Sometimes tool/Assistant messages may
    // not contain content, so we need to check for that as well.
    for (const message of messages) {
        if (!Array.isArray(message.content)) {
            message.content = message.content ? [{ type: 'text', text: String(message.content) }] : [];
        }
    }

    // Add prefill message to the end of messages array
    if (prefillString && !useTools) {
        messages.push({
            role: 'assistant',
            content: [{ type: 'text', text: prefillString }],
            // prefill is always in the last message, disable caching for it
            // eslint-disable-next-line no-undefined
            cache_control: undefined,
        });
    }

    let properMessages = messages;

    // If the first message is not a user message, we need to add a dummy user message.
    if (messages.length > 0 && messages[0].role !== 'user') {
        properMessages = [{ role: 'user', content: [{ type: 'text', text: 'system: System message was here' }] }, ...messages];
    }

    // Merge messages with the same role
    if (!useTools) {
        // Why would we not want to merge messages with the same role?
        // Because tool use does not allow more than one user message in a row.
        properMessages = mergeMessages(properMessages);
    }

    // Append names and check for missing types
    for (const message of properMessages) {
        if (message.name) {
            for (const content of message.content) {
                if (content.type === 'text') {
                    if (message.name === 'example_user') {
                        if (names.userName && !content.text.startsWith(`${names.userName}: `)) {
                            content.text = `${names.userName}: ${content.text}`;
                        }
                    } else if (message.name === 'example_assistant') {
                        if (names.charName && !content.text.startsWith(`${names.charName}: `) && !names.startsWithGroupName(content.text)) {
                            content.text = `${names.charName}: ${content.text}`;
                        }
                    } else {
                        if (!content.text.startsWith(`${message.name}: `)) {
                            content.text = `${message.name}: ${content.text}`;
                        }
                    }
                }
            }

            delete message.name;
        }

        for (const content of message.content) {
            if (!content.type) {
                content.type = 'text';
            }
        }
    }

    return { messages: properMessages, systemPrompt };
}

/**
 * 合并相同角色的连续消息（Claude 要求）
 * @private
 * @param {Array<Object>} messages - 消息数组
 * @returns {Array<Object>} 合并后的消息数组
 */
function mergeMessages(messages) {
    const merged = [];
    let currentMessage = null;

    for (const message of messages) {
        if (currentMessage && currentMessage.role === message.role) {
            // 合并到当前消息
            currentMessage.content.push(...message.content);
        } else {
            // 新消息
            if (currentMessage) {
                merged.push(currentMessage);
            }
            currentMessage = {
                role: message.role,
                content: [...message.content]
            };
        }
    }

    if (currentMessage) {
        merged.push(currentMessage);
    }

    return merged;
}

// ==================== 格式检测器 ====================

/**
 * 根据模型名称自动检测 API 格式
 * 
 * @param {string} model - 模型名称
 * @returns {string} API 格式（'google' | 'claude' | 'openai'）
 */
export function detectFormatFromModel(model) {
    if (!model) return 'openai';

    const modelLower = model.toLowerCase();

    // Gemini 系列
    if (modelLower.includes('gemini')) {
        logger.debug('[FormatConverter] 检测到 Gemini 模型，使用 google 格式');
        return 'google';
    }

    // Claude 系列
    if (modelLower.includes('claude')) {
        logger.debug('[FormatConverter] 检测到 Claude 模型，使用 claude 格式');
        return 'claude';
    }

    // 默认 OpenAI 兼容
    logger.debug('[FormatConverter] 使用默认 openai 格式');
    return 'openai';
}
