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
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from './diary-toast.js';
import { generate } from '../../shared/api/api-client.js';
import { refreshModelList } from '../../shared/api/api-model-refresh.js';
import { resolveSource, SOURCE_CAPABILITIES, getDefaultUrl } from '../../shared/api/api-config-schema.js';
import {
  getParamDefinitions,
  getSupportedParams,
  getDefaultParams
} from '../../shared/api/api-params-config.js';

const NO_VALIDATE_SOURCES = new Set(['claude', 'ai21', 'vertexai', 'perplexity', 'zai']);
const PARAMS_DEFINITIONS = getParamDefinitions('diary');

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
   * 更新 apiConfig 并持久化。
   *
   * @param {Object} patch - apiConfig 局部更新字段。
   * @returns {void}
   */
  updateApiConfig(patch) {
    const settings = this.dataManager.getSettings();
    this.dataManager.updateSettings({
      apiConfig: {
        ...(settings.apiConfig || {}),
        ...patch
      }
    });
  }

  /**
   * 清空模型选择与手动输入状态。
   *
   * @returns {void}
   */
  clearModelOptions() {
    const modelSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelSelect')
    );
    const customModelSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryCustomModelSelect')
    );
    const manualWrapper = /** @type {HTMLElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelManualWrapper')
    );
    const manualInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelManual')
    );

    if (modelSelect) {
      modelSelect.innerHTML = `
        <option value="">请选择模型...</option>
        <option value="__manual__">手动输入...</option>
      `;
    }
    if (customModelSelect) {
      customModelSelect.innerHTML = '<option value="">无</option>';
    }
    if (manualWrapper) {
      manualWrapper.style.display = 'none';
    }
    if (manualInput) {
      manualInput.value = '';
    }
  }

  /**
   * 获取 API 类型下拉中的可用格式列表。
   *
   * @returns {Set<string>} 可用格式集合。
   */
  getAvailableFormats() {
    const formatSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiFormat')
    );
    const values = new Set();
    if (!formatSelect) {
      return values;
    }

    Array.from(formatSelect.options).forEach((option) => {
      if (option.value && !option.disabled) {
        values.add(option.value);
      }
    });
    return values;
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

    // 输入框统一持久化
    this.bindInputPersistenceEvents();

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

    logger.debug('diary', '[DiaryAPIConfig]] API设置事件已绑定');
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
      apiSourceSelect.addEventListener('change', async () => {
        const source = apiSourceSelect.value;
        this.updateApiConfig({ source: source });
        this.clearModelOptions();

        if (customApiSettings) {
          customApiSettings.style.display = source === 'custom' ? 'block' : 'none';
        }

        if (source === 'custom') {
          await this.handleApiFormatChange();
        }

        logger.debug('diary', '[DiaryAPIConfig] API来源已切换:', source);
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
      formatSelect.addEventListener('change', async () => {
        const format = formatSelect.value;
        this.updateApiConfig({ format: format });
        await this.handleApiFormatChange();
        logger.debug('diary', '[DiaryAPIConfig] API类型已切换:', format);
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

        logger.info('diary', '[DiaryAPIConfig]] 流式生成已', streamCheckbox.checked ? '启用' : '禁用');
      });
    }
  }

  /**
   * 绑定输入框持久化事件（input/change）。
   *
   * @returns {void}
   */
  bindInputPersistenceEvents() {
    /**
     * 为单个输入元素绑定持久化事件。
     *
     * @param {string} selector - 输入元素选择器。
     * @param {(value: string) => void} onPersist - 保存回调。
     * @returns {void}
     */
    const bindPersist = (selector, onPersist) => {
      const input = /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null} */ (
        this.panelElement.querySelector(selector)
      );
      if (!input) {
        return;
      }

      const persist = () => {
        onPersist(input.value.trim());
      };
      input.addEventListener('input', persist);
      input.addEventListener('change', persist);
    };

    bindPersist('#diaryApiKey', (value) => this.updateApiConfig({ apiKey: value }));
    bindPersist('#diaryOpenRouterKey', (value) => this.updateApiConfig({ openRouterKey: value }));
    bindPersist('#diaryReverseProxyUrl', (value) => this.updateApiConfig({ reverseProxyUrl: value }));
    bindPersist('#diaryReverseProxyPassword', (value) => {
      this.updateApiConfig({ reverseProxyPassword: value });
    });

    bindPersist('#diaryApiBaseUrl', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        customApiConfig: {
          ...(settings.apiConfig?.customApiConfig || {}),
          baseUrl: value
        }
      });
    });
    bindPersist('#diaryCustomApiKey', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        customApiConfig: {
          ...(settings.apiConfig?.customApiConfig || {}),
          apiKey: value
        }
      });
    });
    bindPersist('#diaryCustomModelId', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        customApiConfig: {
          ...(settings.apiConfig?.customApiConfig || {}),
          model: value
        }
      });
    });

    bindPersist('#diaryVertexApiKey', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        vertexConfig: {
          ...(settings.apiConfig?.vertexConfig || {}),
          apiKey: value
        }
      });
    });
    bindPersist('#diaryVertexProjectId', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        vertexConfig: {
          ...(settings.apiConfig?.vertexConfig || {}),
          projectId: value
        }
      });
    });
    bindPersist('#diaryVertexServiceAccount', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        vertexConfig: {
          ...(settings.apiConfig?.vertexConfig || {}),
          serviceAccount: value
        }
      });
    });
    bindPersist('#diaryVertexRegion', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        vertexConfig: {
          ...(settings.apiConfig?.vertexConfig || {}),
          region: value
        }
      });
    });

    bindPersist('#diaryAzureBaseUrl', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        azureConfig: {
          ...(settings.apiConfig?.azureConfig || {}),
          baseUrl: value
        }
      });
    });
    bindPersist('#diaryAzureDeploymentName', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        azureConfig: {
          ...(settings.apiConfig?.azureConfig || {}),
          deploymentName: value
        }
      });
    });
    bindPersist('#diaryAzureApiVersion', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        azureConfig: {
          ...(settings.apiConfig?.azureConfig || {}),
          apiVersion: value
        }
      });
    });
    bindPersist('#diaryAzureApiKey', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        azureConfig: {
          ...(settings.apiConfig?.azureConfig || {}),
          apiKey: value
        }
      });
    });
    bindPersist('#diaryAzureModelName', (value) => {
      const settings = this.dataManager.getSettings();
      this.updateApiConfig({
        azureConfig: {
          ...(settings.apiConfig?.azureConfig || {}),
          modelName: value
        }
      });
    });
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
          this.updateApiConfig({
            reverseProxyUrl: '',
            reverseProxyPassword: '',
            currentProxyPreset: ''
          });
          return;
        }

        const settings = this.dataManager.getSettings();
        const presets = settings.apiConfig.proxyPresets || [];
        const preset = presets.find(p => p.name === presetName);

        if (preset) {
          if (urlInput) urlInput.value = preset.url || '';
          if (passwordInput) passwordInput.value = preset.password || '';
          this.updateApiConfig({
            reverseProxyUrl: preset.url || '',
            reverseProxyPassword: preset.password || '',
            currentProxyPreset: presetName
          });

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

        logger.debug('diary', '[DiaryAPIConfig]] Vertex AI 认证模式切换:', mode);
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
        this.refreshModelsFromAPI();
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

  /**
   * 处理 API 类型切换后的完整事件链。
   *
   * @async
   * @returns {Promise<void>}
   */
  async handleApiFormatChange() {
    this.clearModelOptions();
    this.toggleApiSourceForms();
    this.renderAdvancedParams();
    await this.refreshModelsFromAPI();
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

    logger.debug('diary', '[DiaryAPIConfig]] 表单已切换，当前格式:', currentFormat);
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
    const availableFormats = this.getAvailableFormats();
    const savedFormat = apiConfig.format || 'openai';
    const normalizedFormat = availableFormats.has(savedFormat) ? savedFormat : 'openai';
    if (formatSelect) {
      formatSelect.value = normalizedFormat;
    }
    if (savedFormat !== normalizedFormat) {
      this.updateApiConfig({ format: normalizedFormat });
      logger.debug('diary', '[DiaryAPIConfig] 已修正无效 API 类型:', savedFormat, '->', normalizedFormat);
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

    logger.debug('diary', '[DiaryAPIConfig]] API设置已加载到UI');
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
    logger.debug('diary', '[DiaryAPIConfig]] 模型已保存:', model);
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

    logger.debug('diary', '[DiaryAPIConfig]] Custom API 配置已保存');
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

    logger.debug('diary', '[DiaryAPIConfig]] 参数已保存:', paramName, '=', value);
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
   * 构造共享模型刷新所需配置。
   *
   * @param {string} format - 当前 UI 选择格式。
   * @returns {Object} 刷新配置对象。
   */
  buildSharedRefreshConfig(format) {
    const source = resolveSource(format);
    const reverseProxyUrlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyUrl')
    );
    const reverseProxyPasswordInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyPassword')
    );
    const reverseProxyUrl = reverseProxyUrlInput?.value.trim() || '';
    const reverseProxyPassword = reverseProxyPasswordInput?.value.trim() || '';

    if (format === 'custom') {
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryApiBaseUrl')
      );
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryCustomApiKey')
      );
      const customUrl = baseUrlInput?.value.trim() || '';
      const customApiKey = apiKeyInput?.value.trim() || '';

      if (customApiKey) {
        return {
          source: 'openai',
          baseUrl: customUrl,
          apiKey: customApiKey
        };
      }

      return {
        source: 'custom',
        customUrl: customUrl
      };
    }

    if (format === 'openrouter') {
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryOpenRouterKey')
      );
      return {
        source: source,
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: apiKeyInput?.value.trim() || ''
      };
    }

    if (format === 'azure_openai') {
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryAzureBaseUrl')
      );
      const deploymentInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryAzureDeploymentName')
      );
      const versionSelect = /** @type {HTMLSelectElement|null} */ (
        this.panelElement.querySelector('#diaryAzureApiVersion')
      );
      return {
        source: source,
        azureConfig: {
          baseUrl: baseUrlInput?.value.trim() || '',
          deploymentName: deploymentInput?.value.trim() || '',
          apiVersion: versionSelect?.value.trim() || ''
        }
      };
    }

    const apiKeyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiKey')
    );
    const supportsReverseProxy = SOURCE_CAPABILITIES[source]?.supportsReverseProxy === true;
    const useReverseProxy = supportsReverseProxy && Boolean(reverseProxyUrl);

    return {
      source: source,
      baseUrl: useReverseProxy ? reverseProxyUrl : '',
      apiKey: useReverseProxy ? reverseProxyPassword : (apiKeyInput?.value.trim() || '')
    };
  }

  /**
   * 刷新主模型下拉选项。
   *
   * @param {string[]} models - 模型名数组。
   * @returns {void}
   */
  updateMainModelSelect(models) {
    const select = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelSelect')
    );
    if (!select) {
      return;
    }

    const currentValue = select.value;
    select.innerHTML = '<option value="">请选择模型...</option>';
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.appendChild(option);
    });

    const manualOption = document.createElement('option');
    manualOption.value = '__manual__';
    manualOption.textContent = '手动输入...';
    select.appendChild(manualOption);

    if (currentValue && models.includes(currentValue)) {
      select.value = currentValue;
    }
  }

  /**
   * 刷新 Custom 模型下拉与 datalist。
   *
   * @param {string[]} models - 模型名数组。
   * @returns {void}
   */
  updateCustomModelSelect(models) {
    const select = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryCustomModelSelect')
    );
    const datalist = this.panelElement.querySelector('#diaryCustomModelList');

    if (select) {
      const currentValue = select.value;
      select.innerHTML = '<option value="">无</option>';
      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
      });
      if (currentValue && models.includes(currentValue)) {
        select.value = currentValue;
      }
    }

    if (datalist) {
      datalist.innerHTML = '';
      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        datalist.appendChild(option);
      });
    }
  }

  /**
   * 从 ST 后端刷新模型列表（共享刷新链）。
   *
   * @async
   * @returns {Promise<void>}
   */
  async refreshModelsFromAPI() {
    const settings = this.dataManager.getSettings();
    if (settings.apiConfig?.source !== 'custom') {
      return;
    }
    const format = settings.apiConfig?.format || 'openai';
    const refreshConfig = this.buildSharedRefreshConfig(format);
    const source = resolveSource(format);
    const baseUrl = refreshConfig.baseUrl || refreshConfig.customUrl || '';
    const requiresCustomUrl = source === 'custom' || (format === 'custom' && source === 'openai');

    if (requiresCustomUrl && !baseUrl) {
      showErrorToast('请先填写 API 端点或反向代理 URL');
      return;
    }

    showInfoToast('正在获取模型列表...');
    logger.debug('diary', '[DiaryAPIConfig] 开始获取模型列表（共享刷新链）', {
      source: refreshConfig.source,
      hasReverseProxy: Boolean(refreshConfig.baseUrl),
      hasCustomUrl: Boolean(refreshConfig.customUrl)
    });

    try {
      const result = await refreshModelList(refreshConfig);
      if (!result.success) {
        throw new Error(result.error || '模型刷新失败');
      }

      const models = (result.models || [])
        .map((model) => model?.id)
        .filter((model) => typeof model === 'string' && model.length > 0);

      if (models.length === 0) {
        this.updateMainModelSelect([]);
        this.updateCustomModelSelect([]);

        const manualWrapper = /** @type {HTMLElement|null} */ (
          this.panelElement.querySelector('#diaryApiModelManualWrapper')
        );
        if (manualWrapper) {
          manualWrapper.style.display = 'block';
        }

        if (NO_VALIDATE_SOURCES.has(source)) {
          showInfoToast('当前来源不返回模型列表，请手动输入模型名称');
        } else {
          showErrorToast('未获取到模型列表');
        }
        return;
      }

      this.updateMainModelSelect(models);
      this.updateCustomModelSelect(models);

      showSuccessToast(`已获取 ${models.length} 个模型`);
      logger.debug('diary', '[DiaryAPIConfig] 模型列表已更新，共', models.length, '个');
    } catch (error) {
      logger.error('diary', '[DiaryAPIConfig] 获取失败:', error);
      showErrorToast('获取模型列表失败：' + error.message);
    }
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
      logger.warn('diary', '[DiaryAPIConfig.renderAdvancedParams] 未找到参数容器');
      return;
    }

    const settings = this.dataManager.getSettings();
    const format = settings.apiConfig?.format || 'openai';

    // 获取当前格式支持的参数
    const supportedParams = getSupportedParams(format, 'diary');
    const defaultParams = getDefaultParams(format, 'diary');

    logger.debug('diary', '[DiaryAPIConfig].renderAdvancedParams] 开始渲染参数，格式:', format, '参数列表:', supportedParams);

    // 清理不支持的旧参数（避免格式切换后残留）
    this.cleanUnsupportedParams(format, supportedParams);

    // 清空容器
    container.innerHTML = '';

    // 渲染每个参数
    supportedParams.forEach(paramName => {
      const definition = PARAMS_DEFINITIONS[paramName];
      if (!definition) {
        logger.warn('diary', '[DiaryAPIConfig.renderAdvancedParams] 未知参数定义:', paramName);
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

    logger.info('diary', '[DiaryAPIConfig].renderAdvancedParams] ✅ 参数UI已渲染，共', supportedParams.length, '个参数');
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
      logger.debug('diary', '[DiaryAPIConfig].cleanUnsupportedParams] 已清理', oldCount - newCount, '个不支持的参数');
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
    const supportedParams = getSupportedParams(format, 'diary');
    const defaultParams = getDefaultParams(format, 'diary');

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
        logger.debug('diary', '[DiaryAPIConfig].loadParamValuesToUI] 已加载参数:', paramName, '=', value);
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
      logger.info('diary', '[DiaryAPIConfig].loadParamValuesToUI] 已保存默认参数值');
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
    logger.info('diary', '[DiaryAPIConfig]] 开始测试 API 连接');

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
        logger.info('diary', '[DiaryAPIConfig]] 测试成功，响应长度:', response.length);
      } else {
        showErrorToast('API 返回空响应');
      }

    } catch (error) {
      logger.error('diary', '[DiaryAPIConfig] 测试失败:', error);
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
    const source = resolveSource(format);
    const params = apiConfig.params || {};
    const config = {
      source: source,
      stream: false,
      model: this.resolveModelForTest(source),
      maxTokens: params.max_tokens ?? params.maxTokens,
      temperature: params.temperature,
      topP: params.top_p ?? params.topP,
      topK: params.top_k ?? params.topK,
      frequencyPenalty: params.frequency_penalty ?? params.frequencyPenalty,
      presencePenalty: params.presence_penalty ?? params.presencePenalty,
      repetitionPenalty: params.repetition_penalty ?? params.repetitionPenalty,
      minP: params.min_p ?? params.minP,
      topA: params.top_a ?? params.topA
    };

    if (format === 'openrouter') {
      const keyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryOpenRouterKey')
      );
      config.baseUrl = 'https://openrouter.ai/api/v1';
      config.apiKey = keyInput?.value.trim() || apiConfig.openRouterKey || '';
      return config;
    }

    if (format === 'custom') {
      const customConfig = apiConfig.customApiConfig || {};
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryApiBaseUrl')
      );
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryCustomApiKey')
      );
      const modelInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryCustomModelId')
      );
      config.customUrl = baseUrlInput?.value.trim() || customConfig.baseUrl || '';
      config.apiKey = apiKeyInput?.value.trim() || customConfig.apiKey || '';
      config.model = modelInput?.value.trim() || customConfig.model || '';
      return config;
    }

    if (format === 'vertexai') {
      const vertexConfig = apiConfig.vertexConfig || {};
      const authMode = vertexConfig.authMode || 'express';
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryVertexApiKey')
      );
      const proxyUrlInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryReverseProxyUrl')
      );
      const proxyPasswordInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryReverseProxyPassword')
      );
      config.baseUrl = proxyUrlInput?.value.trim() || getDefaultUrl(resolveSource(format));
      config.apiKey = proxyUrlInput?.value.trim()
        ? (proxyPasswordInput?.value.trim() || '')
        : (authMode === 'express'
          ? (apiKeyInput?.value.trim() || vertexConfig.apiKey || '')
          : '');
      return config;
    }

    if (format === 'azure_openai') {
      const azureConfig = apiConfig.azureConfig || {};
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

      config.azureConfig = {
        baseUrl: baseUrlInput?.value.trim() || azureConfig.baseUrl || '',
        deploymentName: deploymentInput?.value.trim() || azureConfig.deploymentName || '',
        apiVersion: versionSelect?.value.trim() || azureConfig.apiVersion || ''
      };
      config.apiKey = apiKeyInput?.value.trim() || azureConfig.apiKey || '';
      config.model = modelInput?.value.trim() || azureConfig.modelName || config.model;
      return config;
    }

    const keyInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiKey')
    );
    const proxyUrlInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyUrl')
    );
    const proxyPasswordInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryReverseProxyPassword')
    );
    const supportsReverseProxy = SOURCE_CAPABILITIES[source]?.supportsReverseProxy === true;
    const proxyUrl = proxyUrlInput?.value.trim() || '';

    if (supportsReverseProxy && proxyUrl) {
      config.baseUrl = proxyUrl;
      config.apiKey = proxyPasswordInput?.value.trim() || '';
    } else {
      config.baseUrl = getDefaultUrl(resolveSource(format));
      config.apiKey = keyInput?.value.trim() || apiConfig.apiKey || '';
    }

    return config;
  }

  /**
   * 解析测试连接使用的模型名。
   *
   * @param {string} source - chat completion source。
   * @returns {string} 模型名。
   */
  resolveModelForTest(source) {
    if (source === 'azure_openai') {
      const modelInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryAzureModelName')
      );
      return modelInput?.value.trim() || '';
    }

    if (source === 'custom') {
      const modelInput = /** @type {HTMLInputElement|null} */ (
        this.panelElement.querySelector('#diaryCustomModelId')
      );
      return modelInput?.value.trim() || '';
    }

    const modelSelect = /** @type {HTMLSelectElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelSelect')
    );
    const manualInput = /** @type {HTMLInputElement|null} */ (
      this.panelElement.querySelector('#diaryApiModelManual')
    );

    if (modelSelect?.value === '__manual__') {
      return manualInput?.value.trim() || '';
    }
    if (modelSelect?.value) {
      return modelSelect.value.trim();
    }

    const settings = this.dataManager.getSettings();
    return settings.apiConfig?.model || '';
  }

  /**
   * 发送测试请求（走 ST 后端 generate 路径）
   *
   * @param {Array} messages - 消息数组
   * @param {Object} config - API 配置
   * @returns {Promise<string>} 响应文本
   */
  async sendTestRequest(messages, config) {
    const response = await generate(config, messages, { module: 'diary' });
    return response.text || '';
  }
}
