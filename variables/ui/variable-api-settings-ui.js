/**
 * 变量 API 设置页面 UI (Variable API Settings UI)
 *
 * @module variables/ui/variable-api-settings-ui
 *
 * @description
 * 完整的 API 配置页面，使用变量模块的内部弹窗系统
 * - 支持 22 种官方 API 类型
 * - 反向代理配置（折叠面板）
 * - 密钥显示/隐藏切换
 * - 高级参数配置
 *
 * @changelog
 * - 2026-01-13: 改用变量模块内部弹窗，统一视觉风格
 */

import logger from '../../logger.js';
import { VariableAPIConfig } from '../variable-api-settings.js';
import { getVariableAPI } from '../variable-api-manager.js';

/** @type {HTMLElement|null} */
let popupOverlay = null;

/**
 * 打开 API 设置页面（使用变量模块内部弹窗）
 *
 * @returns {void}
 */
export function openAPISettingsPage() {
  if (popupOverlay) {
    logger.debug('[VariableAPISettingsUI] 弹窗已存在，跳过');
    return;
  }

  logger.info('[VariableAPISettingsUI] 打开 API 设置页面');

  // 创建弹窗
  popupOverlay = document.createElement('div');
  popupOverlay.className = 'var-v2-popup-overlay';
  popupOverlay.innerHTML = `
    <div class="var-v2-popup" style="width: 360px; max-height: 80vh;">
      <div class="var-v2-popup-header">
        <span class="var-v2-popup-title">API 设置</span>
        <span class="var-v2-popup-close" id="var-v2-api-popup-close">
          <i class="fa-solid fa-xmark"></i>
        </span>
      </div>
      <div class="var-v2-popup-body" style="padding: 0;">
        ${createAPISettingsHTML()}
      </div>
    </div>
  `;

  document.body.appendChild(popupOverlay);

  // 获取 API 管理器实例（单例）
  const api = getVariableAPI();

  // 创建 API 配置管理器实例，传入 API 管理器
  const apiConfig = new VariableAPIConfig(popupOverlay, { api });

  // 绑定事件
  apiConfig.bindApiSettingsEvents();

  // 绑定关闭按钮
  const closeBtn = popupOverlay.querySelector('#var-v2-api-popup-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAPISettingsPage);
  }

  // 点击遮罩关闭
  popupOverlay.addEventListener('click', (e) => {
    if (e.target === popupOverlay) {
      closeAPISettingsPage();
    }
  });

  // 显示动画
  requestAnimationFrame(() => {
    popupOverlay?.classList.add('show');
  });

  logger.info('[VariableAPISettingsUI] API 设置页面已打开');
}

/**
 * 关闭 API 设置页面
 */
export function closeAPISettingsPage() {
  if (!popupOverlay) return;

  popupOverlay.classList.remove('show');

  setTimeout(() => {
    popupOverlay?.remove();
    popupOverlay = null;
    logger.info('[VariableAPISettingsUI] API 设置页面已关闭');
  }, 200);
}

/**
 * 创建 API 设置页面 HTML
 *
 * @returns {string} HTML字符串
 */
