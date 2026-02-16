/**
 * 会员送礼页面UI
 * 
 * @description
 * 渲染会员送礼页面，每个联系人独立DOM
 * 职责：
 * - 显示当前余额
 * - 选择会员类型（VIP/SVIP）和月数（1个月/12个月）
 * - 显示价格和9折优惠
 * - 验证余额充足
 * - 执行送会员操作（扣费）
 * - 发送会员送礼消息到聊天页
 * 
 * @module gift-membership-ui
 */

import { getBalance, subtractBalance } from '../data-storage/storage-wallet.js';
import { grantCharacterMembership } from '../data-storage/storage-membership.js';
import { addPendingMessage } from '../ai-integration/pending-operations.js';
import { showPhoneToast } from '../ui-components/toast-notification.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { generateMessageId } from '../utils/message-actions-helper.js';
import { stateManager } from '../utils/state-manager.js';
import logger from '../../../logger.js';

// 会员价格配置（年付9折：10*12*0.9=108，20*12*0.9=216）
const MEMBERSHIP_PRICES = {
  vip_month: { price: 10, duration: 30, months: 1, label: 'VIP月付', type: 'vip' },
  vip_year: { price: 108, duration: 365, months: 12, label: 'VIP年付', type: 'vip' },
  svip_month: { price: 20, duration: 30, months: 1, label: 'SVIP月付', type: 'svip' },
  svip_year: { price: 216, duration: 365, months: 12, label: 'SVIP年付', type: 'svip' }
};

/**
 * 渲染会员送礼页面
 * 
 * @description
 * 返回页面内容片段（DocumentFragment），由 phone-main-ui.js 创建外层容器
 * 
 * @async
 * @param {Object} params - 页面参数
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderGiftMembershipPage(params) {
  const { contactId } = params;
  logger.info('phone','[GiftMembershipUI] 开始渲染会员送礼页面:', contactId);

  // 加载联系人信息
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);
  
  if (!contact) {
    logger.error('phone','[GiftMembershipUI] 联系人不存在:', contactId);
    return createErrorView();
  }

  // 加载当前余额
  const balance = await getBalance();
  const displayName = getContactDisplayName(contact);

  const fragment = document.createDocumentFragment();

  // 创建页面容器
  const container = document.createElement('div');
  container.className = 'gift-membership-page';

  // 1. 顶部栏（固定）
  container.appendChild(createTopBar(displayName));

  // 2. 表单内容（可滚动）
  container.appendChild(createFormContent(balance));

  // 3. 底部按钮（固定）
  container.appendChild(createBottomButton());

  fragment.appendChild(container);

  // 绑定事件
  bindEvents(container, contactId, contact);

  // 监听钱包数据变化事件（实时更新余额显示）
  bindWalletChangeListener(container, contactId);

  logger.info('phone','[GiftMembershipUI] 会员送礼页面渲染完成');
  return fragment;
}

/**
 * 创建顶部栏
 * 
 * @param {string} contactName - 联系人显示名称
 * @returns {HTMLElement} 顶部栏容器
 */
function createTopBar(contactName) {
  const topBar = document.createElement('div');
  topBar.className = 'gift-membership-top-bar';

  topBar.innerHTML = `
    <button class="gift-membership-btn-back">
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <div class="gift-membership-title">送${contactName}会员</div>
  `;

  return topBar;
}

/**
 * 创建表单内容区（可滚动）
 * 
 * @param {number} balance - 当前余额
 * @returns {HTMLElement} 表单内容容器
 */
function createFormContent(balance) {
  const form = document.createElement('div');
  form.className = 'gift-membership-form';

  form.innerHTML = `
    <!-- 余额提示 -->
    <div class="gift-membership-balance-hint">
      <div class="gift-membership-balance-label">当前余额</div>
      <div class="gift-membership-balance-amount">¥ ${balance.toFixed(2)}</div>
    </div>
    
    <!-- 会员类型选择 -->
    <div class="gift-membership-section">
      <div class="gift-membership-section-title">选择会员类型</div>
      
      <!-- VIP选项 -->
      <div class="gift-membership-tier-group">
        <div class="gift-membership-tier-header vip">
          <i class="fa-solid fa-crown"></i>
          <span>VIP会员</span>
        </div>
        <div class="gift-membership-options">
          ${createOptionHTML('vip_month', balance)}
          ${createOptionHTML('vip_year', balance)}
        </div>
      </div>
      
      <!-- SVIP选项 -->
      <div class="gift-membership-tier-group">
        <div class="gift-membership-tier-header svip">
          <i class="fa-solid fa-crown"></i>
          <span>SVIP会员</span>
        </div>
        <div class="gift-membership-options">
          ${createOptionHTML('svip_month', balance)}
          ${createOptionHTML('svip_year', balance)}
        </div>
      </div>
    </div>
  `;

  return form;
}

