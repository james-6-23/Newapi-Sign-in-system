# 抽奖系统调试指南

## 🔍 问题排查步骤

既然你已经手动导入了数据库表结构，我们需要按以下步骤逐一排查问题：

### 1. **数据库表验证**

首先确认数据库表是否正确创建：

```sql
-- 检查表是否存在
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%lottery%' OR name LIKE '%prize%' OR name LIKE '%wheel%';

-- 检查prize_pool表结构
PRAGMA table_info(prize_pool);

-- 检查是否有数据
SELECT COUNT(*) FROM prize_pool;
SELECT COUNT(*) FROM wheel_config;
SELECT COUNT(*) FROM lottery_system_config;
```

### 2. **代码修复内容**

我已经在代码中添加了以下修复：

#### A. 数据库初始化逻辑修改
- 改为检查表存在时插入基础数据
- 使用 `INSERT OR IGNORE` 避免重复插入
- 分离数据插入函数

#### B. API调试信息增强
- 在所有关键API函数中添加详细日志
- 包括请求参数、查询结果、错误信息

#### C. 前端调试信息
- 在loadPrizes函数中添加详细调试日志
- 显示API调用过程和响应数据

### 3. **调试步骤**

#### 步骤1: 检查浏览器控制台
重新部署后，访问抽奖管理页面，在浏览器控制台查看：

```javascript
// 应该看到的日志
🔍 开始加载奖品数据...
🔍 查询参数: {type: "all", rarity: "all"}
🔍 调用API: lottery/admin/prizes?type=all&rarity=all&limit=100
🔍 API响应: {...}
```

#### 步骤2: 检查网络请求
在浏览器开发者工具的Network标签中：
- 查看 `/api/lottery/admin/prizes` 请求
- 检查响应状态码（应为200）
- 查看响应内容

#### 步骤3: 检查服务器日志
在Cloudflare Workers日志中查看：

```javascript
// 应该看到的服务器日志
🎰 抽奖系统表已存在，检查数据完整性...
📦 插入基础奖品数据...
🎡 插入基础转盘配置...
⚙️ 插入系统配置数据...
✅ 抽奖系统数据检查完成

🎰 抽奖管理API调用: {pathParts: ["lottery", "admin", "prizes"], method: "GET", admin_id: 1}
📦 处理奖品池API
📦 奖品池API调用: {method: "GET", pathParts: ["lottery", "admin", "prizes"]}
```

### 4. **常见问题及解决方案**

#### 问题1: "权限不足"错误
**症状**: API返回403错误
**原因**: session.admin_id为空
**解决**: 
```javascript
// 检查管理员会话
SELECT * FROM admin_sessions WHERE session_id = 'your_session_id';
```

#### 问题2: "表不存在"错误
**症状**: API返回500错误，提示表不存在
**原因**: 数据库表未正确创建
**解决**: 重新执行SQL导入

#### 问题3: "无数据"显示
**症状**: API正常但返回空数据
**原因**: 表存在但无基础数据
**解决**: 手动插入基础数据

### 5. **手动数据插入脚本**

如果自动数据插入失败，可以手动执行：

```sql
-- 插入基础奖品数据
INSERT OR IGNORE INTO prize_pool 
(prize_name, prize_description, prize_type, prize_value, prize_rarity, prize_icon, prize_color, effect_duration, effect_multiplier, is_punishment, min_user_level, max_user_level, created_by)
VALUES 
('新手大礼包', '新手专属奖励包', 'redemption_code', 5.0, 'common', '🎁', '#95a5a6', 0, 1.0, false, 1, 3, 1),
('经验加速器', '获得额外经验值', 'experience', 50, 'common', '⚡', '#3498db', 0, 1.0, false, 1, 13, 1),
('签到双倍', '签到经验翻倍效果', 'signin_effect', 0, 'rare', '💎', '#e74c3c', 24, 2.0, false, 1, 13, 1);

-- 插入基础转盘配置
INSERT OR IGNORE INTO wheel_config 
(config_name, target_user_level, max_daily_spins, spin_cost_type, spin_cost_amount, pity_threshold, pity_prize_id, active_start_time, active_end_time, description, created_by)
VALUES 
('炼气境转盘', 1, 5, 'free', 0, 5, null, null, null, '炼气境修炼者专用转盘', 1),
('筑基境转盘', 2, 4, 'free', 0, 6, null, null, null, '筑基境修炼者专用转盘', 1);

-- 插入系统配置
INSERT OR IGNORE INTO lottery_system_config (config_key, config_value, config_type, config_description)
VALUES 
('system_enabled', 'true', 'boolean', '抽奖系统总开关'),
('global_daily_limit', '10', 'integer', '全局每日最大抽奖次数');
```

### 6. **API测试命令**

可以直接测试API端点：

```bash
# 测试奖品池API
curl -X GET "https://your-domain.com/api/lottery/admin/prizes" \
  -H "Cookie: admin_session=your_session_id"

# 测试转盘配置API
curl -X GET "https://your-domain.com/api/lottery/admin/wheels" \
  -H "Cookie: admin_session=your_session_id"
```

### 7. **完整的调试检查清单**

- [ ] 数据库表已正确创建
- [ ] 基础数据已插入
- [ ] 管理员会话有效
- [ ] API路由正确注册
- [ ] 前端API调用路径正确
- [ ] 浏览器控制台无JavaScript错误
- [ ] 网络请求返回200状态码
- [ ] 服务器日志显示正常处理

### 8. **预期的正常流程**

1. **页面加载**: 抽奖管理页面正常显示
2. **数据加载**: 奖品池显示预设的15个奖品
3. **功能测试**: 可以创建、编辑、删除奖品
4. **转盘配置**: 显示13个等级转盘配置

## 🚀 下一步操作

1. **重新部署代码**
2. **清除浏览器缓存**
3. **重新登录管理后台**
4. **按照调试步骤逐一检查**
5. **记录具体的错误信息**

如果按照以上步骤仍有问题，请提供：
- 浏览器控制台的完整错误日志
- 网络请求的详细信息（状态码、响应内容）
- 服务器端的日志输出

这样我可以更精确地定位和解决问题！🔧✨
