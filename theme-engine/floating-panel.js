/**
 * ST-Theme-Engine 浮动面板模块
 *
 * @description
 * 负责浮动面板的所有交互逻辑：
 * - 面板的显示/隐藏/拖动
 * - CSS实时注入（不防抖，直接 style.innerHTML = content）
 * - 方案管理（下拉框切换、保存、另存为、删除）
 * - 标签页切换
 */

import logger from '../logger.js';
import {
    loadStorage,
    getActiveScheme,
    getSchemeList,
    saveSchemeCSS,
    saveSchemeHTML,
    saveSchemeJS,
    saveSchemeJSAutoRun,
    createScheme,
    switchScheme,
    deleteScheme,
    renameScheme,
    saveDebounced,
    saveStorage
} from './storage.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';
import { getSelectorName, getCommonSelectors } from './css-metadata.js';

// ============================================
// 常量
// ============================================

/** 注入CSS用的style标签ID */
const STYLE_ID = 'st-theme-engine-style';

/** 装饰CSS专用 style 标签 ID */
const DECO_STYLE_ID = 'ste-deco-styles';

/** Font Awesome 图标保护的 style 标签 ID */
const FA_PROTECTION_ID = 'ste-fa-icon-protection';

/**
 * Font Awesome 图标保护 CSS
 *
 * all:revert 连带重置了 FA 的 font-family/font-weight，导致图标消失。
 * 用 !important 强制恢复 FA 关键属性（!important 优先级 > 普通 all:revert）。
 */
const FA_PROTECTION_CSS = `
.fa-solid, .fa-regular, .fa-light, .fa-thin, .fa-duotone,
.fa-brands, .fab, .fas, .far,
[data-fa-i2svg] {
    font-style: normal !important;
    font-variant: normal !important;
    line-height: 1 !important;
    text-rendering: auto !important;
    -webkit-font-smoothing: antialiased !important;
    -moz-osx-font-smoothing: grayscale !important;
    display: inline-block !important;
}
.fa-solid, .fas {
    font-family: "Font Awesome 6 Free" !important;
    font-weight: 900 !important;
}
.fa-regular, .far {
    font-family: "Font Awesome 6 Free" !important;
    font-weight: 400 !important;
}
.fa-brands, .fab {
    font-family: "Font Awesome 6 Brands" !important;
    font-weight: 400 !important;
}`;

