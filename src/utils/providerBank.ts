import { AppCatalogs, Bank, CLCDocument, Provider } from "../types";

export const normalizeProviderRfc = (value: string) => value.trim().replace(/\s+/g, "").toUpperCase();

export const isCatalogRecordActive = (record: { active?: boolean }) => record.active !== false;

export function getActiveProviderByRfc(catalogs: AppCatalogs, rfc: string): Provider | undefined {
  const normalizedRfc = normalizeProviderRfc(rfc);
  return catalogs.proveedores.find(
    provider => isCatalogRecordActive(provider) && normalizeProviderRfc(provider.rfc) === normalizedRfc
  );
}

export function getProviderAccounts(catalogs: AppCatalogs, providerId: string): Bank[] {
  return catalogs.bancos.filter(bank => isCatalogRecordActive(bank) && bank.providerId === providerId);
}

export function getPreferredProviderAccount(catalogs: AppCatalogs, providerId: string): Bank | null {
  const accounts = getProviderAccounts(catalogs, providerId);
  return accounts.find(account => account.isDefault) || (accounts.length === 1 ? accounts[0] : null);
}

export function getDocumentCatalogBank(document: CLCDocument, catalogs: AppCatalogs): Bank | undefined {
  return catalogs.bancos.find(bank => (
    isCatalogRecordActive(bank) &&
    (
      (Boolean(bank.clabe.trim()) && bank.clabe.trim() === document.bancoClabe.trim()) ||
      (
        bank.cuenta.trim() === document.bancoCuenta.trim() &&
        bank.nombre.trim().toUpperCase() === document.bancoNombre.trim().toUpperCase()
      )
    )
  ));
}

export function getProviderBankRelationshipError(document: CLCDocument, catalogs: AppCatalogs): string | null {
  const bank = getDocumentCatalogBank(document, catalogs);
  if (!bank) return null;
  if (!bank.providerId) return "La cuenta bancaria seleccionada no está vinculada a ningún proveedor.";

  const provider = getActiveProviderByRfc(catalogs, document.proveedorRfc);
  if (!provider || provider.id !== bank.providerId) {
    return "La cuenta bancaria seleccionada no pertenece al proveedor seleccionado.";
  }

  return null;
}

export function assertProviderBankRelationship(document: CLCDocument, catalogs: AppCatalogs) {
  const error = getProviderBankRelationshipError(document, catalogs);
  if (error) throw new Error(error);
}

export function inferProviderBankLinks(catalogs: AppCatalogs, documents: CLCDocument[]): AppCatalogs {
  const linkedBanks = catalogs.bancos.map(bank => {
    if (bank.providerId) return bank;

    const matchingDocuments = documents.filter(document => (
      document.bancoCuenta.trim() === bank.cuenta.trim() &&
      document.bancoClabe.trim() === bank.clabe.trim()
    ));
    const inferredProviderIds = matchingDocuments.map(
      document => getActiveProviderByRfc(catalogs, document.proveedorRfc)?.id
    );
    const providerIds = new Set(inferredProviderIds);

    return matchingDocuments.length > 0 && !inferredProviderIds.includes(undefined) && providerIds.size === 1
      ? { ...bank, providerId: Array.from(providerIds)[0] }
      : bank;
  });

  const banksWithDefaults = [...linkedBanks];
  for (const provider of catalogs.proveedores) {
    const providerAccounts = banksWithDefaults.filter(
      bank => bank.providerId === provider.id && isCatalogRecordActive(bank)
    );
    if (providerAccounts.length && !providerAccounts.some(bank => bank.isDefault)) {
      const firstAccountId = providerAccounts[0].id;
      const index = banksWithDefaults.findIndex(bank => bank.id === firstAccountId);
      banksWithDefaults[index] = { ...banksWithDefaults[index], isDefault: true };
    }
  }

  return { ...catalogs, bancos: banksWithDefaults };
}
