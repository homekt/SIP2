"""Generate a deterministic, portable two-table SQL Server/SSAS fixture.

Only writes the output directory supplied on the command line. No DB connection.
Python 3.10+ standard library only. Schema is a synthetic contract, not source DDL.
"""
from pathlib import Path
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
import argparse, calendar, csv, hashlib, json, math, random, re, shutil, zipfile

SEED = 20261020
START, END = date(2024, 1, 1), date(2026, 9, 30)
DB = 'JDE_CUBE_SYNTHETIC_20261020'
COMPANIES = [
    ('00020','虛擬台灣公司','TWD','32.0'),
    ('00027','虛擬昆山公司','CNY','7.1'),
    ('00026','虛擬檳城公司','MYR','4.6'),
    ('00029','虛擬塗佈公司','TWD','32.0'),
    ('00121','虛擬印尼公司','IDR','15800.0'),
]
CATEGORIES = [
    ('BV','BV1','重包裝'), ('BF','BFL','PE袋'), ('BF','BFT','PE袋'),
    ('BZ','BZS','PE袋'), ('BZ','BZZ','PE袋'), ('BZ','BZB','PE袋'), ('BZ','BZT','PE袋'),
    ('CW','CWH','H'), ('CW','CWM','M'), ('CW','CWP','P'), ('CS','CSA','CSA'),
    ('EB','EBB','暖暖包'), ('EB','EBN','BRE'), ('EB','EBP','BRE'),
    ('EB','EBQ','BRE'), ('EB','EBD','BRE'), ('EN','ENN','NBR'),
    ('EN','ENP','NBR'), ('EN','ENQ','NBR'), ('EN','END','NBR'),
    ('EZ','EZB','PEVA'), ('ZZ','ZZZ','未分類測試'),
]
NUMERIC = set('SPLNID SPSOQS SPAEXP SPFEA SPECST SPUNCS SPSOQS2 SPAEXPE1 SPFEAT SPECSTC SPAA SPAA1 SPAA2 SPAMT1 SPAMT2 SPAMT3'.split()) | {f'SPAAN{i:02}' for i in range(1,14)}
INTEGERS = set('SPDOCO SPITM SPSHPN SPAN8 SPDOC SPTRDJ SPADDJ SPIVD SPDGL'.split())
TEXT_TYPES = {
 'SPKCOO':'char(5)', 'SPMCU':'varchar(12)', 'SPDCTO':'varchar(2)',
 'SPURRF':'varchar(30)', 'SPAC01':'varchar(10)', 'SPDL01':'nvarchar(60)',
 'SPLITM':'varchar(30)', 'SPGLC':'varchar(8)', 'SPLOTN':'varchar(30)',
 'SPUOM':'varchar(3)', 'SPEV01':'char(1)', 'SPMCU1':'varchar(12)',
 'SPDL02':'varchar(20)', 'SPDL03':'varchar(20)', 'SPCRCD':'char(3)',
 'SPALPH':'nvarchar(100)', 'SPDSC1':'nvarchar(100)', 'SPDSC2':'nvarchar(100)',
 'SPSRP1':'varchar(3)', 'SPDL04':'nvarchar(80)', 'SPSRP2':'varchar(3)',
 'SPDL05':'nvarchar(80)', 'SPSRP3':'varchar(3)', 'SPDL06':'nvarchar(80)',
}
FIELDS = '''SPKCOO SPMCU SPDCTO SPDOCO SPLNID SPURRF SPAC01 SPDL01 SPLITM SPITM SPGLC SPLOTN
SPSOQS SPAEXP SPFEA SPECST SPUNCS SPSOQS2 SPAEXPE1 SPFEAT SPECSTC SPAA SPAA1 SPAA2 SPUOM SPAMT1 SPAMT2 SPAMT3
SPEV01 SPMCU1 SPDL02 SPDL03 SPCRCD SPCRR SPSHPN SPAN8 SPALPH SPDSC1 SPDSC2 SPSRP1 SPDL04 SPSRP2 SPDL05 SPSRP3 SPDL06
SPDOC SPTRDJ SPADDJ SPIVD SPDGL SPAAN01 SPAAN02 SPAAN03 SPAAN04 SPAAN05 SPAAN06 SPAAN07 SPAAN08 SPAAN09 SPAAN10 SPAAN11 SPAAN12 SPAAN13'''.split()
assert len(FIELDS)==63 and set(FIELDS)==NUMERIC | INTEGERS | set(TEXT_TYPES) | {'SPCRR'}

