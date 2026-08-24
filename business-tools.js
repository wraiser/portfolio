export const nonNegativeNumber = (value) => Math.max(0, Number(value) || 0);

export const calculateRoi = (values) => {
  const monthlyCount = nonNegativeNumber(values.monthlyCount);
  const minutesPerItem = nonNegativeNumber(values.minutesPerItem);
  const monthlyReviewHours = nonNegativeNumber(values.monthlyReviewHours);
  const reworkCount = nonNegativeNumber(values.reworkCount);
  const reworkMinutes = nonNegativeNumber(values.reworkMinutes);
  const hourlyRate = nonNegativeNumber(values.hourlyRate);
  const implementationCost = nonNegativeNumber(values.implementationCost);
  const reductionRate = Math.min(100, nonNegativeNumber(values.reductionRate)) / 100;

  const currentHours = (monthlyCount * minutesPerItem / 60)
    + monthlyReviewHours
    + (reworkCount * reworkMinutes / 60);
  const savedHours = currentHours * reductionRate;
  const savedAmount = savedHours * hourlyRate;
  const paybackMonths = savedAmount > 0 ? implementationCost / savedAmount : null;

  return { currentHours, savedHours, savedAmount, paybackMonths };
};

export const sanitiseCampaignValue = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9._-]/g, '')
  .slice(0, 64);
