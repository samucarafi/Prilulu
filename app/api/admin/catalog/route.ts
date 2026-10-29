import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { connectMongoDB } from "@/lib/mongodb";
import Kit from "@/models/Kit";
import InventoryItem from "@/models/InventoryItem";
import Booking from "@/models/Booking";
import Coupon from "@/models/Coupon";
import Promotion from "@/models/Promotion";
import {
  peakInventoryUsage,
  peakOptionUsage,
  type InventoryUsageBooking,
} from "@/lib/inventory-usage";
import { isCloudinaryImageUrl } from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

type CatalogOption = {
  id: string;
  name: string;
  image: string;
  imagePublicId: string;
  priceDeltaCents: number;
  stockQuantity: number | null;
};
type CatalogOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  options: CatalogOption[];
};

function parseOptionGroups(input: unknown): CatalogOptionGroup[] | null {
  if (!Array.isArray(input) || input.length > 12) return null;
  const groupIds = new Set<string>();
  const groups: CatalogOptionGroup[] = [];
  for (const rawGroup of input) {
    if (!rawGroup || typeof rawGroup !== "object") return null;
    const group = rawGroup as Record<string, unknown>;
    const id = String(group.id ?? "").trim();
    const name = String(group.name ?? "").trim();
    if (
      !id ||
      !name ||
      name.length > 60 ||
      groupIds.has(id) ||
      !Array.isArray(group.options) ||
      group.options.length < 1 ||
      group.options.length > 40
    )
      return null;
    groupIds.add(id);
    const optionIds = new Set<string>();
    const options: CatalogOption[] = [];
    for (const rawOption of group.options) {
      if (!rawOption || typeof rawOption !== "object") return null;
      const option = rawOption as Record<string, unknown>;
      const optionId = String(option.id ?? "").trim();
      const optionName = String(option.name ?? "").trim();
      const image =
        option.image === "" || option.image === undefined
          ? ""
          : isCloudinaryImageUrl(option.image)
            ? option.image
            : null;
      const priceDeltaCents = Number(option.priceDeltaCents ?? 0);
      const stockQuantity =
        option.stockQuantity === null ||
        option.stockQuantity === "" ||
        option.stockQuantity === undefined
          ? null
          : Number(option.stockQuantity);
      const imagePublicId =
        typeof option.imagePublicId === "string" &&
        option.imagePublicId.startsWith("prilulu-festas/catalogo/")
          ? option.imagePublicId
          : "";
      if (
        !optionId ||
        !optionName ||
        optionName.length > 80 ||
        optionIds.has(optionId) ||
        image === null ||
        !Number.isInteger(priceDeltaCents) ||
        (stockQuantity !== null &&
          (!Number.isInteger(stockQuantity) || stockQuantity < 0))
      )
        return null;
      optionIds.add(optionId);
      options.push({
        id: optionId,
        name: optionName,
        image,
        imagePublicId,
        priceDeltaCents,
        stockQuantity,
      });
    }
    groups.push({ id, name, required: group.required !== false, options });
  }
  return groups;
}

async function markUnavailablePendingBookings(reservedBooking: {
  _id: unknown;
  eventDate: Date;
  returnDate: Date;
}) {
  const pending = (await Booking.find({
    status: "awaiting_contact",
    eventDate: { $lte: reservedBooking.returnDate },
  })
    .populate({ path: "kit", select: "inventory" })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean()) as any[];
  if (!pending.length) return 0;

  const activeBookings = (await Booking.find({
    status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] },
    eventDate: {
      $lte: new Date(
        Math.max(
          ...pending.map((row) =>
            new Date(row.returnDate ?? row.eventDate).getTime(),
          ),
        ),
      ),
    },
  })
    .populate({ path: "kit", select: "inventory" })
    .lean()) as unknown as InventoryUsageBooking[];
  let unavailableCount = 0;
  for (const candidate of pending) {
    const candidateReturnDate = new Date(
      candidate.returnDate ??
        new Date(new Date(candidate.eventDate).getTime() + 24 * 60 * 60 * 1000),
    );
    if (candidateReturnDate < reservedBooking.eventDate) continue;
    const requiredIds = new Set<string>();
    for (const part of candidate.kit?.inventory ?? [])
      requiredIds.add(String(part.itemId?._id ?? part.itemId));
    for (const part of candidate.customInventory ?? [])
      requiredIds.add(String(part.itemId?._id ?? part.itemId));
    for (const extra of candidate.extras ?? [])
      requiredIds.add(String(extra.item?._id ?? extra.item));
    const range = {
      start: new Date(candidate.eventDate),
      end: candidateReturnDate,
    };
    const used = peakInventoryUsage(activeBookings, range);
    const items = (await InventoryItem.find({ _id: { $in: [...requiredIds] } })
      .select("name totalQuantity available optionGroups")
      .lean()) as unknown as Array<{
      _id: unknown;
      name: string;
      totalQuantity: number;
      available: boolean;
      optionGroups?: Array<{
        id: string;
        options: Array<{
          id: string;
          name: string;
          stockQuantity: number | null;
        }>;
      }>;
    }>;
    const candidateRequired = new Map<string, number>();
    for (const part of candidate.kit?.inventory ?? []) {
      const id = String(part.itemId?._id ?? part.itemId);
      candidateRequired.set(
        id,
        (candidateRequired.get(id) ?? 0) + Number(part.quantity ?? 0),
      );
    }
    for (const part of candidate.removedInventory ?? []) {
      const id = String(part.itemId?._id ?? part.itemId);
      candidateRequired.set(
        id,
        (candidateRequired.get(id) ?? 0) - Number(part.quantity ?? 0),
      );
    }
    for (const part of candidate.customInventory ?? []) {
      const id = String(part.itemId?._id ?? part.itemId);
      candidateRequired.set(
        id,
        (candidateRequired.get(id) ?? 0) + Number(part.quantity ?? 0),
      );
    }
    for (const extra of candidate.extras ?? []) {
      const id = String(extra.item?._id ?? extra.item);
      candidateRequired.set(
        id,
        (candidateRequired.get(id) ?? 0) + Number(extra.quantity ?? 1),
      );
    }
    const itemById = new Map(items.map((item) => [String(item._id), item]));
    const shortageId = [...candidateRequired].find(([id, quantity]) => {
      const item = itemById.get(id);
      return (
        quantity > 0 &&
        (!item ||
          !item.available ||
          (used.get(id) ?? 0) + quantity > item.totalQuantity)
      );
    })?.[0];
    const shortage = shortageId ? itemById.get(shortageId) : undefined;
    let unavailableItemName =
      shortage?.name ?? (shortageId ? "uma peça do pedido" : "");
    if (!shortageId) {
      const usedOptions = peakOptionUsage(activeBookings, range);
      for (const extra of candidate.extras ?? []) {
        const itemId = String(extra.item?._id ?? extra.item);
        const item = itemById.get(itemId);
        for (const selectedOption of extra.selectedOptions ?? []) {
          const option = item?.optionGroups
            ?.find((group) => group.id === selectedOption.groupId)
            ?.options.find((entry) => entry.id === selectedOption.optionId);
          if (
            option?.stockQuantity !== null &&
            option?.stockQuantity !== undefined &&
            (usedOptions.get(
              `${itemId}:${selectedOption.groupId}:${selectedOption.optionId}`,
            ) ?? 0) +
              Number(extra.quantity ?? 1) >
              option.stockQuantity
          ) {
            unavailableItemName = `${item?.name ?? "Adicional"} — ${option.name}`;
            break;
          }
        }
        if (unavailableItemName) break;
      }
    }
    if (!unavailableItemName) continue;
    const updated = await Booking.findOneAndUpdate(
      { _id: candidate._id, status: "awaiting_contact" },
      {
        $set: {
          status: "unavailable",
          unavailableItemId: shortageId,
          unavailableItemName,
          whatsappUpdatesOptIn: true,
          whatsappNotificationStatus: "pending",
          whatsappNotificationError: "",
        },
      },
      { new: true },
    );
    if (updated) unavailableCount++;
  }
  return unavailableCount;
}

