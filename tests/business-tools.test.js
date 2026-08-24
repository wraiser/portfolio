import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoi, nonNegativeNumber, sanitiseCampaignValue } from '../business-tools.js';

test('ROIの月間時間・削減額・回収月数を計算する', () => {
  const result = calculateRoi({
    monthlyCount: 100,
    minutesPerItem: 5,
    monthlyReviewHours: 5,
    reworkCount: 5,
    reworkMinutes: 20,
    hourlyRate: 2000,
    reductionRate: 30,
    implementationCost: 40000,
  });
  assert.equal(result.currentHours, 15);
  assert.equal(result.savedHours, 4.5);
  assert.equal(result.savedAmount, 9000);
  assert.equal(result.paybackMonths, 40000 / 9000);
});

test('削減額が0円なら回収月数を表示しない', () => {
  const result = calculateRoi({ monthlyCount: 0, reductionRate: 30, hourlyRate: 2000, implementationCost: 40000 });
  assert.equal(result.savedAmount, 0);
  assert.equal(result.paybackMonths, null);
});

test('負数を0にし、削減率は100%を上限にする', () => {
  assert.equal(nonNegativeNumber(-10), 0);
  const result = calculateRoi({ monthlyReviewHours: 10, reductionRate: 150, hourlyRate: 1000, implementationCost: -1 });
  assert.equal(result.savedHours, 10);
  assert.equal(result.savedAmount, 10000);
  assert.equal(result.paybackMonths, 0);
});

test('キャンペーン値から文字・記号・長すぎる値を除外する', () => {
  assert.equal(sanitiseCampaignValue('partner_会社<script>-01'), 'partner_script-01');
  assert.equal(sanitiseCampaignValue('a'.repeat(80)).length, 64);
});
