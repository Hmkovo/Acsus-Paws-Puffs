/**
 * 变量模块 - API配置管理模块
 *
 * @description
 * 负责管理自定义API配置：
 * - 保存/加载/删除配置
 * - 配置列表管理
 * - 从API刷新模型列表
 * - 测试API连接
 * - 绑定API设置事件
 *
 * @module VariableAPIConfig
 * @changelog
 * - 2026-01-13: 从手机模块复制，作为变量模块独立的API配置管理器
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { oai_settings } from '../../../../openai.js';
import logger from '../logger.js';
import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSupportedParams, getParamDefinitions } from '../shared/api/api-params-config.js';
import { refreshModelList } from '../shared/api/api-model-refresh.js';
import { resolveSource, SOURCE_CAPABILITIES } from '../shared/api/api-config-schema.js';

/**
 * 显示确认弹窗
 * @param {string} title - 标题
 * @param {string} message - 消息
 * @returns {Promise<boolean>} 是否确认
 */
async function showConfirmPopup(title, message) {
  // 使用原生 confirm（简单实现）
  return confirm(`${title}\n\n${message}`);
}

// ========================================
// [CONST] 常量
// ========================================
const EXT_ID = 'acsusPawsPuffs';
const MODULE_NAME = 'variables_v2';
const NO_VALIDATE_SOURCES = new Set(['claude', 'ai21', 'vertexai', 'perplexity', 'zai']);
const PARAMS_DEFINITIONS = getParamDefinitions('variable');

// ========================================
// [CORE] API配置管理类
// ========================================

/**
 * API配置管理器
 *
 * @class VariableAPIConfig
 */
export class VariableAPIConfig {
  /**
   * 创建API配置管理器
   *
   * @param {HTMLElement} pageElement - API设置页面元素
   * @param {Object} options - 配置选项
   * @param {Object} options.api - API管理器
   */
  constructor(pageElement, options) {
    this.pageElement = pageElement;
    this.api = options.api;
    // ✅ 临时参数存储（用于新建配置时保存参数）
    this.tempParams = {};
  }

  /**
   * 清空模型下拉选项与手动输入框状态。
   *
   * @returns {void}
   */
  clearModelOptions() {
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelSelect'));
    const customModelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelSelect'));
    const manualWrapper = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManualWrapper'));
    const manualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManual'));

    if (modelSelect) {
      modelSelect.innerHTML = `
        <option value="">请选择...</option>
        <option value="__manual__">手动输入</option>
      `;
    }
    if (customModelSelect) {
      customModelSelect.innerHTML = '<option value="">可用模型</option>';
    }
    if (manualWrapper) {
      manualWrapper.style.display = 'none';
    }
    if (manualInput) {
      manualInput.value = '';
    }
  }

  /**
   * 构造共享刷新函数所需配置。
   *
   * @param {string} format - 当前 UI 选择的格式。
   * @returns {Object} 刷新配置对象。
   */
  buildSharedRefreshConfig(format) {
    const resolvedSource = resolveSource(format);
    const reverseProxyUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyUrl'));
    const reverseProxyPasswordInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyPassword'));
    const reverseProxyUrl = reverseProxyUrlInput?.value.trim() || '';
    const reverseProxyPassword = reverseProxyPasswordInput?.value.trim() || '';

    if (format === 'custom') {
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiBaseUrl'));
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
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
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2OpenRouterKey'));
      return {
        source: resolvedSource,
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: apiKeyInput?.value.trim() || ''
      };
    }

    if (format === 'azure_openai') {
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureBaseUrl'));
      const deploymentInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureDeploymentName'));
      const versionSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2AzureApiVersion'));
      return {
        source: resolvedSource,
        azureConfig: {
          baseUrl: baseUrlInput?.value.trim() || '',
          deploymentName: deploymentInput?.value.trim() || '',
          apiVersion: versionSelect?.value.trim() || ''
        }
      };
    }

    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiKey'));
    const supportsReverseProxy = SOURCE_CAPABILITIES[resolvedSource]?.supportsReverseProxy === true;
    const useReverseProxy = supportsReverseProxy && Boolean(reverseProxyUrl);
    return {
      source: resolvedSource,
      baseUrl: useReverseProxy ? reverseProxyUrl : '',
      apiKey: useReverseProxy ? reverseProxyPassword : (apiKeyInput?.value.trim() || '')
    };
  }

  /**
   * 处理 API 格式切换后的完整事件链。
   *
   * @async
   * @param {string} format - API 格式。
   * @returns {Promise<void>}
   */
  async handleApiFormatChange(format) {
    this.clearModelOptions();
    this.toggleApiSourceForms(format);
    this.renderAdvancedParams(format);
    await this.refreshModelsFromAPI();
  }

  /**
   * 按当前 source 解析测试连接使用的模型。
   *
   * @param {string} source - chat completion source。
   * @returns {string} 模型名称。
   */
  resolveModelForTest(source) {
    if (source === 'azure_openai') {
      const azureModelInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureModelName'));
      return azureModelInput?.value.trim() || '';
    }

    if (source === 'custom') {
      const customModelInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelId'));
      return customModelInput?.value.trim() || '';
    }

    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManual'));
    if (modelSelect?.value === '__manual__') {
      return modelManualInput?.value.trim() || '';
    }
    return modelSelect?.value.trim() || '';
  }


