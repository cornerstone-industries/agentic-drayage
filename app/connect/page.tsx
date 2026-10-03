import { redirect } from "next/navigation";
import { TopBar } from "@/components/console/top-bar";
import { ConnectAgent } from "@/components/connect/connect-agent";
import { getSessionImporter } from "@/lib/auth";
import { appUrl, callMode } from "@/lib/env";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

function safeAppUrl(): string {
  try {
    return appUrl();
  } catch {
    return "";
  }
}

export default async function ConnectPage() {
  const session = await getSessionImporter();
  if (!session) redirect("/login?next=/connect");
  const imp = session.importer;
  const endpoint = `${safeAppUrl()}/api/mcp`;
  return (
    <>
      <TopBar importerName={imp.name} active="/connect" />
      <main className="px-4 pb-20 pt-10 sm:px-6" data-testid="connect-page">
        <ConnectAgent
          endpoint={endpoint}
          apiKey={imp.mcp_api_key ?? ""}
          limit={imp.auto_book_enabled ? formatUsd(imp.auto_book_limit_cents) : null}
          mode={callMode()}
        />
      </main>
    </>
  );
}
