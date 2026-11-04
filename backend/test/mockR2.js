export class MockR2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async get(key) {
    if (!this.objects.has(key)) return null;
    const entry = this.objects.get(key);
    return {
      key,
      httpEtag: `"${entry.uploaded.toString(16)}"`,
      uploaded: new Date(entry.uploaded),
      size: entry.data.byteLength || entry.data.length || 0,
      customMetadata: entry.customMetadata || {},
      httpMetadata: entry.httpMetadata || {},
      async text() {
        if (typeof entry.data === 'string') return entry.data;
        return new TextDecoder().decode(entry.data);
      },
      async arrayBuffer() {
        if (entry.data instanceof ArrayBuffer) return entry.data;
        if (typeof entry.data === 'string') return new TextEncoder().encode(entry.data).buffer;
        return entry.data.buffer || new ArrayBuffer(0);
      },
      get body() {
        if (entry.data instanceof ArrayBuffer) return entry.data;
        if (typeof entry.data === 'string') return new TextEncoder().encode(entry.data).buffer;
        return entry.data;
      },
      writeHttpMetadata(headers) {
        if (entry.httpMetadata?.contentType) {
          headers.set('content-type', entry.httpMetadata.contentType);
        }
      }
    };
  }

  async put(key, value, options = {}) {
    let stored = value;
    if (value instanceof ReadableStream) {
      // convert stream to array buffer
      const response = new Response(value);
      stored = await response.arrayBuffer();
    }
    this.objects.set(key, {
      data: stored,
      uploaded: Date.now(),
      customMetadata: options.customMetadata || {},
      httpMetadata: options.httpMetadata || {},
    });
    return { key };
  }

  async delete(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      this.objects.delete(k);
    }
  }

  async list(options = {}) {
    const prefix = options.prefix || '';
    const results = [];
    for (const [key, entry] of this.objects.entries()) {
      if (key.startsWith(prefix)) {
        results.push({
          key,
          uploaded: new Date(entry.uploaded),
          size: entry.data.byteLength || entry.data.length || 0,
          customMetadata: entry.customMetadata || {},
        });
      }
    }
    return {
      objects: results,
      truncated: false,
      cursor: undefined,
    };
  }
}

