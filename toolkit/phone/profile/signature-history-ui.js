/**
 * 个性签名历史页面
 * @module phone/profile/signature-history-ui
 * 
 * @description
 * 显示用户或角色的个性签名历史记录
 * 支持：
 * - 查看所有历史个签
 * - 删除单条个签
 * - 点赞/评论角色个签（角色模式）
 */

import logger from '../../../logger.js';
import {
  loadUserSignature,
  loadContactSignature,
  deleteUserSignatureHistory,
  deleteContactSignatureHistory,
  toggleContactSignatureLike,
  addContactSignatureComment,
  deleteContactSignatureComment
} from './signature-data.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { formatTimestamp } from '../utils/time-helper.js';
import { showCustomPopup, showInputPopup } from '../utils/popup-helper.js';
import { showSuccessToast, showWarningToast, showErrorToast } from '../ui-components/toast-notification.js';
import { getUserDisplayName } from '../utils/contact-display-helper.js';

// 当前打开的页面参数（用于事件监听刷新）
let currentPageParams = null;
let refreshHandler = null;

/**
 * 渲染个签历史页面
 * 
 * @async
 * @param {Object} params - 页面参数
 * @param {string} params.targetType - 目标类型（'user' 或 'contact'）
 * @param {string} [params.contactId] - 角色ID（targetType='contact'时必需）
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderSignatureHistory(params) {
  const { targetType, contactId } = params;

  logger.info('[SignatureHistory] 渲染个签历史页面:', { targetType, contactId });

  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'signature-history-page';

  try {
    // 加载数据
    let signatureData, targetName;

    if (targetType === 'user') {
      signatureData = await loadUserSignature();
      targetName = getUserDisplayName();
    } else if (targetType === 'contact') {
      if (!contactId) {
        throw new Error('角色模式需要contactId参数');
      }
      signatureData = await loadContactSignature(contactId);

      // 获取角色名字
      const contacts = await loadContacts();
      const contact = contacts.find(c => c.id === contactId);
      targetName = contact ? (contact.remark || contact.name) : '未知角色';
    } else {
      throw new Error('无效的targetType');
    }

    // 创建顶部栏
    container.appendChild(createTopBar(targetName));

    // 创建内容区
    const contentContainer = document.createElement('div');
    contentContainer.className = 'signature-history-content';

    // 当前个签卡片
    if (signatureData.current) {
      contentContainer.appendChild(createCurrentSignatureCard(signatureData.current, targetType));
    }

    // 历史列表
    contentContainer.appendChild(createHistoryList(signatureData.history, targetType, contactId));

    container.appendChild(contentContainer);

    // 绑定事件
    bindEvents(container, targetType, contactId);

    // 设置事件监听和刷新逻辑
    setupAutoRefresh(container, targetType, contactId);

    fragment.appendChild(container);
    logger.info('[SignatureHistory] 页面渲染完成');
    return fragment;
  } catch (error) {
    logger.error('[SignatureHistory] 渲染失败:', error);
    return createErrorView(error.message);
  }
}

/**
 * 创建顶部栏
 * @param {string} targetName - 目标名称
 * @returns {HTMLElement}
 */
function createTopBar(targetName) {
  const topBar = document.createElement('div');
  topBar.className = 'signature-history-topbar';

  topBar.innerHTML = `
    <button class="signature-history-back-btn">
      <i class="fa-solid fa-chevron-left"></i>
    </button>
    <div class="signature-history-title">${targetName}的个性签名</div>
    <button class="signature-history-settings-btn">
      <i class="fa-solid fa-cog"></i>
    </button>
  `;

  return topBar;
}

/**
 * 创建当前个签卡片
 * @param {string} currentSignature - 当前个签
 * @param {string} targetType - 目标类型
 * @returns {HTMLElement}
 */
