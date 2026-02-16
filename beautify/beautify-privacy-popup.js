/**
 * 防窥模式设置弹窗
 * @module beautify/beautify-privacy-popup
 *
 * @description
 * 提供防窥模式的详细设置界面：
 * - 解锁文字设置（当前文字、预设管理）
 * - 自定义CSS（方案管理、导入导出）
 * - 背景设置（系统背景、上传图片）
 */

import logger from '../logger.js';
import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced, getRequestHeaders } from '../../../../../script.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';


// ==========================================
// 常量定义
// ==========================================

const EXT_ID = 'pawsPuffs';

/** 弹窗 DOM 元素 */
let popupOverlay = null;


// ==========================================
// 弹窗 DOM 创建
// ==========================================

/**
 * 创建防窥弹窗 DOM 结构
 */
function createPopupDOM() {
  // 如果已存在，先移除
  if (popupOverlay) {
    popupOverlay.remove();
  }

  // 创建遮罩层
  popupOverlay = document.createElement('div');
  popupOverlay.id = 'beautify-privacy-popup';
  popupOverlay.className = 'beautify-popup-overlay';
  popupOverlay.style.display = 'none';
  popupOverlay.innerHTML = `
        <div class="beautify-popup">
            <div class="beautify-popup-header">
                <h3>防窥模式设置</h3>
                <button class="beautify-popup-close" id="beautify-privacy-popup-close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="beautify-popup-tabs">
                <button class="beautify-popup-tab active" data-tab="text">解锁文字</button>
                <button class="beautify-popup-tab" data-tab="css">自定义CSS</button>
                <button class="beautify-popup-tab" data-tab="background">背景设置</button>
            </div>
            <div class="beautify-popup-body">
                <!-- 标签页1：解锁文字 -->
                <div class="beautify-popup-tab-content active" data-tab-content="text">
                    <div class="beautify-privacy-text-section">
                        <div class="beautify-privacy-text-current">
                            <label class="beautify-popup-label">当前解锁文字</label>
                            <input type="text" id="beautify-privacy-unlock-text" class="beautify-popup-input"
                                placeholder="滑动解锁" value="滑动解锁">
                        </div>
                        <div class="beautify-privacy-text-presets">
                            <div class="beautify-privacy-presets-header">
                                <label class="beautify-popup-label">预设文字</label>
                                <button class="beautify-popup-btn-small" id="beautify-privacy-add-preset">
                                    <i class="fa-solid fa-plus"></i> 添加当前
                                </button>
                            </div>
                            <div class="beautify-privacy-presets-list" id="beautify-privacy-presets-list">
                                <!-- 预设列表 -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 标签页2：自定义CSS -->
                <div class="beautify-popup-tab-content" data-tab-content="css">
                    <div class="beautify-privacy-css-section">
                        <!-- 方案管理头部 -->
                        <div class="beautify-scheme-header">
                            <select id="beautify-css-scheme-select" class="beautify-scheme-select">
                                <option value="">默认方案</option>
                            </select>
                            <div class="beautify-scheme-actions">
                                <button class="beautify-scheme-btn" id="beautify-css-save" title="保存当前方案">
                                    <i class="fa-solid fa-floppy-disk"></i>
                                </button>
                                <button class="beautify-scheme-btn" id="beautify-css-import" title="导入方案">
                                    <i class="fa-solid fa-file-import"></i>
                                </button>
                                <button class="beautify-scheme-btn" id="beautify-css-export" title="导出方案">
                                    <i class="fa-solid fa-file-export"></i>
                                </button>
                                <button class="beautify-scheme-btn" id="beautify-css-delete" title="删除方案">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                            <input type="file" id="beautify-privacy-css-file" accept=".json" hidden="">
                        </div>

                        <!-- CSS输入区头部 -->
                        <div class="beautify-css-header">
                            <span class="beautify-popup-hint-small">在这里写CSS美化防窥遮罩，实时生效</span>
                            <button class="beautify-scheme-btn" id="beautify-css-help" title="查看类名和结构说明">
                                <i class="fa-solid fa-circle-question"></i>
                            </button>
                        </div>

                        <!-- CSS输入框 -->
                        <textarea id="beautify-privacy-custom-css" class="beautify-custom-css-input" placeholder="/* 防窥遮罩自定义CSS示例 */
/* 整个遮罩容器 */
#beautify-privacy-overlay .privacy-overlay-content {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 滑块轨道 */
#beautify-privacy-overlay .privacy-slider-track {
    background: rgba(255, 255, 255, 0.3);
}

/* 滑块进度条 */
#beautify-privacy-overlay .privacy-slider-fill {
    background: linear-gradient(90deg, #f093fb 0%, #f5576c 100%);
}

/* 滑块按钮 */
#beautify-privacy-overlay .privacy-slider-knob {
    background: #fff;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* 解锁文字 */
#beautify-privacy-overlay .privacy-overlay-text {
    color: #fff;
    font-size: 1.2em;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}"></textarea>
                    </div>
                </div>

                <!-- 标签页3：背景设置 -->
                <div class="beautify-popup-tab-content" data-tab-content="background">
                    <div class="beautify-privacy-bg-section">
                        <!-- 启用开关 + 预览（同一行） -->
                        <div class="beautify-bg-header-row">
                            <label class="beautify-popup-switch-compact">
                                <input type="checkbox" id="beautify-privacy-bg-enabled">
                                <span>启用</span>
                            </label>
                            <div class="beautify-bg-preview-inline" id="beautify-privacy-bg-preview">
                                <span class="beautify-bg-preview-placeholder">未设置</span>
                            </div>
                        </div>

                        <!-- 背景来源选择 -->
                        <div class="beautify-bg-source-tabs">
                            <button class="beautify-bg-source-tab active" data-source="system">系统背景</button>
                            <button class="beautify-bg-source-tab" data-source="upload">本地上传</button>
                            <button class="beautify-bg-source-tab" data-source="saved">我的存档</button>
                        </div>

                        <!-- 系统背景面板 -->
                        <div class="beautify-bg-source-panel active" data-source-panel="system">
                            <div class="beautify-bg-grid" id="beautify-privacy-system-bg-grid">
                                <!-- 系统背景网格 -->
                            </div>
                        </div>

                        <!-- 上传图片面板 -->
                        <div class="beautify-bg-source-panel" data-source-panel="upload">
                            <input type="file" id="beautify-privacy-bg-file-input" accept="image/*"
                                style="display: none;">
                            <label for="beautify-privacy-bg-file-input" class="beautify-bg-upload-area">
                                <i class="fa-solid fa-upload"></i>
                                <span>点击选择图片</span>
                                <small>支持 JPG、PNG、GIF、WEBP</small>
                            </label>
                        </div>

                        <!-- 我的存档面板 -->
                        <div class="beautify-bg-source-panel" data-source-panel="saved">
                            <div class="beautify-privacy-saved-section">
                                <div class="beautify-bg-grid" id="beautify-privacy-saved-grid">
                                    <!-- 存档列表 -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

  // 添加到 body
  document.body.appendChild(popupOverlay);

  // 绑定事件
  bindPopupEvents();
}


// ==========================================
// 事件绑定
// ==========================================

/**
 * 绑定弹窗事件
 */
async function bindPopupEvents() {
  const popup = document.getElementById('beautify-privacy-popup');
  const closeBtn = document.getElementById('beautify-privacy-popup-close');

  if (!popup || !closeBtn) {
    logger.warn('beautify', '[Beautify] 未找到防窥弹窗元素');
    return;
  }

  // 关闭弹窗
  const closePopup = () => {
    popup.style.display = 'none';
    popup.classList.remove('show');
  };

  closeBtn.addEventListener('click', closePopup);

  // 标签页切换
  popup.querySelectorAll('.beautify-popup-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      // 更新标签页状态
      popup.querySelectorAll('.beautify-popup-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      // 更新内容显示
      popup.querySelectorAll('.beautify-popup-tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tabContent === tabName);
      });
    });
  });

  // 绑定解锁文字事件
  bindPrivacyTextEvents();

  // 绑定自定义CSS事件
  bindPrivacyCssEvents();

  // 绑定背景设置事件
  await bindPrivacyBgEvents();

  logger.debug('beautify', '[Beautify] 防窥弹窗事件已绑定');
}


// ==========================================
// 设置数据管理
// ==========================================

/**
 * 获取防窥设置
 * @returns {Object} 防窥设置对象
 */
function getPrivacySettings() {
  const settings = extension_settings[EXT_ID]?.beautify?.privacy || {};
  return {
    unlockText: '滑动解锁',
    textPresets: ['滑动解锁', '向右滑动', ' swipe to unlock', '👆滑动解锁'],
    customCss: '',
    cssPresets: [],
    currentCssPresetId: null,
    bgImage: '',
    savedBgImages: [],
    bgEnabled: false,
    ...settings
  };
}

/**
 * 保存防窥设置
 * @param {Object} settings - 防窥设置
 */
function savePrivacySettings(settings) {
  extension_settings[EXT_ID].beautify.privacy = settings;
  saveSettingsDebounced();
}


// ==========================================
// 解锁文字事件
// ==========================================

/**
 * 绑定解锁文字相关事件
 */
function bindPrivacyTextEvents() {
  const textInput = document.getElementById('beautify-privacy-unlock-text');
  const addPresetBtn = document.getElementById('beautify-privacy-add-preset');

  if (!textInput) return;

  // 实时保存解锁文字
  textInput.addEventListener('input', () => {
    const settings = getPrivacySettings();
    settings.unlockText = textInput.value;
    savePrivacySettings(settings);
    logger.debug('beautify', '[Beautify] 解锁文字已更新:', textInput.value);
  });

  // 添加预设
  if (addPresetBtn) {
    addPresetBtn.addEventListener('click', () => {
      const currentText = textInput.value.trim();
      if (!currentText) {
        toastr.warning('请先输入解锁文字');
        return;
      }

      const settings = getPrivacySettings();
      const presets = settings.textPresets || [];

      // 检查是否已存在
      if (presets.includes(currentText)) {
        toastr.warning('该文字已存在');
        return;
      }

      presets.push(currentText);
      settings.textPresets = presets;
      savePrivacySettings(settings);

      // 重新渲染预设列表
      renderPrivacyTextPresets(presets);
      toastr.success('已添加预设');
      logger.info('beautify', '[Beautify] 已添加解锁文字预设:', currentText);
    });
  }

  // 加载预设
  const settings = getPrivacySettings();
  renderPrivacyTextPresets(settings.textPresets || []);
}

/**
 * 渲染解锁文字预设列表
 * @param {Array} presets - 预设数组
 */
function renderPrivacyTextPresets(presets) {
  const container = document.getElementById('beautify-privacy-presets-list');
  if (!container) return;

  if (presets.length === 0) {
    container.innerHTML = '<div class="beautify-preset-empty">暂无预设</div>';
    return;
  }

  container.innerHTML = presets.map((preset, index) => `
        <div class="beautify-preset-item" data-index="${index}">
            <span class="beautify-preset-name">${preset}</span>
            <button class="beautify-preset-delete" data-index="${index}" title="删除">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
    `).join('');

  // 绑定删除事件
  container.querySelectorAll('.beautify-preset-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      const settings = getPrivacySettings();
      settings.textPresets.splice(index, 1);
      savePrivacySettings(settings);
      renderPrivacyTextPresets(settings.textPresets);
      toastr.success('已删除预设');
      logger.info('beautify', '[Beautify] 已删除解锁文字预设，索引:', index);
    });
  });

  // 绑定点击应用事件
  container.querySelectorAll('.beautify-preset-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.beautify-preset-delete')) return;
      const index = parseInt(item.dataset.index);
      const textInput = document.getElementById('beautify-privacy-unlock-text');
      if (textInput) {
        textInput.value = presets[index];
        textInput.dispatchEvent(new Event('input'));
        toastr.success('已应用预设');
      }
    });
  });
}


// ==========================================
// 自定义CSS事件
// ==========================================

/**
 * 绑定自定义CSS相关事件
 */
function bindPrivacyCssEvents() {
  const cssTextarea = document.getElementById('beautify-privacy-custom-css');
  const saveBtn = document.getElementById('beautify-css-save');
  const importBtn = document.getElementById('beautify-css-import');
  const exportBtn = document.getElementById('beautify-css-export');
  const deleteBtn = document.getElementById('beautify-css-delete');
  const helpBtn = document.getElementById('beautify-css-help');
  const schemeSelect = document.getElementById('beautify-css-scheme-select');
  const fileInput = document.getElementById('beautify-privacy-css-file');

  // 加载当前CSS和方案
  const settings = getPrivacySettings();
  if (cssTextarea) {
    // 只在第一次加载时设置值，后续由事件更新
    if (!cssTextarea.dataset.eventsBound) {
      cssTextarea.value = settings.customCss || '';
      cssTextarea.dataset.eventsBound = 'true';
    }
  }

  // 渲染CSS方案到下拉框
  renderCssSchemeSelect(settings.cssPresets || [], settings.currentCssPresetId);

  // 更新删除按钮状态（默认方案禁用删除）
  updateDeleteButtonState();

  // 方案选择事件
  if (schemeSelect) {
    schemeSelect.addEventListener('change', () => {
      const selectedId = schemeSelect.value;
      const s = getPrivacySettings();

      // 更新删除按钮状态
      updateDeleteButtonState();

      if (!selectedId) {
        // 默认customCss方案：清空（和正确示例一样）
        s.currentCssPresetId = null;
        s.customCss = '';
        savePrivacySettings(s);

        if (cssTextarea) {
          cssTextarea.value = '';
        }

        // 应用空CSS
        applyPrivacyCustomCss('');

        toastr.success('已切换到默认方案');
        logger.info('beautify', '[Beautify] 切换到默认CSS方案');
        return;
      }

      const preset = (s.cssPresets || []).find(p => p.id === selectedId);
      if (preset && cssTextarea) {
        // 加载预设的CSS到customCss
        s.currentCssPresetId = selectedId;
        s.customCss = preset.css || '';
        savePrivacySettings(s);

        cssTextarea.value = preset.css || '';

        // 应用CSS到页面
        applyPrivacyCustomCss(preset.css || '');

        toastr.success('已应用方案: ' + preset.name);
        logger.info('beautify', '[Beautify] 应用CSS方案:', preset.name);
      }
    });
  }

  // 实时保存CSS（和正确示例一样：统一保存到customCss）
  if (cssTextarea) {
    cssTextarea.addEventListener('input', () => {
      const css = cssTextarea.value || '';
      const s = getPrivacySettings();

      // 统一保存到customCss（不管有没有选中预设）
      s.customCss = css;

      // 立即应用CSS到页面
      applyPrivacyCustomCss(css);

      // 立即保存
      savePrivacySettings(s);
      logger.debug('beautify', '[Debug] 实时保存到customCss');
    });
  }

  // 保存为新方案
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = prompt('请输入方案名称:');
      if (!name) return;

      const s = getPrivacySettings();
      const presets = s.cssPresets || [];
      const newPreset = {
        id: `css_preset_${Date.now()}`,
        name,
        css: cssTextarea.value,
        savedTime: Date.now()
      };
      presets.push(newPreset);
      s.cssPresets = presets;
      s.currentCssPresetId = newPreset.id;
      savePrivacySettings(s);
      renderCssSchemeSelect(presets, newPreset.id);
      if (schemeSelect) schemeSelect.value = newPreset.id;
      toastr.success('已保存方案');
      logger.info('beautify', '[Beautify] 已保存CSS方案:', name);
    });
  }

  // 删除方案
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const selectedId = schemeSelect?.value;
      const s = getPrivacySettings();
      const presets = s.cssPresets || [];

      logger.info('beautify', '[Debug] 删除按钮点击:', {
        selectedId,
        selectedIdType: typeof selectedId,
        isEmpty: selectedId === '',
        isNull: selectedId === null,
        presetsLength: presets.length,
        currentCssPresetId: s.currentCssPresetId
      });

      if (!selectedId) {
        // 默认方案：无法删除，直接提示
        toastr.warning('默认方案无法删除');
        logger.info('beautify', '[Beautify] 尝试删除默认方案被阻止');
        return;
      }

      // 其他方案：正常删除
      const index = presets.findIndex(p => p.id === selectedId);
      if (index === -1) return;

      const preset = presets[index];
      if (!confirm(`确定要删除方案「${preset.name}」吗？`)) return;

      presets.splice(index, 1);
      s.cssPresets = presets;
      s.currentCssPresetId = null;
      savePrivacySettings(s);
      renderCssSchemeSelect(presets, null);

      // 恢复默认CSS并应用
      if (cssTextarea) {
        cssTextarea.value = s.customCss || '';
      }
      applyPrivacyCustomCss(s.customCss || '');

      // 更新删除按钮状态
      updateDeleteButtonState();

      toastr.success('已删除方案');
      logger.info('beautify', '[Beautify] 已删除CSS方案:', preset.name);
    });
  }

  // 导入
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const s = getPrivacySettings();
        if (data.customCss !== undefined) {
          // 导入整个设置
          if (cssTextarea) {
            cssTextarea.value = data.customCss;
          }
          // 应用CSS并保存
          applyPrivacyCustomCss(data.customCss || '');
          s.customCss = data.customCss;
          s.currentCssPresetId = null;
          savePrivacySettings(s);
          toastr.success('CSS导入成功');
          logger.info('beautify', '[Beautify] 防窥CSS导入成功');
        } else if (data.name && data.css) {
          // 导入单个方案
          const presets = s.cssPresets || [];
          presets.push({
            id: `css_preset_${Date.now()}`,
            name: data.name,
            css: data.css,
            savedTime: Date.now()
          });
          s.cssPresets = presets;
          savePrivacySettings(s);
          renderCssSchemeSelect(presets, null);
          toastr.success('已导入方案');
          logger.info('beautify', '[Beautify] CSS方案导入成功:', data.name);
        }
      } catch (error) {
        toastr.error('导入失败：格式错误');
        logger.error('beautify', '[Beautify] CSS导入失败:', error.message);
      }
      fileInput.value = '';
    });
  }

  // 导出
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const s = getPrivacySettings();
      const selectedId = schemeSelect?.value;
      let data, fileName;

      if (selectedId) {
        // 导出选中的方案
        const preset = (s.cssPresets || []).find(p => p.id === selectedId);
        if (preset) {
          data = {
            name: preset.name,
            css: preset.css,
            exportedTime: Date.now()
          };
          fileName = `beautify-privacy-css-${preset.name}-${Date.now()}.json`;
        }
      } else {
        // 导出当前CSS
        data = {
          name: '防窥遮罩CSS',
          customCss: s.customCss || '',
          exportedTime: Date.now()
        };
        fileName = `beautify-privacy-css-${Date.now()}.json`;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toastr.success('已导出方案');
      logger.info('beautify', '[Beautify] CSS方案已导出');
    });
  }

  // 帮助说明
  if (helpBtn) {
    helpBtn.addEventListener('click', showPrivacyCssHelpPopup);
  }
}

/**
 * 显示防窥遮罩CSS帮助弹窗
 * @description 展示类名速查、CSS示例，支持一键复制
 */
function showPrivacyCssHelpPopup() {
  // CSS示例（纯文本，方便复制）
  const cssExampleText = `/* 修改背景 */
#beautify-privacy-overlay {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 修改内容区 */
#beautify-privacy-overlay .privacy-overlay-content {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
}

