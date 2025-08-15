# KYX 签到系统 V6 - API 文档

## 📋 API 概述

KYX 签到系统提供完整的 RESTful API，支持用户签到、管理员操作等功能。

### 基础信息
- **API版本**: V6
- **基础URL**: `https://your-domain.com`
- **认证方式**: Session Cookie
- **数据格式**: JSON
- **时区**: UTC+8
- **货币单位**: USD ($)

## 🔐 认证说明

### 用户认证
- 使用 Linux.Do OAuth2 登录
- Session Cookie: `session=<session_id>`
- 有效期: 7天

### 管理员认证
- 用户名密码登录
- Session Cookie: `admin_session=<session_id>`
- 有效期: 24小时

## 👤 用户端 API

### 1. OAuth2 登录

#### 发起登录
```http
GET /auth/login
```

**响应**
```http
HTTP/1.1 302 Found
Location: https://connect.linux.do/oauth/authorize?...
```

#### 处理回调
```http
GET /auth/callback?code=<auth_code>&state=<state>
```

**响应**
```http
HTTP/1.1 302 Found
Location: /
Set-Cookie: session=<session_id>; Path=/; HttpOnly; Secure
```

### 2. 用户信息

#### 获取当前用户信息
```http
GET /api/user
Cookie: session=<session_id>
```

