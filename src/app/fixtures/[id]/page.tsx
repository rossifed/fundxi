import { fixtures } from "@/data/mock";
import FixtureClient from "./FixtureClient";

export function generateStaticParams() {
  return fixtures.map((f) => ({ id: f.id }));
}

export default async function FixtureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FixtureClient id={id} />;
}
