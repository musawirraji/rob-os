// Public API of the `companies` feature.
// Other features import from here and nowhere else inside this slice.

export { loadCompanyScreen } from "./application/loadCompanyScreen";
export type { CompanyState } from "./application/loadCompanyScreen";
export { loadCompaniesScreen } from "./application/loadCompaniesScreen";
export type { CompaniesState } from "./application/loadCompaniesScreen";
export { CompanyScreen } from "./ui/screens/CompanyScreen";
export { CompaniesScreen } from "./ui/screens/CompaniesScreen";
