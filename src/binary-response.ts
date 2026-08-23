import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export class BinaryResponse {
  public constructor(
    public readonly stream: Readable,
    public readonly contentType: string | undefined,
    public readonly contentLength: number | undefined,
    public readonly trace: string | undefined,
  ) {}

  public async toBuffer(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  public async saveToFile(path: string): Promise<void> {
    if (!path.trim()) {
      throw new TypeError("Output path must not be empty.");
    }
    await pipeline(this.stream, createWriteStream(path));
  }
}
