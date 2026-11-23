const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.events = {}; this.hidden = false; this.checked = false; this.classList = { add() {} }; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  querySelectorAll(selector) {
    const found = [];
    const visit = element => { for (const child of element.children) { if (typeof child !== 'object') continue; if (selector.includes(child.tagName) && (!selector.includes('checkbox') || child.type === 'checkbox')) found.push(child); visit(child); } };
    visit(this); return found;
  }
}

function testTimer() {
  const host = new Element('div');
  let clock = 100000;
  let nextInterval = 0;
  const intervals = new Map();
  const window = { setInterval(callback) { intervals.set(++nextInterval, callback); return nextInterval; }, addEventListener() {} };
  const context = vm.createContext({ window, Date: { now: () => clock }, clearInterval: id => intervals.delete(id), document: { readyState: 'complete', querySelector: () => host, createElement: tag => new Element(tag) } });
  vm.runInContext(read('js/quiz-timer.js'), context);
  const timer = window.QuizTimer;
  const checkbox = host.children[0].children[0];
  const output = host.children[2];
  assert.equal(checkbox.checked, false, 'Timing is opt-in');
  timer.start(); clock += 3500;
  assert.equal(timer.finish().durationSeconds, null, 'Untimed attempts must not record a duration');
  assert.equal(output.hidden, true);
  checkbox.checked = true;
  timer.start(); clock += 12500;
  intervals.values().next().value();
  assert.equal(output.textContent, 'Elapsed time: 00:12');
  assert.equal(timer.finish().durationSeconds, 12);
  assert.equal(output.textContent, 'Time taken: 00:12');
  clock += 10000;
  assert.equal(timer.finish().durationSeconds, 12, 'Submission freezes elapsed time');
  timer.start();
  assert.equal(timer.finish().durationSeconds, 0, 'Zero seconds is a valid timed attempt');
  timer.start(); clock += 9000; checkbox.checked = false;
  assert.equal(timer.finish().durationSeconds, null, 'Turning timing off before submission is respected');
  timer.start(); clock += 8000; checkbox.checked = true;
  assert.equal(timer.finish().durationSeconds, 8, 'Opting in includes the whole attempt');
  assert.equal(timer.formatDuration(3661), '1:01:01');
  assert.equal(timer.formatDuration(null), 'Not timed');
  assert.equal(intervals.size, 0, 'No interval remains after completion');
}

async function testStore() {
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const attemptId = '33333333-3333-4333-8333-333333333333';
  const clientAttemptId = '44444444-4444-4444-8444-444444444444';
  const calls = [];
  const storage = new Map();
  const client = {
    auth: { async getSession() { return { data: { session: { user: { id: owner } } } }; }, onAuthStateChange() {} },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const builder = {
        upsert(row) { call.row = row; return this; },
        delete() { call.deleting = true; return this; },
        select() { return this; },
        eq(...filter) { call.filters.push(filter); return this; },
        in(...filter) { call.filters.push(filter); return this; },
        order() { return this; },
        range(...range) { call.range = range; return this; },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve, reject) { return Promise.resolve({ data: call.deleting ? [{ id: attemptId, client_attempt_id: clientAttemptId }] : [], error: null }).then(resolve, reject); }
      };
      return builder;
    }
  };
  const window = { supabaseClient: client, crypto: require('node:crypto').webcrypto, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, addEventListener() {} };
  vm.runInNewContext(read('js/progress-store.js'), { window, document: { addEventListener() {} }, console, Uint8Array, Date });
  const store = window.ProgressStore;
  for (const [enabled, seconds, expected] of [[false, 12, null], [true, 0, 0], [true, 12, 12]]) {
    await store.recordAttempt({ clientAttemptId, quizId: 'test', score: 1, total: 2, durationSeconds: 90, details: { timerEnabled: enabled, durationSeconds: seconds } });
    assert.equal(calls.at(-1).row.duration_seconds, expected);
  }
  await store.recordAttempt({ clientAttemptId, quizId: 'legacy', score: 1, total: 2, durationSeconds: 7 });
  assert.equal(calls.at(-1).row.duration_seconds, 7, 'Existing imported durations remain supported');
  await store.listAttempts({ limit: 51, offset: 50 });
  assert.deepEqual(Array.from(calls.at(-1).range), [50, 100]);
  assert.ok(calls.at(-1).filters.some(([key, value]) => key === 'user_id' && value === owner));
  storage.set('multiplication_practice_history_v1', JSON.stringify([{ clientAttemptId, ownerId: owner }, { clientAttemptId, ownerId: other }]));
  const result = await store.deleteAttempts([attemptId]);
  assert.equal(result.deletedCount, 1);
  assert.ok(calls.at(-1).filters.some(([key, value]) => key === 'user_id' && value === owner), 'Deletion explicitly scopes the current owner');
  assert.equal(JSON.parse(storage.get('multiplication_practice_history_v1'))[0].ownerId, other, 'Other account cache remains intact');
  await assert.rejects(store.deleteAttempts([]));
  await assert.rejects(store.deleteAttempts(['invalid-id']));
}

