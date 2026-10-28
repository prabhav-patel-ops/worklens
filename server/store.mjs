import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  emptyWorkspace,
  validateWorkspace,
  copy,
  assert,
} from "../shared/domain.js";
export class Store {
  constructor(path = ":memory:", encryptionKey = "") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.key = encryptionKey;
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS secrets (connection_id TEXT PRIMARY KEY, encrypted TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, json TEXT NOT NULL);",
    );
    this.db
      .prepare("INSERT OR IGNORE INTO workspace(id,json) VALUES(1,?)")
      .run(JSON.stringify(emptyWorkspace()));
  }
  read() {
    return validateWorkspace(
      JSON.parse(
        this.db.prepare("SELECT json FROM workspace WHERE id=1").get().json,
      ),
    );
  }
  save(s) {
    validateWorkspace(s);
    this.db
      .prepare("UPDATE workspace SET json=? WHERE id=1")
      .run(JSON.stringify(s));
    return s;
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn(this.read());
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  encrypt(id, token) {
    assert(
      /^[a-fA-F0-9]{64}$/.test(this.key),
      "Set a 64-character hexadecimal encryption key before saving private repository access.",
    );
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", Buffer.from(this.key, "hex"), iv);
    cipher.setAAD(Buffer.from(id));
    const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data]
      .map((v) => v.toString("base64"))
      .join(".");
  }
  setSecret(id, token) {
    const encrypted = this.encrypt(id, token);
    this.db
      .prepare(
        "INSERT OR REPLACE INTO secrets(connection_id,encrypted) VALUES(?,?)",
      )
      .run(id, encrypted);
  }
  secret(id) {
    const row = this.db
      .prepare("SELECT encrypted FROM secrets WHERE connection_id=?")
      .get(id);
    if (!row) return "";
    const [iv, tag, data] = row.encrypted
      .split(".")
      .map((v) => Buffer.from(v, "base64"));
    const d = createDecipheriv("aes-256-gcm", Buffer.from(this.key, "hex"), iv);
    d.setAAD(Buffer.from(id));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString("utf8");
  }
  forget(id) {
    this.db.prepare("DELETE FROM secrets WHERE connection_id=?").run(id);
  }
  request(id) {
    const row = this.db.prepare("SELECT json FROM requests WHERE id=?").get(id);
    return row ? JSON.parse(row.json) : null;
  }
  putRequest(r) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO requests(id,fingerprint,json) VALUES(?,?,?)",
      )
      .run(r.id, r.fingerprint, JSON.stringify(r));
  }
  close() {
    this.db.close();
  }
}
