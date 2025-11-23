/**
 * 转账页面UI
 * 
 * @description
 * 渲染转账页面，每个联系人独立DOM（类似聊天页）
 * 职责：
 * - 显示当前余额
 * - 输入金额和留言
 * - 验证输入（金额>0，余额充足）
 * - 执行转账操作
 * - 发送转账消息到聊天页
 * 
 * @module transfer-ui
 */

import { getBalance, executeTransfer } from '../data-storage/storage-wallet.js';
import { addPendingMessage } from '../ai-integration/pending-operations.js';
import { showPhoneToast } from '../ui-components/toast-notification.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import logger from '../../../logger.js';

/**
 * 渲染转账页面
 * 
 * @description
 * 返回页面内容片段（DocumentFragment），由 phone-main-ui.js 创建外层容器
 * 
 * @async
 * @param {Object} params - 页面参数
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderTransferPage(params) {
    const { contactId } = params;
    logger.info('[TransferUI] 开始渲染转账页面:', contactId);
    logger.debug('[TransferUI] 收到的params:', params);

    // 加载联系人信息
    const contacts = await loadContacts();
    logger.debug('[TransferUI] 已加载联系人列表，总数:', contacts.length);
    
    const contact = contacts.find(c => c.id === contactId);
    
    if (!contact) {
        logger.error('[TransferUI] 联系人不存在:', contactId);
        logger.error('[TransferUI] 可用的联系人ID列表:', contacts.map(c => c.id));
        return createErrorView();
    }
    logger.debug('[TransferUI] 找到联系人:', contact);

    // 加载当前余额
    const balance = await getBalance();
    logger.debug('[TransferUI] 当前余额:', balance);
    
    const displayName = getContactDisplayName(contact);
    logger.debug('[TransferUI] 显示名称:', displayName);

    const fragment = document.createDocumentFragment();
    logger.debug('[TransferUI] Fragment已创建，类型:', fragment.constructor.name);

    // 创建页面内容容器
    const container = document.createElement('div');
    container.className = 'transfer-page';
    logger.debug('[TransferUI] Container已创建，className:', container.className);

    // 渲染HTML
    const html = createTransferHTML(displayName, balance);
    logger.debug('[TransferUI] HTML已生成，长度:', html.length, '字符');
    container.innerHTML = html;
    logger.debug('[TransferUI] HTML已注入container，子元素数量:', container.children.length);

    // 绑定事件
    bindEvents(container, contactId, contact);
    logger.debug('[TransferUI] 事件已绑定');

    // 监听钱包数据变化事件（实时更新余额显示）
    bindWalletChangeListener(container);
    logger.debug('[TransferUI] 钱包监听器已绑定');

    fragment.appendChild(container);
    logger.debug('[TransferUI] Container已添加到Fragment，Fragment.childNodes.length:', fragment.childNodes.length);

    logger.info('[TransferUI] 转账页面渲染完成，联系人:', displayName, '余额:', balance);
    logger.debug('[TransferUI] 返回的Fragment结构:', {
        nodeType: fragment.nodeType,
        childNodes: fragment.childNodes.length,
        firstChild: fragment.firstChild ? fragment.firstChild.className : 'null'
    });
    
    return fragment;
}

/**
 * 创建转账页面HTML
 * @param {string} contactName - 联系人显示名称
 * @param {number} balance - 当前余额
 * @returns {string} HTML字符串
 */
function createTransferHTML(contactName, balance) {
    return `
        <!-- 顶部栏 -->
        <div class="transfer-top-bar">
            <button class="transfer-btn-back">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="transfer-title">向${contactName}转账</div>
        </div>
        
        <!-- 表单 -->
        <div class="transfer-form">
            <!-- 余额提示 -->
            <div class="transfer-balance-hint">
                <div class="transfer-balance-label">当前余额</div>
                <div class="transfer-balance-amount">¥ ${balance.toFixed(2)}</div>
            </div>
            
            <!-- 金额输入 -->
            <div class="transfer-input-group">
                <label class="transfer-input-label">
                    转账金额<span class="transfer-input-required">*</span>
                </label>
                <input 
                    type="number" 
                    class="transfer-input transfer-input-amount" 
                    id="transfer-amount-input"
                    placeholder="0.00"
                    min="0.01"
                    step="0.01"
                    autofocus
                />
            </div>
            
            <!-- 留言输入 -->
            <div class="transfer-input-group">
                <label class="transfer-input-label">转账留言（选填）</label>
                <input 
                    type="text" 
                    class="transfer-input" 
                    id="transfer-message-input"
                    placeholder="请输入转账留言"
                    maxlength="50"
                />
            </div>
        </div>
        
        <!-- 转账按钮 -->
        <button class="transfer-btn-submit" id="transfer-submit-btn">
            转账
        </button>
    `;
}

