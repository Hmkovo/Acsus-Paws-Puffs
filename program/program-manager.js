/**
 * 节目单管理器 - 核心逻辑
 * 
 * @description
 * 从 JS-Slash-Runner 节目单脚本迁移，实现：
 * - 聊天级别变量存储（绑定到当前聊天文件）
 * - 消息事件监听
 * - 悬浮按钮管理
 * - 面板显示/隐藏
 */

// ========================================
// [IMPORT] SillyTavern 原生 API 导入
// ========================================

import {
  extension_settings,
  getContext,
  saveMetadataDebounced
} from '../../../../extensions.js';

import {
  chat,
  chat_metadata,
  eventSource,
  event_types,
  saveSettingsDebounced
} from '../../../../../script.js';

import {
  executeSlashCommandsWithOptions
} from '../../../../slash-commands.js';

import logger from '../logger.js';
import { updateBadge } from './program-manager-ui.js';

// ========================================
// [CONSTANTS] 常量定义
// ========================================

const EXT_ID = 'Acsus-Paws-Puffs';

// 面板和按钮 ID
const PANEL_ID = 'pp-panel';
const BTN_ID = 'pp-toggle-btn';

// 存储键名
const STORAGE_KEY_PROGRAM = 'program_history';

// 发送模板（从原版移植）
const SEND_TEMPLATE = {
  intro: '！请注意，暂停扮演，进行继承之前关系以及设定的故事展开。\n呈现故事，有关于 ',
  bridge: '\n\n你不会直接机械复述以上内容，而是有机地（适应性地）加入故事当中。对于创作元素本身，你不会加入过于复杂或者暗示复杂世界观阴谋论的解释，而是避免解释，作为起点延伸。\n\n扩展角度：\n',
  jsAppend: '\nhtml必须用上下```包裹，并且使用合理JavaScript点击信息层级的链接或者悬浮，让阅读有层次感，硬参数严禁min-height，要求background:transparent，容易阅读的对比手机用@media考虑小px字体。'
};

// ========================================
// [PARSE] 解析功能（从原版移植）
// ========================================

/**
 * 解析节目单（锚点扫描方式）
 * 支持所有格式，不依赖 <节目单> 标签（手机端正则会删除该标签）
 *
 * 扫描策略：
 * 1. 从 "topic": 锚点开始
 * 2. 到 "javascripts requirement": 或 "js requirement": 结束
 *
 * @param {string} text - 消息文本
 * @returns {Array|null} 节目数组或null
 */
