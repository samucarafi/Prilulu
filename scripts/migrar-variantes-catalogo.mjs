import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Configure MONGODB_URI no .env.local antes de migrar o catálogo.");
}

await mongoose.connect(uri);
try {
  const collection = mongoose.connection.db?.collection("inventoryitems");
  if (!collection) throw new Error("Não foi possível abrir a coleção inventoryitems.");

  const migrations = [
    {
      label: "Capas de painel · Patrulha Canina",
      filter: { category: "component", name: /patrulha\s*canina/i },
      update: { $set: { family: "Capas de painel", theme: "Patrulha Canina" } },
    },
    {
      label: "Capas de painel · Homem-Aranha",
      filter: { category: "component", name: /homem[\s-]*aranha/i },
      update: { $set: { family: "Capas de painel", theme: "Homem-Aranha" } },
    },
  ];

  const results = [];
  for (const migration of migrations) {
    const result = await collection.updateMany(migration.filter, migration.update);
    results.push({ categoria: migration.label, encontrados: result.matchedCount, alterados: result.modifiedCount });
  }

  const cylinderFilter = {
    category: "component",
    $or: [
      { family: /^capas?\s+de\s+cilindro$/i },
      { name: /capa.*cilindro/i },
    ],
  };
  const cylinderCategory = await collection.updateMany(cylinderFilter, {
    $set: { family: "Capas de cilindro" },
  });
  const cylinderTheme = await collection.updateMany(
    {
      category: "component",
      $and: [
        { $or: cylinderFilter.$or },
        { $or: [{ theme: "" }, { theme: null }, { theme: { $exists: false } }] },
      ],
    },
    { $set: { theme: "Lisa" } },
  );
  results.push({
    categoria: "Capas de cilindro",
    encontrados: cylinderCategory.matchedCount,
    alterados: cylinderCategory.modifiedCount,
    temasLisaPreenchidos: cylinderTheme.modifiedCount,
  });

  console.log("Migração de categorias e temáticas concluída:");
  console.log(JSON.stringify(results, null, 2));
  console.log("As referências dos kits e as quantidades de estoque não foram alteradas.");
} finally {
  await mongoose.disconnect();
}
