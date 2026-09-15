import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Pause, Play, Radio, Volume2, ShieldAlert, Sparkles, Layers } from 'lucide-react';

export default function AudioRecorder({ onRecordingComplete, isProcessing }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioSource, setAudioSource] = useState('dual'); // 'dual', 'system', or 'mic'
  const [activeSourceNotice, setActiveSourceNotice] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const audioContextRef = useRef(null);
  const rawSystemStreamRef = useRef(null);
  const rawMicStreamRef = useRef(null);

  useEffect(() => {
    return () => {
      stopRecordingCleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      let stream;
      let audioContextInstance = null;

      if (audioSource === 'dual') {
        // --- 1. DUAL AUDIO MODE: Capture Device Sound (Speakers) + Microphone (User) ---
        let systemStream = null;
        let micStream = null;

        // Capture System / Device Audio via displayMedia
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
            // CRITICAL FIX: Do NOT call videoTrack.stop() while recording, because on Windows Chrome stopping video track silently mutes system audio!
          } catch (e) {
            console.warn('[AudioRecorder] System audio prompt cancelled or unavailable:', e);
          }
        }

        // Capture Microphone Audio via getUserMedia
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          });
          rawMicStreamRef.current = micStream;
        } catch (e) {
          console.warn('[AudioRecorder] Microphone permission denied:', e);
        }

        if (!systemStream && !micStream) {
          alert('Could not access device sound or microphone. Please grant audio permission to record.');
          return;
        }

        // Mix both streams into a single unified stereo audio stream using Web Audio API
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContextInstance = new AudioCtx();
        audioContextRef.current = audioContextInstance;
        const destination = audioContextInstance.createMediaStreamDestination();

        let sourcesCount = 0;
        if (systemStream && systemStream.getAudioTracks().length > 0) {
          const systemSourceNode = audioContextInstance.createMediaStreamSource(systemStream);
          systemSourceNode.connect(destination);
          sourcesCount++;
        }

        if (micStream && micStream.getAudioTracks().length > 0) {
          const micSourceNode = audioContextInstance.createMediaStreamSource(micStream);
          micSourceNode.connect(destination);
          sourcesCount++;
        }

        stream = destination.stream;
        setActiveSourceNotice(
          sourcesCount > 1 
            ? '🎧 Dual Audio Active: Listening to Device Sound (Others) + Microphone (You)' 
            : systemStream 
              ? '🔊 Device Audio Active (System / Tab Sound)' 
              : '🎙️ Microphone Active'
        );

      } else if (audioSource === 'system') {
        // --- 2. SYSTEM AUDIO ONLY MODE ---
        if (navigator.mediaDevices.getDisplayMedia) {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false }
          });
          rawSystemStreamRef.current = displayStream;
          const audioTracks = displayStream.getAudioTracks();
          if (audioTracks.length === 0) {
            alert('No system audio track selected! Please ensure "Share system audio" or "Share tab audio" is enabled.');
            displayStream.getTracks().forEach(t => t.stop());
            return;
          }
          stream = new MediaStream(audioTracks);
          setActiveSourceNotice('🔊 Listening to Device Audio (Zoom, Meet, Teams)');
        }
      } else {
        // --- 3. MICROPHONE ONLY MODE ---
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        rawMicStreamRef.current = stream;
        setActiveSourceNotice('🎙️ Listening to Microphone Only');
      }

      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : 'audio/wav';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const fileExt = mimeType.includes('webm') ? 'webm' : 'wav';
        const file = new File([audioBlob], `live_meeting_${Date.now()}.${fileExt}`, { type: mimeType });
        onRecordingComplete(file, `Live Meeting - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      };

      mediaRecorder.start(1000); // Record in 1s slices
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      // Start Recording Timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Setup Real-time Visualizer Waveform
      setupVisualizer(stream);

    } catch (err) {
      console.error('Error starting live meeting recording:', err);
      alert('Could not start recording. Please grant audio permission.');
    }
  };

  const setupVisualizer = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = audioContextRef.current || new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      const draw = () => {
        if (!canvas) return;
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, '#6366f1');
          gradient.addColorStop(1, '#a855f7');

          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
          x += barWidth;
        }
      };

      draw();
    } catch (e) {
      console.warn('Audio Context visualizer error:', e);
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        clearInterval(timerRef.current);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      stopRecordingCleanup();
    }
  };

  const stopRecordingCleanup = () => {
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (rawSystemStreamRef.current) {
      rawSystemStreamRef.current.getTracks().forEach(t => t.stop());
      rawSystemStreamRef.current = null;
    }
    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getTracks().forEach(t => t.stop());
      rawMicStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
      
      {/* Recording Source Selection Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            border: isRecording ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(99, 102, 241, 0.4)'
          }}>
            {isRecording ? <div className="pulse-recording" /> : <Layers size={20} color="#6366f1" />}
          </div>
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Live Meeting Audio Recorder <span className="badge" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontSize: '0.7rem' }}>Full Dual Audio</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Captures device sound (Zoom, Meet, Teams guests) AND your microphone merged into one transcript.
            </p>
          </div>
        </div>

        {/* Source Mode Switcher */}
        {!isRecording && (
          <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-muted)' }}>
            <button
              onClick={() => setAudioSource('dual')}
              style={{
                background: audioSource === 'dual' ? 'var(--primary)' : 'transparent',
                color: '#fff',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Layers size={14} /> Full Dual Audio (Device Sound + Mic)
            </button>
            <button
              onClick={() => setAudioSource('system')}
              style={{
                background: audioSource === 'system' ? 'var(--primary)' : 'transparent',
                color: '#fff',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Volume2 size={14} /> Device Sound Only
            </button>
            <button
              onClick={() => setAudioSource('mic')}
              style={{
                background: audioSource === 'mic' ? 'var(--primary)' : 'transparent',
                color: '#fff',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Mic size={14} /> Mic Only
            </button>
          </div>
        )}
      </div>

      {/* Helpful Audio Sharing Tip Banner */}
      {!isRecording && audioSource !== 'mic' && (
        <div style={{ 
          background: 'rgba(99, 102, 241, 0.08)', 
          border: '1px solid rgba(99, 102, 241, 0.25)', 
          padding: '0.65rem 0.85rem', 
          borderRadius: 'var(--radius-md)', 
          marginBottom: '1rem',
          textAlign: 'left',
          fontSize: '0.82rem',
          color: '#a5b4fc',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Sparkles size={16} color="#818cf8" style={{ flexShrink: 0 }} />
          <span>
            <strong>Pro Tip:</strong> When starting recording, check <strong>"Share System Audio"</strong> or <strong>"Share Tab Audio"</strong> in the browser prompt so the AI captures all other meeting participants speaking!
          </span>
        </div>
      )}

      {/* Real-time Waveform Canvas */}
      <div style={{ 
        height: '60px', 
        background: 'rgba(10, 15, 26, 0.8)', 
        borderRadius: 'var(--radius-md)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        margin: '1rem 0',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--border-muted)'
      }}>
        <canvas ref={canvasRef} width="500" height="60" style={{ width: '100%', height: '100%' }} />
        
        {!isRecording && (
          <span style={{ position: 'absolute', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Click "Start Recording" to listen to all meeting participants & device sound
          </span>
        )}
      </div>

      {/* Control Action Buttons & Live Timer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isRecording && (
            <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              REC • {formatTime(recordingTime)}
            </span>
          )}
          {isRecording && activeSourceNotice && (
            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', fontSize: '0.75rem' }}>
              {activeSourceNotice}
            </span>
          )}
          {isPaused && (
            <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              PAUSED
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {!isRecording ? (
            <button className="btn-primary" onClick={startRecording} disabled={isProcessing}>
              <Radio size={16} /> Start Recording Meeting
            </button>
          ) : (
            <>
              <button className="btn-secondary" onClick={pauseRecording}>
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn-danger" onClick={stopRecording}>
                <Square size={16} /> Stop & Analyze Meeting
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