function createCurrentSignatureCard(currentSignature, targetType) {
  const card = document.createElement('div');
  card.className = 'signature-current-card';

  card.innerHTML = `
    <div class="signature-current-label">当前个签</div>
    <div class="signature-current-text">${currentSignature}</div>
  `;

  return card;
}

/**
 * 创建历史列表
 * @param {Array} history - 历史记录列表
 * @param {string} targetType - 目标类型
 * @param {string} contactId - 角色ID
 * @returns {HTMLElement}
 */
function createHistoryList(history, targetType, contactId) {
  const listContainer = document.createElement('div');
  listContainer.className = 'signature-history-list';

  if (!history || history.length === 0) {
    listContainer.innerHTML = `
      <div class="signature-history-empty">
        <i class="fa-solid fa-inbox"></i>
        <p>暂无历史记录</p>
      </div>
    `;
    return listContainer;
  }

  // 标题
  const header = document.createElement('div');
  header.className = 'signature-history-list-header';
  header.textContent = '历史记录';
  listContainer.appendChild(header);

  // 列表项
  history.forEach((item) => {
    listContainer.appendChild(createHistoryItem(item, targetType, contactId));
  });

  return listContainer;
}

/**
 * 创建历史项
 * @param {Object} item - 历史记录对象
 * @param {string} targetType - 目标类型
 * @param {string} contactId - 角色ID
 * @returns {HTMLElement}
 */
