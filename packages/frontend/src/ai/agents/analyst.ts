export type EmployeeRiskSnapshot = {
  employeeUuid: string;
  name: string;
  riskScore: number;
  refundRatePct: number;
};

export function buildRiskSummary(employees: EmployeeRiskSnapshot[]) {
  const critical = employees.filter((item) => item.riskScore >= 80);
  const warning = employees.filter((item) => item.riskScore >= 65 && item.riskScore < 80);
  const highRefund = employees.filter((item) => item.refundRatePct >= 5);

  return {
    critical,
    warning,
    highRefund,
  };
}
