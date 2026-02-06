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
import { getSupportedParams, PARAMS_DEFINITIONS, getDefaultParams } from './variable-api-params-config.js';

// ========================================
// [TOAST] 简易 Toast 工具（使用 SillyTavern 原生 toastr）
// ========================================

/**
 * 显示信息提示
 * @param {string} message - 消息
 */
function showInfoToast(message) {
    // @ts-ignore - toastr 是全局变量
    if (typeof toastr !== 'undefined') {
        toastr.info(message);
    } else {
        console.info('[VariableAPI]', message);
    }
}

/**
 * 显示成功提示
 * @param {string} message - 消息
 */
function showSuccessToast(message) {
    // @ts-ignore - toastr 是全局变量
    if (typeof toastr !== 'undefined') {
        toastr.success(message);
    } else {
        console.log('[VariableAPI]', message);
    }
}

/**
 * 显示错误提示
 * @param {string} message - 消息
 */
function showErrorToast(message) {
    // @ts-ignore - toastr 是全局变量
    if (typeof toastr !== 'undefined') {
        toastr.error(message);
    } else {
        console.error('[VariableAPI]', message);
    }
}

/**
 * 显示确认弹窗
 * @param {string} title - 标题
 * @param {string} message - 消息
 * @param {Object} [options] - 选项
 * @returns {Promise<boolean>} 是否确认
 */
async function showConfirmPopup(title, message, options = {}) {
    // 使用原生 confirm（简单实现）
    return confirm(`${title}\n\n${message}`);
}

