# 每日签到系统 V5 - 数据库架构设计

## 概述
V5版本数据库架构支持兑换码金额管理、待分配机制、系统赠送、批量分发等高级功能。

## 完整SQL架构

```sql
-- ============================================
-- 用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linux_do_id INTEGER UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 上传批次表（增加金额字段）
-- ============================================
CREATE TABLE IF NOT EXISTS upload_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 批次金额
    total_codes INTEGER NOT NULL,
    valid_codes INTEGER NOT NULL,
    duplicate_codes INTEGER NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 兑换码表（增强版）
-- ============================================
CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 兑换码金额
    is_used BOOLEAN DEFAULT FALSE,
    used_by INTEGER,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    batch_id INTEGER,
    distribution_type TEXT DEFAULT 'checkin',  -- 分发类型: checkin/gift/manual/pending
    distribution_time DATETIME,  -- 分发时间
    FOREIGN KEY (used_by) REFERENCES users(id),
    FOREIGN KEY (batch_id) REFERENCES upload_batches(id)
);

-- ============================================
-- 签到记录表（增强版）
-- ============================================
CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date DATE NOT NULL,
    check_in_time DATETIME NOT NULL,  -- 精确到毫秒的时间戳
    redemption_code TEXT,
    status TEXT DEFAULT 'completed',  -- 状态: completed/pending_distribution
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code),
    UNIQUE(user_id, check_in_date)
);

-- ============================================
-- 会话表
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================
-- 系统通知表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS system_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 通知类型: gift/system/pending_resolved
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    redemption_code TEXT,
    amount DECIMAL(10,2),
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    dismissed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code)
);

-- ============================================
-- 分发记录表（新增）
-- ============================================
CREATE TABLE IF NOT EXISTS distribution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,  -- 执行分发的管理员
    operation_type TEXT NOT NULL,  -- 操作类型: batch/gift/pending_resolve
    target_users TEXT NOT NULL,  -- JSON数组存储目标用户ID
    amount DECIMAL(10,2),
    codes_distributed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'success',  -- 状态: success/partial/failed
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- ============================================
-- 库存统计视图（新增）
-- ============================================
CREATE VIEW IF NOT EXISTS inventory_stats AS
SELECT 
    amount,
    COUNT(*) as total_count,
    SUM(CASE WHEN is_used = FALSE THEN 1 ELSE 0 END) as available_count,
    SUM(CASE WHEN is_used = TRUE THEN 1 ELSE 0 END) as used_count
FROM redemption_codes
GROUP BY amount;

-- ============================================
-- 待分配用户视图（新增）
-- ============================================
CREATE VIEW IF NOT EXISTS pending_distributions AS
SELECT 
    c.id as checkin_id,
    c.user_id,
    u.username,
    u.linux_do_id,
    c.check_in_date,
    c.check_in_time,
    c.created_at
FROM check_ins c
JOIN users u ON c.user_id = u.id
WHERE c.status = 'pending_distribution'
ORDER BY c.created_at ASC;

-- ============================================
-- 索引优化
-- ============================================
-- 基础索引
CREATE INDEX IF NOT EXISTS idx_redemption_codes_is_used ON redemption_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_batch_id ON redemption_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_date ON check_ins(check_in_date);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_is_admin ON sessions(is_admin);

-- V5新增索引
CREATE INDEX IF NOT EXISTS idx_redemption_codes_amount ON redemption_codes(amount, is_used);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_distribution ON redemption_codes(distribution_type, distribution_time);
CREATE INDEX IF NOT EXISTS idx_check_ins_status ON check_ins(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON system_notifications(user_id, is_dismissed, created_at);
CREATE INDEX IF NOT EXISTS idx_distribution_logs_admin ON distribution_logs(admin_id, created_at);
```

## 数据库迁移策略

### 从V4升级到V5

```sql
-- 1. 添加新字段到现有表
ALTER TABLE redemption_codes ADD COLUMN amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE redemption_codes ADD COLUMN distribution_type TEXT DEFAULT 'checkin';
ALTER TABLE redemption_codes ADD COLUMN distribution_time DATETIME;

ALTER TABLE upload_batches ADD COLUMN amount DECIMAL(10,2) DEFAULT 0;

ALTER TABLE check_ins ADD COLUMN check_in_time DATETIME;
ALTER TABLE check_ins ADD COLUMN status TEXT DEFAULT 'completed';

-- 2. 更新现有数据
UPDATE check_ins SET check_in_time = created_at WHERE check_in_time IS NULL;

-- 3. 创建新表
-- 执行上面的 system_notifications 和 distribution_logs 创建语句

-- 4. 创建新视图和索引
-- 执行上面的视图和索引创建语句
```

## 关键业务逻辑

### 1. 签到时库存检查
```sql
-- 检查指定金额的可用兑换码
SELECT COUNT(*) as available 
FROM redemption_codes 
WHERE amount = ? AND is_used = FALSE;
```

### 2. 待分配用户查询
```sql
-- 获取所有待分配的签到记录
SELECT * FROM pending_distributions;
```

### 3. 批量分发事务
```sql
BEGIN TRANSACTION;

-- 1. 选择可用兑换码
SELECT id, code FROM redemption_codes 
WHERE amount = ? AND is_used = FALSE 
LIMIT ?;

-- 2. 更新兑换码状态
UPDATE redemption_codes 
SET is_used = TRUE, 
    used_by = ?, 
    used_at = CURRENT_TIMESTAMP,
    distribution_type = 'manual',
    distribution_time = CURRENT_TIMESTAMP
WHERE id IN (...);

-- 3. 更新签到记录（如果是补发）
UPDATE check_ins 
SET redemption_code = ?, 
    status = 'completed'
WHERE user_id = ? AND status = 'pending_distribution';

-- 4. 创建通知
INSERT INTO system_notifications (...) VALUES (...);

-- 5. 记录分发日志
INSERT INTO distribution_logs (...) VALUES (...);

COMMIT;
```

### 4. 一键清空未使用兑换码
```sql
-- 删除未分配的兑换码（保留已使用的）
DELETE FROM redemption_codes 
WHERE is_used = FALSE;
```

### 5. 面额库存统计
```sql
-- 使用视图快速获取
SELECT * FROM inventory_stats 
ORDER BY amount ASC;
```

## 性能优化建议

1. **定期清理过期会话**
```sql
DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;
```

2. **归档旧通知**
```sql
-- 归档30天前已读的通知
DELETE FROM system_notifications 
WHERE is_dismissed = TRUE 
  AND dismissed_at < datetime('now', '-30 days');
```

3. **批量操作优化**
- 使用事务包装批量操作
- 批量插入时使用 INSERT ... VALUES 多值语法
- 合理使用索引避免全表扫描

## 数据完整性保证

1. **外键约束**：确保数据引用完整性
2. **唯一约束**：防止重复签到和重复兑换码
3. **默认值**：确保关键字段有合理默认值
4. **视图封装**：通过视图简化复杂查询

## 监控指标

建议监控以下关键指标：
- 各面额兑换码库存量
- 待分配用户数量
- 每日签到成功率
- 系统通知发送量
- 批量分发成功率