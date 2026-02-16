/**
 * 聊天工具 - 导航功能
 *
 * @description
 * 在快捷回复栏添加搜索和跳转功能，支持搜索消息内容和数字快速跳转
 */

// ========================================
// 导入
// ========================================

import { extension_settings, getContext } from '../../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, showMoreMessages } from '../../../../../script.js';
import logger from '../logger.js';

// ========================================
// 常量
// ========================================

const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'chatTools';
const LOG_PREFIX = '[Nav]';

/**
 * 默认设置
 */
const DEFAULT_NAV_SETTINGS = {
  'chat-tools-nav-enabled': false,
  'chat-tools-nav-position': 'left',
  'chat-tools-nav-user': true,
  'chat-tools-nav-ai': true,
};

// ========================================
// 状态
// ========================================

/** 导航控件容器 */
let navContainer = null;

/** 搜索输入框 */
let searchInput = null;

/** 跳转输入框 */
let jumpInput = null;

/** 搜索结果下拉框 */
let searchResultsDropdown = null;

/** 是否已注册切换聊天事件监听器 */
let chatChangedListenerRegistered = false;

// ========================================
// 初始化
// ========================================

/**
 * 初始化聊天记录导航功能
 * 只在功能启用时才会初始化控件和监听器
 */
export function initChatToolsNav() {
  logger.info(MODULE_NAME, `${LOG_PREFIX} 初始化聊天记录导航`);

  // 检查功能是否启用
  const enabled = extension_settings[EXT_ID]?.chatTools?.['chat-tools-nav-enabled'];
  if (!enabled) {
    logger.info(MODULE_NAME, `${LOG_PREFIX} 功能未启用，跳过`);
    return;
  }

  // 设置切换聊天的事件监听（只在功能开启时添加）
  if (!chatChangedListenerRegistered) {
    setupChatChangedListener();
  }

  // 等待快捷回复栏加载
  waitForQuickReplyBar();
}

/**
 * 设置切换聊天的事件监听
 * 只在功能开启时才会被调用
 */
function setupChatChangedListener() {
  // 监听聊天切换事件
  eventSource.on(event_types.CHAT_CHANGED, () => {
    // 从存储中读取启用状态
    const enabled = extension_settings[EXT_ID]?.chatTools?.['chat-tools-nav-enabled'];

    if (!enabled) {
      // 功能未启用，移除控件并跳过
      removeNavControls();
      return;
    }

    logger.info(MODULE_NAME, `${LOG_PREFIX} 收到 CHAT_CHANGED 事件，功能已启用，重新初始化`);

    // 移除现有控件（避免重复）
    removeNavControls();
    // 重新初始化
    waitForQuickReplyBar();
  });

  chatChangedListenerRegistered = true;
  logger.debug(MODULE_NAME, `${LOG_PREFIX} CHAT_CHANGED 事件监听已设置`);
}

/**
 * 移除导航控件
 */
function removeNavControls() {
  if (navContainer && navContainer.parentNode) {
    navContainer.parentNode.removeChild(navContainer);
  }
  // 移除搜索结果下拉框
  if (searchResultsDropdown && searchResultsDropdown.parentNode) {
    searchResultsDropdown.parentNode.removeChild(searchResultsDropdown);
  }
  // 重置状态
  navContainer = null;
  searchInput = null;
  jumpInput = null;
  searchResultsDropdown = null;
}

/**
 * 等待快捷回复栏加载完成后注入搜索控件
 */
function waitForQuickReplyBar() {
  logger.info(MODULE_NAME, `${LOG_PREFIX} 开始等待快捷回复栏加载，DOM中 qr--bar 是否存在: ${!!document.getElementById('qr--bar')}`);

  const checkInterval = setInterval(() => {
    const qrBar = document.getElementById('qr--bar');
    if (qrBar) {
      clearInterval(checkInterval);
      logger.info(MODULE_NAME, `${LOG_PREFIX} 找到 qr--bar，准备注入控件`);
      injectSearchControls(qrBar);
    } else {
      logger.debug(MODULE_NAME, `${LOG_PREFIX} 等待 qr--bar 出现...`);
    }
  }, 500);

  // 5秒后停止检查
  setTimeout(() => {
    clearInterval(checkInterval);
    if (!document.getElementById('qr--bar')) {
      logger.warn(MODULE_NAME, `${LOG_PREFIX} 等待超时，快捷回复栏未找到`);
    }
  }, 5000);
}

