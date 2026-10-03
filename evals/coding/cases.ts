export interface CodingCase {
  id: string;
  brief: string;
  example: { input: unknown; output: unknown };
  checks: { input: unknown; output: unknown }[];
  reference: string;
}
const task = (
  id: string,
  brief: string,
  checks: CodingCase['checks'],
  body: string,
): CodingCase => ({ id, brief, example: checks[0], checks, reference: 'module.exports = ' + body });
export const cases: CodingCase[] = [
  task(
    'stable-unique',
    'Return distinct JSON primitive values in first-occurrence order. Distinguish strings, numbers, booleans and null.',
    [
      { input: [1, 1, '1', false, 0, false, null, null], output: [1, '1', false, 0, null] },
      { input: [], output: [] },
      {
        input: ['__proto__', 'constructor', '__proto__', true, 1],
        output: ['__proto__', 'constructor', true, 1],
      },
    ],
    'a => [...new Set(a)]',
  ),
  task(
    'merge-intervals',
    'Return sorted merged closed intervals. Touching endpoints merge. Do not mutate input; input intervals have start <= end.',
    [
      {
        input: [
          [4, 5],
          [1, 3],
          [3, 4],
        ],
        output: [[1, 5]],
      },
      { input: [], output: [] },
      {
        input: [
          [2, 2],
          [0, 0],
          [5, 8],
          [6, 7],
        ],
        output: [
          [0, 0],
          [2, 2],
          [5, 8],
        ],
      },
    ],
    'a => { const out=[]; for(const x of a.map(x=>[...x]).sort((a,b)=>a[0]-b[0])) { const p=out.at(-1); if(p && x[0]<=p[1]) p[1]=Math.max(p[1],x[1]); else out.push(x); } return out; }',
  ),
  task(
    'json-pointer',
    'Input {value,pointer}. Resolve RFC6901-style JSON pointer, decoding ~1 as slash and ~0 as tilde. Empty pointer returns value. Missing property returns null; only own properties count.',
    [
      { input: { value: { 'a/b': { '~x': 4 } }, pointer: '/a~1b/~0x' }, output: 4 },
      { input: { value: { a: [false, 0] }, pointer: '/a/1' }, output: 0 },
      { input: { value: {}, pointer: '/constructor' }, output: null },
      { input: { value: [1, 2], pointer: '' }, output: [1, 2] },
    ],
    '({value,pointer}) => {if(pointer==="") return value; for(const s of pointer.slice(1).split("/")) {const k=s.replace(/~1/g,"/").replace(/~0/g,"~"); if(value===null || typeof value!=="object" || !Object.hasOwn(value,k)) return null; value=value[k];} return value;}',
  ),
  task(
    'csv-record',
    'Parse one CSV record into strings. Support quoted fields, commas inside quotes, doubled quotes, empty fields and a trailing empty field. Input is valid CSV without line breaks.',
    [
      { input: 'a,"b,c","d""e",', output: ['a', 'b,c', 'd"e', ''] },
      { input: '', output: [''] },
      { input: '"",,x', output: ['', '', 'x'] },
    ],
    's => {let a=[],v="",q=false; for(let i=0;i<s.length;i++){const c=s[i]; if(c===\'"\'){if(q&&s[i+1]===\'"\'){v+=c;i++;}else q=!q;}else if(c===","&&!q){a.push(v);v="";}else v+=c;} a.push(v);return a;}',
  ),
  task(
    'topological-order',
    'Input {nodes,edges} with directed edges [prerequisite,dependent]. Return topological order, choosing lexicographically smallest available node each step. Ignore duplicate edges. Return null on cycle. All endpoints are in nodes.',
    [
      {
        input: {
          nodes: ['c', 'b', 'a'],
          edges: [
            ['a', 'c'],
            ['b', 'c'],
          ],
        },
        output: ['a', 'b', 'c'],
      },
      {
        input: {
          nodes: ['a', 'b'],
          edges: [
            ['a', 'b'],
            ['a', 'b'],
          ],
        },
        output: ['a', 'b'],
      },
      { input: { nodes: ['a'], edges: [['a', 'a']] }, output: null },
      { input: { nodes: [], edges: [] }, output: [] },
    ],
    '({nodes,edges})=>{const todo=new Set(nodes),out=[]; while(todo.size){const x=[...todo].sort().find(n=>!edges.some(([a,b])=>b===n&&todo.has(a)));if(x===undefined)return null;todo.delete(x);out.push(x);}return out;}',
  ),
  task(
    'decimal-sum',
    'Sum an array of signed decimal strings with at most two fractional digits. Return exactly two fractional digits. Use exact arithmetic, including integers larger than Number.MAX_SAFE_INTEGER; normalize negative zero.',
    [
      { input: ['0.1', '0.2'], output: '0.30' },
      { input: ['9007199254740993.01', '0.09'], output: '9007199254740993.10' },
      { input: ['-1.20', '0.2'], output: '-1.00' },
      { input: [], output: '0.00' },
    ],
    'a=>{let n=0n;for(let s of a){let sign=s[0]==="-"?-1n:1n;s=s.replace(/^[+-]/,"");const [w,f=""]=s.split(".");n+=sign*(BigInt(w)*100n+BigInt(f.padEnd(2,"0")));}const sign=n<0n?"-":"";if(n<0n)n=-n;return sign+(n/100n)+"."+(n%100n).toString().padStart(2,"0");}',
  ),
  task(
    'unicode-reverse',
    'Reverse a string by Unicode code points, not UTF-16 code units. Combining marks are independent code points; do not normalize.',
    [
      { input: 'A😀中', output: '中😀A' },
      { input: '', output: '' },
      { input: 'e\u0301', output: '\u0301e' },
    ],
    's=>Array.from(s).reverse().join("")',
  ),
  task(
    'range-complement',
    'Input {start,end,covered}. Return uncovered half-open intervals within [start,end). Clip covered intervals to the range and merge overlaps or touching edges. Ignore empty coverage.',
    [
      {
        input: {
          start: 0,
          end: 10,
          covered: [
            [2, 4],
            [3, 7],
            [9, 12],
          ],
        },
        output: [
          [0, 2],
          [7, 9],
        ],
      },
      {
        input: {
          start: 0,
          end: 4,
          covered: [
            [-3, 1],
            [1, 4],
          ],
        },
        output: [],
      },
      { input: { start: 0, end: 0, covered: [] }, output: [] },
    ],
    '({start,end,covered})=>{const out=[];let p=start;for(const [a,b] of covered.map(([a,b])=>[Math.max(a,start),Math.min(b,end)]).filter(([a,b])=>a<b).sort((a,b)=>a[0]-b[0])){if(a>p)out.push([p,a]);p=Math.max(p,b);}if(p<end)out.push([p,end]);return out;}',
  ),
  task(
    'lru-cache',
    'Input {capacity,operations}. Operations are ["put",key,value] or ["get",key]. Return results of get operations only, null for missing. Both successful get and put refresh recency. Evict least recently used; capacity 0 stores nothing. Keys are strings.',
    [
      {
        input: {
          capacity: 2,
          operations: [
            ['put', 'a', 1],
            ['put', 'b', 2],
            ['get', 'a'],
            ['put', 'c', 3],
            ['get', 'b'],
            ['get', 'c'],
          ],
        },
        output: [1, null, 3],
      },
      {
        input: {
          capacity: 0,
          operations: [
            ['put', 'x', 1],
            ['get', 'x'],
          ],
        },
        output: [null],
      },
      {
        input: {
          capacity: 1,
          operations: [
            ['put', '__proto__', false],
            ['get', '__proto__'],
            ['put', '__proto__', 0],
            ['get', '__proto__'],
          ],
        },
        output: [false, 0],
      },
    ],
    '({capacity,operations})=>{const m=new Map(),out=[];for(const [op,k,v] of operations){if(op==="get"){if(!m.has(k)){out.push(null);continue;}const x=m.get(k);m.delete(k);m.set(k,x);out.push(x);}else if(capacity>0){m.delete(k);m.set(k,v);if(m.size>capacity)m.delete(m.keys().next().value);}}return out;}',
  ),
  task(
    'minimal-edit-distance',
    'Input [a,b]. Return Levenshtein distance with insertion, deletion and substitution cost 1, comparing Unicode code points.',
    [
      { input: ['kitten', 'sitting'], output: 3 },
      { input: ['😀', ''], output: 1 },
      { input: ['', 'abc'], output: 3 },
      { input: ['中😀文', '中文'], output: 1 },
    ],
    '([a,b])=>{a=Array.from(a);b=Array.from(b);let d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const e=[i];for(let j=1;j<=b.length;j++)e[j]=Math.min(e[j-1]+1,d[j]+1,d[j-1]+(a[i-1]===b[j-1]?0:1));d=e;}return d[b.length];}',
  ),
];
