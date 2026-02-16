/**
 * 存储空间页面 UI 渲染
 * 
 * @description
 * 存储空间管理入口页面，包含图片管理、语音管理、视频管理
 * 
 * @module phone/storage/storage-space-ui
 */

import logger from '../../../logger.js';
import { hidePage } from '../phone-main-ui.js';

/**
 * 渲染存储空间页面
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderStorageSpace() {
    logger.info('phone','[StorageSpace] 开始渲染存储空间页面');

    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'storage-space-wrapper';

    container.innerHTML = `
        <!-- 顶部栏 -->
        <div class="storage-space-topbar">
            <button class="storage-space-back-btn">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="storage-space-title">存储空间</div>
        </div>

        <!-- 内容区 -->
        <div class="storage-space-content">
            <!-- 图片管理 -->
            <div class="storage-item" id="storage-image-manage-link">
                <i class="fa-solid fa-image storage-item-icon"></i>
                <div class="storage-item-content">
                    <span class="storage-item-text">图片管理</span>
                    <span class="storage-item-desc">管理拍照发送的图片</span>
                </div>
                <i class="fa-solid fa-chevron-right storage-item-arrow"></i>
            </div>

            <!-- 语音管理（占位符） -->
            <div class="storage-item storage-item-disabled">
                <i class="fa-solid fa-microphone storage-item-icon"></i>
                <div class="storage-item-content">
                    <span class="storage-item-text">语音管理</span>
                    <span class="storage-item-desc">即将推出</span>
                </div>
                <i class="fa-solid fa-chevron-right storage-item-arrow"></i>
            </div>

            <!-- 视频管理（占位符） -->
            <div class="storage-item storage-item-disabled">
                <i class="fa-solid fa-video storage-item-icon"></i>
                <div class="storage-item-content">
                    <span class="storage-item-text">视频管理</span>
                    <span class="storage-item-desc">即将推出</span>
                </div>
                <i class="fa-solid fa-chevron-right storage-item-arrow"></i>
            </div>
        </div>
    `;

    // 绑定事件
    bindEvents(container);

    fragment.appendChild(container);

    logger.info('phone','[StorageSpace] 页面渲染完成');
    return fragment;
}

/**
 * 绑定事件监听器
 * 
 * @param {HTMLElement} page - 页面元素
 */
function bindEvents(page) {
    // 返回按钮
    const backBtn = page.querySelector('.storage-space-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            logger.info('phone','[StorageSpace] 点击返回');
            const overlayElement = document.querySelector('.phone-overlay');
            if (overlayElement) {
                hidePage(overlayElement, 'storage-space');
            }
        });
    }

    // 图片管理
    const imageManageLink = page.querySelector('#storage-image-manage-link');
    if (imageManageLink) {
        imageManageLink.addEventListener('click', async () => {
            logger.info('phone','[StorageSpace] 打开图片管理');
            const overlayElement = document.querySelector('.phone-overlay');
            if (overlayElement) {
                const { showPage } = await import('../phone-main-ui.js');
                showPage(overlayElement, 'image-storage', {});
            }
        });
    }
}
