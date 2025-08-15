# KYX 签到系统 V6 - 测试指南

## 📋 测试概述

本指南提供了KYX签到系统V6的完整测试流程，包括功能测试、API测试和集成测试。

## 🔧 测试环境准备

### 1. 本地测试环境
```bash
# 安装依赖
npm install -g wrangler

# 创建测试数据库
wrangler d1 create kyx-test-db

# 初始化数据库
wrangler d1 execute kyx-test-db --file=./qdTest/new/schema-v6-complete.sql
wrangler d1 execute kyx-test-db --file=./qdTest/new/init-admin.sql
```

### 2. 环境变量配置
```bash
# 测试环境变量
export OAUTH_CLIENT_ID="test_client_id"
export OAUTH_CLIENT_SECRET="test_client_secret"
export SESSION_SECRET="test_session_secret_32_characters"
export FRONTEND_URL="http://localhost:8787"
```

### 3. 启动本地开发服务器
```bash
# 启动用户端
wrangler dev frontend/new/workers-index.js --port 8787

# 启动管理端
wrangler dev frontend/new/workers-admin.js --port 8788
```

## 👤 用户端功能测试

### 1. OAuth2 登录测试

#### 测试步骤
1. 访问 `http://localhost:8787`
2. 点击 "Linux.Do 登录" 按钮
3. 验证重定向到 Linux.Do 授权页面
4. 模拟授权回调

#### 预期结果
- 成功重定向到授权页面
- 回调后正确设置用户会话
- 用户信息正确显示

#### 测试用例
```javascript
// 模拟OAuth回调测试
const testOAuthCallback = async () => {
  const response = await fetch('/auth/callback?code=test_code&state=test_state');
  console.assert(response.status === 302, 'OAuth callback should redirect');
  console.assert(response.headers.get('set-cookie').includes('session='), 'Should set session cookie');
};
```

### 2. 签到功能测试

#### 基础签到测试
```javascript
const testBasicCheckin = async () => {
  // 模拟用户登录
  const sessionCookie = 'session=test_session_id';
  
  const response = await fetch('/api/checkin', {
    method: 'POST',
    headers: { 'Cookie': sessionCookie }
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Checkin should succeed');
  console.assert(data.redemptionCode, 'Should return redemption code');
  console.assert(data.amount > 0, 'Should return positive amount');
};
```

#### 连续签到奖励测试
```javascript
const testConsecutiveReward = async () => {
  // 模拟连续5天签到
  for (let day = 1; day <= 5; day++) {
    // 设置测试日期
    const testDate = new Date();
    testDate.setDate(testDate.getDate() - (5 - day));
    
    const response = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 
        'Cookie': 'session=test_session_id',
        'X-Test-Date': testDate.toISOString()
      }
    });
    
    const data = await response.json();
    
    if (day === 5) {
      console.assert(data.bonusAmount > 0, 'Should have bonus reward on day 5');
      console.assert(data.consecutiveDays === 5, 'Should show 5 consecutive days');
    }
  }
};
```

#### 重复签到测试
```javascript
const testDuplicateCheckin = async () => {
  // 第一次签到
  await fetch('/api/checkin', {
    method: 'POST',
    headers: { 'Cookie': 'session=test_session_id' }
  });
  
  // 第二次签到（应该失败）
  const response = await fetch('/api/checkin', {
    method: 'POST',
    headers: { 'Cookie': 'session=test_session_id' }
  });
  
  const data = await response.json();
  console.assert(data.success === false, 'Duplicate checkin should fail');
  console.assert(data.message.includes('已签到'), 'Should show already checked in message');
};
```

### 3. 统计数据测试

#### 用户统计测试
```javascript
const testUserStats = async () => {
  const response = await fetch('/api/stats', {
    headers: { 'Cookie': 'session=test_session_id' }
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Stats request should succeed');
  console.assert(typeof data.stats.totalDays === 'number', 'Should return total days');
  console.assert(typeof data.stats.consecutiveDays === 'number', 'Should return consecutive days');
  console.assert(typeof data.stats.totalAmount === 'string', 'Should return total amount as string');
};
```