function createHistoryItem(item, targetType, contactId) {
  const itemElement = document.createElement('div');
  itemElement.className = 'signature-history-item';
  itemElement.dataset.signatureId = item.id;

  // 是否显示互动按钮（只有角色个签才显示）
  const showInteraction = targetType === 'contact';
  const hasComments = item.comments && item.comments.length > 0;

  itemElement.innerHTML = `
    <div class="signature-history-item-content">
      <div class="signature-history-item-text">${item.content}</div>
      <div class="signature-history-item-meta">
        <span class="signature-history-item-time">${formatTimestamp(item.timestamp)}</span>
        ${showInteraction ? `
          <div class="signature-history-item-stats">
            <span class="signature-history-item-likes ${item.liked ? 'liked' : ''}" data-signature-id="${item.id}">
              <i class="fa-solid fa-heart"></i> ${item.likes}
            </span>
            <span class="signature-history-item-comments" data-signature-id="${item.id}">
              <i class="fa-solid fa-comment"></i> ${item.comments?.length || 0}
            </span>
            ${hasComments ? `
              <button class="signature-expand-btn" 
                      data-signature-id="${item.id}" 
                      title="展开详情">
                <i class="fa-solid fa-chevron-down"></i>
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>
    <div class="signature-history-item-actions">
      <button class="signature-delete-history-btn" 
              data-signature-id="${item.id}"
              title="删除">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
    ${showInteraction && hasComments ? `
      <div class="signature-comments-section" style="display: none;" data-signature-id="${item.id}">
        <div class="signature-comments-list">
          ${item.comments.map(comment => `
            <div class="signature-comment-item" data-comment-id="${comment.id}">
              <div class="signature-comment-content">
                <span class="signature-comment-from">${comment.from === 'user' ? '我' : '角色'}</span>
                <span class="signature-comment-text">${comment.content}</span>
              </div>
              <div class="signature-comment-actions">
                <span class="signature-comment-time">${formatTimestamp(comment.timestamp)}</span>
                ${comment.from === 'user' ? `
                  <button class="signature-delete-comment-btn" 
                          data-signature-id="${item.id}" 
                          data-comment-id="${comment.id}" 
                          title="删除">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  return itemElement;
}

/**
 * 绑定事件
 * @param {HTMLElement} container - 页面容器
 * @param {string} targetType - 目标类型
 * @param {string} contactId - 角色ID
 */
function bindEvents(container, targetType, contactId) {
  // 返回按钮
  const backBtn = container.querySelector('.signature-history-back-btn');
  backBtn?.addEventListener('click', handleBack);

  // 设置按钮
  const settingsBtn = container.querySelector('.signature-history-settings-btn');
  settingsBtn?.addEventListener('click', () => handleSettings(container, targetType, contactId));

  // 事件委托处理所有按钮点击
  container.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // 点击个签项（切换显示删除按钮）
    const historyItem = /** @type {HTMLElement} */ (target.closest('.signature-history-item'));
    if (historyItem) {
      // 如果点击的是按钮，跳过
      if (!target.closest('button') && !target.closest('.signature-history-item-stats span')) {
        e.stopPropagation();
        handleToggleDeleteButton(historyItem, container);
        return;
      }
    }

    // 删除历史记录按钮
    const deleteBtn = target.closest('.signature-delete-history-btn');
    if (deleteBtn) {
      e.stopPropagation();
      const signatureId = /** @type {HTMLElement} */ (deleteBtn).dataset.signatureId;
      await handleDeleteHistory(targetType, contactId, signatureId, container);
      return;
    }

    // 点赞区域（点击整个span）
    const likesSpan = target.closest('.signature-history-item-likes');
    if (likesSpan && targetType === 'contact') {
      e.stopPropagation();
      const signatureId = /** @type {HTMLElement} */ (likesSpan).dataset.signatureId;
      const likeBtn = likesSpan; // 把整个span当作按钮
      await handleToggleLike(contactId, signatureId, likeBtn);
      return;
    }

    // 评论区域（点击整个span）
    const commentsSpan = target.closest('.signature-history-item-comments');
    if (commentsSpan && targetType === 'contact') {
      e.stopPropagation();
      const signatureId = /** @type {HTMLElement} */ (commentsSpan).dataset.signatureId;
      await handleAddComment(contactId, signatureId, container);
      return;
    }

    // 展开按钮（只有角色个签）
    const expandBtn = target.closest('.signature-expand-btn');
    if (expandBtn) {
      e.stopPropagation();
      const signatureId = /** @type {HTMLElement} */ (expandBtn).dataset.signatureId;
      handleToggleExpand(signatureId, expandBtn, container);
      return;
    }

    // 删除评论按钮
    const deleteCommentBtn = target.closest('.signature-delete-comment-btn');
    if (deleteCommentBtn) {
      e.stopPropagation();
      const signatureId = /** @type {HTMLElement} */ (deleteCommentBtn).dataset.signatureId;
      const commentId = /** @type {HTMLElement} */ (deleteCommentBtn).dataset.commentId;
      await handleDeleteComment(contactId, signatureId, commentId, container);
      return;
    }
  });
}

// 用于存储当前显示删除按钮的项和自动隐藏定时器
let activeSignatureItem = null;
let hideActionsTimer = null;

/**
 * 切换删除按钮显示状态（日记评论风格：3秒后自动隐藏）
 * @param {HTMLElement} clickedItem - 被点击的个签项
 * @param {HTMLElement} container - 容器元素
 */
function handleToggleDeleteButton(clickedItem, container) {
  // 先隐藏所有其他项的删除按钮
  const allItems = container.querySelectorAll('.signature-history-item');
  allItems.forEach(item => {
    if (item !== clickedItem) {
      item.classList.remove('show-actions');
    }
  });

  // 清除之前的定时器
  if (hideActionsTimer) {
    clearTimeout(hideActionsTimer);
    hideActionsTimer = null;
  }

  // 显示当前项的删除按钮
  clickedItem.classList.add('show-actions');
  activeSignatureItem = clickedItem;

  // 手机端3秒后自动隐藏
  if (window.innerWidth <= 768) {
    hideActionsTimer = setTimeout(() => {
      clickedItem.classList.remove('show-actions');
      if (activeSignatureItem === clickedItem) {
        activeSignatureItem = null;
      }
    }, 3000);
  }
}

/**
 * 处理设置
 * @async
 */
async function handleSettings(container, targetType, contactId) {
  logger.debug('[SignatureHistory] 打开设置');

  try {
    const { getSignatureHistoryDisplayCount, setSignatureHistoryDisplayCount } = await import('./signature-data.js');

    const currentCount = getSignatureHistoryDisplayCount();

    const result = await showInputPopup(
      '设置显示条数',
      currentCount.toString(),
      {
        placeholder: '请输入显示条数（1-20）',
        okButton: '确定',
        cancelButton: '取消',
        maxLength: 2,
        hint: '此设置关联预设「个签历史 - 用户个性签名」，控制发送给AI的最新个签条数（默认3条），char的个签不发送（节约token）骗你的，作者懒不想写了。'
      }
    );

    if (!result) return;

    const newCount = parseInt(result.trim());
    if (isNaN(newCount) || newCount < 1 || newCount > 20) {
      showWarningToast('请输入1-20之间的数字');
      return;
    }

    setSignatureHistoryDisplayCount(newCount);

    // 刷新页面
    const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    if (overlayElement) {
      const { showPage } = await import('../phone-main-ui.js');
      await showPage(overlayElement, 'signature-history', { targetType, contactId });
    }

    showSuccessToast(`已设置为显示 ${newCount} 条`);
    logger.info('[SignatureHistory] 显示条数已更新:', newCount);
  } catch (error) {
    logger.error('[SignatureHistory] 设置失败:', error);
    showErrorToast('设置失败，请重试');
  }
}

/**
 * 处理返回
 */
function handleBack() {
  logger.debug('[SignatureHistory] 点击返回');

  const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (overlayElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'signature-history');
    });
  }
}

