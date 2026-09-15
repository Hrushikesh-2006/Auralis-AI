import React, { useEffect, useRef, useState } from 'react';
import { Loader2, LogIn, ShieldCheck, Sparkles } from 'lucide-react';
import { apiUrl } from '../services/api';

const GOOGLE_SCRIPT_ID = 'google-identity-services';

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function AuthGate({ onAuthenticated }) {
  const buttonRef = useRef(null);
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [fallbackButtonVisible, setFallbackButtonVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const handleCredentialResponse = async (response, activeClientId) => {
      if (!response?.credential) {
        setError('Google did not return a login credential.');
        return;
      }

      setSigningIn(true);
      setError('');
      try {
        const resp = await fetch(apiUrl('/api/auth/google'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential, client_id: activeClientId })
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.detail || 'Google sign-in failed.');
        }

        const authData = data.data || {};
        localStorage.setItem('meeting_ai_auth_token', authData.token);
        localStorage.setItem('meeting_ai_user', JSON.stringify(authData.user));
        onAuthenticated(authData.user);
      } catch (err) {
        console.error('Google sign-in failed:', err);
        setError(err.message || 'Google sign-in failed.');
      } finally {
        setSigningIn(false);
      }
    };

    const renderGoogleButton = async () => {
      try {
        const resp = await fetch(apiUrl('/api/auth/config'));
        const data = await resp.json();
        const id = data.google_client_id || '';

        if (cancelled) return;
        setClientId(id);

        if (!id) {
          setError('Add GOOGLE_CLIENT_ID to the backend .env file, then restart the backend.');
          setLoading(false);
          return;
        }

        await loadGoogleScript();
        if (cancelled || !window.google?.accounts?.id) {
          setFallbackButtonVisible(true);
          setLoading(false);
          return;
        }

        window.google.accounts.id.initialize({
          client_id: id,
          callback: (response) => handleCredentialResponse(response, id),
          auto_select: false,
          cancel_on_tap_outside: true
        });

        if (buttonRef.current) {
          const existingButton = buttonRef.current.querySelector('[data-google-button]');
          if (existingButton) {
            existingButton.remove();
          }

          const button = document.createElement('div');
          button.setAttribute('data-google-button', 'true');
          buttonRef.current.appendChild(button);

          try {
            window.google.accounts.id.renderButton(button, {
              theme: 'filled_blue',
              size: 'large',
              shape: 'rectangular',
              type: 'standard',
              text: 'signin_with',
              logo_alignment: 'left',
              width: 280
            });
          } catch (renderError) {
            console.warn('Google renderButton failed, using fallback button.', renderError);
            setFallbackButtonVisible(true);
          }
        } else {
          setFallbackButtonVisible(true);
        }
      } catch (err) {
        console.error('Google login initialization failed:', err);
        if (!cancelled) {
          setFallbackButtonVisible(true);
          setError('Could not load Google login. Check backend and network connection.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderGoogleButton();

    return () => {
      cancelled = true;
      if (window.google?.accounts?.id) {
        try { window.google.accounts.id.cancel(); } catch {}
      }
    };
  }, [onAuthenticated]);

  const handleFallbackLogin = () => {
    if (!window.google?.accounts?.id) {
      setError('Google login script is still loading. Please refresh the page or try again in a moment.');
      return;
    }

    setError('');
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        console.warn('Google popup was blocked or skipped; silently retrying without user-facing error.');
      }
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#070a12', color: '#fff' }}>
      <div className="glass-panel" style={{ width: 'min(440px, 100%)', padding: '2rem', textAlign: 'center' }}>
        <div style={{ width: 58, height: 58, borderRadius: 16, background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-cyan) 100%)', display: 'grid', placeItems: 'center', margin: '0 auto 1rem' }}>
          <Sparkles size={30} />
        </div>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>
          Meeting Insights AI
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.35rem' }}>
          Sign in with Google to save your profile and open your meeting workspace.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', minHeight: 44, marginBottom: '1rem' }}>
          {loading ? (
            <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
              <Loader2 size={16} className="animate-spin" /> Loading Google login
            </span>
          ) : clientId ? (
            <>
              <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center' }} />
              {fallbackButtonVisible && (
                <button
                  type="button"
                  onClick={handleFallbackLogin}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    minWidth: 260,
                    height: 44,
                    borderRadius: 12,
                    border: '1px solid rgba(99, 102, 241, 0.6)',
                    background: 'linear-gradient(135deg, #1f6feb 0%, #3b82f6 100%)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 12px 24px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.2 3.63l6.85-6.85C35.9 2.1 30.45 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.13 14.18 17.52 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.5 24.55c0-1.64-.15-3.22-.42-4.73H24v9h12.7c-.55 2.96-2.22 5.47-4.73 7.16l7.65 5.94C43.7 36.26 46.5 31.17 46.5 24.55z"/>
                    <path fill="#FBBC05" d="M32.97 36.88c-2.12 1.42-4.84 2.26-8.97 2.26-6.48 0-11.97-4.38-13.92-10.28l-7.98 6.2C4.42 41.72 13.23 48 24 48c6.24 0 11.49-2.06 15.32-5.6l-6.35-5.52z"/>
                    <path fill="#34A853" d="M11.08 28.86A14.61 14.61 0 0 1 10.5 24c0-1.56.27-3.07.76-4.5l-7.98-6.2A23.97 23.97 0 0 0 0 24c0 3.86.92 7.5 2.56 10.72l8.52-6.86z"/>
                  </svg>
                  Continue with Google
                </button>
              )}
            </>
          ) : (
            <span style={{ color: '#fbbf24', fontSize: '0.82rem' }}>Google login is not configured yet.</span>
          )}
        </div>

        {signingIn && (
          <div style={{ color: '#34d399', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.8rem' }}>
            <Loader2 size={14} className="animate-spin" /> Verifying account
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24', borderRadius: 'var(--radius-md)', padding: '0.75rem', fontSize: '0.8rem', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.74rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
          <ShieldCheck size={12} /> Google ID tokens are verified on the backend.
        </div>
      </div>
    </div>
  );
}