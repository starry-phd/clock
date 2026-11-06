import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {buildRelayUrl,parseRelayCallback,RELAY_NATIVE_RETURN,RELAY_WEB_RETURN} from '../packages/auth-client-contract/src/relay.ts';

const hash='a'.repeat(64),state='X'.repeat(48);
describe('Starry ID browser relay security',()=>{
 it('constructs registered native callback with hashed nonce only',()=>{
  const u=new URL(buildRelayUrl('apple',hash,state,'native'));
  assert.equal(u.origin,'https://id.starry.phd');
  assert.equal(u.pathname,'/auth/apple/start');
  assert.equal(u.searchParams.get('app_id'),'clock');
  assert.equal(u.searchParams.get('return'),RELAY_NATIVE_RETURN.apple);
  assert.equal(u.searchParams.get('nonce'),hash);
  assert.equal(u.searchParams.get('state'),state);
 });
 it('uses registered same-origin web callback',()=>{
  const u=new URL(buildRelayUrl('google',hash,state,'web'));
  assert.equal(u.searchParams.get('return'),RELAY_WEB_RETURN);
 });
 it('validates state and native callback origin',()=>{
  const result=parseRelayCallback('clock://auth/google?id_token=a.b.c&state='+state,'google','native',state);
  assert.equal(result.ok,true);
  assert.throws(()=>parseRelayCallback('clock://auth/google?id_token=token&state=wrong','google','native',state),/invalid_state/);
  assert.throws(()=>parseRelayCallback('evil://auth/google?id_token=token&state='+state,'google','native',state),/unregistered_callback/);
  assert.throws(()=>parseRelayCallback('clock://auth/apple?id_token=token&state='+state,'google','native',state),/unregistered_callback/);
 });
 it('reads web tokens only from URL hash and checks state',()=>{
  const r=parseRelayCallback(RELAY_WEB_RETURN+'#id_token=a.b.c&state='+state,'google','web',state);
  assert.equal(r.ok,true);
  assert.throws(()=>parseRelayCallback(RELAY_WEB_RETURN+'?id_token=token&state='+state,'google','web',state),/invalid_state/);
 });
 it('rejects nonce raw value and callbacks without id token',()=>{
  assert.throws(()=>buildRelayUrl('apple','notsha256',state,'native'),/invalid_nonce_hash/);
  assert.throws(()=>parseRelayCallback('clock://auth/apple?state='+state,'apple','native',state),/missing_id_token/);
 });
});
