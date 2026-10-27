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
import type { StoreExtra, StoreKit } from "@/lib/storefront-data";

type Kit = StoreKit;
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Storefront({
  kits,
  extras,
  connected,
  promotions = [],
}: {
  kits: StoreKit[];
  extras: StoreExtra[];
  connected: boolean;
  promotions?: Array<{
    title: string;
    subtitle: string;
    image: string;
    href: string;
  }>;
}) {
  const [cart, setCart] = useState<{ kit: Kit; extras: string[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
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
  const total = useMemo(
    () =>
      cart
        ? cart.kit.price +
          cart.extras.reduce(
            (sum, id) => sum + (extras.find((e) => e.id === id)?.price || 0),
            0,
          )
        : 0,
    [cart],
  );
  const promoTotal = appliedCoupon ? appliedCoupon.totalCents / 100 : total;
  const availabilityKit = kits.find((kit) => kit.id === availabilityKitId);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const addKit = (kit: Kit) => {
    setCart({ kit, extras: [] });
    setSelected([]);
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
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId: cart?.kit.id, date }),
      });
      if (response.ok) {
        const result = await response.json();
        if (!result.available) {
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
            extras: selected,
            coupon: appliedCoupon?.code,
          }),
        });
        const bookingResult = await booking.json();
        setNotice(
          booking.ok
            ? `${bookingResult.message} Pedido ${bookingResult.bookingId}. Total ${money(bookingResult.totalCents / 100)}; sinal de ${money(bookingResult.depositCents / 100)}.`
            : bookingResult.error,
        );
      } else {
        const result = await response.json().catch(() => null);
        setNotice(
          result?.message ??
            result?.error ??
            "Não foi possível confirmar essa data agora.",
        );
      }
    } catch {
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
                      <small>por evento</small>
                    </div>
                  </div>
                  <div className="product-foot">
                    <span className="stock">
                      <i /> Consulte disponibilidade
                    </span>
                    <button className="text-link" onClick={() => addKit(kit)}>
                      Ver kit <ArrowRight size={15} />
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
                        setCart({ kit: availabilityKit, extras: [] });
                        setSelected([]);
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
              <b>Deixe seu kit ainda mais especial</b>
              <small>
                Adicionais sujeitos à disponibilidade durante todo o período do
                aluguel
              </small>
            </div>
            <div className="extras-list">
              {extras.map((item) => (
                <label key={item.id} className="extra-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, item.id]
                        : selected.filter((x) => x !== item.id);
                      setSelected(next);
                      setCart({ ...cart, extras: next });
                      setAppliedCoupon(null);
                      setCouponMessage("");
                    }}
                  />
                  {item.image && (
                    <Image
                      src={item.image}
                      alt=""
                      width={38}
                      height={38}
                      className="extra-photo"
                    />
                  )}
                  <span>{item.name}</span>
                  <b>+ {money(item.price)}</b>
                </label>
              ))}
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
                50% na reserva: {money(promoTotal / 2)} <span>·</span> restante
                na retirada
              </small>
            </div>
            {notice && <p className="notice">{notice}</p>}
            <button
              className="button button-pink button-full"
              onClick={finalize}
            >
              Enviar solicitação de reserva <ArrowRight size={17} />
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
