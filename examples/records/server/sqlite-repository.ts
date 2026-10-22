import { DatabaseSync } from 'node:sqlite';
import { dirname, isAbsolute } from 'node:path';
import { mkdirSync } from 'node:fs';
import { z } from 'zod';
import { ApiError } from 'cordis-web-framework/http-json';
import { recordSchema, type SaveInput } from '../shared/protocol.ts';
import type { RecordRepository, StoredRecord } from './contracts.ts';

const storedSchema = recordSchema.omit({ canEdit: true }).extend({ owner: z.string().min(1) }).strict();
export function openRecordRepository(filename: string): RecordRepository {
  if (!isAbsolute(filename)) throw new TypeError('数据库文件必须使用显式绝对路径');
  mkdirSync(dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  const parse = (value: unknown): StoredRecord => storedSchema.parse(value);
  try {
    database.exec('PRAGMA busy_timeout = 1000; PRAGMA synchronous = FULL;');
    const version = database.prepare('PRAGMA user_version').get()!.user_version;
    if (version !== 0 && version !== 1) throw new Error('不支持的记录数据库版本');
    if (version === 0) {
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec(`CREATE TABLE records (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
          body TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0)) STRICT; PRAGMA user_version = 1;`);
        const insert = database.prepare('INSERT INTO records VALUES (?, ?, ?, ?, 1)');
        insert.run('welcome', 'demo-user', '第一条记录', '编辑后保存，再刷新页面验证。');
        insert.run('second', 'demo-user', '第二条记录', '草稿只属于当前编辑会话。');
        insert.run('private', 'other-user', '他人的记录', '不得通过自报身份访问。');
        database.exec('COMMIT');
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    }
    const get = database.prepare('SELECT id, owner, title, body, revision FROM records WHERE id = ?');
    const read = (id: string) => { const value = get.get(id); if (!value) throw new ApiError('not-found'); return parse(value); };
    return {
      list(subject) { return database.prepare('SELECT id, owner, title, body, revision FROM records WHERE owner = ? ORDER BY id LIMIT 10').all(subject).map(parse); },
      read,
      save(subject: string, input: SaveInput, signal) {
        signal.throwIfAborted();
        database.exec('BEGIN IMMEDIATE');
        try {
          const previous = read(input.id);
          if (previous.owner !== subject) throw new ApiError('forbidden');
          if (previous.revision !== input.revision) throw new ApiError('conflict');
          const result = database.prepare('UPDATE records SET title = ?, body = ?, revision = revision + 1 WHERE id = ? AND owner = ? AND revision = ?')
            .run(input.title, input.body, input.id, subject, input.revision);
          if (result.changes !== 1) throw new ApiError('conflict');
          const saved = read(input.id);
          signal.throwIfAborted();
          database.exec('COMMIT');
          return saved;
        } catch (error) { database.exec('ROLLBACK'); throw error; }
      },
      close() { database.close(); },
    };
  } catch (error) { database.close(); throw error; }
}
