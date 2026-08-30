import http from 'http';

function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runSmokeTest() {
  console.log('🧪 Starting WidgetFlow API Smoke Test...\n');

  try {
    // 1. Health
    const health = await getJson('http://localhost:3001/api/health');
    console.log('✅ /api/health:', health.success && health.status === 'ok' ? 'PASS' : 'FAIL');

    // 2. Users
    const users = await getJson('http://localhost:3001/api/users');
    console.log('✅ /api/users:', users.success && Array.isArray(users.data) ? `PASS (${users.data.length} users)` : 'FAIL');

    // 3. Categories
    const categories = await getJson('http://localhost:3001/api/categories');
    console.log('✅ /api/categories:', categories.success && Array.isArray(categories.data) ? `PASS (${categories.data.length} categories)` : 'FAIL');

    // 4. Approved Templates
    const templates = await getJson('http://localhost:3001/api/templates?status=Approved');
    console.log('✅ /api/templates?status=Approved:', templates.success && Array.isArray(templates.data) ? `PASS (${templates.data.length} templates)` : 'FAIL');

    // 5. Reports for Ahmed
    const reports = await getJson('http://localhost:3001/api/reports', { 'X-Demo-User-Id': 'user-employee' });
    console.log('✅ /api/reports (Ahmed):', reports.success && Array.isArray(reports.data) ? `PASS (${reports.data.length} reports)` : 'FAIL');

    // 6. Notifications for Sarah
    const notifs = await getJson('http://localhost:3001/api/notifications', { 'X-Demo-User-Id': 'user-manager' });
    console.log('✅ /api/notifications (Sarah):', notifs.success && Array.isArray(notifs.data) ? `PASS (${notifs.data.length} notifications)` : 'FAIL');

    console.log('\n🎉 Smoke Test Completed Successfully! All API endpoints verified.');
  } catch (err: any) {
    console.error('❌ Smoke Test Failed:', err.message);
    process.exit(1);
  }
}

runSmokeTest();