async function resolveUnavailableReason(candidate: any) {
  const start = new Date(candidate.eventDate);
  const end = new Date(
    candidate.returnDate ?? new Date(start.getTime() + 24 * 60 * 60 * 1000),
  );
  const activeBookings = (await Booking.find({
    status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] },
    eventDate: { $lte: end },
  })
    .populate({ path: "kit", select: "inventory" })
    .lean()) as unknown as InventoryUsageBooking[];
  const range = { start, end };
  const used = peakInventoryUsage(activeBookings, range);
  const required = new Map<string, number>();
  for (const part of candidate.kit?.inventory ?? []) {
    const id = String(part.itemId?._id ?? part.itemId);
    required.set(id, (required.get(id) ?? 0) + Number(part.quantity ?? 0));
  }
  for (const part of candidate.removedInventory ?? []) {
    const id = String(part.itemId?._id ?? part.itemId);
    required.set(id, (required.get(id) ?? 0) - Number(part.quantity ?? 0));
  }
  for (const part of candidate.customInventory ?? []) {
    const id = String(part.itemId?._id ?? part.itemId);
    required.set(id, (required.get(id) ?? 0) + Number(part.quantity ?? 0));
  }
  for (const extra of candidate.extras ?? []) {
    const id = String(extra.item?._id ?? extra.item);
    required.set(id, (required.get(id) ?? 0) + Number(extra.quantity ?? 1));
  }
  const items = (await InventoryItem.find({
    _id: { $in: [...required.keys()] },
  })
    .select("name totalQuantity available optionGroups")
    .lean()) as unknown as Array<{
    _id: unknown;
    name: string;
    totalQuantity: number;
    available: boolean;
    optionGroups?: Array<{
      id: string;
      options: Array<{
        id: string;
        name: string;
        stockQuantity: number | null;
      }>;
    }>;
  }>;
  const itemById = new Map(items.map((item) => [String(item._id), item]));
  const unavailableId = [...required].find(([id, quantity]) => {
    const item = itemById.get(id);
    return (
      quantity > 0 &&
      (!item ||
        !item.available ||
        (used.get(id) ?? 0) + quantity > item.totalQuantity)
    );
  })?.[0];
  if (unavailableId)
    return {
      itemId: unavailableId,
      name: itemById.get(unavailableId)?.name ?? "Item removido do catálogo",
    };

  const usedOptions = peakOptionUsage(activeBookings, range);
  for (const extra of candidate.extras ?? []) {
    const id = String(extra.item?._id ?? extra.item);
    const item = itemById.get(id);
    for (const selectedOption of extra.selectedOptions ?? []) {
      const option = item?.optionGroups
        ?.find((group) => group.id === selectedOption.groupId)
        ?.options.find((entry) => entry.id === selectedOption.optionId);
      if (
        option?.stockQuantity !== null &&
        option?.stockQuantity !== undefined &&
        (usedOptions.get(
          `${id}:${selectedOption.groupId}:${selectedOption.optionId}`,
        ) ?? 0) +
          Number(extra.quantity ?? 1) >
          option.stockQuantity
      ) {
        return {
          itemId: id,
          name: `${item?.name ?? "Adicional"} — ${option.name}`,
        };
      }
    }
  }
  return null;
}

