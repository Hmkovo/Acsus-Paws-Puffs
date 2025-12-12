/**
 * 正则配置页面 UI 模块
 * @module phone/settings/contact-regex-settings-ui
 * 
 * @description
 * 管理角色专属的正则配置界面
 * 支持从酒馆选择性导入正则（全局、角色、预设）
 * 支持添加自定义正则、编辑、删除
 * 高亮显示 only_format_prompt 的正则
 * 
 * @version 2.0 - 2025-11-29
 * - 改为选择性导入（像世界书选择那样）
 * - 添加编辑和删除功能
 * - 添加自定义正则功能
 * - 调整排序：全局 → 预设 → 角色 → 自定义
 * - 移除emoji，使用Font Awesome图标
 * - 添加详细说明弹窗
 */

import logger from '../../../logger.js';
import { showInputPopup, showConfirmPopup, showCustomPopupWithData } from '../utils/popup-helper.js';
import { showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';
import { characters, getRequestHeaders, saveSettingsDebounced } from '../../../../../../../script.js';
import { extension_settings } from '../../../../../../extensions.js';

/**
 * 渲染正则配置页面
 * 
 * @param {Object} params - 页面参数
 * @param {string} params.contactId - 联系人ID
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderContactRegexSettings(params) {
  const { contactId } = params;
  logger.debug('[RegexUI] 渲染正则配置页:', contactId);
  
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'contact-regex-page';
  
  // 渲染页面内容
  container.innerHTML = createRegexHTML(contactId);
  
  // 绑定事件
  bindRegexEvents(container, contactId);
  
  // 加载并渲染配置
  await loadAndRenderConfig(container, contactId);
  
  fragment.appendChild(container);
  
  logger.info('[RegexUI] 正则配置页渲染完成');
  
  return fragment;
}

/**
 * 创建页面HTML
 * 
 * @param {string} contactId - 联系人ID
 * @returns {string} HTML字符串
 */
function createRegexHTML(contactId) {
  return `
    <!-- 顶部栏 -->
    <div class="contact-regex-topbar">
      <button class="contact-regex-back-btn"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="contact-regex-title">正则配置</div>
      <div class="contact-regex-actions">
        <button class="contact-regex-action-btn contact-regex-help-btn" title="查看说明">
          <i class="fa-solid fa-circle-question"></i>
        </button>
        <button class="contact-regex-action-btn contact-regex-reset-btn" title="重置配置">
          <i class="fa-solid fa-rotate-left"></i>
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="contact-regex-content">
      <!-- 按钮组 -->
      <div class="contact-regex-btn-group">
        <button class="contact-regex-add-custom-btn">
          <i class="fa-solid fa-plus"></i>
          添加自定义正则
        </button>
        <button class="contact-regex-quick-gen-btn">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          快速生成
        </button>
      </div>

      <!-- 顶部提示 -->
      <div class="contact-regex-hint">
        <i class="fa-solid fa-bolt"></i>
        <span>带闪电图标的正则会影响发送给AI的内容，执行顺序从上到下</span>
      </div>

      <!-- 自定义正则区 -->
      <div class="contact-regex-section">
        <div class="contact-regex-section-header">
          <div class="contact-regex-section-title">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>自定义正则</span>
            <span class="contact-regex-count" data-type="custom">0</span>
          </div>
        </div>
        <div class="contact-regex-list contact-regex-list-custom" data-type="custom"></div>
      </div>

      <!-- 全局正则区 -->
      <div class="contact-regex-section">
        <div class="contact-regex-section-header">
          <div class="contact-regex-section-title">
            <i class="fa-solid fa-globe"></i>
            <span>全局正则</span>
            <span class="contact-regex-count" data-type="global">0</span>
          </div>
          <button class="contact-regex-import-btn" data-type="global" title="从酒馆导入">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="contact-regex-list contact-regex-list-global" data-type="global"></div>
      </div>

      <!-- 预设正则区 -->
      <div class="contact-regex-section">
        <div class="contact-regex-section-header">
          <div class="contact-regex-section-title">
            <i class="fa-solid fa-box"></i>
            <span>预设正则</span>
            <span class="contact-regex-count" data-type="preset">0</span>
          </div>
          <button class="contact-regex-import-btn" data-type="preset" title="从酒馆导入">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="contact-regex-list contact-regex-list-preset" data-type="preset"></div>
      </div>

      <!-- 角色正则区 -->
      <div class="contact-regex-section">
        <div class="contact-regex-section-header">
          <div class="contact-regex-section-title">
            <i class="fa-solid fa-user"></i>
            <span>角色正则</span>
            <span class="contact-regex-count" data-type="character">0</span>
          </div>
          <button class="contact-regex-import-btn" data-type="character" title="从酒馆导入">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
        <div class="contact-regex-list contact-regex-list-character" data-type="character"></div>
      </div>
    </div>

    <!-- 快速生成弹窗 -->
    <div class="regex-quick-gen-overlay" style="display: none;">
      <div class="regex-quick-gen-dialog">
        <div class="regex-quick-gen-header">
          <h3>快速生成正则</h3>
          <button class="regex-quick-gen-close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div class="regex-quick-gen-body">
          <!-- 模式选择 -->
          <div class="regex-gen-mode-section">
            <label class="regex-gen-mode-label">选择生成模式</label>
            <div class="regex-gen-mode-options">
              <label class="regex-gen-mode-option">
                <input type="radio" name="genMode" value="deleteToTag" checked>
                <div class="mode-content">
                  <span class="mode-title">删除开头到标签</span>
                  <span class="mode-desc">删除消息开头到指定结束标签的内容（如 &lt;/thinking&gt;）</span>
                </div>
              </label>
              
              <label class="regex-gen-mode-option">
                <input type="radio" name="genMode" value="deleteFromTag">
                <div class="mode-content">
                  <span class="mode-title">删除标签到结尾</span>
                  <span class="mode-desc">删除指定开始标签到消息结尾的内容（如 &lt;end&gt;）</span>
                </div>
              </label>
              
              <label class="regex-gen-mode-option">
                <input type="radio" name="genMode" value="deleteTagAndContent">
                <div class="mode-content">
                  <span class="mode-title">删除标签和内容</span>
                  <span class="mode-desc">删除指定内容（输入什么就匹配什么，如 测试）</span>
                </div>
              </label>
              
              <label class="regex-gen-mode-option">
                <input type="radio" name="genMode" value="deleteMultiTags">
                <div class="mode-content">
                  <span class="mode-title">多标签匹配</span>
                  <span class="mode-desc">同时匹配多个标签名称（用逗号分隔，如 虚拟,virtual）</span>
                </div>
              </label>
            </div>
          </div>

          <!-- 标签输入 -->
          <div class="regex-gen-input-section">
            <label class="regex-gen-input-label">
              <span class="label-text">输入标签（完整）</span>
              <span class="label-hint" id="genInputHint">如：&lt;/thinking&gt;</span>
            </label>
            <input type="text" 
                   class="regex-gen-input" 
                   id="genTagInput"
                   placeholder="&lt;/thinking&gt;">
          </div>

          <!-- 预览区 -->
          <div class="regex-gen-preview-section">
            <label class="regex-gen-preview-label">生成的正则表达式</label>
            <div class="regex-gen-preview" id="genPreview">^[\s\S]*?&lt;/thinking&gt;</div>
          </div>
        </div>

        <div class="regex-quick-gen-footer">
          <button class="regex-gen-cancel-btn">取消</button>
          <button class="regex-gen-confirm-btn">确认生成</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 绑定事件
 * 
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
function bindRegexEvents(page, contactId) {
  logger.debug('[RegexUI] 绑定事件');
  
  // 返回按钮
  const backBtn = page.querySelector('.contact-regex-back-btn');
  backBtn?.addEventListener('click', async () => {
    const { hidePage } = await import('../phone-main-ui.js');
    const overlay = document.querySelector('.phone-overlay');
    if (overlay) {
      hidePage(/** @type {HTMLElement} */(overlay), 'contact-regex-settings');
    }
  });
  
  // 帮助按钮
  const helpBtn = page.querySelector('.contact-regex-help-btn');
  helpBtn?.addEventListener('click', () => showHelpDialog());
  
  // 重置按钮
  const resetBtn = page.querySelector('.contact-regex-reset-btn');
  resetBtn?.addEventListener('click', () => handleReset(page, contactId));
  
  // 添加自定义按钮
  const addCustomBtn = page.querySelector('.contact-regex-add-custom-btn');
  addCustomBtn?.addEventListener('click', () => handleAddCustom(page, contactId));
  
  // 快速生成按钮
  const quickGenBtn = page.querySelector('.contact-regex-quick-gen-btn');
  quickGenBtn?.addEventListener('click', () => handleQuickGen(page, contactId));
  
  // 快速生成弹窗事件（只绑定一次）
  const genOverlay = page.querySelector('.regex-quick-gen-overlay');
  if (genOverlay) {
    bindQuickGenEvents(genOverlay, page, contactId);
  }
  
  // 导入按钮（全局、预设、角色）
  const importBtns = page.querySelectorAll('.contact-regex-import-btn');
  importBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type || '';
      handleImport(page, contactId, type);
    });
  });
}

/**
 * 加载并渲染配置
 * 
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function loadAndRenderConfig(page, contactId) {
  logger.debug('[RegexUI] 加载正则配置');
  
  const config = getConfig(contactId);
  
  // 渲染四类正则列表
  renderScriptList(page, contactId, 'global', config.scripts.global || []);
  renderScriptList(page, contactId, 'preset', config.scripts.preset || []);
  renderScriptList(page, contactId, 'character', config.scripts.character || []);
  renderScriptList(page, contactId, 'custom', config.scripts.custom || []);
}

/**
 * 渲染脚本列表
 * 
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型（global/preset/character/custom）
 * @param {Array} scripts - 脚本数组
 */
function renderScriptList(page, contactId, type, scripts) {
  const listContainer = page.querySelector(`.contact-regex-list[data-type="${type}"]`);
  const countElement = page.querySelector(`.contact-regex-count[data-type="${type}"]`);
  
  if (!listContainer) return;
  
  // 更新数量
  if (countElement) {
    countElement.textContent = scripts.length.toString();
  }
  
  if (scripts.length === 0) {
    listContainer.innerHTML = '<div class="contact-regex-empty-list">无脚本</div>';
    return;
  }
  
  listContainer.innerHTML = '';
  
  scripts.forEach((script, index) => {
    const item = createScriptItem(contactId, script, type, index);
    listContainer.appendChild(item);
  });
  
  // 初始化拖拽排序
  initSortable(listContainer, contactId, type);
}

/**
 * 创建脚本条目元素
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} script - 脚本对象
 * @param {string} type - 类型
 * @param {number} index - 索引
 * @returns {HTMLElement} 条目元素
 */
function createScriptItem(contactId, script, type, index) {
  const div = document.createElement('div');
  div.className = 'contact-regex-item';
  div.dataset.type = type;
  div.dataset.index = index.toString();
  
  // 是否是 only_format_prompt（高亮显示）
  const isPromptScript = script.only_format_prompt === true;
  const highlightClass = isPromptScript ? 'regex-item-highlight' : '';
  
  const toggleClass = script.disabled ? 'disabled' : 'enabled';
  const toggleIcon = script.disabled ? 'fa-toggle-off' : 'fa-toggle-on';
  
  div.innerHTML = `
    <div class="contact-regex-item-drag">
      <i class="fa-solid fa-grip-vertical"></i>
    </div>
    <div class="contact-regex-item-content ${highlightClass}">
      ${isPromptScript ? '<i class="fa-solid fa-bolt regex-item-icon"></i>' : ''}
      <span class="regex-item-name">${script.scriptName || '未命名脚本'}</span>
    </div>
    <div class="contact-regex-item-actions">
      <button class="regex-item-toggle ${toggleClass}" data-action="toggle" title="${script.disabled ? '启用' : '禁用'}">
        <i class="fa-solid ${toggleIcon}"></i>
      </button>
      <button class="regex-item-edit" data-action="edit" title="编辑">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button class="regex-item-delete" data-action="delete" title="删除">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `;
  
  // 绑定开关事件
  const toggleBtn = div.querySelector('.regex-item-toggle');
  toggleBtn?.addEventListener('click', () => handleToggle(div, contactId, type, index));
  
  // 绑定编辑事件
  const editBtn = div.querySelector('.regex-item-edit');
  editBtn?.addEventListener('click', () => handleEdit(contactId, type, index));
  
  // 绑定删除事件
  const deleteBtn = div.querySelector('.regex-item-delete');
  deleteBtn?.addEventListener('click', () => handleDelete(contactId, type, index));
  
  return div;
}

// ============================================================
// 功能模块：导入
// ============================================================

/**
 * 处理导入（从酒馆选择正则）
 * 
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型（global/preset/character）
 */
async function handleImport(page, contactId, type) {
  logger.debug('[RegexUI] 导入正则:', type);
  
  try {
    let scripts = [];
    
    // 根据类型从酒馆读取正则
    if (type === 'global') {
      scripts = await getTavernGlobalScripts();
    } else if (type === 'preset') {
      scripts = await getTavernPresetScripts();
    } else if (type === 'character') {
      scripts = await getTavernCharacterScripts(contactId);
    }
    
    if (scripts.length === 0) {
      showErrorToast('没有找到可导入的正则');
      return;
    }
    
    // 显示选择对话框
    const selected = await showImportDialog(type, scripts);
    
    if (selected && selected.length > 0) {
      // 保存选中的脚本
      importScripts(contactId, type, selected);
      
      // 刷新列表
      const config = getConfig(contactId);
      renderScriptList(page, contactId, type, config.scripts[type] || []);
      
      showSuccessToast(`已导入 ${selected.length} 个正则`);
    }
  } catch (error) {
    logger.error('[RegexUI] 导入失败:', error);
    showErrorToast('导入失败：' + error.message);
  }
}

/**
 * 显示导入选择对话框
 * 
 * @param {string} type - 类型
 * @param {Array} scripts - 可选脚本列表
 * @returns {Promise<Array|null>} 选中的脚本
 */
async function showImportDialog(type, scripts) {
  const typeNames = {
    global: '全局',
    preset: '预设',
    character: '角色'
  };
  
  const title = `从酒馆导入${typeNames[type]}正则`;
  
  // 创建选择器HTML
  const content = `
    <div class="regex-selector">
      <div class="regex-selector-header">
        <span>共 ${scripts.length} 个脚本</span>
        <button class="regex-selector-select-all">全选</button>
      </div>
      <div class="regex-selector-list">
        ${scripts.map((script, index) => {
          const isPrompt = script.only_format_prompt === true;
          return `
            <label class="regex-selector-item">
              <input type="checkbox" value="${index}">
              ${isPrompt ? '<i class="fa-solid fa-bolt" style="color: #f59e0b;"></i>' : ''}
              <span>${script.scriptName || '未命名脚本'}</span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  const result = await showCustomPopupWithData(
    title,
    content,
    {
      buttons: [
        { text: '取消', value: null, class: 'cancel' },
        { text: '确定导入', value: 'ok', class: 'ok' }
      ],
      beforeClose: (value) => {
        if (value === 'ok') {
          const checkboxes = document.querySelectorAll('.regex-selector input[type="checkbox"]:checked');
          return Array.from(checkboxes).map(cb => scripts[parseInt(cb.value)]);
        }
        return null;
      }
    }
  );
  
  // 绑定全选按钮
  setTimeout(() => {
    const selectAllBtn = document.querySelector('.regex-selector-select-all');
    selectAllBtn?.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('.regex-selector input[type="checkbox"]');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => {
        cb.checked = !allChecked;
      });
      selectAllBtn.textContent = allChecked ? '全选' : '取消全选';
    });
  }, 100);
  
  return result;
}

/**
 * 导入脚本到配置
 * 
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型
 * @param {Array} scripts - 脚本数组
 */
function importScripts(contactId, type, scripts) {
  const config = getConfig(contactId);
  
  // 添加source标记
  const markedScripts = scripts.map(script => ({
    ...script,
    source: `tavern-${type}`,
    id: script.id || generateId()
  }));
  
  // 合并到现有配置（去重）
  const existing = config.scripts[type] || [];
  const existingIds = new Set(existing.map(s => s.id));
  
  const newScripts = markedScripts.filter(s => !existingIds.has(s.id));
  config.scripts[type] = [...existing, ...newScripts];
  
  saveConfig(contactId, config);
  
  logger.info('[RegexUI] 导入完成:', newScripts.length, '个脚本');
}

// ============================================================
// 功能模块：添加自定义
// ============================================================

/**
 * 处理添加自定义正则
 * 
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function handleAddCustom(page, contactId) {
  logger.debug('[RegexUI] 添加自定义正则');
  
  const script = await showEditDialog(null);
  
  if (script) {
    const config = getConfig(contactId);
    if (!config.scripts.custom) {
      config.scripts.custom = [];
    }
    
    script.id = generateId();
    script.source = 'custom';
    
    config.scripts.custom.push(script);
    saveConfig(contactId, config);
    
    renderScriptList(page, contactId, 'custom', config.scripts.custom);
    showSuccessToast('已添加自定义正则');
  }
}

// ============================================================
// 功能模块：编辑
// ============================================================

/**
 * 处理编辑正则
 * 
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型
 * @param {number} index - 索引
 */
async function handleEdit(contactId, type, index) {
  logger.debug('[RegexUI] 编辑正则:', type, index);
  
  const config = getConfig(contactId);
  const script = config.scripts[type]?.[index];
  
  if (!script) {
    showErrorToast('找不到该正则脚本');
    return;
  }
  
  const edited = await showEditDialog(script);
  
  if (edited) {
    // 保留原有ID和source
    edited.id = script.id;
    edited.source = script.source;
    
    config.scripts[type][index] = edited;
    saveConfig(contactId, config);
    
    // 刷新列表
    const page = document.querySelector('.contact-regex-page');
    if (page) {
      renderScriptList(page, contactId, type, config.scripts[type]);
    }
    
    showSuccessToast('已保存修改');
  }
}

/**
 * 显示编辑对话框
 * 
 * @param {Object|null} script - 脚本对象（null表示新建）
 * @returns {Promise<Object|null>} 编辑后的脚本
 */
async function showEditDialog(script) {
  const isNew = !script;
  const title = isNew ? '添加自定义正则' : '编辑正则';
  
  const content = `
    <div class="regex-editor">
      <div class="regex-editor-field">
        <label>名称</label>
        <input type="text" name="scriptName" class="regex-editor-input" 
          placeholder="如：移除思维链" value="${script?.scriptName || ''}">
      </div>
      
      <div class="regex-editor-field">
        <label>查找（正则表达式）</label>
        <textarea name="findRegex" class="regex-editor-textarea" rows="3" 
          placeholder="填写需要查找的格式，如：<Think>.*?</Think>">${script?.findRegex || ''}</textarea>
        <div class="regex-editor-hint">填写需要查找的格式，用于消除思维链、状态栏等内容，避免AI模仿酒馆正文</div>
      </div>
      
      <div class="regex-editor-field">
        <label>替换为</label>
        <textarea name="replaceString" class="regex-editor-textarea" rows="3" 
          placeholder="留空来删除查找到的内容">${script?.replaceString || ''}</textarea>
        <div class="regex-editor-hint">留空则删除匹配内容（与酒馆用法一致）</div>
      </div>
      
      <div class="regex-editor-field">
        <label>修剪掉（可选）</label>
        <textarea name="trimStrings" class="regex-editor-textarea" rows="3" 
          placeholder="在替换之前全局修剪正则表达式匹配中任何不需要的部分。用回车键分隔每个元素">${script?.trimStrings?.join('\n') || ''}</textarea>
        <div class="regex-editor-hint">可选项。每行一个正则，用于在替换前先清理内容</div>
      </div>
      
      <div class="regex-editor-field">
        <label class="regex-editor-checkbox">
          <input type="checkbox" name="only_format_prompt" ${script?.only_format_prompt ? 'checked' : ''}>
          <span>仅格式化提示词（影响发送给AI的内容）</span>
        </label>
        <div class="regex-editor-hint">勾选后，此正则会处理发送给AI的酒馆上下文</div>
      </div>
    </div>
  `;
  
  const result = await showCustomPopupWithData(
    title,
    content,
    {
      buttons: [
        { text: '取消', value: null, class: 'cancel' },
        { text: '保存', value: 'ok', class: 'ok' }
      ],
      width: '500px',
      beforeClose: (value) => {
        if (value === 'ok') {
          const form = document.querySelector('.regex-editor');
          const scriptName = form.querySelector('[name="scriptName"]').value.trim();
          const findRegex = form.querySelector('[name="findRegex"]').value.trim();
          const replaceString = form.querySelector('[name="replaceString"]').value;
          const trimStringsText = form.querySelector('[name="trimStrings"]').value;
          const only_format_prompt = form.querySelector('[name="only_format_prompt"]').checked;
          
          if (!scriptName) {
            showErrorToast('请输入名称');
            return false; // 阻止关闭
          }
          
          if (!findRegex) {
            showErrorToast('请输入查找正则');
            return false;
          }
          
          // 解析trimStrings（每行一个）
          const trimStrings = trimStringsText
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          
          return {
            scriptName,
            findRegex,
            replaceString,
            trimStrings,
            only_format_prompt,
            disabled: false
          };
        }
        return null;
      }
    }
  );
  
  return result;
}

// ============================================================
// 功能模块：删除
// ============================================================

/**
 * 处理删除正则
 * 
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型
 * @param {number} index - 索引
 */
async function handleDelete(contactId, type, index) {
  logger.debug('[RegexUI] 删除正则:', type, index);
  
  const config = getConfig(contactId);
  const script = config.scripts[type]?.[index];
  
  if (!script) {
    showErrorToast('找不到该正则脚本');
    return;
  }
  
  const confirmed = await showConfirmPopup(
    '确认删除',
    `确定要删除正则"${script.scriptName}"吗？`,
    { danger: true, okButton: '删除' }
  );
  
  if (confirmed) {
    config.scripts[type].splice(index, 1);
    saveConfig(contactId, config);
    
    // 刷新列表
    const page = document.querySelector('.contact-regex-page');
    if (page) {
      renderScriptList(page, contactId, type, config.scripts[type]);
    }
    
    showSuccessToast('已删除');
  }
}

// ============================================================
// 功能模块：开关切换
// ============================================================

/**
 * 处理开关切换
 * 
 * @param {HTMLElement} item - 条目元素
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型
 * @param {number} index - 索引
 */
function handleToggle(item, contactId, type, index) {
  logger.debug('[RegexUI] 切换开关:', type, index);
  
  const config = getConfig(contactId);
  const script = config.scripts[type]?.[index];
  
  if (!script) return;
  
  // 切换状态
  script.disabled = !script.disabled;
  saveConfig(contactId, config);
  
  // 更新按钮样式（不刷新整个列表）
  const toggleBtn = item.querySelector('.regex-item-toggle');
  if (toggleBtn) {
    if (script.disabled) {
      toggleBtn.classList.remove('enabled');
      toggleBtn.classList.add('disabled');
      toggleBtn.querySelector('i')?.classList.replace('fa-toggle-on', 'fa-toggle-off');
      toggleBtn.title = '启用';
    } else {
      toggleBtn.classList.remove('disabled');
      toggleBtn.classList.add('enabled');
      toggleBtn.querySelector('i')?.classList.replace('fa-toggle-off', 'fa-toggle-on');
      toggleBtn.title = '禁用';
    }
  }
  
  logger.debug('[RegexUI] 开关已切换:', script.disabled ? '禁用' : '启用');
}

// ============================================================
// 功能模块：说明弹窗
// ============================================================

/**
 * 显示说明对话框
 */
async function showHelpDialog() {
  const content = `
    <div class="regex-help">
      <h4><i class="fa-solid fa-circle-info"></i> 什么是正则配置？</h4>
      <p>正则是一种<strong>查找特定格式</strong>的工具，用于消除酒馆发送的思维链、状态栏等内容。</p>
      <p>目的：避免AI在手机读取酒馆正文时模仿输出，保持正文干净，同时节约token。</p>
      
      <h4><i class="fa-solid fa-lightbulb"></i> 快速上手：如何消除酒馆内容</h4>
      <p><strong>方法1：从酒馆导入现有正则</strong></p>
      <ol>
        <li>点击各分类的<strong>「从酒馆导入」</strong>按钮</li>
        <li>在酒馆正则中，找到用于<strong>美化替换</strong>的正则（如状态栏）</li>
        <li>查看该正则的<strong>「查找正则表达式」</strong>和<strong>「替换为」</strong>两个框</li>
        <li>如果两个框都有内容，导入后<strong>删除「替换为」的内容</strong></li>
        <li>保存后，该正则查找的格式就会被消除</li>
      </ol>
      
      <p><strong>方法2：添加自定义正则</strong></p>
      <ul>
        <li><strong>查找：</strong>填写需要查找的格式，如 <code>&lt;Think&gt;.*?&lt;/Think&gt;</code></li>
        <li><strong>替换为：</strong><strong>留空</strong>（这样就会删除查找到的内容）</li>
        <li><strong>效果：</strong>删除所有思维链标签</li>
      </ul>
      
      <h4><i class="fa-solid fa-arrow-down-1-9"></i> 执行顺序很重要！</h4>
      <p>正则按照<strong>从上到下</strong>的顺序执行，每个正则都会处理前一个正则的结果。</p>
      <ul>
        <li><strong>自定义正则</strong>最先执行（最上面）</li>
        <li>然后是<strong>全局正则</strong></li>
        <li>再然后是<strong>预设正则</strong></li>
        <li>最后是<strong>角色正则</strong></li>
      </ul>
      <p><strong>举例：</strong>如果你同时使用了 <code>^[\\s\\S]*?&lt;/thinking&gt;</code>（删除开头到thinking标签）和删除Safe House标签的正则，那么：</p>
      <ul>
        <li>✅ <strong>正确：</strong>把删除thinking的放在自定义正则（最上面），先删除thinking，Safe House标签还在，后面的正则能正确匹配</li>
        <li>❌ <strong>错误：</strong>如果删除Safe House的正则先执行，thinking标签内的Safe House已经被删了，删除thinking的正则就找不到完整的thinking块了</li>
      </ul>
      <p><strong>简单说：</strong>越具体、越针对性的正则，越要放在前面（自定义正则区）。</p>
      
      <h4><i class="fa-solid fa-triangle-exclamation"></i> 注意事项</h4>
      <ul>
        <li><strong>无法完全保证</strong>：去除了也可能出现其他模仿行为</li>
        <li><strong>不是必须的</strong>：如果没这个问题，配不配全看需求</li>
        <li><strong>只影响酒馆上下文</strong>：不影响手机其他内容</li>
        <li><strong>正则用法多样</strong>：具体还要看实际情况调整</li>
      </ul>
      
      <h4><i class="fa-solid fa-bolt"></i> 图标说明</h4>
      <p>带 <i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> 图标的正则会<strong>影响发送给AI的内容</strong>。</p>
    </div>
  `;
  
  await showCustomPopupWithData(
    '正则配置说明',
    content,
    {
      buttons: [{ text: '知道了', value: 'ok', class: 'ok' }],
      width: '500px'
    }
  );
}

// ============================================================
// 功能模块：重置
// ============================================================

/**
 * 处理重置配置
 * 
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function handleReset(page, contactId) {
  logger.debug('[RegexUI] 重置配置');
  
  const confirmed = await showConfirmPopup(
    '确认重置',
    '此操作将清空所有正则配置，包括自定义正则。\n\n确定要重置吗？',
    { danger: true, okButton: '确定重置' }
  );
  
  if (confirmed) {
    // 清空配置
    const config = {
      scripts: {
        global: [],
        preset: [],
        character: [],
        custom: []
      }
    };
    saveConfig(contactId, config);
    
    // 刷新列表
    renderScriptList(page, contactId, 'global', []);
    renderScriptList(page, contactId, 'preset', []);
    renderScriptList(page, contactId, 'character', []);
    renderScriptList(page, contactId, 'custom', []);
    
    showSuccessToast('已重置配置');
  }
}

// ============================================================
// 数据读写辅助函数
// ============================================================

/**
 * 获取配置
 * 
 * @param {string} contactId - 联系人ID
 * @returns {Object} 配置对象
 */
function getConfig(contactId) {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.contactRegex) {
    extension_settings.acsusPawsPuffs.phone.contactRegex = {};
  }
  
  if (!extension_settings.acsusPawsPuffs.phone.contactRegex[contactId]) {
    extension_settings.acsusPawsPuffs.phone.contactRegex[contactId] = {
      scripts: {
        global: [],
        preset: [],
        character: [],
        custom: []
      }
    };
  }
  
  return extension_settings.acsusPawsPuffs.phone.contactRegex[contactId];
}

/**
 * 保存配置
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} config - 配置对象
 */
function saveConfig(contactId, config) {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.contactRegex) {
    extension_settings.acsusPawsPuffs.phone.contactRegex = {};
  }
  
  extension_settings.acsusPawsPuffs.phone.contactRegex[contactId] = config;
  saveSettingsDebounced();
  
  logger.debug('[RegexUI] 配置已保存');
}

/**
 * 生成唯一ID
 * 
 * @returns {string} UUID
 */
function generateId() {
  return `regex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================
// 从酒馆读取正则
// ============================================================

/**
 * 获取酒馆全局正则
 * 
 * @returns {Promise<Array>} 正则脚本数组
 */
async function getTavernGlobalScripts() {
  try {
    const scripts = extension_settings.regex || [];
    logger.debug('[RegexUI] 读取全局正则:', scripts.length, '个');
    
    // 统一字段名：promptOnly → only_format_prompt
    const normalizedScripts = scripts.map(script => ({
      ...script,
      only_format_prompt: script.promptOnly ?? script.only_format_prompt ?? false
    }));
    
    // 添加日志检查only_format_prompt
    normalizedScripts.forEach((script, index) => {
      logger.debug(`[RegexUI] 全局正则 ${index}: ${script.scriptName}, only_format_prompt=${script.only_format_prompt}`);
    });
    
    return normalizedScripts;
  } catch (error) {
    logger.error('[RegexUI] 读取全局正则失败:', error);
    return [];
  }
}

/**
 * 获取酒馆预设正则
 * 
 * @returns {Promise<Array>} 正则脚本数组
 */
async function getTavernPresetScripts() {
  try {
    const { getPresetManager } = await import('../../../../../../preset-manager.js');
    const { main_api } = await import('../../../../../../../script.js');
    
    // 步骤1：让用户选择预设
    const presetName = await showPresetSelector(main_api);
    if (!presetName) {
      logger.debug('[RegexUI] 用户取消选择预设');
      return [];
    }
    
    // 步骤2：加载选中预设的正则
    const manager = getPresetManager(main_api);
    if (!manager) {
      throw new Error('无法获取预设管理器');
    }
    
    // 直接通过名称读取预设的正则（不需要切换）
    const scripts = manager.readPresetExtensionField({ 
      name: presetName, 
      path: 'regex_scripts' 
    }) || [];
    logger.debug('[RegexUI] 从预设', presetName, '读取正则:', scripts.length, '个');
    
    // 统一字段名：promptOnly → only_format_prompt
    const normalizedScripts = scripts.map(script => ({
      ...script,
      only_format_prompt: script.promptOnly ?? script.only_format_prompt ?? false
    }));
    
    // 添加日志检查only_format_prompt
    normalizedScripts.forEach((script, index) => {
      logger.debug(`[RegexUI] 预设正则 ${index}: ${script.scriptName}, only_format_prompt=${script.only_format_prompt}`);
    });
    
    return normalizedScripts;
  } catch (error) {
    logger.error('[RegexUI] 读取预设正则失败:', error);
    return [];
  }
}

/**
 * 显示预设选择器
 * 
 * @param {string} apiId - API ID
 * @returns {Promise<string|null>} 选中的预设名称
 */
async function showPresetSelector(apiId) {
  try {
    const { getPresetManager } = await import('../../../../../../preset-manager.js');
    const manager = getPresetManager(apiId);
    
    if (!manager) {
      throw new Error('无法获取预设管理器');
    }
    
    const presetNames = manager.getAllPresets() || [];
    
    if (presetNames.length === 0) {
      showErrorToast('没有找到预设');
      return null;
    }
    
    const content = `
      <div class="preset-selector">
        <div class="preset-selector-field">
          <label>选择预设</label>
          <select class="preset-select">
            ${presetNames.map(name => `<option value="${name}">${name}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
    
    const result = await showCustomPopupWithData(
      '选择预设',
      content,
      {
        buttons: [
          { text: '取消', value: null, class: 'cancel' },
          { text: '确定', value: 'ok', class: 'ok' }
        ],
        beforeClose: (value) => {
          if (value === 'ok') {
            const select = document.querySelector('.preset-select');
            return select ? select.value : null;
          }
          return null;
        }
      }
    );
    
    return result;
  } catch (error) {
    logger.error('[RegexUI] 显示预设选择器失败:', error);
    return null;
  }
}

/**
 * 获取酒馆角色正则
 * 
 * @param {string} contactId - 联系人ID
 * @returns {Promise<Array>} 正则脚本数组
 */
async function getTavernCharacterScripts(contactId) {
  try {
    // 从contactId提取角色名
    const charName = contactId.replace(/^tavern_/, '');
    
    // 在酒馆角色列表中查找
    const character = characters.find(c => {
      const avatar = c.avatar?.replace(/\.[^/.]+$/, '');
      return avatar === charName;
    });
    
    if (!character) {
      throw new Error('未找到对应的酒馆角色');
    }
    
    const scripts = character.data?.extensions?.regex_scripts || [];
    logger.debug('[RegexUI] 读取角色正则:', scripts.length, '个');
    
    // 统一字段名：promptOnly → only_format_prompt
    const normalizedScripts = scripts.map(script => ({
      ...script,
      only_format_prompt: script.promptOnly ?? script.only_format_prompt ?? false
    }));
    
    // 添加日志检查only_format_prompt
    normalizedScripts.forEach((script, index) => {
      logger.debug(`[RegexUI] 角色正则 ${index}: ${script.scriptName}, only_format_prompt=${script.only_format_prompt}`);
    });
    
    return normalizedScripts;
  } catch (error) {
    logger.error('[RegexUI] 读取角色正则失败:', error);
    return [];
  }
}

// ============================================================
// 功能模块：快速正则生成
// ============================================================

/**
 * 处理快速生成按钮点击
 * 
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
function handleQuickGen(page, contactId) {
  logger.debug('[RegexUI] 打开快速生成弹窗');
  
  const overlay = page.querySelector('.regex-quick-gen-overlay');
  if (!overlay) return;
  
  // 显示弹窗
  overlay.style.display = 'flex';
  
  // 初始化预览
  updateGenPreview(overlay);
}

/**
 * 绑定快速生成弹窗的事件
 * 
 * @param {HTMLElement} overlay - 弹窗遮罩层
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
function bindQuickGenEvents(overlay, page, contactId) {
  // 关闭按钮
  const closeBtn = overlay.querySelector('.regex-quick-gen-close');
  const cancelBtn = overlay.querySelector('.regex-gen-cancel-btn');
  
  const closeHandler = () => {
    overlay.style.display = 'none';
  };
  
  closeBtn?.addEventListener('click', closeHandler);
  cancelBtn?.addEventListener('click', closeHandler);
  
  // 点击遮罩层关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeHandler();
    }
  });
  
  // 模式切换
  const modeRadios = overlay.querySelectorAll('input[name="genMode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', () => updateGenPreview(overlay));
  });
  
  // 标签输入变化
  const tagInput = overlay.querySelector('#genTagInput');
  tagInput?.addEventListener('input', () => updateGenPreview(overlay));
  
  // 确认生成
  const confirmBtn = overlay.querySelector('.regex-gen-confirm-btn');
  confirmBtn?.addEventListener('click', () => {
    handleGenConfirm(overlay, page, contactId);
  });
}

/**
 * 更新生成预览
 * 
 * @param {HTMLElement} overlay - 弹窗遮罩层
 */
function updateGenPreview(overlay) {
  const modeRadio = overlay.querySelector('input[name="genMode"]:checked');
  const tagInput = overlay.querySelector('#genTagInput');
  const preview = overlay.querySelector('#genPreview');
  const hint = overlay.querySelector('#genInputHint');
  
  if (!modeRadio || !tagInput || !preview || !hint) return;
  
  const mode = modeRadio.value;
  const tag = tagInput.value.trim();
  
  // 更新提示文字和占位符
  const hints = {
    'deleteToTag': '如：</thinking>',
    'deleteFromTag': '如：<end>',
    'deleteTagAndContent': '如：测试（匹配 测试...测试）',
    'deleteMultiTags': '如：虚拟,virtual（标签名）'
  };
  hint.textContent = hints[mode] || '';
  
  const placeholders = {
    'deleteToTag': '</thinking>',
    'deleteFromTag': '<end>',
    'deleteTagAndContent': '测试',
    'deleteMultiTags': '虚拟,virtual'
  };
  tagInput.placeholder = placeholders[mode] || '';
  
  // 生成正则表达式
  const regex = generateRegex(mode, tag);
  preview.innerHTML = escapeHtml(regex);
}

/**
 * 生成正则表达式
 * 
 * @param {string} mode - 生成模式
 * @param {string} tag - 标签内容
 * @returns {string} 正则表达式
 */
function generateRegex(mode, tag) {
  if (!tag) {
    // 默认示例
    const examples = {
      'deleteToTag': '^[\\s\\S]*?</thinking>',
      'deleteFromTag': '<end>[\\s\\S]*?$',
      'deleteTagAndContent': '测试[\\s\\S]*?测试',
      'deleteMultiTags': '/<(?:虚拟|virtual)[^>]*>[\\s\\S]*?<\\/(?:虚拟|virtual)[^>]*>/gs'
    };
    return examples[mode] || '';
  }
  
  switch (mode) {
    case 'deleteToTag':
      // 删除开头到标签: 用户填写完整标签如</thinking>
      return `^[\\s\\S]*?${escapeRegex(tag)}`;
      
    case 'deleteFromTag':
      // 删除标签到结尾: 用户填写完整标签如<end>
      return `${escapeRegex(tag)}[\\s\\S]*?$`;
      
    case 'deleteTagAndContent':
      // 删除标签和内容: 用户填写什么就匹配什么
      return `${escapeRegex(tag)}[\\s\\S]*?${escapeRegex(tag)}`;
      
    case 'deleteMultiTags':
      // 多标签匹配: 用户填写标签名如虚拟,virtual
      const tags = tag.split(',').map(t => escapeRegex(t.trim())).filter(t => t);
      if (tags.length === 0) return '';
      return `/<(?:${tags.join('|')})[^>]*>[\\s\\S]*?<\\/(?:${tags.join('|')})[^>]*>/gs`;
      
    default:
      return '';
  }
}

/**
 * 转义正则表达式特殊字符
 * 
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 转义HTML特殊字符
 * 
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 处理生成确认
 * 
 * @param {HTMLElement} overlay - 弹窗遮罩层
 * @param {HTMLElement} page - 页面元素
 * @param {string} contactId - 联系人ID
 */
async function handleGenConfirm(overlay, page, contactId) {
  const modeRadio = overlay.querySelector('input[name="genMode"]:checked');
  const tagInput = overlay.querySelector('#genTagInput');
  
  if (!modeRadio || !tagInput) return;
  
  const mode = modeRadio.value;
  const tag = tagInput.value.trim();
  
  if (!tag) {
    const { showPhoneToast } = await import('../ui-components/toast-notification.js');
    showPhoneToast('请输入标签内容', 'error');
    return;
  }
  
  // 生成正则表达式
  const findRegex = generateRegex(mode, tag);
  
  // 生成脚本名称
  const modeNames = {
    'deleteToTag': '删除开头到',
    'deleteFromTag': '删除到结尾',
    'deleteTagAndContent': '删除标签',
    'deleteMultiTags': '多标签'
  };
  const scriptName = `${modeNames[mode]}：${tag}`;
  
  // 创建正则脚本对象
  const script = {
    scriptName: scriptName,
    findRegex: findRegex,
    replaceString: '',  // 留空表示删除
    trimStrings: [],
    only_format_prompt: true,  // 默认影响AI内容
    disabled: false
  };
  
  // 保存到自定义正则
  const config = getConfig(contactId);
  config.scripts.custom = config.scripts.custom || [];
  config.scripts.custom.push({
    ...script,
    id: generateId(),
    source: 'quick-gen'
  });
  
  saveConfig(contactId, config);
  
  // 关闭弹窗
  overlay.style.display = 'none';
  
  // 刷新列表
  await loadAndRenderConfig(page, contactId);
  
  // 显示成功提示
  const { showPhoneToast } = await import('../ui-components/toast-notification.js');
  showPhoneToast(`已生成正则：${scriptName}`, 'success');
  
  logger.debug('[RegexUI] 快速生成完成:', scriptName);
}

// ============================================================
// 功能模块：拖拽排序
// ============================================================

/**
 * 初始化拖拽排序
 * 
 * @param {HTMLElement} listContainer - 列表容器
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型
 */
function initSortable(listContainer, contactId, type) {
  logger.debug('[RegexUI] 初始化拖拽排序:', type);
  
  // 使用 jQuery UI Sortable
  // @ts-ignore - jQuery UI Sortable
  $(listContainer).sortable({
    handle: '.contact-regex-item-drag',
    axis: 'y',
    cursor: 'move',
    opacity: 0.8,
    tolerance: 'pointer',
    stop: function (event, ui) {
      handleSortEnd(listContainer, contactId, type);
    }
  });
}

/**
 * 处理拖拽排序结束
 * 
 * @param {HTMLElement} listContainer - 列表容器
 * @param {string} contactId - 联系人ID
 * @param {string} type - 类型
 */
function handleSortEnd(listContainer, contactId, type) {
  logger.debug('[RegexUI] 拖拽排序结束，保存新顺序:', type);
  
  const config = getConfig(contactId);
  const scripts = config.scripts[type];
  
  if (!scripts) return;
  
  // 获取新的顺序
  const items = Array.from(listContainer.querySelectorAll('.contact-regex-item'));
  const newScripts = items.map(item => {
    const index = parseInt(item.dataset.index || '0');
    return scripts[index];
  }).filter(s => s);  // 过滤掉undefined
  
  // 更新配置
  config.scripts[type] = newScripts;
  saveConfig(contactId, config);
  
  // 刷新列表（更新index）
  const page = document.querySelector('.contact-regex-page');
  if (page) {
    renderScriptList(page, contactId, type, newScripts);
  }
  
  showSuccessToast('顺序已更新');
}
