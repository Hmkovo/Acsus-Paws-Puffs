/**
 * Acsus-Paws-Puffs 扩展 - 主入口文件
 *
 * 这个文件是扩展的"总管"，负责：
 * 1. 导入官方API
 * 2. 导入各个功能模块
 * 3. 初始化扩展
 * 4. 创建设置面板
 */

// ========================================
// 第一步：导入SillyTavern官方API
// ========================================

// 从extensions.js导入扩展相关API
import {
  extension_settings      // 所有扩展的设置存储对象（大家共用的）
} from "../../../extensions.js";

// 从script.js导入事件系统和保存函数
import {
  eventSource,             // 事件发射器（用来监听ST的各种事件）
  event_types,             // 事件类型常量（比如：角色切换、聊天加载等）
  saveSettingsDebounced    // 保存设置的函数（注意：在script.js中，不是extensions.js）
} from "../../../../script.js";

// 从popup.js导入弹窗API
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";


// ========================================
// 第二步：导入我们自己的功能模块
// ========================================

// 导入日志模块
import logger from "./logger.js";

// 导入功能模块
import { FontManager } from "./font-manager.js";
import { PresetManagerModule } from "./preset-manager.js";
import { VisualEditor } from "./visual-editor/visual-editor.js";
import { SimulatedLifeModule } from "./simulated-life/simulated-life.js";
import { initDiarySystem } from "./toolkit/diary/diary.js";
import { initPhone, openPhoneUI, closePhoneUI, enablePhone, disablePhone } from "./toolkit/phone/index.js";
// 聊天记录模块暂时禁用，开发中
// import {
//   initChatArchive,
//   getChatArchiveSystem,
//   enableChatArchive,
//   disableChatArchive
// } from "./chat-archive/index.js";
import {
  initBeautifySystem,
  bindBeautifyToggle,
  updateFloatingBtnSize,
  updateFloatingBtnColor,
  saveFloatingBtnSettings
} from "./beautify/beautify.js";
import { openFloatingBtnImagePopup } from "./beautify/beautify-popup.js";
// 动态变量模块
import { initVariables, renderVariablesUI } from "./variables/index.js";


// ========================================
// 第三步：定义扩展常量和路径
// ========================================

// 扩展ID和路径（重要：必须和文件夹名一致！）
const EXT_ID = "Acsus-Paws-Puffs";
const extensionFolderPath = `scripts/extensions/third-party/${EXT_ID}`;


// ========================================
// 第四步：定义扩展的默认设置
// ========================================

// 这是扩展第一次安装时的默认配置
const defaultSettings = {
  // 全局开关
  enabled: true,                    // 是否启用扩展

  // 字体管理器设置
  fontManager: {
    enabled: true,                  // 是否启用字体功能
    fonts: [],                      // 字体列表（空数组，用户自己添加）
    currentFont: null,              // 当前应用的字体（null表示没有应用）
    tags: [                         // 预定义标签
      '衬线',
      '无衬线',
      '手写体',
      '等宽',
      '装饰性'
    ]
  },

  // 其他模块的设置（暂时为空，后面再加）
  visualEditor: {
    enabled: false
  },
  cssEnhancer: {
    enabled: false
  },
  presetManager: {
    enabled: false
  }
};


// ========================================
// 第四步：创建功能模块实例
// ========================================

let fontManager = null;  // 字体管理器实例
let presetManager = null;  // 预设管理器实例
let visualEditor = null;  // 可视化编辑器实例
let simulatedLife = null;  // 模拟人生模块实例
let diarySystem = null;  // 日记系统实例
let phoneSystem = null;  // 手机系统实例（标记已初始化）
let beautifySystem = null;  // 美化系统实例
let variablesSystem = null;  // 动态变量系统实例
// let chatArchiveSystem = null;  // 聊天记录系统实例（暂时禁用）


// ========================================
// 第五步：初始化函数（扩展启动时运行）
// ========================================

/**
 * 初始化 Acsus-Paws-Puffs 扩展
 *
 * @description
 * 扩展的主入口函数，负责：
 * 1. 检查并初始化设置对象
 * 2. 依次初始化各个功能模块（字体管理、预设管理等）
 * 3. 初始化设置面板UI
 *
 * 采用 try-catch 包裹每个模块的初始化，单个模块失败不影响其他模块
 *
 * @async
 * @throws {Error} 严重错误时抛出，会在控制台和 toastr 中显示
 */
async function initPawsPuffs() {
  try {
    logger.info('[Main] Acsus-Paws-Puffs 开始初始化...');

    // 5.1 检查并初始化设置（使用EXT_ID作为键名）
    if (!extension_settings[EXT_ID]) {
      // 如果是第一次运行，使用默认设置
      logger.info('[Main] 首次运行，使用默认设置');
      extension_settings[EXT_ID] = defaultSettings;
      saveSettingsDebounced();
    } else {
      logger.debug('[Main] 已加载现有设置');
    }

    // 5.2 创建并初始化字体管理器
    try {
      fontManager = new FontManager();
      await fontManager.init();
      logger.debug('[Main] 字体管理器初始化成功');
    } catch (error) {
      logger.error('[Main] 字体管理器初始化失败:', error.message || error);
      // 不阻断，继续初始化其他模块
    }

    // 5.3 创建并初始化预设管理器
    try {
      presetManager = new PresetManagerModule();
      await presetManager.init();
      logger.debug('[Main] 预设管理器初始化成功');
    } catch (error) {
      logger.error('[Main] 预设管理器初始化失败:', error.message || error);
      // 不阻断，继续初始化其他模块
    }

    // 5.4 创建并初始化模拟人生模块
    try {
      simulatedLife = new SimulatedLifeModule();
      await simulatedLife.init();
      logger.debug('[Main] 模拟人生模块初始化成功');
    } catch (error) {
      logger.error('[Main] 模拟人生模块初始化失败:', error.message || error);
      // 不阻断，继续初始化其他模块
    }

    // 5.5 初始化日记系统
    try {
      diarySystem = await initDiarySystem();
      logger.debug('[Main] 日记系统初始化成功');
    } catch (error) {
      logger.error('[Main] 日记系统初始化失败:', error.message || error);
      // 不阻断，继续初始化其他模块
    }

    // 5.6 初始化手机系统
    try {
      phoneSystem = await initPhone();
      logger.debug('[Main] 手机系统初始化成功');
    } catch (error) {
      logger.error('[Main] 手机系统初始化失败:', error.message || error);
      // 不阻断，继续初始化其他模块
    }

    // 5.7 初始化美化系统
    try {
      await initBeautifySystem();
      beautifySystem = true;  // 标记已初始化
      logger.debug('[Main] 美化系统初始化成功');
    } catch (error) {
      logger.error('[Main] 美化系统初始化失败:', error.message || error);
      // 不阻断，继续初始化其他模块
    }

    // 5.8 初始化聊天记录系统（暂时禁用，开发中）
    // try {
    //   chatArchiveSystem = await initChatArchive();
    //   logger.debug('[Main] 聊天记录系统初始化成功');
    // } catch (error) {
    //   logger.error('[Main] 聊天记录系统初始化失败:', error.message || error);
    //   // 不阻断，继续初始化其他模块
    // }

    // 5.9 初始化动态变量系统
    try {
      const result = await initVariables();
      if (result.success) {
        variablesSystem = true;  // 标记已初始化
        logger.debug('[Main] 动态变量系统初始化成功');
      } else {
        logger.warn('[Main] 动态变量系统初始化返回失败:', result.error);
      }
    } catch (error) {
      logger.error('[Main] 动态变量系统初始化失败:', error.message || error);
      // 不阻断，继续初始化其他模块
    }

    // 5.10 初始化设置面板UI
    await initSettingsPanel();

    logger.info('[Main] Acsus-Paws-Puffs 初始化完成！');
  } catch (error) {
    logger.error('[Main] 初始化过程出现严重错误:', error.message || error);
    throw error;
  }
}


