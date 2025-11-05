/**
 * 表情包管理页面UI
 * @module phone/emojis/emoji-manager-ui
 */

import logger from '../../../logger.js';
import { getEmojis, saveEmoji, deleteEmojis } from './emoji-manager-data.js';
import { showInputPopup, showConfirmPopup, showCustomPopupWithData } from '../utils/popup-helper.js';
import { showSuccessToast, showErrorToast, showWarningToast } from '../ui-components/toast-notification.js';
import { getRequestHeaders } from '../../../../../../../script.js';

/**
 * 渲染表情包管理页面
 * 
 * @description
 * 返回页面内容片段（DocumentFragment），由 phone-main-ui.js 创建外层容器
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderEmojiManager() {
  logger.info('[EmojiManager] 开始渲染表情包管理页面');

  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'emgr-wrapper';

  // 创建顶部栏
  const header = createHeader();
  container.appendChild(header);

  // 创建内容区
  const content = document.createElement('div');
  content.className = 'emgr-content';

  // 加载并渲染表情包网格
  await loadAndRenderEmojis(content);

  container.appendChild(content);

  // 创建删除按钮浮层（隐藏，管理模式时显示）
  const deleteBar = document.createElement('div');
  deleteBar.className = 'emgr-delete-bar';
  deleteBar.style.display = 'none';
  deleteBar.innerHTML = `
        <button class="emgr-delete-btn">
            <i class="fa-solid fa-trash"></i>
            <span>删除</span>
        </button>
    `;
  container.appendChild(deleteBar);

  // 绑定事件
  bindEvents(container);

  fragment.appendChild(container);

  logger.info('[EmojiManager] 表情包管理页面渲染完成');
  return fragment;
}

/**
 * 创建顶部栏
 * @private
 * @returns {HTMLElement} 顶部栏元素
 */
function createHeader() {
  const header = document.createElement('div');
  header.className = 'emgr-header';

  header.innerHTML = `
        <button class="emgr-header-back">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="emgr-header-title">我收藏的表情</div>
        <button class="emgr-header-manage">管理</button>
    `;

  return header;
}

/**
 * 加载并渲染表情包网格
 * 
 * @async
 * @private
 * @param {HTMLElement} container - 内容容器
 */
async function loadAndRenderEmojis(container) {
  const emojis = getEmojis();

  const grid = document.createElement('div');
  grid.className = 'emgr-grid';

  // 添加按钮（第一个）
  const addBtn = document.createElement('div');
  addBtn.className = 'emgr-add-btn';
  addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
  grid.appendChild(addBtn);

  // 表情包列表
  emojis.forEach(emoji => {
    const item = createEmojiItem(emoji);
    grid.appendChild(item);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

/**
 * 创建单个表情包项
 * 
 * @private
 * @param {Object} emoji - 表情包对象
 * @returns {HTMLElement} 表情包元素
 */
function createEmojiItem(emoji) {
  const item = document.createElement('div');
  item.className = 'emgr-item';
  item.dataset.emojiId = emoji.id;
  item.dataset.emojiName = emoji.name;

  const img = document.createElement('img');
  img.src = emoji.imagePath;
  img.alt = emoji.name;

  item.appendChild(img);
  return item;
}

/**
 * 绑定事件监听器
 * 
 * @private
 * @param {HTMLElement} container - 页面容器
 */
function bindEvents(container) {
  logger.debug('[EmojiManager] 绑定事件');

  // 返回按钮
  const backBtn = container.querySelector('.emgr-header-back');
  backBtn.addEventListener('click', handleBack);

  // 管理按钮
  const manageBtn = container.querySelector('.emgr-header-manage');
  manageBtn.addEventListener('click', () => handleManageToggle(container));

  // 添加按钮
  const content = container.querySelector('.emgr-content');
  content.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const addBtn = target.closest('.emgr-add-btn');
    if (addBtn) {
      await handleAddEmoji(container);
    }
  });

  // 表情包点击（普通模式：编辑名字）
  content.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const item = target.closest('.emgr-item');
    if (item) {
      const manageBtn = container.querySelector('.emgr-header-manage');
      const isManaging = manageBtn.textContent === '完成';

      if (!isManaging) {
        // 普通模式：编辑表情名字
        await handleEditEmojiName(/** @type {HTMLElement} */(item), container);
      }
      // 管理模式：切换选中状态（通过CSS的selected类）
    }
  });

  // 删除按钮
  const deleteBtn = container.querySelector('.emgr-delete-btn');
  deleteBtn?.addEventListener('click', () => handleDeleteSelected(container));
}

