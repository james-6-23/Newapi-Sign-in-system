# KYX 签到系统

基于 Next.js 14 和 MySQL 的现代化签到奖励系统，支持 Linux Do OAuth2 认证。

## 功能特性

### 用户功能
- 🔐 Linux Do OAuth2 登录认证
- ✅ 每日签到系统，连续签到额外奖励
- 🎯 13级修仙境界等级系统
- 🎰 基于等级的转盘抽奖系统
- 💰 兑换码生成和管理
- 📊 个人数据统计和历史记录
- 🎒 物品背包系统（丹药/毒药）

### 管理员功能
- 👥 用户管理和状态控制
- 📝 兑换码批量导入和分发
- 🎁 奖品池和转盘配置管理
- ⚙️ 系统参数配置
- 📈 数据统计和分析
- 📋 操作日志和审计

## 技术架构

- **前端**: Next.js 14 + React 18 + TypeScript
- **后端**: Next.js API Routes + Prisma ORM
- **数据库**: MySQL 8.0
- **缓存**: Redis 7
- **认证**: NextAuth.js + Linux Do OAuth2
- **状态管理**: Zustand + React Query
- **样式**: Tailwind CSS + Shadcn/ui
- **部署**: Docker + Docker Compose

## 快速开始

### 环境要求

- Node.js 18+
- Docker & Docker Compose
- MySQL 8.0
- Redis 7

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd kyx-signin-system
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下变量：
```env
# 数据库配置
DATABASE_URL="mysql://kyx_user:kyx_password@localhost:3306/kyx_system"

# Redis配置
REDIS_URL="redis://localhost:6379"

# NextAuth配置
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Linux Do OAuth2配置
LINUX_DO_CLIENT_ID="your-linux-do-client-id"
LINUX_DO_CLIENT_SECRET="your-linux-do-client-secret"

# JWT配置
JWT_SECRET="your-jwt-secret-key"
```

4. **启动数据库服务**
```bash
docker-compose up -d mysql redis
```

5. **初始化数据库**
```bash
npx prisma generate
npx prisma db push
```

6. **启动开发服务器**
```bash
npm run dev
```

访问 http://localhost:3000 查看应用。

### Docker 部署

1. **构建并启动所有服务**
```bash
docker-compose up -d
```

2. **初始化数据库**
```bash
docker-compose exec app npx prisma db push
```

## 项目结构

```
kyx-signin-system/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/            # API 路由
│   │   ├── login/          # 登录页面
│   │   ├── dashboard/      # 用户仪表板
│   │   ├── profile/        # 用户资料
│   │   ├── lottery/        # 抽奖系统
│   │   ├── codes/          # 兑换码管理
│   │   └── admin/          # 管理员后台
│   ├── components/         # React 组件
│   ├── lib/               # 工具库
│   │   ├── prisma.ts      # 数据库客户端
│   │   ├── redis.ts       # Redis 客户端
│   │   └── auth.ts        # 认证配置
│   └── types/             # TypeScript 类型定义
├── prisma/
│   └── schema.prisma      # 数据库模型
├── docker-compose.yml     # Docker 编排
├── Dockerfile            # Docker 镜像
└── README.md
```

## API 文档

### 认证相关
- `GET /api/auth/signin` - 登录页面
- `POST /api/auth/callback` - OAuth2 回调
- `GET /api/auth/me` - 获取当前用户信息

### 签到系统
- `POST /api/checkin` - 执行签到
- `GET /api/checkin` - 获取签到状态
- `GET /api/checkin/history` - 获取签到历史

### 用户管理
- `GET /api/user/profile` - 获取用户资料
- `GET /api/user/items` - 获取用户物品
- `GET /api/user/codes/history` - 获取兑换码历史

### 抽奖系统
- `GET /api/lottery/wheel-config` - 获取转盘配置
- `POST /api/lottery/spin` - 执行抽奖
- `GET /api/lottery/history` - 获取抽奖历史

### 管理员接口
- `GET /api/admin/users` - 获取用户列表
- `POST /api/admin/codes/upload` - 批量上传兑换码
- `POST /api/admin/codes/distribute` - 分发兑换码

## 数据库设计

### 核心表结构

- **users** - 用户基本信息
- **check_ins** - 签到记录
- **redemption_codes** - 兑换码
- **user_levels** - 等级配置
- **prize_pool** - 奖品池
- **wheel_config** - 转盘配置
- **user_lottery_records** - 抽奖记录
- **user_items** - 用户物品

详细的数据库结构请查看 `prisma/schema.prisma` 文件。

## 开发指南

### 添加新功能

1. **创建数据库模型**
   - 在 `prisma/schema.prisma` 中定义新模型
   - 运行 `npx prisma db push` 更新数据库

2. **创建API路由**
   - 在 `src/app/api/` 下创建新的路由文件
   - 实现相应的业务逻辑

3. **创建前端页面**
   - 在 `src/app/` 下创建新页面
   - 使用 React Query 进行数据获取

### 代码规范

- 使用 TypeScript 进行类型检查
- 遵循 ESLint 规则
- 使用 Prettier 格式化代码
- 组件使用 PascalCase 命名
- 文件使用 kebab-case 命名

## 部署指南

### 生产环境部署

1. **环境配置**
   - 配置生产环境的环境变量
   - 设置安全的密钥和密码

2. **数据库迁移**
   - 运行数据库迁移脚本
   - 初始化基础数据

3. **应用部署**
   - 构建生产版本
   - 配置反向代理
   - 设置 SSL 证书

### 监控和维护

- 使用 Docker 健康检查
- 配置日志收集
- 设置性能监控
- 定期备份数据库

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查 DATABASE_URL 配置
   - 确认 MySQL 服务运行状态

2. **Redis 连接失败**
   - 检查 REDIS_URL 配置
   - 确认 Redis 服务运行状态

3. **OAuth2 认证失败**
   - 检查 Linux Do 应用配置
   - 确认回调 URL 设置正确

### 调试技巧

- 查看 Docker 容器日志：`docker-compose logs app`
- 检查数据库状态：`npx prisma studio`
- 测试 API 接口：使用 Postman 或 curl

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交 Issue 或联系开发团队。

---

**版本**: v1.0.0  
**最后更新**: 2025年8月15日  
**维护团队**: KYX 开发团队