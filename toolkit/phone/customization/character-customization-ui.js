/**
 * 角色专属装扮页面
 *
 * @description
 * 为特定角色设置专属装扮（用户气泡、角色气泡）
 * 优先级高于全局装扮
 *
 * @module character-customization-ui
 */

import logger from '../../../logger.js';
import { BUBBLE_CATEGORIES } from './customization-config.js';
import { isItemOwned } from './customization-purchase.js';
import { showConfirmPopup } from '../utils/popup-helper.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';

/**
 * 渲染角色专属装扮页面
 *
 * @param {Object} params - 参数对象
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 页面DOM片段
 */
export async function renderCharacterCustomizationPage(params) {
  const { contactId } = params;
  logger.info('phone','[CharacterCustomization] 渲染角色专属装扮页面:', contactId);

  // 加载联系人信息
  const { loadContacts } = await import('../contacts/contact-list-data.js');
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  if (!contact) {
    logger.error('phone','[CharacterCustomization] 联系人不存在:', contactId);
    return createErrorView();
  }

  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'character-customization-wrapper';
  container.dataset.contactId = contactId;

  const displayName = getContactDisplayName(contact);

  // 渲染页面结构
  container.innerHTML = `
    <div class="character-customization-topbar">
      <button class="character-customization-back-btn">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <div class="character-customization-title">个性装扮</div>
    </div>

    <div class="character-customization-tabs">
      <button class="character-customization-tab active" data-tab="bubble">气泡</button>
      <button class="character-customization-tab" data-tab="avatar">头像挂件</button>
      <button class="character-customization-tab" data-tab="transfer">转账</button>
      <button class="character-customization-tab" data-tab="gift-membership">赠送会员</button>
      <button class="character-customization-tab" data-tab="plan">计划</button>
      <button class="character-customization-tab" data-tab="plan-story">计划故事</button>
      <button class="character-customization-tab" data-tab="signature">个签</button>
    </div>

    <div class="character-customization-content">
      <div class="character-customization-tab-content active" data-content="bubble">
        <div class="character-customization-hint">
          设置与【${displayName}】对话时的消息气泡样式
        </div>
        <div class="character-customization-bubble-grid"></div>
      </div>

      <div class="character-customization-tab-content" data-content="avatar" style="display: none;">
        <div class="character-customization-empty">头像挂件功能开发中...</div>
      </div>

      <div class="character-customization-tab-content" data-content="transfer" style="display: none;">
        <div class="character-customization-empty">转账样式功能开发中...</div>
      </div>

      <div class="character-customization-tab-content" data-content="gift-membership" style="display: none;">
        <div class="character-customization-empty">赠送会员样式功能开发中...</div>
      </div>

      <div class="character-customization-tab-content" data-content="plan" style="display: none;">
        <div class="character-customization-empty">计划样式功能开发中...</div>
      </div>

      <div class="character-customization-tab-content" data-content="plan-story" style="display: none;">
        <div class="character-customization-empty">计划故事样式功能开发中...</div>
      </div>

      <div class="character-customization-tab-content" data-content="signature" style="display: none;">
        <div class="character-customization-empty">个签样式功能开发中...</div>
      </div>
    </div>
  `;

  // 绑定返回按钮
  bindBackButton(container);

  // 绑定标签切换
  bindTabSwitch(container);

  // 渲染气泡列表
  await renderBubbleGrid(container, contactId);

  fragment.appendChild(container);
  return fragment;
}

/**
 * 绑定返回按钮事件
 * @param {HTMLElement} container - 页面容器
 */
function bindBackButton(container) {
  const backBtn = container.querySelector('.character-customization-back-btn');
  backBtn.addEventListener('click', () => {
    logger.info('phone','[CharacterCustomization] 点击返回按钮');
    const overlay = document.querySelector('.phone-overlay');
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlay, 'character-customization');
    });
  });
}

