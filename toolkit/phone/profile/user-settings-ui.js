/**
 * 用户设置页面 UI 渲染
 * 
 * 职责：
 * - 渲染设置页面（顶部栏、搜索框、设置项列表）
 * - 处理返回逻辑（使用 page-stack-helper）
 * - 所有设置项为占位符（点击无操作）
 * 
 * 设计特点：
 * - 独立页面，全屏显示
 * - CSS 类名前缀：settings-*
 * - 头像从顶部栏用户头像获取
 */

import logger from '../../../logger.js';
import { hidePage } from '../phone-main-ui.js';
import { extension_settings } from '../../../../../../extensions.js';

/**
 * 渲染用户设置页面
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 设置页面内容片段
 */
export async function renderUserSettings() {
  logger.info('phone','[UserSettings] 开始渲染用户设置页');

  // 获取用户头像（从顶部栏）
  const userAvatar = /** @type {HTMLImageElement} */ (document.querySelector('#phone-user-avatar'))?.src || 'User Avatars/default.png';

  // 创建文档片段
  const fragment = document.createDocumentFragment();

  // 创建内容容器
  const container = document.createElement('div');
  container.className = 'user-settings-page';

  // 页面内容
  container.innerHTML = `
        <!-- 顶部栏 -->
        <div class="user-settings-topbar">
            <button class="user-settings-back-btn">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="user-settings-title">设置</div>
        </div>

        <!-- 内容区 -->
        <div class="phone-settings-content">
            <!-- 搜索框 -->
            <div class="phone-settings-search-bar">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" placeholder="搜索">
            </div>

            <!-- 账号与安全 -->
            <div class="phone-settings-account-card">
                <i class="fa-solid fa-user-shield phone-settings-account-icon"></i>
                <span class="phone-settings-account-text">账号与安全</span>
                <img src="${userAvatar}" alt="头像" class="phone-settings-account-avatar">
                <i class="fa-solid fa-chevron-right phone-settings-account-arrow"></i>
            </div>

            <!-- 功能分组 -->
            <div class="phone-settings-section">
                <div class="phone-settings-section-title">功能</div>
                <div class="phone-settings-section-content">
                    <div class="phone-settings-item" id="phone-image-mode-setting-link">
                        <i class="fa-solid fa-image"></i>
                        <div class="phone-settings-item-content">
                            <span class="phone-settings-item-text">图片识别模式</span>
                            <span class="phone-settings-item-extra" id="phone-image-mode-display">仅本轮</span>
                        </div>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-sliders"></i>
                        <div class="phone-settings-item-content">
                            <span class="phone-settings-item-text">模式选择</span>
                            <span class="phone-settings-item-extra">简洁模式</span>
                        </div>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-palette"></i>
                        <span class="phone-settings-item-text">个性装扮与特权外显</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                    <div class="phone-settings-item" id="phone-storage-space-link">
                        <i class="fa-solid fa-database"></i>
                        <span class="phone-settings-item-text">存储空间</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                </div>
            </div>

            <!-- 隐私分组 -->
            <div class="phone-settings-section">
                <div class="phone-settings-section-title">隐私</div>
                <div class="phone-settings-section-content">
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-lock"></i>
                        <span class="phone-settings-item-text">隐私设置</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-file-lines"></i>
                        <span class="phone-settings-item-text">个人信息收集清单</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-share-nodes"></i>
                        <span class="phone-settings-item-text">第三方个人信息共享清单</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span class="phone-settings-item-text">个人信息保护设置</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                </div>
            </div>

            <!-- 底部项 -->
            <div class="phone-settings-section">
                <div class="phone-settings-section-content">
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-circle-info"></i>
                        <span class="phone-settings-item-text">关于QQ与帮助</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                </div>
            </div>

            <div class="phone-settings-section">
                <div class="phone-settings-section-content">
                    <div class="phone-settings-item">
                        <i class="fa-solid fa-right-from-bracket"></i>
                        <span class="phone-settings-item-text">退出当前账号</span>
                        <i class="fa-solid fa-chevron-right phone-settings-item-arrow"></i>
                    </div>
                </div>
            </div>
        </div>
    `;

  // 绑定返回按钮事件
  bindBackButton(container);

  // 绑定设置项点击事件
  bindSettingItems(container);

  fragment.appendChild(container);

  logger.info('phone','[UserSettings] 设置页渲染完成');
  return fragment;
}

/**
 * 绑定返回按钮事件
 * 
 * @param {HTMLElement} pageElement - 页面元素
 */
function bindBackButton(pageElement) {
  const backBtn = pageElement.querySelector('.user-settings-back-btn');
  if (!backBtn) {
    logger.warn('phone','[UserSettings] 找不到返回按钮');
    return;
  }

  backBtn.addEventListener('click', () => {
    logger.debug('phone','[UserSettings] 点击返回按钮');
    const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    if (overlayElement) {
      hidePage(overlayElement, 'user-settings');
    }
  });
}

/**
 * 绑定设置项点击事件
 * 
 * @param {HTMLElement} pageElement - 页面元素
 */
function bindSettingItems(pageElement) {
  // 图片识别模式
  const imageModeLink = pageElement.querySelector('#phone-image-mode-setting-link');
  if (imageModeLink) {
    imageModeLink.addEventListener('click', async () => {
      logger.info('phone','[UserSettings] 打开图片识别模式设置');
      const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      if (overlayElement) {
        const { showPage } = await import('../phone-main-ui.js');
        showPage(overlayElement, 'image-mode-settings', {});
      }
    });
  }

  // 存储空间
  const storageSpaceLink = pageElement.querySelector('#phone-storage-space-link');
  if (storageSpaceLink) {
    storageSpaceLink.addEventListener('click', async () => {
      logger.info('phone','[UserSettings] 打开存储空间');
      const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      if (overlayElement) {
        const { showPage } = await import('../phone-main-ui.js');
        showPage(overlayElement, 'storage-space', {});
      }
    });
  }

  // 更新图片模式显示文本
  updateImageModeDisplay(pageElement);

  // 监听图片模式变化
  document.addEventListener('phone-image-mode-changed', () => {
    updateImageModeDisplay(pageElement);
  });
}

/**
 * 更新图片模式显示文本
 * @private
 */
function updateImageModeDisplay(pageElement) {
  const mode = extension_settings.acsusPawsPuffs?.phone?.imageMode || 'once';
  
  const modeText = {
    once: '仅本轮',
    always: '每轮都识别',
    never: '永不识别'
  };

  const displayEl = pageElement.querySelector('#phone-image-mode-display');
  if (displayEl) {
    displayEl.textContent = modeText[mode] || '仅本轮';
  }
}

