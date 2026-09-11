import { describe, expect, it } from 'vitest';
import { campaignTargetingReason, companyNameFrom, countryLabel, normalizedCountry } from '../../src/lib/domain';
describe('automatic campaign targeting', () => {
  const campaign = {country:'UK',employeesMin:5,employeesMax:50};
  it.each(['UK','GB','United Kingdom','Royaume-Uni'])('normalizes %s',country=>expect(normalizedCountry(country)).toBe('UK'));
  it.each(['IE','Ireland','Irlande'])('normalizes %s to IE',country=>expect(normalizedCountry(country)).toBe('IE'));
  it('accepts known in-range companies',()=>expect(campaignTargetingReason({country:'Royaume-Uni',employeeEstimate:20},campaign)).toBeNull());
  it('rejects another country',()=>expect(campaignTargetingReason({country:'France',employeeEstimate:20},campaign)).toContain('pays'));
  it.each([null,undefined])('requires a known company size (%s)',employeeEstimate=>expect(campaignTargetingReason({country:'UK',employeeEstimate},campaign)).not.toBeNull());
  it.each([4,51])('rejects out-of-range employee count %s',employeeEstimate=>expect(campaignTargetingReason({country:'UK',employeeEstimate},campaign)).toContain('effectif'));
  it('requires a recognized target country',()=>expect(campaignTargetingReason({country:'Inconnu',employeeEstimate:20},campaign)).not.toBeNull());
});
describe('company naming', () => {
  // Observed on real searches: the page headline became the company name, then the email subject.
  it('falls back to the domain when the title describes the page', () => {
    expect(companyNameFrom('Entreprise de logistique et stockage de marchandises, préparation de commandes', 'h2k.fr')).toBe('H2K');
    expect(companyNameFrom('Logistique e-commerce : prestataire en Ile de France', 'ebsesperance.fr')).toBe('Ebsesperance');
    expect(companyNameFrom('Un logisticien e-commerce au service des TPE et PME', 'endurancelogistique.fr')).toBe('Endurancelogistique');
    expect(companyNameFrom('Even Distribution, distributeur alimentaire français | Even', 'even.fr')).toBe('Even');
    expect(companyNameFrom('', 'lulli-sur-la-toile.com')).toBe('Lulli Sur La Toile');
    expect(companyNameFrom('Accueil', 'atelier-colis.fr')).toBe('Atelier Colis');
  });
  // Observed on a real prospect: the page title named the sector, never the company.
  it('falls back to the domain when the title names only a category', () => {
    expect(companyNameFrom('Shopify & E-commerce Agency', 'pikka.fr')).toBe('Pikka');
    expect(companyNameFrom('Agence digitale', 'maukau.com')).toBe('Maukau');
    expect(companyNameFrom('Solutions e-commerce France', 'artich.io')).toBe('Artich');
  });
  it('keeps a name that carries a real word of its own', () => {
    expect(companyNameFrom('Dedi Agency', 'dedi-agency.com')).toBe('Dedi Agency');
    expect(companyNameFrom('Digital Unicorn', 'digitalunicorn.fr')).toBe('Digital Unicorn');
    expect(companyNameFrom('Webqam', 'webqam.fr')).toBe('Webqam');
  });
  it('keeps a real company name', () => {
    expect(companyNameFrom('Lulli sur la Toile - Concept Store Mode & Lifestyle', 'lulli-sur-la-toile.com')).toBe('Lulli sur la Toile');
    expect(companyNameFrom('Made By Extreme Ltd - Shopify Agency', 'madebyextreme.com')).toBe('Made By Extreme Ltd');
    expect(companyNameFrom('Harbour Goods', 'harbourgoods.co.uk')).toBe('Harbour Goods');
  });
  it('gives a search engine a country name, not an ISO code', () => {
    expect(countryLabel('FR')).toBe('France');
    expect(countryLabel('UK')).toBe('United Kingdom');
    expect(countryLabel('Irlande')).toBe('Ireland');
  });
});
