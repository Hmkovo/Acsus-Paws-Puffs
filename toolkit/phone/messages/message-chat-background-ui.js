/**
 * 聊天背景设置页面
 * @module phone/messages/message-chat-background-ui
 */

import logger from '../../../logger.js';
import { loadContacts, saveContact } from '../contacts/contact-list-data.js';
import { getSystemBackgrounds } from '../utils/background-picker.js';
import { showSuccessToast } from '../ui-components/toast-notification.js';

/**
 * 渲染聊天背景设置页面
 * 
 * @description
 * 显示背景选择器 + 遮罩透明度滑块 + 遮罩颜色选择器
 * 实时预览效果，切回聊天页立即生效
 * 
 * @async
 * @param {Object} params - 参数对象
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 背景设置页内容片段
 */
export async function renderChatBackgroundSettings(params) {
  const { contactId } = params;
  logger.debug('phone','[ChatBackground] 渲染聊天背景设置页:', contactId);

  try {
    // 加载联系人数据
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('phone','[ChatBackground] 未找到联系人:', contactId);
      return createErrorView();
    }

    // 加载系统背景列表
    const backgrounds = await getSystemBackgrounds();
    logger.info('phone','[ChatBackground] 获取到系统背景:', backgrounds.length, '个');

    const fragment = document.createDocumentFragment();

    // 创建完整页面容器
    const container = document.createElement('div');
    container.className = 'chat-bg-settings-page';

    // 1. 顶部栏（固定）
    container.appendChild(createTopBar());

    // 2. 固定区域（遮罩设置）
    container.appendChild(createFixedControls(contact));

    // 3. 可滚动区域（背景网格）
    container.appendChild(createScrollableContent(backgrounds, contact));

    // 4. 固定底部按钮
    container.appendChild(createBottomButton(contact));

    fragment.appendChild(container);

    // 绑定事件（延迟执行，确保DOM已挂载）
    setTimeout(() => {
      bindEvents(container, contact, backgrounds);
    }, 100);

    logger.info('phone','[ChatBackground] 聊天背景设置页渲染完成');
    return fragment;
  } catch (error) {
    logger.error('phone','[ChatBackground] 渲染聊天背景设置页失败:', error);
    return createErrorView();
  }
}

/**
 * 创建顶部栏
 * @returns {HTMLElement} 顶部栏容器
 */
function createTopBar() {
  const topBar = document.createElement('div');
  topBar.className = 'chat-bg-settings-topbar';

  topBar.innerHTML = `
        <button class="chat-bg-settings-back-btn">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="chat-bg-settings-title">聊天背景设置</div>
    `;

  return topBar;
}

/**
 * 创建固定控制区（遮罩设置）
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 固定控制区容器
 */
function createFixedControls(contact) {
  const controls = document.createElement('div');
  controls.className = 'chat-bg-settings-controls';

  // 读取当前设置（如果没有则使用默认值）
  const bgConfig = contact.chatBackground || {
    imageUrl: '',
    overlayOpacity: 0,
    overlayColor: '#000000'
  };

  const opacityPercent = Math.round(bgConfig.overlayOpacity * 100);

  controls.innerHTML = `
        <!-- 遮罩透明度滑块 -->
        <div class="chat-bg-control-item">
            <label class="chat-bg-control-label">遮罩透明度</label>
            <div class="chat-bg-slider-container">
                <input type="range" 
                       class="chat-bg-slider" 
                       min="0" 
                       max="100" 
                       value="${opacityPercent}" 
                       data-key="overlayOpacity">
                <span class="chat-bg-slider-value">${opacityPercent}%</span>
            </div>
        </div>

        <!-- 遮罩颜色选择器 -->
        <div class="chat-bg-control-item">
            <label class="chat-bg-control-label">遮罩颜色</label>
            <div class="chat-bg-color-container">
                <input type="color" 
                       class="chat-bg-color-picker" 
                       value="${bgConfig.overlayColor}" 
                       data-key="overlayColor">
                <input type="text" 
                       class="chat-bg-color-input" 
                       value="${bgConfig.overlayColor.toUpperCase()}" 
                       maxlength="7" 
                       placeholder="#000000"
                       data-key="overlayColorInput">
            </div>
        </div>
    `;

  return controls;
}

/**
 * 创建可滚动内容区（背景网格）
 * @param {Array<string>} backgrounds - 背景文件名数组
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 可滚动内容容器
 */
function createScrollableContent(backgrounds, contact) {
  const content = document.createElement('div');
  content.className = 'chat-bg-settings-content';

  const bgConfig = contact.chatBackground || { imageUrl: '' };
  const currentBg = bgConfig.imageUrl;

  // 背景网格
  const grid = document.createElement('div');
  grid.className = 'chat-bg-grid';

  backgrounds.forEach(bg => {
    const url = `/backgrounds/${bg}`;
    const title = bg.slice(0, bg.lastIndexOf('.'));
    const isSelected = currentBg === url;

    const item = document.createElement('div');
    item.className = `chat-bg-grid-item ${isSelected ? 'selected' : ''}`;
    item.dataset.bgUrl = url;
    item.dataset.bgName = bg;

    item.innerHTML = `
            <img src="${url}" alt="${title}" loading="lazy">
            <div class="chat-bg-item-title">${title}</div>
            ${isSelected ? '<div class="chat-bg-item-check"><i class="fa-solid fa-check"></i></div>' : ''}
        `;

    grid.appendChild(item);
  });

  content.appendChild(grid);

  return content;
}

