/**
 * 聊天工具 - 隐藏楼层管理
 *
 * @description
 * 在快捷回复栏注入幽灵按钮，点击弹出楼层隐藏状态面板。
 * 面板将所有楼层压缩为连续段（睁眼/闭眼），点击某段可快捷
 * 填入对应的 /hide 或 /unhide 命令到输入框。
 * 右上角"⚡"按钮展开快捷指令菜单（/del、/cut、/comment 等）。
 * 使用 MutationObserver 监听消息 is_system 属性变化，实时刷新面板。
 */

// ========================================
// 导入
// ========================================

import { extension_settings, getContext } from '../../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../../script.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';
import logger from '../logger.js';

// ========================================
// 常量
// ========================================

const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'chatTools';
const LOG_PREFIX = '[Hide]';

/**
 * 快捷指令列表
 * label: 显示名，desc: 用法说明，template: 填入输入框的模板
 */
const QUICK_COMMANDS = [
  {
    label: '/hide x-x',
    desc: '隐藏指定楼层范围，AI看不到这些消息。例：/hide 2-100',
    template: '/hide 0-0',
  },
  {
    label: '/unhide x-x',
    desc: '取消隐藏指定楼层范围，让AI重新看到。例：/unhide 2-100',
    template: '/unhide 0-0',
  },
  {
    label: '/del N',
    desc: '删除最后N条消息。例：/del 3 删除最后3条；不填数字进入手动选择',
    template: '/del ',
  },
  {
    label: '/cut x-x',
    desc: '永久剪切删除指定范围，不可恢复。例：/cut 0-10 删除0到10楼',
    template: '/cut 0-0',
  },
  {
    label: '/comment 文字',
    desc: '插入一条系统备注，仅显示不发送给AI。例：/comment 这里是转折点',
    template: '/comment ',
  },
];

// ========================================
// 状态
// ========================================

/** 功能是否启用 */
let isEnabled = false;

/** 面板容器元素（只创建一次） */
let panel = null;

/** 面板内容区元素 */
let panelContent = null;

/** 快捷指令下拉菜单元素（只创建一次） */
let quickMenu = null;

/** 面板是否可见 */
let isPanelVisible = false;

/** MutationObserver 实例，监听 is_system 属性变化 */
let mutationObserver = null;

/** 是否已注册全局事件监听 */
let eventsBound = false;

/** @type {{chatChanged: Function|null, messageDeleted: Function|null, userMessageRendered: Function|null, sendButtonClick: Function|null}} */
let savedHandlers = {
  chatChanged: null,
  messageDeleted: null,
  userMessageRendered: null,
  sendButtonClick: null,
};

/** @type {{element: HTMLElement|null, handle: HTMLElement|null, mousedown: Function|null, mousemove: Function|null, mouseup: Function|null}} */
let dragHandlers = {
  element: null,
  handle: null,
  mousedown: null,
  mousemove: null,
  mouseup: null,
};

// ========================================
// 初始化
// ========================================

/**
 * 初始化隐藏楼层管理功能
 * 注册事件监听
 */
export function initChatToolsHide() {
  logger.info(MODULE_NAME, `${LOG_PREFIX} 初始化隐藏楼层管理`);
  
  // 读取功能开关状态
  isEnabled = extension_settings[EXT_ID]?.chatTools?.hideEnabled ?? false;
  
  setupEvents();
  logger.info(MODULE_NAME, `${LOG_PREFIX} 初始化完成，功能状态: ${isEnabled}`);
}

/**
 * 禁用隐藏楼层管理功能并清理资源
 *
 * @description
 * 关闭时需要同时清理 eventSource 监听、MutationObserver、拖拽 document 监听和面板 DOM，
 * 否则会出现“功能关闭后仍在响应事件”的问题。
 *
 * @returns {void}
 * @throws {Error} 当事件系统异常时，removeListener 调用会抛出运行时异常
 * @example
 * disableChatToolsHide();
 */
