import { useNavigate } from 'react-router-dom';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';

/** Booking actions require a session; browsing the catalogue does not. */
export function useRequireAuth(): () => boolean {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const showToast = useUI((s) => s.showToast);
  return () => {
    if (user) return true;
    showToast('Sign in to continue with your booking', 'info');
    navigate('/auth/login');
    return false;
  };
}

export function usePageMeta(title: string, description?: string) {
  if (typeof document === 'undefined') return;
  document.title = `${title} · GOWAYY`;
  const meta = document.querySelector('meta[name="description"]');
  if (description && meta) meta.setAttribute('content', description);
}
