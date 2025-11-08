/**
 * 手机框架 HTML 模板
 * 
 * 职责：
 * - 提供手机容器的完整 HTML 结构
 * - 包含：顶部栏、三个标签页容器、底部导航
 * 
 * 来源：
 * - 复制自 phone-demo.html
 * - 已去除演示用的硬编码内容
 */

/**
 * 获取手机框架的 HTML 模板
 * 
 * @returns {string} 完整的手机框架 HTML
 */
export function getPhoneFrameHTML() {
  return `
        <div class="phone-overlay">
            <div class="phone-container">
                <!-- 主页面布局（三个主标签页共享） -->
                <div id="main-layout" class="phone-page active">
                    <!-- 顶部栏（共享） -->
                    <div class="phone-header">
                        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect fill='%231296db' width='40' height='40'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='16'%3EU%3C/text%3E%3C/svg%3E" 
                             alt="用户头像" class="phone-header-avatar" id="phone-user-avatar">
                        <div class="phone-header-title" id="phone-header-title">
                            <div class="phone-header-user-name">加载中...</div>
                            <div class="phone-header-user-status">在线</div>
                        </div>
                        <div class="phone-header-actions">
                            <button class="phone-header-btn" id="phone-btn-plus" title="更多功能">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                            <button class="phone-header-btn" id="phone-btn-close" title="关闭">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>

                    <!-- 右上角加号菜单（弹出菜单，由 JS 填充内容） -->
                    <div class="add-menu" id="add-menu"></div>

                    <!-- 内容区（三个标签页切换） -->
                    <div class="phone-content">
                        <!-- 消息标签页 -->
                        <div id="tab-messages" class="phone-tab active">
                            <p style="text-align: center; padding: 20px; color: #999;">
                                消息列表（待实现）
                            </p>
                        </div>

                        <!-- 联系人标签页 -->
                        <div id="tab-contacts" class="phone-tab">
                            <p style="text-align: center; padding: 20px; color: #999;">
                                联系人列表（待实现）
                            </p>
                        </div>

                        <!-- 动态标签页 -->
                        <div id="tab-moments" class="phone-tab">
                            <p style="text-align: center; padding: 20px; color: #999;">
                                空间动态（待实现）
                            </p>
                        </div>
                    </div>

                    <!-- 底部导航（共享） -->
                    <div class="phone-nav">
                        <button class="phone-nav-item active" data-tab="messages">
                            <i class="fa-solid fa-comment"></i>
                            <span>消息</span>
                        </button>
                        <button class="phone-nav-item" data-tab="contacts">
                            <i class="fa-solid fa-user"></i>
                            <span>联系人</span>
                        </button>
                        <button class="phone-nav-item" data-tab="moments">
                            <i class="fa-solid fa-heart"></i>
                            <span>动态</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

