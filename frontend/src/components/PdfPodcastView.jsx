import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  UploadCloud, 
  Play, 
  Pause, 
  Radio, 
  Sparkles, 
  FileText, 
  Download, 
  User, 
  Clock, 
  Headphones,
  Loader2,
  Volume2,
  RotateCcw,
  RotateCw
} from 'lucide-react';
import { apiUrl, assetUrl } from '../services/api';

export default function PdfPodcastView() {
  const [podcasts, setPodcasts] = useState([]);
  const [activePodcast, setActivePodcast] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formatStyle, setFormatStyle] = useState('podcast'); // 'podcast' or 'narration'
  
  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchPodcasts();
  }, []);

  const fetchPodcasts = async () => {
    try {
      const resp = await fetch(apiUrl('/api/podcasts'));
      const data = await resp.json();
      setPodcasts(data);
      if (data && data.length > 0 && !activePodcast) {
        setActivePodcast(data[0]);
      }
    } catch (e) {
      console.error('Failed to fetch podcasts:', e);
    }
  };

  const handleDocumentUpload = async (file) => {
    if (!file) return;

    const supportedExtensions = [
      '.pdf', '.txt', '.md', '.doc', '.docx', '.ppt', '.pptx', '.csv', '.json',
      '.yaml', '.yml', '.xml', '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.py',
      '.java', '.cs', '.cpp', '.c', '.go', '.rs', '.php', '.sql', '.png', '.jpg', '.jpeg',
      '.gif', '.webp', '.bmp', '.tiff'
    ];

    const fileName = file.name || '';
    const lowerName = fileName.toLowerCase();
    const hasSupportedType = supportedExtensions.some((ext) => lowerName.endsWith(ext));

    if (!hasSupportedType) {
      alert('Please upload a supported document or media file such as PDF, TXT, PPT, DOC, image, code, or notes.');
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('style', formatStyle);

      const resp = await fetch(apiUrl('/api/podcasts/process-pdf'), {
        method: 'POST',
        body: formData
      });
      const resData = await resp.json();
      if (resData.data) {
        setActivePodcast(resData.data);
        fetchPodcasts();
      }
    } catch (e) {
      console.error('Document podcast generation error:', e);
      alert('Error generating the spoken summary. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleSeekChange = (e) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  };

  const handleSeekRelative = (seconds) => {
    if (audioRef.current) {
      const maxDur = duration || activePodcast?.duration_seconds || 100;
      const newTime = Math.max(0, Math.min(audioRef.current.currentTime + seconds, maxDur));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSeekToSection = (sectionIdx, totalSections) => {
    const maxDur = duration || activePodcast?.duration_seconds || 60;
    const targetTime = (sectionIdx / Math.max(1, totalSections)) * maxDur;
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
      audioRef.current.play();
      setIsPlaying(true);
      setCurrentTime(targetTime);
    }
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const maxDuration = duration || activePodcast?.duration_seconds || 100;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / (maxDuration || 1)) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
              <Headphones size={11} /> Solo Expressive Narrator Audiobook & Detailed Summary
            </span>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Transform Books (PDFs) into AI Audiobooks</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Upload any book as a PDF for a passionate, single-narrator detailed audio breakdown with interactive timeline seeking.
          </p>
        </div>

        {/* Style Selector */}
        <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-muted)' }}>
          <button
            onClick={() => setFormatStyle('podcast')}
            style={{
              background: formatStyle === 'podcast' ? 'var(--primary)' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '0.45rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <BookOpen size={14} /> Solo Expressive Narrator Summary
          </button>
        </div>
      </div>

      {/* PDF Upload Dropzone */}
      <div 
        className="glass-panel"
        style={{
          padding: '2rem',
          textAlign: 'center',
          border: '2px dashed var(--border-muted)',
          cursor: 'pointer',
          background: 'var(--bg-card)'
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.doc,.docx,.ppt,.pptx,.csv,.json,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.cs,.cpp,.c,.go,.rs,.php,.sql,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff"
          onChange={(e) => e.target.files && handleDocumentUpload(e.target.files[0])}
          style={{ display: 'none' }}
        />

        <div style={{ 
          width: '56px', 
          height: '56px', 
          borderRadius: '50%', 
          background: 'rgba(168, 85, 247, 0.15)', 
          color: '#a855f7',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          margin: '0 auto 1rem auto'
        }}>
          {isProcessing ? <Loader2 size={28} className="animate-spin" /> : <UploadCloud size={28} />}
        </div>

        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>
          {isProcessing ? 'Generating AI spoken summary from your document...' : 'Upload PDF, Notes, Code, Images, or Slides'}
        </h3>
        
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto' }}>
          Drag and drop your PDF, text file, notes, image, code file, presentation, or document here. The AI will read the content, understand the context, and speak a clean summary back to you.
        </p>
      </div>

      {/* Active Podcast Player & Script View */}
      {activePodcast && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '1.5rem' }}>
          
          {/* Main Podcast Player & Interactive Timeline Scrubber */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            <div className="glass-panel" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
                  <Headphones size={11} /> Now Playing AI Audiobook
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c084fc' }}>
                  {formatSeconds(currentTime)} / {formatSeconds(maxDuration)}
                </span>
              </div>

              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.5rem' }}>{activePodcast.title}</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.5', marginBottom: '1.25rem' }}>
                {activePodcast.summary}
              </p>

              {/* Interactive Audio Progress Line / Scrubber Slider */}
              <div style={{ margin: '1.25rem 0 1rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: '#c084fc', fontWeight: 700 }}>{formatSeconds(currentTime)}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Seek to any point using line cursor</span>
                  <span>{formatSeconds(maxDuration)}</span>
                </div>

                <input 
                  type="range"
                  min="0"
                  max={maxDuration || 100}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeekChange}
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '4px',
                    background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${progressPercent}%, rgba(255, 255, 255, 0.15) ${progressPercent}%, rgba(255, 255, 255, 0.15) 100%)`,
                    accentColor: '#a855f7',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Controls Row: Rewind -10s, Play/Pause, Forward +10s, Speed, Download */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {/* Rewind -10s */}
                  <button
                    onClick={() => handleSeekRelative(-10)}
                    className="btn-secondary"
                    title="Rewind 10 seconds"
                    style={{ padding: '0.5rem 0.7rem', borderRadius: '50%', justifyContent: 'center' }}
                  >
                    <RotateCcw size={16} />
                  </button>

                  {/* Play / Pause */}
                  <button
                    onClick={handlePlayPause}
                    className="btn-primary"
                    style={{ borderRadius: '50%', width: '48px', height: '48px', padding: 0, justifyContent: 'center', boxShadow: '0 0 20px var(--primary-glow)' }}
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
                  </button>

                  {/* Fast Forward +10s */}
                  <button
                    onClick={() => handleSeekRelative(10)}
                    className="btn-secondary"
                    title="Forward 10 seconds"
                    style={{ padding: '0.5rem 0.7rem', borderRadius: '50%', justifyContent: 'center' }}
                  >
                    <RotateCw size={16} />
                  </button>
                </div>

                {/* Speed Controls */}
                <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '0.3rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-muted)' }}>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleSpeedChange(rate)}
                      style={{
                        background: playbackRate === rate ? 'var(--primary)' : 'transparent',
                        color: '#fff',
                        border: 'none',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {/* Download Audio */}
                <a 
                  href={assetUrl(activePodcast.audio_url)}
                  download 
                  className="btn-secondary" 
                  style={{ textDecoration: 'none', fontSize: '0.82rem' }}
                >
                  <Download size={15} /> Download MP3
                </a>
              </div>

              {/* HTML5 Audio Element */}
              <audio
                ref={audioRef}
                src={assetUrl(activePodcast.audio_url)}
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.target.duration)}
                onEnded={() => setIsPlaying(false)}
                style={{ display: 'none' }}
              />
            </div>

            {/* Saved Audiobooks Grid */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <BookOpen size={18} color="var(--primary)" /> Saved Audio Books & Summaries ({podcasts.length})
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
                {podcasts.map((p) => (
                  <div
                    key={p.id}
                    className="glass-card"
                    onClick={() => setActivePodcast(p)}
                    style={{
                      padding: '0.85rem',
                      cursor: 'pointer',
                      borderColor: activePodcast?.id === p.id ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                      background: activePodcast?.id === p.id ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontSize: '0.68rem' }}>
                        Solo Audiobook Summary
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {formatSeconds(p.duration_seconds)}
                      </span>
                    </div>
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff', marginBottom: '0.25rem' }}>{p.title}</h4>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Solo Narrator Detailed Audiobook Sections */}
          <div className="glass-panel" style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <BookOpen size={18} color="#c084fc" /> Detailed Audiobook Sections & Timestamps
            </h3>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '560px' }}>
              {activePodcast.script && activePodcast.script.map((turn, idx) => (
                <div 
                  key={idx} 
                  className="glass-card" 
                  style={{ 
                    padding: '0.9rem 1rem',
                    background: 'rgba(168, 85, 247, 0.06)',
                    borderColor: 'rgba(168, 85, 247, 0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                    <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontSize: '0.7rem', fontWeight: 700 }}>
                      <User size={10} /> {turn.speaker || 'AI Narrator'} {turn.section ? `• ${turn.section}` : ''}
                    </span>

                    <button 
                      onClick={() => handleSeekToSection(idx, activePodcast.script.length)}
                      className="btn-secondary"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', color: '#c084fc', gap: '0.25rem' }}
                    >
                      <Play size={10} /> Play section
                    </button>
                  </div>

                  <p style={{ fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
                    {turn.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
