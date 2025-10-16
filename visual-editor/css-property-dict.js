/**
 * @file 可视化编辑器 - CSS属性词典
 * @description
 * 核心数据源：包含所有CSS属性的详细元信息，支持新手模式和专家模式。
 * 
 * 主要数据结构：
 * - cssPropertyDictionary：属性详细信息（控件类型、默认值等）
 * - valueMap：值的中文英文映射（单位、关键字、方向等）
 * - cssPanels：属性面板分类
 * 
 * 支持的控件类型（22个）：
 * - 基础控件：color, shadow, border, border-radius, spacing, size, position, flex, transform, filter, font
 * - 特殊控件：decoration-sticker, icon-replacer, background-image, gradient, transition, border-image
 * 
 * @module visual-editor/css-property-dict
 * @requires 无
 * 
 * Grep标记：[DICT] [MAP] [FUNC] [EXPORT]
 */

// [DICT] CSS属性词典（核心数据结构！）
export const cssPropertyDictionary = {
  // ==================== 颜色控件（ColorControl）====================
  'background-color': {
    中文名: '背景颜色',
    CSS属性: 'background-color',
    控件类型: 'color',
    支持多层: false,
    支持渐变: true,
    默认值: 'transparent',
    所属面板: '背景与颜色',
    描述: '设置元素的背景颜色（支持纯色、渐变、图案）',
    示例值: '#FFC0CB 或 rgba(255,192,203,0.5)'
  },
  'color': {
    中文名: '文字颜色',
    CSS属性: 'color',
    控件类型: 'color',
    支持多层: false,
    支持渐变: true,
    默认值: 'inherit',
    所属面板: '文字与字体',
    描述: '设置文字的颜色',
    示例值: '#333 或 rgb(51,51,51)'
  },
  'border-color': {
    中文名: '边框颜色',
    CSS属性: 'border-color',
    控件类型: 'color',
    支持多层: false,
    支持渐变: false,
    默认值: 'currentColor',
    所属面板: '边框',
    描述: '设置边框的颜色',
    示例值: '#000'
  },
  'background': {
    中文名: '背景',
    CSS属性: 'background',
    控件类型: 'color',
    支持多层: true,
    支持渐变: true,
    默认值: 'none',
    所属面板: '背景与颜色',
    描述: '设置背景（支持多层背景、渐变）',
    示例值: 'linear-gradient(to bottom, #fff, #000)'
  },

  // ==================== 阴影控件（ShadowControl）====================
  'box-shadow': {
    中文名: '盒阴影',
    CSS属性: 'box-shadow',
    控件类型: 'shadow',
    支持多层: true,
    支持渐变: false,
    默认值: 'none',
    所属面板: '阴影与特效',
    描述: '设置元素的外阴影或内阴影',
    示例值: '0 4px 8px rgba(0,0,0,0.2)'
  },
  'text-shadow': {
    中文名: '文字阴影',
    CSS属性: 'text-shadow',
    控件类型: 'shadow',
    支持多层: true,
    支持渐变: false,
    默认值: 'none',
    所属面板: '文字与字体',
    描述: '设置文字的阴影',
    示例值: '2px 2px 4px rgba(0,0,0,0.5)'
  },

  // ==================== 边框控件（BorderControl）====================
  'border': {
    中文名: '边框',
    CSS属性: 'border',
    控件类型: 'border',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置元素的边框（样式、宽度、颜色）',
    示例值: '1px solid #000'
  },
  'border-style': {
    中文名: '边框样式',
    CSS属性: 'border-style',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置边框样式（实线、虚线、点状等）',
    示例值: 'solid, dashed, dotted, double'
  },
  'border-width': {
    中文名: '边框宽度',
    CSS属性: 'border-width',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置边框的宽度',
    示例值: '1px 或 2px 4px'
  },

  // ==================== 圆角控件（BorderRadiusControl）====================
  'border-radius': {
    中文名: '圆角',
    CSS属性: 'border-radius',
    控件类型: 'border-radius',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置元素的圆角（支持椭圆角、四角单独）',
    示例值: '10px 或 10px 20px / 15px 25px'
  },

  // ==================== 间距控件（SpacingControl）====================
  'padding': {
    中文名: '内边距',
    CSS属性: 'padding',
    控件类型: 'spacing',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的内边距',
    示例值: '10px 或 10px 20px'
  },
  'margin': {
    中文名: '外边距',
    CSS属性: 'margin',
    控件类型: 'spacing',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的外边距（可以为负值）',
    示例值: '10px 或 auto'
  },

  // ==================== 尺寸控件（SizeControl）====================
  'width': {
    中文名: '宽度',
    CSS属性: 'width',
    控件类型: 'size',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '盒模型',
    描述: '设置元素的宽度',
    示例值: '100px 或 50% 或 auto'
  },
  'height': {
    中文名: '高度',
    CSS属性: 'height',
    控件类型: 'size',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '盒模型',
    描述: '设置元素的高度',
    示例值: '100px 或 50vh 或 auto'
  },
  'min-width': {
    中文名: '最小宽度',
    CSS属性: 'min-width',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的最小宽度',
    示例值: '100px'
  },
  'max-width': {
    中文名: '最大宽度',
    CSS属性: 'max-width',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '盒模型',
    描述: '设置元素的最大宽度',
    示例值: '500px'
  },
  'min-height': {
    中文名: '最小高度',
    CSS属性: 'min-height',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的最小高度',
    示例值: '100px'
  },
  'max-height': {
    中文名: '最大高度',
    CSS属性: 'max-height',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '盒模型',
    描述: '设置元素的最大高度',
    示例值: '500px'
  },
  'aspect-ratio': {
    中文名: '宽高比',
    CSS属性: 'aspect-ratio',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '盒模型',
    描述: '设置元素的宽高比',
    示例值: '16/9 或 1/1'
  },
  'box-sizing': {
    中文名: '盒模型',
    CSS属性: 'box-sizing',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'content-box',
    所属面板: '盒模型',
    描述: '设置盒模型计算方式',
    示例值: 'border-box, content-box'
  },

  // ==================== 定位控件（PositionControl）====================
  'position': {
    中文名: '定位',
    CSS属性: 'position',
    控件类型: 'position',
    支持多层: false,
    支持渐变: false,
    默认值: 'static',
    所属面板: '定位',
    描述: '设置元素的定位方式',
    示例值: 'static, relative, absolute, fixed, sticky'
  },
  'top': {
    中文名: '上偏移',
    CSS属性: 'top',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '定位',
    描述: '设置元素的上偏移',
    示例值: '10px 或 50%'
  },
  'right': {
    中文名: '右偏移',
    CSS属性: 'right',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '定位',
    描述: '设置元素的右偏移',
    示例值: '10px'
  },
  'bottom': {
    中文名: '下偏移',
    CSS属性: 'bottom',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '定位',
    描述: '设置元素的下偏移',
    示例值: '10px'
  },
  'left': {
    中文名: '左偏移',
    CSS属性: 'left',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '定位',
    描述: '设置元素的左偏移',
    示例值: '10px'
  },
  'z-index': {
    中文名: '层级',
    CSS属性: 'z-index',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '定位',
    描述: '设置元素的层级',
    示例值: '10'
  },

  // ==================== Flex布局控件（FlexboxControl）====================
  'display': {
    中文名: '显示',
    CSS属性: 'display',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'block',
    所属面板: '布局',
    描述: '设置元素的显示类型',
    示例值: 'block, flex, grid, none, inline-block'
  },
  'flex-direction': {
    中文名: 'Flex方向',
    CSS属性: 'flex-direction',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'row',
    所属面板: '布局',
    描述: '设置Flex容器的主轴方向',
    示例值: 'row, column, row-reverse, column-reverse'
  },
  'justify-content': {
    中文名: '主轴对齐',
    CSS属性: 'justify-content',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'flex-start',
    所属面板: '布局',
    描述: '设置Flex容器主轴对齐方式',
    示例值: 'flex-start, center, flex-end, space-between, space-around'
  },
  'align-items': {
    中文名: '交叉轴对齐',
    CSS属性: 'align-items',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'stretch',
    所属面板: '布局',
    描述: '设置Flex容器交叉轴对齐方式',
    示例值: 'flex-start, center, flex-end, stretch, baseline'
  },
  'gap': {
    中文名: '间隙',
    CSS属性: 'gap',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '布局',
    描述: '设置Flex或Grid容器的间隙',
    示例值: '10px'
  },
  'order': {
    中文名: '排序',
    CSS属性: 'order',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '布局',
    描述: '设置Flex项目的排序顺序',
    示例值: '0, 1, -1'
  },
  'align-self': {
    中文名: '自身对齐',
    CSS属性: 'align-self',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '布局',
    描述: '设置Flex项目自身的交叉轴对齐方式',
    示例值: 'auto, flex-start, center, flex-end, stretch'
  },

  // ==================== 变换控件（TransformControl）====================
  'transform': {
    中文名: '变换',
    CSS属性: 'transform',
    控件类型: 'transform',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '变换与动画',
    描述: '设置元素的变换（旋转、缩放、倾斜、偏移）',
    示例值: 'rotate(45deg) scale(1.5)'
  },

  // ==================== 字体控件（FontControl）====================
  'font-size': {
    中文名: '字体大小',
    CSS属性: 'font-size',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '16px',
    所属面板: '文字与字体',
    描述: '设置文字的大小',
    示例值: '16px 或 1em'
  },
  'font-weight': {
    中文名: '字体粗细',
    CSS属性: 'font-weight',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'normal',
    所属面板: '文字与字体',
    描述: '设置文字的粗细',
    示例值: 'normal, bold, 100-900'
  },
  'font-style': {
    中文名: '字体样式',
    CSS属性: 'font-style',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'normal',
    所属面板: '文字与字体',
    描述: '设置文字的样式（正常、斜体）',
    示例值: 'normal, italic, oblique'
  },
  'letter-spacing': {
    中文名: '字母间距',
    CSS属性: 'letter-spacing',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'normal',
    所属面板: '文字与字体',
    描述: '设置字母之间的间距',
    示例值: '2px 或 0.1em'
  },
  'line-height': {
    中文名: '行高',
    CSS属性: 'line-height',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: 'normal',
    所属面板: '文字与字体',
    描述: '设置行高',
    示例值: '1.5 或 24px'
  },
  'text-align': {
    中文名: '文字对齐',
    CSS属性: 'text-align',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'left',
    所属面板: '文字与字体',
    描述: '设置文字的对齐方式',
    示例值: 'left, center, right, justify'
  },
  'text-transform': {
    中文名: '文字变换',
    CSS属性: 'text-transform',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '文字与字体',
    描述: '设置文字的大小写变换',
    示例值: 'none, uppercase, lowercase, capitalize'
  },

  // ==================== 滤镜控件（FilterControl）====================
  'filter': {
    中文名: '滤镜',
    CSS属性: 'filter',
    控件类型: 'filter',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '阴影与特效',
    描述: '设置元素的滤镜效果（模糊、亮度、对比度等）',
    示例值: 'blur(5px) brightness(1.2)'
  },
  'backdrop-filter': {
    中文名: '背景滤镜',
    CSS属性: 'backdrop-filter',
    控件类型: 'filter',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '阴影与特效',
    描述: '设置元素背景的滤镜效果（毛玻璃）',
    示例值: 'blur(10px)'
  },

  // ==================== 背景图片控件（BackgroundImageControl）====================
  'background-image': {
    中文名: '背景图片',
    CSS属性: 'background-image',
    控件类型: 'background-image',
    支持多层: true,
    支持渐变: true,
    默认值: 'none',
    所属面板: '背景与颜色',
    描述: '设置背景图片',
    示例值: 'url("image.png")'
  },
  'background-size': {
    中文名: '背景尺寸',
    CSS属性: 'background-size',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '背景与颜色',
    描述: '设置背景图片的尺寸',
    示例值: 'cover, contain, 100px 200px'
  },
  'background-position': {
    中文名: '背景位置',
    CSS属性: 'background-position',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: '0% 0%',
    所属面板: '背景与颜色',
    描述: '设置背景图片的位置',
    示例值: 'center, top left, 50% 50%'
  },
  'background-repeat': {
    中文名: '背景重复',
    CSS属性: 'background-repeat',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'repeat',
    所属面板: '背景与颜色',
    描述: '设置背景图片的重复方式',
    示例值: 'repeat, no-repeat, repeat-x, repeat-y'
  },

  // ==================== 过渡控件（TransitionControl）====================
  'transition': {
    中文名: '过渡',
    CSS属性: 'transition',
    控件类型: 'transition',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '变换与动画',
    描述: '设置元素的过渡动画',
    示例值: 'all 0.3s ease'
  },

  // ==================== 切片边框控件（BorderImageControl）====================
  'border-image-source': {
    中文名: '边框图片源',
    CSS属性: 'border-image-source',
    控件类型: 'border-image',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置边框图片的源',
    示例值: 'url("border.png")'
  },
  'border-image-slice': {
    中文名: '边框图片切片',
    CSS属性: 'border-image-slice',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '100%',
    所属面板: '边框',
    描述: '设置边框图片的切片位置',
    示例值: '30 40 30 40 fill'
  },
  'border-image-width': {
    中文名: '边框图片宽度',
    CSS属性: 'border-image-width',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '1',
    所属面板: '边框',
    描述: '设置边框图片的宽度',
    示例值: '25px 35px 25px 35px'
  },
  'border-image-outset': {
    中文名: '边框图片外扩',
    CSS属性: 'border-image-outset',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置边框图片的外扩距离',
    示例值: '0px 1px 3px 0px'
  },
  'border-image-repeat': {
    中文名: '边框图片重复',
    CSS属性: 'border-image-repeat',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'stretch',
    所属面板: '边框',
    描述: '设置边框图片的重复方式',
    示例值: 'stretch, repeat, round, space'
  },

  // ==================== 其他常用属性 ====================
  'opacity': {
    中文名: '透明度',
    CSS属性: 'opacity',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '1',
    所属面板: '阴影与特效',
    描述: '设置元素的透明度',
    示例值: '0-1'
  },
  'overflow': {
    中文名: '溢出',
    CSS属性: 'overflow',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'visible',
    所属面板: '盒模型',
    描述: '设置内容溢出时的处理方式',
    示例值: 'visible, hidden, scroll, auto'
  },
  'cursor': {
    中文名: '光标',
    CSS属性: 'cursor',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '其他',
    描述: '设置鼠标光标样式',
    示例值: 'pointer, default, text, move'
  },
  'pointer-events': {
    中文名: '指针事件',
    CSS属性: 'pointer-events',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '其他',
    描述: '设置元素是否响应鼠标事件',
    示例值: 'auto, none'
  },
  'user-select': {
    中文名: '用户选择',
    CSS属性: 'user-select',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '其他',
    描述: '设置文字是否可被选中',
    示例值: 'auto, none, text'
  },

  // ==================== 分边框属性 ====================
  'border-left': {
    中文名: '左边框',
    CSS属性: 'border-left',
    控件类型: 'border',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置元素的左边框',
    示例值: '1px solid #000'
  },
  'border-right': {
    中文名: '右边框',
    CSS属性: 'border-right',
    控件类型: 'border',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置元素的右边框',
    示例值: '1px solid #000'
  },
  'border-top': {
    中文名: '上边框',
    CSS属性: 'border-top',
    控件类型: 'border',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置元素的上边框',
    示例值: '1px solid #000'
  },
  'border-bottom': {
    中文名: '下边框',
    CSS属性: 'border-bottom',
    控件类型: 'border',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置元素的下边框',
    示例值: '1px solid #000'
  },

  // ==================== 分圆角属性 ====================
  'border-top-left-radius': {
    中文名: '左上圆角',
    CSS属性: 'border-top-left-radius',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置左上角的圆角',
    示例值: '10px'
  },
  'border-top-right-radius': {
    中文名: '右上圆角',
    CSS属性: 'border-top-right-radius',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置右上角的圆角',
    示例值: '10px'
  },
  'border-bottom-left-radius': {
    中文名: '左下圆角',
    CSS属性: 'border-bottom-left-radius',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置左下角的圆角',
    示例值: '10px'
  },
  'border-bottom-right-radius': {
    中文名: '右下圆角',
    CSS属性: 'border-bottom-right-radius',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置右下角的圆角',
    示例值: '10px'
  },

  // ==================== 分内边距属性 ====================
  'padding-top': {
    中文名: '上内边距',
    CSS属性: 'padding-top',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的上内边距',
    示例值: '10px'
  },
  'padding-right': {
    中文名: '右内边距',
    CSS属性: 'padding-right',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的右内边距',
    示例值: '10px'
  },
  'padding-bottom': {
    中文名: '下内边距',
    CSS属性: 'padding-bottom',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的下内边距',
    示例值: '10px'
  },
  'padding-left': {
    中文名: '左内边距',
    CSS属性: 'padding-left',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的左内边距',
    示例值: '10px'
  },

  // ==================== 分外边距属性 ====================
  'margin-top': {
    中文名: '上外边距',
    CSS属性: 'margin-top',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的上外边距',
    示例值: '10px 或 auto'
  },
  'margin-right': {
    中文名: '右外边距',
    CSS属性: 'margin-right',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的右外边距',
    示例值: '10px 或 auto'
  },
  'margin-bottom': {
    中文名: '下外边距',
    CSS属性: 'margin-bottom',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的下外边距',
    示例值: '10px 或 auto'
  },
  'margin-left': {
    中文名: '左外边距',
    CSS属性: 'margin-left',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '盒模型',
    描述: '设置元素的左外边距',
    示例值: '10px 或 auto'
  },

  // ==================== 字体系列 ====================
  'font-family': {
    中文名: '字体族',
    CSS属性: 'font-family',
    控件类型: 'text',
    支持多层: false,
    支持渐变: false,
    默认值: 'inherit',
    所属面板: '文字与字体',
    描述: '设置字体族（字体管理器可全局控制）',
    示例值: 'Arial, sans-serif'
  },

  // ==================== 文字样式扩展 ====================
  'text-decoration': {
    中文名: '文字装饰',
    CSS属性: 'text-decoration',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '文字与字体',
    描述: '设置文字装饰线（下划线、删除线等）',
    示例值: 'none, underline, line-through, overline'
  },
  'white-space': {
    中文名: '空白处理',
    CSS属性: 'white-space',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'normal',
    所属面板: '文字与字体',
    描述: '设置如何处理空白字符',
    示例值: 'normal, nowrap, pre, pre-wrap'
  },
  'text-overflow': {
    中文名: '文本溢出',
    CSS属性: 'text-overflow',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'clip',
    所属面板: '文字与字体',
    描述: '设置文本溢出时的显示方式',
    示例值: 'clip, ellipsis'
  },
  'vertical-align': {
    中文名: '垂直对齐',
    CSS属性: 'vertical-align',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'baseline',
    所属面板: '文字与字体',
    描述: '设置行内元素的垂直对齐方式',
    示例值: 'baseline, top, middle, bottom'
  },

  // ==================== 轮廓（Outline）====================
  'outline': {
    中文名: '轮廓',
    CSS属性: 'outline',
    控件类型: 'border',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '边框',
    描述: '设置元素的轮廓（不占空间的边框）',
    示例值: '1px solid #000'
  },
  'outline-offset': {
    中文名: '轮廓偏移',
    CSS属性: 'outline-offset',
    控件类型: 'number',
    支持多层: false,
    支持渐变: false,
    默认值: '0',
    所属面板: '边框',
    描述: '设置轮廓与边框的距离',
    示例值: '2px'
  },
  'outline-color': {
    中文名: '轮廓颜色',
    CSS属性: 'outline-color',
    控件类型: 'color',
    支持多层: false,
    支持渐变: false,
    默认值: 'currentColor',
    所属面板: '边框',
    描述: '设置轮廓的颜色',
    示例值: '#000'
  },

  // ==================== 溢出控制 ====================
  'overflow-x': {
    中文名: '水平溢出',
    CSS属性: 'overflow-x',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'visible',
    所属面板: '盒模型',
    描述: '设置水平方向溢出时的处理方式',
    示例值: 'visible, hidden, scroll, auto'
  },
  'overflow-y': {
    中文名: '垂直溢出',
    CSS属性: 'overflow-y',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'visible',
    所属面板: '盒模型',
    描述: '设置垂直方向溢出时的处理方式',
    示例值: 'visible, hidden, scroll, auto'
  },

  // ==================== Flexbox 扩展 ====================
  'flex-wrap': {
    中文名: 'Flex换行',
    CSS属性: 'flex-wrap',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'nowrap',
    所属面板: '布局',
    描述: '设置Flex项目是否换行',
    示例值: 'nowrap, wrap, wrap-reverse'
  },
  'align-content': {
    中文名: '多行对齐',
    CSS属性: 'align-content',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'stretch',
    所属面板: '布局',
    描述: '设置多行Flex容器的对齐方式',
    示例值: 'flex-start, center, flex-end, stretch, space-between'
  },
  'flex': {
    中文名: 'Flex简写',
    CSS属性: 'flex',
    控件类型: 'text',
    支持多层: false,
    支持渐变: false,
    默认值: '0 1 auto',
    所属面板: '布局',
    描述: 'Flex项目的伸缩简写属性',
    示例值: '1 或 1 1 auto'
  },

  // ==================== 动画相关 ====================
  'animation': {
    中文名: '动画',
    CSS属性: 'animation',
    控件类型: 'text',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '变换与动画',
    描述: '设置CSS动画',
    示例值: 'myAnimation 2s ease infinite'
  },
  'animation-fill-mode': {
    中文名: '动画填充模式',
    CSS属性: 'animation-fill-mode',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'none',
    所属面板: '变换与动画',
    描述: '设置动画执行前后的样式',
    示例值: 'none, forwards, backwards, both'
  },
  'will-change': {
    中文名: '性能优化',
    CSS属性: 'will-change',
    控件类型: 'text',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '其他',
    描述: '提示浏览器优化哪些属性',
    示例值: 'transform, opacity'
  },

  // ==================== 特殊属性 ====================
  'content': {
    中文名: '伪元素内容',
    CSS属性: 'content',
    控件类型: 'text',
    支持多层: false,
    支持渐变: false,
    默认值: 'normal',
    所属面板: '其他',
    描述: '设置伪元素的内容',
    示例值: '"文本" 或 "" 或 attr(data-content)'
  },
  'appearance': {
    中文名: '外观',
    CSS属性: 'appearance',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'auto',
    所属面板: '其他',
    描述: '设置元素的外观样式',
    示例值: 'none, auto'
  },
  'object-fit': {
    中文名: '对象适配',
    CSS属性: 'object-fit',
    控件类型: 'select',
    支持多层: false,
    支持渐变: false,
    默认值: 'fill',
    所属面板: '其他',
    描述: '设置替换元素（如img）的适配方式',
    示例值: 'fill, contain, cover, none, scale-down'
  },
  'list-style': {
    中文名: '列表样式',
    CSS属性: 'list-style',
    控件类型: 'text',
    支持多层: false,
    支持渐变: false,
    默认值: 'disc',
    所属面板: '文字与字体',
    描述: '设置列表的样式',
    示例值: 'none, disc, circle, square'
  },
  'transform-origin': {
    中文名: '变换原点',
    CSS属性: 'transform-origin',
    控件类型: 'text',
    支持多层: false,
    支持渐变: false,
    默认值: '50% 50%',
    所属面板: '变换与动画',
    描述: '设置变换的原点',
    示例值: 'center, top left, 50% 50%'
  }
};