// ========================================
// 第六步：初始化设置面板
// ========================================

/**
 * 初始化设置面板
 *
 * @description
 * 负责加载和渲染扩展的设置界面：
 * 1. 等待 ST 的扩展设置容器加载完成
 * 2. 加载 settings.html 并插入到设置容器
 * 3. 绑定设置面板的交互事件
 * 4. 让各个功能模块渲染自己的 UI
 *
 *
 * @async
 * @throws {Error} 加载 settings.html 失败或找不到设置容器时
 */
async function initSettingsPanel() {
  logger.debug('[Main.initSettingsPanel] 开始初始化设置面板');

  try {
    // 1. 等待扩展设置容器加载
    const settingsContainer = await waitForElement("#extensions_settings");
    if (!settingsContainer) {
      logger.error('[Main.initSettingsPanel] 找不到扩展设置容器');
      return;
    }
    logger.debug('[Main.initSettingsPanel] 找到设置容器');

    // 2. 加载settings.html文件（使用动态路径）
    try {
      const response = await fetch(`${extensionFolderPath}/settings.html`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const settingsHtml = await response.text();

      // 3. 把HTML添加到设置容器中
      $(settingsContainer).append(settingsHtml);
      logger.debug('[Main.initSettingsPanel] 设置面板HTML已加载');
    } catch (error) {
      logger.error('[Main.initSettingsPanel] 加载settings.html失败:', error.message);
      throw error;
    }

    // 4. 绑定事件（用户勾选/取消勾选时的处理）
    bindSettingsEvents();

    // 5. 让字体管理器渲染自己的UI
    if (fontManager) {
      try {
        await fontManager.renderUI(document.getElementById('paws-puffs-font-panel'));
        logger.debug('[Main.initSettingsPanel] 字体管理器UI渲染成功');
      } catch (error) {
        logger.error('[Main.initSettingsPanel] 字体管理器UI渲染失败:', error.message);
      }
    }

    // 6. 让预设管理器渲染自己的UI（由 preset-manager.js 内部管理 UI 实例化）
    if (presetManager) {
      try {
        await presetManager.renderUI(document.getElementById('paws-puffs-preset-panel'));
        logger.debug('[Main.initSettingsPanel] 预设管理器UI渲染成功');
      } catch (error) {
        logger.error('[Main.initSettingsPanel] 预设管理器UI渲染失败:', error.message);
      }
    }

    // 6.5 让模拟人生模块渲染自己的UI
    if (simulatedLife) {
      try {
        await simulatedLife.renderUI(document.getElementById('paws-puffs-simulated-life-panel'));
        logger.debug('[Main.initSettingsPanel] 模拟人生模块UI渲染成功');
      } catch (error) {
        logger.error('[Main.initSettingsPanel] 模拟人生模块UI渲染失败:', error.message);
      }
    }

    // 7. 初始化可视化编辑器（参考字体管理的架构）
    try {
      visualEditor = new VisualEditor();
      await visualEditor.init();
      await visualEditor.renderUI(document.getElementById('paws-puffs-visual-editor-panel'));
      logger.debug('[Main.initSettingsPanel] 可视化编辑器UI渲染成功');
    } catch (error) {
      logger.error('[Main.initSettingsPanel] 可视化编辑器UI渲染失败:', error.message);
    }

    // 8. 渲染动态变量系统UI
    if (variablesSystem) {
      try {
        const variablesPanel = document.getElementById('paws-puffs-variables-panel');
        if (variablesPanel) {
          renderVariablesUI(variablesPanel);
          logger.debug('[Main.initSettingsPanel] 动态变量系统UI渲染成功');
        } else {
          logger.warn('[Main.initSettingsPanel] 找不到变量面板容器 #paws-puffs-variables-panel');
        }
      } catch (error) {
        logger.error('[Main.initSettingsPanel] 动态变量系统UI渲染失败:', error.message);
      }
    }

    logger.info('[Main.initSettingsPanel] 设置面板初始化完成');
  } catch (error) {
    logger.error('[Main.initSettingsPanel] 初始化设置面板失败:', error.message || error);
    throw error;
  }
}

/**
 * 等待 DOM 元素出现
 *
 * @description
 * 辅助函数，用于等待某个 DOM 元素加载完成
 * 如果元素已存在则立即返回，否则每 100ms 检查一次
 * 超时后会 reject Promise
 *
 * @param {string} selector - CSS 选择器
 * @param {number} [timeout=10000] - 超时时间（毫秒），默认 10 秒
 * @returns {Promise<HTMLElement>} 找到的 DOM 元素
 * @throws {Error} 超时未找到元素时
 *
 * @example
 * const container = await waitForElement("#extensions_settings");
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // 先检查元素是否已经存在
    const element = /** @type {HTMLElement} */ (document.querySelector(selector));
    if (element) {
      logger.debug('[Main.waitForElement] 元素已存在:', selector);
      resolve(element);
      return;
    }

    // 如果不存在，等待它出现
    logger.debug('[Main.waitForElement] 等待元素出现:', selector);
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      const element = /** @type {HTMLElement} */ (document.querySelector(selector));
      if (element) {
        clearInterval(checkInterval);
        const elapsed = Date.now() - startTime;
        logger.debug(`[Main.waitForElement] 元素已出现 (${elapsed}ms):`, selector);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        logger.warn('[Main.waitForElement] 等待元素超时:', selector);
        reject(new Error(`等待元素 ${selector} 超时`));
      }
    }, 100);
  });
}


// ========================================
// 第七步：绑定设置面板的事件
// ========================================

