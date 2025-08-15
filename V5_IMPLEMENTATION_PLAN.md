# 每日签到系统 V5 - 实施计划

## 项目概述
V5版本引入完整的兑换码金额管理系统，包括面额设置、库存管理、待分配机制、系统赠送和批量分发等高级功能。

## 实施阶段划分

### 第一阶段：核心基础设施（2天）

#### 1.1 数据库升级
- [ ] 创建 schema-v5.sql 文件
- [ ] 添加金额相关字段
- [ ] 创建系统通知表
- [ ] 创建分发日志表
- [ ] 建立必要的索引和视图

#### 1.2 Workers基础框架
- [ ] 创建 workers-v5.js 基础结构
- [ ] 实现路由分发机制
- [ ] 集成 D1 数据库连接
- [ ] 设置 CORS 和中间件

### 第二阶段：兑换码金额管理（2天）

#### 2.1 后端API开发
```javascript
// 需要实现的核心API
POST   /api/admin/codes/upload        // 上传兑换码（带金额）
POST   /api/admin/codes/set-amount    // 设置兑换码金额
GET    /api/admin/codes/inventory     // 获取库存统计
GET    /api/admin/codes/list          // 兑换码列表（支持面额筛选）
DELETE /api/admin/codes/clear-unused  // 清空未使用兑换码
```

#### 2.2 库存管理逻辑
- [ ] 实现面额库存统计
- [ ] 开发库存检查函数
- [ ] 创建库存预警机制
- [ ] 实现自动库存更新

### 第三阶段：待分配机制（2天）

#### 3.1 签到流程改造
```javascript
// 签到时的库存检查逻辑
async function handleCheckIn(userId) {
  // 1. 检查今日是否已签到
  // 2. 检查可用库存
  // 3. 库存充足：分配兑换码
  // 4. 库存不足：创建待分配记录
  // 5. 返回相应状态
}
```

#### 3.2 补发机制
- [ ] 获取待分配用户列表
- [ ] 一键补发功能
- [ ] 自动匹配可用面额
- [ ] 更新签到状态

### 第四阶段：系统赠送功能（2天）

#### 4.1 赠送API开发
```javascript
POST /api/admin/distribute/gift
{
  user_ids: [1, 2, 3],
  amount: 20,
  message: "系统赠送"
}
```

#### 4.2 通知系统
- [ ] 创建通知记录
- [ ] 实现通知查询API
- [ ] 标记已读/已关闭
- [ ] 通知自动清理

### 第五阶段：批量分发功能（1天）

#### 5.1 批量分发API
```javascript
POST /api/admin/distribute/batch
{
  user_ids: [1, 2, 3, 4, 5],
  amount: 10,
  confirm: true
}
```

#### 5.2 事务处理
- [ ] 批量选择兑换码
- [ ] 批量更新状态
- [ ] 记录分发日志
- [ ] 错误回滚机制

### 第六阶段：前端界面开发（3天）

#### 6.1 签到记录页面
```html
<!-- checkin-records-v5.html -->
- 毫秒级时间戳显示
- 双向时间排序
- 库存不足提醒
- 待分配状态显示
```

#### 6.2 兑换码管理页面增强
```html
<!-- admin-codes-v5.html -->
- 金额列显示
- 面额筛选器
- 一键清空功能
- 分发状态指示
```

#### 6.3 批量分发界面
```html
<!-- admin-distribute-v5.html -->
- 用户多选列表
- 面额选择器
- 库存显示
- 确认对话框
```

#### 6.4 通知弹窗组件
```javascript
// notification-popup.js
class NotificationPopup {
  show(notification) {
    // 显示弹窗
    // 复制按钮
    // 关闭按钮
    // 自动消失
  }
}
```

### 第七阶段：集成测试（2天）

#### 7.1 功能测试清单
- [ ] 兑换码上传（带金额）
- [ ] 签到流程（库存充足/不足）
- [ ] 待分配用户补发
- [ ] 系统赠送功能
- [ ] 批量分发功能
- [ ] 通知系统
- [ ] 一键清空功能

#### 7.2 性能测试
- [ ] 批量操作性能
- [ ] 数据库查询优化
- [ ] 并发处理能力
- [ ] 前端响应速度

## 关键代码实现示例