// [MAP] 值转换映射（处理特殊单位和关键字）
export const valueMap = {
  // ==================== 单位 ====================
  // 长度单位
  '像素': 'px',
  'px': 'px',
  '百分比': '%',
  '%': '%',
  'em': 'em',
  'rem': 'rem',
  '视口宽度': 'vw',
  'vw': 'vw',
  '视口高度': 'vh',
  'vh': 'vh',

  // 角度单位
  '度': 'deg',
  'deg': 'deg',
  '弧度': 'rad',
  'rad': 'rad',

  // 时间单位
  '秒': 's',
  's': 's',
  '毫秒': 'ms',
  'ms': 'ms',

  // ==================== 渐变方向 ====================
  '从上到下': 'to bottom',
  '从下到上': 'to top',
  '从左到右': 'to right',
  '从右到左': 'to left',
  '从左上到右下': 'to bottom right',
  '从左下到右上': 'to top right',
  '从右上到左下': 'to bottom left',
  '从右下到左上': 'to top left',

  // ==================== 定位关键字 ====================
  '自动': 'auto',
  'auto': 'auto',
  '继承': 'inherit',
  'inherit': 'inherit',
  '初始': 'initial',
  'initial': 'initial',

  // ==================== 边框样式 ====================
  '实线': 'solid',
  '虚线': 'dashed',
  '点状': 'dotted',
  '双线': 'double',
  '3D沟槽': 'groove',
  '3D脊状': 'ridge',
  '3D嵌入': 'inset',
  '3D突出': 'outset',
  '无': 'none',
  '隐藏边框': 'hidden',

  // ==================== 定位方式 ====================
  '静态': 'static',
  '相对': 'relative',
  '绝对': 'absolute',
  '固定': 'fixed',
  '粘性': 'sticky',

  // ==================== 显示类型 ====================
  '块级': 'block',
  '行内块': 'inline-block',
  'Flex': 'flex',
  '伸缩盒': 'flex',
  '网格': 'grid',
  '不显示': 'none',

  // ==================== Flex方向 ====================
  '水平': 'row',
  '垂直': 'column',
  '水平反向': 'row-reverse',
  '垂直反向': 'column-reverse',

  // ==================== Flex对齐 ====================
  '开始': 'flex-start',
  '居中': 'center',
  '结束': 'flex-end',
  'Flex两端对齐': 'space-between',
  '环绕对齐': 'space-around',
  '均匀分布': 'space-evenly',
  'Flex拉伸': 'stretch',
  'Flex基线': 'baseline',

  // ==================== 文字对齐 ====================
  '左对齐': 'left',
  '右对齐': 'right',
  '居中对齐': 'center',
  '文字两端对齐': 'justify',

  // ==================== 文字变换 ====================
  '无变换': 'none',
  '大写': 'uppercase',
  '小写': 'lowercase',
  '首字母大写': 'capitalize',

  // ==================== 字体样式 ====================
  '正常': 'normal',
  '斜体': 'italic',
  '倾斜': 'oblique',
  '粗体': 'bold',
  '细体': 'lighter',
  '加粗': 'bolder',

  // ==================== 背景尺寸 ====================
  '覆盖': 'cover',
  '包含': 'contain',
  '背景拉伸': '100% 100%',

  // ==================== 背景位置 ====================
  '中心': 'center',
  '左上': 'top left',
  '顶部': 'top',
  '右上': 'top right',
  '左侧': 'left',
  '右侧': 'right',
  '左下': 'bottom left',
  '底部': 'bottom',
  '右下': 'bottom right',

  // ==================== 背景重复 ====================
  '重复': 'repeat',
  '不重复': 'no-repeat',
  '水平重复': 'repeat-x',
  '垂直重复': 'repeat-y',
  '间隔重复': 'space',
  '自适应重复': 'round',

  // ==================== 溢出方式 ====================
  '可见': 'visible',
  '溢出隐藏': 'hidden',
  '滚动': 'scroll',
  '溢出自动': 'auto',

  // ==================== 光标样式 ====================
  '默认': 'default',
  '指针': 'pointer',
  '文本': 'text',
  '移动': 'move',
  '禁止': 'not-allowed',

  // ==================== 盒模型 ====================
  '边框盒': 'border-box',
  '内容盒': 'content-box',

  // ==================== 过渡曲线 ====================
  '线性': 'linear',
  '缓动': 'ease',
  '缓入': 'ease-in',
  '缓出': 'ease-out',
  '缓入缓出': 'ease-in-out',

  // ==================== CSS函数（渐变等）====================
  '线性渐变': 'linear-gradient',
  '径向渐变': 'radial-gradient',
  '锥形渐变': 'conic-gradient',
  '重复线性渐变': 'repeating-linear-gradient',
  '重复径向渐变': 'repeating-radial-gradient',
  '重复锥形渐变': 'repeating-conic-gradient',

  // ==================== 文字装饰 ====================
  '下划线': 'underline',
  '删除线': 'line-through',
  '上划线': 'overline',

  // ==================== 空白处理 ====================
  '不换行': 'nowrap',      // 通用：white-space和flex-wrap都适用
  '换行': 'wrap',          // 通用：white-space和flex-wrap都适用
  '预格式化': 'pre',
  '预格式化换行': 'pre-wrap',
  '预格式化行': 'pre-line',

  // ==================== 文本溢出 ====================
  '裁剪': 'clip',
  '省略号': 'ellipsis',

  // ==================== 垂直对齐 ====================
  '基线': 'baseline',
  '顶部对齐': 'top',
  '中间对齐': 'middle',
  '底部对齐': 'bottom',
  '上标': 'super',
  '下标': 'sub',
  '文本顶部': 'text-top',
  '文本底部': 'text-bottom',

  // ==================== Flex换行 ====================
  // 注：'不换行'和'换行'在空白处理中已定义，此处只需反向换行
  'Flex反向换行': 'wrap-reverse',

  // ==================== 动画填充模式 ====================
  '向前': 'forwards',
  '向后': 'backwards',
  '两者': 'both',

  // ==================== 列表样式 ====================
  '圆点': 'disc',
  '圆圈': 'circle',
  '方块': 'square',
  '数字': 'decimal',
  '无列表样式': 'none',

  // ==================== 对象适配 ====================
  '填充': 'fill',
  '缩小适应': 'scale-down',

  // ==================== 显示类型扩展 ====================
  '行内': 'inline',
  '行内Flex': 'inline-flex',
  '行内网格': 'inline-grid',

  // ==================== 特殊关键字 ====================
  '无限': 'infinite',
  '反向': 'reverse',
  '交替': 'alternate',
  '交替反向': 'alternate-reverse',

  // ==================== 其他 ====================
  '透明': 'transparent',
  '当前颜色': 'currentColor'
};