/** 面板HTML模板（内联，避免额外文件请求） */
const PANEL_HTML = `
<div class="ste-panel" id="ste-panel">
    <!-- 标题栏（可拖动） -->
    <div class="ste-panel-header" id="ste-panel-header">
        <span class="ste-panel-title">ST-Theme-Engine</span>
        <span class="ste-panel-close" id="ste-panel-close">
            <i class="fa-solid fa-xmark"></i>
        </span>
    </div>

    <!-- 工具栏：方案选择 + 操作按钮 -->
    <div class="ste-toolbar">
        <select id="ste-scheme-select" class="margin0"></select>
        <button class="ste-toolbar-btn" id="ste-scheme-save" title="保存当前方案">
            <i class="fa-solid fa-save"></i>
        </button>
        <button class="ste-toolbar-btn" id="ste-scheme-save-as" title="另存为新方案">
            <i class="fa-solid fa-file-circle-plus"></i>
        </button>
        <button class="ste-toolbar-btn" id="ste-scheme-delete" title="删除当前方案">
            <i class="fa-solid fa-trash"></i>
        </button>
        <button class="ste-toolbar-btn" id="ste-scheme-rename" title="重命名当前方案">
            <i class="fa-solid fa-pen"></i>
        </button>
        <span class="ste-toolbar-divider"></span>
        <button class="ste-toolbar-btn" id="ste-scheme-export" title="导出当前方案">
            <i class="fa-solid fa-file-export"></i>
        </button>
        <button class="ste-toolbar-btn" id="ste-scheme-import" title="导入方案">
            <i class="fa-solid fa-file-import"></i>
        </button>
        <input type="file" id="ste-scheme-import-file" accept=".json" hidden>
    </div>

    <!-- 标签页栏 -->
    <div class="ste-tabs">
        <div class="ste-tab active" data-tab="css">CSS</div>
        <div class="ste-tab" data-tab="html">HTML注入</div>
        <div class="ste-tab" data-tab="js">JS执行</div>
        <div class="ste-tab" data-tab="layout">布局</div>
    </div>

    <!-- 标签页内容 -->
    <div class="ste-tab-content active" data-tab="css">
        <div class="ste-css-priority-notice">
            <i class="fa-solid fa-circle-info"></i>
            此输入框的CSS优先级高于SillyTavern官方的"自定义CSS"输入框。若两边用了相同的选择器，官方那边的修改不会生效。
        </div>
        <textarea class="ste-css-input" id="ste-css-input"
            placeholder="在这里写CSS，实时生效...&#10;例如: body { background: red; }"></textarea>
    </div>

    <div class="ste-tab-content" data-tab="html">
        <div class="ste-html-toolbar">
            <button class="ste-toolbar-btn" id="ste-html-add" title="添加注入项">
                <i class="fa-solid fa-plus"></i> 添加
            </button>
            <button class="ste-toolbar-btn" id="ste-html-quick-add" title="从常用选择器快速添加">
                <i class="fa-solid fa-bolt"></i> 常用
            </button>
            <button class="ste-toolbar-btn" id="ste-html-deco" title="可视化添加图片装饰">
                <i class="fa-solid fa-image"></i> 装饰
            </button>
            <button class="ste-toolbar-btn" id="ste-html-apply" title="立即应用所有注入">
                <i class="fa-solid fa-play"></i> 应用
            </button>
            <button class="ste-toolbar-btn" id="ste-html-clear" title="清除所有已注入的HTML">
                <i class="fa-solid fa-eraser"></i> 清除
            </button>
        </div>
        <div class="ste-html-list" id="ste-html-list">
            <!-- 动态生成注入项列表 -->
        </div>
    </div>

    <div class="ste-tab-content" data-tab="js">
        <div class="ste-js-toolbar">
            <button class="ste-toolbar-btn" id="ste-js-run" title="执行JS">
                <i class="fa-solid fa-play"></i> 执行
            </button>
            <label class="ste-js-autorun-label">
                <input type="checkbox" id="ste-js-autorun"> 加载时自动执行
            </label>
        </div>
        <div class="ste-js-warning">
            <i class="fa-solid fa-shield-exclamation"></i>
            <div class="ste-js-warning-text">
                <strong>安全提示</strong>：JS代码拥有完整的页面访问权限。
                导入他人方案时，请务必检查JS代码是否包含可疑内容（如 fetch、XMLHttpRequest、localStorage 等外发数据行为）。
                建议仅执行自己编写或信任来源的代码。
            </div>
        </div>
        <textarea class="ste-css-input" id="ste-js-input"
            placeholder="在这里写JavaScript...
例如: document.title = '测试';"></textarea>
    </div>

    <div class="ste-tab-content" data-tab="layout">
        <div class="ste-layout-subtabs">
            <button class="ste-layout-subtab active" data-subtab="position">布局定位</button>
            <button class="ste-layout-subtab" data-subtab="quick-edit">快速编辑</button>
        </div>
        <div class="ste-layout-subtab-content active" data-subtab="position">
            <div class="ste-layout-tab-content">
                <p class="ste-layout-desc">
                    悬停到页面元素上（蓝框高亮），点击选中后可拖动位置、拖拽右下角手柄调整大小。确认后自动生成 CSS，重复确认会替换旧的 CSS 而不是叠加。
                </p>
                <button class="ste-toolbar-btn" id="ste-layout-start">
                    <i class="fa-solid fa-up-down-left-right"></i> 进入布局编辑模式
                </button>
                <!-- 快速选择区：布局模式激活后才显示 -->
                <div class="ste-layout-quickpick" id="ste-layout-quickpick">
                    <div class="ste-layout-quickpick-label">快速选择（难以悬停的小元素，点击直接选中）</div>
                    <div class="ste-layout-qp-group">
                        <div class="ste-layout-qp-group-label"><i class="fa-solid fa-user"></i> 用户消息</div>
                        <div class="ste-layout-quickpick-grid">
                            <button class="ste-layout-qp-btn" data-cls="mesIDDisplay" data-is-user="true" title="#楼层数">#楼层</button>
                            <button class="ste-layout-qp-btn" data-cls="timestamp" data-is-user="true" title="时间戳（名字行旁）">时间戳</button>
                            <button class="ste-layout-qp-btn" data-cls="tokenCounterDisplay" data-is-user="true" title="Token数">Token数</button>
                            <button class="ste-layout-qp-btn" data-cls="name_text" data-is-user="true" title="用户名文字">名字</button>
                            <button class="ste-layout-qp-btn" data-cls="avatar" data-is-user="true" title="头像图片容器（改这个控制大小）">头像图片</button>
                            <button class="ste-layout-qp-btn" data-cls="mesAvatarWrapper" data-is-user="true" title="整个头像侧栏（含名字/楼层等）">头像区域</button>
                            <button class="ste-layout-qp-btn" data-cls="mes_block" data-is-user="true" title="消息气泡整块">消息气泡</button>
                            <button class="ste-layout-qp-btn" data-cls="mes_text" data-is-user="true" title="消息正文文字区">消息正文</button>
                            <button class="ste-layout-qp-btn" data-cls="mes_buttons" data-is-user="true" title="操作按钮行（编辑/删除/复制等）">操作按钮</button>
                        </div>
                    </div>
                    <div class="ste-layout-qp-group">
                        <div class="ste-layout-qp-group-label"><i class="fa-solid fa-robot"></i> 角色消息</div>
                        <div class="ste-layout-quickpick-grid">
                            <button class="ste-layout-qp-btn" data-cls="mesIDDisplay" data-is-user="false" title="#楼层数">#楼层</button>
                            <button class="ste-layout-qp-btn" data-cls="timestamp" data-is-user="false" title="时间戳（名字行旁）">时间戳</button>
                            <button class="ste-layout-qp-btn" data-cls="tokenCounterDisplay" data-is-user="false" title="Token数">Token数</button>
                            <button class="ste-layout-qp-btn" data-cls="mes_timer" data-is-user="false" title="AI生成耗时（秒数）">生成时间</button>
                            <button class="ste-layout-qp-btn" data-cls="name_text" data-is-user="false" title="角色名文字">名字</button>
                            <button class="ste-layout-qp-btn" data-cls="avatar" data-is-user="false" title="头像图片容器（改这个控制大小）">头像图片</button>
                            <button class="ste-layout-qp-btn" data-cls="mesAvatarWrapper" data-is-user="false" title="整个头像侧栏（含名字/楼层等）">头像区域</button>
                            <button class="ste-layout-qp-btn" data-cls="mes_block" data-is-user="false" title="消息气泡整块">消息气泡</button>
                            <button class="ste-layout-qp-btn" data-cls="mes_text" data-is-user="false" title="消息正文文字区">消息正文</button>
                            <button class="ste-layout-qp-btn" data-cls="mes_buttons" data-is-user="false" title="操作按钮行（编辑/删除/复制等）">操作按钮</button>
                            <button class="ste-layout-qp-btn" data-cls="swipe_left" data-is-user="false" title="向左翻页箭头">左翻页</button>
                            <button class="ste-layout-qp-btn" data-cls="swipeRightBlock" data-is-user="false" title="右翻页区块（含箭头+翻页数）">右翻页区</button>
                            <button class="ste-layout-qp-btn" data-cls="swipe_right" data-is-user="false" title="向右翻页箭头">右翻页</button>
                        </div>
                    </div>
                </div>
                <div class="ste-layout-hint">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    选中元素后请勿滚动页面。按 Esc 取消选中或退出模式。
                </div>
            </div>
        </div>
        <div class="ste-layout-subtab-content" data-subtab="quick-edit">
            <div class="ste-qe-panel">
                <div class="ste-qe-no-selection">
                    <i class="fa-solid fa-hand-pointer" style="font-size:1.3em;opacity:0.5;"></i>
                    <p>请先在「布局定位」中进入编辑模式并选中一个元素，然后切到这里调整外观。</p>
                </div>
                <div class="ste-qe-controls" style="display:none;">
                    <div class="ste-qe-selected-info">
                        <span class="ste-qe-el-name"></span>
                        <span class="ste-qe-selector"></span>
                    </div>
                    <div class="ste-qe-group expanded" data-group="colors">
                        <button class="ste-qe-group-header" type="button">
                            <span>颜色与背景</span>
                            <i class="fa-solid fa-chevron-down ste-qe-group-arrow"></i>
                        </button>
                        <div class="ste-qe-group-body">
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">背景色</span>
                                <input class="ste-qe-color-picker" type="color" data-prop="background-color" data-role="color-picker" value="#000000">
                                <input class="ste-qe-color-text" type="text" data-prop="background-color" data-role="color-text" placeholder="rgba(0, 0, 0, 0.35)">
                            </div>
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">文字色</span>
                                <input class="ste-qe-color-picker" type="color" data-prop="color" data-role="color-picker" value="#ffffff">
                                <input class="ste-qe-color-text" type="text" data-prop="color" data-role="color-text" placeholder="#ffffff / rgba(...)">
                            </div>
                        </div>
                    </div>

                    <div class="ste-qe-group" data-group="border">
                        <button class="ste-qe-group-header" type="button">
                            <span>边框与圆角</span>
                            <i class="fa-solid fa-chevron-down ste-qe-group-arrow"></i>
                        </button>
                        <div class="ste-qe-group-body">
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">边框宽度</span>
                                <input class="ste-qe-range" type="range" min="0" max="20" step="1" value="0" data-prop="border-width">
                                <span class="ste-qe-range-val" data-role="range-val">0px</span>
                            </div>
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">边框样式</span>
                                <select class="ste-qe-select" data-prop="border-style">
                                    <option value="none">none</option>
                                    <option value="solid">solid</option>
                                    <option value="dashed">dashed</option>
                                    <option value="dotted">dotted</option>
                                    <option value="double">double</option>
                                </select>
                            </div>
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">边框颜色</span>
                                <input class="ste-qe-color-picker" type="color" data-prop="border-color" data-role="color-picker" value="#ffffff">
                                <input class="ste-qe-color-text" type="text" data-prop="border-color" data-role="color-text" placeholder="#ffffff / rgba(...)">
                            </div>
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">圆角</span>
                                <input class="ste-qe-range" type="range" min="0" max="50" step="1" value="0" data-prop="border-radius">
                                <span class="ste-qe-range-val" data-role="range-val">0px</span>
                            </div>
                        </div>
                    </div>

                    <div class="ste-qe-group" data-group="nine-grid">
                        <button class="ste-qe-group-header" type="button">
                            <span>九宫格背景 border-image</span>
                            <i class="fa-solid fa-chevron-down ste-qe-group-arrow"></i>
                        </button>
                        <div class="ste-qe-group-body">
                            <div class="ste-qe-row ste-qe-row-stack">
                                <span class="ste-qe-label">图片地址</span>
                                <input class="ste-qe-text-full" type="text" data-prop="border-image-source"
                                       placeholder="https://i.postimg.cc/xxx/yyy.png">
                            </div>
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">切片值</span>
                                <input class="ste-qe-text-full" type="text" data-prop="border-image-slice"
                                       placeholder="30 或 160 200 160 200"
                                       style="flex:1;">
                                <label class="ste-qe-fill-label" title="fill = 填充中间区域（几乎总是需要开启）">
                                    <input type="checkbox" class="ste-qe-fill-check" id="ste-qe-9grid-fill" checked>
                                    fill
                                </label>
                            </div>
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">边框间距</span>
                                <input class="ste-qe-text-full" type="text" data-prop="border-image-width"
                                       placeholder="0.5em" value="0.5em"
                                       style="flex:1;">
                                <span class="ste-qe-unit-hint">= 图片边框的粗细</span>
                            </div>
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">重复方式</span>
                                <select class="ste-qe-select" data-prop="border-image-repeat">
                                    <option value="round" selected>round（均匀平铺）</option>
                                    <option value="stretch">stretch（拉伸）</option>
                                    <option value="repeat">repeat（重复截断）</option>
                                    <option value="space">space（间隔分布）</option>
                                </select>
                            </div>
                            <div class="ste-qe-hint" id="ste-qe-9grid-hint" style="display:none;">
                                ⚠️ 九宫格与圆角不兼容 — 生成CSS时会自动将圆角设为0
                            </div>
                            <div class="ste-qe-subhint">
                                💡 填入图片地址后，生成CSS时会自动补全：transparent边框、透明背景、圆角归零。
                            </div>
                        </div>
                    </div>

                    <div class="ste-qe-group" data-group="shadow">
                        <button class="ste-qe-group-header" type="button">
                            <span>阴影</span>
                            <i class="fa-solid fa-chevron-down ste-qe-group-arrow"></i>
                        </button>
                        <div class="ste-qe-group-body">
                            <div class="ste-qe-shadow-presets">
                                <button class="ste-qe-preset-btn active" type="button" data-shadow="none">无</button>
                                <button class="ste-qe-preset-btn" type="button" data-shadow="0 2px 8px rgba(0,0,0,0.15)">轻微</button>
                                <button class="ste-qe-preset-btn" type="button" data-shadow="0 6px 16px rgba(0,0,0,0.22)">中等</button>
                                <button class="ste-qe-preset-btn" type="button" data-shadow="0 10px 24px rgba(0,0,0,0.28)">强烈</button>
                                <button class="ste-qe-preset-btn" type="button" data-shadow="inset 0 2px 8px rgba(0,0,0,0.24)">内阴影</button>
                            </div>
                            <div class="ste-qe-row ste-qe-row-stack">
                                <span class="ste-qe-label">自定义</span>
                                <input class="ste-qe-text-full" type="text" data-prop="box-shadow" placeholder="0 2px 8px rgba(0,0,0,0.15)">
                            </div>
                        </div>
                    </div>

                    <div class="ste-qe-group" data-group="opacity">
                        <button class="ste-qe-group-header" type="button">
                            <span>透明度</span>
                            <i class="fa-solid fa-chevron-down ste-qe-group-arrow"></i>
                        </button>
                        <div class="ste-qe-group-body">
                            <div class="ste-qe-row">
                                <span class="ste-qe-label">opacity</span>
                                <input class="ste-qe-range" type="range" min="0" max="1" step="0.05" value="1" data-prop="opacity">
                                <span class="ste-qe-range-val" data-role="range-val">1</span>
                            </div>
                            <div class="ste-qe-hint" id="ste-qe-opacity-hint" style="display:none;">
                                💡 opacity 会让文字一起变透明，建议用背景色的 rgba 值
                            </div>
                        </div>
                    </div>

                    <div class="ste-qe-group" data-group="spacing">
                        <button class="ste-qe-group-header" type="button">
                            <span>间距</span>
                            <i class="fa-solid fa-chevron-down ste-qe-group-arrow"></i>
                        </button>
                        <div class="ste-qe-group-body">
                            <div class="ste-qe-spacing-section">
                                <div class="ste-qe-spacing-title">padding</div>
                                <div class="ste-qe-spacing-grid">
                                    <label class="ste-qe-spacing-cell">上<input class="ste-qe-num" type="number" data-prop="padding-top" min="0"></label>
                                    <label class="ste-qe-spacing-cell">右<input class="ste-qe-num" type="number" data-prop="padding-right" min="0"></label>
                                    <label class="ste-qe-spacing-cell">下<input class="ste-qe-num" type="number" data-prop="padding-bottom" min="0"></label>
                                    <label class="ste-qe-spacing-cell">左<input class="ste-qe-num" type="number" data-prop="padding-left" min="0"></label>
                                </div>
                            </div>
                            <div class="ste-qe-spacing-section">
                                <div class="ste-qe-spacing-title">margin</div>
                                <div class="ste-qe-spacing-grid">
                                    <label class="ste-qe-spacing-cell">上<input class="ste-qe-num" type="number" data-prop="margin-top"></label>
                                    <label class="ste-qe-spacing-cell">右<input class="ste-qe-num" type="number" data-prop="margin-right"></label>
                                    <label class="ste-qe-spacing-cell">下<input class="ste-qe-num" type="number" data-prop="margin-bottom"></label>
                                    <label class="ste-qe-spacing-cell">左<input class="ste-qe-num" type="number" data-prop="margin-left"></label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="ste-qe-actions">
                        <button class="ste-deco-btn ste-deco-confirm" id="ste-qe-confirm" type="button">生成CSS</button>
                        <button class="ste-deco-btn ste-deco-cancel" id="ste-qe-reset" type="button">重置</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

// ============================================
// 模块状态
// ============================================

/** 面板是否已注入DOM */
let panelInjected = false;

/** 拖动状态 */
let dragState = { dragging: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };

/** HTML注入项的内存副本（编辑时操作这个，保存时写入存储） */
let currentInjections = [];

/** MutationObserver 实例（监听新消息加载） */
let chatObserver = null;

/** 已注入的HTML元素的记录（用于清除） */
let injectedElements = [];

/** 装饰模式：拖动/缩放交互状态（mode='drag'|'resize'|null） */
let decoState = { mode: null, startX: 0, startY: 0, initL: 0, initT: 0, initW: 0, initH: 0 };

/** 装饰模式：图片视觉属性（旋转/翻转/透明度/层级/放置模式/溢出） */
let decoProps = { rotation: 0, opacity: 1.0, flipH: false, flipV: false, zIndex: 100, placeMode: 'fixed', detectedSelector: '', detectedElement: null, overflow: true, coordMode: 'px' };

/** 装饰模式事件清理器（AbortController，防止事件泄漏） */
let decoAbort = null;

/** 布局编辑模式 AbortController（控制模式内所有监听器） */
let layoutAbort = null;

/** 布局编辑：当前悬停目标元素 */
let layoutHoverEl = null;

/** 布局编辑：高亮框 DOM 元素 */
let layoutHighlight = null;

/** 布局编辑：拖动/缩放中间状态 */
let layoutDragState = { mode: null, startX: 0, startY: 0, initL: 0, initT: 0, initW: 0, initH: 0 };

/** 布局编辑：当前选中的元素 */
let layoutSelected = null;

/** 布局编辑：当前操作属性（脱离文字流/坐标单位） */
let layoutEditProps = { outOfFlow: false, coordMode: 'px', opacity: null, rotation: 0, fontSize: null };

/** 快速编辑：选中元素后的初始快照（用于“仅收集变化项”和重置） */
let qeInitialSnapshot = null;

/** 快速编辑：文本输入防抖定时器 */
let qeInputDebounceTimer = null;

// ============================================
// 面板生命周期
// ============================================

/**
 * 初始化浮动面板（注入DOM + 绑定事件）
 * @async
 */
export async function initPanel() {
    if (panelInjected) return;

    // 注入面板HTML到body
    document.body.insertAdjacentHTML('beforeend', PANEL_HTML);
    panelInjected = true;

    // 绑定事件
    bindCloseButton();
    bindDrag();
    bindTabs();
    bindCSSInput();
    bindSchemeButtons();
    bindHTMLButtons();
    bindJSButtons();
    bindLayoutButtons();
    bindLayoutSubtabs();
    bindQuickEditEvents();

    // 加载数据
    await loadStorage();
    await refreshSchemeSelect();
    await loadActiveSchemeToUI();

    logger.info('themeEngine', '[Panel.init] 浮动面板初始化完成');
}

/**
 * 打开面板
 */
export function openPanel() {
    const panel = document.getElementById('ste-panel');
    if (panel) {
        panel.classList.add('visible');
        positionPanel();
    }
}

/**
 * 将面板定位到屏幕中心（JS计算，兼容手机小屏）
 *
 * @description
 * 用实际尺寸算居中位置，并限制不超出屏幕边界（留8px边距）。
 * 参考 chat-tools-hide.js 的 positionPanel() 实现。
 */
function positionPanel() {
    const panel = document.getElementById('ste-panel');
    if (!panel) return;

    const panelWidth = panel.offsetWidth || 680;
    const panelHeight = panel.offsetHeight || 500;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = (vw - panelWidth) / 2;
    let top = (vh - panelHeight) / 2;

    // 边界保护（留8px边距）
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (left + panelWidth > vw - 8) left = vw - panelWidth - 8;
    if (top + panelHeight > vh - 8) top = vh - panelHeight - 8;

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

/**
 * 关闭面板
 */
export function closePanel() {
    const panel = document.getElementById('ste-panel');
    if (panel) {
        // 关闭面板时退出交互模式（避免失去 UI 退出入口）
        exitLayoutMode();
        removeDecoOverlay();
        panel.classList.remove('visible');
    }
}

// ============================================
// CSS 实时注入（核心功能）
// ============================================

/**
 * 将CSS内容注入到页面（不防抖，直接赋值）
 *
 * @description
 * 参考 SillyTavern 官方 applyCustomCSS() 的做法：
 * 创建一个 <style> 标签，直接 style.innerHTML = content。
 * 用户输入什么，立刻就是什么。
 *
 * @param {string} css - CSS内容
 */
export function injectCSS(css) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.setAttribute('type', 'text/css');
        style.setAttribute('id', STYLE_ID);
    }
    style.innerHTML = css;
    document.head.appendChild(style);
    updateIconProtection();
}

/**
 * 从当前注入项列表中收集所有装饰CSS，注入到独立 style 标签
 *
 * @description
 * 装饰 CSS 与用户 CSS 分离，各自独立的 <style> 标签。
 * 这样用户编辑 CSS 输入框时，不会触发装饰 CSS 重注入，减少闪烁和重排。
 * 按 decoPriority 排序：first 排前（低优先级），last 排后（高优先级）。
 */
function syncDecoStyles() {
    let style = document.getElementById(DECO_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = DECO_STYLE_ID;
        document.head.appendChild(style);
    }

    const firstItems = [];
    const lastItems = [];
    for (const injection of currentInjections) {
        if (!injection.enabled || !injection.decoCSS) continue;
        if (injection.decoPriority === 'first') {
            firstItems.push(injection.decoCSS);
        } else {
            lastItems.push(injection.decoCSS);
        }
    }

    const merged = [...firstItems, ...lastItems].join('\n');
    if (!merged.trim()) {
        style.remove();
        return;
    }
    style.textContent = merged;
}

/**
 * 移除装饰CSS的独立 style 标签
 */
function removeDecoStyles() {
    const style = document.getElementById(DECO_STYLE_ID);
    if (style) style.remove();
}

/**
 * 从 CSS 输入框中删除指定装饰 id 对应的 CSS 块
 *
 * @description
 * 双位置清理：
 * 1. 从注入项的 decoCSS 字段清除（新版数据）
 * 2. 从 CSS 输入框中按正则清除（旧版兼容）
 *
 * @param {string} decoId - 装饰 id，如 ste-deco-1772634012584
 */
function removeCSSBlockById(decoId) {
    // 新版：清理注入项中的装饰CSS字段
    for (const injection of currentInjections) {
        if (injection.decoId === decoId) {
            injection.decoCSS = '';
            injection.decoId = '';
        }
    }
    syncDecoStyles();

    // 兼容旧数据：清理 CSS 输入框中的装饰块
    const cssInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('ste-css-input'));
    if (cssInput) {
        const pattern = new RegExp(`\\n?/\\* === 装饰: ${decoId}[^]*?\\n\\}\\n?`, 'g');
        const cleaned = cssInput.value.replace(pattern, '\n');
        if (cleaned !== cssInput.value) {
            cssInput.value = cleaned;
            injectCSS(cleaned);
            saveSchemeCSS(cleaned);
        }
    }
    logger.debug('themeEngine', '[装饰] 已清理装饰CSS:', decoId);
}

/**
 * 迁移旧版装饰数据
 *
 * @description
 * 旧版装饰的 CSS 混在 cssContent 里，注入项没有 decoCSS 字段。
 * 检测 cssContent 中的装饰注释块，提取到对应注入项的 decoCSS 字段。
 *
 * @param {import('./storage.js').ThemeScheme} scheme - 当前方案
 * @param {import('./storage.js').HtmlInjection[]} injections - 注入项列表
 * @returns {boolean} 是否执行了迁移
 */
function migrateOldDecorations(scheme, injections) {
    if (!scheme.cssContent) return false;

    let migrated = false;
    const decoPattern = /\n?\/\* === 装饰: (ste-deco-\d+)[^]*?\n\}\n?/g;
    let match;

    while ((match = decoPattern.exec(scheme.cssContent)) !== null) {
        const decoId = match[1];
        const cssBlock = match[0].trim();
        const injection = injections.find(i =>
            i.html?.includes(`class="${decoId}"`) || i.decoId === decoId
        );
        if (injection && !injection.decoCSS) {
            injection.decoCSS = cssBlock;
            injection.decoId = decoId;
            injection.decoPriority = 'last';
            migrated = true;
        }
    }

    if (migrated) {
        // 清理旧字段可以避免下次继续重复匹配和重复注入
        decoPattern.lastIndex = 0;
        scheme.cssContent = scheme.cssContent.replace(decoPattern, '').trim();
        logger.info('themeEngine', '[迁移] 已将旧版装饰CSS迁移到注入项');
    }
    return migrated;
}

/**
 * 更新 Font Awesome 图标保护样式
 *
 * @description
 * all:revert 会把 FA 图标的 font-family 等关键属性一并重置。
 * 检测用户 CSS 中是否使用了 all:revert，有则注入保护 CSS。
 */
function updateIconProtection() {
    const cssInput = document.getElementById('ste-css-input');
    const currentCSS = cssInput?.value || '';
    const hasRevert = /all\s*:\s*revert\b/i.test(currentCSS);
    const existing = document.getElementById(FA_PROTECTION_ID);

    if (hasRevert && !existing) {
        const style = document.createElement('style');
        style.id = FA_PROTECTION_ID;
        style.textContent = FA_PROTECTION_CSS;
        document.head.appendChild(style);
        logger.debug('themeEngine', '[Panel] FA 图标保护已启用（检测到 all:revert）');
    } else if (!hasRevert && existing) {
        existing.remove();
        logger.debug('themeEngine', '[Panel] FA 图标保护已移除');
    }
}

/**
 * 转义HTML特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ============================================
// 方案管理UI
// ============================================

/**
 * 刷新方案下拉框
 * @async
 */
async function refreshSchemeSelect() {
    const select = document.getElementById('ste-scheme-select');
    if (!select) return;

    const schemes = await getSchemeList();
    select.innerHTML = '';

    schemes.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = s.name;
        option.selected = s.isActive;
        select.appendChild(option);
    });
}

/**
 * 加载当前激活方案的所有数据到UI（CSS + HTML注入 + JS）
 * @async
 */
async function loadActiveSchemeToUI() {
    const scheme = await getActiveScheme();
    currentInjections = JSON.parse(JSON.stringify(scheme.htmlInjections || []));
    const didMigrate = migrateOldDecorations(scheme, currentInjections);

    // --- CSS ---
    const cssInput = document.getElementById('ste-css-input');
    if (cssInput) {
        cssInput.value = scheme.cssContent || '';
    }
    injectCSS(scheme.cssContent || '');
    // 遗留数据清理：删除旧版 CSS 开关数据
    if (scheme.disabledStyleSheets?.length > 0) {
        scheme.disabledStyleSheets = [];
        saveDebounced();
        logger.debug('themeEngine', '[loadUI] 清理旧版 disabledStyleSheets 数据');
    }
    if (didMigrate) {
        // 迁移后立即落盘，避免刷新后又回到旧结构
        saveSchemeCSS(scheme.cssContent || '');
        saveSchemeHTML(currentInjections);
    }

    // --- HTML注入 ---
    clearInjectedHTML();
    // 恢复装饰CSS（从注入项中收集）
    syncDecoStyles();
    renderHTMLList();
    applyAllHTMLInjections();

    // --- JS ---
    const jsInput = document.getElementById('ste-js-input');
    if (jsInput) {
        jsInput.value = scheme.jsContent || '';
    }
    const autoRunCheckbox = document.getElementById('ste-js-autorun');
    if (autoRunCheckbox) {
        autoRunCheckbox.checked = scheme.jsAutoRun || false;
    }
}

/**
 * 绑定方案管理按钮事件
 */
function bindSchemeButtons() {
    // 下拉框切换
    const select = document.getElementById('ste-scheme-select');
    if (select) {
        select.addEventListener('change', async () => {
            const id = select.value;
            await switchScheme(id);
            await loadActiveSchemeToUI();
            logger.info('themeEngine', '[Panel] 切换方案:', id);
        });
    }

    // 保存按钮
    const saveBtn = document.getElementById('ste-scheme-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const input = document.getElementById('ste-css-input');
            if (input) {
                await saveSchemeCSS(input.value);
                logger.info('themeEngine', '[Panel] 方案已保存');
            }
        });
    }

    // 另存为按钮（创建全新空白方案）
    const saveAsBtn = document.getElementById('ste-scheme-save-as');
    if (saveAsBtn) {
        saveAsBtn.addEventListener('click', async () => {
            const name = await callGenericPopup('输入新方案名称：', POPUP_TYPE.INPUT, '');
            if (!name) return;
            await createScheme(String(name));
            await refreshSchemeSelect();
            // 刷新UI到新方案的空白状态（同时清除旧HTML注入的DOM元素）
            await loadActiveSchemeToUI();
            logger.info('themeEngine', '[Panel] 新建方案:', name);
        });
    }

    // 删除按钮
    const deleteBtn = document.getElementById('ste-scheme-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const select = document.getElementById('ste-scheme-select');
            if (!select) return;
            const id = select.value;
            if (id === 'default') {
                await callGenericPopup('不能删除默认方案', POPUP_TYPE.TEXT);
                return;
            }
            const confirm = await callGenericPopup(`确定删除方案？`, POPUP_TYPE.CONFIRM);
            if (!confirm) return;
            await deleteScheme(id);
            await refreshSchemeSelect();
            await loadActiveSchemeToUI();
        });
    }

    // 重命名按钮
    const renameBtn = document.getElementById('ste-scheme-rename');
    if (renameBtn) {
        renameBtn.addEventListener('click', async () => {
            const select = document.getElementById('ste-scheme-select');
            if (!select) return;
            const id = select.value;
            const currentName = select.options[select.selectedIndex]?.textContent || '';
            const newName = await callGenericPopup('输入新名称：', POPUP_TYPE.INPUT, currentName);
            if (!newName) return;
            await renameScheme(id, String(newName));
            await refreshSchemeSelect();
        });
    }

    // 导出按钮
    const exportBtn = document.getElementById('ste-scheme-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            await exportCurrentScheme();
        });
    }

    // 导入按钮（点击触发hidden file input）
    const importBtn = document.getElementById('ste-scheme-import');
    const importFile = document.getElementById('ste-scheme-import-file');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });
        importFile.addEventListener('change', async (e) => {
            const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
            if (!file) return;
            await importSchemeFromFile(file);
            // 清空input，否则选同一个文件不会再触发change
            /** @type {HTMLInputElement} */ (e.target).value = '';
        });
    }
}

// ============================================
// 导入 / 导出
// ============================================

/**
 * 导出当前方案为JSON文件（触发浏览器下载）
 *
 * @description
 * 把当前方案的完整数据序列化为JSON，生成下载链接。
 * 文件名格式：ste-方案名-时间戳.json
 *
 * @async
 */
async function exportCurrentScheme() {
    try {
        const scheme = await getActiveScheme();
        // 构造导出数据（加版本号方便未来兼容）
        const exportData = {
            _format: 'ST-Theme-Engine-Scheme',
            _version: 1,
            name: scheme.name,
            cssContent: scheme.cssContent || '',
            htmlInjections: scheme.htmlInjections || [],
            jsContent: scheme.jsContent || '',
            jsAutoRun: false, // 安全策略：自动执行不跟随导出，防止恶意方案
            exportedAt: Date.now()
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // 创建临时下载链接
        const a = document.createElement('a');
        a.href = url;
        a.download = `ste-${scheme.name}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        logger.info('themeEngine', '[导出] 方案已导出:', scheme.name);
    } catch (error) {
        logger.error('themeEngine', '[导出] 导出失败:', error.message);
        await callGenericPopup('导出失败: ' + error.message, POPUP_TYPE.TEXT);
    }
}

/**
 * 从JSON文件导入方案（覆盖当前方案或创建新方案）
 *
 * @description
 * 读取用户选择的JSON文件，校验格式后，询问用户是覆盖当前方案还是创建新方案。
 * 导入后立即刷新UI并应用所有状态。
 *
 * @async
 * @param {File} file - 用户选择的JSON文件
 */
