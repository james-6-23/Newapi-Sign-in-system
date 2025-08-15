# KYX 签到系统 - 用户等级系统 API 集成指南

## 📋 概述

本文档详细说明如何将13级修仙境界等级系统集成到现有的KYX签到系统中，包括数据库修改、API接口扩展和前端集成方案。

## 🗄️ 数据库结构分析

### 现有表结构优势
根据 `complete-schema.sql` 分析，现有用户表已包含等级系统基础字段：

```sql
-- 用户表中已有的等级相关字段
level INTEGER DEFAULT 1,           -- 用户等级
experience INTEGER DEFAULT 0,      -- 经验值
total_checkins INTEGER DEFAULT 0,  -- 总签到次数
consecutive_days INTEGER DEFAULT 0, -- 连续签到天数
max_consecutive_days INTEGER DEFAULT 0 -- 最大连续签到天数
```

### 需要添加的新表
- `user_levels` - 等级配置表
- `user_experience_logs` - 经验记录表
- `user_level_history` - 等级变化历史
- `level_rewards` - 等级奖励配置
- `user_level_rewards` - 用户奖励领取记录
- `experience_rules` - 经验获取规则

## 🔧 系统集成步骤

### 步骤1: 数据库升级

```bash
# 1. 备份现有数据库
cp database.db database_backup_$(date +%Y%m%d).db

# 2. 执行等级系统SQL脚本
sqlite3 database.db < user-level-system.sql

# 3. 验证表结构
sqlite3 database.db ".schema user_levels"
```

### 步骤2: 后端代码集成

```javascript
// 在主应用中初始化等级系统
const UserLevelSystem = require('./level-system-implementation');

class KYXApp {
    constructor() {
        this.levelSystem = new UserLevelSystem(this.database);
    }

    async initialize() {
        await this.levelSystem.initialize();
        console.log('🎯 KYX应用初始化完成');
    }

    // 修改现有签到方法
    async processUserCheckin(userId, checkinData) {
        // 原有签到逻辑...
        const checkinResult = await this.createCheckinRecord(userId, checkinData);
        
        // 新增：处理等级系统
        const experienceGained = await this.levelSystem.handleUserCheckin(
            userId, 
            checkinData.consecutiveDays, 
            checkinResult.id
        );
        
        return {
            ...checkinResult,
            experience_gained: experienceGained
        };
    }
}
```

## 🌐 API 接口扩展

### 1. 用户等级信息接口

```http
GET /api/user/level-info
```

**响应示例**:
```json
{
    "success": true,
    "data": {
        "user_id": 1,
        "username": "testuser",
        "current_level": 3,
        "current_experience": 350,
        "current_level_name": "结丹",
        "level_description": "凝聚金丹，修为大幅提升",
        "level_color": "#DAA520",
        "level_icon": "💊",
        "checkin_reward_multiplier": 1.2,
        "next_level_id": 4,
        "next_level_name": "元婴",
        "next_level_required_exp": 600,
        "experience_to_next_level": 250,
        "level_progress_percent": 58.33,
        "total_checkins": 25,
        "consecutive_days": 8,
        "today_experience": 35
    }
}
```

### 2. 等级排行榜接口

```http
GET /api/leaderboard?page=1&limit=50
```

**响应示例**:
```json
{
    "success": true,
    "data": {
        "leaderboard": [
            {
                "rank": 1,
                "id": 5,
                "username": "修仙大佬",
                "level": 13,
                "level_name": "道祖",
                "level_color": "#8A2BE2",
                "level_icon": "🌍",
                "experience": 15000,
                "total_checkins": 1000,
                "consecutive_days": 100
            }
        ],
        "pagination": {
            "page": 1,
            "limit": 50,
            "total": 150,
            "totalPages": 3
        },
        "user_rank": 25
    }
}
```

### 3. 用户等级历史接口

```http
GET /api/user/level-history
```

**响应示例**:
```json
{
    "success": true,
    "data": [
        {
            "id": 15,
            "old_level": 2,
            "new_level": 3,
            "old_experience": 100,
            "new_experience": 300,
            "level_up_reason": "经验值达到升级条件",
            "level_up_time": "2024-01-15T10:30:00Z",
            "checkin_days_at_levelup": 15,
            "consecutive_days_at_levelup": 5
        }
    ]
}
```

