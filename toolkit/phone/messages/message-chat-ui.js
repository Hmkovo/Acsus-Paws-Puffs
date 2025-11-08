/**
 * 聊天界面 UI
 * @module phone/messages/message-chat-ui
 */

import logger from '../../../logger.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { getEmojis } from '../emojis/emoji-manager-data.js';
import { bindLongPress } from '../utils/message-actions-helper.js';

/**
 * 渲染聊天界面（完整DOM结构）
 * 
 * @description
 * 创建完整的聊天页面，包括顶部栏、聊天内容区、底部输入区、表情面板、+号面板
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<HTMLElement>} 聊天页面容器
 */
export async function renderChatView(contactId) {
  logger.info('[ChatView] 开始渲染聊天界面:', contactId);

  // 读取联系人数据
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  if (!contact) {
    logger.error('[ChatView] 联系人不存在:', contactId);
    const errorPage = document.createElement('div');
    errorPage.className = 'phone-page';
    errorPage.textContent = '联系人不存在';
    return errorPage;
  }

  const displayName = getContactDisplayName(contact);

  // 创建页面容器（每个contactId一个独立DOM）
  const page = document.createElement('div');
  // 注意：将contactId中的特殊字符（空格、特殊符号）转为下划线，避免querySelector失败
  page.id = `page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;  // ✅ 每个角色独立的聊天页
  page.className = 'phone-page phone-chat-page';  // 添加通用类
  page.dataset.contactId = contactId;  // 保存contactId，用于参数比较

  // 创建顶部栏
  const topBar = createTopBar(contactId, displayName);
  page.appendChild(topBar);

  // 创建聊天内容区（空白）
  const chatContent = createChatContent();
  page.appendChild(chatContent);

  // 应用聊天背景配置（如果有）
  applyChatBackgroundOnRender(chatContent, contact);

  // 创建底部输入区
  const inputArea = createInputArea();
  page.appendChild(inputArea);

  // 创建表情面板
  const emojiPanel = createEmojiPanel();
  page.appendChild(emojiPanel);

  // 创建+号面板
  const plusPanel = createPlusPanel();
  page.appendChild(plusPanel);

  // 加载并渲染历史聊天记录（支持分页加载）
  loadChatHistoryAndRender(page, contactId, contact);

  // 绑定事件（延迟执行，确保DOM已挂载）
  setTimeout(() => {
    bindInputEvents(page, contactId, contact);
    bindEmojiPanel(page);
    bindPlusPanel(page);
    bindReturnButton(page);
    bindSettingsButton(page, contactId);
    bindEmojiDataListener(page);  // 监听表情包数据变化
    bindQuoteListener(page, contactId, contact);  // 监听引用事件
    bindAIGenerationEvents(page, contactId);  // 监听AI生成事件（完成/错误）
    bindLoadSettingsChangeListener(page, contactId);  // 监听设置变化

    // 恢复草稿
    restoreDraft(page, contactId);
  }, 100);

  logger.info('[ChatView] 聊天界面渲染完成');
  return page;
}

/**
 * 创建顶部栏
 * @private
 */
function createTopBar(contactId, displayName) {
  const header = document.createElement('div');
  header.className = 'phone-header';
  header.innerHTML = `
        <button class="phone-header-back">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="phone-header-title" data-contact-id="${contactId}">${displayName}</div>
        <div class="phone-header-actions">
            <button class="phone-header-btn chat-settings-btn"><i class="fa-solid fa-bars"></i></button>
        </div>
    `;
  return header;
}

/**
 * 创建聊天内容区
 * @private
 */
function createChatContent() {
  const content = document.createElement('div');
  content.className = 'chat-content';
  return content;
}

/**
 * 创建底部输入区
 * @private
 */
function createInputArea() {
  const inputArea = document.createElement('div');
  inputArea.className = 'chat-input-area';
  inputArea.innerHTML = `
        <!-- 引用预览框（隐藏状态） -->
        <div class="chat-quote-preview" style="display: none;">
            <div class="chat-quote-preview-content">
                <div class="chat-quote-preview-text"></div>
                <img class="chat-quote-preview-img" style="display: none;">
            </div>
            <button class="chat-quote-preview-close">
                <i class="fa-solid fa-circle-xmark"></i>
            </button>
        </div>

        <!-- 第一行：输入框 + 发送 + 纸飞机 -->
        <div class="chat-input-row-top">
            <textarea class="chat-input-field" placeholder="输入消息..." rows="1"></textarea>
            <button class="chat-send-text-btn" style="display: none;">发送</button>
            <button class="chat-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
        </div>

        <!-- 第二行：6个功能按钮 -->
        <div class="chat-input-row-bottom">
            <button class="chat-voice-btn"><i class="fa-solid fa-microphone"></i></button>
            <button class="chat-placeholder-btn-1"><i class="fa-solid fa-circle"></i></button>
            <button class="chat-plan-list-btn" title="约定计划列表"><i class="fa-solid fa-clipboard-list"></i></button>
            <button class="chat-debug-btn" title="AI消息调试"><i class="fa-solid fa-robot"></i></button>
            <button class="chat-emoji-btn"><i class="fa-solid fa-face-smile"></i></button>
            <button class="chat-plus-btn"><i class="fa-solid fa-circle-plus"></i></button>
        </div>
    `;
  return inputArea;
}

/**
 * 创建表情面板
 * @private
 */
function createEmojiPanel() {
  const panel = document.createElement('div');
  panel.className = 'chat-emoji-panel';

  const grid = document.createElement('div');
  grid.className = 'chat-emoji-grid';

  // 添加按钮（第一个）
  const addBtn = document.createElement('div');
  addBtn.className = 'chat-emoji-add';
  addBtn.innerHTML = '<i class="fa-solid fa-circle-plus"></i>';
  grid.appendChild(addBtn);

  // 加载表情包列表
  const emojis = getEmojis();
  emojis.forEach(emoji => {
    const item = document.createElement('div');
    item.className = 'chat-emoji-item';
    item.dataset.emojiId = emoji.id;

    const img = document.createElement('img');
    img.dataset.src = emoji.imagePath;  // 懒加载：先保存路径到 data-src
    img.alt = emoji.name;
    img.className = 'lazy-emoji';  // 标记为懒加载元素

    item.appendChild(img);
    grid.appendChild(item);
  });

  panel.appendChild(grid);

  // 初始化懒加载（延迟执行，确保DOM已插入）
  setTimeout(() => initEmojiLazyLoad(), 0);

  return panel;
}

/**
 * 初始化表情包懒加载
 * 
 * @private
 * 
 * @description
 * 使用 Intersection Observer API 实现图片懒加载
 * 只有当表情包图片进入可视区域时才加载真实图片，节省流量和内存
 * 
 * 工作原理：
 * 1. 监听所有带 .lazy-emoji 类的图片元素
 * 2. 当图片即将进入可视区域（提前50px）时触发加载
 * 3. 从 data-src 读取真实路径并赋值给 src
 * 4. 加载完成后移除监听，避免重复触发
 */
function initEmojiLazyLoad() {
  const grid = document.querySelector('.chat-emoji-grid');
  if (!grid) {
    logger.warn('[ChatView.LazyLoad] 找不到表情网格，跳过懒加载初始化');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;  // 加载真实图片
            img.classList.remove('lazy-emoji');
            observer.unobserve(img);  // 加载后停止监听
            logger.debug('[ChatView.LazyLoad] 已加载表情包:', img.alt);
          }
        }
      });
    },
    {
      root: grid,  // 以表情网格为滚动容器
      rootMargin: '50px'  // 提前50px开始加载，用户体验更流畅
    }
  );

  // 监听所有懒加载表情包
  const lazyImages = grid.querySelectorAll('.lazy-emoji');
  lazyImages.forEach(img => observer.observe(img));

  logger.info(`[ChatView.LazyLoad] 已初始化懒加载，监听 ${lazyImages.length} 个表情包`);
}

/**
 * 刷新表情选择器（局部更新）
 * 
 * @description
 * 当表情包数据变化时（添加/删除），刷新聊天页面的表情选择器
 * 不需要刷新整个页面，只更新表情选择器的内容
 */
function refreshEmojiPanel() {
  // 查找现有的表情选择器面板
  const existingPanel = document.querySelector('.chat-emoji-panel');
  if (!existingPanel) {
    logger.debug('[ChatView] 表情面板不存在，跳过刷新');
    return;
  }

  // 查找表情网格
  const grid = existingPanel.querySelector('.chat-emoji-grid');
  if (!grid) {
    logger.warn('[ChatView] 找不到表情网格，无法刷新');
    return;
  }

  // 清空网格（保留添加按钮）
  const addBtn = grid.querySelector('.chat-emoji-add');
  grid.innerHTML = '';

  // 重新添加添加按钮
  if (addBtn) {
    grid.appendChild(addBtn);
  } else {
    // 如果找不到原按钮，创建新的
    const newAddBtn = document.createElement('div');
    newAddBtn.className = 'chat-emoji-add';
    newAddBtn.innerHTML = '<i class="fa-solid fa-circle-plus"></i>';
    grid.appendChild(newAddBtn);
  }

  // 重新加载表情包列表
  const emojis = getEmojis();
  emojis.forEach(emoji => {
    const item = document.createElement('div');
    item.className = 'chat-emoji-item';
    item.dataset.emojiId = emoji.id;

    const img = document.createElement('img');
    img.dataset.src = emoji.imagePath;  // 懒加载：先保存路径到 data-src
    img.alt = emoji.name;
    img.className = 'lazy-emoji';  // 标记为懒加载元素

    item.appendChild(img);
    grid.appendChild(item);
  });

  logger.info(`[ChatView] 表情选择器已刷新，当前共 ${emojis.length} 个表情包`);

  // 初始化懒加载
  initEmojiLazyLoad();
}

/**
 * 监听表情包数据变化
 * 
 * @private
 * @param {HTMLElement} page - 聊天页面容器
 * 
 * @description
 * 监听自定义事件 'emoji-data-changed'，当表情包添加/删除时自动刷新表情选择器
 */
function bindEmojiDataListener(page) {
  const handler = () => {
    logger.debug('[ChatView] 收到表情包数据变化事件，刷新表情选择器');
    refreshEmojiPanel();
  };

  // 添加事件监听器
  document.addEventListener('emoji-data-changed', handler);

  // 页面销毁时移除监听器（防止内存泄漏）
  // 使用 MutationObserver 监听页面是否被移除
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.removedNodes) {
        for (const node of mutation.removedNodes) {
          if (node === page) {
            document.removeEventListener('emoji-data-changed', handler);
            observer.disconnect();
            logger.debug('[ChatView] 表情包数据监听器已移除');
            return;
          }
        }
      }
    }
  });

  if (page.parentNode) {
    observer.observe(page.parentNode, { childList: true });
  }

  logger.debug('[ChatView] 表情包数据监听器已绑定');
}

/**
 * 监听引用事件
 * 
 * @private
 * @param {HTMLElement} page - 聊天页面容器
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 * 
 * @description
 * 监听自定义事件 'phone-message-quote'，当用户点击引用按钮时显示引用预览框
 */
function bindQuoteListener(page, contactId, contact) {
  const handler = (e) => {
    if (e.detail.contactId !== contactId) return;
    showQuotePreview(page, e.detail.message, contact);
  };

  // 添加事件监听器
  document.addEventListener('phone-message-quote', handler);

  // 页面销毁时移除监听器
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.removedNodes) {
        for (const node of mutation.removedNodes) {
          if (node === page) {
            document.removeEventListener('phone-message-quote', handler);
            observer.disconnect();
            logger.debug('[ChatView] 引用事件监听器已移除');
            return;
          }
        }
      }
    }
  });

  if (page.parentNode) {
    observer.observe(page.parentNode, { childList: true });
  }

  // 绑定关闭按钮
  const closeBtn = page.querySelector('.chat-quote-preview-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideQuotePreview(page);
    });
  }

  logger.debug('[ChatView] 引用事件监听器已绑定');
}

/**
 * 显示引用预览框
 * 
 * @private
 * @param {HTMLElement} page - 聊天页面容器
 * @param {Object} message - 被引用的消息
 * @param {Object} contact - 联系人对象
 */
function showQuotePreview(page, message, contact) {
  const preview = /** @type {HTMLElement} */ (page.querySelector('.chat-quote-preview'));
  if (!preview) return;

  const textEl = /** @type {HTMLElement} */ (preview.querySelector('.chat-quote-preview-text'));
  const imgEl = /** @type {HTMLImageElement} */ (preview.querySelector('.chat-quote-preview-img'));

  // 根据消息类型显示内容
  if (message.type === 'image' && message.imageUrl) {
    // 图片引用：显示缩略图
    if (textEl) textEl.style.display = 'none';
    if (imgEl) {
      imgEl.style.display = 'block';
      imgEl.src = message.imageUrl;
      imgEl.alt = message.description || '图片';
    }
  } else {
    // 文字/表情引用：显示文本
    if (imgEl) imgEl.style.display = 'none';
    if (textEl) {
      textEl.style.display = 'block';
      textEl.textContent = formatQuotePreviewText(message);
    }
  }

  // 存储被引用消息数据（JSON字符串）
  preview.dataset.quotedMessageData = JSON.stringify(message);

  // 获取发送者名字
  const senderName = message.sender === 'user'
    ? (document.querySelector('.phone-header-user-name')?.textContent || '我')
    : getContactDisplayName(contact);
  preview.dataset.quotedSenderName = senderName;

  // 显示预览框
  preview.style.display = 'flex';

  // 自动聚焦输入框
  const inputField = /** @type {HTMLInputElement} */ (page.querySelector('.chat-input-field'));
  if (inputField) {
    inputField.focus();
  }

  logger.info('[ChatView] 显示引用预览:', formatQuotePreviewText(message));
}

/**
 * 隐藏引用预览框
 * 
 * @private
 * @param {HTMLElement} page - 聊天页面容器
 */
function hideQuotePreview(page) {
  const preview = /** @type {HTMLElement} */ (page.querySelector('.chat-quote-preview'));
  if (preview) {
    preview.style.display = 'none';
    preview.dataset.quotedMessageData = '';
    preview.dataset.quotedSenderName = '';
    logger.debug('[ChatView] 隐藏引用预览');
  }
}

/**
 * 格式化引用预览文本
 * 
 * @private
 * @param {Object} message - 消息对象
 * @returns {string} 格式化后的文本
 */
function formatQuotePreviewText(message) {
  switch (message.type) {
    case 'text':
      return message.content || '[空文本]';
    case 'emoji':
      return `[表情]${message.emojiName || message.content || '未知'}`;
    case 'image':
      return `[图片]${message.description || '无描述'}`;
    case 'quote':
      // 引用的引用：只引用回复部分，不嵌套
      return message.replyContent || '[空回复]';
    default:
      return '[不支持的消息类型]';
  }
}

/**
 * 创建+号面板
 * @private
 */
function createPlusPanel() {
  const panel = document.createElement('div');
  panel.className = 'chat-plus-panel';
  panel.innerHTML = `
        <!-- 滑动容器 -->
        <div class="chat-plus-slider-container">
            <div class="chat-plus-slider">
                <!-- 第一页 -->
                <div class="chat-plus-page">
                    <div class="chat-plus-grid">
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-image"></i>
                            <span>照片</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-camera"></i>
                            <span>拍摄</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-phone"></i>
                            <span>语音...</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-video"></i>
                            <span>视频...</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>位置</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-file"></i>
                            <span>文件</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-star"></i>
                            <span>收藏</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-envelope"></i>
                            <span>红包</span>
                        </div>
                    </div>
                </div>

                <!-- 第二页 -->
                <div class="chat-plus-page">
                    <div class="chat-plus-grid">
                        <div class="chat-plus-item" data-action="plan">
                            <i class="fa-solid fa-clipboard-list"></i>
                            <span>约定计划</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-dollar-sign"></i>
                            <span>转账</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-share-from-square"></i>
                            <span>屏幕...</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-hand-pointer"></i>
                            <span>戳一戳</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-address-card"></i>
                            <span>名片</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-gift"></i>
                            <span>礼物</span>
                        </div>
                        <div class="chat-plus-item">
                            <i class="fa-solid fa-headphones"></i>
                            <span>一起...</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 页面指示器 -->
        <div class="chat-plus-indicator">
            <span class="chat-plus-dot active"></span>
            <span class="chat-plus-dot"></span>
        </div>
    `;
  return panel;
}

/**
 * 绑定输入框事件（控制发送键显示 + 发送逻辑）
 * @private
 */
async function bindInputEvents(page, contactId, contact) {
  const inputField = page.querySelector('.chat-input-field');
  const sendTextBtn = page.querySelector('.chat-send-text-btn');
  const sendBtn = page.querySelector('.chat-send-btn');
  const emojiPanel = page.querySelector('.chat-emoji-panel');
  const plusPanel = page.querySelector('.chat-plus-panel');
  const plusBtn = page.querySelector('.chat-plus-btn');

  if (!inputField) return;

  // ✅ 检查初始状态：如果正在为当前联系人生成，初始化为终止键
  const { getPhoneSystem } = await import('../phone-system.js');
  const phoneSystem = getPhoneSystem();
  if (phoneSystem && phoneSystem.api &&
    phoneSystem.api.isGenerating &&
    phoneSystem.api.currentGeneratingContactId === contactId) {
    logger.debug('[ChatView] 检测到正在生成，初始化按钮为终止键');
    sendBtn.innerHTML = '<i class="fa-solid fa-circle-stop"></i>';
    sendBtn.classList.add('generating');
  }

  // 输入框内容变化事件
  inputField.addEventListener('input', function () {
    // 自动调整高度（最大150px）
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';

    // 控制按钮显示（只控制[发送]按钮）
    const hasText = this.value.trim().length > 0;
    sendTextBtn.style.display = hasText ? 'flex' : 'none';

    // 保存草稿
    saveDraft(contactId, this.value);
  });

  // 发送文字按钮：显示用户气泡 + 暂存消息
  if (sendTextBtn) {
    sendTextBtn.addEventListener('click', () => {
      handleSendText(page, contactId, contact, inputField);
    });
  }

  // 纸飞机按钮：调用AI + 显示AI气泡
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      handleSendToAI(page, contactId, contact, sendBtn);
    });
  }

  // 调试按钮：打开AI消息调试界面
  const debugBtn = page.querySelector('.chat-debug-btn');
  if (debugBtn) {
    debugBtn.addEventListener('click', async () => {
      const { openDebugUI } = await import('./message-debug-ui.js');
      await openDebugUI(contactId);
    });
  }

  // 约定计划列表按钮：打开约定计划列表
  const planBtn = page.querySelector('.chat-plan-list-btn');
  if (planBtn) {
    planBtn.addEventListener('click', async () => {
      logger.info('[ChatView] 打开约定计划列表');
      const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      const { showPage } = await import('../phone-main-ui.js');
      showPage(overlay, 'plan-list', { contactId });
    });
  }

  // ✅ 监听重roll事件，同步按钮状态
  bindDebugRerollEvents(page, contactId, sendBtn);

  // 点击其他地方关闭面板
  document.addEventListener('click', (e) => {
    const isClickInsideInput = inputField.contains(e.target);
    const isClickInsideEmoji = emojiPanel?.contains(e.target);
    const isClickInsidePlus = plusPanel?.contains(e.target);
    const isClickEmojiBtn = page.querySelector('.chat-emoji-btn')?.contains(e.target);
    const isClickPlusBtn = plusBtn?.contains(e.target);

    if (!isClickInsideInput && !isClickInsideEmoji && !isClickInsidePlus && !isClickEmojiBtn && !isClickPlusBtn) {
      // 点击外部，关闭所有面板
      closePanels(page);
    }
  });
}

/**
 * 绑定重roll事件监听器
 * @private
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 * @param {HTMLElement} sendBtn - 纸飞机按钮
 */
function bindDebugRerollEvents(page, contactId, sendBtn) {
  if (!sendBtn) return;

  // 类型断言
  const sendButton = /** @type {HTMLButtonElement} */ (sendBtn);

  // 监听重roll开始事件
  const handleRerollStart = (e) => {
    if (e.detail.contactId !== contactId) return;

    logger.debug('[ChatView] 收到重roll开始事件，改变按钮状态');

    // 改变按钮为终止键
    sendButton.innerHTML = '<i class="fa-solid fa-circle-stop"></i>';
    sendButton.classList.add('generating');
  };

  // 监听重roll结束事件
  const handleRerollEnd = (e) => {
    if (e.detail.contactId !== contactId) return;

    logger.debug('[ChatView] 收到重roll结束事件，恢复按钮状态');

    // 恢复按钮为纸飞机
    sendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    sendButton.classList.remove('generating');
    sendButton.disabled = false;
  };

  document.addEventListener('phone-debug-reroll-start', handleRerollStart);
  document.addEventListener('phone-debug-reroll-end', handleRerollEnd);

  // 页面销毁时清理监听器（防止内存泄漏）
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === page) {
          document.removeEventListener('phone-debug-reroll-start', handleRerollStart);
          document.removeEventListener('phone-debug-reroll-end', handleRerollEnd);
          observer.disconnect();
          logger.debug('[ChatView] 重roll事件监听器已清理');
          break;
        }
      }
    }
  });

  observer.observe(page.parentElement, { childList: true });
}

/**
 * 监听AI生成事件，自动更新按钮状态
 * 
 * @description
 * 监听 phone-ai-generation-complete 和 phone-ai-generation-error 事件，
 * 当AI生成完成或失败时，动态查找当前活跃页面的发送按钮并恢复状态。
 * 解决切换页面后按钮状态不更新的问题（不依赖闭包捕获的旧DOM）。
 * 
 * @param {HTMLElement} page - 聊天页面元素
 * @param {string} contactId - 联系人ID
 */
function bindAIGenerationEvents(page, contactId) {
  // 监听生成完成事件
  const handleGenerationComplete = (e) => {
    if (e.detail.contactId !== contactId) return;

    logger.debug('[ChatView] 收到AI生成完成事件，更新按钮状态');

    // ✅ 动态查找当前活跃页面的发送按钮（不依赖闭包）
    const currentPage = findActiveChatPage(contactId);
    if (currentPage) {
      const sendBtn = /** @type {HTMLButtonElement} */ (currentPage.querySelector('.chat-send-btn'));
      if (sendBtn) {
        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        sendBtn.disabled = false;
        sendBtn.classList.remove('generating');
        logger.debug('[ChatView] 发送按钮已恢复（AI完成）');
      }
    } else {
      logger.debug('[ChatView] 当前页面不活跃，跳过按钮更新');
    }
  };

  // 监听生成错误事件
  const handleGenerationError = (e) => {
    if (e.detail.contactId !== contactId) return;

    logger.debug('[ChatView] 收到AI生成错误事件，恢复按钮状态');

    // ✅ 动态查找当前活跃页面的发送按钮
    const currentPage = findActiveChatPage(contactId);
    if (currentPage) {
      const sendBtn = /** @type {HTMLButtonElement} */ (currentPage.querySelector('.chat-send-btn'));
      if (sendBtn) {
        sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        sendBtn.disabled = false;
        sendBtn.classList.remove('generating');
        logger.debug('[ChatView] 发送按钮已恢复（AI错误）');
      }
    }
  };

  document.addEventListener('phone-ai-generation-complete', handleGenerationComplete);
  document.addEventListener('phone-ai-generation-error', handleGenerationError);

  // 页面销毁时清理监听器（防止内存泄漏）
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === page) {
          document.removeEventListener('phone-ai-generation-complete', handleGenerationComplete);
          document.removeEventListener('phone-ai-generation-error', handleGenerationError);
          observer.disconnect();
          logger.debug('[ChatView] AI生成事件监听器已清理');
          break;
        }
      }
    }
  });

  observer.observe(page.parentElement, { childList: true });
}

/**
 * 绑定表情面板事件
 * @private
 */
function bindEmojiPanel(page) {
  const emojiBtn = page.querySelector('.chat-emoji-btn');
  const emojiPanel = page.querySelector('.chat-emoji-panel');
  const plusPanel = page.querySelector('.chat-plus-panel');
  const inputArea = page.querySelector('.chat-input-area');
  const contactId = page.dataset.contactId;

  if (!emojiBtn || !emojiPanel) return;

  // 表情按钮点击（切换面板）
  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    const isActive = emojiPanel.classList.contains('active');

    if (isActive) {
      // 关闭表情面板
      emojiPanel.classList.remove('active');
      inputArea.classList.remove('panel-active');
      page.classList.remove('panel-active');
    } else {
      // 打开表情面板，关闭+号面板
      emojiPanel.classList.add('active');
      plusPanel.classList.remove('active');
      inputArea.classList.add('panel-active');
      page.classList.add('panel-active');
    }
  });

  // 表情面板内的点击事件
  emojiPanel.addEventListener('click', async (e) => {
    // 点击添加按钮 → 跳转到表情管理页面
    const addBtn = e.target.closest('.chat-emoji-add');
    if (addBtn) {
      logger.info('[ChatView] 跳转到表情管理页面');
      const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      if (overlayElement) {
        const { showPage } = await import('../phone-main-ui.js');
        await showPage(overlayElement, 'emoji-manager', {});
      }
      return;
    }

    // 点击表情包项 → 直接发送表情
    const emojiItem = e.target.closest('.chat-emoji-item');
    if (emojiItem) {
      const emojiId = emojiItem.dataset.emojiId;  // ← 改用ID获取
      logger.info('[ChatView] 发送表情:', emojiId);

      // 关闭表情面板
      emojiPanel.classList.remove('active');
      inputArea.classList.remove('panel-active');
      page.classList.remove('panel-active');

      // 发送表情消息
      await handleSendEmoji(page, contactId, emojiId);  // ← 传入ID
    }
  });
}

/**
 * 绑定+号面板事件
 * @private
 */
function bindPlusPanel(page) {
  const plusBtn = page.querySelector('.chat-plus-btn');
  const plusPanel = page.querySelector('.chat-plus-panel');
  const emojiPanel = page.querySelector('.chat-emoji-panel');
  const inputArea = page.querySelector('.chat-input-area');
  const slider = page.querySelector('.chat-plus-slider');
  const dots = page.querySelectorAll('.chat-plus-dot');

  if (!plusBtn || !plusPanel) return;

  // 点击+号按钮
  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    const isActive = plusPanel.classList.contains('active');

    if (isActive) {
      // 关闭+号面板
      plusPanel.classList.remove('active');
      inputArea.classList.remove('panel-active');
      page.classList.remove('panel-active');
    } else {
      // 打开+号面板，关闭表情面板
      plusPanel.classList.add('active');
      emojiPanel.classList.remove('active');
      inputArea.classList.add('panel-active');
      page.classList.add('panel-active');
    }
  });

  // 点击功能项
  plusPanel.addEventListener('click', async (e) => {
    const item = e.target.closest('.chat-plus-item');
    if (item) {
      const text = item.querySelector('span')?.textContent;

      // 识别照片按钮
      if (text === '照片') {
        logger.info('[ChatView] 点击照片按钮');
        closePanels(page);
        const contactId = page.dataset.contactId;
        await handleSendImage(page, contactId);
        return;
      }

      // 识别转账按钮
      if (text === '转账') {
        logger.info('[ChatView] 点击转账按钮');
        closePanels(page);
        const contactId = page.dataset.contactId;
        await handleOpenTransfer(contactId);
        return;
      }

      // 识别收藏按钮
      if (text === '收藏') {
        logger.info('[ChatView] 点击收藏按钮');
        closePanels(page);
        const contactId = page.dataset.contactId;
        await handleSendFavorite(page, contactId);
        return;
      }

      // 识别约定计划按钮
      if (text === '约定计划') {
        logger.info('[ChatView] 点击约定计划按钮');
        closePanels(page);
        const contactId = page.dataset.contactId;
        await handleCreatePlan(contactId);
        return;
      }

      // 识别戳一戳按钮
      if (text === '戳一戳') {
        logger.info('[ChatView] 点击戳一戳按钮');
        closePanels(page);
        const contactId = page.dataset.contactId;
        await handleSendPoke(contactId);
        return;
      }

      // 其他功能暂时输出日志
      logger.info('[ChatView] 点击+号菜单项:', text, '（功能待实现）');
      closePanels(page);
    }
  });

  // 滑动翻页逻辑
  if (slider && dots.length > 0) {
    let currentPage = 0;
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    // 触摸/鼠标按下
    slider.addEventListener('touchstart', handleDragStart);
    slider.addEventListener('mousedown', handleDragStart);

    // 触摸/鼠标移动
    slider.addEventListener('touchmove', handleDragMove);
    slider.addEventListener('mousemove', handleDragMove);

    // 触摸/鼠标松开
    slider.addEventListener('touchend', handleDragEnd);
    slider.addEventListener('mouseup', handleDragEnd);
    slider.addEventListener('mouseleave', handleDragEnd);

    function handleDragStart(e) {
      isDragging = true;
      startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      slider.style.transition = 'none';
    }

    function handleDragMove(e) {
      if (!isDragging) return;
      e.preventDefault();

      currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const diff = currentX - startX;
      // slider宽度200%，每页50%，所以用50而不是100
      const offset = -currentPage * 50 + (diff / slider.offsetWidth) * 50;
      slider.style.transform = `translateX(${offset}%)`;
    }

    function handleDragEnd() {
      if (!isDragging) return;
      isDragging = false;

      const diff = currentX - startX;
      const threshold = slider.offsetWidth / 6; // 滑动超过1/6宽度才翻页（更敏感）

      if (diff < -threshold && currentPage < dots.length - 1) {
        currentPage++;
      } else if (diff > threshold && currentPage > 0) {
        currentPage--;
      }

      updateSliderPosition();
    }

    function updateSliderPosition() {
      slider.style.transition = 'transform 0.3s ease';
      // slider宽度200%，每页50%，所以用50而不是100
      slider.style.transform = `translateX(-${currentPage * 50}%)`;

      // 更新指示器
      dots.forEach((dot, index) => {
        if (index === currentPage) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }
  }
}

/**
 * 绑定返回按钮事件
 * @private
 */
function bindReturnButton(page) {
  const backBtn = page.querySelector('.phone-header-back');
  if (!backBtn) return;

  backBtn.addEventListener('click', () => {
    logger.info('[ChatView] 点击返回按钮');

    // 获取 overlay 元素
    const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    if (overlay) {
      // 动态导入 hidePage 函数
      import('../phone-main-ui.js').then(({ hidePage }) => {
        hidePage(overlay, 'chat');
      });
    }
  });
}

/**
 * 绑定设置按钮事件
 * @private
 */
function bindSettingsButton(page, contactId) {
  const settingsBtn = page.querySelector('.chat-settings-btn');
  if (!settingsBtn) return;

  settingsBtn.addEventListener('click', async () => {
    logger.info('[ChatView] 点击设置按钮，跳转到聊天设置页面');
    const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    const { showPage } = await import('../phone-main-ui.js');
    showPage(overlay, 'chat-settings', { contactId });
  });
}

/**
 * 关闭所有面板
 * @private
 */
function closePanels(page) {
  const emojiPanel = page.querySelector('.chat-emoji-panel');
  const plusPanel = page.querySelector('.chat-plus-panel');
  const inputArea = page.querySelector('.chat-input-area');

  if (emojiPanel) emojiPanel.classList.remove('active');
  if (plusPanel) plusPanel.classList.remove('active');
  if (inputArea) inputArea.classList.remove('panel-active');
  page.classList.remove('panel-active');
}

/**
 * 加载并渲染历史聊天记录
 * @private
 * @async
 */
async function loadChatHistoryAndRender(page, contactId, contact, isLoadMore = false) {
  const chatContent = page.querySelector('.chat-content');
  if (!chatContent) return;

  // ✅ 重置渲染状态（页面重建时调用，清空已渲染记录）
  const { getPhoneSystem } = await import('../phone-system.js');
  const phoneAPI = getPhoneSystem().api;

  if (!isLoadMore) {
    phoneAPI.resetRenderedState(contactId);
  }

  // 动态导入
  const { loadChatHistory, getChatSendSettings } = await import('./message-chat-data.js');
  const { renderTextMessage, renderTimeSepar } = await import('./message-types/text-message.js');
  const { renderEmojiMessage } = await import('./message-types/emoji-message.js');
  const { renderImageMessage } = await import('./message-types/image-message.js');
  const { renderQuoteMessage } = await import('./message-types/quote-message.js');
  const { renderTransferMessage } = await import('./message-types/transfer-message.js');
  const { renderPlanMessage } = await import('./message-types/plan-message.js');
  const { renderPlanStoryMessage } = await import('./message-types/plan-story-message.js');

  // 加载历史消息
  const history = await loadChatHistory(contactId);

  if (history.length === 0) {
    logger.debug('[ChatView] 没有历史消息');
    return;
  }

  // 读取初始加载设置
  const settings = getChatSendSettings(contactId);
  const initialLoadCount = settings.initialLoadCount || 100;

  // 获取/初始化分页状态（存储在page元素上）
  if (!page.dataset.loadedCount) {
    page.dataset.loadedCount = '0';  // 已加载数量
  }

  const currentLoaded = parseInt(page.dataset.loadedCount);

  // 如果是初次加载，只加载最新的N条
  let messagesToRender;
  if (isLoadMore) {
    // 加载更多：加载接下来的50条
    const start = Math.max(0, history.length - currentLoaded - 50);
    const end = history.length - currentLoaded;
    messagesToRender = history.slice(start, end);
    page.dataset.loadedCount = (currentLoaded + messagesToRender.length).toString();
  } else {
    // 初次加载：只加载最新N条
    const start = Math.max(0, history.length - initialLoadCount);
    messagesToRender = history.slice(start);
    page.dataset.loadedCount = messagesToRender.length.toString();
  }

  // 🔍 详细日志
  logger.info('📊 [加载历史]', isLoadMore ? '加载更多' : '初次加载',
    `${messagesToRender.length}条消息 (总计${history.length}条，已显示${page.dataset.loadedCount}条)`);

  // 判断是否需要显示"加载更多"按钮
  const hasMore = parseInt(page.dataset.loadedCount) < history.length;
  const remainingCount = history.length - parseInt(page.dataset.loadedCount);

  // 如果是加载更多，在顶部插入消息
  if (isLoadMore) {
    await renderMessagesToTop(chatContent, messagesToRender, contact, contactId, phoneAPI);
  } else {
    // 初次加载，清空内容后从底部添加
    chatContent.innerHTML = '';
    await renderMessagesToBottom(chatContent, messagesToRender, contact, contactId, phoneAPI);
  }

  // 更新/创建"加载更多"按钮
  updateLoadMoreButton(page, hasMore, remainingCount, contactId, contact);

  // 只有初次加载才滚动到底部,加载更多时保持当前位置
  if (!isLoadMore) {
    scrollToBottom(chatContent);
  }

  // 🔍 详细日志：加载完成后的DOM状态
  const finalDomCount = chatContent.querySelectorAll('.chat-msg').length;
  const finalIds = Array.from(chatContent.querySelectorAll('.chat-msg[data-msg-id]'))
    .map(el => /** @type {HTMLElement} */(el).dataset.msgId);
  const idsPreview = finalIds.length > 5 ? `${finalIds.slice(0, 3).join(', ')}... (共${finalIds.length}个)` : finalIds.join(', ');
  logger.info('📊 [加载完成] DOM消息数:', finalDomCount, '现有ID:', idsPreview);
  logger.info(`✅ [加载历史完成] 本次渲染 ${messagesToRender.length} 条，总消息 ${history.length} 条，已显示 ${page.dataset.loadedCount} 条`);
}

/**
 * 处理发送文字按钮：显示用户气泡 + 暂存消息
 * @private
 */
async function handleSendText(page, contactId, contact, inputField) {
  const content = inputField.value.trim();

  if (!content) return;

  // 检查是否有引用
  const preview = page.querySelector('.chat-quote-preview');
  const hasQuote = preview && preview.style.display !== 'none' && preview.dataset.quotedMessageData;

  logger.info('[ChatView] 点击发送文字:', content.substring(0, 20), hasQuote ? '（引用消息）' : '');

  // 动态导入
  const { addPendingMessage } = await import('../ai-integration/pending-operations.js');
  const { saveChatMessage } = await import('../messages/message-chat-data.js');
  const { renderTextMessage } = await import('../messages/message-types/text-message.js');
  const { renderQuoteMessage } = await import('../messages/message-types/quote-message.js');
  const { generateMessageId } = await import('../utils/message-actions-helper.js');

  let message;

  if (hasQuote) {
    // 创建引用消息对象
    const quotedData = JSON.parse(preview.dataset.quotedMessageData);
    const senderName = preview.dataset.quotedSenderName || '未知';

    message = {
      id: generateMessageId(),
      sender: 'user',
      type: 'quote',
      time: Math.floor(Date.now() / 1000),
      quotedMessage: {
        id: quotedData.id || 'unknown',
        sender: quotedData.sender,
        senderName: senderName,
        time: quotedData.time,
        type: quotedData.type,
        content: quotedData.content,
        emojiName: quotedData.emojiName,
        imageUrl: quotedData.imageUrl,
        description: quotedData.description
      },
      replyContent: content
    };

    // 隐藏预览框
    hideQuotePreview(page);
  } else {
    // 创建普通文字消息
    message = {
      id: generateMessageId(),
      sender: 'user',
      content,
      time: Math.floor(Date.now() / 1000),
      type: 'text'
    };
  }

  // 保存到数据库
  // @ts-ignore - message可能是引用消息或普通消息，saveChatMessage接受所有类型
  await saveChatMessage(contactId, message);

  // 暂存到队列（等待纸飞机发送）
  if (hasQuote) {
    // 引用消息：构建特殊格式
    const quotedText = formatQuotePreviewText(message.quotedMessage);
    addPendingMessage(contactId, `[引用]${quotedText}[回复]${content}`, message.time);
  } else {
    // 普通文字消息
    addPendingMessage(contactId, content, message.time);
  }

  // 显示用户气泡
  // @ts-ignore - message可能是引用消息或普通消息，appendMessageToChat接受所有类型
  appendMessageToChat(page, message, contact, contactId);

  // 更新消息列表中的该联系人项（后台更新）
  updateMessageListItem(contactId);

  // 清空输入框
  inputField.value = '';
  inputField.style.height = 'auto';
  inputField.dispatchEvent(new Event('input')); // 触发input事件更新按钮显示

  // 清空草稿
  clearDraft(contactId);
}

/**
 * 处理发送表情：显示用户气泡 + 暂存消息
 * 
 * @async
 * @private
 * @param {HTMLElement} page - 聊天页面元素
 * @param {string} contactId - 联系人ID
 * @param {string} emojiId - 表情包ID（改用ID存储，支持改名）
 */
async function handleSendEmoji(page, contactId, emojiId) {
  logger.info('[ChatView] 发送表情 ID:', emojiId);

  // 动态导入
  const { addPendingMessage } = await import('../ai-integration/pending-operations.js');
  const { saveChatMessage } = await import('../messages/message-chat-data.js');
  const { renderEmojiMessage } = await import('../messages/message-types/emoji-message.js');
  const { loadContacts } = await import('../contacts/contact-list-data.js');
  const { findEmojiById } = await import('../emojis/emoji-manager-data.js');
  const { generateMessageId } = await import('../utils/message-actions-helper.js');

  // 获取表情包对象（用于获取名称）
  const emoji = findEmojiById(emojiId);
  if (!emoji) {
    logger.error('[ChatView] 表情包不存在:', emojiId);
    return;
  }

  // 获取联系人对象
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  // 创建消息对象（存储ID + 名称，添加唯一ID避免误删）
  const message = {
    id: generateMessageId(),
    sender: 'user',
    content: emojiId,      // 表情包ID（用于查找图片）
    emojiName: emoji.name, // 表情包名字（冗余存储，表情包删除后仍能显示）
    time: Math.floor(Date.now() / 1000),
    type: 'emoji'
  };

  // 保存到数据库
  await saveChatMessage(contactId, message);

  // 暂存到队列（等待纸飞机发送，传入表情包名称）
  addPendingMessage(contactId, `[表情]${emoji.name}`, message.time);

  // 显示用户气泡
  const chatContent = page.querySelector('.chat-content');
  const bubble = renderEmojiMessage(message, contact, contactId);
  chatContent.appendChild(bubble);
  scrollToBottom(chatContent);

  // 更新消息列表中的该联系人项（后台更新）
  updateMessageListItem(contactId);
}

/**
 * 处理发送图片
 * 
 * @private
 * @param {HTMLElement} page - 聊天页面元素
 * @param {string} contactId - 联系人ID
 * @returns {Promise<void>}
 * 
 * @description
 * 弹窗让用户输入图片描述和可选链接，然后发送图片消息
 */
async function handleSendImage(page, contactId) {
  logger.info('[ChatView] 显示发送图片弹窗');

  // 动态导入
  const { showCustomPopupWithData } = await import('../utils/popup-helper.js');
  const { addPendingMessage } = await import('../ai-integration/pending-operations.js');
  const { saveChatMessage } = await import('../messages/message-chat-data.js');
  const { renderImageMessage } = await import('../messages/message-types/image-message.js');
  const { loadContacts } = await import('../contacts/contact-list-data.js');
  const { generateMessageId } = await import('../utils/message-actions-helper.js');

  // 弹窗HTML
  const popupHTML = `
    <div style="padding: 1em;">
      <div style="margin-bottom: 1em;">
        <label style="display: block; margin-bottom: 0.5em; font-weight: bold;">图片描述（必填）</label>
        <textarea id="image-description" 
                  placeholder="请描述图片内容..." 
                  style="width: 100%; min-height: 5em; padding: 0.5em; border: 1px solid var(--phone-border); border-radius: 0.25em; resize: vertical;"
                  maxlength="200"></textarea>
      </div>
      <div>
        <label style="display: block; margin-bottom: 0.5em; font-weight: bold;">图片链接（可选）</label>
        <input type="text" 
               id="image-url" 
               placeholder="https://example.com/image.jpg" 
               style="width: 100%; padding: 0.5em; border: 1px solid var(--phone-border); border-radius: 0.25em;">
      </div>
    </div>
  `;

  // 显示弹窗
  const result = await showCustomPopupWithData('发送照片', popupHTML, {
    buttons: [
      { text: '取消', value: null },
      { text: '发送', value: 'send' }
    ],
    width: '90%',
    beforeClose: (buttonValue) => {
      if (buttonValue === 'send') {
        const descInput = /** @type {HTMLTextAreaElement|null} */ (document.querySelector('#image-description'));
        const urlInput = /** @type {HTMLInputElement|null} */ (document.querySelector('#image-url'));
        const description = descInput?.value.trim();
        const imageUrl = urlInput?.value.trim();
        return { action: 'send', description, imageUrl };
      }
      return { action: 'cancel' };
    }
  });

  // 用户取消
  if (!result || result.action !== 'send') {
    logger.debug('[ChatView] 用户取消发送图片');
    return;
  }

  // 验证描述必填
  if (!result.description) {
    const { showErrorToast } = await import('../ui-components/toast-notification.js');
    showErrorToast('请输入图片描述');
    logger.warn('[ChatView] 图片描述为空');
    return;
  }

  // 获取联系人对象
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  // 创建消息对象（添加唯一ID避免误删）
  const message = {
    id: generateMessageId(),
    sender: 'user',
    content: result.imageUrl
      ? `${result.description}|${result.imageUrl}`
      : result.description,  // content存储格式化后的内容（兼容字段）
    description: result.description,  // 单独保存描述（用于渲染）
    type: 'image',
    time: Math.floor(Date.now() / 1000)
  };

  // 如果有URL，添加到消息对象
  if (result.imageUrl) {
    message.imageUrl = result.imageUrl;
  }

  // 保存到数据库
  await saveChatMessage(contactId, message);

  // 暂存到队列（格式：[图片]描述 或 [图片]描述|链接）
  const pendingContent = result.imageUrl
    ? `[图片]${result.description}|${result.imageUrl}`
    : `[图片]${result.description}`;
  addPendingMessage(contactId, pendingContent, message.time);

  // 显示用户气泡
  const chatContent = page.querySelector('.chat-content');
  const bubble = renderImageMessage(message, contact, contactId);
  chatContent.appendChild(bubble);
  scrollToBottom(chatContent);

  logger.info('[ChatView] 图片消息已发送:', { description: result.description, hasUrl: !!result.imageUrl });

  // 更新消息列表
  updateMessageListItem(contactId);
}

/**
 * 处理打开转账页面
 * @private
 * @async
 * @param {string} contactId - 联系人ID
 */
async function handleOpenTransfer(contactId) {
  logger.info('[ChatView] 打开转账页面，联系人:', contactId);

  // 动态导入
  const { showPage } = await import('../phone-main-ui.js');

  // 打开转账页面
  const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlay) {
    await showPage(overlay, 'transfer', { contactId });
  } else {
    logger.error('[ChatView] 找不到.phone-overlay容器！');
  }
}

/**
 * 处理纸飞机按钮：调用AI + 显示AI气泡 + 终止键
 * @private
 */
async function handleSendToAI(page, contactId, contact, sendBtn) {
  logger.info('[ChatView] 点击纸飞机，开始调用AI');

  // 类型断言
  const sendButton = /** @type {HTMLButtonElement} */ (sendBtn);

  // ✅ 清空上一轮的调试数据 + 保存当前快照（包含多联系人消息）
  const { clearDebugState, saveSnapshot } = await import('./message-debug-ui.js');
  const { loadChatHistory } = await import('./message-chat-data.js');
  const { getAllPendingOperations } = await import('../ai-integration/pending-operations.js');

  clearDebugState(contactId);
  const chatHistory = await loadChatHistory(contactId);
  const allPendingOps = getAllPendingOperations();

  // 保存完整快照（消息数量 + 所有待发送消息）
  saveSnapshot(contactId, {
    messageCount: chatHistory.length,
    allPendingMessages: allPendingOps.messages
  });

  // 获取 PhoneAPI 实例（完全照搬日记）
  const { getPhoneSystem } = await import('../phone-system.js');
  const phoneSystem = getPhoneSystem();

  if (!phoneSystem || !phoneSystem.api) {
    logger.error('[ChatView] 手机系统未初始化');
    return;
  }

  // 如果正在生成，则终止
  if (phoneSystem.api.isGenerating) {
    logger.info('[ChatView] 终止生成');
    phoneSystem.api.abort();

    // 恢复按钮状态
    sendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    sendButton.disabled = false;
    sendButton.classList.remove('generating');

    // ✅ 触发事件：通知调试界面恢复按钮状态
    document.dispatchEvent(new CustomEvent('phone-debug-reroll-end', {
      detail: { contactId }
    }));

    return;
  }

  // 改变按钮状态（变成终止键）
  sendButton.innerHTML = '<i class="fa-solid fa-circle-stop"></i>';
  sendButton.classList.add('generating');

  // 调用AI（使用PhoneAPI实例）
  await phoneSystem.api.sendToAI(
    contactId,
    // onMessageReceived: 收到消息时的回调
    async (message) => {
      // ✅ 动态查找当前活跃页面（解决闭包绑定旧DOM的问题）
      const currentPage = findActiveChatPage(contactId);

      // 1. 尝试更新DOM（仅当页面存在且活跃时）
      if (currentPage) {
        // 重新加载联系人数据（确保使用最新数据）
        const contacts = await loadContacts();
        const currentContact = contacts.find(c => c.id === contactId);
        if (currentContact) {
          await appendMessageToChat(currentPage, message, currentContact, contactId);
        }
      }

      // 2. 检查是否需要显示通知（页面不可见时显示）
      const isCurrentChatVisible = isChatPageVisible(contactId);

      // 检查通知设置
      if (!isCurrentChatVisible && shouldShowNotification(contact, message)) {
        // 页面不可见且允许通知，显示通知
        const { showPhoneMessageNotification } = await import('../ui-components/toast-notification.js');
        const displayName = getContactDisplayName(contact);

        showPhoneMessageNotification({
          contactId: contactId,  // ← 传入contactId获取对应头像
          characterName: displayName,
          title: '发来新消息',
          content: getNotificationContent(contact, message),
          onClick: () => {
            // 点击通知，打开聊天页面
            openChatFromNotification(contactId);
          }
        });
      }
    },
    // onComplete: 完成时的回调
    () => {
      logger.info('[ChatView] AI回复完成');

      // ✅ 按钮状态由事件监听器自动更新（bindAIGenerationEvents）

      // 更新消息列表
      updateMessageListItem(contactId);
    },
    // onError: 错误时的回调
    (error) => {
      logger.error('[ChatView] AI回复失败:', error);

      // ✅ 按钮状态由事件监听器自动更新（bindAIGenerationEvents）

      // 显示错误提示
      const toastr = window.toastr;
      if (toastr) {
        toastr.error(`AI回复失败: ${error}`);
      }
    }
  );
}

/**
 * 追加消息到聊天区域
 * 
 * @async
 * @param {HTMLElement} page - 页面元素
 * @param {Object} message - 消息对象
 * @param {Object} contact - 联系人对象
 * @param {string} contactId - 联系人ID（用于删除等操作）
 */
export async function appendMessageToChat(page, message, contact, contactId) {
  logger.debug('[ChatView.appendMessageToChat] ==================== 开始追加消息 ====================');
  logger.debug('[ChatView.appendMessageToChat] 消息类型:', message.type);
  logger.debug('[ChatView.appendMessageToChat] 消息ID:', message.id);
  logger.debug('[ChatView.appendMessageToChat] contactId:', contactId);
  logger.debug('[ChatView.appendMessageToChat] 完整消息对象:', message);

  // 防御性检查：确保页面DOM存在
  logger.debug('[ChatView.appendMessageToChat] 检查page是否存在:', !!page);
  logger.debug('[ChatView.appendMessageToChat] 检查page.parentElement:', !!page?.parentElement);

  if (!page || !page.parentElement) {
    logger.warn('[ChatView.appendMessageToChat] ❌ 页面不存在或已销毁，跳过DOM更新');
    return;
  }

  const chatContent = page.querySelector('.chat-content');
  logger.debug('[ChatView.appendMessageToChat] 查找.chat-content结果:', !!chatContent);

  if (!chatContent) {
    logger.error('[ChatView.appendMessageToChat] ❌ 未找到聊天内容区！');
    logger.error('[ChatView.appendMessageToChat] page的所有子元素:');
    Array.from(page.children).forEach((child, i) => {
      const el = /** @type {HTMLElement} */ (child);
      logger.error(`  [${i}] ${el.tagName}.${el.className}`);
    });
    return;
  }

  logger.debug('[ChatView.appendMessageToChat] chatContent详情:', {
    tagName: chatContent.tagName,
    className: chatContent.className,
    childrenCount: chatContent.children.length
  });

  // ✅ 防止重复添加：检查消息是否已存在于DOM
  if (message.id) {
    const existingMsg = chatContent.querySelector(`[data-msg-id="${message.id}"]`);
    logger.debug('[ChatView.appendMessageToChat] DOM重复检查（querySelector）:', !!existingMsg);

    if (existingMsg) {
      logger.warn('[ChatView.appendMessageToChat] 📛 消息已存在于DOM，跳过重复添加:', message.id);
      return;
    }
  }

  // ✅ 检查是否已在PhoneAPI的渲染记录中
  const { getPhoneSystem } = await import('../phone-system.js');
  const phoneAPI = getPhoneSystem().api;

  const isRendered = message.id && phoneAPI.isMessageRendered(contactId, message.id);
  logger.debug('[ChatView.appendMessageToChat] PhoneAPI渲染记录检查:', isRendered);

  if (isRendered) {
    logger.warn('[ChatView.appendMessageToChat] 📛 消息已在渲染记录中，跳过重复添加:', message.id);
    return;
  }

  logger.debug('[ChatView.appendMessageToChat] ✅ 通过所有检查，准备渲染消息');

  // 🔍 详细日志：追加前的DOM状态
  const beforeCount = chatContent.querySelectorAll('.chat-msg').length;
  const existingIds = Array.from(chatContent.querySelectorAll('.chat-msg[data-msg-id]'))
    .map(el => /** @type {HTMLElement} */(el).dataset.msgId);
  logger.info('📊 [追加前] DOM消息数:', beforeCount, '消息ID:', message.id || '无', '现有ID列表:', existingIds.join(', '));

  // 动态导入
  const { renderTextMessage } = await import('./message-types/text-message.js');
  const { renderEmojiMessage } = await import('./message-types/emoji-message.js');
  const { renderImageMessage } = await import('./message-types/image-message.js');
  const { renderQuoteMessage } = await import('./message-types/quote-message.js');
  const { renderTransferMessage } = await import('./message-types/transfer-message.js');
  const { renderRecalledMessage } = await import('./message-types/recalled-message.js');
  const { renderPlanMessage } = await import('./message-types/plan-message.js');
  const { renderPlanStoryMessage } = await import('./message-types/plan-story-message.js');
  const { renderPokeMessage } = await import('./message-types/poke-message.js');

  // 根据消息类型渲染不同的气泡
  let bubble;

  logger.debug('[ChatView.appendMessageToChat] 开始渲染气泡，消息类型:', message.type);

  switch (message.type) {
    case 'emoji':
      logger.debug('[ChatView.appendMessageToChat] 渲染表情包消息');
      bubble = renderEmojiMessage(message, contact, contactId);
      break;

    case 'text':
      // 检查是否是计划剧情消息
      if (message.content?.match(/^\[约定计划(过程|内心印象|过程记录)\]/)) {
        logger.debug('[ChatView.appendMessageToChat] 渲染计划剧情消息');
        bubble = renderPlanStoryMessage(message, contactId);
      }
      // 检查是否是计划消息
      else if (message.content?.startsWith('[约定计划')) {
        logger.debug('[ChatView.appendMessageToChat] 渲染计划消息');
        bubble = renderPlanMessage(message, contact, contactId);
        // 如果返回 null（例如旧数据的响应消息缺少 quotedPlanId），降级为普通文本
        if (!bubble) {
          logger.debug('[ChatView.appendMessageToChat] 计划消息渲染器返回null，降级为普通文本');
          bubble = renderTextMessage(message, contact, contactId);
        }
      } else {
        logger.debug('[ChatView.appendMessageToChat] 渲染文本消息');
        bubble = renderTextMessage(message, contact, contactId);
      }
      break;

    case 'image':
      logger.debug('[ChatView.appendMessageToChat] 渲染图片消息');
      bubble = renderImageMessage(message, contact, contactId);
      break;

    case 'transfer':
      logger.debug('[ChatView.appendMessageToChat] 渲染转账消息');
      logger.debug('[ChatView.appendMessageToChat] 转账消息数据:', {
        amount: message.amount,
        message: message.message,
        sender: message.sender
      });
      bubble = renderTransferMessage(message, contact, contactId);
      logger.debug('[ChatView.appendMessageToChat] 转账气泡已生成');
      break;

    case 'quote':
      logger.debug('[ChatView.appendMessageToChat] 渲染引用消息');
      bubble = renderQuoteMessage(message, contact, contactId);
      break;

    case 'recalled':
      // 已撤回消息（直接显示撤回提示）
      logger.debug('[ChatView.appendMessageToChat] 渲染撤回消息');
      bubble = renderRecalledMessage(message, contact, contactId);
      break;

    case 'recalled-pending':
      // 待撤回消息（先显示原消息，随机3-8秒后变撤回提示）
      logger.debug('[ChatView.appendMessageToChat] 渲染待撤回消息（触发动画）');
      bubble = handleRecalledPending(message, contact, contactId, renderTextMessage, renderRecalledMessage);
      break;

    case 'poke':
      // 戳一戳消息
      logger.debug('[ChatView.appendMessageToChat] 渲染戳一戳消息');
      bubble = renderPokeMessage(message, contact, contactId);
      break;

    // TODO 第二期：实现专门的渲染器
    // - messages/message-types/redpacket-message.js
    // - messages/message-types/video-message.js
    // - messages/message-types/file-message.js
    // 临时降级：显示为文字提示
    case 'redpacket':
      logger.debug('[ChatView.appendMessageToChat] 渲染红包消息（降级为文字）');
      bubble = renderTextMessage({
        ...message,
        content: `[红包] ¥${message.amount}`,
        type: 'text'
      }, contact, contactId);
      logger.warn('[ChatView] 红包渲染器未实现，显示为文字');
      break;

    case 'video':
      bubble = renderTextMessage({
        ...message,
        content: `[视频] ${message.description}`,
        type: 'text'
      }, contact, contactId);
      logger.warn('[ChatView] 视频渲染器未实现，显示为文字');
      break;

    case 'file':
      bubble = renderTextMessage({
        ...message,
        content: `[文件] ${message.filename} (${message.size})`,
        type: 'text'
      }, contact, contactId);
      logger.warn('[ChatView] 文件渲染器未实现，显示为文字');
      break;

    default:
      // 未知类型，降级为文字
      logger.warn('[ChatView] 未知消息类型:', message.type);
      bubble = renderTextMessage({
        ...message,
        content: message.content || '[未知消息类型]',
        type: 'text'
      }, contact, contactId);
      break;
  }

  // 检查bubble是否生成成功
  logger.debug('[ChatView.appendMessageToChat] bubble生成结果:', !!bubble);

  if (!bubble) {
    logger.error('[ChatView.appendMessageToChat] ❌ bubble未生成！消息类型:', message.type);
    return;
  }

  logger.debug('[ChatView.appendMessageToChat] bubble详情:', {
    tagName: bubble.tagName,
    className: bubble.className,
    childrenCount: bubble.children.length,
    innerHTML前100字符: bubble.innerHTML.substring(0, 100)
  });

  // 添加消息ID到DOM（方便追踪）
  if (message.id) {
    bubble.dataset.msgId = message.id;
    logger.debug('[ChatView.appendMessageToChat] 已设置data-msg-id:', message.id);
  }

  logger.debug('[ChatView.appendMessageToChat] 准备appendChild到chatContent');
  chatContent.appendChild(bubble);
  logger.debug('[ChatView.appendMessageToChat] ✅ 气泡已添加到DOM');

  // 验证是否真的添加成功
  const verifyAdded = chatContent.querySelector(`[data-msg-id="${message.id}"]`);
  logger.debug('[ChatView.appendMessageToChat] 验证添加结果:', !!verifyAdded);

  // ✅ 绑定长按操作菜单
  logger.debug('[ChatView.appendMessageToChat] 准备绑定长按事件');
  bindLongPress(bubble, message, contactId);
  logger.debug('[ChatView.appendMessageToChat] 长按事件已绑定');

  // ✅ 标记消息已渲染（通知PhoneAPI）
  if (message.id) {
    phoneAPI.markMessageRendered(contactId, message.id);
    logger.debug('[ChatView.appendMessageToChat] 已标记为已渲染:', message.id);
  }

  // 🔍 详细日志：追加后的DOM状态
  const afterCount = chatContent.querySelectorAll('.chat-msg').length;
  const afterIds = Array.from(chatContent.querySelectorAll('.chat-msg[data-msg-id]'))
    .map(el => /** @type {HTMLElement} */(el).dataset.msgId);
  logger.info('📊 [追加后] DOM消息数:', afterCount, '(+', afterCount - beforeCount, ')', '新消息ID:', message.id);

  // ✅ 戳一戳消息：触发屏幕震动
  if (message.type === 'poke') {
    logger.debug('[ChatView.appendMessageToChat.Poke] ========== 戳一戳震动调试开始 ==========');
    logger.debug('[ChatView.appendMessageToChat.Poke] 消息发送者:', message.sender);

    const chatPage = page.closest('.phone-chat-page') || page;
    const direction = message.sender === 'user' ? 'left' : 'right';

    logger.debug('[ChatView.appendMessageToChat.Poke] page元素:', {
      id: page.id,
      className: page.className,
      tagName: page.tagName
    });
    logger.debug('[ChatView.appendMessageToChat.Poke] 查找.phone-chat-page结果:', !!page.closest('.phone-chat-page'));
    logger.debug('[ChatView.appendMessageToChat.Poke] chatPage元素:', {
      id: chatPage.id,
      className: chatPage.className,
      tagName: chatPage.tagName,
      isPage: chatPage === page
    });
    logger.debug('[ChatView.appendMessageToChat.Poke] 震动方向:', direction);
    logger.debug('[ChatView.appendMessageToChat.Poke] 将添加的类名:', `shaking-${direction}`);

    // 延迟250ms触发震动（让手指动画先开始）
    setTimeout(() => {
      logger.debug('[ChatView.appendMessageToChat.Poke] 250ms后，准备添加震动类');
      logger.debug('[ChatView.appendMessageToChat.Poke] 添加前的classList:', Array.from(chatPage.classList).join(', '));

      chatPage.classList.add(`shaking-${direction}`);

      logger.debug('[ChatView.appendMessageToChat.Poke] 添加后的classList:', Array.from(chatPage.classList).join(', '));
      logger.info('[ChatView.appendMessageToChat.Poke] ✅ 震动类已添加:', `shaking-${direction}`);

      setTimeout(() => {
        logger.debug('[ChatView.appendMessageToChat.Poke] 900ms后，准备移除震动类');
        chatPage.classList.remove(`shaking-${direction}`);
        logger.debug('[ChatView.appendMessageToChat.Poke] 震动类已移除');
      }, 900);
    }, 250);

    logger.debug('[ChatView.appendMessageToChat.Poke] ========== 戳一戳震动调试结束 ==========');
  }

  // 添加动画效果（根据发送者使用不同动画）
  const animClass = message.sender === 'contact' ? 'chat-msg-enter-ai' : 'chat-msg-enter-user';
  logger.debug('[ChatView.appendMessageToChat] 准备添加动画类:', animClass, 'sender:', message.sender);

  bubble.classList.add(animClass);

  // 监听动画结束，移除动画类（防止类累积）
  bubble.addEventListener('animationend', function removeAnimClass() {
    bubble.classList.remove(animClass);
    bubble.removeEventListener('animationend', removeAnimClass);
  }, { once: true });

  logger.debug('[ChatView.appendMessageToChat] 已添加动画类:', animClass);

  // 滚动到底部
  scrollToBottom(chatContent);
  logger.debug('[ChatView.appendMessageToChat] 已滚动到底部');
  logger.info('[ChatView.appendMessageToChat] ==================== 追加消息完成 ====================');
}

/**
 * 滚动到底部
 * @private
 * @param {HTMLElement} chatContent - 聊天内容容器
 */
function scrollToBottom(chatContent) {
  logger.debug('[ChatView.scrollToBottom] 开始滚动');
  logger.debug('[ChatView.scrollToBottom] 滚动前状态:', {
    scrollTop: chatContent.scrollTop,
    scrollHeight: chatContent.scrollHeight,
    clientHeight: chatContent.clientHeight,
    需要滚动距离: chatContent.scrollHeight - chatContent.clientHeight
  });

  // 使用requestAnimationFrame确保DOM布局完成后再滚动
  requestAnimationFrame(() => {
    const before = chatContent.scrollTop;
    chatContent.scrollTop = chatContent.scrollHeight;

    logger.debug('[ChatView.scrollToBottom] 滚动后状态:', {
      scrollTop: chatContent.scrollTop,
      scrollHeight: chatContent.scrollHeight,
      实际滚动距离: chatContent.scrollTop - before,
      是否到底: Math.abs(chatContent.scrollTop + chatContent.clientHeight - chatContent.scrollHeight) < 5
    });
  });
}

/**
 * 渲染消息到底部（初次加载）
 * @private
 */
async function renderMessagesToBottom(chatContent, messages, contact, contactId, phoneAPI) {
  const { renderTextMessage, renderTimeSepar } = await import('./message-types/text-message.js');
  const { renderEmojiMessage } = await import('./message-types/emoji-message.js');
  const { renderImageMessage } = await import('./message-types/image-message.js');
  const { renderQuoteMessage } = await import('./message-types/quote-message.js');
  const { renderTransferMessage } = await import('./message-types/transfer-message.js');
  const { renderRecalledMessage } = await import('./message-types/recalled-message.js');
  const { renderPlanMessage } = await import('./message-types/plan-message.js');
  const { renderPlanStoryMessage } = await import('./message-types/plan-story-message.js');
  const { renderPokeMessage } = await import('./message-types/poke-message.js');

  let lastTime = null;

  messages.forEach((message, index) => {
    // 显示时间分隔（每5分钟显示一次）
    if (index === 0 || message.time - lastTime > 300) {
      const timeSep = renderTimeSepar(message.time);
      chatContent.appendChild(timeSep);
      lastTime = message.time;
    }

    const bubble = renderSingleBubble(message, contact, contactId, phoneAPI, {
      renderTextMessage,
      renderEmojiMessage,
      renderImageMessage,
      renderQuoteMessage,
      renderTransferMessage,
      renderRecalledMessage,
      renderPlanMessage,
      renderPlanStoryMessage,
      renderPokeMessage
    });
    chatContent.appendChild(bubble);
  });
}

/**
 * 渲染消息到顶部（加载更多）
 * @private
 */
async function renderMessagesToTop(chatContent, messages, contact, contactId, phoneAPI) {
  const { renderTextMessage, renderTimeSepar } = await import('./message-types/text-message.js');
  const { renderEmojiMessage } = await import('./message-types/emoji-message.js');
  const { renderImageMessage } = await import('./message-types/image-message.js');
  const { renderQuoteMessage } = await import('./message-types/quote-message.js');
  const { renderTransferMessage } = await import('./message-types/transfer-message.js');
  const { renderRecalledMessage } = await import('./message-types/recalled-message.js');
  const { renderPlanMessage } = await import('./message-types/plan-message.js');
  const { renderPlanStoryMessage } = await import('./message-types/plan-story-message.js');
  const { renderPokeMessage } = await import('./message-types/poke-message.js');

  const fragment = document.createDocumentFragment();
  let lastTime = null;

  // 保存当前滚动位置
  const oldScrollHeight = chatContent.scrollHeight;

  messages.forEach((message, index) => {
    // 显示时间分隔（每5分钟显示一次）
    if (index === 0 || message.time - lastTime > 300) {
      const timeSep = renderTimeSepar(message.time);
      fragment.appendChild(timeSep);
      lastTime = message.time;
    }

    const bubble = renderSingleBubble(message, contact, contactId, phoneAPI, {
      renderTextMessage,
      renderEmojiMessage,
      renderImageMessage,
      renderQuoteMessage,
      renderTransferMessage,
      renderRecalledMessage,
      renderPlanMessage,
      renderPlanStoryMessage,
      renderPokeMessage
    });
    fragment.appendChild(bubble);
  });

  // 在第一个子元素之前插入（跳过加载按钮）
  const firstMessage = chatContent.querySelector('.chat-msg, .chat-time-separ');
  if (firstMessage) {
    chatContent.insertBefore(fragment, firstMessage);
  } else {
    chatContent.appendChild(fragment);
  }

  // 恢复滚动位置（防止跳动）
  chatContent.scrollTop = chatContent.scrollHeight - oldScrollHeight;
}

/**
 * 渲染单个消息气泡
 * @private
 */
function renderSingleBubble(message, contact, contactId, phoneAPI, renderers) {
  const { renderTextMessage, renderEmojiMessage, renderImageMessage, renderQuoteMessage, renderTransferMessage, renderRecalledMessage, renderPlanMessage, renderPlanStoryMessage } = renderers;

  let bubble;

  switch (message.type) {
    case 'emoji':
      bubble = renderEmojiMessage(message, contact, contactId);
      break;
    case 'text':
      // 检查是否是计划剧情消息
      if (message.content?.match(/^\[约定计划(过程|内心印象|过程记录)\]/)) {
        bubble = renderPlanStoryMessage ? renderPlanStoryMessage(message, contactId) : renderTextMessage(message, contact, contactId);
      }
      // 检查是否是计划消息
      else if (message.content?.startsWith('[约定计划')) {
        bubble = renderPlanMessage ? renderPlanMessage(message, contact, contactId) : renderTextMessage(message, contact, contactId);
        // 如果返回 null（例如旧数据的响应消息缺少 quotedPlanId），降级为普通文本
        if (!bubble) {
          logger.debug('[ChatView.renderSingleBubble] 计划消息渲染器返回null，降级为普通文本');
          bubble = renderTextMessage(message, contact, contactId);
        }
      } else {
        bubble = renderTextMessage(message, contact, contactId);
      }
      break;
    case 'image':
      bubble = renderImageMessage(message, contact, contactId);
      break;
    case 'quote':
      bubble = renderQuoteMessage(message, contact, contactId);
      break;
    case 'transfer':
      bubble = renderTransferMessage(message, contact, contactId);
      break;
    case 'recalled':
      // 已撤回消息（直接显示撤回提示）
      bubble = renderRecalledMessage(message, contact, contactId);
      break;
    case 'recalled-pending':
      // 待撤回消息（先显示原消息，随机3-8秒后变成撤回提示）
      bubble = handleRecalledPending(message, contact, contactId, renderTextMessage, renderRecalledMessage);
      break;
    case 'poke':
      // 戳一戳消息
      bubble = renderers.renderPokeMessage ? renderers.renderPokeMessage(message, contact, contactId) : renderTextMessage({ ...message, content: '[戳一戳]', type: 'text' }, contact, contactId);
      break;
    case 'redpacket':
      bubble = renderTextMessage({ ...message, content: `[红包] ¥${message.amount}`, type: 'text' }, contact, contactId);
      break;
    case 'video':
      bubble = renderTextMessage({ ...message, content: `[视频] ${message.description}`, type: 'text' }, contact, contactId);
      break;
    case 'file':
      bubble = renderTextMessage({ ...message, content: `[文件] ${message.filename} (${message.size})`, type: 'text' }, contact, contactId);
      break;
    default:
      bubble = renderTextMessage({ ...message, content: message.content || '[未知消息类型]', type: 'text' }, contact, contactId);
      break;
  }

  // 安全检查：确保 bubble 不为 null（防御性编程）
  if (!bubble) {
    logger.error('[ChatView.renderSingleBubble] 渲染器返回null，消息:', message);
    bubble = renderTextMessage({ ...message, content: message.content || '[渲染失败]', type: 'text' }, contact, contactId);
  }

  // 添加消息ID到DOM
  if (message.id) {
    bubble.dataset.msgId = message.id;
    phoneAPI.markMessageRendered(contactId, message.id);
  }

  // 绑定长按操作菜单
  bindLongPress(bubble, message, contactId);

  return bubble;
}

/**
 * 处理待撤回消息（先显示原消息，延迟后变撤回提示）
 * 
 * @private
 * @param {Object} message - 待撤回消息对象
 * @param {Object} contact - 联系人对象
 * @param {string} contactId - 联系人ID
 * @param {Function} renderTextMessage - 文字消息渲染器
 * @param {Function} renderRecalledMessage - 撤回消息渲染器
 * @returns {HTMLElement} 消息气泡（会在延迟后被替换）
 * 
 * @description
 * 撤回动画流程：
 * 1. 先渲染原消息（文字类型）
 * 2. 随机延迟3-8秒（模拟人思考要不要撤回）
 * 3. 替换为撤回提示气泡
 * 
 * ⚠️ 注意：存储里已经保存为 recalled 类型，这里只做视觉动画，不更新存储
 */
function handleRecalledPending(message, contact, contactId, renderTextMessage, renderRecalledMessage) {
  // 1. 先渲染原消息（作为临时气泡）
  const tempMessage = {
    ...message,
    type: 'text',
    content: message.originalContent,
    sender: 'contact'
  };

  const tempBubble = renderTextMessage(tempMessage, contact, contactId);

  // 2. 随机延迟3-8秒后撤回
  const recallDelay = 3000 + Math.random() * 5000;  // 3000-8000ms

  setTimeout(() => {
    // 检查气泡是否还在DOM中（用户可能已关闭聊天页）
    if (!document.body.contains(tempBubble)) {
      logger.debug('[RecalledPending] 气泡已从DOM移除，跳过撤回动画');
      return;
    }

    // 3. 构建撤回消息对象
    const recalledMessage = {
      ...message,
      type: 'recalled',
      recalledTime: Math.floor(Date.now() / 1000)
    };

    // 4. 渲染撤回气泡并替换
    const recalledBubble = renderRecalledMessage(recalledMessage, contact, contactId);
    tempBubble.replaceWith(recalledBubble);

    // ✅ 不更新存储：存储里已经保存为recalled类型（在ai-send-controller.js里处理）

    logger.info('[RecalledPending] 撤回动画完成，延迟:', Math.round(recallDelay), 'ms');
  }, recallDelay);

  return tempBubble;
}

/**
 * 更新/创建"加载更多"按钮
 * @private
 */
function updateLoadMoreButton(page, hasMore, remainingCount, contactId, contact) {
  const chatContent = page.querySelector('.chat-content');
  let loadMoreBtn = chatContent.querySelector('.chat-load-more-btn');

  if (hasMore) {
    // 需要显示按钮
    if (!loadMoreBtn) {
      // 创建按钮
      loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'chat-load-more-btn';
      loadMoreBtn.textContent = `查看更早的消息（剩余${remainingCount}条）`;

      // 绑定点击事件
      loadMoreBtn.addEventListener('click', async () => {
        // 禁用按钮
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = '加载中...';

        // 加载更多消息
        await loadChatHistoryAndRender(page, contactId, contact, true);

        // 按钮会在loadChatHistoryAndRender中更新或移除
      });

      // 插入到最前面
      chatContent.insertBefore(loadMoreBtn, chatContent.firstChild);
    } else {
      // 更新按钮文字
      loadMoreBtn.textContent = `查看更早的消息（剩余${remainingCount}条）`;
      loadMoreBtn.disabled = false;
    }
  } else {
    // 不需要显示按钮，移除
    if (loadMoreBtn) {
      loadMoreBtn.remove();
    }
  }
}

/**
 * 监听设置变化事件
 * @private
 */
function bindLoadSettingsChangeListener(page, contactId) {
  const handler = async (e) => {
    if (e.detail.contactId === contactId) {
      logger.info('[ChatView] 检测到设置变化，重新加载消息');

      // 重置加载状态
      page.dataset.loadedCount = '0';

      // 重新加载消息
      const contacts = await (await import('../contacts/contact-list-data.js')).loadContacts();
      const contact = contacts.find(c => c.id === contactId);
      if (contact) {
        await loadChatHistoryAndRender(page, contactId, contact, false);
      }
    }
  };

  document.addEventListener('chat-send-settings-changed', handler);

  // 页面销毁时自动清理
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === page) {
          document.removeEventListener('chat-send-settings-changed', handler);
          observer.disconnect();
          logger.debug('[ChatView] 已清理设置变化监听器');
        }
      });
    });
  });

  if (page.parentElement) {
    observer.observe(page.parentElement, { childList: true });
  }
}

/**
 * 更新消息列表中的联系人项（后台更新）
 * 
 * @private
 * 
 * @description
 * 接收到新消息后调用，更新消息列表中的内容和位置。
 * - 更新预览文本、时间、未读徽章（内容更新）
 * - 重新计算位置（置顶的始终在前面，按时间排序）
 */
async function updateMessageListItem(contactId) {
  try {
    const { updateContactItem, updateMessageItemPosition } = await import('./message-list-ui.js');

    // 1. 更新内容（预览文本、时间、徽章）
    await updateContactItem(contactId);

    // 2. 更新位置（置顶的保持在前，按时间排序）
    await updateMessageItemPosition(contactId);
  } catch (error) {
    logger.warn('[ChatView] 更新消息列表项失败:', error);
    // 不影响主流程，静默失败
  }
}

// ========================================
// [后台生成与通知] 辅助函数
// ========================================

/**
 * 检查聊天页是否可见
 * 
 * @description
 * 用于判断是否需要显示通知。
 * 页面可见时不显示通知，页面不可见时显示通知。
 * 
 * @param {string} contactId - 联系人ID
 * @returns {boolean} 是否可见
 */
function isChatPageVisible(contactId) {
  const pageId = `page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const page = document.getElementById(pageId);
  return !!(page && page.classList.contains('active') && page.parentElement);
}

