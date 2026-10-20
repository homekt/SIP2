# D11 customer concentration — preview design note

## Business question

In the selected invoice-month slice, which customers account for net sales (USD), how fast does cumulative share build when customers are ranked by net sales, and how concentrated is that population (CR5 and HHI from the API)?

## Composition

Reference-before: one Pareto. The category axis was the first 20 customer keys in response order. Bars were net sales. A line on a second axis showed cumulative share clamped with `Math.min(1, …)`. The denominator was KPI net sales. There was no Top 20 / All control, no dataZoom, a default tooltip, and the click handler used `dataIndex` on that row array. Axis labels were 10px. Nothing stated that a Top 20 line does not have to end at 100%.

Current page (rejected split): a horizontal Top 10 USD bar chart and a second panel with the cumulative line for every customer. Default depth was 10, not 20. There was no range control. The cumulative line was a second large chart.

New page: one Pareto again. Default view is the top 20 customers by net sales, with no synthetic Other bar. Left axis is USD, zero included. Right axis is 0–100% only while the cumulative line is drawn. Native buttons switch Top 20 and All customers. All customers uses dataZoom so the window can move across the full ranked population without changing the denominator. A zoomed or Top 20 line is not forced to 100%, and there is no 80% target. CR5, HHI, the full customer table, CSV export, and customer drilldown stay.

The optional CR5 / rest strip is omitted. CR5 is already an API KPI, and a second composition graphic would compete with the one Pareto.

## Denominators and data limits

Sort a copy of `datasets.customers` by finite `netSalesUSD` descending, then `key` ascending. Null and non-finite values sort last. Ordinary numbers and nulls follow the domain rank order.

Individual share is that customer’s `netSalesUSD` divided by the sum of `netSalesUSD` over all selected customer rows. Cumulative share is the running sum in that rank order divided by the same total. Top 20 and the dataZoom window do not recompute the denominator. The line reaches 100% only when the customers drawn through that point actually exhaust the total.

Compute shares only when `analysis.concentrationStatus === 'available'`, every selected customer `netSalesUSD` is finite and ≥ 0, and the total is > 0. Otherwise share and cumulative share stay null, the line and the percent axis are omitted, and the chart subtitle states why. Signed USD bars still render. Null is not drawn as zero.

CR5 and HHI are `analysis.cr5` and `analysis.hhi`. This page does not recompute them. Top 1 share uses the ranked copy and the same share gate.

Table rates and counts are the row values from the API. They are not summed across customers. CSV still exports every customer row from `datasets.customers` with the existing columns.

Source context is synthetic invoice-month sales, USD and KG, complete months 202401 through 202609. No target, market-share benchmark, or causal claim is added.

Narrow viewports label the category axis with rank (`#1`) at 12px. The Top 20 plot uses a horizontal scroll wrapper (`min-w-[36rem]`) so those labels are not dropped. Full key and name stay in the tooltip. All-customers mode does not widen the canvas; dataZoom keeps both axes on screen and opens a shorter window on a narrow viewport. Legend sits above the plot; the slider sits below it.