function parseProgram(text) {
  if (!text) {
    addDebugLog('parseProgram', '消息为空', null);
    return null;
  }

  addDebugLog('parseProgram', '开始扫描消息', `长度: ${text.length}`);

  const programs = [];

  // 方法1：检查是否有 <节目单> 标签包裹的 JSON
  const programTagMatch = text.match(/<节目单>([\s\S]*?)<\/节目单>/);
  if (programTagMatch) {
    const jsonText = programTagMatch[1].trim();
    addDebugLog('parseProgram', '找到节目单标签', `内容长度: ${jsonText.length}`);

    try {
      const data = JSON.parse(jsonText);

      // 检查是否有 recommended_shots 数组
      if (data.recommended_shots && Array.isArray(data.recommended_shots)) {
        data.recommended_shots.forEach((item, index) => {
          if (item.topic && item.genre) {
            programs.push(item);
            addDebugLog('parseProgram', `解析推荐节目${index + 1}`, item.topic.substring(0, 30));
          }
        });
        addDebugLog('parseProgram', '从recommended_shots解析', `${programs.length}个节目`);
        return programs.length > 0 ? programs : null;
      }

      // 如果没有 recommended_shots，但本身是数组
      if (Array.isArray(data)) {
        data.forEach((item, index) => {
          if (item.topic && item.genre) {
            programs.push(item);
            addDebugLog('parseProgram', `解析节目${index + 1}`, item.topic.substring(0, 30));
          }
        });
        addDebugLog('parseProgram', '从数组解析', `${programs.length}个节目`);
        return programs.length > 0 ? programs : null;
      }
    } catch (e) {
      addDebugLog('parseProgram', 'JSON解析失败', e.message);
      // JSON 解析失败，继续用方法2
    }
  }

  // 方法2：原始的锚点扫描方式
  let searchStart = 0;

  // 结束标记模式（兼容两种写法）
  const endPatterns = [
    /"javascripts requirement":\s*"[YN]"/,
    /"js requirement":\s*"[YN]"/
  ];

  while (true) {
    // 查找 "topic": 锚点
    const topicPos = text.indexOf('"topic":', searchStart);
    if (topicPos === -1) {
      // 没找到更多 topic，结束
      break;
    }

    addDebugLog('parseProgram', '找到topic锚点', `位置: ${topicPos}`);

    // 从 topic 位置开始，查找最近的结束标记
    let contentEnd = -1;
    for (const pattern of endPatterns) {
      const match = pattern.exec(text.slice(topicPos));
      if (match) {
        const endPos = topicPos + match.index + match[0].length;
        if (contentEnd === -1 || endPos < contentEnd) {
          contentEnd = endPos;
        }
      }
    }

    if (contentEnd === -1) {
      // 没找到结束标记，跳过这个 topic，继续搜索
      addDebugLog('parseProgram', '未找到结束标记，跳过', null);
      searchStart = topicPos + 1;
      continue;
    }

    // 提取节目内容，构造完整的 JSON 对象
    const content = '{' + text.substring(topicPos, contentEnd) + '}';

    try {
      const obj = JSON.parse(content);
      if (obj.topic && obj.genre) {
        programs.push(obj);
        addDebugLog('parseProgram', '解析成功', obj.topic.substring(0, 30));
      } else {
        addDebugLog('parseProgram', '缺少必要字段，跳过', null);
      }
    } catch (e) {
      // JSON 解析失败，尝试提取必要字段
      const topicMatch = text.substring(topicPos, contentEnd).match(/"topic":\s*"([^"]*)"/);
      const genreMatch = text.substring(topicPos, contentEnd).match(/"genre":\s*"([^"]*)"/);
      const expansionMatch = text.substring(topicPos, contentEnd).match(/"expansion_angles":\s*"([^"]*)"/);
      const styleMatch = text.substring(topicPos, contentEnd).match(/"style":\s*"([^"]*)"/);

      if (topicMatch) {
        programs.push({
          topic: topicMatch[1],
          genre: genreMatch ? genreMatch[1] : '',
          expansion_angles: expansionMatch ? expansionMatch[1] : '',
          style: styleMatch ? styleMatch[1] : ''
        });
        addDebugLog('parseProgram', '提取字段成功', topicMatch[1].substring(0, 30));
      }
    }

    // 继续搜索下一个
    searchStart = contentEnd;
  }

  addDebugLog('parseProgram', '扫描完成', `${programs.length}个节目`);
  return programs.length > 0 ? programs : null;
}

/**
 * 生成发送内容
 * @param {Object} program - 节目对象
 * @param {boolean} useJs - 是否使用JS模板
 * @returns {string} 发送内容
 */
function generateSendContent(program, useJs) {
  let content = SEND_TEMPLATE.intro + (program.topic || '') + '。\n体裁：' + (program.genre || '') + SEND_TEMPLATE.bridge;
  content += (program.expansion_angles || '') + '\n\n风格：' + (program.style || '');

  // 如果有 word_count，追加预计篇幅
  if (program.word_count) {
    content += '\n\n预计篇幅：' + program.word_count;
  }

  // 如果有 notes，追加剧组备注
  if (program.notes) {
    content += '\n剧组备注：' + program.notes;
  }

  if (useJs) {
    content += SEND_TEMPLATE.jsAppend;
  }

  return content;
}

// ========================================
// [STATE] 模块状态
// ========================================

/** @type {Object} 模块状态 */
const state = {
  enabled: false,                    // 总开关
  floatingBtnEnabled: false,         // 悬浮按钮开关
  floatingBtnPosition: {              // 悬浮按钮位置
    x: window.innerWidth - 70,
    y: 100
  },
  isPanelOpen: false,                // 面板是否打开
  isSettingsMode: false,             // 设置模式
  currentProgram: null,              // 当前节目
  programHistory: [],                // 节目历史
  messageReceivedCallback: null,     // 消息监听回调
  settings: {                        // 用户设置
    scale: 1
  }
};

// ========================================
// [DEBUG] 调试日志
// ========================================

const MAX_LOGS = 50;

/** @type {Array} 调试日志数组 */
const debugLogs = [];

/**
 * 添加调试日志
 * @param {string} tag - 日志标签
 * @param {string} message - 日志消息
 * @param {*} data - 附加数据（可选）
 */
function addDebugLog(tag, message, data = null) {
  const log = {
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    tag,
    message,
    data: data !== null ? (typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200)) : null
  };
  debugLogs.unshift(log);
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.pop();
  }
}