/**
 * 处理返回
 * @private
 */
function handleBack() {
  logger.info('[EmojiManager] 点击返回');
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(/** @type {HTMLElement} */(overlayElement), 'emoji-manager');
    });
  }
}

/**
 * 切换管理模式
 * 
 * @private
 * @param {HTMLElement} container - 页面容器
 */
function handleManageToggle(container) {
  const manageBtn = container.querySelector('.emgr-header-manage');
  const items = container.querySelectorAll('.emgr-item');
  const deleteBar = /** @type {HTMLElement} */ (container.querySelector('.emgr-delete-bar'));

  const isManaging = manageBtn.textContent === '完成';

  if (isManaging) {
    // 退出管理模式
    manageBtn.textContent = '管理';
    items.forEach(item => item.classList.remove('selected'));
    if (deleteBar) deleteBar.style.display = 'none';
    logger.debug('[EmojiManager] 退出管理模式');
  } else {
    // 进入管理模式
    manageBtn.textContent = '完成';
    if (deleteBar) deleteBar.style.display = 'flex';
    logger.debug('[EmojiManager] 进入管理模式');

    // 绑定选择事件（点击切换选中）
    items.forEach(item => {
      const el = /** @type {HTMLElement} */ (item);
      el.addEventListener('click', function toggleSelect(e) {
        e.stopPropagation();
        this.classList.toggle('selected');
      });
    });
  }
}

/**
 * 添加新表情包
 * 
 * @async
 * @private
 * @param {HTMLElement} container - 页面容器
 */
