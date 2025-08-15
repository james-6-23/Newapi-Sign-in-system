/**
 * KYX 签到系统 - 管理员等级配置管理器
 * 提供等级系统的管理员配置功能
 */

// ============================================
// 管理员等级配置管理器类
// ============================================

class AdminLevelConfigManager {
    constructor(database, levelSystem) {
        this.db = database;
        this.levelSystem = levelSystem;
        this.configCache = new Map();
        this.permissionCache = new Map();
    }

    // ============================================
    // 权限验证
    // ============================================

    /**
     * 验证管理员权限
     * @param {number} adminId - 管理员ID
     * @param {string} permissionType - 权限类型
     * @param {string} requiredLevel - 所需权限级别
     * @returns {Promise<boolean>} 是否有权限
     */
    async checkAdminPermission(adminId, permissionType, requiredLevel = 'read') {
        const cacheKey = `${adminId}_${permissionType}`;
        
        if (this.permissionCache.has(cacheKey)) {
            const cached = this.permissionCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 300000) { // 5分钟缓存
                return this.hasPermissionLevel(cached.permission, requiredLevel);
            }
        }

        const permission = await this.db.prepare(`
            SELECT permission_level, expires_at, is_active
            FROM admin_permissions 
            WHERE admin_id = ? AND permission_type = ? AND is_active = TRUE
        `).get(adminId, permissionType);

        if (!permission) return false;

        // 检查权限是否过期
        if (permission.expires_at && new Date(permission.expires_at) < new Date()) {
            return false;
        }

        // 缓存权限信息
        this.permissionCache.set(cacheKey, {
            permission: permission.permission_level,
            timestamp: Date.now()
        });

