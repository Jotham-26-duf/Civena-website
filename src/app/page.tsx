import Studio from "@/components/Studio";
import { getCatalogue } from "@/lib/data/catalogue";
export default async function Home() { const catalogue = await getCatalogue(); return <Studio {...catalogue} />; }