async function importSchemeFromFile(file) {
    try {
        const text = await file.text();
        const importData = JSON.parse(text);

        // 格式校验
        if (importData._format !== 'ST-Theme-Engine-Scheme') {
            await callGenericPopup('文件格式不对，不是ST-Theme-Engine的方案文件', POPUP_TYPE.TEXT);
            return;
        }

        // 询问用户：覆盖当前 or 创建新方案
        const overwrite = await callGenericPopup(
            `导入方案「${importData.name || '未命名'}」\n\n覆盖当前方案？（取消则创建新方案）`,
            POPUP_TYPE.CONFIRM
        );

        if (overwrite) {
            // 覆盖当前方案
            const scheme = await getActiveScheme();
            scheme.cssContent = importData.cssContent || '';
            scheme.htmlInjections = importData.htmlInjections || [];
            scheme.jsContent = importData.jsContent || '';
            scheme.jsAutoRun = false; // 安全策略：导入方案永不自动执行JS
            scheme.updatedAt = Date.now();
            await saveStorage();
        } else {
            // 创建新方案
            const newScheme = await createScheme(importData.name || '导入的方案');
            newScheme.cssContent = importData.cssContent || '';
            newScheme.htmlInjections = importData.htmlInjections || [];
            newScheme.jsContent = importData.jsContent || '';
            newScheme.jsAutoRun = false; // 安全策略：导入方案永不自动执行JS
            newScheme.updatedAt = Date.now();
            await saveStorage();
            await refreshSchemeSelect();
        }

        // 刷新UI
        await loadActiveSchemeToUI();
        // 如果导入的方案包含JS代码，提醒用户审查
        if (importData.jsContent && importData.jsContent.trim()) {
            toastr.warning(
                '该方案包含JS代码，已导入但未启用自动执行。请先审查JS内容后再手动开启。',
                'JS安全提示',
                { timeOut: 8000 }
            );
        }
        logger.info('themeEngine', '[导入] 方案已导入:', importData.name);
    } catch (error) {
        logger.error('themeEngine', '[导入] 导入失败:', error.message);
        await callGenericPopup('导入失败: ' + error.message, POPUP_TYPE.TEXT);
    }
}

// ============================================
// CSS输入框实时注入
// ============================================

/**
 * 绑定CSS输入框事件
 *
 * @description
 * 直接监听 input 事件，不防抖，立即注入。
 * 保存用防抖（300ms），避免频繁写文件。
 */
function bindCSSInput() {
    const input = document.getElementById('ste-css-input');
    if (!input) return;

    input.addEventListener('input', () => {
        // 实时注入CSS（不防抖）
        injectCSS(input.value);
        // 保存到存储（防抖）
        saveSchemeCSS(input.value);
    });
}

// ============================================
// 标签页切换
// ============================================

/**
 * 绑定标签页切换事件
 */
function bindTabs() {
    const tabs = document.querySelectorAll('#ste-panel .ste-tab');
    const contents = document.querySelectorAll('#ste-panel .ste-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            // 切换tab高亮
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // 切换内容
            contents.forEach(c => {
                c.classList.toggle('active', c.dataset.tab === target);
            });

        });
    });
}

// ============================================
// 面板拖动
// ============================================

/**
 * 绑定拖动事件（鼠标 + 触摸，支持手机端）
 *
 * @description
 * 使用 delta 方式计算偏移（跟 chat-tools-hide.js 一样）：
 * 记录起始点和面板初始位置，移动时算偏移量。
 * 边界限制确保面板不会被拖出屏幕。
 */
function bindDrag() {
    const header = document.getElementById('ste-panel-header');
    const panel = document.getElementById('ste-panel');
    if (!header || !panel) return;

    /**
     * 开始拖动
     * @param {number} clientX
     * @param {number} clientY
     */
    function startDrag(clientX, clientY) {
        dragState.dragging = true;
        dragState.startX = clientX;
        dragState.startY = clientY;
        const rect = panel.getBoundingClientRect();
        dragState.initialLeft = rect.left;
        dragState.initialTop = rect.top;
    }

    /**
     * 移动中
     * @param {number} clientX
     * @param {number} clientY
     */
    function moveDrag(clientX, clientY) {
        if (!dragState.dragging) return;
        const deltaX = clientX - dragState.startX;
        const deltaY = clientY - dragState.startY;

        let newLeft = dragState.initialLeft + deltaX;
        let newTop = dragState.initialTop + deltaY;

        // 边界限制
        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
    }

    function endDrag() {
        dragState.dragging = false;
    }

    // --- 鼠标事件 ---
    header.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest('#ste-panel-close')) return;
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation(); // 阻止冒泡到document，防止触发SillyTavern抽屉收起
    });
    document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);

    // --- 触摸事件（手机端） ---
    header.addEventListener('touchstart', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest('#ste-panel-close')) return;
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
        // 不 preventDefault，否则会阻止面板内的滚动
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!dragState.dragging) return;
        const touch = e.touches[0];
        moveDrag(touch.clientX, touch.clientY);
        e.preventDefault(); // 拖动中阻止页面滚动
    }, { passive: false });
    document.addEventListener('touchend', endDrag);
}

/**
 * 绑定关闭按钮
 */
function bindCloseButton() {
    const closeBtn = document.getElementById('ste-panel-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePanel);
    }
}

// ============================================
// 扩展初始化时恢复CSS注入
// ============================================

/**
 * 恢复上次保存的所有状态（扩展加载时调用，不需要面板打开）
 * @async
 */
export async function restoreSavedState() {
    try {
        const scheme = await getActiveScheme();
        currentInjections = JSON.parse(JSON.stringify(scheme.htmlInjections || []));
        const didMigrate = migrateOldDecorations(scheme, currentInjections);

        // 恢复CSS注入
        injectCSS(scheme.cssContent || '');
        if (didMigrate) {
            await saveSchemeCSS(scheme.cssContent || '');
            await saveSchemeHTML(currentInjections);
        }
        logger.info('themeEngine', '[restore] 已恢复CSS注入');

        // 恢复HTML注入
        if (currentInjections.length > 0) {
            applyAllHTMLInjections();
            logger.info('themeEngine', '[restore] 已恢复HTML注入');
        }
        syncDecoStyles();
        logger.info('themeEngine', '[restore] 已恢复装饰CSS');

        // JS自动执行
        if (scheme.jsAutoRun && scheme.jsContent) {
            executeJS(scheme.jsContent);
            logger.info('themeEngine', '[restore] 已自动执行JS');
        }
    } catch (error) {
        logger.error('themeEngine', '[restore] 恢复失败:', error.message);
    }
}

// ============================================
// L2: HTML注入
// ============================================

/**
 * 清除所有已注入的HTML元素
 */
function clearInjectedHTML() {
    if (chatObserver) {
        // 先清空已排队但尚未执行的变更记录，再断开观察器，避免回调补注入
        chatObserver.takeRecords();
        stopChatObserver();
    }

    for (const el of injectedElements) {
        try { el.remove(); } catch (e) { /* 已不在DOM中 */ }
    }
    injectedElements = [];
    document.querySelectorAll('[data-ste-injected]').forEach(el => {
        try { el.remove(); } catch (e) {}
    });
}

/**
 * 应用所有启用的HTML注入项
 */
function applyAllHTMLInjections() {
    clearInjectedHTML();
    for (const injection of currentInjections) {
        if (!injection.enabled) continue;
        applyOneInjection(injection);
    }
    // 如果有任何注入项需要监听新消息，启动Observer
    if (currentInjections.some(i => i.enabled && i.observeChat)) {
        startChatObserver();
    }
}

/**
 * 应用单个注入项
 * @param {import('./storage.js').HtmlInjection} injection
 */
function applyOneInjection(injection) {
    try {
        const targets = document.querySelectorAll(injection.selector);
        if (targets.length === 0) {
            logger.debug('themeEngine', `[HTML注入] 选择器未匹配: ${injection.selector}`);
            return;
        }
        targets.forEach(target => {
            if (!passesMessageGuard(injection.selector, target)) return;
            // 去重：同一注入项不重复注入到同一目标
            if (target.querySelector(`[data-ste-injected="${injection.id}"]`)) return;
            // 用临时容器解析HTML，方便记录元素引用
            const temp = document.createElement('div');
            temp.innerHTML = injection.html;
            while (temp.firstChild) {
                const node = temp.firstChild;
                // 给注入的元素打标记，方便清除
                if (node.nodeType === Node.ELEMENT_NODE) {
                    /** @type {HTMLElement} */ (node).dataset.steInjected = injection.id;
                }
                target.insertAdjacentElement(
                    injection.position || 'beforeend',
                    /** @type {Element} */ (node)
                );
                if (node.nodeType === Node.ELEMENT_NODE) {
                    injectedElements.push(node);
                }
            }
        });
        logger.debug('themeEngine', `[HTML注入] 已注入: ${injection.selector} (${targets.length}个目标)`);
    } catch (error) {
        logger.error('themeEngine', `[HTML注入] 失败:`, error.message);
    }
}

/**
 * 检查注入目标是否通过消息语义守卫
 *
 * @description
 * 如果注入选择器涉及 is_user 过滤（如 :not([is_user='true'])），
 * 则验证目标元素最近的 .mes 节点确实具有对应属性值。
 * 防止属性缺失的节点被 :not() 误匹配。
 *
 * @param {string} selector - 注入项的 CSS 选择器
 * @param {Element} target - 待注入的目标元素
 * @returns {boolean} true=允许注入, false=跳过
 */
function passesMessageGuard(selector, target) {
    // 不涉及 is_user 的选择器，直接放行
    if (!selector.includes('is_user')) return true;

    const mes = target.closest('.mes');
    if (!mes) return true; // 非消息上下文，放行

    // 确认 .mes 节点有 is_user 属性（缺失则跳过）
    if (!mes.hasAttribute('is_user')) {
        logger.debug('themeEngine', '[HTML注入] 跳过：.mes 节点缺少 is_user 属性');
        return false;
    }

    // 拦截消息模板和非真实消息节点
    // SillyTavern 的消息模板 is_user="" mesid=""，不应被注入
    if (!mes.closest('#chat')) {
        logger.debug('themeEngine', '[HTML注入] 跳过：目标不在 #chat 容器内（可能是消息模板）');
        return false;
    }

    const isUser = mes.getAttribute('is_user');
    // 如果选择器要求 非用户消息，检查 is_user 确实不是 'true'
    if (selector.includes(':not([is_user') && isUser === 'true') return false;
    // 如果选择器要求 用户消息，检查 is_user 确实是 'true'
    if (selector.includes("[is_user='true']") && !selector.includes(':not(') && isUser !== 'true') return false;

    return true;
}

/**
 * 启动MutationObserver监听新消息
 *
 * @description
 * 监听 #chat 容器的子节点变化。新消息加载时，对所有设置了
 * observeChat=true 的注入项，在新消息元素内重新执行注入。
 */
function startChatObserver() {
    stopChatObserver();
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    chatObserver = new MutationObserver((mutations) => {
        // 延迟一帧执行，确保 ST 完成消息节点属性设置
        requestAnimationFrame(() => {
            // 收集本批次所有新增的 .mes 节点（去重）
            const newMesNodes = [];
            const seen = new Set();
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    // 只处理 .mes 消息节点，跳过其他直接子节点（如 #show_more_messages）
                    if (node.classList.contains('mes')) {
                        if (!seen.has(node)) {
                            seen.add(node);
                            newMesNodes.push(node);
                        }
                    }
                }
            }
            if (newMesNodes.length === 0) return;

            for (const mesNode of newMesNodes) {
                // 防御性检查：跳过不在 #chat 中的节点
                if (!mesNode.closest('#chat')) continue;

                // 节点级 is_user 属性读取（一次，供所有注入项共用）
                const isUserAttr = mesNode.getAttribute('is_user');

                for (const injection of currentInjections) {
                    if (!injection.enabled || !injection.observeChat) continue;
                    try {
                        // 节点级过滤：选择器要求非用户消息，但节点是用户消息 → 跳过
                        if (injection.selector.includes(':not([is_user') && isUserAttr === 'true') continue;
                        // 节点级过滤：选择器要求用户消息，但节点是角色消息 → 跳过
                        if (injection.selector.includes("[is_user='true']") &&
                            !injection.selector.includes(':not(') && isUserAttr !== 'true') continue;
                        // 节点级过滤：节点缺少 is_user 属性且选择器涉及 is_user → 跳过
                        if (injection.selector.includes('is_user') && !mesNode.hasAttribute('is_user')) continue;

                        // 在该 .mes 节点内部查找匹配目标
                        const targets = mesNode.querySelectorAll(injection.selector);
                        // 也检查节点自身是否匹配（极少见，但兼容非 .mes 内部选择器的情况）
                        const selfMatch = mesNode.matches?.(injection.selector);
                        const allTargets = selfMatch ? [mesNode, ...targets] : [...targets];

                        allTargets.forEach(target => {
                            if (!passesMessageGuard(injection.selector, target)) return;
                            // 去重：同一注入项不重复注入到同一目标
                            if (target.querySelector(`[data-ste-injected="${injection.id}"]`)) return;
                            const temp = document.createElement('div');
                            temp.innerHTML = injection.html;
                            while (temp.firstChild) {
                                const child = temp.firstChild;
                                if (child.nodeType === Node.ELEMENT_NODE) {
                                    /** @type {HTMLElement} */ (child).dataset.steInjected = injection.id;
                                }
                                target.insertAdjacentElement(
                                    injection.position || 'beforeend',
                                    /** @type {Element} */ (child)
                                );
                                if (child.nodeType === Node.ELEMENT_NODE) {
                                    injectedElements.push(child);
                                }
                            }
                        });
                    } catch (e) { /* 静默失败 */ }
                }
            }
        });
    });

    chatObserver.observe(chatContainer, { childList: true });
    logger.debug('themeEngine', '[HTML注入] MutationObserver 已启动');
}

/**
 * 停止MutationObserver
 */
function stopChatObserver() {
    if (chatObserver) {
        chatObserver.disconnect();
        chatObserver = null;
    }
}

/**
 * 渲染HTML注入项列表到面板
 */
function renderHTMLList() {
    const container = document.getElementById('ste-html-list');
    if (!container) return;
    container.innerHTML = '';

    if (currentInjections.length === 0) {
        container.innerHTML = '<div class="ste-placeholder">没有注入项，点“添加”创建一个</div>';
        return;
    }

    currentInjections.forEach((injection, index) => {
        const item = document.createElement('div');
        item.className = 'ste-html-item ste-html-item-collapsed';

        const isDecoInjection = Boolean(injection.decoCSS || injection.decoId);
        const priority = injection.decoPriority === 'first' ? 'first' : 'last';
        const priorityText = priority === 'first' ? '前' : '后';
        const cnName = getSelectorName(injection.selector);
        const titleDisplay = cnName
            ? `${escapeHtml(injection.selector || '')} <span class="ste-html-cn-name">${cnName}</span>`
            : escapeHtml(injection.selector || '新注入项');

        item.innerHTML = `
            <div class="ste-html-item-header">
                <i class="fa-solid fa-chevron-right ste-html-toggle-icon"></i>
                <input type="checkbox" class="ste-html-enable" ${injection.enabled ? 'checked' : ''} title="启用/禁用">
                <span class="ste-html-item-title">${titleDisplay}</span>
                <span class="ste-html-item-pos">${injection.position || 'beforeend'}</span>
                <label class="ste-html-observe-label" title="对新加载的消息也注入">
                    <input type="checkbox" class="ste-html-observe" ${injection.observeChat ? 'checked' : ''}> 监听
                </label>
                ${isDecoInjection ? `<button class="ste-deco-priority-btn" title="装饰CSS优先级">${priorityText}</button>` : ''}
                <button class="ste-toolbar-btn ste-html-delete" title="删除"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="ste-html-item-body">
                <input type="text" class="ste-html-selector" placeholder="CSS选择器，如 .mes .mes_block" value="${escapeHtml(injection.selector || '')}">
                <textarea class="ste-html-content" placeholder="HTML内容，如 <div class='my-deco'></div>">${escapeHtml(injection.html || '')}</textarea>
                ${isDecoInjection
                    ? `<textarea class="ste-deco-css-input" placeholder="装饰CSS（可编辑，实时生效）">${escapeHtml(injection.decoCSS || '')}</textarea>`
                    : ''}
            </div>
        `;
        container.appendChild(item);

        const header = item.querySelector('.ste-html-item-header');
        const enableCb = /** @type {HTMLInputElement|null} */ (item.querySelector('.ste-html-enable'));
        const observeCb = /** @type {HTMLInputElement|null} */ (item.querySelector('.ste-html-observe'));
        const selectorInput = /** @type {HTMLInputElement|null} */ (item.querySelector('.ste-html-selector'));
        const contentArea = /** @type {HTMLTextAreaElement|null} */ (item.querySelector('.ste-html-content'));
        const decoCssInput = /** @type {HTMLTextAreaElement|null} */ (item.querySelector('.ste-deco-css-input'));
        const priorityBtn = /** @type {HTMLButtonElement|null} */ (item.querySelector('.ste-deco-priority-btn'));
        const deleteBtn = item.querySelector('.ste-html-delete');

        // 点击头部折叠/展开；忽略按钮/输入控件点击，避免误触
        header?.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.closest('button, input, label, textarea')) return;
            item.classList.toggle('ste-html-item-collapsed');
        });

        enableCb?.addEventListener('change', () => {
            currentInjections[index].enabled = enableCb.checked;
            saveAndApplyHTML();
        });
        observeCb?.addEventListener('change', () => {
            currentInjections[index].observeChat = observeCb.checked;
            saveAndApplyHTML();
        });
        selectorInput?.addEventListener('input', () => {
            currentInjections[index].selector = selectorInput.value;
            const title = item.querySelector('.ste-html-item-title');
            if (title) {
                const cn = getSelectorName(selectorInput.value);
                title.innerHTML = cn
                    ? `${escapeHtml(selectorInput.value)} <span class="ste-html-cn-name">${cn}</span>`
                    : escapeHtml(selectorInput.value || '新注入项');
            }
            saveSchemeHTML(currentInjections);
        });
        contentArea?.addEventListener('input', () => {
            currentInjections[index].html = contentArea.value;
            saveSchemeHTML(currentInjections);
        });
        decoCssInput?.addEventListener('input', () => {
            currentInjections[index].decoCSS = decoCssInput.value;
            saveSchemeHTML(currentInjections);
            syncDecoStyles();
        });
        priorityBtn?.addEventListener('click', () => {
            const next = currentInjections[index].decoPriority === 'first' ? 'last' : 'first';
            currentInjections[index].decoPriority = next;
            priorityBtn.textContent = next === 'first' ? '前' : '后';
            saveSchemeHTML(currentInjections);
            syncDecoStyles();
        });
        deleteBtn?.addEventListener('click', () => {
            const decoId = currentInjections[index]?.decoId || '';
            if (decoId) {
                removeCSSBlockById(decoId);
            } else {
                const html = currentInjections[index]?.html || '';
                const decoMatch = html.match(/class="(ste-deco-\d+)"/);
                if (decoMatch) removeCSSBlockById(decoMatch[1]);
            }
            currentInjections.splice(index, 1);
            saveAndApplyHTML();
            renderHTMLList();
        });
    });
}

