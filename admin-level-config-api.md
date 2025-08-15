# KYX 签到系统 - 管理员等级配置 API 接口文档

## 📋 概述

本文档详细说明KYX签到系统管理员等级配置功能的API接口，包括等级配置管理、经验规则设置、奖励配置和审核工作流等功能。

### 🔐 权限说明
- **read**: 查看权限
- **write**: 编辑权限  
- **admin**: 管理员权限（包含审核功能）

---

## 🏗️ 1. 等级配置管理接口

### 1.1 获取等级配置列表
**用途**: 获取所有等级的配置信息和统计数据

```http
GET /api/admin/level-configs
Authorization: Bearer {admin_token}
```

**权限要求**: `level_config:read`

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "level_name": "炼气",
      "level_description": "修仙入门境界，初窥修炼门径",
      "required_experience": 0,
      "required_checkin_days": 0,
      "required_consecutive_days": 0,
      "daily_experience_bonus": 10,
      "checkin_reward_multiplier": 1.0,
      "special_privileges": "{\"description\": \"新手修炼者\"}",
      "level_color": "#8B4513",
      "level_icon": "🌱",
      "current_user_count": 150,
      "avg_user_experience": 45.5,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total_levels": 13,
  "total_users": 1500
}
```

### 1.2 更新等级配置
**用途**: 修改指定等级的配置参数

```http
PUT /api/admin/level-configs/{level_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "required_experience": 150,
  "required_checkin_days": 10,
  "required_consecutive_days": 5,
  "daily_experience_bonus": 15,
  "checkin_reward_multiplier": 1.2,
  "level_description": "更新后的等级描述",
  "change_reason": "根据用户反馈调整升级难度"
}
```

**权限要求**: `level_config:write`

**响应示例**:
```json
{
  "success": true,
  "message": "等级配置变更已提交审核",
  "data": {
    "approval_id": 123,
    "requires_approval": true,
    "estimated_impact": {
      "affected_users": 45,
      "potential_level_changes": 12,
      "impact_level": "medium"
    }
  }
}
```

### 1.3 批量更新等级配置
**用途**: 同时修改多个等级的配置

```http
PUT /api/admin/level-configs/batch
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "updates": [
    {
      "level_id": 2,
      "required_experience": 120,
      "daily_experience_bonus": 18
    },
    {
      "level_id": 3,
      "required_experience": 350,
      "daily_experience_bonus": 25
    }
  ],
  "change_reason": "整体平衡性调整"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "批量配置变更已提交审核",
  "data": {
    "approval_ids": [124, 125],
    "total_updates": 2,
    "requires_approval": true
  }
}
```

### 1.4 获取等级配置变更历史
**用途**: 查看等级配置的修改历史记录

```http
GET /api/admin/level-configs/{level_id}/history?page=1&limit=20
Authorization: Bearer {admin_token}
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 45,
      "level_id": 2,
      "field_name": "required_experience",
      "old_value": "100",
      "new_value": "120",
      "change_reason": "平衡性调整",
      "changed_by": 1,
      "changed_by_username": "admin",
      "changed_at": "2024-01-15T10:30:00Z",
      "version_id": 5,
      "is_reverted": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

---

## ⚡ 2. 经验规则管理接口

### 2.1 获取经验规则列表
**用途**: 获取所有经验获取规则的配置和统计

```http
GET /api/admin/experience-rules
Authorization: Bearer {admin_token}
```

**权限要求**: `experience_rules:read`

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "rule_name": "每日签到",
      "rule_type": "daily_checkin",
      "base_experience": 10,
      "bonus_conditions": "{\"consecutive_multiplier\": 1.1}",
      "max_daily_gain": 0,
      "usage_count": 15420,
      "total_experience_granted": 154200,
      "is_active": true,
      "description": "每日签到基础经验",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 2.2 更新经验规则
**用途**: 修改经验获取规则

```http
PUT /api/admin/experience-rules/{rule_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "base_experience": 15,
  "bonus_conditions": "{\"consecutive_multiplier\": 1.2, \"max_bonus\": 100}",
  "max_daily_gain": 500,
  "description": "调整后的每日签到经验规则",
  "change_reason": "提升用户活跃度"
}
```

**权限要求**: `experience_rules:write`

**响应示例**:
```json
{
  "success": true,
  "message": "经验规则变更已提交审核",
  "data": {
    "approval_id": 126,
    "requires_approval": true,
    "impact_analysis": {
      "affected_users": 1200,
      "daily_usage": 500,
      "experience_change_per_use": 5,
      "estimated_daily_impact": 2500
    }
  }
}
```

### 2.3 创建新经验规则
**用途**: 添加新的经验获取规则

```http
POST /api/admin/experience-rules
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "rule_name": "周末双倍",
  "rule_type": "weekend_bonus",
  "base_experience": 20,
  "bonus_conditions": "{\"weekends_only\": true, \"multiplier\": 2.0}",
  "max_daily_gain": 100,
  "description": "周末签到双倍经验",
  "change_reason": "增加周末活跃度"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "新经验规则已创建",
  "data": {
    "rule_id": 5,
    "requires_approval": true,
    "approval_id": 127
  }
}
```

---

## 🎁 3. 奖励配置管理接口

### 3.1 获取奖励配置列表
**用途**: 获取所有等级的奖励配置

```http
GET /api/admin/reward-configs?level_id={level_id}
Authorization: Bearer {admin_token}
```

**权限要求**: `rewards_config:read`

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "level_id": 2,
      "level_name": "筑基",
      "reward_type": "money",
      "reward_amount": 20.00,
      "reward_description": "筑基成功奖励",
      "is_one_time": true,
      "claimed_count": 45,
      "total_claimed_amount": 900.00,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 3.2 更新奖励配置
