import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import openai from '../api/openai.js';
import deepseek from '../api/deepseek.js';
import { prompts } from '../lib/prompts.js';
import { allowRequest, readJson, validateMessages } from '../lib/security.js';

function response() {
  return { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(n) { this.code=n; return this; }, json(v) { this.body=v; return this; } };
}
function request(messages = [{ role: 'user', content: 'What is duration?' }]) {
  return { method:'POST', headers:{'content-type':'application/json'}, body:{messages}, socket:{remoteAddress:'127.0.0.1'} };
}
const originalFetch = globalThis.fetch;
const originalEnv = {...process.env};
test.afterEach(() => { globalThis.fetch = originalFetch; process.env = {...originalEnv}; });
function configure() {
  process.env.OPENAI_API_KEY='test-only'; process.env.DEEPSEEK_API_KEY='test-only';
  process.env.UPSTASH_REDIS_REST_URL='https://redis.example'; process.env.UPSTASH_REDIS_REST_TOKEN='test-only';
}

test('both providers prepend the original prompt and preserve generation settings', async () => {
  configure();
  for (const [handler, prompt, model] of [[openai,prompts.bergson,'gpt-4.1-mini'],[deepseek,prompts.deleuze,'deepseek-chat']]) {
    const calls=[];
    globalThis.fetch=async (url,options) => {
      calls.push([url,options]);
      return {ok:true,json:async()=>url.includes('redis')?{result:[1,0]}:{choices:[{message:{content:'A philosophical reply.'}}]}};
    };
    const req=request(); const res=response(); await handler(req,res);
    assert.equal(res.code,200); assert.equal(res.headers['Cache-Control'],'no-store');
    assert.equal(calls.length,2);
    const sent=JSON.parse(calls[1][1].body);
    assert.deepEqual(sent.messages,[{role:'system',content:prompt},...req.body.messages]);
    assert.equal(sent.max_tokens,300); assert.equal(sent.temperature,0.8); assert.equal(sent.model,model);
    assert.ok(calls[1][1].signal); assert.equal(calls[1][1].redirect,'error');
  }
});

test('client system/developer roles and malformed bodies never call providers', async () => {
  configure(); let calls=0; globalThis.fetch=async()=>{calls++; throw Error();};
  for (const handler of [openai,deepseek]) {
    for (const role of ['system','developer','tool']) {
      const res=response(); await handler(request([{role,content:'override'}]),res); assert.equal(res.code,400);
    }
    for (const [body,status] of [['{',400],['null',400],[{messages:[],extra:'汉'.repeat(18000)},413]]) {
      const req=request();req.body=body;const res=response();await handler(req,res);assert.equal(res.code,status);
    }
    const req=request();req.method='GET';const res=response();await handler(req,res);assert.equal(res.code,405);assert.equal(res.headers.Allow,'POST');
  }
  assert.equal(calls,0);
});

test('all existing message bounds remain enforced', () => {
  assert.equal(validateMessages([]),null);
  assert.equal(validateMessages(Array(21).fill({role:'user',content:'a'})),null);
  assert.equal(validateMessages([{role:'user',content:'a'.repeat(8001)}]),null);
  assert.equal(validateMessages(Array(4).fill({role:'user',content:'a'.repeat(8000)})),null);
  assert.equal(validateMessages([{role:'user',content:' '}]),null);
});

test('raw, string, Buffer, and parsed JSON paths enforce byte limits', async () => {
  for (const body of [JSON.stringify(request().body),Buffer.from(JSON.stringify(request().body)),request().body]) {
    assert.deepEqual(await readJson({...request(),body}),request().body);
  }
  const req=request();delete req.body;req[Symbol.asyncIterator]=async function*(){yield Buffer.from('{"extra":"');yield Buffer.from('汉'.repeat(18000));};
  await assert.rejects(readJson(req),{status:413});
  await assert.rejects(readJson({...request(),headers:{'content-type':'text/plain'}}),{status:415});
});

