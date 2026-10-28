"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Heart,
  Menu,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { FaInstagram } from "react-icons/fa";
import type { StoreExtra, StoreKit, StorePiece } from "@/lib/storefront-data";

type Kit = StoreKit;
type StoreExtraDisplay = StoreExtra & {
  family?: string;
  theme?: string;
  color?: string;
  size?: string;
};
type CustomPiece = { itemId: string; quantity: number };
type SelectedExtra = { id: string; options: Record<string, string> };
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ownerWhatsapp = (
  process.env.NEXT_PUBLIC_STORE_WHATSAPP || "5592993339848"
).replace(/\D/g, "");
const formatOrderDate = (value: string) =>
  new Date(`${value}T12:00:00.000Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
  });

function PieceCategorySelector({
  family,
  pieces,
  added,
  included,
  removed,
  onQuantity,
}: {
  family: string;
  pieces: StorePiece[];
  added: CustomPiece[];
  included: StorePiece[];
  removed: CustomPiece[];
  onQuantity: (piece: StorePiece, quantity: number) => void;
}) {
  const [selectedId, setSelectedId] = useState(pieces[0]?.id ?? "");
  useEffect(() => {
    if (!pieces.some((piece) => piece.id === selectedId))
      setSelectedId(pieces[0]?.id ?? "");
  }, [pieces, selectedId]);
  const selected = pieces.find((piece) => piece.id === selectedId) ?? pieces[0];
  if (!selected) return null;
  const attributeDefinitions = [
    { key: "name" as const, label: "Produto" },
    { key: "theme" as const, label: "Tema" },
    { key: "color" as const, label: "Cor" },
    { key: "size" as const, label: "Tamanho" },
  ];
  // Cada atributo lista os valores cadastrados dentro desta categoria. Ao trocar
  // um valor, a seleção procura preservar os demais; se a combinação não existir,
  // muda para uma combinação válida e atualiza a foto/estoque/preço.
  const attributes = attributeDefinitions
    .map((attribute) => ({
      ...attribute,
      options: [
        ...new Set(pieces.map((piece) => piece[attribute.key]).filter(Boolean)),
      ].sort((a, b) =>
        String(a).localeCompare(String(b), "pt-BR", { numeric: true }),
      ),
    }))
    .filter((attribute) => attribute.options.length > 1);
  const changeAttribute = (
    key: "name" | "theme" | "color" | "size",
    value: string,
  ) => {
    const keys = ["name", "theme", "color", "size"] as const;
    const matches = pieces.filter((piece) => piece[key] === value);
    const match =
      matches.find((piece) =>
        keys
          .filter((other) => other !== key)
          .every(
            (other) => !selected[other] || piece[other] === selected[other],
          ),
      ) ?? matches[0];
    if (match) setSelectedId(match.id);
  };
  const addedQuantity =
    added.find((entry) => entry.itemId === selected.id)?.quantity ?? 0;
  const includedQuantity =
    included.find((piece) => piece.id === selected.id)?.quantity ?? 0;
  const removedQuantity =
    removed.find((entry) => entry.itemId === selected.id)?.quantity ?? 0;
  const remainingStock = Math.max(
    0,
    selected.stock - includedQuantity + removedQuantity,
  );
  const displayName = [
    selected.name,
    selected.theme,
    selected.color,
    selected.size,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="piece-category-selector">
      <h4>{family}</h4>
      {attributes.length > 0 && (
        <div className="piece-variant-selects">
          {attributes.map((attribute) => (
            <label key={attribute.key}>
              {attribute.label}
              <select
                value={selected[attribute.key]}
                onChange={(event) =>
                  changeAttribute(attribute.key, event.target.value)
                }
              >
                {attribute.options.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <div className="piece-variant-preview">
        {selected.image ? (
          <Image
            src={selected.image}
            alt={`${family} — ${displayName}`}
            width={112}
            height={96}
            className="extra-photo"
          />
        ) : (
          <span className="custom-piece-placeholder">✳</span>
        )}
        <span>
          <b>{displayName}</b>
          <small>
            {includedQuantity
              ? ` · ${includedQuantity - removedQuantity} já incluída(s)`
              : ""}
          </small>
          <small>
            {selected.price
              ? `+ ${money(selected.price)} por unidade`
              : "Sem acréscimo"}
          </small>
        </span>
      </div>
      <div className="custom-piece-quantity">
        <button
          type="button"
          aria-label={`Remover uma unidade de ${displayName}`}
          disabled={!addedQuantity}
          onClick={() => onQuantity(selected, addedQuantity - 1)}
        >
          −
        </button>
        <b>{addedQuantity}</b>
        <button
          type="button"
          aria-label={`Adicionar uma unidade de ${displayName}`}
          disabled={addedQuantity >= remainingStock}
          onClick={() => onQuantity(selected, addedQuantity + 1)}
        >
          +
        </button>
      </div>
    </section>
  );
}

export default function Storefront({
  kits,
  extras,
  connected,
  promotions = [],
}: {
  kits: StoreKit[];
  extras: StoreExtraDisplay[];
  connected: boolean;
  promotions?: Array<{
    title: string;
    subtitle: string;
    image: string;
    href: string;
  }>;
}) {
  const [cart, setCart] = useState<{
    kit: Kit;
    extras: SelectedExtra[];
    customInventory: CustomPiece[];
    removedInventory: CustomPiece[];
  } | null>(null);
  const [selected, setSelected] = useState<SelectedExtra[]>([]);
  const [customInventory, setCustomInventory] = useState<CustomPiece[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [date, setDate] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    totalCents: number;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [whatsappOrderLink, setWhatsappOrderLink] = useState("");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityKitId, setAvailabilityKitId] = useState("");
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<{
    available: boolean;
    message: string;
  } | null>(null);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("prilulu-favorites") ?? "[]",
      );
      if (Array.isArray(saved))
        setFavoriteIds(
          saved.filter((id): id is string => typeof id === "string"),
        );
    } catch {
      setFavoriteIds([]);
    } finally {
      setFavoritesLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (favoritesLoaded)
      localStorage.setItem("prilulu-favorites", JSON.stringify(favoriteIds));
  }, [favoriteIds, favoritesLoaded]);
  const subtotal = useMemo(
    () =>
      cart
        ? cart.kit.price +
          (cart.kit.customizable || cart.kit.allowCustomerEdits
            ? cart.customInventory.reduce(
                (sum, part) =>
                  sum +
                  (cart.kit.pieces?.find((piece) => piece.id === part.itemId)
                    ?.price ?? 0) *
                    part.quantity,
                0,
              )
            : 0) +
          cart.extras.reduce((sum, selection) => {
            const extra = extras.find((entry) => entry.id === selection.id);
            if (!extra) return sum;
            return sum + extra.price;
          }, 0)
        : 0,
    [cart, extras],
  );
  // Todo pedido tem valor mínimo de R$ 80.
  const total = cart ? Math.max(80, subtotal) : 0;
  const promoTotal = appliedCoupon ? appliedCoupon.totalCents / 100 : total;
  const availabilityKit = kits.find((kit) => kit.id === availabilityKitId);
  const customPieceGroups = [
    ...new Set(
      (cart?.kit.pieces ?? []).map((piece) => piece.family || "Outras peças"),
    ),
  ]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((family) => ({
      family,
      pieces: (cart?.kit.pieces ?? []).filter(
        (piece) => (piece.family || "Outras peças") === family,
      ),
    }));
  const includedPieceFamilies = [
    ...new Set(
      (cart?.kit.includedPieces ?? []).map(
        (piece) => piece.family || "Outras peças",
      ),
    ),
  ];
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const addKit = (kit: Kit) => {
    setCart({ kit, extras: [], customInventory: [], removedInventory: [] });
    setSelected([]);
    setCustomInventory([]);
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" });
  };
  const applyCoupon = async () => {
    if (!coupon.trim()) {
      setCouponMessage("Digite seu cupom.");
      return;
    }
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: coupon,
          subtotalCents: Math.round(total * 100),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAppliedCoupon(null);
        setCouponMessage(result.error ?? "Cupom não disponível.");
        return;
      }
      setAppliedCoupon({ code: result.code, totalCents: result.totalCents });
      setCouponMessage(
        `Cupom ${result.code} aplicado. Desconto de ${money(result.discountCents / 100)}.`,
      );
    } catch {
      setCouponMessage("Não foi possível validar o cupom agora.");
    }
  };
  const checkAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!availabilityKitId || !availabilityDate) {
      setAvailabilityResult({
        available: false,
        message: "Escolha um kit e a data da festa.",
      });
      return;
    }
    setAvailabilityBusy(true);
    setAvailabilityResult(null);
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitId: availabilityKitId,
          date: availabilityDate,
        }),
      });
      const result = await response.json();
      setAvailabilityResult({
        available: response.ok && Boolean(result.available),
        message:
          result.message ??
          result.error ??
          "Não foi possível consultar essa data.",
      });
    } catch {
      setAvailabilityResult({
        available: false,
        message: "Não foi possível consultar o estoque agora. Tente novamente.",
      });
    } finally {
      setAvailabilityBusy(false);
    }
  };
  const finalize = async () => {
    setWhatsappOrderLink("");
    if (!date) {
      setNotice(
        "Escolha a data da sua festa para consultar a disponibilidade.",
      );
      return;
    }
    if (
      !customer.name.trim() ||
      !customer.email.trim() ||
      !customer.phone.trim()
    ) {
      setNotice("Preencha seu nome, e-mail e telefone para enviar o pedido.");
      return;
    }
    if (cart?.kit.customizable && cart.customInventory.length === 0) {
      setNotice("Escolha pelo menos uma peça para montar seu kit.");
      return;
    }
    const whatsappWindow = window.open("about:blank", "_blank");
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitId: cart?.kit.id,
          date,
          customInventory: cart?.customInventory ?? [],
          removedInventory: cart?.removedInventory ?? [],
        }),
      });
      if (response.ok) {
        const result = await response.json();
        if (!result.available) {
          whatsappWindow?.close();
          setNotice(result.message);
          return;
        }
        const booking = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...customer,
            kitId: cart?.kit.id,
            date,
            customInventory: cart?.customInventory ?? [],
            removedInventory: cart?.removedInventory ?? [],
            extras: selected,
            coupon: appliedCoupon?.code,
          }),
        });
        const bookingResult = await booking.json();
        if (booking.ok && cart) {
          const lines = [
            "🎉 *Nova solicitação de reserva — Prilulu Festas*",
            `Pedido: ${bookingResult.bookingId}`,
            `Cliente: ${customer.name.trim()}`,
            `Telefone: ${customer.phone.trim()}`,
            `E-mail: ${customer.email.trim()}`,
            `Kit: ${cart.kit.name}`,
            `Data da festa: ${formatOrderDate(date)}`,
            `Devolução prevista: ${formatOrderDate(bookingResult.returnDate)}`,
          ];
          const includedLines = (cart.kit.includedPieces ?? [])
            .map((piece) => {
              const removedQuantity =
                cart.removedInventory.find((entry) => entry.itemId === piece.id)
                  ?.quantity ?? 0;
              const quantity = Math.max(
                0,
                (piece.quantity ?? 1) - removedQuantity,
              );
              const variant = [piece.theme, piece.color, piece.size]
                .filter(Boolean)
                .join(" · ");
              return quantity
                ? `• ${piece.family}: ${variant || piece.name} × ${quantity}`
                : "";
            })
            .filter(Boolean);
          const addedLines = cart.customInventory
            .map((part) => {
              const piece = cart.kit.pieces?.find(
                (entry) => entry.id === part.itemId,
              );
              if (!piece) return "";
              const variant = [piece.theme, piece.color, piece.size]
                .filter(Boolean)
                .join(" · ");
              return `• ${piece.family}: ${variant || piece.name} × ${part.quantity}${piece.price ? ` (+ ${money(piece.price * part.quantity)})` : ""}`;
            })
            .filter(Boolean);
          const removedLines = cart.removedInventory
            .map((part) => {
              const piece = cart.kit.includedPieces?.find(
                (entry) => entry.id === part.itemId,
              );
              return piece
                ? `• ${piece.family}: ${[piece.theme, piece.color, piece.size].filter(Boolean).join(" · ") || piece.name} × ${part.quantity} (retirada)`
                : "";
            })
            .filter(Boolean);
          const extraLines = selected
            .map((selection) => {
              const extra = extras.find((entry) => entry.id === selection.id);
              return extra
                ? `• ${extra.family || "Adicionais"}: ${extra.name} — ${money(extra.price)}`
                : "";
            })
            .filter(Boolean);
          if (includedLines.length)
            lines.push("Peças incluídas no kit:", ...includedLines);
          if (addedLines.length)
            lines.push("Peças adicionadas:", ...addedLines);
          if (removedLines.length)
            lines.push("Peças retiradas do kit:", ...removedLines);
          if (extraLines.length) lines.push("Adicionais:", ...extraLines);
          if (appliedCoupon) lines.push(`Cupom: ${appliedCoupon.code}`);
          lines.push(
            `Total: ${money(bookingResult.totalCents / 100)}`,
            `Sinal de 50%: ${money(bookingResult.depositCents / 100)}`,
            `Restante: ${money((bookingResult.totalCents - bookingResult.depositCents) / 100)} (retirada ou conforme combinado)`,
            "Aguardando conferência e confirmação da loja.",
          );
          const whatsappUrl = `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
          setWhatsappOrderLink(whatsappUrl);
          if (whatsappWindow) whatsappWindow.location.href = whatsappUrl;
        } else {
          whatsappWindow?.close();
        }
        setNotice(
          booking.ok
            ? `${bookingResult.message} Pedido ${bookingResult.bookingId}. Total ${money(bookingResult.totalCents / 100)}; sinal de ${money(bookingResult.depositCents / 100)}. Para iniciar o atendimento, envie a mensagem pronta que abriu no WhatsApp tocando em Enviar.`
            : bookingResult.error,
        );
      } else {
        whatsappWindow?.close();
        const result = await response.json().catch(() => null);
        setNotice(
          result?.message ??
            result?.error ??
            "Não foi possível confirmar essa data agora.",
        );
      }
    } catch {
      whatsappWindow?.close();
      setNotice(
        "Não foi possível consultar o estoque agora. Tente novamente em instantes.",
      );
    }
  };
  return (
    <div className="site-shell">
      <div className="announcement">
        <Sparkles size={14} /> FESTA bonita, sem complicação <span>•</span>{" "}
        <b>{promotions[0]?.title ?? "Pegue, monte e celebre"}</b>
      </div>
      <header className="header">
        <button
          className="icon-button mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menu"
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <a href="#inicio" className="brand">
          <Image
            src="/images/prilulu.png"
            width={132}
            height={76}
            alt="Prilulu Festas — pegue e monte"
            priority
          />
        </a>
        <nav className={menuOpen ? "nav nav-open" : "nav"}>
          <a href="#catalogo" onClick={() => setMenuOpen(false)}>
            Kits para festa
          </a>
          <a href="#como-funciona" onClick={() => setMenuOpen(false)}>
            Como funciona
          </a>
          <a href="#sobre" onClick={() => setMenuOpen(false)}>
            Sobre a Prilulu
          </a>
          <a href="#duvidas" onClick={() => setMenuOpen(false)}>
            Dúvidas
          </a>
        </nav>
        <button
          className="bag-button"
          onClick={() =>
            document
              .getElementById("catalogo")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <ShoppingBag size={18} />
          <span>Sua festa</span>
          {cart && <i>1</i>}
        </button>
      </header>
      <main>
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-star">✳</span> SUA FESTA, DO SEU JEITINHO
            </div>
            <h1>
              Momentos lindos
              <br />
              começam com <em>Prilulu.</em>
            </h1>
            <p>
              Kits pegue e monte cheios de encanto para você celebrar pertinho
              de quem ama. A gente prepara tudo. Você cria a memória.
            </p>
            <div className="hero-actions">
              <a className="button button-pink" href="#catalogo">
                Encontrar meu kit <ArrowRight size={17} />
              </a>
              <div className="social-proof">
                <div className="avatar-stack">
                  <span>👩🏽</span>
                  <span>👩🏻</span>
                  <span>👩🏼</span>
                </div>
                <small>
                  <b>Cada detalhe importa</b>
                  <br />
                  feito com amor e cuidado
                </small>
              </div>
            </div>
            <a href="#como-funciona" className="scroll-note">
              <ArrowDown size={13} /> DESLIZE PARA DESCOBRIR
            </a>
          </div>
          <div className="hero-art hero-photo">
            <Image
              src="/images/hero-pega-monte.png"
              alt="Mesa de festa pegue e monte em rosa, coral e amarelo, com balões, bolo e suportes decorativos"
              fill
              priority
              sizes="(max-width: 620px) 90vw, 42vw"
            />
            <div className="hero-photo-tag">
              <Sparkles size={15} /> Kit pronto para celebrar
            </div>
          </div>
          <div className="flower flower-one">✿</div>
          <div className="flower flower-two">✳</div>
        </section>
        <section className="trust-row">
          <div>
            <ShieldCheck />
            <span>
              <b>Reserva confirmada</b>
              <small>Data verificada antes do sinal</small>
            </span>
          </div>
          <div>
            <Sparkles />
            <span>
              <b>Tudo pronto</b>
              <small>Kit higienizado e organizado</small>
            </span>
          </div>
          <div>
            <Truck />
            <span>
              <b>Pegue e monte</b>
              <small>Retirada fácil e combinada</small>
            </span>
          </div>
          <div>
            <Heart />
            <span>
              <b>Feito com carinho</b>
              <small>Para criar boas lembranças</small>
            </span>
          </div>
        </section>
        <section className="catalog section-wrap" id="catalogo">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                NOSSA VITRINE <span>✳</span>
              </div>
              <h2>
                Uma festa linda
                <br />
                <em>começa por aqui.</em>
              </h2>
            </div>
            <p>
              Escolha o tema que combina com sua comemoração. Os kits são
              montados com carinho e a disponibilidade é conferida para a data
              da sua festa.
            </p>
          </div>
          <div className="product-grid">
            {!connected ? (
              <p className="empty-catalog">
                Catálogo indisponível no momento. Tente novamente mais tarde.
              </p>
            ) : kits.length === 0 ? (
              <p className="empty-catalog">
                Estamos preparando os kits da loja. Volte em breve para escolher
                sua festa.
              </p>
            ) : (
              kits.map((kit, i) => (
                <article className="product-card" key={kit.id}>
                  <div
                    className="product-art"
                    style={{ background: kit.color }}
                  >
                    <div className="art-sun" />
                    {kit.image ? (
                      <Image
                        src={kit.image}
                        alt={kit.name}
                        fill
                        sizes="(max-width: 620px) 50vw, 25vw"
                        className="product-photo"
                      />
                    ) : (
                      <span className="art-emoji">{kit.art}</span>
                    )}
                    <span className="art-number">0{i + 1}</span>
                    {kit.badge && <span className="badge">{kit.badge}</span>}
                    <button
                      className="heart-button"
                      aria-label={
                        favoriteIds.includes(kit.id)
                          ? `Remover ${kit.name} dos favoritos`
                          : `Favoritar ${kit.name}`
                      }
                      aria-pressed={favoriteIds.includes(kit.id)}
                      onClick={() =>
                        setFavoriteIds((current) =>
                          current.includes(kit.id)
                            ? current.filter((id) => id !== kit.id)
                            : [...current, kit.id],
                        )
                      }
                    >
                      <Heart
                        size={18}
                        fill={
                          favoriteIds.includes(kit.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                  <div className="product-info">
                    <div>
                      <small>{kit.theme}</small>
                      <h3>{kit.name}</h3>
                    </div>
                    <div className="product-price">
                      <b>{money(kit.price)}</b>
                      <small>por evento · personalize se quiser</small>
                    </div>
                  </div>
                  <div className="product-foot">
                    <span className="stock">
                      <i /> Consulte disponibilidade
                    </span>
                    <button className="text-link" onClick={() => addKit(kit)}>
                      Personalizar kit <ArrowRight size={15} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="availability-note">
            <Clock3 size={16} />
            <span>
              <b>Vai comemorar em breve?</b> Consulte a data antes de reservar.
              A gente verifica o estoque e confirma com você.
            </span>
            <button
              type="button"
              className="availability-consult-button"
              aria-expanded={availabilityOpen}
              aria-controls="consulta-data"
              onClick={() => setAvailabilityOpen((open) => !open)}
            >
              Consultar data <ArrowRight size={15} />
            </button>
          </div>
          {availabilityOpen && (
            <form
              className="availability-checker"
              id="consulta-data"
              onSubmit={checkAvailability}
            >
              <div>
                <b>Consulte a disponibilidade do seu kit</b>
                <small>
                  A devolução fica prevista para o dia seguinte; a loja confirma
                  ou ajusta.
                </small>
              </div>
              <label>
                Kit
                <select
                  required
                  value={availabilityKitId}
                  onChange={(event) => {
                    setAvailabilityKitId(event.target.value);
                    setAvailabilityResult(null);
                  }}
                >
                  <option value="">Escolha um kit</option>
                  {kits.map((kit) => (
                    <option key={kit.id} value={kit.id}>
                      {kit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data da festa
                <input
                  required
                  type="date"
                  min={today}
                  value={availabilityDate}
                  onChange={(event) => {
                    setAvailabilityDate(event.target.value);
                    setAvailabilityResult(null);
                  }}
                />
              </label>
              <button
                className="button button-pink"
                type="submit"
                disabled={!connected || !kits.length || availabilityBusy}
              >
                {availabilityBusy ? "Consultando…" : "Verificar data"}
              </button>
              {availabilityResult && (
                <div
                  className={
                    availabilityResult.available
                      ? "availability-result available"
                      : "availability-result unavailable"
                  }
                  role="status"
                >
                  <span>{availabilityResult.message}</span>
                  {availabilityResult.available && availabilityKit && (
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => {
                        setCart({
                          kit: availabilityKit,
                          extras: [],
                          customInventory: [],
                          removedInventory: [],
                        });
                        setSelected([]);
                        setCustomInventory([]);
                        setDate(availabilityDate);
                        setNotice("");
                        setCoupon("");
                        setAppliedCoupon(null);
                        setCouponMessage("");
                      }}
                    >
                      Solicitar este kit <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              )}
              {!connected && (
                <small className="availability-result unavailable">
                  O catálogo está indisponível agora. Tente novamente mais
                  tarde.
                </small>
              )}
            </form>
          )}
        </section>
        <section className="how section-wrap" id="como-funciona">
          <div className="how-intro">
            <div className="eyebrow">
              SEM COMPLICAÇÃO <span>✳</span>
            </div>
            <h2>
              Você escolhe.
              <br />
              <em>A gente facilita.</em>
            </h2>
            <p>Uma comemoração especial pode ser simples. Olha só:</p>
            <a className="text-link" href="#catalogo">
              Escolher um kit <ArrowRight size={15} />
            </a>
          </div>
          <div className="steps">
            <div className="step">
              <span>01</span>
              <div className="step-icon">🎈</div>
              <h3>Escolha seu tema</h3>
              <p>
                Encontre um kit pronto e acrescente os detalhes que deixam tudo
                com a sua cara.
              </p>
            </div>
            <div className="step">
              <span>02</span>
              <div className="step-icon">📅</div>
              <h3>Consulte sua data</h3>
              <p>
                Conferimos a agenda e as peças do kit antes de confirmar a sua
                reserva.
              </p>
            </div>
            <div className="step">
              <span>03</span>
              <div className="step-icon">✨</div>
              <h3>Monte e celebre</h3>
              <p>
                Retire tudo combinadinho, monte no seu espaço e aproveite cada
                momento.
              </p>
            </div>
          </div>
        </section>
        <section className="payment-band">
          <div>
            <div className="eyebrow">PAGAMENTO TRANQUILO</div>
            <h2>
              Do seu jeito,
              <br />
              <em>sem surpresas.</em>
            </h2>
            <p>
              Você envia o pedido e a loja confirma a disponibilidade. Depois,
              combina o sinal de metade do valor; o restante fica para a
              retirada do kit.
            </p>
          </div>
          <div className="payment-card">
            <div className="payment-line">
              <span>Na reserva</span>
              <b>50%</b>
            </div>
            <div className="payment-progress">
              <i />
            </div>
            <div className="payment-line">
              <span>Na retirada do kit</span>
              <b>50%</b>
            </div>
            <div className="payment-divider" />
            <div className="mp-row">
              <span className="mp-mark">PIX</span>
              <span>
                <b>Sinal para reservar</b>
                <small>Pagamento combinado diretamente com a loja</small>
              </span>
              <ChevronDown size={17} />
            </div>
            <small className="payment-fine">
              A equipe confirma disponibilidade e dados de pagamento com você.
            </small>
          </div>
        </section>
        <section className="about section-wrap" id="sobre">
          <div className="about-image">
            <div className="about-card">
              <span>♡</span>
              <b>
                Uma festa especial
                <br />
                merece ser leve.
              </b>
            </div>
            <div className="about-illustration">🎀</div>
            <span className="about-scribble">com amor, Prilulu!</span>
          </div>
          <div className="about-copy">
            <div className="eyebrow">
              UM POUQUINHO DA GENTE <span>✳</span>
            </div>
            <h2>
              Mais tempo
              <br />
              para o que <em>importa.</em>
            </h2>
            <p>
              A Prilulu nasceu para ajudar famílias a celebrarem os momentos que
              ficam. A gente cuida dos detalhes do kit para você curtir a
              preparação, a festa e as boas lembranças — sem precisar comprar um
              monte de coisas que usará só uma vez.
            </p>
            <div className="about-sign">
              Com carinho,{" "}
              <b>
                Prilulu Festas <span>♡</span>
              </b>
            </div>
          </div>
        </section>
        <section className="faq section-wrap" id="duvidas">
          <div>
            <div className="eyebrow">
              AINDA TEM DÚVIDAS? <span>✳</span>
            </div>
            <h2>
              A gente te
              <br />
              <em>explica tudinho.</em>
            </h2>
            <p>Queremos que você se sinta em cada etapa.</p>
            <a
              className="button button-outline"
              href="https://wa.me/5592993339848?text=Oi%2C%20Prilulu!%20Tenho%20uma%20d%C3%BAvida"
              target="_blank"
            >
              Chamar no WhatsApp <ArrowRight size={16} />
            </a>
          </div>
          <div className="faq-list">
            {[
              {
                q: "Como funciona o pegue e monte?",
                a: "Você reserva seu kit para uma data, combina a retirada e recebe as peças organizadas para montar no seu espaço. A devolução é prevista para o dia seguinte à festa, e a loja confirma ou ajusta a data com você.",
              },
              {
                q: "Como faço para reservar?",
                a: "Escolha o kit, envie a data da festa e aguarde nossa confirmação de disponibilidade. A solicitação fica pendente até a loja confirmar a data e combinar a devolução.",
              },
              {
                q: "Posso adicionar balões ou tapetes?",
                a: "Sim! Você pode escolher adicionais no momento do pedido. A disponibilidade de cada item também é conferida durante o período em que o material ficará com você.",
              },
              {
                q: "Como funciona o pagamento?",
                a: "A reserva fica sujeita à confirmação da loja. Com a disponibilidade confirmada, você paga metade para reservar e o restante na retirada do kit.",
              },
            ].map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <Plus size={17} />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-brand">
          <Image
            src="/images/prilulu.png"
            width={146}
            height={84}
            alt="Prilulu Festas"
          />
          <p>
            Sua festa linda, leve
            <br />e do seu jeitinho.
          </p>
        </div>
        <div>
          <b>Explore</b>
          <a href="#catalogo">Nossos kits</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#duvidas">Perguntas frequentes</a>
        </div>
        <div>
          <b>Fale com a gente</b>
          <a href="https://wa.me/5592993339848">WhatsApp</a>
          <a href="https://instagram.com/prilulu_festas">
            Instagram <FaInstagram size={14} />
          </a>
          <a href="mailto:oi@prilulu.com.br">oi@prilulu.com.br</a>
        </div>
        <div className="footer-bottom">
          <span>
            © 2026 Prilulu Festas. Feito com carinho em cada detalhe. ♡
          </span>
          <a href="/admin">Área da loja</a>
          <span>Privacidade&nbsp;&nbsp; · &nbsp;&nbsp;Termos</span>
        </div>
      </footer>
      {cart && (
        <div className="drawer-backdrop" onClick={() => setCart(null)}>
          <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <div className="eyebrow">
                  QUASE LÁ! <span>✳</span>
                </div>
                <h2>
                  Seu pedido <em>Prilulu.</em>
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setCart(null)}
                aria-label="Fechar"
              >
                <X />
              </button>
            </div>
            <div className="drawer-kit" style={{ background: cart.kit.color }}>
              {cart.kit.image ? (
                <Image
                  src={cart.kit.image}
                  alt=""
                  width={48}
                  height={48}
                  className="drawer-photo"
                />
              ) : (
                <span>{cart.kit.art}</span>
              )}
              <div>
                <small>{cart.kit.theme}</small>
                <b>{cart.kit.name}</b>
              </div>
              <strong>{money(cart.kit.price)}</strong>
            </div>
            {(cart.kit.customizable || cart.kit.allowCustomerEdits) && (
              <section className="custom-kit-builder">
                <div className="extras-heading">
                  <b>Personalize este kit pronto</b>
                  <small>
                    Mantenha as peças incluídas, retire unidades ou adicione
                    peças. As estruturas necessárias são contabilizadas
                    automaticamente no estoque.
                  </small>
                </div>
                {cart.kit.allowCustomerEdits &&
                  (cart.kit.includedPieces ?? []).length > 0 && (
                    <div className="custom-kit-included">
                      <b>Peças que já vêm neste kit</b>
                      <small>
                        Retirar uma peça devolve essa unidade ao estoque da
                        data. Estruturas internas não podem ser removidas.
                      </small>
                      {includedPieceFamilies.map((family) => (
                        <section className="variant-family" key={family}>
                          <b className="variant-family-title">{family}</b>
                          {cart.kit
                            .includedPieces!.filter(
                              (piece) =>
                                (piece.family || "Outras peças") === family,
                            )
                            .map((piece) => {
                              const included = piece.quantity ?? 1;
                              const removed =
                                cart.removedInventory.find(
                                  (entry) => entry.itemId === piece.id,
                                )?.quantity ?? 0;
                              const retained = included - removed;
                              return (
                                <article
                                  className="custom-kit-included-row"
                                  key={piece.id}
                                >
                                  <span>
                                    {piece.image ? (
                                      <Image
                                        src={piece.image}
                                        alt=""
                                        width={44}
                                        height={44}
                                        className="extra-photo"
                                      />
                                    ) : (
                                      <span className="custom-piece-placeholder small">
                                        ✳
                                      </span>
                                    )}
                                    <span>
                                      <b>
                                        {[piece.theme, piece.color, piece.size]
                                          .filter(Boolean)
                                          .join(" · ") || piece.name}
                                      </b>
                                      <small>
                                        {retained} de {included} unidade(s)
                                        incluída(s)
                                      </small>
                                    </span>
                                  </span>
                                  <span className="custom-piece-quantity">
                                    <button
                                      type="button"
                                      aria-label={`Retirar uma unidade de ${piece.name}`}
                                      disabled={removed >= included}
                                      onClick={() => {
                                        const next =
                                          removed < included
                                            ? removed
                                              ? cart.removedInventory.map(
                                                  (entry) =>
                                                    entry.itemId === piece.id
                                                      ? {
                                                          ...entry,
                                                          quantity:
                                                            entry.quantity + 1,
                                                        }
                                                      : entry,
                                                )
                                              : [
                                                  ...cart.removedInventory,
                                                  {
                                                    itemId: piece.id,
                                                    quantity: 1,
                                                  },
                                                ]
                                            : cart.removedInventory;
                                        setCart({
                                          ...cart,
                                          removedInventory: next,
                                        });
                                        setAppliedCoupon(null);
                                        setCouponMessage("");
                                      }}
                                    >
                                      −
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Manter uma unidade de ${piece.name}`}
                                      disabled={!removed}
                                      onClick={() => {
                                        const next = cart.removedInventory
                                          .map((entry) =>
                                            entry.itemId === piece.id
                                              ? {
                                                  ...entry,
                                                  quantity: entry.quantity - 1,
                                                }
                                              : entry,
                                          )
                                          .filter(
                                            (entry) => entry.quantity > 0,
                                          );
                                        setCart({
                                          ...cart,
                                          removedInventory: next,
                                        });
                                        setAppliedCoupon(null);
                                        setCouponMessage("");
                                      }}
                                    >
                                      +
                                    </button>
                                  </span>
                                </article>
                              );
                            })}
                        </section>
                      ))}
                    </div>
                  )}{" "}
                <div className="custom-kit-included custom-piece-add-heading">
                  <b>Peças para adicionar ao kit</b>
                  <small>
                    Escolha uma peça abaixo e use o botão + para acrescentar
                    unidades ao seu pedido. O que já está incluído aparece na
                    seção anterior.
                  </small>
                </div>
                <div className="custom-piece-category-list">
                  {customPieceGroups.length === 0 ? (
                    <small>
                      Não há peças cadastradas para personalizar este kit.
                    </small>
                  ) : (
                    customPieceGroups.map((group) => (
                      <PieceCategorySelector
                        key={group.family}
                        family={group.family}
                        pieces={group.pieces}
                        added={cart.customInventory}
                        included={cart.kit.includedPieces ?? []}
                        removed={cart.removedInventory}
                        onQuantity={(piece, quantity) => {
                          const exists = cart.customInventory.some(
                            (entry) => entry.itemId === piece.id,
                          );
                          const next =
                            quantity === 0
                              ? cart.customInventory.filter(
                                  (entry) => entry.itemId !== piece.id,
                                )
                              : exists
                                ? cart.customInventory.map((entry) =>
                                    entry.itemId === piece.id
                                      ? { ...entry, quantity }
                                      : entry,
                                  )
                                : [
                                    ...cart.customInventory,
                                    { itemId: piece.id, quantity },
                                  ];
                          setCustomInventory(next);
                          setCart({ ...cart, customInventory: next });
                          setAppliedCoupon(null);
                          setCouponMessage("");
                        }}
                      />
                    ))
                  )}
                </div>
                {(cart.customInventory.length > 0 ||
                  cart.removedInventory.length > 0) && (
                  <div className="custom-kit-selection-summary">
                    <b>
                      {cart.customInventory.reduce(
                        (sum, part) => sum + part.quantity,
                        0,
                      )}{" "}
                      peça(s) adicionada(s) ·{" "}
                      {cart.removedInventory.reduce(
                        (sum, part) => sum + part.quantity,
                        0,
                      )}{" "}
                      retirada(s)
                    </b>
                    <span>
                      {[
                        ...cart.customInventory.map((part) => {
                          const piece = cart.kit.pieces?.find(
                            (item) => item.id === part.itemId,
                          );
                          return piece
                            ? `+ ${piece.name} × ${part.quantity}`
                            : "";
                        }),
                        ...cart.removedInventory.map((part) => {
                          const piece = cart.kit.includedPieces?.find(
                            (item) => item.id === part.itemId,
                          );
                          return piece
                            ? `− ${piece.name} × ${part.quantity}`
                            : "";
                        }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                )}
              </section>
            )}
            <label className="form-label">
              Seu nome
              <input
                value={customer.name}
                onChange={(e) =>
                  setCustomer({ ...customer, name: e.target.value })
                }
                autoComplete="name"
              />
            </label>
            <label className="form-label">
              E-mail
              <input
                type="email"
                value={customer.email}
                onChange={(e) =>
                  setCustomer({ ...customer, email: e.target.value })
                }
                autoComplete="email"
              />
            </label>
            <label className="form-label">
              WhatsApp
              <input
                type="tel"
                value={customer.phone}
                onChange={(e) =>
                  setCustomer({ ...customer, phone: e.target.value })
                }
                autoComplete="tel"
              />
            </label>
            <label className="form-label">
              Data da festa (devolução prevista no dia seguinte)
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <div className="extras-heading">
              <b>Adicionais para acrescentar ao pedido</b>
              <small>
                Marque os cards dos itens que deseja adicionar. Os itens
                selecionados ficam destacados com uma borda e um ✓. Sujeitos à
                disponibilidade durante todo o período do aluguel.
              </small>
            </div>

            <div className="extras-list">
              {[
                ...new Set(
                  extras.map((item) => item.family || "Outros adicionais"),
                ),
              ]
                .sort((a, b) => a.localeCompare(b, "pt-BR"))
                .map((family) => {
                  const familyItems = extras.filter(
                    (item) => (item.family || "Outros adicionais") === family,
                  );
                  const productMap = new Map<
                    string,
                    {
                      key: string;
                      name: string;
                      theme?: string;
                      size?: string;
                      variants: StoreExtraDisplay[];
                    }
                  >();
                  familyItems.forEach((item) => {
                    const key = `${item.name}|${item.theme || ""}|${item.size || ""}`;
                    const existing = productMap.get(key);
                    if (existing) {
                      existing.variants.push(item);
                    } else {
                      productMap.set(key, {
                        key,
                        name: item.name,
                        theme: item.theme,
                        size: item.size,
                        variants: [item],
                      });
                    }
                  });
                  const products = [...productMap.values()];

                  return (
                    <section className="extra-category" key={family}>
                      <h3 className="extra-category-title">{family}</h3>
                      <p className="inventory-form-guidance">
                        Escolha as cores desejadas. Cada cor pode ter sua
                        própria foto e disponibilidade.
                      </p>

                      <div
                        className="extra-category-items"
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(250px, 1fr))",
                          gap: 16,
                        }}
                      >
                        {products.map((product) => (
                          <article
                            key={product.key}
                            className="extra-product-card"
                            style={{
                              border: "1px solid #e8e2ec",
                              borderRadius: 16,
                              padding: 14,
                              background: "#fff",
                            }}
                          >
                            <div style={{ marginBottom: 12 }}>
                              <b style={{ display: "block", fontSize: 16 }}>
                                {product.name}
                              </b>
                              {(product.theme || product.size) && (
                                <small style={{ color: "#716779" }}>
                                  {[product.theme, product.size]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              )}
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fill, minmax(100px, 1fr))",
                                gap: 10,
                              }}
                            >
                              {product.variants.map((item) => {
                                const selection = selected.find(
                                  (entry) => entry.id === item.id,
                                );
                                const colorHex: Record<string, string> = {
                                  branco: "#ffffff",
                                  preta: "#222222",
                                  preto: "#222222",
                                  vermelho: "#e53935",
                                  azul: "#2878d0",
                                  "azul-claro": "#8ecae6",
                                  rosa: "#f3a6c8",
                                  "rosa-claro": "#f8d7e8",
                                  amarelo: "#f5d547",
                                  dourado: "#c9a227",
                                  prata: "#c0c0c0",
                                  verde: "#399764",
                                  lilás: "#b8a1e3",
                                  lilas: "#b8a1e3",
                                  roxo: "#8654a8",
                                  laranja: "#f28c28",
                                  nude: "#d8b49c",
                                  transparente: "#f5f5f5",
                                };
                                const colorKey = String(item.color || "")
                                  .trim()
                                  .toLocaleLowerCase("pt-BR")
                                  .replace(/\s+/g, "-");
                                const swatch = colorHex[colorKey] || "#e8e2ec";
                                return (
                                  <label
                                    key={item.id}
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 7,
                                      padding: 8,
                                      border: selection
                                        ? "2px solid #8b5cf6"
                                        : "1px solid #e8e2ec",
                                      borderRadius: 12,
                                      cursor: "pointer",
                                      background: selection
                                        ? "#faf5ff"
                                        : "#fff",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selection)}
                                      style={{
                                        position: "absolute",
                                        opacity: 0,
                                        pointerEvents: "none",
                                      }}
                                      onChange={(event) => {
                                        const next = event.target.checked
                                          ? [
                                              ...selected,
                                              { id: item.id, options: {} },
                                            ]
                                          : selected.filter(
                                              (entry) => entry.id !== item.id,
                                            );
                                        setSelected(next);
                                        setCart({ ...cart, extras: next });
                                        setAppliedCoupon(null);
                                        setCouponMessage("");
                                      }}
                                    />
                                    <div
                                      style={{
                                        position: "relative",
                                        aspectRatio: "1 / 1",
                                        overflow: "hidden",
                                        borderRadius: 8,
                                        background: "#f8f5fa",
                                      }}
                                    >
                                      {item.image ? (
                                        <Image
                                          src={item.image}
                                          alt={`${item.name}${item.color ? ` - ${item.color}` : ""}`}
                                          fill
                                          sizes="(max-width: 600px) 45vw, 160px"
                                          style={{ objectFit: "cover" }}
                                        />
                                      ) : (
                                        <div
                                          style={{
                                            height: "100%",
                                            display: "grid",
                                            placeItems: "center",
                                            color: "#716779",
                                            fontSize: 12,
                                          }}
                                        >
                                          Adicione uma foto
                                        </div>
                                      )}
                                      {selection && (
                                        <span
                                          style={{
                                            position: "absolute",
                                            top: 6,
                                            right: 6,
                                            width: 22,
                                            height: 22,
                                            display: "grid",
                                            placeItems: "center",
                                            borderRadius: "50%",
                                            background: "#8b5cf6",
                                            color: "white",
                                            fontSize: 13,
                                          }}
                                        >
                                          ✓
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontSize: 12,
                                        fontWeight: 600,
                                      }}
                                    >
                                      <span
                                        aria-hidden="true"
                                        style={{
                                          width: 13,
                                          height: 13,
                                          flexShrink: 0,
                                          borderRadius: "50%",
                                          border: "1px solid #d1c8d8",
                                          background: swatch,
                                        }}
                                      />
                                      {item.color || "Padrão"}
                                    </span>
                                    <b style={{ fontSize: 13 }}>
                                      {money(item.price)}
                                    </b>
                                    <span
                                      style={{
                                        display: "block",
                                        marginTop: 4,
                                        textAlign: "center",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: selection
                                          ? "#6d28d9"
                                          : "#716779",
                                      }}
                                    >
                                      {selection
                                        ? "✓ Adicionado · toque para remover"
                                        : "+ Toque para adicionar"}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
            </div>

            <div className="coupon-box">
              <input
                placeholder="Cupom de desconto"
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value);
                  setAppliedCoupon(null);
                  setCouponMessage("");
                }}
              />
              <button onClick={() => void applyCoupon()}>Aplicar</button>
            </div>
            {couponMessage && (
              <div className="coupon-success">{couponMessage}</div>
            )}
            <div className="drawer-total">
              <span>Valor total</span>
              <b>{money(promoTotal)}</b>
              <small>
                Pedido mínimo: R$ 80,00. 50% na reserva: {money(promoTotal / 2)}{" "}
                <span>·</span> restante na retirada
              </small>
            </div>
            <p className="whatsapp-instruction">
              <b>Importante: falta uma etapa.</b> Depois de enviar a
              solicitação, o WhatsApp abrirá com a mensagem do pedido. Toque em{" "}
              <b>Enviar</b> por lá para a loja receber seu pedido e iniciar o
              atendimento.
            </p>
            {notice && <p className="notice">{notice}</p>}
            {whatsappOrderLink && (
              <a
                className="text-link whatsapp-order-link"
                href={whatsappOrderLink}
                target="_blank"
                rel="noreferrer"
              >
                Abrir WhatsApp e enviar o resumo do pedido{" "}
                <ArrowRight size={15} />
              </a>
            )}
            <button
              className="button button-pink button-full"
              onClick={finalize}
            >
              Enviar solicitação e continuar no WhatsApp{" "}
              <ArrowRight size={17} />
            </button>
            <small className="drawer-disclaimer">
              <ShieldCheck size={13} /> A reserva só é confirmada após
              conferência da data e do estoque.
            </small>
          </aside>
        </div>
      )}
    </div>
  );
}
