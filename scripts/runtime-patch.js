#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SUPPORTED_APP_VERSION = '26.814.41407';
const PET_ID = 'custom:xiaoleimi';

const TARGETS = {
  frame: {
    pattern: /^webview\/assets\/avatar-overlay-native-frame-[^/]+\.js$/,
    officialSha256: '8f4bf569d299fbb2c68ca23a964fb25eb13b95fbe783bd8b8fb6710fe60d077e',
    patchedMarkers: ['mascotState:e.petState??`running`', 'globalThis.__xiaoleimiToolPhase', 'petState:c===`running`'],
  },
  page: {
    pattern: /^webview\/assets\/avatar-overlay-native-page-[^/]+\.js$/,
    officialSha256: '79247fc20caf40b61e1fc23787e639ce5685b11c536bd89927eb1283c8229bee',
    patchedMarkers: ['e.level,e.petState??``,e.isLoading', 'localConversationId:e.localConversationId,petState:e.petState'],
  },
  petAssets: {
    pattern: /^webview\/assets\/codex-pet-assets-[^/]+\.js$/,
    officialSha256: '0ad4e8d6d4d2ea2e0c85edc1fe64ae55c6e282ce21f47ebfd1de15ce5b2fa832',
    patchedMarkers: [PET_ID, 'aa={T:m(7,3,120,220)', 'review:m(7,6,150,280).slice(1)'],
  },
};

function fail(message) {
  throw new Error(message);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readExactly(fd, length, position) {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const count = fs.readSync(fd, buffer, read, length - read, position + read);
    if (count === 0) fail(`Unexpected EOF at byte ${position + read}`);
    read += count;
  }
  return buffer;
}

function writeExactly(fd, buffer, position) {
  let written = 0;
  while (written < buffer.length) {
    const count = fs.writeSync(fd, buffer, written, buffer.length - written, position + written);
    if (count === 0) fail(`Unable to write at byte ${position + written}`);
    written += count;
  }
}

function openAsar(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const prefix = readExactly(fd, 16, 0);
    if (prefix.readUInt32LE(0) !== 4) fail('Unsupported ASAR header format');
    const headerSize = prefix.readUInt32LE(4);
    const jsonSize = prefix.readUInt32LE(12);
    const headerBuffer = readExactly(fd, jsonSize, 16);
    const header = JSON.parse(headerBuffer.toString('utf8'));
    return { asarPath, fd, header, headerSize, jsonSize, dataOffset: 8 + headerSize };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function closeAsar(archive) {
  fs.closeSync(archive.fd);
}

function walkFiles(node, prefix = '', result = new Map()) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const entryPath = prefix ? `${prefix}/${name}` : name;
    if (entry.files) walkFiles(entry, entryPath, result);
    else result.set(entryPath, entry);
  }
  return result;
}

function locateTargets(archive) {
  const files = walkFiles(archive.header);
  const located = {};
  for (const [key, spec] of Object.entries(TARGETS)) {
    const matches = [...files.entries()].filter(([entryPath]) => spec.pattern.test(entryPath));
    if (matches.length !== 1) fail(`Expected one ${key} chunk, found ${matches.length}`);
    const [entryPath, entry] = matches[0];
    if (entry.unpacked) fail(`${entryPath} is unpacked; this patcher expects an inline ASAR entry`);
    located[key] = { entryPath, entry };
  }
  return located;
}

function readEntry(archive, target) {
  return readExactly(
    archive.fd,
    Number(target.entry.size),
    archive.dataOffset + Number(target.entry.offset),
  );
}

function readPackageVersion(archive) {
  const entry = archive.header.files?.['package.json'];
  if (!entry || entry.files || entry.unpacked) return null;
  try {
    return JSON.parse(readEntry(archive, { entry }).toString('utf8')).version || null;
  } catch {
    return null;
  }
}