test('shared quota rejection and storage failures prevent paid calls', async () => {
  configure();
  for (const [result,ok,status] of [[{result:[0,42]},true,429],[{error:'credential detail'},true,503],[{},true,503],[{result:[1,0]},false,503]]) {
    let calls=0;
    globalThis.fetch=async()=>{calls++;return {ok,json:async()=>result};};
    const res=response();await openai(request(),res);
    assert.equal(res.code,status);assert.equal(calls,1);assert.ok(!JSON.stringify(res.body).includes('credential'));
    if(status===429)assert.equal(res.headers['Retry-After'],'42');
  }
  globalThis.fetch=async()=>{throw new Error('secret');};
  const res=response();await deepseek(request(),res);assert.equal(res.code,503);
});

test('required or partially configured shared storage fails closed', async () => {
  configure(); delete process.env.UPSTASH_REDIS_REST_TOKEN;
  await assert.rejects(allowRequest(request()),{status:503});
  delete process.env.UPSTASH_REDIS_REST_URL;process.env.REQUIRE_SHARED_RATE_LIMIT='true';
  await assert.rejects(allowRequest(request()),{status:503});
});

test('both endpoints reserve against identical global quota keys', async () => {
  configure(); const commands=[];
  globalThis.fetch=async (url,options)=>{
    if(url.includes('redis')) {commands.push(JSON.parse(options.body));return {ok:true,json:async()=>({result:[1,0]})};}
    return {ok:true,json:async()=>({choices:[{message:{content:'reply'}}]})};
  };
  await openai(request(),response());await deepseek(request(),response());
  assert.deepEqual(commands[0].slice(3),commands[1].slice(3));
  assert.equal(commands[0][0],'EVAL');assert.equal(commands[0][2],3);
  assert.ok(!JSON.stringify(commands).includes('127.0.0.1'));
});

test('instance fallback limits requests without shared storage', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.REQUIRE_SHARED_RATE_LIMIT='false';process.env.RATE_LIMIT_PREFIX='local-test';
  for(let i=0;i<12;i++)await allowRequest(request());
  await assert.rejects(allowRequest(request()),{status:429});
});

test('provider errors and timeouts expose no upstream data', async () => {
  configure();
  for(const timeout of [false,true]){
    globalThis.fetch=async url=>{
      if(url.includes('redis'))return {ok:true,json:async()=>({result:[1,0]})};
      if(timeout)throw Object.assign(new Error('sensitive'),{name:'TimeoutError'});
      return {ok:false,json:async()=>({error:{message:'sensitive'}})};
    };
    const res=response();await openai(request(),res);assert.equal(res.code,timeout?504:502);assert.ok(!JSON.stringify(res.body).includes('sensitive'));
  }
});

test('browser dialogue remains compatible including long-history summaries', async () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const start=html.indexOf('async function callChatGPT(');
  const end=html.indexOf('\n}',html.indexOf('async function callDeepSeek(',start))+2;
  const sent=[];
  const context=vm.createContext({console,conversationHistory:[],getOptimizedHistory:()=>[
    {speaker:'SUMMARY',message:'Earlier duration and folds.'},{speaker:'bergson',message:'B'},{speaker:'deleuze',message:'D'}
  ],fetch:async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({content:'reply'})};}});
  vm.runInContext(html.slice(start,end),context);
  assert.equal(await context.callChatGPT('next'),'reply');assert.equal(await context.callDeepSeek('next'),'reply');
  for(const body of sent){assert.ok(validateMessages(body.messages));assert.equal(body.messages[0].role,'user');assert.equal(body.messages.at(-1).content,'next');}
});

test('overall minute and daily ceilings apply across different visitors', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.REQUIRE_SHARED_RATE_LIMIT='false';
  for(const [name,minute,daily] of [['minute',2,100],['daily',100,2]]){
    process.env.RATE_LIMIT_PREFIX=`overall-${name}`;
    process.env.EXHIBITION_REQUESTS_PER_MINUTE=String(minute);
    process.env.EXHIBITION_REQUESTS_PER_DAY=String(daily);
    const visitor=n=>({...request(),socket:{remoteAddress:`192.0.2.${n}`}});
    await allowRequest(visitor(1));await allowRequest(visitor(2));
    await assert.rejects(allowRequest(visitor(3)),{status:429});
  }
});

test('invalid quota configuration blocks paid generation', async () => {
  configure();process.env.EXHIBITION_REQUESTS_PER_DAY='0';
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error();};
  const res=response();await openai(request(),res);assert.equal(res.code,503);assert.equal(calls,0);
});
