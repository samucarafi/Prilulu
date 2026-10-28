/**
 * Seed inicial do catálogo Prilulu via API administrativa existente.
 * Uso: BASE_URL=http://localhost:3000 ADMIN_COOKIE='cole aqui o cookie da sessão' node scripts/seed-catalog.mjs
 * Simulação sem gravar: DRY_RUN=1 ... node scripts/seed-catalog.mjs
 * O script cria ilustrações SVG, converte-as para PNG e envia cada imagem ao Cloudinary
 * pela rota administrativa /api/admin/uploads antes de cadastrar o produto.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const ADMIN_COOKIE = process.env.ADMIN_COOKIE;
const DRY_RUN = process.env.DRY_RUN === "1";
const root = process.cwd();
const imageDir = path.join(root, "public", "catalog-seed");

if (!DRY_RUN && !ADMIN_COOKIE) {
  console.error("Defina ADMIN_COOKIE com o cookie da sessão administrativa.");
  process.exit(1);
}

const colors = {
  Azul: "#3687D8",
  Verde: "#389765",
  Branco: "#F8F8F5",
  Rosa: "#EFA6C5",
  "Rosa-claro": "#F7D7E5",
  Amarelo: "#F1D34F",
  Lilás: "#B9A1E3",
  Nude: "#D6B49A",
};
function svgFor({
  color = "Branco",
  size = "Padrão",
  shape = "balloon",
  name,
}) {
  const fill = colors[color] || "#C8B6D9";
  let art = "";
  if (shape === "cylinder") {
    art = `<ellipse cx="160" cy="90" rx="58" ry="18" fill="${fill}" stroke="#8b8190" stroke-width="2"/><path d="M102 90 V310 Q160 340 218 310 V90 Q160 120 102 90Z" fill="${fill}" stroke="#8b8190" stroke-width="2"/><ellipse cx="160" cy="310" rx="58" ry="18" fill="${fill}" stroke="#8b8190" stroke-width="2"/><path d="M125 110 V295" stroke="#ffffff" stroke-opacity=".35" stroke-width="8"/>`;
  } else if (shape === "panel") {
    const round = name.toLowerCase().includes("redondo");
    art = round
      ? `<circle cx="160" cy="190" r="100" fill="${fill}" stroke="#8b8190" stroke-width="3"/><circle cx="130" cy="150" r="35" fill="#ffffff" fill-opacity=".13"/>`
      : `<rect x="70" y="75" width="180" height="230" rx="6" fill="${fill}" stroke="#8b8190" stroke-width="3"/><path d="M95 90 V290" stroke="#fff" stroke-opacity=".18" stroke-width="8"/>`;
  } else {
    const organic = name.toLowerCase().includes("orgânico");
    art = organic
      ? `<g fill="${fill}" stroke="#8b8190" stroke-width="1.5"><circle cx="125" cy="150" r="43"/><circle cx="180" cy="125" r="48"/><circle cx="210" cy="175" r="38"/><circle cx="155" cy="195" r="48"/><circle cx="105" cy="215" r="32"/></g>`
      : `<ellipse cx="160" cy="160" rx="62" ry="76" fill="${fill}" stroke="#8b8190" stroke-width="2"/><path d="M154 234 L160 249 L166 234" fill="${fill}" stroke="#8b8190" stroke-width="2"/><ellipse cx="137" cy="132" rx="18" ry="28" fill="#fff" fill-opacity=".22"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 320 400"><rect width="320" height="400" rx="24" fill="#faf7fb"/>${art}<text x="160" y="355" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#51465a">${name}</text><text x="160" y="378" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#716779">${color} · ${size}</text></svg>`;
}

const items = [];
function add({
  name,
  family,
  color = "",
  size = "",
  theme = "",
  category = "component",
  totalQuantity = 4,
  price = 0,
  customPrice = 0,
  shape = "balloon",
}) {
  const key = [family, name, theme, color, size]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
  items.push({
    type: "item",
    name,
    category,
    family,
    theme,
    color,
    size,
    totalQuantity,
    price,
    customPrice,
    requiresStructureId: "",
    available: true,
    image: `/catalog-seed/${key}.png`,
    __image: svgFor({ name, color, size, shape }),
  });
}

// Painéis: cada combinação tem estoque e imagem independentes.
for (const name of ["Painel redondo", "Painel retangular"]) {
  for (const color of ["Branco", "Rosa", "Azul"]) {
    add({
      name,
      family: "Painéis",
      color,
      size: name.includes("redondo") ? "1,50 m" : "2,00 x 1,00 m",
      theme: "Liso",
      totalQuantity: 2,
      shape: "panel",
      customPrice: 0,
    });
  }
}
// Cilindros: ao filtrar 60 cm, todas as cores desse tamanho permanecem disponíveis.
for (const size of ["30 cm", "60 cm"]) {
  for (const color of ["Azul", "Verde", "Branco"]) {
    add({
      name: "Cilindro",
      family: "Cilindros",
      color,
      size,
      totalQuantity: 3,
      shape: "cylinder",
      customPrice: 0,
    });
  }
}
// Balões ficam na categoria Balões; os nomes distinguem os dois tipos.
for (const name of ["Balão simples", "Balão orgânico"]) {
  for (const color of ["Branco", "Rosa", "Azul", "Lilás"]) {
    add({
      name,
      family: "Balões",
      color,
      size: name === "Balão simples" ? "9 polegadas" : "Mix de tamanhos",
      category: "extra",
      totalQuantity: 100,
      price: name === "Balão simples" ? 1.5 : 2.5,
      shape: "balloon",
    });
  }
}

await fs.mkdir(imageDir, { recursive: true });
for (const item of items) {
  const file = path.join(
    root,
    "public",
    item.image.replace(/^\//, "").replace(/\.png$/, ".svg"),
  );
  await fs.writeFile(file, item.__image, "utf8");
  delete item.__image;
}

if (DRY_RUN) {
  console.log(
    `DRY RUN: ${items.length} variações preparadas; imagens PNG em public/catalog-seed/. Nenhum registro foi enviado ao banco.`,
  );
  console.log(
    JSON.stringify(
      items.map(({ name, family, color, size, category }) => ({
        name,
        family,
        color,
        size,
        category,
      })),
      null,
      2,
    ),
  );
  process.exit(0);
}

const headers = { "Content-Type": "application/json", Cookie: ADMIN_COOKIE };
const existingResponse = await fetch(`${BASE_URL}/api/admin/catalog`, {
  headers,
  cache: "no-store",
});
if (!existingResponse.ok) {
  console.error(
    `Falha ao ler catálogo (${existingResponse.status}). Confira BASE_URL e ADMIN_COOKIE.`,
  );
  console.error(await existingResponse.text());
  process.exit(1);
}
const catalog = await existingResponse.json();
const existingItems = catalog.items || [];
const normalize = (v) =>
  String(v || "")
    .trim()
    .toLocaleLowerCase("pt-BR");
const identity = (item) =>
  [item.family, item.name, item.theme, item.color, item.size]
    .map(normalize)
    .join("|");
const known = new Set(existingItems.map(identity));
let created = 0,
  skipped = 0;
for (const item of items) {
  if (known.has(identity(item))) {
    skipped++;
    continue;
  }

  // A API administrativa exige imagens hospedadas no Cloudinary. Envie o PNG
  // pela mesma rota de upload usada pelo painel (/api/admin/uploads).
  const svgPath = path.join(
    root,
    "public",
    item.image.replace(/^\//, "").replace(/\.png$/, ".svg"),
  );

  const pngBuffer = await sharp(svgPath).png().toBuffer();

  const uploadForm = new FormData();

  uploadForm.set(
    "file",
    new Blob([pngBuffer], { type: "image/png" }),
    path.basename(svgPath, ".svg") + ".png",
  );
  const uploadResponse = await fetch(`${BASE_URL}/api/admin/uploads`, {
    method: "POST",
    headers: { Cookie: ADMIN_COOKIE },
    body: uploadForm,
  });
  const uploaded = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || !uploaded.image) {
    console.error(
      `Erro enviando imagem de ${item.name} / ${item.color} / ${item.size} para o Cloudinary:`,
      uploaded.error || uploadResponse.statusText,
    );
    console.error(
      "O cadastro foi interrompido. Corrija o upload e execute novamente; as combinações já cadastradas serão ignoradas.",
    );
    process.exit(1);
  }
  item.image = uploaded.image;
  if (uploaded.publicId) item.imagePublicId = uploaded.publicId;

  const response = await fetch(`${BASE_URL}/api/admin/catalog`, {
    method: "POST",
    headers,
    body: JSON.stringify(item),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(
      `Erro cadastrando ${item.name} / ${item.color} / ${item.size}:`,
      result.error || response.statusText,
    );
    console.error(
      "O script parou para não continuar com cadastros parciais. Os itens já criados podem ser mantidos; execute novamente depois de corrigir o erro.",
    );
    process.exit(1);
  }
  known.add(identity(item));
  created++;
  console.log(
    `Criado: ${item.family} — ${item.name} — ${item.color || "sem cor"} — ${item.size || "sem tamanho"}`,
  );
}
console.log(
  `Concluído. Criados: ${created}; já existentes ignorados: ${skipped}. Imagens ilustrativas enviadas ao Cloudinary por /api/admin/uploads.`,
);