### 1. 库存检查函数
```javascript
async function checkInventory(amount) {
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as available 
    FROM redemption_codes 
    WHERE amount = ? AND is_used = FALSE
  `).bind(amount).first();
  
  return result.available || 0;
}
```

### 2. 待分配处理
```javascript
async function createPendingCheckIn(userId, date) {
  await env.DB.prepare(`
    INSERT INTO check_ins (
      user_id, check_in_date, check_in_time, 
      status, created_at
    ) VALUES (?, ?, ?, 'pending_distribution', ?)
  `).bind(
    userId, 
    date, 
    new Date().toISOString(),
    new Date().toISOString()
  ).run();
}
```

### 3. 批量分发事务
```javascript
async function batchDistribute(userIds, amount, adminId) {
  const tx = [];
  
  // 1. 获取可用兑换码
  const codes = await getAvailableCodes(amount, userIds.length);
  if (codes.length < userIds.length) {
    throw new Error('库存不足');
  }
  
  // 2. 分配兑换码
  for (let i = 0; i < userIds.length; i++) {
    tx.push(
      assignCode(codes[i], userIds[i], 'manual')
    );
  }
  
  // 3. 创建通知
  for (const userId of userIds) {
    tx.push(
      createNotification(userId, codes[i], amount)
    );
  }
  
  // 4. 记录日志
  tx.push(
    logDistribution(adminId, userIds, amount, codes.length)
  );
  
  // 5. 执行事务
  await env.DB.batch(tx);
}
```

### 4. 通知弹窗实现
```javascript
// 前端通知检查
async function checkNotifications() {
  const response = await fetch('/api/notifications?unread_only=true');
  const notifications = await response.json();
  
  if (notifications.length > 0) {
    const notification = notifications[0];
    showNotificationPopup({
      title: notification.title,
      message: notification.message,
      code: notification.redemption_code,
      amount: notification.amount,
      onCopy: () => copyToClipboard(notification.redemption_code),
      onDismiss: () => dismissNotification(notification.id)
    });
  }
}

// 每次页面加载时检查
document.addEventListener('DOMContentLoaded', checkNotifications);
```

## Workers-v5.js 结构设计

```javascript
// workers-v5.js 主要结构
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 路由映射
    const routes = {
      // 用户端API
      'GET /api/user': getUserInfo,
      'POST /api/checkin': handleCheckIn,
      'GET /api/checkin/records': getCheckInRecords,
      'GET /api/notifications': getNotifications,
      'POST /api/notifications/:id/read': markNotificationRead,
      'POST /api/notifications/:id/dismiss': dismissNotification,
      
      // 管理员API
      'POST /api/admin/codes/upload': uploadCodes,
      'POST /api/admin/codes/set-amount': setCodeAmount,
      'GET /api/admin/codes/inventory': getInventory,
      'GET /api/admin/codes/list': listCodes,
      'DELETE /api/admin/codes/clear-unused': clearUnusedCodes,
      
      // 分发API
      'POST /api/admin/distribute/gift': giftCodes,
      'POST /api/admin/distribute/batch': batchDistribute,
      'POST /api/admin/distribute/pending': resolvePending,
      'GET /api/admin/distribute/pending-users': getPendingUsers,
      
      // 认证API
      'POST /api/oauth/callback': handleOAuthCallback,
      'POST /api/admin/login': adminLogin,
      'POST /api/logout': logout,
    };
    
    // 执行路由
    return handleRequest(request, env, routes);
  }
};
```

## 部署准备

### 环境变量配置
```bash
# OAuth2配置
OAUTH_CLIENT_ID=xxx
OAUTH_CLIENT_SECRET=xxx

# 管理员配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure_password

# 系统配置
SESSION_SECRET=random_32_chars
FRONTEND_URL=https://your-domain.com

# 功能开关（可选）
ENABLE_AUTO_DISTRIBUTION=true  # 自动补发
DEFAULT_CODE_AMOUNT=10         # 默认金额
MAX_BATCH_SIZE=100             # 批量分发上限
```

### D1数据库绑定
- 绑定名称：DB
- 数据库：checkin-system

## 风险管理

### 潜在风险
1. **数据迁移风险**：从V4升级可能影响现有数据
2. **性能风险**：批量操作可能影响系统性能
3. **并发风险**：多管理员同时操作可能导致冲突

### 缓解措施
1. **备份策略**：升级前完整备份数据库
2. **批量限制**：限制单次批量操作数量
3. **事务保护**：使用数据库事务确保一致性
4. **渐进部署**：先在测试环境验证

## 时间线

| 阶段 | 预计时间 | 关键交付物 |
|------|---------|-----------|
| 第一阶段 | 2天 | 数据库架构、基础框架 |
| 第二阶段 | 2天 | 金额管理API |
| 第三阶段 | 2天 | 待分配机制 |
| 第四阶段 | 2天 | 系统赠送功能 |
| 第五阶段 | 1天 | 批量分发功能 |
| 第六阶段 | 3天 | 前端界面 |
| 第七阶段 | 2天 | 测试和优化 |
| **总计** | **14天** | **V5完整版本** |

## 成功标准

1. ✅ 所有V5功能正常运行
2. ✅ 数据迁移无损失
3. ✅ 性能满足要求（<500ms响应）
4. ✅ 用户体验流畅
5. ✅ 管理功能完善
6. ✅ 文档齐全

## 下一步行动

1. **立即开始**：切换到Code模式开始实现
2. **优先级**：先实现核心的workers-v5.js
3. **测试驱动**：每个功能都要充分测试
4. **文档同步**：实现的同时更新文档