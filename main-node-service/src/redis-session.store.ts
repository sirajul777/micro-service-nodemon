import type { SessionData } from 'express-session';

// Use the session package itself for the Store base class so the adapter always
// matches the express-session version installed by this service.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const expressSession = require('express-session');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IORedis = require('ioredis');

export class RedisSessionStore extends expressSession.Store {
  private readonly client: any;
  private readonly prefix: string;

  constructor(options: { url: string; prefix?: string }) {
    super();
    this.prefix = options.prefix || 'mikhmon:ses:';
    this.client = new IORedis(options.url, {
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    this.client.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private key(sid: string): string {
    return `${this.prefix}${sid}`;
  }

  private ttl(session: SessionData): number | undefined {
    const maxAge = session?.cookie?.maxAge;
    if (typeof maxAge !== 'number' || !Number.isFinite(maxAge) || maxAge <= 0) return undefined;
    return Math.max(1, Math.ceil(maxAge / 1000));
  }

  get(sid: string, callback: (err: any, session?: SessionData | null) => void): void {
    this.client.get(this.key(sid))
      .then((raw: string | null) => {
        if (raw === null) return callback(null, null);
        try {
          callback(null, JSON.parse(raw));
        } catch (error) {
          callback(error);
        }
      })
      .catch((error: Error) => callback(error));
  }

  set(sid: string, session: SessionData, callback: (err?: any) => void = () => undefined): void {
    let payload: string;
    try {
      payload = JSON.stringify(session);
    } catch (error) {
      callback(error);
      return;
    }

    const ttl = this.ttl(session);
    const operation = ttl === undefined
      ? this.client.set(this.key(sid), payload)
      : this.client.set(this.key(sid), payload, 'EX', ttl);

    operation.then(() => callback()).catch((error: Error) => callback(error));
  }

  destroy(sid: string, callback: (err?: any) => void = () => undefined): void {
    this.client.del(this.key(sid))
      .then(() => callback())
      .catch((error: Error) => callback(error));
  }

  touch(sid: string, session: SessionData, callback: (err?: any) => void = () => undefined): void {
    const ttl = this.ttl(session);
    if (ttl === undefined) return callback();

    this.client.expire(this.key(sid), ttl)
      .then(() => callback())
      .catch((error: Error) => callback(error));
  }

  clear(callback: (err?: any) => void = () => undefined): void {
    this.client.keys(`${this.prefix}*`)
      .then((keys: string[]) => (keys.length ? this.client.del(keys) : 0))
      .then(() => callback())
      .catch((error: Error) => callback(error));
  }

  length(callback: (err: any, length?: number) => void): void {
    this.client.keys(`${this.prefix}*`)
      .then((keys: string[]) => callback(null, keys.length))
      .catch((error: Error) => callback(error));
  }

  all(callback: (err: any, sessions?: SessionData[]) => void): void {
    this.client.keys(`${this.prefix}*`)
      .then(async (keys: string[]) => {
        if (!keys.length) return callback(null, []);
        const values = await this.client.mget(keys);
        const sessions: SessionData[] = [];
        for (const value of values) {
          if (!value) continue;
          try {
            sessions.push(JSON.parse(value));
          } catch {
            // Ignore malformed legacy entries rather than failing the whole query.
          }
        }
        callback(null, sessions);
      })
      .catch((error: Error) => callback(error));
  }

  close(): void {
    this.client.disconnect();
  }
}
