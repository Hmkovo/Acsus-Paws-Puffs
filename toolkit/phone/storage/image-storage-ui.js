/**
 * 图片管理页面 UI 渲染
 *
 * @description
 * 管理拍照发送的图片（phone_开头的图片）
 * 功能：查看、删除、排序
 *
 * @module phone/storage/image-storage-ui
 */

import logger from '../../../logger.js';
import { hidePage } from '../phone-main-ui.js';
import { showImagePreview } from '../utils/image-helper.js';
import { getUploadedImages, deleteImages } from './image-data.js';
import { showConfirmPopup } from '../utils/popup-helper.js';
import { showSuccessToast, showWarningToast, showErrorToast } from '../ui-components/toast-notification.js';
import { stateManager } from '../utils/state-manager.js';

/**
 * 渲染图片管理页面
 *
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderImageStorage() {
    logger.info('[ImageStorage] 开始渲染图片管理页面');

    const fragment = document.createDocumentFragment();

    const container = document.createElement('div');
    container.className = 'image-storage-wrapper';

    container.innerHTML = `
        <!-- 顶部栏 -->
        <div class="image-storage-topbar">
            <button class="image-storage-back-btn">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="image-storage-title">图片管理</div>
            <div class="image-storage-actions">
                <button class="image-storage-sort-btn" title="排序方式">
                    <i class="fa-solid fa-arrow-down-wide-short"></i>
                </button>
                <button class="image-storage-delete-btn" title="删除选中">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>

        <!-- 工具栏 -->
        <div class="image-storage-toolbar">
            <div class="image-storage-info">
                <span class="image-storage-count">加载中...</span>
            </div>
            <button class="image-storage-select-all-btn">全选</button>
        </div>

        <!-- 内容区 -->
        <div class="image-storage-content">
            <div class="image-storage-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>加载图片列表中...</span>
            </div>
        </div>
    `;

    // 绑定事件
    bindEvents(container);

    // 加载图片列表
    loadImageList(container);

    fragment.appendChild(container);

    logger.info('[ImageStorage] 页面渲染完成');
    return fragment;
}

/**
 * 绑定事件监听器
 *
 * @param {HTMLElement} page - 页面元素
 */
function bindEvents(page) {
    // 返回按钮
    const backBtn = page.querySelector('.image-storage-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            logger.info('[ImageStorage] 点击返回');
            const overlayElement = document.querySelector('.phone-overlay');
            if (overlayElement) {
                hidePage(overlayElement, 'image-storage');
            }
        });
    }

    // 排序按钮
    const sortBtn = page.querySelector('.image-storage-sort-btn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            logger.info('[ImageStorage] 切换排序方式');
            toggleSortOrder(page);
        });
    }

    // 删除按钮
    const deleteBtn = page.querySelector('.image-storage-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            logger.info('[ImageStorage] 点击删除选中');
            deleteSelectedImages(page);
        });
    }

    // 全选按钮
    const selectAllBtn = page.querySelector('.image-storage-select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            logger.info('[ImageStorage] 点击全选/取消全选');
            toggleSelectAll(page);
        });
    }

    // 【关键】订阅图片数据变化（实时更新）
    stateManager.subscribe('image-storage', 'images', async (meta) => {
        // 检查页面是否还在DOM中
        if (!document.contains(page)) {
            logger.debug('[ImageStorage] 页面已移除，跳过刷新');
            return;
        }

        const { action, image, count } = meta;
        logger.info('[ImageStorage] 收到数据变化通知:', action, image?.filename || count);

        // 最小局部更新：只刷新图片列表，不重新渲染整个页面
        await refreshImageList(page);
    });
}

/**
 * 刷新图片列表（最小局部更新）
 *
 * @async
 * @param {HTMLElement} page - 页面元素
 *
 * @description
 * 只更新图片列表部分，保持当前排序顺序，不重新渲染整个页面
 */
