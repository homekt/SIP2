"""Read exported CSVs independently and verify the documented synthetic contract."""
from pathlib import Path
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from collections import Counter, defaultdict
import argparse, csv, hashlib, json, re, sqlite3

def rint(v): return int(Decimal(v).quantize(Decimal(1),rounding=ROUND_HALF_UP))
def decoded(v):
    n=int(v); y=1900+n//1000; day=n%1000
    d=date(y,1,1)+timedelta(days=day-1)
    if day<1 or d.year!=y: raise ValueError('Invalid CYYDDD')
    return d

def row_errors(r):
    errors=[]
    for key,expected in [('SPAA2',r['SPSOQS']-r['SPSOQS2']),('SPAMT1',r['SPAEXP']-r['SPAEXPE1']-r['SPAA']),('SPAMT2',r['SPFEA']-r['SPFEAT']-r['SPAA1']),('SPAMT3',r['SPECST']-r['SPECSTC'])]:
        if r[key]!=expected: errors.append('reconcile_'+key)
    if not (0<=r['SPSOQS2']<=r['SPSOQS']): errors.append('return_quantity_bounds')
    for local,foreign in [('SPAEXP','SPFEA'),('SPAEXPE1','SPFEAT'),('SPAA','SPAA1')]:
        if r[local]!=rint(Decimal(r[foreign])*r['SPCRR']): errors.append('fx_'+local)
    if abs(Decimal(r['SPAMT1'])-Decimal(r['SPAMT2'])*r['SPCRR'])>Decimal('1.51'): errors.append('fx_net_rounding')
    if r['SPECST']!=rint(Decimal(r['SPSOQS'])*r['SPUNCS']/10000): errors.append('standard_cost_extension')
    if r['SPECSTC']!=rint(Decimal(r['SPSOQS2'])*r['SPUNCS']/10000): errors.append('return_cost_extension')
    try:
        dates=[decoded(r[c]) for c in ('SPTRDJ','SPADDJ','SPIVD','SPDGL')]
        if dates!=sorted(dates): errors.append('date_order')
        if dates[0]<date(2024,1,1) or dates[-1]>date(2026,9,30): errors.append('date_coverage_bounds')
    except (ValueError,OverflowError): errors.append('date_decode')
    if r['SPCRR']<=0: errors.append('positive_exchange_rate')
    if r['SPAMT1']<0 or r['SPAMT2']<0 or r['SPAMT3']<0: errors.append('negative_net_values')
    if r['SPUOM']!='KG': errors.append('quantity_unit')
    if r['SPEV01'] not in ('Y','N'): errors.append('bonded_flag')
    return errors

