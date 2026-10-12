import Game from "@/components/Game";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Game roomId={id} />;
}
