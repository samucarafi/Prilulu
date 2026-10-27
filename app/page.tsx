import Storefront from "@/components/Storefront";
import { getStorefrontData } from "@/lib/storefront-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getStorefrontData();
  return <Storefront {...data} />;
}