### 4. 等级奖励领取接口

```http
POST /api/user/claim-level-rewards
Content-Type: application/json

{
    "level_id": 3
}
```

**响应示例**:
```json
{
    "success": true,
    "message": "成功领取结丹境界奖励",
    "data": {
        "rewards_claimed": [
            {
                "reward_type": "money",
                "reward_amount": 50.00,
                "reward_description": "结丹成功奖励"
            },
            {
                "reward_type": "experience",
                "reward_amount": 100,
                "reward_description": "结丹境界经验奖励"
            }
        ]
    }
}
```

## 📱 前端集成方案

### 1. 等级显示组件

```vue
<template>
  <div class="user-level-card">
    <!-- 等级信息 -->
    <div class="level-header">
      <span class="level-icon">{{ levelInfo.level_icon }}</span>
      <div class="level-details">
        <h3 class="level-name" :style="{ color: levelInfo.level_color }">
          {{ levelInfo.current_level_name }}
        </h3>
        <p class="level-description">{{ levelInfo.level_description }}</p>
      </div>
    </div>
    
    <!-- 经验进度条 -->
    <div class="experience-progress">
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          :style="{ 
            width: levelInfo.level_progress_percent + '%',
            backgroundColor: levelInfo.level_color 
          }"
        ></div>
      </div>
      <div class="progress-text">
        {{ levelInfo.current_experience }} / {{ levelInfo.next_level_required_exp }}
        ({{ levelInfo.level_progress_percent }}%)
      </div>
    </div>
    
    <!-- 下一级信息 -->
    <div class="next-level-info" v-if="levelInfo.next_level_name">
      <p>距离 <strong>{{ levelInfo.next_level_name }}</strong> 还需 
         <strong>{{ levelInfo.experience_to_next_level }}</strong> 经验</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'UserLevelCard',
  props: {
    levelInfo: {
      type: Object,
      required: true
    }
  }
}
</script>
```

### 2. 升级动画组件

```vue
<template>
  <div class="level-up-modal" v-if="showModal" @click="closeModal">
    <div class="modal-content" @click.stop>
      <div class="level-up-animation">
        <div class="golden-light"></div>
        <div class="level-icon">{{ newLevel.level_icon }}</div>
        <h2 class="congratulations">恭喜升级！</h2>
        <h3 class="new-level-name" :style="{ color: newLevel.level_color }">
          {{ newLevel.level_name }}
        </h3>
        <p class="level-description">{{ newLevel.level_description }}</p>
        
        <!-- 奖励列表 -->
        <div class="rewards-list" v-if="rewards.length > 0">
          <h4>升级奖励</h4>
          <div class="reward-item" v-for="reward in rewards" :key="reward.id">
            <span class="reward-icon">💰</span>
            <span class="reward-text">{{ reward.reward_description }}</span>
            <span class="reward-amount">+{{ reward.reward_amount }}</span>
          </div>
        </div>
        
        <button class="close-btn" @click="closeModal">继续修炼</button>
      </div>
    </div>
  </div>
</template>
```

### 3. 排行榜组件

```vue
<template>
  <div class="leaderboard">
    <h2>修仙排行榜</h2>
    
    <!-- 用户当前排名 -->
    <div class="user-rank-card">
      <p>你的排名: <strong>#{{ userRank }}</strong></p>
    </div>
    
    <!-- 排行榜列表 -->
    <div class="leaderboard-list">
      <div 
        class="rank-item" 
        v-for="(user, index) in leaderboard" 
        :key="user.id"
        :class="{ 'top-three': index < 3 }"
      >
        <div class="rank-number">{{ user.rank }}</div>
        <div class="user-info">
          <span class="username">{{ user.username }}</span>
          <div class="level-info">
            <span class="level-icon">{{ user.level_icon }}</span>
            <span class="level-name" :style="{ color: user.level_color }">
              {{ user.level_name }}
            </span>
          </div>
        </div>
        <div class="stats">
          <div class="experience">{{ user.experience }} 经验</div>
          <div class="checkins">{{ user.total_checkins }} 天签到</div>
        </div>
      </div>
    </div>
  </div>
</template>
```

