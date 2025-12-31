/**
 * 日记 - API配置管理模块（重构版）
 *
 * @description
 * 负责管理自定义API配置：
 * - 保存/加载配置
 * - 根据API类型动态显示配置表单
 * - 高级参数管理
 * - 测试API连接
 * - 绑定API设置事件
 *
 * @module DiaryAPIConfig
 * @version 2.0.0 (重构版 - 同步手机样式)
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { oai_settings } from '../../../../../openai.js';
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from './diary-toast.js';
import {
  PARAMS_DEFINITIONS,
  getSupportedParams,
  getDefaultParams
} from './diary-api-params-config.js';

// ========================================
// [CORE] API配置管理类
// ========================================

/**
 * API配置管理器
 *
 * @class DiaryAPIConfig
 */
export class DiaryAPIConfig {
  /**
   * 创建API配置管理器
   *
   * @param {HTMLElement} panelElement - 日记面板元素
   * @param {Object} options - 配置选项
   * @param {Object} options.dataManager - 数据管理器
   * @param {Object} options.api - API管理器
   */
  constructor(panelElement, options) {
    this.panelElement = panelElement;
    this.dataManager = options.dataManager;
    this.api = options.api;
  }


  /**
   * 绑定 API 设置事件
   *
   * @description
   * 处理 API 来源切换、配置管理、参数调整等操作
   */
  bindApiSettingsEvents() {
    // API 来源选择
    this.bindApiSourceEvents();

    // API 类型选择（切换配置表单）
    this.bindApiFormatEvents();

    // 流式开关
    this.bindStreamToggle();

    // 密钥显示/隐藏（多个）
    this.bindPasswordToggles();

    // 反向代理折叠
    this.bindReverseProxyToggle();

    // 代理预设管理
    this.bindProxyPresetEvents();

    // Vertex AI 认证模式切换
    this.bindVertexAuthModeEvents();

    // 模型选择
    this.bindModelSelectEvents();

    // 刷新模型列表
    this.bindRefreshModelsEvents();

    // 测试连接
    this.bindTestConnectionEvent();

    // 高级参数折叠
    this.bindParamsToggle();

    // 加载现有设置到 UI
    this.loadApiSettingsToUI();

    logger.debug('[DiaryAPIConfig] API设置事件已绑定');
  }

  // ========================================
  // [BIND] 事件绑定方法
  // ========================================

  /**
   * 绑定 API 来源选择事件
   */
  bindApiSourceEvents() {
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiSource')
    );
    const customApiSettings = /** @type {HTMLElement|null} */ (
      this.panelElement.querySelector('#diaryCustomApiSettings')
    );

    if (apiSourceSelect) {
      apiSourceSelect.addEventListener('change', () => {
        const source = apiSourceSelect.value;
        const settings = this.dataManager.getSettings();

        // 更新配置
        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            source: source
          }
        });

        // 显示/隐藏自定义配置区域
        if (customApiSettings) {
          customApiSettings.style.display = source === 'custom' ? 'block' : 'none';
        }

        // 如果切换到自定义，触发一次表单切换
        if (source === 'custom') {
          this.toggleApiSourceForms();
        }

