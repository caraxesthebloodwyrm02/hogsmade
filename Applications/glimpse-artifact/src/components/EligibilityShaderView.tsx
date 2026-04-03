import { useCallback, useEffect, useRef } from "react";
import type { ShaderBufferData } from "@/hooks/useEligibilityPipeline";
import vertexShaderSource from "@/shaders/eligibility.vert?raw";
import fragmentShaderSource from "@/shaders/eligibility.frag?raw";

interface EligibilityShaderViewProps {
  data: ShaderBufferData;
  className?: string;
}

interface GlResources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  residueTexture: WebGLTexture;
  locations: {
    a_position: number;
    a_weightRaw: number;
    a_runtimeInfluence: number;
    a_weightBand: number;
    a_conditionSeverity: number;
    a_promotionPassed: number;
    a_fnvNoise: number;
    a_dimensionScores: number;
    a_opFitScore: number;
    u_time: WebGLUniformLocation | null;
    u_beat: WebGLUniformLocation | null;
    u_sidewalkDrift: WebGLUniformLocation | null;
    u_momentum: WebGLUniformLocation | null;
    u_acceleration: WebGLUniformLocation | null;
    u_cbState: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_argBiases: WebGLUniformLocation | null;
    u_opFitBias: WebGLUniformLocation | null;
    u_residueTex: WebGLUniformLocation | null;
    u_promotionThresholds: WebGLUniformLocation | null;
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): GlResources {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error(`Program link failed: ${info}`);
  }

  gl.deleteShader(vert);
  gl.deleteShader(frag);

  const vao = gl.createVertexArray()!;
  const vbo = gl.createBuffer()!;
  const residueTexture = gl.createTexture()!;

  // Initialize residue texture as 8x1 RGBA
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, residueTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const locations = {
    a_position: gl.getAttribLocation(program, "a_position"),
    a_weightRaw: gl.getAttribLocation(program, "a_weightRaw"),
    a_runtimeInfluence: gl.getAttribLocation(program, "a_runtimeInfluence"),
    a_weightBand: gl.getAttribLocation(program, "a_weightBand"),
    a_conditionSeverity: gl.getAttribLocation(program, "a_conditionSeverity"),
    a_promotionPassed: gl.getAttribLocation(program, "a_promotionPassed"),
    a_fnvNoise: gl.getAttribLocation(program, "a_fnvNoise"),
    a_dimensionScores: gl.getAttribLocation(program, "a_dimensionScores"),
    a_opFitScore: gl.getAttribLocation(program, "a_opFitScore"),
    u_time: gl.getUniformLocation(program, "u_time"),
    u_beat: gl.getUniformLocation(program, "u_beat"),
    u_sidewalkDrift: gl.getUniformLocation(program, "u_sidewalkDrift"),
    u_momentum: gl.getUniformLocation(program, "u_momentum"),
    u_acceleration: gl.getUniformLocation(program, "u_acceleration"),
    u_cbState: gl.getUniformLocation(program, "u_cbState"),
    u_resolution: gl.getUniformLocation(program, "u_resolution"),
    u_argBiases: gl.getUniformLocation(program, "u_argBiases"),
    u_opFitBias: gl.getUniformLocation(program, "u_opFitBias"),
    u_residueTex: gl.getUniformLocation(program, "u_residueTex"),
    u_promotionThresholds: gl.getUniformLocation(program, "u_promotionThresholds"),
  };

  return { program, vao, vbo, residueTexture, locations };
}

const STRIDE = 13 * 4; // 13 floats * 4 bytes each