export function disableChatToolsHide() {
  isEnabled = false;
  if (extension_settings[EXT_ID]?.chatTools) {
    extension_settings[EXT_ID].chatTools.hideEnabled = false;
    saveSettingsDebounced();
  }

  if (savedHandlers.chatChanged) {
    eventSource.removeListener(event_types.CHAT_CHANGED, savedHandlers.chatChanged);
    savedHandlers.chatChanged = null;
  }

  if (savedHandlers.messageDeleted) {
    eventSource.removeListener(event_types.MESSAGE_DELETED, savedHandlers.messageDeleted);
    savedHandlers.messageDeleted = null;
  }

  if (savedHandlers.userMessageRendered) {
    eventSource.removeListener(event_types.USER_MESSAGE_RENDERED, savedHandlers.userMessageRendered);
    savedHandlers.userMessageRendered = null;
  }

  const sendBtn = document.getElementById('send_but');
  if (sendBtn && savedHandlers.sendButtonClick) {
    sendBtn.removeEventListener('click', savedHandlers.sendButtonClick);
    savedHandlers.sendButtonClick = null;
  }

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  removeDraggableListeners();
  hidePanel();

  if (panel) {
    panel.remove();
    panel = null;
    panelContent = null;
  }

  if (quickMenu) {
    quickMenu.remove();
    quickMenu = null;
  }

  eventsBound = false;
  logger.info(MODULE_NAME, `${LOG_PREFIX} 隐藏楼层管理已禁用并完成清理`);
}

/**
 * 设置全局事件监听（只绑定一次）
 *
 * @description
 * 将所有需要在 disable 阶段释放的监听器都保存引用，避免匿名函数无法解绑。
 * 这样能保证聊天切换、删除消息和发送命令的监听不会在关闭后继续驻留。
 *
 * @returns {void}
 * @throws {Error} 当 eventSource 不可用时，事件系统会抛出运行时异常
 * @example
 * setupEvents();
 */
function setupEvents() {
  if (eventsBound) return;

  // 聊天切换：关闭面板，重设观察器
  savedHandlers.chatChanged = () => {
    logger.debug(MODULE_NAME, `${LOG_PREFIX} CHAT_CHANGED，关闭面板`);
    hidePanel();
    setupMutationObserver();
  };
  eventSource.on(event_types.CHAT_CHANGED, savedHandlers.chatChanged);

  // 消息删除：刷新面板
  savedHandlers.messageDeleted = () => {
    if (isPanelVisible) refreshPanel();
  };
  eventSource.on(event_types.MESSAGE_DELETED, savedHandlers.messageDeleted);

  // 用户发送消息后（包括 /hide /unhide 命令执行完毕后）：刷新面板
  // 解决问题：早期消息不在 DOM 里时，MutationObserver 无法捕获 is_system 变化
  savedHandlers.userMessageRendered = () => {
    if (isPanelVisible) refreshPanel();
  };
  eventSource.on(event_types.USER_MESSAGE_RENDERED, savedHandlers.userMessageRendered);

  // 监听发送按钮点击（斜杠命令不触发 USER_MESSAGE_RENDERED，改为监听发送动作本身）
  // 只有发送 /hide 或 /unhide 命令时才延迟刷新，避免浪费性能
  const sendBtn = document.getElementById('send_but');
  if (sendBtn) {
    savedHandlers.sendButtonClick = () => {
      if (!isPanelVisible) return;
      const textarea = /** @type {HTMLTextAreaElement} */ (document.getElementById('send_textarea'));
      const text = textarea?.value?.trim() || '';
      if (text.startsWith('/hide') || text.startsWith('/unhide')) {
        setTimeout(() => refreshPanel(), 600);
      }
    };
    sendBtn.addEventListener('click', savedHandlers.sendButtonClick);
  }

  eventsBound = true;
  logger.debug(MODULE_NAME, `${LOG_PREFIX} 事件监听已绑定`);
}

// ========================================
// 设置绑定
// ========================================

/**
 * 绑定设置面板事件
 */
export function bindHideSettings() {
  const checkbox = document.getElementById('chat-tools-hide-enabled');
  const infoLink = document.getElementById('chat-tools-hide-info-link');
  
  if (checkbox) {
    // 同步初始状态
    /** @type {HTMLInputElement} */ (checkbox).checked = isEnabled;
    
    checkbox.addEventListener('change', function() {
      const newState = /** @type {HTMLInputElement} */ (this).checked;
      if (!extension_settings[EXT_ID].chatTools) {
        extension_settings[EXT_ID].chatTools = {};
      }
      extension_settings[EXT_ID].chatTools.hideEnabled = newState;
      isEnabled = newState;
      saveSettingsDebounced();
      logger.info(MODULE_NAME, `${LOG_PREFIX} 功能开关状态变更: ${newState}`);

      if (!newState) {
        disableChatToolsHide();
        return;
      }

      if (!eventsBound) {
        setupEvents();
      }
      setupMutationObserver();
    });
  }
  
  if (infoLink) {
    infoLink.addEventListener('click', showInfoPopup);
  }
}

