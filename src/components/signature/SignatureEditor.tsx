import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Undo2, Upload, Check, X } from 'lucide-react';

export type SignatureFontKey = 'signature_default' | 'signature_elegant' | 'signature_classic' | 'signature_handwritten';
export type SignatureDrawingPoint = { x: number; y: number; pressure?: number; t?: number };
export type SignatureDrawingData = { version: 1; strokes: SignatureDrawingPoint[][] };
export type SignatureEditorValue =
  | { method: 'typed'; typedName: string; typedFontKey: SignatureFontKey }
  | { method: 'drawn'; drawingData: SignatureDrawingData }
  | { method: 'uploaded'; sourceFileName: string; extractionVersion: 'signature_extract_v1'; extractedBlob: Blob; previewUrl?: string };

export interface SignatureEditorProps {
  value?: SignatureEditorValue;
  onChange?: (value: SignatureEditorValue | null) => void;
  onConfirm?: (value: SignatureEditorValue) => void;
  onCancel?: () => void;
  defaultName?: string;
  disabled?: boolean;
  required?: boolean;
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const FONT_LABELS: Record<SignatureFontKey, string> = {
  signature_default: 'Default', signature_elegant: 'Elegant', signature_classic: 'Classic', signature_handwritten: 'Handwritten',
};
const FONT_STACKS: Record<SignatureFontKey, string> = {
  signature_default: 'cursive', signature_elegant: '"Brush Script MT", cursive', signature_classic: 'Georgia, serif', signature_handwritten: '"Comic Sans MS", cursive',
};
export const getSignatureFontFamily = (key?: string) => FONT_STACKS[normalizeFontKey(key)];
const FONT_KEYS = new Set<SignatureFontKey>(Object.keys(FONT_LABELS) as SignatureFontKey[]);
const normalizeFontKey = (key: unknown): SignatureFontKey => FONT_KEYS.has(key as SignatureFontKey) ? key as SignatureFontKey : 'signature_default';

const asCanvasPoint = (canvas: HTMLCanvasElement, event: React.PointerEvent<HTMLCanvasElement>): SignatureDrawingPoint => {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)), pressure: event.pressure || undefined, t: Date.now() };
};

const drawStrokes = (canvas: HTMLCanvasElement, strokes: SignatureDrawingPoint[][]) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.strokeStyle = '#1e1b4b'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.4;
  strokes.forEach((stroke) => {
    if (!stroke.length) return;
    ctx.beginPath(); ctx.moveTo(stroke[0].x * rect.width, stroke[0].y * rect.height);
    stroke.slice(1).forEach((point) => ctx.lineTo(point.x * rect.width, point.y * rect.height));
    ctx.stroke();
  });
};

