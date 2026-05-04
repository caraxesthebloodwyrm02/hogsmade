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
import { AssetBlock, type AssetBlockOptions } from "../blocks/AssetBlock";
import { NoteBlock, type NoteBlockOptions } from "../blocks/NoteBlock";
import { BlockDragController } from "../blocks/BlockDragController";
import { BlockSpawnMenu } from "../blocks/BlockSpawnMenu";
import { InventoryMenu } from "../blocks/InventoryMenu";
import { computeSignalHeat } from "./signal-heat";
import type { FieldState } from "../state/FieldState";
import type {
  BlockType,
  FieldModulationSpec,
  FieldProfile,
  ThresholdState,
} from "../../../bridge/schema";

type BlockView = CodeBlock | AssetBlock | NoteBlock;

const FALLBACK_MODULATION: FieldModulationSpec = {
  envelopes: {
    ground: { sustain: 0.12, lfoRate: 0.04, lfoDepth: 0.025 },
    evaluating: { sustain: 0.5, lfoRate: 0.18, lfoDepth: 0.07 },
    floor_rising: { sustain: 1.0, lfoRate: 0.22, lfoDepth: 0.04 },
    voices_appearing: { sustain: 0.85, lfoRate: 0.12, lfoDepth: 0.05 },
    voice_1_active: { sustain: 0.88, lfoRate: 0.1, lfoDepth: 0.06 },
    voice_2_active: { sustain: 0.88, lfoRate: 0.13, lfoDepth: 0.06 },
    voice_3_active: { sustain: 0.88, lfoRate: 0.09, lfoDepth: 0.06 },
    elevated: { sustain: 1.0, lfoRate: 0.07, lfoDepth: 0.03 },
    returning: { sustain: 0.25, lfoRate: 0.06, lfoDepth: 0.03 },
    denied: { sustain: 0.08, lfoRate: 0.35, lfoDepth: 0.1 },
  },
  base: {
    disk: { scale: 0.06, brightness: 0.04, rimAlpha: 0.05 },
    oval: { opacity: 0.03, lineWidth: 0.3, markerAlpha: 0.04, fieldAlpha: 0.02 },
    voice: { alpha: 0.0, scanSpeed: 0.4, glowRadius: 8 },
    field: { ambientIntensity: 0.28 },
    block: { levitationMod: 0.88 },
  },
  recipe: {
    disk: { scale: 0.94, brightness: 0.96, rimAlpha: 0.95 },
    oval: { opacity: 0.72, lineWidth: 2.1, markerAlpha: 0.82, fieldAlpha: 0.55 },
    voice: { alpha: 0.9, scanSpeed: 1.8, glowRadius: 18 },
    field: { ambientIntensity: 0.44 },
    block: { levitationMod: 0.12 },
  },
};

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
  private inventoryMenu: InventoryMenu;
  private blockViews: Map<string, BlockView> = new Map();
  private blockViewTypes: Map<string, BlockType> = new Map();
  private blockHost: HTMLDivElement;

  private thresholdState: ThresholdState = "ground";
  private ceremonyProgress = 0;
  private signalHeat = 0;

  private paneOpen = false;
  private paneWidth = 360;

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
    this.modEngine = new ModulationEngine(FALLBACK_MODULATION);
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

    this.inventoryMenu = new InventoryMenu(blockHost, {
      onSpawn: (type, language, content, position, asset) => {
        (window as any).glass?.addBlock?.(type, language, content, position, asset);
      },
    });

    window.addEventListener("resize", () => this.resize());
    this.bindInputs();

    state.subscribe((s) => {
      this.agentPresence.setAgentState(s.agentState);
      this.thresholdState = s.thresholdState;
      this.ceremonyProgress = s.progress;
      this.signalHeat = computeSignalHeat(s.signals, s.hotThreshold);
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

  applyFieldProfile(profile: FieldProfile): void {
    this.modEngine = new ModulationEngine(profile.modulation);
  }

  restoreCameraOffset(x: number, y: number): void {
    this.camera.setPosition(x, y);
  }

  panToBlock(blockId: string): void {
    const block = this.blockManager.blocks.find((b) => b.id === blockId);
    if (block && block.position) {
      const targetX = block.position.x - this.canvas.width / 2;
      const targetY = block.position.y - this.canvas.height / 2;
      this.camera.setTarget(targetX, targetY);
    }
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
          const cb = this.blockViews.get(pos.id);
          cb?.setPosition(pos.x, pos.y);
        }
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (this.dragController.isDragging()) {
        const result = this.dragController.endDragAt(e.clientX, e.clientY);
        if (result) {
          this.blockManager.move(result.id, result.x, result.y);
          const cb = this.blockViews.get(result.id);
          cb?.setPosition(result.x, result.y);
          (window as any).glass?.patchBlockPosition?.(result.id, result.x, result.y);
        }
      }
      if (this.panning && (e.button === 0 || e.button === 1)) {
        this.panning = false;
        this.notifyCameraPan();
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
      let handled = false;
      if (this.spawnMenu.isVisible()) {
        this.spawnMenu.hide();
        handled = true;
      }
      if (this.inventoryMenu.isVisible()) {
        this.inventoryMenu.hide();
        handled = true;
      }
      if (handled) return;
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
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyI") {
        e.preventDefault();
        if (this.inventoryMenu.isVisible()) {
          this.inventoryMenu.hide();
        } else {
          this.spawnMenu.hide();
          const screenX = this.canvas.width / 2 - 140;
          const screenY = this.canvas.height / 2 - 150;
          this.inventoryMenu.show(screenX, screenY, this.camera.x, this.camera.y);
        }
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
      if (this.inventoryMenu.isVisible()) this.inventoryMenu.hide();
      this.spawnMenu.show(e.clientX, e.clientY, this.camera.x, this.camera.y);
    });
  }

  setPaneOpen(open: boolean): void {
    this.paneOpen = open;
    this.resize();
  }

  private resize(): void {
    this.canvas.width = this.paneOpen ? window.innerWidth - this.paneWidth : window.innerWidth;
    this.canvas.height = window.innerHeight;
    const cx = this.canvas.width * 0.5;
    const cy = this.canvas.height * 0.48;
    this.agentPresence?.reposition(cx, cy);
    this.diskEngine?.reposition(cx, cy);
    this.ovalStadium?.resize(cx, cy, this.canvas.width, this.canvas.height);
    this.voiceLayer?.resize(this.canvas.width, this.canvas.height);
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

    const bus = this.modEngine.tick(
      dt,
      this.thresholdState,
      this.ceremonyProgress,
      this.signalHeat,
    );

    this.camera.tick(dt);
    this.thresholdLine.tick(dt, this.thresholdState);
    this.conversationLayer.tick(dt);
    this.blockManager.tick(dt);
    this.updateBlockOpacities(bus.block.levitationMod);
    this.updateBlockColorTemp(this.thresholdState);

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

    for (const [id, cb] of this.blockViews) {
      if (!managedIds.has(id)) {
        cb.dispose();
        this.blockViews.delete(id);
        this.blockViewTypes.delete(id);
      }
    }

    for (const block of managed) {
      if (this.blockViewTypes.get(block.id) !== block.type) {
        this.blockViews.get(block.id)?.dispose();
        this.blockViews.delete(block.id);
        this.blockViewTypes.delete(block.id);
      }

      if (!this.blockViews.has(block.id)) {
        const container = document.createElement("div");
        this.blockHost.appendChild(container);
        let blockView: BlockView;
        if (block.type === "asset" && block.asset) {
          const opts: AssetBlockOptions = {
            id: block.id,
            content: block.content,
            x: block.position.x,
            y: block.position.y,
            width: 220,
            height: 156,
            origin: block.origin,
            asset: block.asset,
          };
          blockView = new AssetBlock(opts, container);
        } else if (block.type === "note") {
          const opts: NoteBlockOptions = {
            id: block.id,
            content: block.content,
            x: block.position.x,
            y: block.position.y,
            width: 320,
            height: 240,
            origin: block.origin,
          };
          blockView = new NoteBlock(opts, container);
        } else {
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
          blockView = new CodeBlock(opts, container);
        }
        this.blockViews.set(block.id, blockView);
        this.blockViewTypes.set(block.id, block.type);

        const grip = blockView.getGripElement();
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
        const cb = this.blockViews.get(block.id)!;
        if (!this.dragController.isDragging() || this.dragController.activeBlockId() !== block.id) {
          cb.setPosition(block.position.x, block.position.y);
        }
        cb.setContent(block.content);
        if (block.type === "asset" && block.asset && cb instanceof AssetBlock) {
          cb.setAsset(block.asset);
        }
      }
    }
  }

  private updateBlockOpacities(levitationMod: number): void {
    for (const block of this.blockManager.getAll()) {
      const cb = this.blockViews.get(block.id);
      cb?.updateOpacity(block.spawnAge, levitationMod);
    }
  }

  private updateBlockColorTemp(state: ThresholdState): void {
    for (const cb of this.blockViews.values()) {
      cb.setThresholdState(state);
    }
  }

  private positionBlockHost(): void {
    const { tx, ty } = this.camera.transform();
    this.blockHost.style.transform = `translate(${tx}px, ${ty}px)`;
  }
}