/**
 * 注入搜索控件到快捷回复栏
 * @param {HTMLElement} qrBar - 快捷回复栏元素
 */
function injectSearchControls(qrBar) {
  // 获取设置
  const position = extension_settings[EXT_ID]?.chatTools?.['chat-tools-nav-position'] || 'left';

  // 创建导航容器
  navContainer = document.createElement('div');
  navContainer.className = 'chat-tools-nav-container';

  // 搜索框
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'chat-tools-nav-search-wrapper';

  searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'chat-tools-nav-search-input';
  searchInput.placeholder = '搜索消息...';

  // 搜索结果下拉框 - 添加到 body 以便悬浮定位
  searchResultsDropdown = document.createElement('div');
  searchResultsDropdown.className = 'chat-tools-nav-results';
  searchResultsDropdown.style.display = 'none';
  document.body.appendChild(searchResultsDropdown);

  // 绑定搜索事件
  searchInput.addEventListener('input', debounce(handleSearch, 300));
  searchInput.addEventListener('focus', handleSearchFocus);
  searchInput.addEventListener('blur', handleSearchBlur);

  searchWrapper.appendChild(searchInput);

  // 跳转输入框
  const jumpWrapper = document.createElement('div');
  jumpWrapper.className = 'chat-tools-nav-jump-wrapper';

  // 显示总消息数量
  const context = getContext();
  const messageCount = context.chat ? context.chat.length : 0;

  const jumpInfo = document.createElement('span');
  jumpInfo.className = 'chat-tools-nav-jump-info';
  jumpInfo.textContent = `共${messageCount}条`;

  jumpInput = document.createElement('input');
  jumpInput.type = 'number';
  jumpInput.className = 'chat-tools-nav-jump-input';
  jumpInput.min = '1';
  jumpInput.max = messageCount;

  // 绑定跳转事件（回车键）
  jumpInput.addEventListener('keydown', handleJumpKeydown);

  // 跳转按钮
  const jumpButton = document.createElement('button');
  jumpButton.className = 'chat-tools-nav-jump-btn';
  jumpButton.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
  jumpButton.title = '跳转';
  jumpButton.addEventListener('click', () => {
    logger.info(MODULE_NAME, `${LOG_PREFIX} 跳转按钮被点击，输入框值: "${jumpInput.value}"`);
    const num = parseInt(jumpInput.value);
    logger.info(MODULE_NAME, `${LOG_PREFIX} 解析后的数字: ${num}, 类型: ${typeof num}, 是否有效: ${!isNaN(num) && num > 0}`);
    if (num && num > 0) {
      logger.info(MODULE_NAME, `${LOG_PREFIX} 调用 jumpToMessageNumber(${num})`);
      jumpToMessageNumber(num);
      jumpInput.value = '';
    } else {
      logger.warn(MODULE_NAME, `${LOG_PREFIX} 输入无效的数字: "${jumpInput.value}"`);
    }
  });

  jumpWrapper.appendChild(jumpInfo);
  jumpWrapper.appendChild(jumpInput);
  jumpWrapper.appendChild(jumpButton);

  // 根据位置添加
  navContainer.appendChild(searchWrapper);
  navContainer.appendChild(jumpWrapper);

  if (position === 'left') {
    qrBar.insertBefore(navContainer, qrBar.firstChild);
  } else {
    qrBar.appendChild(navContainer);
  }
}

// ========================================
// 搜索逻辑
// ========================================

/**
 * 处理搜索输入
 */
