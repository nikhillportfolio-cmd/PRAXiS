/**
 * PRAXiS Fluency Lab - UI Controller
 * Manages Level Switching, Exercise Carousel, Live Speech Recognition,
 * Fluency Metrics Visualization, Retry Challenges, and Personal Bests.
 */

(function (root) {
    'use strict';

    // State Variables
    let recognitionManager = null;
    let currentLevel = 1;
    let currentExercise = null;
    let currentExpansionTier = 1;
    let isRecording = false;
    let isTimerRunning = false;
    let timerInterval = null;
    let timerDuration = 30;
    let timeRemaining = 30;
    let responseCountdown = 15;
    let countdownInterval = null;
    let activeEvaluation = null;
    let previousEvaluation = null;
    let currentExerciseAttempts = [];

    const STORAGE_KEY_FLUENCY_SESSIONS = 'praxis_fluency_sessions_v1';
    const STORAGE_KEY_PERSONAL_BESTS = 'praxis_fluency_personal_bests_v1';

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        // Only initialize if Fluency Lab elements exist in the page
        if (document.getElementById('fluency-lab-container')) {
            initFluencyLab();
        }
    });

    function initFluencyLab() {
        initSpeechRecognition();
        bindUIEvents();
        selectLevel(1);
        loadPersonalBests();
        loadFluencyHistory();
    }

    // =========================================================================
    // 1. SPEECH RECOGNITION SETUP
    // =========================================================================
    function initSpeechRecognition() {
        const SpeechRecognitionManager = window.SpeechRecognitionManager;
        if (!SpeechRecognitionManager) {
            console.warn("SpeechRecognitionManager not available for Fluency Lab.");
            return;
        }

        recognitionManager = new SpeechRecognitionManager({
            lang: 'en-US',
            onTranscriptUpdate: (data) => {
                const liveTranscriptEl = document.getElementById('fluency-live-transcript');
                const wordCountBadge = document.getElementById('fluency-word-count-badge');
                
                if (liveTranscriptEl) {
                    liveTranscriptEl.innerText = data.fullTranscript || 'Listening for speech...';
                }
                if (wordCountBadge) {
                    const words = data.fullTranscript ? data.fullTranscript.trim().split(/\s+/).filter(Boolean) : [];
                    wordCountBadge.innerText = `${words.length} words`;
                }
            },
            onStateChange: (state, payload) => {
                setFluencyState(state, payload);
            },
            onError: (friendlyMsg, errorType) => {
                showFluencyToast(friendlyMsg, "⚠️");
                setFluencyState('ERROR', { message: friendlyMsg });
            }
        });
    }

    function bindUIEvents() {
        // Direct event bindings can be configured here if needed
    }

    // =========================================================================
    // 2. LEVEL & EXERCISE SELECTION
    // =========================================================================
    function selectLevel(levelNum) {
        currentLevel = Number(levelNum) || 1;
        currentExpansionTier = 1;

        // Update Level Tabs Styling
        document.querySelectorAll('.fluency-level-tab').forEach(btn => {
            const lvl = Number(btn.getAttribute('data-level'));
            if (lvl === currentLevel) {
                btn.classList.add('pressed', 'text-blue-600', 'border', 'border-blue-300');
                btn.classList.remove('text-slate-700');
            } else {
                btn.classList.remove('pressed', 'text-blue-600', 'border', 'border-blue-300');
                btn.classList.add('text-slate-700');
            }
        });

        // Load exercises for this level
        const FluencyLabData = window.FluencyLabData;
        if (!FluencyLabData) return;

        const exercises = FluencyLabData.getExercisesByLevel(currentLevel);
        if (exercises.length > 0) {
            loadExercise(exercises[0]);
        }
    }

    function loadExercise(exercise) {
        if (!exercise) return;
        currentExercise = exercise;
        currentExpansionTier = 1;
        previousEvaluation = null;
        currentExerciseAttempts = [];

        // Reset previous recording / results
        resetFluencyRecording();
        hideResultsDashboard();

        // Update Header & Metadata
        const levelBadge = document.getElementById('fl-level-badge');
        const topicBadge = document.getElementById('fl-topic-badge');
        const titleEl = document.getElementById('fl-exercise-title');
        const instructionEl = document.getElementById('fl-exercise-instruction');
        const targetDisplayBox = document.getElementById('fl-target-display-box');
        const expansionTierControls = document.getElementById('fl-expansion-tier-controls');
        const connectorGuideBox = document.getElementById('fl-connector-guide-box');
        const quickTimerBox = document.getElementById('fl-quick-timer-box');

        if (levelBadge) levelBadge.innerText = `Level ${exercise.level} — ${exercise.type.replace('_', ' ').toUpperCase()}`;
        if (topicBadge) topicBadge.innerText = exercise.topic || 'General';
        if (titleEl) titleEl.innerText = exercise.title;
        if (instructionEl) instructionEl.innerText = exercise.instruction;

        // Set Timer Duration
        setFluencyTimerDuration(exercise.duration || 35);

        // Hide special boxes by default
        if (expansionTierControls) expansionTierControls.classList.add('hidden');
        if (connectorGuideBox) connectorGuideBox.classList.add('hidden');
        if (quickTimerBox) quickTimerBox.classList.add('hidden');

        // Render Exercise Content according to type
        if (!targetDisplayBox) return;

        switch (exercise.type) {
            case 'smooth_reading':
                targetDisplayBox.innerHTML = `
                    <div class="text-sm sm:text-base md:text-lg font-medium text-slate-800 leading-relaxed bg-white/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm select-none">
                        "${exercise.text}"
                    </div>
                `;
                break;

            case 'phrase_chunking':
                const chunkHtml = (exercise.chunks || []).map(chunk => 
                    `<span class="inline-block bg-blue-50/80 text-blue-900 px-3 py-1.5 rounded-xl border border-blue-200 font-semibold mx-1 my-1 shadow-sm">${chunk}</span>`
                ).join(' <span class="text-slate-400 font-bold text-lg">/</span> ');

                targetDisplayBox.innerHTML = `
                    <div class="flex flex-wrap items-center justify-center text-sm sm:text-base leading-relaxed bg-white/70 p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                        ${chunkHtml}
                    </div>
                    <div class="text-[11px] text-slate-500 mt-2 text-center">
                        💡 Pause briefly at each slash (/) boundary to speak in natural musical thought units.
                    </div>
                `;
                break;

            case 'sentence_expansion':
                if (expansionTierControls) expansionTierControls.classList.remove('hidden');
                renderExpansionTier();
                break;

            case 'connect_thoughts':
                if (connectorGuideBox) connectorGuideBox.classList.remove('hidden');
                const connBadges = (exercise.suggestedConnectors || []).map(c => 
                    `<span class="neu-badge px-2.5 py-1 text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200">🔗 ${c}</span>`
                ).join(' ');

                targetDisplayBox.innerHTML = `
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="p-3.5 bg-white/70 rounded-xl border border-slate-200">
                            <span class="text-[10px] font-bold text-slate-400 uppercase">Idea 1</span>
                            <div class="text-sm font-semibold text-slate-800 mt-1">"${exercise.ideaA}"</div>
                        </div>
                        <div class="p-3.5 bg-white/70 rounded-xl border border-slate-200">
                            <span class="text-[10px] font-bold text-slate-400 uppercase">Idea 2</span>
                            <div class="text-sm font-semibold text-slate-800 mt-1">"${exercise.ideaB}"</div>
                        </div>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-1.5">
                        <span class="text-xs font-bold text-slate-600 mr-1">Suggested Connectors:</span>
                        ${connBadges}
                    </div>
                `;
                break;

            case 'quick_response':
                if (quickTimerBox) quickTimerBox.classList.remove('hidden');
                targetDisplayBox.innerHTML = `
                    <div class="flex flex-col gap-2 bg-white/70 p-4 sm:p-5 rounded-2xl border border-amber-200/80 shadow-sm">
                        <div class="flex items-center gap-2">
                            <span class="neu-badge px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-50">⚡ Impromptu Prompt</span>
                        </div>
                        <div class="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                            "${exercise.promptQuestion}"
                        </div>
                        <div class="text-xs text-slate-600 italic bg-amber-50/50 p-2.5 rounded-xl mt-1">
                            💡 ${exercise.guidance || 'Answer immediately in 2–3 clear sentences.'}
                        </div>
                    </div>
                `;
                break;

            case 'situation_response':
                targetDisplayBox.innerHTML = `
                    <div class="flex flex-col gap-3 bg-white/70 p-4 sm:p-5 rounded-2xl border border-indigo-200/80 shadow-sm">
                        <div class="flex items-center justify-between">
                            <span class="neu-badge px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50">💼 Professional Scenario</span>
                            <span class="text-[11px] font-bold text-slate-500">${exercise.topic || 'Workplace'}</span>
                        </div>
                        <p class="text-xs sm:text-sm text-slate-700 bg-indigo-50/30 p-3 rounded-xl border border-indigo-100 leading-relaxed">
                            "${exercise.scenario}"
                        </p>
                        <div class="text-sm font-bold text-slate-900">
                            Task: ${exercise.promptQuestion}
                        </div>
                        <div class="text-xs text-slate-500">
                            Structure: ${exercise.guidance || 'Acknowledge ➔ Reason ➔ Solution'}
                        </div>
                    </div>
                `;
                break;
        }

        updatePersonalBestDisplay();
    }

    function renderExpansionTier() {
        if (!currentExercise || currentExercise.type !== 'sentence_expansion') return;
        const tiers = currentExercise.tiers || [];
        const activeTierData = tiers.find(t => t.tier === currentExpansionTier) || tiers[0];
        const targetDisplayBox = document.getElementById('fl-target-display-box');

        // Update Tier Buttons Styling
        document.querySelectorAll('.expansion-tier-btn').forEach(btn => {
            const tNum = Number(btn.getAttribute('data-tier'));
            if (tNum === currentExpansionTier) {
                btn.classList.add('pressed', 'text-blue-600', 'border-blue-300');
                btn.classList.remove('text-slate-600');
            } else {
                btn.classList.remove('pressed', 'text-blue-600', 'border-blue-300');
                btn.classList.add('text-slate-600');
            }
        });

        if (targetDisplayBox && activeTierData) {
            targetDisplayBox.innerHTML = `
                <div class="flex flex-col gap-2 bg-white/70 p-4 sm:p-5 rounded-2xl border border-blue-200/80 shadow-sm">
                    <div class="flex items-center justify-between">
                        <span class="neu-badge px-2.5 py-0.5 text-[10px] font-bold text-blue-700 bg-blue-50">
                            Tier ${activeTierData.tier} of 3 (${activeTierData.wordCount} words)
                        </span>
                        <span class="text-[11px] text-slate-500">${activeTierData.instruction}</span>
                    </div>
                    <div class="text-base sm:text-lg font-medium text-slate-800 leading-relaxed mt-1">
                        "${activeTierData.text}"
                    </div>
                </div>
            `;
        }
    }

    function setExpansionTier(tierNum) {
        currentExpansionTier = Number(tierNum) || 1;
        renderExpansionTier();
        resetFluencyRecording();
        hideResultsDashboard();
    }

    function shuffleExercise() {
        const FluencyLabData = window.FluencyLabData;
        if (!FluencyLabData) return;

        const exercises = FluencyLabData.getExercisesByLevel(currentLevel);
        if (exercises.length <= 1) return;

        let nextIdx = Math.floor(Math.random() * exercises.length);
        if (currentExercise && exercises[nextIdx].id === currentExercise.id) {
            nextIdx = (nextIdx + 1) % exercises.length;
        }
        loadExercise(exercises[nextIdx]);
        showFluencyToast("Loaded new exercise.", "🎲");
    }

    // =========================================================================
    // 3. RECORDING & STATE MANAGEMENT
    // =========================================================================
    function toggleFluencyRecording() {
        if (!recognitionManager) {
            initSpeechRecognition();
        }
        if (!recognitionManager || !recognitionManager.isSupported) {
            showFluencyToast("Speech recognition is not supported in this browser. Please use Chrome or Edge.", "⚠️");
            return;
        }

        if (recognitionManager.isRecording) {
            stopFluencyRecording();
        } else {
            startFluencyRecording();
        }
    }

    function startFluencyRecording() {
        // Stop any active TTS audio playback so it doesn't feed into microphone
        if (window.PraxisSpeechSpeaker) {
            window.PraxisSpeechSpeaker.stop();
        } else if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        resetFluencyListenButton();

        // Clear previous live transcript & word count
        const liveTranscriptEl = document.getElementById('fluency-live-transcript');
        const wordCountBadge = document.getElementById('fluency-word-count-badge');
        if (liveTranscriptEl) liveTranscriptEl.innerText = "Listening... Start speaking whenever you're ready.";
        if (wordCountBadge) wordCountBadge.innerText = "0 words";

        hideResultsDashboard();
        timeRemaining = timerDuration;
        updateFluencyTimerDisplay();

        if (!recognitionManager) {
            initSpeechRecognition();
        }

        const started = recognitionManager ? recognitionManager.start('') : false;
        if (started) {
            isRecording = true;
            startFluencyTimer();
            showFluencyToast("Microphone active — start speaking!", "🎙️");
        } else {
            showFluencyToast("Could not start microphone. Please check browser permissions.", "⚠️");
        }
    }

    function stopFluencyRecording() {
        if (!recognitionManager) return;
        isRecording = false;
        recognitionManager.stop();
        pauseFluencyTimer();
        setFluencyState('ANALYZING');
        
        // Brief debounce to allow final recognition tokens to settle
        setTimeout(() => {
            submitForFluencyEvaluation();
        }, 350);
    }

    function resetFluencyRecording() {
        if (recognitionManager && recognitionManager.isRecording) {
            recognitionManager.stop();
        }
        isRecording = false;
        pauseFluencyTimer();
        timeRemaining = timerDuration;
        updateFluencyTimerDisplay();

        const liveTranscriptEl = document.getElementById('fluency-live-transcript');
        const wordCountBadge = document.getElementById('fluency-word-count-badge');
        if (liveTranscriptEl) liveTranscriptEl.innerText = "Transcript will appear here as you speak...";
        if (wordCountBadge) wordCountBadge.innerText = "0 words";

        if (window.PraxisSpeechSpeaker) {
            window.PraxisSpeechSpeaker.stop();
        }
        resetFluencyListenButton();

        setFluencyState('READY');
    }

    function setFluencyState(state, payload = {}) {
        const recordBtn = document.getElementById('btn-fluency-record');
        const iconEl = document.getElementById('fl-record-icon');
        const labelEl = document.getElementById('fl-record-label');
        const statusLabel = document.getElementById('fl-mic-status-label');
        const soundwave = document.getElementById('fl-soundwave-container');

        switch (state) {
            case 'READY':
            case 'STOPPED':
                isRecording = false;
                if (recordBtn) {
                    recordBtn.classList.remove('mic-recording-pulse', 'text-red-600', 'bg-red-50');
                    recordBtn.classList.add('text-white');
                    recordBtn.setAttribute('aria-label', 'Start Speaking');
                }
                if (iconEl) iconEl.innerText = "🎙️";
                if (labelEl) labelEl.innerText = "Start Speaking";
                if (statusLabel) statusLabel.innerText = "Click to Start Speaking";
                if (soundwave) soundwave.classList.add('hidden');
                break;

            case 'LISTENING':
                isRecording = true;
                if (recordBtn) {
                    recordBtn.classList.add('mic-recording-pulse');
                    recordBtn.setAttribute('aria-label', 'Stop Speaking');
                }
                if (iconEl) iconEl.innerText = "⏹️";
                if (labelEl) labelEl.innerText = "Stop Speaking";
                if (statusLabel) statusLabel.innerText = "Listening... Speak naturally!";
                if (soundwave) soundwave.classList.remove('hidden');
                break;

            case 'ANALYZING':
            case 'PROCESSING':
                isRecording = false;
                if (soundwave) soundwave.classList.add('hidden');
                if (statusLabel) statusLabel.innerText = "Analyzing speech fluency & timing...";
                if (iconEl) iconEl.innerText = "⏳";
                if (labelEl) labelEl.innerText = "Analyzing...";
                break;

            case 'ERROR':
                isRecording = false;
                if (recordBtn) {
                    recordBtn.classList.remove('mic-recording-pulse', 'text-red-600', 'bg-red-50');
                }
                if (iconEl) iconEl.innerText = "🎙️";
                if (labelEl) labelEl.innerText = "Try Again";
                if (soundwave) soundwave.classList.add('hidden');
                if (statusLabel) statusLabel.innerText = payload.message || "Microphone ready (Click to record)";
                break;
        }
    }

    // =========================================================================
    // 4. TIMER CONTROLS
    // =========================================================================
    function setFluencyTimerDuration(seconds) {
        timerDuration = seconds;
        timeRemaining = seconds;
        updateFluencyTimerDisplay();
    }

    function updateFluencyTimerDisplay() {
        const mins = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        const display = document.getElementById('fl-timer-display');
        if (display) {
            display.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        const pct = (timeRemaining / timerDuration) * 100;
        const progress = document.getElementById('fl-timer-progress-bar');
        if (progress) {
            progress.style.width = `${pct}%`;
        }
    }

    function startFluencyTimer() {
        clearInterval(timerInterval);
        isTimerRunning = true;
        timerInterval = setInterval(() => {
            if (timeRemaining > 0) {
                timeRemaining--;
                updateFluencyTimerDisplay();
            } else {
                pauseFluencyTimer();
                if (recognitionManager && recognitionManager.isRecording) {
                    stopFluencyRecording();
                }
                showFluencyToast("⏱️ Time's up! Generating your fluency analysis.", "🔔");
            }
        }, 1000);
    }

    function pauseFluencyTimer() {
        clearInterval(timerInterval);
        isTimerRunning = false;
    }

    // =========================================================================
    // 5. EVALUATION DISPATCH (DETERMINISTIC ALGORITHM)
    // =========================================================================
    function submitForFluencyEvaluation() {
        if (!recognitionManager) return;

        const transcript = recognitionManager.getTranscript().trim();
        const timingData = recognitionManager.getTimingMetrics ? recognitionManager.getTimingMetrics() : {};
        const durationSpent = timingData.totalDurationSeconds || (timerDuration - timeRemaining) || 10;

        if (!transcript || transcript.split(/\s+/).length < 2) {
            showFluencyToast("We couldn't detect enough speech. Please try again and speak for a few seconds.", "⚠️");
            setFluencyState('READY');
            return;
        }

        const FluencyLab = window.FluencyLab;
        if (!FluencyLab || typeof FluencyLab.analyzeFluency !== 'function') {
            console.error("FluencyLab algorithm module not loaded.");
            return;
        }

        // Determine target text
        let targetText = currentExercise ? (currentExercise.text || currentExercise.promptQuestion || '') : '';
        if (currentExercise && currentExercise.type === 'sentence_expansion') {
            const tiers = currentExercise.tiers || [];
            const activeTierData = tiers.find(t => t.tier === currentExpansionTier);
            if (activeTierData) targetText = activeTierData.text;
        }

        // Run Deterministic Evaluation
        const evaluation = FluencyLab.analyzeFluency({
            transcript,
            targetText,
            duration: durationSpent,
            exerciseType: currentExercise?.type || 'smooth_reading',
            level: currentLevel,
            expectedChunks: currentExercise?.chunks || [],
            expectedConnectors: currentExercise?.suggestedConnectors || [],
            timingData,
            previousScore: previousEvaluation ? previousEvaluation.fluencyScore : null
        });

        activeEvaluation = evaluation;
        currentExerciseAttempts.push(evaluation);

        renderFluencyResults(evaluation, transcript);
        saveFluencySession(evaluation);
        updatePersonalBest(evaluation.fluencyScore);
    }

    // =========================================================================
    // 6. RENDER RESULTS DASHBOARD (NO FAKE DATA)
    // =========================================================================
    function renderFluencyResults(evalData, rawTranscript) {
        const dashboard = document.getElementById('fl-results-dashboard');
        if (!dashboard) return;

        dashboard.classList.remove('hidden');
        dashboard.scrollIntoView({ behavior: 'smooth' });

        // 1. Overall Fluency Score Pill
        const scoreEl = document.getElementById('fl-metric-fluency-score');
        const deltaContainer = document.getElementById('fl-score-delta-badge');
        
        if (scoreEl) scoreEl.innerText = `${evalData.fluencyScore} / 100`;

        if (deltaContainer) {
            if (evalData.scoreDelta !== null) {
                deltaContainer.classList.remove('hidden');
                const isPositive = evalData.scoreDelta >= 0;
                deltaContainer.className = `neu-badge px-3 py-1 text-xs font-extrabold ${isPositive ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-amber-700 bg-amber-50 border border-amber-200'}`;
                deltaContainer.innerText = isPositive ? `+${evalData.scoreDelta} Improvement` : `${evalData.scoreDelta} Points`;
            } else {
                deltaContainer.classList.add('hidden');
            }
        }

        // 2. Component Scores Strip (Pacing 25%, Pause Control 25%, Filler Control 20%, Continuity 20%, Completion 10%)
        const elPacingScore = document.getElementById('fl-score-pacing');
        const elPauseScore = document.getElementById('fl-score-pause');
        const elFillerScore = document.getElementById('fl-score-filler');
        const elContinuityScore = document.getElementById('fl-score-continuity');
        const elCompletionScore = document.getElementById('fl-score-completion');

        if (elPacingScore) elPacingScore.innerText = `${evalData.pacingScore}%`;
        if (elPauseScore) elPauseScore.innerText = `${evalData.pauseScore}%`;
        if (elFillerScore) elFillerScore.innerText = `${evalData.fillerScore}%`;
        if (elContinuityScore) elContinuityScore.innerText = `${evalData.continuityScore}%`;
        if (elCompletionScore) elCompletionScore.innerText = `${evalData.completionScore}%`;

        // 3. Deterministic Measurement Strip
        const elWpm = document.getElementById('fl-metric-wpm');
        const elPaceStatus = document.getElementById('fl-metric-pace-status');
        const elLongPauses = document.getElementById('fl-metric-long-pauses');
        const elFillers = document.getElementById('fl-metric-filler-count');
        const elCoverage = document.getElementById('fl-metric-coverage');

        if (elWpm) elWpm.innerText = evalData.wpm;
        if (elPaceStatus) elPaceStatus.innerText = evalData.paceStatus;
        if (elLongPauses) elLongPauses.innerText = `${evalData.longPauseCount} detected`;
        if (elFillers) elFillers.innerText = `${evalData.fillerCount} (${evalData.fillerPercentage}%)`;
        if (elCoverage) elCoverage.innerText = `${evalData.targetWordCoverage}%`;

        // 4. Speech Flow Visualizer Timeline
        const flowContainer = document.getElementById('fl-speech-flow-timeline');
        if (flowContainer) {
            flowContainer.innerHTML = '';
            (evalData.speechFlowVisual || []).forEach(item => {
                const el = document.createElement('div');
                if (item.type === 'speech') {
                    el.className = "px-3 py-1.5 bg-blue-50/90 text-blue-900 font-semibold rounded-xl border border-blue-200 text-xs shadow-sm";
                    el.innerText = item.text;
                } else {
                    const isLong = item.isLong;
                    el.className = `px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${isLong ? 'bg-rose-100 text-rose-700 border border-rose-300' : 'bg-slate-200/80 text-slate-600'}`;
                    el.innerText = item.label;
                }
                flowContainer.appendChild(el);
            });
        }

        // 5. Top 3 Improvements
        const top3List = document.getElementById('fl-top-improvements-list');
        if (top3List) {
            top3List.innerHTML = '';
            (evalData.improvements || []).forEach((imp, idx) => {
                const item = document.createElement('div');
                item.className = "neu-card-sm p-3 text-xs sm:text-sm text-slate-800 bg-amber-50/40 border border-amber-200 flex items-start gap-2.5";
                item.innerHTML = `
                    <span class="neu-circle w-6 h-6 shrink-0 flex items-center justify-center font-bold text-amber-700 bg-amber-100 text-xs">${idx + 1}</span>
                    <span class="leading-relaxed">${imp}</span>
                `;
                top3List.appendChild(item);
            });
        }

        // 6. Strengths
        const strengthsList = document.getElementById('fl-strengths-list');
        if (strengthsList) {
            strengthsList.innerHTML = '';
            (evalData.strengths || []).forEach(st => {
                const li = document.createElement('li');
                li.className = "neu-card-sm p-3 text-xs sm:text-sm text-slate-700 bg-emerald-50/40 border border-emerald-100 flex items-start gap-2";
                li.innerHTML = `<span class="text-emerald-500 font-bold">✓</span> <span>${st}</span>`;
                strengthsList.appendChild(li);
            });
        }

        // 7. Retry Challenge Box
        const retryGoalText = document.getElementById('fl-retry-goal-text');
        const retryComparisonBox = document.getElementById('fl-retry-comparison-box');
        
        if (retryGoalText) {
            retryGoalText.innerText = evalData.retryGoal || "Speak the same sentence again focusing on smooth phrasing.";
        }

        if (retryComparisonBox) {
            if (evalData.previousScore !== null) {
                retryComparisonBox.innerHTML = `
                    <div class="flex items-center gap-4 text-xs font-bold text-slate-700">
                        <span>Previous Attempt: <span class="text-slate-900 font-extrabold">${evalData.previousScore}</span></span>
                        <span>➔</span>
                        <span>Current Attempt: <span class="text-blue-600 font-extrabold">${evalData.fluencyScore}</span></span>
                    </div>
                    <div class="text-[11px] text-slate-500 mt-1">${evalData.deltaMessage}</div>
                `;
            } else {
                retryComparisonBox.innerHTML = `
                    <div class="text-xs text-slate-600">First attempt recorded (${evalData.fluencyScore} points). Take the Retry Challenge to beat this benchmark!</div>
                `;
            }
        }

        // 8. Annotated Transcript
        const transcriptBox = document.getElementById('fl-annotated-transcript');
        if (transcriptBox) {
            if (window.TranscriptProcessor) {
                transcriptBox.innerHTML = window.TranscriptProcessor.generateAnnotatedTranscript(rawTranscript);
            } else {
                transcriptBox.innerText = rawTranscript;
            }
        }
    }

    function hideResultsDashboard() {
        const dashboard = document.getElementById('fl-results-dashboard');
        if (dashboard) dashboard.classList.add('hidden');
    }

    // =========================================================================
    // 7. RETRY CHALLENGE & TTS AUDIO PLAYBACK
    // =========================================================================
    function retryChallenge() {
        if (!activeEvaluation) return;
        previousEvaluation = activeEvaluation;

        resetFluencyRecording();
        window.scrollTo({ top: 260, behavior: 'smooth' });
        showFluencyToast(`Retry Challenge Started! Focus on: ${activeEvaluation.retryGoal}`, "🎯");
    }

    function speakTargetSentence() {
        const Speaker = window.PraxisSpeechSpeaker;
        if (!Speaker || !Speaker.isSupported()) {
            showFluencyToast("Text-to-speech is not supported in this browser.", "⚠️");
            return;
        }

        let textToSpeak = "";
        if (currentExercise) {
            if (currentExercise.type === 'sentence_expansion') {
                const tiers = currentExercise.tiers || [];
                const activeTierData = tiers.find(t => t.tier === currentExpansionTier);
                textToSpeak = activeTierData?.text || currentExercise.text;
            } else {
                textToSpeak = currentExercise.text || currentExercise.promptQuestion || currentExercise.title;
            }
        }

        if (!textToSpeak) return;

        const iconEl = document.getElementById('fl-listen-icon');
        const labelEl = document.getElementById('fl-listen-label');

        Speaker.speak(textToSpeak, {
            rate: 0.92,
            onStart: () => {
                if (iconEl) iconEl.innerText = "⏹️";
                if (labelEl) labelEl.innerText = "Stop";
                showFluencyToast("🔊 Playing model sentence audio...", "🎙️");
            },
            onEnd: () => {
                if (iconEl) iconEl.innerText = "🔊";
                if (labelEl) labelEl.innerText = "Listen";
            },
            onError: (err) => {
                if (iconEl) iconEl.innerText = "🔊";
                if (labelEl) labelEl.innerText = "Listen";
                showFluencyToast(err || "Audio playback issue.", "⚠️");
            }
        });
    }

    function resetFluencyListenButton() {
        const iconEl = document.getElementById('fl-listen-icon');
        const labelEl = document.getElementById('fl-listen-label');
        if (iconEl) iconEl.innerText = "🔊";
        if (labelEl) labelEl.innerText = "Listen";
    }

    // =========================================================================
    // 8. PERSONAL BEST & LOCAL/FIREBASE PERSISTENCE
    // =========================================================================
    function updatePersonalBest(score) {
        if (!currentExercise || score <= 0) return;

        try {
            const raw = localStorage.getItem(STORAGE_KEY_PERSONAL_BESTS);
            let bests = raw ? JSON.parse(raw) : {};

            const key = `ex_${currentExercise.id}_t${currentExpansionTier}`;
            const existingBest = bests[key] || 0;

            if (score > existingBest) {
                bests[key] = score;
                localStorage.setItem(STORAGE_KEY_PERSONAL_BESTS, JSON.stringify(bests));
                showFluencyToast("🎉 New Personal Best achieved on this exercise!", "🏆");
            }

            updatePersonalBestDisplay();
        } catch (e) {}
    }

    function loadPersonalBests() {
        updatePersonalBestDisplay();
    }

    function updatePersonalBestDisplay() {
        if (!currentExercise) return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY_PERSONAL_BESTS);
            const bests = raw ? JSON.parse(raw) : {};
            const key = `ex_${currentExercise.id}_t${currentExpansionTier}`;
            const bestScore = bests[key] || 0;

            const bestEl = document.getElementById('fl-personal-best-badge');
            if (bestEl) {
                bestEl.innerText = bestScore > 0 ? `Personal Best: ${bestScore}` : 'Personal Best: --';
            }
        } catch (e) {}
    }

    function saveFluencySession(evalData) {
        if (!evalData || !evalData.isAnalyzed) return;

        const u = (window.praxisAuth && window.praxisAuth.getUser) ? window.praxisAuth.getUser() : null;

        const compactSession = {
            id: 'fl_' + Date.now(),
            exerciseId: currentExercise ? currentExercise.id : 'unknown',
            exerciseType: currentExercise ? currentExercise.type : 'smooth_reading',
            level: currentLevel,
            title: currentExercise ? currentExercise.title : 'Fluency Drill',
            score: evalData.fluencyScore,
            pacingScore: evalData.pacingScore,
            pauseScore: evalData.pauseScore,
            fillerScore: evalData.fillerScore,
            continuityScore: evalData.continuityScore,
            completionScore: evalData.completionScore,
            wpm: evalData.wpm,
            fillerCount: evalData.fillerCount,
            longPauseCount: evalData.longPauseCount,
            wordCount: evalData.wordCount,
            duration: evalData.totalResponseTime,
            completed: true,
            createdAt: new Date().toISOString()
        };

        // 1. Save to Local Storage
        try {
            const raw = localStorage.getItem(STORAGE_KEY_FLUENCY_SESSIONS);
            let sessions = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(sessions)) sessions = [];
            sessions.unshift(compactSession);
            sessions = sessions.slice(0, 25);
            localStorage.setItem(STORAGE_KEY_FLUENCY_SESSIONS, JSON.stringify(sessions));
            renderFluencyHistory(sessions);
        } catch (e) {}

        // 2. Save minimal record to Firestore (if configured via praxisAuth)
        if (window.praxisAuth && typeof window.praxisAuth.recordFluencySession === 'function') {
            window.praxisAuth.recordFluencySession(compactSession);
        }

        // 3. Optional backend log
        try {
            fetch('/api/fluency/evaluate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session: compactSession,
                    userEmail: u?.email || 'guest@praxis.app'
                })
            }).catch(() => {});
        } catch (e) {}
    }

    function loadFluencyHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_FLUENCY_SESSIONS);
            const sessions = raw ? JSON.parse(raw) : [];
            renderFluencyHistory(sessions);
        } catch (e) {}
    }

    function renderFluencyHistory(sessions) {
        const container = document.getElementById('fl-history-list');
        if (!container) return;

        if (!sessions || sessions.length === 0) {
            container.innerHTML = `<div class="text-xs text-slate-500 py-3 text-center">No past Fluency Lab sessions recorded yet. Start practicing above!</div>`;
            return;
        }

        container.innerHTML = '';
        sessions.slice(0, 10).forEach(s => {
            const dateStr = new Date(s.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const item = document.createElement('div');
            item.className = "neu-card-sm p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white/40 border border-slate-200/60";
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="neu-circle w-9 h-9 flex items-center justify-center font-bold text-xs text-blue-600 bg-blue-50">
                        ${s.score}
                    </div>
                    <div>
                        <div class="text-xs font-bold text-slate-800">L${s.level}: ${s.title}</div>
                        <div class="text-[10px] text-slate-500">${dateStr} • ${s.wpm} WPM • ${s.longPauseCount} long pause(s) • ${s.fillerCount} filler(s)</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="neu-badge px-2.5 py-0.5 text-[10px] font-bold text-blue-600 bg-blue-50/50">L${s.level}</span>
                    <span class="neu-badge px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50/50">${s.score >= 80 ? '🌟 Fluent' : '🎯 Practice'}</span>
                </div>
            `;
            container.appendChild(item);
        });
    }

    // =========================================================================
    // 9. TOAST NOTIFICATIONS
    // =========================================================================
    function showFluencyToast(msg, icon = 'ℹ️') {
        const toast = document.getElementById('coach-toast');
        if (!toast) return;
        const msgEl = document.getElementById('coach-toast-msg');
        const iconEl = document.getElementById('coach-toast-icon');
        if (msgEl) msgEl.innerText = msg;
        if (iconEl) iconEl.innerText = icon;
        toast.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 3200);
    }

    // Global Bindings for HTML onclick
    root.selectFluencyLevel = selectLevel;
    root.shuffleFluencyExercise = shuffleExercise;
    root.toggleFluencyRecording = toggleFluencyRecording;
    root.resetFluencyRecording = resetFluencyRecording;
    root.retryFluencyChallenge = retryChallenge;
    root.speakFluencyTargetSentence = speakTargetSentence;
    root.setFluencyExpansionTier = setExpansionTier;

})(typeof window !== 'undefined' ? window : this);