/**
 * 绑定设置面板的交互事件
 *
 * @description
 * 统一入口，调用各个子函数绑定具体事件：
 * - 标签页切换
 * - 关于页面手风琴
 * - 使用条款弹窗
 * - 工具包卡片点击
 * - 标签页可见性设置
 */
function bindSettingsEvents() {
  // 绑定标签页切换
  bindTabSwitching();

  // 绑定关于页面手风琴
  bindAboutAccordion();

  // 绑定美化页面手风琴
  bindBeautifyAccordion();

  // 绑定使用条款弹窗
  bindTermsPopup();

  // 绑定美化说明弹窗
  bindBeautifyInfoPopup();

  // 绑定背景图标签管理说明弹窗
  bindBgTagInfoPopup();

  // 绑定日记功能开关
  bindDiarySettings();

  // 绑定手机功能
  bindPhoneSettings();

  // 绑定聊天记录功能（暂时禁用，开发中）
  // bindChatArchiveSettings();

  // 绑定美化功能开关
  bindBeautifyToggle();

  // 绑定悬浮按钮设置
  bindFloatingBtnSettings();

  // 绑定工具包卡片点击事件
  bindToolboxCards();

  // 绑定标签页可见性设置
  bindTabVisibility();

  // 注意：字体功能开关现在由 font-manager-ui.js 处理，不需要在这里绑定了
  // 注意：可视化编辑器现在由 visual-editor-ui.js 处理，不需要在这里绑定了
}

/**
 * 绑定标签页切换逻辑
 *
 * @description
 * 监听所有 .paws-tab 元素的点击事件，实现标签页切换：
 * 1. 移除所有标签和内容的 active 类
 * 2. 给点击的标签和对应内容添加 active 类
 *
 * 使用 data-tab 属性关联标签和内容
 */
function bindTabSwitching() {
  const tabs = document.querySelectorAll('.paws-tab');
  const contents = document.querySelectorAll('.paws-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // 移除所有active
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // 添加当前active
      tab.classList.add('active');
      const targetTab = tab.getAttribute('data-tab');
      document.getElementById(`tab-${targetTab}`).classList.add('active');
    });
  });
}

/**
 * 绑定关于页面的手风琴切换逻辑
 *
 * @description
 * 监听所有 .about-accordion-header 元素的点击事件，实现手风琴效果：
 * 1. 移除所有卡片的 active 类
 * 2. 给点击的卡片添加 active 类
 *
 * 使用 data-card 属性关联标题和卡片
 */
function bindAboutAccordion() {
  const aboutHeaders = document.querySelectorAll('.about-accordion-header');

  aboutHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const clickedCard = /** @type {HTMLElement} */ (header).dataset.card;
      const allCards = document.querySelectorAll('.about-accordion-card');

      // 切换所有卡片的active状态
      allCards.forEach(card => {
        if (/** @type {HTMLElement} */ (card).dataset.card === clickedCard) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    });
  });
}

/**
 * 绑定美化页面的手风琴切换逻辑
 *
 * @description
 * 监听所有 .beautify-accordion-header 元素的点击事件，实现手风琴效果
 */
function bindBeautifyAccordion() {
  const beautifyHeaders = document.querySelectorAll('.beautify-accordion-header');

  beautifyHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const clickedCard = /** @type {HTMLElement} */ (header).dataset.card;
      const allCards = document.querySelectorAll('.beautify-accordion-card');

      // 切换所有卡片的active状态
      allCards.forEach(card => {
        if (/** @type {HTMLElement} */ (card).dataset.card === clickedCard) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    });
  });
}

/**
 * 绑定悬浮按钮设置事件
 *
 * @description
 * 绑定悬浮按钮的外观设置控件：
 * - 大小滑块：调整按钮尺寸
 * - 颜色选择器：调整图标颜色
 * - 设置图片按钮：打开图片选择弹窗
 */
function bindFloatingBtnSettings() {
  // 获取设置
  const settings = extension_settings.pawsPuffs?.beautify?.floatingBtn || {
    size: 38,
    color: '',
    imageUrl: '',
    imageOpacity: 1.0
  };

  // 大小滑块
  const sizeSlider = document.getElementById('floating-btn-size');
  const sizeValue = document.getElementById('floating-btn-size-value');
  if (sizeSlider && sizeValue) {
        // 初始化值
        /** @type {HTMLInputElement} */ (sizeSlider).value = String(settings.size);
    sizeValue.textContent = `${settings.size}px`;

    sizeSlider.addEventListener('input', function () {
      const size = parseInt(/** @type {HTMLInputElement} */(this).value);
      sizeValue.textContent = `${size}px`;
      updateFloatingBtnSize(size);
      saveFloatingBtnSettings({ size });
    });
  }

  // 颜色选择器（使用官方 toolcool-color-picker）
  const colorPicker = document.getElementById('floating-btn-color');
  if (colorPicker) {
    // 初始化值（如果有保存的颜色）
    if (settings.color) {
      colorPicker.setAttribute('color', settings.color);
    }

    // 监听 change 事件获取 RGBA 颜色
    colorPicker.addEventListener('change', function (e) {
      const color = e.detail?.rgba || '';
      updateFloatingBtnColor(color);
      saveFloatingBtnSettings({ color });
    });
  }

  // 重置颜色按钮
  const resetColorBtn = document.getElementById('floating-btn-reset-color');
  if (resetColorBtn && colorPicker) {
    resetColorBtn.addEventListener('click', function () {
      // 重置为默认白色
      colorPicker.setAttribute('color', 'rgba(255, 255, 255, 1)');
      updateFloatingBtnColor('');
      saveFloatingBtnSettings({ color: '' });
      logger.info('[FloatingBtn] 颜色已重置为主题色');
    });
  }

  // 图片预览区初始化
  updateFloatingBtnImagePreview(settings.imageUrl);

  // 设置图片按钮
  const setImageBtn = document.getElementById('floating-btn-set-image');
  if (setImageBtn) {
    setImageBtn.addEventListener('click', function () {
      openFloatingBtnImagePopup();
    });
  }



  logger.debug('[FloatingBtn] 设置事件已绑定');
}

/**
 * 更新悬浮按钮图片预览
 * @param {string} imageUrl - 图片 URL
 */
function updateFloatingBtnImagePreview(imageUrl) {
  const preview = document.getElementById('floating-btn-image-preview');
  if (!preview) return;

  if (imageUrl) {
    preview.innerHTML = `<img src="${imageUrl}" alt="预览">`;
  } else {
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
  }
}









/**
 * 绑定美化说明弹窗按钮的点击事件
 *
 * @description
 * 显示美化功能的说明和注意事项
 */
