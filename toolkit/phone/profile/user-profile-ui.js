/**
 * 用户个人主页界面
 * @module phone/profile/user-profile-ui
 */

import logger from '../../../logger.js';
import { saveData, loadData } from '../data-storage/storage-api.js';
import { getSystemBackgrounds, showBackgroundPicker } from '../utils/background-picker.js';
import { getWeather } from '../utils/weather-helper.js';
import { showInputPopup, showCustomPopup } from '../utils/popup-helper.js';
import { showSuccessToast, showWarningToast, showErrorToast, showInfoToast } from '../ui-components/toast-notification.js';
import { getUserAvatar as getSTUserAvatar, user_avatar } from '../../../../../../../scripts/personas.js';
import { getUserDisplayName } from '../utils/contact-display-helper.js';

/**
 * 渲染用户个人主页
 * 
 * @description
 * 显示用户自己的个人主页，包括头像、名字、个性签名、
 * 功能菜单列表（相册、收藏、钱包等）、底部按钮（设置、夜间、天气）。
 * 顶部背景图可点击更换。
 * 
 * @async
 * @returns {Promise<DocumentFragment>} 用户个人主页内容片段
 */
export async function renderUserProfile() {
  logger.debug('[UserProfile] 渲染用户个人主页');

  try {
    // 加载用户配置
    const userConfig = await loadUserConfig();

    const fragment = document.createDocumentFragment();

    // 创建完整页面容器
    const container = document.createElement('div');
    container.className = 'user-profile-page';

    // 1. 顶部背景区（带关闭按钮）
    container.appendChild(createHeaderBackground(userConfig));

    // 2. 功能菜单列表
    container.appendChild(createMenuList());

    // 3. 底部固定按钮组
    container.appendChild(await createFooterButtons(userConfig));

    fragment.appendChild(container);

    logger.info('[UserProfile] 用户个人主页渲染完成');
    return fragment;
  } catch (error) {
    logger.error('[UserProfile] 渲染用户个人主页失败:', error);
    return createErrorView();
  }
}

/**
 * 创建顶部背景区
 * 
 * @param {Object} userConfig - 用户配置对象
 * @returns {HTMLElement} 顶部背景容器
 */
function createHeaderBackground(userConfig) {
  const headerBg = document.createElement('div');
  headerBg.className = 'user-header-bg';

  // 从存储中获取背景图（如果有）
  const bgImage = userConfig.backgroundImage || '';
  if (bgImage) {
    headerBg.style.backgroundImage = `url("${bgImage}")`;
  }

  // 右上角关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'user-close-btn';
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleClose();
  });

  // 用户信息卡片
  const profileCard = createUserInfoCard(userConfig);

  headerBg.appendChild(closeBtn);
  headerBg.appendChild(profileCard);

  // 点击背景图区域（不是按钮和卡片）可以更换背景
  headerBg.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target.closest('button') && !target.closest('.user-profile-card')) {
      handleChangeBackground();
    }
  });

  return headerBg;
}

/**
 * 创建用户信息卡片
 * 
 * @param {Object} userConfig - 用户配置对象
 * @returns {HTMLElement} 用户信息卡片
 */
function createUserInfoCard(userConfig) {
  const card = document.createElement('div');
  card.className = 'user-profile-card';

  // 头像（从SillyTavern获取用户头像）
  const avatar = document.createElement('img');
  avatar.className = 'user-profile-avatar';
  avatar.src = getUserAvatar();
  avatar.alt = '用户头像';

  // 用户信息区
  const info = document.createElement('div');
  info.className = 'user-profile-info';

  // 用户名（使用统一工具函数）
  const name = document.createElement('div');
  name.className = 'user-profile-name';
  name.textContent = getUserDisplayName();

  // 个性签名（可点击编辑）
  const signature = document.createElement('div');
  signature.className = 'user-profile-signature';
  signature.textContent = userConfig.signature || '编辑个签，展示我的独特态度。';
  signature.dataset.signature = userConfig.signature || '';

  // 点击签名编辑
  signature.addEventListener('click', (e) => {
    e.stopPropagation();
    handleEditSignature();
  });

  info.appendChild(name);
  info.appendChild(signature);

  card.appendChild(avatar);
  card.appendChild(info);

  return card;
}

