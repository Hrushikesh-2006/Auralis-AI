import { useState, useEffect } from 'react';
import { jarvisVoiceService } from './JarvisVoiceService';

export function useJarvisVoice(activeMeetingId = null) {
  const [voiceState, setVoiceState] = useState(jarvisVoiceService.getState());

  useEffect(() => {
    if (activeMeetingId !== undefined) {
      jarvisVoiceService.setActiveMeetingId(activeMeetingId);
    }
  }, [activeMeetingId]);

  useEffect(() => {
    const unsubscribe = jarvisVoiceService.subscribe((state) => {
      setVoiceState(state);
    });
    return unsubscribe;
  }, []);

  return {
    ...voiceState,
    requestMicPermission: (userInitiated) => jarvisVoiceService.requestMicPermission(userInitiated),
    toggleListening: () => jarvisVoiceService.toggleListening(),
    toggleVoiceMute: () => jarvisVoiceService.toggleVoiceMute(),
    triggerPushToTalk: (onInterimText) => jarvisVoiceService.triggerPushToTalk(onInterimText),
    sendQuery: (query) => jarvisVoiceService.sendQuery(query),
    stopAllAudio: () => jarvisVoiceService.stopAllAudio()
  };
}
