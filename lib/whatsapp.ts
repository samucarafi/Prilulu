type UnavailableBookingNotice = {
  customerName: string;
  phone: string;
  eventDate: Date | string;
  kitName: string;
  itemName: string;
  bookingId: string;
};

function internationalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12 && digits.length <= 15) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return "";
}

export function unavailableWhatsAppUrl(booking: UnavailableBookingNotice) {
  const phone = internationalPhone(booking.phone);
  if (!phone) return "";
  const eventDate = booking.eventDate instanceof Date ? booking.eventDate : new Date(booking.eventDate);
  const formattedDate = eventDate.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const message = [
    `Olá, ${booking.customerName}! Aqui é da Prilulu Festas.`,
    `Sobre o pedido ${booking.bookingId}: infelizmente o item “${booking.itemName}” do kit “${booking.kitName}” não está mais disponível para ${formattedDate}.`,
    "Fale conosco para escolher outra opção ou cancelar a solicitação. Desculpe pelo transtorno!",
  ].join("\n\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
