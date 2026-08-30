import type { ReportTemplateField, TemplateComponent } from '../../types/index.js';

export const resolveAssetUrl = (rawUrl?: string, rawAssetId?: string): string => {
  if (rawUrl) {
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/api/assets/')) {
      return rawUrl;
    }
    if (rawUrl.startsWith('asset-')) {
      return `/api/assets/${rawUrl}`;
    }
    return rawUrl;
  }
  if (rawAssetId) {
    return rawAssetId.startsWith('/api/assets/') ? rawAssetId : `/api/assets/${rawAssetId}`;
  }
  return '';
};

export const getSpacerHeightPx = (component: ReportTemplateField | TemplateComponent): number => {
  const sConf = (component as any).spacerConfig || {};
  
  if (typeof sConf.heightPx === 'number' && !isNaN(sConf.heightPx)) {
    return Math.min(Math.max(Math.round(sConf.heightPx), 4), 200);
  }
  
  const size = sConf.spacerSize || component.size || 'md';
  const heightPresetMap: Record<string, number> = {
    xs: 8,
    extra_small: 8,
    sm: 16,
    small: 16,
    md: 32,
    medium: 32,
    lg: 48,
    large: 48,
    xl: 72,
    extra_large: 72,
  };

  return heightPresetMap[size] || 32;
};
