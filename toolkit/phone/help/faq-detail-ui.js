/**
 * 常见问题详细页面
 * @module phone/help/faq-detail-ui
 */

import logger from '../../../logger.js';

/**
 * 渲染常见问题详细页
 * 
 * @description
 * 返回页面内容片段（DocumentFragment），由 phone-main-ui.js 创建外层容器
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderFaqDetail() {
  logger.info('[FaqDetail] 开始渲染常见问题详细页');

  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'faq-detail-wrapper';

  // 创建页面内容
  container.innerHTML = `
    <!-- 顶部栏 -->
    <div class="faq-detail-topbar">
      <button class="faq-detail-back-btn">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <div class="faq-detail-title">常见问题</div>
    </div>

    <!-- 内容区（可滚动） -->
    <div class="faq-detail-content">
      <!-- 临时说明（置顶显示） -->
      <div class="faq-section">
        <div class="faq-section-title">
          <i class="fa-solid fa-book"></i>
          <span>临时简陋说明</span>
        </div>
        <div class="faq-section-content">
          <h4></h4>
          <p class="faq-note">
            <i class="fa-solid fa-circle-info"></i>
            如果需要玩耍，尽量了解以下内容，手打所以无逻辑很混乱，造成的阅读不便先道歉
          </p>

          <ol>
            <li>开始玩之前你需要点一下预设右上角的重置来确认预设是最新的</li>
            <li>可以点击的就是做了，点击没反应的就是还没做</li>
            <li>千万不要删除好友，我暂时还没写好，删除可能会加不回来！</li>
            <li>所有的问题可以试着刷新网页再看或者切出当前页面再回来解决看看</li>
            <li>它能关联酒馆，在每个角色提示词设置的位置你可以获取和设置是否开启酒馆上下文，从酒馆快速获取手机聊天记录请看宏变量使用教程</li>
            <li>你可以从世界书选择添加哪些条目，一些状态栏和与角色人设相关的条目可以不勾选，和人设相关、世界观、NPC等可以尝试放进去</li>
            <li>世界观的部分推荐放角色设定上方，从整体到局部，从上至下排序，你认为重要的部分可以放在靠下位置</li>
            <li>酒馆上下文的文和历史聊天记录的位置也请自由决定</li>
            <li>如何使用宏交给你了，我暂时只有精力做到调取它</li>
          </ol>

          <p class="faq-tip">
            <i class="fa-solid fa-lightbulb"></i>
            <strong>占位</strong>
          </p>
          <ul>
            <li>谢谢你的使用和对待我低能量的溺爱。</li>
          </ul>
        </div>
      </div>

      <!-- 角色导入相关 -->
      <div class="faq-section">
        <div class="faq-section-title">
          <i class="fa-solid fa-user-plus"></i>
          <span>角色导入相关</span>
        </div>
        <div class="faq-section-content">
          <h4>Q: 可以导入多张同名的角色卡吗？</h4>
          <p class="faq-warning">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>不建议导入同名角色卡！</strong>
          </p>
          <p>原因：</p>
          <p>系统会自动为同名角色生成不同的 ID：</p>
          <div class="faq-code-block">
            <code>tavern_角色名</code>
          </div>
          <div class="faq-code-block">
            <code>tavern_角色名1</code>
          </div>
          <p><strong>这会导致以下问题：</strong></p>
          <ul>
            <li>在联系人列表中，两个角色会显示相同的名称，难以区分</li>
            <li>可能导致聊天记录混乱，发送消息时不确定是哪个角色</li>
            <li>个性签名、约定计划等数据可能关联错误</li>
          </ul>
          <p class="faq-tip">
            <i class="fa-solid fa-lightbulb"></i>
            <strong>建议做法：</strong>
          </p>
          <ul>
            <li>在 SillyTavern 主界面中，先给角色卡改名（如"夏洛克·福尔摩斯（BBC版）"）</li>
            <li>确保每个角色卡的名称都是唯一的</li>
            <li>然后再通过"新朋友"功能同意好友申请</li>
          </ul>
          <p class="faq-note">
            <i class="fa-solid fa-circle-info"></i>
            如果已经导入了同名角色，建议删除其中一个，或在 SillyTavern 主界面中修改角色名称后重新导入。
          </p>
        </div>
      </div>

    </div>
  `;

  // 绑定事件
  bindEvents(container);

  fragment.appendChild(container);

  logger.info('[FaqDetail] 常见问题详细页渲染完成');
  return fragment;
}

/**
 * 绑定事件监听器
 * 
 * @private
 * @param {HTMLElement} container - 页面容器
 */
function bindEvents(container) {
  logger.debug('[FaqDetail] 绑定事件');

  // 返回按钮
  const backBtn = container.querySelector('.faq-detail-back-btn');
  backBtn.addEventListener('click', handleBack);
}

/**
 * 处理返回
 * @private
 */
function handleBack() {
  logger.info('[FaqDetail] 点击返回');
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement instanceof HTMLElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'faq-detail');
    });
  } else {
    logger.warn('[FaqDetail] 未找到可用的 overlayElement，返回动作被跳过');
  }
}