async function handleAddEmoji(container) {
  logger.info('[EmojiManager] 点击添加表情包');

  // 自定义弹窗：命名 + 两种添加方式（本地文件 or URL链接）
  const formHTML = `
        <div class="emoji-add-form" style="display: flex; flex-direction: column; gap: 1em;">
            <!-- 表情包名称 -->
            <div>
                <label style="display: block; margin-bottom: 0.5em; color: var(--phone-text-primary); font-size: 0.9em;">表情包名称</label>
                <input type="text" id="emoji-name-input" 
                    placeholder="例如：小狗歪头" 
                    maxlength="20" 
                    style="width: 100%; padding: 0.75em; border: 1px solid var(--phone-border); border-radius: 0.5em; font-size: 1em; box-sizing: border-box;">
            </div>
            
            <!-- 添加方式选择 -->
            <div>
                <label style="display: block; margin-bottom: 0.5em; color: var(--phone-text-primary); font-size: 0.9em;">添加方式</label>
                <select id="emoji-mode-select" style="width: 100%; padding: 0.75em; border: 1px solid var(--phone-border); border-radius: 0.5em; font-size: 1em; box-sizing: border-box;">
                    <option value="file">本地文件</option>
                    <option value="url">网络链接</option>
                </select>
            </div>
            
            <!-- 本地文件上传区 -->
            <div id="emoji-file-area">
                <label style="display: block; margin-bottom: 0.5em; color: var(--phone-text-primary); font-size: 0.9em;">选择图片</label>
                
                <!-- 隐藏的文件输入框 -->
                <input type="file" id="emoji-file-input" accept="image/*" style="display: none;">
                
                <!-- 可见的按钮（点击会触发文件输入框） -->
                <label for="emoji-file-input" id="emoji-file-label" style="
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5em;
                    width: 100%;
                    min-height: 120px;
                    padding: 0.75em;
                    border: 2px dashed var(--phone-border);
                    border-radius: 0.5em;
                    cursor: pointer;
                    background: var(--phone-bg-main);
                    transition: all 0.2s;
                    box-sizing: border-box;
                    overflow: hidden;
                " onmouseover="this.style.borderColor='var(--phone-primary)'; this.style.background='rgba(18, 150, 219, 0.05)';" 
                   onmouseout="this.style.borderColor='var(--phone-border)'; this.style.background='var(--phone-bg-main)';">
                    <!-- 图片预览区（默认隐藏） -->
                    <img id="emoji-file-preview" style="display: none; max-width: 100%; max-height: 100px; object-fit: contain; border-radius: 0.5em;">
                    <!-- 初始提示（上传后隐藏） -->
                    <div id="emoji-file-placeholder" style="display: flex; flex-direction: column; align-items: center; gap: 0.5em;">
                        <i class="fa-solid fa-upload" style="color: var(--phone-primary); font-size: 1.5em;"></i>
                        <span style="color: var(--phone-text-secondary);">点击选择图片</span>
                    </div>
                </label>
                
                <div style="margin-top: 0.5em; color: var(--phone-text-secondary); font-size: 0.85em;">
                    支持 JPG、PNG、GIF 等格式
                </div>
                
                <!-- 重要说明 -->
                <div style="margin-top: 1em; padding: 0.75em; background: rgba(255, 193, 7, 0.1); border-left: 3px solid #ffc107; border-radius: 0.5em;">
                    <div style="color: #f57c00; font-size: 0.85em; font-weight: 500; margin-bottom: 0.3em;">
                        <i class="fa-solid fa-triangle-exclamation"></i> 使用说明
                    </div>
                    <div style="color: var(--phone-text-secondary); font-size: 0.8em; line-height: 1.4;">
                        如果你不熟悉 SillyTavern 的本地文件夹路径，建议使用「网络链接」方式添加表情包。<br>
                        删除功能已完善，但如需确认本地文件是否删除干净，需要查看 SillyTavern 本地路径。
                    </div>
                </div>
            </div>
            
            <!-- URL链接输入区 -->
            <div id="emoji-url-area" style="display: none;">
                <label style="display: block; margin-bottom: 0.5em; color: var(--phone-text-primary); font-size: 0.9em;">图片链接</label>
                <input type="text" id="emoji-url-input" 
                    placeholder="粘贴图片URL（如：https://...）" 
                    style="width: 100%; padding: 0.75em; border: 1px solid var(--phone-border); border-radius: 0.5em; font-size: 1em; box-sizing: border-box;">
                <div style="margin-top: 0.5em; color: var(--phone-text-secondary); font-size: 0.85em;">
                    支持直链图片（JPG、PNG、GIF、WEBP等）
                </div>
            </div>
        </div>
    `;

  const result = await showCustomPopupWithData('添加表情包', formHTML, {
    buttons: [
      { text: '取消', value: null },
      { text: '保存', value: 'ok' }
    ],
    width: '80%',
    onShow: (overlay) => {
      // 弹窗显示后自动聚焦到名称输入框
      const nameInput = overlay.querySelector('#emoji-name-input');
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 100);
      }

      // 获取元素
      const modeSelect = /** @type {HTMLSelectElement} */ (overlay.querySelector('#emoji-mode-select'));
      const fileArea = /** @type {HTMLElement} */ (overlay.querySelector('#emoji-file-area'));
      const urlArea = /** @type {HTMLElement} */ (overlay.querySelector('#emoji-url-area'));

      // 模式切换事件
      if (modeSelect && fileArea && urlArea) {
        modeSelect.addEventListener('change', () => {
          if (modeSelect.value === 'file') {
            fileArea.style.display = 'block';
            urlArea.style.display = 'none';
          } else {
            fileArea.style.display = 'none';
            urlArea.style.display = 'block';
          }
        });
      }

      // 绑定文件输入框的change事件（显示图片预览）
      const fileInput = /** @type {HTMLInputElement} */ (overlay.querySelector('#emoji-file-input'));
      const filePreview = /** @type {HTMLImageElement} */ (overlay.querySelector('#emoji-file-preview'));
      const filePlaceholder = overlay.querySelector('#emoji-file-placeholder');
      const fileLabel = overlay.querySelector('#emoji-file-label');

      if (fileInput && filePreview && filePlaceholder && fileLabel) {
        // 移除内联的 hover 事件，改用 JS 处理（避免覆盖已选择状态）
        fileLabel.removeAttribute('onmouseover');
        fileLabel.removeAttribute('onmouseout');

        fileInput.addEventListener('change', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          const file = target.files[0];
          if (file) {
            // 创建图片预览
            const reader = new FileReader();
            reader.onload = (event) => {
              const result = event.target.result;
              if (typeof result === 'string') {
                filePreview.src = result;
                filePreview.style.display = 'block';
                filePlaceholder.style.display = 'none';
                // 调整边框样式（已选择状态）
                fileLabel.style.borderColor = 'var(--phone-primary)';
                fileLabel.style.borderStyle = 'solid';
                // 标记为已选择
                fileLabel.dataset.hasFile = 'true';
              }
            };
            reader.readAsDataURL(file);
            logger.debug('[EmojiManager] 已选择文件:', file.name);
          } else {
            // 重置为初始状态
            filePreview.style.display = 'none';
            filePreview.src = '';
            filePlaceholder.style.display = 'flex';
            fileLabel.style.borderColor = 'var(--phone-border)';
            fileLabel.style.borderStyle = 'dashed';
            delete fileLabel.dataset.hasFile;
          }
        });

        // 鼠标悬停效果（不覆盖已选择状态）
        fileLabel.addEventListener('mouseenter', () => {
          if (!fileLabel.dataset.hasFile) {
            fileLabel.style.borderColor = 'var(--phone-primary)';
            fileLabel.style.background = 'rgba(18, 150, 219, 0.05)';
          }
        });
        fileLabel.addEventListener('mouseleave', () => {
          if (!fileLabel.dataset.hasFile) {
            fileLabel.style.borderColor = 'var(--phone-border)';
            fileLabel.style.background = 'var(--phone-bg-main)';
          }
        });
      }

      logger.debug('[EmojiManager] 表情包添加弹窗已初始化');
    },
    beforeClose: (buttonValue) => {
      if (buttonValue === 'ok') {
        const nameInput = /** @type {HTMLInputElement} */ (document.querySelector('#emoji-name-input'));
        const modeSelect = /** @type {HTMLSelectElement} */ (document.querySelector('#emoji-mode-select'));
        const fileInput = /** @type {HTMLInputElement} */ (document.querySelector('#emoji-file-input'));
        const urlInput = /** @type {HTMLInputElement} */ (document.querySelector('#emoji-url-input'));

        const mode = modeSelect?.value || 'file';

        logger.debug('[EmojiManager] 准备保存表情包:', {
          mode: mode,
          name: nameInput?.value,
          hasFile: !!fileInput?.files[0],
          fileName: fileInput?.files[0]?.name,
          url: urlInput?.value
        });

        return {
          action: 'ok',
          mode: mode,
          name: nameInput?.value.trim() || '',
          file: fileInput?.files[0] || null,
          url: urlInput?.value.trim() || ''
        };
      }
      return { action: buttonValue };
    }
  });

  if (!result || result.action !== 'ok') {
    logger.debug('[EmojiManager] 用户取消添加');
    return;
  }

  // 验证输入
  if (!result.name) {
    showErrorToast('请输入表情包名称');
    return;
  }

  let imagePath = '';

  try {
    // 根据模式处理图片
    if (result.mode === 'file') {
      // 本地文件模式
      if (!result.file) {
        showErrorToast('请选择图片文件');
        return;
      }

      // 上传图片到服务器
      imagePath = await uploadEmojiImage(result.file);

    } else if (result.mode === 'url') {
      // URL链接模式
      if (!result.url) {
        showErrorToast('请输入图片链接');
        return;
      }

      // 验证URL格式
      if (!result.url.startsWith('http://') && !result.url.startsWith('https://')) {
        showErrorToast('请输入有效的图片链接（需要http://或https://）');
        return;
      }

      // 直接使用URL（不上传）
      imagePath = result.url;
    }

    // 保存表情包
    const emoji = {
      id: `emoji_${Date.now()}`,
      name: result.name,
      imagePath: imagePath,
      addedTime: Date.now()
    };

    const success = await saveEmoji(emoji);
    if (success) {
      showSuccessToast('表情包添加成功');
      // 刷新列表（事件已在初始化时绑定，使用事件委托，无需重新绑定）
      const content = /** @type {HTMLElement} */ (container.querySelector('.emgr-content'));
      await loadAndRenderEmojis(content);
    } else {
      showErrorToast('表情包名称已存在');
    }
  } catch (error) {
    logger.error('[EmojiManager] 添加表情包失败:', error);
    showErrorToast('添加失败：' + error.message);
  }
}

