# KYX 签到系统 V6 - 部署指南

## 📋 系统概述

KYX 签到系统 V6 是一个基于 Cloudflare Workers 和 D1 数据库的现代化签到系统，支持：

- Linux.Do OAuth2 一键登录
- 连续签到奖励机制
- 管理员后台管理
- TXT文件导入兑换码
- 批量发放功能
- 排名奖励系统

## 🚀 快速部署

### 1. 环境准备

#### 必需工具
- Node.js 18+ 
- Cloudflare CLI (Wrangler)
- Git

#### 安装 Wrangler
```bash
npm install -g wrangler
```

#### 登录 Cloudflare
```bash
wrangler auth login
```

### 2. 数据库设置

#### 创建 D1 数据库
```bash
# 创建数据库
wrangler d1 create kyx-checkin-system

# 记录返回的数据库ID，用于配置
```

#### 初始化数据库结构
```bash
# 执行数据库架构
wrangler d1 execute kyx-checkin-system --file=./qdTest/new/schema-v6-complete.sql

# 初始化管理员账户
wrangler d1 execute kyx-checkin-system --file=./qdTest/new/init-admin.sql
```

### 3. 环境变量配置

#### 用户端配置 (workers-index.js)
在 Cloudflare Dashboard 中设置以下环境变量：

```bash
# Linux.Do OAuth2 配置
OAUTH_CLIENT_ID=your_linux_do_client_id
OAUTH_CLIENT_SECRET=your_linux_do_client_secret

# 会话密钥（随机生成）
SESSION_SECRET=your_random_session_secret_32_chars

# 前端URL
FRONTEND_URL=https://your-domain.com
```

#### 管理端配置 (workers-admin.js)
管理端无需额外环境变量，使用相同的 D1 数据库。

### 4. 部署 Workers

#### 配置 wrangler.toml (用户端)
```toml
name = "kyx-checkin-user"
main = "frontend/new/workers-index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "kyx-checkin-system"
database_id = "your-database-id"

[env.production.vars]
OAUTH_CLIENT_ID = "your_client_id"
OAUTH_CLIENT_SECRET = "your_client_secret"
SESSION_SECRET = "your_session_secret"
FRONTEND_URL = "https://your-domain.com"
```

#### 配置 wrangler.toml (管理端)
```toml
name = "kyx-checkin-admin"
main = "frontend/new/workers-admin.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "kyx-checkin-system"
database_id = "your-database-id"
```

#### 部署命令
```bash
# 部署用户端
wrangler deploy --config wrangler-user.toml

# 部署管理端
wrangler deploy --config wrangler-admin.toml
```

### 5. 域名配置

#### 绑定自定义域名
1. 在 Cloudflare Dashboard 中进入 Workers & Pages
2. 选择对应的 Worker
3. 点击 "Custom domains"
4. 添加自定义域名

#### 推荐域名结构
- 用户端: `https://checkin.yourdomain.com`
- 管理端: `https://admin-checkin.yourdomain.com`

## 🔧 配置说明

### Linux.Do OAuth2 配置

#### 1. 申请 OAuth2 应用
1. 访问 Linux.Do 开发者设置
2. 创建新的 OAuth2 应用
3. 设置回调URL: `https://your-domain.com/auth/callback`
4. 获取 Client ID 和 Client Secret

#### 2. 权限范围
- `read` - 读取用户基本信息
- `email` - 读取用户邮箱（可选）

### 管理员账户

#### 默认管理员
- 用户名: `admin`
- 密码: `admin123`
- **重要**: 部署后立即修改密码！

#### 修改管理员密码
```sql
-- 生成新的盐值和密码哈希
UPDATE admins 
SET password_hash = 'new_hash', 
    salt = 'new_salt',
    updated_at = datetime('now')
WHERE username = 'admin';
```

### 签到奖励配置