/**
 * 绑定标签切换事件
 * @param {HTMLElement} container - 页面容器
 */
function bindTabSwitch(container) {
  const tabs = container.querySelectorAll('.character-customization-tab');
  const contents = container.querySelectorAll('.character-customization-tab-content');
  const contactId = container.dataset.contactId;

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const tabName = tab.dataset.tab;
      logger.debug('phone',`[CharacterCustomization] 切换标签: ${tabName}`);

      // 更新标签激活状态
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 更新内容显示
      contents.forEach(content => {
        if (content.dataset.content === tabName) {
          content.classList.add('active');
          content.style.display = 'block';
        } else {
          content.classList.remove('active');
          content.style.display = 'none';
        }
      });

      // 只有气泡标签需要渲染列表
      if (tabName === 'bubble') {
        await renderBubbleGrid(container, contactId);
      }
    });
  });
}

/**
 * 渲染气泡网格
 *
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 */
async function renderBubbleGrid(container, contactId) {
  const content = container.querySelector(`[data-content="bubble"]`);
  const grid = content.querySelector('.character-customization-bubble-grid');

  // 清空旧内容
  grid.innerHTML = '';

  // 获取所有已购买的气泡
  const ownedBubbles = await getOwnedBubbles();

  if (ownedBubbles.length === 0) {
    grid.innerHTML = '<div class="character-customization-empty">暂无已购买的装扮</div>';
    return;
  }

  // 渲染气泡
  for (const bubble of ownedBubbles) {
    const item = createBubbleItem(bubble, contactId);
    grid.appendChild(item);
  }

  logger.debug('phone',`[CharacterCustomization] 已渲染 ${ownedBubbles.length} 个气泡`);
}

/**
 * 获取所有已购买的气泡
 * @returns {Promise<Array>} 已购买的气泡列表
 */
async function getOwnedBubbles() {
  const ownedBubbles = [];

  // 遍历所有分类
  for (const category of Object.values(BUBBLE_CATEGORIES)) {
    if (category.id === 'custom') continue; // 跳过自定义分类

    for (const bubble of category.bubbles) {
      const owned = await isItemOwned(bubble.id);
      if (owned) {
        ownedBubbles.push(bubble);
      }
    }
  }

  return ownedBubbles;
}

/**
 * 创建气泡装扮项
 *
 * @param {Object} bubble - 气泡配置
 * @param {string} contactId - 联系人ID
 * @returns {HTMLElement} 气泡项元素
 */
function createBubbleItem(bubble, contactId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'character-customization-bubble-wrapper';
  wrapper.dataset.bubbleId = bubble.id;

  const item = document.createElement('div');
  item.className = 'character-customization-bubble-item';

  item.innerHTML = `
    <div class="character-customization-bubble-preview">
      <div class="character-customization-bubble-sample" style="${getCSSString(bubble.css)}">
        大家好！
      </div>
    </div>
    <div class="character-customization-bubble-name">${bubble.name}</div>
  `;

  wrapper.appendChild(item);

  // 绑定点击事件
  wrapper.addEventListener('click', () => {
    handleBubbleClick(bubble, contactId);
  });

  return wrapper;
}

/**
 * 处理气泡点击事件
 *
 * @description
 * 弹出选择弹窗，让用户选择将气泡应用为"我的消息气泡"还是"角色的消息气泡"
 *
 * @async
 * @param {Object} bubble - 气泡配置对象
 * @param {string} contactId - 联系人ID
 */