/**
 * 创建功能菜单列表
 * 
 * @returns {HTMLElement} 功能菜单容器
 */
function createMenuList() {
  const content = document.createElement('div');
  content.className = 'user-content';

  const menuList = document.createElement('div');
  menuList.className = 'user-menu-list';

  // 菜单项配置
  const menuItems = [
    { icon: 'fa-image', label: '相册', handler: null },  // 占位
    { icon: 'fa-bookmark', label: '收藏', handler: () => handleOpenFavorites() },  // 已实现
    { icon: 'fa-file', label: '文件', handler: null },  // 占位
    { icon: 'fa-wallet', label: '钱包', handler: () => handleOpenWallet() },  // 已实现
    { icon: 'fa-palette', label: '个性装扮', handler: null },  // 占位
    { icon: 'fa-circle-info', label: '说明+教程', handler: () => handleOpenHelpCenter() }  // 已实现
  ];

  menuItems.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.className = 'user-menu-item';

    menuItem.innerHTML = `
            <i class="fa-solid ${item.icon}"></i>
            <span>${item.label}</span>
            <i class="fa-solid fa-chevron-right"></i>
        `;

    // 绑定点击事件（如果有handler）
    if (item.handler) {
      menuItem.addEventListener('click', item.handler);
    }

    menuList.appendChild(menuItem);
  });

  content.appendChild(menuList);
  return content;
}

/**
 * 创建底部固定按钮组
 * 
 * @async
 * @param {Object} userConfig - 用户配置对象
 * @returns {Promise<HTMLElement>} 底部按钮组容器
 */
async function createFooterButtons(userConfig) {
  const footer = document.createElement('div');
  footer.className = 'user-footer';

  // 设置按钮（跳转到设置页）
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'user-footer-btn';
  settingsBtn.innerHTML = `
        <i class="fa-solid fa-gear"></i>
        <span>设置</span>
    `;
  settingsBtn.addEventListener('click', () => {
    handleOpenSettings();
  });

  // 夜间按钮（占位）
  const nightBtn = document.createElement('button');
  nightBtn.className = 'user-footer-btn';
  nightBtn.innerHTML = `
        <i class="fa-solid fa-moon"></i>
        <span>夜间</span>
    `;

  // 天气按钮
  const weatherBtn = document.createElement('button');
  weatherBtn.className = 'user-footer-btn';

  // 从配置读取天气数据，如果没有则显示默认
  const weatherTemp = userConfig.weatherTemp || '--';
  const weatherCity = userConfig.weatherCity || '未设置';
  const weatherIcon = userConfig.weatherIcon || 'cloud-sun';

  weatherBtn.innerHTML = `
        <i class="fa-solid fa-${weatherIcon}"></i>
        <span>${weatherTemp}° ${weatherCity}</span>
    `;

  // 添加点击事件
  weatherBtn.addEventListener('click', () => {
    handleWeatherClick();
  });

  footer.appendChild(settingsBtn);
  footer.appendChild(nightBtn);
  footer.appendChild(weatherBtn);

  return footer;
}

/**
 * 处理关闭按钮点击
 * 
 * @async
 */
async function handleClose() {
  logger.debug('[UserProfile] 关闭用户个人主页');

  // 触发返回主页
  const phoneOverlay = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
  if (phoneOverlay) {
    const { hidePage } = await import('../phone-main-ui.js');
    if (hidePage) {
      hidePage(phoneOverlay, 'user-profile');
    }
  }
}

/**
 * 处理编辑个性签名
 * 
 * @async
 */