### 4. 兑换码记录测试

#### 分页测试
```javascript
const testCodesPagination = async () => {
  const response = await fetch('/api/codes/recent?page=1&limit=5', {
    headers: { 'Cookie': 'session=test_session_id' }
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Codes request should succeed');
  console.assert(Array.isArray(data.codes), 'Should return codes array');
  console.assert(data.pagination, 'Should include pagination info');
  console.assert(data.pagination.limit === 5, 'Should respect limit parameter');
};
```

## ⚙️ 管理端功能测试

### 1. 管理员认证测试

#### 登录测试
```javascript
const testAdminLogin = async () => {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin123'
    })
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Admin login should succeed');
  console.assert(response.headers.get('set-cookie').includes('admin_session='), 'Should set admin session');
};
```

#### 权限验证测试
```javascript
const testAdminAuth = async () => {
  // 未登录访问管理API
  const response = await fetch('/api/admin/stats');
  console.assert(response.status === 401, 'Should require authentication');
  
  // 错误会话访问
  const response2 = await fetch('/api/admin/stats', {
    headers: { 'Cookie': 'admin_session=invalid_session' }
  });
  console.assert(response2.status === 401, 'Should reject invalid session');
};
```

### 2. 兑换码导入测试

#### 文件导入测试
```javascript
const testCodesImport = async () => {
  // 创建测试文件
  const testCodes = 'KYX123456\nKYX789012\nKYX345678';
  const file = new Blob([testCodes], { type: 'text/plain' });
  
  const formData = new FormData();
  formData.append('file', file, 'test_codes.txt');
  formData.append('amount', '10.00');
  formData.append('adminId', '1');
  
  const response = await fetch('/api/admin/codes/import', {
    method: 'POST',
    headers: { 'Cookie': 'admin_session=valid_session' },
    body: formData
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Import should succeed');
  console.assert(data.result.validCodes === 3, 'Should import 3 valid codes');
};
```

### 3. 批量发放测试

#### 统一发放测试
```javascript
const testUnifiedDistribute = async () => {
  const response = await fetch('/api/admin/distribute', {
    method: 'POST',
    headers: { 
      'Cookie': 'admin_session=valid_session',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'all',
      amount: 10.00,
      adminId: 1
    })
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Unified distribute should succeed');
  console.assert(data.result.distributed > 0, 'Should distribute to users');
};
```

#### 指定用户发放测试
```javascript
const testSelectedDistribute = async () => {
  const response = await fetch('/api/admin/distribute', {
    method: 'POST',
    headers: { 
      'Cookie': 'admin_session=valid_session',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'selected',
      userIds: [1, 2, 3],
      amount: 10.00,
      adminId: 1
    })
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Selected distribute should succeed');
  console.assert(data.result.distributed === 3, 'Should distribute to 3 users');
};
```

### 4. 排名奖励测试

```javascript
const testRankingRewards = async () => {
  const response = await fetch('/api/admin/ranking', {
    method: 'POST',
    headers: { 
      'Cookie': 'admin_session=valid_session',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      topN: 5,
      amount: 50.00,
      adminId: 1
    })
  });
  
  const data = await response.json();
  console.assert(data.success === true, 'Ranking rewards should succeed');
  console.assert(data.result.rewarded <= 5, 'Should reward top 5 users');
};
```

### 5. 奖励配置测试

```javascript
const testRewardConfig = async () => {
  // 获取当前配置
  const getResponse = await fetch('/api/admin/rewards', {
    headers: { 'Cookie': 'admin_session=valid_session' }
  });
  const getData = await getResponse.json();
  console.assert(getData.success === true, 'Should get rewards config');
  
  // 更新配置
  const updateResponse = await fetch('/api/admin/rewards', {
    method: 'POST',
    headers: { 
      'Cookie': 'admin_session=valid_session',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reward_type: 'consecutive',
      condition_value: 7,
      amount: 200.00,
      description: '连续签到7天奖励',
      adminId: 1
    })
  });
  
  const updateData = await updateResponse.json();
  console.assert(updateData.success === true, 'Should update rewards config');
};
```