/**
 * 处理删除历史记录
 * @async
 */
async function handleDeleteHistory(targetType, contactId, signatureId, container) {
  logger.debug('[SignatureHistory] 删除历史记录:', signatureId);

  try {
    // 直接删除，不需要二次确认
    let success;
    if (targetType === 'user') {
      success = await deleteUserSignatureHistory(signatureId);
    } else {
      success = await deleteContactSignatureHistory(contactId, signatureId);
    }

    if (success) {
      // 移除DOM元素
      const itemElement = container.querySelector(`.signature-history-item[data-signature-id="${signatureId}"]`);
      itemElement?.remove();

      showSuccessToast('已删除');
      logger.info('[SignatureHistory] 历史记录已删除');
    } else {
      showErrorToast('删除失败');
    }
  } catch (error) {
    logger.error('[SignatureHistory] 删除历史记录失败:', error);
    showErrorToast('删除失败，请重试');
  }
}

/**
 * 处理点赞/取消点赞
 * @async
 */
async function handleToggleLike(contactId, signatureId, likesSpan) {
  logger.debug('[SignatureHistory] 切换点赞状态:', signatureId);

  try {
    const result = await toggleContactSignatureLike(contactId, signatureId);

    if (result === null) {
      showErrorToast('操作失败');
      return;
    }

    // 更新显示状态
    const icon = likesSpan.querySelector('i');
    const currentLikes = parseInt(likesSpan.textContent.match(/\d+/)[0]);

    if (result) {
      // 已点赞
      likesSpan.classList.add('liked');
      showSuccessToast('已点赞');
      likesSpan.innerHTML = `<i class="fa-solid fa-heart"></i> ${currentLikes + 1}`;
    } else {
      // 取消点赞
      likesSpan.classList.remove('liked');
      showSuccessToast('已取消点赞');
      likesSpan.innerHTML = `<i class="fa-solid fa-heart"></i> ${Math.max(0, currentLikes - 1)}`;
    }

    // 记录到"本轮操作"
    if (result) {
      const { addSignatureAction } = await import('../ai-integration/pending-operations.js');
      const { loadContacts } = await import('../contacts/contact-list-data.js');
      const contacts = await loadContacts();
      const contact = contacts.find(c => c.id === contactId);

      addSignatureAction('like', {
        contactId,
        contactName: contact ? contact.name : contactId,
        time: Math.floor(Date.now() / 1000)
      });

      logger.info('[SignatureHistory] 点赞已记录到本轮操作');
    }

    logger.info('[SignatureHistory] 点赞状态已更新:', result ? '已点赞' : '已取消');
  } catch (error) {
    logger.error('[SignatureHistory] 切换点赞状态失败:', error);
    showErrorToast('操作失败，请重试');
  }
}