async function handleEditSignature() {
  logger.debug('[UserProfile] 编辑个性签名');

  try {
    // 获取当前签名
    const userConfig = await loadUserConfig();
    const currentSignature = userConfig.signature || '';

    // 弹出输入框（使用自定义弹窗）
    const result = await showInputPopup(
      '编辑个性签名',
      currentSignature,
      {
        multiline: true,
        placeholder: '写下你的个性签名...',
        okButton: '确定',
        cancelButton: '取消'
      }
    );

    // 用户取消或未修改
    if (result === null || result === currentSignature) {
      return;
    }

    const newSignature = result;

    // 保存新签名
    userConfig.signature = newSignature;
    await saveUserConfig(userConfig);

    // 局部更新DOM
    updateSignatureDisplay(newSignature);

    logger.info('[UserProfile] 个性签名已更新:', newSignature);
  } catch (error) {
    logger.error('[UserProfile] 编辑个性签名失败:', error);
  }
}

/**
 * 局部更新签名显示
 * 
 * @param {string} newSignature - 新签名
 */
function updateSignatureDisplay(newSignature) {
  const signatureElement = /** @type {HTMLElement} */ (document.querySelector('.user-profile-signature'));
  if (signatureElement) {
    signatureElement.textContent = newSignature || '编辑个签，展示我的独特态度。';
    signatureElement.dataset.signature = newSignature || '';
  }
}

/**
 * 处理更换背景图
 * 
 * @async
 */
async function handleChangeBackground() {
  logger.debug('[UserProfile] 更换背景图');

  try {
    // 获取系统背景列表
    const backgrounds = await getSystemBackgrounds();

    if (backgrounds.length === 0) {
      logger.warn('[UserProfile] 没有可用的背景图');
      return;
    }

    // 显示背景选择器弹窗
    const selectedBg = await showBackgroundPicker(backgrounds);

    if (!selectedBg) {
      return;
    }

    // 保存背景图
    const userConfig = await loadUserConfig();
    userConfig.backgroundImage = selectedBg;
    await saveUserConfig(userConfig);

    // 局部更新DOM
    updateBackgroundDisplay(selectedBg);

    logger.info('[UserProfile] 背景图已更换:', selectedBg);
  } catch (error) {
    logger.error('[UserProfile] 更换背景图失败:', error);
  }
}

/**
 * 局部更新背景图显示
 * 
 * @param {string} bgUrl - 背景图URL
 */
function updateBackgroundDisplay(bgUrl) {
  const headerBg = /** @type {HTMLElement} */ (document.querySelector('.user-header-bg'));
  if (headerBg) {
    headerBg.style.backgroundImage = `url("${bgUrl}")`;
  }
}


/**
 * 打开设置页
 * 
 * @description
 * 直接调用 showPage 显示用户设置页（不用自定义事件，避免重复触发）
 * 
 * @async
 */
async function handleOpenSettings() {
  logger.debug('[UserProfile] 打开设置页');

  // 直接调用 showPage（不用自定义事件）
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'user-settings');
  }

  logger.info('[UserProfile] 已打开设置页');
}

/**
 * 处理打开钱包页面
 * 
 * @description
 * 直接调用 showPage 显示钱包页面（不用自定义事件）
 * 
 * @async
 */
async function handleOpenWallet() {
  logger.debug('[UserProfile] 打开钱包页');

  // 直接调用 showPage（不用自定义事件）
  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'user-wallet');
  }

  logger.info('[UserProfile] 已打开钱包页');
}

/**
 * 处理天气按钮点击
 * 
 * @description
 * 显示天气设置弹窗，支持两种模式：
 * 1. 自定义模式（默认）- 手动输入城市、温度、选择图标
 * 2. 在线获取模式 - 输入城市名，调用API获取天气
 * 
 * @async
 */