/* 修改滑块轨道 */
#beautify-privacy-overlay .privacy-slider-track {
    background: rgba(255, 255, 255, 0.2);
}

/* 修改滑块进度条 */
#beautify-privacy-overlay .privacy-slider-fill {
    background: linear-gradient(90deg, #f093fb 0%, #f5576c 100%);
}

/* 修改滑块按钮 */
#beautify-privacy-overlay .privacy-slider-knob {
    background: white;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

/* 修改解锁文字 */
#beautify-privacy-overlay .privacy-overlay-text {
    color: white;
    font-size: 16px;
    font-weight: bold;
}`;

  const helpContent = `
<div style="font-size: 13px; line-height: 1.6; text-align: left; max-height: 70vh; overflow-y: auto;">

<h4 style="margin: 0 0 8px; color: var(--SmartThemeQuoteColor);">📄 HTML结构</h4>
<div style="margin-bottom: 12px; padding: 8px; background: var(--SmartThemeBlurTintColor); border-radius: 6px; font-size: 11px;">
<pre style="margin: 0; white-space: pre-wrap; color: var(--SmartThemeEmColor);">&lt;div id="beautify-privacy-overlay"&gt;
  &lt;div class="privacy-overlay-content"&gt;
    &lt;div class="privacy-slider-container"&gt;
      &lt;div class="privacy-slider-track"&gt;
        &lt;div class="privacy-slider-fill"&gt;&lt;/div&gt;
      &lt;/div&gt;
      &lt;div class="privacy-slider-knob"&gt;
        &lt;i class="fa-solid fa-chevron-right"&gt;&lt;/i&gt;
      &lt;/div&gt;
    &lt;/div&gt;
    &lt;div class="privacy-overlay-text"&gt;滑动解锁&lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</pre>