/**
 * 创建固定底部按钮
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement} 底部按钮容器
 */
function createBottomButton(contact) {
  const bottom = document.createElement('div');
  bottom.className = 'chat-bg-settings-bottom';

  bottom.innerHTML = `
        <button class="chat-bg-reset-btn">恢复默认背景</button>
    `;

  return bottom;
}

/**
 * 绑定所有事件
 * @param {HTMLElement} container - 页面容器
 * @param {Object} contact - 联系人对象
 * @param {Array<string>} backgrounds - 背景列表
 */
function bindEvents(container, contact, backgrounds) {
  // 返回按钮
  const backBtn = container.querySelector('.chat-bg-settings-back-btn');
  backBtn.addEventListener('click', () => {
    handleBack();
  });

  // 遮罩透明度滑块
  const opacitySlider = container.querySelector('[data-key="overlayOpacity"]');
  const opacityValue = container.querySelector('.chat-bg-slider-value');
  opacitySlider.addEventListener('input', (e) => {
    const percent = parseInt(e.target.value);
    opacityValue.textContent = `${percent}%`;
    handleOverlayOpacityChange(contact, percent / 100);
  });

  // 遮罩颜色选择器
  const colorPicker = container.querySelector('[data-key="overlayColor"]');
  const colorInput = container.querySelector('.chat-bg-color-input');

  // 颜色选择器变化 → 同步到输入框
  colorPicker.addEventListener('input', (e) => {
    const color = e.target.value;
    colorInput.value = color.toUpperCase();
    handleOverlayColorChange(contact, color);
  });

  // RGB输入框输入 → 实时验证并同步到选择器
  colorInput.addEventListener('input', (e) => {
    const value = e.target.value.trim().toUpperCase();

    // 验证格式：#RRGGBB（完整7字符）
    if (/^#[0-9A-F]{6}$/.test(value)) {
      colorPicker.value = value;
      handleOverlayColorChange(contact, value);
    }
  });

  // 输入框失焦 → 如果不合法则恢复到picker的值
  colorInput.addEventListener('blur', () => {
    const value = colorInput.value.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(value)) {
      colorInput.value = colorPicker.value.toUpperCase();
    }
  });

  // 背景网格项点击
  const gridItems = container.querySelectorAll('.chat-bg-grid-item');
  gridItems.forEach(item => {
    item.addEventListener('click', () => {
      const bgUrl = item.dataset.bgUrl;
      const bgName = item.dataset.bgName;
      handleBackgroundSelect(contact, bgUrl, bgName, gridItems);
    });
  });

  // 恢复默认按钮
  const resetBtn = container.querySelector('.chat-bg-reset-btn');
  resetBtn.addEventListener('click', () => {
    handleResetBackground(contact, container);
  });
}

/**
 * 处理返回
 */
function handleBack() {
  logger.debug('phone','[ChatBackground] 返回上一页');
  const overlay = document.querySelector('.phone-overlay');
  const pageName = 'chat-background-settings';
  import('../phone-main-ui.js').then(({ hidePage }) => {
    hidePage(/** @type {HTMLElement} */(overlay), pageName);
  });
}

/**
 * 处理遮罩透明度改变
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {number} opacity - 透明度（0-1）
 */
async function handleOverlayOpacityChange(contact, opacity) {
  logger.debug('phone','[ChatBackground] 遮罩透明度改变:', opacity);

  // 初始化配置对象（如果不存在）
  if (!contact.chatBackground) {
    contact.chatBackground = {
      imageUrl: '',
      overlayOpacity: 0,
      overlayColor: '#000000'
    };
  }

  // 更新透明度
  contact.chatBackground.overlayOpacity = opacity;

  // 保存到数据库
  await saveContact(contact);

  // 实时应用到聊天页（无卡顿）
  applyChatBackground(contact.id, contact.chatBackground);
}

/**
 * 处理遮罩颜色改变
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {string} color - 颜色（十六进制）
 */
async function handleOverlayColorChange(contact, color) {
  logger.debug('phone','[ChatBackground] 遮罩颜色改变:', color);

  // 初始化配置对象（如果不存在）
  if (!contact.chatBackground) {
    contact.chatBackground = {
      imageUrl: '',
      overlayOpacity: 0,
      overlayColor: '#000000'
    };
  }

  // 更新颜色
  contact.chatBackground.overlayColor = color;

  // 保存到数据库
  await saveContact(contact);

  // 实时应用到聊天页
  applyChatBackground(contact.id, contact.chatBackground);
}