  /**
   * 绑定 API 设置事件
   *
   * @description
   * 处理 API 来源切换、配置管理、参数调整、反向代理预设、模型选择等操作
   *
   * 主要事件绑定：
   * - API 来源切换：自定义 API 显示参数 UI，酒馆 API 显示提示
   * - API 格式切换：根据格式显示/隐藏对应配置区块，并保存到 settings
   * - 输入框自动保存：各输入框 change 事件自动保存到 settings，包括：
   *   - 通用 API 密钥 → apiConfig.apiKey
   *   - OpenRouter 密钥 → apiConfig.openRouterKey
   *   - 模型选择 → apiConfig.model
   *   - Custom API 端点/密钥/模型 → apiConfig.customApiConfig
   * - 反向代理预设：选择/保存/删除代理预设
   * - Custom API 模型：下拉选择同步到输入框、刷新模型列表
   */
  bindApiSettingsEvents() {
    // API 来源选择
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiSource'));
    const customApiSettings = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiSettings'));

    if (apiSourceSelect) {
      apiSourceSelect.addEventListener('change', () => {
        const source = apiSourceSelect.value;
        const settings = this.getSettings();
        const apiFormatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiFormat'));

        // 更新配置
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            source: source
          }
        });

        // 显示/隐藏自定义配置区域（只有custom才显示）
        if (customApiSettings) {
          customApiSettings.style.display = source === 'custom' ? 'block' : 'none';
        }

        // ✅ 根据来源决定显示什么提示
        const container = this.pageElement.querySelector('#var-v2ApiParamsContainer');
        if (source === 'custom') {
          // 使用自定义API：渲染参数UI
          if (settings.apiConfig.currentConfigId) {
            this.loadApiConfig(settings.apiConfig.currentConfigId);
            this.refreshModelsFromAPI().catch((error) => {
              logger.error('variable', '[VariableAPIConfig] 加载已保存配置后自动刷新模型失败:', error);
            });
          } else {
            const format = apiFormatSelect?.value || settings.apiConfig.format || this.getDefaultFormatFromTavern();
            this.handleApiFormatChange(format).catch((error) => {
              logger.error('variable', '[VariableAPIConfig] API类型切换后自动刷新模型失败:', error);
            });
          }
        } else {
          // 跟随酒馆设置：显示提示
          if (container) {
            container.innerHTML = '<div class="api-settings-hint">跟随酒馆设置时，参数由酒馆主界面控制</div>';
          }
        }

        logger.info('variable', '[VariableAPIConfig] API来源已切换:', source);
      });
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.addEventListener('change', () => {
        const settings = this.getSettings();

        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            stream: apiStreamCheckbox.checked
          }
        });

        logger.info('variable', '[VariableAPIConfig] 流式生成已', apiStreamCheckbox.checked ? '启用' : '禁用');
      });
    }

    // 工具调用开关（Function Calling）
    const apiToolCallingCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiToolCalling'));
    if (apiToolCallingCheckbox) {
      apiToolCallingCheckbox.addEventListener('change', () => {
        const settings = this.getSettings();

        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            useToolCalling: apiToolCallingCheckbox.checked
          }
        });

        logger.info('variable', '[VariableAPIConfig] 工具调用已', apiToolCallingCheckbox.checked ? '启用' : '禁用');
      });
    }

    // 密钥显示/隐藏（通用）
    const apiKeyToggle = this.pageElement.querySelector('#var-v2ApiKeyToggle');
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiKey'));
    if (apiKeyToggle && apiKeyInput) {
      apiKeyToggle.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';

        const icon = apiKeyToggle.querySelector('i');
        if (icon) {
          icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    // OpenRouter 密钥显示/隐藏
    const openRouterKeyToggle = this.pageElement.querySelector('#var-v2OpenRouterKeyToggle');
    const openRouterKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2OpenRouterKey'));
    if (openRouterKeyToggle && openRouterKeyInput) {
      openRouterKeyToggle.addEventListener('click', () => {
        const isPassword = openRouterKeyInput.type === 'password';
        openRouterKeyInput.type = isPassword ? 'text' : 'password';

        const icon = openRouterKeyToggle.querySelector('i');
        if (icon) {
          icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    // Custom API 密钥显示/隐藏
    const customKeyToggle = this.pageElement.querySelector('#var-v2CustomApiKeyToggle');
    const customKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
    if (customKeyToggle && customKeyInput) {
      customKeyToggle.addEventListener('click', () => {
        const isPassword = customKeyInput.type === 'password';
        customKeyInput.type = isPassword ? 'text' : 'password';

        const icon = customKeyToggle.querySelector('i');
        if (icon) {
          icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    // OpenRouter 授权按钮（打开官方授权页面）
    const openRouterAuthBtn = this.pageElement.querySelector('#var-v2OpenRouterAuth');
    if (openRouterAuthBtn) {
      openRouterAuthBtn.addEventListener('click', () => {
        // 打开 OpenRouter OAuth 授权页面
        window.open('https://openrouter.ai/auth?callback_url=' + encodeURIComponent(window.location.origin), '_blank');
        logger.info('variable', '[VariableAPIConfig] 打开 OpenRouter 授权页面');
      });
    }

    // ✅ 反向代理折叠由官方 inline-drawer 机制处理
    // 不再手动绑定 click 事件，避免与官方机制冲突

    // 反向代理密码显示/隐藏
    const reverseProxyPasswordToggle = this.pageElement.querySelector('#var-v2ReverseProxyPasswordToggle');
    const reverseProxyPasswordInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyPassword'));
    if (reverseProxyPasswordToggle && reverseProxyPasswordInput) {
      reverseProxyPasswordToggle.addEventListener('click', () => {
        const isPassword = reverseProxyPasswordInput.type === 'password';
        reverseProxyPasswordInput.type = isPassword ? 'text' : 'password';

        const icon = reverseProxyPasswordToggle.querySelector('i');
        if (icon) {
          icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        }
      });
    }

    // 反向代理预设选择
    const proxyPresetSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ProxyPreset'));
    if (proxyPresetSelect) {
      proxyPresetSelect.addEventListener('change', () => {
        this.loadProxyPreset(proxyPresetSelect.value);
      });
    }

    // 反向代理预设保存
    const proxySaveBtn = this.pageElement.querySelector('#var-v2ProxySave');
    if (proxySaveBtn) {
      proxySaveBtn.addEventListener('click', () => {
        this.saveProxyPreset();
      });
    }

    // 反向代理预设删除
    const proxyDeleteBtn = this.pageElement.querySelector('#var-v2ProxyDelete');
    if (proxyDeleteBtn) {
      proxyDeleteBtn.addEventListener('click', () => {
        this.deleteProxyPreset();
      });
    }

    // Custom API：可用模型下拉选择同步到输入框并保存
    const customModelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelSelect'));
    const customModelIdInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelId'));
    if (customModelSelect && customModelIdInput) {
      customModelSelect.addEventListener('change', () => {
        if (customModelSelect.value) {
          customModelIdInput.value = customModelSelect.value;

          // ✅ 同时保存到 settings（之前只同步到输入框，没有保存）
          const settings = this.getSettings();
          const customConfig = settings.apiConfig.customApiConfig || {};
          this.updateSettings({
            apiConfig: {
              ...settings.apiConfig,
              customApiConfig: {
                ...customConfig,
                model: customModelSelect.value
              }
            }
          });
          logger.debug('variable', '[VariableAPIConfig] Custom API模型已保存（从下拉框选择）:', customModelSelect.value);
        }
      });
    }

    // Custom API：刷新模型列表
    const customRefreshModelsBtn = this.pageElement.querySelector('#var-v2CustomRefreshModels');
    if (customRefreshModelsBtn) {
      customRefreshModelsBtn.addEventListener('click', () => {
        this.refreshCustomModels();
      });
    }

    // 模型选择（显示/隐藏手动输入框 + 保存到settings）
    const apiModelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelSelect'));
    const apiModelManualWrapper = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManualWrapper'));

    if (apiModelSelect) {
      apiModelSelect.addEventListener('change', () => {
        const value = apiModelSelect.value;

        // 如果选择"手动输入..."，显示手动输入框
        if (apiModelManualWrapper) {
          apiModelManualWrapper.style.display = value === '__manual__' ? 'block' : 'none';
        }

        // ✅ 保存模型到 settings（除非是"手动输入"）
        if (value !== '__manual__') {
          const settings = this.getSettings();
          this.updateSettings({
            apiConfig: {
              ...settings.apiConfig,
              model: value
            }
          });
          logger.debug('variable', '[VariableAPIConfig] 模型已保存:', value);
        }
      });
    }

    // 刷新模型列表
    const apiRefreshModelsBtn = this.pageElement.querySelector('#var-v2ApiRefreshModels');
    if (apiRefreshModelsBtn) {
      apiRefreshModelsBtn.addEventListener('click', () => {
        this.refreshModelsFromAPI();
      });
    }

    // 测试连接
    const apiTestBtn = this.pageElement.querySelector('#var-v2ApiTest');
    if (apiTestBtn) {
      apiTestBtn.addEventListener('click', () => {
        this.testApiConnection();
      });
    }

    // ✅ API格式选择（动态显示高级参数 + 切换配置区块 + 保存到settings）
    const apiFormatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiFormat'));
    if (apiFormatSelect) {
      apiFormatSelect.addEventListener('change', async () => {
        const format = apiFormatSelect.value;
        const settings = this.getSettings();

        // ✅ 保存 API 类型到 settings
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            format: format
          }
        });

        logger.debug('variable', '[VariableAPIConfig] API格式已切换并保存:', format);
        await this.handleApiFormatChange(format);
      });
      // 初始化时也触发一次，确保显示正确的配置区块
      this.toggleApiSourceForms(apiFormatSelect.value);
    }

    // ✅ 通用 API 密钥输入（保存到settings）
    const var2ApiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiKey'));
    if (var2ApiKeyInput) {
      var2ApiKeyInput.addEventListener('change', () => {
        const settings = this.getSettings();
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            apiKey: var2ApiKeyInput.value.trim()
          }
        });
        logger.debug('variable', '[VariableAPIConfig] 通用API密钥已保存');
      });
    }

    // ✅ OpenRouter 密钥输入（保存到settings）
    const var2OpenRouterKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2OpenRouterKey'));
    if (var2OpenRouterKeyInput) {
      var2OpenRouterKeyInput.addEventListener('change', () => {
        const settings = this.getSettings();
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            openRouterKey: var2OpenRouterKeyInput.value.trim()
          }
        });
        logger.debug('variable', '[VariableAPIConfig] OpenRouter密钥已保存');
      });
    }

    // ✅ 手动输入模型（保存到settings）
    const apiModelManualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManual'));
    if (apiModelManualInput) {
      apiModelManualInput.addEventListener('change', () => {
        const settings = this.getSettings();
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            model: apiModelManualInput.value.trim()
          }
        });
        logger.debug('variable', '[VariableAPIConfig] 手动输入模型已保存:', apiModelManualInput.value.trim());
      });
    }

    // ✅ Custom API 端点URL（保存到settings）
    const customApiUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiBaseUrl'));
    if (customApiUrlInput) {
      customApiUrlInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const customConfig = settings.apiConfig.customApiConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            customApiConfig: {
              ...customConfig,
              baseUrl: customApiUrlInput.value.trim()
            }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Custom API端点已保存');
      });
    }

    // ✅ Custom API 密钥（保存到settings）
    const customApiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
    if (customApiKeyInput) {
      customApiKeyInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const customConfig = settings.apiConfig.customApiConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            customApiConfig: {
              ...customConfig,
              apiKey: customApiKeyInput.value.trim()
            }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Custom API密钥已保存');
      });
    }

    // ✅ Custom API 模型ID（保存到settings）
    const var2CustomModelIdInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelId'));
    if (var2CustomModelIdInput) {
      var2CustomModelIdInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const customConfig = settings.apiConfig.customApiConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            customApiConfig: {
              ...customConfig,
              model: var2CustomModelIdInput.value.trim()
            }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Custom API模型已保存');
      });
    }

    // ✅ 高级参数折叠由官方 inline-drawer 机制处理
    // 不再手动绑定 click 事件，避免与官方机制冲突导致"闪一下"
    // 注意：HTML 中已有 inline-drawer-toggle 类，官方 script.js 会自动处理

    // ========== Vertex AI 配置事件绑定 ==========

    // Vertex AI 认证模式切换
    const vertexAuthModeSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2VertexAuthMode'));
    const vertexExpressConfig = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2VertexExpressConfig'));
    const vertexFullConfig = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2VertexFullConfig'));
    if (vertexAuthModeSelect) {
      vertexAuthModeSelect.addEventListener('change', () => {
        const mode = vertexAuthModeSelect.value;
        if (vertexExpressConfig) vertexExpressConfig.style.display = mode === 'express' ? 'block' : 'none';
        if (vertexFullConfig) vertexFullConfig.style.display = mode === 'full' ? 'block' : 'none';

        // 保存到 settings
        const settings = this.getSettings();
        const vertexConfig = settings.apiConfig.vertexConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            vertexConfig: { ...vertexConfig, authMode: mode }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Vertex AI 认证模式已切换:', mode);
      });
    }

    // Vertex AI API密钥显示/隐藏
    const vertexApiKeyToggle = this.pageElement.querySelector('#var-v2VertexApiKeyToggle');
    const vertexApiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2VertexApiKey'));
    if (vertexApiKeyToggle && vertexApiKeyInput) {
      vertexApiKeyToggle.addEventListener('click', () => {
        const isPassword = vertexApiKeyInput.type === 'password';
        vertexApiKeyInput.type = isPassword ? 'text' : 'password';
        const icon = vertexApiKeyToggle.querySelector('i');
        if (icon) icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      });
    }

    // Vertex AI API密钥保存
    if (vertexApiKeyInput) {
      vertexApiKeyInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const vertexConfig = settings.apiConfig.vertexConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            vertexConfig: { ...vertexConfig, apiKey: vertexApiKeyInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Vertex AI API密钥已保存');
      });
    }

    // Vertex AI 项目ID保存
    const vertexProjectIdInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2VertexProjectId'));
    if (vertexProjectIdInput) {
      vertexProjectIdInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const vertexConfig = settings.apiConfig.vertexConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            vertexConfig: { ...vertexConfig, projectId: vertexProjectIdInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Vertex AI 项目ID已保存');
      });
    }

    // Vertex AI 服务账号JSON保存
    const vertexServiceAccountInput = /** @type {HTMLTextAreaElement|null} */ (this.pageElement.querySelector('#var-v2VertexServiceAccount'));
    if (vertexServiceAccountInput) {
      vertexServiceAccountInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const vertexConfig = settings.apiConfig.vertexConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            vertexConfig: { ...vertexConfig, serviceAccount: vertexServiceAccountInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Vertex AI 服务账号已保存');
      });
    }

    // Vertex AI 区域保存
    const vertexRegionInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2VertexRegion'));
    if (vertexRegionInput) {
      vertexRegionInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const vertexConfig = settings.apiConfig.vertexConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            vertexConfig: { ...vertexConfig, region: vertexRegionInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Vertex AI 区域已保存');
      });
    }

    // ========== Azure OpenAI 配置事件绑定 ==========

    // Azure Base URL保存
    const azureBaseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureBaseUrl'));
    if (azureBaseUrlInput) {
      azureBaseUrlInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const azureConfig = settings.apiConfig.azureConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            azureConfig: { ...azureConfig, baseUrl: azureBaseUrlInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Azure Base URL已保存');
      });
    }

    // Azure 部署名称保存
    const azureDeploymentNameInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureDeploymentName'));
    if (azureDeploymentNameInput) {
      azureDeploymentNameInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const azureConfig = settings.apiConfig.azureConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            azureConfig: { ...azureConfig, deploymentName: azureDeploymentNameInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Azure 部署名称已保存');
      });
    }

    // Azure API版本保存
    const azureApiVersionSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2AzureApiVersion'));
    if (azureApiVersionSelect) {
      azureApiVersionSelect.addEventListener('change', () => {
        const settings = this.getSettings();
        const azureConfig = settings.apiConfig.azureConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            azureConfig: { ...azureConfig, apiVersion: azureApiVersionSelect.value }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Azure API版本已保存');
      });
    }

    // Azure API密钥显示/隐藏
    const azureApiKeyToggle = this.pageElement.querySelector('#var-v2AzureApiKeyToggle');
    const azureApiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureApiKey'));
    if (azureApiKeyToggle && azureApiKeyInput) {
      azureApiKeyToggle.addEventListener('click', () => {
        const isPassword = azureApiKeyInput.type === 'password';
        azureApiKeyInput.type = isPassword ? 'text' : 'password';
        const icon = azureApiKeyToggle.querySelector('i');
        if (icon) icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      });
    }

    // Azure API密钥保存
    if (azureApiKeyInput) {
      azureApiKeyInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const azureConfig = settings.apiConfig.azureConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            azureConfig: { ...azureConfig, apiKey: azureApiKeyInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Azure API密钥已保存');
      });
    }

    // Azure 模型名称保存
    const azureModelNameInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureModelName'));
    if (azureModelNameInput) {
      azureModelNameInput.addEventListener('change', () => {
        const settings = this.getSettings();
        const azureConfig = settings.apiConfig.azureConfig || {};
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            azureConfig: { ...azureConfig, modelName: azureModelNameInput.value.trim() }
          }
        });
        logger.debug('variable', '[VariableAPIConfig] Azure 模型名称已保存');
      });
    }

    // 加载现有设置到 UI
    this.loadApiSettingsToUI();

    logger.debug('variable', '[VariableAPIConfig] API设置事件已绑定');
  }


  /**
   * 获取变量模块设置
   *
   * @returns {Object} 变量模块设置对象
   */
  getSettings() {
    if (!extension_settings[EXT_ID]) {
      extension_settings[EXT_ID] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME]) {
      extension_settings[EXT_ID][MODULE_NAME] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME].apiConfig) {
      extension_settings[EXT_ID][MODULE_NAME].apiConfig = {
        source: 'default',
        stream: false,
        useToolCalling: false,
        // 反向代理预设列表
        proxyPresets: [],
        // 当前选中的反向代理预设名称
        currentProxyPreset: '',
        // Custom API 配置
        customApiConfig: {
          baseUrl: '',
          apiKey: '',
          model: ''
        }
      };
    }
    return extension_settings[EXT_ID][MODULE_NAME];
  }

  /**
   * 更新变量模块设置
   *
   * @param {Object} updates - 更新内容
   */
  updateSettings(updates) {
    const settings = this.getSettings();
    Object.assign(settings, updates);
    saveSettingsDebounced();
  }

  /**
   * 加载 API 设置到 UI
   *
   * @description
   * 从 extension_settings 读取设置，填充到设置页面的表单中
   */
  loadApiSettingsToUI() {
    const settings = this.getSettings();
    const apiConfig = settings.apiConfig;

    // API 来源
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiSource'));
    if (apiSourceSelect) {
      apiSourceSelect.value = apiConfig.source || 'default';
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.checked = apiConfig.stream || false;
    }

    // 工具调用开关
    const apiToolCallingCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiToolCalling'));
    if (apiToolCallingCheckbox) {
      apiToolCallingCheckbox.checked = apiConfig.useToolCalling || false;
    }

    // 显示/隐藏自定义配置区域
    const customApiSettings = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiSettings'));
    if (customApiSettings) {
      customApiSettings.style.display = apiConfig.source === 'custom' ? 'block' : 'none';
    }

    // ✅ 加载 API 类型（format）
    const apiFormatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiFormat'));
    if (apiFormatSelect && apiConfig.format) {
      apiFormatSelect.value = apiConfig.format;
      // 切换配置区块显示
      this.toggleApiSourceForms(apiConfig.format);
    }

    // ✅ 加载通用 API 密钥
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiKey'));
    if (apiKeyInput && apiConfig.apiKey) {
      apiKeyInput.value = apiConfig.apiKey;
    }

    // ✅ 加载 OpenRouter 密钥
    const openRouterKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2OpenRouterKey'));
    if (openRouterKeyInput && apiConfig.openRouterKey) {
      openRouterKeyInput.value = apiConfig.openRouterKey;
    }

    // ✅ 加载模型
    const apiModelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelSelect'));
    const apiModelManualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManual'));
    const apiModelManualWrapper = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManualWrapper'));
    if (apiConfig.model) {
      // 检查模型是否在下拉列表中
      const modelInList = apiModelSelect && Array.from(apiModelSelect.options).some(opt => opt.value === apiConfig.model);
      if (modelInList) {
        apiModelSelect.value = apiConfig.model;
      } else if (apiModelManualInput) {
        // 模型不在列表中，使用手动输入
        if (apiModelSelect) apiModelSelect.value = '__manual__';
        apiModelManualInput.value = apiConfig.model;
        if (apiModelManualWrapper) apiModelManualWrapper.style.display = 'block';
      }
    }

    // 加载反向代理预设列表
    this.refreshProxyPresetList();

    // 加载 Custom API 配置
    this.loadCustomApiConfig();

    // ✅ 加载 Vertex AI 配置
    this.loadVertexAIConfig();

    // ✅ 加载 Azure OpenAI 配置
    this.loadAzureConfig();

    // ✅ 根据API来源决定显示什么提示
    const container = this.pageElement.querySelector('#var-v2ApiParamsContainer');
    if (apiConfig.source === 'custom') {
      // 使用自定义API：渲染参数UI
      const format = apiFormatSelect?.value || 'openai';
      this.renderAdvancedParams(format);
      this.refreshModelsFromAPI().catch((error) => {
        logger.error('variable', '[VariableAPIConfig] 初始化 API 类型时自动刷新模型失败:', error);
      });
    } else {
      // 跟随酒馆设置：显示提示
      if (container) {
        container.innerHTML = '<div class="api-settings-hint">跟随酒馆设置时，参数由酒馆主界面控制</div>';
      }
    }

    logger.debug('variable', '[VariableAPIConfig] API设置已加载到UI');
  }

  /**
   * 刷新反向代理预设列表
   */
  refreshProxyPresetList() {
    const settings = this.getSettings();
    const presets = settings.apiConfig.proxyPresets || [];

    const select = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ProxyPreset'));
    if (!select) return;

    // 清空现有选项（保留第一个"无"）
    select.innerHTML = '<option value="">无</option>';

    // 添加已保存的预设
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.name;
      option.textContent = preset.name;
      select.appendChild(option);
    });

    // 选中当前预设
    if (settings.apiConfig.currentProxyPreset) {
      select.value = settings.apiConfig.currentProxyPreset;
      // 加载预设内容到输入框
      this.loadProxyPreset(settings.apiConfig.currentProxyPreset);
    }

    logger.debug('variable', '[VariableAPIConfig] 反向代理预设列表已刷新，共', presets.length, '个');
  }

  /**
   * 加载反向代理预设到输入框
   *
   * @param {string} presetName - 预设名称（空字符串=清空）
   */
  loadProxyPreset(presetName) {
    const settings = this.getSettings();
    const presets = settings.apiConfig.proxyPresets || [];

    const urlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyUrl'));
    const passwordInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyPassword'));

    if (!presetName) {
      // 清空输入框
      if (urlInput) urlInput.value = '';
      if (passwordInput) passwordInput.value = '';

      // 更新当前预设
      this.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentProxyPreset: ''
        }
      });
      return;
    }

    // 查找预设
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      if (urlInput) urlInput.value = preset.url || '';
      if (passwordInput) passwordInput.value = preset.password || '';

      // 更新当前预设
      this.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentProxyPreset: presetName
        }
      });

      // ✅ 自动展开反向代理区块（让用户看到已加载的配置）
      this.expandReverseProxySection();

      logger.info('variable', '[VariableAPIConfig] 已加载反向代理预设:', presetName);
    }
  }

  /**
   * 展开反向代理区块
   *
   * @description
   * 当加载预设或有已保存的预设时，自动展开反向代理区块
   */
  expandReverseProxySection() {
    const reverseProxyContent = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyContent'));

    if (reverseProxyContent && reverseProxyContent.style.display === 'none') {
      reverseProxyContent.style.display = 'block';
    }
  }

  /**
   * 保存反向代理预设
   */
  async saveProxyPreset() {
    const urlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyUrl'));
    const passwordInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyPassword'));

    const url = urlInput?.value.trim() || '';
    const password = passwordInput?.value.trim() || '';

    if (!url) {
      toastr.error('请先填写代理服务器 URL');
      return;
    }

    // 弹出输入框让用户输入预设名称
    const presetName = prompt('请输入预设名称：');
    if (!presetName || !presetName.trim()) {
      return;
    }

    const settings = this.getSettings();
    const presets = [...(settings.apiConfig.proxyPresets || [])];

    // 检查是否已存在同名预设
    const existingIndex = presets.findIndex(p => p.name === presetName.trim());
    if (existingIndex >= 0) {
      // 更新现有预设
      presets[existingIndex] = {
        name: presetName.trim(),
        url: url,
        password: password
      };
      logger.info('variable', '[VariableAPIConfig] 已更新反向代理预设:', presetName);
    } else {
      // 新增预设
      presets.push({
        name: presetName.trim(),
        url: url,
        password: password
      });
      logger.info('variable', '[VariableAPIConfig] 已新增反向代理预设:', presetName);
    }

    // 保存到 settings
    this.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        proxyPresets: presets,
        currentProxyPreset: presetName.trim()
      }
    });

    // 刷新预设列表
    this.refreshProxyPresetList();

    toastr.success(`代理预设「${presetName}」已保存`);
  }

  /**
   * 删除反向代理预设
   */
  async deleteProxyPreset() {
    const select = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ProxyPreset'));
    const presetName = select?.value;

    if (!presetName) {
      toastr.error('请先选择要删除的预设');
      return;
    }

    // 二次确认
    const confirmed = await showConfirmPopup(
      '删除预设',
      `确定要删除代理预设「${presetName}」吗？`,
      { danger: true, okButton: '删除' }
    );

    if (!confirmed) {
      return;
    }

    const settings = this.getSettings();
    const presets = (settings.apiConfig.proxyPresets || []).filter(p => p.name !== presetName);

    // 保存到 settings
    this.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        proxyPresets: presets,
        currentProxyPreset: ''
      }
    });

    // 刷新预设列表
    this.refreshProxyPresetList();

    // 清空输入框
    this.loadProxyPreset('');

    toastr.success(`代理预设「${presetName}」已删除`);
    logger.info('variable', '[VariableAPIConfig] 已删除反向代理预设:', presetName);
  }

  /**
   * 加载 Custom API 配置到输入框
   */
  loadCustomApiConfig() {
    const settings = this.getSettings();
    const customConfig = settings.apiConfig.customApiConfig || {};

    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
    const modelIdInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelId'));

    if (baseUrlInput) baseUrlInput.value = customConfig.baseUrl || '';
    if (apiKeyInput) apiKeyInput.value = customConfig.apiKey || '';
    if (modelIdInput) modelIdInput.value = customConfig.model || '';
  }

  /**
   * 加载 Vertex AI 配置到输入框
   */
  loadVertexAIConfig() {
    const settings = this.getSettings();
    const vertexConfig = settings.apiConfig.vertexConfig || {};

    // 认证模式
    const authModeSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2VertexAuthMode'));
    const expressConfig = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2VertexExpressConfig'));
    const fullConfig = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2VertexFullConfig'));
    if (authModeSelect) {
      authModeSelect.value = vertexConfig.authMode || 'express';
      // 切换配置区块显示
      if (expressConfig) expressConfig.style.display = vertexConfig.authMode === 'full' ? 'none' : 'block';
      if (fullConfig) fullConfig.style.display = vertexConfig.authMode === 'full' ? 'block' : 'none';
    }

    // API密钥
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2VertexApiKey'));
    if (apiKeyInput) apiKeyInput.value = vertexConfig.apiKey || '';

    // 项目ID
    const projectIdInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2VertexProjectId'));
    if (projectIdInput) projectIdInput.value = vertexConfig.projectId || '';

    // 服务账号JSON
    const serviceAccountInput = /** @type {HTMLTextAreaElement|null} */ (this.pageElement.querySelector('#var-v2VertexServiceAccount'));
    if (serviceAccountInput) serviceAccountInput.value = vertexConfig.serviceAccount || '';

    // 区域
    const regionInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2VertexRegion'));
    if (regionInput) regionInput.value = vertexConfig.region || 'us-central1';

    logger.debug('variable', '[VariableAPIConfig] Vertex AI 配置已加载');
  }

  /**
   * 加载 Azure OpenAI 配置到输入框
   */
  loadAzureConfig() {
    const settings = this.getSettings();
    const azureConfig = settings.apiConfig.azureConfig || {};

    // Base URL
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureBaseUrl'));
    if (baseUrlInput) baseUrlInput.value = azureConfig.baseUrl || '';

    // 部署名称
    const deploymentNameInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureDeploymentName'));
    if (deploymentNameInput) deploymentNameInput.value = azureConfig.deploymentName || '';

    // API版本
    const apiVersionSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2AzureApiVersion'));
    if (apiVersionSelect) apiVersionSelect.value = azureConfig.apiVersion || '2024-02-15-preview';

    // API密钥
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureApiKey'));
    if (apiKeyInput) apiKeyInput.value = azureConfig.apiKey || '';

    // 模型名称
    const modelNameInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureModelName'));
    if (modelNameInput) modelNameInput.value = azureConfig.modelName || '';

    logger.debug('variable', '[VariableAPIConfig] Azure OpenAI 配置已加载');
  }


  /**
   * 刷新 Custom API 的模型列表
   */
  async refreshCustomModels() {
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelSelect'));
    const modelDatalist = this.pageElement.querySelector('#var-v2CustomModelList');
    const refreshConfig = this.buildSharedRefreshConfig('custom');
    const baseUrl = refreshConfig.baseUrl || refreshConfig.customUrl || '';

    if (!baseUrl) {
      toastr.error('请先填写自定义端点 URL');
      return;
    }

    toastr.info('正在获取模型列表...');
    logger.info('variable', '[VariableAPIConfig] 开始获取 Custom API 模型列表（共享刷新链）');

    try {
      const result = await refreshModelList(refreshConfig);
      if (!result.success) {
        throw new Error(result.error || '模型刷新失败');
      }

      const models = (result.models || [])
        .map(model => model?.id)
        .filter(model => typeof model === 'string' && model.length > 0);

      if (models.length === 0) {
        toastr.error('未获取到模型列表');
        return;
      }

      // 更新下拉框
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="">无</option>';
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });
      }

      // 更新 datalist
      if (modelDatalist) {
        modelDatalist.innerHTML = '';
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          modelDatalist.appendChild(option);
        });
      }

      toastr.success(`已获取 ${models.length} 个模型`);
      logger.info('variable', '[VariableAPIConfig] Custom API 模型列表已更新，共', models.length, '个');

    } catch (error) {
      logger.error('variable', '[VariableAPIConfig] 获取 Custom API 模型失败:', error);
      toastr.error('获取模型列表失败：' + error.message);
    }
  }

  /**
   * 根据酒馆当前API源推断默认格式
   *
   * @returns {string} 推断的格式值
   * @description
   * 将酒馆的 chat_completion_source 反向映射到扩展的格式选项
   */
  getDefaultFormatFromTavern() {
    const tavernSource = oai_settings.chat_completion_source;

    // 反向映射：从酒馆API源映射到扩展格式选项
    const reverseMap = {
      // OpenAI 官方和兼容格式
      'openai': 'openai',
      'custom': 'openai',
      'groq': 'openai',
      'deepseek': 'openai',
      'xai': 'openai',
      'pollinations': 'openai',
      'moonshot': 'openai',
      'fireworks': 'openai',
      'electronhub': 'openai',
      'nanogpt': 'openai',
      'aimlapi': 'openai',
      'cohere': 'openai',
      'perplexity': 'openai',

      // Claude (Anthropic)
      'claude': 'claude',

      // Google AI
      'makersuite': 'google',
      'vertexai': 'google',

      // 其他
      'openrouter': 'openrouter',
      'ai21': 'ai21',
      'mistralai': 'mistral'
    };

    const detectedFormat = reverseMap[tavernSource] || 'openai';
    logger.debug('variable', '[VariableAPIConfig.getDefaultFormatFromTavern] 从酒馆API源推断默认格式:', tavernSource, '→', detectedFormat);

    return detectedFormat;
  }

  /**
   * 获取API类型的默认端点URL
   *
   * @param {string} format - API类型
   * @returns {string} 默认端点URL
   */
  getDefaultBaseUrl(format) {
    const defaultUrls = {
      'openai': 'https://api.openai.com',
      'claude': 'https://api.anthropic.com',
      'makersuite': 'https://generativelanguage.googleapis.com',
      'deepseek': 'https://api.deepseek.com',
      'mistralai': 'https://api.mistral.ai',
      'cohere': 'https://api.cohere.ai',
      'perplexity': 'https://api.perplexity.ai',
      'groq': 'https://api.groq.com/openai',
      'xai': 'https://api.x.ai',
      'ai21': 'https://api.ai21.com',
      'moonshot': 'https://api.moonshot.cn',
      'fireworks': 'https://api.fireworks.ai/inference',
      'electronhub': 'https://api.electronhub.top',
      'nanogpt': 'https://nano-gpt.com/api',
      'aimlapi': 'https://api.aimlapi.com',
      'pollinations': 'https://text.pollinations.ai',
      'siliconflow': 'https://api.siliconflow.cn',
      'openrouter': 'https://openrouter.ai/api/v1'
    };
    return defaultUrls[format] || '';
  }

  /**
   * 从 API 刷新可用模型列表
   *
   * @description
   * 根据当前选择的 API 类型（format）获取对应的端点和密钥：
   * - Custom API：从 #var-v2ApiBaseUrl 和 #var-v2CustomApiKey 读取
   * - OpenRouter：使用固定端点，从 #var-v2OpenRouterKey 读取密钥
   * - 其他API：
   *   - 有反向代理时：使用反向代理URL和反向代理密码
   *   - 无反向代理时：仅传 source 与通用 API 密钥（由 ST 后端使用默认路由）
   *
   * @async
   */
  async refreshModelsFromAPI() {
    const formatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiFormat'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelSelect'));
    const format = formatSelect?.value || 'openai';
    const refreshConfig = this.buildSharedRefreshConfig(format);
    const source = resolveSource(format);
    const baseUrl = refreshConfig.baseUrl || refreshConfig.customUrl || '';
    const requiresCustomUrl = source === 'custom' || (format === 'custom' && source === 'openai');

    // 验证必填项
    if (requiresCustomUrl && !baseUrl) {
      toastr.error('请先填写 API 端点或反向代理 URL');
      return;
    }

    toastr.info('正在获取模型列表...');
    logger.info('variable', '[VariableAPIConfig] 开始获取模型列表（共享刷新链）', {
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
        .map(model => model?.id)
        .filter(model => typeof model === 'string' && model.length > 0);

      if (models.length === 0) {
        if (modelSelect) {
          modelSelect.innerHTML = `
            <option value="">请选择模型...</option>
            <option value="__manual__">手动输入</option>
          `;
          modelSelect.value = '__manual__';
        }

        const manualWrapper = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManualWrapper'));
        if (manualWrapper) {
          manualWrapper.style.display = 'block';
        }

        if (NO_VALIDATE_SOURCES.has(source)) {
          toastr.info('当前来源不返回模型列表，请手动输入模型名称');
          logger.info('variable', '[VariableAPIConfig] 当前来源需手动输入模型:', source);
        } else {
          toastr.error('未获取到模型列表');
          logger.warn('variable', '[VariableAPIConfig] 模型列表为空');
        }
        return;
      }

      // 更新下拉框
      if (modelSelect) {
        const currentValue = modelSelect.value;

        modelSelect.innerHTML = '<option value="">请选择模型...</option>';

        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });

        // 添加"手动输入..."选项
        const manualOption = document.createElement('option');
        manualOption.value = '__manual__';
        manualOption.textContent = '手动输入...';
        modelSelect.appendChild(manualOption);

        // 恢复之前的选择
        if (currentValue && models.includes(currentValue)) {
          modelSelect.value = currentValue;
        }
      }

      toastr.success(`已获取 ${models.length} 个模型`);
      logger.info('variable', '[VariableAPIConfig] 模型列表已更新，共', models.length, '个');

    } catch (error) {
      logger.error('variable', '[VariableAPIConfig] 获取失败:', error);
      toastr.error('获取模型列表失败：' + error.message);
    }
  }


  /**
   * 测试 API 连接
   *
   * @async
   */
  async testApiConnection() {
    if (!this.api) {
      toastr.error('API管理器未初始化');
      return;
    }

    // 读取当前表单数据
    const formatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiFormat'));
    const format = formatSelect?.value.trim() || 'openai';
    const source = resolveSource(format);

    // 根据API类型获取正确的端点和密钥
    let baseUrl = '';
    let apiKey = '';

    if (format === 'custom') {
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiBaseUrl'));
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
      baseUrl = baseUrlInput?.value.trim() || '';
      apiKey = apiKeyInput?.value.trim() || '';
    } else if (format === 'openrouter') {
      baseUrl = 'https://openrouter.ai/api/v1';
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2OpenRouterKey'));
      apiKey = apiKeyInput?.value.trim() || '';
    } else if (format === 'azure_openai') {
      const azureBaseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureBaseUrl'));
      const azureApiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureApiKey'));
      baseUrl = azureBaseUrlInput?.value.trim() || '';
      apiKey = azureApiKeyInput?.value.trim() || '';
    } else {
      // 其他API：检查是否有反向代理
      const reverseProxyUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyUrl'));
      const reverseProxyPasswordInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyPassword'));
      const reverseProxyUrl = reverseProxyUrlInput?.value.trim() || '';
      const reverseProxyPassword = reverseProxyPasswordInput?.value.trim() || '';

      if (reverseProxyUrl) {
        // ✅ 有反向代理：使用反向代理URL和密码
        baseUrl = reverseProxyUrl;
        apiKey = reverseProxyPassword;
      } else {
        // 无反向代理：使用默认端点和通用API密钥
        baseUrl = this.getDefaultBaseUrl(format);
        const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiKey'));
        apiKey = apiKeyInput?.value.trim() || '';
      }
    }

    // 获取模型名
    const model = this.resolveModelForTest(source);

    const testConfig = {
      source: source,
      stream: false,
      baseUrl: baseUrl,
      apiKey: apiKey,
      format: format,
      model: model || 'gpt-4o-mini'
    };

    if (source === 'azure_openai') {
      const deploymentInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2AzureDeploymentName'));
      const versionSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2AzureApiVersion'));
      testConfig.azureConfig = {
        baseUrl: baseUrl,
        deploymentName: deploymentInput?.value.trim() || '',
        apiVersion: versionSelect?.value.trim() || ''
      };
    }

    // 验证必填项
    if (!testConfig.baseUrl) {
      toastr.error('请填写 API 端点或反向代理 URL');
      return;
    }

    if (!testConfig.model) {
      toastr.error('请选择或输入模型名称');
      return;
    }

    toastr.info('正在测试连接...');
    logger.info('variable', '[VariableAPIConfig] 开始测试 API 连接');

    try {
      // ✅ 修复：构造messages数组而不是字符串（照搬日记）
      const testMessages = [
        { role: 'user', content: '测试连接，请回复"OK"' }
      ];

      // 创建测试用的 AbortController
      const abortController = new AbortController();

      // 调用 API 实例的 callAPIWithStreaming 方法
      // 注意：非流式模式返回 { text, metadata } 对象，流式模式返回字符串
      const response = await this.api.callAPIWithStreaming(
        testMessages,
        testConfig,
        abortController.signal
      );

      // ✅ 修复：正确处理返回格式（对象或字符串）
      let responseText = '';
      if (typeof response === 'string') {
        // 流式模式：直接是字符串
        responseText = response;
      } else if (response && typeof response === 'object') {
        // 非流式模式：返回 { text, metadata } 对象
        responseText = response.text || '';
      }

      if (responseText && responseText.length > 0) {
        toastr.success('API 连接成功！');
        logger.info('variable', '[VariableAPIConfig] 测试成功，响应长度:', responseText.length);
      } else {
        toastr.error('API 返回空响应');
        logger.warn('variable', '[VariableAPIConfig] API返回空响应');
      }

    } catch (error) {
      logger.error('variable', '[VariableAPIConfig] 测试失败:', error);
      toastr.error('连接失败：' + error.message);
    }
  }

  /**
   * 清理不支持的参数（避免格式切换后残留）
   *
   * @param {string} format - 新的API格式
   * @param {string[]} supportedParams - 新格式支持的参数列表
   */
  cleanUnsupportedParams(format, supportedParams) {
    // 清理临时存储中不支持的参数
    const allParamNames = Object.keys(this.tempParams);
    const unsupportedParams = allParamNames.filter(p => !supportedParams.includes(p));

    for (const paramName of unsupportedParams) {
      delete this.tempParams[paramName];
      logger.debug('variable', '[VariableAPIConfig.cleanUnsupportedParams] 已删除不支持的参数:', paramName);
    }
  }

  /**
   * 根据API类型切换配置区块的显示/隐藏
   *
   * @description
   * 模仿官方的 data-source 机制，根据选择的API类型显示对应的配置表单
   *
   * @param {string} source - API类型（openai/claude/custom等）
   */
  toggleApiSourceForms(source) {
    // 查找所有带有 data-var-v2-source 属性的元素
    const elements = this.pageElement.querySelectorAll('[data-var-v2-source]');

    elements.forEach(element => {
      const validSources = element.getAttribute('data-var-v2-source')?.split(',') || [];
      const shouldShow = validSources.includes(source);

      // 使用 style.display 控制显示/隐藏
      /** @type {HTMLElement} */ (element).style.display = shouldShow ? '' : 'none';
    });

    logger.debug('variable', '[VariableAPIConfig.toggleApiSourceForms] 已切换配置区块，当前API类型:', source);
  }

  /**
   * 渲染高级参数UI（根据API格式动态生成）
   *
   * @description
   * 根据选择的API格式，动态生成对应的参数配置UI（温度、Top P等）
   *
   * @param {string} format - API格式（openai/claude/google等）
   */
  renderAdvancedParams(format) {
    const container = this.pageElement.querySelector('#var-v2ApiParamsContainer');
    if (!container) {
      logger.warn('variable', '[VariableAPIConfig.renderAdvancedParams] 未找到参数容器');
      return;
    }

    // 获取该格式支持的参数列表
    const supportedParams = getSupportedParams(format, 'variable');
    logger.debug('variable', '[VariableAPIConfig.renderAdvancedParams] 开始渲染参数，格式:', format, '参数列表:', supportedParams);

    // ✅ 关键修复：清理不支持的旧参数（避免格式切换后残留）
    this.cleanUnsupportedParams(format, supportedParams);

    // 清空容器
    container.innerHTML = '';

    // 逐个生成参数控件
    for (const paramName of supportedParams) {
      const definition = PARAMS_DEFINITIONS[paramName];
      if (!definition) {
        logger.warn('variable', '[VariableAPIConfig] 未知参数定义:', paramName);
        continue;
      }

      // 创建参数控件HTML
      const paramHtml = `
        <div class="api-settings-param var-v2-api-settings-param range-block" data-param="${paramName}">
          <div class="api-settings-section-title var-v2-api-settings-section-title range-block-title" style="font-size: 0.9em; margin-bottom: 0.5em;">
            <span>${definition.label}</span>
            <span class="range-block-counter">${definition.min} - ${definition.max}</span>
          </div>
          <div style="display: flex; gap: 0.5em; align-items: center;">
            <input
              type="range"
              class="api-settings-range var-v2-api-settings-range"
              id="var-v2ApiParam_${paramName}"
              min="${definition.min}"
              max="${definition.max}"
              step="${definition.step}"
              value="${definition.default}"
              style="flex: 1;"
            >
            <input
              type="number"
              class="api-settings-input var-v2-api-settings-input text_pole"
              id="var-v2ApiParamNumber_${paramName}"
              min="${definition.min}"
              max="${definition.max}"
              step="${definition.step}"
              value="${definition.default}"
              style="width: 5em; padding: 0.3em 0.5em; text-align: center;"
            >
          </div>
          <div class="api-settings-hint var-v2-api-settings-hint" style="font-size: 0.85em;">
            ${definition.hint}
          </div>
        </div>
      `;

      container.insertAdjacentHTML('beforeend', paramHtml);

      // 绑定双向同步事件
      const rangeInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`#var-v2ApiParam_${paramName}`));
      const numberInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`#var-v2ApiParamNumber_${paramName}`));

      if (rangeInput && numberInput) {
        // 滑块 → 数字框
        rangeInput.addEventListener('input', () => {
          numberInput.value = rangeInput.value;
          this.saveParamValue(paramName, parseFloat(rangeInput.value));
        });

        // 数字框 → 滑块
        numberInput.addEventListener('input', () => {
          rangeInput.value = numberInput.value;
          this.saveParamValue(paramName, parseFloat(numberInput.value));
        });
      }
    }

    // 加载保存的参数值到UI
    this.loadParamValuesToUI(format);

    logger.info('variable', '[VariableAPIConfig.renderAdvancedParams] ✅ 参数UI已渲染，共', supportedParams.length, '个参数');
  }

  /**
   * 保存参数值到 settings（持久化存储）
   *
   * @description
   * 同时保存到两个地方：
   * 1. tempParams（临时存储）- 用于UI同步
   * 2. extension_settings.apiConfig.params（持久化）- 刷新页面后还在
   *
   * @param {string} paramName - 参数名（如 temperature、top_p 等）
   * @param {number} value - 参数值
   */
  saveParamValue(paramName, value) {
    // 保存到临时存储（用于UI同步）
    this.tempParams[paramName] = value;

    // ✅ 同时保存到 extension_settings（持久化）
    const settings = this.getSettings();
    const currentParams = settings.apiConfig.params || {};
    this.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        params: {
          ...currentParams,
          [paramName]: value
        }
      }
    });

    logger.debug('variable', '[VariableAPIConfig.saveParamValue] 已保存参数:', paramName, '=', value);
  }

  /**
   * 加载参数值到UI（从 extension_settings 读取）
   *
   * @param {string} format - API格式
   */
  loadParamValuesToUI(format) {
    const settings = this.getSettings();
    const savedParams = settings.apiConfig.params || {};
    const supportedParams = getSupportedParams(format, 'variable');

    for (const paramName of supportedParams) {
      // 优先从 extension_settings 读取，其次从临时存储读取
      const savedValue = savedParams[paramName] ?? this.tempParams[paramName];
      if (savedValue === undefined) continue;

      // 同步到临时存储
      this.tempParams[paramName] = savedValue;

      const rangeInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector(`#var-v2ApiParam_${paramName}`));
      const numberInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector(`#var-v2ApiParamNumber_${paramName}`));

      if (rangeInput && numberInput) {
        rangeInput.value = String(savedValue);
        numberInput.value = String(savedValue);
        logger.debug('variable', '[VariableAPIConfig.loadParamValuesToUI] 已加载参数:', paramName, '=', savedValue);
      }
    }
  }
}


