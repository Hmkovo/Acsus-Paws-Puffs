1/**
 * V2 变量列表页面 UI (Variable List UI V2)
 *
 * @description
 * V2 版本的变量管理界面，支持：
 * - 手机风格的可拖动窗口
 * - 套装选择和管理
 * - 条目列表（提示词 + 变量混合）
 * - 拖拽排序
 * - 发送预览和返回预览
 * - 变量详情页（叠加/覆盖模式）
 */

import logger from '../../logger.js';
import { getContext } from '../../../../../extensions.js';
import { eventSource, event_types } from '../../../../../../script.js';
import { getSuiteManager } from '../suite-manager.js';
import { getVariableManagerV2 } from '../variable-manager-v2.js';
import { getVariableAnalyzerV2 } from '../variable-analyzer-v2.js';
import { getTriggerManager } from '../trigger-manager.js';
import { getMacroProcessor } from '../macro-processor.js';
import { getChatContentProcessor } from '../chat-content-processor.js';
import { getSendQueueManager } from '../send-queue-manager.js';
import { openChatContentEditPopup, openRegexSettingsPopup } from './chat-content-ui.js';
import * as storage from '../variable-storage.js';

// ============================================
// 常量
// ============================================

const MENU_BUTTON_ID = 'variable-v2-menu-container';
const WINDOW_ID = 'var-v2-window';
const STORAGE_KEY = 'var_v2_window_position';

// ============================================
// 窗口状态
// ============================================

/** @type {HTMLElement|null} */
let windowElement = null;

/** @type {{x: number, y: number}|null} */
let savedPosition = null;

// ============================================
// 拖拽状态
// ============================================

/** @type {HTMLElement|null} */
let draggedItem = null;
/** @type {string|null} */
let draggedItemId = null;

// ============================================
// 第一部分：扩展栏设置页
// ============================================

/**
 * 渲染 V2 设置页面
 * @param {HTMLElement} container
 */
export async function renderVariableListPageV2(container) {
  if (!container) {
    logger.warn('variable', '[VariableListUIV2] 容器不存在');
    return;
  }

  const settings = await storage.getSettingsV2();
  container.innerHTML = buildSettingsHTML(settings.enabled);
  bindSettingsEvents(container);

  if (settings.enabled) {
    addExtensionsMenuButton();
  }

  logger.info('variable', '[VariableListUIV2] 设置页渲染完成');
}

/**
 * 构建设置页 HTML
 * @param {boolean} enabled
 * @returns {string}
 */
function buildSettingsHTML(enabled) {
  return `
        <div class="variable-settings-container">
            <div class="preset-setting-item">
                <label class="checkbox_label">
                    <input type="checkbox" id="variable-v2-enabled" ${enabled ? 'checked' : ''}>
                    <span>启用动态变量 V2</span>
                </label>
                <span class="preset-hint">V2 版本支持套装、条目列表、选择性引用等高级功能</span>
            </div>

            <h4 style="margin-top: 12px; color: var(--SmartThemeQuoteColor);">V2 新功能</h4>
            <ul class="preset-feature-list">
                <li><i class="fa-solid fa-layer-group"></i> <strong>提示词套装</strong>：多个提示词条目组合，支持不同触发方式</li>
                <li><i class="fa-solid fa-arrows-up-down"></i> <strong>条目列表</strong>：提示词和变量混合排列，自由拖拽排序</li>
                <li><i class="fa-solid fa-at"></i> <strong>选择性引用</strong>：{{变量@1-5}} 只引用部分条目</li>
                <li><i class="fa-solid fa-code-branch"></i> <strong>嵌套宏</strong>：{{变量@{{LastMessageId}}-5}}</li>
                <li><i class="fa-solid fa-tags"></i> <strong>标签解析</strong>：AI 返回 [标签]...[/标签] 自动分配</li>
                <li><i class="fa-solid fa-clone"></i> <strong>叠加/覆盖模式</strong>：变量值累积或替换</li>
            </ul>

            <h4 style="color: var(--SmartThemeQuoteColor);">使用方法</h4>
            <p>启用后点击扩展菜单的"变量V2"按钮打开管理面板。</p>
        </div>
    `;
}

/**
 * 绑定设置页事件
 * @param {HTMLElement} container
 */
function bindSettingsEvents(container) {
  const toggle = container.querySelector('#variable-v2-enabled');
  toggle?.addEventListener('change', async (e) => {
    const enabled = /** @type {HTMLInputElement} */ (e.target).checked;
    const settings = await storage.getSettingsV2();
    settings.enabled = enabled;
    await storage.saveSettingsV2(settings);

    if (enabled) {
      addExtensionsMenuButton();
      toastr.success('动态变量 V2 已启用');
    } else {
      removeExtensionsMenuButton();
      closeWindow();
      toastr.info('动态变量 V2 已禁用');
    }
  });
}

// ============================================
// 第二部分：extensionsMenu 按钮
// ============================================

/**
 * 添加 extensionsMenu 入口按钮
 */
export function addExtensionsMenuButton() {
  if (document.querySelector(`#${MENU_BUTTON_ID}`)) return;

  const menu = document.querySelector('#extensionsMenu');
  if (!menu) return;

  const btn = document.createElement('div');
  btn.id = MENU_BUTTON_ID;
  btn.className = 'extension_container interactable';
  btn.innerHTML = `
        <div class="list-group-item flex-container flexGap5 interactable" title="动态变量 V2">
            <div class="fa-fw fa-solid fa-layer-group extensionsMenuExtensionButton"></div>
            <span>变量V2</span>
        </div>
    `;
  btn.addEventListener('click', toggleWindow);
  menu.appendChild(btn);
  logger.info('variable', '[VariableListUIV2] 已添加菜单按钮');
}

/**
 * 移除 extensionsMenu 入口按钮
 */
export function removeExtensionsMenuButton() {
  document.querySelector(`#${MENU_BUTTON_ID}`)?.remove();
}

// ============================================
// 第三部分：窗口管理
// ============================================

/**
 * 切换窗口显示/隐藏
 */
function toggleWindow() {
  if (windowElement) {
    closeWindow();
  } else {
    openWindow();
  }
}

/**
 * 打开窗口
 */
async function openWindow() {
  if (windowElement) return;

  // 确保 V2 系统已初始化
  const { initVariables, isInitialized } = await import('../index.js');
  if (!isInitialized()) {
    logger.info('variable', '[VariableListUIV2] V2 系统未初始化，正在初始化...');
    const result = await initVariables();
    if (!result.success) {
      toastr.error('动态变量系统初始化失败');
      return;
    }
  }

  const suiteManager = getSuiteManager();
  const variableManager = getVariableManagerV2();

  // 确保变量管理器已初始化
  if (!variableManager.initialized) {
    await variableManager.init();
  }

  // 确保有默认套装
  let suites = suiteManager.getSuites();
  if (suites.length === 0) {
    suiteManager.createSuite({ name: '默认套装' });
    suites = suiteManager.getSuites();
  }

  // 获取激活套装，如果没有则使用第一个套装
  const activeSuite = suiteManager.getActiveSuite() || suites[0];

  // 确保 activeSuiteId 已设置（解决首次打开时 getActiveSuite() 返回 null 的问题）
  if (!suiteManager.getActiveSuite() && activeSuite) {
    suiteManager.setActiveSuite(activeSuite.id);
    logger.debug('variable', '[VariableListUIV2] 自动设置激活套装:', activeSuite.id);
  }

  const variables = variableManager.getDefinitions();

  // 创建窗口
  windowElement = document.createElement('div');
  windowElement.id = WINDOW_ID;
  windowElement.className = 'var-v2-window';
  windowElement.innerHTML = buildWindowHTML(suites, activeSuite, variables);

  document.body.appendChild(windowElement);

  // 恢复位置
  loadPosition();
  applyPosition();

  // 绑定事件
  bindWindowEvents();
  bindDragToMove();

  // 注册队列监听器，实时更新徽章
  const queueManager = getSendQueueManager();
  queueManager.addListener(onQueueChange);

  // 注册消息事件监听，刷新触发计数显示
  eventSource.on(event_types.MESSAGE_SENT, onMessageForBadge);
  eventSource.on(event_types.MESSAGE_RECEIVED, onMessageForBadge);

  // 注册任务完成事件监听，更新返回预览
  eventSource.on('paws_queue_task_complete', onTaskComplete);

  // 初始化徽章显示
  updateQueueBadge(queueManager.getLength());

  // 更新预览
  updatePreview();

  logger.info('variable', '[VariableListUIV2] 窗口已打开');
}

/**
 * 消息事件回调（用于刷新触发徽章）
 */
function onMessageForBadge() {
  // 延迟一点刷新，等触发管理器更新计数
  setTimeout(() => {
    refreshSuiteBadge();
  }, 100);
}

/**
 * 任务完成事件回调
 * @param {Object} data - 任务完成数据
 * @param {string} data.suiteId - 套装ID
 * @param {string} data.suiteName - 套装名称
 * @param {number} data.resultsCount - 解析结果数量
 * @param {number} data.assignedCount - 已分配数量
 * @param {string} data.rawResponse - AI 原始返回内容
 */
function onTaskComplete(data) {
  if (!windowElement) return;

  const suiteManager = getSuiteManager();
  const activeSuite = suiteManager.getActiveSuite();

  // 只有当完成的任务是当前套装时才更新返回预览
  if (activeSuite && activeSuite.id === data.suiteId) {
    // 更新返回预览区域
    if (data.rawResponse) {
      updateResponsePreview(data.rawResponse);
    }

    // 自动切换到"返回"标签页
    switchToTab('response-preview');

    // 刷新条目列表（变量值可能已更新）
    refreshItemsList();
  }

  logger.debug('variable', '[VariableListUIV2] 任务完成回调:', data.suiteName, '结果:', data.resultsCount);
}

/**
 * 切换到指定标签页
 * @param {'items' | 'send-preview' | 'response-preview'} tabName
 */
function switchToTab(tabName) {
  if (!windowElement) return;

  const tabs = windowElement.querySelectorAll('.var-v2-tab');
  const contents = windowElement.querySelectorAll('.var-v2-tab-content');

  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  contents.forEach(content => {
    const contentId = content.id.replace('var-v2-tab-', '');
    content.classList.toggle('hidden', contentId !== tabName);
  });

  // 如果切换到发送预览，更新内容
  if (tabName === 'send-preview') {
    updateSendPreview();
  }
}

/**
 * 队列变化回调
 * @param {import('../send-queue-manager.js').QueueTask[]} tasks
 */
function onQueueChange(tasks) {
  logger.debug('variable', '[VariableListUIV2] 队列变化回调, 任务数:', tasks.length);
  updateQueueBadge(tasks.length);
  // 刷新当前套装的发送栏状态
  refreshSendBarStatus();
  // 刷新触发徽章（队列处理完后计数可能重置）
  refreshSuiteBadge();
}

/**
 * 关闭窗口
 */
function closeWindow() {
  if (!windowElement) return;

  // 移除队列监听器
  const queueManager = getSendQueueManager();
  queueManager.removeListener(onQueueChange);

  // 移除消息事件监听（使用 removeListener 而非 off）
  eventSource.removeListener(event_types.MESSAGE_SENT, onMessageForBadge);
  eventSource.removeListener(event_types.MESSAGE_RECEIVED, onMessageForBadge);

  // 移除任务完成事件监听
  eventSource.removeListener('paws_queue_task_complete', onTaskComplete);

  // 保存位置
  savePosition();

  windowElement.remove();
  windowElement = null;

  logger.info('variable', '[VariableListUIV2] 窗口已关闭');
}

/**
 * 构建窗口 HTML
 */