def rounded(value):
    return int(Decimal(value).quantize(Decimal('1'), rounding=ROUND_HALF_UP))

def rawdate(d):
    # Deliberate fixture convention CYYDDD, not evidence about real GET_DATE.
    return (d.year-1900)*1000 + d.timetuple().tm_yday

def classification(c2,c3,item):
    if c2=='BV': major='重包裝'
    elif c2 in ('BZ','BF'): major='PE袋'
    elif c2.startswith('C'): major='缠绕膜'
    elif c2=='EZ': major='PEVA'
    elif c2 in ('EB','EN'): major='PE代工' if 'OEM' in item else '压花膜'
    else: major=' '
    if c3.startswith('BV'): middle='重包裝'
    elif c3 in ('BFL','BFT','BZS','BZZ','BZB','BZT'): middle='PE袋'
    elif c3 in ('CWH','CWM','CWP'): middle=c3[-1]
    elif c3=='CSA': middle='CSA'
    elif c3=='EBB': middle='暖暖包'
    elif c3 in ('EBN','EBP','EBQ','EBD'): middle='BRE代工' if 'OEM' in item else 'BRE'
    elif c3 in ('ENN','ENP','ENQ','END'): middle='NBR代工' if 'OEM' in item else 'NBR'
    elif c3=='EZB': middle='PEVA '
    else: middle='  '
    return major,middle

def write_csv(path, fields, rows):
    with path.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n')
        w.writeheader(); w.writerows(rows)

