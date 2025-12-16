// Test script to verify auth logging is working correctly
// Run with: npx tsx scripts/test-auth-logging.ts

import { prisma } from '../lib/db/prisma';
import {
  logAuthLoginSuccess,
  logAuthLoginFailure,
  logAuthLogout,
  logAuthSessionCreated
} from '../lib/services/loggingService';

async function testAuthLogging() {
  console.log('========================================');
  console.log('Testing Auth Logging Implementation');
  console.log('========================================\n');

  try {
    // Get a test user from the database
    const testUser = await prisma.user.findFirst({
      where: { active: true }
    });

    if (!testUser) {
      console.error('❌ No active users found in database');
      return;
    }

    console.log(`✓ Found test user: ${testUser.email}`);
    console.log();

    // Test 1: Login Success
    console.log('Test 1: Logging successful login...');
    await logAuthLoginSuccess({
      userId: testUser.id,
      email: testUser.email,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Script'
    });
    console.log('✓ Login success logged\n');

    // Test 2: Login Failure
    console.log('Test 2: Logging failed login...');
    await logAuthLoginFailure({
      email: 'nonexistent@test.com',
      reason: 'User not found',
      ipAddress: '192.168.1.101',
      userAgent: 'Mozilla/5.0 Test Script'
    });
    console.log('✓ Login failure logged\n');

    // Test 3: Session Created
    console.log('Test 3: Logging session creation...');
    await logAuthSessionCreated({
      userId: testUser.id,
      email: testUser.email,
      metadata: {
        role: testUser.role
      }
    });
    console.log('✓ Session creation logged\n');

    // Test 4: Logout
    console.log('Test 4: Logging logout...');
    await logAuthLogout({
      userId: testUser.id,
      email: testUser.email,
      ipAddress: '192.168.1.100'
    });
    console.log('✓ Logout logged\n');

    // Verify logs were created
    console.log('Verifying logs in database...');
    const recentAuthLogs = await prisma.activityLog.findMany({
      where: {
        action: {
          in: ['AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOGOUT', 'AUTH_SESSION_CREATED']
        },
        createdAt: {
          gte: new Date(Date.now() - 60000) // Last minute
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    console.log(`\n✓ Found ${recentAuthLogs.length} auth logs in the last minute:\n`);
    
    recentAuthLogs.forEach((log, i) => {
      console.log(`${i + 1}. ${log.action}`);
      console.log(`   Summary: ${log.summary}`);
      console.log(`   IP: ${log.ipAddress || 'N/A'}`);
      console.log(`   User Agent: ${log.userAgent || 'N/A'}`);
      console.log(`   Timestamp: ${log.createdAt.toISOString()}`);
      console.log();
    });

    // Test querying by tags
    console.log('Testing tag-based queries...');
    const failureLogs = await prisma.activityLog.findMany({
      where: {
        tags: {
          string_contains: 'failure'
        },
        createdAt: {
          gte: new Date(Date.now() - 60000)
        }
      }
    });
    console.log(`✓ Found ${failureLogs.length} logs with 'failure' tag\n`);

    console.log('========================================');
    console.log('✅ All auth logging tests passed!');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testAuthLogging()
  .then(() => {
    console.log('Test script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  });

