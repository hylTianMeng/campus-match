import hashlib, hmac, os, secrets, time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

engine = create_engine(os.getenv('DATABASE_URL', 'sqlite:///./campus.db'), connect_args={'check_same_thread': False, 'timeout': 30})
with engine.begin() as c:
    for sql in [
        'CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE,nickname TEXT,password TEXT,verified INTEGER DEFAULT 0,code TEXT,expires REAL,attempts INTEGER DEFAULT 0)',
        'CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires REAL)',
        'CREATE TABLE IF NOT EXISTS recruitments(id INTEGER PRIMARY KEY,owner INTEGER,title TEXT,description TEXT,category TEXT,location TEXT,deadline REAL,status TEXT DEFAULT "open",end_reason TEXT)',
        'CREATE TABLE IF NOT EXISTS positions(id INTEGER PRIMARY KEY,recruitment INTEGER,name TEXT,capacity INTEGER)',
        'CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY,user_id INTEGER,position INTEGER,message TEXT,status TEXT DEFAULT "pending",reason TEXT)',
    ]: c.execute(text(sql))
app = FastAPI(title='CampusCrew')
def run(c, sql, **kw): return c.execute(text(sql), kw)
def fail(msg, status=400): raise HTTPException(status, msg)
def auth(c, token, verified=False):
    u=run(c,'SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=:t AND s.expires>:now',t=token,now=time.time()).mappings().first()
    if not u: fail('请先登录',401)
    if verified and not u['verified']: fail('请先完成邮箱认证',403)
    return u

def expire(c):
    run(c,'UPDATE applications SET status="expired",reason="截止时间已到" WHERE status="pending" AND position IN (SELECT p.id FROM positions p JOIN recruitments r ON p.recruitment=r.id WHERE r.status="open" AND r.deadline<=:now)',now=time.time())
    run(c,'UPDATE recruitments SET status="ended",end_reason="expired" WHERE status="open" AND deadline<=:now',now=time.time())
def transaction():
    c=engine.connect(); c.exec_driver_sql('BEGIN IMMEDIATE'); return c
class Account(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8,max_length=128)
    nickname: str = Field(default='同学',min_length=1,max_length=40)
class Verification(BaseModel):
    code: str = Field(min_length=6,max_length=6)
class Position(BaseModel):
    name: str = Field(min_length=1,max_length=60)
    capacity: int = Field(ge=1,le=100)
class Recruitment(BaseModel):
    title: str = Field(min_length=1,max_length=100)
    description: str = Field(min_length=1,max_length=5000)
    category: str
    location: str = Field(default='',max_length=100)
    deadline: float
    positions: list[Position] = Field(min_length=1,max_length=20)
class Application(BaseModel):
    message: str = Field(default='',max_length=1000)
def digest(password,salt): return hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1).hex()
@app.post('/api/register')
def register(a: Account):
    email=a.email.strip().lower(); domain=email.split('@')
    allowed=os.getenv('CAMPUS_EMAIL_DOMAINS','example.edu').split(',')
    if len(domain)!=2 or not domain[0] or domain[1] not in allowed: fail('请使用允许的校园邮箱：'+', '.join(allowed))
    with transaction() as c:
        if run(c,'SELECT id FROM users WHERE email=:e',e=email).first(): fail('邮箱已注册')
        salt=secrets.token_hex(16); code=str(secrets.randbelow(900000)+100000)
        run(c,'INSERT INTO users(email,nickname,password,code,expires) VALUES(:e,:n,:p,:code,:exp)',e=email,n=a.nickname,p=salt+':'+digest(a.password,salt),code=hashlib.sha256(code.encode()).hexdigest(),exp=time.time()+600)
        out=Path(os.getenv('MAIL_OUTBOX','./mail-outbox')); out.mkdir(mode=0o700,parents=True,exist_ok=True)
        path=out/(secrets.token_hex(12)+'.txt')
        with open(path,'x',opener=lambda p,f: os.open(p,f,0o600)) as f: f.write(f'To: {email}\n校园认证验证码: {code}\n有效期十分钟。\n')
        c.commit()
    return {'message':'验证邮件已投递到开发邮件目录，请在十分钟内认证'}
