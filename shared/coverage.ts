// Coverage inventory transcribed from the SOW. Availability is not approval to automate.
export const branches = {
  gmm: "Gastos Médicos Mayores",
  surgery: "Cirugía",
  auto: "Autos",
  life: "Vida",
  property: "Daños",
  cargo: "Carga",
  liability: "Responsabilidad civil",
} as const;
export type Branch = keyof typeof branches;
export const insurerIds = [
  "aig",
  "axa",
  "allianz",
  "bbva",
  "bupa",
  "chubb",
  "gnp",
  "hdi",
  "insignia",
  "mapfre",
  "metlife",
  "plan-seguro",
  "qualitas",
  "atlas",
  "banorte",
  "inbursa",
  "monterrey",
  "thona",
] as const;
export type Insurer = (typeof insurerIds)[number];
const all: Branch[] = [
  "gmm",
  "surgery",
  "auto",
  "life",
  "property",
  "cargo",
  "liability",
];
export const insurers: {
  id: Insurer;
  name: string;
  branches: readonly Branch[];
}[] = [
  {
    id: "aig",
    name: "AIG Seguros",
    branches: ["property", "cargo", "liability"],
  },
  { id: "axa", name: "AXA", branches: all },
  { id: "allianz", name: "Allianz", branches: all },
  {
    id: "bbva",
    name: "BBVA Seguros",
    branches: ["gmm", "surgery", "auto", "life", "property"],
  },
  { id: "bupa", name: "Bupa", branches: ["gmm", "surgery"] },
  { id: "chubb", name: "Chubb", branches: all },
  { id: "gnp", name: "GNP Seguros", branches: all },
  {
    id: "hdi",
    name: "HDI Seguros",
    branches: ["auto", "property", "cargo", "liability"],
  },
  { id: "insignia", name: "Insignia Life", branches: ["life"] },
  { id: "mapfre", name: "Mapfre", branches: all },
  { id: "metlife", name: "MetLife", branches: ["gmm", "surgery", "life"] },
  { id: "plan-seguro", name: "Plan Seguro", branches: ["gmm", "surgery"] },
  { id: "qualitas", name: "Quálitas", branches: ["auto", "cargo"] },
  { id: "atlas", name: "Seguros Atlas", branches: all },
  { id: "banorte", name: "Seguros Banorte", branches: all },
  { id: "inbursa", name: "Seguros Inbursa", branches: all },
  {
    id: "monterrey",
    name: "Seguros Monterrey NYL",
    branches: ["gmm", "surgery", "life"],
  },
  { id: "thona", name: "Thona Seguros", branches: ["life"] },
];
export interface Coverage {
  insurer?: Insurer;
  branch?: Branch;
  product?: string;
  requestedProcedure?: string;
  insuredRelationship?: "holder" | "dependent";
}
// Records from the original GNP-only version retain their known coverage.
export function coverageOf(c: Coverage) {
  return {
    insurer: c.insurer ?? "gnp",
    branch: c.branch ?? "gmm",
    product: c.product ?? branches.gmm,
    insuredRelationship: c.insuredRelationship ?? "holder",
  };
}
export function insurerName(c: Coverage) {
  return insurers.find((i) => i.id === coverageOf(c).insurer)!.name;
}
export function hasGnpChecklist(c: Coverage) {
  const coverage = coverageOf(c);
  return coverage.insurer === "gnp" && coverage.branch === "gmm";
}
export const pendingChecklistVersion = "sow-coverage-pending-v1";