/**
 * 显示使用说明弹窗
 */
async function showInfoPopup() {
  const content = `
    <div style="max-height: 400px; overflow-y: auto; line-height: 1.6; font-size: 0.9em;">
      <h3 style="color: var(--SmartThemeQuoteColor); margin-top: 0;">
        <i class="fa-solid fa-ghost" style="margin-right: 8px;"></i>隐藏楼层管理
      </h3>
      
      <p><strong>功能说明</strong></p>
      <p>启用后，点击悬浮按钮菜单中的「楼层隐藏状态」，弹出面板查看所有楼层的隐藏/显示状态。</p>
      
      <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">
      
      <p><strong>面板交互</strong></p>
      <ul style="padding-left: 20px; margin: 10px 0;">
        <li>👁️ <strong>睡眼</strong> = 此范围未隐藏，点击 → 填入 /hide x-x（隐藏它）</li>
        <li>🚫 <strong>闭眼</strong> = 此范围已隐藏，点击 → 填入 /unhide x-x（取消隐藏）</li>
        <li>填入后需<strong>手动发送</strong>，不会自动执行</li>
      </ul>
      
      <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">
      
      <p><strong>⚡ 快捷指令</strong></p>
      <p>面板右上角点击闪电图标，展开常用指令模板：</p>
      <ul style="padding-left: 20px; margin: 10px 0; font-family: monospace; font-size: 0.9em;">
        <li>/hide x-x — 隐藏楼层范围</li>
        <li>/unhide x-x — 取消隐藏范围</li>
        <li>/del N — 删除最后N条消息</li>
        <li>/cut x-x — 永久删除指定范围</li>
        <li>/comment — 插入不发送给AI的备注</li>
      </ul>
      
      <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">
      
      <p><strong>实时更新</strong></p>
      <p>在消息上直接点击眼睛图标隐藏/显示时，面板会自动刷新。</p>
      
      <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">
      
      <p><strong>拖动面板</strong></p>
      <p>按住面板头部可拖动移动位置。</p>
    </div>
  `;
  
  await callGenericPopup(content, POPUP_TYPE.TEXT, '', {
    okButton: '知道了',
    wide: false,
    large: false
  });
}

// ========================================
// 面板逻辑
// ========================================

/**
 * 切换面板显示/隐藏状态（供外部调用）
 */
export function toggleHidePanel() {
  if (!isEnabled) {
    logger.warn(MODULE_NAME, `${LOG_PREFIX} 功能未启用，无法打开面板`);
    return;
  }
  
  if (isPanelVisible) {
    hidePanel();
  } else {
    showPanel();
  }
}

/**
 * 显示面板
 * 如果面板 DOM 未创建则先创建
 */
function showPanel() {
  if (!panel) createPanel();

  refreshPanel();
  panel.style.display = 'flex';
  isPanelVisible = true;
  positionPanel();
}

/**
 * 隐藏面板
 */
function hidePanel() {
  if (panel) panel.style.display = 'none';
  isPanelVisible = false;
  closeQuickMenu();
}

/**
 * 创建面板 DOM（只执行一次）
 * 结构：头部（标题 + ⚡ + 关闭）+ 内容区
 */
function createPanel() {
  panel = document.createElement('div');
  panel.id = 'chat-tools-hide-panel';
  panel.className = 'chat-tools-hide-panel';

  // --- 头部 ---
  const header = document.createElement('div');
  header.className = 'chat-tools-hide-header';

  const title = document.createElement('span');
  title.className = 'chat-tools-hide-title';
  title.textContent = '楼层隐藏状态';

  // 刷新按钮（手动刷新面板内容）
  const refreshBtn = document.createElement('div');
  refreshBtn.className = 'chat-tools-hide-refresh-btn interactable';
  refreshBtn.title = '刷新楼层状态';
  refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    refreshPanel();
    logger.debug(MODULE_NAME, `${LOG_PREFIX} 手动刷新面板`);
  });

  // 快捷指令按钮
  const quickBtn = document.createElement('div');
  quickBtn.className = 'chat-tools-hide-quick-btn interactable';
  quickBtn.title = '快捷指令';
  quickBtn.innerHTML = '<i class="fa-solid fa-bolt"></i>';
  quickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleQuickMenu(quickBtn);
  });

  // 关闭按钮
  const closeBtn = document.createElement('div');
  closeBtn.className = 'chat-tools-hide-close-btn interactable';
  closeBtn.title = '关闭';
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  closeBtn.addEventListener('click', () => hidePanel());

  header.appendChild(title);
  header.appendChild(refreshBtn);
  header.appendChild(quickBtn);
  header.appendChild(closeBtn);

  // --- 内容区 ---
  panelContent = document.createElement('div');
  panelContent.className = 'chat-tools-hide-content';

  panel.appendChild(header);
  panel.appendChild(panelContent);

  document.body.appendChild(panel);

  // 添加拖动功能
  makeDraggable(panel, header);

  logger.debug(MODULE_NAME, `${LOG_PREFIX} 面板 DOM 已创建`);
}

