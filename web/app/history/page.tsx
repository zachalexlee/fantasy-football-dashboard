import HistoryView from "@/components/HistoryView";
import { getBundle } from "@/lib/data";

export default async function History() {
  const bundle = await getBundle();
  return <HistoryView seasons={bundle.seasons} />;
}
