# 弹窗控制系统 - 数据库设计

## 概述
为了彻底解决前端持续弹窗问题，设计一个基于数据库的弹窗控制系统，确保每个通知只显示一次。

## 新增数据库表

### 1. 弹窗显示记录表
```sql
-- ============================================
-- 弹窗显示记录表
-- ============================================
CREATE TABLE IF NOT EXISTS modal_display_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    notification_id INTEGER,  -- 关联的通知ID（可选）
    modal_type TEXT NOT NULL,  -- 弹窗类型: gift/pending/system/checkin
    modal_key TEXT NOT NULL,  -- 弹窗唯一标识（如兑换码、通知ID等）
    display_count INTEGER DEFAULT 0,  -- 显示次数
    max_display_count INTEGER DEFAULT 1,  -- 最大显示次数
    first_displayed_at DATETIME,  -- 首次显示时间
    last_displayed_at DATETIME,  -- 最后显示时间
    is_dismissed BOOLEAN DEFAULT FALSE,  -- 是否已被用户主动关闭
    dismissed_at DATETIME,  -- 关闭时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (notification_id) REFERENCES system_notifications(id),
    UNIQUE(user_id, modal_type, modal_key)  -- 确保同一用户的同一弹窗只有一条记录
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_modal_logs_user_type ON modal_display_logs(user_id, modal_type);
CREATE INDEX IF NOT EXISTS idx_modal_logs_key ON modal_display_logs(modal_key, display_count);
CREATE INDEX IF NOT EXISTS idx_modal_logs_notification ON modal_display_logs(notification_id);
```

### 2. 弹窗配置表（可选）
```sql
-- ============================================
-- 弹窗配置表
-- ============================================
CREATE TABLE IF NOT EXISTS modal_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modal_type TEXT UNIQUE NOT NULL,  -- 弹窗类型
    max_display_count INTEGER DEFAULT 1,  -- 默认最大显示次数
    cooldown_minutes INTEGER DEFAULT 0,  -- 冷却时间（分钟）
    is_enabled BOOLEAN DEFAULT TRUE,  -- 是否启用
    description TEXT,  -- 配置描述
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT OR IGNORE INTO modal_configs (modal_type, max_display_count, cooldown_minutes, description) VALUES
('gift', 1, 0, '系统赠送弹窗'),
('pending', 1, 0, '待分配弹窗'),
('checkin', 1, 0, '签到成功弹窗'),
('system', 1, 0, '系统通知弹窗');
```

## 核心业务逻辑

### 1. 检查是否应该显示弹窗
```sql
-- 检查弹窗是否应该显示
SELECT 
    mdl.display_count,
    mdl.max_display_count,
    mdl.last_displayed_at,
    mc.cooldown_minutes,
    mc.is_enabled,
    CASE 
        WHEN mc.is_enabled = FALSE THEN 'disabled'
        WHEN mdl.display_count >= mdl.max_display_count THEN 'max_reached'
        WHEN mdl.last_displayed_at IS NOT NULL 
             AND datetime(mdl.last_displayed_at, '+' || mc.cooldown_minutes || ' minutes') > datetime('now') 
             THEN 'cooldown'
        ELSE 'allowed'
    END as display_status
FROM modal_display_logs mdl
LEFT JOIN modal_configs mc ON mc.modal_type = mdl.modal_type
WHERE mdl.user_id = ? 
  AND mdl.modal_type = ? 
  AND mdl.modal_key = ?;
```

### 2. 记录弹窗显示
```sql
-- 插入或更新弹窗显示记录
INSERT INTO modal_display_logs (
    user_id, notification_id, modal_type, modal_key, 
    display_count, max_display_count, first_displayed_at, last_displayed_at
) VALUES (?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
ON CONFLICT(user_id, modal_type, modal_key) DO UPDATE SET
    display_count = display_count + 1,
    last_displayed_at = datetime('now'),
    updated_at = datetime('now');
```

### 3. 标记弹窗已关闭
```sql
-- 用户主动关闭弹窗时调用
UPDATE modal_display_logs 
SET is_dismissed = TRUE, 
    dismissed_at = datetime('now'),
    updated_at = datetime('now')
WHERE user_id = ? 
  AND modal_type = ? 
  AND modal_key = ?;
```

## API接口设计

### 1. 检查弹窗显示权限
```
GET /api/modal/check?type=gift&key=code123
Response: {
  "success": true,
  "should_display": false,
  "reason": "max_reached",
  "display_count": 1,
  "max_count": 1
}
```

### 2. 记录弹窗显示
```
POST /api/modal/display
Body: {
  "type": "gift",
  "key": "code123",
  "notification_id": 456
}
```

### 3. 标记弹窗关闭
```
POST /api/modal/dismiss
Body: {
  "type": "gift", 
  "key": "code123"
}
```

## 管理员功能

### 1. 重置用户弹窗状态
```sql
-- 重置特定用户的所有弹窗记录
DELETE FROM modal_display_logs WHERE user_id = ?;

-- 重置特定类型的弹窗记录
DELETE FROM modal_display_logs WHERE modal_type = ?;

-- 重置特定弹窗记录
DELETE FROM modal_display_logs 
WHERE user_id = ? AND modal_type = ? AND modal_key = ?;
```

### 2. 弹窗统计查询
```sql
-- 弹窗显示统计
SELECT 
    modal_type,
    COUNT(*) as total_displays,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(display_count) as avg_displays_per_user,
    COUNT(CASE WHEN is_dismissed = TRUE THEN 1 END) as dismissed_count
FROM modal_display_logs
GROUP BY modal_type;
```

## 实施步骤

1. **创建数据库表**：执行上述SQL创建新表
2. **修改后端API**：在通知API中集成弹窗控制逻辑
3. **更新前端逻辑**：简化前端，依赖后端控制
4. **添加管理功能**：为管理员提供重置和统计功能
5. **测试验证**：确保弹窗控制生效

## 优势

1. **数据持久化**：弹窗状态存储在数据库中，不依赖前端缓存
2. **精确控制**：可以精确控制每个弹窗的显示次数和时机
3. **管理友好**：管理员可以轻松重置和查看弹窗状态
4. **性能优化**：减少不必要的前端处理和API调用
5. **扩展性强**：可以轻松添加新的弹窗类型和控制规则