**响应**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "linux_do_id": 12345,
    "username": "testuser",
    "email": "user@example.com",
    "avatar_url": "https://...",
    "trust_level": 2,
    "total_checkins": 15,
    "consecutive_checkins": 5,
    "total_amount": 150.00,
    "last_checkin_date": "2024-01-15"
  }
}
```

### 3. 签到功能

#### 执行签到
```http
POST /api/checkin
Cookie: session=<session_id>
```

**响应 - 成功**
```json
{
  "success": true,
  "status": "completed",
  "message": "签到成功！",
  "redemptionCode": "KYX12345678",
  "amount": 110.00,
  "baseAmount": 10.00,
  "bonusAmount": 100.00,
  "consecutiveDays": 5,
  "stats": {
    "total_days": 16,
    "consecutive_days": 5,
    "max_consecutive_days": 8,
    "total_amount": 260.00
  }
}
```

**响应 - 待分配**
```json
{
  "success": true,
  "status": "pending_distribution",
  "message": "签到成功！兑换码待管理员分配",
  "reward": {
    "baseAmount": 10.00,
    "bonusAmount": 100.00,
    "totalAmount": 110.00,
    "consecutiveDays": 5
  }
}
```

**响应 - 已签到**
```json
{
  "success": false,
  "message": "今日已签到",
  "code": "KYX12345678",
  "amount": 110.00,
  "checkedIn": true
}
```

#### 检查签到状态
```http
GET /api/checkin/status
Cookie: session=<session_id>
```

**响应**
```json
{
  "success": true,
  "checkedIn": true,
  "todayCheckIn": {
    "check_in_date": "2024-01-15",
    "check_in_time": "2024-01-15T02:30:45",
    "redemption_code": "KYX12345678",
    "total_amount": 110.00,
    "consecutive_days": 5
  }
}
```

### 4. 统计数据

#### 获取用户统计
```http
GET /api/stats
Cookie: session=<session_id>
```

**响应**
```json
{
  "success": true,
  "stats": {
    "totalDays": 16,
    "consecutiveDays": 5,
    "maxConsecutiveDays": 8,
    "monthlyDays": 12,
    "codeCount": 16,
    "totalAmount": "260.00"
  }
}
```

### 5. 兑换码记录

#### 获取兑换码列表
```http
GET /api/codes/recent?page=1&limit=5
Cookie: session=<session_id>
```

**响应**
```json
{
  "success": true,
  "codes": [
    {
      "code": "KYX12345678",
      "amount": 110.00,
      "created_at": "2024-01-15T02:30:45Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 16,
    "totalPages": 4
  }
}
```

## ⚙️ 管理端 API

### 1. 管理员认证

#### 管理员登录
```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

**响应**
```json
{
  "success": true,
  "message": "登录成功"
}
```

#### 管理员登出
```http
POST /api/admin/logout
Cookie: admin_session=<session_id>
```

**响应**
```http
HTTP/1.1 302 Found
Location: /login
Set-Cookie: admin_session=; Max-Age=0
```

### 2. 统计数据

#### 获取系统统计
```http
GET /api/admin/stats
Cookie: admin_session=<session_id>
```

**响应**
```json
{
  "success": true,
  "stats": {
    "total": 1000,
    "undistributed": 750,
    "distributed": 250
  }
}
```

### 3. 兑换码管理

#### 获取兑换码列表
```http
GET /api/admin/codes?page=1&limit=50
Cookie: admin_session=<session_id>
```

**响应**
```json
{
  "success": true,
  "codes": [
    {
      "code": "KYX12345678",
      "amount": 10.00,
      "is_distributed": true,
      "distributed_to_username": "testuser",
      "created_at": "2024-01-15T00:00:00Z"
    }
  ]
}
```

#### 搜索兑换码
```http
GET /api/admin/codes/search?q=KYX123
Cookie: admin_session=<session_id>
```

#### 导入兑换码
```http
POST /api/admin/codes/import
Cookie: admin_session=<session_id>
Content-Type: multipart/form-data

file: <txt_file>
amount: 10.00
adminId: 1
```

**响应**
```json
{
  "success": true,
  "message": "兑换码导入完成",
  "result": {
    "batchId": 123,
    "totalCodes": 100,
    "validCodes": 95,
    "duplicateCodes": 3,
    "invalidCodes": 2,
    "amount": 10.00
  }
}
```

### 4. 批量发放

#### 统一发放
```http
POST /api/admin/distribute
Cookie: admin_session=<session_id>
Content-Type: application/json

{
  "type": "all",
  "amount": 10.00,
  "adminId": 1
}
```

#### 指定用户发放
```http
POST /api/admin/distribute
Cookie: admin_session=<session_id>
Content-Type: application/json

{
  "type": "selected",
  "userIds": [1, 2, 3, 4, 5],
  "amount": 10.00,
  "adminId": 1
}
```

**响应**
```json
{
  "success": true,
  "message": "批量发放完成",
  "result": {
    "distributed": 5,
    "failed": 0,
    "totalUsers": 5
  }
}
```

### 5. 排名奖励

#### 发放排名奖励
```http
POST /api/admin/ranking
Cookie: admin_session=<session_id>
Content-Type: application/json

{
  "topN": 10,
  "amount": 50.00,
  "adminId": 1
}
```

**响应**
```json
{
  "success": true,
  "message": "排名奖励发放完成",
  "result": {
    "topN": 10,
    "rewarded": 10,
    "users": [
      {
        "userId": 1,
        "username": "topuser",
        "rank": 1,
        "code": "KYX87654321",
        "amount": 50.00
      }
    ]
  }
}
```

### 6. 签到奖励配置

#### 获取奖励配置
```http
GET /api/admin/rewards
Cookie: admin_session=<session_id>
```

**响应**
```json
{
  "success": true,
  "rewards": [
    {
      "id": 1,
      "reward_type": "base",
      "condition_value": 0,
      "amount": 10.00,
      "description": "基础签到奖励",
      "is_active": true
    },
    {
      "id": 2,
      "reward_type": "consecutive",
      "condition_value": 5,
      "amount": 100.00,
      "description": "连续签到5天奖励",
      "is_active": true
    }
  ]
}
```

#### 更新奖励配置
```http
POST /api/admin/rewards
Cookie: admin_session=<session_id>
Content-Type: application/json

{
  "reward_type": "consecutive",
  "condition_value": 7,
  "amount": 200.00,
  "description": "连续签到7天奖励",
  "adminId": 1
}
```

### 7. 用户管理

#### 获取用户列表
```http
GET /api/admin/users?page=1&limit=50
Cookie: admin_session=<session_id>
```

**响应**
```json
{
  "success": true,
  "users": [
    {
      "id": 1,
      "username": "testuser",
      "linux_do_id": 12345,
      "trust_level": 2,
      "total_checkins": 15,
      "total_amount": 150.00,
      "checkin_count": 15,
      "code_count": 15,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 8. 签到记录

#### 获取签到记录
```http
GET /api/admin/checkins?page=1&limit=50
Cookie: admin_session=<session_id>
```

**响应**
```json
{
  "success": true,
  "checkins": [
    {
      "id": 1,
      "username": "testuser",
      "check_in_date": "2024-01-15",
      "check_in_time": "2024-01-15T02:30:45Z",
      "redemption_code": "KYX12345678",
      "total_amount": 110.00,
      "consecutive_days": 5,
      "status": "completed"
    }
  ]
}
```

## 🚨 错误处理

### 错误响应格式
```json
{
  "success": false,
  "message": "错误描述",
  "code": "ERROR_CODE"
}
```

### 常见错误码
- `401` - 未登录或会话过期
- `403` - 权限不足
- `404` - 资源不存在
- `400` - 请求参数错误
- `500` - 服务器内部错误

### HTTP状态码
- `200` - 成功
- `302` - 重定向
- `400` - 客户端错误
- `401` - 未授权
- `403` - 禁止访问
- `404` - 未找到
- `500` - 服务器错误

## 📝 使用示例

### JavaScript 示例
```javascript
// 用户签到
async function checkin() {
  try {
    const response = await fetch('/api/checkin', {
      method: 'POST',
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      console.log('签到成功:', data.redemptionCode);
    } else {
      console.log('签到失败:', data.message);
    }
  } catch (error) {
    console.error('请求失败:', error);
  }
}

// 管理员导入兑换码
async function importCodes(file, amount) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('amount', amount);
  formData.append('adminId', 1);
  
  try {
    const response = await fetch('/api/admin/codes/import', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const data = await response.json();
    
    if (data.success) {
      console.log('导入成功:', data.result);
    }
  } catch (error) {
    console.error('导入失败:', error);
  }
}
```

---

**注意**: 所有API都需要适当的认证，请确保在请求中包含正确的Session Cookie。
