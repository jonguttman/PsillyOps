/**
 * Phase 1 AI API Test Script
 * 
 * Run with: npx ts-node scripts/test-ai-phase1.ts
 * 
 * Prerequisites:
 * - Server running on localhost:3000
 * - Valid session cookie (copy from browser dev tools)
 * 
 * This script tests:
 * 1. GET /api/ai/context - Get system context and session
 * 2. GET /api/lookup/resolve - Resolve entity references
 * 3. POST /api/ai/propose - Create proposals
 * 4. POST /api/ai/execute - Execute proposals (Phase 1 only)
 * 5. GET /api/ai/command-log - View command history
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Copy this from your browser's dev tools (Application > Cookies > next-auth.session-token)
const SESSION_COOKIE = process.env.SESSION_COOKIE || '';

if (!SESSION_COOKIE) {
  console.error('❌ SESSION_COOKIE environment variable is required');
  console.log('   Set it with: export SESSION_COOKIE="your-session-token"');
  console.log('   Get it from browser dev tools: Application > Cookies > next-auth.session-token');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Cookie': `next-auth.session-token=${SESSION_COOKIE}`,
};

async function fetchApi(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

async function testContext() {
  console.log('\n📋 Testing GET /api/ai/context...');
  
  const { status, data } = await fetchApi('/api/ai/context');
  
  if (status === 200) {
    console.log('✅ Context retrieved successfully');
    console.log(`   Session: ${data.session?.token?.slice(0, 20)}...`);
    console.log(`   Stale after: ${data.staleAfter}`);
    console.log(`   Pending orders: ${data.summary?.pendingOrders}`);
    console.log(`   Low stock materials: ${data.summary?.lowStockMaterials}`);
    console.log(`   Active production runs: ${data.summary?.activeProductionRuns}`);
    console.log(`   Attention items: ${data.summary?.attentionItems?.length || 0}`);
    return data.session?.token;
  } else {
    console.log(`❌ Failed with status ${status}:`, data);
    return null;
  }
}

async function testResolve(sessionToken: string) {
  console.log('\n🔍 Testing GET /api/lookup/resolve...');
  
  // Test with a common reference
  const testRefs = ['PE', 'Caps', 'RAW'];
  
  for (const ref of testRefs) {
    const { status, data } = await fetchApi(`/api/lookup/resolve?ref=${encodeURIComponent(ref)}`, {
      headers: { 'X-AI-Session-ID': sessionToken },
    });
    
    if (status === 200) {
      if (data.resolved) {
        console.log(`✅ "${ref}" resolved to: ${data.entity?.name} (${data.entityType})`);
      } else {
        console.log(`⚠️  "${ref}" ambiguous, ${data.alternatives?.length || 0} alternatives`);
      }
    } else {
      console.log(`❌ "${ref}" failed with status ${status}:`, data);
    }
  }
}

async function testPropose(sessionToken: string) {
  console.log('\n📝 Testing POST /api/ai/propose...');
  
  // Test Phase 1 action (INVENTORY_ADJUSTMENT) - will need a real inventory ID
  const phase1Proposal = {
    action: 'INVENTORY_ADJUSTMENT',
    params: {
      inventoryId: 'test-inventory-id', // Replace with real ID
      delta: -5,
      reason: 'Test adjustment',
    },
  };
  
  const { status: p1Status, data: p1Data } = await fetchApi('/api/ai/propose', {
    method: 'POST',
    headers: { 'X-AI-Session-ID': sessionToken },
    body: JSON.stringify(phase1Proposal),
  });
  
  if (p1Status === 200) {
    console.log('✅ Phase 1 proposal created');
    console.log(`   Proposal ID: ${p1Data.proposalId}`);
    console.log(`   Execution mode: ${p1Data.executionMode}`);
    console.log(`   Phase 1 allowed: ${p1Data.phase1Allowed}`);
    console.log(`   Expires: ${p1Data.expiresAt}`);
  } else {
    console.log(`⚠️  Phase 1 proposal failed (expected if no inventory): ${p1Data.message || p1Data.error?.message}`);
  }
  
  // Test Phase 2 action (PRODUCTION_ORDER) - should be PREVIEW_ONLY
  const phase2Proposal = {
    action: 'PRODUCTION_ORDER',
    params: {
      productId: 'test-product-id', // Replace with real ID
      quantity: 100,
    },
  };
  
  const { status: p2Status, data: p2Data } = await fetchApi('/api/ai/propose', {
    method: 'POST',
    headers: { 'X-AI-Session-ID': sessionToken },
    body: JSON.stringify(phase2Proposal),
  });
  
  if (p2Status === 200) {
    console.log('✅ Phase 2 proposal created (preview only)');
    console.log(`   Proposal ID: ${p2Data.proposalId}`);
    console.log(`   Execution mode: ${p2Data.executionMode}`);
    console.log(`   Phase 1 allowed: ${p2Data.phase1Allowed}`);
    if (p2Data.executionMode === 'PREVIEW_ONLY') {
      console.log('   ✓ Correctly marked as PREVIEW_ONLY');
    }
  } else {
    console.log(`⚠️  Phase 2 proposal failed (expected if no product): ${p2Data.message || p2Data.error?.message}`);
  }
  
  return p2Data.proposalId; // Return for execute test
}

async function testExecuteBlocked(sessionToken: string, proposalId: string) {
  console.log('\n🚫 Testing POST /api/ai/execute (Phase 2 blocked)...');
  
  if (!proposalId) {
    console.log('⚠️  No proposal ID to test execute');
    return;
  }
  
  const { status, data } = await fetchApi('/api/ai/execute', {
    method: 'POST',
    headers: { 'X-AI-Session-ID': sessionToken },
    body: JSON.stringify({ proposalId }),
  });
  
  if (status === 403 && data.error?.code === 'PHASE_2_REQUIRED') {
    console.log('✅ Phase 2 action correctly blocked');
    console.log(`   Code: ${data.error.code}`);
    console.log(`   Speakable: ${data.error.speakable}`);
  } else if (status === 404) {
    console.log('⚠️  Proposal not found (may have expired or been deleted)');
  } else {
    console.log(`❌ Unexpected response: status=${status}`, data);
  }
}

async function testCommandLog(sessionToken: string) {
  console.log('\n📜 Testing GET /api/ai/command-log...');
  
  const { status, data } = await fetchApi('/api/ai/command-log?limit=5', {
    headers: { 'X-AI-Session-ID': sessionToken },
  });
  
  if (status === 200) {
    console.log(`✅ Command log retrieved: ${data.logs?.length || 0} entries`);
    for (const log of (data.logs || []).slice(0, 3)) {
      console.log(`   - ${log.normalized || log.inputText?.slice(0, 30)} (${log.status})`);
    }
  } else {
    console.log(`❌ Failed with status ${status}:`, data);
  }
}

async function main() {
  console.log('🧪 Phase 1 AI API Test Suite');
  console.log('============================');
  console.log(`Base URL: ${BASE_URL}`);
  
  try {
    // 1. Get context and session
    const sessionToken = await testContext();
    
    if (!sessionToken) {
      console.log('\n❌ Cannot continue without session token');
      process.exit(1);
    }
    
    // 2. Test resolve
    await testResolve(sessionToken);
    
    // 3. Test propose
    const proposalId = await testPropose(sessionToken);
    
    // 4. Test execute (should be blocked for Phase 2)
    await testExecuteBlocked(sessionToken, proposalId);
    
    // 5. Test command log
    await testCommandLog(sessionToken);
    
    console.log('\n============================');
    console.log('✅ Test suite complete');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

main();

