/**
 * Limpeza e setorizaçao do inventário Prilulu.
 *
 * Padrão seguro: executa em modo de SIMULAÇÃO (dry-run), sem gravar alterações.
 * Para aplicar de verdade: npx tsx seed-kits-prilulu-limpeza.ts --apply
 *
 * O script:
 * - reclassifica mesas, tapetes, cubos e expositores para suas famílias;
 * - consolida tapetes duplicados em um cadastro genérico e transforma os registros
 *   anteriores em opções de cor/estilo, preservando os dados de imagem nas opções;
 * - consolida revestimentos de cilindro por tamanho, com opções de tema;
 * - atualiza referências em Kit.customizableItemIds antes de excluir os duplicados;
 * - não apaga painéis temáticos, estruturas físicas ou itens que não reconhece.
 *
 * Faça backup do MongoDB antes de usar --apply. Como o schema do catálogo pode variar,
 * revise primeiro a saída em modo de simulação.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ZERO = 0;
const DEFAULT_STOCK = 1;

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isObjectId = (value: unknown) => value != null && String(value).length > 0;

function logAction(message: string) {
  console.log(`${APPLY ? "[APLICAR]" : "[SIMULAÇÃO]"} ${message}`);
}

async function main() {
  const { connectMongoDB } = await import("./lib/mongodb");
  const { default: InventoryItem } = await import("./models/InventoryItem");
  const { default: Kit } = await import("./models/Kit");

  await connectMongoDB();

  const inventory = (await InventoryItem.find({}).lean()) as any[];
  const kits = (await Kit.find({}).lean()) as any[];

  console.log(`Modo: ${APPLY ? "APLICAR ALTERAÇÕES" : "SIMULAÇÃO (nenhuma alteração será salva)"}`);
  console.log(`Itens no inventário: ${inventory.length}; kits: ${kits.length}`);

  const changedIds = new Set<string>();
  const deletedIds = new Set<string>();

  async function saveItem(id: any, update: Record<string, unknown>) {
    logAction(`Atualizar item ${String(id)}: ${JSON.stringify(update)}`);
    if (APPLY) await InventoryItem.updateOne({ _id: id }, { $set: update });
    changedIds.add(String(id));
  }

  async function replaceReferencesAndDelete(duplicate: any, canonical: any) {
    const duplicateId = String(duplicate._id);
    const canonicalId = String(canonical._id);
    if (duplicateId === canonicalId) return;

    for (const kit of kits) {
      const ids = Array.isArray(kit.customizableItemIds) ? kit.customizableItemIds : [];
      if (!ids.some((id: any) => String(id) === duplicateId)) continue;
      const nextIds = [...new Map(
        ids.map((id: any) => {
          const replacement = String(id) === duplicateId ? canonical._id : id;
          return [String(replacement), replacement];
        }),
      ).values()];
      logAction(`Kit "${kit.name}" (${kit.slug}): substituir referência ${duplicateId} por ${canonicalId}`);
      if (APPLY) {
        await Kit.updateOne({ _id: kit._id }, { $set: { customizableItemIds: nextIds } });
      }
    }

    logAction(`Excluir duplicado "${duplicate.name}" (${duplicateId}) após atualizar referências`);
    if (APPLY) await InventoryItem.deleteOne({ _id: duplicate._id });
    deletedIds.add(duplicateId);
  }

  // 1) Reclassificar itens físicos visíveis. Não os excluir.
  for (const item of inventory) {
    const name = normalize(item.name);
    const family = normalize(item.family);
    let targetFamily: string | null = null;

    if (/\bmesa\b|\bmesas\b|\bmesinha\b/.test(name)) {
      targetFamily = "Mesas";
    } else if (/\btapete\b/.test(name)) {
      targetFamily = "Tapetes";
    } else if (/\bcubo\b|\bcubos\b/.test(name)) {
      targetFamily = "Cubos decorativos";
    } else if (/\bescada\b|\bexpositora\b/.test(name)) {
      targetFamily = "Expositores";
    }

    if (
      targetFamily &&
      (item.category !== "component" || item.family !== targetFamily || item.requiresStructureId)
    ) {
      await saveItem(item._id, {
        category: "component",
        family: targetFamily,
        requiresStructureId: null,
      });
      item.category = "component";
      item.family = targetFamily;
      item.requiresStructureId = null;
    } else if (
      targetFamily &&
      (family === "pecas decorativas" || family === "pecas tematicas")
    ) {
      await saveItem(item._id, { family: targetFamily });
      item.family = targetFamily;
    }
  }

  // 2) Consolidar tapetes. Os metadados de imagens dos registros antigos ficam
  // armazenados nas opções para não perder a associação às fotos já existentes.
  const rugItems = inventory.filter((item) => /\btapete\b/.test(normalize(item.name)));
  if (rugItems.length > 1) {
    let canonical =
      rugItems.find((item) => normalize(item.name) === "tapete decorativo") ??
      rugItems.find((item) => normalize(item.name) === "tapete") ??
      rugItems[0];

    const rugOptions = rugItems.map((item) => {
      const normalizedName = normalize(item.name);
      const color =
        /\bazul\b/.test(normalizedName) ? "Azul" :
        /\bpreto\b/.test(normalizedName) ? "Preto" :
        /\bvermelho\b/.test(normalizedName) ? "Vermelho" :
        /\bbranco\b/.test(normalizedName) ? "Branco" :
        /\brosa\b|\brosa\b/.test(normalizedName) ? "Rosa" :
        item.name.replace(/^tapete\s*/i, "").trim() || "Decorativo";

      return {
        id: normalize(color).replace(/\s+/g, "-") || `tapete-${String(item._id)}`,
        name: color,
        image: item.image ?? "",
        imagePublicId: item.imagePublicId ?? "",
        priceDeltaCents: ZERO,
        stockQuantity: Number(item.totalQuantity ?? DEFAULT_STOCK),
      };
    });
    const uniqueRugOptions = [...new Map(rugOptions.map((o) => [normalize(o.name), o])).values()];

    await saveItem(canonical._id, {
      name: "Tapete decorativo",
      category: "component",
      family: "Tapetes",
      theme: "",
      color: "",
      size: "",
      requiresStructureId: null,
      optionGroups: [{
        id: "cor",
        name: "Cor / modelo",
        required: true,
        options: uniqueRugOptions,
      }],
    });

    for (const item of rugItems) {
      if (String(item._id) !== String(canonical._id)) {
        await replaceReferencesAndDelete(item, canonical);
      }
    }
  }

  // 3) Consolidar revestimentos de cilindros por tamanho. Cada revestimento
  // temático antigo vira opção do revestimento genérico correspondente.
  const cylinderSizeRules = [
    { key: "alto", label: "Alto", pattern: /\bcilindro\s+alto\b|\brevestimento.*\balto\b/ },
    { key: "medio", label: "Médio", pattern: /\bcilindro\s+medio\b|\brevestimento.*\bmedio\b/ },
    { key: "baixo", label: "Baixo", pattern: /\bcilindro\s+baixo\b|\brevestimento.*\bbaixo\b/ },
  ];

  for (const sizeRule of cylinderSizeRules) {
    const candidates = inventory.filter((item) => {
      const name = normalize(item.name);
      return (
        item.category === "component" &&
        (/\brevestimento\b/.test(name) || /\bcilindro\b/.test(name)) &&
        sizeRule.pattern.test(name)
      );
    });
    if (candidates.length === 0) continue;

    const canonical =
      candidates.find((item) => normalize(item.name) === `revestimento para cilindro ${normalize(sizeRule.label)}`) ??
      candidates[0];

    const options = candidates.map((item) => {
      const name = String(item.name ?? "");
      const theme = String(item.theme ?? "").trim() ||
        name.replace(/revestimento/ig, "").replace(/para cilindro/ig, "").replace(/cilindro/ig, "").trim() ||
        name;
      return {
        id: normalize(theme).replace(/\s+/g, "-") || `tema-${String(item._id)}`,
        name: theme,
        image: item.image ?? "",
        imagePublicId: item.imagePublicId ?? "",
        priceDeltaCents: ZERO,
        stockQuantity: Number(item.totalQuantity ?? DEFAULT_STOCK),
      };
    });
    const uniqueOptions = [...new Map(options.map((o) => [normalize(o.name), o])).values()];

    await saveItem(canonical._id, {
      name: `Revestimento para cilindro ${sizeRule.label.toLowerCase()}`,
      category: "component",
      family: "Revestimentos de cilindros",
      theme: "",
      size: sizeRule.label,
      requiresStructureId: null,
      optionGroups: [{
        id: "tema",
        name: "Tema",
        required: true,
        options: uniqueOptions,
      }],
    });

    for (const item of candidates) {
      if (String(item._id) !== String(canonical._id)) {
        await replaceReferencesAndDelete(item, canonical);
      }
    }
  }

  // 4) Normalizar famílias restantes que estejam classificadas como genéricas.
  const remaining = inventory.filter((item) => !deletedIds.has(String(item._id)));
  for (const item of remaining) {
    const name = normalize(item.name);
    let family: string | null = null;

    if (/\bmesa\b|\bmesas\b|\bmesinha\b/.test(name)) family = "Mesas";
    else if (/\btapete\b/.test(name)) family = "Tapetes";
    else if (/\bcubo\b|\bcubos\b/.test(name)) family = "Cubos decorativos";
    else if (/\bescada\b|\bexpositora\b/.test(name)) family = "Expositores";

    if (family && item.family !== family) {
      await saveItem(item._id, { family, category: "component", requiresStructureId: null });
    }
  }

  // 5) Prune final: manter apenas inventário usado pela nova organização.
  // A lista é intencionalmente restrita. Tudo que não corresponder a uma destas
  // categorias/identidades é tratado como antigo e removido quando --apply for usado.
  const freshInventory = (await InventoryItem.find({}).lean()) as any[];
  const keepIds = new Set<string>();
  const removeItems: any[] = [];

  function isPhysicalStructure(item: any) {
    if (item.category !== "structure") return false;
    const n = normalize(item.name);
    return (
      /\bpainel\b/.test(n) ||
      /\bcilindro\b/.test(n)
    );
  }

  function isNeededComponent(item: any) {
    if (item.category !== "component") return false;
    const n = normalize(item.name);
    const f = normalize(item.family);

    // Painéis decorativos são diferentes por tema e permanecem separados.
    if (/\bpainel\b/.test(n) || f === "paineis") return true;

    // Somente os três revestimentos genéricos por tamanho permanecem.
    if (
      f === "revestimentos de cilindros" &&
      /^revestimento para cilindro (alto|medio|baixo)$/.test(n)
    ) return true;

    // Mesas são itens físicos reutilizáveis; mantêm-se os modelos existentes.
    if (f === "mesas" && /\bmesa\b|\bmesas\b|\bmesinha\b/.test(n)) return true;

    // Um único tapete genérico.
    if (f === "tapetes" && n === "tapete decorativo") return true;

    if (f === "cubos decorativos" && /\bcubo\b|\bcubos\b/.test(n)) return true;
    if (f === "expositores" && /\bescada\b|\bexpositora\b/.test(n)) return true;

    return false;
  }

  for (const item of freshInventory) {
    if (isPhysicalStructure(item) || isNeededComponent(item)) {
      keepIds.add(String(item._id));
    } else {
      removeItems.push(item);
    }
  }

  // Primeiro remove as referências a itens que serão excluídos, para não deixar
  // kits apontando para IDs inválidos. Estruturas físicas no campo inventory são
  // preservadas apenas se a estrutura também estiver na allowlist.
  for (const kit of kits) {
    const currentCustomizable = Array.isArray(kit.customizableItemIds) ? kit.customizableItemIds : [];
    const nextCustomizable = currentCustomizable.filter((id: any) => keepIds.has(String(id)));
    const currentInventory = Array.isArray(kit.inventory) ? kit.inventory : [];
    const nextInventory = currentInventory.filter((entry: any) =>
      entry?.itemId != null && keepIds.has(String(entry.itemId)),
    );

    const changedCustomizable = currentCustomizable.length !== nextCustomizable.length;
    const changedInventory = currentInventory.length !== nextInventory.length;
    if (changedCustomizable || changedInventory) {
      logAction(`Limpar referências antigas do kit "${kit.name}" (${kit.slug})`);
      if (APPLY) {
        await Kit.updateOne(
          { _id: kit._id },
          { $set: { customizableItemIds: nextCustomizable, inventory: nextInventory } },
        );
      }
    }
  }

  for (const item of removeItems) {
    logAction(`Remover item fora da nova lista: "${item.name}" | categoria="${item.category}" | família="${item.family}" | id=${item._id}`);
    if (APPLY) await InventoryItem.deleteOne({ _id: item._id });
    deletedIds.add(String(item._id));
  }

  console.log(`Itens mantidos pela lista da nova lógica: ${keepIds.size}`);
  console.log(`Itens fora da lista que seriam/foram removidos: ${removeItems.length}`);

  console.log("\\nResumo:");
  console.log(`Itens que seriam/foram atualizados: ${changedIds.size}`);
  console.log(`Duplicados/itens antigos que seriam/foram excluídos: ${deletedIds.size}`);
  if (!APPLY) {
    console.log("\nNada foi alterado. Confira os itens listados acima.");
    console.log("Se o resultado estiver correto, faça backup do banco e execute:");
    console.log("npx tsx seed-kits-prilulu-limpeza.ts --apply");
  } else {
    console.log("\nLimpeza aplicada. Confira os kits e seletores no catálogo.");
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("Falha ao limpar e organizar o inventário:", error);
  process.exit(1);
});