        logger.info('[DiaryAPIConfig] API来源已切换:', source);
      });
    }
  }

  /**
   * 绑定 API 类型选择事件
   */
  bindApiFormatEvents() {
    const formatSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiFormat')
    );

    if (formatSelect) {
      formatSelect.addEventListener('change', () => {
        const format = formatSelect.value;
        const settings = this.dataManager.getSettings();

        // 保存选择的格式
        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            format: format
          }
        });

        // 切换配置表单
        this.toggleApiSourceForms();

        // 重新渲染高级参数
        this.renderAdvancedParams();

        logger.info('[DiaryAPIConfig] API类型已切换:', format);
      });
    }
  }

  /**
   * 绑定流式开关事件
   */
  bindStreamToggle() {
    const streamCheckbox = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiStream')
    );

    if (streamCheckbox) {
      streamCheckbox.addEventListener('change', () => {
        const settings = this.dataManager.getSettings();

        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            stream: streamCheckbox.checked
          }
        });

        logger.info('[DiaryAPIConfig] 流式生成已', streamCheckbox.checked ? '启用' : '禁用');
      });
    }
  }

  /**
   * 绑定密码显示/隐藏按钮
   */
  bindPasswordToggles() {
    const togglePairs = [
      ['#diaryApiKeyToggle', '#diaryApiKey'],
      ['#diaryOpenRouterKeyToggle', '#diaryOpenRouterKey'],
      ['#diaryCustomApiKeyToggle', '#diaryCustomApiKey'],
      ['#diaryReverseProxyPasswordToggle', '#diaryReverseProxyPassword'],
      ['#diaryVertexApiKeyToggle', '#diaryVertexApiKey'],
      ['#diaryAzureApiKeyToggle', '#diaryAzureApiKey']
    ];

    togglePairs.forEach(([toggleSelector, inputSelector]) => {
      const toggle = this.panelElement.querySelector(toggleSelector);
      const input = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector(inputSelector)
      );

      if (toggle && input) {
        toggle.addEventListener('click', () => {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';

          const icon = toggle.querySelector('i');
          if (icon) {
            icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
          }
        });
      }
    });
  }

  /**
   * 绑定反向代理折叠事件
   */
  bindReverseProxyToggle() {
    const toggle = this.panelElement.querySelector('#diaryReverseProxyToggle');
    const content = this.panelElement.querySelector('#diaryReverseProxyContent');
    const icon = this.panelElement.querySelector('#diaryReverseProxyIcon');

    if (toggle && content && icon) {
      toggle.addEventListener('click', () => {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        icon.className = isHidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
      });
    }
  }

  /**
   * 绑定代理预设管理事件
   */
  bindProxyPresetEvents() {
    const presetSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryProxyPreset')
    );
    const saveBtn = this.panelElement.querySelector('#diaryProxySave');
    const deleteBtn = this.panelElement.querySelector('#diaryProxyDelete');
    const urlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyUrl')
    );
    const passwordInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyPassword')
    );

    // 选择预设
    if (presetSelect) {
      presetSelect.addEventListener('change', () => {
        const presetName = presetSelect.value;
        if (!presetName) {
          // 清空
          if (urlInput) urlInput.value = '';
          if (passwordInput) passwordInput.value = '';
          return;
        }

        const settings = this.dataManager.getSettings();
        const presets = settings.apiConfig.proxyPresets || [];
        const preset = presets.find(p => p.name === presetName);

        if (preset) {
          if (urlInput) urlInput.value = preset.url || '';
          if (passwordInput) passwordInput.value = preset.password || '';

          // 展开反向代理区域
          const content = this.panelElement.querySelector('#diaryReverseProxyContent');
          const icon = this.panelElement.querySelector('#diaryReverseProxyIcon');
          if (content) content.style.display = 'block';
          if (icon) icon.className = 'fa-solid fa-chevron-down';
        }
      });
    }

    // 保存预设
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const url = urlInput?.value.trim();
        if (!url) {
          showErrorToast('请先填写代理URL');
          return;
        }

        // 弹窗输入名称
        const name = prompt('请输入预设名称：');
        if (!name) return;

        const settings = this.dataManager.getSettings();
        const presets = [...(settings.apiConfig.proxyPresets || [])];

        // 检查是否已存在
        const existingIndex = presets.findIndex(p => p.name === name);
        const presetData = {
          name,
          url,
          password: passwordInput?.value.trim() || ''
        };

        if (existingIndex >= 0) {
          presets[existingIndex] = presetData;
        } else {
          presets.push(presetData);
        }

        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            proxyPresets: presets,
            currentProxyPreset: name
          }
        });

        this.refreshProxyPresetList();
        showSuccessToast(`预设「${name}」已保存`);
      });
    }

    // 删除预设
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const presetName = presetSelect?.value;
        if (!presetName) {
          showErrorToast('请先选择要删除的预设');
          return;
        }

        const settings = this.dataManager.getSettings();
        const presets = (settings.apiConfig.proxyPresets || []).filter(
          p => p.name !== presetName
        );

        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            proxyPresets: presets,
            currentProxyPreset: ''
          }
        });

        this.refreshProxyPresetList();
        if (urlInput) urlInput.value = '';
        if (passwordInput) passwordInput.value = '';
        showSuccessToast(`预设「${presetName}」已删除`);
      });
    }
  }


  /**
   * 绑定 Vertex AI 认证模式切换事件
   */
  bindVertexAuthModeEvents() {
    const authModeSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryVertexAuthMode')
    );
    const expressConfig = this.panelElement.querySelector('#diaryVertexExpressConfig');
    const fullConfig = this.panelElement.querySelector('#diaryVertexFullConfig');

    if (authModeSelect) {
      authModeSelect.addEventListener('change', () => {
        const mode = authModeSelect.value;

        if (expressConfig) {
          expressConfig.style.display = mode === 'express' ? 'block' : 'none';
        }
        if (fullConfig) {
          fullConfig.style.display = mode === 'full' ? 'block' : 'none';
        }

        // 保存认证模式
        const settings = this.dataManager.getSettings();
        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            vertexConfig: {
              ...(settings.apiConfig.vertexConfig || {}),
              authMode: mode
            }
          }
        });

        logger.debug('[DiaryAPIConfig] Vertex AI 认证模式切换:', mode);
      });
    }
  }

  /**
   * 绑定模型选择事件
   */
  bindModelSelectEvents() {
    const modelSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelSelect')
    );
    const manualWrapper = this.panelElement.querySelector('#diaryApiModelManualWrapper');
    const manualInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelManual')
    );

    if (modelSelect) {
      modelSelect.addEventListener('change', () => {
        const value = modelSelect.value;

        // 显示/隐藏手动输入框
        if (manualWrapper) {
          manualWrapper.style.display = value === '__manual__' ? 'block' : 'none';
        }

        // 保存模型选择
        if (value && value !== '__manual__') {
          this.saveModelSelection(value);
        }
      });
    }

    // 手动输入框变化时保存
    if (manualInput) {
      manualInput.addEventListener('change', () => {
        const value = manualInput.value.trim();
        if (value) {
          this.saveModelSelection(value);
        }
      });
    }

    // Custom API 的模型选择
    const customModelSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryCustomModelSelect')
    );
    const customModelInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryCustomModelId')
    );

    if (customModelSelect) {
      customModelSelect.addEventListener('change', () => {
        const value = customModelSelect.value;
        if (value && customModelInput) {
          customModelInput.value = value;
          this.saveCustomApiConfig();
        }
      });
    }

    if (customModelInput) {
      customModelInput.addEventListener('change', () => {
        this.saveCustomApiConfig();
      });
    }
  }

  /**
   * 绑定刷新模型列表事件
   */
  bindRefreshModelsEvents() {
    // 通用模型刷新
    const refreshBtn = this.panelElement.querySelector('#diaryApiRefreshModels');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refreshModelsFromAPI();
      });
    }

    // Custom API 模型刷新
    const customRefreshBtn = this.panelElement.querySelector('#diaryCustomRefreshModels');
    if (customRefreshBtn) {
      customRefreshBtn.addEventListener('click', () => {
        this.refreshCustomModelsFromAPI();
      });
    }
  }

  /**
   * 绑定测试连接事件
   */
  bindTestConnectionEvent() {
    const testBtn = this.panelElement.querySelector('#diaryApiTest');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        this.testApiConnection();
      });
    }
  }

  /**
   * 绑定高级参数折叠事件
   */
  bindParamsToggle() {
    const toggle = this.panelElement.querySelector('#diaryApiParamsToggle');
    const container = this.panelElement.querySelector('#diaryApiParamsContainer');
    const icon = this.panelElement.querySelector('#diaryApiParamsIcon');

    if (toggle && container && icon) {
      toggle.addEventListener('click', () => {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        icon.className = isHidden ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
      });
    }
  }

  // ========================================
  // [TOGGLE] 表单切换方法
  // ========================================

  /**
   * 根据 API 类型切换配置表单显示
   */
  toggleApiSourceForms() {
    const formatSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiFormat')
    );
    const currentFormat = formatSelect?.value || 'openai';

    // 获取所有带 data-diary-source 属性的区块
    const sections = this.panelElement.querySelectorAll('[data-diary-source]');

    sections.forEach(section => {
      const sources = section.getAttribute('data-diary-source')?.split(',') || [];
      const shouldShow = sources.includes(currentFormat);
      /** @type {HTMLElement} */ (section).style.display = shouldShow ? 'block' : 'none';
    });

    logger.debug('[DiaryAPIConfig] 表单已切换，当前格式:', currentFormat);
  }

  // ========================================
  // [LOAD] 加载方法
  // ========================================

  /**
   * 加载 API 设置到 UI
   */
  loadApiSettingsToUI() {
    const settings = this.dataManager.getSettings();
    const apiConfig = settings.apiConfig || {};

    // API 来源
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiSource')
    );
    if (apiSourceSelect) {
      apiSourceSelect.value = apiConfig.source || 'default';
    }

    // 流式开关
    const streamCheckbox = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiStream')
    );
    if (streamCheckbox) {
      streamCheckbox.checked = apiConfig.stream || false;
    }

    // 显示/隐藏自定义配置区域
    const customApiSettings = /** @type {HTMLElement|null} */ (
      this.panelElement.querySelector('#diaryCustomApiSettings')
    );
    if (customApiSettings) {
      customApiSettings.style.display = apiConfig.source === 'custom' ? 'block' : 'none';
    }

    // API 类型
    const formatSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiFormat')
    );
    if (formatSelect) {
      formatSelect.value = apiConfig.format || 'openai';
    }

    // 切换表单显示
    this.toggleApiSourceForms();

    // 加载通用 API 密钥
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiKey')
    );
    if (apiKeyInput) {
      apiKeyInput.value = apiConfig.apiKey || '';
    }

    // 加载 OpenRouter 密钥
    const openRouterKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryOpenRouterKey')
    );
    if (openRouterKeyInput) {
      openRouterKeyInput.value = apiConfig.openRouterKey || '';
    }

    // 加载模型
    const modelSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelSelect')
    );
    const manualInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelManual')
    );
    const manualWrapper = this.panelElement.querySelector('#diaryApiModelManualWrapper');

    if (modelSelect && apiConfig.model) {
      const modelInList = Array.from(modelSelect.options).some(
        opt => opt.value === apiConfig.model
      );

      if (modelInList) {
        modelSelect.value = apiConfig.model;
        if (manualWrapper) /** @type {HTMLElement} */ (manualWrapper).style.display = 'none';
      } else {
        modelSelect.value = '__manual__';
        if (manualInput) manualInput.value = apiConfig.model;
        if (manualWrapper) /** @type {HTMLElement} */ (manualWrapper).style.display = 'block';
      }
    }

    // 加载代理预设列表
    this.refreshProxyPresetList();

    // 加载反向代理配置
    this.loadReverseProxyConfig();

    // 加载 Custom API 配置
    this.loadCustomApiConfig();

    // 加载 Vertex AI 配置
    this.loadVertexAIConfig();

    // 加载 Azure OpenAI 配置
    this.loadAzureConfig();

    // 渲染高级参数
    this.renderAdvancedParams();

    logger.debug('[DiaryAPIConfig] API设置已加载到UI');
  }


  /**
   * 加载反向代理配置
   */
  loadReverseProxyConfig() {
    const settings = this.dataManager.getSettings();
    const apiConfig = settings.apiConfig || {};

    const urlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyUrl')
    );
    const passwordInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyPassword')
    );

    if (urlInput) urlInput.value = apiConfig.reverseProxyUrl || '';
    if (passwordInput) passwordInput.value = apiConfig.reverseProxyPassword || '';
  }

  /**
   * 加载 Custom API 配置
   */
  loadCustomApiConfig() {
    const settings = this.dataManager.getSettings();
    const customConfig = settings.apiConfig?.customApiConfig || {};

    const baseUrlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiBaseUrl')
    );
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryCustomApiKey')
    );
    const modelInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryCustomModelId')
    );

    if (baseUrlInput) baseUrlInput.value = customConfig.baseUrl || '';
    if (apiKeyInput) apiKeyInput.value = customConfig.apiKey || '';
    if (modelInput) modelInput.value = customConfig.model || '';
  }

  /**
   * 加载 Vertex AI 配置
   */
  loadVertexAIConfig() {
    const settings = this.dataManager.getSettings();
    const vertexConfig = settings.apiConfig?.vertexConfig || {};

    // 认证模式
    const authModeSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryVertexAuthMode')
    );
    if (authModeSelect) {
      authModeSelect.value = vertexConfig.authMode || 'express';
    }

    // 切换显示
    const expressConfig = this.panelElement.querySelector('#diaryVertexExpressConfig');
    const fullConfig = this.panelElement.querySelector('#diaryVertexFullConfig');
    const mode = vertexConfig.authMode || 'express';

    if (expressConfig) {
      /** @type {HTMLElement} */ (expressConfig).style.display = mode === 'express' ? 'block' : 'none';
    }
    if (fullConfig) {
      /** @type {HTMLElement} */ (fullConfig).style.display = mode === 'full' ? 'block' : 'none';
    }

    // API 密钥
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryVertexApiKey')
    );
    if (apiKeyInput) apiKeyInput.value = vertexConfig.apiKey || '';

    // 项目 ID
    const projectIdInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryVertexProjectId')
    );
    if (projectIdInput) projectIdInput.value = vertexConfig.projectId || '';

    // 服务账号
    const serviceAccountInput = /** @type {HTMLTextAreaElement|null} */ (
      this.panelElement.querySelector('#diaryVertexServiceAccount')
    );
    if (serviceAccountInput) serviceAccountInput.value = vertexConfig.serviceAccount || '';

    // 区域
    const regionInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryVertexRegion')
    );
    if (regionInput) regionInput.value = vertexConfig.region || 'us-central1';
  }

  /**
   * 加载 Azure OpenAI 配置
   */
  loadAzureConfig() {
    const settings = this.dataManager.getSettings();
    const azureConfig = settings.apiConfig?.azureConfig || {};

    const baseUrlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryAzureBaseUrl')
    );
    const deploymentInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryAzureDeploymentName')
    );
    const versionSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryAzureApiVersion')
    );
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryAzureApiKey')
    );
    const modelInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryAzureModelName')
    );

    if (baseUrlInput) baseUrlInput.value = azureConfig.baseUrl || '';
    if (deploymentInput) deploymentInput.value = azureConfig.deploymentName || '';
    if (versionSelect) versionSelect.value = azureConfig.apiVersion || '2024-02-15-preview';
    if (apiKeyInput) apiKeyInput.value = azureConfig.apiKey || '';
    if (modelInput) modelInput.value = azureConfig.modelName || '';
  }

  // ========================================
  // [SAVE] 保存方法
  // ========================================

  /**
   * 保存模型选择
   * @param {string} model - 模型名称
   */
  saveModelSelection(model) {
    const settings = this.dataManager.getSettings();
    this.dataManager.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        model: model
      }
    });
    logger.debug('[DiaryAPIConfig] 模型已保存:', model);
  }

  /**
   * 保存 Custom API 配置
   */
  saveCustomApiConfig() {
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiBaseUrl')
    );
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryCustomApiKey')
    );
    const modelInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryCustomModelId')
    );

    const settings = this.dataManager.getSettings();
    this.dataManager.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        customApiConfig: {
          baseUrl: baseUrlInput?.value.trim() || '',
          apiKey: apiKeyInput?.value.trim() || '',
          model: modelInput?.value.trim() || ''
        }
      }
    });

    logger.debug('[DiaryAPIConfig] Custom API 配置已保存');
  }

  /**
   * 保存参数值
   * @param {string} paramName - 参数名
   * @param {number} value - 参数值
   */
  saveParamValue(paramName, value) {
    const settings = this.dataManager.getSettings();
    const params = { ...(settings.apiConfig?.params || {}) };
    params[paramName] = value;

    this.dataManager.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        params: params
      }
    });

    logger.debug('[DiaryAPIConfig] 参数已保存:', paramName, '=', value);
  }

  // ========================================
  // [REFRESH] 刷新方法
  // ========================================

  /**
   * 刷新代理预设列表
   */
  refreshProxyPresetList() {
    const settings = this.dataManager.getSettings();
    const presets = settings.apiConfig?.proxyPresets || [];

    const select = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryProxyPreset')
    );
    if (!select) return;

    // 清空并重建
    select.innerHTML = '<option value="">无</option>';

    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.name;
      option.textContent = preset.name;
      select.appendChild(option);
    });

    // 选中当前预设
    if (settings.apiConfig?.currentProxyPreset) {
      select.value = settings.apiConfig.currentProxyPreset;
    }
  }


  /**
   * 从 API 刷新模型列表（通用）
   *
   * @description
   * 根据当前选择的 API 类型，获取对应的端点和密钥，
   * 然后调用 API 获取可用模型列表并更新下拉框。
   * 支持反向代理配置。
   *
   * @async
   * @returns {Promise<void>}
   */
  async refreshModelsFromAPI() {
    const settings = this.dataManager.getSettings();
    const format = settings.apiConfig?.format || 'openai';

    // 根据 API 类型获取端点和密钥
    let baseUrl = '';
    let apiKey = '';

    if (format === 'openrouter') {
      baseUrl = 'https://openrouter.ai/api';
      const keyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryOpenRouterKey')
      );
      apiKey = keyInput?.value.trim() || '';
    } else {
      // 检查是否有反向代理
      const proxyUrl = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryReverseProxyUrl')
      );
      const proxyPassword = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryReverseProxyPassword')
      );

      if (proxyUrl?.value.trim()) {
        baseUrl = proxyUrl.value.trim();
        apiKey = proxyPassword?.value.trim() || '';
      } else {
        // 使用通用 API 密钥和默认端点
        baseUrl = this.getDefaultBaseUrl(format);
        const keyInput = /** @type {HTMLInputElement|null} */ (
          this.panelElement.querySelector('#diaryApiKey')
        );
        apiKey = keyInput?.value.trim() || '';
      }
    }

    if (!apiKey) {
      showErrorToast('请先填写 API 密钥');
      return;
    }

    await this.fetchAndUpdateModels(baseUrl, apiKey, '#diaryApiModelSelect');
  }

  /**
   * 从 Custom API 刷新模型列表
   *
   * @description
   * 从用户填写的自定义端点获取模型列表，
   * 更新 Custom API 的模型下拉框和 datalist。
   *
   * @async
   * @returns {Promise<void>}
   */
  async refreshCustomModelsFromAPI() {
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiBaseUrl')
    );
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryCustomApiKey')
    );

    const baseUrl = baseUrlInput?.value.trim();
    const apiKey = apiKeyInput?.value.trim();

    if (!baseUrl) {
      showErrorToast('请先填写端点 URL');
      return;
    }

    await this.fetchAndUpdateModels(
      baseUrl,
      apiKey || '',
      '#diaryCustomModelSelect',
      '#diaryCustomModelList'
    );
  }

  /**
   * 获取并更新模型列表
   *
   * @description
   * 调用 API 的 /v1/models 端点获取可用模型，
   * 然后更新指定的下拉框和 datalist。
   *
   * @async
   * @param {string} baseUrl - API 端点
   * @param {string} apiKey - API 密钥
   * @param {string} selectSelector - 下拉框选择器
   * @param {string} [datalistSelector] - datalist 选择器（可选）
   * @returns {Promise<void>}
   */
  async fetchAndUpdateModels(baseUrl, apiKey, selectSelector, datalistSelector) {
    showInfoToast('正在获取模型列表...');
    logger.info('[DiaryAPIConfig] 开始获取模型列表, baseUrl:', baseUrl);

    try {
      // 清理 URL
      let cleanBaseUrl = baseUrl;
      if (cleanBaseUrl.endsWith('/v1')) {
        cleanBaseUrl = cleanBaseUrl.slice(0, -3);
      }
      const modelsUrl = `${cleanBaseUrl}/v1/models`;

      const headers = {
        'Content-Type': 'application/json'
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(modelsUrl, { headers });

      if (!response.ok) {
        throw new Error(`API 返回错误: ${response.status}`);
      }

      const data = await response.json();

      // 提取模型列表
      let models = [];
      if (data.data && Array.isArray(data.data)) {
        models = data.data.map(m => m.id || m).filter(m => m);
      } else if (Array.isArray(data)) {
        models = data.map(m => m.id || m).filter(m => m);
      }

      if (models.length === 0) {
        showErrorToast('未获取到模型列表');
        return;
      }

      // 更新下拉框
      const select = /** @type {HTMLSelectElement|null} */ (
        this.panelElement.querySelector(selectSelector)
      );
      if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">请选择模型...</option>';

        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          select.appendChild(option);
        });

        // 添加手动输入选项（如果是通用模型选择器）
        if (selectSelector === '#diaryApiModelSelect') {
          const manualOption = document.createElement('option');
          manualOption.value = '__manual__';
          manualOption.textContent = '手动输入...';
          select.appendChild(manualOption);
        }

        // 恢复选择
        if (currentValue && models.includes(currentValue)) {
          select.value = currentValue;
        }
      }

      // 更新 datalist（如果有）
      if (datalistSelector) {
        const datalist = this.panelElement.querySelector(datalistSelector);
        if (datalist) {
          datalist.innerHTML = '';
          models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            datalist.appendChild(option);
          });
        }
      }

      showSuccessToast(`已获取 ${models.length} 个模型`);
      logger.info('[DiaryAPIConfig] 模型列表已更新，共', models.length, '个');

    } catch (error) {
      logger.error('[DiaryAPIConfig] 获取失败:', error);
      showErrorToast('获取模型列表失败：' + error.message);
    }
  }

  /**
   * 获取 API 类型的默认端点
   * @param {string} format - API 类型
   * @returns {string} 默认端点 URL
   */
  getDefaultBaseUrl(format) {
    const defaultUrls = {
      openai: 'https://api.openai.com',
      claude: 'https://api.anthropic.com',
      makersuite: 'https://generativelanguage.googleapis.com',
      deepseek: 'https://api.deepseek.com',
      mistralai: 'https://api.mistral.ai',
      cohere: 'https://api.cohere.ai',
      perplexity: 'https://api.perplexity.ai',
      groq: 'https://api.groq.com/openai',
      xai: 'https://api.x.ai',
      ai21: 'https://api.ai21.com',
      moonshot: 'https://api.moonshot.cn',
      fireworks: 'https://api.fireworks.ai/inference',
      electronhub: 'https://api.electronhub.top',
      chutes: 'https://llm.chutes.ai',
      nanogpt: 'https://nano-gpt.com/api',
      aimlapi: 'https://api.aimlapi.com',
      pollinations: 'https://text.pollinations.ai',
      siliconflow: 'https://api.siliconflow.cn',
      zai: 'https://open.bigmodel.cn/api/paas'
    };

    return defaultUrls[format] || 'https://api.openai.com';
  }


  // ========================================
  // [PARAMS] 高级参数渲染
  // ========================================

  /**
   * 渲染高级参数UI（根据API格式动态生成）
   *
   * @description
   * 根据选择的API格式，动态生成对应的参数配置UI（温度、Top P等）
   * 参考手机模块实现，确保参数实时保存到 extension_settings
   */
  renderAdvancedParams() {
    const container = this.panelElement.querySelector('#diaryApiParamsContainer');
    if (!container) {
      logger.warn('[DiaryAPIConfig.renderAdvancedParams] 未找到参数容器');
      return;
    }

    const settings = this.dataManager.getSettings();
    const format = settings.apiConfig?.format || 'openai';

    // 获取当前格式支持的参数
    const supportedParams = getSupportedParams(format);
    const defaultParams = getDefaultParams(format);

    logger.debug('[DiaryAPIConfig.renderAdvancedParams] 开始渲染参数，格式:', format, '参数列表:', supportedParams);

    // 清理不支持的旧参数（避免格式切换后残留）
    this.cleanUnsupportedParams(format, supportedParams);

    // 清空容器
    container.innerHTML = '';

    // 渲染每个参数
    supportedParams.forEach(paramName => {
      const definition = PARAMS_DEFINITIONS[paramName];
      if (!definition) {
        logger.warn('[DiaryAPIConfig.renderAdvancedParams] 未知参数定义:', paramName);
        return;
      }

      const paramHtml = `
        <div class="diary-param-item" data-param="${paramName}">
          <div class="diary-param-header">
            <span class="diary-param-label">${definition.label}</span>
            <span class="diary-param-range">(${definition.min} - ${definition.max})</span>
          </div>
          <div class="diary-param-controls">
            <input type="range"
              id="diaryParam_${paramName}"
              class="diary-param-slider"
              min="${definition.min}"
              max="${definition.max}"
              step="${definition.step}"
              value="${definition.default}"
            />
            <input type="number"
              id="diaryParamNumber_${paramName}"
              class="diary-param-number"
              min="${definition.min}"
              max="${definition.max}"
              step="${definition.step}"
              value="${definition.default}"
            />
          </div>
          <div class="diary-param-hint">${definition.hint}</div>
        </div>
      `;

      container.insertAdjacentHTML('beforeend', paramHtml);

      // 绑定双向同步事件（参考手机模块）
      const rangeInput = /** @type {HTMLInputElement|null} */ (
        container.querySelector(`#diaryParam_${paramName}`)
      );
      const numberInput = /** @type {HTMLInputElement|null} */ (
        container.querySelector(`#diaryParamNumber_${paramName}`)
      );

      if (rangeInput && numberInput) {
        // 滑块 → 数字框 + 实时保存
        rangeInput.addEventListener('input', () => {
          numberInput.value = rangeInput.value;
          this.saveParamValue(paramName, parseFloat(rangeInput.value));
        });

        // 数字框 → 滑块 + 实时保存
        numberInput.addEventListener('input', () => {
          rangeInput.value = numberInput.value;
          this.saveParamValue(paramName, parseFloat(numberInput.value));
        });
      }
    });

    // 加载保存的参数值到UI（关键！）
    this.loadParamValuesToUI(format);

    logger.info('[DiaryAPIConfig.renderAdvancedParams] ✅ 参数UI已渲染，共', supportedParams.length, '个参数');
  }

  /**
   * 清理不支持的旧参数（避免格式切换后残留）
   *
   * @param {string} format - 当前API格式
   * @param {Array<string>} supportedParams - 当前格式支持的参数列表
   */
  cleanUnsupportedParams(format, supportedParams) {
    const settings = this.dataManager.getSettings();
    const savedParams = settings.apiConfig?.params || {};
    const cleanedParams = {};

    // 只保留当前格式支持的参数
    for (const paramName of supportedParams) {
      if (savedParams[paramName] !== undefined) {
        cleanedParams[paramName] = savedParams[paramName];
      }
    }

    // 如果有参数被清理，更新存储
    const oldCount = Object.keys(savedParams).length;
    const newCount = Object.keys(cleanedParams).length;
    if (oldCount !== newCount) {
      this.dataManager.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          params: cleanedParams
        }
      });
      logger.debug('[DiaryAPIConfig.cleanUnsupportedParams] 已清理', oldCount - newCount, '个不支持的参数');
    }
  }

  /**
   * 加载参数值到UI（从 extension_settings 读取）
   *
   * @description
   * 页面加载时，从持久化存储读取已保存的参数值，
   * 并同步到滑块和数字输入框。
   * 如果没有保存过，则使用默认值并保存。
   *
   * @param {string} format - API格式
   */
  loadParamValuesToUI(format) {
    const settings = this.dataManager.getSettings();
    const savedParams = settings.apiConfig?.params || {};
    const supportedParams = getSupportedParams(format);
    const defaultParams = getDefaultParams(format);

    // 用于收集需要保存的默认值
    const paramsToSave = { ...savedParams };
    let needsSave = false;

    for (const paramName of supportedParams) {
      const definition = PARAMS_DEFINITIONS[paramName];
      if (!definition) continue;

      // 优先使用已保存的值，否则使用默认值
      let value = savedParams[paramName];
      if (value === undefined) {
        value = defaultParams[paramName] ?? definition.default;
        // 首次加载时保存默认值（确保API调用时有值）
        paramsToSave[paramName] = value;
        needsSave = true;
      }

      const rangeInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector(`#diaryParam_${paramName}`)
      );
      const numberInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector(`#diaryParamNumber_${paramName}`)
      );

      if (rangeInput && numberInput) {
        rangeInput.value = String(value);
        numberInput.value = String(value);
        logger.debug('[DiaryAPIConfig.loadParamValuesToUI] 已加载参数:', paramName, '=', value);
      }
    }

    // 如果有默认值需要保存，一次性保存
    if (needsSave) {
      this.dataManager.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          params: paramsToSave
        }
      });
      logger.info('[DiaryAPIConfig.loadParamValuesToUI] 已保存默认参数值');
    }
  }

  // ========================================
  // [TEST] 测试连接
  // ========================================

  /**
   * 测试 API 连接
   */
  async testApiConnection() {
    showInfoToast('正在测试连接...');
    logger.info('[DiaryAPIConfig] 开始测试 API 连接');

    try {
      const config = this.getCurrentConfig();

      if (!config.model) {
        showErrorToast('请先选择模型');
        return;
      }

      // 构造简单的测试消息
      const testMessages = [
        { role: 'user', content: '测试连接，请回复"OK"' }
      ];

      // 使用事件拦截机制测试（和实际发送一致）
      // 这里简化为直接调用 API
      const response = await this.sendTestRequest(testMessages, config);

      if (response && response.length > 0) {
        showSuccessToast('API 连接成功！');
        logger.info('[DiaryAPIConfig] 测试成功，响应长度:', response.length);
      } else {
        showErrorToast('API 返回空响应');
      }

    } catch (error) {
      logger.error('[DiaryAPIConfig] 测试失败:', error);
      showErrorToast('连接失败：' + error.message);
    }
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前 API 配置
   */
  getCurrentConfig() {
    const settings = this.dataManager.getSettings();
    const apiConfig = settings.apiConfig || {};
    const format = apiConfig.format || 'openai';

    let config = {
      format: format,
      stream: apiConfig.stream || false,
      model: apiConfig.model || '',
      params: apiConfig.params || {}
    };

    // 根据 API 类型获取特定配置
    if (format === 'openrouter') {
      const keyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryOpenRouterKey')
      );
      config.apiKey = keyInput?.value.trim() || apiConfig.openRouterKey || '';
      config.baseUrl = 'https://openrouter.ai/api';
    } else if (format === 'custom') {
      const customConfig = apiConfig.customApiConfig || {};
      config.baseUrl = customConfig.baseUrl || '';
      config.apiKey = customConfig.apiKey || '';
      config.model = customConfig.model || '';
    } else if (format === 'vertexai') {
      const vertexConfig = apiConfig.vertexConfig || {};
      config.vertexConfig = vertexConfig;
    } else if (format === 'azure_openai') {
      const azureConfig = apiConfig.azureConfig || {};
      config.azureConfig = azureConfig;
    } else {
      // 通用 API
      const keyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryApiKey')
      );
      config.apiKey = keyInput?.value.trim() || apiConfig.apiKey || '';

      // 检查反向代理
      const proxyUrl = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryReverseProxyUrl')
      );
      const proxyPassword = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryReverseProxyPassword')
      );

      if (proxyUrl?.value.trim()) {
        config.baseUrl = proxyUrl.value.trim();
        config.proxyPassword = proxyPassword?.value.trim() || '';
      } else {
        config.baseUrl = this.getDefaultBaseUrl(format);
      }
    }

    return config;
  }

  /**
   * 发送测试请求
   * @param {Array} messages - 消息数组
   * @param {Object} config - API 配置
   * @returns {Promise<string>} 响应文本
   */
  async sendTestRequest(messages, config) {
    // 简化的测试请求，直接调用 OpenAI 兼容 API
    let url = config.baseUrl || 'https://api.openai.com';
    if (!url.endsWith('/v1')) {
      url += '/v1';
    }
    url += '/chat/completions';

    const body = {
      model: config.model || 'gpt-4o-mini',
      messages: messages,
      max_tokens: 50,
      stream: false
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    if (config.proxyPassword) {
      headers['Authorization'] = `Bearer ${config.proxyPassword}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 错误 ${response.status}: ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