</div>

<h4 style="margin: 0 0 8px; color: var(--SmartThemeQuoteColor);">🎨 CSS写法示例（复制后修改）</h4>
<div style="position: relative; margin-bottom: 12px;">
    <button id="copy-privacy-css-btn" style="position: absolute; top: 4px; right: 4px; padding: 4px 8px; font-size: 11px; background: var(--SmartThemeQuoteColor); color: white; border: none; border-radius: 4px; cursor: pointer;">
        <i class="fa-solid fa-copy"></i> 复制
    </button>
    <pre id="privacy-css-text" style="background: var(--SmartThemeBlurTintColor); padding: 10px; padding-right: 60px; border-radius: 6px; overflow-x: auto; font-size: 11px; white-space: pre-wrap;">${cssExampleText}</pre>
</div>

<h4 style="margin: 0 0 8px; color: var(--SmartThemeQuoteColor);">📝 常用类名速查</h4>
<table style="width: 100%; font-size: 11px; border-collapse: collapse; text-align: left;">
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>#beautify-privacy-overlay</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">整个遮罩层容器</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.privacy-overlay-content</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">内容容器</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.privacy-slider-container</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">滑块容器</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.privacy-slider-track</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">滑块轨道（背景条）</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.privacy-slider-fill</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">滑块进度条（已滑动部分）</td>
</tr>
<tr>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.privacy-slider-knob</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">滑块按钮（可拖动）</td>
</tr>
<tr style="background: var(--SmartThemeBlurTintColor);">
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);"><code>.privacy-overlay-text</code></td>
    <td style="padding: 4px 8px; border: 1px solid var(--SmartThemeBorderColor);">解锁提示文字</td>
