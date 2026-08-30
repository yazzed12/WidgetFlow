import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const OUT = '/Users/apple/Desktop/gsk-task-1/WidgetFlow_Client_Presentation.pptx';
const PREVIEW_DIR = '/Users/apple/Desktop/gsk-task-1/.presentation-build/widgetflow-client/previews';
const HERO = '/Users/apple/Desktop/gsk-task-1/src/assets/hero.png';

const W = 1280;
const H = 720;
const C = {
  ink: '#0B1020',
  ink2: '#151A2F',
  purple: '#6D3CFF',
  purple2: '#8B67FF',
  cyan: '#20C7D9',
  cyan2: '#92ECF4',
  white: '#FFFFFF',
  paper: '#F6F7FB',
  mist: '#E8EAF2',
  slate: '#667085',
  darkSlate: '#344054',
  green: '#17A673',
  amber: '#E9A23B',
  red: '#D84A5C',
  lightPurple: '#EEE9FF',
  lightCyan: '#E6F9FB',
  lightGreen: '#E8F7F1',
  lightAmber: '#FFF3DF',
  lightRed: '#FDECEF',
};

const deck = Presentation.create({ slideSize: { width: W, height: H } });

function addText(slide, text, x, y, w, h, size = 20, color = C.ink, bold = false, align = 'left', name = undefined) {
  const s = slide.shapes.add({
    geometry: 'textbox',
    name,
    position: { left: x, top: y, width: w, height: h },
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
  });
  s.text = text;
  s.text.style = { fontSize: size, color, bold, alignment: align, fontFamily: 'Aptos' };
  return s;
}

function addBox(slide, x, y, w, h, fill = C.white, radius = 18, line = C.mist, shadow = false, name = undefined) {
  return slide.shapes.add({
    geometry: 'roundRect',
    name,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: 'solid', fill: line, width: line === 'none' ? 0 : 1 },
    borderRadius: radius,
    shadow: shadow ? 'shadow-md' : 'shadow-none',
  });
}

function addRule(slide, x, y, w, color = C.mist, thickness = 1) {
  return slide.shapes.add({
    geometry: 'line',
    position: { left: x, top: y, width: w, height: 0 },
    fill: 'none',
    line: { style: 'solid', fill: color, width: thickness },
  });
}

function addDot(slide, x, y, d, fill) {
  return slide.shapes.add({
    geometry: 'ellipse',
    position: { left: x, top: y, width: d, height: d },
    fill,
    line: { style: 'solid', fill, width: 0 },
  });
}

function addHeader(slide, title, section, n, dark = false) {
  const fg = dark ? C.white : C.ink;
  const muted = dark ? '#A8B0C8' : C.slate;
  addText(slide, section.toUpperCase(), 64, 40, 390, 24, 14, dark ? C.cyan2 : C.purple, true);
  addText(slide, title, 64, 74, 1080, 50, 34, fg, true, 'left', `slide-title-${n}`);
  addText(slide, String(n).padStart(2, '0'), 1180, 48, 42, 22, 14, muted, true, 'right');
  addRule(slide, 64, 136, 1152, dark ? '#2B3148' : C.mist, 1);
}

function addFooter(slide, text = 'WidgetFlow  |  Client Presentation', dark = false) {
  addText(slide, text, 64, 684, 780, 18, 11, dark ? '#8992AD' : '#98A2B3', false);
}

function addNotes(slide, { core, visual, talk, features, sources }) {
  const note = [
    `CORE MESSAGE\n${core}`,
    `VISUAL / LAYOUT DIRECTION\n${visual}`,
    `PRESENTER TALK TRACK\n${talk}`,
    `FEATURES REPRESENTED\n${features}`,
    `[Sources]\n${sources.map(s => `- ${s}`).join('\n')}`,
  ].join('\n\n');
  slide.speakerNotes.textFrame.setText(note);
  slide.speakerNotes.setVisible(true);
}

function darkSlide(title, section, n) {
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addHeader(s, title, section, n, true);
  addFooter(s, undefined, true);
  return s;
}

function lightSlide(title, section, n) {
  const s = deck.slides.add();
  s.background.fill = C.paper;
  addHeader(s, title, section, n, false);
  addFooter(s);
  return s;
}

function labelValue(slide, label, value, x, y, w, color = C.purple, dark = false) {
  addText(slide, label.toUpperCase(), x, y, w, 24, 13, color, true);
  addText(slide, value, x, y + 30, w, 72, 24, dark ? C.white : C.ink, true);
}

function processRow(slide, items, y, options = {}) {
  const x0 = options.x ?? 70;
  const totalW = options.width ?? 1140;
  const gap = options.gap ?? 36;
  const boxW = (totalW - gap * (items.length - 1)) / items.length;
  items.forEach((item, i) => {
    const x = x0 + i * (boxW + gap);
    const fill = item.fill ?? (options.dark ? C.ink2 : C.white);
    addBox(slide, x, y, boxW, options.height ?? 118, fill, 18, options.dark ? '#333A55' : C.mist, false);
    addText(slide, item.kicker ?? String(i + 1).padStart(2, '0'), x + 18, y + 16, boxW - 36, 20, 12, item.accent ?? C.purple, true);
    addText(slide, item.title, x + 18, y + 43, boxW - 36, 34, options.titleSize ?? 22, options.dark ? C.white : C.ink, true);
    if (item.body) addText(slide, item.body, x + 18, y + 79, boxW - 36, 28, 15, options.dark ? '#B9C0D3' : C.slate, false);
    if (i < items.length - 1) addText(slide, '→', x + boxW + 7, y + 39, 24, 34, 27, options.dark ? C.cyan : C.purple, true, 'center');
  });
}

function comparisonColumn(slide, x, y, w, title, subtitle, bullets, accent, fill) {
  addBox(slide, x, y, w, 410, fill, 22, 'none', false);
  addText(slide, title, x + 28, y + 28, w - 56, 44, 28, C.ink, true);
  addText(slide, subtitle, x + 28, y + 78, w - 56, 48, 17, C.darkSlate, false);
  addRule(slide, x + 28, y + 144, w - 56, accent, 3);
  bullets.forEach((b, i) => {
    addDot(slide, x + 30, y + 180 + i * 50, 10, accent);
    addText(slide, b, x + 52, y + 172 + i * 50, w - 82, 36, 18, C.ink, i === 0);
  });
}

function addMatrixSlide(n, title, rows, sourceDocs) {
  const s = lightSlide(title, 'Feature coverage matrix', n);
  addText(s, 'FEATURE', 70, 158, 470, 24, 13, C.slate, true);
  addText(s, 'CUSTOMER BENEFIT', 520, 158, 470, 24, 13, C.slate, true);
  addText(s, 'SLIDE(S)', 1000, 158, 120, 24, 13, C.slate, true);
  addText(s, 'COVERED', 1120, 158, 90, 24, 13, C.slate, true, 'right');
  addRule(s, 70, 187, 1140, C.mist, 1);
  rows.forEach((r, i) => {
    const y = 198 + i * 43;
    if (i % 2 === 0) addBox(s, 64, y - 3, 1152, 39, C.white, 7, 'none', false);
    addText(s, r[0], 76, y + 5, 430, 25, 16, C.ink, true);
    addText(s, r[1], 520, y + 5, 460, 25, 15, C.darkSlate, false);
    addText(s, r[2], 1000, y + 5, 100, 25, 16, C.purple, true);
    addText(s, 'YES', 1120, y + 5, 82, 25, 15, C.green, true, 'right');
  });
  addNotes(s, {
    core: 'Every meaningful implemented client-facing capability has a named place in the deck.',
    visual: 'A concise, auditable feature-to-value-to-slide matrix.',
    talk: 'Use this appendix only when a buyer requests detailed capability confirmation. Every row maps the actual implemented behavior to the business benefit and the slide where it is explained.',
    features: rows.map(r => r[0]).join(', '),
    sources: sourceDocs,
  });
  return s;
}

// 1 — Title
{
  const s = deck.slides.add();
  s.background.fill = C.ink;
  addText(s, 'WIDGETFLOW', 72, 66, 340, 24, 14, C.cyan2, true);
  addText(s, 'Standardize reporting.\nGovern every step.', 72, 166, 700, 170, 62, C.white, true);
  addText(s, 'A controlled platform for designing, publishing, completing, reviewing and finalizing organizational reports.', 76, 370, 650, 104, 24, '#C8CEE0', false);
  addBox(s, 78, 535, 418, 48, C.purple, 24, C.purple, false);
  addText(s, 'CLIENT PRODUCT PRESENTATION', 100, 550, 374, 24, 14, C.white, true, 'center');
  const heroBytes = await fs.readFile(HERO);
  s.images.add({ blob: heroBytes, contentType: 'image/png', alt: 'Layered WidgetFlow product motif', fit: 'contain', position: { left: 842, top: 150, width: 340, height: 340 } });
  addRule(s, 832, 516, 360, C.cyan, 4);
  addText(s, 'DESIGN  →  GOVERN  →  REPORT  →  REVIEW', 820, 542, 390, 32, 15, C.white, true, 'center');
  addText(s, 'WidgetFlow', 72, 680, 180, 18, 11, '#8992AD', false);
  addNotes(s, {
    core: 'WidgetFlow turns organizational reporting into one standardized, governed and traceable business process.',
    visual: 'Minimal dark cover with the repository-owned layered product motif and a concise lifecycle promise.',
    talk: 'WidgetFlow is designed for organizations that want reporting to operate as a controlled business process—not as a collection of disconnected files, spreadsheets and email chains. It brings template design, governance, report completion, review, collaboration, finalization and administration into one experience.',
    features: 'Overall product promise; templates; reports; governance; review; finalization.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md', 'docs/PRODUCT_AND_FEATURES.md', 'src/assets/hero.png'],
  });
}

