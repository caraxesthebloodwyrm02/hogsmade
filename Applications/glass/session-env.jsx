import { useState, useEffect, useRef, useCallback } from "react";

const EARTH_PALETTE = {
  void: "#0a0908",
  deep: "#111010",
  ground: "#1a1714",
  clay: "#2a2420",
  warm: "#3d3328",
  ember: "#c4956a",
  signal: "#d4a574",
  bright: "#e8c9a0",
  whisper: "#7a6b5d",
  ghost: "#4a3f35",
  green: "#6b8f71",
  greenDim: "#3a5a3e",
  red: "#a0524a",
  amber: "#c49a3c",
};

const GATES = [
  { id: "orient", label: "Orient", icon: "◎", desc: "Context acquisition. Read before write." },
  { id: "route", label: "Route", icon: "⊕", desc: "Zone identification. Where does this live?" },
  { id: "gate", label: "Gate", icon: "◈", desc: "Constraint check. What guards passage?" },
  {
    id: "implement",
    label: "Implement",
    icon: "◇",
    desc: "Execution. Minimal, precise, load-bearing.",
  },
  {
    id: "reconcile",
    label: "Reconcile",
    icon: "◬",
    desc: "Verify coherence. Does it hold weight?",
  },
  { id: "report", label: "Report", icon: "◻", desc: "Surface the signal. One screen." },
];

const ACOUSTICS = {
  resonance: 0.82,
  decay: 0.15,
  warmth: 0.91,
  clarity: 0.88,
  depth: 0.76,
  noise_floor: 0.04,
};

const TRIADIC = [
  { label: "Safety", weight: 1.0, color: EARTH_PALETTE.green },
  { label: "Correctness", weight: 0.85, color: EARTH_PALETTE.ember },
  { label: "Autonomy", weight: 0.7, color: EARTH_PALETTE.amber },
];

function useTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Particle({ delay }) {
  const style = {
    position: "absolute",
    width: 2,
    height: 2,
    borderRadius: "50%",
    background: EARTH_PALETTE.ember,
    opacity: 0,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    animation: `drift ${6 + Math.random() * 8}s ease-in-out ${delay}s infinite`,
  };
  return <div style={style} />;
}

function AcousticMeter({ label, value, width = 120 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span
        style={{
          color: EARTH_PALETTE.whisper,
          fontSize: 11,
          width: 80,
          textAlign: "right",
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        {label}
      </span>
      <div
        style={{
          width,
          height: 3,
          background: EARTH_PALETTE.ground,
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${EARTH_PALETTE.ghost}, ${EARTH_PALETTE.ember})`,
            borderRadius: 1,
            transition: "width 1.2s ease",
          }}
        />
      </div>
      <span
        style={{
          color: EARTH_PALETTE.ghost,
          fontSize: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          width: 30,
        }}
      >
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function GateNode({ gate, index, active, cleared, onClick }) {
  const isActive = active === index;
  const isCleared = cleared.includes(index);
  const baseColor = isActive
    ? EARTH_PALETTE.ember
    : isCleared
      ? EARTH_PALETTE.greenDim
      : EARTH_PALETTE.ghost;
  const textColor = isActive
    ? EARTH_PALETTE.bright
    : isCleared
      ? EARTH_PALETTE.green
      : EARTH_PALETTE.whisper;

  return (
    <div
      onClick={() => onClick(index)}
      style={{
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 6,
        border: `1px solid ${isActive ? EARTH_PALETTE.ember + "60" : EARTH_PALETTE.ground}`,
        background: isActive ? EARTH_PALETTE.ember + "0a" : "transparent",
        transition: "all 0.3s ease",
        position: "relative",
      }}
    >
      {index < 5 && (
        <div
          style={{
            position: "absolute",
            left: 24,
            top: "100%",
            width: 1,
            height: 8,
            background: isCleared ? EARTH_PALETTE.greenDim : EARTH_PALETTE.ground,
          }}
        />
      )}
      <span style={{ fontSize: 18, color: baseColor, transition: "color 0.3s" }}>{gate.icon}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            color: textColor,
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 500,
            transition: "color 0.3s",
          }}
        >
          {gate.label}
        </div>
        <div
          style={{
            fontSize: 10,
            color: EARTH_PALETTE.ghost,
            marginTop: 2,
            lineHeight: 1.4,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {gate.desc}
        </div>
      </div>
      {isCleared && (
        <span
          style={{
            fontSize: 10,
            color: EARTH_PALETTE.green,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          ✓
        </span>
      )}
    </div>
  );
}

function TriadicBar({ item, maxWeight }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span
        style={{
          width: 80,
          fontSize: 11,
          color: item.color,
          fontFamily: "'IBM Plex Mono', monospace",
          textAlign: "right",
        }}
      >
        {item.label}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: EARTH_PALETTE.ground,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(item.weight / maxWeight) * 100}%`,
            height: "100%",
            background: item.color + "90",
            borderRadius: 3,
            transition: "width 0.8s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: EARTH_PALETTE.ghost,
          fontFamily: "'IBM Plex Mono', monospace",
          width: 25,
        }}
      >
        {item.weight.toFixed(2)}
      </span>
    </div>
  );
}

function PulseRing() {
  return (
    <div
      style={{
        position: "relative",
        width: 48,
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: `1px solid ${EARTH_PALETTE.ember}20`,
          animation: "pulse-ring 3s ease-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: `1px solid ${EARTH_PALETTE.ember}30`,
          animation: "pulse-ring 3s ease-out 1s infinite",
        }}
      />
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: EARTH_PALETTE.ember,
          boxShadow: `0 0 12px ${EARTH_PALETTE.ember}60`,
        }}
      />
    </div>
  );
}