function bindBeautifyInfoPopup() {
  const infoBtn = document.getElementById('beautify-info-popup-btn');

  if (infoBtn) {
    infoBtn.addEventListener('click', async () => {
      logger.debug('[bindBeautifyInfoPopup] 用户点击查看美化说明');

      try {
        const infoContent = `
                    <div style="max-height: 400px; overflow-y: auto; line-height: 1.6; font-size: 0.9em;">
                        <h3 style="color: var(--SmartThemeQuoteColor); margin-top: 0;">
                            <i class="fa-solid fa-cat" style="margin-right: 8px;"></i>猫玩具说明
                        </h3>

                        <p><strong>这是什么？</strong></p>
                        <p>作者最近测试时总是使用默认美化主题，突然心血来潮想搞点花样，于是就有了这个美化功能。</p>

                        <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">

                        <p><strong>注意事项</strong></p>
                        <ul style="padding-left: 20px; margin: 10px 0;">
                            <li>不确保适配所有美化主题</li>
                            <li>可能会有各种不兼容问题</li>
                            <li>如果出现显示异常，请尝试关闭相关功能</li>
                        </ul>

                        <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">

                        <p><strong>功能简介</strong></p>
                        <ul style="padding-left: 20px; margin: 10px 0;">
                            <li><strong>头像布局</strong> - 在聊天区域顶部显示悬浮头像栏，点击头像可打开详细设置</li>
                            <li><strong>全宽文字模式</strong> - 隐藏消息头像，让文字占满整行</li>
                            <li><strong>顶栏隐藏按钮</strong> - 可拖动的悬浮按钮，快速切换沉浸模式</li>
                            <li><strong>其他功能</strong> - 作者过去写美化经常使用的整合，懒得缝了</li>
                        </ul>

                        <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">

                        <p><strong>特别感谢</strong></p>
                        <p style="line-height: 1.6; opacity: 0.9;">
                            <a href="https://discord.com/channels/1134557553011998840/1279510975623598201" target="_blank" style="color: var(--SmartThemeQuoteColor); text-decoration: none;">
                                <i class="fa-solid fa-heart" style="margin-right: 5px; color: #e74c3c;"></i>ℭ𝔬𝔰𝔪𝔦𝔠 𝔏𝔞𝔱𝔱𝔢
                            </a>
                            <br>
                            <span style="font-size: 0.9em; opacity: 0.8;">刚入酒馆时的美化启蒙，永远喜欢！</span>
                        </p>
                    </div>
                `;

        await callGenericPopup(infoContent, POPUP_TYPE.TEXT, '', {
          okButton: '知道了',
          wide: false,
          large: false
        });
      } catch (error) {
        logger.error('[bindBeautifyInfoPopup] 弹窗显示失败:', error);
      }
    });
  }
}

/**
 * 绑定背景图标签管理说明弹窗按钮的点击事件
 *
 * @description
 * 显示背景图标签管理功能的使用说明
 */
function bindBgTagInfoPopup() {
  const infoBtn = document.getElementById('beautify-bg-tag-info-btn');

  if (infoBtn) {
    infoBtn.addEventListener('click', async () => {
      logger.debug('[bindBgTagInfoPopup] 用户点击查看背景图标签管理说明');

      try {
        const infoContent = `
                    <div style="max-height: 400px; overflow-y: auto; line-height: 1.6; font-size: 0.9em;">
                        <h3 style="color: var(--SmartThemeQuoteColor); margin-top: 0;">
                            <i class="fa-solid fa-tags" style="margin-right: 8px;"></i>背景图标签管理
                        </h3>

                        <p><strong>这是什么？</strong></p>
                        <p>在 SIllyTavern 背景图设置中添加自定义标签，分组管理你的背景图并快速筛选切换。</p>

                        <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">

                        <p><strong>使用方法</strong></p>
                        <ul style="padding-left: 20px; margin: 10px 0;">
                            <li>打开背景图抽屉（点击背景图按钮）</li>
                            <li>点击搜索栏右侧的 <i class="fa-solid fa-plus"></i> 按钮</li>
                            <li>创建新标签并选择要归类的背景图</li>
                            <li>创建完成后，点击标签即可筛选显示对应图片</li>
                        </ul>

                        <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0; opacity: 0.3;">

                        <p><strong>注意事项</strong></p>
                        <ul style="padding-left: 20px; margin: 10px 0;">
                            <li>不启用时不会在背景图设置中显示任何内容</li>
                            <li>标签只会整理背景图的显示，不影响原始文件</li>
                            <li>删除标签不会删除对应的背景图</li>
                        </ul>
                    </div>
                `;

        await callGenericPopup(infoContent, POPUP_TYPE.TEXT, '', {
          okButton: '知道了',
          wide: false,
          large: false
        });
      } catch (error) {
        logger.error('[bindBgTagInfoPopup] 弹窗显示失败:', error);
      }
    });
  }
}

/**
 * 绑定使用条款弹窗按钮的点击事件
 *
 * @description
 * 监听条款按钮的点击事件，显示使用条款和免责声明的弹窗
 */
function bindTermsPopup() {
  const termsBtn = document.getElementById('terms-popup-btn');

  if (termsBtn) {
    termsBtn.addEventListener('click', async () => {
      logger.debug('[bindTermsPopup] 用户点击查看使用条款');

      try {
        // 条款内容
        const termsContent = `
          <div style="max-height: 500px; overflow-y: auto; line-height: 1.6; font-size: 0.9em;">
            <h3 style="color: var(--SmartThemeQuoteColor); margin-top: 0;">使用须知 & 免责声明</h3>

            <p><strong>欢迎使用 毛球点心铺 扩展！使用本扩展即表示您同意以下条款：</strong></p>

            <h4 style="color: var(--SmartThemeQuoteColor);">一、禁止内容</h4>
            <p>使用本扩展上传的素材，不得包含以下内容：</p>

            <p><strong>【侵权类】</strong><br>
            • 未经授权的版权作品（图片、音效、字体、音乐、视频等）<br>
            • 未经授权使用的商标、品牌或仿制知名作品</p>

            <p><strong>【违法类】</strong><br>
            • 涉及毒品、武器、恐怖主义等违法违规内容<br>
            • 用于推广引流、诈骗、钓鱼、恶意攻击等行为</p>

            <p><strong>【敏感内容】</strong><br>
            • 涉政、种族歧视、性别歧视、侮辱宗教或群体的内容<br>
            • 涉及血腥暴力、色情、侵犯儿童权益的内容<br>
            • 上传真人照片或未授权的个人肖像</p>

            <p><strong>【恶意行为】</strong><br>
            • 制作、上传恶意代码等可能破坏系统性能的内容<br>
            • 请认真辨别代码的效力，系统崩溃风险自负</p>

            <h4 style="color: var(--SmartThemeQuoteColor);">二、使用限制</h4>
            <p>可视化编辑器生成的内容允许免费分享，但禁止用于任何收费服务或商业用途。<br>
            特别禁止在API代理群、付费酒馆服务等商业化场景中使用。<br>
            包括但不限于：API代理收费、酒馆搭建收费、主题定制收费等商业行为。</p>

            <h4 style="color: var(--SmartThemeQuoteColor);">三、安全风险提示</h4>
            <p>本扩展包含JavaScript代码执行功能，我们无法担保所有代码的安全性。<br>
            建议您确保代码来源可靠，不要运行任何来路不明的代码。<br>
            恶意代码可能造成信息泄露、财产受损等风险，继续使用表示您了解此风险。</p>

            <h4 style="color: var(--SmartThemeQuoteColor);">四、免责声明</h4>
            <p>本扩展仅提供技术工具，用户上传的所有内容与扩展开发者无关。<br>
            开发者不对用户行为或使用后果承担法律责任。<br>
            使用本扩展即视为同意遵守以上规则，违规使用造成的后果由用户自行承担。</p>
          </div>
        `;

        // 显示弹窗
        await callGenericPopup(termsContent, POPUP_TYPE.TEXT, '', {
          okButton: '我已了解',
          cancelButton: '',
          wide: true
        });

      } catch (error) {
        logger.error('[bindTermsPopup] 显示条款弹窗失败:', error);
        // 降级：使用 alert 作为备用方案
        alert('使用条款加载失败，请稍后重试。');
      }
    });
  } else {
    logger.warn('[bindTermsPopup] 未找到条款按钮元素');
  }
}

