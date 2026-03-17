import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

export interface Space {
  id: string;
  name: string;
  createdAt: string;
  isPaused: boolean;
  pausedAt?: string;
  language?: string;
}

export interface Member {
  id: string;
  spaceId: string;
  name: string;
  soulMd: string;
  identityMd?: string;
  agentId: string;
  isBuiltIn?: boolean;
  role?: 'host' | 'member';
}

export interface Attachment {
  id: string;
  messageId: string;
  type: 'image' | 'document' | 'media' | 'file';
  originalName: string;
  storedName: string;
  relativePath: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  spaceId: string;
  senderId: string;
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

export class Database {
  private db: any;
  private dbPath: string;
  private SQL: any;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    // Initialize sql.js
    this.SQL = await initSqlJs();

    // Load existing database if exists
    if (fs.existsSync(this.dbPath)) {
      const data = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(data);
    } else {
      this.db = new this.SQL.Database();
    }

    // Enable foreign key constraints
    this.db.run('PRAGMA foreign_keys = ON');
    await this.initTables();
  }

  private async initTables(): Promise<void> {
    // Spaces table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_paused INTEGER NOT NULL DEFAULT 0,
        paused_at TEXT,
        language TEXT DEFAULT 'zh'
      )
    `);

    // Migrate existing tables if needed
    await this.migrateTables();

    // Members table with cascade delete and host support
    this.db.run(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        name TEXT NOT NULL,
        soul_md TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        is_built_in INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'member',
        identity_md TEXT,
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
      )
    `);

    // Messages table with cascade delete
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
      )
    `);

    // Attachments table with cascade delete
    this.db.run(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        type TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        thumbnail_path TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_members_space ON members(space_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_space ON messages(space_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)`);

    // Save to disk
    await this.save();
  }

  private async save(): Promise<void> {
    const data = this.db.export();
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  // Space operations
  async createSpace(id: string, name: string, language?: string): Promise<Space> {
    const createdAt = new Date().toISOString();
    const lang = language || 'zh';
    this.db.run('INSERT INTO spaces (id, name, created_at, is_paused, language) VALUES (?, ?, ?, ?, ?)', [id, name, createdAt, 0, lang]);
    await this.save();
    return { id, name, createdAt, isPaused: false, language: lang };
  }

  getSpace(id: string): Space | null {
    const stmt = this.db.prepare('SELECT * FROM spaces WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      isPaused: Number(row.is_paused) === 1,
      pausedAt: row.paused_at || undefined,
      language: row.language || 'zh'
    };
  }

  getAllSpaces(): Space[] {
    const stmt = this.db.prepare('SELECT * FROM spaces ORDER BY created_at DESC');
    const rows: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        isPaused: Number(row.is_paused) === 1,
        pausedAt: row.paused_at || undefined,
        language: row.language || 'zh'
      });
    }
    stmt.free();
    return rows;
  }

  async deleteSpace(spaceId: string): Promise<void> {
    // SQLite in sql.js doesn't support foreign keys properly, so manual deletion
    this.db.run('DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE space_id = ?)', [spaceId]);
    this.db.run('DELETE FROM messages WHERE space_id = ?', [spaceId]);
    this.db.run('DELETE FROM members WHERE space_id = ?', [spaceId]);
    this.db.run('DELETE FROM spaces WHERE id = ?', [spaceId]);
    await this.save();
  }

  // Pause/Resume operations
  async pauseSpace(spaceId: string): Promise<boolean> {
    const pausedAt = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE spaces SET is_paused = 1, paused_at = ? WHERE id = ?');
    stmt.run([pausedAt, spaceId]);
    const changes = this.db.getRowsModified();
    stmt.free();
    await this.save();
    return changes > 0;
  }

  async resumeSpace(spaceId: string): Promise<boolean> {
    const stmt = this.db.prepare('UPDATE spaces SET is_paused = 0, paused_at = NULL WHERE id = ?');
    stmt.run([spaceId]);
    const changes = this.db.getRowsModified();
    stmt.free();
    await this.save();
    return changes > 0;
  }

  async updateSpace(spaceId: string, updates: { name?: string; isPaused?: boolean }): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }

    if (updates.isPaused !== undefined) {
      fields.push('is_paused = ?');
      values.push(updates.isPaused ? 1 : 0);
      if (updates.isPaused) {
        fields.push('paused_at = ?');
        values.push(new Date().toISOString());
      } else {
        fields.push('paused_at = NULL');
      }
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(spaceId);
    const sql = `UPDATE spaces SET ${fields.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(values);
    const changes = this.db.getRowsModified();
    stmt.free();
    await this.save();
    return changes > 0;
  }

  // Member operations
  async createMember(
    id: string,
    spaceId: string,
    name: string,
    soulMd: string,
    agentId: string,
    isBuiltIn: boolean = false,
    role: 'host' | 'member' = 'member',
    identityMd?: string
  ): Promise<Member> {
    this.db.run(
      'INSERT INTO members (id, space_id, name, soul_md, agent_id, is_built_in, role, identity_md) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, spaceId, name, soulMd, agentId, isBuiltIn ? 1 : 0, role, identityMd || '']
    );
    await this.save();
    return { id, spaceId, name, soulMd, agentId, isBuiltIn, role, identityMd };
  }

  getMembersBySpace(spaceId: string): Member[] {
    const stmt = this.db.prepare('SELECT * FROM members WHERE space_id = ?');
    const rows: any[] = [];
    stmt.bind([spaceId]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        spaceId: row.space_id,
        name: row.name,
        soulMd: row.soul_md,
        identityMd: row.identity_md,
        agentId: row.agent_id,
        isBuiltIn: row.is_built_in === 1,
        role: row.role as 'host' | 'member'
      });
    }
    stmt.free();
    return rows;
  }

  getMember(id: string): Member | null {
    const stmt = this.db.prepare('SELECT * FROM members WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return {
      id: row.id,
      spaceId: row.space_id,
      name: row.name,
      soulMd: row.soul_md,
      identityMd: row.identity_md,
      agentId: row.agent_id,
      isBuiltIn: row.is_built_in === 1,
      role: row.role as 'host' | 'member'
    };
  }

  async deleteMember(memberId: string): Promise<void> {
    this.db.run('DELETE FROM members WHERE id = ?', [memberId]);
    await this.save();
  }

  // Message operations
  async createMessage(id: string, spaceId: string, senderId: string, content: string,
    attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[]): Promise<Message> {
    const timestamp = new Date().toISOString();
    this.db.run('INSERT INTO messages (id, space_id, sender_id, content, timestamp) VALUES (?, ?, ?, ?, ?)',
      [id, spaceId, senderId, content, timestamp]);

    // Save attachments if provided
    const savedAttachments: Attachment[] = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const attachmentId = this.generateId();
        const createdAt = timestamp;
        this.db.run(`
          INSERT INTO attachments (id, message_id, type, original_name, stored_name, relative_path, file_size, mime_type, thumbnail_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [attachmentId, id, att.type, att.originalName, att.storedName, att.relativePath, att.fileSize, att.mimeType, att.thumbnailPath || null, createdAt]);
        savedAttachments.push({
          id: attachmentId,
          messageId: id,
          type: att.type,
          originalName: att.originalName,
          storedName: att.storedName,
          relativePath: att.relativePath,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          thumbnailPath: att.thumbnailPath,
          createdAt
        });
      }
    }

    await this.save();
    return { id, spaceId, senderId, content, timestamp, attachments: savedAttachments.length > 0 ? savedAttachments : undefined };
  }

  async updateMessageContent(messageId: string, content: string): Promise<void> {
    this.db.run('UPDATE messages SET content = ? WHERE id = ?', [content, messageId]);
    await this.save();
  }

  async deleteMessage(messageId: string): Promise<void> {
    // Delete attachments first
    this.db.run('DELETE FROM attachments WHERE message_id = ?', [messageId]);
    // Delete message
    this.db.run('DELETE FROM messages WHERE id = ?', [messageId]);
    await this.save();
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
  }

  getMessagesBySpace(spaceId: string, limit: number = 100): Message[] {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE space_id = ? ORDER BY timestamp DESC LIMIT ?');
    const rows: any[] = [];
    stmt.bind([spaceId, limit]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        spaceId: row.space_id,
        senderId: row.sender_id,
        content: row.content,
        timestamp: row.timestamp
      });
    }
    stmt.free();

    // Load attachments for each message
    const messages: Message[] = rows.map(row => ({
      ...row,
      attachments: this.getAttachmentsByMessageId(row.id)
    }));

    return messages.reverse();
  }

  private getAttachmentsByMessageId(messageId: string): Attachment[] {
    const stmt = this.db.prepare('SELECT * FROM attachments WHERE message_id = ?');
    const rows: Attachment[] = [];
    stmt.bind([messageId]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        messageId: row.message_id,
        type: row.type,
        originalName: row.original_name,
        storedName: row.stored_name,
        relativePath: row.relative_path,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        thumbnailPath: row.thumbnail_path || undefined,
        createdAt: row.created_at
      });
    }
    stmt.free();
    return rows;
  }

  getMessagesBySpaceBeforeId(spaceId: string, beforeId: string, limit: number = 50): Message[] {
    // First get the timestamp of the beforeId message
    const beforeStmt = this.db.prepare('SELECT timestamp FROM messages WHERE id = ?');
    beforeStmt.bind([beforeId]);
    if (!beforeStmt.step()) {
      beforeStmt.free();
      return [];
    }
    const beforeMessage = beforeStmt.getAsObject();
    beforeStmt.free();

    // Get messages older than or equal to the beforeId message timestamp
    const stmt = this.db.prepare(
      'SELECT * FROM messages WHERE space_id = ? AND (timestamp < ? OR (timestamp = ? AND id != ?)) ORDER BY timestamp DESC, id DESC LIMIT ?'
    );
    const rows: any[] = [];
    stmt.bind([spaceId, beforeMessage.timestamp, beforeMessage.timestamp, beforeId, limit]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        id: row.id,
        spaceId: row.space_id,
        senderId: row.sender_id,
        content: row.content,
        timestamp: row.timestamp
      });
    }
    stmt.free();

    // Load attachments for each message
    const messages: Message[] = rows.map(row => ({
      ...row,
      attachments: this.getAttachmentsByMessageId(row.id)
    }));

    return messages.reverse();
  }

  private async migrateTables(): Promise<void> {
    try {
      // Check if is_paused column exists
      const stmt = this.db.prepare("PRAGMA table_info(spaces)");
      const columns: any[] = [];
      while (stmt.step()) {
        columns.push(stmt.getAsObject());
      }
      stmt.free();
      const hasIsPaused = columns.some(col => col.name === 'is_paused');

      if (!hasIsPaused) {
        console.log('[Database] Migrating spaces table to add pause columns...');
        this.db.run('ALTER TABLE spaces ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0');
        this.db.run('ALTER TABLE spaces ADD COLUMN paused_at TEXT');
        console.log('[Database] Migration completed successfully');
        await this.save();
      }

      // Check if language column exists
      const hasLanguage = columns.some(col => col.name === 'language');

      if (!hasLanguage) {
        console.log('[Database] Migrating spaces table to add language column...');
        this.db.run('ALTER TABLE spaces ADD COLUMN language TEXT DEFAULT \'zh\'');
        console.log('[Database] Language column migration completed successfully');
        await this.save();
      }
      const tablesStmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'");
      const hasAttachments = tablesStmt.step();
      tablesStmt.free();

      if (!hasAttachments) {
        console.log('[Database] Migrating to add attachments table...');
        this.db.run(`
          CREATE TABLE IF NOT EXISTS attachments (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            type TEXT NOT NULL,
            original_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            mime_type TEXT NOT NULL,
            thumbnail_path TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
          )
        `);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)`);
        console.log('[Database] Attachments table migration completed successfully');
        await this.save();
      }

      // Check if members table has is_built_in and role columns
      const membersStmt = this.db.prepare("PRAGMA table_info(members)");
      const memberColumns: any[] = [];
      while (membersStmt.step()) {
        memberColumns.push(membersStmt.getAsObject());
      }
      membersStmt.free();

      const hasIsBuiltIn = memberColumns.some(col => col.name === 'is_built_in');
      const hasRole = memberColumns.some(col => col.name === 'role');

      if (!hasIsBuiltIn) {
        console.log('[Database] Migrating members table to add is_built_in column...');
        this.db.run('ALTER TABLE members ADD COLUMN is_built_in INTEGER NOT NULL DEFAULT 0');
        console.log('[Database] is_built_in column added successfully');
        await this.save();
      }

      if (!hasRole) {
        console.log('[Database] Migrating members table to add role column...');
        this.db.run("ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
        console.log('[Database] role column added successfully');
        await this.save();
      }

      // Check if members table has identity_md column
      const hasIdentityMd = memberColumns.some(col => col.name === 'identity_md');

      if (!hasIdentityMd) {
        console.log('[Database] Migrating members table to add identity_md column...');
        this.db.run('ALTER TABLE members ADD COLUMN identity_md TEXT');
        console.log('[Database] identity_md column added successfully');
        await this.save();
      }
    } catch (error) {
      console.error('[Database] Migration error:', error);
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
