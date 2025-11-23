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
  logger.debug('[APISettingsUI] 渲染API设置页面');

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
      logger.debug('[APISettingsUI] 点击返回按钮');
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

  logger.info('[APISettingsUI] API设置页面渲染完成');

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
      <!-- API来源选择 -->
      <div class="api-settings-section">
        <div class="api-settings-section-title">API来源</div>
        <select id="phoneApiSource" class="api-settings-select">
          <option value="default">使用酒馆API（默认）</option>
          <option value="custom">使用自定义API</option>
        </select>
        <div class="api-settings-hint">
          默认模式会使用酒馆当前的API配置
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
        <!-- 配置管理 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">配置管理</div>
          <div class="api-settings-row">
            <select id="phoneApiConfigSelect" class="api-settings-select">
              <option value="">新建配置...</option>
            </select>
            <button id="phoneApiConfigSave" class="api-settings-btn api-settings-btn-primary">
              <i class="fa-solid fa-floppy-disk"></i> 保存
            </button>
            <button id="phoneApiConfigDelete" class="api-settings-btn api-settings-btn-danger">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

        <!-- 配置名称 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">配置名称</div>
          <input type="text" id="phoneApiConfigName" class="api-settings-input" placeholder="例如：Claude API">
        </div>

        <!-- API端点 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">API端点</div>
          <input type="text" id="phoneApiBaseUrl" class="api-settings-input" placeholder="https://api.example.com">
          <div class="api-settings-hint">
            API的基础URL，例如：https://api.openai.com
          </div>
        </div>

        <!-- API密钥 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">API密钥</div>
          <div class="api-settings-password-wrapper">
            <input type="password" id="phoneApiKey" class="api-settings-input" placeholder="sk-...">
            <button id="phoneApiKeyToggle" class="api-settings-password-toggle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </div>

        <!-- API类型 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">API类型</div>
          <select id="phoneApiFormat" class="api-settings-select">
            <option value="openai">OpenAI 兼容格式</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="google">Google AI (Gemini)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="mistral">Mistral AI</option>
            <option value="ai21">AI21 Jurassic</option>
            <option value="custom">自动检测</option>
          </select>
          <div class="api-settings-hint">
            选择API类型以确定消息格式转换方式，不同API需要不同的格式
          </div>
        </div>

        <!-- 模型选择 -->
        <div class="api-settings-section">
          <div class="api-settings-section-title">模型</div>
          <div class="api-settings-row">
            <select id="phoneApiModelSelect" class="api-settings-select">
              <option value="">请选择模型...</option>
              <option value="__manual__">手动输入...</option>
            </select>
            <button id="phoneApiRefreshModels" class="api-settings-btn">
              <i class="fa-solid fa-rotate"></i> 刷新
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

