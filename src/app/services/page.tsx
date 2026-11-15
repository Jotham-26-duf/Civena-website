import Studio from "@/components/Studio";
import { getCatalogue } from "@/lib/data/catalogue";
export default async function ServicesPage() { const catalogue = await getCatalogue(); return <Studio initial="services" {...catalogue} />; }
