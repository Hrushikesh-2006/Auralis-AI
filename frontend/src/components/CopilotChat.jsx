import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, Quote, ShieldCheck, Loader2, Volume2, VolumeX, Mic } from 'lucide-react';
import { jarvisVoiceService } from '../services/JarvisVoiceService';
import { apiUrl } from '../services/api';

export default function CopilotChat({ meetingId }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: "👋 Hi! I am your RAG-Powered AI Meeting Co-Pilot. Did you miss part of the meeting or need help with a decision? Ask me anything about what was discussed!",
      citations: [],
      rag_method: ""
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  
  const activeAudioRef = useRef(null);
  const pushToTalkRef = useRef(null);
  const audioEnabledRef = useRef(true);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    if (!audioEnabled) {
      stopRagAudio();
    }
  }, [audioEnabled]);

  const stopRagAudio = () => {
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
      } catch {}
      activeAudioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const speakBrowserFallback = (text) => {
    if (!audioEnabledRef.current || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Google') || v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('Samantha'))) || voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const playVoiceResponse = (voiceUrl, text) => {
    if (!audioEnabledRef.current) return;
    jarvisVoiceService.playVoiceResponse(voiceUrl, text);
  };

  useEffect(() => {
    return () => stopRagAudio();
  }, []);

  const handlePushToTalk = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your query.');
      return;
    }

    if (isPushToTalkActive) {
      if (pushToTalkRef.current) {
        try { pushToTalkRef.current.stop(); } catch (e) {}
      }
      setIsPushToTalkActive(false);
      jarvisVoiceService.startRecognition();
      return;
    }

    stopRagAudio();
    jarvisVoiceService.stopRecognition();
    setIsPushToTalkActive(true);

    try {
      const ptt = new SpeechRecognition();
      ptt.continuous = false;
      ptt.interimResults = true;
      ptt.lang = 'en-US';

      ptt.onresult = (event) => {
        const text = Array.from(event.results)
          .map(r => r[0].transcript)
          .join('');
        setQuery(text);

        if (event.results[0] && event.results[0].isFinal) {
          setIsPushToTalkActive(false);
          jarvisVoiceService.startRecognition();
          if (text.trim()) {
            handleSend(text.trim());
          }
        }
      };

      ptt.onerror = () => {
        setIsPushToTalkActive(false);
        jarvisVoiceService.startRecognition();
      };
      ptt.onend = () => {
        setIsPushToTalkActive(false);
        jarvisVoiceService.startRecognition();
      };

      ptt.start();
      pushToTalkRef.current = ptt;
    } catch (e) {
      console.error('Push to talk error:', e);
      setIsPushToTalkActive(false);
      jarvisVoiceService.startRecognition();
    }
  };

  const handleSend = async (qText = query) => {
    if (!qText || !qText.trim() || !meetingId) return;
    
    const userMsg = { sender: 'user', text: qText.trim() };
    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const resp = await fetch(apiUrl(`/api/meetings/${meetingId}/chat`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: qText.trim() })
      });
      const data = await resp.json();
      
      const ragData = data.data || {};
      const answerText = ragData.answer || data.answer || "I retrieved the transcript context for you.";
      setMessages(prev => [
        ...prev, 
        { 
          sender: 'bot', 
          text: answerText,
          citations: ragData.citations || [],
          rag_method: ragData.rag_method || "RAG Retrieval Index",
          voice_audio_url: ragData.voice_audio_url
        }
      ]);
      playVoiceResponse(ragData.voice_audio_url, answerText);
    } catch (e) {
      console.error('Copilot chat error:', e);
      setMessages(prev => [...prev, { sender: 'bot', text: "Sorry, I had trouble parsing the vector index for that segment." }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "What did I miss while I stepped away?",
    "What decisions were confirmed?",
    "What action items were assigned to Sarah?",
    "What was discussed in the audio recording?"
  ];

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '1.25rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <Bot size={20} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>RAG AI Meeting Co-Pilot</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
            <ShieldCheck size={11} /> RAG Vector Retrieval Active
          </span>
          <button
            type="button"
            onClick={() => {
              if (audioEnabled) stopRagAudio();
              setAudioEnabled(!audioEnabled);
            }}
            title={audioEnabled ? 'Mute RAG voice replies' : 'Enable RAG voice replies'}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border-muted)',
              color: audioEnabled ? '#34d399' : 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {audioEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>
      </div>

      {/* Suggested Quick Prompts */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {quickPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p)}
            className="glass-card"
            style={{
              padding: '0.4rem 0.75rem',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              border: '1px solid var(--border-muted)',
              background: 'rgba(255, 255, 255, 0.03)'
            }}
          >
            <Sparkles size={11} style={{ display: 'inline', marginRight: '4px', color: 'var(--accent-purple)' }} />
            {p}
          </button>
        ))}
      </div>

      {/* Message Feed */}
      <div style={{
        maxHeight: '260px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        paddingRight: '0.4rem',
        marginBottom: '1rem'
      }}>
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div
              style={{
                background: m.sender === 'user' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)' : 'rgba(255, 255, 255, 0.05)',
                color: '#fff',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.86rem',
                lineHeight: '1.5'
              }}
            >
              <p style={{ margin: 0 }}>{m.text}</p>
              
              {m.rag_method && (
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <ShieldCheck size={10} /> Powered by {m.rag_method}
                </div>
              )}
            </div>

            {/* RAG Citation Cards */}
            {m.citations && m.citations.length > 0 && (
              <div style={{ maxWidth: '88%', marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Quote size={10} /> Verified RAG Grounded Sources:
                </span>
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {m.citations.slice(0, 3).map((c, cIdx) => (
                    <div key={cIdx} style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-muted)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.35rem 0.5rem',
                      fontSize: '0.72rem',
                      whiteSpace: 'nowrap'
                    }}>
                      <strong style={{ color: '#818cf8' }}>{c.speaker}</strong> ({c.timestamp})
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        ))}

        {loading && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Loader2 size={14} className="animate-spin" /> Performing RAG retrieval and generating voice reply...
          </div>
        )}
      </div>

      {/* Chat Input Bar */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            placeholder={isPushToTalkActive ? "Listening to your voice..." : "Ask RAG Co-Pilot anything about what happened in this meeting..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field"
            style={{ 
              fontSize: '0.85rem', 
              paddingRight: '2.5rem',
              borderColor: isPushToTalkActive ? '#ef4444' : undefined 
            }}
          />
          <button
            type="button"
            onClick={handlePushToTalk}
            title={isPushToTalkActive ? "Stop listening" : "Click to speak"}
            style={{
              position: 'absolute',
              right: '8px',
              background: isPushToTalkActive ? '#ef4444' : 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '26px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isPushToTalkActive ? '#fff' : '#06b6d4',
              cursor: 'pointer'
            }}
          >
            <Mic size={15} className={isPushToTalkActive ? "animate-pulse" : ""} />
          </button>
        </div>

        <button type="submit" className="btn-primary" disabled={loading || !query.trim()} style={{ padding: '0.55rem 1rem' }}>
          <Send size={15} /> Ask Co-Pilot
        </button>
      </form>

    </div>
  );
}
