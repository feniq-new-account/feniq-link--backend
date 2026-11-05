"""Real HTTP acceptance of a fresh localhost-only prelaunch fixture. Run from any directory."""
import http.client, json, os, pathlib, secrets, shutil, socket, subprocess, tempfile, time
os.umask(0o077)
root=pathlib.Path(tempfile.mkdtemp(prefix='feniq-prelaunch-probe-'))
output=root/'credentials.json'
with socket.socket() as sock:
    if sock.connect_ex(('127.0.0.1',5087))==0: raise SystemExit('Port already owned; refused.')
log=(root/'server.log').open('wb')
env=dict(os.environ,FENIQ_ACCEPTANCE_OUTPUT=str(output),FENIQ_ACCEPTANCE_PORT='5087',FENIQ_ACCEPTANCE_SCENARIO='prelaunch',GLIBC_TUNABLES='glibc.pthread.rseq=1')
process=subprocess.Popen(['node','backend/scripts/acceptance/server.js'], cwd=pathlib.Path(__file__).resolve().parents[2], env=env,stdout=log,stderr=log)
success=False
try:
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        if process.poll() is not None: raise RuntimeError('Isolated fixture startup failed; private log retained.')
        if output.exists():
            try:
                fixture=json.loads(output.read_text())
                if fixture.get('scenario')=='prelaunch':
                    with socket.create_connection(('127.0.0.1',5087),timeout=1): break
            except (ValueError,OSError): pass
        time.sleep(.3)
    else: raise RuntimeError('Fixture readiness timeout.')
    def call(method,path,body=None,token=None):
        client=http.client.HTTPConnection('127.0.0.1',5087,timeout=20)
        try:
            headers={'content-type':'application/json'}
            if token: headers['authorization']='Bearer '+token
            client.request(method,'/api'+path,body=json.dumps(body) if body is not None else None,headers=headers)
            result=client.getresponse()
            return result.status,json.loads(result.read())
        finally: client.close()
    status,data=call('GET','/app/status')
    assert status==200 and data['status']['mode']=='registration_only' and data['status']['orderingEnabled'] is False
    password=secrets.token_urlsafe(30)+'9Aa!'
    payload={'name':'DEMO Pending HTTP','pharmacyName':'DEMO Pending HTTP Pharmacy','phone':'0944000301','address':'DEMO isolated address','areaName':'DEMO rural area','areaType':'rural','password':password,'confirmPassword':password}
    status,new=call('POST','/auth/register',payload)
    assert status==201 and new['user']['status']=='pending'
    status,restored=call('POST','/auth/login-password',{'phone':payload['phone'],'password':password})
    assert status==200 and restored['user']['status']=='pending'
    account=fixture['accounts']['pharmacy']
    status,active=call('POST','/auth/login-password',{'phone':account['phone'],'password':account['password']})
    assert status==200 and active['user']['status']=='active'
    status,rejected=call('POST','/orders',{'warehouseId':fixture['summary']['warehouseId'],'items':[]},active['token'])
    assert status==409 and rejected.get('code')=='ORDERING_NOT_STARTED'
    success=True
    print(json.dumps({'production':False,'scenario':'prelaunch','checks':{'registrationOnly':True,'newAccountPendingWithoutGPS':True,'pendingPasswordLogin':True,'existingActiveLogin':True,'serverCheckoutGuard409':True}}))
finally:
    process.terminate()
    try: process.wait(timeout=20)
    except subprocess.TimeoutExpired: process.kill(); process.wait()
    log.close()
    output.unlink(missing_ok=True)
    if success: shutil.rmtree(root)
    else: print(json.dumps({'passed':False,'privateLog':str(root/'server.log')}))
