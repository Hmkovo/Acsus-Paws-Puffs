/**
 * 装扮配置文件
 * 
 * @description
 * 定义所有预设装扮（气泡、头像框、主题）的配置
 * 使用分类系统组织气泡样式
 * 用户上传的装扮存储在 extension_settings 中
 * 
 * @file customization-config.js
 */

/**
 * 气泡分类配置
 * 
 * @description
 * - id: 分类唯一标识
 * - name: 分类显示名称
 * - order: 排序权重（数字越小越靠前，custom 固定为0）
 * - bubbles: 该分类下的气泡列表
 * 
 * @type {Object<string, {id: string, name: string, order: number, bubbles: Array}>}
 */
export const BUBBLE_CATEGORIES = {
  // 自定义分类（固定在顶部，不参与随机排序）
  custom: {
    id: 'custom',
    name: '自定义',
    order: 0,
    bubbles: [] // 用户自定义气泡，从 extension_settings 加载
  },
  
  // 简约风格（纯色、简洁、圆角）
  minimal: {
    id: 'minimal',
    name: '简约',
    order: 1,
    bubbles: [
      {
        id: 'bubble-minimal-gray-1',
        name: '浅灰',
        price: 3,
        type: 'pure',
        css: {
          background: '#f0f0f0',
          color: '#333333',
          borderRadius: '16px',
          border: '1px solid #e0e0e0',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-minimal-white-1',
        name: '纯白',
        price: 3,
        type: 'pure',
        css: {
          background: '#ffffff',
          color: '#333333',
          borderRadius: '18px',
          border: '1px solid #d0d0d0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-minimal-beige-1',
        name: '米色',
        price: 3,
        type: 'pure',
        css: {
          background: '#f5f5dc',
          color: '#5a5a4d',
          borderRadius: '16px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-minimal-gray-2',
        name: '深灰',
        price: 3,
        type: 'pure',
        css: {
          background: '#e8e8e8',
          color: '#444444',
          borderRadius: '20px',
          border: '1px solid #d0d0d0',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-minimal-blue-soft',
        name: '淡蓝',
        price: 3,
        type: 'pure',
        css: {
          background: '#e8f4f8',
          color: '#2c5f7d',
          borderRadius: '16px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-minimal-pink-soft',
        name: '淡粉',
        price: 3,
        type: 'pure',
        css: {
          background: '#ffe8f0',
          color: '#8b3a5a',
          borderRadius: '18px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-minimal-green-soft',
        name: '淡绿',
        price: 3,
        type: 'pure',
        css: {
          background: '#e8f5e9',
          color: '#2e7d32',
          borderRadius: '16px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-minimal-cream',
        name: '奶油',
        price: 3,
        type: 'pure',
        css: {
          background: '#fffbf0',
          color: '#6b5d4f',
          borderRadius: '18px',
          border: '1px solid #f0e8d8',
          padding: '0.625em 0.75em'
        }
      }
    ]
  },
  
  // 黑色系（深色背景、白色文字）
  black: {
    id: 'black',
    name: '黑色系',
    order: 2,
    bubbles: [
      {
        id: 'bubble-black-pure',
        name: '纯黑',
        price: 3,
        type: 'pure',
        css: {
          background: '#000000',
          color: '#ffffff',
          borderRadius: '18px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-black-soft',
        name: '柔黑',
        price: 3,
        type: 'pure',
        css: {
          background: '#1a1a1a',
          color: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-black-charcoal',
        name: '炭黑',
        price: 3,
        type: 'pure',
        css: {
          background: '#2d2d2d',
          color: '#f0f0f0',
          borderRadius: '20px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-black-navy',
        name: '海军黑',
        price: 3,
        type: 'pure',
        css: {
          background: '#0a1929',
          color: '#ffffff',
          borderRadius: '18px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-black-rounded',
        name: '圆润黑',
        price: 3,
        type: 'pure',
        css: {
          background: '#1c1c1c',
          color: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-black-border',
        name: '描边黑',
        price: 3,
        type: 'pure',
        css: {
          background: '#000000',
          color: '#ffffff',
          borderRadius: '16px',
          border: '2px solid #333333',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-black-gray-mix',
        name: '黑灰',
        price: 3,
        type: 'pure',
        css: {
          background: '#424242',
          color: '#ffffff',
          borderRadius: '18px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-black-matte',
        name: '哑光黑',
        price: 3,
        type: 'pure',
        css: {
          background: '#212121',
          color: '#e0e0e0',
          borderRadius: '16px',
          padding: '0.625em 0.75em'
        }
      }
    ]
  },
  
  // 蓝色系（各种蓝色渐变和纯色）
  blue: {
    id: 'blue',
    name: '蓝色系',
    order: 3,
    bubbles: [
      {
        id: 'bubble-blue-sky',
        name: '天空蓝',
        price: 3,
        type: 'pure',
        css: {
          background: '#87ceeb',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 6px rgba(135,206,235,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-ocean',
        name: '海洋蓝',
        price: 3,
        type: 'pure',
        css: {
          background: '#006994',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-gradient-1',
        name: '蓝色渐变',
        price: 3,
        type: 'pure',
        css: {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 8px rgba(102,126,234,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-royal',
        name: '宝石蓝',
        price: 3,
        type: 'pure',
        css: {
          background: '#4169e1',
          color: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 2px 6px rgba(65,105,225,0.4)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-cyan',
        name: '青色',
        price: 3,
        type: 'pure',
        css: {
          background: '#00bcd4',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-navy-gradient',
        name: '深蓝渐变',
        price: 3,
        type: 'pure',
        css: {
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          color: '#ffffff',
          borderRadius: '18px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-light-gradient',
        name: '浅蓝渐变',
        price: 3,
        type: 'pure',
        css: {
          background: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 8px rgba(102,166,255,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-teal',
        name: '蓝绿',
        price: 3,
        type: 'pure',
        css: {
          background: '#008b8b',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-blue-steel',
        name: '钢蓝',
        price: 3,
        type: 'pure',
        css: {
          background: '#4682b4',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 6px rgba(70,130,180,0.3)',
          padding: '0.625em 0.75em'
        }
      }
    ]
  },
  
  // 白色系（浅色、边框、优雅）
  white: {
    id: 'white',
    name: '白色系',
    order: 4,
    bubbles: [
      {
        id: 'bubble-white-pure',
        name: '纯白',
        price: 3,
        type: 'pure',
        css: {
          background: '#ffffff',
          color: '#333333',
          borderRadius: '18px',
          border: '1px solid #e0e0e0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-white-snow',
        name: '雪白',
        price: 3,
        type: 'pure',
        css: {
          background: '#fffafa',
          color: '#333333',
          borderRadius: '16px',
          border: '1px solid #f0e8e8',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-white-ivory',
        name: '象牙白',
        price: 3,
        type: 'pure',
        css: {
          background: '#fffff0',
          color: '#5a5a4d',
          borderRadius: '18px',
          border: '1px solid #f0f0d8',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-white-ghost',
        name: '幽灵白',
        price: 3,
        type: 'pure',
        css: {
          background: '#f8f8ff',
          color: '#333333',
          borderRadius: '16px',
          border: '1px solid #e8e8f0',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-white-floral',
        name: '花白',
        price: 3,
        type: 'pure',
        css: {
          background: '#fffaf0',
          color: '#5a5a4d',
          borderRadius: '18px',
          border: '1px solid #f0e8d8',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-white-smoke',
        name: '烟白',
        price: 3,
        type: 'pure',
        css: {
          background: '#f5f5f5',
          color: '#333333',
          borderRadius: '16px',
          border: '1px solid #e0e0e0',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-white-linen',
        name: '亚麻白',
        price: 3,
        type: 'pure',
        css: {
          background: '#faf0e6',
          color: '#5a5a4d',
          borderRadius: '18px',
          border: '1px solid #e8d8c8',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-white-pearl',
        name: '珍珠白',
        price: 3,
        type: 'pure',
        css: {
          background: '#f0f0f0',
          color: '#333333',
          borderRadius: '20px',
          border: '1px solid #d8d8d8',
          boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
          padding: '0.625em 0.75em'
        }
      }
    ]
  },
  
  // 多彩系（彩虹、渐变、鲜艳）
  colorful: {
    id: 'colorful',
    name: '多彩',
    order: 5,
    bubbles: [
      {
        id: 'bubble-colorful-pink',
        name: '粉色',
        price: 3,
        type: 'pure',
        css: {
          background: '#ff69b4',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 6px rgba(255,105,180,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-colorful-red',
        name: '红色',
        price: 3,
        type: 'pure',
        css: {
          background: '#dc143c',
          color: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 2px 6px rgba(220,20,60,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-colorful-orange',
        name: '橙色',
        price: 3,
        type: 'pure',
        css: {
          background: '#ff8c00',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 6px rgba(255,140,0,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-colorful-green',
        name: '翠绿',
        price: 3,
        type: 'pure',
        css: {
          background: '#32cd32',
          color: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 2px 6px rgba(50,205,50,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-colorful-purple',
        name: '紫色',
        price: 3,
        type: 'pure',
        css: {
          background: '#9370db',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 6px rgba(147,112,219,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-colorful-sunset',
        name: '日落渐变',
        price: 3,
        type: 'pure',
        css: {
          background: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 8px rgba(255,107,107,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-colorful-rainbow',
        name: '彩虹渐变',
        price: 3,
        type: 'pure',
        css: {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
          color: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 2px 8px rgba(102,126,234,0.3)',
          padding: '0.625em 0.75em'
        }
      },
      {
        id: 'bubble-colorful-mint',
        name: '薄荷绿',
        price: 3,
        type: 'pure',
        css: {
          background: '#98d8c8',
          color: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 2px 6px rgba(152,216,200,0.3)',
          padding: '0.625em 0.75em'
        }
      }
    ]
  }
};

/**
 * 预设头像框装扮列表（暂未实现）
 * @type {Array}
 */
export const PRESET_AVATAR_FRAMES = [];

/**
 * 预设主题装扮列表（暂未实现）
 * @type {Array}
 */
export const PRESET_THEMES = [];
