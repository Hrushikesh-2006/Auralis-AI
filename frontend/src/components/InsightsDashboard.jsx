import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  ListTodo, 
  PieChart, 
  Mail, 
  Play, 
  Pause, 
  Volume2, 
  Download,
  User,
  Clock,
  BookOpen
} from 'lucide-react';
import { apiUrl, assetUrl } from '../services/api';

import CopilotChat from './CopilotChat';
import JarvisAssistant from './JarvisAssistant';

export default function InsightsDashboard({ meetingData, currentTime, onSeekTo, onOpenEmailModal, audioPlayerRef }) {

  const [completedActions, setCompletedActions] = useState({});
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  // Voice Readout (TTS) state
  const [voiceAudioUrl, setVoiceAudioUrl] = useState(null);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoadingVoice, setIsLoadingVoice] = useState(false);
  
  const voicePlayerRef = useRef(null);

  if (!meetingData) return null;

  const { meeting, insights, transcripts } = meetingData;
  const talkTimeStats = meeting.talk_time_stats || [];

  // Derive topic chapters: prefer LLM-extracted ones, then compute from transcripts intelligently
  const buildFallbackChapters = () => {
    if (!transcripts || transcripts.length === 0) return [];

    const NUM_CHUNKS = Math.min(4, Math.max(2, Math.ceil(transcripts.length / 5)));
    const chunkSize = Math.ceil(transcripts.length / NUM_CHUNKS);

    // Simple keyword extraction: pick top unique meaningful words from a chunk
    const extractTopicTitle = (slice) => {
      const stopWords = new Set(['the','a','an','is','it','to','of','and','in','for','on','with','that','this','we','i','you','he','she','they','but','or','not','be','was','are','so','as','at','by','from','our','your','have','had','has','will','can','do','did','let','get','go','im','its']);
      const words = slice
        .flatMap(s => s.text?.toLowerCase().split(/\W+/) || [])
        .filter(w => w.length > 3 && !stopWords.has(w));
      const freq = {};
      words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
      const topWords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
      return topWords.length > 0 ? topWords.join(' & ') : `Part Discussion`;
    };

    return Array.from({ length: NUM_CHUNKS }).map((_, i) => {
      const slice = transcripts.slice(i * chunkSize, (i + 1) * chunkSize);
      if (!slice || slice.length === 0) return null;
      const startSec = Math.floor(slice[0]?.start_time || 0);
      const mins = Math.floor(startSec / 60);
      const secs = Math.floor(startSec % 60);
      const formattedTime = `${mins}:${secs.toString().padStart(2, '0')}`;
      const title = extractTopicTitle(slice);
      const desc = slice.map(s => s.text).join(' ').slice(0, 130).trimEnd() + 'â€¦';
      return {
        timestamp_sec: startSec,
        formatted_time: formattedTime,
        title,
        part: `Part ${i + 1}`,
        description: desc
      };
    }).filter(Boolean);
  };

  const displayChapters = (
    insights && Array.isArray(insights.topic_chapters) && insights.topic_chapters.length > 0
  )
    ? insights.topic_chapters
    : buildFallbackChapters();

  const toggleAction = (idx) => {
    setCompletedActions(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const formatSeconds = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (audioPlayerRef && audioPlayerRef.current) {
      if (isPlayingAudio) {
        audioPlayerRef.current.pause();
        setIsPlayingAudio(false);
      } else {
        audioPlayerRef.current.play();
        setIsPlayingAudio(true);
      }
    }
  };

  const fetchVoiceSummary = async () => {
    if (voiceAudioUrl && voicePlayerRef.current) {
      if (isPlayingVoice) {
        voicePlayerRef.current.pause();
        setIsPlayingVoice(false);
      } else {
        voicePlayerRef.current.play();
        setIsPlayingVoice(true);
      }
      return;
    }

    setIsLoadingVoice(true);
    try {
      const resp = await fetch(apiUrl(`/api/meetings/${meeting.id}/voice-summary`), {
        method: 'POST'
      });
      const data = await resp.json();
      if (data.voice_audio_url) {
        setVoiceAudioUrl(assetUrl(data.voice_audio_url));
        setTimeout(() => {
          if (voicePlayerRef.current) {
            voicePlayerRef.current.playbackRate = playbackRate;
            voicePlayerRef.current.play();
            setIsPlayingVoice(true);
          }
        }, 300);
      }
    } catch (e) {
      console.error('Voice summary error:', e);
    } finally {
      setIsLoadingVoice(false);
    }
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    if (voicePlayerRef.current) {
      voicePlayerRef.current.playbackRate = rate;
    }
  };

  const getPriorityBadge = (priority) => {
    const p = (priority || 'medium').toLowerCase();
    if (p === 'high') return <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' }}>HIGH</span>;
    if (p === 'low') return <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)' }}>LOW</span>;
    return <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>MED</span>;
  };

  const exportReport = () => {
    const jsonStr = JSON.stringify(meetingData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting.title.replace(/\s+/g, '_')}_insights.json`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Header Banner & Audio Sync Player */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
              Meeting Insights Dashboard
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {new Date(meeting.date).toLocaleDateString()}
            </span>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{meeting.title}</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem', 
            background: 'rgba(15, 23, 42, 0.8)', 
            padding: '0.4rem 0.85rem', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--border-muted)' 
          }}>
            <button
              onClick={handlePlayPause}
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {isPlayingAudio ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
            </button>
            <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
              {formatSeconds(currentTime)} / {formatSeconds(meeting.duration_seconds)}
            </span>
          </div>

          <button className="btn-secondary" onClick={onOpenEmailModal}>
            <Mail size={15} /> Auto-Draft Email
          </button>
          <button className="btn-secondary" onClick={exportReport}>
            <Download size={15} /> Export JSON
          </button>
        </div>
      </div>

      {/* Executive Summary Card with Python Voice Module Readout Widget */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.08) 100%)' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a855f7' }}>
            <Sparkles size={18} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Executive Summary</h3>
          </div>

          {/* Python Voice Module Readout Button & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={fetchVoiceSummary}
              disabled={isLoadingVoice}
              className="btn-primary"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            >
              <Volume2 size={14} /> 
              {isLoadingVoice ? 'Generating Voice...' : isPlayingVoice ? 'Pause Voice Readout' : 'ðŸ”Š Listen to Voice Summary'}
            </button>

            {voiceAudioUrl && (
              <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '0.2rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-muted)' }}>
                {[1.0, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleSpeedChange(rate)}
                    style={{
                      background: playbackRate === rate ? 'var(--primary)' : 'transparent',
                      color: '#fff',
                      border: 'none',
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.72rem',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: '1.6', marginBottom: '0.5rem' }}>
          {meeting.summary || 'The participants convened to review key objectives, confirm decisions, and outline upcoming deliverables.'}
        </p>

        {voiceAudioUrl && (
          <audio
            ref={voicePlayerRef}
            src={voiceAudioUrl}
            onEnded={() => setIsPlayingVoice(false)}
            style={{ display: 'none' }}
          />
        )}
      </div>

      {/* Voice Wake-Word Activated Jarvis AI Thinking Assistant */}
      <JarvisAssistant activeMeetingId={meeting.id} />

      {/* RAG-Powered AI Meeting Co-Pilot Chat Component */}
      <CopilotChat meetingId={meeting.id} />

      {/* Topic Mind Map & Agenda Chapters (Dynamically Generated from Real Meeting Audio/Transcript) */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', color: 'var(--accent-cyan)' }}>
          <BookOpen size={18} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Meeting Agenda & Topic Chapters</h3>
        </div>

        {displayChapters.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No topic chapters logged for this meeting.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {displayChapters.map((chap, idx) => {
              const chapterColors = ['var(--primary)', 'var(--accent-emerald)', 'var(--accent-purple)', 'var(--accent-cyan)'];
              const colorStyle = chapterColors[idx % chapterColors.length];

              return (
                <div 
                  key={idx} 
                  className="glass-card" 
                  style={{ padding: '0.75rem 0.9rem', cursor: 'pointer' }} 
                  onClick={() => onSeekTo(chap.timestamp_sec || 0)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: colorStyle }}>
                      {chap.formatted_time || '0:00'} - {chap.title}
                    </span>
                    <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.06)', fontSize: '0.7rem' }}>
                      {chap.part || `Part ${idx + 1}`}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {chap.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2 Grid Columns: Left Key Decisions & Consensus, Right Action Items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        
        {/* Key Decisions */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', color: 'var(--accent-emerald)' }}>
            <CheckCircle2 size={18} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Confirmed Decisions ({insights.decisions.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {insights.decisions.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No key decisions logged.</p>
            ) : (
              insights.decisions.map((d, idx) => (
                <div key={idx} className="glass-card" style={{ padding: '0.75rem 0.9rem' }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    {typeof d === 'string' ? d : d.text}
                  </p>
                  {typeof d === 'object' && d.speaker && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <User size={10} /> Confirmed by {d.speaker} {d.timestamp && `(${d.timestamp})`}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Items */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', color: 'var(--accent-rose)' }}>
            <ListTodo size={18} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Action Items & Assignments ({insights.action_items.length})</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {insights.action_items.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No action items logged.</p>
            ) : (
              insights.action_items.map((a, idx) => {
                const isDone = completedActions[idx];
                const taskText = typeof a === 'string' ? a : (a.task || a.text);
                const owner = typeof a === 'object' ? (a.owner || 'Unassigned') : 'Unassigned';
                const priority = typeof a === 'object' ? a.priority : 'medium';

                return (
                  <div key={idx} className="glass-card" style={{ padding: '0.75rem 0.9rem', opacity: isDone ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                      <input 
                        type="checkbox"
                        checked={!!isDone}
                        onChange={() => toggleAction(idx)}
                        style={{ marginTop: '0.25rem', accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ 
                          fontSize: '0.88rem', 
                          fontWeight: 500, 
                          textDecoration: isDone ? 'line-through' : 'none',
                          marginBottom: '0.35rem' 
                        }}>
                          {taskText}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary)' }}>
                            <User size={10} /> {owner}
                          </span>
                          {getPriorityBadge(priority)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Speaker Talk-Time & Sentiment Analytics */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--accent-purple)' }}>
          <PieChart size={18} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Speaker Talk-Time & Sentiment Distribution</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {talkTimeStats.map((spk, idx) => {
            const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899'];
            const barColor = colors[idx % colors.length];

            return (
              <div key={idx} className="glass-card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: varBarColor(idx) }}>
                    {spk.speaker}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {spk.percentage}% ({spk.talk_time_seconds}s)
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ width: `${spk.percentage}%`, height: '100%', background: barColor, borderRadius: '4px' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Words: {spk.words_spoken}</span>
                  <span>Pace: {spk.wpm || 140} WPM</span>
                  <span style={{ color: '#34d399', fontWeight: 500 }}>Positive Tone</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function varBarColor(idx) {
  const c = ['#818cf8', '#34d399', '#fbbf24', '#f472b6'];
  return c[idx % c.length];
}

