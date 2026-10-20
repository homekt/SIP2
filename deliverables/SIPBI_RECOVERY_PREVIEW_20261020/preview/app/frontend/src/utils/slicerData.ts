import { Filters, Member, Metadata } from '../types/sales';

export function getMemberLabel(
  members: Member[] | undefined,
  key: string | undefined,
  allLabel: string
): string {
  if (!key || key === 'All') return allLabel;
  const found = members?.find((m) => m.key === key);
  if (!found) return key;
  return found.key === found.label ? found.key : `${found.key} (${found.label})`;
}

export function getFilterSummaryLabels(
  filters: Filters,
  metadata: Metadata | null,
  isZh: boolean
) {
  const companyLabel = getMemberLabel(
    metadata?.members?.company,
    filters.company,
    isZh ? '全部公司 (All)' : 'All Companies'
  );
  const productLabel = getMemberLabel(
    metadata?.members?.product,
    filters.product,
    isZh ? '全部產品 (All)' : 'All Products'
  );
  const customerLabel = getMemberLabel(
    metadata?.members?.customer,
    filters.customer,
    isZh ? '全部客戶 (All)' : 'All Customers'
  );
  const salespersonLabel = getMemberLabel(
    metadata?.members?.salesperson,
    filters.salesperson,
    isZh ? '全部業務員 (All)' : 'All Salespeople'
  );
  const plantLabel = getMemberLabel(
    metadata?.members?.plant,
    filters.plant,
    isZh ? '全部廠區 (All)' : 'All Plants'
  );
  const costCenterLabel = getMemberLabel(
    metadata?.members?.costCenter,
    filters.costCenter,
    isZh ? '全部成本中心 (All)' : 'All Cost Centers'
  );
  const monthLabel =
    !filters.month || filters.month === 'All'
      ? isZh
        ? '全部月份 (All)'
        : 'All Months'
      : filters.month.length === 6
      ? `${filters.month.slice(0, 4)}-${filters.month.slice(4, 6)}`
      : filters.month;

  return {
    monthLabel,
    companyLabel,
    productLabel,
    customerLabel,
    salespersonLabel,
    plantLabel,
    costCenterLabel,
  };
}
