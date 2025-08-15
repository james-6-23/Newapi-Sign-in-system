# KYX 签到系统 - 完整部署指南

## 🚀 快速部署

### 1. 准备工作

确保你有：
- Cloudflare 账户
- Wrangler CLI 已安装并登录
- Node.js 环境（用于生成管理员密码）

### 2. 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create kyx-checkin-system

# 记录返回的 database_id，稍后需要用到
```

### 3. 配置 wrangler.toml

创建两个配置文件：

**用户端 (wrangler-user-simple.toml):**
```toml
name = "kyx-checkin"
main = "workers-index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "kyx-checkin-system"
database_id = "your-database-id-here"

[vars]
OAUTH_CLIENT_ID = "your-oauth-client-id"
OAUTH_CLIENT_SECRET = "your-oauth-client-secret"
```

**管理端 (wrangler-admin-simple.toml):**
```toml
name = "kyx-admin"
main = "workers-admin.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "kyx-checkin-system"
database_id = "your-database-id-here"
```

### 4. 创建数据库表

```bash
# 创建所有必需的表
wrangler d1 execute kyx-checkin-system --command="
-- 用户表
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    linux_do_id INTEGER UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- 签到记录表
CREATE TABLE check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date TEXT NOT NULL,
    check_in_time TEXT NOT NULL,
    redemption_code TEXT,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users (id),
    UNIQUE(user_id, check_in_date)
);

-- 兑换码表
CREATE TABLE redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    is_distributed BOOLEAN DEFAULT FALSE,
    distributed_to INTEGER,
    distributed_at TEXT,
    distributed_by INTEGER,
    distribution_type TEXT,
    batch_id INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (distributed_to) REFERENCES users (id),
    FOREIGN KEY (distributed_by) REFERENCES admins (id),
    FOREIGN KEY (batch_id) REFERENCES upload_batches (id)
);

-- 管理员表
CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    created_by INTEGER,
    notes TEXT
);

-- 管理员会话表
CREATE TABLE admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    admin_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_accessed_at TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (admin_id) REFERENCES admins (id)
);

-- 上传批次表
CREATE TABLE upload_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    amount REAL NOT NULL,
    total_codes INTEGER NOT NULL,
    valid_codes INTEGER NOT NULL,
    duplicate_codes INTEGER NOT NULL,
    invalid_codes INTEGER NOT NULL,
    uploaded_by INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL,
    processed_at TEXT,
    upload_status TEXT DEFAULT 'pending',
    notes TEXT,
    FOREIGN KEY (uploaded_by) REFERENCES admins (id)
);

-- 操作日志表
CREATE TABLE operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_type TEXT NOT NULL,
    operator_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    operation_detail TEXT,
    target_type TEXT,
    target_id INTEGER,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT
);

-- 发放日志表
CREATE TABLE distribution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    target_users TEXT,
    amount REAL,
    codes_distributed INTEGER NOT NULL,
    codes_failed INTEGER NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (admin_id) REFERENCES admins (id)
);
"
```

### 5. 生成管理员账户

```bash
# 运行密码生成工具
node generate-admin-password.js
```

复制输出的 SQL 语句，然后执行：

```bash
# 插入管理员账户（使用生成的 SQL）
wrangler d1 execute kyx-checkin-system --command="
INSERT INTO admins (username, password_hash, salt, email, created_at) 
VALUES ('admin', 'your-generated-hash', 'your-generated-salt', 'admin@example.com', datetime('now'));
"
```

### 6. 添加测试兑换码

```bash
# 添加一些测试兑换码
wrangler d1 execute kyx-checkin-system --command="
INSERT INTO redemption_codes (code, amount, created_at) VALUES 
('TEST001', 5.00, datetime('now')),
('TEST002', 10.00, datetime('now')),
('TEST003', 15.00, datetime('now')),
('TEST004', 20.00, datetime('now')),
('TEST005', 25.00, datetime('now'));
"
```

### 7. 部署 Workers

```bash
# 部署用户端
wrangler deploy --config wrangler-user-simple.toml

# 部署管理端
wrangler deploy --config wrangler-admin-simple.toml
```

### 8. 配置自定义域名（可选）

```bash
# 为用户端配置域名
wrangler route add "checkin.yourdomain.com/*" kyx-checkin

# 为管理端配置域名
wrangler route add "admin.yourdomain.com/*" kyx-admin
```

## 📋 部署后检查清单

### ✅ 用户端测试
1. 访问用户端 URL
2. 测试 Linux Do 登录
3. 测试签到功能
4. 检查兑换码发放

### ✅ 管理端测试
1. 访问管理端 URL
2. 使用生成的账户登录
3. 检查仪表盘数据
4. 测试各个管理功能

### ✅ 数据库检查
```bash
# 检查表是否创建成功
wrangler d1 execute kyx-checkin-system --command="SELECT name FROM sqlite_master WHERE type='table';"

# 检查管理员账户
wrangler d1 execute kyx-checkin-system --command="SELECT username, email, created_at FROM admins;"

# 检查兑换码
wrangler d1 execute kyx-checkin-system --command="SELECT code, amount, is_distributed FROM redemption_codes LIMIT 5;"
```

## 🔧 常见问题

### Q: 登录失败怎么办？
A: 检查密码哈希是否正确生成，确认管理员账户状态为激活。

### Q: 数据库连接失败？
A: 确认 wrangler.toml 中的 database_id 是否正确。

### Q: 兑换码不显示？
A: 检查数据库中是否有兑换码数据，确认 SQL 查询是否正确。

### Q: 会话过期太快？
A: 在 workers-admin.js 中修改会话过期时间（默认24小时）。

## 🛡️ 安全建议

1. **立即修改默认密码**
2. **使用强密码策略**
3. **定期备份数据库**
4. **监控访问日志**
5. **限制管理员数量**
6. **使用 HTTPS**
7. **定期更新代码**

## 📊 监控和维护

### 查看 Workers 日志
```bash
wrangler tail kyx-checkin
wrangler tail kyx-admin
```

### 数据库备份
```bash
# 导出数据
wrangler d1 export kyx-checkin-system --output backup.sql
```

### 性能监控
- 在 Cloudflare Dashboard 中查看 Workers 指标
- 监控 D1 数据库使用情况
- 设置告警规则

## 🔄 更新部署

```bash
# 更新代码后重新部署
wrangler deploy --config wrangler-user-simple.toml
wrangler deploy --config wrangler-admin-simple.toml
```

## 📞 技术支持

如遇问题，请检查：
1. Cloudflare Workers 日志
2. D1 数据库状态
3. 网络连接
4. 浏览器控制台错误

## 🎉 部署完成

恭喜！你已经成功部署了 KYX 签到系统。

**用户端地址**: `https://your-worker.your-subdomain.workers.dev/`
**管理端地址**: `https://your-admin-worker.your-subdomain.workers.dev/`

**默认管理员账户**: 
- 用户名: admin
- 密码: admin123 (请立即修改！)

开始享受你的签到系统吧！ 🚀
