import { supabase } from '../config/supabase';

export const isExpiredJwtError = (error) => (
    error?.code === 'PGRST303'
    || String(error?.message || '').toLowerCase().includes('jwt expired')
);

export const clearExpiredSession = async (redirectTo = '/login?session=expired') => {
    try {
        await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
        console.warn('Unable to clear expired Supabase session:', error?.message || error);
    }

    localStorage.removeItem('orders');
    localStorage.removeItem('requests');
    localStorage.removeItem('messages');

    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = redirectTo;
    }
};

export const handleExpiredSessionError = async (error, redirectTo) => {
    if (!isExpiredJwtError(error)) {
        return false;
    }

    await clearExpiredSession(redirectTo);
    return true;
};
