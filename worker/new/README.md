# KYX 签到系统 - 现代化前端

## 🎨 设计特点

- **极简黑白设计**：现代化的黑白主色调，高级感十足
- **深色/浅色主题**：支持主题切换，适应不同使用场景
- **响应式布局**：完美适配桌面和移动设备
- **流畅动画**：精心设计的过渡动画，提升用户体验
- **模块化架构**：清晰的代码结构，易于维护和扩展

## 📁 文件结构

```
frontend/new/
├── css/
│   ├── variables.css    # CSS变量定义（颜色、间距、字体等）
│   └── main.css         # 主样式文件（组件样式、工具类）
├── js/
│   ├── config.js        # 配置文件（API端点、应用配置）
│   ├── utils.js         # 工具函数（请求、存储、主题等）
│   └── app.js          # 主应用逻辑（签到功能）
├── login.html          # 登录页面
├── index.html          # 主页面（签到、兑换码）
└── README.md          # 本文档
```

## 🚀 快速部署

### 1. 更新API地址

编辑 `js/config.js` 文件，修改API地址：

```javascript
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8787' 
    : 'https://apisign.kkyyxx.xyz';  // 改为您的API地址
```

### 2. 部署到 Cloudflare Pages

1. 将 `frontend/new` 文件夹上传到您的仓库
2. 在 Cloudflare Pages 中创建项目
3. 设置构建配置：
   - 构建命令：留空
   - 构建输出目录：`frontend/new`
4. 部署完成

### 3. 部署到其他平台

- **Vercel**: 直接导入GitHub仓库，设置根目录为 `frontend/new`
- **Netlify**: 拖拽 `frontend/new` 文件夹到Netlify
- **GitHub Pages**: 将文件推送到 `gh-pages` 分支
- **传统服务器**: 直接上传文件到Web服务器

## 🎯 功能特性

### 登录页面 (`login.html`)
- 极简黑色背景设计
- Linux Do OAuth 登录
- 流畅的加载动画
- 错误提示处理

### 主页面 (`index.html`)
- **每日签到**：一键签到领取兑换码
- **统计信息**：总签到天数、连续签到、兑换码数量、累计金额
- **兑换码管理**：查看最近的兑换码，一键复制
- **主题切换**：深色/浅色模式切换
- **用户信息**：显示用户头像和用户名

## 🔧 配置说明

### API端点配置

所有API端点都在 `js/config.js` 中定义：

```javascript
const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/api/auth/login',
        LOGOUT: '/api/logout',
        USER_INFO: '/api/user'
    },
    CHECKIN: {
        DO_CHECKIN: '/api/checkin',
        RECORDS: '/api/checkin/records'
    }
    // ... 更多端点
};
```

### 主题配置

支持深色和浅色主题，默认为深色：

```javascript
// 在 js/config.js 中
DEFAULT_THEME: 'dark'  // 可选 'light' 或 'dark'
```

### 本地存储

系统使用本地存储保存：
- 主题偏好
- 用户信息缓存
- 会话状态

## 🛠️ 开发指南

### 添加新页面

1. 创建HTML文件
2. 引入必要的CSS和JS文件：
```html
<link rel="stylesheet" href="css/main.css">
<script src="js/config.js"></script>
<script src="js/utils.js"></script>
```

3. 使用工具函数：
```javascript
// 发送请求
const data = await utils.get('/api/endpoint');

// 显示通知
utils.showToast('操作成功', 'success');

// 切换主题
utils.toggleTheme();
```

### 自定义样式

所有颜色和间距都使用CSS变量定义，可以在 `css/variables.css` 中修改：

```css
:root {
    --color-accent: #0f0f0f;  /* 主色调 */
    --spacing-lg: 1.5rem;      /* 大间距 */
    --radius-lg: 0.75rem;      /* 圆角 */
}
```

### 响应式断点

```css
/* 移动端 */
@media (max-width: 768px) { }

/* 平板 */
@media (min-width: 768px) and (max-width: 1024px) { }

/* 桌面 */
@media (min-width: 1024px) { }
```

## 📱 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- 移动端浏览器

## 🔒 安全特性

- HttpOnly Cookie 会话管理
- CORS 跨域保护
- XSS 防护
- CSRF 保护

## 📝 更新日志

### v1.0.0 (2024-12-13)
- ✨ 全新的现代化UI设计
- 🎨 深色/浅色主题支持
- 📱 响应式布局优化
- ⚡ 性能优化
- 🔧 模块化代码结构

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**KYX 签到系统** - 现代化的每日签到解决方案