/**
 * 绑定事件
 * @param {HTMLElement} container - 页面内容容器
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 */
function bindEvents(container, contactId, contact) {
    logger.debug('[TransferUI.bindEvents] 开始绑定事件，contactId:', contactId);
    
    // 返回按钮
    const backBtn = container.querySelector('.transfer-btn-back');
    logger.debug('[TransferUI.bindEvents] 返回按钮:', backBtn ? '找到' : '未找到');
    
    backBtn?.addEventListener('click', () => {
        logger.info('[TransferUI] 点击返回按钮');
        handleBack();
    });

    // 金额输入框
    const amountInput = /** @type {HTMLInputElement} */ (container.querySelector('#transfer-amount-input'));
    const messageInput = /** @type {HTMLInputElement} */ (container.querySelector('#transfer-message-input'));
    const submitBtn = /** @type {HTMLButtonElement} */ (container.querySelector('#transfer-submit-btn'));
    
    logger.debug('[TransferUI.bindEvents] 表单元素查找结果:', {
        amountInput: !!amountInput,
        messageInput: !!messageInput,
        submitBtn: !!submitBtn
    });

    // 金额输入时验证
    amountInput?.addEventListener('input', () => {
        validateAmount(amountInput, submitBtn);
    });

    // 转账按钮
    submitBtn?.addEventListener('click', async () => {
        logger.info('[TransferUI] 点击转账按钮');
        await handleTransfer(amountInput, messageInput, contactId, contact, submitBtn);
    });

    // 回车键提交
    amountInput?.addEventListener('keypress', (e) => {
        const keyEvent = /** @type {KeyboardEvent} */ (e);
        if (keyEvent.key === 'Enter') {
            submitBtn?.click();
        }
    });

    messageInput?.addEventListener('keypress', (e) => {
        const keyEvent = /** @type {KeyboardEvent} */ (e);
        if (keyEvent.key === 'Enter') {
            submitBtn?.click();
        }
    });
    
    logger.debug('[TransferUI.bindEvents] 所有事件绑定完成');
}

/**
 * 处理返回
 */
function handleBack() {
    logger.debug('[TransferUI] 点击返回按钮');
    const overlayElement = document.querySelector('.phone-overlay');
    if (overlayElement) {
        import('../phone-main-ui.js').then(({ hidePage }) => {
            hidePage(overlayElement, 'transfer');
        });
    }
}

/**
 * 验证金额输入
 * @param {HTMLInputElement} input - 金额输入框
 * @param {HTMLButtonElement} submitBtn - 提交按钮
 */
function validateAmount(input, submitBtn) {
    const amount = parseFloat(input.value);

    // 验证：金额必须>0
    if (isNaN(amount) || amount <= 0) {
        submitBtn.disabled = true;
        return;
    }

    submitBtn.disabled = false;
}

/**
 * 处理转账操作
 * @async
 * @param {HTMLInputElement} amountInput - 金额输入框
 * @param {HTMLInputElement} messageInput - 留言输入框
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 * @param {HTMLButtonElement} submitBtn - 提交按钮
 */
