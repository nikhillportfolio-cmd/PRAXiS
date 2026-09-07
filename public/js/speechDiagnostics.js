/**
 * PRAXiS Speech Diagnostics Engine
 * 100% Local, Deterministic NLP & Speech Diagnostics
 * NO External AI APIs used. All metrics calculated from actual speech/timing data.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./transcriptProcessor'], factory);
    } else if (typeof module === 'object' && module.exports) {
        const TP = require('./transcriptProcessor');
        module.exports = factory(TP);
    } else {
        root.SpeechDiagnostics = factory(root.TranscriptProcessor);
    }
}(typeof self !== 'undefined' ? self : this, function (TranscriptProcessor) {

    const TP = TranscriptProcessor || (typeof require !== 'undefined' ? require('./transcriptProcessor') : null);

    // =========================================================================
    // 1. FILLER WORDS & PATTERNS DICTIONARY (Context-Aware)
    // =========================================================================
    const UNCONDITIONAL_FILLERS = [
        { word: "um", regex: /\b(um+)\b/gi },
        { word: "uh", regex: /\b(uh+)\b/gi },
        { word: "er", regex: /\b(er+)\b/gi },
        { word: "ah", regex: /\b(ah+)\b/gi },
        { word: "basically", regex: /\b(basically)\b/gi },
        { word: "actually", regex: /\b(actually)\b/gi },
        { word: "literally", regex: /\b(literally)\b/gi },
        { word: "you know", regex: /\b(you know)\b/gi },
        { word: "i mean", regex: /\b(i mean)\b/gi },
        { word: "sort of", regex: /\b(sort of)\b/gi },
        { word: "kind of", regex: /\b(kind of)\b/gi },
        { word: "to be honest", regex: /\b(to be honest|tbh)\b/gi },
        { word: "you see", regex: /\b(you see)\b/gi },
        { word: "so yeah", regex: /\b(so yeah)\b/gi },
        { word: "stuff like that", regex: /\b(stuff like that|and stuff)\b/gi }
    ];

    // Contextual patterns for ambiguous words like "like", "so", "okay"
    function detectContextualFillers(transcript) {
        const matches = [];
        const text = ' ' + transcript + ' ';

        // 1. "like" as filler:
        // Match when used before/after pauses, as hesitation, or repeated:
        // e.g. "and, like, we went", "it was like, um", "like, I think"
        // Do NOT match "I like football", "looks like", "similar to"
        const likeFillerRegex = /(?:,\s*|\b(?:and|so|it was|they were|he was|she was|was|just|is)\s+)like\b(?=\s+(?:um|uh|you know|basically|really|very|about|\d+|a|an|the|\w+ing))/gi;
        const standaloneLikeRegex = /^(?:\s*like\b)/gim;

        let m;
        while ((m = likeFillerRegex.exec(text)) !== null) {
            matches.push({ word: "like", index: m.index });
        }
        while ((m = standaloneLikeRegex.exec(text)) !== null) {
            matches.push({ word: "like", index: m.index });
        }

        // 2. "you know what i mean" or "you know"
        // 3. Consecutive "and and", "so so", "the the" (stuttering/filler restarts)
        const stutterRegex = /\b([a-zA-Z]+)\s+\1\b/gi;
        while ((m = stutterRegex.exec(text)) !== null) {
            if (!['that', 'had'].includes(m[1].toLowerCase())) {
                matches.push({ word: `${m[1]} ${m[1]} (restart)`, index: m.index });
            }
        }

        return matches;
    }

    // =========================================================================
    // 2. VOCABULARY UPGRADE & PRECISION DICTIONARY
    // =========================================================================
    const VOCAB_UPGRADE_DICTIONARY = {
        "good": {
            alternatives: ["effective", "impressive", "compelling", "beneficial", "valuable"],
            explanation: "Replace generic 'good' with words that specify the exact positive quality."
        },
        "bad": {
            alternatives: ["problematic", "suboptimal", "counterproductive", "ineffective", "flawed"],
            explanation: "Use precise descriptors instead of broad 'bad'."
        },
        "big": {
            alternatives: ["significant", "substantial", "considerable", "extensive", "momentous"],
            explanation: "Convey scale and significance with stronger adjectives."
        },
        "small": {
            alternatives: ["minor", "modest", "limited", "marginal", "incremental"],
            explanation: "Provide nuanced perspective on size or impact."
        },
        "very": {
            alternatives: ["highly", "exceptionally", "notably", "markedly", "substantially"],
            explanation: "Elevate intensity without relying on repetitive intensifiers like 'very'."
        },
        "very good": {
            alternatives: ["outstanding", "exemplary", "exceptional", "first-rate"],
            explanation: "Single strong adjectives communicate confidence faster."
        },
        "very important": {
            alternatives: ["crucial", "essential", "vital", "paramount", "critical"],
            explanation: "Demonstrate professional vocabulary for priorities."
        },
        "help": {
            alternatives: ["assist", "facilitate", "support", "empower", "enable"],
            explanation: "Use action verbs that convey collaboration and enablement."
        },
        "solve": {
            alternatives: ["resolve", "address", "rectify", "mitigate", "troubleshoot"],
            explanation: "Specify how a problem is handled."
        },
        "make": {
            alternatives: ["create", "develop", "establish", "implement", "formulate"],
            explanation: "Choose verbs indicating intentional execution."
        },
        "hard": {
            alternatives: ["challenging", "complex", "demanding", "rigorous", "intricate"],
            explanation: "Accurately characterize difficulty."
        },
        "change": {
            alternatives: ["transform", "adapt", "modify", "transition", "recalibrate"],
            explanation: "Describe the nature of the change precisely."
        },
        "show": {
            alternatives: ["demonstrate", "illustrate", "exemplify", "highlight", "substantiate"],
            explanation: "Present evidence with clearer verbs."
        },
        "think": {
            alternatives: ["believe", "consider", "assess", "anticipate", "conclude"],
            explanation: "Express reasoning with conviction."
        },
        "problem": {
            alternatives: ["challenge", "obstacle", "impediment", "bottleneck", "issue"],
            explanation: "Frame problems as concrete obstacles to resolve."
        },
        "happy": {
            alternatives: ["gratified", "pleased", "enthusiastic", "delighted", "optimistic"],
            explanation: "Articulate specific positive emotions."
        },
        "talk": {
            alternatives: ["discuss", "communicate", "convey", "deliberate", "articulate"],
            explanation: "Distinguish between conversation, explanation, and negotiation."
        },
        "a lot of": {
            alternatives: ["numerous", "substantial", "a significant number of", "extensive"],
            explanation: "Replace informal quantifiers with concrete amounts."
        },
        "thing": {
            alternatives: ["factor", "element", "aspect", "component", "consideration"],
            explanation: "Specify the exact concept or item being discussed."
        },
        "nice": {
            alternatives: ["pleasant", "favorable", "advantageous", "welcoming"],
            explanation: "Use descriptive qualities instead of vague pleasantries."
        }
    };

    // =========================================================================
    // 3. MODULAR GRAMMAR RULES ENGINE
    // =========================================================================
    const GRAMMAR_RULES = [
        // Category 1: Subject-Verb Agreement
        {
            category: "Subject-Verb Agreement",
            regex: /\b(he|she|it)\s+(don't)\b/gi,
            match: "$1 don't",
            corrected: (m, p1) => `${p1} doesn't`,
            explanation: "Use third-person singular 'doesn't' with he, she, or it (not 'don't')."
        },
        {
            category: "Subject-Verb Agreement",
            regex: /\b(i|we|they|you)\s+(doesn't)\b/gi,
            match: "$1 doesn't",
            corrected: (m, p1) => `${p1} don't`,
            explanation: "Use 'don't' with first/second person and plural pronouns (I, we, they, you)."
        },
        {
            category: "Subject-Verb Agreement",
            regex: /\b(he|she|it)\s+(go|come|take|make|know|think|see|want|need|give)\b/gi,
            match: "$1 $2",
            corrected: (m, p1, p2) => {
                const map = { go: 'goes', come: 'comes', take: 'takes', make: 'makes', know: 'knows', think: 'thinks', see: 'sees', want: 'wants', need: 'needs', give: 'gives' };
                return `${p1} ${map[p2.toLowerCase()] || p2 + 's'}`;
            },
            explanation: "Third-person singular subjects (he, she, it) require the singular verb ending in -s or -es."
        },
        {
            category: "Subject-Verb Agreement",
            regex: /\b(he|she|it)\s+(have)\b/gi,
            match: "$1 have",
            corrected: (m, p1) => `${p1} has`,
            explanation: "Use 'has' (not 'have') with singular third-person subjects."
        },
        {
            category: "Subject-Verb Agreement",
            regex: /\b(they|we|you)\s+(was)\b/gi,
            match: "$1 was",
            corrected: (m, p1) => `${p1} were`,
            explanation: "Use plural past tense 'were' with they, we, or you."
        },
        {
            category: "Subject-Verb Agreement",
            regex: /\b(everybody|everyone|nobody|someone|anyone)\s+(are|were|have)\b/gi,
            match: "$1 $2",
            corrected: (m, p1, p2) => {
                const map = { are: 'is', were: 'was', have: 'has' };
                return `${p1} ${map[p2.toLowerCase()] || 'is'}`;
            },
            explanation: "Indefinite pronouns (everybody, everyone, nobody) take singular verbs (is, was, has)."
        },
        {
            category: "Subject-Verb Agreement",
            regex: /\b(there\s+is)\s+(\d+|many|several|multiple|a lot of\s+\w+s)\b/gi,
            match: "there is $2",
            corrected: (m, p1, p2) => `there are ${p2}`,
            explanation: "Use 'there are' before plural nouns."
        },

        // Category 2: Tense & Verb Forms
        {
            category: "Tense & Aspect",
            regex: /\b(yesterday|last\s+(?:week|month|year)|ago)\s+.*?\b(i|we|he|she|they)\s+(go|see|come|take|buy|make|do|run|eat)\b/gi,
            match: "past marker with present tense",
            corrected: (m) => m.replace(/\bgo\b/gi, 'went').replace(/\bsee\b/gi, 'saw').replace(/\bcome\b/gi, 'came').replace(/\btake\b/gi, 'took').replace(/\bbuy\b/gi, 'bought').replace(/\bmake\b/gi, 'made').replace(/\bdo\b/gi, 'did'),
            explanation: "When describing completed past events, use the simple past form of the verb."
        },
        {
            category: "Tense & Aspect",
            regex: /\b(didn't|did\s+not)\s+(went|saw|came|took|bought|made|did|ran|ate|spoke)\b/gi,
            match: "$1 $2",
            corrected: (m, p1, p2) => {
                const baseMap = { went: 'go', saw: 'see', came: 'come', took: 'take', bought: 'buy', made: 'make', did: 'do', ran: 'run', ate: 'eat', spoke: 'speak' };
                return `${p1} ${baseMap[p2.toLowerCase()] || p2}`;
            },
            explanation: "After auxiliary 'did / didn't', use the base infinitive form of the verb (e.g., 'didn't go', not 'didn't went')."
        },
        {
            category: "Tense & Aspect",
            regex: /\b(have|has|had)\s+(went|saw|came|took|did|wrote|ran)\b/gi,
            match: "$1 $2",
            corrected: (m, p1, p2) => {
                const ppMap = { went: 'gone', saw: 'seen', came: 'come', took: 'taken', did: 'done', wrote: 'written', ran: 'run' };
                return `${p1} ${ppMap[p2.toLowerCase()] || p2}`;
            },
            explanation: "Use the past participle after have/has/had (e.g., 'have gone', not 'have went')."
        },

        // Category 3: Articles & Determiners
        {
            category: "Articles & Determiners",
            regex: /\b(i\s+am|he\s+is|she\s+is)\s+(student|teacher|developer|engineer|doctor|manager|consultant)\b/gi,
            match: "$1 $2",
            corrected: (m, p1, p2) => {
                const article = /^[aeiou]/i.test(p2) ? 'an' : 'a';
                return `${p1} ${article} ${p2}`;
            },
            explanation: "Singular countable professions and roles require an indefinite article (a / an)."
        },
        {
            category: "Articles & Determiners",
            regex: /\b(an)\s+(university|uniform|unique|useful|european)\b/gi,
            match: "an $2",
            corrected: (m, p1, p2) => `a ${p2}`,
            explanation: "Words starting with a 'yu' consonant sound take 'a' rather than 'an' (e.g., 'a university')."
        },
        {
            category: "Articles & Determiners",
            regex: /\b(a)\s+(hour|honest|honor|heir)\b/gi,
            match: "a $2",
            corrected: (m, p1, p2) => `an ${p2}`,
            explanation: "Words with a silent 'h' start with a vowel sound and take 'an' (e.g., 'an hour')."
        },
        {
            category: "Articles & Determiners",
            regex: /\b(every\s+people|all\s+person)\b/gi,
            match: "$1",
            corrected: "everyone / all people",
            explanation: "'Every' modifies singular nouns ('every person' or 'everyone'); 'people' is plural."
        },

        // Category 4: Prepositions & Collocations
        {
            category: "Prepositions",
            regex: /\b(depend\s+of)\b/gi,
            match: "depend of",
            corrected: "depend on",
            explanation: "The correct collocation is 'depend on' (or 'depend upon'), not 'depend of'."
        },
        {
            category: "Prepositions",
            regex: /\b(good|bad|expert)\s+in\s+(\w+ing|\w+)\b/gi,
            match: "$1 in $2",
            corrected: (m, p1, p2) => `${p1} at ${p2}`,
            explanation: "Use 'good at' or 'bad at' when describing proficiency or skills."
        },
        {
            category: "Prepositions",
            regex: /\b(interested\s+for)\b/gi,
            match: "interested for",
            corrected: "interested in",
            explanation: "The correct preposition is 'interested in'."
        },
        {
            category: "Prepositions",
            regex: /\b(discuss\s+about)\b/gi,
            match: "discuss about",
            corrected: "discuss",
            explanation: "'Discuss' is a transitive verb that directly takes the object without 'about'."
        },
        {
            category: "Prepositions",
            regex: /\b(explain\s+me)\b/gi,
            match: "explain me",
            corrected: "explain to me",
            explanation: "Use 'explain to [person]', not 'explain [person]'."
        },
        {
            category: "Prepositions",
            regex: /\b(in\s+the\s+other\s+hand)\b/gi,
            match: "in the other hand",
            corrected: "on the other hand",
            explanation: "The correct idiomatic transition is 'on the other hand'."
        },
        {
            category: "Prepositions",
            regex: /\b(listen\s+(?:the|this|music|to\s+me|radio))\b/gi,
            match: (m) => m,
            corrected: (m) => m.replace(/listen\s+(?!to\b)/i, 'listen to '),
            explanation: "'Listen' requires the preposition 'to' before its object."
        },

        // Category 5: Auxiliary Verbs & Modals
        {
            category: "Auxiliary & Modals",
            regex: /\b(could|should|would|must)\s+of\b/gi,
            match: "$1 of",
            corrected: (m, p1) => `${p1} have`,
            explanation: "Use modal + 'have' (e.g., 'could have', 'should have'), not 'of'."
        },
        {
            category: "Auxiliary & Modals",
            regex: /\b(must\s+to|can\s+to|should\s+to|may\s+to)\s+(\w+)\b/gi,
            match: "$1 to $2",
            corrected: (m, p1, p2) => `${p1.replace(/\s+to/i, '')} ${p2}`,
            explanation: "Modal verbs (must, can, should, may) are followed directly by the bare infinitive without 'to'."
        },

        // Category 6: Double Negatives
        {
            category: "Double Negatives",
            regex: /\b(don't|doesn't|didn't|can't|won't)\s+.*?\b(no\s+one|nobody|nothing|nowhere)\b/gi,
            match: "double negative",
            corrected: (m) => m.replace(/\bno\s+one\b/gi, 'anyone').replace(/\bnobody\b/gi, 'anybody').replace(/\bnothing\b/gi, 'anything').replace(/\bnowhere\b/gi, 'anywhere'),
            explanation: "Avoid double negatives in formal English. Use 'any-' words (anything, anyone) with negative verbs."
        },

        // Category 7: Pronouns & Case
        {
            category: "Pronoun Usage",
            regex: /\b(me\s+and\s+(?:him|her|them|my\s+friend|\w+))\s+(went|did|saw|have|are|were|decided)\b/gi,
            match: "$1 $2",
            corrected: (m, p1, p2) => {
                const other = p1.replace(/^me\s+and\s+/i, '');
                return `${other} and I ${p2}`;
            },
            explanation: "Use subjective pronoun 'I' when part of a compound subject (e.g., 'my colleague and I went')."
        },
        {
            category: "Pronoun Usage",
            regex: /\b(myself\s+and\s+(\w+))\b/gi,
            match: "myself and $2",
            corrected: (m, p1, p2) => `${p2} and I`,
            explanation: "Use reflexive 'myself' only when the subject is 'I'. For compound subjects, use '[Name] and I'."
        },

        // Category 8: Common Phrasing & Word Order
        {
            category: "Phrasing & Word Order",
            regex: /\b(i\s+am\s+agree|i'm\s+agree)\b/gi,
            match: "I am agree",
            corrected: "I agree",
            explanation: "'Agree' is a verb. Say 'I agree' (not 'I am agree')."
        },
        {
            category: "Phrasing & Word Order",
            regex: /\b(more\s+better|more\s+easier|more\s+faster|more\s+stronger)\b/gi,
            match: "double comparative",
            corrected: (m) => m.replace(/more\s+/i, ''),
            explanation: "Avoid double comparatives. Use the comparative form alone (better, easier, faster)."
        }
    ];

    // =========================================================================
    // 4. STRUCTURAL MARKERS & FRAMEWORK DETECTION
    // =========================================================================
    const PREP_MARKERS = {
        point: [
            "i believe", "in my opinion", "i think", "from my perspective", "my view is",
            "the main point is", "i maintain that", "first and foremost", "it is clear that"
        ],
        reason: [
            "because", "the reason is", "since", "due to", "as a result of",
            "this is because", "the primary rationale", "owing to"
        ],
        example: [
            "for example", "for instance", "such as", "to illustrate", "in my experience",
            "a clear case of this", "as an illustration", "take for example"
        ],
        pointConclusion: [
            "therefore", "in conclusion", "to sum up", "overall", "so we can see",
            "consequently", "in summary", "that is why", "ultimately"
        ]
    };

    const TRANSITION_WORDS = [
        "furthermore", "moreover", "in addition", "additionally",
        "however", "on the other hand", "nevertheless", "conversely", "although", "yet",
        "therefore", "consequently", "as a result", "thus",
        "firstly", "secondly", "thirdly", "finally", "subsequently", "meanwhile"
    ];

    // =========================================================================
    // 5. CORE DETERMINISTIC SPEECH DIAGNOSTICS FUNCTION
    // =========================================================================

    /**
     * Central deterministic diagnostics function.
     * @param {Object} params
     * @param {string} params.transcript - Raw transcript text
     * @param {number} params.duration - Duration in seconds (default 60)
     * @param {string} params.topic - Optional topic / prompt text
     * @param {string} params.targetStructure - Optional target structure ('PREP', 'STAR', etc.)
     * @returns {Object} Structured diagnostics results
     */
    function analyzeSpeech({ transcript, duration = 60, topic = '', targetStructure = 'PREP' }) {
        const rawText = String(transcript || '').trim();
        const durationSec = Math.max(Number(duration) || 60, 1);
        const durationMin = durationSec / 60;

        // Clean & Normalize Words
        const words = (TP && TP.tokenizeWords) ? TP.tokenizeWords(rawText) : rawText.split(/\s+/).filter(Boolean);
        const wordCount = words.length;

        // If no speech or empty transcript, return clear unanalyzed/empty state
        if (wordCount === 0) {
            return createEmptyDiagnosticsState("No speech detected. Please speak into the microphone or enter a transcript to evaluate.");
        }

        // Handle very short transcript (< 5 words) with warning and baseline metrics
        const isVeryShort = wordCount < 5;

        // ---------------------------------------------------------------------
        // A. WPM (Words Per Minute) & Pace Calculation
        // ---------------------------------------------------------------------
        const wpm = Math.round(wordCount / Math.max(durationMin, 0.05));
        let paceStatus = "Good/comfortable";
        let paceScore = 10;

        if (wpm < 90) {
            paceStatus = "Slow (<90 WPM)";
            paceScore = Math.max(4, Math.round(4 + (wpm / 90) * 4));
        } else if (wpm <= 150) {
            paceStatus = "Good/comfortable (90–150 WPM)";
            paceScore = 10;
        } else if (wpm <= 180) {
            paceStatus = "Fast (151–180 WPM)";
            paceScore = 8;
        } else {
            paceStatus = "Very fast (>180 WPM)";
            paceScore = Math.max(4, Math.round(10 - ((wpm - 180) / 20)));
        }

        // ---------------------------------------------------------------------
        // B. Filler Word Detection (Pattern & Contextual)
        // ---------------------------------------------------------------------
        const fillerCounts = new Map();
        let totalFillerCount = 0;

        // 1. Unconditional fillers
        UNCONDITIONAL_FILLERS.forEach(fp => {
            const matches = rawText.match(fp.regex);
            if (matches) {
                const count = matches.length;
                totalFillerCount += count;
                const key = fp.word.toLowerCase();
                fillerCounts.set(key, (fillerCounts.get(key) || 0) + count);
            }
        });

        // 2. Contextual fillers
        const contextualMatches = detectContextualFillers(rawText);
        contextualMatches.forEach(cm => {
            totalFillerCount += 1;
            const key = cm.word.toLowerCase();
            fillerCounts.set(key, (fillerCounts.get(key) || 0) + 1);
        });

        const fillerPercentage = wordCount > 0 ? Number(((totalFillerCount / wordCount) * 100).toFixed(1)) : 0;
        const fillerWordsList = Array.from(fillerCounts.entries()).map(([word, count]) => ({ word, count }));
        fillerWordsList.sort((a, b) => b.count - a.count);

        // ---------------------------------------------------------------------
        // C. Lexical Variety & Excessive Repetition Detection
        // ---------------------------------------------------------------------
        const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z0-9']/g, '')).filter(Boolean);
        const stopWordSet = TP ? TP.STOP_WORDS : new Set(['the', 'a', 'an', 'is', 'to', 'of', 'in', 'and', 'or', 'but']);
        
        const contentWords = lowerWords.filter(w => !stopWordSet.has(w) && w.length > 2);
        const uniqueContentWords = new Set(contentWords);
        const lexicalVariety = contentWords.length > 0
            ? Math.round((uniqueContentWords.size / contentWords.length) * 100)
            : Math.round((new Set(lowerWords).size / Math.max(lowerWords.length, 1)) * 100);

        // Repetition check: count content word frequency
        const freqMap = new Map();
        contentWords.forEach(w => freqMap.set(w, (freqMap.get(w) || 0) + 1));
        const repeatedWords = [];
        freqMap.forEach((count, word) => {
            if (count >= 3 && word.length > 3) {
                repeatedWords.push({ word, count });
            }
        });
        repeatedWords.sort((a, b) => b.count - a.count);

        // ---------------------------------------------------------------------
        // D. Rule-Based Grammar Diagnostics
        // ---------------------------------------------------------------------
        const grammarCorrections = [];
        let correctedTranscript = rawText;

        GRAMMAR_RULES.forEach(rule => {
            let match;
            const reg = new RegExp(rule.regex);
            while ((match = reg.exec(rawText)) !== null) {
                const originalSnippet = match[0];
                let replacement = typeof rule.corrected === 'function'
                    ? rule.corrected(...match)
                    : rule.corrected;
                
                grammarCorrections.push({
                    original: originalSnippet,
                    correction: replacement,
                    rule: rule.category,
                    explanation: rule.explanation
                });

                // Apply to corrected transcript
                correctedTranscript = correctedTranscript.replace(originalSnippet, replacement);
            }
        });

        // ---------------------------------------------------------------------
        // E. Sentence & Structure Analysis (PREP / Transitions)
        // ---------------------------------------------------------------------
        const sentences = (TP && TP.tokenizeSentences) ? TP.tokenizeSentences(rawText) : rawText.split(/[.!?]+/).filter(Boolean);
        const sentenceCount = Math.max(sentences.length, 1);
        const avgSentenceLength = Math.round(wordCount / sentenceCount);

        let shortSentenceCount = 0;
        let longSentenceCount = 0;
        sentences.forEach(s => {
            const wLen = s.trim().split(/\s+/).filter(Boolean).length;
            if (wLen < 4) shortSentenceCount++;
            if (wLen > 25) longSentenceCount++;
        });

        // Transition Words Detection
        const detectedTransitions = [];
        const lowerTranscript = rawText.toLowerCase();
        TRANSITION_WORDS.forEach(tw => {
            const reg = new RegExp(`\\b${tw}\\b`, 'gi');
            const matches = lowerTranscript.match(reg);
            if (matches) {
                detectedTransitions.push({ transition: tw, count: matches.length });
            }
        });

        // Structure Markers Evidence for PREP
        const structureEvidence = {
            hasPoint: PREP_MARKERS.point.some(p => lowerTranscript.includes(p)),
            hasReason: PREP_MARKERS.reason.some(r => lowerTranscript.includes(r)),
            hasExample: PREP_MARKERS.example.some(e => lowerTranscript.includes(e)),
            hasPointConclusion: PREP_MARKERS.pointConclusion.some(c => lowerTranscript.includes(c))
        };

        let prepMarkersFound = 0;
        if (structureEvidence.hasPoint) prepMarkersFound++;
        if (structureEvidence.hasReason) prepMarkersFound++;
        if (structureEvidence.hasExample) prepMarkersFound++;
        if (structureEvidence.hasPointConclusion) prepMarkersFound++;

        // Calculate Structure Score (0-100)
        let structureScore = 40; // Base score
        structureScore += (prepMarkersFound * 12); // up to +48 for PREP indicators
        if (detectedTransitions.length >= 2) structureScore += 8;
        if (avgSentenceLength >= 8 && avgSentenceLength <= 20) structureScore += 4;
        structureScore = Math.min(95, Math.max(30, structureScore));

        // ---------------------------------------------------------------------
        // F. Coherence & Flow Analysis
        // ---------------------------------------------------------------------
        let coherenceScore = 70;
        if (detectedTransitions.length >= 2) coherenceScore += 15;
        if (longSentenceCount > (sentenceCount * 0.4)) coherenceScore -= 15; // penalty for run-on sentences
        if (totalFillerCount > (wordCount * 0.08)) coherenceScore -= 15;
        coherenceScore = Math.min(95, Math.max(30, coherenceScore));

        // ---------------------------------------------------------------------
        // G. Vocabulary Improvements & Upgrades
        // ---------------------------------------------------------------------
        const vocabularyImprovements = [];
        Object.keys(VOCAB_UPGRADE_DICTIONARY).forEach(weakWord => {
            const reg = new RegExp(`\\b${weakWord}\\b`, 'gi');
            if (reg.test(rawText)) {
                const info = VOCAB_UPGRADE_DICTIONARY[weakWord];
                vocabularyImprovements.push({
                    original: weakWord,
                    suggestions: info.alternatives,
                    explanation: info.explanation,
                    example: `e.g. "...${info.alternatives[0]}..."`
                });
            }
        });

        // ---------------------------------------------------------------------
        // H. Score Calculations (Fluency, Grammar, Vocabulary, Structure, Overall)
        // ---------------------------------------------------------------------
        // Fluency (0-100 & 0-10): Based on pace score and filler penalty
        let fluencyScore100 = Math.round(paceScore * 10 - Math.min(fillerPercentage * 4, 35));
        fluencyScore100 = Math.min(98, Math.max(25, fluencyScore100));
        const fluencyScore10 = Number((fluencyScore100 / 10).toFixed(1));

        // Grammar (0-100 & 0-10): Based on detected grammar issues
        let grammarScore100 = Math.round(95 - (grammarCorrections.length * 14));
        grammarScore100 = Math.min(98, Math.max(30, grammarScore100));
        const grammarScore10 = Number((grammarScore100 / 10).toFixed(1));

        // Vocabulary (0-100 & 0-10): Based on lexical variety, repetition, upgrades
        let vocabScore100 = Math.round((lexicalVariety * 0.6) + (30 - (repeatedWords.length * 5)));
        if (vocabularyImprovements.length > 0) vocabScore100 += 5;
        vocabScore100 = Math.min(96, Math.max(30, vocabScore100));
        const vocabularyScore10 = Number((vocabScore100 / 10).toFixed(1));

        // Structure (0-100 & 0-10)
        const structureScore10 = Number((structureScore / 10).toFixed(1));

        // OVERALL SCORE FORMULA:
        // Overall = Fluency (30%) + Grammar (30%) + Vocabulary (20%) + Structure (20%)
        let overallScore = Math.round(
            (fluencyScore100 * 0.30) +
            (grammarScore100 * 0.30) +
            (vocabScore100 * 0.20) +
            (structureScore * 0.20)
        );

        if (isVeryShort) {
            overallScore = Math.min(overallScore, 45);
        }

        // ---------------------------------------------------------------------
        // I. Personalized Next Step Identification
        // ---------------------------------------------------------------------
        let nextStep = "";
        if (isVeryShort) {
            nextStep = "We detected a very short speech sample. For accurate metrics, try speaking for at least 30–60 seconds in full sentences.";
        } else if (fillerPercentage >= 5) {
            nextStep = `High filler density (${fillerPercentage}% of words). Focus on intentional silent pauses instead of filler sounds (um, uh, like).`;
        } else if (wpm < 90) {
            nextStep = `Your cadence is slow (${wpm} WPM). Practice linking phrases together to reach a comfortable 110–140 WPM pace.`;
        } else if (wpm > 175) {
            nextStep = `Your pace is very fast (${wpm} WPM). Slow down slightly and pause after major ideas to increase clarity.`;
        } else if (grammarCorrections.length >= 2) {
            nextStep = `Focus on ${grammarCorrections[0].rule}: "${grammarCorrections[0].original}" ➔ "${grammarCorrections[0].correction}".`;
        } else if (prepMarkersFound < 2) {
            nextStep = "Strengthen your response structure with PREP: State your Point, give a Reason ('because'), share an Example ('for instance'), and restate your Point.";
        } else if (lexicalVariety < 45) {
            nextStep = "Upgrade your vocabulary range by swapping common words with more precise alternatives (e.g., 'good' ➔ 'effective').";
        } else {
            nextStep = "Strong speaking performance! Maintain this structure and challenge yourself with an impromptu topic.";
        }

        // ---------------------------------------------------------------------
        // J. Strengths & Top 3 Improvements
        // ---------------------------------------------------------------------
        const strengths = [];
        if (wpm >= 95 && wpm <= 155) strengths.push("Well-regulated, natural speaking pace (ideal listener comprehension).");
        if (totalFillerCount === 0 && wordCount >= 20) strengths.push("Exceptional speech hygiene: zero filler words detected.");
        else if (fillerPercentage < 3 && wordCount >= 20) strengths.push("Minimal filler word usage (clean and crisp articulation).");
        if (grammarCorrections.length === 0 && wordCount >= 20) strengths.push("Strong grammatical accuracy across sentences.");
        if (prepMarkersFound >= 2) strengths.push("Clear structural organization following structured speaking principles.");
        if (lexicalVariety >= 60) strengths.push("Diverse vocabulary choice with minimal repetitive phrasing.");
        if (strengths.length === 0) strengths.push("Clear verbal output with identifiable core message.");

        const top3Improvements = [];
        if (fillerPercentage >= 3) {
            top3Improvements.push(`Reduce Filler Words: ${totalFillerCount} filler word(s) detected (${fillerPercentage}%). Replace with brief silent pauses.`);
        }
        if (grammarCorrections.length > 0) {
            top3Improvements.push(`Grammar Accuracy: Review ${grammarCorrections[0].rule.toLowerCase()} (e.g. replace "${grammarCorrections[0].original}" with "${grammarCorrections[0].correction}").`);
        }
        if (prepMarkersFound < 2) {
            top3Improvements.push("Structural Clarity: Use explicit transitional signposts like 'For example...' and 'Therefore...' to guide the listener.");
        }
        if (repeatedWords.length > 0 && top3Improvements.length < 3) {
            top3Improvements.push(`Word Variety: Avoid repeating "${repeatedWords[0].word}" (${repeatedWords[0].count} times). Substitute with synonyms.`);
        }
        if (wpm < 90 && top3Improvements.length < 3) {
            top3Improvements.push(`Speaking Cadence: Increase pacing from ${wpm} WPM toward the 110–140 WPM benchmark.`);
        }
        if (wpm > 175 && top3Improvements.length < 3) {
            top3Improvements.push(`Speaking Cadence: Modulate pacing from ${wpm} WPM down to a controlled 130–150 WPM.`);
        }
        while (top3Improvements.length < 3) {
            top3Improvements.push("Practice Express Drills: Complete daily 60-second timed speaking exercises to build spontaneous fluency.");
        }

        // ---------------------------------------------------------------------
        // K. Natural & Professional Rephrasing Generator
        // ---------------------------------------------------------------------
        let naturalVersion = rawText;
        // Clean filler words from natural version
        UNCONDITIONAL_FILLERS.forEach(fp => {
            naturalVersion = naturalVersion.replace(fp.regex, '');
        });
        grammarCorrections.forEach(gc => {
            naturalVersion = naturalVersion.replace(gc.original, gc.correction);
        });
        naturalVersion = naturalVersion.replace(/\s{2,}/g, ' ').trim();
        if (naturalVersion.length > 0) {
            naturalVersion = naturalVersion.charAt(0).toUpperCase() + naturalVersion.slice(1);
        }

        let professionalVersion = naturalVersion;
        vocabularyImprovements.slice(0, 3).forEach(vi => {
            const reg = new RegExp(`\\b${vi.original}\\b`, 'gi');
            professionalVersion = professionalVersion.replace(reg, vi.suggestions[0]);
        });

        // ---------------------------------------------------------------------
        // L. Coaching Intelligence & Targeted Drill Engine
        // ---------------------------------------------------------------------
        const coachInsights = identifyCoachingInsights({
            wpm,
            paceStatus,
            wordCount,
            durationSeconds: durationSec,
            sentenceCount,
            totalFillerCount,
            fillerPercentage,
            fillerWordsList,
            grammarCorrections,
            vocabularyImprovements,
            repeatedWords,
            structureEvidence,
            prepMarkersFound,
            lexicalVariety,
            rawText,
            topic
        });

        return {
            overallScore,
            fluencyScore: fluencyScore100,
            fluencyScore10,
            grammarScore: grammarScore100,
            grammarScore10,
            vocabularyScore: vocabScore100,
            vocabularyScore10,
            structureScore,
            structureScore10,
            coherenceScore,
            wpm,
            paceStatus,
            wordCount,
            durationSeconds: durationSec,
            sentenceCount,
            avgSentenceLength,
            shortSentenceCount,
            longSentenceCount,
            fillerCount: totalFillerCount,
            fillerPercentage,
            fillerWords: fillerWordsList,
            lexicalVariety,
            repeatedWords,
            strengths,
            top3Improvements: top3Improvements.slice(0, 3),
            grammarCorrections,
            vocabularyImprovements,
            structureEvidence,
            prepMarkersFound,
            rephrasings: {
                natural: naturalVersion || rawText,
                professional: professionalVersion || naturalVersion || rawText
            },
            nextStep,
            // Coaching-First Properties
            coachInsights,
            primaryWeakness: coachInsights.primaryWeakness,
            secondaryWeakness: coachInsights.secondaryWeakness,
            coachStrengths: coachInsights.strengths,
            drill: coachInsights.drill,
            coachGreeting: coachInsights.greeting,
            isAnalyzed: true
        };
    }

    /**
     * Identifies the #1 primary weakness, optional secondary weakness,
     * student-friendly explanation with speech evidence, actionable tip, and targeted drill.
     */
    function identifyCoachingInsights(data) {
        const {
            wpm = 0,
            wordCount = 0,
            durationSeconds = 0,
            sentenceCount = 0,
            totalFillerCount = 0,
            fillerPercentage = 0,
            fillerWordsList = [],
            grammarCorrections = [],
            vocabularyImprovements = [],
            repeatedWords = [],
            structureEvidence = {},
            prepMarkersFound = 0,
            lexicalVariety = 0,
            rawText = '',
            topic = ''
        } = data;

        const isVeryShort = wordCount < 8 || durationSeconds < 5;

        // Friendly greeting based on speaking performance
        let greeting = "Nice work!";
        if (isVeryShort) {
            greeting = "Good start!";
        } else if (totalFillerCount === 0 && wpm >= 110 && wpm <= 150 && grammarCorrections.length === 0) {
            greeting = "Outstanding delivery! 🌟";
        } else if (wpm >= 105 && wpm <= 155 && totalFillerCount <= 2) {
            greeting = "Great speaking! You communicated clearly. 👏";
        } else {
            greeting = "Nice work! Here is your coach takeaway: 👍";
        }

        const candidates = [];

        // Condition 0: Extremely short speech
        if (isVeryShort) {
            candidates.push({
                priority: 100,
                type: "short_speech",
                title: "Speech was a bit too brief",
                plainExplanation: `You spoke ${wordCount} word${wordCount === 1 ? '' : 's'} (${durationSeconds}s). To help your coach give accurate feedback, try sharing a few full sentences.`,
                evidence: `${wordCount} words detected in ${durationSeconds} seconds`,
                tip: "State your main thought, add a quick reason why, and wrap it up.",
                drill: {
                    id: "drill-warmup",
                    type: "warmup",
                    title: "30-Second Warmup Challenge",
                    duration: 30,
                    goal: "Speak for 30 seconds in 3-4 complete sentences",
                    instructions: "Pick one clear thought on this topic and explain it with a reason without stopping early.",
                    focus: "Continuous speaking confidence"
                }
            });
        }

        // Condition 1: Filler Words
        if (totalFillerCount >= 4 || (fillerPercentage >= 4.0 && totalFillerCount >= 2)) {
            const topWords = (fillerWordsList || []).slice(0, 3).map(f => `"${f.word}" (${f.count}x)`).join(', ');
            const priority = totalFillerCount >= 6 ? 90 : 78;
            candidates.push({
                priority,
                type: "fillers",
                title: "Frequent filler words",
                plainExplanation: `You used filler words ${totalFillerCount} times (${topWords}) while searching for your next thought.`,
                evidence: `${totalFillerCount} filler words detected (${topWords})`,
                tip: "Embrace silent pauses. When thinking between ideas, take a quiet 1-second breath instead of saying 'um' or 'basically'.",
                drill: {
                    id: "drill-fillers",
                    type: "fillers",
                    title: "30-Second Zero-Filler Challenge",
                    duration: 30,
                    goal: "Speak for 30 seconds with 0 filler words",
                    instructions: "Answer the prompt. Whenever you pause to think, stay completely silent for one second instead of saying 'um' or 'like'.",
                    focus: "Silent pauses instead of filler sounds"
                }
            });
        }

        // Condition 2: Speaking Too Fast (>155 WPM)
        if (wpm > 155 && wordCount >= 20) {
            const priority = wpm > 175 ? 85 : 72;
            candidates.push({
                priority,
                type: "fast_pace",
                title: "Speaking a little too quickly",
                plainExplanation: `You spoke at ${wpm} words per minute when explaining your points. When speaking too fast, listeners have less time to absorb your ideas.`,
                evidence: `${wpm} WPM (comfortable conversational rhythm is 110–145 WPM)`,
                tip: "Take a relaxed breath after each sentence to let your ideas land before starting your next thought.",
                drill: {
                    id: "drill-controlled-pacing",
                    type: "fast_pace",
                    title: "Controlled-Pacing Challenge",
                    duration: 45,
                    goal: "Slow your pace to a comfortable 120–140 words per minute",
                    instructions: "Speak in a calm, measured rhythm. Deliberately pause for one full breath after every sentence.",
                    focus: "Deliberate cadence and clear listener pauses"
                }
            });
        }

        // Condition 3: Speaking Too Slow / Hesitant (<95 WPM)
        if (wpm < 95 && wordCount >= 10 && durationSeconds >= 15) {
            candidates.push({
                priority: 66,
                type: "slow_pace",
                title: "Hesitations slowing your flow",
                plainExplanation: `Your speaking pace was ${wpm} words per minute with long stops between thoughts.`,
                evidence: `${wpm} WPM (target is 110–145 WPM)`,
                tip: "Trust your first thought and keep sentences moving forward without worrying about perfection.",
                drill: {
                    id: "drill-momentum",
                    type: "slow_pace",
                    title: "Smooth Momentum Challenge",
                    duration: 45,
                    goal: "Keep sentences flowing steadily without long stops",
                    instructions: "Focus on continuous speech momentum. Connect your thoughts without second-guessing yourself.",
                    focus: "Conversational flow and momentum"
                }
            });
        }

        // Condition 4: Weak Structure / Missing Reasoning or Examples
        if ((prepMarkersFound < 2 || (!structureEvidence?.hasReason && !structureEvidence?.hasExample)) && wordCount >= 25) {
            candidates.push({
                priority: 68,
                type: "weak_structure",
                title: "Needs clearer structure",
                plainExplanation: "You expressed your main point, but didn't support it with an explicit reason (e.g. 'because...') or a concrete example (e.g. 'for example...').",
                evidence: "Missing explicit reason ('because...') or example ('for instance...') connectors",
                tip: "Use the PREP structure: State your Point, give a Reason, share a real Example, and restate your Point.",
                drill: {
                    id: "drill-prep-structure",
                    type: "weak_structure",
                    title: "PREP-Based Response Challenge",
                    duration: 60,
                    goal: "Structure your response in 4 clear parts (Point ➔ Reason ➔ Example ➔ Point)",
                    instructions: "Spend 15s on your Point, 15s on your Reason ('because...'), 15s on an Example ('for instance...'), and 15s wrapping it up.",
                    focus: "Clear idea progression from point to proof"
                }
            });
        }

        // Condition 5: Weak or Abrupt Conclusion
        if (!structureEvidence?.hasPointConclusion && wordCount >= 35 && sentenceCount >= 3) {
            candidates.push({
                priority: 63,
                type: "weak_conclusion",
                title: "Abrupt or missing conclusion",
                plainExplanation: "You shared good ideas, but your answer stopped abruptly without a concluding sentence to tie everything together.",
                evidence: "Speech ended after an explanation without a final takeaway sentence",
                tip: "Always close with a definitive sentence starting with 'That is why...' or 'In conclusion...' so your listener knows you've finished.",
                drill: {
                    id: "drill-strong-conclusion",
                    type: "weak_conclusion",
                    title: "Strong Conclusion Challenge",
                    duration: 45,
                    goal: "Practice ending your answer with a definitive, memorable closing sentence",
                    instructions: "Speak for 45 seconds on this prompt, making sure your final sentence clearly summarizes your main argument.",
                    focus: "Confident, clean finish"
                }
            });
        }

        // Condition 6: Vocabulary Repetition
        if ((repeatedWords && repeatedWords.length >= 2) || (repeatedWords && repeatedWords.length >= 1 && repeatedWords[0].count >= 3)) {
            const topRep = repeatedWords[0];
            const syns = (VOCAB_UPGRADE_DICTIONARY[topRep.word.toLowerCase()]?.alternatives || ['effective', 'notable', 'meaningful']).slice(0, 3).join(', ');
            candidates.push({
                priority: 56,
                type: "repetitive_vocab",
                title: "Repeated word choices",
                plainExplanation: `You repeated the word "${topRep.word}" ${topRep.count} times. Swapping in varied words makes your speech sound much more natural.`,
                evidence: `Repeated "${topRep.word}" ${topRep.count} times`,
                tip: `Try alternating with words like ${syns} to add natural color to your ideas.`,
                drill: {
                    id: "drill-vocab-variety",
                    type: "repetitive_vocab",
                    title: "Natural Vocabulary Variation Drill",
                    duration: 45,
                    goal: "Express your point using varied, natural vocabulary",
                    instructions: `Answer this prompt without repeating "${topRep.word}". Challenge yourself to use 2 different descriptive words.`,
                    focus: "Natural vocabulary diversity"
                }
            });
        }

        // Condition 7: Grammar Correction
        if (grammarCorrections && grammarCorrections.length >= 1) {
            const gc = grammarCorrections[0];
            candidates.push({
                priority: 59,
                type: "grammar",
                title: "Grammar adjustment",
                plainExplanation: `A quick grammar polish: you said "${gc.original}" instead of "${gc.correction}".`,
                evidence: `"${gc.original}" ➔ "${gc.correction}" (${gc.rule})`,
                tip: gc.explanation || 'Practice repeating the corrected sentence out loud so it sounds natural.',
                drill: {
                    id: "drill-grammar-polish",
                    type: "grammar",
                    title: "Clean Phrasing Challenge",
                    duration: 30,
                    goal: "Practice speaking the corrected phrase smoothly",
                    instructions: `Deliver a short 30-second response incorporating the phrasing "${gc.correction}".`,
                    focus: "Clean, natural grammar"
                }
            });
        }

        // Sort candidates by priority descending
        candidates.sort((a, b) => b.priority - a.priority);

        let primaryWeakness = null;
        let secondaryWeakness = null;

        if (candidates.length > 0) {
            primaryWeakness = candidates[0];
            if (candidates.length > 1) {
                secondaryWeakness = candidates[1];
            }
        } else {
            // High performing speech!
            primaryWeakness = {
                priority: 10,
                type: "flow_polish",
                title: "Subtle pause for emphasis",
                plainExplanation: "Your delivery was clear, balanced, and confident! To make your speaking even more compelling, practice adding an intentional 1-second pause right before your biggest point.",
                evidence: `Pacing (${wpm} WPM) and speech hygiene were right on target`,
                tip: "Use strategic pauses right before your key message to build listener focus.",
                drill: {
                    id: "drill-emphasis",
                    type: "flow_polish",
                    title: "Expressive Emphasis Challenge",
                    duration: 45,
                    goal: "Practice pausing right before your main takeaway",
                    instructions: "Deliver your thoughts, deliberately pausing for one full second before delivering your central punchline.",
                    focus: "Vocal presence and impact"
                }
            };
        }

        // Select 1-2 genuine strengths
        const coachStrengths = [];
        if (wpm >= 105 && wpm <= 150) coachStrengths.push(`Smooth, natural speaking pace (${wpm} WPM)`);
        if (totalFillerCount === 0 && wordCount >= 15) coachStrengths.push("Clean speech hygiene: zero filler words detected!");
        else if (totalFillerCount <= 2 && wordCount >= 15) coachStrengths.push("Crisp delivery with minimal filler words");
        if (grammarCorrections.length === 0 && wordCount >= 15) coachStrengths.push("Accurate, natural sentence structure");
        if (prepMarkersFound >= 2) coachStrengths.push("Logical thought progression with clear transition signposts");
        if (lexicalVariety >= 55) coachStrengths.push("Good vocabulary variety and natural phrasing");
        if (coachStrengths.length === 0) coachStrengths.push("Clear verbal output with identifiable core message");

        return {
            greeting,
            primaryWeakness,
            secondaryWeakness: secondaryWeakness ? {
                title: secondaryWeakness.title,
                plainExplanation: secondaryWeakness.plainExplanation,
                tip: secondaryWeakness.tip
            } : null,
            strengths: coachStrengths.slice(0, 2),
            drill: primaryWeakness.drill
        };
    }

    function createEmptyDiagnosticsState(message = "Not analyzed yet. Complete a speaking session to see your results.") {
        return {
            overallScore: 0,
            fluencyScore: 0,
            fluencyScore10: 0,
            grammarScore: 0,
            grammarScore10: 0,
            vocabularyScore: 0,
            vocabularyScore10: 0,
            structureScore: 0,
            structureScore10: 0,
            coherenceScore: 0,
            wpm: 0,
            paceStatus: "Not recorded",
            wordCount: 0,
            durationSeconds: 0,
            sentenceCount: 0,
            avgSentenceLength: 0,
            shortSentenceCount: 0,
            longSentenceCount: 0,
            fillerCount: 0,
            fillerPercentage: 0,
            fillerWords: [],
            lexicalVariety: 0,
            repeatedWords: [],
            strengths: [],
            top3Improvements: [],
            grammarCorrections: [],
            vocabularyImprovements: [],
            structureEvidence: { hasPoint: false, hasReason: false, hasExample: false, hasPointConclusion: false },
            prepMarkersFound: 0,
            rephrasings: { natural: "", professional: "" },
            nextStep: message,
            coachInsights: null,
            primaryWeakness: null,
            secondaryWeakness: null,
            coachStrengths: [],
            drill: null,
            coachGreeting: "Welcome to Speech Coach! Click Start Speaking whenever you're ready.",
            isAnalyzed: false
        };
    }

    return {
        analyzeSpeech,
        identifyCoachingInsights,
        createEmptyDiagnosticsState,
        UNCONDITIONAL_FILLERS,
        VOCAB_UPGRADE_DICTIONARY,
        GRAMMAR_RULES,
        PREP_MARKERS,
        TRANSITION_WORDS
    };
}));