/**
 * 处理背景图片选择
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {string} bgUrl - 背景图片URL
 * @param {string} bgName - 背景图片文件名
 * @param {NodeListOf<Element>} gridItems - 所有网格项
 */
async function handleBackgroundSelect(contact, bgUrl, bgName, gridItems) {
  logger.info('phone','[ChatBackground] 选择背景:', bgName);

  // 预加载图片（学习酒馆）
  await preloadImage(bgUrl);

  // 初始化配置对象（如果不存在）
  if (!contact.chatBackground) {
    contact.chatBackground = {
      imageUrl: '',
      overlayOpacity: 0,
      overlayColor: '#000000'
    };
  }

  // 更新背景URL
  contact.chatBackground.imageUrl = bgUrl;

  // 保存到数据库
  await saveContact(contact);

  // 实时应用到聊天页
  applyChatBackground(contact.id, contact.chatBackground);

  // 更新选中状态（局部更新UI）
  gridItems.forEach(item => {
    const isSelected = item.dataset.bgUrl === bgUrl;
    item.classList.toggle('selected', isSelected);

    // 更新勾选图标
    const existingCheck = item.querySelector('.chat-bg-item-check');
    if (isSelected && !existingCheck) {
      const check = document.createElement('div');
      check.className = 'chat-bg-item-check';
      check.innerHTML = '<i class="fa-solid fa-check"></i>';
      item.appendChild(check);
    } else if (!isSelected && existingCheck) {
      existingCheck.remove();
    }
  });

  showSuccessToast('背景已设置');
}

/**
 * 处理恢复默认背景
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {HTMLElement} container - 页面容器
 */
async function handleResetBackground(contact, container) {
  logger.info('phone','[ChatBackground] 恢复默认背景');

  // 重置为默认配置（无背景 + 无遮罩）
  contact.chatBackground = {
    imageUrl: '',
    overlayOpacity: 0,
    overlayColor: '#000000'
  };

  // 保存到数据库
  await saveContact(contact);

  // 实时应用到聊天页
  applyChatBackground(contact.id, contact.chatBackground);

  // 重置UI（滑块 + 颜色选择器 + 网格选中状态）
  const opacitySlider = container.querySelector('[data-key="overlayOpacity"]');
  const opacityValue = container.querySelector('.chat-bg-slider-value');
  const colorPicker = container.querySelector('[data-key="overlayColor"]');
  const colorInput = container.querySelector('.chat-bg-color-input');
  const gridItems = container.querySelectorAll('.chat-bg-grid-item');

  opacitySlider.value = 0;
  opacityValue.textContent = '0%';
  colorPicker.value = '#000000';
  colorInput.value = '#000000';

  gridItems.forEach(item => {
    item.classList.remove('selected');
    const check = item.querySelector('.chat-bg-item-check');
    if (check) check.remove();
  });

  showSuccessToast('已恢复默认背景');
}

/**
 * 实时应用聊天背景（修改CSS变量，无卡顿）
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} bgConfig - 背景配置对象
 * @param {string} bgConfig.imageUrl - 背景图片URL（空字符串=无背景）
 * @param {number} bgConfig.overlayOpacity - 遮罩透明度（0-1）
 * @param {string} bgConfig.overlayColor - 遮罩颜色（十六进制）
 */
function applyChatBackground(contactId, bgConfig) {
  // 查找聊天页的 .chat-content 元素
  const sanitizedId = contactId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const chatContent = document.querySelector(`#page-chat-${sanitizedId} .chat-content`);

  if (!chatContent) {
    logger.debug('phone','[ChatBackground] 聊天页未打开，跳过应用背景');
    return;
  }

  // 直接修改 CSS 变量（最快，无卡顿）
  // 注意：URL中可能有空格，必须加引号
  if (bgConfig.imageUrl) {
    chatContent.style.setProperty('--chat-bg-image', `url("${bgConfig.imageUrl}")`);
  } else {
    chatContent.style.removeProperty('--chat-bg-image');
  }

  chatContent.style.setProperty('--chat-bg-overlay-color', bgConfig.overlayColor);
  chatContent.style.setProperty('--chat-bg-overlay-opacity', bgConfig.overlayOpacity);

  logger.debug('phone','[ChatBackground] 背景已应用到聊天页');
}

/**
 * 预加载图片（学习酒馆）
 * 
 * @async
 * @param {string} url - 图片URL
 * @returns {Promise<string>} 图片URL
 */
function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      logger.debug('phone','[ChatBackground] 图片预加载成功:', url);
      resolve(url);
    };
    img.onerror = () => {
      logger.warn('phone','[ChatBackground] 图片预加载失败:', url);
      resolve(url); // 失败也继续
    };
    img.src = url;
  });
}

/**
 * 创建错误视图
 * @returns {DocumentFragment} 错误视图片段
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'chat-bg-settings-error';
  error.textContent = '加载失败';
  fragment.appendChild(error);
  return fragment;
}