def validate(root):
    manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
    schema=json.loads((root/'schema_contract.json').read_text(encoding='utf-8'))
    specs=schema['tables']['SPKPRDDTA.F5530Z20']['columns']
    checks=[]
    def check(name,condition,detail=None): checks.append({'check':name,'passed':bool(condition),'detail':detail})
    with (root/'data/CGPRDDTA.F0006.csv').open(encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f); check('cost_center_columns',reader.fieldnames==['MCCO','MCMCU','MCDL01']); cc=list(reader)
    cc_keys=[(r['MCCO'],r['MCMCU']) for r in cc]
    check('cost_center_row_count',len(cc)==manifest['cost_center_rows'])
    check('cost_center_key_unique',len(cc_keys)==len(set(cc_keys)))
    conn=sqlite3.connect(':memory:'); conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('CREATE TABLE cc(co TEXT, center TEXT, PRIMARY KEY(co,center))')
    conn.executemany('INSERT INTO cc VALUES (?,?)',cc_keys)
    conn.execute('CREATE TABLE fact(co TEXT,doctype TEXT,doc INTEGER,line INTEGER,center TEXT,month INTEGER,fx TEXT,gross INTEGER,ret INTEGER,allowance INTEGER,net INTEGER,cost INTEGER,PRIMARY KEY(co,doctype,doc,line),FOREIGN KEY(co,center) REFERENCES cc(co,center))')
    failures=Counter(); company=Counter(); products=set(); customers=set(); plants=set(); reps=set(); months=set(); centers_used=set(); currencies=set(); scenarios=Counter(); headers={}; rows=[]
    aggregates=defaultdict(lambda:{'Rows':0,'NetSalesLocalRaw':0,'NetCostLocalRaw':0,'NetQtyRaw':0,'NetSalesUSD':Decimal(0),'NetCostUSD':Decimal(0)})
    fx={(f['CompanyKey'],f['MonthKey']):Decimal(f['LocalPerUSD']) for f in manifest['monthly_reporting_fx']}
    with (root/'data/SPKPRDDTA.F5530Z20.csv').open(encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f); check('sales_63_columns',len(reader.fieldnames)==63); check('sales_column_order',reader.fieldnames==[s['name'] for s in specs])
        for raw in reader:
            row={}
            for spec in specs:
                k=spec['name']; v=raw[k]; t=spec['sql_type']
                if v=='': failures['unexpected_null']+=1
                try:
                    row[k]=int(v) if t in ('bigint','int') else Decimal(v) if t.startswith('decimal') else v
                    if t=='int' and not (-2147483648<=row[k]<=2147483647): failures['int_range']+=1
                    if t=='bigint' and not (-2**63<=row[k]<2**63): failures['bigint_range']+=1
                    if 'char' in t and len(v)>int(re.search(r'\((\d+)\)',t)[1]): failures['text_length']+=1
                except (ValueError,TypeError): failures['physical_type']+=1; raise
            failures.update(row_errors(row))
            co=row['SPKCOO']; dt=decoded(row['SPIVD']); month=dt.year*100+dt.month
            company[co]+=1; products.add(row['SPLITM']); customers.add(row['SPAN8']); plants.add(row['SPMCU']); reps.add(row['SPAC01']); months.add(month); centers_used.add((co,row['SPMCU1'])); currencies.add(row['SPCRCD'])
            if row['SPSOQS2']==0: scenarios['no_return']+=1
            elif row['SPSOQS2']==row['SPSOQS']: scenarios['full_return']+=1
            else: scenarios['partial_return']+=1
            if row['SPAA']>0: scenarios['allowance']+=1
            if row['SPAMT1']<row['SPAMT3']: scenarios['negative_margin']+=1
            if row['SPAMT1']==0: scenarios['zero_net_sales']+=1
            if row['SPAEXP']!=row['SPFEA']: scenarios['different_local_foreign_amounts']+=1
            if row['SPSRP3']=='ZZZ': scenarios['classification_else']+=1
            if 'OEM' in row['SPLITM']: scenarios['oem']+=1
            if len({row[c] for c in ('SPTRDJ','SPADDJ','SPIVD','SPDGL')})>1: scenarios['different_lifecycle_dates']+=1
            hkey=(co,row['SPDCTO'],row['SPDOCO'])
            header=tuple(row[k] for k in ('SPAN8','SPAC01','SPCRCD','SPCRR','SPMCU','SPTRDJ','SPADDJ','SPIVD','SPDGL'))
            if hkey in headers and headers[hkey]!=header: failures['order_header_consistency']+=1
            headers[hkey]=header
            a=aggregates[(co,month)]; a['Rows']+=1; a['NetSalesLocalRaw']+=row['SPAMT1']; a['NetCostLocalRaw']+=row['SPAMT3']; a['NetQtyRaw']+=row['SPAA2']
            a['NetSalesUSD']+=(Decimal(row['SPAMT1'])/100/fx[(co,month)]).quantize(Decimal('.0001'),rounding=ROUND_HALF_UP)
            a['NetCostUSD']+=(Decimal(row['SPAMT3'])/100/fx[(co,month)]).quantize(Decimal('.0001'),rounding=ROUND_HALF_UP)
            rows.append(row)
            conn.execute('INSERT INTO fact VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(co,row['SPDCTO'],row['SPDOCO'],row['SPLNID'],row['SPMCU1'],month,row['SPCRCD'],row['SPAEXP'],row['SPAEXPE1'],row['SPAA'],row['SPAMT1'],row['SPAMT3']))
    check('sales_row_count',len(rows)==manifest['sales_rows'])
    for name in ['unexpected_null','physical_type','int_range','bigint_range','text_length','order_header_consistency','reconcile_SPAA2','reconcile_SPAMT1','reconcile_SPAMT2','reconcile_SPAMT3','return_quantity_bounds','fx_SPAEXP','fx_SPAEXPE1','fx_SPAA','fx_net_rounding','standard_cost_extension','return_cost_extension','date_order','date_coverage_bounds','date_decode','positive_exchange_rate','negative_net_values','quantity_unit','bonded_flag']:
        check(name,failures[name]==0,{'failed_rows':failures[name]})
    check('sqlite_primary_and_foreign_keys',conn.execute('PRAGMA foreign_key_check').fetchall()==[])
    check('inner_join_preserves_row_count',conn.execute('SELECT COUNT(*) FROM fact JOIN cc ON fact.co=cc.co AND fact.center=cc.center').fetchone()[0]==len(rows))
    check('sqlite_net_amount_reconciliation',conn.execute('SELECT COUNT(*) FROM fact WHERE net<>gross-ret-allowance').fetchone()[0]==0)
    check('company_coverage',len(company)==5); check('month_coverage',len(months)==33); check('company_month_coverage',len(aggregates)==165)
    check('all_products_present',len(products)==manifest['product_count']); check('all_customers_present',len(customers)==250); check('all_plants_present',len(plants)==10); check('all_centers_used',centers_used==set(cc_keys)); check('all_salespeople_present',len(reps)==20)
    check('multiple_currencies',currencies=={'TWD','CNY','MYR','IDR','USD','EUR'})
    for scenario in ('no_return','full_return','partial_return','allowance','negative_margin','zero_net_sales','different_local_foreign_amounts','classification_else','oem','different_lifecycle_dates'):
        check('scenario_'+scenario,scenarios[scenario]>0,{'rows':scenarios[scenario]})
    sqlagg={(co,mo):(n,s) for co,mo,n,s in conn.execute('SELECT co,month,COUNT(*),SUM(net) FROM fact GROUP BY co,month')}
    check('monthly_independent_aggregate',all(sqlagg[k]==(v['Rows'],v['NetSalesLocalRaw']) for k,v in aggregates.items()))
    for dimension,key,attributes in [('product','SPLITM',('SPITM','SPDSC1','SPSRP1','SPDL04','SPSRP2','SPDL05','SPSRP3','SPDL06')),('customer','SPAN8',('SPKCOO','SPALPH')),('salesperson','SPAC01',('SPKCOO','SPDL01'))]:
        members=defaultdict(set)
        for row in rows: members[row[key]].add(tuple(row[a] for a in attributes))
        check('dimension_'+dimension+'_attributes_consistent',all(len(v)==1 for v in members.values()))
    check('synthetic_marker_all_rows',all(r['SPDSC2']=='SYNTHETIC TEST ONLY' for r in rows))
    check('order_line_scaling',all(r['SPLNID']>0 and r['SPLNID']%1000==0 for r in rows))
    # Verify rejection behavior without distributing corrupted source datasets.
    probe=rows[0].copy(); probe['SPAMT1']+=100
    check('reject_probe_bad_net','reconcile_SPAMT1' in row_errors(probe))
    probe=rows[0].copy(); probe['SPSOQS2']=probe['SPSOQS']+1
    check('reject_probe_excess_returns','return_quantity_bounds' in row_errors(probe))
    probe=rows[0].copy(); probe['SPIVD']=126999
    check('reject_probe_invalid_date','date_decode' in row_errors(probe))
    try:
        conn.execute('INSERT INTO fact SELECT * FROM fact LIMIT 1')
        rejected_duplicate=False
    except sqlite3.IntegrityError: rejected_duplicate=True
    check('reject_probe_duplicate_primary_key',rejected_duplicate)
    try:
        conn.execute("INSERT INTO fact VALUES ('00020','SO',99999999,1000,'MISSING',202401,'USD',1,0,0,1,0)")
        rejected_orphan=False
    except sqlite3.IntegrityError: rejected_orphan=True
    check('reject_probe_orphan_cost_center',rejected_orphan)
    check('file_source_field_coverage',len(specs)==63)
    report={'dataset_id':manifest['dataset_id'],'status':'PASS' if all(c['passed'] for c in checks) else 'FAIL','checks_passed':sum(c['passed'] for c in checks),'checks_total':len(checks),'scope':'Exported CSV validation plus SQLite constraints/joins; SQL Server and SSAS not executed.', 'company_rows':dict(company),'scenarios':dict(scenarios),'order_count':len(headers),'checks':checks}
    (root/'validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    control=[]
    for (co,month),a in sorted(aggregates.items()):
        item={'CompanyKey':co,'MonthKey':month,**a}
        for k in ('NetSalesUSD','NetCostUSD'): item[k]=str(item[k])
        control.append(item)
    (root/'expected_cube_totals.json').write_text(json.dumps(control,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('status','checks_passed','checks_total','order_count','scenarios')},ensure_ascii=False))
    if report['status']!='PASS': raise SystemExit(1)

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('directory',type=Path); validate(ap.parse_args().directory)