/**
 * 创建底部按钮区（固定）
 * 
 * @returns {HTMLElement} 底部按钮容器
 */
function createBottomButton() {
  const bottom = document.createElement('div');
  bottom.className = 'gift-membership-bottom';

  bottom.innerHTML = `
    <button class="gift-membership-btn-submit" id="gift-membership-submit-btn" disabled>
      选择会员类型
    </button>
  `;

  return bottom;
}

/**
 * 创建会员选项HTML
 * 
 * @param {string} optionKey - 选项键名
 * @param {number} balance - 当前余额
 * @returns {string} HTML字符串
 */
function createOptionHTML(optionKey, balance) {
  const option = MEMBERSHIP_PRICES[optionKey];
  const canAfford = balance >= option.price;
  const disabledClass = !canAfford ? 'disabled' : '';
  const discountTag = option.duration === 365 ? '<span class="discount-tag">9折</span>' : '';
  const durationText = option.months === 1 ? '1个月' : '1年';

  return `
    <div class="gift-membership-option ${disabledClass}" data-option="${optionKey}">
      <div class="option-info">
        <div class="option-label">${option.label}${discountTag}</div>
        <div class="option-duration">${durationText}</div>
      </div>
      <div class="option-price">¥${option.price}</div>
    </div>
  `;
}

/**
 * 创建错误视图
 * 
 * @returns {DocumentFragment}
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'gift-membership-page';
  container.innerHTML = '<div class="gift-membership-error">无法加载会员送礼页面</div>';
  fragment.appendChild(container);
  return fragment;
}

/**
 * 绑定事件
 * 
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 */
function bindEvents(container, contactId, contact) {
  // 返回按钮
  const backBtn = container.querySelector('.gift-membership-btn-back');
  backBtn?.addEventListener('click', handleBack);

  // 会员选项点击
  const options = container.querySelectorAll('.gift-membership-option:not(.disabled)');
  options.forEach(option => {
    option.addEventListener('click', () => handleOptionClick(container, option));
  });

  // 送会员按钮
  const submitBtn = container.querySelector('#gift-membership-submit-btn');
  submitBtn?.addEventListener('click', () => handleSubmit(container, contactId, contact));
}

/**
 * 处理返回
 */
function handleBack() {
  logger.info('phone','[GiftMembershipUI] 点击返回');
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'gift-membership');
    });
  }
}

/**
 * 处理选项点击
 * 
 * @param {HTMLElement} container - 页面容器
 * @param {HTMLElement} optionElement - 选项元素
 */
function handleOptionClick(container, optionElement) {
  const optionKey = optionElement.dataset.option;
  logger.debug('phone','[GiftMembershipUI] 选择会员选项:', optionKey);

  // 清除其他选项的选中状态
  container.querySelectorAll('.gift-membership-option').forEach(opt => {
    opt.classList.remove('selected');
  });

  // 选中当前选项
  optionElement.classList.add('selected');

  // 更新按钮状态
  const submitBtn = container.querySelector('#gift-membership-submit-btn');
  const option = MEMBERSHIP_PRICES[optionKey];
  
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = `送${option.months}个月${option.label.includes('VIP') ? 'VIP' : 'SVIP'}会员 ¥${option.price}`;
    submitBtn.dataset.selectedOption = optionKey;
  }
}

