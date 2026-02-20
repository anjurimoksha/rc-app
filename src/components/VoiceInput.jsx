import { useState, useEffect, useRef } from 'react';

/**
 * VoiceInput — a mic button that appends speech-to-text into a text field.
 *
 * Props:
 *   onResult(text) — called with the transcribed text to append
 *   disabled       — disables the mic button
 */
export default function VoiceInput({ onResult, disabled }) {
    const [listening, setListening] = useState(false);
    const [supported, setSupported] = useState(false);
    const recRef = useRef(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) setSupported(true);
    }, []);

    function toggle() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (listening) {
            recRef.current?.stop();
            setListening(false);
            return;
        }

        const rec = new SpeechRecognition();
        rec.lang = 'en-IN';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.continuous = false;

        rec.onstart = () => setListening(true);
        rec.onend = () => setListening(false);
        rec.onerror = (e) => { console.warn('Speech error:', e.error); setListening(false); };
        rec.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            onResult(transcript);
        };

        recRef.current = rec;
        rec.start();
    }

    if (!supported) return null;

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={disabled}
            title={listening ? 'Stop recording' : 'Speak to type'}
            style={{
                background: listening ? '#fee2e2' : 'var(--bg)',
                border: `1.5px solid ${listening ? '#ef4444' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                padding: '0 10px',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                flexShrink: 0,
                transition: 'all 0.2s',
                animation: listening ? 'pulse 1s infinite' : 'none',
            }}
        >
            {listening ? '🔴' : '🎙️'}
        </button>
    );
}
