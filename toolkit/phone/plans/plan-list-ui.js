/**
 * 约定计划列表页面
 * @module phone/plans/plan-list-ui
 * 
 * @description
 * 显示和管理约定计划列表
 * 职责：
 * - 显示进行中/已完成的计划
 * - 支持标签页切换
 * - 支持点击已完成计划查看详情/发送到酒馆
 */

import logger from '../../../logger.js';
import { getPlans, getPendingPlans, getCompletedPlans, deletePlan, hasAnyNotes } from './plan-data.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { showSuccessToast, showWarningToast } from '../ui-components/toast-notification.js';
import { formatTimeForMessageList } from '../utils/time-helper.js';

/**
 * 渲染计划列表页面
 * 
 * @param {Object} params - 参数对象
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderPlanList(params) {
    const { contactId } = params;
    logger.debug('[PlanListUI] 渲染计划列表页:', contactId);

    try {
        // 加载联系人数据
        const contacts = await loadContacts();
        const contact = contacts.find(c => c.id === contactId);

        if (!contact) {
            logger.warn('[PlanListUI] 未找到联系人:', contactId);
            return createErrorView();
        }

        const fragment = document.createDocumentFragment();
        const container = document.createElement('div');
        container.className = 'plan-list-page';
        container.dataset.contactId = contactId;

        // 1. 顶部栏
        container.appendChild(createTopBar(contact));

        // 2. 标签页
        container.appendChild(createTabs());

        // 3. 计划列表容器
        container.appendChild(await createPlanListContainer(contactId));

        fragment.appendChild(container);

        // 4. 监听计划数据变化（实时刷新列表）
        setupPlanDataListener(contactId);

        logger.info('[PlanListUI] 页面渲染完成');
        return fragment;
    } catch (error) {
        logger.error('[PlanListUI] 渲染失败:', error);
        return createErrorView();
    }
}

/**
 * 创建顶部栏
 * @param {Object} contact - 联系人对象
 * @returns {HTMLElement}
 */
function createTopBar(contact) {
    const topBar = document.createElement('div');
    topBar.className = 'plan-list-topbar';

    const displayName = getContactDisplayName(contact);

    topBar.innerHTML = `
        <button class="plan-list-back-btn">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="plan-list-title">约定计划 - ${displayName}</div>
    `;

    // 返回按钮
    const backBtn = topBar.querySelector('.plan-list-back-btn');
    backBtn.addEventListener('click', () => handleBack());

    return topBar;
}

/**
 * 创建标签页
 * @returns {HTMLElement}
 */
function createTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'plan-list-tabs';

    tabs.innerHTML = `
        <button class="plan-list-tab active" data-tab="pending">
            <i class="fa-solid fa-clock"></i> 进行中
        </button>
        <button class="plan-list-tab" data-tab="completed">
            <i class="fa-solid fa-check"></i> 已完成
        </button>
    `;

    // 绑定标签切换
    tabs.querySelectorAll('.plan-list-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.querySelectorAll('.plan-list-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabType = tab.dataset.tab;
            const page = document.querySelector('.plan-list-page');
            const pendingList = page.querySelector('.plan-list-pending');
            const completedList = page.querySelector('.plan-list-completed');

            if (tabType === 'pending') {
                pendingList.style.display = 'block';
                completedList.style.display = 'none';
            } else {
                pendingList.style.display = 'none';
                completedList.style.display = 'block';
            }
        });
    });

    return tabs;
}

/**
 * 创建计划列表容器
 * @param {string} contactId - 联系人ID
 * @returns {Promise<HTMLElement>}
 */
async function createPlanListContainer(contactId) {
    const container = document.createElement('div');
    container.className = 'plan-list-container';

    // 进行中的计划
    const pendingPlans = getPendingPlans(contactId);
    logger.debug('[PlanListUI.createPlanListContainer] 进行中计划数:', pendingPlans.length);
    const pendingList = document.createElement('div');
    pendingList.className = 'plan-list-pending';

    if (pendingPlans.length === 0) {
        pendingList.innerHTML = '<div class="plan-list-empty">暂无进行中的计划</div>';
    } else {
        pendingPlans.forEach(plan => {
            logger.debug('[PlanListUI.createPlanListContainer] 渲染进行中计划:', plan.id, plan.title);
            pendingList.appendChild(createPlanItem(plan, contactId, 'pending'));
        });
    }

    // 已完成的计划
    const completedPlans = getCompletedPlans(contactId);
    logger.debug('[PlanListUI.createPlanListContainer] 已完成计划数:', completedPlans.length);
    const completedList = document.createElement('div');
    completedList.className = 'plan-list-completed';
    completedList.style.display = 'none';

    if (completedPlans.length === 0) {
        completedList.innerHTML = '<div class="plan-list-empty">暂无已完成的计划</div>';
    } else {
        completedPlans.forEach(plan => {
            logger.debug('[PlanListUI.createPlanListContainer] 渲染已完成计划:', plan.id, plan.title);
            completedList.appendChild(createPlanItem(plan, contactId, 'completed'));
        });
    }

    container.appendChild(pendingList);
    container.appendChild(completedList);

    return container;
}

