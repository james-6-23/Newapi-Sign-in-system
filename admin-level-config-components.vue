<!-- KYX 签到系统 - 管理员等级配置界面组件 -->

<template>
  <div class="admin-level-config">
    <!-- 页面头部 -->
    <div class="page-header">
      <h1>等级系统配置管理</h1>
      <div class="header-actions">
        <el-button type="primary" @click="createSnapshot">创建配置快照</el-button>
        <el-button type="warning" @click="showRollbackDialog">配置回滚</el-button>
        <el-button type="success" @click="exportConfig">导出配置</el-button>
      </div>
    </div>

    <!-- 标签页 -->
    <el-tabs v-model="activeTab" @tab-click="handleTabClick">
      <!-- 等级配置管理 -->
      <el-tab-pane label="等级配置" name="levels">
        <LevelConfigPanel 
          :levels="levelConfigs" 
          :loading="loading"
          @update-level="handleLevelUpdate"
          @batch-update="handleBatchUpdate"
        />
      </el-tab-pane>

      <!-- 经验规则管理 -->
      <el-tab-pane label="经验规则" name="experience">
        <ExperienceRulesPanel 
          :rules="experienceRules"
          :loading="loading"
          @update-rule="handleRuleUpdate"
          @create-rule="handleRuleCreate"
        />
      </el-tab-pane>

      <!-- 奖励配置管理 -->
      <el-tab-pane label="奖励配置" name="rewards">
        <RewardConfigPanel 
          :rewards="rewardConfigs"
          :loading="loading"
          @update-reward="handleRewardUpdate"
          @batch-update-rewards="handleBatchRewardUpdate"
        />
      </el-tab-pane>

      <!-- 审核工作流 -->
      <el-tab-pane label="审核管理" name="approvals">
        <ApprovalWorkflowPanel 
          :approvals="pendingApprovals"
          :loading="loading"
          @approve="handleApprove"
          @reject="handleReject"
          @batch-review="handleBatchReview"
        />
      </el-tab-pane>

      <!-- 统计分析 -->
      <el-tab-pane label="统计分析" name="analytics">
        <AnalyticsPanel 
          :stats="configStats"
          :loading="loading"
        />
      </el-tab-pane>
    </el-tabs>

    <!-- 配置回滚对话框 -->
    <ConfigRollbackDialog 
      v-model="rollbackDialogVisible"
      :versions="configVersions"
      @confirm="handleRollback"
    />

    <!-- 影响分析对话框 -->
    <ImpactAnalysisDialog 
      v-model="impactDialogVisible"
      :analysis="currentImpactAnalysis"
    />
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import LevelConfigPanel from './components/LevelConfigPanel.vue'
import ExperienceRulesPanel from './components/ExperienceRulesPanel.vue'
import RewardConfigPanel from './components/RewardConfigPanel.vue'
import ApprovalWorkflowPanel from './components/ApprovalWorkflowPanel.vue'
import AnalyticsPanel from './components/AnalyticsPanel.vue'
import ConfigRollbackDialog from './components/ConfigRollbackDialog.vue'
import ImpactAnalysisDialog from './components/ImpactAnalysisDialog.vue'
import { adminLevelConfigAPI } from '@/api/admin-level-config'