</tr>
</table>

<p style="margin: 12px 0 0; font-size: 11px; color: var(--SmartThemeEmColor);">
    💡 提示：复制CSS示例给AI，说明你想要的效果，AI可以帮你写专属样式
</p>

<h4 style="margin: 16px 0 8px; color: #e74c3c;">⚠️ 重要注意事项</h4>
<div style="font-size: 11px; padding: 8px; background: rgba(231, 76, 60, 0.1); border-left: 3px solid #e74c3c; border-radius: 4px;">
    <p style="margin: 0 0 8px;"><strong>关于 transform 动画：</strong></p>
    <ul style="margin: 0; padding-left: 16px;">
        <li style="margin-bottom: 4px;">滑块按钮 <code>.privacy-slider-knob</code> 的位置由JS控制（使用 <code>transform: translateX()</code>）</li>
        <li style="margin-bottom: 4px;"><strong>不要</strong>在 <code>.privacy-slider-knob</code> 上使用 <code>transform: scale()</code> 动画</li>
        <li style="margin-bottom: 4px;"><strong>不要</strong>在 <code>.privacy-slider-knob</code> 的 <code>:active</code> 或 <code>.dragging</code> 状态使用 <code>transform</code></li>
        <li>正确做法：使用 <code>box-shadow</code>（阴影）或 <code>background</code>（背景）来实现动画效果</li>
    </ul>
