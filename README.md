# 每日签到兑换码系统

一个基于 Cloudflare 生态系统的签到兑换码系统，使用 Linux Do OAuth2 进行用户认证。

## 功能特性

- 🔐 **Linux Do OAuth2 登录** - 安全的第三方认证
- 📅 **每日签到** - 每天签到获取唯一兑换码
- 🎫 **兑换码管理** - 查看和搜索所有获得的兑换码
- 📊 **签到日历** - 可视化展示签到记录
- 📱 **响应式设计** - 支持移动端和桌面端
- ⚡ **无服务器架构** - 基于 Cloudflare Workers 和 D1

## 技术栈

- **前端**: HTML/CSS/JavaScript (原生)
- **后端**: Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)
- **部署**: Cloudflare Pages + Workers
- **认证**: Linux Do OAuth2

## 快速开始

### 前置要求

1. Cloudflare 账号
2. Linux Do 开发者账号
3. Node.js 16+ 和 npm
4. Wrangler CLI (`npm install -g wrangler`)

### 1. 创建 Linux Do OAuth2 应用

1. 访问 [Linux Do 开发者中心](https://connect.linux.do)
2. 创建新应用
3. 记录 `Client ID` 和 `Client Secret`
4. 设置回调 URL: `https://your-domain.pages.dev/auth/callback`

### 2. 克隆项目

```bash
git clone https://github.com/your-username/checkin-system.git
cd checkin-system
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

### 4. 创建 D1 数据库

```bash
# 登录 Cloudflare
wrangler login

# 创建数据库
wrangler d1 create checkin-system

# 记录返回的 database_id
```

### 5. 初始化数据库

```bash
cd backend
wrangler d1 execute checkin-system --file=./src/schema.sql
```

### 6. 配置 Workers

编辑 `backend/wrangler.toml`，更新数据库 ID：

```toml
[[d1_databases]]
binding = "DB"
database_name = "checkin-system"
database_id = "your-database-id-here"  # 替换为实际的 ID
```

### 7. 设置密钥

```bash
cd backend
wrangler secret put CLIENT_ID
# 输入你的 Linux Do Client ID

wrangler secret put CLIENT_SECRET
# 输入你的 Linux Do Client Secret
```

### 8. 部署后端

```bash
cd backend
wrangler deploy
# 记录返回的 Workers URL
```

### 9. 更新前端配置

编辑 `frontend/js/config.js`，更新 API URL：

```javascript
const API_BASE_URL = 'https://your-worker.your-subdomain.workers.dev';
```

### 10. 部署前端

#### 方法一：使用 Cloudflare Pages Dashboard

1. 登录 Cloudflare Dashboard
2. 进入 Pages
3. 创建新项目
4. 连接 Git 仓库或上传 `frontend` 文件夹
5. 设置构建配置：
   - 构建命令：留空
   - 构建输出目录：`/`
6. 部署

#### 方法二：使用 Wrangler CLI

```bash
cd frontend
wrangler pages deploy . --project-name=checkin-system
```

## 项目结构

```
├── frontend/                # 前端代码
│   ├── index.html          # 主页
│   ├── codes.html          # 兑换码管理
│   ├── login.html          # 登录页
│   ├── css/                # 样式文件
│   └── js/                 # JavaScript 文件
├── backend/                # 后端代码
│   ├── src/                # 源代码
│   │   ├── index.js        # 入口文件
│   │   ├── routes/         # 路由处理
│   │   ├── middleware/     # 中间件
│   │   └── utils/          # 工具函数
│   └── wrangler.toml       # Workers 配置
├── scripts/                # 脚本文件
├── .env.example            # 环境变量示例
└── README.md               # 本文件
```

## API 文档

### 认证相关

- `GET /api/auth/login` - 获取 OAuth2 授权 URL
- `GET /api/auth/callback` - OAuth2 回调处理
- `POST /api/auth/logout` - 登出
- `GET /api/auth/me` - 获取当前用户信息

### 签到相关

- `POST /api/checkin` - 执行签到
- `GET /api/checkin/today` - 检查今日签到状态
- `GET /api/checkin/calendar` - 获取签到日历数据

### 兑换码相关

- `GET /api/codes` - 获取兑换码列表
- `GET /api/codes/:id` - 获取兑换码详情
- `GET /api/codes/search` - 搜索兑换码

## 开发指南

### 本地开发

1. 启动后端开发服务器：
```bash
cd backend
wrangler dev
```

2. 启动前端开发服务器（可选）：
```bash
cd frontend
python -m http.server 3000
# 或使用其他静态服务器
```

### 数据库迁移

如需更新数据库结构，创建新的 SQL 文件并执行：

```bash
wrangler d1 execute checkin-system --file=./migrations/new-migration.sql
```

## 常见问题

### Q: 登录后跳转失败？
A: 检查 Linux Do 应用中的回调 URL 是否正确配置。

### Q: CORS 错误？
A: 确保 `wrangler.toml` 中的 `FRONTEND_URL` 与实际部署地址一致。

### Q: 数据库连接失败？
A: 检查 D1 数据库 ID 是否正确配置在 `wrangler.toml` 中。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

如有问题，请提交 Issue 或联系作者。