function buildWindowHTML(suites, activeSuite, variables) {
  return `
        <div class="var-v2-header">
            <span class="var-v2-header-title">动态变量</span>
            <div class="var-v2-header-actions">
                <button class="var-v2-header-btn" id="var-v2-help-btn" title="使用教程">
                    <i class="fa-solid fa-circle-question"></i>
                </button>
                <button class="var-v2-header-btn" id="var-v2-queue-btn" title="发送队列">
                    <i class="fa-solid fa-list-check"></i>
                    <span class="var-v2-queue-badge hidden" id="var-v2-queue-badge">0</span>
                </button>
                <button class="var-v2-header-btn" id="var-v2-api-settings" title="API 设置">
                    <i class="fa-solid fa-plug"></i>
                </button>
                <button class="var-v2-header-btn var-v2-close-btn" title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <!-- 套装选择器（标题栏下方，无背景） -->
        <div class="var-v2-suite-row">
            <select id="var-v2-suite-select" class="var-v2-select-compact">
                ${suites.map(s => `<option value="${s.id}" ${s.id === activeSuite?.id ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
            <span class="var-v2-trigger-badge">${buildTriggerBadge(activeSuite)}</span>
            <i class="fa-solid fa-gear var-v2-suite-icon" id="var-v2-edit-suite" title="编辑套装"></i>
            <i class="fa-solid fa-plus var-v2-suite-icon" id="var-v2-new-suite" title="新建套装"></i>
            <i class="fa-solid fa-trash var-v2-suite-icon var-v2-delete-suite-icon" id="var-v2-delete-suite" title="删除套装"></i>
        </div>
        <div class="var-v2-body">
            <!-- 主页面容器 -->
            <div class="var-v2-page" id="var-v2-page-main">
                <!-- 标签页切换（三个标签） -->
                <div class="var-v2-tabs">
                    <div class="var-v2-tab active" data-tab="items">条目</div>
                    <div class="var-v2-tab" data-tab="send-preview">发送</div>
                    <div class="var-v2-tab" data-tab="response-preview">返回</div>
                </div>

                <!-- 标签页内容区（可滚动） -->
                <div class="var-v2-tab-content-wrapper">
                    <!-- 条目列表 -->
                    <div class="var-v2-tab-content" id="var-v2-tab-items">
                        <div class="var-v2-items-section">
                            <div class="var-v2-items-header">
                                <span class="var-v2-actions">
                                    <button class="var-v2-btn small" id="var-v2-add-prompt" title="添加提示词">
                                        <i class="fa-solid fa-file-lines"></i> 提示词
                                    </button>
                                    <button class="var-v2-btn small" id="var-v2-add-chat-content" title="添加正文">
                                        <i class="fa-solid fa-comments"></i> 正文
                                    </button>
                                    <button class="var-v2-btn small" id="var-v2-add-variable" title="添加变量">
                                        <i class="fa-solid fa-code"></i> 变量
                                    </button>
                                </span>
                            </div>
                            <div class="var-v2-items-list" id="var-v2-items-list">
                                ${buildItemsList(activeSuite, variables)}
                            </div>
                        </div>
                    </div>

                    <!-- 发送预览（独立标签页） -->
                    <div class="var-v2-tab-content hidden" id="var-v2-tab-send-preview">
                        <div class="var-v2-preview-full">
                            <div class="var-v2-preview-full-content" id="var-v2-send-preview">-</div>
                        </div>
                    </div>

                    <!-- 返回预览（独立标签页，可编辑） -->
                    <div class="var-v2-tab-content hidden" id="var-v2-tab-response-preview">
                        <div class="var-v2-preview-full">
                            <textarea class="var-v2-preview-full-textarea" id="var-v2-response-preview" placeholder="AI 返回内容将显示在这里..."></textarea>
                            <div class="var-v2-preview-actions">
                                <button class="var-v2-btn small" id="var-v2-reapply-response">
                                    <i class="fa-solid fa-rotate"></i> 重新应用
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 底部固定发送栏 -->
                <div class="var-v2-send-bar" id="var-v2-send-bar">
                    <div class="var-v2-send-status" id="var-v2-send-status">
                        <span class="status-text">空闲</span>
                    </div>
                    <button class="var-v2-send-btn" id="var-v2-send-btn">
                        <i class="fa-solid fa-paper-plane"></i>
                        <span>发送分析</span>
                    </button>
                </div>
            </div>

            <!-- 详情页面容器（初始隐藏） -->
            <div class="var-v2-page hidden" id="var-v2-page-detail"></div>
        </div>
    `;
}

/**
 * 构建触发状态徽章（紧凑版，用于套装选择器行）
 * 显示触发类型、当前计数（间隔触发时）、启用状态
 *
 * @param {Object|null} suite - 套装对象
 * @returns {string} 包含图标、触发类型文字和状态点的 HTML 字符串
 */
function buildTriggerBadge(suite) {
  if (!suite) return '';

  const trigger = suite.trigger;
  let icon = 'fa-hand-pointer'; // 手动
  let text = '手动';
  let countInfo = '';

  if (trigger.type === 'interval') {
    icon = 'fa-clock';
    const interval = trigger.interval || 5;

    // 获取当前计数
    const triggerManager = getTriggerManager();
    const ctx = getContext();
    const chatId = ctx?.chatId || '';
    const currentCount = triggerManager.getCount(suite.id, chatId);
    const chatLength = ctx?.chat?.length || 0;

    // 计算预计触发楼层
    const remaining = interval - currentCount;
    const expectedFloor = chatLength + remaining;

    text = `每${interval}楼`;
    if (chatId && suite.enabled) {
      countInfo = ` <span class="var-v2-count-info">(${currentCount}/${interval}, 约第${expectedFloor}楼)</span>`;
    }
  } else if (trigger.type === 'keyword') {
    icon = 'fa-key';
    text = '关键词';
  }

  const statusClass = suite.enabled ? 'enabled' : 'disabled';
  return `<i class="fa-solid ${icon}"></i> ${text}${countInfo} <span class="var-v2-status-dot ${statusClass}"></span>`;
}

/**
 * 构建触发信息（详细版，用于套装编辑弹窗）
 *
 * @param {Object|null} suite - 套装对象
 * @returns {string} 包含触发类型和启用状态的 HTML 字符串
 */
function buildTriggerInfo(suite) {
  if (!suite) return '<span>无套装</span>';

  const trigger = suite.trigger;
  let triggerText = '手动触发';
  if (trigger.type === 'interval') {
    triggerText = `每 ${trigger.interval || 5} 楼自动`;
  } else if (trigger.type === 'keyword') {
    triggerText = `关键词: ${(trigger.keywords || []).join(', ')}`;
  }

  const status = suite.enabled ? '已启用' : '已禁用';
  return `<span>${triggerText}</span> · <span class="${suite.enabled ? 'enabled' : 'disabled'}">${status}</span>`;
}

/**
 * 构建条目列表
 */
function buildItemsList(suite, variables) {
  if (!suite || !suite.items || suite.items.length === 0) {
    return '<div class="var-v2-empty">暂无条目，点击上方按钮添加</div>';
  }

  const processor = getChatContentProcessor();

  return suite.items.map((item, index) => {
    if (item.type === 'prompt') {
      // 优先显示名称，没有名称则显示内容预览
      const displayText = item.name
        ? item.name
        : (item.content.substring(0, 40) + (item.content.length > 40 ? '...' : ''));
      return `
                <div class="var-v2-item prompt" data-id="${item.id}" data-index="${index}" draggable="true">
                    <span class="var-v2-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                    <span class="var-v2-item-toggle">
                        <i class="fa-solid ${item.enabled !== false ? 'fa-toggle-on' : 'fa-toggle-off'} var-v2-toggle-enabled" data-id="${item.id}" title="${item.enabled !== false ? '关闭' : '开启'}"></i>
                    </span>
                    <span class="var-v2-item-icon"><i class="fa-solid fa-file-lines"></i></span>
                    <span class="var-v2-item-content">${escapeHtml(displayText)}</span>
                    <span class="var-v2-item-actions">
                        <i class="fa-solid fa-pencil var-v2-edit-item" data-id="${item.id}" title="编辑"></i>
                        <i class="fa-solid fa-trash var-v2-delete-item" data-id="${item.id}" title="删除"></i>
                    </span>
                </div>
            `;
    } else if (item.type === 'chat-content') {
      // 正文条目
      const chat = processor.getChat();
      const chatLength = chat.length;
      const floors = processor.calculateFloors(item.rangeConfig, chatLength, item.excludeUser, chat);
      const previewText = processor.formatPreview(floors);

      return `
                <div class="var-v2-item chat-content" data-id="${item.id}" data-index="${index}" draggable="true">
                    <span class="var-v2-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                    <span class="var-v2-item-toggle">
                        <i class="fa-solid ${item.enabled !== false ? 'fa-toggle-on' : 'fa-toggle-off'} var-v2-toggle-enabled" data-id="${item.id}" title="${item.enabled !== false ? '关闭' : '开启'}"></i>
                    </span>
                    <span class="var-v2-item-icon"><i class="fa-solid fa-comments"></i></span>
                    <span class="var-v2-item-content">${escapeHtml(previewText)}</span>
                    <span class="var-v2-item-actions">
                        <i class="fa-solid fa-pencil var-v2-edit-chat-content" data-id="${item.id}" title="编辑"></i>
                        <i class="fa-solid fa-gear var-v2-regex-settings" data-id="${item.id}" title="正则设置"></i>
                        <i class="fa-solid fa-trash var-v2-delete-item" data-id="${item.id}" title="删除"></i>
                    </span>
                </div>
            `;
    } else {
      // 变量条目
      const varDef = variables.find(v => v.id === item.id);
      const varName = varDef?.name || '未知变量';
      const varMode = varDef?.mode === 'stack' ? '叠加' : '覆盖';
      return `
                <div class="var-v2-item variable" data-id="${item.id}" data-index="${index}" draggable="true">
                    <span class="var-v2-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                    <span class="var-v2-item-toggle">
                        <i class="fa-solid ${item.enabled !== false ? 'fa-toggle-on' : 'fa-toggle-off'} var-v2-toggle-enabled" data-id="${item.id}"></i>
                    </span>
                    <span class="var-v2-item-name">{{${varName}}}</span>
                    <span class="var-v2-item-mode">${varMode}</span>
                    <span class="var-v2-item-actions">
                        <i class="fa-solid fa-circle-info var-v2-view-detail" data-id="${item.id}" title="详情"></i>
                        <i class="fa-solid fa-trash var-v2-delete-variable" data-id="${item.id}" title="删除"></i>
                    </span>
                </div>
            `;
    }
  }).join('');
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// 第四部分：位置管理
// ============================================

/**
 * 加载保存的位置
 */
function loadPosition() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      savedPosition = JSON.parse(saved);
    }
  } catch (e) {
    logger.warn('variable', '[VariableListUIV2] 加载位置失败:', e);
  }
}

/**
 * 保存当前位置
 */
function savePosition() {
  if (!windowElement) return;

  const rect = windowElement.getBoundingClientRect();
  savedPosition = { x: rect.left, y: rect.top };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPosition));
  } catch (e) {
    logger.warn('variable', '[VariableListUIV2] 保存位置失败:', e);
  }
}

/**
 * 应用位置
 */
function applyPosition() {
  if (!windowElement) return;

  // 小屏幕不应用位置（全屏）
  if (window.innerWidth <= 768) return;

  if (savedPosition) {
    // 确保不超出屏幕
    const maxX = window.innerWidth - 375;
    const maxY = window.innerHeight - 100;
    const x = Math.max(0, Math.min(savedPosition.x, maxX));
    const y = Math.max(0, Math.min(savedPosition.y, maxY));

    windowElement.style.left = `${x}px`;
    windowElement.style.top = `${y}px`;
  } else {
    // 默认居中
    windowElement.style.left = `${(window.innerWidth - 375) / 2}px`;
    windowElement.style.top = `${(window.innerHeight - 600) / 2}px`;
  }
}

// ============================================
// 第五部分：拖动窗口
// ============================================

/**
 * 绑定拖动移动事件
 */
function bindDragToMove() {
  if (!windowElement) return;

  const header = windowElement.querySelector('.var-v2-header');
  if (!header) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onMouseDown = (e) => {
    // 只响应标题栏拖动，不响应按钮
    if (e.target.closest('.var-v2-header-btn')) return;

    // 小屏幕不允许拖动
    if (window.innerWidth <= 768) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = windowElement.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;

    // 限制在屏幕内
    const maxX = window.innerWidth - 50;
    const maxY = window.innerHeight - 50;
    newLeft = Math.max(-325, Math.min(newLeft, maxX));
    newTop = Math.max(0, Math.min(newTop, maxY));

    windowElement.style.left = `${newLeft}px`;
    windowElement.style.top = `${newTop}px`;
  };

  const onMouseUp = () => {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    savePosition();
  };

  header.addEventListener('mousedown', onMouseDown);
}

// ============================================
// 第六部分：事件绑定
// ============================================

/**
 * 绑定窗口事件
 */
function bindWindowEvents() {
  if (!windowElement) return;

  const suiteManager = getSuiteManager();

  // 关闭按钮
  windowElement.querySelector('.var-v2-close-btn')?.addEventListener('click', closeWindow);

  // 队列按钮
  windowElement.querySelector('#var-v2-queue-btn')?.addEventListener('click', () => {
    openQueuePopup();
  });

  // API 设置按钮
  windowElement.querySelector('#var-v2-api-settings')?.addEventListener('click', () => {
    openAPISettingsPopup();
  });

  // 教程按钮
  windowElement.querySelector('#var-v2-help-btn')?.addEventListener('click', () => {
    openHelpPopup();
  });

  // 套装选择
  windowElement.querySelector('#var-v2-suite-select')?.addEventListener('change', (e) => {
    const suiteId = /** @type {HTMLSelectElement} */ (e.target).value;
    suiteManager.setActiveSuite(suiteId);
    refreshItemsList();
    refreshSuiteBadge();
    updatePreview();
    // 切换套装时刷新发送栏状态
    refreshSendBarStatus();
  });

  // 编辑套装
  windowElement.querySelector('#var-v2-edit-suite')?.addEventListener('click', () => {
    openSuiteEditPopup();
  });

  // 新建套装
  windowElement.querySelector('#var-v2-new-suite')?.addEventListener('click', async () => {
    const name = prompt('套装名称：');
    if (name) {
      suiteManager.createSuite({ name });
      refreshSuiteSelect();
    }
  });

  // 删除套装
  windowElement.querySelector('#var-v2-delete-suite')?.addEventListener('click', async () => {
    await handleDeleteSuite();
  });

  // 添加提示词
  windowElement.querySelector('#var-v2-add-prompt')?.addEventListener('click', () => {
    openPromptEditPopup(null);
  });

  // 添加正文条目
  windowElement.querySelector('#var-v2-add-chat-content')?.addEventListener('click', () => {
    const suiteManager = getSuiteManager();
    const suite = suiteManager.getActiveSuite();
    if (!suite) {
      toastr.warning('请先选择套装');
      return;
    }
    openChatContentEditPopup(null, suite.id, () => {
      refreshItemsList();
      updatePreview();
    });
  });

  // 添加变量
  windowElement.querySelector('#var-v2-add-variable')?.addEventListener('click', () => {
    openVariableSelectPopup();
  });

  // 发送按钮
  windowElement.querySelector('#var-v2-send-btn')?.addEventListener('click', () => {
    handleSendAnalysis();
  });

  // 重新应用返回内容按钮
  windowElement.querySelector('#var-v2-reapply-response')?.addEventListener('click', () => {
    handleReapplyResponse();
  });

  // 标签页切换
  windowElement.querySelectorAll('.var-v2-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = /** @type {HTMLElement} */ (e.target).dataset.tab;
      switchTab(tabName);
    });
  });

  // 条目列表事件委托
  bindItemsListEvents();

  // 绑定拖拽排序
  bindDragEvents();
}

/**
 * 切换标签页
 * @param {string} tabName - 'items' | 'send-preview' | 'response-preview'
 */
function switchTab(tabName) {
  if (!windowElement) return;

  // 更新标签页激活状态
  windowElement.querySelectorAll('.var-v2-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // 隐藏所有标签页内容
  const itemsContent = windowElement.querySelector('#var-v2-tab-items');
  const sendPreviewContent = windowElement.querySelector('#var-v2-tab-send-preview');
  const responsePreviewContent = windowElement.querySelector('#var-v2-tab-response-preview');

  itemsContent?.classList.add('hidden');
  sendPreviewContent?.classList.add('hidden');
  responsePreviewContent?.classList.add('hidden');

  // 显示对应标签页
  switch (tabName) {
    case 'items':
      itemsContent?.classList.remove('hidden');
      break;
    case 'send-preview':
      sendPreviewContent?.classList.remove('hidden');
      updateSendPreview();
      break;
    case 'response-preview':
      responsePreviewContent?.classList.remove('hidden');
      break;
  }
}

/**
 * 处理重新应用返回内容
 */
async function handleReapplyResponse() {
  const textarea = windowElement?.querySelector('#var-v2-response-preview');
  if (!textarea) return;

  const content = /** @type {HTMLTextAreaElement} */ (textarea).value.trim();
  if (!content) {
    toastr.warning('返回预览为空');
    return;
  }

  try {
    const analyzer = getVariableAnalyzerV2();
    const suiteManager = getSuiteManager();
    const suite = suiteManager.getActiveSuite();

    if (!suite) {
      toastr.warning('请先选择套装');
      return;
    }

    // 重新解析并应用
    const result = await analyzer.parseAndApply(content, suite.id);

    if (result.applied > 0) {
      toastr.success(`已重新应用 ${result.applied} 个变量`);
    } else {
      toastr.info('没有匹配到任何变量标签');
    }
  } catch (error) {
    logger.error('variable', '[VariableListUIV2] 重新应用失败:', error);
    toastr.error('重新应用失败');
  }
}

/**
 * 绑定条目列表事件
 */
function bindItemsListEvents() {
  const itemsList = windowElement?.querySelector('#var-v2-items-list');
  if (!itemsList) return;

  const suiteManager = getSuiteManager();

  itemsList.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // 切换启用状态（所有条目类型）
    if (target.classList.contains('var-v2-toggle-enabled')) {
      const itemId = target.dataset.id;
      const suite = suiteManager.getActiveSuite();
      if (suite && itemId) {
        const item = suite.items.find(i => i.id === itemId);
        if (!item) {
          logger.debug('variable', '[VariableListUIV2] 未找到条目:', itemId);
          return;
        }

        // 处理旧数据：enabled 为 undefined 时默认为 true
        const currentEnabled = item.enabled !== false;
        const newEnabled = !currentEnabled;
        logger.debug('variable', '[VariableListUIV2] 切换开关:', item.id, '当前状态:', currentEnabled, '将切换为:', newEnabled);

        if (item.type === 'prompt') {
          suiteManager.updatePromptItem(suite.id, itemId, { enabled: newEnabled });
          refreshItemsList();
          updatePreview();
        } else if (item.type === 'chat-content') {
          suiteManager.updateChatContentItem(suite.id, itemId, { enabled: newEnabled });
          refreshItemsList();
          updatePreview();
        } else if (item.type === 'variable') {
          suiteManager.updateVariableItem(suite.id, itemId, { enabled: newEnabled });
          refreshItemsList();
        }
      }
    }

    // 编辑提示词
    if (target.classList.contains('var-v2-edit-item')) {
      const itemId = target.dataset.id;
      openPromptEditPopup(itemId);
    }

    // 编辑正文条目
    if (target.classList.contains('var-v2-edit-chat-content')) {
      const itemId = target.dataset.id;
      const suite = suiteManager.getActiveSuite();
      if (suite && itemId) {
        openChatContentEditPopup(itemId, suite.id, () => {
          refreshItemsList();
          updatePreview();
        });
      }
    }

    // 正则设置
    if (target.classList.contains('var-v2-regex-settings')) {
      const itemId = target.dataset.id;
      const suite = suiteManager.getActiveSuite();
      if (suite && itemId) {
        openRegexSettingsPopup(itemId, suite.id, () => {
          refreshItemsList();
          updatePreview();
        });
      }
    }

    // 删除条目
    if (target.classList.contains('var-v2-delete-item')) {
      const itemId = target.dataset.id;
      handleDeleteItem(itemId);
    }

    // 查看变量详情
    if (target.classList.contains('var-v2-view-detail')) {
      const varId = target.dataset.id;
      openVariableDetailPopupV2(varId);
    }

    // 删除变量
    if (target.classList.contains('var-v2-delete-variable')) {
      const varId = target.dataset.id;
      handleDeleteVariable(varId);
    }
  });
}

/**
 * 绑定拖拽排序事件
 */
function bindDragEvents() {
  const itemsList = windowElement?.querySelector('#var-v2-items-list');
  if (!itemsList) return;

  itemsList.addEventListener('dragstart', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target.classList.contains('var-v2-item')) return;

    draggedItem = target;
    draggedItemId = target.dataset.id;
    target.classList.add('dragging');

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItemId);
  });

  itemsList.addEventListener('dragend', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    target.classList.remove('dragging');
    draggedItem = null;
    draggedItemId = null;

    itemsList.querySelectorAll('.var-v2-item').forEach(item => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });

  itemsList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const target = /** @type {HTMLElement} */ (e.target).closest('.var-v2-item');
    if (!target || target === draggedItem) return;

    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    itemsList.querySelectorAll('.var-v2-item').forEach(item => {
      if (item !== target) {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    if (e.clientY < midY) {
      target.classList.add('drag-over-top');
      target.classList.remove('drag-over-bottom');
    } else {
      target.classList.add('drag-over-bottom');
      target.classList.remove('drag-over-top');
    }
  });

  itemsList.addEventListener('dragleave', (e) => {
    const target = /** @type {HTMLElement} */ (e.target).closest('.var-v2-item');
    if (target) {
      target.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });

  itemsList.addEventListener('drop', (e) => {
    e.preventDefault();

    const target = /** @type {HTMLElement} */ (e.target).closest('.var-v2-item');
    if (!target || !draggedItemId) return;

    const targetId = target.dataset.id;
    if (targetId === draggedItemId) return;

    const rect = target.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;

    const suiteManager = getSuiteManager();
    const suite = suiteManager.getActiveSuite();
    if (suite) {
      const items = [...suite.items];
      const draggedIndex = items.findIndex(i => i.id === draggedItemId);
      const targetIndex = items.findIndex(i => i.id === targetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [draggedElement] = items.splice(draggedIndex, 1);

        let newIndex = targetIndex;
        if (draggedIndex < targetIndex) {
          newIndex = insertBefore ? targetIndex - 1 : targetIndex;
        } else {
          newIndex = insertBefore ? targetIndex : targetIndex + 1;
        }

        items.splice(newIndex, 0, draggedElement);

        const newOrder = items.map(i => i.id);
        suiteManager.reorderItems(suite.id, newOrder);

        refreshItemsList();
        updatePreview();
      }
    }

    target.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

// ============================================
// 第七部分：刷新函数
// ============================================

/**
 * 刷新条目列表
 */
function refreshItemsList() {
  if (!windowElement) return;

  const suiteManager = getSuiteManager();
  const variableManager = getVariableManagerV2();
  const suite = suiteManager.getActiveSuite();
  const variables = variableManager.getDefinitions();

  logger.debug('variable', '[VariableListUIV2] refreshItemsList 被调用');
  logger.debug('variable', '[VariableListUIV2] 当前套装:', suite?.id, '条目数:', suite?.items?.length);

  // 检查第一个条目的 enabled 状态
  if (suite?.items?.length > 0) {
    const firstItem = suite.items[0];
    logger.debug('variable', '[VariableListUIV2] 第一个条目:', firstItem.id, 'enabled:', firstItem.enabled, 'type:', firstItem.type);
  }

  const list = windowElement.querySelector('#var-v2-items-list');
  if (list) {
    list.innerHTML = buildItemsList(suite, variables);
  }
}

/**
 * 刷新套装徽章
 */
function refreshSuiteBadge() {
  if (!windowElement) return;

  const suiteManager = getSuiteManager();
  const suite = suiteManager.getActiveSuite();

  const badge = windowElement.querySelector('.var-v2-trigger-badge');
  if (badge) {
    badge.innerHTML = buildTriggerBadge(suite);
  }
}

/**
 * 刷新套装选择器
 */
function refreshSuiteSelect() {
  if (!windowElement) return;

  const suiteManager = getSuiteManager();
  const suites = suiteManager.getSuites();
  const activeSuite = suiteManager.getActiveSuite();

  const select = windowElement.querySelector('#var-v2-suite-select');
  if (select) {
    select.innerHTML = suites.map(s =>
      `<option value="${s.id}" ${s.id === activeSuite?.id ? 'selected' : ''}>${s.name}</option>`
    ).join('');
  }

  refreshItemsList();
  refreshSuiteBadge();
}

/**
 * 更新发送预览
 */
function updateSendPreview() {
  if (!windowElement) return;

  const suiteManager = getSuiteManager();
  const processor = getChatContentProcessor();
  const suite = suiteManager.getActiveSuite();
  if (!suite) return;

  const previewEl = windowElement.querySelector('#var-v2-send-preview');
  if (!previewEl) return;

  // 获取所有可见的内容条目（提示词 + 正文）
  const visibleItems = suiteManager.getVisibleContentItems(suite.id);
  if (visibleItems.length === 0) {
    previewEl.textContent = '（无可见的条目）';
    return;
  }

  // 构建预览内容
  const previewParts = [];
  for (const item of visibleItems) {
    if (item.type === 'prompt') {
      previewParts.push(item.content);
    } else if (item.type === 'chat-content') {
      // 获取正文条目的内容
      const content = processor.getItemContent(item);
      if (content) {
        previewParts.push(content);
      }
    }
  }

  if (previewParts.length === 0) {
    previewEl.textContent = '（无内容）';
    return;
  }

  // 完整显示，不截断
  previewEl.textContent = previewParts.join('\n---\n');
}

// 兼容旧调用
function updatePreview() {
  updateSendPreview();
}

/**
 * 更新返回预览
 * @param {string} content - AI 返回的内容
 */
function updateResponsePreview(content) {
  if (!windowElement) return;

  const textarea = windowElement.querySelector('#var-v2-response-preview');
  if (textarea) {
        /** @type {HTMLTextAreaElement} */ (textarea).value = content || '';
  }
}


// ============================================
// 第八部分：子弹窗
// ============================================

/**
 * 显示内部弹窗
 * @param {string} title
 * @param {string} contentHTML
 * @param {Object} options
 * @returns {Promise<any>}
 */
async function showInternalPopup(title, contentHTML, options = {}) {
  const { buttons = [], onShow = null, beforeClose = null } = options;

  return new Promise((resolve) => {
    const buttonsHTML = buttons.length > 0
      ? `<div class="var-v2-popup-footer">
                ${buttons.map((btn, i) =>
        `<button class="var-v2-btn ${btn.class || ''}" data-index="${i}">${btn.text}</button>`
      ).join('')}
            </div>`
      : '';

    const overlay = document.createElement('div');
    overlay.className = 'var-v2-popup-overlay';
    overlay.innerHTML = `
            <div class="var-v2-popup">
                <div class="var-v2-popup-header">
                    <span class="var-v2-popup-title">${title}</span>
                    <span class="var-v2-popup-close"><i class="fa-solid fa-xmark"></i></span>
                </div>
                <div class="var-v2-popup-body">
                    ${contentHTML}
                </div>
                ${buttonsHTML}
            </div>
        `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('show');
      if (onShow) onShow(overlay);
    });

    const closePopup = (buttonValue) => {
      let result = buttonValue;
      if (beforeClose) {
        try {
          result = beforeClose(buttonValue, overlay);
        } catch (e) {
          logger.error('variable', '[VariableListUIV2] beforeClose 错误:', e);
        }
      }

      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 200);
    };

    // 只有点击 × 按钮才能关闭
    overlay.querySelector('.var-v2-popup-close')?.addEventListener('click', () => closePopup(null));

    // 底部按钮
    overlay.querySelectorAll('.var-v2-popup-footer .var-v2-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index || '0', 10);
        closePopup(buttons[index]?.value);
      });
    });

    // 移除：点击遮罩关闭（用户要求只能点 × 关闭）
  });
}

/**
 * 显示确认弹窗
 */
async function showInternalConfirm(title, message, options = {}) {
  const { okButton = '确定', cancelButton = '取消', danger = false } = options;

  const result = await showInternalPopup(title, `<p style="margin:0;line-height:1.6">${message}</p>`, {
    buttons: [
      { text: cancelButton, value: false },
      { text: okButton, value: true, class: danger ? 'danger' : 'primary' }
    ]
  });

  return result === true;
}

/**
 * 打开套装编辑弹窗
 */
async function openSuiteEditPopup() {
  const suiteManager = getSuiteManager();
  const suite = suiteManager.getActiveSuite();
  if (!suite) return;

  const html = `
        <div class="var-v2-form">
            <div class="var-v2-form-row">
                <label>套装名称</label>
                <input type="text" id="var-v2-suite-name" value="${escapeHtml(suite.name)}">
            </div>
            <div class="var-v2-form-row">
                <label class="checkbox_label">
                    <input type="checkbox" id="var-v2-suite-enabled" ${suite.enabled ? 'checked' : ''}>
                    <span>启用</span>
                </label>
            </div>
            <div class="var-v2-form-row">
                <label>触发方式</label>
                <select id="var-v2-trigger-type" class="var-v2-select">
                    <option value="manual" ${suite.trigger.type === 'manual' ? 'selected' : ''}>手动触发</option>
                    <option value="interval" ${suite.trigger.type === 'interval' ? 'selected' : ''}>间隔触发</option>
                    <option value="keyword" ${suite.trigger.type === 'keyword' ? 'selected' : ''}>关键词触发</option>
                </select>
            </div>
            <div class="var-v2-form-row" id="var-v2-interval-row" style="${suite.trigger.type === 'interval' ? '' : 'display:none'}">
                <label>间隔楼层</label>
                <input type="number" id="var-v2-trigger-interval" value="${suite.trigger.interval || 5}" min="1">
            </div>
            <div class="var-v2-form-row" id="var-v2-keyword-row" style="${suite.trigger.type === 'keyword' ? '' : 'display:none'}">
                <label>关键词（逗号分隔）</label>
                <input type="text" id="var-v2-trigger-keywords" value="${(suite.trigger.keywords || []).join(', ')}">
            </div>
            <div class="var-v2-form-row" id="var-v2-snapshot-row" style="${suite.trigger.type !== 'manual' ? '' : 'display:none'}">
                <label class="checkbox_label">
                    <input type="checkbox" id="var-v2-use-snapshot" ${suite.useSnapshotMode !== false ? 'checked' : ''}>
                    <span>入队时快照楼层</span>
                </label>
                <span class="var-v2-hint">勾选：使用触发时的楼层数；不勾选：使用处理时的实时楼层数</span>
            </div>
        </div>
    `;

  const result = await showInternalPopup('编辑套装', html, {
    buttons: [
      { text: '取消', value: null },
      { text: '保存', value: 'save', class: 'primary' }
    ],
    onShow: (overlay) => {
      overlay.querySelector('#var-v2-trigger-type')?.addEventListener('change', (e) => {
        const type = /** @type {HTMLSelectElement} */ (e.target).value;
        const intervalRow = overlay.querySelector('#var-v2-interval-row');
        const keywordRow = overlay.querySelector('#var-v2-keyword-row');
        const snapshotRow = overlay.querySelector('#var-v2-snapshot-row');
        if (intervalRow) intervalRow.style.display = type === 'interval' ? '' : 'none';
        if (keywordRow) keywordRow.style.display = type === 'keyword' ? '' : 'none';
        if (snapshotRow) snapshotRow.style.display = type !== 'manual' ? '' : 'none';
      });
    },
    beforeClose: (buttonValue, overlay) => {
      if (buttonValue === 'save') {
        return {
          action: 'save',
          name: /** @type {HTMLInputElement} */ (overlay.querySelector('#var-v2-suite-name'))?.value,
          enabled: /** @type {HTMLInputElement} */ (overlay.querySelector('#var-v2-suite-enabled'))?.checked,
          triggerType: /** @type {HTMLSelectElement} */ (overlay.querySelector('#var-v2-trigger-type'))?.value,
          interval: parseInt(/** @type {HTMLInputElement} */(overlay.querySelector('#var-v2-trigger-interval'))?.value) || 5,
          keywords: /** @type {HTMLInputElement} */ (overlay.querySelector('#var-v2-trigger-keywords'))?.value
            .split(',').map(k => k.trim()).filter(k => k),
          useSnapshotMode: /** @type {HTMLInputElement} */ (overlay.querySelector('#var-v2-use-snapshot'))?.checked
        };
      }
      return null;
    }
  });

  if (result?.action === 'save') {
    suiteManager.updateSuite(suite.id, {
      name: result.name || suite.name,
      enabled: result.enabled,
      trigger: { type: result.triggerType, interval: result.interval, keywords: result.keywords },
      useSnapshotMode: result.useSnapshotMode
    });
    refreshSuiteSelect();
    toastr.success('套装已保存');
  }
}

/**
 * 打开提示词编辑弹窗
 */
async function openPromptEditPopup(itemId) {
  const suiteManager = getSuiteManager();
  const suite = suiteManager.getActiveSuite();
  if (!suite) return;

  const item = itemId ? suite.items.find(i => i.id === itemId) : null;
  const isNew = !item;

  const html = `
        <div class="var-v2-form">
            <div class="var-v2-form-row">
                <label>名称（可选）</label>
                <input type="text" id="var-v2-prompt-name" placeholder="如：摘要提示词、角色设定" value="${item?.name || ''}">
                <span class="var-v2-hint">用于在列表中显示，不会发送给 AI</span>
            </div>
            <div class="var-v2-form-row">
                <label>提示词内容</label>
                <textarea id="var-v2-prompt-content" rows="6" placeholder="输入提示词内容...">${item?.content || ''}</textarea>
            </div>
            <div class="var-v2-hint">
                可用宏：{{变量名}}、{{变量@1-5}}、{{酒馆楼层@N-M}}、{{LastMessageId}}
            </div>
        </div>
    `;

  const result = await showInternalPopup(isNew ? '添加提示词' : '编辑提示词', html, {
    buttons: [
      { text: '取消', value: null },
      { text: isNew ? '添加' : '保存', value: 'save', class: 'primary' }
    ],
    beforeClose: (buttonValue, overlay) => {
      if (buttonValue === 'save') {
        return {
          action: 'save',
          name: /** @type {HTMLInputElement} */ (overlay.querySelector('#var-v2-prompt-name'))?.value?.trim() || '',
          content: /** @type {HTMLTextAreaElement} */ (overlay.querySelector('#var-v2-prompt-content'))?.value || ''
        };
      }
      return null;
    }
  });

  if (result?.action === 'save') {
    if (isNew) {
      suiteManager.addPromptItem(suite.id, result.content, { name: result.name });
    } else {
      suiteManager.updatePromptItem(suite.id, itemId, { name: result.name, content: result.content });
    }
    refreshItemsList();
    updatePreview();
    toastr.success(isNew ? '提示词已添加' : '提示词已保存');
  }
}

/**
 * 打开变量选择弹窗
 */
async function openVariableSelectPopup() {
  const suiteManager = getSuiteManager();
  const variableManager = getVariableManagerV2();
  const suite = suiteManager.getActiveSuite();
  if (!suite) return;

  const variables = variableManager.getDefinitions();
  const existingIds = suite.items.filter(i => i.type === 'variable').map(i => i.id);
  const availableVars = variables.filter(v => !existingIds.includes(v.id));

  // 已添加的变量
  const addedVars = existingIds.map(id => {
    const v = variables.find(x => x.id === id);
    return v ? { id, name: v.name, mode: v.mode, enabled: suite.items.find(i => i.id === id)?.enabled } : null;
  }).filter(Boolean);

  const html = `
        <div class="var-v2-form">
            ${addedVars.length > 0 ? `
                <div class="var-v2-form-row">
                    <label>当前套装的变量</label>
                    <div class="var-v2-added-vars-list">
                        ${addedVars.map(v => `
                            <div class="var-v2-added-var-item" data-id="${v.id}">
                                <span class="var-v2-added-var-name">{{${v.name}}}</span>
                                <span class="var-v2-added-var-mode">${v.mode === 'stack' ? '叠加' : '覆盖'}</span>
                                <i class="fa-solid fa-trash var-v2-remove-added-var" data-id="${v.id}" title="从套装移除"></i>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <div class="var-v2-form-row">
                <label>${availableVars.length > 0 ? '添加变量' : '可用的变量'}</label>
                ${availableVars.length > 0 ? `
                    <select id="var-v2-select-variable" class="var-v2-select">
                        ${availableVars.map(v => `<option value="${v.id}">{{${v.name}}} (${v.mode === 'stack' ? '叠加' : '覆盖'})</option>`).join('')}
                    </select>
                ` : `
                    <div class="var-v2-empty" style="padding: 12px; text-align: center;">所有变量已添加到当前套装</div>
                `}
            </div>

            <button class="var-v2-btn" id="var-v2-create-new-var" style="margin-top:8px">
                <i class="fa-solid fa-plus"></i> 创建新变量
            </button>
        </div>
    `;

  const result = await showInternalPopup('添加变量到套装', html, {
    buttons: [
      { text: '关闭', value: null },
      { text: '添加', value: 'add', class: 'primary', disabled: availableVars.length === 0 }
    ],
    onShow: (overlay) => {
      // 创建新变量按钮
      overlay.querySelector('#var-v2-create-new-var')?.addEventListener('click', () => {
        overlay.querySelector('.var-v2-popup-close')?.click();
        setTimeout(() => openNewVariablePopup(), 100);
      });

      // 删除已添加的变量
      overlay.querySelectorAll('.var-v2-remove-added-var').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const varId = e.target.dataset.id;
          const varName = variables.find(v => v.id === varId)?.name || '';

          const confirmed = await showInternalConfirm(
            '从套装移除',
            `确定要从套装移除变量「{{${varName}}}」吗？\n\n变量定义会保留，可随时重新添加。`,
            { okButton: '移除' }
          );

          if (confirmed) {
            suiteManager.removeItem(suite.id, varId);
            toastr.success('变量已从套装移除');
            // 刷新弹窗
            overlay.querySelector('.var-v2-popup-close')?.click();
            setTimeout(() => openVariableSelectPopup(), 100);
          }
        });
      });
    },
    beforeClose: (buttonValue, overlay) => {
      if (buttonValue === 'add') {
        return {
          action: 'add',
          varId: /** @type {HTMLSelectElement} */ (overlay.querySelector('#var-v2-select-variable'))?.value
        };
      }
      return null;
    }
  });

  if (result?.action === 'add' && result.varId) {
    suiteManager.addVariableItem(suite.id, result.varId);
    refreshItemsList();
    toastr.success('变量已添加到套装');
  }
}

/**
 * 打开新建变量弹窗
 */
async function openNewVariablePopup() {
  const variableManager = getVariableManagerV2();

  const html = `
        <div class="var-v2-form">
            <div class="var-v2-form-row">
                <label>变量名</label>
                <input type="text" id="var-v2-new-name" placeholder="如：摘要、心理状态">
                <span class="var-v2-hint">只能包含字母、数字、中文</span>
            </div>
            <div class="var-v2-form-row">
                <label>标签格式</label>
                <input type="text" id="var-v2-new-tag" placeholder="如：[摘要]">
                <span class="var-v2-hint">AI 输出时使用的标签</span>
            </div>
            <div class="var-v2-form-row">
                <label>模式</label>
                <select id="var-v2-new-mode" class="var-v2-select">
                    <option value="stack">叠加模式 - 内容追加为新条目</option>
                    <option value="replace">覆盖模式 - 内容替换当前值</option>
                </select>
            </div>
        </div>
    `;

  const result = await showInternalPopup('创建新变量', html, {
    buttons: [
      { text: '取消', value: null },
      { text: '创建', value: 'create', class: 'primary' }
    ],
    beforeClose: (buttonValue, overlay) => {
      if (buttonValue === 'create') {
        return {
          action: 'create',
          name: /** @type {HTMLInputElement} */ (overlay.querySelector('#var-v2-new-name'))?.value?.trim(),
          tag: /** @type {HTMLInputElement} */ (overlay.querySelector('#var-v2-new-tag'))?.value?.trim(),
          mode: /** @type {HTMLSelectElement} */ (overlay.querySelector('#var-v2-new-mode'))?.value
        };
      }
      return null;
    }
  });

  if (result?.action === 'create') {
    const { name, tag, mode } = result;
    if (!name || !tag) {
      toastr.warning('请填写变量名和标签');
      return;
    }

    const createResult = await variableManager.createVariable({ name, tag, mode });
    if (createResult.success) {
      const suiteManager = getSuiteManager();
      const suite = suiteManager.getActiveSuite();
      if (suite) {
        suiteManager.addVariableItem(suite.id, createResult.variable.id);
      }
      refreshItemsList();
      toastr.success('变量已创建并添加到套装');
    } else {
      toastr.error(createResult.error || '创建失败');
    }
  }
}

/**
 * 删除条目
 */
async function handleDeleteItem(itemId) {
  const confirmed = await showInternalConfirm('删除条目', '确定要删除这个条目吗？', { danger: true, okButton: '删除' });
  if (confirmed) {
    const suiteManager = getSuiteManager();
    const suite = suiteManager.getActiveSuite();
    if (suite) {
      suiteManager.removeItem(suite.id, itemId);
      refreshItemsList();
      updatePreview();
      toastr.success('条目已删除');
    }
  }
}

/**
 * 删除变量（暂时移除或彻底删除）
 *
 * @description
 * 弹窗让用户选择：
 * - 暂时移除：只从当前套装移除变量引用，变量定义保留，后续可重新添加
 * - 彻底删除：删除变量定义，从所有套装移除引用，变量值也会被删除
 *
 * @param {string} varId - 变量ID
 */
async function handleDeleteVariable(varId) {
  const variableManager = getVariableManagerV2();
  const variable = variableManager.getDefinition(varId);

  if (!variable) {
    toastr.error('变量不存在');
    return;
  }

  // 构建确认消息
  const message = `
        <div style="text-align: left; line-height: 1.6;">
            <p style="margin-bottom: 12px;">确定要删除变量「{{${variable.name}}}」吗？</p>
            <div style="margin-bottom: 8px;">
                <strong style="color: var(--var-v2-warning);">暂时移除：</strong>
                <span style="color: #888;">只从当前套装移除，变量定义保留，可在添加变量时重新选择</span>
            </div>
            <div>
                <strong style="color: var(--var-v2-danger);">彻底删除：</strong>
                <span style="color: #888;">删除变量定义和所有数据，无法恢复</span>
            </div>
        </div>
    `;

  // 使用自定义按钮的弹窗
  const result = await showInternalPopup('删除变量', message, {
    buttons: [
      { text: '取消', value: 'cancel' },
      { text: '暂时移除', value: 'remove', class: 'warning' },
      { text: '彻底删除', value: 'delete', class: 'danger' }
    ]
  });

  if (result === 'remove') {
    // 暂时移除：只从当前套装移除变量引用
    const suiteManager = getSuiteManager();
    const suite = suiteManager.getActiveSuite();
    if (suite) {
      suiteManager.removeItem(suite.id, varId);
      refreshItemsList();
      updatePreview();
      toastr.success('变量已从套装移除');
      logger.info('variable', '[VariableListUIV2] 暂时移除变量:', variable.name);
    }
  } else if (result === 'delete') {
    // 二次确认彻底删除
    const confirmed = await showInternalConfirm(
      '彻底删除变量',
      `确定要彻底删除变量「{{${variable.name}}}」吗？\n\n此操作将：\n- 删除变量定义\n- 从所有套装移除引用\n- 删除所有聊天中的变量值\n\n此操作不可撤销！`,
      { danger: true, okButton: '彻底删除' }
    );

    if (confirmed) {
      // 从所有套装移除变量引用
      const suiteManager = getSuiteManager();
      suiteManager.removeVariableFromAllSuites(varId);

      // 删除变量定义和值
      const deleteResult = await variableManager.deleteVariable(varId);

      if (deleteResult.success) {
        refreshItemsList();
        updatePreview();
        toastr.success('变量已彻底删除');
        logger.info('variable', '[VariableListUIV2] 彻底删除变量:', variable.name);
      } else {
        toastr.error(deleteResult.error || '删除失败');
      }
    }
  }
}

/**
 * 删除当前套装
 *
 * @description
 * 删除当前选中的套装，包括套装内的所有条目。
 * 会弹窗二次确认，防止误删。
 * 如果只剩一个套装，不允许删除。
 */
async function handleDeleteSuite() {
  const suiteManager = getSuiteManager();
  const suite = suiteManager.getActiveSuite();

  if (!suite) {
    toastr.warning('没有选中的套装');
    return;
  }

  const suites = suiteManager.getSuites();
  if (suites.length <= 1) {
    toastr.warning('至少保留一个套装');
    return;
  }

  const confirmed = await showInternalConfirm(
    '删除套装',
    `确定要删除套装「${suite.name}」吗？\n\n套装内的所有条目都会被删除，此操作不可撤销。`,
    { danger: true, okButton: '删除' }
  );

  if (confirmed) {
    suiteManager.deleteSuite(suite.id);
    refreshSuiteSelect();
    toastr.success('套装已删除');
  }
}


// ============================================
// 第九部分：变量详情页（页面切换模式）
// ============================================

/**
 * 打开变量详情页面（页面切换，不是弹窗）
 * @param {string} varId
 */
async function openVariableDetailPopupV2(varId) {
  const variableManager = getVariableManagerV2();
  const variable = variableManager.getDefinition(varId);
  if (!variable) {
    toastr.error('变量不存在');
    return;
  }

  if (variable.mode === 'stack') {
    await showStackDetailPage(varId, variable);
  } else {
    await showReplaceDetailPage(varId, variable);
  }
}

/**
 * 显示叠加模式详情页（页面切换，不是弹窗）
 *
 * @description
 * 在窗口内切换到详情页，显示叠加模式变量的所有条目列表。
 * 支持展开/折叠、编辑、删除、切换可见性等操作。
 *
 * @async
 * @param {string} varId - 变量ID
 * @param {Object} variable - 变量定义对象
 * @returns {Promise<void>}
 */
async function showStackDetailPage(varId, variable) {
  if (!windowElement) return;

  const variableManager = getVariableManagerV2();
  const ctx = getContext();
  const chatId = ctx?.chatId;

  if (!chatId) {
    toastr.warning('请先打开一个聊天');
    return;
  }

  const value = await variableManager.getStackValue(varId, chatId);
  const entries = value.entries || [];

  // 按数组顺序显示，索引+1 作为显示编号（拖拽排序后编号会变）
  const entriesHTML = entries.length === 0
    ? '<div class="var-v2-empty">暂无条目</div>'
    : entries.map((entry, index) => `
            <div class="var-v2-entry ${entry.hidden ? 'entry-hidden' : ''}" data-entry-id="${entry.id}" draggable="true">
                <div class="var-v2-entry-header">
                    <span class="var-v2-entry-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                    <span class="var-v2-entry-toggle"><i class="fa-solid fa-chevron-down"></i></span>
                    <span class="var-v2-entry-title">#${index + 1} - 第${entry.floorRange || '?'}楼</span>
                    <span class="var-v2-entry-time">${formatTime(entry.timestamp)}</span>
                    <span class="var-v2-entry-actions">
                        <i class="fa-solid ${entry.hidden ? 'fa-eye-slash' : 'fa-eye'} var-v2-entry-visibility" data-entry-id="${entry.id}"></i>
                        <i class="fa-solid fa-pencil var-v2-entry-edit" data-entry-id="${entry.id}"></i>
                        <i class="fa-solid fa-trash var-v2-entry-delete" data-entry-id="${entry.id}"></i>
                    </span>
                </div>
                <div class="var-v2-entry-content">${escapeHtml(entry.content)}</div>
            </div>
        `).join('');

  const html = `
        <div class="var-v2-detail-header">
            <button class="var-v2-back-btn" id="var-v2-back-to-main">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <span class="var-v2-detail-title">{{${variable.name}}}</span>
            <span class="var-v2-detail-mode">叠加</span>
        </div>
        <div class="var-v2-detail-body">
            <div class="var-v2-detail-info-compact">
                <span>标签: ${escapeHtml(variable.tag)}</span>
                <span>条目: ${entries.length}</span>
            </div>
            <div class="var-v2-entries-section">
                <div class="var-v2-entries-list" id="var-v2-entries-list">
                    ${entriesHTML}
                </div>
            </div>
        </div>
    `;

  // 切换页面
  const mainPage = windowElement.querySelector('#var-v2-page-main');
  const detailPage = windowElement.querySelector('#var-v2-page-detail');

  if (mainPage && detailPage) {
    mainPage.classList.add('hidden');
    detailPage.classList.remove('hidden');

    // 清空并重建详情页内容（避免事件监听器累积）
    // 通过替换 innerHTML 来清除旧的事件监听器
    detailPage.innerHTML = '';
    detailPage.innerHTML = html;
    detailPage.dataset.varId = varId;
    detailPage.dataset.chatId = chatId;

    // 使用 AbortController 管理事件监听器
    if (detailPage._abortController) {
      detailPage._abortController.abort();
    }
    detailPage._abortController = new AbortController();
    const signal = detailPage._abortController.signal;

    // 绑定返回按钮
    detailPage.querySelector('#var-v2-back-to-main')?.addEventListener('click', backToMainPage, { signal });

    // 绑定条目事件
    bindStackDetailPageEvents(detailPage, varId, chatId, variable, signal);
  }
}

/**
 * 显示覆盖模式详情页（页面切换，不是弹窗）
 *
 * @description
 * 在窗口内切换到详情页，显示覆盖模式变量的当前值和历史导航。
 * 支持前后翻页、应用历史版本等操作。
 *
 * @async
 * @param {string} varId - 变量ID
 * @param {Object} variable - 变量定义对象
 * @returns {Promise<void>}
 */
async function showReplaceDetailPage(varId, variable) {
  if (!windowElement) return;

  const variableManager = getVariableManagerV2();
  const ctx = getContext();
  const chatId = ctx?.chatId;

  if (!chatId) {
    toastr.warning('请先打开一个聊天');
    return;
  }

  const value = await variableManager.getReplaceValue(varId, chatId);
  const displayValue = await variableManager.getCurrentDisplayValue(varId, chatId);
  const total = value.history.length + (value.currentValue ? 1 : 0);
  const currentIndex = value.historyIndex === -1 ? total : value.historyIndex + 1;
  const hasValue = displayValue.content && displayValue.content.trim() !== '';

  const html = `
        <div class="var-v2-detail-header">
            <button class="var-v2-back-btn" id="var-v2-back-to-main">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <span class="var-v2-detail-title">{{${variable.name}}}</span>
            <span class="var-v2-detail-mode">覆盖</span>
        </div>
        <div class="var-v2-detail-body">
            <div class="var-v2-detail-info-compact">
                <span>标签: ${escapeHtml(variable.tag)}</span>
                <span id="var-v2-floor-info">第 ${displayValue.floorRange || '?'} 楼</span>
            </div>
            <div class="var-v2-current-section">
                <div class="var-v2-current-label" id="var-v2-value-label">
                    ${displayValue.isHistory ? '历史版本' : '当前值'}
                </div>
                <div class="var-v2-current-content" id="var-v2-current-content">
                    ${hasValue ? escapeHtml(displayValue.content) : '<span class="var-v2-empty">暂无值</span>'}
                </div>
            </div>
            <div class="var-v2-history-nav" ${total <= 1 ? 'style="display:none"' : ''}>
                <button class="var-v2-btn small" id="var-v2-prev" ${currentIndex <= 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span id="var-v2-pos">${currentIndex} / ${total}</span>
                <button class="var-v2-btn small" id="var-v2-next" ${currentIndex >= total ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
            <div class="var-v2-history-actions" id="var-v2-apply-section" ${!displayValue.isHistory ? 'style="display:none"' : ''}>
                <button class="var-v2-btn primary small" id="var-v2-apply">应用此历史版本</button>
            </div>
        </div>
    `;

  // 切换页面
  const mainPage = windowElement.querySelector('#var-v2-page-main');
  const detailPage = windowElement.querySelector('#var-v2-page-detail');

  if (mainPage && detailPage) {
    mainPage.classList.add('hidden');
    detailPage.classList.remove('hidden');

    // 清空并重建详情页内容（避免事件监听器累积）
    detailPage.innerHTML = '';
    detailPage.innerHTML = html;
    detailPage.dataset.varId = varId;
    detailPage.dataset.chatId = chatId;

    // 使用 AbortController 管理事件监听器
    if (detailPage._abortController) {
      detailPage._abortController.abort();
    }
    detailPage._abortController = new AbortController();
    const signal = detailPage._abortController.signal;

    // 绑定返回按钮
    detailPage.querySelector('#var-v2-back-to-main')?.addEventListener('click', backToMainPage, { signal });

    // 绑定历史导航事件
    bindReplaceDetailPageEvents(detailPage, varId, chatId, variable, signal);
  }
}

/**
 * 返回主页面
 *
 * @description
 * 从详情页切换回主页面，清空详情页内容。
 */
function backToMainPage() {
  if (!windowElement) return;

  const mainPage = windowElement.querySelector('#var-v2-page-main');
  const detailPage = windowElement.querySelector('#var-v2-page-detail');

  if (mainPage && detailPage) {
    detailPage.classList.add('hidden');
    detailPage.innerHTML = '';
    mainPage.classList.remove('hidden');
  }
}

/**
 * 绑定叠加模式详情页事件
 *
 * @description
 * 为叠加模式详情页绑定事件委托，处理：
 * - 条目展开/折叠
 * - 切换条目可见性
 * - 编辑条目内容
 * - 删除条目
 *
 * @param {HTMLElement} container - 详情页容器元素
 * @param {string} varId - 变量ID
 * @param {string} chatId - 聊天ID
 * @param {Object} variable - 变量定义对象
 * @param {AbortSignal} [signal] - 用于取消事件监听器的信号
 */
function bindStackDetailPageEvents(container, varId, chatId, variable, signal) {
  const variableManager = getVariableManagerV2();

  // 刷新条目列表的辅助函数
  const refreshEntriesList = async () => {
    const value = await variableManager.getStackValue(varId, chatId);
    const entries = value.entries || [];

    // 按数组顺序显示，索引+1 作为显示编号（拖拽排序后编号会变）
    const entriesHTML = entries.length === 0
      ? '<div class="var-v2-empty">暂无条目</div>'
      : entries.map((entry, index) => `
                <div class="var-v2-entry ${entry.hidden ? 'entry-hidden' : ''}" data-entry-id="${entry.id}" draggable="true">
                    <div class="var-v2-entry-header">
                        <span class="var-v2-entry-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                        <span class="var-v2-entry-toggle"><i class="fa-solid fa-chevron-right"></i></span>
                        <span class="var-v2-entry-title">#${index + 1} - 第${entry.floorRange || '?'}楼</span>
                        <span class="var-v2-entry-time">${formatTime(entry.timestamp)}</span>
                        <span class="var-v2-entry-actions">
                            <i class="fa-solid ${entry.hidden ? 'fa-eye-slash' : 'fa-eye'} var-v2-entry-visibility" data-entry-id="${entry.id}"></i>
                            <i class="fa-solid fa-pencil var-v2-entry-edit" data-entry-id="${entry.id}"></i>
                            <i class="fa-solid fa-trash var-v2-entry-delete" data-entry-id="${entry.id}"></i>
                        </span>
                    </div>
                    <div class="var-v2-entry-content collapsed">${escapeHtml(entry.content)}</div>
                </div>
            `).join('');

    const listEl = container.querySelector('#var-v2-entries-list');
    if (listEl) {
      listEl.innerHTML = entriesHTML;
    }

    // 更新条目数量
    const countEl = container.querySelector('.var-v2-detail-info-compact span:last-child');
    if (countEl) {
      countEl.textContent = `条目: ${entries.length}`;
    }
  };

  container.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // 展开/折叠
    if (target.closest('.var-v2-entry-header') && !target.closest('.var-v2-entry-actions')) {
      const entry = target.closest('.var-v2-entry');
      if (entry) {
        const content = entry.querySelector('.var-v2-entry-content');
        const icon = entry.querySelector('.var-v2-entry-toggle i');
        if (content && icon) {
          content.classList.toggle('collapsed');
          icon.classList.toggle('fa-chevron-right');
          icon.classList.toggle('fa-chevron-down');
        }
      }
    }

    // 切换可见性
    if (target.classList.contains('var-v2-entry-visibility')) {
      const entryId = parseInt(target.dataset.entryId);
      const result = await variableManager.toggleEntryVisibility(varId, chatId, entryId);
      if (result.success) {
        // 刷新整个列表以确保状态正确
        await refreshEntriesList();
      }
    }

    // 编辑
    if (target.classList.contains('var-v2-entry-edit')) {
      const entryId = parseInt(target.dataset.entryId);
      const value = await variableManager.getStackValue(varId, chatId);
      const entry = value.entries.find(e => e.id === entryId);
      if (!entry) return;

      const editResult = await showInternalPopup('编辑条目', `
                <div class="var-v2-form">
                    <textarea id="var-v2-edit-content" rows="6">${escapeHtml(entry.content)}</textarea>
                </div>
            `, {
        buttons: [
          { text: '取消', value: null },
          { text: '保存', value: 'save', class: 'primary' }
        ],
        beforeClose: (val, o) => val === 'save' ? o.querySelector('#var-v2-edit-content')?.value : null
      });

      if (editResult) {
        await variableManager.updateEntry(varId, chatId, entryId, editResult);
        await refreshEntriesList();
        toastr.success('条目已保存');
      }
    }

    // 删除
    if (target.classList.contains('var-v2-entry-delete')) {
      const entryId = parseInt(target.dataset.entryId);
      const confirmed = await showInternalConfirm('删除条目', '确定删除？', { danger: true, okButton: '删除' });
      if (confirmed) {
        const result = await variableManager.deleteEntry(varId, chatId, entryId);
        if (result.success) {
          await refreshEntriesList();
          toastr.success('条目已删除');
        } else {
          toastr.error(result.error || '删除失败');
        }
      }
    }
  }, { signal });

  // 拖拽排序事件
  const entriesList = container.querySelector('#var-v2-entries-list');
  if (entriesList) {
    let draggedEntry = null;
    let draggedEntryId = null;

    entriesList.addEventListener('dragstart', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (!target.classList.contains('var-v2-entry')) return;

      draggedEntry = target;
      draggedEntryId = parseInt(target.dataset.entryId);
      target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }, { signal });

    entriesList.addEventListener('dragend', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      target.classList.remove('dragging');
      draggedEntry = null;
      draggedEntryId = null;

      entriesList.querySelectorAll('.var-v2-entry').forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    }, { signal });

    entriesList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const target = /** @type {HTMLElement} */ (e.target).closest('.var-v2-entry');
      if (!target || target === draggedEntry) return;

      const rect = target.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      entriesList.querySelectorAll('.var-v2-entry').forEach(item => {
        if (item !== target) {
          item.classList.remove('drag-over-top', 'drag-over-bottom');
        }
      });

      if (e.clientY < midY) {
        target.classList.add('drag-over-top');
        target.classList.remove('drag-over-bottom');
      } else {
        target.classList.add('drag-over-bottom');
        target.classList.remove('drag-over-top');
      }
    }, { signal });

    entriesList.addEventListener('drop', async (e) => {
      e.preventDefault();

      const target = /** @type {HTMLElement} */ (e.target).closest('.var-v2-entry');
      if (!target || !draggedEntryId) return;

      const targetEntryId = parseInt(target.dataset.entryId);
      if (targetEntryId === draggedEntryId) return;

      // 获取当前条目顺序
      const value = await variableManager.getStackValue(varId, chatId);
      const entries = value.entries || [];
      const currentOrder = entries.map(e => e.id);

      const draggedIndex = currentOrder.indexOf(draggedEntryId);
      const targetIndex = currentOrder.indexOf(targetEntryId);

      if (draggedIndex === -1 || targetIndex === -1) return;

      // 计算新顺序
      const rect = target.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;

      const newOrder = [...currentOrder];
      newOrder.splice(draggedIndex, 1);

      let newIndex = targetIndex;
      if (draggedIndex < targetIndex) {
        newIndex = insertBefore ? targetIndex - 1 : targetIndex;
      } else {
        newIndex = insertBefore ? targetIndex : targetIndex + 1;
      }

      newOrder.splice(newIndex, 0, draggedEntryId);

      // 调用 reorderEntries 保存新顺序
      const result = await variableManager.reorderEntries(varId, chatId, newOrder);
      if (result.success) {
        await refreshEntriesList();
        logger.debug('variable', '[VariableListUIV2] 条目排序已更新');
      } else {
        toastr.error(result.error || '排序失败');
      }

      target.classList.remove('drag-over-top', 'drag-over-bottom');
    }, { signal });
  }
}

/**
 * 绑定覆盖模式详情页事件
 *
 * @description
 * 为覆盖模式详情页绑定事件，处理：
 * - 历史导航（上一条/下一条）
 * - 应用历史版本为当前值
 *
 * @param {HTMLElement} container - 详情页容器元素
 * @param {string} varId - 变量ID
 * @param {string} chatId - 聊天ID
 * @param {Object} variable - 变量定义对象
 * @param {AbortSignal} [signal] - 用于取消事件监听器的信号
 */
function bindReplaceDetailPageEvents(container, varId, chatId, variable, signal) {
  const variableManager = getVariableManagerV2();

  const refresh = async () => {
    const value = await variableManager.getReplaceValue(varId, chatId);
    const displayValue = await variableManager.getCurrentDisplayValue(varId, chatId);
    const total = value.history.length + (value.currentValue ? 1 : 0);
    const currentIndex = value.historyIndex === -1 ? total : value.historyIndex + 1;
    const hasValue = displayValue.content && displayValue.content.trim() !== '';

    const contentEl = container.querySelector('#var-v2-current-content');
    const labelEl = container.querySelector('#var-v2-value-label');
    const floorEl = container.querySelector('#var-v2-floor-info');
    const posEl = container.querySelector('#var-v2-pos');
    const prevBtn = /** @type {HTMLButtonElement} */ (container.querySelector('#var-v2-prev'));
    const nextBtn = /** @type {HTMLButtonElement} */ (container.querySelector('#var-v2-next'));
    const applySection = container.querySelector('#var-v2-apply-section');

    if (contentEl) contentEl.innerHTML = hasValue ? escapeHtml(displayValue.content) : '<span class="var-v2-empty">暂无值</span>';
    if (labelEl) labelEl.textContent = displayValue.isHistory ? '历史版本' : '当前值';
    if (floorEl) floorEl.textContent = `第 ${displayValue.floorRange || '?'} 楼`;
    if (posEl) posEl.textContent = `${currentIndex} / ${total}`;
    if (prevBtn) prevBtn.disabled = currentIndex <= 1;
    if (nextBtn) nextBtn.disabled = currentIndex >= total;
    if (applySection) applySection.style.display = displayValue.isHistory ? '' : 'none';
  };

  container.querySelector('#var-v2-prev')?.addEventListener('click', async () => {
    await variableManager.navigateHistory(varId, chatId, 'prev');
    await refresh();
  }, { signal });

  container.querySelector('#var-v2-next')?.addEventListener('click', async () => {
    await variableManager.navigateHistory(varId, chatId, 'next');
    await refresh();
  }, { signal });

  container.querySelector('#var-v2-apply')?.addEventListener('click', async () => {
    const value = await variableManager.getReplaceValue(varId, chatId);
    if (value.historyIndex >= 0) {
      const confirmed = await showInternalConfirm('应用历史版本', '确定要将此历史版本设为当前值吗？', { okButton: '应用' });
      if (confirmed) {
        await variableManager.applyHistoryVersion(varId, chatId, value.historyIndex);
        await refresh();
        toastr.success('已应用历史版本');
      }
    }
  }, { signal });
}

// 保留旧函数名作为兼容（内部调用新函数）
// 注意：这些函数已被新的页面切换版本替代

// ============================================
// 第十部分：发送分析
// ============================================

/**
 * 处理发送分析
 *
 * @description
 * 触发当前套装的 AI 分析流程：
 * 1. 如果正在分析中，则中止分析
 * 2. 否则开始分析，更新发送状态栏
 * 3. 分析完成后自动更新返回预览区域并切换到返回预览标签页
 * 4. 弹窗询问是否确认分配结果到变量
 *
 * @async
 * @returns {Promise<void>}
 */
async function handleSendAnalysis() {
  if (!windowElement) return;

  const suiteManager = getSuiteManager();
  const suite = suiteManager.getActiveSuite();
  if (!suite) {
    toastr.warning('请先选择套装');
    return;
  }

  const ctx = getContext();
  if (!ctx?.chatId) {
    toastr.warning('请先打开一个聊天');
    return;
  }

  const queueManager = getSendQueueManager();
  const suiteStatus = queueManager.getSuiteStatus(suite.id);

  switch (suiteStatus.status) {
    case 'processing':
      // 正在分析，点击终止
      queueManager.abortSuite(suite.id);
      updateSendBarStatus('terminated');
      toastr.info('已终止分析');
      break;

    case 'pending':
      // 在队列中等待，点击取消
      queueManager.abortSuite(suite.id);
      refreshSendBarStatus();
      toastr.info('已从队列移除');
      break;

    case 'paused':
      // 已暂停，点击继续
      if (suiteStatus.task) {
        queueManager.resume(suiteStatus.task.id);
      }
      refreshSendBarStatus();
      break;

    case 'idle':
    default:
      // 空闲，入队发送
      queueManager.enqueue(suite.id, suite.name, 'manual');
      refreshSendBarStatus();
      toastr.info('已加入发送队列');
      break;
  }
}

/**
 * 更新发送栏状态（根据当前套装在队列中的状态）
 * @param {'idle' | 'analyzing' | 'pending' | 'paused' | 'terminated'} [forceStatus] - 强制设置状态（可选）
 * @param {number} [position] - 队列位置（pending 状态时使用）
 */
function updateSendBarStatus(forceStatus, position) {
  if (!windowElement) return;

  const statusEl = windowElement.querySelector('#var-v2-send-status');
  const sendBtn = windowElement.querySelector('#var-v2-send-btn');

  if (!statusEl || !sendBtn) return;

  // 如果没有强制状态，从队列管理器获取当前套装状态
  let status = forceStatus;
  let queuePosition = position;

  if (!status) {
    const suiteManager = getSuiteManager();
    const suite = suiteManager.getActiveSuite();
    if (suite) {
      const queueManager = getSendQueueManager();
      const suiteStatus = queueManager.getSuiteStatus(suite.id);
      status = suiteStatus.status === 'processing' ? 'analyzing' : suiteStatus.status;
      queuePosition = suiteStatus.position;
    } else {
      status = 'idle';
    }
  }

  switch (status) {
    case 'idle':
      statusEl.innerHTML = '<span class="status-text">空闲</span>';
      statusEl.className = 'var-v2-send-status';
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>发送分析</span>';
      sendBtn.classList.remove('analyzing', 'pending');
      break;
    case 'analyzing':
      statusEl.innerHTML = '<span class="status-text"><i class="fa-solid fa-spinner fa-spin"></i> 分析中...</span>';
      statusEl.className = 'var-v2-send-status analyzing';
      sendBtn.innerHTML = '<i class="fa-solid fa-stop"></i><span>终止</span>';
      sendBtn.classList.add('analyzing');
      sendBtn.classList.remove('pending');
      break;
    case 'pending':
      statusEl.innerHTML = `<span class="status-text"><i class="fa-solid fa-clock"></i> 队列中(第${queuePosition || '?'}位)</span>`;
      statusEl.className = 'var-v2-send-status pending';
      sendBtn.innerHTML = '<i class="fa-solid fa-xmark"></i><span>取消</span>';
      sendBtn.classList.add('pending');
      sendBtn.classList.remove('analyzing');
      break;
    case 'paused':
      statusEl.innerHTML = '<span class="status-text"><i class="fa-solid fa-pause"></i> 已暂停</span>';
      statusEl.className = 'var-v2-send-status paused';
      sendBtn.innerHTML = '<i class="fa-solid fa-play"></i><span>继续</span>';
      sendBtn.classList.remove('analyzing', 'pending');
      break;
    case 'terminated':
      statusEl.innerHTML = '<span class="status-text">已终止</span>';
      statusEl.className = 'var-v2-send-status terminated';
      sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>发送分析</span>';
      sendBtn.classList.remove('analyzing', 'pending');
      // 2秒后刷新状态
      setTimeout(() => updateSendBarStatus(), 2000);
      break;
  }
}

/**
 * 刷新当前套装的发送栏状态
 * 在切换套装、队列变化时调用
 */
function refreshSendBarStatus() {
  updateSendBarStatus();
}

// ============================================
// 第十一部分：API 设置（已迁移到 variable-api-settings-ui.js）
// ============================================

/**
 * 打开 API 设置弹窗（调用新的 V2 API 设置页面）
 */
async function openAPISettingsPopup() {
  const { openAPISettingsPage } = await import('./variable-api-settings-ui.js');
  await openAPISettingsPage();
}

/**
 * 打开教程弹窗
 */
function openHelpPopup() {
  const content = `
        <div class="var-v2-help-tabs">
            <div class="var-v2-help-tab active" data-tab="intro">快速开始</div>
            <div class="var-v2-help-tab" data-tab="items">条目类型</div>
            <div class="var-v2-help-tab" data-tab="syntax">变量语法</div>
            <div class="var-v2-help-tab" data-tab="trigger">触发方式</div>
            <div class="var-v2-help-tab" data-tab="stack-replace">叠加/覆盖</div>
            <div class="var-v2-help-tab" data-tab="queue">队列说明</div>
        </div>

        <!-- 标签页内容 -->
        <div class="var-v2-help-pages">
            <!-- 快速开始 -->
            <div class="var-v2-help-page active" id="var-v2-help-page-intro">
                <h3><i class="fa-solid fa-rocket"></i> 动态变量是什么？</h3>
                <p>动态变量是一个 <strong>AI 分析工具</strong>，帮你：</p>
                <ul>
                    <li>自动分析聊天内容，提取摘要、状态等信息</li>
                    <li>把这些信息存成变量，供后续对话使用</li>
                    <li>让 AI 更好地记住之前的剧情发展</li>
                </ul>

                <h3><i class="fa-solid fa-play"></i> 第一次使用？按这个顺序来：</h3>
                <div class="var-v2-help-steps">
                    <div class="step">
                        <span class="step-num">1</span>
                        <div class="step-content">
                            <strong>点击「变量」按钮</strong>
                            <p>创建一个变量（比如叫 summary），设置标签为 [摘要]</p>
                        </div>
                    </div>
                    <div class="step">
                        <span class="step-num">2</span>
                        <div class="step-content">
                            <strong>点击「提示词」按钮</strong>
                            <p>添加分析指令，比如："请分析聊天内容，提取摘要"</p>
                        </div>
                    </div>
                    <div class="step">
                        <span class="step-num">3</span>
                        <div class="step-content">
                            <strong>点击「正文」按钮</strong>
                            <p>选择要分析的聊天楼层（比如最近 20 楼）</p>
                        </div>
                    </div>
                    <div class="step">
                        <span class="step-num">4</span>
                        <div class="step-content">
                            <strong>点击「发送分析」</strong>
                            <p>AI 会分析聊天，把结果存到变量里</p>
                        </div>
                    </div>
                    <div class="step">
                        <span class="step-num">5</span>
                        <div class="step-content">
                            <strong>在世界书/预设中使用变量</strong>
                            <p>用 <code>{{summary}}</code> 获取变量内容</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 条目类型 -->
            <div class="var-v2-help-page" id="var-v2-help-page-items">
                <h3><i class="fa-solid fa-layer-group"></i> 三种条目类型</h3>

                <div class="help-card">
                    <div class="help-card-header">
                        <i class="fa-solid fa-file-lines"></i>
                        <strong>提示词条目</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>作用：</strong>发送给 AI 的指令，告诉 AI 要做什么分析</p>
                        <p><strong>开关效果：</strong></p>
                        <table class="var-v2-help-table">
                            <tr><th>🔘 开启</th><td>这条提示词会发送给 AI，参与分析</td></tr>
                            <tr><th>⚪ 关闭</th><td>这条提示词不发送给 AI，AI 看不到</td></tr>
                        </table>
                        <p><strong>示例：</strong>「请分析最近聊天，提取角色状态变化」</p>
                    </div>
                </div>

                <div class="help-card">
                    <div class="help-card-header">
                        <i class="fa-solid fa-comments"></i>
                        <strong>正文条目</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>作用：</strong>发送给 AI 的聊天内容（可以选择要哪几楼）</p>
                        <p><strong>开关效果：</strong></p>
                        <table class="var-v2-help-table">
                            <tr><th>🔘 开启</th><td>这些聊天楼层会发送给 AI</td></tr>
                            <tr><th>⚪ 关闭</th><td>这些聊天楼层不发送给 AI</td></tr>
                        </table>
                        <p><strong>示例：</strong>选择「最新 20 楼」，AI 就会看到最近的 20 条消息</p>
                    </div>
                </div>

                <div class="help-card">
                    <div class="help-card-header">
                        <i class="fa-solid fa-code"></i>
                        <strong>变量条目</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>作用：</strong>告诉 AI 返回什么格式（告诉 AI 要用什么标签输出）</p>
                        <p><strong>开关效果：</strong></p>
                        <table class="var-v2-help-table">
                            <tr><th>🔘 开启</th><td>AI 会被要求用这个变量的标签返回（比如 [摘要]...[/摘要]）</td></tr>
                            <tr><th>⚪ 关闭</th><td>AI 不知道要返回什么格式，分析结果不会被保存</td></tr>
                        </table>
                        <p><strong>示例：</strong>变量标签设为 [摘要]，AI 返回必须是：<br><code>[摘要]这是摘要内容[/摘要]</code></p>
                    </div>
                </div>

                <div class="var-v2-help-warning">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <div>
                        <p><strong>重要：变量名只能用英文！</strong></p>
                        <p>SillyTavern 宏引擎不支持中文变量名。</p>
                        <p>❌ 错误：摘要、角色状态<br>✅ 正确：summary、char_status</p>
                    </div>
                </div>
            </div>

            <!-- 变量语法 -->
            <div class="var-v2-help-page" id="var-v2-help-page-syntax">
                <h3><i class="fa-solid fa-at"></i> 变量引用语法</h3>
                <p>在提示词或世界书中，可以用 <code>{{变量名}}</code> 来获取变量的内容。</p>

                <h4>基本用法</h4>
                <table class="var-v2-help-table">
                    <tr>
                        <th><code>{{summary}}</code></th>
                        <td>获取变量的全部内容</td>
                    </tr>
                    <tr>
                        <th><code>{{summary@1}}</code></th>
                        <td>获取第 1 条内容（叠加模式下）</td>
                    </tr>
                    <tr>
                        <th><code>{{summary@1-5}}</code></th>
                        <td>获取第 1 到 5 条内容</td>
                    </tr>
                    <tr>
                        <th><code>{{summary@end-5}}</code></th>
                        <td>获取最后 5 条内容</td>
                    </tr>
                </table>

                <h4>酒馆楼层引用</h4>
                <table class="var-v2-help-table">
                    <tr>
                        <th><code>{{酒馆楼层@1-10}}</code></th>
                        <td>获取第 1 到 10 楼的聊天内容</td>
                    </tr>
                    <tr>
                        <th><code>{{酒馆楼层@50-end}}</code></th>
                        <td>获取第 50 楼到最后的所有聊天</td>
                    </tr>
                </table>

                <h4>嵌套宏</h4>
                <p>支持在范围中使用 SillyTavern 内置宏：</p>
                <table class="var-v2-help-table">
                    <tr>
                        <th><code>{{LastMessageId}}</code></th>
                        <td>获取最新消息的楼层号</td>
                    </tr>
                    <tr>
                        <th><code>{{summary@1-{{LastMessageId}}}}</code></th>
                        <td>获取第 1 条到最新</td>
                    </tr>
                </table>

                <div class="var-v2-help-tip">
                    <i class="fa-solid fa-lightbulb"></i>
                    <div>
                        <p><strong>提示：</strong>变量引用可以在任何地方使用，包括：</p>
                        <ul>
                            <li>提示词条目中</li>
                            <li>世界书条目中</li>
                            <li>预设中</li>
                            <li>角色卡描述中</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- 触发方式 -->
            <div class="var-v2-help-page" id="var-v2-help-page-trigger">
                <h3><i class="fa-solid fa-bolt"></i> 触发方式说明</h3>

                <div class="help-card">
                    <div class="help-card-header">
                        <i class="fa-solid fa-hand-pointer"></i>
                        <strong>手动触发</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>怎么触发：</strong>点击底部的「发送分析」按钮</p>
                        <p><strong>使用场景：</strong>你想什么时候分析就什么时候点，适合临时分析</p>
                    </div>
                </div>

                <div class="help-card">
                    <div class="help-card-header">
                        <i class="fa-solid fa-clock"></i>
                        <strong>间隔触发</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>怎么触发：</strong>每 N 条消息自动触发一次</p>
                        <p><strong>使用场景：</strong>想要 AI 定期总结剧情，比如"每 10 楼"</p>
                        <p><strong>注意：</strong>触发后任务会加入队列，按顺序执行</p>
                    </div>
                </div>

                <div class="help-card">
                    <div class="help-card-header">
                        <i class="fa-solid fa-key"></i>
                        <strong>关键词触发</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>怎么触发：</strong>当聊天中出现指定关键词时触发</p>
                        <p><strong>使用场景：</strong>当剧情发展到某个阶段时自动分析</p>
                        <p><strong>示例：</strong>设置关键词为"回忆"，当有人说"回忆"时自动触发</p>
                    </div>
                </div>
            </div>

            <!-- 叠加/覆盖 -->
            <div class="var-v2-help-page" id="var-v2-help-page-stack-replace">
                <h3><i class="fa-solid fa-code-branch"></i> 叠加模式 vs 覆盖模式</h3>
                <p>创建变量时需要选择模式，这决定了变量如何存储数据。</p>

                <div class="help-card stack">
                    <div class="help-card-header">
                        <i class="fa-solid fa-layer-group"></i>
                        <strong>叠加模式（stack）</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>特点：</strong>每次分析结果<strong>追加</strong>到之前的内容后面</p>
                        <p><strong>数据结构：</strong>像一个列表，不断添加新条目</p>
                        <p><strong>使用场景：</strong>需要追踪历史变化的变量，比如：</p>
                        <ul>
                            <li>剧情摘要（每次总结都保存）</li>
                            <li>角色状态变化（每次状态更新都保存）</li>
                        </ul>
                        <p><strong>引用示例：</strong></p>
                        <table class="var-v2-help-table">
                            <tr><th><code>{{summary}}</code></th><td>获取所有摘要</td></tr>
                            <tr><th><code>{{summary@1-5}}</code></th><td>只获取前 5 条</td></tr>
                            <tr><th><code>{{summary@end}}</code></th><td>只获取最新的 1 条</td></tr>
                        </table>
                    </div>
                </div>

                <div class="help-card replace">
                    <div class="help-card-header">
                        <i class="fa-solid fa-rotate"></i>
                        <strong>覆盖模式（replace）</strong>
                    </div>
                    <div class="help-card-body">
                        <p><strong>特点：</strong>每次分析结果<strong>替换</strong>之前的内容</p>
                        <p><strong>数据结构：</strong>只保留最新值，有历史记录可以回溯</p>
                        <p><strong>使用场景：</strong>只需要最新值的变量，比如：</p>
                        <ul>
                            <li>当前时间（每次更新都替换）</li>
                            <li>角色位置（位置变了就覆盖）</li>
                        </ul>
                        <p><strong>引用示例：</strong></p>
                        <table class="var-v2-help-table">
                            <tr><th><code>{{location}}</code></th><td>获取当前位置</td></tr>
                            <tr><th>历史回溯</th><td>可以在变量详情页查看和切换历史版本</td></tr>
                        </table>
                    </div>
                </div>

                <div class="var-v2-help-tip">
                    <i class="fa-solid fa-lightbulb"></i>
                    <div>
                        <p><strong>怎么选？</strong></p>
                        <ul>
                            <li>需要历史记录 → 选 <strong>叠加</strong></li>
                            <li>只需要最新值 → 选 <strong>覆盖</strong></li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- 队列说明 -->
            <div class="var-v2-help-page" id="var-v2-help-page-queue">
                <h3><i class="fa-solid fa-list-check"></i> 发送队列说明</h3>
                <p>当多个套装同时触发分析时，任务会排队等候执行。</p>

                <h4>队列的作用</h4>
                <ul>
                    <li><strong>按顺序执行：</strong>一个任务完成后，再执行下一个</li>
                    <li><strong>防止冲突：</strong>避免多个分析同时进行导致混乱</li>
                    <li><strong>可控制：</strong>可以暂停、继续、移除任务</li>
                </ul>

                <h4>任务状态</h4>
                <table class="var-v2-help-table">
                    <tr>
                        <th><span class="status-dot pending"></span> pending</th>
                        <td>等待中，还没轮到这个任务</td>
                    </tr>
                    <tr>
                        <th><span class="status-dot processing"></span> processing</th>
                        <td>正在处理，当前正在分析</td>
                    </tr>
                    <tr>
                        <th><span class="status-dot paused"></span> paused</th>
                        <td>已暂停，需要手动继续</td>
                    </tr>
                </table>

                <h4>可以中断吗？</h4>
                <div class="var-v2-help-tip">
                    <i class="fa-solid fa-circle-info"></i>
                    <div>
                        <p><strong>正在进行的任务：</strong>可以点击「终止」按钮中断</p>
                        <p><strong>等待中的任务：</strong>可以点击「移除」按钮从队列删除</p>
                        <p><strong>暂停的任务：</strong>点击「继续」恢复执行</p>
                    </div>
                </div>

                <h4>快照模式 vs 实时模式</h4>
                <table class="var-v2-help-table">
                    <tr>
                        <th>入队时快照（默认）</th>
                        <td>任务入队时记录楼层数，处理时使用入队的楼层</td>
                    </tr>
                    <tr>
                        <th>实时获取</th>
                        <td>任务处理时使用当前最新的楼层数</td>
                    </tr>
                </table>
                <p><strong>建议：</strong>保持默认的「入队时快照」，避免分析到新消息</p>

                <h4>头部队列徽章</h4>
                <p>窗口头部显示的数字表示队列中等待的任务数量，点击可查看详情。</p>
            </div>
        </div>
    `;

  showInternalPopup('使用教程', content, {
    buttons: [
      { text: '我知道了', value: null }
    ],
    width: 550,
    onShow: (popup) => {
      // 绑定标签页切换
      popup.querySelectorAll('.var-v2-help-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          // 移除所有 active 状态
          popup.querySelectorAll('.var-v2-help-tab').forEach(t => t.classList.remove('active'));
          popup.querySelectorAll('.var-v2-help-page').forEach(p => p.classList.remove('active'));
          // 添加 active 状态
          tab.classList.add('active');
          const tabName = tab.dataset.tab;
          popup.querySelector(`#var-v2-help-page-${tabName}`)?.classList.add('active');
        });
      });
    }
  });
}

