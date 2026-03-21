#!/usr/bin/env node
/**
 * audio-software-parallel.mjs
 *
 * CLI that runs an audio FX chain and a software architecture chain side-by-side,
 * collects metrics per stage, and optionally generates an HTML visualization.
 *
 * Usage:
 *   node scripts/audio-software-parallel.mjs run [--runs N]
 *   node scripts/audio-software-parallel.mjs html
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "audio-parallel");
const RUNS_FILE = join(DATA_DIR, "runs.json");

// ═══════════════════════════════════════════════════════════════════════════
// LFO — ported from torvalds/GuitarPedal RP2354A/src/lfo.h (GPL-2.0)
//
// Linus's original uses a 30-bit quarter-cycle index with overflow into
// four quadrants [0..1, 1..0, 0..-1, -1..0]. The step size controls
// frequency: lfo_step = freq * (2^32 / SAMPLES_PER_SEC).
//
// We port lfo_step() and set_lfo_ms() into JS-float equivalents,
// preserving the quarter-cycle architecture and the three waveform types.
//
// Source: https://github.com/torvalds/GuitarPedal/blob/main/RP2354A/src/lfo.h
// ═══════════════════════════════════════════════════════════════════════════

const SAMPLES_PER_SEC = 48000;
const TWO_POW_32 = 2 ** 32;
const F_STEP = TWO_POW_32 / SAMPLES_PER_SEC;

// Quarter sine table (256 entries, 0..π/2)
const QUARTER_SINE = Array.from({ length: 257 }, (_, i) => Math.sin((i / 256) * Math.PI / 2));

const LFO_TYPE = { sinewave: 0, triangle: 1, sawtooth: 2 };

function lfoCreate(freqHz = 1.0) {
    return { idx: 0, step: Math.round(freqHz * F_STEP) };
}

function lfoSetMs(lfo, ms) {
    if (ms < 0.1) ms = 0.1;  // max 10kHz — same guard as Linus's original
    lfo.step = Math.round(1000 * F_STEP / ms);
}

function lfoSetFreq(lfo, freq) {
    lfo.step = Math.round(freq * F_STEP);
}

/**
 * Advance the LFO by one sample and return the current value (-1..1).
 *
 * Ported from Linus's lfo_step(): uses quarter-cycle decomposition
 * with the two high bits selecting the quadrant, then either
 * interpolated sine table lookup or linear ramp for triangle/sawtooth.
 */
