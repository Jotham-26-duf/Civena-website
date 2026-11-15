import Studio from "@/components/Studio";
import { getCatalogue } from "@/lib/data/catalogue";

export default async function FavoritesPage() {
  const catalogue = await getCatalogue();
  return <Studio initial="favorites" {...catalogue} />;
}