const extractSignature = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width < 2 || bitmap.height < 2 || bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 16_000_000) { bitmap.close(); throw new Error('Image dimensions are too large to process safely.'); }
  const source = document.createElement('canvas'); source.width = bitmap.width; source.height = bitmap.height;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true }); if (!sourceCtx) throw new Error('Image processing is unavailable.');
  sourceCtx.drawImage(bitmap, 0, 0); bitmap.close();
  const image = sourceCtx.getImageData(0, 0, source.width, source.height); const { data, width, height } = image;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4; const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const alpha = data[i + 3]; const ink = alpha > 16 && luminance < 235;
    if (ink) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  if (maxX < minX || maxY < minY) throw new Error('No visible signature ink was detected.');
  const pad = Math.max(4, Math.round(Math.max(width, height) * 0.03)); const left = Math.max(0, minX - pad); const top = Math.max(0, minY - pad); const right = Math.min(width - 1, maxX + pad); const bottom = Math.min(height - 1, maxY + pad);
  const output = document.createElement('canvas'); output.width = right - left + 1; output.height = bottom - top + 1;
  const outputCtx = output.getContext('2d', { willReadFrequently: true }); if (!outputCtx) throw new Error('Image processing is unavailable.');
  const cropped = sourceCtx.getImageData(left, top, output.width, output.height);
  let meaningfulInk = 0;
  for (let i = 0; i < cropped.data.length; i += 4) { const luminance = 0.299 * cropped.data[i] + 0.587 * cropped.data[i + 1] + 0.114 * cropped.data[i + 2]; const alpha = cropped.data[i + 3]; cropped.data[i + 3] = alpha < 16 || luminance > 235 ? 0 : Math.min(255, Math.max(0, Math.round((235 - luminance) * 3.2))); if (cropped.data[i + 3] > 32) meaningfulInk += 1; }
  if (meaningfulInk < 3) throw new Error('No meaningful signature ink was detected.');
  outputCtx.putImageData(cropped, 0, 0);
  return new Promise((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Signature extraction failed.')), 'image/png'));
};

export const SignatureEditor: React.FC<SignatureEditorProps> = ({ value, onChange, onConfirm, onCancel, defaultName = '', disabled = false, required = false }) => {
  const [mode, setMode] = useState<'typed' | 'drawn' | 'uploaded'>(value?.method || 'typed');
  const [typedName, setTypedName] = useState(value?.method === 'typed' ? value.typedName : defaultName);
  const [fontKey, setFontKey] = useState<SignatureFontKey>(value?.method === 'typed' ? normalizeFontKey(value.typedFontKey) : 'signature_default');
  const [strokes, setStrokes] = useState<SignatureDrawingPoint[][]>(value?.method === 'drawn' ? value.drawingData.strokes : []);
  const [uploadValue, setUploadValue] = useState<Extract<SignatureEditorValue, { method: 'uploaded' }> | null>(value?.method === 'uploaded' ? value : null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | undefined>(undefined);
  const [drawing, setDrawing] = useState(false); const [error, setError] = useState<string | null>(null); const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewUrlRef = useRef<string | undefined>(uploadValue?.previewUrl);
  const originalPreviewUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => { const canvas = canvasRef.current; if (!canvas) return; const redraw = () => drawStrokes(canvas, strokes); redraw(); window.addEventListener('resize', redraw); return () => window.removeEventListener('resize', redraw); }, [strokes, mode]);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); if (originalPreviewUrlRef.current) URL.revokeObjectURL(originalPreviewUrlRef.current); }, []);
  const publicUploadValue = useMemo(() => uploadValue ? (({ previewUrl: _previewUrl, ...persistable }) => persistable)(uploadValue) : null, [uploadValue]);
  useEffect(() => { if (mode === 'typed') onChange?.({ method: 'typed', typedName, typedFontKey: normalizeFontKey(fontKey) }); else if (mode === 'drawn') onChange?.({ method: 'drawn', drawingData: { version: 1, strokes } }); else if (publicUploadValue) onChange?.(publicUploadValue); }, [mode, typedName, fontKey, strokes, publicUploadValue, onChange]);

  const changeMode = (next: 'typed' | 'drawn' | 'uploaded') => { setMode(next); setError(null); };
  const handleFile = async (file?: File) => {
    if (!file) return; setError(null);
    if (!ACCEPTED_TYPES.has(file.type)) { setError('Choose a PNG, JPG, JPEG, or WEBP image.'); return; }
    if (file.size > MAX_IMPORT_BYTES) { setError('Signature images must be 10MB or smaller.'); return; }
    try { const blob = await extractSignature(file); if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); if (originalPreviewUrlRef.current) URL.revokeObjectURL(originalPreviewUrlRef.current); const previewUrl = URL.createObjectURL(blob); const originalUrl = URL.createObjectURL(file); previewUrlRef.current = previewUrl; originalPreviewUrlRef.current = originalUrl; setOriginalPreviewUrl(originalUrl); setUploadValue({ method: 'uploaded', sourceFileName: file.name, extractionVersion: 'signature_extract_v1', extractedBlob: blob, previewUrl }); } catch (err: any) { setUploadValue(null); setError(err?.message || 'Unable to extract a signature from this image.'); }
  };
  const currentValue: SignatureEditorValue | null = mode === 'typed' ? { method: 'typed', typedName, typedFontKey: normalizeFontKey(fontKey) } : mode === 'drawn' ? { method: 'drawn', drawingData: { version: 1, strokes } } : publicUploadValue;
  const hasMeaningfulDrawing = strokes.some((stroke) => stroke.length > 1 && stroke.some((point, index) => index > 0 && Math.hypot(point.x - stroke[index - 1].x, point.y - stroke[index - 1].y) > 0.002));
  const submit = () => { if (required && (!currentValue || (currentValue.method === 'typed' && !currentValue.typedName.trim()) || (currentValue.method === 'drawn' && !hasMeaningfulDrawing))) { setError('A signature is required.'); return; } if (!currentValue) { setError('Add a signature before continuing.'); return; } onConfirm?.(currentValue); };

  return <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
    <div className="flex gap-2 border-b border-slate-200 pb-3">{(['typed', 'drawn', 'uploaded'] as const).map((tab) => <button key={tab} type="button" disabled={disabled} onClick={() => changeMode(tab)} className={`px-3 py-2 text-xs font-bold rounded-lg ${mode === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{tab === 'uploaded' ? 'Import' : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
    {mode === 'typed' && <div className="space-y-3"><label className="block text-xs font-bold text-slate-800">Signature name<input disabled={disabled} value={typedName} onChange={(e) => setTypedName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="block text-xs font-bold text-slate-800">Font<select disabled={disabled} value={fontKey} onChange={(e) => setFontKey(e.target.value as SignatureFontKey)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">{Object.entries(FONT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-4xl text-indigo-950" style={{ fontFamily: FONT_STACKS[fontKey] }}>{typedName || 'Your signature'}</div></div>}
    {mode === 'drawn' && <div className="space-y-3"><div className="overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50"><canvas ref={canvasRef} className="h-48 w-full touch-none" onPointerDown={(e) => { if (disabled) return; const canvas = canvasRef.current; if (!canvas) return; const point = asCanvasPoint(canvas, e); e.currentTarget.setPointerCapture(e.pointerId); setDrawing(true); setStrokes((prev) => [...prev, [point]]); }} onPointerMove={(e) => { if (!drawing) return; const canvas = canvasRef.current; if (!canvas) { setDrawing(false); return; } const point = asCanvasPoint(canvas, e); setStrokes((prev) => { const next = prev.slice(); if (!next.length) return next; next[next.length - 1] = [...(next[next.length - 1] || []), point]; return next; }); }} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)} onLostPointerCapture={() => setDrawing(false)} /></div><div className="flex gap-2"><button type="button" disabled={disabled || strokes.length === 0} onClick={() => setStrokes((prev) => prev.slice(0, -1))} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold"><Undo2 className="h-3.5 w-3.5" />Undo</button><button type="button" disabled={disabled || strokes.length === 0} onClick={() => setStrokes([])} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold"><Eraser className="h-3.5 w-3.5" />Clear</button></div></div>}
    {mode === 'uploaded' && <div className="space-y-3"><label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]); }}><Upload className="h-6 w-6 text-indigo-600" /><span className="text-xs font-bold text-slate-700">Drop a signature image here or click to upload</span><span className="text-[11px] text-slate-500">PNG, JPG/JPEG, WEBP · max 10MB</span><input disabled={disabled} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} /></label>{uploadValue?.previewUrl && <div className="grid grid-cols-2 gap-3 text-center text-[11px] font-bold text-slate-600"><div><p>Original image</p><img src={originalPreviewUrl} alt="Original signature image" className="mt-1 h-24 w-full rounded-lg border border-slate-200 bg-white object-contain" /></div><div><p>Extracted signature</p><img src={uploadValue.previewUrl} alt="Extracted signature preview" className="mt-1 h-24 w-full rounded-lg border border-slate-200 bg-white object-contain" /></div></div>}</div>}
    {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
    {(onCancel || onConfirm) && <div className="flex justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"><X className="h-3.5 w-3.5" />Cancel</button>{onConfirm && <button type="button" disabled={disabled} onClick={submit} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" />Use Signature</button>}</div>}
  </div>;
};
