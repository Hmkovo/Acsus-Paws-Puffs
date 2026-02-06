/**
 * 聊天记录管理中心 - 消息按钮注入
 *
 * 职责：
 * - 在消息的 extraMesButtons 中注入收藏按钮
 * - 处理收藏按钮点击事件
 * - 显示收藏弹窗
 */

import logger from '../logger.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';

// ========================================
// [CONST] 常量定义
// ========================================
const BUTTON_CLASS = 'mes_button mes_favorite';
const BUTTON_ICON = 'fa-regular fa-star';
const BUTTON_ICON_ACTIVE = 'fa-solid fa-star';
const BUTTON_TITLE = '收藏消息';

/** @type {MutationObserver|null} */
let messageObserver = null;

/** @type {boolean} 是否已绑定全局点击事件 */
let globalClickBound = false;

/**
 * 初始化消息按钮注入
 *
 * @description
 * 1. 绑定全局点击事件（事件委托，只绑定一次）
 * 2. 为已有消息注入收藏按钮
 * 3. 启动 MutationObserver 监听新消息
 */
export function initMessageInject() {
    logger.info('[ChatArchive.Inject] 初始化消息按钮注入');

    // 绑定全局点击事件（只需绑定一次）
    bindGlobalClickEvent();

    // 先处理已有的消息
    injectToExistingMessages();

    // 监听新消息
    startObserver();

    logger.info('[ChatArchive.Inject] 消息按钮注入已启动');
}

/**
 * 停止消息按钮注入
 * @description 断开 MutationObserver，停止监听新消息
 */
export function stopMessageInject() {
    if (messageObserver) {
        messageObserver.disconnect();
        messageObserver = null;
        logger.info('[ChatArchive.Inject] 消息按钮注入已停止');
    }
}

/**
 * 为已有的消息注入收藏按钮
 * @description 遍历页面上所有 .mes 元素，为每条消息注入收藏按钮
 */
function injectToExistingMessages() {
    const messages = document.querySelectorAll('.mes');
    let count = 0;

    messages.forEach(mes => {
        if (injectButtonToMessage(mes)) {
            count++;
        }
    });

    if (count > 0) {
        logger.debug('[ChatArchive.Inject] 已为', count, '条消息注入收藏按钮');
    }
}

/**
 * 启动 MutationObserver 监听新消息
 * @description 监听 #chat 容器的 DOM 变化，自动为新渲染的消息注入收藏按钮
 */
function startObserver() {
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) {
        logger.warn('[ChatArchive.Inject] 找不到聊天容器 #chat');
        return;
    }

    messageObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = /** @type {HTMLElement} */ (node);

                    // 如果添加的是消息元素
                    if (element.classList?.contains('mes')) {
                        injectButtonToMessage(element);
                    }

                    // 如果添加的元素内部包含消息
                    const innerMessages = element.querySelectorAll?.('.mes');
                    innerMessages?.forEach(mes => {
                        injectButtonToMessage(mes);
                    });
                }
            });
        });
    });

    messageObserver.observe(chatContainer, {
        childList: true,
        subtree: true
    });

    logger.debug('[ChatArchive.Inject] MutationObserver 已启动');
}

/**
 * 为单条消息注入收藏按钮
 *
 * @param {Element} messageElement - 消息元素 (.mes)
 * @returns {boolean} 是否成功注入
 */
function injectButtonToMessage(messageElement) {
    const extraButtons = messageElement.querySelector('.extraMesButtons');
    if (!extraButtons) {
        return false;
    }

    // 检查是否已经注入过
    if (extraButtons.querySelector('.mes_favorite')) {
        return false;
    }

    // 创建收藏按钮
    const favoriteBtn = document.createElement('div');
    favoriteBtn.className = `${BUTTON_CLASS} ${BUTTON_ICON}`;
    favoriteBtn.title = BUTTON_TITLE;
    favoriteBtn.setAttribute('data-i18n', '[title]收藏消息');

    // 插入到 extraMesButtons 的第一个位置
    extraButtons.insertBefore(favoriteBtn, extraButtons.firstChild);

    return true;
}

/**
 * 绑定全局点击事件（使用事件委托）
 *
 * @description
 * 使用 jQuery 事件委托绑定 .mes_favorite 的点击事件
 * 这是 SillyTavern 官方的事件绑定方式
 */
function bindGlobalClickEvent() {
    // 防止重复绑定
    if (globalClickBound) {
        logger.debug('[ChatArchive.Inject] 全局点击事件已绑定过，跳过');
        return;
    }

    // 使用 jQuery 事件委托（和 SillyTavern 官方一样）
    $(document).on('click', '.mes_favorite', function(e) {
        e.stopPropagation();
        e.preventDefault();

        const button = /** @type {HTMLElement} */ (this);
        const messageElement = button.closest('.mes');

        if (messageElement) {
            handleFavoriteClick(messageElement, button);
        }
    });

    globalClickBound = true;
    logger.debug('[ChatArchive.Inject] 全局点击事件已绑定');
}

