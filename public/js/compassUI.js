/**
 * PRAXiS Career Compass UI Controller
 * Renders Discovery mode, Adaptive Quiz, 7-Insight Profile, Categorized Matches,
 * Side-by-Side Comparison, Reality Checks, 5-Phase Roadmaps, Routine Integration, and Learning Resources.
 */

(function(root) {
    'use strict';

    let activeResultTab = 'profile'; // 'profile' | 'matches' | 'history'
    let activeResourceFilter = 'all'; // 'all' | 'learn' | 'practice' | 'build' | 'read' | 'explore'

    // Initialize UI listeners on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        if (root.CompassEngine) {
            root.CompassEngine.init();
        }
        setupEventListeners();
    });

    function setupEventListeners() {
        // Domain search input in preference picker
        const searchInput = document.getElementById('compass-domain-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                filterDomainCards(e.target.value);
            });
        }

        // Keyboard navigation for the question assessment flow
        document.addEventListener('keydown', (e) => {
            const quizSection = document.getElementById('quiz-section');
            if (!quizSection || quizSection.classList.contains('hidden')) return;

            // Ignore when typing inside input elements
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (activeTag === 'input' || activeTag === 'textarea') return;

            if (e.key >= '1' && e.key <= '4') {
                const idx = parseInt(e.key, 10) - 1;
                selectOption(idx);
                e.preventDefault();
            } else if (['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'].includes(e.key)) {
                const idx = e.key.toLowerCase().charCodeAt(0) - 97;
                selectOption(idx);
                e.preventDefault();
            } else if (e.key === 'Enter') {
                confirmAndContinue();
                e.preventDefault();
            } else if (e.key === 'Backspace') {
                goBack();
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                const state = root.CompassEngine ? root.CompassEngine.getState() : {};
                const currentIdx = typeof state.selectedOptionIndex === 'number' ? state.selectedOptionIndex : -1;
                const nextIdx = Math.min(3, currentIdx + 1);
                selectOption(nextIdx);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                const state = root.CompassEngine ? root.CompassEngine.getState() : {};
                const currentIdx = typeof state.selectedOptionIndex === 'number' ? state.selectedOptionIndex : 1;
                const prevIdx = Math.max(0, currentIdx - 1);
                selectOption(prevIdx);
                e.preventDefault();
            }
        });
    }

    // -------------------------------------------------------------
    // 1. ENTRY VIEW CONTROLLER
    // -------------------------------------------------------------
    function selectDiscoveryMode(mode) {
        const prefContainer = document.getElementById('compass-preference-picker');
        if (mode === 'preference') {
            if (prefContainer) {
                prefContainer.classList.remove('hidden');
                prefContainer.scrollIntoView({ behavior: 'smooth' });
            }
            renderDomainGrid();
        } else {
            // "I'm not sure — help me discover" (Broad exploration)
            if (prefContainer) prefContainer.classList.add('hidden');
            startAdaptiveAssessment('discovery', null);
        }
    }

    function renderDomainGrid() {
        const grid = document.getElementById('compass-domains-grid');
        if (!grid) return;

        const domains = root.COMPASS_DOMAINS || [];
        grid.innerHTML = "";

        domains.forEach((dom) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'neu-btn p-3.5 sm:p-4 text-left group flex items-start gap-3 transition-all hover:scale-[1.02] cursor-pointer';
            btn.innerHTML = `
                <div class="w-10 h-10 neu-circle flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                    ${dom.icon}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-xs sm:text-sm font-bold text-slate-800 font-outfit group-hover:text-blue-600 transition-colors leading-snug">${escapeHtml(dom.name)}</h4>
                    <p class="text-[11px] text-slate-500 font-medium line-clamp-2 mt-0.5 leading-relaxed">${escapeHtml(dom.desc)}</p>
                </div>
            `;
            btn.onclick = () => {
                btn.classList.add('pressed');
                setTimeout(() => {
                    startAdaptiveAssessment('preference', dom.id);
                }, 150);
            };
            grid.appendChild(btn);
        });
    }

    function filterDomainCards(query) {
        const grid = document.getElementById('compass-domains-grid');
        if (!grid) return;
        const q = (query || "").toLowerCase().trim();
        const buttons = grid.querySelectorAll('button');
        buttons.forEach(btn => {
            const text = btn.textContent.toLowerCase();
            btn.style.display = text.includes(q) ? 'flex' : 'none';
        });
    }

    function startAdaptiveAssessment(mode, chosenDomain = null) {
        const interestSection = document.getElementById('interest-section');
        const quizSection = document.getElementById('quiz-section');
        const resultSection = document.getElementById('result-section');
        const appWrapper = document.getElementById('app-wrapper');

        if (interestSection) interestSection.classList.add('hidden');
        if (resultSection) resultSection.classList.add('hidden');
        if (quizSection) {
            quizSection.classList.remove('hidden');
            quizSection.classList.add('slide-up');
        }
        if (appWrapper) {
            appWrapper.classList.remove('pb-20');
            appWrapper.classList.add('min-h-screen', 'items-center', 'py-10');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (root.CompassEngine) {
            root.CompassEngine.startAssessment(mode, chosenDomain);
        }
    }

    // -------------------------------------------------------------
    // 2. ADAPTIVE QUESTION RENDERER & INTERACTION HANDLERS
    // -------------------------------------------------------------
    function renderCurrentQuestion() {
        if (!root.CompassEngine) return;
        const state = root.CompassEngine.getState();
        const currentQ = state.activeQuestions[state.currentQuestionIndex];
        if (!currentQ) return;

        const totalQ = state.activeQuestions.length;
        const currentIdx = state.currentQuestionIndex;
        const progress = ((currentIdx) / totalQ) * 100;

        // Progress indicators
        const countBadge = document.getElementById('question-count');
        const percentLabel = document.getElementById('progress-percent');
        const bar = document.getElementById('progress-bar');
        const timeBadge = document.getElementById('question-time-estimate');
        const categoryBadge = document.getElementById('question-category-badge');

        if (countBadge) countBadge.innerText = `QUESTION ${currentIdx + 1} OF ${totalQ}`;
        if (percentLabel) percentLabel.innerText = `${Math.round(progress)}% Complete`;
        if (bar) bar.style.width = `${progress}%`;
        if (timeBadge) timeBadge.innerText = `⏱️ ${root.CompassEngine.getEstimatedMinutesRemaining()}`;
        if (categoryBadge) categoryBadge.innerText = currentQ.category || "Preference";

        // Question scenario & prompt text
        const qScenario = document.getElementById('question-scenario');
        if (qScenario) {
            if (currentQ.scenario) {
                qScenario.innerText = currentQ.scenario;
                qScenario.classList.remove('hidden');
            } else {
                qScenario.classList.add('hidden');
            }
        }
        const qText = document.getElementById('question-text');
        if (qText) qText.innerText = currentQ.text || currentQ.question;

        // Options container
        const container = document.getElementById('options-container');
        if (!container) return;
        container.innerHTML = "";

        const selectedIdx = state.selectedOptionIndex;

        currentQ.options.forEach((opt, idx) => {
            const isSelected = selectedIdx === idx;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            btn.setAttribute('aria-label', `Option ${String.fromCharCode(65 + idx)}: ${opt.text}`);
            btn.tabIndex = 0;

            const baseClass = isSelected
                ? 'neu-btn pressed w-full text-left p-3.5 sm:p-4.5 font-medium border-2 border-blue-600 bg-blue-50/90 text-blue-900 ring-2 ring-blue-400/30 transition-all duration-150 flex items-center justify-between group cursor-pointer shadow-inner rounded-xl'
                : 'neu-btn w-full text-left p-3.5 sm:p-4.5 font-medium text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-all duration-150 flex items-center justify-between group cursor-pointer border border-white/80 rounded-xl';

            btn.className = baseClass;
            btn.style.animationDelay = `${idx * 40}ms`;

            const letterPillClass = isSelected
                ? 'opt-letter-pill w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs'
                : 'opt-letter-pill w-7 h-7 neu-circle text-[11px] font-black text-slate-500 group-hover:text-blue-600 flex items-center justify-center shrink-0';

            const checkIconHtml = isSelected
                ? `<div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>`
                : `<div class="w-6 h-6 neu-circle text-slate-300 group-hover:text-blue-400 flex items-center justify-center shrink-0"><span class="w-2 h-2 rounded-full bg-transparent group-hover:bg-blue-300 transition-colors"></span></div>`;

            btn.innerHTML = `
                <div class="flex items-center gap-3 min-w-0 pr-2">
                    <span class="${letterPillClass}">${String.fromCharCode(65 + idx)}</span>
                    <span class="text-xs sm:text-sm md:text-base font-semibold leading-snug">${escapeHtml(opt.text)}</span>
                </div>
                <div class="opt-check-icon shrink-0">
                    ${checkIconHtml}
                </div>
            `;

            btn.onclick = () => {
                if (state.selectedOptionIndex === idx) {
                    confirmAndContinue();
                } else {
                    selectOption(idx);
                }
            };

            container.appendChild(btn);
        });

        // Update nav buttons
        const prevBtn = document.getElementById('compass-prev-btn');
        if (prevBtn) {
            prevBtn.disabled = currentIdx === 0;
        }

        const nextBtn = document.getElementById('compass-next-btn');
        if (nextBtn) {
            nextBtn.disabled = (selectedIdx === null || selectedIdx === undefined);
        }
    }

    function selectOption(idx) {
        if (!root.CompassEngine) return;
        root.CompassEngine.selectOption(idx);
        updateQuestionSelectionUI(idx);
    }

    function confirmAndContinue() {
        if (!root.CompassEngine) return;
        const state = root.CompassEngine.getState();
        if (state.selectedOptionIndex === null || state.selectedOptionIndex === undefined) return;
        const nextBtn = document.getElementById('compass-next-btn');
        if (nextBtn) nextBtn.classList.add('pressed');
        setTimeout(() => {
            if (nextBtn) nextBtn.classList.remove('pressed');
            root.CompassEngine.confirmCurrentAnswer();
        }, 110);
    }

    function goBack() {
        if (!root.CompassEngine) return;
        root.CompassEngine.goBack();
    }

    function updateQuestionSelectionUI(idx) {
        const container = document.getElementById('options-container');
        if (!container) return;
        const cards = container.querySelectorAll('button[role="radio"]');
        cards.forEach((card, i) => {
            const isSelected = i === idx;
            card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            const letterPill = card.querySelector('.opt-letter-pill');
            const checkIcon = card.querySelector('.opt-check-icon');

            if (isSelected) {
                card.className = 'neu-btn pressed w-full text-left p-3.5 sm:p-4.5 font-medium border-2 border-blue-600 bg-blue-50/90 text-blue-900 ring-2 ring-blue-400/30 transition-all duration-150 flex items-center justify-between group cursor-pointer shadow-inner rounded-xl';
                if (letterPill) {
                    letterPill.className = 'opt-letter-pill w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs';
                }
                if (checkIcon) {
                    checkIcon.innerHTML = `<div class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>`;
                }
            } else {
                card.className = 'neu-btn w-full text-left p-3.5 sm:p-4.5 font-medium text-slate-700 hover:text-blue-600 hover:border-blue-300 transition-all duration-150 flex items-center justify-between group cursor-pointer border border-white/80 rounded-xl';
                if (letterPill) {
                    letterPill.className = 'opt-letter-pill w-7 h-7 neu-circle text-[11px] font-black text-slate-500 group-hover:text-blue-600 flex items-center justify-center shrink-0';
                }
                if (checkIcon) {
                    checkIcon.innerHTML = `<div class="w-6 h-6 neu-circle text-slate-300 group-hover:text-blue-400 flex items-center justify-center shrink-0"><span class="w-2 h-2 rounded-full bg-transparent group-hover:bg-blue-300 transition-colors"></span></div>`;
                }
            }
        });

        const nextBtn = document.getElementById('compass-next-btn');
        if (nextBtn) {
            nextBtn.disabled = (idx === null || idx === undefined);
        }
    }

    root.renderCurrentQuestion = renderCurrentQuestion;
    root.updateQuestionSelectionUI = updateQuestionSelectionUI;
    root.selectOption = selectOption;
    root.confirmAndContinue = confirmAndContinue;
    root.goBack = goBack;

    // -------------------------------------------------------------
    // 3. RESULTS VIEW CONTROLLER (Profile + Matches + History)
    // -------------------------------------------------------------
    function renderCompassResultsView(profile, matches) {
        const quizSection = document.getElementById('quiz-section');
        const resultSection = document.getElementById('result-section');
        const matchesOverview = document.getElementById('matches-overview');
        const careerDetails = document.getElementById('career-details');

        if (quizSection) quizSection.classList.add('hidden');
        if (careerDetails) careerDetails.classList.add('hidden');
        if (resultSection) {
            resultSection.classList.remove('hidden');
            resultSection.classList.add('slide-up');
        }
        if (matchesOverview) matchesOverview.classList.remove('hidden');

        // Render Profile & Matches
        renderCareerProfileView(profile);
        renderMatchesView(matches);
        renderAssessmentHistoryView();

        // Switch to Profile tab first by default
        switchResultTab('profile');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    root.renderCompassResultsView = renderCompassResultsView;

    function switchResultTab(tabName) {
        activeResultTab = tabName;
        const tabProfile = document.getElementById('tab-btn-compass-profile');
        const tabMatches = document.getElementById('tab-btn-compass-matches');
        const tabHistory = document.getElementById('tab-btn-compass-history');

        const viewProfile = document.getElementById('compass-view-profile');
        const viewMatches = document.getElementById('compass-view-matches');
        const viewHistory = document.getElementById('compass-view-history');

        [tabProfile, tabMatches, tabHistory].forEach(t => {
            if (t) {
                t.classList.remove('pressed', 'text-blue-600', 'border', 'border-blue-300');
                t.classList.add('text-slate-700');
            }
        });

        [viewProfile, viewMatches, viewHistory].forEach(v => {
            if (v) v.classList.add('hidden');
        });

        if (tabName === 'profile') {
            if (tabProfile) tabProfile.classList.add('pressed', 'text-blue-600', 'border', 'border-blue-300');
            if (viewProfile) viewProfile.classList.remove('hidden');
        } else if (tabName === 'matches') {
            if (tabMatches) tabMatches.classList.add('pressed', 'text-blue-600', 'border', 'border-blue-300');
            if (viewMatches) viewMatches.classList.remove('hidden');
        } else if (tabName === 'history') {
            if (tabHistory) tabHistory.classList.add('pressed', 'text-blue-600', 'border', 'border-blue-300');
            if (viewHistory) viewHistory.classList.remove('hidden');
        }
    }
    root.switchResultTab = switchResultTab;

    // -------------------------------------------------------------
    // 4. RENDER 7-INSIGHT CAREER PROFILE
    // -------------------------------------------------------------
    function renderCareerProfileView(profile) {
        const container = document.getElementById('compass-profile-cards');
        if (!container || !profile) return;
        container.innerHTML = "";

        // REFERENCE B — Identified Core Strengths Card
        const strengthsCard = document.createElement('div');
        strengthsCard.className = 'col-span-1 sm:col-span-2 stitch-card p-5 sm:p-7 text-left border border-slate-200 shadow-sm mb-2';
        
        // Extract top identified strength names from dimensions
        const topTraits = [];
        if (profile.thinking && profile.thinking.topDimensions) {
            profile.thinking.topDimensions.forEach(d => topTraits.push(d.name));
        }
        if (topTraits.length < 3) {
            topTraits.push('Systems Thinking', 'Strategic Empathy', 'Rapid Prototyping');
        }
        const displayTraits = [...new Set(topTraits)].slice(0, 4);

        strengthsCard.innerHTML = `
            <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2.5">
                    <span class="text-2xl">🌟</span>
                    <h3 class="text-lg sm:text-xl font-black text-slate-900 font-outfit">Identified Core Strengths</h3>
                </div>
                <span class="stitch-badge-green font-bold">Verified Profile</span>
            </div>
            <p class="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed mb-4">
                Strengths synthesized through scenario evaluations across analytical problem-solving, team communication, and motivation drivers.
            </p>

            <!-- Colorful Pill Tags (Reference B) -->
            <div class="flex flex-wrap gap-2 mb-5">
                ${displayTraits.map((t, idx) => {
                    const colors = [
                        'bg-violet-100 text-violet-800 border-violet-200',
                        'bg-cyan-100 text-cyan-800 border-cyan-200',
                        'bg-emerald-100 text-emerald-800 border-emerald-200',
                        'bg-amber-100 text-amber-800 border-amber-200'
                    ];
                    return `<span class="px-3 py-1 rounded-full text-xs font-bold border ${colors[idx % colors.length]}">${escapeHtml(t)}</span>`;
                }).join('')}
            </div>

            <!-- Pattern Highlight information box (Reference B) -->
            <div class="p-3.5 bg-violet-50/90 rounded-xl border border-violet-200 flex items-start gap-3">
                <span class="text-base text-violet-600 mt-0.5">💡</span>
                <div>
                    <h5 class="text-xs font-bold text-violet-950">Pattern Highlight</h5>
                    <p class="text-[11px] text-violet-800 leading-relaxed mt-0.5">
                        ${escapeHtml(profile.thinking ? profile.thinking.description : "Your responses demonstrate high structural synthesis and technical empathy.")}
                    </p>
                </div>
            </div>
        `;
        container.appendChild(strengthsCard);

        const insights = [
            { key: 'thinking', icon: '🧠', data: profile.thinking, badge: 'Thinking Style' },
            { key: 'workStyle', icon: '⚡', data: profile.workStyle, badge: 'Work Style' },
            { key: 'communication', icon: '🎙️', data: profile.communication, badge: 'Communication' },
            { key: 'motivation', icon: '🎯', data: profile.motivation, badge: 'Core Driver' },
            { key: 'values', icon: '🌱', data: profile.values, badge: 'Personal Values' },
            { key: 'environment', icon: '🌐', data: profile.environment, badge: 'Ideal Environment' },
            { key: 'interests', icon: '🧭', data: profile.interests, badge: 'Interests & Passions' }
        ];

        insights.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'neu-card p-4 sm:p-6 fade-in border border-white/70 relative overflow-hidden';
            card.style.animationDelay = `${idx * 80}ms`;

            let topDimensionsHTML = "";
            if (item.data.topDimensions && item.data.topDimensions.length > 0) {
                topDimensionsHTML = `
                    <div class="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
                        ${item.data.topDimensions.map(d => `
                            <div>
                                <div class="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-0.5">
                                    <span>${escapeHtml(d.name)}</span>
                                    <span class="text-blue-600 font-digital">${d.score} pts</span>
                                </div>
                                <div class="neu-trench h-1.5 overflow-hidden p-0.5">
                                    <div class="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full" style="width: ${Math.min(100, (d.score / 8) * 100)}%"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="flex items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${item.icon}</span>
                        <h4 class="text-sm sm:text-base font-extrabold text-slate-800 font-outfit">${escapeHtml(item.data.label)}</h4>
                    </div>
                    <span class="neu-badge text-[9px] font-extrabold text-blue-600 uppercase px-2 py-0.5">${escapeHtml(item.badge)}</span>
                </div>
                <div class="text-xs sm:text-sm font-bold text-indigo-600 font-outfit mb-1.5">${escapeHtml(item.data.archetype || "")}</div>
                <p class="text-xs text-slate-600 font-medium leading-relaxed">${escapeHtml(item.data.description || "")}</p>
                ${topDimensionsHTML}
            `;
            container.appendChild(card);
        });

        // Evolutionary note
        const noteEl = document.getElementById('compass-profile-disclaimer');
        if (noteEl) {
            noteEl.innerText = profile.disclaimer || "Based on your responses. Current preferences indicate these tendencies — preferences can evolve as you gain practical experience.";
        }
    }

    // -------------------------------------------------------------
    // 5. RENDER CATEGORIZED CAREER MATCHES
    // Strong Matches + Worth Exploring + You Might Also Enjoy
    // -------------------------------------------------------------
    function renderMatchesView(matchesData) {
        const strongGrid = document.getElementById('compass-grid-strong');
        const exploringGrid = document.getElementById('compass-grid-exploring');
        const adjacentGrid = document.getElementById('compass-grid-adjacent');

        if (strongGrid) strongGrid.innerHTML = "";
        if (exploringGrid) exploringGrid.innerHTML = "";
        if (adjacentGrid) adjacentGrid.innerHTML = "";

        const { strongMatches, worthExploring, mightEnjoy } = matchesData;

        if (strongGrid) {
            (strongMatches || []).forEach((c, idx) => {
                strongGrid.appendChild(createCareerCard(c, idx, 'strong'));
            });
        }
        if (exploringGrid) {
            (worthExploring || []).forEach((c, idx) => {
                exploringGrid.appendChild(createCareerCard(c, idx, 'exploring'));
            });
        }
        if (adjacentGrid) {
            (mightEnjoy || []).forEach((c, idx) => {
                adjacentGrid.appendChild(createCareerCard(c, idx, 'adjacent'));
            });
        }
    }

    function createCareerCard(career, index, tierType) {
        const card = document.createElement('div');
        const isPrimary = (index === 0 && tierType === 'strong');
        
        // Reference B: Violet borders/highlights for primary recommendation
        const cardClasses = isPrimary
            ? 'stitch-card p-5 sm:p-7 flex flex-col justify-between group transition-all duration-300 fade-in border-2 border-violet-500 shadow-md ring-4 ring-violet-50 relative'
            : 'stitch-card p-4 sm:p-6 flex flex-col justify-between group hover:border-violet-300 transition-all duration-300 fade-in relative';

        card.className = cardClasses;
        card.style.animationDelay = `${index * 90}ms`;

        // Match Level & Fit Score Badge (Reference B)
        const matchPills = {
            strong: `<span class="stitch-badge-green font-black">94% Fit &bull; Strong Match</span>`,
            exploring: `<span class="stitch-badge-cyan font-black">82% Fit &bull; Worth Exploring</span>`,
            adjacent: `<span class="stitch-badge-violet font-black">76% Fit &bull; You Might Also Enjoy</span>`
        };

        const traitsTags = (career.supportingTraits || []).map(t =>
            `<span class="stitch-badge-violet">${escapeHtml(t)}</span>`
        ).join(' ');

        // Check if reality check completed
        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        const savedReality = (state.realityChecks && state.realityChecks[career.id]) || null;
        let realityBadgeHTML = "";
        if (savedReality) {
            const reactionIcons = {
                loved: "❤️ Loved It",
                enjoyed: "👍 Enjoyed It",
                neutral: "😐 Neutral",
                disliked: "👎 Disliked",
                strongly_disliked: "🚫 Disliked"
            };
            realityBadgeHTML = `<div class="stitch-badge-amber mt-2">Reality Check: ${reactionIcons[savedReality.reaction] || 'Done'}</div>`;
        }

        const primaryBadge = isPrimary 
            ? `<div class="mb-2"><span class="stitch-badge-violet bg-violet-600 text-white border-0 font-extrabold uppercase tracking-wider text-[10px]">★ PRIMARY RECOMMENDATION</span></div>` 
            : '';

        card.innerHTML = `
            <div>
                ${primaryBadge}
                <div class="flex items-start justify-between gap-2 mb-3">
                    <div class="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200/90 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform">
                        ${career.icon || "🧭"}
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${matchPills[tierType] || matchPills.exploring}
                        <span class="text-[10px] font-bold text-slate-400 font-digital">${escapeHtml(career.confidenceLevel || "High Confidence")}</span>
                    </div>
                </div>

                <span class="text-[10px] font-extrabold text-violet-600 uppercase tracking-wider">${escapeHtml(career.category)}</span>
                <h3 class="text-base sm:text-lg font-black text-slate-900 font-outfit mt-0.5 leading-snug group-hover:text-violet-600 transition-colors">${escapeHtml(career.title)}</h3>

                <p class="text-xs text-slate-600 font-medium leading-relaxed mt-2 mb-3 line-clamp-3">${escapeHtml(career.desc)}</p>

                <div class="p-3 rounded-xl text-[11px] font-medium text-slate-700 mb-3 leading-relaxed bg-slate-50 border border-slate-200/80">
                    <span class="font-bold text-violet-700 block mb-0.5">Why it matches:</span>
                    ${escapeHtml(career.whyItMatches)}
                </div>

                <div class="flex flex-wrap gap-1.5 mb-3">
                    ${traitsTags}
                </div>

                <div class="text-[11px] text-amber-900 font-medium flex items-start gap-1.5 mb-2 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60">
                    <span class="shrink-0 text-xs">⚡</span>
                    <span class="line-clamp-2">${escapeHtml(career.frictionNote)}</span>
                </div>

                <div id="reality-badge-${career.id}">
                    ${realityBadgeHTML}
                </div>
            </div>

            <!-- Action footer with Explore Details (Reference B) -->
            <div class="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <button type="button" onclick="inspectCareerRoadmap('${career.id}')"
                    class="${isPrimary ? 'stitch-btn-primary' : 'stitch-btn-secondary'} text-xs px-3.5 py-2 flex items-center gap-1.5 cursor-pointer">
                    <span>Explore Details</span> &rarr;
                </button>

                <div class="flex items-center gap-1.5">
                    <button type="button" onclick="openRealityCheckModal('${career.id}')" title="Take 60-Second Reality Check"
                        class="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-xs hover:text-amber-600 transition-colors cursor-pointer">
                        ⚡
                    </button>
                    <button type="button" onclick="toggleCareerComparisonUI('${career.id}')" title="Compare Side-by-Side"
                        class="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-xs hover:text-violet-600 transition-colors cursor-pointer">
                        ⚖️
                    </button>
                </div>
            </div>
        `;

        return card;
    }

    // -------------------------------------------------------------
    // 6. DETAILED CAREER & 5-STAGE ROADMAP CONTROLLER
    // -------------------------------------------------------------
    function inspectCareerRoadmap(careerId) {
        const career = (root.COMPASS_CAREERS || []).find(c => c.id === careerId);
        if (!career) return;

        if (root.CompassEngine) {
            root.CompassEngine.getState().selectedCareer = career;
        }

        const matchesOverview = document.getElementById('matches-overview');
        const careerDetails = document.getElementById('career-details');

        if (matchesOverview) matchesOverview.classList.add('hidden');
        if (careerDetails) {
            careerDetails.classList.remove('hidden');
            careerDetails.classList.add('fade-in');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Header info
        document.getElementById('detail-icon').innerText = career.icon || "🧭";
        document.getElementById('detail-title').innerText = career.title;
        document.getElementById('detail-desc').innerText = career.desc;

        const categoryPill = document.getElementById('detail-category-pill');
        if (categoryPill) categoryPill.innerText = career.category;

        const workStyleEl = document.getElementById('detail-workstyle');
        if (workStyleEl) workStyleEl.innerText = career.workStyle || "Deep focus and cross-functional agile sprints.";

        const environmentEl = document.getElementById('detail-environment');
        if (environmentEl) environmentEl.innerText = career.environment || "Hybrid or remote-first modern workspaces.";

        const frictionEl = document.getElementById('detail-friction');
        if (frictionEl) frictionEl.innerText = career.potentialFriction || "High complexity and context switching.";

        // Render 5-Stage Roadmap
        renderRoadmapPhases(career);

        // Render Learning Resources (Learn, Practice, Build, Read, Explore)
        renderLearningResources(career);

        // Render Communication Drill preview
        renderCommunicationDrillPreview(career);

        // Render Career Progression ladder
        renderCareerProgression(career);
    }
    root.inspectCareerRoadmap = inspectCareerRoadmap;

    function backToMatches() {
        const matchesOverview = document.getElementById('matches-overview');
        const careerDetails = document.getElementById('career-details');
        if (careerDetails) careerDetails.classList.add('hidden');
        if (matchesOverview) {
            matchesOverview.classList.remove('hidden');
            matchesOverview.classList.add('fade-in');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    root.backToMatches = backToMatches;

    function renderRoadmapPhases(career) {
        const container = document.getElementById('detail-roadmap');
        if (!container || !career.phases) return;
        container.innerHTML = "";

        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        const savedProgress = (state.roadmapProgress && state.roadmapProgress[career.id] && state.roadmapProgress[career.id].completedTasks) || [];

        let totalMilestones = 0;
        let completedCount = 0;

        career.phases.forEach((phase, pIdx) => {
            const phaseDiv = document.createElement('div');
            phaseDiv.className = 'relative group fade-in';
            phaseDiv.style.animationDelay = `${pIdx * 80}ms`;

            const taskId = `task_${career.id}_p${pIdx}`;
            totalMilestones++;
            const isChecked = savedProgress.includes(taskId);
            if (isChecked) completedCount++;

            phaseDiv.innerHTML = `
                <div class="absolute -left-[25px] sm:-left-[33px] top-4 w-5 h-5 neu-circle flex items-center justify-center">
                    <input type="checkbox" id="${taskId}" ${isChecked ? 'checked' : ''}
                        onchange="toggleRoadmapTask('${career.id}', '${taskId}', this.checked)"
                        class="w-3 h-3 text-blue-600 rounded cursor-pointer"
                        title="Mark Milestone as Completed">
                </div>
                <div class="neu-card-sm p-4 sm:p-6 transition-all ${isChecked ? 'opacity-85 bg-slate-100/60' : ''}">
                    <div class="flex items-center justify-between gap-2 mb-1.5">
                        <h4 class="font-black text-blue-600 text-sm sm:text-base font-outfit tracking-wide">${escapeHtml(phase.title)}</h4>
                        <span class="neu-badge text-[9px] font-extrabold text-slate-500 uppercase px-2 py-0.5">Stage ${pIdx + 1}</span>
                    </div>
                    <p class="text-xs sm:text-sm font-medium text-slate-600 leading-relaxed">${escapeHtml(phase.steps)}</p>
                </div>
            `;
            container.appendChild(phaseDiv);
        });

        // Update progress tracker banner
        const progressBanner = document.getElementById('roadmap-progress-bar');
        const progressText = document.getElementById('roadmap-progress-text');
        const pct = totalMilestones > 0 ? Math.round((completedCount / totalMilestones) * 100) : 0;

        if (progressBanner) progressBanner.style.width = `${pct}%`;
        if (progressText) progressText.innerText = `${completedCount} of ${totalMilestones} Milestones Completed (${pct}%)`;
    }

    function toggleRoadmapTask(careerId, taskId, isChecked) {
        if (root.CompassEngine) {
            root.CompassEngine.saveRoadmapTaskProgress(careerId, taskId, isChecked);
            const career = (root.COMPASS_CAREERS || []).find(c => c.id === careerId);
            if (career) renderRoadmapPhases(career);
        }
    }
    root.toggleRoadmapTask = toggleRoadmapTask;

    // -------------------------------------------------------------
    // 7. LEARNING RESOURCES CONTROLLER (Learn, Practice, Build, Read, Explore)
    // -------------------------------------------------------------
    function renderLearningResources(career) {
        const container = document.getElementById('detail-resources-grid');
        if (!container) return;

        const res = career.learningResources || {};
        container.innerHTML = "";

        // Collect all or filter by activeResourceFilter
        const items = [];

        if (activeResourceFilter === 'all' || activeResourceFilter === 'learn') {
            (res.learn || []).forEach(l => items.push({ type: 'Learn', icon: '🎓', color: 'blue', title: l.title, subtitle: l.provider, desc: l.desc }));
        }
        if (activeResourceFilter === 'all' || activeResourceFilter === 'practice') {
            (res.practice || []).forEach(p => items.push({ type: 'Practice', icon: '⚡', color: 'amber', title: p.title, subtitle: p.type, desc: p.desc }));
        }
        if (activeResourceFilter === 'all' || activeResourceFilter === 'build') {
            (res.build || []).forEach(b => items.push({ type: 'Build', icon: '🛠️', color: 'emerald', title: b.title, subtitle: 'Capstone Blueprint', desc: b.desc }));
        }
        if (activeResourceFilter === 'all' || activeResourceFilter === 'read') {
            (res.read || []).forEach(r => items.push({ type: 'Read', icon: '📚', color: 'indigo', title: r.title, subtitle: `by ${r.author}`, desc: r.desc, isBook: true, bookData: r }));
        }
        if (activeResourceFilter === 'all' || activeResourceFilter === 'explore') {
            (res.explore || []).forEach(e => items.push({ type: 'Explore', icon: '🌐', color: 'cyan', title: e.title, subtitle: 'Community & Trends', desc: e.desc }));
        }

        if (items.length === 0) {
            container.innerHTML = `<div class="p-6 text-center text-xs text-slate-500 col-span-2">No learning resources available for this category.</div>`;
            return;
        }

        items.forEach((item, i) => {
            const card = document.createElement('div');
            card.className = 'neu-card p-4 sm:p-5 flex flex-col justify-between fade-in border border-white/70 shadow-sm';
            card.style.animationDelay = `${i * 60}ms`;

            if (item.isBook && item.bookData) {
                // Preserve existing 3D Book reader integration!
                const b = item.bookData;
                const coverUrl = b.isbn
                    ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg`
                    : `https://covers.openlibrary.org/b/isbn/9780000000000-M.jpg`;

                card.innerHTML = `
                    <div>
                        <div class="flex items-start gap-3 mb-2.5">
                            <div class="w-14 sm:w-16 aspect-[2/3] shrink-0 book-3d-wrapper">
                                <div class="book-3d-card shadow-md">
                                    <div class="book-3d-spine"></div>
                                    <div class="book-3d-shine"></div>
                                    <img src="${coverUrl}" alt="${escapeHtml(b.title)}" class="book-cover-img" loading="lazy" />
                                </div>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center justify-between gap-1 mb-0.5">
                                    <span class="neu-badge text-[9px] font-black text-indigo-600 uppercase px-2 py-0.5">Essential Reading</span>
                                    <span class="text-[10px] font-bold text-amber-600">★ ${b.rating || '4.8'}</span>
                                </div>
                                <h4 class="text-xs sm:text-sm font-extrabold text-slate-800 font-outfit line-clamp-2 leading-snug">${escapeHtml(b.title)}</h4>
                                <p class="text-[11px] font-semibold text-slate-500 mt-0.5">${escapeHtml(b.author)}</p>
                            </div>
                        </div>
                        <p class="text-[11px] text-slate-600 leading-relaxed line-clamp-2 font-medium">${escapeHtml(b.desc)}</p>
                    </div>
                    <div class="pt-2.5 mt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                        <button type="button" onclick="openEBookReader('${escapeHtml(b.title)}', '${escapeHtml(b.author)}')"
                            class="neu-btn px-2.5 py-1 text-[11px] font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg cursor-pointer">
                            📖 Read Preview
                        </button>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <div class="flex items-center gap-1.5">
                                <span class="text-base">${item.icon}</span>
                                <span class="text-xs font-bold text-blue-600 font-outfit">${escapeHtml(item.subtitle)}</span>
                            </div>
                            <span class="neu-badge text-[9px] font-black uppercase px-2 py-0.5">${escapeHtml(item.type)}</span>
                        </div>
                        <h4 class="text-xs sm:text-sm font-extrabold text-slate-800 font-outfit leading-snug mb-1">${escapeHtml(item.title)}</h4>
                        <p class="text-[11px] text-slate-600 leading-relaxed font-medium">${escapeHtml(item.desc)}</p>
                    </div>
                    <div class="pt-2 mt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-bold text-blue-600">
                        <span>Roadmap Aligned</span>
                        <span>&rarr;</span>
                    </div>
                `;
            }

            container.appendChild(card);
        });
    }

    function setResourceFilter(filterType) {
        activeResourceFilter = filterType;
        document.querySelectorAll('.res-filter-btn').forEach(btn => {
            btn.classList.remove('pressed', 'text-blue-600', 'border', 'border-blue-300');
            btn.classList.add('text-slate-700');
        });
        const activeBtn = document.getElementById(`res-filter-${filterType}`);
        if (activeBtn) {
            activeBtn.classList.add('pressed', 'text-blue-600', 'border', 'border-blue-300');
            activeBtn.classList.remove('text-slate-700');
        }

        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        if (state.selectedCareer) {
            renderLearningResources(state.selectedCareer);
        }
    }
    root.setResourceFilter = setResourceFilter;

    // -------------------------------------------------------------
    // 8. CAREER PROGRESSION & COMMUNICATION PREVIEW
    // -------------------------------------------------------------
    function renderCareerProgression(career) {
        const ladderEl = document.getElementById('detail-progression');
        if (ladderEl && career.careerProgression) {
            ladderEl.innerText = career.careerProgression;
        }

        const activitiesList = document.getElementById('detail-activities');
        if (activitiesList && career.typicalActivities) {
            activitiesList.innerHTML = career.typicalActivities.map(a => `
                <li class="flex items-start gap-2 text-xs sm:text-sm text-slate-600 font-medium">
                    <span class="text-blue-600 shrink-0">✓</span>
                    <span>${escapeHtml(a)}</span>
                </li>
            `).join('');
        }
    }

    function renderCommunicationDrillPreview(career) {
        const previewEl = document.getElementById('detail-coach-preview');
        if (!previewEl || !career.communicationExercise) return;

        const drill = career.communicationExercise;
        previewEl.innerHTML = `
            <div class="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div>
                    <span class="neu-badge text-[9px] font-black text-indigo-600 uppercase px-2 py-0.5 tracking-tight">Recommended Speaking Drill</span>
                    <h4 class="text-sm sm:text-base font-black text-slate-800 font-outfit mt-1 leading-snug">${escapeHtml(drill.title)}</h4>
                </div>
                <button type="button" onclick="launchCommunicationCoach()"
                    class="neu-btn px-3.5 py-1.5 text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-md hover:scale-105 active:scale-95 transition-transform flex items-center gap-1.5 cursor-pointer">
                    <span>🎙️ Practice in Coach</span> &rarr;
                </button>
            </div>
            <p class="text-xs text-slate-600 italic mb-2 bg-white/70 p-2.5 rounded-xl border border-slate-200/60 font-medium">
                "${escapeHtml(drill.prompt)}"
            </p>
            <div class="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                <span class="font-bold text-indigo-600">Framework:</span> ${escapeHtml(drill.framework)}
            </div>
        `;
    }

    function launchCommunicationCoach() {
        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        if (state.selectedCareer && root.CompassEngine) {
            root.CompassEngine.launchCommunicationCoachForCareer(state.selectedCareer);
        }
    }
    root.launchCommunicationCoach = launchCommunicationCoach;

    // -------------------------------------------------------------
    // 9. CAREER REALITY CHECK MODAL & INTERACTION
    // -------------------------------------------------------------
    function openRealityCheckModal(careerId) {
        const career = (root.COMPASS_CAREERS || []).find(c => c.id === careerId);
        if (!career || !career.realityCheck) return;

        const modal = document.getElementById('compass-reality-modal');
        const modalBody = document.getElementById('compass-reality-body');
        if (!modal || !modalBody) return;

        const rc = career.realityCheck;

        modalBody.innerHTML = `
            <div class="flex items-center gap-3 mb-4">
                <div class="w-11 h-11 neu-circle flex items-center justify-center text-2xl shrink-0">
                    ${career.icon || "⚡"}
                </div>
                <div>
                    <span class="neu-badge text-[9px] font-black text-amber-600 uppercase px-2 py-0.5">Career Reality Check</span>
                    <h3 class="text-base sm:text-lg font-black text-slate-800 font-outfit leading-tight">${escapeHtml(career.title)}</h3>
                </div>
            </div>

            <div class="neu-trench p-3.5 sm:p-4 rounded-2xl mb-4 bg-slate-100/70 border border-slate-200/70 text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                <span class="font-bold text-slate-900 block mb-1">Realistic Scenario:</span>
                ${escapeHtml(rc.scenario)}
            </div>

            <h4 class="text-xs sm:text-sm font-bold text-slate-800 mb-2.5">${escapeHtml(rc.task)}</h4>

            <div class="space-y-2 mb-4" id="reality-options-list">
                ${rc.options.map((opt, oIdx) => `
                    <button type="button" onclick="submitRealityAnswer('${career.id}', '${opt.id}')"
                        class="reality-opt-btn neu-btn w-full text-left p-3 sm:p-3.5 text-xs font-semibold text-slate-700 hover:text-blue-600 transition-all flex items-start gap-2.5 cursor-pointer">
                        <span class="w-5 h-5 neu-circle text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">${String.fromCharCode(65 + oIdx)}</span>
                        <span class="leading-snug flex-1">${escapeHtml(opt.text)}</span>
                    </button>
                `).join('')}
            </div>

            <div id="reality-feedback-container" class="hidden fade-in pt-3 border-t border-slate-200">
                <!-- Injected on submit -->
            </div>
        `;

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    root.openRealityCheckModal = openRealityCheckModal;

    function submitRealityAnswer(careerId, optionId) {
        const career = (root.COMPASS_CAREERS || []).find(c => c.id === careerId);
        if (!career || !career.realityCheck) return;

        const opt = career.realityCheck.options.find(o => o.id === optionId);
        const fbContainer = document.getElementById('reality-feedback-container');
        if (!fbContainer || !opt) return;

        // Disable options buttons
        document.querySelectorAll('.reality-opt-btn').forEach(btn => {
            btn.disabled = true;
            btn.classList.add('opacity-70');
        });

        fbContainer.innerHTML = `
            <div class="p-3.5 rounded-xl text-xs leading-relaxed mb-3 ${opt.correct ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-slate-100 text-slate-800 border border-slate-200'}">
                <span class="font-extrabold block mb-0.5">${opt.correct ? '✓ Optimal Strategy' : 'ℹ️ Nuanced Perspective'}:</span>
                ${escapeHtml(opt.note)}
            </div>
            <div class="text-[11px] text-slate-500 font-medium mb-4 italic">
                ${escapeHtml(career.realityCheck.debrief)}
            </div>

            <div class="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200/70 text-center">
                <h5 class="text-xs font-black text-slate-800 mb-2">How did this realistic task feel to you?</h5>
                <div class="flex items-center justify-center gap-2 flex-wrap">
                    <button type="button" onclick="recordRealityReaction('${careerId}', 'loved')" class="neu-btn px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-emerald-600 cursor-pointer">❤️ Loved it</button>
                    <button type="button" onclick="recordRealityReaction('${careerId}', 'enjoyed')" class="neu-btn px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-blue-600 cursor-pointer">👍 Enjoyed it</button>
                    <button type="button" onclick="recordRealityReaction('${careerId}', 'neutral')" class="neu-btn px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-amber-600 cursor-pointer">😐 Neutral</button>
                    <button type="button" onclick="recordRealityReaction('${careerId}', 'disliked')" class="neu-btn px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-rose-600 cursor-pointer">👎 Disliked</button>
                    <button type="button" onclick="recordRealityReaction('${careerId}', 'strongly_disliked')" class="neu-btn px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-red-700 cursor-pointer">🚫 Strongly Disliked</button>
                </div>
            </div>
        `;
        fbContainer.classList.remove('hidden');
    }
    root.submitRealityAnswer = submitRealityAnswer;

    function recordRealityReaction(careerId, reaction) {
        if (root.CompassEngine) {
            root.CompassEngine.recordRealityFeedback(careerId, reaction);
        }
        closeRealityCheckModal();
    }
    root.recordRealityReaction = recordRealityReaction;

    function closeRealityCheckModal() {
        const modal = document.getElementById('compass-reality-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
    root.closeRealityCheckModal = closeRealityCheckModal;

    // -------------------------------------------------------------
    // 10. CAREER COMPARISON CONTROLLER (Side-by-Side 2-3 Careers)
    // -------------------------------------------------------------
    function toggleCareerComparisonUI(careerId) {
        if (root.CompassEngine) {
            root.CompassEngine.toggleCareerComparison(careerId);
        }
    }
    root.toggleCareerComparisonUI = toggleCareerComparisonUI;

    function openComparisonModal() {
        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        const list = state.comparisonList || [];
        if (list.length < 2) {
            alert("Please select at least 2 careers to compare.");
            return;
        }

        const modal = document.getElementById('compass-comparison-modal');
        const container = document.getElementById('compass-comparison-columns');
        if (!modal || !container) return;

        container.innerHTML = "";

        list.forEach((c) => {
            const col = document.createElement('div');
            col.className = 'neu-card p-4 sm:p-5 flex flex-col justify-between space-y-4 border border-white/70 min-w-[260px] flex-1';

            col.innerHTML = `
                <div>
                    <div class="flex items-center gap-2.5 mb-2">
                        <span class="text-2xl">${c.icon || "🧭"}</span>
                        <div>
                            <span class="neu-badge text-[9px] font-black text-blue-600 uppercase px-2 py-0.5">${escapeHtml(c.category)}</span>
                            <h4 class="text-sm sm:text-base font-black text-slate-800 font-outfit mt-0.5 leading-snug">${escapeHtml(c.title)}</h4>
                        </div>
                    </div>

                    <div class="neu-trench p-2.5 rounded-xl text-[11px] font-medium text-slate-700 mb-3 bg-slate-100/50">
                        <span class="font-bold text-indigo-600 block mb-0.5">Strength Alignment:</span>
                        ${(c.strengthsRequired || []).join(", ") || "Analytical problem solving"}
                    </div>

                    <div class="space-y-2 text-xs text-slate-600">
                        <div>
                            <span class="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">Work Style:</span>
                            <p class="leading-relaxed mt-0.5">${escapeHtml(c.workStyle || "Autonomous focus & agile sprints")}</p>
                        </div>
                        <div>
                            <span class="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">Environment:</span>
                            <p class="leading-relaxed mt-0.5">${escapeHtml(c.environment || "Hybrid or remote modern team")}</p>
                        </div>
                        <div>
                            <span class="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">Potential Challenges:</span>
                            <p class="text-amber-800 leading-relaxed mt-0.5 font-medium">${escapeHtml(c.potentialFriction || "High context complexity")}</p>
                        </div>
                        <div>
                            <span class="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">Career Progression:</span>
                            <p class="leading-relaxed mt-0.5 text-blue-600 font-bold">${escapeHtml(c.careerProgression || "Junior ➔ Senior ➔ Lead")}</p>
                        </div>
                    </div>
                </div>

                <div class="pt-3 border-t border-slate-200/80">
                    <button type="button" onclick="closeComparisonModal(); inspectCareerRoadmap('${c.id}')"
                        class="w-full neu-btn py-2 text-xs font-extrabold text-blue-600 hover:text-blue-700 cursor-pointer">
                        Select This Roadmap &rarr;
                    </button>
                </div>
            `;
            container.appendChild(col);
        });

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    root.openComparisonModal = openComparisonModal;

    function closeComparisonModal() {
        const modal = document.getElementById('compass-comparison-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
    root.closeComparisonModal = closeComparisonModal;

    // -------------------------------------------------------------
    // 11. ROUTINE INTEGRATION MODAL CONTROLLER
    // Import roadmap milestones into existing Routine Tracker
    // -------------------------------------------------------------
    function openAddToRoutineModal() {
        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        const career = state.selectedCareer;
        if (!career || !career.phases) {
            alert("Please select a career roadmap first.");
            return;
        }

        const modal = document.getElementById('compass-routine-modal');
        const tasksContainer = document.getElementById('compass-routine-tasks-list');
        if (!modal || !tasksContainer) return;

        tasksContainer.innerHTML = "";

        career.phases.forEach((p, pIdx) => {
            const label = document.createElement('label');
            label.className = 'flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-100/70 transition-colors cursor-pointer text-xs font-medium text-slate-700';
            label.innerHTML = `
                <input type="checkbox" name="routine_phase_select" value="${pIdx}" checked
                    class="w-4 h-4 text-blue-600 rounded mt-0.5 cursor-pointer">
                <div>
                    <span class="font-bold text-slate-800 block">${escapeHtml(p.title)}</span>
                    <span class="text-[11px] text-slate-500 line-clamp-1">${escapeHtml(p.steps)}</span>
                </div>
            `;
            tasksContainer.appendChild(label);
        });

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    root.openAddToRoutineModal = openAddToRoutineModal;

    function saveRoadmapToRoutineFromModal() {
        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        const career = state.selectedCareer;
        if (!career) return;

        const checkboxes = document.querySelectorAll('input[name="routine_phase_select"]:checked');
        const selectedPhaseIndices = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));

        if (selectedPhaseIndices.length === 0) {
            alert("Please select at least one phase to add to your routine.");
            return;
        }

        const frequency = document.getElementById('routine-freq-select') ? document.getElementById('routine-freq-select').value : "Daily";
        const durationMins = document.getElementById('routine-duration-select') ? parseInt(document.getElementById('routine-duration-select').value, 10) : 30;
        const timeOfDay = document.getElementById('routine-time-select') ? document.getElementById('routine-time-select').value : "Morning Routine";

        if (root.CompassEngine) {
            root.CompassEngine.addRoadmapToRoutine(career, selectedPhaseIndices, frequency, durationMins, timeOfDay);
        }

        closeAddToRoutineModal();
    }
    root.saveRoadmapToRoutineFromModal = saveRoadmapToRoutineFromModal;

    function closeAddToRoutineModal() {
        const modal = document.getElementById('compass-routine-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }
    root.closeAddToRoutineModal = closeAddToRoutineModal;

    // -------------------------------------------------------------
    // 12. REFLECTION CHECKPOINT CONTROLLER
    // Post-milestone check-in: interest increased, stayed same, decreased
    // -------------------------------------------------------------
    function recordMilestoneReflection(reaction) {
        // reaction: 'increased' | 'same' | 'decreased'
        const state = root.CompassEngine ? root.CompassEngine.getState() : {};
        const career = state.selectedCareer;
        const resEl = document.getElementById('reflection-result-box');
        if (!resEl) return;

        let adviceHTML = "";
        if (reaction === 'increased') {
            adviceHTML = `
                <div class="p-4 rounded-xl bg-emerald-50 text-emerald-950 border border-emerald-200 text-xs leading-relaxed">
                    <span class="font-bold text-sm block mb-1">🚀 Momentum Confirmed!</span>
                    Your practical engagement is strengthening your interest in <strong>${escapeHtml(career ? career.title : "this career")}</strong>. Continue tackling your Capstone project and schedule next week's focus sprints in Routine Tracker!
                </div>
            `;
        } else if (reaction === 'same') {
            adviceHTML = `
                <div class="p-4 rounded-xl bg-blue-50 text-blue-950 border border-blue-200 text-xs leading-relaxed">
                    <span class="font-bold text-sm block mb-1">⚖️ Steady Exploration</span>
                    Your interest is stable. Test a <strong>60-Second Reality Check</strong> or try a <strong>Speaking Practice Drill</strong> in Communication Coach to experience the day-to-day communication demands!
                </div>
            `;
        } else {
            adviceHTML = `
                <div class="p-4 rounded-xl bg-amber-50 text-amber-950 border border-amber-200 text-xs leading-relaxed">
                    <span class="font-bold text-sm block mb-1">🧭 Valuable Self-Discovery!</span>
                    Recognizing what you do <em>not</em> enjoy is just as valuable as finding what you love. Consider comparing adjacent careers or retaking the assessment with fresh perspectives!
                    <div class="mt-2.5 flex items-center gap-2">
                        <button type="button" onclick="backToMatches()" class="neu-btn px-3 py-1 text-[11px] font-bold text-slate-700 hover:text-blue-600 cursor-pointer">Explore Adjacent Careers &rarr;</button>
                        <button type="button" onclick="retakeCompassAssessment()" class="neu-btn px-3 py-1 text-[11px] font-bold text-indigo-600 cursor-pointer">Reassess Profile</button>
                    </div>
                </div>
            `;
        }

        resEl.innerHTML = adviceHTML;
        resEl.classList.remove('hidden');
    }
    root.recordMilestoneReflection = recordMilestoneReflection;

    // -------------------------------------------------------------
    // 13. REASSESSMENT & HISTORY VIEW
    // -------------------------------------------------------------
    function renderAssessmentHistoryView() {
        const container = document.getElementById('compass-history-list');
        if (!container || !root.CompassEngine) return;

        const history = root.CompassEngine.getAssessmentHistory();
        if (history.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500 italic text-center py-6">No previous snapshots recorded. Complete an assessment to see how your preferences evolve over time.</p>`;
            return;
        }

        container.innerHTML = "";

        // Preference shift comparison if 2+ exist
        const shift = root.CompassEngine.calculatePreferenceShift();
        if (shift && Object.keys(shift.deltas).length > 0) {
            const shiftCard = document.createElement('div');
            shiftCard.className = 'neu-card p-4 sm:p-5 mb-4 border border-blue-200/70 bg-gradient-to-br from-blue-50/40 to-indigo-50/40';
            shiftCard.innerHTML = `
                <div class="flex items-center justify-between gap-2 mb-2">
                    <span class="text-xs font-bold text-blue-600 font-outfit uppercase tracking-wider">Reported Preferences Evolution</span>
                    <span class="text-[10px] font-bold text-slate-400 font-digital">Recent vs. Previous</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${Object.values(shift.deltas).slice(0, 5).map(d => `
                        <span class="neu-badge text-[10px] font-bold px-2 py-0.5 ${d.delta > 0 ? 'text-emerald-600' : 'text-slate-600'}">
                            ${d.delta > 0 ? '+' : ''}${d.delta} ${escapeHtml(d.name)}
                        </span>
                    `).join('')}
                </div>
            `;
            container.appendChild(shiftCard);
        }

        history.forEach((snap, idx) => {
            const snapDiv = document.createElement('div');
            snapDiv.className = 'neu-card-sm p-4 text-xs space-y-2 border border-white/70 mb-3';
            const dateStr = new Date(snap.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

            const matchesPreview = (snap.topMatches || []).map(m => m.title).join(", ") || "Recorded Profile";

            snapDiv.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="font-extrabold text-slate-800 font-outfit">${escapeHtml(snap.profile?.thinking?.archetype || "Career Profile Snapshot")}</span>
                    <span class="text-[10px] font-digital text-slate-500">${dateStr}</span>
                </div>
                <p class="text-slate-600 line-clamp-2">${escapeHtml(snap.profile?.thinking?.description || "")}</p>
                <div class="text-[11px] text-blue-600 font-medium">Top Matches: ${escapeHtml(matchesPreview)}</div>
            `;
            container.appendChild(snapDiv);
        });
    }

    function retakeCompassAssessment() {
        const interestSection = document.getElementById('interest-section');
        const quizSection = document.getElementById('quiz-section');
        const resultSection = document.getElementById('result-section');
        const careerDetails = document.getElementById('career-details');
        const matchesOverview = document.getElementById('matches-overview');

        if (quizSection) quizSection.classList.add('hidden');
        if (resultSection) resultSection.classList.add('hidden');
        if (careerDetails) careerDetails.classList.add('hidden');
        if (matchesOverview) matchesOverview.classList.remove('hidden');

        if (interestSection) {
            interestSection.classList.remove('hidden');
            interestSection.scrollIntoView({ behavior: 'smooth' });
        }
    }
    root.retakeCompassAssessment = retakeCompassAssessment;

    // Helper: HTML escaping
    function escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m]));
    }

    // Global bindings
    root.selectDiscoveryMode = selectDiscoveryMode;
    root.startAdaptiveAssessment = startAdaptiveAssessment;
    root.renderCurrentQuestion = renderCurrentQuestion;
    root.updateQuestionSelectionUI = updateQuestionSelectionUI;
    root.selectOption = selectOption;
    root.confirmAndContinue = confirmAndContinue;
    root.goBack = goBack;
    root.renderCompassResultsView = renderCompassResultsView;
    root.switchResultTab = switchResultTab;
    root.inspectCareerRoadmap = inspectCareerRoadmap;
    root.backToMatches = backToMatches;
    root.toggleRoadmapTask = toggleRoadmapTask;
    root.setResourceFilter = setResourceFilter;
    root.launchCommunicationCoach = launchCommunicationCoach;
    root.openRealityCheckModal = openRealityCheckModal;
    root.submitRealityAnswer = submitRealityAnswer;
    root.recordRealityReaction = recordRealityReaction;
    root.closeRealityCheckModal = closeRealityCheckModal;
    root.toggleCareerComparisonUI = toggleCareerComparisonUI;
    root.openComparisonModal = openComparisonModal;
    root.closeComparisonModal = closeComparisonModal;
    root.openAddToRoutineModal = openAddToRoutineModal;
    root.saveRoadmapToRoutineFromModal = saveRoadmapToRoutineFromModal;
    root.closeAddToRoutineModal = closeAddToRoutineModal;
    root.recordMilestoneReflection = recordMilestoneReflection;
    root.retakeCompassAssessment = retakeCompassAssessment;

    root.CompassUI = {
        selectDiscoveryMode,
        startAdaptiveAssessment,
        renderCurrentQuestion,
        updateQuestionSelectionUI,
        selectOption,
        confirmAndContinue,
        goBack,
        renderCompassResultsView,
        switchResultTab,
        inspectCareerRoadmap,
        backToMatches,
        toggleRoadmapTask,
        setResourceFilter,
        launchCommunicationCoach,
        openRealityCheckModal,
        submitRealityAnswer,
        recordRealityReaction,
        closeRealityCheckModal,
        toggleCareerComparisonUI,
        openComparisonModal,
        closeComparisonModal,
        openAddToRoutineModal,
        saveRoadmapToRoutineFromModal,
        closeAddToRoutineModal,
        recordMilestoneReflection,
        retakeCompassAssessment
    };

})(typeof window !== 'undefined' ? window : global);
