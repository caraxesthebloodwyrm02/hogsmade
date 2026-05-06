import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine, type AudioParams } from "./AudioEngine";

describe("AudioEngine", () => {
  const stateFrequencyMap = {
    ground: 82,
    evaluating: 130,
    floor_rising: 165,
    voices_appearing: 196,
    voice_1_active: 196,
    voice_2_active: 220,
    voice_3_active: 247,
    elevated: 330,
    returning: 110,
    denied: 277,
  } as const;

  function makeAudioContextMock() {
    const osc = {
      type: "triangle",
      frequency: {
        value: 0,
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const filter = {
      type: "highpass",
      frequency: {
        value: 0,
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const gainNode = {
      gain: {
        value: 0,
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const ctx = {
      currentTime: 10,
      destination: {},
      createOscillator: vi.fn(() => osc),
      createBiquadFilter: vi.fn(() => filter),
      createGain: vi.fn(() => gainNode),
      close: vi.fn(),
    };
    return { ctx, osc, filter, gainNode };
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports AudioParams type and AudioEngine class", () => {
    expect(AudioEngine).toBeDefined();
  });

  it("computes expected frequency for each threshold state", () => {
    for (const [state, expected] of Object.entries(stateFrequencyMap)) {
      expect(AudioEngine.frequencyForState(state as keyof typeof stateFrequencyMap)).toBe(expected);
    }
  });

  it("derives AudioParams from bus values", () => {
    const params = AudioEngine.deriveParams(0.5, "evaluating");
    expect(params.frequency).toBeGreaterThan(0);
    expect(params.gain).toBeGreaterThanOrEqual(0);
    expect(params.gain).toBeLessThanOrEqual(1);
    expect(params.filterFreq).toBeGreaterThan(0);
  });

  it("gain scales with ambient intensity", () => {
    const low = AudioEngine.deriveParams(0.1, "ground");
    const high = AudioEngine.deriveParams(0.9, "elevated");
    expect(high.gain).toBeGreaterThan(low.gain);
  });

  it("caps gain at 1.0 and computes filter frequency", () => {
    const params = AudioEngine.deriveParams(99, "voice_3_active");
    expect(params.gain).toBe(1);
    expect(params.filterFreq).toBe(200 + 99 * 800);
  });

  it("start wires oscillator/filter/gain graph and is idempotent", () => {
    const { ctx, osc, filter, gainNode } = makeAudioContextMock();
    const AudioContextCtor = vi.fn(function AudioContextCtor() {
      return ctx as unknown as AudioContext;
    });
    vi.stubGlobal("AudioContext", AudioContextCtor);
    const engine = new AudioEngine();

    engine.start();
    engine.start();

    expect(AudioContextCtor).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(1);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
    expect(osc.type).toBe("sine");
    expect(osc.frequency.value).toBe(82);
    expect(filter.type).toBe("lowpass");
    expect(filter.frequency.value).toBe(400);
    expect(gainNode.gain.value).toBe(0);
    expect(osc.connect).toHaveBeenCalledWith(filter);
    expect(filter.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledWith(ctx.destination);
    expect(osc.start).toHaveBeenCalledTimes(1);
  });

  it("update ramps frequency, gain, and filter values", () => {
    const { ctx, osc, filter, gainNode } = makeAudioContextMock();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextCtor() {
        return ctx as unknown as AudioContext;
      }),
    );
    const engine = new AudioEngine();
    const params: AudioParams = {
      frequency: 220,
      gain: 0.6,
      filterFreq: 1200,
    };

    engine.start();
    engine.update(params);

    expect(osc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(220, 10.3);
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.6, 10.1);
    expect(filter.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(1200, 10.2);
  });

  it("stop shuts down and can be called when not started", () => {
    const { ctx, osc } = makeAudioContextMock();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextCtor() {
        return ctx as unknown as AudioContext;
      }),
    );
    const engine = new AudioEngine();

    engine.stop();
    expect(osc.stop).not.toHaveBeenCalled();
    expect(ctx.close).not.toHaveBeenCalled();

    engine.start();
    engine.stop();

    expect(osc.stop).toHaveBeenCalledTimes(1);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it("start fails loudly when AudioContext cannot be created", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextCtor() {
        throw new Error("denied");
      }),
    );
    const engine = new AudioEngine();

    engine.start();

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/AudioContext creation failed/i));
  });
});