function handleSearch() {
  const query = searchInput.value.trim();

  if (!query) {
    hideSearchResults();
    return;
  }

  // ========== 排查日志开始 ==========
  logger.info(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 开始搜索，关键词: "${query}"`);
  // ========== 排查日志结束 ==========

  // 获取消息
  const context = getContext();
  const messages = context.chat || [];

  // ========== 排查日志开始 ==========
  logger.info(MODULE_NAME, `${LOG_PREFIX} [搜索排查] context.chat 消息数量: ${messages.length}`);
  // ========== 排查日志结束 ==========

  // 获取设置（简化：只保留模糊匹配）
  const settings = extension_settings[EXT_ID]?.chatTools || {};
  const searchUser = settings['chat-tools-nav-user'];
  const searchAI = settings['chat-tools-nav-ai'];

  // ========== 排查日志开始 ==========
  logger.info(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 搜索设置 - searchUser: ${searchUser}, searchAI: ${searchAI}`);
  // ========== 排查日志结束 ==========

  // 过滤消息 - 统一使用模糊匹配
  const results = messages.filter((msg, index) => {
    // 过滤消息类型
    const isUser = msg.is_user;
    if (isUser && !searchUser) {
      // ========== 排查日志开始 ==========
      logger.debug(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 消息${index} 被过滤: isUser=${isUser}, searchUser=${searchUser}`);
      // ========== 排查日志结束 ==========
      return false;
    }
    if (!isUser && !searchAI) {
      // ========== 排查日志开始 ==========
      logger.debug(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 消息${index} 被过滤: isUser=${isUser}, searchAI=${searchAI}`);
      // ========== 排查日志结束 ==========
      return false;
    }

    // 获取消息内容
    const content = getMessageContent(msg);
    if (!content) {
      // ========== 排查日志开始 ==========
      logger.debug(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 消息${index} 内容为空，跳过`);
      // ========== 排查日志结束 ==========
      return false;
    }

    // 精确匹配（不区分大小写）
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    if (lowerContent.includes(lowerQuery)) {
      // ========== 排查日志开始 ==========
      logger.info(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 消息${index} 精确匹配成功，内容: "${content.substring(0, 50)}..."`);
      // ========== 排查日志结束 ==========
      return true;
    }

    return false;
  }).map((msg, index) => {
    // 添加 mesId 属性（使用数组索引）
    return { ...msg, mesId: index };
  });

  // ========== 排查日志开始 ==========
  logger.info(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 搜索完成，总消息: ${messages.length}, 匹配结果: ${results.length}`);

  // 特殊排查：检查是否有包含关键词但被过滤的消息（精确匹配）
  const potentialMatches = messages.filter((msg, idx) => {
    const content = getMessageContent(msg);
    return content && content.includes(query);
  });
  logger.info(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 包含关键词的消息总数: ${potentialMatches.length}`);
  if (potentialMatches.length > 0 && results.length === 0) {
    // 有关键词但没匹配到，说明被过滤掉了
    potentialMatches.forEach((msg, idx) => {
      const content = getMessageContent(msg);
      logger.warn(MODULE_NAME, `${LOG_PREFIX} [搜索排查] 消息${idx} 包含关键词但被过滤! is_user=${msg.is_user}, searchUser=${searchUser}, searchAI=${searchAI}, 内容预览: "${content.substring(0, 30)}..."`);
    });
  }
  // ========== 排查日志结束 ==========

  // 显示结果
  showSearchResults(results, query);
}

/**
 * 获取消息内容
 * @param {Object} msg - 消息对象
 * @returns {string} 消息内容
 */