/**
 * 保存并重新应用所有HTML注入
 */
function saveAndApplyHTML() {
    saveSchemeHTML(currentInjections);
    applyAllHTMLInjections();
    syncDecoStyles();
}

/**
 * 绑定HTML标签页的按钮事件
 */
function bindHTMLButtons() {
    // 添加按钮
    const addBtn = document.getElementById('ste-html-add');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            currentInjections.push({
                id: `inj-${Date.now()}`,
                selector: '',
                position: 'beforeend',
                html: '',
                enabled: true,
                observeChat: false
            });
            saveSchemeHTML(currentInjections);
            renderHTMLList();
        });
    }

    // 应用按钮
    const applyBtn = document.getElementById('ste-html-apply');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            applyAllHTMLInjections();
            logger.info('themeEngine', '[Panel] HTML注入已应用');
        });
    }

    // 清除按钮
    const clearBtn = document.getElementById('ste-html-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearInjectedHTML();
            logger.info('themeEngine', '[Panel] 已清除所有注入的HTML');
        });
    }

    // 常用选择器快速添加按钮
    const quickAddBtn = document.getElementById('ste-html-quick-add');
    if (quickAddBtn) {
        quickAddBtn.addEventListener('click', async () => {
            logger.info('themeEngine', '[Panel] 常用按钮被点击');
            await showQuickAddPopup();
        });
    } else {
        logger.warn('themeEngine', '[Panel] 未找到ste-html-quick-add按钮');
    }

    // 可视化装饰按钮
    const decoBtn = document.getElementById('ste-html-deco');
    if (decoBtn) {
        decoBtn.addEventListener('click', startDecorationMode);
    }
}

/**
 * 显示常用选择器快速添加弹窗
 *
 * @description
 * 按分类列出常用CSS选择器，用户点击后创建对应的注入项。
 *
 * @async
 */
async function showQuickAddPopup() {
    try {
        const groups = getCommonSelectors();

        // 构造弹窗HTML
        let html = '<div style="max-height:60vh;overflow-y:auto;">';
        groups.forEach(group => {
            html += `<h4 style="margin:8px 0 4px;opacity:0.7;font-size:0.9em;">${group.category}</h4>`;
            html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">';
            group.items.forEach(item => {
                html += `<button class="ste-quick-selector-btn menu_button interactable"
                    data-selector="${escapeHtml(item.selector)}"
                    style="padding:4px 10px;font-size:0.85em;cursor:pointer;border-radius:4px;
                    border:1px solid var(--SmartThemeBorderColor,#555);background:transparent;color:inherit;"
                    title="${escapeHtml(item.selector)}">
                    ${escapeHtml(item.name)}
                </button>`;
            });
            html += '</div>';
        });
        html += '</div>';

        // 显示弹窗（不await，让DOM先渲染出来）
        const popupPromise = callGenericPopup(html, POPUP_TYPE.TEXT);

        // 立即绑定点击事件（弹窗内容已插入DOM）
        document.querySelectorAll('.ste-quick-selector-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const selector = /** @type {HTMLElement} */ (btn).dataset.selector || '';
                currentInjections.push({
                    id: `inj-${Date.now()}`,
                    selector: selector,
                    position: 'beforeend',
                    html: '',
                    enabled: true,
                    observeChat: false
                });
                saveSchemeHTML(currentInjections);
                renderHTMLList();
                logger.info('themeEngine', '[Panel] 快速添加注入项:', selector);
            });
        });

        await popupPromise;
    } catch (err) {
        logger.error('themeEngine', '[Panel] 快速添加弹窗出错:', err);
    }
}

// ============================================
// L3: JS执行
// ============================================

/**
 * 执行用户输入的JavaScript
 *
 * @description
 * 使用 new Function() 执行。私人使用，不做安全限制。
 * 支持 async/await（包装在 async function 里）。
 *
 * @param {string} code - 用户的JS代码
 */
function executeJS(code) {
    if (!code || !code.trim()) return;
    try {
        const fn = new Function(`return (async () => { ${code} })()`);
        const result = fn();
        // 捕获 async 函数的 Promise 拒绝
        if (result && typeof result.catch === 'function') {
            result.catch(err => {
                logger.error('themeEngine', '[JS执行] 异步错误:', err.message || err);
                toastr.error('JS 异步执行出错: ' + (err.message || err));
            });
        }
        logger.info('themeEngine', '[JS执行] 执行成功');
    } catch (error) {
        logger.error('themeEngine', '[JS执行] 执行失败:', error.message);
    }
}

/**
 * 绑定JS标签页的事件
 */
function bindJSButtons() {
    // 执行按钮
    const runBtn = document.getElementById('ste-js-run');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            const input = document.getElementById('ste-js-input');
            if (input) {
                executeJS(input.value);
            }
        });
    }

    // JS输入框内容变化时保存（防抖）
    const jsInput = document.getElementById('ste-js-input');
    if (jsInput) {
        jsInput.addEventListener('input', () => {
            saveSchemeJS(jsInput.value);
        });
    }

    // 自动执行开关
    const autoRunCb = document.getElementById('ste-js-autorun');
    if (autoRunCb) {
        autoRunCb.addEventListener('change', () => {
            saveSchemeJSAutoRun(autoRunCb.checked);
            if (autoRunCb.checked) {
                toastr.warning('已开启自动执行。导入他人方案时请注意审查JS代码安全性。');
            }
        });
    }
}

// ============================================
// 可视化装饰（贴图功能）
// ============================================

/**
 * 启动装饰模式：弹窗输入URL → 预加载图片 → 创建可拖动预览浮层
 *
 * @description
 * 用户输入图片URL后，先预加载获取原始尺寸（上限150px等比缩放），
 * 然后在屏幕中央创建可拖动、可缩放的预览浮层，带控件栏。
 *
 * @async
 */
async function startDecorationMode() {
    const url = await callGenericPopup('输入图片URL：', POPUP_TYPE.INPUT, 'https://');
    if (!url || !String(url).trim()) return;
    const imageUrl = String(url).trim();

    const img = new Image();
    img.onload = () => {
        const ratio = Math.min(150 / img.naturalWidth, 150 / img.naturalHeight, 1);
        createDecoOverlay(imageUrl, Math.round(img.naturalWidth * ratio), Math.round(img.naturalHeight * ratio));
    };
    img.onerror = () => callGenericPopup('图片加载失败，请检查URL', POPUP_TYPE.TEXT);
    img.src = imageUrl;
}

/**
 * 创建装饰预览浮层（拖动 + 缩放 + 旋转/翻转/透明度/层级 + 双模式放置）
 *
 * @description
 * 浮层结构：图片预览 + 右下角缩放手柄 + 底部控件面板。
 * 控件面板包含：旋转(±15°)、水平/垂直翻转、透明度滑块、z-index输入、
 * 屏幕固定/元素吸附模式切换、确认/取消按钮。
 * 元素吸附模式下，每次拖动结束自动检测装饰中心下方的DOM元素。
 *
 * @param {string} imageUrl - 图片URL
 * @param {number} w - 初始宽度(px)
 * @param {number} h - 初始高度(px)
 */
function createDecoOverlay(imageUrl, w, h) {
    removeDecoOverlay();
    decoAbort = new AbortController();
    const signal = decoAbort.signal;
    decoProps = { rotation: 0, opacity: 1.0, flipH: false, flipV: false, zIndex: 100, placeMode: 'fixed', detectedSelector: '', detectedElement: null, overflow: true, coordMode: 'px' };

    const overlay = document.createElement('div');
    overlay.id = 'ste-deco-overlay';
    overlay.className = 'ste-deco-overlay';
    overlay.style.cssText = `left:${(window.innerWidth - w) / 2}px;top:${(window.innerHeight - h) / 2}px;width:${w}px;height:${h}px;`;
    overlay.innerHTML = `
        <img class="ste-deco-preview-img" src="${escapeHtml(imageUrl)}" draggable="false">
        <div class="ste-deco-resize-handle"></div>
        <div class="ste-deco-controls">
            <div class="ste-deco-row">
                <button class="ste-deco-ctrl" data-action="rotate-left" title="左旋15°"><i class="fa-solid fa-rotate-left"></i></button>
                <button class="ste-deco-ctrl" data-action="rotate-right" title="右旋15°"><i class="fa-solid fa-rotate-right"></i></button>
                <button class="ste-deco-ctrl" data-action="flip-h" title="水平翻转"><i class="fa-solid fa-arrows-left-right"></i></button>
                <button class="ste-deco-ctrl" data-action="flip-v" title="垂直翻转"><i class="fa-solid fa-arrows-up-down"></i></button>
                <span class="ste-deco-sep"></span>
                <span class="ste-deco-lbl">透明</span>
                <button class="ste-deco-ctrl" data-action="opacity-down" title="-0.1"><i class="fa-solid fa-minus"></i></button>
                <span class="ste-deco-val" data-val="opacity">1.0</span>
                <button class="ste-deco-ctrl" data-action="opacity-up" title="+0.1"><i class="fa-solid fa-plus"></i></button>
                <span class="ste-deco-sep"></span>
                <span class="ste-deco-lbl">层级</span>
                <input type="number" class="ste-deco-num" data-prop="zindex" value="100">
            </div>
            <div class="ste-deco-row">
                <button class="ste-deco-ctrl ste-deco-mode-btn active" data-mode="fixed" title="固定在屏幕位置"><i class="fa-solid fa-thumbtack"></i> 屏幕固定</button>
                <button class="ste-deco-ctrl ste-deco-mode-btn" data-mode="element" title="吸附到下方元素"><i class="fa-solid fa-magnet"></i> 元素吸附</button>
                <button class="ste-deco-ctrl active" data-action="toggle-overflow" title="允许装饰溢出元素边界"><i class="fa-solid fa-expand"></i> 溢出</button>
                <button class="ste-deco-ctrl ste-deco-coord-btn active" data-coord="px" title="像素定位：top/left/right/bottom 用px">px</button>
                <button class="ste-deco-ctrl ste-deco-coord-btn" data-coord="%" title="百分比定位：位置随元素缩放">%</button>
                <span class="ste-deco-detected"></span>
            </div>
            <div class="ste-deco-row ste-deco-actions">
                <button class="ste-deco-btn ste-deco-confirm" title="确认放置"><i class="fa-solid fa-check"></i></button>
                <button class="ste-deco-btn ste-deco-cancel" title="取消"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const resizeHandle = overlay.querySelector('.ste-deco-resize-handle');
    // 排除控件区域的选择器，防止拖动冲突
    const noStartSel = '.ste-deco-resize-handle, .ste-deco-btn, .ste-deco-ctrl, .ste-deco-controls input';

    // --- 鼠标拖动 ---
    overlay.addEventListener('mousedown', (e) => {
        if (/** @type {HTMLElement} */ (e.target).closest(noStartSel)) return;
        decoState = { mode: 'drag', startX: e.clientX, startY: e.clientY,
            initL: overlay.offsetLeft, initT: overlay.offsetTop, initW: 0, initH: 0 };
        e.preventDefault();
        e.stopPropagation(); // 阻止冒泡到document，防止触发SillyTavern抽屉收起
    }, { signal });

    // --- 鼠标缩放 ---
    resizeHandle.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => {
        decoState = { mode: 'resize', startX: e.clientX, startY: e.clientY,
            initL: 0, initT: 0, initW: overlay.offsetWidth, initH: overlay.offsetHeight };
        e.preventDefault();
        e.stopPropagation();
    }, { signal });

    // --- 全局鼠标移动/释放 ---
    document.addEventListener('mousemove', (e) => {
        if (!decoState.mode) return;
        if (decoState.mode === 'drag') {
            overlay.style.left = `${decoState.initL + e.clientX - decoState.startX}px`;
            overlay.style.top = `${decoState.initT + e.clientY - decoState.startY}px`;
        } else {
            const dx = e.clientX - decoState.startX;
            const ratio = decoState.initH / decoState.initW;
            const newW = Math.max(20, decoState.initW + dx);
            overlay.style.width = `${newW}px`;
            overlay.style.height = `${newW * ratio}px`;
        }
    }, { signal });
    document.addEventListener('mouseup', () => {
        if (decoState.mode === 'drag' && decoProps.placeMode === 'element') {
            detectElementUnder(overlay);
        }
        decoState.mode = null;
    }, { signal });

    // --- 触摸拖动 ---
    overlay.addEventListener('touchstart', (e) => {
        if (/** @type {HTMLElement} */ (e.target).closest(noStartSel)) return;
        const t = e.touches[0];
        decoState = { mode: 'drag', startX: t.clientX, startY: t.clientY,
            initL: overlay.offsetLeft, initT: overlay.offsetTop, initW: 0, initH: 0 };
    }, { passive: true, signal });

    resizeHandle.addEventListener('touchstart', (/** @type {TouchEvent} */ e) => {
        const t = e.touches[0];
        decoState = { mode: 'resize', startX: t.clientX, startY: t.clientY,
            initL: 0, initT: 0, initW: overlay.offsetWidth, initH: overlay.offsetHeight };
        e.stopPropagation();
    }, { passive: true, signal });

    document.addEventListener('touchmove', (e) => {
        if (!decoState.mode) return;
        const t = e.touches[0];
        if (decoState.mode === 'drag') {
            overlay.style.left = `${decoState.initL + t.clientX - decoState.startX}px`;
            overlay.style.top = `${decoState.initT + t.clientY - decoState.startY}px`;
        } else {
            const dx = t.clientX - decoState.startX;
            const ratio = decoState.initH / decoState.initW;
            const newW = Math.max(20, decoState.initW + dx);
            overlay.style.width = `${newW}px`;
            overlay.style.height = `${newW * ratio}px`;
        }
        e.preventDefault();
    }, { passive: false, signal });
    document.addEventListener('touchend', () => {
        if (decoState.mode === 'drag' && decoProps.placeMode === 'element') {
            detectElementUnder(overlay);
        }
        decoState.mode = null;
    }, { signal });

    // --- 旋转/翻转按钮 ---
    overlay.querySelectorAll('.ste-deco-ctrl[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = /** @type {HTMLElement} */ (btn).dataset.action;
            if (action === 'rotate-left') decoProps.rotation -= 15;
            else if (action === 'rotate-right') decoProps.rotation += 15;
            else if (action === 'flip-h') decoProps.flipH = !decoProps.flipH;
            else if (action === 'flip-v') decoProps.flipV = !decoProps.flipV;
            else if (action === 'opacity-down') decoProps.opacity = Math.max(0, +(decoProps.opacity - 0.1).toFixed(1));
            else if (action === 'opacity-up') decoProps.opacity = Math.min(1, +(decoProps.opacity + 0.1).toFixed(1));
            else if (action === 'toggle-overflow') {
                decoProps.overflow = !decoProps.overflow;
                btn.classList.toggle('active', decoProps.overflow);
            }
            const opVal = overlay.querySelector('[data-val="opacity"]');
            if (opVal) opVal.textContent = decoProps.opacity.toFixed(1);
            updateDecoPreview(overlay);
        }, { signal });
    });

    // --- 层级输入 ---
    const zInput = overlay.querySelector('[data-prop="zindex"]');
    if (zInput) {
        zInput.addEventListener('input', () => {
            decoProps.zIndex = parseInt(/** @type {HTMLInputElement} */ (zInput).value, 10) || 100;
        }, { signal });
    }

    // --- 模式切换（屏幕固定 / 元素吸附） ---
    overlay.querySelectorAll('.ste-deco-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = /** @type {HTMLElement} */ (btn).dataset.mode;
            decoProps.placeMode = mode;
            overlay.querySelectorAll('.ste-deco-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (mode === 'element') {
                detectElementUnder(overlay);
            } else {
                const det = overlay.querySelector('.ste-deco-detected');
                if (det) det.textContent = '';
                decoProps.detectedSelector = '';
            }
        }, { signal });
    });

    // --- 坐标单位切换（px / %） ---
    overlay.querySelectorAll('.ste-deco-coord-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            decoProps.coordMode = /** @type {HTMLElement} */ (btn).dataset.coord;
            overlay.querySelectorAll('.ste-deco-coord-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }, { signal });
    });

    // --- 确认/取消 ---
    overlay.querySelector('.ste-deco-confirm').addEventListener('click',
        () => confirmDecoration(overlay, imageUrl), { signal });
    overlay.querySelector('.ste-deco-cancel').addEventListener('click',
        removeDecoOverlay, { signal });

    logger.debug('themeEngine', '[装饰] 预览浮层已创建:', imageUrl);
}

/**
 * 更新装饰预览图的视觉效果（旋转、翻转、透明度）
 * @param {HTMLElement} overlay - 预览浮层
 */
function updateDecoPreview(overlay) {
    const img = /** @type {HTMLElement} */ (overlay.querySelector('.ste-deco-preview-img'));
    if (!img) return;
    const sx = decoProps.flipH ? -1 : 1;
    const sy = decoProps.flipV ? -1 : 1;
    img.style.transform = `rotate(${decoProps.rotation}deg) scale(${sx}, ${sy})`;
    img.style.opacity = String(decoProps.opacity);
}

/**
 * 检测装饰中心下方的DOM元素，更新检测结果显示
 *
 * @description
 * 暂时隐藏浮层 → elementFromPoint 取中心点下方元素 →
 * 生成简短选择器 → 显示在控件栏。
 * 同时把实际元素引用存入 decoProps.detectedElement，
 * 避免 confirmDecoration 用 querySelector 拿到错误的第一个同类元素。
 *
 * @param {HTMLElement} overlay - 预览浮层
 */
function detectElementUnder(overlay) {
    const rect = overlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    overlay.style.display = 'none';
    const el = document.elementFromPoint(cx, cy);
    overlay.style.display = '';

    const detected = overlay.querySelector('.ste-deco-detected');
    if (!el || el === document.body || el === document.documentElement) {
        decoProps.detectedSelector = '';
        decoProps.detectedElement = null;
        if (detected) detected.textContent = '(未检测到元素)';
        return;
    }

    // void 元素（img/input/video 等）不能有子节点，自动往上取父元素
    const VOID_TAGS = new Set(['IMG', 'INPUT', 'VIDEO', 'CANVAS', 'AUDIO', 'IFRAME', 'EMBED', 'BR', 'HR']);
    const baseEl = VOID_TAGS.has(el.tagName) ? (el.parentElement || el) : el;

    // .avatar 内所有 img 都会被 SillyTavern 的 `.avatar img` 规则强制套头像样式（尺寸/圆角/阴影），
    // 注入到 .avatar 里会破坏头像外观，改为步进到 mesAvatarWrapper
    const avatarEl = baseEl.classList.contains('avatar') ? baseEl : baseEl.closest('.avatar');
    if (avatarEl) {
        const avatarWrapper = avatarEl.closest('.mesAvatarWrapper');
        if (avatarWrapper) {
            const selector = buildSimpleSelector(avatarWrapper);
            decoProps.detectedSelector = selector;
            decoProps.detectedElement = avatarWrapper;
            if (detected) detected.textContent = selector;
            const r = avatarWrapper.getBoundingClientRect();
            logger.debug('themeEngine', '[装饰检测] 目标元素(步进至mesAvatarWrapper):', avatarWrapper.className.slice(0, 60));
            logger.debug('themeEngine', '[装饰检测] 选择器:', selector);
            logger.debug('themeEngine', '[装饰检测] 元素rect:', JSON.stringify({ top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }));
            return;
        }
    }

    // 如果检测到 mes_block 内的子元素，往上取 mes_block 本身作为吸附目标
    const mesBlock = baseEl.classList.contains('mes_block') ? baseEl : baseEl.closest('.mes_block');
    const targetEl = mesBlock || baseEl;

    const selector = buildSimpleSelector(targetEl);
    decoProps.detectedSelector = selector;
    decoProps.detectedElement = targetEl;  // 存真实引用，防止 querySelector 取到第一个同类元素
    if (detected) detected.textContent = selector;
    logger.debug('themeEngine', '[装饰检测] 目标元素:', targetEl.tagName, targetEl.className.slice(0, 60));
    logger.debug('themeEngine', '[装饰检测] 选择器:', selector);
    logger.debug('themeEngine', '[装饰检测] 元素rect:', JSON.stringify({ top: Math.round(targetEl.getBoundingClientRect().top), left: Math.round(targetEl.getBoundingClientRect().left), w: Math.round(targetEl.getBoundingClientRect().width), h: Math.round(targetEl.getBoundingClientRect().height) }));
}

/**
 * 为DOM元素生成简短的CSS选择器（给用户看，确认后可在注入项里修改）
 *
 * @description
 * 优先用id，否则向上最多3层用 tag.class 组合。
 * 过滤掉 ste- 前缀的类名（本扩展自己的）。
 * 特殊处理：当检测到 mes_block 时，向上找 .mes 并读取 is_user 属性，
 * 生成区分用户/角色的选择器，而不是匹配全部消息的宽泛选择器。
 *
 * @param {Element} el
 * @returns {string}
 */
function buildSimpleSelector(el) {
    if (el.id) return `#${el.id}`;

    // 特殊处理聊天气泡：mes_block / mesAvatarWrapper 都需要区分用户/角色
    if (el.classList.contains('mes_block') || el.closest('.mes_block')) {
        const mesBlock = el.classList.contains('mes_block') ? el : el.closest('.mes_block');
        const mesEl = mesBlock?.closest('.mes');
        if (mesEl) {
            const isUser = mesEl.getAttribute('is_user') === 'true';
            const userSel = isUser ? `.mes[is_user='true']` : `.mes:not([is_user='true'])`;
            return `${userSel} .mes_block`;
        }
    }
    if (el.classList.contains('mesAvatarWrapper') || el.closest('.mesAvatarWrapper')) {
        const wrapper = el.classList.contains('mesAvatarWrapper') ? el : el.closest('.mesAvatarWrapper');
        const mesEl = wrapper?.closest('.mes');
        if (mesEl) {
            const isUser = mesEl.getAttribute('is_user') === 'true';
            const userSel = isUser ? `.mes[is_user='true']` : `.mes:not([is_user='true'])`;
            return `${userSel} .mesAvatarWrapper`;
        }
    }

    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 3) {
        let seg = current.tagName.toLowerCase();
        if (current.id) {
            parts.unshift(`#${current.id}`);
            break;
        }
        const cls = Array.from(current.classList)
            .filter(c => c && !c.startsWith('ste-'))
            .slice(0, 2)
            .join('.');
        if (cls) seg += `.${cls}`;
        // .mes 元素上有 is_user 属性，加入选择器避免同时匹配用户和角色消息
        const isUserAttr = current.getAttribute('is_user');
        if (isUserAttr === 'true') seg += `[is_user='true']`;
        else if (isUserAttr === 'false') seg += `:not([is_user='true'])`;
        parts.unshift(seg);
        current = current.parentElement;
    }
    return parts.join(' ');
}

