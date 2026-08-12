import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, X, Loader2, Play } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordCount: number;
  statsText: string;
}

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  recordCount,
  statsText,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string; audioUrl?: string }>>([
    {
      role: 'assistant',
      text: `Hello! I'm your Irish B2B Lead Voice Assistant. You have ${recordCount} records loaded. Ask me anything about your business dataset, lead quality, or outreach strategy!`,
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition if supported
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-IE';

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setPromptInput(transcript);
        setIsListening(false);
        handleSendVoicePrompt(transcript);
      };

      rec.onerror = (err: any) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  if (!isOpen) return null;

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setPromptInput('');
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.warn('Could not start recognition:', e);
        setIsListening(false);
      }
    }
  };

  const playBase64Audio = (base64Data: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`data:audio/mp3;base64,${base64Data}`);
      audioRef.current = audio;
      setIsPlayingAudio(true);
      audio.play();
      audio.onended = () => setIsPlayingAudio(false);
    } catch (e) {
      console.error('Audio playback error:', e);
      setIsPlayingAudio(false);
    }
  };

  const handleSendVoicePrompt = async (inputQuery?: string) => {
    const textToSend = inputQuery || promptInput;
    if (!textToSend.trim() || isLoading) return;

    const userMessage = textToSend.trim();
    setChatHistory((prev) => [...prev, { role: 'user', text: userMessage }]);
    setPromptInput('');
    setIsLoading(true);

    try {
      const fullContext = `Dataset context: ${recordCount} records loaded. ${statsText}. Question: ${userMessage}`;
      const res = await apiFetch('/api/voice-assistant', {
        method: 'POST',
        body: JSON.stringify({ prompt: fullContext, voice: 'Kore' }),
      });

      if (!res.ok) throw new Error('Voice assistant request failed');

      const data = await res.json();
      const reply = data.replyText || 'I processed your request.';

      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', text: reply, audioUrl: data.audioBase64 },
      ]);

      if (data.audioBase64) {
        playBase64Audio(data.audioBase64);
      }
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', text: `Voice assistant error: ${err.message || 'Server error'}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <Sparkles className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Gemini Voice Assistant</h3>
              <p className="text-xs text-emerald-100">Live AI Audio & Lead Intelligence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-2xs ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                <p>{msg.text}</p>
                {msg.audioUrl && (
                  <button
                    onClick={() => playBase64Audio(msg.audioUrl!)}
                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Play Audio Response
                  </button>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-slate-500 text-xs italic">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              Gemini is generating voice response...
            </div>
          )}
        </div>

        {/* Voice Input Controls */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendVoicePrompt()}
              placeholder="Ask about your leads or strategy..."
              className="flex-1 px-4 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {recognitionRef.current && (
              <button
                onClick={toggleListen}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title={isListening ? 'Listening...' : 'Click to Speak'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
            <button
              onClick={() => handleSendVoicePrompt()}
              disabled={!promptInput.trim() || isLoading}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
            >
              Send
            </button>
          </div>
          {isListening && (
            <p className="text-xs text-center text-red-600 font-medium animate-pulse">
              🎤 Listening... Speak into your microphone now
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
