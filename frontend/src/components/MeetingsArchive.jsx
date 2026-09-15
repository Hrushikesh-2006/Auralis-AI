import React, { useState, useEffect } from 'react';
import { Search, Calendar, Users, Clock, ChevronRight, FileText, Sparkles } from 'lucide-react';
import { apiUrl } from '../services/api';

export default function MeetingsArchive({ onSelectMeeting }) {
  const [meetings, setMeetings] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMeetings();
  }, [searchQuery]);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const url = searchQuery 
        ? apiUrl(`/api/meetings?q=${encodeURIComponent(searchQuery)}`)
        : apiUrl('/api/meetings');
      const resp = await fetch(url);
      const data = await resp.json();
      setMeetings(data);
    } catch (e) {
      console.error('Failed to fetch meetings:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    return `${mins} min`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Search Header */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>Past Meetings Archive</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Search across past meeting transcripts, key decisions, and speaker insights</p>
        </div>

        <div style={{ position: 'relative', width: '320px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text"
            placeholder="Search keywords, decisions, speakers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field"
            style={{ paddingLeft: '2.4rem' }}
          />
        </div>
      </div>

      {/* List of Meetings */}
      {loading ? (
        <div style={{ textTransform: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
          Searching meeting history...
        </div>
      ) : meetings.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textTransform: 'center', color: 'var(--text-muted)' }}>
          <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p style={{ fontSize: '1rem', fontWeight: 500 }}>No past meetings found</p>
          <p style={{ fontSize: '0.85rem' }}>Upload an audio file or start a live recording to populate your dashboard history.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {meetings.map((m) => (
            <div 
              key={m.id}
              className="glass-card"
              onClick={() => onSelectMeeting(m.id)}
              style={{
                padding: '1.25rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                    <Calendar size={10} /> {new Date(m.date).toLocaleDateString()}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={11} /> {formatDuration(m.duration_seconds)}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem', color: '#fff' }}>
                  {m.title}
                </h3>

                <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: '1.45', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {m.summary || 'Click to view diarized transcripts, extracted action items, and per-speaker analytics.'}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-muted)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Users size={12} /> {m.speaker_count || 2} Speakers
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  View Insights <ChevronRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
