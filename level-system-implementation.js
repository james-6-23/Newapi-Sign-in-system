/**
 * KYX 签到系统 - 用户等级系统应用层实现
 * 基于修仙境界的13级等级体系
 */

// ============================================
// 等级系统核心类
// ============================================

class UserLevelSystem {
    constructor(database) {
        this.db = database;
        this.levelCache = new Map(); // 等级配置缓存
        this.experienceRules = new Map(); // 经验规则缓存
    }

    // ============================================
    // 初始化和缓存管理
    // ============================================

    async initialize() {
        await this.loadLevelConfigs();
        await this.loadExperienceRules();
        console.log('🎯 用户等级系统初始化完成');
    }

    async loadLevelConfigs() {
        const levels = await this.db.prepare(`
            SELECT * FROM user_levels ORDER BY id
        `).all();
        
        levels.forEach(level => {
            this.levelCache.set(level.id, level);
        });
        
        console.log(`📊 加载了 ${levels.length} 个等级配置`);
    }

    async loadExperienceRules() {
        const rules = await this.db.prepare(`
            SELECT * FROM experience_rules WHERE is_active = TRUE
        `).all();
        
        rules.forEach(rule => {
            this.experienceRules.set(rule.rule_type, rule);
        });
        
        console.log(`⚙️ 加载了 ${rules.length} 个经验规则`);
    }

    // ============================================
    // 经验值计算
    // ============================================

    /**
     * 计算签到获得的经验值
     * @param {number} userId - 用户ID
     * @param {number} consecutiveDays - 连续签到天数
     * @param {number} currentLevel - 当前等级
     * @returns {Promise<number>} 获得的经验值
     */
    async calculateCheckinExperience(userId, consecutiveDays, currentLevel) {
        const baseRule = this.experienceRules.get('daily_checkin');
        const levelConfig = this.levelCache.get(currentLevel);
        
        if (!baseRule || !levelConfig) {
            return 10; // 默认经验值
        }

        let experience = baseRule.base_experience;
        
        // 等级加成
        experience += levelConfig.daily_experience_bonus || 0;
        
        // 连续签到加成
        if (consecutiveDays >= 3) {
            const consecutiveBonus = this.experienceRules.get('consecutive_bonus');
            if (consecutiveBonus) {
                const bonusMultiplier = Math.min(consecutiveDays * 0.1, 2.0); // 最大200%加成
                experience += Math.floor(consecutiveBonus.base_experience * bonusMultiplier);
            }
        }
        
        // 特殊里程碑奖励
        if (consecutiveDays === 7) {
            const perfectRule = this.experienceRules.get('perfect_checkin');
            if (perfectRule) experience += perfectRule.base_experience;
        }
        
        if (consecutiveDays === 30) {
            const monthlyRule = this.experienceRules.get('monthly_bonus');
            if (monthlyRule) experience += monthlyRule.base_experience;
        }

        return Math.floor(experience);
    }

