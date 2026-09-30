import React, { useEffect, useRef, useState } from 'react';
import { Loader2, LogIn, ShieldCheck, Sparkles, Database, UserCheck, AlertTriangle } from 'lucide-react';
import { apiUrl } from '../services/api';

const GOOGLE_SCRIPT_ID = 'google-identity-services';

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) {
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
  const [dbType, setDbType] = useState('sqlite');
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [fallbackButtonVisible, setFallbackButtonVisible] = useState(false);

  const saveAuthSession = (authData) => {
    localStorage.setItem('meeting_ai_auth_token', authData.token);
    localStorage.setItem('meeting_ai_user', JSON.stringify(authData.user));
    onAuthenticated(authData.user);
  };

  const handleCredentialResponse = async (response, activeClientId) => {
    if (!response?.credential) {
      setError('Google did not return an authentication credential.');
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

      saveAuthSession(data.data || {});
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleOAuthTokenSuccess = async (tokenResponse) => {
    if (!tokenResponse?.access_token) {
      setError('Google authorization did not return an access token.');
      return;
    }

    setSigningIn(true);
    setError('');
    try {
      const resp = await fetch(apiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokenResponse.access_token, client_id: clientId })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || 'Google sign-in failed.');
      }

      saveAuthSession(data.data || {});
    } catch (err) {
      console.error('OAuth token sign-in error:', err);
      setError(err.message || 'Google sign-in verification failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleOAuthPopupLogin = () => {
    if (!clientId) {
      setError('Google Client ID is not configured.');
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setError('Google Identity Services script is loading. Please try again in a few seconds.');
      return;
    }

    setError('');
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: handleOAuthTokenSuccess,
        error_callback: (err) => {
          console.warn('Google OAuth popup error:', err);
          setError('Google popup was closed or origin is not authorized yet.');
        }
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err) {
      console.error('Token client initialization failed:', err);
      setError('Could not open Google Sign-In popup: ' + (err.message || 'Unknown error'));
    }
  };

  const handleDemoLogin = async () => {
    setSigningIn(true);
    setError('');
    try {
      const resp = await fetch(apiUrl('/api/auth/demo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || 'Demo login failed.');
      }
      saveAuthSession(data.data || {});
    } catch (err) {
      console.error('Demo login error:', err);
      setError(err.message || 'Demo login failed.');
    } finally {
      setSigningIn(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      try {
        const resp = await fetch(apiUrl('/api/auth/config'));
        const data = await resp.json();
        const id = data.google_client_id || '';
        const detectedDb = data.database_type || 'sqlite';

        if (cancelled) return;
        setClientId(id);
        setDbType(detectedDb);

        if (!id) {
          setLoading(false);
          return;
        }

        await loadGoogleScript();
        if (cancelled) return;

        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: id,
            callback: (response) => handleCredentialResponse(response, id),
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true
          });

          setTimeout(() => {
            if (cancelled) return;
            if (buttonRef.current) {
              const existingButton = buttonRef.current.querySelector('[data-google-button]');
              if (existingButton) existingButton.remove();

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
                console.warn('Google renderButton error, enabling popup button:', renderError);
                setFallbackButtonVisible(true);
              }
            } else {
              setFallbackButtonVisible(true);
            }
          }, 60);
        } else {
          setFallbackButtonVisible(true);
        }

        setLoading(false);
      } catch (err) {
        console.error('Google auth initialization failed:', err);
        if (!cancelled) {
          setFallbackButtonVisible(true);
          setError('Could not connect to auth backend. Check server connection.');
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      cancelled = true;
      if (window.google?.accounts?.id) {
        try { window.google.accounts.id.cancel(); } catch {}
      }
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#070a12', color: '#fff' }}>
      <div className="glass-panel" style={{ width: 'min(460px, 100%)', padding: '2.5rem 2rem', textAlign: 'center', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ width: 62, height: 62, borderRadius: 18, background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)', display: 'grid', placeItems: 'center', margin: '0 auto 1.25rem', boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)' }}>
          <Sparkles size={32} color="#fff" />
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)', marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
          Auralis AI
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
          Intelligent Meeting Co-Pilot, Neural Transcription & 2-Host Audiobooks
        </p>

        {/* Database Mode Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.85rem', background: dbType === 'postgres' ? 'rgba(52, 211, 153, 0.12)' : 'rgba(99, 102, 241, 0.12)', border: `1px solid ${dbType === 'postgres' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`, borderRadius: '2rem', fontSize: '0.78rem', color: dbType === 'postgres' ? '#34d399' : '#818cf8', marginBottom: '1.5rem' }}>
          <Database size={13} />
          <span>Storage: <strong>{dbType === 'postgres' ? 'PostgreSQL (Cloud Persistent)' : 'SQLite (Local)'}</strong></span>
        </div>

        {/* Google Login Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
          {loading ? (
            <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
              <Loader2 size={18} className="animate-spin" /> Loading Authentication...
            </span>
          ) : (
            <>
              {/* GIS Rendered Button */}
              {clientId && (
                <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
              )}

              {/* Explicit Google OAuth Popup Button (Works on any origin / popup fallback) */}
              {clientId && (
                <button
                  type="button"
                  onClick={handleOAuthPopupLogin}
                  disabled={signingIn}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    width: 'min(280px, 100%)',
                    height: 44,
                    borderRadius: 12,
                    border: '1px solid rgba(66, 133, 244, 0.4)',
                    background: 'rgba(66, 133, 244, 0.12)',
                    color: '#93c5fd',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(66, 133, 244, 0.22)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(66, 133, 244, 0.12)'}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.2 3.63l6.85-6.85C35.9 2.1 30.45 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.13 14.18 17.52 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.5 24.55c0-1.64-.15-3.22-.42-4.73H24v9h12.7c-.55 2.96-2.22 5.47-4.73 7.16l7.65 5.94C43.7 36.26 46.5 31.17 46.5 24.55z"/>
                    <path fill="#FBBC05" d="M32.97 36.88c-2.12 1.42-4.84 2.26-8.97 2.26-6.48 0-11.97-4.38-13.92-10.28l-7.98 6.2C4.42 41.72 13.23 48 24 48c6.24 0 11.49-2.06 15.32-5.6l-6.35-5.52z"/>
                    <path fill="#34A853" d="M11.08 28.86A14.61 14.61 0 0 1 10.5 24c0-1.56.27-3.07.76-4.5l-7.98-6.2A23.97 23.97 0 0 0 0 24c0 3.86.92 7.5 2.56 10.72l8.52-6.86z"/>
                  </svg>
                  Google OAuth Popup Sign-In
                </button>
              )}

              {/* Demo Account Quick Access */}
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={signingIn}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  width: 'min(280px, 100%)',
                  height: 42,
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
                  color: '#e2e8f0',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                <UserCheck size={16} color="#38bdf8" />
                Quick Access Demo Account
              </button>
            </>
          )}
        </div>

        {signingIn && (
          <div style={{ color: '#34d399', fontSize: '0.84rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Loader2 size={16} className="animate-spin" /> Verifying account & session...
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.82rem', lineHeight: 1.5, textAlign: 'left', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              <AlertTriangle size={15} /> Authentication Notice
            </div>
            {error}
          </div>
        )}

        <div style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
          <ShieldCheck size={14} color="#60a5fa" />
          <span>Secure Google OAuth 2.0 verification on FastAPI backend</span>
        </div>
      </div>
    </div>
  );
}