/**
 * 刷新面板内容
 * 重新读取 chat 数组，构建楼层段列表并渲染
 */
function refreshPanel() {
  if (!panelContent) return;

  const context = getContext();
  const chat = context.chat || [];

  panelContent.innerHTML = '';

  if (chat.length === 0) {
    panelContent.innerHTML = '<div class="chat-tools-hide-empty">当前没有消息</div>';
    return;
  }

  const segments = buildSegments(chat);

  segments.forEach((seg) => {
    const row = document.createElement('div');
    row.className = `chat-tools-hide-segment ${seg.hidden ? 'is-hidden' : 'is-visible'}`;

    const rangeText = seg.start === seg.end ? `${seg.start}` : `${seg.start}-${seg.end}`;

    // 点击 → 填入对应命令（睁眼段填 /hide，闭眼段填 /unhide）
    const cmd = seg.hidden ? `/unhide ${rangeText}` : `/hide ${rangeText}`;
    row.title = `点击填入：${cmd}`;

    row.innerHTML = `
      <i class="fa-solid ${seg.hidden ? 'fa-eye-slash' : 'fa-eye'} chat-tools-hide-icon"></i>
      <span class="chat-tools-hide-range">${rangeText}</span>
    `;

    row.addEventListener('click', () => fillInput(cmd));

    panelContent.appendChild(row);
  });

  positionPanel();
}

/**
 * 将面板定位到屏幕中心
 */
