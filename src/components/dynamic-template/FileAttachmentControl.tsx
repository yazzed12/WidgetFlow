import React, { useState, useRef } from 'react';
import type { TemplateComponent } from '../../types/index.js';
import { UploadCloud, Trash2, ExternalLink, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface FileAttachmentControlProps {
  component: TemplateComponent;
  value: any;
  mode: 'edit' | 'readOnly';
  onChange?: (key: string, val: any) => void;
  disabled?: boolean;
  error?: string;
}

export const FileAttachmentControl: React.FC<FileAttachmentControlProps> = ({
  component,
  value,
  mode,
  onChange,
  disabled,
  error,
}) => {
  const fieldKey = component.key || component.id;
  const fileConfig = component.fileConfig || {};
  const allowedTypes = fileConfig.allowedFileTypes || ['pdf', 'docx', 'xlsx', 'png', 'jpeg'];
  const maxMb = fileConfig.maxFileSizeMb || 10;

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Normalize attachment object
  const attachment =
    typeof value === 'object' && value !== null
      ? value
      : typeof value === 'string' && value.trim()
      ? { fileName: value, url: value.startsWith('/api/') ? value : `/api/assets/${value}` }
      : null;

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelected = async (file: File) => {
    setUploadError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // Extension Check
    if (allowedTypes.length > 0 && !allowedTypes.includes(ext) && !allowedTypes.includes('*')) {
      setUploadError(`File extension .${ext} is not allowed. Supported: ${allowedTypes.join(', ')}.`);
      return;
    }

    // Size Check
    if (file.size > maxMb * 1024 * 1024) {
      setUploadError(`File size exceeds maximum allowed limit of ${maxMb}MB.`);
      return;
    }

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await fetch('/api/assets/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data,
          }),
        });

        const json = await res.json();
        setIsUploading(false);

        if (json.success && json.data) {
          const payload = {
            attachmentId: json.data.id,
            fileName: file.name,
            mimeType: json.data.mimeType || file.type,
            size: file.size,
            url: json.data.url,
          };
          if (onChange) onChange(fieldKey, payload);
        } else {
          setUploadError(json.error?.message || json.message || 'Upload failed');
        }
      };

      reader.onerror = () => {
        setIsUploading(false);
        setUploadError('Failed to read selected file');
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setIsUploading(false);
      setUploadError(err.message || 'Network error during upload');
    }
  };

  const handleRemove = () => {
    if (disabled || mode === 'readOnly') return;
    if (onChange) onChange(fieldKey, null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (mode === 'readOnly') {
    if (!attachment) {
      return <span className="text-slate-400 italic text-xs">No attachment uploaded</span>;
    }

    const isImage = attachment.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(attachment.fileName || '');

    return (
      <div className="p-3 bg-white border border-slate-200 rounded-2xl space-y-2 max-w-md shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs text-slate-900 truncate block">
                {attachment.fileName || 'Attachment Document'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono block">
                {formatSize(attachment.size)} {attachment.mimeType ? `• ${attachment.mimeType}` : ''}
              </span>
            </div>
          </div>

          {attachment.url && (
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1 shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Download
            </a>
          )}
        </div>

        {isImage && attachment.url && (
          <div className="pt-2 border-t border-slate-100">
            <img
              src={attachment.url}
              alt={attachment.fileName || 'Attachment preview'}
              className="max-h-48 rounded-xl border border-slate-200 object-contain bg-slate-50"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        ref={fileInputRef}
        disabled={disabled || isUploading}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {attachment ? (
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-xs text-slate-900 truncate block">
                {attachment.fileName || 'Attached File'}
              </span>
              <span className="text-[10px] font-mono text-slate-400 block">
                {formatSize(attachment.size)} {attachment.mimeType ? `• ${attachment.mimeType}` : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 text-indigo-600 hover:bg-indigo-50 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={handleRemove}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (disabled || isUploading) return;
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileSelected(e.dataTransfer.files[0]);
            }
          }}
          className={`p-6 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer ${
            disabled
              ? 'bg-slate-100 border-slate-300 cursor-not-allowed'
              : isUploading
              ? 'bg-indigo-50/50 border-indigo-300'
              : error || uploadError
              ? 'bg-rose-50/50 border-rose-300'
              : 'bg-slate-50/70 border-slate-300 hover:bg-indigo-50/30 hover:border-indigo-400'
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs text-indigo-600">
              <UploadCloud className="w-6 h-6" />
            </div>
            {isUploading ? (
              <span className="text-xs font-bold text-indigo-700">Uploading file...</span>
            ) : (
              <>
                <div className="text-xs font-bold text-slate-800">
                  Drag a file here or <span className="text-indigo-600 underline">Choose File</span>
                </div>
                <span className="text-[10px] font-medium text-slate-400">
                  Allowed: {allowedTypes.join(', ').toUpperCase()} (Max {maxMb} MB)
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {(uploadError || error) && (
        <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium pt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{uploadError || error}</span>
        </div>
      )}
    </div>
  );
};