#### 默认奖励规则
- 基础签到: $10.00
- 连续5天: $100.00
- 连续10天: $500.00
- 连续15天: $1000.00
- 连续30天: $3000.00

#### 修改奖励规则
通过管理后台 -> 设置 -> 签到奖励配置进行修改

## 📊 功能使用指南

### 用户端功能

#### 1. 用户登录
- 访问用户端域名
- 点击 "Linux.Do 登录"
- 授权后自动跳转回系统

#### 2. 每日签到
- 登录后点击 "签到" 按钮
- 系统自动判断UTC+8时区
- 获得兑换码和奖励

#### 3. 查看统计
- 总签到天数
- 连续签到天数
- 累计获得金额
- 兑换码历史记录

### 管理端功能

#### 1. 管理员登录
- 访问管理端域名
- 使用用户名密码登录

#### 2. 兑换码管理
- 查看所有兑换码
- 搜索特定兑换码
- 查看发放状态

#### 3. TXT文件导入
```javascript
// 通过 API 导入兑换码
const formData = new FormData();
formData.append('file', txtFile);
formData.append('amount', '10.00');
formData.append('adminId', adminId);

fetch('/api/admin/codes/import', {
    method: 'POST',
    body: formData
});
```

#### 4. 批量发放
```javascript
// 统一发放给所有用户
fetch('/api/admin/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        type: 'all',
        amount: 10.00,
        adminId: adminId
    })
});

// 发放给指定用户
fetch('/api/admin/distribute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        type: 'selected',
        userIds: [1, 2, 3],
        amount: 10.00,
        adminId: adminId
    })
});
```

#### 5. 排名奖励
```javascript
// 发放给签到前N名用户
fetch('/api/admin/ranking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        topN: 10,
        amount: 50.00,
        adminId: adminId
    })
});
```

## 🔒 安全配置

### 1. 管理员安全
- 立即修改默认密码
- 使用强密码策略
- 定期更换密码
- 启用访问日志监控

### 2. 数据库安全
- 定期备份数据库
- 监控异常访问
- 设置访问权限

### 3. API安全
- 验证所有输入参数
- 实施速率限制
- 记录操作日志

## 📈 监控和维护

### 1. 系统监控
- Cloudflare Analytics
- Worker 执行统计
- 错误日志监控

### 2. 数据库维护
```sql
-- 清理过期会话
DELETE FROM user_sessions WHERE expires_at < datetime('now');
DELETE FROM admin_sessions WHERE expires_at < datetime('now');

-- 统计数据检查
SELECT 
    COUNT(*) as total_users,
    COUNT(CASE WHEN last_login_at > datetime('now', '-30 days') THEN 1 END) as active_users
FROM users;
```

### 3. 性能优化
- 定期检查数据库索引
- 监控 Worker 执行时间
- 优化查询语句

## 🚨 故障排除

### 常见问题

#### 1. OAuth2 登录失败
- 检查 Client ID 和 Secret
- 验证回调URL配置
- 检查域名SSL证书

#### 2. 数据库连接失败
- 验证数据库ID配置
- 检查 D1 绑定设置
- 查看 Worker 日志

#### 3. 管理员登录失败
- 验证用户名密码
- 检查数据库中管理员记录
- 查看会话配置

### 日志查看
```bash
# 查看 Worker 日志
wrangler tail kyx-checkin-user
wrangler tail kyx-checkin-admin

# 查看数据库内容
wrangler d1 execute kyx-checkin-system --command="SELECT * FROM users LIMIT 10"
```

## 📞 技术支持

### 联系方式
- GitHub Issues: [项目地址]
- 邮箱: [支持邮箱]
- 文档: [文档地址]

### 更新日志
- V6.0.0: 完整重构，支持连续签到奖励
- V5.x: 基础功能实现
- V4.x: 初始版本

---

**注意**: 本系统仅供学习和测试使用，生产环境部署请确保充分的安全测试和性能优化。
