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

    // 5.6 初始化设置面板UI
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

  // 绑定使用条款弹窗
  bindTermsPopup();

  // 绑定日记功能开关
  bindDiarySettings();

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
  const toolboxCards = document.querySelectorAll('.toolbox-card:not(.toolbox-card-placeholder):not([data-tool="diary"])');

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
 * 按照官方推荐模式，绑定日记总开关的 change 事件
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

  // 绑定日记总开关（官方推荐模式）
  const diaryCheckbox = document.getElementById('diary-enabled');
  if (!diaryCheckbox) {
    logger.warn('[Settings] 未找到日记总开关 checkbox');
    return;
  }

  // 初始化 checkbox 状态
  const initialState = extension_settings[EXT_ID]?.diary?.enabled || false;
  diaryCheckbox.checked = initialState;
  updateCardStatus();

  // 绑定 change 事件
  diaryCheckbox.addEventListener('change', function () {
    const wasEnabled = extension_settings[EXT_ID].diary.enabled;
    const newState = this.checked;

    // 更新 extension_settings
    extension_settings[EXT_ID].diary.enabled = newState;

    // 调用官方保存函数
    saveSettingsDebounced();

    // 只有状态真正改变时才触发功能启用/禁用
    if (newState !== wasEnabled) {
      if (newState) {
        diarySystem.enable();
        toastr.success('日记功能已启用');
        logger.info('[Settings] 日记功能已启用');
      } else {
        diarySystem.disable();
        toastr.info('日记功能已禁用');
        logger.info('[Settings] 日记功能已禁用');
      }
      updateCardStatus();
    }
  });

  // 可选：卡片点击显示提示信息（而不是打开弹窗）
  const diaryCard = document.querySelector('.toolbox-card[data-tool="diary"]');
  if (diaryCard) {
    diaryCard.addEventListener('click', () => {
      toastr.info('请使用上方的开关启用/禁用日记功能。更多设置请在日记面板内配置。', '日记系统', { timeOut: 3000 });
    });
  }

  logger.debug('[Settings] 日记总开关已绑定');
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