@app.post('/api/login')
def login(a: Account):
    with engine.begin() as c:
        u=run(c,'SELECT * FROM users WHERE email=:e',e=a.email.strip().lower()).mappings().first()
        salt,stored=(u['password'] if u else 'dummy:invalid').split(':')
        if not hmac.compare_digest(digest(a.password,salt),stored): fail('邮箱或密码错误',401)
        token=secrets.token_urlsafe(32)
        run(c,'INSERT INTO sessions VALUES(:t,:u,:exp)',t=token,u=u['id'],exp=time.time()+86400)
    return {'token':token}
# Header authentication uses opaque, revocable session tokens.
@app.get('/api/profile')
def profile(authorization: str=Header(default='')):
    with engine.begin() as c:
        u=auth(c,authorization); return {k:u[k] for k in ('id','nickname','verified')}
@app.post('/api/logout')
def logout(authorization: str=Header(default='')):
    with engine.begin() as c: run(c,'DELETE FROM sessions WHERE token=:t',t=authorization)
    return {'ok':True}
@app.post('/api/verify')
def verify(v: Verification,authorization: str=Header(default='')):
    with transaction() as c:
        u=auth(c,authorization)
        if u['attempts']>=5 or u['expires']<time.time(): fail('验证码已失效')
        if not hmac.compare_digest(hashlib.sha256(v.code.encode()).hexdigest(),u['code']):
            run(c,'UPDATE users SET attempts=attempts+1 WHERE id=:id',id=u['id']); c.commit(); fail('验证码错误')
        run(c,'UPDATE users SET verified=1,code="",expires=0 WHERE id=:id',id=u['id']); c.commit()
    return {'ok':True}
@app.get('/api/recruitments')
def listing(q: str='',mine: bool=False,authorization: str=Header(default='')):
    with transaction() as c:
        expire(c); owner=auth(c,authorization)['id'] if mine else 0
        rows=run(c,'SELECT r.*,u.nickname FROM recruitments r JOIN users u ON r.owner=u.id WHERE (:owner=0 AND r.status="open" OR r.owner=:owner) AND (r.title LIKE :q OR r.description LIKE :q) ORDER BY r.id DESC LIMIT 100',owner=owner,q='%'+q+'%').mappings().all(); c.commit(); return [dict(r) for r in rows]
@app.post('/api/recruitments')
def create(r: Recruitment,authorization: str=Header(default='')):
    if r.deadline<=time.time(): fail('截止时间必须在未来')
    if r.category not in ['学习互助','竞赛组队','校园活动','兴趣交流']: fail('请选择有效分类')
    with transaction() as c:
        u=auth(c,authorization,True)
        rid=run(c,'INSERT INTO recruitments(owner,title,description,category,location,deadline) VALUES(:owner,:title,:description,:category,:location,:deadline)',owner=u['id'],**r.model_dump(exclude={'positions'})).lastrowid
        for p in r.positions: run(c,'INSERT INTO positions(recruitment,name,capacity) VALUES(:r,:n,:cap)',r=rid,n=p.name,cap=p.capacity)
        c.commit(); return {'id':rid}
@app.get('/api/recruitments/{rid}')
def detail(rid: int):
    with transaction() as c:
        expire(c); r=run(c,'SELECT r.*,u.nickname FROM recruitments r JOIN users u ON u.id=r.owner WHERE r.id=:id',id=rid).mappings().first()
        if not r: fail('招募不存在',404)
        result=dict(r); result['positions']=[dict(p) for p in run(c,'SELECT p.*, (SELECT count(*) FROM applications a WHERE a.position=p.id AND a.status="accepted") AS filled FROM positions p WHERE recruitment=:r',r=rid).mappings()]; c.commit(); return result