async function handleWeatherClick() {
  logger.debug('[UserProfile] 点击天气按钮');

  try {
    // 加载当前配置
    const userConfig = await loadUserConfig();

    // 创建天气设置弹窗
    const weatherData = await showWeatherSettingsPopup(userConfig);

    // 用户取消
    if (!weatherData) {
      return;
    }

    // 保存配置
    userConfig.weatherCity = weatherData.city;
    userConfig.weatherTemp = weatherData.temp;
    userConfig.weatherIcon = weatherData.icon;
    userConfig.lastWeatherUpdate = Date.now();

    await saveUserConfig(userConfig);

    // 局部更新按钮显示
    updateWeatherDisplay(weatherData);

    showSuccessToast(`天气已更新：${weatherData.temp}° ${weatherData.city}`);
    logger.info('[UserProfile] 天气更新成功:', weatherData);

  } catch (error) {
    showErrorToast(`设置天气失败：${error.message}`);
    logger.error('[UserProfile.handleWeatherClick] 设置天气失败:', error);
  }
}

/**
 * 显示天气设置弹窗
 * 
 * @description
 * 自定义弹窗，支持两种模式：
 * - 自定义模式（默认）：手动输入城市、温度、选择图标
 * - 在线获取模式：调用wttr.in API获取真实天气
 * 
 * 点击"保存"时会自动等待正在进行的获取请求，无需手动等待。
 * 
 * @async
 * @param {Object} userConfig - 用户配置对象
 * @returns {Promise<Object|null>} 天气数据 {city, temp, icon} 或null（取消）
 */