// 2
{
  const s = lightSlide('Important reporting is still managed like loose paperwork', 'The reporting problem', 2);
  addText(s, 'When reporting lives across documents, spreadsheets and messages, the process becomes harder to control than the content itself.', 70, 164, 1000, 62, 24, C.darkSlate, false);
  const pains = [
    ['Inconsistent formats', 'Every team rebuilds the same report differently.'],
    ['Missing information', 'Critical fields and instructions are easy to overlook.'],
    ['Approval delays', 'Ownership and next actions become unclear.'],
    ['Scattered feedback', 'Comments and decisions disappear into email threads.'],
    ['Weak accountability', 'It is difficult to reconstruct who did what and when.'],
  ];
  pains.forEach((p, i) => {
    const y = 260 + i * 66;
    addText(s, String(i + 1).padStart(2, '0'), 80, y, 38, 28, 14, i < 2 ? C.red : C.purple, true);
    addText(s, p[0], 132, y - 3, 300, 32, 21, C.ink, true);
    addText(s, p[1], 450, y - 2, 650, 34, 18, C.slate, false);
    addRule(s, 132, y + 43, 940, C.mist, 1);
  });
  addNotes(s, {
    core: 'The reporting problem is operational fragmentation, not a lack of files.',
    visual: 'Five progressively connected pain statements create a clear business tension without fake metrics.',
    talk: 'Most organizations already have reporting tools. The gap is control. Teams recreate formats, reviewers chase context, and decisions scatter across channels. WidgetFlow addresses the process around the report: structure, governance, responsibility, revision and evidence.',
    features: 'Problem framing for standardization, governance, collaboration and auditability.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md', 'docs/PRODUCT_AND_FEATURES.md'],
  });
}

// 3
{
  const s = darkSlide('One controlled environment for the full reporting lifecycle', 'Introducing WidgetFlow', 3);
  const words = [
    ['DESIGN', 'Build reusable reporting structures'],
    ['GOVERN', 'Approve standards before publication'],
    ['EXECUTE', 'Complete real reports from approved templates'],
    ['ACCOUNT', 'Review, decide, sign and retain history'],
  ];
  words.forEach((w, i) => {
    const x = 72 + i * 292;
    addText(s, w[0], x, 205, 245, 32, 18, i % 2 ? C.cyan : C.purple2, true);
    addRule(s, x, 250, 220, i % 2 ? C.cyan : C.purple, 4);
    addText(s, w[1], x, 278, 238, 100, 24, C.white, true);
  });
  addText(s, 'Templates establish the standard. Reports carry the real work. WidgetFlow connects both through governed decisions.', 74, 500, 1030, 80, 25, '#C8CEE0', false);
  addNotes(s, {
    core: 'WidgetFlow connects the reusable standard to the live business workflow.',
    visual: 'Four lifecycle verbs form a single horizontal operating system.',
    talk: 'WidgetFlow is not simply a form builder or a report archive. It begins with how reports should be structured, controls how those standards become available, guides people through completing real reports, and keeps the review and decision trail connected.',
    features: 'Template Studio, governance, reports, review, signatures, audit.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md', 'docs/PRODUCT_AND_FEATURES.md'],
  });
}

// 4
{
  const s = lightSlide('A repeatable model from design to final decision', 'How WidgetFlow works', 4);
  processRow(s, [
    { title: 'Design', body: 'Create a reusable template', accent: C.purple },
    { title: 'Approve', body: 'Publish with role oversight', accent: C.purple },
    { title: 'Complete', body: 'Create a live report', accent: C.cyan },
    { title: 'Review', body: 'Comment, return or reject', accent: C.cyan },
    { title: 'Finalize', body: 'Sign and lock', accent: C.green },
  ], 210, { height: 140, gap: 28 });
  addRule(s, 145, 450, 990, C.purple, 2);
  addText(s, 'ADMIN CONTROL LAYER', 80, 486, 220, 26, 14, C.purple, true);
  addText(s, 'Capabilities  •  Elements  •  Standard content  •  Users  •  Categories  •  Workflow policies  •  Audit', 300, 482, 840, 36, 20, C.ink, true);
  addText(s, 'The organization defines the experience once; every role works within the same governed model.', 80, 555, 1050, 42, 22, C.darkSlate, false);
  addNotes(s, {
    core: 'WidgetFlow separates operational participation from platform control.',
    visual: 'Five-stage lifecycle with a single Admin control plane underneath.',
    talk: 'Users move through a clear lifecycle, while administrators control which capabilities and standards are available. This separation is important: Admin is not another reviewer. Admin governs the platform; business roles govern templates and reports.',
    features: 'End-to-end lifecycle; Admin Control Center; policy reflection.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md', 'docs/ADMIN_CONTROL_CENTER.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md'],
  });
}

// 5
{
  const s = lightSlide('Four roles create clear ownership', 'Role-based experience', 5);
  const roles = [
    ['AH', 'Ahmed', 'EMPLOYEE', 'Creates templates and reports', C.purple, C.lightPurple],
    ['SM', 'Sarah', 'MANAGER', 'Approves standards and reviews reports', C.cyan, C.lightCyan],
    ['OA', 'Omar', 'DIRECTOR', 'Approves standards at executive level', C.green, C.lightGreen],
    ['LN', 'Lina', 'ADMIN', 'Controls platform standards and policy', C.amber, C.lightAmber],
  ];
  roles.forEach((r, i) => {
    const x = 70 + i * 290;
    addDot(s, x + 2, 190, 56, r[4]);
    addText(s, r[0], x + 2, 207, 56, 22, 16, C.white, true, 'center');
    addText(s, r[1], x + 76, 184, 170, 32, 25, C.ink, true);
    addText(s, r[2], x + 76, 220, 170, 22, 13, r[4], true);
    addBox(s, x, 270, 250, 235, r[5], 20, 'none', false);
    addText(s, r[3], x + 24, 300, 202, 84, 22, C.ink, true);
    const outcomes = i === 0 ? ['Build', 'Complete', 'Track'] : i === 1 ? ['Approve', 'Review', 'Sign'] : i === 2 ? ['Publish', 'Approve', 'Oversee'] : ['Configure', 'Standardize', 'Audit'];
    outcomes.forEach((o, j) => addText(s, `• ${o}`, x + 26, 405 + j * 31, 190, 24, 17, C.darkSlate, false));
  });
  addText(s, 'Admin is the organization control layer—not part of the operational approval chain.', 70, 570, 1120, 40, 21, C.purple, true, 'center');
  addNotes(s, {
    core: 'WidgetFlow gives each role a focused experience and a clear decision boundary.',
    visual: 'Four role portraits with responsibilities and outcomes; Admin is explicitly separated.',
    talk: 'Employees build and complete work. Managers add team-level governance and report review. Directors provide executive oversight and can publish their own standards directly. Admin configures the platform and does not sit inside the business approval chain.',
    features: 'Employee, Manager, Director, Admin; role navigation; role dashboards and actions.',
    sources: ['docs/USER_ROLES_AND_PERMISSIONS.md', 'docs/ADMIN_CONTROL_CENTER.md'],
  });
}

// 6
{
  const s = lightSlide('Templates define the standard. Reports record the event.', 'Core product objects', 6);
  comparisonColumn(s, 80, 180, 500, 'REPORT TEMPLATE', 'A reusable structure that defines how a report should be completed.', [
    'Standard sections and fields',
    'Approved corporate wording and design',
    'Versioned and governed before use',
    'Reusable across many reporting cycles',
  ], C.purple, C.lightPurple);
  addText(s, '→', 598, 340, 84, 58, 44, C.purple, true, 'center');
  comparisonColumn(s, 700, 180, 500, 'REPORT', 'A real business record created from an approved template.', [
    'Completed with current information',
    'Assigned to a reviewer',
    'Returned, rejected or signed',
    'Retains its own history and outcome',
  ], C.cyan, C.lightCyan);
  addNotes(s, {
    core: 'Templates and reports solve different problems and are connected by design.',
    visual: 'A two-stage comparison makes the distinction unmistakable.',
    talk: 'A template is the reusable standard. A report is the actual completed business record. One approved template can create many reports, and each report stays bound to the version of the standard used when it was created.',
    features: 'Templates, Approved status, report instances, version snapshots, report history.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md', 'docs/PRODUCT_AND_FEATURES.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md'],
  });
}

// 7
{
  const s = darkSlide('Build structured reports without starting from scratch', 'Template Studio', 7);
  addText(s, 'Template Studio brings structure, reusable content and presentation controls into one focused workspace.', 70, 165, 1020, 58, 24, '#C8CEE0', false);
  const modules = [
    ['Templates', 'Start from approved work'], ['Elements', 'Choose report controls'], ['Content', 'Insert approved language'],
    ['Packs', 'Reuse proven combinations'], ['Text', 'Add structured content'], ['Sections', 'Organize the report'],
    ['Data Fields', 'Insert ready-made business inputs'], ['Themes', 'Apply a consistent presentation'], ['Workflow', 'Design and simulate routing'],
  ];
  modules.forEach((m, i) => {
    const col = i % 3; const row = Math.floor(i / 3);
    const x = 72 + col * 382; const y = 260 + row * 104;
    addText(s, m[0], x, y, 160, 28, 20, i === 8 ? C.amber : (col === 1 ? C.cyan : C.purple2), true);
    addText(s, m[1], x, y + 34, 330, 42, 17, '#C8CEE0', false);
    addRule(s, x, y + 82, 330, '#333A55', 1);
  });
  addText(s, 'Current live demonstrations use WidgetFlow’s governed template and report review flow; workflow design/simulation is covered in the appendix.', 72, 590, 1080, 38, 14, '#8992AD', false);
  addNotes(s, {
    core: 'Template Studio is the workspace for building reusable, structured reporting standards.',
    visual: 'Nine Studio areas shown as a flat capability landscape rather than a software menu dump.',
    talk: 'Creators can begin from approved templates, reusable packs or a blank structure. They organize sections, add fields and content, apply themes, preview the result and submit it into governance. The current build also contains workflow design and simulation tools; the reliable live customer story uses the established approval and report review paths.',
    features: 'Templates, Elements, Content Library, Packs, Text, Sections, Data Fields, Themes, workflow design/simulation surface, preview, save and submit.',
    sources: ['docs/TEMPLATE_STUDIO.md', 'docs/KNOWN_ISSUES_AND_TECHNICAL_DEBT.md'],
  });
}

