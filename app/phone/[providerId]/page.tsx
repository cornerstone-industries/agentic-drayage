import { notFound } from "next/navigation";
import { UUID, getProviderName } from "@/lib/phone";
import { PhoneView } from "@/components/phone/phone-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carrier phone | PortCall" };

// Public carrier page for CALL_MODE=web: keep it open on a phone and it rings when PortCall calls.
export default async function PhonePage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  if (!UUID.test(providerId)) notFound();
  const providerName = await getProviderName(providerId);
  if (!providerName) notFound();
  return (
    <PhoneView
      providerId={providerId}
      providerName={providerName}
      publicKey={process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY?.trim() ?? ""}
      assistantId={process.env.VAPI_ASSISTANT_ID?.trim() ?? ""}
    />
  );
}
