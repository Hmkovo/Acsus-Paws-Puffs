/**
 * 图片识别模式设置页面
 * @module phone/settings/image-mode-settings-ui
 */

import logger from '../../../logger.js';
import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { hidePage } from '../phone-main-ui.js';

/**
 * 渲染图片识别模式设置页面
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 设置页面内容片段
 */
export async function renderImageModeSettings() {
  logger.info('[ImageModeSettings] 开始渲染图片识别模式设置页');

  // 确保数据结构存在
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }

  // 获取当前设置（默认：once - 仅本轮识别）
  const currentMode = extension_settings.acsusPawsPuffs.phone.imageMode || 'once';

  // 创建文档片段
  const fragment = document.createDocumentFragment();

  // 创建内容容器
  const container = document.createElement('div');
  container.className = 'image-mode-settings-page';

  // 页面内容
  container.innerHTML = `
        <!-- 顶部栏 -->
        <div class="image-mode-settings-topbar">
            <button class="image-mode-settings-back-btn">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="image-mode-settings-title">图片识别模式</div>
        </div>

        <!-- 内容区 -->
        <div class="image-mode-settings-content">
            <!-- 说明文本 -->
            <div class="image-mode-settings-desc">
                <p>选择AI如何识别手机聊天中的图片：</p>
            </div>

            <!-- 选项列表 -->
            <div class="image-mode-settings-options">
                <div class="image-mode-option ${currentMode === 'once' ? 'active' : ''}" data-mode="once">
                    <div class="image-mode-option-icon">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <div class="image-mode-option-content">
                        <div class="image-mode-option-title">仅本轮识别 <span class="image-mode-option-badge">推荐</span></div>
                        <div class="image-mode-option-desc">
                            图片只在发送当轮发给AI识别，下一轮自动排除。
                            <br>适合多轮对话，避免重复识别浪费tokens。
                        </div>
                    </div>
                </div>

                <div class="image-mode-option ${currentMode === 'always' ? 'active' : ''}" data-mode="always">
                    <div class="image-mode-option-icon">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <div class="image-mode-option-content">
                        <div class="image-mode-option-title">每轮都识别</div>
                        <div class="image-mode-option-desc">
                            图片会持续发送给AI，每轮对话都重新识别。
                            <br>适合需要持续参考图片内容的场景。
                        </div>
                    </div>
                </div>

                <div class="image-mode-option ${currentMode === 'never' ? 'active' : ''}" data-mode="never">
                    <div class="image-mode-option-icon">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <div class="image-mode-option-content">
                        <div class="image-mode-option-title">永不识别</div>
                        <div class="image-mode-option-desc">
                            图片仅用于展示，不发送给AI识别。
                            <br>节省tokens，适合纯装饰性图片。
                        </div>
                    </div>
                </div>
            </div>

            <!-- 提示信息 -->
            <div class="image-mode-settings-hint">
                <i class="fa-solid fa-circle-info"></i>
                <span>图片识别需要使用支持多模态的AI模型（如GPT-4V、Claude 3等）</span>
            </div>
        </div>
    `;

  // 绑定事件
  bindEvents(container);

  fragment.appendChild(container);

  logger.info('[ImageModeSettings] 设置页渲染完成');
  return fragment;
}

/**
 * 绑定事件
 * @private
 * @param {HTMLElement} container - 容器元素
 */
function bindEvents(container) {
  // 返回按钮
  const backBtn = container.querySelector('.image-mode-settings-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      logger.debug('[ImageModeSettings] 点击返回按钮');
      const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      if (overlayElement) {
        hidePage(overlayElement, 'image-mode-settings');
      }
    });
  }

  // 选项点击
  const options = container.querySelectorAll('.image-mode-option');
  options.forEach(option => {
    option.addEventListener('click', () => {
      const optionEl = /** @type {HTMLElement} */ (option);
      const mode = optionEl.dataset.mode;
      logger.info('[ImageModeSettings] 切换模式:', mode);

      // 更新UI
      options.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');

      // 保存设置
      if (!extension_settings.acsusPawsPuffs) {
        extension_settings.acsusPawsPuffs = {};
      }
      if (!extension_settings.acsusPawsPuffs.phone) {
        extension_settings.acsusPawsPuffs.phone = {};
      }
      extension_settings.acsusPawsPuffs.phone.imageMode = mode;
      saveSettingsDebounced();

      // 触发事件通知用户设置页更新显示
      const event = new CustomEvent('phone-image-mode-changed', {
        detail: { mode }
      });
      document.dispatchEvent(event);

      logger.info('[ImageModeSettings] 设置已保存:', mode);
    });
  });
}