// 8
{
  const s = lightSlide('23 elements support simple and sophisticated reports', 'Element system', 8);
  const groups = [
    ['INPUTS', 'Text, text area, number, date, date & time', C.purple],
    ['CHOICES', 'Select, checkbox, radio, rating, acknowledgement', C.cyan],
    ['FINANCIAL', 'Currency and percentage', C.green],
    ['LAYOUT', 'Heading, paragraph, divider, spacer, image, info box', C.amber],
    ['ADVANCED', 'File, signature, table, repeating group and KPI', C.red],
  ];
  groups.forEach((g, i) => {
    const y = 174 + i * 88;
    addText(s, g[0], 82, y, 170, 26, 15, g[2], true);
    addRule(s, 255, y + 12, 120, g[2], 3);
    addText(s, g[1], 404, y - 3, 730, 42, 22, C.ink, true);
  });
  addText(s, 'Administrators decide which elements are available for future template creation.', 82, 620, 1020, 38, 20, C.darkSlate, false);
  addNotes(s, {
    core: 'The element inventory covers everyday forms, financial reporting, rich document layout and advanced data capture.',
    visual: 'Five clean horizontal families, grouping all 23 actual element types.',
    talk: 'WidgetFlow can stay simple for a weekly operational form or support richer reporting with tables, repeating records, file attachments, signatures and KPI blocks. Admin can shape which building blocks appear to creators.',
    features: 'All 23 element types; element grouping; Admin element availability.',
    sources: ['docs/TEMPLATE_STUDIO.md', 'docs/ADMIN_CONTROL_CENTER.md'],
  });
}

// 9
{
  const s = lightSlide('Approved language and report data serve different jobs', 'Content Library vs Data Fields', 9);
  comparisonColumn(s, 80, 180, 500, 'CONTENT LIBRARY', 'Reusable organization-approved wording.', [
    'Headings and standard text',
    'Disclaimers and instructions',
    'Consistent corporate language',
    'Inserted as a safe reusable copy',
  ], C.purple, C.lightPurple);
  comparisonColumn(s, 700, 180, 500, 'DATA FIELDS', 'Information people complete inside each report.', [
    'Reporting date and department',
    'Amount, percentage and status',
    'Comments and operational values',
    'Changes for every report instance',
  ], C.cyan, C.lightCyan);
  addText(s, 'Approved content says what the organization wants to say. Data fields capture what happened.', 150, 610, 980, 36, 21, C.ink, true, 'center');
  addNotes(s, {
    core: 'Content Library standardizes language; Data Fields standardize information capture.',
    visual: 'Side-by-side distinction with real supported examples.',
    talk: 'A confidentiality statement should not be rewritten every time. It belongs in the Content Library. A reporting date or amount changes with every report, so it belongs as a Data Field. WidgetFlow keeps those concepts separate while making both reusable.',
    features: 'Admin Content Library, six content types, Data Fields catalog, snapshot insertion.',
    sources: ['docs/PACKS_AND_CONTENT_LIBRARY.md', 'docs/TEMPLATE_STUDIO.md'],
  });
}

// 10
{
  const s = darkSlide('Reuse proven building blocks at every level', 'Packs', 10);
  const packs = [
    ['STANDARD PACKS', 'Prepared centrally by Admin', 'Organization consistency', C.purple2],
    ['BUILT-IN PACKS', 'Ready-made section collections', 'A faster starting point', C.cyan],
    ['MY PACKS', 'Saved by each individual user', 'Personal productivity', C.green],
  ];
  packs.forEach((p, i) => {
    const x = 76 + i * 388;
    addText(s, p[0], x, 195, 330, 32, 17, p[3], true);
    addText(s, p[1], x, 258, 315, 70, 27, C.white, true);
    addText(s, p[2], x, 356, 315, 52, 20, '#B9C0D3', false);
    addRule(s, x, 438, 315, p[3], 4);
  });
  addText(s, 'Packs accelerate template creation. They do not become templates or create reports on their own.', 76, 530, 1080, 54, 23, C.white, true);
  addNotes(s, {
    core: 'WidgetFlow supports centrally governed reuse and individual productivity without confusing Packs with Templates.',
    visual: 'Three-level reuse model with distinct ownership and value.',
    talk: 'Standard Packs are organization-approved combinations. Built-in Packs provide ready-made section patterns. My Packs let individuals save recurring combinations for their own work. In every case, a Pack accelerates authoring; the governed Template remains the business standard.',
    features: 'Standard Packs, built-in Content Packs, My Packs, preview, insertion and ownership.',
    sources: ['docs/PACKS_AND_CONTENT_LIBRARY.md', 'docs/PRODUCT_AND_FEATURES.md'],
  });
}

// 11
{
  const s = lightSlide('Reuse without silently rewriting existing work', 'Snapshot safety', 11);
  processRow(s, [
    { title: 'Select', body: 'Choose a Pack or approved item', accent: C.purple },
    { title: 'Insert', body: 'Place it into the template', accent: C.purple },
    { title: 'Own copy', body: 'Template receives its own snapshot', accent: C.cyan },
    { title: 'Stay stable', body: 'Later source changes do not rewrite it', accent: C.green },
  ], 230, { x: 90, width: 1100, height: 140, gap: 42 });
  addText(s, 'Central standards can evolve while previously created templates remain predictable.', 160, 480, 960, 56, 27, C.ink, true, 'center');
  addText(s, 'A controlled copy—not a fragile live dependency.', 240, 555, 800, 36, 20, C.purple, true, 'center');
  addNotes(s, {
    core: 'Snapshot insertion delivers reuse without breaking earlier templates.',
    visual: 'Four-stage copy flow ending in stability.',
    talk: 'When a user inserts a Pack or Content Library item, the template receives a copy. If Admin later updates or disables the source, existing templates are not silently rewritten. That gives organizations controlled evolution and users predictable work.',
    features: 'Snapshot-copy behavior across Standard Packs, My Packs, built-in Packs and Content Library.',
    sources: ['docs/PACKS_AND_CONTENT_LIBRARY.md', 'docs/WIDGETFLOW_MASTER_SPECIFICATION.md'],
  });
}

// 12
{
  const s = darkSlide('New reporting standards reach the right level of oversight', 'Template governance', 12);
  const lanes = [
    ['EMPLOYEE', 'Creates template', 'MANAGER', 'Reviews & decides', C.purple2],
    ['MANAGER', 'Creates template', 'DIRECTOR', 'Reviews & decides', C.cyan],
    ['DIRECTOR', 'Creates template', 'DIRECT PUBLICATION', 'Publishes directly', C.green],
  ];
  lanes.forEach((l, i) => {
    const y = 190 + i * 128;
    addBox(s, 88, y, 250, 82, C.ink2, 16, '#333A55', false);
    addText(s, l[0], 108, y + 14, 210, 22, 14, l[4], true);
    addText(s, l[1], 108, y + 40, 210, 28, 19, C.white, true);
    addText(s, '→', 370, y + 19, 62, 38, 34, l[4], true, 'center');
    addBox(s, 460, y, 350, 82, '#222943', 16, '#333A55', false);
    addText(s, l[2], 484, y + 14, 300, 22, 14, l[4], true);
    addText(s, l[3], 484, y + 40, 300, 28, 19, C.white, true);
    addText(s, '→', 840, y + 19, 62, 38, 34, l[4], true, 'center');
    addText(s, 'AVAILABLE\nFOR REPORTING', 940, y + 10, 220, 58, 20, C.white, true, 'center');
  });
  addText(s, 'Admin sets the governance policy—but does not sit in the approval chain.', 88, 604, 1080, 32, 17, '#A8B0C8', false);
  addNotes(s, {
    core: 'WidgetFlow applies role-appropriate oversight before a template becomes an organizational standard.',
    visual: 'Three explicit governance lanes: Employee to Manager, Manager to Director, Director direct publication.',
    talk: 'This hierarchy prevents uncontrolled standards from appearing across the organization. Employee-created templates receive Manager review. Manager-created templates receive Director review. Director-created templates publish directly. Admin can turn governance on or off, but Admin is not an approver.',
    features: 'Template submit, approval hierarchy, direct Director publication, governance system policy.',
    sources: ['docs/USER_ROLES_AND_PERMISSIONS.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md', 'docs/ADMIN_CONTROL_CENTER.md'],
  });
}