/**
 * 绑定工具包卡片的点击事件
 *
 * @description
 * 监听所有工具包卡片的点击事件，显示"敬请期待"弹窗
 * 占位卡片（.toolbox-card-placeholder）已通过 CSS 禁用点击
 */
function bindToolboxCards() {
  const toolboxCards = document.querySelectorAll('.toolbox-card:not(.toolbox-card-placeholder):not([data-tool="diary"]):not([data-tool="mobile"]):not([data-tool="chat-archive"])');

  toolboxCards.forEach(card => {
    card.addEventListener('click', async () => {
      const toolName = card.querySelector('.toolbox-card-title').textContent;

      logger.debug(`[bindToolboxCards] 用户点击工具卡片: ${toolName}`);

      try {
        // 弹窗内容
        const modalContent = `
          <div style="padding: 15px; line-height: 1.6;">
            <h3 style="color: var(--SmartThemeQuoteColor); margin: 0 0 12px 0; font-size: 1.1em;">
              ${toolName}
            </h3>
            <div style="background: color-mix(in srgb, var(--SmartThemeQuoteColor) 8%, transparent 92%);
                        padding: 12px;
                        border-radius: 4px;
                        border-left: 2px solid var(--SmartThemeQuoteColor);">
              <p style="margin: 0; font-size: 0.9em;">
                <i class="fa-solid fa-info-circle" style="color: var(--SmartThemeQuoteColor); margin-right: 6px;"></i>
                该模块正在开发中。
              </p>
            </div>
          </div>
        `;

        // 显示弹窗
        await callGenericPopup(modalContent, POPUP_TYPE.TEXT, '', {
          okButton: '确定',
          cancelButton: '',
          wide: false
        });

      } catch (error) {
        logger.error('[bindToolboxCards] 显示工具卡片弹窗失败:', error);
        // 降级：使用 alert 作为备用方案
        alert(`${toolName}\n\n该模块正在开发中。`);
      }
    });
  });

  logger.debug(`[bindToolboxCards] 已绑定 ${toolboxCards.length} 个工具卡片的点击事件`);
}

/**
 * 绑定标签页可见性设置的复选框事件
 *
 * @description
 * 监听"功能模块"手风琴中的标签页显示设置复选框
 * 勾选 = 显示该标签页，取消勾选 = 隐藏该标签页
 * 设置自动保存到 extension_settings
 *
 * 特殊处理：
 * - 初始化时检查默认激活的标签页是否被隐藏，如果是则自动切换到第一个可见标签页
 * - 隐藏当前激活的标签页时，自动切换到下一个可见的标签页
 */
function bindTabVisibility() {
  const checkboxes = document.querySelectorAll('.tab-visibility-item input[type="checkbox"]');

  // 1. 初始化：从设置中恢复标签页状态
  const settings = extension_settings[EXT_ID] || {};
  const hiddenTabs = settings.hiddenTabs || [];

  checkboxes.forEach(checkbox => {
    const tabId = /** @type {HTMLInputElement} */ (checkbox).dataset.tab;

    // 根据保存的设置设置checkbox状态
    if (hiddenTabs.includes(tabId)) {
      /** @type {HTMLInputElement} */ (checkbox).checked = false;
      hideTab(tabId);
    } else {
      /** @type {HTMLInputElement} */ (checkbox).checked = true;
      showTab(tabId);
    }

    // 2. 绑定复选框change事件
    checkbox.addEventListener('change', () => {
      const isChecked = /** @type {HTMLInputElement} */ (checkbox).checked;

      if (isChecked) {
        showTab(tabId);
        removeFromHiddenTabs(tabId);
        logger.debug(`[bindTabVisibility] 显示标签页: ${tabId}`);
      } else {
        hideTab(tabId);
        addToHiddenTabs(tabId);
        logger.debug(`[bindTabVisibility] 隐藏标签页: ${tabId}`);

        // 如果隐藏的是当前激活的标签页，切换到下一个可见的标签页
        const activeTab = document.querySelector('.paws-tab.active');
        if (activeTab && activeTab.getAttribute('data-tab') === tabId) {
          logger.debug(`[bindTabVisibility] 当前激活的标签页被隐藏，切换到下一个可见标签页`);
          switchToFirstVisibleTab();
        }
      }
    });
  });

  // 3. 初始化后检查：如果当前激活的标签页被隐藏了，切换到第一个可见的标签页
  const activeTab = document.querySelector('.paws-tab.active');
  if (activeTab) {
    const activeTabId = activeTab.getAttribute('data-tab');
    if (hiddenTabs.includes(activeTabId)) {
      logger.debug(`[bindTabVisibility] 初始激活的标签页 "${activeTabId}" 已被隐藏，切换到第一个可见标签页`);
      switchToFirstVisibleTab();
    }
  }

  logger.debug(`[bindTabVisibility] 已绑定 ${checkboxes.length} 个标签页可见性复选框`);
}

/**
 * 显示指定的标签页
 * @param {string} tabId - 标签页ID（data-tab属性值）
 */
function showTab(tabId) {
  const tab = /** @type {HTMLElement} */ (document.querySelector(`.paws-tab[data-tab="${tabId}"]`));
  if (tab) {
    tab.style.display = '';
  }
}

/**
 * 隐藏指定的标签页
 * @param {string} tabId - 标签页ID（data-tab属性值）
 */
function hideTab(tabId) {
  const tab = /** @type {HTMLElement} */ (document.querySelector(`.paws-tab[data-tab="${tabId}"]`));
  if (tab) {
    tab.style.display = 'none';
  }
}