/**
 * 处理添加评论
 * @async
 */
async function handleAddComment(contactId, signatureId, container) {
  logger.debug('[SignatureHistory] 添加评论:', signatureId);

  try {
    // 弹出输入框
    const commentContent = await showInputPopup('添加评论', '', {
      placeholder: '写下你的评论...',
      maxLength: 200,
      okButton: '发送',
      cancelButton: '取消'
    });

    if (!commentContent || !commentContent.trim()) {
      return;
    }

    // 添加评论
    const comment = await addContactSignatureComment(contactId, signatureId, commentContent.trim());

    if (comment) {
      showSuccessToast('评论已发送');

      // 刷新页面（简单处理）
      const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      if (overlayElement) {
        const { showPage } = await import('../phone-main-ui.js');
        const pageElement = overlayElement.querySelector('#page-signature-history');
        if (pageElement) {
          const targetType = /** @type {HTMLElement} */ (pageElement).dataset.targetType;
          const contactId = /** @type {HTMLElement} */ (pageElement).dataset.contactId;
          await showPage(overlayElement, 'signature-history', { targetType, contactId });
        }
      }

      // 记录到"本轮操作"
      const { addSignatureAction } = await import('../ai-integration/pending-operations.js');
      const { loadContacts } = await import('../contacts/contact-list-data.js');
      const contacts = await loadContacts();
      const contact = contacts.find(c => c.id === contactId);

      addSignatureAction('comment', {
        contactId,
        contactName: contact ? contact.name : contactId,
        comment: commentContent.trim(),
        time: Math.floor(Date.now() / 1000)
      });

      logger.info('[SignatureHistory] 评论已添加并记录到本轮操作');
    } else {
      showErrorToast('评论失败');
    }
  } catch (error) {
    logger.error('[SignatureHistory] 添加评论失败:', error);
    showErrorToast('评论失败，请重试');
  }
}

/**
 * 处理展开/折叠评论区
 */
function handleToggleExpand(signatureId, expandBtn, container) {
  logger.debug('[SignatureHistory] 切换展开状态:', signatureId);

  const commentsSection = container.querySelector(`.signature-comments-section[data-signature-id="${signatureId}"]`);
  const icon = expandBtn.querySelector('i');

  if (!commentsSection) {
    return;
  }

  const isExpanded = commentsSection.style.display !== 'none';

  if (isExpanded) {
    // 折叠
    commentsSection.style.display = 'none';
    icon.className = 'fa-solid fa-chevron-down';
    expandBtn.title = '展开详情';
  } else {
    // 展开
    commentsSection.style.display = 'block';
    icon.className = 'fa-solid fa-chevron-up';
    expandBtn.title = '折叠详情';
  }
}

/**
 * 处理删除评论
 * @async
 */
async function handleDeleteComment(contactId, signatureId, commentId, container) {
  logger.debug('[SignatureHistory] 删除评论:', { signatureId, commentId });

  try {
    const success = await deleteContactSignatureComment(contactId, signatureId, commentId);

    if (success) {
      // 移除DOM元素
      const commentElement = container.querySelector(`.signature-comment-item[data-comment-id="${commentId}"]`);
      commentElement?.remove();

      // 更新评论数
      const commentsSpan = container.querySelector(
        `.signature-history-item[data-signature-id="${signatureId}"] .signature-history-item-comments`
      );
      if (commentsSpan) {
        const currentCount = parseInt(commentsSpan.textContent.match(/\d+/)[0]);
        commentsSpan.innerHTML = `<i class="fa-solid fa-comment"></i> ${Math.max(0, currentCount - 1)}`;
      }

      showSuccessToast('评论已删除');
      logger.info('[SignatureHistory] 评论已删除');
    } else {
      showErrorToast('删除失败');
    }
  } catch (error) {
    logger.error('[SignatureHistory] 删除评论失败:', error);
    showErrorToast('删除失败，请重试');
  }
}