function getMessageContent(msg) {
  // ========== 排查日志开始 ==========
  // 打印消息对象的所有键，帮助了解结构
  const keys = msg ? Object.keys(msg).join(', ') : '空对象';
  logger.debug(MODULE_NAME, `${LOG_PREFIX} [getMessageContent] 消息键: ${keys}`);
  // ========== 排查日志结束 ==========

  // 优先使用 extra.first_chunk（AI生成的实际内容）
  if (msg.extra && msg.extra.first_chunk) {
    // ========== 排查日志开始 ==========
    logger.debug(MODULE_NAME, `${LOG_PREFIX} [getMessageContent] 使用 extra.first_chunk`);
    // ========== 排查日志结束 ==========
    return msg.extra.first_chunk;
  }

  // 备用：检查 extra.content（某些消息格式）
  if (msg.extra && msg.extra.content) {
    // ========== 排查日志开始 ==========
    logger.debug(MODULE_NAME, `${LOG_PREFIX} [getMessageContent] 使用 extra.content`);
    // ========== 排查日志结束 ==========
    return msg.extra.content;
  }

  if (msg.mes) return msg.mes;
  if (msg.text) return msg.text;
  return '';
}

/**
 * 显示搜索结果
 * @param {Array} results - 搜索结果
 * @param {string} query - 搜索关键词
 */
function showSearchResults(results, query) {
  if (results.length === 0) {
    searchResultsDropdown.innerHTML = '<div class="chat-tools-nav-result-empty">未找到匹配消息</div>';
    searchResultsDropdown.style.display = 'block';
    positionSearchResultsDropdown();
    return;
  }

  // 限制显示数量 - 改为50条，确保包含所有匹配结果
  const MAX_DISPLAY = 50;
  const displayResults = results.slice(0, MAX_DISPLAY);

  // ========== 排查日志开始 ==========
  logger.info(MODULE_NAME, `${LOG_PREFIX} [高亮排查] 显示结果数量: ${displayResults.length}, 关键词: "${query}"`);
  // ========== 排查日志结束 ==========

  searchResultsDropdown.innerHTML = displayResults.map((msg, idx) => {
    const content = getMessageContent(msg);
    // ========== 排查日志开始 ==========
    logger.debug(MODULE_NAME, `${LOG_PREFIX} [高亮排查] 消息${idx} 原始内容前50字: "${content.substring(0, 50)}..."`);
    // ========== 排查日志结束 ==========

    // 找到关键词位置，显示包含关键词的内容（前后各取25字）
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const keywordIndex = lowerContent.indexOf(lowerQuery);
    let displayContent;
    if (keywordIndex === -1) {
      // 理论上不会出现，除非数据变化
      displayContent = content.length > 50 ? content.substring(0, 50) + '...' : content;
    } else if (content.length <= 50) {
      // 内容足够短，直接显示全部
      displayContent = content;
    } else {
      // 关键词在前面部分，直接取前50字
      if (keywordIndex <= 25) {
        displayContent = content.substring(0, 50) + '...';
      } else {
        // 关键词在后面，从关键词位置往前取一点
        const start = Math.max(0, keywordIndex - 20);
        const end = Math.min(content.length, keywordIndex + 30);
        displayContent = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');
      }
    }

    const isUser = msg.is_user;
    const mesId = msg.mesId;
    // 注意：SillyTavern的mesId从0开始，0也是一条消息，禁止+1
    const floorNumber = mesId;

    // ========== 排查日志开始 ==========
    const highlighted = highlightText(displayContent, query);
    logger.debug(MODULE_NAME, `${LOG_PREFIX} [高亮排查] 消息${idx} 高亮后: "${highlighted}"`);
    // ========== 排查日志结束 ==========

    return `
            <div class="chat-tools-nav-result-item" data-mesid="${mesId}" data-index="${idx}">
                <span class="chat-tools-nav-result-floor">#${floorNumber}</span>
                <span class="chat-tools-nav-result-role ${isUser ? 'user' : 'ai'}">
                    ${isUser ? '用户' : 'AI'}
                </span>
                <span class="chat-tools-nav-result-content">${highlighted}</span>
            </div>
        `;
  }).join('');

  // 绑定点击事件 - 使用 jumpToMessageNumber 处理虚拟滚动
  searchResultsDropdown.querySelectorAll('.chat-tools-nav-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const mesId = parseInt(item.dataset.mesid);
      // 注意：SillyTavern的mesId从0开始，0也是一条消息，禁止+1
      const floorNumber = mesId;
      jumpToMessageNumber(floorNumber);
      hideSearchResults();
      searchInput.value = '';
    });
  });

  searchResultsDropdown.style.display = 'block';
  positionSearchResultsDropdown();
}

