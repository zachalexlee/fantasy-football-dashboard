import HistoryView from "@/components/HistoryView";
import { getBundle } from "@/lib/data";

export const metadata = { title: "History" };

export default async function History() {
  const bundle = await getBundle();
  return <HistoryView seasons={bundle.seasons} />;
}
