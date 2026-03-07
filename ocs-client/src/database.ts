import DatabaseBetter from 'better-sqlite3';

export interface Space {
  id: string;
  name: string;
  createdAt: string;
  isPaused: boolean;
  pausedAt?: string;
}

export interface Member {
  id: string;
  spaceId: string;
  name: string;
  soulMd: string;
  agentId: string;
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
  private db: DatabaseBetter.Database;

  constructor(dbPath: string) {
    this.db = new DatabaseBetter(dbPath);
    // Enable foreign key constraints
    this.db.pragma('foreign_keys = ON');
    this.initTables();
  }

  private initTables() {
    // Spaces table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_paused INTEGER NOT NULL DEFAULT 0,
        paused_at TEXT
      )
    `);

    // Migrate existing tables if needed
    this.migrateTables();

    // Members table with cascade delete
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        name TEXT NOT NULL,
        soul_md TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
      )
    `);

    // Messages table with cascade delete
    this.db.exec(`
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
    this.db.exec(`
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
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_members_space ON members(space_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_space ON messages(space_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)`);
  }


  // Space operations
  createSpace(id: string, name: string): Space {
    const createdAt = new Date().toISOString();
    this.db.prepare('INSERT INTO spaces (id, name, created_at, is_paused) VALUES (?, ?, ?, ?)').run(id, name, createdAt, 0);
    return { id, name, createdAt, isPaused: false };
  }

  getSpace(id: string): Space | null {
    const row = this.db.prepare('SELECT * FROM spaces WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      isPaused: row.is_paused === 1,
      pausedAt: row.paused_at || undefined
    };
  }

  getAllSpaces(): Space[] {
    const rows = this.db.prepare('SELECT * FROM spaces ORDER BY created_at DESC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      isPaused: row.is_paused === 1,
      pausedAt: row.paused_at || undefined
    }));
  }

  deleteSpace(spaceId: string): void {
    // Use transaction to ensure all or nothing deletion
    const deleteMessages = this.db.prepare('DELETE FROM messages WHERE space_id = ?');
    const deleteMembers = this.db.prepare('DELETE FROM members WHERE space_id = ?');
    const deleteSpace = this.db.prepare('DELETE FROM spaces WHERE id = ?');

    const transaction = this.db.transaction(() => {
      deleteMessages.run(spaceId);
      deleteMembers.run(spaceId);
      deleteSpace.run(spaceId);
    });

    transaction();
  }

  // Pause/Resume operations
  pauseSpace(spaceId: string): boolean {
    const pausedAt = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE spaces SET is_paused = 1, paused_at = ? WHERE id = ?');
    const result = stmt.run(pausedAt, spaceId);
    return result.changes > 0;
  }

  resumeSpace(spaceId: string): boolean {
    const stmt = this.db.prepare('UPDATE spaces SET is_paused = 0, paused_at = NULL WHERE id = ?');
    const result = stmt.run(spaceId);
    return result.changes > 0;
  }

  updateSpace(spaceId: string, updates: { name?: string; isPaused?: boolean }): boolean {
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
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  // Member operations
  createMember(id: string, spaceId: string, name: string, soulMd: string, agentId: string): Member {
    this.db.prepare('INSERT INTO members (id, space_id, name, soul_md, agent_id) VALUES (?, ?, ?, ?, ?)').run(id, spaceId, name, soulMd, agentId);
    return { id, spaceId, name, soulMd, agentId };
  }

  getMembersBySpace(spaceId: string): Member[] {
    const rows = this.db.prepare('SELECT * FROM members WHERE space_id = ?').all(spaceId) as any[];
    return rows.map(row => ({
      id: row.id,
      spaceId: row.space_id,
      name: row.name,
      soulMd: row.soul_md,
      agentId: row.agent_id
    }));
  }

  getMember(id: string): Member | null {
    const row = this.db.prepare('SELECT * FROM members WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      spaceId: row.space_id,
      name: row.name,
      soulMd: row.soul_md,
      agentId: row.agent_id
    };
  }

  deleteMember(memberId: string): void {
    this.db.prepare('DELETE FROM members WHERE id = ?').run(memberId);
  }

  // Message operations
  createMessage(id: string, spaceId: string, senderId: string, content: string, attachments?: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>[]): Message {
    const timestamp = new Date().toISOString();
    this.db.prepare('INSERT INTO messages (id, space_id, sender_id, content, timestamp) VALUES (?, ?, ?, ?, ?)').run(id, spaceId, senderId, content, timestamp);

    // Save attachments if provided
    const savedAttachments: Attachment[] = [];
    if (attachments && attachments.length > 0) {
      const insertAttachment = this.db.prepare(`
        INSERT INTO attachments (id, message_id, type, original_name, stored_name, relative_path, file_size, mime_type, thumbnail_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const att of attachments) {
        const attachmentId = this.generateId();
        const createdAt = timestamp;
        insertAttachment.run(
          attachmentId,
          id,
          att.type,
          att.originalName,
          att.storedName,
          att.relativePath,
          att.fileSize,
          att.mimeType,
          att.thumbnailPath || null,
          createdAt
        );
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

    return { id, spaceId, senderId, content, timestamp, attachments: savedAttachments.length > 0 ? savedAttachments : undefined };
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getMessagesBySpace(spaceId: string, limit: number = 100): Message[] {
    const rows = this.db.prepare('SELECT * FROM messages WHERE space_id = ? ORDER BY timestamp DESC LIMIT ?').all(spaceId, limit) as any[];
    const messages = rows.map(row => ({
      id: row.id,
      spaceId: row.space_id,
      senderId: row.sender_id,
      content: row.content,
      timestamp: row.timestamp
    }));

    // Load attachments for each message
    for (const message of messages) {
      message.attachments = this.getAttachmentsByMessageId(message.id);
    }

    return messages.reverse();
  }

  private getAttachmentsByMessageId(messageId: string): Attachment[] {
    const rows = this.db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId) as any[];
    return rows.map(row => ({
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
    }));
  }

  getMessagesBySpaceBeforeId(spaceId: string, beforeId: string, limit: number = 50): Message[] {
    // First get the timestamp of the beforeId message
    const beforeMessage = this.db.prepare('SELECT timestamp FROM messages WHERE id = ?').get(beforeId) as any;
    if (!beforeMessage) {
      return [];
    }

    // Get messages older than or equal to the beforeId message timestamp,
    // but exclude the beforeId message itself
    // We use timestamp <= beforeMessage.timestamp to include messages with same timestamp
    // and id != beforeId to exclude the beforeId message itself
    const rows = this.db.prepare(
      'SELECT * FROM messages WHERE space_id = ? AND (timestamp < ? OR (timestamp = ? AND id != ?)) ORDER BY timestamp DESC, id DESC LIMIT ?'
    ).all(spaceId, beforeMessage.timestamp, beforeMessage.timestamp, beforeId, limit) as any[];

    const messages = rows.map(row => ({
      id: row.id,
      spaceId: row.space_id,
      senderId: row.sender_id,
      content: row.content,
      timestamp: row.timestamp
    }));

    // Load attachments for each message
    for (const message of messages) {
      message.attachments = this.getAttachmentsByMessageId(message.id);
    }

    return messages.reverse();
  }

  private migrateTables() {
    try {
      // Check if is_paused column exists
      const columns = this.db.prepare("PRAGMA table_info(spaces)").all() as any[];
      const hasIsPaused = columns.some(col => col.name === 'is_paused');

      if (!hasIsPaused) {
        console.log('[Database] Migrating spaces table to add pause columns...');
        // Add is_paused column
        this.db.exec('ALTER TABLE spaces ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0');
        // Add paused_at column
        this.db.exec('ALTER TABLE spaces ADD COLUMN paused_at TEXT');
        console.log('[Database] Migration completed successfully');
      }

      // Check if attachments table exists
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'").all() as any[];
      if (tables.length === 0) {
        console.log('[Database] Migrating to add attachments table...');
        this.db.exec(`
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
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id)`);
        console.log('[Database] Attachments table migration completed successfully');
      }
    } catch (error) {
      console.error('[Database] Migration error:', error);
    }
  }

  close() {
    this.db.close();
  }
}
