import React from 'react';
import { authenticatedBinaryRequest } from '../../services/httpClient';

type AuthenticatedAssetImageProps = React.ImgHTMLAttributes<HTMLImageElement> & { src: string };

export const AuthenticatedAssetImage: React.FC<AuthenticatedAssetImageProps> = ({ src, ...props }) => {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const protectedAsset = src.startsWith('/api/assets/');

  React.useEffect(() => {
    let disposed = false;
    let nextObjectUrl: string | null = null;
    setFailed(false);
    setObjectUrl(null);
    if (!protectedAsset) return () => undefined;
    void authenticatedBinaryRequest(src)
      .then(({ blob }) => {
        if (disposed) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [protectedAsset, src]);

  if (!protectedAsset) return <img src={src} {...props} />;
  if (failed || !objectUrl) return null;
  return <img src={objectUrl} {...props} />;
};
