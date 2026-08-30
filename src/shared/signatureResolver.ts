import type { TemplateComponent, ReportSignatureRecord } from '../types/index.js';

export function resolveReportSignatureForComponent({
  component,
  activeSignatures = [],
  signatureHistory = [],
  activeSignature = null,
}: {
  component: TemplateComponent;
  activeSignatures?: ReportSignatureRecord[];
  signatureHistory?: ReportSignatureRecord[];
  activeSignature?: ReportSignatureRecord | null;
}): ReportSignatureRecord | null {
  if (activeSignature) return activeSignature;

  const rawRole = component.signatureConfig?.signatureRole || (component as any).signatureRole || 'Sender';
  const canonicalRole = String(rawRole).toLowerCase();

  // 1. Direct Component ID or Key match among active signatures
  let match = activeSignatures.find(
    (s) =>
      s.isActive !== false &&
      ((Boolean(s.componentId) && s.componentId === component.id) ||
        (Boolean(s.componentKey) && s.componentKey === component.key))
  );

  if (match) return match;

  // 2. Role-based fallback match among active signatures
  match = activeSignatures.find(
    (s) => s.isActive !== false && String(s.signatureRole).toLowerCase() === canonicalRole
  );

  if (match) return match;

  // 3. Fallback search in signatureHistory (active entries only)
  match = signatureHistory.find(
    (s) =>
      s.isActive !== false &&
      ((Boolean(s.componentId) && s.componentId === component.id) ||
        (Boolean(s.componentKey) && s.componentKey === component.key) ||
        String(s.signatureRole).toLowerCase() === canonicalRole)
  );

  return match || null;
}

export function normalizeReportDataForEditing(
  rawReportData: Record<string, any> = {},
  template?: any
): Record<string, any> {
  if (!rawReportData) return {};
  if (!template) return { ...rawReportData };

  const comps: Array<any> = [];
  if (template.components) comps.push(...template.components);
  if (template.fields) comps.push(...template.fields);
  if (template.dynamicSections) {
    template.dynamicSections.forEach((sec: any) => {
      if (sec.components) comps.push(...sec.components);
    });
  }

  if (comps.length === 0) return { ...rawReportData };

  const normalized: Record<string, any> = {};

  comps.forEach((comp) => {
    const canonicalKey = comp.key || comp.id;
    const compId = comp.id;
    const compKey = comp.key;

    let resolvedVal: any = undefined;

    if (rawReportData[canonicalKey] !== undefined) {
      resolvedVal = rawReportData[canonicalKey];
    } else if (compKey && rawReportData[compKey] !== undefined) {
      resolvedVal = rawReportData[compKey];
    } else if (compId && rawReportData[compId] !== undefined) {
      resolvedVal = rawReportData[compId];
    } else {
      let cur = compId;
      while (cur && cur.includes('-')) {
        cur = cur.substring(cur.indexOf('-') + 1);
        if (rawReportData[cur] !== undefined) {
          resolvedVal = rawReportData[cur];
          break;
        }
      }
    }

    if (resolvedVal !== undefined) {
      normalized[canonicalKey] = resolvedVal;
    }
  });

  return normalized;
}