/**
 * 将标签页添加到隐藏列表并保存
 * @param {string} tabId - 标签页ID
 */
function addToHiddenTabs(tabId) {
  extension_settings[EXT_ID] = extension_settings[EXT_ID] || {};
  extension_settings[EXT_ID].hiddenTabs = extension_settings[EXT_ID].hiddenTabs || [];

  if (!extension_settings[EXT_ID].hiddenTabs.includes(tabId)) {
    extension_settings[EXT_ID].hiddenTabs.push(tabId);
    saveSettingsDebounced();
  }
}

/**
 * 从隐藏列表中移除标签页并保存
 * @param {string} tabId - 标签页ID
 */
function removeFromHiddenTabs(tabId) {
  extension_settings[EXT_ID] = extension_settings[EXT_ID] || {};
  extension_settings[EXT_ID].hiddenTabs = extension_settings[EXT_ID].hiddenTabs || [];

  const index = extension_settings[EXT_ID].hiddenTabs.indexOf(tabId);
  if (index !== -1) {
    extension_settings[EXT_ID].hiddenTabs.splice(index, 1);
    saveSettingsDebounced();
  }
}

/**
 * 切换到第一个可见的标签页
 *
 * @description
 * 用于在当前激活的标签页被隐藏后，自动切换到下一个可见的标签页
 * 按照标签页在 DOM 中的顺序查找第一个可见（display 不是 'none'）的标签页
 * 如果找到则模拟点击该标签页
 */
function switchToFirstVisibleTab() {
  const allTabs = document.querySelectorAll('.paws-tab');

  for (const tab of allTabs) {
    const tabElement = /** @type {HTMLElement} */ (tab);
    // 检查标签页是否可见（display 不是 'none'）
    if (tabElement.style.display !== 'none') {
      // 模拟点击该标签页
      tabElement.click();
      logger.debug(`[switchToFirstVisibleTab] 已切换到标签页: ${tabElement.getAttribute('data-tab')}`);
      return;
    }
  }

  logger.warn('[switchToFirstVisibleTab] 没有找到可见的标签页');
}

/**
 * 绑定日记功能设置
 *
 * @description
 * 点击日记卡片时弹出官方弹窗，在弹窗内启用/禁用日记功能
 * 使用 extension_settings 和 saveSettingsDebounced() 存储设置
 */
function bindDiarySettings() {
  // 更新卡片状态的辅助函数
  const updateCardStatus = () => {
    const statusEl = document.getElementById('diary-status');
    if (statusEl && diarySystem) {
      statusEl.textContent = diarySystem.enabled ? '已启用' : '已禁用';
      statusEl.style.color = diarySystem.enabled ? 'var(--greenSuccessColor)' : 'var(--redWarningColor)';
    }
  };

  // 初始化卡片状态
  updateCardStatus();

  // 绑定卡片点击事件，弹出官方弹窗
  const diaryCard = document.querySelector('.toolbox-card[data-tool="diary"]');
  if (diaryCard) {
    diaryCard.addEventListener('click', async () => {
      await showDiarySettingsPopup(updateCardStatus);
    });
  }

  logger.debug('[Settings] 日记卡片点击事件已绑定');
}

/**
 * 绑定手机功能设置
 *
 * @description
 * 点击手机卡片时弹出官方弹窗，在弹窗内启用/禁用手机功能
 * 使用 extension_settings 和 saveSettingsDebounced() 存储设置
 */
function bindPhoneSettings() {
  // 更新卡片状态的辅助函数
  const updateCardStatus = () => {
    const statusEl = document.getElementById('phone-status');
    if (statusEl && phoneSystem) {
      statusEl.textContent = phoneSystem.enabled ? '已启用' : '已禁用';
      statusEl.style.color = phoneSystem.enabled ? 'var(--greenSuccessColor)' : 'var(--redWarningColor)';
    }
  };

  // 初始化卡片状态
  updateCardStatus();

  // 绑定卡片点击事件，弹出官方弹窗
  const phoneCard = document.querySelector('.toolbox-card[data-tool="mobile"]');
  if (phoneCard) {
    phoneCard.addEventListener('click', async () => {
      await showPhoneSettingsPopup(updateCardStatus);
    });
  }

  logger.debug('[Settings] 手机卡片点击事件已绑定');
}

/**
 * 显示日记设置弹窗
 *
 * @async
 * @param {Function} updateCardStatus - 更新卡片状态的回调函数
 * @description
 * 使用官方 callGenericPopup 显示日记功能的启用/禁用开关和使用说明
 * 开关状态立即保存，不依赖弹窗的确认/取消按钮
 */