async function refreshImageList(page) {
    logger.debug('[ImageStorage] 刷新图片列表（局部更新）');

    try {
        // 重新加载数据
        const uploadedImages = getUploadedImages();

        const phoneImages = uploadedImages.map(img => ({
            name: img.filename,
            url: img.imagePath,
            size: img.size,
            timestamp: img.addedTime
        }));

        // 获取当前排序顺序
        const currentSortOrder = page.dataset.sortOrder || 'time-desc';

        // 应用当前排序
        const sortedImages = sortImages(phoneImages, currentSortOrder);

        // 更新数据
        page.dataset.images = JSON.stringify(sortedImages);

        // 重新渲染图片网格
        renderImageGrid(page, sortedImages);

        logger.info('[ImageStorage] 列表已刷新，共', sortedImages.length, '张图片');
    } catch (error) {
        logger.error('[ImageStorage] 刷新列表失败:', error);
    }
}

/**
 * 加载图片列表
 *
 * @async
 * @param {HTMLElement} page - 页面元素
 */
async function loadImageList(page) {
    logger.debug('[ImageStorage] 开始加载图片列表');

    try {
        // 从配置中获取已上传的图片列表
        const uploadedImages = getUploadedImages();

        logger.info('[ImageStorage] 找到', uploadedImages.length, '张图片');

        // 数据格式已经标准化，直接使用
        const phoneImages = uploadedImages.map(img => ({
            name: img.filename,
            url: img.imagePath,
            size: img.size,
            timestamp: img.addedTime
        }));

        // 保存到页面数据
        page.dataset.sortOrder = 'time-desc'; // 默认按时间降序
        page.dataset.images = JSON.stringify(phoneImages);

        // 渲染图片列表
        renderImageGrid(page, phoneImages);

    } catch (error) {
        logger.error('[ImageStorage] 加载图片列表失败:', error);

        const content = page.querySelector('.image-storage-content');
        if (content) {
            content.innerHTML = `
                <div class="image-storage-error">
                    <i class="fa-solid fa-exclamation-triangle"></i>
                    <span>加载失败</span>
                    <button class="image-storage-retry-btn">重试</button>
                </div>
            `;

            const retryBtn = content.querySelector('.image-storage-retry-btn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => loadImageList(page));
            }
        }
    }
}

/**
 * 渲染图片网格
 *
 * @param {HTMLElement} page - 页面元素
 * @param {Array} images - 图片列表
 */
function renderImageGrid(page, images) {
    const content = page.querySelector('.image-storage-content');
    if (!content) return;

    // 获取排序方式
    const sortOrder = page.dataset.sortOrder || 'time-desc';

    // 排序图片
    const sortedImages = sortImages(images, sortOrder);

    // 更新信息栏
    const infoSpan = page.querySelector('.image-storage-count');
    if (infoSpan) {
        const totalSize = sortedImages.reduce((sum, img) => sum + (img.size || 0), 0);
        const sizeText = formatFileSize(totalSize);
        infoSpan.textContent = `共 ${sortedImages.length} 张图片，${sizeText}`;
    }

    // 如果没有图片，显示空状态
    if (sortedImages.length === 0) {
        content.innerHTML = `
            <div class="image-storage-empty">
                <i class="fa-solid fa-image"></i>
                <span>暂无图片</span>
                <p>拍照发送的图片会显示在这里</p>
            </div>
        `;
        return;
    }

    // 创建图片网格
    const grid = document.createElement('div');
    grid.className = 'image-storage-grid';

    sortedImages.forEach(image => {
        const name = image.name || image;
        const size = image.size || 0;
        const url = image.url || `/user/files/${name}`;

        // 使用记录的时间戳，如果没有则从文件名提取
        const timestamp = image.timestamp || extractTimestamp(name);
        const timeText = formatTime(timestamp);

        const item = document.createElement('div');
        item.className = 'image-storage-item';
        item.dataset.name = name;

        item.innerHTML = `
            <div class="image-storage-item-checkbox">
                <i class="fa-regular fa-square"></i>
                <i class="fa-solid fa-square-check"></i>
            </div>
            <img src="${url}" alt="${name}" class="image-storage-item-img">
            <div class="image-storage-item-info">
                <div class="image-storage-item-time">${timeText}</div>
                <div class="image-storage-item-size">${formatFileSize(size)}</div>
            </div>
        `;

        // 点击复选框切换选中状态
        const checkbox = item.querySelector('.image-storage-item-checkbox');
        if (checkbox) {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                item.classList.toggle('selected');
                updateSelectAllButton(page);
            });
        }

        // 点击图片预览
        const img = item.querySelector('.image-storage-item-img');
        if (img) {
            img.addEventListener('click', () => {
                logger.debug('[ImageStorage] 预览图片:', url);
                showImagePreview(url);
            });
        }

        grid.appendChild(item);
    });

    content.innerHTML = '';
    content.appendChild(grid);
}

