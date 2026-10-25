import { expect, test } from 'bun:test';
import inferenceScript from './inferenceScript';

// Run the actual generated bridge with urllib's HTTPS transport replaced. The
// real opener/redirect handlers still execute; no socket or credentials are used.
async function bridge(overrides: Record<string, unknown> = {}, redirect = false) {
    const script = await inferenceScript({} as Context, null, {});
    const request = {
        ssh: { provider: 'opencode', account: 'test' },
        url: 'https://opencode.ai/inference/go/v1/usage',
        method: 'GET', headers: { Authorization: 'Bearer synthetic-test' },
        ...overrides,
    };
    const harness = `import io,json,sys,socket,urllib.request,urllib.response,email.message
calls=[]
def forbidden(*args,**kwargs):raise AssertionError('Real network forbidden')
socket.socket=forbidden
def fake_open(self,req):
 calls.append({'url':req.full_url,'method':req.get_method(),'body':req.data.decode() if req.data is not None else None,'authorization':req.get_header('Authorization')})
 headers=email.message.Message()
 headers['Content-Type']='application/json'
 if ${redirect ? 'True' : 'False'}:headers['Location']='https://opencode.ai/inference/v1/usage'
 res=urllib.response.addinfourl(io.BytesIO(b'{"remaining":42}'),headers,req.full_url,${redirect ? '302' : '200'})
 res.msg='mock'
 return res
urllib.request.HTTPSHandler.https_open=fake_open
try:exec(${JSON.stringify(script)})
finally:sys.stderr.write(json.dumps(calls))
`;
    const proc = Bun.spawnSync(['python3', '-c', harness], {
        stdin: Buffer.from(JSON.stringify(request) + '\ndispatch\n'),
        stdout: 'pipe', stderr: 'pipe',
    });
    const stdout = proc.stdout.toString();
    return { exitCode: proc.exitCode, stdout, calls: JSON.parse(proc.stderr.toString()) };
}

test('SSH Python bridge permits exact authenticated Go usage GET without body', async () => {
    const result = await bridge();
    expect(result.exitCode).toBe(0);
    expect(result.calls).toEqual([{
        url: 'https://opencode.ai/inference/go/v1/usage', method: 'GET', body: null,
        authorization: 'Bearer synthetic-test',
    }]);
    expect(result.stdout).toContain('"status": 200');
    expect(result.stdout).toContain('"remaining":42');
});

test('SSH Python bridge rejects Go usage writes, bodies and missing authorization before transport', async () => {
    for (const overrides of [
        { method: 'POST' }, { method: 'HEAD' }, { method: 'get' },
        { body: '' }, { body: '{}' }, { headers: {} },
        { headers: { Authorization: ' ' } },
    ]) {
        const result = await bridge(overrides);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('"rejected": true');
        expect(result.calls).toEqual([]);
    }
});

test('SSH Python bridge rejects PAYG usage and Go usage URL lookalikes', async () => {
    for (const url of [
        'https://opencode.ai/inference/v1/usage',
        'http://opencode.ai/inference/go/v1/usage',
        'https://opencode.ai.evil.test/inference/go/v1/usage',
        'https://opencode.ai:443/inference/go/v1/usage',
        'https://user@opencode.ai/inference/go/v1/usage',
        'https://opencode.ai/inference/go/v1/usage/',
        'https://opencode.ai/inference/go/v1/usage?x=1',
        'https://opencode.ai/inference/go/v1/usage?',
        'https://opencode.ai/inference/go/v1/usage#x',
        'https://opencode.ai/inference/go/v1/usage#',
        'https://opencode.ai/inference/go/v1/%75sage',
        'https://opencode.ai/inference/go/v1/../v1/usage',
        'https://opencode.ai/inference/go/go/v1/usage',
        'https://opencode.ai/inference/go/v1/usage\n',
    ]) {
        const result = await bridge({ url });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('"rejected": true');
        expect(result.calls).toEqual([]);
    }
});

test('SSH Python bridge exposes redirect response without following it', async () => {
    const result = await bridge({}, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"status": 302');
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].url).toBe('https://opencode.ai/inference/go/v1/usage');
});

test('SSH public docs discard supplied authorization and allow only exact bodyless GET URLs', async () => {
    for (const path of ['go','models']) {
        const url = 'https://opencode.ai/v2/docs/console/' + path;
        for (const headers of [{}, {Authorization:'Bearer synthetic-test',Cookie:'synthetic-test'}]) {
            const result = await bridge({url,headers});
            expect(result.exitCode).toBe(0);
            expect(result.calls).toEqual([{url,method:'GET',body:null,authorization:null}]);
        }
        for (const overrides of [{method:'POST'},{method:'HEAD'},{method:'get'},{body:''},{body:'{}'}]) {
            const result = await bridge({url,...overrides});
            expect(result.exitCode).toBe(1); expect(result.calls).toEqual([]);
        }
        for (const bad of [url+'?',url+'#',url+'/',url+'?x=1',url+'#x',url+'\n',url.replace('https:','http:'),url.replace('opencode.ai','opencode.ai:443'),url.replace('opencode.ai','user@opencode.ai'),url.replace('/console/','/console/../console/'),url.replace('/console/','/%63onsole/'),url.replace('opencode.ai','evil.test')]) {
            const result = await bridge({url:bad});
            expect(result.exitCode).toBe(1); expect(result.calls).toEqual([]);
        }
        const redirected = await bridge({url},true);
        expect(redirected.stdout).toContain('"status": 302');
        expect(redirected.calls).toHaveLength(1);
        expect(redirected.calls[0].authorization).toBeNull();
    }
});
