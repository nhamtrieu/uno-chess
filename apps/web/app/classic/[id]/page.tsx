import ClassicGame from "@/components/ClassicGame";

export default async function ClassicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClassicGame roomId={id} />;
}
