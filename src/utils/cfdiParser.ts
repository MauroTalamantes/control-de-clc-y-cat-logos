export interface ParsedCfdi {
  uuid: string;
  version: string;
  fechaFactura: string;
  serie: string;
  folio: string;
  referenciaFactura: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  subTotal: number;
  descuento: number;
  iva: number;
  isr: number;
  total: number;
  concepto: string;
  formaPago: string;
  metodoPago: string;
  moneda: string;
}

const getLocalName = (element: Element) => element.localName || element.nodeName.split(":").pop() || "";

const getAttribute = (element: Element | undefined, attributeName: string) => {
  if (!element) return "";

  const directValue = element.getAttribute(attributeName);
  if (directValue !== null) return directValue.trim();

  const normalizedName = attributeName.toLowerCase();
  const matchedAttribute = Array.from(element.attributes).find(
    attribute => (attribute.localName || attribute.name).toLowerCase() === normalizedName
  );
  return matchedAttribute?.value.trim() || "";
};

const getDirectChildren = (element: Element) => {
  return Array.from(element.childNodes).filter(node => node.nodeType === 1) as Element[];
};

const getDirectChild = (element: Element, localName: string) => {
  return getDirectChildren(element).find(child => getLocalName(child).toLowerCase() === localName.toLowerCase());
};

const getDescendants = (element: Element, localName: string) => {
  const normalizedName = localName.toLowerCase();
  return Array.from(element.getElementsByTagName("*")).filter(
    child => getLocalName(child).toLowerCase() === normalizedName
  );
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const parseMoney = (value: string) => {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? roundMoney(parsedValue) : 0;
};

const sumMoneyAttributes = (elements: Element[], attributeName: string) => {
  return roundMoney(elements.reduce((sum, element) => sum + parseMoney(getAttribute(element, attributeName)), 0));
};

const parseInvoiceDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";

  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : `${match[1]}-${match[2]}-${match[3]}`;
};

export const normalizeUuid = (value: string) => value.trim().toLowerCase();

export const normalizeRfc = (value: string) => value.trim().replace(/\s+/g, "").toUpperCase();

export const extractCfdiData = (xmlDocument: Document): ParsedCfdi => {
  const comprobante = xmlDocument.documentElement;
  if (!comprobante || getLocalName(comprobante).toLowerCase() !== "comprobante") {
    throw new Error("El archivo seleccionado no parece ser un CFDI válido.");
  }

  const version = getAttribute(comprobante, "Version");
  if (!version || (version !== "4.0" && version !== "3.3")) {
    throw new Error("El archivo seleccionado no parece ser un CFDI válido.");
  }

  const timbreFiscal = getDescendants(comprobante, "TimbreFiscalDigital")[0];
  const uuid = normalizeUuid(getAttribute(timbreFiscal, "UUID"));
  if (!uuid) {
    throw new Error("El XML no contiene UUID de timbrado fiscal.");
  }

  const emisor = getDirectChild(comprobante, "Emisor");
  const receptor = getDirectChild(comprobante, "Receptor");
  const impuestosComprobante = getDirectChild(comprobante, "Impuestos");
  const taxScope = impuestosComprobante || comprobante;
  const totalImpuestosTrasladados = getAttribute(impuestosComprobante, "TotalImpuestosTrasladados");
  const trasladosIva = getDescendants(taxScope, "Traslado").filter(
    traslado => getAttribute(traslado, "Impuesto") === "002"
  );
  const retencionesIsr = getDescendants(taxScope, "Retencion").filter(
    retencion => getAttribute(retencion, "Impuesto") === "001"
  );
  const conceptosNode = getDirectChild(comprobante, "Conceptos");
  const conceptos = conceptosNode
    ? getDirectChildren(conceptosNode).filter(element => getLocalName(element).toLowerCase() === "concepto")
    : [];
  const serie = getAttribute(comprobante, "Serie");
  const folio = getAttribute(comprobante, "Folio");

  return {
    uuid,
    version,
    fechaFactura: parseInvoiceDate(getAttribute(comprobante, "Fecha")),
    serie,
    folio,
    referenciaFactura: [serie, folio].filter(Boolean).join(" "),
    rfcEmisor: normalizeRfc(getAttribute(emisor, "Rfc")),
    nombreEmisor: getAttribute(emisor, "Nombre"),
    rfcReceptor: normalizeRfc(getAttribute(receptor, "Rfc")),
    subTotal: parseMoney(getAttribute(comprobante, "SubTotal")),
    descuento: parseMoney(getAttribute(comprobante, "Descuento")),
    iva: totalImpuestosTrasladados
      ? parseMoney(totalImpuestosTrasladados)
      : sumMoneyAttributes(trasladosIva, "Importe"),
    isr: sumMoneyAttributes(retencionesIsr, "Importe"),
    total: parseMoney(getAttribute(comprobante, "Total")),
    concepto: conceptos
      .map(concepto => getAttribute(concepto, "Descripcion"))
      .filter(Boolean)
      .join("; "),
    formaPago: getAttribute(comprobante, "FormaPago"),
    metodoPago: getAttribute(comprobante, "MetodoPago"),
    moneda: getAttribute(comprobante, "Moneda"),
  };
};

export const parseCfdiXml = (xmlText: string): ParsedCfdi => {
  const xmlDocument = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = Array.from(xmlDocument.getElementsByTagName("*")).find(
    element => getLocalName(element).toLowerCase() === "parsererror"
  );

  if (parserError) {
    throw new Error("El archivo seleccionado no parece ser un CFDI válido.");
  }

  return extractCfdiData(xmlDocument);
};

export const validateCfdiAgainstProvider = (cfdiData: ParsedCfdi, providerRfc: string) => {
  const normalizedProviderRfc = normalizeRfc(providerRfc);
  if (!normalizedProviderRfc) {
    throw new Error("Selecciona primero un proveedor para validar el XML.");
  }
  if (!cfdiData.rfcEmisor || cfdiData.rfcEmisor !== normalizedProviderRfc) {
    throw new Error("El RFC emisor del XML no coincide con el RFC del proveedor seleccionado.");
  }
};

export const calculateXmlHash = async (xmlText: string) => {
  const bytes = new TextEncoder().encode(xmlText);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};
