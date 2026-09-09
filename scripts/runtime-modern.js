'use strict';
const fs = require('fs');
const crypto = require('crypto');
const adapter = require('./adapter-26.901');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

function read(fd, size, offset) {
  const b = Buffer.alloc(size);
  let n = 0;
  while (n < size) {
    const count = fs.readSync(fd, b, n, size - n, offset + n);
    if (!count) throw Error('Truncated ASAR');
    n += count;
  }
  return b;
}
function entries(header, prefix = '', result = []) {
  for (const [name, entry] of Object.entries(header.files ?? {})) {
    const p = prefix + name;
    if (entry.files) entries(entry, p + '/', result);
    else result.push({path: p, entry});
  }
  return result;
}
function open(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const p = read(fd, 16, 0);
    const size = p.readUInt32LE(12);
    if (p.readUInt32LE(0) !== 4 || size > 64 * 1024 * 1024 || size + 8 > p.readUInt32LE(4)) throw Error('Invalid ASAR header');
    const header = JSON.parse(read(fd, size, 16));
    const offset = 8 + p.readUInt32LE(4);
    const all = entries(header);
    const content = target => read(fd, Number(target.entry.size), offset + Number(target.entry.offset));
    const pkg = all.find(e => e.path === 'package.json');
    const version = pkg ? JSON.parse(content(pkg)).version : null;
    return {fd, header, offset, all, content, version};
  } catch (error) { fs.closeSync(fd); throw error; }
}
function inspect(file) {
  const a = open(file);
  try {
    const result = {appVersion: a.version, supportedAppVersions: ['26.814.41407', adapter.version], adapterId: null, status: 'unsupported-or-mixed', chunks: {}, reason: 'No exact version adapter; standard pet remains available'};
    if (a.version !== adapter.version) return result;
    result.adapterId = adapter.id;
    for (const [key, spec] of Object.entries(adapter.targets)) {
      const candidates = a.all.filter(e => spec.pattern.test(e.path));
      if (candidates.length !== 1 || candidates[0].entry.unpacked) {
        result.reason = 'Missing, ambiguous, or unpacked module: ' + key;
        return result;
      }
      const target = candidates[0];
      const b = a.content(target), sha = digest(b);
      const integrity = target.entry.integrity;
      const blockSize = Number(integrity?.blockSize);
      const blocks = [];
      if (blockSize > 0) for (let i = 0; i < b.length; i += blockSize) blocks.push(digest(b.subarray(i, i + blockSize)));
      const valid = integrity?.algorithm === 'SHA256' && integrity.hash === sha && JSON.stringify(blocks) === JSON.stringify(integrity.blocks);
      result.chunks[key] = {path: target.path, sha256: sha, integrity: valid, official: sha === spec.sha256 && valid, patched: sha === spec.patchedSha256 && valid};
    }
    const chunks = Object.values(result.chunks);
    result.status = chunks.every(c => c.official) ? 'official-supported' : chunks.every(c => c.patched) ? 'patched' : 'unsupported-or-mixed';
    result.reason = result.status === 'patched' ? 'Exact patched hashes verified; UI acceptance still required' : result.status === 'official-supported' ? 'Exact official hashes verified; enhancement not installed' : 'Module hash or ASAR integrity mismatch; refusing writes';
    return result;
  } finally { fs.closeSync(a.fd); }
}
function apply(input, output) {
  if (process.platform !== "linux") throw Error("Runtime adapter supports Linux only");
  const status = inspect(input);
  if (status.status !== 'official-supported') throw Error('Refusing patch: ' + status.reason);
  const a = open(input);
  let outputFd;
  let created = false;
  try {
    const changes = new Map();
    for (const [key, spec] of Object.entries(adapter.targets)) {
      const target = a.all.find(e => e.path === status.chunks[key].path);
      const b = Buffer.from(spec.transform(a.content(target).toString('utf8')));
      if (digest(b) !== spec.patchedSha256) throw Error('Unexpected transformed hash: ' + key);
      changes.set(target.path, b);
    }
    const packed = a.all.filter(e => !e.entry.unpacked && e.entry.offset != null).sort((x,y) => Number(x.entry.offset) - Number(y.entry.offset));
    const plan = []; let next = 0;
    for (const target of packed) {
      const sourceOffset = a.offset + Number(target.entry.offset), sourceSize = Number(target.entry.size);
      const b = changes.get(target.path);
      plan.push({sourceOffset, sourceSize, b});
      target.entry.offset = String(next);
      if (b) {
        target.entry.size = b.length;
        const integrity = target.entry.integrity;
        integrity.hash = digest(b); integrity.blocks = [];
        for (let i = 0; i < b.length; i += integrity.blockSize) integrity.blocks.push(digest(b.subarray(i, i + integrity.blockSize)));
      }
      next += Number(target.entry.size);
    }
    const json = Buffer.from(JSON.stringify(a.header));
    const aligned = Math.ceil((4 + json.length) / 4) * 4;
    const header = Buffer.alloc(16 + aligned - 4);
    header.writeUInt32LE(4, 0); header.writeUInt32LE(4 + aligned, 4);
    header.writeUInt32LE(aligned, 8); header.writeUInt32LE(json.length, 12); json.copy(header, 16);
    outputFd = fs.openSync(output, 'wx', 0o600); created = true;
    function write(b) { let n = 0; while (n < b.length) { const count = fs.writeSync(outputFd, b, n, b.length-n); if (!count) throw Error('Short write'); n += count; } }
    write(header);
    for (const step of plan) {
      if (step.b) write(step.b);
      else for (let i = 0; i < step.sourceSize; i += 1024 * 1024) write(read(a.fd, Math.min(1024 * 1024, step.sourceSize-i), step.sourceOffset+i));
    }
    fs.fsyncSync(outputFd); fs.closeSync(outputFd); outputFd = undefined;
    const result = inspect(output);
    if (result.status !== 'patched') throw Error('Post-write verification failed');
    return result;
  } catch(error) {
    if (outputFd !== undefined) fs.closeSync(outputFd);
    if (created) fs.unlinkSync(output);
    throw error;
  } finally { fs.closeSync(a.fd); }
}
module.exports = {inspect, apply, open, digest, adapter};
