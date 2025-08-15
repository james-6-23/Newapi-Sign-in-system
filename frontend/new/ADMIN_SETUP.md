# KYX 签到系统 - 管理后台设置指南

## 概述

这是一个完整的管理后台系统，支持用户名密码登录，提供兑换码管理、用户管理、签到记录查看等功能。

## 文件说明

- `workers-admin.js` - 完整的管理后台 Cloudflare Workers 脚本
- `workers-index.js` - 用户端签到系统 Workers 脚本

## 数据库表结构

### 管理员表 (admins)
```sql
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
```

### 管理员会话表 (admin_sessions)
```sql
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
```

### 上传批次表 (upload_batches)
```sql
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
```

### 操作日志表 (operation_logs)
```sql
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
```

### 发放日志表 (distribution_logs)
```sql
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
```

## 部署步骤

### 1. 创建 D1 数据库
```bash
wrangler d1 create kyx-checkin-system
```

### 2. 更新 wrangler.toml
```toml
name = "kyx-admin"
main = "workers-admin.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "kyx-checkin-system"
database_id = "your-database-id"
```

### 3. 创建数据库表
```bash
# 创建基础表（如果还没有）
wrangler d1 execute kyx-checkin-system --file=schema.sql

# 创建管理员相关表
wrangler d1 execute kyx-checkin-system --command="
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

### 4. 创建初始管理员账户
```bash
# 注意：需要先计算密码哈希，这里提供一个示例
# 用户名: admin, 密码: admin123
wrangler d1 execute kyx-checkin-system --command="
INSERT INTO admins (username, password_hash, salt, email, created_at) 
VALUES (
    'admin', 
    'your-hashed-password', 
    'your-salt', 
    'admin@example.com', 
    datetime('now')
);
"
```

### 5. 部署 Workers
```bash
wrangler deploy
```

## 功能特性

### 🔐 安全认证
- 用户名密码登录
- 会话管理（24小时有效期）
- 密码哈希加盐存储
- 自动登出功能

### 📊 仪表盘
- 兑换码统计（总数、已发放、未发放、发放率）
- 快速操作按钮
- 实时数据刷新

### 🎫 兑换码管理
- 兑换码列表查看
- 搜索功能
- 状态筛选
- 批量导入（开发中）

### 👥 用户管理
- 用户列表查看
- 签到统计
- 兑换码数量统计

### 📅 签到记录
- 签到记录查看
- 状态跟踪
- 时间排序

### 🔧 高级功能
- 批量发放兑换码
- 操作日志记录
- 文件上传处理
- 错误处理和回滚

## 访问地址

- 管理后台首页: `https://your-domain.com/`
- 登录页面: `https://your-domain.com/login`
- API 端点: `https://your-domain.com/api/admin/*`

## 默认账户

请在部署后立即修改默认管理员密码！

## 安全建议

1. 使用强密码
2. 定期更换密码
3. 监控登录日志
4. 限制管理员数量
5. 定期备份数据库

## 故障排除

### 登录失败
1. 检查用户名密码是否正确
2. 确认管理员账户是否激活
3. 查看浏览器控制台错误信息

### 数据加载失败
1. 检查 D1 数据库连接
2. 确认表结构是否正确
3. 查看 Workers 日志

### 会话过期
- 会话有效期为24小时
- 超时后需要重新登录
- 可以在代码中调整过期时间

## 技术支持

如有问题，请检查：
1. Cloudflare Workers 日志
2. D1 数据库状态
3. 网络连接
4. 浏览器兼容性

## 更新日志

### V6 (当前版本)
- ✅ 完整的管理后台界面
- ✅ 用户名密码登录
- ✅ 会话管理
- ✅ 兑换码管理
- ✅ 用户管理
- ✅ 签到记录查看
- ✅ 批量操作功能
- ✅ 操作日志记录
- ✅ 响应式设计
- ✅ 暗色主题
