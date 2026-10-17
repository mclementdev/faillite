import EcranHote from "@/components/EcranHote";

export const metadata = { title: "Faillite ! · Grand écran" };

export default async function PageSalle({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <EcranHote code={code.toUpperCase()} />;
}