</div>
</div>
    `;

  callGenericPopup(helpContent, POPUP_TYPE.TEXT, '', { wide: true, large: true });

  // 绑定复制按钮事件（延迟等待DOM渲染）
  setTimeout(() => {
    const copyCssBtn = document.getElementById('copy-privacy-css-btn');

    copyCssBtn?.addEventListener('click', () => {
      navigator.clipboard.writeText(cssExampleText).then(() => {
        toastr.success('CSS示例已复制');
        copyCssBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
        setTimeout(() => {
          copyCssBtn.innerHTML = '<i class="fa-solid fa-copy"></i> 复制';
        }, 2000);
      });
    });
  }, 100);

  logger.debug('beautify', '[BeautifyPrivacy] 显示CSS帮助弹窗');
}

/**
 * 更新删除按钮状态
 * @description 选中默认方案时，如果没有其他方案则禁用；选中其他方案时启用
 */
function updateDeleteButtonState() {
  const deleteBtn = document.getElementById('beautify-css-delete');
  const schemeSelect = document.getElementById('beautify-css-scheme-select');
  if (!deleteBtn || !schemeSelect) return;

  const settings = getPrivacySettings();
  const presets = settings.cssPresets || [];
  const selectedId = schemeSelect.value;

  if (!selectedId) {
    // 默认方案：无法删除，禁用按钮
    deleteBtn.disabled = true;
    deleteBtn.title = '默认方案无法删除';
  } else {
    // 其他方案：启用删除按钮
    deleteBtn.disabled = false;
    deleteBtn.title = '删除方案';
  }
}

/**
 * 应用自定义CSS到页面
 * @param {string} css - CSS内容
 */
function applyPrivacyCustomCss(css) {
  // 查找已存在的样式元素
  let styleEl = document.getElementById('beautify-privacy-custom-style');

  if (css) {
    if (styleEl) {
      // 已存在：更新内容
      styleEl.textContent = css;
    } else {
      // 不存在：创建新元素并添加到body
      styleEl = document.createElement('style');
      styleEl.id = 'beautify-privacy-custom-style';
      styleEl.textContent = css;
      document.body.appendChild(styleEl);
    }
    logger.debug('beautify', '[Beautify] 已应用自定义CSS，长度:', css.length);
  } else {
    // 空CSS时删除元素
    if (styleEl) {
      styleEl.remove();
      logger.debug('beautify', '[Beautify] 已移除自定义CSS');
    }
  }
}

/**
 * 渲染CSS方案到下拉选择框
 * @param {Array} presets - CSS方案数组
 * @param {string|null} currentId - 当前选中的方案ID
 * @param {boolean} triggerChange - 是否触发change事件
 */
function renderCssSchemeSelect(presets, currentId, triggerChange = false) {
  const select = document.getElementById('beautify-css-scheme-select');
  if (!select) return;

  // 构建选项HTML
  let html = '<option value="">默认方案</option>';
  presets.forEach(preset => {
    const selected = preset.id === currentId ? 'selected' : '';
    html += `<option value="${preset.id}" ${selected}>${preset.name}</option>`;
  });
  select.innerHTML = html;

  // 设置选中值
  select.value = currentId || '';

  // 如果需要触发change事件
  if (triggerChange) {
    select.dispatchEvent(new Event('change'));
  }

  // 详细日志
  logger.info('beautify', '[Debug] renderCssSchemeSelect完成:', {
    selectValue: select.value,
    currentId,
    presetsCount: presets.length
  });
}


// ==========================================
// 背景设置事件
// ==========================================

/**
 * 绑定背景设置相关事件
 */
async function bindPrivacyBgEvents() {
  const popup = document.getElementById('beautify-privacy-popup');
  if (!popup) return;

  // 元素引用
  const enabledCheckbox = popup.querySelector('#beautify-privacy-bg-enabled');
  const previewContainer = popup.querySelector('#beautify-privacy-bg-preview');
  const clearBtn = popup.querySelector('.beautify-bg-clear-btn');
  const sourceTabs = popup.querySelectorAll('.beautify-bg-source-tab');
  const fileInput = popup.querySelector('#beautify-privacy-bg-file-input');

  // 加载设置
  const settings = getPrivacySettings();

  // 1. 设置启用状态和预览
  if (enabledCheckbox) {
    enabledCheckbox.checked = settings.bgEnabled || false;
  }
  updateBgPreview(settings.bgImage || '');

  // 启用开关事件
  enabledCheckbox?.addEventListener('change', () => {
    const s = getPrivacySettings();
    s.bgEnabled = enabledCheckbox.checked;
    savePrivacySettings(s);
    logger.info('beautify', '[Beautify] 防窥背景启用状态:', enabledCheckbox.checked);
  });

  // 清除按钮事件
  clearBtn?.addEventListener('click', () => {
    const s = getPrivacySettings();
    s.bgImage = '';
    savePrivacySettings(s);
    updateBgPreview('');
    toastr.success('已清除背景');
    logger.info('beautify', '[Beautify] 防窥背景已清除');
  });

  // 2. 背景来源切换
  const currentSource = settings.bgSource || 'system';
  sourceTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.source === currentSource);
  });
  updateBgSourcePanel(currentSource);

  sourceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const source = tab.dataset.source;
      sourceTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateBgSourcePanel(source);

      const s = getPrivacySettings();
      s.bgSource = source;
      savePrivacySettings(s);
      logger.debug('beautify', '[Beautify] 防窥背景来源切换:', source);
    });
  });

  // 3. 渲染系统背景
  await renderSystemBgGrid(settings.bgImage || '');

  // 4. 渲染已保存的图片
  renderPrivacySavedBgImages(settings.savedBgImages || []);

  // 5. 上传图片
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        // 读取文件为 base64
        const base64Data = await fileToBase64(file);

        // 生成文件名
        const timestamp = Date.now();
        const ext = file.name.split('.').pop();
        const fileName = `acsus-paws-puffs_privacy_bg_${timestamp}.${ext}`;

        // 上传到服务器
        const response = await fetch('/api/files/upload', {
          method: 'POST',
          headers: getRequestHeaders(),
          body: JSON.stringify({
            name: fileName,
            data: base64Data
          })
        });

        if (!response.ok) {
          throw new Error('上传失败');
        }

        const result = await response.json();
        const filePath = result.path;

        const s = getPrivacySettings();
        const savedImages = s.savedBgImages || [];
        savedImages.push({
          id: `privacy_bg_${timestamp}`,
          name: file.name,
          url: filePath,
          type: 'local',
          addedTime: timestamp
        });
        // 限制最多保存10张
        if (savedImages.length > 10) {
          savedImages.shift();
        }
        s.savedBgImages = savedImages;
        s.bgImage = filePath; // 使用服务器路径
        s.bgEnabled = true;
        savePrivacySettings(s);
        renderPrivacySavedBgImages(savedImages);
        updateBgPreview(filePath);
        if (enabledCheckbox) enabledCheckbox.checked = true;
        toastr.success('已添加图片');
        logger.info('beautify', '[Beautify] 已添加自定义背景图片:', filePath);
      } catch (error) {
        toastr.error('添加图片失败');
        logger.error('beautify', '[Beautify] 添加背景图片失败:', error.message);
      }
      fileInput.value = '';
    });
  }
}

/**
 * 更新背景预览
 * @param {string} imageUrl - 背景图URL
 */
function updateBgPreview(imageUrl) {
  const previewContainer = document.getElementById('beautify-privacy-bg-preview');
  if (!previewContainer) return;

  if (imageUrl) {
    previewContainer.innerHTML = `
      <img src="${imageUrl}" alt="当前背景">
      <button class="beautify-bg-clear-btn" id="beautify-privacy-bg-clear" title="清除">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    // 绑定新的清除按钮
    const clearBtn = previewContainer.querySelector('.beautify-bg-clear-btn');
    clearBtn?.addEventListener('click', () => {
      const s = getPrivacySettings();
      s.bgImage = '';
      savePrivacySettings(s);
      updateBgPreview('');
      toastr.success('已清除背景');
      logger.info('beautify', '[Beautify] 防窥背景已清除');
    });
  } else {
    previewContainer.innerHTML = '<span class="beautify-bg-preview-placeholder">未设置</span>';
  }
}