        return this.hasPermissionLevel(permission.permission_level, requiredLevel);
    }

    /**
     * 检查权限级别是否满足要求
     * @param {string} userLevel - 用户权限级别
     * @param {string} requiredLevel - 所需权限级别
     * @returns {boolean} 是否满足
     */
    hasPermissionLevel(userLevel, requiredLevel) {
        const levels = { 'read': 1, 'write': 2, 'admin': 3 };
        return levels[userLevel] >= levels[requiredLevel];
    }

    // ============================================
    // 等级配置管理
    // ============================================

    /**
     * 获取等级配置列表
     * @param {number} adminId - 管理员ID
     * @returns {Promise<Array>} 等级配置列表
     */
    async getLevelConfigs(adminId) {
        if (!await this.checkAdminPermission(adminId, 'level_config', 'read')) {
            throw new Error('权限不足：无法查看等级配置');
        }

        return await this.db.prepare(`
            SELECT 
                ul.*,
                COUNT(u.id) as current_user_count,
                AVG(u.experience) as avg_user_experience
            FROM user_levels ul
            LEFT JOIN users u ON ul.id = u.level AND u.is_active = TRUE
            GROUP BY ul.id
            ORDER BY ul.id
        `).all();
    }

    /**
     * 更新等级配置
     * @param {number} adminId - 管理员ID
     * @param {number} levelId - 等级ID
     * @param {Object} configData - 配置数据
     * @param {string} reason - 修改原因
     * @returns {Promise<Object>} 操作结果
     */
    async updateLevelConfig(adminId, levelId, configData, reason) {
        if (!await this.checkAdminPermission(adminId, 'level_config', 'write')) {
            throw new Error('权限不足：无法修改等级配置');
        }

        const transaction = this.db.transaction(async () => {
            // 获取当前配置
            const currentConfig = await this.db.prepare(`
                SELECT * FROM user_levels WHERE id = ?
            `).get(levelId);

            if (!currentConfig) {
                throw new Error('等级配置不存在');
            }

            // 分析影响
            const impact = await this.analyzeLevelConfigImpact(levelId, configData);

            // 检查是否需要审核
            const requiresApproval = await this.requiresApproval('level_config');

            if (requiresApproval) {
                // 创建审核记录
                const approvalId = await this.createApprovalRequest(
                    adminId, 'level_config', levelId, currentConfig, configData, reason, impact
                );
                
                return {
                    success: true,
                    message: '配置变更已提交审核',
                    approval_id: approvalId,
                    requires_approval: true
                };
            } else {
                // 直接应用配置
                await this.applyLevelConfigChange(adminId, levelId, currentConfig, configData, reason);
                
                return {
                    success: true,
                    message: '等级配置已更新',
                    requires_approval: false
                };
            }
        });

        return await transaction();
    }

    /**
     * 分析等级配置变更影响
     * @param {number} levelId - 等级ID
     * @param {Object} newConfig - 新配置
     * @returns {Promise<Object>} 影响分析结果
     */
    async analyzeLevelConfigImpact(levelId, newConfig) {
        // 获取当前配置
        const currentConfig = await this.db.prepare(`
            SELECT * FROM user_levels WHERE id = ?
        `).get(levelId);

        // 分析受影响的用户
        const affectedUsers = await this.db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE level = ? AND is_active = TRUE
        `).get(levelId);

        // 分析可能的等级变化
        const potentialLevelChanges = await this.db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE level < ? AND experience >= ? AND total_checkins >= ? 
            AND consecutive_days >= ? AND is_active = TRUE
        `).get(
            levelId,
            newConfig.required_experience || currentConfig.required_experience,
            newConfig.required_checkin_days || currentConfig.required_checkin_days,
            newConfig.required_consecutive_days || currentConfig.required_consecutive_days
        );

        return {
            affected_users: affectedUsers.count,
            potential_level_changes: potentialLevelChanges.count,
            config_changes: this.getConfigDifferences(currentConfig, newConfig),
            estimated_impact: this.calculateImpactLevel(affectedUsers.count, potentialLevelChanges.count)
        };
    }

    /**
     * 应用等级配置变更
     * @param {number} adminId - 管理员ID
     * @param {number} levelId - 等级ID
     * @param {Object} oldConfig - 旧配置
     * @param {Object} newConfig - 新配置
     * @param {string} reason - 变更原因
     */
    async applyLevelConfigChange(adminId, levelId, oldConfig, newConfig, reason) {
        // 更新等级配置
        const updateFields = [];
        const updateValues = [];
        
        Object.keys(newConfig).forEach(key => {
            if (key !== 'id' && newConfig[key] !== undefined) {
                updateFields.push(`${key} = ?`);
                updateValues.push(newConfig[key]);
            }
        });
        
        updateValues.push(levelId);
        
        await this.db.prepare(`
            UPDATE user_levels 
            SET ${updateFields.join(', ')}, updated_at = datetime('now')
            WHERE id = ?
        `).run(...updateValues);

        // 记录变更历史
        for (const [field, newValue] of Object.entries(newConfig)) {
            if (field !== 'id' && oldConfig[field] !== newValue) {
                await this.db.prepare(`
                    INSERT INTO level_config_history 
                    (level_id, field_name, old_value, new_value, change_reason, changed_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(levelId, field, oldConfig[field], newValue, reason, adminId);
            }
        }

        // 记录操作日志
        await this.logAdminOperation(
            adminId, 'level_config_update', 'user_levels', levelId,
            oldConfig, newConfig, reason, 'applied'
        );

        // 重新计算受影响用户的等级
        await this.recalculateAffectedUserLevels(levelId);
    }

    // ============================================
    // 经验规则管理
    // ============================================

    /**
     * 获取经验规则配置
     * @param {number} adminId - 管理员ID
     * @returns {Promise<Array>} 经验规则列表
     */
    async getExperienceRules(adminId) {
        if (!await this.checkAdminPermission(adminId, 'experience_rules', 'read')) {
            throw new Error('权限不足：无法查看经验规则');
        }

        return await this.db.prepare(`
            SELECT 
                er.*,
                COUNT(uel.id) as usage_count,
                SUM(uel.experience_amount) as total_experience_granted
            FROM experience_rules er
            LEFT JOIN user_experience_logs uel ON er.rule_type = uel.experience_type
            WHERE er.is_active = TRUE
            GROUP BY er.id
            ORDER BY er.id
        `).all();
    }

    /**
     * 更新经验规则
     * @param {number} adminId - 管理员ID
     * @param {number} ruleId - 规则ID
     * @param {Object} ruleData - 规则数据
     * @param {string} reason - 修改原因
     * @returns {Promise<Object>} 操作结果
     */
    async updateExperienceRule(adminId, ruleId, ruleData, reason) {
        if (!await this.checkAdminPermission(adminId, 'experience_rules', 'write')) {
            throw new Error('权限不足：无法修改经验规则');
        }

        const transaction = this.db.transaction(async () => {
            // 获取当前规则
            const currentRule = await this.db.prepare(`
                SELECT * FROM experience_rules WHERE id = ?
            `).get(ruleId);

            if (!currentRule) {
                throw new Error('经验规则不存在');
            }

            // 分析影响
            const impact = await this.analyzeExperienceRuleImpact(ruleId, ruleData);

            // 检查是否需要审核
            const requiresApproval = await this.requiresApproval('experience_rules');

            if (requiresApproval) {
                // 创建审核记录
                const approvalId = await this.createApprovalRequest(
                    adminId, 'experience_rule', ruleId, currentRule, ruleData, reason, impact
                );
                
                return {
                    success: true,
                    message: '经验规则变更已提交审核',
                    approval_id: approvalId,
                    requires_approval: true
                };
            } else {
                // 直接应用规则
                await this.applyExperienceRuleChange(adminId, ruleId, currentRule, ruleData, reason);
                
                return {
                    success: true,
                    message: '经验规则已更新',
                    requires_approval: false
                };
            }
        });

        return await transaction();
    }

    /**
     * 分析经验规则变更影响
     * @param {number} ruleId - 规则ID
     * @param {Object} newRule - 新规则
     * @returns {Promise<Object>} 影响分析结果
     */
    async analyzeExperienceRuleImpact(ruleId, newRule) {
        const currentRule = await this.db.prepare(`
            SELECT * FROM experience_rules WHERE id = ?
        `).get(ruleId);

        // 分析过去30天的使用情况
        const usageStats = await this.db.prepare(`
            SELECT 
                COUNT(*) as usage_count,
                SUM(experience_amount) as total_experience,
                COUNT(DISTINCT user_id) as affected_users
            FROM user_experience_logs 
            WHERE experience_type = ? AND created_at >= date('now', '-30 days')
        `).get(currentRule.rule_type);

        // 计算经验变化影响
        const experienceChange = (newRule.base_experience || currentRule.base_experience) - currentRule.base_experience;
        const estimatedDailyImpact = usageStats.usage_count * experienceChange / 30;

        return {
            affected_users: usageStats.affected_users,
            daily_usage: Math.round(usageStats.usage_count / 30),
            experience_change_per_use: experienceChange,
            estimated_daily_impact: estimatedDailyImpact,
            rule_changes: this.getConfigDifferences(currentRule, newRule)
        };
    }

    // ============================================
    // 奖励配置管理
    // ============================================

    /**
     * 获取奖励配置
     * @param {number} adminId - 管理员ID
     * @returns {Promise<Array>} 奖励配置列表
     */
    async getRewardConfigs(adminId) {
        if (!await this.checkAdminPermission(adminId, 'rewards_config', 'read')) {
            throw new Error('权限不足：无法查看奖励配置');
        }

        return await this.db.prepare(`
            SELECT 
                lr.*,
                ul.level_name,
                COUNT(ulr.id) as claimed_count,
                SUM(ulr.reward_amount) as total_claimed_amount
            FROM level_rewards lr
            LEFT JOIN user_levels ul ON lr.level_id = ul.id
            LEFT JOIN user_level_rewards ulr ON lr.id = ulr.reward_id
            WHERE lr.is_active = TRUE
            GROUP BY lr.id
            ORDER BY lr.level_id, lr.id
        `).all();
    }

    /**
     * 批量更新奖励配置
     * @param {number} adminId - 管理员ID
     * @param {Array} rewardUpdates - 奖励更新数据
     * @param {string} reason - 修改原因
     * @returns {Promise<Object>} 操作结果
     */
    async batchUpdateRewards(adminId, rewardUpdates, reason) {
        if (!await this.checkAdminPermission(adminId, 'rewards_config', 'write')) {
            throw new Error('权限不足：无法修改奖励配置');
        }

        const transaction = this.db.transaction(async () => {
            const results = [];
            
            for (const update of rewardUpdates) {
                const result = await this.updateSingleReward(adminId, update, reason);
                results.push(result);
            }
            
            return {
                success: true,
                message: `成功处理 ${results.length} 个奖励配置更新`,
                results: results
            };
        });

        return await transaction();
    }

    // ============================================
    // 审核工作流
    // ============================================

    /**
     * 创建审核请求
     * @param {number} adminId - 提交者ID
     * @param {string} changeType - 变更类型
     * @param {number} targetId - 目标ID
     * @param {Object} oldData - 旧数据
     * @param {Object} newData - 新数据
     * @param {string} reason - 变更原因
     * @param {Object} impact - 影响分析
     * @returns {Promise<number>} 审核ID
     */
    async createApprovalRequest(adminId, changeType, targetId, oldData, newData, reason, impact) {
        const approvalId = await this.db.prepare(`
            INSERT INTO config_change_approvals 
            (change_type, change_id, submitted_by, approval_status, estimated_impact, rollback_plan)
            VALUES (?, ?, ?, 'pending', ?, ?)
        `).run(
            changeType, 
            targetId, 
            adminId, 
            JSON.stringify(impact),
            this.generateRollbackPlan(changeType, oldData)
        ).lastInsertRowid;

        // 记录详细的操作日志
        await this.logAdminOperation(
            adminId, `${changeType}_change_request`, changeType, targetId,
            oldData, newData, reason, 'pending'
        );

        // 发送通知给审核者
        await this.notifyApprovers(changeType, approvalId);

        return approvalId;
    }

    /**
     * 审核配置变更
     * @param {number} approverId - 审核者ID
     * @param {number} approvalId - 审核ID
     * @param {string} decision - 审核决定 (approved/rejected)
     * @param {string} comments - 审核意见
     * @returns {Promise<Object>} 审核结果
     */
    async approveConfigChange(approverId, approvalId, decision, comments) {
        if (!await this.checkAdminPermission(approverId, 'system_settings', 'admin')) {
            throw new Error('权限不足：无法审核配置变更');
        }

        const transaction = this.db.transaction(async () => {
            // 更新审核状态
            await this.db.prepare(`
                UPDATE config_change_approvals 
                SET approval_status = ?, approver_id = ?, approval_comments = ?, approved_at = datetime('now')
                WHERE id = ?
            `).run(decision, approverId, comments, approvalId);

            // 如果审核通过，应用变更
            if (decision === 'approved') {
                await this.applyApprovedChange(approvalId);
            }

            // 发送通知
            await this.notifyApprovalResult(approvalId, decision);

            return {
                success: true,
                message: `配置变更已${decision === 'approved' ? '批准' : '拒绝'}`,
                approval_id: approvalId
            };
        });

        return await transaction();
    }

    // ============================================
    // 工具方法
    // ============================================

    /**
     * 检查是否需要审核
     * @param {string} configType - 配置类型
     * @returns {Promise<boolean>} 是否需要审核
     */
    async requiresApproval(configType) {
        const configKey = `require_approval_for_${configType.replace('_config', '')}_changes`;
        const config = await this.db.prepare(`
            SELECT config_value FROM system_config_parameters 
            WHERE config_key = ?
        `).get(configKey);
        
        return config ? config.config_value === 'true' : true;
    }

    /**
     * 记录管理员操作
     * @param {number} adminId - 管理员ID
     * @param {string} operationType - 操作类型
     * @param {string} targetTable - 目标表
     * @param {number} targetId - 目标ID
     * @param {Object} oldValues - 旧值
     * @param {Object} newValues - 新值
     * @param {string} reason - 操作原因
     * @param {string} status - 状态
     */
    async logAdminOperation(adminId, operationType, targetTable, targetId, oldValues, newValues, reason, status) {
        await this.db.prepare(`
            INSERT INTO admin_operation_logs 
            (admin_id, operation_type, operation_target, target_id, old_values, new_values, operation_reason, operation_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            adminId, operationType, targetTable, targetId,
            JSON.stringify(oldValues), JSON.stringify(newValues), reason, status
        );
    }

    /**
     * 获取配置差异
     * @param {Object} oldConfig - 旧配置
     * @param {Object} newConfig - 新配置
     * @returns {Object} 配置差异
     */
    getConfigDifferences(oldConfig, newConfig) {
        const differences = {};
        
        Object.keys(newConfig).forEach(key => {
            if (oldConfig[key] !== newConfig[key]) {
                differences[key] = {
                    old: oldConfig[key],
                    new: newConfig[key]
                };
            }
        });
        
        return differences;
    }

    /**
     * 计算影响级别
     * @param {number} affectedUsers - 受影响用户数
     * @param {number} potentialChanges - 潜在变化数
     * @returns {string} 影响级别
     */
    calculateImpactLevel(affectedUsers, potentialChanges) {
        const totalImpact = affectedUsers + potentialChanges;
        
        if (totalImpact === 0) return 'none';
        if (totalImpact < 10) return 'low';
        if (totalImpact < 100) return 'medium';
        if (totalImpact < 1000) return 'high';
        return 'critical';
    }
}

// ============================================
// 导出模块
// ============================================

module.exports = AdminLevelConfigManager;