## 🔍 数据库测试

### 1. 数据一致性测试

```sql
-- 检查用户统计数据一致性
SELECT 
  u.id,
  u.total_checkins,
  COUNT(c.id) as actual_checkins,
  u.total_amount,
  SUM(c.total_amount) as actual_amount
FROM users u
LEFT JOIN check_ins c ON u.id = c.user_id
GROUP BY u.id
HAVING u.total_checkins != COUNT(c.id) OR u.total_amount != COALESCE(SUM(c.total_amount), 0);
```

### 2. 兑换码状态测试

```sql
-- 检查兑换码发放状态
SELECT 
  COUNT(*) as total_codes,
  SUM(CASE WHEN is_distributed = TRUE THEN 1 ELSE 0 END) as distributed,
  SUM(CASE WHEN is_distributed = FALSE THEN 1 ELSE 0 END) as undistributed
FROM redemption_codes;
```

### 3. 连续签到逻辑测试

```sql
-- 验证连续签到计算
SELECT 
  user_id,
  check_in_date,
  consecutive_days,
  LAG(consecutive_days) OVER (PARTITION BY user_id ORDER BY check_in_date) as prev_consecutive
FROM check_ins
WHERE user_id = 1
ORDER BY check_in_date;
```

## 🚀 性能测试

### 1. 并发签到测试

```javascript
const testConcurrentCheckin = async () => {
  const promises = [];
  
  // 模拟100个用户同时签到
  for (let i = 1; i <= 100; i++) {
    promises.push(
      fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Cookie': `session=test_session_${i}` }
      })
    );
  }
  
  const startTime = Date.now();
  const results = await Promise.all(promises);
  const endTime = Date.now();
  
  console.log(`Concurrent checkin test: ${endTime - startTime}ms for 100 requests`);
  console.assert(endTime - startTime < 5000, 'Should complete within 5 seconds');
};
```

### 2. 大量数据查询测试

```javascript
const testLargeDataQuery = async () => {
  const startTime = Date.now();
  
  const response = await fetch('/api/admin/codes?page=1&limit=50', {
    headers: { 'Cookie': 'admin_session=valid_session' }
  });
  
  const endTime = Date.now();
  const data = await response.json();
  
  console.log(`Large data query: ${endTime - startTime}ms`);
  console.assert(endTime - startTime < 2000, 'Should complete within 2 seconds');
  console.assert(data.success === true, 'Query should succeed');
};
```

## 📊 测试报告

### 测试执行命令

```bash
# 运行所有测试
npm test

# 运行特定测试套件
npm test -- --grep "用户端"
npm test -- --grep "管理端"
npm test -- --grep "数据库"

# 生成测试覆盖率报告
npm run test:coverage
```

### 测试结果示例

```
✅ 用户端功能测试
  ✅ OAuth2 登录测试 (5/5 通过)
  ✅ 签到功能测试 (8/8 通过)
  ✅ 统计数据测试 (3/3 通过)
  ✅ 兑换码记录测试 (2/2 通过)

✅ 管理端功能测试
  ✅ 管理员认证测试 (4/4 通过)
  ✅ 兑换码导入测试 (3/3 通过)
  ✅ 批量发放测试 (6/6 通过)
  ✅ 排名奖励测试 (2/2 通过)
  ✅ 奖励配置测试 (4/4 通过)

✅ 数据库测试
  ✅ 数据一致性测试 (3/3 通过)
  ✅ 性能测试 (2/2 通过)

总计: 40/40 测试通过 (100%)
```

---

**注意**: 测试环境应该与生产环境隔离，使用独立的数据库和配置。所有测试数据应在测试完成后清理。