/**
 * 更新背景来源面板显示
 * @param {string} source - 来源类型
 */
function updateBgSourcePanel(source) {
  const popup = document.getElementById('beautify-privacy-popup');
  if (!popup) return;

  const panels = popup.querySelectorAll('.beautify-bg-source-panel');
  panels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.sourcePanel === source);
  });
}


/**
 * 渲染系统背景网格
 * @param {string} currentBg - 当前选中的背景URL
 */
async function renderSystemBgGrid(currentBg) {
  const container = document.getElementById('beautify-privacy-system-bg-grid');
  if (!container) return;

  // 显示加载状态
  container.innerHTML = '<div class="beautify-preset-empty">加载中...</div>';

  try {
    // 调用 SillyTavern API 获取系统背景图
    const response = await fetch('/api/backgrounds/all', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const { images } = await response.json();

    if (!images || images.length === 0) {
      container.innerHTML = '<div class="beautify-preset-empty">暂无系统背景</div>';
      return;
    }

    // 渲染背景图网格（使用和悬浮栏一致的类名）
    container.innerHTML = images.map(bg => {
      // 不编码，和悬浮栏设置保持一致，浏览器会自动处理 CSS url() 的编码
      const bgUrl = '/backgrounds/' + bg;
      const isActive = currentBg === bgUrl;
      return `
        <div class="beautify-bg-item ${isActive ? 'active' : ''}" data-url="${bgUrl}" data-type="system">
          <img src="${bgUrl}" alt="${bg}" loading="lazy">
        </div>
      `;
    }).join('');

    // 绑定点击事件
    container.querySelectorAll('.beautify-bg-item').forEach(item => {
      item.addEventListener('click', () => {
        const bgUrl = item.dataset.url;
        selectPrivacyBgImage(bgUrl);
      });
    });

    logger.debug('beautify', '[Beautify] 系统背景已加载:', images.length);
  } catch (error) {
    logger.error('beautify', '[Beautify] 加载系统背景失败:', error.message);
    container.innerHTML = '<div class="beautify-preset-empty">加载失败</div>';
  }
}

/**
 * 选择防窥背景图
 * @param {string} url - 背景图URL
 */
function selectPrivacyBgImage(url) {
  const container = document.getElementById('beautify-privacy-system-bg-grid');
  const savedContainer = document.getElementById('beautify-privacy-saved-grid');

  // 更新设置
  const s = getPrivacySettings();
  s.bgImage = url;
  s.bgEnabled = true;
  savePrivacySettings(s);

  // 更新系统背景选中状态
  if (container) {
    container.querySelectorAll('.beautify-bg-item').forEach(item => {
      item.classList.toggle('active', item.dataset.url === url);
    });
  }

  // 更新存档背景选中状态
  if (savedContainer) {
    savedContainer.querySelectorAll('.beautify-bg-item').forEach(item => {
      item.classList.toggle('active', item.dataset.url === url);
    });
  }

  // 更新预览
  updateBgPreview(url);

  // 更新启用开关
  const enabledCheckbox = document.getElementById('beautify-privacy-bg-enabled');
  if (enabledCheckbox) enabledCheckbox.checked = true;

  // 提取文件名
  const fileName = url.split('/').pop();
  toastr.success('已选择背景: ' + fileName);
  logger.info('beautify', '[Beautify] 已选择防窥背景:', url);
}

/**
 * 渲染已保存的背景图片
 * @param {Array} savedImages - 已保存的图片数组
 */
function renderPrivacySavedBgImages(savedImages) {
  const container = document.getElementById('beautify-privacy-saved-grid');
  if (!container) return;

  if (savedImages.length === 0) {
    container.innerHTML = '<div class="beautify-preset-empty">暂无存档</div>';
    return;
  }

  const settings = getPrivacySettings();
  const currentBg = settings.bgImage || '';

  // 兼容旧格式（data字段）和新格式（url字段）
  container.innerHTML = savedImages.map((img, index) => {
    const imgUrl = img.url || img.data || '';  // 兼容新旧格式
    const isActive = currentBg === imgUrl;
    return `
      <div class="beautify-bg-item ${isActive ? 'active' : ''}" data-url="${imgUrl}" data-type="saved">
        <img src="${imgUrl}" alt="${img.name}" loading="lazy">
        <button class="beautify-bg-item-delete" data-index="${index}" data-id="${img.id || ''}" title="删除">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    `;
  }).join('');

  // 绑定点击应用事件
  container.querySelectorAll('.beautify-bg-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.beautify-bg-item-delete')) return;
      const bgUrl = item.dataset.url;
      selectPrivacyBgImage(bgUrl);
    });
  });

  // 绑定删除事件
  container.querySelectorAll('.beautify-bg-item-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const s = getPrivacySettings();
      const image = s.savedBgImages[index];

      // 如果是本地文件，删除服务器上的文件
      if (image && image.type === 'local' && image.url) {
        try {
          await fetch('/api/files/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: image.url })
          });
          logger.info('beautify', '[Beautify] 已删除服务器文件:', image.url);
        } catch (error) {
          logger.warn('beautify', '[Beautify] 删除服务器文件失败:', error);
        }
      }

      s.savedBgImages.splice(index, 1);
      savePrivacySettings(s);
      renderPrivacySavedBgImages(s.savedBgImages);
      toastr.success('已删除图片');
      logger.info('beautify', '[Beautify] 已删除自定义背景图片，索引:', index);
    });
  });
}


