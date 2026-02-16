/**
 * API设置页面UI
 * @module phone/settings/api-settings-ui
 *
 * @description
 * 渲染API设置页面，管理自定义API配置
 */

import logger from '../../../logger.js';
import { PhoneAPIConfig } from '../ai-integration/phone-api-settings.js';
import { getPhoneSystem } from '../phone-system.js';

/**
 * 渲染API设置页面
 *
 * @param {Object} params - 页面参数
 * @returns {Promise<HTMLElement>} 页面元素
 */
export async function renderAPISettings(params) {
  logger.debug('phone','[APISettingsUI] 渲染API设置页面');

  // 创建页面容器（不要添加到DOM，由showPage统一管理）
  const page = document.createElement('div');
  page.id = 'page-api-settings';  // ✅ 格式固定：page-{名称}
  page.className = 'phone-page api-settings-page';

  // 渲染页面内容
  page.innerHTML = createAPISettingsHTML();

  // 绑定返回按钮事件
  const backBtn = page.querySelector('.api-settings-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', async () => {
      logger.debug('phone','[APISettingsUI] 点击返回按钮');
      const { hidePage } = await import('../phone-main-ui.js');
      const overlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
      if (overlay) {
        hidePage(overlay, 'api-settings');
      }
    });
  }

  // 创建API配置管理器实例并绑定事件（完全照搬日记）
  const phoneSystem = getPhoneSystem();
  const apiConfig = new PhoneAPIConfig(page, {
    api: phoneSystem ? phoneSystem.api : null  // 传入API实例
  });
  apiConfig.bindApiSettingsEvents();

  logger.info('phone','[APISettingsUI] API设置页面渲染完成');

  return page;  // ✅ 返回页面元素
}

/**
 * 创建API设置页面HTML
 *
 * @returns {string} HTML字符串
 */
