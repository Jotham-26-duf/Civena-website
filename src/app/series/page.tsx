import Studio from "@/components/Studio";
import { getCatalogue } from "@/lib/data/catalogue";
export default async function SeriesPage() { const catalogue = await getCatalogue(); return <Studio initial="series" {...catalogue} />; }
