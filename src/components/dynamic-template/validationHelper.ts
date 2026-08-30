import type { WidgetTemplate, ReportTemplateField, TemplateComponent } from '../../types';

export function validateTemplateValues(
  template: WidgetTemplate | { fields?: ReportTemplateField[]; components?: TemplateComponent[] },
  values: Record<string, any>
): Record<string, string> {
  const errors: Record<string, string> = {};
  const fields = template.components || template.fields || [];

  fields.forEach((f) => {
    // Skip static heading/paragraph components
    if (f.type === 'heading' || f.type === 'paragraph') return;

    const fieldKey = f.key || f.id;
    const rawValue = values[fieldKey] !== undefined ? values[fieldKey] : values[f.id];
    const valStr = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';

    // 1. Required Check
    if (f.required) {
      if (f.type === 'checkbox') {
        if (!rawValue) {
          errors[fieldKey] = `${f.label || fieldKey} must be checked.`;
        }
      } else if (!valStr) {
        errors[fieldKey] = `${f.label || fieldKey} is required.`;
      }
    }

    if (!valStr) return; // Skip further numeric/pattern checks if empty and optional

    const validation = f.validation;
    if (!validation) return;

    // 2. Numeric Min / Max
    if (f.type === 'number' || f.type === 'currency' || f.type === 'percentage') {
      const num = Number(rawValue);
      if (!isNaN(num)) {
        if (validation.min !== undefined && num < validation.min) {
          errors[fieldKey] = `${f.label || fieldKey} must be at least ${validation.min}.`;
        }
        if (validation.max !== undefined && num > validation.max) {
          errors[fieldKey] = `${f.label || fieldKey} cannot exceed ${validation.max}.`;
        }
      }
    }

    // 3. String Length MinLength / MaxLength
    if (f.type === 'text' || f.type === 'textarea') {
      if (validation.minLength !== undefined && valStr.length < validation.minLength) {
        errors[fieldKey] = `${f.label || fieldKey} must be at least ${validation.minLength} characters.`;
      }
      if (validation.maxLength !== undefined && valStr.length > validation.maxLength) {
        errors[fieldKey] = `${f.label || fieldKey} cannot exceed ${validation.maxLength} characters.`;
      }
    }

    // 4. Pattern Regex
    if (validation.pattern) {
      try {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(valStr)) {
          errors[fieldKey] = `${f.label || fieldKey} has an invalid format.`;
        }
      } catch {
        // Ignore invalid regex
      }
    }
  });

  return errors;
}
