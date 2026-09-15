import React, { useState } from 'react';
import { X, Copy, Check, Mail, Sparkles, Loader2 } from 'lucide-react';
import { apiUrl } from '../services/api';

export default function EmailDraftModal({ isOpen, onClose, meetingId, initialEmail = '' }) {
  const [tone, setTone] = useState('formal');
  const [emailBody, setEmailBody] = useState(initialEmail);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async (selectedTone = tone) => {
    setIsGenerating(true);
    try {
      const resp = await fetch(apiUrl(`/api/meetings/${meetingId}/email`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: selectedTone })
      });
      const data = await resp.json();
      if (data.email_body) {
        setEmailBody(data.email_body);
      }
    } catch (e) {
      console.error('Email draft error:', e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(emailBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '640px', padding: '1.75rem', position: 'relative' }}>
        
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            right: '1.25rem',
            top: '1.25rem',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>AI Auto-Draft Follow-Up Email</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Instantly generate a meeting recap email tailored for participants</p>
          </div>
        </div>

        {/* Tone Selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {['formal', 'concise', 'action-oriented'].map((t) => (
            <button
              key={t}
              onClick={() => { setTone(t); handleGenerate(t); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: 'var(--radius-md)',
                border: tone === t ? '1px solid var(--primary)' : '1px solid var(--border-muted)',
                background: tone === t ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                color: tone === t ? '#fff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {t.replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Textarea body */}
        <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            rows={12}
            className="input-field"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '0.88rem',
              lineHeight: '1.5',
              resize: 'vertical'
            }}
          />
          {isGenerating && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.8)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              color: 'var(--primary)'
            }}>
              <Loader2 size={24} className="animate-spin" /> Drafting email with LLM...
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={() => handleGenerate(tone)}>
            <Sparkles size={14} /> Regenerate Draft
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleCopy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied to Clipboard!' : 'Copy Email'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