async function editBookingComposition(
  id: string,
  current: any,
  edit: {
    action: "change" | "add";
    itemId: string;
    replacementItemId: string;
    quantity: number;
  },
) {
  const editableStatuses = [
    "awaiting_contact",
    "unavailable",
    "awaiting_deposit",
    "confirmed",
    "picked_up",
  ];
  if (!editableStatuses.includes(current.status))
    return {
      ok: false as const,
      status: 409,
      error:
        "Pedidos devolvidos ou cancelados não podem ter os itens alterados.",
    };
  const kit = current.kit;
  if (!kit)
    return {
      ok: false as const,
      status: 409,
      error: "O kit deste pedido não está mais disponível para edição.",
    };
  const isAdding = edit.action === "add";
  const target = isAdding
    ? null
    : ((await InventoryItem.findById(edit.itemId).lean()) as any);
  if (
    !isAdding &&
    (!target || !["component", "structure", "extra"].includes(target.category))
  )
    return {
      ok: false as const,
      status: 409,
      error: "O item selecionado não está no catálogo.",
    };
  if (
    !Number.isInteger(edit.quantity) ||
    edit.quantity < 1 ||
    edit.quantity > 50
  )
    return {
      ok: false as const,
      status: 400,
      error: "A quantidade deve ser de 1 a 50 unidades.",
    };
  const replacementId = isAdding ? edit.itemId : edit.replacementItemId;
  const baseParts = (kit.inventory ?? []).map((part: any) => ({
    itemId: String(part.itemId?._id ?? part.itemId),
    quantity: Number(part.quantity),
  }));
  const baseQuantity = isAdding
    ? 0
    : baseParts
        .filter((part: any) => part.itemId === edit.itemId)
        .reduce((sum: number, part: any) => sum + part.quantity, 0);
  const customParts = (current.customInventory ?? []).map((part: any) => ({
    ...part,
    itemId: String(part.itemId?._id ?? part.itemId),
  }));
  const removedParts = (current.removedInventory ?? []).map((part: any) => ({
    itemId: String(part.itemId?._id ?? part.itemId),
    quantity: Number(part.quantity),
  }));
  const extraParts = (current.extras ?? []).map((extra: any) => ({
    ...extra,
    item: String(extra.item?._id ?? extra.item),
  }));
  const alreadyRemovedBase = isAdding
    ? 0
    : removedParts
        .filter((part: any) => part.itemId === edit.itemId)
        .reduce((sum: number, part: any) => sum + part.quantity, 0);
  const baseRemainingQuantity = Math.max(0, baseQuantity - alreadyRemovedBase);
  const removedCustom = isAdding
    ? []
    : customParts.filter((part: any) => part.itemId === edit.itemId);
  const removedExtras = isAdding
    ? []
    : extraParts.filter((extra: any) => extra.item === edit.itemId);
  const targetQuantity = isAdding
    ? edit.quantity
    : baseRemainingQuantity +
      removedCustom.reduce(
        (sum: number, part: any) => sum + Number(part.quantity ?? 0),
        0,
      ) +
      removedExtras.reduce(
        (sum: number, extra: any) => sum + Number(extra.quantity ?? 1),
        0,
      );
  if (!isAdding && !targetQuantity)
    return {
      ok: false as const,
      status: 409,
      error: "Esse item não faz parte da composição do pedido.",
    };
  if (!isAdding && replacementId === edit.itemId)
    return {
      ok: false as const,
      status: 400,
      error: "Escolha outro item para fazer a substituição.",
    };

  let replacement: any = null;
  if (replacementId) {
    replacement = await InventoryItem.findOne({
      _id: replacementId,
      available: true,
    }).lean();
    if (
      !replacement ||
      !["component", "structure", "extra"].includes(replacement.category) ||
      (!isAdding && replacement.category !== target?.category)
    )
      return {
        ok: false as const,
        status: 409,
        error: isAdding
          ? "Escolha um item ativo do catálogo."
          : "A substituição precisa ser um item ativo da mesma categoria.",
      };
  }

  const nextRemoved = [...removedParts];
  if (!isAdding && baseRemainingQuantity) {
    const existing = nextRemoved.find(
      (part: any) => part.itemId === edit.itemId,
    );
    if (existing) existing.quantity += baseRemainingQuantity;
    else
      nextRemoved.push({
        itemId: edit.itemId,
        quantity: baseRemainingQuantity,
      });
  }
  let nextCustom = isAdding
    ? [...customParts]
    : customParts.filter((part: any) => part.itemId !== edit.itemId);
  let nextExtras = isAdding
    ? [...extraParts]
    : extraParts.filter((extra: any) => extra.item !== edit.itemId);
  const oldAddedPrice =
    removedCustom.reduce(
      (sum: number, part: any) =>
        sum + Number(part.unitPriceCents ?? 0) * Number(part.quantity ?? 0),
      0,
    ) +
    removedExtras.reduce(
      (sum: number, extra: any) =>
        sum +
        (Number(extra.unitPriceCents ?? target.priceCents ?? 0) +
          (extra.selectedOptions ?? []).reduce(
            (subtotal: number, option: any) =>
              subtotal + Number(option.priceDeltaCents ?? 0),
            0,
          )) *
          Number(extra.quantity ?? 1),
      0,
    );
  let newAddedPrice = 0;
  if (replacement) {
    if (replacement.category === "extra") {
      const selectedOptions: Array<{
        groupId: string;
        groupName: string;
        optionId: string;
        optionName: string;
        image: string;
        priceDeltaCents: number;
      }> = [];
      for (const group of replacement.optionGroups ?? []) {
        if (!group.required) continue;
        const option = (group.options ?? []).find(
          (entry: any) =>
            entry.stockQuantity === null ||
            entry.stockQuantity === undefined ||
            entry.stockQuantity > 0,
        );
        if (!option)
          return {
            ok: false as const,
            status: 409,
            error: `O adicional substituto não tem opção disponível em “${group.name}”.`,
          };
        selectedOptions.push({
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          image: option.image ?? "",
          priceDeltaCents: option.priceDeltaCents ?? 0,
        });
      }
      nextExtras.push({
        item: replacementId,
        quantity: targetQuantity,
        unitPriceCents: replacement.priceCents ?? 0,
        selectedOptions,
      });
      newAddedPrice =
        (Number(replacement.priceCents ?? 0) +
          selectedOptions.reduce(
            (sum, option) => sum + option.priceDeltaCents,
            0,
          )) *
        targetQuantity;
    } else {
      const unitPriceCents =
        replacement.category === "component"
          ? Number(replacement.customPriceCents ?? 0)
          : 0;
      nextCustom.push({
        itemId: replacementId,
        name: replacement.name,
        family: replacement.family ?? "",
        color: replacement.color ?? "",
        size: replacement.size ?? "",
        image: replacement.image ?? "",
        unitPriceCents,
        quantity: targetQuantity,
      });
      newAddedPrice = unitPriceCents * targetQuantity;
    }
  }

  const priceDelta = newAddedPrice - oldAddedPrice;
  const totalCents = Math.max(0, Number(current.totalCents ?? 0) + priceDelta);
  const returnDate =
    current.returnDate ??
    new Date(new Date(current.eventDate).getTime() + 24 * 60 * 60 * 1000);
  const required = new Map<string, number>();
  for (const part of baseParts)
    required.set(part.itemId, (required.get(part.itemId) ?? 0) + part.quantity);
  for (const part of nextRemoved)
    required.set(part.itemId, (required.get(part.itemId) ?? 0) - part.quantity);
  for (const part of nextCustom)
    required.set(
      part.itemId,
      (required.get(part.itemId) ?? 0) + Number(part.quantity ?? 0),
    );
  for (const extra of nextExtras)
    required.set(
      extra.item,
      (required.get(extra.item) ?? 0) + Number(extra.quantity ?? 1),
    );
  const lockIds = [
    ...new Set([
      ...required.keys(),
      edit.itemId,
      ...(replacementId ? [replacementId] : []),
    ]),
  ].sort();
  const lockToken = randomUUID();
  const lockedIds: string[] = [];
  try {
    const now = new Date();
    for (const inventoryId of lockIds) {
      const locked = await InventoryItem.findOneAndUpdate(
        {
          _id: inventoryId,
          $or: [
            { reservationLockUntil: { $exists: false } },
            { reservationLockUntil: null },
            { reservationLockUntil: { $lt: now } },
          ],
        },
        {
          $set: {
            reservationLockToken: lockToken,
            reservationLockUntil: new Date(now.getTime() + 120_000),
          },
        },
        { new: true },
      )
        .select("_id")
        .lean();
      if (!locked)
        return {
          ok: false as const,
          status: 409,
          error:
            "Outra reserva está atualizando o estoque destes itens. Atualize e tente novamente.",
        };
      lockedIds.push(inventoryId);
    }
    const activeBookings = (await Booking.find({
      _id: { $ne: id },
      eventDate: { $lte: returnDate },
      status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] },
    })
      .populate({ path: "kit", select: "inventory" })
      .lean()) as unknown as InventoryUsageBooking[];
    const range = {
      start: new Date(current.eventDate),
      end: new Date(returnDate),
    };
    const used = peakInventoryUsage(activeBookings, range);
    const usedOptions = peakOptionUsage(activeBookings, range);
    const requiredIds = [...required.keys()];
    const inventoryItems = (await InventoryItem.find({
      _id: { $in: requiredIds },
    })
      .select(
        "name totalQuantity available category optionGroups requiresStructureId",
      )
      .lean()) as unknown as Array<{
      _id: unknown;
      name: string;
      totalQuantity: number;
      available: boolean;
      category: string;
      optionGroups?: Array<{
        id: string;
        options: Array<{
          id: string;
          name: string;
          stockQuantity: number | null;
        }>;
      }>;
      requiresStructureId?: unknown;
    }>;
    const itemById = new Map(
      inventoryItems.map((item) => [String(item._id), item]),
    );
    let shortageId =
      [...required].find(([inventoryId, quantity]) => {
        const inventoryItem = itemById.get(inventoryId);
        return (
          quantity > 0 &&
          (!inventoryItem ||
            !inventoryItem.available ||
            (used.get(inventoryId) ?? 0) + quantity >
              inventoryItem.totalQuantity)
        );
      })?.[0] ?? "";
    let shortageName = shortageId
      ? (itemById.get(shortageId)?.name ?? "Item do pedido")
      : "";
    if (!shortageId) {
      const missingStructure = [...required].find(([inventoryId, quantity]) => {
        const inventoryItem = itemById.get(inventoryId);
        return (
          quantity > 0 &&
          inventoryItem?.category === "component" &&
          inventoryItem.requiresStructureId &&
          (required.get(String(inventoryItem.requiresStructureId)) ?? 0) <
            quantity
        );
      });
      if (missingStructure) {
        shortageId = missingStructure[0];
        shortageName = `${itemById.get(shortageId)?.name ?? "Peça"} (estrutura necessária)`;
      }
    }
    if (!shortageId) {
      for (const extra of nextExtras) {
        const inventoryItem = itemById.get(extra.item);
        for (const optionSelection of extra.selectedOptions ?? []) {
          const option = inventoryItem?.optionGroups
            ?.find((group) => group.id === optionSelection.groupId)
            ?.options.find((entry) => entry.id === optionSelection.optionId);
          if (
            option?.stockQuantity !== null &&
            option?.stockQuantity !== undefined &&
            (usedOptions.get(
              `${extra.item}:${optionSelection.groupId}:${optionSelection.optionId}`,
            ) ?? 0) +
              Number(extra.quantity ?? 1) >
              option.stockQuantity
          ) {
            shortageId = extra.item;
            shortageName = `${inventoryItem?.name ?? "Adicional"} — ${option.name}`;
            break;
          }
        }
        if (shortageId) break;
      }
    }
    if (
      shortageId &&
      ["awaiting_deposit", "confirmed", "picked_up"].includes(current.status)
    )
      return {
        ok: false as const,
        status: 409,
        error: `A alteração ainda excede o estoque de “${shortageName}”. Escolha outra opção ou retire mais um item.`,
      };

    let status = current.status;
    if (["awaiting_contact", "unavailable"].includes(current.status))
      status = shortageId ? "unavailable" : "awaiting_contact";
    const update: Record<string, unknown> = {
      customInventory: nextCustom,
      removedInventory: nextRemoved,
      extras: nextExtras,
      totalCents,
      depositCents: Math.ceil(totalCents / 2),
      status,
      whatsappUpdatesOptIn: true,
      whatsappNotificationStatus: shortageId
        ? current.unavailableItemId &&
          String(current.unavailableItemId) === shortageId
          ? (current.whatsappNotificationStatus ?? "pending")
          : "pending"
        : current.whatsappNotificationStatus === "sent"
          ? "sent"
          : "not_required",
    };
    if (shortageId) {
      update.unavailableItemId = shortageId;
      update.unavailableItemName = shortageName;
    } else {
      update.unavailableItemId = null;
      update.unavailableItemName = "";
    }
    const updated = await Booking.findOneAndUpdate(
      { _id: id, status: current.status },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!updated)
      return {
        ok: false as const,
        status: 409,
        error:
          "O pedido mudou enquanto era editado. Atualize o painel e tente novamente.",
      };
    return {
      ok: true as const,
      status,
      shortageName,
      totalCents,
      depositCents: Math.ceil(totalCents / 2),
    };
  } finally {
    if (lockedIds.length)
      await InventoryItem.updateMany(
        { _id: { $in: lockedIds }, reservationLockToken: lockToken },
        { $unset: { reservationLockToken: 1, reservationLockUntil: 1 } },
      );
  }
}

