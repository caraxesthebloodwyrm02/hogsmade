import { UserPresence, AgentPresence, VoiceLayer } from "./Presence";
import { DiskEngine } from "./DiskEngine";
import { OvalStadium } from "./OvalStadium";
import { ModulationEngine } from "./ModulationEngine";
import { ThresholdLine } from "./ThresholdLine";
import { Camera } from "./Camera";
import { ConversationLayer, type ConversationMessage } from "../conversation/ConversationLayer";
import { AudioEngine } from "../audio/AudioEngine";
import { BlockManager } from "../blocks/BlockManager";
import { CodeBlock, type CodeBlockOptions } from "../blocks/CodeBlock";
import { BlockDragController } from "../blocks/BlockDragController";
import { BlockSpawnMenu } from "../blocks/BlockSpawnMenu";
import type { FieldState } from "../state/FieldState";
import type { ThresholdState } from "../../../bridge/schema";

export class Field {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private userPresence: UserPresence;
  private agentPresence: AgentPresence;
  private voiceLayer: VoiceLayer;

  private diskEngine: DiskEngine;
  private ovalStadium: OvalStadium;
  private modEngine: ModulationEngine;
  private thresholdLine: ThresholdLine;
  private camera: Camera;
  private conversationLayer: ConversationLayer;
  private audioEngine: AudioEngine;
  private blockManager: BlockManager;
  private dragController: BlockDragController;
  private spawnMenu: BlockSpawnMenu;
  private codeBlocks: Map<string, CodeBlock> = new Map();
  private blockHost: HTMLDivElement;

  private thresholdState: ThresholdState = "ground";
  private ceremonyProgress = 0;

  private lastTime = 0;
  private rafId = 0;

  private panning = false;
  private spaceHeld = false;

  private cameraPanCallbacks: Array<(x: number, y: number) => void> = [];

  constructor(canvas: HTMLCanvasElement, state: FieldState, blockHost: HTMLDivElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.blockHost = blockHost;
    this.resize();

    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.48;

    this.userPresence = new UserPresence();
    this.agentPresence = new AgentPresence(cx, cy);
    this.diskEngine = new DiskEngine(cx, cy);
    this.ovalStadium = new OvalStadium(cx, cy, canvas.width, canvas.height);
    this.voiceLayer = new VoiceLayer(canvas.width, canvas.height);
    this.modEngine = new ModulationEngine();
    this.thresholdLine = new ThresholdLine(canvas.width, canvas.height);
    this.camera = new Camera();
    this.conversationLayer = new ConversationLayer(canvas.width, canvas.height);
    this.audioEngine = new AudioEngine();
    this.blockManager = new BlockManager();

    this.dragController = new BlockDragController({
      onDragEnd: (id, x, y) => {
        (window as any).glass?.patchBlockPosition?.(id, x, y);
      },
    });

    this.spawnMenu = new BlockSpawnMenu(blockHost, {
      onSpawn: (type, language, content, position) => {
        (window as any).glass?.addBlock?.(type, language, content, position);
      },
    });

    window.addEventListener("resize", () => this.resize());
    this.bindInputs();

    state.subscribe((s) => {
      this.agentPresence.setAgentState(s.agentState);
      this.thresholdState = s.thresholdState;
      this.ceremonyProgress = s.progress;
      this.voiceLayer.update(s.voices, s.thresholdState);

      for (const v of s.voices) {
        this.ovalStadium.setSlotActive(`voice_${v.id}`, v.active);
      }

      const msgs: ConversationMessage[] = s.conversation.map((m) => ({
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        age: 0,
      }));
      this.conversationLayer.sync(msgs);

      this.blockManager.sync(s.blocks);
      this.syncCodeBlocks();
    });
  }

  restoreCameraOffset(x: number, y: number): void {
    this.camera.setPosition(x, y);
  }

  onCameraPan(cb: (x: number, y: number) => void): void {
    this.cameraPanCallbacks.push(cb);
  }

  private notifyCameraPan(): void {
    for (const cb of this.cameraPanCallbacks) {
      cb(this.camera.x, this.camera.y);
    }
  }