// ========================================
// [CONST] 常量
// ========================================
const EXT_ID = 'acsusPawsPuffs';
const MODULE_NAME = 'variables_v2';

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
          } else {
            const defaultFormat = this.getDefaultFormatFromTavern();
            this.renderAdvancedParams(defaultFormat);
          }
        } else {
          // 跟随酒馆设置：显示提示
          if (container) {
            container.innerHTML = '<div class="api-settings-hint">跟随酒馆设置时，参数由酒馆主界面控制</div>';
          }
        }

        logger.info('[VariableAPIConfig] API来源已切换:', source);
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

        logger.info('[VariableAPIConfig] 流式生成已', apiStreamCheckbox.checked ? '启用' : '禁用');
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

        logger.info('[VariableAPIConfig] 工具调用已', apiToolCallingCheckbox.checked ? '启用' : '禁用');
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
        logger.info('[VariableAPIConfig] 打开 OpenRouter 授权页面');
      });
    }

    // 反向代理折叠/展开
    const reverseProxyToggle = this.pageElement.querySelector('#var-v2ReverseProxyToggle');
    const reverseProxyContent = this.pageElement.querySelector('#var-v2ReverseProxyContent');
    const reverseProxyIcon = this.pageElement.querySelector('#var-v2ReverseProxyIcon');
    if (reverseProxyToggle && reverseProxyContent && reverseProxyIcon) {
      reverseProxyToggle.addEventListener('click', () => {
        const isExpanded = reverseProxyContent.style.display !== 'none';
        reverseProxyContent.style.display = isExpanded ? 'none' : 'block';
        reverseProxyIcon.className = isExpanded ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
      });
    }

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
          logger.debug('[VariableAPIConfig] Custom API模型已保存（从下拉框选择）:', customModelSelect.value);
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
          logger.debug('[VariableAPIConfig] 模型已保存:', value);
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
      apiFormatSelect.addEventListener('change', () => {
        const format = apiFormatSelect.value;
        const settings = this.getSettings();

        // ✅ 保存 API 类型到 settings
        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            format: format
          }
        });

        logger.debug('[VariableAPIConfig] API格式已切换并保存:', format);
        this.toggleApiSourceForms(format);  // 切换配置区块显示
        this.renderAdvancedParams(format);
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
        logger.debug('[VariableAPIConfig] 通用API密钥已保存');
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
        logger.debug('[VariableAPIConfig] OpenRouter密钥已保存');
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
        logger.debug('[VariableAPIConfig] 手动输入模型已保存:', apiModelManualInput.value.trim());
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
        logger.debug('[VariableAPIConfig] Custom API端点已保存');
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
        logger.debug('[VariableAPIConfig] Custom API密钥已保存');
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
        logger.debug('[VariableAPIConfig] Custom API模型已保存');
      });
    }

    // ✅ 高级参数折叠/展开
    const paramsToggle = this.pageElement.querySelector('#var-v2ApiParamsToggle');
    const paramsContainer = this.pageElement.querySelector('#var-v2ApiParamsContainer');
    const paramsIcon = this.pageElement.querySelector('#var-v2ApiParamsIcon');
    if (paramsToggle && paramsContainer && paramsIcon) {
      paramsToggle.addEventListener('click', () => {
        const isExpanded = paramsContainer.style.display !== 'none';
        paramsContainer.style.display = isExpanded ? 'none' : 'block';
        paramsIcon.className = isExpanded ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
      });
    }

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
        logger.debug('[VariableAPIConfig] Vertex AI 认证模式已切换:', mode);
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
        logger.debug('[VariableAPIConfig] Vertex AI API密钥已保存');
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
        logger.debug('[VariableAPIConfig] Vertex AI 项目ID已保存');
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
        logger.debug('[VariableAPIConfig] Vertex AI 服务账号已保存');
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
        logger.debug('[VariableAPIConfig] Vertex AI 区域已保存');
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
        logger.debug('[VariableAPIConfig] Azure Base URL已保存');
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
        logger.debug('[VariableAPIConfig] Azure 部署名称已保存');
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
        logger.debug('[VariableAPIConfig] Azure API版本已保存');
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
        logger.debug('[VariableAPIConfig] Azure API密钥已保存');
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
        logger.debug('[VariableAPIConfig] Azure 模型名称已保存');
      });
    }

    // 加载现有设置到 UI
    this.loadApiSettingsToUI();

    logger.debug('[VariableAPIConfig] API设置事件已绑定');
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
    } else {
      // 跟随酒馆设置：显示提示
      if (container) {
        container.innerHTML = '<div class="api-settings-hint">跟随酒馆设置时，参数由酒馆主界面控制</div>';
      }
    }

    logger.debug('[VariableAPIConfig] API设置已加载到UI');
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

    logger.debug('[VariableAPIConfig] 反向代理预设列表已刷新，共', presets.length, '个');
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

      logger.info('[VariableAPIConfig] 已加载反向代理预设:', presetName);
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
    const reverseProxyIcon = this.pageElement.querySelector('#var-v2ReverseProxyIcon');

    if (reverseProxyContent && reverseProxyContent.style.display === 'none') {
      reverseProxyContent.style.display = 'block';
      if (reverseProxyIcon) {
        reverseProxyIcon.className = 'fa-solid fa-chevron-down';
      }
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
      showErrorToast('请先填写代理服务器 URL');
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
      logger.info('[VariableAPIConfig] 已更新反向代理预设:', presetName);
    } else {
      // 新增预设
      presets.push({
        name: presetName.trim(),
        url: url,
        password: password
      });
      logger.info('[VariableAPIConfig] 已新增反向代理预设:', presetName);
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

    showSuccessToast(`代理预设「${presetName}」已保存`);
  }

  /**
   * 删除反向代理预设
   */
  async deleteProxyPreset() {
    const select = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ProxyPreset'));
    const presetName = select?.value;

    if (!presetName) {
      showErrorToast('请先选择要删除的预设');
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

    showSuccessToast(`代理预设「${presetName}」已删除`);
    logger.info('[VariableAPIConfig] 已删除反向代理预设:', presetName);
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

    logger.debug('[VariableAPIConfig] Vertex AI 配置已加载');
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

    logger.debug('[VariableAPIConfig] Azure OpenAI 配置已加载');
  }


  /**
   * 刷新 Custom API 的模型列表
   */
  async refreshCustomModels() {
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2CustomModelSelect'));
    const modelDatalist = this.pageElement.querySelector('#var-v2CustomModelList');

    const baseUrl = baseUrlInput?.value.trim();
    const apiKey = apiKeyInput?.value.trim();

    if (!baseUrl) {
      showErrorToast('请先填写自定义端点 URL');
      return;
    }

    showInfoToast('正在获取模型列表...');
    logger.info('[VariableAPIConfig] 开始获取 Custom API 模型列表');

    try {
      let cleanBaseUrl = baseUrl;
      if (cleanBaseUrl.endsWith('/v1')) {
        cleanBaseUrl = cleanBaseUrl.slice(0, -3);
      }
      const modelsUrl = `${cleanBaseUrl}/v1/models`;

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(modelsUrl, { headers });

      if (!response.ok) {
        throw new Error(`API 返回错误: ${response.status}`);
      }

      const data = await response.json();

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

      showSuccessToast(`已获取 ${models.length} 个模型`);
      logger.info('[VariableAPIConfig] Custom API 模型列表已更新，共', models.length, '个');

    } catch (error) {
      logger.error('[VariableAPIConfig] 获取 Custom API 模型失败:', error);
      showErrorToast('获取模型列表失败：' + error.message);
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
    logger.debug('[VariableAPIConfig.getDefaultFormatFromTavern] 从酒馆API源推断默认格式:', tavernSource, '→', detectedFormat);

    return detectedFormat;
  }

  /**
   * 获取API源的显示名称
   *
   * @param {string} source - API源ID
   * @returns {string} 显示名称
   */
  getApiSourceDisplayName(source) {
    const displayNames = {
      'default': '跟随酒馆设置',
      'openai': 'OpenAI',
      'claude': 'Claude (Anthropic)',
      'makersuite': 'Google AI (Gemini)',
      'vertexai': 'Vertex AI',
      'openrouter': 'OpenRouter',
      'mistralai': 'Mistral AI',
      'cohere': 'Cohere',
      'perplexity': 'Perplexity',
      'groq': 'Groq',
      'deepseek': 'DeepSeek',
      'xai': 'xAI (Grok)',
      'ai21': 'AI21',
      'moonshot': 'Moonshot (Kimi)',
      'fireworks': 'Fireworks',
      'electronhub': 'ElectronHub',
      'nanogpt': 'NanoGPT',
      'aimlapi': 'AIMLAPI',
      'pollinations': 'Pollinations',
      'cometapi': 'CometAPI',
      'azure_openai': 'Azure OpenAI',
      'zai': 'ZAI',
      'siliconflow': 'Silicon Flow',
      'custom': '自定义API'
    };
    return displayNames[source] || source;
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
      'openrouter': 'https://openrouter.ai/api'
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
   *   - 无反向代理时：使用默认端点和通用API密钥
   *
   * @async
   */
  async refreshModelsFromAPI() {
    const formatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiFormat'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelSelect'));
    const format = formatSelect?.value || 'openai';

    // 根据API类型获取正确的端点和密钥
    let baseUrl = '';
    let apiKey = '';

    if (format === 'custom') {
      // Custom API：从专用输入框读取
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiBaseUrl'));
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
      baseUrl = baseUrlInput?.value.trim() || '';
      apiKey = apiKeyInput?.value.trim() || '';
    } else if (format === 'openrouter') {
      // OpenRouter：使用固定端点和专用密钥
      baseUrl = 'https://openrouter.ai/api';
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2OpenRouterKey'));
      apiKey = apiKeyInput?.value.trim() || '';
    } else {
      // 其他API：检查是否有反向代理
      const reverseProxyUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyUrl'));
      const reverseProxyPasswordInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ReverseProxyPassword'));
      const reverseProxyUrl = reverseProxyUrlInput?.value.trim() || '';
      const reverseProxyPassword = reverseProxyPasswordInput?.value.trim() || '';

      if (reverseProxyUrl) {
        // ✅ 有反向代理：使用反向代理URL和密码（复刻官方逻辑）
        baseUrl = reverseProxyUrl;
        apiKey = reverseProxyPassword;
        logger.debug('[VariableAPIConfig] 使用反向代理:', baseUrl);
      } else {
        // 无反向代理：使用默认端点和通用API密钥
        baseUrl = this.getDefaultBaseUrl(format);
        const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiKey'));
        apiKey = apiKeyInput?.value.trim() || '';
      }
    }

    // 验证必填项
    if (!baseUrl) {
      showErrorToast('请先填写 API 端点或反向代理 URL');
      return;
    }

    if (!apiKey) {
      showErrorToast('请先填写 API 密钥或反向代理密码');
      return;
    }

    showInfoToast('正在获取模型列表...');
    logger.info('[VariableAPIConfig] 开始获取模型列表, baseUrl:', baseUrl);

    try {
      // 调用 /v1/models API
      let cleanBaseUrl = baseUrl;
      if (cleanBaseUrl.endsWith('/v1')) {
        cleanBaseUrl = cleanBaseUrl.slice(0, -3);
        logger.debug('[VariableAPIConfig] 检测到 baseUrl 末尾有 /v1，已去除:', cleanBaseUrl);
      }
      const modelsUrl = `${cleanBaseUrl}/v1/models`;
      logger.debug('[VariableAPIConfig] 最终模型列表 URL:', modelsUrl);

      const response = await fetch(modelsUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

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
        logger.warn('[VariableAPIConfig] 模型列表为空');
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

      showSuccessToast(`已获取 ${models.length} 个模型`);
      logger.info('[VariableAPIConfig] 模型列表已更新，共', models.length, '个');

    } catch (error) {
      logger.error('[VariableAPIConfig] 获取失败:', error);
      showErrorToast('获取模型列表失败：' + error.message);
    }
  }


  /**
   * 测试 API 连接
   *
   * @async
   */
  async testApiConnection() {
    if (!this.api) {
      showErrorToast('API管理器未初始化');
      return;
    }

    // 读取当前表单数据
    const formatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiFormat'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiModelManual'));
    const format = formatSelect?.value.trim() || 'openai';

    // 根据API类型获取正确的端点和密钥
    let baseUrl = '';
    let apiKey = '';

    if (format === 'custom') {
      const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2ApiBaseUrl'));
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2CustomApiKey'));
      baseUrl = baseUrlInput?.value.trim() || '';
      apiKey = apiKeyInput?.value.trim() || '';
    } else if (format === 'openrouter') {
      baseUrl = 'https://openrouter.ai/api';
      const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#var-v2OpenRouterKey'));
      apiKey = apiKeyInput?.value.trim() || '';
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
    let model = '';
    if (modelSelect?.value === '__manual__') {
      model = modelManualInput?.value.trim() || '';
    } else {
      model = modelSelect?.value.trim() || '';
    }

    const testConfig = {
      source: 'custom',
      stream: false,
      baseUrl: baseUrl,
      apiKey: apiKey,
      format: format,
      model: model || 'gpt-4o-mini'
    };

    // 验证必填项
    if (!testConfig.baseUrl) {
      showErrorToast('请填写 API 端点或反向代理 URL');
      return;
    }

    if (!testConfig.model) {
      showErrorToast('请选择或输入模型名称');
      return;
    }

    showInfoToast('正在测试连接...');
    logger.info('[VariableAPIConfig] 开始测试 API 连接');

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
        showSuccessToast('API 连接成功！');
        logger.info('[VariableAPIConfig] 测试成功，响应长度:', responseText.length);
      } else {
        showErrorToast('API 返回空响应');
        logger.warn('[VariableAPIConfig] API返回空响应');
      }

    } catch (error) {
      logger.error('[VariableAPIConfig] 测试失败:', error);
      showErrorToast('连接失败：' + error.message);
    }
  }

  /**
   * 从临时存储读取参数值
   *
   * @param {string} format - API格式
   * @returns {Object.<string, number>} 参数名 -> 参数值的映射
   */
  readParamsFromUI(format) {
    // 使用临时存储的参数
    const params = { ...this.tempParams };
    logger.debug('[VariableAPIConfig.readParamsFromUI] 读取了', Object.keys(params).length, '个参数');
    return params;
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
      logger.debug('[VariableAPIConfig.cleanUnsupportedParams] 已删除不支持的参数:', paramName);
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

    logger.debug('[VariableAPIConfig.toggleApiSourceForms] 已切换配置区块，当前API类型:', source);
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
      logger.warn('[VariableAPIConfig.renderAdvancedParams] 未找到参数容器');
      return;
    }

    // 获取该格式支持的参数列表
    const supportedParams = getSupportedParams(format);
    logger.debug('[VariableAPIConfig.renderAdvancedParams] 开始渲染参数，格式:', format, '参数列表:', supportedParams);

    // ✅ 关键修复：清理不支持的旧参数（避免格式切换后残留）
    this.cleanUnsupportedParams(format, supportedParams);

    // 清空容器
    container.innerHTML = '';

    // 逐个生成参数控件
    for (const paramName of supportedParams) {
      const definition = PARAMS_DEFINITIONS[paramName];
      if (!definition) {
        logger.warn('[VariableAPIConfig] 未知参数定义:', paramName);
        continue;
      }

      // 创建参数控件HTML
      const paramHtml = `
        <div class="api-settings-param" data-param="${paramName}" style="margin-bottom: 1em;">
          <div class="api-settings-section-title" style="font-size: 0.9em; margin-bottom: 0.5em;">
            ${definition.label}
            <span style="opacity: 0.6; font-size: 0.85em; font-weight: normal; margin-left: 0.5em;">
              (${definition.min} - ${definition.max})
            </span>
          </div>
          <div style="display: flex; gap: 0.5em; align-items: center;">
            <input
              type="range"
              class="api-settings-range"
              id="var-v2ApiParam_${paramName}"
              min="${definition.min}"
              max="${definition.max}"
              step="${definition.step}"
              value="${definition.default}"
              style="flex: 1;"
            >
            <input
              type="number"
              class="api-settings-input"
              id="var-v2ApiParamNumber_${paramName}"
              min="${definition.min}"
              max="${definition.max}"
              step="${definition.step}"
              value="${definition.default}"
              style="width: 5em; padding: 0.3em 0.5em; text-align: center;"
            >
          </div>
          <div class="api-settings-hint" style="font-size: 0.85em;">
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

    logger.info('[VariableAPIConfig.renderAdvancedParams] ✅ 参数UI已渲染，共', supportedParams.length, '个参数');
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

    logger.debug('[VariableAPIConfig.saveParamValue] 已保存参数:', paramName, '=', value);
  }

  /**
   * 加载参数值到UI（从 extension_settings 读取）
   *
   * @param {string} format - API格式
   */
  loadParamValuesToUI(format) {
    const settings = this.getSettings();
    const savedParams = settings.apiConfig.params || {};
    const supportedParams = getSupportedParams(format);

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
        logger.debug('[VariableAPIConfig.loadParamValuesToUI] 已加载参数:', paramName, '=', savedValue);
      }
    }
  }
}