## 🎮 游戏化功能增强

### 1. 成就系统集成

```sql
-- 成就表
CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    achievement_name TEXT NOT NULL,
    achievement_description TEXT,
    achievement_type TEXT NOT NULL,  -- level, checkin, consecutive
    requirement_value INTEGER NOT NULL,
    reward_experience INTEGER DEFAULT 0,
    reward_money REAL DEFAULT 0,
    achievement_icon TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- 用户成就表
CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_id INTEGER NOT NULL,
    achieved_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (achievement_id) REFERENCES achievements (id),
    UNIQUE(user_id, achievement_id)
);
```

### 2. 每日任务系统

```sql
-- 每日任务表
CREATE TABLE IF NOT EXISTS daily_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_name TEXT NOT NULL,
    quest_description TEXT,
    quest_type TEXT NOT NULL,        -- checkin, consecutive, social
    target_value INTEGER NOT NULL,
    reward_experience INTEGER DEFAULT 0,
    reward_money REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 用户任务进度表
CREATE TABLE IF NOT EXISTS user_quest_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    quest_id INTEGER NOT NULL,
    current_progress INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    quest_date TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (quest_id) REFERENCES daily_quests (id),
    UNIQUE(user_id, quest_id, quest_date)
);
```

## 📊 数据分析和监控

### 1. 等级分布统计

```sql
-- 等级分布查询
SELECT 
    ul.level_name,
    COUNT(u.id) as user_count,
    ROUND(COUNT(u.id) * 100.0 / (SELECT COUNT(*) FROM users WHERE is_active = TRUE), 2) as percentage
FROM user_levels ul
LEFT JOIN users u ON ul.id = u.level AND u.is_active = TRUE
GROUP BY ul.id, ul.level_name
ORDER BY ul.id;
```

### 2. 经验获取分析

```sql
-- 每日经验获取统计
SELECT 
    date(created_at) as date,
    experience_type,
    COUNT(*) as gain_count,
    SUM(experience_amount) as total_experience,
    AVG(experience_amount) as avg_experience
FROM user_experience_logs
WHERE created_at >= date('now', '-30 days')
GROUP BY date(created_at), experience_type
ORDER BY date DESC;
```

## 🚀 部署和测试

### 1. 数据库迁移脚本

```bash
#!/bin/bash
# deploy-level-system.sh

echo "🚀 开始部署用户等级系统..."

# 备份数据库
echo "📦 备份数据库..."
cp database.db "database_backup_$(date +%Y%m%d_%H%M%S).db"

# 执行SQL脚本
echo "🗄️ 执行数据库升级..."
sqlite3 database.db < user-level-system.sql

# 验证表结构
echo "✅ 验证表结构..."
sqlite3 database.db ".tables" | grep -E "(user_levels|user_experience_logs|level_rewards)"

echo "🎉 用户等级系统部署完成！"
```

### 2. 测试用例

```javascript
// 等级系统测试
describe('用户等级系统测试', () => {
    test('用户签到获得经验', async () => {
        const userId = 1;
        const experience = await levelSystem.handleUserCheckin(userId, 5, 123);
        expect(experience).toBeGreaterThan(0);
    });

    test('用户等级升级', async () => {
        const userId = 1;
        await levelSystem.addUserExperience(userId, 500, 'test', '测试升级');
        const userInfo = await levelSystem.getUserLevelInfo(userId);
        expect(userInfo.current_level).toBeGreaterThan(1);
    });

    test('排行榜查询', async () => {
        const leaderboard = await levelSystem.getLeaderboard(10, 0);
        expect(leaderboard).toHaveLength(10);
        expect(leaderboard[0].rank).toBe(1);
    });
});
```

## 📈 性能优化建议

1. **缓存策略**: 用户等级信息缓存1小时
2. **批量处理**: 经验值更新使用批量事务
3. **索引优化**: 为查询频繁的字段添加复合索引
4. **数据归档**: 定期归档历史经验记录

---

*本文档提供了完整的等级系统集成方案，确保与现有KYX签到系统的无缝集成。*
