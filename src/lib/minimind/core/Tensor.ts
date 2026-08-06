// ============================================================
// Tensor — Core data structure for MiniMind autograd engine
// ============================================================
// Flat Float64Array storage with shape descriptor and
// gradient tracking. The foundation of Phase 30 autograd.
// ============================================================

import { BackwardContext, executeBackward } from "./autograd";

/**
 * Index calculation helper for flat Float64Array access.
 *
 * Converts multi-dimensional indices into a flat offset
 * using row-major (C-order) layout.
 *
 * Example: shape=[2,3], indices=[1,2] → offset = 1*3 + 2 = 5
 */
export function indexFor(shape: number[], indices: number[]): number {
  let offset = 0;
  let stride = 1;
  for (let i = shape.length - 1; i >= 0; i--) {
    offset += indices[i] * stride;
    stride *= shape[i];
  }
  return offset;
}

/**
 * Compute the product of all dimensions in a shape.
 * Returns 1 for scalar shape [].
 */
export function shapeSize(shape: number[]): number {
  if (shape.length === 0) return 1;
  return shape.reduce((a, b) => a * b, 1);
}

export class Tensor {
  /** Underlying data — always a flat Float64Array in row-major order */
  readonly data: Float64Array;

  /** Shape descriptor — e.g. [2, 3] for 2×3 matrix, [] for scalar */
  readonly shape: number[];

  /** Whether this tensor participates in gradient computation */
  requiresGrad: boolean;

  /** Gradient buffer — same length as data, null if requiresGrad=false */
  grad: Float64Array | null;

  /** Computation graph context — null for leaf tensors */
  _ctx: BackwardContext | null;

  /**
   * Private constructor. Use static factories (fromArray, zeros, randn, etc.)
   * or create directly for internal use.
   */
  constructor(
    data: Float64Array,
    shape: number[],
    requiresGrad: boolean = false,
    _ctx: BackwardContext | null = null
  ) {
    // Validate: data length must match shape product
    const expectedSize = shapeSize(shape);
    if (data.length !== expectedSize) {
      throw new Error(
        `Tensor: data length ${data.length} does not match shape [${shape}] (expected ${expectedSize})`
      );
    }

    this.data = data;
    this.shape = shape;
    this.requiresGrad = requiresGrad;
    this.grad = requiresGrad ? new Float64Array(data.length) : null;
    this._ctx = _ctx;
  }

  // ──────────────────────────────────────
  // Computed properties
  // ──────────────────────────────────────

  /** Number of dimensions (rank) */
  get ndim(): number {
    return this.shape.length;
  }

  /** Total number of elements */
  get size(): number {
    return shapeSize(this.shape);
  }

  /** Number of elements per batch (product of shape excluding first dim) */
  get stride(): number {
    if (this.shape.length <= 1) return 1;
    return this.shape.slice(1).reduce((a, b) => a * b, 1);
  }

  // ──────────────────────────────────────
  // Static factories
  // ──────────────────────────────────────

