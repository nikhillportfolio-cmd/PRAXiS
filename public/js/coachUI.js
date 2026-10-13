/**
 * PRAXiS Communication Coach UI Controller
 * Manages UI states, user interactions, speech diagnostics rendering,
 * session history, timer, and accessibility.
 */

(function (root) {
    'use strict';

    // State Variables
    let recognitionManager = null;
    let currentTrack = 'express';
    let allTopics = {};
    let currentTopic = null;

    // 3 Stages: 'practice', 'speaking', 'feedback'
    let currentStage = 'practice';

    // Drill & Retry Tracking
    let isDrillRetry = false;
    let activeDrill = null;
    let baselineEvaluation = null;
    let activeEvaluation = null;

    // Speaking Timer
    let timerInterval = null;
    let timerDuration = 60;
    let timeRemaining = 60;
    let isTimerRunning = false;

    // 15-second Preparation Timer
    let prepInterval = null;
    let prepTimeRemaining = 15;
    let isPrepRunning = false;

    // Recognition State
    let currentState = 'READY';

    const STORAGE_KEY_SESSIONS = 'praxis_speech_sessions_v2';

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', async () => {
        initUI();
        await fetchTopics();
        initSpeechEngine();
        loadSessionHistory();
        setStage('practice');
    });

    function initUI() {
        updateWordCount();
        setTimerDuration(60);

        // Bind input textarea for fallback manual input
        const transcriptArea = document.getElementById('speech-transcript-input');
        if (transcriptArea) {
            transcriptArea.addEventListener('input', () => {
                updateWordCount();
                if (recognitionManager) {
                    recognitionManager.setTranscript(transcriptArea.value);
                }
            });
        }
    }

    // =========================================================================
    // 1. 3-STAGE UI MANAGEMENT
    // =========================================================================
    function setStage(stage) {
        currentStage = stage;

        const stagePractice = document.getElementById('stage-practice');
        const stageSpeaking = document.getElementById('stage-speaking');
        const stageFeedback = document.getElementById('stage-feedback');

        const tabPractice = document.getElementById('stage-tab-practice');
        const tabSpeaking = document.getElementById('stage-tab-speaking');
        const tabFeedback = document.getElementById('stage-tab-feedback');

        // Reset stepper buttons
        [tabPractice, tabSpeaking, tabFeedback].forEach(tab => {
            if (!tab) return;
            tab.className = "stage-step-btn px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 flex items-center gap-1.5 transition-all opacity-70 cursor-pointer";
            const numSpan = tab.querySelector('span');
            if (numSpan) numSpan.className = "w-5 h-5 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center text-[10px]";
        });

        if (stage === 'practice') {
            if (stagePractice) stagePractice.classList.remove('hidden');
            if (stageSpeaking) stageSpeaking.classList.add('hidden');
            if (stageFeedback) stageFeedback.classList.add('hidden');

            if (tabPractice) {
                tabPractice.className = "stage-step-btn px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black text-blue-700 bg-blue-100 flex items-center gap-1.5 transition-all cursor-pointer shadow-inner";
                const numSpan = tabPractice.querySelector('span');
                if (numSpan) numSpan.className = "w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]";
            }
        } else if (stage === 'speaking') {
            if (stagePractice) stagePractice.classList.add('hidden');
            if (stageSpeaking) stageSpeaking.classList.remove('hidden');
            if (stageFeedback) stageFeedback.classList.add('hidden');

            if (tabSpeaking) {
                tabSpeaking.className = "stage-step-btn px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black text-red-700 bg-red-100 flex items-center gap-1.5 transition-all cursor-pointer shadow-inner";
                const numSpan = tabSpeaking.querySelector('span');
                if (numSpan) numSpan.className = "w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]";
            }

            const spkPrompt = document.getElementById('speaking-topic-prompt');
            if (spkPrompt && currentTopic) {
                spkPrompt.innerText = `"${currentTopic.prompt}"`;
            }
        } else if (stage === 'feedback') {
            if (stagePractice) stagePractice.classList.add('hidden');
            if (stageSpeaking) stageSpeaking.classList.add('hidden');
            if (stageFeedback) stageFeedback.classList.remove('hidden');

            if (tabFeedback) {
                tabFeedback.className = "stage-step-btn px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black text-emerald-700 bg-emerald-100 flex items-center gap-1.5 transition-all cursor-pointer shadow-inner";
                const numSpan = tabFeedback.querySelector('span');
                if (numSpan) numSpan.className = "w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]";
            }

            if (stageFeedback) {
                stageFeedback.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    // =========================================================================
    // 2. SPEECH RECOGNITION SETUP
    // =========================================================================
    function initSpeechEngine() {
        const SpeechRecognitionManager = window.SpeechRecognitionManager;
        if (!SpeechRecognitionManager) {
            console.warn("SpeechRecognitionManager not loaded.");
            return;
        }

        recognitionManager = new SpeechRecognitionManager({
            lang: 'en-US',
            onTranscriptUpdate: (data) => {
                // Update live transcript box in Stage 2
                const liveBox = document.getElementById('speaking-live-transcript-box');
                if (liveBox) {
                    liveBox.innerText = data.fullTranscript || "Listening... Start speaking whenever you are ready.";
                    liveBox.scrollTop = liveBox.scrollHeight;
                }

                // Keep fallback textarea in sync
                const transcriptArea = document.getElementById('speech-transcript-input');
                if (transcriptArea) {
                    transcriptArea.value = data.fullTranscript;
                }

                updateWordCount(data.fullTranscript);
            },
            onStateChange: (state, payload) => {
                setUIState(state, payload);
            },
            onError: (friendlyMsg, errorType) => {
                showToast(friendlyMsg, "⚠️");
                setUIState('ERROR', { message: friendlyMsg });
            }
        });
    }

    function setUIState(state, payload = {}) {
        currentState = state;
        const micStatus = document.getElementById('mic-status-label');
        const soundwave = document.getElementById('soundwave-container');

        switch (state) {
            case 'READY':
            case 'STOPPED':
                if (micStatus) micStatus.innerText = "Ready to record";
                if (soundwave) soundwave.classList.add('hidden');
                break;

            case 'LISTENING':
                if (micStatus) micStatus.innerText = "Listening... Speak naturally!";
                if (soundwave) soundwave.classList.remove('hidden');
                break;

            case 'PROCESSING':
            case 'ANALYZING':
                if (soundwave) soundwave.classList.add('hidden');
                if (micStatus) micStatus.innerText = "Analyzing your speech patterns...";
                break;

            case 'COMPLETE':
                if (soundwave) soundwave.classList.add('hidden');
                if (micStatus) micStatus.innerText = "Coaching ready!";
                break;

            case 'ERROR':
                if (soundwave) soundwave.classList.add('hidden');
                if (micStatus) micStatus.innerText = payload.message || "Microphone issue";
                break;
        }
    }

    // =========================================================================
    // 3. TOPIC & PROMPT HANDLING
    // =========================================================================
    async function fetchTopics() {
        try {
            const res = await fetch('/api/coach/topics');
            const data = await res.json();
            if (data.success && data.topics) {
                allTopics = data.topics;
            }
        } catch (err) {
            console.warn("Using fallback local topics:", err);
            allTopics = getFallbackTopics();
        }

        // Check if query params specify a custom drill from Career Compass!
        const urlParams = new URLSearchParams(window.location.search);
        const careerParam = urlParams.get('career');
        const topicParam = urlParams.get('topic');
        const promptParam = urlParams.get('prompt');
        const frameworkParam = urlParams.get('framework');

        if (topicParam && promptParam) {
            currentTopic = {
                title: topicParam,
                prompt: promptParam,
                framework: frameworkParam || "PREP: Point ➔ Reason ➔ Example ➔ Point",
                category: careerParam ? `${careerParam} • Compass Drill` : "Career Drill",
                duration: 90
            };
            applyCurrentTopicToUI();
            showInAppToast("🎙️", `Preloaded speaking drill for ${careerParam || 'your roadmap'}!`, false);
        } else {
            shuffleTopic();
        }
    }

    function selectTrack(track) {
        currentTrack = track;
        shuffleTopic();
    }

    function applyCurrentTopicToUI() {
        if (!currentTopic) return;
        const titleEl = document.getElementById('topic-title');
        const promptEl = document.getElementById('topic-prompt');
        const badgeEl = document.getElementById('topic-category-badge');
        const frameworkEl = document.getElementById('framework-desc');
        const spkPrompt = document.getElementById('speaking-topic-prompt');

        if (titleEl) titleEl.innerText = currentTopic.title;
        if (promptEl) promptEl.innerText = `"${currentTopic.prompt}"`;
        if (spkPrompt) spkPrompt.innerText = `"${currentTopic.prompt}"`;
        if (badgeEl) badgeEl.innerText = currentTopic.category || "Workplace & Daily Life";

        // Convert technical framework jargon into friendly coaching advice
        let friendlyTip = "Answer in 3 parts: State your main point, share a quick reason or example, and wrap it up with a clear closing thought.";
        if (currentTopic.framework) {
            if (currentTopic.framework.includes('STAR')) {
                friendlyTip = "Use the story format: What was the Situation? What did you Do? What was the positive Outcome?";
            } else if (currentTopic.framework.includes('PREP')) {
                friendlyTip = "State your Point clearly, explain your Reason ('because...'), share a quick Example ('for instance...'), and repeat your Point.";
            } else if (currentTopic.framework.includes('Cue Card')) {
                friendlyTip = "Structure your journey: Describe what it was, where it happened, why it mattered to you, and what you learned.";
            }
        }
        if (frameworkEl) frameworkEl.innerText = friendlyTip;

        if (currentTopic.duration) {
            setTimerDuration(currentTopic.duration);
        }
    }

    function shuffleTopic() {
        stopPrepCountdown();
        const drillBadge = document.getElementById('drill-active-badge');
        if (drillBadge) drillBadge.classList.add('hidden');

        isDrillRetry = false;
        activeDrill = null;

        const trackList = allTopics[currentTrack] || allTopics['express'] || [];
        if (trackList.length === 0) return;
        const randomIndex = Math.floor(Math.random() * trackList.length);
        currentTopic = trackList[randomIndex];
        originalTopicBeforeDrill = currentTopic;
        applyCurrentTopicToUI();
    }

    // =========================================================================
    // 4. PREPARATION TIMER (15 SECONDS TO THINK)
    // =========================================================================
    function togglePrepTimer() {
        if (isPrepRunning) {
            stopPrepCountdown();
        } else {
            startPrepCountdown();
        }
    }

    function startPrepCountdown() {
        stopPrepCountdown();
        isPrepRunning = true;
        prepTimeRemaining = 15;

        const btnLabel = document.getElementById('prep-btn-label');
        const statusEl = document.getElementById('prep-time-status');

        if (btnLabel) btnLabel.innerText = "Stop Prep";
        if (statusEl) statusEl.innerText = `${prepTimeRemaining}s (Thinking...)`;

        prepInterval = setInterval(() => {
            prepTimeRemaining--;
            if (statusEl) {
                statusEl.innerText = prepTimeRemaining > 0
                    ? `${prepTimeRemaining}s to think`
                    : "Ready! Let's speak!";
            }

            if (prepTimeRemaining <= 0) {
                stopPrepCountdown();
                showToast("Preparation time complete! Click Start Speaking when ready.", "⏱️");
            }
        }, 1000);
    }

    function stopPrepCountdown() {
        clearInterval(prepInterval);
        isPrepRunning = false;
        prepTimeRemaining = 15;

        const btnLabel = document.getElementById('prep-btn-label');
        const statusEl = document.getElementById('prep-time-status');
        if (btnLabel) btnLabel.innerText = "Take 15s to Think";
        if (statusEl) statusEl.innerText = "15 Seconds";
    }

    // =========================================================================
    // 5. STAGE 2: LIVE SPEAKING STAGE TRANSITION
    // =========================================================================
    function startSpeakingStage() {
        stopPrepCountdown();

        // Clear any previous live transcript
        const liveBox = document.getElementById('speaking-live-transcript-box');
        if (liveBox) liveBox.innerHTML = '<span class="text-slate-400 italic">Listening... Start speaking whenever you\'re ready.</span>';

        const transcriptArea = document.getElementById('speech-transcript-input');
        if (transcriptArea) transcriptArea.value = '';
        updateWordCount('');

        // Switch to Stage 2: Speaking
        setStage('speaking');

        // Start Speech Recognition
        if (recognitionManager && recognitionManager.isSupported) {
            const started = recognitionManager.start('');
            if (!started) {
                showToast("Please grant microphone permissions to speak.", "⚠️");
            }
        } else {
            showToast("Speech recognition is unavailable in this browser. You can still type below.", "ℹ️");
        }

        // Reset & Start Countdown Timer
        resetTimer();
        startTimer();
    }

    function finishSpeakingAndEvaluate() {
        // Stop recording
        if (recognitionManager && recognitionManager.isRecording) {
            recognitionManager.stop();
        }
        pauseTimer();

        // Trigger Evaluation
        submitSpeechForEvaluation();
    }

    function cancelSpeakingAndRestart() {
        if (recognitionManager && recognitionManager.isRecording) {
            recognitionManager.stop();
        }
        pauseTimer();
        resetTimer();

        const liveBox = document.getElementById('speaking-live-transcript-box');
        if (liveBox) liveBox.innerHTML = '<span class="text-slate-400 italic">Listening... Start speaking whenever you\'re ready.</span>';

        const transcriptArea = document.getElementById('speech-transcript-input');
        if (transcriptArea) transcriptArea.value = '';
        updateWordCount('');

        setStage('practice');
        showToast("Session reset. Take your time to prepare.", "↺");
    }

    function toggleTypeFallback() {
        const fallback = document.getElementById('type-fallback-container');
        if (fallback) {
            fallback.classList.toggle('hidden');
        }
    }

    function clearTranscript() {
        if (recognitionManager) {
            recognitionManager.reset();
        }
        const transcriptArea = document.getElementById('speech-transcript-input');
        if (transcriptArea) transcriptArea.value = '';
        const liveBox = document.getElementById('speaking-live-transcript-box');
        if (liveBox) liveBox.innerHTML = '<span class="text-slate-400 italic">Listening... Start speaking whenever you\'re ready.</span>';
        updateWordCount('');
        resetTimer();
        showToast("Transcript cleared.", "🗑️");
    }

    function updateWordCount(explicitText = null) {
        const text = explicitText !== null
            ? explicitText.trim()
            : (document.getElementById('speech-transcript-input')?.value || '').trim();

        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

        const liveBadge = document.getElementById('live-word-count-badge');
        if (liveBadge) liveBadge.innerText = `${words} words`;

        const countBadge = document.getElementById('word-count-badge');
        if (countBadge) countBadge.innerText = `${words} words`;
    }

    // =========================================================================
    // 6. TIMER CONTROLS
    // =========================================================================
    function setTimerDuration(seconds) {
        timerDuration = seconds;
        timeRemaining = seconds;
        updateTimerDisplay();

        const goalLabel = document.getElementById('speaking-goal-label');
        if (goalLabel) goalLabel.innerText = `${seconds} Seconds`;

        // Update preset buttons
        document.querySelectorAll('.timer-preset-btn').forEach(btn => {
            if (btn.innerText.trim() === `${seconds}s`) {
                btn.classList.add('text-blue-600', 'border', 'border-blue-300');
                btn.classList.remove('text-slate-600');
            } else {
                btn.classList.remove('text-blue-600', 'border', 'border-blue-300');
                btn.classList.add('text-slate-600');
            }
        });
    }

    function updateTimerDisplay() {
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        const display = document.getElementById('timer-display');
        if (display) {
            display.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        const pct = timerDuration > 0 ? (timeRemaining / timerDuration) * 100 : 0;
        const progress = document.getElementById('timer-progress-bar');
        if (progress) {
            progress.style.width = `${pct}%`;
        }
    }

    function startTimer() {
        if (isTimerRunning) return;
        isTimerRunning = true;

        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (timeRemaining > 0) {
                timeRemaining--;
                updateTimerDisplay();
            } else {
                pauseTimer();
                if (recognitionManager && recognitionManager.isRecording) {
                    recognitionManager.stop();
                }
                showToast("⏱️ Time's up! Generating your coaching feedback...", "🔔");
                finishSpeakingAndEvaluate();
            }
        }, 1000);
    }

    function pauseTimer() {
        clearInterval(timerInterval);
        isTimerRunning = false;
    }

    function resetTimer() {
        pauseTimer();
        timeRemaining = timerDuration;
        updateTimerDisplay();
    }

    // =========================================================================
    // 7. SPEECH EVALUATION DISPATCH
    // =========================================================================
    async function submitSpeechForEvaluation() {
        let transcript = '';
        if (recognitionManager && recognitionManager.finalTranscript) {
            transcript = recognitionManager.finalTranscript.trim();
        }
        if (!transcript) {
            const transcriptArea = document.getElementById('speech-transcript-input');
            transcript = transcriptArea ? transcriptArea.value.trim() : '';
        }

        if (!transcript) {
            showToast("Please speak or enter a speech transcript first.", "⚠️");
            setStage('practice');
            return;
        }

        setUIState('ANALYZING');

        const durationSpent = recognitionManager && recognitionManager.getDurationSeconds() > 0
            ? recognitionManager.getDurationSeconds()
            : Math.max(5, timerDuration - timeRemaining);

        // Execute local deterministic speech diagnostics engine
        const SpeechDiagnostics = window.SpeechDiagnostics;
        let evaluationResult = null;

        if (SpeechDiagnostics && typeof SpeechDiagnostics.analyzeSpeech === 'function') {
            evaluationResult = SpeechDiagnostics.analyzeSpeech({
                transcript,
                duration: durationSpent,
                topic: currentTopic ? currentTopic.prompt : '',
                targetStructure: currentTopic?.framework || 'PREP'
            });
        }

        // Also optionally notify backend to persist to SQLite
        try {
            const currentUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
            const userEmail = currentUser ? currentUser.email : 'guest@praxis.app';

            fetch('/api/coach/evaluate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript,
                    mode: currentTrack,
                    topic: currentTopic ? currentTopic.title : '',
                    timeSpentSeconds: durationSpent,
                    userEmail
                })
            }).catch(e => console.warn("Backend logging skipped:", e));
        } catch (e) {}

        if (evaluationResult) {
            renderCoachFeedback(evaluationResult, transcript);
            saveSessionToHistory(evaluationResult, transcript);

            // Cloud persistence
            if (window.praxisAuth && typeof window.praxisAuth.recordCoachSession === 'function') {
                window.praxisAuth.recordCoachSession({
                    topic: currentTopic ? currentTopic.title : 'Speech Practice',
                    durationSeconds: durationSpent,
                    overallScore: evaluationResult.overallScore,
                    fluencyScore10: evaluationResult.fluencyScore10,
                    grammarScore10: evaluationResult.grammarScore10,
                    vocabularyScore10: evaluationResult.vocabularyScore10,
                    structureScore10: evaluationResult.structureScore10,
                    wpm: evaluationResult.wpm,
                    wordCount: evaluationResult.wordCount,
                    fillerCount: evaluationResult.fillerCount
                });
            }

            activeEvaluation = evaluationResult;
            setUIState('COMPLETE');
            setStage('feedback');
        } else {
            showToast("Failed to analyze speech. Please try again.", "❌");
            setStage('practice');
        }
    }

    // =========================================================================
    // 7. RENDER COACH FEEDBACK & PROGRESS
    // =========================================================================
    function renderCoachFeedback(evalData, rawTranscript) {
        if (!evalData) return;

        // ---------------------------------------------------------------------
        // REFERENCE C: 3 COMPACT METRIC CARDS HYDRATION
        // ---------------------------------------------------------------------
        const cfStat = document.getElementById('compact-filler-stat');
        const cfPill = document.getElementById('compact-filler-pill');
        if (cfStat) {
            const count = evalData.fillerCount ?? 0;
            cfStat.innerText = `${count} detected`;
            if (cfPill) {
                if (count === 0) {
                    cfPill.innerText = 'Smooth';
                    cfPill.className = 'stitch-badge-green font-bold text-[10px]';
                } else if (count <= 2) {
                    cfPill.innerText = 'Low';
                    cfPill.className = 'stitch-badge-cyan font-bold text-[10px]';
                } else {
                    cfPill.innerText = 'Elevated';
                    cfPill.className = 'stitch-badge-amber font-bold text-[10px]';
                }
            }
        }

        const cpStat = document.getElementById('compact-pace-stat');
        const cpPill = document.getElementById('compact-pace-pill');
        if (cpStat) {
            const wpm = evalData.wpm || 0;
            cpStat.innerText = `${wpm} WPM`;
            if (cpPill) {
                if (wpm >= 120 && wpm <= 160) {
                    cpPill.innerText = 'Ideal';
                    cpPill.className = 'stitch-badge-cyan font-bold text-[10px]';
                } else if (wpm > 160) {
                    cpPill.innerText = 'Rushed';
                    cpPill.className = 'stitch-badge-amber font-bold text-[10px]';
                } else {
                    cpPill.innerText = 'Measured';
                    cpPill.className = 'stitch-badge-green font-bold text-[10px]';
                }
            }
        }

        const ccStat = document.getElementById('compact-clarity-stat');
        const ccPill = document.getElementById('compact-clarity-pill');
        if (ccStat) {
            const score = evalData.overallScore || 0;
            ccStat.innerText = `${score}%`;
            if (ccPill) {
                if (score >= 85) {
                    ccPill.innerText = 'Crisp';
                    ccPill.className = 'stitch-badge-violet font-bold text-[10px]';
                } else if (score >= 70) {
                    ccPill.innerText = 'Clear';
                    ccPill.className = 'stitch-badge-green font-bold text-[10px]';
                } else {
                    ccPill.innerText = 'Developing';
                    ccPill.className = 'stitch-badge-amber font-bold text-[10px]';
                }
            }
        }

        // ---------------------------------------------------------------------
        // 1. Coach Encouragement Greeting
        // ---------------------------------------------------------------------
        const greetingEl = document.getElementById('coach-feedback-greeting');
        if (greetingEl) {
            greetingEl.innerText = evalData.coachGreeting?.title || "Nice work!";
        }

        // ---------------------------------------------------------------------
        // 2. Before / After Comparison Banner (Visible on Drill / Retry)
        // ---------------------------------------------------------------------
        const bannerEl = document.getElementById('before-after-comparison-banner');
        const comparisonDetailsEl = document.getElementById('before-after-comparison-details');

        if (isDrillRetry && baselineEvaluation && bannerEl && comparisonDetailsEl) {
            const baseFillers = baselineEvaluation.fillerCount ?? 0;
            const newFillers = evalData.fillerCount ?? 0;
            const fillerDiff = baseFillers - newFillers;

            let fillerSummary = "";
            let fillerColor = "text-slate-800";
            if (fillerDiff > 0) {
                fillerSummary = `${baseFillers} ➔ ${newFillers} (${fillerDiff} fewer! 🎉)`;
                fillerColor = "text-emerald-700";
            } else if (fillerDiff < 0) {
                fillerSummary = `${baseFillers} ➔ ${newFillers} (+${Math.abs(fillerDiff)})`;
                fillerColor = "text-amber-700";
            } else {
                fillerSummary = `${newFillers} (maintained)`;
                fillerColor = "text-blue-700";
            }

            const baseWpm = baselineEvaluation.wpm || 0;
            const newWpm = evalData.wpm || 0;
            const wpmDiff = newWpm - baseWpm;
            const wpmPct = baseWpm > 0 ? Math.round((Math.abs(wpmDiff) / baseWpm) * 100) : 0;
            let pacingSummary = `${baseWpm} ➔ ${newWpm} WPM`;
            if (wpmDiff !== 0) {
                pacingSummary += ` (${wpmPct}% change)`;
            }

            const baseScore = baselineEvaluation.overallScore || 0;
            const newScore = evalData.overallScore || 0;
            const scoreDiff = newScore - baseScore;
            const scoreSummary = `${baseScore} ➔ ${newScore} pts (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`;
            const scoreColor = scoreDiff >= 0 ? "text-emerald-700" : "text-slate-700";

            comparisonDetailsEl.innerHTML = `
                <div class="neu-card-sm p-3 bg-white/80 border border-emerald-200/80 flex flex-col gap-0.5">
                    <span class="text-[10px] font-bold text-slate-500 uppercase">Filler Words</span>
                    <span class="font-extrabold ${fillerColor} text-xs sm:text-sm">${fillerSummary}</span>
                </div>
                <div class="neu-card-sm p-3 bg-white/80 border border-blue-200/80 flex flex-col gap-0.5">
                    <span class="text-[10px] font-bold text-slate-500 uppercase">Speaking Cadence</span>
                    <span class="font-extrabold text-blue-700 text-xs sm:text-sm">${pacingSummary}</span>
                </div>
                <div class="neu-card-sm p-3 bg-white/80 border border-indigo-200/80 flex flex-col gap-0.5">
                    <span class="text-[10px] font-bold text-slate-500 uppercase">Overall Quality</span>
                    <span class="font-extrabold ${scoreColor} text-xs sm:text-sm">${scoreSummary}</span>
                </div>
            `;
            bannerEl.classList.remove('hidden');
        } else if (bannerEl) {
            bannerEl.classList.add('hidden');
        }

        // ---------------------------------------------------------------------
        // 3. Top 1–2 Important Weaknesses (Plain language with speech evidence)
        // ---------------------------------------------------------------------
        const primary = evalData.primaryWeakness || evalData.coachInsights?.primaryWeakness;
        if (primary) {
            const badgeEl = document.getElementById('primary-weakness-type-badge');
            const titleEl = document.getElementById('primary-weakness-title');
            const expEl = document.getElementById('primary-weakness-explanation');
            const tipEl = document.getElementById('primary-weakness-tip');

            if (badgeEl) {
                const label = primary.type ? primary.type.replace(/_/g, ' ').toUpperCase() : 'COACHING FOCUS';
                badgeEl.innerText = `${primary.icon || '🎯'} ${label}`;
            }
            if (titleEl) titleEl.innerText = primary.title || "Speaking Refinement";
            if (expEl) {
                let fullExp = primary.explanation || "";
                if (primary.evidence) {
                    fullExp += ` ${primary.evidence}`;
                }
                expEl.innerText = fullExp;
            }
            if (tipEl) tipEl.innerText = primary.tip || "Take a relaxed breath after each sentence to let ideas land.";
        }

        const secondary = evalData.secondaryWeakness || evalData.coachInsights?.secondaryWeakness;
        const secCard = document.getElementById('secondary-weakness-card');
        if (secondary && secondary.title && secCard) {
            secCard.classList.remove('hidden');
            const secTitle = document.getElementById('secondary-weakness-title');
            const secExp = document.getElementById('secondary-weakness-explanation');
            if (secTitle) secTitle.innerText = `${secondary.title}:`;
            if (secExp) {
                let fullSecExp = secondary.explanation || "";
                if (secondary.evidence) fullSecExp += ` (${secondary.evidence})`;
                secExp.innerText = fullSecExp;
            }
        } else if (secCard) {
            secCard.classList.add('hidden');
        }

        // ---------------------------------------------------------------------
        // 4. What You Did Well (Strengths)
        // ---------------------------------------------------------------------
        const strengthsList = document.getElementById('coach-strengths-list');
        const strengths = evalData.coachStrengths || evalData.coachInsights?.strengths || evalData.strengths || [];
        if (strengthsList) {
            strengthsList.innerHTML = '';
            const displayStrengths = strengths.length > 0 ? strengths.slice(0, 2) : ["Clear verbal output with identifiable message."];
            displayStrengths.forEach(st => {
                const li = document.createElement('li');
                li.className = "flex items-center gap-2";
                li.innerHTML = `<span class="text-emerald-600 font-bold">✓</span> <span>${st}</span>`;
                strengthsList.appendChild(li);
            });
        }

        // ---------------------------------------------------------------------
        // 5. Targeted Practice Drill Card
        // ---------------------------------------------------------------------
        const drill = evalData.drill || evalData.coachInsights?.drill;
        currentDrill = drill;
        const drillCard = document.getElementById('targeted-drill-card');
        if (drill && drillCard) {
            drillCard.classList.remove('hidden');
            const dTitle = document.getElementById('drill-title');
            const dBadge = document.getElementById('drill-duration-badge');
            const dInstr = document.getElementById('drill-instructions');

            if (dTitle) dTitle.innerText = drill.title || "Targeted Practice Exercise";
            if (dBadge) dBadge.innerText = `⏱️ ${drill.targetDuration || 45} Seconds`;
            if (dInstr) {
                let fullInstr = drill.instructions || "";
                if (drill.target) fullInstr += ` ${drill.target}`;
                dInstr.innerText = fullInstr;
            }
        }

        // ---------------------------------------------------------------------
        // 6. Populate Collapsible Detailed Feedback Accordion (All Deep Diagnostics)
        // ---------------------------------------------------------------------
        renderDetailedAccordion(evalData, rawTranscript);
    }

    function renderDetailedAccordion(evalData, rawTranscript) {
        // Core 5 Scores
        const elOverall = document.getElementById('metric-overall-score');
        const elFluency = document.getElementById('metric-fluency-score');
        const elGrammar = document.getElementById('metric-grammar-score');
        const elVocab = document.getElementById('metric-vocab-score');
        const elStructure = document.getElementById('metric-structure-score');

        if (elOverall) elOverall.innerText = `${evalData.overallScore} / 100`;
        if (elFluency) elFluency.innerText = `${evalData.fluencyScore10} / 10`;
        if (elGrammar) elGrammar.innerText = `${evalData.grammarScore10} / 10`;
        if (elVocab) elVocab.innerText = `${evalData.vocabularyScore10} / 10`;
        if (elStructure) elStructure.innerText = `${evalData.structureScore10} / 10`;

        // Deterministic Metrics Strip
        const elWpm = document.getElementById('metric-wpm');
        const elPace = document.getElementById('metric-pace-status');
        const elWordCount = document.getElementById('metric-word-count');
        const elSentenceCount = document.getElementById('metric-sentence-count');
        const elFillerCount = document.getElementById('metric-filler-count');
        const elFillerPct = document.getElementById('metric-filler-percentage');
        const elLexical = document.getElementById('metric-diversity');

        if (elWpm) elWpm.innerText = evalData.wpm;
        if (elPace) elPace.innerText = evalData.paceStatus;
        if (elWordCount) elWordCount.innerText = `${evalData.wordCount} words`;
        if (elSentenceCount) elSentenceCount.innerText = `${evalData.sentenceCount} sentences`;
        if (elFillerCount) elFillerCount.innerText = `${evalData.fillerCount} detected`;
        if (elFillerPct) elFillerPct.innerText = `${evalData.fillerPercentage}%`;
        if (elLexical) elLexical.innerText = `${evalData.lexicalVariety}% variety`;

        // Top Improvement Notes
        const top3Container = document.getElementById('top-improvements-list');
        if (top3Container) {
            top3Container.innerHTML = '';
            (evalData.top3Improvements || []).forEach((imp, idx) => {
                const item = document.createElement('div');
                item.className = "neu-card-sm p-3 text-xs sm:text-sm text-slate-800 bg-amber-50/40 border border-amber-200 flex items-start gap-2.5";
                item.innerHTML = `
                    <span class="neu-circle w-6 h-6 shrink-0 flex items-center justify-center font-bold text-amber-700 bg-amber-100 text-xs">${idx + 1}</span>
                    <span class="leading-relaxed">${imp}</span>
                `;
                top3Container.appendChild(item);
            });
        }

        // Detailed Strengths
        const strengthsContainer = document.getElementById('key-strengths-list');
        if (strengthsContainer) {
            strengthsContainer.innerHTML = '';
            (evalData.strengths || []).forEach(st => {
                const li = document.createElement('li');
                li.className = "neu-card-sm p-3 text-xs sm:text-sm text-slate-700 bg-emerald-50/40 border border-emerald-100 flex items-start gap-2";
                li.innerHTML = `<span class="text-emerald-500 font-bold">✓</span> <span>${st}</span>`;
                strengthsContainer.appendChild(li);
            });
        }

        // Annotated Transcript
        const transcriptBox = document.getElementById('annotated-transcript-box');
        if (transcriptBox) {
            if (window.TranscriptProcessor && typeof window.TranscriptProcessor.generateAnnotatedTranscript === 'function') {
                transcriptBox.innerHTML = window.TranscriptProcessor.generateAnnotatedTranscript(rawTranscript);
            } else {
                transcriptBox.innerText = rawTranscript;
            }
        }

        // Corrections & Grammar Diagnostics
        const correctionsList = document.getElementById('corrections-list-container');
        if (correctionsList) {
            correctionsList.innerHTML = '';
            if (evalData.grammarCorrections && evalData.grammarCorrections.length > 0) {
                evalData.grammarCorrections.slice(0, 3).forEach(c => {
                    const row = document.createElement('div');
                    row.className = "neu-card-sm p-3.5 flex flex-col gap-1.5 bg-white/60 border border-red-100";
                    row.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="neu-badge px-2 py-0.5 text-[10px] font-bold text-red-600 bg-red-50">${c.rule}</span>
                        </div>
                        <div class="text-xs text-slate-500">Spoken: <span class="text-slate-800 line-through">"${c.original}"</span></div>
                        <div class="text-xs font-bold text-emerald-700">Correction: <span>"${c.correction}"</span></div>
                        <div class="text-[11px] text-slate-600 bg-slate-100 p-2 rounded-lg mt-0.5">${c.explanation}</div>
                    `;
                    correctionsList.appendChild(row);
                });
            } else {
                correctionsList.innerHTML = `
                    <div class="p-3 text-xs text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
                        <span>✅</span> <span>No grammatical errors detected! Clean syntax.</span>
                    </div>
                `;
            }
        }

        // Better Phrasing: Natural & Professional Rephrasings
        const naturalEl = document.getElementById('rephrase-natural-version');
        const profEl = document.getElementById('rephrase-professional-version');
        if (naturalEl) naturalEl.innerText = `"${evalData.rephrasings?.natural || rawTranscript}"`;
        if (profEl) profEl.innerText = `"${evalData.rephrasings?.professional || rawTranscript}"`;

        // Vocabulary Upgrades
        const vocabContainer = document.getElementById('vocab-boost-container');
        if (vocabContainer) {
            vocabContainer.innerHTML = '';
            if (evalData.vocabularyImprovements && evalData.vocabularyImprovements.length > 0) {
                evalData.vocabularyImprovements.slice(0, 3).forEach(v => {
                    const card = document.createElement('div');
                    card.className = "neu-card-sm p-3.5 flex flex-col gap-1.5 bg-white/50 border border-amber-100";
                    const synBadges = v.suggestions.slice(0, 3).map(s => `<span class="neu-badge px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50">✨ ${s}</span>`).join(' ');
                    card.innerHTML = `
                        <div class="text-xs text-slate-500">Instead of: <span class="font-bold text-red-600 line-through">"${v.original}"</span></div>
                        <div class="flex flex-wrap gap-1.5 my-1">${synBadges}</div>
                        <div class="text-[11px] text-slate-600">${v.explanation}</div>
                    `;
                    vocabContainer.appendChild(card);
                });
            } else {
                vocabContainer.innerHTML = `
                    <div class="p-3 text-xs text-slate-600 bg-slate-50 rounded-xl border border-slate-200">
                        <span>✨ Good vocabulary diversity. Keep utilizing precise verbs and adjectives in your drills.</span>
                    </div>
                `;
            }
        }
    }

    // =========================================================================
    // 8. TARGETED DRILL LAUNCHER & NEW SESSION
    // =========================================================================
    function launchTargetedDrill() {
        if (!currentDrill && activeEvaluation?.drill) {
            currentDrill = activeEvaluation.drill;
        }

        isDrillRetry = true;
        baselineEvaluation = activeEvaluation;

        if (currentDrill) {
            // Apply drill duration
            if (currentDrill.targetDuration) {
                setTimerDuration(currentDrill.targetDuration);
            }

            // Apply drill topic prompt
            if (currentDrill.topicPrompt) {
                currentTopic = {
                    title: currentDrill.title || "Targeted Drill",
                    prompt: currentDrill.topicPrompt,
                    category: "Targeted Drill",
                    framework: currentDrill.title
                };
                renderTopic(currentTopic);
            }

            // Show drill active badge in practice stage
            const drillBadge = document.getElementById('drill-active-badge');
            if (drillBadge) {
                drillBadge.innerText = `🎯 ${currentDrill.badge || 'Targeted Drill Active'}`;
                drillBadge.classList.remove('hidden');
            }

            // Update coach tip
            const tipEl = document.getElementById('framework-desc');
            if (tipEl && currentDrill.instructions) {
                tipEl.innerText = `${currentDrill.instructions} ${currentDrill.target || ''}`;
            }
        }

        clearTranscript();
        resetTimer();
        setStage('practice');
        showToast("🎯 Targeted drill loaded! Take a moment to prep, then click Start Speaking.", "⚡");
    }

    function startNewSession() {
        isDrillRetry = false;
        baselineEvaluation = null;
        currentDrill = null;

        const drillBadge = document.getElementById('drill-active-badge');
        if (drillBadge) drillBadge.classList.add('hidden');

        setTimerDuration(60);
        shuffleTopic();
        clearTranscript();
        resetTimer();
        setStage('practice');
    }

    // =========================================================================
    // 9. TEXT-TO-SPEECH (TTS) AUDIO FEEDBACK
    // =========================================================================
    function speakCoachFeedback() {
        if (!('speechSynthesis' in window)) {
            showToast("Text-to-speech is not supported in this browser.", "⚠️");
            return;
        }
        window.speechSynthesis.cancel();

        const textToSpeak = activeEvaluation?.rephrasings?.professional ||
            activeEvaluation?.rephrasings?.natural ||
            "Great speaking practice! Continue focusing on clear pace and structured delivery.";

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.lang = 'en-US';

        window.speechSynthesis.speak(utterance);
        showToast("🔊 Playing Natural & Professional Phrasing...", "🎙️");
    }

    // =========================================================================
    // 10. SESSION HISTORY & PROGRESS SUMMARY (REAL METRICS ONLY)
    // =========================================================================
    function saveSessionToHistory(evalData, rawTranscript) {
        if (!evalData || !evalData.isAnalyzed) return;

        try {
            const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
            let sessions = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(sessions)) sessions = [];

            const primary = evalData.primaryWeakness || evalData.coachInsights?.primaryWeakness;

            const newSession = {
                id: 'sess_' + Date.now(),
                date: new Date().toISOString(),
                topic: currentTopic ? currentTopic.title : 'Speech Practice',
                duration: evalData.durationSeconds,
                overallScore: evalData.overallScore,
                fluencyScore: evalData.fluencyScore10,
                grammarScore: evalData.grammarScore10,
                vocabScore: evalData.vocabularyScore10,
                structureScore: evalData.structureScore10,
                wpm: evalData.wpm,
                fillerCount: evalData.fillerCount,
                wordCount: evalData.wordCount,
                primaryWeaknessTitle: primary?.title || '',
                isDrill: isDrillRetry
            };

            sessions.unshift(newSession);
            // Keep up to 20 past sessions
            sessions = sessions.slice(0, 20);
            localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));

            renderSessionHistory(sessions);
            updateProgressSummaryCards(sessions);
        } catch (e) {
            console.warn("Could not save to localStorage:", e);
        }
    }

    function loadSessionHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
            const sessions = raw ? JSON.parse(raw) : [];
            renderSessionHistory(sessions);
            updateProgressSummaryCards(sessions);
        } catch (e) {
            console.warn("Could not load localStorage history:", e);
        }
    }

    function updateProgressSummaryCards(sessions) {
        if (!sessions || sessions.length === 0) return;

        const latest = sessions[0];

        // 1. Today's Focus
        const todayFocusEl = document.getElementById('progress-today-focus');
        if (todayFocusEl) {
            todayFocusEl.innerText = latest.primaryWeaknessTitle || "Maintain clear, steady pacing";
        }

        // 2. Biggest Improvement
        const improvementEl = document.getElementById('progress-biggest-improvement');
        const improvementStatEl = document.getElementById('progress-improvement-stat');
        if (improvementEl && sessions.length >= 2) {
            const prev = sessions[1];
            if (latest.fillerCount < prev.fillerCount) {
                improvementEl.innerText = "Fewer filler words during speaking";
                if (improvementStatEl) improvementStatEl.innerText = `Reduced from ${prev.fillerCount} down to ${latest.fillerCount} fillers!`;
            } else if (latest.overallScore > prev.overallScore) {
                improvementEl.innerText = `Overall score increased by +${latest.overallScore - prev.overallScore} pts`;
                if (improvementStatEl) improvementStatEl.innerText = `Score rose from ${prev.overallScore} to ${latest.overallScore}`;
            } else if (latest.wpm >= 110 && latest.wpm <= 150 && (prev.wpm < 110 || prev.wpm > 150)) {
                improvementEl.innerText = "Speaking cadence normalized";
                if (improvementStatEl) improvementStatEl.innerText = `Reached natural ${latest.wpm} WPM flow`;
            } else {
                improvementEl.innerText = "Consistent daily speaking practice";
                if (improvementStatEl) improvementStatEl.innerText = `${sessions.length} sessions logged`;
            }
        }

        // 3. Superpowers (Consistent Strengths)
        const strengthsSummaryEl = document.getElementById('progress-strengths-summary');
        if (strengthsSummaryEl) {
            if (latest.fillerCount <= 1) {
                strengthsSummaryEl.innerText = "Exceptional speech hygiene (near-zero fillers)";
            } else if (latest.wpm >= 110 && latest.wpm <= 150) {
                strengthsSummaryEl.innerText = "Well-regulated, natural speaking pace";
            } else {
                strengthsSummaryEl.innerText = "Clear articulation & structured delivery";
            }
        }
    }

    function renderSessionHistory(sessions) {
        const container = document.getElementById('sessions-history-list');
        const statsSummary = document.getElementById('session-history-stats-summary');
        if (!container) return;

        if (!sessions || sessions.length === 0) {
            container.innerHTML = `<div class="text-xs text-slate-500 py-3 text-center">No past speech sessions recorded yet. Start speaking above!</div>`;
            if (statsSummary) statsSummary.classList.add('hidden');
            return;
        }

        // Calculate Current and Best
        const currentScore = sessions[0]?.overallScore || 0;
        const bestScore = Math.max(...sessions.map(s => s.overallScore || 0));

        if (statsSummary) {
            statsSummary.classList.remove('hidden');
            const elCurrent = document.getElementById('hist-stat-current');
            const elBest = document.getElementById('hist-stat-best');
            if (elCurrent) elCurrent.innerText = currentScore;
            if (elBest) elBest.innerText = bestScore;
        }

        container.innerHTML = '';
        sessions.slice(0, 8).forEach(s => {
            const dateStr = new Date(s.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const item = document.createElement('div');
            item.className = "neu-card-sm p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white/50 border border-slate-200/70";
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="neu-circle w-9 h-9 flex items-center justify-center font-bold text-xs text-blue-600 bg-blue-50">
                        ${s.overallScore}
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-800">${s.topic}</span>
                            ${s.isDrill ? '<span class="neu-badge px-1.5 py-0.2 text-[9px] font-bold text-amber-700 bg-amber-100">Drill</span>' : ''}
                        </div>
                        <div class="text-[10px] text-slate-500">${dateStr} • ${s.wpm} WPM • ${s.fillerCount} filler(s) • ${s.duration || 0}s</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="neu-badge px-2 py-0.5 text-[10px] font-bold text-slate-600">Fluency: ${s.fluencyScore}</span>
                    <span class="neu-badge px-2 py-0.5 text-[10px] font-bold text-indigo-600">Grammar: ${s.grammarScore}</span>
                </div>
            `;
            container.appendChild(item);
        });
    }

    // =========================================================================
    // 11. TOAST NOTIFICATIONS
    // =========================================================================
    function showToast(msg, icon = 'ℹ️') {
        const toast = document.getElementById('coach-toast');
        if (!toast) return;
        const msgEl = document.getElementById('coach-toast-msg');
        const iconEl = document.getElementById('coach-toast-icon');
        if (msgEl) msgEl.innerText = msg;
        if (iconEl) iconEl.innerText = icon;
        toast.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 3400);
    }

    function getFallbackTopics() {
        return {
            express: [
                {
                    title: "Remote Work vs. Hybrid Model",
                    prompt: "Should remote work completely replace traditional office work in the future, or is a hybrid model the only sustainable path?",
                    framework: "State your point, explain why, share a real-world example, and wrap up with a strong conclusion.",
                    duration: 60,
                    category: "Workplace & Technology"
                },
                {
                    title: "Artificial Intelligence in Daily Decisions",
                    prompt: "Will relying on AI for everyday micro-decisions diminish human critical thinking skills?",
                    framework: "State your point, explain why, share a real-world example, and wrap up with a strong conclusion.",
                    duration: 60,
                    category: "Technology & Ethics"
                },
                {
                    title: "Continuous Learning vs. Deep Specialization",
                    prompt: "In a rapidly evolving economy, is it more advantageous to be a broad generalist or a deep specialist?",
                    framework: "State your point, explain why, share a real-world example, and wrap up with a strong conclusion.",
                    duration: 60,
                    category: "Personal Growth"
                }
            ]
        };
    }

    // Expose global methods for HTML onclick bindings
    root.setStage = setStage;
    root.startSpeakingStage = startSpeakingStage;
    root.finishSpeakingAndEvaluate = finishSpeakingAndEvaluate;
    root.cancelSpeakingAndRestart = cancelSpeakingAndRestart;
    root.launchTargetedDrill = launchTargetedDrill;
    root.startNewSession = startNewSession;
    root.togglePrepTimer = togglePrepTimer;
    root.startPrepCountdown = startPrepCountdown;
    root.stopPrepCountdown = stopPrepCountdown;
    root.toggleTypeFallback = toggleTypeFallback;
    root.shuffleTopic = shuffleTopic;
    root.selectTrack = selectTrack;
    root.clearTranscript = clearTranscript;
    root.setTimerDuration = setTimerDuration;
    root.submitSpeechForEvaluation = submitSpeechForEvaluation;
    root.speakCoachFeedback = speakCoachFeedback;
    root.loadSessionHistory = loadSessionHistory;

})(typeof window !== 'undefined' ? window : this);