// 13
{
  const s = lightSlide('Controlled publication preserves previous reporting', 'Governed templates', 13);
  const items = [
    ['01', 'Draft safely', 'Build, preview and refine before submission.'],
    ['02', 'Discuss in context', 'Creator and approver comments stay with the request.'],
    ['03', 'Approve or return the standard', 'A named reviewer records the decision and reason.'],
    ['04', 'Version without disruption', 'Approved templates stay locked; new versions begin as new drafts.'],
  ];
  items.forEach((it, i) => {
    const x = i < 2 ? 80 : 660; const y = i % 2 === 0 ? 190 : 390;
    addText(s, it[0], x, y, 50, 28, 15, C.purple, true);
    addText(s, it[1], x + 66, y - 3, 430, 34, 24, C.ink, true);
    addText(s, it[2], x + 66, y + 44, 440, 68, 18, C.darkSlate, false);
    addRule(s, x + 66, y + 132, 430, C.mist, 1);
  });
  addText(s, 'The approved template becomes the reusable standard; older report instances keep the version they used.', 140, 588, 1000, 48, 21, C.purple, true, 'center');
  addNotes(s, {
    core: 'Governance includes controlled drafting, contextual decisions and safe version evolution.',
    visual: 'Four governance commitments arranged as a balanced editorial grid.',
    talk: 'Approved templates are locked from normal overwrite. When the standard needs to evolve, a new draft version is created. Reports retain the version used at creation, so future template evolution does not erase the context of prior reporting.',
    features: 'Draft save, preview, template comments, approve/reject, immutable Approved state, versioning, archival replacement, report snapshot binding.',
    sources: ['docs/PRODUCT_AND_FEATURES.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md', 'docs/NOTIFICATIONS_AND_AUDIT.md'],
  });
}

// 14
{
  const s = lightSlide('Approved templates guide complete business reports', 'Report creation', 14);
  processRow(s, [
    { title: 'Choose', body: 'Select an approved template', accent: C.purple },
    { title: 'Create', body: 'Open a new report instance', accent: C.purple },
    { title: 'Complete', body: 'Enter required business information', accent: C.cyan },
    { title: 'Validate', body: 'Check visible required fields and calculations', accent: C.cyan },
    { title: 'Send', body: 'Assign the next reviewer', accent: C.green },
  ], 205, { height: 144, gap: 28 });
  addText(s, 'STRUCTURE', 90, 450, 300, 24, 13, C.purple, true, 'center');
  addText(s, 'The same standard\nevery time', 90, 485, 300, 64, 21, C.ink, true, 'center');
  addText(s, 'GUIDANCE', 490, 450, 300, 24, 13, C.cyan, true, 'center');
  addText(s, 'Required information\nis explicit', 490, 485, 300, 64, 21, C.ink, true, 'center');
  addText(s, 'TRACEABILITY', 890, 450, 300, 24, 13, C.green, true, 'center');
  addText(s, 'Each report has its own\nlifecycle', 890, 485, 300, 64, 21, C.ink, true, 'center');
  addNotes(s, {
    core: 'An approved template becomes a guided reporting experience rather than another blank document.',
    visual: 'Five-step report creation path plus three customer outcomes.',
    talk: 'Users begin with an approved standard, complete actual business data, and validate required information before sending the report forward. This makes reporting more repeatable and reduces missing data without forcing teams to rebuild formats.',
    features: 'Use Template, report creation, fields, required validation, calculations, completion, recipient selection and sending.',
    sources: ['docs/PRODUCT_AND_FEATURES.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md'],
  });
}

// 15
{
  const s = darkSlide('Review becomes a structured decision', 'Report review', 15);
  addBox(s, 95, 220, 260, 180, '#222943', 22, '#333A55', false);
  addText(s, 'SENT REPORT', 120, 248, 210, 24, 14, C.cyan, true);
  addText(s, 'Assigned reviewer\nopens the report', 120, 292, 210, 72, 24, C.white, true);
  addText(s, '→', 382, 276, 58, 50, 38, C.cyan, true, 'center');
  const outcomes = [
    ['COMMENT', 'Clarify in context', C.purple2],
    ['RETURN', 'Request correction', C.amber],
    ['REJECT', 'Record a final negative decision', C.red],
    ['SIGN', 'Finalize and lock', C.green],
  ];
  outcomes.forEach((o, i) => {
    const x = 475 + (i % 2) * 350; const y = 185 + Math.floor(i / 2) * 210;
    addText(s, o[0], x, y, 290, 24, 15, o[2], true);
    addText(s, o[1], x, y + 38, 290, 76, 25, C.white, true);
    addRule(s, x, y + 127, 280, o[2], 3);
  });
  addText(s, 'Every outcome remains connected to the report and its history.', 100, 585, 1030, 38, 22, '#C8CEE0', false);
  addNotes(s, {
    core: 'WidgetFlow turns review into explicit, traceable actions.',
    visual: 'One assigned report branches into four supported reviewer outcomes.',
    talk: 'The reviewer works inside the report, not across disconnected channels. They can clarify through comments, return the report for correction, reject it with a reason, or sign it as final. Each action changes the state clearly and preserves context.',
    features: 'Received reports, report comments, Return for Changes, rejection, digital signature.',
    sources: ['docs/PRODUCT_AND_FEATURES.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md'],
  });
}

// 16
{
  const s = lightSlide('Return for correction. Reject for a final decision.', 'Decision clarity', 16);
  comparisonColumn(s, 80, 180, 500, 'RETURN FOR CHANGES', 'The work can be corrected and submitted again.', [
    'Reviewer records specific feedback',
    'Creator edits the returned report',
    'Report is completed and resent',
    'Revision history stays connected',
  ], C.amber, C.lightAmber);
  comparisonColumn(s, 700, 180, 500, 'REJECT', 'The current workflow ends with a clear negative decision.', [
    'Reviewer must record a reason',
    'Outcome is explicit and visible',
    'Creator can review the decision',
    'History retains the final result',
  ], C.red, C.lightRed);
  addText(s, 'Two actions. Two different business meanings. No ambiguity.', 180, 610, 920, 38, 22, C.ink, true, 'center');
  addNotes(s, {
    core: 'WidgetFlow separates revisable feedback from a terminal negative decision.',
    visual: 'Side-by-side business comparison with the actual current state behavior.',
    talk: 'Return for Changes keeps the process alive: the creator edits, completes and resends. Rejection is final in the current classic workflow and requires a reason. That distinction prevents teams from treating every negative response as the same vague status.',
    features: 'Return reason, revision/resubmission loop, rejection reason, terminal Rejected state.',
    sources: ['docs/WORKFLOWS_AND_STATE_MACHINES.md', 'docs/PRODUCT_AND_FEATURES.md'],
  });
}

// 17
{
  const s = darkSlide('Digital signatures create a traceable point of finalization', 'Signature and finalization', 17);
  processRow(s, [
    { title: 'Authorized action', body: 'Sender or reviewer signs', accent: C.purple2 },
    { title: 'Verification', body: 'A unique verification record is created', accent: C.cyan },
    { title: 'Evidence', body: 'Signer, method, time and content hash are retained', accent: C.cyan },
    { title: 'Final state', body: 'Receiver signature locks the report', accent: C.green },
  ], 215, { x: 84, width: 1110, height: 155, gap: 40, dark: true });
  addText(s, 'Typed  •  Drawn  •  Uploaded', 150, 470, 420, 32, 21, C.white, true);
  addText(s, 'Existing signed reports remain visible even if future signing is disabled.', 610, 466, 500, 48, 18, '#B9C0D3', false);
  addText(s, 'Traceable finalization—without making unsupported legal-compliance claims.', 150, 560, 980, 38, 18, C.cyan2, true, 'center');
  addNotes(s, {
    core: 'WidgetFlow provides a traceable finalization record and locks the finalized report.',
    visual: 'Four-step signature evidence chain with the three supported profile methods.',
    talk: 'Authorized users can sign using typed, drawn or uploaded signature profiles. WidgetFlow records signer identity, role, method, time, verification ID and a content hash. A receiver signature moves the report to Signed and locks further editing. We position this as traceable workflow evidence—not as a legal compliance certification.',
    features: 'Signature profiles, uploaded/drawn/typed methods, sender/receiver roles, verification ID, hash, signature history, Signed lock.',
    sources: ['docs/WORKFLOWS_AND_STATE_MACHINES.md', 'docs/NOTIFICATIONS_AND_AUDIT.md', 'docs/KNOWN_ISSUES_AND_TECHNICAL_DEBT.md'],
  });
}

// 18
{
  const s = lightSlide('Feedback and action awareness stay connected', 'Collaboration and notifications', 18);
  addText(s, 'COMMENTS', 80, 190, 200, 26, 15, C.purple, true);
  addText(s, 'Template discussions and report comments keep questions, responses and decisions in context.', 80, 235, 470, 130, 28, C.ink, true);
  addRule(s, 620, 180, 1, C.mist, 1);
  addText(s, 'NOTIFICATIONS', 690, 190, 250, 26, 15, C.cyan, true);
  addText(s, 'Users know when approval, review, correction, rejection, signing or comment activity requires attention.', 690, 235, 470, 130, 28, C.ink, true);
  addBox(s, 80, 440, 1080, 112, C.white, 20, C.mist, false);
  addText(s, 'Approval required  •  Template approved  •  Template revision requested  •  Report received', 110, 464, 1020, 30, 18, C.darkSlate, true, 'center');
  addText(s, 'Report returned  •  Report rejected  •  Report signed  •  Comment added', 110, 508, 1020, 30, 18, C.darkSlate, true, 'center');
  addText(s, 'Read, unread and mark-all-read controls help users manage their action queue.', 150, 600, 980, 30, 18, C.purple, true, 'center');
  addNotes(s, {
    core: 'WidgetFlow keeps collaboration contextual and makes required actions visible.',
    visual: 'Two-part collaboration model with the complete eight-trigger notification set.',
    talk: 'Comments stay attached to the template request or report under discussion. Notifications then surface when a user needs to approve, review, revise, acknowledge a rejection, see a signature or respond to a comment. Users can manage read status from both a dropdown and full inbox.',
    features: 'Template comments, report comments, eight notification types, dropdown, inbox, read/read-all and entity navigation.',
    sources: ['docs/NOTIFICATIONS_AND_AUDIT.md', 'docs/PRODUCT_AND_FEATURES.md'],
  });
}