function inspectArchive(asarPath) {
  const archive = openAsar(asarPath);
  try {
    const targets = locateTargets(archive);
    const chunks = {};
    for (const [key, target] of Object.entries(targets)) {
      const buffer = readEntry(archive, target);
      const text = buffer.toString('utf8');
      const digest = sha256(buffer);
      chunks[key] = {
        path: target.entryPath,
        size: buffer.length,
        sha256: digest,
        official: digest === TARGETS[key].officialSha256,
        patched: TARGETS[key].patchedMarkers.every((marker) => text.includes(marker)),
      };
    }
    const values = Object.values(chunks);
    const status = values.every((chunk) => chunk.patched)
      ? 'patched'
      : values.every((chunk) => chunk.official)
        ? 'official-supported'
        : 'unsupported-or-mixed';
    return {
      appVersion: readPackageVersion(archive),
      supportedAppVersion: SUPPORTED_APP_VERSION,
      petId: PET_ID,
      status,
      chunks,
    };
  } finally {
    closeAsar(archive);
  }
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) fail(`Patch anchor not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) fail(`Patch anchor is ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceFunction(source, startMarker, endMarker, replacement, requiredMarkers, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) fail(`Function boundary not found: ${label}`);
  const current = source.slice(start, end);
  for (const marker of requiredMarkers) {
    if (!current.includes(marker)) fail(`Unexpected ${label} implementation; missing ${marker}`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

function stripSourceMap(source, label) {
  const next = source.replace(/\n?\/\/# sourceMappingURL=[^\n]*\s*$/, '');
  if (next === source) fail(`Source map trailer not found: ${label}`);
  return next;
}

function fitEntry(source, targetBytes, label) {
  const body = source.replace(/\s+$/, '');
  const wrapperBytes = Buffer.byteLength('\n/**/');
  const bodyBytes = Buffer.byteLength(body);
  const padding = targetBytes - bodyBytes - wrapperBytes;
  if (padding < 0) fail(`${label} grew by ${-padding} bytes after compaction`);
  const result = `${body}\n/*${' '.repeat(padding)}*/`;
  const buffer = Buffer.from(result, 'utf8');
  if (buffer.length !== targetBytes) fail(`${label} size invariant failed`);
  return buffer;
}

function compactFrameDescriptions(source) {
  const start = source.indexOf('var Gr,Kr,qr=');
  const end = source.indexOf('function Jr(', start);
  if (start < 0 || end < 0) fail('Frame i18n compaction boundary not found');
  let section = source.slice(start, end).replace(/,description:`(?:\\.|[^`])*`/g, '');
  section = replaceOnce(
    section,
    'newThread:{id:`avatarOverlay.session.newThread`,defaultMessage:`New chat`}',
    'newThread:{id:`avatarOverlay.session.newThread`,defaultMessage:`New chat`,description:`Avatar overlay fallback title for a thread without a generated title`}',
    'new-thread accessibility description',
  );
  return source.slice(0, start) + section + source.slice(end);
}

function patchFrame(source, targetBytes) {
  source = replaceOnce(
    source,
    'labelMessage:or.running,mascotState:`running`',
    'labelMessage:or.running,mascotState:e.petState??`running`',
    'loading notification petState',
  );

  const patchedIr = 'function Ir({conversation:e,includeCompactWaitingRequests:t,includeMcpElicitationCancelAction:n,intl:r,excludedConversationId:i,threadDetailLevel:a}){if(Ce(e))return null;let o=e.hostId??`local`,s=o===`local`?`local`:`remote-host`,c=Ur(e),l=we(e),v=l?.items??[],y=v.at(-1),w=/^(collabAgentToolCall|commandExecution|dynamicToolCall|fileChange|imageGeneration|imageView|mcpToolCall|sleep|webSearch)$/,b=v.some(e=>(e?.status===`inProgress`||e?.status===`in_progress`)&&w.test(e.type)),x=l?.finalAssistantStartedAtMs??0,S=globalThis.__xiaoleimiToolPhase??=new Map,C=S.get(e.id),E=b||w.test(y?.type),M=[...v].reverse().find(e=>e?.type===`reasoning`)?.id;E&&(C={reasoningId:M},S.set(e.id,C));!E&&C&&(y?.type===`agentMessage`||y?.type===`reasoning`&&y.id!==C.reasoningId)&&(S.delete(e.id),C=null);let P=!!C&&y?.type===`reasoning`&&y.id===C.reasoningId,u=Ne(l),d=u||e.threadSource===`automation`||!1,f=d?Br(e):Rr(e,r,a);if((e.threadSource===`realtime_voice`          )&&c!==`waiting`&&c!==`failed`)return null;let p=t&&c===`waiting`?q(e):null;return{actionPath:`/local/`+e.id,controlTarget:{type:`app-server-conversation`,conversationId:e.id},hostId:o,key:ue(e.id,o),localConversationId:e.id,petState:c===`running`?(E||P?`running`:x>Date.now()-1300||y?.type===`agentMessage`?`Y`:y?.type===`reasoning`?`T`:`running`):c,source:s,showInNotificationTray:!d||c===`waiting`||c===`failed`||u&&c===`review`||f!=null,sortAtMs:l?.turnStartedAtMs??e.updatedAt,status:c,subtitle:f,title:A(e)??r.formatMessage(Kr.newThread),turnKey:String(Ae(e)),updatedAtMs:e.updatedAt,waitingRequest:ur(p,r,{includeMcpElicitationCancelAction:n,planStartCollaborationMode:{mode:`default`,settings:{...e.latestCollaborationMode.settings,developer_instructions:null}}})}}';
  source = replaceFunction(
    source,
    'function Ir(',
    'function Lr(',
    patchedIr,
    ['conversation:e', 'excludedConversationId:i', 'c=Ur(e)', 'localConversationId:e.id'],
    'local conversation activity mapper',
  );

  const patchedUr = 'function Ur(e){let t=e.threadRuntimeStatus,n=t?.type===`active`||e.resumeState===`resuming`||we(e)?.status===`inProgress`,r=e.resumeState===`needs_resume`?t?.type===`active`&&t.activeFlags.includes(`waitingOnUserInput`):e.requests.some(e=>e.method===`item/tool/requestUserInput`),i=$e(e).some(e=>e.items.some(e=>e.type===`planImplementation`&&!e.isCompleted)),a=e.resumeState===`needs_resume`?t?.type===`systemError`:we(e)?.status===`failed`;return nt(e)||r||i?`waiting`:a?`failed`:n?`running`:e.hasUnreadTurn?`review`:`idle`}';
  source = replaceFunction(
    source,
    'function Ur(',
    'function Wr(',
    patchedUr,
    ['resumeState===`needs_resume`', 'threadRuntimeStatus', 'waitingOnUserInput'],
    'conversation status detector',
  );

  source = compactFrameDescriptions(source);
  source = stripSourceMap(source, 'frame');
  return fitEntry(source, targetBytes, 'frame');
}

function patchPage(source, targetBytes) {
  source = replaceOnce(source, ',yk as kn,z7 as An,zC as jn,', ',yk as kn,R7 as An,zC as jn,', 'full conversation hook import');
  source = replaceOnce(
    source,
    'e.body??``,e.level,e.isLoading?`loading`:`done`',
    'e.body??``,e.level,e.petState??``,e.isLoading?`loading`:`done`',
    'petState memo signature',
  );
  source = replaceOnce(
    source,
    'localConversationId:e.localConversationId,notificationPreferenceId:e.key',
    'localConversationId:e.localConversationId,petState:e.petState,notificationPreferenceId:e.key',
    'petState notification transport',
  );
  source = stripSourceMap(source, 'page');
  return fitEntry(source, targetBytes, 'page');
}

function patchPetAssets(source, targetBytes) {
  source = replaceOnce(
    source,
    'l={version:1,width:1536,height:1872,cellWidth:192,cellHeight:208,columns:8,rows:9,requiredFramesByRow:[6,8,8,4,5,8,6,6,6]},u={version:2,width:1536,height:2288,cellWidth:192,cellHeight:208,columns:8,rows:11,requiredFramesByRow:[6,8,8,4,5,8,6,6,6,8,8]}',
    'l={version:1},u={version:2,columns:8,rows:11}',
    'atlas metadata compaction',
  );
  source = replaceFunction(
    source,
    'function f(',
    'function p(',
    'function f(e,t,n){let r=(n?aa[e]:null)??b[e]??b.running;if(t)return{frames:[p(r,0)],loopStartIndex:null};if(e===`idle`)return{frames:y,loopStartIndex:0};if(r[0].rowIndex>4)return{frames:r,loopStartIndex:0};let i=[...r,...r,...r];return{frames:[...i,...y],loopStartIndex:i.length}}',
    ['function f(e,t)', 'let n=b[e]', 'if(e===`idle`)'],
    'pet animation selector',
  );
  source = replaceOnce(source, 'var g,_,v,y,b,x=', 'var g,_,v,y,b,aa,x=', 'custom frame-map variable');
  source = replaceOnce(
    source,
    'waving:m(3,4,140,280),waiting:m(6,6,150,260)}}))',
    'waving:m(3,4,140,280),waiting:m(6,6,150,260)},aa={T:m(7,3,120,220),Y:b.waiting,running:[...m(7,6,120,220).slice(3),...m(8,1,120,220)],review:m(7,6,150,280).slice(1)}}))',
    'Xiaoleimi frame map',
  );

  const effectStart = source.indexOf('return(0,T.useEffect)(()=>{');
  const effectEndMarker = '},[g,n,m,_])';
  const effectEnd = source.indexOf(effectEndMarker, effectStart);
  if (effectStart < 0 || effectEnd < 0) fail('Pet animation effect boundary not found');
  let effect = source.slice(effectStart, effectEnd + effectEndMarker.length);
  effect = replaceOnce(effect, 'let t=f(g,m),', 'let t=f(g,m,o.petId===`custom:xiaoleimi`),', 'custom pet selector call');
  effect = replaceOnce(effect, 'let o=()=>', 'let q=()=>', 'animation callback rename');
  const callbackCalls = (effect.match(/\bo\(\)/g) || []).length;
  if (callbackCalls !== 3) fail(`Expected three animation callback calls, found ${callbackCalls}`);
  effect = effect.replace(/\bo\(\)/g, 'q()');
  effect = replaceOnce(effect, effectEndMarker, '},[g,n,m,_,o.petId])', 'pet id effect dependency');
  source = source.slice(0, effectStart) + effect + source.slice(effectEnd + effectEndMarker.length);

  source = stripSourceMap(source, 'pet assets');
  return fitEntry(source, targetBytes, 'pet assets');
}

function updateIntegrity(entry, buffer) {
  if (!entry.integrity) fail('Target entry has no ASAR integrity metadata');
  const digest = sha256(buffer);
  entry.integrity.hash = digest;
  const blockSize = Number(entry.integrity.blockSize || 4 * 1024 * 1024);
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += blockSize) {
    blocks.push(sha256(buffer.subarray(offset, Math.min(buffer.length, offset + blockSize))));
  }
  entry.integrity.blocks = blocks;
}

function applyPatch(inputPath, outputPath) {
  if (path.resolve(inputPath) === path.resolve(outputPath)) fail('Input and output paths must differ');
  if (fs.existsSync(outputPath)) fail('Output path already exists; refusing to overwrite it');
  const initial = inspectArchive(inputPath);
  if (initial.status === 'patched') fail('Input is already patched');
  if (initial.status !== 'official-supported' || initial.appVersion !== SUPPORTED_APP_VERSION) {
    fail(`Unsupported input: appVersion=${initial.appVersion || 'unknown'}, status=${initial.status}`);
  }

  const archive = openAsar(inputPath);
  let targets;
  const patched = {};
  try {
    targets = locateTargets(archive);
    patched.frame = patchFrame(readEntry(archive, targets.frame).toString('utf8'), Number(targets.frame.entry.size));
    patched.page = patchPage(readEntry(archive, targets.page).toString('utf8'), Number(targets.page.entry.size));
    patched.petAssets = patchPetAssets(readEntry(archive, targets.petAssets).toString('utf8'), Number(targets.petAssets.entry.size));
    for (const [key, buffer] of Object.entries(patched)) updateIntegrity(targets[key].entry, buffer);

    const headerBuffer = Buffer.from(JSON.stringify(archive.header), 'utf8');
    if (headerBuffer.length !== archive.jsonSize) {
      fail(`ASAR header size changed from ${archive.jsonSize} to ${headerBuffer.length}`);
    }

    fs.copyFileSync(inputPath, outputPath);
    const outputFd = fs.openSync(outputPath, 'r+');
    try {
      writeExactly(outputFd, headerBuffer, 16);
      for (const [key, buffer] of Object.entries(patched)) {
        const target = targets[key];
        writeExactly(outputFd, buffer, archive.dataOffset + Number(target.entry.offset));
      }
      fs.fsyncSync(outputFd);
    } finally {
      fs.closeSync(outputFd);
    }
  } catch (error) {
    try { fs.unlinkSync(outputPath); } catch {}
    throw error;
  } finally {
    closeAsar(archive);
  }

  const result = inspectArchive(outputPath);
  if (result.status !== 'patched') {
    try { fs.unlinkSync(outputPath); } catch {}
    fail(`Post-patch verification failed: ${result.status}`);
  }
  return result;
}

function usage() {
  console.error('Usage:');
  console.error('  node scripts/runtime-patch.js inspect /path/to/app.asar');
  console.error('  node scripts/runtime-patch.js apply /path/to/original.asar /path/to/patched.asar');
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'inspect' && args.length === 1) {
    console.log(JSON.stringify(inspectArchive(args[0]), null, 2));
    return;
  }
  if (command === 'apply' && args.length === 2) {
    console.log(JSON.stringify(applyPatch(args[0], args[1]), null, 2));
    return;
  }
  usage();
  process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(`xiaoleimi runtime patch: ${error.message}`);
  process.exitCode = 1;
}