function createAPISettingsHTML() {
  return `
    <!-- 顶部栏 -->
    <div class="api-settings-topbar">
      <button class="api-settings-back-btn">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <div class="api-settings-title">API设置</div>
    </div>

    <!-- 设置内容 -->
    <div class="api-settings-content">
      <!-- API来源选择（简化版：只有默认和自定义） -->
      <div class="api-settings-section">
        <div class="api-settings-section-title">API来源</div>
        <select id="phoneApiSource" class="api-settings-select">
          <option value="default">跟随酒馆设置（默认）</option>
          <option value="custom">自定义API</option>
        </select>
        <div class="api-settings-hint">
          跟随酒馆设置会使用酒馆当前的API配置；自定义API可填写反代URL和密钥
        </div>
      </div>

      <!-- 流式生成开关 -->
      <div class="api-settings-section">
        <div class="api-settings-section-title">流式生成</div>
        <label class="api-settings-checkbox">
          <input type="checkbox" id="phoneApiStream">
          <span>启用流式生成（实时显示回复）</span>
        </label>
      </div>

      <!-- 工具调用开关（Function Calling）-->
      <div class="api-settings-section">
        <div class="api-settings-section-title">工具调用（实验性）</div>
        <label class="api-settings-checkbox">
          <input type="checkbox" id="phoneApiToolCalling">
          <span>启用 Function Calling（别开启）</span>
        </label>
        <div class="api-settings-hint">
          目前仅 GPT 的部分模型稳定支持
        </div>
      </div>

      <!-- 自定义API设置（默认隐藏） -->
      <div id="phoneCustomApiSettings" class="api-settings-custom" style="display: none;">

        <!-- API类型选择（移到最上面，参考官方chat_completion_source） -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">API类型</div>
          <select id="phoneApiFormat" class="api-settings-select">
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

        <!-- ========== 各API类型的配置表单（根据选择动态显示） ========== -->

        <!-- 通用配置区块：API密钥（大部分API都需要） -->
        <div id="phoneApiKeySection" class="api-settings-section" data-phone-source="openai,claude,makersuite,deepseek,mistralai,cohere,perplexity,groq,xai,ai21,moonshot,fireworks,electronhub,chutes,nanogpt,aimlapi,siliconflow,zai">
          <div class="api-settings-section-title">API密钥</div>
          <div class="api-settings-password-wrapper">
            <input type="password" id="phoneApiKey" class="api-settings-input" placeholder="sk-...">
            <button id="phoneApiKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <div class="api-settings-hint" data-for="api_key">
            出于隐私考虑，保存后密钥将被隐藏
          </div>
        </div>

        <!-- 反向代理配置（适用于部分API，复刻官方样式） -->
        <div id="phoneReverseProxySection" class="api-settings-section" data-phone-source="openai,claude,mistralai,makersuite,vertexai,deepseek,xai" style="display: none;">
          <div class="api-settings-section-title" style="cursor: pointer; user-select: none;" id="phoneReverseProxyToggle">
            <i class="fa-solid fa-chevron-right" id="phoneReverseProxyIcon"></i>
            反向代理
          </div>
          <div id="phoneReverseProxyContent" style="display: none; margin-top: 0.5em;">
            <!-- 代理预设选择（复刻官方） -->
            <div style="margin-bottom: 0.8em;">
              <div class="api-settings-row">
                <select id="phoneProxyPreset" class="api-settings-select" style="flex: 1;">
                  <option value="">无</option>
                </select>
                <button id="phoneProxySave" class="api-settings-btn" title="保存代理">
                  <i class="fa-solid fa-floppy-disk"></i>
                </button>
                <button id="phoneProxyDelete" class="api-settings-btn api-settings-btn-danger" title="删除代理">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
            <!-- 代理服务器URL -->
            <div style="margin-bottom: 0.8em;">
              <div class="api-settings-hint" style="margin-bottom: 0.3em;">代理服务器 URL</div>
              <input type="text" id="phoneReverseProxyUrl" class="api-settings-input" placeholder="https://api.openai.com/v1">
              <div class="api-settings-hint" style="font-size: 0.8em; margin-top: 0.3em;">
                备用服务器URL（留空使用默认值）。不行？试试在末尾添加 <code>/v1</code>
              </div>
            </div>
            <!-- 代理密码 -->
            <div>
              <div class="api-settings-hint" style="margin-bottom: 0.3em;">代理密码</div>
              <div class="api-settings-password-wrapper">
                <input type="password" id="phoneReverseProxyPassword" class="api-settings-input" placeholder="将用作代理密码，而不是API密钥">
                <button id="phoneReverseProxyPasswordToggle" class="api-settings-password-toggle">
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </div>
            <!-- 警告提示 -->
            <div class="api-settings-hint" style="color: var(--SmartThemeQuoteColor); margin-top: 0.5em; font-size: 0.85em;">
              <i class="fa-solid fa-exclamation-triangle"></i>
              使用非自建代理有数据隐私风险
            </div>
          </div>
        </div>

        <!-- OpenRouter专用配置 -->
        <div id="phoneOpenRouterSection" class="api-settings-section" data-phone-source="openrouter" style="display: none;">
          <div class="api-settings-section-title">OpenRouter API密钥</div>
          <div class="api-settings-hint" style="margin-bottom: 0.5em;">
            点击下方授权或从 <a href="https://openrouter.ai/keys/" target="_blank">OpenRouter</a> 获取密钥。
            <a href="https://openrouter.ai/account" target="_blank">查看剩余额度</a>
          </div>
          <div class="api-settings-password-wrapper">
            <input type="password" id="phoneOpenRouterKey" class="api-settings-input" placeholder="sk-or-...">
            <button id="phoneOpenRouterKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <div class="api-settings-row" style="margin-top: 0.5em;">
            <button id="phoneOpenRouterAuth" class="api-settings-btn api-settings-btn-primary">
              <i class="fa-solid fa-key"></i> 授权
            </button>
          </div>
        </div>

        <!-- Custom专用：自定义端点（复刻官方样式） -->
        <div id="phoneCustomSection" class="api-settings-section" data-phone-source="custom" style="display: none;">
          <!-- 自定义端点URL -->
          <div class="api-settings-section-title">自定义端点（Base URL）</div>
          <input type="text" id="phoneApiBaseUrl" class="api-settings-input" placeholder="例如：http://localhost:1234/v1">
          <div class="api-settings-hint">
            不行？试试在URL末尾添加 <code>/v1</code>。<code>/chat/completions</code> 后缀会自动补全。
          </div>

          <!-- API密钥（可选） -->
          <div class="api-settings-section-title" style="margin-top: 1em;">
            自定义 API 密钥 <small style="opacity: 0.7;">（可选）</small>
          </div>
          <div class="api-settings-password-wrapper">
            <input type="password" id="phoneCustomApiKey" class="api-settings-input" placeholder="sk-...">
            <button id="phoneCustomApiKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <div class="api-settings-hint">
            出于隐私考虑，保存后密钥将被隐藏
          </div>

          <!-- 输入模型名 -->
          <div class="api-settings-section-title" style="margin-top: 1em;">输入模型名</div>
          <input type="text" id="phoneCustomModelId" class="api-settings-input" list="phoneCustomModelList" placeholder="例如：gpt-4o">
          <datalist id="phoneCustomModelList">
            <!-- 模型列表将动态填充 -->
          </datalist>

          <!-- 可用模型下拉 -->
          <div class="api-settings-section-title" style="margin-top: 1em;">可用模型</div>
          <div class="api-settings-row">
            <select id="phoneCustomModelSelect" class="api-settings-select" style="flex: 1;">
              <option value="">无</option>
            </select>
            <button id="phoneCustomRefreshModels" class="api-settings-btn" title="刷新模型列表">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
        </div>

        <!-- Vertex AI专用配置（复刻官方样式） -->
        <div id="phoneVertexAISection" class="api-settings-section" data-phone-source="vertexai" style="display: none;">
          <!-- 认证模式选择 -->
          <div class="api-settings-section-title">认证模式</div>
          <select id="phoneVertexAuthMode" class="api-settings-select">
            <option value="express">Express 模式（API Key）</option>
            <option value="full">完整版（服务账号）</option>
          </select>

          <!-- Express 模式配置 -->
          <div id="phoneVertexExpressConfig" style="margin-top: 1em;">
            <div class="api-settings-section-title">API 密钥</div>
            <div class="api-settings-password-wrapper">
              <input type="password" id="phoneVertexApiKey" class="api-settings-input" placeholder="AIza...">
              <button id="phoneVertexApiKeyToggle" class="api-settings-password-toggle">
                <i class="fa-solid fa-eye"></i>
              </button>
            </div>
            <div class="api-settings-hint">
              <a href="https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode/overview" target="_blank">Express 模式文档</a>
            </div>

            <!-- 项目ID（Express模式） -->
            <div class="api-settings-section-title" style="margin-top: 1em;">项目 ID <small style="opacity: 0.7;">（可选）</small></div>
            <input type="text" id="phoneVertexProjectId" class="api-settings-input" placeholder="your-project-id">
            <div class="api-settings-hint">
              非 us-central1 区域时需要填写。可在 404 错误信息中找到。
            </div>
          </div>

          <!-- Full 模式配置 -->
          <div id="phoneVertexFullConfig" style="margin-top: 1em; display: none;">
            <div class="api-settings-section-title">服务账号 JSON</div>
            <textarea id="phoneVertexServiceAccount" class="api-settings-input" rows="4" placeholder='{"type": "service_account", ...}'></textarea>
            <div class="api-settings-hint">
              粘贴完整的服务账号 JSON 内容。<a href="https://cloud.google.com/vertex-ai/docs/authentication" target="_blank">认证文档</a>
            </div>
          </div>

          <!-- 区域选择 -->
          <div class="api-settings-section-title" style="margin-top: 1em;">区域</div>
          <input type="text" id="phoneVertexRegion" class="api-settings-input" list="phoneVertexRegionList" value="us-central1" placeholder="us-central1">
          <datalist id="phoneVertexRegionList">
            <option value="global">global</option>
            <option value="us-central1">us-central1</option>
            <option value="us-east1">us-east1</option>
            <option value="us-west1">us-west1</option>
            <option value="europe-west1">europe-west1</option>
            <option value="europe-west4">europe-west4</option>
            <option value="asia-northeast1">asia-northeast1</option>
            <option value="asia-southeast1">asia-southeast1</option>
          </datalist>
          <div class="api-settings-hint">
            <a href="https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations" target="_blank">查看可用区域</a>
          </div>
        </div>

        <!-- Azure OpenAI专用配置（复刻官方样式） -->
        <div id="phoneAzureSection" class="api-settings-section" data-phone-source="azure_openai" style="display: none;">
          <!-- Base URL -->
          <div class="api-settings-section-title">Azure Base URL</div>
          <input type="text" id="phoneAzureBaseUrl" class="api-settings-input" placeholder="https://your-resource.openai.azure.com/">
          <div class="api-settings-hint">
            Azure OpenAI 资源的端点 URL
          </div>

          <!-- 部署名称 -->
          <div class="api-settings-section-title" style="margin-top: 1em;">部署名称</div>
          <input type="text" id="phoneAzureDeploymentName" class="api-settings-input" placeholder="your-deployment-name">
          <div class="api-settings-hint">
            Azure 中模型部署的名称
          </div>

          <!-- API版本 -->
          <div class="api-settings-section-title" style="margin-top: 1em;">API 版本</div>
          <select id="phoneAzureApiVersion" class="api-settings-select">
            <option value="2025-04-01-preview">2025-04-01-preview</option>
            <option value="2024-10-21">2024-10-21</option>
            <option value="2024-02-15-preview">2024-02-15-preview</option>
          </select>

          <!-- API密钥 -->
          <div class="api-settings-section-title" style="margin-top: 1em;">Azure API 密钥</div>
          <div class="api-settings-password-wrapper">
            <input type="password" id="phoneAzureApiKey" class="api-settings-input" placeholder="your-azure-api-key">
            <button id="phoneAzureApiKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
          <div class="api-settings-hint">
            出于隐私考虑，保存后密钥将被隐藏
          </div>

          <!-- 模型名称 -->
          <div class="api-settings-section-title" style="margin-top: 1em;">模型名称</div>
          <input type="text" id="phoneAzureModelName" class="api-settings-input" placeholder="gpt-4o">
          <div class="api-settings-hint">
            部署的底层模型名称（如 gpt-4o、gpt-4-turbo）
          </div>
        </div>

        <!-- Pollinations专用（免费，无需密钥） -->
        <div id="phonePollinationsSection" class="api-settings-section" data-phone-source="pollinations" style="display: none;">
          <div class="api-settings-hint">
            <a href="https://pollinations.ai/" target="_blank" rel="noopener noreferrer">由 Pollinations.AI 免费提供</a><br>
            请避免发送敏感信息。输出可能包含提供商的广告。
          </div>
        </div>

        <!-- Chutes专用配置（1.15.0新增） -->
        <div id="phoneChutesSection" class="api-settings-section" data-phone-source="chutes" style="display: none;">
          <div class="api-settings-hint" style="margin-bottom: 0.5em;">
            <a href="https://chutes.ai/app/api/billing-balance" target="_blank" rel="noopener noreferrer">查看账单/余额</a>
          </div>
        </div>

        <!-- ========== 模型选择（非Custom API使用） ========== -->
        <div id="phoneModelSection" class="api-settings-section" data-phone-source="openai,claude,makersuite,openrouter,deepseek,mistralai,cohere,perplexity,groq,xai,ai21,moonshot,fireworks,electronhub,chutes,nanogpt,aimlapi,siliconflow,zai">
          <div class="api-settings-section-title">模型</div>
          <div class="api-settings-row">
            <select id="phoneApiModelSelect" class="api-settings-select" style="flex: 1;">
              <option value="">请选择模型...</option>
              <option value="__manual__">手动输入...</option>
            </select>
            <button id="phoneApiRefreshModels" class="api-settings-btn" title="刷新模型列表">
              <i class="fa-solid fa-rotate"></i>
            </button>
          </div>
          <!-- 手动输入模型（默认隐藏） -->
          <div id="phoneApiModelManualWrapper" style="display: none; margin-top: 0.5em;">
            <input type="text" id="phoneApiModelManual" class="api-settings-input" placeholder="gpt-4o-mini">
          </div>
        </div>

        <!-- 测试连接 -->
        <div class="api-settings-section">
          <button id="phoneApiTest" class="api-settings-btn api-settings-btn-test">
            <i class="fa-solid fa-flask"></i> 测试连接
          </button>
        </div>

        <!-- 高级参数（动态生成） -->
        <div class="api-settings-section">
          <div class="api-settings-section-title" style="cursor: pointer; user-select: none;" id="phoneApiParamsToggle">
            <i class="fa-solid fa-chevron-down" id="phoneApiParamsIcon"></i>
            高级参数
          </div>
          <div id="phoneApiParamsContainer" style="display: block; margin-top: 1em;">
            <!-- 参数将根据选择的API格式动态插入到这里 -->
          </div>
        </div>
      </div>

      <!-- TODO占位 -->
      <div class="api-settings-section" style="opacity: 0.5; pointer-events: none;">
        <div class="api-settings-section-title">TODO: 多API配置</div>
        <div class="api-settings-hint">
          未来支持为聊天和说说使用不同的API配置
        </div>
      </div>
    </div>
  `;
}

