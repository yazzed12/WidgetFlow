import React, { useState, useRef, useEffect } from 'react';
import { X, Check, Trash2, Upload, PenTool, Type, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { UserSignatureProfile, User } from '../../types';
import { apiService } from '../../services/apiService';

interface UserSignatureSettingsModalProps {
  currentUser: User;
  onClose: () => void;
  onSaved?: (profile: UserSignatureProfile) => void;
}

export const UserSignatureSettingsModal: React.FC<UserSignatureSettingsModalProps> = ({
  currentUser,
  onClose,
  onSaved,
}) => {
  const [activeMethod, setActiveMethod] = useState<'drawn' | 'typed' | 'uploaded'>('typed');
  const [typedName, setTypedName] = useState(currentUser.name || '');
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  const [assetRef, setAssetRef] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmChange, setShowConfirmChange] = useState(false);
  const [existingProfile, setExistingProfile] = useState<UserSignatureProfile | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load existing profile
  useEffect(() => {
    let isMounted = true;
    apiService
      .getUserSignatureProfile()
      .then((prof) => {
        if (isMounted && prof) {
          setExistingProfile(prof);
          if (prof.method) setActiveMethod(prof.method);
          if (prof.typedName) setTypedName(prof.typedName);
          if (prof.drawingReference) setDrawingDataUrl(prof.drawingReference);
          if (prof.assetReference) setAssetRef(prof.assetReference);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize Canvas for Drawing
  useEffect(() => {
    if (activeMethod === 'drawn' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#1e1b4b'; // Deep Indigo
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (drawingDataUrl) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = drawingDataUrl;
        }
      }
    }
  }, [activeMethod]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      setDrawingDataUrl(canvasRef.current.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setDrawingDataUrl(null);
  };

  const [uploadAttestationAccepted, setUploadAttestationAccepted] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadAttestationAccepted) {
      setErrorMessage('You must accept the user attestation checkbox before uploading a signature image.');
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Invalid file format. Only PNG, JPEG, or WebP signature images are permitted (SVG, PDF, GIF, and executable files disabled for security).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Signature image must be smaller than 5MB.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await apiService.uploadSignatureAsset({
          filename: file.name,
          mimeType: file.type,
          base64Data,
          attestationAccepted: true,
        });
        setAssetRef(res.url);
        setErrorMessage(null);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload signature image.');
    }
  };

  const performSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage(null);

      if (activeMethod === 'typed' && (!typedName || !typedName.trim())) {
        setErrorMessage('Please enter your legal display name for your Typed Signature.');
        return;
      }
      if (activeMethod === 'drawn' && !drawingDataUrl) {
        setErrorMessage('Please draw your signature on the canvas before saving.');
        return;
      }
      if (activeMethod === 'uploaded') {
        if (!uploadAttestationAccepted) {
          setErrorMessage('You must confirm the signature ownership attestation before saving an uploaded signature.');
          return;
        }
        if (!assetRef) {
          setErrorMessage('Please upload a valid signature image file before saving.');
          return;
        }
      }

      const savedProf = await apiService.saveUserSignatureProfile({
        method: activeMethod,
        typedName: typedName.trim(),
        drawingReference: drawingDataUrl || undefined,
        assetReference: assetRef || undefined,
      });

      if (onSaved) onSaved(savedProf);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save signature profile.');
    } finally {
      setIsSaving(false);
      setShowConfirmChange(false);
    }
  };

  const handleSaveClick = () => {
    if (existingProfile && existingProfile.method) {
      setShowConfirmChange(true);
    } else {
      performSave();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider">My Saved Signature Profile</h2>
              <p className="text-[11px] text-slate-400">Configure your personal report signature for WidgetFlow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">
              {errorMessage}
            </div>
          )}

          {/* User Identity Info */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Account Owner</span>
              <p className="text-xs font-bold text-slate-900">{currentUser.name} ({currentUser.role})</p>
            </div>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              Private Profile
            </span>
          </div>

          {/* Method Picker Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveMethod('typed')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeMethod === 'typed' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Typed</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMethod('drawn')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeMethod === 'drawn' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Drawn</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMethod('uploaded')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeMethod === 'uploaded' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Image</span>
            </button>
          </div>

          {/* Method Content */}
          {activeMethod === 'typed' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Full Legal Display Name</label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="e.g. Ahmed Hassan"
                  className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              {/* Typed Signature Formal Representation Preview */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Typed Signature Preview</span>
                <div className="py-3 px-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
                  <p className="font-serif italic text-2xl text-indigo-950 font-extrabold tracking-wide">
                    {typedName || 'Your Name Here'}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  Explicitly stored and rendered as a formal <strong className="text-slate-700">Typed Signature</strong>.
                </p>
              </div>
            </div>
          )}

          {activeMethod === 'drawn' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Draw Signature Canvas</span>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-[11px] text-rose-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-white overflow-hidden relative">
                <canvas
                  ref={canvasRef}
                  width={440}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-[150px] touch-none cursor-crosshair"
                />
                {!drawingDataUrl && !isDrawing && (
                  <div className="absolute inset-0 pointer-events-[#none] flex items-center justify-center text-slate-400 text-xs italic">
                    Use mouse, touch, or stylus to draw signature here
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMethod === 'uploaded' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-800">Upload Signature Image</span>

              {/* Mandatory Attestation Checkbox */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5">
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={uploadAttestationAccepted}
                    onChange={(e) => setUploadAttestationAccepted(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 shrink-0"
                  />
                  <span className="font-semibold text-slate-900 leading-tight">
                    I confirm that this image represents my own signature and that I am authorized to use it.
                  </span>
                </label>
              </div>

              <div className={`p-6 border-2 border-dashed rounded-2xl text-center transition-colors ${
                !uploadAttestationAccepted
                  ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                  : 'bg-slate-50 border-slate-300 hover:border-indigo-500 cursor-pointer'
              }`}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  disabled={!uploadAttestationAccepted}
                  className="hidden"
                  id="sig-file-input"
                />
                <label htmlFor="sig-file-input" className={`space-y-2 block ${!uploadAttestationAccepted ? 'pointer-events-none' : 'cursor-pointer'}`}>
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">Click to choose image file</p>
                  <p className="text-[11px] text-slate-500">Supports PNG (transparent preferred), JPEG, or WebP up to 5MB (Min 100x30, Max 3000x1500)</p>
                </label>
              </div>

              {assetRef && (
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Uploaded Signature Preview</span>
                  <img src={assetRef} alt="Uploaded Signature" className="max-h-20 mx-auto object-contain" />
                </div>
              )}
            </div>
          )}

          {/* Privacy & Security Note */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-indigo-950 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              Your signature profile is securely tied to your user account (<strong className="text-indigo-900">{currentUser.name}</strong>). It will only be applied to reports after your explicit confirmation.
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Signature Profile'}</span>
          </button>
        </div>
      </div>

      {/* Signature Change Confirmation Dialog */}
      {showConfirmChange && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-extrabold uppercase text-slate-900">Update Saved Signature Profile?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Changing your saved signature will affect future report signatures only. Existing signed reports will retain their historical signature audit record and Verification ID.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmChange(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performSave}
                className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl cursor-pointer"
              >
                Confirm & Update Signature
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
