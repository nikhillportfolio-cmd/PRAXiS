/**
 * PRAXiS Speech Recognition Engine & Speech Synthesis Controller
 * Robust Web Speech API wrapper with continuous recognition, interim/final separation,
 * automatic disconnect recovery, single-instance management, timing tracking,
 * and reliable Text-To-Speech playback (handling Chromium GC, cancellation race, and natural voices).
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exports = factory();
        root.SpeechRecognitionManager = exports.SpeechRecognitionManager;
        root.PraxisSpeechSpeaker = exports.PraxisSpeechSpeaker;
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // =========================================================================
    // 1. PRAXiS TEXT-TO-SPEECH (TTS) AUDIO CONTROLLER
    // =========================================================================
    const PraxisSpeechSpeaker = {
        activeUtterance: null,
        currentText: null,

        isSupported() {
            return typeof window !== 'undefined' && ('speechSynthesis' in window);
        },

        isPlaying() {
            return this.isSupported() && window.speechSynthesis.speaking;
        },

        stop() {
            if (!this.isSupported()) return;
            try {
                window.speechSynthesis.cancel();
            } catch (e) {}
            this.activeUtterance = null;
            this.currentText = null;
            if (typeof window !== 'undefined') {
                window._praxisActiveUtterance = null;
                window._praxisSpeakingText = null;
            }
        },

        speak(text, options = {}) {
            if (!this.isSupported()) {
                if (typeof options.onError === 'function') {
                    options.onError("Text-to-speech is not supported in this browser.");
                }
                return false;
            }

            const cleanText = String(text || '').replace(/[*_#`~>]/g, '').trim();
            if (!cleanText) return false;

            // Toggle support: if already speaking the exact same text, clicking again stops playback
            if (window.speechSynthesis.speaking && this.currentText === cleanText) {
                this.stop();
                if (typeof options.onEnd === 'function') options.onEnd();
                return false;
            }

            // Safely cancel previous audio and record current target
            this.stop();
            this.currentText = cleanText;
            if (typeof window !== 'undefined') {
                window._praxisSpeakingText = cleanText;
            }

            // Chromium bugfix: small delay after cancel() prevents immediate cancellation of new utterance
            setTimeout(() => {
                try {
                    if (window.speechSynthesis.paused) {
                        window.speechSynthesis.resume();
                    }

                    const utterance = new SpeechSynthesisUtterance(cleanText);
                    // Pin to controller and global window to prevent Chromium garbage collection cutting audio midway
                    this.activeUtterance = utterance;
                    if (typeof window !== 'undefined') {
                        window._praxisActiveUtterance = utterance;
                    }

                    utterance.rate = options.rate || 0.94;
                    utterance.pitch = options.pitch || 1.0;
                    utterance.lang = options.lang || 'en-US';

                    // Pick natural English voice if available
                    const voices = window.speechSynthesis.getVoices() || [];
                    if (voices.length > 0) {
                        const enVoices = voices.filter(v => v.lang && v.lang.startsWith('en'));
                        const naturalVoice = enVoices.find(v =>
                            /natural|google|samantha|karen|daniel|moira|george|david|zira|hazel|aria|guy|jenny/i.test(v.name)
                        ) || enVoices[0];
                        if (naturalVoice) {
                            utterance.voice = naturalVoice;
                        }
                    }

                    utterance.onstart = () => {
                        if (typeof options.onStart === 'function') options.onStart();
                    };

                    utterance.onend = () => {
                        this.activeUtterance = null;
                        this.currentText = null;
                        if (typeof window !== 'undefined') {
                            window._praxisActiveUtterance = null;
                            window._praxisSpeakingText = null;
                        }
                        if (typeof options.onEnd === 'function') options.onEnd();
                    };

                    utterance.onerror = (e) => {
                        this.activeUtterance = null;
                        this.currentText = null;
                        if (typeof window !== 'undefined') {
                            window._praxisActiveUtterance = null;
                            window._praxisSpeakingText = null;
                        }
                        if (typeof options.onEnd === 'function') options.onEnd();
                        if (e.error !== 'interrupted' && e.error !== 'canceled') {
                            if (typeof options.onError === 'function') {
                                options.onError("Audio playback error: " + e.error);
                            }
                        }
                    };

                    window.speechSynthesis.speak(utterance);
                    return true;
                } catch (err) {
                    console.error("PraxisSpeechSpeaker speak error:", err);
                    this.activeUtterance = null;
                    this.currentText = null;
                    if (typeof options.onEnd === 'function') options.onEnd();
                    if (typeof options.onError === 'function') options.onError("Failed to speak audio.");
                    return false;
                }
            }, 60);

            return true;
        }
    };

    // Pre-warm browser voices cache
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = () => {
                try { window.speechSynthesis.getVoices(); } catch (e) {}
            };
        } catch (e) {}
    }

    // =========================================================================
    // 2. PRAXiS SPEECH RECOGNITION (STT) ENGINE
    // =========================================================================
    class SpeechRecognitionManager {
        constructor(options = {}) {
            this.lang = options.lang || 'en-US';
            this.onTranscriptUpdate = options.onTranscriptUpdate || null;
            this.onStateChange = options.onStateChange || null;
            this.onError = options.onError || null;

            this.recognition = null;
            this.isRecording = false;
            this.isPaused = false;
            this.isIntentionalStop = false;
            this.finalTranscript = '';
            this.interimTranscript = '';
            this.startTime = 0;
            this.endTime = 0;
            this.firstSpeechTime = 0;
            this.actualSpeakingDuration = 0;
            this.speechEvents = []; // Array of { timestamp, text, isFinal }
            this.lastEventTime = 0;
            this.detectedPauses = []; // Array of { timestamp, durationSeconds, type }
            this.restartAttempts = 0;
            this.maxRestartAttempts = 50; // High limit so natural student pauses never abort the session
            this.restartTimeout = null;

            this.isSupported = this.checkSupport();
            if (this.isSupported) {
                this.initEngine();
            }
        }

        checkSupport() {
            if (typeof window === 'undefined') return false;
            return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        }

        initEngine() {
            // Detach previous listeners and abort old recognition instance to prevent zombie events
            if (this.recognition) {
                try {
                    this.recognition.onstart = null;
                    this.recognition.onresult = null;
                    this.recognition.onerror = null;
                    this.recognition.onend = null;
                    this.recognition.abort();
                } catch (e) {}
                this.recognition = null;
            }

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) return;

            try {
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = true;
                this.recognition.interimResults = true;
                this.recognition.lang = this.lang;
                this.recognition.maxAlternatives = 1;

                this.recognition.onstart = () => {
                    this.restartAttempts = 0;
                    if (!this.startTime) {
                        this.startTime = Date.now();
                    }
                    this.emitState('LISTENING');
                };

                this.recognition.onresult = (event) => {
                    const now = Date.now();
                    if (!this.firstSpeechTime) {
                        this.firstSpeechTime = now;
                    }
                    // Reset silence restart counter since user is actively speaking
                    this.restartAttempts = 0;

                    if (this.lastEventTime > 0) {
                        const gapSec = Number(((now - this.lastEventTime) / 1000).toFixed(2));
                        if (gapSec >= 0.7) {
                            const pauseType = gapSec >= 1.5 ? 'long' : 'noticeable';
                            this.detectedPauses.push({
                                timestamp: now,
                                durationSeconds: gapSec,
                                type: pauseType
                            });
                        }
                    }
                    this.lastEventTime = now;

                    let currentInterim = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        const result = event.results[i];
                        const transcriptPiece = result[0].transcript;
                        if (result.isFinal) {
                            this.finalTranscript += (this.finalTranscript ? ' ' : '') + transcriptPiece.trim();
                            this.speechEvents.push({
                                timestamp: now,
                                text: transcriptPiece.trim(),
                                isFinal: true
                            });
                        } else {
                            currentInterim += transcriptPiece;
                        }
                    }
                    this.interimTranscript = currentInterim;

                    const fullLiveText = (this.finalTranscript + (this.interimTranscript ? ' ' + this.interimTranscript : '')).trim();
                    if (typeof this.onTranscriptUpdate === 'function') {
                        this.onTranscriptUpdate({
                            finalTranscript: this.finalTranscript,
                            interimTranscript: this.interimTranscript,
                            fullTranscript: fullLiveText,
                            timing: this.getTimingMetrics()
                        });
                    }
                };

                this.recognition.onerror = (event) => {
                    console.warn('SpeechRecognition notice/error:', event.error);
                    let friendlyMessage = "Speech recognition encountered an issue.";
                    let isCritical = false;

                    switch (event.error) {
                        case 'not-allowed':
                        case 'service-not-allowed':
                            friendlyMessage = "Microphone access was denied. Please allow microphone permissions in your browser address bar.";
                            isCritical = true;
                            break;
                        case 'no-speech':
                            // Natural pause in speech: keep listening seamlessly
                            friendlyMessage = "Listening for speech...";
                            break;
                        case 'audio-capture':
                            friendlyMessage = "No microphone found. Please connect an audio input device.";
                            isCritical = true;
                            break;
                        case 'network':
                            friendlyMessage = "Speech recognition network glitch. Reconnecting...";
                            break;
                        case 'aborted':
                            return;
                        default:
                            friendlyMessage = `Recognition event: ${event.error}`;
                            break;
                    }

                    if (isCritical) {
                        this.isRecording = false;
                        this.isIntentionalStop = true;
                        clearTimeout(this.restartTimeout);
                        this.emitState('ERROR', { error: event.error, message: friendlyMessage });
                        if (typeof this.onError === 'function') {
                            this.onError(friendlyMessage, event.error);
                        }
                    }
                };

                this.recognition.onend = () => {
                    // Commit any captured interim transcript so spoken words are never lost on browser disconnects
                    if (this.interimTranscript) {
                        this.finalTranscript = (this.finalTranscript + ' ' + this.interimTranscript).trim();
                        this.interimTranscript = '';
                    }

                    // If user is still recording and did not intentionally stop or pause, auto-reconnect
                    if (this.isRecording && !this.isIntentionalStop && !this.isPaused) {
                        if (this.restartAttempts < this.maxRestartAttempts) {
                            this.restartAttempts++;
                            clearTimeout(this.restartTimeout);
                            this.restartTimeout = setTimeout(() => {
                                if (this.isRecording && !this.isIntentionalStop && !this.isPaused) {
                                    try {
                                        this.initEngine();
                                        this.recognition.start();
                                    } catch (e) {
                                        console.warn('Could not auto-restart recognition:', e);
                                    }
                                }
                            }, 120);
                            return;
                        }
                    }

                    if (!this.isPaused) {
                        this.isRecording = false;
                        this.endTime = Date.now();
                        if (this.startTime > 0) {
                            this.actualSpeakingDuration = Math.max(1, Math.round((this.endTime - this.startTime) / 1000));
                        }

                        this.emitState('STOPPED', {
                            finalTranscript: this.finalTranscript,
                            durationSeconds: this.actualSpeakingDuration,
                            timing: this.getTimingMetrics()
                        });
                    }
                };
            } catch (err) {
                console.error("Failed to initialize SpeechRecognition:", err);
            }
        }

        start(initialText = '') {
            if (!this.isSupported) {
                if (typeof this.onError === 'function') {
                    this.onError("Speech recognition is not supported in this browser. Please use Chrome or Edge, or type your speech.", "unsupported");
                }
                return false;
            }

            clearTimeout(this.restartTimeout);
            this.isIntentionalStop = false;
            this.isPaused = false;
            this.restartAttempts = 0;
            this.finalTranscript = String(initialText || '').trim();
            this.interimTranscript = '';
            this.startTime = Date.now();
            this.endTime = 0;
            this.firstSpeechTime = 0;
            this.lastEventTime = 0;
            this.speechEvents = [];
            this.detectedPauses = [];
            this.actualSpeakingDuration = 0;
            this.isRecording = true;

            // Recreate engine cleanly so there are no lingering state errors
            this.initEngine();

            if (!this.recognition) {
                this.isRecording = false;
                if (typeof this.onError === 'function') {
                    this.onError("Speech recognition failed to initialize.", "init-error");
                }
                return false;
            }

            try {
                this.recognition.start();
                this.emitState('LISTENING');
                return true;
            } catch (err) {
                console.warn("Direct recognition start threw error, attempting recovery:", err);
                // Attempt clean recovery after a brief tick
                setTimeout(() => {
                    if (this.isRecording && !this.isIntentionalStop) {
                        try {
                            this.initEngine();
                            this.recognition.start();
                            this.emitState('LISTENING');
                        } catch (recErr) {
                            console.error("Recovery start failed:", recErr);
                            this.isRecording = false;
                            if (typeof this.onError === 'function') {
                                this.onError("Could not access microphone. Please check browser permissions.", "start-error");
                            }
                        }
                    }
                }, 150);
                return true;
            }
        }

        pause() {
            if (!this.isRecording || this.isPaused) return;
            this.isPaused = true;
            clearTimeout(this.restartTimeout);

            if (this.interimTranscript) {
                this.finalTranscript = (this.finalTranscript + ' ' + this.interimTranscript).trim();
                this.interimTranscript = '';
            }

            if (this.recognition) {
                try {
                    this.recognition.stop();
                } catch (e) {}
            }
            this.emitState('PAUSED');
        }

        resume() {
            if (!this.isRecording) {
                return this.start(this.finalTranscript);
            }
            if (!this.isPaused) return true;

            this.isPaused = false;
            this.isIntentionalStop = false;
            this.initEngine();
            try {
                this.recognition.start();
                this.emitState('LISTENING');
                return true;
            } catch (e) {
                console.warn("Resume recognition error:", e);
                return false;
            }
        }

        stop() {
            this.isIntentionalStop = true;
            this.isRecording = false;
            this.isPaused = false;
            clearTimeout(this.restartTimeout);

            if (this.interimTranscript) {
                this.finalTranscript = (this.finalTranscript + ' ' + this.interimTranscript).trim();
                this.interimTranscript = '';
            }

            if (this.recognition) {
                try {
                    this.recognition.onend = null;
                    this.recognition.stop();
                } catch (e) {
                    try {
                        this.recognition.abort();
                    } catch (err) {}
                }
            }

            this.endTime = Date.now();
            if (this.startTime > 0) {
                this.actualSpeakingDuration = Math.max(1, Math.round((this.endTime - this.startTime) / 1000));
            }

            this.emitState('STOPPED', {
                finalTranscript: this.finalTranscript,
                durationSeconds: this.actualSpeakingDuration,
                timing: this.getTimingMetrics()
            });

            return {
                finalTranscript: this.finalTranscript,
                durationSeconds: this.actualSpeakingDuration,
                timing: this.getTimingMetrics()
            };
        }

        reset() {
            this.stop();
            this.finalTranscript = '';
            this.interimTranscript = '';
            this.startTime = 0;
            this.endTime = 0;
            this.firstSpeechTime = 0;
            this.lastEventTime = 0;
            this.speechEvents = [];
            this.detectedPauses = [];
            this.actualSpeakingDuration = 0;
            this.emitState('READY');
        }

        setTranscript(text) {
            this.finalTranscript = String(text || '').trim();
            this.interimTranscript = '';
        }

        getTranscript() {
            return (this.finalTranscript + (this.interimTranscript ? ' ' + this.interimTranscript : '')).trim();
        }

        getDurationSeconds() {
            if (this.isRecording && this.startTime > 0) {
                return Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
            }
            return this.actualSpeakingDuration || 0;
        }

        getTimingMetrics() {
            const now = this.endTime || (this.isRecording ? Date.now() : this.startTime);
            const totalDurationSec = this.startTime > 0 ? Math.max(0.1, (now - this.startTime) / 1000) : 0;
            const firstSpeechDelay = (this.startTime > 0 && this.firstSpeechTime > 0)
                ? Math.max(0, (this.firstSpeechTime - this.startTime) / 1000)
                : 0;

            let totalPauseTime = 0;
            let longPauseCount = 0;
            let pauseCount = this.detectedPauses.length;

            this.detectedPauses.forEach(p => {
                totalPauseTime += p.durationSeconds;
                if (p.type === 'long') {
                    longPauseCount++;
                }
            });

            const avgPauseTime = pauseCount > 0 ? Number((totalPauseTime / pauseCount).toFixed(2)) : 0;
            const activeSpeakingSec = Math.max(0.1, Number((totalDurationSec - totalPauseTime).toFixed(2)));

            return {
                totalDurationSeconds: Number(totalDurationSec.toFixed(2)),
                activeSpeakingSeconds: activeSpeakingSec,
                firstSpeechDelaySeconds: Number(firstSpeechDelay.toFixed(2)),
                pauses: this.detectedPauses,
                pauseCount,
                longPauseCount,
                totalPauseTime: Number(totalPauseTime.toFixed(2)),
                averagePauseTime: avgPauseTime,
                speechEventsCount: this.speechEvents.length,
                hasSpeechEvents: this.speechEvents.length > 0 || !!this.finalTranscript
            };
        }

        emitState(state, payload = {}) {
            if (typeof this.onStateChange === 'function') {
                this.onStateChange(state, payload);
            }
        }
    }

    return {
        SpeechRecognitionManager,
        PraxisSpeechSpeaker
    };
}));