/**
 * 获取格式化的日志文本
 * @returns {string} 格式化后的日志文本
 */
function getFormattedLogs() {
  return debugLogs.map(log => {
    let text = `[${log.time}] [${log.tag}] ${log.message}`;
    if (log.data) {
      text += `\n  数据: ${log.data}`;
    }
    return text;
  }).join('\n\n');
}

// ========================================
// [CORE] 核心函数
// ========================================

/**
 * 初始化节目单模块
 * 
 * @description
 * 加载设置，注册事件监听器
 */
export function initProgramManager() {
  logger.info('program', '[ProgramManager.init] 开始初始化节目单模块');

  // 加载设置
  loadSettings();

  // 注意：消息监听和悬浮按钮由 bindProgramToggle 根据开关状态决定是否创建
  // 防止未启用时也在后台运行

  logger.info('program', '[ProgramManager.init] 节目单模块初始化完成');
}

/**
 * 加载设置
 */
function loadSettings() {
  const settings = extension_settings[EXT_ID]?.program;
  if (settings) {
    state.enabled = settings.enabled ?? false;
    state.floatingBtnEnabled = settings.floatingBtnEnabled ?? false;
    state.floatingBtnPosition = settings.floatingBtnPosition ?? { x: window.innerWidth - 70, y: 100 };
  }

  // 加载 pp_settings (缩放比例) - 使用 localStorage
  try {
    const savedScale = localStorage.getItem('pp_scale');
    if (savedScale) {
      state.settings.scale = parseFloat(savedScale);
    }
  } catch (e) {
    logger.warn('program', '[ProgramManager] 加载缩放设置失败:', e.message);
  }

  // 应用设置到 CSS
  applySettings();

  logger.debug('program', '[ProgramManager.loadSettings] 设置已加载:', state);
}

/**
 * 保存设置
 */
function saveSettings() {
  if (!extension_settings[EXT_ID]) {
    extension_settings[EXT_ID] = {};
  }
  if (!extension_settings[EXT_ID].program) {
    extension_settings[EXT_ID].program = {};
  }
  extension_settings[EXT_ID].program.enabled = state.enabled;
  extension_settings[EXT_ID].program.floatingBtnEnabled = state.floatingBtnEnabled;
  extension_settings[EXT_ID].program.floatingBtnPosition = state.floatingBtnPosition;
  saveSettingsDebounced();
  logger.debug('program', '[ProgramManager.saveSettings] 设置已保存');
}

/**
 * 保存界面设置（缩放比例）
 */
function saveInterfaceSettings() {
  try {
    localStorage.setItem('pp_scale', state.settings.scale.toString());
    logger.info('program', '[ProgramManager.saveInterfaceSettings] 界面设置已保存: scale =', state.settings.scale);
  } catch (e) {
    logger.error('program', '[ProgramManager.saveInterfaceSettings] 保存失败:', e.message);
  }
}

/**
 * 应用设置到 CSS 变量
 */
function applySettings() {
  const scale = state.settings.scale || 1;
  document.documentElement.style.setProperty('--pp-scale', scale);
  logger.debug('program', '[ProgramManager.applySettings] CSS变量已设置: --pp-scale =', scale);
}

/**
 * 注册消息监听器
 * 
 * @description
 * 监听新消息事件，刷新数据
 */
function registerMessageListener() {
  state.messageReceivedCallback = () => {
    if (state.isPanelOpen) {
      refreshData();
    }
  };
  eventSource.on(event_types.MESSAGE_RECEIVED, state.messageReceivedCallback);
  logger.debug('program', '[ProgramManager.registerMessageListener] 消息监听器已注册');
}

/**
 * 清理消息监听器
 */
function destroyMessageListener() {
  if (state.messageReceivedCallback) {
    eventSource.removeListener(event_types.MESSAGE_RECEIVED, state.messageReceivedCallback);
    state.messageReceivedCallback = null;
    logger.debug('program', '[ProgramManager.destroyMessageListener] 消息监听器已清理');
  }
}

/**
 * 刷新数据
 *
 * @description
 * 从聊天元数据中读取节目历史，并自动解析最新消息中的节目
 */
