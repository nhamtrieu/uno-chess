import Replay from "@/components/Replay";

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Replay gameId={id} />;
}