async function showDiarySettingsPopup(updateCardStatus) {
  // 构建弹窗HTML内容
  const html = `
    <div class="diary-intro-popup" style="padding: 10px; max-height: 500px; overflow-y: auto; text-align: left;">
      <!-- 开关 -->
      <div style="margin-bottom: 15px; padding: 10px; background: var(--black30a); border-radius: 8px;">
        <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" id="diary-popup-enabled" ${diarySystem.enabled ? 'checked' : ''} />
          <strong style="margin-left: 10px; font-size: 1.1em;">启用日记功能</strong>
        </label>
      </div>

      <!-- 功能介绍 -->
      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px 0; color: var(--SmartThemeQuoteColor);">
          <i class="fa-solid fa-lightbulb" style="margin-right: 8px;"></i>功能介绍
        </h4>
        <p style="margin: 0; line-height: 1.6; opacity: 0.9;">
          日记系统提供翻页书式的记录体验，支持用户和AI共同书写日记、互相评论。记录内容、记忆、互动，构建专属的故事档案。
        </p>
      </div>

      <!-- 核心功能 -->
      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px 0; color: var(--SmartThemeQuoteColor);">
          <i class="fa-solid fa-star" style="margin-right: 8px;"></i>核心功能
        </h4>
        <ul style="margin: 5px 0; padding-left: 20px; line-height: 1.8; opacity: 0.9;">
          <li><strong>记录日记：</strong>支持文字和图片内容块，自由组合</li>
          <li><strong>AI评论：</strong>AI可以阅读你的日记并留下评论</li>
          <li><strong>互动回复：</strong>支持嵌套回复，类似社交媒体的评论系统</li>
          <li><strong>翻页视觉：</strong>轮播图式翻页，沉浸式阅读体验</li>
          <li><strong>筛选搜索：</strong>按作者、日期、关键词筛选日记</li>
        </ul>
      </div>

      <!-- 快速上手 -->
      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px 0; color: var(--SmartThemeQuoteColor);">
          <i class="fa-solid fa-rocket" style="margin-right: 8px;"></i>快速上手
        </h4>
        <ol style="margin: 5px 0; padding-left: 20px; line-height: 1.8; opacity: 0.9;">
          <li><strong>打开面板：</strong>点击右侧扩展栏的"<i class="fa-solid fa-book"></i> 日记"按钮</li>
          <li><strong>创建日记：</strong>点击"新日记"按钮，填写标题和内容</li>
          <li><strong>添加内容块：</strong>支持多段文字和图片，每个块可以设置时间和标签</li>
          <li><strong>请求评论：</strong>点击"完成日记"按钮，AI会阅读并评论</li>
          <li><strong>翻页阅读：</strong>使用左右箭头按钮切换日记，查看历史记录</li>
        </ol>
      </div>

      <!-- 高级功能 -->
      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px 0; color: var(--SmartThemeQuoteColor);">
          <i class="fa-solid fa-cog" style="margin-right: 8px;"></i>高级功能
        </h4>
        <ul style="margin: 5px 0; padding-left: 20px; line-height: 1.8; opacity: 0.9;">
          <li><strong>上下文预设：</strong>自定义AI生成评论时的提示词</li>
          <li><strong>视觉定制：</strong>调整卡片透明度、主题色、背景图</li>
          <li><strong>自定义API：</strong>支持使用独立的API配置生成评论</li>
          <li><strong>就地编辑：</strong>在轮播图中直接编辑日记，无需弹窗</li>
          <li><strong>隐私模式：</strong>标记私密日记（眼睛图标），不发送给AI</li>
        </ul>
      </div>

      <!-- 提示 -->
      <div style="padding: 10px; background: var(--SmartThemeBlurTintColor); border-left: 3px solid var(--SmartThemeQuoteColor); border-radius: 4px;">
        <i class="fa-solid fa-info-circle" style="color: var(--SmartThemeQuoteColor); margin-right: 8px;"></i>
        <span style="opacity: 0.9;">更多设置（筛选、预设、视觉、API）请在日记面板内的工具栏配置。</span>
      </div>

      <!-- 致谢 -->
      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--SmartThemeBorderColor); opacity: 0.7;">
        <p style="margin: 0; font-size: 0.85em; text-align: center;">
          <i class="fa-solid fa-graduation-cap" style="margin-right: 5px;"></i>(据此二改)日记的轮播效果学习自 B站：<a href="https://www.bilibili.com/video/BV1sD21YbEDT/" target="_blank" style="color: var(--SmartThemeQuoteColor); text-decoration: none;">飞雪前端艺术</a>
        </p>
      </div>
    </div>
  `;

  // 弹出官方弹窗（使用 TEXT 类型，只有关闭按钮）
  callGenericPopup(html, POPUP_TYPE.TEXT, '日记');

  // 等待DOM更新后绑定事件
  await new Promise(resolve => setTimeout(resolve, 100));

  // 绑定弹窗内的复选框事件
  const checkbox = /** @type {HTMLInputElement} */ (document.getElementById('diary-popup-enabled'));
  if (checkbox) {
    checkbox.addEventListener('change', async function () {
      const newState = this.checked;

      // 更新 extension_settings
      extension_settings[EXT_ID].diary.enabled = newState;

      // 立即保存
      saveSettingsDebounced();

      // 启用或禁用功能
      if (newState) {
        await diarySystem.enable();
        toastr.success('日记功能已启用');
        logger.info('[Settings] 日记功能已启用');
      } else {
        diarySystem.disable();
        toastr.info('日记功能已禁用');
        logger.info('[Settings] 日记功能已禁用');
      }

      // 更新卡片状态
      updateCardStatus();
    });
  }
}

/**
 * 显示手机设置弹窗
 *
 * @async
 * @param {Function} updateCardStatus - 更新卡片状态的回调函数
 * @description
 * 使用官方 callGenericPopup 显示手机功能的启用/禁用开关和使用说明
 * 开关状态立即保存，不依赖弹窗的确认/取消按钮
 *
 * 注意：直接从 phoneSystem.enabled 读取状态（和日记一样）
 * 因为手机模块使用的 EXT_ID 是 'acsusPawsPuffs'，与主入口不同
 */