async function testScoreSelectionEvents(admin) {
  const html = read(admin ? 'admin-results.html' : 'scores.html');
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element('div')]));
  for (const node of nodes.values()) node.value = '';
  if (admin) nodes.get('resultsFilters').append(nodes.get('studentFilter'), nodes.get('resultsQuizFilter'), nodes.get('resultsBeforeDate'));
  const first = { id: '10000000-0000-4000-8000-000000000001', user_id: 'a', quiz_id: 'vocabulary-daily-v1', score: 1, total: 2, duration_seconds: 0, details: {timerEnabled:true}, completed_at: '2026-01-01T00:00:00Z', display_name:'Fixture A', email:'a@example.invalid' };
  const second = { ...first, id: '10000000-0000-4000-8000-000000000002', user_id: admin ? 'b' : 'a', duration_seconds: null, details: {timerEnabled:false}, display_name:'Fixture B' };
  let rows = [first, second], confirmations = [], deletions = [], allow = false, denied = false;
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const store = { async listAttempts() {return rows;}, async deleteAttempts(ids) {deletions.push(ids);rows=rows.filter(row=>!ids.includes(row.id));return {deletedCount:ids.length};} };
  let authChanged;
  const client = {auth:{ async getSession(){return {data:{session:{user:{id:'a'}}}};}, onAuthStateChange(callback){authChanged=callback;}},async rpc(name,args){
    if(denied)return {data:null,error:{code:'42501'}};
    if(name==='admin_delete_quiz_attempts'){deletions.push(args.p_attempt_ids);rows=rows.filter(row=>!args.p_attempt_ids.includes(row.id));return {data:args.p_attempt_ids.length};}
    return {data:rows.map(row=>({...row,attempt_id:row.id}))};
  }};
  const window = {supabaseClient:client,ProgressStore:store,QuizTimer:{formatDuration:seconds=>seconds===0?'00:00':String(seconds)},confirm(message){confirmations.push(message);return allow;}};
  vm.runInNewContext(read(admin?'js/admin-results.js':'js/scores.js'), {window,document:{getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag)},Date,Set,Number,console});
  await flush();
  const body=nodes.get(admin?'resultsBody':'scoresBody');
  assert.equal(body.children.length,2);
  assert.equal(body.children[0].children[admin?7:4].textContent,'00:00','Zero duration is visible');
  assert.equal(body.children[1].children[admin?7:4].textContent,'Not timed');
  const single=body.children[0].children[0].children[0];
  single.checked=true;single.events.change();
  assert.equal(nodes.get(admin?'resultSelectionCount':'scoreSelectionCount').textContent,'1 selected');
  const selectAll=nodes.get(admin?'selectAllResults':'selectAllScores');
  selectAll.checked=true;selectAll.events.change();
  assert.equal(nodes.get(admin?'resultSelectionCount':'scoreSelectionCount').textContent,'2 selected');
  const deletion=nodes.get(admin?'deleteResultsButton':'deleteScoresButton');
  await deletion.events.click();
  assert.equal(deletions.length,0,'Cancelling confirmation performs no deletion');
  assert.equal(body.children.length,2);
  allow=true;await deletion.events.click();await flush();
  assert.equal(deletions[0].length,2,'Only the two selected IDs are submitted');
  if(admin)assert.ok(confirmations.at(-1).includes('2 students'));
  assert.equal(body.children.length,0);
  assert.match(nodes.get(admin?'resultActionStatus':'scoreActionStatus').textContent,/Deleted 2/);
  assert.equal(deletion.disabled,true);
  if(admin){denied=true;authChanged();await flush();assert.equal(nodes.get('resultsDenied').hidden,false,'Admin access denial hides records');assert.equal(nodes.get('resultDeleteControls').hidden,true);}
}

