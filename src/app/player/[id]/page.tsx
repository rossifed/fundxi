import { players } from "@/data/mock";
import PlayerClient from "./PlayerClient";

export function generateStaticParams() {
  return players.map((p) => ({ id: p.id }));
}

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerClient id={id} />;
}
