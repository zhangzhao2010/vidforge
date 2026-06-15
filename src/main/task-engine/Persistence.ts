// U3 task-engine — Persistence (SQLite via better-sqlite3)
// 四类数据：tasks（容器）/ generations（单次生成）/ profiles / kv（含 AppConfig）。
// 参数以 JSON 序列化（PBT-02 往返对象）。
// v2：从 v1 的扁平 tasks 表迁移到 tasks(容器)+generations(单次) 两层模型。

import Database from 'better-sqlite3';
import type { AppConfig, Profile, Task, Generation, GenParams } from '@shared/types';
import type { ConfigStore } from '../core-config/ConfigManager';

export class Persistence implements ConfigStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  migrate(): void {
    // v2：清空重来。drop 掉 v1 残留的扁平 tasks / history 表，重建两层模型。
    this.db.exec(`
      DROP TABLE IF EXISTS history;
    `);
    // 仅当存在 v1 旧结构（tasks 表无 name 列）时丢弃重建，避免污染。
    const hasLegacyTasks = this.#tableExists('tasks') && !this.#columnExists('tasks', 'name');
    if (hasLegacyTasks) {
      this.db.exec(`DROP TABLE IF EXISTS tasks; DROP TABLE IF EXISTS generations;`);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        capability TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS generations (
        localId TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        taskRemoteId TEXT,
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
      CREATE INDEX IF NOT EXISTS idx_generations_taskId ON generations(taskId);
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

  #tableExists(name: string): boolean {
    return !!this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
  }
  #columnExists(table: string, column: string): boolean {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
  }

  // ---- 参数序列化（PBT-02 往返） ----
  serializeParams(p: GenParams): string {
    return JSON.stringify(p);
  }
  deserializeParams(s: string): GenParams {
    return JSON.parse(s) as GenParams;
  }

  // ---- tasks（容器） ----
  upsertTaskContainer(t: Task): void {
    this.db
      .prepare(
        `INSERT INTO tasks (id,name,capability,createdAt,updatedAt)
         VALUES (@id,@name,@capability,@createdAt,@updatedAt)
         ON CONFLICT(id) DO UPDATE SET name=@name,updatedAt=@updatedAt`
      )
      .run(t);
  }

  getTaskContainer(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as any;
    return row ? this.#rowToTask(row) : undefined;
  }

  listTaskContainers(): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY createdAt DESC').all() as any[];
    return rows.map((r) => this.#rowToTask(r));
  }

  deleteTaskContainer(id: string): void {
    const tx = this.db.transaction((tid: string) => {
      this.db.prepare('DELETE FROM generations WHERE taskId=?').run(tid);
      this.db.prepare('DELETE FROM tasks WHERE id=?').run(tid);
    });
    tx(id);
  }

  #rowToTask(r: any): Task {
    return { id: r.id, name: r.name, capability: r.capability, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }

  // ---- generations（单次生成） ----
  upsertGeneration(g: Generation): void {
    this.db
      .prepare(
        `INSERT INTO generations (localId,taskId,taskRemoteId,status,params,profileId,createdAt,updatedAt,videoUrl,localVideoPath,errorCode,errorMessage)
         VALUES (@localId,@taskId,@taskRemoteId,@status,@params,@profileId,@createdAt,@updatedAt,@videoUrl,@localVideoPath,@errorCode,@errorMessage)
         ON CONFLICT(localId) DO UPDATE SET
           taskRemoteId=@taskRemoteId,status=@status,params=@params,updatedAt=@updatedAt,
           videoUrl=@videoUrl,localVideoPath=@localVideoPath,errorCode=@errorCode,errorMessage=@errorMessage`
      )
      .run({
        ...g,
        taskRemoteId: g.taskRemoteId ?? null,
        params: this.serializeParams(g.params),
        videoUrl: g.videoUrl ?? null,
        localVideoPath: g.localVideoPath ?? null,
        errorCode: g.errorCode ?? null,
        errorMessage: g.errorMessage ?? null
      });
  }

  getGeneration(localId: string): Generation | undefined {
    const row = this.db.prepare('SELECT * FROM generations WHERE localId=?').get(localId) as any;
    return row ? this.#rowToGeneration(row) : undefined;
  }

  listGenerations(): Generation[] {
    const rows = this.db.prepare('SELECT * FROM generations ORDER BY createdAt DESC').all() as any[];
    return rows.map((r) => this.#rowToGeneration(r));
  }

  listGenerationsByTask(taskId: string): Generation[] {
    const rows = this.db.prepare('SELECT * FROM generations WHERE taskId=? ORDER BY createdAt ASC').all(taskId) as any[];
    return rows.map((r) => this.#rowToGeneration(r));
  }

  /** 未完成生成（用于重启恢复） */
  listUnfinishedGenerations(): Generation[] {
    const rows = this.db
      .prepare(`SELECT * FROM generations WHERE status IN ('QUEUED','SUBMITTING','PENDING','RUNNING','DOWNLOADING')`)
      .all() as any[];
    return rows.map((r) => this.#rowToGeneration(r));
  }

  deleteGeneration(localId: string): void {
    this.db.prepare('DELETE FROM generations WHERE localId=?').run(localId);
  }

  #rowToGeneration(r: any): Generation {
    return {
      localId: r.localId,
      taskId: r.taskId,
      taskRemoteId: r.taskRemoteId ?? undefined,
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