function refreshData() {
  addDebugLog('refreshData', '开始刷新数据', null);

  // 获取最新消息
  let latestMessage = null;
  if (chat && chat.length > 0) {
    latestMessage = chat[chat.length - 1];
  }

  if (latestMessage) {
    // SillyTavern 消息内容在 .mes 属性中
    const rawMessage = latestMessage.mes || '';
    const messagePreview = rawMessage.substring(0, 200).replace(/\n/g, '\\n');
    addDebugLog('refreshData', '消息内容(前200字符)', messagePreview);
    addDebugLog('refreshData', '获取消息', `数量: ${chat.length}`);

    // 解析节目
    const program = parseProgram(rawMessage);
    addDebugLog('refreshData', '解析结果', program ? `${program.length}个节目` : 'null');

    if (program && program.length > 0) {
      state.currentProgram = program;
      addDebugLog('refreshData', '设置currentProgram', program[0].topic);

      // 从元数据读取历史
      const variables = chat_metadata.variables || {};
      let history = variables[STORAGE_KEY_PROGRAM] || [];

      // 检查并保存每个节目（每个节目单独检查是否已存在）
      let savedCount = 0;
      program.forEach(p => {
        const exists = history.some(
          existing => existing.topic === p.topic
        );
        if (!exists) {
          history.unshift({
            ...p,
            timestamp: Date.now()
          });
          savedCount++;
        }
      });

      if (savedCount > 0) {
        // 保存到元数据
        if (!chat_metadata.variables) {
          chat_metadata.variables = {};
        }
        chat_metadata.variables[STORAGE_KEY_PROGRAM] = history;
        saveMetadataDebounced();
        addDebugLog('refreshData', '保存到历史', `${savedCount}个新节目`);
      }

      state.programHistory = history;
    } else {
      // 无解析结果时也从元数据读取
      const variables = chat_metadata.variables || {};
      state.programHistory = variables[STORAGE_KEY_PROGRAM] || [];
      addDebugLog('refreshData', '未解析到节目，使用历史', `${state.programHistory.length}个`);
    }
  } else {
    // 无消息时从元数据读取
    const variables = chat_metadata.variables || {};
    state.programHistory = variables[STORAGE_KEY_PROGRAM] || [];
    addDebugLog('refreshData', '无消息，使用历史', `${state.programHistory.length}个`);
  }

  // 更新徽章
  const currentCount = state.programHistory.length > 0 ? state.programHistory.length : 0;
  updateBadge(currentCount);

  addDebugLog('Data', '刷新数据', `节目数量: ${state.programHistory.length}`);
  logger.debug('program', '[ProgramManager.refreshData] 数据已刷新，节目数量:', state.programHistory.length);
}

// ========================================
// [DATA] 数据操作
// ========================================

/**
 * 获取节目历史
 * 
 * @returns {Array} 节目历史数组
 */
export function getProgramHistory() {
  // 直接返回内存中的历史，不触发 refreshData()
  // refreshData() 只在打开面板时调用，避免覆盖从历史加载的当前节目
  return state.programHistory;
}

/**
 * 保存节目历史
 * 
 * @param {Array} history - 节目历史数组
 */
function saveProgramHistory(history) {
  state.programHistory = history;

  // 保存到 chat_metadata.variables
  if (!chat_metadata.variables) {
    chat_metadata.variables = {};
  }
  chat_metadata.variables[STORAGE_KEY_PROGRAM] = history;
  saveMetadataDebounced();

  addDebugLog('Data', '保存历史', `数量: ${history.length}`);
  logger.info('program', '[ProgramManager.saveProgramHistory] 节目历史已保存，数量:', history.length);
}

/**
 * 添加节目
 * 
 * @param {Object} program - 节目对象
 */
export function addProgram(program) {
  const history = getProgramHistory();
  history.unshift({
    ...program,
    timestamp: Date.now()
  });
  saveProgramHistory(history);
  toastr.success('已添加: ' + program.topic);
  addDebugLog('Action', '添加节目', program.topic);
  logger.info('program', '[ProgramManager.addProgram] 已添加节目:', program.topic);
}

/**
 * 删除节目
 * 
 * @param {number} index - 节目索引
 */
export function deleteProgram(index) {
  const history = getProgramHistory();
  const deleted = history.splice(index, 1)[0];
  saveProgramHistory(history);
  toastr.warning('已删除');
  addDebugLog('Action', '删除节目', deleted?.topic || '未知');
  logger.info('program', '[ProgramManager.deleteProgram] 已删除节目:', deleted?.topic);
}

/**
 * 获取当前节目
 * 
 * @returns {Object|null} 当前节目或 null
 */
export function getCurrentProgram() {
  return state.currentProgram;
}

/**
 * 设置当前节目
 * 
 * @param {Object} program - 节目对象
 */
