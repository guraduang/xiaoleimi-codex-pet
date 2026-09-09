'use strict';

// These functions are also evaluated in isolation by the regression tests.
function phase(turn) {
  const items = turn?.items ?? [];
  const tool = /^(collabAgentToolCall|commandExecution|dynamicToolCall|fileChange|imageGeneration|imageView|mcpToolCall|sleep|webSearch)$/;
  if (items.some(item => tool.test(item?.type) && ['inProgress', 'in_progress'].includes(item.status))) return 'running';
  const last = [...items].reverse().find(item => tool.test(item?.type) || ['reasoning', 'agentMessage'].includes(item?.type));
  return last?.type === 'reasoning' ? 'T' : last?.type === 'agentMessage' ? 'Y' : 'running';
}

function animation(state, reduced, custom, standard, idle, frames) {
  if (!custom && (state === 'T' || state === 'Y')) state = 'running';
  const map = custom ? {T: frames(7, 3, 120, 220), Y: standard.waiting,
    running: [...frames(7, 6, 120, 220).slice(3), ...frames(8, 1, 120, 220)],
    review: frames(7, 6, 150, 280).slice(1)} : {};
  const selected = map[state] ?? standard[state] ?? standard.running;
  if (reduced) return {frames: [selected[0]], loopStartIndex: null};
  if (state === 'idle') return {frames: idle, loopStartIndex: 0};
  if (custom && selected[0].rowIndex > 4) return {frames: selected, loopStartIndex: 0};
  const repeated = [...selected, ...selected, ...selected];
  return {frames: [...repeated, ...idle], loopStartIndex: repeated.length};
}

function once(source, before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) !== -1) throw Error('Missing or ambiguous adapter anchor: ' + before.slice(0, 100));
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function patchPage(source) {
  source = once(source, 'G_t as ee,', 'W_t as ee,');
  source = once(source, 'labelMessage:Io.running,mascotState:`running`', 'labelMessage:Io.running,mascotState:e.petState??`running`');
  source = once(source, 'function ps(', phase.toString().replace('function phase(', 'function xiaoleimiPhase(') + ';function ps(');
  source = once(source, '(e.threadSource===`realtime_voice`||e.id===a)', '(e.threadSource===`realtime_voice`)');
  source = once(source, 'localConversationId:e.id,source:c,', 'localConversationId:e.id,petState:l===`running`?xiaoleimiPhase(u):l,source:c,');
  source = once(source, 'e.body??``,e.level,e.isLoading?', 'e.body??``,e.level,e.petState??``,e.isLoading?');
  source = once(source, 'localConversationId:e.localConversationId,notificationPreferenceId:e.key', 'localConversationId:e.localConversationId,petState:e.petState,notificationPreferenceId:e.key');
  source = once(source, 'state:et.mascotState,style:', 'state:kt(o).petId===`custom:xiaoleimi`?et.mascotState:et.mascotState===`T`||et.mascotState===`Y`?`running`:et.mascotState,style:');
  // Preserve waiting/error precedence and every other branch in the official classifier.
  source = once(source, 'let t=e.resumeState===`needs_resume`?e.threadRuntimeStatus:null,n=e.resumeState===`needs_resume`?t?.type===`active`:e.resumeState===`resuming`||Mt(e)?.status===`inProgress`,',
    'let t=e.threadRuntimeStatus,n=t?.type===`active`||e.resumeState===`resuming`||Mt(e)?.status===`inProgress`,');
  return source;
}

function patchApp(source) {
  const before = 'function c9n(e,t){let n=h9n[e];if(t)return{frames:[l9n(n,0)],loopStartIndex:null};if(e===`idle`)return{frames:m9n,loopStartIndex:0};let r=[...n,...n,...n];return{frames:[...r,...m9n],loopStartIndex:r.length}}';
  source = once(source, before, animation.toString().replace('function animation(', 'function xiaoleimiAnimation(') + ';function c9n(e,t,n){return xiaoleimiAnimation(e,t,n,h9n,m9n,xN)}');
  // Capture the source pet id before entering the effect's locally shadowed i binding.
  source = once(source, 'd=i.assetRef==null?i.spriteRowCount:bN.rows;return(0,b9n.useEffect)', 'd=i.assetRef==null?i.spriteRowCount:bN.rows,xiaoleimiCustom=i.petId===`custom:xiaoleimi`;return(0,b9n.useEffect)');
  source = once(source, 'let t=c9n(u,l),', 'let t=c9n(u,l,xiaoleimiCustom),');
  source = once(source, '},[u,n,l,d]),', '},[u,n,l,d,xiaoleimiCustom]),');
  return source;
}

module.exports = {
  version: '26.901.20858', id: 'linux-26.901.20858-v1', phase, animation,
  targets: {
    page: {pattern: /^webview\/assets\/avatar-overlay-native-page-[^/]+\.js$/, sha256: '3554f06ce14d99e546565ec30b51fa9545f14b4eaacfb36b0579a786e57a788c', patchedSha256: '0217683c37d192579692ca6edaef74fea9ac01b041aec266c290a05a14c89616', transform: patchPage},
    app: {pattern: /^webview\/assets\/app-initial-[^/]+\.js$/, sha256: '22965667d2e2b23095252370912cc4329e10f43eab32222d5b97620087d2fbab', patchedSha256: '593cf884a41e64c103404a9e6c05633eb76c845a3149f8d76fe6699c58ef55ea', transform: patchApp},
  },
};