def make_schema(out):
    specs=[{'name':f,'sql_type': ('bigint' if f in NUMERIC else 'int' if f in INTEGERS else 'decimal(19,8)' if f=='SPCRR' else TEXT_TYPES[f]), 'nullable':False,
            'business_scale':1000 if f=='SPLNID' else 10000 if f=='SPUNCS' else 100 if f in NUMERIC else 1,
            'date_encoding':'CYYDDD (synthetic assumption)' if f in ('SPTRDJ','SPADDJ','SPIVD','SPDGL') else None} for f in FIELDS]
    schema={'status':'SYNTHETIC_TEST_CONTRACT_NOT_PRODUCTION_DDL','tables':{
      'SPKPRDDTA.F5530Z20':{'columns':specs,'primary_key':['SPKCOO','SPDCTO','SPDOCO','SPLNID'], 'grain':'One closed sales order line; cumulative returns and allowances on the same line.'},
      'CGPRDDTA.F0006':{'columns':[{'name':'MCCO','sql_type':'char(5)','nullable':False},{'name':'MCMCU','sql_type':'varchar(12)','nullable':False},{'name':'MCDL01','sql_type':'nvarchar(100)','nullable':False}], 'primary_key':['MCCO','MCMCU']}}}
    (out/'schema_contract.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2),encoding='utf-8')
    ddl=f"USE [{DB}];\nGO\nIF DB_NAME() <> N'{DB}' THROW 51000, 'Wrong target database.', 1;\nGO\nCREATE SCHEMA CGPRDDTA;\nGO\nCREATE SCHEMA SPKPRDDTA;\nGO\nCREATE SCHEMA bi;\nGO\n"
    ddl+='CREATE TABLE CGPRDDTA.F0006 (\n MCCO char(5) NOT NULL,\n MCMCU varchar(12) NOT NULL,\n MCDL01 nvarchar(100) NOT NULL,\n CONSTRAINT PK_F0006 PRIMARY KEY (MCCO,MCMCU)\n);\nGO\n'
    ddl+='CREATE TABLE SPKPRDDTA.F5530Z20 (\n'+',\n'.join(' '+s['name']+' '+s['sql_type']+' NOT NULL' for s in specs)
    ddl+=",\n CONSTRAINT PK_F5530Z20 PRIMARY KEY (SPKCOO,SPDCTO,SPDOCO,SPLNID),\n CONSTRAINT FK_Sales_CostCenter FOREIGN KEY (SPKCOO,SPMCU1) REFERENCES CGPRDDTA.F0006(MCCO,MCMCU),\n CONSTRAINT CK_Sales_NetQty CHECK (SPAA2=SPSOQS-SPSOQS2),\n CONSTRAINT CK_Sales_NetLC CHECK (SPAMT1=SPAEXP-SPAEXPE1-SPAA),\n CONSTRAINT CK_Sales_NetFC CHECK (SPAMT2=SPFEA-SPFEAT-SPAA1),\n CONSTRAINT CK_Sales_NetCost CHECK (SPAMT3=SPECST-SPECSTC),\n CONSTRAINT CK_Sales_ReturnQty CHECK (SPSOQS2>=0 AND SPSOQS2<=SPSOQS),\n CONSTRAINT CK_Sales_FX CHECK (SPCRR>0)\n);\nGO\n"
    (out/'sql'/'01_create_tables.sql').write_text('-- Synthetic types and constraints, not recovered production DDL.\n'+ddl,encoding='utf-8-sig')

def generate(out, source, count):
    rng=random.Random(SEED)
    (out/'data').mkdir(parents=True,exist_ok=True); (out/'sql').mkdir(exist_ok=True)
    months=[(y,m) for y in range(2024,2027) for m in range(1,13) if date(y,m,1)<=END]
    weights=[(1+0.10*(y-2024))*(0.80 if m==2 else 1.20 if m in (9,10,11) else 1.0) for y,m in months]
    fx={}
    fxrecords=[]
    for y,m in months:
        for ci,(co,name,lc,base) in enumerate(COMPANIES):
            rate=(Decimal(base)*(Decimal(1)+Decimal('0.025')*Decimal(str(math.sin((y-2024)*12+m+ci))))).quantize(Decimal('.00000001'),rounding=ROUND_HALF_UP)
            eur=(Decimal('1.08')+Decimal('0.015')*Decimal(str(math.cos((y-2024)*12+m)))).quantize(Decimal('.00000001'),rounding=ROUND_HALF_UP)
            fx[(co,y*100+m)]=(rate,eur)
            fxrecords.append({'CompanyKey':co,'MonthKey':y*100+m,'LocalCurrency':lc,'LocalPerUSD':str(rate),'USDPerEUR':str(eur)})
    products=[]
    for catidx,(c2,c3,label) in enumerate(CATEGORIES):
        for variant in range(1,7):
            oem=c2 in ('EB','EN') and variant%2==0
            products.append({'code':f'{c3}-'+('OEM-' if oem else '')+f'{variant:02}', 'id':20000+len(products),
               'c2':c2,'c3':c3,'label':label,'name':f'虛擬{label}產品{variant:02}'+('代工' if oem else ''),
               'base_price':Decimal('1.25')+Decimal(catidx%8)*Decimal('.36')+Decimal(variant)*Decimal('.09')})
    centers=[]
    for ci,(co,name,lc,base) in enumerate(COMPANIES):
        for plant in (1,2):
            for cc in (1,2,3):
                centers.append({'MCCO':co,'MCMCU':f'{co}P{plant}C{cc}','MCDL01':f'{name}廠{plant}成本中心{cc}'})
    write_csv(out/'data/CGPRDDTA.F0006.csv',['MCCO','MCMCU','MCDL01'],centers)
    orders=[500000]*5
    rows=[]
    while len(rows)<count:
        ci=rng.choices(range(5),weights=[30,25,17,12,16])[0]
        co,company,lc,base=COMPANIES[ci]
        y,m=rng.choices(months,weights=weights)[0]
        last=calendar.monthrange(y,m)[1]
        inv=date(y,m,rng.randint(1,last))
        ship=max(START,inv-timedelta(days=rng.randint(0,3)))
        ordered=max(START,ship-timedelta(days=rng.randint(1,14)))
        gl=min(END,inv+timedelta(days=rng.randint(0,2)))
        plant=rng.randint(1,2); cc=rng.randint(1,3)
        customer=ci*1000+rng.randint(1,50)
        customerid=100000+customer
        rep=customer%4+1
        order=orders[ci]; orders[ci]+=1
        doctype=rng.choices(['SO','ST'],[90,10])[0]
        tx=rng.choices([lc,'USD','EUR'],[55,35,10])[0]
        local_usd,usd_eur=fx[(co,y*100+m)]
        local_tx=Decimal(1) if tx==lc else local_usd if tx=='USD' else (local_usd*usd_eur).quantize(Decimal('.00000001'),rounding=ROUND_HALF_UP)
        lines=min(rng.randint(1,5),count-len(rows))
        for ln,p in enumerate(rng.sample(products,lines),1):
            qty=rng.randint(100,4000)*100+rng.randint(0,99)
            quantity_factor=Decimal('1.18') if m in (9,10,11) else Decimal('.85') if m==2 else Decimal(1)
            qty=rounded(Decimal(qty)*quantity_factor)
            event=rng.random()
            ret=qty if event<.01 else rounded(Decimal(qty)*Decimal(str(rng.uniform(.02,.20)))) if event<.10 else 0
            price_usd=p['base_price']*(Decimal(1)+Decimal('.035')*(y-2024))*Decimal(str(rng.uniform(.94,1.08)))
            negative_margin=rng.random()<.02
            if negative_margin: price_usd*=Decimal('.60')
            usd_per_tx=Decimal(1) if tx=='USD' else usd_eur if tx=='EUR' else Decimal(1)/local_usd
            sale_fc=rounded(Decimal(qty)*price_usd/usd_per_tx)
            ret_fc=rounded(Decimal(sale_fc)*ret/qty)
            remaining=sale_fc-ret_fc
            allow_fc=rounded(Decimal(remaining)*Decimal(str(rng.uniform(.005,.025)))) if rng.random()<.08 and remaining else 0
            sale_lc=rounded(Decimal(sale_fc)*local_tx)
            ret_lc=rounded(Decimal(ret_fc)*local_tx)
            allow_lc=rounded(Decimal(allow_fc)*local_tx)
            std=rounded(p['base_price']*Decimal('.74')*(Decimal(1)+Decimal('.03')*(y-2024))*local_usd*10000)
            cost=rounded(Decimal(qty)*std/10000)
            retcost=rounded(Decimal(ret)*std/10000)
            netlc=sale_lc-ret_lc-allow_lc
            row={f:0 for f in FIELDS}
            row.update(SPKCOO=co,SPMCU=f'{co}P{plant}',SPDCTO=doctype,SPDOCO=order,SPLNID=ln*1000,
                SPURRF=f'CT-{co}-{y}-{customer%12+1:02}',SPAC01=f'{co}S{rep}',SPDL01=f'{company}業代{rep}',
                SPLITM=p['code'],SPITM=p['id'],SPGLC='FG01',SPLOTN=f'LOT-{y}{m:02}-{plant}-{p["id"]}',
                SPSOQS=qty,SPAEXP=sale_lc,SPFEA=sale_fc,SPECST=cost,SPUNCS=std,
                SPSOQS2=ret,SPAEXPE1=ret_lc,SPFEAT=ret_fc,SPECSTC=retcost,SPAA=allow_lc,SPAA1=allow_fc,
                SPAA2=qty-ret,SPUOM='KG',SPAMT1=netlc,SPAMT2=remaining-allow_fc,SPAMT3=cost-retcost,
                SPEV01='Y' if rng.random()<.25 else 'N',SPMCU1=f'{co}P{plant}C{cc}',
                SPDL02='400100',SPDL03='500100',SPCRCD=tx,SPCRR=f'{local_tx:.8f}',
                SPSHPN=700000+order-500000,SPAN8=customerid,SPALPH=f'{company}測試客戶{customer%1000:03}',
                SPDSC1=p['name'],SPDSC2='SYNTHETIC TEST ONLY',SPSRP1='FG',SPDL04='虛擬製成品',
                SPSRP2=p['c2'],SPDL05=classification(p['c2'],p['c3'],p['code'])[0],
                SPSRP3=p['c3'],SPDL06=p['label'],SPDOC=900000+order-500000,
                SPTRDJ=rawdate(ordered),SPADDJ=rawdate(ship),SPIVD=rawdate(inv),SPDGL=rawdate(gl))
            for k in range(1,14):
                row[f'SPAAN{k:02}']=rounded(Decimal(netlc)*Decimal(str(rng.uniform(-.008,.008)))) if rng.random()<.35 else 0
            row['SPAAN08']=rounded(Decimal(netlc)*Decimal('.05'))
            assert set(row)==set(FIELDS)
            rows.append(row)
    rows.sort(key=lambda r:(r['SPIVD'],r['SPKCOO'],r['SPDCTO'],r['SPDOCO'],r['SPLNID']))
    write_csv(out/'data/SPKPRDDTA.F5530Z20.csv',FIELDS,rows)
    make_schema(out)
    manifest={'dataset_id':DB,'version':'1.0','is_synthetic':True,'seed':SEED,
        'as_of':'2026-09-30','period_start':str(START),'period_end':str(END),
        'sales_rows':len(rows),'cost_center_rows':len(centers),'source_columns':{'F5530Z20':63,'F0006':3},
        'companies': [{'CompanyKey':co,'CompanyName':name,'LocalCurrency':lc} for co,name,lc,_ in COMPANIES],
        'product_count':len(products),'customer_count':250,'plant_count':10,
        'date_encoding':'CYYDDD: (year-1900)*1000 + day_of_year; synthetic convention only',
        'fx_direction':'SPCRR = local currency units per 1 transaction currency unit',
        'fx_rates_are':'synthetic, not market exchange rates',
        'quantity_unit':'KG for all rows by deliberate fixture simplification',
        'grain':'One closed order line including cumulative returns/allowances; no separate return event date.',
        'monthly_reporting_fx':fxrecords,'source_sql_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'live_database_modified':False,'ssas_deployed_or_processed':False}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    src=source.read_text(encoding='utf-8-sig')
    first2='SELECT'+re.split(r'(?im)^select\b',src)[1]+'SELECT'+re.split(r'(?im)^select\b',src)[2]
    found={x.upper() for x in re.findall(r'\bSP[A-Z0-9]+\b',first2,re.I)}-{'SPKPRDDTA'}
    assert found==set(FIELDS),'Source field coverage differs'
    (out/'source_queries_1_2.txt').write_text(first2,encoding='utf-8-sig')
    # SQL constants for synthetic supporting dimensions: no additional physical tables.
    values=','.join(f"('{f['CompanyKey']}',{f['MonthKey']},'{f['LocalCurrency']}',CAST({f['LocalPerUSD']} AS decimal(19,8)))" for f in fxrecords)
    sql=f"USE [{DB}];\nGO\nCREATE VIEW bi.DimCompany AS\nSELECT * FROM (VALUES\n"+ ',\n'.join(f"('{co}',N'{name}','{lc}')" for co,name,lc,_ in COMPANIES)+") V(CompanyKey,CompanyName,LocalCurrency);\nGO\n"
    sql+='CREATE VIEW bi.SyntheticMonthlyFX AS\nSELECT * FROM (VALUES\n'+values+') V(CompanyKey,MonthKey,LocalCurrency,LocalPerUSD);\nGO\n'
    (out/'sql/03_cube_views.sql').write_text(sql,encoding='utf-8-sig')
    print(json.dumps({'sales_rows':len(rows),'cost_center_rows':len(centers),'products':len(products),'output':str(out)},ensure_ascii=False))

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--source',type=Path,required=True); ap.add_argument('--rows',type=int,default=60000)
    a=ap.parse_args()
    if a.rows<1000: ap.error('--rows must be at least 1000 for coverage checks')
    generate(a.output.resolve(),a.source,a.rows)