/**
 * 确认装饰放置：根据模式生成CSS+HTML注入项
 *
 * @description
 * 屏幕固定模式：position:fixed，注入到body。
 * 元素吸附模式：position:absolute，注入到检测到的目标元素，
 *   同时给目标元素加 position:relative。
 * 两种模式都会把旋转/翻转/透明度/z-index写入生成的CSS。
 *
 * @param {HTMLElement} overlay - 预览浮层元素
 * @param {string} imageUrl - 图片URL
 */
function confirmDecoration(overlay, imageUrl) {
    const id = `ste-deco-${Date.now()}`;
    const w = Math.round(overlay.offsetWidth);
    const h = Math.round(overlay.offsetHeight);
    const { rotation, opacity, flipH, flipV, zIndex, placeMode, detectedSelector, detectedElement, overflow, coordMode } = decoProps;

    // 构造 transform / opacity CSS 片段
    const transforms = [];
    if (rotation !== 0) transforms.push(`rotate(${rotation}deg)`);
    if (flipH || flipV) transforms.push(`scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`);
    const transformLine = transforms.length > 0 ? `\n    transform: ${transforms.join(' ')};` : '';
    const opacityLine = opacity < 1 ? `\n    opacity: ${opacity.toFixed(2)};` : '';

    let cssBlock;
    let injSelector = 'body';
    let useElement = false;

    // 元素吸附模式：自动四象限检测坐标轴，支持 px / % 两种单位
    // 用 detectedElement（真实引用），不用 querySelector（会拿到第一个同类元素）
    if (placeMode === 'element' && detectedSelector) {
        const targetEl = detectedElement || document.querySelector(detectedSelector);
        if (targetEl) {
            useElement = true;
            const targetRect = targetEl.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();

            // 贴纸中心点
            const centerX = overlayRect.left + overlayRect.width / 2;
            const centerY = overlayRect.top + overlayRect.height / 2;

            // 判断中心在目标的左/右半、上/下半 → 决定用哪个方向的属性
            const useRight  = centerX > targetRect.left + targetRect.width  / 2;
            const useBottom = centerY > targetRect.top  + targetRect.height / 2;

            logger.debug('themeEngine', '[装饰确认] targetRect:', JSON.stringify({ top: Math.round(targetRect.top), left: Math.round(targetRect.left), right: Math.round(targetRect.right), bottom: Math.round(targetRect.bottom), w: Math.round(targetRect.width), h: Math.round(targetRect.height) }));
            logger.debug('themeEngine', '[装饰确认] overlayRect:', JSON.stringify({ top: Math.round(overlayRect.top), left: Math.round(overlayRect.left), right: Math.round(overlayRect.right), bottom: Math.round(overlayRect.bottom) }));
            logger.debug('themeEngine', '[装饰确认] 中心:', Math.round(centerX), Math.round(centerY), '→ useRight:', useRight, 'useBottom:', useBottom, 'coordMode:', coordMode);

            let hVal, vVal, hProp, vProp;
            if (coordMode === '%') {
                // 百分比：相对于目标宽/高
                hProp = useRight  ? 'right'  : 'left';
                vProp = useBottom ? 'bottom' : 'top';
                const hPx = useRight
                    ? targetRect.right  - overlayRect.right
                    : overlayRect.left  - targetRect.left;
                const vPx = useBottom
                    ? targetRect.bottom - overlayRect.bottom
                    : overlayRect.top   - targetRect.top;
                hVal = `${Math.round(hPx / targetRect.width  * 1000) / 10}%`;
                vVal = `${Math.round(vPx / targetRect.height * 1000) / 10}%`;
            } else {
                // px：直接算距离各方向边缘多少像素
                hProp = useRight  ? 'right'  : 'left';
                vProp = useBottom ? 'bottom' : 'top';
                hVal = `${Math.round(useRight  ? targetRect.right  - overlayRect.right  : overlayRect.left - targetRect.left)}px`;
                vVal = `${Math.round(useBottom ? targetRect.bottom - overlayRect.bottom : overlayRect.top  - targetRect.top)}px`;
            }
            logger.debug('themeEngine', '[装饰确认] 最终坐标:', vProp, vVal, hProp, hVal);

            const overflowRule = overflow ? ' overflow: visible !important;' : '';
            cssBlock = [
                '',
                `/* === 装饰: ${id} (吸附: ${detectedSelector}) === */`,
                `${detectedSelector} { position: relative;${overflowRule} }`,
                `.${id} {`,
                `    position: absolute;`,
                `    ${vProp}: ${vVal};`,
                `    ${hProp}: ${hVal};`,
                `    width: ${w}px;`,
                `    height: ${h}px;`,
                `    z-index: ${zIndex};`,
                `    pointer-events: none;${transformLine}${opacityLine}`,
                `}`,
                '',
            ].join('\n');
            injSelector = detectedSelector;
        }
    }

    // 屏幕固定模式（或元素吸附回退）
    if (!useElement) {
        const l = Math.round(overlay.offsetLeft);
        const t = Math.round(overlay.offsetTop);
        cssBlock = [
            '',
            `/* === 装饰: ${id} (屏幕固定) === */`,
            `.${id} {`,
            `    position: fixed;`,
            `    top: ${t}px;`,
            `    left: ${l}px;`,
            `    width: ${w}px;`,
            `    height: ${h}px;`,
            `    z-index: ${zIndex};`,
            `    pointer-events: none;${transformLine}${opacityLine}`,
            `}`,
            '',
        ].join('\n');
    }

    // 装饰CSS不追加到用户CSS输入框，避免输入框改动触发装饰重注入

    // 创建HTML注入项
    currentInjections.push({
        id: `inj-${Date.now()}`,
        selector: injSelector,
        position: 'beforeend',
        html: `<img class="${id}" src="${imageUrl}" alt="装饰">`,
        enabled: true,
        observeChat: false,
        decoId: id,
        decoCSS: cssBlock,
        decoPriority: 'last'
    });
    saveAndApplyHTML();
    syncDecoStyles();
    renderHTMLList();

    removeDecoOverlay();

    // 切到HTML标签页让用户直接查看新增注入项
    const htmlTab = document.querySelector('#ste-panel .ste-tab[data-tab="html"]');
    if (htmlTab) /** @type {HTMLElement} */ (htmlTab).click();

    logger.info('themeEngine', '[装饰] 已添加:', id, `模式=${useElement ? '元素吸附' : '屏幕固定'}`);
}

/**
 * 移除装饰预览浮层并清理所有事件
 */
function removeDecoOverlay() {
    if (decoAbort) { decoAbort.abort(); decoAbort = null; }
    const overlay = document.getElementById('ste-deco-overlay');
    if (overlay) overlay.remove();
    decoState.mode = null;
}

// ============================================
// 布局编辑模式（可视化拖拽定位，生成CSS）
// ============================================

/**
 * 支持布局编辑的元素类名白名单
 * 仅在 #chat 内的这些类名元素会被高亮和选中
 */
const LAYOUT_TARGET_CLASSES = [
    'mesIDDisplay', 'mes_timer', 'tokenCounterDisplay',
    'avatar', 'mesAvatarWrapper',
    'mes_block', 'mes_text', 'name_text', 'timestamp',
    'mes_buttons', 'swipeRightBlock', 'swipe_left', 'swipe_right'
];

/** 元素类名 → 中文名（控制面板显示用） */
const LAYOUT_TARGET_NAMES = {
    mesIDDisplay: '楼层数',
    mes_timer: '时间戳',
    tokenCounterDisplay: 'Token数',
    avatar: '头像',
    mesAvatarWrapper: '头像区域',
    mes_block: '消息气泡',
    mes_text: '消息文字',
    name_text: '角色名',
    timestamp: '时间戳(名字行)',
    mes_buttons: '操作按钮',
    swipeRightBlock: '右翻页块',
    swipe_left: '左箭头',
    swipe_right: '右箭头'
};

/**
 * 从鼠标悬停的元素向上查找第一个匹配布局白名单的元素
 * 必须在 #chat 内才有效
 *
 * @param {EventTarget|null} startEl
 * @returns {HTMLElement|null}
 */
function findLayoutTarget(startEl) {
    let el = /** @type {HTMLElement} */ (startEl);
    while (el && el !== document.body) {
        if (el.closest('#chat')) {
            for (const cls of LAYOUT_TARGET_CLASSES) {
                if (el.classList.contains(cls)) return el;
            }
        }
        el = el.parentElement;
    }
    return null;
}

/**
 * 为布局目标元素生成 CSS 选择器（自动区分 user/char）
 *
 * @param {HTMLElement} el
 * @returns {string}
 */
function buildLayoutSelector(el) {
    const mesEl = el.closest('.mes');
    const isUser = mesEl?.getAttribute('is_user') === 'true';
    const userPart = isUser ? `.mes[is_user='true']` : `.mes:not([is_user='true'])`;

    // 头像区内部元素（嵌套在 mesAvatarWrapper 里）
    const avatarInner = ['mesIDDisplay', 'mes_timer', 'tokenCounterDisplay', 'avatar'];
    for (const cls of avatarInner) {
        if (el.classList.contains(cls)) return `#chat ${userPart} .mesAvatarWrapper .${cls}`;
    }
    if (el.classList.contains('mesAvatarWrapper')) return `#chat ${userPart} .mesAvatarWrapper`;

    // 消息块内元素（直接在 mes 下）
    const cls = LAYOUT_TARGET_CLASSES.find(c => el.classList.contains(c));
    if (cls) return `#chat ${userPart} .${cls}`;

    return buildSimpleSelector(el); // fallback
}

/**
 * 查找元素的定位祖先（position 为 relative/absolute/fixed 的最近父元素）
 *
 * @param {HTMLElement} el
 * @returns {HTMLElement}
 */
function findPositionedParent(el) {
    let parent = el.parentElement;
    while (parent && parent !== document.documentElement) {
        const pos = window.getComputedStyle(parent).position;
        if (pos === 'relative' || pos === 'absolute' || pos === 'fixed') return parent;
        parent = parent.parentElement;
    }
    return document.body;
}

/**
 * 创建或更新悬停高亮框，覆盖在目标元素上
 *
 * @param {HTMLElement} el - 要高亮的元素
 */
function updateLayoutHighlight(el) {
    if (el === layoutHoverEl && layoutHighlight) return;
    layoutHoverEl = el;

    if (!layoutHighlight) {
        layoutHighlight = document.createElement('div');
        layoutHighlight.className = 'ste-layout-highlight';
        document.body.appendChild(layoutHighlight);

        // 点击高亮框 → 选中该元素
        layoutHighlight.addEventListener('click', (e) => {
            if (layoutSelected) return;
            e.preventDefault();
            e.stopPropagation();
            selectLayoutElement(layoutHoverEl);
        }, { signal: layoutAbort.signal });
    }

    const rect = el.getBoundingClientRect();
    layoutHighlight.style.left = `${rect.left}px`;
    layoutHighlight.style.top = `${rect.top}px`;
    layoutHighlight.style.width = `${rect.width}px`;
    layoutHighlight.style.height = `${rect.height}px`;

    const cls = LAYOUT_TARGET_CLASSES.find(c => el.classList.contains(c));
    layoutHighlight.title = LAYOUT_TARGET_NAMES[cls] || '点击选中';
}

/**
 * 移除布局高亮框并重置悬停状态
 */
function removeLayoutHighlight() {
    if (layoutHighlight) {
        layoutHighlight.remove();
        layoutHighlight = null;
    }
    layoutHoverEl = null;
}

/**
 * 回读已有布局编辑 CSS 块，恢复控制面板状态
 *
 * @param {string} selector
 * @returns {{ outOfFlow: boolean, coordMode: 'px'|'%', opacity: number|null, rotation: number, fontSize: number|null } | null}
 */
function parseExistingLayoutCSS(selector) {
    const cssInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('ste-css-input'));
    if (!cssInput) return null;

    const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `/\\* \\[布局编辑\\] ${escSel} \\*/[\\s\\S]*?(?=/\\* \\[布局编辑\\]|$)`
    );
    const match = cssInput.value.match(pattern);
    if (!match) return null;

    const block = match[0];
    const result = {
        outOfFlow: false,
        coordMode: 'px',
        opacity: null,
        rotation: 0,
        fontSize: null
    };

    if (/position\s*:\s*absolute\b/i.test(block)) result.outOfFlow = true;
    if (/(?:top|right|bottom|left)\s*:\s*[-\d.]+%/i.test(block)) result.coordMode = '%';

    const opMatch = block.match(/opacity\s*:\s*([+-]?\d*\.?\d+)/i);
    if (opMatch) result.opacity = Number.parseFloat(opMatch[1]);

    const rotMatch = block.match(/rotate\(\s*([+-]?\d*\.?\d+)deg\s*\)/i);
    if (rotMatch) result.rotation = Number.parseFloat(rotMatch[1]);

    const fsMatch = block.match(/font-size\s*:\s*([+-]?\d*\.?\d+)em/i);
    if (fsMatch) result.fontSize = Number.parseFloat(fsMatch[1]);

    return result;
}

/**
 * 选中元素：高亮框变为绿色可拖动状态，创建控制面板
 *
 * @param {HTMLElement} el - 被选中的元素
 */