function positionPanel() {
  if (!panel) return;

  const panelHeight = panel.offsetHeight || 280;
  const panelWidth = panel.offsetWidth || 260;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 居中显示
  let left = (viewportWidth - panelWidth) / 2;
  let top = (viewportHeight - panelHeight) / 2;
  // 防止超出边界
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  if (left + panelWidth > viewportWidth - 8) {
    left = viewportWidth - panelWidth - 8;
  }
  if (top + panelHeight > viewportHeight - 8) {
    top = viewportHeight - panelHeight - 8;
  }

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

// ========================================
// 快捷指令菜单
// ========================================

/**
 * 切换快捷指令菜单显示状态
 * @param {HTMLElement} anchor - 锚定元素（用于定位菜单）
 */
function toggleQuickMenu(anchor) {
  if (quickMenu && quickMenu.style.display !== 'none') {
    closeQuickMenu();
    return;
  }

  if (!quickMenu) {
    quickMenu = document.createElement('div');
    quickMenu.className = 'chat-tools-hide-quick-menu';

    QUICK_COMMANDS.forEach((cmd) => {
      const item = document.createElement('div');
      item.className = 'chat-tools-hide-quick-item';

      item.innerHTML = `
        <div class="chat-tools-hide-quick-label">${cmd.label}</div>
        <div class="chat-tools-hide-quick-desc">${cmd.desc}</div>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        fillInput(cmd.template);
        closeQuickMenu();
      });

      quickMenu.appendChild(item);
    });

    document.body.appendChild(quickMenu);
  }

  quickMenu.style.display = 'block';

  // 定位到面板上方，优先向上弹出
  if (!panel) return;
  const panelRect = panel.getBoundingClientRect();
  const menuHeight = quickMenu.offsetHeight || 240;
  const menuWidth = 260;
  
  let left = panelRect.left;
  let top = panelRect.top - menuHeight - 4;

  // 如果上方空间不足，改为下方
  if (top < 8) {
    top = panelRect.bottom + 4;
  }

  // 防止超出右侧
  if (left + menuWidth > window.innerWidth - 8) {
    left = window.innerWidth - menuWidth - 8;
  }
  if (left < 8) left = 8;

  quickMenu.style.top = `${top}px`;
  quickMenu.style.left = `${left}px`;
}

/**
 * 关闭快捷指令菜单
 */
function closeQuickMenu() {
  if (quickMenu) quickMenu.style.display = 'none';
}

// ========================================
// 实时更新：MutationObserver
// ========================================

/**
 * 设置 MutationObserver，监听 #chat 下所有消息的 is_system 属性变化
 * 当用户在消息上点击眼睛图标时，ST 会改变 is_system attribute，此时刷新面板
 */
function setupMutationObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  const chatEl = document.getElementById('chat');
  if (!chatEl) return;

  mutationObserver = new MutationObserver((mutations) => {
    const hasChange = mutations.some(
      (m) => m.type === 'attributes' && m.attributeName === 'is_system',
    );
    if (hasChange && isPanelVisible) {
      refreshPanel();
    }
  });

  mutationObserver.observe(chatEl, {
    attributes: true,
    subtree: true,
    attributeFilter: ['is_system'],
  });

  logger.debug(MODULE_NAME, `${LOG_PREFIX} MutationObserver 已设置`);
}

// ========================================
// 工具函数
// ========================================

/**
 * 将 chat 数组压缩为连续同状态段列表
 *
 * @param {Array<{is_system: boolean}>} chat - ST 消息数组
 * @returns {{start: number, end: number, hidden: boolean}[]} 段列表
 *
 * @example
 * // chat = [{is_system:false},{is_system:false},{is_system:true}]
 * // 返回 [{start:0,end:1,hidden:false},{start:2,end:2,hidden:true}]
 */
function buildSegments(chat) {
  if (!chat || chat.length === 0) return [];

  const segments = [];
  let currentHidden = !!chat[0].is_system;
  let startIdx = 0;

  for (let i = 1; i < chat.length; i++) {
    const hidden = !!chat[i].is_system;
    if (hidden !== currentHidden) {
      segments.push({ start: startIdx, end: i - 1, hidden: currentHidden });
      currentHidden = hidden;
      startIdx = i;
    }
  }
  // 最后一段
  segments.push({ start: startIdx, end: chat.length - 1, hidden: currentHidden });

  return segments;
}

/**
 * 将命令字符串填入 ST 输入框并聚焦
 * @param {string} cmd - 要填入的命令字符串
 */
function fillInput(cmd) {
  const textarea = document.getElementById('send_textarea');
  if (!textarea) return;

  textarea.value = cmd;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  logger.debug(MODULE_NAME, `${LOG_PREFIX} 已填入输入框: ${cmd}`);
}

/**
 * 清理拖拽监听器
 * @returns {void}
 */
function removeDraggableListeners() {
  if (dragHandlers.handle && dragHandlers.mousedown) {
    dragHandlers.handle.removeEventListener('mousedown', dragHandlers.mousedown);
  }
  if (dragHandlers.mousemove) {
    document.removeEventListener('mousemove', dragHandlers.mousemove);
  }
  if (dragHandlers.mouseup) {
    document.removeEventListener('mouseup', dragHandlers.mouseup);
  }

  dragHandlers = {
    element: null,
    handle: null,
    mousedown: null,
    mousemove: null,
    mouseup: null,
  };
}

/**
 * 使元素可拖动
 *
 * @description
 * 通过保存 mousedown/mousemove/mouseup 监听器引用，实现可逆的拖拽绑定。
 * 这样在功能关闭或面板销毁时可以彻底移除 document 级监听，避免泄漏。
 *
 * @param {HTMLElement} element - 要拖动的元素
 * @param {HTMLElement} handle - 拖动手柄元素（通常是头部）
 * @returns {void}
 * @throws {Error} 当 DOM 监听绑定异常时抛出运行时错误
 * @example
 * makeDraggable(panel, header);
 */
function makeDraggable(element, handle) {
  removeDraggableListeners();

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  handle.style.cursor = 'move';

  dragHandlers.mousedown = (e) => {
    // 如果点击的是按钮，不触发拖动
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.chat-tools-hide-quick-btn') || target.closest('.chat-tools-hide-close-btn')) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    e.preventDefault();
  };
  handle.addEventListener('mousedown', dragHandlers.mousedown);

  dragHandlers.mousemove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    let newLeft = initialLeft + deltaX;
    let newTop = initialTop + deltaY;

    // 限制在屏幕范围内
    const maxLeft = window.innerWidth - element.offsetWidth;
    const maxTop = window.innerHeight - element.offsetHeight;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;
  };
  document.addEventListener('mousemove', dragHandlers.mousemove);

  dragHandlers.mouseup = () => {
    isDragging = false;
  };
  document.addEventListener('mouseup', dragHandlers.mouseup);

  dragHandlers.element = element;
  dragHandlers.handle = handle;
}
