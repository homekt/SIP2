$ErrorActionPreference='Stop'
$conn=New-Object System.Data.OleDb.OleDbConnection 'Provider=MSOLAP;Data Source=localhost:25000;Initial Catalog=JDE_SALES_CUBE_20261020;Integrated Security=SSPI;Connect Timeout=15;'
try {
  $conn.Open()
  $cmd=$conn.CreateCommand()
  $cmd.CommandTimeout=45
  $cmd.CommandText='SELECT {[Measures].[Net Sales USD],[Measures].[Gross Profit USD],[Measures].[Net Quantity KG],[Measures].[Order Count]} ON COLUMNS FROM [JDE Sales] WHERE ([Invoice Date].[Calendar].[Month].&[202609])'
  $table=New-Object System.Data.DataTable
  $adapter=New-Object System.Data.OleDb.OleDbDataAdapter $cmd
  [void]$adapter.Fill($table)
  $result=[ordered]@{}
  foreach($column in $table.Columns){$result[$column.ColumnName]=$table.Rows[0][$column.ColumnName]}
  $result|ConvertTo-Json -Compress
} finally {$conn.Dispose()}