**用途**: 修改等级奖励配置

```http
PUT /api/admin/reward-configs/{reward_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "reward_amount": 25.00,
  "reward_description": "调整后的筑基奖励",
  "change_reason": "提升奖励吸引力"
}
```

**权限要求**: `rewards_config:write`

### 3.3 批量更新奖励配置
**用途**: 同时修改多个奖励配置

```http
PUT /api/admin/reward-configs/batch
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "updates": [
    {
      "reward_id": 1,
      "reward_amount": 25.00
    },
    {
      "reward_id": 2,
      "reward_amount": 60.00
    }
  ],
  "change_reason": "整体奖励调整"
}
```

---

## 🔍 4. 审核工作流接口

### 4.1 获取待审核列表
**用途**: 获取所有待审核的配置变更

```http
GET /api/admin/approvals?status=pending&page=1&limit=20
Authorization: Bearer {admin_token}
```

**权限要求**: `system_settings:admin`

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "change_type": "level_config",
      "change_id": 2,
      "submitted_by": 2,
      "submitted_by_username": "level_admin",
      "submitted_at": "2024-01-15T10:00:00Z",
      "approval_status": "pending",
      "priority_level": "normal",
      "estimated_impact": {
        "affected_users": 45,
        "impact_level": "medium"
      },
      "change_summary": "筑基等级经验要求从100调整为120"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

### 4.2 审核配置变更
**用途**: 批准或拒绝配置变更申请

```http
POST /api/admin/approvals/{approval_id}/review
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "decision": "approved",
  "comments": "变更合理，批准执行"
}
```

**权限要求**: `system_settings:admin`

**响应示例**:
```json
{
  "success": true,
  "message": "配置变更已批准并生效",
  "data": {
    "approval_id": 123,
    "decision": "approved",
    "applied_at": "2024-01-15T11:00:00Z",
    "affected_users": 45
  }
}
```

### 4.3 批量审核
**用途**: 同时处理多个审核申请

```http
POST /api/admin/approvals/batch-review
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "approvals": [
    {
      "approval_id": 123,
      "decision": "approved",
      "comments": "批准"
    },
    {
      "approval_id": 124,
      "decision": "rejected",
      "comments": "影响过大，需要重新评估"
    }
  ]
}
```

---

## 📊 5. 统计和分析接口

### 5.1 获取配置变更统计
**用途**: 获取配置变更的统计数据

```http
GET /api/admin/config-stats?period=30days
Authorization: Bearer {admin_token}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "period": "30days",
    "total_changes": 25,
    "approved_changes": 20,
    "rejected_changes": 3,
    "pending_changes": 2,
    "change_types": {
      "level_config": 10,
      "experience_rules": 8,
      "reward_config": 7
    },
    "top_admins": [
      {
        "admin_id": 2,
        "username": "level_admin",
        "change_count": 12
      }
    ]
  }
}
```

### 5.2 获取影响分析报告
**用途**: 分析配置变更对用户的影响

```http
GET /api/admin/impact-analysis/{approval_id}
Authorization: Bearer {admin_token}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "approval_id": 123,
    "change_type": "level_config",
    "impact_summary": {
      "affected_users": 45,
      "potential_level_changes": 12,
      "estimated_experience_impact": 540,
      "impact_level": "medium"
    },
    "detailed_analysis": {
      "user_distribution": {
        "level_1": 20,
        "level_2": 25
      },
      "experience_changes": {
        "average_change": 12,
        "max_change": 50,
        "min_change": 0
      }
    }
  }
}
```

---

## 🔧 6. 系统配置接口

### 6.1 获取系统配置参数
**用途**: 获取系统级配置参数

```http
GET /api/admin/system-config?category=level_system
Authorization: Bearer {admin_token}
```

**权限要求**: `system_settings:read`

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "config_category": "level_system",
      "config_key": "max_level",
      "config_value": "13",
      "config_type": "integer",
      "config_description": "系统最大等级数",
      "default_value": "13",
      "requires_approval": true,
      "last_modified_by": 1,
      "last_modified_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 6.2 更新系统配置参数
**用途**: 修改系统级配置参数

```http
PUT /api/admin/system-config/{config_id}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "config_value": "15",
  "change_reason": "扩展等级上限"
}
```

**权限要求**: `system_settings:admin`

---

## 🔄 7. 配置回滚接口

### 7.1 创建配置快照
**用途**: 创建当前配置的快照备份

```http
POST /api/admin/config-snapshots
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "snapshot_name": "2024春节前备份",
  "description": "春节活动前的配置备份",
  "include_categories": ["level_config", "experience_rules", "reward_config"]
}
```

### 7.2 回滚到指定版本
**用途**: 将配置回滚到指定的历史版本

```http
POST /api/admin/config-rollback
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "version_id": 5,
  "rollback_reason": "紧急回滚：新配置导致系统异常",
  "confirm_rollback": true
}
```

---

## 🚨 错误处理

### 常见错误码
- `403001`: 权限不足
- `404001`: 配置不存在
- `400001`: 参数验证失败
- `409001`: 配置冲突
- `500001`: 系统内部错误

### 错误响应格式
```json
{
  "success": false,
  "error": {
    "code": "403001",
    "message": "权限不足：无法修改等级配置",
    "details": {
      "required_permission": "level_config:write",
      "current_permission": "level_config:read"
    }
  }
}
```

---

*本API文档提供了完整的管理员等级配置功能接口，支持细粒度的权限控制和完整的审核工作流。*
