# 秘境抽奖系统实现指南

## 1. 实施步骤概览

### 1.1 实施阶段
1. **数据库准备阶段** (1-2天)
2. **核心功能开发阶段** (3-5天)
3. **管理界面开发阶段** (2-3天)
4. **集成测试阶段** (1-2天)
5. **部署上线阶段** (1天)

### 1.2 技术栈要求
- **后端**: Cloudflare Workers + D1 Database
- **前端**: 原生JavaScript + HTML/CSS
- **数据库**: SQLite (D1)
- **认证**: 基于现有Session系统

## 2. 数据库实施

### 2.1 数据库迁移步骤

#### 步骤1: 备份现有数据
```bash
# 导出现有数据库结构和数据
wrangler d1 export <DATABASE_NAME> --output=backup_$(date +%Y%m%d).sql
```

#### 步骤2: 执行抽奖系统建表脚本
```bash
# 执行抽奖系统数据库脚本
wrangler d1 execute <DATABASE_NAME> --file=lottery-system-schema.sql
```

#### 步骤3: 验证数据库结构
```sql
-- 验证表是否正确创建
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%lottery%' OR name LIKE '%prize%' OR name LIKE '%wheel%';

-- 验证转盘概率配置
SELECT wheel_id, config_name, total_probability 
FROM (
    SELECT wc.id as wheel_id, wc.config_name, SUM(wi.probability) as total_probability
    FROM wheel_config wc
    LEFT JOIN wheel_items wi ON wc.id = wi.wheel_config_id
    GROUP BY wc.id, wc.config_name
) WHERE total_probability = 100;
```

### 2.2 初始数据验证
- 确认13个转盘配置已创建
- 验证所有转盘概率总和为100%
- 检查奖品池数据完整性
- 确认索引正确创建

## 3. 核心功能实现

### 3.1 抽奖引擎实现

在 `workers-admin-super.js` 中添加抽奖核心类：

