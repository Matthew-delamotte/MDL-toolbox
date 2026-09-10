import { describe, expect, it } from 'vitest';
import { campaignTargetingReason, normalizedCountry } from '../../src/lib/domain';
describe('automatic campaign targeting', () => {
  const campaign = {country:'UK',employeesMin:5,employeesMax:50};
  it.each(['UK','GB','United Kingdom','Royaume-Uni'])('normalizes %s',country=>expect(normalizedCountry(country)).toBe('UK'));
  it('accepts known in-range companies',()=>expect(campaignTargetingReason({country:'Royaume-Uni',employeeEstimate:20},campaign)).toBeNull());
  it('rejects another country',()=>expect(campaignTargetingReason({country:'France',employeeEstimate:20},campaign)).toContain('pays'));
  it.each([null,undefined])('requires a known company size (%s)',employeeEstimate=>expect(campaignTargetingReason({country:'UK',employeeEstimate},campaign)).not.toBeNull());
  it.each([4,51])('rejects out-of-range employee count %s',employeeEstimate=>expect(campaignTargetingReason({country:'UK',employeeEstimate},campaign)).toContain('effectif'));
  it('requires a recognized target country',()=>expect(campaignTargetingReason({country:'Inconnu',employeeEstimate:20},campaign)).not.toBeNull());
});