/**
 * 处理收藏按钮点击
 *
 * @param {Element} messageElement - 消息元素
 * @param {HTMLElement} buttonElement - 按钮元素
 */
async function handleFavoriteClick(messageElement, buttonElement) {
    // 获取消息信息
    const mesId = messageElement.getAttribute('mesid');
    const isUser = messageElement.classList.contains('user_mes');
    const nameElement = messageElement.querySelector('.name_text');
    const textElement = messageElement.querySelector('.mes_text');

    const senderName = nameElement?.textContent?.trim() || (isUser ? '用户' : 'AI');
    const messageText = textElement?.textContent?.trim() || '';
    const messagePreview = messageText.length > 100
        ? messageText.substring(0, 100) + '...'
        : messageText;

    logger.debug('[ChatArchive.Inject] 点击收藏按钮:', {
        mesId,
        isUser,
        senderName,
        preview: messagePreview.substring(0, 50)
    });

    // 显示收藏弹窗
    await showFavoritePopup({
        mesId,
        isUser,
        senderName,
        messagePreview,
        buttonElement
    });
}

/**
 * 显示收藏弹窗
 *
 * @param {Object} params - 参数
 * @param {string} params.mesId - 消息ID
 * @param {boolean} params.isUser - 是否是用户消息
 * @param {string} params.senderName - 发送者名称
 * @param {string} params.messagePreview - 消息预览
 * @param {HTMLElement} params.buttonElement - 按钮元素
 */
async function showFavoritePopup({ mesId, isUser, senderName, messagePreview, buttonElement }) {
    // 构建弹窗 HTML
    const html = `
        <div class="chat-archive-favorite-popup" style="padding: 10px; text-align: left;">
            <!-- 消息预览 -->
            <div style="margin-bottom: 15px; padding: 10px; background: var(--black30a); border-radius: 8px; border-left: 3px solid var(--SmartThemeQuoteColor);">
                <div style="font-size: 0.85em; color: var(--SmartThemeQuoteColor); margin-bottom: 5px;">
                    <i class="fa-solid ${isUser ? 'fa-user' : 'fa-robot'}" style="margin-right: 5px;"></i>
                    ${senderName}
                </div>
                <div style="font-size: 0.9em; opacity: 0.9; line-height: 1.5;">
                    ${messagePreview}
                </div>
            </div>

            <!-- 标题输入 -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-size: 0.9em;">
                    <i class="fa-solid fa-heading" style="margin-right: 5px;"></i>收藏标题（可选）
                </label>
                <input type="text" id="favorite-title-input"
                    placeholder="给这条收藏起个名字..."
                    style="width: 100%; padding: 8px 10px; border: 1px solid var(--SmartThemeBorderColor);
                           border-radius: 4px; background: var(--black30a); color: var(--SmartThemeBodyColor);">
            </div>

            <!-- 分组选择 -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-size: 0.9em;">
                    <i class="fa-solid fa-folder" style="margin-right: 5px;"></i>选择分组
                </label>
                <select id="favorite-group-select"
                    style="width: 100%; padding: 8px 10px; border: 1px solid var(--SmartThemeBorderColor);
                           border-radius: 4px; background: var(--black30a); color: var(--SmartThemeBodyColor);">
                    <option value="default">默认分组</option>
                    <option value="important">重要</option>
                    <option value="funny">有趣</option>
                    <option value="memorable">难忘</option>
                </select>
            </div>

            <!-- 提示 -->
            <div style="font-size: 0.8em; opacity: 0.7;">
                <i class="fa-solid fa-info-circle" style="margin-right: 5px;"></i>
                收藏后可在「聊天记录管理」中查看和管理
            </div>
        </div>
    `;

    // 显示弹窗
    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, '收藏消息', {
        okButton: '收藏',
        cancelButton: '取消',
        wide: false
    });

    // 用户点击了收藏
    if (result) {
        const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('favorite-title-input'));
        const groupSelect = /** @type {HTMLSelectElement} */ (document.getElementById('favorite-group-select'));

        const title = titleInput?.value?.trim() || '';
        const group = groupSelect?.value || 'default';

        logger.info('[ChatArchive.Inject] 用户确认收藏:', {
            mesId,
            title: title || '(无标题)',
            group
        });

        // TODO: 调用数据层保存收藏
        // await addFavorite({ mesId, title, group, ... });

        // 更新按钮状态为已收藏（分开移除/添加类名）
        buttonElement.classList.remove('fa-regular', 'fa-star');
        buttonElement.classList.add('fa-solid', 'fa-star');
        buttonElement.title = '已收藏';

        // 显示成功提示
        toastr.success('消息已收藏');
    }
}