async function showWeatherSettingsPopup(userConfig) {
  logger.debug('[UserProfile.showWeatherSettingsPopup] 显示天气设置弹窗');

  // 天气图标列表（Font Awesome）
  const weatherIcons = [
    { name: 'sun', label: '晴天', icon: '☀️' },
    { name: 'cloud-sun', label: '多云', icon: '🌤️' },
    { name: 'cloud', label: '阴天', icon: '☁️' },
    { name: 'cloud-rain', label: '雨天', icon: '🌧️' },
    { name: 'cloud-showers-heavy', label: '大雨', icon: '⛈️' },
    { name: 'cloud-bolt', label: '雷暴', icon: '⚡' },
    { name: 'snowflake', label: '下雪', icon: '❄️' },
    { name: 'smog', label: '雾霾', icon: '🌫️' }
  ];

  // 当前值
  const currentCity = userConfig.weatherCity || '';
  const currentTemp = userConfig.weatherTemp || '';
  const currentIcon = userConfig.weatherIcon || 'cloud-sun';

  // 创建弹窗内容
  const contentHTML = `
    <div class="weather-settings-popup">
      <!-- 模式切换 -->
      <div class="weather-mode-select">
        <label>设置方式：</label>
        <select id="weather-mode-selector" class="phone-input">
          <option value="custom" selected>自定义天气</option>
          <option value="online">在线获取</option>
        </select>
      </div>

      <!-- 自定义模式 -->
      <div id="weather-custom-mode" class="weather-mode-panel">
        <div class="weather-input-group">
          <label>城市名：</label>
          <input type="text" id="weather-custom-city" class="phone-input" 
                 placeholder="例如：北京" value="${currentCity}" maxlength="20">
        </div>
        <div class="weather-input-group">
          <label>温度：</label>
          <input type="number" id="weather-custom-temp" class="phone-input" 
                 placeholder="29" value="${currentTemp}" min="-50" max="60">
          <span class="weather-unit">°C</span>
        </div>
        <div class="weather-input-group">
          <label>天气图标：</label>
          <div class="weather-icon-grid" id="weather-icon-grid">
            ${weatherIcons.map((item) => `
              <div class="weather-icon-item ${item.name === currentIcon ? 'selected' : ''}" 
                   data-icon="${item.name}" title="${item.label}">
                <span class="weather-icon-emoji">${item.icon}</span>
                <i class="fa-solid fa-${item.name}"></i>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 在线获取模式 -->
      <div id="weather-online-mode" class="weather-mode-panel" style="display: none;">
        <div class="weather-input-group">
          <label>城市名：</label>
          <input type="text" id="weather-online-city" class="phone-input" 
                 placeholder="例如：北京、上海、广州" value="${currentCity}" maxlength="20">
        </div>
        <button id="weather-fetch-btn" class="phone-btn-primary">
          <i class="fa-solid fa-cloud-arrow-down"></i> 获取天气
        </button>
        <div id="weather-fetch-result" class="weather-fetch-result"></div>
        <p class="weather-hint">
          <i class="fa-solid fa-circle-info"></i> 
          提示：获取不稳定，如失败请过一会重试
        </p>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    let selectedIcon = currentIcon;
    let fetchedWeather = null;
    let fetchingPromise = null; // 保存正在进行的获取Promise

    // 声明变量（在Promise外部）
    let modeSelector = null;
    let customCityInput = null;
    let customTempInput = null;

    // 显示自定义弹窗
    showCustomPopup('设置天气', contentHTML, {
      buttons: [
        { text: '取消', value: 'cancel', class: 'phone-popup-cancel' },
        { text: '保存', value: 'save', class: 'phone-popup-ok' }
      ],
      width: '400px'
    }).then(async (result) => {
      if (result === 'save') {
        // 保存设置
        const mode = /** @type {HTMLSelectElement} */ (modeSelector)?.value || 'custom';

        if (mode === 'custom') {
          // 自定义模式
          const city = /** @type {HTMLInputElement} */ (customCityInput)?.value?.trim() || '';
          const temp = /** @type {HTMLInputElement} */ (customTempInput)?.value?.trim() || '';

          if (!city || !temp) {
            showWarningToast('请填写完整信息');
            resolve(null);
            return;
          }

          resolve({
            city: city,
            temp: temp,
            icon: selectedIcon
          });
        } else {
          // 在线获取模式
          // 如果正在获取中，等待完成
          if (fetchingPromise) {
            showInfoToast('等待获取结果...');
            try {
              await fetchingPromise;

              // 获取完成，检查结果
              if (fetchedWeather) {
                resolve(fetchedWeather);
              } else {
                showWarningToast('获取失败，请重试');
                resolve(null);
              }
            } catch (error) {
              showErrorToast('获取失败，请重试');
              resolve(null);
            }
          } else if (fetchedWeather) {
            // 已有获取结果
            resolve(fetchedWeather);
          } else {
            // 未获取也未输入，提示用户
            showWarningToast('请先获取天气');
            resolve(null);
          }
        }
      } else {
        // 取消
        resolve(null);
      }
    });

    // 获取元素（延迟获取，等待DOM创建）
    setTimeout(() => {
      modeSelector = document.getElementById('weather-mode-selector');
      const customMode = document.getElementById('weather-custom-mode');
      const onlineMode = document.getElementById('weather-online-mode');
      customCityInput = document.getElementById('weather-custom-city');
      customTempInput = document.getElementById('weather-custom-temp');
      const onlineCityInput = document.getElementById('weather-online-city');
      const fetchBtn = document.getElementById('weather-fetch-btn');
      const fetchResult = document.getElementById('weather-fetch-result');
      const iconGrid = document.getElementById('weather-icon-grid');

      // 模式切换事件
      modeSelector?.addEventListener('change', () => {
        const mode = /** @type {HTMLSelectElement} */ (modeSelector).value;
        if (mode === 'custom') {
          customMode.style.display = 'block';
          onlineMode.style.display = 'none';
        } else {
          customMode.style.display = 'none';
          onlineMode.style.display = 'block';
        }
      });

      // 图标选择事件
      iconGrid?.querySelectorAll('.weather-icon-item').forEach((item) => {
        item.addEventListener('click', () => {
          // 取消所有选中
          iconGrid.querySelectorAll('.weather-icon-item').forEach((i) => {
            i.classList.remove('selected');
          });
          // 选中当前
          item.classList.add('selected');
          selectedIcon = /** @type {HTMLElement} */ (item).dataset.icon || 'cloud-sun';
        });
      });

      // 获取天气按钮
      fetchBtn?.addEventListener('click', () => {
        const city = /** @type {HTMLInputElement} */ (onlineCityInput)?.value?.trim();
        if (!city) {
          showWarningToast('请输入城市名');
          return;
        }

        // 创建获取Promise并保存
        fetchingPromise = (async () => {
          try {
            /** @type {HTMLButtonElement} */ (fetchBtn).disabled = true;
            fetchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 获取中...';
            fetchResult.innerHTML = '';

            const weather = await getWeather(city);

            fetchedWeather = weather;
            fetchResult.innerHTML = `
              <div class="weather-fetch-success">
                <i class="fa-solid fa-${weather.icon}"></i>
                <span>${weather.temp}° ${weather.city} - ${weather.weather}</span>
              </div>
            `;

            showSuccessToast('获取成功！');
          } catch (error) {
            fetchedWeather = null;
            fetchResult.innerHTML = `
              <div class="weather-fetch-error">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>获取失败：${error.message}</span>
              </div>
            `;
            showErrorToast('获取失败，请稍后重试');
            throw error; // 重新抛出，让等待的地方能捕获
          } finally {
            /** @type {HTMLButtonElement} */ (fetchBtn).disabled = false;
            fetchBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> 获取天气';
            fetchingPromise = null; // 完成后清空
          }
        })();
      });
    }, 100);
  });
}