// [PANEL] 属性面板分类（专家模式用）
export const cssPanels = {
  '背景与颜色': [
    'background-color',
    'background',
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    'color'
  ],
  '盒模型': [
    'width',
    'height',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'padding',
    'margin',
    'box-sizing',
    'aspect-ratio',
    'overflow'
  ],
  '边框': [
    'border',
    'border-style',
    'border-width',
    'border-color',
    'border-radius',
    'border-image-source',
    'border-image-slice',
    'border-image-width',
    'border-image-outset',
    'border-image-repeat'
  ],
  '定位': [
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'z-index'
  ],
  '布局': [
    'display',
    'flex-direction',
    'justify-content',
    'align-items',
    'gap',
    'order'
  ],
  '文字与字体': [
    'color',
    'font-size',
    'font-weight',
    'font-style',
    'letter-spacing',
    'line-height',
    'text-align',
    'text-transform',
    'text-shadow'
  ],
  '阴影与特效': [
    'box-shadow',
    'text-shadow',
    'filter',
    'backdrop-filter',
    'opacity'
  ],
  '变换与动画': [
    'transform',
    'transition'
  ],
  '其他': [
    'cursor',
    'pointer-events',
    'user-select'
  ]
};

// [FUNC] 转换函数

/**
 * 将中文属性名转换为CSS属性名
 * 
 * @description
 * 在 cssPropertyDictionary 中查找中文属性名对应的CSS属性名
 * 
 * @param {string} chineseProp - 中文属性名（如"背景颜色"）
 * @returns {string|null} CSS属性名（如"background-color"）或null
 * 
 * @example
 * translateProperty('背景颜色') // 返回 'background-color'
 * translateProperty('圆角')     // 返回 'border-radius'
 */
