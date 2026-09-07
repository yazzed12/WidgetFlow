import { verifyCaller } from '../_shared/auth.ts';
import { ApiError, databaseError, failure, preflight, requirePost, success } from '../_shared/responses.ts';

const BUCKET = 'widgetflow-signatures';
const PATH = /^signatures\/[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\.png$/;

Deno.serve(async (request) => {
  try {
    const options = preflight(request);
    if (options) return options;
    requirePost(request);
    const { userClient, adminClient } = await verifyCaller(request);
    const resolved = await userClient.rpc('get_my_signature_asset');
    if (resolved.error) throw databaseError(resolved.error);
    if (!resolved.data) return success(request, null);
    const asset = resolved.data as Record<string, unknown>;
    if (asset.bucket_name !== BUCKET || typeof asset.object_path !== 'string' || !PATH.test(asset.object_path) || asset.mime_type !== 'image/png') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'The signature asset could not be resolved.');
    }
    const signed = await adminClient.storage.from(BUCKET).createSignedUrl(asset.object_path, 60);
    if (signed.error || !signed.data?.signedUrl) throw new ApiError(500, 'INTERNAL_ERROR', 'The signature preview is temporarily unavailable.');
    return success(request, { signedUrl: signed.data.signedUrl, expiresIn: 60 });
  } catch (error) {
    return failure(request, error);
  }
});
