/**
 * Cria SOMENTE estruturas internas e kits iniciais via API administrativa.
 *
 * Uso (PowerShell):
 *   $env:BASE_URL="http://localhost:3000"
 *   $env:ADMIN_COOKIE="COLE_AQUI_O_COOKIE_DA_SESSAO"
 *   node scripts/seed-structures-kits.mjs
 *
 * Simulação:
 *   $env:DRY_RUN="1"
 *   node scripts/seed-structures-kits.mjs
 *
 * Não recria os itens/painéis/cilindros/balões do seed-catalog.mjs.
 * Estruturas e kits existentes são ignorados.
 */
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_COOKIE = process.env.ADMIN_COOKIE;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!ADMIN_COOKIE) {
  console.error("Defina ADMIN_COOKIE com o cookie da sessão administrativa (também é necessário no DRY_RUN para consultar o catálogo).");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  ...(ADMIN_COOKIE ? { Cookie: ADMIN_COOKIE } : {}),
};

async function requestCatalog() {
  const response = await fetch(`${BASE_URL}/api/admin/catalog`, {
    headers,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Falha ao ler catálogo (${response.status}): ${data.error || response.statusText}`,
    );
  }
  return data;
}

async function create(body, label) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Criaria ${label}: ${JSON.stringify(body)}`);
    return { id: `dry-${body.name}` };
  }

  const response = await fetch(`${BASE_URL}/api/admin/catalog`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Erro criando ${label} (${response.status}): ${result.error || response.statusText}`,
    );
  }
  console.log(`Criado: ${label} (${result.id})`);
  return result;
}

const norm = (value) =>
  String(value ?? "").trim().toLocaleLowerCase("pt-BR");

const itemIdentity = (item) =>
  [item.category, item.family, item.name, item.theme, item.color, item.size]
    .map(norm)
    .join("|");

const structureDefinitions = [
  {
    key: "cylinder",
    name: "Estrutura para cilindros",
    category: "structure",
    family: "Estruturas internas",
    theme: "",
    color: "",
    size: "Suporte para cilindros",
    totalQuantity: Number(process.env.STOCK_CYLINDER_STRUCTURE || 3),
    price: 0,
    customPrice: 0,
    requiresStructureId: "",
    available: true,
    image: "",
  },
  {
    key: "roundPanel",
    name: "Estrutura para painel redondo",
    category: "structure",
    family: "Estruturas internas",
    theme: "",
    color: "",
    size: "Painel redondo 1,50 m",
    totalQuantity: Number(process.env.STOCK_ROUND_PANEL_STRUCTURE || 2),
    price: 0,
    customPrice: 0,
    requiresStructureId: "",
    available: true,
    image: "",
  },
  {
    key: "rectPanel",
    name: "Estrutura para painel retangular",
    category: "structure",
    family: "Estruturas internas",
    theme: "",
    color: "",
    size: "Painel retangular 2,00 x 1,00 m",
    totalQuantity: Number(process.env.STOCK_RECT_PANEL_STRUCTURE || 2),
    price: 0,
    customPrice: 0,
    requiresStructureId: "",
    available: true,
    image: "",
  },
];

const kitDefinitions = [
  {
    name: "Kit Chá Revelação",
    slug: "kit-cha-revelacao",
    theme: "Chá Revelação",
    price: Number(process.env.PRICE_CHA_REVELACAO || 0),
  },
  {
    name: "Kit Homem-Aranha",
    slug: "kit-homem-aranha",
    theme: "Homem-Aranha",
    price: Number(process.env.PRICE_HOMEM_ARANHA || 0),
  },
  {
    name: "Kit Festa Menina",
    slug: "kit-festa-menina",
    theme: "Festa Menina",
    price: Number(process.env.PRICE_FESTA_MENINA || 0),
  },
];

try {
  const catalog = await requestCatalog();
  const existingItems = catalog.items || [];
  const existingKits = catalog.kits || [];

  const structureIds = {};
  for (const definition of structureDefinitions) {
    const identity = itemIdentity(definition);
    let found = existingItems.find((item) => itemIdentity(item) === identity);

    // Fallback para estruturas já criadas com o mesmo nome/família,
    // evitando duplicar caso o tamanho tenha sido cadastrado de outra forma.
    if (!found) {
      found = existingItems.find(
        (item) =>
          item.category === "structure" &&
          norm(item.name) === norm(definition.name) &&
          norm(item.family) === norm(definition.family),
      );
    }

    if (found) {
      structureIds[definition.key] = String(found._id);
      console.log(`Estrutura já existe; ignorada: ${definition.name} (${found._id})`);
      continue;
    }

    const result = await create(
      {
        type: "item",
        ...definition,
      },
      `estrutura "${definition.name}"`,
    );
    structureIds[definition.key] = result.id;
    if (!DRY_RUN) {
      // Atualiza a lista local para a detecção dos próximos registros.
      existingItems.push({ ...definition, _id: result.id });
    }
  }

  // Apenas painéis redondos e cilindros são oferecidos nestes kits iniciais,
  // pois cada kit terá exatamente o suporte correspondente a essas peças.
  // Painéis retangulares ficam cadastrados, mas não selecionáveis nesses kits
  // até que a composição/seleção de estruturas seja configurada para eles.
  const selectableComponents = existingItems.filter((item) => {
    if (item.category !== "component" || item.available === false) return false;
    const family = norm(item.family);
    const name = norm(item.name);
    return (
      (family === "painéis" && name.includes("redondo")) ||
      family === "cilindros"
    );
  });
  const selectableIds = [...new Set(selectableComponents.map((item) => String(item._id)))];

  if (!selectableIds.length && !DRY_RUN) {
    throw new Error(
      "Não encontrei painéis redondos e cilindros ativos no catálogo. Confira os nomes/famílias retornados pela API.",
    );
  }

  for (const definition of kitDefinitions) {
    const found = existingKits.find(
      (kit) => norm(kit.slug) === norm(definition.slug),
    );
    if (found) {
      console.log(`Kit já existe; ignorado: ${definition.name} (${found._id})`);
      continue;
    }

    // Para kits personalizáveis, a API exige que inventory contenha somente
    // estruturas. As peças selecionáveis ficam em customizableItemIds.
    // Assim, o suporte não é adicionado também como uma peça decorativa.
    const inventory = [
      { itemId: structureIds.cylinder, quantity: 1 },
      { itemId: structureIds.roundPanel, quantity: 1 },
    ];

    await create(
      {
        type: "kit",
        name: definition.name,
        slug: definition.slug,
        theme: definition.theme,
        price: definition.price,
        customBasePrice: definition.price,
        customizable: true,
        allowCustomerEdits: true,
        inventory,
        customizableItemIds: selectableIds,
        featured: false,
        image: "",
      },
      `kit "${definition.name}"`,
    );
  }

  console.log(
    DRY_RUN
      ? "Simulação concluída. Nenhum registro foi gravado."
      : "Concluído. Somente estruturas e kits foram criados; os itens existentes não foram recadastrados.",
  );
  console.log(
    "Atenção: as quantidades das estruturas e os preços dos kits devem ser conferidos com o estoque e a política comercial reais.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
