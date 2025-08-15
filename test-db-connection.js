/**
 * 简单的数据库连接测试脚本
 * 用于验证管理员功能的数据库查询
 */

// 模拟环境变量和数据库连接
const mockEnv = {
  DB: {
    prepare: (query) => ({
      bind: (...params) => ({
        first: async () => {
          console.log('🔍 Query:', query);
          console.log('📊 Params:', params);
          
          // 模拟数据库响应
          if (query.includes('COUNT(*) as total')) {
            if (query.includes('redemption_codes')) {
              return { total: 20 };
            } else if (query.includes('users')) {
              return { total: 5 };
            } else if (query.includes('check_ins')) {
              return { total: 30 };
            }
          }
          
          if (query.includes('SELECT * FROM admins')) {
            return {
              id: 1,
              username: 'admin',
              password_hash: 'hash123',
              salt: 'salt123',
              is_active: true
            };
          }
          
          return null;
        },
        all: async () => {
          console.log('🔍 Query:', query);
          console.log('📊 Params:', params);
          
          const results = [];
          
          if (query.includes('redemption_codes')) {
            results.push(
              {
                id: 1,
                code: 'TEST001ABCD',
                amount: 10.00,
                is_used: false,
                is_distributed: false,
                created_at: '2024-01-01T00:00:00Z',
                distributed_to_username: null
              },
              {
                id: 2,
                code: 'TEST002EFGH',
                amount: 15.00,
                is_used: false,
                is_distributed: true,
                created_at: '2024-01-02T00:00:00Z',
                distributed_to_username: 'testuser1'
              }
            );
          }
          
          if (query.includes('users')) {
            results.push(
              {
                id: 1,
                username: 'testuser1',
                linux_do_id: 10001,
                email: 'user1@test.com',
                total_checkins: 15,
                consecutive_days: 5,
                created_at: '2024-01-01T00:00:00Z',
                is_active: true,
                checkin_count: 15,
                code_count: 2
              },
              {
                id: 2,
                username: 'testuser2',
                linux_do_id: 10002,
                email: 'user2@test.com',
                total_checkins: 8,
                consecutive_days: 3,
                created_at: '2024-01-02T00:00:00Z',
                is_active: true,
                checkin_count: 8,
                code_count: 1
              }
            );
          }
          
          if (query.includes('check_ins')) {
            results.push(
              {
                id: 1,
                user_id: 1,
                check_in_date: '2024-01-15',
                check_in_time: '2024-01-15T10:00:00Z',
                redemption_code: 'TEST001ABCD',
                status: 'completed',
                username: 'testuser1'
              },
              {
                id: 2,
                user_id: 2,
                check_in_date: '2024-01-14',
                check_in_time: '2024-01-14T11:00:00Z',
                redemption_code: null,
                status: 'pending',
                username: 'testuser2'
              }
            );
          }
          
          return { results };
        },
        run: async () => {
          console.log('🔍 Run Query:', query);
          console.log('📊 Params:', params);
          return { success: true };
        }
      })
    })
  }
};

// 测试函数
async function testDatabaseQueries() {
  console.log('🚀 开始测试数据库查询...\n');
  
  try {
    // 测试统计查询
    console.log('📊 测试统计查询:');
    const statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_distributed = 0 THEN 1 ELSE 0 END) as undistributed,
        SUM(CASE WHEN is_distributed = 1 THEN 1 ELSE 0 END) as distributed
      FROM redemption_codes
    `;
    const statsResult = await mockEnv.DB.prepare(statsQuery).bind().first();
    console.log('✅ 统计结果:', statsResult);
    console.log('');
    
    // 测试兑换码查询
    console.log('🎫 测试兑换码查询:');
    const codesQuery = `
      SELECT 
        r.id,
        r.code,
        r.amount,
        r.is_used,
        r.is_distributed,
        r.created_at,
        u.username as distributed_to_username
      FROM redemption_codes r
      LEFT JOIN users u ON r.distributed_to = u.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const codesResult = await mockEnv.DB.prepare(codesQuery).bind(10, 0).all();
    console.log('✅ 兑换码结果:', codesResult);
    console.log('');
    
    // 测试用户查询
    console.log('👥 测试用户查询:');
    const usersQuery = `
      SELECT 
        u.id,
        u.username,
        u.linux_do_id,
        u.email,
        u.total_checkins,
        u.consecutive_days,
        u.created_at,
        u.is_active,
        COUNT(DISTINCT c.id) as checkin_count,
        COUNT(DISTINCT r.id) as code_count
      FROM users u
      LEFT JOIN check_ins c ON u.id = c.user_id
      LEFT JOIN redemption_codes r ON u.id = r.distributed_to
      WHERE u.is_active = 1
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const usersResult = await mockEnv.DB.prepare(usersQuery).bind(10, 0).all();
    console.log('✅ 用户结果:', usersResult);
    console.log('');
    
    // 测试签到查询
    console.log('📅 测试签到查询:');
    const checkinsQuery = `
      SELECT 
        c.id,
        c.user_id,
        c.check_in_date,
        c.check_in_time,
        c.redemption_code,
        c.status,
        u.username
      FROM check_ins c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.check_in_time DESC
      LIMIT ? OFFSET ?
    `;
    const checkinsResult = await mockEnv.DB.prepare(checkinsQuery).bind(10, 0).all();
    console.log('✅ 签到结果:', checkinsResult);
    console.log('');
    
    console.log('🎉 所有测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
testDatabaseQueries();
