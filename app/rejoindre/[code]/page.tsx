import EcranJoueur from "@/components/EcranJoueur";

export const metadata = { title: "Faillite ! · Rejoindre" };

export default async function PageRejoindre({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <EcranJoueur code={code.toUpperCase()} />;
}
