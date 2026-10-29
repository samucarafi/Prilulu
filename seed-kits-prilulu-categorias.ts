/**
 * Seed para organizar os kits Prilulu por categorias reutilizáveis.
 *
 * Este script NÃO envia, substitui ou altera fotos.
 * Ele cria/atualiza estruturas, componentes genéricos e os kits, sem preencher
 * campos de imagem. As imagens existentes nos kits são preservadas.
 *
 * Antes de executar, confira os nomes de categoria/família usados pelo catálogo.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const KIT_PRICE_CENTS = 18_000;
const INITIAL_STOCK = 1;

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const structures = [
  { key: "painel", name: "Painel redondo", aliases: ["painel redondo", "painel circular"] },
  { key: "alto", name: "Cilindro alto", aliases: ["cilindro alto", "cilindro grande"] },
  { key: "medio", name: "Cilindro médio", aliases: ["cilindro médio", "cilindro medio"] },
  { key: "baixo", name: "Cilindro baixo", aliases: ["cilindro baixo", "cilindro pequeno"] },
];

type PieceDef = {
  key: string;
  name: string;
  family: string;
  theme?: string;
  color?: string;
  size?: string;
  structureKey?: string;
  priceCents: number;
  optionGroups?: Array<{
    id: string;
    name: string;
    required: boolean;
    options: Array<{
      id: string;
      name: string;
      image: string;
      imagePublicId: string;
      priceDeltaCents: number;
      stockQuantity: number;
    }>;
  }>;
};

const optionGroup = (
  id: string,
  name: string,
  optionNames: string[],
) => [{
  id,
  name,
  required: true,
  options: optionNames.map((optionName) => ({
    id: normalize(optionName).replace(/\s+/g, "-"),
    name: optionName,
    image: "",
    imagePublicId: "",
    priceDeltaCents: 0,
    stockQuantity: INITIAL_STOCK,
  })),
}];

const themeOptions = [
  "Palavrinhas Deus é Amor",
  "Safari",
  "Sonic",
  "Happy Birthday preto e dourado",
  "Ursinhos príncipe e princesa",
  "Chá revelação Girl or Boy",
  "Cerejas",
  "Happy Birthday vermelho e branco",
  "Baby ursinho azul",
];

const pieces: PieceDef[] = [
  // Painéis são organizados na família Painéis; a arte continua específica por tema.
  { key: "painel-palavrinhas", name: "Painel temático Palavrinhas — Deus é Amor", family: "Painéis", theme: "Palavrinhas Deus é Amor", structureKey: "painel", priceCents: 2500 },
  { key: "painel-safari", name: "Painel temático Safari", family: "Painéis", theme: "Safari", structureKey: "painel", priceCents: 2500 },
  { key: "painel-sonic", name: "Painel temático Sonic", family: "Painéis", theme: "Sonic", structureKey: "painel", priceCents: 2500 },
  { key: "painel-preto-dourado", name: "Painel preto com letreiro Happy Birthday dourado", family: "Painéis", theme: "Happy Birthday preto e dourado", structureKey: "painel", priceCents: 2500 },
  { key: "painel-ursinhos", name: "Painel temático Ursinhos Príncipe e Princesa", family: "Painéis", theme: "Ursinhos príncipe e princesa", structureKey: "painel", priceCents: 2500 },
  { key: "painel-revelacao", name: "Painel Chá Revelação — Girl or Boy", family: "Painéis", theme: "Chá revelação Girl or Boy", structureKey: "painel", priceCents: 2500 },
  { key: "painel-cerejas", name: "Painel temático Cerejas", family: "Painéis", theme: "Cerejas", structureKey: "painel", priceCents: 2500 },
  { key: "painel-hb-vermelho", name: "Painel vermelho com letreiro Happy Birthday", family: "Painéis", theme: "Happy Birthday vermelho e branco", structureKey: "painel", priceCents: 2500 },
  { key: "painel-baby-azul", name: "Painel Baby Ursinho Azul", family: "Painéis", theme: "Baby ursinho azul", structureKey: "painel", priceCents: 2500 },

  // Um cadastro genérico de revestimento por tamanho; os temas são opções, não itens duplicados por tema.
  { key: "revestimento-alto", name: "Revestimento para cilindro alto", family: "Revestimentos de cilindros", size: "Alto", structureKey: "alto", priceCents: 1800, optionGroups: optionGroup("tema", "Tema", themeOptions) },
  { key: "revestimento-medio", name: "Revestimento para cilindro médio", family: "Revestimentos de cilindros", size: "Médio", structureKey: "medio", priceCents: 1500, optionGroups: optionGroup("tema", "Tema", themeOptions) },
  { key: "revestimento-baixo", name: "Revestimento para cilindro baixo", family: "Revestimentos de cilindros", size: "Baixo", structureKey: "baixo", priceCents: 1200, optionGroups: optionGroup("tema", "Tema", themeOptions) },

  // Itens reutilizáveis, com família genérica e opção de cor quando aplicável.
  { key: "mesa-principal-branca", name: "Mesa principal branca", family: "Mesas", priceCents: 3000 },
  { key: "mesa-lateral", name: "Mesa lateral decorativa", family: "Mesas", priceCents: 2000 },
  { key: "mesa-retangular-dourada-madeira", name: "Mesa retangular dourada e madeira", family: "Mesas", priceCents: 3000 },
  { key: "mesas-laterais-douradas", name: "Mesas laterais douradas", family: "Mesas", priceCents: 2500 },
  { key: "mesa-central-xadrez", name: "Mesa central xadrez", family: "Mesas", priceCents: 3000 },

  { key: "tapete", name: "Tapete decorativo", family: "Tapetes", priceCents: 1000, optionGroups: optionGroup("cor", "Cor", ["Azul", "Preto", "Decorativo"]) },
  { key: "escada-expositora", name: "Escada expositora", family: "Expositores", priceCents: 2500 },
  { key: "cubos-baby", name: "Cubos BABY", family: "Cubos decorativos", priceCents: 2000, optionGroups: optionGroup("cor", "Cor", ["Dourado", "Chá revelação"]) },
];

const kitDefs = [
  { name: "Kit Palavrinhas — Deus é Amor", slug: "palavrinhas-deus-e-amor", theme: "Palavrinhas Deus é Amor", pieceKeys: ["painel-palavrinhas", "revestimento-alto", "revestimento-medio", "revestimento-baixo", "tapete"] },
  { name: "Kit Safari", slug: "safari", theme: "Safari", pieceKeys: ["painel-safari", "revestimento-alto", "revestimento-medio", "revestimento-baixo", "mesa-lateral", "escada-expositora", "tapete"] },
  { name: "Kit Sonic", slug: "sonic", theme: "Sonic", pieceKeys: ["painel-sonic", "revestimento-alto", "revestimento-medio", "revestimento-baixo", "tapete"] },
  { name: "Kit Happy Birthday — Preto e Dourado", slug: "happy-birthday-preto-dourado", theme: "Happy Birthday preto e dourado", pieceKeys: ["painel-preto-dourado", "mesa-retangular-dourada-madeira", "mesas-laterais-douradas", "tapete"] },
  { name: "Kit Ursinhos Príncipe e Princesa", slug: "ursinhos-principe-princesa", theme: "Ursinhos príncipe e princesa", pieceKeys: ["painel-ursinhos", "mesa-principal-branca", "revestimento-alto", "revestimento-medio", "revestimento-baixo"] },
  { name: "Kit Chá Revelação — Girl or Boy", slug: "cha-revelacao-girl-or-boy", theme: "Chá revelação Girl or Boy", pieceKeys: ["painel-revelacao", "mesa-principal-branca", "revestimento-alto", "revestimento-medio", "cubos-baby", "tapete"] },
  { name: "Kit Cerejas", slug: "cerejas", theme: "Cerejas", pieceKeys: ["painel-cerejas", "revestimento-alto", "revestimento-medio", "revestimento-baixo", "mesa-central-xadrez"] },
  { name: "Kit Happy Birthday — Vermelho e Branco", slug: "happy-birthday-vermelho-branco", theme: "Happy Birthday vermelho e branco", pieceKeys: ["painel-hb-vermelho", "revestimento-alto", "revestimento-medio", "revestimento-baixo"] },
  { name: "Kit Baby Ursinho Azul", slug: "baby-ursinho-azul", theme: "Baby ursinho azul", pieceKeys: ["painel-baby-azul", "mesa-principal-branca", "cubos-baby"] },
];

async function main() {
  const { connectMongoDB } = await import("./lib/mongodb");
  const { default: InventoryItem } = await import("./models/InventoryItem");
  const { default: Kit } = await import("./models/Kit");

  await connectMongoDB();

  const structureByKey = new Map<string, any>();
  for (const def of structures) {
    const aliasSet = new Set(def.aliases.map(normalize));
    const allStructures = await InventoryItem.find({ category: "structure" }).lean();
    let item: any = allStructures.find((candidate: any) =>
      aliasSet.has(normalize(candidate.name)),
    );
    if (!item) {
      item = await InventoryItem.findOne({
        category: "structure",
        name: def.name,
      }).lean();
    }
    if (!item) {
      item = await InventoryItem.create({
        name: def.name,
        category: "structure",
        family: "Estruturas internas",
        theme: "",
        color: "",
        size: def.key === "painel" ? "" : def.key,
        totalQuantity: INITIAL_STOCK,
        priceCents: 0,
        customPriceCents: 0,
        requiresStructureId: null,
        image: "",
        imagePublicId: "",
        optionGroups: [],
        available: true,
      });
    }
    structureByKey.set(def.key, item);
  }

  const pieceByKey = new Map<string, any>();
  for (const piece of pieces) {
    const structure = piece.structureKey ? structureByKey.get(piece.structureKey) : null;
    const filter: Record<string, unknown> = {
      category: "component",
      family: piece.family,
      name: piece.name,
    };
    if (piece.theme) filter.theme = piece.theme;

    const update: Record<string, unknown> = {
      category: "component",
      family: piece.family,
      theme: piece.theme ?? "",
      color: piece.color ?? "",
      size: piece.size ?? "",
      totalQuantity: INITIAL_STOCK,
      priceCents: piece.priceCents,
      customPriceCents: piece.priceCents,
      requiresStructureId: structure?._id ?? null,
      optionGroups: piece.optionGroups ?? [],
      available: true,
    };

    // Não atualizar image/imagePublicId: as fotos existentes permanecem intactas.
    const saved = await InventoryItem.findOneAndUpdate(
      filter,
      { $set: update, $setOnInsert: { image: "", imagePublicId: "" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    pieceByKey.set(piece.key, saved);
    console.log(`✓ Peça organizada: ${piece.name} (${piece.family})`);
  }

  for (const kit of kitDefs) {
    const customizableItemIds = kit.pieceKeys.map((key) => {
      const item = pieceByKey.get(key);
      if (!item) throw new Error(`Peça não encontrada para ${kit.name}: ${key}`);
      return item._id;
    });

    // Só atualiza os campos de organização; não altera imagem/foto do kit.
    await Kit.findOneAndUpdate(
      { slug: kit.slug },
      {
        $set: {
          name: kit.name,
          slug: kit.slug,
          theme: kit.theme,
          priceCents: KIT_PRICE_CENTS,
          customBasePriceCents: KIT_PRICE_CENTS,
          customizable: true,
          allowCustomerEdits: true,
          customizableItemIds,
          active: true,
          featured: false,
        },
        $setOnInsert: {
          image: "",
          imagePublicId: "",
          inventory: structures.map((structure) => ({
            itemId: structureByKey.get(structure.key)._id,
            quantity: 1,
          })),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`✓ Kit organizado: ${kit.name}`);
  }

  console.log("Concluído. Fotos não foram enviadas nem alteradas.");
  console.log("Preço-base configurado: R$ 180,00 por kit.");
  console.log("Revise o catálogo e confirme que a interface exibe optionGroups como seletores.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Falha ao organizar categorias, peças e kits:", error);
  process.exit(1);
});