export function setCurrentProgram(program) {
  // 如果传入的是单个节目，包装成数组
  if (program && !Array.isArray(program)) {
    state.currentProgram = [program];
  } else {
    state.currentProgram = program;
  }
  logger.debug('program', '[ProgramManager.setCurrentProgram] 当前节目:', program?.topic || program?.[0]?.topic);
}

// ========================================
// [MESSAGE] 消息发送
// ========================================

/**
 * 发送节目内容
 *
 * @param {string|Object} contentOrProgram - 要发送的内容或节目对象
 * @param {boolean} [useJs=false] - 是否使用JS模板
 * @returns {Promise<boolean>} 是否发送成功
 */
export async function sendProgram(contentOrProgram, useJs = false) {
  let content = '';

  // 如果传入的是对象（节目对象），使用模板生成内容
  if (contentOrProgram && typeof contentOrProgram === 'object' && contentOrProgram.topic) {
    const program = contentOrProgram;
    content = generateSendContent(program, useJs);
    addDebugLog('Action', '生成发送内容', `topic: ${program.topic}, useJs: ${useJs}`);
  } else {
    // 兼容旧调用方式（直接传字符串）
    content = contentOrProgram;
  }

  if (!content) {
    logger.warn('program', '[ProgramManager.sendProgram] 内容为空');
    return false;
  }

  try {
    // 方法1：使用 slash command
    await executeSlashCommandsWithOptions('/send ' + content);
    toastr.success('已发送: ' + (state.currentProgram?.topic || '节目'));
    addDebugLog('Action', '发送节目', content.substring(0, 30));
    logger.info('program', '[ProgramManager.sendProgram] 消息已发送:', content.substring(0, 50));
    return true;
  } catch (error) {
    logger.error('program', '[ProgramManager.sendProgram] 发送失败:', error.message);

    // 方法2：回退到直接操作输入框
    try {
      const input = document.querySelector('#send_textarea');
      if (input) {
        input.value = content;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // 模拟点击发送按钮
        const sendBtn = document.querySelector('#send_but');
        if (sendBtn) {
          sendBtn.click();
        }
        toastr.success('已发送: ' + (state.currentProgram?.topic || '节目'));
        addDebugLog('Action', '发送节目(回退)', content.substring(0, 30));
        return true;
      }
    } catch (e) {
      logger.error('program', '[ProgramManager.sendProgram] 回退发送也失败:', e.message);
    }

    toastr.error('发送失败');
    return false;
  }
}

/**
 * 获取最新一条聊天消息
 * 
 * @returns {Object|null} 最新消息或 null
 */
export function getLatestMessage() {
  if (chat && chat.length > 0) {
    return chat[chat.length - 1];
  }
  return null;
}

// ========================================
// [PANEL] 面板管理
// ========================================

/**
 * 切换面板显示
 */
export function toggleProgramPanel() {
  state.isPanelOpen = !state.isPanelOpen;

  // 面板容器 ID（外层容器）
  const containerId = 'pp-container';
  const container = document.getElementById(containerId);

  if (container) {
    if (state.isPanelOpen) {
      container.style.display = 'block';
      // 添加展开动画
      const panel = container.querySelector('.pp-panel');
      if (panel) {
        panel.style.animation = 'none';
        panel.offsetHeight; // 强制重绘
        panel.style.animation = 'ppReveal 0.35s ease forwards';
      }
      refreshData();
      // 通知 UI 模块刷新
      if (typeof window.refreshProgramPanel === 'function') {
        window.refreshProgramPanel();
      }
    } else {
      container.style.display = 'none';
    }
    logger.debug('program', '[ProgramManager.toggleProgramPanel] 面板状态:', state.isPanelOpen);
  } else {
    logger.warn('program', '[ProgramManager.toggleProgramPanel] 找不到面板容器 #pp-container');
  }
}

/**
 * 打开面板
 */
export function openProgramPanel() {
  if (!state.isPanelOpen) {
    toggleProgramPanel();
  }
}

/**
 * 关闭面板
 */
export function closeProgramPanel() {
  if (state.isPanelOpen) {
    toggleProgramPanel();
  }
}

/**
 * 检查面板是否打开
 * 
 * @returns {boolean} 面板是否打开
 */
export function isProgramPanelOpen() {
  return state.isPanelOpen;
}

// ========================================
// [FLOATING BUTTON] 悬浮按钮管理
// ========================================

/**
 * 创建悬浮按钮
 */