// 19
{
  const s = darkSlide('Every important decision leaves an accountable trail', 'Auditability', 19);
  const audits = [
    ['TEMPLATE HISTORY', 'Creation, submission, publication, approval, rejection and archival', C.purple2],
    ['REPORT HISTORY', 'Creation, saves, completion, sending, return, rejection and signature', C.cyan],
    ['SIGNATURE EVIDENCE', 'Signer, role, method, verification, content hash and active history', C.green],
    ['ADMIN AUDIT LOG', 'Configuration actions, targets, previous/new values and time', C.amber],
  ];
  audits.forEach((a, i) => {
    const y = 175 + i * 100;
    addText(s, a[0], 82, y, 280, 25, 15, a[2], true);
    addText(s, a[1], 390, y - 4, 760, 56, 22, C.white, true);
    addRule(s, 390, y + 64, 760, '#333A55', 1);
  });
  addText(s, 'Who acted  •  What happened  •  When it happened  •  Why a decision was made', 100, 604, 1060, 30, 19, '#C8CEE0', true, 'center');
  addNotes(s, {
    core: 'WidgetFlow makes workflow and configuration decisions reconstructable.',
    visual: 'Four complementary audit layers form one accountability model.',
    talk: 'Different events need different evidence. Template history records governance. Report history records the operational lifecycle. Signature evidence records finalization details. The Admin audit log records changes to the organization’s configuration. Together they make follow-up and accountability substantially clearer.',
    features: 'Template audit, report audit, signature history, Admin audit log.',
    sources: ['docs/NOTIFICATIONS_AND_AUDIT.md', 'docs/ADMIN_CONTROL_CENTER.md'],
  });
}

// 20
{
  const s = lightSlide('Find work by responsibility, status and context', 'Dashboards and organization', 20);
  const col = [
    ['ROLE DASHBOARD', 'Approved templates, personal reports, requests, items awaiting review, approvals and attention areas.'],
    ['SEARCH', 'Find approved templates and accessible reports from the global experience.'],
    ['FILTERS & TABS', 'Organize templates, requests, reports, notifications, Packs, content and Admin records.'],
    ['CATEGORIES', 'Structure the template library around the organization’s reporting domains.'],
  ];
  col.forEach((c, i) => {
    const x = i % 2 === 0 ? 82 : 672; const y = i < 2 ? 190 : 405;
    addText(s, c[0], x, y, 460, 26, 15, i % 2 ? C.cyan : C.purple, true);
    addText(s, c[1], x, y + 45, 470, 108, 23, C.ink, true);
    addRule(s, x, y + 165, 470, C.mist, 1);
  });
  addNotes(s, {
    core: 'WidgetFlow organizes the reporting workload around what each person needs to find and act on.',
    visual: 'Four editorial zones covering dashboard, search, filters and categories.',
    talk: 'The normal dashboard is role-aware. It surfaces approved templates, personal reports, review items, approvals, returned work and unread notifications. Search, status tabs, categories and filters then help users navigate the broader library and workflow queues.',
    features: 'Role dashboards, global search, template/report/request/notification filters, categories, status tabs, badges and attention cards.',
    sources: ['docs/USER_ROLES_AND_PERMISSIONS.md', 'docs/PRODUCT_AND_FEATURES.md', 'docs/FRONTEND_ARCHITECTURE.md'],
  });
}

// 21
{
  const s = darkSlide('Admin becomes the organization’s control layer', 'Admin Control Center', 21);
  const adminAreas = [
    ['Overview', 'Configuration posture and recent activity'],
    ['Features', 'Which Studio capabilities are available'],
    ['Studio configuration', 'Preview the creator experience'],
    ['Packs', 'Organization-standard building blocks'],
    ['Elements', 'Allowed creator components'],
    ['Content Library', 'Approved reusable wording'],
    ['Users & Access', 'Roles, departments and status'],
    ['Categories', 'Reporting structure and availability'],
    ['System Settings', 'Workflow policy switches'],
    ['Audit Log', 'Administrative accountability'],
  ];
  adminAreas.forEach((a, i) => {
    const col = i % 2; const row = Math.floor(i / 2); const x = 86 + col * 570; const y = 165 + row * 87;
    addText(s, a[0], x, y, 190, 28, 18, col ? C.cyan : C.purple2, true);
    addText(s, a[1], x + 206, y, 320, 44, 17, C.white, false);
    addRule(s, x, y + 54, 510, '#333A55', 1);
  });
  addNotes(s, {
    core: 'Admin can shape the organization-wide reporting environment without joining day-to-day approvals.',
    visual: 'Complete ten-area Admin map presented as a control system.',
    talk: 'Lina’s role is platform governance. She can see the configuration posture, manage creator capabilities, prepare reusable standards, maintain users and categories, set workflow policies and review configuration history. That keeps organizational control separate from operational approvals.',
    features: 'All ten Admin pages and Admin role separation.',
    sources: ['docs/ADMIN_CONTROL_CENTER.md', 'docs/USER_ROLES_AND_PERMISSIONS.md'],
  });
}

// 22
{
  const s = lightSlide('The organization chooses what creators can see and use', 'Configurable creator experience', 22);
  processRow(s, [
    { title: 'Admin decision', body: 'Disable a Studio capability or element', accent: C.purple },
    { title: 'Refresh', body: 'The creator experience updates', accent: C.purple },
    { title: 'Cleaner Studio', body: 'Ahmed, Sarah and Omar see only enabled options', accent: C.cyan },
    { title: 'Existing work', body: 'Inserted components continue to render', accent: C.green },
  ], 210, { x: 82, width: 1110, height: 150, gap: 38 });
  addText(s, 'Example: disable Rating → Rating disappears from future creator choices.', 160, 450, 960, 40, 24, C.ink, true, 'center');
  addText(s, 'A simpler workspace, controlled rollout and organization-defined building blocks.', 145, 535, 990, 54, 21, C.purple, false, 'center');
  addNotes(s, {
    core: 'Admin configuration directly shapes the workforce experience while preserving historical work.',
    visual: 'A four-step configuration-reflection flow using the actual Rating example.',
    talk: 'Administrators can disable Studio modules or specific elements. The option then disappears for creators after configuration refresh. Existing templates remain safe. In the current build, this is strongest as a managed user experience rather than a claim of universal backend policy enforcement.',
    features: 'Feature Management, Element Management, SystemConfig reflection, historical element safety.',
    sources: ['docs/ADMIN_CONTROL_CENTER.md', 'docs/TEMPLATE_STUDIO.md', 'docs/KNOWN_ISSUES_AND_TECHNICAL_DEBT.md'],
  });
}

// 23
{
  const s = lightSlide('Standards, access and policy are controlled centrally', 'Organization controls', 23);
  const controls = [
    ['STANDARD PACKS', 'Create, edit, publish or disable organization building blocks.', C.purple],
    ['APPROVED CONTENT', 'Maintain standard headings, instructions, disclaimers and text.', C.cyan],
    ['USERS & CATEGORIES', 'Maintain roles, departments, status and reporting structure.', C.green],
    ['WORKFLOW POLICIES', 'Enable or disable rejection, return, digital signature and template governance.', C.amber],
  ];
  controls.forEach((c, i) => {
    const y = 177 + i * 107;
    addText(s, c[0], 82, y, 250, 26, 15, c[2], true);
    addText(s, c[1], 370, y - 5, 770, 58, 23, C.ink, true);
    addRule(s, 370, y + 68, 770, C.mist, 1);
  });
  addText(s, 'WidgetFlow adapts the available process to the organization’s chosen operating policy.', 125, 615, 1030, 36, 20, C.purple, true, 'center');
  addNotes(s, {
    core: 'WidgetFlow combines content governance, access administration and workflow policy in one control layer.',
    visual: 'Four flat control bands connect Admin actions to organizational outcomes.',
    talk: 'Admin can publish or disable Standard Packs, manage approved language, maintain users and categories, and choose whether the organization uses rejection, return, signatures and template governance. Existing historical records remain visible when a future action is disabled.',
    features: 'Pack Management, Content Library Management, Users & Access, Categories, report rejection policy, return policy, signature policy, template governance policy.',
    sources: ['docs/ADMIN_CONTROL_CENTER.md', 'docs/PACKS_AND_CONTENT_LIBRARY.md'],
  });
}

// 24
{
  const s = darkSlide('From approved standard to signed report', 'End-to-end scenario', 24);
  const steps = [
    ['AHMED', 'Builds a template request'],
    ['SARAH', 'Reviews and approves'],
    ['STANDARD', 'Template becomes available'],
    ['AHMED', 'Creates and completes a report'],
    ['SARAH', 'Reviews and returns if needed'],
    ['AHMED', 'Corrects and resends'],
    ['SARAH', 'Signs and finalizes'],
  ];
  steps.forEach((st, i) => {
    const x = 74 + i * 164;
    addDot(s, x + 44, 240, 54, i === 6 ? C.green : (i % 2 ? C.cyan : C.purple));
    addText(s, String(i + 1), x + 44, 256, 54, 22, 15, C.white, true, 'center');
    addText(s, st[0], x, 330, 142, 24, 14, i === 6 ? C.green : (i % 2 ? C.cyan : C.purple2), true, 'center');
    addText(s, st[1], x - 5, 366, 152, 76, 18, C.white, true, 'center');
    if (i < steps.length - 1) addText(s, '→', x + 137, 249, 30, 32, 25, '#66708D', true, 'center');
  });
  addText(s, 'Manager-created templates follow the same model one level higher: Sarah → Omar.', 145, 548, 990, 38, 20, '#C8CEE0', false, 'center');
  addText(s, 'Every action stays attached to the template, report, notification and audit context.', 120, 606, 1040, 34, 17, C.cyan2, true, 'center');
  addNotes(s, {
    core: 'WidgetFlow connects template governance and report execution into one accountable journey.',
    visual: 'A seven-stage role story using the seeded Ahmed and Sarah personas.',
    talk: 'Ahmed creates a reporting standard and submits it to Sarah. Once approved, he uses that standard to create a real report. Sarah reviews it. If correction is needed, she returns it with context; Ahmed edits and resends. When it is ready, Sarah signs, and the report becomes final and locked. Manager-created standards move to Omar for Director approval.',
    features: 'Complete Ahmed/Sarah journey; governance; report creation; review; return; resend; signature; notifications and audit.',
    sources: ['docs/USER_ROLES_AND_PERMISSIONS.md', 'docs/DEMO_AND_SEED_DATA.md'],
  });
}