// ==========================================
// 导出接口
// ==========================================

/**
 * 初始化防窥弹窗
 */
export function initPrivacyPopup() {
  createPopupDOM();
  logger.info('beautify', '[Beautify] 防窥弹窗模块已初始化');
}

/**
 * 打开防窥弹窗
 */
export async function openPrivacyEditPopup() {
  if (!popupOverlay) {
    initPrivacyPopup();
  }

  const popup = document.getElementById('beautify-privacy-popup');
  const settings = getPrivacySettings();

  if (!popup) return;

  // 加载解锁文字
  const textInput = document.getElementById('beautify-privacy-unlock-text');
  if (textInput) {
    textInput.value = settings.unlockText || '滑动解锁';
  }

  // 渲染文字预设
  renderPrivacyTextPresets(settings.textPresets || []);

  // 加载自定义CSS
  const cssTextarea = document.getElementById('beautify-privacy-custom-css');
  if (cssTextarea) {
    cssTextarea.value = settings.customCss || '';
  }

  // 渲染CSS方案到下拉框
  renderCssSchemeSelect(settings.cssPresets || [], settings.currentCssPresetId || null);

  // 加载背景设置
  // 更新启用开关
  const enabledCheckbox = popup.querySelector('#beautify-privacy-bg-enabled');
  if (enabledCheckbox) {
    enabledCheckbox.checked = settings.bgEnabled || false;
  }

  // 更新预览
  updateBgPreview(settings.bgImage || '');

  // 更新来源切换
  const sourceTabs = popup.querySelectorAll('.beautify-bg-source-tab');
  const bgSource = settings.bgSource || 'system';
  sourceTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.source === bgSource);
  });
  updateBgSourcePanel(bgSource);

  // 渲染背景
  await renderSystemBgGrid(settings.bgImage || '');
  renderPrivacySavedBgImages(settings.savedBgImages || []);

  // 显示弹窗
  popup.style.display = 'flex';
  popup.classList.add('show');

  logger.debug('beautify', '[Beautify] 打开防窥编辑弹窗');
}

/**
 * 关闭防窥弹窗
 */
export function closePrivacyEditPopup() {
  const popup = document.getElementById('beautify-privacy-popup');
  if (popup) {
    popup.style.display = 'none';
    popup.classList.remove('show');
  }
}

// ==========================================
// 公共工具函数
// ==========================================

/**
 * 将文件转换为 Base64
 * @param {File} file - 文件对象
 * @returns {Promise<string>} Base64 字符串（不含前缀）
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
