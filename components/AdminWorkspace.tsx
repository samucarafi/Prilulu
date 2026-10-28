"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, LogOut, Plus, RefreshCw } from "lucide-react";
import { unavailableWhatsAppUrl } from "@/lib/whatsapp";

type Row = Record<string, any>;
type Data = {
  items: Row[];
  kits: Row[];
  bookings: Row[];
  coupons: Row[];
  promotions: Row[];
};
const initial: Data = {
  items: [],
  kits: [],
  bookings: [],
  coupons: [],
  promotions: [],
};
const fmt = (cents: number) =>
  (Number(cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const asDate = (value: string | Date) =>
  value instanceof Date ? new Date(value.getTime()) : new Date(value);
const dateInput = (value: string | Date) =>
  asDate(value).toISOString().slice(0, 10);
const dateLabel = (value: string | Date) =>
  asDate(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const nextDateInput = (value: string | Date) => {
  const date = asDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

function KitCompositionPicker({
  items,
  initialInventory = [],
}: {
  items: Row[];
  initialInventory?: Row[];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      initialInventory.map((part) => [
        String(part.itemId?._id ?? part.itemId),
        Number(part.quantity),
      ]),
    ),
  );
  const [familyFilter, setFamilyFilter] = useState("all");
  const inventory = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  const familyOf = (item: Row) =>
    String(
      item.family ||
        (item.category === "structure"
          ? "Estruturas internas"
          : "Sem categoria"),
    );
  const families = [...new Set(items.map(familyOf))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const visibleFamilies = families.filter(
    (family) => familyFilter === "all" || family === familyFilter,
  );
  return (
    <div className="inventory-picker">
      <b>Composição física do kit</b>
      <small>
        Selecione as peças visíveis que fazem parte do kit pronto e informe as
        quantidades. As estruturas de suporte ficam ocultas e são reservadas
        automaticamente conforme as peças selecionadas exigirem.
      </small>
      <input type="hidden" name="inventory" value={JSON.stringify(inventory)} />
      {items.length === 0 ? (
        <small>
          Cadastre peças/estruturas no inventário antes de montar um kit.
        </small>
      ) : (
        <>
          <select
            aria-label="Filtrar composição por categoria"
            value={familyFilter}
            onChange={(event) => setFamilyFilter(event.target.value)}
          >
            <option value="all">Todas as categorias</option>
            {families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
          <div className="composition-list">
            {visibleFamilies.map((family) => (
              <section className="variant-family" key={family}>
                <b className="variant-family-title">{family}</b>
                {items
                  .filter((item) => familyOf(item) === family)
                  .map((item) => {
                    const quantity = quantities[item._id] ?? 0;
                    const detail = [
                      item.category === "structure"
                        ? "Estrutura oculta"
                        : "Peça visível",
                      item.theme && `Tema: ${item.theme}`,
                      item.color && `Cor: ${item.color}`,
                      item.size && `Tamanho: ${item.size}`,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        className={
                          quantity
                            ? "composition-row selected"
                            : "composition-row"
                        }
                        key={item._id}
                      >
                        <label>
                          <input
                            type="checkbox"
                            disabled={item.totalQuantity < 1}
                            checked={quantity > 0}
                            onChange={(event) =>
                              setQuantities((current) => {
                                const next = { ...current };
                                if (event.target.checked) next[item._id] = 1;
                                else delete next[item._id];
                                return next;
                              })
                            }
                          />
                          {item.image && (
                            <Image
                              src={item.image}
                              alt=""
                              width={36}
                              height={36}
                              className="admin-thumb"
                            />
                          )}
                          <span>
                            <small>
                              {detail || item.name || "Variação padrão"} ·
                              Estoque: {item.totalQuantity}
                            </small>
                          </span>
                        </label>
                        {quantity > 0 && (
                          <div className="composition-quantity">
                            <span>Unidades</span>
                            <input
                              type="number"
                              min="1"
                              max={item.totalQuantity}
                              value={quantity}
                              onChange={(event) =>
                                setQuantities((current) => ({
                                  ...current,
                                  [item._id]: Math.max(
                                    1,
                                    Math.min(
                                      item.totalQuantity,
                                      Number(event.target.value) || 1,
                                    ),
                                  ),
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </section>
            ))}
          </div>
        </>
      )}
      <small>
        O cliente poderá retirar ou adicionar peças ao pedido. Estruturas não
        são selecionadas aqui: a reserva calcula automaticamente as necessárias.
        O estoque é compartilhado entre todos os kits.
      </small>
    </div>
  );
}

function BookingItemsEditor({
  booking,
  items,
  onSave,
}: {
  booking: Row;
  items: Row[];
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const parts = new Map<string, number>();
  const addPart = (value: unknown, quantity: number) => {
    const id = String((value as Row)?._id ?? value ?? "");
    if (id) parts.set(id, (parts.get(id) ?? 0) + Number(quantity || 0));
  };
  for (const part of booking.kit?.inventory ?? [])
    addPart(part.itemId, part.quantity);
  for (const part of booking.removedInventory ?? [])
    addPart(part.itemId, -Number(part.quantity ?? 0));
  for (const part of booking.customInventory ?? [])
    addPart(part.itemId, part.quantity);
  for (const extra of booking.extras ?? [])
    addPart(extra.item, extra.quantity ?? 1);
  const selectable = [...parts].filter(([, quantity]) => quantity > 0);
  const [targetId, setTargetId] = useState(() =>
    String(booking.unavailableItemId ?? selectable[0]?.[0] ?? ""),
  );
  const [replacementId, setReplacementId] = useState("");
  const [addItemId, setAddItemId] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const target = items.find((item) => String(item._id) === targetId);
  if (["returned", "cancelled"].includes(booking.status)) return null;
  const submit = async (replacement = "") => {
    if (!targetId) return;
    if (
      booking.status === "confirmed" &&
      !window.confirm(
        "Este pedido já está confirmado. Confirme o ajuste de itens e valores com o cliente; o estoque e o sinal serão recalculados.",
      )
    )
      return;
    if (
      booking.status === "picked_up" &&
      !window.confirm(
        "Este pedido já foi retirado. Confirme que a troca ou retirada foi combinada e realizada fisicamente; o estoque e os valores serão recalculados.",
      )
    )
      return;
    const saved = await onSave({
      type: "booking",
      id: booking._id,
      editBookingItems: {
        itemId: targetId,
        ...(replacement ? { replacementItemId: replacement } : {}),
      },
    });
    if (saved) setReplacementId("");
  };
  const addItem = async () => {
    if (!addItemId) return;
    if (
      ["confirmed", "picked_up"].includes(booking.status) &&
      !window.confirm(
        "Este pedido já está confirmado ou foi retirado. Confirme a inclusão e os novos valores com o cliente; o estoque será validado.",
      )
    )
      return;
    const saved = await onSave({
      type: "booking",
      id: booking._id,
      editBookingItems: {
        action: "add",
        itemId: addItemId,
        quantity: addQuantity,
      },
    });
    if (saved) {
      setAddItemId("");
      setAddQuantity(1);
    }
  };
  const alternatives = target
    ? items.filter(
        (item) =>
          item.available &&
          item.totalQuantity > 0 &&
          item.category === target.category &&
          String(item._id) !== targetId,
      )
    : [];
  const addableItems = items.filter(
    (item) =>
      item.available &&
      item.totalQuantity > 0 &&
      ["component", "structure", "extra"].includes(item.category),
  );
  return (
    <details className="booking-items-editor">
      <summary>Editar itens</summary>
      <div className="booking-items-editor-panel">
        <small>
          Substitua por outra variação ou retire todas as unidades do item
          selecionado. Também é possível adicionar itens. O estoque
          compartilhado e os valores do pedido são recalculados.
        </small>
        <select
          aria-label="Item do pedido para alterar"
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value);
            setReplacementId("");
          }}
        >
          <option value="">Selecione um item do pedido</option>
          {selectable.map(([id, quantity]) => {
            const item = items.find((entry) => String(entry._id) === id);
            return (
              <option key={id} value={id}>
                {item?.name ?? booking.unavailableItemName ?? "Item do pedido"}{" "}
                ·{" "}
                {item
                  ? [item.theme, item.color, item.size]
                      .filter(Boolean)
                      .join(" · ")
                  : "variação"}{" "}
                · {quantity} un.
              </option>
            );
          })}
        </select>
        {target && (
          <select
            aria-label="Substituir por"
            value={replacementId}
            onChange={(event) => setReplacementId(event.target.value)}
          >
            <option value="">Manter vazio para retirar o item</option>
            {alternatives.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} ·{" "}
                {[item.theme, item.color, item.size]
                  .filter(Boolean)
                  .join(" · ") || "sem variação"}{" "}
                · estoque {item.totalQuantity}
              </option>
            ))}
          </select>
        )}
        <div className="booking-items-editor-actions">
          <button
            type="button"
            className="toggle"
            disabled={!targetId}
            onClick={() => void submit()}
          >
            Retirar do pedido
          </button>
          <button
            type="button"
            className="toggle"
            disabled={!targetId || !replacementId}
            onClick={() => void submit(replacementId)}
          >
            Substituir item
          </button>
        </div>
        <small>Adicionar à composição</small>
        <select
          aria-label="Item a adicionar ao pedido"
          value={addItemId}
          onChange={(event) => setAddItemId(event.target.value)}
        >
          <option value="">Escolha peça, estrutura ou adicional</option>
          {addableItems.map((item) => (
            <option key={item._id} value={item._id}>
              {item.family || item.name} · {item.name} ·{" "}
              {[item.theme, item.color, item.size]
                .filter(Boolean)
                .join(" · ") || item.category}{" "}
              · estoque {item.totalQuantity}
            </option>
          ))}
        </select>
        <div className="booking-items-editor-actions">
          <label>
            Quantidade{" "}
            <input
              type="number"
              min="1"
              max="50"
              value={addQuantity}
              onChange={(event) =>
                setAddQuantity(
                  Math.max(1, Math.min(50, Number(event.target.value) || 1)),
                )
              }
            />
          </label>
          <button
            type="button"
            className="toggle"
            disabled={!addItemId}
            onClick={() => void addItem()}
          >
            Adicionar item
          </button>
        </div>
      </div>
    </details>
  );
}

function InventoryValueSelect({
  items,
  field,
  label,
  placeholder,
  initialValue = "",
  required = false,
}: {
  items: Row[];
  field: "name" | "family" | "theme" | "color" | "size";
  label: string;
  placeholder: string;
  initialValue?: string;
  required?: boolean;
}) {
  const options = [
    ...new Set(
      items.map((item) => String(item[field] ?? "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const [creating, setCreating] = useState(false);
  const [value, setValue] = useState(initialValue);

  if (creating) {
    return (
      <div className="inventory-value-create">
        <input
          name={field}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoFocus
          required={required}
        />

        <button
          type="button"
          className="toggle"
          onClick={() => {
            setCreating(false);
            setValue(initialValue);
          }}
        >
          Usar valores cadastrados
        </button>
      </div>
    );
  }

  return (
    <select
      name={field}
      value={value}
      required={required}
      aria-label={label}
      onChange={(event) => {
        if (event.target.value === "__create__") {
          setValue("");
          setCreating(true);
        } else {
          setValue(event.target.value);
        }
      }}
    >
      <option value="">{label}</option>

      {options.map((option) => (
        <option value={option} key={option}>
          {option}
        </option>
      ))}

      <option value="__create__">+ Cadastrar novo valor...</option>
    </select>
  );
}

export default function AdminWorkspace() {
  const [data, setData] = useState<Data>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [kitFormVersion, setKitFormVersion] = useState(0);
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [bookingDateFilter, setBookingDateFilter] = useState("all");
  const [bookingSearch, setBookingSearch] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [editingKitId, setEditingKitId] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("component");
  const [itemFormVersion, setItemFormVersion] = useState(0);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) {
      setData(result);
      setError("");
    } else setError(result.error ?? "Não foi possível carregar o painel.");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Não foi possível salvar.");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Não foi possível salvar agora. Tente novamente.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const update = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/admin/catalog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Não foi possível atualizar.");
      return false;
    }
    await load();
    return true;
  };
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const filteredBookings = data.bookings
    .filter(
      (row) =>
        bookingStatusFilter === "all" || row.status === bookingStatusFilter,
    )
    .filter(
      (row) =>
        bookingDateFilter === "all" ||
        (bookingDateFilter === "upcoming"
          ? dateInput(row.eventDate) >= today
          : dateInput(row.eventDate) < today),
    )
    .filter((row) => {
      const query = bookingSearch.trim().toLocaleLowerCase("pt-BR");
      return (
        !query ||
        [row.customerName, row.email, row.phone, row.kit?.name].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase("pt-BR")
            .includes(query),
        )
      );
    });
  const uploadImage = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/admin/uploads", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Falha ao enviar imagem.");
    return {
      image: result.image as string,
      imagePublicId: result.publicId as string,
    };
  };
  const saveItemEdit = async (
    id: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body: Record<string, unknown> = {
      type: "item",
      id,
      name: values.get("name"),
      category: values.get("category"),
      family: String(values.get("family") ?? ""),
      theme: String(values.get("theme") ?? ""),
      color: String(values.get("color") ?? ""),
      size: String(values.get("size") ?? ""),
      totalQuantity: Number(values.get("totalQuantity")),
      price: Number(values.get("price") || 0),
      customPrice: Number(values.get("customPrice") || 0),
      requiresStructureId: String(values.get("requiresStructureId") || ""),
    };
    const file = values.get("image");
    if (file instanceof File && file.size) {
      try {
        Object.assign(body, await uploadImage(file));
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Falha ao enviar imagem.",
        );
        return;
      }
    }
    if (await update(body)) setEditingItemId("");
  };
  const saveKitEdit = async (id: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const body: Record<string, unknown> = {
      type: "kit",
      id,
      name: values.get("name"),
      slug: values.get("slug"),
      theme: values.get("theme"),
      price: Number(values.get("price")),
      customizable: false,
      allowCustomerEdits: true,
      inventory: JSON.parse(String(values.get("inventory") || "[]")),
      customizableItemIds: [],
      featured: values.get("featured") === "on",
    };
    const file = values.get("image");
    if (file instanceof File && file.size) {
      try {
        Object.assign(body, await uploadImage(file));
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Falha ao enviar imagem.",
        );
        return;
      }
    }
    if (!Array.isArray(body.inventory) || body.inventory.length === 0) {
      setError("Selecione pelo menos uma peça e informe as quantidades.");
      return;
    }
    if (await update(body)) setEditingKitId("");
  };
  const replaceImage = async (
    type: "kit" | "item",
    id: string,
    file?: File,
  ) => {
    if (!file) return;
    try {
      const uploaded = await uploadImage(file);
      await update({ type, id, ...uploaded });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Falha ao atualizar imagem.",
      );
    }
  };
  const submit = async (type: string, form: FormEvent<HTMLFormElement>) => {
    form.preventDefault();
    const formElement = form.currentTarget;
    const values = new FormData(formElement);
    const body = Object.fromEntries(values.entries()) as Record<
      string,
      unknown
    >;
    body.type = type;
    const imageFile = values.get("image");
    delete body.image;
    if (imageFile instanceof File && imageFile.size > 0) {
      try {
        Object.assign(body, await uploadImage(imageFile));
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Falha ao enviar imagem.",
        );
        return;
      }
    }
    if (type === "item") {
      body.totalQuantity = Number(body.totalQuantity);
      body.price = Number(body.price || 0);
      body.customPrice = Number(body.customPrice || 0);
      body.requiresStructureId = String(body.requiresStructureId || "");
    }
    if (type === "kit") {
      body.price = Number(body.price);
      // Todos os kits são prontos, mas o cliente pode editar a composição.
      body.customizable = false;
      body.allowCustomerEdits = true;
      body.customizableItemIds = [];
      body.featured = values.get("featured") === "on";
      try {
        body.inventory = JSON.parse(String(values.get("inventory") || "[]"));
      } catch {
        setError("A composição do kit está inválida.");
        return;
      }
      if (!Array.isArray(body.inventory) || body.inventory.length === 0) {
        setError("Selecione pelo menos uma peça e informe as quantidades.");
        return;
      }
    }
    if (type === "coupon") {
      body.discountPercent = Number(body.discountPercent);
      body.maxUses = Number(body.maxUses);
    }
    if (!(await save(body))) return;
    formElement.reset();
    setNewItemCategory("component");
    if (type === "kit") {
      setKitFormVersion((value) => value + 1);
    }
    if (type === "item") setItemFormVersion((value) => value + 1);
  };
  return (
    <main className="admin-console">
      <header className="admin-header">
        <Link href="/" className="admin-back">
          <ArrowLeft size={16} /> Voltar à loja
        </Link>
        <div className="admin-mark">
          Prilulu <span>PAINEL DA LOJA</span>
        </div>
        <button
          className="admin-logout"
          onClick={async () => {
            await fetch("/api/admin/login", { method: "DELETE" });
            location.reload();
          }}
        >
          <LogOut size={15} /> Sair
        </button>
      </header>
      <div className="admin-main">
        <section className="admin-welcome">
          <div>
            <div className="eyebrow">
              CENTRAL DA PRILULU <span>✳</span>
            </div>
            <h1>
              Cuide de cada
              <br />
              detalhe da festa<span>!</span>
            </h1>
            <p>Atualize o estoque e acompanhe os pedidos no mesmo lugar.</p>
          </div>
          <button className="admin-refresh" onClick={() => void load()}>
            <RefreshCw size={15} /> Atualizar
          </button>
        </section>
        {error && <p className="admin-error">{error}</p>}
        <section className="admin-summary">
          <div>
            <b>
              {
                data.bookings.filter((row) => row.status === "awaiting_contact")
                  .length
              }
            </b>
            <small>Solicitações novas</small>
          </div>
          <div>
            <b>
              {
                data.bookings.filter((row) =>
                  ["awaiting_deposit", "confirmed"].includes(row.status),
                ).length
              }
            </b>
            <small>Reservas em andamento</small>
          </div>
          <div>
            <b>
              {
                data.items.filter(
                  (row) => row.totalQuantity <= row.lowStockThreshold,
                ).length
              }
            </b>
            <small>Itens para repor</small>
          </div>
          <div>
            <b>{data.kits.filter((row) => row.active).length}</b>
            <small>Kits publicados</small>
          </div>
        </section>
        <section className="admin-section" id="reservas">
          <div className="admin-section-title">
            <div>
              <div className="eyebrow">PEDIDOS DOS CLIENTES</div>
              <h2>Solicitações e reservas</h2>
              <small>
                Pedidos sem estoque aparecem como indisponíveis. Edite ou retire
                itens de qualquer pedido em andamento; o estoque e os valores
                são recalculados. Avisos abrem uma conversa individual pronta no
                WhatsApp.
              </small>
            </div>
          </div>
          <div className="booking-filters">
            <input
              type="search"
              placeholder="Buscar cliente, telefone, e-mail ou kit"
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
            />
            <select
              aria-label="Filtrar pedidos por etapa"
              value={bookingStatusFilter}
              onChange={(e) => setBookingStatusFilter(e.target.value)}
            >
              <option value="all">Todas as etapas</option>
              <option value="awaiting_contact">Aguardando contato</option>
              <option value="awaiting_deposit">Aguardando sinal</option>
              <option value="confirmed">Confirmadas</option>
              <option value="picked_up">Retiradas</option>
              <option value="returned">Devolvidas</option>
              <option value="cancelled">Canceladas</option>
              <option value="unavailable">Indisponíveis</option>
            </select>
            <select
              aria-label="Filtrar pedidos por data da festa"
              value={bookingDateFilter}
              onChange={(e) => setBookingDateFilter(e.target.value)}
            >
              <option value="all">Todas as datas</option>
              <option value="upcoming">Festas futuras</option>
              <option value="past">Festas passadas</option>
            </select>
            <span>
              {filteredBookings.length} pedido
              {filteredBookings.length === 1 ? "" : "s"}
            </span>
          </div>
          {filteredBookings.length === 0 ? (
            <p className="admin-empty">
              {data.bookings.length === 0
                ? "Nenhum pedido por enquanto."
                : "Nenhum pedido corresponde aos filtros."}
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Kit / adicionais</th>
                    <th>Festa / devolução</th>
                    <th>Total / sinal</th>
                    <th>Etapa</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((row) => (
                    <tr key={row._id}>
                      <td>
                        {row.customerName}
                        <small>
                          {row.email}
                          <br />
                          {row.phone}
                        </small>
                      </td>
                      <td>
                        {row.kit?.name}
                        <small>
                          {(row.customInventory ?? [])
                            .map(
                              (part: Row) =>
                                `${part.name ?? part.itemId?.name ?? "Peça"}${part.color ? " · " + part.color : ""}${part.size ? " · " + part.size : ""} × ${part.quantity}`,
                            )
                            .join(" · ")}
                          {row.customInventory?.length ? " · " : ""}
                          {(row.removedInventory ?? []).length
                            ? "Peças retiradas: " +
                              row.removedInventory
                                .map(
                                  (part: Row) =>
                                    `${part.itemId?.name ?? "Peça"} × ${part.quantity}`,
                                )
                                .join(", ") +
                              " · "
                            : ""}
                          {(row.extras ?? [])
                            .map(
                              (extra: Row) =>
                                `${extra.item?.name ?? "Adicional"}${(extra.selectedOptions ?? []).length ? ": " + extra.selectedOptions.map((option: Row) => `${option.groupName}: ${option.optionName}`).join(", ") : ""}`,
                            )
                            .join(" · ")}
                        </small>
                        <BookingItemsEditor
                          key={`${row._id}-${row.status}-${row.unavailableItemId ?? ""}`}
                          booking={row}
                          items={data.items}
                          onSave={update}
                        />
                      </td>
                      <td>
                        {dateLabel(row.eventDate)}
                        <small>Data de devolução</small>
                        <input
                          key={`${row._id}-${dateInput(row.returnDate ?? nextDateInput(row.eventDate))}`}
                          className="booking-return-date"
                          aria-label={`Data de devolução de ${row.customerName}`}
                          type="date"
                          min={nextDateInput(row.eventDate)}
                          defaultValue={dateInput(
                            row.returnDate ?? nextDateInput(row.eventDate),
                          )}
                          onBlur={(e) => {
                            const returnDate = e.target.value;
                            if (
                              returnDate &&
                              returnDate !==
                                dateInput(
                                  row.returnDate ??
                                    nextDateInput(row.eventDate),
                                )
                            )
                              void update({
                                type: "booking",
                                id: row._id,
                                returnDate,
                              });
                          }}
                        />
                      </td>
                      <td>
                        {fmt(row.totalCents)}
                        <small>Sinal {fmt(row.depositCents)}</small>
                      </td>
                      <td>
                        <select
                          value={row.status}
                          onChange={(e) =>
                            void update({
                              type: "booking",
                              id: row._id,
                              status: e.target.value,
                            })
                          }
                        >
                          <option value="awaiting_contact">
                            Aguardando contato
                          </option>
                          <option value="awaiting_deposit">
                            Aguardando sinal
                          </option>
                          <option value="confirmed">Confirmada</option>
                          <option value="picked_up">Retirada</option>
                          <option value="returned">Devolvida</option>
                          <option value="cancelled">Cancelada</option>
                          {row.status === "unavailable" && (
                            <option value="unavailable" disabled>
                              Indisponível
                            </option>
                          )}
                        </select>
                      </td>
                      <td>
                        {row.status === "unavailable" ? (
                          <span className="booking-notice-actions">
                            <a
                              href={unavailableWhatsAppUrl({
                                customerName: row.customerName,
                                phone: row.phone,
                                eventDate: row.eventDate,
                                kitName: row.kit?.name ?? "seu kit",
                                itemName:
                                  row.unavailableItemName ||
                                  row.unavailableItemId?.name ||
                                  "item indisponível no estoque",
                                bookingId: row._id,
                              })}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Preparar aviso
                            </a>
                            {row.whatsappNotificationStatus === "sent" ? (
                              <small>
                                Aviso marcado como enviado ·{" "}
                                {row.whatsappNotificationSentAt
                                  ? dateLabel(row.whatsappNotificationSentAt)
                                  : "data não registrada"}
                              </small>
                            ) : (
                              <button
                                type="button"
                                className="toggle"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Confirma que o aviso foi enviado pelo WhatsApp? Esta ação apenas registra o envio; não cancela o pedido.",
                                    )
                                  )
                                    void update({
                                      type: "booking",
                                      id: row._id,
                                      markWhatsAppSent: true,
                                    });
                                }}
                              >
                                Marcar aviso enviado
                              </button>
                            )}
                            <button
                              type="button"
                              className="toggle cancel-booking-action"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Cancelar esta solicitação indisponível? O cancelamento é separado do aviso e não poderá ser desfeito aqui.",
                                  )
                                )
                                  void update({
                                    type: "booking",
                                    id: row._id,
                                    cancelUnavailable: true,
                                  });
                              }}
                            >
                              Cancelar pedido
                            </button>
                          </span>
                        ) : row.whatsappNotificationStatus === "sent" ? (
                          <small>
                            Aviso marcado como enviado ·{" "}
                            {row.whatsappNotificationSentAt
                              ? dateLabel(row.whatsappNotificationSentAt)
                              : "data não registrada"}
                          </small>
                        ) : (
                          <a
                            href={`https://wa.me/${String(row.phone).replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="admin-section admin-inventory-hub" id="inventario">
          <div className="admin-section-title">
            <div>
              <div className="eyebrow">ESTOQUE DA LOJA</div>
              <h2>Inventário organizado</h2>
              <p className="admin-section-help">
                Cadastre cada tipo na sua área. Peças com a mesma categoria
                ficam agrupadas; cor e tamanho aparecem como variações do mesmo
                grupo.
              </p>
            </div>
          </div>
          <details className="admin-create-panel">
            <summary>
              <Plus size={15} /> Cadastrar estrutura, peça ou adicional
            </summary>

            <form
              key={itemFormVersion}
              className="admin-form"
              onSubmit={(event) => submit("item", event)}
            >
              <small className="inventory-form-guidance">
                Cadastre uma linha por combinação real. Reutilize os nomes existentes no seletor e informe tema, cor, tamanho, estoque e foto específicos dessa combinação. A categoria agrupa produtos; o nome diferencia o tipo de produto.
              </small>

              <InventoryValueSelect
                items={data.items}
                field="name"
                label="Selecione um nome existente ou cadastre um novo *"
                placeholder="Nome do produto (ex.: Balão simples)"
                required
              />

              <select
                name="category"
                value={newItemCategory}
                onChange={(event) => setNewItemCategory(event.target.value)}
              >
                <option value="component">
                  Peça que compõe ou personaliza kit
                </option>
                <option value="structure">Estrutura física oculta</option>
                <option value="extra">Adicional para cliente</option>
              </select>

              <InventoryValueSelect
                items={data.items}
                field="family"
                label="Selecione a categoria *"
                placeholder="Nova categoria (ex.: Balões)"
                required
              />

              {newItemCategory === "extra" && (
                <small className="inventory-form-guidance">
                  Para balões, use a categoria “Balões” e nomes diferentes como “Balão simples” e “Balão orgânico”. Cadastre cada cor como um item individual, com sua própria foto, preço e estoque. O mesmo padrão vale para painéis e cilindros: repita o nome e varie cor, tamanho e tema conforme a combinação real.
                </small>
              )}

              {newItemCategory === "structure" && (
                <small className="inventory-form-guidance">
                  A estrutura controla o equipamento físico e não aparece ao
                  cliente. Associe capas ou decorações a ela no cadastro da
                  peça.
                </small>
              )}

              <InventoryValueSelect
                items={data.items}
                field="theme"
                label="Temática (opcional)"
                placeholder="Nova temática (ex.: Homem-Aranha)"
              />

              <InventoryValueSelect
                items={data.items}
                field="color"
                label="Cor (opcional)"
                placeholder="Nova cor"
              />

              <InventoryValueSelect
                items={data.items}
                field="size"
                label="Tamanho (opcional)"
                placeholder="Novo tamanho"
              />

              {newItemCategory === "extra" && (
                <label className="form-label">
                  Preço do adicional (R$)
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    defaultValue="0"
                  />
                </label>
              )}

              {newItemCategory === "component" && (
                <>
                  <input
                    name="customPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Acréscimo ao adicionar ou trocar esta peça (R$)"
                  />

                  <select name="requiresStructureId" defaultValue="">
                    <option value="">Não exige estrutura específica</option>
                    {data.items
                      .filter(
                        (item) =>
                          item.category === "structure" && item.available,
                      )
                      .map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name}
                          {item.size ? ` · ${item.size}` : ""}
                        </option>
                      ))}
                  </select>
                </>
              )}

              <input
                name="totalQuantity"
                type="number"
                min="0"
                placeholder="Quantidade total em estoque"
                required
              />

              <label className="admin-file">
                Foto ilustrativa (opcional)
                <input
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
              </label>

              <button disabled={busy}>
                <Plus size={15} /> Cadastrar item
              </button>
            </form>
          </details>
          {editingItemId &&
            (() => {
              const row = data.items.find((item) => item._id === editingItemId);
              if (!row) return null;
              return (
                <form
                  key={row._id}
                  className="admin-form admin-edit-form"
                  onSubmit={(event) => void saveItemEdit(row._id, event)}
                >
                  <b>Editar: {row.name}</b>

                  <small className="inventory-form-guidance">
                    A edição preserva as referências deste item nos kits. Reutilize os nomes e atributos existentes para evitar duplicatas; cada combinação de tema, cor e tamanho deve ter seu próprio cadastro e foto.
                  </small>

                  <InventoryValueSelect
                    items={data.items}
                    field="name"
                    label="Nome do produto *"
                    placeholder="Nome do produto"
                    initialValue={row.name ?? ""}
                    required
                  />

                  <select name="category" defaultValue={row.category}>
                    <option value="component">Peça de kit</option>
                    <option value="structure">Estrutura interna</option>
                    <option value="extra">Adicional</option>
                  </select>

                  <InventoryValueSelect
                    items={data.items}
                    field="family"
                    label="Selecione a categoria *"
                    placeholder="Nova categoria"
                    initialValue={row.family ?? ""}
                    required
                  />

                  <InventoryValueSelect
                    items={data.items}
                    field="theme"
                    label="Temática (opcional)"
                    placeholder="Nova temática"
                    initialValue={row.theme ?? ""}
                  />

                  <InventoryValueSelect
                    items={data.items}
                    field="color"
                    label="Cor (opcional)"
                    placeholder="Nova cor"
                    initialValue={row.color ?? ""}
                  />

                  <InventoryValueSelect
                    items={data.items}
                    field="size"
                    label="Tamanho (opcional)"
                    placeholder="Novo tamanho"
                    initialValue={row.size ?? ""}
                  />

                  {row.category === "extra" && (
                    <label className="form-label">
                      Preço do adicional (R$)
                      <input
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={(row.priceCents ?? 0) / 100}
                      />
                    </label>
                  )}

                  {row.category === "component" && (
                    <>
                      <input
                        name="customPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={(row.customPriceCents ?? 0) / 100}
                        placeholder="Acréscimo ao adicionar ou trocar esta peça (R$)"
                      />

                      <select
                        name="requiresStructureId"
                        defaultValue={row.requiresStructureId ?? ""}
                      >
                        <option value="">Não exige estrutura</option>
                        {data.items
                          .filter(
                            (item) =>
                              item.category === "structure" &&
                              item.available,
                          )
                          .map((item) => (
                            <option key={item._id} value={item._id}>
                              {item.name}
                              {item.size ? ` · ${item.size}` : ""}
                            </option>
                          ))}
                      </select>
                    </>
                  )}

                  <input
                    name="totalQuantity"
                    type="number"
                    min="0"
                    defaultValue={row.totalQuantity}
                    required
                  />

                  <label className="admin-file">
                    Trocar foto (opcional)
                    <input
                      name="image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                    />
                  </label>

                  <button disabled={busy}>Salvar alterações</button>

                  <button
                    type="button"
                    className="toggle"
                    onClick={() => setEditingItemId("")}
                  >
                    Cancelar
                  </button>
                </form>
              );
            })()}
          <div className="admin-inventory-grid">
            <details className="admin-inventory-group">
              <summary className="admin-subsection-title">
                <div>
                  <h3>Estruturas internas</h3>
                  <small>
                    Equipamentos ocultos para o cliente, com estoque
                    compartilhado entre os kits.
                  </small>
                </div>
                <b>
                  {
                    data.items.filter((row) => row.category === "structure")
                      .length
                  }
                </b>
              </summary>
              {data.items.filter((row) => row.category === "structure")
                .length === 0 ? (
                <p className="admin-empty">Nenhuma estrutura cadastrada.</p>
              ) : (
                <div className="admin-list">
                  {data.items
                    .filter((row) => row.category === "structure")
                    .map((row) => (
                      <div className="admin-list-row" key={row._id}>
                        <span>
                          <b>{row.name}</b>
                          <small>
                            {[row.family, row.color, row.size]
                              .filter(Boolean)
                              .join(" · ") ||
                              "Estrutura sem classificações adicionais"}
                          </small>
                        </span>
                        <label>
                          Estoque{" "}
                          <input
                            type="number"
                            min="0"
                            defaultValue={row.totalQuantity}
                            onBlur={(e) => {
                              const quantity = Number(e.target.value);
                              if (quantity !== row.totalQuantity)
                                void update({
                                  type: "item",
                                  id: row._id,
                                  totalQuantity: quantity,
                                });
                            }}
                          />
                        </label>
                        <button
                          className="toggle"
                          onClick={() => setEditingItemId(row._id)}
                        >
                          Editar
                        </button>
                        <button
                          className={row.available ? "toggle active" : "toggle"}
                          onClick={() =>
                            void update({
                              type: "item",
                              id: row._id,
                              available: !row.available,
                            })
                          }
                        >
                          {row.available ? "Ativa" : "Inativa"}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </details>
            <details className="admin-inventory-group">
              <summary className="admin-subsection-title">
                <div>
                  <h3>Peças dos kits</h3>
                  <small>
                    Cada categoria aparece uma vez; abra para ver cores,
                    tamanhos, fotos e estoque das variações.
                  </small>
                </div>
                <b>
                  {
                    data.items.filter((row) => row.category === "component")
                      .length
                  }
                </b>
              </summary>
              {!data.items.some((row) => row.category === "component") ? (
                <p className="admin-empty">Nenhuma peça cadastrada.</p>
              ) : (
                <div className="admin-family-groups">
                  {[
                    ...new Set(
                      data.items
                        .filter((row) => row.category === "component")
                        .map((row) =>
                          String(row.family || "Peças sem categoria"),
                        ),
                    ),
                  ]
                    .sort((a, b) => a.localeCompare(b, "pt-BR"))
                    .map((family) => {
                      const variants = data.items.filter(
                        (row) =>
                          row.category === "component" &&
                          String(row.family || "Peças sem categoria") ===
                            family,
                      );
                      const total = variants.reduce(
                        (sum, row) => sum + Number(row.totalQuantity || 0),
                        0,
                      );
                      return (
                        <details className="admin-family-card" key={family}>
                          <summary>
                            <span>
                              <b>{family}</b>
                              <small>
                                {variants.length} variação(ões) · {total}{" "}
                                unidade(s) em estoque
                              </small>
                            </span>
                            <span className="admin-family-options">
                              Ver opções
                            </span>
                          </summary>
                          <div className="admin-list">
                            {variants.map((row) => (
                              <div className="admin-list-row" key={row._id}>
                                {row.image && (
                                  <Image
                                    src={row.image}
                                    alt={row.name}
                                    width={42}
                                    height={42}
                                    className="admin-thumb"
                                  />
                                )}
                                <span>
                                  <b>{row.name}</b>
                                  <small>
                                    {[row.theme, row.color, row.size]
                                      .filter(Boolean)
                                      .join(" · ") ||
                                      "Sem cor ou tamanho informado"}
                                    {row.requiresStructureId
                                      ? " · exige estrutura"
                                      : ""}
                                  </small>
                                </span>
                                <label>
                                  Estoque{" "}
                                  <input
                                    type="number"
                                    min="0"
                                    defaultValue={row.totalQuantity}
                                    onBlur={(e) => {
                                      const quantity = Number(e.target.value);
                                      if (quantity !== row.totalQuantity)
                                        void update({
                                          type: "item",
                                          id: row._id,
                                          totalQuantity: quantity,
                                        });
                                    }}
                                  />
                                </label>
                                <button
                                  className="toggle"
                                  onClick={() => setEditingItemId(row._id)}
                                >
                                  Editar
                                </button>
                                <label className="admin-file admin-file-row">
                                  Foto
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) =>
                                      void replaceImage(
                                        "item",
                                        row._id,
                                        e.target.files?.[0],
                                      )
                                    }
                                  />
                                </label>
                                <button
                                  className={
                                    row.available ? "toggle active" : "toggle"
                                  }
                                  onClick={() =>
                                    void update({
                                      type: "item",
                                      id: row._id,
                                      available: !row.available,
                                    })
                                  }
                                >
                                  {row.available ? "Ativa" : "Inativa"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                </div>
              )}
            </details>
            <details className="admin-inventory-group">
              <summary className="admin-subsection-title">
                <div>
                  <h3>Adicionais</h3>
                  <small>
                    Organizados por categoria, com tema, cor, tamanho, foto,
                    preço e estoque próprios para cada adicional.
                  </small>
                </div>
                <b>
                  {data.items.filter((row) => row.category === "extra").length}
                </b>
              </summary>
              {!data.items.some((row) => row.category === "extra") ? (
                <p className="admin-empty">Nenhum adicional cadastrado.</p>
              ) : (
                <div className="admin-family-groups">
                  {[
                    ...new Set(
                      data.items
                        .filter((row) => row.category === "extra")
                        .map((row) => String(row.family || "Sem categoria")),
                    ),
                  ]
                    .sort((a, b) => a.localeCompare(b, "pt-BR"))
                    .map((family) => {
                      const rows = data.items.filter(
                        (row) =>
                          row.category === "extra" &&
                          String(row.family || "Sem categoria") === family,
                      );
                      return (
                        <details className="admin-family-card" key={family}>
                          <summary>
                            <span>
                              <b>{family}</b>
                              <small>{rows.length} adicional(is)</small>
                            </span>
                            <span className="admin-family-options">
                              Ver adicionais
                            </span>
                          </summary>
                          <div className="admin-list">
                            {rows.map((row) => (
                              <div className="admin-list-row" key={row._id}>
                                <span>
                                  <b>{row.name}</b>

                                  <small>
                                    {row.family || "Sem categoria"} ·{" "}
                                    {[row.theme, row.color, row.size]
                                      .filter(Boolean)
                                      .join(" · ") || "Sem variação"} ·{" "}
                                    {fmt(row.priceCents)}
                                  </small>
                                </span>
                                <label>
                                  Estoque{" "}
                                  <input
                                    type="number"
                                    min="0"
                                    defaultValue={row.totalQuantity}
                                    onBlur={(e) => {
                                      const quantity = Number(e.target.value);
                                      if (quantity !== row.totalQuantity)
                                        void update({
                                          type: "item",
                                          id: row._id,
                                          totalQuantity: quantity,
                                        });
                                    }}
                                  />
                                </label>
                                <button
                                  className="toggle"
                                  onClick={() => setEditingItemId(row._id)}
                                >
                                  Editar
                                </button>
                                <button
                                  className={
                                    row.available ? "toggle active" : "toggle"
                                  }
                                  onClick={() =>
                                    void update({
                                      type: "item",
                                      id: row._id,
                                      available: !row.available,
                                    })
                                  }
                                >
                                  {row.available ? "Ativo" : "Inativo"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                </div>
              )}
            </details>
          </div>
        </section>
        <section className="admin-section admin-kits-section" id="kits">
          <div className="admin-section-title">
            <div>
              <div className="eyebrow">CATÁLOGO</div>
              <h2>Kits pegue e monte</h2>
              <p className="admin-section-help">
                Cadastre e organize aqui os kits prontos. O cliente pode personalizar
                as peças ao solicitar a reserva.
              </p>
            </div>
            <span className="admin-count-pill">{data.kits.length} kit(s)</span>
          </div>
          <details className="admin-create-panel">
            <summary>
              <Plus size={15} /> Criar um kit
            </summary>
            <form
              key={kitFormVersion}
              className="admin-form admin-form-kit"
              onSubmit={(e) => submit("kit", e)}
            >
              <input name="name" placeholder="Nome do kit" required />
              <input
                name="slug"
                placeholder="Identificador URL (ex.: jardim-encantado)"
                required
              />
              <input name="theme" placeholder="Descrição curta do tema" />
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="Preço total do kit por evento (R$)"
                required
              />
              <small>
                Todos os kits cadastrados aqui são kits prontos. O cliente pode
                personalizar a composição ao fazer o pedido.
              </small>
              <label className="admin-file">
                Foto do kit (opcional)
                <input
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
              </label>
              <KitCompositionPicker
                key={`create-${kitFormVersion}`}
                items={data.items.filter(
                  (row) => row.category === "component" && row.available,
                )}
              />
              <label className="admin-check">
                <input type="checkbox" name="featured" /> Destacar na vitrine
              </label>
              <button disabled={busy}>
                <Plus size={15} /> Criar kit
              </button>
            </form>
          </details>
          {editingKitId &&
            (() => {
              const row = data.kits.find((kit) => kit._id === editingKitId);
              if (!row) return null;
              return (
                <form
                  key={`edit-${row._id}`}
                  className="admin-form admin-form-kit admin-edit-form"
                  onSubmit={(e) => void saveKitEdit(row._id, e)}
                >
                  <b>Editar kit: {row.name}</b>
                  <InventoryValueSelect
                    items={data.items}
                    field="name"
                    label="Nome do produto *"
                    placeholder="Nome do produto"
                    initialValue={row.name ?? ""}
                    required
                  />
                  <input
                    name="slug"
                    defaultValue={row.slug}
                    placeholder="Identificador URL"
                    required
                  />
                  <input
                    name="theme"
                    defaultValue={row.theme}
                    placeholder="Tema"
                  />
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={row.priceCents / 100}
                    required
                  />
                  <small>
                    Kit pronto: o cliente pode personalizar as peças no pedido.
                    As estruturas necessárias são reservadas automaticamente.
                  </small>
                  <label className="admin-file">
                    Trocar foto (opcional)
                    <input
                      name="image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                    />
                  </label>
                  <KitCompositionPicker
                    key={`edit-${row._id}`}
                    items={data.items.filter(
                      (item) => item.category === "component" && item.available,
                    )}
                    initialInventory={(row.inventory ?? []).filter(
                      (part: Row) => part.itemId?.category === "component",
                    )}
                  />
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      name="featured"
                      defaultChecked={row.featured}
                    />{" "}
                    Destacar na vitrine
                  </label>
                  <button disabled={busy}>Salvar alterações do kit</button>
                  <button
                    type="button"
                    className="toggle"
                    onClick={() => setEditingKitId("")}
                  >
                    Cancelar
                  </button>
                </form>
              );
            })()}
          {data.kits.length === 0 ? (
            <p className="admin-empty">Nenhum kit cadastrado.</p>
          ) : (
            <div className="admin-kit-grid">
              {data.kits.map((row) => (
                <article className="admin-kit-card" key={row._id}>
                  {row.image && (
                    <Image
                      src={row.image}
                      alt={row.name}
                      width={72}
                      height={72}
                      className="admin-thumb"
                    />
                  )}
                  <div className="admin-kit-card-info">
                    <b>{row.name}</b>
                    <small>
                      {fmt(row.priceCents)} por evento · Kit pronto, personalizável ·{" "}
                      {row.inventory?.length ?? 0} item(ns) na composição
                    </small>
                  </div>
                  <div className="admin-kit-card-actions">
                    <button
                      className="toggle"
                      onClick={() => setEditingKitId(row._id)}
                    >
                      Editar composição
                    </button>
                    <label className="admin-file admin-file-row">
                      Foto
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) =>
                          void replaceImage("kit", row._id, e.target.files?.[0])
                        }
                      />
                    </label>
                    <button
                      className={row.active ? "toggle active" : "toggle"}
                      onClick={() =>
                        void update({
                          type: "kit",
                          id: row._id,
                          active: !row.active,
                        })
                      }
                    >
                      {row.active ? "Publicado" : "Oculto"}
                    </button>
                  </div>
                  <details className="admin-kit-composition">
                    <summary>Ver composição e estoque</summary>
                    <div>
                      {(row.inventory ?? []).map((part: Row) => (
                        <small key={part.itemId?._id ?? part.itemId}>
                          {part.itemId?.name ?? "Peça removida"}
                          {part.itemId?.color ? " · " + part.itemId.color : ""}
                          {part.itemId?.size
                            ? " · " + part.itemId.size
                            : ""} × {part.quantity}
                        </small>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>{" "}
        <div className="admin-two-col">
          <section className="admin-section" id="cupons">
            <div className="admin-section-title">
              <div>
                <div className="eyebrow">PROMOÇÕES</div>
                <h2>Cupons</h2>
              </div>
            </div>
            <form className="admin-form" onSubmit={(e) => submit("coupon", e)}>
              <input name="code" placeholder="Código do cupom" required />
              <input
                name="discountPercent"
                type="number"
                min="1"
                max="100"
                placeholder="Desconto (%)"
                required
              />
              <input
                name="maxUses"
                type="number"
                min="1"
                placeholder="Limite de usos"
                required
              />
              <button disabled={busy}>
                <Plus size={15} /> Criar cupom
              </button>
            </form>
            {data.coupons.map((row) => (
              <div className="admin-list-row" key={row._id}>
                <span>
                  <b>{row.code}</b>
                  <small>
                    {row.discountPercent}% · {row.uses}/{row.maxUses} usos
                  </small>
                </span>
                <button
                  className={row.active ? "toggle active" : "toggle"}
                  onClick={() =>
                    void update({
                      type: "coupon",
                      id: row._id,
                      active: !row.active,
                    })
                  }
                >
                  {row.active ? "Ativo" : "Pausado"}
                </button>
              </div>
            ))}
          </section>
          <section className="admin-section" id="divulgacoes">
            <div className="admin-section-title">
              <div>
                <div className="eyebrow">VITRINE DA LOJA</div>
                <h2>Divulgações</h2>
              </div>
            </div>
            <form
              className="admin-form"
              onSubmit={(e) => submit("promotion", e)}
            >
              <input name="title" placeholder="Título da divulgação" required />
              <input name="subtitle" placeholder="Texto de apoio" />
              <button disabled={busy}>
                <Plus size={15} /> Publicar na home
              </button>
            </form>
            {data.promotions.map((row) => (
              <div className="admin-list-row" key={row._id}>
                <span>
                  <b>{row.title}</b>
                  <small>{row.subtitle}</small>
                </span>
                <button
                  className={row.active ? "toggle active" : "toggle"}
                  onClick={() =>
                    void update({
                      type: "promotion",
                      id: row._id,
                      active: !row.active,
                    })
                  }
                >
                  {row.active ? "Na home" : "Oculta"}
                </button>
              </div>
            ))}
          </section>
        </div>
        <p className="admin-note">
          A devolução é prevista para o dia seguinte à festa, mas a loja pode
          ajustar a data nesta tabela. Quando a reserva já estiver ativa, a
          alteração só será aceita se houver estoque para cobrir todo o período.
        </p>
      </div>
    </main>
  );
}
