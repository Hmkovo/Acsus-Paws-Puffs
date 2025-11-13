/**
 * 宏变量使用教程详情页
 * @module phone/help/macro-guide-detail
 */

import logger from '../../../logger.js';

/**
 * 渲染宏变量使用教程详情页
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 页面内容片段
 */
export async function renderMacroGuideDetail() {
  logger.info('[MacroGuideDetail] 开始渲染宏变量使用教程页');

  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'macro-guide-detail-wrapper';

  // 创建页面内容
  container.innerHTML = `
    <!-- 顶部栏 -->
    <div class="macro-guide-detail-topbar">
      <button class="macro-guide-detail-back-btn">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      <div class="macro-guide-detail-title">宏变量使用教程</div>
    </div>

    <!-- 内容区（可滚动） -->
    <div class="macro-guide-detail-content">
      <!-- 什么是宏变量 -->
      <div class="macro-guide-section">
        <div class="macro-guide-section-title">
          <i class="fa-solid fa-lightbulb"></i>
          <span>什么是宏变量？</span>
        </div>
        <div class="macro-guide-section-content">
          <p>宏变量是一种<strong>占位符</strong>，就像"填空题"一样。</p>
          <p>你在酒馆的提示词或世界书里写 <code>{{最新消息}}</code>，SillyTavern 跑起来的时候会<strong>自动替换</strong>成手机里的真实聊天记录。</p>
          
          <h4>举个例子：</h4>
          <p><strong>你写的提示词：</strong></p>
          <div class="macro-guide-code-block">
            <code>请根据我和角色的手机聊天记录继续对话：{{最新消息}}</code>
          </div>
          
          <p><strong>AI 实际收到的：</strong></p>
          <div class="macro-guide-code-block">
            <code>请根据我和角色的手机聊天记录继续对话：<br>
            [11-10 14:30] 我: 今天天气真好<br>
            [11-10 14:32] 角色: 是啊，要不要出去玩？<br>
            [11-10 14:35] 我: 好啊！</code>
          </div>
        </div>
      </div>

      <!-- 有哪些宏变量 -->
      <div class="macro-guide-section">
        <div class="macro-guide-section-title">
          <i class="fa-solid fa-list"></i>
          <span>有哪些宏变量可以用？</span>
        </div>
        <div class="macro-guide-section-content">
          <h4><code>{{最新消息}}</code></h4>
          <p>获取<strong>当前角色</strong>的最新 20 条手机聊天记录</p>
          <p class="macro-guide-note">
            <i class="fa-solid fa-circle-info"></i>
            适用场景：让 AI 根据最近的手机对话继续剧情
          </p>

          <h4><code>{{历史消息}}</code></h4>
          <p>获取<strong>当前角色</strong>的历史手机聊天记录（除最新 20 条外的所有消息）</p>
          <p class="macro-guide-note">
            <i class="fa-solid fa-circle-info"></i>
            适用场景：让 AI 了解更早的聊天背景
          </p>

          <h4><code>{{最新消息_角色名}}</code></h4>
          <p>获取<strong>指定角色</strong>的最新 20 条手机聊天记录</p>
          <p>举例：<code>{{最新消息_李四}}</code> 获取和李四的聊天记录</p>
          <p class="macro-guide-warning">
            <i class="fa-solid fa-triangle-exclamation"></i>
            注意：把"角色名"换成实际的角色名字，必须和手机联系人列表里的名字<strong>完全一致</strong>
          </p>

          <h4><code>{{历史消息_角色名}}</code></h4>
          <p>获取<strong>指定角色</strong>的历史手机聊天记录</p>
          <p>举例：<code>{{历史消息_张三}}</code> 获取和张三的早期聊天</p>

          <h4><code>{{当前时间}}</code></h4>
          <p>获取当前时间（格式：[2025-11-10 14:30]）</p>

          <h4><code>{{当前天气}}</code></h4>
          <p>获取当前天气（从手机设置里读取）</p>
        </div>
      </div>

      <!-- 怎么用 -->
      <div class="macro-guide-section">
        <div class="macro-guide-section-title">
          <i class="fa-solid fa-wrench"></i>
          <span>怎么使用宏变量？</span>
        </div>
        <div class="macro-guide-section-content">
          <h4>在世界书里使用</h4>
          <p>打开 SillyTavern 的世界书功能，在条目内容里写：</p>
          <div class="macro-guide-code-block">
            <code>&lt;线上消息&gt;<br>
            角色和我的手机聊天记录：<br>
            {{最新消息}}<br>
            &lt;/线上消息&gt;</code>
          </div>
          <p class="macro-guide-note">
            <i class="fa-solid fa-circle-info"></i>
            这样 AI 就能在对话时自动读取手机聊天内容
          </p>

          <h4>在提示词里使用</h4>
          <p>在 SillyTavern 的角色设定、系统提示词、作者注释等任何地方写：</p>
          <div class="macro-guide-code-block">
            <code>&lt;手机聊天记录&gt;<br>
            我和{{char}}的手机聊天：<br>
            {{最新消息}}<br>
            <br>
            根据最新消息，时间有推移，可能需要进行新剧情<br>
            &lt;/手机聊天记录&gt;</code>
          </div>
          <p class="macro-guide-note">
            <i class="fa-solid fa-circle-info"></i>
            <code>{{char}}</code> 是酒馆自带的变量（当前角色名）
          </p>

          <h4>多角色场景</h4>
          <p>如果你在群聊或多角色场景，可以指定角色名：</p>
          <div class="macro-guide-code-block">
            <code>&lt;多角色聊天记录&gt;<br>
            我和李四的聊天：{{最新消息_李四}}<br>
            我和张三的聊天：{{最新消息_张三}}<br>
            &lt;/多角色聊天记录&gt;</code>
          </div>
        </div>
      </div>

      <!-- 实际应用场景 -->
      <div class="macro-guide-section">
        <div class="macro-guide-section-title">
          <i class="fa-solid fa-star"></i>
          <span>实际应用场景</span>
        </div>
        <div class="macro-guide-section-content">
          <h4>线下线上联动</h4>
          <p>在手机里和角色约好明天见面，然后在酒馆对话时：</p>
          <div class="macro-guide-code-block">
            <code>&lt;背景&gt;<br>
            我们昨天在手机上聊了：{{最新消息}}<br>
            现在我们见面了，请继续剧情。<br>
            &lt;/背景&gt;</code>
          </div>

          <h4>多线程剧情</h4>
          <p>同时和多个角色聊天，让 AI 知道每个人的聊天进度：</p>
          <div class="macro-guide-code-block">
            <code>&lt;关系网&gt;<br>
            我和李四的关系：{{最新消息_李四}}<br>
            我和张三的关系：{{最新消息_张三}}<br>
            请根据这些背景继续对话。<br>
            &lt;/关系网&gt;</code>
          </div>

          <h4>剧情回顾</h4>
          <p>让 AI 总结之前的手机聊天内容：</p>
          <div class="macro-guide-code-block">
            <code>&lt;回顾&gt;<br>
            请总结我和角色的手机聊天记录：<br>
            {{历史消息}}<br>
            &lt;/回顾&gt;</code>
          </div>
        </div>
      </div>

      <!-- 注意事项 -->
      <div class="macro-guide-section">
        <div class="macro-guide-section-title">
          <i class="fa-solid fa-exclamation-triangle"></i>
          <span>注意事项</span>
        </div>
        <div class="macro-guide-section-content">
          <p class="macro-guide-warning">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>角色名必须匹配：</strong>使用 <code>{{最新消息_角色名}}</code> 时，"角色名"必须和手机联系人列表里的名字完全一致（包括空格、大小写）
          </p>

          <p class="macro-guide-warning">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>没有聊天记录时：</strong>如果手机里没有和该角色的聊天记录，宏变量会返回空白（不会报错）
          </p>

          <p class="macro-guide-note">
            <i class="fa-solid fa-circle-info"></i>
            <strong>实时更新：</strong>宏变量会实时读取最新的手机聊天记录，不需要手动刷新
          </p>

          <p class="macro-guide-note">
            <i class="fa-solid fa-circle-info"></i>
            <strong>Token 消耗：</strong>聊天记录会占用 AI 的 Token，建议只在需要时使用，避免每次对话都加载全部历史
          </p>
        </div>
      </div>

      <!-- 快速复制 -->
      <div class="macro-guide-section">
        <div class="macro-guide-section-title">
          <i class="fa-solid fa-copy"></i>
          <span>快速复制常用模板</span>
        </div>
        <div class="macro-guide-section-content">
          <h4>基础模板（世界书）</h4>
          <div class="macro-guide-copy-box">
            <div class="macro-guide-code-block">
              <code>&lt;线上消息&gt;<br>
              我和{{char}}的手机聊天记录：<br>
              {{最新消息}}<br>
              &lt;/线上消息&gt;</code>
            </div>
            <button class="macro-guide-copy-btn" data-copy="<线上消息>\n我和{{char}}的手机聊天记录：\n{{最新消息}}\n</线上消息>">
              <i class="fa-solid fa-copy"></i>
              <span>复制</span>
            </button>
          </div>

          <h4>多角色模板</h4>
          <div class="macro-guide-copy-box">
            <div class="macro-guide-code-block">
              <code>&lt;多角色聊天记录&gt;<br>
              我和李四的聊天：{{最新消息_李四}}<br>
              我和张三的聊天：{{最新消息_张三}}<br>
              &lt;/多角色聊天记录&gt;</code>
            </div>
            <button class="macro-guide-copy-btn" data-copy="<多角色聊天记录>\n我和李四的聊天：{{最新消息_李四}}\n我和张三的聊天：{{最新消息_张三}}\n</多角色聊天记录>">
              <i class="fa-solid fa-copy"></i>
              <span>复制</span>
            </button>
          </div>

          <h4>完整背景模板</h4>
          <div class="macro-guide-copy-box">
            <div class="macro-guide-code-block">
              <code>&lt;手机聊天记录&gt;<br>
              当前时间：{{当前时间}}<br>
              当前天气：{{当前天气}}<br>
              我和{{char}}的手机聊天：<br>
              {{最新消息}}<br>
              <br>
              根据最新消息，时间有推移，可能需要进行新剧情<br>
              &lt;/手机聊天记录&gt;</code>
            </div>
            <button class="macro-guide-copy-btn" data-copy="<手机聊天记录>\n当前时间：{{当前时间}}\n当前天气：{{当前天气}}\n我和{{char}}的手机聊天：\n{{最新消息}}\n\n根据最新消息，时间有推移，可能需要进行新剧情\n</手机聊天记录>">
              <i class="fa-solid fa-copy"></i>
              <span>复制</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  bindEvents(container);

  fragment.appendChild(container);

  logger.info('[MacroGuideDetail] 宏变量使用教程页渲染完成');
  return fragment;
}

/**
 * 绑定事件监听器
 * 
 * @private
 * @param {HTMLElement} container - 页面容器
 */
function bindEvents(container) {
  logger.debug('[MacroGuideDetail] 绑定事件');

  // 返回按钮
  const backBtn = container.querySelector('.macro-guide-detail-back-btn');
  backBtn.addEventListener('click', handleBack);

  // 复制按钮
  const copyBtns = container.querySelectorAll('.macro-guide-copy-btn');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const text = e.currentTarget.dataset.copy;
      handleCopy(text, e.currentTarget);
    });
  });
}

/**
 * 处理返回
 * @private
 */
function handleBack() {
  logger.info('[MacroGuideDetail] 点击返回');
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    import('../phone-main-ui.js').then(({ hidePage }) => {
      hidePage(overlayElement, 'macro-guide-detail');
    });
  }
}

/**
 * 处理复制
 * 
 * @private
 * @param {string} text - 要复制的文本
 * @param {HTMLElement} button - 复制按钮元素
 */
async function handleCopy(text, button) {
  try {
    await navigator.clipboard.writeText(text);

    // 显示成功反馈
    const icon = button.querySelector('i');
    const span = button.querySelector('span');
    const originalIconClass = icon.className;
    const originalText = span.textContent;

    icon.className = 'fa-solid fa-check';
    span.textContent = '已复制';
    button.classList.add('copied');

    setTimeout(() => {
      icon.className = originalIconClass;
      span.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);

    logger.info('[MacroGuideDetail] 复制成功');
  } catch (error) {
    logger.error('[MacroGuideDetail] 复制失败:', error);
  }
}
