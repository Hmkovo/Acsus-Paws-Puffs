/**
 * 表情包详细说明页面
 * @module phone/emojis/emoji-guide-detail-ui
 */

import logger from '../../../logger.js';

/**
 * 渲染表情包详细说明页
 * 
 * @description
 * 返回页面内容片段（DocumentFragment），由 phone-main-ui.js 创建外层容器
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderEmojiGuideDetail() {
  logger.info('[EmojiGuideDetail] 开始渲染表情包详细说明页');

  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'emoji-guide-detail-wrapper';

  // 创建页面内容
  container.innerHTML = `
    <!-- 顶部栏 -->
    <div class="emoji-guide-detail-topbar">
      <button class="emoji-guide-detail-back-btn">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <div class="emoji-guide-detail-title">表情包说明</div>
    </div>

    <!-- 内容区（可滚动） -->
    <div class="emoji-guide-detail-content">
      <!-- 存储位置说明 -->
      <div class="emoji-guide-section">
        <div class="emoji-guide-section-title">
          <i class="fa-solid fa-folder-open"></i>
          <span>表情包存储位置</span>
        </div>
        <div class="emoji-guide-section-content">
          <p>表情包图片存储在以下位置：</p>
          <div class="emoji-guide-code-block">
            <code>SillyTavern/data/default-user/user/files/</code>
          </div>
          <p>文件名格式：</p>
          <div class="emoji-guide-code-block">
            <code>acsus-paws-puffs_emoji_{时间戳}.{扩展名}</code>
          </div>
          <p class="emoji-guide-note">
            <i class="fa-solid fa-circle-info"></i>
            注意：所有以 <code>acsus-paws-puffs_emoji_</code> 开头的文件都是本扩展的表情包
          </p>
        </div>
      </div>

      <!-- 使用教程 -->
      <div class="emoji-guide-section">
        <div class="emoji-guide-section-title">
          <i class="fa-solid fa-book"></i>
          <span>使用教程</span>
        </div>
        <div class="emoji-guide-section-content">
          <h4>添加表情包</h4>
          <ol>
            <li>在聊天界面点击表情按钮 <i class="fa-regular fa-face-smile"></i></li>
            <li>点击表情面板右下角的 <i class="fa-solid fa-plus"></i> 按钮</li>
            <li>在表情包管理页面点击右上角的 <i class="fa-solid fa-plus"></i></li>
            <li>选择"本地文件"或"URL链接"方式上传</li>
            <li>输入表情包名称（如"企鹅震惊"）</li>
            <li>点击确认完成添加</li>
          </ol>

          <h4>发送表情包</h4>
          <ol>
            <li>在聊天界面点击表情按钮 <i class="fa-regular fa-face-smile"></i></li>
            <li>在表情面板中点击想要发送的表情包</li>
            <li>表情包会自动发送到聊天窗口</li>
          </ol>

          <h4>管理表情包</h4>
          <ol>
            <li>在表情包管理页面点击右上角的"管理"按钮</li>
            <li>选择要删除的表情包</li>
            <li>点击底部的"删除"按钮</li>
            <li>确认后表情包将被永久删除</li>
          </ol>
        </div>
      </div>

      <!-- 手动删除说明 -->
      <div class="emoji-guide-section">
        <div class="emoji-guide-section-title">
          <i class="fa-solid fa-trash"></i>
          <span>手动清理表情包</span>
        </div>
        <div class="emoji-guide-section-content">
          <p>如果需要手动清理所有表情包文件，请按照以下步骤操作：</p>
          <ol>
            <li>关闭 SillyTavern 服务器</li>
            <li>打开文件管理器，导航到：
              <div class="emoji-guide-code-block">
                <code>SillyTavern/data/default-user/user/files/</code>
              </div>
            </li>
            <li>找到所有以 <code>acsus-paws-puffs_emoji_</code> 开头的文件</li>
            <li>删除这些文件</li>
            <li>重启 SillyTavern</li>
          </ol>
          <p class="emoji-guide-warning">
            <i class="fa-solid fa-triangle-exclamation"></i>
            警告：手动删除文件后，扩展配置中的表情包记录仍然存在。建议在扩展内使用"管理"功能删除。
          </p>
        </div>
      </div>

      <!-- 常见问题 -->
      <div class="emoji-guide-section">
        <div class="emoji-guide-section-title">
          <i class="fa-solid fa-circle-question"></i>
          <span>常见问题</span>
        </div>
        <div class="emoji-guide-section-content">
          <h4>Q: 表情包可以改名吗？</h4>
          <p>A: 可以。在表情包管理页面点击表情包图片，选择"编辑"即可修改名称。</p>

          <h4>Q: 表情包会占用很多空间吗？</h4>
          <p>A: 不会。表情包以原始尺寸存储，建议使用压缩过的图片（如 WebP 格式）以节省空间。</p>

          <h4>Q: 卸载扩展后表情包会被删除吗？</h4>
          <p>A: 不会自动删除。图片文件仍保留在 <code>user/files/</code> 文件夹中，需要手动清理。</p>

          <h4>Q: 扩展更新会影响表情包吗？</h4>
          <p>A: 不会。表情包存储在 SillyTavern 官方文件夹（<code>user/files/</code>）中，而不在扩展文件夹里。更新扩展时，已添加的表情包和配置都会保留。</p>

          <h4>Q: AI 可以发送表情包吗？</h4>
          <p>A: 可以！AI 使用格式 <code>[表情]表情包名称</code> 来发送表情包。例如：<code>[表情]企鹅震惊</code></p>
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  bindEvents(container);

  fragment.appendChild(container);

  logger.info('[EmojiGuideDetail] 表情包详细说明页渲染完成');
  return fragment;
}

/**
 * 绑定事件监听器
 * 
 * @private
 * @param {HTMLElement} container - 页面容器
 */
function bindEvents(container) {
  logger.debug('[EmojiGuideDetail] 绑定事件');

  // 返回按钮
  const backBtn = container.querySelector('.emoji-guide-detail-back-btn');
  backBtn.addEventListener('click', handleBack);
}

/**
 * 处理返回
 * @private
 */
function handleBack() {
  logger.info('[EmojiGuideDetail] 点击返回');
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'emoji-guide-detail');
    });
  }
}

