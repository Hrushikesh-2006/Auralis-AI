// Singleton Global Voice & Speech Recognition Service for Jarvis & Floating Co-Pilot
import { apiUrl, assetUrl } from './api';

class JarvisVoiceService {
  constructor() {
    this.listeners = new Set();
    this.recognition = null;
    this.activeAudio = null;
    this.restartTimeout = null;
    this.lastProcessedTime = 0;
    this.consecutiveErrors = 0;
    this.isRunning = false;
    this.isStarting = false;

    this.state = {
      isListening: false,
      isListeningEnabled: true,
      micPermissionGranted: false,
      isSpeaking: false,
      isThinking: false,
      isPushToTalkActive: false,
      voiceMuted: false,
      isFloatingModeActive: false,
      activeMeetingId: null,
      thinkingSteps: [],
      messages: [
        {
          id: 1,
          sender: 'jarvis',
          text: '👋 Hello! I am Jarvis, your real-time conversational AI assistant. Say "Hey Jarvis", "Hello", or ask anything about your meetings anytime!',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]
    };

    if (typeof window !== 'undefined') {
      this.checkExistingPermission();
    }
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.state });
      } catch (e) {
        console.error('[JarvisVoiceService] Listener error:', e);
      }
    }
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  setFloatingModeActive(active) {
    if (this.state.isFloatingModeActive !== active) {
      this.setState({ isFloatingModeActive: active });
    }
  }

  setActiveMeetingId(id) {
    if (this.state.activeMeetingId !== id) {
      this.setState({ activeMeetingId: id });
    }
  }

  async checkExistingPermission() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' });
        if (status.state === 'granted') {
          this.setState({ micPermissionGranted: true, isListening: true });
          this.startRecognition();
        }
        status.onchange = () => {
          if (status.state === 'granted') {
            this.setState({ micPermissionGranted: true });
            this.startRecognition();
          } else {
            this.setState({ micPermissionGranted: false, isListening: false });
            this.stopRecognition();
          }
        };
      }
    } catch (e) {
      // Browser doesn't support microphone permissions query
    }
  }

  async requestMicPermission(userInitiated = true) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Clean up track immediately so Web Speech API has exclusive access to the microphone hardware
      stream.getTracks().forEach(t => t.stop());

      this.consecutiveErrors = 0;
      this.setState({ micPermissionGranted: true, isListeningEnabled: true, isListening: true });
      this.startRecognition();
      return true;
    } catch (err) {
      console.warn('[JarvisVoiceService] Mic permission error:', err);
      if (userInitiated) {
        alert('Microphone permission is required for voice activation. Please allow microphone access in your browser settings.');
      }
      return false;
    }
  }

  toggleListening() {
    if (!this.state.micPermissionGranted) {
      this.requestMicPermission(true);
      return;
    }

    const next = !this.state.isListeningEnabled;
    this.setState({ isListeningEnabled: next, isListening: next });
    if (!next) {
      this.stopRecognition();
    } else {
      this.consecutiveErrors = 0;
      this.startRecognition();
    }
  }

  toggleVoiceMute() {
    const next = !this.state.voiceMuted;
    this.setState({ voiceMuted: next });
    if (next) {
      this.stopAllAudio();
    }
  }

  playActivationChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  getWakePhraseMatch(rawTranscript) {
    const transcript = rawTranscript
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const wakePatterns = [
      /\bhello\s+jarvis\b/,
      /\bhe+y+\s+jarvis\b/,
      /\bhi+\s+jarvis\b/,
      /\bok\s+jarvis\b/,
      /\bokay\s+jarvis\b/,
      /\bjarvis\b/,
      /\bhello\b/,
      /\bhe+y+\b/,
      /\bhi+\b/
    ];

    const matchedPattern = wakePatterns.find((pattern) => pattern.test(transcript));
    if (!matchedPattern) {
      return { isWakePhrase: false, cleanQuery: '' };
    }

    const cleanQuery = transcript
      .replace(/\bhello\s+jarvis\b/g, ' ')
      .replace(/\bhe+y+\s+jarvis\b/g, ' ')
      .replace(/\bhi+\s+jarvis\b/g, ' ')
      .replace(/\bok\s+jarvis\b/g, ' ')
      .replace(/\bokay\s+jarvis\b/g, ' ')
      .replace(/\bjarvis\b/g, ' ')
      .replace(/\bhello\b/g, ' ')
      .replace(/\bhe+y+\b/g, ' ')
      .replace(/\bhi+\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { isWakePhrase: true, cleanQuery };
  }

  stopRecognition() {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    this.isStarting = false;
    this.isRunning = false;

    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.onstart = null;
        this.recognition.abort();
      } catch (e) {}
      this.recognition = null;
    }
  }

  startRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!this.state.isListeningEnabled || !this.state.micPermissionGranted || this.state.isSpeaking || this.state.isThinking) {
      return;
    }

    if (this.isRunning || this.isStarting) {
      return;
    }

    this.stopRecognition();
    this.isStarting = true;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        this.isStarting = false;
        this.isRunning = true;
        this.consecutiveErrors = 0;
        this.setState({ isListening: true });
      };

      recognition.onerror = (event) => {
        console.warn('[JarvisVoiceService] Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.setState({ micPermissionGranted: false, isListeningEnabled: false, isListening: false });
        } else {
          this.consecutiveErrors++;
        }
      };

      recognition.onend = () => {
        this.isRunning = false;
        this.isStarting = false;

        if (this.state.isListeningEnabled && this.state.micPermissionGranted && !this.state.isSpeaking && !this.state.isThinking) {
          // Add backoff delay if consecutive errors occurred to prevent rapid flickering
          const delay = this.consecutiveErrors > 0 
            ? Math.min(1000 * Math.pow(1.5, this.consecutiveErrors), 4000) 
            : 300;

          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.state.isListeningEnabled && this.state.micPermissionGranted && !this.state.isSpeaking && !this.state.isThinking) {
              this.startRecognition();
            }
          }, delay);
        }
      };

      recognition.onresult = (event) => {
        this.consecutiveErrors = 0;
        if (this.state.isSpeaking || this.state.isThinking) return;

        let fullTranscript = '';
        let hasFinalResult = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' ';
          hasFinalResult = hasFinalResult || event.results[i].isFinal;
        }

        if (!hasFinalResult) return;

        const transcript = fullTranscript.toLowerCase().trim();

        // Check if push-to-talk was triggered
        if (this.state.isPushToTalkActive) {
          if (event.results[0] && event.results[0].isFinal && transcript) {
            this.setState({ isPushToTalkActive: false });
            this.sendQuery(transcript);
          }
          return;
        }

        const wakeMatch = this.getWakePhraseMatch(transcript);
        if (wakeMatch.isWakePhrase) {
          const now = Date.now();
          if (this.state.isThinking || this.state.isSpeaking || (now - this.lastProcessedTime < 2500)) {
            return;
          }

          this.lastProcessedTime = now;
          this.playActivationChime();

          const queryToSend = wakeMatch.cleanQuery.length > 1 ? wakeMatch.cleanQuery : 'Hello Jarvis';
          this.stopRecognition();
          this.sendQuery(queryToSend);
        }
      };

      recognition.start();
      this.recognition = recognition;
    } catch (e) {
      this.isStarting = false;
      this.isRunning = false;
      console.warn('[JarvisVoiceService] startRecognition exception:', e);
    }
  }

  triggerPushToTalk(onInterimText) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (this.state.isPushToTalkActive) {
      this.setState({ isPushToTalkActive: false });
      this.startRecognition();
      return;
    }

    this.stopAllAudio();
    this.stopRecognition();
    this.setState({ isPushToTalkActive: true });

    try {
      const ptt = new SpeechRecognition();
      ptt.continuous = false;
      ptt.interimResults = true;
      ptt.lang = 'en-US';

      ptt.onresult = (event) => {
        const text = Array.from(event.results)
          .map(r => r[0].transcript)
          .join('');
        if (onInterimText) onInterimText(text);

        if (event.results[0] && event.results[0].isFinal && text.trim()) {
          this.setState({ isPushToTalkActive: false });
          this.sendQuery(text.trim());
        }
      };

      ptt.onerror = () => {
        this.setState({ isPushToTalkActive: false });
        this.startRecognition();
      };

      ptt.onend = () => {
        this.setState({ isPushToTalkActive: false });
        this.startRecognition();
      };

      ptt.start();
    } catch (e) {
      this.setState({ isPushToTalkActive: false });
      this.startRecognition();
    }
  }

  stopAllAudio() {
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch (e) {}
      this.activeAudio = null;
    }
    this.setState({ isSpeaking: false });
  }

  speakBrowserFallback(text) {
    if (this.state.voiceMuted || !('speechSynthesis' in window)) {
      this.startRecognition();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(text || 'I have processed your request.');
    utterance.rate = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Google') || v.name.includes('Zira') || v.name.includes('Jenny') || v.name.includes('Samantha'))) || voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      this.setState({ isSpeaking: true });
    };

    utterance.onend = () => {
      this.setState({ isSpeaking: false });
      this.startRecognition();
    };

    utterance.onerror = () => {
      this.setState({ isSpeaking: false });
      this.startRecognition();
    };

    window.speechSynthesis.speak(utterance);
  }

  playVoiceResponse(voiceUrl, text) {
    if (this.state.voiceMuted) {
      this.startRecognition();
      return;
    }

    this.stopAllAudio();

    if (!voiceUrl) {
      this.speakBrowserFallback(text);
      return;
    }

    const audio = new Audio(assetUrl(voiceUrl));
    this.activeAudio = audio;

    audio.onplay = () => {
      this.setState({ isSpeaking: true });
    };

    audio.onended = () => {
      this.setState({ isSpeaking: false });
      this.activeAudio = null;
      this.startRecognition();
    };

    audio.onerror = () => {
      this.setState({ isSpeaking: false });
      this.activeAudio = null;
      this.speakBrowserFallback(text);
    };

    audio.play().catch(() => {
      this.speakBrowserFallback(text);
    });
  }

  async sendQuery(queryText) {
    if (!queryText || !queryText.trim()) return;

    this.stopAllAudio();
    this.stopRecognition();

    const cleanText = queryText.trim();
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: cleanText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    this.setState({
      messages: [...this.state.messages, userMsg],
      isThinking: true,
      thinkingSteps: [
        '⚡ Processing query with Jarvis Thinking Engine...',
        '🧠 Checking recorded audio context when relevant...',
        '🔊 Synthesizing natural neural voice audio readout...'
      ]
    });

    try {
      const resp = await fetch(apiUrl('/api/jarvis/think'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: cleanText,
          active_meeting_id: this.state.activeMeetingId
        })
      });

      const data = await resp.json();
      const result = data.data || {};
      const answerText = result.answer || 'I have processed your query.';

      const botMsg = {
        id: Date.now() + 1,
        sender: 'jarvis',
        text: answerText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        voice_audio_url: result.voice_audio_url
      };

      this.setState({
        messages: [...this.state.messages, botMsg],
        thinkingSteps: [],
        isThinking: false
      });

      this.playVoiceResponse(result.voice_audio_url, answerText);
    } catch (e) {
      console.error('[JarvisVoiceService] Error sending query:', e);
      const errMsg = {
        id: Date.now() + 1,
        sender: 'jarvis',
        text: 'Sorry, I had trouble reaching the AI reasoning server. Please check your connection.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      this.setState({
        messages: [...this.state.messages, errMsg],
        thinkingSteps: [],
        isThinking: false
      });

      this.startRecognition();
    }
  }
}

// Global Singleton Instance
export const jarvisVoiceService = new JarvisVoiceService();