  /**
   * Create a Tensor from nested arrays or flat arrays.
   *
   * @param arr  - Nested number arrays (e.g. [[1,2],[3,4]]) or flat array
   * @param shape - Optional explicit shape (if omitted, inferred from array structure)
   * @param requiresGrad - Whether to track gradients
   */
  static fromArray(
    arr: number | number[] | number[][] | number[][][],
    shape?: number[],
    requiresGrad: boolean = false
  ): Tensor {
    const flat: number[] = [];
    const inferredShape: number[] = [];

    function flatten(value: unknown, depth: number): void {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          throw new Error("Tensor.fromArray: empty arrays are not supported");
        }
        if (inferredShape.length <= depth) {
          inferredShape.push(value.length);
        } else if (inferredShape[depth] !== value.length) {
          throw new Error(
            `Tensor.fromArray: inconsistent shape at dimension ${depth}: ` +
              `expected ${inferredShape[depth]}, got ${value.length}`
          );
        }
        for (const item of value) {
          flatten(item, depth + 1);
        }
      } else if (typeof value === "number") {
        flat.push(value);
      } else {
        throw new Error(
          `Tensor.fromArray: expected number or array, got ${typeof value}`
        );
      }
    }

    flatten(arr, 0);

    // Handle scalar (single number passed directly)
    const finalShape = shape ?? (inferredShape.length > 0 ? inferredShape : []);
    return new Tensor(new Float64Array(flat), finalShape, requiresGrad);
  }

  /** Create a Tensor filled with zeros */
  static zeros(shape: number[], requiresGrad: boolean = false): Tensor {
    const size = shapeSize(shape);
    return new Tensor(new Float64Array(size), shape, requiresGrad);
  }

  /** Create a Tensor filled with ones */
  static ones(shape: number[], requiresGrad: boolean = false): Tensor {
    const size = shapeSize(shape);
    const data = new Float64Array(size);
    data.fill(1);
    return new Tensor(data, shape, requiresGrad);
  }

  /** Create a scalar Tensor */
  static scalar(value: number, requiresGrad: boolean = false): Tensor {
    return new Tensor(new Float64Array([value]), [], requiresGrad);
  }

  /**
   * Create a Tensor with random values from N(0, 1).
   * Uses Box-Muller transform.
   */
  static randn(shape: number[], requiresGrad: boolean = false): Tensor {
    const size = shapeSize(shape);
    const data = new Float64Array(size);
    for (let i = 0; i < size; i += 2) {
      const u1 = Math.random();
      const u2 = Math.random();
      // Box-Muller: avoid log(0) by using 1 - u1 (u1 is never exactly 1 in practice,
      // but this guards against the theoretical edge case)
      const r = Math.sqrt(-2 * Math.log(u1 || 1e-15));
      const theta = 2 * Math.PI * u2;
      data[i] = r * Math.cos(theta);
      if (i + 1 < size) {
        data[i + 1] = r * Math.sin(theta);
      }
    }
    return new Tensor(data, shape, requiresGrad);
  }

  /**
   * Create a Tensor with random values from U(low, high).
   */
  static uniform(
    shape: number[],
    low: number = 0,
    high: number = 1,
    requiresGrad: boolean = false
  ): Tensor {
    const size = shapeSize(shape);
    const data = new Float64Array(size);
    const range = high - low;
    for (let i = 0; i < size; i++) {
      data[i] = low + Math.random() * range;
    }
    return new Tensor(data, shape, requiresGrad);
  }

  // ──────────────────────────────────────
  // Instance methods — Autograd
  // ──────────────────────────────────────

  /**
   * Entry point for gradient computation.
   * Only valid for scalar tensors (shape [] or size=1).
   */
  backward(): void {
    executeBackward(this);
  }

  /**
   * Accumulate gradient into this.grad (element-wise add).
   * Called by backwardFn closures — not typically user-facing.
   */
  accumulateGrad(grad: Float64Array): void {
    if (!this.requiresGrad) return;
    if (this.grad === null) {
      this.grad = new Float64Array(grad);
    } else {
      for (let i = 0; i < this.grad.length; i++) {
        this.grad[i] += grad[i];
      }
    }
  }

  /** Reset gradient buffer to zeros */
  zeroGrad(): void {
    if (this.grad !== null) {
      this.grad.fill(0);
    }
  }

  /**
   * Return a new Tensor sharing the same data but detached
   * from the computation graph (requiresGrad=false, _ctx=null).
   */
  detach(): Tensor {
    return new Tensor(new Float64Array(this.data), [...this.shape], false);
  }

  // ──────────────────────────────────────
  // Instance methods — Conversion
  // ──────────────────────────────────────

  /** Return the scalar value for a scalar tensor */
  item(): number {
    if (this.size !== 1) {
      throw new Error(
        `item() requires a scalar tensor (size=1). Got shape [${this.shape}], size=${this.size}.`
      );
    }
    return this.data[0];
  }

  /** Deep copy — new data array, no gradient, no graph context */
  clone(): Tensor {
    const t = new Tensor(new Float64Array(this.data), [...this.shape], this.requiresGrad);
    if (this.grad !== null) {
      t.grad = new Float64Array(this.grad);
    }
    return t;
  }

  /** Convert back to nested JavaScript arrays */
  toArray(): number | number[] | number[][] | number[][][] {
    const result = this._buildNested(0);
    return result.value as number | number[] | number[][] | number[][][];
  }

  /**
   * Recursively build nested arrays from flat data.
   * Returns the constructed value and the next offset.
   */
  private _buildNested(offset: number, dimIndex: number = 0): { value: unknown; nextOffset: number } {
    if (dimIndex >= this.shape.length) {
      // Leaf: return scalar value
      return { value: this.data[offset], nextOffset: offset + 1 };
    }

    const dim = this.shape[dimIndex];
    const result: unknown[] = [];
    let currentOffset = offset;

    for (let i = 0; i < dim; i++) {
      const child = this._buildNested(currentOffset, dimIndex + 1);
      result.push(child.value);
      currentOffset = child.nextOffset;
    }

    return { value: result, nextOffset: currentOffset };
  }

  // ──────────────────────────────────────
  // Instance methods — Shape manipulation
  // (Simple data-level ops without autograd tracking;
  //  the corresponding standalone ops/ functions add _ctx)
  // ──────────────────────────────────────

  /**
   * Create a reshaped view of this tensor.
   * Currently creates a copy (zero-copy view deferred).
   */
  reshape(...newShape: number[]): Tensor {
    // Resolve -1 in shape (infer dimension)
    let inferredDim = -1;
    const resolvedShape = newShape.map((d, i) => {
      if (d === -1) {
        if (inferredDim !== -1) {
          throw new Error("reshape: only one dimension can be inferred (-1)");
        }
        inferredDim = i;
        return 1; // placeholder
      }
      return d;
    });

    if (inferredDim !== -1) {
      const productKnown = resolvedShape.reduce((a, b) => a * b, 1);
      resolvedShape[inferredDim] = Math.floor(this.size / productKnown);
    }

    const expectedSize = shapeSize(resolvedShape);
    if (expectedSize !== this.size) {
      throw new Error(
        `reshape: cannot reshape [${this.shape}] (size=${this.size}) to [${newShape}] (size=${expectedSize})`
      );
    }

    const t = new Tensor(new Float64Array(this.data), resolvedShape, this.requiresGrad);
    if (this.grad !== null) {
      t.grad = new Float64Array(this.grad);
    }
    return t;
  }

  /**
   * Transpose two dimensions of this tensor.
   * Currently creates a copy (zero-copy view deferred).
   */
  transpose(dim0: number = -2, dim1: number = -1): Tensor {
    const ndim = this.shape.length;
    const d0 = dim0 < 0 ? ndim + dim0 : dim0;
    const d1 = dim1 < 0 ? ndim + dim1 : dim1;

    if (d0 < 0 || d0 >= ndim || d1 < 0 || d1 >= ndim) {
      throw new Error(
        `transpose: dimensions ${dim0}, ${dim1} out of range for shape [${this.shape}]`
      );
    }

    // Build new shape with swapped dimensions
    const newShape = [...this.shape];
    newShape[d0] = this.shape[d1];
    newShape[d1] = this.shape[d0];

    const result = new Float64Array(this.size);

    // Iterate over all positions and compute transposed index
    const indices = new Array(ndim).fill(0);
    for (let flatIdx = 0; flatIdx < this.size; flatIdx++) {
      // Convert flat → multi-index
      let remaining = flatIdx;
      for (let i = ndim - 1; i >= 0; i--) {
        indices[i] = remaining % this.shape[i];
        remaining = Math.floor(remaining / this.shape[i]);
      }

      // Swap indices
      const tmp = indices[d0];
      indices[d0] = indices[d1];
      indices[d1] = tmp;

      // Convert multi-index → flat in new shape
      const newFlatIdx = indexFor(newShape, indices);
      result[newFlatIdx] = this.data[flatIdx];
    }

    const t = new Tensor(result, newShape, this.requiresGrad);
    if (this.grad !== null) {
      // Transpose grad as well
      t.grad = new Float64Array(this.size);
      for (let flatIdx = 0; flatIdx < this.size; flatIdx++) {
        let remaining = flatIdx;
        for (let i = ndim - 1; i >= 0; i--) {
          indices[i] = remaining % this.shape[i];
          remaining = Math.floor(remaining / this.shape[i]);
        }
        const tmp = indices[d0];
        indices[d0] = indices[d1];
        indices[d1] = tmp;
        const newFlatIdx = indexFor(newShape, indices);
        t.grad[newFlatIdx] = this.grad[flatIdx];
      }
    }
    return t;
  }

  /** Pretty-print for debugging */
  toString(): string {
    const shapeStr = `[${this.shape.join(", ")}]`;
    if (this.size === 0) {
      return `Tensor(shape=${shapeStr}, data=[])`;
    }
    // Show first few values
    const preview = this.size <= 6
      ? Array.from(this.data)
      : Array.from(this.data.slice(0, 6));
    const suffix = this.size > 6 ? ", ..." : "";
    return `Tensor(shape=${shapeStr}, requiresGrad=${this.requiresGrad}, data=[${preview.join(", ")}${suffix}])`;
  }
}