    /**
     * 为用户添加经验值
     * @param {number} userId - 用户ID
     * @param {number} experienceAmount - 经验值
     * @param {string} experienceType - 经验类型
     * @param {string} description - 描述
     * @param {number} sourceId - 来源ID
     * @param {string} sourceType - 来源类型
     */
    async addUserExperience(userId, experienceAmount, experienceType, description, sourceId = null, sourceType = null) {
        const transaction = this.db.transaction(async () => {
            // 更新用户经验值
            await this.db.prepare(`
                UPDATE users 
                SET experience = experience + ?, updated_at = datetime('now')
                WHERE id = ?
            `).run(experienceAmount, userId);

            // 记录经验获得日志
            await this.db.prepare(`
                INSERT INTO user_experience_logs 
                (user_id, experience_type, experience_amount, source_id, source_type, description)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(userId, experienceType, experienceAmount, sourceId, sourceType, description);

            // 检查是否需要升级
            await this.checkAndProcessLevelUp(userId);
        });

        await transaction();
    }

    // ============================================
    // 等级升级处理
    // ============================================

    /**
     * 检查并处理用户升级
     * @param {number} userId - 用户ID
     */
    async checkAndProcessLevelUp(userId) {
        const user = await this.db.prepare(`
            SELECT id, level, experience, total_checkins, consecutive_days 
            FROM users WHERE id = ?
        `).get(userId);

        if (!user) return;

        // 计算应该达到的等级
        const newLevel = await this.calculateUserLevel(user.experience, user.total_checkins, user.consecutive_days);
        
        if (newLevel > user.level) {
            await this.processLevelUp(userId, user.level, newLevel, user.experience);
        }
    }

    /**
     * 计算用户应该达到的等级
     * @param {number} experience - 经验值
     * @param {number} totalCheckins - 总签到天数
     * @param {number} consecutiveDays - 连续签到天数
     * @returns {number} 应该达到的等级
     */
    async calculateUserLevel(experience, totalCheckins, consecutiveDays) {
        const levels = Array.from(this.levelCache.values()).sort((a, b) => b.id - a.id);
        
        for (const level of levels) {
            if (experience >= level.required_experience && 
                totalCheckins >= level.required_checkin_days &&
                (level.required_consecutive_days === 0 || consecutiveDays >= level.required_consecutive_days)) {
                return level.id;
            }
        }
        
        return 1; // 默认炼气境界
    }

    /**
     * 处理用户升级
     * @param {number} userId - 用户ID
     * @param {number} oldLevel - 旧等级
     * @param {number} newLevel - 新等级
     * @param {number} currentExperience - 当前经验值
     */
    async processLevelUp(userId, oldLevel, newLevel, currentExperience) {
        const transaction = this.db.transaction(async () => {
            // 更新用户等级
            await this.db.prepare(`
                UPDATE users 
                SET level = ?, updated_at = datetime('now')
                WHERE id = ?
            `).run(newLevel, userId);

            // 发放升级奖励
            for (let level = oldLevel + 1; level <= newLevel; level++) {
                await this.grantLevelRewards(userId, level);
            }
        });

        await transaction();
        
        console.log(`🎉 用户 ${userId} 从 ${this.getLevelName(oldLevel)} 升级到 ${this.getLevelName(newLevel)}`);
    }

    /**
     * 发放等级奖励
     * @param {number} userId - 用户ID
     * @param {number} levelId - 等级ID
     */
    async grantLevelRewards(userId, levelId) {
        const rewards = await this.db.prepare(`
            SELECT * FROM level_rewards 
            WHERE level_id = ? AND is_active = TRUE
        `).all(levelId);

        for (const reward of rewards) {
            // 检查是否已经领取过
            const existing = await this.db.prepare(`
                SELECT id FROM user_level_rewards 
                WHERE user_id = ? AND reward_id = ?
            `).get(userId, reward.id);

            if (!existing) {
                // 发放奖励
                await this.db.prepare(`
                    INSERT INTO user_level_rewards 
                    (user_id, level_id, reward_id, reward_amount, status)
                    VALUES (?, ?, ?, ?, 'claimed')
                `).run(userId, levelId, reward.id, reward.reward_amount);

                console.log(`💰 用户 ${userId} 获得 ${this.getLevelName(levelId)} 升级奖励: ${reward.reward_description}`);
            }
        }
    }

    // ============================================
    // 查询和工具方法
    // ============================================

    /**
     * 获取用户完整等级信息
     * @param {number} userId - 用户ID
     * @returns {Promise<Object>} 用户等级信息
     */
    async getUserLevelInfo(userId) {
        const userInfo = await this.db.prepare(`
            SELECT * FROM user_level_details WHERE user_id = ?
        `).get(userId);

        if (!userInfo) return null;

        // 获取最近的升级历史
        const levelHistory = await this.db.prepare(`
            SELECT * FROM user_level_history 
            WHERE user_id = ? 
            ORDER BY level_up_time DESC 
            LIMIT 5
        `).all(userId);

        // 获取今日经验获得情况
        const todayExperience = await this.db.prepare(`
            SELECT SUM(experience_amount) as total_exp
            FROM user_experience_logs 
            WHERE user_id = ? AND date(created_at) = date('now')
        `).get(userId);

        return {
            ...userInfo,
            level_history: levelHistory,
            today_experience: todayExperience?.total_exp || 0
        };
    }

    /**
     * 获取等级排行榜
     * @param {number} limit - 限制数量
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 排行榜数据
     */
    async getLeaderboard(limit = 50, offset = 0) {
        return await this.db.prepare(`
            SELECT * FROM level_leaderboard 
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    }

    /**
     * 获取用户在排行榜中的排名
     * @param {number} userId - 用户ID
     * @returns {Promise<number>} 用户排名
     */
    async getUserRank(userId) {
        const result = await this.db.prepare(`
            SELECT rank FROM level_leaderboard WHERE id = ?
        `).get(userId);
        
        return result?.rank || 0;
    }

    /**
     * 获取等级名称
     * @param {number} levelId - 等级ID
     * @returns {string} 等级名称
     */
    getLevelName(levelId) {
        const level = this.levelCache.get(levelId);
        return level ? level.level_name : '未知';
    }

    /**
     * 获取等级配置
     * @param {number} levelId - 等级ID
     * @returns {Object} 等级配置
     */
    getLevelConfig(levelId) {
        return this.levelCache.get(levelId);
    }

    // ============================================
    // 签到系统集成
    // ============================================

    /**
     * 处理用户签到时的等级系统逻辑
     * @param {number} userId - 用户ID
     * @param {number} consecutiveDays - 连续签到天数
     * @param {number} checkinId - 签到记录ID
     */
    async handleUserCheckin(userId, consecutiveDays, checkinId) {
        const user = await this.db.prepare(`
            SELECT level FROM users WHERE id = ?
        `).get(userId);

        if (!user) return;

        // 计算签到经验
        const experience = await this.calculateCheckinExperience(userId, consecutiveDays, user.level);
        
        // 添加经验
        await this.addUserExperience(
            userId, 
            experience, 
            'checkin', 
            `签到获得经验 (连续${consecutiveDays}天)`,
            checkinId,
            'checkin'
        );

        return experience;
    }
}

// ============================================
// 导出模块
// ============================================

module.exports = UserLevelSystem;
