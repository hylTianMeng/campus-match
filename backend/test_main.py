import importlib, os, re, time
import pytest
from fastapi.testclient import TestClient
@pytest.fixture
def setup(tmp_path,monkeypatch):
    monkeypatch.setenv('DATABASE_URL','sqlite:///'+str(tmp_path/'test.db'))
    monkeypatch.setenv('MAIL_OUTBOX',str(tmp_path/'mail'))
    import main
    importlib.reload(main)
    client=TestClient(main.app)
    def account(name,verify=True):
        data={'email':name+'@example.edu','password':'test-password','nickname':name}
        assert client.post('/api/register',json=data).status_code==200
        token=client.post('/api/login',json=data).json()['token']; headers={'Authorization':token}
        mail=next(p for p in (tmp_path/'mail').glob('*.txt') if data['email'] in p.read_text())
        code=re.search(r'验证码: (\d+)',mail.read_text())[1]
        if verify: assert client.post('/api/verify',headers=headers,json={'code':code}).status_code==200
        return headers
    return client,account,main

def test_full_workflow(setup):
    c,account,m=setup
    owner=account('owner'); a=account('alice'); b=account('bob')
    body={'title':'数学竞赛','description':'一起准备竞赛','category':'竞赛组队','deadline':time.time()+3600,'positions':[{'name':'建模','capacity':1},{'name':'编程','capacity':1}]}
    rid=c.post('/api/recruitments',headers=owner,json=body).json()['id']
    ps=c.get(f'/api/recruitments/{rid}').json()['positions']
    for h in [a,b]:
        for p in ps: assert c.post(f'/api/positions/{p["id"]}/apply',headers=h,json={}).status_code==200
    assert c.post(f'/api/positions/{ps[0]["id"]}/apply',headers=a,json={}).status_code==400
    apps=c.get('/api/applications?review=true',headers=owner).json()
    aid=next(x['id'] for x in apps if x['nickname']=='alice' and x['position']==ps[0]['id'])
    assert c.post(f'/api/applications/{aid}/accept',headers=b,json={}).status_code==403
    assert c.post(f'/api/applications/{aid}/accept',headers=owner,json={}).status_code==200
    alice=c.get('/api/applications',headers=a).json(); assert {x['status'] for x in alice}=={'accepted','withdrawn'}
    bob=c.get('/api/applications',headers=b).json(); assert {x['status'] for x in bob}=={'pending','rejected'}
    bid=next(x['id'] for x in bob if x['status']=='pending')
    assert c.post(f'/api/applications/{bid}/accept',headers=owner,json={}).status_code==200
    detail=c.get(f'/api/recruitments/{rid}').json(); assert detail['end_reason']=='filled'
    assert all(p['filled']==1 for p in detail['positions'])
    assert c.get('/api/recruitments').json()==[]
    assert c.post(f'/api/applications/{bid}/reject',headers=owner,json={}).status_code==400

def test_auth_and_expiry(setup):
    c,account,m=setup
    unverified=account('new',False); owner=account('owner'); applicant=account('applicant')
    body={'title':'读书','description':'阅读交流','category':'学习互助','deadline':time.time()+3600,'positions':[{'name':'读者','capacity':2}]}
    assert c.post('/api/recruitments',headers=unverified,json=body).status_code==403
    assert c.post('/api/recruitments',json=body).status_code==401
    rid=c.post('/api/recruitments',headers=owner,json=body).json()['id']
    pid=c.get(f'/api/recruitments/{rid}').json()['positions'][0]['id']
    assert c.post(f'/api/positions/{pid}/apply',headers=owner,json={}).status_code==400
    assert c.post(f'/api/positions/{pid}/apply',headers=applicant,json={}).status_code==200
    with m.engine.begin() as db: m.run(db,'UPDATE recruitments SET deadline=0')
    assert c.post(f'/api/positions/{pid}/apply',headers=applicant,json={}).status_code==400
    assert c.get('/api/applications',headers=applicant).json()[0]['status']=='expired'
    c.post('/api/logout',headers=owner,json={})
    assert c.get('/api/profile',headers=owner).status_code==401