/**
 * 局部更新天气按钮显示
 * 
 * @param {Object} weather - 天气数据
 * @param {string} weather.temp - 温度
 * @param {string} weather.city - 城市名
 * @param {string} weather.icon - 天气图标名
 */
function updateWeatherDisplay(weather) {
  const weatherBtn = /** @type {HTMLElement} */ (document.querySelector('.user-footer .user-footer-btn:last-child'));
  if (weatherBtn) {
    weatherBtn.innerHTML = `
      <i class="fa-solid fa-${weather.icon}"></i>
      <span>${weather.temp}° ${weather.city}</span>
    `;
  }
}

/**
 * 创建错误视图
 * 
 * @returns {DocumentFragment} 错误视图片段
 */
function createErrorView() {
  const fragment = document.createDocumentFragment();
  const error = document.createElement('div');
  error.className = 'user-profile-error';
  error.textContent = '加载失败，请稍后重试';
  fragment.appendChild(error);
  return fragment;
}

/**
 * 加载用户配置
 * 
 * @async
 * @returns {Promise<Object>} 用户配置对象
 */
async function loadUserConfig() {
  try {
    const config = await loadData('userProfile');
    return config || {
      signature: '',
      backgroundImage: '',
      weatherCity: '',
      weatherTemp: '',
      weatherIcon: 'cloud-sun',
      lastWeatherUpdate: null
    };
  } catch (error) {
    logger.error('[UserProfile] 加载用户配置失败:', error);
    return {
      signature: '',
      backgroundImage: '',
      weatherCity: '',
      weatherTemp: '',
      weatherIcon: 'cloud-sun',
      lastWeatherUpdate: null
    };
  }
}

/**
 * 保存用户配置
 * 
 * @async
 * @param {Object} config - 用户配置对象
 */
async function saveUserConfig(config) {
  try {
    await saveData('userProfile', config);
    logger.debug('[UserProfile] 用户配置已保存');
  } catch (error) {
    logger.error('[UserProfile] 保存用户配置失败:', error);
    throw error;
  }
}

/**
 * 获取用户头像
 * 
 * @description
 * 从 SillyTavern 的 personas.js 获取当前用户头像路径
 * 
 * @returns {string} 用户头像URL
 */
function getUserAvatar() {
  return getSTUserAvatar(user_avatar);
}

/**
 * 处理打开收藏列表
 * 
 * @async
 */
async function handleOpenFavorites() {
  logger.info('[UserProfile] 打开收藏列表');

  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'favorites-list');
  }
}

/**
 * 处理打开帮助中心
 * 
 * @async
 */
async function handleOpenHelpCenter() {
  logger.info('[UserProfile] 打开帮助中心');

  const overlayElement = document.querySelector('.phone-overlay');
  if (overlayElement) {
    const { showPage } = await import('../phone-main-ui.js');
    await showPage(overlayElement, 'help-center');
  }
}