```javascript
// ============================================
// 抽奖系统核心类
// ============================================

class LotterySystem {
  constructor(env) {
    this.env = env;
    this.config = new Map();
  }

  async initialize() {
    await this.loadSystemConfig();
  }

  async loadSystemConfig() {
    const configs = await this.env.DB.prepare(`
      SELECT config_key, config_value, config_type 
      FROM lottery_system_config 
      WHERE is_editable = TRUE
    `).all();

    if (configs.results) {
      configs.results.forEach(config => {
        let value = config.config_value;
        switch (config.config_type) {
          case 'integer':
            value = parseInt(value);
            break;
          case 'float':
            value = parseFloat(value);
            break;
          case 'boolean':
            value = value === 'true';
            break;
          case 'json':
            value = JSON.parse(value);
            break;
        }
        this.config.set(config.config_key, value);
      });
    }
  }

  async performLottery(userId, wheelConfigId) {
    // 验证系统状态
    if (!this.config.get('system_enabled')) {
      throw new Error('抽奖系统暂时关闭');
    }

    // 验证用户状态
    await this.validateUserStatus(userId, wheelConfigId);

    // 获取转盘配置
    const wheelConfig = await this.getWheelConfig(wheelConfigId);
    const wheelItems = await this.getWheelItems(wheelConfigId);

    // 获取用户统计数据
    const userStats = await this.getUserLotteryStats(userId, wheelConfigId);

    // 执行抽奖逻辑
    const winningItem = this.calculateWinningItem(wheelItems, userStats.pity_counter, wheelConfig.pity_threshold);

    // 创建抽奖记录
    const lotteryRecord = await this.createLotteryRecord(userId, wheelConfigId, winningItem, userStats.pity_counter >= wheelConfig.pity_threshold);

    // 发放奖励
    await this.deliverReward(userId, winningItem.prize, lotteryRecord.id);

    // 更新统计数据
    await this.updateUserStats(userId, wheelConfigId, winningItem.prize);

    return {
      lottery_record: lotteryRecord,
      prize_won: winningItem.prize,
      updated_stats: await this.getUserLotteryStats(userId, wheelConfigId)
    };
  }

  async validateUserStatus(userId, wheelConfigId) {
    // 验证用户等级
    const user = await this.env.DB.prepare(`
      SELECT u.id, u.level, ul.level_name 
      FROM users u 
      JOIN user_levels ul ON u.level = ul.id 
      WHERE u.id = ? AND u.is_active = TRUE
    `).bind(userId).first();

    if (!user) {
      throw new Error('用户不存在或已禁用');
    }

    // 验证转盘权限
    const wheelConfig = await this.env.DB.prepare(`
      SELECT * FROM wheel_config 
      WHERE id = ? AND target_user_level = ? AND is_active = TRUE
    `).bind(wheelConfigId, user.level).first();

    if (!wheelConfig) {
      throw new Error('无权使用此转盘或转盘已关闭');
    }

    // 验证抽奖次数
    const userStats = await this.getUserLotteryStats(userId, wheelConfigId);
    if (userStats.daily_spins >= wheelConfig.max_daily_spins) {
      throw new Error('今日抽奖次数已用完');
    }

    return { user, wheelConfig };
  }

  calculateWinningItem(wheelItems, pityCounter, pityThreshold) {
    // 检查是否触发保底
    if (pityCounter >= pityThreshold) {
      const pityItems = wheelItems.filter(item => item.is_pity_item || 
        ['epic', 'legendary'].includes(item.prize.prize_rarity));
      return pityItems[Math.floor(Math.random() * pityItems.length)];
    }

    // 正常概率计算
    const totalWeight = wheelItems.reduce((sum, item) => sum + item.probability, 0);
    const randomValue = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const item of wheelItems) {
      currentWeight += item.probability;
      if (randomValue <= currentWeight) {
        return item;
      }
    }

    // 兜底返回第一个物品
    return wheelItems[0];
  }

  async deliverReward(userId, prize, lotteryRecordId) {
    try {
      switch (prize.prize_type) {
        case 'redemption_code':
          await this.deliverRedemptionCode(userId, prize.prize_value);
          break;
        case 'experience':
          await this.deliverExperience(userId, prize.prize_value, !prize.is_punishment);
          break;
        case 'signin_effect':
          await this.deliverSigninEffect(userId, prize, lotteryRecordId);
          break;
        default:
          throw new Error(`未知奖品类型: ${prize.prize_type}`);
      }

      // 更新发放状态
      await this.env.DB.prepare(`
        UPDATE user_lottery_records 
        SET reward_delivered = TRUE, delivery_status = 'success'
        WHERE id = ?
      `).bind(lotteryRecordId).run();

    } catch (error) {
      // 记录发放失败
      await this.env.DB.prepare(`
        UPDATE user_lottery_records 
        SET delivery_status = 'failed', delivery_error = ?
        WHERE id = ?
      `).bind(error.message, lotteryRecordId).run();
      
      throw error;
    }
  }

  async deliverRedemptionCode(userId, amount) {
    // 查找可用兑换码
    const availableCode = await this.env.DB.prepare(`
      SELECT id, code FROM redemption_codes 
      WHERE is_distributed = FALSE AND amount = ? 
      ORDER BY created_at ASC LIMIT 1
    `).bind(amount).first();

    if (!availableCode) {
      throw new Error(`暂无${amount}元兑换码可供发放`);
    }

    // 分配给用户
    await this.env.DB.prepare(`
      UPDATE redemption_codes 
      SET is_distributed = TRUE, distributed_to = ?, 
          distributed_at = ?, distribution_type = 'lottery'
      WHERE id = ?
    `).bind(userId, getUTC8TimestampString(), availableCode.id).run();

    return availableCode;
  }

  async deliverExperience(userId, amount, isPositive = true) {
    const finalAmount = isPositive ? Math.abs(amount) : -Math.abs(amount);
    
    // 调用现有经验系统
    const levelSystem = new UserLevelSystem(this.env);
    await levelSystem.initialize();
    
    await levelSystem.addUserExperience(
      userId, 
      finalAmount, 
      'lottery_reward', 
      `抽奖${isPositive ? '获得' : '失去'}${Math.abs(amount)}点经验`
    );
  }

  async deliverSigninEffect(userId, prize, lotteryRecordId) {
    const endTime = prize.effect_duration > 0 ? 
      new Date(Date.now() + prize.effect_duration * 60 * 60 * 1000).toISOString() : null;

    await this.env.DB.prepare(`
      INSERT INTO user_activity_effects 
      (user_id, effect_type, effect_value, effect_multiplier, 
       source_prize_id, source_lottery_id, start_time, end_time, description)
      VALUES (?, 'signin_effect', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, prize.prize_value, prize.effect_multiplier, 
      prize.id, lotteryRecordId, getUTC8TimestampString(), endTime,
      `${prize.prize_name} - ${prize.prize_description}`
    ).run();
  }

  // 其他辅助方法...
  async getWheelConfig(wheelConfigId) {
    return await this.env.DB.prepare(`
      SELECT * FROM wheel_config WHERE id = ?
    `).bind(wheelConfigId).first();
  }

  async getWheelItems(wheelConfigId) {
    const items = await this.env.DB.prepare(`
      SELECT wi.*, pp.* 
      FROM wheel_items wi
      JOIN prize_pool pp ON wi.prize_id = pp.id
      WHERE wi.wheel_config_id = ?
      ORDER BY wi.position_index
    `).bind(wheelConfigId).all();
    
    return items.results || [];
  }

  async getUserLotteryStats(userId, wheelConfigId) {
    let stats = await this.env.DB.prepare(`
      SELECT * FROM user_lottery_stats 
      WHERE user_id = ? AND wheel_config_id = ?
    `).bind(userId, wheelConfigId).first();

    if (!stats) {
      // 创建初始统计记录
      await this.env.DB.prepare(`
        INSERT INTO user_lottery_stats 
        (user_id, wheel_config_id, total_spins, daily_spins, pity_counter)
        VALUES (?, ?, 0, 0, 0)
      `).bind(userId, wheelConfigId).run();

      stats = {
        user_id: userId,
        wheel_config_id: wheelConfigId,
        total_spins: 0,
        daily_spins: 0,
        pity_counter: 0
      };
    }

    return stats;
  }
}
```

### 3.2 API路由集成

在 `handleApiRequest` 函数中添加抽奖路由：

```javascript
// 在现有路由处理中添加
if (pathParts[0] === 'lottery') {
  return await handleLotteryApi(request, env, pathParts, method, session);
}
```

### 3.3 权限管理集成

在管理员权限初始化中添加抽奖权限：

```javascript
// 在 insertAdminConfigData 函数中添加
const lotteryPermissions = [
  [1, 'lottery_config', 'admin', 1, '抽奖系统配置权限'],
  [1, 'lottery_prizes', 'admin', 1, '奖品池管理权限'],
  [1, 'lottery_stats', 'admin', 1, '抽奖统计查看权限']
];