/**
 * 定位搜索结果下拉框到搜索框上方
 */
function positionSearchResultsDropdown() {
  if (!searchInput || !searchResultsDropdown) return;

  const inputRect = searchInput.getBoundingClientRect();
  const dropdownHeight = searchResultsDropdown.offsetHeight || 300;

  // 定位到搜索框上方 8px 处
  let top = inputRect.top - dropdownHeight - 8;

  // 如果上方空间不够，放到下方
  if (top < 10) {
    top = inputRect.bottom + 8;
  }

  // 水平居中或左对齐
  let left = inputRect.left;

  searchResultsDropdown.style.top = top + 'px';
  searchResultsDropdown.style.left = left + 'px';
}

/**
 * 高亮搜索关键词（不区分大小写）
 * @param {string} text - 原始文本
 * @param {string} query - 关键词
 * @returns {string} 高亮后的HTML
 */
function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * 转义正则特殊字符
 * @param {string} str - 字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 隐藏搜索结果
 */
function hideSearchResults() {
  if (searchResultsDropdown) {
    searchResultsDropdown.style.display = 'none';
  }
}

/**
 * 处理搜索框焦点
 */
function handleSearchFocus() {
  if (searchInput.value.trim()) {
    handleSearch();
  }
}

/**
 * 处理搜索框失焦
 */
function handleSearchBlur() {
  // 延迟隐藏，延迟时间给点击事件
  setTimeout(() => {
    hideSearchResults();
  }, 200);
}

// ========================================
// 跳转逻辑
// ========================================

/**
 * 处理跳转输入
 * @param {KeyboardEvent} event - 键盘事件
 */
function handleJumpKeydown(event) {
  if (event.key === 'Enter') {
    const num = parseInt(jumpInput.value);
    if (num && num > 0) {
      jumpToMessageNumber(num);
      jumpInput.value = '';
    }
  }
}

/**
 * 跳转到指定楼层的消息
 * 使用官方 showMoreMessages 函数加载消息
 * @param {number} number - 消息楼层号（mesId，从0开始）
 */