// 25
{
  const s = lightSlide('WidgetFlow makes reporting discipline operational', 'Business value', 25);
  const vals = [
    ['STANDARDIZE', 'One reusable structure for recurring reports', C.purple],
    ['ACCELERATE', 'Packs, fields and approved content reduce repeated work', C.cyan],
    ['GOVERN', 'Role-based approval controls what becomes a standard', C.green],
    ['COLLABORATE', 'Comments and notifications keep action in context', C.amber],
    ['ACCOUNT', 'Audit trails preserve decisions and administrative change', C.red],
    ['FINALIZE', 'Verification and locking establish a clear final state', C.purple],
  ];
  vals.forEach((v, i) => {
    const col = i % 3; const row = Math.floor(i / 3); const x = 72 + col * 382; const y = 185 + row * 205;
    addText(s, v[0], x, y, 320, 28, 16, v[2], true);
    addText(s, v[1], x, y + 45, 320, 90, 24, C.ink, true);
    addRule(s, x, y + 147, 318, v[2], 3);
  });
  addText(s, 'The result: a firm-wide reporting platform that is easier to use, easier to govern and easier to trust.', 130, 590, 1020, 48, 22, C.purple, true, 'center');
  addNotes(s, {
    core: 'WidgetFlow’s value comes from combining standardization, speed, governance, collaboration, accountability and finalization.',
    visual: 'Six value pillars, each tied directly to implemented capabilities.',
    talk: 'The value is not any single control. It is the connected operating model. Teams build faster through reuse, work within approved standards, collaborate in context, make explicit decisions and retain evidence. That is what makes WidgetFlow useful as a firm-wide reporting platform.',
    features: 'Complete value translation across the product.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md', 'docs/PRODUCT_AND_FEATURES.md'],
  });
}

// 26
{
  const s = deck.slides.add();
  s.background.fill = C.purple;
  addText(s, 'WIDGETFLOW', 72, 68, 280, 24, 14, C.cyan2, true);
  addText(s, 'Make every report\na controlled process.', 72, 182, 790, 160, 62, C.white, true);
  addText(s, 'Standardize the structure. Govern publication. Guide completion. Keep review, evidence and accountability connected.', 76, 382, 760, 100, 25, '#EEE9FF', false);
  addRule(s, 76, 545, 890, C.cyan2, 4);
  addText(s, 'NEXT CONVERSATION', 78, 580, 230, 24, 13, C.white, true);
  addText(s, 'Walk through your highest-value reporting workflow and map it to WidgetFlow.', 330, 573, 800, 48, 22, C.white, true);
  addText(s, 'Optional capability appendix follows', 76, 680, 300, 18, 11, '#DDD4FF', false);
  addNotes(s, {
    core: 'The next step is to map one real customer reporting process into WidgetFlow.',
    visual: 'Strong purple close resolving the opening promise with a practical next conversation.',
    talk: 'The best next step is not a generic feature tour. Choose one recurring reporting workflow that currently creates inconsistency, delay or weak accountability. We can map the template, governance path, review outcomes and Admin controls that WidgetFlow would demonstrate for that process.',
    features: 'Closing product vision and customer call to action.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md'],
  });
}

// 27
{
  const s = lightSlide('Template Studio capability map', 'Optional product capability appendix', 27);
  const modules = [
    ['Templates', 'Approved starters, search and favorites'], ['Elements', '23 configurable building blocks'], ['Content Library', 'System and personal reusable sections'],
    ['Packs', 'Standard Packs and My Packs'], ['Text', 'Quick heading and paragraph insertion'], ['Sections', 'Add, name and reorder structure'],
    ['Data Fields', 'Ready-made business inputs'], ['Themes', 'Typography, color, spacing and density'], ['Workflow', 'Current design and simulation surface'],
    ['Preview', 'Render before publication'], ['Import', 'Current visible JSON import'], ['Guidance', 'Welcome, quick guide and validation feedback'],
  ];
  modules.forEach((m, i) => {
    const col = i % 3; const row = Math.floor(i / 3); const x = 68 + col * 385; const y = 160 + row * 112;
    addText(s, m[0], x, y, 150, 26, 17, (i % 3 === 1 ? C.cyan : C.purple), true);
    addText(s, m[1], x, y + 36, 330, 52, 16, C.darkSlate, false);
    addRule(s, x, y + 94, 330, C.mist, 1);
  });
  addText(s, 'Current build note: live demonstrations use the classic governed approval and report-review flow; document import claims are limited to visible JSON import.', 75, 622, 1110, 42, 14, C.slate, false);
  addNotes(s, {
    core: 'The appendix confirms the complete Studio surface without overstating incomplete integration.',
    visual: 'Twelve capability labels in a low-density three-column map.',
    talk: 'This is the complete current Studio capability surface. Workflow design and simulation are visible in the current build, while the recommended live story uses the fully connected classic governance and review paths. The visible import workflow is JSON-based; broader document import is not marketed.',
    features: 'All Studio modules, preview, JSON import, onboarding/help and validation.',
    sources: ['docs/TEMPLATE_STUDIO.md', 'docs/KNOWN_ISSUES_AND_TECHNICAL_DEBT.md'],
  });
}

// 28
{
  const s = darkSlide('Complete element capability overview', 'Optional product capability appendix', 28);
  const groups = [
    ['BASIC INPUTS', 'Text • Text area • Number • Date • Date & time', C.purple2],
    ['CHOICE INPUTS', 'Select • Checkbox • Radio • Rating • Acknowledgement', C.cyan],
    ['FINANCIAL', 'Currency • Percentage', C.green],
    ['LAYOUT', 'Heading • Paragraph • Divider • Spacer • Image • Info box', C.amber],
    ['ADVANCED', 'File • Signature • Table • Repeating group • KPI', C.red],
  ];
  groups.forEach((g, i) => {
    const y = 168 + i * 92;
    addText(s, g[0], 82, y, 220, 24, 15, g[2], true);
    addText(s, g[1], 330, y - 3, 820, 38, 23, C.white, true);
    addRule(s, 330, y + 50, 820, '#333A55', 1);
  });
  addText(s, 'Advanced capabilities include calculated tables, repeating records, file attachments, signature roles and KPI presentation.', 100, 620, 1060, 40, 17, '#B9C0D3', false, 'center');
  addNotes(s, {
    core: 'All 23 real element types are represented and grouped for customer comprehension.',
    visual: 'Five element families on a dark appendix slide.',
    talk: 'This is the complete implemented element inventory. It spans basic capture, choice controls, financial values, document layout and advanced components. Table configuration supports columns, formulas and aggregates; repeating groups support repeatable record sets.',
    features: 'All 23 elements; tables; formulas/aggregates; repeating groups; file attachments; signatures; KPI.',
    sources: ['docs/TEMPLATE_STUDIO.md'],
  });
}

// 29
{
  const s = lightSlide('Role capability matrix', 'Optional product capability appendix', 29);
  const rows = [
    ['Create and use templates', 'YES', 'YES', 'YES', '—'],
    ['Submit template', 'TO MANAGER', 'TO DIRECTOR', 'DIRECT', '—'],
    ['Approve template', '—', 'EMPLOYEE', 'MANAGER', '—'],
    ['Create and send reports', 'YES', 'YES', 'YES*', '—'],
    ['Review, return, reject, sign', 'IF ASSIGNED', 'IF ASSIGNED', 'IF ASSIGNED', '—'],
    ['Create My Packs', 'YES', 'YES', 'YES', '—'],
    ['Manage standards and policy', '—', '—', '—', 'YES'],
  ];
  const xs = [70, 540, 700, 860, 1020]; const ws = [450, 140, 140, 140, 160];
  ['CAPABILITY', 'EMPLOYEE', 'MANAGER', 'DIRECTOR', 'ADMIN'].forEach((h, i) => addText(s, h, xs[i], 165, ws[i], 24, 13, i === 0 ? C.slate : C.purple, true, i === 0 ? 'left' : 'center'));
  addRule(s, 70, 197, 1110, C.mist, 1);
  rows.forEach((r, ri) => {
    const y = 216 + ri * 58;
    if (ri % 2 === 0) addBox(s, 64, y - 6, 1120, 46, C.white, 7, 'none', false);
    r.forEach((v, i) => addText(s, v, xs[i], y + 4, ws[i], 28, i === 0 ? 17 : 14, i === 0 ? C.ink : (v === '—' ? C.slate : C.darkSlate), i === 0, i === 0 ? 'left' : 'center'));
  });
  addText(s, '*The current Director send dialog does not provide a normal next-level recipient; Director review works when assigned.', 75, 640, 1100, 30, 13, C.slate, false);
  addNotes(s, {
    core: 'Roles determine responsibility, approval level and platform access.',
    visual: 'A compact customer-readable role matrix.',
    talk: 'Employees, Managers and Directors share creator capabilities, with governance increasing by role. Admin is intentionally separate. Reviewer actions depend on assignment, report state and organization policy.',
    features: 'Detailed role matrix and conditional permissions.',
    sources: ['docs/USER_ROLES_AND_PERMISSIONS.md'],
  });
}

