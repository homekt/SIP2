# Design Note: D04 Product Mix Corrective Revision

## 1. Business Question
The primary analytical purpose of **D04 Product Mix** is to understand:
1. **Macro Composition**: What is the structural revenue composition across product categories in the active slice?
2. **Micro Drivers**: Which individual products (Top 12) are the primary drivers of revenue, and what is their corresponding gross margin profile (GM %)?
3. **Portfolio Quality**: How do product-level ASP, net volume (KG), return rates, and distinct order counts support sustainable commercial performance?

Rather than presenting two repetitive leaderboard rankings, D04 provides a hierarchical view: category composition first, product driver comparison second, backed by full tabular evidence.

## 2. Visual Composition: Before, Current, and New

| Dimension | Reference-Before (Original Intent) | Current (Rejected Redesign) | New Corrective Revision |
|---|---|---|---|
| **Primary Chart** | Category revenue ring / donut chart showing structural share. | Horizontal bar leaderboard of category net sales. | Restored category donut (52%–76% radius) with total net sales USD anchored in ring center. Adjacent 7-category legend with exact values and share %. |
| **Negative / Invalid Fallback** | N/A (unhandled or broken). | Generic bar chart. | Explicit fallback to signed category horizontal bar chart with zero baseline if any category is negative, null, or total sum ≤ 0. |
| **Secondary Chart** | Product comparison with sales and GM. | Monolithic horizontal bar chart of product net sales only (GM relegated to text). | Compact Top 12 product driver comparison (340px) with dual explicit scales: bottom x-axis for Net Sales (USD), top x-axis for Gross Margin (GM %). No GP stacked on sales. |
| **Layout & Rhythm** | Two separate stacked blocks. | Two giant vertical bar panels. | Balanced two-column grid (`grid-cols-1 lg:grid-cols-2`) on large viewports, stacking responsively on mobile. Compact chart heights (320px–340px). |
| **Interactions** | Product drilldown. | Product bar drilldown. | Preserved product drilldown on product bars/markers to customer analysis; no invented category drilldown (category is not a slicer key). |
| **Detailed Evidence** | Full table & CSV export. | Full table & CSV export. | Preserved all-product tabular data with customer drilldown and CSV export. |

## 3. Denominators and Metric Integrity
- **Category Share %**: `Category Net Sales USD / Total Slice Net Sales USD`. Calculated only when total net sales > 0 and all category revenues are non-negative and finite.
- **Product Gross Margin % (GM %)**: `Product Gross Profit USD / Product Net Sales USD`. Denominated as a percentage (0%–100%) on its own dedicated top x-axis scale. Preserved as null when product net sales is 0 or null.
- **Slice Weighted GM %**: `Total Gross Profit USD / Total Net Sales USD` (from cube KPI; never an arithmetic mean of category or product percentages).
- **Average Selling Price (ASP)**: `Net Sales USD / Net Qty KG`.
- **Return Rate %**: `Return Qty KG / Sales Qty KG`.
- **Distinct Order Count**: Retained as SSAS cube distinct-count measure; never summed across dimension members.

## 4. Truthful Representation and Limitations
- **Donut Integrity**: Ring chart is rendered if and only if all category revenues are finite, non-negative, and sum > 0. Absolute values are never applied to force negative numbers into a donut.
- **Signed Fallback**: If negative returns or adjustments cause any category revenue to be negative, the card gracefully and truthfully switches to a signed comparison bar chart with a zero baseline.
- **Center Graphic Spacing**: Ring center text displays formatted total slice net sales (`fmtUSD`) sized and positioned to guarantee zero overlap with inner arcs or slice boundaries.
- **Color Discipline**: Consistent 7-color palette for categories; product drivers use brand indigo for sales and teal/emerald for margin points to avoid "color-per-product confetti".
- **Drilldown Boundaries**: Drilldown is preserved strictly on product keys (`product: row.key`). Categories are dimensional aggregates without slicer keys, so category clicking is not given fake navigation.