// ============================================
// 第十二部分：发送队列
// ============================================

/**
 * 打开队列弹窗
 * 显示当前队列中的所有任务，支持暂停/继续/移除操作
 */
function openQueuePopup() {
  const queueManager = getSendQueueManager();
  const tasks = queueManager.getTasks();
  const useSnapshot = queueManager.getSnapshotMode();

  const content = `
        <div class="var-v2-queue-content">
            <!-- 快照模式设置 -->
            <div class="var-v2-queue-settings">
                <label class="var-v2-queue-setting-item">
                    <input type="checkbox" id="var-v2-queue-snapshot" ${useSnapshot ? 'checked' : ''}>
                    <span>入队时快照楼层</span>
                </label>
                <small class="var-v2-queue-hint">
                    ${useSnapshot ? '使用入队时的楼层数计算正文范围' : '使用处理时的实时楼层数'}
                </small>
            </div>

            <!-- 队列列表 -->
            <div class="var-v2-queue-list" id="var-v2-queue-list">
                ${tasks.length === 0 ? `
                    <div class="var-v2-queue-empty">
                        <i class="fa-solid fa-inbox"></i>
                        <p>队列为空</p>
                        <small>触发发送后，任务会显示在这里</small>
                    </div>
                ` : tasks.map(task => buildQueueTaskItem(task)).join('')}
            </div>
        </div>
    `;

  const popup = showInternalPopup('发送队列', content, {
    buttons: [
      { text: '清空队列', value: 'clear', className: 'var-v2-btn-danger' },
      { text: '关闭', value: null }
    ]
  });

  // 绑定事件
  popup.then(result => {
    if (result === 'clear') {
      queueManager.clear();
      toastr.info('队列已清空');
    }
  });

  // 快照模式切换
  setTimeout(() => {
    const snapshotCheckbox = document.querySelector('#var-v2-queue-snapshot');
    snapshotCheckbox?.addEventListener('change', (e) => {
      const checked = /** @type {HTMLInputElement} */ (e.target).checked;
      queueManager.setSnapshotMode(checked);

      // 更新提示文字
      const hint = document.querySelector('.var-v2-queue-hint');
      if (hint) {
        hint.textContent = checked
          ? '使用入队时的楼层数计算正文范围'
          : '使用处理时的实时楼层数';
      }
    });

    // 绑定任务操作按钮
    bindQueueTaskEvents();
  }, 0);
}

