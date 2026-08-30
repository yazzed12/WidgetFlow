export interface ComponentHelpDefinition {
  type: string;
  title: string;
  category: 'basic' | 'content' | 'advanced' | 'business' | 'system';
  shortDescription: string;
  whenToUse: string;
  tips?: string[];
  exampleTitle?: string;
  exampleComponent?: any;
  defaultExampleValue?: any;
}

export const COMPONENT_HELP_DATABASE: Record<string, ComponentHelpDefinition> = {
  themes: {
    type: 'themes',
    title: 'Global Design System (Themes)',
    category: 'system',
    shortDescription: 'Set global visual defaults for your template, including typography, colors, form density, and spacing.',
    whenToUse: 'Use Themes to maintain brand consistency across all report templates. Components dynamically inherit these global tokens unless locally overridden.',
    tips: [
      'Themes: Set global visual defaults (Brand colors, Typography, Form density, Table styling, Spacing).',
      'Local Component Properties: Override Theme defaults only for specific components when needed.',
      'Reset to Theme: Restore inheritance for a component with one click.',
      'Immutability: Published template versions freeze their exact Theme snapshot.',
    ],
    exampleTitle: 'Global Theme Token Inheritance',
    exampleComponent: {
      id: 'ex-th',
      type: 'info_box',
      key: 'theme_help_box',
      label: 'Global Themes Overview',
      infoBoxConfig: {
        stylePreset: 'info',
        title: 'Themes vs Local Overrides',
        description: 'Themes define global fonts, colors, and density. Components set to "Theme Default" dynamically adapt whenever the Theme changes.',
      },
    },
  },

  'data-fields': {
    type: 'data-fields',
    title: 'Data Fields Library',
    category: 'system',
    shortDescription: 'Ready-made single business fields organized by enterprise category.',
    whenToUse: 'Use Data Fields to quickly insert pre-configured single components (e.g. Employee ID, Vendor Name, Incident Severity, Cost Center) into your template.',
    tips: [
      'Data Fields: insert one ready-made business component with standard keys and labels.',
      'Content Library: insert reusable multi-component Content Packs.',
      'Category Filters: easily find fields by General, People / HR, Finance, Operations, Technology, Project, or Risk / Compliance.',
      'Add to Pack: save individual Data Field definitions directly into your My Packs.',
    ],
    exampleTitle: 'Data Fields Overview',
    exampleComponent: {
      id: 'ex-df',
      type: 'info_box',
      key: 'data_fields_help_box',
      label: 'Data Fields Library Guide',
      infoBoxConfig: {
        stylePreset: 'info',
        title: 'Ready Business Fields',
        description: 'Data Fields come pre-configured with canonical keys, labels, placeholders, and validation options.',
      },
    },
  },

  'content-library': {
    type: 'content-library',
    title: 'Content Library & Reusable Content Packs',
    category: 'system',
    shortDescription: 'Insert ready-made groups of multi-component business content into your template with one action.',
    whenToUse: 'Use Content Library when building templates that need standard structured business blocks like Contact Info, Employee Info, Cost Breakdown, or Signatures.',
    tips: [
      'Data Fields: single ready business components.',
      'Content Packs: multi-component reusable sections (e.g. Employee Information Pack).',
      'My Packs: user-created reusable content saved directly from any section in your template.',
      'Inserted Content Packs are 100% editable and independent after insertion.',
    ],
    exampleTitle: 'Content Library Overview',
    exampleComponent: {
      id: 'ex-cl',
      type: 'info_box',
      key: 'content_library_help_box',
      label: 'Content Library Quick Guide',
      infoBoxConfig: {
        stylePreset: 'info',
        title: 'Content Library vs Data Fields',
        description: 'Data Fields add a single field (e.g., Employee Name). Content Packs add multi-component sections (e.g., Employee Name, ID, Department, Work Email, Manager, Start Date) in one click.',
      },
    },
  },

  text: {
    type: 'text',
    title: 'Text Input',
    category: 'basic',
    shortDescription: 'Captures short single-line textual information such as names, titles, or brief identifiers.',
    whenToUse: 'Use for names, addresses, reference numbers, or short single-line entries.',
    tips: [
      'Set min/max character lengths for data quality.',
      'Provide a clear placeholder to guide the user.',
    ],
    exampleTitle: 'Employee Full Name',
    exampleComponent: {
      id: 'ex-text',
      type: 'text',
      key: 'employee_name',
      label: 'Employee Full Name',
      placeholder: 'e.g. Ahmed Hassan',
      required: true,
      description: 'Enter full legal name as it appears on company records.',
    },
    defaultExampleValue: 'Ahmed Hassan',
  },

  textarea: {
    type: 'textarea',
    title: 'Long Text / Notes',
    category: 'basic',
    shortDescription: 'Captures multi-line formatted text for explanations, justifications, or detailed notes.',
    whenToUse: 'Use for incident descriptions, executive justifications, review comments, or multi-line notes.',
    tips: [
      'Use for fields where entries exceed 100 characters.',
      'Can be conditionally required via Rules when totals exceed specific limits.',
    ],
    exampleTitle: 'Business Justification',
    exampleComponent: {
      id: 'ex-textarea',
      type: 'textarea',
      key: 'justification',
      label: 'Executive Business Justification',
      placeholder: 'Provide detailed business reason for this request...',
      required: true,
    },
    defaultExampleValue: 'Upgrade primary database server cluster to enhance transaction throughput during peak Q4 sales events.',
  },

  number: {
    type: 'number',
    title: 'Numeric Quantity',
    category: 'basic',
    shortDescription: 'Captures whole or decimal numeric values with minimum/maximum boundaries.',
    whenToUse: 'Use for quantities, item counts, age, years of service, or numeric scores.',
    tips: [
      'Set minimum and maximum numeric validation limits.',
      'Use for inputs that participate in automated mathematical calculations.',
    ],
    exampleTitle: 'License Count',
    exampleComponent: {
      id: 'ex-number',
      type: 'number',
      key: 'license_count',
      label: 'Software License Quantity',
      placeholder: '10',
      required: true,
    },
    defaultExampleValue: 25,
  },

  currency: {
    type: 'currency',
    title: 'Currency Amount',
    category: 'basic',
    shortDescription: 'Captures financial values formatted automatically with currency symbols and two decimal places.',
    whenToUse: 'Use for prices, budget requests, unit costs, salaries, or expense line items.',
    tips: [
      'Automatically formats entry into standard currency ($).',
      'Supports participation in Table V2 row formulas and grand totals.',
    ],
    exampleTitle: 'Estimated Unit Price',
    exampleComponent: {
      id: 'ex-currency',
      type: 'currency',
      key: 'unit_cost',
      label: 'Estimated Unit Price ($)',
      placeholder: '0.00',
      required: true,
    },
    defaultExampleValue: 3500.0,
  },

  percentage: {
    type: 'percentage',
    title: 'Percentage Rate',
    category: 'basic',
    shortDescription: 'Captures percentage values formatted with a % symbol.',
    whenToUse: 'Use for discount rates, completion status, tax rates, or performance metrics.',
    tips: ['Values are displayed with % indicator and validated for percentage bounds.'],
    exampleTitle: 'Project Completion Rate',
    exampleComponent: {
      id: 'ex-percentage',
      type: 'percentage',
      key: 'completion_rate',
      label: 'Project Completion (%)',
      placeholder: '75',
      required: true,
    },
    defaultExampleValue: 85.5,
  },

  date: {
    type: 'date',
    title: 'Target Date',
    category: 'basic',
    shortDescription: 'Provides an interactive calendar date picker and formats stored dates into readable business formats.',
    whenToUse: 'Use for deadlines, completion dates, birth dates, or milestone target dates.',
    tips: [
      'Renders visual calendar picker in fill mode.',
      'Formats date into human-readable format (e.g. 25 Aug 2026) in read-only reports.',
    ],
    exampleTitle: 'Required Completion Date',
    exampleComponent: {
      id: 'ex-date',
      type: 'date',
      key: 'target_date',
      label: 'Required Completion Date',
      required: true,
      description: 'Select target project delivery date.',
    },
    defaultExampleValue: '2026-08-25',
  },

  datetime: {
    type: 'datetime',
    title: 'Timestamp (Date & Time)',
    category: 'basic',
    shortDescription: 'Provides an integrated date and time selector for scheduled meetings or time-stamped events.',
    whenToUse: 'Use for scheduled review times, audit timestamps, shift start/end times, or maintenance windows.',
    tips: [
      'Renders date + time controls in edit mode.',
      'Displays locale-aware date & time string (e.g. 25 Aug 2026, 10:30 AM) in historical reports.',
    ],
    exampleTitle: 'Scheduled Maintenance Window',
    exampleComponent: {
      id: 'ex-datetime',
      type: 'datetime',
      key: 'maintenance_window',
      label: 'Scheduled Maintenance Window',
      required: true,
    },
    defaultExampleValue: '2026-08-25T10:30',
  },

  select: {
    type: 'select',
    title: 'Dropdown Select',
    category: 'basic',
    shortDescription: 'Allows the user to select one value from a dropdown list of options.',
    whenToUse: 'Use when presenting a long list of choices (5+ choices) such as departments, regions, or categories.',
    tips: ['Keeps form layout compact compared to radio buttons.'],
    exampleTitle: 'Department Category',
    exampleComponent: {
      id: 'ex-select',
      type: 'select',
      key: 'department',
      label: 'Department Category',
      required: true,
      options: [
        { label: 'Engineering & IT', value: 'eng' },
        { label: 'Finance & Accounting', value: 'fin' },
        { label: 'Human Resources', value: 'hr' },
        { label: 'Operations & Logistics', value: 'ops' },
      ],
    },
    defaultExampleValue: 'eng',
  },

  radio: {
    type: 'radio',
    title: 'Radio Choice Options',
    category: 'basic',
    shortDescription: 'Displays all available options simultaneously so the user can select exactly one.',
    whenToUse: 'Use for small sets of mutually exclusive choices (2–5 items) where visibility is essential.',
    tips: ['All options are visible immediately without opening a menu.'],
    exampleTitle: 'Urgency Priority',
    exampleComponent: {
      id: 'ex-radio',
      type: 'radio',
      key: 'priority',
      label: 'Urgency Level',
      required: true,
      options: [
        { label: 'Low Priority', value: 'low' },
        { label: 'Medium Priority', value: 'medium' },
        { label: 'High / Critical', value: 'high' },
      ],
    },
    defaultExampleValue: 'medium',
  },

  checkbox: {
    type: 'checkbox',
    title: 'Checkbox Toggle',
    category: 'basic',
    shortDescription: 'Captures a simple true/false agreement or option toggle.',
    whenToUse: 'Use for optional feature flags, agreement toggles, or boolean status checks.',
    tips: ['Stores true/false boolean value.'],
    exampleTitle: 'Requires Legal Review',
    exampleComponent: {
      id: 'ex-checkbox',
      type: 'checkbox',
      key: 'legal_review_req',
      label: 'Requires Legal Review',
      placeholder: 'Flag this request for expedited legal counsel review',
    },
    defaultExampleValue: true,
  },

  rating: {
    type: 'rating',
    title: 'Rating Scale',
    category: 'basic',
    shortDescription: 'Captures a structured score or evaluation rating using stars, numbers, or rating buttons.',
    whenToUse: 'Use for vendor evaluations, customer satisfaction surveys, performance reviews, or audit quality scoring.',
    tips: [
      'Configure scale range (e.g. 1 to 5).',
      'Choose presentation style: Stars (★), Numbers [1-5], or Buttons.',
      'Add low-end and high-end descriptive labels.',
    ],
    exampleTitle: 'Vendor Quality Score',
    exampleComponent: {
      id: 'ex-rating',
      type: 'rating',
      key: 'vendor_quality',
      label: 'Vendor Quality Score',
      required: true,
      ratingConfig: {
        min: 1,
        max: 5,
        step: 1,
        displayStyle: 'stars',
        lowLabel: 'Poor',
        highLabel: 'Excellent',
        showValue: true,
      },
    },
    defaultExampleValue: 4,
  },

  acknowledgement: {
    type: 'acknowledgement',
    title: 'Acknowledgement Statement',
    category: 'basic',
    shortDescription: 'Displays an explicit policy or compliance statement and requires form-level user agreement before submission.',
    whenToUse: 'Use for policy acceptances, accuracy confirmations, terms agreement, or safety compliance checks.',
    tips: [
      'Renders explicit statement box with confirmation checkbox.',
      'Automatically records confirmation timestamp when checked.',
      'Distinct from multi-step Verified Workflow Signature.',
    ],
    exampleTitle: 'Policy Confirmation',
    exampleComponent: {
      id: 'ex-ack',
      type: 'acknowledgement',
      key: 'policy_agreement',
      label: 'Policy Agreement Confirmation',
      required: true,
      acknowledgementConfig: {
        statementText: 'I confirm that all financial amounts and vendor information in this request adhere to firm travel & expense policies.',
        checkboxLabel: 'I Agree and Accept',
        captureTimestamp: true,
      },
    },
    defaultExampleValue: {
      agreed: true,
      timestamp: '2026-08-25T08:30:00.000Z',
    },
  },

  file: {
    type: 'file',
    title: 'File Attachment Control',
    category: 'basic',
    shortDescription: 'Enables users to upload supporting business files or documents directly into report instances.',
    whenToUse: 'Use for invoices, receipts, contract PDFs, supporting spec sheets, or site inspection photos.',
    tips: [
      'Restricts upload file types (e.g. PDF, DOCX, XLSX, PNG, JPEG).',
      'Enforces maximum file size limit (up to 10MB).',
      'Provides secure direct download link in read-only reports.',
    ],
    exampleTitle: 'Supporting Invoice PDF',
    exampleComponent: {
      id: 'ex-file',
      type: 'file',
      key: 'invoice_pdf',
      label: 'Supporting Vendor Invoice PDF',
      required: true,
      fileConfig: {
        allowedFileTypes: ['pdf', 'docx', 'png', 'jpeg'],
        maxFileSizeMb: 10,
      },
    },
    defaultExampleValue: {
      attachmentId: 'asset-sample-101',
      fileName: 'vendor_invoice_Q3.pdf',
      mimeType: 'application/pdf',
      size: 2483920,
      url: '/api/assets/asset-sample-101',
    },
  },

  table: {
    type: 'table',
    title: 'Advanced Business Table V2',
    category: 'business',
    shortDescription: 'Renders multi-row structured grids supporting custom column types, row formula calculations, and footer totals.',
    whenToUse: 'Use for Purchase Requests, Expense Itemization, Budget Line Items, Inventory Audits, or Timesheets.',
    tips: [
      'Minimum Rows: The number of rows automatically available when a user starts filling the table.',
      'Maximum Rows: The maximum number of rows the user can add.',
      'Footer Summary: Automatically calculates totals or summaries from table data (e.g. Grand Total = SUM(Total)).',
      'Each column supports custom types: Text, Number, Currency, Date, Dropdown, Checkbox, or Calculated.',
      'Supports automated row formulas (e.g. Total = Quantity × Unit Cost).',
    ],
    exampleTitle: 'Itemized Expense Table V2',
    exampleComponent: {
      id: 'ex-table',
      type: 'table',
      key: 'itemized_expenses',
      label: 'Itemized Breakdown Table',
      required: true,
      columns: [
        { key: 'item', label: 'Item Description', type: 'text', width: '40%' },
        { key: 'quantity', label: 'Qty', type: 'number', width: '20%' },
        { key: 'unit_cost', label: 'Unit Price ($)', type: 'currency', width: '20%' },
        {
          key: 'total',
          label: 'Total ($)',
          type: 'calculated',
          calculation: { operator: 'multiply', left: { columnKey: 'quantity' }, right: { columnKey: 'unit_cost' } },
        },
      ],
      aggregates: [
        { id: 'agg-sum', label: 'Grand Total', targetColumnKey: 'total', operation: 'SUM', format: 'currency' },
      ],
    },
    defaultExampleValue: [
      { item: 'Dell XPS Workstation Laptop', quantity: 2, unit_cost: 3000, total: 6000 },
      { item: '27-inch 4K Monitor', quantity: 4, unit_cost: 500, total: 2000 },
    ],
  },

  repeating_group: {
    type: 'repeating_group',
    title: 'Repeating Field Group',
    category: 'business',
    shortDescription: 'Allows users to dynamically add, edit, or reorder multiple repeated sub-form item cards during instance execution.',
    whenToUse: 'Use for line items, dependent info, asset sub-lists, or multi-person contact cards.',
    tips: [
      'Encapsulates nested component sets into repeatable rows.',
      'Supports minimum and maximum row limits.',
    ],
    exampleTitle: 'Repeating Dependent Card Group',
    exampleComponent: {
      id: 'ex-rep-group',
      type: 'info_box',
      key: 'dependent_group',
      label: 'Sub-Item Row Card 1',
      description: 'Nested fields: Full Name, Relationship, Contact Phone',
      stylePreset: 'info',
    },
  },

  heading: {
    type: 'heading',
    title: 'Section Heading',
    category: 'content',
    shortDescription: 'Creates a clear document or section title with configurable heading levels, typography styles, and supporting subtitles.',
    whenToUse: 'Use to introduce new topic blocks, form sections (e.g. "Vendor Compliance Details"), or major report headers.',
    tips: [
      'Choose Heading Level: Large Heading (H1), Section (H2), or Subheading (H3).',
      'Add an optional subtitle for immediate user guidance.',
      'Configure font size, alignment, bold/italic, and text color.',
    ],
    exampleTitle: 'Quarterly Operational Review Header',
    exampleComponent: {
      id: 'ex-heading',
      type: 'heading',
      key: 'hdr_sec_1',
      label: 'Quarterly Operational Review',
      description: 'Q3 Business Performance & Expense Breakdown',
      headingConfig: {
        headingLevel: 'h1',
        fontSize: 'large',
        fontWeight: 'bold',
        textColor: 'primary',
        alignment: 'center',
        subtitle: 'Q3 Business Performance & Expense Breakdown',
      },
    },
  },

  paragraph: {
    type: 'paragraph',
    title: 'Rich Paragraph Text',
    category: 'content',
    shortDescription: 'Adds formatted instructions, disclaimers, bullet lists, or safe hyperlink guidance to users filling the document.',
    whenToUse: 'Use for policy disclaimers, step-by-step guidance, bullet lists, or contact information.',
    tips: [
      'Supports safe rich text formatting: Bold, Italic, Bullet Lists, Numbered Lists, and Hyperlinks.',
      'All links are sanitized and open safely with rel="noopener noreferrer".',
    ],
    exampleTitle: 'Important Submission Instructions',
    exampleComponent: {
      id: 'ex-paragraph',
      type: 'paragraph',
      key: 'instructions_block',
      label: 'Please review all item quantities and unit prices carefully <strong>before submission</strong>.<br/><ul><li>Confirm financial values</li><li>Attach supporting invoice PDFs</li><li>Review approval route</li></ul>',
      paragraphConfig: {
        contentHtml: 'Please review all item quantities and unit prices carefully <strong>before submission</strong>.<br/><ul><li>Confirm financial values</li><li>Attach supporting invoice PDFs</li><li>Review approval route</li></ul>',
      },
    },
  },

  divider: {
    type: 'divider',
    title: 'Visual Section Divider',
    category: 'content',
    shortDescription: 'Renders a clean horizontal rule line with configurable line style, thickness, width, and optional label text pill.',
    whenToUse: 'Use between major form sections to create clean visual break points.',
    tips: [
      'Configure line style: Solid, Dashed, or Dotted.',
      'Set thickness (1px, 2px, 4px) and custom width (50%, 75%, 100%).',
    ],
    exampleTitle: 'Dashed Section Divider',
    exampleComponent: {
      id: 'ex-divider',
      type: 'divider',
      key: 'div_1',
      label: 'Approval Sign-off',
      dividerConfig: {
        dividerStyle: 'dashed',
        thickness: 'medium',
        width: 'full',
        alignment: 'center',
      },
    },
  },

  spacer: {
    type: 'spacer',
    title: 'Layout Spacer',
    category: 'content',
    shortDescription: 'Adds configurable vertical whitespace (XS: 8px to XL: 64px) between template components.',
    whenToUse: 'Use to adjust vertical padding and balance form layout hierarchy.',
    tips: [
      'Displays a visual helper box inside Studio, but renders clean invisible space in published reports.',
    ],
    exampleTitle: 'Layout Spacer (24px)',
    exampleComponent: {
      id: 'ex-spacer',
      type: 'spacer',
      key: 'spc_1',
      size: 'medium',
      spacerConfig: {
        spacerSize: 'md',
      },
    },
  },

  image: {
    type: 'image',
    title: 'Image & Brand Asset',
    category: 'content',
    shortDescription: 'Embeds static images, company logos, process diagrams, or safety symbols directly into template definitions.',
    whenToUse: 'Use for organization logos, process diagrams, or header banners.',
    tips: [
      'Configure image width (25%, 50%, 75%, 100%) and alignment.',
      'Template design content only — does not act as a user file upload input.',
    ],
    exampleTitle: 'Company Brand Logo',
    exampleComponent: {
      id: 'ex-image',
      type: 'image',
      key: 'logo_img',
      label: 'Official Corporate Brand Logo',
      assetUrl: '/api/assets/asset-sample-logo',
      caption: 'Official Corporate Operations Header',
      alignment: 'center',
      imageConfig: {
        imageWidth: 'medium',
        alignment: 'center',
        altText: 'Official Corporate Brand Logo',
        fitMode: 'contain',
        caption: 'Official Corporate Operations Header',
      },
    },
  },

  info_box: {
    type: 'info_box',
    title: 'Info / Callout Box',
    category: 'content',
    shortDescription: 'Displays highlighted callout alert boxes with Information (ⓘ), Success (✓), Warning (⚠), Critical (⛔), or Neutral presets.',
    whenToUse: 'Use for critical warnings, policy reminders, SLA notices, or submission instructions.',
    tips: [
      'Select callout preset: Information, Success, Warning, Critical, or Neutral.',
      'Toggle icon visibility on or off as desired.',
    ],
    exampleTitle: 'Approval Policy Warning Notice',
    exampleComponent: {
      id: 'ex-info',
      type: 'info_box',
      key: 'audit_callout',
      label: 'Important Approval Policy',
      description: 'Requests exceeding $50,000 require secondary approval from the Finance Director.',
      stylePreset: 'warning',
      infoBoxConfig: {
        stylePreset: 'warning',
        title: 'Important Approval Policy',
        description: 'Requests exceeding $50,000 require secondary approval from the Finance Director.',
        showIcon: true,
      },
    },
  },

  kpi: {
    type: 'kpi',
    title: 'KPI Metric Block',
    category: 'business',
    shortDescription: 'Displays formatted key performance indicator cards with metric totals and trend badges.',
    whenToUse: 'Use at the top of executive summaries, budget forecasts, or performance reports.',
    tips: ['Includes trend indicators (UP / DOWN / NEUTRAL).'],
    exampleTitle: 'Quarterly Revenue Metric',
    exampleComponent: {
      id: 'ex-kpi',
      type: 'kpi',
      key: 'q3_revenue',
      label: 'Q3 Projected Revenue',
      defaultValue: '$2,450,000',
      kpiConfig: {
        trend: 'up',
        helperText: '+14% vs previous fiscal quarter',
      },
      order: 0,
    },
    defaultExampleValue: '$2,450,000',
  },

  signature: {
    type: 'signature',
    title: 'Report Signature Field',
    category: 'business',
    shortDescription: 'Use Signature when a report should display who submitted or signed the business record.',
    whenToUse: 'Use when a report requires an explicit Sender or Receiver / Reviewer sign-off on the business instance.',
    tips: [
      'Sender Signature: Applied when the report sender explicitly signs and sends the report.',
      'Receiver Signature: Applied when the authorized reviewer explicitly signs the report.',
      'Report signatures are separate from Template Approval.',
      'Each user signs using their own saved private signature profile.',
    ],
    exampleTitle: 'Manager Review Sign-off',
    exampleComponent: {
      id: 'ex-sig',
      type: 'signature',
      key: 'manager_signature',
      label: 'Department Manager Signature',
      signatureConfig: {
        signatureRole: 'Receiver',
        label: 'Reviewed & Approved By',
        showName: true,
        showRole: true,
        showDate: true,
        showSignatureImage: true,
      },
      required: true,
      order: 0,
    },
    defaultExampleValue: {
      name: 'Sarah Mohamed',
      date: '2026-08-25T08:00:00.000Z',
    },
  },

  // System Rail Guides (Logic, Workflow, Themes)
  logic_rules: {
    type: 'logic_rules',
    title: 'Dynamic Conditional Rules',
    category: 'system',
    shortDescription: 'Dynamic rules automatically change component visibility, required state, or enabled state based on user inputs.',
    whenToUse: 'Use when specific fields or sections should only appear under certain conditions (e.g. Total > $50,000).',
    tips: [
      'Format: IF [Field] [Operator] [Value] THEN [Action] [Target Component]',
      'Prevents cluttering reports with unnecessary fields until required.',
    ],
    exampleTitle: 'Conditional Visibility Rule Example',
    exampleComponent: {
      id: 'ex-rule-target',
      type: 'textarea',
      key: 'executive_justification',
      label: 'Executive Justification (Shown when Total > $50,000)',
      required: true,
      description: 'Rule Triggered: IF Total Amount > 50000 THEN SHOW executive_justification',
    },
    defaultExampleValue: 'Required because request total ($75,000) exceeds $50,000 threshold.',
  },

  logic_calculations: {
    type: 'logic_calculations',
    title: 'Field Calculation Engine',
    category: 'system',
    shortDescription: 'Calculations automatically compute field values from other numeric or currency components.',
    whenToUse: 'Use for Grand Totals, Subtotals, Tax calculations, or Risk Score formulas.',
    tips: [
      'Format: Target Field = Operand A [ Operator ] Operand B',
      'Evaluated safely in real time without eval() or new Function().',
      'Includes automatic DFS circular dependency detection.',
    ],
    exampleTitle: 'Grand Total Calculation Example',
    exampleComponent: {
      id: 'ex-calc-target',
      type: 'currency',
      key: 'grand_total',
      label: 'Calculated Grand Total ($)',
      description: 'Formula: Subtotal + Shipping Cost',
    },
    defaultExampleValue: 75000.0,
  },

  workflow: {
    type: 'workflow',
    title: 'Dynamic Workflow Builder',
    category: 'system',
    shortDescription: 'Workflows define how filled report instances move through multi-stage review and executive approval paths.',
    whenToUse: 'Use to configure organizational approval paths without writing custom code.',
    tips: [
      'Stages: Employee Submit → Manager Review → Director Approval → Verified Digital Signature.',
      'Supports conditional routing: e.g. IF Total > $50,000 route to Director Approval.',
      'Maintains immutable snapshots of workflow definitions when template versions are published.',
    ],
    exampleTitle: 'CapEx Approval Workflow Stage',
    exampleComponent: {
      id: 'ex-wf-stage',
      type: 'info_box',
      key: 'wf_stage_preview',
      label: 'Workflow Stage 2: Manager Review',
      description: 'Assigned to: Sarah Mohamed (user-manager). Status: Pending Sign-off.',
    },
  },
};
