import { COMPONENT_REGISTRY } from './componentRegistry.js';

export const valueCodec = {
  encodeComponentValue(component: any, value: any): { valueText: string | null; valueNumber: number | null } {
    if (value === undefined || value === null || value === '') {
      return { valueText: null, valueNumber: null };
    }

    const type = component.type || 'text';
    const meta = COMPONENT_REGISTRY[type];

    if (meta?.dataKind === 'number' && typeof value === 'number') {
      return { valueText: null, valueNumber: value };
    }

    if (typeof value === 'object') {
      return { valueText: JSON.stringify(value), valueNumber: null };
    }

    return { valueText: String(value), valueNumber: null };
  },

  decodeComponentValue(component: any, storedText: string | null, storedNumber: number | null): any {
    if (storedNumber !== null && storedNumber !== undefined) {
      return storedNumber;
    }

    if (storedText === null || storedText === undefined || storedText === '') {
      return undefined;
    }

    const type = component?.type || 'text';
    const meta = COMPONENT_REGISTRY[type];

    if ((meta?.dataKind === 'array' || meta?.dataKind === 'object' || storedText.startsWith('{') || storedText.startsWith('['))) {
      try {
        return JSON.parse(storedText);
      } catch {
        return storedText;
      }
    }

    if (type === 'checkbox') {
      return storedText === 'true' || storedText === '1';
    }

    return storedText;
  },

  validateComponentValue(component: any, value: any): { valid: boolean; message?: string } {
    if (value === undefined || value === null || value === '') {
      if (component.required && component.type !== 'heading' && component.type !== 'paragraph' && component.type !== 'divider' && component.type !== 'spacer') {
        return { valid: false, message: `Field "${component.label || component.key}" is required.` };
      }
      return { valid: true };
    }

    if (component.type === 'table') {
      if (!Array.isArray(value)) {
        return { valid: false, message: `Table "${component.label}" requires an array of row entries.` };
      }
      if (component.minRows && value.length < component.minRows) {
        return { valid: false, message: `Table "${component.label}" requires at least ${component.minRows} row(s).` };
      }
    }

    return { valid: true };
  },
};
