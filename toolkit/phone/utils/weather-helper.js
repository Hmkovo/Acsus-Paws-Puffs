/**
 * 天气工具模块
 * @module phone/utils/weather-helper
 * 
 * @description
 * 使用 wttr.in 免费天气API获取城市天气信息，无需API key。
 * 支持中文城市名，返回温度、天气描述和图标。
 */

import logger from '../../../logger.js';

/**
 * 获取城市天气（使用 wttr.in，无需API key）
 * 
 * @async
 * @param {string} city - 城市名（支持中文，如"北京"、"东城"、"上海"）
 * @returns {Promise<Object>} 天气数据 { temp: "29", weather: "晴", icon: "sun", city: "北京" }
 * @throws {Error} 网络错误或城市不存在时
 * @example
 * const weather = await getWeather('北京');
 * console.log(weather); // { temp: "29", weather: "晴", icon: "sun", city: "北京" }
 */
export async function getWeather(city) {
  if (!city || typeof city !== 'string') {
    throw new Error('城市名不能为空');
  }

  try {
    logger.debug('phone','[WeatherHelper.getWeather] 获取天气:', city);

    // wttr.in API: 返回JSON格式天气数据
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }

    const data = await response.json();

    // 检查是否有有效数据
    if (!data.current_condition || data.current_condition.length === 0) {
      throw new Error('无法获取天气数据，请检查城市名是否正确');
    }

    const current = data.current_condition[0];

    const weatherData = {
      temp: current.temp_C,
      weather: translateWeather(current.weatherDesc[0].value),
      icon: getWeatherIcon(current.weatherCode),
      city: city
    };

    logger.info('phone','[WeatherHelper.getWeather] 天气获取成功:', weatherData);
    return weatherData;

  } catch (error) {
    logger.error('phone','[WeatherHelper.getWeather] 获取天气失败:', error);
    throw new Error(`无法获取天气: ${error.message}`);
  }
}

/**
 * 翻译天气描述为中文
 * 
 * @param {string} desc - 英文天气描述（如 "Sunny", "Partly cloudy"）
 * @returns {string} 中文天气描述（如 "晴", "多云"）
 */
function translateWeather(desc) {
  const weatherMap = {
    // 晴天
    'Sunny': '晴',
    'Clear': '晴',

    // 云
    'Partly cloudy': '多云',
    'Cloudy': '阴',
    'Overcast': '阴',

    // 雨
    'Patchy rain possible': '可能有雨',
    'Light rain': '小雨',
    'Light rain shower': '小阵雨',
    'Moderate rain': '中雨',
    'Moderate or heavy rain shower': '中到大阵雨',
    'Heavy rain': '大雨',
    'Torrential rain shower': '暴雨',

    // 雪
    'Patchy snow possible': '可能有雪',
    'Light snow': '小雪',
    'Moderate snow': '中雪',
    'Heavy snow': '大雪',
    'Blizzard': '暴雪',

    // 雷暴
    'Thundery outbreaks possible': '可能有雷',
    'Patchy light rain with thunder': '雷阵雨',
    'Moderate or heavy rain with thunder': '强雷阵雨',

    // 雾霾
    'Mist': '薄雾',
    'Fog': '雾',
    'Freezing fog': '冻雾',

    // 其他
    'Blowing snow': '风雪',
    'Ice pellets': '冰粒',
    'Freezing drizzle': '冻毛毛雨'
  };

  return weatherMap[desc] || desc;
}

/**
 * 根据天气代码返回 Font Awesome 图标名称
 * 
 * @param {string} code - wttr.in 天气代码
 * @returns {string} Font Awesome 图标名（如 "sun", "cloud-rain"）
 */
function getWeatherIcon(code) {
  // wttr.in 天气代码映射到 Font Awesome 图标
  // 参考：https://www.worldweatheronline.com/developer/api/docs/weather-icons.aspx
  const iconMap = {
    // 晴天
    '113': 'sun',                  // Sunny

    // 多云
    '116': 'cloud-sun',            // Partly cloudy
    '119': 'cloud',                // Cloudy
    '122': 'cloud',                // Overcast

    // 雨
    '176': 'cloud-sun-rain',       // Patchy rain possible
    '263': 'cloud-rain',           // Patchy light drizzle
    '266': 'cloud-rain',           // Light drizzle
    '281': 'cloud-showers-heavy',  // Freezing drizzle
    '284': 'cloud-showers-heavy',  // Heavy freezing drizzle
    '293': 'cloud-rain',           // Patchy light rain
    '296': 'cloud-rain',           // Light rain
    '299': 'cloud-showers-heavy',  // Moderate rain at times
    '302': 'cloud-showers-heavy',  // Moderate rain
    '305': 'cloud-showers-heavy',  // Heavy rain at times
    '308': 'cloud-showers-heavy',  // Heavy rain
    '311': 'cloud-showers-heavy',  // Light freezing rain
    '314': 'cloud-showers-heavy',  // Moderate or heavy freezing rain
    '317': 'snowflake',            // Light sleet
    '320': 'snowflake',            // Moderate or heavy sleet
    '353': 'cloud-rain',           // Light rain shower
    '356': 'cloud-showers-heavy',  // Moderate or heavy rain shower
    '359': 'cloud-showers-heavy',  // Torrential rain shower

    // 雪
    '179': 'snowflake',            // Patchy snow possible
    '227': 'snowflake',            // Blowing snow
    '230': 'snowflake',            // Blizzard
    '323': 'snowflake',            // Patchy light snow
    '326': 'snowflake',            // Light snow
    '329': 'snowflake',            // Patchy moderate snow
    '332': 'snowflake',            // Moderate snow
    '335': 'snowflake',            // Patchy heavy snow
    '338': 'snowflake',            // Heavy snow
    '368': 'snowflake',            // Light snow showers
    '371': 'snowflake',            // Moderate or heavy snow showers
    '374': 'snowflake',            // Light showers of ice pellets
    '377': 'snowflake',            // Moderate or heavy showers of ice pellets

    // 雷暴
    '386': 'cloud-bolt',           // Patchy light rain with thunder
    '389': 'cloud-bolt',           // Moderate or heavy rain with thunder
    '392': 'cloud-bolt',           // Patchy light snow with thunder
    '395': 'cloud-bolt',           // Moderate or heavy snow with thunder

    // 雾
    '143': 'smog',                 // Mist
    '248': 'smog',                 // Fog
    '260': 'smog'                  // Freezing fog
  };

  return iconMap[code] || 'cloud-sun'; // 默认返回多云图标
}