export default function SessionEnvironment() {
  const now = useTime();
  const [activeGate, setActiveGate] = useState(0);
  const [clearedGates, setClearedGates] = useState([]);
  const [sessionMode, setSessionMode] = useState("orient");
  const [logEntries, setLogEntries] = useState([
    { time: "00:00", msg: "Session instance initialized", type: "sys" },
    { time: "00:01", msg: "Acoustic profile loaded — earth resonance", type: "sys" },
    { time: "00:02", msg: "Triadic safeguard weights calibrated", type: "sys" },
    { time: "00:03", msg: "Gate protocol standing by", type: "gate" },
  ]);

  const handleGateClick = useCallback(
    (index) => {
      setActiveGate(index);
      setSessionMode(GATES[index].id);
      if (!clearedGates.includes(index)) {
        if (index === 0 || clearedGates.includes(index - 1)) {
          setClearedGates((prev) => [...prev, index]);
          const t = now.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          });
          setLogEntries((prev) => [
            ...prev.slice(-8),
            { time: t, msg: `Gate ${GATES[index].label} cleared`, type: "gate" },
          ]);
        }
      }
    },
    [clearedGates, now],
  );

  const sessionDuration = () => {
    const s = Math.floor((now - new Date(now.toDateString())) / 1000);
    const h = Math.floor(s / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const completionPct = ((clearedGates.length / GATES.length) * 100).toFixed(0);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: EARTH_PALETTE.void,
        color: EARTH_PALETTE.bright,
        fontFamily: "'IBM Plex Mono', monospace",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Crimson+Pro:wght@300;400;600&display=swap');
        @keyframes drift {
          0%, 100% { opacity: 0; transform: translateY(0) scale(1); }
          50% { opacity: 0.15; transform: translateY(-20px) scale(1.5); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2%, -2%); }
          30% { transform: translate(1%, -3%); }
          50% { transform: translate(-1%, 2%); }
          70% { transform: translate(3%, 1%); }
          90% { transform: translate(2%, -1%); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; scrollbar-width: thin; scrollbar-color: ${EARTH_PALETTE.ghost} transparent; }
      `}</style>

      {/* Film grain overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          opacity: 0.03,
          pointerEvents: "none",
          background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          animation: "grain 0.5s steps(1) infinite",
        }}
      />

      {/* Ambient particles */}
      {Array.from({ length: 15 }).map((_, i) => (
        <Particle key={i} delay={i * 0.7} />
      ))}

      {/* Header bar */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: `1px solid ${EARTH_PALETTE.ground}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <PulseRing />
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: EARTH_PALETTE.signal,
                fontFamily: "'Crimson Pro', serif",
                letterSpacing: 1,
              }}
            >
              SESSION ENVIRONMENT
            </div>
            <div style={{ fontSize: 10, color: EARTH_PALETTE.ghost, marginTop: 2 }}>
              tuned instance · earth resonance · gated protocol
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{ fontSize: 20, color: EARTH_PALETTE.ember, fontWeight: 300, letterSpacing: 2 }}
          >
            {now.toLocaleTimeString("en-US", { hour12: false })}
          </div>
          <div style={{ fontSize: 10, color: EARTH_PALETTE.ghost }}>
            UTC+6 · Dhaka ·{" "}
            {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: "260px 1fr 240px",
          gap: 0,
          minHeight: "calc(100vh - 70px)",
        }}
      >
        {/* Left: Gate Protocol */}
        <div style={{ borderRight: `1px solid ${EARTH_PALETTE.ground}`, padding: 20 }}>
          <div
            style={{
              fontSize: 10,
              color: EARTH_PALETTE.whisper,
              marginBottom: 16,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Gated Execution Protocol
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {GATES.map((g, i) => (
              <GateNode
                key={g.id}
                gate={g}
                index={i}
                active={activeGate}
                cleared={clearedGates}
                onClick={handleGateClick}
              />
            ))}
          </div>
          <div
            style={{
              marginTop: 20,
              padding: "12px 14px",
              borderRadius: 6,
              border: `1px solid ${EARTH_PALETTE.ground}`,
            }}
          >
            <div style={{ fontSize: 10, color: EARTH_PALETTE.ghost, marginBottom: 8 }}>
              COMPLETION
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: EARTH_PALETTE.ground,
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${completionPct}%`,
                    height: "100%",
                    borderRadius: 2,
                    transition: "width 0.5s ease",
                    background: completionPct === "100" ? EARTH_PALETTE.green : EARTH_PALETTE.ember,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: completionPct === "100" ? EARTH_PALETTE.green : EARTH_PALETTE.ember,
                }}
              >
                {completionPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Center: Main canvas */}
        <div style={{ padding: 28, display: "flex", flexDirection: "column" }}>
          {/* Session status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 24,
              padding: "14px 18px",
              borderRadius: 8,
              background: EARTH_PALETTE.deep,
              border: `1px solid ${EARTH_PALETTE.ground}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: EARTH_PALETTE.green,
                  boxShadow: `0 0 8px ${EARTH_PALETTE.green}40`,
                }}
              />
              <span style={{ fontSize: 11, color: EARTH_PALETTE.green }}>LIVE</span>
            </div>
            <div style={{ width: 1, height: 16, background: EARTH_PALETTE.ground }} />
            <div>
              <span style={{ fontSize: 10, color: EARTH_PALETTE.ghost }}>mode: </span>
              <span style={{ fontSize: 11, color: EARTH_PALETTE.signal }}>{sessionMode}</span>
            </div>
            <div style={{ width: 1, height: 16, background: EARTH_PALETTE.ground }} />
            <div>
              <span style={{ fontSize: 10, color: EARTH_PALETTE.ghost }}>elapsed: </span>
              <span style={{ fontSize: 11, color: EARTH_PALETTE.whisper }}>
                {sessionDuration()}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10, color: EARTH_PALETTE.ghost }}>
              gates: {clearedGates.length}/{GATES.length}
            </div>
          </div>

          {/* Philosophy block */}
          <div
            style={{
              padding: "24px 28px",
              borderRadius: 8,
              marginBottom: 24,
              background: `linear-gradient(135deg, ${EARTH_PALETTE.deep}, ${EARTH_PALETTE.ground}40)`,
              borderLeft: `3px solid ${EARTH_PALETTE.ember}40`,
            }}
          >
            <div
              style={{
                fontFamily: "'Crimson Pro', serif",
                fontSize: 22,
                color: EARTH_PALETTE.signal,
                lineHeight: 1.5,
                fontWeight: 300,
              }}
            >
              "The space doesn't perform intelligence —<br />
              <span style={{ color: EARTH_PALETTE.ember }}>
                it holds the conditions where precision becomes natural.
              </span>
              "
            </div>
            <div style={{ fontSize: 10, color: EARTH_PALETTE.ghost, marginTop: 12 }}>
              Environment tuned for: minimal noise floor · productive tension · earth resonance ·
              gated traversal
            </div>
          </div>

          {/* Session principles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
              marginBottom: 24,
            }}
          >
            {[
              {
                title: "Signal Density",
                value: "High",
                sub: "No throat-clearing. Drop into the weight.",
                color: EARTH_PALETTE.ember,
              },
              {
                title: "Resolution",
                value: "Layered",
                sub: "Framework-native. Architecture, not surface.",
                color: EARTH_PALETTE.signal,
              },
              {
                title: "Tension",
                value: "Held",
                sub: "Dualities live unresolved. That's the point.",
                color: EARTH_PALETTE.amber,
              },
            ].map((p) => (
              <div
                key={p.title}
                style={{
                  padding: "16px 18px",
                  borderRadius: 6,
                  border: `1px solid ${EARTH_PALETTE.ground}`,
                  background: EARTH_PALETTE.deep,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: EARTH_PALETTE.ghost,
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {p.title}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    color: p.color,
                    fontFamily: "'Crimson Pro', serif",
                    fontWeight: 400,
                  }}
                >
                  {p.value}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: EARTH_PALETTE.whisper,
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {p.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Session log */}
          <div
            style={{
              flex: 1,
              padding: "16px 18px",
              borderRadius: 8,
              border: `1px solid ${EARTH_PALETTE.ground}`,
              background: EARTH_PALETTE.deep,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: EARTH_PALETTE.ghost,
                marginBottom: 12,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Session Log
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {logEntries.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontSize: 10, color: EARTH_PALETTE.ghost, minWidth: 36 }}>
                    {entry.time}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      minWidth: 32,
                      color: entry.type === "gate" ? EARTH_PALETTE.green : EARTH_PALETTE.ghost,
                    }}
                  >
                    [{entry.type}]
                  </span>
                  <span style={{ fontSize: 11, color: EARTH_PALETTE.whisper }}>{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Acoustics + Triadic */}
        <div style={{ borderLeft: `1px solid ${EARTH_PALETTE.ground}`, padding: 20 }}>
          {/* Acoustics panel */}
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: 10,
                color: EARTH_PALETTE.whisper,
                marginBottom: 16,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Acoustic Profile
            </div>
            {Object.entries(ACOUSTICS).map(([key, val]) => (
              <AcousticMeter key={key} label={key.replace("_", " ")} value={val} />
            ))}
            <div
              style={{
                marginTop: 12,
                fontSize: 10,
                color: EARTH_PALETTE.ghost,
                lineHeight: 1.6,
                padding: "8px 0",
              }}
            >
              Tuned for earth-register warmth. High resonance, low noise floor. Clarity preserved
              through restraint, not amplification.
            </div>
          </div>

          {/* Triadic safeguard */}
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: 10,
                color: EARTH_PALETTE.whisper,
                marginBottom: 16,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Triadic Safeguard
            </div>
            {TRIADIC.map((t) => (
              <TriadicBar key={t.label} item={t} maxWeight={1.0} />
            ))}
            <div
              style={{
                marginTop: 10,
                fontSize: 10,
                color: EARTH_PALETTE.ghost,
                fontStyle: "italic",
              }}
            >
              Safety {">"} Correctness {">"} Autonomy
            </div>
          </div>

          {/* Cognition patterns */}
          <div>
            <div
              style={{
                fontSize: 10,
                color: EARTH_PALETTE.whisper,
                marginBottom: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Pattern Register
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                "Flow",
                "Spatial",
                "Rhythm",
                "Color",
                "Repetition",
                "Deviation",
                "Cause",
                "Time",
                "Combination",
              ].map((p) => (
                <span
                  key={p}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 3,
                    border: `1px solid ${EARTH_PALETTE.ground}`,
                    color: EARTH_PALETTE.whisper,
                    background: EARTH_PALETTE.deep,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Environment signature */}
          <div
            style={{
              marginTop: 28,
              padding: "14px 16px",
              borderRadius: 6,
              border: `1px solid ${EARTH_PALETTE.ember}15`,
              background: EARTH_PALETTE.ember + "06",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: EARTH_PALETTE.ember,
                marginBottom: 8,
                letterSpacing: 1,
              }}
            >
              ENVIRONMENT SIGNATURE
            </div>
            <div style={{ fontSize: 10, color: EARTH_PALETTE.ghost, lineHeight: 1.7 }}>
              Local-first cognition space.
              <br />
              Earth resonance, not performance.
              <br />
              Gates navigate, not block.
              <br />
              Tension held, not resolved.
              <br />
              Signal only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