/**
 * 上传表情包图片
 * 
 * @async
 * @private
 * @param {File} file - 图片文件
 * @returns {Promise<string>} 图片路径
 * @throws {Error} 上传失败时
 * 
 * @description
 * 使用酒馆的文件上传API（/api/files/upload）
 * 文件会保存在 data/default-user/user/files/ 文件夹
 * 使用 acsus-paws-puffs_emoji_ 前缀来区分表情包图片
 */
async function uploadEmojiImage(file) {
  logger.debug('[EmojiManager] 开始上传图片:', file.name);

  // 读取文件为 base64
  const base64Data = await fileToBase64(file);

  // 生成唯一文件名（添加时间戳和扩展名前缀避免重名）
  // 使用文件名前缀代替子文件夹（因为服务器不允许文件名包含斜杠）
  const timestamp = Date.now();
  const ext = file.name.split('.').pop();
  const fileName = `acsus-paws-puffs_emoji_${timestamp}.${ext}`;

  // 调用酒馆的文件上传API（包含必要的认证头）
  const response = await fetch('/api/files/upload', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
      name: fileName,
      data: base64Data
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('[EmojiManager] 上传失败，状态码:', response.status, '错误:', errorText);
    throw new Error(`上传失败（状态码：${response.status}）`);
  }

  const result = await response.json();
  const filePath = result.path;

  logger.info('[EmojiManager] 图片上传成功:', filePath);
  return filePath;
}