export function translateProperty(chineseProp) {
  // 遍历词典查找匹配的中文名
  for (const [cssProp, info] of Object.entries(cssPropertyDictionary)) {
    if (info.中文名 === chineseProp) {
      return cssProp;
    }
  }
  return null;
}

/**
 * 将中文属性值转换为CSS值
 * 
 * @description
 * 转换中文值为标准CSS值：
 * 1. 处理CSS函数名（"线性渐变(...)" → "linear-gradient(...)"）
 * 2. 处理单位转换（"像素" → "px"）
 * 3. 处理方向关键字（"从上到下" → "to bottom"）
 * 4. 处理其他关键字（"居中" → "center"）
 * 5. 颜色值保持不变（#FFC0CB、rgba() 等）
 * 6. 已经是CSS值的保持不变（10px、50% 等）
 * 
 * @param {string} chineseValue - 中文值或混合值（如"20像素"、"10px"）
 * @param {string} [property] - CSS属性名（用于特殊处理，可选）
 * @returns {string} CSS值（如"20px"）
 * 
 * @example
 * translateValue('20像素')           // 返回 '20px'
 * translateValue('从上到下')         // 返回 'to bottom'
 * translateValue('10px 20像素')      // 返回 '10px 20px'
 * translateValue('线性渐变(从上到下, #fff, #000)') 
 * // 返回 'linear-gradient(to bottom, #fff, #000)'
 */
