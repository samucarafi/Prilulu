import mongoose from "mongoose";
import { createHash } from "node:crypto";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Configure MONGODB_URI no .env.local antes de carregar os exemplos.");
}

const seedVersion = "prilulu-exemplos-v1";
const demoImage = "/images/hero-pega-monte.png";
const objectId = (key) => new mongoose.Types.ObjectId(createHash("sha1").update(`${seedVersion}:${key}`).digest().subarray(0, 12));

const ids = Object.fromEntries([
  "structure:painel-redondo", "structure:cilindro-alto", "structure:cilindro-medio", "structure:mesa-provençal",
  "component:capa-homem-aranha", "component:capa-patrulha-canina", "component:capa-cilindro-vermelha", "component:capa-cilindro-azul",
  "component:capa-cilindro-branca", "component:tapete-azul", "component:mesa-provençal-branca",
  "extra:balões", "kit:homem-aranha", "kit:piscina-de-bolinhas", "kit:monte-sua-festa",
].map((key) => [key, objectId(key)]));

const item = (key, data) => ({
  _id: ids[key],
  name: data.name,
  category: data.category,
  family: data.family ?? "",
  theme: data.theme ?? "",
  color: data.color ?? "",
  size: data.size ?? "",
  totalQuantity: data.totalQuantity,
  priceCents: data.priceCents ?? 0,
  customPriceCents: data.customPriceCents ?? 0,
  requiresStructureId: data.requiresStructureId ? ids[data.requiresStructureId] : null,
  image: demoImage,
  imagePublicId: "",
  optionGroups: data.optionGroups ?? [],
    available: data.available ?? true,
  lowStockThreshold: data.lowStockThreshold ?? 1,
  demoSeed: seedVersion,
});

const items = [
  item("structure:painel-redondo", { name: "Painel redondo (estrutura) · EXEMPLO", category: "structure", family: "Estruturas de painel", size: "1,50 m", totalQuantity: 2 }),
  item("structure:cilindro-alto", { name: "Cilindro alto (estrutura) · EXEMPLO", category: "structure", family: "Estruturas de cilindro", size: "80 cm", totalQuantity: 4 }),
  item("structure:cilindro-medio", { name: "Cilindro médio (estrutura) · EXEMPLO", category: "structure", family: "Estruturas de cilindro", size: "60 cm", totalQuantity: 4 }),
  item("structure:mesa-provençal", { name: "Mesa provençal (estrutura) · EXEMPLO", category: "structure", family: "Mesas", color: "Branca", totalQuantity: 2 }),
  item("component:capa-homem-aranha", { name: "Capa de painel · EXEMPLO", category: "component", family: "Capas de painel", theme: "Homem-Aranha", color: "Vermelho e azul", size: "1,50 m", totalQuantity: 2, requiresStructureId: "structure:painel-redondo", customPriceCents: 1500 }),
  item("component:capa-patrulha-canina", { name: "Capa de painel · EXEMPLO", category: "component", family: "Capas de painel", theme: "Patrulha Canina", color: "Colorida", size: "1,50 m", totalQuantity: 1, requiresStructureId: "structure:painel-redondo", customPriceCents: 1800 }),
  item("component:capa-cilindro-vermelha", { name: "Capa de cilindro · EXEMPLO", category: "component", family: "Capas de cilindro", theme: "Lisa", color: "Vermelha", size: "80 cm", totalQuantity: 2, requiresStructureId: "structure:cilindro-alto", customPriceCents: 0 }),
  item("component:capa-cilindro-azul", { name: "Capa de cilindro · EXEMPLO", category: "component", family: "Capas de cilindro", theme: "Lisa", color: "Azul", size: "80 cm", totalQuantity: 2, requiresStructureId: "structure:cilindro-alto", customPriceCents: 0 }),
  item("component:capa-cilindro-branca", { name: "Capa de cilindro · EXEMPLO", category: "component", family: "Capas de cilindro", theme: "Lisa", color: "Branca", size: "60 cm", totalQuantity: 3, requiresStructureId: "structure:cilindro-medio", customPriceCents: 0 }),
  item("component:tapete-azul", { name: "Tapete redondo · EXEMPLO", category: "component", family: "Tapetes", color: "Azul", size: "2 m", totalQuantity: 1, customPriceCents: 1200 }),
  item("component:mesa-provençal-branca", { name: "Mesa provençal branca · EXEMPLO", category: "component", family: "Mesas decorativas", color: "Branca", totalQuantity: 2, requiresStructureId: "structure:mesa-provençal", customPriceCents: 0 }),
  item("extra:balões", {
    name: "Balões decorativos · EXEMPLO", category: "extra", totalQuantity: 20, priceCents: 3500,
    optionGroups: [
      { id: "tipo", name: "Tipo de balão", required: true, options: [{ id: "simples", name: "Simples", priceDeltaCents: 0, stockQuantity: 15 }, { id: "organico", name: "Orgânico", priceDeltaCents: 2000, stockQuantity: 5 }] },
      { id: "cor", name: "Cor", required: true, options: [{ id: "vermelho-azul", name: "Vermelho e azul", priceDeltaCents: 0, stockQuantity: 6 }, { id: "rosa-dourado", name: "Rosa e dourado", priceDeltaCents: 0, stockQuantity: 6 }, { id: "colorido", name: "Colorido", priceDeltaCents: 0, stockQuantity: 8 }] },
      { id: "tamanho", name: "Tamanho", required: true, options: [{ id: "medio", name: "Médio", priceDeltaCents: 0, stockQuantity: 12 }, { id: "grande", name: "Grande", priceDeltaCents: 1000, stockQuantity: 8 }] },
    ],
  }),
];

