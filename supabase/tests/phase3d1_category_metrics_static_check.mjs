import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');
const app = read('src/context/AppContext.tsx');
const sidebar = read('src/components/layout/Sidebar.tsx');
const page = read('src/pages/TemplatesPage.tsx');
const admin = read('src/components/admin/AdminCategories.tsx');
const repo = read('src/features/admin/repositories/adminReadRepository.ts');
const checks = [
  ['total category selector', app.includes('getTotalCategoryCount') && app.includes('categories.length')],
  ['per-category approved selector', app.includes("t.categoryId === catId && t.status === 'Approved'")],
  ['distinct represented selector', app.includes('new Set(') && app.includes('getApprovedTemplates().map')],
  ['sidebar uses total selector', sidebar.includes('getTotalCategoryCount()')],
  ['TemplatesPage uses represented selector', page.includes('getApprovedTemplateCategoryCount()')],
  ['Admin Categories uses shared count selector', admin.includes('getCategoryTemplateCount(c.id)')],
  ['no hardcoded category template count', !repo.includes('templateCount: 0') && !admin.includes('templateCount: 0')],
  ['no per-category template queries', !repo.match(/forEach\([\s\S]{0,300}from\(['"]templates['"]\)/)],
];
let failed = 0; for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed++; }
if (failed) process.exit(1); console.log(`Category metrics static check passed (${checks.length} checks)`);