function createAPISettingsHTML() {
  return `
    <div class="api-settings-content">
      <!-- API来源选择 -->
      <div class="api-settings-section">
        <div class="api-settings-section-title">API来源</div>
        <select id="var-v2ApiSource" class="api-settings-select">
          <option value="default">跟随酒馆设置（默认）</option>
          <option value="custom">自定义API</option>
        </select>
        <div class="api-settings-hint">
          跟随酒馆设置会使用酒馆当前的API配置
        </div>
      </div>

      <!-- 流式生成开关 -->
      <div class="api-settings-section">
        <label class="api-settings-checkbox">
          <input type="checkbox" id="var-v2ApiStream">
          <span>启用流式生成</span>
        </label>
      </div>

      <!-- 自定义API设置（默认隐藏） -->
      <div id="var-v2CustomApiSettings" class="api-settings-custom" style="display: none;">

        <!-- API类型选择 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">API类型</div>
          <select id="var-v2ApiFormat" class="api-settings-select">
            <optgroup label="常用">
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="makersuite">Google AI (Gemini)</option>
              <option value="openrouter">OpenRouter</option>
              <option value="deepseek">DeepSeek</option>
            </optgroup>
            <optgroup label="其他官方API">
              <option value="ai21">AI21</option>
              <option value="aimlapi">AI/ML API</option>
              <option value="azure_openai">Azure OpenAI</option>
              <option value="chutes">Chutes</option>
              <option value="cohere">Cohere</option>
              <option value="electronhub">Electron Hub</option>
              <option value="fireworks">Fireworks AI</option>
              <option value="groq">Groq</option>
              <option value="mistralai">MistralAI</option>
              <option value="moonshot">Moonshot AI</option>
              <option value="nanogpt">NanoGPT</option>
              <option value="perplexity">Perplexity</option>
              <option value="pollinations">Pollinations</option>
              <option value="siliconflow">SiliconFlow</option>
              <option value="vertexai">Vertex AI</option>
              <option value="xai">xAI (Grok)</option>
              <option value="zai">Z.AI (GLM)</option>
            </optgroup>
            <optgroup label="通用">
              <option value="custom">自定义（OpenAI兼容）</option>
            </optgroup>
          </select>
        </div>

        <!-- 通用配置区块：API密钥 -->
        <div id="var-v2ApiKeySection" class="api-settings-section" data-var-v2-source="openai,claude,makersuite,deepseek,mistralai,cohere,perplexity,groq,xai,ai21,moonshot,fireworks,electronhub,chutes,nanogpt,aimlapi,siliconflow,zai">
          <div class="api-settings-section-title">API密钥</div>
          <div class="api-settings-password-wrapper">
            <input type="password" id="var-v2ApiKey" class="api-settings-input" placeholder="sk-...">
            <button id="var-v2ApiKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </div>

        <!-- 反向代理配置 -->
        <div id="var-v2ReverseProxySection" class="api-settings-section" data-var-v2-source="openai,claude,mistralai,makersuite,vertexai,deepseek,xai">
          <div class="api-settings-section-title" style="cursor: pointer;" id="var-v2ReverseProxyToggle">
            <i class="fa-solid fa-chevron-right" id="var-v2ReverseProxyIcon"></i>
            反向代理
          </div>
          <div id="var-v2ReverseProxyContent" style="display: none; margin-top: 0.5em;">
            <div style="margin-bottom: 0.5em;">
              <div class="api-settings-row">
                <select id="var-v2ProxyPreset" class="api-settings-select" style="flex: 1;">
                  <option value="">无</option>
                </select>
                <button id="var-v2ProxySave" class="var-v2-btn small" title="保存">
                  <i class="fa-solid fa-floppy-disk"></i>
                </button>
                <button id="var-v2ProxyDelete" class="var-v2-btn small" title="删除">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
            <input type="text" id="var-v2ReverseProxyUrl" class="api-settings-input" placeholder="代理URL" style="margin-bottom: 0.5em;">
            <div class="api-settings-password-wrapper">
              <input type="password" id="var-v2ReverseProxyPassword" class="api-settings-input" placeholder="代理密码">
              <button id="var-v2ReverseProxyPasswordToggle" class="api-settings-password-toggle">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- OpenRouter专用配置 -->
        <div id="var-v2OpenRouterSection" class="api-settings-section" data-var-v2-source="openrouter" style="display: none;">
          <div class="api-settings-section-title">OpenRouter 密钥</div>
          <div class="api-settings-password-wrapper">
            <input type="password" id="var-v2OpenRouterKey" class="api-settings-input" placeholder="sk-or-...">
            <button id="var-v2OpenRouterKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <button id="var-v2OpenRouterAuth" class="var-v2-btn small primary" style="margin-top: 0.5em;">
            <i class="fa-solid fa-key"></i> 授权
          </button>
        </div>

        <!-- Custom专用：自定义端点 -->
        <div id="var-v2CustomSection" class="api-settings-section" data-var-v2-source="custom" style="display: none;">
          <div class="api-settings-section-title">自定义端点</div>
          <input type="text" id="var-v2ApiBaseUrl" class="api-settings-input" placeholder="http://localhost:1234/v1" style="margin-bottom: 0.5em;">
          <div class="api-settings-password-wrapper" style="margin-bottom: 0.5em;">
            <input type="password" id="var-v2CustomApiKey" class="api-settings-input" placeholder="API密钥（可选）">
            <button id="var-v2CustomApiKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <input type="text" id="var-v2CustomModelId" class="api-settings-input" placeholder="模型名称" style="margin-bottom: 0.5em;">
          <div class="api-settings-row">
            <select id="var-v2CustomModelSelect" class="api-settings-select" style="flex: 1;">
              <option value="">可用模型</option>
            </select>
            <button id="var-v2CustomRefreshModels" class="var-v2-btn small" title="刷新">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
        </div>

        <!-- Vertex AI专用配置 -->
        <div id="var-v2VertexAISection" class="api-settings-section" data-var-v2-source="vertexai" style="display: none;">
          <div class="api-settings-section-title">Vertex AI</div>
          <select id="var-v2VertexAuthMode" class="api-settings-select" style="margin-bottom: 0.5em;">
            <option value="express">Express 模式</option>
            <option value="full">完整版</option>
          </select>
          <div id="var-v2VertexExpressConfig">
            <div class="api-settings-password-wrapper" style="margin-bottom: 0.5em;">
              <input type="password" id="var-v2VertexApiKey" class="api-settings-input" placeholder="API密钥">
              <button id="var-v2VertexApiKeyToggle" class="api-settings-password-toggle">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
            <input type="text" id="var-v2VertexProjectId" class="api-settings-input" placeholder="项目ID（可选）">
          </div>
          <div id="var-v2VertexFullConfig" style="display: none;">
            <textarea id="var-v2VertexServiceAccount" class="api-settings-input" rows="3" placeholder="服务账号JSON"></textarea>
          </div>
          <input type="text" id="var-v2VertexRegion" class="api-settings-input" value="us-central1" placeholder="区域" style="margin-top: 0.5em;">
        </div>

        <!-- Azure OpenAI专用配置 -->
        <div id="var-v2AzureSection" class="api-settings-section" data-var-v2-source="azure_openai" style="display: none;">
          <div class="api-settings-section-title">Azure OpenAI</div>
          <input type="text" id="var-v2AzureBaseUrl" class="api-settings-input" placeholder="Base URL" style="margin-bottom: 0.5em;">
          <input type="text" id="var-v2AzureDeploymentName" class="api-settings-input" placeholder="部署名称" style="margin-bottom: 0.5em;">
          <select id="var-v2AzureApiVersion" class="api-settings-select" style="margin-bottom: 0.5em;">
            <option value="2025-04-01-preview">2025-04-01-preview</option>
            <option value="2024-10-21">2024-10-21</option>
            <option value="2024-02-15-preview">2024-02-15-preview</option>
          </select>
          <div class="api-settings-password-wrapper" style="margin-bottom: 0.5em;">
            <input type="password" id="var-v2AzureApiKey" class="api-settings-input" placeholder="API密钥">
            <button id="var-v2AzureApiKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <input type="text" id="var-v2AzureModelName" class="api-settings-input" placeholder="模型名称">
        </div>

        <!-- Pollinations专用 -->
        <div id="var-v2PollinationsSection" class="api-settings-section" data-var-v2-source="pollinations" style="display: none;">
          <div class="api-settings-hint">由 Pollinations.AI 免费提供</div>
        </div>

        <!-- 模型选择（非Custom API使用） -->
        <div id="var-v2ModelSection" class="api-settings-section" data-var-v2-source="openai,claude,makersuite,openrouter,deepseek,mistralai,cohere,perplexity,groq,xai,ai21,moonshot,fireworks,electronhub,chutes,nanogpt,aimlapi,siliconflow,zai">
          <div class="api-settings-section-title">模型</div>
          <div class="api-settings-row">
            <select id="var-v2ApiModelSelect" class="api-settings-select" style="flex: 1;">
              <option value="">请选择...</option>
              <option value="__manual__">手动输入</option>
            </select>
            <button id="var-v2ApiRefreshModels" class="var-v2-btn small" title="刷新">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
          <div id="var-v2ApiModelManualWrapper" style="display: none; margin-top: 0.5em;">
            <input type="text" id="var-v2ApiModelManual" class="api-settings-input" placeholder="模型名称">
          </div>
        </div>

        <!-- 测试连接 -->
        <div class="api-settings-section">
          <button id="var-v2ApiTest" class="var-v2-btn primary" style="width: 100%;">
            <i class="fa-solid fa-flask"></i> 测试连接
          </button>
        </div>

        <!-- 高级参数 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title" style="cursor: pointer;" id="var-v2ApiParamsToggle">
            <i class="fa-solid fa-chevron-down" id="var-v2ApiParamsIcon"></i>
            高级参数
          </div>
          <div id="var-v2ApiParamsContainer" style="display: block; margin-top: 0.5em;">
          </div>
        </div>
      </div>
    </div>
  `;
}
