// U3 task-engine — Persistence (SQLite via better-sqlite3)
// 三类数据：tasks / history / config。参数以 JSON 序列化（PBT-02 往返对象）。

import Database from 'better-sqlite3';
import type { AppConfig, HistoryItem, Profile, TaskRecord, GenParams } from '@shared/types';
import type { ConfigStore } from '../core-config/ConfigManager';

export class Persistence implements ConfigStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        localId TEXT PRIMARY KEY,
        taskId TEXT,
        status TEXT NOT NULL,
        params TEXT NOT NULL,
        profileId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        videoUrl TEXT,
        localVideoPath TEXT,
        errorCode TEXT,
        errorMessage TEXT
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        localId TEXT NOT NULL,
        capability TEXT NOT NULL,
        prompt TEXT,
        params TEXT NOT NULL,
        localVideoPath TEXT NOT NULL,
        thumbnailPath TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        region TEXT NOT NULL,
        baseUrl TEXT
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // ---- 参数序列化（PBT-02 往返） ----
  serializeParams(p: GenParams): string {
    return JSON.stringify(p);
  }
  deserializeParams(s: string): GenParams {
    return JSON.parse(s) as GenParams;
  }

  // ---- tasks ----
  upsertTask(t: TaskRecord): void {
    this.db
      .prepare(
        `INSERT INTO tasks (localId,taskId,status,params,profileId,createdAt,updatedAt,videoUrl,localVideoPath,errorCode,errorMessage)
         VALUES (@localId,@taskId,@status,@params,@profileId,@createdAt,@updatedAt,@videoUrl,@localVideoPath,@errorCode,@errorMessage)
         ON CONFLICT(localId) DO UPDATE SET
           taskId=@taskId,status=@status,params=@params,updatedAt=@updatedAt,
           videoUrl=@videoUrl,localVideoPath=@localVideoPath,errorCode=@errorCode,errorMessage=@errorMessage`
      )
      .run({
        ...t,
        taskId: t.taskId ?? null,
        params: this.serializeParams(t.params),
        videoUrl: t.videoUrl ?? null,
        localVideoPath: t.localVideoPath ?? null,
        errorCode: t.errorCode ?? null,
        errorMessage: t.errorMessage ?? null
      });
  }

  getTask(localId: string): TaskRecord | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE localId=?').get(localId) as any;
    return row ? this.#rowToTask(row) : undefined;
  }

  listTasks(): TaskRecord[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY createdAt DESC').all() as any[];
    return rows.map((r) => this.#rowToTask(r));
  }

  /** 未完成任务（用于重启恢复） */
  listUnfinishedTasks(): TaskRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE status IN ('QUEUED','SUBMITTING','PENDING','RUNNING','DOWNLOADING')`)
      .all() as any[];
    return rows.map((r) => this.#rowToTask(r));
  }

  deleteTask(localId: string): void {
    this.db.prepare('DELETE FROM tasks WHERE localId=?').run(localId);
  }

  #rowToTask(r: any): TaskRecord {
    return {
      localId: r.localId,
      taskId: r.taskId ?? undefined,
      status: r.status,
      params: this.deserializeParams(r.params),
      profileId: r.profileId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      videoUrl: r.videoUrl ?? undefined,
      localVideoPath: r.localVideoPath ?? undefined,
      errorCode: r.errorCode ?? undefined,
      errorMessage: r.errorMessage ?? undefined
    };
  }

  // ---- history ----
  insertHistory(h: HistoryItem): void {
    this.db
      .prepare(
        `INSERT INTO history (id,localId,capability,prompt,params,localVideoPath,thumbnailPath,createdAt)
         VALUES (@id,@localId,@capability,@prompt,@params,@localVideoPath,@thumbnailPath,@createdAt)`
      )
      .run({ ...h, prompt: h.prompt ?? null, params: this.serializeParams(h.params), thumbnailPath: h.thumbnailPath ?? null });
  }

  listHistory(): HistoryItem[] {
    const rows = this.db.prepare('SELECT * FROM history ORDER BY createdAt DESC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      localId: r.localId,
      capability: r.capability,
      prompt: r.prompt ?? undefined,
      params: this.deserializeParams(r.params),
      localVideoPath: r.localVideoPath,
      thumbnailPath: r.thumbnailPath ?? undefined,
      createdAt: r.createdAt
    }));
  }

  getHistory(id: string): HistoryItem | undefined {
    return this.listHistory().find((h) => h.id === id);
  }

  // ---- ConfigStore 实现（AppConfig + Profile） ----
  getConfig(): AppConfig | undefined {
    const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get('appConfig') as any;
    return row ? (JSON.parse(row.value) as AppConfig) : undefined;
  }
  setConfig(c: AppConfig): void {
    this.db
      .prepare(`INSERT INTO kv (key,value) VALUES ('appConfig',@v) ON CONFLICT(key) DO UPDATE SET value=@v`)
      .run({ v: JSON.stringify(c) });
  }
  listProfiles(): Profile[] {
    const rows = this.db.prepare('SELECT * FROM profiles').all() as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, region: r.region, baseUrl: r.baseUrl ?? undefined }));
  }
  upsertProfile(p: Profile): void {
    this.db
      .prepare(
        `INSERT INTO profiles (id,name,region,baseUrl) VALUES (@id,@name,@region,@baseUrl)
         ON CONFLICT(id) DO UPDATE SET name=@name,region=@region,baseUrl=@baseUrl`
      )
      .run({ ...p, baseUrl: p.baseUrl ?? null });
  }
  deleteProfile(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id=?').run(id);
  }

  close(): void {
    this.db.close();
  }
}