/**
 * 处理提交（送会员）
 * 
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 */
async function handleSubmit(container, contactId, contact) {
  const submitBtn = container.querySelector('#gift-membership-submit-btn');
  const optionKey = submitBtn?.dataset.selectedOption;

  if (!optionKey) {
    showPhoneToast('error', '请选择会员类型');
    return;
  }

  const option = MEMBERSHIP_PRICES[optionKey];
  logger.info('phone','[GiftMembershipUI] 准备送会员:', option);

  try {
    // 禁用按钮，防止重复提交
    if (submitBtn) submitBtn.disabled = true;

    // 验证余额
    const balance = await getBalance();
    if (balance < option.price) {
      showPhoneToast('error', '余额不足，请先充值');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    // 扣除余额
    await subtractBalance(option.price);
    logger.debug('phone','[GiftMembershipUI] 余额已扣除:', option.price);

    // 给角色开通会员
    await grantCharacterMembership(contactId, option.type, option.duration, {
      from: 'user-gift',
      price: option.price
    });
    logger.debug('phone','[GiftMembershipUI] 角色会员已开通');

    // 创建会员送礼消息
    const message = {
      id: generateMessageId(),
      sender: 'user',
      type: 'gift-membership',
      membershipType: option.type,
      duration: option.duration,
      months: option.months,
      price: option.price,  // 价格（用于交易记录）
      content: `送你${option.months}个月的${option.label.includes('VIP') ? 'VIP' : 'SVIP'}会员`,
      time: Math.floor(Date.now() / 1000)
    };

    // 1. 保存消息到聊天数据库
    const { saveChatMessage } = await import('./message-chat-data.js');
    await saveChatMessage(contactId, message);
    logger.debug('phone','[GiftMembershipUI] 消息已保存到ChatData');

    // 2. 添加到待处理队列
    await addPendingMessage(contactId, message);
    logger.debug('phone','[GiftMembershipUI] 消息已添加到待处理队列');

    // 在聊天页显示用户送会员气泡（如果聊天页存在）
    logger.debug('phone','[GiftMembershipUI] ========== 在聊天页显示送会员消息 ==========');
    const safeChatPageId = `page-chat-${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const chatPage = /** @type {HTMLElement} */ (document.querySelector(`#${safeChatPageId}`));
    
    if (chatPage && chatPage.isConnected) {
      logger.debug('phone','[GiftMembershipUI] 聊天页已连接到DOM，准备添加送会员消息');
      try {
        const { appendMessageToChat } = await import('./message-chat-ui.js');
        await appendMessageToChat(chatPage, message, contact, contactId);
        logger.info('phone','[GiftMembershipUI] ✅ 已在聊天页显示用户送会员气泡');
      } catch (error) {
        logger.error('phone','[GiftMembershipUI] ❌ 添加送会员消息到聊天页失败:', error.message);
      }
    } else {
      logger.warn('phone','[GiftMembershipUI] 聊天页未连接到DOM，跳过添加消息');
    }

    // 显示成功提示
    const displayName = getContactDisplayName(contact);
    showPhoneToast('success', `已送${displayName} ${option.months}个月${option.label.includes('VIP') ? 'VIP' : 'SVIP'}会员`);

    // 返回聊天页
    setTimeout(() => {
      handleBack();
    }, 500);

  } catch (error) {
    logger.error('phone','[GiftMembershipUI] 送会员失败:', error);
    showPhoneToast('error', '送会员失败，请稍后重试');
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * 绑定钱包数据变化监听器
 * 
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 */
function bindWalletChangeListener(container, contactId) {
  const pageId = `gift-membership-${contactId}`;
  
  // 订阅钱包数据变化
  stateManager.subscribe(pageId, 'wallet', async (meta) => {
    logger.debug('phone','[GiftMembershipUI] 收到钱包数据变化通知', meta);

    // 检查页面是否还存在
    if (!document.contains(container)) {
      logger.debug('phone','[GiftMembershipUI] 页面已关闭，跳过刷新');
      return;
    }
    
    // 读取最新余额
    const walletData = await stateManager.get('wallet');
    if (!walletData) return;
    const balance = walletData.balance;

    // 更新余额显示
    const balanceElement = container.querySelector('.gift-membership-balance-amount');
    if (balanceElement) {
      balanceElement.textContent = `￥ ${balance.toFixed(2)}`;
      logger.debug('phone','[GiftMembershipUI] 余额显示已更新:', balance);
    }

    // 更新选项的 disabled 状态
    const options = container.querySelectorAll('.membership-option');
    options.forEach(option => {
      const optionKey = option.dataset.option;
      const price = MEMBERSHIP_PRICES[optionKey]?.price || 0;
      
      if (balance < price) {
        option.classList.add('disabled');
      } else {
        option.classList.remove('disabled');
      }
    });
  });

  // 监听页面移除，自动清理订阅
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === container || node.contains?.(container)) {
          stateManager.unsubscribeAll(pageId);
          observer.disconnect();
          logger.debug('phone','[GiftMembershipUI] 页面已关闭，已清理订阅');
          return;
        }
      }
    }
  });
  const parent = container.parentElement;
  if (parent) {
    observer.observe(parent, { childList: true, subtree: true });
  }
}