  private bindInputs(): void {
    const { canvas } = this;

    canvas.addEventListener("mousemove", (e) => {
      if (this.panning) {
        this.camera.pan(-e.movementX, -e.movementY);
      } else {
        this.userPresence.move(e.clientX + this.camera.x, e.clientY + this.camera.y);
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.dragController.isDragging()) {
        const pos = this.dragController.moveDrag(e.clientX, e.clientY);
        if (pos) {
          this.blockManager.move(pos.id, pos.x, pos.y);
          const cb = this.codeBlocks.get(pos.id);
          cb?.setPosition(pos.x, pos.y);
        }
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (this.dragController.isDragging()) {
        const result = this.dragController.endDragAt(e.clientX, e.clientY);
        if (result) {
          this.blockManager.move(result.id, result.x, result.y);
          const cb = this.codeBlocks.get(result.id);
          cb?.setPosition(result.x, result.y);
          (window as any).glass?.patchBlockPosition?.(result.id, result.x, result.y);
        }
      }
    });

    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
        this.panning = true;
        e.preventDefault();
      }
    });

    canvas.addEventListener("mouseup", (e) => {
      if (e.button === 1 || e.button === 0) {
        if (this.panning) {
          this.panning = false;
          this.notifyCameraPan();
        }
      }
    });

    canvas.addEventListener("click", (e) => {
      if (this.panning) return;
      if (this.spawnMenu.isVisible()) {
        this.spawnMenu.hide();
        return;
      }
      const ax = this.agentPresence.x;
      const ay = this.agentPresence.y;
      const dx = e.clientX + this.camera.x - ax;
      const dy = e.clientY + this.camera.y - ay;
      if (Math.sqrt(dx * dx + dy * dy) < 40) {
        this.audioEngine.start();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" && !e.repeat) {
        this.spaceHeld = true;
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyN") {
        e.preventDefault();
        const cx = this.camera.x + this.canvas.width / 2;
        const cy = this.camera.y + this.canvas.height / 2;
        (window as any).glass?.addBlock?.("code", "typescript", "", { x: cx, y: cy });
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        this.spaceHeld = false;
        this.panning = false;
      }
    });

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.spawnMenu.show(e.clientX, e.clientY, this.camera.x, this.camera.y);
    });
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.thresholdLine?.resize(this.canvas.width, this.canvas.height);
    this.conversationLayer?.resize(this.canvas.width, this.canvas.height);
  }

  start(): void {
    const loop = (now: number) => {
      const dt = now - this.lastTime;
      this.lastTime = now;
      this.render(dt);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame((now) => {
      this.lastTime = now;
      loop(now);
    });
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.audioEngine.stop();
  }

  private render(dt: number): void {
    const { ctx, canvas } = this;

    const bus = this.modEngine.tick(dt, this.thresholdState, this.ceremonyProgress);

    this.camera.tick(dt);
    this.thresholdLine.tick(dt, this.thresholdState);
    this.conversationLayer.tick(dt);
    this.blockManager.tick(dt);
    this.updateBlockOpacities();

    const audioParams = AudioEngine.deriveParams(bus.field.ambientIntensity, this.thresholdState);
    this.audioEngine.update(audioParams);

    const blur = 0.72 + (1 - bus.field.ambientIntensity) * 0.15;
    ctx.fillStyle = `rgba(10,10,12,${blur})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.drawGrain(bus.field.ambientIntensity);

    ctx.save();
    const { tx, ty } = this.camera.transform();
    ctx.translate(tx, ty);

    this.ovalStadium.draw(ctx, bus.oval);
    this.diskEngine.draw(ctx, bus.disk, this.thresholdState, this.ceremonyProgress);
    this.thresholdLine.draw(ctx);
    this.voiceLayer.draw(ctx, dt);
    this.conversationLayer.draw(ctx);
    this.agentPresence.draw(ctx, dt);
    this.userPresence.draw(ctx, dt);

    ctx.restore();

    this.positionBlockHost();
  }

  private drawGrain(intensity: number): void {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.globalAlpha = 0.008 + intensity * 0.012;
    const count = Math.floor(300 + intensity * 200);
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
    }
    ctx.restore();
  }

  private syncCodeBlocks(): void {
    const managed = this.blockManager.getAll();
    const managedIds = new Set(managed.map((b) => b.id));

    for (const [id, cb] of this.codeBlocks) {
      if (!managedIds.has(id)) {
        cb.dispose();
        this.codeBlocks.delete(id);
      }
    }

    for (const block of managed) {
      if (!this.codeBlocks.has(block.id)) {
        const container = document.createElement("div");
        this.blockHost.appendChild(container);
        const opts: CodeBlockOptions = {
          id: block.id,
          language: block.language,
          content: block.content,
          x: block.position.x,
          y: block.position.y,
          width: 320,
          height: 180,
          origin: block.origin,
        };
        const codeBlock = new CodeBlock(opts, container);
        this.codeBlocks.set(block.id, codeBlock);

        const grip = codeBlock.getGripElement();
        grip.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          this.dragController.startDrag(
            block.id,
            e.clientX,
            e.clientY,
            block.position.x,
            block.position.y,
          );
        });
      } else {
        const cb = this.codeBlocks.get(block.id)!;
        if (!this.dragController.isDragging() || this.dragController.activeBlockId() !== block.id) {
          cb.setPosition(block.position.x, block.position.y);
        }
        cb.setContent(block.content);
      }
    }
  }

  private updateBlockOpacities(): void {
    for (const block of this.blockManager.getAll()) {
      const cb = this.codeBlocks.get(block.id);
      cb?.updateOpacity(block.spawnAge);
    }
  }

  private positionBlockHost(): void {
    const { tx, ty } = this.camera.transform();
    this.blockHost.style.transform = `translate(${tx}px, ${ty}px)`;
  }
}
