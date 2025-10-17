/**
 * 日记 - API配置管理模块
 * 
 * @description
 * 负责管理自定义API配置：
 * - 保存/加载/删除配置
 * - 配置列表管理
 * - 从API刷新模型列表
 * - 测试API连接
 * - 绑定API设置事件
 * 
 * @module DiaryAPIConfig
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { callGenericPopup, POPUP_TYPE } from '../../../../../popup.js';
import logger from '../../logger.js';
import { showInfoToast, showSuccessToast, showErrorToast } from './diary-toast.js';

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
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiSource'));
    const customApiSettings = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryCustomApiSettings'));

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

        logger.info('[DiaryAPIConfig] API来源已切换:', source);
      });
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.addEventListener('change', () => {
        const settings = this.dataManager.getSettings();

        this.dataManager.updateSettings({
          apiConfig: {
            ...settings.apiConfig,
            stream: apiStreamCheckbox.checked
          }
        });

        logger.info('[DiaryAPIConfig] 流式生成已', apiStreamCheckbox.checked ? '启用' : '禁用');
      });
    }

    // API 配置选择（切换配置）
    const apiConfigSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiConfigSelect'));
    if (apiConfigSelect) {
      apiConfigSelect.addEventListener('change', () => {
        const configId = apiConfigSelect.value;
        this.loadApiConfig(configId);
      });
    }

    // 保存配置
    const apiConfigSaveBtn = this.panelElement.querySelector('#diaryApiConfigSave');
    if (apiConfigSaveBtn) {
      apiConfigSaveBtn.addEventListener('click', () => {
        this.saveCurrentApiConfig();
      });
    }

    // 删除配置
    const apiConfigDeleteBtn = this.panelElement.querySelector('#diaryApiConfigDelete');
    if (apiConfigDeleteBtn) {
      apiConfigDeleteBtn.addEventListener('click', () => {
        this.deleteApiConfig();
      });
    }

    // 密钥显示/隐藏
    const apiKeyToggle = this.panelElement.querySelector('#diaryApiKeyToggle');
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
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
    const apiModelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const apiModelManualWrapper = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryApiModelManualWrapper'));

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
    const apiRefreshModelsBtn = this.panelElement.querySelector('#diaryApiRefreshModels');
    if (apiRefreshModelsBtn) {
      apiRefreshModelsBtn.addEventListener('click', () => {
        this.refreshModelsFromAPI();
      });
    }

    // 测试连接
    const apiTestBtn = this.panelElement.querySelector('#diaryApiTest');
    if (apiTestBtn) {
      apiTestBtn.addEventListener('click', () => {
        this.testApiConnection();
      });
    }

    // 加载现有设置到 UI
    this.loadApiSettingsToUI();

    logger.debug('[DiaryAPIConfig] API设置事件已绑定');
  }

  /**
   * 加载 API 设置到 UI
   * 
   * @description
   * 从 dataManager 读取设置，填充到设置面板的表单中
   */
  loadApiSettingsToUI() {
    const settings = this.dataManager.getSettings();
    const apiConfig = settings.apiConfig;

    // API 来源
    const apiSourceSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiSource'));
    if (apiSourceSelect) {
      apiSourceSelect.value = apiConfig.source || 'default';
    }

    // 流式开关
    const apiStreamCheckbox = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiStream'));
    if (apiStreamCheckbox) {
      apiStreamCheckbox.checked = apiConfig.stream || false;
    }

    // 显示/隐藏自定义配置区域
    const customApiSettings = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryCustomApiSettings'));
    if (customApiSettings) {
      customApiSettings.style.display = apiConfig.source === 'custom' ? 'block' : 'none';
    }

    // 加载配置列表到下拉框
    this.refreshApiConfigList();

    // 如果有当前配置，加载到表单
    if (apiConfig.currentConfigId) {
      this.loadApiConfig(apiConfig.currentConfigId);
    }

    logger.debug('[DiaryAPIConfig] API设置已加载到UI');
  }

  /**
   * 刷新 API 配置列表
   * 
   * @description
   * 更新配置下拉框的选项列表
   */
  refreshApiConfigList() {
    const settings = this.dataManager.getSettings();
    const configs = settings.apiConfig.customConfigs || [];

    const select = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiConfigSelect'));
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

    logger.debug('[DiaryAPIConfig] 配置列表已刷新，共', configs.length, '个');
  }

  /**
   * 加载 API 配置到表单
   * 
   * @param {string} configId - 配置ID（空字符串=新建）
   */
  loadApiConfig(configId) {
    const settings = this.dataManager.getSettings();
    const configs = settings.apiConfig.customConfigs || [];

    // 查找配置
    const config = configs.find(c => c.id === configId);

    // 获取表单元素
    const nameInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiConfigName'));
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiModelManual'));
    const modelManualWrapper = /** @type {HTMLElement|null} */ (this.panelElement.querySelector('#diaryApiModelManualWrapper'));

    if (config) {
      // 加载已有配置
      if (nameInput) nameInput.value = config.name || '';
      if (baseUrlInput) baseUrlInput.value = config.baseUrl || '';
      if (apiKeyInput) apiKeyInput.value = config.apiKey || '';

      // 加载模型（检查是否在下拉框中）
      if (modelSelect) {
        const modelInList = Array.from(modelSelect.options).some(opt => opt.value === config.model);

        if (modelInList) {
          // 模型在列表中，直接选择
          modelSelect.value = config.model || '';
          if (modelManualWrapper) modelManualWrapper.style.display = 'none';
        } else if (config.model) {
          // 模型不在列表中，使用手动输入
          modelSelect.value = '__manual__';
          if (modelManualInput) modelManualInput.value = config.model;
          if (modelManualWrapper) modelManualWrapper.style.display = 'block';
        }
      }

      // 更新当前配置ID
      this.dataManager.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentConfigId: configId
        }
      });

      logger.info('[DiaryAPIConfig] 已加载配置:', config.name);
    } else {
      // 清空表单（新建配置）
      if (nameInput) nameInput.value = '';
      if (baseUrlInput) baseUrlInput.value = '';
      if (apiKeyInput) apiKeyInput.value = '';
      if (modelSelect) modelSelect.value = '';
      if (modelManualInput) modelManualInput.value = '';
      if (modelManualWrapper) modelManualWrapper.style.display = 'none';

      // 清除当前配置ID
      this.dataManager.updateSettings({
        apiConfig: {
          ...settings.apiConfig,
          currentConfigId: null
        }
      });

      logger.debug('[DiaryAPIConfig] 表单已清空，准备新建配置');
    }
  }

  /**
   * 保存当前 API 配置
   * 
   * @async
   * @description
   * 从表单读取当前配置，保存或更新到 customConfigs 列表
   */
  async saveCurrentApiConfig() {
    // 读取表单数据
    const nameInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiConfigName'));
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiModelManual'));

    const name = nameInput?.value.trim();
    const baseUrl = baseUrlInput?.value.trim();
    const apiKey = apiKeyInput?.value.trim();

    // 获取模型名（优先使用手动输入）
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

    const settings = this.dataManager.getSettings();
    const configs = [...(settings.apiConfig.customConfigs || [])];
    const currentConfigId = settings.apiConfig.currentConfigId;

    // 检查是否是更新现有配置
    const existingIndex = configs.findIndex(c => c.id === currentConfigId);

    const configData = {
      id: currentConfigId || `config_${Date.now()}`,
      name: name,
      baseUrl: baseUrl,
      apiKey: apiKey,
      model: model
    };

    if (existingIndex >= 0) {
      // 更新现有配置
      configs[existingIndex] = configData;
      logger.info('[DiaryAPIConfig] 已更新配置:', name);
    } else {
      // 新增配置
      configs.push(configData);
      logger.info('[DiaryAPIConfig] 已新增配置:', name);
    }

    // 保存到 settings
    this.dataManager.updateSettings({
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
   * @description
   * 删除当前选中的配置（需要二次确认）
   */
  async deleteApiConfig() {
    const settings = this.dataManager.getSettings();
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
    const confirmed = await callGenericPopup(
      `确定要删除配置「${config.name}」吗？此操作不可撤销。`,
      POPUP_TYPE.CONFIRM
    );

    if (!confirmed) {
      return;
    }

    // 删除配置
    const newConfigs = configs.filter(c => c.id !== currentConfigId);

    this.dataManager.updateSettings({
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
    logger.info('[DiaryAPIConfig] 已删除配置:', config.name);
  }

  /**
   * 从 API 刷新可用模型列表
   * 
   * @async
   * @description
   * 调用 /v1/models API 获取可用模型，填充到下拉框
   */
  async refreshModelsFromAPI() {
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));

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
    logger.info('[DiaryAPIConfig] 开始获取模型列表, baseUrl:', baseUrl);

    try {
      // 调用 /v1/models API
      const modelsUrl = `${baseUrl}/v1/models`;
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
        logger.warn('[DiaryAPIConfig] 模型列表为空');
        return;
      }

      // 更新下拉框
      if (modelSelect) {
        // 保留当前选中的值
        const currentValue = modelSelect.value;

        // 清空现有选项
        modelSelect.innerHTML = '<option value="">请选择模型...</option>';

        // 添加获取到的模型
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

        // 恢复之前的选择（如果还存在）
        if (currentValue && models.includes(currentValue)) {
          modelSelect.value = currentValue;
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
   * 测试 API 连接
   * 
   * @async
   * @description
   * 发送简单的测试请求，验证 API 配置是否正确
   */
  async testApiConnection() {
    if (!this.api) {
      showErrorToast('API管理器未初始化');
      return;
    }

    // 读取当前表单数据
    const baseUrlInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiBaseUrl'));
    const apiKeyInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiKey'));
    const modelSelect = /** @type {HTMLSelectElement|null} */ (this.panelElement.querySelector('#diaryApiModelSelect'));
    const modelManualInput = /** @type {HTMLInputElement|null} */ (this.panelElement.querySelector('#diaryApiModelManual'));

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
    logger.info('[DiaryAPIConfig] 开始测试 API 连接');

    try {
      // 构造简单的测试消息
      const testMessages = [
        { role: 'user', content: '测试连接，请回复"OK"' }
      ];

      // 创建测试用的 AbortController
      const abortController = new AbortController();

      // 调用 API
      const response = await this.api.callAPIWithStreaming(
        testMessages,
        testConfig,
        abortController.signal
      );

      if (response && response.length > 0) {
        showSuccessToast('API 连接成功！');
        logger.info('[DiaryAPIConfig] 测试成功，响应长度:', response.length);
      } else {
        showErrorToast('API 返回空响应');
        logger.warn('[DiaryAPIConfig] API返回空响应');
      }

    } catch (error) {
      logger.error('[DiaryAPIConfig] 测试失败:', error);
      showErrorToast('连接失败：' + error.message);
    }
  }
}

