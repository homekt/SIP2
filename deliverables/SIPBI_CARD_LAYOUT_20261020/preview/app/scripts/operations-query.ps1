# Fixed read-only Manufacturing source. No free-form query or sales filters.
param(
 [ValidateSet('status','dashboard')][string]$Mode='dashboard',
 [ValidateSet('production','fulfilment','budget')][string]$Kind='production',
 [ValidatePattern('\A[1-9][0-9]{3}(0[1-9]|1[0-2])\z')][string]$Month='202610'
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$connection = New-Object System.Data.OleDb.OleDbConnection('Provider=MSOLAP;Data Source=localhost:25000;Initial Catalog=SI_Powered_BI;Integrated Security=SSPI;Connect Timeout=10')
$datasets = New-Object System.Collections.Generic.List[object]
$date = [datetime]::ParseExact($Month+'01','yyyyMMdd',[Globalization.CultureInfo]::InvariantCulture)
$months = @(0..5 | ForEach-Object {$date.AddMonths(-5+$_).ToString('yyyyMM')})
$monthSet = '{'+(($months | ForEach-Object { '[Time].[Calendar].[Month].&['+$_+']' }) -join ',')+'}'
$axis = @{
 company=@{hierarchy='[Company].[Company]';members='[Company].[Company].[Company].MEMBERS'}
 machine=@{hierarchy='[Machine].[Machine]';members='[Machine].[Machine].[Machine].MEMBERS'}
 month=@{hierarchy='[Time].[Calendar]';members=$monthSet}
 reason=@{hierarchy='[DowntimeReason].[DowntimeReason]';members='[DowntimeReason].[DowntimeReason].[DowntimeReason].MEMBERS'}
 aging=@{hierarchy='[AgingBand].[AgingBand]';members='[AgingBand].[AgingBand].[AgingBand].MEMBERS'}
}
function Read-Dataset([string]$Name,[string]$DateRole,[string[]]$Axes,[string[]]$Measures,[string]$Scope) {
 $definitions=@();$metadata=@();$sets=@()
 foreach($dim in $Axes) {
  $h=$axis[$dim].hierarchy
  # Query-local metadata measures use native member properties, never caption parsing.
  $definitions += 'MEMBER [Measures].[Row_'+$dim+'_key] AS '+$h+'.CurrentMember.Properties("KEY")'
  $definitions += 'MEMBER [Measures].[Row_'+$dim+'_label] AS '+$h+'.CurrentMember.Properties("MEMBER_CAPTION")'
  $metadata += 'Row_'+$dim+'_key';$metadata += 'Row_'+$dim+'_label';$sets += $axis[$dim].members
 }
 $columns = @(($metadata+$Measures) | ForEach-Object {'[Measures].['+$_+']'})
 $mdx = ''
 if($definitions.Count -gt 0){$mdx='WITH '+($definitions -join "`n")+"`n"}
 $mdx += 'SELECT {'+($columns -join ',')+'} ON COLUMNS'
 if($Axes.Count -gt 0){
  # NonEmpty tests real measures only: metadata strings must not create phantom rows.
  $measureSet='{'+(($Measures | ForEach-Object {'[Measures].['+$_+']'}) -join ',')+'}'
  $mdx += ', NONEMPTY('+($sets -join ' * ')+','+$measureSet+') ON ROWS'
 }
 $mdx += ' FROM [SI Manufacturing BI]'
 if($Scope -eq 'selected'){$mdx+=' WHERE ([Time].[Calendar].[Month].&['+$Month+'])'}
 if($Scope -eq 'snapshot'){$mdx+=' WHERE ([Day].[Date].[Date].&[20261019])'}
 $cmd=$connection.CreateCommand();$cmd.CommandText=$mdx;$cmd.CommandTimeout=25
 $adapter=New-Object System.Data.OleDb.OleDbDataAdapter($cmd);$table=New-Object System.Data.DataTable
 try {[void]$adapter.Fill($table)} finally {$adapter.Dispose();$cmd.Dispose()}
 $rows=@(foreach($row in $table.Rows){
  $record=[ordered]@{}
  foreach($field in $metadata+$Measures){
   $column='[Measures].['+$field+']'
   if(-not $table.Columns.Contains($column)){throw 'Expected named measure column is missing.'}
   $v=$row[$column]
   if($field.StartsWith('Row_')){$record[$field.Substring(4)] = if($v -eq [DBNull]::Value){$null}else{[string]$v}}
   else {$record[$field] = if($v -eq [DBNull]::Value){$null}else{[double]$v}}
  }
  [pscustomobject]$record
 })
 $period = if($Scope -eq 'snapshot'){'2026-10-19'}elseif($Scope -eq 'history'){$months}else{$Month}
 [void]$datasets.Add([ordered]@{name=$Name;dateRole=$DateRole;grain=@($Axes);measures=@($Measures);period=$period;mdx=$mdx;rows=@($rows)})
}
try {
 $connection.Open()
 if($Mode -eq 'status'){Read-Dataset 'sourceProbe' 'ProductionDate' @() @('Planned Minutes') 'selected'}
 elseif($Kind -eq 'production'){
  $measures=@('Scheduled Job OEE %','Scrap Rate %','Input KG','Good KG','Scrap KG','Planned Minutes','Good Ideal Minutes','Operation Downtime Minutes')
  Read-Dataset 'summary' 'ProductionDate' @() $measures 'selected'
  Read-Dataset 'machines' 'ProductionDate' @('company','machine') $measures 'selected'
  Read-Dataset 'machineHistory' 'ProductionDate' @('company','machine','month') $measures 'history'
  Read-Dataset 'downtimeReasons' 'ProductionDate' @('reason') @('Reason Downtime Minutes','Downtime Event Count') 'selected'
 }
 elseif($Kind -eq 'budget'){
  $measures=@('Net Sales CNY','Budget Sales CNY','Budget Sales To Date CNY','Budget Gap CNY','Budget Gap To Date CNY','Budget Achievement %','Budget Achievement To Date %')
  Read-Dataset 'summary' 'EventDate / Budget MonthStart' @() $measures 'selected'
  Read-Dataset 'companies' 'EventDate / Budget MonthStart' @('company') $measures 'selected'
  Read-Dataset 'companyHistory' 'EventDate / Budget MonthStart' @('company','month') $measures 'history'
 }
 elseif($Kind -eq 'fulfilment'){
  $delivery=@('On Time Delivery %','Shipped Line Count','On Time Line Count','Late Days Sum')
  $backlog=@('Backlog CNY','Backlog KG','Backlog Line Count','Overdue Line Count')
  Read-Dataset 'summary' 'ActualShipDate' @() $delivery 'selected'
  Read-Dataset 'deliveryTrend' 'ActualShipDate' @('month') $delivery 'history'
  Read-Dataset 'backlogSummary' 'AsOfDate' @() $backlog 'snapshot'
  Read-Dataset 'backlogAging' 'AsOfDate' @('company','aging') $backlog 'snapshot'
 }
 [Console]::Out.WriteLine((@{status='ok';queriedAt=[datetime]::UtcNow.ToString('o');datasets=@($datasets.ToArray())}|ConvertTo-Json -Depth 12 -Compress))
} catch {
 [Console]::Error.WriteLine('Manufacturing read-only query failed: '+$_.Exception.Message)
 exit 3
} finally {$connection.Dispose()}