function setupAttributes(gl: WebGL2RenderingContext, res: GlResources) {
  gl.bindVertexArray(res.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);

  // a_position: vec2 at offset 0
  if (res.locations.a_position >= 0) {
    gl.enableVertexAttribArray(res.locations.a_position);
    gl.vertexAttribPointer(res.locations.a_position, 2, gl.FLOAT, false, STRIDE, 0);
  }
  // a_weightRaw: float at offset 8
  if (res.locations.a_weightRaw >= 0) {
    gl.enableVertexAttribArray(res.locations.a_weightRaw);
    gl.vertexAttribPointer(res.locations.a_weightRaw, 1, gl.FLOAT, false, STRIDE, 8);
  }
  // a_runtimeInfluence: float at offset 12
  if (res.locations.a_runtimeInfluence >= 0) {
    gl.enableVertexAttribArray(res.locations.a_runtimeInfluence);
    gl.vertexAttribPointer(res.locations.a_runtimeInfluence, 1, gl.FLOAT, false, STRIDE, 12);
  }
  // a_weightBand: float at offset 16
  if (res.locations.a_weightBand >= 0) {
    gl.enableVertexAttribArray(res.locations.a_weightBand);
    gl.vertexAttribPointer(res.locations.a_weightBand, 1, gl.FLOAT, false, STRIDE, 16);
  }
  // a_conditionSeverity: float at offset 20
  if (res.locations.a_conditionSeverity >= 0) {
    gl.enableVertexAttribArray(res.locations.a_conditionSeverity);
    gl.vertexAttribPointer(res.locations.a_conditionSeverity, 1, gl.FLOAT, false, STRIDE, 20);
  }
  // a_promotionPassed: float at offset 24
  if (res.locations.a_promotionPassed >= 0) {
    gl.enableVertexAttribArray(res.locations.a_promotionPassed);
    gl.vertexAttribPointer(res.locations.a_promotionPassed, 1, gl.FLOAT, false, STRIDE, 24);
  }
  // a_fnvNoise: float at offset 28
  if (res.locations.a_fnvNoise >= 0) {
    gl.enableVertexAttribArray(res.locations.a_fnvNoise);
    gl.vertexAttribPointer(res.locations.a_fnvNoise, 1, gl.FLOAT, false, STRIDE, 28);
  }
  // a_dimensionScores: vec4 at offset 32
  if (res.locations.a_dimensionScores >= 0) {
    gl.enableVertexAttribArray(res.locations.a_dimensionScores);
    gl.vertexAttribPointer(res.locations.a_dimensionScores, 4, gl.FLOAT, false, STRIDE, 32);
  }
  // a_opFitScore: float at offset 48
  if (res.locations.a_opFitScore >= 0) {
    gl.enableVertexAttribArray(res.locations.a_opFitScore);
    gl.vertexAttribPointer(res.locations.a_opFitScore, 1, gl.FLOAT, false, STRIDE, 48);
  }

  gl.bindVertexArray(null);
}

export function EligibilityShaderView({ data, className }: EligibilityShaderViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const resourcesRef = useRef<GlResources | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // Initialize WebGL2 context and compile shaders
  const initGl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!gl) {
      console.error("WebGL2 not available");
      return;
    }

    glRef.current = gl;

    try {
      const resources = createProgram(gl);
      setupAttributes(gl, resources);
      resourcesRef.current = resources;
    } catch (err) {
      console.error("Shader initialization failed:", err);
    }
  }, []);

  // Upload geometry buffers when data changes
  useEffect(() => {
    const gl = glRef.current;
    const res = resourcesRef.current;
    if (!gl || !res) return;

    // Upload vertex data
    gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.DYNAMIC_DRAW);

    // Upload residue texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.residueTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      8,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data.residueTexture,
    );
  }, [data]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    initGl();
    startTimeRef.current = performance.now();

    const render = () => {
      const gl = glRef.current;
      const res = resourcesRef.current;
      if (!gl || !res) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Handle canvas resize
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = Math.round(canvas.clientWidth * dpr);
      const displayHeight = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.04, 0.04, 0.06, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(res.program);

      // Enable blending for alpha
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Update time-varying uniforms
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      gl.uniform1f(res.locations.u_time, elapsed);
      gl.uniform1i(res.locations.u_beat, data.uniforms.beat);
      gl.uniform1f(res.locations.u_sidewalkDrift, data.uniforms.sidewalkDrift);
      gl.uniform1f(res.locations.u_momentum, data.uniforms.momentum);
      gl.uniform1f(res.locations.u_acceleration, data.uniforms.acceleration);
      gl.uniform1i(res.locations.u_cbState, data.uniforms.cbState);
      gl.uniform2f(res.locations.u_resolution, canvas.width, canvas.height);
      gl.uniform4f(
        res.locations.u_argBiases,
        data.uniforms.argBiases[0],
        data.uniforms.argBiases[1],
        data.uniforms.argBiases[2],
        data.uniforms.argBiases[3],
      );
      gl.uniform1f(res.locations.u_opFitBias, data.uniforms.opFitBias);
      gl.uniform1i(res.locations.u_residueTex, 0);
      gl.uniform4f(
        res.locations.u_promotionThresholds,
        data.uniforms.promotionThresholds[0],
        data.uniforms.promotionThresholds[1],
        data.uniforms.promotionThresholds[2],
        data.uniforms.promotionThresholds[3],
      );

      // Draw points
      gl.bindVertexArray(res.vao);
      gl.drawArrays(gl.POINTS, 0, data.candidateCount);
      gl.bindVertexArray(null);

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      const gl = glRef.current;
      const res = resourcesRef.current;
      if (gl && res) {
        gl.deleteBuffer(res.vbo);
        gl.deleteTexture(res.residueTexture);
        gl.deleteVertexArray(res.vao);
        gl.deleteProgram(res.program);
      }
      resourcesRef.current = null;
      glRef.current = null;
    };
  }, [initGl, data]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
