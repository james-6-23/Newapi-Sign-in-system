# 🔧 数据库错误修复指南

## 🚨 问题描述

你遇到的错误：
```
Error: no such table: modal_configs: SQLITE_ERROR
```

这表示在尝试向 `modal_configs` 表插入数据时，该表还不存在。

## 🛠️ 解决方案

### 方法一：分步执行 SQL（推荐）

```bash
# 1. 先创建所有表结构
wrangler d1 execute kyx-checkin-system --file=frontend/new/schema-step-by-step.sql

# 2. 再插入初始数据
wrangler d1 execute kyx-checkin-system --file=frontend/new/initial-data.sql
```

### 方法二：重新创建数据库

```bash
# 1. 删除现有数据库（如果需要）
wrangler d1 delete kyx-checkin-system

# 2. 重新创建数据库
wrangler d1 create kyx-checkin-system

# 3. 记录新的 database_id 并更新配置文件

# 4. 分步执行 SQL
wrangler d1 execute kyx-checkin-system --file=frontend/new/schema-step-by-step.sql
wrangler d1 execute kyx-checkin-system --file=frontend/new/initial-data.sql
```

### 方法三：手动检查和修复

```bash
# 1. 检查现有表
wrangler d1 execute kyx-checkin-system --command="SELECT name FROM sqlite_master WHERE type='table';"

# 2. 如果缺少 modal_configs 表，单独创建
wrangler d1 execute kyx-checkin-system --command="
CREATE TABLE IF NOT EXISTS modal_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modal_type TEXT UNIQUE NOT NULL,
    max_display_count INTEGER DEFAULT 1,
    cooldown_minutes INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    title TEXT,
    content TEXT,
    button_text TEXT DEFAULT '确定',
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);"

# 3. 插入默认数据
wrangler d1 execute kyx-checkin-system --command="
INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, description) VALUES
('gift', 1, 0, '系统赠送弹窗'),
('checkin_reminder', 3, 1440, '签到提醒弹窗'),
('reward_notification', 5, 60, '奖励通知弹窗'),
('level_up', 1, 0, '升级通知弹窗');"
```

## 🔍 诊断命令

### 检查数据库状态

```bash
# 查看所有表
wrangler d1 execute kyx-checkin-system --command="SELECT name FROM sqlite_master WHERE type='table';"

# 查看 modal_configs 表结构
wrangler d1 execute kyx-checkin-system --command="PRAGMA table_info(modal_configs);"

# 查看表中的数据
wrangler d1 execute kyx-checkin-system --command="SELECT * FROM modal_configs;"
```

### 检查数据库连接

```bash
# 测试数据库连接
wrangler d1 execute kyx-checkin-system --command="SELECT datetime('now') as current_time;"

# 查看数据库信息
wrangler d1 info kyx-checkin-system
```

## 📋 完整的重新部署流程

如果你想从头开始：

```bash
# 1. 创建数据库
wrangler d1 create kyx-checkin-system

# 2. 记录返回的 database_id
# 输出示例：
# ✅ Successfully created DB 'kyx-checkin-system'
# database_id = "abcd1234-5678-90ef-ghij-klmnopqrstuv"

# 3. 更新配置文件中的 database_id
# 编辑 wrangler-user-simple.toml 和 wrangler-admin-simple.toml

# 4. 创建表结构
wrangler d1 execute kyx-checkin-system --file=frontend/new/schema-step-by-step.sql

# 5. 插入初始数据
wrangler d1 execute kyx-checkin-system --file=frontend/new/initial-data.sql

# 6. 验证数据库
wrangler d1 execute kyx-checkin-system --command="SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table';"

# 7. 创建管理员账户
node frontend/new/create-admin.js admin yourpassword

# 8. 部署应用
wrangler deploy --config frontend/new/wrangler-user-simple.toml
wrangler deploy --config frontend/new/wrangler-admin-simple.toml
```

## ⚠️ 常见问题

### 问题1：权限错误
```bash
# 重新登录
wrangler auth login
```

### 问题2：数据库不存在
```bash
# 检查数据库列表
wrangler d1 list

# 确认数据库名称正确
```

### 问题3：配置文件错误
```bash
# 检查配置文件语法
wrangler deploy --dry-run --config frontend/new/wrangler-user-simple.toml
```

### 问题4：SQL 语法错误
```bash
# 使用更简单的命令测试
wrangler d1 execute kyx-checkin-system --command="SELECT 1;"
```

## 🎯 推荐解决步骤

1. **使用方法一**（分步执行）- 最安全
2. **检查执行结果** - 确认每步都成功
3. **验证数据** - 确认表和数据都正确创建
4. **测试应用** - 部署后测试功能

## 📞 如果还有问题

如果按照上述步骤仍然有问题，请提供：

1. 完整的错误信息
2. 执行的具体命令
3. `wrangler d1 list` 的输出
4. 配置文件内容

这样我可以提供更精确的帮助！🚀
