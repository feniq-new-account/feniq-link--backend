import { describe, expect, it } from 'vitest';
import ar from '../locales/ar/translation.json';
import en from '../locales/en/translation.json';

describe('warehouse rep commission policy copy', () => {
  it('distinguishes legacy split from collection_v2 earned-on-collection policy', () => {
    expect(ar.reps.commissionHint).toContain('قبل تفعيل');
    expect(ar.reps.commissionHint).toContain('50٪');
    expect(ar.reps.commissionHint).toContain('التحصيل الفعلي');
    expect(ar.reps.commissionSplit).toContain('المحرك القديم فقط');
    expect(ar.reps.commissionCountsDelivered).toContain('عند التسليم');
    expect(ar.reps.shareToRepHint).toContain('القديم فقط');
  });

  it('retains consistent English copy and avoids calling legacy a current cash policy', () => {
    expect(en.reps.commissionHint).toContain('legacy');
    expect(en.reps.commissionHint).toContain('verified collected cash');
    expect(en.reps.commissionHint).toContain('50%');
    expect(en.reps.commissionSplit).toContain('Legacy-engine');
    expect(en.reps.shareToRepHint).toContain('old commission split');
  });
});
