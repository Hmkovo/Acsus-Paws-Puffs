/**
 * 背景选择器工具（公共）
 * @module phone/utils/background-picker
 */

import logger from '../../../logger.js';
import { getRequestHeaders } from '../../../../../../../script.js';

/**
 * 获取系统背景列表
 * 
 * @async
 * @returns {Promise<Array<string>>} 背景图URL数组
 */
export async function getSystemBackgrounds() {
  logger.debug('phone','[BackgroundPicker] 获取系统背景列表');

  try {
    const response = await fetch('/api/backgrounds/all', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const { images } = await response.json();
      logger.info('phone','[BackgroundPicker] 获取到系统背景:', images.length, '个');
      return images;
    } else {
      logger.error('phone','[BackgroundPicker] 获取背景失败:', response.status);
      return [];
    }
  } catch (error) {
    logger.error('phone','[BackgroundPicker] 获取背景异常:', error);
    return [];
  }
}

/**
 * 显示背景选择器弹窗（使用联系人页风格的自定义弹窗）
 * 
 * @description
 * 创建一个可滚动的弹窗，显示所有系统背景的缩略图
 * 支持：选择背景、取消、恢复默认
 * 
 * @async
 * @param {Array<string>} backgrounds - 背景文件名数组
 * @returns {Promise<string|null>} 用户选择的背景URL，或 null（取消）
 */
export async function showBackgroundPicker(backgrounds) {
  logger.debug('phone','[BackgroundPicker] 显示背景选择器，共', backgrounds.length, '个背景');

  return new Promise((resolve) => {
    // 创建弹窗HTML
    const pickerHTML = `
            <div class="contact-bg-picker">
                <div class="contact-bg-picker-header">
                    <h3>选择背景图片</h3>
                    <button class="contact-bg-picker-close"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="contact-bg-picker-grid">
                    ${backgrounds.map(bg => {
      const url = `/backgrounds/${bg}`;
      const title = bg.slice(0, bg.lastIndexOf('.'));
      return `
                            <div class="contact-bg-item" data-bg="${bg}" data-url="${url}">
                                <img src="${url}" alt="${title}" loading="lazy">
                                <div class="contact-bg-item-title">${title}</div>
                            </div>
                        `;
    }).join('')}
                </div>
                <div class="contact-bg-picker-footer">
                    <button class="contact-bg-picker-cancel">取消</button>
                    <button class="contact-bg-picker-reset">恢复默认</button>
                </div>
            </div>
        `;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'contact-bg-picker-overlay';
    overlay.innerHTML = pickerHTML;
    document.body.appendChild(overlay);

    // 绑定事件
    const closeBtn = overlay.querySelector('.contact-bg-picker-close');
    const cancelBtn = overlay.querySelector('.contact-bg-picker-cancel');
    const resetBtn = overlay.querySelector('.contact-bg-picker-reset');

    const closePicker = () => {
      logger.debug('phone','[BackgroundPicker] 用户取消选择');
      overlay.remove();
      resolve(null);
    };

    closeBtn.addEventListener('click', closePicker);
    cancelBtn.addEventListener('click', closePicker);
    // 移除点击遮罩关闭功能（统一弹窗交互：只能通过×或按钮关闭）

    // 恢复默认（白色背景）
    resetBtn.addEventListener('click', () => {
      logger.info('phone','[BackgroundPicker] 用户选择恢复默认背景');
      overlay.remove();
      resolve(''); // 空字符串表示恢复默认
    });

    // 点击背景项
    const bgItems = overlay.querySelectorAll('.contact-bg-item');
    bgItems.forEach(item => {
      item.addEventListener('click', () => {
        const htmlItem = /** @type {HTMLElement} */ (item);
        const bgUrl = htmlItem.dataset.url;
        const bgName = htmlItem.dataset.bg;
        logger.info('phone','[BackgroundPicker] 用户选择背景:', bgName);
        overlay.remove();
        resolve(bgUrl);
      });
    });
  });
}