/**
 * 创建错误视图
 * @param {string} errorMessage - 错误消息
 * @returns {DocumentFragment}
 */
function createErrorView(errorMessage) {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'signature-history-error';
  error.textContent = `加载失败：${errorMessage}`;
  fragment.appendChild(error);
  return fragment;
}

/**
 * 设置自动刷新逻辑
 * @param {HTMLElement} container - 页面容器
 * @param {string} targetType - 目标类型
 * @param {string} [contactId] - 角色ID
 */
function setupAutoRefresh(container, targetType, contactId) {
  // 保存当前页面参数
  currentPageParams = { targetType, contactId };

  // 移除旧的监听器（如果有）
  if (refreshHandler) {
    document.removeEventListener('signature-data-changed', refreshHandler);
  }

  // 创建新的监听器
  refreshHandler = async (event) => {
    const { targetType: changedType, contactId: changedContactId } = event.detail;

    // 检查是否匹配当前页面
    const isMatch =
      (targetType === 'user' && changedType === 'user') ||
      (targetType === 'contact' && changedType === 'contact' && contactId === changedContactId);

    if (!isMatch) {
      return;
    }

    logger.debug('[SignatureHistory] 检测到个签更新，刷新页面');

    try {
      // 重新加载数据
      let signatureData, targetName;

      if (targetType === 'user') {
        signatureData = await loadUserSignature();
        targetName = getUserDisplayName();
      } else {
        signatureData = await loadContactSignature(contactId);
        const contacts = await loadContacts();
        const contact = contacts.find(c => c.id === contactId);
        targetName = contact ? (contact.remark || contact.name) : '未知角色';
      }

      // 更新标题（个签内容）
      const titleElement = container.querySelector('.signature-history-title');
      if (titleElement) {
        titleElement.textContent = `${targetName}的个性签名`;
      }

      // 更新当前个签卡片
      const contentContainer = container.querySelector('.signature-history-content');
      if (contentContainer) {
        // 移除旧的当前个签卡片和历史列表
        contentContainer.innerHTML = '';

        // 重新添加当前个签卡片
        if (signatureData.current) {
          contentContainer.appendChild(createCurrentSignatureCard(signatureData.current, targetType));
        }

        // 重新添加历史列表
        contentContainer.appendChild(createHistoryList(signatureData.history, targetType, contactId));
      }

      logger.info('[SignatureHistory] 页面已刷新');
    } catch (error) {
      logger.error('[SignatureHistory] 刷新失败:', error);
    }
  };

  // 添加监听器
  document.addEventListener('signature-data-changed', refreshHandler);

  // 清理逻辑：当页面隐藏/销毁时移除监听器
  // 使用 MutationObserver 监听容器被移除
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === container || node.contains?.(container)) {
          logger.debug('[SignatureHistory] 页面已关闭，移除事件监听器');
          document.removeEventListener('signature-data-changed', refreshHandler);
          refreshHandler = null;
          currentPageParams = null;
          observer.disconnect();
          return;
        }
      }
    }
  });

  // 监听父容器的子节点变化
  const parentObserver = () => {
    const parent = container.parentElement;
    if (parent) {
      observer.observe(parent, { childList: true, subtree: true });
    } else {
      // 如果还没添加到DOM，延迟观察
      setTimeout(parentObserver, 100);
    }
  };
  parentObserver();
}

