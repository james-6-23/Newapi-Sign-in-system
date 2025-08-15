# 秘境抽奖系统 API 接口设计

## 1. API 概览

### 1.1 基础信息
- **Base URL**: `/api/lottery`
- **认证方式**: Session-based (复用现有认证系统)
- **数据格式**: JSON
- **错误处理**: 统一错误响应格式

### 1.2 通用响应格式
```json
{
  "success": true|false,
  "message": "操作结果描述",
  "data": {}, // 具体数据
  "error": {  // 错误时返回
    "code": "ERROR_CODE",
    "details": "详细错误信息"
  }
}
```

## 2. 用户端 API

### 2.1 获取用户可用转盘列表
```
GET /api/lottery/wheels/available
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "wheels": [
      {
        "id": 1,
        "config_name": "炼气境转盘",
        "target_user_level": 1,
        "max_daily_spins": 3,
        "remaining_spins": 2,
        "pity_counter": 3,
        "pity_threshold": 10,
        "is_active": true,
        "description": "炼气境界专属转盘",
        "background_image": "/images/wheel_bg_1.png"
      }
    ],
    "user_level": 1,
    "user_experience": 150
  }
}
```

### 2.2 获取转盘详细配置
```
GET /api/lottery/wheels/{wheel_id}/config
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "wheel_config": {
      "id": 1,
      "config_name": "炼气境转盘",
      "max_daily_spins": 3,
      "remaining_spins": 2,
      "pity_counter": 3,
      "pity_threshold": 10
    },
    "wheel_items": [
      {
        "position_index": 0,
        "prize": {
          "id": 1,
          "prize_name": "小额兑换码",
          "prize_description": "获得5元兑换码",
          "prize_type": "redemption_code",
          "prize_value": 5.0,
          "prize_rarity": "common",
          "prize_icon": "💰",
          "prize_color": "#27ae60"
        },
        "probability": 25
      }
    ]
  }
}
```

### 2.3 执行抽奖
```
POST /api/lottery/spin
```

**请求参数**:
```json
{
  "wheel_config_id": 1
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "lottery_record": {
      "id": 123,
      "spin_result_position": 3,
      "is_pity_triggered": false,
      "spin_timestamp": "2024-01-15T10:30:00Z"
    },
    "prize_won": {
      "id": 5,
      "prize_name": "经验小包",
      "prize_description": "获得50点经验值",
      "prize_type": "experience",
      "prize_value": 50,
      "prize_rarity": "common",
      "prize_icon": "📚",
      "prize_color": "#27ae60"
    },
    "reward_status": {
      "delivered": true,
      "delivery_status": "success",
      "effect_applied": true
    },
    "updated_stats": {
      "remaining_spins": 1,
      "pity_counter": 4,
      "total_spins": 15
    }
  }
}
```

### 2.4 获取抽奖历史
```
GET /api/lottery/history?page=1&limit=20&wheel_id=1
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": 123,
        "wheel_config_name": "炼气境转盘",
        "prize_name": "经验小包",
        "prize_value": 50,
        "prize_rarity": "common",
        "is_pity_triggered": false,
        "spin_timestamp": "2024-01-15T10:30:00Z",
        "delivery_status": "success"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_records": 95,
      "limit": 20
    }
  }
}
```

### 2.5 获取用户当前效果
```
GET /api/lottery/effects/active
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "active_effects": [
      {
        "id": 45,
        "effect_type": "signin_effect",
        "effect_value": 0,
        "effect_multiplier": 2.0,
        "description": "签到经验翻倍",
        "start_time": "2024-01-15T10:30:00Z",
        "end_time": "2024-01-16T10:30:00Z",
        "remaining_hours": 18.5
      }
    ],
    "total_active_effects": 1
  }
}
```

### 2.6 获取用户抽奖统计
```
GET /api/lottery/stats/summary
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "overall_stats": {
      "total_spins": 156,
      "total_rewards_value": 1250.0,
      "best_prize_rarity": "legendary",
      "consecutive_days": 7
    },
    "wheel_stats": [
      {
        "wheel_config_id": 1,
        "wheel_name": "炼气境转盘",
        "total_spins": 45,
        "daily_spins": 2,
        "pity_counter": 3,
        "last_spin_date": "2024-01-15"
      }
    ]
  }
}
```

## 3. 管理员端 API

### 3.1 奖品池管理

#### 3.1.1 获取奖品池列表
```
GET /api/lottery/admin/prizes?page=1&limit=50&type=all&rarity=all
```

#### 3.1.2 创建奖品
```
POST /api/lottery/admin/prizes
```

**请求参数**:
```json
{
  "prize_name": "新奖品",
  "prize_description": "奖品描述",
  "prize_type": "redemption_code",
  "prize_value": 15.0,
  "prize_rarity": "rare",
  "prize_icon": "💎",
  "prize_color": "#3498db",
  "effect_duration": 0,
  "effect_multiplier": 1.0,
  "is_punishment": false,
  "min_user_level": 1,
  "max_user_level": 13
}
```

#### 3.1.3 更新奖品
```
PUT /api/lottery/admin/prizes/{prize_id}
```

#### 3.1.4 删除奖品
```
DELETE /api/lottery/admin/prizes/{prize_id}
```

### 3.2 转盘配置管理

#### 3.2.1 获取转盘配置列表
```
GET /api/lottery/admin/wheels?level=all&active=true
```

#### 3.2.2 创建转盘配置
```
POST /api/lottery/admin/wheels
```

#### 3.2.3 更新转盘配置
```
PUT /api/lottery/admin/wheels/{wheel_id}
```

#### 3.2.4 配置转盘物品
```
POST /api/lottery/admin/wheels/{wheel_id}/items
```

**请求参数**:
```json
{
  "items": [
    {
      "prize_id": 1,
      "probability": 25,
      "position_index": 0,
      "is_pity_item": false
    }
  ]
}
```

### 3.3 数据统计和分析

#### 3.3.1 获取系统统计
```
GET /api/lottery/admin/stats/system
```

#### 3.3.2 获取用户行为分析
```
GET /api/lottery/admin/stats/users?date_from=2024-01-01&date_to=2024-01-31
```

#### 3.3.3 获取奖品发放统计
```
GET /api/lottery/admin/stats/prizes?wheel_id=1&period=7d
```

### 3.4 系统配置管理

#### 3.4.1 获取系统配置
```
GET /api/lottery/admin/config
```

#### 3.4.2 更新系统配置
```
PUT /api/lottery/admin/config
```

## 4. 错误代码定义

| 错误代码 | 描述 | HTTP状态码 |
|---------|------|-----------|
| LOTTERY_DISABLED | 抽奖系统已关闭 | 503 |
| INSUFFICIENT_SPINS | 抽奖次数不足 | 400 |
| WHEEL_NOT_AVAILABLE | 转盘不可用 | 400 |
| LEVEL_REQUIREMENT_NOT_MET | 等级要求不满足 | 403 |
| REWARD_DELIVERY_FAILED | 奖励发放失败 | 500 |
| INVALID_WHEEL_CONFIG | 转盘配置无效 | 400 |
| PROBABILITY_SUM_ERROR | 概率总和错误 | 400 |
| PRIZE_NOT_FOUND | 奖品不存在 | 404 |
| WHEEL_CONFIG_NOT_FOUND | 转盘配置不存在 | 404 |
