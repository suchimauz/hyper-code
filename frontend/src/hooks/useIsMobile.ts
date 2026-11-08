import { useEffect, useState } from 'react';
const query = '(max-width: 1000px)';
/** True on the mobile layout (same breakpoint as the CSS). Follows viewport changes live. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const media = window.matchMedia?.(query); if (!media) return;
    const change = () => setMobile(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return mobile;
}