function lfoStep(lfo, type = LFO_TYPE.sinewave) {
    const now = lfo.idx >>> 0;        // unsigned 32-bit
    lfo.idx = (now + lfo.step) >>> 0;

    if (type === LFO_TYPE.sawtooth) {
        return now / TWO_POW_32;         // 0..1 sawtooth
    }

    const quarter = (now >>> 30) & 3;
    let phase = (now << 2) >>> 0;      // remove quarter bits

    // Second and fourth quarter: reverse direction
    if (quarter & 1) phase = (~phase) >>> 0;

    let val;
    if (type === LFO_TYPE.sinewave) {
        const idx = (phase >>> (32 - 8)) & 0xFF;  // 256-entry table
        const a = QUARTER_SINE[idx];
        const b = QUARTER_SINE[idx + 1];
        const frac = ((phase << 8) >>> 0) / TWO_POW_32;
        val = a + (b - a) * frac;                  // linear interpolation
    } else {
        val = phase / TWO_POW_32;                  // triangle
    }

    // Last two quarters are negative
    if (quarter & 2) val = -val;
    return val;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO FX CHAIN — modeled as gain/frequency/time transforms on a signal
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Signal representation:
 *   peak     — current peak amplitude (dBFS)
 *   rms      — average loudness (dBFS)
 *   freqLow  — energy below 100 Hz (0-1)
 *   freqMid  — energy 100 Hz – 5 kHz (0-1)
 *   freqHigh — energy above 5 kHz (0-1)
 *   transient — transient sharpness (0-1)
 *   wet      — reverb/delay tail level (0-1)
 *   width    — stereo width (0-1)
 */
function freshSignal() {
    return {
        peak: -3.0 + (Math.random() * 6 - 3),       // -6 to 0 dBFS
        rms: -14.0 + (Math.random() * 4 - 2),        // -16 to -12 dBFS
        freqLow: 0.3 + Math.random() * 0.3,          // sub/bass energy
        freqMid: 0.5 + Math.random() * 0.2,          // midrange
        freqHigh: 0.4 + Math.random() * 0.2,         // air/presence
        transient: 0.6 + Math.random() * 0.3,        // attack sharpness
        wet: 0.0,                                     // no FX tail yet
        width: 0.5 + Math.random() * 0.2,            // stereo field
    };
}

// ── Channel Strip ──────────────────────────────────────────────────────────

function compressor(sig, { threshold = -18, ratio = 4, attack = 10, release = 100 } = {}) {
    const over = Math.max(0, sig.rms - threshold);
    const reduction = over * (1 - 1 / ratio);
    return {
        ...sig,
        peak: sig.peak - reduction * 0.8,
        rms: sig.rms - reduction,
        transient: sig.transient * (1 - reduction * 0.015),  // soft transient taming
        _meta: { name: "Compressor", reduction: +reduction.toFixed(2), ratio, threshold },
    };
}

function eq(sig, {
    hpf = 20,      // Hz — cut below this
    lpf = 17500,   // Hz — tame above this
    midCut = -3,   // dB cut in 800-3k spike zone
} = {}) {
    // HPF: reduce sub energy proportional to how high the cutoff is
    const subReduction = Math.min(1, hpf / 80);
    // LPF: reduce high energy proportional to how low the cutoff is
    const airReduction = Math.max(0, 1 - lpf / 20000) * 0.6;
    // Mid scoop
    const midFactor = Math.pow(10, midCut / 20);

    return {
        ...sig,
        freqLow: sig.freqLow * (1 - subReduction * 0.7),
        freqMid: sig.freqMid * midFactor,
        freqHigh: sig.freqHigh * (1 - airReduction),
        rms: sig.rms + midCut * 0.1,  // slight overall level shift
        _meta: { name: "EQ", hpf, lpf, midCut, subReduction: +subReduction.toFixed(2) },
    };
}

function reverb(sig, {
    size = 0.25,     // room size 0-1 (small)
    dryWet = 0.35,   // moderate mix
    damping = 0.6,   // salt to taste
    predelay = 15,    // ms
} = {}) {
    const tailLevel = size * dryWet * (1 - damping * 0.5);
    return {
        ...sig,
        wet: sig.wet + tailLevel,
        width: Math.min(1, sig.width + size * 0.15),
        freqHigh: sig.freqHigh * (1 - damping * 0.2),  // damping eats highs
        rms: sig.rms + tailLevel * 2,                    // reverb adds perceived loudness
        _meta: { name: "Reverb", size, dryWet, damping, predelay, tailLevel: +tailLevel.toFixed(3) },
    };
}

// ── Master Bus ─────────────────────────────────────────────────────────────

function masterCompressor(sig) {
    return compressor(sig, { threshold: -12, ratio: 2.5, attack: 30, release: 200 });
}

function transientShaper(sig, { attack = 0.3, sustain = -0.1 } = {}) {
    return {
        ...sig,
        transient: Math.min(1, sig.transient * (1 + attack)),
        rms: sig.rms + sustain,
        _meta: { name: "Transient Shaper", attack, sustain },
    };
}

function dynamicsShaper(sig, { expand = 1.2, gate = -50 } = {}) {
    const gated = sig.rms < gate;
    return {
        ...sig,
        rms: gated ? -Infinity : sig.rms * expand / expand,  // expand then normalize
        peak: gated ? -Infinity : sig.peak,
        _meta: { name: "Dynamics Shaper", expand, gate, gated },
    };
}

function limiter(sig, { ceiling = -0.3 } = {}) {
    const clipped = Math.max(0, sig.peak - ceiling);
    return {
        ...sig,
        peak: Math.min(sig.peak, ceiling),
        rms: sig.rms + clipped * 0.2,   // limiting pushes RMS up
        transient: sig.transient * (1 - clipped * 0.05),
        _meta: { name: "Limiter", ceiling, clipped: +clipped.toFixed(2) },
    };
}

// ── Placeholders (for Linus) ───────────────────────────────────────────────
// Each placeholder carries an LFO instance from the ported lfo.h code.
// Knobs at zero = bypass. When activated, the LFO modulates the effect
// parameter, exactly as Linus's flanger.h and phaser.h use lfo_step().

const _distLfo = lfoCreate(2.0);   // 2 Hz tremolo-rate for drive modulation
const _delayLfo = lfoCreate(0.3);  // 0.3 Hz slow sweep for delay time
const _wahLfo = lfoCreate(1.5);    // 1.5 Hz auto-wah sweep

function distortion(sig, { drive = 0, tone = 0.5 } = {}) {
    // When drive > 0: soft-clip with LFO-modulated drive depth
    if (drive > 0) {
        const mod = lfoStep(_distLfo, LFO_TYPE.sinewave);
        const effectiveDrive = drive * (1 + mod * 0.3);  // ±30% modulation
        const saturation = Math.tanh(effectiveDrive * sig.peak / -3);
        return {
            ...sig,
            peak: sig.peak * (1 - effectiveDrive * 0.1),
            freqMid: Math.min(1, sig.freqMid + effectiveDrive * 0.15),
            transient: sig.transient * (1 + effectiveDrive * 0.1),
            _meta: { name: "🎸 Distortion", drive: +effectiveDrive.toFixed(2), tone, mod: +mod.toFixed(3), active: true },
        };
    }
    return { ...sig, _meta: { name: "🎸 Distortion [BYPASS]", drive, tone, lfoFreq: "2Hz", active: false } };
}

function delay(sig, { time = 0, feedback = 0, mix = 0 } = {}) {
    // When mix > 0: add wet signal with LFO-modulated delay time (chorus territory)
    if (mix > 0) {
        const mod = lfoStep(_delayLfo, LFO_TYPE.triangle);
        const effectiveTime = time * (1 + mod * 0.2);  // ±20% time wobble
        const wetLevel = mix * feedback * 0.5;
        return {
            ...sig,
            wet: sig.wet + wetLevel,
            width: Math.min(1, sig.width + mix * 0.1),
            rms: sig.rms + wetLevel * 1.5,
            _meta: { name: "🎸 Delay", time: +effectiveTime.toFixed(1), feedback, mix, mod: +mod.toFixed(3), active: true },
        };
    }
    return { ...sig, _meta: { name: "🎸 Delay [BYPASS]", time, feedback, mix, lfoFreq: "0.3Hz", active: false } };
}

function wah(sig, { position = 0.5, resonance = 0 } = {}) {
    // When resonance > 0: bandpass sweep with LFO as the foot pedal
    if (resonance > 0) {
        const mod = lfoStep(_wahLfo, LFO_TYPE.sawtooth);
        const sweepPos = position + mod * 0.4;  // sweep range
        const boost = resonance * 0.2;
        return {
            ...sig,
            freqMid: Math.min(1, sig.freqMid + boost * sweepPos),
            freqHigh: sig.freqHigh * (1 - resonance * 0.15),
            freqLow: sig.freqLow * (1 - resonance * 0.1),
            _meta: { name: "🎸 Wah", position: +sweepPos.toFixed(2), resonance, mod: +mod.toFixed(3), active: true },
        };
    }
    return { ...sig, _meta: { name: "🎸 Wah [BYPASS]", position, resonance, lfoFreq: "1.5Hz", active: false } };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOFTWARE ARCHITECTURE CHAIN — modeled as transforms on a "request" signal
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request representation:
 *   load       — current request load (0-1)
 *   validity   — data integrity (0-1)
 *   latency    — accumulated latency in ms
 *   errors     — error rate (0-1)
 *   throughput — requests/sec normalized (0-1)
 *   health     — system health (0-1)
 *   sources    — number of data sources mixed
 *   coverage   — how much of the pipeline is exercised (0-1)
 */
function freshRequest() {
    return {
        load: 0.4 + Math.random() * 0.4,
        validity: 0.7 + Math.random() * 0.2,
        latency: 5 + Math.random() * 10,
        errors: 0.05 + Math.random() * 0.1,
        throughput: 0.7 + Math.random() * 0.2,
        health: 0.8 + Math.random() * 0.15,
        sources: 1,
        coverage: 0.1,
    };
}

// ── Input Stage (Channel Strip equivalent) ─────────────────────────────────

function zodValidation(req) {
    // Gain staging: validate + normalize at boundary
    const rejected = req.validity < 0.5 ? 0.1 : 0;
    return {
        ...req,
        validity: Math.min(1, req.validity * 1.3),   // validated data is more trustworthy
        errors: req.errors - rejected,
        latency: req.latency + 2,                     // parse cost
        coverage: req.coverage + 0.1,
        _meta: { name: "Zod Validation (≈ Gain Staging)", rejected: +rejected.toFixed(2), audio: "EQ/Compressor" },
    };
}

function pipeline(req) {
    // Sequential transform — like signal chain
    const stages = 8;
    const perStageCost = 3 + Math.random() * 2;
    return {
        ...req,
        latency: req.latency + stages * perStageCost,
        coverage: req.coverage + 0.2,
        throughput: req.throughput * 0.95,  // pipeline overhead
        _meta: { name: "Pipeline (≈ Signal Chain)", stages, perStageCost: +perStageCost.toFixed(1), audio: "Signal Chain" },
    };
}

function healthFeedback(req) {
    // Feedback loop: health adjusts behavior
    const adjustment = req.health > 0.9 ? 0.05 : req.health < 0.5 ? -0.15 : 0;
    return {
        ...req,
        throughput: Math.max(0.1, req.throughput + adjustment),
        health: req.health + (req.errors < 0.05 ? 0.02 : -0.03),
        coverage: req.coverage + 0.1,
        _meta: { name: "Health Feedback (≈ Feedback Loop)", adjustment: +adjustment.toFixed(2), audio: "Reverb/Sidechain" },
    };
}

// ── Master Bus (system-level processing) ───────────────────────────────────

function rateLimiter(req, { burstSize = 10, tokensPerSec = 5 } = {}) {
    // Token bucket: compress traffic above threshold
    const overload = Math.max(0, req.load - 0.7);
    const throttled = overload * 0.6;
    return {
        ...req,
        load: req.load - throttled,
        throughput: req.throughput * (1 - throttled * 0.3),
        latency: req.latency + throttled * 50,  // queuing adds latency
        coverage: req.coverage + 0.1,
        _meta: { name: "Rate Limiter (≈ Master Compressor)", burstSize, throttled: +throttled.toFixed(3), audio: "Compressor" },
    };
}

function circuitBreaker(req, { failureThreshold = 5 } = {}) {
    // Binary trip: like a limiter's hard ceiling
    const tripped = req.errors > 0.15;
    return {
        ...req,
        errors: tripped ? 0 : req.errors,                       // trip stops errors propagating
        throughput: tripped ? req.throughput * 0.1 : req.throughput,  // but kills throughput
        health: tripped ? req.health - 0.2 : req.health,
        coverage: req.coverage + 0.1,
        _meta: { name: "Circuit Breaker (≈ Limiter)", tripped, threshold: failureThreshold, audio: "Limiter" },
    };
}

function dataContracts(req) {
    // Impedance matching: enforce interface contracts
    return {
        ...req,
        validity: Math.min(1, req.validity + 0.1),
        errors: Math.max(0, req.errors - 0.02),
        coverage: req.coverage + 0.1,
        _meta: { name: "Data Contracts (≈ Impedance Matching)", audio: "Interface Contract" },
    };
}

function aggregation(req, { sourceCount = 5 } = {}) {
    // Mixing bus: combine multiple sources
    const mixCost = sourceCount * 4;
    return {
        ...req,
        sources: sourceCount,
        latency: req.latency + mixCost,
        throughput: req.throughput * 0.9,  // fan-out cost
        coverage: Math.min(1, req.coverage + 0.2),
        _meta: { name: "Aggregation (≈ Mixing Bus)", sourceCount, mixCost, audio: "Mixer" },
    };
}

// ── Placeholders (for Linus) ───────────────────────────────────────────────

function chaosInjection(req) {
    return { ...req, _meta: { name: "🎸 Chaos Injection [PLACEHOLDER]", active: false, audio: "Distortion" } };
}

function retryQueue(req) {
    return { ...req, _meta: { name: "🎸 Retry Queue [PLACEHOLDER]", active: false, audio: "Delay" } };
}

function adaptiveRouting(req) {
    return { ...req, _meta: { name: "🎸 Adaptive Routing [PLACEHOLDER]", active: false, audio: "Wah" } };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const audioChain = {
    name: "Audio FX Chain",
    channel: [
        { fn: compressor, label: "Channel Compressor" },
        { fn: eq, label: "EQ (HPF 20Hz / LPF 17.5kHz / Mid scoop)" },
        { fn: reverb, label: "Reverb (Small room / Moderate wet / Damped)" },
    ],
    master: [
        { fn: masterCompressor, label: "Master Compressor" },
        { fn: transientShaper, label: "Transient Shaper" },
        { fn: dynamicsShaper, label: "Dynamics Shaper" },
        { fn: limiter, label: "Limiter (ceiling -0.3 dBFS)" },
    ],
    placeholders: [
        { fn: distortion, label: "Distortion" },
        { fn: delay, label: "Delay" },
        { fn: wah, label: "Wah" },
    ],
};

const softwareChain = {
    name: "Software Architecture Chain",
    channel: [
        { fn: zodValidation, label: "Zod Validation" },
        { fn: pipeline, label: "Pipeline (8-stage)" },
        { fn: healthFeedback, label: "Health Feedback Loop" },
    ],
    master: [
        { fn: rateLimiter, label: "Rate Limiter (Token Bucket)" },
        { fn: circuitBreaker, label: "Circuit Breaker" },
        { fn: dataContracts, label: "Data Contracts" },
        { fn: aggregation, label: "Aggregation (5 sources)" },
    ],
    placeholders: [
        { fn: chaosInjection, label: "Chaos Injection" },
        { fn: retryQueue, label: "Retry Queue" },
        { fn: adaptiveRouting, label: "Adaptive Routing" },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════════════════

function runChain(chain, signal) {
    const stages = [];
    let current = { ...signal };

    stages.push({ stage: "Input", snapshot: { ...current } });

    for (const { fn, label } of chain.channel) {
        current = fn(current);
        const { _meta, ...snap } = current;
        stages.push({ stage: `[CH] ${label}`, snapshot: { ...snap }, meta: _meta });
    }

    for (const { fn, label } of chain.master) {
        current = fn(current);
        const { _meta, ...snap } = current;
        stages.push({ stage: `[MB] ${label}`, snapshot: { ...snap }, meta: _meta });
    }

    for (const { fn, label } of chain.placeholders) {
        current = fn(current);
        const { _meta, ...snap } = current;
        stages.push({ stage: `[PH] ${label}`, snapshot: { ...snap }, meta: _meta });
    }

    return stages;
}

function runOnce(runIndex) {
    const audioSig = freshSignal();
    const softSig = freshRequest();

    const audioResult = runChain(audioChain, audioSig);
    const softResult = runChain(softwareChain, softSig);

    return {
        run: runIndex,
        timestamp: new Date().toISOString(),
        audio: { input: audioSig, stages: audioResult },
        software: { input: softSig, stages: softResult },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function printStages(label, stages) {
    console.log(`\n  ╔══ ${label} ══╗`);
    for (const s of stages) {
        const snap = s.snapshot;
        const keys = Object.keys(snap);
        const vals = keys.map(k => {
            const v = snap[k];
            return typeof v === "number" ? `${k}:${v.toFixed(2)}` : `${k}:${v}`;
        }).join("  ");
        const marker = s.stage.includes("[PH]") ? " 🎸" : "";
        console.log(`  ├─ ${s.stage}${marker}`);
        console.log(`  │  ${vals}`);
        if (s.meta) {
            const metaStr = Object.entries(s.meta)
                .filter(([k]) => k !== "name")
                .map(([k, v]) => `${k}=${v}`)
                .join(" ");
            console.log(`  │  ⚙ ${metaStr}`);
        }
    }
    console.log(`  ╚${"═".repeat(label.length + 6)}╝`);
}

function cmdRun(numRuns) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

    const allRuns = existsSync(RUNS_FILE) ? JSON.parse(readFileSync(RUNS_FILE, "utf8")) : [];

    for (let i = 0; i < numRuns; i++) {
        const idx = allRuns.length + 1;
        const result = runOnce(idx);
        allRuns.push(result);

        console.log(`\n${"═".repeat(60)}`);
        console.log(`  RUN #${idx}  —  ${result.timestamp}`);
        console.log(`${"═".repeat(60)}`);

        printStages("Audio FX Chain", result.audio.stages);
        printStages("Software Chain", result.software.stages);
    }

    writeFileSync(RUNS_FILE, JSON.stringify(allRuns, null, 2));
    console.log(`\n✓ ${numRuns} run(s) saved → ${RUNS_FILE} (${allRuns.length} total)`);
}

function cmdAnalyze() {
    if (!existsSync(RUNS_FILE)) { console.error("No runs yet. Run: node scripts/audio-software-parallel.mjs run"); process.exit(1); }
    const runs = JSON.parse(readFileSync(RUNS_FILE, "utf8"));

    console.log(`\n${"═".repeat(60)}`);
    console.log("  TREND ANALYSIS  —  Audio ↔ Software Parallel");
    console.log(`${"═".repeat(60)}\n`);

    // Extract final-stage values across runs
    const audioFinals = runs.map(r => r.audio.stages.at(-4).snapshot);    // last before placeholders
    const softFinals = runs.map(r => r.software.stages.at(-4).snapshot);

    const audioInputs = runs.map(r => r.audio.input);
    const softInputs = runs.map(r => r.software.input);

    // Audio: peak reduction trend
    const peakReductions = runs.map((r, i) => audioInputs[i].peak - audioFinals[i].peak);
    // Software: latency accumulation trend
    const latencyAdded = runs.map((r, i) => softFinals[i].latency - softInputs[i].latency);
    // Audio: RMS change
    const rmsChanges = runs.map((r, i) => audioFinals[i].rms - audioInputs[i].rms);
    // Software: throughput change
    const throughputChanges = runs.map((r, i) => softFinals[i].throughput - softInputs[i].throughput);

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stddev = arr => { const m = avg(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };

    const parallel = [
        { audio: "Peak Reduction (dB)", software: "Latency Added (ms)", audioVals: peakReductions, softVals: latencyAdded },
        { audio: "RMS Change (dB)", software: "Throughput Change", audioVals: rmsChanges, softVals: throughputChanges },
    ];

    for (const p of parallel) {
        console.log(`  ┌─ ${p.audio}  ↔  ${p.software}`);
        console.log(`  │  Audio   avg=${avg(p.audioVals).toFixed(2)}  σ=${stddev(p.audioVals).toFixed(3)}`);
        console.log(`  │  Soft    avg=${avg(p.softVals).toFixed(2)}  σ=${stddev(p.softVals).toFixed(3)}`);

        // Correlation coefficient
        const n = p.audioVals.length;
        const aAvg = avg(p.audioVals), sAvg = avg(p.softVals);
        let num = 0, denA = 0, denS = 0;
        for (let i = 0; i < n; i++) {
            const da = p.audioVals[i] - aAvg, ds = p.softVals[i] - sAvg;
            num += da * ds; denA += da * da; denS += ds * ds;
        }
        const corr = denA && denS ? num / Math.sqrt(denA * denS) : 0;
        console.log(`  │  Correlation: r=${corr.toFixed(3)}  (${Math.abs(corr) > 0.7 ? "STRONG" : Math.abs(corr) > 0.3 ? "MODERATE" : "WEAK"})`);
        console.log(`  └${"─".repeat(50)}\n`);
    }

    // Stage-by-stage parallel mapping
    console.log("  STAGE MAPPING (Audio ↔ Software):\n");
    const audioStageNames = runs[0].audio.stages.map(s => s.stage);
    const softStageNames = runs[0].software.stages.map(s => s.stage);
    const maxLen = Math.max(audioStageNames.length, softStageNames.length);
    for (let i = 0; i < maxLen; i++) {
        const a = audioStageNames[i] || "(none)";
        const s = softStageNames[i] || "(none)";
        console.log(`  ${String(i).padStart(2)}  ${a.padEnd(45)} ↔  ${s}`);
    }

    return { runs, parallel, audioFinals, softFinals, audioInputs, softInputs };
}

function cmdHtml() {
    if (!existsSync(RUNS_FILE)) { console.error("No runs yet."); process.exit(1); }
    const analysis = cmdAnalyze();
    const { runs } = analysis;

    const audioStages = runs[0].audio.stages.map(s => s.stage);
    const softStages = runs[0].software.stages.map(s => s.stage);

    // Prepare chart data
    const chartData = runs.map(r => {
        const aFinal = r.audio.stages.at(-4).snapshot;
        const sFinal = r.software.stages.at(-4).snapshot;
        return {
            run: r.run,
            audioPeak: aFinal.peak,
            audioRms: aFinal.rms,
            audioWet: aFinal.wet,
            softLatency: sFinal.latency,
            softThroughput: sFinal.throughput,
            softHealth: sFinal.health,
            softErrors: sFinal.errors,
        };
    });

    // Per-stage data for both chains (averaged across runs)
    const audioStageData = audioStages.map((name, i) => {
        const snaps = runs.map(r => r.audio.stages[i]?.snapshot).filter(Boolean);
        const avgOf = key => snaps.reduce((s, v) => s + (v[key] || 0), 0) / snaps.length;
        return { name, peak: avgOf("peak"), rms: avgOf("rms"), wet: avgOf("wet"), transient: avgOf("transient") };
    });

    const softStageData = softStages.map((name, i) => {
        const snaps = runs.map(r => r.software.stages[i]?.snapshot).filter(Boolean);
        const avgOf = key => snaps.reduce((s, v) => s + (v[key] || 0), 0) / snaps.length;
        return { name, latency: avgOf("latency"), throughput: avgOf("throughput"), health: avgOf("health"), errors: avgOf("errors") };
    });

    const parallelMap = [
        { audio: "Compressor", software: "Zod Validation", concept: "Gain Staging → Input Normalization" },
        { audio: "EQ", software: "Pipeline", concept: "Freq Shaping → Data Transform" },
        { audio: "Reverb", software: "Health Feedback", concept: "Space/Tail → Feedback Loop" },
        { audio: "Master Compressor", software: "Rate Limiter", concept: "Dynamic Range → Traffic Shaping" },
        { audio: "Transient Shaper", software: "Circuit Breaker", concept: "Attack Control → Failure Threshold" },
        { audio: "Dynamics Shaper", software: "Data Contracts", concept: "Expansion/Gate → Interface Contracts" },
        { audio: "Limiter", software: "Aggregation", concept: "Hard Ceiling → Output Mixing" },
        { audio: "🎸 Distortion", software: "🎸 Chaos Injection", concept: "Harmonic Saturation → Fault Injection" },
        { audio: "🎸 Delay", software: "🎸 Retry Queue", concept: "Time Repeat → Retry with Backoff" },
        { audio: "🎸 Wah", software: "🎸 Adaptive Routing", concept: "Frequency Sweep → Dynamic Routing" },
    ];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Audio ↔ Software Architecture — Parallel Systems</title>
<style>
  :root {
    --bg: #0a0a0f;
    --card: #12121a;
    --border: #1e1e2e;
    --green: #00ff88;
    --blue: #00ccff;
    --purple: #aa66ff;
    --orange: #ff8844;
    --red: #ff4466;
    --yellow: #ffcc00;
    --text: #e0e0e0;
    --muted: #666680;
    --placeholder: #3a3a50;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', 'Fira Code', monospace; padding: 2rem; }
  h1 { font-size: 1.4rem; color: var(--green); margin-bottom: 0.5rem; }
  h2 { font-size: 1.1rem; color: var(--blue); margin: 2rem 0 1rem; }
  h3 { font-size: 0.9rem; color: var(--purple); margin: 1.5rem 0 0.8rem; }
  .subtitle { color: var(--muted); font-size: 0.8rem; margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.2rem; }
  .card.placeholder { border-style: dashed; border-color: var(--placeholder); opacity: 0.65; }
  .card h4 { font-size: 0.85rem; margin-bottom: 0.8rem; }
  .card.audio h4 { color: var(--green); }
  .card.software h4 { color: var(--blue); }
  .card.placeholder h4 { color: var(--yellow); }
  canvas { width: 100%; height: 200px; border-radius: 4px; margin-top: 0.5rem; }
  .parallel-row { display: grid; grid-template-columns: 1fr 180px 1fr; gap: 0.5rem; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
  .parallel-row:last-child { border-bottom: none; }
  .parallel-row .audio-side { text-align: right; color: var(--green); font-size: 0.8rem; }
  .parallel-row .concept { text-align: center; color: var(--purple); font-size: 0.7rem; background: #1a1a2a; border-radius: 4px; padding: 4px 8px; }
  .parallel-row .soft-side { text-align: left; color: var(--blue); font-size: 0.8rem; }
  .parallel-row.placeholder .audio-side, .parallel-row.placeholder .soft-side { color: var(--yellow); }
  .parallel-row.placeholder .concept { background: #2a2a1a; color: var(--yellow); }
  .bar { height: 6px; border-radius: 3px; margin: 2px 0; }
  .bar-label { font-size: 0.65rem; color: var(--muted); display: flex; justify-content: space-between; }
  .stage-list { font-size: 0.75rem; }
  .stage-list .stage { display: flex; align-items: center; gap: 0.5rem; padding: 4px 0; border-bottom: 1px dotted var(--border); }
  .stage .bar-container { flex: 1; }
  .stage .name { min-width: 220px; color: var(--muted); }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; margin-bottom: 1.5rem; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 0.8rem; text-align: center; }
  .stat .value { font-size: 1.3rem; font-weight: bold; }
  .stat .label { font-size: 0.65rem; color: var(--muted); margin-top: 4px; }
  .stat.audio .value { color: var(--green); }
  .stat.software .value { color: var(--blue); }
  .linus-note { background: #1a1a10; border: 1px dashed var(--yellow); border-radius: 8px; padding: 1rem; margin-top: 2rem; font-size: 0.8rem; color: var(--yellow); }
  .linus-note strong { color: var(--orange); }
  .trend-canvas { width: 100%; height: 160px; }
  .footer { margin-top: 3rem; text-align: center; color: var(--muted); font-size: 0.65rem; }
</style>
</head>
<body>

<h1>Audio ↔ Software Architecture — Parallel Systems</h1>
<p class="subtitle">${runs.length} simulation runs · Generated ${new Date().toISOString().slice(0, 16)} · Source: CascadeProjects codebase</p>

<div class="stats">
  <div class="stat audio"><div class="value" id="s-peak-avg">—</div><div class="label">Avg Peak Reduction (dB)</div></div>
  <div class="stat audio"><div class="value" id="s-rms-avg">—</div><div class="label">Avg RMS Δ (dB)</div></div>
  <div class="stat software"><div class="value" id="s-lat-avg">—</div><div class="label">Avg Latency Added (ms)</div></div>
  <div class="stat software"><div class="value" id="s-tp-avg">—</div><div class="label">Avg Throughput Δ</div></div>
</div>

<h2>Signal Flow — Stage by Stage Parallel</h2>
<div class="card" style="margin-bottom: 1.5rem;">
  ${parallelMap.map((p, i) => `
  <div class="parallel-row${p.audio.startsWith("🎸") ? " placeholder" : ""}">
    <div class="audio-side">${p.audio}</div>
    <div class="concept">${p.concept}</div>
    <div class="soft-side">${p.software}</div>
  </div>`).join("")}
</div>

<h2>Chain Processing (Averaged Across Runs)</h2>
<div class="grid">
  <div class="card audio">
    <h4>🎛 Audio FX Chain</h4>
    <div class="stage-list" id="audio-stages"></div>
  </div>
  <div class="card software">
    <h4>⚡ Software Architecture Chain</h4>
    <div class="stage-list" id="software-stages"></div>
  </div>
</div>

<h2>Trend Across Runs</h2>
<div class="grid">
  <div class="card audio">
    <h4>Audio: Peak & RMS</h4>
    <canvas id="chart-audio" class="trend-canvas"></canvas>
  </div>
  <div class="card software">
    <h4>Software: Latency & Throughput</h4>
    <canvas id="chart-software" class="trend-canvas"></canvas>
  </div>
</div>

<div class="linus-note">
  <strong>🎸 Reserved for Linus:</strong> Three placeholder slots are wired but bypassed —
  <strong>Distortion</strong> (↔ Chaos Injection), <strong>Delay</strong> (↔ Retry Queue),
  <strong>Wah</strong> (↔ Adaptive Routing). Knobs at zero. Unhook and crank when ready.
</div>

<div class="footer">
  audio-software-parallel · "The cathedral is a fortress. The bazaar is water."
</div>

<script>
const chartData = ${JSON.stringify(chartData)};
const audioStageData = ${JSON.stringify(audioStageData)};
const softStageData = ${JSON.stringify(softStageData)};

// Stats
const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const peakReds = chartData.map((d, i) => (${JSON.stringify(runs.map(r => r.audio.input.peak))}[i] || 0) - d.audioPeak);
const rmsDeltas = chartData.map((d, i) => d.audioRms - (${JSON.stringify(runs.map(r => r.audio.input.rms))}[i] || 0));
const latAdded = chartData.map((d, i) => d.softLatency - (${JSON.stringify(runs.map(r => r.software.input.latency))}[i] || 0));
const tpDeltas = chartData.map((d, i) => d.softThroughput - (${JSON.stringify(runs.map(r => r.software.input.throughput))}[i] || 0));

document.getElementById("s-peak-avg").textContent = avg(peakReds).toFixed(1);
document.getElementById("s-rms-avg").textContent = avg(rmsDeltas).toFixed(1);
document.getElementById("s-lat-avg").textContent = avg(latAdded).toFixed(0);
document.getElementById("s-tp-avg").textContent = avg(tpDeltas).toFixed(3);

// Stage bars
function renderStages(containerId, data, keys, colors) {
  const el = document.getElementById(containerId);
  for (const s of data) {
    const div = document.createElement("div");
    div.className = "stage";
    const isPlaceholder = s.name.includes("PH");
    let barsHtml = "";
    for (let k = 0; k < keys.length; k++) {
      const val = s[keys[k]];
      const norm = Math.min(1, Math.max(0, (typeof val === "number" ? (keys[k] === "latency" ? val / 80 : keys[k] === "peak" || keys[k] === "rms" ? (val + 20) / 20 : val) : 0)));
      barsHtml += '<div class="bar-label"><span>' + keys[k] + '</span><span>' + (typeof val === "number" ? val.toFixed(2) : "—") + '</span></div>';
      barsHtml += '<div class="bar" style="width:' + (norm * 100) + '%;background:' + colors[k] + (isPlaceholder ? ";opacity:0.3" : "") + '"></div>';
    }
    div.innerHTML = '<div class="name">' + (isPlaceholder ? "🎸 " : "") + s.name + '</div><div class="bar-container">' + barsHtml + '</div>';
    el.appendChild(div);
  }
}

renderStages("audio-stages", audioStageData, ["peak", "rms", "wet", "transient"], ["#00ff88", "#00ccff", "#aa66ff", "#ff8844"]);
renderStages("software-stages", softStageData, ["latency", "throughput", "health", "errors"], ["#00ccff", "#00ff88", "#aa66ff", "#ff4466"]);

// Charts
function drawChart(canvasId, series) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  ctx.scale(2, 2);
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  const pad = { t: 10, r: 10, b: 20, l: 40 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;

  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = "#1e1e2e";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + plotH * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
  }

  for (const s of series) {
    if (!s.values.length) continue;
    const min = Math.min(...s.values), max = Math.max(...s.values);
    const range = max - min || 1;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < s.values.length; i++) {
      const x = pad.l + (i / Math.max(1, s.values.length - 1)) * plotW;
      const y = pad.t + plotH - ((s.values[i] - min) / range) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = s.color;
    ctx.font = "9px monospace";
    ctx.fillText(s.label, pad.l + 4, pad.t + 12 + series.indexOf(s) * 12);
  }

  // X axis labels
  ctx.fillStyle = "#666680";
  ctx.font = "8px monospace";
  for (let i = 0; i < chartData.length; i += Math.max(1, Math.floor(chartData.length / 8))) {
    const x = pad.l + (i / Math.max(1, chartData.length - 1)) * plotW;
    ctx.fillText("#" + chartData[i].run, x - 4, h - 4);
  }
}

drawChart("chart-audio", [
  { values: chartData.map(d => d.audioPeak), color: "#00ff88", label: "Peak (dBFS)" },
  { values: chartData.map(d => d.audioRms), color: "#00ccff", label: "RMS (dBFS)" },
  { values: chartData.map(d => d.audioWet), color: "#aa66ff", label: "Wet Level" },
]);

drawChart("chart-software", [
  { values: chartData.map(d => d.softLatency), color: "#00ccff", label: "Latency (ms)" },
  { values: chartData.map(d => d.softThroughput), color: "#00ff88", label: "Throughput" },
  { values: chartData.map(d => d.softHealth), color: "#aa66ff", label: "Health" },
]);

// Resize
window.addEventListener("resize", () => {
  drawChart("chart-audio", [
    { values: chartData.map(d => d.audioPeak), color: "#00ff88", label: "Peak (dBFS)" },
    { values: chartData.map(d => d.audioRms), color: "#00ccff", label: "RMS (dBFS)" },
    { values: chartData.map(d => d.audioWet), color: "#aa66ff", label: "Wet Level" },
  ]);
  drawChart("chart-software", [
    { values: chartData.map(d => d.softLatency), color: "#00ccff", label: "Latency (ms)" },
    { values: chartData.map(d => d.softThroughput), color: "#00ff88", label: "Throughput" },
    { values: chartData.map(d => d.softHealth), color: "#aa66ff", label: "Health" },
  ]);
});
</script>
</body>
</html>`;

    const htmlPath = join(DATA_DIR, "parallel-systems.html");
    writeFileSync(htmlPath, html);
    console.log(`\n✓ HTML written → ${htmlPath}`);
    return htmlPath;
}

// ── Dispatch ───────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
    case "run": {
        const runsFlag = rest.indexOf("--runs");
        const numRuns = runsFlag >= 0 ? parseInt(rest[runsFlag + 1], 10) : 3;
        cmdRun(numRuns);
        break;
    }
    case "analyze":
        cmdAnalyze();
        break;
    case "html":
        cmdHtml();
        break;
    default:
        console.log(`
  audio-software-parallel.mjs

  Usage:
    node scripts/audio-software-parallel.mjs run [--runs N]   Run N simulations (default: 3)
    node scripts/audio-software-parallel.mjs analyze          Analyze trend data from runs
    node scripts/audio-software-parallel.mjs html             Generate HTML visualization
    `);
}