export function createProgramFloatingBtn() {
  // 如果已存在，先删除
  const existingBtn = document.getElementById(BTN_ID);
  if (existingBtn) {
    existingBtn.remove();
  }

  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.className = 'pp-toggle-btn';
  btn.innerHTML = '<i class="fa-solid fa-cat"></i><span class="badge" style="display:none">0</span>';
  btn.title = '打开节目单';

  // 设置位置
  btn.style.left = `${state.floatingBtnPosition.x}px`;
  btn.style.top = `${state.floatingBtnPosition.y}px`;
  btn.style.display = state.floatingBtnEnabled ? 'flex' : 'none';

  // 绑定事件
  bindFloatingBtnEvents(btn);

  // 监听窗口缩放
  window.addEventListener('resize', constrainFloatingBtnPosition);

  // 添加到 body
  document.body.appendChild(btn);

  logger.info('program', '[ProgramManager.createProgramFloatingBtn] 悬浮按钮已创建');
}

/**
 * 绑定悬浮按钮事件
 * 
 * @param {HTMLElement} btn - 悬浮按钮元素
 */
function bindFloatingBtnEvents(btn) {
  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;

  const DRAG_THRESHOLD = 5;

  // 点击切换面板
  btn.addEventListener('click', (e) => {
    if (hasMoved) {
      hasMoved = false;
      return;
    }
    toggleProgramPanel();
  });

  // 拖动开始
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;

    // 获取按钮当前位置（从 style 读取，或从 offset）
    const rect = btn.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    currentX = initialX;
    currentY = initialY;

    btn.setPointerCapture(e.pointerId);
    btn.classList.add('dragging');
  });

  // 拖动中 - 直接更新，不用 requestAnimationFrame
  btn.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    e.preventDefault();

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // 超过阈值才算拖动
    if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
      hasMoved = true;
    }

    if (hasMoved) {
      // 直接计算新位置
      let newX = initialX + deltaX;
      let newY = initialY + deltaY;

      // 限制在窗口内
      const maxX = window.innerWidth - btn.offsetWidth;
      const maxY = window.innerHeight - btn.offsetHeight;

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      // 直接设置位置（不使用 transform）
      btn.style.left = `${newX}px`;
      btn.style.top = `${newY}px`;

      // 同步移动面板位置（保持在按钮下方 50px）
      const container = document.getElementById('pp-container');
      if (container) {
        container.style.left = `${newX}px`;
        container.style.top = `${newY + 50}px`;
      }

      // 更新当前位置
      currentX = newX;
      currentY = newY;
    }
  });

  // 拖动结束
  btn.addEventListener('pointerup', (e) => {
    if (!isDragging) return;

    e.preventDefault();
    isDragging = false;

    if (btn.hasPointerCapture(e.pointerId)) {
      btn.releasePointerCapture(e.pointerId);
    }

    btn.classList.remove('dragging');

    // 保存位置
    if (hasMoved) {
      state.floatingBtnPosition = {
        x: currentX,
        y: currentY
      };
      saveSettings();
      logger.debug('program', '[ProgramManager.bindFloatingBtnEvents] 悬浮按钮位置已保存:', currentX, currentY);
    }

    setTimeout(() => {
      hasMoved = false;
    }, 100);
  });

  // 取消拖动
  btn.addEventListener('pointercancel', (e) => {
    isDragging = false;
    btn.classList.remove('dragging');
  });
}

/**
 * 限制悬浮按钮在窗口内
 */
function constrainFloatingBtnPosition() {
  const btn = document.getElementById(BTN_ID);
  if (!btn || btn.style.display === 'none') return;

  const maxX = window.innerWidth - btn.offsetWidth;
  const maxY = window.innerHeight - btn.offsetHeight;

  let currentX = btn.offsetLeft;
  let currentY = btn.offsetTop;

  currentX = Math.max(0, Math.min(currentX, maxX));
  currentY = Math.max(0, Math.min(currentY, maxY));

  btn.style.left = `${currentX}px`;
  btn.style.top = `${currentY}px`;

  state.floatingBtnPosition = {
    x: currentX,
    y: currentY
  };
}

/**
 * 启用悬浮按钮
 */
export function enableProgramFloatingBtn() {
  state.floatingBtnEnabled = true;
  saveSettings();

  if (!document.getElementById(BTN_ID)) {
    createProgramFloatingBtn();
  } else {
    const btn = document.getElementById(BTN_ID);
    btn.style.display = 'flex';
  }

  toastr.success('悬浮按钮已启用');
  logger.info('program', '[ProgramManager.enableProgramFloatingBtn] 悬浮按钮已启用');
}