/**
 * 将文件转换为 Base64 字符串
 * 
 * @async
 * @private
 * @param {File} file - 文件对象
 * @returns {Promise<string>} Base64字符串（不含前缀）
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      // 移除 "data:image/xxx;base64," 前缀，只保留base64数据
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 处理编辑表情包名字
 * 
 * @async
 * @private
 * @param {HTMLElement} item - 表情包元素
 * @param {HTMLElement} container - 页面容器
 * 
 * @description
 * 点击表情包图片时弹出输入框，允许修改名字
 * 验证规则：不能为空、不能重名、长度1-20字符
 */
async function handleEditEmojiName(item, container) {
  const emojiId = item.dataset.emojiId;

  logger.info('[EmojiManager] 点击编辑表情包:', item.dataset.emojiName);

  // 获取当前表情包数据
  const emojis = getEmojis();
  const emoji = emojis.find(e => e.id === emojiId);
  if (!emoji) {
    logger.warn('[EmojiManager] 表情包不存在:', emojiId);
    return;
  }

  // 弹出输入框
  const newName = await showInputPopup('修改表情名', emoji.name, {
    placeholder: '请输入表情名（1-20字符）',
    okButton: '保存',
    maxLength: 20
  });

  // 用户取消
  if (newName === null) {
    logger.debug('[EmojiManager] 用户取消修改');
    return;
  }

  // 验证1：不能为空
  if (!newName.trim()) {
    showWarningToast('表情名不能为空');
    logger.warn('[EmojiManager] 表情名为空');
    return;
  }

  // 验证2：长度1-20字符
  if (newName.trim().length < 1 || newName.trim().length > 20) {
    showWarningToast('表情名长度需在1-20字符之间');
    logger.warn('[EmojiManager] 表情名长度不符合要求:', newName.trim().length);
    return;
  }

  // 验证3：不能和其他表情包重名
  const exists = emojis.some(e => e.id !== emojiId && e.name === newName.trim());
  if (exists) {
    showWarningToast('表情名已存在，请换一个');
    logger.warn('[EmojiManager] 表情名重复:', newName.trim());
    return;
  }

  // 保存修改
  emoji.name = newName.trim();
  const success = await saveEmoji(emoji);

  if (success) {
    // 局部更新DOM（最小化渲染）
    item.dataset.emojiName = emoji.name;
    const img = item.querySelector('img');
    if (img) {
      img.alt = emoji.name;
    }

    logger.info('[EmojiManager] 表情名已修改:', emoji.name);
    // 不显示成功提示（视觉反馈足够）
  } else {
    showErrorToast('修改失败，请重试');
    logger.error('[EmojiManager] 修改表情名失败:', emojiId);
  }
}

/**
 * 删除选中的表情包
 * 
 * @async
 * @private
 * @param {HTMLElement} container - 页面容器
 */
async function handleDeleteSelected(container) {
  const selectedItems = container.querySelectorAll('.emgr-item.selected');

  if (selectedItems.length === 0) {
    showWarningToast('请先选择要删除的表情包');
    return;
  }

  // 二次确认
  const confirmed = await showConfirmPopup(
    '删除表情包',
    `确定要删除选中的 ${selectedItems.length} 个表情包吗？此操作不可恢复。`,
    { danger: true, okButton: '删除' }
  );

  if (!confirmed) return;

  // 收集要删除的ID
  const idsToDelete = Array.from(selectedItems).map(item => {
    const el = /** @type {HTMLElement} */ (item);
    return el.dataset.emojiId;
  });

  try {
    // 删除数据（包括图片文件）
    const deletedCount = await deleteEmojis(idsToDelete);

    if (deletedCount > 0) {
      showSuccessToast(`已删除 ${deletedCount} 个表情包`);

      // 刷新列表（事件已在初始化时绑定，使用事件委托，无需重新绑定）
      const content = /** @type {HTMLElement} */ (container.querySelector('.emgr-content'));
      await loadAndRenderEmojis(content);

      // 退出管理模式
      const manageBtn = container.querySelector('.emgr-header-manage');
      manageBtn.textContent = '管理';
      const deleteBar = /** @type {HTMLElement} */ (container.querySelector('.emgr-delete-bar'));
      if (deleteBar) deleteBar.style.display = 'none';
    }
  } catch (error) {
    logger.error('[EmojiManager] 删除表情包失败:', error);
    showErrorToast('删除失败：' + error.message);
  }
}

