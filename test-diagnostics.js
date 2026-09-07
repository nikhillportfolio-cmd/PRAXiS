/**
 * Automated Test Suite for PRAXiS Speech Diagnostics Engine
 */

const assert = require('assert');
const TranscriptProcessor = require('./public/js/transcriptProcessor');
const SpeechDiagnostics = require('./public/js/speechDiagnostics');

console.log("==================================================");
console.log("🧪 STARTING PRAXiS SPEECH DIAGNOSTICS TEST SUITE");
console.log("==================================================\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
    total++;
    try {
        fn();
        console.log(`✅ [PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${name}`);
        console.error(`   Error: ${err.message}`);
    }
}

// -----------------------------------------------------------------------------
// TEST 1: Normal 45-second speech with PREP structure
// -----------------------------------------------------------------------------
runTest("TEST 1: Normal speech analysis (PREP structure, pacing, vocabulary)", () => {
    const transcript = "I believe that remote work provides great flexibility for modern engineering teams. The primary reason is because developers can focus deeply without office interruptions. For example, during our last sprint, our team completed the migration two days ahead of schedule while working remotely. Therefore, hybrid models represent the most sustainable future.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 45,
        topic: "Remote Work",
        targetStructure: "PREP"
    });

    assert.ok(result.isAnalyzed, "Must be analyzed");
    assert.ok(result.wordCount > 40, `Word count should be > 40, got ${result.wordCount}`);
    assert.ok(result.wpm >= 60 && result.wpm <= 120, `WPM should be reasonable (60-120), got ${result.wpm}`);
    assert.strictEqual(result.fillerCount, 0, "No fillers in this clean transcript");
    assert.ok(result.structureEvidence.hasPoint, "Should detect Point indicator ('I believe')");
    assert.ok(result.structureEvidence.hasReason, "Should detect Reason indicator ('because')");
    assert.ok(result.structureEvidence.hasExample, "Should detect Example indicator ('For example')");
    assert.ok(result.structureEvidence.hasPointConclusion, "Should detect Conclusion indicator ('Therefore')");
    assert.ok(result.overallScore >= 70, `Overall score should be solid (>70), got ${result.overallScore}`);
    assert.ok(result.strengths.length > 0, "Should generate strengths");
    assert.ok(result.top3Improvements.length === 3, "Should generate top 3 improvements");
});

// -----------------------------------------------------------------------------
// TEST 2: Very short speech (1-2 seconds)
// -----------------------------------------------------------------------------
runTest("TEST 2: Very short speech handling (1-2 words)", () => {
    const transcript = "Hello there.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 2,
        topic: "Short Test"
    });

    assert.ok(result.isAnalyzed, "Must handle without throwing");
    assert.strictEqual(result.wordCount, 2, "Word count should be 2");
    assert.ok(result.overallScore <= 45, "Very short speech must not receive inflated score");
    assert.ok(result.nextStep.includes("very short"), "Next step should warn about very short speech");
});

// -----------------------------------------------------------------------------
// TEST 3: Empty speech / No speech
// -----------------------------------------------------------------------------
runTest("TEST 3: No speech / Empty transcript", () => {
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript: "   ",
        duration: 30
    });

    assert.strictEqual(result.isAnalyzed, false, "Empty speech should not be marked as analyzed");
    assert.strictEqual(result.overallScore, 0, "Empty speech must score 0");
    assert.strictEqual(result.wpm, 0, "WPM must be 0");
    assert.strictEqual(result.wordCount, 0, "Word count must be 0");
    assert.ok(result.nextStep.includes("No speech"), "Should advise user to speak");
});

// -----------------------------------------------------------------------------
// TEST 4: Repeated filler words detection
// -----------------------------------------------------------------------------
runTest("TEST 4: Filler word detection and percentage calculation", () => {
    const transcript = "Um, I think that, uh, basically we need to, like, actually fix this problem, you know, because it is, um, really bad.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 30
    });

    assert.ok(result.fillerCount >= 5, `Should detect at least 5 fillers, detected ${result.fillerCount}`);
    assert.ok(result.fillerPercentage > 15, `Filler percentage should be > 15%, got ${result.fillerPercentage}%`);
    assert.ok(result.fillerWords.some(f => f.word.toLowerCase() === 'um'), "Must list 'um'");
    assert.ok(result.fillerWords.some(f => f.word.toLowerCase() === 'basically'), "Must list 'basically'");
    assert.ok(result.fluencyScore < 80, `Fluency score should be penalized for high fillers, got ${result.fluencyScore}`);
});

// -----------------------------------------------------------------------------
// TEST 5: Context-aware "like" handling (non-filler vs filler)
// -----------------------------------------------------------------------------
runTest("TEST 5: Context-aware 'like' (Verb 'I like' is NOT filler)", () => {
    const transcript = "I like swimming and I like reading books every weekend.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 15
    });

    assert.strictEqual(result.fillerCount, 0, "'I like swimming' should NOT be counted as a filler word");
});