const kit = (key, data) => ({
  _id: ids[key], slug: data.slug ?? key.slice(4), name: data.name, theme: data.theme, description: data.description,
  priceCents: data.priceCents, customBasePriceCents: data.customBasePriceCents ?? data.priceCents,
  image: demoImage, imagePublicId: "", active: true, featured: data.featured ?? false,
  customizable: data.customizable ?? false,
  customizableItemIds: (data.customizableItemKeys ?? []).map((itemKey) => ids[itemKey]),
  inventory: data.inventory.map(([itemKey, quantity]) => ({ itemId: ids[itemKey], quantity })),
  demoSeed: seedVersion,
});

const kits = [
  kit("kit:homem-aranha", {
    name: "Kit Homem-Aranha · EXEMPLO", theme: "Herói vermelho e azul", description: "Kit demonstrativo fixo. Troque as fotos e ajuste quantidades e preço antes de publicar para clientes.", priceCents: 28000, featured: true,
    inventory: [["structure:painel-redondo", 1], ["component:capa-homem-aranha", 1], ["structure:cilindro-alto", 2], ["component:capa-cilindro-vermelha", 1], ["component:capa-cilindro-azul", 1], ["component:tapete-azul", 1], ["structure:mesa-provençal", 1], ["component:mesa-provençal-branca", 1]],
  }),
  kit("kit:piscina-de-bolinhas", {
    slug: "patrulha-canina", name: "Kit Patrulha Canina · EXEMPLO", theme: "Aventura colorida", description: "Segundo exemplo fixo para ilustrar como kits diferentes compartilham estruturas e peças.", priceCents: 32000,
    inventory: [["structure:painel-redondo", 1], ["component:capa-patrulha-canina", 1], ["structure:cilindro-alto", 2], ["component:capa-cilindro-vermelha", 1], ["component:capa-cilindro-azul", 1], ["structure:mesa-provençal", 1], ["component:mesa-provençal-branca", 1]],
  }),
  kit("kit:monte-sua-festa", {
    name: "Monte sua festa · EXEMPLO", theme: "Personalize as peças", description: "Exemplo montável. A base reserva estruturas ocultas; o cliente escolhe peças decorativas compatíveis.", priceCents: 25000, customBasePriceCents: 25000, customizable: true,
    inventory: [["structure:painel-redondo", 1], ["structure:cilindro-alto", 2], ["structure:cilindro-medio", 1], ["structure:mesa-provençal", 1]],
    customizableItemKeys: ["component:capa-homem-aranha", "component:capa-patrulha-canina", "component:capa-cilindro-vermelha", "component:capa-cilindro-azul", "component:capa-cilindro-branca", "component:tapete-azul", "component:mesa-provençal-branca"],
  }),
];

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Não foi possível abrir o banco configurado.");
  const counts = {};
  for (const [collectionName, documents] of [["inventoryitems", items], ["kits", kits]]) {
    const collection = db.collection(collectionName);
    let created = 0;
    let updated = 0;
    for (const document of documents) {
      const result = await collection.updateOne(
        { _id: document._id },
        { $set: document, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      if (result.upsertedCount) created++;
      else if (result.modifiedCount) updated++;
    }
    counts[collectionName] = { created, updated, unchanged: documents.length - created - updated };
  }
  console.log(`Exemplos carregados com segurança (marcados como ${seedVersion}).`);
  console.log(JSON.stringify(counts, null, 2));
  console.log("Nenhum registro fora deste conjunto foi removido.");
} finally {
  await mongoose.disconnect();
}