// 30
{
  const s = lightSlide('Admin capability map', 'Optional product capability appendix', 30);
  const groups = [
    ['SEE', 'Overview metrics and recent administrative activity'],
    ['SHAPE', 'Studio feature availability and element inventory'],
    ['STANDARDIZE', 'Standard Packs and approved Content Library wording'],
    ['ORGANIZE', 'Users, roles, departments, status and categories'],
    ['SET POLICY', 'Rejection, return, signatures and template governance'],
    ['ACCOUNT', 'Searchable Admin Audit Log with previous/new values'],
  ];
  groups.forEach((g, i) => {
    const col = i % 2; const row = Math.floor(i / 2); const x = 80 + col * 575; const y = 180 + row * 145;
    addText(s, g[0], x, y, 150, 26, 16, col ? C.cyan : C.purple, true);
    addText(s, g[1], x, y + 44, 490, 68, 23, C.ink, true);
    addRule(s, x, y + 118, 490, C.mist, 1);
  });
  addNotes(s, {
    core: 'Admin capabilities translate into six organization-level control outcomes.',
    visual: 'Six editorial control themes rather than a menu screenshot.',
    talk: 'The Admin Control Center is best understood through outcomes: see the configuration posture, shape the creator experience, standardize reusable content, organize people and reporting domains, set workflow policy and retain administrative accountability.',
    features: 'Overview, Feature Management, Studio Configuration, Pack/Element/Content management, Users, Categories, Settings and Audit.',
    sources: ['docs/ADMIN_CONTROL_CENTER.md'],
  });
}

// 31
{
  const s = darkSlide('Eight implemented notification triggers', 'Optional product capability appendix', 31);
  const n = [
    ['APPROVAL REQUIRED', 'Reviewer action needed'], ['TEMPLATE APPROVED', 'Standard is now available'],
    ['TEMPLATE REJECTED', 'Revision requested with reason'], ['REPORT RECEIVED', 'New review assignment'],
    ['REPORT RETURNED', 'Correction and resubmission needed'], ['REPORT REJECTED', 'Final negative decision recorded'],
    ['REPORT SIGNED', 'Finalization completed'], ['COMMENT ADDED', 'New contextual discussion'],
  ];
  n.forEach((x, i) => {
    const col = i % 2; const row = Math.floor(i / 2); const left = 82 + col * 575; const y = 165 + row * 112;
    addText(s, x[0], left, y, 250, 25, 15, col ? C.cyan : C.purple2, true);
    addText(s, x[1], left + 260, y, 270, 42, 18, C.white, true);
    addRule(s, left, y + 57, 520, '#333A55', 1);
  });
  addText(s, 'Inbox filters: All • Unread • Templates • Reports • Comments    |    Mark read • Mark all read', 105, 620, 1070, 28, 16, '#B9C0D3', false, 'center');
  addNotes(s, {
    core: 'Notification coverage aligns to the real actions people need to know about.',
    visual: 'The complete eight-trigger list plus inbox controls.',
    talk: 'These are the eight actual notification types in the current product. Notifications are user-scoped and support both individual read actions and mark-all-read. Clicking navigates toward the related template or report when available.',
    features: 'All eight notification types and notification management.',
    sources: ['docs/NOTIFICATIONS_AND_AUDIT.md'],
  });
}

// 32
{
  const s = lightSlide('Lifecycle states make work and decisions unambiguous', 'Optional product capability appendix', 32);
  addText(s, 'TEMPLATE', 80, 178, 170, 24, 15, C.purple, true);
  processRow(s, [
    { title: 'Draft', accent: C.purple }, { title: 'Pending', accent: C.amber }, { title: 'Approved', accent: C.green }, { title: 'Rejected', accent: C.red }, { title: 'Archived', accent: C.slate },
  ], 220, { x: 80, width: 1100, height: 86, gap: 25 });
  addText(s, 'REPORT', 80, 370, 170, 24, 15, C.cyan, true);
  processRow(s, [
    { title: 'Draft', accent: C.purple }, { title: 'Completed', accent: C.cyan }, { title: 'Sent', accent: C.amber }, { title: 'Returned', accent: C.amber }, { title: 'Signed', accent: C.green }, { title: 'Rejected', accent: C.red },
  ], 412, { x: 80, width: 1100, height: 86, gap: 19, titleSize: 19 });
  addText(s, 'Standard Pack: Draft ↔ Published ↔ Disabled     |     User / Category: Active ↔ Inactive', 110, 586, 1060, 32, 17, C.darkSlate, true, 'center');
  addNotes(s, {
    core: 'Explicit states give teams a shared understanding of where work stands.',
    visual: 'Compact lifecycle bands for templates, reports, Packs, users and categories.',
    talk: 'The main business states are visible and meaningful. Templates progress from Draft through approval or rejection. Reports progress from Draft to completion, review and final outcomes. Standard Packs have a publish lifecycle, while users and categories can be made Active or Inactive.',
    features: 'Template lifecycle, report lifecycle, Standard Pack lifecycle, user/category status.',
    sources: ['docs/WORKFLOWS_AND_STATE_MACHINES.md'],
  });
}

// 33
{
  const s = lightSlide('Search and supporting controls keep work usable', 'Optional product capability appendix', 33);
  const items = [
    ['GLOBAL', 'Search approved templates\nand accessible reports'],
    ['TEMPLATES', 'Category, tag and search;\ngrid/list presentation'],
    ['REQUESTS', 'Status and text search'],
    ['REPORTS', 'My, received, draft, awaiting signature,\nsigned and rejected tabs'],
    ['NOTIFICATIONS', 'Unread and entity-type filters\nwith date groups'],
    ['STUDIO', 'Search and category filters across\ntemplates, fields, Packs and content'],
    ['ADMIN', 'Filters for elements, Packs, content\nand audit records'],
    ['FEEDBACK', 'Toasts, badges, loaders, retry\nand empty states'],
  ];
  items.forEach((it, i) => {
    const col = i % 2; const row = Math.floor(i / 2); const x = 78 + col * 610; const y = 165 + row * 111;
    addText(s, it[0], x, y, 140, 24, 14, col ? C.cyan : C.purple, true);
    addText(s, it[1], x + 190, y - 2, 300, 52, 15, C.ink, true);
    addRule(s, x, y + 61, 495, C.mist, 1);
  });
  addText(s, 'Supporting evaluation tools: profile/signature settings, role switching and Demo Reset.', 130, 625, 1020, 28, 15, C.slate, false, 'center');
  addNotes(s, {
    core: 'Supporting navigation and feedback features make the broad capability set manageable.',
    visual: 'Eight discovery/feedback areas plus evaluation-environment tools.',
    talk: 'WidgetFlow uses search, status tabs, categories, filters, badges, toasts and empty/loading states throughout the experience. The current evaluation build also includes role switching, profile/signature settings and Demo Reset to support guided demonstrations.',
    features: 'Complete search/filter inventory, UI feedback, profile, signature settings, demo role switching and reset.',
    sources: ['docs/PRODUCT_AND_FEATURES.md', 'docs/FRONTEND_ARCHITECTURE.md', 'docs/DEMO_AND_SEED_DATA.md'],
  });
}

// 34
{
  const s = darkSlide('Recommended live demonstration sequence', 'Optional product capability appendix', 34);
  const steps = [
    ['1', 'Ahmed dashboard', 'Show role-aware work and approved templates'],
    ['2', 'Template Studio', 'Build with sections, elements and reusable content'],
    ['3', 'Sarah approval', 'Review, comment and approve the standard'],
    ['4', 'Live report', 'Complete, validate and send to Sarah'],
    ['5', 'Review paths', 'Return for correction, resend, then sign'],
    ['6', 'Lina Admin', 'Disable an element, set policy and review audit'],
  ];
  steps.forEach((st, i) => {
    const y = 164 + i * 78;
    addDot(s, 86, y, 44, i === 5 ? C.amber : (i % 2 ? C.cyan : C.purple));
    addText(s, st[0], 86, y + 12, 44, 20, 14, C.white, true, 'center');
    addText(s, st[1], 160, y + 2, 250, 28, 19, C.white, true);
    addText(s, st[2], 430, y + 2, 720, 40, 18, '#C8CEE0', false);
    if (i < steps.length - 1) addText(s, '↓', 96, y + 48, 24, 26, 20, '#66708D', true, 'center');
  });
  addText(s, 'Backup short demo: seeded Draft, Sent, Returned and Signed reports → one approval request → Admin audit.', 105, 638, 1070, 26, 14, C.cyan2, true, 'center');
  addNotes(s, {
    core: 'The strongest live demo follows one coherent story and uses only proven connected functionality.',
    visual: 'Six-stage presenter runbook with a seeded-data fallback.',
    talk: 'Start with Ahmed, not Admin. Establish everyday value, then show governance, then the report review loop, and finish with Admin control. Avoid the document import and dynamic workflow designer in the main demonstration because those areas are not fully connected in the current build.',
    features: 'Recommended demo flow; seeded fallback; safe demonstration boundary.',
    sources: ['docs/DEMO_AND_SEED_DATA.md', 'docs/KNOWN_ISSUES_AND_TECHNICAL_DEBT.md'],
  });
}

