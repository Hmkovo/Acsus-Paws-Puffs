/**
 * Paws-Puffs 扩展 - 主入口文件
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


// ========================================
// 第二步：导入我们自己的功能模块
// ========================================

// 导入功能模块
import { FontManager } from "./font-manager.js";
import { PresetManagerModule } from "./preset-manager.js";
import { PresetManagerUI } from "./preset-manager-ui.js";


// ========================================
// 第三步：定义扩展的默认设置
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


// ========================================
// 第五步：初始化函数（扩展启动时运行）
// ========================================

async function initPawsPuffs() {
  console.log('Paws-Puffs 开始初始化...');

  // 5.1 检查并初始化设置
  if (!extension_settings.paws_puffs) {
    // 如果是第一次运行，使用默认设置
    console.log('首次运行，使用默认设置');
    extension_settings.paws_puffs = defaultSettings;
    saveSettingsDebounced();
  }

  // 5.2 创建并初始化字体管理器
  fontManager = new FontManager();
  await fontManager.init();

  // 5.3 创建并初始化预设管理器
  presetManager = new PresetManagerModule();
  await presetManager.init();

  // 5.4 初始化设置面板UI
  await initSettingsPanel();

  console.log('Paws-Puffs 初始化完成！');
}


// ========================================
// 第六步：初始化设置面板（像LittleWhiteBox那样）
// ========================================

async function initSettingsPanel() {
  console.log('初始化设置面板...');

  try {
    // 1. 等待扩展设置容器加载
    const settingsContainer = await waitForElement("#extensions_settings");
    if (!settingsContainer) {
      console.error('找不到扩展设置容器');
      return;
    }

    // 2. 加载settings.html文件（像LittleWhiteBox那样）
    const extensionPath = 'scripts/extensions/third-party/Paws-Puffs';
    const response = await fetch(`${extensionPath}/settings.html`);
    const settingsHtml = await response.text();

    // 3. 把HTML添加到设置容器中
    $(settingsContainer).append(settingsHtml);

    console.log('设置面板HTML已加载');

    // 4. 绑定事件（用户勾选/取消勾选时的处理）
    bindSettingsEvents();

    // 5. 让字体管理器渲染自己的UI
    await fontManager.renderUI(document.getElementById('paws-puffs-font-panel'));

    // 6. 让预设管理器渲染自己的UI
    presetManager.ui = new PresetManagerUI(presetManager);
    await presetManager.ui.init(document.getElementById('paws-puffs-preset-panel'));

    console.log('设置面板初始化完成');
  } catch (error) {
    console.error('初始化设置面板失败:', error);
  }
}

// 等待DOM元素出现的辅助函数
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // 先检查元素是否已经存在
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    // 如果不存在，等待它出现
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(checkInterval);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error(`等待元素 ${selector} 超时`));
      }
    }, 100);
  });
}


// ========================================
// 第七步：绑定设置面板的事件
// ========================================

function bindSettingsEvents() {
  // 绑定标签页切换
  bindTabSwitching();

  // 绑定关于页面手风琴
  bindAboutAccordion();

  // 注意：字体功能开关现在由 font-manager-ui.js 处理，不需要在这里绑定了
}

// 标签页切换逻辑
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

// 关于页面手风琴切换逻辑
function bindAboutAccordion() {
  const aboutHeaders = document.querySelectorAll('.about-accordion-header');

  aboutHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const clickedCard = header.dataset.card;
      const allCards = document.querySelectorAll('.about-accordion-card');

      // 切换所有卡片的active状态
      allCards.forEach(card => {
        if (card.dataset.card === clickedCard) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    });
  });
}


// ========================================
// 第八步：等待ST加载完成后启动扩展
// ========================================

// jQuery的ready函数：当页面加载完成后执行
jQuery(async () => {
  console.log('页面加载完成，准备初始化Paws-Puffs');

  // 可以等待一些必要的事件（比如ST完全启动）
  // 这里我们直接初始化
  await initPawsPuffs();
});


// ========================================
// 导出（给其他文件使用）
// ========================================

// 导出功能模块实例，方便其他文件访问
export {
  fontManager,
  presetManager
};

