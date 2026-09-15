import React, { useState, useEffect } from 'react';
import { X, Key, ShieldCheck, Save, Sparkles, CheckCircle2 } from 'lucide-react';
import { apiUrl } from '../services/api';

export default function SettingsModal({ isOpen, onClose }) {
  const [keys, setKeys] = useState({
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    DEEPGRAM_API_KEY: '',
    ASSEMBLYAI_API_KEY: '',
    GROQ_API_KEY: ''
  });
  const [keyStatus, setKeyStatus] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    try {
      const resp = await fetch(apiUrl('/api/config'));
      const data = await resp.json();
      setKeyStatus(data);
    } catch (e) {
      console.error('Failed to fetch config:', e);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const resp = await fetch(apiUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keys)
      });
      const data = await resp.json();
      setKeyStatus(data.keys_status);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  };

  if (!isOpen) return null;

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
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '580px', padding: '1.75rem', position: 'relative' }}>
        
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
            <Key size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>API Keys & Provider Configuration</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Provide your API keys to enable real cloud transcription & LLM analysis</p>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Deepgram API Key */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Deepgram API Key (Recommended for STT + Diarization)</label>
              {keyStatus.has_deepgram && <span style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle2 size={12} /> Active</span>}
            </div>
            <input 
              type="password"
              placeholder={keyStatus.has_deepgram ? "••••••••••••••••" : "Paste Deepgram API Key"}
              value={keys.DEEPGRAM_API_KEY}
              onChange={(e) => setKeys({ ...keys, DEEPGRAM_API_KEY: e.target.value })}
              className="input-field"
            />
          </div>

          {/* Gemini API Key */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Google Gemini API Key (Recommended for LLM Extraction)</label>
              {keyStatus.has_gemini && <span style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle2 size={12} /> Active</span>}
            </div>
            <input 
              type="password"
              placeholder={keyStatus.has_gemini ? "••••••••••••••••" : "Paste Google Gemini API Key"}
              value={keys.GEMINI_API_KEY}
              onChange={(e) => setKeys({ ...keys, GEMINI_API_KEY: e.target.value })}
              className="input-field"
            />
          </div>

          {/* OpenAI API Key */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>OpenAI API Key (Optional)</label>
              {keyStatus.has_openai && <span style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle2 size={12} /> Active</span>}
            </div>
            <input 
              type="password"
              placeholder={keyStatus.has_openai ? "••••••••••••••••" : "Paste OpenAI API Key"}
              value={keys.OPENAI_API_KEY}
              onChange={(e) => setKeys({ ...keys, OPENAI_API_KEY: e.target.value })}
              className="input-field"
            />
          </div>

          {/* AssemblyAI API Key */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>AssemblyAI API Key (Optional)</label>
              {keyStatus.has_assemblyai && <span style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><CheckCircle2 size={12} /> Active</span>}
            </div>
            <input 
              type="password"
              placeholder={keyStatus.has_assemblyai ? "••••••••••••••••" : "Paste AssemblyAI API Key"}
              value={keys.ASSEMBLYAI_API_KEY}
              onChange={(e) => setKeys({ ...keys, ASSEMBLYAI_API_KEY: e.target.value })}
              className="input-field"
            />
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <strong>Note:</strong> If no API key is provided, the application will use its built-in smart simulation engine so you can test all features without interruption.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              <Save size={16} /> {saved ? 'Keys Updated!' : 'Save Configurations'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
