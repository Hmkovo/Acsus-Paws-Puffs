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
  }

  /**
   * 绑定 API 设置事件
   * 
   * @description
   * 处理 API 来源切换、配置管理、参数调整等操作
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

    // 如果有当前配置，加载到表单
    if (apiConfig.currentConfigId) {
      this.loadApiConfig(apiConfig.currentConfigId);
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

      // 清除当前配置ID
      this.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentConfigId: null
        }
      });

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

    const configData = {
      id: currentConfigId || `config_${Date.now()}`,
      name: name,
      baseUrl: baseUrl,
      apiKey: apiKey,
      format: format,
      model: model
    };

    if (existingIndex >= 0) {
      // 更新现有配置
      configs[existingIndex] = configData;
      logger.info('[PhoneAPIConfig] 已更新配置:', name);
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
}

