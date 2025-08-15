# 每日签到系统 V5 - 架构设计文档

## 版本概述

V5版本引入了完整的兑换码金额管理系统，支持面额设置、库存管理、待分配机制、系统赠送和批量分发等高级功能。

## 核心需求分析

### 1. 签到记录界面增强
- **毫秒级时间戳**：精确记录签到时间
- **完整信息展示**：用户名、Linux Do ID、兑换码
- **双向时间排序**：支持升序/降序切换
- **库存提醒**：库存不足时显示警告信息

### 2. 库存不足处理机制
- **待分配状态**：
  - 管理员视图：显示"已签到待分配"状态
  - 用户视图：显示"等待管理员分配"
  - 一键补发按钮：管理员可批量补发兑换码
- **自动检测**：签到时自动检测库存
- **状态追踪**：记录待分配用户列表

### 3. 兑换码金额管理
- **面额设置**：管理员可设置兑换码金额
- **库存验证**：配置价格时自动验证对应面额库存
- **批次金额**：上传时为整批次设置统一金额
- **无过期时间**：兑换码永久有效

### 4. 系统赠送功能
- **主动分发**：管理员可主动赠送兑换码
- **弹窗通知**：用户登录后弹出通知
- **交互按钮**：复制和关闭按钮
- **永久保存**：赠送记录永久保存

### 5. 批量分发功能
- **多选用户**：支持批量选择用户
- **确认对话框**：分发前确认
- **库存警告**：库存不足时提醒
- **面额选择**：根据库存选择合适面额

### 6. 兑换码管理界面
- **列表展示**：
  - 兑换码
  - 金额
  - 领取用户
  - 分发时间
  - 分发状态（待分配/已分配）
- **面额筛选**：按金额筛选兑换码
- **一键清空**：输入"一键清空"确认后清除未分配兑换码

## 数据库架构设计

### 更新的表结构

```sql
-- 兑换码表（增加金额字段）
CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 新增：兑换码金额
    is_used BOOLEAN DEFAULT FALSE,
    used_by INTEGER,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    batch_id INTEGER,
    distribution_type TEXT DEFAULT 'checkin',  -- 新增：分发类型 (checkin/gift/manual)
    FOREIGN KEY (used_by) REFERENCES users(id),
    FOREIGN KEY (batch_id) REFERENCES upload_batches(id)
);

-- 签到记录表（增加状态字段）
CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date DATE NOT NULL,
    check_in_time DATETIME NOT NULL,  -- 新增：精确到毫秒的时间戳
    redemption_code TEXT,
    status TEXT DEFAULT 'completed',  -- 新增：状态 (completed/pending_distribution)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code),
    UNIQUE(user_id, check_in_date)
);

-- 上传批次表（增加金额字段）
CREATE TABLE IF NOT EXISTS upload_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    amount DECIMAL(10,2) DEFAULT 0,  -- 新增：批次金额
    total_codes INTEGER NOT NULL,
    valid_codes INTEGER NOT NULL,
    duplicate_codes INTEGER NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 系统通知表（新增）
CREATE TABLE IF NOT EXISTS system_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,  -- 通知类型 (gift/system)
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    redemption_code TEXT,
    amount DECIMAL(10,2),
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code) REFERENCES redemption_codes(code)
);

-- 新增索引
CREATE INDEX IF NOT EXISTS idx_redemption_codes_amount ON redemption_codes(amount);
CREATE INDEX IF NOT EXISTS idx_check_ins_status ON check_ins(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON system_notifications(user_id, is_dismissed);
```

## API 设计

### 新增/更新的 API 端点

#### 1. 签到相关
```
GET /api/checkin/records
  - 参数：page, limit, sort (asc/desc)
  - 返回：毫秒级时间戳的签到记录

POST /api/checkin
  - 增强：库存不足时创建待分配记录
  - 返回：状态信息（成功/待分配）
```

#### 2. 兑换码管理
```
POST /api/admin/codes/set-amount
  - 功能：设置兑换码金额
  - 参数：codes[], amount
  - 验证：库存检查

GET /api/admin/codes/inventory
  - 功能：获取各面额库存统计
  - 返回：{amount: count} 映射

DELETE /api/admin/codes/clear-unused
  - 功能：清空未使用兑换码
  - 参数：confirmation: "一键清空"
  - 保护：需要确认文本

GET /api/admin/codes/list
  - 增强：支持面额筛选
  - 参数：amount, status, page, limit
```