async function jumpToMessageNumber(number) {
  logger.info(MODULE_NAME, `${LOG_PREFIX} === jumpToMessageNumber 开始 ===`);

  const context = getContext();
  const messages = context.chat || [];
  logger.info(MODULE_NAME, `${LOG_PREFIX} 消息数组长度: ${messages.length}`);

  if (number > messages.length) {
    logger.warn(MODULE_NAME, `${LOG_PREFIX} 跳转失败：消息数量不足，请求: ${number}, 实际: ${messages.length}`);
    toastr.warning('消息数量不足');
    return;
  }

  // 注意：SillyTavern的mesId从0开始，0也是一条消息，禁止+1或-1
  const targetMesId = number;
  logger.info(MODULE_NAME, `${LOG_PREFIX} 目标 mesId: ${targetMesId}`);

  // 检查目标消息是否已经在 DOM 中
  const existingElement = document.querySelector(`.mes[mesid="${targetMesId}"]`);

  if (existingElement) {
    // 消息已渲染，直接跳转
    logger.info(MODULE_NAME, `${LOG_PREFIX} 消息已在 DOM 中，直接跳转`);
    scrollToMessage(targetMesId);
    return;
  }

  // 消息未渲染，需要先加载
  logger.info(MODULE_NAME, `${LOG_PREFIX} 消息未在 DOM 中，需要加载`);

  // 尝试获取当前显示的第一条消息的 mesId
  let firstDisplayedMesId = parseInt(document.querySelector('.mes')?.getAttribute('mesid') || 'NaN');

  // 情况1：如果 DOM 中没有 .mes 元素（全部被隐藏）
  if (isNaN(firstDisplayedMesId)) {
    logger.info(MODULE_NAME, `${LOG_PREFIX} DOM中没有 .mes 元素，检查是否有加载更多按钮`);

    const showMoreBtn = document.getElementById('show_more_messages');

    if (showMoreBtn) {
      // 有加载按钮，说明消息被隐藏了，需要加载
      // 直接加载全部消息（从 0 到目标位置）
      const needToLoadCount = targetMesId + 1; // 从第0条到目标消息的数量
      logger.info(MODULE_NAME, `${LOG_PREFIX} 检测到加载按钮，需要加载 ${needToLoadCount} 条消息`);

      try {
        await showMoreMessages(needToLoadCount);
        logger.info(MODULE_NAME, `${LOG_PREFIX} 消息加载完成，尝试跳转`);

        // 等待 DOM 更新（增加等待时间确保渲染完成）
        await new Promise(resolve => setTimeout(resolve, 200));

        const reCheckElement = document.querySelector(`.mes[mesid="${targetMesId}"]`);
        if (reCheckElement) {
          logger.info(MODULE_NAME, `${LOG_PREFIX} 消息已加载，跳转`);
          scrollToMessage(targetMesId);
        } else {
          logger.warn(MODULE_NAME, `${LOG_PREFIX} 消息仍未加载成功，尝试加载全部`);

          // 再尝试加载所有剩余消息
          await showMoreMessages(Number.MAX_SAFE_INTEGER);
          await new Promise(resolve => setTimeout(resolve, 100));

          const finalCheck = document.querySelector(`.mes[mesid="${targetMesId}"]`);
          if (finalCheck) {
            scrollToMessage(targetMesId);
          } else {
            toastr.warning('消息加载失败，请重试');
          }
        }
      } catch (error) {
        logger.error(MODULE_NAME, `${LOG_PREFIX} 加载消息失败:`, error);
        toastr.error('加载消息失败');
      }
      return;
    } else {
      // 没有加载按钮，也没有消息元素，可能是其他问题
      logger.warn(MODULE_NAME, `${LOG_PREFIX} 无法获取当前消息位置，没有 .mes 也没有 #show_more_messages`);
      toastr.error('无法获取当前消息位置');
      return;
    }
  }

  // 情况2：DOM 中有 .mes 元素，但目标消息不在其中
  // 计算需要加载的消息数量
  const needToLoadCount = firstDisplayedMesId - targetMesId;
  logger.info(MODULE_NAME, `${LOG_PREFIX} 当前显示第一条: ${firstDisplayedMesId}, 需要加载: ${needToLoadCount}`);

  if (needToLoadCount <= 0) {
    // 目标消息在当前显示的消息之后（更靠近最新消息）
    // 尝试滚动到该位置
    logger.warn(MODULE_NAME, `${LOG_PREFIX} 目标消息在当前显示范围之后`);
    scrollToMessage(targetMesId);
    return;
  }

  // 调用官方函数加载消息
  try {
    await showMoreMessages(needToLoadCount);
    logger.info(MODULE_NAME, `${LOG_PREFIX} 消息加载完成，尝试跳转`);

    // 等待 DOM 更新后再尝试跳转
    await new Promise(resolve => setTimeout(resolve, 100));

    const reCheckElement = document.querySelector(`.mes[mesid="${targetMesId}"]`);

    if (reCheckElement) {
      logger.info(MODULE_NAME, `${LOG_PREFIX} 消息已加载，跳转`);
      scrollToMessage(targetMesId);
    } else {
      logger.warn(MODULE_NAME, `${LOG_PREFIX} 消息仍未加载成功`);
      toastr.warning('消息加载失败，请重试');
    }
  } catch (error) {
    logger.error(MODULE_NAME, `${LOG_PREFIX} 加载消息失败:`, error);
    toastr.error('加载消息失败');
  }
}

/**
 * 滚动到指定消息
 * @param {number} mesId - 消息ID
 */
