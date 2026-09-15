import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  PlusCircle, 
  BellRing, 
  Trash2, 
  Volume2,
  AlarmClock,
  ChevronDown
} from 'lucide-react';
import { apiUrl } from '../services/api';

const REMIND_OPTIONS = [
  { label: '1 minute before', value: 1 },
  { label: '5 minutes before', value: 5 },
  { label: '10 minutes before', value: 10 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
];

export default function MeetingScheduler({ onTriggerAlarm }) {
  const [schedules, setSchedules] = useState([]);
  const [title, setTitle] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [description, setDescription] = useState('');
  const [remindBefore, setRemindBefore] = useState(1);
  const [loading, setLoading] = useState(false);
  const [activeAlarm, setActiveAlarm] = useState(null);

  useEffect(() => {
    fetchSchedules();

    // Set default datetime picker to +5 minutes from now
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    const isoStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setScheduledTime(isoStr);
  }, []);

  // NOTE: No local alarm polling here — the global checker in App.jsx handles all spoken alarms
  // to prevent multiple voices firing simultaneously.

  const fetchSchedules = async () => {
    try {
      const resp = await fetch(apiUrl('/api/schedules'));
      const data = await resp.json();
      const list = Array.isArray(data) ? data : (data.data || []);
      setSchedules(list);
    } catch (e) {
      console.warn('Schedule fetch error:', e);
    }
  };

  const handleAddSchedule = async (e) => {
    e.preventDefault();
    if (!title.trim() || !scheduledTime) return;

    setLoading(true);
    try {
      const resp = await fetch(apiUrl('/api/schedules'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          scheduled_time: scheduledTime,
          description: description.trim(),
          remind_before_minutes: remindBefore
        })
      });
      const data = await resp.json();
      if (data.data) {
        setSchedules(prev => [data.data, ...prev.filter(s => s.id !== data.data.id)]);
        setTitle('');
        setDescription('');
        await fetchSchedules();
      }
    } catch (e) {
      console.error('Failed to create schedule:', e);
      alert('Error saving schedule. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const updateScheduleStatus = async (id, status) => {
    try {
      await fetch(apiUrl(`/api/schedules/${id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await fetchSchedules();
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  const handleDelete = async (id) => {
    try {
      setSchedules(prev => prev.filter(s => s.id !== id));
      await fetch(apiUrl(`/api/schedules/${id}`), {
        method: 'DELETE'
      });
      await fetchSchedules();
    } catch (e) {
      console.error('Failed to delete schedule:', e);
    }
  };

  const setPresetTime = (minutesAhead) => {
    const target = new Date();
    target.setMinutes(target.getMinutes() + minutesAhead);
    const isoStr = new Date(target.getTime() - (target.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setScheduledTime(isoStr);
  };

  // Manual "Speak Reminder" button — delegates to App.jsx's global speaker to avoid voice overlap
  const handleManualSpeakReminder = async (item) => {
    const formattedTime = new Date(item.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActiveAlarm({ title: item.title, time: formattedTime });

    if (onTriggerAlarm) {
      onTriggerAlarm(item.title, item.scheduled_time, 'custom');
    }
    setTimeout(() => setActiveAlarm(null), 6000);
  };

  const remindLabel = (val) => {
    const opt = REMIND_OPTIONS.find(o => o.value === Number(val));
    return opt ? opt.label : `${val} min before`;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '1.5rem', marginTop: '1rem' }}>

      {/* Left Form: Add Schedule */}
      <div className="glass-card" style={{ padding: '1.75rem', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
          <div style={{ 
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-purple) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
          }}>
            <Calendar size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
              Schedule a Meeting
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Set real-time alarms with spoken voice reminders
            </span>
          </div>
        </div>

        <form onSubmit={handleAddSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              Meeting Title *
            </label>
            <input 
              type="text" 
              placeholder="e.g. Product Architecture Review" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{
                width: '100%',
                background: 'rgba(10, 15, 29, 0.8)',
                border: '1px solid var(--border-muted)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Date & Time */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              Date & Start Time *
            </label>
            <input 
              type="datetime-local" 
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              required
              style={{
                width: '100%',
                background: 'rgba(10, 15, 29, 0.8)',
                border: '1px solid var(--border-muted)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
                colorScheme: 'dark'
              }}
            />

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
              {[2, 15, 60].map(m => (
                <button 
                  key={m}
                  type="button" 
                  onClick={() => setPresetTime(m)}
                  className="badge" 
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary)', border: 'none', cursor: 'pointer' }}
                >
                  +{m < 60 ? `${m} min` : '1 hr'}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Remind Before Selector ─── */}
          <div>
            <label style={{ 
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', 
              display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' 
            }}>
              <AlarmClock size={14} color="#a855f7" /> Remind Me Before
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={remindBefore}
                onChange={(e) => setRemindBefore(Number(e.target.value))}
                style={{
                  width: '100%',
                  background: 'rgba(10, 15, 29, 0.9)',
                  border: '1px solid rgba(168, 85, 247, 0.45)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 2.5rem 0.75rem 1rem',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  colorScheme: 'dark'
                }}
              >
                {REMIND_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown 
                size={16} 
                style={{ 
                  position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)',
                  color: '#a855f7', pointerEvents: 'none'
                }} 
              />
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Jarvis will speak a voice alarm {remindLabel(remindBefore)}.
            </p>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              Description / Notes (Optional)
            </label>
            <textarea 
              placeholder="Key agenda points or links..." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(10, 15, 29, 0.8)',
                border: '1px solid var(--border-muted)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                color: '#fff',
                fontSize: '0.88rem',
                outline: 'none',
                resize: 'none'
              }}
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            disabled={loading || !title.trim()}
            style={{ width: '100%', padding: '0.8rem', justifyContent: 'center', marginTop: '0.5rem' }}
          >
            <PlusCircle size={18} /> {loading ? 'Saving Schedule...' : 'Schedule Meeting & Set Alarm'}
          </button>
        </form>
      </div>

      {/* Right List: Scheduled Meetings */}
      <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column' }}>
        
        {/* Active Alarm Banner */}
        {activeAlarm && (
          <div className="animate-fade-in" style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.4) 100%)',
            border: '2px solid #ef4444',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ 
                width: '48px', height: '48px', borderRadius: '50%', 
                background: '#ef4444', color: '#fff', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'pulse 1.5s infinite'
              }}>
                <BellRing size={26} />
              </div>
              <div>
                <span className="badge" style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 800 }}>
                  SPEAKING REMINDER
                </span>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.25rem' }}>{activeAlarm.title}</h4>
                <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                  Jarvis is speaking out your reminder now!
                </p>
              </div>
            </div>
            <button 
              className="btn-secondary" 
              onClick={() => setActiveAlarm(null)}
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', background: 'rgba(0, 0, 0, 0.5)' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
              Your Meeting Calendar & Alarms
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {schedules.length} saved schedule(s)
            </span>
          </div>
          <button className="btn-secondary" onClick={fetchSchedules} style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}>
            Refresh List
          </button>
        </div>

        {/* Schedule List */}
        {schedules.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', background: 'rgba(10, 15, 29, 0.5)', borderRadius: 'var(--radius-lg)' }}>
            <Calendar size={42} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem', opacity: 0.5 }} />
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700 }}>No Meetings Scheduled</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0.4rem auto 0 auto' }}>
              Create a meeting schedule using the form on the left. Jarvis will speak out a voice alarm before your meeting starts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', overflowY: 'auto', maxHeight: '550px', paddingRight: '0.3rem' }}>
            {schedules.map((item) => {
              const isStarted = item.status === 'started';
              const formattedDate = new Date(item.scheduled_time).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short'
              });
              const remBefore = item.remind_before_minutes || 1;

              return (
                <div 
                  key={item.id} 
                  style={{
                    background: isStarted ? 'rgba(99, 102, 241, 0.08)' : 'rgba(15, 22, 38, 0.7)',
                    border: isStarted ? '1px solid var(--primary)' : '1px solid var(--border-muted)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
                    <div style={{ 
                      padding: '0.6rem', borderRadius: '10px', 
                      background: isStarted ? 'rgba(52, 211, 153, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: isStarted ? '#34d399' : 'var(--primary)'
                    }}>
                      <Clock size={20} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{item.title}</h4>
                        <span 
                          className="badge"
                          style={{
                            background: isStarted ? 'rgba(52, 211, 153, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                            color: isStarted ? '#34d399' : 'var(--primary)',
                            fontSize: '0.68rem', fontWeight: 700
                          }}
                        >
                          {isStarted ? 'Started & Reminded' : 'Upcoming'}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calendar size={13} /> {formattedDate}
                      </p>
                      {/* Remind Before Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem' }}>
                        <AlarmClock size={12} color="#a855f7" />
                        <span style={{ fontSize: '0.74rem', color: '#a855f7', fontWeight: 600 }}>
                          Alarm: {remindLabel(remBefore)}
                        </span>
                      </div>
                      {item.description && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button 
                      onClick={() => handleManualSpeakReminder(item)}
                      className="btn-secondary"
                      title="Speak Voice Reminder Now"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem', color: '#a855f7' }}
                    >
                      <Volume2 size={14} /> Speak Reminder
                    </button>
                    
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="btn-secondary"
                      title="Delete Schedule"
                      style={{ padding: '0.45rem', color: '#ef4444' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