async function handleBubbleClick(bubble, contactId) {
  logger.info('phone',`[CharacterCustomization] 点击气泡: ${bubble.name}`);

  // 加载联系人信息
  const { loadContacts } = await import('../contacts/contact-list-data.js');
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);
  const displayName = getContactDisplayName(contact);

  // 显示选择弹窗：应用为用户气泡还是角色气泡
  const { showCustomPopupWithData } = await import('../utils/popup-helper.js');

  const contentHTML = `
    <div style="text-align: center; padding: 1em;">
      <div style="margin-bottom: 1em; color: var(--phone-text-secondary);">
        将【${bubble.name}】应用为：
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.75em;">
        <button class="popup-action-btn" data-action="user" style="padding: 0.75em; background: var(--phone-primary); color: white; border: none; border-radius: 0.5em; cursor: pointer;">
          我的消息气泡
        </button>
        <button class="popup-action-btn" data-action="character" style="padding: 0.75em; background: var(--phone-bg-white); color: var(--phone-text-primary); border: 1px solid var(--phone-border); border-radius: 0.5em; cursor: pointer;">
          【${displayName}】的消息气泡
        </button>
      </div>
    </div>
  `;

  // 用于存储用户选择的结果
  let selectedAction = null;

  const result = await showCustomPopupWithData('应用装扮', contentHTML, {
    showClose: true,
    onShow: (overlay) => {
      // 弹窗显示后，绑定按钮点击事件
      const buttons = overlay.querySelectorAll('.popup-action-btn');
      const closeBtn = overlay.querySelector('.phone-popup-close');

      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          selectedAction = btn.dataset.action;
          // 手动触发关闭
          closeBtn?.click();
        });
      });
    },
    beforeClose: (buttonValue, overlay) => {
      // 返回用户选择的结果
      return selectedAction;
    }
  });

  if (!result) {
    logger.debug('phone','[CharacterCustomization] 用户取消应用');
    return;
  }

  // 应用装扮
  const bubbleType = result === 'user' ? 'userBubble' : 'characterBubble';
  await applyCharacterBubble(contactId, bubbleType, bubble.id);

  const targetName = result === 'user' ? '你的消息气泡' : `【${displayName}】的消息气泡`;
  toastr.success(`已应用为${targetName}！`);
  logger.info('phone','[CharacterCustomization] 装扮已应用:', bubble.name, bubbleType);
}

/**
 * 应用角色专属气泡
 *
 * @param {string} contactId - 联系人ID
 * @param {string} bubbleType - 气泡类型（'userBubble' / 'characterBubble'）
 * @param {string} bubbleId - 气泡ID
 */
async function applyCharacterBubble(contactId, bubbleType, bubbleId) {
  const { loadData, saveData } = await import('../data-storage/storage-api.js');
  const { stateManager } = await import('../utils/state-manager.js');

  // 获取角色装扮数据
  let characterCustomization = await loadData('characterCustomization');
  if (!characterCustomization) {
    characterCustomization = {};
  }

  // 确保角色数据存在
  if (!characterCustomization[contactId]) {
    characterCustomization[contactId] = {
      userBubble: 'default',
      characterBubble: 'default',
      avatar: 'default',
      theme: 'default'
    };
  }

  // 更新气泡
  characterCustomization[contactId][bubbleType] = bubbleId;

  // 保存数据
  await stateManager.set('characterCustomization', characterCustomization, {
    action: 'applyCharacterBubble',
    contactId,
    bubbleType,
    bubbleId
  });

  // 立即应用样式到body（CSS会自动匹配聊天页面的气泡）
  const { applyBubbleThemeForCharacter } = await import('./customization-apply.js');
  await applyBubbleThemeForCharacter(contactId);

  logger.info('phone','[CharacterCustomization] 角色专属装扮已保存:', contactId, bubbleType, bubbleId);
}

/**
 * 将CSS对象转换为字符串
 * @param {Object} cssObj - CSS规则对象
 * @returns {string} CSS字符串
 */
function getCSSString(cssObj) {
  return Object.entries(cssObj)
    .map(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${cssKey}: ${value}`;
    })
    .join('; ');
}

/**
 * 创建错误视图
 * @returns {DocumentFragment} 错误视图片段
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'character-customization-error';
  error.textContent = '加载失败';
  fragment.appendChild(error);
  return fragment;
}