/**
 * 禁用悬浮按钮
 */
export function disableProgramFloatingBtn() {
  state.floatingBtnEnabled = false;
  saveSettings();

  const btn = document.getElementById(BTN_ID);
  if (btn) {
    btn.style.display = 'none';
  }

  toastr.info('悬浮按钮已隐藏');
  logger.info('program', '[ProgramManager.disableProgramFloatingBtn] 悬浮按钮已禁用');
}

// ========================================
// [TOGGLE] 开关管理
// ========================================

/**
 * 启用节目单
 *
 * @description
 * 总开关开启：注册消息监听 + 创建悬浮按钮
 */
export function enableProgram() {
  state.enabled = true;
  saveSettings();

  // 注册消息监听（如果还没注册）
  if (!state.messageReceivedCallback) {
    registerMessageListener();
  }

  // 创建悬浮按钮
  createProgramFloatingBtn();

  logger.info('program', '[ProgramManager.enableProgram] 节目单已启用');
}

/**
 * 禁用节目单
 *
 * @description
 * 总开关关闭：关闭面板 + 销毁悬浮按钮 + 清理消息监听，后台完全停止运行
 */
export function disableProgram() {
  state.enabled = false;
  saveSettings();

  // 关闭面板
  closeProgramPanel();

  // 销毁悬浮按钮（彻底移除，不只是隐藏）
  const btn = document.getElementById(BTN_ID);
  if (btn) {
    btn.remove();
  }

  // 清理消息监听
  destroyMessageListener();

  logger.info('program', '[ProgramManager.disableProgram] 节目单已禁用，后台已停止');
}

/**
 * 绑定设置开关
 * 
 * @description
 * 由 index.js 在设置面板加载后调用
 */
export function bindProgramToggle() {
  // 绑定总开关（唯一的开关：开=启用功能+显示按钮，关=停止后台+销毁按钮）
  const enabledCheckbox = document.getElementById('program-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.checked = state.enabled;

    enabledCheckbox.addEventListener('change', function () {
      const newState = this.checked;
      if (newState) {
        enableProgram();
      } else {
        disableProgram();
      }
    });

    logger.debug('program', '[ProgramManager.bindProgramToggle] 总开关已绑定');
  }

  // 如果已启用，创建悬浮按钮并注册监听
  if (state.enabled) {
    if (!state.messageReceivedCallback) {
      registerMessageListener();
    }
    createProgramFloatingBtn();
  }
}

// ========================================
// [DESTROY] 销毁模块
// ========================================

/**
 * 销毁节目单模块
 * 
 * @description
 * 清理所有监听器和 DOM 元素
 */
export function destroyProgramManager() {
  logger.info('program', '[ProgramManager.destroy] 开始销毁节目单模块');

  // 清理消息监听
  destroyMessageListener();

  // 移除悬浮按钮
  const btn = document.getElementById(BTN_ID);
  if (btn) {
    btn.remove();
  }

  // 移除面板
  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    panel.remove();
  }

  logger.info('program', '[ProgramManager.destroy] 节目单模块已销毁');
}

// ========================================
// [EXPORT] 导出状态（供 UI 使用）
// ========================================

/**
 * 获取模块状态
 * 
 * @returns {Object} 模块状态
 */
export function getState() {
  return state;
}

// ========================================
// [VIEW] 视图切换
// ========================================

/**
 * 切换到设置页面
 */
export function switchToSettings() {
  state.isSettingsMode = true;

  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  // 隐藏标签栏
  const tabBar = panel.querySelector('.pp-tab-bar');
  if (tabBar) {
    tabBar.style.display = 'none';
  }

  // 隐藏当前节目和历史内容
  const contentArea = document.getElementById('pp-content-area');
  if (contentArea) {
    const currentContent = contentArea.querySelector('#pp-current-content');
    const historyContent = contentArea.querySelector('#pp-history-content');
    if (currentContent) currentContent.style.display = 'none';
    if (historyContent) historyContent.style.display = 'none';
  }

  // 显示设置内容
  let settingsContent = panel.querySelector('.pp-settings-page');
  if (!settingsContent) {
    // 创建设置内容
    settingsContent = createSettingsContent();
    contentArea.appendChild(settingsContent);
  }
  settingsContent.style.display = 'block';

  // 修改标题
  const title = panel.querySelector('.pp-curtain-title');
  if (title) {
    title.textContent = '设置';
  }

  // 修改设置按钮为返回图标
  const settingsBtn = panel.querySelector('.pp-header-btn');
  if (settingsBtn) {
    settingsBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
    settingsBtn.title = '返回';
  }

  // 渲染日志
  setTimeout(() => renderSettingsLogs(), 50);

  logger.info('program', '[ProgramManager] 切换到设置页面');
}

