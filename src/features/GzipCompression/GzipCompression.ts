import zlib from "zlib";
import { GzipCompression as GzipCompressionAbstraction } from "./abstractions/GzipCompression.ts";

const GZIP = "gzip";
const TO_STORAGE_ENCODING = "base64";
const FROM_STORAGE_ENCODING = "utf8";

class GzipCompressionImpl implements GzipCompressionAbstraction.Interface {
  async compress<T>(data: T): Promise<GzipCompressionAbstraction.Compressed> {
    const json = JSON.stringify(data);
    const buffer = await gzip(Buffer.from(json));

    return {
      compression: GZIP,
      value: buffer.toString(TO_STORAGE_ENCODING)
    };
  }

  canDecompress(data: unknown): boolean {
    if (!data || typeof data !== "object") {
      return false;
    }
    const record = data as Record<string, unknown>;
    return typeof record.compression === "string" && record.compression.toLowerCase() === GZIP;
  }

  async decompress<T>(data: GzipCompressionAbstraction.Compressed): Promise<T | null> {
    if (!data || !data.value) {
      return null;
    }

    try {
      const input = Buffer.from(data.value, TO_STORAGE_ENCODING);
      const buffer = await gunzip(input);
      const json = buffer.toString(FROM_STORAGE_ENCODING);
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }
}

function gzip(input: zlib.InputType): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(input, {}, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

function gunzip(input: zlib.InputType): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(input, {}, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

export const GzipCompression = GzipCompressionAbstraction.createImplementation({
  implementation: GzipCompressionImpl,
  dependencies: []
});
