import Studio from "@/components/Studio";
import { getCatalogue } from "@/lib/data/catalogue";
export default async function DetailsPage({ params }: { params: Promise<{ slug: string }> }) { const [{ slug }, catalogue] = await Promise.all([params, getCatalogue()]); return <Studio detail={slug} {...catalogue} />; }