@app.post('/api/positions/{pid}/apply')
def apply(pid: int,a: Application,authorization: str=Header(default='')):
    with transaction() as c:
        expire(c); c.commit(); c.exec_driver_sql('BEGIN IMMEDIATE'); u=auth(c,authorization,True)
        p=run(c,'SELECT p.*,r.owner,r.status,r.deadline FROM positions p JOIN recruitments r ON p.recruitment=r.id WHERE p.id=:id',id=pid).mappings().first()
        if not p or p['status']!='open' or p['deadline']<=time.time(): fail('招募已结束或不存在')
        if p['owner']==u['id']: fail('不能申请自己的招募')
        if run(c,'SELECT id FROM applications WHERE user_id=:u AND ((position=:p AND status="pending") OR (status="accepted" AND position IN (SELECT id FROM positions WHERE recruitment=:r)))',u=u['id'],p=pid,r=p['recruitment']).first(): fail('已有待审申请或已被录取')
        if run(c,'SELECT count(*) FROM applications WHERE position=:p AND status="accepted"',p=pid).scalar()>=p['capacity']: fail('岗位已满')
        run(c,'INSERT INTO applications(user_id,position,message) VALUES(:u,:p,:m)',u=u['id'],p=pid,m=a.message); c.commit()
    return {'ok':True}
@app.get('/api/applications')
def applications(review: bool=False,authorization: str=Header(default='')):
    with transaction() as c:
        expire(c); u=auth(c,authorization)
        rows=run(c,'SELECT a.*,p.name,r.title,r.id AS recruitment,u.nickname FROM applications a JOIN positions p ON a.position=p.id JOIN recruitments r ON p.recruitment=r.id JOIN users u ON a.user_id=u.id WHERE '+('r.owner' if review else 'a.user_id')+'=:u ORDER BY a.id DESC',u=u['id']).mappings().all(); c.commit(); return [dict(r) for r in rows]
@app.post('/api/applications/{aid}/{action}')
def review(aid:int,action:str,authorization: str=Header(default='')):
    if action not in ['accept','reject']: fail('无效操作')
    with transaction() as c:
        expire(c); c.commit(); c.exec_driver_sql('BEGIN IMMEDIATE'); u=auth(c,authorization,True)
        a=run(c,'SELECT a.*,p.capacity,p.recruitment,r.owner,r.status AS recruitment_status,r.deadline FROM applications a JOIN positions p ON p.id=a.position JOIN recruitments r ON r.id=p.recruitment WHERE a.id=:id',id=aid).mappings().first()
        if not a or a['owner']!=u['id']: fail('无权审核',403)
        if a['status']!='pending' or a['recruitment_status']!='open' or a['deadline']<=time.time(): fail('申请或招募已结束')
        run(c,'UPDATE applications SET status=:s WHERE id=:id',s='accepted' if action=='accept' else 'rejected',id=aid)
        if action=='accept':
            run(c,'UPDATE applications SET status="withdrawn",reason="同招募其他岗位已录取" WHERE user_id=:u AND status="pending" AND position IN (SELECT id FROM positions WHERE recruitment=:r)',u=a['user_id'],r=a['recruitment'])
            run(c,'UPDATE applications SET status="rejected",reason="岗位名额已满" WHERE status="pending" AND position=:p AND (SELECT count(*) FROM applications WHERE position=:p AND status="accepted")>=:cap',p=a['position'],cap=a['capacity'])
            remaining=run(c,'SELECT count(*) FROM positions p WHERE recruitment=:r AND capacity>(SELECT count(*) FROM applications WHERE position=p.id AND status="accepted")',r=a['recruitment']).scalar()
            if not remaining: run(c,'UPDATE recruitments SET status="ended",end_reason="filled" WHERE id=:r',r=a['recruitment'])
        c.commit()
    return {'ok':True}