// -----------------------------------------------------------------------------
// TEST 6: Repeated vocabulary detection
// -----------------------------------------------------------------------------
runTest("TEST 6: Lexical repetition detection", () => {
    const transcript = "This project is good. The good team made good decisions because good outcomes are good for good clients.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 20
    });

    assert.ok(result.repeatedWords.length > 0, "Should detect repeated content words");
    assert.strictEqual(result.repeatedWords[0].word, "good", "Should identify 'good' as over-repeated");
    assert.ok(result.repeatedWords[0].count >= 4, `Count should be >= 4, got ${result.repeatedWords[0].count}`);
});

// -----------------------------------------------------------------------------
// TEST 7: Grammar rule corrections
// -----------------------------------------------------------------------------
runTest("TEST 7: Rule-based grammar error detection & correction", () => {
    const transcript = "Yesterday I go to the office and he don't understand that I am student. We didn't went to the meeting because I am agree with him.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 30
    });

    assert.ok(result.grammarCorrections.length >= 4, `Should catch at least 4 grammar errors, found ${result.grammarCorrections.length}`);
    
    // Check specific rule categories
    const categories = result.grammarCorrections.map(c => c.rule);
    assert.ok(categories.includes("Subject-Verb Agreement") || categories.includes("Auxiliary & Modals"), "Should detect 'he don't'");
    assert.ok(categories.includes("Tense & Aspect"), "Should detect 'didn't went' / past tense error");
    assert.ok(categories.includes("Articles & Determiners"), "Should detect 'I am student'");
    assert.ok(categories.includes("Phrasing & Word Order"), "Should detect 'I am agree'");

    assert.ok(result.grammarScore < 70, `Grammar score should reflect multiple errors, got ${result.grammarScore}`);
});

// -----------------------------------------------------------------------------
// TEST 8: Vocabulary precision upgrades
// -----------------------------------------------------------------------------
runTest("TEST 8: Vocabulary precision upgrades & dictionary suggestions", () => {
    const transcript = "We have a big problem and need to make a good plan to help our team.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 20
    });

    assert.ok(result.vocabularyImprovements.length >= 3, `Should find upgrades for big, problem, good, help, found ${result.vocabularyImprovements.length}`);
    assert.ok(result.rephrasings.professional.length > 0, "Should generate professional rephrasing");
});

// -----------------------------------------------------------------------------
// TEST 9: HTML transcript annotation
// -----------------------------------------------------------------------------
runTest("TEST 9: TranscriptProcessor annotated HTML generation", () => {
    const transcript = "Um, for example, we feel like this is important.";
    const html = TranscriptProcessor.generateAnnotatedTranscript(transcript);

    assert.ok(html.includes('class="highlight-filler"'), "Must highlight filler 'um'");
    assert.ok(html.includes('class="highlight-hedging"'), "Must highlight hedging 'feel like'");
    assert.ok(html.includes('border-blue-400'), "Must highlight transition 'for example'");
});

// -----------------------------------------------------------------------------
// TEST 10: Coaching Intelligence - Filler words prioritization & drill
// -----------------------------------------------------------------------------
runTest("TEST 10: Coaching Intelligence - Filler words prioritization & drill", () => {
    const transcript = "Um, basically, uh, we need to, like, consider the project timeline, you know, because um we have deadlines.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 30,
        topic: "Deadlines"
    });

    assert.ok(result.coachInsights, "Must generate coachInsights");
    assert.ok(result.primaryWeakness, "Must identify primary weakness");
    assert.strictEqual(result.primaryWeakness.type, "fillers", "Primary weakness should be fillers");
    assert.ok(result.primaryWeakness.plainExplanation.includes("filler words"), "Must explain in plain language");
    assert.ok(result.drill, "Must generate a targeted drill");
    assert.strictEqual(result.drill.id, "drill-fillers", "Targeted drill should be drill-fillers");
    assert.strictEqual(result.drill.duration, 30, "Drill duration should be 30 seconds");
    assert.ok(result.coachStrengths.length > 0, "Must include genuine strengths");
});

// -----------------------------------------------------------------------------
// TEST 11: Coaching Intelligence - Fast pacing prioritization & drill
// -----------------------------------------------------------------------------
runTest("TEST 11: Coaching Intelligence - Fast pacing prioritization & drill", () => {
    // 60 words spoken in 15 seconds = 240 WPM (very fast pace)
    const transcript = "In this fast paced environment we must ship features quickly without delays or hesitations because modern customers demand instantaneous results and our competitors are moving at a rapid clip every single week so we cannot afford any downtime or slow decision making processes.";
    const result = SpeechDiagnostics.analyzeSpeech({
        transcript,
        duration: 15,
        topic: "Speed in Tech"
    });

    assert.ok(result.wpm > 155, `WPM should be fast, got ${result.wpm}`);
    assert.ok(result.primaryWeakness, "Must identify primary weakness");
    assert.strictEqual(result.primaryWeakness.type, "fast_pace", "Primary weakness should be fast_pace");
    assert.strictEqual(result.drill.id, "drill-controlled-pacing", "Targeted drill should be controlled pacing");
    assert.ok(result.drill.instructions.includes("calm, measured rhythm"), "Drill should have actionable instructions");
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n==================================================");
console.log(`📊 TEST SUITE COMPLETE: ${passed} / ${total} TESTS PASSED`);
console.log("==================================================");

if (passed === total) {
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
} else {
    console.error(`💥 ${total - passed} TESTS FAILED.`);
    process.exit(1);
}
