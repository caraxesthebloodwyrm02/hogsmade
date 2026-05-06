export class Camera {
  private _x = 0;
  private _y = 0;
  private targetX = 0;
  private targetY = 0;

  get x(): number {
    return this._x;
  }
  get y(): number {
    return this._y;
  }

  pan(dx: number, dy: number): void {
    this._x += dx;
    this._y += dy;
    this.targetX = this._x;
    this.targetY = this._y;
  }

  setPosition(x: number, y: number): void {
    this._x = x;
    this._y = y;
    this.targetX = x;
    this.targetY = y;
  }

  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  tick(dt: number): void {
    const ease = 0.004;
    this._x += (this.targetX - this._x) * ease * dt;
    this._y += (this.targetY - this._y) * ease * dt;
  }

  transform(): { tx: number; ty: number } {
    return { tx: -this._x, ty: -this._y };
  }
}