function selectLayoutElement(el) {
    if (!el || !layoutHighlight) return;
    layoutSelected = el;
    layoutEditProps = { outOfFlow: false, coordMode: 'px', opacity: null, rotation: 0, fontSize: null };

    layoutHighlight.classList.add('selected');

    // 添加缩放手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'ste-layout-resize-handle';
    layoutHighlight.appendChild(resizeHandle);

    const cls = LAYOUT_TARGET_CLASSES.find(c => el.classList.contains(c)) || '';
    const cnName = LAYOUT_TARGET_NAMES[cls] || cls;
    const selector = buildLayoutSelector(el);
    const existing = parseExistingLayoutCSS(selector);
    if (existing) {
        layoutEditProps = existing;
    }

    const outOfFlowActive = layoutEditProps.outOfFlow ? ' active' : '';
    const pxActive = layoutEditProps.coordMode === 'px' ? ' active' : '';
    const percentActive = layoutEditProps.coordMode === '%' ? ' active' : '';
    const fsInitial = layoutEditProps.fontSize !== null ? layoutEditProps.fontSize.toFixed(1) : '—';
    const opInitial = layoutEditProps.opacity !== null ? layoutEditProps.opacity.toFixed(1) : '—';
    const rotInitial = `${layoutEditProps.rotation}°`;

    // 创建控制面板
    const controls = document.createElement('div');
    controls.id = 'ste-layout-controls';
    controls.className = 'ste-layout-controls';
    controls.innerHTML = `
        <div class="ste-deco-row">
            <span class="ste-layout-el-name">${escapeHtml(cnName)}</span>
            <span class="ste-layout-selector-display" title="${escapeHtml(selector)}">${escapeHtml(selector)}</span>
        </div>
        <div class="ste-deco-row">
            <button class="ste-deco-ctrl${outOfFlowActive}" id="ste-layout-outofflow" title="脱离文字流：生成 position:absolute，元素不再挤压其他内容">
                <i class="fa-solid fa-arrow-up-from-bracket"></i> 脱离文字流
            </button>
            <span class="ste-deco-sep"></span>
            <button class="ste-deco-ctrl ste-layout-coord-btn${pxActive}" data-coord="px" title="像素定位">px</button>
            <button class="ste-deco-ctrl ste-layout-coord-btn${percentActive}" data-coord="%" title="百分比定位">%</button>
        </div>
        <div class="ste-deco-row">
            <span class="ste-deco-lbl">字号</span>
            <button class="ste-deco-ctrl" id="ste-layout-fs-down" title="-0.1em"><i class="fa-solid fa-minus"></i></button>
            <span class="ste-deco-val" id="ste-layout-fs-val">${fsInitial}</span>
            <button class="ste-deco-ctrl" id="ste-layout-fs-up" title="+0.1em"><i class="fa-solid fa-plus"></i></button>
            <span class="ste-layout-unit-lbl">em</span>
            <span class="ste-deco-sep"></span>
            <span class="ste-deco-lbl">透明</span>
            <button class="ste-deco-ctrl" id="ste-layout-op-down" title="-0.1"><i class="fa-solid fa-minus"></i></button>
            <span class="ste-deco-val" id="ste-layout-op-val">${opInitial}</span>
            <button class="ste-deco-ctrl" id="ste-layout-op-up" title="+0.1"><i class="fa-solid fa-plus"></i></button>
        </div>
        <div class="ste-deco-row">
            <span class="ste-deco-lbl">旋转</span>
            <button class="ste-deco-ctrl" id="ste-layout-rot-l" title="左旋15°"><i class="fa-solid fa-rotate-left"></i></button>
            <span class="ste-deco-val" id="ste-layout-rot-val">${rotInitial}</span>
            <button class="ste-deco-ctrl" id="ste-layout-rot-r" title="右旋15°"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
        <div class="ste-deco-row ste-deco-actions">
            <button class="ste-deco-btn ste-deco-confirm" id="ste-layout-confirm" title="确认，生成CSS"><i class="fa-solid fa-check"></i></button>
            <button class="ste-deco-btn ste-deco-cancel" id="ste-layout-cancel" title="取消"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;

    // 控制面板定位：优先放在高亮框下方，空间不足则放上方
    const rect = layoutHighlight.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    controls.style.top = spaceBelow > 110
        ? `${rect.bottom + 8}px`
        : `${Math.max(8, rect.top - 118)}px`;
    controls.style.left = `${Math.min(rect.left, window.innerWidth - 310)}px`;
    document.body.appendChild(controls);

    const signal = layoutAbort.signal;

    // 脱离文字流 toggle
    controls.querySelector('#ste-layout-outofflow').addEventListener('click', (e) => {
        layoutEditProps.outOfFlow = !layoutEditProps.outOfFlow;
        /** @type {HTMLElement} */ (e.currentTarget).classList.toggle('active', layoutEditProps.outOfFlow);
    }, { signal });

    // 坐标单位切换
    controls.querySelectorAll('.ste-layout-coord-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            layoutEditProps.coordMode = /** @type {HTMLElement} */ (btn).dataset.coord;
            controls.querySelectorAll('.ste-layout-coord-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }, { signal });
    });

    // 确认 / 取消
    controls.querySelector('#ste-layout-confirm').addEventListener('click', confirmLayoutEdit, { signal });
    controls.querySelector('#ste-layout-cancel').addEventListener('click', cancelLayoutEdit, { signal });

    // 字号（em）
    const fsVal = controls.querySelector('#ste-layout-fs-val');
    controls.querySelector('#ste-layout-fs-down').addEventListener('click', () => {
        if (layoutEditProps.fontSize === null) layoutEditProps.fontSize = 1.0;
        layoutEditProps.fontSize = Math.round((layoutEditProps.fontSize - 0.1) * 10) / 10;
        if (layoutEditProps.fontSize < 0.1) layoutEditProps.fontSize = 0.1;
        fsVal.textContent = layoutEditProps.fontSize.toFixed(1);
        applyLayoutPreview();
    }, { signal });
    controls.querySelector('#ste-layout-fs-up').addEventListener('click', () => {
        if (layoutEditProps.fontSize === null) layoutEditProps.fontSize = 1.0;
        layoutEditProps.fontSize = Math.round((layoutEditProps.fontSize + 0.1) * 10) / 10;
        fsVal.textContent = layoutEditProps.fontSize.toFixed(1);
        applyLayoutPreview();
    }, { signal });

    // 透明度
    const opVal = controls.querySelector('#ste-layout-op-val');
    controls.querySelector('#ste-layout-op-down').addEventListener('click', () => {
        if (layoutEditProps.opacity === null) layoutEditProps.opacity = 1.0;
        layoutEditProps.opacity = Math.round((layoutEditProps.opacity - 0.1) * 10) / 10;
        if (layoutEditProps.opacity < 0) layoutEditProps.opacity = 0;
        opVal.textContent = layoutEditProps.opacity.toFixed(1);
        applyLayoutPreview();
    }, { signal });
    controls.querySelector('#ste-layout-op-up').addEventListener('click', () => {
        if (layoutEditProps.opacity === null) layoutEditProps.opacity = 1.0;
        layoutEditProps.opacity = Math.round((layoutEditProps.opacity + 0.1) * 10) / 10;
        if (layoutEditProps.opacity > 1) layoutEditProps.opacity = 1.0;
        opVal.textContent = layoutEditProps.opacity.toFixed(1);
        applyLayoutPreview();
    }, { signal });

    // 旋转
    const rotVal = controls.querySelector('#ste-layout-rot-val');
    controls.querySelector('#ste-layout-rot-l').addEventListener('click', () => {
        layoutEditProps.rotation = ((layoutEditProps.rotation - 15) % 360 + 360) % 360;
        rotVal.textContent = layoutEditProps.rotation + '°';
        applyLayoutPreview();
    }, { signal });
    controls.querySelector('#ste-layout-rot-r').addEventListener('click', () => {
        layoutEditProps.rotation = (layoutEditProps.rotation + 15) % 360;
        rotVal.textContent = layoutEditProps.rotation + '°';
        applyLayoutPreview();
    }, { signal });

    // 更新快速编辑面板的选中信息
    const qeNoSel = document.querySelector('.ste-qe-no-selection');
    const qeControls = document.querySelector('.ste-qe-controls');
    if (qeNoSel) qeNoSel.style.display = 'none';
    if (qeControls) {
        qeControls.style.display = '';
        const nameEl = qeControls.querySelector('.ste-qe-el-name');
        const selEl = qeControls.querySelector('.ste-qe-selector');
        if (nameEl) nameEl.textContent = cnName;
        if (selEl) { selEl.textContent = selector; selEl.title = selector; }
    }
    // 填充快速编辑控件值
    populateQEControls(el, selector);

    // 绑定拖拽和缩放
    bindLayoutDragResize(resizeHandle, signal);

    logger.debug('themeEngine', '[布局编辑] 已选中:', selector);
}

/**
 * 绑定快速编辑控件事件（初始化时调用一次）
 */
function bindQuickEditEvents() {
    const root = document.querySelector('.ste-qe-controls');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.querySelectorAll('.ste-qe-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.ste-qe-group');
            if (!group) return;
            group.classList.toggle('expanded');
        });
    });

    root.querySelectorAll('.ste-qe-range').forEach(range => {
        range.addEventListener('input', () => {
            syncQERangeValue(/** @type {HTMLInputElement} */ (range));
            updateQEHints();
            updateQEPreview();
        });
    });

    root.querySelectorAll('.ste-qe-color-picker').forEach(picker => {
        picker.addEventListener('input', () => {
            const prop = /** @type {HTMLInputElement} */ (picker).dataset.prop;
            if (!prop) return;
            const text = findQEControl(prop, '.ste-qe-color-text');
            if (text) text.value = /** @type {HTMLInputElement} */ (picker).value;
            updateQEPreview();
        });
    });

    root.querySelectorAll('.ste-qe-text-full, .ste-qe-color-text').forEach(input => {
        input.addEventListener('input', () => {
            if (qeInputDebounceTimer) window.clearTimeout(qeInputDebounceTimer);
            qeInputDebounceTimer = window.setTimeout(() => {
                updateQEHints();
                syncShadowPresetActive();
                updateQEPreview();
            }, 150);
        });
    });

    root.querySelectorAll('.ste-qe-num').forEach(num => {
        num.addEventListener('input', () => {
            updateQEPreview();
        });
    });

    root.querySelectorAll('.ste-qe-select').forEach(sel => {
        sel.addEventListener('change', () => {
            updateQEHints();
            updateQEPreview();
        });
    });

    // fill 复选框变化时更新预览
    const fillCheck = document.getElementById('ste-qe-9grid-fill');
    if (fillCheck) {
        fillCheck.addEventListener('change', () => {
            updateQEPreview();
            updateQEHints();
        });
    }

    root.querySelectorAll('.ste-qe-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const value = /** @type {HTMLElement} */ (btn).dataset.shadow || 'none';
            const shadowInput = findQEControl('box-shadow', '.ste-qe-text-full');
            if (!shadowInput) return;
            shadowInput.value = value === 'none' ? '' : value;
            syncShadowPresetActive();
            updateQEPreview();
        });
    });

    const confirmBtn = document.getElementById('ste-qe-confirm');
    confirmBtn?.addEventListener('click', confirmQuickEdit);
    const resetBtn = document.getElementById('ste-qe-reset');
    resetBtn?.addEventListener('click', resetQuickEdit);
}

/**
 * 快速编辑预览：把当前控件变化写入独立 style 标签
 */
function updateQEPreview() {
    if (!layoutAbort || !layoutSelected) return;
    const selector = buildLayoutSelector(layoutSelected);
    const declarations = collectQEValues();
    if (!declarations) {
        removeQEPreview();
        return;
    }
    let styleEl = document.getElementById('ste-qe-preview');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'ste-qe-preview';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `${selector} { ${declarations} }`;
}

/**
 * 收集快速编辑控件值（仅返回相对初始值发生变化的声明）
 *
 * @returns {string | null}
 */
function collectQEValues() {
    const map = collectQEValueMap();
    const entries = Object.entries(map);
    if (entries.length === 0) return null;
    return entries.map(([prop, value]) => `${prop}: ${value};`).join(' ');
}

/**
 * 删除快速编辑预览 style 标签
 */
function removeQEPreview() {
    const styleEl = document.getElementById('ste-qe-preview');
    if (styleEl) styleEl.remove();
}

/**
 * 重置快速编辑控件到选中时快照
 */
function resetQuickEdit() {
    if (!qeInitialSnapshot) return;
    resetQEControlsToDefault();
    for (const [prop, value] of Object.entries(qeInitialSnapshot)) {
        setQEControlFromValue(prop, value);
    }
    updateQEHints();
    syncShadowPresetActive();
    removeQEPreview();
}

/**
 * 确认快速编辑（N4-C3 实现）
 */
function confirmQuickEdit() {
    if (!layoutSelected) return;
    const selector = buildLayoutSelector(layoutSelected);
    const declarations = collectQEValues();
    if (!declarations) {
        logger.warn('themeEngine', '[快速编辑] 没有任何属性变化');
        return;
    }
    // 格式化成 CSS 块
    const props = declarations.split(';').filter(s => s.trim());
    const formatted = props.map(p => `    ${p.trim()};`).join('\n');
    const block = `\n/* [快速编辑] ${selector} */\n${selector} {\n${formatted}\n}\n`;

    upsertQuickEditCSSBlock(selector, block);

    const cssInput = document.getElementById('ste-css-input');
    if (cssInput) {
        injectCSS(cssInput.value);
        saveSchemeCSS(cssInput.value);
    }
    removeQEPreview();
    toastr.success('已生成CSS并写入输入框');
}

/**
 * 写入或替换快速编辑 CSS 块
 *
 * @param {string} selector
 * @param {string} newBlock
 */
function upsertQuickEditCSSBlock(selector, newBlock) {
    const cssInput = document.getElementById('ste-css-input');
    if (!cssInput) return;
    const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `\\n?/\\* \\[快速编辑\\] ${escSel} \\*/[\\s\\S]*?(?=\\n/\\* \\[快速编辑\\]|\\n/\\* \\[布局编辑\\]|$)`
    );
    if (pattern.test(cssInput.value)) {
        cssInput.value = cssInput.value.replace(pattern, newBlock.trimEnd());
        logger.info('themeEngine', '[快速编辑] 已更新:', selector);
    } else {
        cssInput.value += newBlock;
        logger.info('themeEngine', '[快速编辑] 已追加:', selector);
    }
}

/**
 * 按当前选中元素回填快速编辑控件
 *
 * @param {HTMLElement} el
 * @param {string} selector
 */
function populateQEControls(el, selector) {
    const cs = window.getComputedStyle(el);
    setQEColorValue('background-color', cs.backgroundColor);
    setQEColorValue('color', cs.color);
    setQERangeValue('border-width', parseInt(cs.borderTopWidth, 10) || 0);
    setQESelectValue('border-style', cs.borderTopStyle);
    setQEColorValue('border-color', cs.borderTopColor);
    setQERangeValue('border-radius', parseInt(cs.borderTopLeftRadius, 10) || 0);
    setQETextValue('box-shadow', cs.boxShadow === 'none' ? '' : cs.boxShadow);
    setQERangeValue('opacity', Number.parseFloat(cs.opacity));
    setQENumValue('padding-top', parseInt(cs.paddingTop, 10) || 0);
    setQENumValue('padding-right', parseInt(cs.paddingRight, 10) || 0);
    setQENumValue('padding-bottom', parseInt(cs.paddingBottom, 10) || 0);
    setQENumValue('padding-left', parseInt(cs.paddingLeft, 10) || 0);
    setQENumValue('margin-top', parseInt(cs.marginTop, 10) || 0);
    setQENumValue('margin-right', parseInt(cs.marginRight, 10) || 0);
    setQENumValue('margin-bottom', parseInt(cs.marginBottom, 10) || 0);
    setQENumValue('margin-left', parseInt(cs.marginLeft, 10) || 0);
    setQETextValue('border-image-source', '');
    setQETextValue('border-image-slice', '');
    setQETextValue('border-image-width', '0.5em');
    setQESelectValue('border-image-repeat', 'round');
    // fill 复选框默认勾选
    const fillCb = document.getElementById('ste-qe-9grid-fill');
    if (fillCb) fillCb.checked = true;

    const existing = parseExistingQuickEditCSS(selector);
    if (existing) {
        for (const [prop, val] of Object.entries(existing)) {
            if (val === null || val === undefined || val === '') continue;
            if (prop === '__ste-9grid-fill') continue;
            if (['background-color', 'color', 'border-color'].includes(prop)) {
                setQEColorValue(prop, val);
            } else if (['border-width', 'border-radius'].includes(prop)) {
                setQERangeValue(prop, parseInt(val, 10) || 0);
            } else if (prop === 'opacity') {
                setQERangeValue(prop, Number.parseFloat(val));
            } else if (prop === 'border-style' || prop === 'border-image-repeat') {
                setQESelectValue(prop, val);
            } else if ([
                'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                'margin-top', 'margin-right', 'margin-bottom', 'margin-left'
            ].includes(prop)) {
                setQENumValue(prop, parseInt(val, 10) || 0);
            } else {
                setQETextValue(prop, val);
            }
        }
    }
    // 同步 fill 复选框状态
    if (existing && (existing['__ste-9grid-fill'] || existing['border-image-slice'])) {
        const fillCbFromCSS = document.getElementById('ste-qe-9grid-fill');
        if (fillCbFromCSS) {
            fillCbFromCSS.checked = existing['__ste-9grid-fill'] === '1'
                || /\bfill\b/i.test(existing['border-image-slice'] || '');
        }
    }

    qeInitialSnapshot = captureQESnapshot();
    updateQEHints();
    syncShadowPresetActive();
    removeQEPreview();
}

/**
 * 解析 CSS 输入框中的快速编辑块
 *
 * @param {string} selector
 * @returns {Record<string, string> | null}
 */
function parseExistingQuickEditCSS(selector) {
    const cssInput = document.getElementById('ste-css-input');
    if (!cssInput) return null;
    const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `/\\* \\[快速编辑\\] ${escSel} \\*/[\\s\\S]*?(?=/\\* \\[快速编辑\\]|/\\* \\[布局编辑\\]|$)`
    );
    const match = cssInput.value.match(pattern);
    if (!match) return null;

    const block = match[0];
    const result = {};
    // 提取 selector { ... } 中的声明
    const bodyMatch = block.match(/\{([^}]*)\}/);
    if (!bodyMatch) return null;
    const body = bodyMatch[1];
    // 逐行解析 "属性: 值;"
    const declPattern = /\s*([\w-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = declPattern.exec(body)) !== null) {
        // 回读时忽略末尾 !important，避免控件显示污染
        result[m[1].trim()] = m[2].trim().replace(/\s*!important\s*$/i, '');
    }
    // 回读时去掉 url() 包裹，只显示纯链接
    if (result['border-image-source']) {
        const srcVal = result['border-image-source'];
        const urlMatch = srcVal.match(/url\(['"]?([^'")\s]+)['"]?\)/);
        if (urlMatch) result['border-image-source'] = urlMatch[1];
    }

    // 回读时去掉 slice 中的 fill（fill 状态由复选框控制）
    if (result['border-image-slice']) {
        result['__ste-9grid-fill'] = /\bfill\b/i.test(result['border-image-slice']) ? '1' : '0';
        result['border-image-slice'] = result['border-image-slice'].replace(/\s*\bfill\b/i, '').trim();
    }
    return Object.keys(result).length > 0 ? result : null;
}

/**
 * 记录当前快速编辑状态快照
 *
 * @returns {Record<string, string>}
 */
function captureQESnapshot() {
    return collectQEValueMap(false);
}

/**
 * 收集快速编辑属性值
 *
 * @param {boolean} [onlyChanged=true]
 * @returns {Record<string, string>}
 */
function collectQEValueMap(onlyChanged = true) {
    const current = {};
    const addIf = (prop, value) => {
        if (value === null || value === undefined || value === '') return;
        current[prop] = String(value).trim();
    };

    addIf('background-color', getQEColorValue('background-color'));
    addIf('color', getQEColorValue('color'));
    addIf('border-color', getQEColorValue('border-color'));

    const borderWidth = Number.parseFloat(getQERangeRawValue('border-width'));
    if (!Number.isNaN(borderWidth) && borderWidth > 0) addIf('border-width', `${borderWidth}px`);

    const borderRadius = Number.parseFloat(getQERangeRawValue('border-radius'));
    if (!Number.isNaN(borderRadius) && borderRadius > 0) addIf('border-radius', `${borderRadius}px`);

    const borderStyle = getQESelectRawValue('border-style');
    if (borderStyle && borderStyle !== 'none') addIf('border-style', borderStyle);

    const boxShadow = getQETextRawValue('box-shadow');
    if (boxShadow && boxShadow.toLowerCase() !== 'none') addIf('box-shadow', boxShadow);

    const opacity = Number.parseFloat(getQERangeRawValue('opacity'));
    if (!Number.isNaN(opacity) && opacity < 1) addIf('opacity', String(opacity));

    // ── 九宫格 border-image ──
    const biSource = getQETextRawValue('border-image-source');
    const biSlice = getQETextRawValue('border-image-slice');
    const biWidth = getQETextRawValue('border-image-width');
    const biRepeat = getQESelectRawValue('border-image-repeat');
    const biFill = document.getElementById('ste-qe-9grid-fill');
    const hasFill = biFill ? biFill.checked : true;

    if (biSource) {
        // Bug1修复：自动包裹 url()
        const srcVal = biSource.trim().replace(/\s*!important\s*$/i, '');
        const wrapped = srcVal.startsWith('url(') ? srcVal : `url('${srcVal}')`;
        addIf('border-image-source', `${wrapped} !important`);

        // Bug2修复：根据fill复选框追加fill
        if (biSlice) {
            const sliceVal = biSlice.trim().replace(/\s*!important\s*$/i, '');
            // 如果用户自己写了fill就不重复加
            const hasFillInValue = /\bfill\b/i.test(sliceVal);
            if (hasFill && !hasFillInValue) {
                addIf('border-image-slice', `${sliceVal} fill !important`);
            } else if (!hasFill && hasFillInValue) {
                // 用户取消了fill但输入里有fill → 尊重复选框，去掉fill
                addIf('border-image-slice', `${sliceVal.replace(/\s*\bfill\b/i, '').trim()} !important`);
            } else {
                addIf('border-image-slice', `${sliceVal} !important`);
            }
        } else {
            // 用户没填slice，给一个默认值
            addIf('border-image-slice', hasFill ? '30 fill !important' : '30 !important');
        }

        if (biWidth) {
            addIf('border-image-width', biWidth.trim());
        }

        // Bug4修复：repeat 总是输出（默认 round）
        addIf('border-image-repeat', biRepeat || 'round');

        // Bug3修复：自动补全前置条件（覆盖前面设的 border/background/border-radius）
        const bw = biWidth ? biWidth.trim() : '0.5em';
        addIf('border', `${bw} solid transparent`);
        addIf('background', 'transparent');
        addIf('border-radius', '0');
    }

    [
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left'
    ].forEach(prop => {
        const raw = getQENumRawValue(prop);
        if (raw === '') return;
        const num = Number.parseFloat(raw);
        if (!Number.isNaN(num)) addIf(prop, `${num}px`);
    });

    if (!onlyChanged || !qeInitialSnapshot) return current;
    const changed = {};
    for (const [prop, value] of Object.entries(current)) {
        if (qeInitialSnapshot[prop] !== value) changed[prop] = value;
    }
    return changed;
}

/**
 * 恢复控件默认值（再叠加快照）
 */
function resetQEControlsToDefault() {
    document.querySelectorAll('.ste-qe-color-text').forEach(el => { el.value = ''; });
    document.querySelectorAll('.ste-qe-color-picker').forEach(el => { el.value = '#000000'; });
    document.querySelectorAll('.ste-qe-range').forEach(el => {
        el.value = el.dataset.prop === 'opacity' ? '1' : '0';
        syncQERangeValue(/** @type {HTMLInputElement} */ (el));
    });
    document.querySelectorAll('.ste-qe-select').forEach(el => { el.selectedIndex = 0; });
    document.querySelectorAll('.ste-qe-text-full').forEach(el => { el.value = ''; });
    document.querySelectorAll('.ste-qe-num').forEach(el => { el.value = ''; });
}

/**
 * 根据属性值回写到对应控件
 *
 * @param {string} prop
 * @param {string} value
 */
function setQEControlFromValue(prop, value) {
    if (['background-color', 'color', 'border-color'].includes(prop)) {
        setQEColorValue(prop, value);
        return;
    }
    if (['border-width', 'border-radius', 'opacity'].includes(prop)) {
        const num = Number.parseFloat(value);
        if (!Number.isNaN(num)) setQERangeValue(prop, num);
        return;
    }
    if (prop === 'border-style' || prop === 'border-image-repeat') {
        setQESelectValue(prop, value);
        return;
    }
    if ([
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin-top', 'margin-right', 'margin-bottom', 'margin-left'
    ].includes(prop)) {
        const num = Number.parseFloat(value);
        if (!Number.isNaN(num)) setQENumValue(prop, num);
        return;
    }
    setQETextValue(prop, value);
}

/**
 * 查找快速编辑控件
 *
 * @param {string} prop
 * @param {string} selector
 * @returns {HTMLInputElement | HTMLSelectElement | null}
 */
function findQEControl(prop, selector) {
    return /** @type {HTMLInputElement | HTMLSelectElement | null} */ (
        document.querySelector(`.ste-qe-controls ${selector}[data-prop="${prop}"]`)
    );
}

/**
 * 颜色控件赋值（文本框优先显示原值）
 *
 * @param {string} prop
 * @param {string} value
 */
function setQEColorValue(prop, value) {
    const text = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-color-text'));
    const picker = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-color-picker'));
    if (text) text.value = value || '';
    if (picker) picker.value = toHexColor(value) || '#000000';
}

/**
 * 滑块控件赋值
 *
 * @param {string} prop
 * @param {number} value
 */
function setQERangeValue(prop, value) {
    const input = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-range'));
    if (!input || Number.isNaN(value)) return;
    const min = Number.parseFloat(input.min || '0');
    const max = Number.parseFloat(input.max || '100');
    const clamped = Math.max(min, Math.min(max, value));
    input.value = String(clamped);
    syncQERangeValue(input);
}

/**
 * 下拉框赋值
 *
 * @param {string} prop
 * @param {string} value
 */
function setQESelectValue(prop, value) {
    const input = /** @type {HTMLSelectElement | null} */ (findQEControl(prop, '.ste-qe-select'));
    if (!input) return;
    const hasOption = Array.from(input.options).some(opt => opt.value === value);
    input.value = hasOption ? value : input.options[0]?.value || '';
}

/**
 * 数字输入赋值
 *
 * @param {string} prop
 * @param {number} value
 */
function setQENumValue(prop, value) {
    const input = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-num'));
    if (!input || Number.isNaN(value)) return;
    input.value = String(value);
}

/**
 * 文本输入赋值
 *
 * @param {string} prop
 * @param {string} value
 */
function setQETextValue(prop, value) {
    const input = /** @type {HTMLInputElement | null} */ (
        findQEControl(prop, '.ste-qe-text-full') || findQEControl(prop, '.ste-qe-color-text')
    );
    if (input) input.value = value || '';
}

/**
 * 同步滑块右侧值显示
 *
 * @param {HTMLInputElement} range
 */
function syncQERangeValue(range) {
    const row = range.closest('.ste-qe-row');
    const valEl = row?.querySelector('.ste-qe-range-val');
    if (!valEl) return;
    const prop = range.dataset.prop || '';
    if (prop === 'opacity') {
        valEl.textContent = Number.parseFloat(range.value).toFixed(2).replace(/\.?0+$/, '');
    } else {
        valEl.textContent = `${range.value}px`;
    }
}

/**
 * 更新智能提示
 */
function updateQEHints() {
    const nineHint = document.getElementById('ste-qe-9grid-hint');
    const radius = Number.parseFloat(getQERangeRawValue('border-radius')) || 0;
    const source = getQETextRawValue('border-image-source');
    if (nineHint) nineHint.style.display = radius > 0 && !!source ? '' : 'none';

    const opacityHint = document.getElementById('ste-qe-opacity-hint');
    const opacity = Number.parseFloat(getQERangeRawValue('opacity'));
    if (opacityHint) opacityHint.style.display = !Number.isNaN(opacity) && opacity < 1 ? '' : 'none';
}

/**
 * 阴影预设按钮高亮同步
 */
function syncShadowPresetActive() {
    const value = getQETextRawValue('box-shadow');
    document.querySelectorAll('.ste-qe-preset-btn').forEach(btn => {
        const preset = /** @type {HTMLElement} */ (btn).dataset.shadow || 'none';
        const active = (!value && preset === 'none') || value === preset;
        btn.classList.toggle('active', active);
    });
}

/**
 * 获取颜色输入值（文本优先，空时回退 color picker）
 *
 * @param {string} prop
 * @returns {string}
 */
function getQEColorValue(prop) {
    const text = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-color-text'));
    const picker = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-color-picker'));
    const textVal = text?.value?.trim() || '';
    if (textVal) return textVal;
    return picker?.value?.trim() || '';
}

/**
 * @param {string} prop
 * @returns {string}
 */
function getQERangeRawValue(prop) {
    const input = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-range'));
    return input?.value?.trim() || '';
}

/**
 * @param {string} prop
 * @returns {string}
 */
function getQESelectRawValue(prop) {
    const input = /** @type {HTMLSelectElement | null} */ (findQEControl(prop, '.ste-qe-select'));
    return input?.value?.trim() || '';
}

/**
 * @param {string} prop
 * @returns {string}
 */
function getQETextRawValue(prop) {
    const input = /** @type {HTMLInputElement | null} */ (
        findQEControl(prop, '.ste-qe-text-full') || findQEControl(prop, '.ste-qe-color-text')
    );
    return input?.value?.trim() || '';
}

/**
 * @param {string} prop
 * @returns {string}
 */
function getQENumRawValue(prop) {
    const input = /** @type {HTMLInputElement | null} */ (findQEControl(prop, '.ste-qe-num'));
    return input?.value?.trim() || '';
}

/**
 * 颜色字符串转为 #rrggbb（供 color picker 显示）
 *
 * @param {string} input
 * @returns {string | null}
 */
function toHexColor(input) {
    if (!input) return null;
    const raw = input.trim();
    const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
    if (shortHex) {
        const h = shortHex[1];
        return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
    }
    const fullHex = raw.match(/^#([0-9a-f]{6})$/i);
    if (fullHex) return `#${fullHex[1]}`.toLowerCase();

    const rgb = raw.match(/^rgba?\(\s*([+-]?\d+)\s*[, ]\s*([+-]?\d+)\s*[, ]\s*([+-]?\d+)/i);
    if (!rgb) return null;
    const toHex = (n) => {
        const v = Math.max(0, Math.min(255, Number.parseInt(n, 10) || 0));
        return v.toString(16).padStart(2, '0');
    };
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
}

/**
 * 绑定布局高亮框的拖拽和缩放事件
 *
 * @param {HTMLElement} resizeHandle - 右下角缩放手柄
 * @param {AbortSignal} signal
 */
function bindLayoutDragResize(resizeHandle, signal) {
    const highlight = layoutHighlight;

    // ── 辅助：统一提取坐标（鼠标 / 触摸） ──
    const clientXY = (e) => {
        if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    };

    // ── 拖动开始（整个高亮框，排除缩放手柄） ──
    const onDragStart = (e) => {
        if (/** @type {HTMLElement} */ (e.target).closest('.ste-layout-resize-handle')) return;
        const { x, y } = clientXY(e);
        layoutDragState = {
            mode: 'drag',
            startX: x, startY: y,
            initL: highlight.offsetLeft, initT: highlight.offsetTop,
            initW: 0, initH: 0
        };
        e.preventDefault();
        e.stopPropagation();
    };
    highlight.addEventListener('mousedown', onDragStart, { signal });
    highlight.addEventListener('touchstart', onDragStart, { passive: false, signal });

    // ── 缩放开始 ──
    const onResizeStart = (e) => {
        const { x, y } = clientXY(e);
        layoutDragState = {
            mode: 'resize',
            startX: x, startY: y,
            initL: 0, initT: 0,
            initW: highlight.offsetWidth, initH: highlight.offsetHeight
        };
        e.preventDefault();
        e.stopPropagation();
    };
    resizeHandle.addEventListener('mousedown', onResizeStart, { signal });
    resizeHandle.addEventListener('touchstart', onResizeStart, { passive: false, signal });

    // ── 全局移动（鼠标 + 触摸） ──
    const onMove = (e) => {
        if (!layoutDragState.mode) return;
        const { x, y } = clientXY(e);
        if (layoutDragState.mode === 'drag') {
            highlight.style.left = `${layoutDragState.initL + x - layoutDragState.startX}px`;
            highlight.style.top  = `${layoutDragState.initT + y - layoutDragState.startY}px`;
        } else {
            const newW = Math.max(10, layoutDragState.initW + (x - layoutDragState.startX));
            const newH = Math.max(10, layoutDragState.initH + (y - layoutDragState.startY));
            highlight.style.width  = `${newW}px`;
            highlight.style.height = `${newH}px`;
        }
        if (e.cancelable) e.preventDefault();   // 阻止页面滚动
    };
    document.addEventListener('mousemove', onMove, { signal });
    document.addEventListener('touchmove', onMove, { passive: false, signal });

    // ── 全局松手 ──
    const onEnd = () => { layoutDragState.mode = null; };
    document.addEventListener('mouseup', onEnd, { signal });
    document.addEventListener('touchend', onEnd, { signal });
    document.addEventListener('touchcancel', onEnd, { signal });
}

/**
 * 确认布局编辑：生成 CSS 并写入 CSS 编辑器（有则替换，无则追加），切换到 CSS 标签页
 */
function confirmLayoutEdit() {
    if (!layoutSelected || !layoutHighlight) return;

    const selector  = buildLayoutSelector(layoutSelected);
    const cssBlock  = buildLayoutCSSBlock(layoutSelected, layoutHighlight);
    if (cssBlock) {
        const cssInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('ste-css-input'));
        if (cssInput) {
            upsertLayoutCSSBlock(selector, cssBlock);
            injectCSS(cssInput.value);
            saveSchemeCSS(cssInput.value);
        }
        const cssTab = document.querySelector('#ste-panel .ste-tab[data-tab="css"]');
        if (cssTab) /** @type {HTMLElement} */ (cssTab).click();
    } else {
        logger.warn('themeEngine', '[布局编辑] 没有检测到位置或大小变化，未生成CSS');
    }

    cancelLayoutEdit();
}