/**
 * 排序图片
 *
 * @param {Array} images - 图片列表
 * @param {string} order - 排序方式（time-desc/time-asc/size-desc/size-asc）
 * @returns {Array} 排序后的图片列表
 */
function sortImages(images, order) {
    const sorted = [...images];

    if (order === 'time-desc') {
        // 时间降序（最新优先）
        sorted.sort((a, b) => {
            const timeA = a.timestamp || extractTimestamp(a.name || a);
            const timeB = b.timestamp || extractTimestamp(b.name || b);
            return timeB - timeA;
        });
    } else if (order === 'time-asc') {
        // 时间升序（最旧优先）
        sorted.sort((a, b) => {
            const timeA = a.timestamp || extractTimestamp(a.name || a);
            const timeB = b.timestamp || extractTimestamp(b.name || b);
            return timeA - timeB;
        });
    } else if (order === 'size-desc') {
        // 大小降序（最大优先）
        sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
    } else if (order === 'size-asc') {
        // 大小升序（最小优先）
        sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
    }

    return sorted;
}

/**
 * 切换排序方式
 *
 * @param {HTMLElement} page - 页面元素
 */
function toggleSortOrder(page) {
    const currentOrder = page.dataset.sortOrder || 'time-desc';

    // 排序方式循环：时间降序 → 时间升序 → 大小降序 → 大小升序
    const orders = ['time-desc', 'time-asc', 'size-desc', 'size-asc'];
    const currentIndex = orders.indexOf(currentOrder);
    const nextOrder = orders[(currentIndex + 1) % orders.length];

    logger.info('[ImageStorage] 切换排序:', currentOrder, '->', nextOrder);

    page.dataset.sortOrder = nextOrder;

    // 显示提示
    const orderNames = {
        'time-desc': '最新优先',
        'time-asc': '最旧优先',
        'size-desc': '最大优先',
        'size-asc': '最小优先'
    };
    showSuccessToast(`排序：${orderNames[nextOrder]}`);

    // 重新渲染
    const images = JSON.parse(page.dataset.images || '[]');
    renderImageGrid(page, images);
}

/**
 * 全选/取消全选
 *
 * @param {HTMLElement} page - 页面元素
 */
function toggleSelectAll(page) {
    const items = page.querySelectorAll('.image-storage-item');
    const allSelected = Array.from(items).every(item => item.classList.contains('selected'));

    if (allSelected) {
        // 全部取消选中
        items.forEach(item => item.classList.remove('selected'));
        logger.debug('[ImageStorage] 取消全选');
    } else {
        // 全部选中
        items.forEach(item => item.classList.add('selected'));
        logger.debug('[ImageStorage] 全选');
    }

    updateSelectAllButton(page);
}

/**
 * 更新全选按钮文本
 *
 * @param {HTMLElement} page - 页面元素
 */
function updateSelectAllButton(page) {
    const selectAllBtn = page.querySelector('.image-storage-select-all-btn');
    if (!selectAllBtn) return;

    const items = page.querySelectorAll('.image-storage-item');
    const allSelected = Array.from(items).every(item => item.classList.contains('selected'));

    selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
}

