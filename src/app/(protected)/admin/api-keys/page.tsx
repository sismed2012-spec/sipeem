import { getApiKeys } from "@/actions/api-keys";
import ApiKeysManager from "@/components/settings/ApiKeysManager";

export default async function ApiKeysPage() {
  const keys = await getApiKeys();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">API Keys</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestiona las claves de acceso para la API pública de SIPEEM.
        </p>
      </div>
      <ApiKeysManager initialKeys={keys} />
    </div>
  );
}