for (const perm of lotteryPermissions) {
  await env.DB.prepare(`
    INSERT OR IGNORE INTO admin_permissions 
    (admin_id, permission_type, permission_level, granted_by, notes, granted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(...perm, getUTC8TimestampString()).run();
}
```

## 4. 前端界面实现

### 4.1 管理后台集成

在现有HTML中添加抽奖管理标签页：

```html
<!-- 在标签页导航中添加 -->
<div class="tab" onclick="showTab('lottery')">🎰 抽奖管理</div>

<!-- 在内容区域添加 -->
<div id="lottery" class="tab-content">
  <div class="lottery-management">
    <!-- 奖品池管理区域 -->
    <!-- 转盘配置区域 -->
    <!-- 统计数据区域 -->
  </div>
</div>
```

### 4.2 JavaScript功能集成

```javascript
// 抽奖管理相关函数
async function loadLotteryManagement() {
  // 加载抽奖管理界面
}

async function managePrizePool() {
  // 奖品池管理
}

async function configureWheels() {
  // 转盘配置
}
```

## 5. 测试和验证

### 5.1 功能测试清单
- [ ] 数据库表结构正确创建
- [ ] 初始数据正确插入
- [ ] 用户抽奖功能正常
- [ ] 保底机制正确触发
- [ ] 奖励发放功能正常
- [ ] 管理员配置功能正常
- [ ] 权限控制正确生效

### 5.2 性能测试
- [ ] 并发抽奖测试
- [ ] 大数据量查询测试
- [ ] 响应时间测试

### 5.3 安全测试
- [ ] 权限验证测试
- [ ] 输入验证测试
- [ ] SQL注入防护测试

## 6. 部署上线

### 6.1 部署前检查
- [ ] 代码审查完成
- [ ] 测试用例全部通过
- [ ] 数据库备份完成
- [ ] 回滚方案准备就绪

### 6.2 部署步骤
1. 执行数据库迁移
2. 部署新版本代码
3. 验证基础功能
4. 开启抽奖系统
5. 监控系统状态

### 6.3 上线后监控
- 监控抽奖成功率
- 监控奖励发放成功率
- 监控系统错误率
- 监控用户反馈

## 7. 维护和优化

### 7.1 日常维护
- 定期清理过期效果
- 监控兑换码库存
- 检查系统性能指标
- 处理用户反馈

### 7.2 数据分析
- 分析用户抽奖行为
- 优化转盘概率配置
- 调整奖品池配置
- 改进用户体验

### 7.3 功能迭代
- 根据用户反馈优化功能
- 添加新的奖品类型
- 优化抽奖算法
- 增强管理功能
