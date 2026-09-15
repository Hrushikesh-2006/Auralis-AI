import React, { useState, useEffect, useRef } from 'react';
import AudioRecorder from './components/AudioRecorder';
import AudioUploader from './components/AudioUploader';
import TranscriptView from './components/TranscriptView';
import InsightsDashboard from './components/InsightsDashboard';
import EmailDraftModal from './components/EmailDraftModal';
import MeetingsArchive from './components/MeetingsArchive';
import FloatingWidget from './components/FloatingWidget';
import PdfPodcastView from './components/PdfPodcastView';
import MeetingScheduler from './components/MeetingScheduler';
import AuthGate from './components/AuthGate';
import JarvisAssistant from './components/JarvisAssistant';
import { jarvisVoiceService } from './services/JarvisVoiceService';
import { useJarvisVoice } from './services/useJarvisVoice';
import { apiUrl, assetUrl } from './services/api';
import auralisLogo from './assets/auralis-logo.svg';
import { 
  Sparkles, 
  Mic, 
  FolderArchive,
  Radio, 
  Volume2, 
  Layers,
  Activity,
  ExternalLink,
  Headphones,
  ShieldCheck,
  Calendar,
  BellRing,
  LogOut,
  UserCircle
} from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'schedules', 'podcasts', 'archive'
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [keyStatus, setKeyStatus] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Modals & Floating App
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isFloatingAppOpen, setIsFloatingAppOpen] = useState(false);
  const [globalAlarmToast, setGlobalAlarmToast] = useState(null);
  
  const audioRef = useRef(null);
  const notifiedRemRef = useRef(new Set());   // tracks pre-reminder alarms already fired
  const notifiedStartedRef = useRef(new Set()); // tracks start alarms already fired
  const isAlarmPlayingRef = useRef(false);    // global lock: prevents stacked audio
  const {
    isListening,
    isListeningEnabled,
    micPermissionGranted,
    requestMicPermission,
    toggleListening
  } = useJarvisVoice(activeMeeting?.meeting?.id || null);

  useEffect(() => {
    document.title = 'Auralis AI | Meeting Intelligence & Audio Narration';
  }, []);

  useEffect(() => {
    const restoreUser = async () => {
      const savedUser = localStorage.getItem('meeting_ai_user');
      const token = localStorage.getItem('meeting_ai_auth_token');

      if (savedUser) {
        try { setCurrentUser(JSON.parse(savedUser)); } catch (e) {}
      }

      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const resp = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || 'Session expired');
        const user = data.data?.user;
        setCurrentUser(user);
        localStorage.setItem('meeting_ai_user', JSON.stringify(user));
      } catch (e) {
        localStorage.removeItem('meeting_ai_auth_token');
        localStorage.removeItem('meeting_ai_user');
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    restoreUser();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    fetchLatestMeeting();
    fetchConfigStatus();

    // Global background interval to monitor meeting schedule alarms every 3 seconds across all app views
    const scheduleCheckerTimer = setInterval(() => {
      checkGlobalDueSchedules();
    }, 3000);

    return () => clearInterval(scheduleCheckerTimer);
  }, [currentUser]);

  const checkGlobalDueSchedules = async () => {
    try {
      const resp = await fetch(apiUrl('/api/schedules'));
      const data = await resp.json();
      const list = Array.isArray(data) ? data : (data.data || []);
      const now = new Date();

      for (const item of list) {
        if (item.status === 'upcoming') {
          const itemTime = new Date(item.scheduled_time);
          const diffMs = itemTime.getTime() - now.getTime();
          const remindMs = (item.remind_before_minutes || 1) * 60 * 1000;
          const remKey = `rem-${item.id}`;
          const startKey = `start-${item.id}`;

          // 1. Trigger Pre-Reminder Alarm (within the remind window, e.g. <=5min if user set 5min)
          if (diffMs <= remindMs && diffMs > 0 && !notifiedRemRef.current.has(remKey)) {
            notifiedRemRef.current.add(remKey);
            const minLabel = item.remind_before_minutes >= 60
              ? `${Math.round(item.remind_before_minutes / 60)} hour`
              : `${item.remind_before_minutes} minute${item.remind_before_minutes > 1 ? 's' : ''}`;
            const badge = `MEETING IN ${minLabel.toUpperCase()}`;
            await triggerGlobalSpokenAlarm(item.title, item.scheduled_time, 'reminder', badge);
          }

          // 2. Trigger Meeting Start Alarm (at or past scheduled time)
          if (diffMs <= 0 && !notifiedStartedRef.current.has(startKey)) {
            notifiedStartedRef.current.add(startKey);
            try {
              await fetch(apiUrl(`/api/schedules/${item.id}/status`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'started' })
              });
            } catch (e) {}
            await triggerGlobalSpokenAlarm(item.title, item.scheduled_time, 'started', 'MEETING STARTING NOW');
          }
        }
      }
    } catch (e) {
      // Quiet background check
    }
  };

  const triggerGlobalSpokenAlarm = async (title, scheduledTimeStr, remType, badgeText) => {
    // ── Global lock: don't stack alarms ──
    if (isAlarmPlayingRef.current) return;
    isAlarmPlayingRef.current = true;

    const formattedTime = scheduledTimeStr 
      ? new Date(scheduledTimeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setGlobalAlarmToast({ title, time: formattedTime, badge: badgeText, remType });

    // Cancel any browser speech already queued
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }

    let playedAudio = false;
    try {
      const resp = await fetch(apiUrl('/api/schedules/speak-reminder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, scheduled_time: scheduledTimeStr, reminder_type: remType })
      });
      const data = await resp.json();
      if (data.voice_audio_url) {
        const audio = new Audio(assetUrl(data.voice_audio_url));
        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play().catch(resolve);
        });
        playedAudio = true;
      }
    } catch (e) {}

    if (!playedAudio && 'speechSynthesis' in window) {
      const textToSpeak = remType === 'started'
        ? `Attention: Your scheduled meeting ${title} is starting now.`
        : `Reminder: Your scheduled meeting ${title} will start soon.`;
      await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.0;
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
      });
    }

    isAlarmPlayingRef.current = false;
  };

  const fetchConfigStatus = async () => {
    try {
      const resp = await fetch(apiUrl('/api/config'));
      const data = await resp.json();
      setKeyStatus(data);
    } catch (e) {
      console.warn('Backend config fetch pending...', e);
    }
  };

  const fetchLatestMeeting = async () => {
    try {
      const resp = await fetch(apiUrl('/api/meetings'));
      const data = await resp.json();
      if (data && data.length > 0) {
        loadMeetingDetails(data[0].id);
      } else {
        setActiveMeeting(null);
      }
    } catch (e) {
      console.warn('Backend connection pending...', e);
      setActiveMeeting(null);
    }
  };

  const loadMeetingDetails = async (meetingId) => {
    setIsProcessing(true);
    try {
      const resp = await fetch(apiUrl(`/api/meetings/${meetingId}`));
      const data = await resp.json();
      setActiveMeeting(data);
      setCurrentView('dashboard');
    } catch (e) {
      console.error('Failed to load meeting details:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAudioComplete = async (file, customTitle) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (customTitle) formData.append('title', customTitle);

      const resp = await fetch(apiUrl('/api/process-audio'), {
        method: 'POST',
        body: formData
      });
      const data = await resp.json();
      if (data.data) {
        setActiveMeeting(data.data);
        setCurrentView('dashboard');

        const mtgId = data.data.meeting?.id;
        const mtgTitle = data.data.meeting?.title || 'Live Meeting';
        const summaryText = data.data.meeting?.summary || 'Meeting analysis complete.';
        
        jarvisVoiceService.setActiveMeetingId(mtgId);

        // Only announce through single voice pipeline if floating widget isn't already active
        if (!isFloatingAppOpen) {
          jarvisVoiceService.sendQuery(`Here is the executive summary for ${mtgTitle}: ${summaryText}`);
        }
      }
    } catch (e) {
      console.error('Audio processing failed:', e);
      alert('Error processing audio. Please check backend connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSeekTo = (timestamp) => {
    setCurrentTime(timestamp);
    if (audioRef.current) {
      audioRef.current.currentTime = timestamp;
      audioRef.current.play();
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('meeting_ai_auth_token');
    localStorage.removeItem('meeting_ai_user');
    setCurrentUser(null);
    setActiveMeeting(null);
    setIsFloatingAppOpen(false);
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#fff', background: '#070a12' }}>
        <div className="glass-panel" style={{ padding: '1.2rem 1.4rem', fontSize: '0.9rem' }}>Loading your workspace...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthGate onAuthenticated={setCurrentUser} />;
  }

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Top Navbar */}
      <header className="glass-panel" style={{ 
        borderRadius: 0, 
        borderLeft: 'none', 
        borderRight: 'none', 
        borderTop: 'none', 
        padding: '0.85rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(7, 10, 18, 0.88)'
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div className="brand-mark" style={{
            width: '46px',
            height: '46px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(99,102,241,1) 0%, rgba(168,85,247,1) 48%, rgba(34,211,238,1) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 32px rgba(99, 102, 241, 0.45)',
            padding: '4px'
          }}>
            <img src={auralisLogo} alt="Auralis AI logo" style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          <div>
            <h1 style={{ 
              fontSize: '1.3rem', 
              fontWeight: 800, 
              fontFamily: 'var(--font-display)',
              background: 'linear-gradient(90deg, #f8fafc 0%, #c084fc 50%, #67e8f9 100%)', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em'
            }}>
              Auralis AI
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Activity size={10} color="#34d399" /> Meeting intelligence, voice AI, and audio summaries
              </span>
              {keyStatus.has_deepgram && (
                <span className="badge" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontSize: '0.62rem' }}>
                  <ShieldCheck size={9} /> Deepgram STT
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center Navigation Pills */}
        <div style={{ 
          display: 'flex', 
          background: 'rgba(15, 22, 38, 0.9)', 
          padding: '0.3rem', 
          borderRadius: 'var(--radius-lg)', 
          border: '1px solid var(--border-muted)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
        }}>
          <button
            onClick={() => setCurrentView('dashboard')}
            style={{
              background: currentView === 'dashboard' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: currentView === 'dashboard' ? '0 4px 14px var(--primary-glow)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Layers size={15} /> Insights Dashboard
          </button>

          <button
            onClick={() => setCurrentView('schedules')}
            style={{
              background: currentView === 'schedules' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: currentView === 'schedules' ? '0 4px 14px var(--primary-glow)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Calendar size={15} /> Schedules & Voice Alarms
          </button>

          <button
            onClick={() => setCurrentView('podcasts')}
            style={{
              background: currentView === 'podcasts' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: currentView === 'podcasts' ? '0 4px 14px var(--primary-glow)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Headphones size={15} /> PDF Audio Books & Podcasts
          </button>

          <button
            onClick={() => setCurrentView('archive')}
            style={{
              background: currentView === 'archive' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.15rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: currentView === 'archive' ? '0 4px 14px var(--primary-glow)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <FolderArchive size={15} /> Past History
          </button>
        </div>

        {/* Right Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'rgba(15, 22, 38, 0.9)', border: '1px solid var(--border-muted)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.5rem' }}>
            {currentUser?.picture ? (
              <img src={currentUser.picture} alt="" style={{ width: 26, height: 26, borderRadius: '50%' }} />
            ) : (
              <UserCircle size={24} color="#818cf8" />
            )}
            <span style={{ color: '#fff', fontSize: '0.78rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser?.name || currentUser?.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}
            >
              <LogOut size={14} />
            </button>
          </div>
          <button 
            className="btn-primary" 
            onClick={() => setIsFloatingAppOpen(!isFloatingAppOpen)}
            style={{ padding: '0.55rem 1rem', fontSize: '0.82rem' }}
          >
            <ExternalLink size={15} /> Floating Mode / PiP
          </button>
          <button
            type="button"
            onClick={() => micPermissionGranted ? toggleListening() : requestMicPermission(true)}
            title={micPermissionGranted ? 'Toggle Jarvis background listening' : 'Allow microphone and activate Jarvis'}
            style={{
              background: isListening ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.08)',
              border: `1px solid ${isListening ? 'rgba(52, 211, 153, 0.45)' : 'var(--border-muted)'}`,
              color: isListening ? '#34d399' : '#fff',
              borderRadius: 'var(--radius-md)',
              padding: '0.55rem 0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.78rem',
              fontWeight: 600
            }}
          >
            <Radio size={14} className={isListening ? 'animate-pulse' : ''} />
            {isListening ? 'Jarvis Listening' : isListeningEnabled ? 'Activate Jarvis' : 'Resume Jarvis'}
          </button>
        </div>
      </header>

      {/* Global Spoken Alarm Toast Banner if triggered */}
      {globalAlarmToast && (
        <div className="animate-fade-in" style={{
          position: 'fixed',
          top: '85px',
          right: '30px',
          zIndex: 1000,
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.98) 100%)',
          color: '#fff',
          padding: '1.25rem 1.5rem',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 12px 45px rgba(239, 68, 68, 0.65)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.1rem',
          maxWidth: '450px',
          border: '2px solid #f87171',
          backdropFilter: 'blur(12px)'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <BellRing size={26} className="animate-pulse" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
              <span className="badge" style={{ background: '#fff', color: '#dc2626', fontSize: '0.68rem', fontWeight: 800 }}>
                MEETING STARTING NOW
              </span>
              {globalAlarmToast.time && (
                <span style={{ fontSize: '0.74rem', opacity: 0.95, fontWeight: 600 }}>
                  ⏰ {globalAlarmToast.time}
                </span>
              )}
            </div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', lineHeight: '1.3' }}>
              {typeof globalAlarmToast === 'object' ? globalAlarmToast.title : globalAlarmToast}
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.2rem' }}>
              Jarvis AI spoke out: "Your scheduled meeting will start now."
            </p>
          </div>
          <button 
            onClick={() => setGlobalAlarmToast(null)}
            style={{ 
              background: 'rgba(0,0,0,0.4)', 
              border: '1px solid rgba(255,255,255,0.3)', 
              color: '#fff', 
              borderRadius: 'var(--radius-sm)', 
              padding: '0.45rem 0.75rem', 
              cursor: 'pointer', 
              fontSize: '0.78rem', 
              fontWeight: 700 
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hidden Audio Player for Syncing */}
      {activeMeeting && activeMeeting.meeting && (
        <audio 
          ref={audioRef}
          src={assetUrl(activeMeeting.meeting.audio_url)}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          style={{ display: 'none' }}
        />
      )}

      {/* Main Body Layout */}
      <main style={{ flex: 1, padding: '1.75rem 2.25rem', maxWidth: '1480px', width: '100%', margin: '0 auto' }}>
        
        {/* Audio Input Row: Live Device Recorder & File Uploader */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.35rem' }}>
          <AudioRecorder onRecordingComplete={handleAudioComplete} isProcessing={isProcessing} />
          <AudioUploader onFileUpload={handleAudioComplete} isProcessing={isProcessing} />
        </div>

        {/* Dynamic View Content */}
        {currentView === 'schedules' ? (
          <MeetingScheduler 
            onTriggerAlarm={(title, scheduledTimeStr, remType) => 
              triggerGlobalSpokenAlarm(title, scheduledTimeStr, remType || 'custom', 'MANUAL REMINDER')
            } 
          />
        ) : currentView === 'podcasts' ? (
          <PdfPodcastView />
        ) : currentView === 'archive' ? (
          <MeetingsArchive onSelectMeeting={loadMeetingDetails} />
        ) : activeMeeting ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', gap: '1.5rem', marginTop: '0.5rem' }}>
            
            {/* Left Column: Executive Summary, Decisions, Action Items & Speaker Analytics */}
            <InsightsDashboard 
              meetingData={activeMeeting}
              currentTime={currentTime}
              onSeekTo={handleSeekTo}
              onOpenEmailModal={() => setIsEmailModalOpen(true)}
              audioPlayerRef={audioRef}
            />

            {/* Right Column: Diarized Speaker Transcript View */}
            <TranscriptView 
              transcripts={activeMeeting.transcripts || []}
              currentTime={currentTime}
              onSeekTo={handleSeekTo}
            />

          </div>
        ) : (
          <div className="glass-panel animate-fade-in" style={{ padding: '4rem 2rem', textAlign: 'center', marginTop: '1rem' }}>
            <div style={{ 
              width: '72px', 
              height: '72px', 
              borderRadius: '50%', 
              background: 'rgba(99, 102, 241, 0.15)', 
              color: 'var(--primary)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 1.25rem auto',
              boxShadow: '0 0 24px var(--primary-glow)'
            }}>
              <Mic size={36} />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #ffffff 0%, #c084fc 50%, #67e8f9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Auralis AI is ready for your next insight session
            </h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', maxWidth: '540px', margin: '0 auto 1.5rem auto', lineHeight: '1.6' }}>
              Start a live background audio recording above or upload a multi-speaker audio file (.mp3, .wav, .m4a) to generate diarized transcripts, decisions, speaker analytics, and immersive spoken summaries.
            </p>
            <div style={{ maxWidth: '850px', margin: '0 auto', textAlign: 'left' }}>
              <JarvisAssistant activeMeetingId={null} />
            </div>
          </div>
        )}

      </main>

      {/* Email Draft Modal */}
      <EmailDraftModal 
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        meetingId={activeMeeting?.meeting?.id}
        initialEmail=""
      />



      {/* Floating Overlay & PiP App */}
      <FloatingWidget 
        isOpen={isFloatingAppOpen}
        onClose={() => setIsFloatingAppOpen(false)}
        onRecordingComplete={handleAudioComplete}
        activeMeetingId={activeMeeting?.meeting?.id}
      />

    </div>
  );
}