function scrollToMessage(mesId) {
  logger.info(MODULE_NAME, `${LOG_PREFIX} scrollToMessage 开始查找消息, mesId: ${mesId}`);

  const msgElement = document.querySelector(`.mes[mesid="${mesId}"]`);
  logger.info(MODULE_NAME, `${LOG_PREFIX} 找到消息元素:`, msgElement ? '是' : '否');

  if (msgElement) {
    msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    logger.info(MODULE_NAME, `${LOG_PREFIX} 已调用 scrollIntoView`);

    // 添加高亮效果
    msgElement.classList.add('chat-tools-nav-highlight');
    setTimeout(() => {
      msgElement.classList.remove('chat-tools-nav-highlight');
    }, 2000);
  } else {
    // 尝试查找所有消息元素看看结构
    const allMessages = document.querySelectorAll('.mes');
    logger.warn(MODULE_NAME, `${LOG_PREFIX} 未找到消息，页面中 .mes 数量: ${allMessages.length}`);
    if (allMessages.length > 0) {
      logger.info(MODULE_NAME, `${LOG_PREFIX} 第一个消息元素的属性:`, allMessages[0].getAttribute('mesid'));
    }
  }
}

// ========================================
// 设置绑定
// ========================================

/**
 * 绑定聊天工具导航设置
 */
export function bindNavSettings() {
  logger.info(MODULE_NAME, `${LOG_PREFIX} 开始绑定设置事件`);

  // 获取所有设置元素（简化：移除模糊/精确匹配选项）
  const settings = [
    { id: 'chat-tools-nav-enabled', type: 'checkbox', key: 'chat-tools-nav-enabled', default: false },
    { id: 'chat-tools-nav-position', type: 'select', key: 'chat-tools-nav-position', default: 'left' },
    { id: 'chat-tools-nav-user', type: 'checkbox', key: 'chat-tools-nav-user', default: true },
    { id: 'chat-tools-nav-ai', type: 'checkbox', key: 'chat-tools-nav-ai', default: true },
  ];

  settings.forEach(setting => {
    const element = document.getElementById(setting.id);
    if (!element) {
      logger.warn(MODULE_NAME, `${LOG_PREFIX} 未找到设置元素: ${setting.id}`);
      return;
    }

    // 初始化设置值（从存储中读取，恢复勾选状态）
    const storedValue = extension_settings[EXT_ID]?.chatTools?.[setting.key];
    if (setting.type === 'checkbox') {
      element.checked = storedValue !== undefined ? storedValue : setting.default;
    } else if (setting.type === 'select') {
      element.value = storedValue || setting.default;
    }

    // 绑定 change 事件
    element.addEventListener('change', () => {
      saveNavSettings();
    });
  });
}

/**
 * 保存导航设置
 */
function saveNavSettings() {
  // 确保存储对象存在
  if (!extension_settings[EXT_ID]) {
    extension_settings[EXT_ID] = {};
  }
  if (!extension_settings[EXT_ID].chatTools) {
    extension_settings[EXT_ID].chatTools = {};
  }

  // 保存所有设置（简化：移除模糊/精确匹配选项）
  const settings = extension_settings[EXT_ID].chatTools;
  settings['chat-tools-nav-enabled'] = document.getElementById('chat-tools-nav-enabled')?.checked || false;
  settings['chat-tools-nav-position'] = document.getElementById('chat-tools-nav-position')?.value || 'left';
  settings['chat-tools-nav-user'] = document.getElementById('chat-tools-nav-user')?.checked || true;
  settings['chat-tools-nav-ai'] = document.getElementById('chat-tools-nav-ai')?.checked || true;

  // 保存到存储
  saveSettingsDebounced();

  logger.info(MODULE_NAME, `${LOG_PREFIX} 设置已保存，准备重新加载控件`);

  // 重新初始化（处理启用/禁用）
  reloadNavControls();
}

/**
 * 重新加载导航控件
 */
function reloadNavControls() {
  // 移除现有控件
  if (navContainer && navContainer.parentNode) {
    navContainer.parentNode.removeChild(navContainer);
  }

  // 重置状态
  navContainer = null;
  searchInput = null;
  jumpInput = null;
  searchResultsDropdown = null;

  // 重新初始化
  initChatToolsNav();
}

// ========================================
// 工具函数
// ========================================

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