function literal(text, name) {
  const match = new RegExp('\\bconst\\s+' + name + '\\s*=\\s*').exec(text);
  assert.ok(match, 'Missing source declaration: ' + name);
  let index = match.index + match[0].length;
  const start = index, delimiter = text[index];
  if (delimiter === '`') {
    for (index++; index < text.length; index++) { if (text[index] === '\\') index++; else if (text[index] === '`') return text.slice(start, index + 1); }
  }
  let depth = 0, quote = null;
  for (; index < text.length; index++) {
    const character = text[index];
    if (quote) { if (character === '\\') index++; else if (character === quote) quote = null; continue; }
    if ('"\'`'.includes(character)) { quote = character; continue; }
    if ('[{'.includes(character)) depth++;
    if (']}'.includes(character) && --depth === 0) return text.slice(start, index + 1);
  }
  throw Error('Unterminated source literal ' + name);
}

function testPagesAndQuestionIntegrity() {
  const pages = fs.readdirSync(path.join(root, 'quizzes')).filter(file => file.endsWith('.html') && read('quizzes/' + file).includes('../js/progress-store.js'));
  assert.equal(pages.length, 18);
  for (const file of [...pages, 'einstein_two_mile_trap.html']) {
    const html = read('quizzes/' + file);
    assert.equal((html.match(/data-quiz-timer(?=[ >])/g) || []).length, 1, file + ' needs exactly one timer control');
    assert.ok(html.includes('../styles/quiz-timer.css') && html.includes('../js/quiz-timer.js'));
    if (pages.includes(file)) assert.ok(html.indexOf('../js/quiz-timer.js') < html.indexOf('../js/progress-store.js'));
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1], { filename: file });
  }
  const sources = { 'UnitsAndDimensions2.html': ['questions'], 'oxidation_numbers_quiz_v1.html': ['QUESTION_BANK'], 'ionic_formula_quiz_v1.html': ['EMBEDDED_CSV'], 'trig_angles_quiz_v1.html': ['identities', 'answerPool'], 'vocabulary_daily_practice_quiz_v1.html': ['WORDS'], 'universal_quiz_latex.html': ['EMBEDDED_INDEX', 'EMBEDDED_BANKS'] };
  for (const [file, names] of Object.entries(sources)) {
    const before = cp.execFileSync('git', ['show', 'HEAD:quizzes/' + file], { cwd: root, encoding: 'utf8', maxBuffer: 5e6 }).replace(/\r\n/g, '\n');
    for (const name of names) assert.equal(literal(read('quizzes/' + file), name), literal(before, name), file + ': educational data changed');
  }
  assert.equal(cp.execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'assets/data', 'assets/graphs'], { cwd: root, encoding: 'utf8' }).trim(), '', 'External banks and scientific graphs must remain unchanged');
}

(async () => {
  testTimer();
  await testStore();
  await testScoreSelectionEvents(false);
  await testScoreSelectionEvents(true);
  testPagesAndQuestionIntegrity();
  console.log('PASS: optional timing, frozen/zero durations and restarts; owner-scoped deletion and cache protection; student/admin selection event logic, cancellation and confirmation, zero-time rendering and access denial; all 19 active quiz/puzzle pages parse; questions and banks unchanged. No browser rendering is simulated by these unit tests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
