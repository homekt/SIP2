# Sales cube query. Invoke with powershell.exe -File and validated arguments only.
# HTTP callers must not pass raw MDX. This script builds MDX from an allowlist.
param(
  [Parameter(Mandatory = $true)]
  [string]$Mode,
  [string]$Month = '202609',
  [string]$Company = 'All',
  [string]$Product = 'All',
  [string]$Customer = 'All',
  [string]$Salesperson = 'All',
  [string]$Plant = 'All',
  [string]$CostCenter = 'All',
  [string]$PriorMonth = '',
  [string]$YtdMonths = '',
  [string]$Rolling3Months = '',
  [string]$Rolling12Months = '',
  [string]$MonthlyMonths = '',
  [string]$AnalysisServer = 'localhost:25000',
  [string]$Database = 'JDE_SALES_CUBE_20261020',
  [string]$Cube = 'JDE Sales'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$MeasureMdx = @(
  '[Measures].[Net Sales USD]',
  '[Measures].[Net Cost USD]',
  '[Measures].[Gross Profit USD]',
  '[Measures].[Net Quantity KG]',
  '[Measures].[Sales Quantity KG]',
  '[Measures].[Return Quantity KG]',
  '[Measures].[Order Count]',
  '[Measures].[Sales Line Count]',
  '[Measures].[Full Return Line Count]',
  '[Measures].[Partial Return Line Count]',
  '[Measures].[Allowance Line Count]',
  '[Measures].[Negative Margin Line Count]'
)
$MeasureFields = @(
  'netSalesUSD',
  'netCostUSD',
  'grossProfitUSD',
  'netQtyKG',
  'salesQtyKG',
  'returnQtyKG',
  'orderCount',
  'salesLineCount',
  'fullReturnLineCount',
  'partialReturnLineCount',
  'allowanceLineCount',
  'negativeMarginLineCount'
)

function Write-Json($Value) {
  $json = $Value | ConvertTo-Json -Depth 8 -Compress
  [Console]::Out.WriteLine($json)
}

function Get-SafeMessage($Exception) {
  $text = [string]$Exception.Message
  $text = [regex]::Replace($text, '(?i)Provider=[^;]*;?', '')
  $text = [regex]::Replace($text, '(?i)(password|pwd|secret)\s*=\s*[^;]*', '')
  if ([string]::IsNullOrWhiteSpace($text)) { $text = 'The cube query failed.' }
  if ($text.Length -gt 240) { $text = $text.Substring(0, 240) }
  return $text.Trim()
}

function Assert-Key([string]$Key) {
  if ($Key -eq 'All') { return }
  if ([string]::IsNullOrEmpty($Key) -or $Key.Length -gt 40) {
    throw (New-Object System.ArgumentException 'A member key is not allowed.')
  }
  $bad = @('[', ']', '{', '}', '(', ')', ',', ';', '"', "'", '&', '\')
  foreach ($token in $bad) {
    if ($Key.Contains($token)) { throw (New-Object System.ArgumentException 'A member key is not allowed.') }
  }
  foreach ($char in $Key.ToCharArray()) {
    if ([int]$char -lt 32) { throw (New-Object System.ArgumentException 'A member key is not allowed.') }
  }
}

function Assert-Month([string]$Value) {
  if ($Value -eq 'All') { return }
  if ($Value -notmatch '^\d{4}(0[1-9]|1[0-2])$') {
    throw (New-Object System.ArgumentException 'Month must be All or YYYYMM.')
  }
}

function Parse-Months([string]$Text) {
  $out = New-Object System.Collections.Generic.List[string]
  if ([string]::IsNullOrWhiteSpace($Text)) { return $out }
  foreach ($part in $Text.Split(',')) {
    $item = $part.Trim()
    if ($item.Length -eq 0) { continue }
    Assert-Month $item
    if ($item -eq 'All') { throw (New-Object System.ArgumentException 'A month list cannot contain All.') }
    [void]$out.Add($item)
  }
  if ($out.Count -gt 48) { throw (New-Object System.ArgumentException 'Too many months were requested.') }
  return $out
}

function Format-MonthSet($Months) {
  $bits = New-Object System.Collections.Generic.List[string]
  foreach ($item in @($Months)) {
    $text = [string]$item
    if ([string]::IsNullOrWhiteSpace($text)) { continue }
    [void]$bits.Add("[Invoice Date].[Calendar].[Month].&[$text]")
  }
  if ($bits.Count -eq 0) { return '' }
  return '{ ' + ($bits -join ', ') + ' }'
}

function Get-FilterWhere([hashtable]$Filters, [string]$MonthKey) {
  $parts = New-Object System.Collections.Generic.List[string]
  if ($MonthKey -and $MonthKey -ne 'All') {
    Assert-Month $MonthKey
    [void]$parts.Add("[Invoice Date].[Calendar].[Month].&[$MonthKey]")
  }
  $map = [ordered]@{
    Company = '[Company].[Company]'
    Product = '[Product].[Product]'
    Customer = '[Customer].[Customer]'
    Salesperson = '[Salesperson].[Salesperson]'
    Plant = '[Plant].[Plant]'
    CostCenter = '[Cost Center].[Cost Center]'
  }
  foreach ($name in @($map.Keys)) {
    $value = [string]$Filters[$name]
    if ($value -and $value -ne 'All') {
      Assert-Key $value
      [void]$parts.Add($map[$name] + '.&[' + $value + ']')
    }
  }
  if ($parts.Count -eq 0) { return '' }
  if ($parts.Count -eq 1) { return $parts[0] }
  return '(' + ($parts -join ', ') + ')'
}

function Get-From([string]$MonthSetExpression, [string]$WhereExpression) {
  $from = 'FROM [JDE Sales]'
  if ($MonthSetExpression) {
    $from = 'FROM (SELECT ' + $MonthSetExpression + ' ON COLUMNS FROM [JDE Sales])'
  }
  if ($WhereExpression) { $from = $from + ' WHERE ' + $WhereExpression }
  return $from
}

function Get-MeasureList([bool]$WithRow) {
  $cols = New-Object System.Collections.Generic.List[string]
  if ($WithRow) {
    [void]$cols.Add('[Measures].[RowKey]')
    [void]$cols.Add('[Measures].[RowLabel]')
  }
  foreach ($measure in $MeasureMdx) { [void]$cols.Add($measure) }
  return '{ ' + ($cols -join ', ') + ' }'
}

function Get-AxisSpec([string]$Name) {
  $table = @{
    company = @{ Set = '[Company].[Company].[Company].MEMBERS'; Current = '[Company].[Company]' }
    plant = @{ Set = '[Plant].[Plant].[Plant].MEMBERS'; Current = '[Plant].[Plant]' }
    costCenter = @{ Set = '[Cost Center].[Cost Center].[Cost Center].MEMBERS'; Current = '[Cost Center].[Cost Center]' }
    customer = @{ Set = '[Customer].[Customer].[Customer].MEMBERS'; Current = '[Customer].[Customer]' }
    salesperson = @{ Set = '[Salesperson].[Salesperson].[Salesperson].MEMBERS'; Current = '[Salesperson].[Salesperson]' }
    product = @{ Set = '[Product].[Product].[Product].MEMBERS'; Current = '[Product].[Product]' }
    category = @{ Set = '[Product].[Major Category].[Major Category].MEMBERS'; Current = '[Product].[Major Category]' }
    month = @{ Set = '[Invoice Date].[Calendar].[Month].MEMBERS'; Current = '[Invoice Date].[Calendar]' }
  }
  if (-not $table.ContainsKey($Name)) { throw (New-Object System.ArgumentException 'Unsupported axis.') }
  return $table[$Name]
}

function New-AxisMdx([string]$AxisName, [string]$WhereExpression, [string]$MonthSetExpression, [bool]$NonEmpty) {
  $spec = Get-AxisSpec $AxisName
  $rows = $spec.Set
  # A hierarchy cannot occur on both the row axis and the slicer. Restrict its
  # row set to the selected member and keep all other slicers intact.
  $remaining = New-Object System.Collections.Generic.List[string]
  foreach ($part in ($WhereExpression.Trim('(', ')') -split ',\s*')) {
    if ([string]::IsNullOrWhiteSpace($part)) { continue }
    if ($part.StartsWith($spec.Current + '.&[')) { $rows = '{' + $part + '}' }
    else { [void]$remaining.Add($part) }
  }
  $WhereExpression = if ($remaining.Count -eq 0) { '' } elseif ($remaining.Count -eq 1) { $remaining[0] } else { '(' + ($remaining -join ', ') + ')' }
  if ($NonEmpty) { $rows = 'NONEMPTY(' + $rows + ', [Measures].[Sales Line Count])' }
  $with = @"
WITH
MEMBER [Measures].[RowKey] AS CSTR($($spec.Current).CurrentMember.MEMBER_KEY)
MEMBER [Measures].[RowLabel] AS $($spec.Current).CurrentMember.MEMBER_CAPTION
"@
  return ($with.Trim() + "`nSELECT " + (Get-MeasureList $true) + " ON COLUMNS,`n" + $rows + " ON ROWS`n" + (Get-From $MonthSetExpression $WhereExpression))
}

function New-KpiMdx([string]$WhereExpression, [string]$MonthSetExpression) {
  return 'SELECT ' + (Get-MeasureList $false) + ' ON COLUMNS ' + (Get-From $MonthSetExpression $WhereExpression)
}

function Build-Plan([hashtable]$Filters, [string]$SliceMonth, $Prior, $Ytd, $Rolling3, $Rolling12, $Monthly) {
  $plan = New-Object System.Collections.Generic.List[object]
  [void]$plan.Add([ordered]@{ name = 'kpi'; mdx = (New-KpiMdx (Get-FilterWhere $Filters $SliceMonth) '') })
  $filterWhere = Get-FilterWhere $Filters ''
  $monthlySet = Format-MonthSet $Monthly
  if ($monthlySet) {
    [void]$plan.Add([ordered]@{ name = 'monthly'; mdx = (New-AxisMdx 'month' $filterWhere $monthlySet $true) })
  }
  foreach ($axis in @('company', 'product', 'category', 'customer', 'salesperson', 'plant', 'costCenter')) {
    [void]$plan.Add([ordered]@{ name = $axis; mdx = (New-AxisMdx $axis (Get-FilterWhere $Filters $SliceMonth) '' $true) })
  }
  if ($Prior) {
    $priorWhere = Get-FilterWhere $Filters ([string]$Prior)
    [void]$plan.Add([ordered]@{ name = 'priorKpi'; mdx = (New-KpiMdx $priorWhere '') })
    [void]$plan.Add([ordered]@{ name = 'priorProducts'; mdx = (New-AxisMdx 'product' $priorWhere '' $true) })
  }
  $ytdSet = Format-MonthSet $Ytd
  if ($ytdSet) { [void]$plan.Add([ordered]@{ name = 'ytd'; mdx = (New-KpiMdx $filterWhere $ytdSet) }) }
  $roll3Set = Format-MonthSet $Rolling3
  if ($roll3Set) { [void]$plan.Add([ordered]@{ name = 'rolling3'; mdx = (New-KpiMdx $filterWhere $roll3Set) }) }
  $roll12Set = Format-MonthSet $Rolling12
  if ($roll12Set) { [void]$plan.Add([ordered]@{ name = 'rolling12'; mdx = (New-KpiMdx $filterWhere $roll12Set) }) }
  return $plan
}

function Connect-Cube {
  $cs = "Provider=MSOLAP;Data Source=$AnalysisServer;Initial Catalog=$Database;Integrated Security=SSPI;Connect Timeout=15;"
  $connection = New-Object System.Data.OleDb.OleDbConnection $cs
  $connection.Open()
  return $connection
}

function Invoke-MdxTable($Connection, [string]$Mdx) {
  $command = $Connection.CreateCommand()
  $command.CommandTimeout = 45
  $command.CommandText = $Mdx
  $adapter = New-Object System.Data.OleDb.OleDbDataAdapter $command
  $table = New-Object System.Data.DataTable
  [void]$adapter.Fill($table)
  return ,$table
}

function Convert-Number($Value) {
  if ($null -eq $Value -or $Value -is [System.DBNull]) { return $null }
  if ($Value -is [string]) {
    $text = $Value.Trim()
    if ($text.Length -eq 0) { return $null }
    $parsed = 0.0
    if ([double]::TryParse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
      return $parsed
    }
    return $null
  }
  try { return [double]$Value } catch { return $null }
}

function Convert-Text($Value) {
  if ($null -eq $Value -or $Value -is [System.DBNull]) { return '' }
  return ([string]$Value).Trim()
}

function Find-Column($Table, [string]$Part) {
  for ($i = 0; $i -lt $Table.Columns.Count; $i++) {
    $name = [string]$Table.Columns[$i].ColumnName
    if ($name -eq $Part -or $name.Contains($Part)) { return $i }
  }
  return -1
}

function New-NullMetrics {
  $obj = [ordered]@{}
  foreach ($field in $MeasureFields) { $obj[$field] = $null }
  return $obj
}

function Read-Metrics($Table) {
  if ($Table.Rows.Count -lt 1) { return (New-NullMetrics) }
  if ($Table.Rows.Count -gt 1) { throw (New-Object System.InvalidOperationException 'The cube KPI returned more than one row.') }
  $row = $Table.Rows[0]
  $obj = [ordered]@{}
  foreach ($pair in @(
      @{ field = 'netSalesUSD'; part = 'Net Sales USD' },
      @{ field = 'netCostUSD'; part = 'Net Cost USD' },
      @{ field = 'grossProfitUSD'; part = 'Gross Profit USD' },
      @{ field = 'netQtyKG'; part = 'Net Quantity KG' },
      @{ field = 'salesQtyKG'; part = 'Sales Quantity KG' },
      @{ field = 'returnQtyKG'; part = 'Return Quantity KG' },
      @{ field = 'orderCount'; part = 'Order Count' },
      @{ field = 'salesLineCount'; part = 'Sales Line Count' },
      @{ field = 'fullReturnLineCount'; part = 'Full Return Line Count' },
      @{ field = 'partialReturnLineCount'; part = 'Partial Return Line Count' },
      @{ field = 'allowanceLineCount'; part = 'Allowance Line Count' },
      @{ field = 'negativeMarginLineCount'; part = 'Negative Margin Line Count' }
    )) {
    $index = Find-Column $Table $pair.part
    if ($index -lt 0) { throw (New-Object System.InvalidOperationException ('The cube result did not include ' + $pair.part + '.')) }
    $obj[$pair.field] = Convert-Number $row.Item($index)
  }
  return $obj
}

function Test-HasFact($Metrics) {
  foreach ($field in $MeasureFields) {
    $value = $Metrics[$field]
    if ($null -ne $value -and $value -ne 0) { return $true }
  }
  return $false
}

function Read-Axis($Table) {
  $rows = New-Object System.Collections.Generic.List[object]
  if ($Table.Rows.Count -lt 1) { return $rows }
  $keyIndex = Find-Column $Table 'RowKey'
  $labelIndex = Find-Column $Table 'RowLabel'
  if ($keyIndex -lt 0 -or $labelIndex -lt 0) {
    throw (New-Object System.InvalidOperationException 'The cube result did not include the member key.')
  }
  $indexes = @{}
  foreach ($pair in @(
      @{ field = 'netSalesUSD'; part = 'Net Sales USD' },
      @{ field = 'netCostUSD'; part = 'Net Cost USD' },
      @{ field = 'grossProfitUSD'; part = 'Gross Profit USD' },
      @{ field = 'netQtyKG'; part = 'Net Quantity KG' },
      @{ field = 'salesQtyKG'; part = 'Sales Quantity KG' },
      @{ field = 'returnQtyKG'; part = 'Return Quantity KG' },
      @{ field = 'orderCount'; part = 'Order Count' },
      @{ field = 'salesLineCount'; part = 'Sales Line Count' },
      @{ field = 'fullReturnLineCount'; part = 'Full Return Line Count' },
      @{ field = 'partialReturnLineCount'; part = 'Partial Return Line Count' },
      @{ field = 'allowanceLineCount'; part = 'Allowance Line Count' },
      @{ field = 'negativeMarginLineCount'; part = 'Negative Margin Line Count' }
    )) {
    $index = Find-Column $Table $pair.part
    if ($index -lt 0) { throw (New-Object System.InvalidOperationException ('The cube result did not include ' + $pair.part + '.')) }
    $indexes[$pair.field] = $index
  }
  foreach ($row in $Table.Rows) {
    $key = Convert-Text $row.Item($keyIndex)
    if ([string]::IsNullOrWhiteSpace($key)) { continue }
    $item = [ordered]@{ key = $key; label = (Convert-Text $row.Item($labelIndex)) }
    if ([string]::IsNullOrWhiteSpace([string]$item.label)) { $item.label = $key }
    foreach ($field in $MeasureFields) { $item[$field] = Convert-Number $row.Item($indexes[$field]) }
    if (Test-HasFact $item) { [void]$rows.Add($item) }
  }
  return $rows
}

function Read-Members($Table) {
  $rows = New-Object System.Collections.Generic.List[object]
  if ($Table.Rows.Count -lt 1) { return $rows }
  $keyIndex = Find-Column $Table 'RowKey'
  $labelIndex = Find-Column $Table 'RowLabel'
  if ($keyIndex -lt 0 -or $labelIndex -lt 0) {
    throw (New-Object System.InvalidOperationException 'The cube member result did not include the member key.')
  }
  foreach ($row in $Table.Rows) {
    $key = Convert-Text $row.Item($keyIndex)
    if ([string]::IsNullOrWhiteSpace($key) -or $key -eq 'All') { continue }
    $label = Convert-Text $row.Item($labelIndex)
    if ([string]::IsNullOrWhiteSpace($label)) { $label = $key }
    [void]$rows.Add([ordered]@{ key = $key; label = $label })
  }
  return $rows
}

function Get-Stamp {
  return [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
}

try {
  $allowedModes = @('status', 'members', 'bundle', 'plan', 'verify')
  if ($allowedModes -notcontains $Mode) { throw (New-Object System.ArgumentException 'Mode is not supported.') }
  if ($AnalysisServer -notmatch '^[A-Za-z0-9_.:\\-]{1,80}$') { throw (New-Object System.ArgumentException 'Analysis server is not allowed.') }
  if ($Database -notmatch '^[A-Za-z0-9_]{1,128}$') { throw (New-Object System.ArgumentException 'Database name is not allowed.') }
  if ($Cube -ne 'JDE Sales') { throw (New-Object System.ArgumentException 'Cube name is not allowed.') }
  Assert-Month $Month
  foreach ($key in @($Company, $Product, $Customer, $Salesperson, $Plant, $CostCenter)) { Assert-Key $key }
  if ($PriorMonth) { Assert-Month $PriorMonth }
  $ytdList = Parse-Months $YtdMonths
  $roll3List = Parse-Months $Rolling3Months
  $roll12List = Parse-Months $Rolling12Months
  $monthlyList = Parse-Months $MonthlyMonths
  $filters = @{
    Company = $Company
    Product = $Product
    Customer = $Customer
    Salesperson = $Salesperson
    Plant = $Plant
    CostCenter = $CostCenter
  }
  $slice = $Month
  if ($Month -eq 'All') { $slice = '' }
  $plan = $null
  if ($Mode -eq 'bundle' -or $Mode -eq 'plan') {
    $plan = Build-Plan $filters $slice $PriorMonth $ytdList $roll3List $roll12List $monthlyList
  }
  if ($Mode -eq 'plan') {
    Write-Json ([ordered]@{ status = 'ok'; executed = $false; statements = $plan })
    exit 0
  }

  $connection = Connect-Cube
  try {
    if ($Mode -eq 'status' -or $Mode -eq 'verify') {
      $probe = Invoke-MdxTable $connection 'SELECT { [Measures].[Sales Line Count], [Measures].[Order Count] } ON COLUMNS FROM [JDE Sales]'
      $lineIndex = Find-Column $probe 'Sales Line Count'
      $orderIndex = Find-Column $probe 'Order Count'
      if ($lineIndex -lt 0 -or $orderIndex -lt 0 -or $probe.Rows.Count -lt 1) {
        throw (New-Object System.InvalidOperationException 'The cube probe did not return sales line count and order count.')
      }
      $probeLines = Convert-Number $probe.Rows[0].Item($lineIndex)
      $probeOrders = Convert-Number $probe.Rows[0].Item($orderIndex)
      if ($Mode -eq 'status') {
        Write-Json ([ordered]@{
            status = 'ok'
            server = $AnalysisServer
            database = $Database
            cube = 'JDE Sales'
            salesLineCount = $probeLines
            orderCount = $probeOrders
            queriedAt = (Get-Stamp)
          })
        exit 0
      }
      $companyTable = Invoke-MdxTable $connection (New-AxisMdx 'company' '' '' $false)
      $monthTable = Invoke-MdxTable $connection (New-AxisMdx 'month' '' '' $false)
      $companyRows = Read-Members $companyTable
      $monthRows = Read-Members $monthTable
      $coverage = 0
      foreach ($member in $monthRows) {
        if ($member.key -ge '202401' -and $member.key -le '202609') { $coverage += 1 }
      }
      $ratioMdx = 'SELECT { [Measures].[Net Sales USD], [Measures].[Gross Profit USD], [Measures].[Sales Quantity KG], [Measures].[Return Quantity KG], [Measures].[Net Quantity KG], [Measures].[Gross Margin Percent], [Measures].[Return Rate Percent], [Measures].[Average Selling Price USD per KG] } ON COLUMNS FROM [JDE Sales]'
      $ratioTable = Invoke-MdxTable $connection $ratioMdx
      $ratioRow = $ratioTable.Rows[0]
      function Read-Part($Part) {
        $index = Find-Column $ratioTable $Part
        if ($index -lt 0) { return $null }
        return Convert-Number $ratioRow.Item($index)
      }
      $net = Read-Part 'Net Sales USD'
      $gp = Read-Part 'Gross Profit USD'
      $salesQty = Read-Part 'Sales Quantity KG'
      $returnQty = Read-Part 'Return Quantity KG'
      $netQty = Read-Part 'Net Quantity KG'
      $cubeGm = Read-Part 'Gross Margin Percent'
      $cubeRr = Read-Part 'Return Rate Percent'
      $cubeAsp = Read-Part 'Average Selling Price USD per KG'
      $reGm = $null
      $reRr = $null
      $reAsp = $null
      if ($null -ne $net -and $net -ne 0) { $reGm = $gp / $net }
      if ($null -ne $salesQty -and $salesQty -ne 0) { $reRr = $returnQty / $salesQty }
      if ($null -ne $netQty -and $netQty -ne 0) { $reAsp = $net / $netQty }
      $drift = 0.0
      if ($null -ne $cubeGm -and $null -ne $reGm) { $drift = [Math]::Max($drift, [Math]::Abs($cubeGm - $reGm)) }
      if ($null -ne $cubeRr -and $null -ne $reRr) { $drift = [Math]::Max($drift, [Math]::Abs($cubeRr - $reRr)) }
      if ($null -ne $cubeAsp -and $null -ne $reAsp) { $drift = [Math]::Max($drift, [Math]::Abs($cubeAsp - $reAsp)) }
      $matches = ($probeLines -eq 60000 -and $probeOrders -eq 20111 -and $companyRows.Count -eq 5 -and $drift -lt 0.000001)
      Write-Json ([ordered]@{
          status = 'ok'
          salesLineCount = $probeLines
          orderCount = $probeOrders
          companyCount = $companyRows.Count
          monthMemberCount = $monthRows.Count
          coverageMonthMembers = $coverage
          ratioDrift = $drift
          matchesContract = [bool]$matches
          queriedAt = (Get-Stamp)
        })
      exit 0
    }

    if ($Mode -eq 'members') {
      $members = [ordered]@{}
      foreach ($axis in @('company', 'plant', 'costCenter', 'customer', 'salesperson', 'product')) {
        $table = Invoke-MdxTable $connection (New-AxisMdx $axis '' '' $false)
        $members[$axis] = Read-Members $table
      }
      $monthTable = Invoke-MdxTable $connection (New-AxisMdx 'month' '' '' $false)
      Write-Json ([ordered]@{
          status = 'ok'
          queriedAt = (Get-Stamp)
          months = (Read-Members $monthTable)
          members = $members
        })
      exit 0
    }

    $bundle = [ordered]@{
      status = 'ok'
      queriedAt = (Get-Stamp)
      kpi = $null
      monthly = @()
      companies = @()
      products = @()
      categories = @()
      customers = @()
      salespeople = @()
      plants = @()
      costCenters = @()
      priorKpi = $null
      priorProducts = @()
      ytdKpi = $null
      rolling3Kpi = $null
      rolling12Kpi = $null
    }
    foreach ($statement in $plan) {
      $table = Invoke-MdxTable $connection ([string]$statement.mdx)
      switch ([string]$statement.name) {
        'kpi' { $bundle.kpi = Read-Metrics $table }
        'monthly' { $bundle.monthly = Read-Axis $table }
        'company' { $bundle.companies = Read-Axis $table }
        'product' { $bundle.products = Read-Axis $table }
        'category' { $bundle.categories = Read-Axis $table }
        'customer' { $bundle.customers = Read-Axis $table }
        'salesperson' { $bundle.salespeople = Read-Axis $table }
        'plant' { $bundle.plants = Read-Axis $table }
        'costCenter' { $bundle.costCenters = Read-Axis $table }
        'priorKpi' { $bundle.priorKpi = Read-Metrics $table }
        'priorProducts' { $bundle.priorProducts = Read-Axis $table }
        'ytd' { $bundle.ytdKpi = Read-Metrics $table }
        'rolling3' { $bundle.rolling3Kpi = Read-Metrics $table }
        'rolling12' { $bundle.rolling12Kpi = Read-Metrics $table }
      }
    }
    Write-Json $bundle
    exit 0
  }
  finally {
    if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
  }
}
catch [System.ArgumentException] {
  Write-Json ([ordered]@{ status = 'error'; error = [ordered]@{ code = 'invalid_parameter'; message = (Get-SafeMessage $_.Exception) } })
  exit 4
}
catch {
  $message = Get-SafeMessage $_.Exception
  $code = 'source_unavailable'
  $exitCode = 3
  if ($message -match 'timeout|timed out') { $code = 'source_timeout'; $exitCode = 2 }
  Write-Json ([ordered]@{ status = 'error'; error = [ordered]@{ code = $code; message = $message } })
  exit $exitCode
}