export default {
  name: 'AdminLevelConfig',
  components: {
    LevelConfigPanel,
    ExperienceRulesPanel,
    RewardConfigPanel,
    ApprovalWorkflowPanel,
    AnalyticsPanel,
    ConfigRollbackDialog,
    ImpactAnalysisDialog
  },
  setup() {
    // 响应式数据
    const activeTab = ref('levels')
    const loading = ref(false)
    const rollbackDialogVisible = ref(false)
    const impactDialogVisible = ref(false)

    // 数据状态
    const state = reactive({
      levelConfigs: [],
      experienceRules: [],
      rewardConfigs: [],
      pendingApprovals: [],
      configStats: {},
      configVersions: [],
      currentImpactAnalysis: null
    })

    // 计算属性
    const hasWritePermission = computed(() => {
      return checkPermission('level_config', 'write')
    })

    const hasAdminPermission = computed(() => {
      return checkPermission('system_settings', 'admin')
    })

    // 生命周期
    onMounted(() => {
      loadInitialData()
    })

    // 方法
    const loadInitialData = async () => {
      loading.value = true
      try {
        await Promise.all([
          loadLevelConfigs(),
          loadExperienceRules(),
          loadRewardConfigs(),
          loadPendingApprovals(),
          loadConfigStats()
        ])
      } catch (error) {
        ElMessage.error('加载数据失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    const loadLevelConfigs = async () => {
      const response = await adminLevelConfigAPI.getLevelConfigs()
      state.levelConfigs = response.data
    }

    const loadExperienceRules = async () => {
      const response = await adminLevelConfigAPI.getExperienceRules()
      state.experienceRules = response.data
    }

    const loadRewardConfigs = async () => {
      const response = await adminLevelConfigAPI.getRewardConfigs()
      state.rewardConfigs = response.data
    }

    const loadPendingApprovals = async () => {
      const response = await adminLevelConfigAPI.getPendingApprovals()
      state.pendingApprovals = response.data
    }

    const loadConfigStats = async () => {
      const response = await adminLevelConfigAPI.getConfigStats()
      state.configStats = response.data
    }

    // 等级配置处理
    const handleLevelUpdate = async (levelId, updateData, reason) => {
      try {
        loading.value = true
        const response = await adminLevelConfigAPI.updateLevelConfig(levelId, updateData, reason)
        
        if (response.data.requires_approval) {
          ElMessage.success('等级配置变更已提交审核')
          await loadPendingApprovals()
        } else {
          ElMessage.success('等级配置已更新')
          await loadLevelConfigs()
        }

        // 显示影响分析
        if (response.data.estimated_impact) {
          state.currentImpactAnalysis = response.data.estimated_impact
          impactDialogVisible.value = true
        }
      } catch (error) {
        ElMessage.error('更新失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    const handleBatchUpdate = async (updates, reason) => {
      try {
        loading.value = true
        const response = await adminLevelConfigAPI.batchUpdateLevels(updates, reason)
        
        ElMessage.success(`批量更新已提交，共 ${response.data.total_updates} 项变更`)
        await loadPendingApprovals()
      } catch (error) {
        ElMessage.error('批量更新失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    // 经验规则处理
    const handleRuleUpdate = async (ruleId, ruleData, reason) => {
      try {
        loading.value = true
        const response = await adminLevelConfigAPI.updateExperienceRule(ruleId, ruleData, reason)
        
        if (response.data.requires_approval) {
          ElMessage.success('经验规则变更已提交审核')
          await loadPendingApprovals()
        } else {
          ElMessage.success('经验规则已更新')
          await loadExperienceRules()
        }

        // 显示影响分析
        if (response.data.impact_analysis) {
          state.currentImpactAnalysis = response.data.impact_analysis
          impactDialogVisible.value = true
        }
      } catch (error) {
        ElMessage.error('更新失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    const handleRuleCreate = async (ruleData, reason) => {
      try {
        loading.value = true
        const response = await adminLevelConfigAPI.createExperienceRule(ruleData, reason)
        
        ElMessage.success('新经验规则已创建')
        await loadExperienceRules()
        if (response.data.requires_approval) {
          await loadPendingApprovals()
        }
      } catch (error) {
        ElMessage.error('创建失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    // 奖励配置处理
    const handleRewardUpdate = async (rewardId, rewardData, reason) => {
      try {
        loading.value = true
        await adminLevelConfigAPI.updateRewardConfig(rewardId, rewardData, reason)
        
        ElMessage.success('奖励配置已更新')
        await loadRewardConfigs()
      } catch (error) {
        ElMessage.error('更新失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    const handleBatchRewardUpdate = async (updates, reason) => {
      try {
        loading.value = true
        await adminLevelConfigAPI.batchUpdateRewards(updates, reason)
        
        ElMessage.success('批量奖励配置已更新')
        await loadRewardConfigs()
      } catch (error) {
        ElMessage.error('批量更新失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    // 审核处理
    const handleApprove = async (approvalId, comments) => {
      try {
        loading.value = true
        await adminLevelConfigAPI.approveChange(approvalId, 'approved', comments)
        
        ElMessage.success('配置变更已批准')
        await loadPendingApprovals()
        await loadInitialData() // 重新加载所有数据
      } catch (error) {
        ElMessage.error('审核失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    const handleReject = async (approvalId, comments) => {
      try {
        loading.value = true
        await adminLevelConfigAPI.approveChange(approvalId, 'rejected', comments)
        
        ElMessage.success('配置变更已拒绝')
        await loadPendingApprovals()
      } catch (error) {
        ElMessage.error('审核失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    const handleBatchReview = async (reviews) => {
      try {
        loading.value = true
        await adminLevelConfigAPI.batchReview(reviews)
        
        ElMessage.success(`批量审核完成，共处理 ${reviews.length} 项`)
        await loadPendingApprovals()
        await loadInitialData()
      } catch (error) {
        ElMessage.error('批量审核失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    // 配置管理
    const createSnapshot = async () => {
      try {
        const { value: snapshotName } = await ElMessageBox.prompt(
          '请输入快照名称',
          '创建配置快照',
          {
            confirmButtonText: '创建',
            cancelButtonText: '取消',
            inputPattern: /^.{1,50}$/,
            inputErrorMessage: '快照名称长度应在1-50字符之间'
          }
        )

        loading.value = true
        await adminLevelConfigAPI.createSnapshot({
          snapshot_name: snapshotName,
          description: `手动创建的配置快照 - ${new Date().toLocaleString()}`,
          include_categories: ['level_config', 'experience_rules', 'reward_config']
        })

        ElMessage.success('配置快照创建成功')
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('创建快照失败：' + error.message)
        }
      } finally {
        loading.value = false
      }
    }

    const showRollbackDialog = async () => {
      try {
        loading.value = true
        const response = await adminLevelConfigAPI.getConfigVersions()
        state.configVersions = response.data
        rollbackDialogVisible.value = true
      } catch (error) {
        ElMessage.error('加载版本列表失败：' + error.message)
      } finally {
        loading.value = false
      }
    }

    const handleRollback = async (versionId, reason) => {
      try {
        await ElMessageBox.confirm(
          '确定要回滚到选定的配置版本吗？此操作将覆盖当前配置。',
          '确认回滚',
          {
            confirmButtonText: '确定回滚',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        loading.value = true
        await adminLevelConfigAPI.rollbackConfig({
          version_id: versionId,
          rollback_reason: reason,
          confirm_rollback: true
        })

        ElMessage.success('配置回滚成功')
        rollbackDialogVisible.value = false
        await loadInitialData()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('回滚失败：' + error.message)
        }
      } finally {
        loading.value = false
      }
    }

    const exportConfig = async () => {
      try {
        const response = await adminLevelConfigAPI.exportConfig()
        
        // 创建下载链接
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json'
        })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `level-config-export-${new Date().toISOString().split('T')[0]}.json`
        link.click()
        window.URL.revokeObjectURL(url)

        ElMessage.success('配置导出成功')
      } catch (error) {
        ElMessage.error('导出失败：' + error.message)
      }
    }

    const handleTabClick = (tab) => {
      // 切换标签页时可以执行特定的数据加载逻辑
      switch (tab.name) {
        case 'approvals':
          loadPendingApprovals()
          break
        case 'analytics':
          loadConfigStats()
          break
      }
    }

    const checkPermission = (type, level) => {
      // 这里应该从用户权限信息中检查
      // 暂时返回true，实际应用中需要实现权限检查逻辑
      return true
    }

    return {
      // 响应式数据
      activeTab,
      loading,
      rollbackDialogVisible,
      impactDialogVisible,
      ...state,

      // 计算属性
      hasWritePermission,
      hasAdminPermission,

      // 方法
      handleTabClick,
      handleLevelUpdate,
      handleBatchUpdate,
      handleRuleUpdate,
      handleRuleCreate,
      handleRewardUpdate,
      handleBatchRewardUpdate,
      handleApprove,
      handleReject,
      handleBatchReview,
      createSnapshot,
      showRollbackDialog,
      handleRollback,
      exportConfig
    }
  }
}
</script>

<style scoped>
.admin-level-config {
  padding: 20px;
  background: #f5f5f5;
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.page-header h1 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.header-actions {
  display: flex;
  gap: 10px;
}

:deep(.el-tabs) {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

:deep(.el-tabs__header) {
  margin: 0;
  padding: 0 20px;
  background: #fafafa;
  border-radius: 8px 8px 0 0;
}

:deep(.el-tabs__content) {
  padding: 20px;
}

:deep(.el-tab-pane) {
  min-height: 600px;
}
</style>