/**
 * 格式化消息内容用于通知显示
 * 
 * @description
 * 根据消息类型返回适合在通知中显示的文本。
 * 
 * @param {Object} message - 消息对象
 * @returns {string} 格式化后的文本
 */
function formatMessageContentForNotification(message) {
  switch (message.type) {
    case 'text':
      return message.content;
    case 'emoji':
      return `[表情]${message.content}`;
    case 'redpacket':
      return `[红包] ¥${message.amount}`;
    case 'transfer':
      return `[转账] ¥${message.amount}`;
    case 'image':
      return '[图片]';
    case 'video':
      return '[视频]';
    case 'file':
      return `[文件] ${message.filename}`;
    default:
      return '[消息]';
  }
}

/**
 * 从通知点击打开聊天页面
 * 
 * @description
 * 处理通知点击事件，自动打开手机界面并跳转到对应聊天页。
 * 
 * @async
 * @param {string} contactId - 联系人ID
 */
async function openChatFromNotification(contactId) {
  logger.info('[ChatView] 从通知打开聊天页面:', contactId);

  // 如果手机界面已关闭，先打开
  const phoneContainer = document.querySelector('.phone-container');
  if (!phoneContainer) {
    const { openPhoneUI } = await import('../index.js');
    await openPhoneUI();

    // 等待界面渲染
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // 切换到消息标签页并打开聊天页面
  const { switchTab, showPage } = await import('../phone-main-ui.js');
  const overlayLayer = /** @type {HTMLElement} */ (document.querySelector('.phone-content-overlay'));

  if (overlayLayer) {
    // 切换到消息标签页
    await switchTab(overlayLayer, 'messages');

    // 打开聊天页面
    await showPage(overlayLayer, 'chat', { contactId });
  }
}

// TODO: 后期扩展 - 角色通知开关判断
/**
 * 检查是否应该显示通知
 *
 * @description
 * 检查联系人的通知设置，决定是否显示通知。
 * 逻辑：
 * - 如果 notificationDisabled = true → 完全不弹通知
 * - 否则 → 允许弹通知（内容由 getNotificationContent 决定）
 *
 * @param {Object} contact - 联系人对象
 * @param {Object} message - 消息对象
 * @returns {boolean} 是否显示通知
 *
 * @example
 * if (!isCurrentChatVisible && shouldShowNotification(contact, message)) {
 *   showPhoneMessageNotification({...});
 * }
 */
function shouldShowNotification(contact, message) {
  // 检查是否关闭了消息弹窗（默认false=允许弹窗）
  if (contact.notificationDisabled === true) {
    logger.debug('[ChatView] 该联系人已关闭消息弹窗，不显示通知:', contact.name);
    return false;
  }

  return true;
}

/**
 * 获取通知显示内容
 *
 * @description
 * 根据联系人的通知预览设置，返回通知应该显示的内容。
 * 逻辑：
 * - 如果 notificationPreview = false → 只显示"发来了新消息"
 * - 否则 → 显示消息内容（调用 formatMessageContentForNotification）
 *
 * @param {Object} contact - 联系人对象
 * @param {Object} message - 消息对象
 * @returns {string} 通知内容
 *
 * @example
 * const content = getNotificationContent(contact, message);
 * // 如果 notificationPreview = false → "发来了新消息"
 * // 否则 → "你好啊"
 */
function getNotificationContent(contact, message) {
  // 检查是否显示消息预览（默认true=显示预览）
  if (contact.notificationPreview === false) {
    return '发来了新消息';
  }

  // 显示消息内容
  return formatMessageContentForNotification(message);
}

/**
 * 动态查找当前活跃的聊天页面
 * 
 * @description
 * 根据contactId查找当前正在显示的聊天页面DOM元素。
 * 解决闭包持有旧DOM引用的问题：当页面销毁重建时，总是返回最新的DOM。
 * 
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement|null} 当前活跃的聊天页面元素，不存在则返回null
 * 
 * @example
 * // 在消息回调中使用
 * const currentPage = findActiveChatPage('tavern_Wade Wilson');
 * if (currentPage) {
 *   await appendMessageToChat(currentPage, message, contact);
 * }
 */
function findActiveChatPage(contactId) {
  // 转换contactId为DOM ID格式（与renderChatView中的逻辑一致）
  const pageId = `page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // 查找对应的页面元素
  const page = document.getElementById(pageId);

  // 确保页面存在、已挂载到DOM、且处于active状态
  if (page && page.parentElement && page.classList.contains('active')) {
    logger.debug('[findActiveChatPage] 找到活跃页面:', pageId);
    return page;
  }

  logger.debug('[findActiveChatPage] 未找到活跃页面:', pageId, {
    pageExists: !!page,
    hasParent: page?.parentElement !== null,
    isActive: page?.classList.contains('active')
  });
  return null;
}

/**
 * 应用聊天背景配置（渲染时）
 * 
 * @description
 * 在渲染聊天页时，读取联系人的背景配置并应用到 .chat-content 元素
 * 使用 CSS 变量实现，支持背景图片 + 遮罩层
 * 
 * @param {HTMLElement} chatContent - 聊天内容区元素
 * @param {Object} contact - 联系人对象
 */
function applyChatBackgroundOnRender(chatContent, contact) {
  if (!contact.chatBackground) {
    logger.debug('[ChatView] 无自定义背景配置，使用默认');
    return;
  }

  const bgConfig = contact.chatBackground;

  logger.debug('[ChatView] 应用聊天背景配置:', {
    imageUrl: bgConfig.imageUrl,
    overlayOpacity: bgConfig.overlayOpacity,
    overlayColor: bgConfig.overlayColor
  });

  // 应用背景图片（如果有）
  // 注意：URL中可能有空格，必须加引号
  if (bgConfig.imageUrl) {
    chatContent.style.setProperty('--chat-bg-image', `url("${bgConfig.imageUrl}")`);
  }

  // 应用遮罩配置
  chatContent.style.setProperty('--chat-bg-overlay-color', bgConfig.overlayColor);
  chatContent.style.setProperty('--chat-bg-overlay-opacity', bgConfig.overlayOpacity);
}

/**
 * 保存输入框草稿（使用localStorage，参考SillyTavern官方实现）
 * 
 * @description
 * 参考官方 RossAscends-mods.js 中的 saveUserInput 实现
 * 使用 localStorage 存储，刷新页面后仍能恢复
 * 
 * @param {string} contactId - 联系人ID
 * @param {string} text - 输入框文本
 */
function saveDraft(contactId, text) {
  const key = `phone_draft_${contactId}`;
  if (text && text.trim()) {
    localStorage.setItem(key, text);
    logger.debug('[ChatView] 保存草稿:', contactId, text.substring(0, 20));
  } else {
    // 如果为空，删除草稿
    localStorage.removeItem(key);
  }
}

/**
 * 清空输入框草稿
 * 
 * @param {string} contactId - 联系人ID
 */
function clearDraft(contactId) {
  const key = `phone_draft_${contactId}`;
  localStorage.removeItem(key);
  logger.debug('[ChatView] 清空草稿:', contactId);
}

/**
 * 恢复输入框草稿
 * 
 * @description
 * 页面加载时调用，从localStorage恢复上次未发送的文字
 * 
 * @param {HTMLElement} page - 聊天页面元素
 * @param {string} contactId - 联系人ID
 */
function restoreDraft(page, contactId) {
  const key = `phone_draft_${contactId}`;
  const draft = localStorage.getItem(key);

  if (draft) {
    const inputField = /** @type {HTMLTextAreaElement} */ (page.querySelector('.chat-input-field'));
    if (inputField) {
      inputField.value = draft;
      // 触发input事件，更新按钮状态和高度
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
      logger.debug('[ChatView] 恢复草稿:', contactId, draft.substring(0, 20));
    }
  }
}

/**
 * 处理发送收藏
 * 
 * @async
 * @param {HTMLElement} page - 聊天页面元素
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 弹出收藏选择器，选择后将收藏内容作为新消息发送
 * 支持文本、表情包、图片、转账、引用等类型
 */
async function handleSendFavorite(page, contactId) {
  logger.info('[ChatView] 打开收藏选择器');

  // 显示收藏选择器
  const { showFavoritesPicker } = await import('../favorites/favorites-picker-ui.js');
  const favorite = await showFavoritesPicker();

  if (!favorite) {
    logger.debug('[ChatView] 用户取消选择收藏');
    return;
  }

  // 动态导入必要的函数
  const { loadChatHistory, saveChatHistory } = await import('./message-chat-data.js');
  const { generateMessageId } = await import('../utils/message-actions-helper.js');
  const { updateContactItem } = await import('./message-list-ui.js');
  const { renderTextMessage } = await import('./message-types/text-message.js');
  const { renderEmojiMessage } = await import('./message-types/emoji-message.js');
  const { renderImageMessage } = await import('./message-types/image-message.js');
  const { renderQuoteMessage } = await import('./message-types/quote-message.js');
  const { renderTransferMessage } = await import('./message-types/transfer-message.js');

  // 根据收藏类型创建对应的消息对象
  const message = {
    id: generateMessageId(),
    sender: 'user',
    type: favorite.type,
    time: Math.floor(Date.now() / 1000), // 使用秒级时间戳（与其他消息保持一致）
    content: favorite.content,
    fromFavorite: true, // 标记来自收藏
    favoriteOriginalTime: favorite.originalTimestamp, // 原消息时间戳
    favoriteOriginalSender: favorite.contactName // 原消息发送者
  };

  // 根据消息类型添加额外字段
  if (favorite.type === 'emoji') {
    message.emojiName = favorite.emojiName;
    message.content = favorite.content; // 表情包ID
  } else if (favorite.type === 'image') {
    message.description = favorite.description || '';
    message.imageUrl = favorite.imageUrl;
    message.content = favorite.imageUrl
      ? `${favorite.description}|${favorite.imageUrl}`
      : favorite.description; // 保持与发送图片的格式一致
  } else if (favorite.type === 'transfer') {
    message.amount = favorite.amount || 0;
    message.message = favorite.message || '';
    message.content = favorite.message || ''; // 转账的content是留言
  } else if (favorite.type === 'quote') {
    message.quotedMessage = favorite.quotedMessage;
    message.replyContent = favorite.replyContent || '';
    message.content = favorite.replyContent; // 引用的content是回复内容
  } else {
    // 文本类型
    message.content = favorite.content || '';
  }

  // 保存到聊天记录
  const chatHistory = await loadChatHistory(contactId);
  chatHistory.push(message);
  await saveChatHistory(contactId, chatHistory);

  // 渲染新消息
  const chatContent = /** @type {HTMLElement} */ (page.querySelector('.chat-content'));
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  if (contact && chatContent) {
    const { getPhoneSystem } = await import('../phone-system.js');
    const phoneAPI = getPhoneSystem().api;

    // 使用renderSingleBubble渲染消息
    const msgElement = renderSingleBubble(message, contact, contactId, phoneAPI, {
      renderTextMessage,
      renderEmojiMessage,
      renderImageMessage,
      renderQuoteMessage,
      renderTransferMessage
    });
    chatContent.appendChild(msgElement);

    // 滚动到底部
    scrollToBottom(chatContent);

    // 更新联系人列表（最新消息和时间）
    await updateContactItem(contactId);

    logger.info('[ChatView] 已发送收藏内容，类型:', favorite.type);
  }
}

/**
 * 处理创建约定计划
 * @param {string} contactId - 联系人ID
 */
async function handleCreatePlan(contactId) {
  logger.info('[ChatView] 创建约定计划，联系人:', contactId);

  const { createNewPlan } = await import('../plans/plan-executor.js');
  await createNewPlan(contactId);

  // 触发聊天刷新（如果计划已发送）
  window.dispatchEvent(new CustomEvent('phone-chat-updated', {
    detail: { contactId }
  }));
}

/**
 * 处理发送戳一戳
 * @param {string} contactId - 联系人ID
 */
async function handleSendPoke(contactId) {
  logger.info('[ChatView] 发送戳一戳，联系人:', contactId);

  // 动态导入
  const { saveChatMessage } = await import('./message-chat-data.js');
  const { loadContacts } = await import('../contacts/contact-list-data.js');
  const { generateMessageId } = await import('../utils/message-actions-helper.js');
  const { addPendingMessage } = await import('../ai-integration/pending-operations.js');

  // 获取联系人对象
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  // 创建戳一戳消息对象
  const message = {
    id: generateMessageId(),
    type: 'poke',
    sender: 'user',
    time: Math.floor(Date.now() / 1000)
  };

  // 保存到数据库
  await saveChatMessage(contactId, message);

  // 暂存到队列（等待纸飞机发送）
  addPendingMessage(contactId, '[戳一戳]', message.time);

  // 渲染到聊天界面
  const page = document.querySelector(`#page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
  if (page && contact) {
    await appendMessageToChat(page, message, contact, contactId);
    logger.info('[ChatView] 戳一戳已发送并渲染');
  } else {
    logger.warn('[ChatView] 找不到聊天页面或联系人，戳一戳已保存但未渲染');
  }
}