/**
 * 切换到主页面
 */
export function switchToMain() {
  state.isSettingsMode = false;

  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  // 显示标签栏
  const tabBar = panel.querySelector('.pp-tab-bar');
  if (tabBar) {
    tabBar.style.display = 'flex';
  }

  // 隐藏设置内容
  const settingsContent = panel.querySelector('.pp-settings-page');
  if (settingsContent) {
    settingsContent.style.display = 'none';
  }

  // 显示当前节目内容
  const contentArea = document.getElementById('pp-content-area');
  if (contentArea) {
    const currentContent = contentArea.querySelector('#pp-current-content');
    if (currentContent) currentContent.style.display = 'block';
  }

  // 恢复标题
  const title = panel.querySelector('.pp-curtain-title');
  if (title) {
    title.textContent = '节目单';
  }

  // 恢复设置按钮图标
  const settingsBtn = panel.querySelector('.pp-header-btn');
  if (settingsBtn) {
    settingsBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
    settingsBtn.title = '设置';
  }

  logger.info('program', '[ProgramManager] 切换到主页面');
}

/**
 * 创建设置页面内容
 */
function createSettingsContent() {
  const settingsPage = document.createElement('div');
  settingsPage.className = 'pp-settings-page';
  settingsPage.style.display = 'none';
  settingsPage.innerHTML = `
    <div class="pp-settings-group">
      <label class="pp-settings-label">界面大小 (缩放比例)</label>
      <input type="number" class="pp-settings-input" id="pp-scale-input"
        value="${state.settings.scale}" step="0.1" min="0.6" max="1.5">
    </div>
    <div class="pp-settings-group">
      <button class="pp-batch-btn" id="pp-save-settings-btn">
        <i class="fa-solid fa-floppy-disk"></i> 保存设置
      </button>
    </div>
    <hr style="border-color: rgba(240,218,171,0.2); margin: 20px 0;">
    <div class="pp-settings-group">
      <label class="pp-settings-label">
        调试日志 
        <button class="pp-header-btn" id="pp-clear-logs-btn" title="清空">
          <i class="fa-solid fa-trash"></i>
        </button>
      </label>
      <textarea class="pp-settings-input" id="pp-debug-logs" style="height: 200px; resize: vertical;" readonly></textarea>
      <button class="pp-batch-btn" id="pp-copy-logs-btn" style="margin-top: 8px;">
        <i class="fa-solid fa-copy"></i> 复制日志
      </button>
    </div>
  `;

  // 绑定事件 - 保存设置
  const saveBtn = settingsPage.querySelector('#pp-save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const scaleInput = settingsPage.querySelector('#pp-scale-input');
      if (scaleInput) {
        state.settings.scale = parseFloat(scaleInput.value) || 1;
        saveInterfaceSettings();
        applySettings();
        toastr.success('设置已保存');
        addDebugLog('Settings', '保存设置', `scale = ${state.settings.scale}`);
      }
    });
  }

  // 绑定事件 - 清空日志
  const clearLogsBtn = settingsPage.querySelector('#pp-clear-logs-btn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      debugLogs.length = 0;
      renderSettingsLogs();
      addDebugLog('Settings', '日志已清空');
    });
  }

  // 绑定事件 - 复制日志
  const copyLogsBtn = settingsPage.querySelector('#pp-copy-logs-btn');
  if (copyLogsBtn) {
    copyLogsBtn.addEventListener('click', async () => {
      const logsText = getFormattedLogs();
      try {
        await navigator.clipboard.writeText(logsText);
        toastr.success('日志已复制到剪贴板');
        addDebugLog('Settings', '日志已复制');
      } catch (e) {
        toastr.warning('复制失败，请手动复制');
      }
    });
  }

  // 初始渲染日志
  setTimeout(() => renderSettingsLogs(), 100);

  return settingsPage;
}

/**
 * 渲染设置页面的日志
 */
function renderSettingsLogs() {
  const logsTextarea = document.getElementById('pp-debug-logs');
  if (logsTextarea) {
    logsTextarea.value = getFormattedLogs();
  }
}
