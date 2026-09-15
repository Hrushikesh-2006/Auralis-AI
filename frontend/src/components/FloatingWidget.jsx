import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Radio,
  Minimize2,
  ExternalLink,
  X,
  Send,
  Volume2,
  VolumeX,
  Loader2,
  Mic,
  Square,
  Sparkles,
  Zap,
  CheckCircle2,
  FileText,
  Clock
} from 'lucide-react';
import { useJarvisVoice } from '../services/useJarvisVoice';
import { jarvisVoiceService } from '../services/JarvisVoiceService';
import { apiUrl } from '../services/api';

export default function FloatingWidget({
  isOpen,
  onClose,
  onRecordingComplete,
  activeMeetingId
}) {
  const {
    isListening,
    micPermissionGranted,
    isSpeaking,
    isThinking,
    isPushToTalkActive,
    voiceMuted,
    messages,
    requestMicPermission,
    toggleVoiceMute,
    triggerPushToTalk,
    sendQuery,
    stopAllAudio
  } = useJarvisVoice(activeMeetingId);

  const [isMinimized, setIsMinimized] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [pipContainer, setPipContainer] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const clampPosition = (x, y, width = 390, height = 620) => {
    if (typeof window === 'undefined') return { x: 24, y: 24 };
    const padding = 12;
    const maxX = Math.max(padding, window.innerWidth - width - padding);
    const maxY = Math.max(padding, window.innerHeight - height - padding);
    return {
      x: Math.min(Math.max(x, padding), maxX),
      y: Math.min(Math.max(y, padding), maxY)
    };
  };
  const [position, setPosition] = useState(() => {
    if (typeof window === 'undefined') return { x: 24, y: 24 };
    try {
      const saved = JSON.parse(localStorage.getItem('floating_copilot_position') || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        return clampPosition(saved.x, saved.y, 390, 620);
      }
    } catch {}
    return {
      x: Math.max(12, window.innerWidth - 414),
      y: Math.max(12, window.innerHeight - 624)
    };
  });

  // Live Meeting Recording State inside Floating Widget
  const [isRecordingMeeting, setIsRecordingMeeting] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioSource, setAudioSource] = useState('dual'); // 'dual', 'system', 'mic'

  const pipWindowRef = useRef(null);
  const dragRef = useRef(null);
  const chatScrollRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const rawSystemStreamRef = useRef(null);
  const rawMicStreamRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event) => {
      if (!dragRef.current) return;
      const nextX = dragRef.current.startX + event.clientX - dragRef.current.pointerX;
      const nextY = dragRef.current.startY + event.clientY - dragRef.current.pointerY;
      const clamped = clampPosition(nextX, nextY, dragRef.current.width, dragRef.current.height);
      setPosition(clamped);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!pipContainer) {
      localStorage.setItem('floating_copilot_position', JSON.stringify(position));
    }
  }, [position, pipContainer]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isThinking, isProcessingAudio]);

  const closePiP = () => {
    const pipWindow = pipWindowRef.current;
    setPipContainer(null);
    pipWindowRef.current = null;
    if (pipWindow && !pipWindow.closed) {
      try { pipWindow.close(); } catch {}
    }
  };

  useEffect(() => {
    if (isOpen) {
      jarvisVoiceService.setFloatingModeActive(true);
    } else {
      jarvisVoiceService.setFloatingModeActive(false);
      closePiP();
      stopAllAudio();
      stopMeetingRecording(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      jarvisVoiceService.setFloatingModeActive(false);
      closePiP();
      stopAllAudio();
      stopMeetingRecording(false);
    };
  }, []);

  // --- Meeting Recording Logic in Floating Widget ---
  const startMeetingRecording = async () => {
    try {
      let stream;
      let audioContextInstance = null;

      if (audioSource === 'dual') {
        let systemStream = null;
        let micStream = null;

        if (navigator.mediaDevices.getDisplayMedia) {
          try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            rawSystemStreamRef.current = displayStream;
            const systemTracks = displayStream.getAudioTracks();
            if (systemTracks.length > 0) {
              systemStream = new MediaStream(systemTracks);
            }
          } catch (e) {
            console.warn('[FloatingWidget] System audio prompt skipped:', e);
          }
        }

        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
          rawMicStreamRef.current = micStream;
        } catch (e) {
          console.warn('[FloatingWidget] Mic stream denied:', e);
        }

        if (!systemStream && !micStream) {
          alert('Could not access microphone or device audio. Please allow permissions.');
          return;
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContextInstance = new AudioCtx();
        audioContextRef.current = audioContextInstance;
        const destination = audioContextInstance.createMediaStreamDestination();

        if (systemStream && systemStream.getAudioTracks().length > 0) {
          audioContextInstance.createMediaStreamSource(systemStream).connect(destination);
        }
        if (micStream && micStream.getAudioTracks().length > 0) {
          audioContextInstance.createMediaStreamSource(micStream).connect(destination);
        }

        stream = destination.stream;
      } else if (audioSource === 'system') {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        rawSystemStreamRef.current = displayStream;
        const systemTracks = displayStream.getAudioTracks();
        if (systemTracks.length === 0) {
          alert('No tab or device audio track shared.');
          return;
        }
        stream = new MediaStream(systemTracks);
      } else {
        // Mic only
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        rawMicStreamRef.current = micStream;
        stream = micStream;
      }

      audioChunksRef.current = [];
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : { mimeType: 'audio/webm' };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `floating_meeting_${Date.now()}.webm`, { type: 'audio/webm' });
        await handleUploadRecordedMeeting(audioFile);
      };

      mediaRecorder.start(1000);
      setIsRecordingMeeting(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[FloatingWidget] Error starting meeting recording:', err);
      alert('Could not start meeting recording. Please grant audio permission.');
    }
  };

  const stopMeetingRecording = (process = true) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && isRecordingMeeting) {
      if (!process) {
        mediaRecorderRef.current.onstop = null;
      }
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    if (rawSystemStreamRef.current) {
      rawSystemStreamRef.current.getTracks().forEach((t) => t.stop());
      rawSystemStreamRef.current = null;
    }
    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getTracks().forEach((t) => t.stop());
      rawMicStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }

    setIsRecordingMeeting(false);
  };

  const handleUploadRecordedMeeting = async (file) => {
    setIsProcessingAudio(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', `Live Meeting (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);

      const resp = await fetch(apiUrl('/api/process-audio'), {
        method: 'POST',
        body: formData
      });
      const data = await resp.json();

      if (data.data) {
        const newMeeting = data.data;
        const mtgId = newMeeting.meeting?.id;
        const mtgTitle = newMeeting.meeting?.title || 'Recorded Meeting';
        const summary = newMeeting.meeting?.summary || 'Meeting analysis complete.';

        // Set as active meeting in global service
        jarvisVoiceService.setActiveMeetingId(mtgId);

        if (onRecordingComplete) {
          onRecordingComplete(file, mtgTitle);
        }

        // Notify in Floating Copilot Chat
        sendQuery(`I just finished recording "${mtgTitle}". Please give me an executive summary and explain what happened in this meeting.`);
      }
    } catch (err) {
      console.error('[FloatingWidget] Audio processing failed:', err);
      alert('Error analyzing recorded meeting audio.');
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const copyStylesToPiP = (pipWindow) => {
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
        const style = pipWindow.document.createElement('style');
        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch {
        if (styleSheet.href) {
          const link = pipWindow.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = styleSheet.href;
          pipWindow.document.head.appendChild(link);
        }
      }
    });
  };

  const startPanelDrag = (event, isPiP) => {
    if (isPiP || event.button !== 0) return;
    if (event.target.closest('button, input, textarea, select, a')) return;

    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: position.x,
      startY: position.y,
      width: 390,
      height: 620
    };
    setIsDragging(true);
  };

  const startMiniDrag = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: position.x,
      startY: position.y,
      width: 200,
      height: 52
    };
    setIsDragging(true);
  };

  const handleLaunchNativePiP = async () => {
    if (!('documentPictureInPicture' in window)) {
      alert('Always-on-top Picture-in-Picture needs Chrome or Edge with Document Picture-in-Picture support.');
      return;
    }

    try {
      closePiP();
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 440,
        height: 650
      });

      pipWindow.document.title = 'Floating Voice Co-Pilot';
      pipWindow.document.body.style.margin = '0';
      pipWindow.document.body.style.background = '#070a12';
      pipWindow.document.body.style.overflow = 'hidden';
      copyStylesToPiP(pipWindow);

      const container = pipWindow.document.createElement('div');
      container.style.width = '100vw';
      container.style.height = '100vh';
      pipWindow.document.body.appendChild(container);

      pipWindow.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        setPipContainer(null);
      });

      pipWindowRef.current = pipWindow;
      setPipContainer(container);
      setIsMinimized(false);
    } catch (err) {
      console.error('Error launching Document PiP:', err);
      alert('Could not open always-on-top mode.');
    }
  };

  const handleMiniChatSubmit = (e) => {
    e.preventDefault();
    if (!chatQuery.trim() || isThinking) return;
    const text = chatQuery.trim();
    setChatQuery('');
    sendQuery(text);
  };

  const handlePushToTalk = () => {
    triggerPushToTalk((interim) => {
      setChatQuery(interim);
    });
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  if (isMinimized && !pipContainer) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        onPointerDown={startMiniDrag}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)',
          color: '#fff',
          padding: '0.65rem 1.15rem',
          borderRadius: '9999px',
          boxShadow: '0 8px 32px rgba(99, 102, 241, 0.5)',
          cursor: isDragging ? 'grabbing' : 'grab',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: 600,
          fontSize: '0.85rem',
          userSelect: isDragging ? 'none' : 'auto'
        }}
      >
        <Radio size={16} className="animate-pulse" /> Floating Co-Pilot
      </div>
    );
  }

  const widgetContent = (isPiP = false) => (
    <div
      className="floating-overlay-widget"
      style={isPiP ? {
        position: 'static',
        width: '100vw',
        height: '100vh',
        maxHeight: 'none',
        borderRadius: 0,
        border: 'none',
        boxShadow: 'none'
      } : {
        left: `${position.x}px`,
        top: `${position.y}px`,
        right: 'auto',
        bottom: 'auto',
        cursor: isDragging ? 'grabbing' : undefined,
        userSelect: isDragging ? 'none' : undefined
      }}
    >
      {/* Header */}
      <div className="floating-overlay-header" onPointerDown={(event) => startPanelDrag(event, isPiP)} style={{ cursor: isPiP ? undefined : (isDragging ? 'grabbing' : 'grab') }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Radio size={16} color={isListening ? "#34d399" : "#f59e0b"} className={isListening ? "animate-pulse" : ""} />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff', fontFamily: 'var(--font-display)' }}>Floating Voice Co-Pilot</span>
          {isSpeaking ? (
            <span className="badge" style={{ background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', fontSize: '0.65rem' }}>
              <Volume2 size={10} /> Speaking
            </span>
          ) : isListening ? (
            <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee', fontSize: '0.65rem' }}>
              <Zap size={10} /> Voice Active
            </span>
          ) : (
            <span className="badge" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', fontSize: '0.65rem' }}>
              Mic Off
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            type="button"
            onClick={toggleVoiceMute}
            title={voiceMuted ? "Unmute spoken replies" : "Mute spoken replies"}
            style={{ background: 'none', border: 'none', color: voiceMuted ? '#f43f5e' : '#34d399', cursor: 'pointer', padding: '2px' }}
          >
            {voiceMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {!isPiP ? (
            <button
              type="button"
              onClick={handleLaunchNativePiP}
              title="Display always-on-top over other apps"
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
            >
              <ExternalLink size={15} />
            </button>
          ) : null}

          {!isPiP ? (
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              title="Minimize to floating pill"
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
            >
              <Minimize2 size={15} />
            </button>
          ) : null}

          <button
            type="button"
            onClick={isPiP ? closePiP : onClose}
            title={isPiP ? 'Close always-on-top window' : 'Close floating app'}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div style={{ padding: '0.85rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
        
        {/* Meeting Recorder Bar in Floating Widget */}
        <div style={{
          background: isRecordingMeeting ? 'rgba(239, 68, 68, 0.12)' : 'rgba(15, 23, 42, 0.85)',
          border: `1px solid ${isRecordingMeeting ? '#ef4444' : 'var(--border-muted)'}`,
          padding: '0.65rem 0.85rem',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className={isRecordingMeeting ? "pulse-recording" : ""} style={!isRecordingMeeting ? { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' } : undefined} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isRecordingMeeting ? '#ef4444' : '#fff' }}>
                {isRecordingMeeting ? `Recording Meeting (${formatTime(recordingSeconds)})` : 'Meeting Audio Recorder'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {isRecordingMeeting ? 'Listening & capturing discussion' : 'Record meeting to ask & summarize'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {!isRecordingMeeting ? (
              <button
                type="button"
                onClick={startMeetingRecording}
                disabled={isProcessingAudio}
                className="btn-primary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
              >
                <Mic size={13} /> Start Recording
              </button>
            ) : (
              <button
                type="button"
                onClick={() => stopMeetingRecording(true)}
                className="btn-primary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: '#dc2626' }}
              >
                <Square size={13} /> Stop & Process
              </button>
            )}
          </div>
        </div>

        {/* Processing Banner */}
        {isProcessingAudio && (
          <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Loader2 size={14} className="animate-spin" /> Processing meeting audio, extracting summary & insights...
          </div>
        )}

        {/* Quick Question Prompts */}
        <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
          {[
            'Summarize this meeting',
            'What decisions were made?',
            'What are the action items?',
            'Explain everything that happened'
          ].map((promptText, pIdx) => (
            <button
              key={pIdx}
              type="button"
              onClick={() => sendQuery(promptText)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '9999px',
                padding: '0.25rem 0.6rem',
                fontSize: '0.7rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <Sparkles size={10} color="#818cf8" /> {promptText}
            </button>
          ))}
        </div>

        {/* Message Logs */}
        <div 
          ref={chatScrollRef}
          style={{ flex: 1, background: 'rgba(0, 0, 0, 0.25)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', minHeight: 0, overflowY: 'auto' }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                background: m.sender === 'user' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)' : 'rgba(255, 255, 255, 0.06)',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.82rem',
                lineHeight: '1.45',
                color: '#fff'
              }}
            >
              {m.text}
            </div>
          ))}
          {isThinking && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Loader2 size={13} className="animate-spin" /> Jarvis thinking & preparing voice reply...
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleMiniChatSubmit} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={isPushToTalkActive ? "Listening to voice..." : "Say 'Hey Jarvis' or ask about meeting..."}
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              className="input-field"
              style={{ 
                fontSize: '0.82rem', 
                padding: '0.45rem 2.2rem 0.45rem 0.75rem', 
                height: '36px',
                borderColor: isPushToTalkActive ? '#ef4444' : undefined 
              }}
            />
            <button
              type="button"
              onClick={handlePushToTalk}
              title={isPushToTalkActive ? "Stop listening" : "Click to speak"}
              style={{
                position: 'absolute',
                right: '6px',
                background: isPushToTalkActive ? '#ef4444' : 'transparent',
                border: 'none',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isPushToTalkActive ? '#fff' : '#06b6d4',
                cursor: 'pointer'
              }}
            >
              <Mic size={14} className={isPushToTalkActive ? "animate-pulse" : ""} />
            </button>
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            style={{ padding: '0.45rem 0.85rem', height: '36px' }} 
            disabled={isThinking || !chatQuery.trim()}
          >
            <Send size={14} />
          </button>
        </form>

      </div>
    </div>
  );

  if (pipContainer) {
    return createPortal(widgetContent(true), pipContainer);
  }

  return widgetContent(false);
}