async function handleTransfer(amountInput, messageInput, contactId, contact, submitBtn) {
    const amount = parseFloat(amountInput.value);
    const message = messageInput.value.trim();
    const displayName = getContactDisplayName(contact);

    // 验证金额
    if (isNaN(amount) || amount <= 0) {
        showPhoneToast('请输入有效的转账金额', 'warning');
        return;
    }

    // 检查余额
    const balance = await getBalance();
    if (amount > balance) {
        showPhoneToast('余额不足', 'warning');
        logger.warn('[TransferUI] 转账失败：余额不足，余额:', balance, '尝试转账:', amount);
        return;
    }

    // 禁用按钮，防止重复提交
    submitBtn.disabled = true;
    submitBtn.textContent = '转账中...';

    try {
        // 执行转账（扣除余额 + 保存记录）
        const result = await executeTransfer(contactId, amount, message);

        logger.info('[TransferUI] 转账成功:', displayName, amount, '新余额:', result.balance);

        // 创建转账消息对象
        const { generateMessageId } = await import('../utils/message-actions-helper.js');
        const transferMessage = {
            id: generateMessageId(),
            sender: 'user',
            type: 'transfer',
            amount,
            message,
            time: Math.floor(Date.now() / 1000)
        };

        // 1. 保存消息到聊天数据库
        const { saveChatMessage } = await import('./message-chat-data.js');
        await saveChatMessage(contactId, transferMessage);

        // 2. 保存转账消息到pending（格式：[转账]金额|留言）
        const pendingContent = message ? `[转账]${amount}|${message}` : `[转账]${amount}`;
        addPendingMessage(contactId, pendingContent, transferMessage.time, transferMessage.id);
        
        // 3. 在聊天页显示用户转账气泡（如果聊天页存在）
        logger.debug('[TransferUI] ========== 步骤3：在聊天页显示转账消息 ==========');
        logger.debug('[TransferUI] contactId:', contactId);
        
        const safeChatPageId = `page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        logger.debug('[TransferUI] 安全的聊天页ID:', safeChatPageId);
        
        const chatPage = /** @type {HTMLElement} */ (document.querySelector(`#${safeChatPageId}`));
        logger.debug('[TransferUI] querySelector查找聊天页结果:', !!chatPage);
        
        if (chatPage) {
            logger.debug('[TransferUI] 聊天页详情:', {
                id: chatPage.id,
                classList: Array.from(chatPage.classList),
                hasActive: chatPage.classList.contains('active'),
                isConnected: chatPage.isConnected
            });
            
            // 注意：转账页在上层时，聊天页会被dimmed（没有active类）
            // 所以不检查active，只要页面存在就添加消息
            if (chatPage.isConnected) {
                logger.debug('[TransferUI] 聊天页已连接到DOM，准备添加转账消息');
                logger.debug('[TransferUI] 转账消息对象:', transferMessage);
                
                try {
                    const { appendMessageToChat } = await import('./message-chat-ui.js');
                    logger.debug('[TransferUI] 已导入appendMessageToChat函数');
                    
                    await appendMessageToChat(chatPage, transferMessage, contact, contactId);
                    logger.info('[TransferUI] ✅ 已在聊天页显示用户转账气泡');
                } catch (error) {
                    logger.error('[TransferUI] ❌ 添加转账消息到聊天页失败:', error.message);
                    logger.error('[TransferUI] 错误堆栈:', error.stack);
                }
            } else {
                logger.warn('[TransferUI] 聊天页未连接到DOM，跳过添加消息');
            }
        } else {
            logger.warn('[TransferUI] 未找到聊天页DOM:', safeChatPageId);
            logger.debug('[TransferUI] 检查所有页面DOM:');
            const allPages = document.querySelectorAll('[id^="page-"]');
            allPages.forEach((page, i) => {
                const el = /** @type {HTMLElement} */ (page);
                logger.debug(`  [${i}] ${el.id} (classList: ${el.className})`);
            });
        }
        
        logger.debug('[TransferUI] ========== 步骤3结束 ==========');

        // 4. 更新消息列表
        logger.debug('[TransferUI] 步骤4：更新消息列表');
        const { updateContactItem } = await import('./message-list-ui.js');
        await updateContactItem(contactId);
        logger.debug('[TransferUI] 消息列表已更新');

        // 显示成功提示
        logger.debug('[TransferUI] 步骤5：显示成功提示');
        showPhoneToast(`成功向${displayName}转账 ¥${amount.toFixed(2)}`, 'success');
        logger.debug('[TransferUI] Toast通知已显示');

        // 关闭转账页面，返回聊天页
        logger.debug('[TransferUI] 步骤6：500ms后自动返回聊天页');
        setTimeout(async () => {
            logger.debug('[TransferUI] 开始执行自动返回');
            const { hidePage } = await import('../phone-main-ui.js');
            const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
            if (overlay) {
                logger.debug('[TransferUI] 调用hidePage返回聊天页');
                hidePage(overlay, 'transfer');
            } else {
                logger.error('[TransferUI] 找不到.phone-overlay，无法返回');
            }
        }, 500);

    } catch (error) {
        logger.error('[TransferUI] 转账失败:', error.message);
        showPhoneToast(error.message || '转账失败', 'error');

        // 恢复按钮
        submitBtn.disabled = false;
        submitBtn.textContent = '转账';
    }
}

/**
 * 监听钱包数据变化事件（实时更新余额显示）
 * @param {HTMLElement} container - 转账页面内容容器
 */
function bindWalletChangeListener(container) {
    const handler = async (event) => {
        const { balance } = event.detail;
        logger.debug('[TransferUI] 收到钱包变化事件，余额:', balance);

        // 局部更新余额显示
        const balanceElement = container.querySelector('.transfer-balance-amount');
        if (balanceElement) {
            balanceElement.textContent = `¥ ${balance.toFixed(2)}`;
            logger.debug('[TransferUI] 余额显示已更新:', balance);
        }
    };

    document.addEventListener('wallet-data-changed', handler);

    // 页面销毁时自动移除监听器
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (node === container || node.contains(container)) {
                    document.removeEventListener('wallet-data-changed', handler);
                    observer.disconnect();
                    logger.debug('[TransferUI] 已移除钱包变化监听器');
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * 创建错误视图
 * @returns {DocumentFragment} 错误视图片段
 */
function createErrorView() {
    const fragment = document.createDocumentFragment();
    const error = document.createElement('div');
    error.className = 'transfer-error';
    error.textContent = '加载失败：联系人不存在';
    fragment.appendChild(error);
    return fragment;
}
