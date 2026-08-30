import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runPreflight() {
  console.log('\n=============================================');
  console.log('       WidgetFlow Demo Preflight Check       ');
  console.log('=============================================\n');

  let hasError = false;

  // 1. Check Database File Existence
  const dbPath1 = path.resolve(__dirname, '../data/widgetflow.db');
  const dbPath2 = path.resolve(__dirname, '../../widgetflow.db');
  if (fs.existsSync(dbPath1) || fs.existsSync(dbPath2)) {
    console.log(`✓ SQLite database file accessible (${fs.existsSync(dbPath1) ? 'server/data/widgetflow.db' : 'widgetflow.db'})`);
  } else {
    console.log('❌ SQLite database file NOT found');
    hasError = true;
  }

  // 2. Check API Health Endpoint
  try {
    const healthRes = await getJson('http://localhost:3001/api/health');
    if (healthRes.body?.success && healthRes.body?.status === 'ok') {
      console.log('✓ API health endpoint operational (http://localhost:3001/api/health)');
    } else {
      console.log('❌ API health check returned unexpected status:', healthRes.body);
      hasError = true;
    }
  } catch (err: any) {
    console.log('❌ API health check failed to connect. Is server running? (npm run dev)');
    hasError = true;
  }

  // 3. Check Demo Users
  try {
    const usersRes = await getJson('http://localhost:3001/api/users');
    const users = usersRes.body?.data || [];
    const ahmed = users.find((u: any) => u.id === 'user-employee');
    const sarah = users.find((u: any) => u.id === 'user-manager');
    const omar = users.find((u: any) => u.id === 'user-director');

    if (ahmed && sarah && omar) {
      console.log('✓ All 3 demo users loaded (Ahmed Hassan, Sarah Mohamed, Omar Ali)');
    } else {
      console.log('❌ Missing required demo users in database');
      hasError = true;
    }
  } catch (err: any) {
    console.log('❌ Failed to fetch users from API');
    hasError = true;
  }

  // 4. Check Categories & Templates
  try {
    const tplRes = await getJson('http://localhost:3001/api/templates?status=Approved');
    const approvedTemplates = tplRes.body?.data || [];

    if (approvedTemplates.length >= 1) {
      console.log(`✓ ${approvedTemplates.length} approved firm-wide Report Templates available`);
    } else {
      console.log('❌ No approved Report Templates found');
      hasError = true;
    }
  } catch (err: any) {
    console.log('❌ Failed to fetch templates from API');
    hasError = true;
  }

  // 5. Check Reports Endpoint
  try {
    const reportsRes = await getJson('http://localhost:3001/api/reports', { 'X-Demo-User-Id': 'user-employee' });
    if (reportsRes.body?.success) {
      console.log('✓ Reports API responding successfully');
    } else {
      console.log('❌ Reports API returned error state');
      hasError = true;
    }
  } catch (err: any) {
    console.log('❌ Failed to connect to Reports API');
    hasError = true;
  }

  // 6. Check Notifications Endpoint
  try {
    const notifRes = await getJson('http://localhost:3001/api/notifications', { 'X-Demo-User-Id': 'user-employee' });
    if (notifRes.body?.success) {
      console.log('✓ Notifications API responding successfully');
    } else {
      console.log('❌ Notifications API returned error state');
      hasError = true;
    }
  } catch (err: any) {
    console.log('❌ Failed to connect to Notifications API');
    hasError = true;
  }

  console.log('\n---------------------------------------------');
  if (hasError) {
    console.log('❌ PREFLIGHT FAILED: Please run "npm run dev" or reset data.');
    console.log('---------------------------------------------\n');
    process.exit(1);
  } else {
    console.log('🎉 DEMO PREFLIGHT PASSED: WidgetFlow is ready for live presentation!');
    console.log('---------------------------------------------\n');
    process.exit(0);
  }
}

runPreflight();
