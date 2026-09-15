import React, { useState } from 'react';
import { Play, Search, MessageSquare, Clock, User, Smile, Meh, Frown } from 'lucide-react';

export default function TranscriptView({ transcripts, currentTime, onSeekTo }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTranscripts = transcripts.filter(t => 
    t.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.speaker.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSpeakerBadgeClass = (speaker) => {
    if (speaker.includes('1') || speaker.includes('Alex')) return 'badge-speaker-1';
    if (speaker.includes('2') || speaker.includes('Sarah')) return 'badge-speaker-2';
    if (speaker.includes('3') || speaker.includes('David')) return 'badge-speaker-3';
    return 'badge-speaker-4';
  };

  const getSentimentIcon = (sentiment) => {
    const s = (sentiment || '').toLowerCase();
    if (s.includes('pos')) return <Smile size={13} color="#34d399" />;
    if (s.includes('neg') || s.includes('constructive')) return <Frown size={13} color="#fb7185" />;
    return <Meh size={13} color="#94a3b8" />;
  };

  const formatTimestamp = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={20} color="var(--primary)" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Diarized Transcript</h3>
          <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary)' }}>
            {transcripts.length} Turns
          </span>
        </div>

        {/* Real-time Filter */}
        <div style={{ position: 'relative', width: '220px' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ paddingLeft: '2rem', fontSize: '0.8rem', height: '32px' }}
          />
        </div>
      </div>

      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        paddingRight: '0.5rem', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '0.75rem',
        maxHeight: '480px'
      }}>
        {filteredTranscripts.length === 0 ? (
          <div style={{ textTransform: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
            No transcript matches found for "{searchTerm}".
          </div>
        ) : (
          filteredTranscripts.map((item, idx) => {
            const isPlaying = currentTime >= item.start_time && currentTime <= item.end_time;
            return (
              <div
                key={idx}
                className="glass-card"
                onClick={() => onSeekTo(item.start_time)}
                style={{
                  background: isPlaying ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  borderColor: isPlaying ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                  cursor: 'pointer',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`badge ${getSpeakerBadgeClass(item.speaker)}`}>
                      <User size={10} /> {item.speaker}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <Clock size={11} /> {formatTimestamp(item.start_time)} - {formatTimestamp(item.end_time)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {getSentimentIcon(item.sentiment)}
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isPlaying ? 'var(--primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Jump audio to timestamp"
                    >
                      <Play size={13} fill={isPlaying ? 'var(--primary)' : 'none'} />
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: '1.45' }}>
                  {item.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