/**
 * 删除选中的图片
 *
 * @async
 * @param {HTMLElement} page - 页面元素
 */
async function deleteSelectedImages(page) {
    const selectedItems = page.querySelectorAll('.image-storage-item.selected');

    if (selectedItems.length === 0) {
        showWarningToast('请先选择要删除的图片');
        return;
    }

    logger.info('[ImageStorage] 准备删除', selectedItems.length, '张图片');

    // 确认弹窗
    const confirmed = await showConfirmPopup(
        '确认删除',
        `确定要删除选中的 ${selectedItems.length} 张图片吗？\n\n此操作不可恢复！`,
        {
            danger: true,
            okButton: '删除',
            cancelButton: '取消'
        }
    );

    if (!confirmed) {
        logger.debug('[ImageStorage] 用户取消删除');
        return;
    }

    // 收集文件名列表
    const filenames = Array.from(selectedItems).map(item => {
        const el = /** @type {HTMLElement} */ (item);
        return el.dataset.name;
    }).filter(Boolean);

    logger.info('[ImageStorage] 准备删除', filenames.length, '张图片');

    try {
        // 使用数据管理系统删除（同时删除文件和记录）
        const result = await deleteImages(filenames);

        // 移除已删除的DOM元素
        const deletedSet = new Set(filenames);
        selectedItems.forEach(item => {
            const el = /** @type {HTMLElement} */ (item);
            if (deletedSet.has(el.dataset.name)) {
                el.remove();
            }
        });

        // 显示结果
        if (result.failCount === 0) {
            showSuccessToast(`成功删除 ${result.successCount} 张图片`);
        } else if (result.successCount > 0) {
            showWarningToast(`删除完成：成功 ${result.successCount} 张，失败 ${result.failCount} 张`);
        } else {
            showErrorToast('删除失败，请稍后重试');
        }
    } catch (error) {
        logger.error('[ImageStorage] 删除图片时出错:', error);
        showErrorToast('删除失败：' + error.message);
    }

    // 更新图片列表数据
    const images = JSON.parse(page.dataset.images || '[]');
    const deletedNamesSet = new Set(filenames);
    const remainingImages = images.filter(img => !deletedNamesSet.has(img.name || img));
    page.dataset.images = JSON.stringify(remainingImages);

    // 更新信息栏
    const infoSpan = page.querySelector('.image-storage-count');
    if (infoSpan) {
        const totalSize = remainingImages.reduce((sum, img) => sum + (img.size || 0), 0);
        const sizeText = formatFileSize(totalSize);
        infoSpan.textContent = `共 ${remainingImages.length} 张图片，${sizeText}`;
    }

    // 如果全部删除了，显示空状态
    if (remainingImages.length === 0) {
        const content = page.querySelector('.image-storage-content');
        if (content) {
            content.innerHTML = `
                <div class="image-storage-empty">
                    <i class="fa-solid fa-image"></i>
                    <span>暂无图片</span>
                    <p>拍照发送的图片会显示在这里</p>
                </div>
            `;
        }
    }

    // 更新全选按钮
    updateSelectAllButton(page);

    logger.info('[ImageStorage] 删除完成');
}

/**
 * 从文件名提取时间戳
 *
 * @param {string} filename - 文件名（如 phone_1763834869518.jpg）
 * @returns {number} 时间戳（毫秒）
 */
function extractTimestamp(filename) {
    const match = filename.match(/phone_(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * 格式化时间
 *
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {string} 格式化后的时间
 */
function formatTime(timestamp) {
    if (!timestamp) return '未知时间';

    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateStart.getTime() === today.getTime()) {
        // 今天
        return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (dateStart.getTime() === yesterday.getTime()) {
        // 昨天
        return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
        // 其他日期
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
}

/**
 * 格式化文件大小
 *
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 KB';

    const kb = bytes / 1024;
    const mb = kb / 1024;

    if (mb >= 1) {
        return `${mb.toFixed(2)} MB`;
    } else {
        return `${Math.ceil(kb)} KB`;
    }
}