/**
 * 创建计划项
 * @param {Object} plan - 计划对象
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型（'pending' | 'completed'）
 * @returns {HTMLElement}
 */
function createPlanItem(plan, contactId, type) {
    const item = document.createElement('div');
    item.className = 'plan-list-item';
    item.dataset.planId = plan.id;

    const timeStr = formatTimeForMessageList(plan.timestamp);
    
    // 使用FontAwesome图标代替emoji
    const statusIconClass = plan.status === 'completed' ? 'fa-circle-check' : 
                           plan.status === 'accepted' ? 'fa-clock' : 'fa-file-lines';
    const statusIconColor = plan.status === 'completed' ? '#4caf50' : 
                           plan.status === 'accepted' ? '#ff9800' : '#999999';

    // 检查是否有记录的要点
    const hasNotes = hasAnyNotes(plan);

    if (type === 'pending') {
        item.innerHTML = `
            <div class="plan-list-item-icon">
                <i class="fa-solid ${statusIconClass}" style="color: ${statusIconColor}"></i>
            </div>
            <div class="plan-list-item-content">
                <div class="plan-list-item-title">${plan.title}</div>
                <div class="plan-list-item-meta">
                    <span>${timeStr}</span>
                    <span>·</span>
                    <span>${plan.status === 'pending' ? '等待响应' : '已接受'}</span>
                </div>
            </div>
        `;
    } else {
        item.innerHTML = `
            <div class="plan-list-item-icon">
                <i class="fa-solid ${statusIconClass}" style="color: ${statusIconColor}"></i>
            </div>
            <div class="plan-list-item-content">
                <div class="plan-list-item-title">
                    ${plan.title}
                    ${hasNotes ? '<i class="fa-solid fa-bookmark plan-has-notes-icon" title="已记录要点"></i>' : ''}
                </div>
                <div class="plan-list-item-meta">
                    <span>${timeStr}</span>
                    <span>·</span>
                    <span><i class="fa-solid fa-dice" style="font-size: 0.875em; margin-right: 0.25em;"></i>${plan.diceResult} - ${plan.outcome}</span>
                </div>
                <div class="plan-list-item-story">${plan.story}</div>
            </div>
            <button class="plan-list-item-btn" title="发送到酒馆">
                <i class="fa-solid fa-paper-plane"></i>
            </button>
        `;

        // 绑定发送到酒馆按钮
        const sendBtn = item.querySelector('.plan-list-item-btn');
        sendBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { sendPlanToTavern } = await import('./plan-tavern-sender.js');
            await sendPlanToTavern(plan, contactId);
        });
    }

    return item;
}

/**
 * 创建错误视图
 * @returns {DocumentFragment}
 */
function createErrorView() {
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'plan-list-error';
    container.innerHTML = `
        <i class="fa-solid fa-exclamation-triangle"></i>
        <p>加载失败</p>
    `;
    fragment.appendChild(container);
    return fragment;
}

/**
 * 处理返回操作
 */
function handleBack() {
    logger.info('[PlanListUI] 点击返回');
    const overlayElement = document.querySelector('.phone-overlay');
    if (overlayElement) {
        import('../phone-main-ui.js').then(({ hidePage }) => {
            hidePage(overlayElement, 'plan-list');
        });
    }
}

/**
 * 设置计划数据变化监听器
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 监听计划数据变化事件，自动刷新列表
 * 支持场景：
 * - AI接受/拒绝计划后自动更新
 * - 快照回滚后自动刷新
 * - 手动删除计划后刷新
 */
function setupPlanDataListener(contactId) {
    // 定义监听器函数（需要保存引用以便后续移除）
    const handlePlanDataChange = async (event) => {
        const { contactId: changedContactId } = event.detail;
        
        // 只处理当前联系人的数据变化
        if (changedContactId !== contactId) {
            return;
        }

        logger.debug('[PlanListUI] 检测到计划数据变化，刷新列表');

        // 查找列表容器
        const container = document.querySelector('.plan-list-page');
        if (!container) {
            logger.warn('[PlanListUI] 未找到列表容器，跳过刷新');
            return;
        }

        // 重新渲染列表
        const oldListContainer = container.querySelector('.plan-list-container');
        if (oldListContainer) {
            const newListContainer = await createPlanListContainer(contactId);
            oldListContainer.replaceWith(newListContainer);
            logger.info('[PlanListUI] 列表已刷新');
        }
    };

    // 添加监听器
    window.addEventListener('phone-plan-data-changed', handlePlanDataChange);

    // 保存监听器引用到容器（用于清理）
    const container = document.querySelector('.plan-list-page');
    if (container) {
        container._planDataListener = handlePlanDataChange;
    }

    logger.debug('[PlanListUI] 已设置计划数据监听器');
}

/**
 * 清理计划数据监听器
 * 
 * @description
 * 页面卸载时调用，移除事件监听器防止内存泄漏
 */
export function cleanupPlanListUI() {
    const container = document.querySelector('.plan-list-page');
    if (container && container._planDataListener) {
        window.removeEventListener('phone-plan-data-changed', container._planDataListener);
        delete container._planDataListener;
        logger.debug('[PlanListUI] 已清理计划数据监听器');
    }
}

