import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { SignatureEditorValue } from '../../components/signature/SignatureEditor';

export interface MySignatureProfile { id: string; userId: string; method: 'typed' | 'drawn' | 'uploaded'; typedName?: string; typedFontKey?: string; drawingData?: any; signatureAssetId?: string; sourceImageFilename?: string; extractionVersion?: string; isActive: boolean; updatedAt?: string; }
const mapProfile = (row: any): MySignatureProfile | null => row ? ({ id: row.id, userId: row.user_id, method: row.signature_method, typedName: row.typed_name ?? undefined, typedFontKey: row.typed_font_key ?? undefined, drawingData: row.drawing_data ?? undefined, signatureAssetId: row.signature_asset_id ?? undefined, sourceImageFilename: row.source_image_filename ?? undefined, extractionVersion: row.extraction_version ?? undefined, isActive: Boolean(row.is_active), updatedAt: row.updated_at }) : null;
const bucketName = 'widgetflow-signatures';
const assetPaths = new Map<string, string>();
const sha256Hex = async (blob: Blob) => { const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); };
export const signatureService = {
  async getMySignatureProfile() { const { data, error } = await getSupabaseBrowserClient().rpc('get_my_signature_profile'); if (error) throw new Error(error.message); return mapProfile(data); },
  async saveMySignatureProfile(signature: any) { const { data, error } = await getSupabaseBrowserClient().rpc('save_my_signature_profile', { p_signature: signature }); if (error) throw new Error(error.message); return mapProfile(data); },
  async saveImportedSignatureProfile(signature: Extract<SignatureEditorValue, { method: 'uploaded' }>) {
    const client = getSupabaseBrowserClient();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) throw new Error('Your authenticated session is required to save an imported signature.');
    const objectPath = `signatures/${user.id}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await client.storage.from(bucketName).upload(objectPath, signature.extractedBlob, { contentType: 'image/png', upsert: false });
    if (uploadError) throw new Error(`Signature upload failed: ${uploadError.message}`);
    const contentHash = await sha256Hex(signature.extractedBlob);
    const { data: assetId, error: registerError } = await client.rpc('register_my_signature_asset', {
      p_object_path: objectPath,
      p_original_filename: signature.sourceFileName,
      p_byte_size: signature.extractedBlob.size,
      p_content_hash: contentHash,
      p_extraction_version: signature.extractionVersion,
    });
    if (registerError || !assetId) throw new Error(`Signature asset registration failed: ${registerError?.message || 'No asset id was returned.'}`);
    const profile = await this.saveMySignatureProfile({ method: 'uploaded', signatureAssetId: assetId, extractionVersion: signature.extractionVersion });
    if (assetId) assetPaths.set(assetId, objectPath);
    return { profile, previewUrl: assetId ? await this.createPrivatePreviewUrl(assetId) : undefined };
  },
  async createPrivatePreviewUrl(assetId: string) { const path = assetPaths.get(assetId); if (!path) return undefined; const { data, error } = await getSupabaseBrowserClient().storage.from(bucketName).createSignedUrl(path, 60); if (error) throw new Error(`Signature preview unavailable: ${error.message}`); return data.signedUrl; },
  async resolveMySignaturePreview() { const { data, error } = await getSupabaseBrowserClient().functions.invoke('signature-asset-preview', { body: {} }); if (error) throw new Error(error.message); return (data as any)?.data?.signedUrl as string | undefined; },
  async resolveReportSignaturePreview(reportId: string, signatureAssetId: string) { const { data, error } = await getSupabaseBrowserClient().functions.invoke('report-signature-asset-preview', { body: { reportId, signatureAssetId } }); if (error) throw new Error(error.message); return (data as any)?.data?.signedUrl as string | undefined; },
};