/**
 * 生成布局编辑的 CSS 代码块
 *
 * @description
 * 比较高亮框最终位置/大小与元素原始状态。
 * 脱离文字流开启 → 生成 position:absolute + 坐标（相对定位祖先）。
 * 大小变化 → 生成 width/height。
 * 使用四象限检测决定用 left/right、top/bottom。
 *
 * @param {HTMLElement} el - 被编辑的元素
 * @param {HTMLElement} highlight - 高亮框（记录最终位置和大小）
 * @returns {string} CSS代码块，无变化时返回空字符串
 */
function buildLayoutCSSBlock(el, highlight) {
    const selector = buildLayoutSelector(el);
    const origRect = el.getBoundingClientRect();
    const finalRect = highlight.getBoundingClientRect();

    const finalW = Math.round(highlight.offsetWidth);
    const finalH = Math.round(highlight.offsetHeight);
    const widthChanged  = Math.abs(finalW - Math.round(origRect.width))  > 2;
    const heightChanged = Math.abs(finalH - Math.round(origRect.height)) > 2;
    const posChanged    = Math.abs(finalRect.left - origRect.left) > 2 ||
                          Math.abs(finalRect.top  - origRect.top)  > 2;

    const currentPos = window.getComputedStyle(el).position;
    const isAlreadyPositioned = currentPos === 'absolute' || currentPos === 'fixed';
    const shouldGenPos = posChanged && (layoutEditProps.outOfFlow || isAlreadyPositioned);

    const hasStyleProps = layoutEditProps.fontSize !== null ||
                          layoutEditProps.opacity !== null ||
                          layoutEditProps.rotation !== 0;
    if (!shouldGenPos && !widthChanged && !heightChanged && !hasStyleProps) return '';

    // 注释格式不含日期，作为稳定 marker 供 upsert 定位
    const lines = ['', `/* [布局编辑] ${selector} */`];
    const props = {};

    // ── 头像特殊路径 ──────────────────────────────────────────────────────────
    // mesAvatarWrapper/avatar 脱离文字流时，强制以 .mes 为定位基准，
    // 并额外生成 .mes 的 padding，让气泡自动为头像腾出空间。
    const isAvatarEl = el.classList.contains('mesAvatarWrapper') || el.classList.contains('avatar');
    const mesEl = isAvatarEl ? el.closest('.mes') : null;

    if (isAvatarEl && layoutEditProps.outOfFlow && mesEl) {
        const mesRect = mesEl.getBoundingClientRect();
        const isUser  = mesEl.getAttribute('is_user') === 'true';
        const mesSel  = `#chat .mes${isUser ? "[is_user='true']" : ":not([is_user='true'])"}`;

        // 强制 .mes 成为定位父容器
        lines.push(`${mesSel} { position: relative; }`);
        props['position'] = 'absolute';

        if (shouldGenPos) {
            const centerX = finalRect.left + finalRect.width  / 2;
            const centerY = finalRect.top  + finalRect.height / 2;
            const useRight  = centerX > mesRect.left + mesRect.width  / 2;
            const useBottom = centerY > mesRect.top  + mesRect.height / 2;
            const hProp = useRight  ? 'right'  : 'left';
            const vProp = useBottom ? 'bottom' : 'top';

            if (layoutEditProps.coordMode === '%') {
                const hPx = useRight  ? mesRect.right  - finalRect.right  : finalRect.left - mesRect.left;
                const vPx = useBottom ? mesRect.bottom - finalRect.bottom : finalRect.top  - mesRect.top;
                props[hProp] = `${Math.round(hPx / mesRect.width  * 1000) / 10}%`;
                props[vProp] = `${Math.round(vPx / mesRect.height * 1000) / 10}%`;
            } else {
                const hPx = useRight  ? mesRect.right  - finalRect.right  : finalRect.left - mesRect.left;
                const vPx = useBottom ? mesRect.bottom - finalRect.bottom : finalRect.top  - mesRect.top;
                props[hProp] = `${Math.round(hPx)}px`;
                props[vProp] = `${Math.round(vPx)}px`;
            }

            // 额外生成 .mes 的 padding：头像高度 + 超出量 + 8px 间隙
            // 这样气泡会在头像所在侧自动腾出空间，头像不再与文字重叠
            const avatarH = finalRect.height;
            if (useBottom) {
                const overflow = Math.max(0, finalRect.bottom - mesRect.bottom);
                const padding  = Math.round(avatarH + overflow + 8);
                lines.push(`${mesSel} { padding-bottom: ${padding}px; }`);
            } else {
                const overflow = Math.max(0, mesRect.top - finalRect.top);
                const padding  = Math.round(avatarH + overflow + 8);
                lines.push(`${mesSel} { padding-top: ${padding}px; }`);
            }
        }

        if (widthChanged) props['width'] = `${finalW}px`;
        // 头像元素必须锁定高度（即使用户未手动调整），
        // 否则不同角色的 .mesAvatarWrapper 内容高度不同（如名字长短），
        // 会让 bottom 定位的锚点上移，溢出 padding 区进入文字。
        props['height'] = `${finalH}px`;

        // 样式属性（字号/透明度/旋转）
        if (layoutEditProps.fontSize !== null) props['font-size'] = `${layoutEditProps.fontSize}em`;
        if (layoutEditProps.opacity !== null) props['opacity'] = String(layoutEditProps.opacity);
        if (layoutEditProps.rotation !== 0) props['transform'] = `rotate(${layoutEditProps.rotation}deg)`;

        if (Object.keys(props).length === 0) return '';
        lines.push(`${selector} {`);
        for (const [prop, val] of Object.entries(props)) lines.push(`    ${prop}: ${val};`);
        lines.push('}', '');

        // 头像容器尺寸改变时，同步生成 .avatar img 的尺寸规则，让图片真正填满容器
        if (widthChanged || heightChanged) {
            const imgSel = `${mesSel} .avatar img`;
            lines.push(`${imgSel} {`);
            if (widthChanged) lines.push(`    width: ${finalW}px;`);
            lines.push(`    height: ${finalH}px;`);
            lines.push('    object-fit: cover;', '}', '');
        }

        return lines.join('\n');
    }
    // ── 通用路径（非头像元素，或未开启脱离文字流） ─────────────────────────

    // 脱离文字流：给定位父容器加 position:relative（如果还没有）
    if (layoutEditProps.outOfFlow) {
        const posParent = findPositionedParent(el);
        if (window.getComputedStyle(posParent).position === 'static') {
            const parentSel = buildSimpleSelector(posParent);
            lines.push(`${parentSel} { position: relative; }`);
        }
        props['position'] = 'absolute';
    }

    // 坐标（四象限选择 left/right 和 top/bottom）
    if (shouldGenPos) {
        const posParent = findPositionedParent(el);
        const parentRect = posParent.getBoundingClientRect();
        const centerX = finalRect.left + finalRect.width  / 2;
        const centerY = finalRect.top  + finalRect.height / 2;
        const useRight  = centerX > parentRect.left + parentRect.width  / 2;
        const useBottom = centerY > parentRect.top  + parentRect.height / 2;
        const hProp = useRight  ? 'right'  : 'left';
        const vProp = useBottom ? 'bottom' : 'top';

        if (layoutEditProps.coordMode === '%') {
            const hPx = useRight  ? parentRect.right  - finalRect.right  : finalRect.left - parentRect.left;
            const vPx = useBottom ? parentRect.bottom - finalRect.bottom : finalRect.top  - parentRect.top;
            props[hProp] = `${Math.round(hPx / parentRect.width  * 1000) / 10}%`;
            props[vProp] = `${Math.round(vPx / parentRect.height * 1000) / 10}%`;
        } else {
            const hPx = useRight  ? parentRect.right  - finalRect.right  : finalRect.left - parentRect.left;
            const vPx = useBottom ? parentRect.bottom - finalRect.bottom : finalRect.top  - parentRect.top;
            props[hProp] = `${Math.round(hPx)}px`;
            props[vProp] = `${Math.round(vPx)}px`;
        }
    }

    if (widthChanged)  props['width']  = `${finalW}px`;
    if (heightChanged) props['height'] = `${finalH}px`;

    // 样式属性（字号/透明度/旋转）
    if (layoutEditProps.fontSize !== null) props['font-size'] = `${layoutEditProps.fontSize}em`;
    if (layoutEditProps.opacity !== null) props['opacity'] = String(layoutEditProps.opacity);
    if (layoutEditProps.rotation !== 0) props['transform'] = `rotate(${layoutEditProps.rotation}deg)`;

    if (Object.keys(props).length === 0) return '';

    lines.push(`${selector} {`);
    for (const [prop, val] of Object.entries(props)) {
        lines.push(`    ${prop}: ${val};`);
    }
    lines.push('}', '');

    return lines.join('\n');
}

