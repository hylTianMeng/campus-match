import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

// Exercise the prototype's real transition handlers without a browser or dependencies.
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace(/render\(\);\s*$/, '');
function fixture() {
  const context = vm.createContext({
    document: { addEventListener() {} }, window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { hash: '#/discover' }, crypto: webcrypto, URL, setTimeout, clearTimeout,
  });
  vm.runInContext(source, context);
  vm.runInContext(`db=seed(); db.session='lin'; render=()=>{}; closeModal=()=>{}; toast=()=>{};
    modalError=message=>{ lastError=message; }; lastError='';
    openModal=(title,content,callback)=>{ confirmAction=callback; };`, context);
  return code => vm.runInContext(code, context);
}

test('acceptance withdraws same-person applications before rejecting full-position competitors', () => {
  const run=fixture();
  run("applicationAction('accept','a2'); confirmAction(new Map());");
  assert.equal(run("db.applications.find(a=>a.id==='a2').status"),'accepted');
  assert.equal(run("db.applications.find(a=>a.id==='a1').status"),'withdrawn');
  assert.equal(run("db.applications.find(a=>a.id==='a3').reason"),'岗位名额已满');
  assert.equal(run("getPost('r2').status"),'open');
  assert.equal(run("accepted(getPost('r2'),'p22')"),1);
});

test('last vacancy ends recruitment immediately and blocks subsequent revocation', () => {
  const run=fixture();
  run("getPost('r2').positions[0].count=1; db.applications.find(a=>a.id==='a1').status='accepted'; applicationAction('accept','a3'); confirmAction(new Map());");
  assert.equal(run("getPost('r2').endReason"),'filled');
  assert.equal(run("getPost('r2').status"),'ended');
  run("applicationAction('revoke','a3');");
  assert.equal(run("db.applications.find(a=>a.id==='a3').status"),'accepted');
});

test('revoking an offer frees a vacancy without reviving rejected applications', () => {
  const run=fixture();
  run("applicationAction('accept','a2'); confirmAction(new Map()); applicationAction('revoke','a2'); confirmAction(new Map([['reason','时间安排变化']]));");
  assert.equal(run("accepted(getPost('r2'),'p22')"),0);
  assert.equal(run("db.applications.find(a=>a.id==='a2').reason"),'发布者撤销录取');
  assert.equal(run("db.applications.find(a=>a.id==='a3').status"),'not_passed');
});

test('deadline expires pending applications and preserves accepted results', () => {
  const run=fixture();
  run("db.applications.find(a=>a.id==='a1').status='accepted'; getPost('r2').deadline=new Date(Date.now()-1000).toISOString(); expirePosts();");
  assert.equal(run("getPost('r2').endReason"),'expired');
  assert.equal(run("db.applications.find(a=>a.id==='a1').status"),'accepted');
  assert.equal(run("db.applications.find(a=>a.id==='a2').status"),'expired');
  const count=run('db.notifications.length');
  run('expirePosts();');
  assert.equal(run('db.notifications.length'),count);
});

test('another account cannot approve an application', () => {
  const run=fixture();
  run("db.session='zhou'; applicationAction('accept','a1');");
  assert.equal(run("db.applications.find(a=>a.id==='a1').status"),'pending');
  assert.equal(run("typeof confirmAction"),'undefined');
});

test('withdrawal keeps the old application and its history', () => {
  const run=fixture();
  run("db.session='zhou'; applicationAction('withdraw','a1'); confirmAction(new Map());");
  assert.equal(run("db.applications.find(a=>a.id==='a1').status"),'withdrawn');
  assert.equal(run("db.applications.find(a=>a.id==='a1').history.length"),2);
  assert.equal(run('db.applications.length'),5);
});

test('public recruitment shows only the pending count, while review is owner-only', () => {
  const run = fixture();
  run("db.applications.find(a=>a.id==='a1').experience='PRIVATE EXPERIENCE';");
  const publicPage = run("detail('r2')");
  assert.match(publicPage, /2 人申请中/);
  assert.doesNotMatch(publicPage, /PRIVATE EXPERIENCE/);

  run("db.session='zhou'");
  assert.doesNotMatch(run("review('r2')"), /PRIVATE EXPERIENCE/);
  run("db.session='lin'");
  assert.match(run("review('r2')"), /PRIVATE EXPERIENCE/);
});

test('optional links reject unsafe protocols and empty sections are omitted', () => {
  const run = fixture();
  assert.equal(run("safeUrl('javascript:alert(1)')"), '');
  assert.equal(run("recruitmentExtras(getPost('r2'))"), '');
  run("getPost('r2').activityUrl='https://example.edu/event';");
  assert.match(run("recruitmentExtras(getPost('r2'))"), /https:\/\/example\.edu\/event/);
});
