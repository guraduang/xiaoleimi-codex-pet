'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {phase, animation} = require('./adapter-26.901');
const {inspect, apply, open, digest} = require('./runtime-modern');
const frames = (row, count, duration, last) => Array.from({length: count}, (_, column) => ({rowIndex: row, columnIndex: column, frameDurationMs: column === count - 1 ? last : duration}));
const standard = {idle: frames(0,6,140,280), running: frames(7,6,120,220), waiting: frames(6,6,150,260), failed: frames(5,8,140,240), review: frames(8,6,150,280), jumping: frames(4,5,140,280)};
const idle = standard.idle.map(f => ({...f,frameDurationMs:f.frameDurationMs*6}));
test('thinking, active tools, output, metadata tail and turn reset', () => {
  assert.equal(phase(), 'running');
  assert.equal(phase({items:[{type:'reasoning'}]}),'T');
  assert.equal(phase({items:[{type:'commandExecution',status:'inProgress'},{type:'reasoning'}]}),'running');
  assert.equal(phase({items:[{type:'commandExecution',status:'completed'},{type:'reasoning'}]}),'T');
  assert.equal(phase({items:[{type:'mcpToolCall',status:'completed'},{type:'agentMessage'},{type:'tokenCount'}]}),'Y');
  assert.equal(phase({items:[{type:'webSearch'}]}),'running');
  assert.equal(phase({items:[]}),'running');
});
test('custom maps preserve exact row/column sequence and continuously loop', () => {
  for (const [state, expected] of Object.entries({T:[[7,0],[7,1],[7,2]], running:[[7,3],[7,4],[7,5],[8,0]], review:[[7,1],[7,2],[7,3],[7,4],[7,5]],Y:standard.waiting.map(f=>[f.rowIndex,f.columnIndex])})) {
    const result=animation(state,false,true,standard,idle,frames);
    assert.deepEqual(result.frames.map(f=>[f.rowIndex,f.columnIndex]),expected);
    assert.equal(result.loopStartIndex,0);
  }
});
test('other pets retain official loop, including fallback for detailed states', () => {
  for (const state of ['running','T','Y']) {
    const result=animation(state,false,false,standard,idle,frames);
    assert.deepEqual(result.frames,[...standard.running,...standard.running,...standard.running,...idle]);
    assert.equal(result.loopStartIndex,18);
  }
});
test('reduced motion, waiting/error, idle and hover remain valid', () => {
  for (const state of ['running','T','Y','waiting','failed','review','idle','jumping']) {
    const still=animation(state,true,true,standard,idle,frames);
    assert.equal(still.frames.length,1);assert.equal(still.loopStartIndex,null);
  }
  assert.deepEqual(animation('idle',false,true,standard,idle,frames).frames,idle);
  assert.equal(animation('jumping',false,true,standard,idle,frames).loopStartIndex,15);
  assert.equal(animation('waiting',false,true,standard,idle,frames).frames[0].rowIndex,6);
  assert.equal(animation('failed',false,true,standard,idle,frames).frames[0].rowIndex,5);
});

test('ASAR integration: exact transforms, every unrelated file, repeat and drift rejection', {skip: !process.env.XIAOLEIMI_TEST_ORIGINAL}, () => {
  const original=process.env.XIAOLEIMI_TEST_ORIGINAL;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaoleimi-test-'));
  const output=path.join(dir,'patched.asar');
  try {
    assert.equal(inspect(original).status,'official-supported');
    assert.equal(apply(original,output).status,'patched');
    assert.throws(()=>apply(output,path.join(dir,'repeat.asar')),/Refusing patch/);
    assert.throws(()=>apply(original,output),/EEXIST/);
    const a=open(original),b=open(output);
    try {
      assert.equal(a.all.length,b.all.length);
      const changed=[];
      const byPath = new Map(b.all.map(e=>[e.path,e]));
      for (const entry of a.all) {
        const next=byPath.get(entry.path);
        assert.ok(next);
        if(entry.entry.offset==null || entry.entry.unpacked) { assert.deepEqual(next.entry,entry.entry);continue; }
        if(digest(a.content(entry))!==digest(b.content(next))) changed.push(entry.path);
      }
      assert.deepEqual(changed.sort(),Object.values(inspect(output).chunks).map(c=>c.path).sort());
      const target=b.all.find(e=>e.path===inspect(output).chunks.page.path);
      const fd=fs.openSync(output,'r+');
      const position=b.offset+Number(target.entry.offset)+100;
      fs.writeSync(fd,Buffer.from('!'),0,1,position);fs.closeSync(fd);
    } finally { fs.closeSync(a.fd);fs.closeSync(b.fd); }
    assert.equal(inspect(output).status,'unsupported-or-mixed');
    assert.throws(()=>apply(output,path.join(dir,'drift.asar')),/Refusing patch/);
    assert.ok(!fs.existsSync(path.join(dir,'drift.asar')));
    // Version changes must not be accepted even when every target hash still matches.
    fs.copyFileSync(original,output);
    const archive=open(output);
    try {
      const pkg=archive.all.find(e=>e.path==='package.json');
      const data=archive.content(pkg), text=data.toString();
      const updated=Buffer.from(text.replace('26.901.20858','26.999.99999'));
      assert.equal(updated.length,data.length);
      const fd=fs.openSync(output,'r+');fs.writeSync(fd,updated,0,updated.length,archive.offset+Number(pkg.entry.offset));fs.closeSync(fd);
    } finally { fs.closeSync(archive.fd); }
    assert.equal(inspect(output).status,'unsupported-or-mixed');
    assert.throws(()=>apply(output,path.join(dir,'unknown.asar')),/Refusing patch/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