async function showPhoneSettingsPopup(updateCardStatus) {
  // 直接从 phoneSystem 实例读取启用状态（和日记一样的写法）
  const isEnabled = phoneSystem ? phoneSystem.enabled : false;

  // 构建弹窗HTML内容
  const html = `
    <div class="phone-intro-popup" style="padding: 10px; max-height: 500px; overflow-y: auto; text-align: left;">
      <!-- 开关 -->
      <div style="margin-bottom: 15px; padding: 10px; background: var(--black30a); border-radius: 8px;">
        <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" id="phone-popup-enabled" ${isEnabled ? 'checked' : ''} />
          <strong style="margin-left: 10px; font-size: 1.1em;">启用手机功能</strong>
        </label>
      </div>

      <!-- 警告提示 -->
      <div style="padding: 15px; background: rgba(244, 67, 54, 0.1); border-left: 4px solid #f44336; border-radius: 4px;">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <i class="fa-solid fa-exclamation-triangle" style="color: #f44336; font-size: 1.3em; margin-top: 2px;"></i>
          <div>
            <strong style="color: #f44336; font-size: 1.1em;">⚠️ 功能测试中</strong>
            <p style="margin: 8px 0 0 0; line-height: 1.6;">
              未上线，作者在测试，只能纯聊天，不要随便使用内部功能导致问题！<br>
              更新扩展后预设管理处可以点击重置按钮来获取最新预设。<br>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  // 弹出官方弹窗（使用 TEXT 类型，只有关闭按钮）
  callGenericPopup(html, POPUP_TYPE.TEXT, '手机');

  // 等待DOM更新后绑定事件
  await new Promise(resolve => setTimeout(resolve, 100));

  // 绑定弹窗内的复选框事件
  const checkbox = /** @type {HTMLInputElement} */ (document.getElementById('phone-popup-enabled'));
  if (checkbox) {
    checkbox.addEventListener('change', async function () {
      const newState = this.checked;

      // 启用或禁用功能（enablePhone/disablePhone 内部会更新 extension_settings 和保存）
      if (newState) {
        await enablePhone();
        toastr.success('手机功能已启用');
        logger.info('[Settings] 手机功能已启用');
      } else {
        disablePhone();
        toastr.info('手机功能已禁用');
        logger.info('[Settings] 手机功能已禁用');
      }

      // 更新卡片状态
      updateCardStatus();
    });
  }
}

/**
 * 绑定聊天记录功能设置
 *
 * @description
 * 点击聊天记录卡片时弹出官方弹窗，在弹窗内启用/禁用聊天记录功能
 * 同时绑定聊天标签页中的开关和打开按钮
 */
function bindChatArchiveSettings() {
  // 更新卡片状态的辅助函数
  const updateCardStatus = () => {
    const statusEl = document.getElementById('chat-archive-status');
    if (statusEl && chatArchiveSystem) {
      statusEl.textContent = chatArchiveSystem.enabled ? '已启用' : '已禁用';
      statusEl.style.color = chatArchiveSystem.enabled ? 'var(--greenSuccessColor)' : 'var(--redWarningColor)';
    }
  };

  // 更新标签页中开关和按钮状态的辅助函数
  const updateTabUI = () => {
    const checkbox = /** @type {HTMLInputElement} */ (document.getElementById('chat-archive-enabled'));
    const openSection = document.getElementById('chat-archive-open-section');

    if (checkbox && chatArchiveSystem) {
      checkbox.checked = chatArchiveSystem.enabled;
    }
    if (openSection && chatArchiveSystem) {
      openSection.style.display = chatArchiveSystem.enabled ? '' : 'none';
    }
  };

  // 初始化卡片状态
  updateCardStatus();

  // 初始化标签页UI状态
  updateTabUI();

  // 绑定卡片点击事件，弹出官方弹窗
  const chatArchiveCard = document.querySelector('.toolbox-card[data-tool="chat-archive"]');
  if (chatArchiveCard) {
    chatArchiveCard.addEventListener('click', async () => {
      await showChatArchiveSettingsPopup(() => {
        updateCardStatus();
        updateTabUI();
      });
    });
  }

  // 绑定标签页中的开关
  const tabCheckbox = /** @type {HTMLInputElement} */ (document.getElementById('chat-archive-enabled'));
  if (tabCheckbox) {
    tabCheckbox.addEventListener('change', async function () {
      const newState = this.checked;

      if (newState) {
        await enableChatArchive();
        toastr.success('聊天记录管理已启用');
        logger.info('[Settings] 聊天记录管理已启用（从标签页）');
      } else {
        disableChatArchive();
        toastr.info('聊天记录管理已禁用');
        logger.info('[Settings] 聊天记录管理已禁用（从标签页）');
      }

      updateCardStatus();
      updateTabUI();
    });
  }

  // 绑定标签页中的打开按钮
  const openBtn = document.getElementById('chat-archive-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      // 动态导入并打开界面
      import('./chat-archive/index.js').then(({ openArchiveUI }) => {
        openArchiveUI();
      });
    });
  }

  logger.debug('[Settings] 聊天记录卡片点击事件已绑定');
}

/**
 * 显示聊天记录设置弹窗
 *
 * @async
 * @param {Function} updateCardStatus - 更新卡片状态的回调函数
 */
async function showChatArchiveSettingsPopup(updateCardStatus) {
  // 直接从 chatArchiveSystem 实例读取启用状态
  const isEnabled = chatArchiveSystem ? chatArchiveSystem.enabled : false;

  // 构建弹窗HTML内容
  const html = `
    <div class="chat-archive-intro-popup" style="padding: 10px; max-height: 500px; overflow-y: auto; text-align: left;">
      <!-- 开关 -->
      <div style="margin-bottom: 15px; padding: 10px; background: var(--black30a); border-radius: 8px;">
        <label class="checkbox_label" style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" id="chat-archive-popup-enabled" ${isEnabled ? 'checked' : ''} />
          <strong style="margin-left: 10px; font-size: 1.1em;">启用聊天记录管理</strong>
        </label>
      </div>

      <!-- 功能介绍 -->
      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px 0; color: var(--SmartThemeQuoteColor);">
          <i class="fa-solid fa-lightbulb" style="margin-right: 8px;"></i>功能介绍
        </h4>
        <p style="margin: 0; line-height: 1.6; opacity: 0.9;">
          聊天记录管理中心帮助你更好地管理和回顾与 AI 的对话。支持跨角色搜索、收藏精彩片段、添加笔记、小说式阅读。
        </p>
      </div>

      <!-- 核心功能 -->
      <div style="margin-bottom: 12px;">
        <h4 style="margin: 0 0 8px 0; color: var(--SmartThemeQuoteColor);">
          <i class="fa-solid fa-star" style="margin-right: 8px;"></i>核心功能
        </h4>
        <ul style="margin: 5px 0; padding-left: 20px; line-height: 1.8; opacity: 0.9;">
          <li><strong>全文搜索：</strong>跨角色搜索所有聊天记录</li>
          <li><strong>消息收藏：</strong>收藏喜欢的对话片段，支持分组管理</li>
          <li><strong>笔记系统：</strong>给收藏的消息添加笔记和分类标签</li>
          <li><strong>阅读模式：</strong>小说式阅读聊天记录，沉浸式回顾</li>
        </ul>
      </div>

      <!-- 提示 -->
      <div style="padding: 10px; background: var(--SmartThemeBlurTintColor); border-left: 3px solid var(--SmartThemeQuoteColor); border-radius: 4px;">
        <i class="fa-solid fa-info-circle" style="color: var(--SmartThemeQuoteColor); margin-right: 8px;"></i>
        <span style="opacity: 0.9;">启用后，在扩展菜单中点击「聊天记录」即可打开管理界面。</span>
      </div>
    </div>
  `;

  // 弹出官方弹窗
  callGenericPopup(html, POPUP_TYPE.TEXT, '聊天记录管理');

  // 等待DOM更新后绑定事件
  await new Promise(resolve => setTimeout(resolve, 100));

  // 绑定弹窗内的复选框事件
  const checkbox = /** @type {HTMLInputElement} */ (document.getElementById('chat-archive-popup-enabled'));
  if (checkbox) {
    checkbox.addEventListener('change', async function () {
      const newState = this.checked;

      // 启用或禁用功能
      if (newState) {
        await enableChatArchive();
        toastr.success('聊天记录管理已启用');
        logger.info('[Settings] 聊天记录管理已启用');
      } else {
        disableChatArchive();
        toastr.info('聊天记录管理已禁用');
        logger.info('[Settings] 聊天记录管理已禁用');
      }

      // 更新卡片状态
      updateCardStatus();
    });
  }
}


// ========================================
// 第八步：等待ST加载完成后启动扩展
// ========================================

// jQuery的ready函数：当页面加载完成后执行
jQuery(async () => {
  try {
    logger.debug('[Main] 页面加载完成，准备初始化Acsus-Paws-Puffs');

    // 可以等待一些必要的事件（比如ST完全启动）
    // 这里我们直接初始化
    await initPawsPuffs();
  } catch (error) {
    logger.error('[Main] 扩展初始化失败，请检查控制台错误:', error.message || error);
    // 显示错误提示给用户
    if (typeof toastr !== 'undefined') {
      toastr.error(`Acsus-Paws-Puffs 初始化失败: ${error.message}`);
    }
  }
});


// ========================================
// 导出（给其他文件使用）
// ========================================

// 导出功能模块实例，方便其他文件访问
export {
  fontManager,
  presetManager
};

