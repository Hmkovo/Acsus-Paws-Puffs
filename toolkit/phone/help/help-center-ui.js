/**
 * 帮助中心页面（通用教程列表）
 * @module phone/help/help-center-ui
 */

import logger from '../../../logger.js';

/**
 * 渲染帮助中心页
 * 
 * @description
 * 返回页面内容片段（DocumentFragment），由 phone-main-ui.js 创建外层容器
 * 显示所有功能的说明和教程入口
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderHelpCenter() {
  logger.info('[HelpCenter] 开始渲染帮助中心页');

  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'help-center-wrapper';

  // 创建页面内容
  container.innerHTML = `
    <!-- 顶部栏 -->
    <div class="help-center-topbar">
      <button class="help-center-back-btn">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <div class="help-center-title">甜品指南</div>
    </div>

    <!-- 内容区（可滚动） -->
    <div class="help-center-content">
      <!-- 功能教程 -->
      <div class="settings-section">
        <div class="settings-section-title">功能教程</div>
        <div class="settings-section-content">
          <div class="settings-item" data-action="emoji-guide">
            <i class="fa-solid fa-face-smile"></i>
            <span class="settings-item-text">表情包相关说明</span>
            <i class="fa-solid fa-chevron-right settings-item-arrow"></i>
          </div>
          <div class="settings-item" data-action="placeholder-2">
            <i class="fa-solid fa-2"></i>
            <span class="settings-item-text">教程占位符 2</span>
            <i class="fa-solid fa-chevron-right settings-item-arrow"></i>
          </div>
          <div class="settings-item" data-action="placeholder-3">
            <i class="fa-solid fa-3"></i>
            <span class="settings-item-text">教程占位符 3</span>
            <i class="fa-solid fa-chevron-right settings-item-arrow"></i>
          </div>
          <div class="settings-item" data-action="placeholder-4">
            <i class="fa-solid fa-4"></i>
            <span class="settings-item-text">教程占位符 4</span>
            <i class="fa-solid fa-chevron-right settings-item-arrow"></i>
          </div>
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  bindEvents(container);

  fragment.appendChild(container);

  logger.info('[HelpCenter] 帮助中心页渲染完成');
  return fragment;
}

/**
 * 绑定事件监听器
 * 
 * @private
 * @param {HTMLElement} container - 页面容器
 */
function bindEvents(container) {
  logger.debug('[HelpCenter] 绑定事件');

  // 返回按钮
  const backBtn = container.querySelector('.help-center-back-btn');
  backBtn.addEventListener('click', handleBack);

  // 所有设置项
  const settingsItems = container.querySelectorAll('.settings-item');
  settingsItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      handleItemClick(action);
    });
  });
}

/**
 * 处理返回
 * @private
 */
function handleBack() {
  logger.info('[HelpCenter] 点击返回');
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'help-center');
    });
  }
}

/**
 * 处理设置项点击
 * 
 * @private
 * @param {string} action - 操作类型
 */
async function handleItemClick(action) {
  logger.info('[HelpCenter] 点击设置项:', action);

  const overlayElement = document.querySelector('.phone-overlay');
  if (!overlayElement) return;

  switch (action) {
    case 'emoji-guide':
      // 跳转到表情包详细说明页
      const { showPage } = await import('../phone-main-ui.js');
      await showPage(overlayElement, 'emoji-guide-detail', {});
      break;

    case 'placeholder-2':
    case 'placeholder-3':
    case 'placeholder-4':
      // 占位符，暂无操作
      logger.debug('[HelpCenter] 占位符，暂无操作');
      break;

    default:
      logger.warn('[HelpCenter] 未知操作:', action);
  }
}