export function translateValue(chineseValue, property) {
  if (!chineseValue) {
    return chineseValue;
  }

  let value = chineseValue.trim();

  // 1. 先处理CSS函数名（如：线性渐变(...) → linear-gradient(...)）
  // 函数名必须在其他关键字之前处理，避免函数名被部分替换
  const cssFunctions = [
    '线性渐变', '径向渐变', '锥形渐变',
    '重复线性渐变', '重复径向渐变', '重复锥形渐变'
  ];

  for (const funcName of cssFunctions) {
    if (valueMap[funcName] && value.includes(funcName)) {
      // 匹配函数名后面紧跟的括号
      const regex = new RegExp(funcName + '\\s*\\(', 'g');
      value = value.replace(regex, valueMap[funcName] + '(');
    }
  }

  // 2. 处理单位转换（支持多个单位混合）
  value = value.replace(/(\d+(?:\.\d+)?)\s*像素/g, '$1px');
  value = value.replace(/(\d+(?:\.\d+)?)\s*百分比/g, '$1%');
  value = value.replace(/(\d+(?:\.\d+)?)\s*度/g, '$1deg');
  value = value.replace(/(\d+(?:\.\d+)?)\s*秒/g, '$1s');
  value = value.replace(/(\d+(?:\.\d+)?)\s*毫秒/g, '$1ms');
  value = value.replace(/(\d+(?:\.\d+)?)\s*视口宽度/g, '$1vw');
  value = value.replace(/(\d+(?:\.\d+)?)\s*视口高度/g, '$1vh');

  // 3. 处理关键字转换（按长度排序，先替换长的，避免部分替换）
  // 例如："从左上到右下" 应该优先于 "从左"
  const sortedEntries = Object.entries(valueMap)
    .filter(([chinese]) => {
      // 过滤掉已处理的单位和函数名
      // 注意：保留所有关键字（包括2个字的："居中"/"开始"/"结束"等）
      const isUnit = ['像素', '百分比', '度', '秒', '毫秒', '视口宽度', '视口高度'].includes(chinese);
      const isFunction = cssFunctions.includes(chinese);
      return !isUnit && !isFunction;
    })
    .sort((a, b) => b[0].length - a[0].length);  // 按中文长度降序

  for (const [chinese, english] of sortedEntries) {
    if (value.includes(chinese)) {
      // 使用全局替换，支持多个关键字组合
      const regex = new RegExp(chinese.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      value = value.replace(regex, english);
    }
  }

  return value;
}

/**
 * 将CSS属性名转换为中文（用于反向解析）
 * 
 * @description
 * 在 cssPropertyDictionary 中查找 CSS 属性名对应的中文属性名
 * 用于从标准CSS反向生成中文CSS
 * 
 * @param {string} cssProp - CSS属性名（如"background-color"）
 * @returns {string|null} 中文属性名（如"背景颜色"）或null
 * 
 * @example
 * translatePropertyToChinese('background-color') // 返回 '背景颜色'
 * translatePropertyToChinese('border-radius')    // 返回 '圆角'
 */
export function translatePropertyToChinese(cssProp) {
  const info = cssPropertyDictionary[cssProp];
  return info ? info.中文名 : null;
}

/**
 * 将CSS值转换为中文（用于反向解析）
 * 
 * @description
 * 将标准CSS值转换为中文值（目前只支持关键字，不转换单位）
 * 
 * @param {string} cssValue - CSS值（如"to bottom"）
 * @param {string} [property] - CSS属性名（用于特殊处理，可选）
 * @returns {string} 中文值（如"从上到下"）
 * 
 * @example
 * translateValueToChinese('to bottom') // 返回 '从上到下'
 * translateValueToChinese('center')    // 返回 '居中'
 * translateValueToChinese('20px')      // 返回 '20px'（不转换单位）
 */
export function translateValueToChinese(cssValue, property) {
  if (!cssValue) {
    return cssValue;
  }

  let value = cssValue.trim();

  // 反向查找关键字（英文 → 中文）
  for (const [chinese, english] of Object.entries(valueMap)) {
    if (value.includes(english)) {
      value = value.replace(english, chinese);
    }
  }

  return value;
}

/**
 * 获取属性的详细信息
 * 
 * @description
 * 从 cssPropertyDictionary 中获取指定属性的完整信息
 * 
 * @param {string} cssProp - CSS属性名（如"background-color"）
 * @returns {Object|null} 属性信息对象或null
 * 
 * @example
 * const info = getPropertyInfo('background-color');
 * // 返回: { 中文名: '背景颜色', 控件类型: 'color', ... }
 */
export function getPropertyInfo(cssProp) {
  return cssPropertyDictionary[cssProp] || null;
}

/**
 * 根据中文名获取属性信息
 * 
 * @description
 * 根据中文属性名获取完整的属性信息
 * 
 * @param {string} chineseProp - 中文属性名（如"背景颜色"）
 * @returns {Object|null} 属性信息对象或null
 * 
 * @example
 * const info = getPropertyInfoByChinese('背景颜色');
 * // 返回: { 中文名: '背景颜色', CSS属性: 'background-color', 控件类型: 'color', ... }
 */
export function getPropertyInfoByChinese(chineseProp) {
  for (const [cssProp, info] of Object.entries(cssPropertyDictionary)) {
    if (info.中文名 === chineseProp) {
      return { ...info, CSS属性: cssProp };
    }
  }
  return null;
}

/**
 * 获取指定控件类型的所有属性
 * 
 * @description
 * 查找使用指定控件类型的所有CSS属性
 * 
 * @param {string} controlType - 控件类型（如"color"、"shadow"）
 * @returns {Array<string>} CSS属性名数组
 * 
 * @example
 * getPropertiesByControlType('color')
 * // 返回: ['background-color', 'color', 'border-color', 'background']
 */
export function getPropertiesByControlType(controlType) {
  const properties = [];
  for (const [cssProp, info] of Object.entries(cssPropertyDictionary)) {
    if (info.控件类型 === controlType) {
      properties.push(cssProp);
    }
  }
  return properties;
}

/**
 * 获取指定面板的所有属性
 * 
 * @description
 * 获取属于指定面板分类的所有CSS属性
 * 
 * @param {string} panelName - 面板名称（如"背景与颜色"）
 * @returns {Array<string>} CSS属性名数组
 * 
 * @example
 * getPropertiesByPanel('背景与颜色')
 * // 返回: ['background-color', 'background', 'background-image', ...]
 */
export function getPropertiesByPanel(panelName) {
  return cssPanels[panelName] || [];
}

/**
 * 验证属性值是否有效（基础版）
 * 
 * @description
 * 基础的CSS值验证：
 * 1. 检查是否为空
 * 2. 检查颜色格式（hex、rgb、rgba、hsl）
 * 3. 检查数值格式
 * 
 * 注：完整验证需要根据具体属性类型进行
 * 
 * @param {string} property - CSS属性名
 * @param {string} value - CSS值
 * @returns {boolean} 是否有效
 * 
 * @example
 * validateValue('background-color', '#FFC0CB')   // true
 * validateValue('width', '100px')                // true
 * validateValue('border-radius', 'invalid')      // false
 */
export function validateValue(property, value) {
  if (!value || value.trim() === '') {
    return false;
  }

  // 基础验证：检查是否包含基本的CSS值格式
  const basicPatterns = [
    /^#[0-9a-fA-F]{3,8}$/,                    // Hex颜色
    /^rgba?\([^)]+\)$/,                       // RGB/RGBA
    /^hsla?\([^)]+\)$/,                       // HSL/HSLA
    /^[\d.]+\s*(px|em|rem|%|vw|vh|deg|s|ms)?$/, // 数值+单位
    /^[a-z-]+$/,                              // 关键字
    /^url\([^)]+\)$/,                         // URL
    /^none$/,                                 // none
    /^auto$/,                                 // auto
    /^inherit$/,                              // inherit
    /^initial$/,                              // initial
    /^transparent$/                           // transparent
  ];

  return basicPatterns.some(pattern => pattern.test(value.trim()));
}

/**
 * 获取所有CSS属性名列表
 * 
 * @description
 * 返回词典中所有CSS属性名的数组
 * 
 * @returns {Array<string>} CSS属性名数组
 */
export function getAllCSSProperties() {
  return Object.keys(cssPropertyDictionary);
}

/**
 * 获取所有中文属性名列表
 * 
 * @description
 * 返回词典中所有中文属性名的数组
 * 
 * @returns {Array<string>} 中文属性名数组
 */
export function getAllChineseProperties() {
  return Object.values(cssPropertyDictionary).map(info => info.中文名);
}

// [EXPORT] 导出
export default {
  // 数据
  cssPropertyDictionary,
  valueMap,
  cssPanels,

  // 转换函数
  translateProperty,
  translateValue,
  translatePropertyToChinese,
  translateValueToChinese,

  // 查询函数
  getPropertyInfo,
  getPropertyInfoByChinese,
  getPropertiesByControlType,
  getPropertiesByPanel,
  getAllCSSProperties,
  getAllChineseProperties,

  // 验证函数
  validateValue
};