#### 3. 分发功能
```
POST /api/admin/distribute/gift
  - 功能：系统赠送兑换码
  - 参数：user_ids[], amount, message
  - 创建：通知记录

POST /api/admin/distribute/batch
  - 功能：批量分发
  - 参数：user_ids[], amount
  - 验证：库存检查

POST /api/admin/distribute/pending
  - 功能：补发待分配兑换码
  - 自动：分配合适面额
```

#### 4. 通知系统
```
GET /api/notifications
  - 功能：获取用户通知
  - 参数：unread_only
  - 返回：未读通知列表

POST /api/notifications/:id/read
  - 功能：标记已读

POST /api/notifications/:id/dismiss
  - 功能：关闭通知
```

## 前端界面设计

### 1. 签到记录页面 (checkin-records.html)
```
┌─────────────────────────────────────────┐
│ 签到记录                    [时间排序↓] │
├─────────────────────────────────────────┤
│ 时间戳 | 用户名 | Linux Do ID | 兑换码 │
│ 2024-01-01 12:34:56.789 | user1 | ... │
└─────────────────────────────────────────┘
```

### 2. 兑换码管理页面增强 (admin-codes-v5.html)
```
┌─────────────────────────────────────────┐
│ 兑换码管理                              │
├─────────────────────────────────────────┤
│ [面额筛选: 全部▼] [一键清空]            │
├─────────────────────────────────────────┤
│ 兑换码 | 金额 | 用户 | 时间 | 状态     │
│ CODE-001 | ¥10 | - | - | 待分配      │
│ CODE-002 | ¥20 | user1 | ... | 已分配 │
└─────────────────────────────────────────┘
```

### 3. 批量分发界面 (admin-distribute.html)
```
┌─────────────────────────────────────────┐
│ 批量分发                                │
├─────────────────────────────────────────┤
│ □ 全选  [选中: 5 个用户]                │
│ □ user1 (Linux Do ID: 12345)           │
│ □ user2 (Linux Do ID: 23456)           │
├─────────────────────────────────────────┤
│ 选择面额: [¥10 (库存:50)] [分发]       │
└─────────────────────────────────────────┘
```

### 4. 通知弹窗组件
```javascript
// 弹窗样式
┌─────────────────────────────────┐
│     🎁 系统赠送              X │
├─────────────────────────────────┤
│ 恭喜获得 ¥20 兑换码！          │
│                                 │
│ 兑换码：CODE-XXXX-XXXX         │
│                                 │
│ [复制兑换码] [查看我的兑换码]  │
└─────────────────────────────────┘
```

## 实施步骤

### 第一阶段：数据库和后端基础
1. 创建 schema-v5.sql 数据库架构
2. 开发 workers-v5.js 基础框架
3. 实现金额管理相关 API

### 第二阶段：库存管理
1. 实现库存检测逻辑
2. 开发待分配机制
3. 创建补发功能

### 第三阶段：分发功能
1. 实现系统赠送 API
2. 开发批量分发功能
3. 创建通知系统

### 第四阶段：前端界面
1. 更新签到记录页面
2. 增强兑换码管理界面
3. 创建批量分发界面
4. 实现通知弹窗组件

### 第五阶段：集成测试
1. 完整流程测试
2. 性能优化
3. 文档更新

## 部署说明

由于用户要求直接在 Cloudflare 平台导入 workers-v5.js，不使用 wrangler.toml：

1. **文件准备**：
   - 创建单一的 workers-v5.js 文件
   - 包含所有必要的代码和路由

2. **环境变量配置**：
   在 Cloudflare Workers 设置面板配置：
   ```
   OAUTH_CLIENT_ID
   OAUTH_CLIENT_SECRET
   ADMIN_USERNAME
   ADMIN_PASSWORD
   SESSION_SECRET
   FRONTEND_URL
   ```

3. **D1 数据库绑定**：
   - 在 Workers 设置中绑定 D1 数据库
   - 变量名：DB

## 性能考虑

1. **批量操作优化**：使用事务处理批量分发
2. **缓存策略**：缓存面额统计信息
3. **分页加载**：大量数据分页显示
4. **索引优化**：合理使用数据库索引

## 安全考虑

1. **权限验证**：所有管理操作需验证管理员权限
2. **输入验证**：金额输入验证，防止异常值
3. **确认机制**：危险操作需要二次确认
4. **日志记录**：记录所有分发操作

## 下一步行动

1. 开始实现 schema-v5.sql
2. 创建 workers-v5.js 基础框架
3. 逐步实现各个功能模块
4. 更新前端界面
5. 完整测试和文档更新