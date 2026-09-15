import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Mic, 
  MicOff,
  Send, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Cpu, 
  Zap, 
  Radio, 
  ShieldCheck, 
  Loader2,
  User
} from 'lucide-react';
import { useJarvisVoice } from '../services/useJarvisVoice';

export default function JarvisAssistant({ activeMeetingId }) {
  const {
    isListening,
    isListeningEnabled,
    micPermissionGranted,
    isSpeaking,
    isThinking,
    isPushToTalkActive,
    voiceMuted,
    thinkingSteps,
    messages,
    requestMicPermission,
    toggleListening,
    toggleVoiceMute,
    triggerPushToTalk,
    sendQuery
  } = useJarvisVoice(activeMeetingId);

  const [inputText, setInputText] = useState('');
  const chatScrollRef = useRef(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, thinkingSteps, isThinking]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim() || isThinking) return;
    const text = inputText.trim();
    setInputText('');
    sendQuery(text);
  };

  const handlePushToTalkClick = () => {
    triggerPushToTalk((interim) => {
      setInputText(interim);
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '1.25rem', border: '1px solid var(--border-glow)' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 0 24px rgba(6, 182, 212, 0.5)'
          }}>
            <Cpu size={22} className={isSpeaking ? "animate-pulse" : ""} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-display)' }}>
              Jarvis AI Real-time Conversational Assistant <Zap size={14} color="#06b6d4" />
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Radio size={10} color={isListening ? "#34d399" : (isListeningEnabled ? "#f59e0b" : "#f43f5e")} className={isListening ? "animate-pulse" : ""} /> 
              {isListening 
                ? 'Always-on background listening for "Hey Jarvis", "Hello", "Hey"...' 
                : isListeningEnabled 
                  ? 'Initializing background microphone...' 
                  : 'Voice listening paused'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Mute Voice Readout Toggle */}
          <button
            type="button"
            onClick={toggleVoiceMute}
            title={voiceMuted ? "Unmute spoken replies" : "Mute spoken replies"}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border-muted)',
              color: voiceMuted ? '#f43f5e' : '#34d399',
              borderRadius: 'var(--radius-sm)',
              padding: '0.45rem 0.65rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.78rem'
            }}
          >
            {voiceMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {voiceMuted ? 'Muted' : 'Spoken'}
          </button>

          {/* Allow Mic / Toggle Continuous Listening Button */}
          {!micPermissionGranted ? (
            <button 
              className="btn-primary" 
              onClick={() => requestMicPermission(true)} 
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Mic size={14} /> Allow Mic & Activate Jarvis
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleListening}
              style={{
                background: isListeningEnabled ? 'rgba(52, 211, 153, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                color: isListeningEnabled ? '#34d399' : '#f43f5e',
                border: `1px solid ${isListeningEnabled ? 'rgba(52, 211, 153, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '0.45rem 0.85rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontWeight: 600
              }}
            >
              {isListeningEnabled ? <ShieldCheck size={13} /> : <MicOff size={13} />}
              {isListeningEnabled ? 'Jarvis Active (Listening 24/7)' : 'Resume Voice Wake-Word'}
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages Scroll Container */}
      <div 
        ref={chatScrollRef}
        style={{ 
          maxHeight: '280px', 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.85rem',
          paddingRight: '0.4rem',
          marginBottom: '1rem',
          background: 'rgba(7, 10, 18, 0.5)',
          padding: '0.85rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}
      >
        {messages.map((m) => (
          <div 
            key={m.id} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start' 
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                background: m.sender === 'user' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)' : 'rgba(255, 255, 255, 0.06)',
                border: m.sender === 'user' ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fff',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.88rem',
                lineHeight: '1.5'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: m.sender === 'user' ? '#fff' : '#818cf8', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {m.sender === 'user' ? <User size={10} /> : <Bot size={10} />}
                  {m.sender === 'user' ? 'You' : 'Jarvis AI'}
                </span>
                <span style={{ fontSize: '0.68rem', color: m.sender === 'user' ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
                  {m.time}
                </span>
              </div>

              <p style={{ fontSize: '0.88rem', color: '#fff', lineHeight: '1.5', margin: 0 }}>
                {m.text}
              </p>
            </div>
          </div>
        ))}

        {/* Chain of Thought Thinking Steps */}
        {isThinking && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
            <div className="glass-card" style={{ padding: '0.75rem', background: 'rgba(6, 182, 212, 0.08)', borderColor: 'rgba(6, 182, 212, 0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#22d3ee', marginBottom: '0.25rem' }}>
                <Loader2 size={14} className="animate-spin" /> Jarvis Thinking...
              </div>
              {thinkingSteps.map((step, idx) => (
                <div key={idx} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  • {step}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Manual Input Form + Push-to-Talk Mic */}
      <form 
        onSubmit={handleManualSubmit} 
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      >
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            placeholder={isPushToTalkActive ? "Listening to your voice..." : "Ask Jarvis anything or say 'Hey Jarvis'..."}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="input-field"
            style={{ 
              fontSize: '0.88rem', 
              paddingRight: '2.5rem',
              borderColor: isPushToTalkActive ? '#ef4444' : undefined 
            }}
          />
          <button
            type="button"
            onClick={handlePushToTalkClick}
            title={isPushToTalkActive ? "Stop speaking" : "Click to speak your question directly"}
            style={{
              position: 'absolute',
              right: '8px',
              background: isPushToTalkActive ? '#ef4444' : 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isPushToTalkActive ? '#fff' : '#06b6d4',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <Mic size={16} className={isPushToTalkActive ? "animate-pulse" : ""} />
          </button>
        </div>

        <button 
          type="submit" 
          className="btn-primary" 
          disabled={isThinking || !inputText.trim()}
          style={{ padding: '0.55rem 1rem' }}
        >
          <Send size={15} /> Ask Jarvis
        </button>
      </form>

    </div>
  );
}