/**
 * 构建队列任务项 HTML
 * @param {import('../send-queue-manager.js').QueueTask} task
 * @returns {string}
 */
function buildQueueTaskItem(task) {
  const statusIcon = {
    'pending': 'fa-clock',
    'processing': 'fa-spinner fa-spin',
    'paused': 'fa-pause'
  }[task.status];

  const statusText = {
    'pending': '等待中',
    'processing': '处理中',
    'paused': '已暂停'
  }[task.status];

  const triggerIcon = {
    'manual': 'fa-hand-pointer',
    'interval': 'fa-clock',
    'keyword': 'fa-key'
  }[task.triggerType || 'manual'];

  return `
        <div class="var-v2-queue-item" data-task-id="${task.id}">
            <div class="var-v2-queue-item-info">
                <span class="var-v2-queue-item-name">
                    <i class="fa-solid ${triggerIcon}"></i>
                    ${escapeHtml(task.suiteName)}
                </span>
                <span class="var-v2-queue-item-status ${task.status}">
                    <i class="fa-solid ${statusIcon}"></i>
                    ${statusText}
                </span>
                <span class="var-v2-queue-item-snapshot">
                    楼层快照: ${task.chatLengthSnapshot}
                </span>
            </div>
            <div class="var-v2-queue-item-actions">
                ${task.status === 'paused' ? `
                    <button class="var-v2-queue-action" data-action="resume" title="继续">
                        <i class="fa-solid fa-play"></i>
                    </button>
                ` : task.status === 'pending' ? `
                    <button class="var-v2-queue-action" data-action="pause" title="暂停">
                        <i class="fa-solid fa-pause"></i>
                    </button>
                ` : ''}
                <button class="var-v2-queue-action danger" data-action="remove" title="移除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * 绑定队列任务操作事件
 */
function bindQueueTaskEvents() {
  const queueList = document.querySelector('#var-v2-queue-list');
  if (!queueList) return;

  queueList.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const actionBtn = target.closest('.var-v2-queue-action');
    if (!actionBtn) return;

    const taskItem = actionBtn.closest('.var-v2-queue-item');
    const taskId = taskItem?.dataset.taskId;
    const action = actionBtn.dataset.action;

    if (!taskId || !action) return;

    const queueManager = getSendQueueManager();

    switch (action) {
      case 'pause':
        queueManager.pause(taskId);
        refreshQueueList();
        break;
      case 'resume':
        queueManager.resume(taskId);
        refreshQueueList();
        break;
      case 'remove':
        queueManager.remove(taskId);
        refreshQueueList();
        break;
    }
  });
}

/**
 * 刷新队列列表显示
 */
function refreshQueueList() {
  const queueList = document.querySelector('#var-v2-queue-list');
  if (!queueList) return;

  const queueManager = getSendQueueManager();
  const tasks = queueManager.getTasks();

  if (tasks.length === 0) {
    queueList.innerHTML = `
            <div class="var-v2-queue-empty">
                <i class="fa-solid fa-inbox"></i>
                <p>队列为空</p>
                <small>触发发送后，任务会显示在这里</small>
            </div>
        `;
  } else {
    queueList.innerHTML = tasks.map(task => buildQueueTaskItem(task)).join('');
  }

  // 同步更新徽章
  updateQueueBadge(tasks.length);
}

/**
 * 更新队列徽章数字
 * @param {number} count - 队列中的任务数量
 */
function updateQueueBadge(count) {
  if (!windowElement) {
    logger.debug('variable', '[VariableListUIV2] updateQueueBadge: windowElement 为空');
    return;
  }

  const badge = windowElement.querySelector('#var-v2-queue-badge');
  if (!badge) {
    logger.debug('variable', '[VariableListUIV2] updateQueueBadge: badge 元素不存在');
    return;
  }

  logger.debug('variable', '[VariableListUIV2] 更新队列徽章:', count);

  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '0';
    badge.classList.add('hidden');
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 格式化时间
 * @param {number} timestamp
 * @returns {string}
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

// ============================================
// 导出
// ============================================

export {
  openWindow as openVariableManagerPopupV2
};

export default {
  renderVariableListPageV2,
  addExtensionsMenuButton,
  removeExtensionsMenuButton,
  openVariableManagerPopupV2: openWindow
};
