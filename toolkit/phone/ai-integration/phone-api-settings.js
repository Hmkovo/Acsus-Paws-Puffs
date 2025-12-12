/**
 * 手机 - API配置管理模块
 *
 * @description
 * 负责管理自定义API配置：
 * - 保存/加载/删除配置
 * - 配置列表管理
 * - 从API刷新模型列表
 * - 测试API连接
 * - 绑定API设置事件
 *
 * @module PhoneAPIConfig
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { oai_settings } from '../../../../../../../scripts/openai.js';
import logger from '../../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';
import { showConfirmPopup } from '../utils/popup-helper.js';
import { extension_settings } from '../../../../../../../scripts/extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { getSupportedParams, PARAMS_DEFINITIONS, getDefaultParams } from './phone-api-params-config.js';

// ========================================
// [CONST] 常量
// ========================================
const EXT_ID = 'acsusPawsPuffs';
const MODULE_NAME = 'phone';

// ========================================
// [CORE] API配置管理类
// ========================================

/**
 * API配置管理器
 *
 * @class PhoneAPIConfig
 */
export class PhoneAPIConfig {
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
   * 处理 API 来源切换、配置管理、参数调整等操作
   *
   * API 来源切换逻辑：
   * - 切换到自定义 API：渲染高级参数 UI（加载已有配置或使用默认格式）
   * - 切换到酒馆 API：显示提示信息（参数由酒馆主界面控制）
   */
  bindApiSettingsEvents() {
    // API 来源选择
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiSource'));
    const customApiSettings = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#phoneCustomApiSettings'));

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

        // 显示/隐藏自定义配置区域
        if (customApiSettings) {
          customApiSettings.style.display = source === 'custom' ? 'block' : 'none';
        }

        // ✅ 根据来源决定是否渲染高级参数
        const container = this.pageElement.querySelector('#phoneApiParamsContainer');
        if (source === 'custom') {
          // 使用自定义API：渲染参数UI
          if (settings.apiConfig.currentConfigId) {
            this.loadApiConfig(settings.apiConfig.currentConfigId);
          } else {
            const defaultFormat = this.getDefaultFormatFromTavern();
            this.renderAdvancedParams(defaultFormat);
          }
        } else {
          // 使用酒馆API：显示提示
          if (container) {
            container.innerHTML = '<div class="api-settings-hint">使用酒馆API时，参数由酒馆主界面控制</div>';
          }
        }

        logger.info('[PhoneAPIConfig] API来源已切换:', source);
      });
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.addEventListener('change', () => {
        const settings = this.getSettings();

        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            stream: apiStreamCheckbox.checked
          }
        });

        logger.info('[PhoneAPIConfig] 流式生成已', apiStreamCheckbox.checked ? '启用' : '禁用');
      });
    }

    // 工具调用开关（Function Calling）
    const apiToolCallingCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiToolCalling'));
    if (apiToolCallingCheckbox) {
      apiToolCallingCheckbox.addEventListener('change', () => {
        const settings = this.getSettings();

        this.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            useToolCalling: apiToolCallingCheckbox.checked
          }
        });

        logger.info('[PhoneAPIConfig] 工具调用已', apiToolCallingCheckbox.checked ? '启用' : '禁用');
      });
    }

    // API 配置选择（切换配置）
    const apiConfigSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiConfigSelect'));
    if (apiConfigSelect) {
      apiConfigSelect.addEventListener('change', () => {
        const configId = apiConfigSelect.value;
        this.loadApiConfig(configId);
      });
    }

    // 保存配置
    const apiConfigSaveBtn = this.pageElement.querySelector('#phoneApiConfigSave');
    if (apiConfigSaveBtn) {
      apiConfigSaveBtn.addEventListener('click', () => {
        this.saveCurrentApiConfig();
      });
    }

    // 删除配置
    const apiConfigDeleteBtn = this.pageElement.querySelector('#phoneApiConfigDelete');
    if (apiConfigDeleteBtn) {
      apiConfigDeleteBtn.addEventListener('click', () => {
        this.deleteApiConfig();
      });
    }

    // 密钥显示/隐藏
    const apiKeyToggle = this.pageElement.querySelector('#phoneApiKeyToggle');
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiKey'));
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

    // 模型选择
    const apiModelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiModelSelect'));
    const apiModelManualWrapper = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#phoneApiModelManualWrapper'));

    if (apiModelSelect) {
      apiModelSelect.addEventListener('change', () => {
        const value = apiModelSelect.value;

        // 如果选择"手动输入..."，显示手动输入框
        if (apiModelManualWrapper) {
          apiModelManualWrapper.style.display = value === '__manual__' ? 'block' : 'none';
        }
      });
    }

    // 刷新模型列表
    const apiRefreshModelsBtn = this.pageElement.querySelector('#phoneApiRefreshModels');
    if (apiRefreshModelsBtn) {
      apiRefreshModelsBtn.addEventListener('click', () => {
        this.refreshModelsFromAPI();
      });
    }

    // 测试连接
    const apiTestBtn = this.pageElement.querySelector('#phoneApiTest');
    if (apiTestBtn) {
      apiTestBtn.addEventListener('click', () => {
        this.testApiConnection();
      });
    }

    // ✅ API格式选择（动态显示高级参数）
    const apiFormatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiFormat'));
    if (apiFormatSelect) {
      apiFormatSelect.addEventListener('change', () => {
        const format = apiFormatSelect.value;
        logger.debug('[PhoneAPIConfig] API格式已切换:', format);
        this.renderAdvancedParams(format);
      });
    }

    // ✅ 高级参数折叠/展开
    const paramsToggle = this.pageElement.querySelector('#phoneApiParamsToggle');
    const paramsContainer = this.pageElement.querySelector('#phoneApiParamsContainer');
    const paramsIcon = this.pageElement.querySelector('#phoneApiParamsIcon');
    if (paramsToggle && paramsContainer && paramsIcon) {
      paramsToggle.addEventListener('click', () => {
        const isExpanded = paramsContainer.style.display !== 'none';
        paramsContainer.style.display = isExpanded ? 'none' : 'block';
        paramsIcon.className = isExpanded ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
      });
    }

    // 加载现有设置到 UI
    this.loadApiSettingsToUI();

    logger.debug('[PhoneAPIConfig] API设置事件已绑定');
  }

  /**
   * 获取手机设置
   *
   * @returns {Object} 手机设置对象
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
        useToolCalling: false,  // 默认关闭工具调用
        customConfigs: [],
        currentConfigId: null
      };
    }
    return extension_settings[EXT_ID][MODULE_NAME];
  }

  /**
   * 更新手机设置
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
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiSource'));
    if (apiSourceSelect) {
      apiSourceSelect.value = apiConfig.source || 'default';
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.checked = apiConfig.stream || false;
    }

    // 工具调用开关
    const apiToolCallingCheckbox = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiToolCalling'));
    if (apiToolCallingCheckbox) {
      apiToolCallingCheckbox.checked = apiConfig.useToolCalling || false;
    }

    // 显示/隐藏自定义配置区域
    const customApiSettings = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#phoneCustomApiSettings'));
    if (customApiSettings) {
      customApiSettings.style.display = apiConfig.source === 'custom' ? 'block' : 'none';
    }

    // 加载配置列表到下拉框
    this.refreshApiConfigList();

    // ✅ 根据API来源决定是否渲染高级参数
    if (apiConfig.source === 'custom') {
      // 使用自定义API：渲染参数UI
      if (apiConfig.currentConfigId) {
        this.loadApiConfig(apiConfig.currentConfigId);
      } else {
        // 新建配置时，渲染默认格式的参数
        const defaultFormat = this.getDefaultFormatFromTavern();
        this.renderAdvancedParams(defaultFormat);
      }
    } else {
      // 使用酒馆API：显示提示
      const container = this.pageElement.querySelector('#phoneApiParamsContainer');
      if (container) {
        container.innerHTML = '<div class="api-settings-hint">使用酒馆API时，参数由酒馆主界面控制</div>';
      }
    }

    logger.debug('[PhoneAPIConfig] API设置已加载到UI');
  }

  /**
   * 刷新 API 配置列表
   *
   * @description
   * 更新配置下拉框的选项列表
   */
  refreshApiConfigList() {
    const settings = this.getSettings();
    const configs = settings.apiConfig.customConfigs || [];

    const select = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiConfigSelect'));
    if (!select) return;

    // 清空现有选项（保留第一个"新建配置..."）
    select.innerHTML = '<option value="">新建配置...</option>';

    // 添加已保存的配置
    configs.forEach(config => {
      const option = document.createElement('option');
      option.value = config.id;
      option.textContent = config.name || config.id;
      select.appendChild(option);
    });

    // 选中当前配置
    if (settings.apiConfig.currentConfigId) {
      select.value = settings.apiConfig.currentConfigId;
    }

    logger.debug('[PhoneAPIConfig] 配置列表已刷新，共', configs.length, '个');
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
    logger.debug('[PhoneAPIConfig.getDefaultFormatFromTavern] 从酒馆API源推断默认格式:', tavernSource, '→', detectedFormat);

    return detectedFormat;
  }

  /**
   * 加载 API 配置到表单
   *
   * @param {string} configId - 配置ID（空字符串=新建）
   */
  loadApiConfig(configId) {
    const settings = this.getSettings();
    const configs = settings.apiConfig.customConfigs || [];

    // 查找配置
    const config = configs.find(c => c.id === configId);

    // 获取表单元素
    const nameInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiConfigName'));
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiKey'));
    const formatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiFormat'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiModelManual'));
    const modelManualWrapper = /** @type {HTMLElement|null} */ (this.pageElement.querySelector('#phoneApiModelManualWrapper'));

    if (config) {
      // 加载已有配置
      if (nameInput) nameInput.value = config.name || '';
      if (baseUrlInput) baseUrlInput.value = config.baseUrl || '';
      if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
      if (formatSelect) formatSelect.value = config.format || 'openai';

      // 加载模型
      if (modelSelect) {
        const modelInList = Array.from(modelSelect.options).some(opt => opt.value === config.model);

        if (modelInList) {
          modelSelect.value = config.model || '';
          if (modelManualWrapper) modelManualWrapper.style.display = 'none';
        } else if (config.model) {
          modelSelect.value = '__manual__';
          if (modelManualInput) modelManualInput.value = config.model;
          if (modelManualWrapper) modelManualWrapper.style.display = 'block';
        }
      }

      // 更新当前配置ID
      this.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentConfigId: configId
        }
      });

      // ✅ 清空临时存储（加载现有配置）
      this.tempParams = {};

      // ✅ 渲染高级参数UI
      this.renderAdvancedParams(config.format || 'openai');

      logger.info('[PhoneAPIConfig] 已加载配置:', config.name);
    } else {
      // 清空表单（新建配置）
      if (nameInput) nameInput.value = '';
      if (baseUrlInput) baseUrlInput.value = '';
      if (apiKeyInput) apiKeyInput.value = '';
      if (formatSelect) formatSelect.value = this.getDefaultFormatFromTavern();
      if (modelSelect) modelSelect.value = '';
      if (modelManualInput) modelManualInput.value = '';
      if (modelManualWrapper) modelManualWrapper.style.display = 'none';

      // ✅ 清空临时存储（新建配置）
      this.tempParams = {};

      // 清除当前配置ID
      this.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentConfigId: null
        }
      });

      // ✅ 渲染默认格式的参数UI
      const defaultFormat = this.getDefaultFormatFromTavern();
      this.renderAdvancedParams(defaultFormat);

      logger.debug('[PhoneAPIConfig] 表单已清空，准备新建配置');
    }
  }

  /**
   * 保存当前 API 配置
   *
   * @async
   */
  async saveCurrentApiConfig() {
    // 读取表单数据
    const nameInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiConfigName'));
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiKey'));
    const formatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiFormat'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiModelManual'));

    const name = nameInput?.value.trim();
    const baseUrl = baseUrlInput?.value.trim();
    const apiKey = apiKeyInput?.value.trim();
    const format = formatSelect?.value.trim() || 'openai';

    // 获取模型名
    let model = '';
    if (modelSelect?.value === '__manual__') {
      model = modelManualInput?.value.trim() || '';
    } else {
      model = modelSelect?.value.trim() || '';
    }

    // 验证必填项
    if (!name) {
      showErrorToast('请填写配置名称');
      return;
    }

    if (!baseUrl) {
      showErrorToast('请填写 API 端点');
      return;
    }

    if (!model) {
      showErrorToast('请选择或输入模型名称');
      return;
    }

    const settings = this.getSettings();
    const configs = [...(settings.apiConfig.customConfigs || [])];
    const currentConfigId = settings.apiConfig.currentConfigId;

    // 检查是否是更新现有配置
    const existingIndex = configs.findIndex(c => c.id === currentConfigId);
    const existingConfig = existingIndex >= 0 ? configs[existingIndex] : null;

    // ✅ 关键修复：读取当前UI上的参数值（支持新建配置时保存参数）
    const currentParams = this.readParamsFromUI(format);

    // ✅ 关键修复：保留现有的 params（高级参数）
    const configData = {
      id: currentConfigId || `config_${Date.now()}`,
      name: name,
      baseUrl: baseUrl,
      apiKey: apiKey,
      format: format,
      model: model,
      params: currentParams  // ← 使用从UI读取的参数
    };

    if (existingIndex >= 0) {
      // 更新现有配置
      configs[existingIndex] = configData;
      logger.info('[PhoneAPIConfig] 已更新配置:', name, '(保留', Object.keys(configData.params).length, '个参数)');
    } else {
      // 新增配置
      configs.push(configData);
      logger.info('[PhoneAPIConfig] 已新增配置:', name);
    }

    // 保存到 settings
    this.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        customConfigs: configs,
        currentConfigId: configData.id
      }
    });

    // 刷新配置列表
    this.refreshApiConfigList();

    // ✅ 清空临时存储（参数已保存到配置）
    this.tempParams = {};
    logger.debug('[PhoneAPIConfig] 已清空临时参数存储');

    showSuccessToast(`配置「${name}」已保存`);
  }

  /**
   * 删除 API 配置
   *
   * @async
   */
  async deleteApiConfig() {
    const settings = this.getSettings();
    const currentConfigId = settings.apiConfig.currentConfigId;

    if (!currentConfigId) {
      showErrorToast('请先选择要删除的配置');
      return;
    }

    const configs = settings.apiConfig.customConfigs || [];
    const config = configs.find(c => c.id === currentConfigId);

    if (!config) {
      showErrorToast('配置不存在');
      return;
    }

    // 二次确认
    const confirmed = await showConfirmPopup(
      '删除配置',
      `确定要删除配置「${config.name}」吗？此操作不可撤销。`,
      { danger: true, okButton: '删除' }
    );

    if (!confirmed) {
      return;
    }

    // 删除配置
    const newConfigs = configs.filter(c => c.id !== currentConfigId);

    this.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        customConfigs: newConfigs,
        currentConfigId: null
      }
    });

    // 刷新配置列表
    this.refreshApiConfigList();

    // 清空表单
    this.loadApiConfig('');

    showSuccessToast(`配置「${config.name}」已删除`);
    logger.info('[PhoneAPIConfig] 已删除配置:', config.name);
  }

  /**
   * 从 API 刷新可用模型列表
   *
   * @async
   */
  async refreshModelsFromAPI() {
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiModelSelect'));

    const baseUrl = baseUrlInput?.value.trim();
    const apiKey = apiKeyInput?.value.trim();

    // 验证必填项
    if (!baseUrl) {
      showErrorToast('请先填写 API 端点');
      return;
    }

    if (!apiKey) {
      showErrorToast('请先填写 API 密钥');
      return;
    }

    showInfoToast('正在获取模型列表...');
    logger.info('[PhoneAPIConfig] 开始获取模型列表, baseUrl:', baseUrl);

    try {
      // 调用 /v1/models API
      let cleanBaseUrl = baseUrl;
      if (cleanBaseUrl.endsWith('/v1')) {
        cleanBaseUrl = cleanBaseUrl.slice(0, -3);
        logger.debug('[PhoneAPIConfig] 检测到 baseUrl 末尾有 /v1，已去除:', cleanBaseUrl);
      }
      const modelsUrl = `${cleanBaseUrl}/v1/models`;
      logger.debug('[PhoneAPIConfig] 最终模型列表 URL:', modelsUrl);

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
        logger.warn('[PhoneAPIConfig] 模型列表为空');
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
      logger.info('[PhoneAPIConfig] 模型列表已更新，共', models.length, '个');

    } catch (error) {
      logger.error('[PhoneAPIConfig] 获取失败:', error);
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
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiKey'));
    const formatSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiFormat'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.pageElement.querySelector('#phoneApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector('#phoneApiModelManual'));

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
      baseUrl: baseUrlInput?.value.trim() || '',
      apiKey: apiKeyInput?.value.trim() || '',
      format: formatSelect?.value.trim() || 'openai',
      model: model || 'gpt-4o-mini'
    };

    // 验证必填项
    if (!testConfig.baseUrl) {
      showErrorToast('请填写 API 端点');
      return;
    }

    if (!testConfig.model) {
      showErrorToast('请选择或输入模型名称');
      return;
    }

    showInfoToast('正在测试连接...');
    logger.info('[PhoneAPIConfig] 开始测试 API 连接');

    try {
      // ✅ 修复：构造messages数组而不是字符串（照搬日记）
      const testMessages = [
        { role: 'user', content: '测试连接，请回复"OK"' }
      ];

      // 创建测试用的 AbortController
      const abortController = new AbortController();

      // 调用 API 实例的 callAPIWithStreaming 方法（完全照搬日记）
      const response = await this.api.callAPIWithStreaming(
        testMessages,
        testConfig,
        abortController.signal
      );

      if (response && response.length > 0) {
        showSuccessToast('API 连接成功！');
        logger.info('[PhoneAPIConfig] 测试成功，响应长度:', response.length);
      } else {
        showErrorToast('API 返回空响应');
        logger.warn('[PhoneAPIConfig] API返回空响应');
      }

    } catch (error) {
      logger.error('[PhoneAPIConfig] 测试失败:', error);
      showErrorToast('连接失败：' + error.message);
    }
  }

  /**
   * 从临时存储和已保存配置读取参数值
   *
   * @description
   * 合并两个来源的参数：
   * 1. 临时存储（新建配置时的参数）
   * 2. 已保存配置的参数
   *
   * @param {string} format - API格式
   * @returns {Object.<string, number>} 参数名 -> 参数值的映射
   */
  readParamsFromUI(format) {
    const settings = this.getSettings();
    const currentConfigId = settings.apiConfig.currentConfigId;

    // ✅ 优先使用临时存储的参数（新建配置时）
    let params = { ...this.tempParams };

    // ✅ 如果有当前配置，合并已保存的参数
    if (currentConfigId) {
      const configs = settings.apiConfig.customConfigs || [];
      const config = configs.find(c => c.id === currentConfigId);

      if (config && config.params) {
        // 已保存的参数作为基础，临时参数覆盖
        params = { ...config.params, ...this.tempParams };
      }
    }

    logger.info('[PhoneAPIConfig.readParamsFromUI] ✅ 读取了', Object.keys(params).length, '个参数');
    return params;
  }

  /**
   * 清理不支持的参数（避免格式切换后残留）
   *
   * @description
   * 当用户切换API格式时（如从Google切换到OpenAI），删除新格式不支持的旧参数
   * 例如：OpenAI不支持top_k，切换到OpenAI时应删除旧的top_k值
   *
   * @param {string} format - 新的API格式
   * @param {string[]} supportedParams - 新格式支持的参数列表
   */
  cleanUnsupportedParams(format, supportedParams) {
    const settings = this.getSettings();
    const currentConfigId = settings.apiConfig.currentConfigId;

    if (!currentConfigId) {
      return; // 没有当前配置，无需清理
    }

    const configs = settings.apiConfig.customConfigs || [];
    const config = configs.find(c => c.id === currentConfigId);

    if (!config || !config.params) {
      return; // 没有参数需要清理
    }

    // 找出不支持的参数
    const allParamNames = Object.keys(config.params);
    const unsupportedParams = allParamNames.filter(p => !supportedParams.includes(p));

    if (unsupportedParams.length === 0) {
      return; // 没有不支持的参数
    }

    // 删除不支持的参数
    for (const paramName of unsupportedParams) {
      delete config.params[paramName];
      logger.info('[PhoneAPIConfig.cleanUnsupportedParams] 已删除不支持的参数:', paramName, '(格式:', format, ')');
    }

    // 保存更新
    this.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        customConfigs: configs
      }
    });

    logger.info('[PhoneAPIConfig.cleanUnsupportedParams] ✅ 参数清理完成，删除了', unsupportedParams.length, '个不支持的参数');
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
    const container = this.pageElement.querySelector('#phoneApiParamsContainer');
    if (!container) {
      logger.warn('[PhoneAPIConfig.renderAdvancedParams] 未找到参数容器');
      return;
    }

    // 获取该格式支持的参数列表
    const supportedParams = getSupportedParams(format);
    logger.debug('[PhoneAPIConfig.renderAdvancedParams] 开始渲染参数，格式:', format, '参数列表:', supportedParams);

    // ✅ 关键修复：清理不支持的旧参数（避免格式切换后残留）
    this.cleanUnsupportedParams(format, supportedParams);

    // 清空容器
    container.innerHTML = '';

    // 逐个生成参数控件
    for (const paramName of supportedParams) {
      const definition = PARAMS_DEFINITIONS[paramName];
      if (!definition) {
        logger.warn('[PhoneAPIConfig] 未知参数定义:', paramName);
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
              id="phoneApiParam_${paramName}"
              min="${definition.min}"
              max="${definition.max}"
              step="${definition.step}"
              value="${definition.default}"
              style="flex: 1;"
            >
            <input
              type="number"
              class="api-settings-input"
              id="phoneApiParamNumber_${paramName}"
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
      const rangeInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`#phoneApiParam_${paramName}`));
      const numberInput = /** @type {HTMLInputElement|null} */ (container.querySelector(`#phoneApiParamNumber_${paramName}`));

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

    logger.info('[PhoneAPIConfig.renderAdvancedParams] ✅ 参数UI已渲染，共', supportedParams.length, '个参数');
  }

  /**
   * 保存参数值到配置（实时自动保存）
   *
   * @description
   * 用户调整参数时立即触发，实现实时保存
   * - 如果有当前配置ID：保存到该配置
   * - 如果是新建配置：保存到临时存储，等点击"保存配置"时一起保存
   *
   * @param {string} paramName - 参数名
   * @param {number} value - 参数值
   */
  saveParamValue(paramName, value) {
    const settings = this.getSettings();
    const currentConfigId = settings.apiConfig.currentConfigId;

    if (!currentConfigId) {
      // ✅ 新建配置时：保存到临时存储
      this.tempParams[paramName] = value;
      logger.debug('[PhoneAPIConfig.saveParamValue] 已保存到临时存储:', paramName, '=', value);
      return;
    }

    // ✅ 更新现有配置：直接保存到配置
    const configs = settings.apiConfig.customConfigs || [];
    const config = configs.find(c => c.id === currentConfigId);

    if (!config) {
      logger.warn('[PhoneAPIConfig.saveParamValue] 未找到配置:', currentConfigId);
      return;
    }

    // 初始化params对象（如果不存在）
    if (!config.params) {
      config.params = {};
    }

    // 保存参数值
    config.params[paramName] = value;

    // 更新到settings
    this.updateSettings({
      apiConfig: {
        ...settings.apiConfig,
        customConfigs: configs
      }
    });

    logger.debug('[PhoneAPIConfig.saveParamValue] 已保存参数:', paramName, '=', value);
  }

  /**
   * 加载参数值到UI
   *
   * @param {string} format - API格式
   */
  loadParamValuesToUI(format) {
    const settings = this.getSettings();
    const currentConfigId = settings.apiConfig.currentConfigId;

    if (!currentConfigId) {
      logger.debug('[PhoneAPIConfig.loadParamValuesToUI] 无当前配置ID，使用默认值');
      return;
    }

    const configs = settings.apiConfig.customConfigs || [];
    const config = configs.find(c => c.id === currentConfigId);

    if (!config || !config.params) {
      logger.debug('[PhoneAPIConfig.loadParamValuesToUI] 无保存的参数，使用默认值');
      return;
    }

    // 获取该格式支持的参数列表
    const supportedParams = getSupportedParams(format);

    for (const paramName of supportedParams) {
      const savedValue = config.params[paramName];
      if (savedValue === undefined) continue;

      const rangeInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector(`#phoneApiParam_${paramName}`));
      const numberInput = /** @type {HTMLInputElement|null} */ (this.pageElement.querySelector(`#phoneApiParamNumber_${paramName}`));

      if (rangeInput && numberInput) {
        rangeInput.value = String(savedValue);
        numberInput.value = String(savedValue);
        logger.debug('[PhoneAPIConfig.loadParamValuesToUI] 已加载参数:', paramName, '=', savedValue);
      }
    }
  }
}

