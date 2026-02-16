/**
 * 聊天记录管理中心 - UI 渲染
 *
 * 职责：
 * - 渲染全屏页面框架
 * - 管理四个标签页的切换
 * - 处理 UI 交互事件
 */

import logger from '../logger.js';

// ========================================
// [CONST] 页面 ID 常量
// ========================================
const PAGE_IDS = {
    SEARCH: 'search',
    FAVORITES: 'favorites',
    NOTES: 'notes',
    READER: 'reader'
};

/**
 * 渲染聊天记录管理框架
 *
 * @returns {HTMLElement} 返回 overlay 元素
 */
export function renderArchiveFrame() {
    logger.debug('archive', '[ChatArchive.UI] 开始渲染框架');

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'chat-archive-overlay';

    // 创建主容器
    const container = document.createElement('div');
    container.className = 'chat-archive-container';

    container.innerHTML = `
        <!-- 顶部标题栏 -->
        <div class="chat-archive-header">
            <div class="chat-archive-header-back" id="chat-archive-close">
                <i class="fa-solid fa-chevron-left"></i>
            </div>
            <div class="chat-archive-header-title">聊天记录管理</div>
            <div class="chat-archive-header-action">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </div>
        </div>

        <!-- 内容区域 -->
        <div class="chat-archive-content">
            <!-- 搜索页面 -->
            <div class="chat-archive-page active" id="chat-archive-page-search">
                <div class="chat-archive-placeholder">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <p>搜索功能开发中...</p>
                </div>
            </div>

            <!-- 收藏夹页面 -->
            <div class="chat-archive-page" id="chat-archive-page-favorites">
                <div class="chat-archive-placeholder">
                    <i class="fa-solid fa-star"></i>
                    <p>收藏夹功能开发中...</p>
                </div>
            </div>

            <!-- 笔记页面 -->
            <div class="chat-archive-page" id="chat-archive-page-notes">
                <div class="chat-archive-placeholder">
                    <i class="fa-solid fa-note-sticky"></i>
                    <p>笔记功能开发中...</p>
                </div>
            </div>

            <!-- 阅读模式页面 -->
            <div class="chat-archive-page" id="chat-archive-page-reader">
                <div class="chat-archive-placeholder">
                    <i class="fa-solid fa-book-open"></i>
                    <p>阅读模式开发中...</p>
                </div>
            </div>
        </div>

        <!-- 底部导航栏 -->
        <div class="chat-archive-nav">
            <div class="chat-archive-nav-item active" data-page="${PAGE_IDS.SEARCH}">
                <i class="fa-solid fa-magnifying-glass"></i>
                <span>搜索</span>
            </div>
            <div class="chat-archive-nav-item" data-page="${PAGE_IDS.FAVORITES}">
                <i class="fa-solid fa-star"></i>
                <span>收藏夹</span>
            </div>
            <div class="chat-archive-nav-item" data-page="${PAGE_IDS.NOTES}">
                <i class="fa-solid fa-note-sticky"></i>
                <span>笔记</span>
            </div>
            <div class="chat-archive-nav-item" data-page="${PAGE_IDS.READER}">
                <i class="fa-solid fa-book-open"></i>
                <span>阅读</span>
            </div>
        </div>
    `;

    overlay.appendChild(container);

    // 绑定事件
    bindFrameEvents(overlay);

    logger.debug('archive', '[ChatArchive.UI] 框架渲染完成');
    return overlay;
}

/**
 * 绑定框架事件
 *
 * @param {HTMLElement} overlay - 遮罩层元素
 */
function bindFrameEvents(overlay) {
    // 关闭按钮
    const closeBtn = overlay.querySelector('#chat-archive-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeArchiveUI();
        });
    }

    // 底部导航切换
    const navItems = overlay.querySelectorAll('.chat-archive-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.getAttribute('data-page');
            switchPage(overlay, pageId);
        });
    });

    // 点击遮罩层关闭（可选，暂时不启用）
    // overlay.addEventListener('click', (e) => {
    //     if (e.target === overlay) {
    //         closeArchiveUI();
    //     }
    // });

    logger.debug('archive', '[ChatArchive.UI] 事件绑定完成');
}

/**
 * 切换页面
 *
 * @param {HTMLElement} overlay - 遮罩层元素
 * @param {string} pageId - 页面 ID
 */
function switchPage(overlay, pageId) {
    // 切换导航项 active 状态
    const navItems = overlay.querySelectorAll('.chat-archive-nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-page') === pageId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // 切换页面 active 状态
    const pages = overlay.querySelectorAll('.chat-archive-page');
    pages.forEach(page => {
        if (page.id === `chat-archive-page-${pageId}`) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });

    logger.debug('archive', '[ChatArchive.UI] 切换到页面:', pageId);
}

/**
 * 关闭聊天记录管理界面
 */
export function closeArchiveUI() {
    const overlay = document.querySelector('.chat-archive-overlay');
    if (overlay) {
        // 添加关闭动画
        overlay.classList.add('closing');

        // 动画结束后移除元素
        setTimeout(() => {
            overlay.remove();
            logger.info('archive', '[ChatArchive.UI] 界面已关闭');
        }, 200);
    }
}