addMatrixSlide(35, 'Coverage 1 of 4 — Templates and Studio', [
  ['Approved Template Library', 'Reuse governed standards', '6, 14'],
  ['Template search, category & tags', 'Find the right standard quickly', '20, 33'],
  ['Create and save Draft', 'Develop safely before publication', '7, 13'],
  ['Template preview', 'Validate the experience before release', '7, 27'],
  ['Sections and drag/drop', 'Assemble structured reports quickly', '7, 27'],
  ['23-element system', 'Support simple through advanced reporting', '8, 28'],
  ['Data Fields Library', 'Reuse ready-made business inputs', '9, 27'],
  ['Themes', 'Apply consistent presentation', '7, 27'],
  ['Rules and calculations', 'Guide visibility and derived values', '14, 27'],
  ['JSON template import', 'Reuse a structured template definition', '27'],
  ['Workflow design & simulation', 'Model routing in the current design surface', '7, 27'],
], ['docs/PRODUCT_AND_FEATURES.md', 'docs/TEMPLATE_STUDIO.md']);

addMatrixSlide(36, 'Coverage 2 of 4 — Governance and Reports', [
  ['Template governance hierarchy', 'Put standards under appropriate oversight', '12'],
  ['Template approval & rejection', 'Record publication decisions and reasons', '12, 13'],
  ['Template request tracking', 'See work by status and ownership', '13, 20'],
  ['Template versioning', 'Evolve standards without overwrite', '13'],
  ['Template discussions', 'Keep approval feedback in context', '13, 18'],
  ['Create Report from Approved Template', 'Turn standards into live records', '6, 14'],
  ['Fill, save and complete', 'Guide accurate report completion', '14'],
  ['Required-field validation', 'Reduce missing information', '14'],
  ['Report lists, tabs and search', 'Organize work by responsibility and state', '20, 33'],
  ['Send and recipient selection', 'Assign the next accountable reviewer', '14, 15'],
], ['docs/PRODUCT_AND_FEATURES.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md']);

addMatrixSlide(37, 'Coverage 3 of 4 — Review, Reuse and Collaboration', [
  ['Report comments', 'Keep review discussion with the report', '15, 18'],
  ['Return for Changes', 'Create a controlled correction loop', '15, 16'],
  ['Report rejection', 'Record a final negative decision', '15, 16'],
  ['Digital signatures', 'Create traceable finalization evidence', '17'],
  ['Signature profiles', 'Support typed, drawn and uploaded methods', '17, 33'],
  ['Signed report locking', 'Protect the finalized report state', '17'],
  ['Standard Packs', 'Distribute organization-approved combinations', '10, 11'],
  ['Built-in Content Packs', 'Start with proven section patterns', '10'],
  ['My Packs', 'Reduce repeated personal setup', '10'],
  ['Content Library', 'Reuse approved corporate language', '9, 10'],
  ['Snapshot safety', 'Reuse without breaking existing work', '11'],
], ['docs/PACKS_AND_CONTENT_LIBRARY.md', 'docs/NOTIFICATIONS_AND_AUDIT.md', 'docs/WORKFLOWS_AND_STATE_MACHINES.md']);

addMatrixSlide(38, 'Coverage 4 of 4 — Awareness and Administration', [
  ['Eight notification types', 'Keep users aware of required action', '18, 31'],
  ['Read / unread notification control', 'Manage the personal action queue', '18, 31'],
  ['Template and Report Audit', 'Retain workflow accountability', '19'],
  ['Admin Audit Log', 'Trace configuration changes', '19, 21'],
  ['Admin Overview', 'See configuration posture and recent activity', '21, 30'],
  ['Feature Management', 'Shape the available Studio experience', '22'],
  ['Element Management', 'Control future creator building blocks', '8, 22'],
  ['Pack & Content Management', 'Govern reusable standards centrally', '23'],
  ['Users & Access', 'Maintain roles, departments and status', '23, 30'],
  ['Categories', 'Organize the reporting library', '20, 23'],
  ['System policy settings', 'Align workflow choices to organization policy', '23'],
], ['docs/ADMIN_CONTROL_CENTER.md', 'docs/NOTIFICATIONS_AND_AUDIT.md']);

// 39 pitches
{
  const s = lightSlide('Messaging toolkit', 'Optional product capability appendix', 39);
  addText(s, '30-SECOND ELEVATOR PITCH', 78, 178, 430, 26, 15, C.purple, true);
  addBox(s, 76, 220, 510, 280, C.lightPurple, 22, 'none', false);
  addText(s, 'WidgetFlow turns organizational reporting into one controlled process. Teams build reusable, approved templates; employees complete real reports; managers and directors review, return, reject or sign; and administrators control the standards, capabilities and policies available across the organization. The result is more consistent reporting, faster reuse and a clearer record of every important decision.', 106, 255, 450, 205, 21, C.ink, true);
  addText(s, '2-MINUTE SALES PITCH — KEY BEATS', 665, 178, 470, 26, 15, C.cyan, true);
  const beats = [
    '1. Reporting breaks down when the process lives across files and messages.',
    '2. WidgetFlow connects the standard, the real report and the decision trail.',
    '3. Studio and reusable content accelerate creation without sacrificing control.',
    '4. Role governance, review outcomes and signatures make responsibility explicit.',
    '5. Admin shapes the organization-wide experience and retains configuration audit.',
    '6. Start with one high-value recurring reporting workflow.',
  ];
  beats.forEach((b, i) => addText(s, b, 672, 225 + i * 57, 500, 45, 17, C.ink, i === 1 || i === 5));
  addText(s, 'The full verbatim two-minute pitch is in the speaker notes.', 680, 600, 480, 28, 15, C.slate, false);
  addNotes(s, {
    core: 'Provide ready-to-use concise and extended sales messaging.',
    visual: 'Verbatim 30-second pitch beside the six-beat two-minute structure.',
    talk: `Two-minute pitch:\nMany organizations do not have a reporting-content problem; they have a reporting-process problem. Important reports are recreated in documents and spreadsheets, approvals happen in email, feedback is scattered, and it becomes difficult to know which standard was used or who made the final decision.\n\nWidgetFlow brings that process into one controlled environment. Teams design reusable Report Templates in Template Studio using configurable sections, data fields, elements, themes, approved content and reusable Packs. New standards move through role-based governance before they become available: Employee templates route to a Manager, Manager templates route to a Director, and Director-created templates can publish directly.\n\nOnce approved, a Template becomes the trusted starting point for real Reports. Users complete required information, validate the report and send it to a reviewer. Reviewers can comment, return it for correction, reject it with a reason, or digitally sign it. A signed report receives a verification record and becomes locked, creating a clear final state.\n\nAdministrators control the organization-wide experience: available Studio capabilities, the 23-element inventory, Standard Packs, approved corporate content, users, categories and workflow policies. Template, report, signature and Admin audit histories preserve accountability throughout.\n\nWidgetFlow helps organizations standardize reporting, reduce repeated work, govern publication, keep collaboration in context and make decisions easier to trace. The most useful next step is to choose one recurring reporting process and demonstrate how WidgetFlow would standardize it end to end.`,
    features: '30-second elevator pitch and full two-minute sales pitch.',
    sources: ['docs/WIDGETFLOW_MASTER_SPECIFICATION.md', 'docs/PRODUCT_AND_FEATURES.md'],
  });
}

// 40 technology foundation
{
  const s = darkSlide('Technology foundation for product evaluation', 'Optional product capability appendix', 40);
  addText(s, 'MODERN WEB EXPERIENCE', 82, 184, 330, 28, 16, C.purple2, true);
  addText(s, 'Responsive React interface with dedicated normal-user and Admin experiences.', 82, 226, 450, 96, 26, C.white, true);
  addText(s, 'PERSISTENT PRODUCT BEHAVIOR', 690, 184, 380, 28, 16, C.cyan, true);
  addText(s, 'Real API and database-backed templates, reports, configuration, comments, notifications and audit records.', 690, 226, 450, 124, 26, C.white, true);
  addRule(s, 82, 405, 1058, '#333A55', 1);
  addText(s, 'EVALUATION BOUNDARY', 82, 446, 240, 26, 15, C.amber, true);
  addText(s, 'The current repository uses Demo Mode identity simulation. This presentation does not claim production authentication, enterprise SSO, legal e-signature compliance, unrestricted document import or a fully connected no-code workflow engine.', 82, 490, 1050, 105, 20, '#C8CEE0', false);
  addNotes(s, {
    core: 'The build demonstrates real product behavior while maintaining an honest evaluation boundary.',
    visual: 'Two high-level technology strengths followed by a concise evaluation boundary.',
    talk: 'This is not a developer architecture slide. It confirms that the experience is backed by real application and persistence behavior. The current repository is an evaluation/demo build with simulated identity, so production authentication and other incomplete areas are intentionally not marketed.',
    features: 'High-level technology foundation; demo identity boundary; avoided unsupported claims.',
    sources: ['docs/FRONTEND_ARCHITECTURE.md', 'docs/BACKEND_ARCHITECTURE.md', 'docs/KNOWN_ISSUES_AND_TECHNICAL_DEBT.md'],
  });
}

await fs.mkdir(PREVIEW_DIR, { recursive: true });
for (const [i, slide] of deck.slides.items.entries()) {
  const png = await deck.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(`${PREVIEW_DIR}/slide-${String(i + 1).padStart(2, '0')}.png`, new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(`${PREVIEW_DIR}/slide-${String(i + 1).padStart(2, '0')}.layout.json`, await layout.text());
}
const montage = await deck.export({ format: 'webp', montage: true, scale: 1 });
await fs.writeFile('/Users/apple/Desktop/gsk-task-1/.presentation-build/widgetflow-client/montage.webp', new Uint8Array(await montage.arrayBuffer()));
const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(OUT);
console.log(`Created ${OUT} with ${deck.slides.items.length} slides`);