export async function GET() {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  try {
    await connectMongoDB();
    const [items, kits, bookings, coupons, promotions] = await Promise.all([
      InventoryItem.find().sort({ name: 1 }).lean(),
      Kit.find()
        .populate("inventory.itemId")
        .populate("customizableItemIds")
        .sort({ name: 1 })
        .lean(),
      Booking.find()
        .populate({ path: "kit", populate: { path: "inventory.itemId" } })
        .populate("customInventory.itemId")
        .populate("removedInventory.itemId")
        .populate("extras.item")
        .populate("unavailableItemId", "name family")
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Coupon.find().sort({ createdAt: -1 }).lean(),
      Promotion.find().sort({ position: 1 }).lean(),
    ]);
    const enrichedBookings = await Promise.all(
      bookings.map(async (booking: any) => {
        const placeholder =
          !booking.unavailableItemName ||
          booking.unavailableItemName === "uma peça do pedido";
        if (
          booking.status === "unavailable" &&
          (placeholder || !booking.unavailableItemId)
        ) {
          const reason = await resolveUnavailableReason(booking);
          if (reason) {
            booking.unavailableItemId = reason.itemId;
            booking.unavailableItemName = reason.name;
            await Booking.updateOne(
              { _id: booking._id, status: "unavailable" },
              {
                $set: {
                  unavailableItemId: reason.itemId,
                  unavailableItemName: reason.name,
                },
              },
            );
          }
        }
        const populatedItemName =
          typeof booking.unavailableItemId === "object"
            ? booking.unavailableItemId?.name
            : "";
        return {
          ...booking,
          unavailableItemName:
            booking.unavailableItemName || populatedItemName || "",
          returnDate:
            booking.returnDate && booking.returnDate > booking.eventDate
              ? booking.returnDate
              : new Date(booking.eventDate.getTime() + 24 * 60 * 60 * 1000),
        };
      }),
    );
    return NextResponse.json({
      items,
      kits,
      bookings: enrichedBookings,
      coupons,
      promotions,
    });
  } catch (error) {
    console.error("Falha ao carregar o painel:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os dados do painel." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  try {
    await connectMongoDB();
    const body = await request.json();
    if (body.type === "item") {
      const name = String(body.name ?? "").trim();
      const category = body.category;
      const totalQuantity = Number(body.totalQuantity);
      const priceCents =
        category === "extra" ? Math.round(Number(body.price) * 100) : 0;
      const customPriceCents =
        category === "component"
          ? Math.round(Number(body.customPrice ?? 0) * 100)
          : 0;
      if (
        !name ||
        !["component", "structure", "extra"].includes(category) ||
        !Number.isInteger(totalQuantity) ||
        totalQuantity < 0 ||
        !Number.isFinite(priceCents) ||
        priceCents < 0 ||
        !Number.isInteger(customPriceCents) ||
        customPriceCents < 0
      )
        return NextResponse.json(
          { error: "Confira nome, tipo, quantidade e preço." },
          { status: 400 },
        );
      const family = String(body.family ?? "").trim();

      if (!family) {
        return NextResponse.json(
          { error: "Informe a categoria do item ou adicional." },
          { status: 400 },
        );
      }

      const theme = String(body.theme ?? "").trim();
      const color = String(body.color ?? "").trim();
      const size = String(body.size ?? "").trim();
      const requiresStructureId = String(body.requiresStructureId ?? "").trim();
      if (!family)
        return NextResponse.json(
          { error: "Informe uma categoria para organizar este item." },
          { status: 400 },
        );
      if (
        category === "component" &&
        requiresStructureId &&
        !(await InventoryItem.exists({
          _id: requiresStructureId,
          category: "structure",
        }))
      )
        return NextResponse.json(
          {
            error:
              "A estrutura selecionada não existe ou não é uma estrutura interna.",
          },
          { status: 400 },
        );
      if (
        category === "component" &&
        family &&
        (await InventoryItem.exists({
          category: "component",
          family,
          theme,
          color,
          size,
        }))
      )
        return NextResponse.json(
          {
            error:
              "Esta combinação de categoria, tema, cor e tamanho já existe. Edite o estoque da variação cadastrada.",
          },
          { status: 409 },
        );
      const image =
        body.image === undefined || body.image === ""
          ? ""
          : isCloudinaryImageUrl(body.image)
            ? body.image
            : null;
      if (image === null)
        return NextResponse.json(
          { error: "A foto deve estar hospedada no Cloudinary." },
          { status: 400 },
        );
      const imagePublicId =
        typeof body.imagePublicId === "string" &&
        body.imagePublicId.startsWith("prilulu-festas/catalogo/")
          ? body.imagePublicId
          : "";
      const optionGroups =
        category === "extra" ? parseOptionGroups(body.optionGroups ?? []) : [];
      if (optionGroups === null)
        return NextResponse.json(
          {
            error: "Confira os nomes, valores e fotos das opções do adicional.",
          },
          { status: 400 },
        );
      const item = await InventoryItem.create({
        name,
        category,
        family,
        theme,
        color,
        size,
        totalQuantity,
        priceCents,
        customPriceCents,
        requiresStructureId: requiresStructureId || null,
        image,
        imagePublicId,
        optionGroups,
        available: true,
      });
      return NextResponse.json({ ok: true, id: item.id }, { status: 201 });
    }
    if (body.type === "kit") {
      const name = String(body.name ?? "").trim();
      const slug = String(body.slug ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
      const priceCents = Math.round(Number(body.price) * 100);
      const inventory = Array.isArray(body.inventory)
        ? body.inventory
            .filter(
              (part: { itemId?: unknown; quantity?: unknown }) =>
                typeof part.itemId === "string" &&
                Number.isInteger(Number(part.quantity)) &&
                Number(part.quantity) > 0,
            )
            .map((part: { itemId: string; quantity: number }) => ({
              itemId: part.itemId,
              quantity: Number(part.quantity),
            }))
        : [];
      const customizableItemIds = Array.isArray(body.customizableItemIds)
        ? [
            ...new Set(
              body.customizableItemIds.filter(
                (id: unknown): id is string =>
                  typeof id === "string" && id.length > 0,
              ),
            ),
          ]
        : [];
      const items = await InventoryItem.find({
        _id: { $in: inventory.map((part: { itemId: string }) => part.itemId) },
        available: true,
        category: { $in: ["component", "structure"] },
      }).lean();
      const customizableItems = customizableItemIds.length
        ? await InventoryItem.find({
            _id: { $in: customizableItemIds },
            available: true,
            category: "component",
          })
            .select("_id")
            .lean()
        : [];
      if (
        !name ||
        !slug ||
        !Number.isFinite(priceCents) ||
        priceCents < 0 ||
        !inventory.length ||
        items.length !==
          new Set(inventory.map((part: { itemId: string }) => part.itemId))
            .size ||
        inventory.length !==
          new Set(inventory.map((part: { itemId: string }) => part.itemId)).size
      )
        return NextResponse.json(
          {
            error:
              "Informe nome, slug, preço e componentes válidos para o kit.",
          },
          { status: 400 },
        );
      if (items.some((item) => item.category !== "component"))
        return NextResponse.json(
          { error: "A composição do kit deve conter somente peças visíveis. As estruturas são reservadas automaticamente." },
          { status: 400 },
        );
      if (
        Boolean(body.customizable) &&
        (!customizableItemIds.length ||
          customizableItems.length !== customizableItemIds.length)
      )
        return NextResponse.json(
          {
            error:
              "Selecione ao menos uma peça ativa que o cliente poderá escolher.",
          },
          { status: 400 },
        );
      if (
        inventory.some(
          (part: { itemId: string; quantity: number }) =>
            part.quantity >
            (items.find((item) => String(item._id) === part.itemId)
              ?.totalQuantity ?? 0),
        )
      )
        return NextResponse.json(
          {
            error:
              "A quantidade configurada no kit não pode superar o estoque físico da peça.",
          },
          { status: 400 },
        );
      const image =
        body.image === undefined || body.image === ""
          ? ""
          : isCloudinaryImageUrl(body.image)
            ? body.image
            : null;
      if (image === null)
        return NextResponse.json(
          { error: "A foto deve estar hospedada no Cloudinary." },
          { status: 400 },
        );
      const imagePublicId =
        typeof body.imagePublicId === "string" &&
        body.imagePublicId.startsWith("prilulu-festas/catalogo/")
          ? body.imagePublicId
          : "";
      if (
        Boolean(body.customizable) &&
        items.some((item) => item.category !== "structure")
      )
        return NextResponse.json(
          {
            error:
              "A composição-base de um kit montável deve conter somente estruturas internas. As peças visíveis são escolhidas pelo cliente.",
          },
          { status: 400 },
        );
      const kit = await Kit.create({
        name,
        slug,
        theme: String(body.theme ?? "").trim(),
        priceCents,
        customBasePriceCents: priceCents,
        customizable: false,
        allowCustomerEdits: true,
        customizableItemIds: [],
        image,
        imagePublicId,
        inventory,
        active: true,
        featured: Boolean(body.featured),
      });
      return NextResponse.json({ ok: true, id: kit.id }, { status: 201 });
    }
    if (body.type === "coupon") {
      const code = String(body.code ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      const discountPercent = Number(body.discountPercent);
      const maxUses = Number(body.maxUses);
      if (
        !code ||
        !Number.isInteger(discountPercent) ||
        discountPercent < 1 ||
        discountPercent > 100 ||
        !Number.isInteger(maxUses) ||
        maxUses < 1
      )
        return NextResponse.json(
          {
            error:
              "Informe código, desconto percentual e limite de usos válidos.",
          },
          { status: 400 },
        );
      const coupon = await Coupon.create({
        code,
        discountPercent,
        maxUses,
        active: true,
      });
      return NextResponse.json({ ok: true, id: coupon.id }, { status: 201 });
    }
    if (body.type === "promotion") {
      const title = String(body.title ?? "").trim();
      const subtitle = String(body.subtitle ?? "").trim();
      if (!title)
        return NextResponse.json(
          { error: "Informe o título da divulgação." },
          { status: 400 },
        );
      const promotion = await Promotion.create({
        title,
        subtitle,
        active: true,
        position: 0,
        href: "/#catalogo",
      });
      return NextResponse.json({ ok: true, id: promotion.id }, { status: 201 });
    }
    return NextResponse.json(
      { error: "Tipo de cadastro desconhecido." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Falha ao gravar no painel:", error);
    if (
      error instanceof Error &&
      error.name === "ValidationError" &&
      /category/i.test(error.message)
    )
      return NextResponse.json(
        {
          error:
            "O servidor carregou uma versão antiga das categorias do inventário. Reinicie o servidor de desenvolvimento e tente novamente.",
        },
        { status: 409 },
      );
    return NextResponse.json(
      {
        error: "Não foi possível salvar. Verifique os dados e tente novamente.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated()))
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  try {
    await connectMongoDB();
    const body = await request.json();
    const id = String(body.id ?? "");
    if (body.type === "item") {
      const update: Record<string, unknown> = {};
      const currentItem = (await InventoryItem.findById(id).lean()) as {
        category?: string;
        family?: string;
        theme?: string;
        color?: string;
        size?: string;
        requiresStructureId?: unknown;
        optionGroups?: CatalogOptionGroup[];
      } | null;
      if (!currentItem)
        return NextResponse.json(
          { error: "Peça não encontrada." },
          { status: 404 },
        );
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name)
          return NextResponse.json(
            { error: "Informe o nome da peça." },
            { status: 400 },
          );
        update.name = name;
      }
      if (body.category !== undefined) {
        if (!["component", "structure", "extra"].includes(body.category))
          return NextResponse.json(
            { error: "Categoria inválida." },
            { status: 400 },
          );
        if (body.category !== currentItem.category) {
          const referenced = await Kit.exists({ "inventory.itemId": id });
          if (referenced)
            return NextResponse.json(
              {
                error:
                  "Esta peça compõe um ou mais kits. A categoria não pode ser alterada enquanto estiver vinculada a eles.",
              },
              { status: 409 },
            );
          const hasOpenBooking = await Booking.exists({
            "extras.item": id,
            status: {
              $in: [
                "awaiting_contact",
                "awaiting_deposit",
                "confirmed",
                "picked_up",
              ],
            },
          });
          if (hasOpenBooking)
            return NextResponse.json(
              {
                error:
                  "Esta peça está em um pedido em andamento e não pode mudar de categoria até o pedido ser resolvido.",
              },
              { status: 409 },
            );
        }
        update.category = body.category;
        if (body.category !== "extra" && body.optionGroups === undefined)
          update.optionGroups = [];
        if (body.category !== "extra") update.priceCents = 0;
        if (body.category !== "component") update.customPriceCents = 0;
      }
      for (const field of ["family", "theme", "color", "size"] as const)
        if (body[field] !== undefined)
          update[field] = String(body[field]).trim();
      const targetCategory = body.category ?? currentItem.category;
      if (body.requiresStructureId !== undefined) {
        const requiresStructureId = String(
          body.requiresStructureId ?? "",
        ).trim();
        if (
          targetCategory === "component" &&
          requiresStructureId &&
          !(await InventoryItem.exists({
            _id: requiresStructureId,
            category: "structure",
          }))
        )
          return NextResponse.json(
            {
              error:
                "A estrutura selecionada não existe ou não é uma estrutura interna.",
            },
            { status: 400 },
          );
        if (targetCategory !== "component" && requiresStructureId)
          return NextResponse.json(
            {
              error:
                "Somente peças personalizáveis podem exigir uma estrutura.",
            },
            { status: 400 },
          );
        if (
          String(currentItem.requiresStructureId ?? "") !==
            requiresStructureId &&
          (await Booking.exists({
            "customInventory.itemId": id,
            status: {
              $in: [
                "awaiting_contact",
                "awaiting_deposit",
                "confirmed",
                "picked_up",
              ],
            },
          }))
        )
          return NextResponse.json(
            {
              error:
                "A estrutura vinculada não pode mudar enquanto houver reservas personalizadas desta peça.",
            },
            { status: 409 },
          );
        update.requiresStructureId = requiresStructureId || null;
      }
      const family = String(body.family ?? currentItem.family ?? "").trim();

      if (!family) {
        return NextResponse.json(
          { error: "Informe a categoria do item ou adicional." },
          { status: 400 },
        );
      }

      const theme = String(body.theme ?? currentItem.theme ?? "").trim();
      const color = String(body.color ?? currentItem.color ?? "").trim();
      const size = String(body.size ?? currentItem.size ?? "").trim();
      if ((body.family !== undefined || body.category !== undefined) && !family)
        return NextResponse.json(
          { error: "Informe uma categoria para organizar este item." },
          { status: 400 },
        );
      if (body.family !== undefined || body.category !== undefined)
        update.family = family;
      const variantChanged =
        family !== (currentItem.family ?? "") ||
        theme !== (currentItem.theme ?? "") ||
        color !== (currentItem.color ?? "") ||
        size !== (currentItem.size ?? "");
      if (
        ["component", "structure"].includes(currentItem.category ?? "") &&
        variantChanged
      ) {
        const activeKitBookings = await Booking.find({
          status: {
            $in: [
              "awaiting_contact",
              "awaiting_deposit",
              "confirmed",
              "picked_up",
            ],
          },
        })
          .populate({ path: "kit", select: "inventory" })
          .lean();
        const isReserved = activeKitBookings.some(
          (booking: any) =>
            (booking.kit?.inventory ?? []).some(
              (part: { itemId: unknown }) => String(part.itemId) === id,
            ) ||
            (booking.customInventory ?? []).some(
              (part: { itemId: unknown }) => String(part.itemId) === id,
            ),
        );
        if (isReserved)
          return NextResponse.json(
            {
              error:
                "A categoria, o tema, a cor e o tamanho não podem mudar enquanto esta peça fizer parte de um kit reservado. Crie outra variação para preservar os pedidos atuais.",
            },
            { status: 409 },
          );
      }
      if (
        targetCategory === "component" &&
        family &&
        (await InventoryItem.exists({
          category: "component",
          family,
          theme,
          color,
          size,
          _id: { $ne: id },
        }))
      )
        return NextResponse.json(
          {
            error:
              "Esta combinação de categoria, tema, cor e tamanho já existe. Edite o estoque da variação cadastrada.",
          },
          { status: 409 },
        );
      if (body.customPrice !== undefined) {
        const customPriceCents = Math.round(Number(body.customPrice) * 100);
        if (
          !Number.isInteger(customPriceCents) ||
          customPriceCents < 0 ||
          (body.category ?? currentItem.category) !== "component"
        )
          return NextResponse.json(
            { error: "Preço inválido para personalização." },
            { status: 400 },
          );
        update.customPriceCents = customPriceCents;
      }
      if (body.price !== undefined) {
        const priceCents = Math.round(Number(body.price) * 100);
        if (!Number.isFinite(priceCents) || priceCents < 0)
          return NextResponse.json(
            { error: "Preço inválido." },
            { status: 400 },
          );
        if ((body.category ?? currentItem.category) === "component") {
          if (priceCents !== 0)
            return NextResponse.json(
              {
                error:
                  "Peças de kit não têm preço adicional. O valor fica definido no kit.",
              },
              { status: 400 },
            );
          update.priceCents = 0;
        } else update.priceCents = priceCents;
      }
      if (body.totalQuantity !== undefined) {
        const quantity = Number(body.totalQuantity);
        if (!Number.isInteger(quantity) || quantity < 0)
          return NextResponse.json(
            { error: "Quantidade inválida." },
            { status: 400 },
          );
        const bookings = await Booking.find({
          status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] },
        })
          .populate({ path: "kit", select: "inventory" })
          .lean();
        const peakUse =
          peakInventoryUsage(
            bookings as unknown as InventoryUsageBooking[],
          ).get(id) ?? 0;
        if (quantity < peakUse)
          return NextResponse.json(
            {
              error: `A quantidade não pode ficar abaixo das ${peakUse} unidades já reservadas para uma data.`,
            },
            { status: 409 },
          );
        update.totalQuantity = quantity;
      }
      if (body.available !== undefined)
        update.available = Boolean(body.available);
      if (body.optionGroups !== undefined) {
        const targetCategory = body.category ?? currentItem.category;
        const optionGroups =
          targetCategory === "extra"
            ? parseOptionGroups(body.optionGroups)
            : [];
        if (optionGroups === null)
          return NextResponse.json(
            {
              error:
                "Confira os nomes, valores e fotos das opções do adicional.",
            },
            { status: 400 },
          );
        const openOptionBookings = await Booking.find({
          "extras.item": id,
          status: {
            $in: [
              "awaiting_contact",
              "awaiting_deposit",
              "confirmed",
              "picked_up",
            ],
          },
        })
          .select("extras")
          .lean();
        for (const booking of openOptionBookings)
          for (const extra of booking.extras ?? [])
            if (String(extra.item) === id)
              for (const selectedOption of extra.selectedOptions ?? []) {
                const stillAvailable = optionGroups.some(
                  (group) =>
                    group.id === selectedOption.groupId &&
                    group.options.some(
                      (option) => option.id === selectedOption.optionId,
                    ),
                );
                if (!stillAvailable)
                  return NextResponse.json(
                    {
                      error: `A opção “${selectedOption.optionName}” está vinculada a um pedido em andamento e não pode ser removida até ele ser resolvido.`,
                    },
                    { status: 409 },
                  );
              }
        const activeBookings = await Booking.find({
          status: { $in: ["awaiting_deposit", "confirmed", "picked_up"] },
        }).lean();
        const peakOptions = peakOptionUsage(
          activeBookings as unknown as InventoryUsageBooking[],
        );
        for (const group of optionGroups)
          for (const option of group.options) {
            if (
              option.stockQuantity !== null &&
              (peakOptions.get(`${id}:${group.id}:${option.id}`) ?? 0) >
                option.stockQuantity
            ) {
              return NextResponse.json(
                {
                  error: `O estoque da opção “${option.name}” não pode ficar abaixo das reservas já confirmadas.`,
                },
                { status: 409 },
              );
            }
          }
        update.optionGroups = optionGroups;
      }
      if (body.image !== undefined) {
        if (!isCloudinaryImageUrl(body.image))
          return NextResponse.json(
            { error: "A foto deve estar hospedada no Cloudinary." },
            { status: 400 },
          );
        update.image = body.image;
        if (
          typeof body.imagePublicId === "string" &&
          body.imagePublicId.startsWith("prilulu-festas/catalogo/")
        )
          update.imagePublicId = body.imagePublicId;
      }
      const item = await InventoryItem.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });
      if (!item)
        return NextResponse.json(
          { error: "Item não encontrado." },
          { status: 404 },
        );
      return NextResponse.json({ ok: true });
    }
    if (body.type === "kit") {
      const update: Record<string, unknown> = {};
      const currentKit = await Kit.findById(id).lean();
      if (!currentKit)
        return NextResponse.json(
          { error: "Kit não encontrado." },
          { status: 404 },
        );
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name)
          return NextResponse.json(
            { error: "Informe o nome do kit." },
            { status: 400 },
          );
        update.name = name;
      }
      if (body.slug !== undefined) {
        const slug = String(body.slug)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-|-$/g, "");
        if (!slug)
          return NextResponse.json(
            { error: "Informe um identificador válido para o kit." },
            { status: 400 },
          );
        if (await Kit.exists({ slug, _id: { $ne: id } }))
          return NextResponse.json(
            { error: "Este identificador já está sendo usado por outro kit." },
            { status: 409 },
          );
        update.slug = slug;
      }
      if (body.theme !== undefined) update.theme = String(body.theme).trim();
      if (body.customizable !== undefined)
        update.customizable = Boolean(body.customizable);
      if (body.allowCustomerEdits !== undefined)
        update.allowCustomerEdits = Boolean(body.allowCustomerEdits);
      if (body.customizableItemIds !== undefined) {
        const ids = Array.isArray(body.customizableItemIds)
          ? [
              ...new Set(
                body.customizableItemIds.filter(
                  (value: unknown): value is string =>
                    typeof value === "string" && value.length > 0,
                ),
              ),
            ]
          : [];
        const parts = ids.length
          ? await InventoryItem.find({
              _id: { $in: ids },
              category: "component",
              available: true,
            })
              .select("_id")
              .lean()
          : [];
        if (parts.length !== ids.length)
          return NextResponse.json(
            {
              error:
                "Uma peça permitida ao cliente foi desativada ou não existe mais.",
            },
            { status: 409 },
          );
        const previousIds = (currentKit.customizableItemIds ?? [])
          .map((value) => String(value))
          .sort()
          .join("|");
        if (
          ids.slice().sort().join("|") !== previousIds &&
          (await Booking.exists({
            kit: id,
            status: {
              $in: [
                "awaiting_contact",
                "awaiting_deposit",
                "confirmed",
                "picked_up",
              ],
            },
          }))
        )
          return NextResponse.json(
            {
              error:
                "As opções do kit não podem mudar enquanto houver pedidos em andamento.",
            },
            { status: 409 },
          );
        update.customizableItemIds = ids;
      }
      if (body.customBasePrice !== undefined) {
        const customBasePriceCents = Math.round(
          Number(body.customBasePrice) * 100,
        );
        if (!Number.isInteger(customBasePriceCents) || customBasePriceCents < 0)
          return NextResponse.json(
            { error: "Preço-base inválido para montagem personalizada." },
            { status: 400 },
          );
        update.customBasePriceCents = customBasePriceCents;
      }
      if (body.price !== undefined) {
        const priceCents = Math.round(Number(body.price) * 100);
        if (!Number.isFinite(priceCents) || priceCents < 0)
          return NextResponse.json(
            { error: "Preço inválido." },
            { status: 400 },
          );
        update.priceCents = priceCents;
      }
      if (body.inventory !== undefined) {
        const inventory = Array.isArray(body.inventory)
          ? body.inventory
              .filter(
                (part: { itemId?: unknown; quantity?: unknown }) =>
                  typeof part.itemId === "string" &&
                  Number.isInteger(Number(part.quantity)) &&
                  Number(part.quantity) > 0,
              )
              .map((part: { itemId: string; quantity: number }) => ({
                itemId: part.itemId,
                quantity: Number(part.quantity),
              }))
          : [];
        const uniqueIds = new Set(
          inventory.map((part: { itemId: string }) => part.itemId),
        );
        const parts = await InventoryItem.find({
          _id: {
            $in: inventory.map((part: { itemId: string }) => part.itemId),
          },
          category: { $in: ["component", "structure"] },
          available: true,
        }).lean();
        if (
          !inventory.length ||
          uniqueIds.size !== inventory.length ||
          parts.length !== uniqueIds.size ||
          parts.some((item) => item.category !== "component")
        )
          return NextResponse.json(
            {
              error:
                "Selecione componentes de kit ativos, sem repetir peças, e informe suas quantidades.",
            },
            { status: 400 },
          );
        if (
          inventory.some(
            (part: { itemId: string; quantity: number }) =>
              part.quantity >
              (parts.find((item) => String(item._id) === part.itemId)
                ?.totalQuantity ?? 0),
          )
        )
          return NextResponse.json(
            {
              error:
                "A quantidade configurada no kit não pode superar o estoque físico da peça.",
            },
            { status: 400 },
          );
        const previousComposition = currentKit.inventory
          .map((part) => `${String(part.itemId)}:${part.quantity}`)
          .sort()
          .join("|");
        const nextComposition = inventory
          .map(
            (part: { itemId: string; quantity: number }) =>
              `${part.itemId}:${part.quantity}`,
          )
          .sort()
          .join("|");
        if (
          previousComposition !== nextComposition &&
          (await Booking.exists({
            kit: id,
            status: {
              $in: [
                "awaiting_contact",
                "awaiting_deposit",
                "confirmed",
                "picked_up",
              ],
            },
          }))
        ) {
          return NextResponse.json(
            {
              error:
                "A composição deste kit não pode mudar enquanto houver pedidos ou reservas em andamento. Edite os outros dados ou crie um novo kit para preservar os pedidos existentes.",
            },
            { status: 409 },
          );
        }
        update.inventory = inventory;
      }
      if (Boolean(update.customizable ?? currentKit.customizable)) {
        const allowedPieces =
          (update.customizableItemIds as string[] | undefined) ??
          (currentKit.customizableItemIds ?? []).map((value) => String(value));
        if (!allowedPieces.length)
          return NextResponse.json(
            {
              error:
                "Selecione ao menos uma peça personalizável para permitir que o cliente monte este kit.",
            },
            { status: 400 },
          );
        const baseInventory =
          (update.inventory as Array<{ itemId: string }> | undefined) ??
          currentKit.inventory.map((part) => ({ itemId: String(part.itemId) }));
        const baseItems = await InventoryItem.find({
          _id: { $in: baseInventory.map((part) => part.itemId) },
        })
          .select("category")
          .lean();
        if (
          !baseInventory.length ||
          baseItems.length !== baseInventory.length ||
          baseItems.some((item) => item.category !== "structure")
        )
          return NextResponse.json(
            {
              error:
                "A composição-base de um kit montável deve conter somente estruturas internas. As peças visíveis são escolhidas pelo cliente.",
            },
            { status: 400 },
          );
      }
      if (body.active === true) {
        const inventory =
          (update.inventory as
            | Array<{ itemId: string; quantity: number }>
            | undefined) ??
          currentKit.inventory.map((part) => ({
            itemId: String(part.itemId),
            quantity: part.quantity,
          }));
        if (!inventory.length)
          return NextResponse.json(
            {
              error: "Cadastre peças no inventário antes de publicar este kit.",
            },
            { status: 409 },
          );
        const parts = await InventoryItem.find({
          _id: { $in: inventory.map((part) => part.itemId) },
          available: true,
          category: { $in: ["component", "structure"] },
        }).lean();
        if (
          parts.length !== inventory.length ||
          inventory.some((part) => {
            const item = parts.find(
              (entry) => String(entry._id) === String(part.itemId),
            );
            return !item || item.totalQuantity < part.quantity;
          })
        )
          return NextResponse.json(
            {
              error: "Não há estoque ativo suficiente para publicar este kit.",
            },
            { status: 409 },
          );
      }
      if (body.active !== undefined) update.active = Boolean(body.active);
      if (body.featured !== undefined) update.featured = Boolean(body.featured);
      if (body.description !== undefined)
        update.description = String(body.description).trim();
      if (body.image !== undefined) {
        if (!isCloudinaryImageUrl(body.image))
          return NextResponse.json(
            { error: "A foto deve estar hospedada no Cloudinary." },
            { status: 400 },
          );
        update.image = body.image;
        if (
          typeof body.imagePublicId === "string" &&
          body.imagePublicId.startsWith("prilulu-festas/catalogo/")
        )
          update.imagePublicId = body.imagePublicId;
      }
      const kit = await Kit.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });
      if (!kit)
        return NextResponse.json(
          { error: "Kit não encontrado." },
          { status: 404 },
        );
      return NextResponse.json({ ok: true });
    }
    if (body.type === "booking") {
      const allowedStatuses = [
        "awaiting_deposit",
        "confirmed",
        "picked_up",
        "returned",
        "cancelled",
      ];
      if (body.status !== undefined && !allowedStatuses.includes(body.status))
        return NextResponse.json(
          { error: "Status de reserva inválido." },
          { status: 400 },
        );
      if (
        body.status === undefined &&
        body.returnDate === undefined &&
        body.markWhatsAppSent !== true &&
        body.cancelUnavailable !== true &&
        body.editBookingItems === undefined
      )
        return NextResponse.json(
          {
            error:
              "Informe uma etapa, data de devolução, edição do pedido ou registro de aviso.",
          },
          { status: 400 },
        );
      const current = (await Booking.findById(id)
        .populate({ path: "kit", select: "inventory" })
        .lean()) as any;
      if (!current)
        return NextResponse.json(
          { error: "Reserva não encontrada." },
          { status: 404 },
        );
      if (body.editBookingItems !== undefined) {
        const edit = body.editBookingItems as {
          action?: unknown;
          itemId?: unknown;
          replacementItemId?: unknown;
          quantity?: unknown;
        };
        const itemId = typeof edit?.itemId === "string" ? edit.itemId : "";
        const replacementItemId =
          typeof edit?.replacementItemId === "string"
            ? edit.replacementItemId
            : "";
        const action = edit?.action === "add" ? "add" : "change";
        if (
          !/^[a-f\d]{24}$/i.test(itemId) ||
          (replacementItemId && !/^[a-f\d]{24}$/i.test(replacementItemId))
        )
          return NextResponse.json(
            { error: "Escolha um item válido para alterar o pedido." },
            { status: 400 },
          );
        const result = await editBookingComposition(id, current, {
          action,
          itemId,
          replacementItemId,
          quantity: Number(edit.quantity ?? 1),
        });
        if (!result.ok)
          return NextResponse.json(
            { error: result.error },
            { status: result.status },
          );
        return NextResponse.json({
          ok: true,
          status: result.status,
          unavailableItemName: result.shortageName,
          totalCents: result.totalCents,
          depositCents: result.depositCents,
        });
      }
      if (body.markWhatsAppSent === true) {
        if (current.status !== "unavailable")
          return NextResponse.json(
            {
              error:
                "Só é possível registrar o envio de avisos para pedidos indisponíveis.",
            },
            { status: 409 },
          );
        const updated = await Booking.findOneAndUpdate(
          { _id: id, status: "unavailable" },
          {
            $set: {
              whatsappNotificationStatus: "sent",
              whatsappNotificationSentAt: new Date(),
              whatsappNotificationError: "",
            },
          },
          { new: true },
        );
        if (!updated)
          return NextResponse.json(
            {
              error:
                "O pedido mudou enquanto era atualizado. Atualize o painel e tente novamente.",
            },
            { status: 409 },
          );
        return NextResponse.json({ ok: true });
      }
      if (body.cancelUnavailable === true) {
        if (current.status !== "unavailable")
          return NextResponse.json(
            {
              error:
                "Só é possível cancelar um pedido indisponível por esta ação.",
            },
            { status: 409 },
          );
        const updated = await Booking.findOneAndUpdate(
          { _id: id, status: "unavailable" },
          { $set: { status: "cancelled" } },
          { new: true },
        );
        if (!updated)
          return NextResponse.json(
            {
              error:
                "O pedido mudou enquanto era atualizado. Atualize o painel e tente novamente.",
            },
            { status: 409 },
          );
        return NextResponse.json({ ok: true });
      }
      const storedReturnDate = current.returnDate ?? current.eventDate;
      const currentReturnDate =
        storedReturnDate > current.eventDate
          ? storedReturnDate
          : new Date(current.eventDate.getTime() + 24 * 60 * 60 * 1000);
      let returnDate = currentReturnDate;
      if (body.returnDate !== undefined) {
        if (
          typeof body.returnDate !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(body.returnDate)
        )
          return NextResponse.json(
            { error: "Informe uma data de devolução válida." },
            { status: 400 },
          );
        returnDate = new Date(`${body.returnDate}T12:00:00.000Z`);
        const earliestReturnDate = new Date(
          current.eventDate.getTime() + 24 * 60 * 60 * 1000,
        );
        if (
          Number.isNaN(returnDate.getTime()) ||
          returnDate.toISOString().slice(0, 10) !== body.returnDate ||
          returnDate < earliestReturnDate
        )
          return NextResponse.json(
            {
              error: "A devolução deve ser no dia seguinte à festa ou depois.",
            },
            { status: 400 },
          );
      }
      const nextStatus = body.status ?? current.status;
      const reservingStatuses = ["awaiting_deposit", "confirmed", "picked_up"];
      const currentIsReserved = reservingStatuses.includes(current.status);
      const nextIsReserved = reservingStatuses.includes(nextStatus);
      const returnDateChanged =
        returnDate.getTime() !== currentReturnDate.getTime();
      const needsAvailabilityCheck =
        nextIsReserved && (!currentIsReserved || returnDateChanged);
      const update: Record<string, unknown> = {};
      if (body.status !== undefined) update.status = nextStatus;
      if (body.returnDate !== undefined) update.returnDate = returnDate;
      if (!needsAvailabilityCheck) {
        const booking = await Booking.findOneAndUpdate(
          { _id: id, status: current.status, returnDate: storedReturnDate },
          update,
          { new: true, runValidators: true },
        );
        if (!booking)
          return NextResponse.json(
            {
              error:
                "A reserva mudou enquanto era atualizada. Atualize o painel e tente novamente.",
            },
            { status: 409 },
          );
        return NextResponse.json({ ok: true });
      }

      const kit = current.kit as unknown as {
        inventory?: Array<{ itemId: unknown; quantity: number }>;
      } | null;
      const required = new Map<string, number>();
      for (const part of kit?.inventory ?? [])
        required.set(
          String(part.itemId),
          (required.get(String(part.itemId)) ?? 0) + part.quantity,
        );
      for (const part of current.customInventory ?? [])
        required.set(
          String(part.itemId),
          (required.get(String(part.itemId)) ?? 0) + part.quantity,
        );
      for (const extra of current.extras ?? [])
        required.set(
          String(extra.item),
          (required.get(String(extra.item)) ?? 0) + (extra.quantity ?? 1),
        );
      const ids = [...required.keys()].sort();
      const lockToken = randomUUID();
      const lockedIds: string[] = [];
      try {
        const now = new Date();
        for (const itemId of ids) {
          const locked = await InventoryItem.findOneAndUpdate(
            {
              _id: itemId,
              $or: [
                { reservationLockUntil: { $exists: false } },
                { reservationLockUntil: null },
                { reservationLockUntil: { $lt: now } },
              ],
            },
            {
              $set: {
                reservationLockToken: lockToken,
                reservationLockUntil: new Date(now.getTime() + 120_000),
              },
            },
            { new: true },
          )
            .select("_id")
            .lean();
          if (!locked)
            return NextResponse.json(
              {
                error:
                  "Outra reserva está sendo confirmada com uma destas peças. Atualize o painel e tente novamente.",
              },
              { status: 409 },
            );
          lockedIds.push(itemId);
        }
        const items = await InventoryItem.find({
          _id: { $in: ids },
          available: true,
        }).lean();
        if (items.length !== ids.length)
          return NextResponse.json(
            {
              error:
                "Uma ou mais peças deste pedido estão inativas ou indisponíveis.",
            },
            { status: 409 },
          );
        const activeBookings = await Booking.find({
          _id: { $ne: id },
          eventDate: { $lte: returnDate },
          status: { $in: reservingStatuses },
        })
          .populate({ path: "kit", select: "inventory" })
          .lean();
        const used = peakInventoryUsage(
          activeBookings as unknown as InventoryUsageBooking[],
          { start: current.eventDate, end: returnDate },
        );
        const usedOptions = peakOptionUsage(
          activeBookings as unknown as InventoryUsageBooking[],
          { start: current.eventDate, end: returnDate },
        );
        const shortage = items.find(
          (item) =>
            (used.get(String(item._id)) ?? 0) +
              (required.get(String(item._id)) ?? 0) >
            item.totalQuantity,
        );
        if (shortage)
          return NextResponse.json(
            {
              error: `Estoque insuficiente de “${shortage.name}” para essa data. A reserva não foi confirmada.`,
            },
            { status: 409 },
          );
        const extraIds = (current.extras ?? []).map(
          (extra: { item: unknown }) => String(extra.item),
        );
        const extraItems = (await InventoryItem.find({
          _id: { $in: extraIds },
          available: true,
          category: "extra",
        }).lean()) as Array<{
          _id: unknown;
          optionGroups?: Array<{
            id: string;
            options?: Array<{
              id: string;
              name: string;
              stockQuantity: number | null;
            }>;
          }>;
        }>;
        if (extraItems.length !== new Set(extraIds).size)
          return NextResponse.json(
            {
              error:
                "Um adicional desta solicitação foi desativado. Atualize o pedido antes de confirmar.",
            },
            { status: 409 },
          );
        for (const extra of current.extras ?? [])
          for (const selectedOption of extra.selectedOptions ?? []) {
            const itemId = String(extra.item);
            const item = extraItems.find(
              (entry) => String(entry._id) === itemId,
            );
            const group = item?.optionGroups?.find(
              (entry) => entry.id === selectedOption.groupId,
            );
            const option = group?.options?.find(
              (entry) => entry.id === selectedOption.optionId,
            );
            if (!option)
              return NextResponse.json(
                {
                  error: `A opção “${selectedOption.optionName}” deste pedido foi alterada no catálogo. Revise com o cliente antes de confirmar.`,
                },
                { status: 409 },
              );
            if (
              option.stockQuantity !== null &&
              (usedOptions.get(
                `${itemId}:${selectedOption.groupId}:${selectedOption.optionId}`,
              ) ?? 0) +
                (extra.quantity ?? 1) >
                option.stockQuantity
            )
              return NextResponse.json(
                {
                  error: `Estoque insuficiente da opção “${option.name}” para essa data.`,
                },
                { status: 409 },
              );
          }
        const booking = await Booking.findOneAndUpdate(
          { _id: id, status: current.status, returnDate: storedReturnDate },
          update,
          { new: true, runValidators: true },
        );
        if (!booking)
          return NextResponse.json(
            {
              error:
                "A reserva mudou enquanto era atualizada. Atualize o painel e tente novamente.",
            },
            { status: 409 },
          );
        if (lockedIds.length) {
          await InventoryItem.updateMany(
            { _id: { $in: lockedIds }, reservationLockToken: lockToken },
            { $unset: { reservationLockToken: 1, reservationLockUntil: 1 } },
          );
          lockedIds.length = 0;
        }
        let unavailableCount = 0;
        if (!currentIsReserved && nextIsReserved) {
          try {
            unavailableCount = await markUnavailablePendingBookings({
              _id: booking._id,
              eventDate: current.eventDate,
              returnDate,
            });
          } catch (error) {
            console.error(
              "Falha ao atualizar pedidos afetados pelo estoque:",
              error,
            );
          }
        }
        return NextResponse.json({ ok: true, unavailableCount });
      } finally {
        if (lockedIds.length)
          await InventoryItem.updateMany(
            { _id: { $in: lockedIds }, reservationLockToken: lockToken },
            { $unset: { reservationLockToken: 1, reservationLockUntil: 1 } },
          );
      }
    }
    if (body.type === "coupon") {
      const coupon = await Coupon.findByIdAndUpdate(
        id,
        { active: Boolean(body.active) },
        { new: true },
      );
      if (!coupon)
        return NextResponse.json(
          { error: "Cupom não encontrado." },
          { status: 404 },
        );
      return NextResponse.json({ ok: true });
    }
    if (body.type === "promotion") {
      const promotion = await Promotion.findByIdAndUpdate(
        id,
        { active: Boolean(body.active) },
        { new: true },
      );
      if (!promotion)
        return NextResponse.json(
          { error: "Divulgação não encontrada." },
          { status: 404 },
        );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Tipo de atualização desconhecido." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Falha ao atualizar pelo painel:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar este registro." },
      { status: 400 },
    );
  }
}
