import React, { useRef, useState } from 'react';
import { UploadCloud, FileAudio, Loader2 } from 'lucide-react';

export default function AudioUploader({ onFileUpload, isProcessing }) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|webm|ogg|flac)$/i)) {
        onFileUpload(file);
      } else {
        alert('Please upload a valid audio file (.mp3, .wav, .m4a, .webm, .ogg).');
      }
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  return (
    <div 
      className="glass-panel"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      style={{
        padding: '2rem',
        textAlign: 'center',
        border: dragActive ? '2px dashed var(--primary)' : '2px dashed var(--border-muted)',
        background: dragActive ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-card)',
        cursor: 'pointer',
        position: 'relative',
        marginBottom: '1.5rem'
      }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.flac"
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      <div style={{ 
        width: '56px', 
        height: '56px', 
        borderRadius: '50%', 
        background: 'rgba(99, 102, 241, 0.15)', 
        color: 'var(--primary)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        margin: '0 auto 1rem auto'
      }}>
        {isProcessing ? <Loader2 size={28} className="animate-spin" /> : <UploadCloud size={28} />}
      </div>

      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.35rem' }}>
        {isProcessing ? 'Processing & Transcribing Audio...' : 'Upload Multi-Speaker Meeting Recording'}
      </h3>
      
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 1rem auto' }}>
        Drag and drop your MP3, WAV, M4A, or WEBM audio file here, or click to browse.
      </p>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <FileAudio size={14} /> Supports multi-speaker diarization & automatic sentiment extraction
      </div>
    </div>
  );
}
