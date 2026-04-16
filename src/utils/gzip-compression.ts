import zlib from "zlib";

const GZIP = "gzip";
const TO_STORAGE_ENCODING = "base64";
const FROM_STORAGE_ENCODING = "utf8";

export const convertToBuffer = (value: string | Buffer) => {
    if (typeof value === "string") {
        return Buffer.from(value, TO_STORAGE_ENCODING);
    }
    return value;
};

export interface ICompressedValue {
    compression: string;
    value: string;
}

export class GzipCompression {
    public canCompress(data: any): boolean {
        if (!!data?.compression) {
            return false;
        }
        return true;
    }

    public async compress(data: any): Promise<ICompressedValue> {
        if (data === null || data === undefined) {
            return data;
        }
        // This stringifies both regular strings and JSON objects.
        const value = await compress(JSON.stringify(data));

        return {
            compression: GZIP,
            value: value.toString(TO_STORAGE_ENCODING)
        };
    }

    public canDecompress(data: Partial<ICompressedValue>): boolean {
        if (!data?.compression) {
            return false;
        }

        const compression = data.compression as string;

        return compression.toLowerCase() === GZIP;
    }

    public async decompress(data: ICompressedValue): Promise<any> {
        if (!data) {
            return data;
        } else if (!data.value) {
            return null;
        }
        try {
            const buf = await decompress(convertToBuffer(data.value));
            const value = buf.toString(FROM_STORAGE_ENCODING);
            return JSON.parse(value);
        } catch (ex) {
            console.log(`Could not decompress data.`, (ex as Error).message);
            return null;
        }
    }
}

const compress = (input: zlib.InputType, options?: zlib.ZlibOptions): Promise<Buffer> => {
    return new Promise(function (resolve, reject) {
        zlib.gzip(input, options || {}, function (error, result) {
            if (!error) {
                resolve(result);
            } else {
                reject(error);
            }
        });
    });
};

const decompress = (input: zlib.InputType, options?: zlib.ZlibOptions): Promise<Buffer> => {
    return new Promise(function (resolve, reject) {
        zlib.gunzip(input, options || {}, function (error, result) {
            if (!error) {
                resolve(result);
            } else {
                reject(error);
            }
        });
    });
};