/**
 * 将布局 CSS 块写入 CSS 编辑器：已有相同 selector 的块则替换，没有则追加
 *
 * @description
 * 识别块头注释 "/* [布局编辑] SELECTOR *\/" 作为定位 marker。
 * 替换范围：从该注释到下一个 [布局编辑] 注释之前（或文本末尾）。
 *
 * @param {string} selector - 被编辑元素的 CSS selector（用于 marker 匹配）
 * @param {string} newBlock - 要写入的完整 CSS 块
 */
function upsertLayoutCSSBlock(selector, newBlock) {
    const cssInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('ste-css-input'));
    if (!cssInput) return;

    const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 匹配从 marker 注释到下一个 [布局编辑] 注释之前，或到文本末尾
    const pattern = new RegExp(
        `\\n?/\\* \\[布局编辑\\] ${escSel} \\*/[\\s\\S]*?(?=\\n/\\* \\[布局编辑\\]|$)`
    );

    const oldMatch = cssInput.value.match(pattern);
    const mergedBlock = mergeLayoutExtraProperties(selector, oldMatch ? oldMatch[0] : '', newBlock);

    if (oldMatch) {
        cssInput.value = cssInput.value.replace(pattern, mergedBlock.trimEnd());
        logger.info('themeEngine', '[布局编辑] 已更新已有CSS块:', selector);
    } else {
        cssInput.value += mergedBlock;
        logger.info('themeEngine', '[布局编辑] 已追加新CSS块:', selector);
    }
}

/**
 * 合并旧块中的“额外属性”（布局编辑器不管理的属性）到新块的目标规则末尾
 *
 * @param {string} selector
 * @param {string} oldBlock
 * @param {string} newBlock
 * @returns {string}
 */
function mergeLayoutExtraProperties(selector, oldBlock, newBlock) {
    if (!oldBlock) return newBlock;

    const managedProps = new Set([
        'position', 'top', 'right', 'bottom', 'left',
        'width', 'height', 'opacity', 'transform', 'font-size'
    ]);

    const oldRuleBody = getLayoutRuleBody(oldBlock, selector);
    const newRuleBody = getLayoutRuleBody(newBlock, selector);
    if (!oldRuleBody || newRuleBody === null) return newBlock;

    const existingProps = getCSSPropertySet(newRuleBody);
    const extras = [];

    // 只按 “一行一个声明” 提取，兼容当前布局编辑器输出结构
    oldRuleBody.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes(':') || !trimmed.endsWith(';')) return;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx <= 0) return;

        const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
        if (managedProps.has(prop) || existingProps.has(prop)) return;
        extras.push(trimmed);
        existingProps.add(prop);
    });

    if (extras.length === 0) return newBlock;

    const insertText = extras.map(line => `    ${line}`).join('\n');
    const selectorRulePattern = buildSelectorRulePattern(selector);
    return newBlock.replace(selectorRulePattern, (full, body) => {
        const trimmedBody = body.trimEnd();
        const spacer = trimmedBody ? '\n' : '';
        return full.replace(body, `${trimmedBody}${spacer}${insertText}\n`);
    });
}

/**
 * 取出某个 selector 对应规则体（花括号内文本）
 *
 * @param {string} cssText
 * @param {string} selector
 * @returns {string | null}
 */
function getLayoutRuleBody(cssText, selector) {
    const pattern = buildSelectorRulePattern(selector);
    const match = cssText.match(pattern);
    return match ? match[1] : null;
}

/**
 * 构建 selector 规则匹配正则
 *
 * @param {string} selector
 * @returns {RegExp}
 */
function buildSelectorRulePattern(selector) {
    const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${escSel}\\s*\\{([\\s\\S]*?)\\}`);
}

/**
 * 从规则体提取已存在属性名集合
 *
 * @param {string} ruleBody
 * @returns {Set<string>}
 */
function getCSSPropertySet(ruleBody) {
    const props = new Set();
    ruleBody.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes(':')) return;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx <= 0) return;
        props.add(trimmed.slice(0, colonIdx).trim().toLowerCase());
    });
    return props;
}

/**
 * 取消布局编辑：移除高亮框和控制面板，重置状态
 */
/**
 * 实时预览：把当前的旋转/透明度/字号作为内联样式临时应用到选中元素
 * 确认后 CSS 接管，这里的内联样式在 cancelLayoutEdit 里清除
 */
function applyLayoutPreview() {
    if (!layoutSelected) return;
    const el = layoutSelected;
    el.style.opacity = layoutEditProps.opacity !== null ? String(layoutEditProps.opacity) : '';
    el.style.transform = layoutEditProps.rotation !== 0 ? `rotate(${layoutEditProps.rotation}deg)` : '';
    el.style.fontSize = layoutEditProps.fontSize !== null ? `${layoutEditProps.fontSize}em` : '';
}

function cancelLayoutEdit() {
    // 清除预览时临时加的内联样式，让 CSS 正常接管
    if (layoutSelected) {
        layoutSelected.style.opacity = '';
        layoutSelected.style.transform = '';
        layoutSelected.style.fontSize = '';
    }
    removeQEPreview();
    qeInitialSnapshot = null;
    removeLayoutHighlight();
    // 恢复快速编辑面板
    const qeNoSel = document.querySelector('.ste-qe-no-selection');
    const qeControls = document.querySelector('.ste-qe-controls');
    if (qeNoSel) qeNoSel.style.display = '';
    if (qeControls) qeControls.style.display = 'none';
    document.getElementById('ste-layout-controls')?.remove();
    layoutSelected = null;
    layoutDragState.mode = null;
}

/**
 * 进入布局编辑模式
 *
 * @description
 * 激活 body.ste-layout-mode，启动悬停检测（鼠标经过白名单元素自动高亮）。
 * 用 AbortController 统一管理所有模式内监听器，退出时一次性清除。
 */
function startLayoutMode() {
    if (layoutAbort) return;
    layoutAbort = new AbortController();
    const signal = layoutAbort.signal;

    document.body.classList.add('ste-layout-mode');

    const startBtn = document.getElementById('ste-layout-start');
    if (startBtn) {
        startBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> 退出布局编辑模式';
        startBtn.classList.add('active');
    }

    // 显示快速选择区
    document.getElementById('ste-layout-quickpick')?.classList.add('visible');

    // 鼠标悬停检测（未选中状态下持续更新高亮框）
    document.addEventListener('mouseover', (e) => {
        if (layoutSelected) return;
        // 忽略面板内部 + 高亮框自身（否则鼠标移到高亮框时会触发 remove → 重建 → 闪烁）
        const evtEl = /** @type {HTMLElement} */ (e.target);
        if (evtEl.closest('#ste-panel')) return;
        if (evtEl.closest('.ste-layout-highlight') || evtEl.closest('.ste-layout-controls')) return;
        const target = findLayoutTarget(evtEl);
        if (target) {
            updateLayoutHighlight(target);
        } else {
            removeLayoutHighlight();
        }
    }, { signal });

    // 触摸检测（手机端：点击元素高亮，再次点击选中）
    document.addEventListener('touchstart', (e) => {
        if (layoutSelected) return;
        const evtEl = /** @type {HTMLElement} */ (e.target);
        if (evtEl.closest('#ste-panel')) return;
        if (evtEl.closest('.ste-layout-highlight') || evtEl.closest('.ste-layout-controls')) return;
        const target = findLayoutTarget(evtEl);
        if (target) {
            updateLayoutHighlight(target);
        } else {
            removeLayoutHighlight();
        }
    }, { signal });

    // 滚动时取消选中（防止坐标偏差），但忽略面板自身内部的滚动
    document.addEventListener('scroll', (e) => {
        if (!layoutSelected) return;
        // 面板内部滚动（快速编辑面板、布局面板内容区）不触发取消
        const panel = document.getElementById('ste-panel');
        if (panel && panel.contains(/** @type {Node} */ (e.target))) return;
        cancelLayoutEdit();
    }, { signal, capture: true });

    // Esc：已选中则取消选中，未选中则退出模式
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (layoutSelected) {
            cancelLayoutEdit();
        } else {
            exitLayoutMode();
        }
    }, { signal });

    logger.info('themeEngine', '[布局编辑] 已进入布局编辑模式');
}

/**
 * 退出布局编辑模式：清理所有监听器和UI元素
 */
function exitLayoutMode() {
    if (!layoutAbort) return;
    layoutAbort.abort();
    layoutAbort = null;

    cancelLayoutEdit();
    document.body.classList.remove('ste-layout-mode');

    const startBtn = document.getElementById('ste-layout-start');
    if (startBtn) {
        startBtn.innerHTML = '<i class="fa-solid fa-up-down-left-right"></i> 进入布局编辑模式';
        startBtn.classList.remove('active');
    }

    // 隐藏快速选择区
    document.getElementById('ste-layout-quickpick')?.classList.remove('visible');

    logger.info('themeEngine', '[布局编辑] 已退出布局编辑模式');
}

/**
 * 快速选择：通过 CSS 类名找到聊天中第一个匹配的元素并直接选中
 *
 * @description
 * 解决小元素（楼层数/时间戳等）难以悬停选中的问题。
 * 先滚动到元素可见区域，再创建高亮并进入选中状态。
 * isUser 参数确保在正确的消息类型（用户/角色）里找元素，
 * 避免选错消息类型导致生成错误的选择器。
 *
 * @param {string} cssClass - 元素的 CSS 类名（如 'mesIDDisplay'）
 * @param {boolean} [isUser] - true=只在用户消息里找，false=只在角色消息里找，undefined=不限
 */
function quickSelectLayoutElement(cssClass, isUser) {
    if (!layoutAbort) return;
    if (layoutSelected) cancelLayoutEdit();

    let scope = '#chat ';
    if (isUser === true)  scope = "#chat .mes[is_user='true'] ";
    if (isUser === false) scope = "#chat .mes:not([is_user='true']) ";

    const el = /** @type {HTMLElement} */ (document.querySelector(`${scope}.${cssClass}`));
    if (!el) {
        logger.warn('themeEngine', '[布局编辑] 快速选择：未找到元素', cssClass, 'isUser:', isUser);
        return;
    }

    // 先滚动到可见区域，再等滚动结束后建立高亮
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => {
        // 重新获取位置（滚动后坐标变了）
        layoutHoverEl = null;
        updateLayoutHighlight(el);
        selectLayoutElement(el);
        logger.debug('themeEngine', '[布局编辑] 快速选择:', cssClass, 'isUser:', isUser);
    }, 350);
}

/**
 * 绑定布局标签页的按钮事件
 */
function bindLayoutButtons() {
    const startBtn = document.getElementById('ste-layout-start');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (layoutAbort) {
                exitLayoutMode();
            } else {
                startLayoutMode();
            }
        });
    }

    // 快速选择按钮（布局模式激活后才有效）
    document.querySelectorAll('.ste-layout-qp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const el = /** @type {HTMLElement} */ (btn);
            const cls = el.dataset.cls;
            const raw = el.dataset.isUser;
            const isUser = raw === 'true' ? true : raw === 'false' ? false : undefined;
            if (cls) quickSelectLayoutElement(cls, isUser);
        });
    });
}

/**
 * 绑定布局子标签页切换事件
 */
function bindLayoutSubtabs() {
    const subtabs = document.querySelectorAll('#ste-panel .ste-layout-subtab');
    const contents = document.querySelectorAll('#ste-panel .ste-layout-subtab-content');
    subtabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = /** @type {HTMLElement} */ (tab).dataset.subtab;
            subtabs.forEach(t => t.classList.toggle('active', /** @type {HTMLElement} */ (t).dataset.subtab === target));
            contents.forEach(c => c.classList.toggle('active', /** @type {HTMLElement} */ (c).dataset.subtab === target));
        });
    });
}

// ============================================
// 扩展启用/停用
// ============================================

/**
 * 停用扩展：撤销所有已应用的视觉效果
 *
 * @description
 * 关闭扩展勾选时调用，清除本扩展注入到页面的所有东西：
 * - 自定义CSS（移除 style#st-theme-engine-style）
 * - HTML注入元素（从DOM中移除）
 * 不会清除 JS 执行的副作用（JS 无法撤销）。
 */
export function deactivateAll() {
    // 退出可能运行中的交互模式
    exitLayoutMode();
    removeDecoOverlay();
    if (qeInputDebounceTimer) {
        window.clearTimeout(qeInputDebounceTimer);
        qeInputDebounceTimer = null;
    }
    qeInitialSnapshot = null;

    // 移除扩展自定义 CSS
    const userStyle = document.getElementById(STYLE_ID);
    if (userStyle) userStyle.remove();
    removeDecoStyles();

    // 清理可能遗留的 revert 标签（兼容旧版本数据）
    document.querySelectorAll('style[data-ste-revert]').forEach(s => s.remove());
    const faProtection = document.getElementById(FA_PROTECTION_ID);
    if (faProtection) faProtection.remove();

    // 清除所有 HTML 注入元素
    clearInjectedHTML();

    // 清除快速编辑预览（如有）
    const qePreview = document.getElementById('ste-qe-preview');
    if (qePreview) qePreview.remove();

    logger.info('themeEngine', '[Panel] 扩展已停用，所有视觉效果已清除');
}

